#!/usr/bin/env python3
"""Draws the Eleveren icons with the standard library only.

The glyph follows the idea of the Privileged Identity Management icon: a badge with a
person on it and a key. It is drawn here from basic shapes (not Microsoft's artwork).

  src-tauri/icons/tray.png    44px menu bar template (black on transparent; macOS renders it
                              white in a dark menu bar, black in a light one)
  src-tauri/icons/source.png  1024px app icon: white macOS tile with the coloured glyph

Run `npx tauri icon src-tauri/icons/source.png` afterwards to derive the platform formats.
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")


def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


# ---- signed distance helpers (unit coordinates, negative = inside) ----
def sd_round_rect(x, y, cx, cy, hw, hh, r):
    qx, qy = abs(x - cx) - (hw - r), abs(y - cy) - (hh - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_circle(x, y, cx, cy, r):
    return math.hypot(x - cx, y - cy) - r


def sd_segment(x, y, ax, ay, bx, by, r):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (ax + t * dx), y - (ay + t * dy)) - r


# ---- the glyph ----
BADGE = (0.45, 0.44, 0.31, 0.33, 0.085)  # cx, cy, half w, half h, corner radius


def in_badge(x, y):
    return sd_round_rect(x, y, *BADGE) <= 0


def in_person(x, y):
    head = sd_circle(x, y, 0.45, 0.35, 0.082) <= 0
    bust = sd_circle(x, y, 0.45, 0.64, 0.165) <= 0 and y <= 0.69
    return head or bust


def key_distance(x, y):
    """Key lying diagonally at the lower right: ring, shaft and two teeth."""
    ring_c = (0.745, 0.765)
    ring = abs(sd_circle(x, y, *ring_c, 0.075)) - 0.034  # ring with a hole
    ux, uy = -0.7071, -0.7071  # shaft direction, towards the upper left
    sx, sy = ring_c[0] + ux * 0.075, ring_c[1] + uy * 0.075
    ex, ey = sx + ux * 0.2, sy + uy * 0.2
    shaft = sd_segment(x, y, sx, sy, ex, ey, 0.03)
    nx, ny = -uy, ux
    teeth = []
    for t in (0.55, 0.9):
        px, py = sx + ux * 0.2 * t, sy + uy * 0.2 * t
        teeth.append(sd_segment(x, y, px, py, px + nx * 0.06, py + ny * 0.06, 0.026))
    return min(ring, shaft, *teeth)


def sample_template(x, y):
    key = key_distance(x, y)
    if key <= 0:
        return 1
    if key <= 0.04:  # halo that separates the key from the badge
        return 0
    return 1 if in_badge(x, y) and not in_person(x, y) else 0


PURPLE_TOP, PURPLE_BOTTOM = (139, 108, 224), (96, 70, 190)
GOLD = (245, 183, 0)


def sample_color(x, y):
    """RGBA 0-255 of the glyph at a point in the glyph's own unit box (transparent outside)."""
    key = key_distance(x, y)
    if key <= 0:
        shade = 0.9 + 0.1 * (1 - y)
        return (int(GOLD[0] * shade), int(GOLD[1] * shade), int(GOLD[2] * 0.9), 255)
    if key <= 0.035:
        return None  # halo, lets the tile show through
    if in_badge(x, y):
        if in_person(x, y):
            return (255, 255, 255, 255)
        t = max(0.0, min(1.0, (y - 0.11) / 0.66))
        return tuple(int(PURPLE_TOP[i] + (PURPLE_BOTTOM[i] - PURPLE_TOP[i]) * t) for i in range(3)) + (255,)
    return None


def render_template(size, ss=4):
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    hits += sample_template((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)
            row += [0, 0, 0, int(255 * hits / (ss * ss))]
        rows.append(row)
    return rows


def render_icon(size, ss=2):
    """White macOS tile (824px squircle inside the 1024px canvas) with a soft shadow."""
    tile = 824 / 1024
    half = tile / 2
    gscale = 0.66  # glyph box inside the tile
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    x, y = (px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size
                    d = sd_round_rect(x, y, 0.5, 0.5, half, half, 0.2 * tile)
                    ds = sd_round_rect(x, y, 0.5, 0.5 + 0.012, half, half, 0.2 * tile)
                    shadow = max(0.0, 1 - max(ds, 0) / 0.03) * 0.22 if ds > 0 else 0.22
                    col, a = (0, 0, 0), shadow
                    if d <= 0:
                        t = (y - (0.5 - half)) / tile
                        base = int(255 - 22 * t * t)
                        col, a = (base, base, min(255, base + 2)), 1.0
                        if d > -0.0025:  # hairline edge
                            col = (214, 215, 220)
                        gx = (x - 0.5) / (tile * gscale) + 0.5
                        gy = (y - 0.5) / (tile * gscale) + 0.5
                        if 0 <= gx <= 1 and 0 <= gy <= 1:
                            g = sample_color(gx, gy)
                            if g:
                                col = g[:3]
                    acc[0] += col[0] * a
                    acc[1] += col[1] * a
                    acc[2] += col[2] * a
                    acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if a <= 0:
                row += [0, 0, 0, 0]
            else:
                row += [int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(255 * a)]
        rows.append(row)
    return rows


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    write_png(os.path.join(OUT, "tray.png"), 44, 44, render_template(44))
    write_png(os.path.join(OUT, "source.png"), 1024, 1024, render_icon(1024))
    print("icons written to", os.path.abspath(OUT))
