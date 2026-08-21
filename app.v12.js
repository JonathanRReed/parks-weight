const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const KEY = "parks-and-scale-onboarded";
const VISIT_KEY = "pas-visited";
const SAVE_KEY = "pas-saved";
const CARD_CAP = 72;

const KINDS = [
  { id: "national_park", label: "National parks" },
  { id: "national_forest", label: "National forests" },
  { id: "state_forest", label: "State forests" },
  { id: "state_park", label: "State parks" },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label.replace(/s$/, "")]));
const FILL = {
  national_park: "#e8c572",
  national_forest: "#6ea36e",
  state_forest: "#b7c56e",
  state_park: "#5ea8c9",
};

const STEPS = [
  { title: "These are the real maps.", copy: "Each outline is an official boundary. Not a circle. Not a cartoon." },
  { title: "Tap a photo to change places.", copy: "The larger one is the ground. The smaller one sits on top at its true size. Mix a park with a forest." },
  { title: "Keep a list.", copy: "Open any page. Check Been here. Save the ones you still want." },
];

let parks = [];
let bigName = "Yellowstone";
let smallName = "Arches";
let picking = null;
let focus = "Yellowstone";
let dossierPark = null;
let obStep = 0;
let kindFilter = "all";
let listFilter = "all";
let chooserKind = "all";
let stateFilter = "";
let mapMode = false;
let mapScale = 1;
let mapTx = 0;
let mapTy = 0;
let mapDrag = null;
let visited = new Set();
let saved = new Set();

const byName = (name) => parks.find((p) => p.name === name) || parks.find((p) => p.slug === name);
const byId = (id) => parks.find((p) => p.slug === id || p.name === id);
const clean = (t) => (t || "").replace(/\s*\(\s*$/, "").trim();
const slug = (p) => p.slug || p.name;
const kindOf = (p) => p.kind || "national_park";
const kindCount = (kind) => parks.filter((p) => kindOf(p) === kind).length;
const kindLabel = (kind) => KIND_LABEL[kind] || "place";

function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch (e) {
    return new Set();
  }
}
function storeSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (e) {}
}

function radius(p) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  return Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2), 12);
}
function fitBox(p, pad = 1.22) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const s = Math.max(x2 - x1, y2 - y1, 24) * pad;
  return `${cx - s / 2} ${cy - s / 2} ${s} ${s}`;
}
function fillFor(p) {
  if (kindOf(p) === "national_park") return p.acres > 1000000 ? "#e8c572" : "#d4784a";
  return FILL[kindOf(p)] || "#d4784a";
}
function miniMap(p) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", fitBox(p));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", p.shape.d);
  path.setAttribute("fill", fillFor(p));
  svg.append(path);
  return svg;
}
function setPhoto(el, p) {
  el.textContent = "";
  el.append(miniMap(p));
}

function ordered() {
  const a = byId(bigName);
  const b = byId(smallName);
  if (!a || !b) return [a, b];
  if (a.slug === b.slug) {
    const other = parks.find((p) => p.slug !== a.slug) || a;
    return a.acres >= other.acres ? [a, other] : [other, a];
  }
  return a.acres >= b.acres ? [a, b] : [b, a];
}

function neighbors(p) {
  const sorted = parks.slice().sort((a, b) => a.acres - b.acres);
  const i = sorted.findIndex((x) => x.slug === p.slug);
  return { smaller: sorted[i - 1], larger: sorted[i + 1] };
}

function yellowstoneFits(p) {
  const y = byName("Yellowstone");
  if (!y || p.slug === y.slug) return null;
  return y.acres / p.acres;
}

function interesting(p, other) {
  const bits = [];
  if (p.visitors) bits.push(`${fmt(p.visitors / Math.max(p.acres, 1), 1)} visitors per acre last year`);
  if (other && other.slug !== p.slug && p.visitors > other.visitors && p.acres < other.acres) {
    bits.push(`More visitors than ${other.name}, on less land`);
  }
  if (p.year === 1872) bits.push("The first U.S. national park");
  if ((p.states || []).includes("AK")) bits.push("Alaska holds a huge share of the country’s public land");
  return bits.join(" · ");
}

