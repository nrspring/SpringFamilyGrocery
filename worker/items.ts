import type { Item } from "../shared/types";
import type { Env } from "./env";
import { error, json } from "./http";
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
}

const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_ALTERNATIVES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SELECT_ITEMS = `
  SELECT i.*, u.name AS adder_name, u.color AS adder_color, u.photo_key AS adder_photo_key
    FROM items i
    LEFT JOIN users u ON u.id = i.added_by`;

function toItem(row: ItemRow, alternativeIds: string[]): Item {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    photoUrl: row.photo_key ? `/api/images/${row.photo_key}` : null,
    addedBy:
      row.added_by && row.adder_name !== null
        ? {
            id: row.added_by,
            name: row.adder_name,
            color: row.adder_color ?? "#888888",
            photoUrl: row.adder_photo_key ? `/api/images/${row.adder_photo_key}` : null,
          }
        : null,
    alternativeIds,
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

const getRow = (env: Env, id: string) =>
  env.DB.prepare(`${SELECT_ITEMS} WHERE i.id = ?`).bind(id).first<ItemRow>();

async function getItem(env: Env, id: string) {
  const row = await getRow(env, id);
  if (!row) return null;
  return toItem(row, (await alternativesFor(env, id)).get(id) ?? []);
}

async function listItems(env: Env) {
  const { results } = await env.DB.prepare(
    `${SELECT_ITEMS} ORDER BY i.name COLLATE NOCASE`,
  ).all<ItemRow>();
  const alternatives = await alternativesFor(env);
  return json(results.map((row) => toItem(row, alternatives.get(row.id) ?? [])));
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
  let photoKey: string | null;
  try {
    name = validName(form.get("name"));
    description = validDescription(form.get("description"));
    alternatives = await validAlternatives(env, form.get("alternatives"), id);
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
  let photoKey = existing.photo_key;
  try {
    if (form.has("name")) name = validName(form.get("name"));
    if (form.has("description")) description = validDescription(form.get("description"));
    if (form.has("alternatives")) alternatives = await validAlternatives(env, form.get("alternatives"), id);
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
    env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id),
  ]);
  if (row.photo_key) await env.PHOTOS.delete(row.photo_key);

  return new Response(null, { status: 204 });
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
