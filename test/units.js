/* Пропущенная станция и юнит после IGU. Стекло пришло на HEAT без скана
   ARRIS: вопрос «ARRIS DONE?» со списком работ, скан не пишется; Yes —
   ARRIS отмечается «подтверждено на HEAT», потом HEAT; No — стекло назад.
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
     CUT › ARRIS › HEAT › IGU › SHIPR › SHIP. */
  window.unOrder=function(){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;
   salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode('6Q240').id;salesSetRecordStatus(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   const o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),pm=glassPieceMap(id);
   return {id,qty:l.qty,lite:(k,n)=>pm.get(cs[k].key).ids[n-1],unit:n=>unitIdAt(id,l.id,n)};
  };
  window.unWho={id:'view-test-ivan',name:'Ivan P.'};
  window.unScan=function(station,code){const c=stationCheck(station,code);return stationRecord(station,c,unWho)?c.kind:c.kind+':no';};
  window.unLogin=function(station,name){DB.user=DB.user.filter(u=>u.name!==name);DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode=station;tab='station';stationQuestions=[];stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.unOut=function(){stationSwitch();tab='dashboard';render();};
  window.unHead=function(){return document.querySelector('.st-res-h').firstChild.textContent;};
 });

 eq('пропуск ARRIS: вопрос со списком работ, скан не пишется; Yes — ARRIS «подтверждено на HEAT», потом HEAT; нечего подтверждать — ошибка; метка переживает нормализацию',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a=u.lite(0,1),b=u.lite(1,1);
  unScan('CUT',a);unScan('CUT',b);
  const ask=stationCheck('HEAT',b),works=stationSkippedWorks(ask).map(w=>w.station).join(),before=DB.stationScan.length;
  const r=stationConfirmSkipped('HEAT',b,unWho),after=DB.stationScan.length,again=stationConfirmSkipped('HEAT',b,unWho).error;
  const edge=DB.stationScan.find(s=>s.piece===b&&s.station==='ARRIS');
  DB.stationScan.push({id:'SC-0000099',at:new Date().toISOString(),piece:a,station:'ARRIS',by:'x',byId:'',manual:false,undoneAt:'',undoneBy:'',confirmedAt:'no station!'});normalizeStationScans();
  const bad=DB.stationScan.find(s=>s.id==='SC-0000099');
  return {kind:ask.kind,missed:ask.missed,works,before,after,rec:r.rec&&r.rec.station,confirmed:r.confirmed,again,
   edge:[edge.confirmedAt,edge.manual,edge.by].join('|'),kept:DB.stationScan.find(s=>s.id===edge.id).confirmedAt,bad:'confirmedAt' in bad,waiting:stationPlace(stationGlass(b)).waiting};
 }),{kind:'skipped',missed:['ARRIS'],works:'ARRIS',before:2,after:4,rec:'HEAT',confirmed:['ARRIS'],again:'Nothing to confirm.',edge:'HEAT|true|Ivan P.',kept:'HEAT',bad:false,waiting:'IGU'});

 eq('экран HEAT: вопрос без окна; следующий скан — вопрос в плашку «1 to answer»; плашка возвращает вопрос; No — стекло назад на ARRIS, ничего не пишется',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a=u.lite(0,1),b=u.lite(1,1);
  [a,b].forEach(x=>unScan('CUT',x));unScan('ARRIS',a);unLogin('HEAT','Marco R.');
  stationSubmit(b);
  const card=document.querySelector('[data-station-result]'),q={result:card.dataset.stationResult,big:card.querySelector('.st-big b').textContent,works:card.querySelectorAll('.st-works div').length,yes:!!card.querySelector('[data-station-yes]'),no:card.querySelector('[data-station-no]').textContent,scans:DB.stationScan.length};
  stationSubmit(a);const chip=document.querySelector('[data-station-questions]').textContent.trim(),nextKind=stationLast.check.kind;
  document.querySelector('[data-station-questions]').click();const back=document.querySelector('[data-station-result]').dataset.stationResult;
  document.querySelector('[data-station-no]').click();
  const no={kind:stationLast.check.kind,head:unHead(),chip:!!document.querySelector('[data-station-questions]'),scans:DB.stationScan.filter(s=>s.piece===b).map(s=>s.station).join(),waiting:stationPlace(stationGlass(b)).waiting};
  unOut();return {q,chip,nextKind,back,no};
 }),{q:{result:'skipped',big:'ARRIS DONE?',works:1,yes:true,no:'✕ No — back to ARRIS',scans:3},chip:'1 to answer',nextKind:'ok',back:'skipped',
  no:{kind:'skippedNo',head:'✕ ARRIS not done',chip:false,scans:'CUT',waiting:'ARRIS'}});

 eq('экран HEAT: Yes — стекло принято, в журнале ARRIS не здесь, а «at HEAT»',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),b=u.lite(1,1);unScan('CUT',b);unLogin('HEAT','Marco R.');
  stationSubmit(b);document.querySelector('[data-station-yes]').click();
  const out={kind:stationLast.check.kind,note:document.querySelector('.st-note').textContent,journal:[...document.querySelectorAll('.st-journal tbody tr')].map(tr=>tr.children[1].textContent.replace(/G-\d+/,'G').trim()).join('|'),
   edge:DB.stationScan.filter(s=>s.station==='ARRIS').map(s=>s.confirmedAt).join(),waiting:stationPlace(stationGlass(b)).waiting,chip:!!document.querySelector('[data-station-questions]')};
  unOut();return out;
 }),{kind:'ok',note:'ARRIS confirmed here',journal:'G',edge:'HEAT',waiting:'IGU',chip:false});

 eq('step: больший размер исправленного Recut одинаков при обоих порядках сборки и печати через G / U',await t.p.evaluate(async()=>{
  const out=[];
  for(const which of ['unit','1'])for(const reverse of [false,true]){
   unReset();const id=oqOrder(oqCustomer());salesOrderEdit(id);const line=soDraft.lines[0],shape=salesLineGeometryShape(line);shape.lites={'0':{inset:{A:'1',B:'1',C:'1',D:'1'},edgeOps:{},mirror:false}};salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');
   const o=salesRecord(id),l=o.lines[0],reason=ncrReasonsFor('OFFICE',{activeOnly:true}).find(x=>x.name==='Drawing wrong');
   recutCreate({orderId:id,where:'OFFICE',reasonId:reason.id,lines:{[l.id]:{on:true,qty:1,which}}});const r=DB.recut[0];storageCommand(()=>recutSizeCommand(r.id,36*16,71*16));
   glassBatchAssign(glassBatchRows([o]),{});const comps=glassBatchComponents(o,l),pieces=glassPieceMap(id),ids=which==='unit'?recutPieces(r):[pieces.get(comps[0].key).ids[0],recutPieces(r)[0]];ids.forEach(pid=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,pid)));
   unLogin('IGU','Step operator');localStorage.setItem(STATION_AUTOPRINT_KEY,JSON.stringify({IGU:true}));
   const order=reverse?ids.slice().reverse():ids;stationSubmit(order[0]);stationSubmit(order[1]);await new Promise(resolve=>setTimeout(resolve,100));
   const a=stationAsmOf(stationGlass(ids[0]),'IGU'),uid=unitIdAt(id,l.id,a.unit),data=ids.map(pid=>stkUnitData(o,l,a.unit,stationGlass(pid).unit));
   const text=()=>document.getElementById('stkPrintHost').textContent;
   const autoText=text(),automatic={count:window.unPrinted,large:autoText.includes('36 × 71″'),small:autoText.includes('34 × 69″')};
   const labels=ids.concat(uid).map(code=>{const printed=stationPrintUnit(code);return {printed,large:text().includes('36 × 71″'),same:text()===autoText};});
   out.push({complete:a.complete,each:ids.map(pid=>{const g=stationGlass(pid);return stkGlassData('final',o,l,g.c,g.unit,{}).finished;}),sizes:data.map(d=>d.finished),automatic,labels});
   localStorage.removeItem(STATION_AUTOPRINT_KEY);stkPrintCleanup();unOut();
  }
  return out;
 }),['unit','1'].flatMap(which=>[false,true].map(()=>({complete:true,each:[{w:which==='unit'?34:35,h:69},{w:36,h:71}],sizes:[{w:36,h:71},{w:36,h:71}],automatic:{count:1,large:true,small:false},labels:[1,2,3].map(()=>({printed:true,large:true,same:true}))}))));

 eq('IGU: юнит собирается из того, что сканируют, — лайт 1 юнита 1 с лайтом 2 юнита 2; номер юнита — когда собран; стикер юнита',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a1=u.lite(0,1),b2=u.lite(1,2);
  [a1,b2].forEach(x=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,x)));unLogin('IGU','Anna L.');
  stationSubmit(a1);const box=document.querySelector('[data-station-unit]');
  const first={head:box.querySelector('.st-unit-h b').textContent,rows:[...box.querySelectorAll('.st-unit-r')].map(r=>r.querySelector('.st-unit-st').firstChild.textContent).join('|'),big:document.querySelector('.st-big b').textContent,waiting:stationPlace(stationGlass(a1)).waiting};
  stationSubmit(b2);const box2=document.querySelector('[data-station-unit]');
  const done={head:box2.querySelector('.st-unit-h b').textContent,unit:box2.dataset.stationUnit===u.unit(1),rows:[...box2.querySelectorAll('.st-unit-r')].map(r=>r.querySelector('.st-unit-st').firstChild.textContent).join('|'),next:[a1,b2].map(x=>stationPlace(stationGlass(x)).waiting).join()};
  box2.querySelector('[data-station-unit-sticker]').click();const printed=window.unPrinted;stkPrintCleanup();
  const recs=DB.stationScan.filter(s=>s.station==='IGU');normalizeStationScans();const kept=DB.stationScan.filter(s=>s.station==='IGU').map(s=>(s.asm===recs[0].id)+':'+s.unit).join();
  unOut();return {first,done,printed,kept};
 }),{first:{head:'Unit · waiting for its pair',rows:'✓ in|1 waiting here',big:'IN',waiting:'IGU'},done:{head:'Unit complete',unit:true,rows:'✓ in|✓ in',next:'SHIPR,SHIPR'},printed:1,kept:'true:1,true:1'});

 eq('пример владельца: 6CL в машине, 6Q поцарапан — Recut на IGU; 6CL вынимают на долли, ждёт пару; другие юниты собираются; новое 6Q — «пара на DL-1», юнит собран',await t.p.evaluate(()=>{
  unReset();carrierAdd('DL',1);const u=unOrder(),a1=u.lite(0,1),b1=u.lite(1,1),a2=u.lite(0,2),b2=u.lite(1,2);
  [a1,b1,a2,b2].forEach(x=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,x)));unLogin('IGU','Anna L.');
  stationSubmit(a1);stationSubmit(b1);
  document.querySelector('[data-station-recut]').click();const note=document.querySelector('[data-recut-out]').textContent.replace(/\s+/g,' ');
  [...document.querySelectorAll('[data-recut-reason]')].find(b=>b.textContent==='Scratched').click();
  const card={kind:stationLast.check.kind,park:document.querySelector('[data-station-park]').textContent},newId=stationLast.check.newIds[0];
  stationSubmit('DL-1');const parkCard=document.querySelector('[data-station-result]').dataset.stationResult;
  const a1Place=stationPlace(stationGlass(a1)).waiting,onDolly=(carrierContents().get('DL-1')||[]).map(x=>x.id===a1).join(),pairs=[...document.querySelector('[data-station-pairs] tbody tr').children].slice(1).map(td=>td.textContent).join('|');
  stationSubmit(a2);stationSubmit(b2);const other=stationLast.check.kind+':'+document.querySelector('[data-station-unit]').dataset.stationUnit.slice(-1);
  unOut();['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,newId));unLogin('IGU','Anna L.');
  stationSubmit(newId);const take=[...document.querySelectorAll('[data-station-unit] .st-unit-r')].map(r=>r.querySelector('.st-unit-st').firstChild.textContent).join('|');
  stationSubmit(a1);const last={head:document.querySelector('.st-unit-h b').textContent,unit:document.querySelector('[data-station-unit]').dataset.stationUnit.slice(-1),pairs:!!document.querySelector('[data-station-pairs]')};
  const journal=DB.stationScan.filter(s=>s.piece===a1).map(s=>s.station+(s.park?':park':'')+(s.undoneAt?':undone':'')).join();
  unOut();return {note,card,parkCard,a1Place,onDolly,pairs,other,take,last,journal,b1:stationPlace(stationGlass(b1)).broken.recut};
 }),{note:'Lite 1 · 6CLEAR comes out of the machine and waits for the new glass on a dolly',card:{kind:'recut',park:'Out of the machine: Lite 1 · 6CLEAR · scan the dolly it waits on'},parkCard:'carrierPark',
  a1Place:'IGU',onDolly:'true',pairs:'Line 1 · 37 × 71|Lite 1 · 6CLEAR|DL-1|needs 6Q240 · Recut 1 To batch',other:'ok:1',take:'on DL-1 — take it|✓ in',last:{head:'Unit complete',unit:'2',pairs:false},journal:'CUT,ARRIS,HEAT,IGU:undone,IGU:park,IGU',b1:'R1'});

 eq('юнит разбили на скиде через пару дней — Recut всего юнита: оба лайта из маршрута, новые стёкла на весь юнит, номер юнита освобождается',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),a1=u.lite(0,1),b1=u.lite(1,1);
  [a1,b1].forEach(x=>['CUT','ARRIS','HEAT','IGU'].forEach(st=>unScan(st,x)));unScan('SHIPR',a1);
  unLogin('SHIP','Sam R.');stationPeek(a1);document.querySelector('[data-station-recut]').click();const note=document.querySelector('[data-recut-whole]').textContent.replace(/U-\d+/,'U');
  [...document.querySelectorAll('[data-recut-reason]')].find(b=>b.textContent==='Broke').click();
  const r=DB.recut[DB.recut.length-1],head=document.querySelector('.st-res-h').textContent,fresh=stationLast.check.newIds.length;
  const out={note,head:/^✕ Unit broken · Recut 1 created/.test(head),keys:r.keys.length,which:r.which,fresh,broken:[a1,b1].map(x=>stationPlace(stationGlass(x)).broken.recut).join(),free:stationAsms(salesRecord(u.id),salesRecord(u.id).lines[0],'IGU').filter(a=>a.unit&&!a.broken).length};
  unOut();return out;
 }),{note:'Whole unit U — all 2 glass are made again',head:true,keys:2,which:'unit',fresh:2,broken:'R1,R1',free:0});

 eq('после IGU юнит едет одним сканом: по G- любого лайта и по U-; до IGU U- — «Unit number»',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),ids=[u.lite(0,1),u.lite(1,1),u.lite(0,2),u.lite(1,2)];
  ids.forEach(x=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,x)));
  const early=stationCheck('CUT',u.unit(1)).kind;
  unLogin('IGU','Anna L.');stationSubmit(ids[0]);const igu=stationLast.mates?stationLast.mates.length:0;stationSubmit(ids[1]);
  stationSubmit(ids[2]);stationSubmit(ids[3]);
  unLogin('SHIPR','Sam R.');
  stationSubmit(ids[1]);const byG={kind:stationLast.check.kind,moved:(stationLast.mates||[]).length+1,note:document.querySelector('.st-unitnote').textContent};
  stationSubmit(u.unit(2));const byU={kind:stationLast.check.kind,note:document.querySelector('.st-unitnote').textContent.replace(/U-\d+/,'U')};
  const places=ids.map(x=>stationPlace(stationGlass(x)).waiting).join(),again=stationCheck('SHIPR',u.unit(1)).kind;
  unOut();return {early,igu,byG,byU,places,again};
 }),{early:'unit',igu:0,byG:{kind:'ok',moved:2,note:'Unit moved: 2 glass'},byU:{kind:'ok',note:'Unit moved: 2 glass · U'},places:'SHIP,SHIP,SHIP,SHIP',again:'already'});

 eq('стикер юнита печатается сам, как только отсканированы все лайты (принтер у силикона); выключено — только кнопкой',await (async()=>{
  await t.p.evaluate(()=>{
   unReset();try{localStorage.removeItem(STATION_AUTOPRINT_KEY);}catch(e){}
   const u=unOrder();window.unU=u;[u.lite(0,1),u.lite(1,1),u.lite(0,2),u.lite(1,2)].forEach(x=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,x)));unLogin('IGU','Anna L.');
   window.unChip0=document.querySelector('[data-station-autoprint]').textContent;document.querySelector('[data-station-autoprint]').click();
   stationSubmit(u.lite(0,1));stationSubmit(u.lite(1,1));
  });
  await t.p.waitForTimeout(200);
  return await t.p.evaluate(()=>{
   const on={chip0:unChip0,chip:document.querySelector('[data-station-autoprint]').textContent,printed:window.unPrinted,head:document.querySelector('.st-unit-h b').textContent,btn:document.querySelector('[data-station-unit-sticker]').textContent,label:document.querySelector('.stk-print-page')?'page':'none'};
   stkPrintCleanup();document.querySelector('[data-station-autoprint]').click();window.unPrinted=0;
   stationSubmit(unU.lite(0,2));stationSubmit(unU.lite(1,2));
   return new Promise(res=>setTimeout(()=>{const off={printed:window.unPrinted,head:document.querySelector('.st-unit-h b').textContent};unOut();try{localStorage.removeItem(STATION_AUTOPRINT_KEY);}catch(e){}res({on,off});},200));
  });
 })(),{on:{chip0:'Unit stickers By button',chip:'Unit stickers Auto',printed:1,head:'Unit complete · print requested',btn:'Reprint unit sticker',label:'page'},off:{printed:0,head:'Unit complete'}});

 eq('пару забраковали у света — её не сканируют: Recut у недостающего лайта; лайт в машине — на долли; стикер юнита не печатается',await t.p.evaluate(()=>{
  unReset();try{localStorage.setItem(STATION_AUTOPRINT_KEY,JSON.stringify({IGU:true}));}catch(e){}
  const u=unOrder(),a1=u.lite(0,1),b1=u.lite(1,1),b2=u.lite(1,2);[a1,b1,b2].forEach(x=>['CUT','ARRIS','HEAT'].forEach(st=>unScan(st,x)));unLogin('IGU','Anna L.');
  stationSubmit(a1);const btn=document.querySelector('[data-station-pair-recut]');const which=btn.dataset.stationPairRecut===glassBatchComponents(salesRecord(u.id),salesRecord(u.id).lines[0])[1].key;btn.click();
  const note=document.querySelector('[data-recut-out]').textContent.replace(/\s+/g,' ');
  [...document.querySelectorAll('[data-recut-reason]')].find(b=>b.textContent==='Scratched').click();
  const out={which,note,kind:stationLast.check.kind,broken:[b1,b2].map(x=>{const p=stationPlace(stationGlass(x));return p.broken?'broken':p.waiting;}).join(),a1:stationPlace(stationGlass(a1)).waiting,park:DB.stationScan.filter(s=>s.piece===a1).map(s=>s.station+(s.park?':park':'')+(s.undoneAt?':undone':'')).join(),
   iguScansOfPair:DB.stationScan.filter(s=>s.piece===b1&&s.station==='IGU'&&!s.broken).length,printed:window.unPrinted,parkCard:!!document.querySelector('[data-station-park]')};
  unOut();try{localStorage.removeItem(STATION_AUTOPRINT_KEY);}catch(e){}return out;
 }),{which:true,note:'Lite 1 · 6CLEAR comes out of the machine and waits for the new glass on a dolly',kind:'recut',broken:'broken,IGU',a1:'IGU',park:'CUT,ARRIS,HEAT,IGU:undone,IGU:park',iguScansOfPair:0,printed:0,parkCard:true});

 eq('стикер не читается: юнит набирается коротко «U5»; строка «Waiting here» — отметить одно стекло без стикера или напечатать новый стикер',await t.p.evaluate(()=>{
  unReset();const codes=['u5','U-12','U12345678'].map(stationCodeOf).join();
  const u=unOrder(),a1=u.lite(0,1),a2=u.lite(0,2);[a1,a2].forEach(x=>unScan('CUT',x));unLogin('ARRIS','Oleg K.');
  const rows=[...document.querySelectorAll('[data-station-here]')],row=rows.find(r=>r.textContent.includes('6CLEAR'));row.click();
  const acts=[...document.querySelectorAll('.st-here-acts button')].map(b=>b.textContent);
  document.querySelector('[data-station-here-mark]').click();
  const marked=DB.stationScan.filter(s=>s.station==='ARRIS').map(s=>s.manual+':'+([a1,a2].includes(s.piece))).join(),card=stationLast.check.kind,count=document.querySelector(`[data-station-here="${row.dataset.stationHere}"] .n b`).textContent;
  document.querySelector(`[data-station-here="${row.dataset.stationHere}"]`).click();document.querySelector('[data-station-here-print]').click();const printed=window.unPrinted;stkPrintCleanup();
  unOut();return {codes,acts,marked,card,count,printed};
 }),{codes:'U-0000005,U-0000012,U-12345678',acts:['✓ Mark 1 glass done','Print a new sticker','Drawing'],marked:'true:true',card:'ok',count:'1',printed:1});

 eq('после IGU: «Waiting here» юнитами, «Mark 1 unit done» пишет оба лайта, «U1» с клавиатуры двигает юнит, на карточке — «Unit sticker»',await t.p.evaluate(()=>{
  unReset();const u=unOrder(),ids=[u.lite(0,1),u.lite(1,1),u.lite(0,2),u.lite(1,2)];
  ids.forEach(x=>['CUT','ARRIS','HEAT','IGU'].forEach(st=>unScan(st,x)));unLogin('SHIPR','Sam R.');
  const row=document.querySelector('[data-station-here]'),text=[...row.children].slice(1).map(td=>td.textContent).join('|');
  row.click();const acts=[...document.querySelectorAll('.st-here-acts button')].map(b=>b.textContent);document.querySelector('[data-station-here-mark]').click();
  const moved=DB.stationScan.filter(s=>s.station==='SHIPR').length,manual=DB.stationScan.filter(s=>s.station==='SHIPR').every(s=>s.manual);
  stationSubmit('U2');const byU={kind:stationLast.check.kind,moved:DB.stationScan.filter(s=>s.station==='SHIPR').length,manual:DB.stationScan.filter(s=>s.station==='SHIPR').slice(-2).map(s=>s.manual).join()};
  document.querySelector('[data-station-unit-reprint]').click();const printed=window.unPrinted,label=!!document.querySelector('.stk-print-page');stkPrintCleanup();
  unOut();return {text,acts,moved,manual,byU,printed,label};
 }),{text:'Line 1 · 37 × 71|Unit · 6CLEAR / 6Q240|B-0001|2|',acts:['✓ Mark 1 unit done','Print a new unit sticker','Drawing'],moved:2,manual:true,byU:{kind:'ok',moved:4,manual:'true,true'},printed:1,label:true});

 eq('поздняя долли забирает оба слоя LAM: отдельный ламинат и ламинированный лайт внутри IGU',await t.p.evaluate(()=>{
  const result=[];for(const type of ['single','double']){
   unReset();carrierAdd('DL',1);const id=oqOrder(oqCustomer());salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType=type;
   const lam=normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0);lam.priceOverride=9;m.panes=type==='single'?[lam]:[lam,m.panes[1]];if(type==='single')m.cavities=[];soDraft.lines=[soDraft.lines[0]];soDraft.lines[0].qty=1;
   salesOrderSave();salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   const pieces=[...stationPieceIndex()].filter(([p,h])=>h.orderId===id&&stationGlass(p).c.ply).map(([p])=>p);
   for(const p of pieces)for(let n=0;n<8;n++){const g=stationGlass(p),s=stationPlace(g).waiting;if(!s||s==='LAM')break;stationMove(s,stationCheck(s,p),unWho);}
   unLogin('LAM','Laminator');pieces.forEach(p=>stationSubmit(p));const loose=stationLoose().length;stationSubmit('DL-1');result.push([pieces.length,loose,(carrierContents().get('DL-1')||[]).length,pieces.every(p=>stationScansFor(p).at(-1).on==='DL-1')]);unOut();
  }return result;
 }),[[2,2,2,true],[2,2,2,true]]);
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
