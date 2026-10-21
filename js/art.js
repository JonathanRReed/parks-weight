import { $, el, esc, fmt, areaText } from "./util.js";
import { getPlace, ordered, placeLine, places } from "./data.js";
import { loadMapShapes, project } from "./geo.js";
import { exportFonts, plateFrame, plateSvg, readPalette } from "./plate.js";
import { getTheme, visited } from "./store.js";

const FONT_FILES = [
  ["Instrument Serif", "normal", "fonts/instrument-serif-normal.woff2"],
  ["Instrument Serif", "italic", "fonts/instrument-serif-italic.woff2"],
  ["Hanken Grotesk", "normal", "fonts/hanken-grotesk-normal.woff2"],
];

let fontCss;
async function embeddedFontCss() {
  fontCss ??= Promise.all(
    FONT_FILES.map(async ([family, style, url]) => {
      const buffer = await (await fetch(url)).arrayBuffer();
      let binary = "";
      new Uint8Array(buffer).forEach((b) => (binary += String.fromCharCode(b)));
      const weight = family === "Hanken Grotesk" ? "400 700" : "400";
      return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2')}`;
    }),
  ).then((rules) => rules.join(""));
  return fontCss;
}

const r1 = (n) => Math.round(n * 10) / 10;

function wrap(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${body}</svg>`;
}

async function usaPoster(pal, trail) {
  const W = 1650;
  const H = 1275;
  const shapes = await loadMapShapes();
  const [bx1, by1, bx2, by2] = shapes.bounds;
  const area = { x: 90, y: 190, w: 1470, h: 790 };
  const scale = Math.min(area.w / (bx2 - bx1), area.h / (by2 - by1));
  const ox = area.x + (area.w - (bx2 - bx1) * scale) / 2 - bx1 * scale;
  const oy = area.y + (area.h - (by2 - by1) * scale) / 2 - by1 * scale;

  const seen = [...visited].map((id) => getPlace(id)).filter(Boolean);
  const dots = (list, filled) =>
    list
      .map((p) => {
        const xy = p.lat != null && p.lon != null ? project(p.lon, p.lat) : null;
        if (!xy) return "";
        const x = r1(ox + xy[0] * scale);
        const y = r1(oy + xy[1] * scale);
        const r = p.kind === "national_park" ? 9 : 7;
        return filled
          ? `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${pal[`k-${p.kind}`]};stroke:${pal.ink};stroke-width:1.5"/>`
          : `<circle cx="${x}" cy="${y}" r="${r - 2}" style="fill:none;stroke:${pal["ink-soft"]};stroke-width:1.2"/>`;
      })
      .join("");
  const toGo = places.filter((p) => p.kind === "national_park" && !visited.has(p.id));
  const route = seen
    .map((p) => (p.lat != null ? project(p.lon, p.lat) : null))
    .filter(Boolean)
    .map(([x, y]) => `${r1(ox + x * scale)},${r1(oy + y * scale)}`);
  const line =
    trail && route.length > 1
      ? `<polyline points="${route.join(" ")}" style="fill:none;stroke:${pal.accent};stroke-width:2;stroke-dasharray:9 7;stroke-linecap:round;stroke-linejoin:round"/>`
      : "";
  const states = shapes.paths
    .map(({ d }) => `<path d="${d}" transform="translate(${r1(ox)} ${r1(oy)}) scale(${scale.toFixed(4)})" style="fill:${pal["paper-2"]};stroke:${pal["ink-soft"]};stroke-width:.6;vector-effect:non-scaling-stroke"/>`)
    .join("");
  const names = seen
    .slice()
    .sort((a, b) => b.acres - a.acres)
    .slice(0, 18)
    .map((p, i) => `<text x="${90 + Math.floor(i / 6) * 420}" y="${1060 + (i % 6) * 26}" style="font:17px ${exportFonts.sans};fill:${pal.ink}">${esc(p.name)}</text>`)
    .join("");
  return wrap(
    W,
    H,
    plateFrame({ width: W, height: H, pal, seed: "usa", m: 22 }) +
      `<text x="90" y="118" style="font:italic 68px ${exportFonts.serif};fill:${pal.ink}">Places I've been</text>` +
      `<text x="92" y="158" style="font:20px ${exportFonts.sans};fill:${pal["ink-soft"]}">${seen.length ? `${fmt(seen.length)} visited, ${new Date().getFullYear()}` : "Mark places as visited and they show up here."}</text>` +
      states +
      dots(toGo, false) +
      line +
      dots(seen, true) +
      names +
      `<circle cx="1330" cy="1075" r="8" style="fill:${pal["k-national_park"]};stroke:${pal.ink};stroke-width:1.5"/><text x="1348" y="1081" style="font:17px ${exportFonts.sans};fill:${pal.ink}">Visited</text>` +
      `<circle cx="1330" cy="1107" r="6" style="fill:none;stroke:${pal["ink-soft"]};stroke-width:1.2"/><text x="1348" y="1113" style="font:17px ${exportFonts.sans};fill:${pal.ink}">National park still to visit</text>`,
  );
}

