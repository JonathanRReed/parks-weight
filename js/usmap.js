import { $, el, fmt, icon } from "./util.js";
import { KINDS, allStates, placeLine, places } from "./data.js";
import { KM_PER_UNIT, loadMapShapes, project } from "./geo.js";
import { onChange, visited } from "./store.js";

const CELL = 38;
const MAX_ZOOM = 60;
const NICE_MILES = [10, 25, 50, 100, 200, 500, 1000];
const SVG = "http://www.w3.org/2000/svg";

const mapState = { kinds: new Set(["national_park"]), state: "", trail: false };

function mapPlaces() {
  return places.filter((p) => mapState.kinds.has(p.kind) && (!mapState.state || p.states.includes(mapState.state)));
}

export function initMap(ctx) {
  const stage = $("#mapStage");
  const svg = $("#usMap");
  const tools = $("#mapTools");
  const status = $("#mapStatus");
  const popover = $("#mapPopover");
  const scaleBar = $("#mapScale");

  let shapes = null;
  let projected = [];
  let projectedCount = -1;
  let view = null;
  let full = null;
  let selected = null;
  let frame = 0;
  const pointers = new Map();
  let drag = null;
  let moved = false;

  const baseGroup = document.createElementNS(SVG, "g");
  const trailGroup = document.createElementNS(SVG, "g");
  const markGroup = document.createElementNS(SVG, "g");
  svg.append(baseGroup, trailGroup, markGroup);

  function ensureProjected() {
    if (projectedCount === places.length) return;
    projected = [];
    places.forEach((p) => {
      if (p.lat == null || p.lon == null) return;
      const xy = project(p.lon, p.lat);
      if (xy) projected.push({ p, x: xy[0], y: xy[1] });
    });
    projectedCount = places.length;
  }

  const size = () => ({ w: stage.clientWidth, h: stage.clientHeight });

  function box() {
    const { w, h } = size();
    const height = (view.w * h) / w;
    return { x: view.cx - view.w / 2, y: view.cy - height / 2, w: view.w, h: height, k: view.w / w };
  }

  function fitTo(bounds, pad = 0.08) {
    const { w, h } = size();
    const bw = bounds[2] - bounds[0];
    const bh = bounds[3] - bounds[1];
    view = {
      cx: (bounds[0] + bounds[2]) / 2,
      cy: (bounds[1] + bounds[3]) / 2,
      w: Math.max(bw, (bh * w) / h) * (1 + pad * 2),
    };
  }

  function clampView() {
    const { w, h } = size();
    view.w = Math.min(Math.max(view.w, full.w / MAX_ZOOM), full.w * 1.05);
    const height = (view.w * h) / w;
    const slackX = Math.max((full.w - view.w) / 2, 0) + full.w * 0.05;
    const slackY = Math.max((full.h - height) / 2, 0) + full.h * 0.05;
    view.cx = Math.min(Math.max(view.cx, full.cx - slackX), full.cx + slackX);
    view.cy = Math.min(Math.max(view.cy, full.cy - slackY), full.cy + slackY);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function zoomAt(factor, px, py) {
    const b = box();
    const ux = b.x + px * b.k;
    const uy = b.y + py * b.k;
    const next = Math.min(Math.max(view.w / factor, full.w / MAX_ZOOM), full.w * 1.05);
    const real = view.w / next;
    view.cx = ux - (ux - view.cx) / real;
    view.cy = uy - (uy - view.cy) / real;
    view.w = next;
    clampView();
    schedule();
  }

  function cluster(visible, b) {
    const cells = new Map();
    for (const item of visible) {
      const key = `${Math.floor((item.x - b.x) / b.k / CELL)}:${Math.floor((item.y - b.y) / b.k / CELL)}`;
      const cell = cells.get(key);
      if (cell) cell.push(item);
      else cells.set(key, [item]);
    }
    return [...cells.values()];
  }

  function markerNode(item, k, tabbable) {
    const { p, x, y } = item;
    const r = (p.kind === "national_park" ? 8 : 6) * k;
    const been = visited.has(p.id);
    const g = document.createElementNS(SVG, "g");
    g.dataset.id = p.id;
    g.setAttribute("class", "mark");
    g.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    if (tabbable) {
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${p.name}${been ? ", visited" : ""}`);
    }
    const dot = document.createElementNS(SVG, "circle");
    dot.setAttribute("r", r.toFixed(3));
    dot.setAttribute("style", been ? `fill:var(--k-${p.kind});stroke:var(--ink);stroke-width:1.4` : `fill:var(--paper);stroke:var(--k-${p.kind});stroke-width:2`);
    g.append(dot);
    if (been) {
      const tick = document.createElementNS(SVG, "path");
      tick.setAttribute("d", `M${-0.5 * r} ${0.02 * r}L${-0.12 * r} ${0.4 * r}L${0.52 * r} ${-0.38 * r}`);
      tick.setAttribute("style", "fill:none;stroke:var(--paper);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke");
      g.append(tick);
    }
    if (selected === p.id) {
      const ring = document.createElementNS(SVG, "circle");
      ring.setAttribute("r", (r + 5 * k).toFixed(3));
      ring.setAttribute("style", "fill:none;stroke:var(--accent);stroke-width:2");
      g.append(ring);
    }
    return g;
  }

  function clusterNode(items, k) {
    const x = items.reduce((s, i) => s + i.x, 0) / items.length;
    const y = items.reduce((s, i) => s + i.y, 0) / items.length;
    const count = items.length;
    const r = (10 + Math.min(Math.log2(count) * 1.4, 6)) * k;
    const seen = items.filter((i) => visited.has(i.p.id)).length;
    const g = document.createElementNS(SVG, "g");
    g.dataset.cluster = items.map((i) => i.p.id).join(",");
    g.setAttribute("class", "mark cluster");
    g.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `${count} places${seen ? `, ${seen} visited` : ""}. Zoom in.`);
    const disc = document.createElementNS(SVG, "circle");
    disc.setAttribute("r", r.toFixed(3));
    disc.setAttribute("style", "fill:var(--paper);stroke:var(--ink);stroke-width:1.4");
    const text = document.createElementNS(SVG, "text");
    text.textContent = count > 999 ? `${Math.round(count / 100) / 10}k` : String(count);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("style", `font:600 ${(12 * k).toFixed(3)}px var(--sans);fill:var(--ink)`);
    g.append(disc, text);
    if (seen) {
      const badge = document.createElementNS(SVG, "circle");
      badge.setAttribute("cx", (r * 0.78).toFixed(3));
      badge.setAttribute("cy", (-r * 0.78).toFixed(3));
      badge.setAttribute("r", (5 * k).toFixed(3));
      badge.setAttribute("style", "fill:var(--accent);stroke:var(--paper);stroke-width:1.2");
      g.append(badge);
    }
    return g;
  }

  function renderScale(b) {
    const milesPerUnit = (KM_PER_UNIT / 1.609344) * 1;
    const pxPerMile = 1 / (milesPerUnit * b.k);
    let miles = NICE_MILES[0];
    for (const m of NICE_MILES) if (m * pxPerMile <= 130) miles = m;
    const width = miles * pxPerMile;
    scaleBar.style.setProperty("--bar", `${width}px`);
    scaleBar.querySelector("span").textContent = `${fmt(miles)} mi`;
  }

  function render() {
    if (!view || !shapes) return;
    const { w } = size();
    if (w < 80) return;
    const b = box();
    svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
    renderScale(b);

    const pad = 40 * b.k;
    const list = mapPlaces();
    const allowed = new Set(list.map((p) => p.id));
    const visible = projected.filter(
      (i) => allowed.has(i.p.id) && i.x > b.x - pad && i.x < b.x + b.w + pad && i.y > b.y - pad && i.y < b.y + b.h + pad,
    );
    const groups = cluster(visible, b);
    const nodes = [];
    const tabbable = groups.length <= 150;
    for (const items of groups) {
      nodes.push(items.length === 1 ? markerNode(items[0], b.k, tabbable) : clusterNode(items, b.k));
    }
    markGroup.replaceChildren(...nodes);

    trailGroup.replaceChildren();
    if (mapState.trail) {
      const pts = [...visited]
        .map((id) => projected.find((i) => i.p.id === id))
        .filter((i) => i && allowed.has(i.p.id));
      if (pts.length > 1) {
        const line = document.createElementNS(SVG, "polyline");
        line.setAttribute("points", pts.map((i) => `${i.x.toFixed(1)},${i.y.toFixed(1)}`).join(" "));
        line.setAttribute("style", "fill:none;stroke:var(--accent);stroke-width:1.8;stroke-dasharray:6 5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke");
        trailGroup.append(line);
      }
    }
    placePopover(b);
  }

  function placePopover(b) {
    const item = selected && projected.find((i) => i.p.id === selected);
    if (!item) {
      popover.hidden = true;
      return;
    }
    const px = (item.x - b.x) / b.k;
    const py = (item.y - b.y) / b.k;
    const p = item.p;
    popover.hidden = false;
    popover.replaceChildren(
      el("b", {}, p.name),
      el("span", {}, `${placeLine(p)} · ${fmt(p.acres)} acres`),
      el("button", { type: "button", class: "text-btn", onclick: () => ctx.openPlace(p) }, "Open place"),
    );
    const { w, h } = size();
    popover.style.left = `${Math.min(Math.max(px, 120), w - 120)}px`;
    popover.style.top = `${py > h / 2 ? py - 16 : py + 20}px`;
    popover.dataset.flip = py > h / 2 ? "up" : "down";
  }

  function updateStatus() {
    const list = mapPlaces();
    const onMap = new Set(projected.map((i) => i.p.id));
    const shown = list.filter((p) => onMap.has(p.id));
    const away = list.length - shown.length;
    const seen = shown.filter((p) => visited.has(p.id)).length;
    const parts = [`${fmt(shown.length)} ${shown.length === 1 ? "place" : "places"} shown`, `${fmt(seen)} visited`];
    if (away) parts.push(`${fmt(away)} outside the map`);
    if (!mapState.kinds.size) parts.splice(0, 2, "Pick a type to see places");
    status.textContent = parts.join(" · ");
  }

  function buildTools() {
    const chipFor = (k) =>
      el(
        "button",
        {
          type: "button",
          class: "chip layer",
          "aria-pressed": String(mapState.kinds.has(k.id)),
          style: `--chip:var(--k-${k.id})`,
          onclick: () => {
            if (!mapState.kinds.delete(k.id)) mapState.kinds.add(k.id);
            selected = null;
            refresh();
          },
        },
        el("i", { class: "swatch", "aria-hidden": "true" }),
        k.label,
      );
    const stateSelect = el(
      "select",
      {
        "aria-label": "Show one state",
        onchange: (e) => {
          mapState.state = e.target.value;
          selected = null;
          if (mapState.state && shapes.stateBounds[mapState.state]) fitTo(shapes.stateBounds[mapState.state], 0.25);
          else fitTo(shapes.bounds);
          clampView();
          refresh();
        },
      },
      el("option", { value: "" }, "All states"),
      ...allStates().map((s) => el("option", { value: s, selected: s === mapState.state }, s)),
    );
    tools.replaceChildren(
      el("div", { class: "chips" }, ...KINDS.map(chipFor)),
      el(
        "div",
        { class: "map-row" },
        el("label", { class: "select" }, stateSelect),
        el(
          "button",
          { type: "button", class: "chip", "aria-pressed": String(mapState.trail), onclick: () => ((mapState.trail = !mapState.trail), refresh()) },
          "Connect visited",
        ),
        el("button", { type: "button", class: "btn", onclick: () => ctx.openArt() }, icon("print"), "Print art"),
      ),
    );
  }

  function refresh() {
    ensureProjected();
    buildTools();
    updateStatus();
    schedule();
  }

  function pointerPos(e) {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = pointerPos(e);
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), px, py);
  }, { passive: false });

  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    moved = false;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    if (pointers.size === 2) {
      const [a, c] = [...pointers.values()];
      drag = { pinch: Math.hypot(a[0] - c[0], a[1] - c[1]) };
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !drag) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2 && drag.pinch) {
      const [a, c] = [...pointers.values()];
      const dist = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const r = svg.getBoundingClientRect();
      zoomAt(dist / drag.pinch, (a[0] + c[0]) / 2 - r.left, (a[1] + c[1]) / 2 - r.top);
      drag.pinch = dist;
      moved = true;
      return;
    }
    if (pointers.size !== 1 || drag.pinch) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) svg.setPointerCapture(e.pointerId);
    moved = true;
    const k = box().k;
    view.cx = drag.cx - dx * k;
    view.cy = drag.cy - dy * k;
    clampView();
    schedule();
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) drag = null;
    else if (pointers.size === 1) {
      const [x, y] = [...pointers.values()][0];
      drag = { x, y, cx: view.cx, cy: view.cy };
    }
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  function activate(target) {
    const clusterEl = target.closest("[data-cluster]");
    if (clusterEl) {
      const ids = new Set(clusterEl.dataset.cluster.split(","));
      const members = projected.filter((i) => ids.has(i.p.id));
      const bounds = members.reduce(
        (a, i) => [Math.min(a[0], i.x), Math.min(a[1], i.y), Math.max(a[2], i.x), Math.max(a[3], i.y)],
        [Infinity, Infinity, -Infinity, -Infinity],
      );
      const before = view.w;
      fitTo(bounds, 0.35);
      view.w = Math.min(view.w, before / 1.6);
      clampView();
      schedule();
      return;
    }
    const markEl = target.closest("[data-id]");
    selected = markEl ? markEl.dataset.id : null;
    schedule();
  }

  svg.addEventListener("click", (e) => {
    if (moved) return;
    activate(e.target);
  });
  svg.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(e.target);
    }
    if (e.key === "Escape") {
      selected = null;
      schedule();
    }
  });

  const zoomButton = (label, name, factor) =>
    el("button", { type: "button", class: "icon-btn", "aria-label": label, onclick: () => zoomAt(factor, size().w / 2, size().h / 2) }, icon(name));
  $("#mapZoom").replaceChildren(
    zoomButton("Zoom in", "plus", 1.6),
    zoomButton("Zoom out", "minus", 1 / 1.6),
    el("button", { type: "button", class: "icon-btn", "aria-label": "Reset view", onclick: () => (fitTo(shapes.bounds), clampView(), (selected = null), schedule()) }, icon("fit")),
  );

  new ResizeObserver(() => schedule()).observe(stage);
  onChange(() => {
    updateStatus();
    schedule();
  });
  ctx.landsReady.then(() => {
    if (shapes) refresh();
  });

  return {
    async show() {
      if (!shapes) {
        try {
          shapes = await loadMapShapes();
        } catch {
          status.textContent = "The map couldn't load. Reload the page to try again.";
          return;
        }
        baseGroup.replaceChildren(
          ...shapes.paths.map(({ st, d }) => {
            const path = document.createElementNS(SVG, "path");
            path.setAttribute("d", d);
            path.dataset.state = st;
            return path;
          }),
        );
        const [x1, y1, x2, y2] = shapes.bounds;
        full = { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: (x2 - x1) * 1.12, h: (y2 - y1) * 1.12 };
        fitTo(shapes.bounds);
      }
      refresh();
    },
  };
}
