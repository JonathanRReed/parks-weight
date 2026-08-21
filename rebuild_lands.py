#!/usr/bin/env python3
"""Build extra true-scale lands for Parks and Scale: national forests, state forests, state parks."""
from __future__ import annotations

import json
import math
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

OUT = Path("/tmp/parks-weve-been")
CACHE = Path("/tmp/pas-build")
CACHE.mkdir(parents=True, exist_ok=True)

UA = "ParksAndScale/1.0 (personal atlas rebuild)"
R = 6371000.0
Q = 40.0  # meters per SVG unit, matches existing national-park shapes
MIN_RING_M2 = 250_000  # drop slivers under ~62 acres unless it is the only ring
MAX_RINGS = 18
USFS = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer/0"
PAD = "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Protected_Areas_National/FeatureServer/0"
STATES_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"

KIND_META = {
    "national_forest": "National forest",
    "state_forest": "State forest",
    "state_park": "State park",
}


def get_json(url: str, timeout: int = 180):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def query(base: str, retries: int = 4, **params):
    params.setdefault("f", "json")
    url = base + "/query?" + urllib.parse.urlencode(params)
    last = None
    for i in range(retries):
        try:
            data = get_json(url)
            if data.get("error"):
                last = data["error"]
                time.sleep(1.5 * (i + 1))
                continue
            return data
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"query failed {base} {params.get('where')} {last}")


def fetch_all(base: str, where: str, fields: str, offset_deg: float = 0.02, page: int = 200):
    key = re.sub(r"[^a-z0-9]+", "_", (base[-12:] + where)[:80].lower())
    cache_path = CACHE / f"raw_{key}.json"
    if cache_path.exists():
        print("cache hit", cache_path.name)
        return json.loads(cache_path.read_text())
    feats = []
    start = 0
    while True:
        data = query(
            base,
            where=where,
            outFields=fields,
            outSR=4326,
            returnGeometry="true",
            maxAllowableOffset=offset_deg,
            geometryPrecision=4,
            resultRecordCount=page,
            resultOffset=start,
        )
        batch = data.get("features") or []
        feats.extend(batch)
        print(f"  {where[:48]:48} +{len(batch):4} total {len(feats)}")
        if not batch or not data.get("exceededTransferLimit"):
            if len(batch) < page:
                break
            if not data.get("exceededTransferLimit") and len(batch) < page:
                break
        if len(batch) < page:
            break
        start += len(batch)
        if start > 20000:
            break
    cache_path.write_text(json.dumps(feats))
    return feats


def ring_area_lonlat(ring):
    if len(ring) < 4:
        return 0.0
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def ring_centroid(ring):
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if not pts:
        return 0.0, 0.0
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def simplify_ring(ring, eps=0.008):
    pts = [(float(p[0]), float(p[1])) for p in ring]
    if len(pts) <= 6:
        return pts

    def dist(p, a, b):
        x, y = p
        x1, y1 = a
        x2, y2 = b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

    def rec(points):
        if len(points) <= 2:
            return points
        a, b = points[0], points[-1]
        idx, best = 0, -1.0
        for i in range(1, len(points) - 1):
            d = dist(points[i], a, b)
            if d > best:
                idx, best = i, d
        if best > eps:
            left = rec(points[: idx + 1])
            right = rec(points[idx:])
            return left[:-1] + right
        return [a, b]

    out = rec(pts)
    if out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else pts


def pick_rings(rings):
    scored = []
    for ring in rings or []:
        if not ring or len(ring) < 4:
            continue
        lon0, lat0 = ring_centroid(ring)
        # approximate m2 using local cosine
        coslat = math.cos(math.radians(lat0 or 0.0))
        area_deg = abs(ring_area_lonlat(ring))
        m2 = area_deg * (111_320 * 111_320 * max(coslat, 0.05))
        scored.append((m2, ring))
    if not scored:
        return []
    scored.sort(key=lambda x: -x[0])
    total = sum(a for a, _ in scored) or 1
    kept, acc = [], 0.0
    for m2, ring in scored:
        if kept and (m2 < MIN_RING_M2 or len(kept) >= MAX_RINGS) and acc / total > 0.97:
            break
        if not kept or m2 >= MIN_RING_M2 or len(kept) < 3:
            kept.append(simplify_ring(ring))
            acc += m2
        if len(kept) >= MAX_RINGS:
            break
    return kept


