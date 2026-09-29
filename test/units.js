/* Пропущенная станция и юнит после IGU. Стекло пришло на HEAT без скана
   EDGE: вопрос «EDGES DONE?» со списком работ, скан не пишется; Yes —
   EDGE отмечается «подтверждено на HEAT», потом HEAT; No — стекло назад.
   Вопрос не держит поток: следующий скан — вопрос уходит в плашку. На IGU —
   состав юнита и стикер юнита, после IGU юнит двигается одним сканом по
   любому G- или по U-; до сборки U- — «сканируй стекло». */
module.exports=async function({page,eq,ok}){
 console.log('units');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.unPrinted=(window.unPrinted||0)+1;};
  window.unReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationIncoming='';stationQuestions=[];stationNote='';stationDrawer=null;stationTab='scan';window.unPrinted=0;};
  /* Стеклопакет из двух лайтов, позиция на 2 юнита; маршрут лайта
     CUT › EDGE › HEAT › IGU › SHIPR › SHIP. */
  window.unOrder=function(){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;
   salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode('6Q240').id;salesSetRecordStatus(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   const o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),pm=glassPieceMap(id);
   return {id,qty:l.qty,lite:(k,n)=>pm.get(cs[k].key).ids[n-1],unit:n=>unitIdAt(id,l.id,n)};
  };
  window.unWho={id:'view-test-ivan',name:'Ivan P.'};
  window.unScan=function(station,code){const c=stationCheck(station,code);return stationRecord(station,c,unWho)?c.kind:c.kind+':no';};
  window.unLogin=function(station,name){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:''});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationQuestions=[];stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.unOut=function(){stationSwitch();tab='dashboard';render();};
  window.unHead=function(){return document.querySelector('.st-res-h').firstChild.textContent;};
 });

 eq('пропуск EDGE: вопрос со списком работ, скан не пишется; Yes — EDGE «подтверждено на HEAT», потом HEAT; нечего подтверждать — ошибка; метка переживает нормализацию',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a=u.lite(0,1),b=u.lite(1,1);
  unScan('CUT',a);unScan('CUT',b);
  const ask=stationCheck('HEAT',b),works=stationSkippedWorks(ask).map(w=>w.station).join(),before=DB.stationScan.length;
  const r=stationConfirmSkipped('HEAT',b,unWho),after=DB.stationScan.length,again=stationConfirmSkipped('HEAT',b,unWho).error;
  const edge=DB.stationScan.find(s=>s.piece===b&&s.station==='EDGE');
  DB.stationScan.push({id:'SC-0000099',at:new Date().toISOString(),piece:a,station:'EDGE',by:'x',byId:'',manual:false,undoneAt:'',undoneBy:'',confirmedAt:'no station!'});normalizeStationScans();
  const bad=DB.stationScan.find(s=>s.id==='SC-0000099');
  return {kind:ask.kind,missed:ask.missed,works,before,after,rec:r.rec&&r.rec.station,confirmed:r.confirmed,again,
   edge:[edge.confirmedAt,edge.manual,edge.by].join('|'),kept:DB.stationScan.find(s=>s.id===edge.id).confirmedAt,bad:'confirmedAt' in bad,waiting:stationPlace(stationGlass(b)).waiting};
 }),{kind:'skipped',missed:['EDGE'],works:'EDGE',before:2,after:4,rec:'HEAT',confirmed:['EDGE'],again:'Nothing to confirm.',edge:'HEAT|true|Ivan P.',kept:'HEAT',bad:false,waiting:'IGU'});

 eq('экран HEAT: вопрос без окна; следующий скан — вопрос в плашку «1 to answer»; плашка возвращает вопрос; No — стекло назад на EDGE, ничего не пишется',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a=u.lite(0,1),b=u.lite(1,1);
  [a,b].forEach(x=>unScan('CUT',x));unScan('EDGE',a);unLogin('HEAT','Marco R.');
  stationSubmit(b);
  const card=document.querySelector('[data-station-result]'),q={result:card.dataset.stationResult,big:card.querySelector('.st-big b').textContent,works:card.querySelectorAll('.st-works div').length,yes:!!card.querySelector('[data-station-yes]'),no:card.querySelector('[data-station-no]').textContent,scans:DB.stationScan.length};
  stationSubmit(a);const chip=document.querySelector('[data-station-questions]').textContent.trim(),nextKind=stationLast.check.kind;
  document.querySelector('[data-station-questions]').click();const back=document.querySelector('[data-station-result]').dataset.stationResult;
  document.querySelector('[data-station-no]').click();
  const no={kind:stationLast.check.kind,head:unHead(),chip:!!document.querySelector('[data-station-questions]'),scans:DB.stationScan.filter(s=>s.piece===b).map(s=>s.station).join(),waiting:stationPlace(stationGlass(b)).waiting};
  unOut();return {q,chip,nextKind,back,no};
 }),{q:{result:'skipped',big:'EDGES DONE?',works:1,yes:true,no:'✕ No — back to EDGE',scans:3},chip:'1 to answer',nextKind:'ok',back:'skipped',
  no:{kind:'skippedNo',head:'✕ EDGE not done',chip:false,scans:'CUT',waiting:'EDGE'}});

 eq('экран HEAT: Yes — стекло принято, в журнале EDGE не здесь, а «at HEAT»',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),b=u.lite(1,1);unScan('CUT',b);unLogin('HEAT','Marco R.');
  stationSubmit(b);document.querySelector('[data-station-yes]').click();
  const out={kind:stationLast.check.kind,note:document.querySelector('.st-note').textContent,journal:[...document.querySelectorAll('.st-journal tbody tr')].map(tr=>tr.children[1].textContent.replace(/G-\d+/,'G').trim()).join('|'),
   edge:DB.stationScan.filter(s=>s.station==='EDGE').map(s=>s.confirmedAt).join(),waiting:stationPlace(stationGlass(b)).waiting,chip:!!document.querySelector('[data-station-questions]')};
  unOut();return out;
 }),{kind:'ok',note:'EDGE confirmed here',journal:'G',edge:'HEAT',waiting:'IGU',chip:false});

 eq('IGU: состав юнита — что уже здесь, что ещё в пути; собран — «Unit complete» и стикер юнита',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a=u.lite(0,1),b=u.lite(1,1);
  [a,b].forEach(x=>{unScan('CUT',x);unScan('EDGE',x);});unScan('HEAT',a);unLogin('IGU','Anna L.');
  stationSubmit(a);const box=document.querySelector('[data-station-unit]'),first={unit:box.dataset.stationUnit===u.unit(1),head:box.querySelector('.st-unit-h b').textContent,rows:[...box.querySelectorAll('.st-unit-r')].map(r=>r.textContent.replace(/·.*?(✓|waiting|broken)/,'$1')).join('|'),sticker:!!box.querySelector('[data-station-unit-sticker]')};
  unScan('HEAT',b);stationSubmit(b);const box2=document.querySelector('[data-station-unit]');
  const done={head:box2.querySelector('.st-unit-h b').textContent,cls:box2.className};
  box2.querySelector('[data-station-unit-sticker]').click();const printed=window.unPrinted;stkPrintCleanup();
  unOut();return {first,done,printed,qty:u.qty};
 }),{first:{unit:true,head:'Unit 1 of 2',rows:'Lite 1 ✓ here|Lite 2 waiting at HEAT',sticker:false},done:{head:'Unit complete',cls:'st-unit done'},printed:1,qty:2});

 eq('после IGU юнит едет одним сканом: по G- любого лайта и по U-; до IGU U- — «Unit number»',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),ids=[u.lite(0,1),u.lite(1,1),u.lite(0,2),u.lite(1,2)];
  ids.forEach(x=>['CUT','EDGE','HEAT'].forEach(st=>unScan(st,x)));
  const early=stationCheck('CUT',u.unit(1)).kind;
  unLogin('IGU','Anna L.');stationSubmit(ids[0]);const igu=stationLast.mates?stationLast.mates.length:0;stationSubmit(ids[1]);
  stationSubmit(ids[2]);stationSubmit(ids[3]);
  unLogin('SHIPR','Sam R.');
  stationSubmit(ids[1]);const byG={kind:stationLast.check.kind,moved:(stationLast.mates||[]).length+1,note:document.querySelector('.st-unitnote').textContent};
  stationSubmit(u.unit(2));const byU={kind:stationLast.check.kind,note:document.querySelector('.st-unitnote').textContent.replace(/U-\d+/,'U')};
  const places=ids.map(x=>stationPlace(stationGlass(x)).waiting).join(),again=stationCheck('SHIPR',u.unit(1)).kind;
  unOut();return {early,igu,byG,byU,places,again};
 }),{early:'unit',igu:0,byG:{kind:'ok',moved:2,note:'Unit moved: 2 glass'},byU:{kind:'ok',note:'Unit moved: 2 glass · U'},places:'SHIP,SHIP,SHIP,SHIP',again:'already'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
