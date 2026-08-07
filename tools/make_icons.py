#!/usr/bin/env python3
"""アイコン(PNG)を純正Pythonで生成する簡易スクリプト。

外部ライブラリ(PIL等)に依存せず、zlib+structでPNGを直接書き出す。
角丸の医療系ブルーの背景に、白い「+」(プラス/カルテ)マークを描く。
"""
import struct
import zlib
import os

# 医療系のティール/ブルー
BG = (13, 148, 136)      # teal-600
FG = (255, 255, 255)     # white


def rounded_rect_mask(size, radius):
    """角丸矩形の内側なら True を返すマスクを作る。"""
    mask = [[False] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            inside = True
            # 四隅の角丸判定
            for cx, cy in ((radius, radius),
                           (size - 1 - radius, radius),
                           (radius, size - 1 - radius),
                           (size - 1 - radius, size - 1 - radius)):
                if ((x < radius or x > size - 1 - radius) and
                        (y < radius or y > size - 1 - radius)):
                    if (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
                        inside = False
            mask[y][x] = inside
    return mask


def make_png(size, path):
    radius = max(2, size // 6)
    mask = rounded_rect_mask(size, radius)

    # プラス記号の帯の太さと位置
    bar = max(2, size // 6)
    lo = (size - bar) // 2
    hi = lo + bar
    margin = size // 4

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            if not mask[y][x]:
                raw += bytes((0, 0, 0, 0))  # 透明
                continue
            in_vertical = lo <= x < hi and margin <= y < size - margin
            in_horizontal = lo <= y < hi and margin <= x < size - margin
            if in_vertical or in_horizontal:
                raw += bytes((*FG, 255))
            else:
                raw += bytes((*BG, 255))

    def chunk(typ, data):
        c = typ + data
        return (struct.pack(">I", len(data)) + c +
                struct.pack(">I", zlib.crc32(c) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, len(png), "bytes")


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, "icons")
    os.makedirs(out, exist_ok=True)
    for s in (16, 32, 48, 128):
        make_png(s, os.path.join(out, f"icon{s}.png"))
