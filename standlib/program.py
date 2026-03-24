from dataclasses import dataclass
from typing import Dict

from .api import StandApi
from .controller import StandController


@dataclass
class ProgramConfig:
    base_url: str = "http://127.0.0.1:8000"
    seed: int = 42
    process_delay: float = 1.0
    step_delay: float = 0.2
    verbose: bool = True


class StandProgram:
    def __init__(self, api: StandApi, config: ProgramConfig):
        self.api = api
        self.config = config
        self.controller = StandController(
            api=api,
            seed=config.seed,
            process_delay=config.process_delay,
            step_delay=config.step_delay,
        )

    @property
    def state(self) -> Dict:
        return self.controller.state

    def log(self, message: str) -> None:
        if self.config.verbose:
            print(message)

    def refresh(self) -> Dict:
        return self.controller.refresh()

    def ensure_api_mode(self) -> Dict:
        state = self.refresh()
        if state["edit_mode"]:
            raise RuntimeError("Stand is still in edit mode. Finish editing and switch to API mode first.")
        return state

    def set_stack_capacity(self, capacity: int) -> Dict:
        self.log(f"Setting IO stack capacity to {capacity}...")
        return self.controller.set_stack_capacity(capacity)

    def randomize_warehouses(self, count_per_side: int = 18, seed: int = None) -> Dict:
        self.log(f"Randomizing warehouses with {count_per_side} objects per side...")
        return self.controller.randomize_warehouses(count_per_side=count_per_side, seed=seed)

    def select_io(self, side: str) -> Dict:
        self.log(f"Selecting {side} IO zone...")
        return self.controller.select_io(side)

    def select_crane(self, side: str) -> Dict:
        self.log(f"Selecting {side} crane...")
        return self.controller.select_crane(side)

    def move_crane_to(self, side: str, row: int, level: int) -> Dict:
        self.log(f"Moving {side} crane to row={row}, level={level}...")
        return self.controller.move_crane_to(side, row, level)

    def load_io_from_rack(self, side: str, count: int) -> Dict:
        self.log(f"Loading {count} objects from {side} rack into {side} IO...")
        return self.controller.load_io_from_rack(side, count)

    def unload_io_to_rack(self, side: str, count: int) -> Dict:
        self.log(f"Unloading {count} objects from {side} IO into {side} rack...")
        return self.controller.unload_io_to_rack(side, count)

    def launch_from_io(self, side: str = None) -> Dict:
        if side is not None:
            self.select_io(side)
        self.log("Launching object from IO zone onto the field...")
        return self.controller.launch_from_io()

    def route_active_object(self) -> Dict:
        self.log("Routing active object across the field...")
        return self.controller.route_active_object()

    def route_many_from_left_to_right(self, count: int) -> Dict:
        for index in range(count):
            self.log(f"Routing object {index + 1}/{count}...")
            self.launch_from_io("left")
            if self.state["active_field_object_id"] is None:
                raise RuntimeError("Launch from left IO failed: no active field object.")
            self.route_active_object()
        return self.state
