/* Receiving is entered by office / optimization staff from the shop's
   count sheet. All values remain editable; warnings never prevent Save.
   Each receipt line may carry its own size and actual sheet count. */
let purFulfilDraft=null,purFulfilOriginal='',purFulfilPreview=false,purShowUndone=false;
function purFulfilLeave(){
 if(purFulfilDraft&&JSON.stringify(purFulfilDraft)!==purFulfilOriginal&&!confirm('Discard unsaved delivery changes?'))return false;
 purFulfilDraft=null;purFulfilPreview=false;return true;
}
function purFulfilEdit(kind,id,poId,requestId){
 if(!accessCan('purchasing')||!purMoneyLeave()||!purFulfilLeave()||!purOrderLeave())return;
 const d=id?purFulfilFind(kind,id):purFulfilFromPO(kind,poId||'',requestId);if(!d)return;
 purNewSupplier=null;purSupplierDraft=null;purView=kind==='receipt'?'receipts':'requests';purFulfilDraft={kind,data:purClone(d)};purFulfilOriginal=JSON.stringify(purFulfilDraft);purNotice='';render();
}
function purReceiveFromOrder(kind){if(!purOrderSaveForm(true))return;const id=purOrderDraft.id;purFulfilEdit(kind,'',id);}
function purReceiveRequest(){if(!purFulfilSaveForm())return;const d=purFulfilDraft.data;purFulfilEdit('receipt','',d.poId,d.id);}
/* A receipt row with nothing typed means it did not arrive (held glass,
   the unbrought part): it is left out instead of recorded as unknown. */
function purFulfilRowEmpty(l){return ['qty','actualSheets','damaged','damagedSheets'].every(k=>purText(l[k])==='');}
function purFulfilSaveForm(){
 const f=purFulfilDraft;f.data.lines.forEach(purFulfilMapBroken);
 const data=f.kind==='receipt'?Object.assign({},f.data,{lines:f.data.lines.filter(l=>!purFulfilRowEmpty(l))}):f.data;
 if(f.kind==='receipt'&&!data.lines.length&&f.data.lines.length){purNotice='Enter what arrived.';render();return false;}
 const r=purFulfilSave(f.kind,data);if(!r.ok){purNotice=r.error;render();return false;}
 f.data=purClone(r.value);purFulfilOriginal=JSON.stringify(f);purNotice='Saved.';render();return true;
}
function purFulfilUndoForm(restore){
 const f=purFulfilDraft,d=f.data,verb=restore?'Restore':f.kind==='receipt'?'Undo':'Cancel';
 if(!confirm(verb+' '+d.number+'? The document and its history remain. '+(f.kind==='receipt'?'Received totals are recalculated.':'Existing receipts stay recorded.')))return;
 const r=purFulfilUndo(f.kind,d.id,d.rev,restore);if(!r.ok){purNotice=r.error;render();return;}
 f.data=purClone(r.value);purFulfilOriginal=JSON.stringify(f);purNotice='';render();
}
function purFulfilField(k,label,type){
 const d=purFulfilDraft.data;return '<div><label for="pur_delivery_'+k+'">'+label+'</label><input id="pur_delivery_'+k+'" type="'+(type||'text')+'" value="'+esc(d[k]??'')+'" oninput="purFulfilDraft.data.'+k+'=this.value"></div>';
}
/* Owner, 14.10.2026: long forms mislead people in the shop. One table row
   per delivered item; the rarely needed fields stay under More. */
