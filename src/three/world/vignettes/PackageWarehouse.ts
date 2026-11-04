import { THEME } from "@/theme/theme";
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { PLAYER } from "../../config";
import { SKILLS_EXTRAS } from "../layout";
import { PropKit, TINT } from "../PropKit";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/**
 * The crates in the front row, left to right: the npm package stamped on
 * the lid and the key of its one-line use in `ui:world.packages`.
 */
export const WAREHOUSE_PACKAGES = [
  { key: "react", name: "react" },
  { key: "next", name: "next" },
  { key: "three", name: "three" },
  { key: "typescript", name: "typescript" },
  { key: "redux", name: "@reduxjs/toolkit" },
  { key: "i18next", name: "i18next" },
  { key: "express", name: "express" },
  { key: "mongodb", name: "mongodb" },
] as const;

export type WarehousePackage = (typeof WAREHOUSE_PACKAGES)[number]["key"];

const FORKLIFT = { speed: 1.4, pause: 1.6 };

interface Crate {
  key: WarehousePackage;
  name: string;
  x: number;
  z: number;
  top: number;
}

/**
 * Skills district: a package warehouse ("node_modules"). A row of crates,
 * each stamped with a package this site or the résumé uses; jump on one and
 * its name and use pop up above it. Behind them, two low shelf units and a
 * forklift bot shuttling a crate up and down the aisle.
 */
