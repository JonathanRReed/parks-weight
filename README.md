# Parks and Scale

Put two U.S. parks, monuments, forests or state parks side by side at the same scale. Map the places you've been, browse the field guide, and print them as art.

## Run locally

Serve this directory with a static HTTP server, then open `index.html`:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. There is no package install or build step.

## Files

- `index.html` and `style.css` hold the markup and all styling. Sandstone (light) and forest (dark) are two token sets at the top of `style.css`. `js/prefs.js` drives the Aa menu.
- `js/` is plain ES modules. `main.js` boots the app and routes by URL hash. `data.js` loads and indexes places. `plate.js` draws the comparison plate and is shared by the compare view, place sheet and print art. `usmap.js` is the clustered US map, `guide.js` the field guide, `art.js` the posters.
- `fonts/` holds the self-hosted Instrument Serif, Hanken Grotesk and OpenDyslexic files (OpenDyslexic's license sits beside it). Nothing loads from a third-party host.
- `parks.json` and `shapes.json` hold the 63 national parks. `lands.json` and `land-shapes.json` hold monuments, recreation areas, national forests, state forests and state parks, and load after first paint. `us-states.json` holds state outlines for the map.

## Display settings

The Aa button opens a menu for theme (system, sandstone, forest) and typeface. Both are saved on the device and applied by a small script in `<head>` before first paint, so there is no flash.

- **Field guide** is the default pairing, Instrument Serif with Hanken Grotesk.
- **Classic** is a conventional reading stack: a system book serif for names and system sans for text.
- **OpenDyslexic** loads only when chosen.

Classic and OpenDyslexic drop italics and shrink the display sizes through the `--ital` and `--ds` tokens, because Instrument Serif is far narrower than either. Posters and downloads keep the Field guide fonts whatever is chosen.

## Search and sharing

Metadata lives in the `<head>` of `index.html`: title, description, canonical URL, Open Graph and Twitter tags, and JSON-LD that ties the app to its author on [jonathanrreed.com](https://jonathanrreed.com/). The app is one URL (views use the hash), so `sitemap.xml` lists one page. Bump its `lastmod` when you ship. `robots.txt` allows search and refuses model-training crawlers, matching the personal site. Icons are `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` and `icon-192.png`/`icon-512.png` for `site.webmanifest`. If the canonical URL changes, update it in `index.html`, `robots.txt`, `sitemap.xml` and the JSON-LD.

## Rebuilding data

`rebuild_lands.py` regenerates the land files from public boundary services.

```bash
python3 rebuild_lands.py             # national forests, state forests, state parks
python3 rebuild_lands.py --federal   # then add national monuments and NPS recreation areas
python3 rebuild_lands.py --states    # state outlines for the US map
```

The plain run replaces `lands.json`, so run `--federal` after it. The script writes next to itself.

## Data and limits

National park acreage and visitor counts use 2023 NPS figures. Monument and recreation area outlines come from the NPS. Forest and state-park outlines use USFS administrative boundaries and USGS PAD-US. Small islands are omitted from rendered outlines. Marine national monuments and Buck Island Reef are left out, because PAD-US reports only their land area and the sizes would mislead. `og.png` is the social preview image. Use the maps for comparison, not precise boundary work.

Visited and saved places stay on the current device. This is not an official NPS, USFS, or USGS site.
