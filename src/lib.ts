import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  SESSION_SECRET: string;
}

export interface User {
  id: string;
  email: string;
}

// Hono context with our env + the authenticated user (set by middleware).
export type AppContext = Context<{
  Bindings: Env;
  Variables: { user?: User };
}>;

export const now = () => Date.now();

// --- IDs & slugs ---------------------------------------------------------

const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no ambiguous 0/o/1/l/i

export function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomSlug(len = 7): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return s;
}

// Custom slugs: lowercase letters, digits, hyphen; 3-64 chars.
export function isValidCustomSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(s) && !s.includes("--");
}

// --- Password hashing (PBKDF2 / WebCrypto) -------------------------------

const PBKDF2_ITER = 100_000;

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const salt = unb64(saltB64);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: Number(iterStr), hash: "SHA-256" },
    key,
    256,
  );
  return timingSafeEqual(b64(bits), hashB64);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- API keys ------------------------------------------------------------

export function generateApiKey(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const body = [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `vd_${body}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// HMAC-SHA256(secret, msg) → hex. Used to mint stateless, tamper-proof unlock
// tokens for password-protected docs (no extra DB rows needed).
export async function hmacSign(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
