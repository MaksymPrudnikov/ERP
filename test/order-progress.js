/* Прогресс заказа (erp/sales/order-progress; задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md, этап 2):
   юниты заказа разложены на четыре кучки — отгружено, готово к выдаче, в
   производстве, не начато — и в сумме всегда дают все юниты. Числа те же, что
   в Shipping и на доске Production. Адрес #order=<номер> открывает заказ. */
module.exports=async function({page,eq}){
 console.log('order progress');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  oqReset();window.opC=oqCustomer({legalName:'ABC Glass Ltd'});
  /* Заказ фикстуры: строка 2 юнита и строка 1 юнит, стеклопакет из двух стёкол. */
  window.opNew=()=>{const id=oqOrder(opC);salesDraftDrop();return id;};
  window.opU=id=>{const p=salesOrderProgress(salesRecord(id)),u=p.units;return {status:p.status,u:[u.total,u.shipped,u.ready,u.inProduction,u.notStarted],done:u.done,sum:u.shipped+u.ready+u.inProduction+u.notStarted===u.total};};
  touch();
 });
 eq('Прогресс: новый и Verified заказ — все юниты «не начато», станций нет',await run(()=>{
  const id=opNew(),fresh=opU(id),st=salesOrderProgress(salesRecord(id)).stations.length;oqThrough(id,'verified');
  return {fresh,st,verified:opU(id)};
 }),{fresh:{status:'New',u:[3,0,0,0,3],done:0,sum:true},st:0,verified:{status:'Verified',u:[3,0,0,0,3],done:0,sum:true}});
 eq('Прогресс: в батче одно стекло из шести — его юнит уже в производстве, остальные не начаты',await run(()=>{
  const id=opNew();oqThrough(id,'verified');const rows=glassBatchRows([salesRecord(id)]);glassBatchAssign(rows.slice(0,1),{deferTouch:true});touch();
  return {pieces:rows.length,p:opU(id)};
 }),{pieces:6,p:{status:'Batched',u:[3,0,0,1,2],done:0,sum:true}});
 eq('Прогресс: весь заказ в батче — все юниты в производстве; станции — те же клетки, что на доске Production',await run(()=>{
  const id=opNew();oqThrough(id,'batched');window.opB=id;
  const p=salesOrderProgress(salesRecord(id)),x=prodBoard().find(r=>r.o.id===id);
  return {p:opU(id),stations:p.stations.length>0,same:p.stations.every(s=>x.route[s.code].w===s.waiting&&x.route[s.code].p===s.passed&&x.route[s.code].n===s.total),waiting:p.stations.reduce((n,s)=>n+s.waiting,0)===Object.keys(x.counts).filter(k=>k!=='queue').reduce((n,k)=>n+x.counts[k],0)};
 }),{p:{status:'Batched',u:[3,0,0,3,0],done:0,sum:true},stations:true,same:true,waiting:true});
 eq('Прогресс: стекло дошло до выдачи — все юниты «готово», столько же, сколько Ready в Shipping',await run(()=>{
  const id=opB;oqReady(id);const s=shippingSummary(salesRecord(id));
  return {p:opU(id),shipping:[s.glass,s.physicalReady,s.shipped],stations:salesOrderProgress(salesRecord(id)).stations.length};
 }),{p:{status:'Ready',u:[3,0,3,0,0],done:3,sum:true},shipping:[3,3,0],stations:0});
 eq('Прогресс: один юнит уехал — отгружено 1, готово 2; уехало всё — отгружено 3, статус Shipped, станций нет',await run(()=>{
  const id=opB,o=salesRecord(id),made=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Fixture job site'},date:finToday(),items:shippingAvailable(o).slice(0,1).map(shippingItem),extras:[]});
  const sent=made.ok&&shippingMarkShipped(made.value.id).ok,part=opU(id);
  oqFulfill(id);
  return {sent,part,all:opU(id),stations:salesOrderProgress(salesRecord(id)).stations.length};
 }),{sent:true,part:{status:'Partially shipped',u:[3,1,2,0,0],done:3,sum:true},all:{status:'Shipped',u:[3,3,0,0,0],done:3,sum:true},stations:0});
 eq('Прогресс: On Hold — признак и причина; отменённый заказ — статус Cancelled, сумма кучек та же',await run(()=>{
  const id=opNew();salesHoldApply([id],'Waiting for payment');const p=salesOrderProgress(salesRecord(id)),hold={onHold:p.onHold,reason:p.holdReason,due:p.due===salesRecord(id).dueDate};
  salesReleaseHold([id]);salesRecord(id).status='cancelled';touch();
  return {hold,free:salesOrderProgress(salesRecord(id)).onHold,cancelled:opU(id)};
 }),{hold:{onHold:true,reason:'Waiting for payment',due:true},free:false,cancelled:{status:'Cancelled',u:[3,0,0,0,3],done:0,sum:true}});
 eq('Прогресс: квота — вид, статус, срок цен и число юнитов; денег и станций нет',await run(()=>{
  const q=oqOrder(opC,{kind:'quote'});salesDraftDrop();const p=salesOrderProgress(salesRecord(q));window.opQ=q;
  return {kind:p.kind,status:p.status,total:p.units.total,valid:/^\d{4}-\d{2}-\d{2}$/.test(p.validUntil),keys:Object.keys(p).sort().join(' '),none:salesOrderProgress(null)};
 }),{kind:'quote',status:'Not sent',total:3,valid:true,keys:'kind sentAt statusKey status units validUntil wonOrderId'.split(' ').sort().join(' '),none:null});
 eq('Адрес #order=<номер>: открывает заказ и квоту по номеру, адрес снимается; неизвестный номер — сообщение, открыт список Sales',await t.p.evaluate(async()=>{
  const wait=()=>new Promise(r=>setTimeout(r,80)),id=opB,no=salesRecord(id).businessNumber,qno=salesRecord(opQ).businessNumber;
  tab='dashboard';render();location.hash='order='+no;await wait();
  const order={tab,open:soEdit===id,hash:location.hash};salesDraftDrop();
  location.hash='order='+qno.toLowerCase();await wait();const quote={open:!!soDraft&&salesIsQuote(soDraft),hash:location.hash};salesDraftDrop();
  const keep=window.alert;let said='';window.alert=m=>{said=m;};tab='dashboard';render();
  try{location.hash='order=999999';await wait();}finally{window.alert=keep;}
  const missing={said,tab,open:soEdit,hash:location.hash};
  location.hash='order=<script>';await wait();const bad={open:soEdit};history.replaceState(null,'',location.href.split('#')[0]);
  return {order,quote,missing,bad};
 }).catch(e=>({error:String(e.message).split('\n')[0]})),{order:{tab:'sales',open:true,hash:''},quote:{open:true,hash:''},missing:{said:'Order 999999 was not found.',tab:'sales',open:null,hash:''},bad:{open:null}});
 eq('order-progress без ошибок страницы',t.errs,[]);
 await t.c.close();
};
