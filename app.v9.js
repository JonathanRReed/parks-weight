const $ = (s, r = document) => r.querySelector(s);
const fmt = (n, d = 0) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(n);
const KEY = "parks-and-scale-onboarded";

const STEPS = [
  { title: "These are the real maps.", copy: "Each outline is the official park boundary. Not a circle. Not a cartoon." },
  { title: "Tap a photo to change parks.", copy: "The larger park is the ground. The smaller one sits on top at its true size." },
  { title: "If it looks small, it is small.", copy: "Nothing is stretched to fill the screen. North stays up." },
];

let parks = [];
let bigName = "Yellowstone";
let smallName = "Arches";
let picking = null;
let focus = "Yellowstone";
let obStep = 0;

const byName = (name) => parks.find((p) => p.name === name);
const clean = (t) => (t || "").replace(/\s*\(\s*$/, "").trim();

function radius(p) {
  const [x1, y1, x2, y2] = p.shape.bbox;
  return Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2), 12);
}

function setPhoto(img, p) {
  const fallback = p.image || "";
  const large = fallback.replace("/250px-", "/960px-");
  img.alt = p.name;
  img.referrerPolicy = "no-referrer";
  img.loading = "lazy";
  img.onerror = () => {
    if (img.dataset.tried === "1") return;
    img.dataset.tried = "1";
    if (fallback) img.src = fallback;
  };
  img.dataset.tried = "";
  img.src = large || fallback;
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

function interesting(p, other) {
  const bits = [];
  const perAcre = p.acres ? p.visitors / p.acres : 0;
  bits.push(`${fmt(perAcre, 1)} visitors per acre last year`);
  if (other && other.name !== p.name) {
    if (p.visitors > other.visitors && p.acres < other.acres) {
      bits.push(`More visitors than ${other.name}, on less land`);
    }
  }
  if (p.year === 1872) bits.push("The first U.S. national park");
  if (p.states.includes("AK")) bits.push("Alaska parks hold most of the system’s land");
  if (p.trip) bits.push("On the Colorado–Utah loop");
  return bits.join(" · ");
}

function pairNote(outer, inner, times) {
  if (inner.visitors > outer.visitors && inner.acres * 2 < outer.acres) {
    return `${inner.name} is much smaller and still saw more visitors (${fmt(inner.visitors)} vs ${fmt(outer.visitors)}).`;
  }
  if (outer.states.includes("AK")) {
    return `${outer.name} is one of the Alaska parks that quietly hold most of the National Park System’s acreage.`;
  }
  return `Tap either outline for acreage, visitors, and a short history.`;
}

function showFacts(p, other) {
  if (!p) return;
  focus = p.name;
  $("#factKicker").textContent = `#${p.rank} of 63 by land`;
  $("#factName").textContent = p.name;
  const dl = $("#factStats");
  dl.textContent = "";
  [
    ["Acres", fmt(p.acres)],
    ["Square km", fmt(p.km2, 1)],
    ["Visitors", fmt(p.visitors)],
    ["Established", String(p.year || "—")],
    ["Where", p.states.join(" / ")],
    ["Age", p.year ? `${new Date().getFullYear() - p.year} years` : "—"],
  ].forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  });
  $("#factCopy").textContent = clean(p.description);
  $("#factExtra").textContent = interesting(p, other);
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
    path.addEventListener("click", () => showFacts(p, p === outer ? inner : outer));
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
  $("#hint").textContent = "Same scale. North is up. Tap a shape for facts.";
  $("#pairNote").textContent = pairNote(outer, inner, times);
  showFacts(byName(focus) && (focus === outer.name || focus === inner.name) ? byName(focus) : outer, inner);
  history.replaceState(null, "", `#${encodeURIComponent(outer.name)}/${encodeURIComponent(inner.name)}`);
}

function cardEl(p, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card";
  const pic = document.createElement("img");
  pic.className = "photo";
  pic.width = 300;
  pic.height = 96;
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
  const hits = parks.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  if (!hits.length) {
    const empty = document.createElement("p");
    empty.textContent = "No park by that name. Try Zion, Denali, or Acadia.";
    root.append(empty);
    return;
  }
  hits.forEach((p) => root.append(cardEl(p, choose)));
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
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#onboard").hidden) hideOnboard();
    if (!$("#chooser").hidden) closeChooser();
  });
  $("#search").oninput = (e) => renderChooser(e.target.value);
  const all = $("#allCards");
  parks.forEach((p) =>
    all.append(
      cardEl(p, (park) => {
        smallName = park.name;
        focus = park.name;
        draw();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    )
  );
  draw();
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
