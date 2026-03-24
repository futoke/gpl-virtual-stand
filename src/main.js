import "./style.css";

import * as THREE from "three";
import { fetchServerState, ioExchange, launchFromIO, moveCrane as moveCraneRequest, moveFieldObject, rackExchange, setActiveCrane, setActiveIOZone, setServerMode, setStackCapacity, syncServerLayout } from "./api/client.js";
import { createSceneBasics } from "./scene/setup.js";
import { buildFloorAndGrid, cellToWorld } from "./scene/grid.js";
import { createState } from "./sim/state.js";
import { createIOZones } from "./sim/ioZones.js";
import { createWarehouses } from "./sim/warehouses.js";
import { createCranes } from "./sim/cranes.js";
import { applyServerSnapshot, serializeLayoutState } from "./sim/serverSync.js";
import { initUI, updateHUD } from "./ui/hud.js";
import { attachInput } from "./ui/input.js";
import { CELL } from "./scene/constants.js";

const { scene, camera, renderer, controls } = createSceneBasics();
const { floor, gridW, gridH } = buildFloorAndGrid(scene);

const state = createState();
state.apiBusy = false;
state.apiError = null;
state.apiPolling = false;

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

const io = createIOZones(scene, gridW, gridH);
const warehouses = createWarehouses(scene, gridW, gridH);
const cranes = createCranes(scene, warehouses);
scene.add(cranes.left.group, cranes.right.group);

const leftRackHighlight = new THREE.Box3Helper(new THREE.Box3().setFromObject(warehouses.leftRack.group), 0xff8a65);
const rightRackHighlight = new THREE.Box3Helper(new THREE.Box3().setFromObject(warehouses.rightRack.group), 0x6ec1ff);
leftRackHighlight.visible = false;
rightRackHighlight.visible = false;
scene.add(leftRackHighlight, rightRackHighlight);

function setApiState({ busy = state.apiBusy, error = state.apiError }) {
  state.apiBusy = busy;
  state.apiError = error;
  state.renderUI?.();
}

async function applySnapshot(snapshot) {
  applyServerSnapshot({ scene, state, gridW, gridH, warehouses, cranes, io, snapshot });
}

async function executeApiAction(action) {
  setApiState({ busy: true, error: null });
  try {
    const snapshot = await action();
    await applySnapshot(snapshot);
  } catch (error) {
    setApiState({ busy: false, error: error.message });
    return;
  }
  setApiState({ busy: false, error: null });
}

async function pollServerState() {
  if (state.editMode || state.apiBusy || state.apiPolling) return;

  state.apiPolling = true;
  try {
    const snapshot = await fetchServerState();
    await applySnapshot(snapshot);
    if (state.apiError) {
      setApiState({ busy: false, error: null });
    }
  } catch (error) {
    setApiState({ busy: false, error: `Polling failed: ${error.message}` });
  } finally {
    state.apiPolling = false;
  }
}

async function toggleEditMode() {
  if (state.editMode) {
    await executeApiAction(async () => {
      await syncServerLayout(serializeLayoutState(state));
      return setServerMode(false);
    });
    return;
  }

  await executeApiAction(() => setServerMode(true));
}

const apiActions = {
  selectIOZone: (side) => executeApiAction(() => setActiveIOZone(side)),
  setStackCapacity: (capacity) => executeApiAction(() => setStackCapacity(capacity)),
  launchIO: () => executeApiAction(() => launchFromIO()),
  selectCrane: (side) => executeApiAction(() => setActiveCrane(side)),
  moveCrane: (direction) => executeApiAction(() => moveCraneRequest(direction)),
  rackExchange: () => executeApiAction(() => rackExchange()),
  ioExchange: () => executeApiAction(() => ioExchange()),
  moveFieldObject: (direction) => executeApiAction(() => moveFieldObject(direction)),
};

initUI(state, {
  onToggleEditMode: toggleEditMode,
  onSelectIOZone: apiActions.selectIOZone,
  onSetStackCapacity: apiActions.setStackCapacity,
  onLaunchIO: apiActions.launchIO,
});

attachInput({
  scene,
  renderer,
  camera,
  floor,
  gridW,
  gridH,
  state,
  cranes,
  warehouses,
  io,
  apiActions,
});

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
  io.left.mesh.material.emissive.setHex(leftIOActive ? 0x3a0909 : 0x000000);
  io.right.mesh.material.emissive.setHex(rightIOActive ? 0x3a0909 : 0x000000);
  io.left.border.material.color.setHex(leftIOActive ? 0xff2a2a : 0xff6b6b);
  io.right.border.material.color.setHex(rightIOActive ? 0xff2a2a : 0xff6b6b);
  io.left.border.material.opacity = leftIOActive ? 1 : 0.8;
  io.right.border.material.opacity = rightIOActive ? 1 : 0.8;

  updateHUD(state, cranes);
  renderer.render(scene, camera);
}
animate();

async function bootstrap() {
  await executeApiAction(() => fetchServerState());
  window.setInterval(() => {
    void pollServerState();
  }, 400);
}

void bootstrap();
