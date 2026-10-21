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

const FONT_KEY = "pas-font";
export const THEMES = ["system", "light", "dark"];
export const FONTS = ["field", "classic", "dyslexic"];

const html = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)");

export const getTheme = () => (html.dataset.theme === "dark" ? "dark" : "light");
export const getThemePref = () => (THEMES.includes(html.dataset.themePref) ? html.dataset.themePref : "system");
export const getFont = () => (FONTS.includes(html.dataset.font) ? html.dataset.font : "field");

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies for this visit.
  }
}

function applyTheme(pref) {
  html.dataset.themePref = pref;
  html.dataset.theme = pref === "system" ? (dark.matches ? "dark" : "light") : pref;
  const color = getComputedStyle(html).getPropertyValue("--paper").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function setThemePref(pref) {
  if (!THEMES.includes(pref)) return;
  save(THEME_KEY, pref);
  applyTheme(pref);
  emit();
}

export function setFont(font) {
  if (!FONTS.includes(font)) return;
  save(FONT_KEY, font);
  if (font === "field") delete html.dataset.font;
  else html.dataset.font = font;
  emit();
}

dark.addEventListener("change", () => {
  if (getThemePref() !== "system") return;
  applyTheme("system");
  emit();
});

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
