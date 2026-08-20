const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const KEY = "parks-and-scale-onboarded";
const VISIT_KEY = "pas-visited";
const SAVE_KEY = "pas-saved";

const STEPS = [
  { title: "These are the real maps.", copy: "Each outline is the official park boundary. Not a circle. Not a cartoon." },
  { title: "Tap a photo to change parks.", copy: "The larger park is the ground. The smaller one sits on top at its true size." },
  { title: "Keep a list.", copy: "Open any park page. Check Been here. Save the ones you still want." },
];

let parks = [];
let bigName = "Yellowstone";
let smallName = "Arches";
let picking = null;
let focus = "Yellowstone";
let dossierPark = null;
let obStep = 0;
let filter = "all";
let visited = new Set();
let saved = new Set();

const byName = (name) => parks.find((p) => p.name === name);
const clean = (t) => (t || "").replace(/\s*\(\s*$/, "").trim();
const slug = (p) => p.slug || p.name;

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
function miniMap(p) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", fitBox(p));
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", p.shape.d);
  path.setAttribute("fill", p.acres > 1000000 ? "#e8c572" : "#d4784a");
  svg.append(path);
  return svg;
}
function setPhoto(el, p) {
  el.textContent = "";
  el.append(miniMap(p));
}

function ordered() {
  const a = byName(bigName);
  const b = byName(smallName);
  if (!a || !b) return [a, b];
  if (a.name === b.name) {
    const other = parks.find((p) => p.name !== a.name) || a;
    return a.acres >= other.acres ? [a, other] : [other, a];
  }
  return a.acres >= b.acres ? [a, b] : [b, a];
}

function neighbors(p) {
  const sorted = parks.slice().sort((a, b) => a.acres - b.acres);
  const i = sorted.findIndex((x) => x.name === p.name);
  return { smaller: sorted[i - 1], larger: sorted[i + 1] };
}

function yellowstoneFits(p) {
  const y = byName("Yellowstone");
  if (!y || p.name === y.name) return null;
  return y.acres / p.acres;
}

function interesting(p, other) {
  const bits = [];
  const perAcre = p.acres ? p.visitors / p.acres : 0;
  bits.push(`${fmt(perAcre, 1)} visitors per acre last year`);
  if (other && other.name !== p.name && p.visitors > other.visitors && p.acres < other.acres) {
    bits.push(`More visitors than ${other.name}, on less land`);
  }
  if (p.year === 1872) bits.push("The first U.S. national park");
  if (p.states.includes("AK")) bits.push("Alaska parks hold most of the system’s land");
  return bits.join(" · ");
}

function fillDl(dl, rows) {
  dl.textContent = "";
  rows.forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  });
}

function showFacts(p, other) {
  if (!p) return;
  focus = p.name;
  $("#factKicker").textContent = `#${p.rank} of 63 by land`;
  $("#factName").textContent = p.name;
  fillDl($("#factStats"), [
    ["Acres", fmt(p.acres)],
    ["Square km", fmt(p.km2, 1)],
    ["Visitors", fmt(p.visitors)],
    ["Established", String(p.year || "—")],
    ["Where", p.states.join(" / ")],
    ["Age", p.year ? `${new Date().getFullYear() - p.year} years` : "—"],
  ]);
  $("#factCopy").textContent = clean(p.description);
  $("#factExtra").textContent = interesting(p, other);
}

function updateProgress() {
  const acres = parks.filter((p) => visited.has(slug(p))).reduce((s, p) => s + p.acres, 0);
  const total = parks.reduce((s, p) => s + p.acres, 0);
  const pct = total ? Math.round((acres / total) * 100) : 0;
  $("#progress").textContent = `${visited.size} of 63 visited · ${saved.size} saved${visited.size ? ` · ${pct}% of park land` : ""}`;
}

function draw() {
  const [outer, inner] = ordered();
  if (!outer || !inner) return;
  bigName = outer.name;
  smallName = inner.name;
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
      ? `${outer.name} could hold ${fmt(times, 1)} parks the size of ${inner.name}.`
      : `${outer.name} and ${inner.name} are nearly the same size.`;
  $("#hint").textContent = "Same scale. North is up. Tap a shape to open its page.";
  $("#pairNote").textContent = "Open a park page to check it off or save it for later.";
  showFacts(byName(focus) && (focus === outer.name || focus === inner.name) ? byName(focus) : outer, inner);
  history.replaceState(null, "", `#${encodeURIComponent(outer.name)}/${encodeURIComponent(inner.name)}`);
  updateProgress();
}

