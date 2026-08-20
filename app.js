const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const WEST = new Set(["AK", "HI", "WA", "OR", "CA", "NV", "ID", "UT", "AZ", "MT", "WY", "CO", "NM"]);
const PALETTE = ["#d4f06a", "#e15b38", "#f0d38a", "#7eb8a0", "#f4f7e8", "#c07a4a", "#9cc9ae", "#dce6c1"];
const photo = (url) => (url || "").replace("/250px-", "/800px-");

let parks = [];
let selected = new Set();
let active = null;

const byName = (name) => parks.find((p) => p.name === name);

function color(p) {
  return PALETTE[(p.rank - 1) % PALETTE.length];
}

function inspect(p) {
  active = p;
  $("#inspectorEmpty").hidden = true;
  $("#inspectorCard").hidden = false;
  $("#inspectorPhoto").style.backgroundImage = `url("${photo(p.image)}")`;
  $("#inspectorMeta").textContent = `#${String(p.rank).padStart(2, "0")}  ·  ${p.states.join(" / ")}  ·  ${p.year || ""}`;
  $("#inspectorName").textContent = p.name;
  $("#inspectorArea").textContent = `${fmt(p.acres)} acres  ·  ${fmt(p.km2, 1)} km²`;
  $("#inspectorDesc").textContent = p.description;
  $("#inspectorLink").href = p.wiki;
  $$(".ring").forEach((el) => el.classList.toggle("active", el.dataset.slug === p.slug));
  $$(".atlas-card").forEach((el) => el.classList.toggle("on", el.dataset.slug === p.slug));
}

function drawNest(root, list, maxPx) {
  root.innerHTML = "";
  if (!list.length) return;
  const max = Math.max(...list.map((p) => p.acres));
  const sorted = [...list].sort((a, b) => b.acres - a.acres);
  sorted.forEach((p, i) => {
    const size = Math.max(18, Math.sqrt(p.acres / max) * maxPx);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ring";
    el.dataset.slug = p.slug;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = color(p);
    el.style.zIndex = String(i + 1);
    el.style.opacity = sorted.length > 12 ? "0.86" : "0.94";
    if (size > 72) el.innerHTML = `<span>${p.name}</span>`;
    else el.title = p.name;
    el.onclick = () => inspect(p);
    root.append(el);
  });
}

function renderHero() {
  const sample = [
    byName("Wrangell–St. Elias"),
    byName("Yellowstone"),
    byName("Rocky Mountain"),
    byName("Arches"),
    byName("Gateway Arch"),
  ].filter(Boolean);
  drawNest($("#heroNest"), sample, Math.min($("#heroNest").clientWidth, $("#heroNest").clientHeight) * 0.92);
}

function stageSize() {
  const box = $("#stage");
  return Math.min(box.clientWidth, box.clientHeight) * 0.9;
}

function renderStage() {
  const list = parks.filter((p) => selected.has(p.slug));
  drawNest($("#stage"), list, stageSize());
  const note = $("#stageNote");
  if (!list.length) note.textContent = "Pick parks in the rail. Area, not diameter — a park twice as wide is four times the land.";
  else if (list.length === 1) note.textContent = `${list[0].name} sits alone at ${fmt(list[0].acres)} acres.`;
  else {
    const big = list.reduce((a, b) => (a.acres > b.acres ? a : b));
    const small = list.reduce((a, b) => (a.acres < b.acres ? a : b));
    const times = big.acres / small.acres;
    note.textContent = `${big.name} is ${fmt(times, 1)}× the land of ${small.name}. ${list.length} parks stacked at true acreage.`;
  }
  $$("#parkList li").forEach((li) => li.classList.toggle("on", selected.has(li.dataset.slug)));
}

function setPreset(kind) {
  selected = new Set();
  if (kind === "range") {
    ["Wrangell–St. Elias", "Yellowstone", "Rocky Mountain", "Arches", "Gateway Arch"].forEach((n) => {
      const p = byName(n);
      if (p) selected.add(p.slug);
    });
  } else if (kind === "trip") {
    parks.filter((p) => p.trip).forEach((p) => selected.add(p.slug));
  } else if (kind === "all") {
    parks.forEach((p) => selected.add(p.slug));
  }
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.preset === kind));
  renderStage();
}

