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
   storageIdbWrite=(changes,rev,build)=>{srWritten.push(changes.map(c=>c.tbl+(c.del?' -':'')));return real(changes,rev,build);};
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

 eq('отказ записи: в памяти ровно прежнее, включая несохранённое до команды',await t.p.evaluate(async()=>{
  await storageFlush();DB.customer[0].notes='Typed, not saved';const before=JSON.stringify(DB),stored=testStoredText();
  const out=testFailWrite(()=>storageCommand(()=>{DB.customer[1].notes='Lost';DB.customer.push({id:'SR-LOST'});}));
  return {ok:out.ok,same:JSON.stringify(DB)===before,stored:testStoredText()===stored};
 }),{ok:false,same:true,stored:true});

 await t.p.evaluate(()=>{storageCommand(()=>{DB.customer[0].legalName='Before F5';});});await reload();
 eq('запись, начатая перед F5, доходит до базы',await t.p.evaluate(()=>DB.customer[0].legalName),'Before F5');

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
 await q.p.waitForFunction(()=>!window.srMark,null,{timeout:5000}).catch(()=>{});
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
 eq('хранилище без ошибок страницы',t.errs.concat(q.errs,r.errs,v.errs),[]);
 await q.c.close();await r.c.close();await v.c.close();
};
