import { $, $$ } from "./util.js";
import { getPlace, loadCore, loadLands, ordered, places } from "./data.js";
import { initPrefs } from "./prefs.js";
import { initCompare } from "./compare.js";
import { initChooser } from "./chooser.js";
import { initPlace } from "./place.js";
import { initMap } from "./usmap.js";
import { initGuide } from "./guide.js";
import { initArt } from "./art.js";

const VIEWS = ["compare", "map", "guide"];
const TITLES = {
  compare: "Parks and Scale: the true size of U.S. parks and forests",
  map: "US map: Parks and Scale",
  guide: "Field guide: Parks and Scale",
};
const DEFAULT_PAIR = ["yellowstone", "arches"];

let pair = [...DEFAULT_PAIR];
let view = "compare";
let lastPlace = null;

let resolveLands;
const landsReady = new Promise((resolve) => (resolveLands = resolve));

function parseHash() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  const next = VIEWS.includes(parts[0]) ? parts.shift() : "compare";
  return { view: next, a: parts[0], b: parts[1] };
}

const getPair = () => {
  const a = getPlace(pair[0]);
  const b = getPlace(pair[1]);
  return a && b && a !== b ? [a, b] : null;
};

function hashFor(next) {
  return next === "compare" ? `#/compare/${encodeURIComponent(pair[0])}/${encodeURIComponent(pair[1])}` : `#/${next}`;
}

function syncChrome() {
  $$(".tabs a").forEach((link) => {
    const active = link.dataset.view === view;
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
    link.href = hashFor(link.dataset.view);
  });
  const current = view === "compare" ? getPair() : null;
  document.title = current ? `${ordered(...current).map((p) => p.name).join(" and ")}: Parks and Scale` : TITLES[view];
}

function writeHash() {
  history.replaceState(null, "", hashFor(view));
  syncChrome();
}

async function boot() {
  try {
    await loadCore();
  } catch {
    $("#loadError").hidden = false;
    $$(".view").forEach((v) => (v.hidden = true));
    return;
  }

  const ctx = { landsReady, getPair, shuffle, compareWith };
  const compare = initCompare(ctx);
  const placeSheet = initPlace(ctx);
  const chooser = initChooser(ctx);
  const map = initMap(ctx);
  const guide = initGuide(ctx);
  const art = initArt(ctx);

  ctx.openPlace = (place) => {
    lastPlace = place;
    placeSheet.open(place);
  };
  ctx.openChooser = (place) => chooser.open(place);
  ctx.openArt = (kind) => art.open(kind);
  ctx.currentPlace = () => lastPlace || getPair()?.[0] || places[0];
  ctx.replace = (old, next) => {
    const other = pair.find((id) => id !== old.id);
    if (next.id === other) return;
    setPair(pair[0] === old.id ? next.id : pair[0], pair[1] === old.id ? next.id : pair[1]);
  };

  function setPair(a, b) {
    pair = [a, b];
    compare.animateNext();
    writeHash();
    compare.draw();
  }

  function shuffle() {
    const famous = places.filter((p) => !p.kind.startsWith("state_"));
    const draw = () => {
      const pool = Math.random() < 0.8 ? famous : places;
      return pool[Math.floor(Math.random() * pool.length)];
    };
    for (let tries = 0; tries < 60; tries++) {
      const a = draw();
      const b = draw();
      if (a === b) continue;
      const [big, small] = ordered(a, b);
      const ratio = big.acres / small.acres;
      if (ratio > 1.4 && ratio < 400) return setPair(big.id, small.id);
    }
  }

  function compareWith(place) {
    const current = getPair();
    $("#place").close();
    if (!current) return;
    const [big, small] = ordered(...current);
    if (place === big || place === small) {
      navigate("compare");
      return;
    }
    const next = place.acres <= big.acres ? [big, place] : [place, big];
    pair = [next[0].id, next[1].id];
    compare.animateNext();
    navigate("compare");
  }
  Object.assign(ctx, { shuffle, compareWith });

  function show(next) {
    view = next;
    $$(".view").forEach((section) => (section.hidden = section.dataset.view !== view));
    syncChrome();
    if (view === "compare") compare.draw();
    if (view === "map") map.show();
    if (view === "guide") guide.show();
  }

  function navigate(next) {
    show(next);
    history.replaceState(null, "", hashFor(next));
    syncChrome();
    window.scrollTo({ top: 0 });
  }

  function route() {
    const target = parseHash();
    if (target.a && target.b && getPlace(target.a) && getPlace(target.b)) pair = [getPlace(target.a).id, getPlace(target.b).id];
    show(target.view);
  }

  window.addEventListener("hashchange", route);
  $$(".tabs a").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(link.dataset.view);
    }),
  );
  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    navigate("compare");
  });

  initPrefs();

  route();
  document.documentElement.classList.add("ready");

  setTimeout(() => {
    loadLands()
      .catch(() => {
        $("#landsError").hidden = false;
      })
      .finally(() => {
        resolveLands();
        const target = parseHash();
        if (getPlace(target.a) && getPlace(target.b) && getPlace(target.a) !== getPlace(target.b)) {
          pair = [getPlace(target.a).id, getPlace(target.b).id];
        }
        if (view === "compare") compare.draw();
        syncChrome();
      });
  }, 0);
}

boot();
