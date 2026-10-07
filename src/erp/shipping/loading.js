/* Shipping · очередь клиента и погрузка на станции отгрузки (PR 2, 6.10.2026).
   IN : готовые юниты (erp/shipping/data) · открытые PS · журнал сканов.
   OUT: line.shipQueue · SHIP-сканы погрузки · состав PS (item.added).
   Владелец: офис открывает рейс, водитель сам выбирает скиды — скан пишет и
   проверяет. Первый скид открывает рейс. Скид другого клиента или другого
   PS грузится в свой PS — экран предупреждает жёлтым (владелец, 7.10.2026:
   «зачем блокировать — на машину можно погрузить 3 скида и отвезти трём
   разным клиентам по очереди»). Грузят и накануне: скид без PS
   идёт в открытый PS клиента с ближайшей датой. Очередь клиента: готовый
   скид с меньшим номером грузят первым. Долг cash-клиента погрузку не
   держит — строка «Balance due — office».
   «Погружен» не хранится: это юнит открытого PS, прошедший станцию отгрузки.
   item.added — номер скана, которым юнит добавлен в PS: Undo этого скана его
   же и убирает. */
function shippingQueueOf(l){const n=l&&l.shipQueue;return Number.isSafeInteger(n)&&n>0&&n<1000?n:0;}
function shippingQueueAllowed(o){return !!o&&!salesIsQuote(o)&&!['closed','cancelled'].includes(o.status);}
function shippingQueueSet(orderId,lineIds,value){return storageCommand(()=>{
 const o=salesRecord(orderId);shippingAssert(shippingQueueAllowed(o),'This order cannot change.');
 const text=String(value==null?'':value).trim(),n=text===''?0:Number(text);
 shippingAssert(Number.isSafeInteger(n)&&n>=0&&n<1000,'Queue is a number from 1 to 999.');
 const lines=[...new Set(lineIds||[])].map(id=>(o.lines||[]).find(l=>l.id===id));shippingAssert(lines.length&&lines.every(Boolean),'Line not found.');
 const changed=lines.filter(l=>shippingQueueOf(l)!==n);if(!changed.length)return o;
 changed.forEach(l=>{if(n)l.shipQueue=n;else delete l.shipQueue;});
 o.updatedAt=new Date().toISOString();salesSyncRecordLifecycle(o);
 orderLogPush(o,'Shipping queue',(n?'Queue '+n:'No queue')+' · line '+changed.map(l=>o.lines.indexOf(l)+1).join(', '));return o;
});}
function shippingUnitQueue(u){const o=salesRecord(u.orderId);return shippingQueueOf(o&&(o.lines||[]).find(l=>l.id===u.lineId));}
/* Долг, который держит выдачу у cash-клиента (то же условие, что Take
   payment в salesTransitionChecks). Суммы на станции нет. */
function shippingBalanceDue(o){
 const c=salesFindCustomer(o.customerId),terms=typeof finTermsFor==='function'?finTermsFor(o):paymentTermsFrom(c||{}),b=finOrderBalance(o);
 return terms.paymentMode!=='credit'&&b.balance!=null&&b.balance>0;
}
function shippingOpenTrips(){return (DB.shipment||[]).filter(s=>s.status==='planned').sort((a,b)=>a.date.localeCompare(b.date)||a.number.localeCompare(b.number));}
/* Открытый PS клиента с ближайшей датой: сегодня или позже, иначе последний
   просроченный. Два PS на одну дату — рейс выбирает человек. */
function shippingTripFor(customerId){
 const open=shippingOpenTrips().filter(s=>s.customerId===customerId),today=finToday(),ahead=open.filter(s=>s.date>=today);
 const pool=ahead.length?ahead:open.slice().reverse(),same=pool.filter(s=>s.date===pool[0].date);
 return {trip:same.length===1?same[0]:null,count:same.length};
}
/* Юниты открытого PS: что погружено и что ещё ждёт. */
function shippingLoadState(s){
 const units=shippingOrderIds(s).flatMap(id=>shippingUnits(salesRecord(id))).filter(u=>u.shipment&&u.shipment.id===s.id);
 return {units,loaded:units.filter(u=>u.loaded),rest:units.filter(u=>!u.loaded)};
}
/* Юнит, который так и не уехал с этим PS, не считается напечатанным на нём:
   иначе его поломку в цеху пришлось бы оформлять как NCR (решение 20). */
