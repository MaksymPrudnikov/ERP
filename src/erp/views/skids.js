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
/* Скиды у клиентов — один список вида Sales (этап 6, 03.11.2026): строка
   клиента, под ней его скиды; Checked и Skid from — сверху для отмеченного. */
let skidsSel='',skidsOld=false;
function skidsSelect(id,on){skidsSel=on?id:'';render();}
function skidsHTML(){
 const all=skidsByCustomer(),notice=skidsNotice?`<div class="shipping-notice ${skidsNotice.error?'bad':''}" role="${skidsNotice.error?'alert':'status'}" data-skids-notice>${esc(skidsNotice.text)}</div>`:'';
 const old=x=>skidDays(x.since)>30,groups=all.map(g=>({customerId:g.customerId,whole:g,list:skidsOld?g.list.filter(old):g.list})).filter(g=>g.list.length),n=all.reduce((k,g)=>k+g.list.length,0),nOld=all.reduce((k,g)=>k+g.list.filter(old).length,0);
 if(skidsSel&&!all.some(g=>g.customerId===skidsSel))skidsSel='';
 const cur=skidsSel,name=cur?salesCustomerDisplay(cur):'';
 const bar=`<div class="sales-toolbar"><button type="button" class="sl-quiet" data-skids-check-ask ${cur?'':'disabled'} onclick="skidsCheckAsk(skidsSel)">Checked</button><button type="button" class="sl-quiet" data-skid-swap ${cur?'':'disabled'} onclick="skidsSwapAsk(skidsSel)">${cur?'Skid from '+esc(name):'Skid back from customer'}</button>${cur?`<b class="oq-sel">${esc(name)}</b>`:''}<span class="sales-toolbar-sp"></span>${shippingBarRight()}</div>`;
 const pills=`<div class="sl-filter-row"><div class="sl-quick"><button type="button" class="sl-quick-pill${skidsOld?'':' on'}" onclick="skidsOld=false;render()">All <b>${n}</b></button><button type="button" class="sl-quick-pill${skidsOld?' on':''}" data-skids-old onclick="skidsOld=true;render()">Over 30 days <b>${nOld}</b></button></div></div>`;
 const body=groups.map(g=>{const on=cur===g.customerId,chk=carrierCustomerChecks(g.customerId);
  return `<tr class="shipping-customer${on?' oq-selected':''}" data-skids-customer="${esc(g.customerId)}" oncontextmenu="event.preventDefault();skidsSelect('${esc(g.customerId)}',true)"><td class="sl-check"><input type="checkbox" aria-label="Select ${esc(salesCustomerDisplay(g.customerId))}" ${on?'checked':''} onchange="skidsSelect('${esc(g.customerId)}',this.checked)"></td><td colspan="5"><b>${esc(salesCustomerDisplay(g.customerId))}</b> <span class="mut">${shippingCount(g.whole.list.length,'skid')}</span>${(t=>t?` <span class="mut" data-skids-check>· ${esc(t)}</span>`:'')(skidsCheckText(g.whole))}</td></tr>`
   +g.list.map(x=>`<tr data-skid-out="${esc(x.code)}"${on?' class="oq-selected"':''} oncontextmenu="event.preventDefault();skidsSelect('${esc(g.customerId)}',true)"><td class="sl-check"><input type="checkbox" aria-label="Select ${esc(x.code)}" ${on?'checked':''} onchange="skidsSelect('${esc(g.customerId)}',this.checked)"></td><td></td><td><b>${esc(x.code)}</b></td><td>${esc(salesListShortDay(finLocalDate(x.since)))}</td><td class="n">${skidDays(x.since)}</td><td><button type="button" class="sm" onclick="shippingGo('${esc(x.psId)}')">${esc(x.ps)}</button> <span class="mut small" data-skid-seen>${(c=>c?'seen '+esc(salesListShortDay(finLocalDate(c.at))):'')(chk.filter(c=>c.at>=x.since&&c.codes.includes(x.code)).pop())}</span></td></tr>`).join('');}).join('');
 const shown=groups.reduce((k,g)=>k+g.list.length,0);
 const foot=groups.length?`<tfoot><tr class="sl-foot"><td></td><td colspan="5"><b>${shown} skid${shown===1?'':'s'} · ${groups.length} customer${groups.length===1?'':'s'}</b></td></tr></tfoot>`:'';
 return notice+`<div class="card sales-list-card sl-foot-pin">${bar}${pills}<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th class="sl-check"></th><th>Customer</th><th>Skid</th><th>Since</th><th class="n">Days</th><th>Packing slip · seen there</th></tr></thead><tbody>${body||`<tr><td colspan="6" class="empty">${n?'No skids over 30 days.':'No skids at customers.'}</td></tr>`}</tbody>${foot}</table></div></div>`;
}

