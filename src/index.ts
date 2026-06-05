import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Env, verifyPassword, docAccessToken, docAccessCookie, timingSafeEqual } from "./lib";
import { loadSessionUser } from "./auth";
import { pages } from "./pages";
import { api } from "./api";
import { resolveDoc, getVersion, listVersions, fetchHtml, Doc } from "./docs";
import { layout, passwordPage } from "./ui";

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

async function serve(c: any, r2Key: string, etag: string, isPrivate = false) {
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  const html = await fetchHtml(c.env, r2Key);
  if (html === null) return c.notFound();
  return c.html(html, 200, {
    // Protected docs must not be cached by shared caches.
    "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=60",
    ETag: etag,
    "Content-Security-Policy": SECURITY,
  });
}

// Is the requester allowed to see a (possibly protected) doc?
// The owner (logged-in session) always passes; otherwise a valid unlock cookie is required.
async function hasDocAccess(c: any, doc: Doc): Promise<boolean> {
  if (!doc.password_hash) return true;
  const user = c.get("user");
  if (user && user.id === doc.owner_id) return true;
  const cookie = getCookie(c, docAccessCookie(doc.id));
  if (!cookie) return false;
  const expected = await docAccessToken(c.env.SESSION_SECRET, doc.id, doc.password_hash);
  return timingSafeEqual(cookie, expected);
}

function unlockPrompt(c: any, doc: Doc, error?: string) {
  const slug = doc.custom_slug ?? doc.slug;
  return c.html(layout(doc.title, passwordPage(slug, doc.title, error)), error ? 401 : 200);
}

// Latest version
app.get("/d/:slug", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.latest_version === 0) return notFound(c);
  if (!(await hasDocAccess(c, doc))) return unlockPrompt(c, doc);
  const v = await getVersion(c.env, doc.id, doc.latest_version);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`, !!doc.password_hash);
});

// Pinned version
app.get("/d/:slug/v/:n", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return notFound(c);
  if (!(await hasDocAccess(c, doc))) return unlockPrompt(c, doc);
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n)) return notFound(c);
  const v = await getVersion(c.env, doc.id, n);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`, !!doc.password_hash);
});

// Unlock a password-protected doc: verify the password, drop an HMAC access cookie, redirect back.
app.post("/d/:slug/unlock", async (c) => {
  const slugParam = c.req.param("slug");
  const doc = await resolveDoc(c.env, slugParam);
  if (!doc) return notFound(c);
  const liveUrl = `/d/${doc.custom_slug ?? doc.slug}`;
  if (!doc.password_hash) return c.redirect(liveUrl);
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  if (!password || !(await verifyPassword(password, doc.password_hash))) {
    return unlockPrompt(c, doc, "Incorrect password.");
  }
  const token = await docAccessToken(c.env.SESSION_SECRET, doc.id, doc.password_hash);
  // Cookie name is bound to the doc id; path "/" so it works via either the random or custom slug.
  setCookie(c, docAccessCookie(doc.id), token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return c.redirect(liveUrl);
});

// Lightweight JSON metadata for a public doc (handy for agents pre-auth).
app.get("/d/:slug/meta", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return c.json({ error: "not_found" }, 404);
  const origin = new URL(c.req.url).origin;
  const protectedDoc = !!doc.password_hash;
  // For a locked doc, expose only the bare minimum until the viewer unlocks it.
  if (protectedDoc && !(await hasDocAccess(c, doc))) {
    return c.json({
      title: doc.title,
      slug: doc.slug,
      custom_slug: doc.custom_slug,
      protected: true,
      url: `${origin}/d/${doc.custom_slug ?? doc.slug}`,
    });
  }
  const versions = await listVersions(c.env, doc.id);
  return c.json({
    title: doc.title,
    slug: doc.slug,
    custom_slug: doc.custom_slug,
    latest_version: doc.latest_version,
    protected: protectedDoc,
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
