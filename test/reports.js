/* Board станции и факты работы (reports/facts, view/station-board,
   view/charts). Владелец, 9 октября 2026: третья вкладка Board рядом со Scan
   и Queue — не тормозит скан; на станции человек видит только себя; мера
   работы — дюймы, ft², штуки по толщине, $ по прайсу Works (не по цене
   клиента); день — сутки 0:00–24:00, без окон смен. */
module.exports=async function({page,eq,ok}){
 console.log('station-board');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  /* Заказ: стекло, тип юнита и строки [ширина, высота, кол-во]. Особая цена
     клиента на все работы — 0.013 за единицу, как в заготовке очередей. */
  window.rbOrder=function(c,code,type,lines,extra){
   tab='sales';salesOrderNew('order');salesSetUnitType(type);
   const m=soDraft.makeups[0],g=glassProductByCode(code);
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=g.thicknessMm;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});(m.cavities||[]).forEach(x=>{x.priceOverride=3.1;});soDraft.lines=[];
   lines.forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   salesApplyCustomerDefaults(c.id);Object.assign(soDraft,extra||{});if(!salesOrderSave())throw new Error('Order did not save');const id=soDraft.id;soDraft=null;soEdit=null;return id;
  };
  window.rbBatch=function(ids){ids.forEach(id=>salesSetRecordStatus(id,'verified'));glassBatchAssign(glassBatchRows(ids.map(salesRecord)),{});};
  window.rbIds=function(id){const o=salesRecord(id),pm=glassPieceMap(id);return o.lines.flatMap(l=>glassBatchComponents(o,l).flatMap(c=>pm.get(c.key).ids));};
  window.rbUser=function(name,pin){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,pin,access:[]});normalizeUsers();const u=DB.user.find(x=>x.name===name);return {id:u.viewProfileId,name};};
  window.rbAt=function(days,h,m){const d=new Date();d.setDate(d.getDate()+days);d.setHours(h,m,0,0);return d.toISOString();};
  window.rbGo=function(st,piece,who,now){const c=stationCheck(st,piece);if(!c||c.kind!=='ok')throw new Error(st+' '+piece+' '+(c&&c.kind));return stationRecord(st,c,who,now?{now}:{});};
  window.rbStation=function(code,who){try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=code;tab='station';stationTab='scan';stationDrawer=null;stationLogin(who.id);};
 });

 eq('Работа стекла: аррис 6 мм и полировка 12 мм — дюймы кромки стекла, ft² и $ по прайсу Works, а не по особой цене клиента',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who={id:'u1',name:'Andrei'};
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]]),b=rbOrder(c,'12CLEAR','single',[[30,40,1]],{});
  salesRecord(b).lines[0].priceManual=1;rbBatch([a,b]);
  rbIds(a).forEach(p=>{rbGo('CUT',p,who);rbGo('ARRIS',p,who);});rbIds(b).forEach(p=>{rbGo('CUT',p,who);rbGo('POLISH',p,who);});
  const r6=salesCatalogRate('roughArris',salesPricingBandFor(6)),r12=salesCatalogRate('flatPolish',salesPricingBandFor(12));
  return {facts:repWorkFacts().map(f=>[f.station,f.mm,+(f.area||0).toFixed(2),+f.inches.toFixed(2),f.usd==null?null:+f.usd.toFixed(4)]),
   rates:{arris6:r6===0.01,polish12:r12===0.13}};
 }),{facts:[['CUT',6,18.24,0,null],['ARRIS',6,18.24,216,2.16],['CUT',6,18.24,0,null],['ARRIS',6,18.24,216,2.16],['CUT',12,8.33,0,null],['POLISH',12,8.33,140,18.2]],rates:{arris6:true,polish12:true}});

 eq('Сутки: скан вчера в 23:50 — вчерашний, сегодня в 00:10 — сегодняшний; Board — только своя станция: ждёт здесь, сделано здесь сегодня, You today только свои сканы, без чужих станций, имён и $',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),andrei=rbUser('Andrei','1111'),vasyl=rbUser('Vasyl','2222');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]]);rbBatch([a]);const ids=rbIds(a);
  rbGo('CUT',ids[0],andrei,rbAt(-1,23,50));rbGo('CUT',ids[1],andrei,rbAt(0,0,10));rbGo('CUT',ids[2],vasyl,rbAt(0,0,30));rbGo('ARRIS',ids[1],vasyl,rbAt(0,0,40));
  rbStation('CUT',andrei);stationTab='board';render();
  const tile=sel=>document.querySelector(sel+' b').textContent;
  const mine=[...document.querySelectorAll('[data-board-mine] .ch-stat')].map(x=>x.querySelector('span').textContent+' '+x.querySelector('b').textContent);
  const app=document.getElementById('app'),board=app.querySelector('.sb').innerText;
  return {days:repWorkFacts().map(f=>f.day===finToday()),waiting:tile('[data-board-waiting]'),done:tile('[data-board-done]'),mine,hour0:document.querySelectorAll('[data-board-mine] .ch-col')[0].title,
   otherStations:(DB.station||[]).filter(s=>s.code!=='CUT'&&new RegExp('\\b'+s.code+'\\b').test(board)).map(s=>s.code),onlyMine:!app.innerHTML.includes('Vasyl'),noMoney:!/\$/.test(app.innerHTML),shipping:!!app.querySelector('[data-board-shipping]')};
 }),{days:[false,true,true,true],waiting:'1',done:'2',mine:['Glass 1','Glass ft² 18.2'],hour0:'0:00 · 1 glass',otherStations:[],onlyMine:true,noMoney:true,shipping:false});

 eq('Board не считается на Scan и Queue; открыт — считается; скан с Board засчитан и возвращает на Scan',await t.p.evaluate(()=>{
  const ids=rbIds(DB.salesOrder[0].id),n0=stationBoardBuilds;
  stationTab='scan';render();render();document.querySelector('[data-station-tab="queue"]').click();render();
  const idle=stationBoardBuilds-n0;
  document.querySelector('[data-station-tab="board"]').click();const open=stationBoardBuilds-n0;
  const topScan=!!document.querySelector('.st-topscan [data-station-scan]');
  const before=DB.stationScan.length;stationSubmit(ids[3]);
  return {idle,open,topScan,recorded:DB.stationScan.length-before,tab:stationTab,last:DB.stationScan[DB.stationScan.length-1].piece===ids[3]};
 }),{idle:0,open:1,topScan:true,recorded:1,tab:'scan',last:true});

 eq('Hot: Critical со сроком завтра — сколько здесь, сколько придёт и сколько прошло здесь, без чужих станций. Shipping today — только на станциях отгрузки',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),andrei=rbUser('Andrei','1111');
  const d=new Date();d.setDate(d.getDate()+1);const p=v=>String(v).padStart(2,'0'),tomorrow=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]],{priority:'critical',dueDate:tomorrow}),b=rbOrder(c,'6CLEAR','double',[[30,40,1]],{delivery:'pickup'});rbBatch([a,b]);
  const ids=rbIds(a);ids.slice(0,3).forEach(x=>rbGo('CUT',x,andrei));rbGo('ARRIS',ids[0],andrei);oqReady(b);
  const made=shippingCreate({customerId:salesRecord(b).customerId,method:'pickup',shipTo:{address1:'Yard'},date:finToday(),items:shippingAvailable(salesRecord(b)).map(shippingItem)});
  rbStation('ARRIS',andrei);stationTab='board';render();
  const hot=document.querySelector('[data-board-hot]'),atArris={hot:hot&&hot.dataset.boardHot===salesRecord(a).businessNumber,crit:hot&&hot.classList.contains('crit'),due:hot&&hot.querySelector('.sb-due').textContent,
   chips:hot&&[...hot.querySelectorAll('.sb-chip')].map(x=>x.textContent),done:hot&&hot.querySelector('.sb-prog').textContent,shipping:!!document.querySelector('[data-board-shipping]')};
  rbStation(shippingStations().ship,andrei);stationTab='board';render();
  const ship=document.querySelector('[data-board-ship]');
  return {made:made.ok,atArris,ship:ship&&[...ship.children].slice(1).map(x=>x.textContent.replace(/\s+/g,' ').trim()).join(' · ')};
 }),{made:true,atArris:{hot:true,crit:true,due:'Tomorrow',chips:['Here 2','Coming 1'],done:'1 / 4 done',shipping:false},ship:'North Shore Windows Pickup · 1 / 1 ready'});


 /* Overview (view/dashboard): «что сейчас» без денег; блок — по галочке
    раздела в Users; каждая цифра открывает свой список. */
 eq('Overview: блоки по галочкам разделов, денег нигде нет',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'});rbOrder(c,'6CLEAR','double',[[37,71,1]],{dueDate:finToday()});
  const as=keys=>{const old=window.accessCan;window.accessCan=k=>keys.includes(k);try{tab='dashboard';render();const app=document.getElementById('app');
   return {blocks:['orders','shop','ship','quality'].filter(k=>app.querySelector('[data-dash-'+k+']')),tiles:[...app.querySelectorAll('[data-dash-tile]')].map(x=>x.dataset.dashTile),money:/\$|USD|CAD|Balance|Total/.test(app.innerText)};}finally{window.accessCan=old;tab='dashboard';render();}};
  return {sales:as(['dashboard','sales']),shop:as(['dashboard','production']),all:as(USER_SECTIONS)};
 }),{sales:{blocks:['orders'],tiles:['today','week','attention'],money:false},shop:{blocks:['shop','quality'],tiles:[],money:false},
  all:{blocks:['orders','shop','ship','quality'],tiles:['today','week','attention','verify','batch','ready','delivery','shipments','backorders'],money:false}});

 eq('Overview: числа как на вкладках Sales / Optimization / Shipping; нажатие открывает тот же вид; станция — Production с фильтром только этой станции',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who=rbUser('Andrei','1111');
  const d=new Date();d.setDate(d.getDate()-2);const p=v=>String(v).padStart(2,'0'),past=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  const a=rbOrder(c,'6CLEAR','double',[[37,71,1]],{dueDate:finToday()}),b=rbOrder(c,'6CLEAR','double',[[30,40,1]],{dueDate:past}),n=rbOrder(c,'6CLEAR','double',[[30,40,1]]);
  rbBatch([a,b]);rbIds(a).forEach(x=>rbGo('CUT',x,who));
  tab='dashboard';render();const num=k=>+document.querySelector(`[data-dash-tile="${k}"] b`).textContent;
  const counts={today:num('today'),attention:num('attention'),verify:num('verify')===optimizationTabCount('new'),batch:num('batch')===optimizationTabCount('batch'),ready:num('ready')===shippingTabCount('ready')};
  const warn=document.querySelector('[data-dash-tile="attention"]').classList.contains('warn');
  document.querySelector('[data-dash-tile="today"]').click();const sales={tab,quick:salesListLoadPrefs().quick};salesQuickSet('all');
  tab='dashboard';render();document.querySelector('[data-dash-tile="verify"]').click();const opt={tab,queue:optimizationTab};
  tab='production';subtab='orders';render();prodFocusStation('HEAT');
  tab='dashboard';render();document.querySelector('[data-dash-shop] [data-board-station="ARRIS"]').click();
  const prod={tab,subtab,filters:Object.keys(salesListLoadPrefs().filters).filter(k=>/^st_/.test(k)),rows:[...document.querySelectorAll('[data-prod-order]')].length};
  prodFocusStation('ARRIS');tab='dashboard';render();
  return {counts,warn,sales,opt,prod};
 }),{counts:{today:1,attention:1,verify:true,batch:true,ready:true},warn:true,sales:{tab:'sales',quick:'today'},opt:{tab:'optimization',queue:'new'},prod:{tab:'production',subtab:'orders',filters:['st_ARRIS'],rows:1}});

 eq('Overview: Recuts · 7 days — стекло Recut по станциям за последние 7 дней, старое не считается',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who=rbUser('Andrei','1111');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,2]]);rbBatch([a]);const o=salesRecord(a),reason=id=>ncrReasonsFor(id,{activeOnly:true})[0].id;
  const r1=recutCreate({orderId:a,where:'ARRIS',reasonId:reason('ARRIS'),lines:{[o.lines[0].id]:{on:true,qty:2,which:'unit'}}});
  const r2=recutCreate({orderId:a,where:'CUT',reasonId:reason('CUT'),lines:{[o.lines[0].id]:{on:true,qty:1,which:'unit'}}});
  const old=new Date();old.setDate(old.getDate()-10);r2.recuts[0].createdAt=old.toISOString();
  tab='dashboard';render();const q=document.querySelector('[data-dash-quality]');
  return {made:!!(r1.recuts&&r2.recuts),total:q.querySelector('.section-title .mut').textContent,rows:[...q.querySelectorAll('.ch-grid-row:not(.ch-grid-head)')].map(x=>x.querySelector('.ch-grid-label').textContent+' '+x.querySelector('.ch-grid-cell b').textContent)};
 }),{made:true,total:'4 glass',rows:['ARRIS 4']});

 /* Цех на 3400 стёкол и 20 000 сканов: факты и Board считаются за разумное
    время; повторная отрисовка без новых сканов берёт кэш. */
 const perf=await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),who=rbUser('Andrei','1111');
  const a=rbOrder(c,'6CLEAR','double',[[37,71,850],[30,40,850]]);rbBatch([a]);const ids=rbIds(a),index=stationPieceIndex(),batches=stationBatchIndex();
  let n=0;ids.forEach((id,i)=>{const route=stationRouteOf(stationGlass(id,index,batches)).codes;route.slice(0,7).forEach((st,k)=>{n++;DB.stationScan.push({id:'SC-'+String(n).padStart(7,'0'),at:rbAt(-(i%5),8+k,i%60),piece:id,station:st,by:who.name,byId:who.id,manual:false,undoneAt:'',undoneBy:'',step:k,actionId:'SC-'+n});});});
  DB.stationScanSeq=n;rbStation('ARRIS',who);stationTab='board';
  const t0=performance.now();render();const cold=performance.now()-t0;
  const t1=performance.now();render();const warm=performance.now()-t1;
  return {glass:ids.length,scans:n,cold,warm,facts:repWorkFacts().length};
 });
 console.log('  perf: '+perf.glass+' glass, '+perf.scans+' scans — cold '+Math.round(perf.cold)+' ms, warm '+Math.round(perf.warm)+' ms');
 ok('3400 стёкол и 20 000 сканов: Board считается меньше чем за 4 с, повторно — из кэша быстрее 400 мс',perf.glass>=3000&&perf.scans>=20000&&perf.facts===perf.scans&&perf.cold<4000&&perf.warm<400,JSON.stringify(perf));
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
