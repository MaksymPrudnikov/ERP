/* Замечания владельца 04.11.2026 после этапа 6 (части 1 и 2): Freeze в меню
   колонки, шапка не уезжает, прочерк в пустой ячейке, Optimization не прыгает
   по вкладкам, Shipping → Backorders и Done — список как Sales с Order Items,
   Purchasing и Inventory — размер и вид Sales. */
module.exports=async function({page,eq}){
 console.log('table freeze');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Freeze Glass Ltd'});
  window.tfIds=[0,1,2].map(()=>{const id=oqOrder(c,{delivery:'pickup'});salesDraftDrop();return id;});
  oqThrough(tfIds[0],'done');oqThrough(tfIds[1],'batched');
 });

 eq('Freeze — значок в ряду Sort меню колонки: колонка встаёт слева, её ячейки и галочка стоят при прокрутке вбок (sticky, left по ширине), у заголовка значок; снятая встаёт на своё место',await t.p.evaluate(()=>{
  oqQueue('all');const k=salesListColumns()[3].k;
  document.querySelector(`[data-filter-col="${k}"]`).click();
  const pin=document.querySelector(`.sl-menu .sl-row [data-freeze="${k}"]`),inSort=!!pin&&!!pin.closest('.sl-row').querySelector('[data-sort]');pin.click();
  const table=document.querySelector('#app table.sl-table'),ths=[...table.tHead.rows[0].cells],first=ths[1].dataset.col;
  const row=table.tBodies[0].rows[0],pos=[0,1,2].map(i=>getComputedStyle(row.cells[i]).position);
  const left=parseFloat(getComputedStyle(row.cells[1]).left),lead=ths[0].getBoundingClientRect().width,icon=ths[1].classList.contains('sl-frz-col');
  salesListFreeze(k);const back=salesListColumns()[3].k,after=[...document.querySelector('#app table.sl-table').tHead.rows[0].cells].some(th=>th.classList.contains('sl-frz-col'));
  tab='dashboard';render();
  return {inSort,first:first===k,pos,left:Math.abs(left-lead)<1,icon,back:back===k,after};
 }),{inSort:true,first:true,pos:['sticky','sticky','static'],left:true,icon:true,back:true,after:false});

 eq('Freeze хранится у каждого списка своим (Optimization и Shipping → Done не делят), Standard view снимает',await t.p.evaluate(()=>{
  oqQueue('all');salesListFreeze('customer');const opt=salesListColumns()[0].k;
  oqQueue('done');const done=salesListColumns()[0].k;salesListFreeze('due');const doneNow=salesListColumns()[0].k;salesListStandardView();const reset=salesListLoadPrefs().frozen.length;
  oqQueue('all');const still=salesListColumns()[0].k;salesListFreeze('customer');tab='dashboard';render();
  return {opt,done:done!=='customer',doneNow,reset,still};
 }),{opt:'customer',done:true,doneNow:'due',reset:0,still:'customer'});

 eq('шапка списка не уезжает при прокрутке вниз: Sales, Optimization, Shipping, Purchasing, Inventory, Customers',await t.p.evaluate(()=>{
  const out={};const at=(name,go)=>{go();const th=document.querySelector('#app table.sl-table thead th');out[name]=!!th&&getComputedStyle(th).position;};
  at('sales',()=>{tab='sales';render();});at('optimization',()=>oqQueue('all'));at('done',()=>oqQueue('done'));
  at('purchasing',()=>navGo('purchasing'));at('inventory',()=>navGo('inventory'));at('customers',()=>navGo('customers'));
  tab='dashboard';render();return out;
 }),{sales:'sticky',optimization:'sticky',done:'sticky',purchasing:'sticky',inventory:'sticky',customers:'sticky'});

 eq('пустая ячейка списка — серый «–» на месте значения (вариант 1): пустота и длинное «—» становятся «–»; кнопки и поля не трогаются',await t.p.evaluate(()=>{
  oqQueue('all');const table=document.querySelector('#app table.sl-table'),ths=[...table.tHead.rows[0].cells],lead=ths.findIndex(th=>th.dataset.col);
  const cells=[...table.tBodies[0].rows].filter(r=>r.cells.length===ths.length).flatMap(r=>[...r.cells].slice(lead,-1));
  const blank=cells.filter(td=>!td.textContent.trim()&&!td.querySelector('input,button,select')).length,long=cells.filter(td=>td.textContent.trim()==='—').length;
  const dash=cells.find(td=>td.textContent.trim()==='–'),color=dash&&getComputedStyle(dash.firstElementChild).color===getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim();
  const box=document.createElement('table');box.className='sl-table';box.innerHTML='<thead><tr><th></th><th data-col="a"></th><th data-col="b"></th><th></th></tr></thead><tbody><tr><td></td><td></td><td><input></td><td></td></tr></tbody>';
  document.getElementById('app').appendChild(box);salesListTableFit(box);const own=[...box.tBodies[0].rows[0].cells].map(td=>td.textContent);box.remove();
  tab='dashboard';render();return {blank,long,dash:!!dash,own};
 }),{blank:0,long:0,dash:true,own:['','–','','']});

 eq('Optimization и Shipping: навигация — своя карточка над таблицей, вкладки на одном месте на всех вкладках, шапка таблицы одной высоты; Open — только правой кнопкой, пустой ряд кнопок спрятан',await t.p.evaluate(()=>{
  const keys=OPTIMIZATION_TABS.map(x=>x[0]).concat(SHIPPING_TABS.map(x=>x[0]));
  const pos=keys.map(k=>{oqQueue(k);const pill=document.querySelector('#app .sl-nav-card [data-queue-tab],#app .sl-nav-card [data-shipping-tab]'),th=document.querySelector('#app table.sl-table thead tr');return Math.round(pill.getBoundingClientRect().top)+'/'+Math.round(th.getBoundingClientRect().height);});
  oqQueue('all');const bar=document.querySelector('#app .sl-after-nav>.sales-toolbar'),open=!!document.querySelector('#app .sales-toolbar [data-queue-open-order]'),hidden=!!bar&&getComputedStyle(bar).display==='none';
  oqQueue('done');const lookup=!!document.querySelector('#app .sl-nav-card [data-order-lookup]');
  tab='dashboard';render();return {same:[...new Set(pos)].length,open,hidden,lookup};
 }),{same:1,open:false,hidden:true,lookup:true});

 eq('Optimization → Sheets: шестерёнка Columns в шапке таблицы слева, как на других вкладках',await t.p.evaluate(()=>{
  oqQueue('sheets');const th=document.querySelector('#app table.sl-table thead th');const r={first:!!th&&th.classList.contains('sl-check')&&!!th.querySelector('[data-columns-button]'),top:!!document.querySelector('#app .sales-toolbar [data-columns-button]')};
  tab='dashboard';render();return r;
 }),{first:true,top:false});

 eq('Shipping → Backorders: ячейки под своими заголовками (колонка шестерёнки в ширинах), есть Order Items — стекло остатка',await t.p.evaluate(()=>{
  const o=salesRecord(tfIds[2]);oqThrough(o.id,'ready');const units=shippingAvailable(o),m=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Site'},date:finToday(),items:units.slice(0,1).map(shippingItem),extras:[]});shippingMarkShipped(m.value.id);
  oqQueue('backorders');const table=document.querySelector('#app table.sl-table'),ths=[...table.tHead.rows[0].cells],row=table.tBodies[0].rows[0];
  const cols=table.querySelectorAll('colgroup col').length,aligned=ths.every((th,i)=>Math.abs(th.getBoundingClientRect().left-row.cells[i].getBoundingClientRect().left)<1&&Math.abs(th.getBoundingClientRect().width-row.cells[i].getBoundingClientRect().width)<1);
  const items=ths.findIndex(th=>th.dataset.col==='items'),text=items>0?row.cells[items].textContent:'';
  tab='dashboard';render();return {cols:cols===ths.length,aligned,head:items>0,text:/: \d/.test(text)};
 }),{cols:true,aligned:true,head:true,text:true});

 eq('Shipping → Done: список как Sales — ширины колонок (одна строка), Order Items по умолчанию; в Awaiting readiness её можно включить в Columns',await t.p.evaluate(()=>{
  oqQueue('done');const table=document.querySelector('#app table.sl-table'),heads=[...table.tHead.rows[0].cells].map(th=>th.dataset.col);
  const r={fixed:table.classList.contains('cw-fixed'),items:heads.includes('orderItems')};
  oqQueue('awaiting');r.awaiting=salesListColumns().some(c=>c.k==='orderItems');r.can=salesListCatalog().some(c=>c.k==='orderItems');
  oqQueue('all');r.opt=salesListCatalog().some(c=>c.k==='orderItems');tab='dashboard';render();return r;
 }),{fixed:true,items:true,awaiting:false,can:true,opt:false});

 eq('Purchasing и Inventory — размер Sales: таблетки 12 px высотой 28, статусы в том же ряду; склад входит в 1440 px без прокрутки вбок',await t.p.evaluate(()=>{
  const size=()=>{const p=document.querySelector('#app .sl-filter-row .sl-quick-pill');return p&&getComputedStyle(p).fontSize+'/'+Math.round(p.getBoundingClientRect().height);};
  tab='sales';render();const sales=size();navGo('purchasing');purGo('orders');const pur=size(),purRow=!!document.querySelector('#app .sl-filter-row [data-created-range]');
  navGo('inventory');invGo('sheets');const inv=size(),invRow=!!document.querySelector('#app .sl-filter-row [data-status-toggle]'),wrap=document.querySelector('#app .sales-table-wrap');
  const fits=wrap.firstElementChild.offsetWidth<=wrap.clientWidth+1;tab='dashboard';render();
  return {pur:pur===sales,purRow,inv:inv===sales,invRow,fits};
 }),{pur:true,purRow:true,inv:true,invRow:true,fits:true});
 eq('замечания 04.11: без ошибок страницы',t.errs,[]);await t.c.close();
};
