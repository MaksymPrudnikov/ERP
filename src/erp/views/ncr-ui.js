/* =====================================================================
   view/ncr · ncr-ui-1.0
   Одна форма на основе сохранённого заказа в двух видах: Recut — до выдачи
   (кнопка Recut, блок Recuts над Notes), NCR — после выдачи (кнопка NCR,
   окно просмотра, полоса NCR, строки в Sales). Номера G-… здесь не видны.
   IN : DB.ncr, DB.ncrReason, сохранённый заказ; OUT: ncrCreate, HTML
   ===================================================================== */
let ncrForm=null,ncrViewId='';
function ncrCanOpen(o){return soEdit!=='new'&&ncrCanCreate(o);}
function recutCanOpenHere(o){return soEdit!=='new'&&recutCanOpen(o);}
function ncrOpenForm(kind){
 kind=kind==='recut'?'recut':'ncr';
 if(!soDraft||!(kind==='recut'?recutCanOpenHere(soDraft):ncrCanOpen(soDraft)))return;
 if(salesDraftHasWork()){salesDialogOpen({title:'Save the order first',buttons:[{label:'Back'}]});return;}
 const o=salesRecord(soDraft.id);
 ncrForm={kind,orderId:o.id,where:'',reasonId:'',action:NCR_REMAKE,note:'',lines:{},stamp:ncrOrderStamp(o),error:''};
 render();
}
function ncrFormClose(){ncrForm=null;render();}
function ncrFormSet(key,value){
 if(!ncrForm)return;ncrForm[key]=value;ncrForm.error='';
 if(key==='where')ncrForm.reasonId='';
 render();
}
function ncrFormLine(lineId,key,value,redraw){
 if(!ncrForm)return;const x=ncrForm.lines[lineId]||(ncrForm.lines[lineId]={on:false,qty:'',which:'unit'});
 x[key]=value;if(key==='on'&&value&&!x.qty)x.qty=1;ncrForm.error='';if(redraw)render();
}
function ncrFormCreate(){
 if(!ncrForm)return;const lines={};Object.keys(ncrForm.lines).forEach(id=>{const x=ncrForm.lines[id];lines[id]=Object.assign({},x,{qty:String(x.qty).trim()===''?NaN:Number(x.qty)});});
 const recut=ncrForm.kind==='recut',res=recut?recutCreate(Object.assign({},ncrForm,{lines})):ncrCreate(Object.assign({},ncrForm,{lines,source:'Customer claim'}));
 if(res.error){ncrForm.error=res.error;render();return;}
 ncrForm=null;if(!recut)ncrViewId=res.ncr.id;render();
}
function ncrView(id){if(!ncrFind(id))return;ncrForm=null;ncrViewId=id;salesListMenu=null;render();}
function ncrViewClose(){ncrViewId='';render();}
function ncrOpenOrder(id){
 if(!salesRecord(id))return;
 if(soDraft&&soDraft.id!==id&&salesDraftHasWork()&&!confirm('Discard unsaved changes?'))return;
 ncrViewId='';ncrForm=null;tab='sales';salesOrderEdit(id);
}
function ncrEffectText(f,o){
 const picked=o.lines.filter(l=>f.lines[l.id]&&f.lines[l.id].on);
 const remake=f.kind!=='recut'&&f.action===NCR_REMAKE;
 const n=picked.reduce((s,l)=>{const x=f.lines[l.id],q=Number(x.qty)||0;return s+(remake?q:q*ncrGlassKeys(o,l,x.which||'unit').length);},0);
 if(f.kind==='recut')return (n?n+' pcs':'Recut')+' → glass queue';
 if(f.action===NCR_REMAKE)return 'New order'+(n?' · '+n+' unit'+(n===1?'':'s'):'')+' · $0';
 return '';
}
function ncrFormHTML(){
 const f=ncrForm,o=salesRecord(f.orderId);if(!o){ncrForm=null;return '';}
 const recut=f.kind==='recut',places=ncrWhereList(),reasons=f.where?ncrReasonsFor(f.where,{activeOnly:true}):[],remake=!recut&&f.action===NCR_REMAKE;
 const glassCodes=l=>{const m=salesMakeupById(o,l.makeupId);return m?(m.panes||[]).map(ncrPaneCode).join(' / '):'—';};
 const rows=o.lines.map((l,i)=>{
  const x=f.lines[l.id]||{on:false,qty:'',which:'unit'},opts=ncrLiteOptions(o,l);
  return `<tr data-ncr-line="${esc(l.id)}" class="${x.on?'on':''}"><td><input type="checkbox" data-ncr-line-on ${x.on?'checked':''} aria-label="Line ${i+1} affected" onchange="ncrFormLine('${esc(l.id)}','on',this.checked,true)"></td>
   <td>Line ${i+1}${l.mark?' · '+esc(l.mark):''}</td><td class="nowrap">${esc(dimIn16(l.width16/16))} × ${esc(dimIn16(l.height16/16))}</td><td>${esc(glassCodes(l))}</td><td class="n">${l.qty}</td>
   <td><input type="number" min="1" max="${l.qty}" step="1" data-ncr-line-qty value="${esc(x.qty)}" ${x.on?'':'disabled'} aria-label="Affected on line ${i+1}" oninput="ncrFormLine('${esc(l.id)}','qty',this.value)"></td>
   <td><select data-ncr-line-which ${x.on&&!remake&&opts.length>1?'':'disabled'} aria-label="Which glass on line ${i+1}" onchange="ncrFormLine('${esc(l.id)}','which',this.value,true)">${(remake?[opts[0]]:opts).map(v=>`<option value="${esc(v.value)}" ${String(x.which)===v.value?'selected':''}>${esc(v.label)}</option>`).join('')}</select></td></tr>`;
 }).join('');
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)ncrFormClose()"><div class="sales-service-modal sales-dialog ncr-modal" role="dialog" aria-modal="true" aria-label="${recut?'Recut':'New NCR'}">
  <div class="sales-service-modal-head"><h3>${recut?'Recut':'New NCR'} · Order ${esc(o.businessNumber)}</h3><button type="button" aria-label="Close" onclick="ncrFormClose()">×</button></div>
  <div class="sales-dialog-body ncr-form">
   <p class="mut">${esc([salesCustomerDisplay(o.customerId),o.customerPo,salesStatusLabel(o)].filter(Boolean).join(' · '))}</p>
   <div><div class="ncr-label">AFFECTED GLASS</div><div class="ncr-lines-wrap"><table class="ncr-lines"><thead><tr><th></th><th>Line</th><th>Size</th><th>Glass</th><th class="n">Qty</th><th>Affected</th><th>Which glass</th></tr></thead><tbody>${rows}</tbody></table></div></div>
   <div class="ncr-pick${recut?' ncr-pick-two':''}">
    <label><span class="ncr-label">WHERE</span><select data-ncr-where-select onchange="ncrFormSet('where',this.value)"><option value="">Choose…</option>${places.map(w=>`<option value="${esc(w.code)}" ${f.where===w.code?'selected':''}>${esc(w.code===NCR_OFFICE?'Office':w.code+' · '+w.name)}</option>`).join('')}</select></label>
    <label><span class="ncr-label">WHAT HAPPENED</span><select data-ncr-reason-select ${f.where?'':'disabled'} onchange="ncrFormSet('reasonId',this.value)"><option value="">${f.where?'Choose…':'Choose where first'}</option>${reasons.map(r=>`<option value="${esc(r.id)}" ${f.reasonId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>
    ${recut?'':`<label><span class="ncr-label">ACTION</span><select data-ncr-action-select onchange="ncrFormSet('action',this.value)">${NCR_ACTIONS.map(a=>`<option value="${esc(a)}" ${f.action===a?'selected':''}>${esc(a)}</option>`).join('')}</select></label>`}
   </div>
   <label><span class="ncr-label">NOTE</span><textarea rows="2" data-ncr-note maxlength="500" oninput="ncrForm.note=this.value">${esc(f.note)}</textarea></label>
   ${ncrEffectText(f,o)?`<div class="sales-quote-note ncr-effect" data-ncr-effect>${esc(ncrEffectText(f,o))}</div>`:''}
   ${f.error?`<div class="ncr-error" role="alert" data-ncr-error>${esc(f.error)}</div>`:''}
  </div>
  <div class="sales-dialog-actions"><button type="button" onclick="ncrFormClose()">Cancel</button><button type="button" class="pri" data-ncr-create onclick="ncrFormCreate()">${recut?'Create recut':'Create NCR'}</button></div></div></div>`;
}
function ncrViewHTML(){
 const n=ncrFind(ncrViewId);if(!n){ncrViewId='';return '';}
 const o=salesRecord(n.orderId),r=salesRecord(n.remakeOrderId),status=ncrStatus(n);
 const row=(k,v)=>`<span>${esc(k)}</span><b>${esc(v)}</b>`;
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)ncrViewClose()"><div class="sales-service-modal sales-dialog ncr-modal" role="dialog" aria-modal="true" aria-label="${esc(n.number)}">
  <div class="sales-service-modal-head"><h3>${esc(n.number)}${o?' · Order '+esc(o.businessNumber):''} <span class="pill ${status==='Open'?'ncr-st-open':'ncr-st-done'}" data-ncr-status>${esc(status)}</span></h3><button type="button" aria-label="Close" onclick="ncrViewClose()">×</button></div>
  <div class="sales-dialog-body ncr-form">
   <div class="sales-dialog-rows">${row('Created',salesShortDate(n.createdAt))}${row('Customer',o?salesCustomerDisplay(o.customerId):'—')}${row('Source',n.source)}${row('Where',n.where===NCR_OFFICE?'Office':n.where+' · '+ncrWhereName(n.where))}${row('What happened',n.reason)}${row('Action',n.action)}</div>
   <div class="ncr-lines-wrap"><table class="ncr-lines"><thead><tr><th>Line</th><th>Which glass</th><th class="n">Affected</th></tr></thead><tbody>${n.glass.map(g=>`<tr><td>Line ${g.line}${g.mark?' · '+esc(g.mark):''}</td><td>${esc(g.lite)}</td><td class="n">${g.qty}</td></tr>`).join('')}</tbody></table></div>
   ${n.note?`<p class="ncr-note">${esc(n.note)}</p>`:''}
   ${n.action===NCR_REMAKE?`<div class="sales-quote-note">${r?'Remake order '+esc(r.businessNumber)+' · '+esc(salesStatusLabel(r)):'Remake order deleted'}</div>`:''}
  </div>
  <div class="sales-dialog-actions"><button type="button" onclick="ncrViewClose()">Close</button>${r?`<button type="button" data-ncr-open-remake onclick="ncrOpenOrder('${esc(r.id)}')">Open order ${esc(r.businessNumber)}</button>`:''}${o&&(!soDraft||soDraft.id!==o.id)?`<button type="button" class="pri" data-ncr-open-order onclick="ncrOpenOrder('${esc(o.id)}')">Open order ${esc(o.businessNumber)}</button>`:''}</div></div></div>`;
}
function ncrModalHTML(){return ncrForm?ncrFormHTML():ncrViewId?ncrViewHTML():'';}
/* Полоса в заказе: его NCR и отметка «Remake for …» с No charge. */
function ncrOrderStrip(o){
 if(!o||salesIsQuote(o)||soEdit==='new')return '';
 const list=ncrForOrder(o.id),src=o.remakeNcrId?ncrFind(o.remakeNcrId):null,parent=src&&salesRecord(src.orderId);
 const items=list.map(n=>{const s=ncrStatus(n);return `<div class="ncr-strip-row" data-ncr-strip="${esc(n.id)}"><b class="mono">${esc(n.number)}</b><span>${esc(ncrWhereLabel(n))} · ${esc(n.reason)} · ${esc(n.action)} · ${ncrPieces(n)} ${n.action===NCR_REMAKE?'unit':'pc'}${ncrPieces(n)===1?'':'s'}</span><span class="pill ${s==='Open'?'ncr-st-open':'ncr-st-done'}">${esc(s)}</span><button type="button" class="sm" onclick="ncrView('${esc(n.id)}')">View</button></div>`;}).join('');
 const remake=src?`<div class="ncr-strip-row ncr-remake" data-ncr-remake><b>Remake for ${esc(src.number)}</b><span>${parent?'order '+esc(parent.businessNumber):''}</span><label class="chk"><input type="checkbox" data-no-charge ${o.noCharge?'checked':''} onchange="soDraft.noCharge=this.checked;render()"> No charge</label><button type="button" class="sm" onclick="ncrView('${esc(src.id)}')">View NCR</button></div>`:'';
 return list.length||remake?`<div class="ncr-strip">${remake}${items}</div>`:'';
}
/* Блок Recuts над Notes: стёкла перереза этого заказа по позициям. */
function recutOrderSection(o){
 if(!o||salesIsQuote(o)||soEdit==='new')return '';
 const list=recutForOrder(o.id);if(!list.length)return '';
 return `<div class="recut-section" data-recut-section><div class="recut-head">RECUTS</div>${list.map(r=>{const st=recutStatus(r);return `<div class="recut-row" data-recut-row="${esc(r.id)}"><b>Recut ${r.no}</b><span>Line ${r.line}${r.mark?' · '+esc(r.mark):''}</span><span>${esc(r.lite)}</span><span>${r.qty} pc${r.qty===1?'':'s'}</span><span>${esc(ncrWhereLabel(r))} · ${esc(r.reason)}</span><span class="pill ${st==='In queue'?'ncr-st-open':'ncr-st-done'}">${esc(st)}</span>${r.note?`<span class="mut" title="${esc(r.note)}">${esc(r.note)}</span>`:''}</div>`;}).join('')}</div>`;
}
/* Строки NCR в списке Sales: значения колонок заранее, без расчётов заказа. */
function ncrListInfos(){
 return (DB.ncr||[]).map(n=>{
  const o=salesRecord(n.orderId)||{},c=salesFindCustomer(o.customerId)||{},status=ncrStatus(n);
  const codes=[...new Set(n.glass.flatMap(g=>g.keys.map(k=>{const paneId=k.split('|')[2],m=(o.makeups||[]).find(m=>(m.panes||[]).some(p=>p.id===paneId)),p=m&&m.panes.find(p=>p.id===paneId);return p?ncrPaneCode(p):'';})).filter(Boolean))];
  return {o:{id:n.id,kind:'ncr',createdAt:n.createdAt,ncrStatus:status},q:false,n,c,memo:{type:'NCR',number:n.number,customer:c.displayName||c.legalName||'',po:o.customerPo||'',created:salesListIsoDay(n.createdAt),due:'',status,priority:'',glass:codes.join(' / '),
   units:null,area:null,total:null,receipts:null,balance:null,hold:'',delivery:'',rep:c.salesRep||'',terms:'',lines:n.glass.length,weight:null,unitType:'',shapes:null,validUntil:'',revisions:null,fromQuote:'',updated:salesListIsoDay(n.createdAt)}};
 });
}
function ncrListCell(info,col){
 const n=info.n,v=salesListValue(info,col.k),o=salesRecord(n.orderId);
 switch(col.k){
  case 'type':return '<td><span class="pill kind-ncr">NCR</span></td>';
  case 'number':return `<td><b class="mono">${esc(n.number)}</b>${o?` <span class="mut small">for ${esc(o.businessNumber)}</span>`:''}</td>`;
  case 'customer':return `<td><b>${esc(v||'—')}</b></td>`;
  case 'status':return `<td><span class="pill ${v==='Open'?'ncr-st-open':'ncr-st-done'}">${esc(v)}</span> <span class="mut small">${esc(n.action+' · '+ncrWhereLabel(n)+' · '+n.reason)}</span></td>`;
  case 'created':case 'updated':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'glass':return `<td><span class="sl-glass" title="${esc(v)}">${esc(v||'—')}</span></td>`;
 }
 return v==null||v===''?(col.type==='number'?'<td class="n"><span class="mut">—</span></td>':'<td><span class="mut">—</span></td>'):`<td class="${col.type==='number'?'n':''}">${esc(String(v))}</td>`;
}
function ncrListRow(r,cols){
 return `<tr data-ncr-row="${esc(r.n.id)}" class="sl-row-ncr"><td class="sl-check"></td>${cols.map(c=>ncrListCell(r,c)).join('')}<td class="sales-row-actions"><button class="sm" onclick="ncrView('${esc(r.n.id)}')">Open</button></td></tr>`;
}
