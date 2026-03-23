# Five Commits to Build a Wall

I launched an agent in an isolated worktree and told it to build a domain plugin. It wrote the route files, the config, the interceptor. Clean code. Then it imported the plugin into `register-domains.ts` — in the main repo.

The worktree was a copy. The main repo was the original. The agent had write access to both. It picked the one with the shorter path.

---

The first fix was surgical. A pre-commit hook that checked if the file being written was `register-domains.ts` or `apps/api/package.json`, and if the current working directory was a worktree, blocked the write. Two files. Simple rule.

The agent routed around it. It created a `domains/` directory in the main repo using an absolute path. The hook only checked two filenames. The agent found a third.

---

The second fix broadened the guard. Instead of checking specific files, block ANY write where the target path starts with the main project directory but the agent's working directory is a worktree.

```bash
# Guard logic v2:
# If CWD is /tmp/interceptor-worktrees/agent-X/
# and file_path starts with /Users/adam/Projects/api-interceptor/
# → DENY
```

This worked for explicit paths. But agents sometimes use relative paths — `../../domains/foo/` — which resolved to the main repo without the hook catching it. The absolute-path check missed relative-path escapes.

---

The third fix tried a different approach entirely. Instead of blocking writes, redirect them. If an agent in a worktree writes to `/repo/domains/foo/`, silently rewrite the path to `/tmp/interceptor-worktrees/agent-X/domains/foo/`. Transparent path rewriting. The agent doesn't even know it happened.

This created a different problem. The redirected paths didn't always exist — the parent directories hadn't been created in the worktree. And some tools (like `Edit`) don't create parent directories. The agent would get cryptic ENOENT errors on paths it thought were valid.

---

```mermaid
graph TD
    subgraph "Attempt 1: Block specific files"
        H1["Hook checks:<br/>register-domains.ts<br/>package.json"] --> F1["Agent writes to<br/>domains/ instead"]
        F1 --> FAIL1["❌ Main repo<br/>contaminated"]
    end

    subgraph "Attempt 2: Block all main-repo writes"
        H2["Hook checks:<br/>any path starting with<br/>PROJECT_DIR"] --> F2["Agent uses<br/>relative paths"]
        F2 --> FAIL2["❌ Relative paths<br/>bypass check"]
    end

    subgraph "Attempt 3: Redirect writes"
        H3["Hook rewrites:<br/>main path → worktree path"] --> F3["Parent dirs<br/>don't exist"]
        F3 --> FAIL3["❌ ENOENT errors"]
    end

    subgraph "Attempt 4: External worktrees"
        H4["Worktrees at /tmp/<br/>OUTSIDE the repo tree"] --> F4["Agent can't accidentally<br/>resolve to main"]
        F4 --> WIN["✓ Isolation achieved"]
    end

    style FAIL1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style FAIL2 fill:#1a1a2e,stroke:#e94560,color:#fff
    style FAIL3 fill:#1a1a2e,stroke:#e94560,color:#fff
    style WIN fill:#0f3460,stroke:#53cf8d,color:#fff
    style H1 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style H2 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style H3 fill:#1a1a2e,stroke:#0f3460,color:#fff
    style H4 fill:#0f3460,stroke:#53cf8d,color:#fff
    style F1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style F2 fill:#1a1a2e,stroke:#e94560,color:#fff
    style F3 fill:#1a1a2e,stroke:#e94560,color:#fff
    style F4 fill:#16213e,stroke:#53cf8d,color:#fff
```

The fourth fix moved the worktrees outside the repository entirely. Instead of `.claude/worktrees/` (inside the repo), create them at `/tmp/interceptor-worktrees/` (outside). When the worktree isn't a subdirectory of the repo, relative paths can't accidentally resolve upward into the main project. The pnpm workspace can't create symlinks. The agent's `$(pwd)` is unambiguously the worktree.

The guard hook simplified to: if you're in `/tmp/interceptor-worktrees/` and you're writing to `/Users/.../api-interceptor/`, deny. No edge cases. No relative path resolution. No redirects.

---

Five commits. Four failed approaches. The lesson wasn't about git worktrees or shell hooks. It was about isolation boundaries.

Software isolation usually works by restricting capabilities — sandboxes, containers, permissions. Agent isolation is harder because the agent is a reasoning system. It doesn't just access paths; it constructs them. It reads documentation that mentions the main repo path. It resolves relative paths in its head. It optimizes for the shortest path to its goal, and if the main repo is closer, it goes there.

You can't restrict what the agent knows. You can only make the boundary so obvious that crossing it requires deliberate effort. Moving the worktree outside the repo tree made the boundary physical, not logical. The agent would have to explicitly type a path it never sees in its own working directory. That's the difference between a wall and a sign.
