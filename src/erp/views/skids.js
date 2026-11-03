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
/* Колонки списка скидов: как у всех списков — Columns, фильтр, ширина и порядок. */
function skidsListColumns(){return [{k:'customer',label:'Customer',type:'text'},{k:'code',label:'Skid',type:'text'},{k:'since',label:'Since',type:'date'},{k:'days',label:'Days',type:'number'},{k:'units',label:'Units',type:'number',sum:true},{k:'kg',label:'Weight kg',type:'number',sum:true,digits:1},{k:'makeup',label:'Makeup',type:'text',tokens:true},{k:'ps',label:'Packing slip',type:'text'},{k:'seen',label:'Seen there',type:'date'}].map(c=>Object.assign({def:true},c));}
/* Что ушло на этом скиде — по тем же строкам, что на PS; PS без данных — пусто. */
function skidsOnPs(s,code){try{return shippingDocument(s).skids.find(k=>k.code===code)||null;}catch(e){const n=(s.items||[]).filter(i=>i.skid===code).length;return n?{qty:n,kg:0,rows:[]}:null;}}
function skidsListInfos(){
 return skidsByCustomer().flatMap(g=>{const chk=carrierCustomerChecks(g.customerId);return g.list.map(x=>{
  const s=shippingFind(x.psId),sk=s?skidsOnPs(s,x.code):null,seen=chk.filter(c=>c.at>=x.since&&c.codes.includes(x.code)).pop();
  return {o:{id:x.code},x,g,memo:{customer:salesCustomerDisplay(g.customerId),code:x.code,since:finLocalDate(x.since),days:skidDays(x.since),units:sk?sk.qty:null,kg:sk?Math.round(sk.kg*10)/10:null,makeup:sk?[...new Set(sk.rows.map(r=>r.makeup).filter(Boolean))].join(' · '):'',ps:x.ps,seen:seen?finLocalDate(seen.at):''}};});});
}
function skidsHTML(){
 const all=skidsByCustomer(),notice=skidsNotice?`<div class="shipping-notice ${skidsNotice.error?'bad':''}" role="${skidsNotice.error?'alert':'status'}" data-skids-notice>${esc(skidsNotice.text)}</div>`:'';
 const infos=skidsListInfos(),p=salesListLoadPrefs(),cols=salesListColumns(),keys=cols.map(c=>c.k),cwId=salesListCwId(),listed=salesListRows(infos),rows=skidsOld?listed.filter(i=>i.memo.days>30):listed,nOld=listed.filter(i=>i.memo.days>30).length;
 if(skidsSel&&!all.some(g=>g.customerId===skidsSel))skidsSel='';
 const cur=skidsSel,name=cur?salesCustomerDisplay(cur):'';
 const bar=`<div class="sales-toolbar"><button type="button" class="sl-quiet" data-skids-check-ask ${cur?'':'disabled'} onclick="skidsCheckAsk(skidsSel)">Checked</button><button type="button" class="sl-quiet" data-skid-swap ${cur?'':'disabled'} onclick="skidsSwapAsk(skidsSel)">${cur?'Skid from '+esc(name):'Skid back from customer'}</button>${cur?`<b class="oq-sel">${esc(name)}</b>${(g=>g&&skidsCheckText(g)?` <span class="mut small" data-skids-check>${esc(skidsCheckText(g))}</span>`:'')(all.find(g=>g.customerId===cur))}`:''}<span class="sales-toolbar-sp"></span>${shippingBarRight()}</div>`;
 const pills=`<div class="sl-filter-row"><div class="sl-quick"><button type="button" class="sl-quick-pill${skidsOld?'':' on'}" onclick="skidsOld=false;render()">All <b>${listed.length}</b></button><button type="button" class="sl-quick-pill${skidsOld?' on':''}" data-skids-old onclick="skidsOld=true;render()">Over 30 days <b>${nOld}</b></button></div></div>`;
 const th=c=>{const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}" data-cw-key="${c.k}"><span class="sl-th"><span data-cw-label>${c.label}</span><button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cwGrip()}</th>`;};
 const cell=(i,c,prev)=>{const v=i.memo[c.k];switch(c.k){
  case 'customer':{const same=prev&&prev.g.customerId===i.g.customerId;return `<td${same?' class="sl-rep"':''}>${same?esc(v):'<b>'+esc(v)+'</b>'}</td>`;}
  case 'code':return `<td><button type="button" class="gb-link" data-skid-open="${esc(v)}" title="What is on it" onclick="carrierWinOpen('${esc(v)}')"><b>${esc(v)}</b></button></td>`;
  case 'ps':return `<td><button type="button" class="sm" onclick="shippingGo('${esc(i.x.psId)}')">${esc(v)}</button></td>`;
  case 'since':case 'seen':return `<td data-skid-${c.k}>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'kg':return `<td class="n">${v==null?'<span class="mut">—</span>':esc(chNum(v,1))}</td>`;
  default:return `<td${c.type==='number'?' class="n"':''}>${v==null||v===''?'<span class="mut">—</span>':esc(String(v))}</td>`;}};
 const body=rows.map((i,k)=>{const on=cur===i.g.customerId;return `<tr data-skid-out="${esc(i.x.code)}"${k&&rows[k-1].g.customerId===i.g.customerId?'':` data-skids-customer="${esc(i.g.customerId)}"`}${on?' class="oq-selected"':''} oncontextmenu="event.preventDefault();skidsSelect('${esc(i.g.customerId)}',true)"><td class="sl-check"><input type="checkbox" aria-label="Select ${esc(i.x.code)}" ${on?'checked':''} onchange="skidsSelect('${esc(i.g.customerId)}',this.checked)"></td>${cols.map(c=>cell(i,c,rows[k-1])).join('')}<td></td></tr>`;}).join('');
 const lead=Math.max(0,cols.findIndex(c=>salesListCalc(c)!=='none')),foot=rows.length?`<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head"><b>${rows.length} skid${rows.length===1?'':'s'} · ${new Set(rows.map(i=>i.g.customerId)).size} customers</b></td>${cols.slice(lead).map(c=>salesListCalcCell(c,rows)).join('')}<td></td></tr></tfoot>`:'';
 const table=`<div class="sales-table-wrap"><table class="sl-table${cwTableClass(cwId)}"${cwTableAttrs(cwId,keys)}>${cwColgroup(cwId,keys)}<thead><tr><th class="sl-check"><span class="sl-header-tools"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></span></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'No skids match.':'No skids at customers.'}</td></tr>`}</tbody>${foot}</table></div>`;
 return notice+`<div class="card sales-list-card sl-foot-pin">${bar}${pills}${salesListFilterChips()}${table}${salesListMenuHTML(infos)}</div>`;
}

