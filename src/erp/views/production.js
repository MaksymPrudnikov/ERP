/* =====================================================================
   view/production  ·  shopfloor-1.1
   Станции цеха и терминалы сканирования.
   IN : DB.station · DB.serviceRate · DB.terminal
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.

   Было четыре справочника, стало два. 11 сентября 2026 удалены ОПЕРАЦИИ и
   РАБОЧИЕ МЕСТА:

   · операции ушли в работы (Master Data → Works): там у строки есть и станция,
     и момент маршрута, и цена. Пока таблиц было две, маршрут и счёт читали
     разные источники и однажды разошлись бы;
   · рабочие места несли «кто на нём стоит» и «какой габарит». Первое — журнал
     сканов (учётка принадлежит терминалу станции, человек опознаётся бейджем),
     второе — ограничение станции. Владелец: «все станции по одной».

   Места вернутся в фазе планирования загрузки: там понадобятся объекты с
   садкой и вместимостью — печь и автоклав.
   ===================================================================== */

const SF_TABS=[
 {k:'stations',  label:'Stations'},
 {k:'terminals', label:'Terminals'}
];

function viewProduction(){
 if(!SF_TABS.some(t=>t.k===subtab)) subtab='stations';
 const pipeline=DB.station.map((s,i)=>{
  const w=stationOperations(s.code);
  return `${i?`<div class="pipe-arrow">${ico('arrow')}</div>`:''}<div class="stage"><div class="stage-top"><div class="stage-code" data-raw>${esc(s.code)}</div>${s.always?'<span class="pill ok">always</span>':''}</div><div class="stage-name">${sfLabel(s)}</div><div class="stage-count">${w.length?w.length+' работ':'<span class="mut">no works</span>'}</div></div>`;
 }).join('');
 const empty=DB.station.filter(s=>!stationOperations(s.code).length);
 const unmeasured=DB.station.filter(s=>!s.sizeMeasured).length;
 return `${referenceReseeded?'<div class="note" style="margin-bottom:14px">Reference tables updated: stations were reseeded from the factory data.</div>':''}
  <div class="card">
   <div class="section-title"><h3>Route by station</h3><span class="pill ${empty.length?'warn':'ok'}">${empty.length?empty.length+' без работ':'все заняты'}</span></div>
   <div class="pipeline">${pipeline}</div>
   ${empty.length?`<div class="note" style="margin-top:10px">Без работ: ${empty.map(s=>`<b>${raw(s.code)}</b>`).join(', ')}. Это не ошибка — станция ждёт своей работы в Master Data → Works.</div>`:''}
   ${unmeasured?`<div class="note" style="margin-top:10px"><b>Габариты не замерены: ${unmeasured} из ${DB.station.length}.</b> Стоит засев 144 × 100″ — габарит листа, а не станка. Пока замера нет, проверка «влезет ли деталь» опирается на предположение.</div>`:''}
  </div>
  <div class="card">
   <div class="tabs">${SF_TABS.map(t=>`<button class="${subtab===t.k?'on':''}" onclick="subtab='${t.k}';render()">${t.label}</button>`).join('')}</div>
   ${({stations:viewSfStations,terminals:viewSfTerminals})[subtab]()}
  </div>
  ${subtab==='stations'?sfImportCard():''}`;
}

/* --- 1. Станции ------------------------------------------------------ */
let stEdit=null;
/* Габарит без пометки о замере читается как факт. Пока его не подтвердили
   рулеткой, рядом обязана стоять оговорка — иначе деталь уедет на станцию,
   которая её не примет, а система будет утверждать, что всё влезает. */
