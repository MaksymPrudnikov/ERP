/* =====================================================================
   erp/storage  ·  erp-1.0
   База в IndexedDB по записям (erp/storage-records), экспорт/импорт JSON,
   старт приложения.
   IN : —
   OUT: —
   Правило: файл не содержит бизнес-логику доменов; он вызывает их публичные
   normalize/validate hooks и отвечает только за безопасный вход→выход.
   ===================================================================== */

/* One browser database has one writer. Web Locks protects the entire write
   session. The writer is the tab you are working in (owner, 2 October 2026):
   a tab takes over by itself when it is opened, shown, clicked, typed or
   scanned in. The other tab always gives way; its unsaved draft stays in its
   own memory and comes back, on top of the latest data, when you return.
   One exception (owner, 22.10.2026): a tab whose write failed keeps the
   writer until Retry save or Export there.
   Старый ключ localStorage `glazing_system_v1` больше не читается и не
   удаляется (владелец, 20.10.2026: старт пустой); его имя осталось у замка
   и канала вкладок. */
const STORAGE_KEY='glazing_system_v1',STORAGE_LOCK=STORAGE_KEY+'-writer',STORAGE_RELOAD_KEY=STORAGE_KEY+'-reloaded-for';
let storageWriter=false,storageRelease=null,storageChannel=null,storageStarting=true;
let storageWarningShown=false,storageLastError='',storageLastSaved='',storageDepth=0,storageCommanding=false;
let storageRecovery=false,storageBackupAt='',storageTakeover=null,storageHandoffFailed=false,storageCopyAt='';
/* Запись идёт в фоне: действие не ждёт диска. storageBusy — запись в пути,
   storageQueued — изменения, которые уйдут следующей транзакцией,
   storageFailed — не записанное (полоса «Not saved» и Retry save). */
let storageRev=0,storageBusy=false,storageQueued=null,storageFailed=null,storageFlushWaiters=[];
/* Незаписанное держит запись (владелец, 22.10.2026): вкладка не отдаёт её
   другой, пока здесь не нажмут Retry save или Export. Иначе Retry потом
   клал старое поверх того, что сохранила другая вкладка (проверка Codex).
   storageFailedExported — незаписанное уже в файле Export; storageOtherHeld —
   другая вкладка ответила, что держит запись. */
let storageFailedExported=false,storageOtherHeld=false,storageTakeoverAbort=null;
/* Проверка версии (владелец, 21.10.2026). Главная — последняя открытая
   версия: открылась вкладка другой сборки — эта больше ничего не пишет,
   иначе её нормализация срезала бы новые графы. storageStale — сборка,
   из-за которой вкладка устарела. */
let storageStale='',storageBuildAtLoad='',storageApplying=Promise.resolve(),storageReadyResolve=null;
let storageUsage=null,storageUsageAt=0;
/* Метка TEST: база симулятора (владелец, 20.10.2026). Пока она есть — чип
   TEST DATA на любом экране, настоящую базу поверх не импортировать. */
let storageTest=false;
/* «Last action 230 ms» у администратора внизу: от клика или Enter (сканер
   тоже шлёт Enter) до готового экрана. Для сверки настоящего ПК цеха с
   замером tools/perf-year.js (задание «База», этап 2). Клик без перерисовки
   не в счёт: дальше 30 с ответ не ждём. */
