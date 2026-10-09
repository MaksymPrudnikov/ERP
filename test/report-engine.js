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

 eq('Orders: On time % — из отгруженных со сроком; дни опоздания; lead time — от создания до отгрузки',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),day=n=>repAddDays(finToday(),n);
  const mk=due=>rbOrder(c,'6CLEAR','double',[[30,40,1]],{dueDate:due,delivery:'pickup'});
  const a=mk(day(-1)),b=mk(day(2)),x=mk(day(-3)),y=mk(day(5));rbBatch([a,b,x,y]);[a,b].forEach(id=>{oqReady(id);oqFulfill(id,'pickup');});
  const q=repQuery({source:'orders',date:{f:'due',preset:'all'},dims:['state'],metrics:['count','onTime','daysLate:max','lead:avg'],sort:{by:'label',dir:'asc'}});
  return {byState:q.keys.map(k=>k+' '+q.rowTotals.get(k)[0]),onTime:repFmt(q.metrics[1],q.total[1]),maxLate:q.total[2],lead:q.total[3]};
 }),{byState:['Late 2','On time 1','Open 1'],onTime:'50%',maxLate:3,lead:0});

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
  DB.report=(DB.report||[]).filter(r=>!/^RP-start-/.test(r.id)||r.id==='RP-start-cut');DB.report=DB.report.filter(r=>!['RP-start-quotes','RP-start-payments','RP-start-balances','RP-start-offcuts','RP-start-sizes','RP-start-km'].includes(r.id));
  DB.reportSeed=1;normalizeReports();const ids=DB.report.filter(r=>/^RP-start-/.test(r.id)).map(r=>r.id).sort();normalizeReports();
  return {ids,again:DB.report.filter(r=>/^RP-start-/.test(r.id)).length,seed:DB.reportSeed};
 }),{ids:['RP-start-balances','RP-start-cut','RP-start-km','RP-start-offcuts','RP-start-payments','RP-start-quotes','RP-start-sizes'],again:7,seed:2});
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
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
