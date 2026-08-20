/* =====================================================================
   erp/storage  ·  erp-1.0
   localStorage, экспорт/импорт JSON, старт приложения.
   IN : —
   OUT: —
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function afterRender(){applyLang(document.body)}
let storageWarningShown=false;
function touch(){
 dirty=true;
 try{localStorage.setItem('glazing_system_v1',JSON.stringify(DB));storageWarningShown=false;return true;}
 catch(e){console.error('localStorage не записан:',e);if(!storageWarningShown){storageWarningShown=true;alert('Не удалось сохранить данные в браузере. Сделай экспорт JSON и проверь свободное место.');}return false;}
}
function doExport(){
 const b=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
 const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='glazing_system_data.json'; a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000); dirty=false; render();
}
function doImport(inp){
 const f=inp.files[0]; if(!f) return; const r=new FileReader();
 if(f.size>10*1024*1024){alert('Файл не читается: размер JSON превышает 10 MB.');inp.value='';return;}
 r.onload=()=>{ try{ DB=prepareImportedState(JSON.parse(r.result));touch();render(); }
  catch(e){ alert('Файл не читается: '+e.message); } };
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
 if(!src||typeof src!=='object'||Array.isArray(src))throw new Error('ожидался объект экспортированного состояния');
 Object.keys(DEFAULT).forEach(k=>{if(Array.isArray(DEFAULT[k])&&Object.prototype.hasOwnProperty.call(src,k)&&!Array.isArray(src[k]))throw new Error('поле "'+k+'" должно быть массивом');});
 function unique(list,key,label,normalize){
  const seen=new Set();(Array.isArray(list)?list:[]).forEach((row,i)=>{
   if(!row||typeof row!=='object')return;
   const raw=row[key];if(raw==null||raw==='')return;
   const value=normalize?normalize(raw):String(raw);
   if(seen.has(value))throw new Error(label+' содержит дубликат "'+value+'"');seen.add(value);
  });
 }
 unique(src.level,'n','Уровни',v=>String(+v));
 unique(src.station,'code','Станции',v=>String(v).trim().toUpperCase());
 unique(src.shapeDef,'id','Shape');unique(src.muntinDef,'id','Muntin');
 const entityId=/^[A-Za-z0-9_-]{1,96}$/;
 (src.shapeDef||[]).forEach((s,i)=>{if(s&&s.id&&!entityId.test(String(s.id)))throw new Error('недопустимый id Shape в строке '+(i+1));});
 (src.shapeDef||[]).forEach((s,i)=>{
  if(!s||typeof s!=='object')return;
  if(s.type!=null&&!SHAPE_PRESETS.some(p=>p.id===s.type))throw new Error('неизвестный тип Shape в строке '+(i+1));
  if(s.features!=null&&!Array.isArray(s.features))throw new Error('features Shape в строке '+(i+1)+' должны быть массивом');
  if(s.polygon!=null&&!Array.isArray(s.polygon))throw new Error('polygon Shape в строке '+(i+1)+' должен быть массивом');
  if(s.edgeOps!=null&&(!s.edgeOps||typeof s.edgeOps!=='object'||Array.isArray(s.edgeOps)))throw new Error('edgeOps Shape в строке '+(i+1)+' должен быть объектом');
  const ids=new Set(),subId=/^[A-Za-z0-9:_-]{1,96}$/;(s.features||[]).forEach((f,j)=>{if(!f||!SHAPE_FEATURE_TYPES.includes(f.type))throw new Error('неизвестный feature Shape '+(i+1)+', строка '+(j+1));if(f.id&&!subId.test(String(f.id)))throw new Error('недопустимый id feature Shape '+(i+1));if(f.id&&ids.has(f.id))throw new Error('дубликат id feature Shape '+(i+1));if(f.id)ids.add(f.id);});
  Object.keys(s.edgeOps||{}).forEach(edgeId=>{if(!subId.test(edgeId)||!Array.isArray(s.edgeOps[edgeId]))throw new Error('некорректная обработка кромки Shape '+(i+1));s.edgeOps[edgeId].forEach(op=>{if(!op||!SHAPE_EDGE_OPS.includes(op.type))throw new Error('неизвестная операция кромки Shape '+(i+1));});});
 });
 (src.muntinDef||[]).forEach((m,i)=>{if(m&&m.id&&!entityId.test(String(m.id)))throw new Error('недопустимый id Muntin в строке '+(i+1));});
 (src.station||[]).forEach((s,i)=>{if(s&&s.code&&!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(String(s.code).trim().toUpperCase()))throw new Error('недопустимый код станции в строке '+(i+1));});
 (src.user||[]).forEach((u,i)=>{
  if(!u)return;if(u.skills!=null&&!Array.isArray(u.skills))throw new Error('skills пользователя '+(i+1)+' должен быть массивом');
  if(u.role!=null&&!ROLES.includes(u.role))throw new Error('неизвестная роль пользователя '+(i+1));
  (u.skills||[]).forEach((s,j)=>{const n=normSkill(s);if(!n)throw new Error('некорректный навык пользователя '+(i+1)+', строка '+(j+1));});
 });
}
function prepareImportedState(src){
 validateImportedState(src);
 const previous=DB;
 try{
  DB=JSON.parse(JSON.stringify(DEFAULT));mergeState(src);normalizeDB();
  const shapeIds=new Set(DB.shapeDef.map(s=>s.id));
  DB.muntinDef.forEach((m,i)=>{if(!shapeIds.has(m.shapeId))throw new Error('Muntin в строке '+(i+1)+' ссылается на отсутствующий Shape');});
  const next=DB;DB=previous;return next;
 }catch(e){DB=previous;throw e;}
}
function normalizeDB(){
 Object.keys(DEFAULT).forEach(k=>{ if(Array.isArray(DEFAULT[k])&&!Array.isArray(DB[k])) DB[k]=JSON.parse(JSON.stringify(DEFAULT[k])); });
 normalizeStations();
 normalizeUsers();
 normalizeSalesModules();
}
function boot(){
 try{ const s=localStorage.getItem('glazing_system_v1'); if(s) mergeState(JSON.parse(s)); }
 catch(e){ console.warn('localStorage не прочитан, стартуем с дефолтов:',e.message); }
 try{ normalizeDB(); }
 catch(e){ console.warn('данные не нормализуются, откат на дефолты:',e.message); DB=JSON.parse(JSON.stringify(DEFAULT)); normalizeDB(); }
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
