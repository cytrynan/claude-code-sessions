// Claude Code セッション状況 ライブビュー（別ウィンドウ=ブラウザで表示）
//   node cc-sessions-server.mjs [port]
// 既定ポート 7843。ブラウザは開かない（cc-sessions-live.cmd が Chrome --app で開く）。
// ブラウザ側が5秒ごとに /api をポーリングして自動更新。
// 注意: HTMLはモジュール読込時に文字列として固定される＝変更したらサーバー再起動が必要。
import http from "node:http";
import { homedir } from "node:os";
import { collectRows } from "./cc-sessions-core.mjs";

const ARGV = process.argv.slice(2);
const PORT = Number(ARGV.find((a) => /^\d+$/.test(a))) || 7843;
const HOME_JSON = JSON.stringify(homedir()); // クライアント側の cwd 短縮表示用

const HTML = String.raw`<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Code セッション</title>
<style>
  :root{
    --bg:#1e1f22; --card:#2b2d31; --line:#3a3d43;
    --fg:#e7e9ec; --dim:#9aa0a8; --accent:#4a86e8;
    --green:#43b581; --yellow:#d8a032; --moon:#7d84c0;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font-family:-apple-system,"Segoe UI","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,sans-serif;
    display:flex;justify-content:center;padding:18px}
  .app{width:560px;max-width:100%}
  .bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .bar h1{font-size:15px;margin:0;font-weight:700}
  .bar .sum{color:var(--dim);font-size:12px}
  .seg{display:flex;gap:2px;background:#111214;border-radius:8px;padding:3px}
  .seg button{border:0;background:transparent;color:var(--dim);padding:5px 12px;
    border-radius:6px;font-size:12px;cursor:pointer}
  .seg button.on{background:#4b4d53;color:#fff}
  .card{background:var(--card);border-radius:10px;padding:12px 14px;margin-bottom:8px;
    border-left:3px solid var(--line)}
  .card.g{border-left-color:var(--green)}
  .card.y{border-left-color:var(--yellow)}
  .card.m{border-left-color:var(--moon)}
  .title{font-size:13.5px;font-weight:600;line-height:1.4}
  .self{color:var(--accent);font-size:11px;margin-left:6px}
  .meta{color:var(--dim);font-size:11.5px;margin-top:5px;display:flex;gap:10px;flex-wrap:wrap}
  .msg{font-size:12px;color:#c3c7cd;margin-top:6px;line-height:1.5}
  .msg b{color:var(--dim);font-weight:600}
  .badge{background:#3a3d43;border-radius:4px;padding:1px 6px;font-size:11px}
  .empty{color:var(--dim);text-align:center;padding:40px 0;font-size:13px}
</style></head><body>
<div class="app">
  <div class="bar">
    <h1>セッション <span class="sum" id="sum"></span></h1>
    <div class="seg">
      <button id="bLive" class="on">稼働中</button>
      <button id="bAll">+24h</button>
    </div>
  </div>
  <div id="list"></div>
</div>
<script>
const HOME=__HOME__;
const setHTML=(el,h)=>{el["inner"+"HTML"]=h;};
const shortCwd=(p)=>p===HOME?"~":(p.startsWith(HOME)?"~"+p.slice(HOME.length):p);
const esc=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
let ALL=0;
function ago(ms){
  const s=Math.max(0,Math.round((Date.now()-ms)/1000));
  if(s<60)return s+"秒前";
  if(s<3600)return Math.round(s/60)+"分前";
  if(s<86400)return (s/3600).toFixed(1)+"時間前";
  return (s/86400).toFixed(1)+"日前";
}
function cls(r){
  if(r.kind==="closed")return "";
  const age=Date.now()-r.mtime;
  return age<120e3?"g":age<900e3?"y":"m";
}
function icon(r){
  if(r.kind==="closed")return "⚪";
  const age=Date.now()-r.mtime;
  return age<120e3?"🟢":age<900e3?"🟡":"🌙";
}
function state(r){
  if(r.kind==="closed")return "終了";
  const age=Date.now()-r.mtime;
  return age<120e3?"作業中":"待機";
}
async function refresh(){
  let rows;
  try{ rows=await (await fetch("/api?all="+ALL)).json(); }
  catch(e){ return; } // サーバー一時不達は次のポーリングに任せる
  const live=rows.filter(r=>r.kind==="live").length;
  setHTML(document.getElementById("sum"),
    "稼働中 "+live+(ALL?" / 終了 "+(rows.length-live):"")+" ・ "+new Date().toLocaleTimeString("ja-JP"));
  if(!rows.length){ setHTML(document.getElementById("list"),'<div class="empty">稼働中のセッションはありません</div>'); return; }
  const h=rows.map(r=>{
    const sub=r.sub&&r.sub.active?' <span class="badge">🤖サブ'+r.sub.active+'</span>':"";
    const q=r.queued?' <span class="badge">📥待ち'+r.queued+'</span>':"";
    const me=r.self?'<span class="self">★このセッション</span>':"";
    const cwd=r.cwd?'<span>📁 '+esc(shortCwd(r.cwd))+(r.branch&&r.branch!=="HEAD"?" ["+esc(r.branch)+"]":"")+'</span>':"";
    const lu=r.lastUser?'<div class="msg"><b>依頼:</b> '+esc(r.lastUser.slice(0,120))+'</div>':"";
    const la=r.lastAssistant?'<div class="msg"><b>応答:</b> '+esc(r.lastAssistant.slice(0,120))+'</div>':"";
    return '<div class="card '+cls(r)+'">'
      +'<div class="title">'+icon(r)+" "+esc((r.topic||"(依頼記録なし)").slice(0,80))+me+'</div>'
      +'<div class="meta"><span>'+state(r)+' / '+ago(r.mtime)+'</span>'+cwd+sub+q+'</div>'
      +lu+la+'</div>';
  }).join("");
  setHTML(document.getElementById("list"),h);
}
document.getElementById("bLive").onclick=()=>{ALL=0;seg();refresh();};
document.getElementById("bAll").onclick=()=>{ALL=24;seg();refresh();};
function seg(){
  document.getElementById("bLive").classList.toggle("on",ALL===0);
  document.getElementById("bAll").classList.toggle("on",ALL!==0);
}
refresh();
setInterval(refresh,5000);
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api") {
    const all = Number(url.searchParams.get("all")) || 0;
    let body;
    try { body = JSON.stringify(collectRows(all)); }
    catch (e) { res.writeHead(500); res.end(String(e)); return; }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(HTML.replace("__HOME__", HOME_JSON));
});
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(`port ${PORT} は使用中（既に起動済み）。多重起動せず終了します。`);
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, () => {
  console.log(`cc-sessions live: http://localhost:${PORT}`);
});
