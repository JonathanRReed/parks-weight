const $ = (s, r = document) => r.querySelector(s);
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);

let parks = [];
let bigName = "Yellowstone";
let smallName = "Arches";
let picking = null;

const byName = (name) => parks.find((p) => p.name === name);
const photo = (p) => (p.image || "").replace("/250px-", "/700px-");

function radius(p) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  return Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2), 12);
}

function setPhoto(el, p) {
  el.style.backgroundImage = p.image ? `url("${photo(p)}")` : "none";
}

function pair() {
  const a = byName(bigName);
  const b = byName(smallName);
  if (!a || !b) return [a, b];
  if (a.acres >= b.acres) return [a, b];
  return [b, a];
}

function draw() {
  const [outer, inner] = pair();
  if (!outer || !inner) return;
  bigName = outer.name;
  smallName = inner.name;
  $("#bigName").textContent = outer.name;
  $("#smallName").textContent = inner.name;
  setPhoto($("#bigPhoto"), outer);
  setPhoto($("#smallPhoto"), inner);

  const svg = $("#map");
  svg.innerHTML = "";
  const r = Math.max(radius(outer), radius(inner)) * 1.18;
  svg.setAttribute("viewBox", `${-r} ${-r} ${2 * r} ${2 * r}`);

  [
    [outer, "big"],
    [inner, "small"],
  ].forEach(([p, cls]) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.shape.d);
    path.setAttribute("class", cls);
    svg.append(path);
  });

  const label = (text, y, fill) => {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("class", "label");
    t.setAttribute("x", "0");
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("fill", fill);
    t.setAttribute("font-size", String(Math.max(r * 0.045, 18)));
    t.textContent = text;
    svg.append(t);
  };
  label(outer.name, -r * 0.88, "#2f6f4e");
  label(inner.name, r * 0.9, "#d2653a");

  const times = outer.acres / inner.acres;
  $("#punch").textContent =
    times >= 1.05
      ? `You could fit ${fmt(times, 1)} ${inner.name}s inside ${outer.name}.`
      : `${outer.name} and ${inner.name} are almost the same size.`;
  $("#hint").textContent = "Same scale for both maps. Nothing is stretched to fit.";

  const facts = $("#facts");
  facts.textContent = "";
  [outer, inner].forEach((p) => {
    const art = document.createElement("article");
    const h = document.createElement("h3");
    h.textContent = p.name;
    const para = document.createElement("p");
    para.textContent = `${fmt(p.acres)} acres · ${fmt(p.visitors)} visitors a year · established ${p.year}`;
    art.append(h, para);
    facts.append(art);
  });
}

function cardEl(p, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card";
  const pic = document.createElement("span");
  pic.className = "photo";
  setPhoto(pic, p);
  const body = document.createElement("span");
  body.className = "body";
  const b = document.createElement("b");
  b.textContent = p.name;
  const small = document.createElement("small");
  small.textContent = `${fmt(p.acres)} acres · ${p.states.join("/")}`;
  body.append(b, small);
  btn.append(pic, body);
  btn.onclick = () => onClick(p);
  return btn;
}

function renderChooser(q = "") {
  const root = $("#chooserCards");
  root.textContent = "";
  parks
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .forEach((p) => root.append(cardEl(p, choose)));
}

function openChooser(role) {
  picking = role;
  $("#chooser").hidden = false;
  $("#chooserTitle").textContent = role === "big" ? "Pick the bigger park" : "Pick the park to stack on it";
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
  closeChooser();
  draw();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  const root = $("#allCards");
  root.textContent = "";
  parks.forEach((p) =>
    root.append(
      cardEl(p, (park) => {
        smallName = park.name;
        draw();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    )
  );
}

Promise.all([fetch("parks.json").then((r) => r.json()), fetch("shapes.json").then((r) => r.json())]).then(
  ([meta, geo]) => {
    const shapes = Object.fromEntries(geo.parks.map((s) => [s.name, s]));
    parks = meta.filter((p) => shapes[p.name]).map((p) => ({ ...p, shape: shapes[p.name] }));
    $("#pickBig").onclick = () => openChooser("big");
    $("#pickSmall").onclick = () => openChooser("small");
    $("#closeChooser").onclick = closeChooser;
    $("#search").oninput = (e) => renderChooser(e.target.value);
    renderAll();
    draw();
  }
);
