/* Квота и заказ: статусы и даты шагов, предупреждения переходов, замок строк
   после батча, отмена, квота → заказ, галочки Show в списке Sales. Решения
   владельца 14–15 сентября 2026. Прогоняется и на src, и на собранном dist. */
module.exports=async function({page,eq,ok}){
 console.log('lifecycle');
 const t=await page();
 await t.p.evaluate(()=>{
  window.lcCustomer=function(extra){const c=normalizeCustomer(Object.assign({legalName:'QA Life Ltd',code:'QALIFE'+(DB.customer.length+1)},extra||{}));DB.customer.push(c);return c;};
  /* Заказ или квота с известными ценами у своего клиента. */
  window.lcNew=function(kind,cust){
   tab='sales';salesOrderNew(kind);salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   [[37,71,2,'L-1'],[30,40,1,'L-2']].forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   if(cust)salesApplyCustomerDefaults(cust.id);
   return soDraft;
  };
  window.lcCleanup=function(){DB.receipt=[];DB.salesOrder=[];DB.customer=DB.customer.filter(c=>!/^QALIFE/.test(c.code||''));soEdit=null;soDraft=null;salesDialog=null;finEdit=null;finDraft=null;tab='sales';salesShow={orders:true,quotes:false};salesStatusFilter='';};
  window.lcChoose=function(label){const i=salesDialog?salesDialog.buttons.findIndex(b=>b.label===label):-1;if(i<0)throw new Error('no dialog button '+label);salesDialogChoose(i);};
 });

 eq('старые заказы Draft становятся заказами New; номера квот Q-… отдельно от номеров заказов',await t.p.evaluate(()=>{
  lcCleanup();
  const legacy=normalizeSalesOrder({status:'draft',businessNumber:'76010'});DB.salesOrder.push(legacy);
  const c=lcCustomer();
  lcNew('quote',c);salesOrderSave();const q1=soDraft.businessNumber;
  lcNew('quote',c);salesOrderSave();const q2=soDraft.businessNumber;
  lcNew('order',c);salesOrderSave();
  return {legacy:[legacy.kind,legacy.status],quotes:[q1,q2],order:soDraft.businessNumber,newDate:!!soDraft.statusDates.new};
 }),{legacy:['order','new'],quotes:['Q-10001','Q-10002'],order:'76011',newDate:true});

 eq('кнопка следующего шага: Verify → Send to batch → Ready → Picked up → Close, у каждого шага дата; оплаченный заказ проходит без предупреждений',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('order',c);salesOrderSave();
  const total=finOrderBalance(soDraft).total;
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:c.id,amount:total,allocations:[{orderId:soDraft.id,amount:total}]}));
  const seen=[];
  for(let k=0;k<5;k++){salesAdvanceStatus();seen.push(soDraft.status+(salesDialog?' (dialog)':''));}
  return {seen,dates:Object.keys(soDraft.statusDates),readOnly:salesOrderReadOnly(soDraft),noNextButton:!document.querySelector('[data-next-status]')};
 }),{seen:['verified','batched','ready','done','closed'],dates:['new','verified','batched','ready','done','closed'],readOnly:true,noNextButton:true});

 eq('Verify у cash-клиента без депозита: окно Back / Verify anyway / Take payment; Back ничего не меняет',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('order',c);salesOrderSave();
  salesAdvanceStatus();
  const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label),shown=!!document.querySelector('.sales-dialog');
  lcChoose('Back');const afterBack=soDraft.status;
  salesAdvanceStatus();lcChoose('Verify anyway');
  return {title:/^Deposit not received — order \d+$/.test(title),buttons,shown,afterBack,after:soDraft.status};
 }),{title:true,buttons:['Back','Verify anyway','Take payment'],shown:true,afterBack:'new',after:'verified'});

 eq('Take payment открывает оплату на этот заказ с суммой, которой не хватает до депозита',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('order',c);salesOrderSave();
  const b=finOrderBalance(soDraft),dep=salesMoney(b.total*.5).toFixed(2),id=soDraft.id;
  salesAdvanceStatus();lcChoose('Take payment');
  const r={tab,form:finEdit,amount:finDraft.amount===dep&&finDraft.apply[id]===dep,customer:finDraft.customerId===c.id};
  finEdit=null;finDraft=null;tab='sales';return r;
 }),{tab:'finance',form:'new',amount:true,customer:true});

 eq('Verify у Credit-клиента сверх лимита — окно с Verify anyway',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer({paymentMode:'credit',creditDays:30,creditLimit:100});lcNew('order',c);salesOrderSave();
  salesAdvanceStatus();
  const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label);
  lcChoose('Verify anyway');
  return {title,buttons,status:soDraft.status};
 }),{title:'QA Life Ltd is over the credit limit',buttons:['Back','Verify anyway'],status:'verified'});

 eq('батч блокирует строки: строка закрыта, фигуру не открыть, строку не удалить, изменённую не сохранить; новая строка — added after batch и уходит в батч отдельно',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer({paymentMode:'credit',creditDays:30});lcNew('order',c);salesOrderSave();
  salesSetStatus('verified');salesSetStatus('batched');
  const inert=[...document.querySelectorAll('tr[data-metrics-line-id]')].every(r=>r.hasAttribute('inert'));
  const alerts=[],oldAlert=window.alert;window.alert=m=>alerts.push(m);
  salesOrderConfigureShape(0);const shapeOpened=tab!=='sales';
  salesOrderRemoveLine(0);const kept=soDraft.lines.length;
  window.alert=oldAlert;
  soDraft.lines[0].width16+=16;const saved=salesOrderSave(),error=(document.getElementById('e_sales_order')||{}).textContent||'';
  soDraft.lines[0].width16-=16;
  salesOrderAddLine(null,false);const fresh=soDraft.lines[soDraft.lines.length-1];fresh.width16=320;fresh.height16=320;salesEnsureLineShape(fresh);salesOrderSave();
  const badge=[...document.querySelectorAll('tr[data-metrics-line-id]')].pop().textContent.includes('added after batch'),bar=!!document.querySelector('[data-batch-new]');
  salesBatchNewLines();
  return {inert,alerts:alerts.length,shapeOpened,kept,saved:!!saved,error:/Batched lines cannot change/.test(error),badge,bar,allLocked:soDraft.lines.every(salesLineLocked)};
 }),{inert:true,alerts:2,shapeOpened:false,kept:2,saved:false,error:true,badge:true,bar:true,allLocked:true});

 eq('Makeup строк из батча закрыт; шаг назад из Batched — с подтверждением, строки открываются',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer({paymentMode:'credit',creditDays:30});lcNew('order',c);salesOrderSave();
  salesSetStatus('verified');salesSetStatus('batched');
  const muLocked=!!document.querySelector('.mu-locked[inert]');
  const oldConfirm=window.confirm;let asked='';window.confirm=m=>{asked=m;return true;};salesStepBack();window.confirm=oldConfirm;
  return {muLocked,asked:/glass may already be cut/.test(asked),status:soDraft.status,unlocked:soDraft.lines.every(l=>!salesLineLocked(l)),batchedDate:'batched' in soDraft.statusDates};
 }),{muLocked:true,asked:true,status:'verified',unlocked:true,batchedDate:false});

 eq('выдача с долгом — окно; Pick up anyway выдаёт; заказ в производстве не удалить',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer({paymentMode:'credit',creditDays:30});lcNew('order',c);salesOrderSave();
  ['verified','batched','ready'].forEach(s=>salesSetStatus(s));
  salesAdvanceStatus();const title=salesDialog.title,buttons=salesDialog.buttons.map(b=>b.label);
  lcChoose('Pick up anyway');const status=soDraft.status,label=salesStatusLabel(soDraft),id=soDraft.id;
  const alerts=[],oldAlert=window.alert;window.alert=m=>alerts.push(m);soEdit=null;soDraft=null;salesOrderDelete(id);window.alert=oldAlert;
  return {title:/has a balance due$/.test(title),buttons,status,label,deleteBlocked:alerts.length===1&&DB.salesOrder.some(o=>o.id===id)};
 }),{title:true,buttons:['Back','Pick up anyway','Take payment'],status:'done',label:'Picked up',deleteBlocked:true});

 eq('отмена заказа: оплаты уходят на депозит, долгом не считается, заказ только для чтения; Restore возвращает в New',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('order',c);salesOrderSave();
  DB.receipt.push(normalizeReceipt({number:'R-0001',customerId:c.id,amount:200,allocations:[{orderId:soDraft.id,amount:200}]}));
  const oldConfirm=window.confirm;let msg='';window.confirm=m=>{msg=m;return true;};
  salesCancelOrder();
  const r={msg:/\$200\.00 go back/.test(msg),cancelled:soDraft.status,deposit:finCustomerDeposit(c.id),debt:finCustomerAccount(c).balanceDue,readOnly:!!document.querySelector('.sales-readonly[inert]'),
   strip:(()=>{const s=(document.querySelector('.fin-strip')||{}).textContent||'';return /not counted/.test(s)&&!/Balance due/.test(s);})(),noDepositHint:!document.querySelector('.fin-hint')};
  salesRestoreOrder();window.confirm=oldConfirm;
  r.restored=soDraft.status;return r;
 }),{msg:true,cancelled:'cancelled',deposit:200,debt:0,readOnly:true,strip:true,noDepositHint:true,restored:'new'});

 eq('квота не долг; Convert to order — заказ со своим номером, фигуры скопированы, квота Won и только для чтения',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('quote',c);salesOrderSave();
  const quoteId=soDraft.id,qShapes=soDraft.lines.map(l=>l.shapeRef.id),qTotal=finOrderTotals(soDraft).grand,notDebt=finCustomerAccount(c).balanceDue===0;
  salesConvertQuote();
  const order=soDraft,quote=DB.salesOrder.find(o=>o.id===quoteId),oShapes=order.lines.map(l=>l.shapeRef.id);
  return {notDebt,kind:order.kind,status:order.status,number:/^\d+$/.test(order.businessNumber),from:order.fromQuoteId===quoteId,
   newShapes:oShapes.every((id,i)=>!!id&&id!==qShapes[i]&&!!salesShapeByRef({id})),sameTotal:finOrderTotals(order).grand===qTotal,
   quote:[quote.status,quote.wonOrderId===order.id],readOnly:salesOrderReadOnly(quote),debt:finCustomerAccount(c).balanceDue===qTotal};
 }),{notDebt:true,kind:'order',status:'new',number:true,from:true,newShapes:true,sameTotal:true,quote:['won',true],readOnly:true,debt:true});

 eq('список Sales: по умолчанию заказы; галочка Quotes добавляет квоты и колонку Type и запоминается; фильтр статуса; обе галочки не снять',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('quote',c);salesOrderSave();lcNew('order',c);salesOrderSave();soEdit=null;soDraft=null;
  localStorage.removeItem('glass_erp_sales_show');salesShow=salesLoadShow();render();
  const heads=()=>[...document.querySelectorAll('.sales-list-card th')].map(th=>th.textContent.trim()),rows=()=>document.querySelectorAll('[data-order-row]').length;
  const onlyOrders=rows(),typeBefore=heads().includes('Type');
  document.querySelector('[data-show="quotes"]').click();
  const both=rows(),typeAfter=heads().includes('Type'),saved=JSON.parse(localStorage.getItem('glass_erp_sales_show'));
  document.querySelector('[data-status-chip="quote:open"]').click();const filtered=rows();
  document.querySelector('[data-show="orders"]').click();document.querySelector('[data-show="quotes"]').click();
  return {onlyOrders,typeBefore,both,typeAfter,saved,filtered,stillVisible:salesShow.orders||salesShow.quotes};
 }),{onlyOrders:1,typeBefore:false,both:2,typeAfter:true,saved:{orders:true,quotes:true},filtered:1,stillVisible:true});

 eq('окно перехода, шапка и список со статусами — без русского текста',await t.p.evaluate(()=>{
  lcCleanup();const c=lcCustomer();lcNew('order',c);salesOrderSave();salesAdvanceStatus();
  let text=document.getElementById('app').innerText;lcChoose('Back');
  salesShow={orders:true,quotes:true};soEdit=null;soDraft=null;render();text+=document.getElementById('app').innerText;
  lcCleanup();render();
  return /[А-яЁё]/.test(text);
 }),false);
 eq('статусы не дали ошибок страницы',t.errs,[]);
 await t.c.close();
};
