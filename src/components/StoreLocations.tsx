import type { ItemStore } from "../../shared/types";

/** One line per store an item is sold at: "Kroger · Aisle 12". Renders nothing for an item with no stores. */
export default function StoreLocations({ stores }: { stores: ItemStore[] }) {
  if (stores.length === 0) return null;
  return (
    <ul className="item-stores" aria-label="Where to find it">
      {stores.map((s) => (
        <li key={s.storeId}>
          <span aria-hidden>🏪</span> <strong>{s.storeName}</strong>
          {s.location && <> · {s.location}</>}
        </li>
      ))}
    </ul>
  );
}
