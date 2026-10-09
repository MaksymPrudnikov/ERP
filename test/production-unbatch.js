/* Reverse passage: real scans, shared PS/loading actions, actual assemblies,
   verification, repeat shipping, persistence failures and office UI. */
module.exports=async function({page,eq}){
 console.log('production-unbatch');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.puWho={name:'Unbatch tester',id:'pu'};
  window.puReset=()=>{oqReset();DB.skip=[];DB.productionUnbatch=[];DB.orderEvent=[];productionUnbatchDialog=null;stationRouteReset();};
  window.puOrder=(type='single',qty=10,customer)=>{
   const id=oqOrder(customer||oqCustomer());salesOrderEdit(id);const m=soDraft.makeups[0];
   if(type==='single'){m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];}
   soDraft.lines=[soDraft.lines[0]];soDraft.lines[0].qty=qty;if(!salesOrderSave())throw Error('Order save failed');salesDraftDrop();return id;
  };
  window.puRun=d=>productionUnbatchRun({...d,stamp:productionUnbatchStamp()});
  window.puIds=id=>[...stationPieceIndex()].filter(([,h])=>h.orderId===id).map(([id])=>id);
  window.puShip=(ids,method='pickup')=>{
   const o=salesRecord(ids[0]),items=ids.flatMap(id=>shippingAvailable(salesRecord(id))).map(shippingItem),made=shippingCreate({customerId:o.customerId,method,date:finToday(),shipTo:{address1:'Job site'},items,extras:[]});
   if(!made.ok)throw Error(made.error);if(!shippingMarkShipped(made.value.id).ok)throw Error('Dispatch failed');if(!shippingMarkDelivered(made.value.id).ok)throw Error('Receipt failed');return made.value;
  };
  window.puScan=(st,id)=>stationMove(st,stationCheck(st,id),puWho);
 });
 eq('Delivered: two of ten return to ARRIS; other eight remain issued and original PS/payment are retained',await t.p.evaluate(()=>{
  puReset();const id=puOrder();oqThrough(id,'ready');oqPay(id);const ps=puShip([id],'delivery'),o=salesRecord(id),doc=JSON.stringify(ps.document),money=JSON.stringify(DB.receipt),ids=puIds(id);
  const r=puRun({orderId:id,codes:ids.slice(0,2),target:'ARRIS@1',reason:'Wrong scans'});window.puCase={id,psId:ps.id,ids};
  return {ok:!r.error,where:ids.slice(0,2).map(id=>stationPlace(stationGlass(id)).waiting),rest:ids.slice(2).every(id=>stationPlace(stationGlass(id)).shipped),qty:shippingSummary(o).delivered,status:o.status,ps:[ps.status,ps.items.length,ps.unbatchedItems.length],original:JSON.stringify(ps.document)===doc,money:JSON.stringify(DB.receipt)===money,printed:shippingPrintedPiece(ids[0]),corrected:shippingDocument(ps).corrections.length>1};
 }),{ok:true,where:['ARRIS','ARRIS'],rest:true,qty:8,status:'shipping',ps:['delivered',8,2],original:true,money:true,printed:false,corrected:true});
 eq('Delivery and pickup: Shipping ready → previous station → Not cut preserves eight issued units at every step',await t.p.evaluate(()=>['delivery','pickup'].map(method=>{
  puReset();const id=puOrder();oqThrough(id,'ready');puShip([id],method);const pieces=puIds(id).slice(0,2),o=salesRecord(id);
  return ['SHIP@1','ARRIS@1','uncut'].map(target=>{const r=puRun({orderId:id,codes:pieces,target});return {ok:!r.error,waiting:pieces.map(p=>stationPlace(stationGlass(p)).waiting),issued:shippingSummary(o).delivered,status:o.status};});
 })),['delivery','pickup'].map(()=>[{ok:true,waiting:['SHIP','SHIP'],issued:8,status:'shipping'},{ok:true,waiting:['ARRIS','ARRIS'],issued:8,status:'shipping'},{ok:true,waiting:['CUT','CUT'],issued:8,status:'new'}]));
 eq('Not cut releases only selected glass, Verify stays required through recalculation; same G can be batched and issued again',await t.p.evaluate(()=>{
  puReset();const id=puOrder();oqThrough(id,'ready');const ps=puShip([id]),o=salesRecord(id),ids=puIds(id),before=JSON.stringify(DB.glassPiece),r=puRun({orderId:id,codes:[ids[0]],target:'uncut'});
  shippingSyncOrder(o);const initial={ok:!r.error,status:o.status,verify:o.productionUnbatchVerify,remaining:glassBatchActive(id).size,queue:glassBatchRows([o]).length,delivered:shippingSummary(o).delivered,cut:stationBatchIndex().has(ids[0])};
  const verified=salesSetRecordStatus(id,'verified'),after=[o.status,glassBatchRows([o]).length],batched=salesSetRecordStatus(id,'batched');
  const forward=skipRun({orderId:id,codes:[ids[0]],to:'pickup',date:finToday()});
  return {initial,verified,after,batched,forward:!forward.error,delivered:shippingSummary(o).delivered,status:o.status,ids:JSON.stringify(DB.glassPiece)===before,oldPS:ps.items.length};
 }),{initial:{ok:true,status:'new',verify:true,remaining:9,queue:0,delivered:9,cut:false},verified:true,after:['shipping',1],batched:true,forward:true,delivered:10,status:'done',ids:true,oldPS:9});
 eq('Closed pickup: whole IGU returns, the other actual assembly and its U label stay intact',await t.p.evaluate(()=>{
  puReset();const id=puOrder('double',2);oqThrough(id,'ready');const ps=puShip([id]);salesSetRecordStatus(id,'closed');const o=salesRecord(id),l=o.lines[0],asms=stationAsms(o,l,'IGU'),chosen=[...asms[0].lites.values()],other=[...asms[1].lites.values()],label=unitIdAt(id,l.id,asms[0].unit),keep=JSON.stringify(asms[1].recs);
  const r=puRun({orderId:id,codes:[label],target:'IGU@1'});
  return {ok:!r.error,pieces:r.pieces?.length,all:chosen.every(p=>stationPlace(stationGlass(p)).waiting==='IGU'),other:other.every(p=>stationPlace(stationGlass(p)).shipped),kept:JSON.stringify(stationAsms(o,l,'IGU').find(a=>a.complete).recs)===keep,ps:ps.items.length,closed:o.status==='closed',doneDate:!!o.statusDates.done};
 }),{ok:true,pieces:2,all:true,other:true,kept:true,ps:1,closed:false,doneDate:false});
 eq('shared skid loading and multi-order PS: one selected G never cancels the other order or the whole action',await t.p.evaluate(()=>{
  puReset();const c=oqCustomer(),a=puOrder('single',2,c),b=puOrder('single',2,c);oqThrough(a,'ready');oqThrough(b,'ready');const ids=puIds(a).concat(puIds(b)),skid=carrierAdd('SL',1).codes[0];carrierMove(ids,skid,puWho);
  const ps=shippingCreate({customerId:c.id,method:'delivery',date:finToday(),shipTo:{address1:'Site'},items:[a,b].flatMap(id=>shippingAvailable(salesRecord(id))).map(shippingItem),extras:[]}).value;
  const loaded=shippingLoad(skid,ps.id,puWho),sent=shippingMarkShipped(ps.id),received=shippingMarkDelivered(ps.id);const chosen=puIds(a)[0],others=ids.filter(p=>p!==chosen),original=JSON.stringify(ps.document);
  const r=puRun({orderId:a,codes:[chosen],target:'SHIP@1'});
  return {load:loaded.kind,sent:sent.ok,received:received.ok,ok:!r.error,where:stationPlace(stationGlass(chosen)).waiting,others:others.every(p=>stationPlace(stationGlass(p)).shipped),ps:ps.items.length,b:salesRecord(b).status,skid:skidsOut().has(skid),original:JSON.stringify(ps.document)===original,group:DB.stationScan.filter(s=>s.actionId===loaded.recId&&!s.undoneAt).length};
 }),{load:'shipLoaded',sent:true,received:true,ok:true,where:'SHIP',others:true,ps:3,b:'done',skid:true,original:true,group:3});
 eq('Skip without batch: partial Unbatch supersedes the old Undo; Skip can issue only the returned units again',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',3),o=salesRecord(id),l=o.lines[0],skip=skipRun({orderId:id,lines:{[l.id]:'all'},to:'pickup',date:finToday()}),piece=skip.pieces[0];
  const r=puRun({orderId:id,codes:[piece],target:'uncut'}),before=JSON.stringify(DB),undo=skipUndo(skip.id),same=JSON.stringify(DB)===before;
  orderLogOpen(id);const text=document.querySelector('[data-order-log]').innerText,button=!!document.querySelector('[data-skip-undo]');orderLogClose();
  const forward=skipRun({orderId:id,codes:[piece],to:'pickup',date:finToday()});
  return {ok:!r.error,undo:!!undo.error,same,partial:text.includes('Partially unbatched'),button,forward:!forward.error,delivered:shippingSummary(salesRecord(id)).delivered,ids:DB.productionUnbatch[0].pieces.length};
 }),{ok:true,undo:true,same:true,partial:true,button:false,forward:true,delivered:3,ids:1});
 eq('whole order to Not cut: PS is cancelled, no active scans/batches; history and G/U identities survive',await t.p.evaluate(()=>{
  puReset();const id=puOrder('double',2);oqThrough(id,'ready');const ps=puShip([id]),o=salesRecord(id),identities=JSON.stringify([DB.glassPiece,DB.glassUnitId]);
  const r=puRun({orderId:id,lines:{[o.lines[0].id]:'all'},target:'uncut'});
  return {ok:!r.error,ps:ps.status,live:puIds(id).flatMap(stationScansFor).length,batches:glassBatchActive(id).size,locked:salesLineLocked(o.lines[0]),status:o.status,identities:JSON.stringify([DB.glassPiece,DB.glassUnitId])===identities,history:DB.stationScan.length>0&&DB.glassBatch[0].history.at(-1).action==='Unbatched',legacy:shippingLegacy(o)};
 }),{ok:true,ps:'cancelled',live:0,batches:0,locked:false,status:'new',identities:true,history:true,legacy:false});
 eq('already earlier glass does not advance; no-op cannot record a false success',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',2);salesSetRecordStatus(id,'verified');const ids=puIds(id);puScan('CUT',ids[0]);const p=productionUnbatchPreview({orderId:id,lines:{[salesRecord(id).lines[0].id]:'all'},target:'HEAT@1'}),before=JSON.stringify(DB),r=puRun({orderId:id,codes:[ids[0]],target:'HEAT@1'});
  return {unchanged:p.unchanged.length,pieces:p.pieces.length,error:!!r.error,same:JSON.stringify(DB)===before,where:ids.map(id=>stationPlace(stationGlass(id)).waiting)};
 }),{unchanged:2,pieces:0,error:true,same:true,where:['ARRIS','CUT']});
 eq('stale preview and invalid route are atomic errors; permission is checked on the command',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',1);oqThrough(id,'ready');const d={orderId:id,codes:puIds(id),target:'ARRIS@1',stamp:productionUnbatchStamp()};salesRecord(id).notes='Changed';const before=JSON.stringify(DB),stale=productionUnbatchRun(d),route=puRun({...d,target:'IGU@1'});
  const old=window.GF_NO_SIGNIN,who=window.signinUser,on=window.signinOn;window.GF_NO_SIGNIN=false;window.signinOn=()=>true;window.signinUser=()=>({name:'Sales',access:['sales']});const denied=puRun(d),menu=salesListContextHTML({id},'').includes('data-menu="unbatch"');window.GF_NO_SIGNIN=old;window.signinUser=who;window.signinOn=on;
  return {stale:!!stale.error,route:!!route.error,denied:denied.error,menu,same:JSON.stringify(DB)===before};
 }),{stale:true,route:true,denied:'Only Users or Finance can unbatch.',menu:false,same:true});
 eq('failed write keeps dialog/selection and rolls back scans, PS, order and history together',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',1);oqThrough(id,'ready');puShip([id]);productionUnbatchOpen(id);productionUnbatchSetAll(true);const before=JSON.stringify(DB),saved=localStorage.getItem(STORAGE_KEY),old=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw Error('Full');return old.call(this,k,v);};let result;try{result=productionUnbatchConfirm();}finally{Storage.prototype.setItem=old;}
  return {result,same:JSON.stringify(DB)===before,saved:localStorage.getItem(STORAGE_KEY)===saved,open:!!productionUnbatchDialog,selected:productionUnbatchDialog.all,error:!!productionUnbatchDialog.error};
 }),{result:false,same:true,saved:true,open:true,selected:true,error:true});
 eq('JSON roundtrip keeps corrections, shipment exclusion and pending verification; malformed references fail',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',2);oqThrough(id,'ready');puShip([id]);puRun({orderId:id,codes:[puIds(id)[0]],target:'uncut'});
  const src=shippingClone(DB),next=prepareImportedState(shippingClone(src)),bad=shippingClone(src);bad.shipment[0].unbatchedItems[0].unbatchId='missing';let error='';try{prepareImportedState(bad);}catch(e){error=e.message;}
  return {same:JSON.stringify(src.productionUnbatch)===JSON.stringify(next.productionUnbatch),items:next.shipment[0].items.length,excluded:next.shipment[0].unbatchedItems.length,verify:next.salesOrder[0].productionUnbatchVerify,status:next.salesOrder[0].status,error:!!error};
 }),{same:true,items:1,excluded:1,verify:true,status:'new',error:true});
 eq('UI: Sales context opens reverse selector, preview and confirmation; there is no Unbatch Undo',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',2);oqThrough(id,'ready');puShip([id]);const menu=salesListContextHTML({id},'').includes('data-menu="unbatch"');productionUnbatchOpen(id);document.querySelector('[data-unbatch-all]').click();const text=document.querySelector('[data-production-unbatch-dialog]').innerText,ready=!document.querySelector('[data-unbatch-run]').disabled;
  document.querySelector('[data-unbatch-run]').click();orderLogOpen(id);const log=document.querySelector('[data-order-log]').innerText;
  return {menu,ready,preview:text.includes('PS-0001 (2)'),english:!/[А-яЁё]/.test(text),closed:!productionUnbatchDialog,status:salesRecord(id).status,log:log.includes('Production unbatched'),undo:!!document.querySelector('[data-production-unbatch-undo]')};
 }),{menu:true,ready:true,preview:true,english:true,closed:true,status:'new',log:true,undo:false});
 eq('LAM inside IGU: a crossed laminated pair stays together; rollback before LAM opens only that unit',await t.p.evaluate(()=>{
  puReset();const id=puOrder('double',2);salesOrderEdit(id);const m=soDraft.makeups[0];m.panes[0]=normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0);m.panes[0].priceOverride=9;['outer','inner'].forEach(k=>m.panes[0].laminated[k].heatTreatmentId='HT-FT');salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');
  const o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),pm=glassPieceMap(id),[a,b,plain]=cs.map(c=>pm.get(c.key).ids.slice());
  [a,b,plain].flat().forEach(p=>{for(let n=0;n<12;n++){const st=stationPlace(stationGlass(p)).waiting;if(st===(plain.includes(p)?'IGU':'LAM'))break;puScan(st,p);}});
  [a[0],b[1],a[1],b[0]].forEach(p=>puScan('LAM',p));skipRun({orderId:id,lines:{[l.id]:'all'},to:'pickup',date:finToday()});
  const asm=stationAsms(o,l,'IGU').find(x=>[...x.lites.values()].includes(a[0])),chosen=[...asm.lites.values()],rest=puIds(id).filter(p=>!chosen.includes(p));
  const r=puRun({orderId:id,codes:[a[0]],target:'HEAT@1'});
  return {ok:!r.error,pieces:r.pieces?.length,cross:r.pieces?.includes(b[1])&&!r.pieces?.includes(b[0]),where:chosen.map(p=>stationPlace(stationGlass(p)).waiting),other:rest.every(p=>stationPlace(stationGlass(p)).shipped),lam:stationAsms(o,l,'LAM').filter(a=>a.complete).length,igu:stationAsms(o,l,'IGU').filter(a=>a.complete).length};
 }),{ok:true,pieces:3,cross:true,where:['HEAT','HEAT','HEAT'],other:true,lam:1,igu:1});
 eq('repeated CNC: second target keeps HEAT/LAM and first CNC; first target cancels both occurrences',await t.p.evaluate(()=>{
  puReset();const keep=DB.serviceRate.filter(w=>['cncShapePolish','cncLamiPolish'].includes(w.id)).map(w=>[w,w.station]);keep.forEach(([w])=>w.station='CNC');stationRouteReset();
  const id=puOrder('single',1);salesOrderEdit(id);const l=soDraft.lines[0],m=soDraft.makeups[0],pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>{pn.laminated[k].glassProductId='GL-6CLEAR';pn.laminated[k].heatTreatmentId='HT-FT';});m.unitType='single';m.panes=[normalizeSalesPane(pn,0)];m.cavities=[];m.panes[0].priceOverride=9;
  const s=salesLineGeometryShape(l);s.edgeOps.A=[shapeNormalizeOp({type:'CNC Shape Polish'})];s.edgeOps.C=[shapeNormalizeOp({type:'CNC Shape Polish'})];s.edgeOps.B=[shapeNormalizeOp({type:'CNC Lami Polish'})];s.edgeOps.D=[shapeNormalizeOp({type:'CNC Lami Polish'})];salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');
  skipRun({orderId:id,lines:{[l.id]:'all'},to:'pickup',date:finToday()});const ids=puIds(id),p=ids[0],second=puRun({orderId:id,codes:[p],target:'CNC@2'}),one={ok:!second.error,where:stationPlace(stationGlass(p)).waiting,cnc:stationScansFor(p).filter(s=>s.station==='CNC').length,lam:stationAsms(salesRecord(id),salesRecord(id).lines[0],'LAM').filter(a=>a.complete).length};
  const first=puRun({orderId:id,codes:[p],target:'CNC@1'}),two={ok:!first.error,where:stationPlace(stationGlass(p)).waiting,cnc:stationScansFor(p).filter(s=>s.station==='CNC').length,lam:stationAsms(salesRecord(id),salesRecord(id).lines[0],'LAM').filter(a=>a.complete).length};keep.forEach(([w,st])=>w.station=st);stationRouteReset();return {one,two};
 }),{one:{ok:true,where:'CNC',cnc:1,lam:1},two:{ok:true,where:'CNC',cnc:0,lam:0}});
 eq('live Recut replacement can return; the broken original cannot be revived',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',1);oqThrough(id,'batched');const original=puIds(id)[0];puScan('CUT',original);const reason=ncrReasonsFor('ARRIS',{activeOnly:true})[0],broken=stationBreak('ARRIS',stationCheck('ARRIS',original),puWho,reason.id),replacement=recutPieces(DB.recut[0])[0];
  const forward=skipRun({orderId:id,codes:[replacement],to:'pickup',date:finToday()}),r=puRun({orderId:id,codes:[replacement],target:'uncut'}),before=JSON.stringify(DB),bad=puRun({orderId:id,codes:[original],target:'uncut'});
  return {broken:!broken.error,forward:!forward.error,ok:!r.error,original:!!stationPlace(stationGlass(original)).broken,where:stationPlace(stationGlass(replacement)).waiting,bad:!!bad.error,same:JSON.stringify(DB)===before};
 }),{broken:true,forward:true,ok:true,original:true,where:'CUT',bad:true,same:true});
 eq('Hold survives the return, and print/preview of a fully corrected PS shows the correction',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',1);oqThrough(id,'ready');const ps=puShip([id]),o=salesRecord(id);o.onHold=true;o.holdReason='Keep';o.lines[0].onHold=true;o.lines[0].holdReason='Line';
  const r=puRun({orderId:id,codes:puIds(id),target:'uncut'});shippingOpenId=ps.id;shippingPreview=true;const detail=shippingDetailHTML(),pages=shippingPrintRecord(ps.id),texts=pages.flatMap(p=>p.items).filter(i=>i.type==='text').map(i=>i.text).join(' ');
  return {ok:!r.error,hold:[o.onHold,o.lines[0].onHold],detail:detail.includes('data-ps-unbatch'),correction:shippingDocument(ps).corrections.some(s=>s.includes('0 units remain')),print:pages.length>0,status:ps.status,english:!/[А-яЁё]/.test(detail)};
 }),{ok:true,hold:[true,true],detail:true,correction:true,print:true,status:'cancelled',english:true});
 eq('code plus Whole order is deduplicated; repeating a return does not mutate history',await t.p.evaluate(()=>{
  puReset();const id=puOrder('double',2);oqThrough(id,'ready');puShip([id]);const o=salesRecord(id),l=o.lines[0],code=unitIdAt(id,l.id,1),r=puRun({orderId:id,codes:[code],lines:{[l.id]:'all'},target:'uncut'}),before=JSON.stringify(DB),again=puRun({orderId:id,lines:{[l.id]:'all'},target:'uncut'});
  return {ok:!r.error,units:r.shipments?.[0].qty,glass:r.pieces?.length,again:!!again.error,same:JSON.stringify(DB)===before,records:DB.productionUnbatch.length};
 }),{ok:true,units:2,glass:4,again:true,same:true,records:1});
 eq('Pickup → full Unbatch → Delete removes this order\'s own PS (owner, 9 Oct 2026), keeps the Unbatch journal and imports twice',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',2),o=salesRecord(id),l=o.lines[0];oqPay(id);const amount=finOrderPaid(id).paid,customer=o.customerId;
  skipRun({orderId:id,lines:{[l.id]:'all'},to:'pickup',date:finToday()});const ps=shippingForOrder(id)[0];
  puRun({orderId:id,lines:{[l.id]:'all'},target:'uncut'});const deleted=salesOrderDelete(id),one=prepareImportedState(shippingClone(DB)),two=prepareImportedState(shippingClone(one));
  const bad=shippingClone(two);bad.orderEvent=bad.orderEvent.filter(e=>e.what!=='Deleted');let rejected=false;try{prepareImportedState(bad);}catch(e){rejected=true;}
  return {deleted,gone:!salesRecord(id),ps:!shippingFind(ps.id),history:two.productionUnbatch.length,deletedEvent:two.orderEvent.some(e=>e.orderId===id&&e.what==='Deleted'),deposit:finCustomerDeposit(customer)===amount,roundtrip:two.salesOrder.length===0&&two.shipment.length===0,rejected};
 }),{deleted:true,gone:true,ps:true,history:1,deletedEvent:true,deposit:true,roundtrip:true,rejected:true});
 eq('Partial return keeps the order touched (Delete for Users, Finance, Optimization); a fully excluded order can be deleted from a shared active PS',await t.p.evaluate(()=>{
  puReset();const c=oqCustomer(),a=puOrder('single',2,c),b=puOrder('single',2,c);oqThrough(a,'ready');oqThrough(b,'ready');const ps=puShip([a,b]),ids=puIds(a);
  puRun({orderId:a,codes:[ids[0]],target:'uncut'});const blocked=salesDeleteTouched(salesRecord(a)),exists=!!salesRecord(a);
  puRun({orderId:a,codes:[ids[1]],target:'uncut'});const deleted=salesOrderDelete(a),next=prepareImportedState(shippingClone(DB));
  return {blocked,exists,deleted,other:salesRecord(b).status,issued:shippingSummary(salesRecord(b)).delivered,ps:ps.status,items:ps.items.length,imported:next.salesOrder.length===1&&next.shipment[0].unbatchedItems.length===2,print:shippingPrintRecord(ps.id).length>0};
 }),{blocked:true,exists:true,deleted:true,other:'done',issued:2,ps:'delivered',items:2,imported:true,print:true});
 eq('Failed Delete save after Unbatch retains order, payments and historical references',await t.p.evaluate(()=>{
  puReset();const id=puOrder('single',1),l=salesRecord(id).lines[0];oqPay(id);skipRun({orderId:id,lines:{[l.id]:'all'},to:'pickup',date:finToday()});puRun({orderId:id,lines:{[l.id]:'all'},target:'uncut'});
  const before=JSON.stringify(DB),saved=localStorage.getItem(STORAGE_KEY),old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw Error('Full');return old.call(this,k,v);};let deleted;try{deleted=salesOrderDelete(id);}finally{Storage.prototype.setItem=old;}
  return {deleted,same:JSON.stringify(DB)===before,saved:localStorage.getItem(STORAGE_KEY)===saved,exists:!!salesRecord(id),retry:salesOrderDelete(id)};
 }),{deleted:false,same:true,saved:true,exists:true,retry:true});
 eq('production Unbatch has no page errors',t.errs,[]);await t.c.close();
};
