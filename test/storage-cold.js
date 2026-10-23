/* Архив в базе браузера (задание «База», этап 3, А1): записи уходят в склад
   cold и возвращаются; при F5 архив не читается, сравнение базы не считает
   его удалённым, другая вкладка видит уход; Export, Import и копия до
   импорта — вместе с архивом. */
module.exports=async function({page,eq}){
 console.log('storage-cold');
 const t=await page();await require('./optimization-fixture')(t.p);
 const cold=p=>p.evaluate(async()=>(await storageIdbColdAll()).map(r=>r.tbl+':'+r.id+':'+r.owners.join(',')+':'+r.month).sort());
 const hotIds=p=>p.evaluate(async()=>(await storageIdbReadAll()).records.filter(r=>r.tbl==='customer').map(r=>r.id).sort());
 await t.p.evaluate(()=>{window.alert=()=>{};storageCommand(()=>{['A','B','C'].forEach(n=>DB.customer.push(normalizeCustomer({id:'CC-'+n,legalName:'Cold '+n,code:'CC'+n})));});return storageFlush();});
 eq('перенос в архив: строки нет в памяти и в работе, она в складе cold с заказом и месяцем',await t.p.evaluate(async()=>{
  const out=storageCommand(()=>{storageColdMove('customer',DB.customer.find(c=>c.id==='CC-B'),['ORD-1'],'2026-07');});await storageFlush();
  return {ok:out.ok,memory:DB.customer.some(c=>c.id==='CC-B'),base:!!(storageBase.get('customer')||new Map()).get('CC-B')};
 }),{ok:true,memory:false,base:false});
 eq('…в базе: в работе её нет, в архиве есть',{hot:(await hotIds(t.p)).includes('CC-B'),cold:await cold(t.p)},{hot:false,cold:['customer:CC-B:ORD-1:2026-07']});
 eq('следующее действие архив не трогает (не «удалено»)',await t.p.evaluate(async()=>{
  storageCommand(()=>{DB.customer.find(c=>c.id==='CC-A').notes='touch';});await storageFlush();return (await storageIdbColdOf('ORD-1')).map(r=>r.id);
 }),['CC-B']);
 eq('действие с отказом — перенос отменён целиком',await t.p.evaluate(async()=>{
  const out=storageCommand(()=>{storageColdMove('customer',DB.customer.find(c=>c.id==='CC-C'),['ORD-2'],'2026-07');throw new Error('Refused');});
  await storageFlush();return {ok:out.ok,back:DB.customer.some(c=>c.id==='CC-C'),cold:(await storageIdbColdOf('ORD-2')).length};
 }),{ok:false,back:true,cold:0});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 eq('после F5 архив не загружен в память',await t.p.evaluate(()=>({b:DB.customer.some(c=>c.id==='CC-B'),a:DB.customer.some(c=>c.id==='CC-A')})),{b:false,a:true});
 /* Другая вкладка: уход в архив для неё — строка ушла. */
 const p2=await t.c.newPage();p2.on('dialog',d=>d.accept());await p2.goto(t.p.url());await p2.evaluate(()=>window.storageReady);
 await p2.evaluate(async()=>{if(storageTakeover)await storageTakeover;});await t.p.evaluate(()=>storageTakeControl());
 await t.p.evaluate(async()=>{storageCommand(()=>{storageColdMove('customer',DB.customer.find(c=>c.id==='CC-C'),['ORD-2'],'2026-08');});await storageFlush();});
 await p2.waitForFunction(()=>!DB.customer.some(c=>c.id==='CC-C'),null,{timeout:5000}).catch(()=>{});
 eq('другая вкладка: ушедшая в архив строка пропала и у неё',await p2.evaluate(()=>DB.customer.some(c=>c.id==='CC-C')),false);
 eq('возврат из архива: строка на своём месте, в работе, из склада cold ушла',await t.p.evaluate(async()=>{
  const order=()=>DB.customer.filter(c=>/^CC-/.test(c.id)).map(c=>c.id);const out=await storageColdBring('ORD-1');await storageFlush();
  return {ok:out.ok,n:out.value,order:order(),cold:(await storageIdbColdOf('ORD-1')).length};
 }),{ok:true,n:1,order:['CC-A','CC-B'],cold:0});
 eq('возврат и сразу правка той же строки в одной очереди — копия в архиве всё равно удаляется',await t.p.evaluate(()=>{
  const m=storageMerge([{tbl:'customer',id:'X',seq:1,data:'a',warm:true}],[{tbl:'customer',id:'X',seq:1,data:'b'}]);return [m.length,m[0].data,!!m[0].warm];
 }),[1,'b',true]);
 await p2.waitForFunction(()=>DB.customer.some(c=>c.id==='CC-B'),null,{timeout:5000}).catch(()=>{});
 eq('другая вкладка видит возврат',await p2.evaluate(()=>DB.customer.some(c=>c.id==='CC-B')),true);
 await p2.close();
 /* Export → Import: в работе и архив возвращаются как были. */
 eq('Export с архивом и Import его же: в работе и архив те же',await t.p.evaluate(async()=>{
  window.confirm=()=>true;let parts=null;const keep=storageDownload;storageDownload=(n,p)=>{parts=p;};await doExport();storageDownload=keep;
  const lines=parts.join('').split('\n').filter(Boolean),head=JSON.parse(lines[0]),coldLines=lines.slice(1).map(l=>JSON.parse(l)).filter(o=>o.cold);
  const before=JSON.stringify(DB);storageCommand(()=>{DB.customer=DB.customer.filter(c=>c.id!=='CC-A');});
  const ok=await storageImportFile(new File(parts,'x.ndjson'));
  return {head:head.cold,lines:coldLines.map(o=>o.id+':'+o.owners.join(',')+':'+o.month),ok,same:JSON.stringify(DB)===JSON.stringify(prepareImportedState(JSON.parse(before))),cold:(await storageIdbColdAll()).map(r=>r.id)};
 }),{head:1,lines:['CC-C:ORD-2:2026-08'],ok:true,same:true,cold:['CC-C']});
 eq('Import прежнего JSON (без архива) — архив очищен: база заменена целиком',await t.p.evaluate(async()=>{
  const env=JSON.parse(JSON.stringify(storageExportEnvelope()));const ok=await storageImportState(env);await storageFlush();return {ok,cold:(await storageIdbColdAll()).length};
 }),{ok:true,cold:0});
 eq('копия до импорта — с архивом: Restore возвращает и архив',await t.p.evaluate(async()=>{
  storageCommand(()=>{storageColdMove('customer',DB.customer.find(c=>c.id==='CC-A'),['ORD-3'],'2026-09');});await storageFlush();
  const env=JSON.parse(JSON.stringify(storageExportEnvelope()));await storageImportState(env);await storageFlush();const after=(await storageIdbColdAll()).length;
  const restored=await storageRestoreBackup();await storageFlush();return {after,restored,cold:(await storageIdbColdAll()).map(r=>r.id)};
 }),{after:0,restored:true,cold:['CC-A']});
 /* База прежней версии (без склада cold) — обновление создаёт склад, записи на месте. */
 await t.p.evaluate(async()=>{
  storageIdb.close();storageIdb=null;
  await new Promise((res,rej)=>{const q=indexedDB.deleteDatabase(STORAGE_IDB_NAME);q.onsuccess=res;q.onerror=()=>rej(q.error);});
  await new Promise((res,rej)=>{const q=indexedDB.open(STORAGE_IDB_NAME,1);
   q.onupgradeneeded=()=>{const d=q.result;d.createObjectStore('record',{keyPath:['tbl','id']});d.createObjectStore('meta');d.createObjectStore('copy');};
   q.onsuccess=()=>{const d=q.result,tx=d.transaction(['record'],'readwrite');tx.objectStore('record').put({tbl:'customer',id:'OLD-V1',seq:0,data:JSON.stringify({id:'OLD-V1',legalName:'From version 1',code:'V1'})});tx.oncomplete=()=>{d.close();res();};};
   q.onerror=()=>rej(q.error);});
 });
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 eq('база прежней версии открывается: записи на месте, склады архива, его указателя и сервера появились',await t.p.evaluate(()=>({kept:DB.customer.some(c=>c.id==='OLD-V1'),cold:storageIdb.objectStoreNames.contains('cold'),index:storageIdb.objectStoreNames.contains('archive'),cloud:storageIdb.objectStoreNames.contains('cloud'),version:storageIdb.version})),{kept:true,cold:true,index:true,cloud:true,version:4});
 eq('архив без ошибок страницы',t.errs,[]);
 await t.c.close();
};
