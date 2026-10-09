/* =====================================================================
   erp/nav  ·  erp-1.0
   Меню по доменам + маршрутизация вкладок + render().
   IN : tab / subtab
   OUT: DOM
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* Меню Glass Farm (владелец, 1 октября 2026): узкая полоса иконок с
   подписями, как в Figma. Сверху — работа офиса по ходу заказа, внизу —
   редкое. Заглушек «planned» нет. Раздел виден только по подсвеченной иконке:
   шапки и заголовка-повтора нет. На узком экране (планшет станции, телефон)
   то же меню — нижний таб-бар: первые пять пунктов и «More». */
const NAV=[
 {k:'sales', label:'Sales', icon:'sales'},
 {k:'optimization', label:'Optimize', title:'Optimization', icon:'optimize'},
 {k:'production', label:'Production', icon:'factory'},
 {k:'shipping', label:'Shipping', icon:'shipping'},
 {k:'finance', label:'Finance', icon:'finance'},
 {k:'customers', label:'Customers', icon:'users'},
 {k:'reports', label:'Reports', icon:'report'},
 {k:'masterdata', label:'Data', title:'Master Data', icon:'database', bottom:1},
 {k:'users', label:'Users', icon:'users', bottom:1},
 {k:'dashboard', label:'Overview', title:'System overview', icon:'home', bottom:1}
];
const NAV_TABBAR=5;
let tab='dashboard';
let navMoreOpen=false;
/* Светлая и тёмная тема (владелец, 1 октября 2026): переключает клик по
   логотипу, выбор помнит этот браузер. Чертежи и печать остаются светлыми. */
const THEME_KEY='glass_farm_theme';
function themeApply(dark){document.documentElement.setAttribute('data-theme',dark?'dark':'light');}
function toggleTheme(){const dark=document.documentElement.getAttribute('data-theme')!=='dark';themeApply(dark);try{localStorage.setItem(THEME_KEY,dark?'dark':'light');}catch(e){}}
try{themeApply(localStorage.getItem(THEME_KEY)==='dark');}catch(e){themeApply(false);}

function navItemHTML(n,i){
 const on=tab===n.k||(n.k==='sales'&&tab==='configurators');
 return `<button type="button" class="nav-item${on?' on':''}${i>=NAV_TABBAR?' nav-extra':''}" aria-current="${on?'page':'false'}" title="${n.title||n.label}" onclick="navGo('${n.k}')">${ico(n.icon)}<span>${n.label}</span></button>`;
}
function navToggleMore(){navMoreOpen=!navMoreOpen;renderNav();}
/* Доступ — галочки разделов в Users (владелец, 3 октября 2026: «видит / не
   видит»): раздела без галочки нет в меню, и он не открывается. Проверка
   одна — accessCan (erp/access). */
function renderNav(){
 const main=NAV.filter(n=>!n.bottom&&accessCan(n.k)),low=NAV.filter(n=>n.bottom&&accessCan(n.k));
 document.getElementById('side').innerHTML =
  `<button type="button" class="brand-mark" title="Glass Farm · light / dark" aria-label="Switch light or dark theme" onclick="toggleTheme()">GF</button>` +
  main.map((n,i)=>navItemHTML(n,i)).join('') +
  `<span class="nav-sp"></span>` +
  low.map((n,i)=>navItemHTML(n,main.length+i)).join('') +
  (typeof signinNavHTML==='function'?signinNavHTML():'') +
  `<button type="button" class="nav-item nav-more${navMoreOpen?' open':''}" aria-expanded="${navMoreOpen}" onclick="navToggleMore()">${ico('more')}<span>More</span></button>`;
}

/* Переход по меню. Модуль может придержать уход (заказ с несохранёнными
   правками спрашивает «сохранить?») — стражи в window.NAV_GUARDS; этот файл
   про заказы по-прежнему не знает. */
