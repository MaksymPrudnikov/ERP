/* =====================================================================
   view/batch-drawings  ·  batch-drawings-1.0
   Чертежи батча на бумагу (Letter). Владелец, 4 октября 2026: на
   производстве ещё бумажные чертежи — у фигур и 8–19 мм всегда, у
   прямоугольных IGU нет; правила нет, что печатать — решает человек.
   «Каждое стекло — это стикер… значит к ней бумажка»: один лист на стекло,
   в порядке листов раскроя, в подвале батч, лист, Glass ID и лайт.
   Лист — тот же PRODUCTION DRAWING строки (stationDrawingOf, раз на строку).
   IN : задания стикеров батча (stkBatchJobs) · stationDrawingOf
   OUT: printSheet · журнал заказа
   ===================================================================== */
/* multi — в батче несколько стёкол: номер листа свой у каждого, поэтому
   на бумаге «6CLEAR · Sheet 1». */
function batchDrawingTag(number,j,multi){
 const lite=j.c&&glassBatchComponents(j.o,j.l).length>1?'Lite '+j.c.lite:'';
 return [number,j.sheet?stkSheetLabel(j.glass,j.sheet,multi&&!!j.glass):'',j.piece,lite].filter(Boolean).join(' · ');
}
/* Куски в сток чертежа не имеют. Строка, чей лист не строится, — в bad. */
function batchDrawingPages(number,jobs){
 const pages=[],bad=[],seen=new Map(),plan=typeof cutPlanFor==='function'?cutPlanFor(number):null,multi=!!plan&&plan.groups.length>1;
 (jobs||[]).forEach(j=>{
  if(j.type!=='production'||!j.o||!j.l)return;
  /* Стекло Recut со своим чертежом — лист Recut (erp/quality/recut). */
  /* Стекло ступенчатого юнита — свой лист (у лайта размером с форму — лист
     строки): «у каждого стекла свой лист», владелец 20.10.2026. */
  const rc=stationDrawRecut(j.o,j.l,j.unit),lite=j.c&&j.c.index!=null?j.c.index:null,k=j.o.id+'|'+j.l.id+'|'+(rc?rc.id:'')+'|'+(lite==null?'':lite);if(!seen.has(k))seen.set(k,stationDrawingOf(j.o,j.l,j.unit,lite));
  const d=seen.get(k);
  if(d&&d.html)pages.push({j,html:salesSheetFoot(d.html,batchDrawingTag(number,j,multi))});else bad.push(j.piece||'');
 });
 return {pages,bad};
}
function batchDrawingsPrint(number,jobs){
 const r=batchDrawingPages(number,jobs);if(!r.pages.length)return {printed:0,bad:r.bad};
 if(!printSheet(r.pages.map(x=>x.html),'',salesSheetFitDrawing))return {printed:0,bad:r.bad};
 if(typeof orderLogAdd==='function'){const by=new Map();r.pages.forEach(x=>by.set(x.j.o.id,(by.get(x.j.o.id)||0)+1));by.forEach((n,id)=>orderLogAdd(id,'Printed','Drawings · '+n+' · '+number));}
 return {printed:r.pages.length,bad:r.bad};
}
