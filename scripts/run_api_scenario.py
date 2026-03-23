import argparse
import json
import random
import sys
import time
from typing import Dict, List, Optional, Tuple
from urllib import error, request


GRID_ROWS = 6
GRID_COLS = 9
LEFT_IO_CELL = (GRID_ROWS - 1, 0)
RIGHT_IO_CELL = (0, GRID_COLS - 1)

DIR_TO_DELTA = {
    0: (1, 0, "up"),
    1: (0, 1, "right"),
    2: (-1, 0, "down"),
    3: (0, -1, "left"),
}

class ApiError(RuntimeError):
    pass


class StandApi:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def get(self, path: str) -> Dict:
        req = request.Request(f"{self.base_url}{path}", method="GET")
        return self._send(req)

    def post(self, path: str, payload: Optional[Dict] = None) -> Dict:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return self._send(req)

    def _send(self, req: request.Request) -> Dict:
        try:
            with request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8")
            raise ApiError(f"{req.method} {req.full_url} failed: {exc.code} {details}") from exc
        except error.URLError as exc:
            raise ApiError(f"Cannot reach API at {self.base_url}: {exc.reason}") from exc


def cell_type(state: Dict, row: int, col: int) -> str:
    return state["cell_state"][row][col]["type"]


def cell_dir(state: Dict, row: int, col: int) -> int:
    return state["cell_state"][row][col]["dir"]


def in_bounds(row: int, col: int) -> bool:
    return 0 <= row < GRID_ROWS and 0 <= col < GRID_COLS


def neighbor(row: int, col: int, direction: int) -> Tuple[int, int, str]:
    dr, dc, api_direction = DIR_TO_DELTA[direction]
    return row + dr, col + dc, api_direction


def is_special_io_cell(row: int, col: int) -> bool:
    return (row, col) == LEFT_IO_CELL or (row, col) == RIGHT_IO_CELL


def traversable_neighbor_directions(state: Dict, row: int, col: int) -> List[int]:
    directions = []
    for direction in range(4):
        next_row, next_col, _ = neighbor(row, col, direction)
        if not in_bounds(next_row, next_col):
            continue
        if cell_type(state, next_row, next_col) != "empty" or is_special_io_cell(next_row, next_col):
            directions.append(direction)
    return directions


def candidate_directions(state: Dict, row: int, col: int, prev_cell: Optional[Tuple[int, int]]) -> List[int]:
    cell_kind = cell_type(state, row, col)

    if cell_kind == "conveyor":
        direction = cell_dir(state, row, col)
        next_row, next_col, _ = neighbor(row, col, direction)
        if in_bounds(next_row, next_col) and (cell_type(state, next_row, next_col) != "empty" or is_special_io_cell(next_row, next_col)):
            return [direction]
        return []

    directions = []
    for direction in traversable_neighbor_directions(state, row, col):
        next_row, next_col, _ = neighbor(row, col, direction)
        if prev_cell is not None and (next_row, next_col) == prev_cell:
            continue
        directions.append(direction)
    return directions


def shortest_distance_to_right_io(
    state: Dict,
    row: int,
    col: int,
    prev_cell: Optional[Tuple[int, int]],
    memo: Dict[Tuple[int, int, Optional[Tuple[int, int]]], Optional[int]],
    visiting: set,
) -> Optional[int]:
    if (row, col) == RIGHT_IO_CELL:
        return 0

    key = (row, col, prev_cell)
    if key in memo:
        return memo[key]
    if key in visiting:
        return None

    visiting.add(key)
    best = None

    for direction in candidate_directions(state, row, col, prev_cell):
        next_row, next_col, _ = neighbor(row, col, direction)
        if not in_bounds(next_row, next_col):
            continue
        if cell_type(state, next_row, next_col) == "empty" and not is_special_io_cell(next_row, next_col):
            continue

        child_distance = shortest_distance_to_right_io(
            state,
            next_row,
            next_col,
            (row, col),
            memo,
            visiting,
        )
        if child_distance is None:
            continue

        distance = 1 + child_distance
        if best is None or distance < best:
            best = distance

    visiting.remove(key)
    memo[key] = best
    return best


