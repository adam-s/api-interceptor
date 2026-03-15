# Teaching an AI Where to Look

The counter was frozen. I clicked the plus button — the network tab showed 200 OK — but the number on the screen didn't move. The SSE stream was connected. The server was running. The multiplier controls did nothing.

This was the state module from the previous exploration: server holds a number, ticks it every second, pushes it to connected clients via Server-Sent Events. It had been working for days. Somewhere during a refactor, two lines got swapped and everything broke.

---

I asked Claude Code to figure out why the counter wasn't updating. It read the route handler. It read the state module. It checked the EventSource connection logic on the client. It suggested the interval might not be starting. It suggested the client might not be parsing the SSE events correctly.

Reasonable guesses, all wrong. The agent was doing what anyone would do with an unfamiliar codebase — reading code and reasoning about what could go wrong. But the bug wasn't visible from the code. It was a two-line ordering problem in `broadcast()` that looked correct at a glance:

```typescript
lastJson = json;
if (lastJson === json) return;
```

Set `lastJson` to `json`, then ask if they're equal. Always equal. Every broadcast suppressed. The client gets its initial state on connect, then silence.

You'd have to notice the assignment moved above the comparison. From reading the code, the condition `lastJson === json` looks like a reasonable dedup check. The names are right. The logic is right. The order is wrong.

---

What the agent needed wasn't more reading time. It needed runtime evidence.

I'd built a DEBUG() module — 50 lines, writes timestamped entries to `/tmp/deep-research-debug/state-YYYY-MM-DD.log`, disabled in test and production. The function itself isn't interesting. What's interesting is that nobody had imported it yet. The state module was clean. No logging. No breadcrumbs.

So I wrote a skill file. Not a cheat sheet of known bugs — a method. Forty lines of markdown in `.claude/skills/debug-logs/SKILL.md` that teaches the agent a process:

1. **Hypothesize.** What's the symptom? What code path produces the broken output? Which functions sit between input and result?
2. **Instrument.** Add 2-4 DEBUG() calls in the suspected area. Log the values that would confirm or reject the hypothesis. Don't blanket the codebase — be surgical.
3. **Reproduce and read.** Run the code, trigger the bug, read the log file.
4. **Narrow or widen.** If the logs show expected behavior, the bug is elsewhere — move the calls. If you see something unexpected, add more calls to pinpoint exactly where.
5. **Clean up.** After the fix, remove the DEBUG() calls that were only useful for this investigation. Keep one only if it captures something that's hard to reason about from code alone.

That's the whole skill. It doesn't know what bugs exist. It doesn't have a lookup table of symptoms and fixes. It teaches the agent to do what a senior developer does instinctively — form a theory, gather evidence, adjust.

---

I introduced the bug again and told Claude Code I couldn't figure out why the counter was frozen. This time the skill was loaded. The agent didn't just read the code. It formed a hypothesis: the broadcast function might not be sending updates. It added two DEBUG() calls — one in `tick()`, one in `broadcast()`:

```typescript
function tick(): void {
  count += multiplier;
  DEBUG("tick", () => ({ count, multiplier }));
  broadcast();
}

function broadcast(): void {
  const state = getState();
  const json = JSON.stringify(state);
  DEBUG("broadcast", () => ({ count: state.count, jsonMatch: json === lastJson }));
  if (json === lastJson) return;
  lastJson = json;
  // ...
}
```

Two calls. Not six, not twelve. Two, in the two functions the hypothesis pointed at.

It started the dev server, connected a client, and read the log:

```text
[DEBUG] [tick] {"count":1,"multiplier":1}
[DEBUG] [broadcast] {"count":1,"jsonMatch":true}
[DEBUG] [tick] {"count":2,"multiplier":1}
[DEBUG] [broadcast] {"count":2,"jsonMatch":true}
```

Count incrementing. `jsonMatch` always true. The tick runs but every broadcast exits early. The agent looked at `broadcast()`, saw `lastJson = json` above the comparison, swapped the two lines, and removed the DEBUG() calls.

---

The difference between the first attempt and the second wasn't capability. The agent could read files both times. It could reason about code both times. What changed was that it had a method for gathering evidence instead of just making deductions.

The DEBUG() module was 50 lines. The skill was 40. The fix was a two-line swap. The gap between "can't figure it out" and "finds it in two iterations" was ninety lines of infrastructure that had nothing to do with the bug itself.
