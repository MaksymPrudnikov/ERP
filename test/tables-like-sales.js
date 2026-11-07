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
  /* Нажатие внутри таблицы — как мышью: сначала pointerdown (scope), потом click. */
  window.tlPress=el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.click();};
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
 eq('no browser errors',t.errs,[]);
 await t.c.close();
};
