#!/usr/bin/env python3
"""JSON-RPC worker over stdin/stdout.

Protocol:
  Request:  {"id": "uuid", "method": "method_name", "params": {...}}\\n
  Response: {"id": "uuid", "result": {...}}\\n
  Error:    {"id": "uuid", "error": {"code": -1, "message": "..."}}\\n

CRITICAL: All logging goes to stderr. stdout is the RPC channel —
one stray print() and the bridge hangs trying to parse your log line as JSON.
"""

import json
import os
import sys
import statistics as stats
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# DEBUG — matches the TypeScript DEBUG() in packages/shared/src/debug.ts
#
# Writes to stderr (cyan) + /tmp/deep-research-debug/debug-YYYY-MM-DD.log.
# Same format as TypeScript so both runtimes produce interleaved, grep-able output.
# ---------------------------------------------------------------------------

DEBUG_DIR = Path("/tmp/deep-research-debug")
_DEBUG_ENABLED = (
    os.environ.get("DEBUG_LOGGING", "").lower() == "true"
    or os.environ.get("NODE_ENV", "").lower() not in ("production", "test")
)


def DEBUG(
    location_or_message: str,
    message_or_data: "str | Callable[[], dict[str, Any]] | None" = None,
    data_factory: "Callable[[], dict[str, Any]] | None" = None,
) -> None:
    """Unified debug logging — mirrors TypeScript DEBUG() exactly."""
    if not _DEBUG_ENABLED:
        return

    location: str | None = None
    message: str
    factory: Callable[[], dict[str, Any]] | None = None

    if callable(message_or_data):
        location = location_or_message
        message = "debug"
        factory = message_or_data
    elif isinstance(message_or_data, str):
        location = location_or_message
        message = message_or_data
        factory = data_factory
    else:
        message = location_or_message

    data: dict[str, Any] | None = None
    if factory:
        try:
            data = factory()
        except Exception as e:
            data = {"_error": str(e)}

    timestamp = datetime.now().isoformat()
    location_str = f"[{location}] " if location else ""
    data_str = f" {json.dumps(data, default=str)}" if data else ""
    line = f"[{timestamp}] [DEBUG] {location_str}{message}{data_str}"

    # stderr — captured by the bridge, never touches stdout/IPC
    print(f"\033[36m{line}\033[0m", file=sys.stderr, flush=True)

    # File — same path as TypeScript, interleaved in one timeline
    try:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        date = datetime.now().strftime("%Y-%m-%d")
        file_path = DEBUG_DIR / f"debug-{date}.log"
        with open(file_path, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# JSON-RPC worker
# ---------------------------------------------------------------------------

METHODS: dict[str, str] = {
    "health": "handle_health",
    "compute": "handle_compute",
}


def handle_health(_params: dict[str, Any]) -> dict[str, Any]:
    return {"status": "ok", "service": "python-worker", "version": "1.0.0"}


def handle_compute(params: dict[str, Any]) -> dict[str, Any]:
    numbers = params.get("numbers")
    if not numbers or not isinstance(numbers, list):
        raise ValueError("'numbers' must be a non-empty list")

    floats = [float(n) for n in numbers]
    result: dict[str, Any] = {
        "mean": stats.mean(floats),
        "median": stats.median(floats),
        "min": min(floats),
        "max": max(floats),
        "count": len(floats),
    }
    if len(floats) >= 2:
        result["stdev"] = stats.stdev(floats)
    else:
        result["stdev"] = 0.0

    DEBUG("worker.compute", "computed stats", lambda: {
        "count": len(floats), "mean": result["mean"]
    })

    return result


def send(obj: dict[str, Any]) -> None:
    """Write a JSON line to stdout (the RPC channel)."""
    print(json.dumps(obj), flush=True)


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

    # Ready handshake — the bridge waits for this before sending requests
    send({"type": "ready", "methods": list(METHODS.keys())})
    DEBUG("worker", "ready, waiting for requests")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            DEBUG("worker", f"parse error: {e}")
            continue

        request_id = request.get("id", "unknown")
        method = request.get("method", "")
        params = request.get("params", {})

        if method not in METHODS:
            send({
                "id": request_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"},
            })
            continue

        try:
            handler = globals()[METHODS[method]]
            result = handler(params)
            send({"id": request_id, "result": result})
        except Exception as e:
            DEBUG("worker", f"error in {method}: {e}")
            send({
                "id": request_id,
                "error": {"code": -1, "message": str(e)},
            })

    DEBUG("worker", "stdin closed, exiting")


if __name__ == "__main__":
    main()
