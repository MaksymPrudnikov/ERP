/* База по записям в IndexedDB (задание «База», этап 1): старт пустой, действие
   пишет только свои записи, F5 возвращает ту же базу, откат, вторая вкладка,
   Retry save, место и проверка версии. */
module.exports=async function({page,eq,ok}){
 console.log('storage-records');
 const t=await page();
 /* После каждого F5: заготовки заказа и счётчик — какие записи ушли в базу за действие. */
 const setup=async()=>{
  await require('./optimization-fixture')(t.p);
  await t.p.evaluate(()=>{
   window.srWritten=[];const real=storageIdbWrite;
   storageIdbWrite=(changes,...a)=>{srWritten.push(changes.map(c=>c.tbl+(c.del?' -':'')));return real(changes,...a);};
   window.srOrder=()=>{oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;};
   window.srCount=async()=>(await storageIdbReadAll()).records.length;
  });
 };
 const reload=async()=>{await t.p.reload();await t.p.evaluate(()=>window.storageReady);await setup();};

 await t.p.evaluate(async()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify({customer:[{id:'OLD-1',legalName:'Old browser'}],salesOrder:[],station:[]}));await storageSeed({});});
 await reload();
 eq('старт пустой: старая база localStorage не читается и не удаляется',await t.p.evaluate(()=>({customers:DB.customer.length,stations:DB.station.length,kept:JSON.parse(localStorage.getItem(STORAGE_KEY)).customer[0].id})),
  {customers:0,stations:15,kept:'OLD-1'});

 eq('скан пишет свои записи, а не всю базу',await t.p.evaluate(async()=>{
  const id=srOrder();await storageFlush();const total=await srCount();
  const o=salesRecord(id),l=o.lines[0],piece=glassPieceMap(id).get(glassBatchComponents(o,l)[0].key).ids[0];
  srWritten=[];const c=stationCheck('CUT',piece),rec=stationMove('CUT',c,{id:'sr',name:'Storage test'});await storageFlush();
  const tables=[...new Set(srWritten.flat())].sort();
  return {scan:!!rec,total:total>500,written:srWritten.flat().length<=12,tables:tables.includes('stationScan')&&!tables.includes('station')&&!tables.includes('glassProduct')};
 }),{scan:true,total:true,written:true,tables:true});

 eq('правка одного клиента пишет одну запись',await t.p.evaluate(async()=>{
  await storageFlush();srWritten=[];const c=DB.customer[0];storageCommand(()=>{c.notes='One record';});await storageFlush();
  return srWritten.flat();
 }),['customer']);

 /* Порядок строк: в начало, в середину, в конец и удаление — после F5 тот же. */
 const before=await t.p.evaluate(async()=>{
  srOrder();
  ['First','Middle','Last','Gone'].forEach(n=>oqCustomer({legalName:n}));touch();
  storageCommand(()=>{const c=DB.customer,at=n=>c.findIndex(x=>x.legalName===n);
   c.unshift(c.splice(at('Last'),1)[0]);c.splice(1,0,c.splice(at('Middle'),1)[0]);c.splice(at('Gone'),1);c.push(c.splice(at('First'),1)[0]);});
  /* Порядок ключей верхнего уровня задаёт DEFAULT, а не история вкладки. */
  await storageFlush();return JSON.stringify(Object.keys(DB).sort().map(k=>[k,DB[k]]));
 });
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 eq('после F5 база та же байт в байт, порядок строк тот же',await t.p.evaluate(b=>JSON.stringify(Object.keys(DB).sort().map(k=>[k,DB[k]]))===b,before),true);
 await setup();

 /* Несохранёнными до команды бывают только фигуры открытого заказа (П5). */
 eq('отказ записи: в памяти ровно прежнее, включая несохранённые фигуры открытого заказа',await t.p.evaluate(async()=>{
  await storageFlush();DB.shapeDef.push({id:'SR-SHAPE',name:'Typed, not saved'});const before=JSON.stringify(DB),stored=testStoredText(),keep=window.storageWrite;
  window.storageWrite=()=>{throw new DOMException('Test quota','QuotaExceededError');};
  let out;try{out=storageCommand(()=>{DB.customer[1].notes='Lost';DB.customer.push({id:'SR-LOST'});});}finally{window.storageWrite=keep;}
  return {ok:out.ok,same:JSON.stringify(DB)===before,stored:testStoredText()===stored};
 }),{ok:false,same:true,stored:true});

 await t.p.evaluate(()=>{storageCommand(()=>{DB.customer[0].legalName='Before F5';});});await reload();
 eq('запись, начатая перед F5, доходит до базы',await t.p.evaluate(()=>DB.customer[0].legalName),'Before F5');
 /* Область записи (storageCommand): пишется названное; пропущенное дописывает
    полное сравнение в простое (storageSweep). */
 eq('область записи: команда пишет названное, новые строки видны всегда; пропущенное дописывает полное сравнение в простое',await t.p.evaluate(async()=>{
  await storageFlush();const keep=window.GF_SCOPE_CHECK;window.GF_SCOPE_CHECK=false;const a=DB.customer[0],b=DB.customer[1];
  const out=storageCommand(()=>{a.notes='Scoped';b.notes='Missed';DB.customer.push({id:'SR-NEW',legalName:'New'});},{customer:[a.id]});window.GF_SCOPE_CHECK=keep;
  const stored=()=>{const c=testStoredState().customer;return [c.find(x=>x.id===a.id).notes,c.find(x=>x.id===b.id).notes,c.some(x=>x.id==='SR-NEW')];};
  const first=stored();archiveInputAt=0;storageSweep();
  return {ok:out.ok,scoped:first[0],missed:first[1]==='Missed',added:first[2],after:stored()};
 }),{ok:true,scoped:'Scoped',missed:false,added:true,after:['Scoped','Missed',true]});

 /* Область из ключей не перебирает всю таблицу (storageDiffTail): ответ тот
    же, что у полного прохода; строку заменили или удалили — полный проход. */
 eq('область из ключей: тот же ответ без перебора таблицы; замена и удаление строки — полный проход',await t.p.evaluate(()=>{
  const keep=DB.customer.slice(),only=()=>new Map([['customer',new Set([keep[1].id])]]),slow=()=>{storageSeen.delete('customer');return storageDiff(DB,only());};
  const tailFn=storageDiffTail,used=[];window.storageDiffTail=function(){const r=tailFn.apply(this,arguments);used.push(r);return r;};
  const both=()=>{used.length=0;const f=storageDiff(DB,only()),hit=used[0]===true,s2=slow();touch();return {same:JSON.stringify(f)===JSON.stringify(s2),hit,rows:f.map(c=>c.id===keep[1].id?'named':c.id)};};
  const notes=keep.slice(0,2).map(c=>c.notes);touch();DB.customer.push({id:'TAIL-1',legalName:'Tail'});keep[1].notes='Named';keep[0].notes='Unnamed';
  const tail=both();
  DB.customer[0]=Object.assign({},DB.customer[0],{notes:'Swapped'});const swapped=both();
  DB.customer.splice(1,1);const removed=both();
  window.storageDiffTail=tailFn;keep[0].notes=notes[0];keep[1].notes=notes[1];DB.customer=keep;touch();
  return {tail,swapped:[swapped.same,swapped.hit],removed:[removed.same,removed.hit]};
 }),{tail:{same:true,hit:true,rows:['named','TAIL-1']},swapped:[true,false],removed:[true,false]});

 /* Вторая вкладка: запись одной — сразу в памяти другой. */
 const p2=await t.c.newPage();p2.on('pageerror',e=>t.errs.push(e.message));p2.on('dialog',d=>d.accept());
 await p2.goto(t.p.url());await p2.evaluate(()=>window.storageReady);
 await p2.evaluate(()=>storageTakeControl());
 await p2.evaluate(async()=>{storageCommand(()=>{DB.customer[0].legalName='From tab two';});await storageFlush();});
 await t.p.waitForFunction(()=>DB.customer[0].legalName==='From tab two',null,{timeout:5000}).catch(()=>{});
 eq('вторая вкладка получает изменения записями',await t.p.evaluate(()=>({name:DB.customer[0].legalName,writer:storageWriter})),{name:'From tab two',writer:false});
 await p2.close();
 await t.p.evaluate(()=>storageTakeControl());

 eq('Import старого JSON — та же база',await t.p.evaluate(async()=>{
  const env=storageExportEnvelope(),text=JSON.stringify(env.data),ok=await storageImportState(JSON.parse(JSON.stringify(env)));
  return {ok,same:JSON.stringify(prepareImportedState(JSON.parse(text)))===JSON.stringify(DB)};
 }),{ok:true,same:true});

 eq('база больше 10 МБ импортируется и переживает F5',await t.p.evaluate(async()=>{
  const env=JSON.parse(JSON.stringify(storageExportEnvelope())),note='x'.repeat(2000);
  for(let i=0;i<6000;i++)env.data.customer.push({...env.data.customer[0],id:'SR-BIG-'+i,code:'B'+i,legalName:'Big '+i,displayName:'Big '+i,notes:note});
  const size=JSON.stringify(env).length,ok=await storageImportState(env);return {size:size>10*1048576,ok,count:DB.customer.length>6000};
 }),{size:true,ok:true,count:true});
 await reload();
 eq('большая база после F5 на месте',await t.p.evaluate(()=>DB.customer.filter(c=>/^SR-BIG-/.test(c.id)).length),6000);

 eq('запись не дошла: полоса Not saved, Retry save дописывает, следующее действие ждёт',await t.p.evaluate(async()=>{
  const real=storageIdbWrite;let fails=1;storageIdbWrite=(...a)=>fails-->0?Promise.reject(new Error('Disk broke')):real(...a);
  storageCommand(()=>{DB.customer[0].legalName='Needs retry';});const flushed=await storageFlush();afterRender();
  const bar=document.getElementById('storageAlert'),shown=!bar.hidden&&/Retry save/.test(bar.textContent)&&/Not saved/.test(bar.textContent);
  const next=storageCommand(()=>{DB.customer[1].legalName='Waits';}).ok,memory=DB.customer[0].legalName;
  storageRetry();const retried=await storageFlush();storageIdbWrite=real;afterRender();
  const back=await storageIdbGet([['customer',DB.customer[0].id]]);
  return {flushed,shown,next,memory,retried,stored:JSON.parse(back.records[0].data).legalName,cleared:document.getElementById('storageAlert').hidden};
 }),{flushed:false,shown:true,next:false,memory:'Needs retry',retried:true,stored:'Needs retry',cleared:true});

 eq('Last action у администратора: от клика до готового экрана',await t.p.evaluate(()=>{
  storageLastAction=null;tab='sales';render();document.querySelector('#side .nav-item').click();
  const m=document.getElementById('storageStatus').textContent.match(/Last action (\d+) ms/);return !!m&&+m[1]>=0&&+m[1]<30000;
 }),true);
 /* Перерисовка в том же шаге, что и клик, — засчитана, сколько бы ни шла;
    позже клика и дольше 30 с — цифры нет, а не прежняя (проверка Codex). */
 eq('Last action: долгий экран от клика — его время; позже 30 с — без старой цифры',await t.p.evaluate(()=>{
  storageLastAction=123;storageActionAt=performance.now()-31000;storageActionNow=true;afterRender();const same=storageLastAction;
  storageLastAction=123;storageActionAt=performance.now()-31000;storageActionNow=false;afterRender();
  return {same:same>=31000,later:storageLastAction,shown:/Last action/.test(document.getElementById('storageStatus').textContent)};
 }),{same:true,later:null,shown:false});
 eq('место: размер базы у администратора, полоса при 80 %',await t.p.evaluate(()=>{
  storageUsage={usage:92*1048576,quota:1000*1048576};afterRender();const footer=document.getElementById('storageStatus').textContent.includes('DB 92 MB');
  storageUsage={usage:850,quota:1000};afterRender();const bar=document.getElementById('storageAlert'),full=!bar.hidden&&bar.textContent.includes('Storage almost full. Export and tell admin.');
  storageUsage=null;afterRender();return {footer,full};
 }),{footer:true,full:true});

 /* Проверка версии: открылась вкладка другой сборки — эта больше не пишет. */
 await t.p.evaluate(()=>{tab='sales';salesOrderNew();salesOrderAddLine();render();});
 const newer=await t.c.newPage();newer.on('pageerror',e=>t.errs.push(e.message));newer.on('dialog',d=>d.accept());
 await newer.addInitScript(()=>{Object.defineProperty(window,'ERP_BUILD',{get:()=>'newer-build',set(){},configurable:false});});
 await newer.goto(t.p.url());await newer.evaluate(()=>window.storageReady);
 await t.p.waitForFunction(()=>!!storageStale,null,{timeout:5000}).catch(()=>{});
 eq('старая вкладка с начатым заказом: полоса Reload, запись отказывает, база не тронута',await t.p.evaluate(async()=>{
  const stored=testStoredText(),out=storageCommand(()=>{DB.customer[0].legalName='From the old tab';});afterRender();
  const bar=document.getElementById('storageAlert');
  return {stale:storageStale,ok:out.ok,error:out.error,bar:!bar.hidden&&/A newer version is open/.test(bar.textContent)&&/Reload/.test(bar.textContent),
   take:await storageTakeControl(),writer:storageWriter,stored:testStoredText()===stored,draft:!!soDraft};
 }),{stale:'newer-build',ok:false,error:'A newer version is open. Reload this tab.',bar:true,take:false,writer:false,stored:true,draft:true});
 eq('новая сборка пишет и ставит свою версию главной',await newer.evaluate(async()=>{
  await storageTakeControl();storageCommand(()=>{DB.customer[0].legalName='From the newer build';});await storageFlush();return (await storageIdbMeta()).build;
 }),'newer-build');
 await newer.close();await t.c.close();

 /* Ничего не начато — устаревшая вкладка перезагружается сама, один раз на сборку. */
 const q=await page();
 await q.p.evaluate(()=>{window.srMark=1;});
 await q.p.evaluate(()=>storageOnMessage({type:'hello',build:'newer-build'}));
 /* Новая страница — не значит, что ERP уже загрузилась: на медленной машине CI
    ждём, пока появится сам старт (window.storageReady). */
 await q.p.waitForFunction(()=>!window.srMark&&!!window.storageReady,null,{timeout:10000}).catch(()=>{});
 await q.p.evaluate(()=>window.storageReady);
 eq('без начатого: перезагрузка сама, отметка — один раз на сборку',await q.p.evaluate(()=>({reloaded:!window.srMark,once:sessionStorage.getItem(STORAGE_RELOAD_KEY)})),{reloaded:true,once:'newer-build'});
 eq('второй раз для той же сборки — только полоса, без перезагрузки',await q.p.evaluate(()=>{window.srMark=2;storageOnMessage({type:'hello',build:'newer-build'});return {mark:window.srMark,stale:storageStale};}),{mark:2,stale:'newer-build'});
 /* Другая сборка писала, пока вкладка спала (сообщения не было): писателем она не станет. */
 const r=await page();
 eq('чужая версия в базе после открытия вкладки — вкладка не берёт запись',await r.p.evaluate(async()=>{
  tab='sales';salesOrderNew();salesOrderAddLine();render();await storageFlush();storageYield();await storageIdbMetaPut('build','other-build');const took=await storageTakeControl();return {took,stale:storageStale,writer:storageWriter};
 }),{took:false,stale:'other-build',writer:false});
 eq('вкладки одной сборки друг друга не останавливают',await r.c.newPage().then(async p=>{await p.goto(r.p.url());await p.evaluate(()=>window.storageReady);const s=await p.evaluate(()=>storageStale);await p.close();return s;}),'');
 /* Export v2 / Import v2, метка TEST и Clear database (этап 1, PR B). */
 /* F5 своей базы (владелец, 28.10.2026: «если всё готово — зачем система
    пересобирает?»): готовый раскрой не пересчитывается и старт ничего не
    пишет; раскрой без цифр (старый файл) — пересчитывается. */
 const f=await page();await require('./optimization-fixture')(f.p);
 const fReload=async()=>{await f.p.reload();await f.p.evaluate(()=>window.storageReady);await require('./optimization-fixture')(f.p);};
 const f5=await f.p.evaluate(async()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const n=glassBatchEntries(id)[0].batch.number;
  DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));touch();
  const r=cutPlanRun(n);if(!r||r.error||!cutPlanFor(n))return 'Build: '+(r&&r.error||'no plan');
  storageCommand(()=>{cutPlanFor(n).stats.used=12345;});await storageFlush();localStorage.setItem('sr-f5',JSON.stringify({n,rev:storageRev}));return n;
 });
 await fReload();
 const kept=await f.p.evaluate(async()=>{const m=JSON.parse(localStorage.getItem('sr-f5')),p=cutPlanFor(m.n);await storageFlush();if(!p)return {kept:null,rev:false};
  const out={kept:p.stats.used,rev:storageRev===m.rev};storageCommand(()=>{delete cutPlanFor(m.n).orders;});await storageFlush();return out;});
 await fReload();
 eq('F5 своей базы: готовый раскрой как сохранён, старт ничего не пишет; раскрой без цифр считается заново',Object.assign(kept,await f.p.evaluate(()=>{
  const p=cutPlanFor(JSON.parse(localStorage.getItem('sr-f5')).n);localStorage.removeItem('sr-f5');return {recounted:!!p&&Array.isArray(p.orders)&&p.stats.used!==12345};
 }),{batch:f5}),{kept:12345,rev:true,recounted:true,batch:f5&&/^B-/.test(f5)?f5:'B-…'});
 await f.c.close();

 const v=await page();await require('./optimization-fixture')(v.p);
 await v.p.evaluate(()=>{window.srAlerts=[];window.alert=m=>srAlerts.push(m);oqReset();oqOrder(oqCustomer());salesDraftDrop();touch();});
 eq('Export v2: строка заголовка и по строке на запись, файл из частей',await v.p.evaluate(()=>{
  const parts=storageExportParts(),lines=parts.join('').split('\n').filter(Boolean),head=JSON.parse(lines[0]),recs=lines.slice(1).map(l=>JSON.parse(l));
  return {format:head.format,version:head.schemaVersion,count:head.records===recs.length,parts:parts.length>1,
   orders:recs.filter(r=>r.tbl==='salesOrder').length===DB.salesOrder.length,test:'test' in head};
 }),{format:'glass-erp',version:2,count:true,parts:true,orders:true,test:false});
 eq('Export v2 → Import v2 — та же база',await v.p.evaluate(async()=>{
  const before=JSON.stringify(DB),file=new File(storageExportParts(),'glazing_system_data.ndjson'),ok=await storageImportFile(file);
  return {ok,same:JSON.stringify(DB)===JSON.stringify(prepareImportedState(JSON.parse(before))),test:storageTest};
 }),{ok:true,same:true,test:false});
 eq('Import v2 больше 10 МБ — потоком, без потолка',await v.p.evaluate(async()=>{
  const note='x'.repeat(2000);storageCommand(()=>{for(let i=0;i<6000;i++)DB.customer.push(normalizeCustomer({legalName:'Stream '+i,code:'ST'+i,notes:note}));});
  const parts=storageExportParts(),size=parts.reduce((n,p)=>n+p.length,0);storageCommand(()=>{DB.customer=DB.customer.filter(c=>!/^Stream /.test(c.legalName));});
  const ok=await storageImportFile(new File(parts,'big.ndjson'));return {size:size>10*1048576,ok,count:DB.customer.filter(c=>/^Stream /.test(c.legalName)).length};
 }),{size:true,ok:true,count:6000});
 eq('обрезанный файл v2 не заменяет базу',await v.p.evaluate(async()=>{
  const n=DB.customer.length,text=storageExportParts().join(''),cut=text.slice(0,text.lastIndexOf('\n',text.length-2)+1);let error='';
  try{await storageImportFile(new File([cut],'cut.ndjson'));}catch(e){error=e.message;}return {error:/incomplete/.test(error),same:DB.customer.length===n};
 }),{error:true,same:true});
 eq('Import базы симулятора (test: true): метка и чип TEST DATA, они же после F5',await v.p.evaluate(async()=>{
  const env=JSON.parse(JSON.stringify(storageExportEnvelope()));env.test=true;env.data.customer=env.data.customer.slice(0,3);
  const ok=await storageImportFile(new File([JSON.stringify(env)],'sim.json')),chip=document.getElementById('testChip');
  return {ok,test:storageTest,chip:!!chip&&!chip.hidden&&chip.textContent==='TEST DATA'};
 }),{ok:true,test:true,chip:true});
 await v.p.reload();await v.p.evaluate(()=>window.storageReady);
 await v.p.evaluate(()=>{window.srAlerts=[];window.alert=m=>srAlerts.push(m);});
 eq('метка TEST переживает F5, Export её несёт',await v.p.evaluate(()=>({test:storageTest,chip:!document.getElementById('testChip').hidden,head:JSON.parse(storageExportParts()[0]).test})),{test:true,chip:true,head:true});
 eq('настоящую базу поверх тестовой — отказ «Clear database first.»',await v.p.evaluate(async()=>{
  const n=DB.customer.length,env=JSON.parse(JSON.stringify(storageExportEnvelope()));env.data.customer.push(normalizeCustomer({legalName:'Real one',code:'R1'}));
  const ok=await storageImportState(env);return {ok,alert:srAlerts.pop(),same:DB.customer.length===n,test:storageTest};
 }),{ok:false,alert:'Test data here. Clear database first.',same:true,test:true});
 eq('Clear database — только администратор, со сводкой перед удалением',await v.p.evaluate(()=>{
  let asked='';window.confirm=m=>{asked=m;return false;};const kept=storageClear();
  return {summary:/Delete the whole database in this browser\?/.test(asked)&&/orders/.test(asked)&&/scans/.test(asked),admin:document.querySelector('.app-foot button[onclick="storageClear()"]').hasAttribute('data-admin')};
 }),{summary:true,admin:true});
 /* Clear сам перезагружает вкладку. */
 await Promise.all([v.p.waitForEvent('load'),v.p.evaluate(()=>{glassPieceNextId();touch();window.confirm=()=>true;storageClear();})]);
 await v.p.evaluate(()=>window.storageReady);
 eq('после Clear: база пустая, ни метки, ни счётчика G-, демо-люди не вернулись',await v.p.evaluate(async()=>({
  orders:DB.salesOrder.length,customers:DB.customer.length,users:DB.user.length,test:storageTest,chip:document.getElementById('testChip').hidden,
  mark:localStorage.getItem(GLASS_ID_MARK_KEY),copy:storageBackupPresent,seq:DB.glassPieceSeq})),
  {orders:0,customers:0,users:0,test:false,chip:true,mark:null,copy:false,seq:0});
 /* Ремонт по проверке Codex 22.10.2026 (задание «База», Р1). */
 const w=await page(),W2=await w.c.newPage();W2.on('pageerror',e=>w.errs.push(e.message));W2.on('dialog',d=>d.accept());
 await W2.goto(w.p.url());await W2.evaluate(()=>window.storageReady);
 /* Открытая вкладка сама забирает запись — дождаться, потом вернуть её первой. */
 await W2.evaluate(async()=>{if(storageTakeover)await storageTakeover;});await w.p.evaluate(()=>storageTakeControl());
 const holdName=p=>p.evaluate(()=>(DB.customer.find(c=>c.id==='HOLD-1')||{}).legalName);
 const holdDisk=p=>p.evaluate(async()=>JSON.parse((await storageIdbGet([['customer','HOLD-1']])).records[0].data).legalName);
 await w.p.evaluate(async()=>{
  storageCommand(()=>{DB.customer.push({id:'HOLD-1',legalName:'Original'});});await storageFlush();
  window.srReal=storageIdbWrite;storageIdbWrite=()=>Promise.reject(new Error('Disk broke'));
  storageCommand(()=>{DB.customer.find(c=>c.id==='HOLD-1').legalName='Edit A';});await storageFlush();
 });
 /* Владелец, 22.10.2026, вариант 1: незаписанное держит запись, пока в этой
    вкладке не нажмут Retry save или Export. Иначе Retry потом клал старое
    поверх того, что сохранила другая вкладка (проверка Codex, находка 1). */
 eq('запись не прошла: другая вкладка не забирает запись, полоса говорит почему',await W2.evaluate(async()=>{
  const took=await storageTakeControl();afterRender();const bar=document.getElementById('storageAlert');
  return {took,writer:storageWriter,bar:!bar.hidden&&bar.textContent.includes('Not saved in another tab')};
 }),{took:false,writer:false,bar:true});
 eq('вкладка с незаписанным остаётся писателем',await w.p.evaluate(()=>({writer:storageWriter,failed:!!storageFailed})),{writer:true,failed:true});
 await w.p.evaluate(async()=>{storageIdbWrite=srReal;storageRetry();await storageFlush();});
 eq('Retry save записал; теперь другая вкладка забирает запись и видит правку',await W2.evaluate(async()=>({took:await storageTakeControl(),name:(DB.customer.find(c=>c.id==='HOLD-1')||{}).legalName})),{took:true,name:'Edit A'});
 await W2.evaluate(async()=>{storageCommand(()=>{DB.customer.find(c=>c.id==='HOLD-1').legalName='Edit B';});await storageFlush();});
 await w.p.waitForFunction(()=>DB.customer.find(c=>c.id==='HOLD-1').legalName==='Edit B',null,{timeout:5000}).catch(()=>{});
 eq('правка второй вкладки на диске и в первой',{disk:await holdDisk(w.p),first:await holdName(w.p)},{disk:'Edit B',first:'Edit B'});
 /* Запись отказала, когда вкладка уже отдавала запись: она её не отдаёт. */
 await w.p.evaluate(()=>storageTakeControl());
 eq('запись отказала во время передачи — вкладка держит запись',await w.p.evaluate(async()=>{
  storageIdbWrite=()=>new Promise((res,rej)=>setTimeout(()=>rej(new Error('Late failure')),300));
  storageCommand(()=>{DB.customer.find(c=>c.id==='HOLD-1').legalName='Late A';});return true;
 }).then(()=>W2.evaluate(()=>storageTakeControl())).then(async took=>({took,writer:await w.p.evaluate(()=>storageWriter),failed:await w.p.evaluate(()=>!!storageFailed)})),{took:false,writer:true,failed:true});
 /* Export — незаписанное в файле: вкладка отдаёт запись и берёт из базы то, что там лежит. */
 await w.p.evaluate(async()=>{window.srSaved=0;storageDownload=()=>{srSaved++;};await doExport();});
 eq('после Export вкладка отдаёт запись и показывает то, что в базе',await W2.evaluate(()=>storageTakeControl()).then(async took=>{
  await w.p.waitForFunction(()=>!storageFailed&&DB.customer.find(c=>c.id==='HOLD-1').legalName==='Edit B',null,{timeout:5000}).catch(()=>{});
  return {took,exported:await w.p.evaluate(()=>srSaved),writer:await w.p.evaluate(()=>storageWriter),failed:await w.p.evaluate(()=>!!storageFailed),first:await holdName(w.p),disk:await holdDisk(w.p)};
 }),{took:true,exported:1,writer:false,failed:false,first:'Edit B',disk:'Edit B'});
 await w.p.evaluate(()=>{storageIdbWrite=srReal;});
 /* Метка TEST — часть базы: другая вкладка видит её сразу и при захвате записи. */
 await w.p.evaluate(()=>storageTakeControl());
 await w.p.evaluate(async()=>{const env=JSON.parse(JSON.stringify(storageExportEnvelope()));env.test=true;await storageImportFile(new File([JSON.stringify(env)],'sim.json'));});
 await W2.waitForFunction(()=>storageTest,null,{timeout:5000}).catch(()=>{});
 eq('Import тестовой базы: вторая вкладка видит TEST DATA, Export из неё с меткой',await W2.evaluate(()=>{afterRender();return {test:storageTest,chip:!document.getElementById('testChip').hidden,head:JSON.parse(storageExportParts()[0]).test===true};}),{test:true,chip:true,head:true});
 eq('вкладка без метки в памяти: при захвате записи берёт её из базы и не пускает настоящую базу',await W2.evaluate(async()=>{
  window.alert=m=>{window.srAlert=m;};storageTest=false;const took=await storageTakeControl(),test=storageTest;
  const env=JSON.parse(JSON.stringify(storageExportEnvelope()));delete env.test;const ok=await storageImportState(env);
  return {took,test,ok,alert:window.srAlert};
 }),{took:true,test:true,ok:false,alert:'Test data here. Clear database first.'});
 await W2.close();
 const x=await page();await x.p.evaluate(()=>storageTakeControl());
 /* Чужая запись в несколько строк: строки встают в порядке писателя, и
    следующая запись этой вкладки его не портит (проверка Codex, находка 3). */
 eq('чужая перестановка строк: порядок как у писателя, своя запись его не меняет',await x.p.evaluate(async()=>{
  storageCommand(()=>{['A','B','C'].forEach(n=>DB.customer.push({id:'ORD-'+n,legalName:n}));});await storageFlush();
  const ids=a=>a.map(c=>c.id).filter(id=>/^ORD-/.test(id)),move=async order=>{
   const next=JSON.parse(JSON.stringify(DB)),q=id=>next.customer.find(c=>c.id===id)||{id,legalName:id};
   next.customer=next.customer.filter(c=>!/^ORD-/.test(c.id)).concat(order.map(q));await testOtherTab(next);
   return {memory:ids(DB.customer),stored:ids(storageBaseRows('customer')),rewrite:storageDiff(DB).filter(c=>c.tbl==='customer').length};
  };
  return [await move(['ORD-C','ORD-X','ORD-A','ORD-B']),await move(['ORD-B','ORD-Y','ORD-C'])];
 }),[{memory:['ORD-C','ORD-X','ORD-A','ORD-B'],stored:['ORD-C','ORD-X','ORD-A','ORD-B'],rewrite:0},{memory:['ORD-B','ORD-Y','ORD-C'],stored:['ORD-B','ORD-Y','ORD-C'],rewrite:0}]);
 eq('чужая замена маршрута того же ключа видна сразу, без F5',await x.p.evaluate(async()=>{
  storageCommand(()=>{DB.productionRoute.push({key:'RT-1',at:'2026-10-22',route:{codes:['CUT','HEAT'],shipping:[],services:[]}});});await storageFlush();
  const warm=stationFrozenRoute('RT-1').codes.join('>'),next=JSON.parse(JSON.stringify(DB));next.productionRoute.find(r=>r.key==='RT-1').route.codes=['CUT','POLISH','HEAT'];
  await testOtherTab(next);return {warm,now:stationFrozenRoute('RT-1').codes.join('>')};
 }),{warm:'CUT>HEAT',now:'CUT>POLISH>HEAT'});
 eq('Reset раскроя того же батча: лист на стикере — из нового раскроя',await x.p.evaluate(()=>{
  const plan=(a,b)=>({batch:'B-STK',groups:[{glass:'CL6',sheets:[{no:1,pieces:[{piece:a}]},{no:2,pieces:[{piece:b}]}]}]});
  storageCommand(()=>{DB.cutPlan.push(plan('G-1','G-2'));});const warm=stkSheetOf('B-STK','G-1').sheet;
  storageCommand(()=>{DB.cutPlan=DB.cutPlan.filter(p=>p.batch!=='B-STK').concat([plan('G-2','G-1')]);});
  return {warm,now:stkSheetOf('B-STK','G-1').sheet};
 }),{warm:1,now:2});
 await w.c.close();await x.c.close();
 /* Р2: файлы и формы (проверка Codex, находки 2, 5, 6, 11). */
 const y=await page();
 await y.p.evaluate(()=>{window.srMark=1;navGo('customers');customerNew();});
 await y.p.locator('input[oninput^="cDraft.legalName"]').fill('Typed customer');
 await y.p.evaluate(()=>storageOnMessage({type:'hello',build:'newer-build-2'}));await y.p.waitForTimeout(500);
 eq('новая версия ERP: набранный клиент остаётся, вкладка не перезагружается сама',await y.p.evaluate(()=>{afterRender();const bar=document.getElementById('storageAlert');
  return {kept:!!window.srMark,name:cDraft&&cDraft.legalName,bar:!bar.hidden&&/A newer version is open/.test(bar.textContent)};}),{kept:true,name:'Typed customer',bar:true});
 eq('начатая форма любого раздела — есть что терять',await y.p.evaluate(()=>{
  cEdit=null;cDraft=null;const none=storageHasWork(),forms={
   purchasing:()=>{purSupplierDraft={name:'x'};},purchaseOrder:()=>{purOrderDraft={id:'x'};},receiving:()=>{purFulfilDraft={id:'x'};},supplierMoney:()=>{purMoneyDraft={id:'x'};},
   finance:()=>{finDraft={amount:1};},reports:()=>{repDraft={id:'not-saved'};},users:()=>{uDraft={};},masterData:()=>{mdCatDraft={};},agents:()=>{comDraft={};},
   shape:()=>{sEdit='new';},shipping:()=>{shippingDraft={};},serviceSet:()=>{soServiceSetDraft={};},inventory:()=>{invCountDraft={k:1};}};
  const reset=()=>{purSupplierDraft=purOrderDraft=purFulfilDraft=purMoneyDraft=finDraft=repDraft=uDraft=mdCatDraft=comDraft=shippingDraft=soServiceSetDraft=null;sEdit=null;invCountDraft={};};
  const out={none};Object.keys(forms).forEach(k=>{reset();forms[k]();out[k]=storageHasWork();});reset();return out;
 }),{none:false,purchasing:true,purchaseOrder:true,receiving:true,supplierMoney:true,finance:true,reports:true,users:true,masterData:true,agents:true,shape:true,shipping:true,serviceSet:true,inventory:true});
 const z=await page();await z.p.evaluate(()=>{window.srAlerts=[];window.alert=m=>srAlerts.push(m);});
 eq('Export новой установки без клиентов и заказов — Import его же принимает',await z.p.evaluate(async()=>{
  const empty=DB.customer.length===0&&DB.salesOrder.length===0,ok=await storageImportFile(new File(storageExportParts(),'empty.ndjson'));
  storageCommand(()=>{DB.customer.push(normalizeCustomer({legalName:'First customer',code:'C-00001'}));});
  const withCustomer=await storageImportFile(new File(storageExportParts(),'one.ndjson'));
  return {empty,ok,withCustomer,customers:DB.customer.length,orders:DB.salesOrder.length};
 }),{empty:true,ok:true,withCustomer:true,customers:1,orders:0});
 eq('пустые строки и CRLF перед заголовком v2 не мешают Import',await z.p.evaluate(async()=>{
  const text=storageExportParts().join('');return [await storageImportFile(new File(['\n'+text],'a.ndjson')),await storageImportFile(new File(['\r\n\r\n'+text.replace(/\n/g,'\r\n')],'b.ndjson'))];
 }),[true,true]);
 /* Копия до импорта — по записям, частями (находка 6): вся база одной
    строкой больше не собирается, предела строки браузера нет. */
 eq('копия до импорта — по записям: вся база одной строкой не собирается, Restore возвращает её',await z.p.evaluate(async()=>{
  const before=JSON.stringify(DB),real=JSON.stringify,env=JSON.parse(before);env.customer.push(normalizeCustomer({legalName:'Other',code:'C-00002'}));
  JSON.stringify=function(v,...a){if(v===DB||v&&v.data===DB)throw new RangeError('Invalid string length');return real.call(this,v,...a);};
  let ok;try{ok=await storageImportState(env);}finally{JSON.stringify=real;}
  const replaced=DB.customer.length,restored=await storageRestoreBackup();
  return {ok,replaced,restored,same:JSON.stringify(DB)===JSON.stringify(prepareImportedState(JSON.parse(before)))};
 }),{ok:true,replaced:2,restored:true,same:true});
 await y.c.close();await z.c.close();
 eq('хранилище без ошибок страницы',t.errs.concat(f.errs,q.errs,r.errs,v.errs,w.errs,x.errs,y.errs,z.errs),[]);
 await q.c.close();await r.c.close();await v.c.close();
};
