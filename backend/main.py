"""
GeoRef Studio — FastAPI backend
Exposes the CLAHE+SIFT+Homography+GeoTIFF pipeline via HTTP.
"""

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np
import cv2
import math
import io
import base64
import httpx
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import tempfile
import os
from pathlib import Path

app = FastAPI(title="GeoRef Studio Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
#  helpers
# ─────────────────────────────────────────────────────────────

def meters_per_px(lat_deg: float, zoom: int) -> float:
    """Google Maps pixel resolution at a given lat/zoom."""
    return 156543.03392 * math.cos(math.radians(lat_deg)) / (2 ** zoom)


def proxy_bounds(center_lat: float, center_lng: float, zoom: int, w: int, h: int):
    """
    Compute the geographic bounding box of a Google Maps Static API image.
    Returns (north, south, east, west) in WGS84 degrees.
    """
    mpp = meters_per_px(center_lat, zoom)

    # Pixel offsets → meters
    half_w_m = (w / 2) * mpp
    half_h_m = (h / 2) * mpp

    # Meters → degrees (approximate, good enough for small tiles)
    delta_lat = half_h_m / 111_320
    delta_lng = half_w_m / (111_320 * math.cos(math.radians(center_lat)))

    north = center_lat + delta_lat
    south = center_lat - delta_lat
    east  = center_lng + delta_lng
    west  = center_lng - delta_lng

    return north, south, east, west


# ─────────────────────────────────────────────────────────────
#  image preprocessing
# ─────────────────────────────────────────────────────────────

def apply_clahe_bilateral(img_bgr: np.ndarray) -> np.ndarray:
    """CLAHE on L channel + bilateral denoise — identical to the reference script."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)
    return cv2.bilateralFilter(enhanced, d=9, sigmaColor=75, sigmaSpace=75)


# ─────────────────────────────────────────────────────────────
#  keypoint detection
# ─────────────────────────────────────────────────────────────

def get_grid_keypoints(img: np.ndarray, rows: int = 4, cols: int = 4, min_kp: int = 15):
    """
    Grid-based SIFT detection — ensures spatial coverage across all image regions.
    Falls back to lower contrast threshold if a cell has too few keypoints.
    """
    h, w = img.shape[:2]
    dh, dw = h // rows, w // cols
    sift_hi = cv2.SIFT_create(contrastThreshold=0.04)
    sift_lo = cv2.SIFT_create(contrastThreshold=0.01)
    keypoints = []

    for i in range(rows):
        for j in range(cols):
            y1 = i * dh
            y2 = h if i == rows - 1 else (i + 1) * dh
            x1 = j * dw
            x2 = w if j == cols - 1 else (j + 1) * dw
            roi = img[y1:y2, x1:x2]
            kps = sift_hi.detect(roi, None)
            if len(kps) < min_kp:
                kps = sift_lo.detect(roi, None)
            for kp in kps:
                kp.pt = (kp.pt[0] + x1, kp.pt[1] + y1)
                keypoints.append(kp)

    return keypoints


# ─────────────────────────────────────────────────────────────
#  main pipeline
# ─────────────────────────────────────────────────────────────

def run_pipeline(proxy_bgr: np.ndarray, ref_bgr: np.ndarray):
    """
    Full pipeline:
      1. CLAHE + bilateral on both images
      2. Grid SIFT keypoints
      3. BFMatcher + Lowe ratio test
      4. RANSAC homography
      5. Warp reference onto proxy canvas
      6. Return warp result + homography matrix
    """
    # Step 1: preprocess
    proxy_pp = apply_clahe_bilateral(proxy_bgr)
    ref_pp   = apply_clahe_bilateral(ref_bgr)

    # Step 2: keypoints
    sift = cv2.SIFT_create()
    kp_proxy = get_grid_keypoints(proxy_pp)
    kp_proxy, des_proxy = sift.compute(proxy_pp, kp_proxy)

    kp_ref = get_grid_keypoints(ref_pp)
    kp_ref, des_ref = sift.compute(ref_pp, kp_ref)

    if des_proxy is None or des_ref is None:
        raise ValueError("SIFT failed to compute descriptors — images may be too uniform")

    # Step 3: match
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des_ref, des_proxy, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]

    if len(good) < 4:
        raise ValueError(f"Too few good matches ({len(good)}) — try zooming in more")

    # Step 4: homography
    src_pts = np.float32([kp_ref[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp_proxy[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    matrix, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

    if matrix is None:
        raise ValueError("Homography computation failed — insufficient spatial overlap")

    matches_mask = mask.ravel().tolist()
    inliers = [good[i] for i in range(len(good)) if matches_mask[i] == 1]

    # Step 5: warp reference onto proxy canvas
    h_p, w_p = proxy_bgr.shape[:2]
    warped_ref = cv2.warpPerspective(ref_bgr, matrix, (w_p, h_p))

    # Blend: mask out black regions of warp, composite onto proxy
    gray_warped = cv2.cvtColor(warped_ref, cv2.COLOR_BGR2GRAY)
    _, warp_mask = cv2.threshold(gray_warped, 1, 255, cv2.THRESH_BINARY)
    mask_inv = cv2.bitwise_not(warp_mask)
    bg = cv2.bitwise_and(proxy_bgr, proxy_bgr, mask=mask_inv)
    merged = cv2.add(bg, warped_ref)

    match_score = len(inliers) / max(len(good), 1)

    return merged, matrix, inliers, match_score


def build_geotiff(image_bgr: np.ndarray, north: float, south: float,
                  east: float, west: float) -> bytes:
    """Convert a BGR numpy image to a WGS84 GeoTIFF in memory."""
    img_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_rgb.shape[:2]
    transform = from_bounds(west, south, east, north, w, h)
    crs = CRS.from_epsg(4326)

    buf = io.BytesIO()
    with rasterio.open(
        buf, 'w',
        driver='GTiff',
        height=h, width=w,
        count=3,
        dtype=img_rgb.dtype,
        crs=crs,
        transform=transform,
    ) as dst:
        dst.write(img_rgb[:, :, 0], 1)
        dst.write(img_rgb[:, :, 1], 2)
        dst.write(img_rgb[:, :, 2], 3)

    return buf.getvalue()


# ─────────────────────────────────────────────────────────────
#  routes
# ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "georef-pipeline"}


@app.post("/process")
async def process(
    reference_image: UploadFile = File(...),
    proxy_url: str = Form(...),
    center_lat: float = Form(...),
    center_lng: float = Form(...),
    zoom: int = Form(...),
    map_width: int = Form(640),
    map_height: int = Form(640),
):
    """
    Main georeferencing endpoint.
    Receives a reference image + proxy map URL + viewport metadata.
    Returns stitched preview (base64), GeoTIFF (base64), and match stats.
    """
    try:
        # 1. Load reference image
        ref_bytes = await reference_image.read()
        ref_arr = np.frombuffer(ref_bytes, np.uint8)
        ref_bgr = cv2.imdecode(ref_arr, cv2.IMREAD_COLOR)
        if ref_bgr is None:
            raise HTTPException(status_code=400, detail="Could not decode reference image")

        # 2. Fetch proxy image from Google Maps Static API
        async with httpx.AsyncClient(timeout=15) as client:
            proxy_resp = await client.get(proxy_url)
            if proxy_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch proxy map image")
            proxy_bytes = proxy_resp.content

        proxy_arr = np.frombuffer(proxy_bytes, np.uint8)
        proxy_bgr = cv2.imdecode(proxy_arr, cv2.IMREAD_COLOR)
        if proxy_bgr is None:
            raise HTTPException(status_code=502, detail="Could not decode proxy map image")

        # 3. Run pipeline
        merged_bgr, matrix, inliers, match_score = run_pipeline(proxy_bgr, ref_bgr)

        # 4. Compute geographic bounds from proxy metadata
        north, south, east, west = proxy_bounds(center_lat, center_lng, zoom, map_width, map_height)

        # 5. Build GeoTIFF
        geotiff_bytes = build_geotiff(merged_bgr, north, south, east, west)

        # 6. Encode stitched preview as base64 data URL
        _, stitched_enc = cv2.imencode('.jpg', merged_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        stitched_b64 = base64.b64encode(stitched_enc.tobytes()).decode()
        stitched_data_url = f"data:image/jpeg;base64,{stitched_b64}"

        # 7. Encode GeoTIFF as base64 data URL for download
        geotiff_b64 = base64.b64encode(geotiff_bytes).decode()
        geotiff_data_url = f"data:image/tiff;base64,{geotiff_b64}"

        # 8. Build pixel→lat/lng transform matrix (3×3 affine)
        mpp = meters_per_px(center_lat, zoom)
        delta_lat_per_px = mpp / 111_320
        delta_lng_per_px = mpp / (111_320 * math.cos(math.radians(center_lat)))
        pixel_to_latlng = [
            [west, delta_lng_per_px, 0],
            [north, 0, -delta_lat_per_px],
            [0, 0, 1],
        ]

        return {
            "stitchedUrl": stitched_data_url,
            "geotiffUrl": geotiff_data_url,
            "overlayBounds": {
                "north": north,
                "south": south,
                "east": east,
                "west": west,
            },
            "inlierCount": len(inliers),
            "matchScore": round(match_score, 4),
            "pixelToLatLng": pixel_to_latlng,
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")
