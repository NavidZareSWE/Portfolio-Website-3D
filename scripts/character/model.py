"""The chibi hooded hacker, sculpted as signed-distance fields.

Reference: the "Playable 3D Hacker" character sheet (front/side/back/angle
views). Proportions measured from the front view, total height 1.6 m:
  hood          0.80-1.60  (half the figure), width ~0.51 H
  hoodie torso  0.40-0.84  boxy, front pouch, zip, ribbed hem
  joggers       0.20-0.42  short and baggy, cargo pockets
  sneakers      0.00-0.22  chunky high-tops, white soles, green midsole light

World space: metres, Y up, the figure faces +Z, feet rest on y = 0.
Right-side parts are defined for +X and mirrored for the left.
Every part is an independent field so it can be meshed on its own pivot
(neck, shoulders, elbows, hips, knees, ankles); `scene_sdf` combines them
for ambient-occlusion baking.
"""

from __future__ import annotations

import numpy as np

from sdf import (
    F,
    capsule,
    clamp,
    rotate_x,
    ellipse_torus,
    ellipsoid,
    gauss,
    length,
    mirror_x,
    round_box,
    smax,
    smin,
    smoothstep,
    sphere,
    tapered_capsule,
    vec,
)

# --------------------------------------------------------------------------- #
# Skeleton (pivots are exported to TypeScript)
# --------------------------------------------------------------------------- #

HIP = vec(0.0, 0.42, 0.0)
NECK = vec(0.0, 0.82, -0.01)
SHOULDER = vec(0.255, 0.745, -0.01)
ELBOW = vec(0.3, 0.575, -0.005)
WRIST = vec(0.115, 0.515, 0.085)  # rest pose: hands inside the pouch pocket
LEG = vec(0.13, 0.42, 0.0)
KNEE = vec(0.15, 0.31, 0.02)
ANKLE = vec(0.18, 0.21, 0.0)

HEAD_CENTER = vec(0.0, 1.1, 0.01)
HEAD_RADII = vec(0.29, 0.37, 0.27)  # the void fills the opening down to the collar

HOOD_CENTER = vec(0.0, 1.21, -0.02)


def _taper_opening(q, y_bottom, y_top):
    """Narrow the hood opening into a V at the chin and a soft arch at the top."""
    y = q[:, 1]
    bottom = 0.82 + 0.18 * smoothstep(y_bottom, y_bottom + 0.2, y)
    top = 1.0 - 0.3 * smoothstep(y_top - 0.2, y_top, y)
    out = q.copy()
    out[:, 0] = out[:, 0] / (bottom * top)
    return out


# --------------------------------------------------------------------------- #
# Hood (head pivot)
# --------------------------------------------------------------------------- #

def hood_outer(p):
    d = ellipsoid(p, HOOD_CENTER, vec(0.41, 0.39, 0.385))
    peak = ellipsoid(p, vec(0.0, 1.44, -0.08), vec(0.22, 0.16, 0.25))
    # Bell-shaped skirt: the hood flares out and rests on the shoulders.
    drape = ellipsoid(p, vec(0.0, 0.93, -0.02), vec(0.4, 0.13, 0.24))
    flare_l = ellipsoid(p, vec(0.29, 0.92, -0.01), vec(0.14, 0.12, 0.18))
    flare_r = ellipsoid(p, vec(-0.29, 0.92, -0.01), vec(0.14, 0.12, 0.18))
    d = smin(d, peak, 0.1)
    d = smin(d, drape, 0.1)
    d = smin(d, smin(flare_l, flare_r, 0.001), 0.08)
    return d


def _hood_cut(p):
    cavity = ellipsoid(p, vec(0.0, 1.15, 0.06), vec(0.335, 0.37, 0.32))
    # The opening runs down into the collar (no fabric under the face), and its
    # plane is tilted so the brim overhangs the face at the top.
    q = rotate_x(p, vec(0.0, 1.1, 0.3), 0.2)
    mouth = ellipsoid(_taper_opening(q, 0.8, 1.48), vec(0.0, 1.06, 0.42), vec(0.335, 0.42, 0.3))
    # The two front edges of the hood meet in a V at the collar (no fabric
    # closes under the face): a V-shaped slot through the front of the skirt.
    y, z = p[:, 1], p[:, 2]
    half_width = 0.05 + 0.27 * smoothstep(0.76, 1.02, y)
    v_slot = np.maximum.reduce([np.abs(p[:, 0]) - half_width, 0.02 - z, 0.72 - y, y - 1.05])
    return smin(smin(cavity, mouth, 0.03), v_slot, 0.03)