function purFulfilInput(l,i,k,label,type){
 return '<div><label for="pur_receive_'+i+'_'+k+'">'+label+'</label>'+purFulfilCell(l,i,k,type)+'</div>';
}
function purFulfilCell(l,i,k,type,label){
 return '<input id="pur_receive_'+i+'_'+k+'"'+(label?' aria-label="'+esc(label)+' '+(i+1)+'"':'')+' value="'+esc(l[k]??'')+'" '+(type==='number'?'type="number" min="0" step="any"':'type="text"')+(k==='reason'||k==='resolution'?' list="pur_'+k+'"':'')+' oninput="purFulfilDraft.data.lines['+i+'].'+k+'=this.value;'+(k==='unit'?'purFulfilMapBroken(purFulfilDraft.data.lines['+i+']);':'')+'purFulfilRefresh()">';
}
/* One Broken field: sheets on a block line, the line's own unit otherwise. */
function purBrokenShown(l){const v=purUnit(l.unit)==='block'?l.damagedSheets:l.damaged!=null?l.damaged:l.damagedSheets;return v??'';}
function purFulfilMapBroken(l){
 if(!l||!Object.prototype.hasOwnProperty.call(l,'broken'))return;
 const u=purUnit(l.unit),v=l.broken;
 if(u==='block'){l.damagedSheets=v;l.damaged=null;}else if(['sheet','lite'].includes(u)){l.damaged=v;l.damagedSheets=v;}else l.damaged=v;
}
function purFulfilRefresh(){const el=document.querySelector('[data-pur-delivery-warnings]');if(el)el.innerHTML=purFulfilWarnings(purFulfilDraft.kind,purFulfilDraft.data).map(s=>'<p>'+esc(s)+'</p>').join('');}
function purFulfilSelectPO(id){
 const d=purFulfilDraft.data,p=purOrderFind(id);d.poId=id;d.requestId='';d.lines.forEach(l=>{l.poLineId='';l.requestLineId='';});
 if(p){d.supplierId=p.supplierId;d.supplierName=p.supplierName;d.to=p.to;d.cc=p.cc;}render();
}
function purFulfilLoadPO(){
 const f=purFulfilDraft;if(!f.data.poId)return;
 if(!confirm('Replace these draft lines with the selected PO lines?'))return;
 f.data.lines=purFulfilFromPO(f.kind,f.data.poId).lines;f.data.requestId='';render();
}
function purFulfilLinkLine(i,id){
 const d=purFulfilDraft.data,l=d.lines[i],p=purOrderFind(d.poId),pl=p&&p.lines.find(x=>x.id===id);l.poLineId=id;l.requestLineId='';
 if(pl){Object.assign(l,purGlassIdentity(pl));['description','unit','widthIn','heightIn'].forEach(k=>{if(l[k]==null||l[k]==='')l[k]=pl[k];});}render();
}
function purFulfilExpected(l){
 const f=purFulfilDraft,d=f.data,p=purOrderFind(d.poId),pl=p&&p.lines.find(x=>x.id===l.poLineId),request=purFulfilFind('request',d.requestId),rl=request&&request.lines.find(x=>x.id===l.requestLineId);
 if(rl&&f.kind==='receipt')return rl.qty==null?'':String(Math.max(0,rl.qty-purRequestReceived(request,rl)));
 if(!pl)return '';const b=purReceived(p,pl,f.kind==='receipt'?d.id:null);
 if(l.replacement)return String(b.replaceLeft);
 return b.remaining==null?'':(pl.held?'held ':'')+b.remaining;
}
function purFulfilItem(l,i){
 const d=purFulfilDraft.data,p=purOrderFind(d.poId),pl=p&&p.lines.find(x=>x.id===l.poLineId),n=pl?p.lines.indexOf(pl)+1+' · ':'';
 const g=['glass','sheet'].includes(l.kind)&&purGlassProduct(l),name=g?g.name:l.description;
 if(l.kind==='other'&&!pl&&!l.replacement)return '<input id="pur_receive_'+i+'_description" aria-label="Item '+(i+1)+'" placeholder="Item" value="'+esc(l.description)+'" oninput="purFulfilDraft.data.lines['+i+'].description=this.value">';
 return '<span class="pur-item" data-raw>'+(l.replacement?'<b>Replacement</b> · ':'')+esc(n+(name||'Choose glass'))+'</span>';
}
function purFulfilRowHTML(l,i){
 const f=purFulfilDraft,receipt=f.kind==='receipt',d=f.data,p=purOrderFind(d.poId),request=receipt&&purFulfilFind('request',d.requestId);
 const glass=['glass','sheet'].includes(l.kind),open=glass&&!purGlassProduct(l)&&!l.productId,cols=receipt?12:8;
 const broken='<input id="pur_receive_'+i+'_broken" aria-label="Broken '+(i+1)+'" type="number" min="0" step="any" value="'+esc(Object.prototype.hasOwnProperty.call(l,'broken')?l.broken:purBrokenShown(l))+'" oninput="purFulfilDraft.data.lines['+i+'].broken=this.value;purFulfilMapBroken(purFulfilDraft.data.lines['+i+']);purFulfilRefresh()">';
 const more=(p?'<div><label for="pur_receipt_link_'+i+'">PO line</label><select id="pur_receipt_link_'+i+'" onchange="purFulfilLinkLine('+i+',this.value)"><option value="">Unplanned / other item</option>'+p.lines.map((pl,j)=>'<option value="'+esc(pl.id)+'" '+(pl.id===l.poLineId?'selected':'')+'>'+esc((j+1)+'. '+pl.description)+'</option>').join('')+(l.poLineId&&!p.lines.some(pl=>pl.id===l.poLineId)?'<option selected value="'+esc(l.poLineId)+'">Removed PO line</option>':'')+'</select></div>':'')+
  (request?'<div><label for="pur_request_line_'+i+'">Request line</label><select id="pur_request_line_'+i+'" onchange="purFulfilDraft.data.lines['+i+'].requestLineId=this.value;purFulfilRefresh()"><option value="">Outside this request</option>'+request.lines.map((rl,j)=>'<option value="'+esc(rl.id)+'" '+(rl.id===l.requestLineId?'selected':'')+'>'+esc((j+1)+'. '+rl.description)+'</option>').join('')+'</select></div>':'')+
  (l.kind!=='other'&&!glass?purFulfilInput(l,i,'description','Description'):'')+purFulfilInput(l,i,'note','Line note');
 return '<tr data-pur-receive-row="'+i+'"><td class="mono line-num">'+(i+1)+'</td><td>'+purFulfilItem(l,i)+'</td><td>'+purFulfilCell(l,i,'widthIn','number','Width')+'</td><td>'+purFulfilCell(l,i,'heightIn','number','Height')+'</td><td class="n mut" data-raw>'+esc(purFulfilExpected(l))+'</td><td>'+purFulfilCell(l,i,'qty','number',receipt?'Arrived':'Request')+'</td><td>'+purFulfilCell(l,i,'unit','text','Unit')+'</td>'+
  (receipt?'<td>'+purFulfilCell(l,i,'actualSheets','number','Sheets')+'</td><td>'+broken+'</td><td>'+purFulfilCell(l,i,'reason','text','Reason')+'</td><td>'+purFulfilCell(l,i,'resolution','text','Resolution')+'</td>':'')+
  '<td><button type="button" class="sm dl line-delete" aria-label="Remove line '+(i+1)+'" onclick="purFulfilDraft.data.lines.splice('+i+',1);render()">×</button></td></tr>'+
  '<tr class="pur-glass-detail"><td></td><td colspan="'+(cols-1)+'"><details class="pur-spec"'+(open?' open':'')+'><summary>More</summary>'+(glass?purGlassSelect(l,i,'delivery'):'')+'<div class="sales-header-compact">'+more+'</div></details></td></tr>';
}
function purFulfilForm(){
 const f=purFulfilDraft,d=f.data,receipt=f.kind==='receipt',p=purOrderFind(d.poId),requests=(DB.purchaseDeliveryRequest||[]).filter(r=>r.poId===d.poId);
 const heads=receipt?['#','Item','Width, in','Height, in','Waiting','Arrived','Unit','Sheets','Broken','Reason','Resolution','']:['#','Item','Width, in','Height, in','At supplier','Request','Unit',''];
 return '<div class="purchasing-workspace sales-order-editor"><div class="sales-editor-top pur-toolbar"><button type="button" onclick="if(purFulfilLeave())render()">← '+(receipt?'Receipts':'Delivery requests')+'</button><h2>'+esc(d.number||'New '+(receipt?'receipt':'delivery request'))+'</h2><span class="pill">'+purFulfilStatus(f.kind,d)+'</span><span class="sales-toolbar-sp"></span>'+
  (d.voidAt?'<button type="button" onclick="purFulfilUndoForm(true)">Restore</button>':'<button type="button" class="pri" data-pur-delivery-save onclick="purFulfilSaveForm()">Save</button>'+(receipt?'':'<button type="button" onclick="purRequestPreviewOpen()">Preview / PDF / Email</button>'+(d.id?'<button type="button" onclick="purReceiveRequest()">Receive</button>':''))+(d.id?'<button type="button" onclick="purFulfilUndoForm(false)">'+(receipt?'Undo receipt':'Cancel request')+'</button>':''))+'</div>'+
  (purNotice?'<div role="status" class="pur-notice">'+esc(purNotice)+'</div>':'')+'<div class="pur-notice" data-pur-delivery-warnings>'+purFulfilWarnings(f.kind,d).map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>'+
  '<fieldset class="pur-po-edit form" '+(d.voidAt?'disabled':'')+'><div class="sales-header-compact"><div><label for="pur_delivery_po">Purchase order · optional</label><select id="pur_delivery_po" onchange="purFulfilSelectPO(this.value)"><option value="">Without PO</option>'+(DB.purchaseOrder||[]).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.poId?'selected':'')+'>'+esc(x.number+' · '+x.supplierName+' · '+purOrderStatus(x))+'</option>').join('')+(d.poId&&!p?'<option selected value="'+esc(d.poId)+'">Missing PO</option>':'')+'</select></div>'+
  purSupplierControl(d,'delivery')+purFulfilField('date',receipt?'Received date':'Request date','date')+
  (receipt?purFulfilField('receivedBy','Received by')+purFulfilField('packingSlip','Supplier packing slip')+(requests.length||d.requestId?'<div><label for="pur_delivery_request">Delivery request · optional</label><select id="pur_delivery_request" onchange="purFulfilDraft.data.requestId=this.value;purFulfilDraft.data.lines.forEach(l=>l.requestLineId=\'\');render()"><option value="">Without request</option>'+requests.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===d.requestId?'selected':'')+'>'+esc(r.number+' · '+purFulfilStatus('request',r))+'</option>').join('')+'</select>'+(d.requestId?'<button type="button" class="sm" onclick="purFulfilLoadRequest()">Load request lines</button>':'')+'</div>':''):purFulfilField('expectedDate','Requested delivery','date')+purFulfilField('to','Email to')+purFulfilField('cc','CC'))+
  purFulfilField('note','Notes')+'</div>'+
  '<section class="sales-block sales-lines-block"><div class="sales-lines-head"><div><b>'+(receipt?'WHAT ARRIVED':'WHAT TO BRING')+'</b><span>'+(receipt?'Empty rows are not saved':'Only receipts reduce the held balance')+'</span></div><div class="sales-line-tools">'+(p?'<button type="button" onclick="purFulfilLoadPO()">Load PO lines</button>':'')+'<button type="button" onclick="purFulfilAddLine(\'glass\')">+ Glass</button><button type="button" onclick="purPicker={kind:\'stock\',target:\'receipt\'};render()">+ Material</button><button type="button" onclick="purFulfilAddLine(\'other\')">+ Other item</button></div></div>'+
  '<div class="sales-table-wrap"><table class="sales-lines-table pur-receive-table'+(receipt?'':' pur-request-table')+'"><thead><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(d.lines.map(purFulfilRowHTML).join('')||'<tr><td colspan="'+heads.length+'" class="empty">No lines.</td></tr>')+'</tbody></table></div></section>'+
  '<datalist id="pur_reason"><option>In transit</option><option>Factory defect</option><option>Our breakage</option><option>Other</option></datalist><datalist id="pur_resolution"><option>Credit requested</option><option>Replacement</option><option>Written off</option><option>Other</option></datalist></fieldset>'+
  (d.id?purHistoryHTML(f.kind,d.id):'')+(purPicker?purPickerHTML():'')+(purFulfilPreview?purRequestPreviewHTML():'')+'</div>';
}
function purFulfilLoadRequest(){
 const f=purFulfilDraft;if(!confirm('Replace these draft lines with the selected delivery request?'))return;
 f.data.lines=purFulfilFromPO('receipt',f.data.poId,f.data.requestId).lines;render();
}
function purReceivingColumns(){
 if(purView==='held')return [['item','Glass / item','text'],['size','Size, in','text'],['supplierName','Supplier','text'],['po','PO','text'],['ordered','Bought','number'],['received','Delivered','number'],['remaining','At supplier','number'],['unit','Unit','list'],['perMonth','Per month','number'],['runsOut','Runs out','date'],['leadTime','Lead, days','number'],['orderBy','Order by','date'],['status','Status','list']].map(([k,label,type])=>({k,label,type,def:!['received','unit'].includes(k)}));
 const waiting=['backorders','held'].includes(purView),cols=waiting?
  [['number','PO','text'],['supplierName','Supplier','text'],['description','Description','text'],['size','Sheet size, in','text'],['ordered','Purchased','number'],['received','Received','number'],['remaining',purView==='held'?'At supplier':'Outstanding','number'],['unit','Unit','list'],['expectedDate','Expected','date'],['review','Review','text']]:
  [['number',purView==='receipts'?'Receipt':'Request','text'],['po','PO','text'],['supplierName','Supplier','text'],['date','Date','date'],['expectedDate','Requested delivery','date'],['packingSlip','Packing slip','text'],['receivedBy','Received by','text'],['status','Status','list'],['createdBy','Recorded by','text']];
 return cols.map(([k,label,type])=>({k,label,type,def:waiting||!(purView==='receipts'?['expectedDate']:['packingSlip','receivedBy']).includes(k)}));
}
function purReceivingInfos(){
 if(purView==='held')return purHeldGroups().map(a=>({o:{id:a.key},held:a,memo:Object.assign({},a,{po:a.pos.map(p=>p.number).join(', ')})}));
 if(['backorders','held'].includes(purView))return purWaitingRows(purView==='held').map(({p,l,b,replace})=>({o:{id:p.id+'|'+l.id+(replace?'|replacement':'')},p,l,memo:Object.assign({number:p.number,supplierName:purSupplierDisplay(p),description:l.description,size:l.widthIn&&l.heightIn?l.widthIn+' × '+l.heightIn:'',ordered:b.ordered,received:b.received,remaining:b.remaining,unit:l.unit,expectedDate:l.expectedDate||p.expectedDate,review:b.unknown?'Review quantity / unit / glass':''},
  replace?{description:'Replacement · '+l.description,ordered:b.replaceDue,received:b.replaceArrived,remaining:b.replaceLeft,unit:b.replaceUnit,review:''}:{})}));
 const kind=purView==='receipts'?'receipt':'request';return (DB[PUR_FULFIL[kind].key]||[]).filter(d=>purShowUndone||!d.voidAt).map(d=>({o:{id:d.id},d,kind,memo:Object.assign({},d,{supplierName:purSupplierDisplay(d)},{po:(purOrderFind(d.poId)||{}).number||'',status:purFulfilStatus(kind,d)})}));
}
function purReceivingList(){
 const infos=purReceivingInfos(),rows=salesListRows(infos),cols=salesListColumns(),kind=purView==='receipts'?'receipt':'request',waiting=['backorders','held'].includes(purView),title=({receipts:'Receipts',requests:'Delivery requests',backorders:'Waiting from suppliers',held:'Held at supplier'})[purView];
 const cell=(i,c)=>{const v=salesListValue(i,c.k);if(i.held)return purHeldCell(i.held,c,v);return '<td'+(c.type==='number'?' class="n"':'')+'>'+(c.k==='number'?'<button type="button" class="fin-link" onclick="'+(i.p?'purOrderEdit('+purArg(i.p.id)+')':'purFulfilEdit('+purArg(i.kind)+','+purArg(i.d.id)+')')+'">'+esc(v)+'</button>':v==null||v===''?'—':esc(v))+'</td>';};
 return '<div class="purchasing-workspace">'+'<div class="card sales-list-card"><div class="sales-toolbar">'+purNav()+'<span class="sales-toolbar-sp"></span>'+(waiting?'':'<label><input type="checkbox" '+(purShowUndone?'checked':'')+' onchange="purShowUndone=this.checked;render()"> Include undone / cancelled</label><button type="button" class="pri" onclick="purFulfilEdit(\''+kind+'\',\'\')">+ '+(kind==='receipt'?'Receipt':'Request')+'</button>')+'</div>'+(purView==='held'?'<p class="mut pur-held-note">Pace: last 90 days. Order by = runs out − lead time.</p>':'')+purListFilters(infos)+
  '<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th><button type="button" class="sl-settings" data-columns-button aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+cols.map(purListHeader).join('')+'</tr></thead><tbody>'+purPageRows(rows).map(i=>'<tr><td></td>'+cols.map(c=>cell(i,c)).join('')+'</tr>').join('')+(!rows.length?'<tr><td colspan="'+(cols.length+1)+'" class="empty">No records in this view.</td></tr>':'')+'</tbody></table></div>'+purListPager(rows)+salesListMenuHTML(infos)+'</div></div>';
}
/* Held board cells: a bar of what is still at the supplier, coloured by
   when to order, and links to every PO of the row. */
