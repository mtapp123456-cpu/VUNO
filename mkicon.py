"""Erzeugt die App-Icons (Handy-Startbildschirm und Browser-Tab).

Nur das blaue V aus app/logo.png, ohne Schriftzug, auf dunkelblau-schwarzem
Hintergrund. Aufruf im Projektordner:  python3 mkicon.py
"""
import numpy as np
from PIL import Image

BG = (5, 11, 30)          # dunkelblau-schwarz (#050B1E)
V_BOX = (280, 110, 930, 600)   # Ausschnitt des V im Logo (ohne VUNO-Schriftzug)
V_SHARE = 0.66            # Breite des V im Icon, Anteil der Icon-Breite

logo = Image.open('app/logo.png').convert('RGB').crop(V_BOX)
arr = np.asarray(logo).astype(np.float32)

# Maske: alles, was nicht das schwarze Logo-Hintergrundschwarz ist (weiche Kante)
lum = arr.max(axis=2)
mask = np.clip((lum - 12) / 40, 0, 1)

# Zuschneiden auf das tatsaechliche V
ys, xs = np.where(mask > 0.5)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
arr, mask = arr[y0:y1, x0:x1], mask[y0:y1, x0:x1]
v_rgb = Image.fromarray(arr.astype(np.uint8))
v_a = Image.fromarray((mask * 255).astype(np.uint8))

for size in (180, 192, 512):
    w = round(size * V_SHARE)
    h = round(w * v_rgb.height / v_rgb.width)
    rgb = v_rgb.resize((w, h), Image.LANCZOS)
    a = v_a.resize((w, h), Image.LANCZOS)
    icon = Image.new('RGB', (size, size), BG)
    icon.paste(rgb, ((size - w) // 2, (size - h) // 2), a)
    icon.save(f'app/icon-{size}.png')
    print('app/icon-%d.png' % size)
