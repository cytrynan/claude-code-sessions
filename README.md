# claude-code-sessions

**See what all your Claude Code sessions are doing, at a glance.** / 手元で動いている複数の Claude Code セッションが「いま何をやっているか」を一覧するツールです。

When you run many Claude Code sessions in parallel, it's hard to remember which one is doing what. This tool reads the files Claude Code already writes locally and lists every session in one place. No configuration, no external dependencies, read-only. Output text is Japanese.

## What it does

- Lists the currently running sessions, each with its topic (first user prompt), latest request and response, working directory, and git branch.
- Shows how recently each session was active, and marks the session you ran the command from.
- Shows queued prompts and running subagents for each session.
- Optionally includes sessions closed within the last N hours.
- Serves a live browser view that refreshes every 5 seconds.
- Lets Claude itself see the other sessions, through a slash command or a SessionStart hook.

## Requirements

- Node.js 18+
- Claude Code (the tool only reads its local logs)
- The `.cmd` launcher is Windows-only; the CLI and server run anywhere Node runs

## Usage

### CLI

```bash
node cc-sessions.mjs             # running sessions, detailed
node cc-sessions.mjs --oneline   # one line per session
node cc-sessions.mjs --all=24    # include sessions closed within 24h
node cc-sessions.mjs --json      # machine-readable
```

Example (`--oneline`):

```
■ セッション一覧  稼働中 4  (2026/8/12 16:27:59)
🟢     2秒前 実験R11: TDDシリーズ縦断比較の4ラウンド目を実行して。…
🟢    17秒前 音声クローンのサンプルを作ってみて… ★このセッション
🟡     3分前 googlecolabってapiとかMCPとかないの？ 🤖サブ1稼働
🌙    16分前 S1の読み方がおかしい件を直して…
```

🟢 = active in the last 2 min / 🟡 = last 15 min / 🌙 = idle (likely waiting for input) / ⚪ = closed. ★ marks the session you ran the command from (via `CLAUDE_CODE_SESSION_ID`).

### Live browser view

```bash
node cc-sessions-server.mjs   # http://localhost:7843, auto-refreshes every 5s
```

To use another port, pass it as an argument (`node cc-sessions-server.mjs 8000`).

On Windows, double-click `cc-sessions-live.cmd` to start the server hidden and open a small Chrome app window (`--app`).

### Slash command

The slash command and the hook below run the CLI from `~/.claude/scripts/`. Copy both `cc-sessions.mjs` and `cc-sessions-core.mjs` there first, because the CLI imports the core module from its own directory.

Drop this into `~/.claude/commands/sessions.md` to get a `/sessions` command in every session:

```markdown
---
description: 別セッションで何をやっているか一覧
allowed-tools: Bash(node:*)
argument-hint: [--all[=時間]] [--oneline]
---

!`node "$HOME/.claude/scripts/cc-sessions.mjs" $ARGUMENTS`

上の出力をそのまま提示する。
```

### SessionStart hook (give Claude itself cross-session awareness)

Add to `settings.json` so every new session starts knowing what the others are doing (~130 ms):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node \"~/.claude/scripts/cc-sessions.mjs\" --oneline", "timeout": 15 } ] }
    ]
  }
}
```

## How it works

The tool cross-references two data sources:

- `~/.claude/sessions/*.json`: the registry of currently running sessions (PID / sessionId / cwd / start time). Liveness is verified with `process.kill(pid, 0)`.
- `~/.claude/projects/**/<sessionId>.jsonl`: conversation logs, from which the tool extracts each session's topic (first user prompt), latest request / response, working directory, git branch, queued prompts, and running subagents.

| File | Role |
|---|---|
| `cc-sessions-core.mjs` | Collects session data. Shared by the CLI and the server |
| `cc-sessions.mjs` | CLI |
| `cc-sessions-server.mjs` | Live browser view (default port 7843) |
| `cc-sessions-live.cmd` | Windows launcher for the live view |

Notes:

- Long logs are never read in full. The tool reads only the first 128 KB and last 256 KB of each `.jsonl`, so it stays fast even with hundreds of sessions.
- Multi-account setups: every `~/.claude*` directory containing a `sessions/` registry is scanned.
- The HTML served by `cc-sessions-server.mjs` is fixed at module load; restart the server after editing it.

## License

MIT
