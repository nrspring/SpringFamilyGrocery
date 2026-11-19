import type { User } from "../shared/types";
import type { Env } from "./env";
import { error, json } from "./http";

interface UserRow {
  id: string;
  name: string;
  color: string;
  photo_key: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

const MAX_NAME_CHARS = 50;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    photoUrl: row.photo_key ? `/api/images/${row.photo_key}` : null,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const getRow = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();

async function listUsers(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE",
  ).all<UserRow>();
  return json(results.map(toUser));
}

function validName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("Name is required");
  if (name.length > MAX_NAME_CHARS) throw new Error(`Name must be ${MAX_NAME_CHARS} characters or fewer`);
  return name;
}

function validColor(value: unknown) {
  const color = String(value ?? "").trim();
  if (!COLOR_RE.test(color)) throw new Error("Color must look like #1e88e5");
  return color.toLowerCase();
}

// Each upload gets its own key, so a replaced headshot is never served stale
// from cache and old keys can be deleted safely.
async function storePhoto(env: Env, file: File | string | null, userId: string) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Headshot must be an image");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Headshot is too large");
  const key = `${userId}/${crypto.randomUUID()}.jpg`;
  await env.PHOTOS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  return key;
}

async function readForm(request: Request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

async function createUser(request: Request, env: Env) {
  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  let name: string;
  let color: string;
  let photoKey: string | null;
  const id = crypto.randomUUID();
  try {
    name = validName(form.get("name"));
    color = validColor(form.get("color"));
    photoKey = await storePhoto(env, form.get("photo"), id);
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.prepare("INSERT INTO users (id, name, color, photo_key) VALUES (?, ?, ?, ?)")
    .bind(id, name, color, photoKey)
    .run();

  return json(toUser((await getRow(env, id))!), 201);
}

async function updateUser(request: Request, env: Env, id: string) {
  const existing = await getRow(env, id);
  if (!existing) return error("User not found", 404);

  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  let name = existing.name;
  let color = existing.color;
  let active = existing.active;
  let photoKey = existing.photo_key;
  try {
    if (form.has("name")) name = validName(form.get("name"));
    if (form.has("color")) color = validColor(form.get("color"));
    if (form.has("active")) {
      const value = form.get("active");
      if (value !== "true" && value !== "false") throw new Error("Active must be true or false");
      active = value === "true" ? 1 : 0;
    }
    photoKey = (await storePhoto(env, form.get("photo"), id)) ?? existing.photo_key;
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.prepare(
    `UPDATE users
        SET name = ?, color = ?, active = ?, photo_key = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?`,
  )
    .bind(name, color, active, photoKey, id)
    .run();

  if (existing.photo_key && photoKey !== existing.photo_key) {
    await env.PHOTOS.delete(existing.photo_key);
  }

  return json(toUser((await getRow(env, id))!));
}

async function serveImage(env: Env, key: string) {
  const object = await env.PHOTOS.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Keys are never rewritten, so browsers can cache them for good. Private
  // because the images sit behind the login.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

const methodNotAllowed = () => error("Method not allowed", 405);

/** Returns a response for user and image routes, or null if the path isn't one of them. */
export async function handleUsers(request: Request, env: Env, path: string) {
  const { method } = request;

  if (path === "/api/users") {
    if (method === "GET") return listUsers(env);
    if (method === "POST") return createUser(request, env);
    return methodNotAllowed();
  }

  const userMatch = path.match(/^\/api\/users\/([0-9a-f-]{36})$/);
  if (userMatch) {
    const id = userMatch[1];
    if (method === "GET") {
      const row = await getRow(env, id);
      return row ? json(toUser(row)) : error("User not found", 404);
    }
    if (method === "PATCH") return updateUser(request, env, id);
    // There is deliberately no DELETE: users are disabled, not removed.
    return methodNotAllowed();
  }

  const imageMatch = path.match(/^\/api\/images\/([0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg)$/);
  if (imageMatch) return method === "GET" ? serveImage(env, imageMatch[1]) : methodNotAllowed();

  return null;
}
