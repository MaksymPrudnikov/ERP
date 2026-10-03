/* Customers как везде (владелец, 3 октября 2026): таблица на движке Sales —
   воронки колонок, блок дат, без общего поиска и плиток; Balance и Last order
   видны сразу; действия — правой кнопкой, импорт / экспорт — в «⋯»; карточка
   General / Contacts / Addresses / Payment / Orders; заказы клиента и New
   order из карточки; предупреждение о дубле при создании. */
module.exports=async function({page,eq}){
 console.log('customers');
 const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.cuReset=function(){DB.customer=[];DB.salesOrder=[];soDraft=null;soEdit=null;cEdit=null;cDraft=null;cMenu=null;cDup=null;
   const p=salesListLoadPrefs();Object.keys(p.filters).forEach(k=>delete p.filters[k]);};
 });

 eq('список: без поиска и плиток; кнопка периода; воронка у каждой колонки; архивные скрыты фильтром Status',await t.p.evaluate(()=>{
  tab='customers';cuReset();
  const a=oqCustomer({legalName:'Northside Windows Ltd'}),b=oqCustomer({legalName:'Lakeview Glass Inc',onHold:true}),z=oqCustomer({legalName:'Old Archive Co',status:'archived'});
  salesListPrefs=null;salesQueuePrefs.customers=null;try{localStorage.removeItem('glass_erp_customers_list_v1');}catch(e){}
  render();
  const heads=[...document.querySelectorAll('.cust-table thead th')].map(th=>th.textContent.trim()).filter(Boolean);
  const funnels=document.querySelectorAll('.cust-table thead [data-filter-col]').length;
  return {search:!!document.getElementById('customerSearch'),kpi:document.querySelectorAll('.kpi').length,date:document.querySelector('[data-created-range]').textContent,heads,funnels,
   names:[...document.querySelectorAll('[data-customer-row]')].map(r=>r.children[2].textContent.trim()).sort(),archivedFilter:{mode:salesListLoadPrefs().filters.status.mode,values:salesListLoadPrefs().filters.status.values},chip:document.querySelector('[data-filter-chip="status"]').textContent.replace('×','').trim()};
 }),{search:false,kpi:0,date:'Created: All time▾',heads:['Account','Customer','Contact','Phone','Email','Terms','Credit limit','Balance','Last order','Status'],funnels:10,
  names:['Lakeview Glass Inc','Northside Windows Ltd'],archivedFilter:{mode:'exclude',values:['Archived']},chip:'Not · Status: Archived'});

 eq('Balance и Last order: остаток по заказам и дата последнего заказа (не квоты)',await t.p.evaluate(()=>{
  cuReset();const c=oqCustomer({legalName:'Money Co'});const id=oqOrder(c);salesDraftDrop();
  salesRecord(id).createdAt='2026-09-20T10:00:00Z';const q=oqOrder(c,{kind:'quote'});salesDraftDrop();salesRecord(q).createdAt='2026-09-30T10:00:00Z';touch();
  tab='customers';render();const row=document.querySelector(`[data-customer-row="${c.id}"]`),cell=k=>row.children[1+salesListColumns().findIndex(x=>x.k===k)].textContent.trim();
  return {last:cell('lastOrder'),balance:cell('balance')===finFmt(finCustomerMoney(c.id).balance),owes:finCustomerMoney(c.id).balance>0};
 }),{last:'Sep 20',balance:true,owes:true});

 eq('правая кнопка: Open / Duplicate / Archive / Delete; Delete выключен, если есть заказы; «⋯» — импорт и экспорт',await t.p.evaluate(()=>{
  const c=DB.customer[0],free=oqCustomer({legalName:'Free Co'});render();
  const menu=id=>{document.querySelector(`[data-customer-row="${id}"]`).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:200,clientY:200}));const r=[...document.querySelectorAll('[data-cust-menu]')].map(b=>b.textContent+(b.disabled?' ·off':''));custMenuClose();return r;};
  const used=menu(c.id),open=menu(free.id);
  document.querySelector('[data-customer-more]').click();const more=[...document.querySelectorAll('[data-cust-menu]')].map(b=>b.textContent);custMenuClose();
  return {used,open,more,rowButtons:[...document.querySelector(`[data-customer-row="${c.id}"] td:last-child`).querySelectorAll('button')].map(b=>b.textContent)};
 }),{used:['Open','Duplicate','Archive','Delete ·off'],open:['Open','Duplicate','Archive','Delete'],more:['Import / update…','Import and replace…','Export CSV','Export JSON'],rowButtons:['Open']});

 eq('карточка: General / Contacts / Addresses / Payment / Orders; Legacy IDs — только если заполнены; деньги — во вкладке Payment',await t.p.evaluate(()=>{
  const c=DB.customer.find(x=>x.legalName==='Money Co');customerEdit(c.id);
  const tabs=()=>[...document.querySelectorAll('.customer-tabs button')].map(b=>b.textContent);const plain=tabs();
  cTab='credit';render();const payment={tab:cTab,strip:!!document.querySelector('.fin-customer-strip'),credit:[...document.querySelectorAll('label')].some(l=>l.textContent.trim()==='Credit Days'),statements:[...document.querySelectorAll('label')].some(l=>/Statement Delivery/.test(l.textContent))};
  cDraft.legacyRefs.dcLink='7781';render();const withLegacy=tabs();cEdit=null;cDraft=null;render();
  customerNew();const fresh=tabs();cEdit=null;cDraft=null;render();
  return {plain,payment,withLegacy:withLegacy.includes('Legacy IDs'),fresh};
 }),{plain:['General','Contacts','Addresses','Payment','Orders'],payment:{tab:'payment',strip:true,credit:true,statements:true},withLegacy:true,fresh:['General','Contacts','Addresses','Payment']});

 eq('Orders в карточке: квоты и заказы клиента, новые сверху; строка открывает заказ в Sales; New order — с этим клиентом',await t.p.evaluate(()=>{
  const c=DB.customer.find(x=>x.legalName==='Money Co');tab='customers';customerEdit(c.id);cTab='orders';render();
  const rows=[...document.querySelectorAll('[data-customer-order]')].map(r=>r.children[1].textContent);
  const orderRow=[...document.querySelectorAll('[data-customer-order]')].find(r=>r.children[1].textContent==='Order'),first=orderRow.dataset.customerOrder;orderRow.click();
  const opened={tab,order:soDraft&&soDraft.id===first};salesDraftDrop();
  tab='customers';customerEdit(c.id);cTab='orders';render();document.querySelector('[data-customer-new-order]').click();
  const made={tab,customer:soDraft&&soDraft.customerId===c.id,quote:soDraft&&salesIsQuote(soDraft)};salesDraftDrop(true);render();
  return {rows,opened,made};
 }),{rows:['Quote','Order'],opened:{tab:'sales',order:true},made:{tab:'sales',customer:true,quote:false}});

 eq('дубль при создании: название без Inc / Ltd и точек, телефон по цифрам, email — окно; Back — форма остаётся; Save anyway — сохраняет',await t.p.evaluate(()=>{
  cuReset();const a=oqCustomer({legalName:'Northside Windows Ltd',contacts:[{name:'Ann',phone:'(416) 555-0101',email:'Ann@Northside.ca',isPrimary:true}]});tab='customers';render();
  const tryNew=fill=>{customerNew();fill(cDraft);saveCustomer();const d=document.querySelector('[data-customer-dup]');const r=d?d.querySelector('h3').textContent:'saved';return r;};
  const byName=tryNew(d=>{d.legalName='NORTHSIDE WINDOWS, INC.';});const back=(cDup=null,render(),{open:cEdit==='new',name:cDraft.legalName});cEdit=null;cDraft=null;
  const byPhone=tryNew(d=>{d.legalName='Other Name';d.contacts=[normalizeCustomerContact({name:'X',phone:'416-555-0101'})];});cDup=null;cEdit=null;cDraft=null;
  const byMail=tryNew(d=>{d.legalName='Third';d.contacts=[normalizeCustomerContact({name:'Y',email:'ann@northside.ca '})];});
  document.querySelector('[data-dup-save]').click();const saved=DB.customer.some(x=>x.legalName==='Third')&&cEdit===null;
  const clean=tryNew(d=>{d.legalName='Brand New Glass';});
  customerEdit(a.id);cDraft.notes='edit';saveCustomer();const editNoWarn=!document.querySelector('[data-customer-dup]')&&cEdit===null;
  return {byName,back,byPhone,byMail,saved,clean,editNoWarn};
 }),{byName:'Same name as an existing customer',back:{open:true,name:'NORTHSIDE WINDOWS, INC.'},byPhone:'Same phone as an existing customer',byMail:'Same email as an existing customer',saved:true,clean:'saved',editNoWarn:true});

 eq('Cancel с несохранёнными правками спрашивает; без правок — закрывает сразу',await t.p.evaluate(()=>{
  const c=DB.customer[0];customerEdit(c.id);const asked=[],cf=window.confirm;window.confirm=m=>{asked.push(m);return false;};
  customerLeave(()=>{cEdit=null;cDraft=null;});const unchanged={asked:asked.length,closed:cEdit===null};
  customerEdit(c.id);cDraft.notes='changed';customerLeave(()=>{cEdit=null;cDraft=null;});const changed={asked:asked.length,open:cEdit===c.id};
  window.confirm=cf;cEdit=null;cDraft=null;tab='dashboard';render();return {unchanged,changed};
 }),{unchanged:{asked:0,closed:true},changed:{asked:1,open:true}});
 eq('customers без ошибок страницы',t.errs,[]);
 await t.c.close();
};
