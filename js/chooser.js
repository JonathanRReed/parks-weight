import { $, el, fmt } from "./util.js";
import { KINDS, landsLoaded, placeLine, places } from "./data.js";
import { thumb } from "./plate.js";

const RESULT_LIMIT = 60;

function score(place, tokens) {
  const name = place.name.toLowerCase();
  const haystack = `${name} ${place.states.join(" ").toLowerCase()} ${place.kind.replace("_", " ")}`;
  if (!tokens.every((t) => haystack.includes(t))) return -1;
  if (name.startsWith(tokens[0])) return 3;
  if (name.includes(` ${tokens[0]}`)) return 2;
  return 1;
}

export function initChooser(ctx) {
  const dialog = $("#chooser");
  const input = $("#chooserSearch");
  const chips = $("#chooserKinds");
  const list = $("#chooserList");
  const title = $("#chooserTitle");
  let replacing = null;
  let kind = "all";

  function renderChips() {
    chips.replaceChildren(
      ...[{ id: "all", label: "All" }, ...KINDS].map((k) =>
        el(
          "button",
          {
            type: "button",
            class: "chip",
            "aria-pressed": String(kind === k.id),
            onclick: () => {
              kind = k.id;
              renderChips();
              renderList();
            },
          },
          k.label,
        ),
      ),
    );
  }

  function renderList() {
    const tokens = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    let hits = places.filter((p) => (kind === "all" || p.kind === kind) && p !== replacing);
    if (tokens.length) {
      hits = hits
        .map((p) => [p, score(p, tokens)])
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1] || b[0].acres - a[0].acres)
        .map(([p]) => p);
    } else {
      hits = hits.sort((a, b) => b.acres - a.acres);
    }
    const shown = hits.slice(0, RESULT_LIMIT);
    const rows = shown.map((p) =>
      el(
        "li",
        {},
        el(
          "button",
          { type: "button", class: "row", onclick: () => pick(p) },
          el("span", { class: "row-thumb" }, thumb(p)),
          el("span", { class: "row-text" }, el("b", {}, p.name), el("small", {}, `${placeLine(p)} · ${fmt(p.acres)} acres`)),
        ),
      ),
    );
    const notes = [];
    if (!landsLoaded()) notes.push(el("li", { class: "list-note" }, "Loading monuments, forests and state parks…"));
    if (!rows.length) notes.push(el("li", { class: "list-note" }, "No match. Try a shorter name or another type."));
    if (hits.length > RESULT_LIMIT) {
      notes.push(el("li", { class: "list-note" }, `Showing ${RESULT_LIMIT} of ${fmt(hits.length)}. Type to narrow it down.`));
    }
    list.replaceChildren(...rows, ...notes);
  }

  function pick(place) {
    dialog.close();
    ctx.replace(replacing, place);
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  $("#chooserClose").addEventListener("click", () => dialog.close());
  input.addEventListener("input", renderList);
  ctx.landsReady.then(() => dialog.open && renderList());

  return {
    open(place) {
      replacing = place;
      kind = "all";
      input.value = "";
      title.textContent = `Replace ${place.name}`;
      renderChips();
      renderList();
      dialog.showModal();
      list.scrollTop = 0;
      input.focus();
    },
  };
}
