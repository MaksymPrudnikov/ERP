/* =====================================================================
   erp/storage  ·  erp-1.0
   localStorage, экспорт/импорт JSON, старт приложения.
   IN : —
   OUT: —
   Правило: файл не содержит бизнес-логику доменов; он вызывает их публичные
   normalize/validate hooks и отвечает только за безопасный вход→выход.
   ===================================================================== */

/* One browser database has one writer. Web Locks protects the entire write
   session. The writer is the tab you are working in (owner, 2 October 2026):
   a tab takes over by itself when it is opened, shown, clicked, typed or
   scanned in. The other tab always gives way; its unsaved draft stays in its
   own memory and comes back, on top of the latest data, when you return. */
const STORAGE_KEY='glazing_system_v1',STORAGE_LOCK=STORAGE_KEY+'-writer';
const STORAGE_BACKUP_KEY=STORAGE_KEY+'-before-import';
let storageWriter=false,storageRelease=null,storageChannel=null,storageStarting=true;
let storageWarningShown=false,storageLastError='',storageLastSaved='',storageBaseline=null,storageDepth=0;
let storageRecovery=false,storageBackupAt='',storageTakeover=null,storageHandoffFailed=false;
/* The pre-import copy takes as much browser space as the database itself.
   It is kept for a week and dropped earlier when an ordinary save would
   otherwise fail for lack of space; a broken database keeps it untouched. */
