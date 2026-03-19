# The Pipe Nobody Told You About

You need Python from TypeScript. You reach for HTTP.

That was our first instinct too. The original architecture was a FastAPI server — `uvicorn`, Pydantic models, Docker-ready. Python listens on port 8000, TypeScript calls `fetch("http://localhost:8000/compute")`. It worked. Standard microservice pattern, language-agnostic, well-understood.

Then we ran the trading simulation. Two hundred and fifty calls to Python per simulated day, times two hundred and fifty trading days. Each HTTP round trip cost 2-5ms — TCP handshake, JSON serialization on both ends, the full network stack even for localhost. Sixty thousand calls later, we'd burned two minutes on overhead that had nothing to do with computation.

---

The replacement was embarrassingly simple. Spawn Python as a child process. Write JSON to its stdin. Read JSON from its stdout. No ports, no HTTP, no network stack.

```
TypeScript                          Python (child process)
===========                         ======================
bridge.start()  ──spawn──>          worker.py starts
                                    <── {"type":"ready","methods":["health","compute"]}
bridge.call()   ──stdin──>          {"id":"uuid","method":"compute","params":{...}}
                <──stdout──         {"id":"uuid","result":{...}}
bridge.stop()   ──close stdin──>    stdin EOF → exit
```

The protocol is JSON-RPC. Each request gets a UUID. Each response echoes that UUID back. The bridge stores pending promises in a Map keyed by ID, and when a response arrives, it resolves the matching promise. Multiple requests can be in flight simultaneously.

---

Three rules govern the pipe, and we discovered each one by breaking it.

**Rule 1: stdout is the RPC channel. Period.** Python's `print()` writes to stdout. So does `json.dumps()`. But stdout is how the bridge reads responses. One stray `print("debugging...")` in your Python code and the bridge chokes trying to parse `"debugging..."` as JSON. All logging goes to stderr. The bridge captures stderr separately and prints it with a prefix. This is the rule that cost us the most hours before we made it absolute.

**Rule 2: Unbuffered or dead.** Python buffers stdout by default. Your JSON response sits in a buffer waiting for... more data? A flush? The heat death of the universe? The fix is `python3 -u` (unbuffered mode) plus `sys.stdout.reconfigure(line_buffering=True)`. Belt and suspenders. Without both, the bridge hangs waiting for a response that's already been written but not flushed.

**Rule 3: The ready handshake.** The bridge spawns Python and immediately wants to send requests. But Python needs time to import modules, initialize state, connect to databases. Without a handshake, the first request arrives before the worker is listening. The worker sends `{"type":"ready","methods":["health","compute"]}` when it's ready. The bridge waits for this message before resolving `start()`. If it doesn't arrive within 5 seconds, we throw.

---

The Docker question is interesting. FastAPI gets its own container — clean separation, independent scaling. IPC means both runtimes share a container. Our Dockerfile adds one line to the runner stage:

```dockerfile
RUN apk add --no-cache python3
```

Alpine's Python 3 is 5MB. The worker uses only stdlib. No pip, no requirements.txt, no virtual environment. The trade-off is explicit: we gave up independent deployment for sub-millisecond latency and zero network configuration.

---

The final bridge class is 200 lines. The Python worker is 90. Volatio's production bridge is 462 lines — it adds PID tracking for crash recovery, progress message streaming, process tree cleanup for multiprocessing workers, and latency statistics. We don't need any of that yet. The protocol is identical. The complexity grows with the problems you actually have.

Here's when each approach wins:

FastAPI makes sense when multiple services call Python, when teams own services independently, when you want language-agnostic contracts, or when you need Python to scale horizontally.

stdin/stdout wins when one process calls Python, when latency matters, when you want the child process to die when the parent dies, and when zero-configuration deployment beats architectural purity.

We shipped a trading system that calls Python sixty thousand times per simulation. The pipe nobody talks about saved us two minutes per run — and eliminated an entire class of port-conflict, health-check, Docker-networking bugs that had nothing to do with trading.
