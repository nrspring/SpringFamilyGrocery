import { useCallback, useEffect, useState } from "react";
import type { Store } from "../../shared/types";
import { ApiError, api } from "../api";
import ItemThumb from "../components/ItemThumb";
import StoreForm from "../components/StoreForm";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function Stores() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Store | "new" | null>(null);
  const [deleting, setDeleting] = useState<{
    store: Store;
    /** How many items will lose their location here; the server's count wins if it differs. */
    itemCount: number;
    busy: boolean;
    error: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setStores(await api.listStores());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function askDelete(store: Store) {
    setError("");
    setDeleting({ store, itemCount: store.itemCount, busy: false, error: "" });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { store, itemCount: warned } = deleting;
    setDeleting({ ...deleting, busy: true, error: "" });
    try {
      // Only override the server's warning once the person has seen it.
      await api.deleteStore(store.id, warned > 0);
      setDeleting(null);
      setEditing(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body.items)) {
        // Another device put items here since this list loaded: show the warning now.
        setDeleting({ store, itemCount: e.body.items.length, busy: false, error: "" });
      } else {
        setDeleting({ store, itemCount: warned, busy: false, error: (e as Error).message });
      }
    }
  }

  return (
    <section>
      <div className="section-head">
        <h1>Stores</h1>
        <button type="button" onClick={() => setEditing("new")}>
          Add store
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {stores === null && !error && <p className="muted">Loading…</p>}
      {stores?.length === 0 && <p className="muted">No stores yet. Add the first one!</p>}

      <ul className="user-list">
        {stores?.map((s) => (
          <li key={s.id} className="user-row item-row">
            <ItemThumb name={s.name} photoUrl={s.photoUrl} />
            <div className="item-info">
              <div className="item-title">
                <strong>{s.name}</strong>
              </div>
              {s.latitude !== null && s.longitude !== null ? (
                <p className="item-desc">
                  {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)} ·{" "}
                  <a
                    href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Map
                  </a>
                </p>
              ) : (
                <p className="item-desc">No location recorded yet</p>
              )}
              <p className="item-alts">{plural(s.itemCount, "item")}</p>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary small" onClick={() => setEditing(s)}>
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <StoreForm
          // Remount per store so form state never leaks between edits.
          key={editing === "new" ? "new" : editing.id}
          store={editing === "new" ? undefined : editing}
          // While the delete confirmation is up on top, the form behind it stays put.
          blocked={deleting !== null}
          onDelete={editing === "new" ? undefined : () => askDelete(editing)}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {/* After the form in the page so it stacks on top when opened from it. */}
      {deleting && (
        <div className="overlay" onClick={() => !deleting.busy && setDeleting(null)}>
          <div
            className="sheet"
            role="alertdialog"
            aria-modal="true"
            aria-label={`Delete ${deleting.store.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete {deleting.store.name}?</h2>
            {deleting.itemCount > 0 && (
              <p className="warning" role="alert">
                <strong>Heads up:</strong> {plural(deleting.itemCount, "item")}{" "}
                {deleting.itemCount === 1 ? "is" : "are"} located in {deleting.store.name}. Deleting it
                removes {deleting.itemCount === 1 ? "that location" : "those locations"} from{" "}
                {deleting.itemCount === 1 ? "the item" : "the items"}.{" "}
                {deleting.itemCount === 1 ? "The item itself stays" : "The items themselves stay"}.
              </p>
            )}
            <p className="muted">This can't be undone.</p>
            {deleting.error && (
              <p className="error" role="alert">
                {deleting.error}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={deleting.busy}
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button type="button" className="danger-fill" disabled={deleting.busy} onClick={confirmDelete}>
                {deleting.busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
