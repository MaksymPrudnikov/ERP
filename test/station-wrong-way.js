/* Проход «как человек», 7 октября 2026 (docs/ЗАДАЧА_ПРОХОД.md, PR A).
   Владелец: «все должны обращать внимание, что стекло двигается не туда» —
   жёлтым и звуком, исправить сразу сканом нужной тары или ✓ оставить; и на
   CUT тоже; на IGU клиентов на скиде мешать можно; скан пришедшей долли —
   «кладу на неё же». Плюс найденное на проходе: «Sheet done» на всех
   станциях, клавиатура входа прыгала, SHIPR без скида терял тару, после
   переноса «кладу на» оставалось на старой долли, срочность батча не видна
   резчику, несобранный юнит — «Unit number». */
module.exports=async function({page,eq,ok}){
 console.log('station-wrong-way');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.wwBeeps=[];stationBeep=k=>{wwBeeps.push(k);};
  window.wwReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationIncoming='';stationNote='';stationDrawer=null;stationTab='scan';wwBeeps.length=0;
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  /* single — одно стекло, double — стеклопакет; HT-FT — закалка, HT-AN — нет. */
  window.wwOrder=function(o){
   const id=oqOrder(oqCustomer({legalName:o.customer||'North Shore Windows'}),Object.assign({dueDate:'2026-10-06'},o.extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];if(o.unit==='single'){m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];}
   m.panes.forEach(p=>{p.heatTreatmentId=o.heat;if(o.edge)p.edgework=o.edge;});
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:(o.w||36)*16,height16:(o.h||24)*16,qty:o.qty||1,mark:'M1'});soDraft.lines=[l];salesEnsureLineShape(l);
   salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.wwIds=id=>[...glassPieceMap(id).values()].flatMap(r=>r.ids);
  window.wwLogin=function(station){const name='Op '+station;DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLast=null;stationNote='';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.wwOut=function(){stationSwitch();tab='dashboard';render();};
  window.wwText=sel=>{const e=document.querySelector(sel);return e?e.textContent.replace(/\s+/g,' ').trim():null;};
  window.wwOn=id=>{const s=DB.stationScan.filter(r=>r.piece===id&&!r.undoneAt).pop();return s?s.station+':'+(s.on||'—'):'-';};
 });

 eq('не туда на ARRIS: на DL-3 стекло на HEAT, это — на IGU: жёлтая полоса и звук, скан записан; ✓ Keep снимает; скан DL-2 сразу после — стекло переехало и дальше кладут на DL-2; Undo move — назад; на CUT всё на ARRIS — тихо',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',4);
  const T=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:2})),I=wwIds(wwOrder({unit:'double',heat:'HT-AN',qty:2}));
  wwLogin('CUT');stationSubmit('DL-1');T.concat(I).forEach(x=>stationSubmit(x));const cutWarn=wwBeeps.includes('warn');wwOut();
  wwLogin('ARRIS');wwBeeps.length=0;
  stationSubmit('DL-3');stationSubmit(T[0]);const first=!!stationLast.wrong;
  stationSubmit(I[0]);const w=stationLast.wrong,bar=wwText('[data-station-wrong]'),amber=!!document.querySelector('.st-res.st-amber[data-station-result="ok"]'),beep=wwBeeps[wwBeeps.length-1],rec=stationLast.rec.on;
  document.querySelector('[data-station-warn-keep]').click();const kept={bar:wwText('[data-station-wrong]'),note:stationNote,on:carrierContents().get('DL-3').length};
  stationSubmit('DL-4');stationSubmit(T[1]);stationSubmit(I[1]);const again=!!stationLast.wrong;
  const moved=stationSubmit('DL-2'),card=wwText('[data-station-result="carrierMoved"] .st-info .mut'),put=stationPutOn(),onI1=(carrierContents().get('DL-2')||[]).map(x=>x.id).join()===I[1];
  document.querySelector('[data-dolly-undo]').click();const back={dl4:(carrierContents().get('DL-4')||[]).length,put:stationPutOn()};
  wwOut();return {cutWarn,first,w,bar,amber,beep,rec,kept,again,moved,card,put,onI1,back};
 }),{cutWarn:false,first:false,w:{on:'DL-3',to:['HEAT'],mine:'IGU'},bar:'DL-3 → HEATThis glass → IGU · scan its dolly✓ Keep on DL-3',amber:true,beep:'warn',rec:'DL-3',
  kept:{bar:null,note:'Left on DL-3',on:2},again:true,moved:'moved',card:'From DL-4 · next glass goes on DL-2',put:'DL-2',onI1:true,back:{dl4:2,put:'DL-4'}});

 eq('не туда и на CUT: резчик держит долли на ARRIS и на POLISH отдельно (владелец, 7.10.2026)',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',2);
  /* Полировка вместо арриса — маршрут CUT → POLISH. */
  const a=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:1})),p=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:1,edge:'polish'}));
  const route=stationPlace(stationGlass(p[0])).route.join('>');
  wwLogin('CUT');stationSubmit('DL-1');stationSubmit(a[0]);stationSubmit(p[0]);
  const out={route,w:stationLast.wrong,bar:wwText('[data-station-wrong]')};stationSubmit('DL-2');out.moved=wwOn(p[0]);wwOut();return out;
 }),{route:'CUT>POLISH>HEAT>SHIPR>SHIP',w:{on:'DL-1',to:['ARRIS'],mine:'POLISH'},bar:'DL-1 → ARRISThis glass → POLISH · scan its dolly✓ Keep on DL-1',moved:'CUT:DL-2'});

 eq('пришедшая долли — «кладу на неё же» (владелец, 7.10.2026); стекло, что ещё ждёт здесь, «не туда» не считается',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',1);
  const T=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:2})),I=wwIds(wwOrder({unit:'double',heat:'HT-AN',qty:1}));
  wwLogin('CUT');stationSubmit('DL-1');T.concat(I).forEach(x=>stationSubmit(x));wwOut();
  wwLogin('ARRIS');const kind=stationSubmit('DL-1')&&stationLast.check.kind,put=stationPutOn(),stays=wwText('[data-station-result="carrierIn"] .st-info .mut');
  stationSubmit(T[0]);const quiet=!stationLast.wrong,on=stationLast.rec.on;
  stationSubmit(I[0]);const w=stationLast.wrong;
  wwOut();return {kind,put,stays,quiet,on,w};
 }),{kind:'carrierIn',put:'DL-1',stays:'Glass stays on DL-1',quiet:true,on:'DL-1',w:{on:'DL-1',to:['HEAT'],mine:'IGU'}});

 eq('IGU: клиенты на скиде мешаются без предупреждения (владелец: «на IGU можно мешать»); скид — в юнитах; пришедшая долли на IGU — не «кладу на» (отдают на скидах)',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',1);carrierAdd('SL',1);
  const A=wwIds(wwOrder({unit:'double',heat:'HT-AN',qty:1,customer:'Summit Builders'})),B=wwIds(wwOrder({unit:'double',heat:'HT-AN',qty:1,customer:'North Shore Windows'}));
  wwLogin('CUT');stationSubmit('DL-1');A.concat(B).forEach(x=>stationSubmit(x));wwOut();
  wwLogin('ARRIS');stationSubmit('DL-1');A.concat(B).forEach(x=>stationSubmit(x));wwOut();
  wwLogin('IGU');wwBeeps.length=0;stationSubmit('DL-1');const dollyPut=stationPutOn();
  stationSubmit('SL-1');const warns=[];A.concat(B).forEach(x=>{stationSubmit(x);if(stationLast.wrong||stationLast.foreign)warns.push(x);});
  const count=wwText('[data-station-loaded="SL-1"] .st-src-t b'),sounds=wwBeeps.filter(k=>k==='warn'||k==='error').length;
  wwOut();return {dollyPut,warns,count,sounds};
 }),{dollyPut:'',warns:[],count:'2 units',sounds:0});

 eq('«Sheet done» — только на CUT: на ARRIS скан стекла с дорезанного листа без строки и звука листа; другая станция в той же вкладке — без строки прежней',await t.p.evaluate(async()=>{
  wwReset();carrierAdd('DL',1);const T=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:2}));cutPlanRun(DB.glassBatch.at(-1).number);
  wwLogin('CUT');stationSubmit('DL-1');T.forEach(x=>stationSubmit(x));const cut=/^Sheet 1 done/.test(stationNote),cutSound=wwBeeps.includes('sheet');
  stationNote='Sheet 9 done';location.hash='#station=ARRIS';await new Promise(r=>setTimeout(r,80));const hashNote=stationNote;
  wwOut();wwLogin('ARRIS');wwBeeps.length=0;stationSubmit('DL-1');stationSubmit(T[0]);stationSubmit(T[1]);
  const out={cut,cutSound,hashNote,note:stationNote,sheetSound:wwBeeps.includes('sheet')};history.replaceState(null,'',location.href.split('#')[0]);wwOut();return out;
 }),{cut:true,cutSound:true,hashNote:'',note:'',sheetSound:false});

 eq('вход на станции: клавиатура не прыгает после первой цифры; Enter после PIN не стирает «Wrong number or PIN»',await t.p.evaluate(()=>{
  wwReset();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode='CUT';tab='station';stationLoginNo='';stationLoginStep='no';stationPin='';stationPinError='';render();
  const y=()=>Math.round(document.querySelector('[data-station-key="5"]').getBoundingClientRect().top);
  const before=y();stationLoginKey('9');const after=y();stationLoginKey('back');
  stationLoginKey('9');stationLoginKey('8');stationLoginKey('ok');['1','1','1','1'].forEach(stationLoginKey);const err=wwText('.st-pin-err');stationLoginKey('ok');const kept=wwText('.st-pin-err');
  stationLoginKey('5');const cleared=wwText('.st-pin-err');stationLoginKey('back');
  tab='dashboard';render();return {same:before===after,err,kept,cleared};
 }),{same:true,err:'Wrong number or PIN',kept:'Wrong number or PIN',cleared:''});

 eq('SHIPR всегда на скиде: стекло с долли без скида — «Which skid?», следующий скид забирает; юнит с IGU без выбранного скида остаётся на своём скиде',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',1);carrierAdd('SL',1);carrierAdd('SA',1);
  const S=wwIds(wwOrder({unit:'single',heat:'HT-AN',qty:1})),U=wwIds(wwOrder({unit:'double',heat:'HT-AN',qty:1}));
  wwLogin('CUT');stationSubmit('DL-1');S.concat(U).forEach(x=>stationSubmit(x));wwOut();
  wwLogin('ARRIS');stationSubmit('DL-1');S.concat(U).forEach(x=>stationSubmit(x));wwOut();
  wwLogin('IGU');stationSubmit('SL-1');U.forEach(x=>stationSubmit(x));wwOut();
  const ready=shippingStations().ready;wwLogin(ready);
  stationSubmit(S[0]);const ask=wwText('[data-station-ask-dolly]'),chip=wwText('[data-station-loose]');
  stationSubmit('SA-1');const took=stationLast.check.took;
  stationClearPutOn();stationSubmit(U[0]);const unit=wwOn(U[0])+'|'+wwOn(U[1]);
  wwOut();return {ask,chip,took,s:wwOn(S[0]),unit};
 }),{ask:'WHICH SKID?Scan it · 1 glass without a skid',chip:'No skid · 1',took:1,s:'SHIPR:SA-1',unit:'SHIPR:SL-1|SHIPR:SL-1'});

 eq('перенос диапазоном с той, на которую кладут, — дальше кладут на новую; Undo — обратно; перенос с другой долли «кладу на» не трогает',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',3);const T=wwIds(wwOrder({unit:'single',heat:'HT-FT',qty:3}));
  wwLogin('CUT');stationSubmit('DL-1');T.forEach(x=>stationSubmit(x));
  stationDollyOpen('DL-1');stationDollyTap(2);stationDollyTap(3);stationSubmit('DL-2');
  const put=stationPutOn(),card=wwText('[data-station-result="carrierMoved"] .st-info .mut');
  document.querySelector('[data-dolly-undo]').click();const undo=stationPutOn();
  stationSubmit('DL-3');stationDollyOpen('DL-1');stationDollyTap(1);stationSubmit('DL-2');const other=stationPutOn();
  wwOut();return {put,card,undo,other};
 }),{put:'DL-2',card:'From DL-1 · next glass goes on DL-2',undo:'DL-1',other:'DL-3'});

 eq('CUT: в списке батчей видно Critical и Rush',await t.p.evaluate(()=>{
  wwReset();wwOrder({unit:'single',heat:'HT-FT',qty:1});wwOrder({unit:'single',heat:'HT-FT',qty:1,extra:{priority:'critical'}});wwOrder({unit:'single',heat:'HT-FT',qty:1,extra:{priority:'rush'}});
  wwLogin('CUT');const opts=[...document.querySelectorAll('[data-station-batch] option')].map(o=>o.dataset.urgency+':'+(o.textContent.match(/CRITICAL|RUSH/)||['—'])[0]).sort();
  wwOut();return opts;
 }),['0:—','1:RUSH','2:CRITICAL']);

 eq('стикер несобранного юнита: «Unit not assembled · Not assembled at IGU yet», а не «Unit number»',await t.p.evaluate(()=>{
  wwReset();carrierAdd('DL',1);carrierAdd('SL',1);const id=wwOrder({unit:'double',heat:'HT-AN',qty:1}),U=wwIds(id);
  wwLogin('CUT');stationSubmit('DL-1');U.forEach(x=>stationSubmit(x));wwOut();
  wwLogin('ARRIS');stationSubmit('DL-1');U.forEach(x=>stationSubmit(x));wwOut();
  wwLogin('IGU');stationSubmit('SL-1');stationSubmit(U[0]);wwOut();
  const code=DB.glassUnitId.find(x=>x.key.startsWith(id)).ids[0];
  wwLogin(shippingStations().ready);const kind=stationSubmit(code);
  const out={kind,head:wwText('[data-station-result="unit"] .st-res-h'),big:wwText('[data-station-result="unit"] .st-big span')};wwOut();
  out.head=out.head&&out.head.replace(/\d\d:\d\d.*$/,'').trim();return out;
 }),{kind:'unit',head:'✕ Unit not assembled',big:'Not assembled at IGU yet'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
