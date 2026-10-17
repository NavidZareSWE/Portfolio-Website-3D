import type { Material, Object3D, Texture } from "three";

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Texture).isTexture === true
  );
}

function disposeMaterial(material: Material, textures: Set<Texture>) {
  // Collect textures referenced directly by the material or its uniforms.
  for (const value of Object.values(material)) {
    if (isTexture(value)) textures.add(value);
  }
  const uniforms = (
    material as { uniforms?: Record<string, { value: unknown }> }
  ).uniforms;
  if (uniforms) {
    for (const uniform of Object.values(uniforms)) {
      if (isTexture(uniform.value)) textures.add(uniform.value);
    }
  }
  material.dispose();
}

/**
 * Releases GPU resources owned by an object tree. Shared geometries and
 * materials are tracked in sets so each is disposed exactly once.
 */
export function disposeObject(root: Object3D) {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    const mesh = object as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
      dispose?: () => void;
    };
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => materials.add(m));
    } else if (mesh.material) {
      materials.add(mesh.material);
    }
    // InstancedMesh owns instance buffers that need explicit disposal.
    if ((object as { isInstancedMesh?: boolean }).isInstancedMesh) {
      mesh.dispose?.();
    }
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => disposeMaterial(m, textures));
  textures.forEach((t) => t.dispose());
}
