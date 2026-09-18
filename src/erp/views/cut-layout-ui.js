/* =====================================================================
   views/cut-layout-ui  ·  cut-2.0
   Master Data → Cutting (параметры реза) и вкладка Optimization у батча:
   список стёкол, лист с подписями, потери, правки мышкой, печать.
   IN : DB.cutting, DB.cutPlan, открытый батч
   OUT: экран и печать; раскладку считает erp/production/cut-layout

   Владелец, 17 сентября 2026: функции как в Perfect Cut, вид наш —
   «приятно, логично, минималистично, эффективно». Поэтому: слева стёкла,
   справа лист, сверху цифры потерь и параметры прогона; действия — у
   выбранной детали, а не кнопками в каждой строке.
   ===================================================================== */
let cutNotice='',cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
/* ------------------------- Master Data → Cutting ------------------------- */
function cutMdSet(mm,field,value){
 const s=cutSettings(),row=s.rows.find(r=>r.mm===+mm);if(!row)return;
 const v=cutIn(value,null);if(v==null)return render();
 row[field]=v;normalizeCutting();touch();render();
}
function cutMdSetting(field,value){
 const s=cutSettings();
 if(field==='rotate')s.rotate=!!value;else s[field]=cutIn(value,s[field]);
 normalizeCutting();touch();render();
}
function cutMdSheetTrim(key,field,value){cutSheetTrimSet(key,field,value);render();}
function cutMdReset(){DB.cutting=cutSettingsDefault();normalizeCutting();touch();render();}
function viewMdCutting(){
 const s=cutSettings();
 const cell=(row,field)=>`<td class="n"><input type="text" data-cut-${field}="${row.mm}" value="${esc(frac16(row[field]))}" aria-label="${field} ${row.mm} mm" onchange="cutMdSet(${row.mm},'${field}',this.value)"><small>${esc(frac16(row[field==='trim'?'trimMin':'gapMin']))}</small></td>`;
 const rows=s.rows.map(r=>`<tr data-cut-row="${r.mm}"><td><b>${r.mm} mm</b></td>${cell(r,'trim')}${cell(r,'gap')}<td class="n"><input type="text" data-cut-minDist="${r.mm}" value="${esc(frac16(r.minDist))}" aria-label="min distance ${r.mm} mm" onchange="cutMdSet(${r.mm},'minDist',this.value)"></td></tr>`).join('');
 return `<div class="cut-md" data-cut-md>
  <div class="cut-md-head"><div><h3>Cutting parameters</h3><p class="mut">Trim — off the sheet edge. Shape gap and min distance — around shaped pieces only; rectangles are cut edge to edge. Small number — the shop minimum.</p></div>
   <button type="button" data-cut-reset onclick="cutMdReset()">Reset to shop table</button></div>
  <div class="sales-table-wrap"><table class="ncr-table cut-table"><thead><tr><th>Thickness</th><th class="n">Trim</th><th class="n">Shape gap</th><th class="n">Min distance</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${(function(){const sizes=cutSheetSizes();if(!sizes.length)return '<p class="mut cut-md-note" data-cut-sheets-empty>Sheet sizes appear here from the glass supply rows in Materials.</p>';
   return `<h4 class="cut-md-sub">Trim by sheet size</h4><p class="mut">Each size is trimmed its own way: 130 and 144 are not the same. Empty — the value by thickness.</p>
   <div class="sales-table-wrap"><table class="ncr-table cut-table" data-cut-sheet-table><thead><tr><th>Sheet</th><th>Glass</th><th class="n">Trim X</th><th class="n">Trim Y</th></tr></thead><tbody>${sizes.map(x=>{const own=cutSheetTrim(x.key)||{};
    return `<tr data-cut-sheet-row="${esc(x.key)}"><td><b>${esc(frac16(x.w))} × ${esc(frac16(x.h))}″</b></td><td class="mut">${esc(x.codes.slice(0,4).join(', '))}</td>
     <td class="n"><input type="text" data-cut-trimx="${esc(x.key)}" value="${own.x==null?'':esc(frac16(own.x))}" placeholder="—" aria-label="Trim X ${esc(x.key)}" onchange="cutMdSheetTrim('${esc(x.key)}','trimX',this.value)"></td>
     <td class="n"><input type="text" data-cut-trimy="${esc(x.key)}" value="${own.y==null?'':esc(frac16(own.y))}" placeholder="—" aria-label="Trim Y ${esc(x.key)}" onchange="cutMdSheetTrim('${esc(x.key)}','trimY',this.value)"></td></tr>`;}).join('')}</tbody></table></div>`;})()}
  <div class="cut-md-foot">
   <label><span class="ncr-label">MIN OFFCUT W</span><input type="text" data-cut-offcut-w value="${esc(frac16(s.minOffcutW))}" onchange="cutMdSetting('minOffcutW',this.value)"></label>
   <label><span class="ncr-label">MIN OFFCUT H</span><input type="text" data-cut-offcut-h value="${esc(frac16(s.minOffcutH))}" onchange="cutMdSetting('minOffcutH',this.value)"></label>
   <label class="chk"><input type="checkbox" data-cut-rotate ${s.rotate?'checked':''} onchange="cutMdSetting('rotate',this.checked)"> Rotate pieces on the sheet</label>
  </div></div>`;
}
/* --------------------------- Батч → Optimization -------------------------- */
function cutUiState(number){
 if(cutUi.batch!==number){cutUi={batch:number,glass:'',sheet:1,sel:'',drag:''};}
 const plan=cutPlanFor(number);
 if(plan&&plan.groups.length){
  if(!plan.groups.some(g=>g.glass===cutUi.glass))cutUi.glass=plan.groups[0].glass;
  const g=plan.groups.find(x=>x.glass===cutUi.glass);
  if(g&&!g.sheets.some(s=>s.no===cutUi.sheet))cutUi.sheet=g.sheets.length?g.sheets[0].no:1;
 }
 return cutUi;
}
function cutRunBatch(number){const r=cutPlanRun(number);cutNotice=r.error||'';render();}
function cutUiPick(pieceId){cutUi.sel=cutUi.sel===pieceId?'':pieceId;const at=cutUi.sel&&cutFind(cutPlanFor(cutUi.batch)||{groups:[]},cutUi.sel);if(at){cutUi.glass=at.group.glass;cutUi.sheet=at.sheet.no;}render();}
function cutUiSheet(glass,no){cutUi.glass=glass;cutUi.sheet=+no;render();}
function cutUiStep(glass,delta){
 const plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass);if(!g)return;
 const i=g.sheets.findIndex(x=>x.no===cutUi.sheet),next=g.sheets[Math.min(g.sheets.length-1,Math.max(0,i+delta))];
 if(next)cutUiSheet(glass,next.no);
}
function cutUiRun(fn){const r=fn();cutNotice=r&&r.error||'';render();}
function cutUiRotate(){cutUiRun(()=>cutPieceRotate(cutUi.batch,cutUi.sel));}
function cutUiTake(){cutUiRun(()=>cutPieceTake(cutUi.batch,cutUi.sel));}
function cutUiLock(){cutUiRun(()=>cutPieceLock(cutUi.batch,cutUi.sel));}
function cutUiStock(glass,key,field,value){cutUiRun(()=>cutSetStock(cutUi.batch,glass,key,field,value));}
function cutUiParam(glass,field,value){cutUiRun(()=>cutSetParam(cutUi.batch,glass,field,value));}
function cutUiResetParams(glass){cutUiRun(()=>cutResetParams(cutUi.batch,glass));}
function cutUiSheetLock(){cutUiRun(()=>cutSheetLock(cutUi.batch,cutUi.glass,cutUi.sheet));}
function cutUiSet(pieceId,field,value){cutUiRun(()=>cutSetting(cutUi.batch,pieceId,field,value));}
function cutUiDragStart(e,pieceId){cutUi.drag=pieceId;cutUi.sel=pieceId;try{e.dataTransfer.setData('text/plain',pieceId);e.dataTransfer.effectAllowed='move';}catch(x){}}
/* Бросок на лист: координаты пересчитываются из экранных в дюймы. */
function cutUiDrop(e,glass,sheetNo){
 e.preventDefault();const id=cutUi.drag;cutUi.drag='';if(!id)return;
 const box=e.currentTarget.getBoundingClientRect(),plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass);
 if(!g)return;
 const scale=box.width/g.sheet.w,x=(e.clientX-box.left)/scale,y=(e.clientY-box.top)/scale;
 cutUiRun(()=>cutPiecePlace(cutUi.batch,id,sheetNo,Math.max(0,x),Math.max(0,y)));
}
/* Клик по детали выбирает её, клик по свободному месту — переносит туда.
   Тащить прямоугольник SVG мышью браузер не даёт, а два клика понятны. */
