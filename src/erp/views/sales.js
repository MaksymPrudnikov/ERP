/* =====================================================================
   view/sales  ·  erp-1.1
   Коммерческий Sales. Этап 2: только каркас Sales Orders / Configurations.
   Shape / Muntin вынесены в отдельный домен Configurators.
   ===================================================================== */

function viewSales(){
 if(!['orders','configurations'].includes(subtab)) subtab='orders';
 const cards=[
  {id:'orders',icon:'sales',title:'Заказы',desc:'Sales Orders · коммерческий заказ клиента',meta:'следующий этап · Draft Sales Order'},
  {id:'configurations',icon:'layers',title:'Конфигурации',desc:'Переиспользуемые конфигурации заказа и будущие Assembly Revisions',meta:'следующий этап · Configuration Library'}
 ];
 return `<div class="page-head"><div><h2>Продажи</h2><p>Коммерческий контур ERP отделён от инженерных конфигураторов. Здесь поэтапно появятся Sales Orders и библиотека конфигураций заказа.</p></div><span class="pill">этап 2</span></div>
  <div class="skill-card-grid sales-skill-grid">${cards.map(c=>`<button type="button" class="skill-card ${subtab===c.id?'active':''}" onclick="subtab='${c.id}';render()"><div class="skill-card-icon">${ico(c.icon)}</div><div class="skill-card-body"><b>${c.title}</b><small>${c.desc}</small><div class="skill-card-meta"><span class="pill ${subtab===c.id?'ok':'info'}">${c.meta}</span></div></div></button>`).join('')}</div>
  <div class="card">
   ${subtab==='orders'
    ?'<div class="empty">Раздел Sales Orders подготовлен. Draft Sales Order будет добавлен отдельным следующим этапом.</div>'
    :'<div class="empty">Раздел Configurations подготовлен. Configuration Library будет добавлена отдельным следующим этапом.</div>'}
  </div>`;
}
