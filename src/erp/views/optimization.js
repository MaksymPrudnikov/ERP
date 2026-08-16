/* =====================================================================
   view/optimization  ·  erp-1.0
   Мост к Perfect Cut. Протокол не выдумывается.
   IN : —
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function viewOptimization(){
 return `<div class="page-head"><div><h2>Мост к Perfect Cut</h2><p>Мы не пишем собственный nesting engine. ERP формирует производственный батч, Perfect Cut оптимизирует раскрой, результат возвращается в склад и трекинг деталей.</p></div><span class="pill warn">${ico('link','icon-inline')}коннектор не подтверждён</span></div>
  <div class="card">
   <div class="section-title"><h3>Как должен идти поток данных</h3><span class="pill">концепция · без выдуманного протокола</span></div>
   <div class="bridge">
    <div class="bridge-node"><div class="bridge-ico">${ico('database')}</div><b>GLASS ERP</b><p>батч: material · size · qty · treatment · services</p></div>
    <div class="bridge-arrow">${ico('arrow')}</div>
    <div class="bridge-node"><div class="bridge-ico">${ico('link')}</div><b>Локальный bridge</b><p>роль: передать данные между облачной ERP и локальным Perfect Cut</p></div>
    <div class="bridge-arrow">${ico('arrow')}</div>
    <div class="bridge-node external"><div class="bridge-ico">${ico('optimize')}</div><b>Perfect Cut</b><p>раскладка по листам · расход · обрезь</p></div>
   </div>
   <div class="return-flow">↩ результат оптимизации возвращается в ERP → Inventory + Production tracking</div>
  </div>
  <div class="dashboard-grid">
   <div class="card">
    <div class="section-title"><h3>Статус интеграции</h3><span class="pill warn">заблокировано входными данными</span></div>
    <table><tbody>
     <tr><td style="width:210px">Что уже решено</td><td>Perfect Cut остаётся оптимизатором; свой nesting engine не строим.</td></tr>
     <tr><td>Что неизвестно</td><td class="mut">реальный механизм Spil ↔ Perfect Cut: прямая БД, ODBC, коннектор или файл.</td></tr>
     <tr><td>Что не надо делать сейчас</td><td class="mut">придумывать формат обмена или имитировать API без подтверждения.</td></tr>
     <tr><td>Что вернётся в ERP</td><td class="mut">листовая раскладка, фактический расход и обрезь — для Inventory и Production.</td></tr>
    </tbody></table>
    <div class="row"><button disabled>${ico('link','icon-inline')}Отправить батч</button></div>
   </div>
   <div class="card">
    <div class="section-title"><h3>Граница ответственности</h3></div>
    <div class="phase-list">
     <div class="phase-item"><div class="phase-num">${ico('check')}</div><div><b>Perfect Cut</b><span>оптимизация + собственная печать этикеток</span></div></div>
     <div class="phase-item current"><div class="phase-num">${ico('factory')}</div><div><b>Наша ERP</b><span>WIP, станции, бой, повторный запуск, остатки</span></div></div>
     <div class="phase-item"><div class="phase-num">${ico('link')}</div><div><b>Bridge</b><span>только транспорт данных между двумя системами</span></div></div>
    </div>
   </div>
  </div>`;
}
