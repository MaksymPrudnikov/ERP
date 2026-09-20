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
let stockShowOff=false;
function stockUiShowOff(on){stockShowOff=!!on;render();}
function stockUiPrint(id){if(typeof stkPrintStock==='function')stkPrintStock([id]);}
function stockUiDrop(id){
 const r=stockOffcutFind(id);if(!r)return;
 if(!confirm('Put '+id+' back to waste? The sticker on the rack becomes invalid.'))return;
 const out=stockOffcutDrop(id);cutNotice=out.error||'';render();
}
/* Кусок уже взят в чей-то собранный раскрой — видно, в какой батч он уйдёт. */
function stockUiInBatch(id){
 const plan=(DB.cutPlan||[]).find(p=>p&&!p.reset&&(p.groups||[]).some(g=>g.sheets.some(s=>s.size&&s.size.key===id)));
 return plan?plan.batch:'';
}
function viewStockList(){
 const rows=stockOffcutRows(),live=rows.filter(r=>r.status==='stock'),off=rows.filter(r=>r.status!=='stock');
 const shown=stockShowOff?rows:live;
 const row=r=>`<tr data-stock-row="${esc(r.id)}" class="${r.status==='stock'?'':'off'}">
  <td><span class="pill ${r.status==='stock'?'ok':''}">${esc(r.id)}</span></td>
  <td>${esc(r.glass)}${r.mm?' · '+r.mm+' mm':''}</td>
  <td class="nowrap"><b>${esc(frac16(r.w))} × ${esc(frac16(r.h))}″</b></td>
  <td class="n">${r.area}</td>
  <td>${esc(r.batch)}${r.sheet?' · sheet '+r.sheet:''}</td>
  <td>${esc(salesShortDate(r.at))}</td>
  <td>${r.status!=='stock'?'<span class="mut">Back to waste</span>':stockUiInBatch(r.id)?`<span class="pill" data-stock-in>In ${esc(stockUiInBatch(r.id))}</span>`:'<span class="mut">On the rack</span>'}</td>
  <td class="oq-actions">${r.status==='stock'?`<button type="button" class="sm" data-stock-print onclick="stockUiPrint('${esc(r.id)}')">Sticker</button>
   <button type="button" class="sm" data-stock-drop onclick="stockUiDrop('${esc(r.id)}')">Back to waste</button>`:''}</td></tr>`;
 const body=shown.map(row).join('')||`<tr><td colspan="8" class="empty" data-stock-empty>Nothing in stock yet. Offcuts get here from a batch layout: right-click an offcut → To stock.</td></tr>`;
 return `<section class="optimization-queue"><div class="page-head"><div><h2>Stock</h2><p>Offcuts booked from cut layouts. Numbers are on the stickers on the rack. To cut one, tick its S-… row in the batch layout: Reset → SHEETS → Build.</p></div></div>
  <div class="oq-tabs" role="tablist">${glassBatchTabs()}</div>
  <div class="card oq-card"><div class="oq-toolbar"><b data-stock-total>${live.length} in stock · ${stockOffcutTotal()} ft\u00b2</b><span class="sp"></span>
   ${off.length?`<label class="chk"><input type="checkbox" data-stock-show-off ${stockShowOff?'checked':''} onchange="stockUiShowOff(this.checked)"> Show ${off.length} back to waste</label>`:''}</div>
   ${cutNotice?`<div class="ncr-error" role="alert" data-stock-error>${esc(cutNotice)}</div>`:''}
   <div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Stock</th><th>Glass</th><th>Size</th><th class="n">ft\u00b2</th><th>From</th><th>Booked</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
  </div>${typeof stkDialogHTML==='function'?stkDialogHTML():''}</section>`;
}
