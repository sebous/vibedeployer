import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { AppVars, Env, randomId, now } from "./lib";
import { createSession } from "./auth";
import { teamForDomain } from "./teams";

// Google sign-in (OAuth 2.0 authorization code flow). One platform-wide
// Google client serves every team; a team is picked by the account's
// verified Google Workspace domain (`hd` claim), never by the email alone.
export const google = new Hono<AppVars>();

const STATE_COOKIE = "vd_oauth";
const STATE_TTL_S = 600;

interface IdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
}

google.get("/auth/google", (c) => {
  const state = randomId(16);
  const next = safeNext(c.req.query("next"));
  setCookie(c, STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/auth",
    maxAge: STATE_TTL_S,
  });
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(c.req.url),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

google.get("/auth/google/callback", async (c) => {
  const [expected, next] = (getCookie(c, STATE_COOKIE) ?? "").split("|");
  deleteCookie(c, STATE_COOKIE, { path: "/auth" });
  const code = c.req.query("code");
  if (!expected || c.req.query("state") !== expected || !code) {
    return c.redirect("/login?error=" + encodeURIComponent("Sign-in expired. Try again."));
  }

  const claims = await exchangeCode(c.env, code, redirectUri(c.req.url));
  if (!claims) return c.redirect("/login?error=" + encodeURIComponent("Google sign-in failed."));

  const userId = await upsertGoogleUser(c.env, claims);
  await createSession(c, userId);
  return c.redirect(safeNext(next));
});

// The ID token comes straight from Google's token endpoint over TLS, so per
// Google's docs its signature does not need re-checking; claims still do.
async function exchangeCode(env: Env, code: string, redirect: string): Promise<IdTokenClaims | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token } = await res.json<{ id_token?: string }>();
  if (!id_token) return null;
  const claims = decodeJwtPayload(id_token) as IdTokenClaims | null;
  if (!claims) return null;
  const issOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issOk || claims.aud !== env.GOOGLE_CLIENT_ID || claims.exp * 1000 < now()) return null;
  if (!claims.email_verified || !claims.email) return null;
  return claims;
}

// Finds the user by Google id, else links an existing account with the same
// (now verified) email, else creates one. Team membership follows the
// Workspace domain: `hd` must equal the email domain and be a team domain.
async function upsertGoogleUser(env: Env, claims: IdTokenClaims): Promise<string> {
  const email = claims.email.toLowerCase();
  const domain = email.split("@")[1];
  const hd = claims.hd?.toLowerCase() === domain ? domain : null;
  const team = hd ? await teamForDomain(env, hd) : null;

  const existing =
    (await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(claims.sub).first<{ id: string }>()) ??
    (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>());

  if (existing) {
    await env.DB.prepare("UPDATE users SET google_sub = ?, google_hd = ?, team_id = ? WHERE id = ?")
      .bind(claims.sub, hd, team?.id ?? null, existing.id)
      .run();
    return existing.id;
  }
  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, created_at, google_sub, google_hd, team_id) VALUES (?, ?, '', ?, ?, ?, ?)",
  )
    .bind(id, email, now(), claims.sub, hd, team?.id ?? null)
    .run();
  return id;
}

function decodeJwtPayload(jwt: string): unknown {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
  } catch {
    return null;
  }
}

function redirectUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/auth/google/callback`;
}

// Only same-site paths; blocks open redirects like "//evil.com".
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/app";
  return next;
}
