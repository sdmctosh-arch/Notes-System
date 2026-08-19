const STORAGE_KEY = 'notes-theme';
const listeners = new Set();

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark() ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Call once at startup so there's no flash of the wrong theme.
applyTheme(getTheme());
