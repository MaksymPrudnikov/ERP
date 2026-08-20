/* =====================================================================
   view/sales  ·  erp-1.0
   Оболочка домена Sales: карточки модулей Shape / Muntinbar.
   ===================================================================== */

function viewSales(){
 if(!['shape','muntin'].includes(subtab)) subtab='shape';   /* subtab общий на все домены — чужое значение сюда доезжать не должно */
 /* Пока открыт редактор, шапка домена и карточки модулей только съедают высоту:
    чертёж из-за них уезжает под сгиб экрана. Возвращаются при закрытии. */
 var editing=(typeof sEdit!=='undefined'&&sEdit!==null)||(typeof mEdit!=='undefined'&&mEdit!==null);
 return `${editing?'':`<div class="page-head"><div><h2>Конфигурация изделия</h2><p>Shape теперь хранит finished geometry, физическую топологию, features и обработку кромок. Чертёж, cutting geometry и Muntin ссылаются на ту же ревизию.</p></div><span class="pill ok">${ico('check','icon-inline')}schema v2</span></div>`}
  <div class="card">
   ${editing?'':salesSkillCards()}
   ${subtab==='shape'?viewShapeSkill():viewMuntinSkill()}
  </div>`;
}
