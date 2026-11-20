import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Item, Store } from "../../shared/types";
import { api } from "../api";
import ItemThumb from "./ItemThumb";
import LocationPicker from "./LocationPicker";
import PhotoCropper from "./PhotoCropper";

interface Props {
  item: Item;
  /** The store chosen on the List. */
  store: Store;
  /** Called with the item as the server now has it. */
  onSaved: (item: Item) => void;
  onCancel: () => void;
}

/**
 * A dialog for saying where one item is in the store chosen on the List. It also shows the
 * item's picture, which can be replaced here: the new one is saved along with the location.
 */
export default function LocationEditor({ item, store, onSaved, onCancel }: Props) {
  const [location, setLocation] = useState(
    item.stores.find((s) => s.storeId === store.id)?.location ?? "",
  );
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // The picked photo waiting to be positioned in the cropper.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The finger that opened this may still be down; ignore backdrop taps for a moment.
  const openedAt = useRef(Date.now());
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    // While the cropper is open, Escape belongs to it.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && !cropFile && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy, cropFile]);

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

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (photo) {
        await api.updateItem(item.id, { photo });
        // Saved: if the location step below fails, a retry must not upload it again.
        setPhoto(null);
      }
      // Answers with the item as it now is, new picture included.
      onSaved(await api.setItemLocation(item.id, store.id, location.trim()));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const shownPhoto = preview ?? item.photoUrl;

  return (
    <>
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
          {shownPhoto ? (
            <img className="location-photo" src={shownPhoto} alt={item.name} />
          ) : (
            <div className="location-photo-empty">
              <ItemThumb name={item.name} photoUrl={null} size={160} />
            </div>
          )}
          <div className="location-photo-buttons">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => cameraInput.current?.click()}
            >
              Take photo
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => libraryInput.current?.click()}
            >
              {shownPhoto ? "Choose another" : "Choose photo"}
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

          <h2>{item.name}</h2>

          <div className="location-field">
            <label htmlFor="item-location">Where is it in {store.name}?</label>
            <LocationPicker id="item-location" store={store} value={location} onChange={setLocation} />
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
