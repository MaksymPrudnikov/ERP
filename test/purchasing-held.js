/* Held at supplier board (owner, 14 October 2026): what is left at the
   supplier, the pace it is brought, when it runs out and when to order. */
module.exports=async function({page,eq}){
 console.log('purchasing held board');const t=await page(undefined,{width:1440,height:1000});
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await t.p.evaluate(()=>{
  ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchasingEvent'].forEach(k=>DB[k]=[]);DB.purchaseOrderSeq=0;DB.purchaseReceiptSeq=0;
  window.phToday='2026-10-14';window.phDay=n=>purDayAdd(phToday,n);
  window.phFar=purSupplierSave({name:'Held Far East',currency:'USD',leadTimeDays:75}).value;
  window.phNear=purSupplierSave({name:'Held Near Glass',leadTimeDays:14}).value;
  const [g1,g2]=activeGlassProducts();window.phG=[g1,g2];
  const po=(s,date,lines)=>purOrderSave({supplierId:s.id,state:'sent',date,lines}).value;
  window.phA=po(phFar,phDay(-200),[{id:'a',kind:'glass',productId:g1.id,qty:40,unit:'block',widthIn:130,heightIn:96,held:true},{id:'s',kind:'glass',productId:g1.id,qty:10,unit:'block',widthIn:144,heightIn:102,held:true}]);
  window.phB=po(phFar,phDay(-20),[{id:'a',kind:'glass',productId:g1.id,qty:20,unit:'block',widthIn:130,heightIn:96,held:true}]);
  window.phC=po(phNear,phDay(-10),[{id:'c',kind:'glass',productId:g2.id,qty:12,unit:'block',widthIn:130,heightIn:96,held:true}]);
  window.phRec=(p,line,qty,d,extra)=>purFulfilSave('receipt',Object.assign({poId:p.id,supplierId:p.supplierId,date:phDay(d),lines:[Object.assign({id:salesUid('RL'),poLineId:line,kind:'glass',productId:p.lines.find(l=>l.id===line).productId,qty,unit:'block'},extra||{})]}));
  phRec(phA,'a',10,-150);[-80,-50,-20].forEach(d=>phRec(phA,'a',5,d));phRec(phA,'a',2,-5,{replacement:true,unit:'sheet'});
 });
 eq('one row per glass, size and supplier sums every held PO line',await t.p.evaluate(()=>purHeldGroups(phToday).map(a=>[a.item===phG[0].name||a.item===phG[1].name,a.size,a.supplierName,a.pos.map(p=>p.number),a.ordered,a.received,a.remaining])),
  [[true,'130 × 96','Held Far East',['PO-0001','PO-0002'],60,25,35],[true,'144 × 102','Held Far East',['PO-0001'],10,0,10],[true,'130 × 96','Held Near Glass',['PO-0003'],12,0,12]]);
 eq('pace counts the last 90 days only; runs out and order by follow the lead time',await t.p.evaluate(()=>{
  const a=purHeldGroups(phToday)[0];return {perMonth:a.perMonth,runsOut:a.runsOut,orderBy:a.orderBy,status:a.status};
 }),{perMonth:5,runsOut:'2027-05-12',orderBy:'2027-02-26',status:'OK'});
 eq('nothing brought yet gives no estimate, never a guessed date',await t.p.evaluate(()=>purHeldGroups(phToday).slice(1).map(a=>[a.perMonth,a.runsOut,a.orderBy,a.status])),[[null,'','','No estimate'],[null,'','','No estimate']]);
 eq('a young purchase is paced over at least 30 days',await t.p.evaluate(()=>{phRec(phC,'c',6,-3);const a=purHeldGroups(phToday).find(a=>a.supplierName==='Held Near Glass');return {perMonth:a.perMonth,runsOut:a.runsOut,orderBy:a.orderBy,status:a.status};}),{perMonth:6,runsOut:'2026-11-13',orderBy:'2026-10-30',status:'Order soon'});
 eq('when the lead time reaches today it is Order now',await t.p.evaluate(()=>{const s=purClone(purSupplierFind(phNear.id));s.leadTimeDays=30;purSupplierSave(s);const a=purHeldGroups(phToday).find(a=>a.supplierName==='Held Near Glass');return [a.orderBy,a.status];}),['2026-10-14','Order now']);
 eq('far stock is OK; a lead time pushes the order date earlier',await t.p.evaluate(()=>{phRec(phA,'s',1,-60);const a=purHeldGroups(phToday).find(a=>a.size==='144 × 102');return {left:a.remaining,perMonth:a.perMonth,runsOut:a.runsOut,lead:a.orderBy===purDayAdd(a.runsOut,-75),status:a.status};}),{left:9,perMonth:0.3,runsOut:'2029-01-01',lead:true,status:'OK'});
 eq('the board lists held glass without a date filter, with bars and PO links',await t.p.evaluate(()=>{
  tab='purchasing';purGo('held');const rows=salesListRows(purReceivingInfos());
  return {rows:rows.length,date:Object.keys(purListDefaults()).length,bars:document.querySelectorAll('.pur-held-bar').length,links:document.querySelectorAll('.purchasing-workspace .sl-table .fin-link').length,first:rows[0].memo.status};
 }),{rows:3,date:0,bars:3,links:4,first:'Order now'});
 eq('held board has no JavaScript errors',t.errs,[]);await t.c.close();
};
