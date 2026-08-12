#!/usr/bin/env node
// cc-sessions.mjs — 別セッションで何をやっているかを一覧する（CLIテキスト版）
// 収集ロジックの正本は cc-sessions-core.mjs（ライブGUI版 cc-sessions-server.mjs と共用）
//
// 使い方:
//   node cc-sessions.mjs            … 稼働中セッションのみ(詳細)
//   node cc-sessions.mjs --all[=H]  … 直近H時間(既定24h)に活動した終了済みも含める
//   node cc-sessions.mjs --oneline  … 1セッション1行
//   node cc-sessions.mjs --json     … 機械可読出力

import { collectRows, fmtAgo, clean, stateIcon, stateLabel } from "./cc-sessions-core.mjs";

const args = process.argv.slice(2);
const ONELINE = args.includes("--oneline");
const JSON_OUT = args.includes("--json");
const allArg = args.find((a) => a === "--all" || a.startsWith("--all="));
const ALL_HOURS = allArg ? Number(allArg.split("=")[1] || 24) : 0;

const rows = collectRows(ALL_HOURS);

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else if (rows.length === 0) {
  console.log("稼働中のセッションはありません。(--all で直近の終了済みも表示)");
} else {
  const liveCount = rows.filter((r) => r.kind === "live").length;
  console.log(`■ セッション一覧  稼働中 ${liveCount}${ALL_HOURS ? ` / 直近${ALL_HOURS}h の終了済み ${rows.length - liveCount}` : ""}  (${new Date().toLocaleString("ja-JP")})`);
  for (const r of rows) {
    const icon = stateIcon(r);
    const title = clean(r.topic || "(依頼記録なし)", ONELINE ? 45 : 70);
    const me = r.self ? " ★このセッション" : "";
    const subTxt = r.sub.active ? ` 🤖サブ${r.sub.active}稼働` : "";
    const qTxt = r.queued ? ` 📥待ち${r.queued}件` : "";
    if (ONELINE) {
      console.log(`${icon} ${fmtAgo(r.mtime).padStart(7)} ${title}${subTxt}${qTxt}${me}`);
      continue;
    }
    console.log("─".repeat(72));
    console.log(`${icon} ${title}${me}`);
    console.log(`   状態: ${stateLabel(r)} / 最終活動 ${fmtAgo(r.mtime)}${subTxt}${qTxt}` + (r.kind === "live" ? ` / PID ${r.pid}${r.name ? ` (${r.name})` : ""}` : ""));
    if (r.cwd) console.log(`   場所: ${r.cwd}${r.branch && r.branch !== "HEAD" ? `  [${r.branch}]` : ""}`);
    if (r.lastUser) console.log(`   直近の依頼: ${clean(r.lastUser)}`);
    if (r.lastAssistant) console.log(`   直近の応答: ${clean(r.lastAssistant)}`);
  }
}