def hood(p):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    d = smax(hood_outer(p), -_hood_cut(p), 0.015)
    # Thick rolled rim: a tube along the curve where the cut meets the shell.
    rim = np.sqrt(hood_outer(p) ** 2 + _hood_cut(p) ** 2) - 0.021
    d = smin(d, rim, 0.025)
    # Soft creases where the hood collapses onto the shoulders.
    ang = np.arctan2(x, z + 0.02)
    d = d + 0.007 * gauss(y, 0.93, 0.07) * np.sin(ang * 7.0 + y * 4.0)
    # Centre seam over the top and down the back.
    d = d + 0.0028 * np.exp(-((x / 0.005) ** 2)) * (z < 0.18) * (y > 1.0)
    return d


def hood_interior_mask(p):
    """1 on the hood's lining (inside the outer shell): rendered near-black."""
    return clamp(-hood_outer(p) / 0.03, 0.0, 1.0)


def head(p):
    return ellipsoid(p, HEAD_CENTER, HEAD_RADII)


# --------------------------------------------------------------------------- #
# Hoodie torso (hip pivot)
# --------------------------------------------------------------------------- #

def torso(p):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    core = round_box(p, vec(0.0, 0.625, 0.0), vec(0.238, 0.215, 0.148), 0.12)
    shoulders = capsule(p, vec(-0.2, 0.75, -0.012), vec(0.2, 0.75, -0.012), 0.1)
    back = ellipsoid(p, vec(0.0, 0.68, -0.04), vec(0.24, 0.17, 0.14))
    d = smin(core, shoulders, 0.06)
    d = smin(d, back, 0.05)

    # Hem with a tighter ribbed band.
    d = smax(d, 0.405 - y, 0.012)
    band = smoothstep(0.455, 0.445, y)
    angle = np.arctan2(x, z)
    d = d + band * (0.006 + 0.0014 * np.sin(angle * 70.0))

    front = (z > 0.06).astype(F)
    # Kangaroo pouch: a raised panel with a stitched seam and slanted openings.
    # Slightly puffed: the hands rest inside it.
    pouch = round_box(p, vec(0.0, 0.53, 0.136), vec(0.168, 0.078, 0.036), 0.032)
    d = smin(d, pouch, 0.012)
    outline = np.abs(round_box(p, vec(0.0, 0.53, 0.132), vec(0.165, 0.075, 1.0), 0.03))
    d = d + 0.0022 * np.exp(-((outline / 0.0035) ** 2)) * front * (y < 0.62)
    ax = np.abs(x)
    slit = np.abs((ax - 0.13) * 0.85 + (y - 0.53) * 0.55)
    d = d + 0.004 * np.exp(-((slit / 0.004) ** 2)) * front * (ax > 0.1) * (ax < 0.17) * (np.abs(y - 0.53) < 0.07)

    # Zip down the centre front.
    zone = smoothstep(0.43, 0.45, y) * smoothstep(0.86, 0.82, y)
    d = d + 0.0032 * np.exp(-((x / 0.0045) ** 2)) * front * zone * (y > 0.61)

    # Fabric folds: waist bunching and diagonal pulls from the armpits.
    d = d + 0.005 * gauss(y, 0.47, 0.035) * np.sin(angle * 9.0 + y * 40.0)
    d = d + 0.004 * gauss(ax, 0.2, 0.05) * gauss(y, 0.66, 0.06) * np.sin(y * 55.0 - ax * 30.0)
    return d


def torso_front_z(x, y):
    """Front-most surface near (x, y), ignoring the zip groove at the centre line."""
    return max(_surface_scan(torso, x + dx, y, +1) for dx in (-0.045, 0.045))


# --------------------------------------------------------------------------- #
# Backpack (hip pivot)
# --------------------------------------------------------------------------- #

PACK_Z = -0.235