function sfDimText(s){
 if(s.maxW==null&&s.maxL==null)return '<span class="mut">not set</span>';
 const v=`${s.maxW==null?'—':s.maxW} × ${s.maxL==null?'—':s.maxL}″`;
 return s.sizeMeasured?`<span data-raw>${esc(v)}</span>`:`<span data-raw>${esc(v)}</span><div class="mut">not verified in the shop</div>`;
}
function viewSfStations(){
 const rows=DB.station.map((s,i)=>{
  const w=stationOperations(s.code);
  return `<tr><td class="mono"><b>${s.seq}</b></td><td class="mono"><b>${raw(s.code)}</b></td><td>${sfLabel(s)}</td>
   <td><span class="pill ${s.always?'ok':'info'}">${s.always?'always':'when required'}</span></td>
   <td class="mono">${sfDimText(s)}</td>
   <td>${w.length?w.slice(0,6).map(o=>`<span class="pill info" data-raw>${esc(o.id)}</span>`).join(' ')+(w.length>6?` <span class="mut">+${w.length-6}</span>`:''):'<span class="mut">none</span>'}</td>
   <td class="mut" style="max-width:260px">${raw(s.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="stEdit=${i};render()">Edit</button>
   <button class="sm dl" onclick="delSfStation(${i})">×</button></td></tr>`;
 }).join('');
 return `${stEdit!==null?sfStationForm():''}
  <div class="sub">Route steps in order. The size answers one question: will the part fit. Until it is measured a note stands beside it — an assumption must not look like a fact.</div>
  <table><thead><tr><th>№</th><th>Code</th><th>Name</th><th>In route</th><th>Size, W × L</th><th>Works</th><th>Note</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="8" class="empty">empty</td></tr>'}</tbody></table>
  ${stEdit!==null?'':'<div class="row"><button class="pri" onclick="stEdit=&quot;new&quot;;render()">Add station</button></div>'}`;
}
function sfStationForm(){
 const r = stEdit==='new' ? {seq:(Math.max(0,...DB.station.map(s=>s.seq))+1),code:'',name:'',nameEn:'',always:false,maxW:null,maxL:null,sizeMeasured:false,note:''} : DB.station[stEdit];
 return `<div class="form"><h3>${stEdit==='new'?'New station':'Edit'}</h3>
  <div class="grid">
   <div><label>Sequence *</label><input id="sf_seq" type="number" min="1" step="1" value="${r.seq}"></div>
   <div><label>Code *</label><input id="sf_code" value="${esc(r.code)}"></div>
   <div><label>Name (RU) *</label><input id="sf_name" value="${esc(r.name)}"></div>
   <div><label>Name (EN)</label><input id="sf_nameEn" value="${esc(r.nameEn||'')}"></div>
   <div><label>Size W, inches</label><input id="sf_maxW" type="number" step="0.1" min="0" value="${r.maxW==null?'':r.maxW}"></div>
   <div><label>Size L, inches</label><input id="sf_maxL" type="number" step="0.1" min="0" value="${r.maxL==null?'':r.maxL}"></div>
   <div style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="sf_measured" ${r.sizeMeasured?'checked':''}> Size measured in the shop</label>
    <div class="hint">Without the checkbox the value counts as a seed and carries the note “not verified in the shop”.</div></div>
   <div style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="sf_always" ${r.always?'checked':''}> Always in the route</label>
    <div class="hint">"Always" means the station is in every part's route: cutting, shipping ready, shipping.</div></div>
  </div>
  <div style="margin-top:12px"><label>Note</label><input id="sf_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfStation"></div>
  <div class="row"><button class="pri" onclick="saveSfStation()">Save</button><button onclick="stEdit=null;render()">Cancel</button></div></div>`;
}
function saveSfStation(){
 const e=document.getElementById('e_sfStation'); e.style.display='none';
 const seq=+document.getElementById('sf_seq').value;
 const code=document.getElementById('sf_code').value.trim().toUpperCase();
 const name=document.getElementById('sf_name').value.trim();
 if(!Number.isInteger(seq)||seq<=0) return fail(e,'Sequence: a positive integer');
 if(!code||!name) return fail(e,'Code and name are required');
 if(!SF_CODE_RE.test(code)) return fail(e,'Code: use only A–Z, 0–9, hyphen and underscore');
 if(DB.station.some((s,i)=>i!==stEdit && s.code===code)) return fail(e,'This code already exists');
 const dim=id=>{const v=document.getElementById(id).value.trim();if(v==='')return null;const n=+v;return isFinite(n)&&n>0?n:NaN;};
 const maxW=dim('sf_maxW'),maxL=dim('sf_maxL');
 if(Number.isNaN(maxW)||Number.isNaN(maxL)) return fail(e,'Габарит: положительное число или пусто');
 const o={seq,code,name,nameEn:document.getElementById('sf_nameEn').value.trim(),
  always:document.getElementById('sf_always').checked,
  maxW,maxL,sizeMeasured:document.getElementById('sf_measured').checked,
  note:document.getElementById('sf_note').value.trim()};
 if(stEdit==='new') DB.station.push(o); else Object.assign(DB.station[stEdit],o);
 DB.station.sort((a,b)=>a.seq-b.seq);
 stEdit=null; touch(); render();
}
/* Станцию, на которую ссылаются работы, не удаляем: работа без станции —
   сирота, и увидит её только тот, кто откроет нужный экран. */
