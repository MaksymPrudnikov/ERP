/* Receiving is entered by office / optimization staff from the shop's
   count sheet. All values remain editable; warnings never prevent Save.
   Each receipt line may carry its own size and actual sheet count. */
let purFulfilDraft=null,purFulfilOriginal='',purFulfilPreview=false,purShowUndone=false;
function purFulfilLeave(){
 if(purFulfilDraft&&JSON.stringify(purFulfilDraft)!==purFulfilOriginal&&!confirm('Discard unsaved delivery changes?'))return false;
 purFulfilDraft=null;purFulfilPreview=false;return true;
}
function purFulfilEdit(kind,id,poId,requestId){
 if(!accessCan('purchasing')||!purFulfilLeave()||!purOrderLeave())return;
 const d=id?purFulfilFind(kind,id):purFulfilFromPO(kind,poId||'',requestId);if(!d)return;
 purSupplierDraft=null;purView=kind==='receipt'?'receipts':'requests';purFulfilDraft={kind,data:purClone(d)};purFulfilOriginal=JSON.stringify(purFulfilDraft);purNotice='';render();
}
function purReceiveFromOrder(kind){if(!purOrderSaveForm(true))return;const id=purOrderDraft.id;purFulfilEdit(kind,'',id);}
function purFulfilSaveForm(){
 const f=purFulfilDraft,r=purFulfilSave(f.kind,f.data);if(!r.ok){purNotice=r.error;render();return false;}
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
function purFulfilInput(l,i,k,label,type){
 return '<div><label for="pur_receive_'+i+'_'+k+'">'+label+'</label><input id="pur_receive_'+i+'_'+k+'" value="'+esc(l[k]??'')+'" '+(type==='number'?'type="number" min="0" step="any"':'type="text"')+(k==='reason'||k==='resolution'?' list="pur_'+k+'"':'')+' oninput="purFulfilDraft.data.lines['+i+'].'+k+'=this.value;purFulfilRefresh()"></div>';
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
 if(pl){['description','unit','widthIn','heightIn'].forEach(k=>{if(l[k]==null||l[k]==='')l[k]=pl[k];});}render();
}
function purFulfilLineHTML(l,i){
 const f=purFulfilDraft,p=purOrderFind(f.data.poId),receipt=f.kind==='receipt',request=receipt&&purFulfilFind('request',f.data.requestId);
 return '<section class="card pur-card"><div class="pur-section-head"><h3>Line '+(i+1)+'</h3><button type="button" onclick="purFulfilDraft.data.lines.splice('+i+',1);render()">Remove</button></div>'+
  (p?'<label for="pur_receipt_link_'+i+'">PO line</label><select id="pur_receipt_link_'+i+'" onchange="purFulfilLinkLine('+i+',this.value)"><option value="">Unplanned / other item</option>'+p.lines.map((pl,j)=>'<option value="'+esc(pl.id)+'" '+(pl.id===l.poLineId?'selected':'')+'>'+esc((j+1)+'. '+pl.description)+'</option>').join('')+(l.poLineId&&!p.lines.some(pl=>pl.id===l.poLineId)?'<option selected value="'+esc(l.poLineId)+'">Removed PO line</option>':'')+'</select>':'')+
  (request?'<label for="pur_request_line_'+i+'">Request line</label><select id="pur_request_line_'+i+'" onchange="purFulfilDraft.data.lines['+i+'].requestLineId=this.value;purFulfilRefresh()"><option value="">Outside this request</option>'+request.lines.map((rl,j)=>'<option value="'+esc(rl.id)+'" '+(rl.id===l.requestLineId?'selected':'')+'>'+esc((j+1)+'. '+rl.description)+'</option>').join('')+'</select>':'')+
  '<div class="pur-line-fields pur-receiving-row">'+purFulfilInput(l,i,'description','Description')+purFulfilInput(l,i,'qty',receipt?'Quantity received':'Quantity requested','number')+purFulfilInput(l,i,'unit','Unit')+purFulfilInput(l,i,'widthIn',receipt?'Actual width, in':'Width, in','number')+purFulfilInput(l,i,'heightIn',receipt?'Actual height, in':'Height, in','number')+'</div>'+
  (receipt?'<div class="pur-line-fields">'+purFulfilInput(l,i,'actualSheets','Actual sheets','number')+purFulfilInput(l,i,'damaged','Damaged · same unit','number')+purFulfilInput(l,i,'damagedSheets','Damaged sheets','number')+purFulfilInput(l,i,'reason','Damage reason')+purFulfilInput(l,i,'resolution','Resolution')+'</div>':'')+
  purFulfilInput(l,i,'note','Line note')+'</section>';
}
function purFulfilForm(){
 const f=purFulfilDraft,d=f.data,receipt=f.kind==='receipt',p=purOrderFind(d.poId),requests=(DB.purchaseDeliveryRequest||[]).filter(r=>r.poId===d.poId);
 return '<div class="purchasing-workspace"><div class="sales-toolbar pur-toolbar"><button type="button" onclick="if(purFulfilLeave())render()">← '+(receipt?'Receipts':'Delivery requests')+'</button><h2>'+esc(d.number||'New '+(receipt?'receipt':'delivery request'))+'</h2><span class="pill">'+purFulfilStatus(f.kind,d)+'</span><span class="sales-toolbar-sp"></span>'+
  (d.voidAt?'<button type="button" onclick="purFulfilUndoForm(true)">Restore</button>':'<button type="button" class="pri" data-pur-delivery-save onclick="purFulfilSaveForm()">Save</button>'+(receipt?'':'<button type="button" onclick="purRequestPreviewOpen()">Preview / PDF / Email</button>')+(d.id?'<button type="button" onclick="purFulfilUndoForm(false)">'+(receipt?'Undo receipt':'Cancel request')+'</button>':''))+'</div>'+
  (purNotice?'<div role="status" class="pur-notice">'+esc(purNotice)+'</div>':'')+'<div class="pur-notice" data-pur-delivery-warnings>'+purFulfilWarnings(f.kind,d).map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>'+
  '<fieldset class="pur-po-edit form" '+(d.voidAt?'disabled':'')+'><section class="card pur-card"><div class="pur-fields"><div><label for="pur_delivery_po">Purchase order · optional</label><select id="pur_delivery_po" onchange="purFulfilSelectPO(this.value)"><option value="">Without PO</option>'+(DB.purchaseOrder||[]).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.poId?'selected':'')+'>'+esc(x.number+' · '+x.supplierName+' · '+purOrderStatus(x))+'</option>').join('')+(d.poId&&!p?'<option selected value="'+esc(d.poId)+'">Missing PO</option>':'')+'</select></div>'+
  purFulfilField('supplierName','Supplier / shop name')+purFulfilField('date',receipt?'Received date':'Request date','date')+
  (receipt?purFulfilField('receivedBy','Received by')+purFulfilField('packingSlip','Supplier packing slip')+'<div><label for="pur_delivery_request">Delivery request · optional</label><select id="pur_delivery_request" onchange="purFulfilDraft.data.requestId=this.value;purFulfilDraft.data.lines.forEach(l=>l.requestLineId=\'\');render()"><option value="">Without request</option>'+requests.map(r=>'<option value="'+esc(r.id)+'" '+(r.id===d.requestId?'selected':'')+'>'+esc(r.number+' · '+purFulfilStatus('request',r))+'</option>').join('')+'</select>'+(d.requestId?'<button type="button" onclick="purFulfilLoadRequest()">Load request lines</button>':'')+'</div>':purFulfilField('expectedDate','Requested delivery','date')+purFulfilField('to','Email to')+purFulfilField('cc','CC'))+'</div><p class="mut">'+(receipt?'Received quantities include damaged goods. Actual sheets are recorded separately from blocks.':'Request any quantity. Only actual receipts reduce the held balance.')+'</p><label for="pur_delivery_note">Notes</label><textarea id="pur_delivery_note" oninput="purFulfilDraft.data.note=this.value">'+esc(d.note)+'</textarea></section>'+
  '<div class="pur-line-actions"><button type="button" onclick="purFulfilDraft.data.lines.push(purFulfilLine({id:salesUid(\'RL\')},0));render()">+ Line</button>'+(p?'<button type="button" onclick="purFulfilLoadPO()">Load PO lines</button>':'')+'</div>'+d.lines.map(purFulfilLineHTML).join('')+
  '<datalist id="pur_reason"><option>In transit</option><option>Factory defect</option><option>Our breakage</option><option>Other</option></datalist><datalist id="pur_resolution"><option>Credit requested</option><option>Replacement</option><option>Written off</option><option>Other</option></datalist></fieldset>'+
  (d.id?purHistoryHTML(f.kind,d.id):'')+(purFulfilPreview?purRequestPreviewHTML():'')+'</div>';
}
function purFulfilLoadRequest(){
 const f=purFulfilDraft;if(!confirm('Replace these draft lines with the selected delivery request?'))return;
 f.data.lines=purFulfilFromPO('receipt',f.data.poId,f.data.requestId).lines;render();
}
function purReceivingColumns(){
 const waiting=['backorders','held'].includes(purView),cols=waiting?
  [['number','PO','text'],['supplierName','Supplier','text'],['description','Description','text'],['size','Sheet size, in','text'],['ordered','Purchased','number'],['received','Received','number'],['remaining',purView==='held'?'At supplier':'Outstanding','number'],['unit','Unit','list'],['expectedDate','Expected','date'],['review','Review','text']]:
  [['number',purView==='receipts'?'Receipt':'Request','text'],['po','PO','text'],['supplierName','Supplier','text'],['date','Date','date'],['expectedDate','Requested delivery','date'],['packingSlip','Packing slip','text'],['receivedBy','Received by','text'],['status','Status','list'],['createdBy','Recorded by','text']];
 return cols.map(([k,label,type])=>({k,label,type,def:true}));
}
function purReceivingInfos(){
 if(['backorders','held'].includes(purView))return purWaitingRows(purView==='held').map(({p,l,b})=>({o:{id:p.id+'|'+l.id},p,l,memo:{number:p.number,supplierName:p.supplierName,description:l.description,size:l.widthIn&&l.heightIn?l.widthIn+' × '+l.heightIn:'',ordered:b.ordered,received:b.received,remaining:b.remaining,unit:l.unit,expectedDate:l.expectedDate||p.expectedDate,review:b.unknown?'Unknown quantity / unit changed':''}}));
 const kind=purView==='receipts'?'receipt':'request';return (DB[PUR_FULFIL[kind].key]||[]).filter(d=>purShowUndone||!d.voidAt).map(d=>({o:{id:d.id},d,kind,memo:Object.assign({},d,{po:(purOrderFind(d.poId)||{}).number||'',status:purFulfilStatus(kind,d)})}));
}
function purReceivingList(){
 const infos=purReceivingInfos(),rows=salesListRows(infos),cols=salesListColumns(),kind=purView==='receipts'?'receipt':'request',waiting=['backorders','held'].includes(purView),title=({receipts:'Receipts',requests:'Delivery requests',backorders:'Waiting from suppliers',held:'Held at supplier'})[purView];
 const cell=(i,c)=>{const v=salesListValue(i,c.k);return '<td'+(c.type==='number'?' class="n"':'')+'>'+(c.k==='number'?'<button type="button" class="fin-link" onclick="'+(i.p?'purOrderEdit('+purArg(i.p.id)+')':'purFulfilEdit('+purArg(i.kind)+','+purArg(i.d.id)+')')+'">'+esc(v)+'</button>':v==null||v===''?'—':esc(v))+'</td>';};
 return '<div class="purchasing-workspace">'+purNav()+'<div class="sales-toolbar pur-toolbar"><h2>'+title+'</h2><span class="sales-toolbar-sp"></span>'+(waiting?'':'<label><input type="checkbox" '+(purShowUndone?'checked':'')+' onchange="purShowUndone=this.checked;render()"> Include undone / cancelled</label><button type="button" class="pri" onclick="purFulfilEdit(\''+kind+'\',\'\')">+ '+(kind==='receipt'?'Receipt':'Request')+'</button>')+'</div>'+salesListFilterChips()+
  '<div class="card sales-list-card"><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th><button type="button" aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+cols.map(purListHeader).join('')+'</tr></thead><tbody>'+rows.map(i=>'<tr><td></td>'+cols.map(c=>cell(i,c)).join('')+'</tr>').join('')+(!rows.length?'<tr><td colspan="'+(cols.length+1)+'" class="empty">No records in this view.</td></tr>':'')+'</tbody></table></div></div>'+salesListMenuHTML(infos)+'</div>';
}
function purPOReceivingHTML(p){
 const receipts=(DB.purchaseReceipt||[]).filter(r=>r.poId===p.id),requests=(DB.purchaseDeliveryRequest||[]).filter(r=>r.poId===p.id);
 const link=(kind,d)=>'<button type="button" class="fin-link" onclick="purFulfilEdit('+purArg(kind)+','+purArg(d.id)+')">'+esc(d.number)+' · '+esc(purFulfilStatus(kind,d))+'</button>';
 return '<section class="card pur-card pur-receiving"><div class="pur-section-head"><h3>Deliveries</h3><div><button type="button" onclick="purReceiveFromOrder(\'receipt\')">Receive</button> <button type="button" onclick="purReceiveFromOrder(\'request\')">Request delivery</button></div></div>'+p.lines.map((l,i)=>{const b=purReceived(p,l);return '<p>'+esc('Line '+(i+1)+' · '+l.description+' · purchased '+(b.ordered??'Unknown')+' · received '+b.received+' · '+(l.held?'at supplier ':'outstanding ')+(b.remaining??'Unknown')+' '+l.unit)+(b.unknown?' · Review received units':'')+'</p>';}).join('')+'<p>'+receipts.map(r=>link('receipt',r)).join(' · ')+'</p><p>'+requests.map(r=>link('request',r)).join(' · ')+'</p><p class="mut">Deleting this PO keeps its receipts, requests and their history.</p></section>';
}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(to=>tab==='purchasing'&&to!=='purchasing'&&!purFulfilLeave());
