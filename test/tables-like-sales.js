/* Все таблицы как Sales (владелец 07.11.2026): фильтр, сортировка, ширина,
   порядок, ⚙ Columns — у таблиц на views/sl-generic; две таблицы на экране
   не мешают друг другу; быстрый фильтр в заголовке — нажал на название,
   набрал, Starts with; условие — в ▾ слева. */
module.exports=async function({page,eq}){
 console.log('tables like sales');const t=await page();
 await t.p.evaluate(()=>{
  window.tlTrucks=function(){DB.truck=[{id:'TR-1',name:'Bravo',note:'long body',active:true},{id:'TR-2',name:'Alpha',note:'',active:false},{id:'TR-3',name:'Charlie',note:'crane',active:true}];normalizeTrucks();
   ['mdTrucks','mdSetupCharges','mdSetupCards'].forEach(s=>{localStorage.removeItem('glass_erp_'+s+'_list_v1');delete salesQueuePrefs[s];});
   salesListMenu=null;salesListQuick=null;slScopePin='';navGo('masterdata');mdSetTab('trucks');render();};
  window.tlNames=()=>[...document.querySelectorAll('[data-sl-scope="mdTrucks"] tbody tr[data-truck-row]')].map(r=>r.querySelector('input').value);
  /* Нажатие внутри таблицы — как мышью: pointerdown (scope), pointerup, click. Без
     pointerup перенос колонки (col-widths) считал бы кнопку зажатой. */
  window.tlPress=el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));el.click();};
 });
 eq('Data › Trucks on the Sales engine: ⚙ Columns, filter ▾ on every column, sort Z → A, Note hidden from Columns, prefs of its own',await t.p.evaluate(()=>{
  tlTrucks();const w=document.querySelector('[data-sl-scope="mdTrucks"]');
  const heads=[...w.querySelectorAll('thead th[data-col]')].map(th=>th.dataset.col),gear=!!w.querySelector('[data-columns-button]'),grips=w.querySelectorAll('thead .cw-grip').length;
  tlPress(w.querySelector('th[data-col="name"] .sl-fbtn'));const menu=!!document.querySelector('[data-filter-menu="name"]');
  salesListSort('name','desc');const desc=tlNames();
  slScopePin='mdTrucks';const p=salesListLoadPrefs();p.cols.find(c=>c.k==='note').on=false;salesListSavePrefs();slScopePin='';render();
  const after=[...document.querySelectorAll('[data-sl-scope="mdTrucks"] thead th[data-col]')].map(th=>th.dataset.col);
  return {heads,gear,grips,menu,desc,after,saved:!!localStorage.getItem('glass_erp_mdTrucks_list_v1'),sales:!!localStorage.getItem('glass_erp_sales_list_v1')&&JSON.parse(localStorage.getItem('glass_erp_sales_list_v1')).sort&&JSON.parse(localStorage.getItem('glass_erp_sales_list_v1')).sort.k==='name'};
 }),{heads:['name','note','active'],gear:true,grips:3,menu:true,desc:['Charlie','Bravo','Alpha'],after:['name','active'],saved:true,sales:false});
 eq('two tables on one screen (Data › Setup): a filter in Cards stays in Cards, Charges keep all rows',await t.p.evaluate(()=>{
  tlTrucks();navGo('masterdata');mdSetTab('setup');render();
  const cards=()=>document.querySelectorAll('[data-sl-scope="mdSetupCards"] tbody tr[data-setup-card]').length,charges=()=>document.querySelectorAll('[data-sl-scope="mdSetupCharges"] tbody tr[data-sl-row]').length;
  const before=[cards(),charges()],name=orderSetup().cardNetworks[0].name;
  tlPress(document.querySelector('[data-sl-scope="mdSetupCards"] th[data-col="name"] .sl-fbtn'));
  salesListSetFilter('name',{mode:'include',conds:[{op:'equals',v:name,v2:'',join:'and'}],values:null,preset:''});
  const after=[cards(),charges()];slScopePin='mdSetupCards';salesListSetFilter('name',null);slScopePin='';
  return {more:before[0]>1,after,charges:before[1]};
 }),{more:true,after:[1,5],charges:5});
 eq('quick filter in the header: click the name → a field; typing filters Starts with; Enter shows the value; ▾ sits left of the name',await t.p.evaluate(async()=>{
  tlTrucks();const w=()=>document.querySelector('[data-sl-scope="mdTrucks"]');
  const th=w().querySelector('th[data-col="name"]'),left=th.querySelector('.sl-fbtn').getBoundingClientRect().left<th.querySelector('[data-cw-label]').getBoundingClientRect().left;
  tlPress(th.querySelector('[data-cw-label]'));const i=document.querySelector('.sl-qf'),focus=document.activeElement===i;
  i.value='br';i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,350));
  const typed=tlNames(),still=document.activeElement&&document.activeElement.classList.contains('sl-qf');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  const head=w().querySelector('th[data-col="name"] [data-cw-label]').textContent,on=w().querySelector('th[data-col="name"] .sl-fbtn').classList.contains('on');
  slScopePin='mdTrucks';const f=salesListLoadPrefs().filters.name;salesListSetFilter('name',null);slScopePin='';
  return {left,focus,typed,still,head,on,op:f.conds[0].op};
 }),{left:true,focus:true,typed:['Bravo'],still:true,head:'br…',on:true,op:'startsWith'});
 eq('Starts with works on numbers and dates; another condition from ▾ shows its sign in the header',await t.p.evaluate(()=>{
  const n=salesListCondTest('number',{op:'startsWith',v:'76'},76025),no=salesListCondTest('number',{op:'startsWith',v:'76'},176),d=salesListCondTest('date',{op:'startsWith',v:'2026-10'},'2026-10-22'),txt=salesListCondTest('date',{op:'startsWith',v:'Oct'},'2026-10-22');
  tlTrucks();slScopePin='mdTrucks';salesListSetFilter('name',{mode:'include',conds:[{op:'contains',v:'ar',v2:'',join:'and'}],values:null,preset:''});slScopePin='';
  const head=document.querySelector('[data-sl-scope="mdTrucks"] th[data-col="name"] [data-cw-label]').textContent,rows=tlNames();
  slScopePin='mdTrucks';salesListSetFilter('name',null);slScopePin='';
  return {n,no,d,txt,head,rows};
 }),{n:true,no:false,d:true,txt:true,head:'∗ ar',rows:['Charlie']});
 eq('converted screens open on the engine: Data, Production, Inventory, Users',await t.p.evaluate(()=>{
  const seen=[];const at=()=>[...document.querySelectorAll('[data-sl-scope]')].map(w=>w.dataset.slScope);
  [['trucks'],['ncr'],['stockreasons'],['carriers'],['setup'],['prices'],['stations'],['materials'],['hardware']].forEach(([k])=>{navGo('masterdata');mdSetTab(k);render();seen.push(...at());});
  navGo('inventory');invGo('sizes');seen.push(...at());invGo('consumables');seen.push(...at());
  navGo('users');subtab='office';render();seen.push(...at());subtab='production';render();seen.push(...at());
  return seen;
 }),['mdTrucks','mdNcrReasons','mdStockReasons','mdCarriers','mdSetupCharges','mdSetupCards','plGroups','mdStations','mdGlass','mdHwModels','mdHwKinds','invSizes','invConsumables','usersOffice','usersProduction']);
 eq('a ready-made table on the engine (slFromTable): header ▾ per column, checkbox column kept, buttons on the right, link rows stay under their row, filter by Amount',await t.p.evaluate(()=>{
  ['tlFrom'].forEach(s=>{localStorage.removeItem('glass_erp_'+s+'_list_v1');delete salesQueuePrefs[s];});
  const html=`<table class="x" data-tl-x><thead><tr><th></th><th>Item</th><th class="n">Amount</th><th></th></tr></thead><tbody>
   <tr data-r="a"><td><input type="checkbox"></td><td>Alpha</td><td class="n">$10.00</td><td><button>×</button></td></tr><tr class="lnk"><td colspan="4">↳ link a</td></tr>
   <tr data-r="b"><td><input type="checkbox"></td><td>Bravo</td><td class="n">$250.00</td><td><button>×</button></td></tr></tbody></table>`;
  const box=document.createElement('div');document.body.appendChild(box);
  const draw=()=>{box.innerHTML=slFromTable('tlFrom',html,{sub:'.lnk'});};draw();
  const heads=[...box.querySelectorAll('thead th[data-col]')].map(th=>th.textContent.trim()),btns=box.querySelectorAll('thead .sl-fbtn').length,wrap=!!box.querySelector('[data-tl-x]');
  const rows=()=>[...box.querySelectorAll('tbody tr')].map(r=>r.dataset.r||r.className.replace(/\s+/g,' ').trim());
  const before=rows(),check=!!box.querySelector('tr[data-r="a"] td.sl-check input'),btn=!!box.querySelector('tr[data-r="a"] .sl-row-acts button');
  slScopePin='tlFrom';salesListSetFilter(heads.length?salesListColumns()[1].k:'',{mode:'include',conds:[{op:'gt',v:'100',v2:'',join:'and'}],values:null,preset:''});draw();const after=rows();
  salesListSetFilter(salesListColumns()[1].k,null);slScopePin='';box.remove();
  return {heads,btns,wrap,before,check,btn,after};
 }),{heads:['Item','Amount'],btns:2,wrap:true,before:['a','lnk','b'],check:true,btn:true,after:['b']});
 eq('Sales: Columns has the order fields that were not on screen — Account, Contact, Currency, Picked up, Payment due, Days late, Hold reason, Notes',await t.p.evaluate(()=>SALES_LIST_COLUMNS.filter(c=>['account','contact','currency','billed','payDue','daysLate','holdReason','notes'].includes(c.k)).map(c=>c.label+(c.def?' on':''))),
  ['Account','Contact','Currency','Picked up','Payment due','Days late','Hold reason','Notes']);
 /* Настоящая мышь (08.11.2026, владелец: «выделяется, но не работает как быстрый
    поиск»): нажатие на заголовок начинает перенос колонки и захватывает
    указатель на th — клик приходит в ячейку, а не в название. Проверки выше
    кликали кодом и этого не видели; здесь — мышью Playwright. */
 const qfState=()=>t.p.evaluate(()=>({field:!!document.querySelector('.sl-qf'),focus:!!(document.activeElement&&document.activeElement.classList.contains('sl-qf'))}));
 await t.p.evaluate(()=>tlTrucks());
 await t.p.locator('[data-sl-scope="mdTrucks"] th[data-col="name"] [data-cw-label]').click();
 const opened=await qfState();
 await t.p.keyboard.type('ch');await t.p.waitForTimeout(400);
 const typed=await t.p.evaluate(()=>tlNames());
 await t.p.keyboard.press('Enter');
 const head=await t.p.evaluate(()=>document.querySelector('[data-sl-scope="mdTrucks"] th[data-col="name"] [data-cw-label]').textContent);
 await t.p.locator('[data-sl-scope="mdTrucks"] th[data-col="name"] [data-cw-label]').click();
 const again=await t.p.evaluate(()=>(document.querySelector('.sl-qf')||{}).value);
 await t.p.keyboard.press('Escape');
 const esc=await t.p.evaluate(()=>({field:!!document.querySelector('.sl-qf'),rows:tlNames()}));
 await t.p.evaluate(()=>{slScopePin='mdTrucks';salesListSetFilter('name',null);slScopePin='';});
 eq('real mouse · Data › Trucks: a click on the column name opens the field with the cursor in it, typing filters, Enter shows the value, a second click edits it, Escape closes',{opened,typed,head,again,esc},
  {opened:{field:true,focus:true},typed:['Charlie'],head:'ch…',again:'ch',esc:{field:false,rows:['Charlie']}});
 /* Sales: свой список без обёртки scope; двойной клик — то же поле. */
 await t.p.evaluate(()=>{
  const c1=normalizeCustomer({id:'CUS-QA',code:'QA',legalName:'Alpha Glass'}),c2=normalizeCustomer({id:'CUS-QB',code:'QB',legalName:'Bravo Windows'});DB.customer=[c1,c2];
  DB.salesOrder=[['SO-Q1','93001',c1.id],['SO-Q2','93002',c2.id]].map(([id,n,cid])=>normalizeSalesOrder({id,businessNumber:n,customerId:cid,customerPo:'PO-'+n,createdAt:new Date().toISOString(),lines:[]}));
  localStorage.removeItem(SALES_LIST_PREFS_KEY);salesListPrefs=null;salesStatusFilter='';soDraft=null;soEdit=null;tab='sales';salesShow={orders:true,quotes:false,ncr:false};salesQuickSet('all');
 });
 const salesRows=()=>t.p.evaluate(()=>[...document.querySelectorAll('tbody tr[data-order-row]')].map(r=>r.dataset.orderRow));
 await t.p.locator('th[data-col="customer"] [data-cw-label]').click();
 const sOpen=await qfState();await t.p.keyboard.type('bra');await t.p.waitForTimeout(400);
 const sRows=await salesRows();await t.p.keyboard.press('Enter');
 await t.p.locator('th[data-col="customer"] [data-cw-label]').dblclick();
 const sDbl=await qfState();await t.p.keyboard.press('Escape');
 await t.p.evaluate(()=>salesListSetFilter('customer',null));
 eq('real mouse · Sales: click on Customer opens the field, typing “bra” leaves Bravo Windows; a double click opens the same field',{sOpen,sRows,sDbl},{sOpen:{field:true,focus:true},sRows:['SO-Q2'],sDbl:{field:true,focus:true}});
 /* Перенос колонки и ширина мышью — поле не открывают; ▾ — меню, не поле. */
 const order=()=>t.p.evaluate(()=>[...document.querySelectorAll('thead th[data-col]')].map(th=>th.dataset.col).slice(0,3));
 const before=await order();
 const lab=await t.p.locator('th[data-col="customer"] [data-cw-label]').boundingBox(),num=await t.p.locator('th[data-col="number"]').boundingBox();
 await t.p.mouse.move(lab.x+lab.width/2,lab.y+lab.height/2);await t.p.mouse.down();await t.p.mouse.move(lab.x-20,lab.y+5,{steps:4});await t.p.mouse.move(num.x+2,num.y+num.height/2,{steps:6});await t.p.mouse.up();
 const moved={order:await order(),field:(await qfState()).field};
 const grip=await t.p.locator('th[data-col="customer"] .cw-grip').boundingBox();
 await t.p.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await t.p.mouse.down();await t.p.mouse.move(grip.x+40,grip.y+grip.height/2,{steps:5});await t.p.mouse.up();
 const resized=(await qfState()).field;
 await t.p.locator('th[data-col="customer"] .sl-fbtn').click();
 const menu=await t.p.evaluate(()=>({menu:!!document.querySelector('[data-filter-menu="customer"]'),field:!!document.querySelector('.sl-qf')}));
 await t.p.evaluate(()=>{salesListMenu=null;localStorage.removeItem(SALES_LIST_PREFS_KEY);salesListPrefs=null;render();});
 eq('real mouse · Sales: dragging the column moves it and opens no field, dragging the edge changes width and opens no field, ▾ opens the menu',{before,moved,resized,menu},
  {before:['number','customer','po'],moved:{order:['customer','number','po'],field:false},resized:false,menu:{menu:true,field:false}});
 /* Две таблицы на экране (Data › Setup): поле открывается в той, где нажали. */
 await t.p.evaluate(()=>{tlTrucks();navGo('masterdata');mdSetTab('setup');render();});
 await t.p.locator('[data-sl-scope="mdSetupCards"] th[data-col="name"] [data-cw-label]').click();
 const two=await t.p.evaluate(()=>{const i=document.querySelector('.sl-qf');return {scope:i&&i.closest('[data-sl-scope]').dataset.slScope,count:document.querySelectorAll('.sl-qf').length};});
 await t.p.keyboard.press('Escape');
 eq('real mouse · two tables on one screen (Data › Setup): the field opens in the table that was clicked',two,{scope:'mdSetupCards',count:1});
 eq('no browser errors',t.errs,[]);
 await t.c.close();
};