def project_rings(rings):
    pts = [p for ring in rings for p in ring]
    if not pts:
        return None
    lon0 = sum(p[0] for p in pts) / len(pts)
    lat0 = sum(p[1] for p in pts) / len(pts)
    cos0 = math.cos(math.radians(lat0))
    proj = []
    for ring in rings:
        pr = []
        for lon, lat in ring:
            x = R * math.radians(lon - lon0) * cos0 / Q
            y = -R * math.radians(lat - lat0) / Q
            pr.append((x, y))
        proj.append(pr)
    return lat0, lon0, proj


def shoelace_m2(ring):
    if len(ring) < 4:
        return 0.0
    a = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0 * (Q * Q)


def path_from_proj(proj):
    parts = []
    xs, ys = [], []
    for ring in proj:
        if len(ring) < 4:
            continue
        cmds = []
        px = py = None
        for x, y in ring:
            xi, yi = int(round(x)), int(round(y))
            if px == xi and py == yi:
                continue
            cmds.append((xi, yi))
            xs.append(xi)
            ys.append(yi)
            px, py = xi, yi
        if len(cmds) < 4:
            continue
        d = "M" + "L".join(f"{x} {y}" for x, y in cmds) + "Z"
        parts.append(d)
    if not parts or not xs:
        return None
    d = "".join(parts)
    bbox = [min(xs), min(ys), max(xs), max(ys)]
    area_m2 = sum(shoelace_m2(ring) for ring in proj)
    return d, bbox, area_m2


def slugify(kind, name, state):
    raw = f"{kind}-{state}-{name}".lower()
    raw = raw.replace("–", "-").replace("—", "-")
    raw = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return raw[:80]


def load_states():
    path = CACHE / "us-states.json"
    if not path.exists():
        path.write_text(json.dumps(get_json(STATES_URL)))
    data = json.loads(path.read_text())
    polys = []
    for feat in data["features"]:
        name = feat["properties"].get("name") or feat["properties"].get("NAME")
        st = STATE_ABBR.get(name, "")
        geom = feat["geometry"]
        rings = []
        if geom["type"] == "Polygon":
            rings.append(geom["coordinates"][0])
        elif geom["type"] == "MultiPolygon":
            for poly in geom["coordinates"]:
                rings.append(poly[0])
        polys.append((st or name, rings))
    return polys


STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
    "Puerto Rico": "PR", "United States Virgin Islands": "VI", "Virgin Islands": "VI",
    "Guam": "GU", "American Samoa": "AS", "Northern Mariana Islands": "MP",
}


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def lookup_state(lon, lat, state_polys):
    for st, rings in state_polys:
        for ring in rings:
            if point_in_ring(lon, lat, ring):
                return st
    return ""


def clean_name(name: str) -> str:
    name = (name or "").replace("\u00a0", " ").strip()
    name = re.sub(r"\s+", " ", name)
    return name


def feature_to_unit(feat, kind, name, acres, state_polys):
    name = clean_name(name)
    if not name:
        return None
    geom = feat.get("geometry") or {}
    rings = pick_rings(geom.get("rings") or [])
    if not rings:
        return None
    proj = project_rings(rings)
    if not proj:
        return None
    lat0, lon0, pr = proj
    shaped = path_from_proj(pr)
    if not shaped:
        return None
    d, bbox, area_m2 = shaped
    acres = float(acres or 0) or area_m2 / 4046.8564224
    km2 = acres * 0.0040468564224
    st = lookup_state(lon0, lat0, state_polys)
    return {
        "name": name,
        "slug": slugify(kind, name, st or "us"),
        "kind": kind,
        "states": [st] if st else [],
        "acres": round(acres, 2),
        "km2": round(km2, 2),
        "lat": round(lat0, 4),
        "lon": round(lon0, 4),
        "year": None,
        "visitors": 0,
        "description": f"{KIND_META[kind]} in {st or 'the U.S.'}. True-scale outline from official boundaries.",
        "wiki": "https://en.wikipedia.org/wiki/Special:Search?search=" + urllib.parse.quote(name),
        "shape": {"name": name, "kind": kind, "km2": round(area_m2 / 1_000_000, 2), "d": d, "q": 40, "bbox": bbox, "slug": slugify(kind, name, st or "us"), "acres": round(acres, 2)},
    }


