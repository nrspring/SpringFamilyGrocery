import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { cropToHeadshot } from "../image";

// A circular "move and zoom" cropper, like the ones in contacts and social apps:
// drag to reposition, pinch (or scroll / use the slider) to zoom.

const MAX_ZOOM = 4;

interface Size {
  w: number;
  h: number;
}
interface Point {
  x: number;
  y: number;
}
/** z is zoom (1 = photo just covers the circle); x/y pan the photo, in pixels from center. */
interface View {
  z: number;
  x: number;
  y: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// The photo at zoom 1 is scaled so its short side exactly fills the crop square.
const scaleFor = (z: number, nat: Size, size: number) => (size / Math.min(nat.w, nat.h)) * z;

/** Keeps the crop square fully inside the photo so there are never empty edges. */
function clampView(v: View, nat: Size, size: number): View {
  const z = clamp(v.z, 1, MAX_ZOOM);
  const s = scaleFor(z, nat, size);
  const maxX = Math.max(0, (nat.w * s - size) / 2);
  const maxY = Math.max(0, (nat.h * s - size) / 2);
  return { z, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
}

/** Zooms so the photo point under (px, py) — measured from the crop center — stays put. */
function zoomAbout(v: View, px: number, py: number, newZ: number, nat: Size, size: number): View {
  const z = clamp(newZ, 1, MAX_ZOOM);
  const r = z / v.z;
  return clampView({ z, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, nat, size);
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}

export default function PhotoCropper({ file, onCancel, onDone }: Props) {
  const [url, setUrl] = useState("");
  const [nat, setNat] = useState<Size | null>(null);
  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());

  // Crop circle diameter: as wide as comfortably fits on a phone, up to 320px.
  const size = useMemo(() => Math.min(320, window.innerWidth - 48), []);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Mouse wheel / trackpad pinch zoom. Needs a non-passive listener to stop page scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !nat) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const px = e.clientX - rect.left - size / 2;
      const py = e.clientY - rect.top - size / 2;
      const k = Math.exp(-e.deltaY * 0.0025);
      setView((v) => zoomAbout(v, px, py, v.z * k, nat, size));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [nat, size]);

  const relToCenter = (p: Point): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: p.x - rect.left - size / 2, y: p.y - rect.top - size / 2 };
  };

  function onPointerDown(e: PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (e.g. synthetic events); dragging still works while over the stage */
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !nat) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, nat, size));
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current].find(([id]) => id !== e.pointerId)![1];
      const prevDist = dist(prev, other);
      const k = prevDist > 0 ? dist(cur, other) / prevDist : 1;
      const prevMid = mid(prev, other);
      const curMid = mid(cur, other);
      const center = relToCenter(curMid);
      setView((v) =>
        zoomAbout(
          { ...v, x: v.x + (curMid.x - prevMid.x), y: v.y + (curMid.y - prevMid.y) },
          center.x,
          center.y,
          v.z * k,
          nat,
          size,
        ),
      );
    }
  }

  function onPointerEnd(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  function zoomTo(z: number) {
    if (nat) setView((v) => zoomAbout(v, 0, 0, z, nat, size));
  }

  async function done() {
    if (!nat || !imgRef.current) return;
    setBusy(true);
    try {
      const s = scaleFor(view.z, nat, size);
      const side = size / s;
      // The crop center is the photo point currently under the middle of the circle.
      const sx = clamp(nat.w / 2 - view.x / s - side / 2, 0, nat.w - side);
      const sy = clamp(nat.h / 2 - view.y / s - side / 2, 0, nat.h - side);
      onDone(await cropToHeadshot(imgRef.current, sx, sy, side));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const s = nat ? scaleFor(view.z, nat, size) : 1;

  return (
    <div className="cropper" role="dialog" aria-modal="true" aria-label="Move and zoom photo">
      <h2>Move and zoom</h2>

      <div
        ref={stageRef}
        className="crop-stage"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            className="crop-img"
            style={
              nat
                ? {
                    width: nat.w * s,
                    height: nat.h * s,
                    transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
                  }
                : { visibility: "hidden" }
            }
            onLoad={(e) =>
              setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            onError={() => setError("Couldn't read that photo. Try another one?")}
          />
        )}
        <div className="crop-mask" />
      </div>

      <div className="zoom-row">
        <button
          type="button"
          className="zoom-step"
          aria-label="Zoom out"
          onClick={() => zoomTo(view.z - 0.25)}
        >
          −
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.z}
          aria-label="Zoom"
          onChange={(e) => zoomTo(Number(e.target.value))}
        />
        <button
          type="button"
          className="zoom-step"
          aria-label="Zoom in"
          onClick={() => zoomTo(view.z + 0.25)}
        >
          +
        </button>
      </div>

      <p className="crop-hint">Drag to move. Pinch or scroll to zoom.</p>

      {error && (
        <p className="error crop-error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={done} disabled={!nat || busy}>
          {busy ? "Saving…" : "Use photo"}
        </button>
      </div>
    </div>
  );
}
