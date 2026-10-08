/* =====================================================================
   view/skip · skip-ui-1.0
   Окно Skip поверх Sales: правая кнопка на заказе → Skip… Что провести
   (строки с количеством, весь заказ, Glass ID / U-, товар со склада), куда
   (Picked up или станция), день, кто забрал, причина. Undo — в Activity log.
   Видят только Users и Finance (erp/shopfloor/skip, skipAllowed).
   IN : skipRun, skipLineLeft; OUT: окно
   ===================================================================== */
let skipDialog=null;
function skipOpen(orderId){
 const o=salesRecord(orderId);salesListMenu=null;
 if(!skipAllowed()||!skipCanOpen(o)){render();return false;}
 skipDialog={orderId:o.id,lines:{},extras:{},all:false,codes:'',to:SKIP_PICKUP,date:finToday(),reason:'',receivedBy:'',error:'',left:null};
 render();return true;
}
function skipClose(){skipDialog=null;render();}
function skipSet(key,value,redraw){if(!skipDialog)return;skipDialog[key]=value;skipDialog.error='';if(redraw)render();}
function skipSetLine(lineId,value){if(!skipDialog)return;skipDialog.lines[lineId]=value;skipDialog.all=false;skipDialog.error='';}
function skipSetExtra(extraId,value){if(!skipDialog)return;skipDialog.extras[extraId]=value;skipDialog.all=false;skipDialog.error='';}
/* Весь заказ: все строки целиком и весь товар со склада. */
function skipSetAll(on){
 const d=skipDialog,o=d&&salesRecord(d.orderId);if(!o)return;d.all=!!on;d.error='';
 (o.lines||[]).forEach(l=>{d.lines[l.id]=on?'all':'';});
 (o.extraItems||[]).forEach(x=>{d.extras[x.id]=on?String(skipExtraLeft(o,x)):'';});
 render();
}
function skipExtraLeft(o,x){return Math.max(0,x.qty-shippingForOrder(o.id).filter(shippingActive).flatMap(s=>s.extras).filter(i=>i.extraId===x.id).reduce((n,i)=>n+i.qty,0));}
function skipConfirm(){
 const d=skipDialog;if(!d)return false;
 const o=salesRecord(d.orderId),clean=!!o&&!!soDraft&&soDraft.id===o.id&&JSON.stringify(o)===JSON.stringify(normalizeSalesOrder(soDraft));
 const lines={};Object.keys(d.lines).forEach(id=>{const v=String(d.lines[id]).trim();if(v)lines[id]=v==='all'?'all':Number(v);});
 const extras={};Object.keys(d.extras).forEach(id=>{const v=Number(d.extras[id]);if(v>0)extras[id]=v;});
 const res=skipRun({orderId:d.orderId,lines,extras,codes:String(d.codes||'').split(/[\s,;]+/).filter(Boolean),to:d.to,date:d.date,reason:d.reason,receivedBy:d.receivedBy});
 if(res.error){d.error=res.error;render();return false;}
 skipDialog=null;
 /* Открытый и не правленный заказ перечитывается: Skip поменял его в базе. */
 if(clean)salesOrderEdit(o.id);else render();
 return true;
}
function skipUndoClick(id){
 const k=skipFind(id);if(!k)return false;
 if(!confirm('Undo this skip? Its station marks'+(k.shipments.length?' and packing slip':'')+' will be removed.'))return false;
 const res=skipUndo(id);if(res.error){alert(res.error);return false;}
 render();return true;
}
function skipDialogHTML(){
 const d=skipDialog;if(!d)return '';
 const o=salesRecord(d.orderId);if(!o||!skipAllowed()||!skipCanOpen(o)){skipDialog=null;return '';}
 if(!d.left)d.left=Object.fromEntries((o.lines||[]).map(l=>[l.id,skipLineLeft(o,l)]));
 const glassCodes=l=>{const m=salesMakeupById(o,l.makeupId);return m?(m.panes||[]).map(ncrPaneCode).join(' / '):'—';};
 const pickup=d.to===SKIP_PICKUP;
 const rows=(o.lines||[]).map((l,i)=>{const v=d.lines[l.id]==null?'':d.lines[l.id],left=d.left[l.id]||0;
  return `<tr data-skip-line="${esc(l.id)}" class="${v?'on':''}"><td>Line ${i+1}${l.mark?' · '+esc(l.mark):''}</td><td class="nowrap">${esc(dimIn16(l.width16/16))} × ${esc(dimIn16(l.height16/16))}</td><td>${esc(glassCodes(l))}</td><td class="n">${l.qty}</td><td class="n">${left}</td>
   <td><input type="number" min="0" max="${left}" step="1" data-skip-qty value="${v==='all'?left:esc(v)}" ${left?'':'disabled'} aria-label="Line ${i+1} units" oninput="skipSetLine('${esc(l.id)}',this.value)"></td></tr>`;}).join('');
 const extras=(o.extraItems||[]).map(x=>{const left=skipExtraLeft(o,x),v=d.extras[x.id]||'';
  return `<tr data-skip-extra="${esc(x.id)}"><td colspan="3">${esc(salesExtraItemName(x))}</td><td class="n">${x.qty}</td><td class="n">${left}</td><td><input type="number" min="0" max="${left}" step="1" data-skip-extra-qty value="${esc(v)}" ${left&&pickup?'':'disabled'} aria-label="Stock item units" oninput="skipSetExtra('${esc(x.id)}',this.value)"></td></tr>`;}).join('');
 const stations=(DB.station||[]).filter(s=>s.code!==shippingStations().ship);
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)skipClose()"><div class="sales-service-modal sales-dialog ncr-modal skip-dialog" role="dialog" aria-modal="true" aria-label="Skip" data-skip-dialog>
  <div class="sales-service-modal-head"><h3>Skip · Order ${esc(o.businessNumber)}</h3><button type="button" aria-label="Close" onclick="skipClose()">×</button></div>
  <div class="sales-dialog-body ncr-form">
   <p class="mut">${esc([salesCustomerDisplay(o.customerId),o.customerPo,salesStatusLabel(o)].filter(Boolean).join(' · '))}</p>
   <label class="skip-all"><input type="checkbox" data-skip-all ${d.all?'checked':''} onchange="skipSetAll(this.checked)"> Whole order</label>
   <div class="ncr-lines-wrap"><table class="ncr-lines"><thead><tr><th>Line</th><th>Size</th><th>Glass</th><th class="n">Qty</th><th class="n">Left</th><th>Skip</th></tr></thead><tbody>${rows}${extras}</tbody></table></div>
   <label><span class="ncr-label">GLASS ID OR UNIT</span><input type="text" data-skip-codes value="${esc(d.codes)}" placeholder="Scan G- or U-" oninput="skipSet('codes',this.value)"></label>
   <div class="ncr-pick">
    <label><span class="ncr-label">TO</span><select data-skip-to onchange="skipSet('to',this.value,true)"><option value="${SKIP_PICKUP}" ${pickup?'selected':''}>Picked up</option>${stations.map(s=>`<option value="${esc(s.code)}" ${d.to===s.code?'selected':''}>${esc(s.code)} done</option>`).join('')}</select></label>
    <label><span class="ncr-label">DATE</span><input type="date" data-skip-date max="${esc(finToday())}" value="${esc(d.date)}" onchange="skipSet('date',this.value)"></label>
    <label><span class="ncr-label">PICKED UP BY</span><input type="text" data-skip-by value="${esc(d.receivedBy)}" maxlength="100" ${pickup?'':'disabled'} oninput="skipSet('receivedBy',this.value)"></label>
   </div>
   <label><span class="ncr-label">REASON</span><input type="text" data-skip-reason value="${esc(d.reason)}" maxlength="200" placeholder="Picked up Saturday" oninput="skipSet('reason',this.value)"></label>
   ${d.error?`<div class="ncr-error" role="alert" data-skip-error>${esc(d.error)}</div>`:''}
  </div>
  <div class="sales-dialog-actions"><button type="button" onclick="skipClose()">Back</button><button type="button" class="pri" data-skip-run onclick="skipConfirm()">Skip</button></div></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(skipDialogHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&skipDialog)skipClose();});
