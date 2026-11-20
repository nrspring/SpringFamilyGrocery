import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item, Store } from "../../shared/types";
import { api } from "../api";
import Avatar from "../components/Avatar";
import ItemThumb from "../components/ItemThumb";
import LocationEditor from "../components/LocationEditor";
import { useLongPress } from "../useLongPress";

// Remembered per device, so the phone in the store stays on that store.
const STORE_KEY = "sfg_list_store";

function savedStoreId() {
  try {
    return localStorage.getItem(STORE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function List() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState(savedStoreId);
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const longPress = useLongPress();

  const load = useCallback(async () => {
    try {
      const [loadedItems, loadedStores] = await Promise.all([api.listItems(), api.listStores()]);
      setItems(loadedItems);
      setStores(loadedStores);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const names = useMemo(() => new Map(items?.map((i) => [i.id, i.name])), [items]);
  const onList = useMemo(() => items?.filter((i) => i.list) ?? [], [items]);
  // A remembered store that has since been deleted simply means none is chosen.
  const store = stores.find((s) => s.id === storeId) ?? null;

  function chooseStore(id: string) {
    setStoreId(id);
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      /* private window or blocked storage: the choice just won't stick */
    }
  }

  async function remove(item: Item) {
    setBusyId(item.id);
    setError("");
    try {
      await api.removeFromList(item.id);
      // Drop it from view right away; the rest of the list stays as it was.
      setItems((all) => all?.map((i) => (i.id === item.id ? { ...i, list: null } : i)) ?? all);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h1>List</h1>
        <Link to="/items" className="button-link">
          Add items
        </Link>
      </div>

      {items && stores.length > 0 && (
        <div className="store-picker">
          <label htmlFor="list-store">Shopping at</label>
          <select id="list-store" value={store?.id ?? ""} onChange={(e) => chooseStore(e.target.value)}>
            <option value="">Choose a store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="muted small-text">
            {store
              ? `Press and hold an item to set where it is in ${store.name}.`
              : "Choose a store to see where each item is."}
          </p>
        </div>
      )}
      {items && stores.length === 0 && onList.length > 0 && (
        <p className="muted small-text store-picker">
          Add a store on the <Link to="/stores">Stores</Link> screen to see where each item is.
        </p>
      )}

      {onList.length > 0 && <p className="muted list-count">{onList.length} to get</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {items === null && !error && <p className="muted">Loading…</p>}
      {items && onList.length === 0 && (
        <p className="muted">
          Nothing on the list yet. Tap the ☆ next to an item on the <Link to="/items">Items</Link> page
          to add it.
        </p>
      )}

      <ul className="user-list">
        {onList.map((i) => {
          const here = store ? i.stores.find((s) => s.storeId === store.id) : undefined;
          return (
            <li
              key={i.id}
              className={`user-row item-row${store ? " pressable" : ""}`}
              {...(store ? longPress(() => setEditing(i)) : {})}
            >
              <ItemThumb name={i.name} photoUrl={i.photoUrl} />
              <div className="item-info">
                <div className="item-title">
                  <strong>{i.name}</strong>
                </div>
                {i.description && <p className="item-desc">{i.description}</p>}
                {store && (
                  <p className={`item-place${here?.location ? "" : " unset"}`}>
                    <span aria-hidden>📍</span>{" "}
                    {here ? here.location || "No location yet" : `Not set for ${store.name}`}
                  </p>
                )}
                {i.alternativeIds.length > 0 && (
                  <p className="item-alts">
                    Alternatives: {i.alternativeIds.map((id) => names.get(id) ?? "(missing)").join(", ")}
                  </p>
                )}
                {i.list?.addedBy && (
                  <p className="item-added">
                    <Avatar
                      name={i.list.addedBy.name}
                      color={i.list.addedBy.color}
                      photoUrl={i.list.addedBy.photoUrl}
                      size={16}
                    />
                    Added by {i.list.addedBy.name}
                  </p>
                )}
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  className="secondary small"
                  disabled={busyId === i.id}
                  onClick={() => remove(i)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && store && (
        <LocationEditor
          // Remount per item so the typed text never leaks between edits.
          key={editing.id}
          item={editing}
          store={store}
          onCancel={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((all) => all?.map((i) => (i.id === updated.id ? updated : i)) ?? all);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
