/* Purchasing P2: reusable Sales column filters and draft PO forms.
   Owner correction 13.10: glass and suppliers use catalogue identities;
   the default purchase is glass, extras are a separate Sales-style block.
   Gmail only opens a compose window. Sending is confirmed manually. */
let purView='orders',purOrderDraft=null,purOrderOriginal='',purShowDeleted=false,purPicker=null,purDoc=null;
function purNav(){
 return '<div class="oq-tabs" role="tablist" aria-label="Purchasing sections">'+[['orders','Purchase orders'],['receipts','Receipts'],['backorders','Backorders'],['held','Held at supplier'],['requests','Delivery requests'],['invoices','Invoices'],['payments','Payments'],['payables','We owe'],['suppliers','Suppliers'],['history','History']].map(([k,n])=>'<button type="button" role="tab" aria-selected="'+(purView===k)+'" class="'+(purView===k?'on':'')+'" onclick="purGo(\''+k+'\')">'+n+'</button>').join('')+'</div>';
}
function purGo(v){if(!purMoneyLeave()||!purFulfilLeave()||!purOrderLeave())return;purSupplierDraft=null;purView=v;purNotice='';purNewSupplier=null;salesListMenu=null;render();}
function purOrderLeave(){
 if(purOrderDraft&&JSON.stringify(purOrderDraft)!==purOrderOriginal&&!confirm('Discard unsaved purchase order changes?'))return false;
 purOrderDraft=null;purPicker=null;purDoc=null;return true;
}
function purOrderColumns(){
 if(purView==='history')return [['at','When','date'],['entity','Document','text'],['name','Reference','text'],['what','Action','list'],['by','Who','text']].map(([k,label,type])=>({k,label,type,def:true}));
 return [['number','PO','text'],['supplierName','Supplier','text'],['date','Date','date'],['expectedDate','Expected','date'],['currency','Currency','list'],['amount','Amount','number'],['pricing','Pricing','list'],['status','Status','list'],['held','Held at supplier','number'],['createdBy','Created by','text']].map(([k,label,type])=>({k,label,type,def:!['pricing','held','createdBy'].includes(k)}));
}
function purOrderInfos(){
 if(purView==='history')return (DB.purchasingEvent||[]).slice().reverse().map(e=>{const p=e.entity==='po'?purOrderFind(e.entityId):PUR_FULFIL[e.entity]?purFulfilFind(e.entity,e.entityId):PUR_MONEY[e.entity]?purMoneyFind(e.entity,e.entityId):purSupplierFind(e.entityId);return {o:{id:e.id},e,memo:Object.assign({},e,{at:finLocalDate(new Date(e.at)),entity:e.entity==='po'?'PO':PUR_FULFIL[e.entity]?PUR_FULFIL[e.entity].label:PUR_MONEY[e.entity]?PUR_MONEY[e.entity].label:'Supplier',name:p?(p.number||p.name):e.entityId})};});
 return (DB.purchaseOrder||[]).filter(p=>purShowDeleted||!p.deletedAt).map(p=>{const t=purOrderTotals(p);return {o:{id:p.id},p,memo:Object.assign({},p,{supplierName:purSupplierDisplay(p),amount:t.complete?t.known:null,pricing:t.complete?'Complete':'Price / quantity needed',status:purOrderStatus(p),held:p.lines.filter(l=>l.held).length})};});
}
function purOrderList(){
 const infos=purOrderInfos(),rows=salesListRows(infos),cols=salesListColumns(),history=purView==='history';
 const cell=(i,c)=>{
  const v=salesListValue(i,c.k);
  if(c.k==='number'||history&&c.k==='name')return '<td><button type="button" class="fin-link" data-pur-po="'+esc(i.p?i.p.id:i.e.entityId)+'" onclick="'+(i.p?'purOrderEdit('+purArg(i.p.id)+')':'purHistoryOpen('+purArg(i.e.entity)+','+purArg(i.e.entityId)+')')+'">'+esc(v)+'</button></td>';
  return '<td data-raw class="'+(c.type==='number'?'n':'')+'">'+(v==null||v===''?'—':c.k==='amount'?esc(docNum(v,2)):c.k==='at'?esc(new Date(i.e.at).toLocaleString()):esc(v))+'</td>';
 };
 return '<div class="purchasing-workspace">'+purNav()+'<div class="card sales-list-card"><div class="sales-toolbar"><h2>'+(history?'Purchasing history':'Purchase orders')+'</h2><span class="sales-toolbar-sp"></span>'+(history?'':'<label><input type="checkbox" '+(purShowDeleted?'checked':'')+' onchange="purShowDeleted=this.checked;render()"> Include deleted</label><button type="button" class="pri" data-pur-po-new onclick="purOrderEdit(\'\')">+ PO</button>')+'</div>'+purListFilters(infos)+
  '<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th><button type="button" class="sl-settings" data-columns-button aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+cols.map(purListHeader).join('')+'</tr></thead><tbody>'+
  purPageRows(rows).map(i=>'<tr><td></td>'+cols.map(c=>cell(i,c)).join('')+'</tr>').join('')+(!rows.length?'<tr><td colspan="'+(cols.length+1)+'" class="empty">No records in this view.</td></tr>':'')+'</tbody></table></div>'+purListPager(rows)+salesListMenuHTML(infos)+'</div></div>';
}
function purHistoryOpen(entity,id){if(PUR_MONEY[entity])purMoneyEdit(entity,id);else if(PUR_FULFIL[entity])purFulfilEdit(entity,id);else if(entity==='po')purOrderEdit(id);else purSupplierEdit(id);}
function purOrderEdit(id){
 if(!accessCan('purchasing')||!purMoneyLeave()||!purFulfilLeave())return;
 const p=id?purOrderFind(id):null;if(id&&!p)return;
 purSupplierDraft=null;purView='orders';purPicker=null;purDoc=null;purNotice='';purNewSupplier=null;purGlassFilter={};
 purOrderDraft=purClone(p||purOrderClean({date:finToday(),lines:[purCatalogueLine('')]}));
 purOrderOriginal=JSON.stringify(purOrderDraft);render();
}
function purOrderField(k,label,type){
 const v=purOrderDraft[k]??'';
 return '<div><label for="pur_po_'+k+'">'+label+'</label><input id="pur_po_'+k+'" type="'+(type||'text')+'" value="'+esc(v)+'" oninput="purOrderDraft.'+k+'=this.value"></div>';
}
function purPickSupplier(id,draw){
 const s=purSupplierFind(id),d=purOrderDraft;d.supplierId=id;d.supplier=s?purClone(s):null;d.supplierName=s?s.name:'';
 if(s){d.to=s.email;if(s.leadTimeDays!=null&&d.date){const date=new Date(d.date+'T12:00:00');date.setDate(date.getDate()+s.leadTimeDays);d.expectedDate=finLocalDate(date);}}
 d.lines.forEach(l=>{const row=(DB.glassSheet||[]).find(s=>s.id===l.sheetId);if(row&&row.supplierId!==id){l.sheetId='';l.sourceCurrency='';}});
 if(draw!==false)render();
}
function purOrderSaveForm(stay){
 const old=purOrderDraft.id&&purOrderFind(purOrderDraft.id),sent=old&&!!old.sentAt,r=purOrderSave(purOrderDraft);
 if(!r.ok){purNotice=r.error;render();return false;}
 purOrderDraft=stay?purClone(r.value):null;purOrderOriginal=JSON.stringify(purOrderDraft);
 purNotice=sent?'Changes saved. Send an updated PO if needed.':'';render();return true;
}
function purOrderState(state){purOrderDraft.state=state;purOrderSaveForm(true);}
function purOrderRemove(){
 const d=purOrderDraft;if(!confirm('Delete '+d.number+'? The PO and its history remain in Include deleted and can be restored.'))return;
 const r=purOrderDelete(d.id,d.rev);if(!r.ok){purNotice=r.error;render();return;}purOrderDraft=null;purNotice='';render();
}
function purOrderRestoreForm(){const r=purOrderRestore(purOrderDraft.id);if(!r.ok){purNotice=r.error;render();return;}purOrderEdit(r.value.id);}
function purOrderAddLine(kind){if(kind==='other'&&purOrderDraft.lines.length===1&&!purOrderDraft.lines[0].description&&!purOrderDraft.lines[0].productCode)purOrderDraft.lines=[];purOrderDraft.lines.push(kind==='other'?purLineClean({id:salesUid('PL'),kind:'other',qty:1},0):purCatalogueLine(''));render();}
function purLineInput(l,i,k,label,type){
 return '<div><label for="pur_line_'+i+'_'+k+'">'+label+'</label><input id="pur_line_'+i+'_'+k+'" value="'+esc(l[k]??'')+'" '+(type==='number'?'type="number" step="any" min="0"':type==='date'?'type="date"':'type="text"')+(k==='unit'||k==='priceUnit'?' list="pur_units"':'')+' oninput="purOrderDraft.lines['+i+'].'+k+'=this.value;purRefreshTotals()"></div>';
}
function purOrderLineHTML(l,i){
 const total=purLineTotal(l);
 return '<tr data-pur-line="'+i+'"><td><label for="pur_line_'+i+'_description">Item</label>'+(l.kind==='stock'?'<b data-raw>'+esc(l.description)+'</b>':'<input id="pur_line_'+i+'_description" value="'+esc(l.description)+'" oninput="purOrderDraft.lines['+i+'].description=this.value">')+'</td>'+purPOCell(l,i,'qty','Quantity','number')+purPOCell(l,i,'unit','Order unit')+purPOCell(l,i,'price','Price','number')+purPOCell(l,i,'priceUnit','Price per')+purPOCell(l,i,'note','Line note')+'<td class="n"><b data-pur-line-total="'+i+'">'+(total==null?'—':esc(docNum(total,2)))+'</b></td><td><button type="button" class="line-x" aria-label="Remove line '+(i+1)+'" onclick="purOrderDraft.lines.splice('+i+',1);render()">×</button></td></tr>';
}
/* Update figures in place: rerendering on blur can remove the next input
   between focusing it and typing, silently losing its value. */
