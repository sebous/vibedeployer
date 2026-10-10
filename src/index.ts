import { Hono } from "hono";
import { AppVars } from "./lib";
import { loadSessionUser, canViewDoc, setDocUnlockCookie, sameOriginWrites } from "./auth";
import { pages } from "./pages";
import { api } from "./api";
import { google } from "./google";
import { admin } from "./admin";
import { getTeam } from "./teams";
import { resolveDoc, getVersion, listVersions, fetchHtml, isProtected, type Doc } from "./docs";
import { verifyPassword } from "./lib";
import { layout, unlockPage } from "./ui";

const app = new Hono<AppVars>();

// Make the current human (if any) available everywhere.
app.use("*", loadSessionUser);
app.use("*", sameOriginWrites);

// Security headers (the served docs are arbitrary user HTML, so keep them framed-off).
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
});

// Cloudflare Web Analytics: stream the beacon into every successful HTML
// response — both app pages and served docs. The token is public by design.
app.use("*", async (c, next) => {
  await next();
  const token = c.env.CF_BEACON_TOKEN;
  if (!token || c.res.status !== 200) return;
  if (!(c.res.headers.get("Content-Type") ?? "").includes("text/html")) return;
  const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;
  // Docs are arbitrary user HTML and may lack a <body> tag; fall back to
  // appending at end-of-document (browsers hoist the script into body).
  let injected = false;
  c.res = new HTMLRewriter()
    .on("body", {
      element(el) {
        injected = true;
        el.append(beacon, { html: true });
      },
    })
    .onDocument({
      end(end) {
        if (!injected) end.append(beacon, { html: true });
      },
    })
    .transform(c.res);
});

// --- Public doc serving --------------------------------------------------
// No `allow-same-origin`: docs run in an opaque origin, so their scripts can't
// read our cookies or call /api and /app as the viewer. Cost: docs can't use
// localStorage, sessionStorage, IndexedDB, or document.cookie. The full fix is
// serving docs from a separate registered domain.
const SECURITY = "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox;";

// `immutable` is safe only for pinned versions — their content never changes.
// The latest endpoint keeps short revalidation since its content moves.
// Protected docs are never shared-cached, regardless of the version policy.
async function serve(c: any, r2Key: string, etag: string, cacheControl = "public, max-age=60", protectedDoc = false) {
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  const html = await fetchHtml(c.env, r2Key);
  if (html === null) return c.notFound();
  return c.html(html, 200, {
    "Cache-Control": protectedDoc ? "private, no-store" : cacheControl,
    ETag: etag,
    "Content-Security-Policy": SECURITY,
  });
}

// Returns a 401 lock response when the viewer can't see the doc, else null.
// Browsers get the sign-in / unlock page; programmatic callers get JSON.
async function gate(c: any, doc: Doc, json = false): Promise<Response | null> {
  if (await canViewDoc(c, doc)) return null;
  if (json || !(c.req.header("Accept") ?? "").includes("text/html")) {
    return c.json(
      { error: "access_denied", visibility: doc.visibility, hint: doc.password_hash ? "Send 'X-Doc-Password' header or '?password='." : undefined },
      401,
    );
  }
  return c.html(layout("Protected", await lockedPage(c, doc, new URL(c.req.url).pathname)), 401);
}

async function lockedPage(c: any, doc: Doc, redirect: string, err?: string): Promise<string> {
  const team = doc.visibility === "team" && doc.team_id ? await getTeam(c.env, doc.team_id) : null;
  return unlockPage({
    slug: doc.custom_slug ?? doc.slug,
    redirect,
    teamName: team?.name,
    hasPassword: !!doc.password_hash,
    signedInAs: c.get("user")?.email,
    err,
  });
}

// Latest version
app.get("/d/:slug", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc || doc.latest_version === 0) return notFound(c);
  const locked = await gate(c, doc);
  if (locked) return locked;
  const v = await getVersion(c.env, doc.id, doc.latest_version);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`, "public, max-age=60", isProtected(doc));
});

// Unlock a protected doc (browser form) → set cookie, bounce back.
app.post("/d/:slug/unlock", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return notFound(c);
  const slug = doc.custom_slug ?? doc.slug;
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  const redirect = sanitizeRedirect(String(body.redirect ?? ""), slug);
  if (!doc.password_hash || !(await verifyPassword(password, doc.password_hash))) {
    return c.html(layout("Protected", await lockedPage(c, doc, redirect, "Incorrect password.")), 401);
  }
  await setDocUnlockCookie(c, doc);
  return c.redirect(redirect);
});

// Pinned version
app.get("/d/:slug/v/:n", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return notFound(c);
  const locked = await gate(c, doc);
  if (locked) return locked;
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n)) return notFound(c);
  const v = await getVersion(c.env, doc.id, n);
  if (!v) return notFound(c);
  return serve(c, v.r2_key, `"${doc.id}-${v.version}-${v.content_hash.slice(0, 12)}"`, "public, max-age=31536000, immutable", isProtected(doc));
});

// Lightweight JSON metadata for a public doc (handy for agents pre-auth).
app.get("/d/:slug/meta", async (c) => {
  const doc = await resolveDoc(c.env, c.req.param("slug"));
  if (!doc) return c.json({ error: "not_found" }, 404);
  const locked = await gate(c, doc, true);
  if (locked) return locked;
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
app.route("/", google);
app.route("/", admin);
app.route("/", pages);

// Keep post-unlock redirects on this doc's own path (no open redirects).
function sanitizeRedirect(redirect: string, slug: string): string {
  const fallback = `/d/${slug}`;
  if (!redirect.startsWith("/d/") || redirect.includes("//")) return fallback;
  return redirect;
}

function notFound(c: any) {
  return c.html(
    `<!doctype html><meta charset=utf-8><title>Not found</title><body style="font:16px system-ui;background:#0b0d12;color:#e6e9ef;text-align:center;padding:80px"><h1>404</h1><p>No doc at this URL.</p><p><a style="color:#6ea8fe" href="/">vibedeployer</a></p>`,
    404,
  );
}

export default app;
