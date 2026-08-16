/* =====================================================================
   view/sales  ·  erp-1.0
   Оболочка домена Sales: карточки модулей Shape / Muntinbar.
   ===================================================================== */

function viewSales(){
 if(!['shape','muntin'].includes(subtab)) subtab='shape';   /* subtab общий на все домены — чужое значение сюда доезжать не должно */
 return `<div class="page-head"><div><h2>Конфигурация изделия</h2><p>Здесь подключены реальные модули из Glass Configurator v4.5: Smart-Shape / Advanced и shape-adaptive Muntin Production. Это уже не демонстрационные точки и не прямоугольная сетка.</p></div><span class="pill ok">${ico('check','icon-inline')}v4.5 logic</span></div>
  <div class="card">
   ${salesSkillCards()}
   ${subtab==='shape'?viewShapeSkill():viewMuntinSkill()}
  </div>`;
}