function fillDl(dl, rows) {
  dl.textContent = "";
  rows.filter((row) => row[1] && row[1] !== "0").forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  });
}

function statsRows(p) {
  const rows = [
    ["Acres", fmt(p.acres)],
    ["Square km", fmt(p.km2, 1)],
    ["Where", (p.states || []).join(" / ") || "—"],
  ];
  if (p.visitors) rows.splice(2, 0, ["Visitors", fmt(p.visitors)]);
  if (p.year) {
    rows.push(["Established", String(p.year)]);
    rows.push(["Age", `${new Date().getFullYear() - p.year} years`]);
  }
  return rows;
}

function showFacts(p, other) {
  if (!p) return;
  focus = p.slug;
  const n = kindCount(kindOf(p));
  $("#factKicker").textContent = `#${p.rank} of ${fmt(n)} ${kindLabel(kindOf(p))}s by land`;
  $("#factName").textContent = p.name;
  fillDl($("#factStats"), statsRows(p));
  $("#factCopy").textContent = clean(p.description);
  $("#factExtra").textContent = interesting(p, other);
}

function updateProgress() {
  $("#progress").textContent = `${visited.size} of ${fmt(parks.length)} places visited · ${saved.size} saved`;
}

function renderCompareMode() {
  const [outer, inner] = ordered();
  if (!outer || !inner) return;
  bigName = outer.slug;
  smallName = inner.slug;
  $("#bigName").textContent = outer.name;
  $("#smallName").textContent = inner.name;
  setPhoto($("#bigPhoto"), outer);
  setPhoto($("#smallPhoto"), inner);
  const svg = $("#map");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const r = Math.max(radius(outer), radius(inner)) * 1.16;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
  [
    [outer, "big"],
    [inner, "small"],
  ].forEach(([p, cls]) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.shape.d);
    path.setAttribute("class", cls);
    path.setAttribute("fill", fillFor(p));
    path.addEventListener("click", () => {
      showFacts(p, p === outer ? inner : outer);
      openDossier(p);
    });
    svg.append(path);
  });
  const addLabel = (text, y) => {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "label");
    t.setAttribute("x", "0");
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("fill", "#f4efe6");
    t.setAttribute("font-size", String(Math.max(r * 0.05, 20)));
    t.textContent = text;
    svg.append(t);
  };
  addLabel(outer.name, -r * 0.86);
  addLabel(inner.name, r * 0.88);
  const times = outer.acres / inner.acres;
  $("#punch").textContent =
    times >= 1.05
      ? `${outer.name} could hold ${fmt(times, 1)} lands the size of ${inner.name}.`
      : `${outer.name} and ${inner.name} are nearly the same size.`;
  $("#hint").textContent = "Same scale. North is up. Tap a shape to open its page.";
  $("#pairNote").textContent = "Open a page to check it off or save it. Mix parks with forests.";
  const focused = byId(focus);
  showFacts(focused && (focused.slug === outer.slug || focused.slug === inner.slug) ? focused : outer, inner);
  history.replaceState(null, "", `#${encodeURIComponent(outer.slug)}/${encodeURIComponent(inner.slug)}`);
  updateProgress();
}

