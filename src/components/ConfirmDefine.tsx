import { useEffect, useRef } from "react";
import type { Item, Store } from "../../shared/types";

interface Props {
  item: Item;
  store: Store;
  /** The person wants to say where it is in this store. */
  onYes: () => void;
  onCancel: () => void;
}

/** Shown when you press and hold an item that hasn't been placed in the chosen store yet. */
export default function ConfirmDefine({ item, store, onYes, onCancel }: Props) {
  // The finger that opened this may still be down; ignore backdrop taps for a moment.
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="overlay" onClick={() => Date.now() - openedAt.current > 400 && onCancel()}>
      <div
        className="sheet location-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={`${item.name} isn't set up for ${store.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{item.name}</h2>
        <p className="confirm-text">
          This item isn't set up for <strong>{store.name}</strong> yet. Do you want to define it for{" "}
          {store.name}?
        </p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Not now
          </button>
          <button type="button" onClick={onYes}>
            Yes, define it
          </button>
        </div>
      </div>
    </div>
  );
}
