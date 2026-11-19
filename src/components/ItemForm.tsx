import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Item, User } from "../../shared/types";
import { api } from "../api";
import ItemThumb from "./ItemThumb";
import PhotoCropper from "./PhotoCropper";

interface Props {
  /** The item being edited, or undefined when adding a new one. */
  item?: Item;
  /** Every item, so acceptable alternatives can be picked from them. */
  items: Item[];
  /** Who this device is; they become the item's "added by" when it is new. */
  user: User | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function ItemForm({ item, items, user, onSaved, onCancel }: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [alternativeIds, setAlternativeIds] = useState<Set<string>>(new Set(item?.alternativeIds));
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
    // While the cropper is open, Escape belongs to it.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !cropFile && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, cropFile]);

  // Other active items can be picked; a disabled one only shows if it was already chosen.
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => i.id !== item?.id && (i.active || alternativeIds.has(i.id)))
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, item?.id, alternativeIds, search]);

  function toggleAlternative(id: string) {
    setAlternativeIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
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
        photo,
      };
      if (item) await api.updateItem(item.id, { ...input, active });
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
            autoFocus
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

          <span className="field-label" id="alternatives-label">
            Acceptable alternatives
            {alternativeIds.size > 0 && <span className="count"> · {alternativeIds.size} picked</span>}
          </span>
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
                      {!i.active && <span className="badge">Disabled</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {item && (
            <label className="check-row">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Active</span>
            </label>
          )}

          <p className="user-id">
            Added by <strong>{adder?.name ?? "unknown"}</strong>
            {!item && !user && " (choose who you are first)"}
          </p>
          {item && (
            <p className="user-id">
              ID <code>{item.id}</code>
            </p>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <div className="actions">
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
