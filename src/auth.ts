import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { AppContext, Env, randomId, now, sha256Hex } from "./lib";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE = "vd_session";

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

// Resolves the current human (cookie session) if present. Never blocks.
export const loadSessionUser: MiddlewareHandler<{
  Bindings: Env;
  Variables: { user?: { id: string; email: string } };
}> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT u.id as id, u.email as email, s.expires_at as expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
      .bind(token)
      .first<{ id: string; email: string; expires_at: number }>();
    if (row && row.expires_at > now()) {
      c.set("user", { id: row.id, email: row.email });
    } else if (row) {
      await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
    }
  }
  await next();
};

// Requires a logged-in human (redirects browsers to /login).
export const requireUser: MiddlewareHandler<{
  Bindings: Env;
  Variables: { user?: { id: string; email: string } };
}> = async (c, next) => {
  if (!c.get("user")) return c.redirect("/login");
  await next();
};

// Resolves a user from a Bearer API key OR an existing session cookie.
// Used to protect the agent-facing REST API. Returns 401 JSON when missing.
export const requireApiAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: { user?: { id: string; email: string } };
}> = async (c, next) => {
  // 1) Bearer token
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const key = auth.slice(7).trim();
    const keyHash = await sha256Hex(key);
    const row = await c.env.DB.prepare(
      `SELECT k.id as kid, u.id as uid, u.email as email
       FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ? AND k.revoked = 0`,
    )
      .bind(keyHash)
      .first<{ kid: string; uid: string; email: string }>();
    if (row) {
      c.set("user", { id: row.uid, email: row.email });
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
