"""Generates the chibi hooded hacker used by the 3D portfolio.

    python3 scripts/character/generate_character.py                # medium player model + rig
    python3 scripts/character/generate_character.py --lod <tier>   # very-low | low | medium | high | super
    python3 scripts/character/generate_character.py --glyph        # glyph-figure copy

Outputs
  public/models/hacker.glb                       medium player model, one node per part
  public/models/hacker-{very-low,low,high,super}.glb  the other detail tiers (--lod)
  public/models/hacker-glyph.glb                 low-detail copy for the glyph figures (--glyph)
  src/three/character/characterRig.generated.ts  pivots and logo anchors (medium run only)

Pipeline per part: evaluate the part's SDF on a voxel grid -> marching
cubes -> quadric decimation -> normals from the SDF gradient (keeps the
sculpted folds smooth) -> baked vertex colour = albedo x ambient occlusion
from the whole-figure field. Geometry is written relative to each part's
animation pivot. Emissive parts carry no AO; the app renders them in the
brand green. Console output is ASCII only.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import fast_simplification
import numpy as np
import trimesh
from skimage.measure import marching_cubes

sys.path.insert(0, str(Path(__file__).parent))

import model as M  # noqa: E402
from sdf import F, ambient_occlusion, gradient, smoothstep, vec  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_GLB = ROOT / "public" / "models" / "hacker.glb"
OUT_TS = ROOT / "src" / "three" / "character" / "characterRig.generated.ts"
# Triangle count and file size of every player tier, read by the app (detail menu, auto choice).
OUT_TIERS = ROOT / "src" / "three" / "character" / "modelTiers.generated.json"

MIRROR = vec(-1, 1, 1)


def srgb(hex_color: str) -> np.ndarray:
    c = np.array([int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)], dtype=F)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(F)


@dataclass
class Part:
    name: str
    field: Callable[[np.ndarray], np.ndarray]
    lo: tuple[float, float, float]
    hi: tuple[float, float, float]
    voxel: float
    target_tris: int
    pivot: np.ndarray
    albedo: Callable[[np.ndarray], np.ndarray]
    ao: bool = True


def flat(hex_color: str):
    c = srgb(hex_color)
    return lambda p: np.broadcast_to(c, p.shape).copy()


def mix(a, b, t):
    return a[None, :] * (1 - t[:, None]) + b[None, :] * t[:, None]


# Palette (sRGB), read from the character sheet: near-black fabric, white soles.
FABRIC = "#26272c"
RIB = "#1c1d21"
PANTS = "#202125"


def hood_albedo(p):
    col = np.broadcast_to(srgb(FABRIC), p.shape).copy()
    # Lining inside the shell falls away to black so the face reads as a void.
    return col * (1.0 - 0.92 * M.hood_interior_mask(p))[:, None]


def torso_albedo(p):
    band = smoothstep(0.455, 0.445, p[:, 1])
    return mix(srgb(FABRIC), srgb(RIB), band)


def forearm_albedo(side):
    def fn(p):
        q = p if side > 0 else p * MIRROR
        t = (q - M.WRIST) @ M._forearm_axis()
        return mix(srgb(FABRIC), srgb(RIB), smoothstep(-0.004, 0.0, t))

    return fn


def shoe_albedo(side):
    upper, cap, collar, lace = srgb("#222327"), srgb("#2d2f34"), srgb("#17181b"), srgb("#cfd3d8")

    def fn(p):
        q = (p if side > 0 else p * MIRROR) - vec(M.ANKLE[0], 0, 0)
        toe = smoothstep(M.SHOE_Z + 0.1, M.SHOE_Z + 0.13, q[:, 2])
        top = smoothstep(0.24, 0.26, q[:, 1])
        col = mix(upper, cap, toe)
        col = col * (1 - top[:, None]) + collar[None, :] * top[:, None]
        laces = M.lace_mask(q).astype(F)
        return col * (1 - laces[:, None]) + lace[None, :] * laces[:, None]

    return fn


def mirrored_box(side, lo, hi):
    """Bounds given for the right side (+X), mirrored for the left."""
    if side > 0:
        return lo, hi
    return (-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2])


def build_parts() -> list[Part]:
    parts = [
        Part("hood", M.hood, (-0.46, 0.7, -0.42), (0.46, 1.66, 0.5), 0.0045, 18000, M.NECK, hood_albedo),
        Part("torso", M.torso, (-0.37, 0.37, -0.27), (0.37, 0.92, 0.24), 0.004, 11000, M.HIP, torso_albedo),
        Part("backpack", M.backpack, (-0.24, 0.4, -0.4), (0.24, 0.86, -0.12), 0.003, 5000, M.HIP, flat("#1a1c21")),
        Part("straps", M.straps, (-0.2, 0.6, -0.25), (0.2, 0.9, 0.23), 0.0025, 3000, M.HIP, flat("#121317")),
        Part("packPiping", M.pack_piping, (-0.21, 0.43, -0.33), (0.21, 0.65, -0.2), 0.0015, 600, M.HIP, flat("#3dff7a"), ao=False),
    ]
    # +X is the character's own left (it faces +Z).
    for side, tag in ((1, "L"), (-1, "R")):
        sh, el, lg, kn, an = (v if side > 0 else v * MIRROR for v in (M.SHOULDER, M.ELBOW, M.LEG, M.KNEE, M.ANKLE))

        def f(fn, s=side):
            return lambda p: fn(p, s)

        def box(lo, hi, s=side):
            return mirrored_box(s, lo, hi)

        parts += [
            Part(f"upperArm{tag}", f(M.upper_arm), *box((0.12, 0.43, -0.14), (0.43, 0.88, 0.13)), 0.0035, 3500, sh, flat(FABRIC)),
            Part(f"forearm{tag}", f(M.forearm), *box((0.13, 0.37, -0.12), (0.42, 0.69, 0.24)), 0.0035, 3500, el, forearm_albedo(side)),
            Part(f"cuffBands{tag}", f(M.cuff_bands), *box((0.12, 0.38, -0.03), (0.37, 0.63, 0.21)), 0.0012, 900, el, flat("#3dff7a"), ao=False),
            Part(f"hand{tag}", f(M.hand), *box((0.13, 0.36, 0.04), (0.33, 0.52, 0.25)), 0.0025, 1600, el, flat("#141519")),
            Part(f"thigh{tag}", f(M.thigh), *box((-0.01, 0.15, -0.16), (0.33, 0.6, 0.17)), 0.0035, 3000, lg, flat(PANTS)),
            Part(f"shin{tag}", f(M.shin), *box((0.02, 0.15, -0.15), (0.33, 0.46, 0.17)), 0.0035, 3000, kn, flat(PANTS)),
            Part(f"shoe{tag}", f(M.shoe_upper), *box((0.0, 0.03, -0.23), (0.37, 0.31, 0.35)), 0.003, 5000, an, shoe_albedo(side)),
            Part(f"sole{tag}", f(M.sole), *box((0.02, -0.01, -0.21), (0.36, 0.08, 0.31)), 0.0028, 2400, an, flat("#eef1f4")),
            Part(f"shoeGlow{tag}", f(M.shoe_glow), *box((0.03, 0.05, -0.2), (0.35, 0.2, 0.3)), 0.0014, 1600, an, flat("#3dff7a"), ao=False),
        ]
    return parts


def evaluate_grid(part: Part, attempt: int = 0):
    margin = 0.04 * attempt
    lo = np.array(part.lo, dtype=F) - margin
    hi = np.array(part.hi, dtype=F) + margin
    voxel = voxel_size(part)
    shape = np.ceil((hi - lo) / voxel).astype(int) + 1
    axes = [np.linspace(lo[i], lo[i] + (shape[i] - 1) * voxel, shape[i], dtype=F) for i in range(3)]
    gx, gy, gz = np.meshgrid(*axes, indexing="ij")
    pts = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=-1)
    values = np.empty(pts.shape[0], dtype=F)
    chunk = 1_500_000
    for i in range(0, pts.shape[0], chunk):
        values[i : i + chunk] = part.field(pts[i : i + chunk])
    vol = values.reshape(shape)
    border = np.concatenate([vol[0].ravel(), vol[-1].ravel(), vol[:, 0].ravel(), vol[:, -1].ravel(), vol[:, :, 0].ravel(), vol[:, :, -1].ravel()])
    if border.min() <= 0:
        # The surface must be closed inside the grid; widen the bounds and retry.
        if attempt >= 3:
            raise RuntimeError(f"{part.name}: surface touches the grid boundary; enlarge its bounds")
        print(f"  {part.name}: widening bounds (attempt {attempt + 1})", flush=True)
        return evaluate_grid(part, attempt + 1)
    return vol, lo


# Load budget. Quadric decimation is applied per part at a scale chosen by
# visual comparison against the full-budget model: broad fabric surfaces
# decimate well (normals still come from the SDF gradient); the hood rim
# needs more; the shoes' rounded toes/soles and thin emissive details facet
# visibly, so they keep their authored budget.
PART_SCALE = {"hood": 0.75, "shoe": 1.0, "sole": 1.0}
DEFAULT_SCALE = 0.55
SMALL_PART_TRIS = 2000


# `--glyph` writes a low-detail copy for the glyph-rendered figures: their
# ASCII shading samples ~7 cm cells, so fine geometry would never be seen.
# The budget (~6.8k triangles) was halved for CPU-rendered devices after a
# side-by-side check showed no visible difference at gameplay distance.
GLYPH_MODE = "--glyph" in sys.argv
GLYPH_SCALE = 0.05
GLYPH_SMALL_SCALE = 0.15
# `--lod <tier>` writes one of five detail levels of the player model. The
# app picks one per device (GPU, connection) and the visitor can switch.
# All tiers share the parts, pivots and vertex colours, so one rig serves all.
#   scale   fraction of the medium budget for large parts (lower tiers)
#   keep    the same for the sneakers: decimating them hard tore the sole
#           in a close-up check, and they are what the eye lands on
#   authored  higher tiers: multiple of the authored (pre-scale) budget
#   small   multiple for small parts (< SMALL_PART_TRIS)
#   voxel   marching-cubes cell size factor (finer = more source detail)
LODS = {
    "very-low": {"scale": 0.14, "keep": 0.5, "authored": None, "small": 0.6, "voxel": 1.0, "file": "hacker-very-low.glb"},
    "low": {"scale": 0.3, "keep": 1.0, "authored": None, "small": 1.0, "voxel": 1.0, "file": "hacker-low.glb"},
    "medium": {"scale": 1.0, "keep": 1.0, "authored": None, "small": 1.0, "voxel": 1.0, "file": "hacker.glb"},
    "high": {"scale": 1.0, "keep": 1.0, "authored": 1.5, "small": 1.5, "voxel": 0.85, "file": "hacker-high.glb"},
    "super": {"scale": 1.0, "keep": 1.0, "authored": 3.5, "small": 2.5, "voxel": 0.65, "file": "hacker-super.glb"},
}
LOW_KEEP = {"shoe", "sole", "shoeGlow"}
LOD = sys.argv[sys.argv.index("--lod") + 1] if "--lod" in sys.argv else "medium"
if LOD not in LODS:
    sys.exit(f"--lod must be one of: {', '.join(LODS)}")

# Coarser sampling for the glyph copy: fewer marching-cubes triangles to
# start from, so decimation reaches its (much lower) targets reliably.
GLYPH_VOXEL_SCALE = 2.0


def voxel_size(part: "Part") -> float:
    return part.voxel * (GLYPH_VOXEL_SCALE if GLYPH_MODE else LODS[LOD]["voxel"])


def budget(name: str, target_tris: int) -> int:
    if GLYPH_MODE:
        return int(target_tris * (GLYPH_SMALL_SCALE if target_tris < SMALL_PART_TRIS else GLYPH_SCALE))
    lod = LODS[LOD]
    if target_tris < SMALL_PART_TRIS:
        return int(target_tris * lod["small"])
    if lod["authored"] is not None:
        return int(target_tris * lod["authored"])
    base = name.rstrip("LR") if name not in PART_SCALE else name
    factor = lod["keep"] if base in LOW_KEEP else lod["scale"]
    return int(target_tris * PART_SCALE.get(base, DEFAULT_SCALE) * factor)


def mesh_part(part: Part) -> trimesh.Trimesh:
    vol, lo = evaluate_grid(part)
    verts, faces, _, _ = marching_cubes(vol, level=0.0, spacing=(voxel_size(part),) * 3)
    verts = (verts + lo).astype(F)
    target = budget(part.name, part.target_tris)
    if faces.shape[0] > target:
        reduction = 1.0 - target / faces.shape[0]
        verts, faces = fast_simplification.simplify(
            verts, faces.astype(np.int64), target_reduction=reduction, agg=9 if GLYPH_MODE else 7
        )
        verts = verts.astype(F)

    normals = gradient(part.field, verts)
    tri = verts[faces]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    if np.mean(np.sum(fn * normals[faces].mean(axis=1), axis=-1)) < 0:
        faces = faces[:, ::-1]

    albedo = part.albedo(verts)
    if part.ao:
        ao = ambient_occlusion(M.scene_sdf, verts + normals * 0.0015, normals, step=0.02)
        albedo = albedo * (0.22 + 0.78 * ao)[:, None]
    colors = np.concatenate([np.clip(albedo, 0, 1), np.ones((verts.shape[0], 1), F)], axis=-1)

    mesh = trimesh.Trimesh(vertices=verts - part.pivot, faces=faces, vertex_normals=normals, process=False)
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=(colors * 255).round().astype(np.uint8))
    return mesh


def anchors():
    """Logo placements (world position + outward normal) found on the surfaces."""
    chest_z = M.torso_front_z(0.0, 0.69)
    pack_z = M.backpack_back_z(0.0, 0.53)
    arm_mid = M.SHOULDER + (M.ELBOW - M.SHOULDER) * 0.42
    sleeve = M.surface_point(lambda p: M.upper_arm(p, 1), arm_mid + vec(0.3, 0, 0), vec(-1, 0, 0))
    sleeve_n = gradient(lambda p: M.upper_arm(p, 1), sleeve[None, :])[0]
    return {
        "logoChest": (vec(0.0, 0.69, chest_z + 0.002), vec(0, 0, 1), 0.12),
        "logoBack": (vec(0.0, 0.53, pack_z - 0.002), vec(0, 0, -1), 0.13),
        "logoSleeveL": (sleeve + sleeve_n * 0.002, sleeve_n, 0.07),
        "logoSleeveR": (sleeve * MIRROR + sleeve_n * MIRROR * 0.002, sleeve_n * MIRROR, 0.07),
    }


def write_tier_manifest(tier: str, out: Path, triangles: int):
    manifest = json.loads(OUT_TIERS.read_text()) if OUT_TIERS.exists() else {}
    manifest[tier] = {"file": out.name, "triangles": triangles, "bytes": out.stat().st_size}
    ordered = {name: manifest[name] for name in LODS if name in manifest}
    OUT_TIERS.write_text(json.dumps(ordered, indent=2) + "\n")


def write_rig_ts():
    def v(a):
        return "[" + ", ".join(f"{float(x):.4f}" for x in a) + "]"

    pivots = {
        "hip": M.HIP,
        "neck": M.NECK,
        "shoulderL": M.SHOULDER,
        "shoulderR": M.SHOULDER * MIRROR,
        "elbowL": M.ELBOW,
        "elbowR": M.ELBOW * MIRROR,
        "wristL": M.WRIST,
        "wristR": M.WRIST * MIRROR,
        "legL": M.LEG,
        "legR": M.LEG * MIRROR,
        "kneeL": M.KNEE,
        "kneeR": M.KNEE * MIRROR,
        "ankleL": M.ANKLE,
        "ankleR": M.ANKLE * MIRROR,
        "headCenter": M.HEAD_CENTER,
        "headRadii": M.HEAD_RADII,
    }
    lines = [
        "// GENERATED by scripts/character/generate_character.py. Do not edit by hand.",
        "// World-space pivots and logo anchors (metres, Y up, model faces +Z)",
        "// for public/models/hacker.glb.",
        "",
        "type Vec3 = [number, number, number];",
        "",
        "export interface LogoAnchor {",
        "  position: Vec3;",
        "  normal: Vec3;",
        "  height: number;",
        "}",
        "",
        "export const CHARACTER_RIG = {",
    ]
    lines += [f"  {k}: {v(val)} as Vec3," for k, val in pivots.items()]
    lines += ["} as const;", "", "export const CHARACTER_LOGOS = {"]
    for name, (pos, normal, height) in anchors().items():
        lines.append(f"  {name}: {{ position: {v(pos)}, normal: {v(normal)}, height: {height} }},")
    lines += ["} satisfies Record<string, LogoAnchor>;", ""]
    OUT_TS.write_text("\n".join(lines))


def main():
    t0 = time.time()
    scene = trimesh.Scene()
    total = 0
    for part in build_parts():
        ts = time.time()
        mesh = mesh_part(part)
        transform = np.eye(4)
        transform[:3, 3] = part.pivot
        scene.add_geometry(mesh, node_name=part.name, geom_name=part.name, transform=transform)
        total += int(mesh.faces.shape[0])
        print(f"{part.name:14s} {mesh.faces.shape[0]:6d} tris  {time.time() - ts:5.1f}s", flush=True)

    out = OUT_GLB.with_name("hacker-glyph.glb" if GLYPH_MODE else LODS[LOD]["file"])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(scene.export(file_type="glb", include_normals=True))
    if not GLYPH_MODE and LOD == "medium":
        write_rig_ts()  # the glyph copy and the other tiers share the same pivots
    if not GLYPH_MODE:
        write_tier_manifest(LOD, out, total)
    print(json.dumps({"file": out.name, "total_tris": total, "glb_kb": out.stat().st_size // 1024, "seconds": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
