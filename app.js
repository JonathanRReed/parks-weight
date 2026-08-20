const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const COLORS = ["#e8c572", "#d4784a", "#7eb8a0", "#f3efe6", "#c27c9a", "#8fb0d0", "#d4f06a", "#c9a227"];

let parks = [];
let overlays = new Set();
let focusName = null;

const byName = (name) => parks.find((p) => p.name === name);
const shape = (p) => p.shape;

function color(p) {
  return COLORS[(p.rank - 1) % COLORS.length];
}

function clean(text) {
  return (text || "").replace(/\s*\(\s*$/, "").replace(/\s+/g, " ").trim();
}

function radius(p) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  return Math.max(Math.hypot(x1, y1), Math.hypot(x2, y2), Math.hypot(x1, y2), Math.hypot(x2, y1), 12);
}

function fitBox(p, pad = 1.18) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const s = Math.max(x2 - x1, y2 - y1, 20) * pad;
  return `${cx - s / 2} ${cy - s / 2} ${s} ${s}`;
}

function drawMini(svg, p) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", fitBox(p));
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", p.shape.d);
  path.setAttribute("fill", color(p));
  path.setAttribute("class", "park");
  svg.append(path);
}

function fillSelect(el, list, value) {
  el.textContent = "";
  list.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    el.append(opt);
  });
  if (value) el.value = value;
}

function factCell(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  dl.append(dt, dd);
}

function showFacts(p) {
  if (!p) return;
  focusName = p.name;
  $("#factKicker").textContent = p.trip ? `Rank #${p.rank} · this week` : `Rank #${p.rank} of 63`;
  $("#factName").textContent = p.name;
  $("#factPhoto").style.backgroundImage = p.image ? `url("${p.image.replace("/250px-", "/800px-")}")` : "none";
  const dl = $("#factStats");
  dl.textContent = "";
  factCell(dl, "Acres", fmt(p.acres));
  factCell(dl, "Land", `${fmt(p.km2, 1)} km²`);
  factCell(dl, "Visitors", fmt(p.visitors));
  factCell(dl, "Established", String(p.year || p.established));
  factCell(dl, "States", p.states.join(" / "));
  const ground = byName($("#ground").value);
  if (ground && ground.name !== p.name) {
    const times = ground.acres / p.acres;
    factCell(dl, "Vs ground", times >= 1 ? `${fmt(times, 1)}× in ${ground.name}` : `${fmt(p.acres / ground.acres, 2)}× ${ground.name}`);
  }
  $("#factCopy").textContent = clean(p.description);
  $("#factLink").hidden = !p.wiki;
  $("#factLink").href = p.wiki || "";
  $$("#map path").forEach((el) => el.classList.toggle("active", el.dataset.name === p.name));
}

function visibleParks() {
  const ground = byName($("#ground").value);
  const list = parks.filter((p) => overlays.has(p.name) || (ground && p.name === ground.name));
  const names = new Set(list.map((p) => p.name));
  if (ground && !names.has(ground.name)) list.unshift(ground);
  return parks.filter((p) => p.name === (ground && ground.name) || overlays.has(p.name));
}

function renderMap() {
  const ground = byName($("#ground").value) || parks[0];
  const list = [];
  if (ground) list.push(ground);
  parks.forEach((p) => {
    if (overlays.has(p.name) && p.name !== ground.name) list.push(p);
  });
  const svg = $("#map");
  svg.innerHTML = "";
  if (!list.length) return;
  const r = Math.max(...list.map(radius)) * 1.12;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
  list.forEach((p) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.shape.d);
    path.setAttribute("fill", color(p));
    path.setAttribute("class", p === ground ? "park ground" : "park");
    path.dataset.name = p.name;
    path.addEventListener("click", () => showFacts(p));
    svg.append(path);
  });
  const km = (r * 80) / 1000;
  $("#scaleNote").textContent = `true scale · ${fmt(km * 2)} km across`;
  const legend = $("#legend");
  legend.textContent = "";
  list.forEach((p) => {
    const li = document.createElement("li");
    const i = document.createElement("i");
    i.style.background = color(p);
    li.append(i, document.createTextContent ? document.createTextNode(`${p.name} · ${fmt(p.acres)} ac`) : document.createTextNode(`${p.name} · ${fmt(p.acres)} ac`));
    legend.append(li);
  });
  $$("#parkList li").forEach((li) => {
    li.classList.toggle("on", overlays.has(li.dataset.name) || li.dataset.name === ground.name);
  });
  if (focusName) showFacts(byName(focusName) || ground);
  else showFacts(ground);
}

