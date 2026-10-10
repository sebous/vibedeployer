import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { AppContext, AppVars, User, randomId, now, sha256Hex, hmacSign, verifyPassword, timingSafeEqual } from "./lib";
import type { Doc } from "./docs";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE = "vd_session";

const UNLOCK_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const unlockCookieName = (docId: string) => `vd_u_${docId}`;

// Stateless unlock token: HMAC over (docId + current hash). Rotating or
// removing the password changes the hash, so old cookies stop validating.
async function unlockToken(c: AppContext, doc: Doc): Promise<string> {
  return hmacSign(c.env.SESSION_SECRET, `${doc.id}:${doc.password_hash ?? ""}`);
}

export async function setDocUnlockCookie(c: AppContext, doc: Doc): Promise<void> {
  setCookie(c, unlockCookieName(doc.id), await unlockToken(c, doc), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/d",
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  });
}

// True if the viewer may see the doc: it's public, they own it, they are in
// its team (team docs), or they have the password via cookie, X-Doc-Password
// header, or ?password= query. A supplied password sets the unlock cookie.
export async function canViewDoc(c: AppContext, doc: Doc): Promise<boolean> {
  if (doc.visibility === "public") return true;
  const user = c.get("user");
  if (user && user.id === doc.owner_id) return true;
  if (doc.visibility === "team" && user?.team_id && user.team_id === doc.team_id) return true;
  if (!doc.password_hash) return false;

  const cookie = getCookie(c, unlockCookieName(doc.id));
  if (cookie && timingSafeEqual(cookie, await unlockToken(c, doc))) return true;

  const supplied = c.req.header("X-Doc-Password") ?? c.req.query("password");
  if (supplied && (await verifyPassword(supplied, doc.password_hash))) {
    await setDocUnlockCookie(c, doc);
    return true;
  }
  return false;
}

export async function createSession(c: AppContext, userId: string): Promise<void> {
  const token = randomId(32);
  const expires = now() + SESSION_TTL_MS;
  await c.env.DB.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  )
    .bind(token, userId, expires, now())
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession(c: AppContext): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
  }
  deleteCookie(c, COOKIE, { path: "/" });
}

const USER_COLUMNS = "u.id AS id, u.email AS email, u.team_id AS team_id, u.google_sub AS google_sub";

// Resolves the current human (cookie session) if present. Never blocks.
export const loadSessionUser: MiddlewareHandler<AppVars> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT ${USER_COLUMNS}, s.expires_at AS expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
      .bind(token)
      .first<User & { expires_at: number }>();
    if (row && row.expires_at > now()) {
      const { expires_at: _, ...user } = row;
      c.set("user", user);
    } else if (row) {
      await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    }
  }
  await next();
};

// Requires a logged-in human (redirects browsers to /login).
export const requireUser: MiddlewareHandler<AppVars> = async (c, next) => {
  if (!c.get("user")) return c.redirect("/login");
  await next();
};

// Admins are listed in ADMIN_EMAILS. The account must have signed in with
// Google, because legacy email/password accounts never had their email verified.
export function isAdmin(c: AppContext): boolean {
  const user = c.get("user");
  if (!user?.google_sub) return false;
  const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

export const requireAdmin: MiddlewareHandler<AppVars> = async (c, next) => {
  if (!c.get("user")) return c.redirect("/login?next=/admin");
  if (!isAdmin(c)) return c.text("Forbidden", 403);
  await next();
};

// Resolves a user from a Bearer API key OR an existing session cookie.
// Used to protect the agent-facing REST API. Returns 401 JSON when missing.
export const requireApiAuth: MiddlewareHandler<AppVars> = async (c, next) => {
  // 1) Bearer token
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const key = auth.slice(7).trim();
    const keyHash = await sha256Hex(key);
    const row = await c.env.DB.prepare(
      `SELECT k.id AS kid, ${USER_COLUMNS}
       FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ? AND k.revoked = 0`,
    )
      .bind(keyHash)
      .first<User & { kid: string }>();
    if (row) {
      const { kid: _, ...user } = row;
      c.set("user", user);
      c.executionCtx.waitUntil(
        c.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(now(), row.kid).run(),
      );
      return next();
    }
    return c.json({ error: "invalid_api_key" }, 401);
  }
  // 2) Fall back to cookie session (so the dashboard can call the same API)
  if (c.get("user")) return next();
  return c.json({ error: "unauthorized", hint: "Send 'Authorization: Bearer vd_...'" }, 401);
};

// Blocks cross-site form posts and fetches that ride on the session cookie
// (CSRF). Served docs run in an opaque sandbox origin, so their requests carry
// `Origin: null` and are rejected here. Bearer-token calls are not cookie-based
// and skip the check.
export const sameOriginWrites: MiddlewareHandler<AppVars> = async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (c.req.header("Authorization")?.startsWith("Bearer ")) return next();
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin) return c.text("Cross-origin request blocked", 403);
  await next();
};
