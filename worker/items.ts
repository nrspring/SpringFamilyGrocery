import type { Item, ItemStore } from "../shared/types";
import type { Env } from "./env";
import { error, json } from "./http";
import { MAX_LOCATION_CHARS, prepareLocations } from "./locations";
import { currentUser } from "./me";
import { readForm, storePhoto } from "./users";

interface ItemRow {
  id: string;
  name: string;
  description: string;
  photo_key: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  adder_name: string | null;
  adder_color: string | null;
  adder_photo_key: string | null;
  /** Null unless the item is on the shopping list. */
  listed_at: string | null;
  lister_id: string | null;
  lister_name: string | null;
  lister_color: string | null;
  lister_photo_key: string | null;
}

const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_ALTERNATIVES = 50;
const MAX_STORES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SELECT_ITEMS = `
  SELECT i.*,
         u.name AS adder_name, u.color AS adder_color, u.photo_key AS adder_photo_key,
         l.created_at AS listed_at,
         lu.id AS lister_id, lu.name AS lister_name, lu.color AS lister_color,
         lu.photo_key AS lister_photo_key
    FROM items i
    LEFT JOIN users u ON u.id = i.added_by
    LEFT JOIN list_entries l ON l.item_id = i.id
    LEFT JOIN users lu ON lu.id = l.added_by`;

const userRef = (id: string | null, name: string | null, color: string | null, photoKey: string | null) =>
  id && name !== null
    ? { id, name, color: color ?? "#888888", photoUrl: photoKey ? `/api/images/${photoKey}` : null }
    : null;

function toItem(row: ItemRow, alternativeIds: string[], stores: ItemStore[]): Item {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    photoUrl: row.photo_key ? `/api/images/${row.photo_key}` : null,
    addedBy: userRef(row.added_by, row.adder_name, row.adder_color, row.adder_photo_key),
    list: row.listed_at
      ? {
          addedBy: userRef(row.lister_id, row.lister_name, row.lister_color, row.lister_photo_key),
          addedAt: row.listed_at,
        }
      : null,
    alternativeIds,
    stores,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function alternativesFor(env: Env, itemId?: string) {
  const statement = itemId
    ? env.DB.prepare("SELECT item_id, alternative_id FROM item_alternatives WHERE item_id = ?").bind(itemId)
    : env.DB.prepare("SELECT item_id, alternative_id FROM item_alternatives");
  const { results } = await statement.all<{ item_id: string; alternative_id: string }>();
  const byItem = new Map<string, string[]>();
  for (const r of results) {
    const list = byItem.get(r.item_id) ?? [];
    list.push(r.alternative_id);
    byItem.set(r.item_id, list);
  }
  return byItem;
}

/** Where each item can be found, by item id (or just one item's), sorted by store name. */
async function storesFor(env: Env, itemId?: string) {
  const sql = `SELECT x.item_id, x.store_id, s.name AS store_name, x.location
                 FROM item_stores x JOIN stores s ON s.id = x.store_id
                ${itemId ? "WHERE x.item_id = ?" : ""}
                ORDER BY s.name COLLATE NOCASE`;
  const statement = itemId ? env.DB.prepare(sql).bind(itemId) : env.DB.prepare(sql);
  const { results } = await statement.all<{
    item_id: string;
    store_id: string;
    store_name: string;
    location: string;
  }>();
  const byItem = new Map<string, ItemStore[]>();
  for (const r of results) {
    const list = byItem.get(r.item_id) ?? [];
    list.push({ storeId: r.store_id, storeName: r.store_name, location: r.location });
    byItem.set(r.item_id, list);
  }
  return byItem;
}

const getRow = (env: Env, id: string) =>
  env.DB.prepare(`${SELECT_ITEMS} WHERE i.id = ?`).bind(id).first<ItemRow>();

export async function getItem(env: Env, id: string) {
  const row = await getRow(env, id);
  if (!row) return null;
  const [alternatives, stores] = await Promise.all([alternativesFor(env, id), storesFor(env, id)]);
  return toItem(row, alternatives.get(id) ?? [], stores.get(id) ?? []);
}

async function listItems(env: Env) {
  const { results } = await env.DB.prepare(
    `${SELECT_ITEMS} ORDER BY i.name COLLATE NOCASE`,
  ).all<ItemRow>();
  const [alternatives, stores] = await Promise.all([alternativesFor(env), storesFor(env)]);
  return json(results.map((row) => toItem(row, alternatives.get(row.id) ?? [], stores.get(row.id) ?? [])));
}

function validName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("Name is required");
  if (name.length > MAX_NAME_CHARS) throw new Error(`Name must be ${MAX_NAME_CHARS} characters or fewer`);
  return name;
}