function shippingUnprint(s,items){if(s.printedItems&&items.length)s.printedItems=s.printedItems.filter(p=>!items.some(i=>i.label===p.label));}
/* Какие скиды уезжают с PS. Владелец, 6.10.2026: «мы ему выдали юниты из
   скида, а не сам скид с юнитами» — скид едет, только если на нём не остаётся
   чужого стекла; на самовывозе — только если его погрузили сканом скида
   («клиент пригоняет свой трак, и мы на него грузим скиды»).
   units — юниты PS как их видит цех сейчас: {pieces, skid, loaded}. */
function shippingCarriers(){const c=shippingCtxNow;return c?c.carriers||(c.carriers=carrierContents()):carrierContents();}
function shippingSkidsOut(s,units){
 const mine=new Set(units.flatMap(u=>u.pieces)),on=shippingCarriers(),went=s.method==='pickup'?units.filter(u=>u.loaded):units;
 return [...new Set(went.map(u=>u.skid).filter(Boolean))].filter(code=>!(on.get(code)||[]).some(x=>!mine.has(x.id)));
}
function shippingLoadPart(list){const skids=new Set(list.map(u=>u.skid).filter(Boolean)).size,loose=list.filter(u=>!u.skid).length;return [skids?shippingCount(skids,'skid'):'',loose?shippingCount(loose,'unit'):''].filter(Boolean).join(' + ');}
function shippingLoadText(st){return st.loaded.length?shippingLoadPart(st.loaded)+' loaded'+(st.rest.length?' · '+shippingLoadPart(st.rest)+' not loaded':''):'';}
/* Скид: готовые юниты на нём и стекло, которое лежит там же, но не готово
   (не прошло станцию готовности, заказ на Hold) — такой скид не грузят. */
function shippingUnitsOn(skid){
 const on=carrierContents().get(skid)||[],units=[...new Set(on.map(x=>x.g.o))].flatMap(o=>shippingUnits(o)).filter(u=>u.ready&&u.on===skid);
 const covered=new Set(units.flatMap(u=>u.pieces));
 return {units,stray:on.filter(x=>!covered.has(x.id)).map(x=>x.id)};
}
/* Разбор скана погрузки без записи. code — скид или номер стекла юнита.
   kind 'ok' — можно писать; остальное — только показать. */
