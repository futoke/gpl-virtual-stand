import random
import time
from typing import Dict

from .api import ApiError, StandApi
from .routing import (
    LEFT_IO_CELL,
    RIGHT_IO_CELL,
    cell_dir,
    cell_type,
    choose_rotary_exit,
    find_adjacent_output,
    in_bounds,
    neighbor,
)


class StandController:
    def __init__(self, api: StandApi, seed: int = 42, process_delay: float = 1.0, step_delay: float = 0.2):
        self.api = api
        self.seed = seed
        self.rng = random.Random(seed)
        self.process_delay = process_delay
        self.step_delay = step_delay
        self.state = self.api.get("/api/state")

    def sleep_step(self) -> None:
        time.sleep(self.step_delay)

    def refresh(self) -> Dict:
        self.state = self.api.get("/api/state")
        return self.state

    def get_state(self) -> Dict:
        return self.refresh()

    def select_io(self, side: str) -> Dict:
        self.state = self.api.post("/api/io-zone", {"side": side})
        return self.state

    def select_crane(self, side: str) -> Dict:
        self.state = self.api.post("/api/crane/select", {"side": side})
        return self.state

    def set_stack_capacity(self, capacity: int) -> Dict:
        self.state = self.api.post("/api/stack-capacity", {"capacity": capacity})
        return self.state

    def randomize_warehouses(self, count_per_side: int = 18, seed: int = None) -> Dict:
        self.state = self.api.post(
            "/api/scenario/randomize-warehouses",
            {"count_per_side": count_per_side, "seed": self.seed if seed is None else seed},
        )
        return self.state

    def move_crane_to(self, side: str, target_row: int, target_level: int) -> Dict:
        if self.state["active_crane_key"] != side:
            self.state = self.api.post("/api/crane/select", {"side": side})

        crane = self.state["cranes"][side]

        while crane["row"] < target_row:
            self.state = self.api.post("/api/crane/move", {"direction": "right"})
            crane = self.state["cranes"][side]
            self.sleep_step()
        while crane["row"] > target_row:
            self.state = self.api.post("/api/crane/move", {"direction": "left"})
            crane = self.state["cranes"][side]
            self.sleep_step()
        while crane["level"] < target_level:
            self.state = self.api.post("/api/crane/move", {"direction": "up"})
            crane = self.state["cranes"][side]
            self.sleep_step()
        while crane["level"] > target_level:
            self.state = self.api.post("/api/crane/move", {"direction": "down"})
            crane = self.state["cranes"][side]
            self.sleep_step()

        return self.state

    def rack_exchange(self) -> Dict:
        self.state = self.api.post("/api/crane/rack-exchange")
        self.sleep_step()
        return self.state

    def io_exchange(self) -> Dict:
        self.state = self.api.post("/api/crane/io-exchange")
        self.sleep_step()
        return self.state

    def launch_from_io(self) -> Dict:
        self.state = self.api.post("/api/io/launch")
        self.sleep_step()
        return self.state

    def route_active_object(self) -> Dict:
        prev_cell = None
        visited = set()

        while self.state["active_field_object_id"] is not None:
            active_object = next(obj for obj in self.state["objects"] if obj["id"] == self.state["active_field_object_id"])
            current = active_object.get("field_cell")
            if current is None:
                raise ApiError("Active field object has no field_cell in snapshot.")

            row, col = current["r"], current["c"]
            cell = self.state["cell_state"][row][col]
            step_key = (row, col, prev_cell)
            if step_key in visited:
                raise ApiError(f"Detected loop while routing object at cell ({row}, {col}).")
            visited.add(step_key)

            if (row, col) == RIGHT_IO_CELL:
                if cell["type"] == "rotary" and cell_dir(self.state, row, col) != 1:
                    self.state = self.api.post(
                        "/api/layout/rotary/set-direction",
                        {"r": row, "c": col, "direction": 1},
                    )
                    self.sleep_step()
                elif cell["type"] == "conveyor" and cell_dir(self.state, row, col) != 1:
                    raise ApiError("Final conveyor before right IO does not point to the unload zone.")

                self.state = self.api.post("/api/field/move", {"direction": "right"})
                self.sleep_step()
                break

            if cell["type"] == "conveyor":
                direction = cell_dir(self.state, row, col)
            elif cell["type"] == "process":
                time.sleep(self.process_delay)
                direction = find_adjacent_output(self.state, row, col, prev_cell)
            elif cell["type"] == "rotary":
                direction = choose_rotary_exit(self.state, row, col, prev_cell, self.rng)
                if cell_dir(self.state, row, col) != direction:
                    self.state = self.api.post(
                        "/api/layout/rotary/set-direction",
                        {"r": row, "c": col, "direction": direction},
                    )
                    self.sleep_step()
            else:
                direction = find_adjacent_output(self.state, row, col, prev_cell)

            next_row, next_col, api_direction = neighbor(row, col, direction)
            if not in_bounds(next_row, next_col):
                raise ApiError(f"Next move from ({row}, {col}) goes out of bounds.")
            if cell_type(self.state, next_row, next_col) == "empty" and (next_row, next_col) != RIGHT_IO_CELL:
                raise ApiError(f"Route from ({row}, {col}) leads to empty cell ({next_row}, {next_col}).")

            if in_bounds(next_row, next_col) and cell_type(self.state, next_row, next_col) == "rotary":
                if cell_dir(self.state, next_row, next_col) != direction:
                    self.state = self.api.post(
                        "/api/layout/rotary/set-direction",
                        {"r": next_row, "c": next_col, "direction": direction},
                    )
                    self.sleep_step()

            prev_cell = (row, col)
            self.state = self.api.post("/api/field/move", {"direction": api_direction})
            self.sleep_step()

        return self.refresh()

    def load_io_from_rack(self, side: str, object_count: int) -> Dict:
        slots_key = f"{side}_slots"
        occupied_slots = [slot for slot in self.state["warehouses"][slots_key] if slot["object_id"] is not None]
        if len(occupied_slots) < object_count:
            raise ApiError(f"{side.capitalize()} warehouse contains only {len(occupied_slots)} objects, need {object_count}.")

        io_row = LEFT_IO_CELL[0] if side == "left" else RIGHT_IO_CELL[0]
        for slot in occupied_slots[:object_count]:
            self.move_crane_to(side, slot["row"], slot["level"])
            self.rack_exchange()
            self.move_crane_to(side, io_row, 0)
            self.io_exchange()

        return self.state

    def unload_io_to_rack(self, side: str, object_count: int) -> Dict:
        slots_key = f"{side}_slots"
        free_slots = [slot for slot in self.state["warehouses"][slots_key] if slot["object_id"] is None]
        if len(free_slots) < object_count:
            raise ApiError(f"{side.capitalize()} warehouse has only {len(free_slots)} free slots, need {object_count}.")

        io_row = LEFT_IO_CELL[0] if side == "left" else RIGHT_IO_CELL[0]
        for slot in free_slots[:object_count]:
            self.move_crane_to(side, io_row, 0)
            self.io_exchange()
            self.move_crane_to(side, slot["row"], slot["level"])
            self.rack_exchange()

        return self.state
