/* =====================================================================
   erp/storage  ·  erp-1.0
   localStorage, экспорт/импорт JSON, старт приложения.
   IN : —
   OUT: —
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function afterRender(){applyLang(document.body)}
function touch(){dirty=true; try{localStorage.setItem('glazing_system_v1',JSON.stringify(DB));}catch(e){}}
function doExport(){
 const b=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
 const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='glazing_system_data.json'; a.click();
 URL.revokeObjectURL(a.href); dirty=false; render();
}
function doImport(inp){
 const f=inp.files[0]; if(!f) return; const r=new FileReader();
 r.onload=()=>{ try{ mergeState(JSON.parse(r.result)); normalizeDB(); touch(); render(); }
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
