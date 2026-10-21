import { KINDS } from "./data.js";
import { el, esc, fmt } from "./util.js";

const KM_PER_UNIT = 0.04;
const PX_PER_MILE_PER_SCALE = (1 / KM_PER_UNIT) * 1.609344;
const NICE_MILES = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const PALETTE_KEYS = ["paper", "paper-2", "ink", "ink-soft", "big", "small", "accent", "accent-ink", ...KINDS.map((k) => `k-${k.id}`)];

export const livePalette = Object.fromEntries(PALETTE_KEYS.map((k) => [k, `var(--${k})`]));
// Average advance of a place name at 19px, used to decide whether a label fits in the margin.
const LABEL_ADVANCE = { classic: 9.3, dyslexic: 12.6 };
export const liveFonts = {
  serif: "var(--serif)",
  sans: "var(--sans)",
  ital: "var(--ital)",
  get advance() {
    return LABEL_ADVANCE[document.documentElement.dataset.font] ?? 7.8;
  },
};
export const exportFonts = {
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Hanken Grotesk', system-ui, sans-serif",
  ital: "italic",
  advance: 7.8,
};

export function readPalette(theme) {
  const probe = document.createElement("div");
  probe.dataset.theme = theme;
  probe.hidden = true;
  document.body.append(probe);
  const styles = getComputedStyle(probe);
  const pal = Object.fromEntries(PALETTE_KEYS.map((k) => [k, styles.getPropertyValue(`--${k}`).trim()]));
  probe.remove();
  return pal;
}

const SCATTER_RATIO = 10;
const SCATTER_REACH = 5;
const layouts = new WeakMap();

function parseRings(d) {
  const rings = [];
  for (const chunk of d.split("M")) {
    const nums = chunk.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 6) continue;
    const bbox = [Infinity, Infinity, -Infinity, -Infinity];
    let twice = 0;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = +nums[i];
      const y = +nums[i + 1];
      const j = (i + 2) % nums.length;
      twice += x * +nums[j + 1] - +nums[j] * y;
      bbox[0] = Math.min(bbox[0], x);
      bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x);
      bbox[3] = Math.max(bbox[3], y);
    }
    rings.push({ d: `M${chunk}`, area: Math.abs(twice) / 2, bbox });
  }
  return rings;
}

const midpoint = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/**
 * Places made of far-flung pieces (the California coastal rocks, for one) would shrink the
 * whole plate to dots. Frame the largest cluster instead and re-center it on the plate origin.
 */
function layoutOf(place) {
  const { shape } = place;
  let hit = layouts.get(shape);
  if (hit) return hit;
  hit = { d: shape.d, box: shape.bbox, dx: 0, dy: 0, scattered: false, span: 0 };
  if (shape.d.indexOf("M", 1) > 0) {
    const rings = parseRings(shape.d);
    const total = rings.reduce((sum, r) => sum + r.area, 0);
    const span = Math.max(shape.bbox[2] - shape.bbox[0], shape.bbox[3] - shape.bbox[1]);
    if (rings.length > 1 && total > 0 && span > SCATTER_RATIO * Math.sqrt(total)) {
      rings.sort((a, b) => b.area - a.area);
      const [lx, ly] = midpoint(rings[0].bbox);
      const reach = SCATTER_REACH * Math.sqrt(total);
      const kept = rings.filter((r) => {
        const [x, y] = midpoint(r.bbox);
        return Math.hypot(x - lx, y - ly) <= reach;
      });
      if (kept.length < rings.length) {
        const box = kept.reduce(
          (acc, r) => [Math.min(acc[0], r.bbox[0]), Math.min(acc[1], r.bbox[1]), Math.max(acc[2], r.bbox[2]), Math.max(acc[3], r.bbox[3])],
          [Infinity, Infinity, -Infinity, -Infinity],
        );
        const [cx, cy] = midpoint(box);
        hit = { d: kept.map((r) => r.d).join(""), box, dx: -cx, dy: -cy, scattered: true, span };
      }
    }
  }
  layouts.set(shape, hit);
  return hit;
}

const placedBox = (l) => [l.box[0] + l.dx, l.box[1] + l.dy, l.box[2] + l.dx, l.box[3] + l.dy];

