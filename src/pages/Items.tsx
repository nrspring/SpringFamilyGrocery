import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, User } from "../../shared/types";
import { api } from "../api";
import Avatar from "../components/Avatar";
import ItemForm from "../components/ItemForm";
import ItemThumb from "../components/ItemThumb";

export default function Items({ user }: { user: User | null }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function toggleActive(item: Item) {
    setBusyId(item.id);
    setError("");
    try {
      await api.updateItem(item.id, { active: !item.active });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
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

      <ul className="user-list">
        {items?.map((i) => (
          <li key={i.id} className={`user-row item-row${i.active ? "" : " disabled"}`}>
            <ItemThumb name={i.name} photoUrl={i.photoUrl} />
            <div className="item-info">
              <div className="item-title">
                <strong>{i.name}</strong>
                {!i.active && <span className="badge">Disabled</span>}
              </div>
              {i.description && <p className="item-desc">{i.description}</p>}
              {i.alternativeIds.length > 0 && (
                <p className="item-alts">
                  Or:{" "}
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
              <button
                type="button"
                className="secondary small"
                disabled={busyId === i.id}
                onClick={() => toggleActive(i)}
              >
                {i.active ? "Disable" : "Enable"}
              </button>
            </div>
          </li>
        ))}
      </ul>

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
