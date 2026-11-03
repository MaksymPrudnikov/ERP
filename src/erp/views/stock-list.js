/* =====================================================================
   views/stock-list  ·  stock-1.0
   Optimization → Stock: журнал стёкол, забуканных в сток из раскроя.
   IN : DB.stockOffcut (erp/production/stock-offcuts)
   OUT: экран списка, печать стикера, возврат в отход

   Владелец, 20 сентября 2026: остатки как «бесплатные листы» в раскрое —
   «идея хорошая, но не рабочая пока на производстве, потом к ней придём;
   сейчас пусть будет учёт тех стёкол, которые попали в сток, не только
   стикеры». Поэтому здесь только учёт: что лежит, какого размера, откуда,
   когда и стикер. Ничего сам не двигает.
   ===================================================================== */
let stockShowOff=false,stockInfo=null;
function stockUiShowOff(on){stockShowOff=!!on;render();}
function stockUiPrint(id){if(typeof stkPrintStock==='function')stkPrintStock([id]);}
function stockUiDrop(id){
 const r=stockOffcutFind(id);if(!r)return;
 if(!confirm('Put '+id+' back to waste? The sticker on the rack becomes invalid.'))return;
 const out=stockOffcutDrop(id);cutNotice=out.error||'';render();
}
/* Куда кусок уже обещан: отмечен в батче (picked) или уже лежит в его
   раскрое (laid). Физически он один — второй батч его не увидит. */
function stockUiWhere(id){
 for(const p of (DB.cutPlan||[])){
  if(!p)continue;
  if(!p.reset&&(p.groups||[]).some(g=>g.sheets.some(s=>s.size&&s.size.key===id)))return {batch:p.batch,laid:true};
  if(Object.keys(p.sheetPick||{}).some(glass=>((p.sheetPick[glass]||{}).sizes||[]).some(r=>r&&r.key===id&&r.off===false)))return {batch:p.batch,laid:false};
 }
 return null;
}
/* Открытые батчи с тем же стеклом, где рез ещё не начат. */
function stockUiBatches(rec){
 return (DB.glassBatch||[]).filter(b=>{
  /* Батч, из которого кусок вырезан, — не предлагаем: пока его не порежут,
     куска физически нет. */
  if(b.number===rec.batch)return false;
  const live=b.items.filter(i=>!i.releasedAt);
  if(!live.length||live.some(i=>i.cutStartedAt))return false;
  return cutPieces(b,cutSettingsOf(b.number)).some(p=>!p.off&&p.glass===rec.glass&&(!rec.mm||!p.mm||p.mm===rec.mm));
 }).map(b=>({number:b.number,pieces:cutPieces(b,cutSettingsOf(b.number)).filter(p=>!p.off).length}))
  .sort((a,b)=>b.number.localeCompare(a.number));
}
/* Выбрать кусок для батча прямо со стеллажа: отметка встаёт в его таблице
   SHEETS, дальше человек жмёт Build. «Я могу выбрать стоковый лист для
   какого-то из батчей?» (владелец, 20 сентября 2026). */
