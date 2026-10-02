/* =====================================================================
   views/order-log-ui  ·  order-log-ui-1.0
   Окно Activity log поверх списка Sales: когда, кто, что.
   IN : orderLogFor(id) (erp/sales/order-log)
   OUT: окно; открывается правой кнопкой на заказе → Activity log
   ===================================================================== */
let orderLogView=null;
function orderLogOpen(id){if(!(DB.salesOrder||[]).some(o=>o.id===id))return;salesListMenu=null;orderLogView={id};render();}
function orderLogClose(){orderLogView=null;render();}
function orderLogWhen(at){
 const d=new Date(at);if(!at||isNaN(d))return '—';
 return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function orderLogDialogHTML(){
 const v=orderLogView;if(!v)return '';
 const o=(DB.salesOrder||[]).find(x=>x.id===v.id);if(!o){orderLogView=null;return '';}
 const rows=orderLogFor(o.id).map(r=>`<tr data-order-log-row><td>${esc(orderLogWhen(r.at))}</td><td>${r.by?raw(r.by):'<span class="mut">—</span>'}</td><td><b>${esc(r.what)}</b>${r.note?` <span class="order-log-note">· ${raw(r.note)}</span>`:''}</td></tr>`).join('');
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)orderLogClose()"><div class="sales-service-modal sales-dialog order-log-dialog" role="dialog" aria-modal="true" aria-label="Activity log" data-order-log>
  <div class="sales-service-modal-head"><div><span>Activity log</span><h3 data-raw>${esc([o.businessNumber,salesCustomerDisplay(o.customerId)].filter(Boolean).join(' · '))}</h3></div><button type="button" aria-label="Close" onclick="orderLogClose()">×</button></div>
  <div class="sales-dialog-body"><table class="order-log-table"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(orderLogDialogHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&orderLogView)orderLogClose();});
