/* Правки владельца 17.11.2026, Sales: Shape всегда открывается с чистого;
   подсказки «Shift+click — range» нет; колонка Notes и окно заметки; Priority
   ставит Due date рабочими днями, без Due date заказ не пишется. */
module.exports=async function({page,eq}){
 console.log('owner 2026-11-17 · sales');
 const t=await page(undefined,{width:1600,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));

 eq('Shape с чистого: открытые раньше панели, вкладка Cutout, Metric detail и место метки не переживают новый вход',await run(()=>{
  const id=oqOrder(oqCustomer({legalName:'Fresh Shape'}));salesOrderEdit(id);
  salesOrderConfigureShape(0);
  sWorkspaceTab='cutout';sSourceOpen=true;sManufacturingOpen=true;sManufacturingPlace={type:'hole'};sMuntinOpen=true;sLiteSplitOpen=true;sPrintMenu=true;sMetricDetail=true;shapeDimUi=false;sFeaturesOpen=true;sEdgeworkOpen=true;
  tab='sales';salesOrderEdit(id);salesOrderConfigureShape(0);
  const r=[sWorkspaceTab,sSourceOpen,sManufacturingOpen,sManufacturingPlace,sMuntinOpen,sLiteSplitOpen,sPrintMenu,sMetricDetail,shapeDimUi,sFeaturesOpen,sEdgeworkOpen,sView];
  sEdit=null;sDraft=null;salesBridge=null;tab='sales';salesDraftDrop(true);return r;
 }),['designer',false,false,null,false,false,false,false,true,false,false,'setup']);

 eq('«Shift+click — range» больше нигде не пишется',await run(()=>{
  tab='optimization';render();return document.body.textContent.includes('Shift+click');
 }),false);

 eq('Notes: колонка видна по умолчанию за Invoice; ячейка узкая (колонка 100 px, две строки) и полный текст в подсказке; клик и правый клик Note… — окно, Save пишет заметку',await run(()=>{
  localStorage.removeItem(salesListPrefsKey());salesListPrefs=null;
  const id=oqOrder(oqCustomer({legalName:'Note Co'}));salesDraftDrop(true);tab='sales';render();
  const heads=[...document.querySelectorAll('.sl-table thead th[data-col]')].map(th=>th.getAttribute('data-col'));
  const at=heads.indexOf('notes')===heads.indexOf('invoice')+1;
  document.querySelector('[data-order-note="'+id+'"]').click();
  const opened=!!document.querySelector('.sl-note-dialog');
  document.getElementById('salesNoteText').value='Call before delivery — gate code 4411, ask for Mike at the back door';
  salesNoteInput(document.getElementById('salesNoteText').value);document.querySelector('[data-note-save]').click();
  const o=salesRecord(id),cell=document.querySelector('[data-order-note="'+id+'"] .sl-note-text');
  const narrow=getComputedStyle(cell).maxWidth,title=cell.getAttribute('title')===o.notes;
  salesListMenu={kind:'context',id,x:10,y:10,w:220};render();const menu=[...document.querySelectorAll('.sl-ctx [data-menu]')].map(b=>b.getAttribute('data-menu')).includes('note');
  salesListMenu=null;render();
  return {at,opened,saved:o.notes,title,narrow,menu};
 }),{at:true,opened:true,saved:'Call before delivery — gate code 4411, ask for Mike at the back door',title:true,narrow:'100%',menu:true});

 eq('старые настройки списка: Notes включается один раз и встаёт за Invoice',await run(()=>{
  localStorage.setItem(salesListPrefsKey(),JSON.stringify({cols:[{k:'number',on:true},{k:'status',on:true},{k:'invoice',on:true},{k:'notes',on:false}],invoiceShown:true}));salesListPrefs=null;
  const p=salesListLoadPrefs(),cols=p.cols.map(c=>c.k),n=p.cols.find(c=>c.k==='notes');
  return [n.on,cols.indexOf('notes')===cols.indexOf('invoice')+1,p.notesShown];
 }),[true,true,true]);

 eq('Due date рабочими днями: пятница 20.11 — Normal вт 01.12, Rush ср 25.11, Critical пн 23.11; числа из Data → Setup',await run(()=>{
  const fri='2026-11-20T15:00:00',r=[salesDueDate('normal',fri),salesDueDate('rush',fri),salesDueDate('critical',fri)];
  DB.orderSetup.dueRushDays=5;const own=salesDueDate('rush',fri);DB.orderSetup.dueRushDays=3;
  return r.concat(own);
 }),['2026-12-01','2026-11-25','2026-11-23','2026-11-27']);

 eq('новый заказ — Due date сразу; Priority Rush ставит дату заново (руками поправленная тоже); Priority стоит перед Due date; без Due date Save отказывает',await run(()=>{
  tab='sales';salesOrderNew();render();const auto=soDraft.dueDate===salesDueDate('normal');
  soDraft.dueDate='2027-01-15';salesPriorityChange('rush');const rush=soDraft.dueDate===salesDueDate('rush');
  const labels=[...document.querySelectorAll('.so-head label')].map(l=>l.textContent.trim());
  const order=labels.indexOf('Priority')<labels.findIndex(x=>x.startsWith('Due Date'));
  soDraft.customerId=oqCustomer({legalName:'Due Co'}).id;soDraft.customerPo='PO-1';soDraft.dueDate='';
  soDraft.lines[0].width16=20*16;soDraft.lines[0].height16=20*16;
  salesOrderSave();const err=(document.getElementById('e_sales_order')||{}).textContent||'';
  salesDraftDrop(true);return {auto,rush,order,err};
 }),{auto:true,rush:true,order:true,err:'Enter the Due Date.'});

 eq('правки 17.11 Sales без ошибок страницы',t.errs,[]);await t.c.close();
};
