/* =====================================================================
   erp/storage  ·  erp-1.0
   localStorage, экспорт/импорт JSON, старт приложения.
   IN : —
   OUT: —
   Правило: файл не содержит бизнес-логику доменов; он вызывает их публичные
   normalize/validate hooks и отвечает только за безопасный вход→выход.
   ===================================================================== */

function afterRender(){applyLang(document.body)}
let storageWarningShown=false;
function touch(){
 dirty=true;
 try{localStorage.setItem('glazing_system_v1',JSON.stringify(DB));storageWarningShown=false;return true;}
 catch(e){console.error('localStorage write failed:',e);if(!storageWarningShown){storageWarningShown=true;alert('Could not save to this browser. Export JSON and check free space.');}return false;}
}
/* Черновик заказа живёт только в памяти: F5 или закрытие вкладки стирали его
   без предупреждения. Спрашиваем ровно тогда, когда есть что терять — иначе
   браузер показывал бы диалог на каждом уходе со страницы. */
window.addEventListener('beforeunload',function(e){
 if(typeof salesDraftHasWork!=='function'||!salesDraftHasWork())return;
 e.preventDefault();e.returnValue='';return '';
});
function doExport(){
 const b=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
 const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='glazing_system_data.json'; a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000); dirty=false; render();
}
function doImport(inp){
 const f=inp.files[0]; if(!f) return; const r=new FileReader();
 if(f.size>10*1024*1024){alert('File not readable: JSON exceeds 10 MB.');inp.value='';return;}
 r.onload=()=>{ try{ DB=prepareImportedState(JSON.parse(r.result));touch();render(); }
  catch(e){ alert('File not readable: '+e.message); } };
 r.readAsText(f); inp.value='';
}
/* ИСПРАВЛЕНО (авг 2026). Раньше здесь был Object.assign(DB, JSON.parse(s)) —
   в DB попадало ЛЮБОЕ содержимое ключа, включая null вместо массива, и
   normalizeUsers() падал на .forEach. Результат: пустой белый экран без
   единого сообщения, и починить его можно было только через DevTools.
   Тот же ключ localStorage использовала предыдущая оболочка прототипа,
   так что чужая структура данных там вполне реальна. */
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
 if(typeof validateCustomersPayload==='function')validateCustomersPayload(src);
 if(typeof validateSalesPayload==='function')validateSalesPayload(src);
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
 unique(src.operation,'code','Operations',v=>String(v).trim().toLowerCase());
 unique(src.workPosition,'code','Work positions',v=>String(v).trim().toUpperCase());
 unique(src.terminal,'code','Terminals',v=>String(v).trim().toUpperCase());
 unique(src.shapeDef,'id','Shape');unique(src.muntinDef,'id','Muntin');
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
 (src.muntinDef||[]).forEach((m,i)=>{if(m&&m.id&&!entityId.test(String(m.id)))throw new Error('Muntin row '+(i+1)+' has an invalid id.');});
 (src.station||[]).forEach((s,i)=>{if(s&&s.code&&!SF_CODE_RE.test(String(s.code).trim().toUpperCase()))throw new Error('Station row '+(i+1)+' has an invalid code.');});
 (src.workPosition||[]).forEach((w,i)=>{
  if(!w)return;
  if(w.code&&!SF_CODE_RE.test(String(w.code).trim().toUpperCase()))throw new Error('Work position row '+(i+1)+' has an invalid code.');
  if(w.operations!=null&&!Array.isArray(w.operations))throw new Error('Work position row '+(i+1)+': operations must be an array.');
 });
 (src.operation||[]).forEach((o,i)=>{if(o&&o.code&&!SF_OP_CODE_RE.test(String(o.code).trim().toLowerCase()))throw new Error('Operation row '+(i+1)+' has an invalid code.');});
 (src.terminal||[]).forEach((t,i)=>{
  if(!t)return;
  if(t.code&&!SF_CODE_RE.test(String(t.code).trim().toUpperCase()))throw new Error('Terminal row '+(i+1)+' has an invalid code.');
  if(t.workPositions!=null&&!Array.isArray(t.workPositions))throw new Error('Terminal row '+(i+1)+': workPositions must be an array.');
 });
 (src.user||[]).forEach((u,i)=>{
  if(!u)return;if(u.skills!=null&&!Array.isArray(u.skills))throw new Error('User '+(i+1)+': skills must be an array.');
  if(u.role!=null&&!ROLES.includes(u.role))throw new Error('User '+(i+1)+' has an unknown role.');
  (u.skills||[]).forEach((s,j)=>{const n=normSkill(s);if(!n)throw new Error('User '+(i+1)+', skill '+(j+1)+' is invalid.');});
 });
}
function prepareImportedState(src){
 validateImportedState(src);
 const previous=DB, previousReseeded=referenceReseeded;
 try{
  DB=JSON.parse(JSON.stringify(DEFAULT));mergeState(src);normalizeDB();
  /* Пересев на импорте, а не только на старте. Версия справочников живёт В
     ДАННЫХ ровно затем, чтобы чужой файл со старым каталогом тоже пересеялся;
     до сих пор это срабатывало лишь при следующем F5, и всё это время на
     экране лежала прежняя модель цеха. Теперь — сразу. */
  if(typeof reseedReferenceTables==='function'&&reseedReferenceTables(true))normalizeDB();
  const shapeIds=new Set(DB.shapeDef.map(s=>s.id));
  DB.muntinDef.forEach((m,i)=>{if(!shapeIds.has(m.shapeId))throw new Error('Muntin row '+(i+1)+' references a missing Shape.');});
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
 if(typeof normalizeCustomers==='function')normalizeCustomers();
 if(typeof normalizeSalesData==='function')normalizeSalesData();
}
function boot(){
 let hadSavedState=false;
 try{ const s=localStorage.getItem('glazing_system_v1'); if(s){ hadSavedState=true; mergeState(JSON.parse(s)); } }
 catch(e){ console.warn('localStorage не прочитан, стартуем с дефолтов:',e.message); }
 try{ normalizeDB(); }
 catch(e){ console.warn('данные не нормализуются, откат на дефолты:',e.message); DB=JSON.parse(JSON.stringify(DEFAULT)); normalizeDB(); }
 /* Пересев справочников. Идёт ПОСЛЕ первой нормализации (иначе сравнивать не с
    чем) и сам вызывает её повторно, чтобы заводские данные прошли те же правила,
    что и любые другие. Рабочие данные не трогаются — см. reseedReferenceTables. */
 if(typeof reseedReferenceTables==='function'&&reseedReferenceTables(hadSavedState)){ normalizeDB(); touch(); }
 /* B8: пустой список пользователей — не рабочее состояние прототипа. Засев
    идёт после нормализации, чтобы демо-записи прошли те же правила, и ровно
    один раз на браузер (см. seedDemoUsers в erp/data). */
 if(typeof seedDemoUsers==='function'&&seedDemoUsers())touch();
 render();
}
boot();

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
function printSheetUniqueIds(svg){
  var n='pr'+Date.now().toString(36);
  return String(svg)
    .replace(/id="([A-Za-z][\w-]*)"/g,function(m,id){return 'id="'+id+'-'+n+'"';})
    .replace(/url\(#([A-Za-z][\w-]*)\)/g,function(m,id){return 'url(#'+id+'-'+n+')';});
}
/* Подготовка листа отделена от вызова печати: так её можно проверить тестом,
   не открывая системный диалог. */
function printSheetPrepare(svg,caption){
  if(!svg)return false;
  var h=printSheetHost();
  h.innerHTML='<div class="print-sheet">'+printSheetUniqueIds(svg)+(caption?'<div class="print-caption">'+esc(caption)+'</div>':'')+'</div>';
  document.body.classList.add('printing');
  return true;
}
/* svg — готовая разметка чертежа, caption — подпись под листом (что печатаем). */
function printSheet(svg,caption){
  if(!printSheetPrepare(svg,caption))return false;
  window.addEventListener('afterprint',printSheetCleanup,{once:true});
  /* Safari и часть сборок Chromium не шлют afterprint — подстраховываемся. */
  setTimeout(printSheetCleanup,60000);
  try{window.print();}catch(e){printSheetCleanup();return false;}
  return true;
}
window.addEventListener('resize',function(){if(typeof shapeFitPreview==='function')shapeFitPreview();});
