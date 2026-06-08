#!/usr/bin/env python3
"""Generate app icons from packages/app/build/icon-source.png.

The macOS icon uses a near-full-canvas rounded square so it aligns with
modern Dock icons. Pillow is required for raster composition.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "packages" / "app"
BUILD = APP / "build"
ICONS = BUILD / "icons"
RENDERER_ASSETS = APP / "src" / "renderer" / "assets"
SOURCE = BUILD / "icon-source.png"

CANVAS = 1024
SCALE = 4
CARD_INSET = 20
CARD_RADIUS = 210
LOGO_HEIGHT = 790
LOGO_TOP = 95

PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ICNS_FILES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def resize(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def compose_icon() -> Image.Image:
    size = CANVAS * SCALE
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    inset = CARD_INSET * SCALE
    radius = CARD_RADIUS * SCALE
    bounds = [inset, inset, size - inset, size - inset]

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(bounds, radius=radius, fill=(0, 0, 0, 58))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18 * SCALE)))

    card = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    card_draw = ImageDraw.Draw(card)
    card_draw.rounded_rectangle(
        bounds,
        radius=radius,
        fill=(255, 255, 255, 255),
        outline=(215, 221, 229, 115),
        width=2 * SCALE,
    )
    canvas.alpha_composite(card)

    logo = Image.open(SOURCE).convert("RGBA")
    logo_h = LOGO_HEIGHT * SCALE
    logo_w = round(logo_h * logo.width / logo.height)
    logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    x = (size - logo_w) // 2
    y = LOGO_TOP * SCALE
    canvas.alpha_composite(logo, (x, y))

    return resize(canvas, CANVAS)


def write_pngs(icon: Image.Image) -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    RENDERER_ASSETS.mkdir(parents=True, exist_ok=True)

    icon.save(BUILD / "icon.png")
    resize(icon, 512).save(RENDERER_ASSETS / "app-icon.png")
    for size in PNG_SIZES:
        resize(icon, size).save(ICONS / f"icon-{size}.png")


def write_ico(icon: Image.Image) -> None:
    icon.save(BUILD / "icon.ico", sizes=ICO_SIZES)


def write_icns(icon: Image.Image) -> None:
    with tempfile.TemporaryDirectory(prefix="e2r-iconset-") as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for name, size in ICNS_FILES.items():
            resize(icon, size).save(iconset / name)
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(BUILD / "icon.icns")], check=True)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source icon: {SOURCE}")
    if shutil.which("iconutil") is None:
        raise SystemExit("iconutil is required to generate icon.icns on macOS")

    icon = compose_icon()
    write_pngs(icon)
    write_ico(icon)
    write_icns(icon)


if __name__ == "__main__":
    main()
