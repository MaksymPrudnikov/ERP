/* Recut плиты ламината (владелец, 11.10.2026: «режем одну плиту»). Проход
   «цех за 14 месяцев»: на ARRIS лопнула одна плита перил — ERP перерезал
   обе, а целая навсегда оставалась «в работе» (Hot на Board POLISH). */
module.exports=async function({page,eq,ok}){
 console.log('lami-ply-recut');const t=await page();
 await require('./optimization-fixture')(t.p);await require('./report-fixture')(t.p);
 await t.p.evaluate(()=>{
  /* Перила: одно стекло 40 × 36, ламинат 6 + 6 FT. */
  window.lpOrder=function(){
   oqReset();DB.stationScan=[];DB.recut=[];const c=oqCustomer({legalName:'Vista Railings'});
   tab='sales';salesOrderNew('order');salesSetUnitType('single');
   const m=soDraft.makeups[0],pn=m.panes[0];pn.category='laminated';['outer','inner'].forEach(k=>{const g=glassProductByCode('6CLEAR');Object.assign(pn.laminated[k],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT'});});
   soDraft.makeups[0]=normalizeOrderMakeup(m,0);soDraft.lines=[normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,width16:40*16,height16:36*16,qty:1})];salesEnsureLineShape(soDraft.lines[0]);
   salesApplyCustomerDefaults(c.id);salesOrderSave();const id=soDraft.id;soDraft=null;soEdit=null;tab='dashboard';rbBatch([id]);return id;
  };
  /* Стеклопакет: лайт 1 — 6CLEAR, лайт 2 — ламинат 6 + 6. Склейка на LAM, сборка на IGU. */
  window.lpIgu=function(){
   oqReset();DB.stationScan=[];DB.recut=[];const c=oqCustomer({legalName:'Northview Windows'});
   tab='sales';salesOrderNew('order');salesSetUnitType('double');
   const m=soDraft.makeups[0],pn=m.panes[1];pn.category='laminated';['outer','inner'].forEach(k=>{const g=glassProductByCode('6CLEAR');Object.assign(pn.laminated[k],{glassProductId:g.id,thicknessMm:6});});
   soDraft.makeups[0]=normalizeOrderMakeup(m,0);soDraft.lines=[normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,width16:30*16,height16:40*16,qty:1})];salesEnsureLineShape(soDraft.lines[0]);
   salesApplyCustomerDefaults(c.id);salesOrderSave();const id=soDraft.id;soDraft=null;soEdit=null;tab='dashboard';rbBatch([id]);return id;
  };
  window.lpWho={id:'u1',name:'Yurii'};
  /* Провести стекло по маршруту до станции stop (не включая). */
  window.lpTo=function(id,stop){for(let i=0;i<12;i++){const g=stationGlass(id),p=stationPlace(g);if(!p.waiting||p.waiting===stop)return p.waiting;const c=stationCheck(p.waiting,id);if(c.kind!=='ok')return p.waiting+':'+c.kind;stationMove(p.waiting,c,lpWho,{});}return 'loop';};
 });

 eq('Плита лопнула до склейки: перерезается одна она (новый номер), целая ждёт на LAM; новая плита доходит до LAM — сэндвич склеивается, ничего не висит',await t.p.evaluate(()=>{
  const id=lpOrder(),[a,b]=rbIds(id),route=stationRouteOf(stationGlass(a)).codes;
  lpTo(a,route[2]);lpTo(b,route[2]);const at=stationPlace(stationGlass(a)).waiting;
  const r=stationBreak(at,stationCheck(at,a),lpWho,(DB.ncrReason||[])[0]&&DB.ncrReason[0].id||'');
  const fresh=r.newIds||[];const survivor=lpTo(b,'LAM'),mid=lpTo(fresh[0],'LAM');
  const joined=stationMove('LAM',stationCheck('LAM',b),lpWho,{}).ok&&stationMove('LAM',stationCheck('LAM',fresh[0]),lpWho,{}).ok;
  const after=[b,fresh[0]].map(x=>stationPlace(stationGlass(x)).waiting||'done');
  return {which:r.recut&&r.recut.which,lite:r.recut&&r.recut.lite,newIds:fresh.length,broken:r.broken.length,survivor,mid,joined,lam:stationScansFor(b).some(s=>s.station==='LAM'&&(s.unit||s.joined)),after};
 }),{which:'0:outer',lite:'Ply 1a · 6CLEAR',newIds:1,broken:1,survivor:'LAM',mid:'LAM',joined:true,lam:true,after:['SHIPR','SHIPR']});

 eq('Сэндвич лопнул после склейки: разбиты и перерезаются обе плиты',await t.p.evaluate(()=>{
  const id=lpOrder(),[a,b]=rbIds(id);lpTo(a,'LAM');lpTo(b,'LAM');stationMove('LAM',stationCheck('LAM',a),lpWho,{});stationMove('LAM',stationCheck('LAM',b),lpWho,{});
  const at=stationPlace(stationGlass(a)).waiting,r=stationBreak(at,stationCheck(at,a),lpWho,(DB.ncrReason||[])[0]&&DB.ncrReason[0].id||'');
  return {at,which:r.recut&&r.recut.which,newIds:(r.allNew||[]).length,broken:r.broken.slice().sort().join()===[a,b].sort().join()};
 }),{at:'SHIPR',which:'unit',newIds:2,broken:true});

 eq('Recut из заказа: у ламината можно выбрать одну плиту',await t.p.evaluate(()=>{
  const id=lpOrder(),o=salesRecord(id),l=o.lines[0];return ncrLiteOptions(o,l).map(x=>x.value+' '+x.label);
 }),['unit Glass · 6CLEAR+6CLEAR','0:outer Ply 1a · 6CLEAR','0:inner Ply 1b · 6CLEAR']);

 eq('Стеклопакет с ламинатом: плита до склейки — перерезается одна; склеенный сэндвич до IGU — разбиты обе плиты, лайт 1 не трогается',await t.p.evaluate(()=>{
  const id=lpIgu(),o=salesRecord(id),comps=glassBatchComponents(o,o.lines[0]),pm=glassPieceMap(id),idOf=k=>pm.get(k).ids[0];
  const [lite,outer,inner]=comps.map(c=>idOf(c.key));
  lpTo(outer,'LAM');const at=stationPlace(stationGlass(inner)).waiting;lpTo(inner,at);
  const r1=stationBreak(at,stationCheck(at,inner),lpWho,(DB.ncrReason||[])[0]&&DB.ncrReason[0].id||'');
  const id2=lpIgu(),o2=salesRecord(id2),pm2=glassPieceMap(id2),ids2=glassBatchComponents(o2,o2.lines[0]).map(c=>pm2.get(c.key).ids[0]);
  lpTo(ids2[1],'LAM');lpTo(ids2[2],'LAM');stationMove('LAM',stationCheck('LAM',ids2[1]),lpWho,{});stationMove('LAM',stationCheck('LAM',ids2[2]),lpWho,{});
  const at2=stationPlace(stationGlass(ids2[1])).waiting,r2=stationBreak(at2,stationCheck(at2,ids2[1]),lpWho,(DB.ncrReason||[])[0]&&DB.ncrReason[0].id||'');
  return {one:r1.recut.which,oneNew:(r1.allNew||[]).length,two:r2.recut.which,twoNew:(r2.allNew||[]).length,twoBroken:r2.broken.slice().sort().join()===[ids2[1],ids2[2]].sort().join(),liteAlive:!stationPlace(stationGlass(ids2[0])).broken};
 }),{one:'1:inner',oneNew:1,two:'1',twoNew:2,twoBroken:true,liteAlive:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
