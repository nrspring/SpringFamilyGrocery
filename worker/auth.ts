import type { Env } from "./env";

const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sign(env: Env, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

// Constant-time comparison: hash both sides to equal length, then compare.
export async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all(
    [a, b].map((s) => crypto.subtle.digest("SHA-256", encoder.encode(s))),
  );
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : null;
}

export const cookieHeader = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

// ---- Login session: proves the visitor knows the family password ----

const SESSION_COOKIE = "sfg_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export async function isAuthenticated(request: Request, env: Env) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return false;
  const value = getCookie(request, SESSION_COOKIE);
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(signature, await sign(env, expires));
}

export async function sessionCookie(env: Env) {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return cookieHeader(SESSION_COOKIE, `${expires}.${await sign(env, expires)}`, SESSION_SECONDS);
}

export const clearSessionCookie = () => cookieHeader(SESSION_COOKIE, "", 0);
