/* =====================================================================
   erp/nav  ·  erp-1.0
   Меню по доменам + маршрутизация вкладок + render().
   IN : tab / subtab
   OUT: DOM
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

const NAV=[
 {group:'Обзор'},
 {k:'dashboard', label:'Главная', icon:'home'},
 {group:'Ядро'},
 {k:'users', label:'Пользователи', icon:'users'},
 {group:'Операции'},
 {k:'customers', label:'Клиенты', icon:'users'},
 {k:'sales', label:'Продажи', icon:'sales'},
 {k:'configurators', label:'Конфигураторы', icon:'layers'},
 {k:'optimization', label:'Оптимизация', icon:'optimize'},
 {k:'production', label:'Производство', icon:'factory'},
 {group:'Домены — далее'},
 {k:'inventory', label:'Склад', icon:'inventory', soon:1},
 {k:'purchasing', label:'Закупки', icon:'purchase', soon:1},
 {k:'shipping', label:'Отгрузка', icon:'shipping', soon:1},
 {k:'finance', label:'Финансы', icon:'finance', soon:1}
];
let tab='dashboard';

function renderNav(){
 document.getElementById('side').innerHTML =
  `<div class="brand"><div class="brand-mark">${ico('layers')}</div><div class="brand-copy"><b>GLASS ERP</b><span>production system · bilingual concept</span></div></div>` +
  NAV.map(n=>{
   if(n.group) return `<div class="nav-group">${n.group}</div>`;
   if(n.soon) return `<div class="nav-item soon">${ico(n.icon)} <span>${n.label}</span><span class="nav-badge">план</span></div>`;
   return `<div class="nav-item ${tab===n.k?'on':''}" onclick="tab='${n.k}';subtab=null;render()">${ico(n.icon)} <span>${n.label}</span></div>`;
  }).join('') +
  `<div class="side-footer">Фаза 1 · Фундамент<br>Spil остаётся источником работы до прохождения контрольных фаз.</div>`;
}

let subtab=null;
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* ИСПРАВЛЕНО (авг 2026): данные, которые ввёл пользователь, переводчику не отдаём.
   applyLang ходит по ВСЕМ текстовым узлам, поэтому станция с названием «Закалка»
   в EN превращалась в «Tempering» — то есть RU/EN менял сами данные, а не интерфейс.
   raw() помечает узел атрибутом data-raw, и переводчик его пропускает.
   Для <option> тот же смысл даёт атрибут data-raw прямо на теге.

   Исключение — строки, которые засеяли МЫ (дефолтный каталог станций и уровней):
   их перевод остаётся, иначе в EN каталог по умолчанию был бы русским. Как только
   пользователь переименует запись — значение перестаёт совпадать с засеянным
   и дальше не переводится никогда. */
const SEED_TEXT=new Set([].concat(
 (DEFAULT.station||[]).map(s=>s.name), (DEFAULT.station||[]).map(s=>s.note),
 (DEFAULT.level||[]).map(l=>l.label)
).filter(Boolean));
const raw=s=>{s=String(s??'');
 /* засеянное значение оборачиваем в свой <span>: так оно становится отдельным
    текстовым узлом и попадает в словарь целиком, а не куском чужой фразы */
 return SEED_TEXT.has(s)?`<span>${esc(s)}</span>`:`<span data-raw>${esc(s)}</span>`;};
const fail=(el,m)=>{el.textContent=tx(m);el.style.display='block';};

function render(){
 renderNav();
 document.getElementById('dirty').style.display=dirty?'inline-flex':'none';
 const meta={
  dashboard:['Обзор системы','Карта ERP и текущий статус'],
  users:['Пользователи','Роли, станции и покрытие навыков'],
  customers:['Клиенты','Справочник клиентов, контакты и коммерческие условия'],
  sales:['Продажи','Заказы и коммерческая конфигурация'],
  configurators:['Конфигураторы','Инженерные конфигураторы Shape и Muntinbar'],
  optimization:['Оптимизация','Мост данных к Perfect Cut'],
  production:['Производство','Поток цеха, станции и уровни']
 }[tab]||['ERP Glazing System','Производственная система'];
 document.getElementById('hdr').textContent=meta[0];
 document.getElementById('hdrSub').textContent=meta[1];
 document.getElementById('phaseChip').innerHTML=ico('activity','icon-inline')+'Фаза 1 · фундамент';
 const V={dashboard:viewDashboard,users:viewUsers,customers:viewCustomers,sales:viewSales,configurators:viewConfigurators,optimization:viewOptimization,production:viewProduction}[tab];
 document.getElementById('app').innerHTML = V ? V() : '<div class="empty">модуль в плане</div>';
 afterRender();
}
