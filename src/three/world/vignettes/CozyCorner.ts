import { Group, SphereGeometry } from "three";
import { DISTRICT_LAYOUT } from "../layout";
import { PropKit, TINT } from "../PropKit";
import { Vignette, type VignetteContext } from "../Vignette";

/** A potted plant: tapered pot, soil and a fan of leaves (green glyph accents). */
function buildPlant(kit: PropKit, leaves: PropKit) {
  kit.cylinder(0.24, 0.17, 0.42, [0, 0, 0], { tint: TINT.base, segments: 16 });
  kit.cylinder(0.26, 0.26, 0.05, [0, 0.42, 0], {
    tint: TINT.light,
    segments: 16,
  });
  kit.cylinder(0.21, 0.21, 0.03, [0, 0.43, 0], {
    tint: TINT.dark,
    segments: 16,
  });
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const lean = 0.45 + (i % 2) * 0.3;
    const length = 0.5 + (i % 3) * 0.12;
    // An elongated leaf standing on its base, then leaned outward.
    const leaf = new SphereGeometry(0.07, 10, 8);
    leaf.scale(1, length / 0.14, 0.45);
    leaf.translate(0, length / 2, 0);
    leaves.geometry(
      leaf,
      [Math.sin(angle) * 0.08, 0.45, Math.cos(angle) * 0.08],
      [Math.cos(angle) * lean, 0, -Math.sin(angle) * lean],
      TINT.accent,
    );
  }
  leaves.sphere(0.09, [0, 0.8, 0], { scale: [1, 2.4, 1], tint: TINT.accent });
}

/**
 * About district: the woven rug on the floor (world/districts.ts) with a
 * beanbag on it and potted plants around it, a lived-in corner next to the
 * About card. The leaves sway gently.
 */
export class CozyCorner extends Vignette {
  private readonly plants: { leaves: Group; phase: number }[] = [];

  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "vignette-about-cozy");
    const prop = ctx.materials.prop;

    DISTRICT_LAYOUT.plants.forEach((plant, i) => {
      const holder = new Group();
      holder.position.set(plant.right, 0, -plant.up);
      holder.scale.setScalar(plant.scale);
      const pot = new PropKit();
      const leafKit = new PropKit();
      buildPlant(pot, leafKit);
      holder.add(pot.build(prop, `about-plant-pot-${i}`));
      const leaves = new Group();
      leaves.position.y = 0.45;
      const leafMesh = leafKit.build(prop, `about-plant-leaves-${i}`);
      leafMesh.position.y = -0.45;
      leaves.add(leafMesh);
      holder.add(leaves);
      this.group.add(holder);
      this.circleCollider(plant.right, -plant.up, 0.3 * plant.scale);
      this.plants.push({ leaves, phase: i * 1.7 });
    });

    // A beanbag in the middle of the rug.
    const rug = DISTRICT_LAYOUT.rug;
    const x = (rug.left + rug.right) / 2 + 0.7;
    const z = -(rug.bottom + rug.top) / 2;
    const bag = new PropKit();
    bag.sphere(0.5, [0, 0.26, 0], { scale: [1.1, 0.55, 1], tint: TINT.light });
    bag.sphere(0.36, [0, 0.42, -0.22], {
      scale: [1.1, 0.8, 0.6],
      tint: TINT.base,
    });
    const bagMesh = bag.build(prop, "about-beanbag");
    bagMesh.position.set(x, 0, z);
    this.group.add(bagMesh);
    this.circleCollider(x, z, 0.5, 0.5);
    this.shadow(this.group, x, z, 1.3, 1.1);
  }

  protected animate(time: number) {
    const motion = this.ctx.kit.motion;
    for (const plant of this.plants) {
      const t = time * motion + plant.phase;
      plant.leaves.rotation.z = Math.sin(t * 0.9) * 0.05;
      plant.leaves.rotation.x = Math.sin(t * 0.7 + 1.3) * 0.04;
    }
  }
}