function cutUiPaperClick(e,glass,sheetNo){
 const id=e.target&&e.target.dataset&&e.target.dataset.cutPiece;
 if(id){cutUiPick(id);return;}
 if(!cutUi.sel)return;
 const box=e.currentTarget.getBoundingClientRect(),plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass);
 if(!g)return;
 const scale=box.width/g.sheet.w;
 cutUiRun(()=>cutPiecePlace(cutUi.batch,cutUi.sel,sheetNo,Math.max(0,(e.clientX-box.left)/scale),Math.max(0,(e.clientY-box.top)/scale)));
}
function cutUiTabDrop(e,glass,sheetNo){
 e.preventDefault();const id=cutUi.drag;cutUi.drag='';if(!id)return;
 cutUi.glass=glass;cutUi.sheet=+sheetNo;cutUiRun(()=>cutPieceAuto(cutUi.batch,id,sheetNo));
}
function cutUiDropList(e){
 e.preventDefault();const id=cutUi.drag;cutUi.drag='';
 if(id)cutUiRun(()=>cutPieceTake(cutUi.batch,id));
}
/* ------------------------------- Схема листа ------------------------------ */
function cutSheetSVG(group,sheet,px,pieces,opts){
 opts=opts||{};
 const size=sheet.size||group.sheet,S=px/Math.max(size.w,size.h),W=size.w*S,H=size.h*S,by=new Map((pieces||[]).map(p=>[p.piece,p]));
 const out=['<svg viewBox="0 0 '+W.toFixed(1)+' '+H.toFixed(1)+'" width="'+W.toFixed(0)+'" height="'+H.toFixed(0)+'" class="cut-svg" font-family="Helvetica, Arial, sans-serif">',
  '<rect width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'" fill="#f2f4f7" stroke="#d0d5dd"/>'];
 if(sheet.offcut){const o=sheet.offcut;
  out.push('<rect x="'+(o.x*S).toFixed(1)+'" y="'+(o.y*S).toFixed(1)+'" width="'+(o.w*S).toFixed(1)+'" height="'+(o.h*S).toFixed(1)+'" fill="#ffffff" stroke="#98a2b3" stroke-dasharray="5 4"/>');
  if(o.w*S>70&&o.h*S>16)out.push('<text x="'+((o.x+o.w/2)*S).toFixed(1)+'" y="'+((o.y+o.h/2)*S+4).toFixed(1)+'" text-anchor="middle" font-size="10" fill="#667085">Offcut '+esc(frac16(o.w))+' × '+esc(frac16(o.h))+'″</text>');}
 sheet.pieces.forEach((p,i)=>{
  const x=p.x*S,y=p.y*S,w=p.w*S,h=p.h*S,src=by.get(p.piece)||{},sel=opts.sel===p.piece;
  out.push('<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="#ffffff" stroke="'+(sel?'#1f6f9f':'#101828')+'" stroke-width="'+(sel?2:1)+'"'+(opts.ids?' data-cut-piece="'+esc(p.piece)+'"':'')+'/>');
  const lines=[];
  if(h>52&&w>84){lines.push([src.customer||'',9,'#475467'],[(src.order?src.order+' / '+src.line:''),10,'#101828'],[String(i+1),15,'#101828'],[frac16(p.w)+' × '+frac16(p.h)+'″'+(p.rot?' ⟲':''),9,'#475467']);}
  else if(h>30&&w>64)lines.push([String(i+1)+' · '+frac16(p.w)+' × '+frac16(p.h)+'″',9,'#101828']);
  else if(h>12&&w>18)lines.push([String(i+1),9,'#101828']);
  const total=lines.reduce((a,l)=>a+l[1]*1.25,0);let ty=y+h/2-total/2;
  lines.forEach(l=>{ty+=l[1]*1.15;if(l[0])out.push('<text x="'+(x+w/2).toFixed(1)+'" y="'+ty.toFixed(1)+'" text-anchor="middle" font-size="'+l[1]+'" fill="'+l[2]+'">'+esc(l[0])+'</text>');});
  if(p.locked&&w>20&&h>20)out.push('<text x="'+(x+w-4).toFixed(1)+'" y="'+(y+11).toFixed(1)+'" text-anchor="end" font-size="9" fill="#93370d">lock</text>');
 });
 return out.join('')+'</svg>';
}
/* --------------------------------- Печать -------------------------------- */
function cutPrintHost(){let h=document.getElementById('cutPrintHost');if(!h){h=document.createElement('div');h.id='cutPrintHost';document.body.appendChild(h);}return h;}
function cutPrintCleanup(){document.body.classList.remove('cut-printing');const h=document.getElementById('cutPrintHost');if(h)h.innerHTML='';}
function cutPrintLayouts(number){
 const plan=cutPlanFor(number);if(!plan)return false;
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),by=new Map(pieces.map(p=>[p.piece,p])),pages=[];
 plan.groups.forEach(g=>g.sheets.forEach(s=>{
  const rows=s.pieces.map((p,i)=>{const src=by.get(p.piece)||{};
   return `<tr><td>${i+1}</td><td>${esc(p.piece)}</td><td>${esc(src.customer||'')}</td><td>${esc(src.order||'')} / ${src.line||''}</td><td>${esc(src.mark||'')}</td><td>${esc(frac16(p.w))} × ${esc(frac16(p.h))}″</td><td>${p.rot?'rotated':''}</td></tr>`;}).join('');
  pages.push(`<div class="cut-print-page"><h3>Batch ${esc(number)} · Sheet ${s.no} · ${esc(g.glass)} ${g.mm} mm · ${esc(frac16(g.sheet.w))} × ${esc(frac16(g.sheet.h))}″</h3>
   <p>Used ${s.used} ft² · Scrap ${s.gross} ft² · Net ${s.net} ft²${s.offcut?' · Offcut '+esc(frac16(s.offcut.w))+' × '+esc(frac16(s.offcut.h))+'″':''}</p>
   <div class="cut-print-sheet">${cutSheetSVG(g,s,520,pieces)}</div>
   <table class="cut-print-table"><thead><tr><th>#</th><th>Glass ID</th><th>Customer</th><th>Order</th><th>Mark</th><th>Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
 }));
 if(!pages.length)return false;
 cutPrintHost().innerHTML=pages.join('');
 document.body.classList.add('cut-printing');
 window.addEventListener('afterprint',cutPrintCleanup,{once:true});setTimeout(cutPrintCleanup,60000);
 try{window.print();}catch(e){cutPrintCleanup();return false;}
 return true;
}
/* --------------------------------- Экран --------------------------------- */
function cutStatsBar(plan,sheet){
 const cell=(k,v)=>`<span><small>${k}</small><b>${v}</b></span>`;
 const cur=sheet?`<div class="cut-stat" data-cut-current><i>This sheet</i>${cell('Used',sheet.used+' ft²')}${cell('Scrap',sheet.gross+' ft²')}${cell('Net',sheet.net+' ft²')}${cell('Used %',(sheet.used+sheet.net?Math.round(sheet.used/(sheet.used+sheet.net)*1000)/10:0)+'%')}</div>`:'';
 const s=plan.stats;
 return `${cur}<div class="cut-stat" data-cut-total><i>All sheets</i>${cell('Used',s.used+' ft²')}${cell('Scrap',s.gross+' ft²')}${cell('Net',s.net+' ft²')}${cell('Used %',s.usedPct+'%')}${cell('Net %',s.netPct+'%')}${cell('Sheets',s.sheets)}${cell('Pieces',s.placed+' / '+s.total)}</div>`;
}
function cutPieceRow(p,at,sel){
 const place=at?at.sheet.no+' · '+(at.index+1):'—';
 return `<tr data-cut-list="${esc(p.piece)}" class="${sel?'on':''}${p.off?' off':''}" draggable="true" ondragstart="cutUiDragStart(event,'${esc(p.piece)}')" onclick="cutUiPick('${esc(p.piece)}')">
  <td><input type="checkbox" data-cut-on ${p.off?'':'checked'} aria-label="Cut ${esc(p.piece)}" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','off',!this.checked)"></td>
  <td class="gb-piece">${esc(p.piece)}</td><td class="nowrap">${esc(frac16(p.w))} × ${esc(frac16(p.h))}″${p.shape?' <span class="pill">shape</span>':''}</td>
  <td><button type="button" class="gb-link" data-cut-open="${esc(p.orderId)}" title="Open the order and its shape" onclick="event.stopPropagation();optimizationOpenOrder('${esc(p.orderId)}')">${esc(p.order)} / ${p.line}</button>${p.mark?' · '+esc(p.mark):''}</td><td>${esc(p.customer)}</td>
  <td class="n"><input type="number" min="1" max="10" step="1" data-cut-priority value="${p.priority}" aria-label="Priority" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','priority',this.value)"></td>
  <td class="n">${place}</td></tr>`;
}
function viewCutLayout(b){
 const s=cutUiState(b.number),plan=cutPlanFor(b.number),stale=plan&&cutPlanStale(b.number);
 const head=`<div class="oq-toolbar cut-toolbar">${plan?`<b data-cut-stats>${plan.stats.sheets} sheet${plan.stats.sheets===1?'':'s'} · ${plan.stats.placed} / ${plan.stats.total} pcs · net ${plan.stats.netPct}%</b>`:'<b data-cut-stats>Not optimized</b>'}
  <span class="sp"></span>${plan?`<button type="button" data-cut-print onclick="cutPrintLayouts('${esc(b.number)}')">Print layouts</button>`:''}
  <button type="button" class="pri" data-cut-run onclick="cutRunBatch('${esc(b.number)}')">${plan?'Re-optimize':'Optimize'}</button></div>`;
 const notice=cutNotice?`<div class="ncr-error" role="alert" data-cut-error>${esc(cutNotice)}</div>`:stale?'<div class="ncr-warning" data-cut-stale>⚠ Batch changed after the layout — re-optimize.</div>':'';
 if(!plan)return `${head}${notice}<p class="mut cut-empty">Optimize lays this batch on sheets: one glass, orders mixed, rectangles cut edge to edge. Sheet size comes from Master Data.</p>`;
 const pieces=cutPieces(b,plan.settings||{}),group=plan.groups.find(g=>g.glass===s.glass)||plan.groups[0];
 const sheet=group&&(group.sheets.find(x=>x.no===s.sheet)||group.sheets[0]);
 const at=id=>cutFind(plan,id);
 const placed=new Set();plan.groups.forEach(g=>g.sheets.forEach(x=>x.pieces.forEach(p=>placed.add(p.piece))));
 const waiting=pieces.filter(p=>!p.off&&!placed.has(p.piece)),onSheet=pieces.filter(p=>placed.has(p.piece)),off=pieces.filter(p=>p.off);
 const rows=list=>list.map(p=>cutPieceRow(p,at(p.piece),s.sel===p.piece)).join('');
 const listTable=body=>`<table class="sl-table cut-list"><thead><tr><th></th><th>Glass ID</th><th>Cut size</th><th>Order</th><th>Customer</th><th class="n">Pri</th><th class="n">Sheet</th></tr></thead><tbody>${body}</tbody></table>`;
 const selAt=s.sel?at(s.sel):null,selSrc=pieces.find(p=>p.piece===s.sel);
 const actions=selSrc?`<div class="cut-actions" data-cut-actions><b>${esc(selSrc.piece)}</b><span class="mut">${esc(frac16(selSrc.w))} × ${esc(frac16(selSrc.h))}″ · ${esc(selSrc.order)} / ${selSrc.line}</span><span class="sp"></span>
  <button type="button" data-cut-rotate ${selAt?'':'disabled'} onclick="cutUiRotate()">Rotate</button>
  <button type="button" data-cut-take ${selAt?'':'disabled'} onclick="cutUiTake()">Take off</button>
  <button type="button" class="${selAt&&selAt.piece.locked?'on':''}" data-cut-lock ${selAt?'':'disabled'} onclick="cutUiLock()">${selAt&&selAt.piece.locked?'Unlock':'Lock'}</button></div>`:'';
 /* До восьми листов — вкладки; дальше стрелки и выбор: батч бывает на
    десятки листов, и вкладками его не пролистать. */
 const many=group&&group.sheets.length>8;
 const tabs=!group?'':many
  ?`<div class="cut-nav"><button type="button" data-cut-prev ${sheet.no<=group.sheets[0].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',-1)">‹</button>
    <select data-cut-jump onchange="cutUiSheet('${esc(group.glass)}',this.value)">${group.sheets.map(x=>`<option value="${x.no}" ${x.no===sheet.no?'selected':''}>Sheet ${x.no}${x.locked?' · locked':''} · ${x.pieces.length} pcs · net ${x.net} ft²</option>`).join('')}</select>
    <button type="button" data-cut-next ${sheet.no>=group.sheets[group.sheets.length-1].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',1)">›</button>
    <span class="mut">${sheet.no} / ${group.sheets.length}</span></div>`
  :group.sheets.map(x=>`<button type="button" class="${x.no===sheet.no?'on':''}" data-cut-tab="${x.no}" ondragover="event.preventDefault()" ondrop="cutUiTabDrop(event,'${esc(group.glass)}',${x.no})" onclick="cutUiSheet('${esc(group.glass)}',${x.no})">Sheet ${x.no}${x.locked?' 🔒':''}<small>${x.pieces.length} pcs · net ${x.net} ft²</small></button>`).join('');
 const glasses=plan.groups.length>1?`<div class="stk-seg cut-glass">${plan.groups.map(g=>`<button type="button" class="${g.glass===group.glass?'on':''}" data-cut-glass="${esc(g.glass)}" onclick="cutUiSheet('${esc(g.glass)}',1)">${esc(g.glass)} · ${g.mm} mm</button>`).join('')}</div>`:'';
 /* Все переменные правятся здесь же: склад листов прогона и параметры реза.
    Master Data остаётся значением по умолчанию. */
 const pick=group&&plan.sheetPick&&plan.sheetPick[group.glass]||{},stock=group?cutStockFor(group.glass,pick):[];
 const allSizes=group?cutSheetOptions(group.glass):[];
 const num=(label,field,value,ph)=>`<label>${label} <input type="text" data-cut-param="${field}" value="${esc(value)}" ${ph?'placeholder="'+ph+'"':''} onchange="cutUiParam('${esc(group.glass)}','${field}',this.value)"></label>`;
 const stockRows=allSizes.map(x=>{const key=cutSheetKey(x),row=stock.find(r=>r.key===key),on=!!row,used=group.sheets.filter(sh=>(sh.size||group.sheet).key===key||cutSheetKey(sh.size||group.sheet)===key).length;
  return `<div class="cut-stock-row${on?'':' off'}" data-cut-stock="${esc(key)}">
   <label class="chk"><input type="checkbox" data-cut-use ${on?'checked':''} onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','off',!this.checked)"> ${esc(frac16(x.w))} × ${esc(frac16(x.h))}″</label>
   <input type="number" min="0" step="1" data-cut-qty value="${row&&row.limit?row.limit:''}" placeholder="all" aria-label="Sheets available ${esc(key)}" onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','limit',this.value)">
   <span class="mut">${used?'used '+used:''}</span>
   <button type="button" class="gb-link" data-cut-first onclick="cutUiStock('${esc(group.glass)}','${esc(key)}','first',1)">use first</button></div>`;}).join('');
 const params=group?`<div class="cut-params" data-cut-params>
  <div class="cut-stock"><span class="ncr-label">SHEETS</span>${stockRows}</div>
  <div class="cut-knobs">
   ${num('Trim X','trimX',frac16(group.params.trimX))}${num('Trim Y','trimY',frac16(group.params.trimY))}
   ${num('Shape gap','gap',frac16(group.params.gap))}${num('Min dist','minDist',frac16(group.params.minDist))}
   ${num('Min offcut W','minOffcutW',frac16(group.params.minOffcutW))}${num('H','minOffcutH',frac16(group.params.minOffcutH))}
   <label class="chk"><input type="checkbox" data-cut-rot ${group.params.rotate?'checked':''} onchange="cutUiParam('${esc(group.glass)}','rotate',this.checked)"> Rotate</label>
   <button type="button" class="gb-link" data-cut-reset-params onclick="cutUiResetParams('${esc(group.glass)}')">Reset to Master Data</button></div></div>`:'';
 const orders=(plan.orders||[]).length?`<div class="cut-orders" data-cut-orders><h4>Waste by order</h4><table class="sl-table"><thead><tr><th>Order</th><th>Customer</th><th class="n">Pcs</th><th class="n">Glass ft²</th><th class="n">Net scrap ft²</th><th class="n">%</th></tr></thead><tbody>${plan.orders.map(o=>`<tr><td>${esc(o.order)}</td><td>${esc(o.customer)}</td><td class="n">${o.pieces}</td><td class="n">${o.used}</td><td class="n">${o.net}</td><td class="n">${o.pct}%</td></tr>`).join('')}</tbody></table></div>`:'';
 return `${head}${notice}${params}<div class="cut-stats">${cutStatsBar(plan,sheet)}</div>
 <div class="cut-grid">
  <div class="cut-side" ondragover="event.preventDefault()" ondrop="cutUiDropList(event)">
   ${waiting.length?`<div class="cut-list-head" data-cut-waiting>Not on a sheet · ${waiting.length}</div>${listTable(rows(waiting))}`:''}
   <div class="cut-list-head">On sheets · ${onSheet.length}</div>${listTable(rows(onSheet))}
   ${off.length?`<div class="cut-list-head" data-cut-off>Not cutting · ${off.length}</div>${listTable(rows(off))}`:''}
  </div>
  <div class="cut-sheet-pane">${glasses}<div class="cut-tabs">${tabs}</div>
   ${sheet?`<div class="cut-sheet-head"><b>Sheet ${sheet.no}</b><span class="mut">${esc(frac16((sheet.size||group.sheet).w))} × ${esc(frac16((sheet.size||group.sheet).h))}″ · ${sheet.pieces.length} pcs · used ${sheet.used} ft² · net ${sheet.net} ft²</span><span class="sp"></span>
    <button type="button" class="${sheet.locked?'on':''}" data-cut-sheet-lock onclick="cutUiSheetLock()">${sheet.locked?'Unlock sheet':'Lock sheet'}</button></div>
   <div class="cut-paper" data-cut-sheet="${sheet.no}" ondragover="event.preventDefault()" ondrop="cutUiDrop(event,'${esc(group.glass)}',${sheet.no})" onclick="cutUiPaperClick(event,'${esc(group.glass)}',${sheet.no})">${cutSheetSVG(group,sheet,520,pieces,{sel:s.sel,ids:true})}</div>`:'<p class="mut">No sheets.</p>'}
   ${actions}<p class="mut cut-hint">Drag a piece onto the sheet · click a piece, then a free spot to move it</p>
  </div>
 </div>${orders}`;
}
