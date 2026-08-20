/* =====================================================================
   view/configurators  ·  erp-1.0
   Отдельная оболочка инженерных конфигураторов Shape / Muntinbar.
   Внутренняя логика существующих модулей не меняется.
   ===================================================================== */

function viewConfigurators(){
 if(!['shape','muntin'].includes(subtab)) subtab='shape';
 /* При открытом редакторе не занимаем экран дополнительной шапкой —
    сохраняем прежнее поведение Sales-оболочки для Shape/Muntin. */
 var editing=(typeof sEdit!=='undefined'&&sEdit!==null)||(typeof mEdit!=='undefined'&&mEdit!==null);
 return `${editing?'':`<div class="page-head"><div><h2>Конфигураторы</h2><p>Инженерные инструменты Production Shape и Adaptive Muntin развиваются отдельно от коммерческого Sales. Их существующие данные и расчётные контракты сохраняются.</p></div><span class="pill ok">${ico('check','icon-inline')}schema v2</span></div>`}
  <div class="card">
   ${editing?'':salesSkillCards()}
   ${subtab==='shape'?viewShapeSkill():viewMuntinSkill()}
  </div>`;
}
