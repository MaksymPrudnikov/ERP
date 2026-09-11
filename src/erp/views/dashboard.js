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
 const sized=DB.station.filter(s=>s.sizeMeasured).length;
 const unsized=DB.station.length-sized;
 const moduleCount=3; // Sales / Optimization / Production в текущем прототипе
 const shapeCount=DB.shapeDef.length;
 return `<div class="page-head">
   <div><h2>Glass production — one system</h2>
   <p>The current ERP scope includes Customer Master, Draft Sales Orders with order-scoped Makeups, technical Shape and Muntin configuration, cutting optimization and shop-floor processing.</p></div>
   <span class="pill info">${ico('layers','icon-inline')}Architecture prototype</span>
  </div>

  <div class="kpi-grid">
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('factory')}</div><span class="pill ${unsized?'warn':'ok'}">${unsized?'measurements needed':'ready'}</span></div><div class="kpi-num">${DB.station.length}</div><div class="kpi-label">stations · ${sized} with a measured size</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('users')}</div><span class="pill info">core</span></div><div class="kpi-num">${DB.user.length}</div><div class="kpi-label">users in the prototype</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('shape')}</div><span class="pill info">Sales</span></div><div class="kpi-num">${shapeCount}</div><div class="kpi-label">Shape contours</div></div>
   <div class="kpi"><div class="kpi-top"><div class="kpi-icon">${ico('link')}</div><span class="pill warn">waiting for data</span></div><div class="kpi-num">${moduleCount}</div><div class="kpi-label">operational modules in the new shell</div></div>
  </div>

  <div class="dashboard-grid">
   <div class="card">
    <div class="section-title"><h3>ERP map</h3><span class="pill">green dot = screen already exists</span></div>
    <div class="sub">This is a visual map of data ownership by business domain. Perfect Cut remains an external optimizer, not part of the ERP.</div>
    <div class="domain-map">
      <div class="flow-row">
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('sales')}</div><b>Configuration</b><small>Shape · Muntin · drawings · cutting geometry</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node external"><span class="node-status"></span><div class="node-icon">${ico('optimize')}</div><b>Perfect Cut</b><small>external cutting optimization through the bridge</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('factory')}</div><b>Production</b><small>stations · work positions · operations · terminals</small></div>
       <div class="flow-arrow">${ico('arrow')}</div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('shipping')}</div><b>Shipping</b><small>racks · staging · delivery</small></div>
      </div>
      <div class="flow-split">
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('inventory')}</div><b>Inventory</b><small>materials · lots · stock · offcuts · movements</small></div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('purchase')}</div><b>Purchasing</b><small>suppliers · source · purchase cost · receiving</small></div>
       <div class="domain-node planned"><span class="node-status"></span><div class="node-icon">${ico('finance')}</div><b>Finance</b><small>actual cost · invoice · accounting integration</small></div>
       <div class="domain-node active"><span class="node-status"></span><div class="node-icon">${ico('users')}</div><b>Core</b><small>users · permissions · units · currencies · event log</small></div>
      </div>
    </div>
   </div>

   <div class="card">
    <div class="section-title"><h3>Roadmap</h3><span class="pill info">currently P1</span></div>
    <div class="phase-list">
     <div class="phase-item current"><div class="phase-num">1</div><div><b>Foundation</b><span>master data and domain shell</span><div class="progress"><span style="width:42%"></span></div></div></div>
     <div class="phase-item"><div class="phase-num">2</div><div><b>Product engineering</b><span>Shape revisions · Muntin · drawings · cutting geometry</span></div></div>
     <div class="phase-item"><div class="phase-num">3</div><div><b>Shop floor</b><span>Perfect Cut bridge · WIP · breakage · stock</span></div></div>
     <div class="phase-item"><div class="phase-num">4</div><div><b>Planning</b><span>capacity · batches · racks · delivery</span></div></div>
     <div class="phase-item"><div class="phase-num">5</div><div><b>Closeout</b><span>MRP · actual costing · BI</span></div></div>
    </div>
   </div>
  </div>

  <div class="card">
   <div class="section-title"><h3>What currently needs a decision, not design</h3><span class="pill warn">${ico('alert','icon-inline')}open questions</span></div>
   <div class="machine-grid">
    <div class="card-soft"><b>Perfect Cut ↔ ERP</b><div class="hint">Do not design the protocol until we have the actual Spil connector settings / R.O. SRL response.</div></div>
    <div class="card-soft"><b>Station sizes</b><div class="hint">${unsized} of ${DB.station.length} stations await measurement. The seeded 144 × 100″ is a sheet size, not a machine size, so the fit check rests on an assumption.</div></div>
    <div class="card-soft"><b>Three CNCs</b><div class="hint">Whether CNC1 / CNC2 / CNC3 share the same working field. If not, the route has to know which one is allowed.</div></div>
    <div class="card-soft"><b>Terminals</b><div class="hint">The screen behaviour is known; how many stand in the shop and which positions hang on each is not. We do not create invented rows here.</div></div>
    <div class="card-soft"><b>Permissions</b><div class="hint">The prototype has roles + work position so far. Field-level security and approval are not implemented yet.</div></div>
   </div>
  </div>`;
}
