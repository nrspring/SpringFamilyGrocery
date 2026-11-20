import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Store } from "../../shared/types";
import { api } from "../api";
import { currentPosition } from "../geo";
import ItemThumb from "./ItemThumb";
import PhotoCropper from "./PhotoCropper";

interface Props {
  /** The store being edited, or undefined when adding a new one. */
  store?: Store;
  /** Present when editing: asks the parent to confirm and delete this store. */
  onDelete?: () => void;
  /** True while something is open on top of the form, so Escape should leave the form alone. */
  blocked?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

/** "" means no value; anything that isn't a number comes back as NaN. */
const parseCoordinate = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

export default function StoreForm({ store, onDelete, blocked, onSaved, onCancel }: Props) {
  const [name, setName] = useState(store?.name ?? "");
  const [latitude, setLatitude] = useState(store?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(store?.longitude?.toString() ?? "");
  // Set after the button fills the fields in, to say how precise the reading was.
  const [fix, setFix] = useState<{ accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
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

  async function recordLocation() {
    setGeoError("");
    setLocating(true);
    try {
      const coords = await currentPosition();
      // Six decimal places is about 10 cm, far more than a phone can actually tell.
      setLatitude(coords.latitude.toFixed(6));
      setLongitude(coords.longitude.toFixed(6));
      setFix({ accuracy: Math.round(coords.accuracy) });
    } catch (e) {
      setGeoError((e as Error).message);
    } finally {
      setLocating(false);
    }
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
    const lat = parseCoordinate(latitude);
    const lng = parseCoordinate(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return setError("Latitude and longitude must be numbers");
    if (lat !== null && Math.abs(lat) > 90) return setError("Latitude must be between -90 and 90");
    if (lng !== null && Math.abs(lng) > 180) return setError("Longitude must be between -180 and 180");
    if ((lat === null) !== (lng === null)) return setError("Enter both latitude and longitude, or leave both blank");

    setBusy(true);
    setError("");
    try {
      const input = { name: name.trim(), latitude: lat, longitude: lng, photo };
      if (store) await api.updateStore(store.id, input);
      else await api.createStore(input);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="overlay" onClick={onCancel}>
        <form
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={store ? "Edit store" : "Add store"}
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
        >
          <h2>{store ? "Edit store" : "Add store"}</h2>

          <div className="photo-row">
            <ItemThumb name={name} photoUrl={preview ?? store?.photoUrl ?? null} size={88} />
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
                {preview || store?.photoUrl ? "Choose another" : "Choose photo"}
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

          <label htmlFor="store-name">Name</label>
          <input
            id="store-name"
            value={name}
            maxLength={80}
            // A new store starts typing right away; editing one shouldn't pop the keyboard up over it.
            autoFocus={!store}
            onChange={(e) => setName(e.target.value)}
          />

          <span className="field-label">Location</span>
          <button type="button" className="secondary" disabled={locating} onClick={recordLocation}>
            {locating ? "Finding you…" : "📍 Record my current location"}
          </button>
          {fix && (
            <p className="geo-ok small-text" role="status">
              Got it, accurate to about {fix.accuracy} m. Press Save to keep it.
            </p>
          )}
          {geoError && (
            <p className="error small-text" role="alert">
              {geoError}
            </p>
          )}
          <div className="coords">
            <div>
              <label htmlFor="store-lat">Latitude</label>
              <input
                id="store-lat"
                inputMode="decimal"
                value={latitude}
                placeholder="e.g. 40.712776"
                onChange={(e) => {
                  setLatitude(e.target.value);
                  setFix(null);
                }}
              />
            </div>
            <div>
              <label htmlFor="store-lng">Longitude</label>
              <input
                id="store-lng"
                inputMode="decimal"
                value={longitude}
                placeholder="e.g. -74.005974"
                onChange={(e) => {
                  setLongitude(e.target.value);
                  setFix(null);
                }}
              />
            </div>
          </div>
          <p className="muted small-text">
            Stand in the store and press the button, or type the coordinates in yourself.
          </p>

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
            <button type="submit" disabled={busy || !name.trim()}>
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
