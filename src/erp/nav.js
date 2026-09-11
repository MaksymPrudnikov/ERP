/* =====================================================================
   erp/nav  ·  erp-1.0
   Меню по доменам + маршрутизация вкладок + render().
   IN : tab / subtab
   OUT: DOM
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

const NAV=[
 {group:'Overview'},
 {k:'dashboard', label:'Dashboard', icon:'home'},
 {group:'Core'},
 {k:'users', label:'Users', icon:'users'},
 {group:'Operations'},
 {k:'customers', label:'Customers', icon:'users'},
 {k:'sales', label:'Sales', icon:'sales'},
 {k:'configurators', label:'Configurators', icon:'layers'},
 {k:'optimization', label:'Optimization', icon:'optimize'},
 {k:'production', label:'Production', icon:'factory'},
 /* Справочники стоят в операциях, а не в «ядре»: заводит их не администратор
    раз в жизни, а продавец и снабженец по ходу работы — переименовать код,
    дописать поставщика, поправить цену листа. */
 {k:'masterdata', label:'Master Data', icon:'database'},
 {group:'Domains — next'},
 {k:'inventory', label:'Inventory', icon:'inventory', soon:1},
 {k:'purchasing', label:'Purchasing', icon:'purchase', soon:1},
 {k:'shipping', label:'Shipping', icon:'shipping', soon:1},
 {k:'finance', label:'Finance', icon:'finance', soon:1}
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
  `<div class="brand" title="GLASS ERP"><div class="brand-mark">${ico('layers')}</div><div class="brand-copy"><b>GLASS ERP</b><span>production system · ERP prototype</span></div></div>` +
  `<button type="button" class="side-toggle" aria-label="${sideCollapsed?'Expand menu':'Collapse menu'}" title="${sideCollapsed?'Expand menu':'Collapse menu'}" onclick="toggleSidebar()"><i>${sideCollapsed?'›':'‹'}</i><span>${sideCollapsed?'Expand menu':'Collapse menu'}</span></button>` +
  NAV.map(n=>{
   if(n.group) return `<div class="nav-group">${n.group}</div>`;
   if(n.soon) return `<div class="nav-item soon" title="${n.label} · planned">${ico(n.icon)} <span>${n.label}</span><span class="nav-badge">planned</span></div>`;
   return `<div class="nav-item ${tab===n.k?'on':''}" title="${n.label}" onclick="tab='${n.k}';subtab=null;render()">${ico(n.icon)} <span>${n.label}</span></div>`;
  }).join('') +
  `<div class="side-footer">Phase 1 · Foundation<br>Spil remains the operational system until the control phases are passed.</div>`;
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
 (DEFAULT.serviceRate||[]).map(w=>w.note)
).filter(Boolean));
const raw=s=>{s=String(s??'');
 /* засеянное значение оборачиваем в свой <span>: так оно становится отдельным
    текстовым узлом и попадает в словарь целиком, а не куском чужой фразы */
 return SEED_TEXT.has(s)?`<span>${esc(s)}</span>`:`<span data-raw>${esc(s)}</span>`;};
const fail=(el,m)=>{el.textContent=m;el.style.display='block';};

function render(){
 document.body.classList.toggle('shape-workspace-mode',tab==='configurators'&&typeof sEdit!=='undefined'&&sEdit!==null&&typeof sDraft!=='undefined'&&!!sDraft);
 document.body.classList.toggle('sidebar-collapsed',sideCollapsed);
 renderNav();
 document.getElementById('dirty').style.display=dirty?'inline-flex':'none';
 const meta={
  dashboard:['System overview','ERP map and current status'],
  users:['Users','Roles, work positions and skill coverage'],
  customers:['Customers','Customer master, contacts and commercial terms'],
  sales:['Sales','Orders and commercial configuration'],
  configurators:['Configurators','Engineering Shape configurator'],
  optimization:['Optimization','Data bridge to Perfect Cut'],
  production:['Production','Stations · work positions · operations · terminals'],
  masterdata:['Master Data','Glass catalog · supply points · hardware · database overview']
 }[tab]||['ERP Glazing System','Production system'];
 document.getElementById('hdr').textContent=meta[0];
 document.getElementById('hdrSub').textContent=meta[1];
 document.getElementById('phaseChip').innerHTML=ico('activity','icon-inline')+'Phase 1 · foundation';
 const V={dashboard:viewDashboard,users:viewUsers,customers:viewCustomers,sales:viewSales,configurators:viewConfigurators,optimization:viewOptimization,production:viewProduction,masterdata:viewMasterData}[tab];
 document.getElementById('app').innerHTML = V ? V() : '<div class="empty">module planned</div>';
 afterRender();
}
