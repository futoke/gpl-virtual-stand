import * as THREE from "three";
import { CELL, GRID_COLS, GRID_ROWS } from "./constants.js";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

export function pickCellFromPointer(ev, renderer, camera, floor, gridW, gridH) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(floor, false);
  if (!hit.length) return null;

  const p = hit[0].point;
  const c = Math.floor((p.x + gridW / 2) / CELL);
  const r = Math.floor((p.z + gridH / 2) / CELL);
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null;
  return { r, c };
}
