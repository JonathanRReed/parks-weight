export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const numberFormat = new Map();
export function fmt(n, digits = 0) {
  if (!numberFormat.has(digits)) {
    numberFormat.set(digits, new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }));
  }
  return numberFormat.get(digits).format(n);
}

export const areaText = (n) => (n > 0 && n < 0.01 ? "under 0.01" : fmt(n, n < 1 ? 2 : n < 10 ? 1 : 0));

export function compact(n) {
  if (n >= 1e6) return `${fmt(n / 1e6, n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e4) return `${fmt(n / 1e3, 0)}k`;
  return fmt(n);
}

export const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "g", "circle", "rect", "line", "text", "use", "symbol", "defs", "polyline", "pattern", "clipPath"]);

export function el(tag, attrs = {}, ...children) {
  const node = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export function icon(name, className = "") {
  return el("svg", { class: `icon ${className}`.trim(), "aria-hidden": "true", focusable: "false" }, el("use", { href: `#i-${name}` }));
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function plural(n, one, many = `${one}s`) {
  return n === 1 ? one : many;
}
