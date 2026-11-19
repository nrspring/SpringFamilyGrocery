import type { Env } from "./env";
import { json } from "./http";
import { handleUsers } from "./users";

const COOKIE = "sfg_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(env: Env, value: string) {
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
async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all(
    [a, b].map((s) => crypto.subtle.digest("SHA-256", encoder.encode(s))),
  );
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function isAuthenticated(request: Request, env: Env) {
  if (!env.APP_PASSWORD || !env.SESSION_SECRET) return false;
  const cookie = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [expires, signature] = cookie.slice(COOKIE.length + 1).split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return safeEqual(signature, await sign(env, expires));
}

const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

async function login(request: Request, env: Env) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const password = String(body.password ?? "");
  if (!env.APP_PASSWORD || !env.SESSION_SECRET || !(await safeEqual(password, env.APP_PASSWORD))) {
    return json({ error: "Incorrect password" }, 401);
  }
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const value = `${expires}.${await sign(env, expires)}`;
  return json({ ok: true }, 200, { "set-cookie": cookieHeader(value, SESSION_SECONDS) });
}

async function handleApi(request: Request, env: Env, path: string) {
  const { method } = request;

  if (path === "/api/login") {
    return method === "POST" ? login(request, env) : json({ error: "Method not allowed" }, 405);
  }
  if (path === "/api/logout") {
    return method === "POST"
      ? json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) })
      : json({ error: "Method not allowed" }, 405);
  }
  if (path === "/api/session") {
    return json({ authenticated: await isAuthenticated(request, env) });
  }

  // Everything below this point requires a signed-in user.
  if (!(await isAuthenticated(request, env))) return json({ error: "Unauthorized" }, 401);

  const response = await handleUsers(request, env, path);
  if (response) return response;

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      let response: Response;
      try {
        response = await handleApi(request, env, url.pathname);
      } catch (e) {
        console.error(e);
        response = json({ error: "Something went wrong" }, 500);
      }
      response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
      return response;
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
