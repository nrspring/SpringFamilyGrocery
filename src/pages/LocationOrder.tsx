import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import type { Store, StoreLocation } from "../../shared/types";
import { api } from "../api";

// "Aisle 2" before "Aisle 10", ignoring capitals.
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** How long a finger must rest on a row before it lifts, and how far it may wobble meanwhile. */
const HOLD_MS = 250;
/** A lifted row that hears nothing at all from the finger for this long is let go. */
const IDLE_LET_GO_MS = 12_000;
const HOLD_TOLERANCE_PX = 8;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the screen shows while a row is being dragged. */
interface Drag {
  id: string;
  /** Where the row started and where it would land if dropped now. */
  start: number;
  target: number;
  /** How far the row has been dragged from where it started, in pixels. */
  translate: number;
  /** How far the rows it passes over slide out of the way. */
  shift: number;
}

/** What the drag handlers need to remember between pointer events (no re-render needed). */
interface DragState {
  id: string;
  start: number;
  target: number;
  /** Where the pointer was, in page coordinates, when the drag began. */
  grabY: number;
  /** Each row's page position and height when the drag began. */
  rects: { top: number; height: number }[];
  shift: number;
  lastClientY: number;
  /** When the finger last did anything, for noticing one that has gone without a word. */
  lastEvent: number;
  frame: number;
}