const PUR_HELD_TONE={'Order now':'bad','Order soon':'warn','OK':'ok','No estimate':''};
function purHeldCell(a,c,v){
 const n=c.type==='number'?' class="n"':'';
 if(c.k==='po')return '<td>'+a.pos.map(p=>'<button type="button" class="fin-link" onclick="purOrderEdit('+purArg(p.id)+')">'+esc(p.number)+'</button>').join(' ')+'</td>';
 if(c.k==='remaining')return '<td class="n"><div class="pur-held-bar '+(PUR_HELD_TONE[a.status]||'')+'" title="'+esc(Math.round(a.share*100)+'% left')+'"><i style="width:'+Math.round(a.share*100)+'%"></i></div><b>'+esc(a.remaining)+'</b>'+(a.unknown?' <span class="mut">· review</span>':'')+'</td>';
 if(c.k==='status')return '<td><span class="pill '+(PUR_HELD_TONE[a.status]||'')+'">'+esc(a.status)+'</span></td>';
 if(c.k==='item')return '<td data-raw><b>'+esc(a.item||'—')+'</b>'+(a.code?' <span class="mut mono">'+esc(a.code)+'</span>':'')+'</td>';
 return '<td'+n+'>'+(v==null||v===''?'—':esc(v))+'</td>';
}
function purPOReceivingHTML(p){
 const receipts=(DB.purchaseReceipt||[]).filter(r=>r.poId===p.id),requests=(DB.purchaseDeliveryRequest||[]).filter(r=>r.poId===p.id);
 const link=(kind,d)=>'<button type="button" class="fin-link" onclick="purFulfilEdit('+purArg(kind)+','+purArg(d.id)+')">'+esc(d.number)+' · '+esc(purFulfilStatus(kind,d))+'</button>';
 return '<section class="card pur-card pur-receiving"><div class="pur-section-head"><h3>Deliveries</h3><div><button type="button" onclick="purReceiveFromOrder(\'receipt\')">Receive</button> <button type="button" onclick="purReceiveFromOrder(\'request\')">Request delivery</button></div></div>'+p.lines.map((l,i)=>{const b=purReceived(p,l);return '<p>'+esc('Line '+(i+1)+' · '+l.description+' · purchased '+(b.ordered??'Unknown')+' · received '+b.received+' · '+(l.held?'at supplier ':'outstanding ')+(b.remaining??'Unknown')+' '+l.unit+(b.replaceLeft?' · replacement due '+b.replaceLeft+' '+b.replaceUnit:''))+(b.unknown?' · Review received units':'')+'</p>';}).join('')+'<p>'+receipts.map(r=>link('receipt',r)).join(' · ')+'</p><p>'+requests.map(r=>link('request',r)).join(' · ')+'</p><p class="mut">Deleting this PO keeps its receipts, requests and their history.</p></section>';
}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(to=>tab==='purchasing'&&to!=='purchasing'&&!purFulfilLeave());
