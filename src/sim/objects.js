import * as THREE from "three";

export function makeBlock(scene, state, colorHex, idOverride = null) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.42),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.05 })
  );
  scene.add(mesh);

  const id = idOverride ?? state.nextObjId++;
  state.nextObjId = Math.max(state.nextObjId, id + 1);

  const obj = { id, color: colorHex, mesh, state: "free" };
  state.objects.set(obj.id, obj);
  return obj;
}