function renderUsMapMode() {
  const svg = $("#map");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", "-180 -90 360 180");

  const places = atlasList();
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.setAttribute("class", "map-layer");
  layer.setAttribute("transform", `translate(${mapTx} ${mapTy}) scale(${mapScale})`);

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "-180");
  bg.setAttribute("y", "-90");
  bg.setAttribute("width", "360");
  bg.setAttribute("height", "180");
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "rgba(244, 239, 230, 0.22)");
  bg.setAttribute("stroke-width", "0.4");
  layer.append(bg);

  places.forEach((p) => {
    const lon = p.lon;
    const lat = p.lat;
    if (typeof lon !== "number" || typeof lat !== "number") return;
    const cx = lon;
    const cy = -lat;
    const id = slug(p);
    const visitedHere = visited.has(id);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const size = Math.min(3.8, Math.max(1.3, Math.log10(Math.max(2, p.acres)) / 4));
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", String(size));
    dot.setAttribute("fill", fillFor(p));
    dot.setAttribute("stroke", visitedHere ? "#84f4a4" : "rgba(244, 239, 230, 0.55)");
    dot.setAttribute("stroke-width", visitedHere ? "0.8" : "0.4");
    dot.setAttribute("data-name", p.name);
    dot.setAttribute("title", `${p.name} — ${kindLabel(kindOf(p))} (${visitedHere ? "visited" : "not yet"})`);
    dot.addEventListener("click", () => openDossier(p));
    layer.append(dot);

    if (stateFilter && !(p.states || []).includes(stateFilter)) return;
    if (visitedHere) {
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.setAttribute("cx", String(cx));
      halo.setAttribute("cy", String(cy));
      halo.setAttribute("r", String(size + 0.6));
      halo.setAttribute("fill", "none");
      halo.setAttribute("stroke", "#9ef2a5");
      halo.setAttribute("stroke-width", "0.3");
      halo.setAttribute("opacity", "0.7");
      layer.append(halo);
    }
  });

  const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
  title.setAttribute("x", "-176");
  title.setAttribute("y", "-79");
  title.setAttribute("fill", "#d5ddd2");
  title.setAttribute("font-size", "5");
  title.textContent = `Showing ${fmt(places.length)} places · green = visited`;
  layer.append(title);

  svg.append(layer);
  syncMapTransform();
  $("#punch").textContent = "Showing every selected place on a U.S. map.";
  $("#hint").textContent = "Scroll to zoom; drag to pan; click any dot for details.";
  $("#pairNote").textContent = "In this view, circles are sized by relative scale.";
  updateProgress();
}

function syncMapTransform() {
  const layer = $("#map").querySelector(".map-layer");
  if (layer) layer.setAttribute("transform", `translate(${mapTx} ${mapTy}) scale(${mapScale})`);
}

function setMapMode(on) {
  mapMode = on;
  const btn = $("#btnMap");
  btn.classList.toggle("on", mapMode);
  if (mapMode) {
    mapScale = 1;
    mapTx = 0;
    mapTy = 0;
  }
  draw();
}

function draw() {
  if (mapMode) return renderUsMapMode();
  renderCompareMode();
}


function openDossier(p) {
  dossierPark = p;
  $("#dossier").hidden = false;
  $("#dossier").removeAttribute("hidden");
  $("#dossierName").textContent = p.name;
  $("#dossierKicker").textContent = `${kindLabel(kindOf(p))} · #${p.rank} of ${fmt(kindCount(kindOf(p)))} · ${(p.states || []).join(" / ")}`;
  setPhoto($("#dossierMap"), p);
  fillDl($("#dossierStats"), statsRows(p));
  $("#dossierCopy").textContent = clean(p.description);
  const fun = $("#dossierFun");
  fun.textContent = "";
  const n = neighbors(p);
  const yFit = yellowstoneFits(p);
  const lines = [];
  if (n.larger) lines.push(`Next larger anywhere: ${n.larger.name} (${fmt(n.larger.acres)} acres)`);
  if (n.smaller) lines.push(`Next smaller anywhere: ${n.smaller.name} (${fmt(n.smaller.acres)} acres)`);
  if (yFit && yFit >= 1.05) lines.push(`${fmt(yFit, 1)} of these would fit in Yellowstone`);
  if (yFit && yFit < 1) lines.push(`Yellowstone would fit inside this ${fmt(1 / yFit, 1)} times`);
  if (p.visitors) lines.push(`${fmt(p.visitors / Math.max(p.acres, 1), 1)} visitors per acre in 2023`);
  if (p.year === 1872) lines.push("The first U.S. national park");
  lines.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    fun.append(li);
  });
  $("#dossierWiki").href = p.wiki || "#";
  $("#dossierWiki").hidden = !p.wiki;
  $("#beenHere").classList.toggle("on", visited.has(slug(p)));
  $("#savePark").classList.toggle("on", saved.has(slug(p)));
}

function closeDossier() {
  $("#dossier").hidden = true;
  $("#dossier").setAttribute("hidden", "");
  dossierPark = null;
}

