#!/usr/bin/env bash
# write-handoff.sh — Template for the handoff file.
#
# The orchestrator fills in the results before ending a session.
# The next session reads this to pick up where the previous left off.
#
# Usage: bash .claude/skills/instruction-tuning/scripts/write-handoff.sh > .claude/tuning-handoff.md
cat << 'TEMPLATE'
# Instruction Tuning Handoff

## Current Iteration: [N]

## Results Table

| Agent | Tokens | Time | Routes | Elimination (8/8?) | New transports |
|-------|--------|------|--------|-------------------|----------------|
| Ticketmaster | | | | | |
| StubHub | | | | | |
| Airbnb | | | | | |
| Yahoo Finance | | | | | |
| Twitch | | | | | |
| YouTube | | | | | |
| Hacker News | | | | | |

## What Changed This Session

- [commit hash] [one-line summary]

## What's Next

- [ ] [specific item]

## How to Launch Next Iteration

```bash
bash .claude/hooks/cleanup-agents.sh
bash .claude/skills/instruction-tuning/scripts/run-iteration.sh [N+1]
```
TEMPLATE
