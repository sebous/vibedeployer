import { Env, User, randomId, randomSlug, now, sha256Hex, isValidCustomSlug, hashPassword, randomPassword } from "./lib";

export interface Doc {
  id: string;
  owner_id: string;
  slug: string;
  custom_slug: string | null;
  title: string;
  latest_version: number;
  visibility: Visibility;
  password_hash: string | null;
  created_at: number;
  updated_at: number;
  team_id: string | null;
  legacy: number;
}

// team:     members of doc.team_id get in after Google sign-in; others need the password.
// password: everyone needs the password.
// public:   anyone with the link.
export type Visibility = "team" | "password" | "public";
export const VISIBILITIES: Visibility[] = ["team", "password", "public"];

export const isProtected = (doc: Doc): boolean => doc.visibility !== "public";

export interface Version {
  id: string;
  doc_id: string;
  version: number;
  r2_key: string;
  size: number;
  content_hash: string;
  comment: string | null;
  created_at: number;
}

// Resolve a doc by either its random slug or its custom slug.
export async function resolveDoc(env: Env, slug: string): Promise<Doc | null> {
  return env.DB.prepare("SELECT * FROM docs WHERE slug = ? OR custom_slug = ?")
    .bind(slug, slug)
    .first<Doc>();
}

export async function getDocById(env: Env, id: string): Promise<Doc | null> {
  return env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(id).first<Doc>();
}

export async function listDocsByOwner(env: Env, ownerId: string): Promise<Doc[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM docs WHERE owner_id = ? ORDER BY updated_at DESC",
  )
    .bind(ownerId)
    .all<Doc>();
  return res.results ?? [];
}

export async function listVersions(env: Env, docId: string): Promise<Version[]> {
  const res = await env.DB.prepare(
    "SELECT * FROM versions WHERE doc_id = ? ORDER BY version DESC",
  )
    .bind(docId)
    .all<Version>();
  return res.results ?? [];
}

export async function getVersion(env: Env, docId: string, version: number): Promise<Version | null> {
  return env.DB.prepare("SELECT * FROM versions WHERE doc_id = ? AND version = ?")
    .bind(docId, version)
    .first<Version>();
}

async function setCustomSlug(env: Env, docId: string, customSlug: string): Promise<void> {
  if (!isValidCustomSlug(customSlug)) {
    throw new ApiError(400, "invalid_custom_slug", "Use 3-64 chars: a-z, 0-9, hyphens.");
  }
  // Must not collide with any existing slug or custom_slug.
  const clash = await env.DB.prepare(
    "SELECT id FROM docs WHERE (slug = ? OR custom_slug = ?) AND id != ?",
  )
    .bind(customSlug, customSlug, docId)
    .first();
  if (clash) throw new ApiError(409, "slug_taken", "That custom slug is already in use.");
  await env.DB.prepare("UPDATE docs SET custom_slug = ?, updated_at = ? WHERE id = ?")
    .bind(customSlug, now(), docId)
    .run();
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per HTML file

export interface CreateDocInput {
  owner: User;
  title?: string;
  html: string;
  customSlug?: string;
  comment?: string;
  password?: string;
  visibility?: string;
}

// Defaults: a password with no explicit mode means "password for everyone"
// (the pre-teams meaning); otherwise team members get in and outsiders need
// a password, or everyone needs one if the owner has no team.
function defaultVisibility(owner: User, password?: string): Visibility {
  if (password) return "password";
  return owner.team_id ? "team" : "password";
}

function parseVisibility(v: string | undefined): Visibility | undefined {
  if (!v) return undefined;
  if (!(VISIBILITIES as string[]).includes(v)) {
    throw new ApiError(400, "invalid_visibility", "Use one of: team, password, public.");
  }
  return v as Visibility;
}

// Checks the owner can use this mode and returns the password to store.
// `generated` is set when we had to create one; it is shown to the owner once.
function resolveAccess(owner: User, visibility: Visibility, password: string | undefined, hasPassword: boolean) {
  if (visibility === "team" && !owner.team_id) {
    throw new ApiError(400, "no_team", "Your account is not in a team. Use 'password' or 'public'.");
  }
  if (visibility === "public" || password || hasPassword) return { password, generated: undefined };
  const generated = randomPassword();
  return { password: generated, generated };
}

export async function createDoc(
  env: Env,
  input: CreateDocInput,
): Promise<{ doc: Doc; version: Version; generatedPassword?: string }> {
  const bytes = new TextEncoder().encode(input.html);
  if (bytes.byteLength > MAX_BYTES) throw new ApiError(413, "too_large", "HTML exceeds 5 MB limit.");

  // Generate a unique random slug.
  let slug = randomSlug();
  for (let i = 0; i < 5; i++) {
    const exists = await env.DB.prepare("SELECT id FROM docs WHERE slug = ?").bind(slug).first();
    if (!exists) break;
    slug = randomSlug();
  }

  const docId = randomId();
  const title = (input.title?.trim() || extractTitle(input.html) || "Untitled").slice(0, 200);
  const ts = now();
  const visibility = parseVisibility(input.visibility) ?? defaultVisibility(input.owner, input.password);
  const { password, generated } = resolveAccess(input.owner, visibility, input.password, false);
  const passwordHash = password && visibility !== "public" ? await hashPassword(password) : null;
  const teamId = visibility === "team" ? input.owner.team_id : null;

  await env.DB.prepare(
    `INSERT INTO docs (id, owner_id, slug, custom_slug, title, latest_version, visibility, password_hash, team_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, ?)`,
  )
    .bind(docId, input.owner.id, slug, title, visibility, passwordHash, teamId, ts, ts)
    .run();

  if (input.customSlug) await setCustomSlug(env, docId, input.customSlug);

  const created = (await getDocById(env, docId))!;
  const version = await addVersion(env, created, { html: input.html, comment: input.comment });
  const doc = (await getDocById(env, docId))!; // refresh: latest_version now set
  return { doc, version, generatedPassword: generated };
}

export interface AddVersionInput {
  html: string;
  comment?: string;
}

export async function addVersion(env: Env, doc: Doc, input: AddVersionInput): Promise<Version> {
  const bytes = new TextEncoder().encode(input.html);
  if (bytes.byteLength > MAX_BYTES) throw new ApiError(413, "too_large", "HTML exceeds 5 MB limit.");

  const version = doc.latest_version + 1;
  const r2Key = `docs/${doc.id}/v${version}.html`;
  const contentHash = await sha256Hex(input.html);

  await env.BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: "text/html; charset=utf-8" } });

  const verId = randomId();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO versions (id, doc_id, version, r2_key, size, content_hash, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(verId, doc.id, version, r2Key, bytes.byteLength, contentHash, input.comment ?? null, ts)
    .run();

  await env.DB.prepare("UPDATE docs SET latest_version = ?, updated_at = ? WHERE id = ?")
    .bind(version, ts, doc.id)
    .run();

  return (await getVersion(env, doc.id, version))!;
}

