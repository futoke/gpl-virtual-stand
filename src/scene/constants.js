export const GRID_ROWS = 6;
export const GRID_COLS = 9;
export const CELL = 1.0;
export const FLOOR_THICK = 0.06;

export const WAREHOUSE_LEVELS = 6;
export const RACK_CELL = 0.55;
export const RACK_DEPTH = 0.9;

export const IO_SIZE = 2; // 2×2 = 4 клетки

export const MODULE = {
  EMPTY: "empty",
  CONVEYOR: "conveyor",
  ROTARY: "rotary",
  PROCESS: "process",
};

export const DIR = { N: 0, E: 1, S: 2, W: 3 };

export function dirToAngleY(d) {
  return d * (Math.PI / 2);
}
