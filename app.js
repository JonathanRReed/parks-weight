const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const PARK_COLORS = ["#d4f06a", "#e15b38", "#f0d38a", "#7eb8a0", "#f4f7e8", "#c07a4a"];
const COUNTRY_COLORS = ["#23493a", "#3e6a52", "#1f3a2e", "#4d735c", "#305544"];

let parks = [];
let shapes = { parks: [], countries: [] };
let selected = new Set();
let active = null;

const parkMeta = (name) => parks.find((p) => p.name === name);
const shapeByName = (name) =>
  shapes.parks.find((s) => s.name === name) || shapes.countries.find((s) => s.name === name);

function color(shape) {
  const list = shape.kind === "park" ? shapes.parks : shapes.countries;
  const i = Math.max(0, list.findIndex((s) => s.name === shape.name));
  return (shape.kind === "park" ? PARK_COLORS : COUNTRY_COLORS)[i % (shape.kind === "park" ? PARK_COLORS.length : COUNTRY_COLORS.length)];
}

function radius(shape) {
  const [x1, y1, x2, y2] = shape.bbox;
  return Math.max(Math.hypot(x1, y1), Math.hypot(x2, y2), Math.hypot(x1, y2), Math.hypot(x2, y1), 8);
}

function drawOverlay(svg, list, opts = {}) {
  const dark = !!opts.dark;
  svg.innerHTML = "";
  if (!list.length) return 0;
  const pad = 1.12;
  const r = Math.max(...list.map(radius)) * pad;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
  const maxR = Math.max(...list.map(radius));
  list.forEach((shape) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", shape.d);
    path.setAttribute("class", shape.kind === "park" ? "sil-park" : "sil-country");
    path.setAttribute("fill", color(shape));
    path.setAttribute("stroke-width", String(Math.max(r * 0.0035, 6)));
    if (dark && shape.kind === "country") path.setAttribute("fill", "#d4f06a");
    if (dark && shape.kind === "park") path.setAttribute("fill", "#e15b38");
    path.dataset.name = shape.name;
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      inspect(shape);
    });
    svg.append(path);
    if (radius(shape) / maxR < 0.045) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("r", String(maxR * 0.08));
      ring.setAttribute("class", "inset");
      svg.append(ring);
    }
  });
  return r;
}

function inspect(shape) {
  active = shape;
  const meta = parkMeta(shape.name);
  $("#inspectorMeta").textContent =
    shape.kind === "park"
      ? `PARK  ·  ${meta ? meta.states.join(" / ") : ""}  ·  ${meta ? meta.year : ""}`
      : `COUNTRY  ·  ${fmt(shape.km2)} km²`;
  $("#inspectorName").textContent = shape.name;
  $("#inspectorArea").textContent = meta
    ? `${fmt(meta.acres)} acres  ·  ${fmt(shape.km2)} km²`
    : `${fmt(shape.km2)} km²`;
  $("#inspectorDesc").textContent = meta
    ? meta.description
    : `${shape.name} drawn at the same meter scale as the parks.`;
  $("#inspectorPhoto").style.backgroundImage = meta ? `url("${(meta.image || "").replace("/250px-", "/800px-")}")` : "none";
  $$("#stage path").forEach((el) => el.classList.toggle("active", el.dataset.name === shape.name));
}

function selectedShapes() {
  return [...shapes.parks, ...shapes.countries].filter((s) => selected.has(`${s.kind}:${s.name}`));
}

function renderStage() {
  const list = selectedShapes();
  const r = drawOverlay($("#stage"), list);
  const note = $("#stageNote");
  const parksOn = list.filter((s) => s.kind === "park");
  const countriesOn = list.filter((s) => s.kind === "country");
  if (!list.length) note.textContent = "Pick parks on the left and countries on the right. One shared scale.";
  else if (parksOn.length && countriesOn.length) {
    const p = parksOn.reduce((a, b) => (a.km2 > b.km2 ? a : b));
    const c = countriesOn.reduce((a, b) => (a.km2 > b.km2 ? a : b));
    const rel = p.km2 / c.km2;
    note.textContent =
      rel >= 1
        ? `${p.name} is ${fmt(rel, 2)}× ${c.name}.`
        : `${p.name} is ${fmt(c.km2 / p.km2, 1)}× smaller than ${c.name}.`;
  } else note.textContent = `${list.length} outlines stacked at true scale.`;
  if (r) {
    const km = (r * 80) / 1000;
    $("#scalebar").textContent = `↔ ${fmt(km * 2)} km`;
  } else $("#scalebar").textContent = "";
  $$("#parkList li").forEach((li) => li.classList.toggle("on", selected.has(`park:${li.dataset.name}`)));
  $$("#countryList li").forEach((li) => li.classList.toggle("on", selected.has(`country:${li.dataset.name}`)));
}

function toggle(shape) {
  const key = `${shape.kind}:${shape.name}`;
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);
  $$(".chip").forEach((c) => c.classList.remove("active"));
  renderStage();
  inspect(shape);
}

function renderList(root, items, kind, q = "") {
  root.innerHTML = "";
  items
    .filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    .forEach((s) => {
      const li = document.createElement("li");
      li.dataset.name = s.name;
      const sw = document.createElement("i");
      sw.className = "swatch";
      sw.style.background = color(s);
      const wrap = document.createElement("span");
      const b = document.createElement("b");
      b.textContent = s.name;
      if (s.trip) {
        const tag = document.createElement("em");
        tag.className = "trip-tag";
        tag.textContent = " trip";
        b.append(tag);
      }
      const small = document.createElement("small");
      small.textContent = `${fmt(s.km2)} km²`;
      wrap.append(b, small);
      li.append(sw, wrap);
      li.onclick = () => toggle(s);
      root.append(li);
    });
}