function cardEl(p, mode) {
  const wrap = document.createElement("article");
  wrap.className = "card";
  if (visited.has(slug(p))) wrap.classList.add("visited");
  if (saved.has(slug(p))) wrap.classList.add("saved");
  const been = document.createElement("button");
  been.type = "button";
  been.className = "been";
  been.title = "Been here";
  been.setAttribute("aria-pressed", visited.has(slug(p)) ? "true" : "false");
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mark.setAttribute("viewBox", "0 0 24 24");
  const mp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  mp.setAttribute("fill", "none");
  mp.setAttribute("stroke", "currentColor");
  mp.setAttribute("stroke-width", "2.2");
  mp.setAttribute("d", "M5 12l5 5 9-10");
  mark.append(mp);
  been.append(mark);
  been.onclick = (e) => {
    e.stopPropagation();
    const id = slug(p);
    if (visited.has(id)) visited.delete(id);
    else visited.add(id);
    storeSet(VISIT_KEY, visited);
    renderAtlas();
    updateProgress();
    if (dossierPark && dossierPark.slug === p.slug) openDossier(p);
  };
  const pic = document.createElement("span");
  pic.className = "photo";
  setPhoto(pic, p);
  const body = document.createElement("button");
  body.type = "button";
  body.className = "body";
  const tag = document.createElement("small");
  tag.className = "kind-tag";
  tag.textContent = kindLabel(kindOf(p));
  const b = document.createElement("b");
  b.textContent = p.name;
  const small = document.createElement("small");
  small.textContent = `${fmt(p.acres)} acres · ${(p.states || []).join("/")}`;
  body.append(tag, b, small);
  body.onclick = () => {
    if (mode === "choose") choose(p);
    else openDossier(p);
  };
  wrap.append(been, pic, body);
  return wrap;
}

function matchesQuery(p, q) {
  if (!q) return true;
  const blob = `${p.name} ${(p.states || []).join(" ")} ${kindLabel(kindOf(p))}`.toLowerCase();
  return blob.includes(q);
}

function renderChooser(q = "") {
  const root = $("#chooserCards");
  root.textContent = "";
  const query = q.toLowerCase().trim();
  let hits = parks.filter((p) => {
    if (chooserKind !== "all" && kindOf(p) !== chooserKind) return false;
    return matchesQuery(p, query);
  });
  hits.sort((a, b) => b.acres - a.acres);
  const needQuery = hits.length > CARD_CAP && query.length < 2;
  if (needQuery) hits = hits.slice(0, CARD_CAP);
  if (!hits.length) {
    const empty = document.createElement("p");
    empty.textContent = "Nothing by that name. Try Tongass, Anza-Borrego, or Zion.";
    root.append(empty);
    return;
  }
  hits.forEach((p) => root.append(cardEl(p, "choose")));
}

function atlasList() {
  const q = ($("#atlasSearch").value || "").toLowerCase().trim();
  return parks.filter((p) => {
    if (kindFilter !== "all" && kindOf(p) !== kindFilter) return false;
    if (stateFilter && !(p.states || []).includes(stateFilter)) return false;
    if (q && !matchesQuery(p, q)) return false;
    const id = slug(p);
    if (listFilter === "been") return visited.has(id);
    if (listFilter === "saved") return saved.has(id);
    if (listFilter === "left") return !visited.has(id);
    return true;
  }).sort((a, b) => b.acres - a.acres);
}

function renderAtlas() {
  const q = ($("#atlasSearch").value || "").toLowerCase().trim();
  const root = $("#allCards");
  root.textContent = "";
  let list = atlasList();
  const total = list.length;
  const capped = list.length > CARD_CAP && q.length < 2 && listFilter === "all";
  if (capped) list = list.slice(0, CARD_CAP);
  $("#atlasNote").textContent = capped
    ? `Showing the ${CARD_CAP} largest of ${fmt(total)}. Search or pick a state to see the rest.`
    : `${fmt(total)} in this list.`;
  if (!list.length) {
    const empty = document.createElement("p");
    empty.textContent = "Nothing in this list yet.";
    root.append(empty);
    return;
  }
  list.forEach((p) => root.append(cardEl(p, "dossier")));
}

function fillStatePick() {
  const sel = $("#statePick");
  const prev = sel.value;
  const states = [...new Set(parks.filter((p) => kindFilter === "all" || kindOf(p) === kindFilter).flatMap((p) => p.states || []))].sort();
  sel.textContent = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All states";
  sel.append(all);
  states.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    sel.append(opt);
  });
  sel.value = states.includes(prev) ? prev : "";
  stateFilter = sel.value;
}