function renderList(q = "") {
  const root = $("#parkList");
  root.textContent = "";
  parks
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .forEach((p) => {
      const li = document.createElement("li");
      li.dataset.name = p.name;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      drawMini(svg, p);
      const wrap = document.createElement("span");
      const b = document.createElement("b");
      b.textContent = p.name;
      if (p.trip) {
        const em = document.createElement("em");
        em.className = "trip";
        em.textContent = " · trip";
        b.append(em);
      }
      const small = document.createElement("small");
      small.textContent = `${fmt(p.acres)} acres · ${p.states.join("/")}`;
      wrap.append(b, small);
      li.append(svg, wrap);
      li.onclick = () => {
        if (overlays.has(p.name)) overlays.delete(p.name);
        else overlays.add(p.name);
        focusName = p.name;
        renderMap();
      };
      root.append(li);
    });
}

function setGroup(kind) {
  overlays = new Set();
  const ground = $("#ground");
  if (kind === "range") {
    ground.value = "Yellowstone";
    ["Yosemite", "Rocky Mountain", "Zion", "Arches", "Gateway Arch"].forEach((n) => overlays.add(n));
  } else if (kind === "trip") {
    ground.value = "Canyonlands";
    parks.filter((p) => p.trip).forEach((p) => overlays.add(p.name));
  } else if (kind === "utah") {
    ground.value = "Canyonlands";
    parks.filter((p) => p.states.includes("UT")).forEach((p) => overlays.add(p.name));
  }
  $$(".quick button").forEach((b) => b.classList.toggle("on", b.dataset.set === kind));
  renderMap();
}

function renderCompare() {
  const outer = byName($("#outer").value);
  const inner = byName($("#inner").value);
  if (!outer || !inner) return;
  const svg = $("#duel");
  svg.innerHTML = "";
  const r = Math.max(radius(outer), radius(inner)) * 1.12;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);
  [outer, inner].forEach((p, i) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.shape.d);
    path.setAttribute("fill", i ? "#d4784a" : "#e8c572");
    path.setAttribute("class", i ? "park" : "park ground");
    svg.append(path);
  });
  const times = outer.acres / inner.acres;
  $("#ratio").textContent =
    times >= 1
      ? `${outer.name} holds ${fmt(times, 1)} of ${inner.name}.`
      : `${inner.name} is larger — ${fmt(1 / times, 1)}× ${outer.name}.`;
  const dual = $("#dual");
  dual.textContent = "";
  [outer, inner].forEach((p) => {
    const art = document.createElement("article");
    const h = document.createElement("h3");
    h.textContent = p.name;
    const para = document.createElement("p");
    para.textContent = `${fmt(p.acres)} acres · ${fmt(p.visitors)} visitors · est. ${p.year}`;
    art.append(h, para);
    dual.append(art);
  });
}

function renderAtlas() {
  const sort = $("#sort").value;
  const list = parks.slice().sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "small") return a.acres - b.acres;
    if (sort === "visitors") return b.visitors - a.visitors;
    if (sort === "year") return (a.year || 9999) - (b.year || 9999);
    return b.acres - a.acres;
  });
  const root = $("#atlasGrid");
  root.textContent = "";
  list.forEach((p) => {
    const card = document.createElement("article");
    card.className = "atlas-card";
    const mini = document.createElement("div");
    mini.className = "mini";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawMini(svg, p);
    mini.append(svg);
    const body = document.createElement("div");
    body.className = "body";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(document.createTextNode(`#${String(p.rank).padStart(2, "0")}`), document.createTextNode(p.states.join(" / ")));
    const h = document.createElement("h3");
    h.textContent = p.name;
    const para = document.createElement("p");
    para.textContent = `${fmt(p.acres)} acres · ${fmt(p.visitors)} visitors · ${p.year}`;
    body.append(meta, h, para);
    card.append(mini, body);
    card.onclick = () => {
      overlays.add(p.name);
      $("#ground").value = p.acres > (byName($("#ground").value)?.acres || 0) ? p.name : $("#ground").value;
      focusName = p.name;
      renderMap();
      $("#stage").scrollIntoView({ behavior: "smooth" });
    };
    root.append(card);
  });
}

Promise.all([fetch("parks.json").then((r) => r.json()), fetch("shapes.json").then((r) => r.json())]).then(
  ([meta, geo]) => {
    const shapes = Object.fromEntries(geo.parks.map((s) => [s.name, s]));
    parks = meta.filter((p) => shapes[p.name]).map((p) => ({ ...p, shape: shapes[p.name] }));
    fillSelect($("#ground"), parks, "Yellowstone");
    fillSelect($("#outer"), parks, "Yellowstone");
    fillSelect($("#inner"), parks, "Arches");
    $("#search").oninput = (e) => renderList(e.target.value);
    $("#ground").onchange = renderMap;
    $("#outer").onchange = renderCompare;
    $("#inner").onchange = renderCompare;
    $("#sort").onchange = renderAtlas;
    $$(".quick button").forEach((b) => {
      b.onclick = () => setGroup(b.dataset.set);
    });
    renderList();
    setGroup("range");
    renderCompare();
    renderAtlas();
  }
);
