import { useEffect, useRef } from "react";
import type { Item } from "../../shared/types";
import ItemThumb from "./ItemThumb";

interface Props {
  item: Item;
  onClose: () => void;
}

/** A big look at an item's picture. Tap anywhere, or press Close, to dismiss. */
export default function PhotoViewer({ item, onClose }: Props) {
  // The finger that opened this may still be down; ignore taps for a moment.
  const openedAt = useRef(Date.now());
  const close = () => Date.now() - openedAt.current > 400 && onClose();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={close}>
      <div
        className="sheet location-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={close}
      >
        {item.photoUrl ? (
          <img className="location-photo" src={item.photoUrl} alt={item.name} />
        ) : (
          <div className="location-photo-empty">
            <ItemThumb name={item.name} photoUrl={null} size={160} />
          </div>
        )}
        <h2>{item.name}</h2>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
