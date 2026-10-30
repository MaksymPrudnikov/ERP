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
  if(out.ok&&!out.value.own)carrierPrintLabels([out.value.code]);
 };
 /* Скид, уже зарегистрированный цехом, — его и берём (его этикетка уже есть). */
 const reg=skidSwapCandidates().slice(0,2).map(code=>{const c=carrierFind(code);return {label:'Use '+code+' · '+salesListShortDay(finLocalDate(c.regAt)),run:()=>go(code)};});
 salesDialogOpen({title:'Skid from '+name,note:'Their skid gets a new code and label'+(reg.length?' — or use one the shop registered':'')+'. '+mine.list[0].code+' stays at '+name+'.',buttons:[{label:'Back'}].concat(reg,[{label:'L-shape skid',run:()=>go('SL')},{label:'A-shape skid',run:()=>go('SA')}])});
}
/* Проверка у клиента (план v1.16, P7-R12, P7-R15): какие наши скиды видели
   там — номерами; или только сколько — числом. */
function skidsCheckAsk(customerId){
 const name=salesCustomerDisplay(customerId);
 salesDialogOpen({title:'Checked at '+name,sub:'Codes you saw (SL-2, SA-1) or just how many.',input:{label:'Seen',value:''},buttons:[{label:'Back'},{label:'Save',kind:'pri',run:d=>{
  const out=carrierCustomerCheck(customerId,d.input.value,orderLogActor().by?{name:orderLogActor().by}:null);
  skidsNotice=out.ok?{text:'Check saved · '+name}:{error:true,text:out.error};render();
 }}]});
}
function skidsCheckText(g){
 const c=carrierCustomerChecks(g.customerId).pop();if(!c)return '';
 const codes=new Set(g.list.map(x=>x.code)),seen=c.codes.filter(x=>codes.has(x)).length;
 return 'Checked '+docDate(finLocalDate(c.at))+(c.by?' · '+c.by:'')+' · '+(c.codes.length?seen+' of '+g.list.length+' seen':c.count+' counted · codes not checked');
}
function skidsHTML(){
 const groups=skidsByCustomer(),notice=skidsNotice?`<div class="shipping-notice ${skidsNotice.error?'bad':''}" role="${skidsNotice.error?'alert':'status'}" data-skids-notice>${esc(skidsNotice.text)}</div>`:'';
 return notice+(groups.map(g=>`<section class="card shipping-customer" data-skids-customer="${esc(g.customerId)}"><div class="shipping-customer-head"><div><h3>${esc(salesCustomerDisplay(g.customerId))}</h3><span class="mut">${shippingCount(g.list.length,'skid')}</span>${(t=>t?` <span class="mut" data-skids-check>· ${esc(t)}</span>`:'')(skidsCheckText(g))}</div><span class="skids-acts"><button type="button" data-skids-check-ask onclick="skidsCheckAsk('${esc(g.customerId)}')">Checked</button> <button type="button" data-skid-swap onclick="skidsSwapAsk('${esc(g.customerId)}')">Skid from ${esc(salesCustomerDisplay(g.customerId))}</button></span></div><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Skid</th><th>Since</th><th>Days</th><th>Packing slip</th><th>Seen there</th></tr></thead><tbody>${(chk=>g.list.map(x=>`<tr data-skid-out="${esc(x.code)}"><td><b>${esc(x.code)}</b></td><td>${esc(salesListShortDay(finLocalDate(x.since)))}</td><td>${skidDays(x.since)}</td><td><button type="button" class="sm" onclick="shippingGo('${esc(x.psId)}')">${esc(x.ps)}</button></td><td class="mut" data-skid-seen>${(c=>c?esc(salesListShortDay(finLocalDate(c.at))):'')(chk.filter(c=>c.at>=x.since&&c.codes.includes(x.code)).pop())}</td></tr>`).join(''))(carrierCustomerChecks(g.customerId))}</tbody></table></div></section>`).join('')||'<div class="card empty">No skids at customers.</div>');
}
