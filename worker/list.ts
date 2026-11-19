import type { Env } from "./env";
import { error, json } from "./http";
import { getItem } from "./items";
import { currentUser } from "./me";

// The shared shopping list. Whether an item is on it comes back as `item.list`
// on the item itself (see items.ts), so these routes only add and remove.

/** Puts an item on the list. Doing it twice is harmless. */
async function addToList(request: Request, env: Env, itemId: string) {
  const user = await currentUser(request, env);
  if (!user) return error("Choose who you are first, so we know who added this", 400);
  if (!(await getItem(env, itemId))) return error("Item not found", 404);

  await env.DB.prepare("INSERT OR IGNORE INTO list_entries (item_id, added_by) VALUES (?, ?)")
    .bind(itemId, user.id)
    .run();
  return json((await getItem(env, itemId))!);
}

/** Takes an item off the list. Doing it twice is harmless. */
async function removeFromList(env: Env, itemId: string) {
  if (!(await getItem(env, itemId))) return error("Item not found", 404);

  await env.DB.prepare("DELETE FROM list_entries WHERE item_id = ?").bind(itemId).run();
  return json((await getItem(env, itemId))!);
}

/** Returns a response for list routes, or null if the path isn't one of them. */
export async function handleList(request: Request, env: Env, path: string) {
  const match = path.match(/^\/api\/list\/([0-9a-f-]{36})$/);
  if (!match) return null;

  const itemId = match[1];
  if (request.method === "PUT") return addToList(request, env, itemId);
  if (request.method === "DELETE") return removeFromList(env, itemId);
  return error("Method not allowed", 405);
}
