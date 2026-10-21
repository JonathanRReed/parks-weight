const VISITED_KEY = "pas-visited";
const SAVED_KEY = "pas-saved";
const THEME_KEY = "pas-theme";
const HINT_KEY = "pas-hint-seen";

function load(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function persist(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Private mode or full storage: keep working in memory.
  }
}

export const visited = load(VISITED_KEY);
export const saved = load(SAVED_KEY);

const listeners = new Set();
export const onChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

function flip(set, key, id) {
  if (!set.delete(id)) set.add(id);
  persist(key, set);
  emit();
}

export const toggleVisited = (id) => flip(visited, VISITED_KEY, id);
export const toggleSaved = (id) => flip(saved, SAVED_KEY, id);

export function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for this visit.
  }
  const color = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  emit();
}

export function hintSeen() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissHint() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // Nothing to persist.
  }
}
