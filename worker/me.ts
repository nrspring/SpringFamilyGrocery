import type { User } from "../shared/types";
import { cookieHeader, getCookie, safeEqual, sign } from "./auth";
import type { Env } from "./env";
import { error, json } from "./http";
import { getRow, toUser } from "./users";

// "Who am I" on this device. It outlives the 30-day login so a phone keeps
// knowing its person, and it is signed so it can't be forged by editing it.

const USER_COOKIE = "sfg_user";
const USER_COOKIE_SECONDS = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Prefix keeps this signature from ever being valid as a login-session signature.
const signUserId = (env: Env, id: string) => sign(env, `user:${id}`);

export const clearUserCookie = () => cookieHeader(USER_COOKIE, "", 0);

/** The user this device chose, or null if none is set or they have been disabled. */
export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const value = getCookie(request, USER_COOKIE);
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature || !UUID_RE.test(id)) return null;
  if (!(await safeEqual(signature, await signUserId(env, id)))) return null;
  const row = await getRow(env, id);
  return row && row.active === 1 ? toUser(row) : null;
}

async function chooseUser(request: Request, env: Env) {
  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid request", 400);
  }
  const id = String(body.userId ?? "");
  if (!UUID_RE.test(id)) return error("Pick a user", 400);

  const row = await getRow(env, id);
  if (!row) return error("User not found", 404);
  if (row.active !== 1) return error("That user is disabled", 400);

  const cookie = cookieHeader(USER_COOKIE, `${id}.${await signUserId(env, id)}`, USER_COOKIE_SECONDS);
  return json(toUser(row), 200, { "set-cookie": cookie });
}

/** Handles /api/me; returns null for other paths. */
export async function handleMe(request: Request, env: Env, path: string) {
  if (path !== "/api/me") return null;
  if (request.method === "POST") return chooseUser(request, env);
  return error("Method not allowed", 405);
}
