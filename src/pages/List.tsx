import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item, Store } from "../../shared/types";
import { api } from "../api";
import ItemThumb from "../components/ItemThumb";
import ConfirmDefine from "../components/ConfirmDefine";
import LocationEditor from "../components/LocationEditor";
import PhotoViewer from "../components/PhotoViewer";
import { METERS_PER_MILE, currentPosition, distanceMeters, formatDistance } from "../geo";
import { useLongPress } from "../useLongPress";

/** "Find my store" only picks a store that is this close: a quarter mile. */
const NEAR_METERS = METERS_PER_MILE / 4;

export default function List() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  // Deliberately not remembered: the List always opens with no store chosen.
  const [storeId, setStoreId] = useState("");
  // Press and hold: edits the item's location when a store is chosen, otherwise shows its picture.
  const [editing, setEditing] = useState<Item | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [asking, setAsking] = useState<Item | null>(null);
  const [finding, setFinding] = useState(false);
  // The outcome of the last "find my store" press, shown where the usual hint goes.
  const [found, setFound] = useState<{ ok: boolean; text: string } | null>(null);
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

  // With a store chosen, list items in the order you walk it: by their place's position in the
  // store, then by name. Items with no place there go last.
  const sorted = useMemo(() => {
    if (!store) return onList;
    const rank = new Map(store.locations.map((l, i) => [l.name.toLowerCase(), i]));
    const rankOf = (item: Item) => {
      const place = item.stores.find((s) => s.storeId === store.id)?.location;
      return place ? (rank.get(place.toLowerCase()) ?? Infinity) : Infinity;
    };
    return [...onList].sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [onList, store]);

  /** Checks where the phone is and picks the closest store if it's within a quarter mile. */
  async function findStore() {
    setFinding(true);
    setFound(null);
    try {
      const here = await currentPosition();
      const ranked = stores
        .flatMap((s) =>
          s.latitude === null || s.longitude === null
            ? []
            : [{ store: s, meters: distanceMeters(here.latitude, here.longitude, s.latitude, s.longitude) }],
        )
        .sort((a, b) => a.meters - b.meters);

      const nearest = ranked[0];
      if (!nearest) {
        setFound({ ok: false, text: "No store has a location yet. Record one on the Stores screen." });
      } else if (nearest.meters <= NEAR_METERS) {
        setStoreId(nearest.store.id);
        setFound({ ok: true, text: `You're at ${nearest.store.name} (about ${formatDistance(nearest.meters)} away).` });
      } else {
        setFound({
          ok: false,
          text: `No store within ¼ mile. The nearest is ${nearest.store.name}, ${formatDistance(nearest.meters)} away.`,
        });
      }
    } catch (e) {
      setFound({ ok: false, text: (e as Error).message });
    } finally {
      setFinding(false);
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
          <div className="store-pick-row">
            <select
              id="list-store"
              value={store?.id ?? ""}
              onChange={(e) => {
                setFound(null);
                setStoreId(e.target.value);
              }}
            >
              <option value="">Choose a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary locate"
              disabled={finding}
              aria-label="Find the store I'm at"
              title="Find the store I'm at"
              onClick={findStore}
            >
              {finding ? "…" : "📍"}
            </button>
          </div>
          {found ? (
            <p className={`small-text ${found.ok ? "geo-ok" : "muted"}`} role="status">
              {found.text}
            </p>
          ) : (
            <p className="muted small-text">
              {store
                ? `Press and hold an item to set where it is in ${store.name}.`
                : "Choose a store to see where each item is. Press and hold an item for a bigger picture."}
            </p>
          )}
        </div>
      )}
      {items && stores.length === 0 && onList.length > 0 && (
        <p className="muted small-text store-picker">
          Add a store on the <Link to="/stores">Stores</Link> screen to say where each item is.
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
        {sorted.map((i) => {
          const here = store ? i.stores.find((s) => s.storeId === store.id) : undefined;
          return (
            <li
              key={i.id}
              className="user-row item-row list-item pressable"
              {...longPress(() => {
                if (!store) setViewing(i);
                // An item that isn't set up for this store yet asks first, so a stray press
                // doesn't quietly add it there.
                else if (i.stores.some((s) => s.storeId === store.id)) setEditing(i);
                else setAsking(i);
              })}
            >
              <ItemThumb name={i.name} photoUrl={i.photoUrl} />
              <div className="item-info">
                <div className="item-title">
                  <strong>{i.name}</strong>
                </div>
                {i.description && <p className="item-desc">{i.description}</p>}
                {/* Locations only appear once a store is chosen. */}
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

      {viewing && <PhotoViewer item={viewing} onClose={() => setViewing(null)} />}

      {asking && store && (
        <ConfirmDefine
          item={asking}
          store={store}
          onCancel={() => setAsking(null)}
          onYes={() => {
            setEditing(asking);
            setAsking(null);
          }}
        />
      )}

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
            // A location typed for the first time is now one of the store's choices.
            api.listStores().then(setStores, () => {});
          }}
        />
      )}
    </section>
  );
}