function navGo(k){
 if(!accessCan(k))return;
 const go=()=>{tab=k;subtab=null;navMoreOpen=false;render();};
 if((window.NAV_GUARDS||[]).some(g=>g(k,go)))return;
 go();
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
 /* Экран станции — без меню и шапки ERP (view/station). */
 document.body.classList.toggle('station-mode',tab==='station');
 /* Офис без входа — только экран «Who is working?» (erp/signin). */
 const gate=typeof signinNeeded==='function'&&signinNeeded();
 document.body.classList.toggle('signin-mode',gate);
 if(gate){document.getElementById('app').innerHTML=signinView();document.title='Sign in · Glass Farm';return;}
 if(typeof signinMarkOwner==='function'&&signinMarkOwner()===false)return;
 if(typeof authLogFlush==='function')authLogFlush();
 if(tab!=='station'&&!accessCan(tab)){const open=NAV.find(n=>accessCan(n.k));if(open){tab=open.k;subtab=null;}}
 /* Export / Import JSON — вся база целиком, это дело администратора (Users). */
 document.body.classList.toggle('no-admin',!accessCan(ACCESS_ADMIN));
 renderNav();
 document.getElementById('dirty').style.display=dirty?'inline-flex':'none';
 const meta={
  dashboard:['System overview','ERP map and current status'],
  reports:['Reports','Report builder'],
  users:['Users','Office and station sign-in'],
  customers:['Customers','Customer master, contacts and commercial terms'],
  sales:['Sales','Orders and commercial configuration'],
  configurators:['Configurators','Engineering Shape configurator'],
  optimization:['Optimization','Verification · batches · uncut lines'],
  shipping:['Shipping','Readiness · pickup · delivery · closeout'],
  production:['Production','Stations · work positions · operations · terminals'],
  masterdata:['Master Data','Glass catalog · supply points · hardware · database overview'],finance:['Finance','Customer receipts · deposits on account · order balances'],
  /* Вкладка станции — «ARRIS · Glass Farm», а не «Glass Farm · Glass Farm». */
  station:[typeof stationCode==='string'&&stationCode?stationCode:'Station','Station screen']
 }[tab]||['Glass Farm','Production system'];
 document.getElementById('hdr').textContent=meta[0];
 document.title=meta[0]+' · Glass Farm';
 document.getElementById('hdrSub').textContent=meta[1];
 document.getElementById('phaseChip').innerHTML=ico('activity','icon-inline')+'Phase 1 · foundation';
 const V={dashboard:viewDashboard,reports:typeof viewReports==='function'?viewReports:null,users:viewUsers,customers:viewCustomers,sales:viewSales,configurators:viewConfigurators,optimization:viewOptimization,shipping:viewShipping,production:viewProduction,masterdata:viewMasterData,finance:viewFinance,station:typeof viewStation==='function'?viewStation:null}[tab];
 /* Окна модулей (window.APP_OVERLAYS) — поверх любого раздела: вопрос
    «сохранить заказ?» может прийти и из редактора формы строки. */
 const focus=renderFocusKey();
 document.getElementById('app').innerHTML = (V ? V() : '<div class="empty">module planned</div>')+(window.APP_OVERLAYS||[]).map(f=>f()).join('');
 navHideRepeatedTitle(meta[0]);
 afterRender();
 renderFocusBack(focus);
}
/* Курсор переживает перерисовку: поле, где он стоял (или куда только что
   кликнули), ищется в новом #app по тому же виду и порядковому номеру и
   получает фокус обратно с той же кареткой. Не нашлось или поле было в
   окне, а окно закрылось, — фокус не трогаем. Проход 7.10.2026: после
   выбора клиента Tab из PO не попадал в дату. */
function renderFocusKey(){
 const a=document.activeElement,app=document.getElementById('app');
 if(!a||!app||!app.contains(a)||!/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))return null;
 const tag=a.tagName.toLowerCase(),data=[...a.attributes].map(x=>x.name).filter(n=>/^data-/.test(n)).map(n=>'['+n+']').join('');
 const css=el=>el.tagName.toLowerCase()+(el.id?'#'+CSS.escape(el.id):'')+[...el.classList].map(c=>'.'+CSS.escape(c)).join('');
 let sel=css(a)+(a.name?'[name="'+CSS.escape(a.name)+'"]':'')+data;
 /* Поле без класса и имени (Customer, PO) — по ближайшему блоку с классом. */
 if(sel===tag){const box=a.parentElement&&a.parentElement.closest('[class]');if(!box||box===app||!app.contains(box))return null;sel=css(box)+' '+tag;}
 const i=[...app.querySelectorAll(sel)].indexOf(a);if(i<0)return null;
 let start=null,end=null;try{start=a.selectionStart;end=a.selectionEnd;}catch(e){}
 return {sel,i,start,end,dialog:!!a.closest('[role="dialog"]')};
}
function renderFocusBack(k){
 if(!k)return;const app=document.getElementById('app'),el=app&&app.querySelectorAll(k.sel)[k.i];
 if(!el||el.disabled||document.activeElement===el||!!el.closest('[role="dialog"]')!==k.dialog)return;
 if(document.activeElement&&document.activeElement!==document.body&&app.contains(document.activeElement))return;
 el.focus({preventScroll:true});
 try{if(k.start!=null&&el.setSelectionRange)el.setSelectionRange(k.start,k.end);}catch(e){}
}
/* Заголовок раздела, который повторяет пункт меню («Sales» под иконкой Sales),
   не показываем. Конкретные заголовки — «Batch B-0001», «Sales Order 76002» —
   и кнопки в шапке страницы остаются. */
function navHideRepeatedTitle(section){
 const names=new Set([section].concat(NAV.map(n=>n.title||n.label),NAV.map(n=>n.label)).map(x=>String(x).trim().toLowerCase()));
 document.querySelectorAll('#app .page-head').forEach(head=>{
  const h=head.querySelector('h2');if(!h||!names.has(h.textContent.trim().toLowerCase()))return;
  head.classList.add('gf-title-repeat');
  const kids=[...head.children].filter(el=>!el.contains(h)&&!el.matches('.pill.info'));
  if(!kids.some(el=>el.textContent.trim()||el.querySelector('button,input,select')))head.classList.add('gf-head-empty');
 });
}