const STORAGE_BACKUP_DAYS=7;
let storageBackupPresent=false,storageImporting=false;
function storageBackupCheck(){
 const raw=storageRead(STORAGE_BACKUP_KEY);storageBackupPresent=raw!==null;
 if(!raw||!storageWriter||storageRecovery)return;
 let at=NaN;try{at=Date.parse(JSON.parse(raw).exportedAt);}catch(e){}
 if(!(Date.now()-at<=STORAGE_BACKUP_DAYS*864e5))storageBackupDrop();
}
function storageBackupDrop(){try{localStorage.removeItem(STORAGE_BACKUP_KEY);storageBackupPresent=false;}catch(e){}}
function storageInvalidate(){
 if(typeof stationRouteCache!=='undefined')stationRouteCache=new Map();
 if(typeof prodBoardCache!=='undefined')prodBoardCache={stamp:'',data:null};
 if(typeof stationAreaCache!=='undefined')stationAreaCache=new Map();
 if(typeof glassCutCache!=='undefined')glassCutCache=null;
}
function storageCommand(fn){
 if(storageDepth){try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:e.message};}}
 if(!storageWriter||storageRecovery)return {ok:false,error:storageRecovery?'Restore or export the unreadable database before editing.':storageReadOnlyText()};
 const before=JSON.stringify(DB),wasDirty=dirty,draftBefore=typeof soDraft==='undefined'?null:JSON.stringify(soDraft);
 storageDepth++;
 try{
  const value=fn();if(value===false||value&&value.error)throw new Error(value&&value.error||'The operation could not be completed.');
  storageDepth--;if(touch()===false)throw new Error(storageLastError||'Not saved. Retry the operation.');
  return {ok:true,value};
 }catch(e){storageDepth=0;if(JSON.stringify(DB)!==before)DB=JSON.parse(before);dirty=wasDirty;if(draftBefore!==null&&JSON.stringify(soDraft)!==draftBefore)soDraft=JSON.parse(draftBefore);storageInvalidate();storageLastError=e.message;return {ok:false,error:e.message};}
}
function touch(){
 if(storageDepth)return true;
 if(!storageWriter||storageRecovery){
  if(storageStarting)return false;
  storageLastError=storageRecovery?'The stored database needs recovery. Export it before editing.':storageReadOnlyText();
  if(storageBaseline&&!storageRecovery){DB=JSON.parse(storageBaseline);storageInvalidate();}
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
 try{
  /* Журнал заказа: события по разнице с тем, что лежит в базе (erp/sales/order-log). */
  if(typeof orderLogCapture==='function')orderLogCapture();
  /* Счётчик номеров стёкол — раньше базы (erp/production/glass-batches). */
  if(typeof glassIdMarkSave==='function')glassIdMarkSave();
  const text=JSON.stringify(DB);
  try{localStorage.setItem(STORAGE_KEY,text);}
  catch(e){if(!storageBackupPresent||storageImporting)throw e;console.warn('Storage full: pre-import copy removed to keep saving.');storageBackupDrop();localStorage.setItem(STORAGE_KEY,text);}
  storageBaseline=text;if(typeof orderLogCommitted==='function')orderLogCommitted(text);storageLastSaved=new Date().toISOString();storageLastError='';storageWarningShown=false;dirty=true;storageInvalidate();return true;
 }catch(e){
  storageLastError='Not saved. Your operation is still open; retry or export your changes.';
  if(storageBaseline&&!storageRecovery){DB=JSON.parse(storageBaseline);storageInvalidate();}
  console.error('localStorage write failed:',e);
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
}
function storageRead(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function storageReadOnlyText(){return storageTakeover?'Switching editing to this tab — repeat the action in a moment.':'Glass Farm is busy in another tab. Click here to continue, or close the other tab.';}
/* Footer: a calm status line. Problems that stop the work go to the alert
   bar above the screen, which is visible on the station and tablet too. */
function storageStatusHTML(){
 const text=storageRecovery?'Database recovery needed':!navigator.locks?'Editing unavailable in this browser':storageLastError?'Not saved':storageWriter?'Editing here':'Editing in another tab';
 return '<div class="storage-status'+(storageLastError||storageRecovery?' bad':'')+'" role="status"><span>'+esc(text)+'</span>'+
  (storageLastSaved&&!storageLastError?'<small>Saved '+esc(new Date(storageLastSaved).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</small>':'')+
  (storageBackupPresent&&accessCan(ACCESS_ADMIN)?'<button type="button" onclick="storageRestoreBackup()">Restore pre-import backup</button>':'')+'</div>';
}
function storageAlertHTML(){
 const text=storageRecovery?'Database recovery needed. '+(storageLastError||''):!navigator.locks?'This browser cannot coordinate editing. Open Glass Farm in a current Chrome, Edge, Firefox or Safari.':storageLastError;
 if(!text)return '';
 return '<span>'+esc(text)+'</span>'+
  (!storageWriter&&!storageRecovery&&navigator.locks?'<button type="button" onclick="storageTakeControl()">Edit here</button>':'')+
  (storageRecovery?'<button type="button" onclick="storageExportRecovery()">Export original data</button>':'')+
  (storageRecovery&&storageBackupPresent?'<button type="button" onclick="storageRestoreBackup()">Restore pre-import backup</button>':'');
}
function afterRender(){
 const host=document.getElementById('storageStatus');if(host)host.innerHTML=storageStatusHTML();
 const alertBar=document.getElementById('storageAlert');if(alertBar){const h=storageAlertHTML();alertBar.innerHTML=h;alertBar.hidden=!h;}
 /* Forms remain available for reading. A tab that can take over keeps its
    buttons: the click itself makes it the writer. Without coordination or
    with a broken database, persisting controls are switched off. */
 if(storageRecovery||!navigator.locks){
  document.querySelectorAll('#app button[onclick],#app [data-station-scan]').forEach(el=>{
   if(el.hasAttribute('data-station-scan')||/\b(?:save\w*|\w*Save|\w*Create|stationSubmit|stationMark|stationUndoClick|finConfirmApply|finExportQuickBooks|del\w*|carrierSet)\s*\(/.test(el.getAttribute('onclick')||'')){
    el.disabled=true;el.title='Activate editing in this tab to change the database.';
   }
  });
 }
}
/* A redraw caused by another tab must not wipe what is typed: fields the
   user changed since the last draw keep their value, focus and caret. */
function storageRerender(){
 const app=document.getElementById('app'),changed=el=>el.tagName==='SELECT'?[...el.options].some(o=>o.selected!==o.defaultSelected):el.type==='checkbox'||el.type==='radio'?el.checked!==el.defaultChecked:el.type!=='file'&&el.value!==el.defaultValue;
 const keep=app?[...app.querySelectorAll('input[id],select[id],textarea[id]')].filter(changed).map(el=>({id:el.id,type:el.type,value:el.value,checked:el.checked})):[];
 const a=document.activeElement,focus=a&&a.id&&app&&app.contains(a)?{id:a.id,start:a.selectionStart,end:a.selectionEnd}:null;
 render();
 keep.forEach(k=>{const el=document.getElementById(k.id);if(!el||el.type!==k.type)return;if(k.type==='checkbox'||k.type==='radio')el.checked=k.checked;else el.value=k.value;});
 if(focus){const el=document.getElementById(focus.id);if(el&&document.activeElement!==el){el.focus();try{if(focus.start!=null)el.setSelectionRange(focus.start,focus.end);}catch(e){}}}
}
function storageTakeControl(){
 if(storageWriter)return Promise.resolve(true);
 if(storageTakeover)return storageTakeover;
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing. Open the file in a current browser.';render();return Promise.resolve(false);}
 if(storageChannel)storageChannel.postMessage({type:'release-writer'});
 storageTakeover=new Promise(resolve=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
  navigator.locks.request(STORAGE_LOCK,{signal:abort.signal},async lock=>{
   clearTimeout(timer);storageTakeover=null;storageWriter=true;storageWarningShown=false;storageHandoffFailed=false;
   /* The latest saved data first; this tab's open draft rides on top of it. */
   const text=localStorage.getItem(STORAGE_KEY);
   if(text&&text!==storageBaseline){if(!storageLiveReload(text)){storageRecovery=true;storageLastError='Stored data could not be read. Export the original and import a complete backup.';}storageBaseline=text;}
   if(!storageRecovery)storageLastError='';storageBackupCheck();storageRerender();resolve(true);
   await new Promise(r=>storageRelease=r);
  }).catch(()=>{clearTimeout(timer);storageTakeover=null;storageWriter=false;storageHandoffFailed=true;storageLastError='Glass Farm is still busy in another tab that does not answer. Close it, then click Edit here.';storageRerender();resolve(false);});
 });
 return storageTakeover;
}
/* Give the writer to the tab the user moved to — always, even with an
   unsaved order or payment here. A draft lives in this tab's memory; only
   the order's line shapes sit in the shared database before Update, so they
   are parked as saved and come back from memory when this tab returns. */
function storageYield(){
 if(!storageWriter)return;
 try{const parked=typeof salesDraftParkText==='function'?salesDraftParkText():null;if(parked){localStorage.setItem(STORAGE_KEY,parked);storageBaseline=parked;}}catch(e){console.warn('Draft shapes were not parked:',e.message);}
 storageWriter=false;if(storageRelease)storageRelease();storageRelease=null;storageRerender();
}
/* Run an action as the writer: a scan typed into a tab that is not the writer
   yet waits for the handoff instead of failing. */
function storageWhenWriter(fn){
 if(storageWriter||storageRecovery||!navigator.locks)return fn();
 storageTakeControl().then(()=>fn());
}
function storageWantControl(){if(!storageWriter&&!storageStarting&&!storageRecovery&&!storageTakeover&&navigator.locks)storageTakeControl();}
function storageStart(){
 try{storageChannel=new BroadcastChannel(STORAGE_LOCK);storageChannel.onmessage=e=>{
  if(e.data&&e.data.type==='release-writer'&&storageWriter)storageYield();
 };}catch(e){}
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing safely.';boot();storageStarting=false;render();return;}
 navigator.locks.request(STORAGE_LOCK,{ifAvailable:true},async lock=>{
  storageWriter=!!lock;boot();storageStarting=false;storageBaseline=storageRead(STORAGE_KEY);storageBackupCheck();render();
  /* A tab you just opened is where you work: it takes over at once. */
  if(!lock&&document.visibilityState==='visible'&&document.hasFocus())storageTakeControl();
  if(lock)await new Promise(r=>storageRelease=r);
 }).catch(e=>{storageLastError=e.message;storageWriter=false;storageStarting=false;render();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')storageWantControl();});
 window.addEventListener('focus',storageWantControl);
 document.addEventListener('pointerdown',storageWantControl,true);
 document.addEventListener('keydown',storageWantControl,true);
}
/* Черновик заказа живёт только в памяти: F5 или закрытие вкладки стирали его
   без предупреждения. Спрашиваем ровно тогда, когда есть что терять — иначе
   браузер показывал бы диалог на каждом уходе со страницы. */
window.addEventListener('beforeunload',function(e){
 if(typeof salesDraftHasWork!=='function'||!salesDraftHasWork())return;
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
function storageDownload(name,text){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
/* Вся база целиком — дело администратора (раздел Users, erp/access): Import
   заменяет и людей с их правами, Export отдаёт и Finance. */
function doExport(){
 if(!accessCan(ACCESS_ADMIN))return;
 storageDownload('glazing_system_data.json',JSON.stringify(storageExportEnvelope(),null,2));
 storageBackupAt=new Date().toISOString();dirty=false;render();
}
function storageExportRecovery(){const text=localStorage.getItem(STORAGE_KEY)||'';storageDownload('glazing_system_recovery.json',text);}
function storageImportSummary(next){return ['customer','salesOrder','receipt','glassBatch','stationScan'].map(k=>k+': '+(DB[k]||[]).length+' → '+(next[k]||[]).length).join('\n');}
/* Заменить базу — дело администратора (раздел Users, erp/access), чем бы
   ни вызвали: Import, Restore pre-import backup, восстановление (аудит
   3 октября 2026). Проверка здесь, а не только на кнопке, и уже после
   чтения файла. */
function storageImportState(raw){
 if(!accessCan(ACCESS_ADMIN)){alert('Users access needed to replace the database.');return false;}
 const payload=raw&&raw.format==='glass-erp'?raw.data:raw;
 if(!payload||!Array.isArray(payload.customer)||!Array.isArray(payload.salesOrder)||!Array.isArray(payload.station))throw new Error('Choose a complete GLASS ERP backup. A partial data file cannot replace this database.');
 const next=prepareImportedState(raw);
 if(!confirm('Replace this browser database?\n\n'+storageImportSummary(next)+'\n\nA recovery copy will be kept before replacement.'))return false;
 const old=JSON.stringify(DB);
 /* The backup is written and checked before the live key is touched. */
 const backup=JSON.stringify({format:'glass-erp',schemaVersion:1,exportedAt:new Date().toISOString(),data:JSON.parse(old)});
 const recovering=storageRecovery;
 if(recovering){storageDownload('glazing_system_recovery.json',localStorage.getItem(STORAGE_KEY)||'');storageRecovery=false;}
 storageImporting=true;
 const result=storageCommand(()=>{
  localStorage.setItem(STORAGE_BACKUP_KEY,backup);storageBackupPresent=true;if(localStorage.getItem(STORAGE_BACKUP_KEY)!==backup)throw new Error('The recovery copy could not be verified.');
  DB=next;return true;
 });
 storageImporting=false;storageBackupPresent=storageRead(STORAGE_BACKUP_KEY)!==null;
 if(!result.ok){storageRecovery=recovering;alert(result.error);return false;}
 storageInvalidate();render();return true;
}
function storageRestoreBackup(){
 const raw=localStorage.getItem(STORAGE_BACKUP_KEY);if(!raw){alert('No pre-import recovery copy is available.');return false;}return storageImportState(JSON.parse(raw));
}
function doImport(inp){
 const f=inp.files[0];if(!f)return;
 if(!accessCan(ACCESS_ADMIN)){inp.value='';return;}
 if(f.size>10*1024*1024){alert('File not readable: JSON exceeds 10 MB.');inp.value='';return;}
 const r=new FileReader();r.onload=()=>{try{storageImportState(JSON.parse(r.result));}catch(e){alert('File not readable: '+e.message);}};
 r.readAsText(f);inp.value='';
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
 if(typeof salesNormalizeWeightRates==='function')salesNormalizeWeightRates(); if(typeof normalizeDocuments==='function')normalizeDocuments(); if(typeof normalizeReceipts==='function')normalizeReceipts();
 if(typeof normalizeFinanceLedger==='function')normalizeFinanceLedger();
 if(typeof normalizeOrderLog==='function')normalizeOrderLog();
 if(typeof normalizeAuthLog==='function')normalizeAuthLog();
 /* Фигура без строки заказа не хранится — при запуске и на импорте тоже:
    старый браузер и старый файл приносят библиотеку прежних версий. */
 if(typeof salesPruneOrphanShapes==='function')salesPruneOrphanShapes();
}
function boot(){
 let hadSavedState=false;
 try{ const s=localStorage.getItem('glazing_system_v1'); if(s){ hadSavedState=true; const parsed=JSON.parse(s);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Object.keys(parsed).some(k=>Object.prototype.hasOwnProperty.call(DEFAULT,k)))throw new Error('Expected a database object.');mergeState(parsed); } }
 catch(e){storageRecovery=true;storageLastError='Stored data could not be read. The original has been preserved.';console.warn(storageLastError,e.message);}
 try{ if(typeof glassIdMarkApply==='function')glassIdMarkApply();normalizeDB(); }
 catch(e){storageRecovery=true;storageLastError='Stored data could not be normalised. The original has been preserved.';console.warn(storageLastError,e.message);DB=JSON.parse(JSON.stringify(DEFAULT));normalizeDB();}
 /* Пересев справочников. Идёт ПОСЛЕ первой нормализации (иначе сравнивать не с
    чем) и сам вызывает её повторно, чтобы заводские данные прошли те же правила,
    что и любые другие. Рабочие данные не трогаются — см. reseedReferenceTables. */
 if(typeof reseedReferenceTables==='function'&&reseedReferenceTables(hadSavedState)){ normalizeDB(); touch(); }
 /* Разовые правки данных — после пересева и отдельно от него: подъём версии
    справочников заменяет восемь таблиц целиком, правка меняет только то, что
    ещё стоит заводским. См. applyDataFixes в erp/data. */
 if(typeof applyDataFixes==='function'&&applyDataFixes()){ normalizeDB(); touch(); }
 /* B8: пустой список пользователей — не рабочее состояние прототипа. Засев
    идёт после нормализации, чтобы демо-записи прошли те же правила, и ровно
    один раз на браузер (см. seedDemoUsers в erp/data). */
 if(typeof seedDemoUsers==='function'&&seedDemoUsers())touch();
 render();
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
