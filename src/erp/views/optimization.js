/* =====================================================================
   view/optimization  ·  erp-1.0
   Мост к Perfect Cut. Протокол не выдумывается.
   IN : —
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function viewOptimization(){
 return `<div class="page-head"><div><h2>Perfect Cut bridge</h2><p>We are not building our own nesting engine. The ERP creates a production batch, Perfect Cut optimizes cutting, and the result returns to inventory and part tracking.</p></div><span class="pill warn">${ico('link','icon-inline')}connector not confirmed</span></div>
  <div class="card">
   <div class="section-title"><h3>Intended data flow</h3><span class="pill">concept · no invented protocol</span></div>
   <div class="bridge">
    <div class="bridge-node"><div class="bridge-ico">${ico('database')}</div><b>GLASS ERP</b><p>batch: material · size · qty · treatment · services</p></div>
    <div class="bridge-arrow">${ico('arrow')}</div>
    <div class="bridge-node"><div class="bridge-ico">${ico('link')}</div><b>Local bridge</b><p>role: move data between the cloud ERP and local Perfect Cut</p></div>
    <div class="bridge-arrow">${ico('arrow')}</div>
    <div class="bridge-node external"><div class="bridge-ico">${ico('optimize')}</div><b>Perfect Cut</b><p>sheet layouts · consumption · offcuts</p></div>
   </div>
   <div class="return-flow">↩ optimization result returns to ERP → Inventory + Production tracking</div>
  </div>
  <div class="dashboard-grid">
   <div class="card">
    <div class="section-title"><h3>Integration status</h3><span class="pill warn">blocked by missing input</span></div>
    <table><tbody>
     <tr><td style="width:210px">What is decided</td><td>Perfect Cut remains the optimizer; we are not building our own nesting engine.</td></tr>
     <tr><td>What is unknown</td><td class="mut">actual Spil ↔ Perfect Cut mechanism: direct DB, ODBC, connector, or file.</td></tr>
     <tr><td>What not to do now</td><td class="mut">invent an exchange format or simulate an API without confirmation.</td></tr>
     <tr><td>What returns to ERP</td><td class="mut">sheet layouts, actual consumption and offcuts — for Inventory and Production.</td></tr>
    </tbody></table>
    <div class="row"><button disabled>${ico('link','icon-inline')}Send batch</button></div>
   </div>
   <div class="card">
    <div class="section-title"><h3>Responsibility boundary</h3></div>
    <div class="phase-list">
     <div class="phase-item"><div class="phase-num">${ico('check')}</div><div><b>Perfect Cut</b><span>optimization + its own label printing</span></div></div>
     <div class="phase-item current"><div class="phase-num">${ico('factory')}</div><div><b>Our ERP</b><span>WIP, stations, breakage, remake, stock</span></div></div>
     <div class="phase-item"><div class="phase-num">${ico('link')}</div><div><b>Bridge</b><span>data transport between the two systems only</span></div></div>
    </div>
   </div>
  </div>`;
}
