/* Shipping PR 2: очередь клиента, погрузка рейса на станции отгрузки, чужое
   стекло на станции готовности, Loaded в офисе, Undo. Настоящие сканы и
   команды; заказ фикстуры — 3 готовых юнита (строки 2 + 1), по два лайта. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-loading');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.ldPrints=(window.ldPrints||0)+1;};
  window.ldWho={id:'qa',name:'QA'};
  /* 'A A B$' — три заказа: два клиента A и cash-клиент B. upTo — станция, на
     которой стекло остаётся ждать (по умолчанию готово к отгрузке). */
  window.ldSeed=function(spec,upTo){
   oqReset();DB.carrier=[];carrierAdd('SL',6);carrierAdd('DL',1);DB.orderEvent=[];stationLast=null;stationNote='';stationQuestions=[];stationIncoming='';const cs={};
   return spec.split(' ').map(k=>{
    cs[k[0]]=cs[k[0]]||oqCustomer(Object.assign({legalName:'Customer '+k[0]},k[1]==='$'?{paymentMode:'cash'}:{}));
    const id=oqOrder(cs[k[0]]);salesDraftDrop();if(upTo){oqThrough(id,'batched');ldUpTo(id,upTo);}else oqThrough(id,'ready');return id;
   });
  };
  window.ldUpTo=function(id,stop){
   const ids=[...stationPieceIndex()].filter(([p,h])=>h.orderId===id).map(([p])=>p);
   for(let pass=0;pass<20;pass++){let moved=false;
    for(const piece of ids){const g=stationGlass(piece),p=g&&stationPlace(g);if(!p||p.broken||p.assembling||!p.waiting||p.waiting===stop)continue;
     const c=stationCheck(p.waiting,piece);if(c.kind==='ok')moved=stationMove(p.waiting,c,{name:'Fixture operator'},{}).ok||moved;}
    if(!moved)break;}
  };
  /* Готовые юниты заказа (или одной его строки) лежат на скиде. */
  window.ldPut=function(id,skid,lineNo){const o=salesRecord(id);return shippingAvailable(o).filter(u=>!lineNo||o.lines.findIndex(l=>l.id===u.lineId)===lineNo-1).map(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on=skid;})).length;};
  window.ldPS=function(customerOf,ids,extra){return shippingCreate(Object.assign({customerId:salesRecord(customerOf).customerId,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:(ids||[]).flatMap(id=>shippingAvailable(salesRecord(id))).map(shippingItem),extras:[]},extra)).value;};
  window.ldShip=function(){return DB.stationScan.filter(s=>!s.undoneAt&&s.station===shippingStations().ship).length;};
  window.ldLoad=function(code,trip){const r=shippingLoad(code,trip||'',ldWho);return {kind:r.kind,ps:r.ps,units:r.units,added:r.added,opened:r.opened,take:r.take,balance:r.balance};};
  window.ldFail=function(fn){const proto=Storage.prototype,old=proto.setItem;proto.setItem=function(k,v){if(k===STORAGE_KEY)throw new Error('Disk full');return old.call(this,k,v);};let r;try{r=fn();}finally{proto.setItem=old;}return r;};
  window.ldLogin=function(station){DB.user=DB.user.filter(u=>u.name!=='Loader');DB.user.push({name:'Loader',role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLast=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);render();};
  window.ldText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
 });

 /* ------------------------------ очередь ------------------------------ */
 eq('Queue is saved on the line, reaches the open draft, is logged once and is not a line edit',await t.p.evaluate(()=>{
  const [id]=ldSeed('A'),o=salesRecord(id),l=o.lines[0];salesOrderEdit(id);
  const set=shippingQueueSet(id,[l.id],'2').ok,log=DB.orderEvent.filter(e=>e.orderId===id).map(e=>e.what+' · '+e.note).slice(-1)[0];
  const out={set,saved:l.shipQueue,draft:soDraft.lines[0].shipQueue,locked:salesLineLocked(l),violations:salesLockViolations(soDraft,o).length,log,edited:DB.orderEvent.filter(e=>e.orderId===id&&e.what==='Edited').length,
   roundtrip:normalizeSalesOrderLine(JSON.parse(JSON.stringify(l))).shipQueue,copy:'shipQueue' in salesCopySalesRecord(o,{}).lines[0],
   bad:[shippingQueueSet(id,[l.id],'1.5').ok,shippingQueueSet(id,[l.id],'-1').ok,shippingQueueSet(id,['nope'],'1').ok]};
  shippingQueueSet(id,[l.id],'');out.cleared=['shipQueue' in l,'shipQueue' in soDraft.lines[0]];salesDraftDrop();return out;
 }),{set:true,saved:2,draft:2,locked:true,violations:0,log:'Shipping queue · Queue 2 · line 1',edited:0,roundtrip:2,copy:false,bad:[false,false,false],cleared:[false,false]});

 /* ------------------------------ погрузка ----------------------------- */
 eq('First skid opens the trip: its units load in one action, the order stays Ready and the PS stays planned',await t.p.evaluate(()=>{
  const [id]=ldSeed('A');ldPut(id,'SL-1');const s=ldPS(id,[id]),o=salesRecord(id),r=ldLoad('SL-1'),st=shippingLoadState(s);
  const recs=DB.stationScan.filter(x=>!x.undoneAt&&x.station===shippingStations().ship);
  return {r,scans:recs.length,oneAction:new Set(recs.map(x=>x.actionId)).size,on:[...new Set(recs.map(x=>x.on))],status:o.status,ps:s.status,items:s.items.length,text:shippingLoadText(st),again:ldLoad('SL-1',s.id).kind,log:DB.orderEvent.filter(e=>e.what==='Loaded').map(e=>e.note)};
 }),{r:{kind:'shipLoaded',ps:'PS-0001',units:3,added:0,opened:true,balance:false},scans:6,oneAction:1,on:['SL-1'],status:'ready',ps:'planned',items:3,text:'1 skid loaded',again:'shipAlready',log:['PS-0001 · SL-1 · 3 units']});
 eq('A ready skid of the same customer is added to the open PS and a printed PS asks for a reprint',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');const s=ldPS(a,[a]);shippingPrint(s.id);const printed=!shippingNeedsReprint(s);
  ldLoad('SL-1');const r=ldLoad('SL-2',s.id);
  return {printed,r,items:s.items.length,added:s.items.filter(i=>i.added).length,reprint:shippingNeedsReprint(s),free:shippingAvailable(salesRecord(b)).length,text:shippingLoadText(shippingLoadState(s)),log:DB.orderEvent.filter(e=>e.what==='Loaded').map(e=>e.note).pop()};
 }),{printed:true,r:{kind:'shipLoaded',ps:'PS-0001',units:3,added:3,opened:false,balance:false},items:6,added:3,reprint:true,free:0,text:'2 skids loaded',log:'PS-0001 · SL-2 · 3 units · added'});
 /* Владелец, 7.10.2026: «зачем блокировать — на машину можно погрузить 3
    скида и отвезти трём разным клиентам по очереди». */
 eq('Another customer and another packing slip on the open trip load into their own PS with a notice',await t.p.evaluate(()=>{
  const [a,a2,b]=ldSeed('A A B');ldPut(a,'SL-1');ldPut(a2,'SL-2');ldPut(b,'SL-3');
  const s=ldPS(a,[a]);ldPS(a2,[a2],{shipTo:{address1:'9 Lake Rd'}});ldPS(b,[b]);ldLoad('SL-1');
  const one=r=>({kind:r.kind,ps:r.ps,other:r.switched&&r.switched.other,from:r.switched&&r.switched.from});
  return {customer:one(shippingLoad('SL-3',s.id,ldWho)),address:one(shippingLoad('SL-2',s.id,ldWho)),ship:ldShip()};
 }),{customer:{kind:'shipLoaded',ps:'PS-0003',other:true,from:'PS-0001'},address:{kind:'shipLoaded',ps:'PS-0002',other:false,from:'PS-0001'},ship:18});
 eq('No open PS, two PS for one day, and the nearest date: today first, tomorrow for evening loading, then overdue',await t.p.evaluate(()=>{
  let [a]=ldSeed('A');ldPut(a,'SL-1');const none=ldLoad('SL-1').kind;
  const late=ldPS(a,[],{date:finAddDays(finToday(),-1)}),overdue=ldLoad('SL-1').ps;stationUndo(DB.stationScan.at(-1).id,ldWho);
  const next=ldPS(a,[],{date:finAddDays(finToday(),1)}),evening=ldLoad('SL-1').ps;stationUndo(DB.stationScan.at(-1).id,ldWho);
  const today=ldPS(a,[]),now=ldLoad('SL-1').ps;stationUndo(DB.stationScan.at(-1).id,ldWho);
  ldPS(a,[],{shipTo:{address1:'9 Lake Rd'}});const two=ldLoad('SL-1').kind,picked=ldLoad('SL-1',today.id).ps;
  return {none,overdue,evening,now,two,picked,left:[late,next].map(s=>s.items.length)};
 }),{none:'shipNoPS',overdue:'PS-0001',evening:'PS-0002',now:'PS-0003',two:'shipChoose',picked:'PS-0003',left:[0,0]});
 eq('Customer queue: the skid with the smaller number goes first; no number goes after every number',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A'),o=salesRecord(a);ldPut(a,'SL-1',1);ldPut(a,'SL-2',2);ldPut(b,'SL-3');ldPS(a,[a]);
  shippingQueueSet(a,[o.lines[0].id],2);shippingQueueSet(a,[o.lines[1].id],1);const before=JSON.stringify(DB);
  const blocked=ldLoad('SL-1'),unnumbered=ldLoad('SL-3'),same=before===JSON.stringify(DB);
  return {blocked,unnumbered:[unnumbered.kind,unnumbered.take],same,order:[ldLoad('SL-2').kind,ldLoad('SL-1').kind,ldLoad('SL-3').kind],ship:ldShip()};
 }),{blocked:{kind:'shipQueue',take:'SL-2'},unnumbered:['shipQueue','SL-2'],same:true,order:['shipLoaded','shipLoaded','shipLoaded'],ship:12});
 eq('Cash order with a balance loads with a Balance due flag; paid or credit orders load without it',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A$ B');ldPut(a,'SL-1');ldPut(b,'SL-2');ldPS(a,[a]);ldPS(b,[b]);
  const due=ldLoad('SL-1'),credit=ldLoad('SL-2').balance;stationUndo(DB.stationScan.filter(s=>s.on==='SL-1').pop().id,ldWho);oqPay(a);
  return {due:[due.kind,due.balance],credit,paid:ldLoad('SL-1').balance};
 }),{due:['shipLoaded',true],credit:false,paid:false});
 eq('Skid with glass that is not ready, two customers on one skid, an empty skid: nothing is written',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A B'),o=salesRecord(a);ldPut(a,'SL-1');ldPut(b,'SL-2');ldPS(a,[]);ldPS(b,[]);
  o.lines[1].onHold=true;const held=shippingLoad('SL-1','',ldWho);o.lines[1].onHold=false;held.ids.push(held.why);
  shippingAvailable(salesRecord(b))[0].pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';});const before=JSON.stringify(DB);
  return {held:[held.kind,held.ids.length],mixed:ldLoad('SL-1').kind,empty:ldLoad('SL-4').kind,same:before===JSON.stringify(DB),ship:ldShip()};
 }),{held:['shipNotReady',3],mixed:'shipMixed',empty:'shipNothing',same:true,ship:0});
 eq('A unit without a skid loads by its glass sticker under the same rules; another customer without its own PS — ask the office',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A B'),u=shippingAvailable(salesRecord(a))[0],s=ldPS(a,[]);
  const r=shippingLoad(u.pieces[1],'',ldWho),other=ldLoad(shippingAvailable(salesRecord(b))[0].pieces[0],s.id).kind;
  return {kind:r.kind,label:r.label===u.label,units:r.units,added:r.added,ship:ldShip(),skid:s.items[0].skid,other,text:shippingLoadText(shippingLoadState(s))};
 }),{kind:'shipLoaded',label:true,units:1,added:1,ship:2,skid:'',other:'shipNoPS',text:'1 unit loaded'});
 eq('Storage failure during loading leaves scans, the PS and the log untouched',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');const s=ldPS(a,[a]),before=JSON.stringify(DB);
  const r=ldFail(()=>shippingLoad('SL-2',s.id,ldWho));return {kind:r.kind,note:!!r.note,same:before===JSON.stringify(DB)};
 }),{kind:'saveError',note:true,same:true});

 /* ------------------------------- офис -------------------------------- */
 eq('Loaded ships only what was scanned; the rest returns to Ready for the next trip',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');const s=ldPS(a,[a,b]),nothing=shippingMarkShipped(s.id,'loaded');
  shippingPrint(s.id);ldLoad('SL-1');const text=shippingLoadText(shippingLoadState(s)),out=shippingMarkShipped(s.id,'loaded');
  return {nothing:[nothing.ok,nothing.error],text,ok:out.ok,status:s.status,items:s.items.length,officeScans:s.scanIds.length,printed:s.printedItems.length,recut:shippingPrintedPiece(shippingAvailable(salesRecord(b))[0].pieces[0]),orders:[salesRecord(a).status,salesRecord(b).status],back:shippingAvailable(salesRecord(b)).length,
   log:DB.orderEvent.filter(e=>e.what==='Not loaded').map(e=>e.note),doc:shippingDocument(s).skids.map(k=>k.code),next:ldLoad('SL-2',ldPS(a,[]).id).ps};
 }),{nothing:[false,'Nothing is loaded yet.'],text:'1 skid loaded · 1 skid not loaded',ok:true,status:'shipped',items:3,officeScans:0,printed:3,recut:false,orders:['shipping','ready'],back:3,log:['PS-0001 · 3 units back to Ready'],doc:['SL-1'],next:'PS-0002'});
 eq('Without a mode the office confirms the whole PS: only units that were not scanned get manual scans',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');const s=ldPS(a,[a,b]);ldLoad('SL-1');const out=shippingMarkShipped(s.id);
  const undo=shippingRevert(s.id,'dispatch'),st=shippingLoadState(s);
  return {ok:out.ok,items:s.items.length,undo:undo.ok,status:s.status,loaded:st.loaded.length,rest:st.rest.length,ship:ldShip()};
 }),{ok:true,items:6,undo:true,status:'planned',loaded:3,rest:3,ship:6});
 eq('Loaded units cannot leave the PS: cancel and edit are refused until loading is undone',await t.p.evaluate(()=>{
  const [a]=ldSeed('A');ldPut(a,'SL-1');const s=ldPS(a,[a]);ldLoad('SL-1');
  const cancel=shippingRevert(s.id,'cancel'),edit=shippingUpdate(s.id,Object.assign(shippingClone(s),{items:s.items.slice(0,1)}));
  return {cancel:[cancel.ok,cancel.error],edit:[edit.ok,edit.error],items:s.items.length,status:s.status};
 }),{cancel:[false,'Units are loaded. Undo loading at the station first.'],edit:[false,'Loaded units cannot be removed. Undo loading at the station first.'],items:3,status:'planned'});
 eq('Undo of loading returns units to Ready: a skid added by the scan leaves the PS, an office skid stays on it',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');const s=ldPS(a,[a]);ldLoad('SL-1');ldLoad('SL-2',s.id);
  const rec=code=>DB.stationScan.filter(x=>!x.undoneAt&&x.on===code&&x.station===shippingStations().ship).pop();
  const added=stationUndo(rec('SL-2').id,ldWho),afterAdded={items:s.items.length,free:shippingAvailable(salesRecord(b)).length};
  const office=stationUndo(rec('SL-1').id,ldWho),st=shippingLoadState(s);
  return {added:added.pieces.length,afterAdded,office:office.pieces.length,items:s.items.length,loaded:st.loaded.length,ready:st.rest.every(u=>u.ready),status:s.status,order:salesRecord(a).status,ship:ldShip(),
   log:DB.orderEvent.filter(e=>e.what==='Loading undone').length,cancel:shippingRevert(s.id,'cancel').ok};
 }),{added:6,afterAdded:{items:3,free:3},office:6,items:3,loaded:0,ready:true,status:'planned',order:'ready',ship:0,log:2,cancel:true});
 eq('A shipped PS still protects its scans: station Undo is refused until the office undoes the dispatch',await t.p.evaluate(()=>{
  const [a]=ldSeed('A');ldPut(a,'SL-1');const s=ldPS(a,[a]);ldLoad('SL-1');shippingMarkShipped(s.id,'loaded');
  const rec=DB.stationScan.filter(x=>!x.undoneAt&&x.station===shippingStations().ship).pop(),refused=stationUndo(rec.id,ldWho).error;
  shippingRevert(s.id,'dispatch');return {refused,after:stationUndo(rec.id,ldWho).ok,ship:ldShip()};
 }),{refused:'Glass is on a packing slip. Undo or cancel that packing slip first.',after:true,ship:0});

 /* --------------------------- экран станции --------------------------- */
 eq('SHIP screen: the first skid opens the trip, another customer’s skid loads on its PS with a yellow notice, Undo returns the skid',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A B');ldPut(a,'SL-1');ldPut(b,'SL-2');ldPS(a,[a]);ldPS(b,[b]);ldLogin(shippingStations().ship);
  const trips=document.querySelectorAll('[data-station-trip-row]').length,noTrip=ldText('[data-station-trip]');
  const first=stationSubmit('SL-1'),head=ldText('[data-station-result="shipLoaded"] .st-res-h'),chip=ldText('[data-station-trip]'),row=ldText('[data-station-trip-row="PS-0001"]');
  const wrong=stationSubmit('SL-2'),red=ldText('[data-station-other-trip]'),ship=ldShip();
  stationSubmit('SL-1');const twice=!!document.querySelector('[data-station-result="shipAlready"]');
  stationSubmit('SL-1');const journal=[...document.querySelectorAll('[data-station-load]')].map(r=>r.dataset.stationLoad+':'+r.cells[2].textContent+':'+r.cells[4].textContent);
  document.querySelector('[data-station-load="SL-1"] button').click();const afterUndo=ldShip(),note=stationNote,card=stationLast;
  stationTripPick('');const closed=ldText('[data-station-trip]'),other=stationSubmit('SL-1');
  return {trips,noTrip,first,head:head.includes('SL-1 → PS-0001 · loaded'),chip,row:row.includes('1 skid loaded'),wrong,red,ship,twice,journal,afterUndo,note,card,closed,other,now:ldText('[data-station-trip] b')};
 }),{trips:2,noTrip:null,first:'shipLoaded',head:true,chip:'Loading PS-0001Customer A✕',row:true,wrong:'shipLoaded',red:'OTHER CUSTOMEROn PS-0002 · was loading PS-0001 · same truck',ship:12,twice:true,journal:['SL-2:PS-0002:3 units','SL-1:PS-0001:3 units'],afterUndo:6,note:'Scan undone',card:null,closed:null,other:'shipLoaded',now:'PS-0001'});
 eq('SHIP screen: Balance due line, queue refusal and the hand mark go through the trip rules',await t.p.evaluate(()=>{
  const [a]=ldSeed('A$'),o=salesRecord(a);ldPut(a,'SL-1',1);ldPS(a,[]);shippingQueueSet(a,[o.lines[1].id],1);ldLogin(shippingStations().ship);
  const loose=shippingAvailable(o).find(u=>u.lineId===o.lines[1].id),queue=stationSubmit('SL-1'),take=ldText('[data-station-result="shipQueue"] .st-res-h');
  const hand=stationMark(loose.pieces[0]),balance=ldText('[data-station-balance]'),manual=DB.stationScan.filter(x=>x.station===stationCode).every(x=>x.manual);
  return {queue,take:take.includes('Take '+loose.label+' first'),hand,balance,manual,then:stationSubmit('SL-1')};
 }),{queue:'shipQueue',take:true,hand:'shipLoaded',balance:'BALANCE DUE· office',manual:true,then:'shipLoaded'});
 eq('A unit brought to SHIP without the ready scan: Yes confirms all its glass and the trip scan loads it',await t.p.evaluate(()=>{
  const [a]=ldSeed('A',shippingStations().ready),ready=shippingStations().ready;ldPS(a,[]);ldLogin(shippingStations().ship);
  const piece=[...stationPieceIndex()].find(([p,h])=>h.orderId===a)[0],first=stationSubmit(piece),asked=!!document.querySelector('[data-station-yes]'),before=ldShip();
  stationAnswer(piece,true);const confirmed=DB.stationScan.filter(x=>!x.undoneAt&&x.station===ready&&x.confirmedAt===stationCode).length;
  return {first,asked,before,kind:stationLast.check.kind,confirmed,ship:ldShip(),note:stationNote};
 }),{first:'skipped',asked:true,before:0,kind:'shipLoaded',confirmed:2,ship:2,note:'SHIPR confirmed here'});
 eq('SHIPR: another customer on the skid warns in red and still records; the card shows queue and order readiness',await t.p.evaluate(()=>{
  const [a,b]=ldSeed('A B',shippingStations().ready),o=salesRecord(a);shippingQueueSet(a,o.lines.map(l=>l.id),3);ldLogin(shippingStations().ready);
  const pieces=id=>[...stationPieceIndex()].filter(([p,h])=>h.orderId===id).map(([p])=>p);let sound='';const beep=stationBeep;stationBeep=k=>{sound=k;};
  stationSubmit('SL-1');const own=stationSubmit(pieces(a)[0]),ownForeign=!!stationLast.foreign,ownSound=sound,queue=ldText('[data-station-queue]'),queueDark=getComputedStyle(document.querySelector('[data-station-queue]')).backgroundColor!=='rgba(0, 0, 0, 0)',count=ldText('[data-station-ready-count]');
  const mixed=stationSubmit(pieces(b)[0]),foreign=ldText('[data-station-foreign]'),red=!!document.querySelector('.st-res.st-red[data-station-result="ok"]'),on=stationLast.rec.on,noQueue=ldText('[data-station-queue]');
  stationBeep=beep;stationSubmit('SL-1');
  return {own,ownForeign,ownSound,queue,queueDark,count,mixed,foreign,red,sound,on,noQueue,skid:ldText('[data-station-skid]')===('Customer A · Customer B'+o.businessNumber+': 1 / 3 ready'+salesRecord(b).businessNumber+': 1 / 3 ready')};
 }),{own:'ok',ownForeign:false,ownSound:'ok',queue:'QUEUE 3· Customer A',queueDark:true,count:'1 / 3 units',mixed:'ok',foreign:'OTHER CUSTOMER ON SL-1· Customer A✓ Keep on SL-1',red:true,sound:'error',on:'SL-1',noQueue:null,skid:true});

 /* ---------------------------- экран офиса ---------------------------- */
 await t.p.evaluate(()=>{const [a,b]=ldSeed('A A');ldPut(a,'SL-1');ldPut(b,'SL-2');window.ldIds=[a,b];const s=ldPS(a,[a,b]);ldLoad('SL-1');window.ldPrints=0;tab='shipping';shippingTab='shipments';shippingOpenId=s.id;render();});
 eq('PS card shows what is loaded',await t.p.evaluate(()=>ldText('[data-ps-loaded]')),'1 skid loaded · 1 skid not loaded');
 await t.p.getByRole('button',{name:'Loaded',exact:true}).click();
 eq('Loaded says what stays in Ready before it writes',await t.p.evaluate(()=>({title:salesDialog.title,note:salesDialog.note,status:DB.shipment[0].status})),{title:'PS-0001 · 1 skid loaded',note:'1 skid not loaded — back to Ready for the next trip.',status:'planned'});
 await t.p.locator('.sales-dialog').getByRole('button',{name:'Loaded',exact:true}).click();
 eq('Loaded ships the scanned skid and prints the PS',await t.p.evaluate(()=>({status:DB.shipment[0].status,items:DB.shipment[0].items.length,prints:ldPrints,ready:shippingAvailable(salesRecord(ldIds[1])).length})),{status:'shipped',items:3,prints:1,ready:3});
 await t.p.evaluate(()=>{shippingTab='ready';render();});
 await t.p.getByLabel(/^Queue for order .* line 1$/).fill('4');await t.p.getByLabel(/^Queue for order .* line 1$/).press('Tab');
 eq('Ready has a Queue column that writes the line',await t.p.evaluate(()=>({queue:salesRecord(ldIds[1]).lines[0].shipQueue,head:[...document.querySelectorAll('.shipping-ready-table th')].map(e=>e.textContent).includes('Queue'),shown:document.querySelector('.shipping-queue').value})),{queue:4,head:true,shown:'4'});
 /* Строка в батче: правая кнопка по настоящей строке заказа. */
 await t.p.evaluate(()=>{tab='sales';salesOrderEdit(ldIds[1]);render();});
 const at=await t.p.evaluate(()=>{const r=document.querySelectorAll('tr.line-locked')[1];r.scrollIntoView({block:'center'});const b=r.getBoundingClientRect();return {x:b.left+40,y:b.top+b.height/2};});
 await t.p.mouse.click(at.x,at.y,{button:'right'});
 const menu=await t.p.evaluate(()=>({queue:!!document.querySelector('[data-line-queue-action]'),hold:!!document.querySelector('[data-line-hold-action]')}));
 await t.p.locator('[data-line-queue-action]').click();await t.p.locator('[data-line-queue]').fill('7');await t.p.locator('[data-line-queue-confirm]').click();
 eq('Line menu of a batched line offers the shipping queue only; Save writes the saved line and the draft',await t.p.evaluate(menu=>{
  const id=ldIds[1],out={menu,saved:salesRecord(id).lines[1].shipQueue,draft:soDraft.lines[1].shipQueue,closed:salesLineHoldMenu===null};
  salesLineHoldContext({clientX:60,clientY:60},salesRecord(id).lines[0].id);out.title=ldText('.sl-line-context b');salesLineHoldClose();salesDraftDrop();return out;
 },menu),{menu:{queue:true,hold:false},saved:7,draft:7,closed:true,title:'Line 1 · Queue 4'});
 eq('Shipping loading browser errors',t.errs,[]);await t.c.close();
};
