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
 /* Справочники стоят в операциях, а не в «ядре»: заводит их не администратор
    раз в жизни, а продавец и снабженец по ходу работы — переименовать код,
    дописать поставщика, поправить цену листа. */
 {k:'masterdata', label:'Справочники', icon:'database'},
 {group:'Домены — далее'},
 {k:'inventory', label:'Склад', icon:'inventory', soon:1},
 {k:'purchasing', label:'Закупки', icon:'purchase', soon:1},
 {k:'shipping', label:'Отгрузка', icon:'shipping', soon:1},
 {k:'finance', label:'Финансы', icon:'finance', soon:1}
];
let tab='dashboard';
let sideCollapsed=false;
try{sideCollapsed=localStorage.getItem('glass_erp_sidebar_collapsed')==='1';}catch(e){}

function setSidebarCollapsed(value,rerender){
 sideCollapsed=!!value;
 try{localStorage.setItem('glass_erp_sidebar_collapsed',sideCollapsed?'1':'0');}catch(e){}
 if(rerender!==false)render();
}
function toggleSidebar(){setSidebarCollapsed(!sideCollapsed);}

function renderNav(){
 document.getElementById('side').innerHTML =
  `<div class="brand" title="GLASS ERP"><div class="brand-mark">${ico('layers')}</div><div class="brand-copy"><b>GLASS ERP</b><span>production system · bilingual concept</span></div></div>` +
  `<button type="button" class="side-toggle" aria-label="${sideCollapsed?'Expand menu':'Collapse menu'}" title="${sideCollapsed?'Expand menu':'Collapse menu'}" onclick="toggleSidebar()"><i>${sideCollapsed?'›':'‹'}</i><span>${sideCollapsed?'Expand menu':'Collapse menu'}</span></button>` +
  NAV.map(n=>{
   if(n.group) return `<div class="nav-group">${n.group}</div>`;
   if(n.soon) return `<div class="nav-item soon" title="${n.label} · план">${ico(n.icon)} <span>${n.label}</span><span class="nav-badge">план</span></div>`;
   return `<div class="nav-item ${tab===n.k?'on':''}" title="${n.label}" onclick="tab='${n.k}';subtab=null;render()">${ico(n.icon)} <span>${n.label}</span></div>`;
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

   Исключение — строки, которые засеяли МЫ (примечания к справочникам цеха):
   их перевод остаётся, иначе в EN каталог по умолчанию был бы русским. Как только
   пользователь перепишет примечание — значение перестаёт совпадать с засеянным
   и дальше не переводится никогда. */
/* Имён станций и рабочих мест здесь БОЛЬШЕ НЕТ, и это не пропуск. У них
   появилось поле nameEn: пользователь заполнил в CSV обе колонки, поэтому
   язык выбирает нужную, а не переводит содержимое базы словарём. В словаре
   остались только примечания — их пользователь написал в одном языке. */
const SEED_TEXT=new Set([].concat(
 (DEFAULT.station||[]).map(s=>s.note),
 (DEFAULT.workPosition||[]).map(w=>w.note),
 (DEFAULT.operation||[]).map(o=>o.note)
).filter(Boolean));
const raw=s=>{s=String(s??'');
 /* засеянное значение оборачиваем в свой <span>: так оно становится отдельным
    текстовым узлом и попадает в словарь целиком, а не куском чужой фразы */
 return SEED_TEXT.has(s)?`<span>${esc(s)}</span>`:`<span data-raw>${esc(s)}</span>`;};
const fail=(el,m)=>{el.textContent=tx(m);el.style.display='block';};

function render(){
 document.body.classList.toggle('shape-workspace-mode',tab==='configurators'&&typeof sEdit!=='undefined'&&sEdit!==null&&typeof sDraft!=='undefined'&&!!sDraft);
 document.body.classList.toggle('sidebar-collapsed',sideCollapsed);
 renderNav();
 document.getElementById('dirty').style.display=dirty?'inline-flex':'none';
 const meta={
  dashboard:['Обзор системы','Карта ERP и текущий статус'],
  users:['Пользователи','Роли, рабочие места и покрытие навыков'],
  customers:['Клиенты','Справочник клиентов, контакты и коммерческие условия'],
  sales:['Продажи','Заказы и коммерческая конфигурация'],
  configurators:['Конфигураторы','Инженерные конфигураторы Shape и Muntinbar'],
  optimization:['Оптимизация','Мост данных к Perfect Cut'],
  production:['Производство','Станции · рабочие места · операции · терминалы'],
  masterdata:['Справочники','Каталог стекла · точки поставки · фурнитура · обзор базы']
 }[tab]||['ERP Glazing System','Производственная система'];
 document.getElementById('hdr').textContent=meta[0];
 document.getElementById('hdrSub').textContent=meta[1];
 document.getElementById('phaseChip').innerHTML=ico('activity','icon-inline')+'Фаза 1 · фундамент';
 const V={dashboard:viewDashboard,users:viewUsers,customers:viewCustomers,sales:viewSales,configurators:viewConfigurators,optimization:viewOptimization,production:viewProduction,masterdata:viewMasterData}[tab];
 document.getElementById('app').innerHTML = V ? V() : '<div class="empty">модуль в плане</div>';
 afterRender();
}
