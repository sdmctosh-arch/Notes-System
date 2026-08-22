const STORAGE_KEY = 'notes-settings';
const listeners = new Set();

const DEFAULTS = {
  dense: false,
  newDays: 1,
  staleDays: 7,
};

export function getSettings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSetting(key, value) {
  const next = { ...getSettings(), [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
