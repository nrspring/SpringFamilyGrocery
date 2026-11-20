import type { Store, StoreLocation } from "../shared/types";
import type { Env } from "./env";
import { error, json } from "./http";
import { MAX_LOCATION_CHARS } from "./locations";
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

interface LocationRow {
  id: string;
  store_id: string;
  name: string;
  item_count: number;
}

const MAX_NAME_CHARS = 80;
const MAX_LOCATIONS = 300;

const SELECT_STORES = `
  SELECT s.*, (SELECT COUNT(*) FROM item_stores WHERE store_id = s.id) AS item_count
    FROM stores s`;

/** Locations in walking order, with how many items are placed at each. */
const SELECT_LOCATIONS = `
  SELECT l.id, l.store_id, l.name,
         (SELECT COUNT(*) FROM item_stores x
           WHERE x.store_id = l.store_id AND x.location = l.name COLLATE NOCASE) AS item_count
    FROM store_locations l`;
const LOCATION_ORDER = "ORDER BY l.position, l.name COLLATE NOCASE";

function toStore(row: StoreRow, locations: StoreLocation[]): Store {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    photoUrl: row.photo_key ? `/api/images/${row.photo_key}` : null,
    itemCount: row.item_count,
    locations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toLocation = (r: LocationRow): StoreLocation => ({ id: r.id, name: r.name, itemCount: r.item_count });

const getRow = (env: Env, id: string) =>
  env.DB.prepare(`${SELECT_STORES} WHERE s.id = ?`).bind(id).first<StoreRow>();

async function locationsFor(env: Env, storeId: string) {
  const { results } = await env.DB.prepare(`${SELECT_LOCATIONS} WHERE l.store_id = ? ${LOCATION_ORDER}`)
    .bind(storeId)
    .all<LocationRow>();
  return results.map(toLocation);
}

/** The store as the app sees it, or null if there is no such store. */
async function getStore(env: Env, id: string) {
  const row = await getRow(env, id);
  return row ? toStore(row, await locationsFor(env, id)) : null;
}

async function listStores(env: Env) {
  const [stores, locations] = await Promise.all([
    env.DB.prepare(`${SELECT_STORES} ORDER BY s.name COLLATE NOCASE`).all<StoreRow>(),
    env.DB.prepare(`${SELECT_LOCATIONS} ${LOCATION_ORDER}`).all<LocationRow>(),
  ]);
  const byStore = new Map<string, StoreLocation[]>();
  for (const l of locations.results) {
    const list = byStore.get(l.store_id) ?? [];
    list.push(toLocation(l));
    byStore.set(l.store_id, list);
  }
  return json(stores.results.map((row) => toStore(row, byStore.get(row.id) ?? [])));
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

  return json((await getStore(env, id))!, 201);
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

  return json((await getStore(env, id))!);
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
    env.DB.prepare("DELETE FROM store_locations WHERE store_id = ?").bind(id),
    env.DB.prepare("DELETE FROM stores WHERE id = ?").bind(id),
  ]);
  if (row.photo_key) await env.PHOTOS.delete(row.photo_key);

  return new Response(null, { status: 204 });
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Adds a location to the end of the store's order. Adding one that exists (ignoring case) changes nothing. */
async function addLocation(request: Request, env: Env, storeId: string) {
  if (!(await getRow(env, storeId))) return error("Store not found", 404);
  const body = await readJson(request);
  if (!body) return error("Invalid request", 400);

  const name = String(body.name ?? "").trim();
  if (!name) return error("Location name is required", 400);
  if (name.length > MAX_LOCATION_CHARS) {
    return error(`A location must be ${MAX_LOCATION_CHARS} characters or fewer`, 400);
  }

  const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM store_locations WHERE store_id = ?")
    .bind(storeId)
    .all<{ n: number }>();
  if (results[0].n >= MAX_LOCATIONS) return error(`A store can have at most ${MAX_LOCATIONS} locations`, 400);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO store_locations (id, store_id, name, position)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM store_locations WHERE store_id = ?))`,
  )
    .bind(crypto.randomUUID(), storeId, name, storeId)
    .run();

  return json((await getStore(env, storeId))!);
}

/**
 * Sets the order of a store's locations. Body: `{ "order": ["Aisle 1", "Aisle 2", …] }`, names
 * from first to last. Names that aren't recognised are ignored, and any location left out keeps
 * its place after the ones listed, so a stale screen can't lose anything.
 */
async function orderLocations(request: Request, env: Env, storeId: string) {
  if (!(await getRow(env, storeId))) return error("Store not found", 404);
  const body = await readJson(request);
  if (!body || !Array.isArray(body.order) || !body.order.every((n) => typeof n === "string")) {
    return error("Order must be a list of location names", 400);
  }

  const current = await locationsFor(env, storeId);
  const byName = new Map(current.map((l) => [l.name.toLowerCase(), l]));
  const ordered: StoreLocation[] = [];
  const seen = new Set<string>();
  for (const name of body.order as string[]) {
    const match = byName.get(name.trim().toLowerCase());
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      ordered.push(match);
    }
  }
  for (const l of current) if (!seen.has(l.id)) ordered.push(l);

  await env.DB.batch(
    ordered.map((l, position) =>
      env.DB.prepare("UPDATE store_locations SET position = ? WHERE id = ?").bind(position, l.id),
    ),
  );

  return json((await getStore(env, storeId))!);
}

/** Removes a location nothing is using; one in use answers 409 so items never point at a missing place. */
async function deleteLocation(env: Env, storeId: string, locationId: string) {
  if (!(await getRow(env, storeId))) return error("Store not found", 404);

  const location = await env.DB.prepare(`${SELECT_LOCATIONS} WHERE l.id = ? AND l.store_id = ?`)
    .bind(locationId, storeId)
    .first<LocationRow>();
  if (location) {
    if (location.item_count > 0) {
      const n = location.item_count;
      return error(`${location.name} is used by ${n} item${n === 1 ? "" : "s"}. Move them first.`, 409);
    }
    await env.DB.prepare("DELETE FROM store_locations WHERE id = ?").bind(locationId).run();
  }

  return json((await getStore(env, storeId))!);
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

  const locationRoute = path.match(/^\/api\/stores\/([0-9a-f-]{36})\/locations(?:\/([0-9a-f-]{36}))?$/);
  if (locationRoute) {
    const [, storeId, locationId] = locationRoute;
    if (!locationId) {
      if (method === "POST") return addLocation(request, env, storeId);
      if (method === "PUT") return orderLocations(request, env, storeId);
    } else if (method === "DELETE") {
      return deleteLocation(env, storeId, locationId);
    }
    return methodNotAllowed();
  }

  const match = path.match(/^\/api\/stores\/([0-9a-f-]{36})$/);
  if (match) {
    const id = match[1];
    if (method === "GET") {
      const store = await getStore(env, id);
      return store ? json(store) : error("Store not found", 404);
    }
    if (method === "PATCH") return updateStore(request, env, id);
    if (method === "DELETE") return deleteStore(request, env, id);
    return methodNotAllowed();
  }

  return null;
}
