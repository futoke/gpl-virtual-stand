import random
from typing import Dict, List, Optional, Tuple

from .api import ApiError


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