def backpack(p):
    main = round_box(p, vec(0.0, 0.6, PACK_Z), vec(0.165, 0.18, 0.08), 0.06)
    flap = round_box(p, vec(0.0, 0.765, PACK_Z - 0.008), vec(0.167, 0.042, 0.085), 0.035)
    pocket = round_box(p, vec(0.0, 0.545, PACK_Z - 0.08), vec(0.128, 0.1, 0.035), 0.03)
    side_l = round_box(p, vec(0.172, 0.56, PACK_Z), vec(0.03, 0.085, 0.055), 0.022)
    side_r = round_box(p, vec(-0.172, 0.56, PACK_Z), vec(0.03, 0.085, 0.055), 0.022)
    d = smin(main, flap, 0.012)
    d = smin(d, pocket, 0.01)
    d = smin(d, smin(side_l, side_r, 0.001), 0.01)
    # Grab handle on top.
    handle = ellipse_torus(p, vec(0.0, 0.81, PACK_Z), 0.045, 0.018, 0.009)
    d = np.minimum(d, smax(handle, 0.805 - p[:, 1], 0.004))
    # Flap seam.
    d = d + 0.0025 * gauss(p[:, 1], 0.723, 0.004) * (p[:, 2] < PACK_Z - 0.05)
    return d


def backpack_back_z(x, y):
    return _surface_scan(backpack, x, y, -1)


def straps(p):
    d = np.full(p.shape[0], np.inf, dtype=F)
    for s in (1, -1):
        pts = [
            vec(s * 0.1, 0.73, -0.2),
            vec(s * 0.13, 0.83, -0.08),
            vec(s * 0.14, 0.85, 0.04),
            vec(s * 0.14, 0.78, 0.15),
            vec(s * 0.14, 0.64, 0.17),
        ]
        for a, b in zip(pts[:-1], pts[1:]):
            d = np.minimum(d, capsule(p, a, b, 0.017))
        # Buckle near the chest.
        d = np.minimum(d, round_box(p, vec(s * 0.14, 0.66, 0.185), vec(0.024, 0.016, 0.008), 0.004))
    return d


def pack_piping(p):
    """Neon-green piping down the backpack's side seams (emissive)."""
    d = np.full(p.shape[0], np.inf, dtype=F)
    for s in (1, -1):
        d = np.minimum(d, capsule(p, vec(s * 0.203, 0.49, PACK_Z - 0.02), vec(s * 0.203, 0.63, PACK_Z - 0.02), 0.006))
        d = np.minimum(d, capsule(p, vec(s * 0.14, 0.465, PACK_Z - 0.083), vec(s * 0.14, 0.62, PACK_Z - 0.083), 0.0045))
    return d


# --------------------------------------------------------------------------- #
# Arms (shoulder and elbow pivots), right side
# --------------------------------------------------------------------------- #

def _forearm_axis():
    d = WRIST - ELBOW
    return d / np.linalg.norm(d)


def upper_arm(p, side=1):
    p = mirror_x(p, side)
    d = tapered_capsule(p, SHOULDER, ELBOW, 0.102, 0.09)
    d = smin(d, sphere(p, SHOULDER + vec(-0.01, 0.01, 0.0), 0.108), 0.03)
    # Loose fabric folds down the sleeve.
    axis = (ELBOW - SHOULDER) / np.linalg.norm(ELBOW - SHOULDER)
    rel = p - SHOULDER
    t = rel @ axis
    around = np.arctan2(rel[:, 2], rel[:, 0])
    d = d + 0.005 * gauss(t, 0.15, 0.05) * np.sin(around * 3.0 + t * 40.0)
    return d


def forearm(p, side=1):
    p = mirror_x(p, side)
    axis = _forearm_axis()
    d = tapered_capsule(p, ELBOW, WRIST, 0.09, 0.08)
    d = smin(d, sphere(p, ELBOW, 0.092), 0.02)
    t = (p - WRIST) @ axis
    d = smax(d, t, 0.008)
    # Ribbed cuff.
    cuff = tapered_capsule(p, WRIST - axis * 0.004, WRIST + axis * 0.04, 0.07, 0.066)
    cuff = smax(cuff, -(t + 0.004), 0.004)
    rel = p - WRIST
    around = np.arctan2(rel[:, 0] - rel[:, 2], rel[:, 1])
    cuff = cuff + 0.0013 * np.sin(around * 48.0)
    d = smin(d, cuff, 0.006)
    # Bunching above the cuff and at the elbow.
    te = (p - ELBOW) @ axis
    d = d + 0.006 * gauss(t, -0.04, 0.03) * np.sin(t * 120.0)
    d = d + 0.005 * gauss(te, 0.0, 0.04) * np.sin(te * 110.0 + around * 1.5)
    return d


