/* =====================================================================
   views/sales-cut-estimate  ·  cut-est-1.0
   Окно Cut preview поверх списка Sales.
   IN : отмеченные строки списка Sales; прикидка erp/sales/cut-estimate
   OUT: окно — записи, «отдельно / вместе» и раскрой тем же экраном, что у
        батча (views/cut-layout-ui) с номером EST, без производственных кнопок

   Владелец, 2 октября 2026: «маленькой кнопкой, которая редиректит в
   какое-то окно». Кнопка — иконка на панели списка рядом со Stickers (и
   пункт Cut preview в меню правой кнопки). Окно во весь экран; ‹ Sales или
   Esc закрывают его, и прикидки после этого нет — в базе её не было.
   ===================================================================== */
function salesCutEstimateIds(){return [...salesListSel].filter(id=>cutEstUsable(salesRecord(id)));}
function salesCutEstimateOpen(ids){
 if(!cutEstOpen(ids))return;
 salesListMenu=null;render();
 /* Сразу Build: окно открывают, чтобы увидеть цифры. Идёт другой Build —
    этот начнётся после него. */
 cutBuildDone().then(()=>{if(cutEst&&!cutEst.plan)cutEstBuild();});
}
function salesCutEstimateClose(){cutEstClose();render();}
function cutEstBuild(){
 if(!cutEst)return Promise.resolve(null);
 cutInfo=null;cutWhat=null;
 return cutUiSteps(CUT_EST,cutEstSteps(),'Building',r=>{
  cutNotice=r&&r.error||'';
  if(r&&r.plan&&cutUi.batch===CUT_EST){cutUi.sheet=1;cutUi.sel='';}
 });
}
function salesCutEstimateToggle(key,on){cutEstToggle(key,on);render();}
function salesCutEstimateRevision(key,id){cutEstRevision(key,id);render();}
if(typeof document!=='undefined'&&!window.cutEstKeysOn){
 window.cutEstKeysOn=true;
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||!cutEst||tab!=='sales'||soEdit!==null)return;
  const t=e.target,tag=t&&t.tagName||'';
  if(/^(INPUT|SELECT|TEXTAREA)$/.test(tag)||typeof salesDialog!=='undefined'&&salesDialog)return;
  salesCutEstimateClose();
 });
}
/* Записи прикидки: галочка, вид, номер, ревизия квоты, клиент, сколько
   стёкол и каких. */
function salesCutEstimateRecs(busy){
 return cutEst.recs.map(r=>{
  const o=salesRecord(r.id);if(!o)return '';
  const q=salesIsQuote(o),scan=cutEstScan(o),members=q?salesQuoteMembers(o):[];
  const count=new Map();scan.pieces.forEach(x=>count.set(x.c.glass,(count.get(x.c.glass)||0)+1));
  const glass=[...count].sort((a,b)=>a[0].localeCompare(b[0])).map(([g,n])=>g+' '+n);
  const rev=members.length>1?`<select data-cut-est-rev="${esc(r.key)}" aria-label="Quote revision" ${busy?'disabled':''} onchange="salesCutEstimateRevision('${esc(r.key)}',this.value)">${members.map(m=>`<option value="${esc(m.id)}" ${m.id===r.id?'selected':''}>${esc(salesQuoteRevName(m))}</option>`).join('')}</select>`:'';
  return `<div class="cut-est-rec${r.on?'':' off'}" data-cut-est-rec="${esc(r.key)}"><label class="chk"><input type="checkbox" data-cut-est-on ${r.on?'checked':''} ${busy?'disabled':''} onchange="salesCutEstimateToggle('${esc(r.key)}',this.checked)">
   <span class="pill ${q?'kind-quote':'kind-order'}">${q?'Quote':'Order'}</span> <b class="mono">${esc(q?salesQuoteBaseNumber(o):o.businessNumber||'')}</b></label>${rev}
   <span>${esc(salesCustomerDisplay(o.customerId))}</span><span class="mut" data-cut-est-rec-pcs>${scan.pieces.length} pcs${glass.length?' · '+esc(glass.join(' · ')):''}</span></div>`;
 }).join('');
}
/* Какое стекло общее и сколько его в штуках: смешивать можно только одно
   стекло одной толщины. */
