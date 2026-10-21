# Parks and Scale

Compare U.S. parks and forests at the same scale. Overlay two outlines, browse the map, mark visits, save places, and export printable SVG art.

## Run locally

Serve this directory with a static HTTP server, then open `index.html`. For example, with Python installed:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. There is no package install or build step.

## Files

`index.html` loads `app.js` and `style.css`. The JSON files contain park records, land records, and map outlines; `rebuild_lands.py` maintains land data.

## Data and limits

National park acreage and visitor counts use 2023 NPS figures. Forest and state-park outlines use USFS administrative boundaries and USGS PAD-US. Small islands are omitted from rendered outlines. Use the maps for comparison, not precise boundary work.

Visited and saved places stay on the current device. The page loads fonts from Google Fonts. This is not an official NPS, USFS, or USGS site.
