/* Экран станции и журнал сканов: скан переводит стекло на следующую станцию
   маршрута, повтор не пишется, Undo только последнего, On Hold пишется,
   отменённый заказ — нет, стекло из стока принимается, пропущенная станция
   не пишется. Резка отмечается одному стеклу, а не позиции: перенос последнего
   листа по-прежнему работает. Вход по PIN, скан с клавиатуры, лист, офис. */
module.exports=async function({page,eq,ok}){
 console.log('station');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(async()=>{
  window.stReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;stationLast=null;stationSheetView=null;stationNote='';stationMenu=null;
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.stOrder=function(sizes,extra){
   const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}),Object.assign({dueDate:'2026-10-01'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');return id;
  };
  window.stBatch=function(id){glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return DB.glassBatch[DB.glassBatch.length-1];};
  window.stIds=function(id){return glassPieceMap(id).size?[...glassPieceMap(id).values()].flatMap(r=>r.ids):[];};
  window.stWho={id:'view-test-ivan',name:'Ivan P.'};
  window.stScan=function(station,code){const c=stationCheck(station,code),rec=stationRecord(station,c,stWho);return {kind:c&&c.kind,rec:!!rec};};
 });

 eq('скан CUT: запись, стекло ждёт на ARRIS, резка отмечена одному стеклу; повтор и чужие коды не пишутся',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,3]]);const b=stBatch(id),[a,x]=stIds(id);
  const first=stScan('CUT',a),g=stationGlass(a),place=stationPlace(g),item=b.items.find(i=>i.piece===a),other=b.items.find(i=>i.piece===x);
  const again=stScan('CUT',a),digits=stationCheck('CUT',x.slice(2).replace(/^0+/, '')),unit=stationCheck('CUT','U-0000001').kind,unknown=stationCheck('CUT','G-9999999').kind,junk=stationCheck('CUT','hello').kind;
  return {first,route:place.route,waiting:place.waiting,cut:!!item.cutStartedAt,otherCut:!!other.cutStartedAt,line:!!salesRecord(id).lines[0].cutStartedAt,
   again,scans:DB.stationScan.length,digits:digits.code===x&&digits.kind,unit,unknown,junk,rec:Object.keys(DB.stationScan[0]).sort().join(','),by:DB.stationScan[0].by,id:!!/^SC-[0-9a-f-]{36}$/.test(DB.stationScan[0].id)};
 }),{first:{kind:'ok',rec:true},route:['CUT','ARRIS','HEAT','SHIPR','SHIP'],waiting:'ARRIS',cut:true,otherCut:false,line:true,
  again:{kind:'already',rec:false},scans:1,digits:'ok',unit:'unknown',unknown:'unknown',junk:'unknown',rec:'actionId,at,by,byId,deviceId,entityId,id,manual,piece,sequence,station,step,undoneAt,undoneBy',by:'Ivan P.',id:true});

 eq('номер юнита на станции — «Unit number»: сканировать стикер стекла',await t.p.evaluate(async()=>{
  stReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;oqThrough(id,'verified');const u=DB.glassUnitId[0].ids[0];
  return stationCheck('CUT',u).kind;
 }),'unit');

 eq('маршрут по порядку: ARRIS до CUT не пишется (пропуск CUT), после CUT — пишется; CUT после ARRIS — «уже»',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,1]]);stBatch(id);const [a]=stIds(id);
  const early=stationCheck('ARRIS',a),skipped={kind:early.kind,missed:early.missed,rec:!!stationRecord('ARRIS',early,stWho)};
  const cut=stScan('CUT',a),edge=stScan('ARRIS',a),back=stationCheck('CUT',a).kind,heatLater=stationCheck('SHIPR',a),place=stationPlace(stationGlass(a));
  return {skipped,cut,edge,back,heatLater:heatLater.kind+':'+heatLater.missed.join('/'),waiting:place.waiting,notInRoute:stationCheck('DRILL',a).kind};
 }),{skipped:{kind:'skipped',missed:['CUT'],rec:false},cut:{kind:'ok',rec:true},edge:{kind:'ok',rec:true},back:'already',heatLater:'skipped:HEAT',waiting:'HEAT',notInRoute:'route'});

 eq('Undo — только последний скан стекла; снимает отметку резки, стекло снова ждёт на CUT',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,2]]);const b=stBatch(id);const [a]=stIds(id);
  stScan('CUT',a);stScan('ARRIS',a);const [cutRec,edgeRec]=DB.stationScan;
  const blocked=stationUndo(cutRec.id,stWho).error,edgeUndo=stationUndo(edgeRec.id,stWho).ok,cutUndo=stationUndo(cutRec.id,stWho).ok,twice=stationUndo(cutRec.id,stWho).error;
  const item=b.items.find(i=>i.piece===a);
  return {blocked,edgeUndo,cutUndo,twice,kept:DB.stationScan.length,undone:DB.stationScan.every(s=>s.undoneAt&&s.undoneBy==='Ivan P.'),cut:item.cutStartedAt,line:salesRecord(id).lines[0].cutStartedAt,waiting:stationPlace(stationGlass(a)).waiting};
 }),{blocked:'Glass has moved on — undo the later scan first.',edgeUndo:true,cutUndo:true,twice:'Scan not found.',kept:2,undone:true,cut:'',line:'',waiting:'CUT'});

 eq('On Hold пишется (стекло уже порезано) и просит отложить; отменённый заказ — не пишется',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,1]]);stBatch(id);const [a]=stIds(id);const o=salesRecord(id);o.onHold=true;o.holdReason='Customer changing size';
  const hold=stationCheck('CUT',a),rec=!!stationRecord('CUT',hold,stWho);
  const id2=stOrder([[30,20,1]]);const [c]=stIds(id2);salesRecord(id2).status='cancelled';const cancelled=stScan('CUT',c);
  return {hold:hold.kind,reason:hold.reason,rec,cancelled,scans:DB.stationScan.length};
 }),{hold:'hold',reason:'Customer changing size',rec:true,cancelled:{kind:'cancelled',rec:false},scans:1});

 eq('стекло не из батча (рез из стока) принимается и едет дальше по маршруту',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,1]]);const [a]=stIds(id);const c=stationCheck('CUT',a);stationRecord('CUT',c,stWho);
  return {kind:c.kind,stock:c.stock,waiting:stationPlace(stationGlass(a)).waiting,batches:DB.glassBatch.length};
 }),{kind:'ok',stock:true,waiting:'ARRIS',batches:0});

 eq('перенос последнего листа: порезанное стекло не переносится, непорезанное той же позиции — переносится',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,4]]);const b=stBatch(id);const [a,x]=stIds(id);stScan('CUT',a);
  const refused=glassBatchMove(b.number,[a]).error,moved=glassBatchMove(b.number,[x]);
  return {refused,moved:!!moved.ok,to:moved.number,lineLocked:salesLineLocked(salesRecord(id).lines[0])};
 }),{refused:'Cutting has started on this glass.',moved:true,to:'B-0002',lineLocked:true});

 eq('старые данные: замок резки всей позиции раздаётся стёклам только когда у стёкол своих отметок нет',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,3]]);const b=stBatch(id);const [a]=stIds(id);stScan('CUT',a);normalizeDB();
  const scanned=b.items.filter(i=>i.cutStartedAt).length;
  const id2=stOrder([[30,20,2]]);const b2=stBatch(id2);const l=salesRecord(id2).lines[0];l.cutStartedAt='2026-09-02T09:00:00Z';normalizeDB();
  return {scanned,legacy:glassBatchFind(b2.number).items.filter(i=>i.cutStartedAt).length};
 }),{scanned:1,legacy:2});

 eq('журнал — правда о резке: импорт без отметки у стекла восстанавливает её по скану CUT; мусор отсеивается',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,2]]);stBatch(id);const [a]=stIds(id);stScan('CUT',a);
  const src=JSON.parse(JSON.stringify(DB));src.glassBatch[0].items.forEach(i=>{i.cutStartedAt='';});src.salesOrder.forEach(o=>o.lines.forEach(l=>{l.cutStartedAt='';}));
  src.stationScan.push({id:'bad',piece:a,station:'CUT',at:'x'},{id:'SC-0000009',piece:'nope',station:'CUT',at:'2026-09-29T10:00:00Z'},null);
  const next=prepareImportedState(src),item=next.glassBatch[0].items.find(i=>i.piece===a);
  let err='';try{prepareImportedState(Object.assign({},src,{stationScan:{}}));}catch(e){err=e.message;}
  return {restored:!!item.cutStartedAt,scans:next.stationScan.length,seq:next.stationScanSeq,err};
 }),{restored:true,scans:1,seq:'1',err:'The "stationScan" field must be an array.'});

 eq('Critical из заказа: карточка красная, «отложить или отнести сразу»; Rush — жёлтая полоса',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,1]],{priority:'critical'});stBatch(id);const [a]=stIds(id);
  const id2=stOrder([[30,20,1]],{priority:'rush'});stBatch(id2);const [r]=stIds(id2);
  DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:'0000'});normalizeUsers();stationCode='CUT';tab='station';
  stationLogin(DB.user[DB.user.length-1].viewProfileId);stationSubmit(a);
  const crit={bar:document.querySelector('.st-urg').textContent,big:document.querySelector('.st-big').className,note:document.querySelector('.st-big span').textContent};
  stationSubmit(r);const rush=document.querySelector('.st-urg').className;stationSwitch();tab='dashboard';DB.user=DB.user.filter(u=>u.name!=='Ivan P.');render();
  return {crit:Object.assign(crit,{bar:crit.bar===`CRITICAL· order ${salesRecord(id).businessNumber} · due Oct 1`}),rush};
 }),{crit:{bar:true,big:'st-big st-red',note:'Set aside or take it now'},rush:'st-urg st-rush'});

 eq('экран CUT: вход — личный номер и PIN, имён нет (неверный — ошибка), скан с клавиатуры в поле, карточка NEXT, журнал, лист; конец листа — «Sheet 1 done · batch cut»',await (async()=>{
  await t.p.evaluate(async()=>{
   stReset();const id=stOrder([[36,24,2],[20,30,1]]);stBatch(id);cutPlanRun('B-0001');
   DB.user=DB.user.filter(u=>!['Ivan P.','Oleg K.','Office Anna'].includes(u.name));DB.user.push({name:'Oleg K.',role:'Shop',station:'',skills:[{skill:'Cutting',level:'Senior'}],pin:'4321'},{name:'Office Anna',role:'Sales',station:'',skills:[],pin:''});normalizeUsers();
   try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode='CUT';tab='station';render();
  });
  const login=await t.p.evaluate(()=>({names:document.querySelectorAll('.st-name-btn,[data-signin-user]').length,step:document.querySelector('.st-login h2').textContent,app:document.querySelector('.side').offsetParent===null}));
  /* Вход: личный номер + PIN с клавиатуры, имён на экране нет. */
  const no=await t.p.evaluate(()=>String(DB.user.find(u=>u.name==='Oleg K.').no));
  await t.p.keyboard.type(no);await t.p.keyboard.press('Enter');
  await t.p.keyboard.type('1111');const wrong=await t.p.evaluate(()=>document.querySelector('.st-pin-err').textContent==='Wrong number or PIN'&&!stationWho());
  await t.p.keyboard.type(no);await t.p.keyboard.press('Enter');await t.p.keyboard.type('4321');
  const ids=await t.p.evaluate(()=>cutPlanFor('B-0001').groups[0].sheets[0].pieces.map(p=>p.piece));
  await t.p.waitForTimeout(50);
  await t.p.keyboard.type(ids[0]);await t.p.keyboard.press('Enter');await t.p.waitForTimeout(250);
  const card=await t.p.evaluate(()=>({who:stationWho().name,kind:document.querySelector('[data-station-result]').dataset.stationResult,next:document.querySelector('.st-big b').textContent,
   gid:document.querySelector('.st-gid').textContent,rows:document.querySelectorAll('.st-journal tbody tr').length,cut:document.querySelectorAll('.st-pc.cut,.st-pc.now').length,focus:document.activeElement&&document.activeElement.hasAttribute('data-station-scan')}));
  for(const id of ids.slice(1)){await t.p.keyboard.type(id.slice(2).replace(/^0+/, ''));await t.p.keyboard.press('Enter');}
  const end=await t.p.evaluate(()=>({note:document.querySelector('.st-note').textContent,tile:document.querySelector('.st-tile').className,manual:DB.stationScan.filter(s=>s.manual).length,chip:document.querySelector('.st-top').textContent.includes('3 / 3 cut'),
   ru:/[А-Яа-яЁё]/.test(document.getElementById('app').innerText)}));
  return {login,wrong,card:Object.assign(card,{gid:card.gid===ids[0]}),end};
 })(),{login:{names:0,step:'Your number',app:true},wrong:true,card:{who:'Oleg K.',kind:'ok',next:'ARRIS',gid:true,rows:1,cut:1,focus:true},
  end:{note:'Sheet 1 done · batch B-0001 cut',tile:'st-tile done now',manual:2,chip:true,ru:false}});

 eq('нажатие на стекло листа: Mark cut пишет скан с пометкой hand; Recut и стикер — из того же меню; Details — без записи',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,2]]);stBatch(id);cutPlanRun('B-0001');const [a,x]=cutPlanFor('B-0001').groups[0].sheets[0].pieces.map(p=>p.piece);
  stationCode='CUT';tab='station';stationSheetView={batch:'B-0001',glass:'6CLEAR',no:1};render();
  document.querySelector(`[data-station-piece="${x}"] rect`).dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const menu=[...document.querySelectorAll('.st-menu button')].map(b=>b.textContent);
  document.querySelector('.st-menu button').click();const marked=DB.stationScan.map(s=>s.piece+':'+s.manual);
  stationPeek(a);const peek=document.querySelector('[data-station-result]').dataset.stationResult;
  stationSwitch();tab='dashboard';render();
  return {menu,marked:marked.join(),peek,scans:DB.stationScan.length};
 }),await t.p.evaluate(()=>({menu:['✓ Mark cut','✕ Broken — recut','Reprint sticker','Details'],marked:cutPlanFor('B-0001').groups[0].sheets[0].pieces[1].piece+':true',peek:'peek',scans:1})));

 eq('офис: Production → In production — строка на заказ, Critical первым, в раскрытии позиция → стекло → сколько где; плитка станции — фильтр; у батча колонка Cut',await t.p.evaluate(async()=>{
  stReset();const c=oqCustomer({legalName:'North Shore Windows'});const id=oqOrder(c,{dueDate:'2026-10-06'});soDraft=null;soEdit=null;
  salesRecord(id).makeups[0].panes[1].glassProductId=glassProductByCode('6Q240').id;salesSetRecordStatus(id,'verified');
  glassBatchAssign(glassBatchRows([salesRecord(id)]).filter(r=>r.glass==='6CLEAR'),{});
  const first=glassBatchRows([salesRecord(id)]).length,b=DB.glassBatch[0],cutPiece=b.items[0].piece;stScan('CUT',cutPiece);
  const id2=stOrder([[30,20,1]],{priority:'critical',dueDate:'2026-10-09'});stBatch(id2);const [k]=stIds(id2);stScan('CUT',k);
  tab='production';subtab=null;prodOpen=new Set();render();
  const rowCells=oid=>{const tr=document.querySelector(`[data-prod-order="${oid}"]`);return [...tr.children].map(td=>td.textContent.trim());};
  const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim()).filter(Boolean);
  const order=[...document.querySelectorAll('[data-prod-order]')].map(r=>r.dataset.prodOrder);
  const col=h=>heads.indexOf(h),a=rowCells(id);
  const main={glass:a[col('Glass')],shipped:a[col('Shipped')],queue:a[col('To batch')],cut:a[col('CUT')],edge:a[col('ARRIS')],priority:rowCells(id2)[col('Priority')]};
  prodToggle(id);const sub=[...document.querySelectorAll('.pb-sub')].map(tr=>{const td=[...tr.children].map(x=>x.textContent.trim());return [td[col('Order')],td[col('Customer')],td[col('Glass')],td[col('CUT')],td[col('ARRIS')],td[col('To batch')]].join('|');});
  document.querySelector('[data-prod-station="ARRIS"]').click();const edgeRows=document.querySelectorAll('[data-prod-order]').length,chip=!!document.querySelector('[data-filter-chip="st_ARRIS"]');
  document.querySelector('[data-prod-station="IGU"]').click();const iguRows=document.querySelectorAll('[data-prod-order]').length;
  document.querySelector('[data-prod-station="IGU"]').click();document.querySelector('[data-prod-station="ARRIS"]').click();const back=document.querySelectorAll('[data-prod-order]').length;
  const tiles=[...document.querySelectorAll('.pb-tile')].map(t=>t.querySelector('b').textContent+':'+t.querySelector('span').textContent).filter(x=>!x.endsWith(':0'));
  const noIds=!/G-\d{7}/.test(document.querySelector('.pb-table').innerText);
  tab='optimization';optimizationSetTab('production');glassBatchOpenNumber='';render();const cutCell=[...document.querySelectorAll('[data-batch-cut]')].map(td=>td.textContent).sort().join(', ');
  tab='dashboard';render();
  return {first,order:order[0]===id2&&order[1]===id,main,sub,edgeRows,chip,iguRows,back,tiles,noIds,cutCell};
 }),{first:3,order:true,main:{glass:'6CLEAR, 6Q240',shipped:'0 / 6',queue:'3',cut:'2',edge:'1',priority:'Critical'},
  sub:['Line 1|37 × 71 · 2 units · Kitchen|6CLEAR Lite 1|1|1|·','||6Q240 Lite 2|·|·|2','Line 2|30 × 40 · 1 unit · Bedroom|6CLEAR Lite 1|1|·|·','||6Q240 Lite 2|·|·|1'],
  edgeRows:2,chip:true,iguRows:0,back:2,tiles:['To batch:3','CUT:2','ARRIS:2'],noIds:true,cutCell:'1 / 1, 1 / 3'});

 eq('маршрут в строке: станции нет в маршруте — клетка пустая (одинарное стекло и IGU), прошли все — ✓, ещё не дошли — ·',await t.p.evaluate(async()=>{
  stReset();const single=stOrder([[36,24,2]]);stBatch(single);stIds(single).forEach(g=>stScan('CUT',g));
  const dgu=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(dgu,'verified');stBatch(dgu);
  tab='production';subtab='orders';prodOpen=new Set();const p=salesListLoadPrefs();p.filters={};render();
  const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim());
  const cell=(oid,h)=>{const td=document.querySelector(`[data-prod-order="${oid}"]`).children[heads.indexOf(h)];return td?td.textContent.trim():'no column';};
  const out={single:['CUT','ARRIS','IGU'].map(h=>cell(single,h)).join('|'),dgu:['CUT','ARRIS','IGU'].map(h=>cell(dgu,h)).join('|')};
  tab='dashboard';render();return out;
 }),{single:'✓|2|',dgu:'6|·|·'});

 eq('Users → Production: PIN — четыре цифры; без офиса и без навыков',await t.p.evaluate(async()=>{
  tab='users';subtab='production';userEditOpen('new');uDraft.name='Pin Test';uDraft.newPin='12';render();await saveUser();const err=document.getElementById('e_user').textContent;
  uDraft.newPin='0042';await saveUser();const u=DB.user.find(x=>x.name==='Pin Test');
  DB.user.push({name:'Junk',role:'Shop',pin:'abcd'});normalizeUsers();const junk='pin' in DB.user.find(x=>x.name==='Junk');
  DB.user=DB.user.filter(x=>!['Pin Test','Junk'].includes(x.name));render();
  return {err,pin:userPinCheck(u,'0042'),plain:JSON.stringify(u).includes('0042'),junk,access:u&&u.access,keys:u&&Object.keys(u).filter(k=>['role','skills','station'].includes(k))};
 }),{err:'PIN: 4 digits',pin:true,plain:false,junk:false,access:[],keys:[]});

 /* Владелец, 3 октября 2026: «он может быть на двух станциях одновременно
    ответственным». Вход — свой у каждой станции; Switch выходит только с этой. */
 eq('один человек входит на две станции в одном браузере; Switch — только с этой',await t.p.evaluate(async()=>{
  const keep=[tab,stationCode];try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}
  DB.user=DB.user.filter(x=>x.name!=='Two Posts');DB.user.push({name:'Two Posts',pin:'2468'});normalizeUsers();const u=DB.user.find(x=>x.name==='Two Posts');
  const login=code=>{stationCode=code;tab='station';render();String(u.no).split('').forEach(stationLoginKey);stationLoginKey('ok');'2468'.split('').forEach(stationLoginKey);return stationWho()&&stationWho().name;};
  const a=login('ARRIS'),b=login('POLISH');stationCode='ARRIS';const still=stationWho()&&stationWho().name;
  stationSwitch();const gone=stationWho();stationCode='POLISH';const other=stationWho()&&stationWho().name;
  /* Вход станции до версии PIN (запись {station,userId}) читается, но не
     впускает: не известно, при каком PIN он открыт, — номер и PIN ещё раз. */
  localStorage.setItem(STATION_SESSION_KEY,JSON.stringify({station:'CUT',userId:u.viewProfileId,at:'x'}));stationCode='CUT';const legacy=stationWho();
  localStorage.removeItem(STATION_SESSION_KEY);DB.user=DB.user.filter(x=>x!==u);tab=keep[0];stationCode=keep[1];render();
  return {a,b,still,gone,other,legacy};
 }),{a:'Two Posts',b:'Two Posts',still:'Two Posts',gone:null,other:'Two Posts',legacy:null});
 eq('PIN сняли в Users — вход на станции кончается сразу',await t.p.evaluate(async()=>{
  const keep=[tab,stationCode];DB.user=DB.user.filter(x=>x.name!=='Gone Pin');DB.user.push({name:'Gone Pin',pin:'1357'});normalizeUsers();const u=DB.user.find(x=>x.name==='Gone Pin');
  stationCode='CUT';tab='station';stationLogin(u.viewProfileId);const before=stationWho()&&stationWho().name;u.pin='';render();
  const after={who:stationWho(),login:!!document.querySelector('.st-login')};
  localStorage.removeItem(STATION_SESSION_KEY);DB.user=DB.user.filter(x=>x!==u);tab=keep[0];stationCode=keep[1];render();return {before,after};
 }),{before:'Gone Pin',after:{who:null,login:true}});

 eq('живые данные из другой вкладки: база перечитывается, экран не прыгает, пока человек печатает',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,1]]);stBatch(id);const [a]=stIds(id);touch();
  const other=JSON.parse(localStorage.getItem('glazing_system_v1'));other.stationScan=[{id:'SC-0000001',at:'2026-09-29T10:00:00Z',piece:a,station:'CUT',by:'Ivan P.',byId:'',manual:false,undoneAt:'',undoneBy:''}];
  tab='production';subtab='where';render();const inp=document.createElement('input');document.body.appendChild(inp);inp.focus();const before=document.getElementById('app').innerHTML;
  storageLiveReload(JSON.stringify(other));const typing=document.getElementById('app').innerHTML===before;inp.remove();
  const scans=DB.stationScan.length,cut=!!DB.glassBatch[0].items[0].cutStartedAt;
  storageLiveReload('{broken');tab='dashboard';render();
  return {scans,cut,typing,kept:DB.stationScan.length};
 }),{scans:1,cut:true,typing:true,kept:1});

 eq('Recut со станции: Recut в заказе (где, причина, 1 шт), новое стекло ждёт батча и принимается на CUT как рез из стока; разбитое — вне маршрута, Undo и повтор закрыты',await t.p.evaluate(async()=>{
  stReset();const id=stOrder([[36,24,3]]);const b=stBatch(id);const [a,x]=stIds(id);stScan('CUT',a);
  const broke=ncrReasonsFor('CUT',{activeOnly:true}).find(r=>r.name==='Broke');
  const r=stationBreak('CUT',stationCheck('CUT',a),stWho,broke.id),rc=DB.recut[0],newId=r.newIds[0],nc=stationCheck('CUT',newId);
  const rx=stationBreak('CUT',stationCheck('CUT',x),stWho,broke.id),xItem=b.items.find(i=>i.piece===x);
  return {ok:r.ok,ref:r.ref,recut:[rc.where,rc.reason,rc.qty,rc.lineId===salesRecord(id).lines[0].id].join('|'),broken:stationPlace(stationGlass(a)).broken.recut,check:stationCheck('CUT',a).kind,
   newKind:nc.kind,newStock:nc.stock,newWaiting:stationPlace(stationGlass(newId)).waiting,undo:stationUndo(DB.stationScan.find(s=>s.broken).id,stWho).error,
   again:stationBreak('CUT',stationCheck('CUT',a),stWho,broke.id).error,xRef:rx.ref,xCut:!!xItem.cutStartedAt,recuts:DB.recut.length,
   where:[...stationWaiting()].map(([k,v])=>k+':'+v.length).join()};
 }),{ok:true,ref:'R1',recut:'CUT|Broke|1|true',broken:'R1',check:'broken',newKind:'ok',newStock:true,newWaiting:'CUT',undo:'Recut is in the order — change it there.',
  again:'Scan the broken glass first.',xRef:'R2',xCut:true,recuts:2,where:'CUT:1'});

 eq('Recut на ARRIS у стеклопакета — только разбитый лайт; табло: разбитое не считается, новое стекло — в To batch',await t.p.evaluate(async()=>{
  stReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');stBatch(id);
  const o=salesRecord(id),l=o.lines[1],cs=glassBatchComponents(o,l),lite2=glassPieceMap(id).get(cs[1].key).ids[0];
  stScan('CUT',lite2);const chip=ncrReasonsFor('ARRIS',{activeOnly:true}).find(r=>r.name==='Chipped');
  const r=stationBreak('ARRIS',stationCheck('ARRIS',lite2),stWho,chip.id),rc=DB.recut[0];
  tab='production';subtab='orders';prodOpen=new Set();const p=salesListLoadPrefs();p.filters={};render();
  const heads=[...document.querySelectorAll('.pb-table thead th')].map(th=>th.textContent.trim()),tr=document.querySelector(`[data-prod-order="${id}"]`),cell=h=>tr.children[heads.indexOf(h)].textContent.trim();
  const out={where:rc.where,keys:rc.keys.length,lite:rc.lite,shipped:cell('Shipped'),queue:cell('To batch'),cut:cell('CUT')};tab='dashboard';render();return out;
 }),{where:'ARRIS',keys:1,lite:'Lite 2 · 6CLEAR',shipped:'0 / 6',queue:'1',cut:'5'});

 eq('экран: Recut с карточки — окно причин (CUT и общие), одно нажатие, карточка «Recut 1 created», стикер нового стекла; журнал — «✕ Recut 1» без Undo; Sheet broke пишет потерю листа',await (async()=>{
  const r=await t.p.evaluate(async()=>{
   window.print=()=>{window.stPrinted=(window.stPrinted||0)+1;};
   stReset();const id=stOrder([[36,24,2],[20,30,1]]);stBatch(id);cutPlanRun('B-0001');
   DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:'0000'});normalizeUsers();
   stationCode='CUT';tab='station';stationTab='scan';stationDrawer=null;stationLogin(DB.user[DB.user.length-1].viewProfileId);
   const [a]=cutPlanFor('B-0001').groups[0].sheets[0].pieces.map(p=>p.piece);stationSubmit(a);
   document.querySelector('[data-station-recut]').click();
   const reasons=[...document.querySelectorAll('[data-recut-reason]')].map(b=>b.textContent);
   [...document.querySelectorAll('[data-recut-reason]')].find(b=>b.textContent==='Wrong size').click();
   const card={kind:document.querySelector('[data-station-result]').dataset.stationResult,head:document.querySelector('.st-res-h').firstChild.textContent,newId:stationLast.check.newIds[0]===DB.glassPiece.flatMap(r=>Object.values(r.extra||{})).flat()[0]};
   document.querySelector('[data-station-sticker]').click();
   const journal=document.querySelector('.st-journal tbody tr').innerText,undoOnBroken=!!document.querySelector('.st-journal tbody tr button');
   stationOpenSheetBreak();document.querySelector('[data-sheet-break-save]').click();
   const sb=DB.sheetBreak.map(x=>x.batch+':'+x.glass+':'+x.sheet+':'+x.by).join(),pill=document.querySelector('[data-sheet-breaks]').textContent;
   let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{sheetBreak:{}}));}catch(e){err=e.message;}
   stationSwitch();tab='dashboard';render();
   return {reasons,card,printed:window.stPrinted,journal:/✕ Recut 1/.test(journal),undoOnBroken,sb,pill,err,where:DB.recut[0].where+'|'+DB.recut[0].reason};
  });
  return r;
 })(),{reasons:['Wrong size','Wrong glass','Shape cut wrong','Impact','Broke','Chipped','Scratched','Fell from dolly / skid'],card:{kind:'recut',head:'✕ Broken · Recut 1 created',newId:true},printed:1,journal:true,undoOnBroken:false,
  sb:'B-0001:6CLEAR:1:Ivan P.',pill:'broke 1×',err:'The "sheetBreak" field must be an array.',where:'CUT|Wrong size'});

 eq('очередь резки: порядок задаёт офис (▲▼ в Batches), Queue на CUT — батчи по порядку, листы к столу, Recut в ожидании; порезанный батч уходит из очереди',await t.p.evaluate(async()=>{
  stReset();['B','C','D'].forEach(()=>{const id=stOrder([[36,24,2]]);stBatch(id);});['B-0001','B-0002','B-0003'].forEach(n=>cutPlanRun(n));
  const first=glassBatchCutQueue().map(b=>b.number).join();
  glassBatchCutMove('B-0003',-1);glassBatchCutMove('B-0003',-1);const edge=glassBatchCutMove('B-0003',-1);
  tab='optimization';optimizationSetTab('production');glassBatchOpenNumber='';render();
  const cells=[...document.querySelectorAll('[data-batch-queue]')].map(td=>td.dataset.batchQueue+':'+td.querySelector('b').textContent).sort().join();
  document.querySelector('[data-batch-queue="B-0002"] button[title="Cut later"]').click();
  const after=glassBatchCutQueue().map(b=>b.number).join();
  DB.glassBatch.find(b=>b.number==='B-0001').items.forEach(i=>stScan('CUT',i.piece));
  const [p]=DB.glassBatch.find(b=>b.number==='B-0002').items;stationBreak('CUT',stationCheck('CUT',p.piece),stWho,ncrReasonsFor('CUT',{activeOnly:true})[0].id);
  const q=stationQueueData();
  DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:'0000'});normalizeUsers();
  stationCode='CUT';tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);document.querySelector('[data-station-tab="queue"]').click();
  const shown=[...document.querySelectorAll('[data-queue-batch]')].map(x=>x.dataset.queueBatch).join(),topScan=!!document.querySelector('.st-top [data-station-scan]');
  stationSwitch();tab='dashboard';render();
  return {first,edge,cells,after,queue:q.cards.map(c=>c.b.number+':'+c.left).join(),bring:q.bring.map(x=>x.glass+' '+x.label+' '+x.n).join(),recuts:q.recuts.map(x=>x.n).join(),shown,topScan};
 }),{first:'B-0001,B-0002,B-0003',edge:false,cells:'B-0001:2,B-0002:3,B-0003:1',after:'B-0003,B-0001,B-0002',queue:'B-0003:2,B-0002:1',bring:'6CLEAR 144 × 96 2',recuts:'1',shown:'B-0003,B-0002',topScan:true});

 ok('корень сайта сохраняет окончание адреса: …/ERP/#station=CUT открывает экран станции',/location\.replace\('dist\/GLASS_ERP\.html'\+location\.search\+location\.hash\)/.test(require('fs').readFileSync(require('path').join(__dirname,'..','index.html'),'utf8')));

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
