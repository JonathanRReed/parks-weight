export const KINDS = [
  { id: "national_park", label: "National parks", one: "National park" },
  { id: "national_monument", label: "National monuments", one: "National monument" },
  { id: "national_recreation", label: "Recreation areas and shores", one: "Recreation area or shore" },
  { id: "national_forest", label: "National forests", one: "National forest" },
  { id: "state_forest", label: "State forests", one: "State forest" },
  { id: "state_park", label: "State parks", one: "State park" },
];

const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));
export const kindLabel = (id) => KIND_BY_ID[id]?.one ?? "Place";
export const kindPlural = (id) => KIND_BY_ID[id]?.label ?? "Places";

export const places = [];
const byKey = new Map();
const kindTotals = {};

function add(place) {
  places.push(place);
  byKey.set(place.id, place);
  byKey.set(place.name.toLowerCase(), place);
  kindTotals[place.kind] = (kindTotals[place.kind] || 0) + 1;
}

export const getPlace = (key) => (key ? byKey.get(key) || byKey.get(String(key).toLowerCase()) : undefined);
export const kindTotal = (kind) => kindTotals[kind] || 0;

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

function cleanDescription(text) {
  return (text || "").replace(/\s*\(\s*$/, "").trim();
}

function normalize(meta, kind, shape) {
  return {
    id: meta.slug || meta.name,
    name: meta.name,
    kind,
    states: meta.states || [],
    acres: meta.acres,
    km2: meta.km2,
    lat: typeof meta.lat === "number" ? meta.lat : null,
    lon: typeof meta.lon === "number" ? meta.lon : null,
    year: meta.year || null,
    visitors: meta.visitors || 0,
    rank: meta.rank,
    wiki: meta.wiki || "",
    description: kind === "national_park" ? cleanDescription(meta.description) : "",
    shape,
  };
}

export async function loadCore() {
  const [meta, geo] = await Promise.all([json("parks.json"), json("shapes.json")]);
  const shapes = Object.fromEntries(geo.parks.map((s) => [s.name, s]));
  meta.filter((p) => shapes[p.name]).forEach((p) => add(normalize(p, "national_park", shapes[p.name])));
  if (!places.length) throw new Error("no national parks loaded");
}

let landsPromise;
export function loadLands() {
  landsPromise ??= Promise.all([json("lands.json"), json("land-shapes.json")]).then(([meta, geo]) => {
    meta.forEach((m, i) => {
      const shape = geo.lands[i];
      if (shape?.d) add(normalize(m, m.kind, shape));
    });
  });
  return landsPromise;
}

export const landsLoaded = () => landsPromise !== undefined && places.length > kindTotal("national_park");

export function ordered(a, b) {
  return a.acres >= b.acres ? [a, b] : [b, a];
}

let sortedCache = { size: -1, list: [] };
export function bySize() {
  if (sortedCache.size !== places.length) {
    sortedCache = { size: places.length, list: places.slice().sort((a, b) => a.acres - b.acres) };
  }
  return sortedCache.list;
}

export function sizeNeighbors(place) {
  const list = bySize();
  const i = list.indexOf(place);
  return { smaller: list[i - 1], larger: list[i + 1] };
}

export function allStates(kind) {
  const set = new Set();
  places.forEach((p) => {
    if (!kind || kind === "all" || p.kind === kind) p.states.forEach((s) => set.add(s));
  });
  return [...set].sort();
}

export const placeLine = (p) => [kindLabel(p.kind), p.states.join(", ")].filter(Boolean).join(" · ");