function setPreset(kind) {
  selected = new Set();
  const add = (type, name) => {
    const s = type === "park" ? shapes.parks.find((p) => p.name === name) : shapes.countries.find((p) => p.name === name);
    if (s) selected.add(`${s.kind}:${s.name}`);
  };
  if (kind === "range") {
    ["Yellowstone", "Rocky Mountain", "Arches"].forEach((n) => add("park", n));
    ["Switzerland", "Belgium", "Israel"].forEach((n) => add("country", n));
  } else if (kind === "trip") {
    shapes.parks.filter((p) => p.trip).forEach((p) => selected.add(`park:${p.name}`));
    add("country", "Switzerland");
  } else if (kind === "alaska") {
    ["Wrangell–St. Elias", "Gates of the Arctic", "Denali"].forEach((n) => add("park", n));
    ["United Kingdom", "Iceland", "Greece"].forEach((n) => add("country", n));
  } else if (kind === "allparks") {
    shapes.parks.forEach((p) => selected.add(`park:${p.name}`));
  }
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.preset === kind));
  renderStage();
}

function renderAtlas() {
  const sort = $("#sort").value;
  const region = $("#region").value;
  let list = shapes.parks.slice();
  if (region === "trip") list = list.filter((p) => p.trip);
  else if (region !== "all") list = list.filter((p) => (p.states || []).includes(region));
  list.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "small") return a.km2 - b.km2;
    return b.km2 - a.km2;
  });
  const root = $("#atlasGrid");
  root.innerHTML = "";
  list.forEach((p) => {
    const meta = parkMeta(p.name);
    const card = document.createElement("article");
    card.className = "atlas-card";
    const mini = document.createElement("div");
    mini.className = "mini";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    mini.append(svg);
    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = "";
    const metaRow = document.createElement("div");
    metaRow.className = "meta";
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = meta ? `#${String(meta.rank).padStart(2, "0")}` : "";
    const st = document.createElement("span");
    st.textContent = (p.states || []).join(" / ");
    metaRow.append(rank, st);
    const h3 = document.createElement("h3");
    h3.textContent = p.name;
    const acres = document.createElement("p");
    acres.className = "acres";
    acres.textContent = meta ? `${fmt(meta.acres)} acres` : `${fmt(p.km2)} km²`;
    body.append(metaRow, h3, acres);
    card.append(mini, body);
    card.onclick = () => {
      selected.add(`park:${p.name}`);
      renderStage();
      inspect(p);
      $("#overlay").scrollIntoView({ behavior: "smooth" });
    };
    root.append(card);
    drawOverlay(svg, [p]);
  });
}

function renderCompare() {
  const park = shapes.parks.find((p) => p.name === $("#parkA").value);
  const country = shapes.countries.find((p) => p.name === $("#parkB").value);
  const svg = $("#versus");
  if (!park || !country) return;
  drawOverlay(svg, [country, park], { dark: true });
  const times = country.km2 / park.km2;
  $("#ratioLine").textContent =
    times >= 1.05
      ? `${country.name} holds ${fmt(times, 1)} of ${park.name} inside it.`
      : `${park.name} is about the size of ${country.name}.`;
}

function renderHero() {
  const list = ["Switzerland", "Yellowstone", "Rocky Mountain", "Arches"]
    .map(shapeByName)
    .filter(Boolean);
  drawOverlay($("#heroNest"), list, { dark: true });
  $("#heroCaption").textContent = "Switzerland · Yellowstone · Rocky Mountain · Arches";
}

function bind() {
  $$(".chip").forEach((chip) => {
    chip.onclick = () => setPreset(chip.dataset.preset);
  });
  $("#parkSearch").oninput = (e) => renderList($("#parkList"), shapes.parks, "park", e.target.value);
  $("#countrySearch").oninput = (e) => renderList($("#countryList"), shapes.countries, "country", e.target.value);
  $("#sort").onchange = renderAtlas;
  $("#region").onchange = renderAtlas;
  $("#parkA").onchange = renderCompare;
  $("#parkB").onchange = renderCompare;
}

Promise.all([fetch("parks.json").then((r) => r.json()), fetch("shapes.json").then((r) => r.json())]).then(
  ([meta, geo]) => {
    parks = meta;
    const trip = new Set(meta.filter((p) => p.trip).map((p) => p.name));
    const states = Object.fromEntries(meta.map((p) => [p.name, p.states]));
    shapes.parks = geo.parks.map((p) => ({ ...p, kind: "park", trip: trip.has(p.name), states: states[p.name] || [] }));
    shapes.countries = geo.countries.map((c) => ({ ...c, kind: "country" }));
    const fillSelect = (el, items) => {
      el.textContent = "";
      items.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.name;
        opt.textContent = item.name;
        el.append(opt);
      });
    };
    fillSelect($("#parkA"), shapes.parks);
    fillSelect($("#parkB"), shapes.countries);
    $("#parkA").value = "Yellowstone";
    $("#parkB").value = "Switzerland";
    bind();
    renderList($("#parkList"), shapes.parks, "park");
    renderList($("#countryList"), shapes.countries, "country");
    renderHero();
    setPreset("range");
    renderAtlas();
    renderCompare();
  }
);
