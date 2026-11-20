import type { Env } from "./env";

export const MAX_LOCATION_CHARS = 60;

interface Placement {
  storeId: string;
  location: string;
}

/**
 * Makes sure every non-blank location in `entries` is one of its store's defined
 * locations. A name that matches an existing one (ignoring case) is rewritten to the
 * stored spelling; a new one gets an insert statement that adds it to the end of that
 * store's order. Run the statements in the same batch as the item write.
 */
export async function prepareLocations(env: Env, entries: Placement[]) {
  const wanted = entries.filter((e) => e.location !== "");
  const known = new Map<string, string>();

  const storeIds = [...new Set(wanted.map((e) => e.storeId))];
  if (storeIds.length > 0) {
    const marks = storeIds.map(() => "?").join(", ");
    const { results } = await env.DB.prepare(
      `SELECT store_id, name FROM store_locations WHERE store_id IN (${marks})`,
    )
      .bind(...storeIds)
      .all<{ store_id: string; name: string }>();
    for (const r of results) known.set(`${r.store_id}|${r.name.toLowerCase()}`, r.name);
  }

  const statements: D1PreparedStatement[] = [];
  const queued = new Set<string>();
  const resolved = entries.map((e) => {
    if (e.location === "") return e;
    const key = `${e.storeId}|${e.location.toLowerCase()}`;
    const existing = known.get(key);
    if (existing) return { ...e, location: existing };
    if (!queued.has(key)) {
      queued.add(key);
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO store_locations (id, store_id, name, position)
           VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM store_locations WHERE store_id = ?))`,
        ).bind(crypto.randomUUID(), e.storeId, e.location, e.storeId),
      );
    }
    return e;
  });

  return { entries: resolved, statements };
}
