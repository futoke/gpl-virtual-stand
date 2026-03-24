import importlib.util
from pathlib import Path

from .api import StandApi
from .program import ProgramConfig, StandProgram


def load_program_callable(program_path: str):
    path = Path(program_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Program file not found: {path}")

    spec = importlib.util.spec_from_file_location("stand_user_program", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load program file: {path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    run_func = getattr(module, "run", None)
    if run_func is None or not callable(run_func):
        raise RuntimeError(f"Program file {path} must define callable run(program).")
    return run_func


def run_program_file(program_path: str, config: ProgramConfig):
    api = StandApi(config.base_url)
    program = StandProgram(api, config)
    run_func = load_program_callable(program_path)
    return run_func(program)