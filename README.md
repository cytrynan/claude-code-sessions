# claude-code-sessions

**See what all your Claude Code sessions are doing, at a glance.** / 手元で動いている複数の Claude Code セッションが「いま何をやっているか」を一覧するツールです。

When you run many Claude Code sessions in parallel, it's hard to remember which one is doing what. This tool cross-references two data sources Claude Code already writes locally:

- `~/.claude/sessions/*.json` — the registry of **currently running** sessions (PID / sessionId / cwd / start time). Liveness is verified with `process.kill(pid, 0)`.
- `~/.claude/projects/**/<sessionId>.jsonl` — conversation logs, from which the tool extracts each session's **topic** (first user prompt), **latest request / response**, working directory, git branch, queued prompts, and running subagents.

No configuration, no external dependencies, read-only. Output text is Japanese.

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

On Windows, double-click `cc-sessions-live.cmd` to start the server hidden and open a small Chrome app window (`--app`).

### Slash command

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

## Notes

- Long logs are never read in full — only the first 128 KB and last 256 KB of each `.jsonl` (fast even with hundreds of sessions).
- Multi-account setups: every `~/.claude*` directory containing a `sessions/` registry is scanned.
- The HTML served by `cc-sessions-server.mjs` is fixed at module load; restart the server after editing it.

## License

MIT