function renderFilters() {
  const root = $("#filters");
  root.textContent = "";

  const addChip = (id, label, active, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip kind";
    btn.classList.toggle("on", active);
    btn.textContent = label;
    btn.onclick = onClick;
    root.append(btn);
  };

  addChip("all", `All places (${fmt(parks.length)})`, listFilter === "all" && kindFilter === "all", () => {
    kindFilter = "all";
    listFilter = "all";
    fillStatePick();
    renderFilters();
    renderAtlas();
  });

  addChip("been", "Been there", listFilter === "been", () => {
    listFilter = "been";
    kindFilter = "all";
    fillStatePick();
    renderFilters();
    renderAtlas();
  });

  addChip("saved", "Saved", listFilter === "saved", () => {
    listFilter = "saved";
    kindFilter = "all";
    fillStatePick();
    renderFilters();
    renderAtlas();
  });

  KINDS.forEach((k) => {
    addChip(k.id, `${k.label} (${fmt(kindCount(k.id))})`, listFilter === "all" && kindFilter === k.id, () => {
      kindFilter = k.id;
      listFilter = "all";
      fillStatePick();
      renderFilters();
      renderAtlas();
    });
  });
}

function renderChooserKinds() {
  const root = $("#chooserKinds");
  root.textContent = "";
  [{ id: "all", label: "All" }, ...KINDS].forEach((k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip kind";
    btn.classList.toggle("on", chooserKind === k.id);
    btn.textContent = k.label;
    btn.onclick = () => {
      chooserKind = k.id;
      renderChooserKinds();
      renderChooser($("#search").value);
    };
    root.append(btn);
  });
}