def cuff_bands(p, side=1):
    """Neon-green bands around the sleeve near the cuff (emissive)."""
    p = mirror_x(p, side)
    axis = _forearm_axis()
    c1 = WRIST - axis * 0.035
    c2 = WRIST - axis * 0.052
    def band(c, r):
        rel = p - c
        t = rel @ axis
        radial = length(rel - axis[None, :] * t[:, None])
        return np.sqrt((radial - r) ** 2 + t ** 2) - 0.0048
    return np.minimum(band(c1, 0.0835), band(c2, 0.0855))


def hand(p, side=1):
    p = mirror_x(p, side)
    axis = _forearm_axis()
    # Mitten tucked into the cuff: hidden at rest, a small dark hand when swinging.
    h = WRIST + axis * 0.01
    palm = ellipsoid(p, h, vec(0.03, 0.036, 0.038))
    thumb = capsule(p, h + vec(-0.02, 0.012, 0.004), h + vec(-0.026, -0.004, 0.022), 0.013)
    d = smin(palm, thumb, 0.015)
    return smin(d, capsule(p, WRIST + axis * 0.02, h, 0.038), 0.02)


# --------------------------------------------------------------------------- #
# Legs (hip and knee pivots), right side
# --------------------------------------------------------------------------- #

def thigh(p, side=1):
    p = mirror_x(p, side)
    d = tapered_capsule(p, LEG + vec(0.0, 0.05, 0.0), KNEE, 0.138, 0.13)
    d = smin(d, sphere(p, KNEE, 0.13), 0.02)
    d = smax(d, p[:, 1] - 0.52, 0.01)  # the top is hidden under the hoodie
    # Cargo pocket on the outer thigh.
    pocket = round_box(p, vec(LEG[0] + 0.132, 0.345, 0.005), vec(0.018, 0.05, 0.06), 0.015)
    d = smin(d, pocket, 0.01)
    flap = gauss(p[:, 1], 0.385, 0.004) * (p[:, 0] > LEG[0] + 0.11)
    d = d + 0.002 * flap
    d = d + 0.005 * gauss(p[:, 1], 0.37, 0.04) * np.sin(p[:, 1] * 120.0 + p[:, 2] * 30.0)
    return d


def shin(p, side=1):
    p = mirror_x(p, side)
    d = tapered_capsule(p, KNEE, ANKLE + vec(0.0, 0.03, 0.0), 0.13, 0.118)
    d = smin(d, sphere(p, KNEE, 0.13), 0.02)
    y = p[:, 1]
    d = smax(d, (ANKLE[1] - 0.005) - y, 0.01)
    # Baggy hem bunching over the sneaker.
    rel = p - ANKLE
    around = np.arctan2(rel[:, 0], rel[:, 2])
    d = d + 0.007 * gauss(y, 0.245, 0.03) * np.sin(around * 5.0 + y * 60.0)
    d = d + 0.0045 * gauss(y, KNEE[1], 0.04) * np.sin(y * 130.0 + around)
    return d


# --------------------------------------------------------------------------- #
# Sneakers (ankle pivot), right side
# --------------------------------------------------------------------------- #

SHOE_Z = 0.05


def _shoe_frame(p, side):
    q = mirror_x(p, side).copy()
    q[:, 0] -= ANKLE[0]
    return q


def lace_mask(q):
    """Raised lace bars across the instep (shoe frame coordinates)."""
    zone = gauss(q[:, 0], 0.0, 0.04) * smoothstep(0.0, 0.02, q[:, 2] - SHOE_Z) * smoothstep(0.17, 0.13, q[:, 2] - SHOE_Z)
    return zone * (np.sin(q[:, 2] * 110.0) > 0.25) * (q[:, 1] > 0.17)


def shoe_upper(p, side=1):
    q = _shoe_frame(p, side)
    # Straight sides down to the sole, so the cupsole meets the upper flush.
    body = round_box(q, vec(0.0, 0.15, SHOE_Z), vec(0.132, 0.1, 0.19), 0.06)
    toe = ellipsoid(q, vec(0.0, 0.112, SHOE_Z + 0.15), vec(0.133, 0.08, 0.1))
    heel = ellipsoid(q, vec(0.0, 0.16, SHOE_Z - 0.13), vec(0.128, 0.1, 0.09))
    collar_q = np.stack([q[:, 0], q[:, 2], q[:, 1]], axis=-1)
    collar = ellipse_torus(collar_q, vec(0.0, -0.01, 0.245), 0.105, 0.115, 0.03)
    tongue = round_box(q, vec(0.0, 0.232, SHOE_Z + 0.07), vec(0.062, 0.032, 0.072), 0.026)
    d = smin(body, toe, 0.05)
    d = smin(d, heel, 0.04)
    d = smin(d, collar, 0.03)
    d = smin(d, tongue, 0.02)
    # Lace ridges across the instep, toe-cap seam, side panel seam.
    d = d - 0.0045 * lace_mask(q)
    d = d + 0.0022 * gauss(length(np.stack([q[:, 0] * 0.8, q[:, 2] - SHOE_Z - 0.12], -1)), 0.1, 0.005)
    d = d + 0.002 * gauss(q[:, 1] - 0.4 * (q[:, 2] - SHOE_Z), 0.13, 0.004)
    return smax(d, 0.055 - q[:, 1], 0.008)