def find_adjacent_output(state: Dict, row: int, col: int, prev_cell: Optional[Tuple[int, int]]) -> int:
    candidates = candidate_directions(state, row, col, prev_cell)

    if len(candidates) == 1:
        return candidates[0]

    if not candidates:
        raise ApiError(f"No valid forward neighbor from cell ({row}, {col}).")

    ranked = []
    memo: Dict[Tuple[int, int, Optional[Tuple[int, int]]], Optional[int]] = {}
    for direction in candidates:
        next_row, next_col, _ = neighbor(row, col, direction)
        distance = shortest_distance_to_right_io(state, next_row, next_col, (row, col), memo, set())
        if distance is not None:
            ranked.append((distance, direction))

    if ranked:
        ranked.sort(key=lambda item: item[0])
        return ranked[0][1]

    raise ApiError(f"Ambiguous forward neighbor from cell ({row}, {col}). No route to right IO found.")


def choose_rotary_exit(state: Dict, row: int, col: int, prev_cell: Optional[Tuple[int, int]], rng: random.Random) -> int:
    candidates = candidate_directions(state, row, col, prev_cell)

    if not candidates:
        raise ApiError(f"Rotary at ({row}, {col}) has no valid exit.")

    ranked = []
    memo: Dict[Tuple[int, int, Optional[Tuple[int, int]]], Optional[int]] = {}
    for direction in candidates:
        next_row, next_col, _ = neighbor(row, col, direction)
        distance = shortest_distance_to_right_io(state, next_row, next_col, (row, col), memo, set())
        if distance is not None:
            ranked.append((distance, direction))

    if ranked:
        best_distance = min(item[0] for item in ranked)
        best_directions = [direction for distance, direction in ranked if distance == best_distance]
        return rng.choice(best_directions)

    return rng.choice(candidates)


def move_crane_to(api: StandApi, state: Dict, side: str, target_row: int, target_level: int, step_delay: float) -> Dict:
    if state["active_crane_key"] != side:
        state = api.post("/api/crane/select", {"side": side})

    crane = state["cranes"][side]

    while crane["row"] < target_row:
        state = api.post("/api/crane/move", {"direction": "right"})
        crane = state["cranes"][side]
        time.sleep(step_delay)
    while crane["row"] > target_row:
        state = api.post("/api/crane/move", {"direction": "left"})
        crane = state["cranes"][side]
        time.sleep(step_delay)
    while crane["level"] < target_level:
        state = api.post("/api/crane/move", {"direction": "up"})
        crane = state["cranes"][side]
        time.sleep(step_delay)
    while crane["level"] > target_level:
        state = api.post("/api/crane/move", {"direction": "down"})
        crane = state["cranes"][side]
        time.sleep(step_delay)

    return state


def load_left_io_stack(api: StandApi, state: Dict, object_count: int, step_delay: float) -> Dict:
    occupied_slots = [slot for slot in state["warehouses"]["left_slots"] if slot["object_id"] is not None]
    if len(occupied_slots) < object_count:
        raise ApiError(f"Left warehouse contains only {len(occupied_slots)} objects, need {object_count}.")

    for slot in occupied_slots[:object_count]:
        state = move_crane_to(api, state, "left", slot["row"], slot["level"], step_delay)
        state = api.post("/api/crane/rack-exchange")
        time.sleep(step_delay)
        state = move_crane_to(api, state, "left", LEFT_IO_CELL[0], 0, step_delay)
        state = api.post("/api/crane/io-exchange")
        time.sleep(step_delay)

    return state


def unload_right_io_stack(api: StandApi, state: Dict, object_count: int, step_delay: float) -> Dict:
    free_slots = [slot for slot in state["warehouses"]["right_slots"] if slot["object_id"] is None]
    if len(free_slots) < object_count:
        raise ApiError(f"Right warehouse has only {len(free_slots)} free slots, need {object_count}.")

    for slot in free_slots[:object_count]:
        state = move_crane_to(api, state, "right", RIGHT_IO_CELL[0], 0, step_delay)
        state = api.post("/api/crane/io-exchange")
        time.sleep(step_delay)
        state = move_crane_to(api, state, "right", slot["row"], slot["level"], step_delay)
        state = api.post("/api/crane/rack-exchange")
        time.sleep(step_delay)

    return state


