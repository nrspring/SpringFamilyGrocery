import type { Store } from "../../shared/types";

interface Props {
  id: string;
  /** The store whose locations are offered. */
  store: Store;
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the text box, when no visible label points at it. */
  ariaLabel?: string;
}

/**
 * A combo box for where something is in a store: type a place, or tap one of the store's
 * existing places (in walking order). Typing a name that isn't there yet adds it.
 *
 * It is a text box with the choices spelled out underneath instead of a hidden drop-down,
 * so every option is a big, always-visible tap target.
 */
export default function LocationPicker({ id, store, value, onChange, ariaLabel }: Props) {
  const typed = value.trim().toLowerCase();
  const exact = store.locations.some((l) => l.name.toLowerCase() === typed);
  // While typing something new, narrow the choices to ones that contain it.
  const choices = !typed || exact ? store.locations : store.locations.filter((l) => l.name.toLowerCase().includes(typed));

  return (
    <div className="location-picker">
      <input
        id={id}
        value={value}
        maxLength={60}
        placeholder="Type or pick a location"
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {choices.length > 0 && (
        <div className="chips" role="group" aria-label={`Locations in ${store.name}`}>
          {choices.map((l) => (
            <button
              key={l.id}
              type="button"
              className="chip"
              aria-pressed={l.name.toLowerCase() === typed}
              onClick={() => onChange(l.name)}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
      {typed && !exact && (
        <p className="muted small-text">
          “{value.trim()}” is new. Saving adds it to {store.name}'s locations.
        </p>
      )}
    </div>
  );
}
