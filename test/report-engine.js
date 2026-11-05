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
 eq('Подсказки: у каждого поля и показателя каждого источника есть пояснение — вид и что это',await t.p.evaluate(()=>{
  const bad=[];Object.keys(REP_SRC).forEach(k=>{const S=REP_SRC[k];repDimOptions(S).concat(repMetricOptions(S)).forEach(o=>{if(!o[2]||o[2].length<8)bad.push(k+':'+o[0]);});});
  const S=REP_SRC.batches,m=repMetricOptions(S).map(o=>o[0]+'='+o[2]).filter(x=>/^(distinct|count):glass=/.test(x));
  return {bad,m,f:repDimOptions(S).find(o=>o[0]==='glass')[2]};
 }),{bad:[],m:['count:glass=Glass · count — rows where Glass is filled','distinct:glass=Glass · distinct — how many different Glass values'],f:'Glass — glass type (list, group or filter by it)'});

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
 }),{ids:['RP-start-balances','RP-start-cut','RP-start-km','RP-start-mycustomers','RP-start-myday','RP-start-myedge','RP-start-offcuts','RP-start-payments','RP-start-quotes','RP-start-sizes','RP-start-sold'].concat(['RP-start-myasm','RP-start-mycut','RP-start-mydrill','RP-start-myship','RP-start-sheetcut','RP-start-shopnow','RP-start-counts','RP-start-igumat','RP-start-sheetmoves','RP-start-stages','RP-start-salesmonth','RP-start-batches','RP-start-pursupplier','RP-start-purbalances','RP-start-payorders','RP-start-agents','RP-start-customers','RP-start-plan','RP-start-stock']).sort(),again:30,seed:14});
 eq('Км рейса по карте Google: цех → остановки → цех, запоминаются за рейс; отчёт — км и км на рейс; поменяли остановки — видно',await t.p.evaluate(async()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'});DB.truck=[{id:'T1',name:'Truck 1',active:true}];DB.tripKm=[];
  DB.company=Object.assign({},DB.company,{address1:'10 Shop Rd',city:'Vaughan',province:'ON'});
  const calls=[];window.google={maps:{DirectionsService:function(){this.route=(req,cb)=>{calls.push([req.origin,req.destination,req.waypoints.map(w=>w.location)]);cb({routes:[{legs:req.waypoints.map(()=>({distance:{value:12000}})).concat([{distance:{value:8000}}])}]},'OK');};}}};
  const ids=[1,2].map(()=>rbOrder(c,'6CLEAR','double',[[30,40,1]],{delivery:'delivery'}));rbBatch(ids);ids.forEach(id=>oqReady(id));
  const ps=ids.map((id,i)=>shippingCreate({customerId:c.id,method:'delivery',shipTo:{address1:(i+1)+' Main St',city:i?'Brampton':'Mississauga',province:'ON'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem)}).value);
  ps.forEach((s,i)=>{s.truckId='T1';s.stop=i+1;});touch();
  const rec=await tripKmCalc(finToday(),'T1');const q=repQuery({source:'deliveries',date:{preset:'today'},metrics:['km','trips','kmPerTrip']});
  tab='shipping';shippingTab='delivery';deliveryDate='';deliveryPill='T1';render();const chip=[...document.querySelector('[data-trip-km="T1"]').children].map(x=>x.textContent.trim()).filter(Boolean).join('|');
  ps[1].stop=3;const p3=ps[1];p3.stop=1;ps[0].stop=2;touch();render();const stale=/stops changed/.test(document.querySelector('[data-trip-km="T1"]').textContent);
  delete window.google;deliveryPill='';tab='dashboard';render();
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
  salesApplyCustomerDefaults(c.id);soDraft.customerPo='PO-QA';salesOrderSave();const A=soDraft.id;soDraft=null;soEdit=null;rbBatch([A]);
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
 }),{start:'created,created',copy:'due,due',seed:14});

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
   salesApplyCustomerDefaults(c.id);if(!soDraft.customerPo&&!salesIsQuote(soDraft))soDraft.customerPo='PO-T';Object.assign(soDraft,extra||{});if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('Order did not save');const id=soDraft.id;soDraft=null;soEdit=null;return id;};
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

 /* Часть «этапы заказов + батчи» плана отчётов (владелец, 26.10.2026):
    дни на каждом этапе; этапа не было — пусто, а не 0. */
 eq('Orders · days at each stage: новый → проверен 1 день, → батч 2, → готов 3; без Verify — пусто; без батча — пусто, готов → выдан 3',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Northside Windows'}),mk=()=>rbOrder(c,'6CLEAR','single',[[30,40,1]]),A=mk(),B=mk(),C=mk(),at=n=>rbAt(n,10,0);
  const set=(id,status,d)=>{const o=salesRecord(id);o.status=status;o.statusDates=d;o.updatedAt=new Date().toISOString();};
  set(A,'ready',{new:at(-6),verified:at(-5),batched:at(-3),ready:at(0)});set(B,'new',{new:at(-2)});set(C,'done',{new:at(-9),verified:at(-8),ready:at(-4),done:at(-1)});
  const row=id=>repOrderFacts().find(r=>r.id===id),txt=id=>{const r=row(id);return [r.dVerify,r.dBatch,r.dReady,r.dDone].map(v=>v==null?'—':v).join('/');};
  const q=repQuery({source:'orders',date:{preset:'all'},metrics:['count','dVerify:avg','dBatch:avg','dReady:avg','dDone:avg']});
  return {A:txt(A),B:txt(B),C:txt(C),avg:q.total.map((v,i)=>repFmt(q.metrics[i],v)),batched:row(A).stBatched===repDay(at(-3))};
 }),{A:'1/2/3/—',B:'—/—/—/—',C:'1/—/—/3',avg:['3','1','2','3','3'],batched:true});
 eq('Batches: батч из двух заказов — строка на заказ, листы раскроя один раз; дни до первого реза сразу, до последнего — когда порезано всё',await t.p.evaluate(()=>{
  oqReset();DB.cutPlan=[];DB.sheetBreak=[];DB.stockOffcut=[];DB.glassSheet=[];DB.cutting=cutSettingsDefault();
  DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:96,sheetHIn:130,availability:'stock'}));
  const c=oqCustomer({legalName:'Northside Windows'}),who={id:'u1',name:'Roman'},A=rbOrder(c,'6CLEAR','single',[[46,60,4]]),B=rbOrder(c,'6CLEAR','single',[[34,52,5]]);
  rbBatch([A,B]);const b=DB.glassBatch[DB.glassBatch.length-1],r=cutPlanRun(b.number);if(r&&r.error)throw new Error(r.error);b.createdAt=rbAt(-2,9,0);
  const sheets=cutPlanFor(b.number).groups[0].sheets.length,days=()=>repBatchFacts().map(x=>[x.daysFirst,x.daysLast].map(v=>v==null?'—':v).join('/'));
  rbIds(A).forEach(p=>rbGo('CUT',p,who,rbAt(-1,9,0)));const half=days();
  rbIds(B).forEach(p=>rbGo('CUT',p,who,rbAt(0,9,0)));
  const q=repQuery({source:'batches',date:{preset:'all'},metrics:['batches','glassN','orders','sheets','daysFirst','daysLast']});
  return {sheets,half,all:days(),rows:repBatchFacts().map(x=>[x.order===salesRecord(A).businessNumber?'A':'B',x.glassN,x.glassCut,x.sheets,x.status].join('/')),total:q.total.map((v,i)=>repFmt(q.metrics[i],v))};
 }),{sheets:2,half:['1/—','—/—'],all:['1/2','—/—'],rows:['A/4/4/2/Cut','B/5/5/0/Cut'],total:['1','9','2','2','1','2']});

 /* Скорость на годе (27.10.2026): площадь, вес и сумма заказа считаются,
    когда их читает график, — отчёт по срокам их не ждёт. Числа те же. */
 eq('Orders: площадь, вес и сумма — только когда их читает график; отчёт без них их не считает; числа те же, что расчёт заново',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Northside Windows'}),A=rbOrder(c,'6CLEAR','single',[[30,40,2],[24,36,1]]),o=salesRecord(A);repOrderCache={stamp:'',rows:null};
  const row=()=>repOrderFacts().find(r=>r.id===A),open=()=>['area','kg','total'].map(k=>!!Object.getOwnPropertyDescriptor(row(),k).get);
  repQuery({source:'orders',date:{preset:'all'},metrics:['count','late','onTime','dBatch:avg']});const before=open();
  const q=repQuery({source:'orders',date:{preset:'all'},metrics:['total','area']}),after=open();
  const t=finOrderTotals(o),area=finWithOrder(o,()=>o.lines.reduce((n,l)=>n+salesLineAreas(l,o).actual*l.qty,0));
  let kg=0;finWithOrder(o,()=>o.lines.forEach(l=>{kg+=salesLineWeight(l,o).lineKg;}));
  return {before,after,total:row().total===t.grand&&q.total[0]===t.grand,area:Math.abs(row().area-area)<1e-9&&q.total[1]===row().area,kg:kg>0&&Math.abs(row().kg-kg)<1e-9,keys:Object.keys(row()).filter(k=>['area','kg','total'].includes(k)).sort()};
 }),{before:[true,true,true],after:[false,true,false],total:true,area:true,kg:true,keys:['area','kg','total']});

 /* Часть «закупки» плана отчётов (владелец, 26.10.2026): галочка Purchasing,
    деньги — в валюте документа, бой — один раз, счёт на два PO — одной строкой. */
 eq('Purchasing · PO lines: заказано, пришло, ждёт; сумма в валюте PO — CAD и USD итогом не складываются, по Account — каждая своя',await t.p.evaluate(()=>{
  ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchaseInvoice','purchasePayment'].forEach(k=>{DB[k]=[];DB[k+'Seq']=0;});
  const cad=purSupplierSave({name:'Report Glass CAD'}).value,usd=purSupplierSave({name:'Report Glass US',currency:'USD'}).value,g=glassProductByCode('6CLEAR');
  window.rpPO1=purOrderSave({supplierId:cad.id,state:'sent',date:'2026-10-01',expectedDate:'2026-10-10',lines:[{id:'a',kind:'glass',productId:g.id,qty:10,unit:'sheet',priceUnit:'sheet',price:100,widthIn:130,heightIn:96}]}).value;
  window.rpPO2=purOrderSave({supplierId:usd.id,currency:'USD',state:'sent',date:'2026-10-02',lines:[{id:'b',kind:'other',description:'Gloves',qty:5,unit:'each',price:20}]}).value;
  purFulfilSave('receipt',{poId:rpPO1.id,supplierId:cad.id,date:'2026-10-13',lines:[{id:'r1',poLineId:'a',kind:'glass',productId:g.id,qty:4,damaged:1,unit:'sheet',widthIn:130,heightIn:96,reason:'Broken in transit',resolution:'Credit'}]});
  const q=(m,d)=>repQuery({source:'purlines',date:{preset:'all'},metrics:m,dims:d||[]}),all=q(['amount','lines','pos']),acc=q(['amount'],['account']);
  return {rows:repPurLineFacts().map(r=>[r.po,r.qty,r.received,r.remaining,r.amount,r.currency,r.status].join('/')),total:all.total.map((v,i)=>repFmt(all.metrics[i],v)),
   acc:acc.keys.map(k=>k+' '+repFmt(acc.metrics[0],acc.rowTotals.get(k)[0]))};
 }),{rows:['PO-0001/10/4/6/1000/CAD/Partially received','PO-0002/5/0/5/100/USD/Sent'],total:['—','2','2'],acc:['Report Glass CAD · CAD $1,000.00','Report Glass US · USD $100.00']});
 eq('Supplier receipts: бой — один раз, у блока — в листах; замена — своя строка, не новый приход; опоздание — к ожидаемой дате PO',await t.p.evaluate(()=>{
  const g=glassProductByCode('6CLEAR'),cad=purSupplierFind(rpPO1.supplierId);
  purFulfilSave('receipt',{poId:rpPO1.id,supplierId:cad.id,date:'2026-10-09',lines:[{id:'r2',poLineId:'a',kind:'glass',productId:g.id,qty:3,unit:'sheet',widthIn:130,heightIn:96},{id:'r3',poLineId:'a',kind:'glass',productId:g.id,qty:1,unit:'sheet',replacement:true}]});
  window.rpPO3=purOrderSave({supplierId:cad.id,state:'sent',date:'2026-10-05',lines:[{id:'c',kind:'glass',productId:g.id,qty:2,unit:'block',sheetsPerBlock:20,widthIn:130,heightIn:96}]}).value;
  purFulfilSave('receipt',{poId:rpPO3.id,supplierId:cad.id,date:'2026-10-14',lines:[{id:'r4',poLineId:'c',kind:'glass',productId:g.id,qty:1,unit:'block',actualSheets:20,damagedSheets:2,widthIn:130,heightIn:96}]});
  const q=repQuery({source:'purreceipts',date:{preset:'all'},metrics:['receipts','lines','late','onTime','broken','brokenLines','sheets']}),a=purOrderFind(rpPO1.id);
  return {rows:repPurReceiptFacts().map(r=>[r.receipt,r.arrival,r.state,r.daysLate==null?'—':r.daysLate,r.broken].join('/')),total:q.total.map((v,i)=>repFmt(q.metrics[i],v)),
   po:[purReceived(a,a.lines[0]).received,repPurLineFacts().find(r=>r.po==='PO-0001').remaining]};
 }),{rows:['GR-0001/New/Late/3/1','GR-0002/New/On time/0/0','GR-0002/Replacement/On time/0/0','GR-0003/New/No expected date/—/2'],total:['3','4','1','67%','3','2','28'],po:[7,3]});
 eq('Supplier bills: счёт на два PO — одна строка, оплата — своя; Balance по поставщику и валюте — как Purchasing → Invoices; просрочка; CAD и USD итогом не складываются',await t.p.evaluate(()=>{
  const cad=purSupplierFind(rpPO1.supplierId),usd=purSupplierFind(rpPO2.supplierId);
  const inv=purMoneySave('invoice',{supplierId:cad.id,currency:'CAD',invoiceNumber:'INV-7',date:'2026-10-01',dueDate:'2026-10-15',amount:1500,poIds:[rpPO1.id,rpPO3.id]}).value;
  purMoneySave('payment',{supplierId:cad.id,currency:'CAD',invoiceId:inv.id,date:'2026-10-20',method:'Bank transfer',amount:500});
  purMoneySave('invoice',{supplierId:usd.id,currency:'USD',invoiceNumber:'U-1',date:'2026-10-02',amount:100,poIds:[rpPO2.id]});
  const q=(m,d)=>repQuery({source:'purbills',date:{preset:'all'},metrics:m,dims:d||[]}),acc=q(['invoiced','paid','net','overdue'],['account']);
  return {rows:repPurBillFacts().map(r=>[r.kind,r.doc,r.pos,r.invoiced,r.paid,r.net,r.overdue].join('/')),acc:acc.keys.map(k=>k+' '+acc.rowTotals.get(k).map((v,i)=>repFmt(acc.metrics[i],v)).join(' ')),
   total:q(['net']).total[0],accounts:purSupplierAccounts().map(a=>a.supplierName+' · '+a.currency+' '+a.knownBalance).sort(),paidDays:repPurBillFacts().find(r=>r.kind==='Payment').daysToPay};
 }),{rows:['Invoice/INV-7 · Report Glass CAD/PO-0001, PO-0003/1500//1500/1000','Invoice/U-1 · Report Glass US/PO-0002/100//100/0','Payment/PP-0001 · Report Glass CAD/PO-0001, PO-0003//500/-500/0'],
  acc:['Report Glass CAD · CAD $1,500.00 $500.00 $1,000.00 $1,000.00','Report Glass US · USD $100.00 — $100.00 $0.00'],total:null,accounts:['Report Glass CAD · CAD 1000','Report Glass US · USD 100'],paidDays:19});
 eq('Закупки в отчётах — только с галочкой Purchasing: источников нет в выборе, графики пишут «Needs Purchasing access»',await t.p.evaluate(()=>{
  const old=window.accessCan,r=repClean(REP_STARTERS().find(x=>x.id==='RP-start-purbalances'));window.accessCan=k=>k!=='purchasing';
  try{return {allowed:['purlines','purreceipts','purbills'].map(repSourceAllowed),chart:repChart(r,r.pages[0].widgets[0]),pick:/value="(purlines|purreceipts|purbills)"/.test(repSrcOptions('glass'))};}
  finally{window.accessCan=old;}
 }),{allowed:[false,false,false],chart:'<div class="mut">Needs Purchasing access.</div>',pick:false});

 /* Часть «финансы и агенты» плана отчётов (владелец, 26.10.2026). */
 await t.p.evaluate(()=>{
  window.rfPay=(customerId,date,amount,alloc)=>{DB.receipt.push(normalizeReceipt({number:'R-'+String(DB.receipt.length+1).padStart(4,'0'),customerId,date,method:'cheque',reference:'#'+(DB.receipt.length+1),amount,allocations:alloc}));return DB.receipt[DB.receipt.length-1];};
  window.rfSeed=()=>{oqReset();DB.receipt=[];DB.refund=[];DB.referrer=[];DB.referrerPayout=[];DB.financeTerms=[];
   const c=oqCustomer({legalName:'Northside Windows'}),A=rbOrder(c,'6CLEAR','single',[[30,40,2]]),B=rbOrder(c,'6CLEAR','single',[[24,36,1]]),a=salesRecord(A);
   a.status='done';a.statusDates=Object.assign({},a.statusDates,{done:'2026-10-01T15:00:00.000Z'});a.updatedAt=new Date().toISOString();
   rfPay(c.id,'2026-09-25',100,[{orderId:A,amount:100}]);rfPay(c.id,'2026-10-04',250,[{orderId:A,amount:200},{orderId:B,amount:50}]);return {c,A,B};};
 });
 eq('Payments by order: оплата на два заказа — две строки, сумма — сколько пришло на заказы; до счёта — Before billing; к сроку Net 30 — On time, после — Late; дни — от счёта',await t.p.evaluate(()=>{
  const {c,A}=rfSeed();rfPay(c.id,'2026-11-05',20,[{orderId:A,amount:20}]);const n={[salesRecord(A).businessNumber]:'A'},q=repQuery({source:'payorders',date:{preset:'all'},metrics:['amount','payments','orders','lateAmount','daysToPay']});
  return {due:finPaymentDue(salesRecord(A)),rows:repPayOrderFacts().map(r=>[r.receipt,n[r.order]||'B',r.state,r.amount,r.daysToPay==null?'—':r.daysToPay].join('/')),total:q.total.map((v,i)=>repFmt(q.metrics[i],v))};
 }),{due:'2026-10-31',rows:['R-0001/A/Before billing/100/—','R-0002/A/On time/200/3','R-0002/B/Before billing/50/—','R-0003/A/Late/20/35'],total:['$370.00','4','2','$20.00','19']});
 eq('Refunds: возврат — с какой оплаты, сколько дней спустя, причина; аннулированный не считается',await t.p.evaluate(()=>{
  const {c}=rfSeed(),r=rfPay(c.id,'2026-10-05',80,[]);finCreateRefund({receiptId:r.id,amount:30,date:'2026-10-07',method:'cheque',reason:'Overpaid'});
  const v=finCreateRefund({receiptId:r.id,amount:10,date:'2026-10-08',method:'cash',reason:'Mistake'});finVoidRefund(v.id,'Typo');
  const q=repQuery({source:'refunds',date:{preset:'all'},metrics:['amount','count']});
  return {rows:repRefundFacts().map(x=>[x.refund,x.receipt,x.amount,x.reason,x.days].join('/')),total:q.total.map((v,i)=>repFmt(q.metrics[i],v))};
 }),{rows:['RF-0001/R-0003/30/Overpaid/2'],total:['$30.00','1']});
 eq('Agent commissions: строка на агента и заказ; по агенту — начислено, выплачено и к выплате как на экране Agents; после выплаты заказ закрыт',await t.p.evaluate(()=>{
  const {c,A,B}=rfSeed(),ref=comSave({name:'Sergey Petrov',customers:[{customerId:c.id,pct:5}]}).value;comPayoutAdd({referrerId:ref.id,date:'2026-10-10',orderIds:[A]});
  const s=comSummary(comFind(ref.id),null),q=repQuery({source:'commissions',metrics:['com','paidOut','due','dueHst','owed'],dims:['agent']}),row=q.rowTotals.get('Sergey Petrov');
  const near=(a,b)=>Math.abs(a-b)<0.005,by=id=>repCommissionFacts().find(r=>r.order===salesRecord(id).businessNumber);
  return {keys:q.keys,same:[near(row[0],s.earned),near(row[1],s.paidOut),near(row[2],s.toPay),near(row[3],s.toPayHst)],owed:row[4],a:by(A).due,b:by(B).due>0&&near(by(B).due,by(B).com)};
 }),{keys:['Sergey Petrov'],same:[true,true,true,true],owed:1,a:0,b:true});
 eq('Оплаты и возвраты — только с Finance, комиссии — только с Commissions: без галочки источника нет, график пишет, какой галочки не хватает',await t.p.evaluate(()=>{
  const old=window.accessCan,agents=repClean(REP_STARTERS().find(x=>x.id==='RP-start-agents')),pays=repClean(REP_STARTERS().find(x=>x.id==='RP-start-payorders'));
  try{window.accessCan=k=>k!=='commissions';const a={commissions:repSourceAllowed('commissions'),payorders:repSourceAllowed('payorders'),chart:repChart(agents,agents.pages[0].widgets[0])};
   window.accessCan=k=>k!=='finance';const b={payorders:repSourceAllowed('payorders'),refunds:repSourceAllowed('refunds'),commissions:repSourceAllowed('commissions'),chart:repChart(pays,pays.pages[0].widgets[0])};return {a,b};}
  finally{window.accessCan=old;}
 }),{a:{commissions:false,payorders:true,chart:'<div class="mut">Needs Commissions access.</div>'},b:{payorders:false,refunds:false,commissions:true,chart:'<div class="mut">Needs Finance access.</div>'}});

 /* Часть «клиенты» плана отчётов (владелец, 26.10.2026). */
 eq('Customers: последний заказ и дней с него, давность; новые — по первому заказу; квота и отменённый не считаются; ушедший в архив — из указателя архива',await t.p.evaluate(()=>{
  oqReset();const A=oqCustomer({legalName:'Avalon Glass'}),B=oqCustomer({legalName:'Birch Windows'}),C=oqCustomer({legalName:'Cedar Homes'}),D=oqCustomer({legalName:'Dune Interiors'});
  const at=(id,days,extra)=>{const o=salesRecord(id);o.createdAt=rbAt(-days,10,0);Object.assign(o,extra||{});o.updatedAt=new Date().toISOString();return o;};
  const a1=rbOrder(A,'6CLEAR','single',[[30,40,1]]),a2=rbOrder(A,'6CLEAR','single',[[24,36,2]]),b1=rbOrder(B,'6CLEAR','single',[[30,40,1]]);
  at(a1,200);at(a2,100);at(b1,10);at(rbOrder(B,'6CLEAR','single',[[30,40,1]]),2,{status:'cancelled'});at(rbOrder(B,'6CLEAR','single',[[30,40,1]],{kind:'quote'}),1);
  archiveIndex.set('ARCH-T1',{kind:'order',status:'done',customerId:C.id,createdAt:rbAt(-400,10,0),row:{total:500}});
  try{
   const rows=repCustomerFacts(),r=c=>rows.find(x=>x.customerId===c.id),f=c=>[r(c).orders,r(c).daysSince==null?'—':r(c).daysSince,r(c).recency].join('/');
   const q=repQuery({source:'customers',metrics:['customers','buying','active','lapsed','orders']}),tot=id=>finOrderTotals(salesRecord(id)).grand;
   return {A:f(A),B:f(B),C:f(C),D:f(D),first:r(A).firstOrder===repDay(rbAt(-200,10,0)),last:r(A).lastOrder===repDay(rbAt(-100,10,0)),total:[Math.abs(r(A).total-(tot(a1)+tot(a2)))<0.005,r(C).total,r(D).total],
    q:q.total};
  }finally{archiveIndex.delete('ARCH-T1');}
 }),{A:'2/100/91–180 days',B:'1/10/Ordered in 90 days',C:'1/400/Over a year',D:'0/—/No orders yet',first:true,last:true,total:[true,500,null],q:[4,3,1,1,4]});
 eq('Клиенты в отчётах — только с галочкой Customers: источника нет в выборе, график пишет «Needs Customers access»',await t.p.evaluate(()=>{
  const old=window.accessCan,r=repClean(REP_STARTERS().find(x=>x.id==='RP-start-customers'));window.accessCan=k=>k!=='customers';
  try{return {allowed:repSourceAllowed('customers'),chart:repChart(r,r.pages[0].widgets[0]),pick:/value="customers"/.test(repSrcOptions('glass'))};}
  finally{window.accessCan=old;}
 }),{allowed:false,chart:'<div class="mut">Needs Customers access.</div>',pick:false});

 /* Владелец, 03.11.2026: «ничего не ограничивать»; «показывать, что он грузится, в процентах». */
 eq('Без ограничений показа: 700 строк таблицы (дорисовка при прокрутке), 12 значений разбивки без Other, все полосы и доли, все дни за три года',await t.p.evaluate(()=>{
  const rows=Array.from({length:700},(_,i)=>({id:'q'+i,at:repAddDays('2023-01-01',i%1096),k:'K'+String(i).padStart(3,'0'),b:'B'+(i%12),n:1}));
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('k','K'),REP_F.dim('b','B'),REP_F.num('n','N')],metrics:[{k:'count',label:'Rows',agg:'count'}]};
  const w=type=>repCleanWidget({type,q:{source:'qa',dims:type==='table'?['k','b']:['k'],metrics:['count']}}),r=repClean({date:{preset:'all'},pages:[{widgets:[w('table'),w('bars'),w('pie')]}]});
  try{
   const res=repQuery({source:'qa',date:{},dims:['k','b'],metrics:['count'],filters:[]}),days=repQuery({source:'qa',date:{from:'2023-01-01',to:'2025-12-31'},dims:['at:day'],metrics:['count'],filters:[]}).keys.length;
   const box=document.createElement('div');document.body.appendChild(box);box.innerHTML=repChart(r,r.pages[0].widgets[0]);
   const el=box.querySelector('[data-rep-scroll]'),first=el.querySelectorAll('tbody tr').length;
   for(let i=0;i<10;i++){el.scrollTop=el.scrollHeight;repTableMore(el);}
   const all=el.querySelectorAll('tbody tr').length;
   box.innerHTML=repChart(r,r.pages[0].widgets[1]);const bars=box.querySelectorAll('.ch-hbar').length;box.innerHTML=repChart(r,r.pages[0].widgets[2]);const slices=box.querySelectorAll('.ch-pie-legend>span').length;box.remove();
   return {keys2:res.keys2.length,other:res.keys2.includes('__other'),first,all,bars,slices,days,colors:[0,7,8,16,30].map(repSeriesClass)};
  }finally{delete REP_SRC.qa;}
 }),{keys2:12,other:false,first:300,all:700,bars:700,slices:700,days:1096,colors:['ch-s1','ch-s8','ch-s9','ch-s17','ch-s7 ch-t2']});
 eq('Таблица: несколько измерений строк, как в Looker — «батч · стекло · толщина» своими колонками; в графиках — только первое',await t.p.evaluate(()=>{
  const rows=[{id:'1',at:'2024-01-01',k:'B-2',g:'6CLEAR',mm:'6 mm',n:1},{id:'2',at:'2024-01-01',k:'B-2',g:'6CLEAR',mm:'6 mm',n:1},{id:'3',at:'2024-01-01',k:'B-1',g:'4E272',mm:'4 mm',n:1}];
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('k','Batch'),REP_F.dim('g','Glass'),REP_F.dim('mm','Thickness'),REP_F.num('n','N')],metrics:[{k:'count',label:'Rows',agg:'count'}]};
  const w=type=>repCleanWidget({type,q:{source:'qa',dims:['k'],more:['g','mm'],metrics:['count'],sort:{by:'label',dir:'desc'}}}),r=repClean({date:{preset:'all'},pages:[{widgets:[w('table'),w('bars')]}]});
  try{
   const box=document.createElement('div');document.body.appendChild(box);box.innerHTML=repChart(r,r.pages[0].widgets[0]);
   const head=[...box.querySelectorAll('thead th:not(.sl-check)')].map(x=>x.textContent),body=[...box.querySelectorAll('tbody tr')].map(tr=>[...tr.children].filter(x=>!x.classList.contains('sl-check')).map(x=>x.textContent).join(' | ')),foot=box.querySelector('tfoot td:not(.sl-check)').colSpan;
   box.innerHTML=repChart(r,r.pages[0].widgets[1]);const bars=[...box.querySelectorAll('.ch-hbar-label')].map(x=>x.textContent);
   /* Наоборот: толщина, стекло, внутри батчи — по именам, группа подряд, повтор бледно. */
   const inv=repClean({date:{preset:'all'},pages:[{widgets:[repCleanWidget({type:'table',q:{source:'qa',dims:['mm'],more:['g','k'],metrics:['count']}})]}]});
   rows.push({id:'4',at:'2024-01-01',k:'B-3',g:'6CLEAR',mm:'6 mm',n:1});box.innerHTML=repChart(inv,inv.pages[0].widgets[0]);
   const grouped=[...box.querySelectorAll('tbody tr')].map(tr=>[...tr.children].filter(x=>!x.classList.contains('sl-check')).slice(0,3).map(x=>(x.classList.contains('rep-same')?'~':'')+x.textContent).join(' | '));box.remove();
   return {head,body,foot,bars,grouped};
  }finally{delete REP_SRC.qa;}
 }),{head:['Batch ▼','Glass','Thickness','Rows'],body:['B-2 | 6CLEAR | 6 mm | 2','B-1 | 4E272 | 4 mm | 1'],foot:3,bars:['B-2','B-1'],grouped:['4 mm | 4E272 | B-1','6 mm | 6CLEAR | B-2','~6 mm | ~6CLEAR | B-3']});
 eq('Печать: каждая страница отчёта — свой лист в своей ориентации, ширина как на экране, уменьшено только по ширине; что ниже края — не печатается, таблица целыми строками, «+ N more rows — CSV» и итог; граница листа; дни за годы — плотная гистограмма',await t.p.evaluate(async()=>{
  const rows=Array.from({length:700},(_,i)=>({id:'q'+i,at:'2024-01-01',k:'K'+String(i).padStart(3,'0'),n:1}));
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('k','K'),REP_F.num('n','N')],metrics:[{k:'count',label:'Rows',agg:'count'}]};
  const w=type=>({type,q:{source:'qa',dims:['k'],metrics:['count']}}),r=repClean({id:'RP-print-qa',name:'Print QA',share:'all',date:{preset:'all'},pages:[{name:'Tall',orient:'landscape',widgets:[w('table'),w('bars'),w('table')]},{name:'Short',widgets:[w('number')]}]});
  const was=window.print,keep=DB.report;let printed=0;window.print=()=>{printed++;};DB.report=keep.concat([r]);
  try{
   tab='reports';repOpen(r.id);await repPrint();
   const list=[...document.querySelectorAll('#printSheetHost .print-sheet')],zoom=el=>+(el.querySelector('.rep-print').style.zoom||1);
   const sheets=list.map(el=>({cls:el.classList.contains('rep-land')?'land':el.classList.contains('rep-port')?'port':'',rows:el.querySelectorAll('tbody tr:not(.rep-more-row)').length>0&&el.querySelectorAll('tbody tr:not(.rep-more-row)').length<600,more:[...el.querySelectorAll('.rep-more-row')].map(x=>/^\+ [\d,]+ more rows — CSV$/.test(x.textContent)),total:el.querySelectorAll('tfoot').length,width:el.querySelector('.rep-print').style.width===repPrintW+'px'}));
   const bottom=list[0].querySelector('.rep-print').getBoundingClientRect(),inside=[...list[0].querySelectorAll('.rep-w')].every(b=>b.getBoundingClientRect().bottom<=bottom.top+(REP_SHEET.landscape[1]-REP_SHEET_PAD)*REP_SHEET_SPARE+1);
   const dense=chartColumns(Array.from({length:200},(_,i)=>({label:'D'+i,value:i%2})),{}),mark=repSheetMark({orient:'landscape'});
   return {printed,sheets,inside,sameZoom:zoom(list[0])===zoom(list[1]),orient:repClean({pages:[{orient:'sideways'}]}).pages[0].orient,back:repPage(repOpenReport()).name,
    dense:[(dense.match(/<rect /g)||[]).length,(dense.match(/<em /g)||[]).length],mark:/End of page · Letter landscape/.test(mark)&&/padding-top:calc\(/.test(mark)};
  }finally{window.print=was;printSheetCleanup();DB.report=keep;repOpenId='';delete REP_SRC.qa;}
 }),{printed:1,sheets:[{cls:'land',rows:true,more:[true],total:1,width:true},{cls:'port',rows:false,more:[],total:0,width:true}],inside:true,sameZoom:true,orient:'portrait',back:'Tall',dense:[100,8],mark:true});
 eq('Список батчей у прежней базы: толщина, стекло, внутри батчи, все батчи; изменённый человеком — не трогается',await t.p.evaluate(()=>{
  const was=DB.report,seed=DB.reportSeed,old=()=>repClean(Object.assign(REP_STARTERS().find(r=>r.id==='RP-start-batches'),{pages:[{id:'P',name:'Batch list',widgets:[{type:'table',q:{source:'batches',dims:['batch'],metrics:['glassN'],limit:100,sort:{by:'label',dir:'desc'}}}]}]}));
  try{
   const mine=old();mine.pages[0].widgets[0].q.limit=50;
   DB.report=[old()];DB.reportSeed=12;normalizeReports();const q=DB.report.find(r=>r.id==='RP-start-batches').pages[0].widgets[0].q;
   DB.report=[mine];DB.reportSeed=12;normalizeReports();const m=DB.report.find(r=>r.id==='RP-start-batches').pages[0].widgets[0].q;
   return {dims:q.dims,more:q.more,limit:q.limit,sort:q.sort,kept:[m.dims,m.limit]};
  }finally{DB.report=was;DB.reportSeed=seed;}
 }),{dims:['mm'],more:['glass','batch'],limit:0,sort:null,kept:[['batch'],50]});
 /* Владелец, 03.11.2026: «кастомный показатель — моя личная формула»; «фильтр через показатель». */
 eq('Свой показатель формулой и фильтр по показателю: отход %, листы в день, ошибки словами; строки по условию, итог по оставшимся; свой цвет значения',await t.p.evaluate(()=>{
  const rows=[{id:'1',at:'2024-01-01',day:'2024-01-01',b:'B1',g:'6CLEAR',sheets:2,area:100,waste:40},{id:'2',at:'2024-01-02',day:'2024-01-02',b:'B1',g:'6CLEAR',sheets:1,area:50,waste:10},
   {id:'3',at:'2024-01-02',day:'2024-01-02',b:'B2',g:'4CLEAR',sheets:4,area:200,waste:20}];
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('day','Day'),REP_F.dim('b','Batch'),REP_F.dim('g','Glass'),REP_F.num('sheets','Sheets'),REP_F.num('area','Sheet ft²'),REP_F.num('waste','Waste ft²')],
   metrics:[{k:'count',label:'Rows',agg:'count'},{k:'yield',label:'Used %',agg:'ratio',num:'area',den:'area',pct:true}]};
  const custom=[{id:'W',name:'Waste %',formula:'[Waste ft²] / [Sheet ft²] * 100',source:'qa',fmt:'pct',digits:1},{id:'D',name:'Sheets per day',formula:'SUM([Sheets]) / COUNT_DISTINCT([Day])',source:'qa',fmt:'number',digits:1},
   {id:'X',name:'Twice waste',formula:'[Waste %] * 2',source:'qa',fmt:'number',digits:0}];
  const S=REP_SRC.qa,err=f=>repFormulaParse(f,S,custom).error;
  try{
   const all=repQuery({source:'qa',date:{},dims:[],metrics:['cm:W','cm:D','cm:X','count:g'],filters:[],custom}),by=repQuery({source:'qa',date:{},dims:['b'],metrics:['cm:W','sheets'],filters:[],custom,having:[{m:'cm:W',op:'lt',v:[20]}]});
   const none=repQuery({source:'qa',date:{},dims:[],metrics:['sheets'],filters:[],custom,having:[{m:'cm:W',op:'gt',v:[50]}]});
   repColorsCur={g:{'4CLEAR':5}};const cls=repSeriesCls(S,'g',['4CLEAR','6CLEAR']);repColorsCur={};
   const clean=repClean({custom:custom.concat([{id:'Z',name:'Gone',formula:'1',source:'nope'}]),colors:{g:{'6CLEAR':3,'4CLEAR':99},bad:'x'}});
   return {all:all.total.map(v=>+v.toFixed(2)),label:all.metrics.map(m=>m.label),by:by.keys,byTotal:by.total.map(v=>+v.toFixed(2)),none:none.count,
    errs:[err('[Nope] / 2'),err('([Sheets] + 1'),err('[Glass] * 2'),err('SUM([Glass])'),err('2 +')],cls:[cls.get('4CLEAR'),cls.get('6CLEAR')],
    clean:[clean.custom.map(c=>c.id).join(),JSON.stringify(clean.colors)],opts:repMetricOptions(S,custom).filter(o=>/^cm:/.test(o[0])).map(o=>o[1])};
  }finally{delete REP_SRC.qa;}
 }),{all:[20,3.5,40,3],label:['Waste %','Sheets per day','Twice waste','Glass · count'],by:['B2'],byTotal:[10,4],none:0,
   errs:['No field "Nope" in QA.','A bracket is not closed.','[Glass] is not a number — use COUNT_DISTINCT([Glass]).','[Glass] is not a number.','The formula ends too early.'],
   cls:['ch-s5','ch-s2'],clean:['W,D,X','{"g":{"6CLEAR":3}}'],opts:['Waste %','Sheets per day','Twice waste']});
 eq('У каждого поля и показателя своё название: «Glass» — тип стекла, «Glass pcs» — штуки; формула не спутает',await t.p.evaluate(()=>Object.entries(REP_SRC).flatMap(([k,S])=>{
  const f=S.fields(),out=[],by=new Map();f.forEach(x=>{if(by.has(x.label))out.push(k+': two fields "'+x.label+'"');by.set(x.label,x);});
  (S.metrics||[]).forEach(m=>{const x=by.get(m.label);if(x&&!(x.type==='num'&&m.f===x.k&&m.agg==='sum'))out.push(k+': metric and field "'+m.label+'"');});return out;})),[]);
 eq('Combo: колонка — первый показатель, внутри узкая — второй; клик по заголовку сортирует (второй клик — наоборот); CSV — все строки, разбивка колонками, Total',await t.p.evaluate(()=>{
  const rows=[{id:'1',at:'2024-01-01',k:'A',b:'x',n:5,m:1},{id:'2',at:'2024-02-01',k:'B',b:'y',n:2,m:3},{id:'3',at:'2024-02-02',k:'B',b:'x',n:1,m:1},{id:'4',at:'2024-03-01',k:'C, Inc',b:'y',n:9,m:0}];
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('k','K'),REP_F.dim('b','B'),REP_F.num('n','N'),REP_F.num('m','M')],metrics:[{k:'count',label:'Rows',agg:'count'}]};
  const w=(type,o)=>Object.assign({type,q:Object.assign({source:'qa',dims:['k'],metrics:['n','m']},o||{})}),r=repClean({id:'RP-csv-qa',name:'CSV QA',share:'all',date:{preset:'all'},pages:[{widgets:[w('combo',{dims:['at:month']}),w('table'),w('table',{dims:['k','b'],metrics:['n']})]}]});
  const keep=DB.report;DB.report=keep.concat([r]);
  try{
   repOpen(r.id);const ws=r.pages[0].widgets,box=document.createElement('div');document.body.appendChild(box);box.innerHTML=repChart(r,ws[0]);
   const combo={inner:box.querySelectorAll('.ch-inner').length,legend:[...box.querySelectorAll('.ch-legend>span')].map(x=>x.textContent)};
   const order=()=>{box.innerHTML=repChart(r,ws[1]);return [...box.querySelectorAll('tbody tr')].map(tr=>tr.querySelector('td:not(.sl-check)').textContent);};
   const before=order();repSortClick(ws[1].id,'metric',0);const desc=order();repSortClick(ws[1].id,'metric',0);const asc=order();repSortClick(ws[1].id,'label',0);const name=order();
   const csv=repCsvText(r,ws[2]).trim().split('\r\n'),csv2=repCsvText(r,ws[1]).trim().split('\r\n');box.remove();repResetView();
   return {combo,before,desc,asc,name,csv,csv2};
  }finally{DB.report=keep;repOpenId='';delete REP_SRC.qa;}
 }),{combo:{inner:2,legend:['N','M (inner)']},before:['C, Inc','A','B'],desc:['C, Inc','A','B'],asc:['B','A','C, Inc'],name:['A','B','C, Inc'],
  csv:['K,x · N,y · N,Total · N','"C, Inc",0,9,9','A,5,0,5','B,1,2,3','Total,6,11,17'],csv2:['K,N,M','A,5,1','B,3,4','"C, Inc",9,0','Total,17,5']});
 eq('Долгий отчёт: вместо замершей страницы — процент, графики считаются в фоне; после записи прежние графики на экране, пока считаются новые',await t.p.evaluate(async()=>{
  const rows=Array.from({length:50},(_,i)=>({id:'q'+i,at:'2024-01-01',k:'K'+(i%5),n:1}));
  REP_SRC.qa={label:'QA',group:'Sales',rows:()=>rows,date:['at'],fields:()=>[REP_F.date('at','Date'),REP_F.dim('k','K'),REP_F.num('n','N')],metrics:[{k:'count',label:'Rows',agg:'count'}]};
  const r=repClean({date:{preset:'all'},pages:[{widgets:[repCleanWidget({type:'table',q:{source:'qa',dims:['k'],metrics:['count']}})]}]}),p=r.pages[0];
  try{
   repResults=new Map();repStale=new Map();repCost.set('qa',5000);
   const first=repPageReady(r,p),text=repBuildText(repBuild);
   for(let i=0;i<100&&repBuild;i++)await new Promise(res=>setTimeout(res,20));
   const done=repPageReady(r,p);repResultsDrop();repCost.set('qa',5000);const after=repPageReady(r,p),up=repBuildText(repBuild,true);
   for(let i=0;i<100&&repBuild;i++)await new Promise(res=>setTimeout(res,20));
   repCost.set('qa',1);repResultsDrop();const quick=repPageReady(r,p);
   return {first,text,done,after,up,quick};
  }finally{delete REP_SRC.qa;repCost.delete('qa');repBuild=null;}
 }),{first:'wait',text:'Building report · 0%',done:'ready',after:'stale',up:'Updating · 0%',quick:'ready'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
