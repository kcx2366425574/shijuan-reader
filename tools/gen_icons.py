#!/usr/bin/env python3
"""生成“拾卷”应用图标与底部 Tab 图标。

设计：深墨绿底，米色翻开的书页，朱砂书签与落日，金色细线。
运行：python tools/gen_icons.py
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "unpackage" / "res" / "icons"
STATIC_ICONS = ROOT / "src" / "static" / "icons"
TABBAR_DIR = ROOT / "src" / "static" / "tabbar"
for folder in (ICON_DIR, STATIC_ICONS, TABBAR_DIR):
    folder.mkdir(parents=True, exist_ok=True)

INK_TOP = np.array([38, 57, 48], dtype=float)
INK_BOTTOM = np.array([13, 23, 19], dtype=float)
CREAM = (242, 228, 200, 255)
CREAM_SHADOW = (196, 178, 142, 255)
CREAM_DARK = (214, 196, 160, 255)
VERMILION = (183, 62, 50, 255)
VERMILION_DARK = (146, 43, 35, 255)
GOLD = (201, 164, 106, 255)


def bezier(points, segments=60):
    """points: [(x,y), ...] 作为三次贝塞尔控制点，支持多段。"""
    out = []
    for i in range(0, len(points) - 3, 3):
        p0, p1, p2, p3 = points[i:i + 4]
        for t in np.linspace(0, 1, segments, endpoint=(i + 3 >= len(points) - 1)):
            x = ((1 - t) ** 3) * p0[0] + 3 * ((1 - t) ** 2) * t * p1[0] + 3 * (1 - t) * t * t * p2[0] + t ** 3 * p3[0]
            y = ((1 - t) ** 3) * p0[1] + 3 * ((1 - t) ** 2) * t * p1[1] + 3 * (1 - t) * t * t * p2[1] + t ** 3 * p3[1]
            out.append((x, y))
    return out


def make_background(size):
    h = w = size
    ys = np.linspace(0, 1, h)
    grad = INK_TOP[None, :] * (1 - ys[:, None]) + INK_BOTTOM[None, :] * ys[:, None]
    img = np.repeat(grad[:, None, :], w, axis=1)
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w * 0.5, h * 0.52
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (w * 0.52)
    glow = np.clip(1 - dist, 0, 1) ** 2 * 0.11
    img = img * (1 - glow[..., None]) + np.array([190, 158, 100]) * glow[..., None]
    rng = np.random.default_rng(7)
    img = np.clip(img + rng.normal(0, 2.0, (h, w, 1)), 0, 255).astype(np.uint8)
    return Image.fromarray(img, "RGB").convert("RGBA")


def draw_open_book(img, scale):
    w, h = img.size
    s = w / 2048.0
    # 阴影
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([(470 * s, 1450 * s), (1578 * s, 1600 * s)], fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30 * s))
    img.alpha_composite(shadow)

    # 落日
    sun = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sun_draw = ImageDraw.Draw(sun)
    sun_draw.ellipse([(1240 * s, 500 * s), (1640 * s, 900 * s)], fill=(183, 62, 50, 220))
    sun = sun.filter(ImageFilter.GaussianBlur(1.2 * s))
    img.alpha_composite(sun)

    # 细金环
    ring = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([(374 * s, 430 * s), (1674 * s, 1730 * s)], outline=(201, 164, 106, 70), width=max(2, int(4 * s)))
    img.alpha_composite(ring)

    # 书页底层（纸张厚度）
    under = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ud = ImageDraw.Draw(under)
    left = bezier([
        (1024, 830), (850, 790), (610, 770), (470, 830),
        (440, 920), (430, 1280), (500, 1385),
        (720, 1435), (900, 1465), (1024, 1490),
    ])
    right = [(2048 - x, y) for x, y in left]
    ud.polygon([(x * s, (y + 18) * s) for x, y in left], fill=CREAM_SHADOW)
    ud.polygon([(x * s, (y + 18) * s) for x, y in right], fill=CREAM_SHADOW)
    img.alpha_composite(under)

    # 书页
    pages = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(pages)
    pd.polygon([(x * s, y * s) for x, y in left], fill=CREAM)
    pd.polygon([(x * s, y * s) for x, y in right], fill=CREAM)

    # 页面上的文字线
    for i in range(4):
        y0 = 1010 + i * 92
        line_left = bezier([
            (620, y0), (720, y0 - 18), (880, y0 - 22), (960, y0 - 4)
        ], 40)
        pd.line([(x * s, y * s) for x, y in line_left], fill=(190, 167, 122, 120), width=max(2, int(6 * s)), joint="curve")
        line_right = [(2048 - x, y) for x, y in line_left]
        pd.line([(x * s, y * s) for x, y in line_right], fill=(190, 167, 122, 120), width=max(2, int(6 * s)), joint="curve")

    # 书脊
    pd.line([(1024 * s, 840 * s), (1024 * s, 1480 * s)], fill=(162, 139, 98, 150), width=max(2, int(7 * s)))
    img.alpha_composite(pages)

    # 朱砂书签
    bookmark = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bookmark)
    bd.polygon([
        (986 * s, 820 * s), (1062 * s, 820 * s), (1062 * s, 1325 * s),
        (1024 * s, 1262 * s), (986 * s, 1325 * s)
    ], fill=VERMILION)
    bd.line([(1008 * s, 850 * s), (1008 * s, 1260 * s)], fill=(214, 112, 95, 150), width=max(2, int(5 * s)))
    bd.polygon([
        (986 * s, 1290 * s), (1024 * s, 1252 * s), (1024 * s, 1325 * s)
    ], fill=VERMILION_DARK)
    img.alpha_composite(bookmark)

    # 金色地平线
    horizon = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(horizon)
    hd.line([(560 * s, 1570 * s), (1488 * s, 1570 * s)], fill=(201, 164, 106, 95), width=max(2, int(4 * s)))
    img.alpha_composite(horizon)


def make_app_icon(size=2048):
    img = make_background(size)
    draw_open_book(img, size)
    return img


def rounded_icon(img, radius_ratio=0.22):
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def _line(draw, points, color, width, joint="curve"):
    draw.line(points, fill=color, width=width, joint=joint)


def draw_tab_icon(name, color):
    size = 324
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    lw = 18
    if name == "shelf":
        # 三本高低错落的书
        books = [(54, 84, 118, 240), (132, 60, 196, 240), (210, 108, 270, 240)]
        for x0, y0, x1, y1 in books:
            d.rounded_rectangle([x0, y0, x1, y1], radius=10, outline=color, width=lw)
            d.line([(x0 + 14, y0 + 34), (x1 - 14, y0 + 34)], fill=color, width=max(6, lw // 2))
    elif name == "discover":
        d.ellipse([54, 48, 216, 210], outline=color, width=lw)
        d.line([(196, 192), (264, 260)], fill=color, width=lw)
        d.arc([96, 92, 174, 168], start=200, end=340, fill=color, width=8)
    elif name == "sources":
        top = [(162, 48), (276, 112), (162, 176), (48, 112)]
        _line(d, top + [top[0]], color, lw)
        _line(d, [(48, 158), (162, 222), (276, 158)], color, lw)
        _line(d, [(48, 204), (162, 268), (276, 204)], color, lw)
        d.ellipse([146, 98, 178, 130], fill=color)
    elif name == "mine":
        d.ellipse([110, 44, 214, 148], outline=color, width=lw)
        d.arc([60, 160, 264, 330], start=200, end=340, fill=color, width=lw)
    else:
        raise ValueError(name)
    return img.resize((81, 81), Image.LANCZOS)


def main():
    master = make_app_icon(2048)
    # 应用图标标准尺寸
    for size in [1024, 512, 192, 180, 167, 152, 144, 120, 96, 87, 80, 76, 72, 60, 58, 40, 29, 20]:
        master.resize((size, size), Image.LANCZOS).save(ICON_DIR / f"{size}x{size}.png")
    master.resize((1024, 1024), Image.LANCZOS).save(STATIC_ICONS / "app-1024.png")
    rounded_icon(master.resize((1024, 1024), Image.LANCZOS)).resize((512, 512), Image.LANCZOS).save(ROOT / "src" / "static" / "logo.png")
    rounded_icon(master.resize((256, 256), Image.LANCZOS), 0.2).save(ROOT / "src" / "static" / "favicon.png")

    for name in ["shelf", "discover", "sources", "mine"]:
        draw_tab_icon(name, (142, 135, 120, 255)).save(TABBAR_DIR / f"{name}.png")
        draw_tab_icon(name, (47, 93, 80, 255)).save(TABBAR_DIR / f"{name}-active.png")

    print("icons generated:")
    for path in sorted(ICON_DIR.glob("*.png")):
        print(" ", path.relative_to(ROOT))
    print(" ", (ROOT / "src/static/logo.png").relative_to(ROOT))
    for path in sorted(TABBAR_DIR.glob("*.png")):
        print(" ", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
