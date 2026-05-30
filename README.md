# GeoRef Studio

Automatic georeferencing tool — stitch a reference image onto a Google Maps satellite view using AI-assisted feature matching (CLAHE + SIFT + RANSAC homography), then export a WGS84 GeoTIFF.

## Architecture

```
georef-tool/
├── frontend/          Next.js 14 dashboard
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── components/
│   │       ├── Dashboard.tsx     ← orchestrator + state machine
│   │       ├── MapPanel.tsx      ← Google Maps embed + overlays
│   │       ├── ControlPanel.tsx  ← step-by-step controls
│   │       ├── ResultPanel.tsx   ← match stats + validate + download
│   │       └── LogPanel.tsx      ← terminal log
│   └── next.config.js            ← proxies /api/py/* → FastAPI :8000
└── backend/
    ├── main.py                   ← FastAPI pipeline
    └── requirements.txt
```

## Pipeline (backend)

1. **Preprocess** — CLAHE (clipLimit=2.0, 8×8 grid) + bilateral filter (d=9, σ=75)
2. **Keypoints** — SIFT on 4×4 spatial grid, fallback contrast threshold
3. **Matching** — BFMatcher L2 + Lowe ratio test (0.75)
4. **Homography** — RANSAC (reprojection threshold = 5px)
5. **Warp + blend** — warpPerspective onto proxy canvas, bitwise composite
6. **GeoTIFF** — rasterio writes WGS84 / EPSG:4326 with affine transform from Static API metadata

## Setup

### 1. Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable: **Maps JavaScript API** + **Maps Static API**
3. Copy your key into `frontend/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_KEY=YOUR_KEY_HERE
```

### 2. Backend (Python 3.10+)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend (Node 18+)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Navigate** the satellite map to the rough area of your reference image
2. **Capture** — locks the proxy frame (640×640 satellite tile via Static Maps API)
3. **Upload** your reference image (any raster format)
4. **Run** — pipeline dispatches to FastAPI, logs stream in real time
5. **Preview** — stitched result overlaid on map; inspect visually
6. **Validate** — confirms result; unlocks GeoTIFF export
7. **Download** — WGS84 GeoTIFF ready for QGIS / ArcGIS / any GIS tool

## Notes

- The proxy image is always 640×640px fetched from Google Maps Static API with `maptype=satellite`
- Pixel resolution depends on zoom level (displayed in the map HUD)
- For best results: zoom 14–17 works well for drone-scale imagery; zoom 12–14 for satellite crops
- The GeoTIFF uses an approximate affine transform derived from the Static API center coordinate + zoom — accuracy is limited by Google Maps' tile alignment (~few meters at z17)
