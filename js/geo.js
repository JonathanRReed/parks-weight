const RAD = Math.PI / 180;
const K = 1070;

function albers({ lon0, lat1, lat2, centerLon, centerLat, scale, tx, ty }) {
  const sin1 = Math.sin(lat1 * RAD);
  const n = (sin1 + Math.sin(lat2 * RAD)) / 2;
  const c = 1 + sin1 * (2 * n - sin1);
  const rho0 = Math.sqrt(c) / n;
  const raw = (lon, lat) => {
    let dl = lon - lon0;
    dl = ((((dl + 180) % 360) + 360) % 360) - 180;
    const rho = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    const theta = n * dl * RAD;
    return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)];
  };
  const [cx, cy] = raw(centerLon, centerLat);
  return (lon, lat) => {
    const [x, y] = raw(lon, lat);
    return [tx + scale * (x - cx), ty - scale * (y - cy)];
  };
}

const lower48 = albers({ lon0: -96, lat1: 29.5, lat2: 45.5, centerLon: -96.6, centerLat: 38.7, scale: K, tx: 480, ty: 250 });
const alaska = albers({ lon0: -154, lat1: 55, lat2: 65, centerLon: -156, centerLat: 58.5, scale: 0.35 * K, tx: 480 - 0.307 * K, ty: 250 + 0.201 * K });
const hawaii = albers({ lon0: -157, lat1: 8, lat2: 18, centerLon: -160, centerLat: 19.9, scale: K, tx: 480 - 0.205 * K, ty: 250 + 0.212 * K });

export const KM_PER_UNIT = 6371 / K;

export function project(lon, lat) {
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return alaska(lon, lat);
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return hawaii(lon, lat);
  if (lat >= 24 && lat <= 50 && lon >= -125.5 && lon <= -66.5) return lower48(lon, lat);
  return null;
}

const byState = { AK: alaska, HI: hawaii };

const r1 = (n) => Math.round(n * 10) / 10;

let shapesPromise;
export function loadMapShapes() {
  shapesPromise ??= fetchMapShapes().catch((error) => {
    shapesPromise = undefined;
    throw error;
  });
  return shapesPromise;
}

async function fetchMapShapes() {
  const res = await fetch("us-states.json");
  if (!res.ok) throw new Error(`us-states.json: ${res.status}`);
  const states = await res.json();
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const stateBounds = {};
  const paths = states.map(({ st, rings }) => {
    const toXY = byState[st] || lower48;
    const sb = [Infinity, Infinity, -Infinity, -Infinity];
    const d = rings
      .map((ring) => {
        const pts = ring.map(([lon, lat]) => toXY(lon, lat));
        pts.forEach(([x, y]) => {
          sb[0] = Math.min(sb[0], x);
          sb[1] = Math.min(sb[1], y);
          sb[2] = Math.max(sb[2], x);
          sb[3] = Math.max(sb[3], y);
        });
        return `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}Z`;
      })
      .join("");
    stateBounds[st] = sb;
    bounds[0] = Math.min(bounds[0], sb[0]);
    bounds[1] = Math.min(bounds[1], sb[1]);
    bounds[2] = Math.max(bounds[2], sb[2]);
    bounds[3] = Math.max(bounds[3], sb[3]);
    return { st, d };
  });
  return { paths, bounds, stateBounds };
}
