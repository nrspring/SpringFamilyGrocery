import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Item, Store } from "../../shared/types";
import { api } from "../api";

interface Props {
  item: Item;
  store: Store;
  /** Called with the item as the server now has it. */
  onSaved: (item: Item) => void;
  onCancel: () => void;
}

/** A small dialog for saying where one item is in one store. */
export default function LocationEditor({ item, store, onSaved, onCancel }: Props) {
  const current = item.stores.find((s) => s.storeId === store.id);
  const [location, setLocation] = useState(current?.location ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The finger that opened this may still be down; ignore backdrop taps for a moment.
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await api.setItemLocation(item.id, store.id, location.trim()));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="overlay"
      onClick={() => Date.now() - openedAt.current > 400 && !busy && onCancel()}
    >
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} in ${store.name}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <h2>{item.name}</h2>
        <p className="added-by">
          Where is it in <strong>{store.name}</strong>?
        </p>

        <label htmlFor="item-location">Location</label>
        <input
          id="item-location"
          value={location}
          maxLength={60}
          placeholder="e.g. Aisle 12"
          onChange={(e) => setLocation(e.target.value)}
        />
        {!current && (
          <p className="muted small-text">
            This item isn't set for {store.name} yet. Saving adds it there.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
