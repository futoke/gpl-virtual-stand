import { DIR, MODULE } from "../scene/constants.js";
import { cellToWorld } from "../scene/grid.js";
import { setCellModule, rotateEditableModule } from "./modules.js";
import { makeBlock } from "./objects.js";
import { updateCranePose } from "./cranes.js";

function objectLiftY(state, r, c) {
  return state.cellState[r][c].type === MODULE.PROCESS ? 0.4 : 0.26;
}

function positionStackObjects(stack, zone) {
  for (let i = 0; i < stack.length; i++) {
    const obj = stack[i];
    obj.mesh.position.set(zone.mesh.position.x, 0.18 + i * 0.28, zone.mesh.position.z);
  }
}

function slotByRowLevel(rack, row, level) {
  return rack.slots.find((slot) => slot.r === row && slot.level === level);
}

function applyLayoutSnapshot(scene, state, gridW, gridH, snapshot) {
  for (let r = 0; r < snapshot.cell_state.length; r++) {
    for (let c = 0; c < snapshot.cell_state[r].length; c++) {
      const nextCell = snapshot.cell_state[r][c];
      const currentCell = state.cellState[r][c];

      if (currentCell.type !== nextCell.type) {
        setCellModule(scene, state, gridW, gridH, r, c, nextCell.type);
      }

      if (nextCell.type !== MODULE.EMPTY && currentCell.dir !== nextCell.dir) {
        while (state.cellState[r][c].dir !== nextCell.dir) {
          rotateEditableModule(state, r, c);
        }
      }

      if (nextCell.type === MODULE.EMPTY) {
        state.cellState[r][c].dir = DIR.N;
      }
    }
  }
}

function materializeObjects(scene, state, snapshot) {
  const activeIds = new Set(snapshot.objects.map((obj) => obj.id));

  for (const [id, obj] of state.objects.entries()) {
    if (!activeIds.has(id)) {
      scene.remove(obj.mesh);
      state.objects.delete(id);
    }
  }

  for (const objectSnapshot of snapshot.objects) {
    const existing = state.objects.get(objectSnapshot.id);
    if (existing) {
      existing.color = objectSnapshot.color;
      existing.mesh.material.color.setHex(objectSnapshot.color);
      continue;
    }

    makeBlock(scene, state, objectSnapshot.color, objectSnapshot.id);
  }

  state.nextObjId = snapshot.next_obj_id;
}

export function applyServerSnapshot({ scene, state, gridW, gridH, warehouses, cranes, io, snapshot }) {
  applyLayoutSnapshot(scene, state, gridW, gridH, snapshot);
  materializeObjects(scene, state, snapshot);

  state.editMode = snapshot.edit_mode;
  state.activeCraneKey = snapshot.active_crane_key;
  state.activeIOZone = snapshot.active_io_zone;
  state.stackCapacity = snapshot.stack_capacity;
  state.activeFieldObject = null;

  for (const row of state.cellState) {
    for (const cell of row) {
      cell.occupiedBy = null;
    }
  }

  for (const slot of warehouses.leftRack.slots) {
    slot.occupiedBy = null;
  }
  for (const slot of warehouses.rightRack.slots) {
    slot.occupiedBy = null;
  }

  cranes.left.holding = null;
  cranes.right.holding = null;

  for (const side of ["left", "right"]) {
    const rack = side === "left" ? warehouses.leftRack : warehouses.rightRack;
    const slotSnapshots = snapshot.warehouses[`${side}_slots`];

    for (const slotSnapshot of slotSnapshots) {
      if (slotSnapshot.object_id == null) continue;

      const slot = slotByRowLevel(rack, slotSnapshot.row, slotSnapshot.level);
      const obj = state.objects.get(slotSnapshot.object_id);
      if (!slot || !obj) continue;

      slot.occupiedBy = obj;
      obj.state = "on_shelf";
      obj.mesh.position.set(slot.mesh.position.x, slot.mesh.position.y + 0.18, slot.mesh.position.z);
    }
  }

  for (const side of ["left", "right"]) {
    const craneSnapshot = snapshot.cranes[side];
    const crane = cranes[side];
    crane.row = craneSnapshot.row;
    crane.level = craneSnapshot.level;
    crane.holding = craneSnapshot.holding_object_id == null ? null : state.objects.get(craneSnapshot.holding_object_id) ?? null;
    updateCranePose(crane, gridH);
  }

  state.ioStacks.left = snapshot.io_stacks.left.map((id) => state.objects.get(id)).filter(Boolean);
  state.ioStacks.right = snapshot.io_stacks.right.map((id) => state.objects.get(id)).filter(Boolean);
  positionStackObjects(state.ioStacks.left, io.left);
  positionStackObjects(state.ioStacks.right, io.right);

  const activeFieldObject = snapshot.active_field_object_id == null ? null : state.objects.get(snapshot.active_field_object_id) ?? null;
  state.activeFieldObject = activeFieldObject;

  if (activeFieldObject) {
    const fieldSnapshot = snapshot.objects.find((obj) => obj.id === snapshot.active_field_object_id);
    if (fieldSnapshot?.field_cell) {
      const { r, c } = fieldSnapshot.field_cell;
      const pos = cellToWorld(r, c, gridW, gridH);
      activeFieldObject.fieldCell = { r, c };
      activeFieldObject.state = fieldSnapshot.state;
      activeFieldObject.mesh.position.set(pos.x, objectLiftY(state, r, c), pos.z);
      state.cellState[r][c].occupiedBy = activeFieldObject;
    }
  }

  for (const objectSnapshot of snapshot.objects) {
    if (objectSnapshot.id !== snapshot.active_field_object_id) {
      const obj = state.objects.get(objectSnapshot.id);
      if (!obj) continue;
      delete obj.fieldCell;
      obj.state = objectSnapshot.state;
    }
  }

  state.renderUI?.();
}

export function serializeLayoutState(state) {
  return {
    cell_state: state.cellState.map((row) =>
      row.map((cell) => ({
        type: cell.type,
        dir: cell.dir,
      }))
    ),
    active_crane_key: state.activeCraneKey,
    active_io_zone: state.activeIOZone,
    stack_capacity: state.stackCapacity,
  };
}
