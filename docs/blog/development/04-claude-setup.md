# A Complete Guide to the .claude Directory

Claude Code reads configuration from a `.claude/` directory in your project root. Permissions, custom workflows, and shared settings all live here. Before explaining any of it, here's the full structure from a working project:

```
.claude/
  settings.json              # committed — team-wide permissions
  settings.local.json        # gitignored — per-user auto-approvals
  skills/
    ci-check/
      SKILL.md               # committed — invoked with /ci-check

CLAUDE.md                    # repo root — project instructions

~/.claude/projects/<hash>/memory/
  MEMORY.md                  # auto-managed — outside the repo
  topic-file.md              # detailed notes, linked from MEMORY.md
```

Three categories of files. Three different lifecycles.

Let's break down each one.

---

## Table of Contents

- [File lifecycle overview](#file-lifecycle-overview)
- [CLAUDE.md](#claudemd)
  - [What belongs](#what-belongs-in-claudemd)
  - [What doesn't belong](#what-does-not-belong-in-claudemd)
- [settings.json](#settingsjson)
  - [Permission format](#permission-format)
  - [What to auto-approve](#what-to-auto-approve)
  - [What not to auto-approve](#what-not-to-auto-approve)
- [settings.local.json](#settingslocaljson)
- [Skills](#skills)
  - [Skill format](#skill-format)
  - [Where skills live](#where-skills-live)
  - [Writing a skill](#writing-a-skill)
- [Common patterns](#common-patterns)

---

## File lifecycle overview

Every file in the Claude Code ecosystem falls into one of three categories:

| Category | Files | Lifecycle |
|----------|-------|-----------|
| **Committed** | `settings.json`, `skills/`, `CLAUDE.md` | Checked into git, shared with the team, versioned alongside the code |
| **Gitignored** | `settings.local.json` | Per-user, auto-generated as you approve tool calls. Never commit this |
| **External** | `~/.claude/projects/<hash>/memory/` | Managed by Claude Code, lives outside the repo. Persists across sessions but personal to each user |

The committed files define what the editor *can* do. The gitignored file records what you *let* it do. The external files remember what it *learned*.

---

## CLAUDE.md

A markdown file at the repo root that Claude Code reads on every session. It's a README for the editor — the context it needs to be useful immediately.

### Example

```markdown
# Interceptor

pnpm + Turborepo monorepo for API interception and discovery.

## Commands

- `./scripts/ci-local.sh` — Run full CI locally
- `pnpm turbo build` — Build all packages
- `pnpm turbo typecheck` — Type-check all packages

## CI

**Always run `./scripts/ci-local.sh` before committing.**
Use `/ci-check` to diagnose failures.
```

### What belongs in CLAUDE.md

- **Project structure** — what lives where, package names, workspace layout
- **Common commands** — the four or five commands you run most often
- **Conventions** — branch naming, commit message style, where files go
- **Pointers to skills** — so the editor knows what workflows are available
- **Domain summaries** — style guides, API conventions, anything the editor needs to pick the right approach

### What does NOT belong in CLAUDE.md

- **Session-specific context** — what you're working on right now, current debugging state
- **Frequently changing values** — version numbers, current branch, active session IDs
- **Duplicates of code comments** — if the code explains itself, don't repeat it here

The line between CLAUDE.md and code comments is the same as the line between a README and inline docs. CLAUDE.md is for the things you'd tell a new team member on their first day.

---

## settings.json

Pre-approves specific command patterns for everyone on the team. Claude Code asks permission before running commands — this is the right default — but `settings.json` removes the friction for safe, repeated commands.

### Permission format

```json
{
  "permissions": {
    "allow": [
      "Bash(./scripts/ci-local.sh:*)",
      "Bash(gh run:*)",
      "Bash(gh pr:*)",
      "Bash(pnpm turbo:*)",
      "Bash(pnpm install:*)",
      "Bash(docker build:*)"
    ]
  }
}
```

Each entry is a glob pattern matching a tool call. The format is `Tool(command-prefix:*)`.

| Pattern | What it allows |
|---------|---------------|
| `Bash(./scripts/ci-local.sh:*)` | The local CI script with any flags (`--quick`, etc.) |
| `Bash(gh run:*)` | `gh run list`, `gh run view`, `gh run watch` |
| `Bash(gh pr:*)` | `gh pr create`, `gh pr view`, `gh pr list` |
| `Bash(pnpm turbo:*)` | `pnpm turbo build`, `pnpm turbo typecheck` |
| `Bash(pnpm install:*)` | `pnpm install --frozen-lockfile` and variants |
| `Bash(docker build:*)` | `docker build` with any Dockerfile and context |

### What to auto-approve

Commands that are **read-only or locally scoped**. Build, typecheck, and CI status checks don't modify shared state. They're safe to run without confirmation every time.

`gh pr create` does modify shared state (it creates a PR), but it's an intentional action the user explicitly requested. Including it is a judgment call — we auto-approve it because creating a PR is the end of a workflow, not an accidental side effect.

### What not to auto-approve

Anything that touches shared state in a way that's hard to undo:

- `git push` — modifies the remote
- `gh pr merge` — merges code
- `rm` — deletes files
- Anything that touches production

These should require a human confirmation every time. The cost of an extra "yes" is low. The cost of an unwanted push is not.

---

## settings.local.json

Every time Claude Code asks "Allow this command?" and you say yes, the command pattern gets saved to `settings.local.json`. Over time, this file grows.

In this project, `settings.json` has two intentional rules:

```json
{
  "permissions": {
    "allow": [
      "Bash(grep:*)",
      "Bash(bun run:*)"
    ]
  }
}
```

Meanwhile, `settings.local.json` has accumulated 107 entries — session IDs, database credentials, test account logins, hardcoded paths to `.env` files. Every time the editor ran a command with a password or connected to the test database, the pattern got saved. This file isn't a security model — it's an audit log that happens to also be an allowlist.

Add it to `.gitignore`:

```
.claude/settings.local.json
```

The clean approach: keep `settings.json` intentional and minimal — the five to eight command patterns your project actually needs — and let `settings.local.json` be the messy personal accumulation that never leaves your machine.

> **Gotcha:** If you accidentally commit `settings.local.json`, your database passwords and session IDs are in the git history. Even after removing the file, use `git filter-branch` or BFG Repo-Cleaner to scrub the history.

---

## Skills

A skill is a markdown file that Claude Code follows like a recipe when you invoke it with a slash command.

### Skill format

YAML frontmatter for metadata, then step-by-step instructions:

```markdown
---
name: ci-check
description: Check CI status and fix failures.
---

# CI Check

## Step 1: Run local CI
Run `./scripts/ci-local.sh` to execute the same checks
as GitHub Actions. If any step fails, fix it before proceeding.

## Step 2: Check remote CI (if pushed)
Run `gh run list --branch $(git branch --show-current) --limit 1`
to find the most recent CI run for this branch.
```

### Where skills live

```
.claude/skills/<name>/SKILL.md
```

Invoke with `/<name>`. Committed to the repo, so every team member gets the same workflows.

### Writing a skill

Skills are **imperative instructions**, not documentation. They tell Claude Code what to *do*, in what order, with what commands. A good skill reads like a runbook — the kind of document an on-call engineer follows at 3am.

This project has one skill so far: `/ci-check`. It runs local CI, checks remote CI via `gh`, reads failure logs, fixes the issue, and pushes. Five steps, sixty lines of markdown. The full source is in [`.claude/skills/ci-check/SKILL.md`](../../.claude/skills/ci-check/SKILL.md).

Skills emerge from repetition. The first time I explained the CI workflow to the editor, I typed it out. The second time, I said "like last time." The third time, I wrote a skill. The pattern holds for any workflow you find yourself describing more than twice — testing methodology, log analysis, domain-specific constraints. Each becomes a skill when the repetition gets annoying enough.

> **Gotcha:** Skills are imperative, not declarative. "Ensure tests pass" is vague. "Run `pnpm turbo test`, read the output, fix any failures, run again" is a skill.

---

## Common patterns

### Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md`
2. Add YAML frontmatter with `name` and `description`
3. Write numbered steps with exact commands
4. Commit — it's available immediately via `/<name>`

### Adding a new permission

1. Open `.claude/settings.json`
2. Add a glob pattern to the `permissions.allow` array
3. Commit — the permission applies for the whole team

### CLAUDE.md vs code comments

If the information is about *where things are* and *how to work on them*, it belongs in CLAUDE.md. If the information is about *what the code does and why*, it belongs in a code comment.

| Put in CLAUDE.md | Put in code |
|------------------|-------------|
| "Blog posts go in `exploration/<number>/README.md`" | `// Parse at noon to avoid timezone date rollover` |
| "Run `./scripts/ci-local.sh` before committing" | `// Retry 3x with exponential backoff` |
| "Branch naming: `feat/<number>-<name>`" | `// FIFO queue — oldest job processed first` |

### Starting from scratch

For a new project, create three files:

```bash
# 1. Project instructions
echo "# My Project\n\nAdd commands and conventions here." > CLAUDE.md

# 2. Team permissions
mkdir -p .claude
echo '{"permissions":{"allow":[]}}' > .claude/settings.json

# 3. Gitignore the local file
echo ".claude/settings.local.json" >> .gitignore
```

Then add permissions and skills as workflows emerge. Don't pre-plan — let the patterns reveal themselves through use.

---

*Last updated: February 2026.*
