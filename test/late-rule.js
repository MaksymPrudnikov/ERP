/* Что считать Late (владелец, 16.11.2026) — четыре ситуации самовывоза:
   1. Recut до выдачи: «если сломалось на производстве, у нас в голове заложено
      +3 дня, но по факту клиенту нужно выдать в срок» — срок по последнему
      готовому стеклу, включая переделку;
   2. NCR после выдачи: исходный заказ остаётся в срок, переделка — свой заказ
      без срока, в On time % не входит;
   3. выдача частями: по последнему стеклу;
   4. отменённые юниты не ждут: «отменённое не продолжают производить». */
module.exports=async function({page,eq}){
 console.log('late-rule');const t=await page();
 await require('./optimization-fixture')(t.p);
 await require('./report-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.lrWho={id:'u1',name:'Nazar'};
  window.lrDay=n=>repAddDays(finToday(),n);
  window.lrOrder=(c,qty,due)=>rbOrder(c,'6CLEAR','single',[[30,40,qty]],{dueDate:lrDay(due),delivery:'pickup'});
  /* Стекло проходит маршрут до станции готовности N дней назад. */
  window.lrReady=(piece,days)=>{const route=stationRouteOf(stationGlass(piece)).codes,ready=shippingStations().ready;
   route.slice(0,route.indexOf(ready)+1).forEach((st,i)=>{const c=stationCheck(st,piece);if(c&&c.kind==='ok')stationRecord(st,c,lrWho,{now:rbAt(days,9,i)});});};
  window.lrState=id=>{const r=repOrderFacts().find(x=>x.id===id);return r.state+(r.daysLate?' +'+r.daysLate:'');};
 });
 eq('Late 1: Recut до выдачи — срок по последнему стеклу; пока переделка в цеху, а срок прошёл, заказ уже Late',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];const c=oqCustomer({legalName:'Late One'}),id=lrOrder(c,2,-3);rbBatch([id]);
  rbIds(id).forEach(p=>lrReady(p,-5));const before=lrState(id);
  const o=salesRecord(id),l=o.lines[0],reason=ncrReasonsFor('OFFICE',{activeOnly:true})[0];
  const made=recutCreate({orderId:id,where:'OFFICE',reasonId:reason.id,lines:{[l.id]:{on:true,qty:1,which:'unit'}}});
  const waiting=lrState(id);
  glassBatchAssign(glassBatchRows([salesRecord(id)]),{});recutPieces(DB.recut[0]).forEach(p=>lrReady(p,-1));
  return {made:!!made&&!made.error,before,waiting,after:lrState(id)};
 }),{made:true,before:'On time',waiting:'Late +3',after:'Late +2'});
 eq('Late 2: NCR после выдачи — исходный заказ остаётся On time, переделка без срока в On time % не входит',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];DB.ncr=[];const c=oqCustomer({legalName:'Late Two'}),id=lrOrder(c,2,-3);rbBatch([id]);
  rbIds(id).forEach(p=>lrReady(p,-5));oqPay(id);const out=oqFulfill(id,'pickup');
  const l=salesRecord(id).lines[0],reason=ncrReasonsFor('SHIP',{activeOnly:true})[0];
  const made=ncrCreate({orderId:id,where:'SHIP',reasonId:reason.id,action:'Remake order',lines:{[l.id]:{on:true,qty:1,which:'unit'}},note:''});
  const remake=DB.ncr[0]&&DB.ncr[0].remakeOrderId;
  return {out,made:!!made&&!made.error,original:lrState(id),remake:remake?lrState(remake):''};
 }),{out:true,made:true,original:'On time',remake:'No due date'});
 eq('Late 3: выдача частями — по последнему стеклу: остаток готов к сроку — On time, после срока — Late',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];DB.ncr=[];const c=oqCustomer({legalName:'Late Three'}),a=lrOrder(c,2,-3),b=lrOrder(c,2,-3);rbBatch([a,b]);
  const part=(id,rest)=>{const ids=rbIds(id);lrReady(ids[0],-6);const o=salesRecord(id);
   const made=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Fixture job site'},date:lrDay(-6),items:shippingAvailable(o).map(shippingItem),extras:[]});
   const sent=made.ok&&shippingMarkShipped(made.value.id).ok;lrReady(ids[1],rest);return sent;};
  return {sent:[part(a,-4),part(b,-1)],state:[lrState(a),lrState(b)]};
 }),{sent:[true,true],state:['On time','Late +2']});
 eq('Late 4: отменённые юниты не ждут — остальное готово к сроку — On time',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];DB.ncr=[];const c=oqCustomer({legalName:'Late Four'}),id=lrOrder(c,2,-3);rbBatch([id]);
  const l=salesRecord(id).lines[0],cancelled=unitCancel(id,l.id,1,'Customer changed the order',{});
  const left=rbIds(id).filter(p=>!unitCancelledSet(salesRecord(id)).has(p));left.forEach(p=>lrReady(p,-4));
  return {cancelled:!!cancelled&&cancelled.ok!==false,left:left.length,state:lrState(id)};
 }),{cancelled:true,left:1,state:'On time'});
 eq('Late 5: выдача частями и Recut на остаток — пока переделка в очереди, а срок прошёл, заказ Late; готова — Late по её дню (аудит 17.11.2026)',await t.p.evaluate(()=>{
  oqReset();DB.recut=[];DB.ncr=[];const c=oqCustomer({legalName:'Late Five'}),id=lrOrder(c,2,-3);rbBatch([id]);
  rbIds(id).forEach(p=>lrReady(p,-5));const o=salesRecord(id);
  const made=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Fixture job site'},date:lrDay(-5),items:shippingAvailable(o).slice(0,1).map(shippingItem),extras:[]});
  const sent=made.ok&&shippingMarkShipped(made.value.id).ok,before=lrState(id),status=salesRecord(id).status;
  const l=salesRecord(id).lines[0],reason=ncrReasonsFor('OFFICE',{activeOnly:true})[0];
  recutCreate({orderId:id,where:'OFFICE',reasonId:reason.id,lines:{[l.id]:{on:true,qty:1,which:'unit'}}});
  const waiting=lrState(id);
  glassBatchAssign(glassBatchRows([salesRecord(id)]),{});recutPieces(DB.recut[0]).forEach(p=>lrReady(p,-1));
  return {sent,status,before,waiting,after:lrState(id)};
 }),{sent:true,status:'shipping',before:'On time',waiting:'Late +3',after:'Late +2'});
 eq('late-rule: no page errors',t.errs,[]);
 await t.c.close();
};