function openChooser(role) {
  picking = role;
  $("#chooser").hidden = false;
  $("#chooserTitle").textContent = role === "big" ? "Pick the larger place" : "Pick the smaller place";
  $("#search").value = "";
  chooserKind = "all";
  renderChooserKinds();
  renderChooser();
  $("#search").focus();
}
function closeChooser() {
  picking = null;
  $("#chooser").hidden = true;
}
function choose(p) {
  if (picking === "big") bigName = p.slug;
  else smallName = p.slug;
  focus = p.slug;
  closeChooser();
  draw();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function randomPair() {
  const pool = parks.filter((p) => kindOf(p) === kindFilter || kindFilter === "all");
  const src = pool.length > 1 ? pool : parks;
  const a = src[Math.floor(Math.random() * src.length)];
  let b = src[Math.floor(Math.random() * src.length)];
  if (b.slug === a.slug) b = src[(src.indexOf(a) + 7) % src.length];
  bigName = a.slug;
  smallName = b.slug;
  focus = a.slug;
  draw();
}
function hideOnboard() {
  const el = $("#onboard");
  el.hidden = true;
  el.setAttribute("hidden", "");
  try {
    localStorage.setItem(KEY, "1");
  } catch (e) {}
}
function showOnboard(i = 0) {
  obStep = i;
  const el = $("#onboard");
  el.hidden = false;
  el.removeAttribute("hidden");
  $("#obTitle").textContent = STEPS[i].title;
  $("#obCopy").textContent = STEPS[i].copy;
  $("#obDots").textContent = `${i + 1} / ${STEPS.length}`;
  $("#obNext").textContent = i === STEPS.length - 1 ? "See the parks" : "Next";
  $("#obSkip").hidden = i === STEPS.length - 1;
  $("#obNext").focus();
}

function boot() {
  visited = loadSet(VISIT_KEY);
  saved = loadSet(SAVE_KEY);
  const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (hash.includes("/")) {
    const [a, b] = hash.split("/");
    if (byId(a) && byId(b)) {
      bigName = byId(a).slug;
      smallName = byId(b).slug;
    }
  }
  $("#pickBig").onclick = () => openChooser("big");
  $("#pickSmall").onclick = () => openChooser("small");
  $("#closeChooser").onclick = closeChooser;
  $("#btnSwap").onclick = () => {
    const t = bigName;
    bigName = smallName;
    smallName = t;
    draw();
  };
  $("#btnShuffle").onclick = randomPair;
  $("#btnHelp").onclick = () => showOnboard(0);
  $("#btnMap").onclick = () => setMapMode(!mapMode);
  $("#obSkip").onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideOnboard();
  };
  $("#obNext").onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (obStep >= STEPS.length - 1) hideOnboard();
    else showOnboard(obStep + 1);
  };
  $("#onboard").addEventListener("click", (e) => {
    if (e.target.id === "onboard") hideOnboard();
  });
  $("#openDossier").onclick = () => {
    const p = byId(focus);
    if (p) openDossier(p);
  };
  $("#closeDossier").onclick = closeDossier;
  $("#beenHere").onclick = () => {
    if (!dossierPark) return;
    const id = slug(dossierPark);
    if (visited.has(id)) visited.delete(id);
    else visited.add(id);
    storeSet(VISIT_KEY, visited);
    openDossier(dossierPark);
    renderAtlas();
    updateProgress();
  };
  $("#savePark").onclick = () => {
    if (!dossierPark) return;
    const id = slug(dossierPark);
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    storeSet(SAVE_KEY, saved);
    openDossier(dossierPark);
    renderAtlas();
    updateProgress();
  };
  $("#comparePark").onclick = () => {
    if (!dossierPark) return;
    smallName = dossierPark.slug;
    focus = dossierPark.slug;
    closeDossier();
    draw();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  $("#statePick").onchange = (e) => {
    stateFilter = e.target.value;
    renderAtlas();
    if (mapMode) draw();
  };
  $("#atlasSearch").oninput = (e) => {
    renderAtlas();
    if (mapMode) draw();
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#onboard").hidden) hideOnboard();
    if (!$("#chooser").hidden) closeChooser();
    if (!$("#dossier").hidden) closeDossier();
  });
  $("#search").oninput = (e) => renderChooser(e.target.value);
  const map = $("#map");
  map.addEventListener(
    "wheel",
    (e) => {
      if (!mapMode) return;
      e.preventDefault();
      const scaleBy = e.deltaY < 0 ? 1.12 : 0.9;
      mapScale = Math.min(10, Math.max(0.4, mapScale * scaleBy));
      syncMapTransform();
    },
    { passive: false }
  );
  map.addEventListener("pointerdown", (e) => {
    if (!mapMode) return;
    map.setPointerCapture(e.pointerId);
    mapDrag = { x: e.clientX, y: e.clientY, tx: mapTx, ty: mapTy };
  });
  map.addEventListener("pointermove", (e) => {
    if (!mapMode || !mapDrag) return;
    mapTx = mapDrag.tx + (e.clientX - mapDrag.x) / 180;
    mapTy = mapDrag.ty + (e.clientY - mapDrag.y) / 180;
    syncMapTransform();
  });
  map.addEventListener("pointerup", (e) => {
    if (mapDrag) {
      mapDrag = null;
      map.releasePointerCapture(e.pointerId);
    }
  });
  map.addEventListener("pointerleave", () => {
    mapDrag = null;
  });
  fillStatePick();
  renderFilters();
  draw();
  renderAtlas();
  try {
    if (!localStorage.getItem(KEY)) showOnboard(0);
  } catch (e) {}
}

Promise.all([
  fetch("parks.json").then((r) => r.json()),
  fetch("shapes.json").then((r) => r.json()),
  fetch("lands.json").then((r) => r.json()),
  fetch("land-shapes.json").then((r) => r.json()),
])
  .then(([meta, geo, lands, landGeo]) => {
    const npShapes = Object.fromEntries(geo.parks.map((s) => [s.name, s]));
    const np = meta.filter((p) => npShapes[p.name]).map((p) => ({
      ...p,
      kind: "national_park",
      shape: npShapes[p.name],
    }));
    if (np.length < 63) throw new Error("missing parks");
    const extras = lands.map((p, i) => ({ ...p, shape: landGeo.lands[i] })).filter((p) => p.shape && p.shape.d);
    parks = np.concat(extras);
    boot();
  })
  .catch(() => {
    document.body.insertAdjacentText("afterbegin", "Could not load park data. Refresh and try again.");
  });