function delSfStation(i){
 const s=DB.station[i];
 if(stationOperations(s.code).length) return alert('Cannot delete — works belong to this station');
 if(DB.terminal.some(t=>(t.stations||[]).includes(s.code))) return alert('Cannot delete — terminals point at this station');
 if(!confirm('Delete this station?'))return; DB.station.splice(i,1); touch(); render();
}

/* --- 2. Терминалы ---------------------------------------------------- */
let tmEdit=null;
function viewSfTerminals(){
 const rows=DB.terminal.map((t,i)=>{
  return `<tr><td class="mono"><b>${raw(t.code)}</b></td><td>${sfLabel(t)}</td>
   <td>${(t.stations||[]).map(c=>`<span class="pill info" data-raw>${esc(c)}</span>`).join(' ')||'<span class="warn pill">no stations</span>'}</td>
   <td class="mut" style="max-width:260px">${raw(t.note||'')}</td>
   <td style="white-space:nowrap"><button class="sm" onclick="tmEdit=${i};render()">Edit</button>
   <button class="sm dl" onclick="delSfTerminal(${i})">×</button></td></tr>`;
 }).join('');
 return `${tmEdit!==null?sfTerminalForm():''}
  <div class="sub">The scanning screen. The account belongs to the station terminal and the individual operator is identified by a badge scan at the moment of the action: make people log in every shift and everyone will work under one shared account, leaving the event log useless.</div>
  <div class="note" style="margin-bottom:12px">This closes the most expensive defect in Spil: closing an operation that is not in the part’s route is physically impossible — it is simply not on the screen.</div>
  <table><thead><tr><th>Code</th><th>Name</th><th>Stations</th><th>Note</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="5" class="empty">The list is empty, and that is an honest state. How many screens stand in the shop and which stations sit on each is entered from the shop, not invented here.</td></tr>'}</tbody></table>
  ${tmEdit!==null?'':'<div class="row"><button class="pri" onclick="tmEdit=&quot;new&quot;;render()">Add terminal</button></div>'}`;
}
function sfTerminalForm(){
 const r = tmEdit==='new' ? {code:'',name:'',nameEn:'',stations:[],note:''} : DB.terminal[tmEdit];
 return `<div class="form"><h3>${tmEdit==='new'?'New terminal':'Edit'}</h3>
  <div class="grid">
   <div><label>Code *</label><input id="tm_code" value="${esc(r.code)}"></div>
   <div><label>Name (RU) *</label><input id="tm_name" value="${esc(r.name)}"></div>
   <div><label>Name (EN)</label><input id="tm_nameEn" value="${esc(r.nameEn||'')}"></div>
  </div>
  <div style="margin-top:12px"><label>Stations on this screen</label>
   <div style="display:flex;flex-wrap:wrap;gap:8px 16px">${DB.station.map(s=>`<label style="display:inline-flex;align-items:center;gap:6px;font-weight:400"><input type="checkbox" class="tm_st" value="${esc(s.code)}" ${(r.stations||[]).includes(s.code)?'checked':''}> <span data-raw>${esc(s.code)}</span></label>`).join('')}</div>
   <div class="hint">One screen serves several stations — the operator will not switch it.</div></div>
  <div style="margin-top:12px"><label>Note</label><input id="tm_note" value="${esc(r.note||'')}"></div>
  <div class="err" id="e_sfTerminal"></div>
  <div class="row"><button class="pri" onclick="saveSfTerminal()">Save</button><button onclick="tmEdit=null;render()">Cancel</button></div></div>`;
}
function saveSfTerminal(){
 const e=document.getElementById('e_sfTerminal'); e.style.display='none';
 const code=document.getElementById('tm_code').value.trim().toUpperCase();
 const name=document.getElementById('tm_name').value.trim();
 if(!code||!name) return fail(e,'Code and name are required');
 if(!SF_CODE_RE.test(code)) return fail(e,'Code: use only A–Z, 0–9, hyphen and underscore');
 if(DB.terminal.some((t,i)=>i!==tmEdit && t.code===code)) return fail(e,'This code already exists');
 const o={code,name,nameEn:document.getElementById('tm_nameEn').value.trim(),
  stations:[...document.querySelectorAll('.tm_st:checked')].map(x=>x.value),
  note:document.getElementById('tm_note').value.trim()};
 if(tmEdit==='new') DB.terminal.push(o); else Object.assign(DB.terminal[tmEdit],o);
 tmEdit=null; touch(); render();
}
function delSfTerminal(i){
 if(!confirm('Delete this terminal?'))return; DB.terminal.splice(i,1); touch(); render();
}

