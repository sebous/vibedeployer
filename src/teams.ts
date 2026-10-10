import { Env, randomId, now, hashPassword, randomPassword } from "./lib";
import { ApiError } from "./docs";

export interface Team {
  id: string;
  name: string;
  sign_in_method: string;
  created_at: number;
}

export interface TeamSummary extends Team {
  domains: string[];
  members: number;
  docs: number;
}

export const SIGN_IN_METHODS = ["google"] as const;

// "strv.com, Example.org " → ["strv.com", "example.org"]
export function parseDomains(input: string): string[] {
  const domains = input
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  for (const d of domains) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new ApiError(400, "invalid_domain", `Not a domain: ${d}`);
  }
  return [...new Set(domains)];
}

export async function getTeam(env: Env, id: string): Promise<Team | null> {
  return env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first<Team>();
}

export async function teamForDomain(env: Env, domain: string): Promise<Team | null> {
  return env.DB.prepare(
    "SELECT t.* FROM teams t JOIN team_domains d ON d.team_id = t.id WHERE d.domain = ?",
  )
    .bind(domain.toLowerCase())
    .first<Team>();
}

export async function listTeams(env: Env): Promise<TeamSummary[]> {
  const teams = (await env.DB.prepare("SELECT * FROM teams ORDER BY name").all<Team>()).results ?? [];
  return Promise.all(teams.map((t) => summarize(env, t)));
}

export async function getTeamSummary(env: Env, id: string): Promise<TeamSummary | null> {
  const team = await getTeam(env, id);
  return team ? summarize(env, team) : null;
}

async function summarize(env: Env, team: Team): Promise<TeamSummary> {
  const [domains, members, docs] = await Promise.all([
    env.DB.prepare("SELECT domain FROM team_domains WHERE team_id = ? ORDER BY domain").bind(team.id).all<{ domain: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE team_id = ?").bind(team.id).first<{ n: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE team_id = ?").bind(team.id).first<{ n: number }>(),
  ]);
  return {
    ...team,
    domains: (domains.results ?? []).map((r) => r.domain),
    members: members?.n ?? 0,
    docs: docs?.n ?? 0,
  };
}

export async function listTeamMembers(env: Env, teamId: string): Promise<{ email: string; created_at: number }[]> {
  const res = await env.DB.prepare("SELECT email, created_at FROM users WHERE team_id = ? ORDER BY email")
    .bind(teamId)
    .all<{ email: string; created_at: number }>();
  return res.results ?? [];
}

export async function createTeam(env: Env, input: { name: string; signInMethod: string; domains: string[] }): Promise<Team> {
  const id = randomId();
  await env.DB.prepare("INSERT INTO teams (id, name, sign_in_method, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, validName(input.name), validMethod(input.signInMethod), now())
    .run();
  await setTeamDomains(env, id, input.domains);
  return (await getTeam(env, id))!;
}

export async function updateTeam(env: Env, id: string, input: { name: string; signInMethod: string; domains: string[] }): Promise<void> {
  await env.DB.prepare("UPDATE teams SET name = ?, sign_in_method = ? WHERE id = ?")
    .bind(validName(input.name), validMethod(input.signInMethod), id)
    .run();
  await setTeamDomains(env, id, input.domains);
}

// Replaces the team's domains, then re-syncs membership: Google users whose
// verified Workspace domain is listed join; members whose domain was removed leave.
async function setTeamDomains(env: Env, teamId: string, domains: string[]): Promise<void> {
  if (!domains.length) throw new ApiError(400, "no_domains", "A team needs at least one domain.");
  for (const d of domains) {
    const owner = await env.DB.prepare("SELECT team_id FROM team_domains WHERE domain = ?").bind(d).first<{ team_id: string }>();
    if (owner && owner.team_id !== teamId) throw new ApiError(409, "domain_taken", `${d} already belongs to another team.`);
  }
  const placeholders = domains.map(() => "?").join(",");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM team_domains WHERE team_id = ?").bind(teamId),
    ...domains.map((d) => env.DB.prepare("INSERT INTO team_domains (domain, team_id) VALUES (?, ?)").bind(d, teamId)),
    env.DB.prepare(`UPDATE users SET team_id = NULL WHERE team_id = ? AND (google_hd IS NULL OR google_hd NOT IN (${placeholders}))`).bind(teamId, ...domains),
    env.DB.prepare(`UPDATE users SET team_id = ? WHERE google_hd IN (${placeholders})`).bind(teamId, ...domains),
  ]);
}

function validName(name: string): string {
  const n = name.trim().slice(0, 100);
  if (!n) throw new ApiError(400, "invalid_name", "Team name is required.");
  return n;
}

function validMethod(method: string): string {
  if (!(SIGN_IN_METHODS as readonly string[]).includes(method)) throw new ApiError(400, "invalid_method", "Unknown sign-in method.");
  return method;
}

export interface LegacyMigrationRow {
  slug: string;
  title: string;
  owner_email: string;
  visibility: "team" | "password";
  team_name: string | null;
  password: string;
}

// One-time move of docs that were public before access modes existed.
// The owner's email domain picks the team (if any); every doc gets a new
// generated password for outsiders. Passwords are returned once and not stored
// in plain text, so the admin must copy them from the result page.
export async function migrateLegacyDocs(env: Env): Promise<LegacyMigrationRow[]> {
  const res = await env.DB.prepare(
    `SELECT d.id, d.slug, d.custom_slug, d.title, u.email AS owner_email
     FROM docs d JOIN users u ON u.id = d.owner_id
     WHERE d.legacy = 1 AND d.visibility = 'public' ORDER BY u.email, d.created_at`,
  ).all<{ id: string; slug: string; custom_slug: string | null; title: string; owner_email: string }>();

  const rows: LegacyMigrationRow[] = [];
  for (const d of res.results ?? []) {
    const team = await teamForDomain(env, d.owner_email.split("@")[1] ?? "");
    const password = randomPassword();
    const visibility = team ? "team" : "password";
    await env.DB.prepare("UPDATE docs SET visibility = ?, team_id = ?, password_hash = ?, legacy = 0, updated_at = ? WHERE id = ?")
      .bind(visibility, team?.id ?? null, await hashPassword(password), now(), d.id)
      .run();
    rows.push({
      slug: d.custom_slug ?? d.slug,
      title: d.title,
      owner_email: d.owner_email,
      visibility,
      team_name: team?.name ?? null,
      password,
    });
  }
  return rows;
}

export async function countLegacyDocs(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE legacy = 1 AND visibility = 'public'").first<{ n: number }>();
  return r?.n ?? 0;
}