/** Put a store's locations in the order you walk it. The List sorts by this. */
export default function LocationOrder() {
  const { id = "" } = useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [drag, setDrag] = useState<Drag | null>(null);

  // Saving the order never blocks the buttons: every tap or drop shows at once and the newest
  // order is sent in the background, one request at a time.
  const queued = useRef<string[] | null>(null);
  const saving = useRef(false);
  const dragState = useRef<DragState | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const hold = useRef<{ x: number; y: number; timer: number } | null>(null);
  const latest = useRef({ store, reorder: (_: StoreLocation[]) => {} });

  const load = useCallback(async () => {
    try {
      setStore(await api.getStore(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Sends queued orders to the server, newest last, and takes the server's answer once nothing newer is waiting. */
  async function flush() {
    if (saving.current) return;
    saving.current = true;
    setStatus("saving");
    try {
      while (queued.current) {
        const names = queued.current;
        queued.current = null;
        const updated = await api.orderLocations(id, names);
        if (!queued.current) setStore(updated);
      }
      setError("");
      setStatus("saved");
      window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (e) {
      queued.current = null;
      setError((e as Error).message);
      setStatus("idle");
      await load(); // show what the server really has
    } finally {
      saving.current = false;
    }
  }

  function reorder(locations: StoreLocation[]) {
    setStore((s) => (s ? { ...s, locations } : s));
    queued.current = locations.map((l) => l.name);
    void flush();
  }

  latest.current = { store, reorder };

  function move(index: number, by: -1 | 1) {
    if (!store) return;
    const next = [...store.locations];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    reorder(next);
  }

  /** Adds or removes a location, then takes the store the server answers with. */
  async function change(action: () => Promise<Store>) {
    setBusy(true);
    setError("");
    try {
      setStore(await action());
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    return change(() => api.addLocation(id, name));
  }

  // ---- Drag and drop (pointer events, so it works with a finger or a mouse) ----

  function updateDrag() {
    const d = dragState.current;
    if (!d) return;
    const translate = d.lastClientY + window.scrollY - d.grabY;
    const start = d.rects[d.start];
    const center = start.top + start.height / 2 + translate;
    let target = d.start;
    let best = Infinity;
    d.rects.forEach((r, i) => {
      const distance = Math.abs(center - (r.top + r.height / 2));
      if (distance < best) {
        best = distance;
        target = i;
      }
    });
    d.target = target;
    setDrag({ id: d.id, start: d.start, target, translate, shift: d.shift });
  }

  function onPointerMove(e: PointerEvent) {
    if (dragState.current) {
      dragState.current.lastClientY = e.clientY;
      dragState.current.lastEvent = Date.now();
      updateDrag();
    }
  }

  function stopDrag() {
    const d = dragState.current;
    const l = listeners.current;
    window.removeEventListener("pointermove", l.move);
    window.removeEventListener("pointerup", l.up);
    window.removeEventListener("pointercancel", l.cancel);
    window.removeEventListener("touchend", l.touchEnd);
    window.removeEventListener("touchcancel", l.cancel);
    window.removeEventListener("blur", l.cancel);
    document.removeEventListener("visibilitychange", l.hidden);
    if (d) cancelAnimationFrame(d.frame);
    dragState.current = null;
    setDrag(null);
    return d;
  }

  function onPointerUp() {
    const d = stopDrag();
    const { store: current, reorder: save } = latest.current;
    if (!d || !current || d.target === d.start) return;
    const next = [...current.locations];
    const [moved] = next.splice(d.start, 1);
    next.splice(d.target, 0, moved);
    save(next);
  }

  function onPointerCancel() {
    stopDrag();
  }

  function startDrag(clientY: number, index: number) {
    if (!store || dragState.current) return;

    const rects = store.locations.map((l) => {
      const r = rows.current.get(l.id)!.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    // Neighbouring rows slide by one row's pitch (height plus the gap between rows).
    const shift =
      rects.length < 2
        ? rects[index].height
        : index < rects.length - 1
          ? rects[index + 1].top - rects[index].top
          : rects[index].top - rects[index - 1].top;

    const d: DragState = {
      id: store.locations[index].id,
      start: index,
      target: index,
      grabY: clientY + window.scrollY,
      rects,
      shift,
      lastClientY: clientY,
      lastEvent: Date.now(),
      frame: 0,
    };
    dragState.current = d;
    setDrag({ id: d.id, start: index, target: index, translate: 0, shift });

    // However the gesture ends, the drag must end with it. A drag that never lets go would leave
    // the row lifted, the page unable to scroll, and the screen redrawing for ever.
    const l = listeners.current;
    window.addEventListener("pointermove", l.move);
    window.addEventListener("pointerup", l.up);
    window.addEventListener("pointercancel", l.cancel);
    window.addEventListener("touchend", l.touchEnd);
    window.addEventListener("touchcancel", l.cancel);
    window.addEventListener("blur", l.cancel);
    document.addEventListener("visibilitychange", l.hidden);

    // Near the top or bottom edge of the screen, scroll so a long list can be dragged all the way.
    // Only that needs a loop; holding still costs nothing.
    const tick = () => {
      if (dragState.current !== d) return;
      // Nothing heard from the finger for a long time: it has gone, so let go of the row.
      if (Date.now() - d.lastEvent > IDLE_LET_GO_MS) {
        current.current.cancel();
        return;
      }
      const top = 90;
      const bottom = window.innerHeight - 150; // clear of the tab bar
      // Only scroll toward the edge the row is being dragged towards. Otherwise grabbing a row
      // that already sits in an edge zone would start the page scrolling before you had moved.
      const dragged = d.lastClientY + window.scrollY - d.grabY;
      let scrolled = false;
      if (d.lastClientY < top && dragged < 0) {
        window.scrollBy(0, -Math.ceil((top - d.lastClientY) / 6));
        scrolled = true;
      } else if (d.lastClientY > bottom && dragged > 0) {
        window.scrollBy(0, Math.ceil((d.lastClientY - bottom) / 6));
        scrolled = true;
      }
      if (scrolled) {
        d.lastEvent = Date.now(); // scrolling for the finger counts as the finger being there
        updateDrag();
      }
      d.frame = requestAnimationFrame(tick);
    };
    d.frame = requestAnimationFrame(tick);
  }

  // On a touch screen, press and hold anywhere on a row to pick it up. Moving before the hold
  // is up means the finger is scrolling the page, so the hold is dropped.
  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function beginHold(e: ReactPointerEvent, index: number) {
    if (e.pointerType === "mouse" || dragState.current) return; // a mouse drags by the handle
    if ((e.target as Element).closest("button, input, a, .drag-handle")) return;
    cancelHold();
    const h = { x: e.clientX, y: e.clientY, timer: 0 };
    h.timer = window.setTimeout(() => {
      hold.current = null;
      navigator.vibrate?.(15); // a little buzz on phones that support it: "picked up"
      startDrag(h.y, index);
    }, HOLD_MS);
    hold.current = h;
  }

  function moveHold(e: ReactPointerEvent) {
    const h = hold.current;
    if (!h) return;
    if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_TOLERANCE_PX) cancelHold();
    else h.y = e.clientY;
  }

  // While a row is held the page must not scroll under the finger. Scrolling can only be stopped
  // from a listener that is allowed to cancel it, so this one stays for the life of the screen.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (dragState.current && e.cancelable) e.preventDefault();
    };
    window.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("touchmove", block);
      if (hold.current) window.clearTimeout(hold.current.timer);
    };
  }, []);

  // The functions above are new on every render, but a listener has to be removed using the very
  // same function it was added with. These never change and hand over to the current versions.
  const current = useRef({ move: onPointerMove, up: onPointerUp, cancel: onPointerCancel, stop: stopDrag });
  current.current = { move: onPointerMove, up: onPointerUp, cancel: onPointerCancel, stop: stopDrag };
  const listeners = useRef({
    move: (e: PointerEvent) => current.current.move(e),
    up: () => current.current.up(),
    cancel: () => current.current.cancel(),
    // A second finger lifting must not drop the row the first is still holding.
    touchEnd: (e: TouchEvent) => {
      if (e.touches.length === 0) current.current.up();
    },
    hidden: () => {
      if (document.hidden) current.current.cancel();
    },
  });

  // Never leave listeners behind if the screen is left mid-drag.
  useEffect(
    () => () => {
      if (dragState.current) current.current.stop();
    },
    [],
  );

  function rowStyle(index: number, locationId: string): CSSProperties | undefined {
    if (!drag) return undefined;
    if (locationId === drag.id) return { transform: `translateY(${drag.translate}px) scale(1.02)` };
    let y = 0;
    if (index > drag.start && index <= drag.target) y = -drag.shift;
    else if (index < drag.start && index >= drag.target) y = drag.shift;
    return { transform: `translateY(${y}px)`, transition: "transform 150ms ease" };
  }

  /** The number a row shows. While dragging it follows the order the rows would end up in. */
  function shownNumber(index: number, locationId: string) {
    if (!drag) return index + 1;
    if (locationId === drag.id) return drag.target + 1;
    if (index > drag.start && index <= drag.target) return index; // slides up one
    if (index < drag.start && index >= drag.target) return index + 2; // slides down one
    return index + 1;
  }

  if (!store) {
    return (
      <section>
        <Link to="/stores" className="back-link">
          ← Stores
        </Link>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </section>
    );
  }

  const last = store.locations.length - 1;
  const working = busy || status === "saving";

  return (
    <section>
      <Link to="/stores" className="back-link">
        ← Stores
      </Link>
      <div className="section-head">
        <h1>{store.name}</h1>
        <span className="save-status muted" role="status">
          {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : ""}
        </span>
      </div>
      <p className="muted order-intro">
        Put the places in the order you walk the store: press and hold a row, then drag it (or use the
        arrows). The List is sorted this way when this store is chosen.
      </p>

      {error && (
        <p className="error order-error" role="alert">
          {error}
        </p>
      )}

      <form className="add-location" onSubmit={add}>
        <input
          value={newName}
          maxLength={60}
          placeholder="Add a location, e.g. Aisle 12"
          aria-label="New location"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" disabled={working || !newName.trim()}>
          Add
        </button>
      </form>

      {store.locations.length === 0 && (
        <p className="muted">
          No locations yet. They also appear here when you say where an item is in {store.name}.
        </p>
      )}

      {store.locations.length > 1 && (
        <button
          type="button"
          className="secondary small"
          disabled={busy}
          onClick={() => reorder([...store.locations].sort((a, b) => naturalOrder.compare(a.name, b.name)))}
        >
          Sort A–Z
        </button>
      )}

      <ol className="order-list">
        {store.locations.map((l, i) => (
          <li
            key={l.id}
            ref={(el) => {
              if (el) rows.current.set(l.id, el);
              else rows.current.delete(l.id);
            }}
            className={`order-row${drag?.id === l.id ? " dragging" : ""}`}
            style={rowStyle(i, l.id)}
            onPointerDown={(e) => beginHold(e, i)}
            onPointerMove={moveHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span
              className="drag-handle"
              role="img"
              aria-label={`Drag ${l.name} to reorder`}
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.preventDefault();
                startDrag(e.clientY, i);
              }}
            >
              ⠿
            </span>
            <span className="order-number" aria-hidden>
              {shownNumber(i, l.id)}
            </span>
            <div className="order-name">
              <strong>{l.name}</strong>
              <span className="order-meta">
                <span className="muted">{plural(l.itemCount, "item")}</span>
                {l.itemCount === 0 && (
                  <button
                    type="button"
                    className="link remove-link"
                    disabled={working}
                    aria-label={`Remove ${l.name}`}
                    onClick={() => change(() => api.deleteLocation(id, l.id))}
                  >
                    Remove
                  </button>
                )}
              </span>
            </div>
            <div className="order-actions">
              <button
                type="button"
                className="move"
                disabled={i === 0}
                aria-label={`Move ${l.name} up`}
                onClick={() => move(i, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="move"
                disabled={i === last}
                aria-label={`Move ${l.name} down`}
                onClick={() => move(i, 1)}
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
