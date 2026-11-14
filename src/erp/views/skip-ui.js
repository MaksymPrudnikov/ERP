/* =====================================================================
   view/skip · skip-ui-1.0
   Окно Skip поверх Sales: правая кнопка на заказе → Skip… Что провести
   (строки с количеством, весь заказ, Glass ID / U-, товар со склада), куда
   (Picked up, Delivered или любая станция), день, кто получил, причина.
   Delivery использует адрес клиента или введённый адрес. Undo — в Activity log.
   Видят только Users и Finance (erp/shopfloor/skip, skipAllowed).
   IN : skipRun, skipLineLeft (erp/shopfloor/skip), DB.station
   OUT: окно Skip (skipOpen, skipUndoClick)
   ===================================================================== */
let skipDialog=null;
function skipOpen(orderId){
 const o=salesRecord(orderId);salesListMenu=null;
 if(!skipAllowed()||!skipCanOpen(o)){render();return false;}
 skipDialog={orderId:o.id,lines:{},extras:{},all:false,codes:'',to:SKIP_PICKUP,date:finToday(),reason:'',receivedBy:'',shipTo:shippingDefaultAddress(salesFindCustomer(o.customerId)),error:'',left:null};
 render();return true;
}
function skipClose(){skipDialog=null;render();}
function skipSet(key,value,redraw){if(!skipDialog)return;skipDialog[key]=value;skipDialog.error='';if(redraw)render();}
function skipSetLine(lineId,value){if(!skipDialog)return;skipDialog.lines[lineId]=value;skipDialog.all=false;skipDialog.error='';}
function skipSetExtra(extraId,value){if(!skipDialog)return;skipDialog.extras[extraId]=value;skipDialog.all=false;skipDialog.error='';}
/* Весь заказ: все строки целиком и весь товар со склада. */
function skipSetShipTo(v){skipDialog.shipTo=shippingAddress({address1:v});}
function skipSetAll(on){
 const d=skipDialog,o=d&&salesRecord(d.orderId);if(!o)return;d.all=!!on;d.error='';
 (o.lines||[]).forEach(l=>{d.lines[l.id]=on?'all':'';});
 (o.extraItems||[]).forEach(x=>{d.extras[x.id]=on?String(skipExtraLeft(o,x)):'';});
 render();
}
function skipExtraLeft(o,x){return Math.max(0,x.qty-shippingForOrder(o.id).filter(shippingActive).flatMap(s=>s.extras).filter(i=>i.extraId===x.id).reduce((n,i)=>n+i.qty,0));}
function skipConfirm(reserved){
 const d=skipDialog;if(!d)return false;
 /* Номера сканов — с сервера заранее: на заказ в тысячи стёкол блока не хватает. */
 const need={scan:glassPieceTotal(d.orderId)*6};
 if(!reserved&&typeof cloudNumbersShort==='function'&&cloudNumbersShort(need)){cloudNumbersReserve(need).catch(e=>console.warn('Numbers were not reserved:',e.message)).then(()=>skipConfirm(true));return true;}
 const o=salesRecord(d.orderId),clean=!!o&&!!soDraft&&soDraft.id===o.id&&JSON.stringify(o)===JSON.stringify(normalizeSalesOrder(soDraft));
 const lines={};Object.keys(d.lines).forEach(id=>{const v=String(d.lines[id]).trim();if(v)lines[id]=v==='all'?'all':Number(v);});
 const extras={};Object.keys(d.extras).forEach(id=>{const v=Number(d.extras[id]);if(v>0)extras[id]=v;});
 const res=skipRun({orderId:d.orderId,lines,extras,codes:String(d.codes||'').split(/[\s,;]+/).filter(Boolean),to:d.to,date:d.date,reason:d.reason,receivedBy:d.receivedBy,shipTo:d.shipTo});
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
 const pickup=d.to===SKIP_PICKUP,delivered=d.to===SKIP_DELIVERED,dispatch=pickup||delivered||d.to===shippingStations().ship,delivery=delivered||d.to===shippingStations().ship&&o.delivery==='delivery';
 const rows=(o.lines||[]).map((l,i)=>{const v=d.lines[l.id]==null?'':d.lines[l.id],left=d.left[l.id]||0;
  return `<tr data-skip-line="${esc(l.id)}" class="${v?'on':''}"><td>Line ${i+1}${l.mark?' · '+esc(l.mark):''}</td><td class="nowrap">${esc(dimIn16(l.width16/16))} × ${esc(dimIn16(l.height16/16))}</td><td>${esc(glassCodes(l))}</td><td class="n">${l.qty}</td><td class="n">${left}</td>
   <td><input type="number" min="0" max="${left}" step="1" inputmode="numeric" data-skip-qty value="${v==='all'?left:esc(v)}" ${left?'':'disabled'} aria-label="Line ${i+1} units" ${onAct('input',skipSetLine,String(l.id??''),EL_VALUE)}></td></tr>`;}).join('');
 const extras=(o.extraItems||[]).map(x=>{const left=skipExtraLeft(o,x),v=d.extras[x.id]||'';
  return `<tr data-skip-extra="${esc(x.id)}"><td colspan="3">${esc(salesExtraItemName(x))}</td><td class="n">${x.qty}</td><td class="n">${left}</td><td><input type="number" min="0" max="${left}" step="1" inputmode="numeric" data-skip-extra-qty value="${esc(v)}" ${left&&dispatch?'':'disabled'} aria-label="Stock item units" ${onAct('input',skipSetExtra,String(x.id??''),EL_VALUE)}></td></tr>`;}).join('');
 const stations=DB.station||[];
 return `<div class="sales-service-modal-back sales-dialog-back" ${onActSelf('click',skipClose)}><div class="sales-service-modal sales-dialog ncr-modal skip-dialog" role="dialog" aria-modal="true" aria-label="Skip" data-skip-dialog>
  <div class="sales-service-modal-head"><h3>Skip · Order ${esc(o.businessNumber)}</h3><button type="button" aria-label="Close" ${onAct('click',skipClose)}>×</button></div>
  <div class="sales-dialog-body ncr-form">
   <p class="mut">${esc([salesCustomerDisplay(o.customerId),o.customerPo,salesStatusLabel(o)].filter(Boolean).join(' · '))}</p>
   <label class="skip-all"><input type="checkbox" data-skip-all ${d.all?'checked':''} ${onAct('change',skipSetAll,EL_CHECKED)}> Whole order</label>
   <div class="ncr-lines-wrap">${slFromTable('skipLines',`<table class="ncr-lines"><thead><tr><th>Line</th><th>Size</th><th>Glass</th><th class="n">Qty</th><th class="n">Left</th><th>Skip</th></tr></thead><tbody>${rows}${extras}</tbody></table>`)}</div>
   <label><span class="ncr-label">GLASS ID OR UNIT</span><input type="text" data-skip-codes value="${esc(d.codes)}" placeholder="Scan G- or U-" ${onAct('input',skipSet,'codes',EL_VALUE)}></label>
   <div class="ncr-pick">
    <label><span class="ncr-label">TO</span><select data-skip-to ${onAct('change',skipSet,'to',EL_VALUE,true)}><option value="${SKIP_PICKUP}" ${pickup?'selected':''}>Picked up</option><option value="${SKIP_DELIVERED}" ${delivered?'selected':''}>Delivered</option>${stations.map(s=>`<option value="${esc(s.code)}" ${d.to===s.code?'selected':''}>${s.code===shippingStations().ship?'Shipped · ':''}${esc(s.code)} done</option>`).join('')}</select></label>
    <label><span class="ncr-label">DATE</span><input type="date" data-skip-date max="${esc(finToday())}" value="${esc(d.date)}" ${onAct('change',skipSet,'date',EL_VALUE)}></label>
    <label><span class="ncr-label">${delivered?'RECEIVED BY':'PICKED UP BY'}</span><input type="text" data-skip-by value="${esc(d.receivedBy)}" maxlength="100" ${pickup||delivered?'':'disabled'} ${onAct('input',skipSet,'receivedBy',EL_VALUE)}></label>
   </div>
   ${delivery?`<label><span class="ncr-label">DELIVERY ADDRESS</span><input type="text" data-skip-address value="${esc(docAddressText(d.shipTo))}" ${onAct('input',skipSetShipTo,EL_VALUE)}></label>`:''}
   <label><span class="ncr-label">REASON</span><input type="text" data-skip-reason value="${esc(d.reason)}" maxlength="200" placeholder="${delivered?'Delivered Saturday':pickup?'Picked up Saturday':'Optional'}" ${onAct('input',skipSet,'reason',EL_VALUE)}></label>
   ${d.error?`<div class="ncr-error" role="alert" data-skip-error>${esc(d.error)}</div>`:''}
  </div>
  <div class="sales-dialog-actions"><button type="button" ${onAct('click',skipClose)}>Back</button><button type="button" class="pri" data-skip-run ${onAct('click',skipConfirm)}>Skip</button></div></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(skipDialogHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&skipDialog)skipClose();});
