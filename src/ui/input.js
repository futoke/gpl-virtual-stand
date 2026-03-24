import { MODULE, GRID_COLS, GRID_ROWS } from "../scene/constants.js";
import { pickCellFromPointer } from "../scene/picking.js";
import { cellToWorld } from "../scene/grid.js";
import { setCellModule, rotateEditableModule } from "../sim/modules.js";
import { cranePickOrPlace, moveCrane, updateCranePose } from "../sim/cranes.js";

const EDIT_KEYS = new Set(["r", "delete"]);
const API_KEYS = new Set(["q", "e", "w", "a", "s", "d", "f", "g", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

function stackKeyForCrane(crane) {
  return crane.sideX < 0 ? "left" : "right";
}

function craneAtIOZone(crane) {
  const targetRow = crane.sideX < 0 ? GRID_ROWS - 1 : 0;
  return crane.row === targetRow && crane.level === 0;
}

function updateStackVisual(stack, zoneMesh) {
  for (let i = 0; i < stack.length; i++) {
    const obj = stack[i];
    obj.mesh.position.set(zoneMesh.mesh.position.x, 0.18 + i * 0.28, zoneMesh.mesh.position.z);
  }
}

function objectLiftY(state, r, c) {
  return state.cellState[r][c].type === MODULE.PROCESS ? 0.4 : 0.26;
}

function placeObjectOnField(state, obj, r, c, gridW, gridH) {
  const pos = cellToWorld(r, c, gridW, gridH);
  obj.mesh.position.set(pos.x, objectLiftY(state, r, c), pos.z);
  obj.state = "on_field";
  obj.fieldCell = { r, c };
  state.activeFieldObject = obj;
}

function launchBottomObjectFromActiveZone(state, io, gridW, gridH) {
  if (state.activeFieldObject) return false;

  const stack = state.ioStacks[state.activeIOZone];
  if (stack.length === 0) return false;

  const obj = stack.shift();
  const startCell = state.activeIOZone === "left" ? { r: GRID_ROWS - 1, c: 0 } : { r: 0, c: GRID_COLS - 1 };
  placeObjectOnField(state, obj, startCell.r, startCell.c, gridW, gridH);
  updateStackVisual(stack, io[state.activeIOZone]);
  return true;
}

function tryReturnFieldObjectToIO(state, io, key) {
  const obj = state.activeFieldObject;
  if (!obj || !obj.fieldCell) return false;

  const { r, c } = obj.fieldCell;
  const canReturnLeft = r === GRID_ROWS - 1 && c === 0 && key === "arrowleft";
  const canReturnRight = r === 0 && c === GRID_COLS - 1 && key === "arrowright";
  if (!canReturnLeft && !canReturnRight) return false;

  const stackKey = canReturnLeft ? "left" : "right";
  const stack = state.ioStacks[stackKey];
  if (stack.length >= state.stackCapacity) return false;

  stack.unshift(obj);
  obj.state = "in_stack";
  delete obj.fieldCell;
  state.activeFieldObject = null;
  updateStackVisual(stack, io[stackKey]);
  return true;
}

function moveActiveFieldObject(state, key, io, gridW, gridH) {
  const obj = state.activeFieldObject;
  if (!obj || !obj.fieldCell) return false;

  if (tryReturnFieldObjectToIO(state, io, key)) return true;

  const delta = {
    arrowup: { dr: 1, dc: 0 },
    arrowdown: { dr: -1, dc: 0 },
    arrowleft: { dr: 0, dc: -1 },
    arrowright: { dr: 0, dc: 1 },
  }[key];
  if (!delta) return false;

  const nextR = obj.fieldCell.r + delta.dr;
  const nextC = obj.fieldCell.c + delta.dc;
  if (nextR < 0 || nextR >= GRID_ROWS || nextC < 0 || nextC >= GRID_COLS) return false;

  placeObjectOnField(state, obj, nextR, nextC, gridW, gridH);
  return true;
}

function exchangeWithIOStack(state, crane, io) {
  if (!craneAtIOZone(crane)) return false;

  const stackKey = stackKeyForCrane(crane);
  const stack = state.ioStacks[stackKey];

  if (crane.holding) {
    if (stack.length >= state.stackCapacity) return false;

    const obj = crane.holding;
    crane.holding = null;
    obj.state = "in_stack";
    stack.push(obj);
    updateStackVisual(stack, io[stackKey]);
    return true;
  }

  if (stack.length === 0) return false;

  const obj = stack.pop();
  crane.holding = obj;
  obj.state = "in_crane";
  updateStackVisual(stack, io[stackKey]);
  return true;
}

export function attachInput({ scene, renderer, camera, floor, gridW, gridH, state, cranes, warehouses, io, apiActions }) {
  window.addEventListener("contextmenu", (ev) => {
    if (state.editMode) ev.preventDefault();
  });

  window.addEventListener("io-launch-request", () => {
    if (!state.editMode) return;
    launchBottomObjectFromActiveZone(state, io, gridW, gridH);
  });

  window.addEventListener("pointerdown", (ev) => {
    if (!state.editMode || (ev.button !== 0 && ev.button !== 2)) return;

    const cell = pickCellFromPointer(ev, renderer, camera, floor, gridW, gridH);
    if (!cell) return;

    if (ev.button === 2) {
      state.selectedCell = cell;
      return;
    }

    if (cell.r !== state.selectedCell.r || cell.c !== state.selectedCell.c) return;

    const cs = state.cellState[cell.r][cell.c];
    const next =
      cs.type === MODULE.EMPTY ? MODULE.CONVEYOR :
      cs.type === MODULE.CONVEYOR ? MODULE.ROTARY :
      cs.type === MODULE.ROTARY ? MODULE.PROCESS :
      MODULE.EMPTY;

    if (cs.occupiedBy && next === MODULE.EMPTY) return;
    setCellModule(scene, state, gridW, gridH, cell.r, cell.c, next);

    if (cs.occupiedBy) {
      const pos = cs.mesh.position;
      cs.occupiedBy.mesh.position.set(pos.x, 0.26, pos.z);
    }
  });

  document.addEventListener("keydown", async (e) => {
    const key = e.key.toLowerCase();

    if (state.editMode && (EDIT_KEYS.has(key) || API_KEYS.has(key))) {
      e.preventDefault();

      if (key === "q") {
        state.activeCraneKey = "left";
        return;
      }

      if (key === "e") {
        state.activeCraneKey = "right";
        return;
      }

      const crane = cranes[state.activeCraneKey];

      if (key === "w") {
        moveCrane(crane, 0, +1);
        updateCranePose(crane, gridH);
        return;
      }

      if (key === "s") {
        moveCrane(crane, 0, -1);
        updateCranePose(crane, gridH);
        return;
      }

      if (key === "a") {
        moveCrane(crane, -1, 0);
        updateCranePose(crane, gridH);
        return;
      }

      if (key === "d") {
        moveCrane(crane, +1, 0);
        updateCranePose(crane, gridH);
        return;
      }

      if (key === "f") {
        cranePickOrPlace(warehouses, crane);
        updateCranePose(crane, gridH);
        return;
      }

      if (key === "g") {
        exchangeWithIOStack(state, crane, io);
        updateCranePose(crane, gridH);
        return;
      }

      if (key.startsWith("arrow")) {
        moveActiveFieldObject(state, key, io, gridW, gridH);
        return;
      }

      if (key === "r") {
        rotateEditableModule(state, state.selectedCell.r, state.selectedCell.c);
      }

      if (key === "delete") {
        const cs = state.cellState[state.selectedCell.r][state.selectedCell.c];
        if (!cs.occupiedBy) {
          setCellModule(scene, state, gridW, gridH, state.selectedCell.r, state.selectedCell.c, MODULE.EMPTY);
        }
      }
      return;
    }

    if (state.editMode || !API_KEYS.has(key) || state.apiBusy) return;

    e.preventDefault();

    if (key === "q") {
      await apiActions.selectCrane("left");
      return;
    }

    if (key === "e") {
      await apiActions.selectCrane("right");
      return;
    }

    if (key === "w") {
      await apiActions.moveCrane("up");
      return;
    }

    if (key === "s") {
      await apiActions.moveCrane("down");
      return;
    }

    if (key === "a") {
      await apiActions.moveCrane("left");
      return;
    }

    if (key === "d") {
      await apiActions.moveCrane("right");
      return;
    }

    if (key === "f") {
      await apiActions.rackExchange();
      return;
    }

    if (key === "g") {
      await apiActions.ioExchange();
      return;
    }

    const fieldDirectionMap = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
    };

    if (fieldDirectionMap[key]) {
      await apiActions.moveFieldObject(fieldDirectionMap[key]);
    }
  }, true);
}
