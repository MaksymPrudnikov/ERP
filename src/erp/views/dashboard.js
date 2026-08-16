/* =====================================================================
   view/dashboard  ·  erp-1.0
   Карта ERP, KPI, дорожная карта, открытые вопросы.
   IN : DB
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function viewDashboard(){
 const assigned=DB.station.filter(s=>s.level!==null && s.level!=='').length;
 const unassigned=DB.station.length-assigned;
 const moduleCount=3; // Sales / Optimization / Production в текущем прототипе
 const shapeCount=DB.shapeDef.length;
 return `<div class="page-head">
   <div><h2>Стекольное производство — одна система</h2>
   <p>Не набор справочников, а сквозной поток: от конфигурации заказа и оптимизации раскроя до прохождения детали по цеху, складу и отгрузке.</p></div>
   <span class="pill info">${ico('layers','icon-inline')}Прототип архитектуры</span>
  </div>

  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('factory')}</div><span class="pill ${unassigned?'warn':'ok'}">${unassigned?'нужно назначить':'готово'}</span></div><div class="kpi-num">${DB.station.length}</div><div class="kpi-label">станций заведено · ${assigned} с уровнем потока</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('users')}</div><span class="pill info">ядро</span></div><div class="kpi-num">${DB.user.length}</div><div class="kpi-label">пользователей в прототипе</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('shape')}</div><span class="pill info">Sales</span></div><div class="kpi-num">${shapeCount}</div><div class="kpi-label">контуров Shape · ${DB.muntinDef.length} схем Muntin</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('link')}</div><span class="pill warn">ожидает данных</span></div><div class="kpi-num">${moduleCount}</div><div class="kpi-label">операционных модулей в новой оболочке</div></div>
  </div>

  <div class="dashboard-grid">
   <div class="card">
    <div class="section-title"><h3>Карта ERP</h3><span class="pill">зелёная точка = уже есть экран</span></div>
    <div class="sub">Это визуальная карта владения данными по бизнес-доменам. Perfect Cut остаётся внешним оптимизатором, а не частью ERP.</div>
    <div class="domain-map">
      <div class="flow-row">
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('sales')}</div><b>Продажи</b><small>заказ · Shape · Muntin · будущий pricing</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node external"><span class="node-status"></span><div class="node-icon">${ico('optimize')}</div><b>Perfect Cut</b><small>внешняя оптимизация раскроя через мост</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('factory')}</div><b>Производство</b><small>станции · маршруты · WIP · события</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('shipping')}</div><b>Отгрузка</b><small>стойки · комплектация · доставка</small></div>
      </div>
      <div class="flow-split">
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('inventory')}</div><b>Склад / Inventory</b><small>материалы · партии · остатки · обрезь · движения</small></div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('purchase')}</div><b>Закупки</b><small>поставщики · source · purchase cost · приёмка</small></div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('finance')}</div><b>Финансы</b><small>факт. себестоимость · invoice · интеграция бухгалтерии</small></div>
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('users')}</div><b>Ядро</b><small>пользователи · права · единицы · валюты · журнал событий</small></div>
      </div>
    </div>
   </div>

   <div class="card">
    <div class="section-title"><h3>Дорожная карта</h3><span class="pill info">сейчас Ф1</span></div>
    <div class="phase-list">
     <div class="phase-item current"><div class="phase-num">1</div><div><b>Фундамент</b><span>master-data и доменная оболочка</span><div class="progress"><span style="width:42%"></span></div></div></div>
     <div class="phase-item"><div class="phase-num">2</div><div><b>Заказ</b><span>клиенты · строки · услуги · ACK · чертёж</span></div></div>
     <div class="phase-item"><div class="phase-num">3</div><div><b>Цех</b><span>Perfect Cut bridge · WIP · бой · остатки</span></div></div>
     <div class="phase-item"><div class="phase-num">4</div><div><b>Планирование</b><span>мощности · партии · стойки · доставка</span></div></div>
     <div class="phase-item"><div class="phase-num">5</div><div><b>Замыкание</b><span>MRP · фактическая себестоимость · BI</span></div></div>
    </div>
   </div>
  </div>

  <div class="card">
   <div class="section-title"><h3>Что сейчас требует решения, а не дизайна</h3><span class="pill warn">${ico('alert','icon-inline')}открытые вопросы</span></div>
   <div class="machine-grid">
    <div class="card-soft"><b>Perfect Cut ↔ ERP</b><div class="hint">Не проектируем протокол до реальных настроек коннектора Spil / ответа R.O. SRL.</div></div>
    <div class="card-soft"><b>CNC1 и FURN1</b><div class="hint">Уровень потока не назначен. Это должен решить реальный технологический маршрут.</div></div>
    <div class="card-soft"><b>Станки</b><div class="hint">Нужен полный список: мойка, IGU line, автоклав, ламинация и другие реальные рабочие центры.</div></div>
    <div class="card-soft"><b>Права доступа</b><div class="hint">В прототипе пока роли + станция. Field-level security и approval ещё не реализованы.</div></div>
   </div>
  </div>`;
}
