import { Hono } from "hono";
import { Env } from "./lib";
import { loadSessionUser } from "./auth";
import { pages } from "./pages";
import { api } from "./api";
import { resolveDoc, getVersion, listVersions, fetchHtml } from "./docs";

type Vars = { Bindings: Env; Variables: { user?: { id: string; email: string } } };
const app = new Hono<Vars>();

// Make the current human (if any) available everywhere.
app.use("*", loadSessionUser);

// Security headers (the served docs are arbitrary user HTML, so keep them framed-off).
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

// --- Public doc serving --------------------------------------------------
const SECURITY = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; sandbox allow-scripts allow-forms allow-popups allow-same-origin;";

async function serve(c: any, r2Key: string, etag: string) {
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  const html = await fetchHtml(c.env, r2Key);
  if (html === null) return c.notFound();
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=60",
    ETag: etag,
    "Content-Security-Policy": SECURITY,
  });
}

// Latest version
app.get("/d/:slug", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.latest_version === 0) return notFound(c);
  const v = await getVersion(c.env, doc.id, doc.latest_version);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`);
});

// Pinned version
app.get("/d/:slug/v/:n", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return notFound(c);
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n)) return notFound(c);
  const v = await getVersion(c.env, doc.id, n);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`);
});

// Lightweight JSON metadata for a public doc (handy for agents pre-auth).
app.get("/d/:slug/meta", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return c.json({ error: "not_found" }, 404);
  const versions = await listVersions(c.env, doc.id);
  const origin = new URL(c.req.url).origin;
  return c.json({
    title: doc.title,
    slug: doc.slug,
    custom_slug: doc.custom_slug,
    latest_version: doc.latest_version,
    url: `${origin}/d/${doc.custom_slug ?? doc.slug}`,
    versions: versions.map((v) => ({
      version: v.version,
      url: `${origin}/d/${doc.slug}/v/${v.version}`,
      size: v.size,
      created_at: v.created_at,
    })),
  });
});

app.get("/health", (c) => c.json({ ok: true }));

// --- Mount API + human pages --------------------------------------------
app.route("/", api);
app.route("/", pages);

function notFound(c: any) {
  return c.html(
    `<!doctype html><meta charset=utf-8><title>Not found</title><body style="font:16px system-ui;background:#0b0d12;color:#e6e9ef;text-align:center;padding:80px"><h1>404</h1><p>No doc at this URL.</p><p><a style="color:#6ea8fe" href="/">vibedeployer</a></p>`,
    404,
  );
}

export default app;
