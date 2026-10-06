/* =====================================================================
   erp/views/station-shipping  ·  Shipping PR 2, 6 октября 2026
   Две последние станции маршрута на экране станции.
   Станция готовности (SHIPR): на карточке стекла — очередь клиента и
   сколько юнитов заказа уже готово; чужое стекло на скиде — цвет и звук,
   скан пишется (владелец: «работа не стоит»); карточка скида — клиент и
   «76015: 20 / 20 ready».
   Станция отгрузки (SHIP): скан скида грузит рейс — правила и запись в
   erp/shipping/loading. Первый скид открывает рейс; рейс этой станции
   живёт в её входе, как и долли, на которую кладут.
   Коды станций не зашиты: shippingStations().
   ===================================================================== */
function stationIsShip(){return !!stationCode&&stationCode===shippingStations().ship;}
function stationIsReady(){return !!stationCode&&stationCode===shippingStations().ready;}

/* ------------------------------ SHIPR ------------------------------- */
function stationReadyForeign(g,rec){
 if(!stationIsReady()||!g||!rec||!/^S[LA]-/.test(rec.on||''))return null;
 const others=[...new Set((carrierContents().get(rec.on)||[]).filter(x=>x.g.o.customerId!==g.o.customerId).map(x=>salesCustomerDisplay(x.g.o.customerId)))];
 return others.length?{skid:rec.on,customers:others}:null;
}
function stationForeignBar(L){return L.foreign?'<div class="st-urg" data-station-foreign>OTHER CUSTOMER ON '+esc(L.foreign.skid)+'<span data-raw>· '+esc(L.foreign.customers.join(', '))+'</span></div>':'';}
function stationQueueBar(g){
 const q=g&&stationIsReady()?shippingQueueOf(g.l):0;
 return q?'<div class="st-queue" data-station-queue>QUEUE '+q+'<span data-raw>· '+esc(salesCustomerDisplay(g.o.customerId))+'</span></div>':'';
}
/* Готово из того, что заказу осталось отгрузить. */
function stationReadyCount(o){const q=shippingSummary(o),sent=q.lines.reduce((n,r)=>n+r.shipped,0);return {ready:q.physicalReady,of:Math.max(0,q.glass-sent)};}
function stationReadyKv(g){
 if(!g||!stationIsReady())return '';
 const r=stationReadyCount(g.o);return '<span class="k">Ready</span><span data-station-ready-count><b>'+r.ready+' / '+r.of+'</b> units</span>';
}
function stationSkidSummary(code){
 if(!(stationIsReady()||stationIsShip())||!/^S[LA]-/.test(code))return '';
 return shippingWithCtx(()=>{
  const orders=[...new Set((carrierContents().get(code)||[]).map(x=>x.g.o))].sort((a,b)=>String(a.businessNumber).localeCompare(String(b.businessNumber)));if(!orders.length)return '';
  return '<div class="st-skid" data-station-skid><b data-raw>'+esc([...new Set(orders.map(o=>salesCustomerDisplay(o.customerId)))].join(' · '))+'</b>'+
   orders.map(o=>{const r=stationReadyCount(o);return '<span>'+esc(o.businessNumber||'')+': '+r.ready+' / '+r.of+' ready</span>';}).join('')+'</div>';
 });
}

/* ------------------------------- SHIP ------------------------------- */
function stationTrip(){const s=stationSession(),t=s&&s.trip?shippingFind(s.trip):null;return t&&t.status==='planned'?t:null;}
function stationSetTrip(id){const m=stationSessions(),s=m[stationCode];if(!s||typeof s!=='object')return;s.trip=id||'';stationSessionsSave(m);}
function stationTripPick(id){stationSetTrip(id);stationNote='';render();}
function stationTripChip(){
 const t=stationIsShip()?stationTrip():null;
 return t?'<div class="st-chip st-puton" data-station-trip>Loading <b>'+esc(t.number)+'</b><span data-raw>'+esc(salesCustomerDisplay(t.customerId))+'</span><button type="button" title="Close this trip" onclick="stationTripPick(\'\')">✕</button></div>':'';
}
function stationShipShow(out){
 stationMenu=null;stationNote=out.kind==='saveError'?out.note:'';
 stationLast={check:out,rec:null,data:null,place:null,at:out.at||new Date().toISOString()};
 stationBeep(out.kind==='shipLoaded'?(out.balance?'urgent':'ok'):out.kind==='shipAlready'?'twice':'error');
}
function stationShipSubmit(raw,who,manual){
 const code=stationCodeOf(raw),t=carrierType(code);if(!code)return false;
 stationDrawer=null;stationTab='scan';
 /* Долли на машину не едет — её стекло грузят по стикерам. */
 if(t&&(t.kind!=='Skid'||!carrierFind(code)||!carrierFind(code).active)){stationCarrierScan(code);render();return 'carrier';}
 let target=code;
 if(!t){
  const check=stationCheck(stationCode,raw);if(!check)return false;
  if(check.kind==='skipped'&&!stationQuestions.some(q=>q.code===check.code))stationQuestions.push({code:check.code,at:new Date().toISOString()});
  if(check.kind==='hold'){stationShipShow({kind:'shipHold',code:check.code,reason:check.reason});render();return 'hold';}
  if(check.kind!=='ok'){stationShow(check,null);render();return check.kind;}
  target=check.code;
 }
 const trip=stationTrip(),out=shippingLoad(target,trip&&trip.id,who,{manual:manual||/^(\d+|U-?\d{1,6})$/i.test(String(raw).trim())});
 if(out.kind==='shipLoaded')stationSetTrip(out.psId);
 stationShipShow(out);render();return out.kind;
}
/* Юнит принесли без скана готовности: Yes отмечает пропущенное у всех его
   стёкол, погрузку пишет уже скан рейса. */
