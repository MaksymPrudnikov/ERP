/* Долли и скиды: четыре типа DL · DA · SL · SA с номером внутри типа, скан
   тары на станции — «кладу на неё» или «приехала, покажи стопку», скан
   стекла пишет, на что его положили, стопка сверху вниз, «Not on» для
   стекла в руках, колонка On в Production, Master Data и этикетка. */
module.exports=async function({page,eq,ok}){
 console.log('carriers');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.cvPrinted=(window.cvPrinted||0)+1;};
  window.cvReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationIncoming='';stationNote='';stationDrawer=null;stationTab='scan';
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.cvOrder=function(sizes,extra){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),Object.assign({dueDate:'2026-10-06'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.cvIds=function(id){return [...glassPieceMap(id).values()].flatMap(r=>r.ids);};
  window.cvLogin=function(station,name){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationIncoming='';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
 });

 eq('четыре типа тары и номер внутри типа; мусор отсеивается, импорт без массива — ошибка',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);carrierAdd('DA',1);carrierAdd('SL',1);carrierAdd('SA',1);carrierAdd('DL',1);
  const codes=DB.carrier.map(c=>c.code).join(),types=['DL-1','DA-1','SL-1','SA-1','S-0000001','G-0000001'].map(c=>carrierType(c)?carrierType(c).label:'-').join('|');
  DB.carrier.push({code:'dl-9 '},{code:'XX-1'},{code:'DL-1'},null);normalizeCarriers();
  let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{carrier:{}}));}catch(e){err=e.message;}
  return {codes,types,after:DB.carrier.map(c=>c.code).join(),err};
 }),{codes:'DL-1,DL-2,DA-1,SL-1,SA-1,DL-3',types:'L-shape dolly|A-shape dolly|L-shape skid|A-shape skid|-|-',after:'DL-1,DL-2,DA-1,SL-1,SA-1,DL-3,DL-9',err:'The "carrier" field must be an array.'});

 eq('CUT: скан долли — «кладу на неё», стёкла пишутся на неё; стопка сверху вниз; другая долли — дальше на неё; Not on — стекло в руках',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const id=cvOrder([[36,24,5]]);const g=cvIds(id);cvLogin('CUT','Ivan P.');
  const put=stationSubmit('DL-1');g.slice(0,3).forEach(x=>stationSubmit(x));stationSubmit('DL-2');stationSubmit(g[3]);stationSubmit(g[4]);
  const chip=document.querySelector('[data-station-puton]').textContent.replace(/\s+/g,' ').trim();
  document.querySelector('[data-station-off]').click();
  const c=carrierContents();
  const out={put,dl1:(c.get('DL-1')||[]).map(x=>x.id===g[2]?'top':x.id===g[0]?'bottom':'mid').join(),dl2:(c.get('DL-2')||[]).length,on:DB.stationScan.map(s=>s.on||'—').join(),chip,
   journalOn:[...document.querySelectorAll('.st-journal tbody tr')].map(tr=>tr.children[5].textContent).join()};
  stationSwitch();tab='dashboard';render();return out;
 }),{put:'carrier',dl1:'top,mid,bottom',dl2:1,on:'DL-1,DL-1,DL-1,DL-2,—',chip:'Putting on DL-2✕',journalOn:'—,DL-2,DL-1,DL-1,DL-1'});

 /* Владелец, 7.10.2026: «скан пришедшей долли = кладу на неё же». */
 eq('ARRIS: долли со стеклом для ARRIS — «приехала», стопка справа, и кладут на неё же; пустая — кладу на неё; стекло уходит со старой долли на новую',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',1);carrierAdd('DA',1);const id=cvOrder([[36,24,3]]);const g=cvIds(id);
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');g.forEach(x=>stationSubmit(x));stationSwitch();
  cvLogin('ARRIS','Oleg K.');const inc=stationSubmit('DL-1'),incKind=stationLast.check.kind,putAfterIn=stationPutOn();
  const stack=[...document.querySelectorAll('[data-station-stack] tbody tr .n b')].reduce((n,b)=>n+ +b.textContent,0),waiting=[...document.querySelectorAll('[data-station-incoming]')].map(x=>x.dataset.stationIncoming).join();
  stationSubmit('DA-1');const putKind=stationLast.check.kind;stationSubmit(g[2]);
  const c=carrierContents(),left=(c.get('DL-1')||[]).length,onDA=(c.get('DA-1')||[]).map(x=>x.place.waiting).join();
  const bad=stationSubmit('DL-77')&&stationLast.check.kind;DB.carrier.find(x=>x.code==='DA-1').active=false;stationSubmit('DA-1');const inactive=stationLast.check.kind;
  stationSwitch();tab='dashboard';render();
  return {inc,incKind,putAfterIn,stack,waiting,putKind,left,onDA,bad,inactive};
 }),{inc:'carrier',incKind:'carrierIn',putAfterIn:'DL-1',stack:3,waiting:'DL-1',putKind:'carrierPut',left:2,onDA:'HEAT',bad:'carrierBad',inactive:'carrierBad'});

 /* Владелец, 6.10.2026: «что каким батчем на какой долли — непонятно». */
 eq('ARRIS «Waiting here» по долли: тара с батчами и счётом, без тары — своей строкой; нажатие — стопка: номер — порядок укладки, одинаковые подряд — одной строкой; опустевшая — done',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const id=cvOrder([[36,24,3],[30,20,2]]),g=cvIds(id),bn=DB.glassBatch.at(-1).number;
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');[g[0],g[1],g[3]].forEach(x=>stationSubmit(x));stationSubmit('DL-2');stationSubmit(g[2]);stationClearPutOn();stationSubmit(g[4]);stationSwitch();
  cvLogin('ARRIS','Oleg K.');
  const src=()=>[...document.querySelectorAll('.st-src:not(.done)')].map(r=>r.querySelector('.st-dchip').textContent+':'+r.querySelector('.st-src-t b').textContent+':'+[...r.querySelectorAll('.st-bm')].map(b=>b.textContent.replace(bn,'B')).join(' ')).join('|');
  const before=src(),closed=!document.querySelector('[data-station-stack]');
  document.querySelector('[data-station-incoming="DL-1"]').click();
  const stack=[...document.querySelectorAll('[data-station-stack="DL-1"] tbody tr')].map(tr=>tr.children[0].textContent+'|'+tr.children[2].textContent+'|'+tr.children[5].textContent);
  stationSubmit('DL-1');[g[3],g[0],g[1]].forEach(x=>stationSubmit(x));
  const done=!!document.querySelector('[data-station-stack-done="DL-1"]'),after=src();
  stationSwitch();tab='dashboard';render();
  return {before,closed,stack,done,after};
 }),{before:'DL-1:3 glass:B 3|DL-2:1 glass:B 1|No dolly:1 glass:B 1',closed:true,stack:['#3|Line 2 · 30 × 20|1','#2–1|Line 1 · 36 × 24|2'],done:true,after:'DL-2:1 glass:B 1|No dolly:1 glass:B 1'});

 /* Владелец, 6.10.2026: «опция, чтобы я сам проставлял; базово везде
    долли»; SHIPR — всегда скид (проход 7.10.2026: без скида SHIP было
    нечего грузить), SHIP — свои правила. IGU — без тары (7.10.2026: юнит
    едет по линии на силикон, скид сканирует Shipping ready). */
 eq('Puts on: по умолчанию Dolly, IGU — «—», SHIPR — всегда Skid, SHIP — свои правила; владелец меняет в Master Data; переживает нормализацию',await t.p.evaluate(()=>{
  cvReset();const v=c=>sfPutsOn(DB.station.find(s=>s.code===c)),heat=DB.station.find(s=>s.code==='HEAT');
  const def=['CUT','ARRIS','HEAT','IGU','SHIPR','SHIP'].map(v).join(),ship=sfSetPutsOn('SHIP','dolly');
  sfSetPutsOn('HEAT','none');normalizeShopFloor();const after=v('HEAT');
  tab='masterdata';mdSetTab('stations');const igu=document.querySelector('[data-sf-puts-on="IGU"]').value,own=document.querySelector('[data-sf-station="SHIP"]').textContent.includes('own rules')&&document.querySelector('[data-sf-station="SHIPR"]').textContent.includes('Skid · always');
  delete DB.station.find(s=>s.code==='HEAT').putsOn;tab='dashboard';render();
  return {def,ship,after,igu,own};
 }),{def:'dolly,dolly,dolly,none,skid,none',ship:false,after:'none',igu:'none',own:true});

 /* Владелец, 6.10.2026: «засчитывает и ждёт долли»; следующая долли
    забирает стёкла, отсканированные без неё. 7.10.2026: приехавшая долли —
    «кладу на неё же», значит, забирает и она. */
 eq('Which dolly?: скан без тары засчитан, жёлтая полоса и плашка; «кладу на» забирает, приехавшая — тоже; опция «—» не спрашивает',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',3);const id=cvOrder([[36,24,5]]),g=cvIds(id);cvLogin('CUT','Ivan P.');
  const kind=stationSubmit(g[0]);stationSubmit(g[1]);
  const ask=!!document.querySelector('[data-station-ask-dolly]'),chip=document.querySelector('[data-station-loose]').textContent.replace(/\s+/g,' ').trim();
  stationSubmit('DL-1');const took=stationLast.check.took,card=document.querySelector('[data-station-result]').dataset.stationResult;
  stationSubmit(g[2]);const gone=!document.querySelector('[data-station-loose]');
  stationClearPutOn();DB.station.find(s=>s.code==='CUT').putsOn='none';stationSubmit(g[3]);const none=!document.querySelector('[data-station-ask-dolly]')&&!stationLoose().length;
  delete DB.station.find(s=>s.code==='CUT').putsOn;stationSwitch();
  cvLogin('ARRIS','Oleg K.');stationSubmit(g[0]);stationSubmit('DL-1');const arrived=stationLast.check.kind+':'+(stationLast.check.took||0)+':'+stationLoose().length;
  stationSubmit('DL-2');const fresh=stationLast.check.took;stationSwitch();
  const on=g.map(x=>{const s=DB.stationScan.filter(r=>r.piece===x&&!r.undoneAt).pop();return s?s.station+':'+(s.on||'—'):'-';}).join();
  tab='dashboard';render();return {kind,ask,chip,took,card,gone,none,arrived,fresh,on};
 }),{kind:'ok',ask:true,chip:'No dolly · 2',took:2,card:'carrierTook',gone:true,none:true,arrived:'carrierIn:1:0',fresh:0,on:'ARRIS:DL-1,CUT:DL-1,CUT:DL-1,CUT:—,-'});

 /* Владелец, 6.10.2026: «на №3 у него 30 стёкол — выбирает с 31 по 60 и
    говорит: это на №4»; ошибку можно исправить. */
 eq('перенос диапазоном: окно тары, номер — порядок укладки, #4–6 сканом DL-2; та же тара — ошибка; откуда и кто записано и переживает нормализацию; Undo',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const id=cvOrder([[36,24,6]]),g=cvIds(id);cvLogin('CUT','Ivan P.');stationSubmit('DL-1');g.forEach(x=>stationSubmit(x));
  document.querySelector('[data-station-loaded="DL-1"]').click();
  const rows=[...document.querySelectorAll('[data-dolly-pos]')].map(r=>r.dataset.dollyPos).join();
  document.querySelector('[data-dolly-pos="4"]').click();document.querySelector('[data-dolly-pos="6"]').click();
  const sel=document.querySelector('[data-dolly-sel]').textContent.replace(/\s+/g,' ').trim();
  stationSubmit('DL-1');const same=stationDrawer&&stationDrawer.error;
  const moved=stationSubmit('DL-2'),c=carrierContents(),dl1=(c.get('DL-1')||[]).map(x=>g.indexOf(x.id)).sort().join(),dl2=(c.get('DL-2')||[]).map(x=>g.indexOf(x.id)).sort().join();
  normalizeStationScans();const trace=DB.stationScan.filter(s=>s.on==='DL-2').map(s=>s.moved.from+':'+s.moved.by).join();
  document.querySelector('[data-dolly-undo]').click();const back=(carrierContents().get('DL-1')||[]).length,clean=DB.stationScan.every(s=>!s.moved);
  stationSwitch();tab='dashboard';render();return {rows,sel,same,moved,dl1,dl2,trace,back,clean};
 }),{rows:'6,5,4,3,2,1',sel:'3 glass #4–6 →',same:'Already on DL-1',moved:'moved',dl1:'0,1,2',dl2:'3,4,5',trace:'DL-1:Ivan P.,DL-1:Ivan P.,DL-1:Ivan P.',back:6,clean:true});

 eq('долли ждут на станции: Critical первой, потом кто раньше',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',2);const a=cvOrder([[36,24,1]]),b=cvOrder([[30,20,1]],{priority:'critical'});
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(cvIds(a)[0]);stationSubmit('DL-2');stationSubmit(cvIds(b)[0]);stationSwitch();
  cvLogin('ARRIS','Oleg K.');const order=[...document.querySelectorAll('[data-station-incoming]')].map(x=>x.dataset.stationIncoming).join();stationSwitch();tab='dashboard';render();
  return order;
 }),'DL-2,DL-1');

 /* Владелец, 6.10.2026: «где стекло, там и долли» — тара под числом
    станции, у заказа и у позиции; отдельной колонки On по умолчанию нет. */
 eq('Production: под числом станции — на какой таре лежат стёкла заказа и позиции',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',1);carrierAdd('SA',1);const id=cvOrder([[36,24,2],[30,20,1]]);const g=cvIds(id);
  cvLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit('SA-1');stationSubmit(g[2]);stationSwitch();
  tab='production';subtab='orders';prodOpen=new Set([id]);const p=salesListLoadPrefs();p.filters={};render();
  const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim()),split=el=>[...el.querySelectorAll('[data-prod-on] i')].map(i=>i.textContent).join(',');
  const row=split(document.querySelector(`[data-prod-order="${id}"]`)),sub=[...document.querySelectorAll('.pb-sub')].map(split).join('|');
  const tile=document.querySelector('[data-prod-station="ARRIS"] small').textContent;
  tab='dashboard';render();return {onColumn:heads.includes('On'),row,sub,tile};
 }),{onColumn:false,row:'DL-1 1,SA-1 1',sub:'DL-1 1|SA-1 1',tile:'waiting · 2 dollies'});

 eq('Master Data → Dollies & Skids: добавить, что на таре сейчас, этикетка 4 × 6 с кодом и штрихкодом',await t.p.evaluate(()=>{
  cvReset();tab='masterdata';mdSetTab('carriers');document.querySelector('[data-carrier-add="DA"]').click();document.querySelector('[data-carrier-add="DA"]').click();document.querySelector('[data-carrier-add="SL"]').click();
  const rows=[...document.querySelectorAll('[data-carrier]')].map(r=>r.dataset.carrier+':'+r.children[2].textContent+':'+r.children[3].textContent).join('|');
  const printed=carrierPrintLabels(['DA-2','SL-1','ZZ-1']),labels=[...document.querySelectorAll('[data-carrier-label]')].map(x=>x.dataset.carrierLabel).join(),bars=document.querySelector('[data-carrier-label] svg').querySelectorAll('rect').length;
  stkPrintCleanup();tab='dashboard';render();
  return {rows,printed,labels,bars:bars>20,calls:window.cvPrinted};
 }),{rows:'DA-1:A-shape dolly:empty|DA-2:A-shape dolly:empty|SL-1:L-shape skid:empty',printed:2,labels:'DA-2,SL-1',bars:true,calls:1});

 eq('старый Undo переноса не стирает новые перекладки или следующий производственный скан',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',3);const id=cvOrder([[36,24,2]]),pieces=cvIds(id);cvLogin('CUT','QA');stationSubmit('DL-1');pieces.forEach(p=>stationSubmit(p));
  const who=stationWho(),first=carrierMove(pieces,'DL-2',who);carrierMove(pieces,'DL-3',who);carrierMove(pieces,'DL-2',{name:'Later operator'});
  const before=JSON.stringify(DB),old=carrierMoveUndo(first),same=JSON.stringify(DB)===before;
  const last=carrierMove(pieces,'DL-3',who);stationMove('ARRIS',stationCheck('ARRIS',pieces[0]),who,{on:'DL-3'});
  const after=JSON.stringify(DB),next=carrierMoveUndo(last);
  return {old:!!old.error,same,next:!!next.error,atomic:JSON.stringify(DB)===after};
 }),{old:true,same:true,next:true,atomic:true});

 eq('выбор тары обновляется после отключения и смены Puts on; производство без тары остаётся разрешённым',await t.p.evaluate(()=>{
  cvReset();carrierAdd('DL',1);const id=cvOrder([[36,24,3]]),pieces=cvIds(id);cvLogin('CUT','QA');stationSubmit('DL-1');stationSubmit(pieces[0]);carrierSet('DL-1','active',false);
  const kind=stationSubmit(pieces[1]),inactive=stationScansFor(pieces[1]).at(-1).on||'',loose=stationLoose().length;
  carrierSet('DL-1','active',true);stationSubmit('DL-1');sfSetPutsOn('CUT','none');const changed=stationSubmit(pieces[2]),none=stationScansFor(pieces[2]).at(-1).on||'',put=stationPutOn();sfSetPutsOn('CUT','dolly');
  return {kind,inactive,loose,changed,none,put};
 }),{kind:'ok',inactive:'',loose:1,changed:'ok',none:'',put:''});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
