// In-memory only (not sessionStorage) - resets on a real page reload,
// which is fine, since the point is just "don't jump to the top when
// you tap back from an item," not surviving a browser restart.
const positions = new Map();

export function saveScrollPosition(key, y) {
  positions.set(key, y);
}

export function getScrollPosition(key) {
  return positions.get(key) ?? 0;
}
