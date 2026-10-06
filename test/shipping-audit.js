/* Аудит Shipping 6.10.2026 (Codex F1–F8 + Claude Д1–Д6). PR 1: выбор
   заказов в PS, Hold на любой станции, отменённый юнит на скиде, стекло,
   которое забирает клиент. Заказ — одна строка двойных IGU на N юнитов. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-audit');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.saWho={id:'qa',name:'QA'};
  /* ready — юниты готовы и лежат на SL-1; иначе заказ в батче, стекло не резали.
     customer — второй заказ того же клиента. */
  window.saOrder=function(qty,ready,customer){
   if(!customer){oqReset();DB.carrier=[];carrierAdd('SL',3);DB.orderEvent=[];stationLast=null;stationNote='';stationQuestions=[];stationIncoming='';shippingSelection.clear();shippingNotice=null;shippingDraft=null;}
   const id=oqOrder(customer||oqCustomer({legalName:'Customer A'}));salesOrderEdit(id);soDraft.lines=soDraft.lines.slice(0,1);soDraft.lines[0].qty=qty;
   if(!salesOrderSave())throw new Error('order not saved');salesDraftDrop();oqThrough(id,ready?'ready':'batched');const o=salesRecord(id);
   if(ready)shippingAvailable(o).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
   return o;
  };
  window.saGlass=function(o){return [...stationPieceIndex()].filter(([p,h])=>h.orderId===o.id).map(([p])=>p).sort();};
  window.saPS=function(o){return shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:[]}).value;};
  window.saShip=function(){return DB.stationScan.filter(s=>!s.undoneAt&&s.station===shippingStations().ship).length;};
  window.saLogin=function(station){DB.user=DB.user.filter(u=>u.name!=='Loader');DB.user.push({name:'Loader',role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLast=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);render();};
  window.saText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():'';};
 });

 /* ---------------- F1: отмеченное ушло — другие заказы не подставляем ---------------- */
 eq('F1: the selected order went on hold — Create packing slip does not take the other order; it says so and clears the choice',await t.p.evaluate(()=>{
  const a=saOrder(1,true);saOrder(1,true,salesFindCustomer(a.customerId));
  shippingSelectOrder(a.id,true);unitHold(a.id,a.lines[0].id,1,'Customer asked to wait');tab='shipping';shippingTab='ready';render();
  document.querySelector('[data-create-ps="'+a.customerId+'"]').click();
  return {draft:!!shippingDraft,notice:saText('.shipping-notice'),selection:shippingSelection.size};
 }),{draft:false,notice:'The selected glass is no longer ready. Select again.',selection:0});
 eq('F1: part of the selection went to another packing slip — the form keeps the rest of it and says how many dropped out',await t.p.evaluate(()=>{
  const a=saOrder(2,true),b=saOrder(1,true,salesFindCustomer(a.customerId));
  shippingSelectOrder(a.id,true);const [u]=shippingAvailable(a);
  shippingCreate({customerId:a.customerId,method:'pickup',shipTo:{},date:finToday(),items:[shippingItem(u)],extras:[]});
  shippingOpen(a.customerId);
  return {orders:[...new Set(shippingDraft.items.map(i=>i.orderId===a.id?'A':i.orderId===b.id?'B':'?'))],units:shippingDraft.items.length,error:shippingDraft.error};
 }),{orders:['A'],units:1,error:'1 selected unit no longer ready.'});
 eq('F1: nothing selected — the form takes everything ready for the customer, as before',await t.p.evaluate(()=>{
  const a=saOrder(1,true);saOrder(1,true,salesFindCustomer(a.customerId));shippingOpen(a.customerId);
  return {units:shippingDraft.items.length,error:shippingDraft.error,notice:shippingNotice};
 }),{units:2,error:'',notice:null});

 /* ---------------- F3: Hold — на любой станции, без «сделано?» ---------------- */
 eq('F3: uncut glass of an order on hold at SHIPR / SHIP is HOLD (not "CUT done?"); "Yes, done" cannot write CUT…IGU; its next station still writes HOLD',await t.p.evaluate(()=>{
  const o=saOrder(2,false);o.onHold=true;o.holdReason='Credit hold';const g=saGlass(o)[0],ready=shippingStations().ready,ship=shippingStations().ship;
  const at=stationCheck(ready,g),confirm=stationConfirmSkipped(ready,g,saWho);stationCode=ready;const shipConfirm=stationShipConfirm(g,saWho);
  return {ready:[at.kind,at.reason,at.unit],ship:stationCheck(ship,g).kind,cut:stationCheck('CUT',g).kind,confirm:confirm.error,shipConfirm:shipConfirm.error,scans:stationScansFor(g).length};
 }),{ready:['held','Credit hold',false],ship:'held',cut:'hold',confirm:'Nothing to confirm.',shipConfirm:'Nothing to confirm.',scans:0});
 eq('F3: a held unit is HOLD at stations it skipped and at one it already passed; only the scan at its own next station is written',await t.p.evaluate(()=>{
  const o=saOrder(2,false);unitHold(o.id,o.lines[0].id,1,'Stop now');const g=o.lines[0].heldUnits[0].pieces[0];
  const skipped=[shippingStations().ready,shippingStations().ship].map(s=>stationCheck(s,g).kind);
  const cut=stationCheck('CUT',g),rec=stationMove('CUT',cut,saWho,{}).ok,again=stationCheck('CUT',g);
  return {skipped,cut:cut.kind,rec,again:[again.kind,again.reason,again.unit],scans:stationScansFor(g).length};
 }),{skipped:['held','held'],cut:'hold',rec:true,again:['held','Stop now',true],scans:1});
 eq('F3: SHIPR shows SET ASIDE with the reason and no "Yes, done"; SHIP shows ON HOLD; nothing is written',await t.p.evaluate(()=>{
  const o=saOrder(2,false);o.onHold=true;o.holdReason='Credit hold';const g=saGlass(o)[0];
  saLogin(shippingStations().ready);const ready=stationSubmit(g),card=saText('[data-station-result]');
  const shipr={kind:ready,held:!!document.querySelector('[data-station-result="held"]'),text:/SET ASIDE/.test(card)&&/Credit hold/.test(card),yes:!!document.querySelector('[data-station-yes]'),questions:stationQuestions.length};
  saLogin(shippingStations().ship);const ship=stationSubmit(g);
  return {shipr,ship:[ship,!!document.querySelector('[data-station-result="shipHold"]')],scans:stationScansFor(g).length};
 }),{shipr:{kind:'held',held:true,text:true,yes:false,questions:0},ship:['held',true],scans:0});
 eq('A skid with a held unit on it is not loaded: "On hold — set aside"',await t.p.evaluate(()=>{
  const o=saOrder(2,true);unitHold(o.id,o.lines[0].id,1,'Stop');saPS(o);const r=shippingLoadPlan('SL-1','');return [r.kind,r.why];
 }),['shipNotReady','hold']);

 /* ---------------- Д1: отменённый юнит на скиде ---------------- */
 eq('Cancelled unit still on the skid: SL-1 does not load (TAKE OFF); its sticker scanned at SHIP takes the IGU off; then the skid loads without it',await t.p.evaluate(()=>{
  const o=saOrder(2,true);unitCancel(o.id,o.lines[0].id,1,'Customer cancelled',{glass:'scrap',chargeOverride:0});const u=o.cancellations[0].units[0],gone=u.pieces.slice().sort().join();
  saPS(o);saLogin(shippingStations().ship);
  const first=stationSubmit('SL-1'),card=saText('[data-station-result="shipTakeOff"]'),ship=saShip();
  const off=stationSubmit(u.pieces[0]),offCard=saText('[data-station-result="cancelled"]');
  const second=stationSubmit('SL-1');
  return {first,card:/TAKE OFF/.test(card)&&/1 UNIT/.test(card)&&card.includes(o.businessNumber),ship,off,offCard:/off SL-1/.test(offCard),taken:(u.off||[]).slice().sort().join()===gone,second,loaded:saShip(),
   log:DB.orderEvent.some(e=>e.orderId===o.id&&e.what==='Taken off SL-1'),import:prepareImportedState(JSON.parse(JSON.stringify(DB))).salesOrder.find(x=>x.id===o.id).cancellations[0].units[0].off.length};
 }),{first:'shipTakeOff',card:true,ship:0,off:'cancelled',offCard:true,taken:true,second:'shipLoaded',loaded:2,log:true,import:2});
 eq('Cancelled unit taken off at SHIPR (before the truck): its scan there also clears the skid',await t.p.evaluate(()=>{
  const o=saOrder(2,true);unitCancel(o.id,o.lines[0].id,1,'Customer cancelled',{glass:'scrap',chargeOverride:0});const u=o.cancellations[0].units[0];
  saLogin(shippingStations().ready);const scan=stationSubmit(u.pieces[1]);return {scan,left:unitOnSkid('SL-1').length,off:(u.off||[]).length};
 }),{scan:'cancelled',left:0,off:2});

 /* ---------------- Д6: стекло, которое забирает клиент ---------------- */
 eq('The glass the customer takes stays on the skid and goes with it; at SHIP its sticker says SHIP IT, not STOP',await t.p.evaluate(()=>{
  const o=saOrder(2,true);unitCancel(o.id,o.lines[0].id,1,'Customer cancelled',{glass:'customer',chargeOverride:10});const u=o.cancellations[0].units[0];
  saPS(o);saLogin(shippingStations().ship);
  const scan=stationSubmit(u.pieces[0]),card=saText('[data-station-result="cancelled"]'),amber=!!document.querySelector('.st-res.st-amber[data-station-result="cancelled"]');
  const load=stationSubmit('SL-1');
  return {block:unitOnSkid('SL-1').length,scan,card:/SHIP IT/.test(card)&&!/STOP/.test(card),amber,load,off:'off' in u};
 }),{block:0,scan:'cancelled',card:true,amber:true,load:'shipLoaded',off:false});

 /* ---------------- PR 2: Hold снимает с батча, подсветка изменённых батчей, F7 ---------------- */
 await t.p.evaluate(()=>{
  /* Однокамерный заказ в своём батче с раскроем (как test/cut-batch.js). */
  window.saBatch=function(sizes){
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});const n=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanRun(n);return {o:salesRecord(id),n};
  };
  window.saFresh=function(){oqReset();DB.stationScan=[];DB.carrier=[];DB.sheetBreak=[];DB.orderEvent=[];DB.stockOffcut=[];stationLast=null;stationSheetView=null;stationIncoming='';stationQuestions=[];stationNote='';stationDrawer=null;stationMenu=null;stationTab='scan';};
  window.saItem=function(n,piece){return glassBatchFind(n).items.find(i=>i.piece===piece);};
 });
 eq('Hold units takes uncut glass off its batch; in the glass queue it is On Hold and cannot be batched; Release brings it back',await t.p.evaluate(()=>{
  saFresh();const {o,n}=saBatch([[36,24,3],[48,30,2]]),l=o.lines[1];
  unitHold(o.id,l.id,1,'Customer checks sizes');const piece=l.heldUnits[0].pieces[0],row=()=>glassBatchRows([o]).find(r=>r.piece===piece);
  const held={off:!!saItem(n,piece).releasedAt,history:glassBatchFind(n).history.slice(-1)[0].action,reason:row().reason,status:glassBatchInfo(row()).memo.status,pick:glassBatchPickable(glassBatchInfo(row()))};
  unitRelease(o.id,l.id);
  return {held,released:{reason:row().reason,status:glassBatchInfo(row()).memo.status,pick:glassBatchPickable(glassBatchInfo(row()))}};
 }),{held:{off:true,history:'On hold',reason:'Units on hold: Customer checks sizes',status:'On Hold',pick:false},released:{reason:'',status:'Waiting',pick:true}});
 eq('Batch whose layout still has cancelled and held glass: Re-optimize in Batches, Cancelled / On Hold in its contents, red on the layout; Reset → Build clears it',await t.p.evaluate(()=>{
  saFresh();const {o,n}=saBatch([[36,24,6],[48,30,4]]);
  unitCancel(o.id,o.lines[0].id,2,'Customer cancelled',{});unitHold(o.id,o.lines[1].id,1,'Customer checks sizes');
  const text=glassBatchStale(glassBatchFind(n)).text;
  tab='optimization';optimizationTab='production';glassBatchOpenNumber='';render();
  const list={pill:!!document.querySelector('[data-batch-stale]'),row:!!document.querySelector('tr.gb-stale')};
  glassBatchOpen(n);const contents={stop:[...document.querySelectorAll('tr.gb-stop .gb-state')].map(e=>e.textContent).sort(),note:!!document.querySelector('[data-batch-stale-note]')};
  glassBatchDetailTab='optimization';render();
  const layout={warning:(document.querySelector('[data-cut-stale]')||{}).textContent||'',red:document.querySelectorAll('[data-cut-gone]').length};
  cutPlanReset(n);cutPlanRun(n);glassBatchOpenNumber='';render();
  return {text,list,contents,layout:{warning:layout.warning.includes('2 cancelled · 1 on hold'),red:layout.red},after:[glassBatchStale(glassBatchFind(n)),!!document.querySelector('[data-batch-stale]')]};
 }),{text:'2 cancelled · 1 on hold',list:{pill:true,row:true},contents:{stop:['Cancelled','Cancelled','On Hold'],note:true},layout:{warning:true,red:3},after:[null,false]});
 eq('CUT: a changed batch is not opened by itself; opened, it says Don’t cut with its cancelled glass red; the batch list and Queue say changed',await t.p.evaluate(()=>{
  saFresh();const a=saBatch([[36,24,4]]),b=saBatch([[30,20,3]]);unitCancel(a.o.id,a.o.lines[0].id,1,'Customer cancelled',{});
  DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}
  stationCode='CUT';tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);render();
  const auto=stationSheetView&&stationSheetView.batch,clean=!document.querySelector('[data-station-stale]');
  stationBatchOpen(a.n);const banner=saText('[data-station-stale]'),red=document.querySelectorAll('.st-sheet-card [data-cut-gone]').length;
  const option=[...document.querySelectorAll('[data-station-batch] option')].find(x=>x.value===a.n).textContent;
  document.querySelector('[data-station-tab="queue"]').click();const queue=!!document.querySelector('[data-queue-batch="'+a.n+'"] [data-queue-stale]')&&!document.querySelector('[data-queue-batch="'+b.n+'"] [data-queue-stale]');
  return {auto:auto===b.n,clean,banner:/Don’t cut/.test(banner)&&/1 cancelled/.test(banner),red,option:/changed — wait/.test(option),queue};
 }),{auto:true,clean:true,banner:true,red:1,option:true,queue:true});
 eq('F7: glass cut after Hold costs the customer $0, but the cancel window still offers its fate and keeps the choice',await t.p.evaluate(()=>{
  const o=saOrder(2,false),l=o.lines[0];unitHold(o.id,l.id,1,'Stop');const h=l.heldUnits[0];h.at=new Date(Date.now()-60000).toISOString();
  h.pieces.forEach(piece=>stationMove('CUT',stationCheck('CUT',piece),saWho,{}));
  const plan=unitCancelPlan(o,l,1,new Date().toISOString()).units[0];
  tab='sales';salesOrderEdit(o.id);salesLineUnitsStrip(null,l.id,'cancel');
  const where=saText('[data-units-plan]'),options=[...document.querySelectorAll('.line-units-glass input')].map(x=>x.disabled?'off':'on');salesLineHoldClose();salesDraftDrop();
  const out=unitCancel(o.id,l.id,1,'Customer takes the cut glass',{glass:'customer'}).value;
  return {plan:[plan.stage,plan.now,plan.charge],where:/Cut/.test(where)&&/after hold — not charged/.test(where),options,saved:[out.charge,out.units[0].glass],takes:unitTakes(o).length};
 }),{plan:['uncut','cut',0],where:true,options:['on','on','on'],saved:[0,'customer'],takes:1});

 /* ---------------- PR 3: Loaded при разбитом, Undo пересборки, перенос дня ---------------- */
 eq('F4: a unit broken before printing does not hold back the loaded ones — Loaded ships those two, one stays on back order',await t.p.evaluate(()=>{
  const o=saOrder(3,true),s=saPS(o),u=s.items[0],ready=shippingStations().ready;
  const broken=stationBreak(ready,{kind:'peek',g:stationGlass(u.pieces[0])},saWho,ncrReasonsFor(ready,{activeOnly:true})[0].id);
  s.items.filter(i=>i.label!==u.label).forEach(i=>shippingLoad(i.pieces[0],s.id,saWho));
  const out=shippingMarkShipped(s.id,'loaded'),ps=shippingFind(s.id);
  return {broken:!!broken.ok,ok:out.ok,error:out.error||'',items:ps.items.length,status:ps.status,back:shippingSummary(o).back};
 }),{broken:true,ok:true,error:'',items:2,status:'shipped',back:1});
 eq('F5: a unit of a planned packing slip moved to another skid at SHIPR — Undo puts it back; its first Ready scan still cannot be undone',await t.p.evaluate(()=>{
  const o=saOrder(2,true),s=saPS(o),u=shippingUnits(o)[0],ready=shippingStations().ready;saLogin(ready);
  stationSubmit('SL-2');const moved=stationSubmit(u.pieces[0]);
  document.querySelector('[data-station-move-undo]').click();const note=stationNote,skid=shippingUnits(o).find(x=>x.label===u.label).skid;
  const first=stationScansFor(u.pieces[0]).filter(x=>x.station===ready)[0];
  return {moved,note,skid,ps:shippingFind(s.id).status,first:stationUndo(first.id,saWho).error};
 }),{moved:'shipMoved',note:'Scan undone',skid:'SL-1',ps:'planned',first:'Glass is on a packing slip. Undo or cancel that packing slip first.'});
 eq('F6: a packing slip moved to another day stays on its truck as the last stop, with that day’s driver and no departure time; Pickup takes it off the truck',await t.p.evaluate(()=>{
  const o=saOrder(3,true),[a,b,c]=shippingAvailable(o),today=finToday(),tomorrow=finAddDays(today,1);
  const mk=(u,date)=>shippingCreate({customerId:o.customerId,method:'delivery',shipTo:{address1:'1 Main St'},date,items:[shippingItem(u)],extras:[]}).value.id;
  const s1=mk(a,today),s2=mk(b,tomorrow),s3=mk(c,today),truck=truckAdd('Truck A').value.id,name=id=>id===s1?'s1':id===s2?'s2':'s3';
  DB.user.push({name:'Mike'},{name:'Tom'});normalizeUsers();const mike=DB.user.find(u=>u.name==='Mike').viewProfileId,tom=DB.user.find(u=>u.name==='Tom').viewProfileId;
  [s1,s3,s2].forEach(id=>deliveryAssign(id,truck));deliverySetDriver(today,truck,mike);deliverySetDriver(tomorrow,truck,tom);deliverySetTime(s1,'08:00');
  const day=d=>deliveryStops(d,truck).map(s=>name(s.id)+':'+s.stop);
  const moved=shippingUpdate(s1,Object.assign(shippingClone(shippingFind(s1)),{date:tomorrow})).ok,one=shippingFind(s1);
  const after={today:day(today),tomorrow:day(tomorrow),driver:one.driverId===tom,depart:'departAt' in one};
  const pickup=shippingUpdate(s3,Object.assign(shippingClone(shippingFind(s3)),{method:'pickup'})).ok,three=shippingFind(s3);
  return {moved,after,pickup:[pickup,'truckId' in three,'stop' in three,day(today).length]};
 }),{moved:true,after:{today:['s3:1'],tomorrow:['s2:1','s1:2'],driver:true,depart:false},pickup:[true,false,false,0]});

 /* ---------------- PR 4: отмена на бумаге, поиск, стекло клиента, всё отменено ---------------- */
 eq('F2: the cancelled unit is on the packing slip — Ordered 3 · Now 2 · Back order 0 and "1 unit cancelled · scrapped at your request" under the line, on paper and on the card',await t.p.evaluate(()=>{
  const o=saOrder(3,true),l=o.lines[0];unitCancel(o.id,l.id,1,'Customer cancelled',{glass:'scrap',chargeOverride:0});
  const s=saPS(o),d=shippingDocument(s),r=d.orders[0].rows[0],paper=shippingPages(d).flatMap(p=>p.items).filter(x=>x.t==='text').map(x=>x.s);
  tab='shipping';shippingTab='shipments';shippingOpenId=s.id;render();
  return {row:[r.ordered,r.now,r.back,r.note],state:d.orders[0].state,paper:paper.includes('1 unit cancelled · scrapped at your request'),card:saText('[data-ps-cancel-note]')};
 }),{row:[3,2,0,'1 unit cancelled · scrapped at your request'],state:'complete',paper:true,card:'1 unit cancelled · scrapped at your request'});
 eq('F2: different fates of cancelled units are counted under the line',await t.p.evaluate(()=>{
  const o=saOrder(4,true),l=o.lines[0];unitCancel(o.id,l.id,1,'Not needed',{glass:'scrap',chargeOverride:0});unitCancel(o.id,l.id,1,'Customer takes it',{glass:'customer',chargeOverride:0});
  const s=saPS(o);return shippingDocument(s).orders[0].rows[0].note;
 }),'2 units cancelled: 1 scrapped at your request, 1 glass goes with this packing slip');
 eq('F8: the order card at the counter does not count cancelled glass as still in the shop',await t.p.evaluate(()=>{
  const o=saOrder(3,false);unitCancel(o.id,o.lines[0].id,2,'No longer needed',{});
  const m=shippingWithCtx(()=>shippingLookupModel(o));return {left:m.q.ordered,shop:m.shop.reduce((n,[k,c])=>n+c,0),toBatch:m.shop.some(([k])=>k==='To batch')};
 }),{left:1,shop:2,toBatch:false});
 eq('Д2: a packing slip only for the glass the customer takes — from Ready and at the counter',await t.p.evaluate(()=>{
  const o=saOrder(2,true),l=o.lines[0],[u]=shippingAvailable(o);
  const s1=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{},date:finToday(),items:[shippingItem(u)],extras:[]}).value;shippingMarkShipped(s1.id);shippingMarkDelivered(s1.id,'Client');
  unitCancel(o.id,l.id,1,'Customer changed the design',{glass:'customer',chargeOverride:10});
  tab='shipping';shippingTab='ready';shippingSelection.clear();render();
  const ready={listed:shippingReadyOrders().includes(o),row:!!document.querySelector('[data-ready-takes]'),status:o.status};
  shippingSelectOrder(o.id,true);shippingOpen(o.customerId);
  const draft={items:shippingDraft.items.length,takes:shippingDraft.takes,shown:!!document.querySelector('[data-draft-takes]')};
  const counter=shippingWithCtx(()=>shippingLookupModel(o)).takes.length;
  const s2=shippingCreate(shippingDraft).value;shippingDraft=null;
  const sent=shippingMarkShipped(s2.id),doc=shippingFind(s2.id).document;
  return {ready,draft:[draft.items,draft.takes.length===1&&draft.takes[0]===o.id,draft.shown],counter,sent:sent.ok,takesOnPaper:doc.orders[0].takes.length,left:unitTakes(o).length,taken:o.cancellations[0].units[0].takenPs===s2.id,
   import:prepareImportedState(JSON.parse(JSON.stringify(DB))).shipment.find(x=>x.id===s2.id).takes.length};
 }),{ready:{listed:true,row:true,status:'done'},draft:[0,true,true],counter:1,sent:true,takesOnPaper:1,left:0,taken:true,import:1});
 eq('Д3: every unit cancelled — at $0 the order is Cancelled; with a charge it is Closed that day and the bill is dated that day',await t.p.evaluate(()=>{
  const free=saOrder(2,false);unitCancel(free.id,free.lines[0].id,2,'Project cancelled',{});const a=[free.status,!!free.statusDates.cancelled];
  const paid=saOrder(2,true);unitCancel(paid.id,paid.lines[0].id,2,'Project cancelled',{glass:'scrap',chargeOverride:50});
  tab='sales';salesOrderEdit(paid.id);render();const step=saText('[data-step="done"]');salesDraftDrop();
  return {free:a,paid:[paid.status,finBillingDate(paid)===finToday(),finOrderBalance(paid).balance>0,/Units cancelled/.test(step)]};
 }),{free:['cancelled',true],paid:['closed',true,true,true]});

 /* ---------------- Аудит проделанной работы (6.10): A, B, C, E, F, P ---------------- */
 eq('A: a packing slip with only the glass the customer takes, received later, does not move the order’s billing date',await t.p.evaluate(()=>{
  const id=saOrder(3,true).id,[u1,u2]=shippingAvailable(salesRecord(id)),cust=salesRecord(id).customerId;
  const s1=shippingCreate({customerId:cust,method:'pickup',shipTo:{},date:finToday(),items:[u1,u2].map(shippingItem),extras:[]}).value;shippingMarkShipped(s1.id);shippingMarkDelivered(s1.id,'Client');
  shippingFind(s1.id).deliveredAt='2026-10-01T12:00:00.000Z';
  unitCancel(id,salesRecord(id).lines[0].id,1,'Customer changed one',{glass:'customer',chargeOverride:10});const before=finBillingDate(salesRecord(id));
  const s2=shippingCreate({customerId:cust,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:[],extras:[],takes:[id]}).value;shippingMarkShipped(s2.id);shippingMarkDelivered(s2.id,'Client');
  return [before,finBillingDate(salesRecord(id)),salesRecord(id).fulfilledVia];
 }),['2026-10-01','2026-10-01','pickup']);
 eq('B: two packing slips of one order both carry the glass the customer takes — the first takes it, the second still ships',await t.p.evaluate(()=>{
  const id=saOrder(3,true).id,cust=salesRecord(id).customerId;unitCancel(id,salesRecord(id).lines[0].id,1,'Customer changed one',{glass:'customer',chargeOverride:10});
  const [u1,u2]=shippingAvailable(salesRecord(id)),open=u=>{shippingSelection.clear();shippingSelect(cust,[u.label],true);shippingOpen(cust);const s=shippingCreate(shippingDraft).value;shippingDraft=null;return s;};
  const a=open(u1),b=open(u2),both=[!!a.takes,!!b.takes],first=shippingMarkShipped(a.id),second=shippingMarkShipped(b.id);
  return {both,first:first.ok,second:second.ok||second.error,takesLeftOnB:'takes' in shippingFind(b.id),takenBy:salesRecord(id).cancellations[0].units[0].takenPs===a.id};
 }),{both:[true,true],first:true,second:true,takesLeftOnB:false,takenBy:true});
 eq('C: Empty SL-1 also clears cancelled glass nobody scanned off — the skid loads again',await t.p.evaluate(()=>{
  const id=saOrder(2,true).id;unitCancel(id,salesRecord(id).lines[0].id,1,'Not needed',{glass:'scrap',chargeOverride:0});
  const blocked=shippingLoadPlan('SL-1','').kind,out=carrierEmpty('SL-1');
  return {blocked,count:out.count,left:unitOnSkid('SL-1').length,off:salesRecord(id).cancellations[0].units[0].off.length};
 }),{blocked:'shipTakeOff',count:4,left:0,off:2});
 eq('E: the order card at the counter shows held glass as On hold, not To batch',await t.p.evaluate(()=>{
  const id=saOrder(2,false).id;unitHold(id,salesRecord(id).lines[0].id,1,'Stop');return shippingWithCtx(()=>shippingLookupModel(salesRecord(id))).shop;
 }),[['On hold',2],['CUT',2]]);
 eq('F: the printed layout of a changed batch says Changed — don’t cut and shows the cancelled glass red',await t.p.evaluate(()=>{
  saFresh();const {o,n}=saBatch([[36,24,4]]);unitCancel(o.id,o.lines[0].id,1,'Customer cancelled',{});
  cutPrintLayouts(n);const host=document.getElementById('cutPrintHost'),out={stale:!!host.querySelector('[data-print-stale]'),red:host.querySelectorAll('[data-cut-gone]').length};cutPrintCleanup();return out;
 }),{stale:true,red:1});
 eq('P: a held ready unit is moved to another skid at SHIPR, so its old skid can load',await t.p.evaluate(()=>{
  const id=saOrder(3,true).id,l=salesRecord(id).lines[0];
  shippingCreate({customerId:salesRecord(id).customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:[],extras:[]});
  unitHold(id,l.id,1,'Customer asked to wait');const g=salesRecord(id).lines[0].heldUnits[0].pieces[0],before=shippingLoadPlan('SL-1','').kind;
  saLogin(shippingStations().ready);stationSubmit('SL-3');const moved=stationSubmit(g);
  return {before,moved,skid:unitPieceSkid(g),after:shippingLoadPlan('SL-1','').kind};
 }),{before:'shipNotReady',moved:'shipMoved',skid:'SL-3',after:'ok'});

 eq('Shipping audit browser errors',t.errs,[]);await t.c.close();
};
