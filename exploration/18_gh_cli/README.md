# The Other GitHub Command

I pushed the branch and asked Claude Code to check if CI was passing.

It knew the exact command. The right flags, the right branch name, the right output format. A perfect one-liner. And the terminal said: `gh: command not found`.

---

I'd been using GitHub for years. Cloning repos, pushing branches, opening pull requests in the browser. My terminal could talk to GitHub's servers — `git push`, `git pull`, `git fetch`. SSH keys configured, remote URLs set. Everything worked.

But `git` only knows about the repository. The files, the commits, the branches. It has no concept of a pull request. It can't check whether CI passed. It can't read a review comment or close an issue. All of that lives on GitHub's platform, and `git` — the version control tool that predates GitHub by three years — has no idea it exists.

`gh` is a different tool for a different layer. `git` manages your repository. `gh` manages your relationship with GitHub the platform. They share a name prefix and nothing else.

---

Most developers install `git` during their first week of programming. They might not install `gh` ever.

This wasn't a problem when the workflow was: write code in your editor, push to GitHub, switch to your browser, open a pull request, click through the CI checks, read the review comments, go back to your editor. The browser handled the platform layer. Your terminal handled the code.

It becomes a problem when your terminal *is* the workflow.

I work with an AI coding assistant that lives in the terminal. It writes code, runs tests, commits, pushes. When it needs to create a pull request, it runs `gh pr create`. When I ask whether CI is green, it runs `gh run list`. When a reviewer leaves a comment, it runs `gh api` to read the thread. The entire development loop — code, test, commit, push, PR, CI, review — happens without leaving the terminal.

Except that first time, when none of it worked, because `gh` wasn't installed.

---

The setup is two commands. Install it with your system's package manager, then authenticate:

```bash
gh auth login
```

It opens a browser, you click authorize, and your terminal can now talk to GitHub's platform API. Not just the git protocol — the REST API that powers pull requests, CI runs, issues, releases, code review, repository settings. Everything you used to do in the browser tab.

---

Here's what changed for me after those two commands.

Checking CI used to mean: open browser, navigate to repo, click the branch, find the workflow run, wait for it to load, scan for the red X or green check. Now it means asking "is CI passing?" and getting a table of pass/fail results in the terminal. If something failed, the failed step's logs appear right there — no clicking through three pages to find the stack trace.

Creating a pull request used to mean: push the branch, open the browser, click "Compare & pull request," fill in the title and description in a web form, click create. Now the AI assistant writes the PR title and description from the diff, runs `gh pr create`, and returns the URL. The PR exists before I've switched windows.

Reading review comments used to mean: open the PR in the browser, scroll through the diff, find the inline comments. Now: `gh api repos/owner/repo/pulls/123/comments` dumps them into the terminal where the AI can read them, understand the feedback, and start fixing.

None of these individual operations are impressive. Each one saves maybe thirty seconds. But they compound. The context switch — editor to browser, find the right page, do the thing, go back to editor — is the expensive part. Not the seconds, the attention. Every switch is a small interruption in the flow of writing code, reviewing results, iterating.

---

There's a deeper point here about what "setting up your development environment" means now.

A decade ago it meant: install your language runtime, your editor, and `git`. Configure SSH. Maybe set up a linter. That was the stack. Everything else happened in other applications — browser for GitHub, Slack for communication, Jira for tickets.

When the development loop moves into the terminal — and AI assistants are pushing it there fast — the tools that connect your terminal to those external platforms become part of the core setup. Not nice-to-haves. Prerequisites.

`gh` is the obvious one for GitHub. But the pattern extends. Anything your workflow touches that used to live in a browser tab — CI, project management, deployment, monitoring — either needs a CLI, an API, or an MCP server that your terminal-based tools can reach. The browser was the universal adapter. The terminal needs its own adapters installed one by one.

---

I spent two years using GitHub through a browser and never thought about it. The first time I tried to use GitHub from my terminal — really use it, not just push code — it took two commands and five minutes.

The gap between "having git configured" and "having GitHub configured" is tiny. But you don't notice it until something asks for the other side.