function openDossier(p) {
  dossierPark = p;
  $("#dossier").hidden = false;
  $("#dossier").removeAttribute("hidden");
  $("#dossierName").textContent = p.name;
  $("#dossierKicker").textContent = `#${p.rank} of 63 · ${p.states.join(" / ")}`;
  setPhoto($("#dossierMap"), p);
  fillDl($("#dossierStats"), [
    ["Acres", fmt(p.acres)],
    ["Square km", fmt(p.km2, 1)],
    ["Visitors", fmt(p.visitors)],
    ["Established", String(p.year || "—")],
    ["Where", p.states.join(" / ")],
    ["Age", p.year ? `${new Date().getFullYear() - p.year} years` : "—"],
  ]);
  $("#dossierCopy").textContent = clean(p.description);
  const fun = $("#dossierFun");
  fun.textContent = "";
  const n = neighbors(p);
  const yFit = yellowstoneFits(p);
  const lines = [];
  if (n.larger) lines.push(`Next larger: ${n.larger.name} (${fmt(n.larger.acres)} acres)`);
  if (n.smaller) lines.push(`Next smaller: ${n.smaller.name} (${fmt(n.smaller.acres)} acres)`);
  if (yFit && yFit >= 1.05) lines.push(`${fmt(yFit, 1)} of these would fit in Yellowstone`);
  if (yFit && yFit < 1) lines.push(`Yellowstone would fit inside this park ${fmt(1 / yFit, 1)} times`);
  lines.push(`${fmt(p.visitors / Math.max(p.acres, 1), 1)} visitors per acre in 2023`);
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
    if (dossierPark && dossierPark.name === p.name) openDossier(p);
  };
  const pic = document.createElement("span");
  pic.className = "photo";
  setPhoto(pic, p);
  const body = document.createElement("button");
  body.type = "button";
  body.className = "body";
  const b = document.createElement("b");
  b.textContent = p.name;
  const small = document.createElement("small");
  small.textContent = `${fmt(p.acres)} acres · ${p.states.join("/")}`;
  body.append(b, small);
  body.onclick = () => {
    if (mode === "choose") choose(p);
    else openDossier(p);
  };
  wrap.append(been, pic, body);
  return wrap;
}

function renderChooser(q = "") {
  const root = $("#chooserCards");
  root.textContent = "";
  const hits = parks.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  if (!hits.length) {
    const empty = document.createElement("p");
    empty.textContent = "No park by that name. Try Zion, Denali, or Acadia.";
    root.append(empty);
    return;
  }
  hits.forEach((p) => root.append(cardEl(p, "choose")));
}

function renderAtlas() {
  const q = ($("#atlasSearch").value || "").toLowerCase();
  const root = $("#allCards");
  root.textContent = "";
  const list = parks.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    const id = slug(p);
    if (filter === "been") return visited.has(id);
    if (filter === "saved") return saved.has(id);
    if (filter === "left") return !visited.has(id);
    return true;
  });
  if (!list.length) {
    const empty = document.createElement("p");
    empty.textContent = "Nothing in this list yet.";
    root.append(empty);
    return;
  }
  list.forEach((p) => root.append(cardEl(p, "dossier")));
}

function openChooser(role) {
  picking = role;
  $("#chooser").hidden = false;
  $("#chooserTitle").textContent = role === "big" ? "Pick the larger park" : "Pick the smaller park";
  $("#search").value = "";
  renderChooser();
  $("#search").focus();
}
function closeChooser() {
  picking = null;
  $("#chooser").hidden = true;
}
function choose(p) {
  if (picking === "big") bigName = p.name;
  else smallName = p.name;
  focus = p.name;
  closeChooser();
  draw();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function randomPair() {
  const a = parks[Math.floor(Math.random() * parks.length)];
  let b = parks[Math.floor(Math.random() * parks.length)];
  if (b.name === a.name) b = parks[(parks.indexOf(a) + 7) % parks.length];
  bigName = a.name;
  smallName = b.name;
  focus = a.name;
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
    if (byName(a) && byName(b)) {
      bigName = a;
      smallName = b;
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
    const p = byName(focus);
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
    smallName = dossierPark.name;
    focus = dossierPark.name;
    closeDossier();
    draw();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  $$(".chip").forEach((chip) => {
    chip.onclick = () => {
      filter = chip.dataset.filter;
      $$(".chip").forEach((c) => c.classList.toggle("on", c === chip));
      renderAtlas();
    };
  });
  $("#atlasSearch").oninput = renderAtlas;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#onboard").hidden) hideOnboard();
    if (!$("#chooser").hidden) closeChooser();
    if (!$("#dossier").hidden) closeDossier();
  });
  $("#search").oninput = (e) => renderChooser(e.target.value);
  draw();
  renderAtlas();
  try {
    if (!localStorage.getItem(KEY)) showOnboard(0);
  } catch (e) {}
}

Promise.all([fetch("parks.json").then((r) => r.json()), fetch("shapes.json").then((r) => r.json())])
  .then(([meta, geo]) => {
    const shapes = Object.fromEntries(geo.parks.map((s) => [s.name, s]));
    parks = meta.filter((p) => shapes[p.name]).map((p) => ({ ...p, shape: shapes[p.name] }));
    if (parks.length < 63) throw new Error("missing parks");
    boot();
  })
  .catch(() => {
    document.body.insertAdjacentText("afterbegin", "Could not load park data. Refresh and try again.");
  });
