"""Genera los iconos PNG de la PWA a partir del isotipo de Tierras."""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SIZE = 1024
CREAM = (242, 236, 220, 255)
NAVY = (7, 26, 33, 255)
GLOBE = (13, 43, 52, 255)
CORAL = (255, 126, 93, 255)
MINT = (127, 218, 192, 255)


def bezier(p0, p1, p2, steps=180):
    points = []
    for index in range(steps + 1):
        t = index / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]
        points.append((x, y))
    return points


def draw_dashed(draw, points, fill, width, dash=26, gap=20):
    distance = 0.0
    drawing = True
    previous = points[0]
    for point in points[1:]:
        segment = math.dist(previous, point)
        if drawing:
            draw.line([previous, point], fill=fill, width=width)
        distance += segment
        if drawing and distance >= dash:
            drawing = False
            distance = 0
        elif not drawing and distance >= gap:
            drawing = True
            distance = 0
        previous = point


def make_icon(globe_radius: int = 300, maskable: bool = False) -> Image.Image:
    base = Image.new("RGBA", (SIZE, SIZE), NAVY)
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for radius in range(520, 0, -8):
        alpha = int(22 * (1 - radius / 520))
        glow_draw.ellipse(
            (SIZE * 0.58 - radius, SIZE * 0.28 - radius, SIZE * 0.58 + radius, SIZE * 0.28 + radius),
            fill=(255, 126, 93, alpha),
        )
    for radius in range(560, 0, -10):
        alpha = int(18 * (1 - radius / 560))
        glow_draw.ellipse(
            (SIZE * 0.28 - radius, SIZE * 0.78 - radius, SIZE * 0.28 + radius, SIZE * 0.78 + radius),
            fill=(127, 218, 192, alpha),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    base = Image.alpha_composite(base, glow)

    random.seed(7)
    stars = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    star_draw = ImageDraw.Draw(stars)
    for _ in range(110):
        x = random.randint(50, SIZE - 50)
        y = random.randint(40, SIZE - 40)
        if math.dist((x, y), (512, 520)) < globe_radius + 80:
            continue
        radius = random.choice([1, 1, 1, 2])
        alpha = random.randint(30, 100)
        star_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(231, 242, 233, alpha))
    base = Image.alpha_composite(base, stars)

    cx, cy = 512, 520
    draw = ImageDraw.Draw(base)

    # Halo del globo
    for width, alpha in [(60, 14), (30, 26), (14, 40)]:
        draw.ellipse(
            (cx - globe_radius - width, cy - globe_radius - width, cx + globe_radius + width, cy + globe_radius + width),
            outline=(127, 218, 192, alpha),
            width=width,
        )

    # Cuerpo del globo
    draw.ellipse(
        (cx - globe_radius, cy - globe_radius, cx + globe_radius, cy + globe_radius),
        fill=GLOBE,
        outline=CREAM,
        width=16,
    )

    # Meridianos y paralelos recortados al círculo
    detail = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    detail_draw = ImageDraw.Draw(detail)
    for rx in (110, 190, 255):
        detail_draw.ellipse(
            (cx - rx, cy - globe_radius, cx + rx, cy + globe_radius),
            outline=(242, 236, 220, 82),
            width=7,
        )
    for offset in (-170, -100, -35, 35, 100, 170):
        y = cy + offset
        half = math.sqrt(max(globe_radius**2 - (y - cy) ** 2, 0))
        detail_draw.line((cx - half, y, cx + half, y), fill=(242, 236, 220, 74), width=7)
    detail_draw.line((cx, cy - globe_radius, cx, cy + globe_radius), fill=(242, 236, 220, 80), width=7)
    detail_draw.line((cx - globe_radius, cy, cx + globe_radius, cy), fill=(242, 236, 220, 80), width=7)

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse(
        (cx - globe_radius + 8, cy - globe_radius + 8, cx + globe_radius - 8, cy + globe_radius - 8),
        fill=255,
    )
    base.paste(detail, (0, 0), Image.composite(detail.getchannel("A"), mask, mask))

    # Ruta y destinos
    route = bezier((cx - 200, cy + 200), (cx - 40, cy - 170), (cx + 175, cy - 190))
    draw_dashed(draw, route, CORAL, 9, dash=24, gap=18)
    draw.ellipse((cx - 214, cy + 178, cx - 186, cy + 206), fill=CREAM)
    draw.ellipse((cx + 132, cy - 220, cx + 218, cy - 134), outline=(255, 126, 93, 100), width=8)
    draw.ellipse((cx + 155, cy - 197, cx + 195, cy - 157), fill=CORAL)
    draw.ellipse((cx - 28, cy - 128, cx - 8, cy - 108), fill=MINT)

    # Pequeña cruz de orientación
    draw.line((cx + 6, cy - globe_radius - 52, cx + 6, cy - globe_radius - 30), fill=(242, 236, 220, 180), width=5)
    draw.line((cx - 5, cy - globe_radius - 41, cx + 17, cy - globe_radius - 41), fill=(242, 236, 220, 180), width=5)

    if maskable:
        # Aire extra alrededor del isotipo para la zona segura de Android.
        return base

    return base


def save(image: Image.Image, name: str, size: int) -> None:
    image.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name, optimize=True)


if __name__ == "__main__":
    PUBLIC.mkdir(exist_ok=True)
    icon = make_icon(globe_radius=300)
    maskable = make_icon(globe_radius=236, maskable=True)
    save(icon, "pwa-512x512.png", 512)
    save(icon, "pwa-192x192.png", 192)
    save(maskable, "pwa-maskable-512x512.png", 512)
    save(icon, "apple-touch-icon.png", 180)
    icon.resize((64, 64), Image.Resampling.LANCZOS).save(PUBLIC / "favicon.png", optimize=True)
    print("Iconos generados en public/")
