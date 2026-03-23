import { GRID_ROWS, GRID_COLS, MODULE, DIR } from "../scene/constants.js";

export function createState() {
  const cellState = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => ({
      type: MODULE.EMPTY,
      dir: DIR.N,
      mesh: null,
      occupiedBy: null,
      queue: [],
      busyUntil: 0,
      processDelay: 2.0,
      speed: 1.0,
    }))
  );

  return {
    time: 0,
    editMode: true,
    selectedCell: { r: 2, c: 2 },
    activeCraneKey: "left",
    activeIOZone: "left",
    activeFieldObject: null,
    stackCapacity: 4,
    nextObjId: 1,
    objects: new Map(),
    ioStacks: { left: [], right: [] },
    outStack: [],
    cellState,
  };
}
