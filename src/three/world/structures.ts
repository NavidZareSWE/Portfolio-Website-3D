import { Vector3 } from "three";
import { PropKit, TINT } from "./PropKit";

/**
 * A lattice radio mast: four tapering legs, horizontal rings with X-braces,
 * an antenna rod and a small dish. Built at (x, z) in the kit's local space.
 * Returns the point where the beacon light sits.
 */
export function buildMast(
  kit: PropKit,
  x: number,
  z: number,
  height: number,
  baseWidth = 1.1,
): Vector3 {
  const topWidth = baseWidth * 0.28;
  const half = (w: number) => w / 2;
  const corner = (w: number, sx: number, sz: number, y: number) =>
    [x + sx * half(w), y, z + sz * half(w)] as const;
  const signs: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const widthAt = (y: number) =>
    baseWidth + (topWidth - baseWidth) * (y / height);

  // Feet, legs and the bracing rings.
  kit.box([baseWidth + 0.3, 0.12, baseWidth + 0.3], [x, 0, z], {
    tint: TINT.dark,
  });
  for (const [sx, sz] of signs) {
    kit.bar(
      corner(baseWidth, sx, sz, 0),
      corner(topWidth, sx, sz, height),
      0.06,
      { tint: TINT.light },
    );
  }
  const rings = Math.max(3, Math.round(height / 1.1));
  for (let i = 1; i <= rings; i++) {
    const y = (i / rings) * height;
    const w = widthAt(y);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = signs[k];
      const [bx, bz] = signs[(k + 1) % 4];
      kit.bar(corner(w, ax, az, y), corner(w, bx, bz, y), 0.035, {
        tint: TINT.base,
      });
      // One diagonal per face and level: the lattice look.
      const y0 = ((i - 1) / rings) * height;
      const w0 = widthAt(y0);
      kit.bar(corner(w0, ax, az, y0), corner(w, bx, bz, y), 0.025, {
        tint: TINT.dark,
      });
    }
  }
  // Antenna rod, a cross arm and a dish facing the camera (+Z).
  kit.cylinder(0.025, 0.04, 1.1, [x, height, z], { tint: TINT.light });
  kit.box([topWidth + 0.5, 0.04, 0.04], [x, height - 0.25, z], {
    tint: TINT.base,
  });
  kit.cylinder(0.22, 0.12, 0.06, [x, height - 0.7, z + 0.16], {
    rot: [Math.PI / 2 - 0.4, 0, 0],
    tint: TINT.accent,
    segments: 18,
    centered: true,
  });
  return new Vector3(x, height + 1.15, z);
}
