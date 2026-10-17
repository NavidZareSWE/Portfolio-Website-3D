"""
Builds the two-tone source textures for the glyph Anonymous mask from the
supplied reference image (scripts/mask/anonymous-mask-reference.png).

The game turns these into ASCII at runtime (one glyph per cell, density
from luminance), so they only need clean tones:

  white: light face, dark features (eyes, brows, moustache, goatee)
  dark:  the inverse inside the face, with a light rim so the outline reads

Outputs public/textures/anonymous-mask-white.png and -dark.png (RGBA,
transparent outside the face). Console output is ASCII-only.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name("anonymous-mask-reference.png")
OUT = ROOT / "public" / "textures"


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    rgba = np.asarray(image).astype(np.float32) / 255.0
    inside = rgba[..., 3] > 0.5
    # Luminance; the pink cheeks become a light grey like the rest of the face.
    lum = rgba[..., 0] * 0.299 + rgba[..., 1] * 0.587 + rgba[..., 2] * 0.114
    # Contrast curve: features to black, face to white, soft creases kept as greys.
    tone = np.clip((lum - 0.18) / (0.92 - 0.18), 0.0, 1.0) ** 1.4

    # A thin rim along the silhouette (from the alpha mask).
    mask_img = Image.fromarray((inside * 255).astype(np.uint8))
    eroded = np.asarray(mask_img.filter(ImageFilter.MinFilter(9))) > 127
    rim = inside & ~eroded

    alpha = (inside * 255).astype(np.uint8)
    variants = {
        "white": np.where(rim, 0.55, tone),
        "dark": np.where(rim, 1.0, (1.0 - tone) * 0.9),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, value in variants.items():
        grey = (np.clip(value, 0, 1) * 255).astype(np.uint8)
        out = np.dstack([grey, grey, grey, alpha])
        path = OUT / f"anonymous-mask-{name}.png"
        Image.fromarray(out, "RGBA").save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB, {out.shape[1]}x{out.shape[0]})")


if __name__ == "__main__":
    main()
