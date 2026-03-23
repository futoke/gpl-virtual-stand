import * as THREE from "three";
import { MODULE, DIR, dirToAngleY } from "../scene/constants.js";
import { cellToWorld } from "../scene/grid.js";

const matConveyor = new THREE.MeshStandardMaterial({ color: 0x2c6bb8, roughness: 0.65, metalness: 0.08 });
const matRotary   = new THREE.MeshStandardMaterial({ color: 0x7a46c7, roughness: 0.65, metalness: 0.08 });
const matProcess  = new THREE.MeshStandardMaterial({ color: 0x3aa35c, roughness: 0.65, metalness: 0.08 });

function makeArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 })
  );
  shaft.rotation.x = Math.PI / 2;

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.10, 0.22, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 })
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.36;

  g.add(shaft, head);
  return g;
}

function makeModuleMesh(type, dir = DIR.N) {
  const g = new THREE.Group();

  if (type === MODULE.CONVEYOR) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), matConveyor);
    body.position.y = 0.09;
    const arrow = makeArrow();
    arrow.position.y = 0.22;
    arrow.rotation.y = dirToAngleY(dir);
    g.add(body, arrow);
  }

  if (type === MODULE.ROTARY) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), matRotary);
    body.position.y = 0.09;
    const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24), matRotary);
    turntable.position.y = 0.19;
    const arrow = makeArrow();
    arrow.position.y = 0.22;
    arrow.rotation.y = dirToAngleY(dir);
    g.add(body, turntable, arrow);
  }

  if (type === MODULE.PROCESS) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), matProcess);
    body.position.y = 0.36;
    const hole = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 1.0, metalness: 0.0 })
    );
    hole.position.y = 0.36;
    g.add(body, hole);
  }

  return g;
}

export function setCellModule(scene, state, gridW, gridH, r, c, type) {
  const cs = state.cellState[r][c];
  if (cs.mesh) scene.remove(cs.mesh);

  cs.type = type;
  cs.dir = DIR.N;
  cs.queue = [];
  cs.busyUntil = 0;

  if (type === MODULE.EMPTY) {
    cs.mesh = null;
    return;
  }

  const mesh = makeModuleMesh(type, cs.dir);
  mesh.position.copy(cellToWorld(r, c, gridW, gridH));
  cs.mesh = mesh;
  scene.add(mesh);
}

export function rotateEditableModule(state, r, c) {
  const cs = state.cellState[r][c];
  if ((cs.type !== MODULE.CONVEYOR && cs.type !== MODULE.ROTARY) || !cs.mesh) return;

  cs.dir = (cs.dir + 1) % 4;

  const arrow = cs.mesh.children.find(ch => ch.type === "Group");
  if (arrow) arrow.rotation.y = dirToAngleY(cs.dir);
}
