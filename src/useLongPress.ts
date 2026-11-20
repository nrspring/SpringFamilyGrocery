import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** How far a finger may drift before a press turns into a scroll or drag instead. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Long-press support for rows in a list. Call the returned function with a
 * callback to get the props to spread onto an element. It also treats a right
 * click as a long press, which is what desktop users reach for, and swallows the
 * browser's own long-press menu so it doesn't pop up over ours.
 *
 * Presses that start on a button, link or input are ignored, so a row's own
 * controls still just click.
 */
export function useLongPress(ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // Phones fire a contextmenu event right after a long press too; don't act on both.
  const firedAt = useRef(0);

  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
  };
  useEffect(() => cancel, []);

  return (onLongPress: () => void) => ({
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if ((e.target as Element).closest("button, a, input, select, textarea")) return;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        firedAt.current = Date.now();
        origin.current = null;
        onLongPress();
      }, ms);
    },
    onPointerMove(e: PointerEvent) {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      if ((e.target as Element).closest("button, a, input, select, textarea")) return;
      cancel();
      if (Date.now() - firedAt.current > 1000) onLongPress();
    },
  });
}
