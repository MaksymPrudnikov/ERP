/* =====================================================================
   views/order-log-ui  ·  order-log-ui-1.0
   Окно Activity log поверх списка Sales: когда, кто, что.
   IN : orderLogFor(id) (erp/sales/order-log)
   OUT: окно; открывается правой кнопкой на заказе → Activity log
   ===================================================================== */
let orderLogView=null;
/* Журнал заказа — часть Sales: без права Sales окно не открывается и не
   рисуется, даже если осталось открытым до смены человека. */
function orderLogOpen(id){if(!accessCan('sales')||!(DB.salesOrder||[]).some(o=>o.id===id))return;salesListMenu=null;orderLogView={id};render();}
function orderLogClose(){orderLogView=null;render();}
function orderLogWhen(at){
 const d=new Date(at);if(!at||isNaN(d))return '—';
 return d.toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-CA',{hour:'2-digit',minute:'2-digit',hour12:false});
}
function orderLogDialogHTML(){
 const v=orderLogView;if(!v)return '';
 if(!accessCan('sales')){orderLogView=null;return '';}
 const o=(DB.salesOrder||[]).find(x=>x.id===v.id);if(!o){orderLogView=null;return '';}
 /* Skip отменяется отсюда целиком (erp/shopfloor/skip) — Users и Finance. */
 const undo=r=>{const k=r.id&&typeof skipAllowed==='function'&&skipAllowed()?(DB.skip||[]).find(x=>x.eventId===r.id&&!x.undoneAt):null;const pieces=k?productionUnbatchSkipPieces(k):[];if(pieces.length)return ` <span class="mut" data-skip-unbatched>${pieces.length===k.pieces.length?'Fully':'Partially'} unbatched · ${shippingCount(pieces.length,'glass piece')}</span>`;return k?` <button type="button" class="sm" data-skip-undo="${esc(k.id)}" ${onAct('click',skipUndoClick,String(k.id??''))}>Undo</button>`:'';};
 /* Таблица вида Sales (владелец 07.11.2026): фильтр, сортировка, ширина, порядок; Note — и отдельной колонкой в ⚙. */
 const table=slTable('orderLog',{list:orderLogFor(o.id),cls:'order-log-table',empty:'No entries yet.',noun:l=>l.length+' entries',fill:'what',
  columns:()=>[{k:'when',label:'When',type:'text',w:170,v:r=>r.at||'',cell:r=>esc(orderLogWhen(r.at))},
   {k:'who',label:'Who',type:'list',w:150,v:r=>r.by||'',cell:r=>r.by?raw(r.by):'<span class="mut">—</span>'},
   {k:'what',label:'What',type:'text',v:r=>r.what+(r.note?' · '+r.note:''),cell:r=>`<b>${esc(r.what)}</b>${r.note?` <span class="order-log-note">· ${raw(r.note)}</span>`:''}${undo(r)}`},
   {k:'note',label:'Note',type:'text',def:false,v:r=>r.note||''}],
  row:()=>({attrs:' data-order-log-row'})});
 return `<div class="sales-service-modal-back sales-dialog-back" ${onActSelf('click',orderLogClose)}><div class="sales-service-modal sales-dialog order-log-dialog" role="dialog" aria-modal="true" aria-label="Activity log" data-order-log>
  <div class="sales-service-modal-head"><div><span>Activity log</span><h3 data-raw>${esc([o.businessNumber,salesCustomerDisplay(o.customerId)].filter(Boolean).join(' · '))}</h3></div><button type="button" aria-label="Close" ${onAct('click',orderLogClose)}>×</button></div>
  <div class="sales-dialog-body">${table}</div></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(orderLogDialogHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&orderLogView)orderLogClose();});
