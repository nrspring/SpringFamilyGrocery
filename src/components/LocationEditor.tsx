import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Item, Store } from "../../shared/types";
import { api } from "../api";

interface Props {
  item: Item;
  /** The store chosen on the List. */
  store: Store;
  /** Called with the item as the server now has it. */
  onSaved: (item: Item) => void;
  onCancel: () => void;
}

/** A dialog for saying where one item is in the store chosen on the List. */
export default function LocationEditor({ item, store, onSaved, onCancel }: Props) {
  const [location, setLocation] = useState(
    item.stores.find((s) => s.storeId === store.id)?.location ?? "",
  );
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
        className="sheet location-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} in ${store.name}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        {item.photoUrl && <img className="location-photo" src={item.photoUrl} alt={item.name} />}
        <h2>{item.name}</h2>

        <div className="location-field">
          <label htmlFor="item-location">Where is it in {store.name}?</label>
          <input
            id="item-location"
            value={location}
            maxLength={60}
            placeholder="e.g. Aisle 12"
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

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
