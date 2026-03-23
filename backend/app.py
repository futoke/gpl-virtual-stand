import random
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


GRID_ROWS = 6
GRID_COLS = 9
WAREHOUSE_LEVELS = 6
MODULE_EMPTY = "empty"
MODULE_CONVEYOR = "conveyor"
MODULE_ROTARY = "rotary"
MODULE_PROCESS = "process"
MODULE_TYPES = {MODULE_EMPTY, MODULE_CONVEYOR, MODULE_ROTARY, MODULE_PROCESS}
PALETTE = [0xFF4D4D, 0x4DFF88, 0x4DA3FF, 0xFFD24D, 0xC44DFF, 0x4DFFF2]


class CellLayout(BaseModel):
    type: str = Field(..., description="Cell module type")
    dir: int = Field(0, ge=0, le=3, description="Direction: 0=N, 1=E, 2=S, 3=W")


class GridCellRef(BaseModel):
    r: int = Field(..., ge=0, lt=GRID_ROWS)
    c: int = Field(..., ge=0, lt=GRID_COLS)


class SlotOccupancy(BaseModel):
    row: int = Field(..., ge=0, lt=GRID_ROWS)
    level: int = Field(..., ge=0, lt=WAREHOUSE_LEVELS)
    object_id: Optional[int] = None


class ObjectSnapshot(BaseModel):
    id: int
    color: int
    state: str
    field_cell: Optional[GridCellRef] = None


class CraneSnapshot(BaseModel):
    row: int
    level: int
    holding_object_id: Optional[int] = None


class WarehouseSnapshot(BaseModel):
    left_slots: List[SlotOccupancy]
    right_slots: List[SlotOccupancy]


class AppStateSnapshot(BaseModel):
    edit_mode: bool
    active_crane_key: str
    active_io_zone: str
    stack_capacity: int
    next_obj_id: int
    cell_state: List[List[CellLayout]]
    io_stacks: Dict[str, List[int]]
    active_field_object_id: Optional[int] = None
    cranes: Dict[str, CraneSnapshot]
    warehouses: WarehouseSnapshot
    objects: List[ObjectSnapshot]


class ModeRequest(BaseModel):
    edit_mode: bool


class LayoutSyncRequest(BaseModel):
    cell_state: List[List[CellLayout]]
    active_crane_key: str = Field(..., pattern="^(left|right)$")
    active_io_zone: str = Field(..., pattern="^(left|right)$")
    stack_capacity: int = Field(..., ge=1, le=12)


class SideSelectionRequest(BaseModel):
    side: str = Field(..., pattern="^(left|right)$")


class StackCapacityRequest(BaseModel):
    capacity: int = Field(..., ge=1, le=12)


class MoveCraneRequest(BaseModel):
    direction: str = Field(..., pattern="^(up|down|left|right)$")


class MoveFieldObjectRequest(BaseModel):
    direction: str = Field(..., pattern="^(up|down|left|right)$")


class RotaryDirectionRequest(BaseModel):
    r: int = Field(..., ge=0, lt=GRID_ROWS)
    c: int = Field(..., ge=0, lt=GRID_COLS)
    direction: int = Field(..., ge=0, le=3)


class RandomizeWarehousesRequest(BaseModel):
    count_per_side: int = Field(18, ge=1, le=GRID_ROWS * WAREHOUSE_LEVELS)
    seed: Optional[int] = None


def make_default_layout() -> List[List[Dict[str, int]]]:
    cell_state: List[List[Dict[str, int]]] = []
    for _ in range(GRID_ROWS):
        row: List[Dict[str, int]] = []
        for _ in range(GRID_COLS):
            row.append({"type": MODULE_EMPTY, "dir": 0})
        cell_state.append(row)

    for col in range(0, 5):
        cell_state[5][col] = {"type": MODULE_CONVEYOR, "dir": 1}

    cell_state[5][5] = {"type": MODULE_PROCESS, "dir": 0}
    cell_state[5][6] = {"type": MODULE_CONVEYOR, "dir": 1}
    cell_state[5][7] = {"type": MODULE_CONVEYOR, "dir": 1}
    cell_state[5][8] = {"type": MODULE_ROTARY, "dir": 2}

    for row in range(1, 5):
        cell_state[row][8] = {"type": MODULE_CONVEYOR, "dir": 2}

    cell_state[0][8] = {"type": MODULE_ROTARY, "dir": 2}

    return cell_state


def make_slot_index() -> List[Dict[str, Optional[int]]]:
    slots = []
    for level in range(WAREHOUSE_LEVELS):
        for row in range(GRID_ROWS):
            slots.append({"row": row, "level": level, "occupied_by": None})
    return slots


