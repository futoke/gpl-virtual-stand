import { GRID_ROWS, GRID_COLS, MODULE } from "../scene/constants.js";
import { cellToWorld } from "../scene/grid.js";

export function findNearestTopModuleCell(state) {
  const r = GRID_ROWS - 1;
  let best = null, bestDist = Infinity;
  for (let c = 0; c < GRID_COLS; c++) {
    const cs = state.cellState[r][c];
    if (cs.type !== MODULE.EMPTY) {
      const dx = Math.abs(c - Math.floor(GRID_COLS/2));
      if (dx < bestDist) { bestDist = dx; best = { r, c }; }
    }
  }
  return best;
}

export function popFromInStackToNearest(state, gridW, gridH) {
  if (state.inStack.length === 0) return false;

  const bottom = state.inStack.shift();

  const cell = findNearestTopModuleCell(state);
  if (!cell) { state.inStack.unshift(bottom); return false; }

  const cs = state.cellState[cell.r][cell.c];
  if (cs.occupiedBy) { state.inStack.unshift(bottom); return false; }

  cs.occupiedBy = bottom;
  bottom.state = "on_cell";
  const pos = cellToWorld(cell.r, cell.c, gridW, gridH);
  bottom.mesh.position.set(pos.x, 0.26, pos.z);
  return true;
}