function stationShipConfirm(code,who){
 return storageCommand(()=>{
  const check=stationCheck(stationCode,code);if(!check||check.kind!=='skipped')throw new Error('Nothing to confirm.');
  [code].concat(stationMatesAt(check.g,stationCode).map(x=>x.id)).forEach(id=>{
   const c=stationCheck(stationCode,id);if(!c||c.kind!=='skipped')return;
   const r=stationConfirmSkipped(stationCode,id,who,{missedOnly:true,deferTouch:true});if(r.error)throw new Error(r.error);
  });
  return {confirmed:check.missed};
 });
}
function stationShipCard(L){
 const c=L.check,time='<span>'+esc(stationTime(L.at))+'</span>',what=esc(c.skid||c.label||c.code);
 const cur=stationTrip(),trip=c.trip?'<div class="mut">'+(cur&&cur.id===c.trip.id?'Loading ':'')+esc(c.trip.number)+' · <span data-raw>'+esc(salesCustomerDisplay(c.trip.customerId))+'</span></div>':'';
 if(c.kind==='shipLoaded')return '<div class="st-res st-ok" data-station-result="shipLoaded"><div class="st-res-h">✓ '+esc(c.label)+' → '+esc(c.ps)+(c.added?' · added':' · loaded')+time+'</div>'+
  (c.balance?'<div class="st-urg" data-station-balance>BALANCE DUE<span>· office</span></div>':'')+
  '<div class="st-res-b"><div class="st-big st-dark"><small>'+(c.added?'ADDED TO':'LOADED')+'</small><b class="st-big-code">'+esc(c.ps)+'</b><span data-raw>'+esc(c.customer)+'</span></div>'+
  '<div class="st-info"><div class="st-gid mono">'+esc(c.label)+'</div><div class="st-kv"><span class="k">Units</span><span><b>'+c.units+'</b></span><span class="k">Orders</span><span>'+c.orders.map(o=>'<b>'+esc(o.number)+'</b> ×'+o.units).join(' · ')+'</span></div></div></div>'+
  '<div class="st-acts"><button type="button" class="b" data-station-load-undo onclick="stationUndoClick(\''+esc(c.recId)+'\')">Undo</button></div></div>';
 if(c.kind==='shipAlready')return '<div class="st-res st-amber" data-station-result="shipAlready"><div class="st-res-h">Already loaded · '+esc(stationTime(c.at))+' · <span data-raw>'+esc(c.by||'—')+'</span>'+time+'</div>'+
  '<div class="st-res-b"><div class="st-big st-ask"><small>LOADED</small><b class="st-big-code">'+esc(c.ps)+'</b><span>'+what+'</span></div><div class="st-info"><div class="st-gid mono">'+what+'</div></div></div></div>';
 const ids=(c.ids||[]).slice(0,4).join(', ')+((c.ids||[]).length>4?' +'+((c.ids||[]).length-4):'');
 const K={
  shipQueue:{head:'Take '+esc(c.take)+' first',small:'TAKE FIRST',big:esc(c.take),sub:'Queue '+c.queue,info:trip},
  shipOther:{head:'Other customer',small:'NOT THIS TRIP',big:'STOP',sub:'<span data-raw>'+esc(c.customer)+'</span>',info:trip},
  shipOtherPS:{head:'Other packing slip',small:'IS ON',big:esc((c.ps||[]).join(', ')),sub:'Not this trip',info:trip},
  shipNoPS:{head:'No packing slip',small:'ASK THE OFFICE',big:'NO PS',sub:'<span data-raw>'+esc(c.customer)+'</span>',info:''},
  shipChoose:{head:'Choose the trip',small:'TWO TRIPS',big:'CHOOSE',sub:'<span data-raw>'+esc(c.customer)+'</span>',info:'<div class="mut">Tap the trip on the right</div>'},
  shipMixed:{head:'Two customers on '+what,small:'SKID',big:'STOP',sub:'<span data-raw>'+esc((c.customers||[]).join(', '))+'</span>',info:''},
  shipNotReady:{head:'Not ready',small:'NOT READY',big:String((c.ids||[]).length)+' GLASS',sub:c.why==='hold'?'On hold — set aside':c.why?'Scan at '+esc(c.why)+' first':'Ask the office',info:'<div class="mut mono">'+esc(ids)+'</div>'},
  shipNothing:{head:'Nothing ready on '+what,small:'NOTHING READY',big:what,sub:'Nothing to load',info:''},
  shipHold:{head:'On hold',small:'ON HOLD',big:'SET ASIDE',sub:esc(c.reason||'Order on hold'),info:''}
 }[c.kind]||{head:esc(c.kind),small:'',big:'STOP',sub:'',info:''};
 return '<div class="st-res st-red" data-station-result="'+esc(c.kind)+'"><div class="st-res-h">✕ '+K.head+time+'</div><div class="st-res-b"><div class="st-big st-red"><small>'+K.small+'</small><b'+(K.big.length>6?' class="st-big-code"':'')+'>'+K.big+'</b><span>'+K.sub+'</span></div>'+
  '<div class="st-info"><div class="st-gid mono">'+what+'</div>'+K.info+'</div></div></div>';
}
/* Журнал SHIP — по скидам, а не по стёклам: скид в 150 стёкол иначе занял бы
   весь список, и Undo предыдущего скида было бы не найти. */