def create_initial_state() -> Dict:
    state = {
        "edit_mode": True,
        "active_crane_key": "left",
        "active_io_zone": "left",
        "stack_capacity": 4,
        "next_obj_id": 1,
        "cell_state": make_default_layout(),
        "io_stacks": {"left": [], "right": []},
        "active_field_object_id": None,
        "field_object_cell": None,
        "cranes": {
            "left": {"row": 0, "level": 0, "holding_object_id": None},
            "right": {"row": 0, "level": 0, "holding_object_id": None},
        },
        "warehouses": {
            "left_slots": make_slot_index(),
            "right_slots": make_slot_index(),
        },
        "objects": {},
    }

    populate_random_warehouses(state, count_per_side=int(len(state["warehouses"]["left_slots"]) * 0.45), seed=42)

    return state

app = FastAPI(
    title="GPL Virtual Stand API",
    version="1.0.0",
    description="API for remote control of the virtual stand outside edit mode.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_not_in_edit_mode() -> None:
    if APP_STATE["edit_mode"]:
        raise HTTPException(status_code=409, detail="Runtime actions are only available outside edit mode.")


def find_slot(side: str, row: int, level: int) -> Optional[Dict]:
    for slot in APP_STATE["warehouses"]["%s_slots" % side]:
        if slot["row"] == row and slot["level"] == level:
            return slot
    return None


def current_crane() -> Dict:
    return APP_STATE["cranes"][APP_STATE["active_crane_key"]]


def current_rack_side() -> str:
    return APP_STATE["active_crane_key"]


def current_io_side() -> str:
    return APP_STATE["active_io_zone"]


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def populate_random_warehouses(state: Dict, count_per_side: int, seed: Optional[int] = None) -> None:
    rng = random.Random(seed)

    state["next_obj_id"] = 1
    state["objects"] = {}
    state["io_stacks"] = {"left": [], "right": []}
    state["active_field_object_id"] = None
    state["field_object_cell"] = None
    state["cranes"]["left"]["holding_object_id"] = None
    state["cranes"]["right"]["holding_object_id"] = None
    state["cranes"]["left"]["row"] = 0
    state["cranes"]["left"]["level"] = 0
    state["cranes"]["right"]["row"] = 0
    state["cranes"]["right"]["level"] = 0

    for side in ("left", "right"):
        slots = state["warehouses"]["%s_slots" % side]
        for slot in slots:
            slot["occupied_by"] = None

        shuffled_slots = list(slots)
        rng.shuffle(shuffled_slots)
        for slot in shuffled_slots[:count_per_side]:
            obj_id = state["next_obj_id"]
            state["next_obj_id"] += 1
            state["objects"][obj_id] = {"id": obj_id, "color": rng.choice(PALETTE)}
            slot["occupied_by"] = obj_id


APP_STATE = create_initial_state()


def object_lift_state(row: int, col: int) -> str:
    module_type = APP_STATE["cell_state"][row][col]["type"]
    return "on_process" if module_type == MODULE_PROCESS else "on_field"


def discard_active_field_object() -> None:
    obj_id = APP_STATE["active_field_object_id"]
    if obj_id is not None:
        APP_STATE["objects"].pop(obj_id, None)

    APP_STATE["active_field_object_id"] = None
    APP_STATE["field_object_cell"] = None


def crane_at_io_zone(side: str, crane: Dict) -> bool:
    target_row = GRID_ROWS - 1 if side == "left" else 0
    return crane["row"] == target_row and crane["level"] == 0


def move_crane(direction: str) -> None:
    crane = current_crane()
    if direction == "left":
        crane["row"] = clamp(crane["row"] - 1, 0, GRID_ROWS - 1)
    elif direction == "right":
        crane["row"] = clamp(crane["row"] + 1, 0, GRID_ROWS - 1)
    elif direction == "up":
        crane["level"] = clamp(crane["level"] + 1, 0, WAREHOUSE_LEVELS - 1)
    elif direction == "down":
        crane["level"] = clamp(crane["level"] - 1, 0, WAREHOUSE_LEVELS - 1)


def rack_exchange() -> None:
    side = current_rack_side()
    crane = current_crane()
    slot = find_slot(side, crane["row"], crane["level"])
    if slot is None:
        return

    if crane["holding_object_id"] is None and slot["occupied_by"] is not None:
        crane["holding_object_id"] = slot["occupied_by"]
        slot["occupied_by"] = None
    elif crane["holding_object_id"] is not None and slot["occupied_by"] is None:
        slot["occupied_by"] = crane["holding_object_id"]
        crane["holding_object_id"] = None


def io_exchange() -> None:
    side = current_rack_side()
    crane = current_crane()
    if not crane_at_io_zone(side, crane):
        return

    stack = APP_STATE["io_stacks"][side]
    if crane["holding_object_id"] is not None:
        if len(stack) >= APP_STATE["stack_capacity"]:
            return
        stack.append(crane["holding_object_id"])
        crane["holding_object_id"] = None
        return

    if not stack:
        return

    crane["holding_object_id"] = stack.pop()


def io_launch() -> None:
    if APP_STATE["active_field_object_id"] is not None:
        return

    stack = APP_STATE["io_stacks"][current_io_side()]
    if not stack:
        return

    obj_id = stack.pop(0)
    APP_STATE["active_field_object_id"] = obj_id
    APP_STATE["field_object_cell"] = {"r": GRID_ROWS - 1, "c": 0} if current_io_side() == "left" else {"r": 0, "c": GRID_COLS - 1}


def move_field_object(direction: str) -> None:
    obj_id = APP_STATE["active_field_object_id"]
    cell = APP_STATE["field_object_cell"]
    if obj_id is None or cell is None:
        return

    row = cell["r"]
    col = cell["c"]

    if direction == "left" and row == GRID_ROWS - 1 and col == 0:
        stack = APP_STATE["io_stacks"]["left"]
        if len(stack) < APP_STATE["stack_capacity"]:
            stack.insert(0, obj_id)
            APP_STATE["active_field_object_id"] = None
            APP_STATE["field_object_cell"] = None
        return

    if direction == "right" and row == 0 and col == GRID_COLS - 1:
        stack = APP_STATE["io_stacks"]["right"]
        if len(stack) < APP_STATE["stack_capacity"]:
            stack.insert(0, obj_id)
            APP_STATE["active_field_object_id"] = None
            APP_STATE["field_object_cell"] = None
        return

    delta = {
        "up": (1, 0),
        "down": (-1, 0),
        "left": (0, -1),
        "right": (0, 1),
    }[direction]
    next_row = row + delta[0]
    next_col = col + delta[1]
    if next_row < 0 or next_row >= GRID_ROWS or next_col < 0 or next_col >= GRID_COLS:
        return

    APP_STATE["field_object_cell"] = {"r": next_row, "c": next_col}


def set_rotary_direction(row: int, col: int, direction: int) -> None:
    cell = APP_STATE["cell_state"][row][col]
    if cell["type"] != MODULE_ROTARY:
        raise HTTPException(status_code=409, detail="Selected cell is not a rotary module.")
    cell["dir"] = direction


def sync_layout(payload: LayoutSyncRequest) -> None:
    if len(payload.cell_state) != GRID_ROWS or any(len(row) != GRID_COLS for row in payload.cell_state):
        raise HTTPException(status_code=422, detail="Unexpected grid size.")

    normalized: List[List[Dict[str, int]]] = []
    for row in payload.cell_state:
        normalized_row: List[Dict[str, int]] = []
        for cell in row:
            if cell.type not in MODULE_TYPES:
                raise HTTPException(status_code=422, detail="Unsupported module type.")
            normalized_row.append({"type": cell.type, "dir": int(cell.dir)})
        normalized.append(normalized_row)

    APP_STATE["cell_state"] = normalized
    APP_STATE["active_crane_key"] = payload.active_crane_key
    APP_STATE["active_io_zone"] = payload.active_io_zone
    current_max = max(len(APP_STATE["io_stacks"]["left"]), len(APP_STATE["io_stacks"]["right"]), 1)
    APP_STATE["stack_capacity"] = max(current_max, payload.stack_capacity)


def build_snapshot() -> AppStateSnapshot:
    object_locations: Dict[int, ObjectSnapshot] = {}
    for obj_id, obj in APP_STATE["objects"].items():
        object_locations[obj_id] = ObjectSnapshot(id=obj_id, color=obj["color"], state="free", field_cell=None)

    for side, stack in APP_STATE["io_stacks"].items():
        for obj_id in stack:
            object_locations[obj_id].state = "in_stack_%s" % side

    for side, crane in APP_STATE["cranes"].items():
        obj_id = crane["holding_object_id"]
        if obj_id is not None:
            object_locations[obj_id].state = "in_crane_%s" % side

    for side in ("left", "right"):
        for slot in APP_STATE["warehouses"]["%s_slots" % side]:
            obj_id = slot["occupied_by"]
            if obj_id is not None:
                object_locations[obj_id].state = "on_shelf_%s" % side

    if APP_STATE["active_field_object_id"] is not None and APP_STATE["field_object_cell"] is not None:
        obj_id = APP_STATE["active_field_object_id"]
        cell = APP_STATE["field_object_cell"]
        object_locations[obj_id].state = object_lift_state(cell["r"], cell["c"])
        object_locations[obj_id].field_cell = GridCellRef(r=cell["r"], c=cell["c"])

    return AppStateSnapshot(
        edit_mode=APP_STATE["edit_mode"],
        active_crane_key=APP_STATE["active_crane_key"],
        active_io_zone=APP_STATE["active_io_zone"],
        stack_capacity=APP_STATE["stack_capacity"],
        next_obj_id=APP_STATE["next_obj_id"],
        cell_state=[[CellLayout(**cell) for cell in row] for row in APP_STATE["cell_state"]],
        io_stacks={
            "left": list(APP_STATE["io_stacks"]["left"]),
            "right": list(APP_STATE["io_stacks"]["right"]),
        },
        active_field_object_id=APP_STATE["active_field_object_id"],
        cranes={
            "left": CraneSnapshot(**APP_STATE["cranes"]["left"]),
            "right": CraneSnapshot(**APP_STATE["cranes"]["right"]),
        },
        warehouses=WarehouseSnapshot(
            left_slots=[SlotOccupancy(row=slot["row"], level=slot["level"], object_id=slot["occupied_by"]) for slot in APP_STATE["warehouses"]["left_slots"]],
            right_slots=[SlotOccupancy(row=slot["row"], level=slot["level"], object_id=slot["occupied_by"]) for slot in APP_STATE["warehouses"]["right_slots"]],
        ),
        objects=list(object_locations.values()),
    )


@app.get("/api/health", tags=["system"])
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/", tags=["system"])
def root() -> Dict[str, str]:
    return {
        "name": "GPL Virtual Stand API",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "state": "/api/state",
    }


@app.get("/api/state", response_model=AppStateSnapshot, tags=["state"])
def get_state() -> AppStateSnapshot:
    return build_snapshot()


@app.post("/api/mode", response_model=AppStateSnapshot, tags=["state"])
def set_mode(payload: ModeRequest) -> AppStateSnapshot:
    if payload.edit_mode:
        discard_active_field_object()

    APP_STATE["edit_mode"] = payload.edit_mode
    return build_snapshot()


@app.post("/api/layout/sync", response_model=AppStateSnapshot, tags=["layout"])
def sync_client_layout(payload: LayoutSyncRequest) -> AppStateSnapshot:
    sync_layout(payload)
    return build_snapshot()


@app.post("/api/layout/rotary/set-direction", response_model=AppStateSnapshot, tags=["layout"])
def set_rotary(payload: RotaryDirectionRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    set_rotary_direction(payload.r, payload.c, payload.direction)
    return build_snapshot()


@app.post("/api/scenario/randomize-warehouses", response_model=AppStateSnapshot, tags=["scenario"])
def randomize_warehouses(payload: RandomizeWarehousesRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    populate_random_warehouses(APP_STATE, payload.count_per_side, payload.seed)
    return build_snapshot()


@app.post("/api/io-zone", response_model=AppStateSnapshot, tags=["controls"])
def set_active_io_zone(payload: SideSelectionRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    APP_STATE["active_io_zone"] = payload.side
    return build_snapshot()


@app.post("/api/crane/select", response_model=AppStateSnapshot, tags=["controls"])
def set_active_crane(payload: SideSelectionRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    APP_STATE["active_crane_key"] = payload.side
    return build_snapshot()


@app.post("/api/stack-capacity", response_model=AppStateSnapshot, tags=["controls"])
def set_stack_capacity(payload: StackCapacityRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    current_max = max(len(APP_STATE["io_stacks"]["left"]), len(APP_STATE["io_stacks"]["right"]), 1)
    APP_STATE["stack_capacity"] = max(current_max, payload.capacity)
    return build_snapshot()


@app.post("/api/crane/move", response_model=AppStateSnapshot, tags=["controls"])
def move_active_crane(payload: MoveCraneRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    move_crane(payload.direction)
    return build_snapshot()


@app.post("/api/crane/rack-exchange", response_model=AppStateSnapshot, tags=["controls"])
def crane_rack_exchange() -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    rack_exchange()
    return build_snapshot()


@app.post("/api/crane/io-exchange", response_model=AppStateSnapshot, tags=["controls"])
def crane_io_exchange() -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    io_exchange()
    return build_snapshot()


@app.post("/api/io/launch", response_model=AppStateSnapshot, tags=["controls"])
def launch_from_io() -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    io_launch()
    return build_snapshot()


@app.post("/api/field/move", response_model=AppStateSnapshot, tags=["controls"])
def move_field(payload: MoveFieldObjectRequest) -> AppStateSnapshot:
    ensure_not_in_edit_mode()
    move_field_object(payload.direction)
    return build_snapshot()