function salesCutEstimateGlass(){
 const list=cutEstGlass(cutPiecesOf(CUT_EST));if(!list.length)return '';
 const by=g=>[...g.by.values()].map(r=>esc(r.order)+' '+r.pcs).join(', ');
 return `<div class="cut-est-glass" data-cut-est-glass>${list.map(g=>`<span class="${g.ids.size>1?'':'mut'}" data-cut-est-shared="${g.ids.size>1}" data-cut-est-glass-pcs="${esc(g.glass)}:${g.pcs}"><b>${esc(g.glass)}</b> · ${g.mm} mm — <b>${g.pcs} pcs</b>${g.ids.size>1?' together: '+by(g):', only '+by(g)+' — nothing to mix'}</span>`).join('')}</div>`;
}
function salesCutEstimateSkipped(){
 const list=cutEstSkipped();if(!list.length)return '';
 const pcs=list.reduce((n,x)=>n+x.qty,0);
 return `<div class="cut-est-skip" data-cut-est-skipped><b>Skipped ${pcs} pcs</b> · ${list.slice(0,4).map(x=>esc(x.order+' / '+x.line+' · '+x.lite+' — '+x.reason)).join(' · ')}${list.length>4?' …':''}</div>`;
}
/* «Отдельно / вместе»: по каждому общему стеклу — отход записи, если резать
   её одну, и отход вместе; внизу — сколько листов отдельно и вместе. */
function salesCutEstimateCompare(){
 if(cutBusy&&cutEstIs(cutBusy.batch))return '';
 const list=cutEstCompare();if(!list.length)return '';
 const pct=v=>v==null?'—':cutNum(v,1)+'%';
 const diff=v=>v==null?'<span class="mut">—</span>':v<-0.05?`<b class="cut-win">−${cutNum(-v,1)}</b>`:v>0.05?`<span class="mut">+${cutNum(v,1)}</span>`:'<span class="mut">0</span>';
 return list.map(g=>{
  const all=g.rows.every(r=>r.alone),q=g.rows.some(r=>r.quick)?'≈':'';
  const aSheets=g.rows.reduce((n,r)=>n+(r.alone?r.alone.sheets:0),0),aUsed=g.rows.reduce((n,r)=>n+(r.alone?r.alone.used:0),0),aNet=g.rows.reduce((n,r)=>n+(r.alone?r.alone.net:0),0),aPct=all?cutPct(aNet,aUsed+aNet):null;
  const rows=g.rows.map(r=>`<tr data-cut-est-row="${esc(r.id)}"><td><b class="mono">${esc(r.order)}</b></td><td>${esc(r.customer)}</td><td class="n">${r.pcs}</td><td class="n">${cutNum(r.used,1)}</td>
   <td class="n">${r.alone?(r.quick?'≈':'')+r.alone.sheets:'—'}</td><td class="n" data-cut-est-alone>${r.alone?(r.quick?'≈':'')+pct(r.alonePct):'—'}</td><td class="n">${pct(g.pct)}</td><td class="n">${r.alonePct==null?'—':diff(g.pct-r.alonePct)}</td></tr>`).join('');
  const total=`<tr class="cut-est-total" data-cut-est-total><td colspan="2"><b>All</b></td><td class="n">${g.rows.reduce((n,r)=>n+r.pcs,0)}</td><td class="n">${cutNum(g.used,1)}</td>
   <td class="n" data-cut-est-sheets>${all?q+aSheets+' → <b>'+g.sheets+'</b>':'—'}</td><td class="n">${all?q+pct(aPct):'—'}</td><td class="n"><b>${pct(g.pct)}</b></td><td class="n">${all?diff(g.pct-aPct):'—'}</td></tr>`;
  return `<div class="cut-orders cut-est-compare" data-cut-est-compare="${esc(g.glass)}"><h4>Alone / together · ${esc(g.glass)} · ${g.mm} mm</h4>
   <table class="sl-table"><thead><tr><th>Order / quote</th><th>Customer</th><th class="n">Pcs</th><th class="n">Glass ft²</th><th class="n">Sheets alone</th><th class="n">Waste alone</th><th class="n">Waste together</th><th class="n">Change, pts</th></tr></thead><tbody>${rows}${total}</tbody></table></div>`;
 }).join('');
}
function viewSalesCutEstimate(){
 const est={number:CUT_EST,estimate:true},busy=!!cutBusy;
 /* Записи сканируются много раз за один показ — один раз на запись. */
 cutEstMemo=new Map();
 try{
  const head=cutLayoutHeader(est,'Preview'),on=cutEstRecords().length;
  return `<section class="optimization-queue glass-batches cut-est" data-cut-est>
  <div class="page-head cut-page-head-wrap"><div class="gb-page-title"><button type="button" class="gb-link" data-cut-est-close onclick="salesCutEstimateClose()">‹ Sales</button><h2>Cut preview</h2><p>${on} of ${cutEst.recs.length} selected · nothing is saved</p></div>${head}</div>
  <div class="card cut-est-head" data-cut-est-recs><div class="cut-est-recs">${salesCutEstimateRecs(busy)}</div>${salesCutEstimateGlass()}${salesCutEstimateSkipped()}</div>
  ${salesCutEstimateCompare()}
  <div class="card oq-card cut-card">${viewCutLayout(est)}</div>
 </section>`;
 }finally{cutEstMemo=null;}
}
