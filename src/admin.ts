import { Hono } from "hono";
import { AppVars } from "./lib";
import { requireAdmin } from "./auth";
import { ApiError } from "./docs";
import {
  listTeams,
  getTeamSummary,
  listTeamMembers,
  createTeam,
  updateTeam,
  parseDomains,
  migrateLegacyDocs,
  countLegacyDocs,
} from "./teams";
import { layout, adminPage, adminTeamPage, adminMigrationResult } from "./ui";

// Platform admin: manage teams (companies) and their sign-in setup.
export const admin = new Hono<AppVars>();

admin.use("/admin", requireAdmin);
admin.use("/admin/*", requireAdmin);

admin.get("/admin", async (c) => {
  const [teams, legacyCount] = await Promise.all([listTeams(c.env), countLegacyDocs(c.env)]);
  return c.html(
    layout("Admin", adminPage({ teams, legacyCount, flashMsg: c.req.query("msg"), flashKind: kind(c) }), c.get("user")),
  );
});

admin.post("/admin/teams", async (c) => {
  const body = await c.req.parseBody();
  try {
    const team = await createTeam(c.env, {
      name: String(body.name ?? ""),
      signInMethod: String(body.sign_in_method ?? "google"),
      domains: parseDomains(String(body.domains ?? "")),
    });
    return c.redirect(`/admin/teams/${team.id}?msg=` + enc("Team created."));
  } catch (e) {
    return c.redirect("/admin?msg=" + enc(errMsg(e)) + "&kind=err");
  }
});

admin.get("/admin/teams/:id", async (c) => {
  const team = await getTeamSummary(c.env, c.req.param("id"));
  if (!team) return c.notFound();
  const members = await listTeamMembers(c.env, team.id);
  return c.html(
    layout(team.name, adminTeamPage({ team, members, flashMsg: c.req.query("msg"), flashKind: kind(c) }), c.get("user")),
  );
});

admin.post("/admin/teams/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  try {
    await updateTeam(c.env, id, {
      name: String(body.name ?? ""),
      signInMethod: String(body.sign_in_method ?? "google"),
      domains: parseDomains(String(body.domains ?? "")),
    });
    return c.redirect(`/admin/teams/${id}?msg=` + enc("Team updated."));
  } catch (e) {
    return c.redirect(`/admin/teams/${id}?msg=` + enc(errMsg(e)) + "&kind=err");
  }
});

// Rendered directly (no redirect) because the generated passwords are shown only once.
admin.post("/admin/migrate-legacy", async (c) => {
  const rows = await migrateLegacyDocs(c.env);
  return c.html(layout("Legacy migration", adminMigrationResult(new URL(c.req.url).origin, rows), c.get("user")));
});

const enc = encodeURIComponent;
const kind = (c: any): "ok" | "err" => (c.req.query("kind") === "err" ? "err" : "ok");
function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong.";
}