function placePoster(place, pal) {
  const W = 1100;
  const H = 1400;
  const plate = plateSvg({
    big: place,
    width: 940,
    height: 900,
    pal,
    fonts: exportFonts,
    labels: false,
    fill: { big: pal[`k-${place.kind}`] },
  });
  const been = visited.has(place.id);
  return wrap(
    W,
    H,
    plateFrame({ width: W, height: H, pal, seed: place.id, m: 22 }) +
      `<text x="80" y="150" style="font:italic 74px ${exportFonts.serif};fill:${pal.ink}">${esc(place.name)}</text>` +
      `<text x="82" y="196" style="font:22px ${exportFonts.sans};fill:${pal["ink-soft"]}">${esc(placeLine(place))}</text>` +
      `<g transform="translate(80 250)">${plate}</g>` +
      `<text x="80" y="1250" style="font:italic 46px ${exportFonts.serif};fill:${pal.ink}">${areaText(place.acres)} acres</text>` +
      `<text x="82" y="1292" style="font:20px ${exportFonts.sans};fill:${pal["ink-soft"]}">${areaText(place.km2)} km². Same scale as every Parks and Scale plate.</text>` +
      (been ? `<text x="82" y="1345" style="font:italic 34px ${exportFonts.serif};fill:${pal.accent}">Been here</text>` : ""),
  );
}

function pairPoster(pair, pal) {
  const [big, small] = ordered(...pair);
  const W = 1100;
  const H = 1400;
  const ratio = big.acres / small.acres;
  const plate = plateSvg({ big, small, width: 940, height: 900, pal, fonts: exportFonts });
  return wrap(
    W,
    H,
    plateFrame({ width: W, height: H, pal, seed: big.id + small.id, m: 22 }) +
      `<text x="80" y="150" style="font:italic 70px ${exportFonts.serif};fill:${pal.ink}">${esc(big.name)}</text>` +
      `<text x="82" y="204" style="font:italic 36px ${exportFonts.serif};fill:${pal["ink-soft"]}">and ${esc(small.name)}</text>` +
      `<g transform="translate(80 250)">${plate}</g>` +
      `<text x="80" y="1260" style="font:italic 74px ${exportFonts.serif};fill:${pal.ink}">${ratio >= 10 ? fmt(Math.round(ratio)) : fmt(ratio, 1)}×</text>` +
      `<text x="82" y="1306" style="font:22px ${exportFonts.sans};fill:${pal["ink-soft"]}">${esc(big.name)} is ${ratio >= 10 ? fmt(Math.round(ratio)) : fmt(ratio, 1)} times the size of ${esc(small.name)}.</text>`,
  );
}

export function initArt(ctx) {
  const dialog = $("#art");
  const preview = $("#artPreview");
  const options = $("#artOptions");
  const status = $("#artStatus");
  const printHost = $("#printHost");
  const settings = { kind: "usa", theme: getTheme(), trail: false };
  let svg = "";
  let token = 0;

  const KIND_OPTIONS = [
    ["usa", "Places I've been"],
    ["place", "One place"],
    ["pair", "Current comparison"],
  ];

  async function build() {
    const pal = readPalette(settings.theme);
    if (settings.kind === "usa") {
      await ctx.landsReady;
      return usaPoster(pal, settings.trail);
    }
    if (settings.kind === "place") return placePoster(ctx.currentPlace(), pal);
    return pairPoster(ctx.getPair(), pal);
  }

  async function paint() {
    const mine = ++token;
    status.textContent = "";
    try {
      const out = await build();
      if (mine !== token) return;
      svg = out;
      preview.innerHTML = out;
    } catch {
      if (mine === token) status.textContent = "Couldn't build the poster. Close this and try again.";
    }
  }

  function renderOptions() {
    const radio = (group, value, label, current, onPick) =>
      el("button", { type: "button", class: "chip", "aria-pressed": String(current === value), onclick: () => (onPick(value), renderOptions(), paint()) }, label);
    options.replaceChildren(
      el("div", { class: "chips", role: "group", "aria-label": "Poster" }, ...KIND_OPTIONS.map(([id, label]) => radio("kind", id, label, settings.kind, (v) => (settings.kind = v)))),
      el(
        "div",
        { class: "chips", role: "group", "aria-label": "Theme" },
        radio("theme", "light", "Sandstone", settings.theme, (v) => (settings.theme = v)),
        radio("theme", "dark", "Forest", settings.theme, (v) => (settings.theme = v)),
        settings.kind === "usa"
          ? el("button", { type: "button", class: "chip", "aria-pressed": String(settings.trail), onclick: () => ((settings.trail = !settings.trail), renderOptions(), paint()) }, "Connect visited")
          : null,
      ),
    );
  }

  async function download() {
    const css = await embeddedFontCss();
    const out = svg.replace(/(<svg[^>]*>)/, `$1<defs><style>${css}</style></defs>`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([out], { type: "image/svg+xml;charset=utf-8" }));
    link.download = `parks-and-scale-${settings.kind}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  function print() {
    printHost.innerHTML = svg;
    printHost.dataset.orient = settings.kind === "usa" ? "landscape" : "portrait";
    document.body.classList.add("printing-art");
    const done = () => {
      document.body.classList.remove("printing-art");
      printHost.replaceChildren();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  $("#artClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  $("#artDownload").addEventListener("click", download);
  $("#artPrint").addEventListener("click", print);

  return {
    open(kind = "usa") {
      settings.kind = kind;
      settings.theme = getTheme();
      renderOptions();
      preview.replaceChildren();
      dialog.showModal();
      paint();
    },
  };
}
