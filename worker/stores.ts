import type { Store } from "../shared/types";
import type { Env } from "./env";
import { error, json } from "./http";
import { readForm, storePhoto } from "./users";

interface StoreRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  photo_key: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
}

const MAX_NAME_CHARS = 80;

const SELECT_STORES = `
  SELECT s.*, (SELECT COUNT(*) FROM item_stores WHERE store_id = s.id) AS item_count
    FROM stores s`;

function toStore(row: StoreRow): Store {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    photoUrl: row.photo_key ? `/api/images/${row.photo_key}` : null,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const getRow = (env: Env, id: string) =>
  env.DB.prepare(`${SELECT_STORES} WHERE s.id = ?`).bind(id).first<StoreRow>();

async function listStores(env: Env) {
  const { results } = await env.DB.prepare(`${SELECT_STORES} ORDER BY s.name COLLATE NOCASE`).all<StoreRow>();
  return json(results.map(toStore));
}

function validName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("Name is required");
  if (name.length > MAX_NAME_CHARS) throw new Error(`Name must be ${MAX_NAME_CHARS} characters or fewer`);
  return name;
}

function coordinate(value: unknown, label: string, limit: number) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > limit) {
    throw new Error(`${label} must be a number between -${limit} and ${limit}`);
  }
  return n;
}

/** Reads the latitude/longitude pair. Both blank is fine; one without the other is not. */
function validPosition(form: FormData) {
  const latitude = coordinate(form.get("latitude"), "Latitude", 90);
  const longitude = coordinate(form.get("longitude"), "Longitude", 180);
  if ((latitude === null) !== (longitude === null)) {
    throw new Error("Enter both latitude and longitude, or leave both blank");
  }
  return { latitude, longitude };
}

async function createStore(request: Request, env: Env) {
  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  const id = crypto.randomUUID();
  let name: string;
  let position: ReturnType<typeof validPosition>;
  let photoKey: string | null;
  try {
    name = validName(form.get("name"));
    position = validPosition(form);
    photoKey = await storePhoto(env, form.get("photo"), id, "Photo");
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.prepare("INSERT INTO stores (id, name, latitude, longitude, photo_key) VALUES (?, ?, ?, ?, ?)")
    .bind(id, name, position.latitude, position.longitude, photoKey)
    .run();

  return json(toStore((await getRow(env, id))!), 201);
}

async function updateStore(request: Request, env: Env, id: string) {
  const existing = await getRow(env, id);
  if (!existing) return error("Store not found", 404);

  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  let name = existing.name;
  let { latitude, longitude } = existing;
  let photoKey = existing.photo_key;
  try {
    if (form.has("name")) name = validName(form.get("name"));
    // The pair is replaced together, so a half-sent update can't leave one without the other.
    if (form.has("latitude") || form.has("longitude")) ({ latitude, longitude } = validPosition(form));
    photoKey = (await storePhoto(env, form.get("photo"), id, "Photo")) ?? photoKey;
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.prepare(
    `UPDATE stores
        SET name = ?, latitude = ?, longitude = ?, photo_key = ?,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?`,
  )
    .bind(name, latitude, longitude, photoKey, id)
    .run();

  if (existing.photo_key && photoKey !== existing.photo_key) await env.PHOTOS.delete(existing.photo_key);

  return json(toStore((await getRow(env, id))!));
}

/**
 * Deletes a store. If items are located there, answers 409 with those items
 * unless the caller confirms with `?force=true`; their locations here go too.
 */
async function deleteStore(request: Request, env: Env, id: string) {
  const row = await getRow(env, id);
  if (!row) return error("Store not found", 404);

  const { results: items } = await env.DB.prepare(
    `SELECT i.id, i.name
       FROM item_stores x JOIN items i ON i.id = x.item_id
      WHERE x.store_id = ?
      ORDER BY i.name COLLATE NOCASE`,
  )
    .bind(id)
    .all<{ id: string; name: string }>();

  const force = new URL(request.url).searchParams.get("force") === "true";
  if (items.length > 0 && !force) {
    return json({ error: `${row.name} has items located in it`, items }, 409);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_stores WHERE store_id = ?").bind(id),
    env.DB.prepare("DELETE FROM stores WHERE id = ?").bind(id),
  ]);
  if (row.photo_key) await env.PHOTOS.delete(row.photo_key);

  return new Response(null, { status: 204 });
}

const methodNotAllowed = () => error("Method not allowed", 405);

/** Returns a response for store routes, or null if the path isn't one of them. */
export async function handleStores(request: Request, env: Env, path: string) {
  const { method } = request;

  if (path === "/api/stores") {
    if (method === "GET") return listStores(env);
    if (method === "POST") return createStore(request, env);
    return methodNotAllowed();
  }

  const match = path.match(/^\/api\/stores\/([0-9a-f-]{36})$/);
  if (match) {
    const id = match[1];
    if (method === "GET") {
      const row = await getRow(env, id);
      return row ? json(toStore(row)) : error("Store not found", 404);
    }
    if (method === "PATCH") return updateStore(request, env, id);
    if (method === "DELETE") return deleteStore(request, env, id);
    return methodNotAllowed();
  }

  return null;
}