function validDescription(value: unknown) {
  const description = String(value ?? "").trim();
  if (description.length > MAX_DESCRIPTION_CHARS) {
    throw new Error(`Description must be ${MAX_DESCRIPTION_CHARS} characters or fewer`);
  }
  return description;
}

/** Parses the `alternatives` field (a JSON array of item ids) and checks every id is a real item. */
async function validAlternatives(env: Env, value: unknown, selfId: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    throw new Error("Alternatives must be a list of items");
  }
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    throw new Error("Alternatives must be a list of items");
  }
  const ids = [...new Set(parsed as string[])].filter((id) => id !== selfId);
  if (ids.length > MAX_ALTERNATIVES) throw new Error(`Pick at most ${MAX_ALTERNATIVES} alternatives`);
  if (ids.length === 0) return ids;

  const marks = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(`SELECT id FROM items WHERE id IN (${marks})`)
    .bind(...ids)
    .all<{ id: string }>();
  if (results.length !== ids.length) throw new Error("One of those alternatives no longer exists");
  return ids;
}

/**
 * Parses the `stores` field: a JSON array of `{ storeId, location }`. Every store
 * must exist; a store listed twice keeps its last location.
 */
async function validStores(env: Env, value: unknown) {
  const invalid = () => new Error("Stores must be a list of stores with a location for each");
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value ?? "[]"));
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed)) throw invalid();

  const byStore = new Map<string, string>();
  for (const entry of parsed as { storeId?: unknown; location?: unknown }[]) {
    if (!entry || typeof entry.storeId !== "string" || !UUID_RE.test(entry.storeId)) throw invalid();
    const location = String(entry.location ?? "").trim();
    if (location.length > MAX_LOCATION_CHARS) {
      throw new Error(`A location must be ${MAX_LOCATION_CHARS} characters or fewer`);
    }
    byStore.set(entry.storeId, location);
  }
  if (byStore.size > MAX_STORES) throw new Error(`Pick at most ${MAX_STORES} stores`);
  if (byStore.size === 0) return { entries: [], statements: [] };

  const ids = [...byStore.keys()];
  const marks = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(`SELECT id FROM stores WHERE id IN (${marks})`)
    .bind(...ids)
    .all<{ id: string }>();
  if (results.length !== ids.length) throw new Error("One of those stores no longer exists");

  // New location names join the store's list; known ones come back in their stored spelling.
  return prepareLocations(
    env,
    [...byStore].map(([storeId, location]) => ({ storeId, location })),
  );
}

type PlacedStores = Awaited<ReturnType<typeof validStores>>;

const insertStores = (env: Env, itemId: string, stores: { storeId: string; location: string }[]) =>
  stores.map((s) =>
    env.DB.prepare("INSERT INTO item_stores (item_id, store_id, location) VALUES (?, ?, ?)").bind(
      itemId,
      s.storeId,
      s.location,
    ),
  );

const insertAlternatives = (env: Env, itemId: string, ids: string[]) =>
  ids.map((altId) =>
    env.DB.prepare("INSERT INTO item_alternatives (item_id, alternative_id) VALUES (?, ?)").bind(itemId, altId),
  );