function stationShipJournal(){
 const acts=new Map();(DB.stationScan||[]).forEach(s=>{if(s.undoneAt||s.station!==stationCode)return;const k=s.actionId||s.id;if(!acts.has(k))acts.set(k,[]);acts.get(k).push(s);});
 const rows=[...acts.values()].slice(-8).reverse();if(!rows.length)return '';
 const index=stationPieceIndex();
 const body=rows.map(list=>{
  const first=list[0],pieces=new Set(list.map(s=>s.piece)),ps=(DB.shipment||[]).find(s=>shippingActive(s)&&s.items.some(i=>i.pieces.includes(first.piece)));
  const items=ps?ps.items.filter(i=>i.pieces.some(p=>pieces.has(p))):[],orders=[...new Set(list.map(s=>{const h=index.get(s.piece),o=h&&salesRecord(h.orderId);return o?o.businessNumber||'':'';}).filter(Boolean))];
  return '<tr data-station-load="'+esc(first.on||first.piece)+'"><td class="mut">'+esc(stationTime(first.at))+'</td><td>'+(first.on?'<b class="st-on">'+esc(first.on)+'</b>':'<b class="mono">'+esc(items[0]?items[0].label:first.piece)+'</b>')+(first.manual?' <span class="st-man" title="Marked by hand">hand</span>':'')+'</td>'+
   '<td>'+(ps?'<b>'+esc(ps.number)+'</b>':'<span class="mut">—</span>')+'</td><td>'+esc(orders.join(', '))+'</td><td>'+(items.length?shippingCount(items.length,'unit'):list.length+' glass')+'</td><td class="mut" data-raw>'+esc(first.by)+'</td>'+
   '<td style="text-align:right">'+(!ps||ps.status==='planned'?'<button type="button" class="b sm" onclick="stationUndoClick(\''+esc(first.id)+'\')">Undo</button>':'')+'</td></tr>';
 }).join('');
 return '<div class="card st-journal"><div class="st-sec"><h3>Loaded</h3></div><table><thead><tr><th>Time</th><th>Skid</th><th>Packing slip</th><th>Order</th><th>Units</th><th>By</th><th></th></tr></thead><tbody>'+body+'</tbody></table></div>';
}
/* Справа на SHIP: открытые рейсы. Нажатие — грузить этот. */
function stationTripsCard(){
 const trips=shippingOpenTrips(),cur=stationTrip();
 const rows=shippingWithCtx(()=>trips.map(s=>{
  const st=shippingLoadState(s),text=shippingLoadText(st)||(st.units.length?shippingLoadPart(st.units)+' planned':'Open trip');
  return '<div class="st-dl'+(cur&&cur.id===s.id?' now':'')+'" data-station-trip-row="'+esc(s.number)+'" onclick="stationTripPick(\''+esc(s.id)+'\')"><span class="st-dchip">'+esc(s.number)+'</span><span><b data-raw>'+esc(salesCustomerDisplay(s.customerId))+'</b> <span class="mut">'+esc(text)+'</span></span><span class="mut">'+esc(docDate(s.date))+'</span></div>';
 }).join(''));
 return '<div class="card" data-station-trips><div class="st-sec"><h3>Trips</h3><span class="sp"></span><span class="mut">first skid opens the trip</span></div>'+(rows||'<div class="mut">No open packing slips</div>')+'</div>';
}