function shippingLoadPlan(code,tripId){
 const ship=shippingStations().ship,skid=carrierType(code)?carrierCode(code):'',fail=(kind,extra)=>Object.assign({kind,code,skid},extra);
 let units=[],stray=[];
 /* Отменённый юнит ещё лежит на скиде — скид не грузят, пока его не снимут
    (владелец, 6.10.2026). */
 const off=skid?unitOnSkid(skid):[];
 if(off.length)return fail('shipTakeOff',{ids:off.flatMap(x=>x.pieces),units:off.length,orders:[...new Set(off.map(x=>x.o.businessNumber))]});
 if(skid){const x=shippingUnitsOn(skid);units=x.units;stray=x.stray;}
 else{const g=stationGlass(code),u=g&&shippingUnits(g.o).find(u=>u.pieces.includes(code));if(u&&u.ready)units=[u];else stray=[code];}
 if(stray.length){
  const g=stationGlass(stray[0]),at=g?stationPlace(g).waiting:'';
  return fail('shipNotReady',{ids:stray,why:g&&(g.o.onHold||g.l.onHold||unitPieceHold(g))?'hold':at&&at!==ship?at:''});
 }
 if(!units.length){
  const last=(DB.stationScan||[]).filter(s=>!s.undoneAt&&s.on===skid&&s.station===ship).pop();
  const ps=last&&(DB.shipment||[]).find(s=>shippingActive(s)&&s.items.some(i=>i.pieces.includes(last.piece)));
  return ps?fail('shipAlready',{ps:ps.number,at:last.at,by:last.by}):fail('shipNothing');
 }
 const customers=[...new Set(units.map(u=>salesRecord(u.orderId).customerId))];
 if(customers.length>1)return fail('shipMixed',{customers:customers.map(salesCustomerDisplay)});
 const customerId=customers[0],customer=salesCustomerDisplay(customerId),own=[...new Set(units.filter(u=>u.shipment).map(u=>u.shipment.id))];
 let trip=tripId?shippingFind(tripId):null,opened=false,switched=null;if(trip&&trip.status!=='planned')trip=null;
 /* Юниты скида в двух PS — какой из них грузить, решает офис. */
 if(own.length>1)return fail('shipOtherPS',{trip,customer,ps:own.map(id=>shippingFind(id).number)});
 /* Другой клиент или другой PS — тот же рейс, свой PS. */
 if(trip&&(trip.customerId!==customerId||own.length&&own[0]!==trip.id)){switched={from:trip.number,other:trip.customerId!==customerId};trip=null;}
 if(!trip){
  if(own.length)trip=shippingFind(own[0]);
  else{const f=shippingTripFor(customerId);if(!f.trip)return fail(f.count?'shipChoose':'shipNoPS',{customer});trip=f.trip;}
  opened=true;
 }
 /* Очередь: готовый юнит этого клиента с меньшим номером (в этом рейсе или
    без PS) ещё не погружен. Без номера — после всех номеров. */
 const mine=new Set(units.map(u=>u.label)),q=Math.min(...units.map(u=>shippingUnitQueue(u)||Infinity));
 const first=(DB.salesOrder||[]).filter(o=>o.customerId===customerId&&!salesIsQuote(o)&&!['done','closed','cancelled'].includes(o.status)).flatMap(o=>shippingUnits(o))
  .filter(u=>u.ready&&!mine.has(u.label)&&(!u.shipment||u.shipment.id===trip.id)).map(u=>({u,q:shippingUnitQueue(u)})).filter(x=>x.q&&x.q<q).sort((a,b)=>a.q-b.q||a.u.label.localeCompare(b.u.label))[0];
 if(first)return fail('shipQueue',{trip,customer,take:first.u.skid||first.u.label,queue:first.q});
 return {kind:'ok',code,skid,units,add:units.filter(u=>!u.shipment),trip,opened,switched,customerId,customer};
}
function shippingLoad(code,tripId,who,opts){
 const plan=shippingWithCtx(()=>shippingLoadPlan(code,tripId));if(plan.kind!=='ok')return plan;
 const out=storageCommand(()=>shippingLoadCommand(code,tripId,who,opts));
 return out.ok?out.value:{kind:'saveError',code,note:out.error};
}
function shippingLoadCommand(code,tripId,who,opts){
 opts=opts||{};const plan=shippingWithCtx(()=>shippingLoadPlan(code,tripId));shippingAssert(plan.kind==='ok','Scan again.');
 const ship=shippingStations().ship,now=new Date().toISOString(),s=plan.trip,ids=[...new Set(plan.units.map(u=>u.orderId))];let actionId='';
 /* Весь скид — одно действие: один actionId, один Undo. */
 plan.units.forEach(u=>u.pieces.forEach(piece=>{
  const check=stationCheck(ship,piece);shippingAssert(check&&check.kind==='ok','Glass is no longer ready.');
  /* Скид едет только сканом скида: юнит, взятый по своему стикеру (со
     скида-микса), уезжает без него — скид остаётся в цеху. */
  const rec=stationRecord(ship,check,who,{deferTouch:true,manual:!!opts.manual,now,on:plan.skid?u.skid:'',actionId:actionId||undefined});
  shippingAssert(rec,'Loading was not recorded.');actionId=actionId||rec.id;
 }));
 plan.add.forEach(u=>s.items.push(Object.assign(shippingItem(u),{added:actionId})));
 shippingSyncOrders(ids,now);
 const count=id=>plan.units.filter(u=>u.orderId===id).length;
 ids.forEach(id=>orderLogPush(salesRecord(id),'Loaded',s.number+' · '+(plan.skid||plan.units[0].label)+' · '+shippingCount(count(id),'unit')+(plan.add.some(u=>u.orderId===id)?' · added':'')));
 return {kind:'shipLoaded',code,skid:plan.skid,label:plan.skid||plan.units[0].label,ps:s.number,psId:s.id,customer:plan.customer,units:plan.units.length,added:plan.add.length,opened:plan.opened,switched:plan.switched,recId:actionId,at:now,
  orders:ids.map(id=>({number:salesRecord(id).businessNumber,units:count(id)})),balance:ids.some(id=>shippingBalanceDue(salesRecord(id)))};
}
/* Undo скана погрузки (erp/shopfloor/scan): добавленное этим сканом уходит
   из PS, положенное офисом остаётся в нём и снова ждёт погрузки. */
function shippingLoadUndone(recs){
 const ship=shippingStations().ship,load=recs.filter(r=>r.station===ship);if(!load.length)return;
 const pieces=new Set(load.map(r=>r.piece)),actions=new Set(load.map(r=>r.actionId||r.id));
 (DB.shipment||[]).forEach(s=>{
  if(s.status!=='planned')return;const hit=s.items.filter(i=>i.pieces.some(p=>pieces.has(p)));if(!hit.length)return;
  shippingUnprint(s,s.items.filter(i=>i.added&&actions.has(i.added)));s.items=s.items.filter(i=>!(i.added&&actions.has(i.added)));
  [...new Set(hit.map(i=>i.orderId))].forEach(id=>orderLogPush(salesRecord(id),'Loading undone',s.number));
 });
}
