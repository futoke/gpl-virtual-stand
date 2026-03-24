import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from standlib import ApiError, ProgramConfig, run_program_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="External control scenario for GPL Virtual Stand API.")
    parser.add_argument(
        "--program",
        default=str(PROJECT_ROOT / "programs" / "default_transport.py"),
        help="Path to a Python program file that defines run(program)",
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="FastAPI base URL")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for warehouse fill and rotary choices")
    parser.add_argument("--process-delay", type=float, default=1.0, help="Delay in seconds inside process blocks")
    parser.add_argument("--step-delay", type=float, default=0.2, help="Delay in seconds between API steps")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = ProgramConfig(
        base_url=args.base_url,
        seed=args.seed,
        process_delay=args.process_delay,
        step_delay=args.step_delay,
    )

    try:
        run_program_file(args.program, config)
    except ApiError as exc:
        print(f"Scenario failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Program failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
