import { clearSessionCookie, isAuthenticated, safeEqual, sessionCookie } from "./auth";
import type { Env } from "./env";
import { json } from "./http";
import { handleItems } from "./items";
import { clearUserCookie, currentUser, handleMe } from "./me";
import { handleUsers } from "./users";

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
  return json({ ok: true }, 200, { "set-cookie": await sessionCookie(env) });
}

async function handleApi(request: Request, env: Env, path: string) {
  const { method } = request;

  if (path === "/api/login") {
    return method === "POST" ? login(request, env) : json({ error: "Method not allowed" }, 405);
  }
  if (path === "/api/logout") {
    // Signing out also forgets which family member this device was.
    return method === "POST"
      ? json({ ok: true }, 200, [
          ["set-cookie", clearSessionCookie()],
          ["set-cookie", clearUserCookie()],
        ])
      : json({ error: "Method not allowed" }, 405);
  }
  if (path === "/api/session") {
    const authenticated = await isAuthenticated(request, env);
    return json({ authenticated, user: authenticated ? await currentUser(request, env) : null });
  }

  // Everything below this point requires a signed-in user.
  if (!(await isAuthenticated(request, env))) return json({ error: "Unauthorized" }, 401);

  const response =
    (await handleMe(request, env, path)) ??
    (await handleUsers(request, env, path)) ??
    (await handleItems(request, env, path));
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
