import { useState } from "react";
import type { Item } from "../../shared/types";
import { api } from "../api";

interface Props {
  item: Item;
  /** Called with the updated item once the quantity has been saved. */
  onSaved: (updated: Item) => void;
  onError: (message: string) => void;
}

/** An optional "how many" note for an item on the list. Saves when you leave the box or press Enter. */
export default function QuantityInput({ item, onSaved, onError }: Props) {
  const saved = item.list?.quantity ?? "";
  const [text, setText] = useState(saved);

  async function save() {
    const next = text.trim();
    setText(next);
    if (next === saved) return;
    try {
      onSaved(await api.setListQuantity(item.id, next));
    } catch (e) {
      setText(saved);
      onError((e as Error).message);
    }
  }

  return (
    <input
      type="text"
      className="list-qty"
      value={text}
      maxLength={40}
      placeholder="Quantity (optional)"
      aria-label={`Quantity of ${item.name} (optional)`}
      enterKeyHint="done"
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