function renderRail(q = "") {
  const root = $("#parkList");
  root.innerHTML = "";
  parks
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .forEach((p) => {
      const li = document.createElement("li");
      li.dataset.slug = p.slug;
      li.innerHTML = `<i class="swatch" style="background:${color(p)}"></i><span><b>${p.name}${p.trip ? '<em class="trip-tag"> trip</em>' : ""}</b><small>${fmt(p.acres)} acres · ${p.states.join("/")}</small></span>`;
      li.onclick = () => {
        if (selected.has(p.slug)) selected.delete(p.slug);
        else selected.add(p.slug);
        $$(".chip").forEach((c) => c.classList.remove("active"));
        renderStage();
        inspect(p);
      };
      root.append(li);
    });
}

function inRegion(p, region) {
  if (region === "all") return true;
  if (region === "trip") return p.trip;
  if (region === "West") return p.states.some((s) => WEST.has(s));
  return p.states.includes(region);
}

function renderAtlas() {
  const sort = $("#sort").value;
  const region = $("#region").value;
  let list = parks.filter((p) => inRegion(p, region));
  list.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "small") return a.acres - b.acres;
    if (sort === "year") return (a.year || 9999) - (b.year || 9999);
    if (sort === "visitors") return b.visitors - a.visitors;
    return b.acres - a.acres;
  });
  const root = $("#atlasGrid");
  root.innerHTML = "";
  const max = parks[0].acres;
  list.forEach((p) => {
    const card = document.createElement("article");
    card.className = "atlas-card";
    card.dataset.slug = p.slug;
    card.innerHTML = `
      <div class="photo" style="background-image:url('${photo(p.image)}')"></div>
      <div class="body">
        <div class="meta"><span class="rank">#${String(p.rank).padStart(2, "0")}</span><span>${p.states.join(" / ")}${p.trip ? " · trip" : ""}</span></div>
        <h3>${p.name}</h3>
        <p class="acres">${fmt(p.acres)} acres</p>
        <div class="bar"><i style="width:${Math.max(1.5, (p.acres / max) * 100)}%"></i></div>
        <p>${p.description}</p>
      </div>`;
    card.onclick = () => {
      selected.add(p.slug);
      renderStage();
      inspect(p);
      $("#overlay").scrollIntoView({ behavior: "smooth" });
    };
    root.append(card);
  });
}

function renderCompare() {
  const a = byName($("#parkA").value);
  const b = byName($("#parkB").value);
  const root = $("#versus");
  root.innerHTML = "";
  if (!a || !b) return;
  const outer = a.acres >= b.acres ? a : b;
  const inner = a.acres >= b.acres ? b : a;
  const box = Math.min(root.clientWidth, root.clientHeight) * 0.82;
  [
    [outer, box, "#d4f06a"],
    [inner, Math.max(14, Math.sqrt(inner.acres / outer.acres) * box), "#e15b38"],
  ].forEach(([p, size, bg], i) => {
    const el = document.createElement("div");
    el.className = "vs-ring";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = bg;
    el.style.color = i ? "#07110e" : "#07110e";
    el.style.zIndex = String(i + 1);
    el.innerHTML = `<div><b>${p.name}</b><small>${fmt(p.acres)} acres</small></div>`;
    root.append(el);
  });
  const times = outer.acres / inner.acres;
  $("#ratioLine").textContent =
    times >= 1.05
      ? `${outer.name} holds ${fmt(times, 1)} of ${inner.name} inside it.`
      : `${outer.name} and ${inner.name} are nearly the same mass.`;
}

function bind() {
  $$(".chip").forEach((chip) => {
    chip.onclick = () => setPreset(chip.dataset.preset);
  });
  $("#search").oninput = (e) => renderRail(e.target.value);
  $("#sort").onchange = renderAtlas;
  $("#region").onchange = renderAtlas;
  $("#parkA").onchange = renderCompare;
  $("#parkB").onchange = renderCompare;
  window.addEventListener("resize", () => {
    renderHero();
    renderStage();
    renderCompare();
  });
}

fetch("parks.json")
  .then((r) => r.json())
  .then((data) => {
    parks = data;
    const acres = parks.reduce((s, p) => s + p.acres, 0);
    $("#statParks").textContent = String(parks.length);
    $("#navCount").textContent = String(parks.length);
    $("#statAcres").textContent = acres >= 1e6 ? `${fmt(acres / 1e6, 1)}M` : fmt(acres);
    $("#statTrip").textContent = String(parks.filter((p) => p.trip).length).padStart(2, "0");
    const opts = parks.map((p) => `<option value="${p.name}">${p.name}</option>`).join("");
    $("#parkA").innerHTML = opts;
    $("#parkB").innerHTML = opts;
    $("#parkA").value = "Rocky Mountain";
    $("#parkB").value = "Arches";
    bind();
    renderRail();
    renderHero();
    setPreset("range");
    renderAtlas();
    renderCompare();
    inspect(byName("Wrangell–St. Elias"));
  });
