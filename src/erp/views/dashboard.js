/* =====================================================================
   view/dashboard  ·  erp-1.0
   Карта ERP, KPI, дорожная карта, открытые вопросы.
   IN : DB
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function viewDashboard(){
 /* Считаем не «станции с уровнем», а рабочие места без габарита: уровня
    больше нет — станция сама стала шагом маршрута, — а незамеренное поле это
    единственное, что сейчас держит `check_route_fits()` этапа 7·2. */
 /* Два РАЗНЫХ числа, и путать их нельзя: `sized` — у скольких габарит есть,
    `unsized` — сколько ждёт замера. Разница не сходится на ручных местах:
    у притупления руками габарита нет и не будет, оно не в долгу. */
 const sized=DB.workPosition.filter(w=>w.maxW!=null).length;
 const unsized=workPositionsAwaitingSize().length;
 const moduleCount=3; // Sales / Optimization / Production в текущем прототипе
 const shapeCount=DB.shapeDef.length;
 return `<div class="page-head">
   <div><h2>Стекольное производство — одна система</h2>
   <p>Текущий контур ERP: Customer Master, Draft Sales Orders с order-scoped Makeups, техническая конфигурация Shape и Muntin, оптимизация раскроя и прохождение детали по цеху.</p></div>
   <span class="pill info">${ico('layers','icon-inline')}Прототип архитектуры</span>
  </div>

  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('factory')}</div><span class="pill ${unsized?'warn':'ok'}">${unsized?'нужны замеры':'готово'}</span></div><div class="kpi-num">${DB.workPosition.length}</div><div class="kpi-label">рабочих мест · ${sized} с габаритом</div></div>
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
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('sales')}</div><b>Конфигурация</b><small>Shape · Muntin · чертежи · cutting geometry</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node external"><span class="node-status"></span><div class="node-icon">${ico('optimize')}</div><b>Perfect Cut</b><small>внешняя оптимизация раскроя через мост</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('factory')}</div><b>Производство</b><small>станции · рабочие места · операции · терминалы</small></div>
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
     <div class="phase-item"><div class="phase-num">2</div><div><b>Технология изделия</b><span>Shape revisions · Muntin · чертежи · cutting geometry</span></div></div>
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
    <div class="card-soft"><b>Габариты рабочих мест</b><div class="hint">${unsized} из ${DB.workPosition.length} рабочих мест ждут замеров. Без них не работает check_route_fits() — маршрут не знает, влезет ли деталь.</div></div>
    <div class="card-soft"><b>Три ЧПУ</b><div class="hint">Одинаковы ли CNC1 / CNC2 / CNC3 по рабочему полю. Если нет — маршрут обязан знать, на какой можно.</div></div>
    <div class="card-soft"><b>Терминалы</b><div class="hint">Поведение экрана известно, а сколько их в цеху и какие места висят на каждом — ещё нет. Выдуманные строки сюда не заводим.</div></div>
    <div class="card-soft"><b>Права доступа</b><div class="hint">В прототипе пока роли + рабочее место. Field-level security и approval ещё не реализованы.</div></div>
   </div>
  </div>`;
}