async function createItem(request: Request, env: Env) {
  // The "who added it" comes from whoever this device says it is.
  const adder = await currentUser(request, env);
  if (!adder) return error("Choose who you are first, so we know who added this", 400);

  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  const id = crypto.randomUUID();
  let name: string;
  let description: string;
  let alternatives: string[];
  let stores: PlacedStores;
  let photoKey: string | null;
  try {
    name = validName(form.get("name"));
    description = validDescription(form.get("description"));
    alternatives = await validAlternatives(env, form.get("alternatives"), id);
    stores = await validStores(env, form.get("stores"));
    photoKey = await storePhoto(env, form.get("photo"), id, "Photo");
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.batch([
    env.DB.prepare("INSERT INTO items (id, name, description, photo_key, added_by) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      name,
      description,
      photoKey,
      adder.id,
    ),
    ...insertAlternatives(env, id, alternatives),
    ...stores.statements,
    ...insertStores(env, id, stores.entries),
  ]);

  return json((await getItem(env, id))!, 201);
}

async function updateItem(request: Request, env: Env, id: string) {
  const existing = await getRow(env, id);
  if (!existing) return error("Item not found", 404);

  const form = await readForm(request);
  if (!form) return error("Invalid form data", 400);

  let name = existing.name;
  let description = existing.description;
  let alternatives: string[] | null = null;
  let stores: PlacedStores | null = null;
  let photoKey = existing.photo_key;
  try {
    if (form.has("name")) name = validName(form.get("name"));
    if (form.has("description")) description = validDescription(form.get("description"));
    if (form.has("alternatives")) alternatives = await validAlternatives(env, form.get("alternatives"), id);
    if (form.has("stores")) stores = await validStores(env, form.get("stores"));
    photoKey = (await storePhoto(env, form.get("photo"), id, "Photo")) ?? photoKey;
  } catch (e) {
    return error((e as Error).message, 400);
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE items
          SET name = ?, description = ?, photo_key = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`,
    ).bind(name, description, photoKey, id),
    ...(alternatives
      ? [
          env.DB.prepare("DELETE FROM item_alternatives WHERE item_id = ?").bind(id),
          ...insertAlternatives(env, id, alternatives),
        ]
      : []),
    ...(stores
      ? [
          env.DB.prepare("DELETE FROM item_stores WHERE item_id = ?").bind(id),
          ...stores.statements,
          ...insertStores(env, id, stores.entries),
        ]
      : []),
  ]);

  if (existing.photo_key && photoKey !== existing.photo_key) await env.PHOTOS.delete(existing.photo_key);

  return json((await getItem(env, id))!);
}

/**
 * Deletes an item. If other items list it as an acceptable alternative, answers
 * 409 with those items unless the caller confirms with `?force=true`; the links
 * are removed along with the item.
 */
async function deleteItem(request: Request, env: Env, id: string) {
  const row = await getRow(env, id);
  if (!row) return error("Item not found", 404);

  const { results: usedBy } = await env.DB.prepare(
    `SELECT i.id, i.name
       FROM item_alternatives a JOIN items i ON i.id = a.item_id
      WHERE a.alternative_id = ?
      ORDER BY i.name COLLATE NOCASE`,
  )
    .bind(id)
    .all<{ id: string; name: string }>();

  const force = new URL(request.url).searchParams.get("force") === "true";
  if (usedBy.length > 0 && !force) {
    return json({ error: `${row.name} is an acceptable alternative for other items`, usedBy }, 409);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_alternatives WHERE item_id = ? OR alternative_id = ?").bind(id, id),
    env.DB.prepare("DELETE FROM list_entries WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM item_stores WHERE item_id = ?").bind(id),
    env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id),
  ]);
  if (row.photo_key) await env.PHOTOS.delete(row.photo_key);

  return new Response(null, { status: 204 });
}

/**
 * Sets where one item is found in one store (adding it to the store if it wasn't
 * there), without touching its other stores. Body: `{ "location": "Aisle 12" }`.
 */
async function setItemStore(request: Request, env: Env, itemId: string, storeId: string) {
  let body: { location?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid request", 400);
  }
  const location = String(body?.location ?? "").trim();
  if (location.length > MAX_LOCATION_CHARS) {
    return error(`A location must be ${MAX_LOCATION_CHARS} characters or fewer`, 400);
  }

  if (!(await getRow(env, itemId))) return error("Item not found", 404);
  if (!(await env.DB.prepare("SELECT 1 FROM stores WHERE id = ?").bind(storeId).first())) {
    return error("Store not found", 404);
  }

  // A new location name joins the store's list; a known one is stored in its saved spelling.
  const prepared = await prepareLocations(env, [{ storeId, location }]);
  await env.DB.batch([
    ...prepared.statements,
    env.DB.prepare(
      `INSERT INTO item_stores (item_id, store_id, location) VALUES (?, ?, ?)
       ON CONFLICT (item_id, store_id) DO UPDATE SET location = excluded.location`,
    ).bind(itemId, storeId, prepared.entries[0].location),
  ]);

  return json((await getItem(env, itemId))!);
}

/** Says an item isn't sold at a store. Harmless to repeat. */
async function removeItemStore(env: Env, itemId: string, storeId: string) {
  if (!(await getRow(env, itemId))) return error("Item not found", 404);
  await env.DB.prepare("DELETE FROM item_stores WHERE item_id = ? AND store_id = ?").bind(itemId, storeId).run();
  return json((await getItem(env, itemId))!);
}

const methodNotAllowed = () => error("Method not allowed", 405);

/** Returns a response for item routes, or null if the path isn't one of them. */
export async function handleItems(request: Request, env: Env, path: string) {
  const { method } = request;

  if (path === "/api/items") {
    if (method === "GET") return listItems(env);
    if (method === "POST") return createItem(request, env);
    return methodNotAllowed();
  }

  const placed = path.match(/^\/api\/items\/([0-9a-f-]{36})\/stores\/([0-9a-f-]{36})$/);
  if (placed) {
    if (method === "PUT") return setItemStore(request, env, placed[1], placed[2]);
    if (method === "DELETE") return removeItemStore(env, placed[1], placed[2]);
    return methodNotAllowed();
  }

  const match = path.match(/^\/api\/items\/([0-9a-f-]{36})$/);
  if (match) {
    const id = match[1];
    if (method === "GET") {
      const item = await getItem(env, id);
      return item ? json(item) : error("Item not found", 404);
    }
    if (method === "PATCH") return updateItem(request, env, id);
    if (method === "DELETE") return deleteItem(request, env, id);
    return methodNotAllowed();
  }

  return null;
}
