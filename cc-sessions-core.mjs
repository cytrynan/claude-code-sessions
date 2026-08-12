// cc-sessions-core.mjs — セッション状況収集の共通コア（CLI・サーバー両方がこれを使う）
//
// データ源:
//   ~/.claude{,-b}/sessions/*.json  … 稼働中セッションの台帳 (pid/sessionId/cwd/startedAt/name)
//   ~/.claude/projects/**/<sessionId>.jsonl … 会話ログ (直近の依頼・応答・cwd・branch)
//   ~/.claude/projects/<proj>/<sessionId>/subagents/agent-*.jsonl … サブエージェント

import {
  readdirSync, readFileSync, statSync, existsSync,
  openSync, readSync, closeSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
// ~/.claude に加え、複数アカウント構成 (~/.claude-b 等) の sessions/ 台帳も拾う
const CONFIG_DIRS = (() => {
  const out = [];
  try {
    for (const name of readdirSync(HOME)) {
      if (!/^\.claude(-[\w-]+)?$/.test(name)) continue;
      const dir = join(HOME, name);
      try { if (statSync(dir).isDirectory()) out.push(dir); } catch {}
    }
  } catch {}
  return out.length ? out : [join(HOME, ".claude")];
})();
const PROJECTS = join(HOME, ".claude", "projects"); // ログは通常こちらに集約（複数アカウントでも共有構成が多い）

// ---------- 部分読み(巨大jsonl対策) ----------
function readRange(path, start, len) {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, start);
    return buf.toString("utf8", 0, n);
  } finally { closeSync(fd); }
}
function readTail(path, bytes = 262144) {
  const size = statSync(path).size;
  const start = Math.max(0, size - bytes);
  let text = readRange(path, start, size - start);
  if (start > 0) text = text.slice(text.indexOf("\n") + 1); // 行の途中を捨てる
  return text;
}
function readHead(path, bytes = 131072) {
  const size = statSync(path).size;
  return readRange(path, 0, Math.min(bytes, size));
}
function parseLines(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 途切れ行は無視 */ }
  }
  return out;
}

// ---------- 本文抽出 ----------
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c && c.type === "text" && c.text).map((c) => c.text).join(" ");
  }
  return "";
}
// K が打った「本物の依頼」か（通知・コマンド・meta を除外）
function realUserText(e) {
  if (e.type !== "user" || !e.message || e.isMeta || e.isSidechain) return null;
  const t = contentText(e.message.content).trim();
  if (!t || t.startsWith("<") || t.startsWith("Caveat:") || t.startsWith("[Request interrupted")) return null;
  return t;
}
function assistantText(e) {
  if (e.type !== "assistant" || !e.message || e.isSidechain) return null;
  const t = contentText(e.message.content).trim();
  return t || null;
}
export function clean(s, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// ---------- ログ1本の解析 ----------
function analyzeLog(path) {
  const info = {
    lastTs: 0, cwd: null, branch: null,
    lastUser: null, lastAssistant: null, topic: null, queued: 0,
  };
  for (const e of parseLines(readTail(path))) {
    const ts = e.timestamp ? Date.parse(e.timestamp) : 0;
    if (ts > info.lastTs) info.lastTs = ts;
    if (e.cwd) info.cwd = e.cwd;
    if (e.gitBranch) info.branch = e.gitBranch;
    const u = realUserText(e);
    if (u) info.lastUser = u;
    const a = assistantText(e);
    if (a) info.lastAssistant = a;
    if (e.type === "queue-operation") {
      if (e.operation === "enqueue") info.queued++;
      else if (info.queued > 0) info.queued--;
    }
  }
  for (const e of parseLines(readHead(path))) {
    const u = realUserText(e);
    const q = e.type === "queue-operation" && e.operation === "enqueue" ? e.content : null;
    if (u || q) { info.topic = u || q; break; }
  }
  return info;
}

// ---------- sessionId → jsonl の対応表 ----------
function collectSessionFiles() {
  const map = new Map();
  let dirs = [];
  try { dirs = readdirSync(PROJECTS); } catch { return map; }
  for (const proj of dirs) {
    const dir = join(PROJECTS, proj);
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of ents) {
      if (!ent.isFile() || !ent.name.endsWith(".jsonl")) continue;
      const p = join(dir, ent.name);
      try {
        map.set(ent.name.slice(0, -6), { path: p, mtime: statSync(p).mtimeMs, proj });
      } catch { /* 消えた直後 */ }
    }
  }
  return map;
}

// ---------- 稼働中セッション台帳 ----------
function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}
function liveSessions() {
  const seen = new Map();
  for (const cfg of CONFIG_DIRS) {
    const dir = join(cfg, "sessions");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (!j.sessionId || seen.has(j.sessionId) || !isAlive(j.pid)) continue;
        j.account = cfg.replace(/^.*[\\/]/, ""); // 設定ディレクトリ名 (.claude / .claude-b 等) をそのままアカウント識別子に

        seen.set(j.sessionId, j);
      } catch { /* 壊れた台帳は無視 */ }
    }
  }
  return [...seen.values()];
}

// ---------- サブエージェント ----------
function subagentInfo(proj, sessionId) {
  const dir = join(PROJECTS, proj, sessionId, "subagents");
  if (!existsSync(dir)) return { total: 0, active: 0 };
  let total = 0, active = 0;
  const now = Date.now();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    total++;
    try { if (now - statSync(join(dir, f)).mtimeMs < 5 * 60e3) active++; } catch {}
  }
  return { total, active };
}

// ---------- 収集本体 ----------
export function collectRows(allHours = 0) {
  const files = collectSessionFiles();
  const live = liveSessions();
  const selfId = process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || null;
  const rows = [];

  for (const s of live) {
    const f = files.get(s.sessionId);
    const info = f ? analyzeLog(f.path) : { cwd: s.cwd }; // ログ未作成の新規セッションは台帳のcwdで代用
    const sub = f ? subagentInfo(f.proj, s.sessionId) : { total: 0, active: 0 };
    rows.push({
      kind: "live", sessionId: s.sessionId, pid: s.pid, name: s.name || "",
      account: s.account, startedAt: s.startedAt,
      mtime: f ? f.mtime : s.startedAt, ...info, sub,
      self: selfId === s.sessionId,
    });
  }
  if (allHours > 0) {
    const liveIds = new Set(live.map((s) => s.sessionId));
    const cutoff = Date.now() - allHours * 3600e3;
    for (const [id, f] of files) {
      if (liveIds.has(id) || f.mtime < cutoff) continue;
      if (f.proj.includes("disallowed-canary")) continue; // 週次検証の使い捨て
      rows.push({ kind: "closed", sessionId: id, mtime: f.mtime, ...analyzeLog(f.path), sub: subagentInfo(f.proj, id) });
    }
  }
  rows.sort((a, b) => (a.kind === b.kind ? b.mtime - a.mtime : a.kind === "live" ? -1 : 1));
  return rows;
}

// ---------- 表示ヘルパ ----------
export function fmtAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}秒前`;
  if (s < 3600) return `${Math.round(s / 60)}分前`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}時間前`;
  return `${(s / 86400).toFixed(1)}日前`;
}
export function stateIcon(r) {
  if (r.kind === "closed") return "⚪";
  const age = Date.now() - r.mtime;
  return age < 2 * 60e3 ? "🟢" : age < 15 * 60e3 ? "🟡" : "🌙";
}
export function stateLabel(r) {
  if (r.kind === "closed") return "終了";
  const age = Date.now() - r.mtime;
  return age < 2 * 60e3 ? "作業中" : "待機(入力待ちの可能性)";
}
