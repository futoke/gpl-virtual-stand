import * as THREE from "three";
import { GRID_ROWS, WAREHOUSE_LEVELS, CELL, RACK_CELL, RACK_DEPTH } from "../scene/constants.js";

/**
 * Склад визуализируется как стеллаж:
 * - каркас (стойки + балки)
 * - полки по уровням
 * - "ячейки" (визуальные слоты), куда кладутся цветные объекты
 *
 * Примечание: объекты (параллелепипеды) создаются в main.js и кладутся в slot.occupiedBy
 */
export function createWarehouses(scene, gridW, gridH) {
  const rackGroup = new THREE.Group();
  scene.add(rackGroup);

  const rackFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a425a, roughness: 0.85, metalness: 0.06 });
  const rackBeamMat  = new THREE.MeshStandardMaterial({ color: 0x2a3248, roughness: 0.9,  metalness: 0.04 });

  // Слоты делаем полупрозрачными, чтобы было видно "ячейки"
  const rackSlotMat = new THREE.MeshStandardMaterial({
    color: 0x1a2236,
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55
  });

  const rackWidth = 1.2;
  const rackOffsetFromGrid = 1.4 + CELL;

  // Позиции по бокам поля (по X): дополнительно отодвинуты на одну клетку от рабочей сетки
  const leftRackX = -gridW / 2 - rackOffsetFromGrid;
  const rightRackX = gridW / 2 + rackOffsetFromGrid;

  function makeRack(sideX) {
    const g = new THREE.Group();

    // Геометрия стеллажа
    const rackHeight = WAREHOUSE_LEVELS * 0.6 + 0.9;
    const rackLength = gridH;

    // Вертикальные стойки (4 угла)
    const postGeo = new THREE.BoxGeometry(0.10, rackHeight, 0.10);
    const yCenter = rackHeight / 2 - 0.02;
    const zFront = -rackLength/2 + 0.05;
    const zBack  =  rackLength/2 - 0.05;
    const xInner = sideX + (sideX < 0 ? +rackWidth/2 - 0.10 : -rackWidth/2 + 0.10);
    const xOuter = sideX + (sideX < 0 ? -rackWidth/2 + 0.10 : +rackWidth/2 - 0.10);

    const posts = [
      new THREE.Mesh(postGeo, rackFrameMat),
      new THREE.Mesh(postGeo, rackFrameMat),
      new THREE.Mesh(postGeo, rackFrameMat),
      new THREE.Mesh(postGeo, rackFrameMat),
    ];
    posts[0].position.set(xOuter, yCenter, zFront);
    posts[1].position.set(xOuter, yCenter, zBack);
    posts[2].position.set(xInner, yCenter, zFront);
    posts[3].position.set(xInner, yCenter, zBack);
    posts.forEach(p => g.add(p));

    // Балки по длине (верх/низ, внутренняя/внешняя)
    const beamGeo = new THREE.BoxGeometry(0.08, 0.08, rackLength);
    const yTop = rackHeight - 0.05;
    const yBottom = 0.08;
    const beams = [
      new THREE.Mesh(beamGeo, rackBeamMat),
      new THREE.Mesh(beamGeo, rackBeamMat),
      new THREE.Mesh(beamGeo, rackBeamMat),
      new THREE.Mesh(beamGeo, rackBeamMat),
    ];
    beams[0].position.set(xOuter, yBottom, 0);
    beams[1].position.set(xInner, yBottom, 0);
    beams[2].position.set(xOuter, yTop, 0);
    beams[3].position.set(xInner, yTop, 0);
    beams.forEach(b => g.add(b));

    // Полки по уровням (тонкие панели по всей длине)
    const shelfGeo = new THREE.BoxGeometry(rackWidth - 0.15, 0.06, rackLength - 0.12);
    for (let level = 0; level < WAREHOUSE_LEVELS; level++) {
      const shelf = new THREE.Mesh(shelfGeo, rackBeamMat);
      const y = 0.18 + level * 0.6;
      shelf.position.set(sideX, y, 0);
      g.add(shelf);

      // Поперечные балки (по 3-4 шт) для читаемости
      const crossGeo = new THREE.BoxGeometry(rackWidth - 0.10, 0.06, 0.10);
      for (let r = 0; r < GRID_ROWS; r++) {
        const z = (r + 0.5) * CELL - gridH/2;
        const cross = new THREE.Mesh(crossGeo, rackBeamMat);
        cross.position.set(sideX, y + 0.06, z);
        g.add(cross);
      }
    }

    // Ячейки хранения (6 уровней × GRID_ROWS позиций вдоль Z)
    // Каждая ячейка визуально — "лоток" (box), куда кладём объект
    const slots = [];
    for (let level = 0; level < WAREHOUSE_LEVELS; level++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const slot = new THREE.Mesh(
          new THREE.BoxGeometry(RACK_DEPTH, 0.40, RACK_CELL),
          rackSlotMat
        );
        const z = (r + 0.5)*CELL - gridH/2;
        const y = 0.35 + level*0.6;

        // немного сместим к "проёму", чтобы кран выглядел логично
        slot.position.set(sideX + (sideX < 0 ? 0.10 : -0.10), y, z);
        g.add(slot);

        slots.push({ level, r, mesh: slot, occupiedBy: null });
      }
    }

    return { group: g, slots, sideX };
  }

  const leftRack = makeRack(leftRackX);
  const rightRack = makeRack(rightRackX);

  rackGroup.add(leftRack.group, rightRack.group);

  return { leftRack, rightRack, leftRackX, rightRackX };
}