function purRefreshTotals(){
 if(!purOrderDraft)return;
 purOrderDraft.lines.forEach((l,i)=>{const el=document.querySelector('[data-pur-line-total="'+i+'"]'),n=purLineTotal(l);if(el)el.textContent=n==null?'—':docNum(n,2);});
 const t=purOrderTotals(purOrderDraft),el=document.querySelector('[data-pur-total]');
 if(el)el.textContent=(t.complete?'Total':'Known subtotal')+': '+docNum(t.known,2)+' '+purOrderDraft.currency+(t.missing?' · '+t.missing+' line(s) need price, quantity or conversion':'');
}
function purOrderForm(){
 const d=purOrderDraft,t=purOrderTotals(d),deleted=!!d.deletedAt;
 return '<div class="page-head sales-page-head"><div><h2>Purchasing</h2></div></div><div class="purchasing-workspace sales-order-editor"><div class="sales-editor-top"><div><div class="sales-order-title"><h3>'+esc(d.number||'New Purchase Order · Auto Number')+'</h3><span class="pill">'+purOrderStatus(d)+'</span></div><div class="mut mono" data-raw>'+esc(d.id||'Not saved')+'</div></div><div class="sales-editor-actions"><button type="button" onclick="if(purOrderLeave())render()">Close</button>'+
  (deleted?'<button type="button" onclick="purOrderRestoreForm()">Restore</button>':'<button type="button" class="pri" data-pur-po-save onclick="purOrderSaveForm(true)">Save</button><button type="button" onclick="purDocOpen()">Documents</button>'+(d.id?'<button type="button" onclick="purOrderRemove()">Delete</button>':''))+'</div></div>'+purPOStatusStrip(d)+
  (purNotice?'<div role="status" data-pur-po-notice class="pur-notice">'+esc(purNotice)+'</div>':'')+
  '<fieldset class="pur-po-edit form" '+(deleted?'disabled':'')+'><div class="sales-header-compact">'+
  purSupplierControl(d,'po')+purOrderField('date','Order date','date')+purOrderField('expectedDate','Expected date','date')+purCurrencyControl(d,'pur_po_currency','purOrderDraft.currency=this.value')+
  '<div><label for="pur_po_state">Status</label><select id="pur_po_state" aria-label="PO status" onchange="purOrderDraft.state=this.value">'+Object.entries(PUR_ORDER_STATES).map(([k,n])=>salesOption(k,n,d.state,true)).join('')+'</select></div></div>'+
  '<details class="sales-block pur-spec"><summary>Email / notes</summary><div class="sales-header-compact">'+purOrderField('to','Email to')+purOrderField('cc','CC')+'</div>'+
  '<label for="pur_po_note">PO notes</label><textarea id="pur_po_note" rows="2" oninput="purOrderDraft.note=this.value">'+esc(d.note)+'</textarea></details>'+
  '<datalist id="pur_units">'+MD_UNITS.map(u=>'<option value="'+u.code+'">'+u.nameEn+'</option>').join('')+'<option value="block">block</option></datalist>'+purPOLinesHTML()+'</fieldset><div class="pur-total" data-pur-total><b>'+(t.complete?'Total':'Known subtotal')+': '+esc(docNum(t.known,2)+' '+d.currency)+'</b>'+(t.missing?' · '+t.missing+' line(s) need price, quantity or conversion':'')+'</div>'+
  (d.id?purPOReceivingHTML(d)+purPOInvoicesHTML(d)+purHistoryHTML('po',d.id):'')+purPickerHTML()+(purDoc?purDocHTML():'')+'</div>';
}
function purPickerHTML(){
 if(!purPicker)return '';const p=purPicker;
 let body='';
 if(p.kind==='sheet'){
  const rows=(DB.glassSheet||[]).filter(s=>!purOrderDraft.supplierId||s.supplierId===purOrderDraft.supplierId);
  body='<p class="mut">Purchase prices keep their unit. All values can be changed in the PO.</p><label><input type="checkbox" onchange="purPicker.all=this.checked;render()" '+(p.all?'checked':'')+'> All suppliers</label>'+
   '<div class="pur-picker-list">'+(p.all?DB.glassSheet:rows).map(s=>'<button type="button" onclick="purPickerAddSheet('+purArg(s.id)+')">'+esc([s.productCode,s.supplier,s.sheetWIn+' × '+s.sheetHIn+' in',s.currency].join(' · '))+'</button>').join('')+'</div>';
 }else if(p.kind==='stock'){
  body='<div class="pur-picker-list">'+salesExtraItemCandidates().map(c=>'<button type="button" onclick="purPickerPush(purStockLine('+purArg(c.table)+','+purArg(c.id)+'))">'+esc(c.name+' · '+c.code)+'</button>').join('')+'</div>';
 }else{
  const orders=(DB.salesOrder||[]).filter(o=>!salesIsQuote(o)),o=salesRecord(p.orderId),l=o&&(o.lines||[]).find(l=>l.id===p.lineId);
  body='<label for="pur_source_order">Customer order</label><select id="pur_source_order" onchange="purPicker.orderId=this.value;purPicker.lineId=\'\';render()"><option value="">Choose order</option>'+orders.map(o=>'<option value="'+esc(o.id)+'" '+(o.id===p.orderId?'selected':'')+'>'+esc([o.businessNumber,salesCustomerDisplay(o.customerId)].filter(Boolean).join(' · '))+'</option>').join('')+'</select>'+
   (o?'<label for="pur_source_line">Position</label><select id="pur_source_line" onchange="purPicker.lineId=this.value;render()"><option value="">Choose position</option>'+o.lines.map((l,i)=>'<option value="'+esc(l.id)+'" '+(l.id===p.lineId?'selected':'')+'>'+esc('Line '+(i+1)+' · '+(l.mark||'')+' · '+docSize(l)+' · Qty '+l.qty)+'</option>').join('')+'</select>':'')+
   (l?'<div class="pur-picker-list"><button type="button" onclick="purPickerAddComponent(\'\')">Whole unit / laminate</button>'+glassBatchComponents(o,l).map(c=>'<button type="button" onclick="purPickerAddComponent('+purArg(c.key)+')">'+esc(purComponentLabel(c)+' · '+c.glass)+'</button>').join('')+'</div>':'');
 }
 return '<div class="doc-back"><section class="card pur-picker" role="dialog" aria-label="Add purchase line"><div class="pur-section-head"><h3>Add purchase line</h3><button type="button" onclick="purPicker=null;render()">Close</button></div>'+body+'</section></div>';
}
function purPickerPush(l){if(!l)return;const a=purOrderDraft.lines;if(a.length===1&&!a[0].description&&!a[0].spec&&!a[0].sheetId&&a[0].price==null)a.splice(0,1);a.push(l);purPicker=null;render();}
function purPickerAddSheet(id){
 const l=purSheetLine(id);if(!l)return;const s=DB.glassSheet.find(s=>s.id===id);
 if(!purOrderDraft.supplierId&&s.supplierId)purPickSupplier(s.supplierId,false);
 if(s.supplierId!==purOrderDraft.supplierId){purNotice='Choose a supply point for the selected supplier.';purPicker=null;render();return;}
 purPickerPush(l);
}
function purPickerAddComponent(key){purPickerPush(purOrderComponentLine(purPicker.orderId,purPicker.lineId,key));}
function purSalesLinksHTML(orderId,l,colspan){
 const links=purLinkedPurchases(orderId,l.id);if(!links.length)return '';
 return '<tr class="pur-sales-links"><td colspan="'+colspan+'">'+links.map(({p,l})=>'<span>'+esc(l.spec?l.spec.part:'Glass')+' · ordered from '+esc(purSupplierDisplay(p)||'Supplier not set')+' · '+(accessCan('purchasing')?'<button type="button" class="fin-link" onclick="purOpenLinked('+purArg(p.id)+')">'+esc(p.number)+'</button>':esc(p.number))+esc((l.expectedDate||p.expectedDate)?' · expected '+docDate(l.expectedDate||p.expectedDate):'')+'</span>').join(' · ')+'</td></tr>';
}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push((to)=>tab==='purchasing'&&to!=='purchasing'&&!purOrderLeave());

function purOpenLinked(id){
 if(!accessCan('purchasing'))return;
 const go=()=>{tab='purchasing';subtab=null;navMoreOpen=false;purOrderEdit(id);};
 if((window.NAV_GUARDS||[]).some(g=>g('purchasing',go)))return;go();
}