export const shapeD = (place) => layoutOf(place).d;

export function scatterNote(place) {
  const l = layoutOf(place);
  if (!l.scattered) return "";
  const miles = Math.max(1, Math.round((l.span * KM_PER_UNIT) / 1.609344));
  return `${place.name} is made of pieces spread over about ${fmt(miles)} miles, so the plate draws only its largest cluster.`;
}

export function fitBox(place, pad = 1.18) {
  const [x1, y1, x2, y2] = layoutOf(place).box;
  const size = Math.max(x2 - x1, y2 - y1, 24) * pad;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;
}

export function thumb(place) {
  return el(
    "svg",
    { class: "thumb", viewBox: fitBox(place), "aria-hidden": "true", focusable: "false" },
    el("path", { d: shapeD(place), style: `fill:var(--k-${place.kind})` }),
  );
}

const edgeCache = new Map();
function edgePoint(place, side) {
  const key = `${place.id}:${side}`;
  if (edgeCache.has(key)) return edgeCache.get(key);
  const l = layoutOf(place);
  const nums = l.d.match(/-?\d+(?:\.\d+)?/g) || [];
  let best = null;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i];
    const y = +nums[i + 1];
    if (!best || (side === "left" ? x < best[0] : x > best[0])) best = [x, y];
  }
  const point = best ? [best[0] + l.dx, best[1] + l.dy] : [0, 0];
  edgeCache.set(key, point);
  return point;
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let plateCount = 0;
const n1 = (v) => Math.round(v * 10) / 10;

function contourPath(width, height, m, rand) {
  const lines = 5;
  let d = "";
  for (let i = 0; i < lines; i++) {
    const y = m + 6 + ((height - 2 * m - 12) * (i + 0.6)) / (lines + 0.2);
    const amp = 10 + rand() * 16;
    const x0 = m + 4;
    const x3 = width - m - 4;
    const w = (x3 - x0) / 3;
    d += `M${x0} ${n1(y)}`;
    for (let k = 0; k < 3; k++) {
      const a = (rand() - 0.5) * 2 * amp;
      const b = (rand() - 0.5) * 2 * amp;
      d += `C${n1(x0 + w * k + w * 0.35)} ${n1(y + a)} ${n1(x0 + w * k + w * 0.7)} ${n1(y + b)} ${n1(x0 + w * (k + 1))} ${n1(y + (rand() - 0.5) * amp * 0.6)}`;
    }
  }
  return d;
}

function tickPath(width, height, m) {
  let d = "";
  const inset = m + 4;
  for (let x = inset + 12, i = 0; x < width - inset - 6; x += 12, i++) {
    const len = i % 5 === 4 ? 6 : 3;
    d += `M${x} ${inset}v${len}M${x} ${height - inset}v${-len}`;
  }
  return d;
}

function pickScale(pxPerMile) {
  let best = NICE_MILES[0];
  for (const miles of NICE_MILES) {
    if (miles * pxPerMile <= 150) best = miles;
  }
  return best;
}

const fmtMiles = (miles) => (miles < 1 ? String(miles) : fmt(miles));

export function plateFrame({ width, height, pal, seed, m = 10 }) {
  const ink = pal.ink;
  const rand = rng(hashSeed(seed));
  return (
    `<rect width="${width}" height="${height}" style="fill:${pal.paper}"/>` +
    `<path d="${contourPath(width, height, m, rand)}" style="fill:none;stroke:${ink};stroke-opacity:.1;stroke-width:1"/>` +
    `<rect x="${m}" y="${m}" width="${width - 2 * m}" height="${height - 2 * m}" style="fill:none;stroke:${ink};stroke-width:1"/>` +
    `<rect x="${m + 4}" y="${m + 4}" width="${width - 2 * m - 8}" height="${height - 2 * m - 8}" style="fill:none;stroke:${ink};stroke-opacity:.55;stroke-width:.6"/>` +
    `<path d="${tickPath(width, height, m)}" style="fill:none;stroke:${ink};stroke-opacity:.5;stroke-width:.8"/>`
  );
}

