import * as THREE from "three";
import { CELL, GRID_COLS, GRID_ROWS, FLOOR_THICK } from "./constants.js";

function getGridOrigin(gridW, gridH) {
  return { minX: -gridW / 2, minZ: -gridH / 2 };
}

function createRectGrid(gridW, gridH) {
  const { minX, minZ } = getGridOrigin(gridW, gridH);
  const points = [];

  for (let c = 0; c <= GRID_COLS; c++) {
    const x = minX + c * CELL;
    points.push(new THREE.Vector3(x, 0, minZ));
    points.push(new THREE.Vector3(x, 0, minZ + gridH));
  }

  for (let r = 0; r <= GRID_ROWS; r++) {
    const z = minZ + r * CELL;
    points.push(new THREE.Vector3(minX, 0, z));
    points.push(new THREE.Vector3(minX + gridW, 0, z));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x1f3f73, transparent: true, opacity: 0.95 });
  const grid = new THREE.LineSegments(geometry, material);
  grid.position.y = 0.002;
  return grid;
}

export function buildFloorAndGrid(scene) {
  const gridW = GRID_COLS * CELL;
  const gridH = GRID_ROWS * CELL;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(gridW, FLOOR_THICK, gridH),
    new THREE.MeshStandardMaterial({ color: 0x12192a, roughness: 0.9, metalness: 0.0 })
  );
  floor.position.set(0, -FLOOR_THICK / 2, 0);
  scene.add(floor);

  const grid = createRectGrid(gridW, gridH);
  scene.add(grid);

  return { floor, gridW, gridH };
}

export function cellToWorld(r, c, gridW, gridH) {
  const { minX, minZ } = getGridOrigin(gridW, gridH);
  const x = minX + (c + 0.5) * CELL;
  const z = minZ + (r + 0.5) * CELL;
  return new THREE.Vector3(x, 0, z);
}