let storageActionAt=0,storageLastAction=null;
document.addEventListener('click',()=>{storageActionAt=performance.now();},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter')storageActionAt=performance.now();},true);
/* The pre-import copy takes as much space as the database itself. It is
   kept for a week and dropped earlier when an ordinary save would otherwise
   fail for lack of space; a broken database keeps it untouched. */
const STORAGE_BACKUP_DAYS=7;
let storageBackupPresent=false,storageImporting=false;
function storageBuildId(){return typeof ERP_BUILD!=='undefined'?String(ERP_BUILD):'dev';}
function storageBackupCheck(){
 if(!storageBackupPresent||!storageWriter||storageRecovery)return Promise.resolve();
 return Date.now()-Date.parse(storageCopyAt)<=STORAGE_BACKUP_DAYS*864e5?Promise.resolve():storageBackupDrop();
}
function storageBackupDrop(){
 storageBackupPresent=false;storageCopyAt='';
 return storageIdbCopyDrop().catch(e=>console.warn('Pre-import copy was not removed:',e.message));
}
function storageInvalidate(){
 if(typeof stationRouteCache!=='undefined')stationRouteCache=new Map();
 if(typeof prodBoardCache!=='undefined')prodBoardCache={stamp:'',data:null};
 if(typeof stationAreaCache!=='undefined')stationAreaCache=new Map();
 if(typeof glassCutCache!=='undefined')glassCutCache=null;
 /* Эти три узнавали перемену по длине списка или номеру батча: чужая запись
    на месте (тот же ключ) или новый раскрой того же батча их не сбрасывали. */
 if(typeof stationFrozenIndex!=='undefined')stationFrozenIndex={list:null,size:-1,map:null};
 if(typeof stkSheetCache!=='undefined')stkSheetCache={batch:'',map:null};
 if(typeof orderLogCreators!=='undefined')orderLogCreators={ref:null,n:-1,map:null};
}
/* Откат — из опорного состояния (то, что лежит в базе): возвращаются только
   таблицы, которые изменились. before — несохранённое до команды
   (storageCommand): оно остаётся в памяти, как было. */
function storageRollback(before){
 let changes;try{changes=storageDiff(DB);}catch(e){console.warn('Rollback skipped:',e.message);return;}
 /* Таблица, которую команда не меняла, остаётся теми же объектами: на них
    держат ссылки открытые окна и формы. */
 const key=c=>c.tbl+'\u0000'+c.id,sig=c=>c.del?'-':c.seq+'\u0000'+c.data,part=c=>c.tbl==='_meta'?'_meta\u0000'+c.id:c.tbl;
 const pre=new Map((before||[]).map(c=>[key(c),sig(c)])),post=new Map(changes.map(c=>[key(c),sig(c)])),moved=new Set();
 changes.concat(before||[]).forEach(c=>{const k=key(c);if(pre.get(k)!==post.get(k))moved.add(part(c));});
 if(!moved.size)return;
 storageRestore(changes.filter(c=>moved.has(part(c))),(before||[]).filter(c=>moved.has(part(c))));storageInvalidate();
}
function storageCommand(fn){
 if(storageDepth){try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:e.message};}}
 if(!storageWriter||storageRecovery||storageStale)return {ok:false,error:storageRecovery?'Restore or export the unreadable database before editing.':storageReadOnlyText()};
 const wasDirty=dirty,draftBefore=typeof soDraft==='undefined'?null:JSON.stringify(soDraft);
 /* Что в памяти ещё не записано до команды: при отказе вернётся и оно. */
 let before;try{before=storageDiff(DB);}catch(e){before=[];}
 storageDepth++;
 try{
  const value=fn();if(value===false||value&&value.error)throw new Error(value&&value.error||'The operation could not be completed.');
  storageDepth--;storageCommanding=true;const saved=touch();storageCommanding=false;
  if(saved===false)throw new Error(storageLastError||'Not saved. Retry the operation.');
  return {ok:true,value};
 }catch(e){storageDepth=0;storageCommanding=false;storageRollback(before);dirty=wasDirty;if(draftBefore!==null&&JSON.stringify(soDraft)!==draftBefore)soDraft=JSON.parse(draftBefore);storageInvalidate();storageLastError=e.message;return {ok:false,error:e.message};}
}
function touch(){
 if(storageDepth)return true;
 if(!storageWriter||storageRecovery||storageStale){
  if(storageStarting)return false;
  storageLastError=storageRecovery?'The stored database needs recovery. Export it before editing.':storageReadOnlyText();
  if(!storageRecovery&&!storageCommanding)storageRollback();
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
 try{
  /* Журнал заказа: события по разнице с тем, что лежит в базе (erp/sales/order-log). */
  if(typeof orderLogCapture==='function')orderLogCapture();
  /* Счётчик номеров стёкол — раньше базы (erp/production/glass-batches). */
  if(typeof glassIdMarkSave==='function')glassIdMarkSave();
  const changes=storageDiff(DB);
  /* Ничего не изменилось (старт без новых граф) — и отмечать нечего. */
  if(!changes.length){storageLastError=storageFailed?storageLastError:'';return true;}
  storageWrite(changes);storageBaseApply(changes);
  storageLastSaved=new Date().toISOString();storageLastError='';storageWarningShown=false;dirty=true;storageInvalidate();return true;
 }catch(e){
  storageLastError=storageStale?storageReadOnlyText():'Not saved. Your operation is still open; retry or export your changes.';
  if(!storageCommanding)storageRollback();
  console.error('Database write failed:',e);
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
}
/* Начать запись набора изменений. Синхронно отказывает, если прошлая запись
   не удалась (сначала Retry save) или вкладка устарела, — тогда действие
   откатывается. Сама запись идёт одной транзакцией в фоне; тесты подменяют
   эту функцию, чтобы проверить отказ. */
function storageWrite(changes){
 if(storageStale)throw new Error(storageReadOnlyText());
 if(storageFailed)throw new Error('Not saved. Retry the save first.');
 if(!changes.length)return;
 storageQueued=storageQueued?storageMerge(storageQueued,changes):changes.slice();
 if(!storageBusy)storageWriteNext();
}
function storageWriteNext(){
 const changes=storageQueued;storageQueued=null;
 if(!changes||!changes.length){storageBusy=false;storageFlushWaiters.splice(0).forEach(r=>r(!storageFailed));return;}
 storageBusy=true;
 /* Метка TEST — часть базы: пишется той же транзакцией, едет другим вкладкам. */
 const rev=storageRev+1,build=storageBuildId(),test=storageTest;
 storageIdbWrite(changes,rev,build,test).then(()=>{
  storageRev=rev;
  if(storageChannel)try{storageChannel.postMessage({type:'saved',build,rev,test,keys:changes.map(c=>[c.tbl,c.id])});}catch(e){}
  storageUsageCheck();storageWriteNext();
 },e=>storageWriteFailed(changes,e));
}
function storageWriteFailed(changes,e){
 /* Нет места: сначала уходит копия до импорта, затем один повтор. */
 if(storageQuotaError(e)&&storageBackupPresent&&!changes.retried){
  storageBackupDrop().then(()=>{const again=storageQueued?storageMerge(changes,storageQueued):changes;again.retried=true;storageQueued=again;storageWriteNext();});
  return;
 }
 storageFailed=storageQueued?storageMerge(changes,storageQueued):changes;storageQueued=null;storageBusy=false;
 storageLastError='Not saved. Retry or export your changes.';
 console.error('Database write failed:',e);
 storageFlushWaiters.splice(0).forEach(r=>r(false));
 if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}
 afterRender();
}
/* Повтор — только у вкладки, которая пишет: незаписанное держит запись. */
function storageRetry(){
 const changes=storageFailed;if(!changes||!storageWriter||storageStale)return;
 storageFailed=null;storageFailedExported=false;storageLastError='';storageWarningShown=false;
 storageWrite(changes);afterRender();
}
function storageHolds(){return !!storageFailed&&!storageFailedExported&&!storageStale;}
function storageTellHeld(){if(storageChannel)try{storageChannel.postMessage({type:'writer-held'});}catch(e){}}
/* Ждать, пока всё начатое дойдёт до базы: true — записано, false — нет. */
function storageFlush(){return !storageBusy&&!storageQueued?Promise.resolve(!storageFailed):new Promise(r=>storageFlushWaiters.push(r));}
function storageQuotaError(e){return !!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);}
function storageRead(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function storageReadOnlyText(){return storageStale?'A newer version is open. Reload this tab.':storageTakeover?'Switching editing to this tab — repeat the action in a moment.':'Glass Farm is busy in another tab. Click here to continue, or close the other tab.';}
/* Место. Браузер даёт базе гигабайты; persist просит не стирать её при
   нехватке места на диске. Размер — администратору внизу экрана, больше
   80 % того, что даёт браузер, — полоса для всех. */
function storageUsageCheck(){
 if(!navigator.storage||!navigator.storage.estimate||Date.now()-storageUsageAt<30000)return;
 storageUsageAt=Date.now();
 navigator.storage.estimate().then(e=>{storageUsage={usage:+e.usage||0,quota:+e.quota||0};afterRender();}).catch(()=>{});
}
function storageUsageFull(){return !!storageUsage&&storageUsage.quota>0&&storageUsage.usage/storageUsage.quota>0.8;}
/* Footer: a calm status line. Problems that stop the work go to the alert
   bar above the screen, which is visible on the station and tablet too. */
function storageStatusHTML(){
 const text=storageRecovery?'Database recovery needed':!navigator.locks?'Editing unavailable in this browser':storageStale?'Older version':storageLastError?'Not saved':storageWriter?'Editing here':'Editing in another tab';
 const admin=accessCan(ACCESS_ADMIN);
 return '<div class="storage-status'+(storageLastError||storageRecovery||storageStale?' bad':'')+'" role="status"><span>'+esc(text)+'</span>'+
  (storageLastSaved&&!storageLastError?'<small>Saved '+esc(new Date(storageLastSaved).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</small>':'')+
  (admin&&storageUsage?'<small>DB '+esc(String(Math.max(1,Math.round(storageUsage.usage/1048576))))+' MB</small>':'')+
  (admin&&storageLastAction!=null?'<small>Last action '+storageLastAction+' ms</small>':'')+
  (storageBackupPresent&&admin?'<button type="button" onclick="storageRestoreBackup()">Restore pre-import backup</button>':'')+'</div>';
}
function storageAlertHTML(){
 const text=storageRecovery?'Database recovery needed. '+(storageLastError||''):!navigator.locks?'This browser cannot coordinate editing. Open Glass Farm in a current Chrome, Edge, Firefox or Safari.':storageStale?storageReadOnlyText():storageLastError||(storageUsageFull()?'Storage almost full. Export and tell admin.':'');
 if(!text)return '';
 return '<span>'+esc(text)+'</span>'+
  (storageStale?'<button type="button" onclick="location.reload()">Reload</button>':'')+
  (storageFailed&&!storageStale?'<button type="button" onclick="storageRetry()">Retry save</button>':'')+
  (!storageWriter&&!storageRecovery&&!storageStale&&navigator.locks?'<button type="button" onclick="storageTakeControl()">Edit here</button>':'')+
  (storageRecovery?'<button type="button" onclick="storageExportRecovery()">Export original data</button>':'')+
  (storageRecovery&&storageBackupPresent?'<button type="button" onclick="storageRestoreBackup()">Restore pre-import backup</button>':'');
}
function afterRender(){
 if(storageActionAt){const ms=performance.now()-storageActionAt;storageActionAt=0;if(ms<30000)storageLastAction=Math.round(ms);}
 const host=document.getElementById('storageStatus');if(host)host.innerHTML=storageStatusHTML();
 const alertBar=document.getElementById('storageAlert');if(alertBar){const h=storageAlertHTML();alertBar.innerHTML=h;alertBar.hidden=!h;}
 const chip=document.getElementById('testChip');if(chip)chip.hidden=!storageTest;
 /* Forms remain available for reading. A tab that can take over keeps its
    buttons: the click itself makes it the writer. Without coordination, with
    a broken database or in an older version, persisting controls are off. */
 if(storageRecovery||!navigator.locks||storageStale){
  document.querySelectorAll('#app button[onclick],#app [data-station-scan]').forEach(el=>{
   if(el.hasAttribute('data-station-scan')||/\b(?:save\w*|\w*Save|\w*Create|stationSubmit|stationMark|stationUndoClick|finConfirmApply|finExportQuickBooks|del\w*|carrierSet)\s*\(/.test(el.getAttribute('onclick')||'')){
    el.disabled=true;el.title=storageStale?'Reload this tab to edit.':'Activate editing in this tab to change the database.';
   }
  });
 }
}
/* Поля, которые человек изменил с последней отрисовки. */
function storageTypedFields(){
 const app=document.getElementById('app'),changed=el=>el.tagName==='SELECT'?[...el.options].some(o=>o.selected!==o.defaultSelected):el.type==='checkbox'||el.type==='radio'?el.checked!==el.defaultChecked:el.type!=='file'&&el.value!==el.defaultValue;
 return app?[...app.querySelectorAll('input[id],select[id],textarea[id]')].filter(changed):[];
}
/* A redraw caused by another tab must not wipe what is typed: fields the
   user changed since the last draw keep their value, focus and caret. */
function storageRerender(){
 const app=document.getElementById('app');
 const keep=storageTypedFields().map(el=>({id:el.id,type:el.type,value:el.value,checked:el.checked}));
 const a=document.activeElement,focus=a&&a.id&&app&&app.contains(a)?{id:a.id,start:a.selectionStart,end:a.selectionEnd}:null;
 render();
 keep.forEach(k=>{const el=document.getElementById(k.id);if(!el||el.type!==k.type)return;if(k.type==='checkbox'||k.type==='radio')el.checked=k.checked;else el.value=k.value;});
 if(focus){const el=document.getElementById(focus.id);if(el&&document.activeElement!==el){el.focus();try{if(focus.start!=null)el.setSelectionRange(focus.start,focus.end);}catch(e){}}}
}
/* Перерисовать после чужой записи — только если никто не печатает: иначе
   курсор выпрыгивал бы из поля на каждом скане станции. */
function storageRerenderQuiet(){
 const a=document.activeElement,typing=a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&!(a.dataset&&a.dataset.stationScan!==undefined&&!a.value);
 if(!typing)storageRerender();
}
/* Есть ли что терять: черновик заказа, формы разделов (их проверки — в
   window.STORAGE_UNSAVED, по одной на форму) и набранное в полях. Форма
   держит ввод в своём черновике, а у её полей нет id, — по одним полям
   набранного клиента не было видно (проверка Codex 22.10.2026). */
function storageHasWork(){
 if(typeof salesDraftHasWork==='function'&&salesDraftHasWork())return true;
 if((window.STORAGE_UNSAVED||[]).some(f=>{try{return !!f();}catch(e){return false;}}))return true;
 return storageTypedFields().length>0;
}
/* Вкладка устарела: открыта другая сборка. Ничего не начато — вкладка сама
   перезагружается, один раз на сборку (две вкладки разных версий не гоняют
   друг друга по кругу). Начато — полоса «Reload», запись отказывает. Что
   начато — до того, как вкладка отдаст запись и перерисуется. */
function storageMarkStale(by){
 if(storageStale||!by)return;
 const unsaved=storageHasWork()||!!storageFailed;
 storageStale=by;storageLastError=storageReadOnlyText();
 if(storageWriter)storageYield();
 let done='';try{done=sessionStorage.getItem(STORAGE_RELOAD_KEY)||'';}catch(e){}
 if(done!==by&&!unsaved){
  try{sessionStorage.setItem(STORAGE_RELOAD_KEY,by);}catch(e){}
  storageFlush().then(()=>location.reload());return;
 }
 storageRerender();
}
function storageOnMessage(d){
 if(!d||typeof d!=='object')return;
 if(d.type==='release-writer'){if(storageWriter&&storageHolds())storageTellHeld();else if(storageWriter)storageYield();return;}
 /* Ответ на нашу просьбу: там незаписанное — не ждать, сказать почему. */
 if(d.type==='writer-held'){if(storageTakeoverAbort){storageOtherHeld=true;storageTakeoverAbort.abort();}return;}
 if(d.type==='saved')storageOtherHeld=false;
 /* Другая вкладка стёрла базу (Clear database) — эта начинает с пустой. */
 if(d.type==='cleared'){if(storageIdb){storageIdb.close();storageIdb=null;}storageStale='cleared';location.reload();return;}
 if((d.type==='hello'||d.type==='saved')&&d.build&&d.build!==storageBuildId()){storageMarkStale(d.build);return;}
 if(d.type==='saved'&&Array.isArray(d.keys))storageApplying=storageApplying.then(()=>storageApplySaved(d)).catch(e=>console.warn('Live update skipped:',e.message));
}
/* Чужая вкладка записала: прочитать только её записи и вставить в свою DB.
   Несохранённый заказ этой вкладки едет поверх со своими формами строк
   (владелец, 2 октября 2026: большой заказ в одной вкладке, клиент у
   стойки — в другой). */
async function storageApplySaved(d){
 if(storageWriter||storageRecovery||!(d.rev>storageRev))return;
 const got=await storageIdbGet(d.keys);
 if(storageWriter)return;
 const list=d.keys.map((k,i)=>{const r=got.records[i];return r?{tbl:r.tbl,id:r.id,seq:r.seq,data:r.data}:{tbl:k[0],id:k[1],del:true};});
 /* Испорченная запись — до того, как что-то вставлено: база этой вкладки цела. */
 list.forEach(c=>{if(!c.del&&(typeof c.data!=='string'||!Number.isFinite(c.seq)))throw new Error('A stored record is damaged.');if(!c.del)JSON.parse(c.data);});
 const shapes=typeof soDraft!=='undefined'&&soDraft&&Array.isArray(DB.shapeDef)?{shapeDef:DB.shapeDef.slice()}:null;
 storageApplyRecords(list);storageRev=d.rev;if(typeof d.test==='boolean')storageTest=d.test;
 if(shapes&&typeof salesDraftKeepShapes==='function')salesDraftKeepShapes(shapes,DB);
 storageInvalidate();storageRerenderQuiet();
 const chip=document.getElementById('testChip');if(chip)chip.hidden=!storageTest;
}
/* Записи пропущены (вкладка спала, сообщение не дошло) — база целиком. */
async function storageReloadAll(){
 const got=await storageIdbReadAll(),next=prepareImportedState(storageJoin(got.records));
 if(typeof salesDraftKeepShapes==='function')salesDraftKeepShapes(DB,next);
 storageBaseFrom(got.records);DB=next;storageRev=got.rev;storageTest=got.test===true;storageInvalidate();
}
/* Перед тем как писать: другая сборка писала после того, как эта вкладка
   открылась, — вкладка устарела; пропущены записи — дочитать. Метка TEST —
   из базы: настоящую базу поверх тестовой не пускает ни одна вкладка. */
async function storageCatchUp(){
 await storageApplying;
 const meta=await storageIdbMeta();
 if(meta.build&&meta.build!==storageBuildId()&&meta.build!==storageBuildAtLoad){storageMarkStale(meta.build);return false;}
 if(meta.rev!==storageRev)await storageReloadAll();
 storageTest=meta.test===true;
 return true;
}
function storageTakeControl(){
 if(storageWriter)return Promise.resolve(true);
 if(storageTakeover)return storageTakeover;
 if(storageStale){storageRerender();return Promise.resolve(false);}
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing. Open the file in a current browser.';render();return Promise.resolve(false);}
 storageOtherHeld=false;
 if(storageChannel)storageChannel.postMessage({type:'release-writer'});
 storageTakeover=new Promise(resolve=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);storageTakeoverAbort=abort;
  navigator.locks.request(STORAGE_LOCK,{signal:abort.signal},async lock=>{
   clearTimeout(timer);storageTakeoverAbort=null;
   /* The latest saved data first; this tab's open draft rides on top of it. */
   let ok=true;
   try{ok=await storageCatchUp();}catch(e){storageRecovery=true;storageLastError='Stored data could not be read. Export the original and import a complete backup.';console.warn(e.message);}
   storageTakeover=null;
   if(!ok){storageRerender();resolve(false);return;}
   storageWriter=true;storageWarningShown=false;storageHandoffFailed=false;
   if(!storageRecovery&&!storageFailed)storageLastError='';storageBackupCheck();storageRerender();resolve(true);
   await new Promise(r=>storageRelease=r);
  }).catch(()=>{clearTimeout(timer);storageTakeoverAbort=null;storageTakeover=null;storageWriter=false;storageHandoffFailed=true;
   storageLastError=storageOtherHeld?'Not saved in another tab. Retry or export there.':'Glass Farm is still busy in another tab that does not answer. Close it, then click Edit here.';storageRerender();resolve(false);});
 });
 return storageTakeover;
}
/* Give the writer to the tab the user moved to — always, even with an
   unsaved order or payment here. A draft lives in this tab's memory; only
   the order's line shapes sit in the shared database before Update, so they
   are parked as saved and come back from memory when this tab returns.
   Замок отпускается, когда начатое дошло до базы. Не дошло — вкладка
   держит запись, как при Retry save. Незаписанное уже в файле Export —
   вкладка отдаёт запись и берёт из базы то, что там лежит. */
function storageYield(){
 if(!storageWriter)return;
 const dropped=!!storageFailed&&storageFailedExported&&!storageStale;
 if(dropped){storageFailed=null;storageFailedExported=false;storageLastError='';}
 if(!storageStale)try{const parked=typeof salesDraftParked==='function'?salesDraftParked():null;if(parked){const changes=storageDiff(parked);storageWrite(changes);storageBaseApply(changes);}}catch(e){console.warn('Draft shapes were not parked:',e.message);}
 storageWriter=false;
 const release=storageRelease;storageRelease=null;
 storageFlush().then(ok=>{
  if(!ok&&storageHolds()){storageRelease=release;storageWriter=true;storageTellHeld();storageRerender();return;}
  if(release)release();
  if(dropped)storageApplying=storageApplying.then(storageReloadAll).then(storageRerenderQuiet).catch(e=>console.warn('Reload skipped:',e.message));
 });
 storageRerender();
}
/* Run an action as the writer: a scan typed into a tab that is not the writer
   yet waits for the handoff instead of failing. */
function storageWhenWriter(fn){
 if(storageWriter||storageRecovery||storageStale||!navigator.locks)return fn();
 storageTakeControl().then(()=>fn());
}
/* Другая вкладка держит незаписанное — не спрашивать на каждый клик: только
   кнопкой Edit here или когда она снова запишет. */
function storageWantControl(){if(!storageWriter&&!storageStarting&&!storageRecovery&&!storageStale&&!storageTakeover&&!storageOtherHeld&&navigator.locks)storageTakeControl();}
function storageStart(){
 window.storageReady=new Promise(r=>storageReadyResolve=r);
 try{storageChannel=new BroadcastChannel(STORAGE_LOCK);storageChannel.onmessage=e=>storageOnMessage(e.data);}catch(e){}
 if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
 const ready=()=>{storageStarting=false;storageBackupCheck();const tr=performance.now();render();if(storageBootMs)storageBootMs.render=performance.now()-tr;
  /* Другие вкладки узнают, что открыта эта сборка. */
  if(storageChannel&&!storageRecovery)try{storageChannel.postMessage({type:'hello',build:storageBuildId()});}catch(e){}
  storageUsageCheck();storageReadyResolve();};
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing safely.';boot().then(ready);return;}
 navigator.locks.request(STORAGE_LOCK,{ifAvailable:true},async lock=>{
  storageWriter=!!lock;await boot();ready();
  /* A tab you just opened is where you work: it takes over at once. */
  if(!lock&&document.visibilityState==='visible'&&document.hasFocus())storageTakeControl();
  if(lock)await new Promise(r=>storageRelease=r);
 }).catch(e=>{storageLastError=e.message;storageWriter=false;storageStarting=false;render();if(storageReadyResolve)storageReadyResolve();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')storageWantControl();});
 window.addEventListener('focus',storageWantControl);
 document.addEventListener('pointerdown',storageWantControl,true);
 document.addEventListener('keydown',storageWantControl,true);
}
/* Черновик заказа живёт только в памяти: F5 или закрытие вкладки стирали его
   без предупреждения. Спрашиваем ровно тогда, когда есть что терять — иначе
   браузер показывал бы диалог на каждом уходе со страницы. Запись, которая
   ещё идёт или не удалась, — тоже потеря. */
window.addEventListener('beforeunload',function(e){
 const draft=typeof salesDraftHasWork==='function'&&salesDraftHasWork();
 if(!draft&&!storageQueued&&!storageFailed&&!(storageBusy&&!storageStale))return;
 e.preventDefault();e.returnValue='';return '';
});
/* Ушли со страницы, не сохранив заказ: формы строк возвращаются к
   сохранённым, иначе база осталась бы с формами без заказа. */
window.addEventListener('pagehide',function(){
 if(!storageWriter||typeof salesDraftHasWork!=='function'||!salesDraftHasWork()||typeof salesDraftDrop!=='function')return;
 salesDraftDrop(true);
});
/* Discard the order draft while the writer is still held, then release it. */
window.addEventListener('pagehide',()=>{storageWriter=false;if(storageRelease)storageRelease();});
function storageExportEnvelope(){return {format:'glass-erp',schemaVersion:1,exportedAt:new Date().toISOString(),data:DB};}
function storageDownload(name,parts,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob(Array.isArray(parts)?parts:[parts],{type:type||'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/* Export v2 — построчно (NDJSON): строка заголовка, затем по строке на
   запись — та же запись, что лежит в базе. Файл собирается Blob из частей:
   одной огромной строки нет. Этот же формат — для будущего переноса
   старых данных и обмена с сервером. Пишется то, что в памяти, — и
   то, что ещё не дошло до базы (запись не удалась). */
function storageExportParts(){
 const keep=storageBase;let recs;
 storageBase=new Map();
 try{recs=storageDiff(DB);}finally{storageBase=keep;}
 /* Пустая таблица — строкой «таблица пуста» (id `*`, data []): без неё
    файл новой установки без клиентов или заказов не возвращался Import'ом. */
 Object.keys(DB).forEach(k=>{if(Array.isArray(DB[k])&&!DB[k].length)recs.push({tbl:k,id:'*',seq:0,data:'[]'});});
 const head={format:'glass-erp',schemaVersion:2,exportedAt:new Date().toISOString(),build:storageBuildId(),records:recs.length};
 if(storageTest)head.test=true;
 const parts=[JSON.stringify(head)+'\n'];
 for(let i=0;i<recs.length;i+=1000)parts.push(recs.slice(i,i+1000).map(c=>'{"tbl":'+JSON.stringify(c.tbl)+',"id":'+JSON.stringify(c.id)+',"seq":'+c.seq+',"data":'+c.data+'}\n').join(''));
 return parts;
}
/* Вся база целиком — дело администратора (раздел Users, erp/access): Import
   заменяет и людей с их правами, Export отдаёт и Finance. */
function doExport(){
 if(!accessCan(ACCESS_ADMIN))return;
 storageDownload('glazing_system_data.ndjson',storageExportParts(),'application/x-ndjson');
 storageBackupAt=new Date().toISOString();dirty=false;if(storageFailed)storageFailedExported=true;render();
}
/* Записи как они лежат, без нормализации, — то, что не прочиталось. */
function storageExportRecovery(){
 const read=storageIdb?storageIdbTx(['record'],'readonly',tx=>{const out={records:[]};tx.objectStore('record').getAll().onsuccess=e=>{out.records=e.target.result||[];};return out;}):Promise.resolve({records:[]});
 return read.then(o=>storageDownload('glazing_system_recovery.json',JSON.stringify({format:'glass-erp-records',exportedAt:new Date().toISOString(),records:o.records})),
  e=>alert('The stored records could not be read: '+e.message));
}
function storageImportSummary(next){return ['customer','salesOrder','receipt','glassBatch','stationScan'].map(k=>k+': '+(DB[k]||[]).length+' → '+(next[k]||[]).length).join('\n');}
/* Заменить базу — дело администратора (раздел Users, erp/access), чем бы
   ни вызвали: Import, Restore pre-import backup, восстановление (аудит
   3 октября 2026). Проверка здесь, а не только на кнопке, и уже после
   чтения файла. Ответ — Promise: true, когда новая база дошла до диска.
   opts.test — файл помечен TEST (база симулятора); настоящую базу поверх
   тестовой не кладём (владелец, 20.10.2026: «не путать тестовое и базу с
   проектами прошлых лет»). opts.restore — Restore pre-import backup: копия
   возвращается с той меткой, какая у неё была. */
async function storageImportState(raw,opts){
 opts=opts||{};
 if(!accessCan(ACCESS_ADMIN)){alert('Users access needed to replace the database.');return false;}
 const payload=raw&&raw.format==='glass-erp'?raw.data:raw;
 if(!payload||!Array.isArray(payload.customer)||!Array.isArray(payload.salesOrder)||!Array.isArray(payload.station))throw new Error('Choose a complete GLASS ERP backup. A partial data file cannot replace this database.');
 if(storageTest&&!opts.test&&!opts.restore){alert('Test data here. Clear database first.');return false;}
 const next=prepareImportedState(raw);
 if(!confirm('Replace this browser database?\n\n'+storageImportSummary(next)+'\n\nA recovery copy will be kept before replacement.'))return false;
 const recovering=storageRecovery;
 /* The copy is written and checked before the database is touched. */
 /* Копия — одной строкой; у браузера предел строки около 512 МБ, это база
    примерно за год. Больше — понятный отказ вместо «Invalid string length». */
 const at=new Date().toISOString();let backup;
 try{backup=JSON.stringify(Object.assign({format:'glass-erp',schemaVersion:1,exportedAt:at},storageTest?{test:true}:{},{data:DB}));}
 catch(e){alert('Nothing was replaced. Too big for a recovery copy: Export, Clear database, then Import.');return false;}
 try{await storageIdbCopyPut(backup,at);if(await storageIdbCopyGet()!==backup)throw new Error('The recovery copy could not be verified.');}
 catch(e){alert('Nothing was replaced: '+e.message);return false;}
 storageBackupPresent=true;storageCopyAt=at;
 if(recovering){await storageExportRecovery();storageRecovery=false;}
 /* Метка уходит той же записью, что и новая база (storageWriteNext). */
 storageImporting=true;const testWas=storageTest;storageTest=!!opts.test;
 const result=storageCommand(()=>{DB=next;return true;});
 storageImporting=false;
 if(!result.ok){storageTest=testWas;storageRecovery=recovering;alert(result.error);return false;}
 const saved=await storageFlush();
 storageInvalidate();render();return saved;
}
/* Засев для тестов и инструментов (test/run.js, tools/shot.js): объект базы
   ложится записями как есть — без вопроса и без нормализации, её сделает
   старт после F5. Прежние записи этого браузера стираются; вкладка больше
   не пишет — следом F5. */
async function storageSeed(src){
 await storageFlush();
 const keep=storageBase;let changes;
 storageBase=new Map();
 try{changes=storageDiff(src&&typeof src==='object'&&!Array.isArray(src)?src:{});}finally{storageBase=keep;}
 storageWriter=false;if(storageRelease)storageRelease();storageRelease=null;
 await storageIdbTx(['record','meta'],'readwrite',tx=>{
  const rs=tx.objectStore('record');rs.clear();
  changes.forEach(c=>rs.put({tbl:c.tbl,id:c.id,seq:c.seq,data:c.data}));
  tx.objectStore('meta').put(storageRev+1,'rev');
 });
}
function storageRestoreBackup(){
 return storageIdbCopyGet().then(raw=>{if(!raw){alert('No pre-import recovery copy is available.');return false;}const copy=JSON.parse(raw);return storageImportState(copy,{restore:true,test:copy.test===true});},
  e=>{alert('No pre-import recovery copy is available.');return false;});
}
/* Import v2 — потоком: файл читается кусками и делится на строки, строка —
   одна запись. JSON.parse всего файла нет, предела размера нет. */
async function storageReadRecords(file){
 const reader=file.stream().pipeThrough(new TextDecoderStream()).getReader(),records=[];
 let buf='',head=null,line=0;
 const take=text=>{
  if(!text.trim())return;line++;
  let o;try{o=JSON.parse(text);}catch(e){throw new Error('line '+line+' is not readable.');}
  if(!head){if(!o||o.format!=='glass-erp'||o.schemaVersion!==2)throw new Error('Unsupported GLASS ERP backup format or version.');head=o;return;}
  if(!o||typeof o.tbl!=='string'||typeof o.id!=='string'||!Number.isFinite(o.seq)||o.data===undefined)throw new Error('line '+line+' is not a record.');
  records.push(o);
 };
 for(;;){
  const r=await reader.read();if(r.done)break;
  buf+=r.value;let i;while((i=buf.indexOf('\n'))>=0){take(buf.slice(0,i));buf=buf.slice(i+1);}
 }
 take(buf);
 if(!head)throw new Error('the file is empty.');
 if(Number.isInteger(head.records)&&head.records!==records.length)throw new Error('the file is incomplete: '+records.length+' of '+head.records+' records.');
 return {head,state:storageJoin(records,true)};
}
/* Файл Import: v2 (строка заголовка с schemaVersion 2) или прежний JSON (v1).
   Метка TEST — в заголовке v2 или в конверте v1 (tools/sim-shop.js). Пустые
   строки до заголовка не мешают. */
async function storageImportFile(file){
 let first=null;try{first=JSON.parse((await file.slice(0,65536).text()).replace(/^\s+/,'').split('\n')[0]);}catch(e){}
 if(first&&first.format==='glass-erp'&&first.schemaVersion===2){
  const got=await storageReadRecords(file);return storageImportState(got.state,{test:got.head.test===true});
 }
 const raw=JSON.parse(await file.text());
 return storageImportState(raw,{test:!!raw&&raw.test===true});
}
function doImport(inp){
 const f=inp.files[0];if(!f)return;
 if(!accessCan(ACCESS_ADMIN)){inp.value='';return;}
 storageImportFile(f).catch(e=>alert('File not readable: '+e.message));inp.value='';
}
/* Clear database — только администратор. Стирает всё в этом браузере:
   записи, копию до импорта, метку TEST и счётчик номеров стёкол (иначе
   настоящие G- / U- продолжились бы после тестовых). После — ERP как новая
   установка: демо-людей нет (засев один раз на браузер), первого человека
   заводит администратор. Нужна и между прогонами испытаний. */
async function storageClear(){
 if(!accessCan(ACCESS_ADMIN))return false;
 const n=k=>(DB[k]||[]).length;
 if(!confirm('Delete the whole database in this browser?\n\n'+n('salesOrder')+' orders, '+n('customer')+' customers, '+n('stationScan')+' scans, '+n('user')+' people.\n\nExport first to keep a copy. This cannot be undone.'))return false;
 await storageFlush();
 storageWriter=false;if(storageRelease)storageRelease();storageRelease=null;
 if(storageChannel)try{storageChannel.postMessage({type:'cleared'});}catch(e){}
 if(storageIdb){storageIdb.close();storageIdb=null;}
 await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(STORAGE_IDB_NAME);q.onsuccess=()=>resolve();q.onerror=()=>reject(q.error||new Error('The database could not be deleted.'));});
 try{localStorage.removeItem(GLASS_ID_MARK_KEY);}catch(e){}
 location.reload();return true;
}
/* ИСПРАВЛЕНО (авг 2026). Раньше здесь был Object.assign(DB, JSON.parse(s)) —
   в DB попадало ЛЮБОЕ содержимое ключа, включая null вместо массива, и
   normalizeUsers() падал на .forEach. Результат: пустой белый экран без
   единого сообщения, и починить его можно было только через DevTools.
   Тот же ключ localStorage использовала предыдущая оболочка прототипа,
   так что чужая структура данных там вполне реальна. */
/* Legacy standalone muntinDef is intentionally ignored: the owner confirmed
   those layouts were test data. shape.muntin remains part of each shape. */
function mergeState(src){
 if(!src||typeof src!=='object')return;
 Object.keys(DEFAULT).forEach(k=>{
  const v=src[k];
  if(Array.isArray(DEFAULT[k])){ if(Array.isArray(v)) DB[k]=v; }
  else if(v!=null) DB[k]=v;
 });
}
function validateImportedState(src){
 if(!src||typeof src!=='object'||Array.isArray(src))throw new Error('Expected an exported state object.');
 Object.keys(DEFAULT).forEach(k=>{if(Array.isArray(DEFAULT[k])&&Object.prototype.hasOwnProperty.call(src,k)&&!Array.isArray(src[k]))throw new Error('The "'+k+'" field must be an array.');});
 if(typeof finValidatePayload==='function')finValidatePayload(src);
 if(typeof validateCustomersPayload==='function')validateCustomersPayload(src);
 if(typeof validatePurchasingPayload==='function')validatePurchasingPayload(src);
 if(typeof validatePurchaseOrders==='function')validatePurchaseOrders(src);
 if(typeof validatePurchaseReceiving==='function')validatePurchaseReceiving(src);
 if(typeof validatePurchaseInvoices==='function')validatePurchaseInvoices(src);
 if(typeof validateInventoryPayload==='function')validateInventoryPayload(src);
 if(typeof validateSalesPayload==='function')validateSalesPayload(src);
 if(typeof validateGlassBatchesPayload==='function')validateGlassBatchesPayload(src);
 if(typeof validateNcrPayload==='function')validateNcrPayload(src);
 if(typeof validateRecutPayload==='function')validateRecutPayload(src);
 if(typeof validateSkipPayload==='function')validateSkipPayload(src);
 if(typeof validateProductionUnbatchPayload==='function')validateProductionUnbatchPayload(src);
 if(typeof validateStickerPayload==='function')validateStickerPayload(src);

 if(typeof validateCuttingPayload==='function')validateCuttingPayload(src);

 if(typeof validateCutPlanPayload==='function')validateCutPlanPayload(src);
 if(typeof validateStockOffcutPayload==='function')validateStockOffcutPayload(src);
 if(typeof validateStationScanPayload==='function')validateStationScanPayload(src);
 if(typeof validateCarrierPayload==='function')validateCarrierPayload(src);
 if(typeof validateShipmentPayload==='function')validateShipmentPayload(src);
 if(typeof validateTruckPayload==='function')validateTruckPayload(src);
 if(typeof validateSkidReturnPayload==='function')validateSkidReturnPayload(src);
 if(typeof validateReportsPayload==='function')validateReportsPayload(src);
 function unique(list,key,label,normalize){
  const seen=new Set();(Array.isArray(list)?list:[]).forEach((row,i)=>{
   if(!row||typeof row!=='object')return;
   const raw=row[key];if(raw==null||raw==='')return;
   const value=normalize?normalize(raw):String(raw);
   if(seen.has(value))throw new Error(label+': duplicate "'+value+'".');seen.add(value);
  });
 }
 /* `level` больше не таблица — старый экспорт с этим ключом читается, ключ
    просто игнорируется: шагом маршрута стала сама станция. */
 unique(src.station,'code','Stations',v=>String(v).trim().toUpperCase());
 unique(src.terminal,'code','Terminals',v=>String(v).trim().toUpperCase());
 /* Каталог стекла опознаётся и по id, и по коду: id держит ссылки из
    сохранённых Makeup, код — слияние при импорте CSV. Дубль любого из них
    означает, что одна из двух записей окажется недостижимой. */
 unique(src.glassProduct,'id','Glass products');
 unique(src.glassProduct,'code','Glass products',v=>String(v).trim().toUpperCase());
 unique(src.glassSheet,'id','Glass supply');
 unique(src.shapeDef,'id','Shape');
 const entityId=/^[A-Za-z0-9_-]{1,96}$/;
 (src.shapeDef||[]).forEach((s,i)=>{if(s&&s.id&&!entityId.test(String(s.id)))throw new Error('Shape row '+(i+1)+' has an invalid id.');});
 (src.shapeDef||[]).forEach((s,i)=>{
  if(!s||typeof s!=='object')return;
  if(s.type!=null&&!SHAPE_PRESETS.some(p=>p.id===s.type))throw new Error('Shape row '+(i+1)+' has an unknown type.');
  if(s.features!=null&&!Array.isArray(s.features))throw new Error('Shape row '+(i+1)+': features must be an array.');
  if(s.polygon!=null&&!Array.isArray(s.polygon))throw new Error('Shape row '+(i+1)+': polygon must be an array.');
  if(s.edgeOps!=null&&(!s.edgeOps||typeof s.edgeOps!=='object'||Array.isArray(s.edgeOps)))throw new Error('Shape row '+(i+1)+': edgeOps must be an object.');
  const ids=new Set(),subId=/^[A-Za-z0-9:_-]{1,96}$/;(s.features||[]).forEach((f,j)=>{if(!f||!SHAPE_FEATURE_TYPES.includes(f.type))throw new Error('Shape '+(i+1)+', feature '+(j+1)+' has an unknown type.');if(f.id&&!subId.test(String(f.id)))throw new Error('Shape '+(i+1)+' has a feature with an invalid id.');if(f.id&&ids.has(f.id))throw new Error('Shape '+(i+1)+' has duplicate feature ids.');if(f.id)ids.add(f.id);});
  Object.keys(s.edgeOps||{}).forEach(edgeId=>{if(!subId.test(edgeId)||!Array.isArray(s.edgeOps[edgeId]))throw new Error('Shape '+(i+1)+' has invalid edgework.');s.edgeOps[edgeId].forEach(op=>{if(!op||!SHAPE_EDGE_OPS.includes(op.type))throw new Error('Shape '+(i+1)+' has an unknown edge operation.');});});
 });
 (src.station||[]).forEach((s,i)=>{if(s&&s.code&&!SF_CODE_RE.test(String(s.code).trim().toUpperCase()))throw new Error('Station row '+(i+1)+' has an invalid code.');});
 (src.terminal||[]).forEach((t,i)=>{
  if(!t)return;
  if(t.code&&!SF_CODE_RE.test(String(t.code).trim().toUpperCase()))throw new Error('Terminal row '+(i+1)+' has an invalid code.');
  if(t.stations!=null&&!Array.isArray(t.stations))throw new Error('Terminal row '+(i+1)+': stations must be an array.');
 });
 /* Старые роли и навыки не проверяем: нормализация переносит роль в
    галочки разделов, а навыки отбрасывает (Users, 3 октября 2026). */
 (src.user||[]).forEach((u,i)=>{
  if(u&&u.access!=null&&!Array.isArray(u.access))throw new Error('User '+(i+1)+': access must be an array.');
 });
}
function prepareImportedState(src){
 if(src&&src.format!==undefined){
  if(src.format!=='glass-erp'||src.schemaVersion!==1||!src.data)throw new Error('Unsupported GLASS ERP backup format or version.');src=src.data;
 }
 if(!src||typeof src!=='object'||Array.isArray(src)||!Object.keys(src).some(k=>Object.prototype.hasOwnProperty.call(DEFAULT,k)))throw new Error('Expected a GLASS ERP database or backup, not an empty or unrelated object.');
 validateImportedState(src);
 const previous=DB, previousReseeded=referenceReseeded;
 try{
  DB=JSON.parse(JSON.stringify(DEFAULT));mergeState(src);if(typeof glassIdMarkApply==='function')glassIdMarkApply();normalizeDB();
  /* Пересев на импорте, а не только на старте. Версия справочников живёт В
     ДАННЫХ ровно затем, чтобы чужой файл со старым каталогом тоже пересеялся;
     до сих пор это срабатывало лишь при следующем F5, и всё это время на
     экране лежала прежняя модель цеха. Теперь — сразу. */
  if(typeof reseedReferenceTables==='function'&&reseedReferenceTables(true))normalizeDB();
  if(typeof applyDataFixes==='function'&&applyDataFixes())normalizeDB();
  if(typeof validateSalesReferences==='function')validateSalesReferences();
  const next=DB;DB=previous;return next;
  /* Откатываем и ОТМЕТКУ о пересеве: импорт мог упасть уже после него, и
     баннер «справочники обновлены» рассказывал бы про замену, которой не было. */
 }catch(e){DB=previous;referenceReseeded=previousReseeded;throw e;}
}
function normalizeDB(){
 Object.keys(DEFAULT).forEach(k=>{ if(Array.isArray(DEFAULT[k])&&!Array.isArray(DB[k])) DB[k]=JSON.parse(JSON.stringify(DEFAULT[k])); });
 normalizeRefVersion();
 /* Порядок обязателен: рабочие места приводятся в порядок ДО пользователей.
    Пользователь ссылается на рабочее место, и проверять ссылку не на чем,
    пока таблица мест не нормализована. */
 normalizeShopFloor();
 normalizeUsers();
 normalizeSalesModules();
 if(typeof normalizeMasterData==='function')normalizeMasterData();
 if(typeof normalizePurchasing==='function')normalizePurchasing();
 if(typeof normalizePurchaseOrders==='function')normalizePurchaseOrders();
 if(typeof normalizePurchaseReceiving==='function')normalizePurchaseReceiving();
 if(typeof normalizePurchaseInvoices==='function')normalizePurchaseInvoices();
 if(typeof normalizeInventory==='function')normalizeInventory();
 if(typeof normalizeHardwareCatalog==='function')normalizeHardwareCatalog();
 if(typeof normalizeCustomers==='function')normalizeCustomers();
 if(typeof normalizeSalesData==='function')normalizeSalesData();
 if(typeof normalizeRecuts==='function')normalizeRecuts();
 if(typeof normalizeNcrRecords==='function')normalizeNcrRecords();
 if(typeof normalizeGlassBatches==='function')normalizeGlassBatches();
 if(typeof normalizeNcrReasons==='function')normalizeNcrReasons();
 if(typeof normalizeStickerTemplates==='function')normalizeStickerTemplates();

 if(typeof normalizeCutting==='function')normalizeCutting();

 if(typeof normalizeCutPlans==='function')normalizeCutPlans();
 if(typeof normalizeStockOffcuts==='function')normalizeStockOffcuts();
 if(typeof normalizeCarriers==='function')normalizeCarriers();
 if(typeof normalizeStationScans==='function')normalizeStationScans();
 if(typeof normalizeShipments==='function')normalizeShipments();
 if(typeof normalizeSkips==='function')normalizeSkips();
 if(typeof normalizeProductionUnbatches==='function')normalizeProductionUnbatches();
 if(typeof normalizeTrucks==='function')normalizeTrucks();
 if(typeof normalizeSkidReturns==='function')normalizeSkidReturns();
 if(typeof normalizeReports==='function')normalizeReports();
 if(typeof normalizeTripKm==='function')normalizeTripKm();
 if(typeof salesNormalizeWeightRates==='function')salesNormalizeWeightRates(); if(typeof normalizeDocuments==='function')normalizeDocuments(); if(typeof normalizeReceipts==='function')normalizeReceipts();
 if(typeof normalizeFinanceLedger==='function')normalizeFinanceLedger();
 if(typeof normalizeCommissions==='function')normalizeCommissions();
 if(typeof normalizeOrderLog==='function')normalizeOrderLog();
 if(typeof normalizeAuthLog==='function')normalizeAuthLog();
 /* Фигура без строки заказа не хранится — при запуске и на импорте тоже:
    старый браузер и старый файл приносят библиотеку прежних версий. */
 if(typeof salesPruneOrphanShapes==='function')salesPruneOrphanShapes();
}
/* Старт по частям, мс: чтение записей, сборка, нормализация (с пересевом и
   правками), запись дописанного, первая отрисовка — их показывает
   tools/perf-year.js (задание «База», этап 2). */
let storageBootMs=null;
async function boot(){
 let hadSavedState=false;const T=()=>performance.now(),t0=T(),ms={};
 try{
  await storageIdbOpen();
  const got=await storageIdbReadAll();ms.read=T()-t0;
  storageBaseFrom(got.records);storageRev=got.rev;storageBuildAtLoad=got.build;storageCopyAt=got.copyAt||'';storageBackupPresent=!!got.copyAt;storageTest=got.test===true;
  if(got.records.length){
   hadSavedState=true;const parsed=storageJoin(got.records);ms.join=T()-t0-ms.read;
   if(!Object.keys(parsed).some(k=>Object.prototype.hasOwnProperty.call(DEFAULT,k)))throw new Error('Expected a database object.');
   mergeState(parsed);
  }
 }
 catch(e){storageRecovery=true;storageLastError=storageIdb?'Stored data could not be read. The original has been preserved.':'This browser could not open the database. Open Glass Farm in a current Chrome, Edge, Firefox or Safari.';console.warn(storageLastError,e.message);}
 try{ if(typeof glassIdMarkApply==='function')glassIdMarkApply();normalizeDB(); }
 catch(e){storageRecovery=true;storageLastError='Stored data could not be normalised. The original has been preserved.';console.warn(storageLastError,e.message);DB=JSON.parse(JSON.stringify(DEFAULT));normalizeDB();}
 /* Пересев справочников. Идёт ПОСЛЕ первой нормализации (иначе сравнивать не с
    чем) и сам вызывает её повторно, чтобы заводские данные прошли те же правила,
    что и любые другие. Рабочие данные не трогаются — см. reseedReferenceTables. */
 if(typeof reseedReferenceTables==='function'&&reseedReferenceTables(hadSavedState))normalizeDB();
 /* Разовые правки данных — после пересева и отдельно от него: подъём версии
    справочников заменяет восемь таблиц целиком, правка меняет только то, что
    ещё стоит заводским. См. applyDataFixes в erp/data. */
 if(typeof applyDataFixes==='function'&&applyDataFixes())normalizeDB();
 /* B8: пустой список пользователей — не рабочее состояние прототипа. Засев
    идёт после нормализации, чтобы демо-записи прошли те же правила, и ровно
    один раз на браузер (см. seedDemoUsers в erp/data). */
 if(typeof seedDemoUsers==='function')seedDemoUsers();
 ms.normalize=T()-t0-(ms.read||0)-(ms.join||0);const tw=T();
 /* Новая сборка дописывает в базу то, что изменили нормализация, пересев и
    правки: новые графы со значением по умолчанию. Пишет вкладка-писатель и
    ставит свою версию главной; остальные допишут, когда станут писателем. */
 if(!storageRecovery&&storageWriter){
  touch();
  if(!storageBusy&&storageBuildAtLoad!==storageBuildId())storageIdbMetaPut('build',storageBuildId()).catch(e=>console.warn('Version mark was not written:',e.message));
 }
 ms.write=T()-tw;storageBootMs=ms;
}
storageStart();

/* ---------------------------------------------------------------------
   Печать чертежа на бумагу / в PDF.

   Никаких внешних библиотек: файл обязан открываться с диска. Чертёж уже
   является самодостаточным SVG, поэтому печать сводится к тому, чтобы на
   время печати показать ТОЛЬКО его. Отдельное окно не открываем — блокировщик
   всплывающих окон и режим file:// делают этот путь ненадёжным.
   --------------------------------------------------------------------- */
function printSheetHost(){
  var h=document.getElementById('printSheetHost');
  if(!h){h=document.createElement('div');h.id='printSheetHost';document.body.appendChild(h);}
  return h;
}
function printSheetCleanup(){
  document.body.classList.remove('printing');
  var h=document.getElementById('printSheetHost');if(h)h.innerHTML='';
}
/* Копия чертежа получает СВОИ идентификаторы. На странице в этот момент живёт
   ещё и превью с тем же <marker id="shpArr">, а браузер разрешает url(#id) по
   первому совпадению в документе — им оказывался скрытый превью-элемент, и на
   бумаге у цепочек размеров пропадали стрелки. */
/* Счётчик — для нескольких листов в одной печати: в одну миллисекунду
   Date.now() совпал бы, и стрелки всех листов брали бы маркер первого. */
var printSheetSeq=0;
function printSheetUniqueIds(svg){
  var n='pr'+Date.now().toString(36)+(++printSheetSeq).toString(36);
  return String(svg)
    /* Кавычки могут быть и одинарными: разметка чертежа собирается шаблонными
       строками, и там id пишется через '. Пока правило смотрело только на ",
       такие id оставались прежними, а ссылки url(#…) переименовывались — и на
       бумаге пропадали ровно те стрелки, чей маркер объявлен в шаблоне. */
    .replace(/id=(["'])([A-Za-z][\w-]*)\1/g,function(m,q,id){return 'id='+q+id+'-'+n+q;})
    .replace(/url\(#([A-Za-z][\w-]*)\)/g,function(m,id){return 'url(#'+id+'-'+n+')';});
}
/* Подготовка листа отделена от вызова печати: так её можно проверить тестом,
   не открывая системный диалог. */
function printSheetPrepare(svg,caption,after){
  /* Несколько чертежей (окно Drawings) — массив: каждый на своей странице. */
  var list=(Array.isArray(svg)?svg:[svg]).filter(Boolean);
  if(!list.length)return false;
  var h=printSheetHost();
  h.innerHTML=list.map(function(x){return '<div class="print-sheet">'+printSheetUniqueIds(x)+(caption?'<div class="print-caption">'+esc(caption)+'</div>':'')+'</div>';}).join('');
  document.body.classList.add('printing');
  /* Доводка выполняется ПОСЛЕ вставки: чертёж подгоняется под отведённое место
     по фактическому содержимому, а его можно измерить только в документе. */
  if(typeof after==='function')Array.prototype.forEach.call(h.querySelectorAll('.print-sheet'),function(el){try{after(el);}catch(e){}});
  return true;
}
/* svg — готовая разметка чертежа (или массив листов), caption — подпись под
   листом (что печатаем). */
function printSheet(svg,caption,after){
  if(!printSheetPrepare(svg,caption,after))return false;
  window.addEventListener('afterprint',printSheetCleanup,{once:true});
  /* Safari и часть сборок Chromium не шлют afterprint — подстраховываемся. */
  setTimeout(printSheetCleanup,60000);
  try{window.print();}catch(e){printSheetCleanup();return false;}
  return true;
}
window.addEventListener('resize',function(){if(typeof shapeFitPreview==='function')shapeFitPreview();});

/* Метка сборки в шапке: видно, та ли версия файла открыта. В dev-режиме
   (src/index.html) переменной нет — тогда метка просто не показывается. */
(function(){
  var el=document.getElementById('hdrBuild');
  if(el&&typeof ERP_BUILD!=='undefined')el.textContent='build '+ERP_BUILD;
})();