function stockUiUse(id,number){
 const rec=stockOffcutFind(id);if(!rec)return;
 const plan=cutPlanFor(number);
 if(plan&&!plan.reset){
  if(!confirm('Reset the optimization of '+number+' and add '+id+'? Its layout is built again.'+cutResetWarn(number)))return;
  cutPlanReset(number);
 }
 const r=cutSetStock(number,rec.glass,id,'off',false);
 cutNotice=r.error||'';stockInfo=r.error?null:{id,batch:number,used:true};render();
}
function stockUiRelease(id,number){
 const rec=stockOffcutFind(id);if(!rec)return;
 if(!confirm('Take '+id+' out of '+number+'?'))return;
 const plan=cutPlanFor(number);
 if(plan&&!plan.reset)cutPlanReset(number);
 const r=cutSetStock(number,rec.glass,id,'off',true);
 cutNotice=r.error||'';stockInfo=r.error?null:{id,batch:number,used:false};render();
}
function stockUiUseMenu(e,id){
 e.preventDefault();e.stopPropagation();cutUiMenuClose();
 const rec=stockOffcutFind(id);if(!rec)return;
 const rows=[],act=cutMenuAct(rows),list=stockUiBatches(rec);
 rows.push(`<div class="cut-menu-head">${esc(id)} · ${esc(frac16(rec.w))} × ${esc(frac16(rec.h))}″</div>`);
 if(!list.length)rows.push('<div class="cut-menu-sub">No open batch with this glass</div>');
 list.slice(0,8).forEach(x=>act('Use in '+x.number+' · '+x.pieces+' glass','',()=>stockUiUse(id,x.number),'data-stock-use="'+esc(x.number)+'"'));
 const r=e.currentTarget.getBoundingClientRect();cutUiMenuShow(rows,r.left,r.bottom+4);
}
function stockUiOpenBatch(number){stockInfo=null;optimizationSetTab('production');glassBatchOpen(number);glassBatchDetailTab='optimization';render();}
/* Действия над отмеченным куском — над таблицей, как в Sales (владелец, 03.11.2026). */
let stockSel='';
function stockUiSelect(id,on){stockSel=on?id:'';render();}
function stockUiContext(e,id){
 e.preventDefault();e.stopPropagation();stockSel=id;render();
 const rec=stockOffcutFind(id);if(!rec)return;
 const rows=[],act=cutMenuAct(rows),w=rec.status==='stock'?stockUiWhere(id):null;
 if(w){act('Open '+w.batch,'',()=>stockUiOpenBatch(w.batch));act('Release','',()=>stockUiRelease(id,w.batch));}
 else if(rec.status==='stock'){stockUiBatches(rec).slice(0,8).forEach(x=>act('Use in '+x.number+' · '+x.pieces+' glass','',()=>stockUiUse(id,x.number)));act('Sticker','',()=>stockUiPrint(id));act('Back to waste','',()=>stockUiDrop(id));}
 if(rows.length)cutUiMenuShow(rows,e.clientX,e.clientY);
}
function stockUiBar(rows){
 const r=rows.find(x=>x.id===stockSel),w=r&&r.status==='stock'?stockUiWhere(r.id):null,id=r?esc(r.id):'';
 const b=(attr,label,fn,on,cls)=>`<button type="button" class="sl-quiet${cls?' '+cls:''}" ${attr} ${on?'':'disabled'} onclick="${fn}">${label}</button>`;
 return b('data-stock-open',w?'Open '+esc(w.batch):'Open batch',w?`stockUiOpenBatch('${esc(w.batch)}')`:'',!!w)+b('data-stock-release','Release',w?`stockUiRelease('${id}','${esc(w.batch)}')`:'',!!w)
  +b('data-stock-use-menu','Use in batch ▾',`stockUiUseMenu(event,'${id}')`,!!r&&r.status==='stock'&&!w)+b('data-stock-print','Sticker',`stockUiPrint('${id}')`,!!r&&r.status==='stock'&&!w)
  +b('data-stock-drop','Back to waste',`stockUiDrop('${id}')`,!!r&&r.status==='stock'&&!w,'sl-delete-quiet');
}
function viewStockList(){
 const rows=stockOffcutRows(),live=rows.filter(r=>r.status==='stock'),off=rows.filter(r=>r.status!=='stock');
 const shown=stockShowOff?rows:live;
 const row=r=>`<tr data-stock-row="${esc(r.id)}" class="${r.status==='stock'?'':'off'}${stockSel===r.id?' oq-selected':''}" oncontextmenu="stockUiContext(event,'${esc(r.id)}')">
  <td class="sl-check"><input type="checkbox" data-stock-check aria-label="Select ${esc(r.id)}" ${stockSel===r.id?'checked':''} onchange="stockUiSelect('${esc(r.id)}',this.checked)"></td>
  <td><span class="pill ${r.status==='stock'?'ok':''}">${esc(r.id)}</span></td>
  <td>${esc(r.glass)}${r.mm?' · '+r.mm+' mm':''}</td>
  <td class="nowrap"><b>${esc(frac16(r.w))} × ${esc(frac16(r.h))}″</b></td>
  <td class="n">${r.area}</td>
  <td>${esc(r.batch)}${r.sheet?' · sheet '+r.sheet:''}</td>
  <td>${esc(salesShortDate(r.at))}</td>
  <td>${r.status!=='stock'?'<span class="mut">Back to waste</span>':(w=>w?`<span class="pill" data-stock-in>${w.laid?'In':'Picked for'} ${esc(w.batch)}</span>`:'<span class="mut">On the rack</span>')(stockUiWhere(r.id))}</td>
  <td></td></tr>`;
 const body=shown.map(row).join('')||`<tr><td colspan="9" class="empty" data-stock-empty>Nothing in stock yet. Offcuts get here from a batch layout: right-click an offcut → To stock.</td></tr>`;
 return `<section class="optimization-queue">
  <div class="card oq-card sales-list-card sl-foot-pin"><div class="oq-toolbar sales-toolbar">${stockUiBar(shown)}<b class="oq-sel" data-stock-total title="Offcuts booked from cut layouts. To cut one, tick its S-… row in the batch layout: Reset → SHEETS → Build.">${live.length} in stock · ${stockOffcutTotal()} ft\u00b2</b><span class="sales-toolbar-sp"></span>
   ${off.length?`<label class="chk"><input type="checkbox" data-stock-show-off ${stockShowOff?'checked':''} onchange="stockUiShowOff(this.checked)"> Show ${off.length} back to waste</label>`:''}</div>
   ${glassBatchTabs()}
   ${cutNotice?`<div class="ncr-error" role="alert" data-stock-error>${esc(cutNotice)}</div>`:''}
   ${stockInfo?`<div class="cut-info" data-stock-info>${esc(stockInfo.id)} ${stockInfo.used?'→':'✕'} ${esc(stockInfo.batch)}${stockInfo.used?' · press Build there':''}
    <button type="button" class="gb-link" data-stock-info-open onclick="stockUiOpenBatch('${esc(stockInfo.batch)}')">Open ${esc(stockInfo.batch)}</button></div>`:''}
   <div class="sales-table-wrap"><table class="sl-table"><thead><tr><th class="sl-check"></th><th>Stock</th><th>Glass</th><th>Size</th><th class="n">ft\u00b2</th><th>From</th><th>Booked</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
  </div>${typeof stkDialogHTML==='function'?stkDialogHTML():''}</section>`;
}
