import { MODULE } from "../scene/constants.js";
import { pickCellFromPointer } from "../scene/picking.js";
import { setCellModule, rotateEditableModule } from "../sim/modules.js";

const EDIT_KEYS = new Set(["r", "delete"]);
const API_KEYS = new Set(["q", "e", "w", "a", "s", "d", "f", "g", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

export function attachInput({ scene, renderer, camera, floor, gridW, gridH, state, apiActions }) {
  window.addEventListener("contextmenu", (ev) => {
    if (state.editMode) ev.preventDefault();
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

    if (state.editMode && EDIT_KEYS.has(key)) {
      e.preventDefault();

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
