/* Очередь станций после резки. Владелец, 29.09.2026: «только CUT знает, что
   его ждёт, другие ничего не знают»; «закалку запускают по толщине стекла —
   программы разные между толщиной и типом стекла, ну и типом закалки».
   Вкладка Queue: поток (следующие батчи → станции → здесь), здесь сейчас с
   работой и тарой, Critical первым; ARRIS — сводка по работам; HEAT —
   загрузки печи толщина · стекло · закалка в кв. футах; IGU — готово к
   сборке и ждут лайт; батчи CUT, которые везут стекло сюда. */
module.exports=async function({page,eq,ok}){
 console.log('station-queue');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.sqSetup=function(){
   oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];carrierAdd('DL',3);stationLast=null;stationDrawer=null;stationTab='scan';
   const who={id:'x',name:'Ivan'},sc=(st,g,on)=>stationRecord(st,stationCheck(st,g),who,{on});
   const mk=crit=>{const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),crit?{priority:'critical',dueDate:'2026-10-01'}:{dueDate:'2026-10-06'});soDraft=null;soEdit=null;
    salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode('6Q240').id;salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;};
   const a=mk(false),b=mk(true),c=mk(false);
   const ids=id=>{const o=salesRecord(id),pm=glassPieceMap(id);return o.lines.flatMap(l=>glassBatchComponents(o,l).flatMap(c=>pm.get(c.key).ids));};
   ids(a).forEach(g=>{sc('CUT',g,'DL-1');sc('ARRIS',g,'DL-2');});
   ids(b).forEach((g,i)=>{sc('CUT',g,'DL-3');if(i%2===0)sc('ARRIS',g);});
   ids(a).slice(0,3).forEach(g=>sc('HEAT',g));
   return {a,b,c};
  };
  window.sqOpen=function(st){DB.user=DB.user.filter(u=>u.name!=='Op');DB.user.push({name:'Op',role:'Shop',station:st,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=st;tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);document.querySelector('[data-station-tab="queue"]').click();};
  window.sqTiles=function(){return [...document.querySelectorAll('[data-flow-at]')].map(x=>x.dataset.flowAt+':'+x.querySelector('b').textContent).join();};
  window.sqRows=function(sel,from){return [...document.querySelectorAll(sel+' tbody tr')].map(tr=>[...tr.children].slice(from||0).map(td=>td.textContent.replace(/\s+/g,' ').trim()).join('|'));};
  window.sqOut=function(){stationSwitch();tab='dashboard';render();};
 });

 eq('ARRIS: вкладка Queue — поток, здесь сейчас (Critical первым, работа, тара), сводка по работам, батчи CUT',await t.p.evaluate(()=>{
  const x=sqSetup();sqOpen('ARRIS');
  const out={tab:!!document.querySelector('[data-station-flow="ARRIS"]'),tiles:sqTiles(),here:sqRows('[data-flow-here]',1).map(r=>r.replace(/\|Oct \d+$/,'')),works:sqRows('[data-flow-works]'),batches:sqRows('[data-flow-batches]',1),first:document.querySelector('[data-flow-here] tbody tr').textContent.includes('Critical')};
  sqOut();return out;
 }),{tab:true,tiles:'CUT:next:6,here:3',here:['Line 1 · 37 × 71|6CLEAR|ROUGH ARRIS|1|DL-3','Line 1 · 37 × 71|6Q240|ROUGH ARRIS|1|DL-3','Line 2 · 30 × 40|6Q240|ROUGH ARRIS|1|DL-3'],works:['ROUGH ARRIS|3|6'],batches:['6CLEAR, 6Q240|6'],first:true});

 eq('HEAT: загрузки печи — толщина, стекло и закалка отдельно; кв. футы и штуки здесь и в пути, откуда едет; Critical',await t.p.evaluate(()=>{
  const x=sqSetup();const oc=salesRecord(x.c);oc.makeups[0].panes[1].heatTreatmentId='HT-HS';oc.updatedAt=new Date().toISOString();sqOpen('HEAT');
  const loads=[...document.querySelectorAll('[data-load]')].map(tr=>tr.dataset.load+' | '+tr.children[1].querySelector('.mut').textContent+' | '+tr.children[2].querySelector('.mut').textContent+' | '+(tr.classList.contains('st-hot')?'hot':''));
  const mm=[...document.querySelectorAll('.st-load-mm')].map(x=>x.textContent),sqft=/sq ft/.test(document.querySelector('[data-load] td:nth-child(2)').textContent);
  const out={tiles:sqTiles(),mm,loads,sqft};sqOut();return out;
 }),{tiles:'CUT:next:6,ARRIS:3,here:6',mm:['6 mm'],loads:['6CLEAR · Tempered | 3 pcs | 4 pcs · ARRIS 1 · CUT 3 | hot','6Q240 · Heat Strengthened | 0 pcs | 3 pcs · CUT 3 | ','6Q240 · Tempered | 3 pcs | 2 pcs · ARRIS 2 | hot'],sqft:true});

 eq('IGU: готово к сборке — все лайты здесь; ждут лайт — где он сейчас; поток по станциям',await t.p.evaluate(()=>{
  sqSetup();sqOpen('IGU');
  const out={tiles:sqTiles(),ready:sqRows('[data-flow-ready]',1).map(r=>r.replace(/\|Oct \d+$/,'')),partial:sqRows('[data-flow-partial]',1),pill:document.querySelector('[data-flow-ready]').closest('.card').querySelector('.pill').textContent};
  sqOut();return out;
 }),{tiles:'CUT:next:6,ARRIS:3,HEAT:6,here:3',ready:['Line 1 · 37 × 71|6CLEAR / 6Q240|1'],partial:['Line 1 · 37 × 71|Lite 1 · 6CLEAR|Lite 2 · 6Q240 — HEAT 1|1'],pill:'1 unit'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
