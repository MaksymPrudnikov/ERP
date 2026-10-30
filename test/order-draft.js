/* Save as Draft (пункт 2; вариант 1 владельца 30.10.2026) и PO у всех
   клиентов (29.10.2026: «PO для всех обязательно»). Черновик — только из окна
   выхода; хранит всё, что в заказе; не идёт в Verify, батч, Shipping, деньги;
   обычный Save делает его тем же заказом. */
module.exports=async function({page,eq}){
 console.log('order draft');
 const t=await page(undefined,{width:1440,height:900});const fx=()=>require('./optimization-fixture')(t.p);await fx();
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main черновика нет). */
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const prep=()=>t.p.evaluate(()=>{
  window.odBtns=()=>salesDialog?salesDialog.buttons.map(b=>b.label):[];
  /* Новый заказ: клиент, строка с размером и строка без размера, без PO. */
  window.odNew=c=>{tab='sales';if(soDraft)salesDraftDrop(true);salesOrderNew('order');salesSetUnitType('double');salesApplyCustomerDefaults(c.id);
   const m=soDraft.makeups[0];soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:36*16,height16:48*16,qty:2,mark:'W1'}),normalizeSalesOrderLine({makeupId:m.id,qty:1,mark:'W2'})];salesEnsureLineShape(soDraft.lines[0]);render();};
 });
 await prep();
 const ids=await run(()=>{oqReset();const c=oqCustomer({legalName:'Draft Windows Ltd',contacts:[{name:'First',isPrimary:true},{name:'Second'}]});touch();return {c:c.id};});

 eq('Draft: Close у нового заказа — окно Back · Don\'t save · Save as Draft · Save; на форме кнопки Save as Draft нет; черновик с номером без PO и размера',await run(c=>{
  odNew(salesFindCustomer(c));const form=[...document.querySelectorAll('.sales-order-editor button')].some(b=>/draft/i.test(b.textContent));
  salesOrderClose();const buttons=odBtns();const before=DB.salesOrder.length;oqChoose('Save as Draft');
  const o=DB.salesOrder[DB.salesOrder.length-1];
  return {form,buttons,added:DB.salesOrder.length-before,draft:o.isDraft===true,number:/^\d+$/.test(o.businessNumber),lines:o.lines.length,po:o.customerPo,closed:soDraft===null,pieces:(DB.glassPiece||[]).filter(p=>p.orderId===o.id).length};
 },ids.c),{form:false,buttons:['Back',"Don't save",'Save as Draft','Save'],added:1,draft:true,number:true,lines:2,po:'',closed:true,pieces:0});
 eq('Draft: в Sales вся строка жёлтая, Status — DRAFT; виден без фильтров',await run(()=>{
  const o=DB.salesOrder.find(x=>x.isDraft);tab='sales';render();const tr=document.querySelector('tr[data-order-row="'+o.id+'"]');
  return {row:!!tr,yellow:!!tr&&tr.classList.contains('sl-row-draft'),pill:tr?tr.querySelector('.pill.st-draft').textContent:''};
 }),{row:true,yellow:true,pill:'DRAFT'});
 eq('Draft: всё в заказе сохраняется и переживает F5 — строки, надбавки заказа, ручная цена, контакт, Notes',await (async()=>{
  const id=await run(c=>{const cu=salesFindCustomer(c);odNew(cu);soDraft.lines[0].priceManual=99;soDraft.surchargeRates={largeUnit:{value:40}};soDraft.customerContactId=cu.contacts[1].id;soDraft.notes='Call first';
   salesOrderClose();oqChoose('Save as Draft');return DB.salesOrder[DB.salesOrder.length-1].id;},ids.c);
  if(id&&id.error)return id;
  await t.p.waitForTimeout(2000);await t.p.reload();await t.p.evaluate(()=>window.storageReady);await fx();await prep();
  return run(x=>{const o=salesRecord(x.id),c=salesFindCustomer(x.c);return {draft:o.isDraft===true,lines:o.lines.length,price:o.lines[0].priceManual,surcharge:(o.surchargeRates||{}).largeUnit,contact:o.customerContactId===c.contacts[1].id,notes:o.notes};},{id,c:ids.c});
 })(),{draft:true,lines:2,price:99,surcharge:{value:40},contact:true,notes:'Call first'});
 eq('Draft: обычный Save с ошибкой — черновик остаётся, форма открыта; успешный — тот же id и номер, DRAFT уходит',await run(()=>{
  const d=DB.salesOrder.find(x=>x.isDraft);salesOrderEdit(d.id);const label=document.querySelector('[data-order-save]').textContent;
  salesOrderSave();const err=document.getElementById('e_sales_order').textContent,still=salesRecord(d.id).isDraft===true,open=soEdit===d.id;
  soDraft.lines=soDraft.lines.filter(l=>l.width16);soDraft.customerPo='PO-77';const ok=salesOrderSave();const o=salesRecord(d.id);salesDraftDrop();
  return {label,err,still,open,ok,same:o.id===d.id&&o.businessNumber===d.businessNumber,draft:o.isDraft===true,status:o.status,pieces:(DB.glassPiece||[]).filter(p=>p.orderId===o.id).length>0};
 }),{label:'Save',err:'Enter the Customer PO.',still:true,open:true,ok:true,same:true,draft:false,status:'new',pieces:true});
 eq('Draft: не в Optimization и Shipping, Verify и Skip закрыты, деньги не считают; обычный заказ — как раньше',await run(c=>{
  odNew(salesFindCustomer(c));salesOrderClose();oqChoose('Save as Draft');const d=DB.salesOrder[DB.salesOrder.length-1];
  const order=oqOrder(salesFindCustomer(c));salesDraftDrop();
  const opt=['new','all','awaiting','ready'].map(k=>optimizationMatches(d,k)),plain=optimizationMatches(salesRecord(order),'new');
  const checks=salesTransitionChecks(d,'verified').filter(x=>x.block).map(x=>x.short);
  return {opt,plain,checks,skip:skipCanOpen(d),money:finOrderCounts(d),orderMoney:finOrderCounts(salesRecord(order))};
 },ids.c),{opt:[false,false,false,false],plain:true,checks:['Draft','PO missing'],skip:false,money:false,orderMoney:true});
 eq('Draft: выход без сохранения — новый не записан, у черновика остаётся прежнее; готовый заказ — окно без Save as Draft',await run(c=>{
  const n=DB.salesOrder.length;odNew(salesFindCustomer(c));salesOrderClose();oqChoose("Don't save");const none=DB.salesOrder.length===n;
  const d=DB.salesOrder.find(x=>x.isDraft);salesOrderEdit(d.id);soDraft.notes='changed';salesOrderClose();const draftBtns=odBtns();oqChoose("Don't update");const kept=salesRecord(d.id).notes!=='changed'&&salesRecord(d.id).isDraft===true;
  const o=DB.salesOrder.find(x=>!x.isDraft&&x.kind!=='quote');salesOrderEdit(o.id);soDraft.notes='x';salesOrderClose();const orderBtns=odBtns();oqChoose("Don't update");
  return {none,draftBtns,kept,orderBtns};
 },ids.c),{none:true,draftBtns:['Back',"Don't update",'Save as Draft','Save'],kept:true,orderBtns:['Back',"Don't update",'Update']});
 eq('Draft: только клиент выбран — уход спрашивает; старый status «draft» без признака — New, не черновик',await run(c=>{
  tab='sales';if(soDraft)salesDraftDrop(true);salesOrderNew('order');salesApplyCustomerDefaults(c);salesOrderClose();const asked=!!salesDialog;if(asked)oqChoose("Don't save");
  const old=normalizeSalesOrder({id:'SO-old',kind:'order',status:'draft',customerId:c});
  return {asked,status:old.status,draft:salesIsDraft(old)};
 },ids.c),{asked:true,status:'new',draft:false});
 eq('PO у всех: клиент без «PO Required» — Save без PO не проходит, Draft проходит; квота без PO сохраняется',await run(c=>{
  const cu=salesFindCustomer(c);odNew(cu);soDraft.lines=soDraft.lines.filter(l=>l.width16);const ok=salesOrderSave(),err=document.getElementById('e_sales_order').textContent;
  salesOrderClose();oqChoose('Save as Draft');const draft=DB.salesOrder[DB.salesOrder.length-1].isDraft===true;
  const q=oqOrder(cu,{kind:'quote'});salesDraftDrop();
  return {required:cu.poRequired,ok,err,draft,quote:!!salesRecord(q)&&!salesRecord(q).customerPo};
 },ids.c),{required:false,ok:false,err:'Enter the Customer PO.',draft:true,quote:true});
 eq('Draft: заказ на 120 строк Save as Draft сохраняет все строки',await run(c=>{
  odNew(salesFindCustomer(c));const m=soDraft.makeups[0];soDraft.lines=Array.from({length:120},(_,i)=>normalizeSalesOrderLine({makeupId:m.id,width16:(20+i%30)*16,height16:30*16,qty:1}));soDraft.lines.forEach(salesEnsureLineShape);
  const t0=performance.now();salesOrderClose();oqChoose('Save as Draft');const ms=performance.now()-t0;const o=DB.salesOrder[DB.salesOrder.length-1];
  return {lines:o.lines.length,draft:o.isDraft===true,fast:ms<5000};
 },ids.c),{lines:120,draft:true,fast:true});
 eq('order-draft без ошибок страницы',t.errs,[]);
 await t.c.close();
};
