/* Shipping PR 1: physical units, atomic office PS, print boundary and Net.
   Actual station scans and assemblies, not fabricated Ready statuses. */
module.exports=async function({page,eq,ok}){
 console.log('shipping');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.shSeed=function(n){oqReset();DB.carrier=[];carrierAdd('SL',2);const c=oqCustomer(),ids=[];for(let k=0;k<(n||1);k++){const id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');ids.push(id);}return ids;};
  window.shCreate=function(ids,count){const os=ids.map(salesRecord),all=os.flatMap(shippingAvailable);return shippingCreate({customerId:os[0].customerId,method:'pickup',shipTo:{},date:finToday(),items:(count==null?all:all.slice(0,count)).map(shippingItem),extras:[]});};
  window.shFail=function(fn){const proto=Storage.prototype,old=proto.setItem;proto.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Disk full');return old.call(this,k,v);};let r;try{r=fn();}finally{proto.setItem=old;}return r;};
  window.print=()=>{window.shPrints=(window.shPrints||0)+1;};
 });
 eq('Ready is derived from all assembled glass; undo moves the entire unit back atomically',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),u=shippingAvailable(o)[0],rec=stationScansFor(u.pieces[0]).find(s=>s.station===shippingStations().ready),ready=shippingSummary(o).ready;
  const undo=stationUndo(rec.id,{name:'QA'});const q=shippingSummary(o);return {ready,before:u.pieces.length,undone:undo.pieces.length,status:o.status,left:q.ready,wait:u.pieces.map(p=>stationPlace(stationGlass(p)).waiting)};
 }),{ready:3,before:2,undone:2,status:'batched',left:2,wait:['SHIPR','SHIPR']});
 eq('One PS reserves units across three orders and releases them on cancellation',await t.p.evaluate(()=>{
  const ids=shSeed(3),made=shCreate(ids),s=made.value;const second=shCreate(ids),duplicate=shippingCreate({...s,id:undefined});
  const reserved=ids.map(id=>shippingAvailable(salesRecord(id)).length);shippingRevert(s.id,'cancel');return {ok:made.ok,orders:shippingOrderIds(s).length,reserved,duplicate:duplicate.ok,empty:second.ok,restored:ids.map(id=>shippingAvailable(salesRecord(id)).length)};
 }),{ok:true,orders:3,reserved:[0,0,0],duplicate:false,empty:true,restored:[3,3,3]});
 eq('Partial dispatch, out-of-order receipts and last Net date; Before survives later PS',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),a=shCreate([id],1).value;shippingMarkShipped(a.id);const partial={status:o.status,back:shippingSummary(o).back,bill:finBillingDate(o)};
  const b=shCreate([id]).value;shippingMarkShipped(b.id);const doc=JSON.stringify(shippingDocument(a));shippingMarkDelivered(b.id);const pending={status:o.status,bill:finBillingDate(o)};
  shippingScanSigned(a.number,'Receiver');const complete={status:o.status,bill:finBillingDate(o)===finToday(),due:finPaymentDue(o)===finAddDays(finToday(),30),back:shippingSummary(o).back,via:o.fulfilledVia};
  return {partial,pending,complete,same:doc===JSON.stringify(shippingDocument(a)),again:shippingScanSigned(a.number).ok};
 }),{partial:{status:'shipping',back:2,bill:''},pending:{status:'shipping',bill:''},complete:{status:'done',bill:true,due:true,back:0,via:'pickup'},same:true,again:true});
 eq('Undo receipt and dispatch remove only PS-owned scans, restore availability after cancel',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),s=shCreate([id]).value;shippingMarkShipped(s.id);shippingMarkDelivered(s.id);salesSetRecordStatus(id,'closed');const before=DB.stationScan.filter(s=>!s.undoneAt).length;
  const receipt=shippingRevert(s.id,'receipt'),noDate=!finBillingDate(o),dispatch=shippingRevert(s.id,'dispatch'),reserved=shippingAvailable(o).length;shippingRevert(s.id,'cancel');return {receipt:receipt.ok,noDate,dispatch:dispatch.ok,reserved,available:shippingAvailable(o).length,status:o.status,removed:before-DB.stationScan.filter(s=>!s.undoneAt).length};
 }),{receipt:true,noDate:true,dispatch:true,reserved:0,available:3,status:'ready',removed:6});
 eq('Storage failure rolls back PS, reservations, status, scan IDs and log together',await t.p.evaluate(()=>{
  const [id]=shSeed();let before=JSON.stringify(DB);const failed=shFail(()=>shCreate([id]));const createSame=before===JSON.stringify(DB);const s=shCreate([id]).value;before=JSON.stringify(DB);const dispatch=shFail(()=>shippingMarkShipped(s.id));return {create:failed.ok,createSame,dispatch:dispatch.ok,same:before===JSON.stringify(DB)};
 }),{create:false,createSame:true,dispatch:false,same:true});
 eq('Printed planned PS is the NCR boundary, printing does not deliver or start Net',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),s=shCreate([id],1).value,unit=s.items[0];shippingPrint(s.id);const blocked=stationBreak('SHIPR',{kind:'peek',g:stationGlass(unit.pieces[0])},{name:'QA'},ncrReasonsFor('SHIPR',{activeOnly:true})[0].id);
  const warning=ncrStageWarning(o,{where:'SHIP',lines:{[unit.lineId]:{on:true}}});return {printed:!!s.printedAt,status:s.status,order:o.status,bill:finBillingDate(o),recut:/NCR/.test(blocked.error||''),ncr:warning,ps:DB.shipment.length};
 }),{printed:true,status:'planned',order:'ready',bill:'',recut:true,ncr:'',ps:1});
 eq('Recut replaces a broken unshipped assembly after a partial shipment',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),first=shCreate([id],1).value;shippingMarkShipped(first.id);shippingMarkDelivered(first.id);
  const broken=shippingAvailable(o)[0],g=stationGlass(broken.pieces[0]),r=stationBreak('SHIPR',{kind:'peek',g},{name:'QA'},ncrReasonsFor('SHIPR',{activeOnly:true})[0].id);
  const b=glassBatchAssign(glassBatchRows([o]),{}),kept=o.status;oqReady(id);const last=shCreate([id]).value;
  const includes=last.items.some(i=>i.pieces.some(p=>r.allNew.includes(p)));shippingMarkShipped(last.id);shippingMarkDelivered(last.id);return {recut:r.ok,batch:!!b,kept,includes,status:o.status,back:shippingSummary(o).back,qty:o.lines[0].qty};
 }),{recut:true,batch:true,kept:'shipping',includes:true,status:'done',back:0,qty:2});
 eq('Stock-only Verify is Ready; the final stock receipt also gates Net',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),o=normalizeSalesOrder({id:'SO-STOCK',businessNumber:'ST1',customerId:c.id,status:'new',lines:[],extraItems:[{id:'EXT-1',table:'stockItem',itemId:'X',qty:2,priceOverride:20}]});DB.salesOrder.push(o);salesSetRecordStatus(o.id,'verified');const ready=o.status;
  const make=()=>shippingCreate({customerId:c.id,method:'pickup',shipTo:{},date:finToday(),items:[],extras:[{orderId:o.id,extraId:'EXT-1',qty:1}]}).value;
  const a=make();shippingMarkShipped(a.id);shippingMarkDelivered(a.id);const partial=[o.status,finBillingDate(o),shippingSummary(o).back];const b=make();shippingMarkShipped(b.id);shippingMarkDelivered(b.id);return {ready,partial,done:o.status,billed:finBillingDate(o)===finToday()};
 }),{ready:'ready',partial:['shipping','',1],done:'done',billed:true});
 eq('Cash debt is checked separately at create and every print; Back writes nothing',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id);finSaveTerms(id,{paymentMode:'cash',depositPercent:50,creditDays:null,issuedOn:'',dueOn:''},'');tab='shipping';shippingOpen(o.customerId);shippingDraft.method='pickup';shippingSave();const create=salesDialog.buttons.map(b=>b.label);oqChoose('Back');const none=DB.shipment.length;
  shippingSave();oqChoose('Create anyway');const s=DB.shipment[0];shippingPrint(s.id);const print=salesDialog.buttons.map(b=>b.label);oqChoose('Back');const noPrint=!s.printedAt;shippingPrint(s.id);oqChoose('Print anyway');const once=!!s.printedAt;shippingPrint(s.id);const again=!!salesDialog;oqChoose('Back');return {create,none,print,noPrint,once,again};
 }),{create:['Back','Create anyway','Take payment'],none:0,print:['Back','Print anyway','Take payment'],noPrint:true,once:true,again:true});
 eq('Credit Hold checks and stale confirmation prevent the entire PS',await t.p.evaluate(()=>{
  const ids=shSeed(2),o=salesRecord(ids[0]);salesFindCustomer(o.customerId).onHold=true;shippingOpen(o.customerId);shippingDraft.method='pickup';shippingSave();const title=salesDialog.title;DB.salesOrder[1].customerPo='Changed elsewhere';oqChoose('Create anyway');return {hold:title.includes('On Hold'),ps:DB.shipment.length,error:shippingNotice.error};
 }),{hold:true,ps:0,error:true});
 eq('A sent order cannot be cancelled; stale Sales cannot change customer or stock quantities on PS',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),s=shCreate([id],1).value;shippingMarkShipped(s.id);const cancelled=salesSetRecordStatus(id,'cancelled'),d=shippingClone(o);d.customerId='other';const customer=shippingSaveGuard(d,o);return {cancelled,status:o.status,guard:!!customer};
 }),{cancelled:false,status:'shipping',guard:true});
 eq('Historical done/closed without PS remains fulfilled; manual Ready recalculates from scans',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),id=oqOrder(c),o=salesRecord(id);o.status='done';o.fulfilledVia='delivery';o.statusDates.done='2026-09-01T12:00:00.000Z';const before=finBillingDate(o);normalizeShipments();const q=shippingSummary(o);const a={back:q.back,shipped:q.shipped,status:o.status,date:finBillingDate(o)===before};
  o.status='ready';normalizeShipments();return {a,ready:o.status,ps:DB.shipment.length};
 }),{a:{back:0,shipped:3,status:'done',date:true},ready:'verified',ps:0});
 eq('Ready stations come from always sequence, not SHIPR/SHIP literals',await t.p.evaluate(()=>{
  oqReset();const old=shippingClone(DB.station);DB.station.forEach(s=>{if(s.code==='SHIPR')s.code='PACK';if(s.code==='SHIP')s.code='DISPATCH';});stationRouteCache.clear();const id=oqOrder(oqCustomer());salesDraftDrop();oqThrough(id,'ready');const o=salesRecord(id),out={codes:shippingStations(),ready:shippingSummary(o).ready};DB.station=old;return out;
 }),{codes:{ready:'PACK',ship:'DISPATCH'},ready:3});
 eq('Import roundtrip preserves PS, duplicate units and malformed shipments are rejected',await t.p.evaluate(()=>{
  const [id]=shSeed(),s=shCreate([id],1).value;shippingMarkShipped(s.id);const source=shippingClone(DB),round=prepareImportedState(source);let duplicate=false,invalid=false;
  const clone=shippingClone(s);clone.id='PS-OTHER';clone.number='PS-0999';source.shipment.push(clone);try{validateShipmentPayload(source);}catch(e){duplicate=true;}
  try{validateShipmentPayload({shipment:[{number:'oops'}]});}catch(e){invalid=true;}return {number:round.shipment[0].number,status:round.salesOrder.find(o=>o.id===id).status,duplicate,invalid};
 }),{number:'PS-0001',status:'shipping',duplicate:true,invalid:true});
 eq('Address is a snapshot, PS has quantities/barcode/signature and one Letter page per skid',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id);shippingAvailable(o).forEach(i=>i.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));const s=shCreate([id]).value;s.shipTo=shippingAddress({address1:'10 Glass St',city:'Toronto',postalCode:'A1A1A1',contact:'Pat'});const c=salesFindCustomer(o.customerId);c.addresses=[{type:'delivery',address1:'Changed address'}];
  const d=shippingDocument(s),pages=shippingPages(d),text=pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)).join(' '),skid=pages.at(-1).items.find(i=>i.t==='text'&&i.s==='SL-1');return {pages:pages.length,skid:skid.size,address:text.includes('10 Glass St'),unchanged:!text.includes('Changed address'),columns:['Ordered','Before','Now','Back order'].every(x=>text.includes(x)),signature:text.includes('Signature'),money:/\$|Subtotal|Tax|Balance due/.test(text),barcode:pages[0].items.some(i=>i.t==='rect'&&i.fill==='#000000')};
 }),{pages:2,skid:40,address:true,unchanged:true,columns:true,signature:true,money:false,barcode:true});
 eq('Editing a printed planned PS requires reprint and empty dispatch is refused',await t.p.evaluate(()=>{
  const [id]=shSeed(),s=shCreate([id],1).value;shippingPrint(s.id);const d=shippingClone(s);d.items=shippingAvailable(salesRecord(id),s.id).map(shippingItem);shippingUpdate(s.id,d);const reprint=shippingNeedsReprint(s),empty=shippingCreate({customerId:s.customerId,method:'pickup',date:finToday(),shipTo:{},items:[],extras:[]}).value;return {reprint,empty:shippingMarkShipped(empty.id).ok};
 }),{reprint:true,empty:false});
 eq('IGU and laminate use the actual cross-index assembly, not matching G indices',await t.p.evaluate(()=>{
  return ['double','laminated'].map(type=>{
   oqReset();const id=oqOrder(oqCustomer());salesOrderEdit(id);const l=soDraft.lines[0],m=salesMakeupById(soDraft,l.makeupId);soDraft.lines=[l];
   if(type==='laminated'){const pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>Object.assign(pn.laminated[k],{glassProductId:glassProductByCode('6CLEAR').id,thicknessMm:6,heatTreatmentId:'HT-FT'}));m.unitType='single';m.panes=[normalizeSalesPane(pn,0)];m.cavities=[];}
   salesOrderSave();salesDraftDrop();oqThrough(id,'batched');const o=salesRecord(id),line=o.lines[0],merge=stationUnitMerge(o,line),keys=stationLineKeys(o,line),pm=glassPieceMap(id),parts=keys.map(k=>pm.get(k).ids);
   const pair=[parts[0][1],parts[1][0]],who={name:'QA'};
   for(const piece of parts.flat()){for(let n=0;n<15;n++){const pl=stationPlace(stationGlass(piece));if(pl.waiting===merge)break;stationMove(pl.waiting,stationCheck(pl.waiting,piece),who,{});}}
   pair.forEach(piece=>stationMove(merge,stationCheck(merge,piece),who,{}));oqReady(id);
   const u=shippingAvailable(o).find(i=>i.unit===1),correct=pair.every(p=>u.pieces.includes(p)),s=shCreate([id]).value;shippingMarkShipped(s.id);shippingMarkDelivered(s.id);return {correct,qty:s.items.length,done:o.status};
  });
 }),[{correct:true,qty:2,done:'done'},{correct:true,qty:2,done:'done'}]);
 eq('A single-lite recut fills only the remaining slot after the first shipment',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];soDraft.lines=[soDraft.lines[0]];salesOrderSave();salesDraftDrop();oqThrough(id,'ready');const o=salesRecord(id),a=shCreate([id],1).value;shippingMarkShipped(a.id);shippingMarkDelivered(a.id);
  const old=shippingAvailable(o)[0],r=stationBreak(shippingStations().ready,{kind:'peek',g:stationGlass(old.label)},{name:'QA'},ncrReasonsFor('SHIPR',{activeOnly:true})[0].id);glassBatchAssign(glassBatchRows([o]),{});oqReady(id);const b=shCreate([id]).value;shippingMarkShipped(b.id);shippingMarkDelivered(b.id);return {recut:r.ok,replaced:b.items[0].label!==old.label,unique:a.items[0].unit!==b.items[0].unit,total:shippingSummary(o).delivered,status:o.status};
 }),{recut:true,replaced:true,unique:true,total:2,status:'done'});
 eq('Mixed-customer skid selection includes only that customer in the PS',await t.p.evaluate(()=>{
  const [id]=shSeed(),o=salesRecord(id),other=oqOrder(oqCustomer({legalName:'Other customer'}));salesDraftDrop();oqThrough(other,'ready');[o,salesRecord(other)].flatMap(shippingAvailable).forEach(i=>i.pieces.forEach(p=>stationScansFor(p).at(-1).on='SL-1'));
  shippingSelectSkid(o.customerId,'SL-1',true);shippingOpen(o.customerId);return {qty:shippingDraft.items.length,own:shippingDraft.items.every(i=>i.orderId===id),selected:shippingSelection.size};
 }),{qty:3,own:true,selected:3});
 eq('PS includes unselected order lines with Now zero and the remaining backorder',await t.p.evaluate(()=>{
  const [id]=shSeed(),s=shCreate([id],1).value,d=shippingDocument(s);return d.orders[0].rows.map(r=>[r.ordered,r.before,r.now,r.back]);
 }),[[2,0,1,1],[1,0,0,1]]);
 eq('Cancelled PS keeps its document and roundtrips after the order line is removed',await t.p.evaluate(()=>{
  const [id]=shSeed(),s=shCreate([id],1).value;shippingRevert(s.id,'cancel');const old=JSON.stringify(shippingDocument(s));salesRecord(id).lines=[];let valid=true;try{validateShipmentPayload(DB);}catch(e){valid=false;}return {valid,frozen:JSON.stringify(shippingDocument(s))===old};
 }),{valid:true,frozen:true});
 eq('Moving reserved glass to another skid requires reprint and refreshes the printed snapshot',await t.p.evaluate(()=>{
  const [id]=shSeed(),s=shCreate([id],1).value;shippingPrint(s.id);s.items[0].pieces.forEach(p=>stationScansFor(p).at(-1).on='SL-2');const reprint=shippingNeedsReprint(s);shippingPrint(s.id);return {reprint,skid:s.items[0].skid,current:!shippingNeedsReprint(s)};
 }),{reprint:true,skid:'SL-2',current:true});
 // Real controls: create, dispatch, receipt scan, column filter, compact viewport.
 await t.p.evaluate(()=>{const [id]=shSeed();shippingTab='ready';tab='shipping';window.shCustomer=salesRecord(id).customerId;render();});
 await t.p.locator('[data-create-ps]').click();await t.p.getByLabel('Method',{exact:true}).selectOption('pickup');await t.p.locator('[data-save-ps]').click();
 await t.p.getByRole('button',{name:'Shipped',exact:true}).click();await t.p.locator('[data-signed-ps]').fill('PS-0001');await t.p.locator('[data-signed-ps]').press('Enter');
 eq('Office controls create, ship and scan the signed PS; scan focus returns',await t.p.evaluate(()=>({status:DB.shipment[0].status,order:DB.salesOrder[0].status,focus:document.activeElement.id})),{status:'delivered',order:'done',focus:'shippingSigned'});
 await t.p.getByRole('button',{name:'Filter Customer',exact:true}).click();ok('Shipment column filter opens',await t.p.locator('.sl-menu').count()>0);await t.p.evaluate(()=>{salesListMenu=null;render();});
 await t.p.setViewportSize({width:390,height:844});eq('Shipping fits the narrow viewport',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 eq('Shipping browser errors',t.errs,[]);await t.c.close();
};
