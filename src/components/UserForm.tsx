import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { User } from "../../shared/types";
import { api } from "../api";
import { COLORS } from "../colors";
import { prepareHeadshot } from "../image";
import Avatar from "./Avatar";

interface Props {
  /** The user being edited, or undefined when adding a new one. */
  user?: User;
  defaultColor: string;
  onSaved: () => void;
  onCancel: () => void;
}

export default function UserForm({ user, defaultColor, onSaved, onCancel }: Props) {
  const [name, setName] = useState(user?.name ?? "");
  const [color, setColor] = useState(user?.color ?? defaultColor);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const blob = await prepareHeadshot(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = { name: name.trim(), color, photo };
      if (user) await api.updateUser(user.id, input);
      else await api.createUser(input);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={user ? "Edit user" : "Add user"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2>{user ? "Edit user" : "Add user"}</h2>

        <div className="photo-row">
          <Avatar
            name={name}
            color={color}
            photoUrl={preview ?? user?.photoUrl ?? null}
            size={88}
          />
          <label className="file-button">
            {preview || user?.photoUrl ? "Change headshot" : "Upload headshot"}
            <input type="file" accept="image/*" onChange={onFile} hidden />
          </label>
        </div>

        <label htmlFor="user-name">Name</label>
        <input
          id="user-name"
          value={name}
          maxLength={50}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />

        <span className="field-label">Color</span>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              className={`swatch${color === c ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <input
            type="color"
            className="color-picker"
            aria-label="Custom color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>

        {user && (
          <p className="user-id">
            ID <code>{user.id}</code>
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
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
