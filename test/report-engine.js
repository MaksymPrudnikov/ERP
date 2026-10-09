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
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
