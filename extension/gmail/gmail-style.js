/* Glass Farm for Gmail — вид панели.
   Цвета — набор Glass Farm (src/styles/tokens.css, светлые значения): панель
   выглядит как ERP. Стили живут в Shadow DOM и на Gmail не действуют. */
const GF_PANEL_WIDTH = 316;
const GF_CSS = `
:host{all:initial}
*{box-sizing:border-box}
.gf{--bg:#f5f7f7;--surface:#fff;--surface-2:#f8f9fa;--surface-3:#eef0f2;--line-soft:#eef0f2;--line:#e4e7ea;--line-strong:#cfd5da;
 --text:#14181c;--text-2:#4b5560;--text-3:#7b858f;--inverse:#1d2328;--on-solid:#fff;
 --accent:#2f6b5e;--accent-hover:#255649;--accent-soft:#e7f0ed;--accent-line:#bcd5cd;
 --success:#1f7a45;--success-soft:#e9f6ee;--success-line:#b9dfc9;--warning:#9a5b0f;--warning-soft:#fdf5e4;--warning-line:#efd5a1;
 --danger:#b42318;--danger-soft:#fdecea;--danger-line:#f3c4bf;
 position:fixed;top:72px;right:8px;z-index:2147483000;width:300px;max-height:calc(100vh - 88px);display:flex;flex-direction:column;
 background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 40px rgba(16,24,40,.12);overflow:hidden;
 font:13px/1.45 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--text);letter-spacing:-.003em}
.gf.tab{width:34px;right:0;top:120px;border-radius:12px 0 0 12px;border-right:0;cursor:pointer;padding:10px 5px;align-items:center;gap:8px}
.gf.tab em{writing-mode:vertical-rl;font-style:normal;font-size:11px;color:var(--text-2)}
.head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line-soft);flex:none}
.logo{width:22px;height:22px;border-radius:6px;background:var(--inverse);color:var(--on-solid);font-size:10px;font-weight:700;display:grid;place-items:center;flex:none}
.head b{font-weight:650;font-size:13px}
.head .sp{flex:1}
.ib{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;background:transparent;color:var(--text-3);cursor:pointer;padding:0;font-size:15px;line-height:1}
.ib:hover{background:var(--surface-3);color:var(--text)}
.body{padding:12px;overflow:auto;flex:1}
button.b{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin:0 0 6px;padding:8px 10px;font:inherit;font-size:13px;cursor:pointer;
 border:1px solid var(--line-strong);border-radius:9px;background:var(--surface);color:var(--text)}
button.b:hover{border-color:var(--text-3);background:var(--surface-2)}
button.b.pri{background:var(--accent);border-color:var(--accent);color:var(--on-solid);font-weight:600}
button.b.pri:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
button.b.sm{width:auto;margin:0;padding:4px 9px;font-size:12px;border-radius:7px}
button.b:disabled{opacity:.5;cursor:default}
.msg{font-weight:650;font-size:14px;margin:0 0 2px}
.sub{color:var(--text-2);font-size:12px;margin:0 0 12px;word-break:break-all}
.mut{color:var(--text-3);font-size:12px;margin:0 0 10px}
.err{color:var(--danger);font-size:12px;margin:0 0 8px}
.h{font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px}
.card{border:1px solid var(--line);border-radius:12px;padding:11px;margin:0 0 10px;background:var(--surface)}
.card.hold{border-color:var(--danger-line)}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.top b{font-size:13.5px;font-weight:650}
.top small{color:var(--text-2);font-size:12px;font-weight:400}
.big{font-size:19px;font-weight:650;letter-spacing:-.01em;margin:0}
.csub{color:var(--text-2);font-size:12px;margin:0 0 9px}
.bar{display:flex;height:9px;border-radius:999px;overflow:hidden;background:var(--surface-3);margin:0 0 9px}
.bar i{display:block;height:100%}
.c-ship{background:var(--accent)}
.c-ready{background:color-mix(in srgb,var(--accent) 45%,var(--surface))}
.c-prod{background:var(--warning-line)}
.leg{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-2);padding:2px 0}
.leg i{width:10px;height:10px;border-radius:3px;flex:none}
.leg b{margin-left:auto;color:var(--text);font-weight:600}
.where small{color:var(--text-3)}
.where{margin:9px 0 10px;padding-top:9px;border-top:1px solid var(--line-soft);font-size:12px;color:var(--text-2)}
.st{display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:4px;margin-top:6px}
.st span{white-space:nowrap;text-align:center;font-size:11px;padding:4px 5px;border-radius:7px;background:var(--surface-2);color:var(--text-3)}
.st span.on{background:var(--warning-soft);color:var(--warning);font-weight:600}
.st span.ok{color:var(--success)}
.holdline{background:var(--danger-soft);color:var(--danger);border-radius:8px;padding:5px 8px;font-size:12px;margin:0 0 9px}
.pill{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:500;white-space:nowrap;background:var(--surface-3);color:var(--text)}
.pill.s-verified,.pill.s-sent{background:var(--accent-soft);color:var(--accent)}
.pill.s-batched{background:var(--warning-soft);color:var(--warning)}
.pill.s-ready{background:var(--success-soft);color:var(--success);box-shadow:inset 0 0 0 1px var(--success-line)}
.pill.s-shipping{color:var(--success);box-shadow:inset 0 0 0 1px var(--success-line)}
.pill.s-done,.pill.s-won{background:var(--success-soft);color:var(--success)}
.pill.s-cancelled{background:var(--danger-soft);color:var(--danger)}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line-soft);font-size:12.5px}
.row.first{border-top:0}
.row.go{cursor:pointer}
.row.go:hover b{text-decoration:underline}
.row small{color:var(--text-3)}
.row.arch,.row.arch b{color:var(--text-3)}
.sugg{border:1px solid var(--accent-line);background:var(--accent-soft);border-radius:12px;padding:10px 11px;margin:0 0 10px}
.sugg p{margin:0 0 7px;font-size:12px;color:var(--accent)}
.sugg .row{padding:0 0 9px;border:0}
.sugg button.b{margin:0}
.counts{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 4px}
.more{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 2px;border-top:1px solid var(--line-soft);font-size:12.5px;color:var(--accent);font-weight:500;cursor:pointer}
.more.q{color:var(--text-2);font-weight:400}
input.in{width:100%;margin:0 0 8px;padding:8px 9px;font:inherit;font-size:13px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface);color:var(--text)}
input.in:focus{outline:2px solid var(--accent-line);border-color:var(--accent)}
.foot{border-top:1px solid var(--line-soft);background:var(--surface-2);padding:9px 12px;font-size:12.5px;flex:none}
.foot .ft{display:flex;align-items:center;gap:8px;color:var(--text-2);cursor:pointer}
.foot .ft b{font-weight:600;color:var(--text)}
.foot .ft span{margin-left:auto;color:var(--text-3)}
.foot .fm{display:grid;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);color:var(--text-2);font-size:12px}
`;