def _footprint(q):
    """2D outline of the upper (distance in the XZ plane), used by sole and glow."""
    slice_q = q.copy()
    slice_q[:, 1] = 0.11
    body = round_box(slice_q, vec(0.0, 0.11, SHOE_Z), vec(0.132, 0.5, 0.19), 0.08)
    toe = ellipsoid(slice_q * vec(1, 0, 1), vec(0.0, 0.0, SHOE_Z + 0.15), vec(0.133, 1.0, 0.1))
    heel = ellipsoid(slice_q * vec(1, 0, 1), vec(0.0, 0.0, SHOE_Z - 0.13), vec(0.128, 1.0, 0.09))
    return smin(smin(body, toe, 0.05), heel, 0.04)


def sole(p, side=1):
    """White cupsole that follows the shoe's own outline (no platform)."""
    q = _shoe_frame(p, side)
    lift = 0.25 * np.maximum(q[:, 2] - SHOE_Z - 0.12, 0.0) ** 2
    q2 = q.copy()
    q2[:, 1] -= lift
    outline = _footprint(q2) - 0.004
    slab = np.abs(q2[:, 1] - 0.036) - 0.036
    d = smax(outline, slab, 0.022)
    # Midsole groove and tread underneath.
    d = d + 0.0022 * gauss(q2[:, 1], 0.03, 0.004)
    d = d + 0.002 * (q2[:, 1] < 0.008) * (np.sin(q2[:, 2] * 110.0) > 0.0)
    return d


def shoe_glow(p, side=1):
    """Glowing green line along the top edge of the sole, plus a heel tab (emissive)."""
    q = _shoe_frame(p, side)
    edge = np.sqrt((_footprint(q) - 0.003) ** 2 + (q[:, 1] - 0.071) ** 2) - 0.0045
    tab = round_box(q, vec(0.0, 0.18, SHOE_Z - 0.222), vec(0.022, 0.035, 0.006), 0.004)
    side_dash = round_box(q, vec(0.134, 0.12, SHOE_Z - 0.02), vec(0.004, 0.009, 0.05), 0.004)
    return np.minimum(np.minimum(edge, tab), side_dash)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _surface_scan(fn, x, y, direction, steps=700):
    """First surface crossing along Z: direction +1 scans from front, -1 from back."""
    zs = np.linspace(0.6, -0.6, steps, dtype=F) * direction
    pts = np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], axis=-1)
    d = fn(pts)
    idx = int(np.argmax(d < 0))
    return float(zs[idx])


def surface_point(fn, origin, direction, distance=0.6, steps=900):
    """First surface crossing marching from `origin` along `direction`."""
    direction = np.asarray(direction, dtype=F)
    direction = direction / np.linalg.norm(direction)
    ts = np.linspace(0.0, distance, steps, dtype=F)
    pts = np.asarray(origin, dtype=F)[None, :] + ts[:, None] * direction[None, :]
    idx = int(np.argmax(fn(pts) < 0))
    return pts[max(idx - 1, 0)]


def scene_sdf(p):
    d = np.minimum(hood(p), torso(p))
    d = np.minimum(d, backpack(p))
    d = np.minimum(d, straps(p))
    d = np.minimum(d, head(p))
    for s in (1, -1):
        d = np.minimum(d, upper_arm(p, s))
        d = np.minimum(d, forearm(p, s))
        d = np.minimum(d, hand(p, s))
        d = np.minimum(d, thigh(p, s))
        d = np.minimum(d, shin(p, s))
        d = np.minimum(d, shoe_upper(p, s))
        d = np.minimum(d, sole(p, s))
    return np.minimum(d, p[:, 1] + 0.002)
