#!/usr/bin/env python3
"""Draw the app icons into icons/ (a flashcard with a blank, on navy).

Run:  python3 tools/make_icons.py        (Python standard library only)

The icons are already committed; you only need this to change the design.
The artwork is kept inside the middle ~60% so it also survives the circular
"maskable" crop Android applies, and the background is full-bleed because iOS
rounds the corners itself.
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"

NAVY = (43, 58, 103)
CARD = (255, 255, 255)
LINE = (201, 205, 216)
BLANK = (242, 165, 65)

# (centre x, centre y, half width, half height, corner radius, colour), all in 0..1 units
SHAPES = [
    (0.50, 0.50, 0.29, 0.22, 0.05, CARD),
    (0.50, 0.45, 0.22, 0.018, 0.018, LINE),   # first line of text
    (0.35, 0.55, 0.07, 0.018, 0.018, LINE),   # text before the blank
    (0.535, 0.55, 0.085, 0.032, 0.014, BLANK),  # the blank
    (0.685, 0.55, 0.035, 0.018, 0.018, LINE),  # text after the blank
]


def inside(px, py, cx, cy, hw, hh, r):
    """True if the point is inside a rounded rectangle."""
    qx = abs(px - cx) - hw + r
    qy = abs(py - cy) - hh + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r < 0


def render(size, samples=3):
    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter byte
        for x in range(size):
            r = g = b = 0
            for sy in range(samples):
                for sx in range(samples):
                    px = (x + (sx + 0.5) / samples) / size
                    py = (y + (sy + 0.5) / samples) / size
                    colour = NAVY
                    for shape in SHAPES:
                        if inside(px, py, *shape[:5]):
                            colour = shape[5]
                    r += colour[0]; g += colour[1]; b += colour[2]
            n = samples * samples
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(render(size), 9)) + chunk(b"IEND", b""))
    path.write_bytes(png)
    print("wrote", path.relative_to(OUT.parent))


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    write_png(OUT / "apple-touch-icon.png", 180)
    write_png(OUT / "icon-192.png", 192)
    write_png(OUT / "icon-512.png", 512)
