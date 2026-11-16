/* ============================================================================
   Прогресс заказа одним ответом: статус, сколько юнитов отгружено, готово к
   выдаче, в производстве и ещё не начато, где стекло по станциям; и адрес
   #order=<номер>, который открывает заказ (задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md,
   этап 2).
   IN : заказ; shippingSummary (erp/shipping/data), glassBatchRemaining и
        glassCutKeys (erp/production/glass-batches), prodBoard
        (views/production-board), salesStatusLabel (erp/sales/lifecycle),
        archiveIndex (erp/archive), location.hash
   OUT: salesOrderProgress(o); salesOrderHash, salesOrderHashOpen
   Заказчик задания, 15.11.2026: клиент письмом спрашивает статус — «сразу
   видно, сколько из скольки выполнено»; показать «максимально логично, чтобы
   никого не запутать». Поэтому все юниты заказа разложены на четыре кучки,
   которые в сумме всегда дают total: shipped + ready + inProduction +
   notStarted. «Сделано» (done) = shipped + ready.
   Своих подсчётов стекла здесь нет: отгружено и готово — как в Shipping
   (shippingSummary), «не начато» — юниты, чьё стекло ещё не в батче
   (glassBatchRemaining), станции — клетки доски Production (prodBoard).
   Юнит, у которого в батче хотя бы одно стекло, — уже в производстве.
   Отменённые юниты в total не входят; товары склада (extraItems) — отдельно.
   ============================================================================ */
/* Сколько юнитов строки ещё не начато: целые юниты, чьё режущееся стекло не
   в батче. Стекло без резки (COG) батча не ждёт — оно в производстве, как
   только заказ дошёл до цеха. */
function salesProgressNotStarted(o,l,left,active){
 if(left<=0)return 0;
 const keys=glassCutKeys(o,l).size;
 if(!keys)return GLASS_WAITING_STATUSES.includes(o.status)?0:left;
 return Math.min(left,Math.floor(glassBatchRemaining(o,l,active)/keys));
}
function salesProgressStations(o){
 const x=typeof prodBoard==='function'?prodBoard().find(r=>r.o.id===o.id):null;if(!x)return [];
 return (DB.station||[]).filter(s=>x.route[s.code]).map(s=>({code:s.code,waiting:x.route[s.code].w,passed:x.route[s.code].p,total:x.route[s.code].n}));
}
function salesOrderProgress(o){
 if(!o)return null;
 if(salesIsQuote(o)){
  const st=typeof salesListStatus==='function'?salesListStatus(o):o.status;
  return {kind:'quote',status:salesStatusLabel(o,st),statusKey:st,sentAt:o.sentAt||'',validUntil:st==='won'?'':salesQuoteValidUntil(o),wonOrderId:o.wonOrderId||'',
   units:{total:(o.lines||[]).reduce((n,l)=>n+salesPositiveInt(l.qty,1),0)}};
 }
 const s=shippingSummary(o),live=!['cancelled','closed','done'].includes(o.status),active=live?glassBatchActive(o.id):null;
 const u={total:0,shipped:0,ready:0,inProduction:0,notStarted:0};
 s.lines.forEach(r=>{
  const ready=Math.min(r.physicalReady,Math.max(0,r.ordered-r.shipped)),left=r.ordered-r.shipped-ready,none=live?salesProgressNotStarted(o,r.l,left,active):left;
  u.total+=r.ordered;u.shipped+=r.shipped;u.ready+=ready;u.notStarted+=none;u.inProduction+=left-none;
 });
 u.done=u.shipped+u.ready;
 const extras=s.extras.length?{ordered:s.extras.reduce((n,x)=>n+x.ordered,0),shipped:s.extras.reduce((n,x)=>n+x.shipped,0)}:null;
 return {kind:'order',status:salesStatusLabel(o),statusKey:o.status,onHold:!!o.onHold,holdReason:o.onHold?o.holdReason||'':'',due:o.dueDate||'',units:u,extras,
  /* Станции — пока стекло в цеху: у готового и отгруженного заказа спрашивать «где стекло» незачем. */
  stations:live&&u.inProduction>0?salesProgressStations(o):[]};
}

/* ------------------------ Адрес #order=<номер> ------------------------- */
/* …/GLASS_ERP.html#order=76012 открывает заказ или квоту по номеру: ссылка из
   панели Gmail и из любого письма или заметки. Адрес снимается, как только
   заказ открыт, — F5 не открывает его второй раз. Никто не вошёл — адрес
   ждёт входа (erp/signin зовёт salesOrderHashOpen). */
function salesOrderHash(){const m=/^#order=([A-Za-z0-9-]{1,40})$/.exec(location.hash||'');return m?m[1]:'';}
function salesOrderHashOpen(){
 const no=salesOrderHash();if(!no)return false;
 /* Вход включён, а человека ещё нет (экран входа, проверка сеанса) — ждём. */
 if(!window.GF_NO_SIGNIN&&typeof signinOn==='function'&&signinOn()&&!signinUser())return false;
 history.replaceState(null,'',location.href.split('#')[0]);
 if(!accessCan('sales'))return false;
 const key=no.toLowerCase(),o=(DB.salesOrder||[]).find(x=>String(x.businessNumber||'').toLowerCase()===key);
 tab='sales';subtab='orders';
 if(o){salesLeaveDraft(()=>salesOrderEdit(o.id));return true;}
 let cold='';if(typeof archiveIndex!=='undefined')archiveIndex.forEach((a,id)=>{if(!cold&&String(a.number||'').toLowerCase()===key)cold=id;});
 if(cold){salesLeaveDraft(()=>archiveOpen(cold));return true;}
 render();alert('Order '+no+' was not found.');return false;
}
if(typeof window!=='undefined'){
 window.addEventListener('hashchange',salesOrderHashOpen);
 window.addEventListener('load',()=>{if(window.storageReady)window.storageReady.then(salesOrderHashOpen);});
}