export class PackageWarehouse extends Vignette {
  private readonly crates: Crate[] = [];
  private readonly popup: TextPlane;
  private readonly popupHolder = new Group();
  private shownCrate: Crate | null = null;
  private popupFade = 0;
  private readonly forklift = new Group();
  private readonly forkliftLight: Mesh<SphereGeometry, MeshBasicMaterial>;
  private forkliftX: number;
  private forkliftDir = 1;
  private forkliftPause = 0;
  private readonly local = new Vector3();

  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "package-warehouse");
    const layout = SKILLS_EXTRAS.warehouse;
    const prop = ctx.materials.prop;

    // Front row of jumpable crates, labelled on the front face.
    const { left, right, up, size } = layout.crates;
    const step = (right - left) / (WAREHOUSE_PACKAGES.length - 1);
    const crateKit = new PropKit();
    WAREHOUSE_PACKAGES.forEach((pkg, i) => {
      const x = left + i * step;
      const z = -up;
      const height = i % 2 === 0 ? 0.8 : 0.6;
      crateKit.box([size, height, size], [x, 0, z], { tint: TINT.light });
      // Planks and a stencil band.
      crateKit.box([size + 0.02, 0.06, size + 0.02], [x, height * 0.5, z], {
        tint: TINT.dark,
      });
      crateKit.box([size * 0.5, 0.02, size * 0.5], [x, height, z], {
        tint: TINT.accent,
      });
      this.boxCollider(x, z, size, size, height);
      this.shadow(this.group, x, z + 0.05, size * 1.4, size * 1.3);
      const label = new TextPlane({
        // As wide as the gap between crates allows; long names shrink to fit.
        width: 1.05,
        height: 0.32,
        color: THEME.cyan,
      });
      label.setText(pkg.name);
      label.mesh.position.set(x, height + 0.24, z + size / 2);
      this.group.add(label.mesh);
      this.crates.push({ key: pkg.key, name: pkg.name, x, z, top: height });
    });
    this.group.add(crateKit.build(prop, "warehouse-crates"));

    // Shelf units: uprights, two boards, small crates on them.
    const shelfKit = new PropKit();
    for (const shelf of layout.shelves) {
      const z = -shelf.up;
      const width = shelf.right - shelf.left;
      const cx = (shelf.left + shelf.right) / 2;
      for (let x = shelf.left; x <= shelf.right + 0.01; x += width / 3) {
        shelfKit.box([0.08, 1.5, 0.7], [x, 0, z], { tint: TINT.dark });
      }
      for (const y of [0.5, 1.1]) {
        shelfKit.box([width + 0.1, 0.06, 0.72], [cx, y, z], {
          tint: TINT.base,
        });
        for (let x = shelf.left + 0.35; x < shelf.right - 0.2; x += 0.62) {
          const s = 0.34 + ((x * 7.3 + y * 3.1) % 0.14);
          shelfKit.box([s, s * 0.8, s], [x, y + 0.06, z], {
            tint:
              Math.round(x * 3 + y * 5) % 3 === 0 ? TINT.accent : TINT.light,
          });
        }
      }
      this.boxCollider(cx, z, width + 0.1, 0.72, Infinity);
    }
    this.group.add(shelfKit.build(prop, "warehouse-shelves"));

    const sign = new TextPlane({
      width: 3.6,
      height: 0.62,
      color: THEME.green,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    sign.setText(`${ctx.labels.world.warehouse}\n./node_modules`);
    const back = layout.shelves[0];
    sign.mesh.position.set((back.left + back.right) / 2, 2.35, -back.up);
    this.group.add(sign.mesh);

    // The forklift bot: body, mast, forks with a crate, wheels and a beacon.
    const bot = new PropKit();
    bot.box([0.9, 0.42, 0.62], [0, 0.12, 0], { tint: TINT.accent });
    bot.box([0.5, 0.36, 0.5], [-0.1, 0.54, 0], { tint: TINT.base });
    bot.box([0.06, 1.25, 0.5], [0.5, 0.12, 0], { tint: TINT.dark });
    for (const z of [-0.16, 0.16])
      bot.box([0.55, 0.04, 0.08], [0.78, 0.22, z], { tint: TINT.dark });
    bot.box([0.46, 0.4, 0.46], [0.78, 0.26, 0], { tint: TINT.light });
    for (const x of [-0.3, 0.3]) {
      for (const z of [-0.33, 0.33]) {
        bot.cylinder(0.12, 0.12, 0.08, [x, 0.12, z], {
          rot: [Math.PI / 2, 0, 0],
          tint: TINT.dark,
          centered: true,
        });
      }
    }
    this.forklift.add(bot.build(prop, "warehouse-forklift"));
    this.forkliftLight = new Mesh(
      new SphereGeometry(0.07, 10, 8),
      new MeshBasicMaterial({ color: THEME.amber, toneMapped: false }),
    );
    this.forkliftLight.position.set(-0.1, 0.98, 0);
    this.forklift.add(this.forkliftLight);
    const aisle = layout.aisle;
    this.forkliftX = aisle.left;
    this.forklift.position.set(this.forkliftX, 0, -aisle.up);
    const forkliftWrap = new Group();
    forkliftWrap.add(this.forklift);
    this.group.add(forkliftWrap);
    // Pass-through: it fades out while the player walks through it.
    this.ghost(forkliftWrap, this.forklift, 0.7);

    this.popup = new TextPlane({
      width: 3.6,
      height: 0.82,
      color: THEME.cyan,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    this.popup.opacity = 0;
    this.popupHolder.add(this.popup.mesh);
    this.group.add(this.popupHolder);
  }

  /** The crate whose lid the player is standing on, if any. */
  private crateUnder(player: Vector3): Crate | null {
    const local = this.group.worldToLocal(this.local.copy(player));
    const half = SKILLS_EXTRAS.warehouse.crates.size / 2 + PLAYER.radius * 0.5;
    for (const crate of this.crates) {
      if (
        Math.abs(local.x - crate.x) < half &&
        Math.abs(local.z - crate.z) < half &&
        Math.abs(player.y - crate.top) < 0.06
      )
        return crate;
    }
    return null;
  }

  protected animate(time: number, dt: number, player: Vector3) {
    const motion = this.ctx.kit.motion;

    // Popup over the crate being stood on.
    const crate = this.crateUnder(player);
    if (crate && crate !== this.shownCrate) {
      this.shownCrate = crate;
      this.popup.setText(
        `${crate.name}\n${this.ctx.labels.world.packages[crate.key]}`,
      );
      this.popupHolder.position.set(crate.x, crate.top + 1.95, crate.z);
    }
    this.popupFade = Math.min(
      1,
      Math.max(0, this.popupFade + (crate ? dt * 5 : -dt * 2.5)),
    );
    this.popup.opacity = this.popupFade;
    if (this.popupFade === 0) this.shownCrate = null;

    // Forklift: up and down the aisle, pausing and turning at each end.
    const aisle = SKILLS_EXTRAS.warehouse.aisle;
    if (this.forkliftPause > 0) {
      this.forkliftPause -= dt;
    } else {
      this.forkliftX += this.forkliftDir * FORKLIFT.speed * motion * dt;
      if (this.forkliftX > aisle.right || this.forkliftX < aisle.left) {
        this.forkliftX = Math.min(
          aisle.right,
          Math.max(aisle.left, this.forkliftX),
        );
        this.forkliftDir *= -1;
        this.forkliftPause = FORKLIFT.pause;
      }
    }
    this.forklift.position.x = this.forkliftX;
    this.forklift.rotation.y = this.forkliftDir > 0 ? 0 : Math.PI;
    this.forkliftLight.visible = Math.sin(time * 6 * Math.max(motion, 0.3)) > 0;
  }
}
