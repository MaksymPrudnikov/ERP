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

 eq('Shipping audit browser errors',t.errs,[]);await t.c.close();
};
