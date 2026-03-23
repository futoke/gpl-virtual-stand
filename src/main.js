import "./style.css";

import * as THREE from "three";
import { createSceneBasics } from "./scene/setup.js";
import { buildFloorAndGrid, cellToWorld } from "./scene/grid.js";
import { createState } from "./sim/state.js";
import { makeBlock } from "./sim/objects.js";
import { setCellModule } from "./sim/modules.js";
import { createIOZones } from "./sim/ioZones.js";
import { createWarehouses } from "./sim/warehouses.js";
import { createCranes, updateCranePose } from "./sim/cranes.js";
import { initUI, updateHUD } from "./ui/hud.js";
import { attachInput } from "./ui/input.js";
import { CELL } from "./scene/constants.js";

const { scene, camera, renderer, controls } = createSceneBasics();
const { floor, gridW, gridH } = buildFloorAndGrid(scene);

const state = createState();
initUI(state);

// Selection frame
const selectionPoints = [
  new THREE.Vector3(-CELL / 2, 0, -CELL / 2),
  new THREE.Vector3(CELL / 2, 0, -CELL / 2),
  new THREE.Vector3(CELL / 2, 0, CELL / 2),
  new THREE.Vector3(-CELL / 2, 0, CELL / 2),
  new THREE.Vector3(-CELL / 2, 0, -CELL / 2),
];
const selectionGeometry = new THREE.BufferGeometry().setFromPoints(selectionPoints);
const selectionMaterial = new THREE.LineBasicMaterial({ color: 0xff4d4d });
const selection = new THREE.Line(selectionGeometry, selectionMaterial);
selection.position.y = 0.03;
scene.add(selection);

function updateSelection() {
  const { r, c } = state.selectedCell;
  const pos = cellToWorld(r, c, gridW, gridH);
  selection.position.set(pos.x, 0.03, pos.z);
  selection.visible = state.editMode;
}
updateSelection();

// IO zones
const io = createIOZones(scene, gridW, gridH);

// Warehouses + cranes
const warehouses = createWarehouses(scene, gridW, gridH);
const cranes = createCranes(scene, warehouses);
scene.add(cranes.left.group, cranes.right.group);

const leftRackHighlight = new THREE.Box3Helper(new THREE.Box3().setFromObject(warehouses.leftRack.group), 0xff8a65);
const rightRackHighlight = new THREE.Box3Helper(new THREE.Box3().setFromObject(warehouses.rightRack.group), 0x6ec1ff);
leftRackHighlight.visible = false;
rightRackHighlight.visible = false;
scene.add(leftRackHighlight, rightRackHighlight);

updateCranePose(cranes.left, gridH);
updateCranePose(cranes.right, gridH);

// Example modules
setCellModule(scene, state, gridW, gridH, 2, 2, "conveyor");
setCellModule(scene, state, gridW, gridH, 2, 3, "rotary");
setCellModule(scene, state, gridW, gridH, 2, 4, "process");

attachInput({ scene, renderer, camera, floor, gridW, gridH, state, cranes, warehouses, io });
// --- Предзаполнение складов цветными объектами (как на стеллажах) ---
function prefillRack(rack, count) {
  const palette = [0xff4d4d, 0x4dff88, 0x4da3ff, 0xffd24d, 0xc44dff, 0x4dfff2];
  // выберем "count" случайных слотов без повторов
  const slots = [...rack.slots];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const chosen = slots.slice(0, Math.min(count, slots.length));

  for (const s of chosen) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    const obj = makeBlock(scene, state, color);
    obj.state = "on_shelf";
    // положим в слот
    obj.mesh.position.set(s.mesh.position.x, s.mesh.position.y + 0.18, s.mesh.position.z);
    s.occupiedBy = obj;
  }
}

// по умолчанию заполняем часть ячеек, чтобы склад выглядел "живым"
prefillRack(warehouses.leftRack,  Math.floor(warehouses.leftRack.slots.length * 0.45));
prefillRack(warehouses.rightRack, Math.floor(warehouses.rightRack.slots.length * 0.45));


const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  state.time += dt;

  controls.update();
  updateSelection();

  const leftActive = state.activeCraneKey === "left";
  const rightActive = state.activeCraneKey === "right";
  const leftIOActive = state.activeIOZone === "left";
  const rightIOActive = state.activeIOZone === "right";

  cranes.left.mast.material.emissive.setHex(leftActive ? 0x330000 : 0x000000);
  cranes.right.mast.material.emissive.setHex(rightActive ? 0x001133 : 0x000000);
  leftRackHighlight.visible = leftActive;
  rightRackHighlight.visible = rightActive;
  io.left.material.emissive.setHex(leftIOActive ? 0x1d1d1d : 0x000000);
  io.right.material.emissive.setHex(rightIOActive ? 0x0f2618 : 0x000000);

  updateHUD(state, cranes);
  renderer.render(scene, camera);
}
animate();
