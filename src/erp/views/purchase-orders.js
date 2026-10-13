/* Purchasing P2: reusable Sales column filters and draft PO forms.
   The owner enters one-off suppliers as text; a card is an explicit action.
   Gmail only opens a compose window. Sending is confirmed manually. */
let purView='orders',purOrderDraft=null,purOrderOriginal='',purShowDeleted=false,purPicker=null,purDoc=null;
function purNav(){
 return '<div class="pur-tabs">'+[['orders','Purchase orders'],['suppliers','Suppliers'],['history','History']].map(([k,n])=>'<button type="button" class="'+(purView===k?'on':'')+'" onclick="purGo(\''+k+'\')">'+n+'</button>').join('')+'</div>';
}
function purGo(v){if(!purOrderLeave())return;purSupplierDraft=null;purView=v;purNotice='';salesListMenu=null;render();}
function purOrderLeave(){
 if(purOrderDraft&&JSON.stringify(purOrderDraft)!==purOrderOriginal&&!confirm('Discard unsaved purchase order changes?'))return false;
 purOrderDraft=null;purPicker=null;purDoc=null;return true;
}
function purOrderColumns(){
 if(purView==='history')return [['at','When','date'],['entity','Document','text'],['name','Reference','text'],['what','Action','list'],['by','Who','text']].map(([k,label,type])=>({k,label,type,def:true}));
 return [['number','PO','text'],['supplierName','Supplier','text'],['date','Date','date'],['expectedDate','Expected','date'],['currency','Currency','list'],['amount','Amount','number'],['pricing','Pricing','list'],['status','Status','list'],['held','Held at supplier','number'],['createdBy','Created by','text']].map(([k,label,type])=>({k,label,type,def:true}));
}
function purOrderInfos(){
 if(purView==='history')return (DB.purchasingEvent||[]).map(e=>{const p=e.entity==='po'?purOrderFind(e.entityId):purSupplierFind(e.entityId);return {o:{id:e.id},e,memo:Object.assign({},e,{entity:e.entity==='po'?'PO':'Supplier',name:p?(p.number||p.name):e.entityId})};});
 return (DB.purchaseOrder||[]).filter(p=>purShowDeleted||!p.deletedAt).map(p=>{const t=purOrderTotals(p);return {o:{id:p.id},p,memo:Object.assign({},p,{amount:t.complete?t.known:null,pricing:t.complete?'Complete':'Price / quantity needed',status:purOrderStatus(p),held:p.lines.filter(l=>l.held).length})};});
}
function purOrderList(){
 const infos=purOrderInfos(),rows=salesListRows(infos),cols=salesListColumns(),history=purView==='history';
 const cell=(i,c)=>{
  const v=salesListValue(i,c.k);
  if(c.k==='number'||history&&c.k==='name')return '<td><button type="button" class="fin-link" data-pur-po="'+esc(i.p?i.p.id:i.e.entityId)+'" onclick="'+(i.p||i.e.entity==='po'?'purOrderEdit':'purSupplierEdit')+'('+purArg(i.p?i.p.id:i.e.entityId)+')">'+esc(v)+'</button></td>';
  return '<td data-raw class="'+(c.type==='number'?'n':'')+'">'+(v==null||v===''?'—':c.k==='amount'?esc(docNum(v,2)):c.k==='at'?esc(new Date(v).toLocaleString()):esc(v))+'</td>';
 };
 return '<div class="purchasing-workspace">'+purNav()+'<div class="sales-toolbar pur-toolbar"><h2>'+(history?'Purchasing history':'Purchase orders')+'</h2><span class="sales-toolbar-sp"></span>'+(history?'':'<label><input type="checkbox" '+(purShowDeleted?'checked':'')+' onchange="purShowDeleted=this.checked;render()"> Include deleted</label><button type="button" class="pri" data-pur-po-new onclick="purOrderEdit(\'\')">+ PO</button>')+'</div>'+salesListFilterChips()+
  '<div class="card sales-list-card"><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th><button type="button" class="gb-settings" aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+cols.map(purListHeader).join('')+'</tr></thead><tbody>'+
  rows.map(i=>'<tr><td></td>'+cols.map(c=>cell(i,c)).join('')+'</tr>').join('')+(!rows.length?'<tr><td colspan="'+(cols.length+1)+'" class="empty">No records in this view.</td></tr>':'')+'</tbody><tfoot><tr><td colspan="'+(cols.length+1)+'">'+rows.length+' records</td></tr></tfoot></table></div></div>'+salesListMenuHTML(infos)+'</div>';
}
function purOrderEdit(id){
 if(!accessCan('purchasing'))return;
 const p=id?purOrderFind(id):null;if(id&&!p)return;
 purSupplierDraft=null;purView='orders';purPicker=null;purDoc=null;purNotice='';
 purOrderDraft=purClone(p||purOrderClean({date:finToday(),lines:[{id:salesUid('PL'),qty:1}]}));
 purOrderOriginal=JSON.stringify(purOrderDraft);render();
}
function purOrderField(k,label,type){
 const v=purOrderDraft[k]??'';
 return '<div><label for="pur_po_'+k+'">'+label+'</label><input id="pur_po_'+k+'" type="'+(type||'text')+'" value="'+esc(v)+'" oninput="purOrderDraft.'+k+'=this.value"></div>';
}
function purPickSupplier(id){
 const s=purSupplierFind(id),d=purOrderDraft;d.supplierId=id;d.supplier=s?purClone(s):null;
 if(s){d.supplierName=s.name;d.to=s.email;d.currency=s.currency;if(s.leadTimeDays!=null&&d.date){const date=new Date(d.date+'T12:00:00');date.setDate(date.getDate()+s.leadTimeDays);d.expectedDate=finLocalDate(date);}}
 render();
}
function purPOStoreSupplier(){
 const d=purOrderDraft,r=purSupplierSave({name:d.supplierName,email:d.to,currency:d.currency});
 if(!r.ok){purNotice=r.error;render();return;}d.supplierId=r.value.id;d.supplier=purClone(r.value);purNotice='';render();
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
function purOrderAddLine(){purOrderDraft.lines.push(purLineClean({id:salesUid('PL'),qty:1},0));render();}
function purLineInput(l,i,k,label,type){
 return '<div><label for="pur_line_'+i+'_'+k+'">'+label+'</label><input id="pur_line_'+i+'_'+k+'" value="'+esc(l[k]??'')+'" '+(type==='number'?'type="number" step="any" min="0"':type==='date'?'type="date"':'type="text"')+(k==='unit'||k==='priceUnit'?' list="pur_units"':'')+' oninput="purOrderDraft.lines['+i+'].'+k+'=this.value;purRefreshTotals()"></div>';
}
function purOrderLineHTML(l,i){
 const total=purLineTotal(l),spec=purSpecTexts(l.spec),warn=l.spec&&l.spec.parts.some(p=>p.missing);
 return '<section class="card pur-card pur-po-line" data-pur-line="'+i+'"><div class="pur-section-head"><h3>Line '+(i+1)+'</h3><button type="button" class="sm dl" aria-label="Remove line '+(i+1)+'" onclick="purOrderDraft.lines.splice('+i+',1);render()">Remove</button></div>'+
  '<label for="pur_line_'+i+'_description">Description</label><textarea id="pur_line_'+i+'_description" rows="2" oninput="purOrderDraft.lines['+i+'].description=this.value">'+esc(l.description)+'</textarea>'+
  '<div class="pur-line-fields">'+[['qty','Quantity','number'],['unit','Order unit'],['price','Price','number'],['priceUnit','Price per'],['expectedDate','Expected','date']].map(([k,n,t])=>purLineInput(l,i,k,n,t)).join('')+'</div>'+
  (l.sourceCurrency&&l.sourceCurrency!==purOrderDraft.currency?'<p class="warn">Supply quote: '+esc(l.sourceCurrency)+'. Enter the agreed price in '+esc(purOrderDraft.currency)+'.</p>':'')+
  ('<details class="pur-spec" '+(l.kind==='sheet'||purUnit(l.unit)==='block'?'open':'')+'><summary>Sheet / block details</summary><div class="pur-line-fields">'+[['widthIn','Sheet width, in'],['heightIn','Sheet height, in'],['sheetsPerBlock','Sheets per block']].map(([k,n])=>purLineInput(l,i,k,n,'number')).join('')+'</div></details>')+
  '<div class="pur-section-head"><label class="pur-active"><input type="checkbox" '+(l.held?'checked':'')+' onchange="purOrderDraft.lines['+i+'].held=this.checked"> Held at supplier</label><b data-pur-line-total="'+i+'">Line total: '+(total==null?'Not complete':esc(docNum(total,2)+' '+purOrderDraft.currency))+'</b></div>'+
  '<label for="pur_line_'+i+'_note">Line note</label><input id="pur_line_'+i+'_note" value="'+esc(l.note)+'" oninput="purOrderDraft.lines['+i+'].note=this.value">'+
  (spec.length?'<details class="pur-spec"><summary>Source specification · '+esc(l.spec.part)+'</summary>'+(warn?'<p class="warn">Glass is missing from the catalogue. Review the description before ordering.</p>':'')+'<div data-raw>'+spec.map(s=>'<p>'+esc(s)+'</p>').join('')+'</div><p class="mut">Snapshot from the customer order. Receive external glass and use Skip in the shop.</p></details>':'')+'</section>';
}
/* Update figures in place: rerendering on blur can remove the next input
   between focusing it and typing, silently losing its value. */
function purRefreshTotals(){
 if(!purOrderDraft)return;
 purOrderDraft.lines.forEach((l,i)=>{const el=document.querySelector('[data-pur-line-total="'+i+'"]'),n=purLineTotal(l);if(el)el.textContent='Line total: '+(n==null?'Not complete':docNum(n,2)+' '+purOrderDraft.currency);});
 const t=purOrderTotals(purOrderDraft),el=document.querySelector('[data-pur-total]');
 if(el)el.textContent=(t.complete?'Total':'Known subtotal')+': '+docNum(t.known,2)+' '+purOrderDraft.currency+(t.missing?' · '+t.missing+' line(s) need price, quantity or conversion':'');
}
function purOrderForm(){
 const d=purOrderDraft,t=purOrderTotals(d),deleted=!!d.deletedAt;
 return '<div class="purchasing-workspace"><div class="sales-toolbar pur-toolbar"><button type="button" onclick="if(purOrderLeave())render()">← Purchase orders</button><h2>'+esc(d.number||'New purchase order')+'</h2><span class="pill">'+purOrderStatus(d)+'</span><span class="sales-toolbar-sp"></span>'+
  (deleted?'<button type="button" onclick="purOrderRestoreForm()">Restore</button>':'<button type="button" onclick="purDocOpen()">Preview / PDF / Email</button><button type="button" class="pri" data-pur-po-save onclick="purOrderSaveForm(true)">Save</button>'+(d.id?'<button type="button" onclick="purOrderRemove()">Delete</button>':''))+'</div>'+
  (purNotice?'<div role="status" data-pur-po-notice class="pur-notice">'+esc(purNotice)+'</div>':'')+
  '<fieldset class="pur-po-edit form" '+(deleted?'disabled':'')+'><section class="card pur-card"><div class="pur-fields">'+
  '<div><label for="pur_po_card">Supplier card · optional</label><select id="pur_po_card" onchange="purPickSupplier(this.value)"><option value="">One-off / free text</option>'+(DB.supplier||[]).map(s=>'<option value="'+esc(s.id)+'" '+(s.id===d.supplierId?'selected':'')+'>'+esc(s.name)+(s.active?'':' · Archived')+'</option>').join('')+'</select></div>'+
  purOrderField('supplierName','Supplier / shop name')+purOrderField('date','Order date','date')+purOrderField('expectedDate','Expected date','date')+purOrderField('currency','Currency')+purOrderField('to','Email to')+purOrderField('cc','CC')+
  '<div><label>Status</label><select aria-label="PO status" onchange="purOrderDraft.state=this.value">'+Object.entries(PUR_ORDER_STATES).map(([k,n])=>'<option value="'+k+'" '+(d.state===k?'selected':'')+'>'+n+'</option>').join('')+'</select></div></div>'+
  (!d.supplierId?'<p><button type="button" onclick="purPOStoreSupplier()">Save as supplier</button></p>':'')+
  '<label for="pur_po_note">PO notes</label><textarea id="pur_po_note" rows="2" oninput="purOrderDraft.note=this.value">'+esc(d.note)+'</textarea></section>'+
  '<div class="pur-line-actions"><button type="button" data-pur-add-line onclick="purOrderAddLine()">+ Line</button><button type="button" onclick="purPicker={kind:\'sheet\'};render()">From supply points</button><button type="button" onclick="purPicker={kind:\'order\',orderId:\'\',lineId:\'\'};render()">From customer order</button></div>'+
  '<datalist id="pur_units">'+MD_UNITS.map(u=>'<option value="'+u.code+'">'+u.nameEn+'</option>').join('')+'<option value="block">block</option></datalist>'+
  d.lines.map(purOrderLineHTML).join('')+'</fieldset><div class="pur-total" data-pur-total><b>'+(t.complete?'Total':'Known subtotal')+': '+esc(docNum(t.known,2)+' '+d.currency)+'</b>'+(t.missing?' · '+t.missing+' line(s) need price, quantity or conversion':'')+'</div>'+
  (d.id?purHistoryHTML('po',d.id):'')+purPickerHTML()+(purDoc?purDocHTML():'')+'</div>';
}
function purPickerHTML(){
 if(!purPicker)return '';const p=purPicker;
 let body='';
 if(p.kind==='sheet'){
  const rows=(DB.glassSheet||[]).filter(s=>!purOrderDraft.supplierId||s.supplierId===purOrderDraft.supplierId);
  body='<p class="mut">Purchase prices keep their unit. All values can be changed in the PO.</p><label><input type="checkbox" onchange="purPicker.all=this.checked;render()" '+(p.all?'checked':'')+'> All suppliers</label>'+
   '<div class="pur-picker-list">'+(p.all?DB.glassSheet:rows).map(s=>'<button type="button" onclick="purPickerAddSheet('+purArg(s.id)+')">'+esc([s.productCode,s.supplier,s.sheetWIn+' × '+s.sheetHIn+' in',s.currency].join(' · '))+'</button>').join('')+'</div>';
 }else{
  const orders=(DB.salesOrder||[]).filter(o=>!salesIsQuote(o)),o=salesRecord(p.orderId),l=o&&(o.lines||[]).find(l=>l.id===p.lineId);
  body='<label for="pur_source_order">Customer order</label><select id="pur_source_order" onchange="purPicker.orderId=this.value;purPicker.lineId=\'\';render()"><option value="">Choose order</option>'+orders.map(o=>'<option value="'+esc(o.id)+'" '+(o.id===p.orderId?'selected':'')+'>'+esc([o.businessNumber,salesCustomerDisplay(o.customerId)].filter(Boolean).join(' · '))+'</option>').join('')+'</select>'+
   (o?'<label for="pur_source_line">Position</label><select id="pur_source_line" onchange="purPicker.lineId=this.value;render()"><option value="">Choose position</option>'+o.lines.map((l,i)=>'<option value="'+esc(l.id)+'" '+(l.id===p.lineId?'selected':'')+'>'+esc('Line '+(i+1)+' · '+(l.mark||'')+' · '+docSize(l)+' · Qty '+l.qty)+'</option>').join('')+'</select>':'')+
   (l?'<div class="pur-picker-list"><button type="button" onclick="purPickerAddComponent(\'\')">Whole unit / laminate</button>'+glassBatchComponents(o,l).map(c=>'<button type="button" onclick="purPickerAddComponent('+purArg(c.key)+')">'+esc(purComponentLabel(c)+' · '+c.glass)+'</button>').join('')+'</div>':'');
 }
 return '<div class="doc-back"><section class="card pur-picker" role="dialog" aria-label="Add purchase line"><div class="pur-section-head"><h3>Add purchase line</h3><button type="button" onclick="purPicker=null;render()">Close</button></div>'+body+'</section></div>';
}
function purPickerPush(l){if(!l)return;const a=purOrderDraft.lines;if(a.length===1&&!a[0].description&&!a[0].spec&&!a[0].sheetId&&a[0].price==null)a.splice(0,1);a.push(l);purPicker=null;render();}
function purPickerAddSheet(id){const l=purSheetLine(id);if(!l)return;const s=DB.glassSheet.find(s=>s.id===id);if(s.currency!==purOrderDraft.currency)purNotice='Supply price is in '+s.currency+'. Review the PO currency or enter the agreed price.';purPickerPush(l);}
function purPickerAddComponent(key){purPickerPush(purOrderComponentLine(purPicker.orderId,purPicker.lineId,key));}
function purSalesLinksHTML(orderId,l,colspan){
 const links=purLinkedPurchases(orderId,l.id);if(!links.length)return '';
 return '<tr class="pur-sales-links"><td colspan="'+colspan+'">'+links.map(({p,l})=>'<span>'+esc(l.spec?l.spec.part:'Glass')+' · ordered from '+esc(p.supplierName||'Supplier not set')+' · '+(accessCan('purchasing')?'<button type="button" class="fin-link" onclick="purOpenLinked('+purArg(p.id)+')">'+esc(p.number)+'</button>':esc(p.number))+esc((l.expectedDate||p.expectedDate)?' · expected '+docDate(l.expectedDate||p.expectedDate):'')+'</span>').join(' · ')+'</td></tr>';
}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push((to)=>tab==='purchasing'&&to!=='purchasing'&&!purOrderLeave());

function purOpenLinked(id){
 if(!accessCan('purchasing'))return;
 const go=()=>{tab='purchasing';subtab=null;navMoreOpen=false;purOrderEdit(id);};
 if((window.NAV_GUARDS||[]).some(g=>g('purchasing',go)))return;go();
}
