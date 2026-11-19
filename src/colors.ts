export const COLORS = [
  "#e53935",
  "#d81b60",
  "#8e24aa",
  "#5e35b1",
  "#3949ab",
  "#1e88e5",
  "#00897b",
  "#43a047",
  "#7cb342",
  "#fdd835",
  "#fb8c00",
  "#6d4c41",
];

/** Black or white, whichever reads better on top of the given hex color. */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#1f2a22" : "#ffffff";
}