export function plateSvg({ big, small = null, width, height, pal, fonts, seed = "", labels = true, title = "", fill = null }) {
  const id = `p${++plateCount}`;
  const m = 10;
  const area = { x0: m + 20, y0: m + 20, x1: width - m - 20, y1: height - m - 42 };
  const shapes = small ? [big, small] : [big];
  const lay = new Map(shapes.map((p) => [p, layoutOf(p)]));
  const box = shapes.reduce(
    (acc, p) => {
      const b = placedBox(lay.get(p));
      return [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])];
    },
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const bw = Math.max(box[2] - box[0], 1);
  const bh = Math.max(box[3] - box[1], 1);
  const s = Math.min((area.x1 - area.x0) / bw, (area.y1 - area.y0) / bh);
  const tx = (area.x0 + area.x1) / 2 - ((box[0] + box[2]) / 2) * s;
  const ty = (area.y0 + area.y1) / 2 - ((box[1] + box[3]) / 2) * s;
  const toPx = ([x, y]) => [tx + x * s, ty + y * s];
  const ink = pal.ink;
  const pathStyle = (extra) => `vector-effect:non-scaling-stroke;stroke-linejoin:round;${extra}`;
  const group = (inner) => `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s})">${inner}</g>`;
  const hatchStep = 7 / s;

  const bigFill = fill?.big || pal.big;
  const smallFill = fill?.small || pal.small;
  const moved = (l) => (l.scattered ? ` transform="translate(${l.dx.toFixed(1)} ${l.dy.toFixed(1)})"` : "");
  const shapePath = (p, role, style) => `<path${role ? ` data-role="${role}"` : ""} d="${lay.get(p).d}"${moved(lay.get(p))} style="${style}"/>`;
  const shadowPaths = shapes.map((p) => `<path d="${lay.get(p).d}"${moved(lay.get(p))}/>`).join("");
  const clipped = [...lay.values()].some((l) => l.scattered);
  const clip = clipped ? ` clip-path="url(#${id}c)"` : "";
  const parts = [];

  const inner = m + 5;
  parts.push(`<defs>${clipped ? `<clipPath id="${id}c"><rect x="${inner}" y="${inner}" width="${width - 2 * inner}" height="${height - 2 * inner}"/></clipPath>` : ""}<pattern id="${id}h" patternUnits="userSpaceOnUse" width="${hatchStep.toFixed(3)}" height="${hatchStep.toFixed(3)}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${hatchStep.toFixed(3)}" style="stroke:${ink};stroke-opacity:.3;stroke-width:${(0.9 / s).toFixed(4)}"/></pattern></defs>`);
  parts.push(plateFrame({ width, height, pal, seed: seed || big.id }));

  parts.push(`<g${clip}><g transform="translate(3 3)" style="fill:${ink};fill-opacity:.17;stroke:none">${group(shadowPaths)}</g></g>`);
  parts.push(
    `<g${clip}>` +
      group(
        shapePath(big, "big", pathStyle(`fill:${bigFill};stroke:${ink};stroke-width:1.3`)) +
          shapePath(big, "big", pathStyle(`fill:url(#${id}h);stroke:none`)) +
          (small ? shapePath(small, "small", pathStyle(`fill:${smallFill};stroke:${ink};stroke-width:1.3`)) : ""),
      ) +
      `</g>`,
  );

  let ringed = false;
  if (small) {
    const sb = placedBox(lay.get(small));
    if (Math.max(sb[2] - sb[0], sb[3] - sb[1]) * s < 16) {
      ringed = true;
      const [cx, cy] = toPx([(sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2]);
      parts.push(`<circle cx="${n1(cx)}" cy="${n1(cy)}" r="13" style="fill:none;stroke:${smallFill};stroke-width:2"/>`);
    }
  }

  const serif = fonts.serif;
  const sans = fonts.sans;
  const ital = fonts.ital ?? "italic";
  const advance = fonts.advance ?? 7.8;

  const clampY = (y) => Math.min(Math.max(y, m + 26), height - m - 50);
  const callout = (n, name, point, side, ringed = false) => {
    const r = 10;
    const [px, rawY] = toPx(point);
    const py = clampY(rawY);
    const edge = m + 16;
    const textWidth = name.length * advance;
    const room = side === "left" ? px - edge : width - edge - px;
    const dot = `<circle cx="${n1(px)}" cy="${n1(rawY)}" r="3.2" style="fill:${ink}"/>`;
    const badge = (cx, cy) =>
      `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${r}" style="fill:${pal.paper};stroke:${ink};stroke-width:1"/>` +
      `<text x="${n1(cx)}" y="${n1(cy)}" text-anchor="middle" dominant-baseline="central" style="font:${ital} 14px ${serif};fill:${ink}">${n}</text>`;
    if (!labels || room < 2 * r + 8 + textWidth + 30) {
      const gap = ringed ? 34 : 0;
      const lifted = ringed ? clampY(rawY - gap < m + 26 ? rawY + gap : rawY - gap) : py;
      const cx = side === "left" ? Math.max(px - r - 8, m + r + 8) : Math.min(px + r + 8, width - m - r - 8);
      const link = `<line x1="${n1(px)}" y1="${n1(rawY)}" x2="${n1(cx)}" y2="${n1(lifted)}" style="stroke:${ink};stroke-width:1"/>`;
      const inward = side === "left" ? 1 : -1;
      const haloed = labels
        ? `<text x="${n1(cx + inward * (r + 7))}" y="${n1(lifted)}" text-anchor="${side === "left" ? "start" : "end"}" dominant-baseline="central" style="font:${ital} 19px ${serif};fill:${ink};paint-order:stroke;stroke:${pal.paper};stroke-width:5px;stroke-linejoin:round">${esc(name)}</text>`
        : "";
      return link + dot + badge(cx, lifted) + haloed;
    }
    const dir = side === "left" ? 1 : -1;
    const startX = side === "left" ? edge : width - edge;
    const badgeX = startX + dir * r;
    const textX = startX + dir * (2 * r + 8);
    const lineStart = textX + dir * (textWidth + 8);
    return (
      `<line x1="${n1(lineStart)}" y1="${n1(py)}" x2="${n1(px)}" y2="${n1(rawY)}" style="stroke:${ink};stroke-width:1"/>` +
      dot +
      badge(badgeX, py) +
      `<text x="${n1(textX)}" y="${n1(py)}" text-anchor="${side === "left" ? "start" : "end"}" dominant-baseline="central" style="font:${ital} 19px ${serif};fill:${ink}">${esc(name)}</text>`
    );
  };

  if (small) {
    parts.push(callout(1, big.name, edgePoint(big, "left"), "left"));
    parts.push(callout(2, small.name, edgePoint(small, "right"), "right", ringed));
  }

  const pxPerMile = s * PX_PER_MILE_PER_SCALE;
  const miles = pickScale(pxPerMile);
  const barW = miles * pxPerMile;
  const bx = m + 20;
  const by = height - m - 20;
  const km = miles * 1.609344;
  parts.push(
    `<path d="M${bx} ${by - 6}V${by}H${n1(bx + barW)}V${by - 6}M${n1(bx + barW / 2)} ${by - 4}V${by}" style="fill:none;stroke:${ink};stroke-width:1.2"/>` +
      `<text x="${bx}" y="${by + 12}" style="font:12px ${sans};fill:${ink}">0</text>` +
      `<text x="${n1(bx + barW)}" y="${by + 12}" text-anchor="middle" style="font:12px ${sans};fill:${ink}">${fmtMiles(miles)} mi</text>` +
      `<text x="${n1(bx + barW + 10)}" y="${by}" style="font:12px ${sans};fill:${pal["ink-soft"]}">${km >= 1 ? fmt(km) : fmt(km, 1)} km</text>`,
  );

  const nx = width - m - 26;
  const ny = height - m - 40;
  parts.push(
    `<path d="M${nx} ${ny - 12}L${nx + 6} ${ny + 8}L${nx} ${ny + 4}L${nx - 6} ${ny + 8}Z" style="fill:${ink}"/>` +
      `<text x="${nx}" y="${ny + 22}" text-anchor="middle" style="font:${ital} 14px ${serif};fill:${ink}">N</text>`,
  );

  const label = title || (small ? `${big.name} and ${small.name} drawn at the same scale` : `${big.name} outline`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">${parts.join("")}</svg>`;
}
