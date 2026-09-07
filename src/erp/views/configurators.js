/* =====================================================================
   view/configurators  ·  erp-1.0
   Отдельная оболочка инженерных конфигураторов Shape.
   Внутренняя логика существующих модулей не меняется.
   ===================================================================== */

function viewConfigurators(){
 subtab='shape';
 /* При открытом редакторе не занимаем экран дополнительной шапкой —
    сохраняем прежнее поведение Sales-оболочки для Shape. */
 var editing=(typeof sEdit!=='undefined'&&sEdit!==null);
 return `${editing?'':`<div class="page-head"><div><h2>Конфигураторы</h2><p>Production Shape: геометрия, обработка и раскладка на общем чертеже изделия.</p></div><span class="pill ok">${ico('check','icon-inline')}schema v2</span></div>`}
  <div class="card">
   ${editing?'':salesSkillCards()}
   ${viewShapeSkill()}
  </div>`;
}