export async function updateCustomSlug(env: Env, doc: Doc, customSlug: string): Promise<void> {
  await setCustomSlug(env, doc.id, customSlug);
}

// Set, rotate, or remove a doc's password. Removing is only allowed on team
// docs (it makes them team-only); a 'password' doc must switch mode first.
export async function setDocPassword(env: Env, doc: Doc, password: string | null): Promise<void> {
  if (!password && doc.visibility === "password") {
    throw new ApiError(400, "password_required", "This doc needs a password. Change its access mode to remove it.");
  }
  const hash = password ? await hashPassword(password) : null;
  // Setting a password on a public doc protects it for everyone.
  const visibility = hash && doc.visibility === "public" ? "password" : doc.visibility;
  await env.DB.prepare("UPDATE docs SET password_hash = ?, visibility = ?, legacy = 0, updated_at = ? WHERE id = ?")
    .bind(hash, visibility, now(), doc.id)
    .run();
}

// Switch a doc between team / password / public. Returns a generated password
// when the new mode needs one and the doc had none.
export async function setDocVisibility(env: Env, doc: Doc, owner: User, value: string): Promise<{ generatedPassword?: string }> {
  const visibility = parseVisibility(value);
  if (!visibility) throw new ApiError(400, "invalid_visibility", "Use one of: team, password, public.");
  const { password, generated } = resolveAccess(owner, visibility, undefined, !!doc.password_hash);
  const hash = password ? await hashPassword(password) : doc.password_hash;
  const teamId = visibility === "team" ? owner.team_id : null;
  await env.DB.prepare("UPDATE docs SET visibility = ?, team_id = ?, password_hash = ?, legacy = 0, updated_at = ? WHERE id = ?")
    .bind(visibility, teamId, hash, now(), doc.id)
    .run();
  return { generatedPassword: generated };
}

export async function deleteDoc(env: Env, doc: Doc): Promise<void> {
  const versions = await listVersions(env, doc.id);
  await Promise.all(versions.map((v) => env.BUCKET.delete(v.r2_key)));
  await env.DB.prepare("DELETE FROM versions WHERE doc_id = ?").bind(doc.id).run();
  await env.DB.prepare("DELETE FROM docs WHERE id = ?").bind(doc.id).run();
}

export async function fetchHtml(env: Env, r2Key: string): Promise<string | null> {
  const obj = await env.BUCKET.get(r2Key);
  if (!obj) return null;
  return obj.text();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

export function docUrl(origin: string, doc: Doc): string {
  return `${origin}/d/${doc.custom_slug ?? doc.slug}`;
}
