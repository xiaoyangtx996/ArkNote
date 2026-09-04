"""Produce ArkNote icons at each overview size by scaling a clean master.

The ChatGPT sheet only shows relative sizes; small blobs are soft.
We take the largest sharp cutout as master and resize to every target size
so each file is a true NxN image with the logo filling the canvas.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "branding" / "exported-layers"
SHEET = Path(r"E:\下载\ChatGPT Image 2026年9月4日 14_27_34.png")

# Sizes present on the overview sheet (large → small), forced square.
TARGET_SIZES = [704, 371, 263, 238, 187, 128, 123, 107, 81, 67, 46]


def soft_remove_black(arr: np.ndarray) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    luma = rgb.max(axis=2)
    neutral = (rgb.max(axis=2) - rgb.min(axis=2)) < 20
    alpha = arr[:, :, 3].copy()
    hard = 18
    soft = 45
    alpha[luma <= hard] = 0
    soft_neutral = (luma > hard) & (luma <= soft) & neutral
    alpha[soft_neutral] = np.clip(
        ((luma[soft_neutral] - hard) * (255 / max(1, soft - hard))).astype(np.int16),
        0,
        255,
    ).astype(np.uint8)
    out = arr.copy()
    out[:, :, 3] = alpha
    return out


def largest_logo_master(sheet_path: Path) -> Image.Image:
    """Cut the largest logo from the sheet as the high-res master."""
    from collections import deque

    arr = soft_remove_black(np.array(Image.open(sheet_path).convert("RGBA")))
    fg = arr[:, :, 3] > 40
    h, w = fg.shape
    visited = np.zeros((h, w), dtype=bool)
    best = None
    best_area = 0
    ys, xs = np.where(fg)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if visited[y0, x0]:
            continue
        q = deque([(y0, x0)])
        visited[y0, x0] = True
        pixels = []
        minx = maxx = x0
        miny = maxy = y0
        while q:
            y, x = q.popleft()
            pixels.append((y, x))
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and fg[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
        area = len(pixels)
        if area > best_area:
            best_area = area
            best = (minx, miny, maxx, maxy, pixels)

    if best is None:
        raise SystemExit("No logo found on sheet")

    minx, miny, maxx, maxy, pixels = best
    cx = (minx + maxx) / 2.0
    cy = (miny + maxy) / 2.0
    side = max(maxx - minx + 1, maxy - miny + 1) + 2
    x0 = int(round(cx - side / 2.0))
    y0 = int(round(cy - side / 2.0))
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(w - 1, x0 + side - 1), min(h - 1, y0 + side - 1)
    dx0, dy0 = sx0 - x0, sy0 - y0
    canvas[dy0 : dy0 + (sy1 - sy0 + 1), dx0 : dx0 + (sx1 - sx0 + 1)] = arr[
        sy0 : sy1 + 1, sx0 : sx1 + 1
    ]
    mask = np.zeros((side, side), dtype=bool)
    for y, x in pixels:
        mx, my = x - x0, y - y0
        if 0 <= my < side and 0 <= mx < side:
            mask[my, mx] = True
    # dilate
    m = mask
    for _ in range(2):
        n = m.copy()
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    canvas[~m, 3] = 0

    # Tight square crop around content, then letterbox into filled square
    a = canvas[:, :, 3] > 20
    ys2, xs2 = np.where(a)
    crop = canvas[ys2.min() : ys2.max() + 1, xs2.min() : xs2.max() + 1]
    ch, cw = crop.shape[:2]
    side2 = max(cw, ch)
    sq = np.zeros((side2, side2, 4), dtype=np.uint8)
    ox, oy = (side2 - cw) // 2, (side2 - ch) // 2
    sq[oy : oy + ch, ox : ox + cw] = crop
    return Image.fromarray(sq, "RGBA")


def resize_cover(master: Image.Image, size: int) -> Image.Image:
    """Scale master so the logo fills the entire size×size canvas."""
    # Trim residual transparent padding first
    a = np.array(master)
    ys, xs = np.where(a[:, :, 3] > 20)
    trimmed = Image.fromarray(a[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1], "RGBA")
    # Fit into square then scale to target (cover = fill)
    tw, th = trimmed.size
    side = max(tw, th)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(trimmed, ((side - tw) // 2, (side - th) // 2), trimmed)
    return sq.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    if not SHEET.exists():
        raise SystemExit(f"Missing sheet: {SHEET}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for p in OUT_DIR.glob("*.png"):
        p.unlink()

    master = largest_logo_master(SHEET)
    master_path = OUT_DIR / f"_master-{master.size[0]}x{master.size[1]}.png"
    master.save(master_path)
    print(f"master {master.size[0]}x{master.size[1]} -> {master_path.name}")

    for size in TARGET_SIZES:
        out = resize_cover(master, size)
        name = f"arknote-{size}x{size}.png"
        out.save(OUT_DIR / name, optimize=True)
        arr = np.array(out)
        fill = (arr[:, :, 3] > 20).mean()
        print(f"{name}: {out.size[0]}x{out.size[1]} fill={fill:.1%} bytes={(OUT_DIR / name).stat().st_size}")

    # True-scale preview
    gap = 12
    label_h = 28
    files = [OUT_DIR / f"arknote-{s}x{s}.png" for s in sorted(TARGET_SIZES)]
    imgs = [Image.open(f).convert("RGBA") for f in files]
    total_w = sum(i.size[0] for i in imgs) + gap * (len(imgs) + 1)
    max_h = max(i.size[1] for i in imgs)
    preview = Image.new("RGBA", (total_w, max_h + label_h + gap * 2), (28, 28, 28, 255))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(preview)
    x = gap
    for im, size in zip(imgs, sorted(TARGET_SIZES)):
        y = gap + (max_h - im.size[1])
        preview.alpha_composite(im, (x, y))
        draw.text((x, gap + max_h + 6), str(size), fill=(240, 240, 240, 255))
        x += im.size[0] + gap
    preview.save(OUT_DIR / "_preview-true-scale.png")
    print(f"DONE -> {OUT_DIR}")


if __name__ == "__main__":
    main()
