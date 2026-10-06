/* Shipping PR 3: машины, план доставки на день (остановки по порядку со
   временем отбытия), лист рейса. Заказ фикстуры — 3 готовых юнита. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-delivery');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.dvPrints=(window.dvPrints||0)+1;};
  /* 'A B A$' — заказ на букву клиента; у каждого свой скид SL-n. */
  window.dvSeed=function(spec){
   oqReset();DB.carrier=[];carrierAdd('SL',6);DB.truck=[];DB.orderEvent=[];window.dvPrints=0;deliveryDate='';deliveryNotice='';const cs={};
   window.dvIds=spec.split(' ').map((k,n)=>{
    cs[k[0]]=cs[k[0]]||oqCustomer(Object.assign({legalName:'Customer '+k[0]},k[1]==='$'?{paymentMode:'cash'}:{}));const id=oqOrder(cs[k[0]]);salesDraftDrop();oqThrough(id,'ready');
    shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-'+(n+1);}));return id;});
   return dvIds;
  };
  window.dvPS=function(id,extra){return shippingCreate(Object.assign({customerId:salesRecord(id).customerId,method:'delivery',shipTo:{addressee:'Site office',address1:'1 Main St',city:'Toronto',contact:'Ann',phone:'555-0100'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]},extra)).value;};
  window.dvTruck=function(name){return truckAdd(name).value;};
  window.dvOrder=function(truck,date){return deliveryStops(date||finToday(),truck.id).map(s=>s.number+':'+s.stop);};
  window.dvTexts=function(pages){return pages.map(p=>p.items.filter(i=>i.t==='text').map(i=>i.s).join(' | '));};
  window.dvText=function(sel){const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
 });
 eq('Trucks: default name, rename, note, deactivate; an empty name is refused and junk is dropped on load',await t.p.evaluate(()=>{
  dvSeed('A');const a=dvTruck(''),b=dvTruck('  Box truck  ');const empty=truckSet(a.id,'name','  ');truckSet(a.id,'name','Flatbed');truckSet(a.id,'note','Crane');truckSet(b.id,'active',false);
  DB.truck.push(null,{id:a.id,name:'Duplicate'},{id:'bad id',name:'x'});normalizeTrucks();let bad='';try{validateTruckPayload({truck:{}});}catch(e){bad=e.message;}
  return {names:DB.truck.map(t=>t.name),note:DB.truck[0].note,active:DB.truck.map(t=>t.active),empty:[empty.ok,empty.error],bad};
 }),{names:['Flatbed','Box truck'],note:'Crane',active:[true,false],empty:[false,'Enter a truck name.'],bad:'The "truck" field must be an array.'});
 eq('A delivery PS goes on an active truck as the last stop; pickup, inactive truck and delivered PS are refused',await t.p.evaluate(()=>{
  const [a,b,c]=dvSeed('A B C'),one=dvTruck('Truck 1'),off=dvTruck('Old');truckSet(off.id,'active',false);
  const p1=dvPS(a),p2=dvPS(b),pick=dvPS(c,{method:'pickup'});
  const first=deliveryAssign(p1.id,one.id).ok,second=deliveryAssign(p2.id,one.id).ok,order=dvOrder(one);
  const pickup=deliveryAssign(pick.id,one.id),inactive=deliveryAssign(p2.id,off.id);
  shippingMarkShipped(p1.id);shippingMarkDelivered(p1.id);const delivered=deliveryAssign(p1.id,'');
  return {first,second,order,pickup:pickup.error,inactive:inactive.error,delivered:delivered.error,still:dvOrder(one)};
 }),{first:true,second:true,order:['PS-0001:1','PS-0002:2'],pickup:'Only a delivery packing slip goes on a truck.',inactive:'Choose an active truck.',delivered:'This packing slip is already delivered.',still:['PS-0001:1','PS-0002:2']});
 eq('Stops move up and down, taking one off renumbers the rest, and the ends do not move',await t.p.evaluate(()=>{
  const [a,b,c]=dvSeed('A B C'),one=dvTruck('Truck 1'),two=dvTruck('Truck 2'),ps=[dvPS(a),dvPS(b),dvPS(c)];ps.forEach(s=>deliveryAssign(s.id,one.id));
  deliveryMove(ps[2].id,-1);const up=dvOrder(one);deliveryMove(ps[0].id,-1);deliveryMove(ps[1].id,1);const ends=dvOrder(one);
  deliveryMove(ps[0].id,1);const down=dvOrder(one);deliveryAssign(ps[2].id,two.id);const moved=[dvOrder(one),dvOrder(two)];deliveryAssign(ps[2].id,'');
  return {up,ends,down,moved,off:[dvOrder(one),dvOrder(two),'truckId' in ps[2],'stop' in ps[2]]};
 }),{up:['PS-0001:1','PS-0003:2','PS-0002:3'],ends:['PS-0001:1','PS-0003:2','PS-0002:3'],down:['PS-0003:1','PS-0001:2','PS-0002:3'],moved:[['PS-0001:1','PS-0002:2'],['PS-0003:1']],off:[['PS-0001:1','PS-0002:2'],[],false,false]});
 eq('Departure time is free to change; the driver is set for the truck day and a new stop takes it',await t.p.evaluate(()=>{
  const [a,b]=dvSeed('A B'),one=dvTruck('Truck 1'),p1=dvPS(a),p2=dvPS(b);DB.user.push({name:'Driver Dan'});normalizeUsers();const dan=DB.user.find(u=>u.name==='Driver Dan');
  deliveryAssign(p1.id,one.id);const time=deliverySetTime(p1.id,'08:00').ok,bad=deliverySetTime(p1.id,'8 am'),later=deliverySetTime(p1.id,'11:30').ok;
  const set=deliverySetDriver(finToday(),one.id,dan.viewProfileId).ok,ghost=deliverySetDriver(finToday(),one.id,'view-none');deliveryAssign(p2.id,one.id);
  const out={time,bad:bad.error,later,at:p1.departAt,set,ghost:ghost.error,inherited:p2.driverId===dan.viewProfileId,name:deliveryDriver(finToday(),one.id).name};
  deliverySetTime(p1.id,'');deliverySetDriver(finToday(),one.id,'');return Object.assign(out,{cleared:['departAt' in p1,'driverId' in p1,'driverId' in p2]});
 }),{time:true,bad:'Enter the time as HH:MM.',later:true,at:'11:30',set:true,ghost:'Driver not found.',inherited:true,name:'Driver Dan',cleared:[false,false,false]});
 eq('The day shows trucks with stops, PS without a truck and pickups; skids and weight match the packing slip',await t.p.evaluate(()=>{
  const [a,b,c,d]=dvSeed('A B C D'),one=dvTruck('Truck 1'),p1=dvPS(a),p2=dvPS(b),pick=dvPS(c,{method:'pickup'}),next=dvPS(d,{date:finAddDays(finToday(),1)});
  deliveryAssign(p1.id,one.id);const day=shippingWithCtx(()=>deliveryDay(finToday())),load=shippingWithCtx(()=>deliveryLoad(p1)),doc=shippingDocument(p1).skids[0];
  const tomorrow=deliveryDay(next.date);shippingRevert(p2.id,'cancel');
  return {trucks:day.trucks.map(x=>x.t.name+':'+x.stops.map(s=>s.number).join(',')),free:day.free.map(s=>s.number),pickups:day.pickups.map(s=>s.number),skids:load.skids,units:load.units,kg:Math.abs(load.kg-doc.kg)<1e-9&&load.kg>0,exact:load.exact===doc.exact,
   tomorrow:tomorrow.free.map(s=>s.number),cancelled:deliveryDay(finToday()).free.length};
 }),{trucks:['Truck 1:PS-0001'],free:['PS-0002'],pickups:['PS-0003'],skids:['SL-1'],units:3,kg:true,exact:true,tomorrow:['PS-0004'],cancelled:0});
 eq('Trip sheet lists the stops in order with time, address, contact, PS, skids and the total',await t.p.evaluate(()=>{
  const [a,b]=dvSeed('A B'),one=dvTruck('Flatbed'),p1=dvPS(a),p2=dvPS(b,{shipTo:{address1:'9 Lake Rd',city:'Barrie'}});DB.user.push({name:'Driver Dan'});normalizeUsers();
  deliveryAssign(p1.id,one.id);deliveryAssign(p2.id,one.id);deliveryMove(p2.id,-1);deliverySetTime(p2.id,'08:00');deliverySetTime(p1.id,'11:30');deliverySetDriver(finToday(),one.id,DB.user.find(u=>u.name==='Driver Dan').viewProfileId);
  const text=dvTexts(deliveryPages(finToday(),one.id))[0],at=s=>text.indexOf(s);
  return {head:text.includes('TRIP SHEET')&&text.includes(docDate(finToday()))&&text.includes('Flatbed · Driver: Driver Dan'),order:at('8:00 AM')>0&&at('8:00 AM')<at('Customer B')&&at('Customer B')<at('PS-0002')&&at('PS-0002')<at('11:30 AM')&&at('11:30 AM')<at('Customer A')&&at('Customer A')<at('PS-0001'),
   address:text.includes('9 Lake Rd')&&text.includes('Site office · 1 Main St'),contact:text.includes('Ann · 555-0100'),skids:text.includes('SL-1')&&text.includes('SL-2'),total:/2 stops · 2 skids · ~?[\d,]+ kg/.test(text),pages:deliveryPages(finToday(),one.id).length};
 }),{head:true,order:true,address:true,contact:true,skids:true,total:true,pages:1});
 eq('Trip sheet alone writes nothing; with packing slips it records each print and asks about a cash balance once',await t.p.evaluate(()=>{
  const [a,b]=dvSeed('A$ B'),one=dvTruck('Truck 1'),p1=dvPS(a),p2=dvPS(b);deliveryAssign(p1.id,one.id);deliveryAssign(p2.id,one.id);
  const before=JSON.stringify(DB);deliveryPrint(finToday(),one.id,false);const alone={same:before===JSON.stringify(DB),prints:dvPrints,dialog:!!salesDialog};
  deliveryPrint(finToday(),one.id,true);const asked=!!salesDialog;oqChoose('Back');const back={same:before===JSON.stringify(DB),prints:dvPrints};
  deliveryPrint(finToday(),one.id,true);oqChoose('Print anyway');
  return {alone,asked,back,prints:dvPrints,printed:[!!p1.printedAt,!!p2.printedAt],pages:document.querySelectorAll('#docPrintHost .doc-print-page').length,again:!!salesDialog};
 }),{alone:{same:true,prints:1,dialog:false},asked:true,back:{same:true,prints:1},prints:2,printed:[true,true],pages:5,again:false});
 eq('The plan survives export and import; a PS whose truck is gone comes off the plan',await t.p.evaluate(()=>{
  const [a,b]=dvSeed('A B'),one=dvTruck('Truck 1'),two=dvTruck('Truck 2'),p1=dvPS(a),p2=dvPS(b);deliveryAssign(p1.id,one.id);deliverySetTime(p1.id,'08:00');deliveryAssign(p2.id,two.id);
  const src=JSON.parse(JSON.stringify(DB));src.truck=src.truck.filter(t=>t.id!==two.id);const next=prepareImportedState(src),q1=next.shipment.find(s=>s.number==='PS-0001'),q2=next.shipment.find(s=>s.number==='PS-0002');
  return {trucks:next.truck.map(t=>t.name),kept:[q1.truckId===one.id,q1.stop,q1.departAt],gone:['truckId' in q2,'stop' in q2]};
 }),{trucks:['Truck 1'],kept:[true,1,'08:00'],gone:[false,false]});
 // Настоящие элементы экрана: справочник машин и вкладка Delivery.
 await t.p.evaluate(()=>{const [a,b,c]=dvSeed('A B C');dvPS(a);dvPS(b);dvPS(c,{method:'pickup'});tab='masterdata';mdSetTab('trucks');render();});
 await t.p.locator('[data-truck-add]').click();await t.p.getByLabel('Truck name').fill('Flatbed');await t.p.getByLabel('Truck name').press('Tab');
 eq('Master Data → Trucks adds and renames a truck',await t.p.evaluate(()=>DB.truck.map(t=>t.name+':'+t.active)),['Flatbed:true']);
 await t.p.evaluate(()=>{tab='shipping';shippingSetTab('delivery');});
 eq('Delivery tab: day, PS without a truck, pickups and the tab count',await t.p.evaluate(()=>({tab:dvText('[data-shipping-tab="delivery"]'),free:[...document.querySelectorAll('[data-free]')].map(r=>r.dataset.free),pickups:dvText('[data-delivery-pickups] h3'),load:dvText('[data-truck-load]')})),{tab:'Delivery 2',free:['PS-0001','PS-0002'],pickups:'Pickups',load:'0 stops · 0 skids · 0 kg'});
 await t.p.getByLabel('Truck for PS-0001').selectOption({label:'Flatbed'});await t.p.getByLabel('Truck for PS-0002').selectOption({label:'Flatbed'});
 await t.p.getByLabel('Move PS-0002 up').click();await t.p.getByLabel('Departs PS-0002').fill('08:00');await t.p.getByLabel('Departs PS-0002').press('Tab');
 eq('Delivery tab controls put PS on the truck, reorder the stops and set the departure time',await t.p.evaluate(()=>({rows:[...document.querySelectorAll('[data-stop]')].map(r=>r.dataset.stop+' '+r.querySelector('input[type=time]').value),free:document.querySelectorAll('[data-free]').length,load:/^2 stops · 2 skids · ~?[\d,]+ kg$/.test(dvText('[data-truck-load]')),sheet:!!document.querySelector('[data-trip-sheet]')})),{rows:['PS-0002 08:00','PS-0001 '],free:0,load:true,sheet:true});
 await t.p.setViewportSize({width:390,height:844});eq('Delivery fits the narrow viewport',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 eq('Shipping delivery browser errors',t.errs,[]);await t.c.close();
};
