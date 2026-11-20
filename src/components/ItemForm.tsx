import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Item, Store, User } from "../../shared/types";
import { api } from "../api";
import ItemThumb from "./ItemThumb";
import PhotoCropper from "./PhotoCropper";

interface Props {
  /** The item being edited, or undefined when adding a new one. */
  item?: Item;
  /** Every item, so acceptable alternatives can be picked from them. */
  items: Item[];
  /** Every store, so the item can be placed in the ones that sell it. */
  stores: Store[];
  /** Who this device is; they become the item's "added by" when it is new. */
  user: User | null;
  /** Present when editing: asks the parent to confirm and delete this item. */
  onDelete?: () => void;
  /** True while something is open on top of the form, so Escape should leave the form alone. */
  blocked?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ItemForm({ item, items, stores, user, onDelete, blocked, onSaved, onCancel }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [alternativeIds, setAlternativeIds] = useState<Set<string>>(new Set(item?.alternativeIds));
  // The stores that sell this item (by id) and where to find it in each. A store being in the
  // map is what "sold here" means; its value may be empty.
  const [locations, setLocations] = useState<Map<string, string>>(
    () => new Map(item?.stores.map((s) => [s.storeId, s.location])),
  );
  const [search, setSearch] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // The picked photo waiting to be positioned in the cropper.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    // While the cropper or the delete confirmation is open, Escape belongs to it.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !cropFile && !blocked && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, cropFile, blocked]);

  // Any other item can be picked.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => i.id !== item?.id && (!q || i.name.toLowerCase().includes(q)));
  }, [items, item?.id, search]);

  function toggleAlternative(id: string) {
    setAlternativeIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleStore(id: string) {
    setLocations((prev) => {
      const next = new Map(prev);
      if (!next.delete(id)) next.set(id, "");
      return next;
    });
  }

  function setLocation(id: string, location: string) {
    setLocations((prev) => new Map(prev).set(id, location));
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the input so picking the same photo again still fires a change.
    e.target.value = "";
    if (!file) return;
    setError("");
    setCropFile(file);
  }

  function onCropped(blob: Blob) {
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
    setCropFile(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        alternativeIds: [...alternativeIds],
        stores: [...locations].map(([storeId, location]) => ({ storeId, location })),
        photo,
      };
      if (item) await api.updateItem(item.id, input);
      else await api.createItem(input);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const adder = item ? item.addedBy : user;

  return (
    <>
      <div className="overlay" onClick={onCancel}>
        <form
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={item ? "Edit item" : "Add item"}
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
        >
          <h2>{item ? "Edit item" : "Add item"}</h2>
          <p className="added-by">
            Added by <strong>{adder?.name ?? "unknown"}</strong>
            {!item && !user && " (choose who you are first)"}
          </p>

          <div className="photo-row">
            <ItemThumb name={name} photoUrl={preview ?? item?.photoUrl ?? null} size={88} />
            <div className="photo-actions">
              <button
                type="button"
                className="secondary small"
                onClick={() => cameraInput.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className="secondary small"
                onClick={() => libraryInput.current?.click()}
              >
                {preview || item?.photoUrl ? "Choose another" : "Choose photo"}
              </button>
            </div>
            {/* `capture` opens the back camera on phones; other devices show a file picker. */}
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
              hidden
            />
            <input ref={libraryInput} type="file" accept="image/*" onChange={onFile} hidden />
          </div>

          <label htmlFor="item-name">Name</label>
          <input
            id="item-name"
            value={name}
            maxLength={80}
            // A new item starts typing right away; editing one shouldn't pop the keyboard up over it.
            autoFocus={!item}
            onChange={(e) => setName(e.target.value)}
          />

          <label htmlFor="item-description">Description</label>
          <textarea
            id="item-description"
            value={description}
            maxLength={500}
            rows={3}
            placeholder="Brand, size, where to find it…"
            onChange={(e) => setDescription(e.target.value)}
          />

          <span className="field-label" id="stores-label">
            Where to find it
            {locations.size > 0 && <span className="count"> · {locations.size} store{locations.size === 1 ? "" : "s"}</span>}
          </span>
          {stores.length === 0 ? (
            <p className="muted small-text">
              No stores yet. Add some on the Stores screen, then come back to say where this is.
            </p>
          ) : (
            <ul className="store-list" aria-labelledby="stores-label">
              {stores.map((s) => {
                const here = locations.get(s.id);
                return (
                  <li key={s.id}>
                    <label className="alt-row">
                      <input type="checkbox" checked={here !== undefined} onChange={() => toggleStore(s.id)} />
                      <ItemThumb name={s.name} photoUrl={s.photoUrl} size={32} />
                      <span>{s.name}</span>
                    </label>
                    {here !== undefined && (
                      <input
                        className="store-location"
                        value={here}
                        maxLength={60}
                        placeholder="Where in the store? e.g. Aisle 12"
                        aria-label={`Location in ${s.name}`}
                        onChange={(e) => setLocation(s.id, e.target.value)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <span className="field-label" id="alternatives-label">
            Acceptable alternatives
            {alternativeIds.size > 0 && <span className="count"> · {alternativeIds.size} picked</span>}
          </span>
          <p className="muted small-text">
            Tick the items that are fine to buy <strong>instead of {name.trim() || "this item"}</strong>.
          </p>
          {items.filter((i) => i.id !== item?.id).length === 0 ? (
            <p className="muted small-text">
              No other items yet. Add more items, then come back to link them as alternatives.
            </p>
          ) : (
            <>
              <input
                type="search"
                value={search}
                placeholder="Search items"
                aria-label="Search items"
                onChange={(e) => setSearch(e.target.value)}
              />
              <ul className="alt-list" aria-labelledby="alternatives-label">
                {candidates.length === 0 && <li className="muted small-text">No matches.</li>}
                {candidates.map((i) => (
                  <li key={i.id}>
                    <label className="alt-row">
                      <input
                        type="checkbox"
                        checked={alternativeIds.has(i.id)}
                        onChange={() => toggleAlternative(i.id)}
                      />
                      <ItemThumb name={i.name} photoUrl={i.photoUrl} size={32} />
                      <span>{i.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="actions">
            {onDelete && (
              <button type="button" className="secondary danger push-left" disabled={busy} onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim() || (!item && !user)}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          shape="square"
          onCancel={() => setCropFile(null)}
          onDone={onCropped}
        />
      )}
    </>
  );
}
