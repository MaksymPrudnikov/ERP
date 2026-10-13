/* Receiving facts remain separate from purchasing intent, stock and
   customer money. Excess and damage are warnings, not blocked commands. */
module.exports=async function({page,eq}){
 console.log('purchase receiving');const t=await page(undefined,{width:1440,height:1000});
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await t.p.evaluate(()=>{
  DB.purchaseOrder=[];DB.purchaseOrderSeq=0;DB.purchaseReceipt=[];DB.purchaseReceiptSeq=0;DB.purchaseDeliveryRequest=[];DB.purchaseDeliveryRequestSeq=0;DB.purchasingEvent=[];
  window.prPO=purOrderSave({supplierName:'Glass warehouse',date:'2026-10-13',expectedDate:'2026-10-20',lines:[{id:'sheets',description:'6mm clear',unit:'sheet',qty:10,widthIn:144,heightIn:102,price:2,priceUnit:'sqft'},{id:'held',description:'6mm clear',unit:'block',qty:40,widthIn:130,heightIn:96,sheetsPerBlock:16,held:true}]}).value;
  window.prOther=JSON.stringify({receipt:DB.receipt,glassSheet:DB.glassSheet,offcut:DB.stockOffcut,batches:DB.glassBatch,scan:DB.stationScan});
  window.prSave=(qty,extra)=>purFulfilSave('receipt',{poId:prPO.id,supplierName:prPO.supplierName,date:'2026-10-13',receivedBy:'Alex at receiving',packingSlip:'N-701',lines:[Object.assign({id:salesUid('RL'),poLineId:'sheets',description:'6mm clear',qty,unit:'sheet',widthIn:144,heightIn:102},extra||{})]});
 });
 eq('partial receipt includes damaged glass, leaves a backorder and records reason/resolution',await t.p.evaluate(()=>{
  const r=prSave(4,{damaged:1,reason:'Factory defect',resolution:'Credit requested',note:'Scratch on one sheet'});window.prReceipt=r.value.id;
  const b=purReceived(prPO,prPO.lines[0]);return {ok:r.ok,number:r.value.number,received:b.received,remaining:b.remaining,damaged:b.damaged,status:purOrderStatus(prPO),reason:r.value.lines[0].reason,who:r.value.receivedBy,backorder:purWaitingRows(false).map(x=>x.b.remaining)};
 }),{ok:true,number:'GR-0001',received:4,remaining:6,damaged:1,status:'Partially received',reason:'Factory defect',who:'Alex at receiving',backorder:[6]});
 eq('overdelivery and even damage exceeding the count are recorded with warnings',await t.p.evaluate(()=>{
  const raw={poId:prPO.id,lines:[{id:'excess',poLineId:'sheets',unit:'sheet',qty:8,damaged:9}]},warnings=purFulfilWarnings('receipt',raw),r=purFulfilSave('receipt',raw);window.prExcess=r.value.id;
  return {ok:r.ok,over:warnings.some(s=>s.includes('more than ordered')),damage:warnings.some(s=>s.includes('damaged quantity')),remaining:purReceived(prPO,prPO.lines[0]).remaining};
 }),{ok:true,over:true,damage:true,remaining:-2});
 eq('undo and restore keep both audit trails and recalculate the same PO balance',await t.p.evaluate(()=>{
  const r=purFulfilFind('receipt',prExcess);purFulfilUndo('receipt',r.id,r.rev,false);const undone=purReceived(prPO,prPO.lines[0]).remaining;
  purFulfilUndo('receipt',r.id,r.rev,true);return {undone,restored:purReceived(prPO,prPO.lines[0]).remaining,history:purHistory('receipt',r.id).map(e=>e.what),po:purHistory('po',prPO.id).some(e=>e.what==='Undone GR-0002')};
 }),{undone:6,restored:-2,history:['Restored','Undone','Created'],po:true});
 eq('one-off wrong items and a receipt without any PO or supplier are allowed',await t.p.evaluate(()=>{
  const a=purFulfilSave('receipt',{lines:[{id:'free',description:'Unexpected sealant',qty:3,unit:'carton'}]}),b=purFulfilSave('receipt',{poId:prPO.id,lines:[{id:'wrong',description:'Wrong size from truck',qty:2,unit:'sheet',widthIn:72,heightIn:96}]});
  return {ok:a.ok&&b.ok,supplier:a.value.supplierName,po:a.value.poId,backorderUnchanged:purReceived(prPO,prPO.lines[0]).remaining};
 }),{ok:true,supplier:'',po:'',backorderUnchanged:-2});
 eq('held purchases keep variable actual sheet counts and dimensions for each delivery',await t.p.evaluate(()=>{
  const save=(qty,sheets,w,h)=>purFulfilSave('receipt',{poId:prPO.id,lines:[{id:salesUid('RL'),poLineId:'held',unit:'block',qty,actualSheets:sheets,widthIn:w,heightIn:h,damagedSheets:1,reason:'Our breakage',resolution:'Written off'}]});
  const a=save(5,78,130,96),b=save(7,91,144,102),n=purReceived(prPO,prPO.lines[1]);
  return {ok:a.ok&&b.ok,received:n.received,remaining:n.remaining,sheets:n.sheets,damaged:n.damagedSheets,sizes:n.rows.map(x=>[x.l.widthIn,x.l.heightIn]),warn:purFulfilWarnings('receipt',b.value).some(s=>s.includes('sheet size differs')),supplySame:prOther===JSON.stringify({receipt:DB.receipt,glassSheet:DB.glassSheet,offcut:DB.stockOffcut,batches:DB.glassBatch,scan:DB.stationScan})};
 }),{ok:true,received:12,remaining:28,sheets:169,damaged:2,sizes:[[130,96],[144,102]],warn:true,supplySame:true});
 eq('requesting five blocks does not reduce held balance; receiving two against it does',await t.p.evaluate(()=>{
  const d=purFulfilFromPO('request',prPO.id);d.lines[0].qty=5;d.expectedDate='2026-10-20';d.to='cover@example.test';d.cc='accounting@example.test';const request=purFulfilSave('request',d).value;window.prRequest=request.id;
  const before=purReceived(prPO,prPO.lines[1]).remaining,r=purFulfilFromPO('receipt',prPO.id,request.id);r.lines[0].qty=2;r.lines[0].actualSheets=31;purFulfilSave('receipt',r);
  return {before,after:purReceived(prPO,prPO.lines[1]).remaining,status:purFulfilStatus('request',request),open:purFulfilFromPO('receipt',prPO.id,request.id).lines[0].qty,linked:DB.purchaseReceipt.at(-1).requestId===request.id};
 }),{before:28,after:26,status:'Partially received',open:3,linked:true});
 eq('request PDF uses DR number, PO reference and requested quantity; Gmail keeps To and CC',await t.p.evaluate(()=>{
  const d=purFulfilFind('request',prRequest),texts=purRequestPages(d).flatMap(p=>p.items).filter(x=>x.t==='text').map(x=>x.s),url=new URL(purRequestGmailURL(d));
  return {title:texts.includes('DELIVERY REQUEST'),number:texts.includes('DR-0001'),po:texts.includes('For PO-0001'),qty:texts.includes('5 block'),noMoney:!texts.includes('PRICE')&&!texts.includes('AMOUNT'),to:url.searchParams.get('to'),cc:url.searchParams.get('cc')};
 }),{title:true,number:true,po:true,qty:true,noMoney:true,to:'cover@example.test',cc:'accounting@example.test'});
 eq('delivery request email preparation is logged separately from Sent, and cancellation is reversible',await t.p.evaluate(()=>{
  tab='purchasing';purFulfilEdit('request',prRequest);purRequestPreviewOpen();
  const open=window.open,download=docDownload;let bytes=0;window.open=()=>({});docDownload=(file,data)=>{bytes=data.length;};
  try{purRequestDocAction('email');}finally{window.open=open;docDownload=download;}
  const d=purFulfilFind('request',prRequest),notSent=!d.sentAt,prepared=purHistory('request',d.id).some(e=>e.what==='Email prepared');
  purRequestSentForm();const sent=!!purFulfilFind('request',prRequest).sentAt,r=purFulfilFind('request',prRequest);purFulfilUndo('request',r.id,r.rev,false);const cancelled=purFulfilStatus('request',r);purFulfilUndo('request',r.id,r.rev,true);
  purFulfilDraft=null;purFulfilPreview=false;return {pdf:bytes>500,notSent,prepared,sent,cancelled,restored:purFulfilStatus('request',r)};
 }),{pdf:true,notSent:true,prepared:true,sent:true,cancelled:'Cancelled',restored:'Partially received'});
 eq('split rows warn on their combined excess and an unknown PO quantity remains unknown',await t.p.evaluate(()=>{
  const d={poId:prPO.id,lines:[{poLineId:'held',qty:14,unit:'block'},{poLineId:'held',qty:14,unit:'block'}]},warn=purFulfilWarnings('receipt',d).some(x=>x.includes('more than ordered'));
  const p=purOrderSave({lines:[{id:'unknown',description:'Await count',qty:null,unit:'block'}]}).value,r=purFulfilFromPO('receipt',p.id);
  return {warn,qty:r.lines[0].qty,remaining:purReceived(p,p.lines[0]).remaining};
 }),{warn:true,qty:null,remaining:null});
 eq('a fully delivered PO gets Received automatically; undo returns it to partial',await t.p.evaluate(()=>{
  const d=purFulfilFromPO('receipt',prPO.id);d.lines=d.lines.filter(l=>l.poLineId==='held');const r=purFulfilSave('receipt',d).value,full=purOrderStatus(prPO);purFulfilUndo('receipt',r.id,r.rev,false);
  return {full,partial:purOrderStatus(prPO)};
 }),{full:'Received',partial:'Partially received'});
 eq('PO edits and removing a line after receipt preserve received facts and show the orphaned link',await t.p.evaluate(()=>{
  const draft=purClone(purOrderFind(prPO.id));draft.lines[0].qty=20;let saved=purOrderSave(draft).value;
  const balance=purReceived(saved,saved.lines[0]).remaining;saved.lines=saved.lines.filter(l=>l.id!=='sheets');purOrderSave(saved);
  const r=purFulfilFind('receipt',prReceipt);return {balance,preserved:r.lines[0].qty,warning:purFulfilWarnings('receipt',r).some(x=>x.includes('line no longer exists')),audit:purHistory('po',prPO.id).some(e=>e.what==='Edited')};
 }),{balance:8,preserved:4,warning:true,audit:true});
 eq('closed or deleted POs still accept facts; deleting them keeps receipts and requests',await t.p.evaluate(()=>{
  let p=purOrderFind(prPO.id);p=purOrderSave(Object.assign(purClone(p),{state:'closed'})).value;const closed=purFulfilWarnings('receipt',{poId:p.id,lines:[]}).some(x=>x.includes('closed'));
  purOrderDelete(p.id,p.rev);const r=purFulfilSave('receipt',{poId:p.id,lines:[{id:'late',poLineId:'held',qty:1,unit:'block'}]});
  return {closed,ok:r.ok,request:!!purFulfilFind('request',prRequest),oldReceipt:!!purFulfilFind('receipt',prReceipt),deleted:purFulfilWarnings('receipt',r.value).some(x=>x.includes('deleted'))};
 }),{closed:true,ok:true,request:true,oldReceipt:true,deleted:true});
 eq('changed units are flagged rather than silently added to received totals',await t.p.evaluate(()=>{
  purOrderRestore(prPO.id);const p=purOrderFind(prPO.id);p.state='sent';const l=p.lines[0],before=purReceived(p,l).received;
  const d={poId:p.id,lines:[{id:'different-unit',poLineId:l.id,qty:50,unit:'sheet',actualSheets:50}]};purFulfilSave('receipt',d);const b=purReceived(p,l);
  return {before,after:b.received,review:b.unknown,warning:purFulfilWarnings('receipt',d).some(x=>x.includes('unit differs')),status:purOrderStatus(p)};
 }),{before:15,after:15,review:true,warning:true,status:'Partially received'});
 eq('failed receiving storage rolls back quantity, history and sequence, and stale edits are refused',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),set=Storage.prototype.setItem;let r;
  Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Quota test');return set.call(this,k,v);};try{r=purFulfilSave('receipt',{lines:[{id:'fail',qty:1}]});}finally{Storage.prototype.setItem=set;}
  const same=JSON.stringify(DB)===before,d=purClone(purFulfilFind('receipt',prReceipt));purFulfilSave('receipt',Object.assign({},d,{note:'Updated'}));const stale=purFulfilSave('receipt',Object.assign({},d,{note:'Old'}));
  return {refused:!r.ok,same,stale:!stale.ok,kept:purFulfilFind('receipt',prReceipt).note};
 }),{refused:true,same:true,stale:true,kept:'Updated'});
 eq('export/import keeps receipts, actual sizes, requests, undo flags and audit history',await t.p.evaluate(()=>{
  const e=prepareImportedState(storageExportEnvelope()),canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;return ['purchaseReceipt','purchaseDeliveryRequest','purchaseReceiptSeq','purchaseDeliveryRequestSeq','purchasingEvent'].every(k=>JSON.stringify(canonical(e[k]))===JSON.stringify(canonical(DB[k])));
 }),true);
 eq('invalid receipt imports are rejected without changing the current database',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),r=purClone(DB.purchaseReceipt[0]),cases=[[r,r],[Object.assign({},r,{lines:[null]})],[Object.assign({},r,{lines:[{id:'bad',qty:-1}]})]];
  return {rejected:cases.map(purchaseReceipt=>{try{prepareImportedState({purchaseReceipt});return false;}catch(e){return true;}}),same:JSON.stringify(DB)===before};
 }),{rejected:[true,true,true],same:true});
 await t.p.evaluate(()=>{tab='purchasing';purFulfilEdit('receipt','');});
 await t.p.locator('#pur_delivery_supplierName').fill('Unplanned local shop');
 await t.p.locator('#pur_receive_0_description').fill('144 × 102 sheets from the truck');
 await t.p.locator('#pur_receive_0_qty').fill('3');await t.p.locator('#pur_receive_0_unit').fill('block');
 await t.p.locator('#pur_receive_0_widthIn').fill('144');await t.p.locator('#pur_receive_0_heightIn').fill('102');
 await t.p.locator('#pur_receive_0_actualSheets').fill('41');await t.p.locator('#pur_receive_0_damagedSheets').fill('2');
 await t.p.locator('#pur_receive_0_reason').fill('Supplier loading damage');await t.p.locator('#pur_receive_0_resolution').fill('Discuss credit next week');
 await t.p.locator('[data-pur-delivery-save]').click();
 eq('real receipt form keeps editable units, different sizes, sheet count and free damage resolution',await t.p.evaluate(()=>{const d=purFulfilDraft.data,l=d.lines[0];return {saved:!!d.id,supplier:d.supplierName,qty:l.qty,unit:l.unit,size:[l.widthIn,l.heightIn],sheets:l.actualSheets,damaged:l.damagedSheets,resolution:l.resolution};}),{saved:true,supplier:'Unplanned local shop',qty:3,unit:'block',size:[144,102],sheets:41,damaged:2,resolution:'Discuss credit next week'});
 await t.p.setViewportSize({width:390,height:844});
 eq('receiving form fits phone width',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await t.p.setViewportSize({width:1440,height:1000});
 eq('receiving, held balances and history each have independent column filters and open the right record',await t.p.evaluate(()=>{
  purGo('receipts');const a=salesListScope();salesListSetFilter('supplierName',{values:['Unplanned local shop']});const count=salesListRows(purReceivingInfos()).length;purGo('held');const b=salesListScope();purGo('history');const history=document.querySelector('.purchasing-workspace').textContent;
  purHistoryOpen('receipt',prReceipt);return {a,b,count,history:history.includes('GR-0001')&&history.includes('Receipt'),opened:purFulfilDraft.data.id===prReceipt};
 }),{a:'purchasing-receipts',b:'purchasing-held',count:1,history:true,opened:true});
 await t.p.evaluate(()=>purFulfilEdit('request',prRequest));
 await t.p.getByRole('button',{name:'Receive',exact:true}).click();
 eq('Receive from a saved request opens only its outstanding quantity with both links intact',await t.p.evaluate(()=>({kind:purFulfilDraft.kind,request:purFulfilDraft.data.requestId===prRequest,po:purFulfilDraft.data.poId===prPO.id,qty:purFulfilDraft.data.lines[0].qty,line:purFulfilDraft.data.lines[0].requestLineId===purFulfilFind('request',prRequest).lines[0].id})),{kind:'receipt',request:true,po:true,qty:3,line:true});
 eq('receiving screens have no JavaScript errors',t.errs,[]);await t.c.close();
};
