/* Движок конструктора отчётов (reports/query, reports/sources,
   reports/facts-office). Владелец, 9 октября 2026: отчёты «как в Looker»,
   источники по участкам со своими метриками — линейные дюймы только у
   кромки; резка «за прошлый год»; закалка — стёкла, мм, ft²; кто сколько
   выдал на Shipping; рейсы доставки; сроки заказов; время у станций. */
module.exports=async function({page,eq,ok}){
 console.log('report-engine');const t=await page();
 await require('./optimization-fixture')(t.p);
 await require('./report-fixture')(t.p);

 eq('Периоды: неделя с понедельника, кварталы, прошлый год; сравнение — прошлый период той же длины и те же даты год назад',await t.p.evaluate(()=>{
  const now=new Date(2026,9,9,15),r=k=>repPresetRange(k,now);
  return {thisWeek:r('thisWeek'),lastWeek:r('lastWeek'),last30:r('last30'),thisQuarter:r('thisQuarter'),lastQuarter:r('lastQuarter'),lastYear:r('lastYear'),
   prevMonth:repCompareRange(r('thisMonth'),'prev'),yearMonth:repCompareRange(r('thisMonth'),'year')};
 }),{thisWeek:['2026-10-05','2026-10-11'],lastWeek:['2026-09-28','2026-10-04'],last30:['2026-09-10','2026-10-09'],thisQuarter:['2026-10-01','2026-12-31'],
  lastQuarter:['2026-07-01','2026-09-30'],lastYear:['2025-01-01','2025-12-31'],prevMonth:['2026-08-31','2026-09-30'],yearMonth:['2025-10-01','2025-10-31']});

 eq('Edgework: линейные дюймы только у кромки, по операции и толщине; у станций без кромки дюймов нет; Drilling — штуки',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who={id:'u1',name:'Andrei'};
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]]),b=rbOrder(c,'12CLEAR','single',[[30,40,1]]);rbBatch([a,b]);
  rbIds(a).forEach(p=>{rbGo('CUT',p,who);rbGo('ARRIS',p,who);});rbIds(b).forEach(p=>{rbGo('CUT',p,who);rbGo('POLISH',p,who);});
  const q=repQuery({source:'edgework',date:{preset:'all'},dims:['op','mm'],metrics:['inches','usd']});
  const cells=q.keys.flatMap(k=>q.keys2.filter(k2=>q.cells.get(k+'\u0001'+k2)[0]).map(k2=>k+' · '+k2+' · '+q.cells.get(k+'\u0001'+k2)[0]));
  return {cells,total:q.metrics.map((m,i)=>repFmt(m,q.total[i])),stationWorkHasInches:repMetricOptions(REP_SRC.glass).some(x=>/Linear in/.test(x[1])),drill:repQuery({source:'drilling',date:{preset:'all'},metrics:['pcs']}).total[0]};
 }),{cells:['Rough Arris · 6 mm · 432','Flat Polish · 12 mm · 140'],total:['572','$22.52'],stationWorkHasInches:false,drill:0});

 eq('Cutting: сколько порезали по месяцам за год — все 12 месяцев, пустые нулём; сравнение с прошлым годом по тем же месяцам',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who={id:'u1',name:'Vasyl'},y=new Date().getFullYear();
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]]);rbBatch([a]);const ids=rbIds(a),at=(yy,mm,dd)=>new Date(yy,mm-1,dd,9).toISOString();
  rbGo('CUT',ids[0],who,at(y-1,3,15));rbGo('CUT',ids[1],who,at(y-1,3,16));rbGo('CUT',ids[2],who,at(y,3,10));rbGo('CUT',ids[3],who,at(y,7,1));
  const q=repQuery({source:'cutting',date:{preset:'thisYear'},dims:['at:month'],metrics:['count','area'],compare:'year'});
  return {months:q.keys.length,march:q.rowTotals.get(y+'-03')[0],july:q.rowTotals.get(y+'-07')[0],jan:q.rowTotals.get(y+'-01')[0],label:repKeyText(REP_SRC.cutting,'at:month',y+'-03'),
   lastYearMarch:q.compare.rowTotals.get(y+'-03')[0],total:q.total[0],lastYear:q.compare.total[0],ft2:repFmt(q.metrics[1],q.total[1])};
 }),{months:12,march:1,july:1,jan:0,label:'Mar '+new Date().getFullYear(),lastYearMarch:2,total:2,lastYear:2,ft2:'36.5'});

 eq('Tempering — стёкла и ft² по толщине; IGU — собранные юниты; Shipping handout — кто сколько юнитов и стёкол выдал',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),oleg=rbUser('Oleg','1111'),anna=rbUser('Anna','2222');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]]);rbBatch([a]);oqReady(a);const ids=rbIds(a),ship=shippingStations().ship;
  rbGo(ship,ids[0],oleg);rbGo(ship,ids[1],oleg);rbGo(ship,ids[2],anna);
  const temper=repQuery({source:'tempering',date:{preset:'all'},dims:['mm'],metrics:['count','area']}),asm=repQuery({source:'assembly',date:{preset:'all'},metrics:['units','count']});
  const hand=repQuery({source:'shipping',date:{preset:'all'},dims:['person'],metrics:['units','count'],sort:{by:'label',dir:'asc'}});
  return {temper:temper.keys.map(k=>k+' '+temper.rowTotals.get(k)[0]+' glass '+repFmt(temper.metrics[1],temper.rowTotals.get(k)[1])+' ft²'),asm:asm.total,
   hand:hand.keys.map(k=>k+': '+hand.rowTotals.get(k).join(' units / ')+' glass'),handLabel:repField(REP_SRC.shipping,'person').label};
 }),{temper:['6 mm 4 glass 73 ft²'],asm:[2,4],hand:['Anna: 1 units / 1 glass','Oleg: 2 units / 2 glass'],handLabel:'Handed out by'});

 eq('Deliveries: PS и рейсы — день и машина; две остановки одной машины — один рейс',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'});DB.truck=[{id:'T1',name:'Truck 1',active:true},{id:'T2',name:'Truck 2',active:true}];
  const ids=[1,2,3].map(()=>rbOrder(c,'6CLEAR','double',[[30,40,1]],{delivery:'delivery'}));rbBatch(ids);ids.forEach(id=>oqReady(id));
  const ps=ids.map(id=>shippingCreate({customerId:c.id,method:'delivery',shipTo:{address1:'Site'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem)}).value);
  ps[0].truckId='T1';ps[1].truckId='T1';ps[2].truckId='T2';touch();
  const q=repQuery({source:'deliveries',date:{preset:'today'},dims:['truck'],metrics:['count','trips','units'],sort:{by:'label',dir:'asc'}});
  return {total:q.total,byTruck:q.keys.map(k=>k+' '+q.rowTotals.get(k).join('/'))};
 }),{total:[3,2,3],byTruck:['Truck 1 2/1/2','Truck 2 1/1/1']});

 eq('Orders: On time % — из заказов On time и Late (просроченный невыданный тоже опоздал); дни опоздания; lead time — от создания до отгрузки',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),day=n=>repAddDays(finToday(),n);
  const mk=due=>rbOrder(c,'6CLEAR','double',[[30,40,1]],{dueDate:due,delivery:'pickup'});
  const a=mk(day(-1)),b=mk(day(2)),x=mk(day(-3)),y=mk(day(5));rbBatch([a,b,x,y]);[a,b].forEach(id=>{oqReady(id);oqFulfill(id,'pickup');});
  const q=repQuery({source:'orders',date:{f:'due',preset:'all'},dims:['state'],metrics:['count','onTime','daysLate:max','lead:avg'],sort:{by:'label',dir:'asc'}});
  return {byState:q.keys.map(k=>k+' '+q.rowTotals.get(k)[0]),onTime:repFmt(q.metrics[1],q.total[1]),maxLate:q.total[2],lead:q.total[3]};
 }),{byState:['Late 2','On time 1','Open 1'],onTime:'33%',maxLate:3,lead:0});

 eq('Time at stations: часы между первым и последним сканом; стёкла в час — только дни от получаса',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who=rbUser('Andrei','1111');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]]);rbBatch([a]);const ids=rbIds(a);
  rbGo('CUT',ids[0],who,rbAt(-1,8,0));rbGo('CUT',ids[1],who,rbAt(-1,10,0));rbGo('CUT',ids[2],who,rbAt(-1,12,0));rbGo('CUT',ids[3],who,rbAt(0,9,0));
  const q=repQuery({source:'time',date:{preset:'all'},dims:['at:day'],metrics:['hours','glassN','perHour']});
  return q.keys.filter(k=>q.rowTotals.get(k)[1]).map(k=>q.rowTotals.get(k).map(v=>v==null?null:+(+v).toFixed(2)));
 }),[[4,3,0.75],[0,1,null]]);

 eq('Фильтры: «я» и «эта станция» для экранов; «Is any of»; топ N и Other',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),d=oqCustomer({legalName:'South Glass'}),andrei=rbUser('Andrei','1111'),vasyl=rbUser('Vasyl','2222');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]]),b=rbOrder(d,'6CLEAR','double',[[30,40,2]]);rbBatch([a,b]);
  rbIds(a).forEach(p=>rbGo('CUT',p,andrei));rbIds(b).forEach(p=>{rbGo('CUT',p,vasyl);rbGo('ARRIS',p,vasyl);});
  const me=repQuery({source:'glass',date:{preset:'all'},filters:[{f:'person',op:'in',v:['@me']},{f:'station',op:'in',v:['@station']}],metrics:['count']},{person:'Vasyl',station:'ARRIS'}).total[0];
  const top=repQuery({source:'glass',date:{preset:'all'},dims:['customer'],metrics:['count'],limit:1,other:true});
  return {me,top:top.keys.map(k=>repKeyText(REP_SRC.glass,'customer',k)+' '+top.rowTotals.get(k)[0])};
 }),{me:4,top:['South Glass 8','Other 2']});
 /* Аудит 25.10.2026: R-3 — фильтр, которого у источника нет, виден у
    графика; R-4 — Other прошлого периода; R-5 — одноимённые клиенты
    раздельно; R-6 — смена водителя доходит до отчёта доставки. */
 eq('Аудит Reports: неприменённый фильтр виден; Other прошлого периода; одноимённые клиенты раздельно; новый водитель в доставке',await t.p.evaluate(()=>{
  oqReset();const same1=oqCustomer({legalName:'Same Name'}),same2=oqCustomer({legalName:'Same Name'}),other=oqCustomer({legalName:'Other Co'});
  /* Период 15–17 сентября: Same Name (первый) 2, Other 1; прошлый, 12–14: по одному у каждого из трёх. */
  const day=d=>new Date(Date.UTC(2026,8,d,12)).toISOString(),sep=d=>'2026-09-'+String(d).padStart(2,'0');
  [[same1,15],[same1,16],[other,17],[same1,12],[same2,13],[other,14]].forEach(([c,d])=>{const id=rbOrder(c,'6CLEAR','double',[[30,40,1]]);storageCommand(()=>{const o=salesRecord(id);o.createdAt=day(d);o.updatedAt=day(d);});});
  const q=repQuery({source:'orders',date:{f:'created',from:sep(15),to:sep(17)},dims:['customer'],metrics:['count'],limit:1,other:true,compare:'prev'});
  const prev=q.keys.map(k=>repKeyText(REP_SRC.orders,'customer',k)+' '+(q.compare.rowTotals.get(k)||[])[0]),sum=q.keys.reduce((n,k)=>n+((q.compare.rowTotals.get(k)||[])[0]||0),0);
  const names=repQuery({source:'orders',date:{f:'created',from:sep(12),to:sep(17)},dims:['customer'],metrics:['count']}).keys.sort();
  const r={id:'R-AUDIT',filters:{method:['Cash']},date:{preset:'all'},pages:[]},w={id:'W1',type:'number',q:{source:'orders',date:{use:'report'},dims:[],metrics:['count'],filters:[{f:'gone',op:'in',v:['x']}]}};
  const skip=repSkipHTML(r,w).replace(/<[^>]+>/g,''),none=repSkipHTML({id:'R-AUDIT2',filters:{},date:{preset:'all'},pages:[]},Object.assign({},w,{q:Object.assign({},w.q,{filters:[]})}));
  DB.truck=[{id:'T1',name:'Truck 1',active:true}];const u1=rbUser('First','1111'),u2=rbUser('Second','2222'),id=rbOrder(other,'6CLEAR','double',[[30,40,1]],{delivery:'delivery'});rbBatch([id]);oqReady(id);
  const ps=shippingCreate({customerId:other.id,method:'delivery',shipTo:{address1:'Site'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem)}).value;
  storageCommand(()=>{ps.truckId='T1';});deliverySetDriver(ps.date,'T1',u1.id);const d1=repDeliveryFacts().find(x=>x.id===ps.id).driver;
  deliverySetDriver(ps.date,'T1',u2.id);const d2=repDeliveryFacts().find(x=>x.id===ps.id).driver;
  return {top:prev,sum,total:q.compare.total[0],names,skip,none,drivers:[d1,d2]};
 }),{top:['Same Name · QA1 1','Other 2'],sum:3,total:3,names:['Other Co','Same Name · QA1','Same Name · QA2'],skip:'Not filtered by Method, gone',none:'',drivers:['First','Second']});
 eq('Поля заказа и строки (PO, город, отметка, размер, Recut) и вычисляемые метрики: $ за дюйм, ft² ÷ число',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows',salesRep:'Kate',addresses:[{label:'Main',address1:'1 King St',city:'Toronto',province:'ON',isPrimary:true}]}),who={id:'u1',name:'Andrei'};
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]],{customerPo:'PO-77'});salesRecord(a).lines[0].mark='Kitchen';rbBatch([a]);rbIds(a).forEach(p=>{rbGo('CUT',p,who);rbGo('ARRIS',p,who);});
  const one=repQuery({source:'glass',date:{preset:'all'},dims:['city'],metrics:['count']}),f=repWorkFacts()[0];
  const perIn=repQuery({source:'edgework',date:{preset:'all'},metrics:['calc:usd~div~inches','calc:inches~div~n:12']});
  return {city:one.keys,po:f.po,rep:f.rep,mark:f.mark,size:f.size,recut:f.recut,terms:f.terms,
   calc:perIn.metrics.map((m,i)=>m.label+' = '+repFmt(m,perIn.total[i])),badCalc:repMetric(REP_SRC.edgework,'calc:inches~div~nothing')};
 }),{city:['Toronto'],po:'PO-77',rep:'Kate',mark:'Kitchen',size:'37 × 71',recut:'Original',terms:'Credit',calc:['$ by price list ÷ Linear in = $0.01','Linear in ÷ 12 = 36'],badCalc:null});
 eq('Quotes: Won / Sent / Expired / Not sent и win rate; Payments и Balances — только с Finance; Offcuts — лежит, снят; размерная группа и производитель стекла',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows',salesRep:'Kate'}),who={id:'u1',name:'Andrei'},past=repAddDays(finToday(),-5),later=repAddDays(finToday(),20);
  const q1=oqOrder(c,{kind:'quote'}),q2=oqOrder(c,{kind:'quote'}),q3=oqOrder(c,{kind:'quote'}),q4=oqOrder(c,{kind:'quote'});soDraft=null;soEdit=null;
  Object.assign(salesRecord(q1),{status:'won',sentAt:new Date().toISOString(),validUntil:later});Object.assign(salesRecord(q2),{status:'sent',sentAt:new Date().toISOString(),validUntil:later});
  Object.assign(salesRecord(q3),{validUntil:past});Object.assign(salesRecord(q4),{validUntil:later});
  const quotes=repQuery({source:'quotes',date:{f:'created',preset:'all'},dims:['state'],metrics:['count','winRate'],sort:{by:'label',dir:'asc'}});
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]]);rbBatch([a]);rbIds(a).forEach(p=>rbGo('CUT',p,who));
  DB.receipt=[normalizeReceipt({number:'R-0001',customerId:c.id,amount:300,method:'cheque',date:finToday(),allocations:[{orderId:a,amount:200}]})];
  const pay=repQuery({source:'payments',date:{preset:'all'},metrics:['amount','applied','onAccount','count']}),bal=repQuery({source:'balances',date:{f:'due',preset:'all'},metrics:['paid','count']});
  stockOffcutAdd({glass:'6CLEAR',mm:6,w:40,h:30,batch:'B-0001',sheet:1});const gone=stockOffcutAdd({glass:'6CLEAR',mm:6,w:20,h:12,batch:'B-0001',sheet:1});stockOffcutCancel(gone.id);
  const off=repQuery({source:'offcuts',date:{preset:'all'},dims:['status'],metrics:['count','area'],sort:{by:'label',dir:'asc'}}),f=repWorkFacts()[0];
  const old=window.accessCan;window.accessCan=k=>k!=='finance';const gated={payments:repSourceAllowed('payments'),balances:repSourceAllowed('balances'),quotes:repSourceAllowed('quotes')};window.accessCan=old;
  return {quotes:quotes.keys.map(k=>k+' '+quotes.rowTotals.get(k)[0]),winRate:repFmt(quotes.metrics[1],quotes.total[1]),
   pay:pay.metrics.map((m,i)=>repFmt(m,pay.total[i])),balPaid:repFmt(bal.metrics[0],bal.total[0]),off:off.keys.map(k=>k+' '+off.rowTotals.get(k)[0]+' · '+repFmt(off.metrics[1],off.rowTotals.get(k)[1])),
   sizeBand:f.sizeBand,maker:f.maker===(glassProductByCode('6CLEAR').manufacturer||''),gated};
 }),{quotes:['Expired 1','Not sent 1','Sent 1','Won 1'],winRate:'25%',pay:['$300.00','$200.00','$100.00','1'],balPaid:'$200.00',off:['In stock 1 · 8.3','Removed 1 · 1.7'],
  sizeBand:'10–30 ft²',maker:true,gated:{payments:false,balances:false,quotes:true}});

 eq('Стартовые отчёты по версиям: база получает новые, удалённый владельцем стартовый не возвращается',await t.p.evaluate(()=>{
  DB.report=(DB.report||[]).filter(r=>!/^RP-start-/.test(r.id)||r.id==='RP-start-cut');DB.report=DB.report.filter(r=>!['RP-start-quotes','RP-start-payments','RP-start-balances','RP-start-offcuts','RP-start-sizes','RP-start-km','RP-start-myday','RP-start-myedge','RP-start-mycustomers'].includes(r.id));
  DB.reportSeed=1;normalizeReports();const ids=DB.report.filter(r=>/^RP-start-/.test(r.id)).map(r=>r.id).sort();normalizeReports();
  return {ids,again:DB.report.filter(r=>/^RP-start-/.test(r.id)).length,seed:DB.reportSeed};
 }),{ids:['RP-start-balances','RP-start-cut','RP-start-km','RP-start-mycustomers','RP-start-myday','RP-start-myedge','RP-start-offcuts','RP-start-payments','RP-start-quotes','RP-start-sizes','RP-start-sold'].concat(['RP-start-myasm','RP-start-mycut','RP-start-mydrill','RP-start-myship','RP-start-sheetcut','RP-start-shopnow','RP-start-counts','RP-start-igumat','RP-start-sheetmoves']).sort(),again:20,seed:8});
 eq('Км рейса по карте Google: цех → остановки → цех, запоминаются за рейс; отчёт — км и км на рейс; поменяли остановки — видно',await t.p.evaluate(async()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'});DB.truck=[{id:'T1',name:'Truck 1',active:true}];DB.tripKm=[];
  DB.company=Object.assign({},DB.company,{address1:'10 Shop Rd',city:'Vaughan',province:'ON'});
  const calls=[];window.google={maps:{DirectionsService:function(){this.route=(req,cb)=>{calls.push([req.origin,req.destination,req.waypoints.map(w=>w.location)]);cb({routes:[{legs:req.waypoints.map(()=>({distance:{value:12000}})).concat([{distance:{value:8000}}])}]},'OK');};}}};
  const ids=[1,2].map(()=>rbOrder(c,'6CLEAR','double',[[30,40,1]],{delivery:'delivery'}));rbBatch(ids);ids.forEach(id=>oqReady(id));
  const ps=ids.map((id,i)=>shippingCreate({customerId:c.id,method:'delivery',shipTo:{address1:(i+1)+' Main St',city:i?'Brampton':'Mississauga',province:'ON'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem)}).value);
  ps.forEach((s,i)=>{s.truckId='T1';s.stop=i+1;});touch();
  const rec=await tripKmCalc(finToday(),'T1');const q=repQuery({source:'deliveries',date:{preset:'today'},metrics:['km','trips','kmPerTrip']});
  tab='shipping';shippingTab='delivery';deliveryDate='';render();const chip=[...document.querySelector('[data-trip-km="T1"]').children].map(x=>x.textContent.trim()).filter(Boolean).join('|');
  ps[1].stop=3;const p3=ps[1];p3.stop=1;ps[0].stop=2;touch();render();const stale=/stops changed/.test(document.querySelector('[data-trip-km="T1"]').textContent);
  delete window.google;tab='dashboard';render();
  return {km:rec.km,stops:rec.stops.length,call:calls[0][0]+' → '+calls[0][2].join(' → ')+' → '+calls[0][1],report:q.metrics.map((m,i)=>m.label+' '+repFmt(m,q.total[i])),chip:chip.replace(/\s+/g,' ').trim(),stale};
 }),{km:32,stops:2,call:'10 Shop Rd, Vaughan, ON, Canada → 1 Main St, Mississauga, ON → 2 Main St, Brampton, ON → 10 Shop Rd, Vaughan, ON, Canada',report:['Km 32','Trips 1','Km per trip 32'],chip:'32 km|Recalculate km',stale:true});
 /* Проход цеха 11.10.2026 (tools/sim-shop.js): сверка отчётов с собственным
    счётом симуляции за 14 месяцев. */
 eq('Кромка ламината: два захода на POLISH — плиты до закалки (Flat Polish) засчитаны первому, выравнивание после склейки (Lami Polish) — второму; не двоится',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Railpro Systems'}),andrei={id:'u1',name:'Andrei'},vasyl={id:'u2',name:'Vasyl'};
  tab='sales';salesOrderNew('order');salesSetUnitType('single');
  const m=soDraft.makeups[0],pn=m.panes[0];pn.category='laminated';['outer','inner'].forEach(k=>{const g=glassProductByCode('6CLEAR');Object.assign(pn.laminated[k],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT'});});
  soDraft.makeups[0]=normalizeOrderMakeup(m,0);
  const l=normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,width16:40*16,height16:36*16,qty:1});soDraft.lines=[l];const s=salesEnsureLineShape(l);
  ShapeModule.compute(s).edges.forEach(e=>{s.edgeOps[e.id]=[shapeNormalizeOp({type:'Flat Polish'}),shapeNormalizeOp({type:'Lami Polish'})];});
  salesApplyCustomerDefaults(c.id);salesOrderSave();const A=soDraft.id;soDraft=null;soEdit=null;rbBatch([A]);
  const ids=rbIds(A);ids.forEach(p=>rbGo('CUT',p,andrei));ids.forEach(p=>rbGo('POLISH',p,andrei));ids.forEach(p=>rbGo('HEAT',p,andrei));ids.forEach(p=>rbGo('LAM',p,andrei));stationMove('POLISH',stationCheck('POLISH',ids[0]),vasyl,{});
  const q=repQuery({source:'edgework',date:{preset:'all'},dims:['person','op'],metrics:['inches'],sort:{by:'label',dir:'asc'}});
  return q.keys.flatMap(k=>q.keys2.filter(k2=>(q.cells.get(k+'\u0001'+k2)||[])[0]).map(k2=>k+' '+k2+' '+q.cells.get(k+'\u0001'+k2)[0]));
 }),['Andrei Flat Polish 304','Vasyl Lami Polish 152']);

 eq('Shipping handout: юнит — собранный стеклопакет, а не номер стекла в позиции (лайты одного пакета из разных юнитов позиции)',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Northview Windows'}),op={id:'u1',name:'Andrei K.'},vlad={id:'u2',name:'Vlad'},ruslan={id:'u3',name:'Ruslan'};
  const A=rbOrder(c,'6CLEAR','double',[[30,40,2]]);rbBatch([A]);const pm=[...glassPieceMap(A).values()].map(r=>r.ids);
  const mv=(st,id,w)=>{const ch=stationCheck(st,id);if(ch.kind!=='ok')throw new Error(st+' '+id+' '+ch.kind);return stationMove(st,ch,w,{});};
  pm.flat().forEach(id=>{mv('CUT',id,op);mv('ARRIS',id,op);mv('HEAT',id,op);});
  mv('IGU',pm[0][0],op);mv('IGU',pm[1][1],op);mv('IGU',pm[0][1],op);mv('IGU',pm[1][0],op);
  mv('SHIPR',pm[0][0],op);mv('SHIPR',pm[0][1],op);mv('SHIP',pm[0][0],vlad);mv('SHIP',pm[0][1],ruslan);
  const q=repQuery({source:'shipping',date:{preset:'all'},dims:['person'],metrics:['units','count'],sort:{by:'label',dir:'asc'}});
  return q.keys.map(k=>k+': '+q.rowTotals.get(k).join(' units / ')+' glass');
 }),['Ruslan: 1 units / 2 glass','Vlad: 1 units / 2 glass']);

 eq('Сроки самовывоза — по готовности: готово к сроку и не забрано — вовремя; готово к сроку, забрали позже — вовремя; срок прошёл, не готово — опоздал',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Cityline Glass & Mirror'}),who={id:'u1',name:'Nazar'},day=n=>repAddDays(finToday(),n);
  const mk=due=>rbOrder(c,'6CLEAR','single',[[30,40,1]],{dueDate:due,delivery:'pickup'});
  const a=mk(day(2)),b=mk(day(-1)),x=mk(day(-1));rbBatch([a,b,x]);
  oqReady(a);
  const g=stationGlass(rbIds(b)[0]),route=stationRouteOf(g).codes,ready=shippingStations().ready;
  route.slice(0,route.indexOf(ready)+1).forEach((st,i)=>rbGo(st,rbIds(b)[0],who,rbAt(-3,9,i)));oqFulfill(b,'pickup');
  const q=repQuery({source:'orders',date:{f:'due',preset:'all'},dims:['order'],metrics:['count','onTime']}),f=repOrderFacts();
  return {state:[a,b,x].map(id=>f.find(r=>r.id===id).state),onTime:repFmt(q.metrics[1],q.total[1])};
 }),{state:['On time','On time','Late'],onTime:'67%'});

 eq('Конструктор: строки без даты — строкой «No date», итог равен сумме строк; пустой фильтр «Is any of» ничего не отсекает',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who={id:'u1',name:'Andrei'};
  const a=rbOrder(c,'6CLEAR','double',[[30,40,1]],{dueDate:repAddDays(finToday(),3)}),b=rbOrder(c,'6CLEAR','double',[[30,40,1]],{dueDate:''});
  const q=repQuery({source:'orders',dims:['due:month'],metrics:['count']}),sum=q.keys.reduce((n,k)=>n+q.rowTotals.get(k)[0],0);
  rbBatch([a]);rbIds(a).forEach(p=>rbGo('CUT',p,who));
  const all=repQuery({source:'glass',date:{preset:'all'},metrics:['count']}).total[0],empty=repQuery({source:'glass',date:{preset:'all'},metrics:['count'],filters:[{f:'station',op:'in',v:[]}]}).total[0];
  return {last:repKeyText(REP_SRC.orders,'due:month',q.keys[q.keys.length-1]),sum,total:q.total[0],all,empty};
 }),{last:'No date',sum:2,total:2,all:2,empty:2});

 eq('Стартовые версии 4: «Sales · my customers» — заказы по дате заказа; у базы на версии 3 стартовый правится сам, свой отчёт не трогается',await t.p.evaluate(()=>{
  const mine=DB.report.find(r=>r.id==='RP-start-mycustomers');mine.pages[0].widgets.forEach(w=>{w.q.date.f='due';});
  const copy=repClean(JSON.parse(JSON.stringify(Object.assign({},mine,{id:'RP-my-copy'}))));DB.report.push(copy);DB.reportSeed=3;normalizeReports();
  const fields=r=>r.pages[0].widgets.map(w=>w.q.date.f).join(),now=DB.report.find(r=>r.id==='RP-start-mycustomers');
  const res={start:fields(now),copy:fields(DB.report.find(r=>r.id==='RP-my-copy')),seed:DB.reportSeed};DB.report=DB.report.filter(r=>r.id!=='RP-my-copy');return res;
 }),{start:'created,created',copy:'due,due',seed:8});

 eq('Аудит 12.10: отчёты по заказам пересчитываются после скана готовности (SHIPR), а не после любого скана цеха',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Cityline Glass & Mirror'}),who={id:'u1',name:'Nazar'},id=rbOrder(c,'6CLEAR','single',[[30,40,2]],{delivery:'pickup'});rbBatch([id]);
  const [a,b]=rbIds(id),first=repOrderFacts();rbGo('CUT',a,who);const afterCut=repOrderFacts()===first;
  const route=stationRouteOf(stationGlass(b)).codes,ready=shippingStations().ready;route.slice(0,route.indexOf(ready)).forEach(st=>rbGo(st,b,who));const beforeReady=repOrderFacts()===first;
  rbGo(ready,b,who);const afterReady=repOrderFacts()!==first;
  return {afterCut,beforeReady,afterReady};
 }),{afterCut:true,beforeReady:true,afterReady:true});

 /* Владелец, 26.10.2026: «сколько ft² плёнки продано, сколько петель в
    штуках и клем и других айтемов, сколько всего продано в деньгах и
    измерительных параметрах»; Fabrication — по видам. */
 const sold=await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Northview Windows'});
  const mk=(lines,extra)=>{tab='sales';salesOrderNew('order');salesSetUnitType('single');soDraft.lines=[];
   lines.forEach(x=>{const m=x.lam?normalizeOrderMakeup({code:'L',unitType:'single'},soDraft.makeups.length):soDraft.makeups[0],p=m.panes[0],g=glassProductByCode('6CLEAR');
    if(x.lam){p.category='laminated';soDraft.makeups.push(m);['outer','inner'].forEach(k=>Object.assign(p.laminated[k],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT',priceOverride:4}));
     p.laminated.interlayers=[normalizeSalesInterlayer({productId:INTERLAYER_DEFAULT_ID,layers:4,priceOverride:5})];}
    else Object.assign(p,{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT',heatSoak:false,priceOverride:5});
    const l=normalizeSalesOrderLine({makeupId:m.id,width16:x.w*16,height16:x.h*16,qty:x.qty,priceManual:x.manual==null?null:x.manual});soDraft.lines.push(l);const s=salesEnsureLineShape(l);
    if(x.fab){s.manufacturingItems=[shapeNormalizeManufacturingItem({id:'h1',type:'hinge',edge:'bottom',distance:7.5}),shapeNormalizeManufacturingItem({id:'h2',type:'hinge',edge:'bottom',distance:30}),
      shapeNormalizeManufacturingItem({id:'o1',type:'hole',x:20,y:18,diameter:'3/4'})];ShapeModule.compute(s).edges.forEach(e=>{s.edgeOps[e.id]=[shapeNormalizeOp({type:'Flat Polish'})];});}
    const rate={MI:k=>/^MI:hole/.test(k)?6:15,EDGE:()=>0.05};salesLineChargeRows(l).forEach(r=>{const f=rate[String(r.key).split(':')[0]];salesEnsureChargePricing(l,r).orderRate=f?f(r.key):0;});});
   salesApplyCustomerDefaults(c.id);Object.assign(soDraft,extra||{});if(!salesOrderSave())throw new Error('Order did not save');const id=soDraft.id;soDraft=null;soEdit=null;return id;};
  const A=mk([{w:40,h:36,qty:2,fab:true},{w:30,h:48,qty:1,lam:true},{w:20,h:36,qty:1,manual:30}]),B=mk([{w:40,h:36,qty:1}],{noCharge:true});
  const rows=repSoldFacts().filter(r=>r.orderId===A),sum=f=>salesMoney(rows.filter(f).reduce((n,r)=>n+(r.amount||0),0)),tA=finOrderTotals(salesRecord(A));
  const q=(o)=>repQuery(Object.assign({source:'sold',date:{preset:'all'},filters:[{f:'charge',op:'in',v:['Charged']}]},o));
  const line=res=>res.keys.map(k=>k+' '+res.rowTotals.get(k).map((v,i)=>repFmt(res.metrics[i],v)).join(' / '));
  const fab=q({dims:['type'],metrics:['pcs','amount','price'],filters:[{f:'charge',op:'in',v:['Charged']},{f:'category',op:'in',v:['Fabrication']}],sort:{by:'label',dir:'asc'}});
  const film=q({dims:['product'],metrics:['filmFt2','lamFt2','amount','price'],filters:[{f:'charge',op:'in',v:['Charged']},{f:'category',op:'in',v:['Interlayer']}]});
  const all=q({metrics:['amount','units','unitFt2','glassFt2','filmFt2','inches','pcs'],filters:[{f:'charge',op:'in',v:['Charged']},{f:'category',op:'notIn',v:['Order charges']}]});
  const byProduct=q({dims:['product'],metrics:['qty'],filters:[{f:'charge',op:'in',v:['Charged']},{f:'category',op:'in',v:['Edgework','Fabrication']}],sort:{by:'label',dir:'asc'}});
  const free=repQuery({source:'sold',date:{preset:'all'},filters:[{f:'charge',op:'in',v:['No charge']}],metrics:['amount','glassFt2','list']});
  return {goods:[sum(r=>r.category!=='Order charges'),tA.subtotal],withCharges:[sum(()=>true),salesMoney(tA.grand-tA.hst)],
   cats:[...new Set(rows.map(r=>r.category))].sort(),hand:rows.filter(r=>r.category==='Price set by hand').map(r=>r.amount),
   fab:line(fab),film:line(film),all:all.metrics.map((m,i)=>m.label+' '+repFmt(m,all.total[i])),
   products:line(byProduct),qtyTotal:repFmt(byProduct.metrics[0],byProduct.total[0]),free:free.metrics.map((m,i)=>m.label+' '+repFmt(m,free.total[i]))};
 });
 eq('Products sold: сумма строк = итог заказа до HST до цента; цена руками — своя строка',
  {goods:sold.goods[0]===sold.goods[1],withCharges:sold.withCharges[0]===sold.withCharges[1],hand:sold.hand},{goods:true,withCharges:true,hand:[-0.6]});
 eq('Products sold: петли, отверстия — штуки по видам Works; плёнка — ft² × слои; итоги в деньгах и мерах; количество разных единиц не складывается; переделка без оплаты — $0',
  {cats:sold.cats,fab:sold.fab,film:sold.film,all:sold.all,products:sold.products,qtyTotal:sold.qtyTotal,free:sold.free},
  {cats:["Edgework","Fabrication","Glass","Interlayer","Order charges","Price set by hand"],fab:["Hinge 4 / $60.00 / $15.00","Hole 2 / $12.00 / $6.00"],film:["EVA Clear · ft² 40 / 10 / $200.00 / $5.00"],
   all:["Amount $512.80","Units 4","Unit ft² 35","Glass ft² 45","Film ft² 40","Linear in 728","Pieces 6"],products:["Flat Polish · in 304","Hinge · pcs 4","Hole 1/2″–1″ · pcs 2","Rough Arris · in 424"],qtyTotal:"—",free:["Amount $0.00","Glass ft² 10","By price list $1.52"]});

 eq('Products sold: график за месяц считает только заказы месяца — итог тот же, что из всех строк',await t.p.evaluate(()=>{
  const old=DB.salesOrder.find(o=>o.noCharge);old.createdAt='2025-01-15T12:00:00.000Z';old.updatedAt=new Date().toISOString();
  repSoldCache={stamp:'',sets:new Map()};repSoldByOrder=new Map();
  const month=repQuery({source:'sold',date:{preset:'thisMonth'},metrics:['amount','orders']}),counted=[...repSoldByOrder.keys()].map(id=>salesRecord(id).noCharge?'old':'new');
  const r=repPresetRange('thisMonth'),all=repSoldFacts().filter(x=>x.created>=r[0]&&x.created<=r[1]);
  return {counted,same:month.total[0]===all.reduce((n,x)=>n+(x.amount||0),0),orders:month.total[1]};
 }),{counted:['new'],same:true,orders:1});

 /* Владелец, 26.10.2026: «что ждёт, что не ждёт, что овердью, что уже
    готово, а что нет». */
 eq('Shop now: не проверен · ждёт батча · ждёт станцию N дней · готово; просрочено — срок прошёл, а не готово; готовый самовывоз — не просрочен; колонки — по ходу работы',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Cityline Glass & Mirror'}),who={id:'u1',name:'Nazar'},day=n=>repAddDays(finToday(),n);
  const mk=due=>rbOrder(c,'6CLEAR','single',[[30,40,2]],{dueDate:due,delivery:'pickup'});
  const A=mk(day(-2)),B=mk(day(-1)),C=mk(day(3)),D=mk(day(5));
  rbBatch([A,B]);salesSetRecordStatus(C,'verified');rbIds(A).forEach(p=>rbGo('CUT',p,who,rbAt(-3,0,0)));oqReady(B);
  const rows=repShopFacts(),of=id=>rows.filter(r=>r.orderId===id),txt=id=>[...new Set(of(id).map(r=>r.where+' · '+r.stage+' · '+r.state))].join(' | ');
  const q=repQuery({source:'shopnow',date:{preset:'all'},metrics:['glass','orders','overdueOrders','over']});
  return {A:txt(A),Adays:of(A).map(r=>r.days+'/'+r.daysOver+' from '+r.from),B:txt(B),C:txt(C)+' '+of(C).length,D:txt(D)+' '+of(D).map(r=>r.glassN),total:q.total,cols:repQuery({source:'shopnow',date:{preset:'all'},dims:['customer','where'],metrics:['glass']}).keys2};
 }),{A:'ARRIS · In production · Overdue',Adays:['3/2 from CUT','3/2 from CUT'],B:'Ready · Ready · Ready',C:'To batch · Not started · Due later 2',D:'To verify · Not started · Due later 2',total:[8,4,1,2],cols:['To verify','To batch','ARRIS','Ready']});
 eq('Sheets cut: лист — тому, кто первым резал с него; лопнувший на столе — отдельно; Undo не считается',await t.p.evaluate(()=>{
  oqReset();DB.cutPlan=[];DB.sheetBreak=[];DB.stockOffcut=[];DB.glassSheet=[];DB.cutting=cutSettingsDefault();
  DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:96,sheetHIn:130,availability:'stock'}));
  const c=oqCustomer({legalName:'Northside Windows'}),roman={id:'u1',name:'Roman'},dmytro={id:'u2',name:'Dmytro'};
  const id=rbOrder(c,'6CLEAR','single',[[46,60,4],[34,52,5]]);rbBatch([id]);const n=DB.glassBatch[DB.glassBatch.length-1].number;const r=cutPlanRun(n);if(r&&r.error)throw new Error(r.error);
  const sheets=cutPlanFor(n).groups[0].sheets;sheets.forEach((s,i)=>s.pieces.forEach(p=>rbGo('CUT',p.piece,i?dmytro:roman)));
  stationSheetBreak(n,'6CLEAR',sheets[0].no,roman);const b=stationSheetBreak(n,'6CLEAR',sheets[1].no,dmytro).rec;b.undoneAt=new Date().toISOString();touch();
  const q=repQuery({source:'sheetcut',date:{preset:'all'},dims:['person'],metrics:['sheets','broke','area'],sort:{by:'label',dir:'asc'}});
  return {sheets:sheets.length,by:q.keys.map(k=>k+' '+q.rowTotals.get(k).map((v,i)=>repFmt(q.metrics[i],v)).join(' / '))};
 }),{sheets:2,by:['Dmytro 1 / 0 / 86.7','Roman 1 / 1 / 86.7']});
 /* Часть «Склад» плана отчётов (владелец, 26.10.2026): пересчёт — было →
    стало, разница и причина; меры раздельно, без денег; видит Inventory. */
 eq('Stock counts: лист 62 → 61 с причиной — недостача 1 лист и 86.7 ft²; герметик в kg без причины — No reason; разные единицы итогом не складываются; причина переживает F5',await t.p.evaluate(()=>{
  oqReset();DB.inventoryEvent=[];DB.consumableEvent=[];DB.cutPlan=[];DB.sheetBreak=[];DB.stationScan=[];DB.purchaseReceipt=[];const key='6CLEAR|130x96';
  invAdd(key,'62','Opening stock');invCountSave({[key]:'61'},{[key]:{reason:'Miscount',note:'second rack'}});
  const s=consRows().find(r=>r.table==='sealantProduct'),k=s.key,base=s.onHand;
  consCountSave({[k]:String(base+12.5)});consCountSave({[k]:String(base+10)},{[k]:{reason:'Used without scan'}});normalizeConsumables();
  const q=repQuery({source:'counts',date:{preset:'all'},dims:['material'],metrics:['count','short','over','diff'],sort:{by:'label',dir:'asc'}});
  const n=repQuery({source:'counts',date:{preset:'all'},metrics:['count','off','days','sheets','sheetFt2','sealantKg','spacerFt']}),fmt=(res,v)=>v.map((x,i)=>repFmt(res.metrics[i],x)).join(' / ');
  return {rows:q.keys.map(x=>x.replace(s.name,'Sealant')+': '+fmt(q,q.rowTotals.get(x))),total:fmt(q,q.total),n:fmt(n,n.total),lines:repCountFacts().map(r=>r.dir+' '+r.reason+(r.note?' · '+r.note:''))};
 }),{rows:['6CLEAR · 130 × 96 · sheets: 1 / 1 / 0 / -1','Sealant · kg: 2 / 1 / 1 / 10'],total:'3 / 2 / 1 / —',n:'3 / 3 / 1 / -1 / -86.7 / 10 / 0',
  lines:['Short Miscount · second rack','Over No reason','Short Used without scan']});
 eq('Склад в отчётах — только с галочкой Inventory: источников нет в выборе, графики пишут «Needs Inventory access»',await t.p.evaluate(()=>{
  const old=window.accessCan,r=repClean(REP_STARTERS().find(x=>x.id==='RP-start-counts'));window.accessCan=k=>k!=='inventory';
  try{return {allowed:['counts','moves','igumat'].map(repSourceAllowed),chart:repChart(r,r.pages[0].widgets[0]),pick:/value="(counts|moves|igumat)"/.test(repSrcOptions('glass')),payments:repSourceAllowed('payments')};}
  finally{window.accessCan=old;}
 }),{allowed:[false,false,false],chart:'<div class="mut">Needs Inventory access.</div>',pick:false,payments:true});
 eq('Sheets · in and out: добавлено, порезано, лопнуло, поправка пересчётом, списано — по движению и листу; Build листов не двигает',await t.p.evaluate(()=>{
  oqReset();DB.cutPlan=[];DB.sheetBreak=[];DB.stockOffcut=[];DB.glassSheet=[];DB.inventoryEvent=[];DB.consumableEvent=[];DB.cutting=cutSettingsDefault();
  DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:96,sheetHIn:130,availability:'stock'}));
  const key='6CLEAR|130x96',who={id:'u1',name:'Roman'};invAdd(key,'62','Opening stock');
  const id=rbOrder(oqCustomer({legalName:'Northside Windows'}),'6CLEAR','single',[[46,60,4],[34,52,5]]);rbBatch([id]);const n=DB.glassBatch[DB.glassBatch.length-1].number,r=cutPlanRun(n);if(r&&r.error)throw new Error(r.error);
  const sheets=cutPlanFor(n).groups[0].sheets;sheets.forEach(s=>s.pieces.forEach(p=>rbGo('CUT',p.piece,who)));stationSheetBreak(n,'6CLEAR',sheets[0].no,who);
  invCountSave({[key]:String(invRowFind(key).onRack-1)},{[key]:{reason:'Miscount'}});invWriteOff(key,'1','Broken on rack');
  const q=repQuery({source:'moves',date:{preset:'all'},dims:['kind'],metrics:['sIn','sOut'],sort:{by:'label',dir:'asc'}}),b=repQuery({source:'moves',date:{preset:'all'},dims:['sheet'],metrics:['sIn','sOut','net','netFt2']});
  return {sheets:sheets.length,kinds:q.keys.map(k=>k+' '+q.rowTotals.get(k).join('/')),bySheet:b.keys.map(k=>k+' '+b.rowTotals.get(k).map((v,i)=>repFmt(b.metrics[i],v)).join('/')),
   reasons:repSheetMoveFacts().filter(x=>x.reason).map(x=>x.kind+' '+x.reason).sort(),person:repQuery({source:'moves',date:{preset:'all'},dims:['person'],metrics:['sOut'],filters:[{f:'kind',op:'in',v:['Cut','Sheet broke']}]}).keys};
 }),{sheets:2,kinds:['Add 62/0','Count 0/1','Cut 0/2','Sheet broke 0/1','Write off 0/1'],bySheet:['6CLEAR · 130 × 96 62/5/57/4,940'],
  reasons:['Add Opening stock','Count Miscount','Write off Broken on rack'],person:['Roman']});
 eq('IGU materials used: юниты по скану сборки — рамка ft по рецепту юнита, по дню и тому, кто собрал; график за сегодня не считает юнит месяц назад; ушедшее в архив — итогом без дня; подгруженное из архива не считается дважды; ft и kg итогом не складываются',await t.p.evaluate(()=>{
  oqReset();DB.inventoryArchived={};const id=oqOrder(oqCustomer({}));oqThrough(id,'verified');const o=salesRecord(id);glassBatchAssign(glassBatchRows([o]),{});
  const l=o.lines[0],per=consPerUnit(l,o),sp=[...per.keys()].find(k=>k.startsWith('spacerVariant:')),fx=v=>+(+v).toFixed(3),ft=fx(per.get(sp));
  DB.glassPiece.filter(p=>p.key.split('|')[1]===l.id).forEach(p=>{DB.stationScan.push({id:stationScanNextId(),at:new Date().toISOString(),piece:p.ids[0],station:'IGU',by:'Andrei',byId:'',asm:'SC-9100001',unit:1});
   DB.stationScan.push({id:stationScanNextId(),at:rbAt(-40,10,0),piece:p.ids[1],station:'IGU',by:'Oleh',byId:'',asm:'SC-9100002',unit:2});});
  const first=DB.stationScan.find(s=>s.asm==='SC-9100001').id,spacer=[{f:'kind',op:'in',v:['Spacers']}];
  const by=res=>res.keys.map(k=>{const v=fx(res.rowTotals.get(k)[0]);return k+' '+(v===ft?'1 unit':v===fx(2*ft)?'2 units':v);});
  const today=repQuery({source:'igumat',date:{preset:'today'},metrics:['units','spacerFt'],filters:spacer});
  DB.inventoryArchived={cons:{[sp]:{used:5,unknown:0}}};
  const all=repQuery({source:'igumat',date:{preset:'all'},dims:['record'],metrics:['spacerFt'],filters:spacer,sort:{by:'label',dir:'asc'}}),day=repQuery({source:'igumat',date:{preset:'today'},metrics:['spacerFt'],filters:spacer});
  /* Отчёт подгрузил сегодняшний юнит из архива: его расход уже в итоге архива. */
  DB.inventoryArchived.cons[sp].used=5+per.get(sp);storageVisit.set('stationScan',new Set([first]));
  let loaded;try{loaded=repQuery({source:'igumat',date:{preset:'all'},dims:['record'],metrics:['spacerFt'],filters:spacer,sort:{by:'label',dir:'asc'}});}finally{storageVisit.delete('stationScan');DB.inventoryArchived={};}
  const who=repQuery({source:'igumat',date:{preset:'all'},dims:['person'],metrics:['units'],filters:spacer,sort:{by:'label',dir:'asc'}});
  return {units:today.total[0],spacer:fx(today.total[1])===ft&&ft>0,all:by(all),day:fx(day.total[0])===ft,loaded:by(loaded),person:who.keys.map(k=>k+' '+who.rowTotals.get(k)[0]),
   mixed:repQuery({source:'igumat',date:{preset:'all'},metrics:['qty']}).total[0]};
 }),{units:1,spacer:true,all:['Archived · total only 5','By scan 2 units'],day:true,loaded:['Archived · total only 5','By scan 2 units'],person:['Andrei 1','Oleh 1'],mixed:null});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
