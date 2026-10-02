/* =====================================================================
   view/dashboard  ·  Overview
   Карта Glass Farm: путь заказа по разделам и справочники. Каждая карточка
   ведёт в свой раздел. Без статистики (владелец: цифры — в будущие отчёты),
   без дорожной карты и заглушек: прежний экран прототипа убран 2 октября 2026.
   IN : —
   OUT: html
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

const DASH_FLOW=[
 ['sales','sales','Sales','Quotes · orders · shapes · documents · stickers'],
 ['optimization','optimize','Optimize','Batches · cut layout · Maver / Disai files'],
 ['production','factory','Production','Stations · scans · recuts · NCR'],
 ['shipping','shipping','Shipping','Ready · pickup · delivery'],
 ['finance','finance','Finance','Receipts · balances · statements · QuickBooks']
];
const DASH_SETUP=[
 ['customers','users','Customers','Accounts · terms · contacts'],
 ['masterdata','database','Data','Glass catalog · stations · services · prices'],
 ['users','users','Users','Office passwords · sections · station PINs']
];
/* Раздел без галочки в Users остаётся на карте пути заказа, но не нажимается. */
function dashNode(n){
 return `<button type="button" class="domain-node active dash-go" data-dash-go="${n[0]}"${navAllowed(n[0])?'':' disabled'} onclick="navGo('${n[0]}')"><div class="node-icon">${ico(n[1])}</div><b>${n[2]}</b><small>${n[3]}</small></button>`;
}
function viewDashboard(){
 return `<div class="card dash-card">
   <div class="section-title"><h3>How an order moves</h3></div>
   <div class="domain-map"><div class="flow-row">${DASH_FLOW.map(dashNode).join(`<div class="flow-arrow">${ico('arrow')}</div>`)}</div></div>
  </div>
  <div class="card dash-card">
   <div class="section-title"><h3>Setup</h3></div>
   <div class="dash-setup">${DASH_SETUP.map(dashNode).join('')}</div>
  </div>
  <p class="dash-build">Glass Farm${typeof ERP_BUILD!=='undefined'?' · build '+esc(ERP_BUILD):''} · data lives in this browser — Export JSON keeps a copy.</p>`;
}
