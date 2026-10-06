/* =====================================================================
   view/skids  ·  Shipping PR 4, 6 октября 2026
   Shipping → Skids: у какого клиента наши скиды, с какого дня, сколько
   дней, с каким PS уехали. Обмен — «Skid from ABC»: чужой скид получает
   новый код и этикетку, наш самый давний у этого клиента списывается.
   Возврат — скан скида на станции (erp/views/station*). Данные —
   erp/shipping/skids.
   ===================================================================== */
let skidsNotice=null;
function skidsSwapAsk(customerId){
 const mine=skidsByCustomer().find(x=>x.customerId===customerId);if(!mine)return;
 const name=salesCustomerDisplay(customerId),go=prefix=>{
  const out=skidSwap(customerId,prefix);
  skidsNotice=out.ok?{text:out.value.code+' added · '+out.value.old+' left at '+name}:{error:true,text:out.error};render();
  if(out.ok)carrierPrintLabels([out.value.code]);
 };
 salesDialogOpen({title:'Skid from '+name,note:'Their skid gets a new code and label. '+mine.list[0].code+' stays at '+name+'.',buttons:[{label:'Back'},{label:'L-shape skid',run:()=>go('SL')},{label:'A-shape skid',run:()=>go('SA')}]});
}
function skidsHTML(){
 const groups=skidsByCustomer(),notice=skidsNotice?`<div class="shipping-notice ${skidsNotice.error?'bad':''}" role="${skidsNotice.error?'alert':'status'}" data-skids-notice>${esc(skidsNotice.text)}</div>`:'';
 return notice+(groups.map(g=>`<section class="card shipping-customer" data-skids-customer="${esc(g.customerId)}"><div class="shipping-customer-head"><div><h3>${esc(salesCustomerDisplay(g.customerId))}</h3><span class="mut">${shippingCount(g.list.length,'skid')}</span></div><button type="button" data-skid-swap onclick="skidsSwapAsk('${esc(g.customerId)}')">Skid from ${esc(salesCustomerDisplay(g.customerId))}</button></div><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Skid</th><th>Since</th><th>Days</th><th>Packing slip</th></tr></thead><tbody>${g.list.map(x=>`<tr data-skid-out="${esc(x.code)}"><td><b>${esc(x.code)}</b></td><td>${esc(docDate(finLocalDate(x.since)))}</td><td>${skidDays(x.since)}</td><td><button type="button" class="sm" onclick="shippingGo('${esc(x.psId)}')">${esc(x.ps)}</button></td></tr>`).join('')}</tbody></table></div></section>`).join('')||'<div class="card empty">No skids at customers.</div>');
}
