/* =====================================================================
   erp/storage  ·  erp-1.0
   localStorage, экспорт/импорт JSON, старт приложения.
   IN : —
   OUT: —
   Правило: файл не содержит бизнес-логику доменов; он вызывает их публичные
   normalize/validate hooks и отвечает только за безопасный вход→выход.
   ===================================================================== */

/* One browser database has one writer. Web Locks protects the entire write
   session; followers can review live data and explicitly take over. */
const STORAGE_KEY='glazing_system_v1',STORAGE_LOCK=STORAGE_KEY+'-writer';
const STORAGE_BACKUP_KEY=STORAGE_KEY+'-before-import';
let storageWriter=false,storageRelease=null,storageChannel=null,storageStarting=true;
let storageWarningShown=false,storageLastError='',storageLastSaved='',storageBaseline=null,storageDepth=0;
let storageRecovery=false,storageBackupAt='';
function storageInvalidate(){
 if(typeof stationRouteCache!=='undefined')stationRouteCache=new Map();
 if(typeof prodBoardCache!=='undefined')prodBoardCache={stamp:'',data:null};
 if(typeof stationAreaCache!=='undefined')stationAreaCache=new Map();
}
function storageCommand(fn){
 if(storageDepth){try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:e.message};}}
 if(!storageWriter||storageRecovery)return {ok:false,error:storageRecovery?'Restore or export the unreadable database before editing.':'Read only: activate editing in this tab first.'};
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
  storageLastError=storageRecovery?'The stored database needs recovery. Export it before editing.':'Read only: activate editing in this tab first.';
  if(storageBaseline&&!storageRecovery){DB=JSON.parse(storageBaseline);storageInvalidate();}
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
 try{
  const text=JSON.stringify(DB);localStorage.setItem(STORAGE_KEY,text);
  storageBaseline=text;storageLastSaved=new Date().toISOString();storageLastError='';storageWarningShown=false;dirty=true;storageInvalidate();return true;
 }catch(e){
  storageLastError='Not saved. Your operation is still open; retry or export your changes.';
  if(storageBaseline&&!storageRecovery){DB=JSON.parse(storageBaseline);storageInvalidate();}
  console.error('localStorage write failed:',e);
  if(!storageWarningShown){storageWarningShown=true;alert(storageLastError);}return false;
 }
}
function storageRead(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function storageStatusHTML(){
 const text=storageRecovery?'Database recovery needed':!navigator.locks?'Editing unavailable in this browser':storageLastError?'Not saved':storageWriter?'Editing here':'Read only · editing in another tab';
 return '<div class="storage-status'+(storageLastError||storageRecovery?' bad':'')+'" role="status"><span>'+esc(text)+'</span>'+
  (storageLastError?'<small>'+esc(storageLastError)+'</small>':'')+
  (storageLastSaved&&!storageLastError?'<small>Saved '+esc(new Date(storageLastSaved).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</small>':'')+
  (!storageWriter?'<button type="button" onclick="storageTakeControl()">Activate editing here</button>':'')+
  (storageRecovery?'<button type="button" onclick="storageExportRecovery()">Export original data</button>':'')+
  (storageRead(STORAGE_BACKUP_KEY)?'<button type="button" onclick="storageRestoreBackup()">Restore pre-import backup</button>':'')+'</div>';
}
function afterRender(){
 const host=document.getElementById('storageStatus');if(host)host.innerHTML=storageStatusHTML();
 /* Forms remain available for reading. Persisting controls explain the writer
    state; commands also check it, including calls made outside the DOM. */
 if(!storageWriter||storageRecovery){
  document.querySelectorAll('#app button[onclick],#app [data-station-scan]').forEach(el=>{
   if(el.hasAttribute('data-station-scan')||/\b(?:save\w*|\w*Save|\w*Create|stationSubmit|stationMark|stationUndoClick|finConfirmApply|finExportQuickBooks|del\w*|carrierSet)\s*\(/.test(el.getAttribute('onclick')||'')){
    el.disabled=true;el.title='Activate editing in this tab to change the database.';
   }
  });
 }
}
async function storageTakeControl(){
 if(storageWriter)return true;
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing. Open the file in a current browser.';render();return false;}
 if(storageChannel)storageChannel.postMessage({type:'release-writer'});
 return new Promise(resolve=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),4000);
  navigator.locks.request(STORAGE_LOCK,{signal:abort.signal},async lock=>{
   clearTimeout(timer);storageWriter=true;storageWarningShown=false;
   const text=localStorage.getItem(STORAGE_KEY);
   if(text&&text!==storageBaseline){if(!storageLiveReload(text)){storageRecovery=true;storageLastError='Stored data could not be read. Export the original and import a complete backup.';}storageBaseline=text;}
   if(!storageRecovery)storageLastError='';render();resolve(true);
   await new Promise(r=>storageRelease=r);
  }).catch(()=>{clearTimeout(timer);storageWriter=false;storageLastError='Editing is still open elsewhere. Save or discard any open draft in that tab, then try again.';render();resolve(false);});
 });
}
function storageStart(){
 try{storageChannel=new BroadcastChannel(STORAGE_LOCK);storageChannel.onmessage=e=>{
  if(e.data&&e.data.type==='release-writer'&&storageWriter){if(typeof salesDraftHasWork==='function'&&salesDraftHasWork()||typeof finHasWork==='function'&&finHasWork())return;storageWriter=false;if(storageRelease)storageRelease();storageRelease=null;render();}
 };}catch(e){}
 if(!navigator.locks){storageLastError='This browser cannot coordinate editing safely.';boot();storageStarting=false;render();return;}
 navigator.locks.request(STORAGE_LOCK,{ifAvailable:true},async lock=>{
  storageWriter=!!lock;boot();storageStarting=false;storageBaseline=storageRead(STORAGE_KEY);render();
  if(lock)await new Promise(r=>storageRelease=r);
 }).catch(e=>{storageLastError=e.message;storageWriter=false;storageStarting=false;render();});
}
window.addEventListener('pagehide',()=>{storageWriter=false;if(storageRelease)storageRelease();});
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
 if(typeof salesDraftHasWork!=='function'||!salesDraftHasWork()||typeof salesDraftDrop!=='function')return;
 salesDraftDrop(true);
});
function storageExportEnvelope(){return {format:'glass-erp',schemaVersion:1,exportedAt:new Date().toISOString(),data:DB};}
function storageDownload(name,text){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function doExport(){
 storageDownload('glazing_system_data.json',JSON.stringify(storageExportEnvelope(),null,2));
 storageBackupAt=new Date().toISOString();dirty=false;render();
}
function storageExportRecovery(){const text=localStorage.getItem(STORAGE_KEY)||'';storageDownload('glazing_system_recovery.json',text);}
function storageImportSummary(next){return ['customer','salesOrder','receipt','glassBatch','stationScan'].map(k=>k+': '+(DB[k]||[]).length+' → '+(next[k]||[]).length).join('\n');}
function storageImportState(raw){
 const payload=raw&&raw.format==='glass-erp'?raw.data:raw;
 if(!payload||!Array.isArray(payload.customer)||!Array.isArray(payload.salesOrder)||!Array.isArray(payload.station))throw new Error('Choose a complete GLASS ERP backup. A partial data file cannot replace this database.');
 const next=prepareImportedState(raw);
 if(!confirm('Replace this browser database?\n\n'+storageImportSummary(next)+'\n\nA recovery copy will be kept before replacement.'))return false;
 const old=JSON.stringify(DB);
 /* The backup is written and checked before the live key is touched. */
 const backup=JSON.stringify({format:'glass-erp',schemaVersion:1,exportedAt:new Date().toISOString(),data:JSON.parse(old)});
 const recovering=storageRecovery;
 if(recovering){storageDownload('glazing_system_recovery.json',localStorage.getItem(STORAGE_KEY)||'');storageRecovery=false;}
 const result=storageCommand(()=>{
  localStorage.setItem(STORAGE_BACKUP_KEY,backup);if(localStorage.getItem(STORAGE_BACKUP_KEY)!==backup)throw new Error('The recovery copy could not be verified.');
  DB=next;return true;
 });
 if(!result.ok){storageRecovery=recovering;alert(result.error);return false;}
 storageInvalidate();render();return true;
}
function storageRestoreBackup(){
 const raw=localStorage.getItem(STORAGE_BACKUP_KEY);if(!raw){alert('No pre-import recovery copy is available.');return false;}return storageImportState(JSON.parse(raw));
}
function doImport(inp){
 const f=inp.files[0];if(!f)return;
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
 if(typeof validateStickerPayload==='function')validateStickerPayload(src);
 if(typeof validateCuttingPayload==='function')validateCuttingPayload(src);
 if(typeof validateCutPlanPayload==='function')validateCutPlanPayload(src);
 if(typeof validateStockOffcutPayload==='function')validateStockOffcutPayload(src);
 if(typeof validateStationScanPayload==='function')validateStationScanPayload(src);
 if(typeof validateCarrierPayload==='function')validateCarrierPayload(src);
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
 (src.user||[]).forEach((u,i)=>{
  if(!u)return;if(u.skills!=null&&!Array.isArray(u.skills))throw new Error('User '+(i+1)+': skills must be an array.');
  if(u.role!=null&&!ROLES.includes(migrateRole(u.role)))throw new Error('User '+(i+1)+' has an unknown role.');
  (u.skills||[]).forEach((s,j)=>{const n=normSkill(s);if(!n)throw new Error('User '+(i+1)+', skill '+(j+1)+' is invalid.');});
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
  DB=JSON.parse(JSON.stringify(DEFAULT));mergeState(src);normalizeDB();
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
 if(typeof salesNormalizeWeightRates==='function')salesNormalizeWeightRates(); if(typeof normalizeDocuments==='function')normalizeDocuments(); if(typeof normalizeReceipts==='function')normalizeReceipts();
 if(typeof normalizeFinanceLedger==='function')normalizeFinanceLedger();
 /* Фигура без строки заказа не хранится — при запуске и на импорте тоже:
    старый браузер и старый файл приносят библиотеку прежних версий. */
 if(typeof salesPruneOrphanShapes==='function')salesPruneOrphanShapes();
}
function boot(){
 let hadSavedState=false;
 try{ const s=localStorage.getItem('glazing_system_v1'); if(s){ hadSavedState=true; const parsed=JSON.parse(s);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Object.keys(parsed).some(k=>Object.prototype.hasOwnProperty.call(DEFAULT,k)))throw new Error('Expected a database object.');mergeState(parsed); } }
 catch(e){storageRecovery=true;storageLastError='Stored data could not be read. The original has been preserved.';console.warn(storageLastError,e.message);}
 try{ normalizeDB(); }
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
