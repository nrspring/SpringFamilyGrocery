import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, User } from "../../shared/types";
import { ApiError, api } from "../api";
import Avatar from "../components/Avatar";
import ItemForm from "../components/ItemForm";
import ItemThumb from "../components/ItemThumb";

export default function Items({ user }: { user: User | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [deleting, setDeleting] = useState<{
    item: Item;
    usedBy: string[];
    busy: boolean;
    error: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.listItems());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const names = useMemo(() => new Map(items?.map((i) => [i.id, i.name])), [items]);

  // Every word typed must appear in the name or description, in any order.
  const visible = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!items || words.length === 0) return items;
    return items.filter((i) => {
      const text = `${i.name} ${i.description}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [items, search]);

  /** Items that list `item` as an acceptable alternative, as far as we know right now. */
  function usedBy(item: Item) {
    return items?.filter((i) => i.alternativeIds.includes(item.id)).map((i) => i.name) ?? [];
  }

  function askDelete(item: Item) {
    setError("");
    setDeleting({ item, usedBy: usedBy(item), busy: false, error: "" });
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { item, usedBy: warned } = deleting;
    setDeleting({ ...deleting, busy: true, error: "" });
    try {
      // Only override the server's warning once the person has seen it.
      await api.deleteItem(item.id, warned.length > 0);
      setDeleting(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body.usedBy)) {
        // Another device linked it since this list loaded: show the warning now.
        const names = (e.body.usedBy as { name: string }[]).map((u) => u.name);
        setDeleting({ item, usedBy: names, busy: false, error: "" });
      } else {
        setDeleting({ item, usedBy: warned, busy: false, error: (e as Error).message });
      }
    }
  }

  return (
    <section>
      <div className="section-head">
        <h1>Items</h1>
        <button type="button" onClick={() => setEditing("new")}>
          Add item
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">No items yet. Add the first one!</p>}

      {items && items.length > 0 && (
        <div className="search-row">
          <input
            type="search"
            className="search"
            value={search}
            placeholder="Search name or description"
            aria-label="Search items by name or description"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {visible && visible.length === 0 && items && items.length > 0 && (
        <p className="muted">No items match “{search.trim()}”.</p>
      )}

      <ul className="user-list">
        {visible?.map((i) => (
          <li key={i.id} className="user-row item-row">
            <ItemThumb name={i.name} photoUrl={i.photoUrl} />
            <div className="item-info">
              <div className="item-title">
                <strong>{i.name}</strong>
              </div>
              {i.description && <p className="item-desc">{i.description}</p>}
              {i.alternativeIds.length > 0 && (
                <p className="item-alts">
                  Alternatives:{" "}
                  {i.alternativeIds.map((id) => names.get(id) ?? "(missing)").join(", ")}
                </p>
              )}
              {i.addedBy && (
                <p className="item-added">
                  <Avatar
                    name={i.addedBy.name}
                    color={i.addedBy.color}
                    photoUrl={i.addedBy.photoUrl}
                    size={16}
                  />
                  Added by {i.addedBy.name}
                </p>
              )}
            </div>
            <div className="row-actions">
              <button type="button" className="secondary small" onClick={() => setEditing(i)}>
                Edit
              </button>
              <button type="button" className="secondary small danger" onClick={() => askDelete(i)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {deleting && (
        <div className="overlay" onClick={() => !deleting.busy && setDeleting(null)}>
          <div
            className="sheet"
            role="alertdialog"
            aria-modal="true"
            aria-label={`Delete ${deleting.item.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete {deleting.item.name}?</h2>
            {deleting.usedBy.length > 0 && (
              <p className="warning" role="alert">
                <strong>Heads up:</strong> {deleting.usedBy.join(", ")}{" "}
                {deleting.usedBy.length === 1 ? "lists" : "list"} {deleting.item.name} as an acceptable
                alternative. Deleting it takes it off{" "}
                {deleting.usedBy.length === 1 ? "that list" : "those lists"}.
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

      {editing && items && (
        <ItemForm
          // Remount per item so form state never leaks between edits.
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? undefined : editing}
          items={items}
          user={user}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </section>
  );
}
