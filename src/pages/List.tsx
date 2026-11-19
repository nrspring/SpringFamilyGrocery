import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../../shared/types";
import { api } from "../api";
import Avatar from "../components/Avatar";
import ItemThumb from "../components/ItemThumb";

export default function List() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
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
  const onList = useMemo(() => items?.filter((i) => i.list) ?? [], [items]);

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
        {onList.length > 0 && <span className="muted">{onList.length} to get</span>}
      </div>

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
        {onList.map((i) => (
          <li key={i.id} className="user-row item-row">
            <ItemThumb name={i.name} photoUrl={i.photoUrl} />
            <div className="item-info">
              <div className="item-title">
                <strong>{i.name}</strong>
              </div>
              {i.description && <p className="item-desc">{i.description}</p>}
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
        ))}
      </ul>
    </section>
  );
}
