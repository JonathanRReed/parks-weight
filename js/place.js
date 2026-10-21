import { $, el, fmt, icon } from "./util.js";
import { getPlace, kindPlural, kindTotal, placeLine, sizeNeighbors } from "./data.js";
import { liveFonts, livePalette, plateSvg } from "./plate.js";
import { onChange, saved, toggleSaved, toggleVisited, visited } from "./store.js";

function facts(place) {
  const rows = [
    ["Acres", fmt(place.acres)],
    ["Square miles", fmt(place.acres / 640, place.acres < 6400 ? 1 : 0)],
    ["Square km", fmt(place.km2, place.km2 < 10 ? 1 : 0)],
  ];
  if (place.states.length) rows.push(["Where", place.states.join(", ")]);
  if (place.visitors) rows.push(["Visitors in 2023", fmt(place.visitors)]);
  if (place.year) rows.push(["Established", String(place.year)]);
  return rows;
}

function notes(place) {
  const lines = [];
  if (place.rank) lines.push(`#${fmt(place.rank)} of ${fmt(kindTotal(place.kind))} ${kindPlural(place.kind).toLowerCase()} by size`);
  const { smaller, larger } = sizeNeighbors(place);
  if (larger) lines.push(`Next larger: ${larger.name}, ${fmt(larger.acres)} acres`);
  if (smaller) lines.push(`Next smaller: ${smaller.name}, ${fmt(smaller.acres)} acres`);
  const yellowstone = getPlace("yellowstone");
  if (yellowstone && yellowstone !== place) {
    const r = yellowstone.acres / place.acres;
    lines.push(r >= 1.05 ? `${fmt(r, 1)} of these fit in Yellowstone` : `Yellowstone fits in this ${fmt(1 / r, 1)} times`);
  }
  if (place.visitors) lines.push(`${fmt(place.visitors / Math.max(place.acres, 1), 1)} visitors per acre in 2023`);
  if (place.year === 1872) lines.push("The first national park in the world");
  return lines;
}

export function initPlace(ctx) {
  const dialog = $("#place");
  const body = $("#placeBody");
  let current = null;

  function render() {
    if (!current) return;
    const p = current;
    const been = visited.has(p.id);
    const isSaved = saved.has(p.id);
    const width = Math.max(Math.round(body.clientWidth) || 560, 280);
    const height = Math.round(width * 0.56);
    const figure = el("figure", { class: "plate plate-solo" });
    figure.innerHTML = plateSvg({
      big: p,
      width,
      height,
      pal: livePalette,
      fonts: liveFonts,
      labels: false,
      fill: { big: `var(--k-${p.kind})` },
    });
    body.replaceChildren(
      figure,
      el(
        "div",
        { class: "place-head" },
        el("div", {}, el("h2", { id: "placeTitle" }, p.name), el("p", { class: "place-kind" }, placeLine(p))),
      ),
      el("dl", { class: "facts" }, ...facts(p).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      p.description ? el("p", { class: "place-copy" }, p.description) : null,
      el("ul", { class: "notes" }, ...notes(p).map((line) => el("li", {}, line))),
      el(
        "div",
        { class: "actions" },
        el("button", { type: "button", class: "btn primary", "aria-pressed": String(been), onclick: () => toggleVisited(p.id) }, icon("check"), been ? "Been here" : "Mark visited"),
        el("button", { type: "button", class: "btn", "aria-pressed": String(isSaved), onclick: () => toggleSaved(p.id) }, icon("bookmark"), isSaved ? "Saved" : "Save"),
        el("button", { type: "button", class: "btn", onclick: () => ctx.compareWith(p) }, "Compare size"),
        p.wiki ? el("a", { class: "btn", href: p.wiki, target: "_blank", rel: "noreferrer" }, "Wikipedia") : null,
      ),
    );
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  $("#placeClose").addEventListener("click", () => dialog.close());
  onChange(() => dialog.open && render());

  return {
    open(place) {
      current = place;
      dialog.setAttribute("aria-label", place.name);
      if (!dialog.open) dialog.showModal();
      render();
      dialog.scrollTop = 0;
    },
    close: () => dialog.open && dialog.close(),
  };
}

