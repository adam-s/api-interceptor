"""Tests for the JSON-RPC worker."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

# Import handler functions directly for unit tests
sys.path.insert(0, str(Path(__file__).parent))
from worker import handle_health, handle_compute, handle_classify_headlines


# ---------------------------------------------------------------------------
# Unit tests — handler functions
# ---------------------------------------------------------------------------


class TestHealthHandler:
    def test_returns_ok(self):
        result = handle_health({})
        assert result["status"] == "ok"
        assert result["service"] == "python-worker"
        assert "version" in result


class TestComputeHandler:
    def test_basic_stats(self):
        result = handle_compute({"numbers": [1, 2, 3, 4, 5]})
        assert result["mean"] == 3.0
        assert result["median"] == 3.0
        assert result["min"] == 1.0
        assert result["max"] == 5.0
        assert result["count"] == 5
        assert result["stdev"] > 0

    def test_single_number(self):
        result = handle_compute({"numbers": [42]})
        assert result["mean"] == 42.0
        assert result["stdev"] == 0.0
        assert result["count"] == 1

    def test_floats(self):
        result = handle_compute({"numbers": [1.5, 2.5, 3.5]})
        assert result["mean"] == 2.5
        assert result["median"] == 2.5

    def test_missing_numbers_raises(self):
        with pytest.raises(ValueError, match="non-empty list"):
            handle_compute({})

    def test_empty_list_raises(self):
        with pytest.raises(ValueError, match="non-empty list"):
            handle_compute({"numbers": []})

    def test_non_list_raises(self):
        with pytest.raises(ValueError, match="non-empty list"):
            handle_compute({"numbers": "not a list"})


class TestClassifyHeadlines:
    def test_positive_headline(self):
        result = handle_classify_headlines({
            "headlines": [{"id": "1", "title": "New open source AI breakthrough released"}]
        })
        assert result["classifications"][0]["sentiment"]["label"] == "positive"
        assert "ai" in result["classifications"][0]["topics"]

    def test_negative_headline(self):
        result = handle_classify_headlines({
            "headlines": [{"id": "2", "title": "Major breach hack vulnerability exploit"}]
        })
        assert result["classifications"][0]["sentiment"]["label"] == "negative"
        assert "security" in result["classifications"][0]["topics"]

    def test_neutral_headline(self):
        result = handle_classify_headlines({
            "headlines": [{"id": "3", "title": "Show HN: My weekend project"}]
        })
        assert result["classifications"][0]["sentiment"]["label"] == "neutral"

    def test_batch(self):
        result = handle_classify_headlines({
            "headlines": [
                {"id": "1", "title": "New open source launch"},
                {"id": "2", "title": "Company died after hack"},
                {"id": "3", "title": "Ask HN: What editor do you use?"},
            ]
        })
        assert result["summary"]["total"] == 3
        assert result["summary"]["sentiment"]["positive"] >= 1
        assert result["summary"]["sentiment"]["negative"] >= 1

    def test_topic_detection(self):
        result = handle_classify_headlines({
            "headlines": [{"id": "1", "title": "Rust compiler improvements for Linux kernel"}]
        })
        topics = result["classifications"][0]["topics"]
        assert "systems" in topics

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="non-empty list"):
            handle_classify_headlines({})


# ---------------------------------------------------------------------------
# Integration tests — full JSON-RPC over stdin/stdout
# ---------------------------------------------------------------------------


class TestJsonRpc:
    """Spawn the worker as a subprocess and communicate via JSON-RPC."""

    def _rpc(self, process: subprocess.Popen, method: str, params: dict) -> dict:
        """Send a JSON-RPC request and read the response."""
        request = json.dumps({"id": "test-1", "method": method, "params": params})
        process.stdin.write(request + "\n")
        process.stdin.flush()
        line = process.stdout.readline()
        return json.loads(line)

    @pytest.fixture
    def worker(self):
        """Start the worker subprocess, yield it, then clean up."""
        proc = subprocess.Popen(
            [sys.executable, str(Path(__file__).parent / "worker.py")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={"NODE_ENV": "test", "PATH": ""},
        )
        # Read the ready handshake
        ready_line = proc.stdout.readline()
        ready = json.loads(ready_line)
        assert ready["type"] == "ready"

        yield proc

        proc.stdin.close()
        proc.wait(timeout=5)

    def test_health_rpc(self, worker):
        response = self._rpc(worker, "health", {})
        assert response["id"] == "test-1"
        assert response["result"]["status"] == "ok"

    def test_compute_rpc(self, worker):
        response = self._rpc(worker, "compute", {"numbers": [10, 20, 30]})
        assert response["result"]["mean"] == 20.0
        assert response["result"]["count"] == 3

    def test_unknown_method(self, worker):
        response = self._rpc(worker, "nonexistent", {})
        assert "error" in response
        assert response["error"]["code"] == -32601

    def test_compute_error(self, worker):
        response = self._rpc(worker, "compute", {})
        assert "error" in response
        assert response["error"]["code"] == -1
