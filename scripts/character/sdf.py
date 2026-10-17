"""Vectorised signed-distance primitives and operators (NumPy, float32).

All functions take points `p` with shape (N, 3) and return distances (N,).
Negative = inside. Formulas follow the standard SDF literature
(Inigo Quilez, "Distance functions"); the tapered capsule and the
displacement helpers are approximations, which is fine for meshing.
"""

from __future__ import annotations

import numpy as np

F = np.float32


def vec(*xs) -> np.ndarray:
    return np.array(xs, dtype=F)


def length(v: np.ndarray) -> np.ndarray:
    return np.sqrt(np.sum(v * v, axis=-1))


def clamp(x, lo, hi):
    return np.minimum(np.maximum(x, lo), hi)


def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def gauss(x, mu, sigma):
    return np.exp(-(((x - mu) / sigma) ** 2))


# --------------------------------------------------------------------------- #
# Primitives
# --------------------------------------------------------------------------- #

def sphere(p, c, r):
    return length(p - c) - r


def ellipsoid(p, c, r):
    q = (p - c) / r
    k0 = length(q)
    k1 = length(q / r)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def capsule(p, a, b, r):
    pa = p - a
    ba = b - a
    h = clamp(np.sum(pa * ba, axis=-1) / np.dot(ba, ba), 0.0, 1.0)
    return length(pa - ba * h[:, None]) - r


def tapered_capsule(p, a, b, ra, rb):
    """Capsule whose radius varies linearly from `ra` at `a` to `rb` at `b`."""
    pa = p - a
    ba = b - a
    h = clamp(np.sum(pa * ba, axis=-1) / np.dot(ba, ba), 0.0, 1.0)
    return length(pa - ba * h[:, None]) - (ra + (rb - ra) * h)


def round_box(p, c, half, r):
    q = np.abs(p - c) - (half - r)
    outside = length(np.maximum(q, 0.0))
    inside = np.minimum(np.max(q, axis=-1), 0.0)
    return outside + inside - r


def ellipse_torus(p, c, rx, ry, tube):
    """Ring in the local XY plane (around Z) with elliptical centre-line."""
    q = p - c
    e = (np.sqrt((q[:, 0] / rx) ** 2 + (q[:, 1] / ry) ** 2) - 1.0) * min(rx, ry)
    return np.sqrt(e * e + q[:, 2] ** 2) - tube


def polyline_tube(p, points, r):
    d = np.full(p.shape[0], np.inf, dtype=F)
    for a, b in zip(points[:-1], points[1:]):
        d = np.minimum(d, capsule(p, a, b, r))
    return d


# --------------------------------------------------------------------------- #
# Operators
# --------------------------------------------------------------------------- #

def smin(a, b, k):
    h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def rotate_x(p, c, angle):
    """Rotate points around an X axis through `c`."""
    q = p - c
    ca, sa = np.cos(angle), np.sin(angle)
    y = q[:, 1] * ca - q[:, 2] * sa
    z = q[:, 1] * sa + q[:, 2] * ca
    return np.stack([q[:, 0], y, z], axis=-1) + c


def mirror_x(p, side):
    """Evaluate a right-hand (+X) part on the given side (+1 / -1)."""
    if side > 0:
        return p
    q = p.copy()
    q[:, 0] = -q[:, 0]
    return q


# --------------------------------------------------------------------------- #
# Field utilities
# --------------------------------------------------------------------------- #

def gradient(fn, p, eps=1.2e-3):
    ex = vec(eps, 0, 0)
    ey = vec(0, eps, 0)
    ez = vec(0, 0, eps)
    g = np.stack(
        [
            fn(p + ex) - fn(p - ex),
            fn(p + ey) - fn(p - ey),
            fn(p + ez) - fn(p - ez),
        ],
        axis=-1,
    )
    return g / np.maximum(length(g)[:, None], 1e-9)


def conform(fn, points, offset, iterations=10):
    """Project points onto the iso-surface fn = offset (used for straps/cords)."""
    p = np.asarray(points, dtype=F).copy()
    for _ in range(iterations):
        n = gradient(fn, p)
        p = p - n * (fn(p) - offset)[:, None]
    return p


def ambient_occlusion(fn, p, n, steps=6, step=0.014, strength=1.15):
    """Classic SDF ambient occlusion estimate sampled along the normal."""
    occ = np.zeros(p.shape[0], dtype=F)
    weight = 1.0
    for i in range(1, steps + 1):
        d = step * i
        occ += weight * np.maximum(d - fn(p + n * d), 0.0) / d
        weight *= 0.62
    return clamp(1.0 - strength * occ * 0.5, 0.0, 1.0)
