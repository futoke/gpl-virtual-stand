import * as THREE from "three";
import { CELL } from "../scene/constants.js";

/*
Удалены большие зоны 2×2.
Оставлены только одиночные зоны выгрузки под платформами штабелеров.
*/

export function createIOZones(scene, gridW, gridH) {
  const ioGroup = new THREE.Group();
  scene.add(ioGroup);

  const matRight = new THREE.MeshStandardMaterial({ color: 0x2a6640, transparent:true, opacity:0.7 });
  const matLeft  = new THREE.MeshStandardMaterial({ color: 0x606a7c, transparent:true, opacity:0.7 });

  const size = CELL;
  const edgeGap = 0.05;

  // зоны ровно 1×1 клетка и вынесены за пределы основного поля
  const rightX = gridW / 2 + size / 2 + edgeGap;
  const rightZ = -gridH / 2 + size / 2;

  const leftX = -gridW / 2 - size / 2 - edgeGap;
  const leftZ = gridH / 2 - size / 2;

  function zone(x, z, mat, borderColor) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, 0.05, size), mat);
    m.position.set(x, 0.025, z);
    ioGroup.add(m);

    const borderPoints = [
      new THREE.Vector3(-size / 2, 0.04, -size / 2),
      new THREE.Vector3(size / 2, 0.04, -size / 2),
      new THREE.Vector3(size / 2, 0.04, size / 2),
      new THREE.Vector3(-size / 2, 0.04, size / 2),
      new THREE.Vector3(-size / 2, 0.04, -size / 2),
    ];
    const border = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(borderPoints),
      new THREE.LineBasicMaterial({ color: borderColor, transparent: true, opacity: 0.75 })
    );
    border.position.set(x, 0, z);
    ioGroup.add(border);

    return { mesh: m, border };
  }

  const right = zone(rightX, rightZ, matRight, 0xff5a5a);
  const left = zone(leftX, leftZ, matLeft, 0xff5a5a);

  return { right, left };
}
