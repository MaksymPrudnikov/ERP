/* Проход «как человек», 7 октября 2026 (docs/ЗАДАЧА_ПРОХОД.md, PR B) —
   офис: Qty → клик мышью в Width терял набранное; курсор переживает
   перерисовку; Take payment из Verify уводил в Payments со старым
   фильтром и не возвращал; «PO required» был только плашкой; батч
   перерезки сразу «Cutting started»; вставка из Excel оставляла пустую
   строку 1; Priority не видна в очереди; «+ New receipt» из заказа без
   клиента и суммы; вкладка станции «Glass Farm · Glass Farm». */
module.exports=async function({page,eq,ok}){
 console.log('office-walk-fixes');const t=await page();
 await require('./optimization-fixture')(t.p);

 /* Настоящая мышь и клавиатура: набрать Qty, кликнуть в Width, набрать. */
 await t.p.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer({legalName:'North Shore Windows'}));soDraft=null;soEdit=null;tab='sales';salesOrderEdit(id);render();window.owId=id;});
 const qty=t.p.locator('input.line-qty').first(),width=t.p.locator('input[data-so-width]').first();
 await qty.click();await t.p.keyboard.press('ControlOrMeta+A');await t.p.keyboard.type('3');
 await width.click();await t.p.keyboard.press('ControlOrMeta+A');await t.p.keyboard.type('20');await t.p.keyboard.press('Tab');
 eq('Sales: Qty, потом клик мышью в Width и ввод — ширина не теряется, Qty записан, итог строки пересчитан',await t.p.evaluate(()=>{
  const l=soDraft.lines[0];return {qty:l.qty,width:l.width16/16,shown:document.querySelector('input[data-so-width]').value};
 }),{qty:3,width:20,shown:'20'});

 eq('курсор переживает перерисовку: поле PO снова в фокусе с той же кареткой; закрытое окно фокус не крадёт',await t.p.evaluate(()=>{
  const po=[...document.querySelectorAll('#app input')].find(i=>/customerPo/.test(i.getAttribute('oninput')||i.getAttribute('onchange')||''));
  if(!po)return 'no PO field';
  po.focus();po.value='NS-77';po.dispatchEvent(new Event('input',{bubbles:true}));po.setSelectionRange(2,2);render();
  const a=document.activeElement,same=a&&/customerPo/.test(a.getAttribute('oninput')||a.getAttribute('onchange')||''),caret=a&&a.selectionStart;
  document.activeElement.blur();soDraft=null;soEdit=null;tab='dashboard';render();
  return {same,caret};
 }),{same:true,caret:2});

 eq('вкладка станции называется по станции: «ARRIS · Glass Farm»',await t.p.evaluate(()=>{
  stationCode='ARRIS';tab='station';render();const title=document.title;tab='dashboard';stationCode='';render();return title;
 }),'ARRIS · Glass Farm');

 eq('Take payment из Verify: после Save receipt — обратно в Optimization со строкой о квитанции; в Payments — этот заказ',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'}));soDraft=null;soEdit=null;oqQueue();
  finOrderFilter='SO-STALE';oqAdvance(id,'verified');oqChoose('Take payment');
  const inFinance=tab==='finance'&&finEdit==='new',filter=finOrderFilter===id;
  finSaveReceipt();const r=DB.receipt[DB.receipt.length-1];
  const out={inFinance,filter,back:tab,notice:optimizationNotice&&optimizationNotice.title===('Payment '+r.number+' saved · '+finFmt(r.amount)),applied:r.allocations.map(a=>a.orderId===id).join(),status:salesRecord(id).status};
  oqAdvance(id,'verified');out.after=salesRecord(id).status;tab='dashboard';render();return out;
 }),{inFinance:true,filter:true,back:'optimization',notice:true,applied:'true',status:'new',after:'verified'});

 eq('«PO required»: без PO — окно на Verify, на батче и в Shipping (своё у заказа); Back ничего не меняет; с PO — без окна',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Harbour Facades',poRequired:true}),id=oqOrder(c,{customerPo:''});soDraft=null;soEdit=null;oqQueue();
  oqAdvance(id,'verified');const title=salesDialog&&salesDialog.title,buttons=salesDialog?salesDialog.buttons.map(b=>b.label):[];oqChoose('Back');const back=salesRecord(id).status;
  const o=salesRecord(id),batched=salesTransitionChecks(o,'batched').map(x=>x.title),done=salesTransitionChecks(o,'done').filter(x=>x.perOrder).map(x=>x.anyway);
  o.customerPo='HF-1';const withPo=salesTransitionChecks(o,'verified').map(x=>x.title);o.customerPo='';
  tab='dashboard';render();return {title:/^PO missing — order \d+$/.test(title),buttons,back,batched:batched.some(x=>/^PO missing/.test(x)),done,withPo};
 }),{title:true,buttons:['Back','Verify anyway'],back:'new',batched:true,done:['Continue anyway'],withPo:[]});

 eq('батч перерезки — «Awaiting cutting»: строку заказа резали в другом батче, но это стекло ещё нет',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({}));soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const b=DB.glassBatch[DB.glassBatch.length-1],first=b.items.find(i=>i.part===b.items[0].part&&i.piece),other=b.items.find(i=>i!==first&&i.part===first.part);
  first.cutStartedAt=new Date().toISOString();const o=salesRecord(id),l=o.lines.find(x=>x.id===b.parts[first.part].lineId);glassBatchSyncLine(o,l);
  const recut={items:[Object.assign({},other)],parts:b.parts};
  return {line:!!l.cutStartedAt,batch:glassBatchStatus(b),recut:glassBatchStatus(recut)};
 }),{line:true,batch:'Cutting started',recut:'Awaiting cutting'});

 eq('вставка из Excel в новый заказ: пустая строка 1 уходит, заполненные строки остаются',await t.p.evaluate(()=>{
  oqReset();oqCustomer({});tab='sales';salesOrderNew();const before=soDraft.lines.length,blank=!soDraft.lines[0].width16;
  salesExcelPasteText('2\t20\t30\tA\n1\t24\t36\tB',0);salesExcelApply();
  const after=soDraft.lines.map(l=>l.qty+':'+l.width16/16+'×'+l.height16/16+':'+l.mark);
  soDraft.lines.push(normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,qty:1}));salesExcelPasteText('1\t10\t10\tC',0);salesExcelApply();const again=soDraft.lines.length;
  soDraft.lines[0].width16=0;soDraft.lines[0].height16=0;soDraft.lines[0].mark='KEEP';salesExcelPasteText('1\t12\t12\tD',0);salesExcelApply();const marked=soDraft.lines.some(l=>l.mark==='KEEP');
  soDraft=null;soEdit=null;tab='dashboard';render();return {before,blank,after,again,marked};
 }),{before:1,blank:true,after:['2:20×30:A','1:24×36:B'],again:3,marked:true});

 /* Владелец, 7.10.2026: «зачем суммы для оптимизатора — лишняя информация;
    зачем там квоты — квоты оптимизируются в Sales». */
 eq('очередь Optimization: Priority видна сразу; денег (Total, Receipts, Balance) нет; внизу «N orders» без Quotes; в Shipping Balance остаётся',await t.p.evaluate(()=>{
  oqReset();oqOrder(oqCustomer({}),{priority:'critical'});soDraft=null;soEdit=null;oqQueue();
  const heads=[...document.querySelectorAll('.sl-table thead th')].map(th=>th.textContent.trim()),cell=[...document.querySelectorAll('.sl-table tbody td')].some(td=>/Critical/.test(td.textContent));
  const money=heads.filter(h=>/^(Total|Receipts|Balance)/.test(h)),foot=document.querySelector('[data-foot-count] b').textContent,columns=salesListCatalog().filter(c=>c.money).length;
  oqQueue('awaiting');const ship=[...document.querySelectorAll('.sl-table thead th')].some(th=>/^Balance/.test(th.textContent.trim()));
  tab='dashboard';render();return {priority:heads.some(h=>/^Priority/.test(h)),cell,money,foot,columns,ship};
 }),{priority:true,cell:true,money:[],foot:'1 order',columns:0,ship:true});

 eq('Payments из заказа → «+ New receipt»: клиент выбран, депозит наличного заказа разнесён на заказ',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({paymentMode:'cash'})),o=salesRecord(id),dep=salesMoney(finOrderBalance(o).total*.5).toFixed(2);soDraft=null;soEdit=null;
  finShowOrder(id);document.querySelector('[data-fin-new]').click();
  const out={customer:finDraft.customerId===o.customerId,amount:finDraft.amount===dep,apply:finDraft.apply[id]===dep,note:finDraft.note==='Order '+o.businessNumber};
  finCloseReceipt(true);tab='dashboard';render();return out;
 }),{customer:true,amount:true,apply:true,note:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
