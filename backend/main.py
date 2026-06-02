from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import cv2
import math
import io
import base64
import httpx
import rasterio
from rasterio.transform import from_bounds
from rasterio.crs import CRS

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_mpp(lat, zoom):
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** zoom)

def get_bounds(lat, lng, zoom, w, h):
    mpp = get_mpp(lat, zoom)
    hw = (w / 2) * mpp
    hh = (h / 2) * mpp
    dlat = hh / 111_320
    dlng = hw / (111_320 * math.cos(math.radians(lat)))
    return lat + dlat, lat - dlat, lng + dlng, lng - dlng

def prep_img(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enh = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)
    return cv2.bilateralFilter(enh, 9, 75, 75)

def get_kps(img, r=4, c=4, mkp=15):
    h, w = img.shape[:2]
    dh, dw = h // r, w // c
    shi = cv2.SIFT_create(contrastThreshold=0.04)
    slo = cv2.SIFT_create(contrastThreshold=0.01)
    kps = []
    for i in range(r):
        for j in range(c):
            y1 = i * dh
            y2 = h if i == r - 1 else (i + 1) * dh
            x1 = j * dw
            x2 = w if j == c - 1 else (j + 1) * dw
            roi = img[y1:y2, x1:x2]
            k = shi.detect(roi, None)
            if len(k) < mkp:
                k = slo.detect(roi, None)
            for pt in k:
                pt.pt = (pt.pt[0] + x1, pt.pt[1] + y1)
                kps.append(pt)
    return kps

def get_matrix(proxy, ref):
    proxy_pp = prep_img(proxy)
    ref_pp = prep_img(ref)
    proxy_pp = cv2.GaussianBlur(proxy_pp, (15, 15), 0)
    
    sift = cv2.SIFT_create()
    kp_p = get_kps(proxy_pp)
    kp_p, des_p = sift.compute(proxy_pp, kp_p)
    kp_r = get_kps(ref_pp)
    kp_r, des_r = sift.compute(ref_pp, kp_r)
    
    if des_p is None or des_r is None:
        raise ValueError("sift failed")
        
    bf = cv2.BFMatcher(cv2.NORM_L2)
    matches = bf.knnMatch(des_r, des_p, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance]
    
    if len(good) < 4:
        raise ValueError("few matches")
        
    src = np.float32([kp_r[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_p[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    
    mat, mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=5.0)
    
    if mat is None:
        raise ValueError("affine failed")
        
    mat = np.vstack([mat, [0, 0, 1]])
    
    mask_list = mask.ravel().tolist()
    inliers = [good[i] for i in range(len(good)) if mask_list[i] == 1]
    score = len(inliers) / max(len(good), 1)
    
    return mat, inliers, score

def make_tiff(img, n, s, e, w_coord):
    h, w = img.shape[:2]
    trans = from_bounds(w_coord, s, e, n, w, h)
    c = CRS.from_epsg(4326)
    buf = io.BytesIO()
    with rasterio.open(buf, 'w', driver='GTiff', height=h, width=w, count=4, dtype=img.dtype, crs=c, transform=trans) as dst:
        dst.write(img[:, :, 2], 1)
        dst.write(img[:, :, 1], 2)
        dst.write(img[:, :, 0], 3)
        dst.write(img[:, :, 3], 4)
    return buf.getvalue()

@app.post("/process")
async def process(reference_image: UploadFile = File(...), proxy_url: str = Form(...), center_lat: float = Form(...), center_lng: float = Form(...), zoom: int = Form(...), map_width: int = Form(640), map_height: int = Form(640)):
    try:
        ref_b = await reference_image.read()
        ref_a = np.frombuffer(ref_b, np.uint8)
        ref_img = cv2.imdecode(ref_a, cv2.IMREAD_COLOR)
        if ref_img is None:
            raise HTTPException(status_code=400, detail="decode fail")
            
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(proxy_url)
            proxy_b = resp.content
            
        proxy_a = np.frombuffer(proxy_b, np.uint8)
        proxy_img = cv2.imdecode(proxy_a, cv2.IMREAD_COLOR)
        
        mat, inls, score = get_matrix(proxy_img, ref_img)
        n, s, e, w_coord = get_bounds(center_lat, center_lng, zoom, map_width, map_height)
        
        hr, wr = ref_img.shape[:2]
        corn = np.float32([[0, 0], [wr, 0], [wr, hr], [0, hr]]).reshape(-1, 1, 2)
        w_corn = cv2.perspectiveTransform(corn, mat)
        
        minx = int(np.floor(np.min(w_corn[:, 0, 0])))
        maxx = int(np.ceil(np.max(w_corn[:, 0, 0])))
        miny = int(np.floor(np.min(w_corn[:, 0, 1])))
        maxy = int(np.ceil(np.max(w_corn[:, 0, 1])))
        
        lat_px = (n - s) / map_height
        lng_px = (e - w_coord) / map_width
        
        rw = w_coord + (minx * lng_px)
        re = w_coord + (maxx * lng_px)
        rn = n - (miny * lat_px)
        rs = n - (maxy * lat_px)
        
        ow = max(wr, hr)
        oh = int(ow * ((maxy - miny) / (maxx - minx))) if (maxx - minx) > 0 else ow
        
        sx = ow / (maxx - minx)
        sy = oh / (maxy - miny)
        t_mat = np.array([[sx, 0, -minx * sx], [0, sy, -miny * sy], [0, 0, 1]])
        h_mat = t_mat @ mat
        
        w_ref = cv2.warpPerspective(ref_img, h_mat, (ow, oh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        
        b, g, r = cv2.split(w_ref)
        alp = np.where((b == 0) & (g == 0) & (r == 0), 0, 255).astype(np.uint8)
        rgba = cv2.merge((b, g, r, alp))
        
        tiff = make_tiff(rgba, rn, rs, re, rw)
        tiff_b64 = base64.b64encode(tiff).decode()
        
        ph = 800
        pw = int(ow * (ph / oh))
        p_img = cv2.resize(rgba, (pw, ph), interpolation=cv2.INTER_AREA)
        _, s_enc = cv2.imencode('.png', p_img)
        s_b64 = base64.b64encode(s_enc.tobytes()).decode()
        
        return {
            "stitchedUrl": f"data:image/png;base64,{s_b64}",
            "geotiffUrl": f"data:image/tiff;base64,{tiff_b64}",
            "overlayBounds": {"north": rn, "south": rs, "east": re, "west": rw},
            "inlierCount": len(inls),
            "matchScore": round(score, 4),
            "pixelToLatLng": []
        }
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
