import { Hono } from "hono";
import { Env } from "./lib";
import { requireApiAuth } from "./auth";
import {
  createDoc,
  addVersion,
  resolveDoc,
  listDocsByOwner,
  listVersions,
  updateCustomSlug,
  deleteDoc,
  docUrl,
  ApiError,
} from "./docs";

type Vars = { Bindings: Env; Variables: { user?: { id: string; email: string } } };
export const api = new Hono<Vars>();

api.use("/api/*", requireApiAuth);

function origin(c: any): string {
  return new URL(c.req.url).origin;
}

// Accept either raw HTML body (Content-Type text/html), JSON {html,title,custom_slug,comment},
// or multipart form with a `file`/`html` field.
async function readPayload(c: any): Promise<{ html: string; title?: string; customSlug?: string; comment?: string }> {
  const ct = (c.req.header("Content-Type") ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    const j = await c.req.json();
    return { html: String(j.html ?? ""), title: j.title, customSlug: j.custom_slug, comment: j.comment };
  }
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const b = await c.req.parseBody();
    const file = b.file as File | undefined;
    const html = file && file.size > 0 ? await file.text() : String(b.html ?? "");
    return { html, title: b.title as string, customSlug: b.custom_slug as string, comment: b.comment as string };
  }
  // raw body (default for `--data-binary @file.html`)
  return {
    html: await c.req.text(),
    title: c.req.query("title"),
    customSlug: c.req.query("custom_slug"),
    comment: c.req.query("comment"),
  };
}

function serializeDoc(c: any, doc: any) {
  return {
    id: doc.id,
    slug: doc.slug,
    custom_slug: doc.custom_slug,
    title: doc.title,
    latest_version: doc.latest_version,
    url: docUrl(origin(c), doc),
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

// Create a new doc (+ first version)
api.post("/api/docs", async (c) => {
  const user = c.get("user")!;
  try {
    const p = await readPayload(c);
    if (!p.html.trim()) return c.json({ error: "empty_html" }, 400);
    const { doc, version } = await createDoc(c.env, {
      ownerId: user.id,
      html: p.html,
      title: p.title,
      customSlug: p.customSlug?.trim() || undefined,
      comment: p.comment,
    });
    return c.json({ ...serializeDoc(c, doc), version: version.version }, 201);
  } catch (e) {
    return apiErr(c, e);
  }
});

// List your docs
api.get("/api/docs", async (c) => {
  const user = c.get("user")!;
  const docs = await listDocsByOwner(c.env, user.id);
  return c.json({ docs: docs.map((d) => serializeDoc(c, d)) });
});

// Get one doc + its versions
api.get("/api/docs/:slug", async (c) => {
  const user = c.get("user")!;
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.owner_id !== user.id) return c.json({ error: "not_found" }, 404);
  const versions = await listVersions(c.env, doc.id);
  return c.json({
    ...serializeDoc(c, doc),
    versions: versions.map((v) => ({ version: v.version, size: v.size, comment: v.comment, created_at: v.created_at })),
  });
});

// Push a new version to an existing doc
api.post("/api/docs/:slug/versions", async (c) => {
  const user = c.get("user")!;
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.owner_id !== user.id) return c.json({ error: "not_found" }, 404);
  try {
    const p = await readPayload(c);
    if (!p.html.trim()) return c.json({ error: "empty_html" }, 400);
    const version = await addVersion(c.env, doc, { html: p.html, comment: p.comment });
    const fresh = await resolveDoc(c.env, doc.slug);
    return c.json({ ...serializeDoc(c, fresh), version: version.version }, 201);
  } catch (e) {
    return apiErr(c, e);
  }
});

// Set / change custom slug
api.put("/api/docs/:slug/slug", async (c) => {
  const user = c.get("user")!;
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.owner_id !== user.id) return c.json({ error: "not_found" }, 404);
  try {
    const j = await c.req.json();
    await updateCustomSlug(c.env, doc, String(j.custom_slug ?? "").trim());
    const fresh = await resolveDoc(c.env, doc.slug);
    return c.json(serializeDoc(c, fresh));
  } catch (e) {
    return apiErr(c, e);
  }
});

// Delete a doc
api.delete("/api/docs/:slug", async (c) => {
  const user = c.get("user")!;
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.owner_id !== user.id) return c.json({ error: "not_found" }, 404);
  await deleteDoc(c.env, doc);
  return c.json({ deleted: true });
});

function apiErr(c: any, e: unknown) {
  if (e instanceof ApiError) return c.json({ error: e.code, message: e.message }, e.status);
  return c.json({ error: "internal_error" }, 500);
}
