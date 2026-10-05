/* Office PS commands. All writes, scans, order statuses and log entries commit
   together. Owner, 5 October 2026: after printing a PS, missing/broken goods
   are NCR, not a recut/backorder. Printing itself is not proof of delivery.
   SHIP skid loading, queue priority and truck planning belong to later PRs. */
function shippingAssert(ok,message){if(!ok)throw new Error(message);}
function shippingActor(){const a=orderLogActor();return a.by||'Office';}
function shippingItem(i){return {orderId:i.orderId,lineId:i.lineId,unit:i.unit,label:i.label,skid:i.skid||'',pieces:i.pieces.slice()};}
function shippingValidateSelection(d,exceptId){
 shippingAssert(salesFindCustomer(d.customerId),'Choose a customer.');
 shippingAssert(['pickup','delivery'].includes(d.method)&&shippingDateValid(d.date),'Check the method and date.');
 shippingAssert(d.method==='pickup'||String(d.shipTo&&d.shipTo.address1||'').trim(),'Enter the delivery address.');
 const items=[],extras=[],seen=new Set(),available=new Map();
 (d.items||[]).forEach(i=>{
  const o=salesRecord(i.orderId);shippingAssert(o&&!salesIsQuote(o)&&o.customerId===d.customerId&&!['cancelled','closed'].includes(o.status),'Check the customer and orders.');
  if(!available.has(o.id))available.set(o.id,shippingAvailable(o,exceptId));
  const hit=available.get(o.id).find(x=>x.lineId===i.lineId&&x.unit===i.unit&&x.label===i.label);
  shippingAssert(hit&&!seen.has(shippingKey(i)),'The selected glass is no longer available. Review the packing slip.');
  seen.add(shippingKey(i));items.push(shippingItem(hit));
 });
 (d.extras||[]).forEach(i=>{
  const o=salesRecord(i.orderId),x=o&&(o.extraItems||[]).find(x=>x.id===i.extraId),k=i.orderId+'|'+i.extraId;
  shippingAssert(o&&x&&!salesIsQuote(o)&&o.customerId===d.customerId&&!['new','closed','cancelled'].includes(o.status)&&!o.onHold,'Stock order is not ready.');
  const used=shippingForOrder(o.id).filter(s=>shippingActive(s)&&s.id!==exceptId).flatMap(s=>s.extras).filter(a=>a.extraId===x.id).reduce((n,a)=>n+a.qty,0);
  shippingAssert(Number.isSafeInteger(i.qty)&&i.qty>0&&i.qty<=x.qty-used&&!seen.has(k),'Check the available stock quantity.');
  seen.add(k);extras.push({orderId:o.id,extraId:x.id,qty:i.qty});
 });
 return {items,extras};
}
function shippingCreate(d){return storageCommand(()=>{
 const picked=shippingValidateSelection(d),now=new Date().toISOString();
 DB.shipmentSeq=(Number(DB.shipmentSeq)||0)+1;
 const s={id:salesUid('PS'),number:'PS-'+String(DB.shipmentSeq).padStart(4,'0'),customerId:d.customerId,method:d.method,shipTo:shippingAddress(d.shipTo),date:d.date,status:'planned',...picked,
  createdAt:now,createdBy:shippingActor(),shippedAt:'',shippedBy:'',deliveredAt:'',receivedBy:'',note:String(d.note||'').slice(0,1000),scanIds:[]};
 DB.shipment.push(s);shippingOrderIds(s).forEach(id=>orderLogPush(salesRecord(id),'Packing slip created',s.number));return s;
});}
function shippingUpdate(id,d){return storageCommand(()=>{
 const s=shippingFind(id);shippingAssert(s&&s.status==='planned','Only a planned packing slip can change.');
 shippingAssert(s.customerId===d.customerId,'The packing slip customer cannot change.');
 const picked=shippingValidateSelection(d,s.id),ids=shippingOrderIds(s);
 Object.assign(s,picked,{method:d.method,shipTo:shippingAddress(d.shipTo),date:d.date,note:String(d.note||'').slice(0,1000)});
 [...new Set(ids.concat(shippingOrderIds(s)))].forEach(oid=>orderLogPush(salesRecord(oid),'Packing slip updated',s.number));return s;
});}
function shippingMarkShipped(id){return storageCommand(()=>{
 const s=shippingFind(id);shippingAssert(s&&s.status==='planned','Only a planned packing slip can be shipped.');
 shippingAssert(s.items.length+s.extras.length>0,'An empty packing slip cannot be shipped.');
 const picked=shippingValidateSelection(s,s.id),now=new Date().toISOString(),station=shippingStations().ship;
 Object.assign(s,picked);s.document=shippingDocument(s);
 const who=orderLogActor(),scanIds=[];
 /* The office button records the confirmed physical dispatch as manual SHIP
    scans. Rollback owns these IDs only; it never undoes an unrelated scan. */
 s.items.forEach(i=>i.pieces.forEach(piece=>{
  const check=stationCheck(station,piece);shippingAssert(check&&check.kind==='ok','Glass is no longer ready. Review the packing slip.');
  const rec=stationRecord(station,check,{id:who.byId,name:who.by||'Office'},{deferTouch:true,manual:true,now});
  shippingAssert(rec,'Dispatch was not recorded.');scanIds.push(rec.id);
 }));
 s.scanIds=scanIds;s.status='shipped';s.shippedAt=now;s.shippedBy=shippingActor();
 shippingSyncOrders(shippingOrderIds(s),now);shippingOrderIds(s).forEach(oid=>orderLogPush(salesRecord(oid),'Packing slip shipped',s.number));return s;
});}
function shippingMarkDelivered(id,receivedBy,receivedOn){return storageCommand(()=>{
 const s=shippingFind(id);shippingAssert(s,'Packing slip not found.');if(s.status==='delivered')return s;
 shippingAssert(s.status==='shipped','Mark this packing slip Shipped first.');
 const day=receivedOn||finToday();shippingAssert(shippingDateValid(day)&&day<=finToday()&&day>=finLocalDate(s.shippedAt),'Check the received date.');
 s.status='delivered';s.deliveredAt=day===finToday()?new Date().toISOString():new Date(day+'T12:00:00').toISOString();s.receivedBy=String(receivedBy||'').trim().slice(0,100);
 shippingSyncOrders(shippingOrderIds(s));shippingOrderIds(s).forEach(oid=>orderLogPush(salesRecord(oid),s.method==='pickup'?'Packing slip picked up':'Packing slip delivered',s.number+(s.receivedBy?' · '+s.receivedBy:'')));return s;
});}
function shippingRevert(id,action){return storageCommand(()=>{
 const s=shippingFind(id);shippingAssert(s,'Packing slip not found.');const ids=shippingOrderIds(s);
 if(action==='cancel'){
  shippingAssert(s.status==='planned','Only a planned packing slip can be cancelled.');s.document=shippingDocument(s);s.status='cancelled';
 }else if(action==='receipt'){
  shippingAssert(s.status==='delivered','This packing slip has not been received.');s.status='shipped';s.deliveredAt='';s.receivedBy='';
 }else{
  shippingAssert(action==='dispatch'&&s.status==='shipped','Undo receipt before undoing dispatch.');
  (s.scanIds||[]).slice().reverse().forEach(scanId=>{const out=stationUndo(scanId,{name:shippingActor()},{deferTouch:true,shippingRollback:true});shippingAssert(out&&!out.error,out&&out.error||'Dispatch cannot be undone.');});
  s.status='planned';s.shippedAt='';s.shippedBy='';s.scanIds=[];delete s.document;
 }
 shippingSyncOrders(ids,null,{reopen:true});ids.forEach(oid=>orderLogPush(salesRecord(oid),action==='cancel'?'Packing slip cancelled':'Packing slip rolled back',s.number+' · '+action));return s;
});}
function shippingScanSigned(raw,by,date){const number=String(raw||'').trim().toUpperCase();if(!/^PS-\d{4,}$/.test(number))return {ok:false,error:'Scan a packing slip number.'};return shippingMarkDelivered(number,by,date);}
function shippingCheckStamp(){return JSON.stringify(DB);}
/* Every order is checked before any write/print. Paying or backing out stops
   the entire action. A change during a warning requires a fresh check. */
function shippingWithChecks(ids,method,printing,done){
 ids=[...new Set(ids)];const stamp=shippingCheckStamp();
 const run=n=>{
  if(shippingCheckStamp()!==stamp){shippingNotice={error:true,text:'Data changed. Review and try again.'};render();return;}
  if(n===ids.length){done();return;}
  const o=salesRecord(ids[n]);if(!o){shippingNotice={error:true,text:'Order not found.'};render();return;}
  const checks=salesTransitionChecks(Object.assign({},o,{delivery:method}),'done').map(c=>Object.assign({},c,{anyway:printing?'Print anyway':'Create anyway'}));
  salesRunChecks(checks,()=>run(n+1),amount=>salesTakeRecordPayment(o.id,amount));
 };run(0);
}
