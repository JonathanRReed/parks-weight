import { $, debounce, el, fmt, icon, areaText } from "./util.js";
import { KINDS, allStates, kindTotal, landsLoaded, placeLine, places } from "./data.js";
import { thumb } from "./plate.js";
import { onChange, saved, toggleSaved, toggleVisited, visited } from "./store.js";

const PAGE = 48;

const STATUS = [
  { id: "all", label: "Everything" },
  { id: "visited", label: "Been there" },
  { id: "saved", label: "Saved" },
  { id: "todo", label: "Not yet" },
];

const SORTS = {
  large: { label: "Largest first", fn: (a, b) => b.acres - a.acres },
  small: { label: "Smallest first", fn: (a, b) => a.acres - b.acres },
  name: { label: "A to Z", fn: (a, b) => a.name.localeCompare(b.name) },
};

const filters = { kind: "all", status: "all", state: "", q: "", sort: "large", limit: PAGE };

function matches(p) {
  if (filters.kind !== "all" && p.kind !== filters.kind) return false;
  if (filters.state && !p.states.includes(filters.state)) return false;
  if (filters.status === "visited" && !visited.has(p.id)) return false;
  if (filters.status === "saved" && !saved.has(p.id)) return false;
  if (filters.status === "todo" && visited.has(p.id)) return false;
  if (filters.q) {
    const hay = `${p.name} ${p.states.join(" ")}`.toLowerCase();
    return filters.q.split(/\s+/).every((t) => hay.includes(t));
  }
  return true;
}

export function initGuide(ctx) {
  const passport = $("#passport");
  const controls = $("#guideControls");
  const grid = $("#guideGrid");
  const count = $("#guideCount");
  const more = $("#guideMore");

  function renderPassport() {
    passport.replaceChildren(
      ...KINDS.map((k) => {
        const total = kindTotal(k.id);
        const seen = places.filter((p) => p.kind === k.id && visited.has(p.id)).length;
        return el(
          "div",
          { class: "stat" },
          el("span", { class: "stat-name" }, k.label),
          el("span", { class: "stat-count" }, total ? `${fmt(seen)} of ${fmt(total)}` : "Loading…"),
          el("span", { class: "meter", style: `--kind:var(--k-${k.id});--fill:${total ? (seen / total) * 100 : 0}%`, "aria-hidden": "true" }),
        );
      }),
    );
  }

  function chip(label, pressed, onclick) {
    return el("button", { type: "button", class: "chip", "aria-pressed": String(pressed), onclick }, label);
  }

  function renderControls() {
    const rerun = () => {
      filters.limit = PAGE;
      renderControls();
      renderList();
    };
    const stateSelect = el(
      "select",
      {
        "aria-label": "State",
        onchange: (e) => {
          filters.state = e.target.value;
          rerun();
        },
      },
      el("option", { value: "" }, "All states"),
      ...allStates(filters.kind).map((s) => el("option", { value: s, selected: s === filters.state }, s)),
    );
    const sortSelect = el(
      "select",
      {
        "aria-label": "Sort",
        onchange: (e) => {
          filters.sort = e.target.value;
          rerun();
        },
      },
      ...Object.entries(SORTS).map(([id, s]) => el("option", { value: id, selected: id === filters.sort }, s.label)),
    );
    const search = el("input", {
      type: "search",
      placeholder: "Search by name or state",
      "aria-label": "Search places",
      value: filters.q,
      autocomplete: "off",
      oninput: debounce((e) => {
        filters.q = e.target.value.trim().toLowerCase();
        filters.limit = PAGE;
        renderList();
      }, 120),
    });
    controls.replaceChildren(
      el("label", { class: "search" }, icon("search"), search),
      el(
        "div",
        { class: "chips", role: "group", "aria-label": "Type" },
        chip("All types", filters.kind === "all", () => ((filters.kind = "all"), rerun())),
        ...KINDS.map((k) => chip(k.label, filters.kind === k.id, () => ((filters.kind = k.id), rerun()))),
      ),
      el(
        "div",
        { class: "map-row" },
        el("div", { class: "chips", role: "group", "aria-label": "Status" }, ...STATUS.map((s) => chip(s.label, filters.status === s.id, () => ((filters.status = s.id), rerun())))),
        el("label", { class: "select" }, stateSelect),
        el("label", { class: "select" }, sortSelect),
      ),
    );
    const focused = document.activeElement;
    if (focused?.matches?.('input[type="search"]')) search.focus();
  }

  function card(p) {
    const been = visited.has(p.id);
    const isSaved = saved.has(p.id);
    return el(
      "li",
      { class: `card${been ? " is-visited" : ""}` },
      el(
        "button",
        { type: "button", class: "card-main", onclick: () => ctx.openPlace(p) },
        el("span", { class: "card-plate" }, thumb(p)),
        el("span", { class: "card-name" }, p.name),
        el("span", { class: "card-meta" }, placeLine(p)),
        el("span", { class: "card-acres" }, `${areaText(p.acres)} acres`),
      ),
      el(
        "div",
        { class: "card-actions" },
        el("button", { type: "button", class: "mini", "aria-pressed": String(been), "aria-label": `${p.name}: been here`, title: "Been here", onclick: () => toggleVisited(p.id) }, icon("check")),
        el("button", { type: "button", class: "mini", "aria-pressed": String(isSaved), "aria-label": `${p.name}: save`, title: "Save", onclick: () => toggleSaved(p.id) }, icon("bookmark")),
      ),
    );
  }

  function renderList() {
    const list = places.filter(matches).sort(SORTS[filters.sort].fn);
    const shown = list.slice(0, filters.limit);
    const note = landsLoaded() ? "" : " Still loading monuments, forests and state parks.";
    count.textContent = list.length
      ? `${fmt(list.length)} ${list.length === 1 ? "place" : "places"}.${note}`
      : `Nothing matches.${note}`;
    if (!list.length) {
      const hint =
        filters.status === "visited"
          ? "Mark a place as visited and it will show up here."
          : filters.status === "saved"
            ? "Save a place to keep it on this list."
            : "Try a different type, state or search.";
      grid.replaceChildren(el("li", { class: "empty" }, hint));
    } else {
      grid.replaceChildren(...shown.map(card));
    }
    more.hidden = list.length <= shown.length;
    more.textContent = `Show ${Math.min(PAGE, list.length - shown.length)} more`;
  }

  more.addEventListener("click", () => {
    filters.limit += PAGE;
    renderList();
  });

  function refresh() {
    renderPassport();
    renderControls();
    renderList();
  }

  onChange(() => {
    renderPassport();
    renderList();
  });
  ctx.landsReady.then(refresh);

  return { show: refresh };
}