def route_active_object(api: StandApi, state: Dict, rng: random.Random, process_delay: float, step_delay: float) -> Dict:
    prev_cell = None
    visited = set()

    while state["active_field_object_id"] is not None:
        active_object = next(obj for obj in state["objects"] if obj["id"] == state["active_field_object_id"])
        current = active_object.get("field_cell")
        if current is None:
            raise ApiError("Active field object has no field_cell in snapshot.")

        row, col = current["r"], current["c"]
        cell = state["cell_state"][row][col]
        step_key = (row, col, prev_cell)
        if step_key in visited:
            raise ApiError(f"Detected loop while routing object at cell ({row}, {col}).")
        visited.add(step_key)

        if (row, col) == RIGHT_IO_CELL:
            if cell["type"] == "rotary" and cell_dir(state, row, col) != 1:
                state = api.post(
                    "/api/layout/rotary/set-direction",
                    {"r": row, "c": col, "direction": 1},
                )
                time.sleep(step_delay)
            elif cell["type"] == "conveyor" and cell_dir(state, row, col) != 1:
                raise ApiError("Final conveyor before right IO does not point to the unload zone.")

            state = api.post("/api/field/move", {"direction": "right"})
            time.sleep(step_delay)
            break

        if cell["type"] == "conveyor":
            direction = cell_dir(state, row, col)
        elif cell["type"] == "process":
            time.sleep(process_delay)
            direction = find_adjacent_output(state, row, col, prev_cell)
        elif cell["type"] == "rotary":
            direction = choose_rotary_exit(state, row, col, prev_cell, rng)
            if cell_dir(state, row, col) != direction:
                state = api.post(
                    "/api/layout/rotary/set-direction",
                    {"r": row, "c": col, "direction": direction},
                )
                time.sleep(step_delay)
        else:
            direction = find_adjacent_output(state, row, col, prev_cell)

        next_row, next_col, api_direction = neighbor(row, col, direction)
        if not in_bounds(next_row, next_col):
            raise ApiError(f"Next move from ({row}, {col}) goes out of bounds.")
        if cell_type(state, next_row, next_col) == "empty" and (next_row, next_col) != RIGHT_IO_CELL:
            raise ApiError(f"Route from ({row}, {col}) leads to empty cell ({next_row}, {next_col}).")

        if in_bounds(next_row, next_col) and cell_type(state, next_row, next_col) == "rotary":
            if cell_dir(state, next_row, next_col) != direction:
                state = api.post(
                    "/api/layout/rotary/set-direction",
                    {"r": next_row, "c": next_col, "direction": direction},
                )
                time.sleep(step_delay)

        prev_cell = (row, col)
        state = api.post("/api/field/move", {"direction": api_direction})
        time.sleep(step_delay)

    return api.get("/api/state")


def transport_four_objects(api: StandApi, process_delay: float, step_delay: float, seed: int, object_count: int) -> None:
    rng = random.Random(seed)
    state = api.get("/api/state")
    if state["edit_mode"]:
        raise ApiError("Stand is still in edit mode. Finish editing and switch to API mode first.")

    state = api.post("/api/stack-capacity", {"capacity": max(4, object_count)})
    state = api.post("/api/scenario/randomize-warehouses", {"count_per_side": 18, "seed": seed})
    state = api.post("/api/io-zone", {"side": "left"})

    print("Loading objects from left rack into left IO stack...")
    state = load_left_io_stack(api, state, object_count, step_delay)

    for index in range(object_count):
        print(f"Routing object {index + 1}/{object_count} across the field...")
        state = api.post("/api/io-zone", {"side": "left"})
        state = api.post("/api/io/launch")
        if state["active_field_object_id"] is None:
            raise ApiError("Launch from left IO failed: no active field object.")
        state = route_active_object(api, state, rng, process_delay, step_delay)

    print("Unloading objects from right IO stack into right rack...")
    state = unload_right_io_stack(api, state, object_count, step_delay)

    right_stack_size = len(state["io_stacks"]["right"])
    if right_stack_size != 0:
        raise ApiError(f"Scenario finished with {right_stack_size} objects still in right IO stack.")

    print("Scenario completed successfully.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="External control scenario for GPL Virtual Stand API.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="FastAPI base URL")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for warehouse fill and rotary choices")
    parser.add_argument("--count", type=int, default=4, help="How many objects to transport")
    parser.add_argument("--process-delay", type=float, default=1.0, help="Delay in seconds inside process blocks")
    parser.add_argument("--step-delay", type=float, default=0.2, help="Delay in seconds between API steps")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api = StandApi(args.base_url)

    try:
        transport_four_objects(
            api=api,
            process_delay=args.process_delay,
            step_delay=args.step_delay,
            seed=args.seed,
            object_count=args.count,
        )
    except ApiError as exc:
        print(f"Scenario failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