/* --- 3. Импорт станций ----------------------------------------------- */
let sfImportReport=null;
function sfImportCard(){
 return `<div class="card">
  <div class="section-title"><h3>Load STATIONS.csv</h3><span class="pill info">merged by code</span></div>
  <div class="sub">The file updates rows with the same codes and adds new ones. Rows missing from the file are left as they are — the import never erases anything silently.</div>
  <div class="row"><button onclick="document.getElementById('sfCsv').click()">Choose file</button>
   <input type="file" id="sfCsv" accept=".csv,.txt" style="display:none" onchange="sfImportCsv(this)"></div>
  ${sfImportReport?sfReportHTML(sfImportReport):''}</div>`;
}
function sfReportHTML(rep){
 const rejected=rep.rejected.map(r=>`<tr><td class="mono">${r.line?r.line:'—'}</td><td class="mono" data-raw>${esc(r.code)}</td><td>${esc(r.why)}</td></tr>`).join('');
 return `<div class="note" style="margin-top:12px">
   <b>Принято строк: ${rep.accepted}</b> — новых ${rep.added}, обновлено ${rep.updated}. Отклонено: ${rep.rejected.length}.
   ${rep.missing.length?`<div style="margin-top:6px">В файле не было, оставлены как есть: ${rep.missing.map(c=>`<b>${esc(c)}</b>`).join(', ')}</div>`:''}
  </div>
  ${rejected?`<table style="margin-top:10px"><thead><tr><th>Строка</th><th>Код</th><th>Почему отклонена</th></tr></thead><tbody>${rejected}</tbody></table>`:''}`;
}
function sfImportCsv(inp){
 const f=inp.files[0]; inp.value='';
 if(!f) return;
 if(f.size>2*1024*1024){alert('File not readable: CSV exceeds 2 MB.');return;}
 const r=new FileReader();
 r.onload=()=>{
  try{ sfImportReport=importStationsCsv(r.result); touch(); render(); }
  catch(e){ alert('File not readable: '+e.message); }
 };
 r.readAsText(f);
}
