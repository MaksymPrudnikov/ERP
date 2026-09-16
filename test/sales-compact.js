/* Компактный Sales и Hold позиции: реальные клики плюс правила записи. */
module.exports=async function({page,eq,ok}){
 console.log('compact Sales / line hold');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.scDay=n=>{const d=new Date();d.setDate(d.getDate()-n);return salesListDay(d);};
  window.scSeed=()=>{
   oqReset();salesLineHoldMenu=null;salesListPrefs=null;localStorage.removeItem(SALES_LIST_PREFS_KEY);const c=oqCustomer();
   [0,6,13,14,29,30].forEach((n,i)=>{const id=oqOrder(c,{businessNumber:String(88001+i),dueDate:'2020-01-01'});salesRecord(id).createdAt=new Date(scDay(n)+'T12:00:00').toISOString();if(i===0)oqThrough(id,'done');if(i===1)oqThrough(id,'verified');});
   soDraft=null;soEdit=null;tab='sales';render();
  };
  window.scRows=()=>[...document.querySelectorAll('[data-order-row]')].map(e=>salesRecord(e.dataset.orderRow).businessNumber);
  scSeed();
 });
 eq('Sales по умолчанию: последние 14 дней по createdAt, компактный All и скрытые настройки',await t.p.evaluate(()=>({rows:scRows(),date:document.querySelector('[data-created-range]').textContent.includes('Last 14 days'),closed:document.querySelector('[data-status-toggle]').getAttribute('aria-expanded'),hidden:!document.querySelector('[data-range-today],[data-range-reset],[data-show]'),gear:!!document.querySelector('thead [data-columns-button] svg')})),{rows:['88001','88002','88003'],date:true,closed:'false',hidden:true,gear:true});
 await t.p.locator('[data-created-range]').click();await t.p.locator('[data-range-preset="last7"]').click();await t.p.locator('[data-range-apply]').click();
 eq('7 дней включает сегодняшний и шестой предыдущий день',await t.p.evaluate(()=>scRows()),['88001','88002']);
 await t.p.locator('[data-created-range]').click();await t.p.locator('[data-range-preset="last30"]').click();await t.p.locator('[data-range-apply]').click();
 eq('30 дней включает 29-й предыдущий, но не 30-й; выбор сохраняется',await t.p.evaluate(()=>({rows:scRows(),saved:JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY)).filters.created.preset})),{rows:['88001','88002','88003','88004','88005'],saved:'last30'});
 const days=await t.p.evaluate(()=>[scDay(13),scDay(6)]);
 await t.p.locator('[data-created-range]').click();await t.p.locator('[data-range-from]').fill(days[0]);await t.p.locator('[data-range-to]').fill(days[1]);await t.p.locator('[data-range-apply]').click();
 eq('ручной период включает обе границы и отражается в фильтре той же колонки',await t.p.evaluate(()=>({rows:scRows(),active:document.querySelector('[data-filter-col="created"]').classList.contains('on'),noDuplicate:!document.querySelector('[data-filter-chip="created"]')})),{rows:['88002','88003'],active:true,noDuplicate:true});
 await t.p.locator('[data-created-range]').click();await t.p.locator('[data-range-from]').fill(days[1]);await t.p.locator('[data-range-to]').fill(days[0]);await t.p.locator('[data-range-apply]').click();
 eq('обратные границы не применяются и объясняются в окне',await t.p.evaluate(()=>({error:!!document.querySelector('[role="alert"]'),rows:scRows()})),{error:true,rows:['88002','88003']});
 await t.p.locator('[data-range-from]').fill('');await t.p.locator('[data-range-to]').fill(days[1]);await t.p.locator('[data-range-apply]').click();
 eq('пустое From задаёт включительную верхнюю границу без нижней',await t.p.evaluate(()=>scRows()),['88002','88003','88004','88005','88006']);
 await t.p.locator('[data-created-range]').click();await t.p.locator('[data-range-reset]').click();
 eq('↺ снимает только Created, не возвращает скрытый default при чтении настроек',await t.p.evaluate(()=>({rows:scRows().length,reset:salesListCleanPrefs(JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY))).filters.created===undefined,caption:document.querySelector('[data-created-range]').textContent.includes('All time')})),{rows:6,reset:true,caption:true});
 eq('Today находится внутри окна; дата читается в местном календарном дне',await t.p.evaluate(()=>{
  salesListOpenDate();salesListDateToday();const to=salesListMenu.to,today=salesListDay(new Date());salesListCloseMenu();return {to:to===today,local:salesListIsoDay(new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate(),0,1).toISOString())===today,hidden:!document.querySelector('[data-range-today]')};
 }),{to:true,local:true,hidden:true});
 await t.p.locator('[data-status-toggle]').click();await t.p.locator('[data-status-chip="order:verified"]').click();await t.p.locator('[data-status-toggle]').click();
 eq('сворачивание сохраняет выбранный этап и показывает его имя',await t.p.evaluate(()=>({rows:scRows(),label:document.querySelector('[data-status-toggle]').textContent.includes('Verified'),hidden:!document.querySelector('[data-status-chip]'),saved:JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY)).statusExpanded})),{rows:['88002'],label:true,hidden:true,saved:false});
 await t.p.evaluate(()=>{salesStatusFilter='';render();});
 await t.p.locator('[data-show-menu]').click();await t.p.locator('[data-show="quotes"]').check();await t.p.locator('[data-show="orders"]').uncheck();await t.p.keyboard.press('Escape');
 eq('Show — один контрол, Orders/Quotes выбираются внутри; нельзя скрыть оба вида',await t.p.evaluate(()=>({show:salesShow,label:document.querySelector('[data-show-menu]').textContent.trim(),saved:JSON.parse(localStorage.getItem('glass_erp_sales_show'))})),{show:{orders:false,quotes:true},label:'Quotes▾',saved:{orders:false,quotes:true}});
 await t.p.locator('[data-show-menu]').click();ok('единственный выбранный вид не снимается',await t.p.locator('[data-show="quotes"]').isDisabled());await t.p.keyboard.press('Escape');
 await t.p.evaluate(()=>{salesShow={orders:true,quotes:false};render();});await t.p.locator('[data-columns-button]').click();
 ok('шестерёнка открывает прежнее управление колонками',await t.p.locator('[aria-label="Columns"] [data-col-toggle="glass"]').count()===1);await t.p.keyboard.press('Escape');
 eq('выданная строка зелёная; выбор виден; On Hold имеет приоритет цвета',await t.p.evaluate(()=>{
  const o=DB.salesOrder[0],row=()=>document.querySelector(`[data-order-row="${o.id}"]`),color=()=>getComputedStyle(row().querySelector('td')).backgroundColor;
  const green=color();salesListSel.add(o.id);render();const selected=row().classList.contains('sl-row-sel');salesHoldApply([o.id],'Wait');const held=color();return {green,selected,held};
 }),{green:'rgb(236, 253, 243)',selected:true,held:'rgb(254, 228, 226)'});
 const id=await t.p.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer());soDraft.notes='Unsaved commercial note';return id;});
 const row=t.p.locator('[data-metrics-line-id]').nth(1);
 await row.click({button:'right'});await t.p.locator('[data-line-hold-action="hold"]').click();await t.p.locator('[data-line-hold-reason]').fill('Waiting for shape <img src=x onerror=alert(1)>');await t.p.locator('[data-line-hold-confirm]').click();
 eq('ПКМ ставит Hold конкретной позиции, не сохраняет чужие правки черновика и экранирует причину',await t.p.evaluate(id=>{
  const o=salesRecord(id);return {held:o.lines.map(l=>l.onHold),draft:soDraft.lines[1].onHold,notes:o.notes,unsaved:soDraft.notes,rows:document.querySelectorAll('.sales-line-on-hold').length,editable:!document.querySelector('.sales-line-on-hold').hasAttribute('inert'),markup:document.querySelectorAll('.sales-line-on-hold img').length};
 },id),{held:[false,true],draft:true,notes:'',unsaved:'Unsaved commercial note',rows:1,editable:true,markup:0});
 eq('Verify разрешён; батч забирает только свободную позицию, Ready закрыт до остальных',await t.p.evaluate(id=>{
  soDraft=null;soEdit=null;const verified=salesSetRecordStatus(id,'verified'),batched=salesSetRecordStatus(id,'batched'),o=salesRecord(id);return {verified,batched,locks:o.lines.map(salesLineLocked),holds:o.lines.map(l=>l.onHold),batchable:salesBatchableLines(o).length,repeat:salesSetRecordStatus(id,'batched'),ready:salesSetRecordStatus(id,'ready'),partial:salesStatusPill(o).includes('1/2 lines')};
 },id),{verified:true,batched:true,locks:[true,false],holds:[false,true],batchable:0,repeat:false,ready:false,partial:true});
 await t.p.reload();
 eq('Hold позиции переживает сохранение и перезагрузку',await t.p.evaluate(id=>{const o=salesRecord(id);return {hold:o.lines[1].onHold,reason:o.lines[1].holdReason,locked:salesLineLocked(o.lines[0])};},id),{hold:true,reason:'Waiting for shape <img src=x onerror=alert(1)>',locked:true});
 await t.p.evaluate(id=>{tab='sales';salesOrderEdit(id);},id);
 await t.p.locator('[data-metrics-line-id]').nth(1).focus();await t.p.keyboard.press('Shift+F10');
 ok('меню позиции доступно с клавиатуры и показывает причину как текст',await t.p.locator('[aria-label="Line actions"]').textContent().then(s=>s.includes('Waiting for shape <img')));
 await t.p.locator('[data-line-hold-action="release"]').click();
 eq('Release делает только ожидающую позицию доступной; повторный батч не меняет старый замок',await t.p.evaluate(id=>{
  const old=salesRecord(id).lines[0].batchNo,held=salesRecord(id).lines[1].onHold,run=salesSetRecordStatus(id,'batched'),o=salesRecord(id);return {held,run,first:o.lines[0].batchNo===old,second:o.lines[1].batchNo!==old,all:o.lines.every(salesLineLocked)};
 },id),{held:false,run:true,first:true,second:true,all:true});
 eq('нельзя поставить Hold запущенной позиции или закрытого заказа',await t.p.evaluate(id=>{const o=salesRecord(id),first=salesLineHoldSet(id,[o.lines[0].id],true,'Wait');o.status='closed';soDraft.status='closed';return {first,closed:salesLineHoldSet(id,[o.lines[1].id],true,'Wait')};},id),{first:false,closed:false});
 await require('./optimization-fixture')(t.p);
 eq('восстановленный заказ со всеми прежними замками возвращается в Batched без повторной резки',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());oqThrough(id,'batched');const batch=salesRecord(id).batchNo;salesSetRecordStatus(id,'cancelled');salesSetRecordStatus(id,'new',{restore:true});salesSetRecordStatus(id,'verified');const resumed=salesSetRecordStatus(id,'batched');return {resumed,same:salesRecord(id).batchNo===batch,history:salesRecord(id).batchHistory.length,locked:salesRecord(id).lines.every(salesLineLocked)};
 }),{resumed:true,same:true,history:1,locked:true});
 const fresh=await t.p.evaluate(()=>{oqReset();return oqOrder(oqCustomer());});
 await t.p.locator('[data-metrics-line-id]').nth(0).click({button:'right'});await t.p.locator('[data-line-hold-action="hold"]').click();await t.p.evaluate(id=>{salesRecord(id).notes='Changed elsewhere';},fresh);await t.p.locator('[data-line-hold-confirm]').click();
 eq('устаревшее окно Hold ничего не записывает',await t.p.evaluate(id=>({held:salesRecord(id).lines.some(l=>l.onHold),message:salesDialog&&salesDialog.title}),fresh),{held:false,message:'Order changed'});
 eq('100 позиций, четыре на Hold: в батч попадают 96, четыре сохраняются в очереди',await t.p.evaluate(()=>{
  salesDialog=null;oqReset();const id=oqOrder(oqCustomer()),o=salesRecord(id),mu=o.makeups[0].id;soDraft=null;soEdit=null;
  o.lines=Array.from({length:100},(_,i)=>normalizeSalesOrderLine({makeupId:mu,width16:320,height16:480,qty:1,mark:'Line '+(i+1)}));
  salesLineHoldSet(id,o.lines.slice(96).map(l=>l.id),true,'Waiting for shape');salesSetRecordStatus(id,'verified');salesSetRecordStatus(id,'batched');
  return {locked:o.lines.filter(salesLineLocked).length,pending:salesUnbatchedLines(o).length,holds:o.lines.filter(l=>l.onHold).length,ready:salesSetRecordStatus(id,'ready')};
 }),{locked:96,pending:4,holds:4,ready:false});
 await t.p.setViewportSize({width:390,height:844});
 await t.p.evaluate(()=>{tab='sales';soDraft=null;soEdit=null;render();salesListOpenDate();});
 eq('компактный Sales и окно дат помещаются на телефоне',await t.p.evaluate(()=>{const r=document.querySelector('.sl-date-menu').getBoundingClientRect();return {page:document.documentElement.scrollWidth<=innerWidth,menu:r.left>=0&&r.right<=innerWidth};}),{page:true,menu:true});
 eq('новые сценарии без ошибок страницы',t.errs,[]);await t.c.close();
};