def merge_units(units):
    groups = defaultdict(list)
    for u in units:
        st = (u["states"] or ["US"])[0]
        groups[(u["kind"], u["name"].lower(), st)].append(u)
    out = []
    for _, items in groups.items():
        if len(items) == 1:
            out.append(items[0])
            continue
        items.sort(key=lambda x: -x["acres"])
        base = items[0]
        acres = sum(x["acres"] for x in items)
        # keep the largest silhouette; summed acres for rank
        base["acres"] = round(acres, 2)
        base["km2"] = round(acres * 0.0040468564224, 2)
        base["shape"]["acres"] = base["acres"]
        out.append(base)
    return out


def rank_kind(units, kind):
    subset = [u for u in units if u["kind"] == kind]
    subset.sort(key=lambda x: -x["acres"])
    for i, u in enumerate(subset, 1):
        u["rank"] = i
        u["shape"]["rank"] = i
        u["shape"]["states"] = u["states"]


def main():
    print("loading states")
    state_polys = load_states()
    units = []

    print("national forests")
    nf = fetch_all(USFS, "1=1", "forestname,gis_acres", offset_deg=0.03, page=200)
    for feat in nf:
        a = feat.get("attributes") or {}
        u = feature_to_unit(feat, "national_forest", a.get("forestname"), a.get("gis_acres"), state_polys)
        if u:
            units.append(u)
    print("  kept", sum(1 for u in units if u["kind"] == "national_forest"))

    print("state parks")
    sp = fetch_all(PAD, "Des_Tp='SP'", "Unit_Nm,GIS_AcrsDb,ST_Name,Des_Tp", offset_deg=0.015, page=200)
    for feat in sp:
        a = feat.get("attributes") or {}
        u = feature_to_unit(feat, "state_park", a.get("Unit_Nm"), a.get("GIS_AcrsDb"), state_polys)
        if u:
            units.append(u)

    print("state forests")
    sf = fetch_all(
        PAD,
        "Mang_Type='STAT' AND Unit_Nm LIKE '%State Forest%'",
        "Unit_Nm,GIS_AcrsDb,ST_Name,Des_Tp",
        offset_deg=0.02,
        page=200,
    )
    for feat in sf:
        a = feat.get("attributes") or {}
        name = clean_name(a.get("Unit_Nm"))
        if not name or "state park" in name.lower():
            continue
        u = feature_to_unit(feat, "state_forest", name, a.get("GIS_AcrsDb"), state_polys)
        if u:
            units.append(u)

    units = merge_units(units)
    for kind in KIND_META:
        rank_kind(units, kind)

    units.sort(key=lambda u: (u["kind"], u["rank"]))
    meta = []
    shapes = []
    for u in units:
        sh = u.pop("shape")
        sh["name"] = u["name"]
        sh["slug"] = u["slug"]
        shapes.append(sh)
        meta.append(u)

    counts = defaultdict(int)
    for u in meta:
        counts[u["kind"]] += 1
    print("counts", dict(counts), "total", len(meta))
    payload_meta = OUT / "lands.json"
    payload_shapes = OUT / "land-shapes.json"
    payload_meta.write_text(json.dumps(meta, separators=(",", ":")))
    payload_shapes.write_text(json.dumps({"lands": shapes}, separators=(",", ":")))
    print("wrote", payload_meta, payload_meta.stat().st_size)
    print("wrote", payload_shapes, payload_shapes.stat().st_size)
    for kind, n in counts.items():
        top = [u["name"] + f" ({u['acres']:.0f} ac, {u['states']})" for u in meta if u["kind"] == kind][:3]
        print(kind, n, "e.g.", top)


if __name__ == "__main__":
    main()
