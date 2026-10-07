/* Проход «как человек», 7 октября 2026 (docs/ЗАДАЧА_ПРОХОД.md, PR C) —
   отгрузка и деньги. Владелец: «нужно сначала взять деньги, если у клиента
   не кредитование — пусть будет окно и подсветка; кредит и лимиты — дело
   бухгалтерии». Срок у доставки — «after delivery». Скид другого клиента
   на SHIP — test/shipping-loading.js. */
module.exports=async function({page,eq,ok}){
 console.log('shipping-walk-fixes');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.swSeed=function(extra){oqReset();DB.carrier=[];carrierAdd('SL',2);stationLast=null;stationNote='';const id=oqOrder(oqCustomer(Object.assign({legalName:'Maria Gonzalez'},extra||{})));salesDraftDrop();oqThrough(id,'ready');return id;};
  window.swPS=function(id,method){return shippingCreate({customerId:salesRecord(id).customerId,method:method||'pickup',shipTo:method==='delivery'?{address1:'1 Main St'}:{},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]}).value;};
  window.swOpen=function(s){tab='shipping';shippingTab='shipments';shippingOpenId=s.id;render();};
 });

 eq('Loaded у cash-клиента с долгом: сначала окно «balance due» — Back ничего не пишет, Load anyway продолжает погрузку',await t.p.evaluate(()=>{
  const id=swSeed({paymentMode:'cash'}),s=swPS(id);swOpen(s);
  const pill=!!document.querySelector('[data-ps-balance]');
  shippingLoaded(s.id);const title=salesDialog&&salesDialog.title,buttons=salesDialog?salesDialog.buttons.map(b=>b.label):[];
  oqChoose('Back');const back=shippingFind(s.id).status;
  shippingLoaded(s.id);oqChoose('Load anyway');const next=salesDialog&&salesDialog.title;oqChoose('Ship all');
  const out={pill,title:/^Order \d+ has a balance due$/.test(title),buttons,back,next,status:shippingFind(s.id).status};tab='dashboard';render();return out;
 }),{pill:true,title:true,buttons:['Back','Load anyway','Take payment'],back:'planned',next:'Nothing scanned at SHIP',status:'shipped'});

 eq('Take payment из окна Loaded: квитанция на заказ, после Save — обратно в Shipping; долг закрыт — подсветки нет, Loaded без окна',await t.p.evaluate(()=>{
  const id=swSeed({paymentMode:'cash'}),s=swPS(id);swOpen(s);
  shippingLoaded(s.id);oqChoose('Take payment');const inFinance=tab==='finance'&&finDraft&&finDraft.apply[id]!=null;
  finSaveReceipt();const back=tab,notice=shippingNotice&&/^Payment R-\d+ saved · \$[\d,.]+ · run the action again$/.test(shippingNotice.text);
  shippingOpenId=s.id;render();const pill=!!document.querySelector('[data-ps-balance]');
  shippingLoaded(s.id);const next=salesDialog&&salesDialog.title;oqChoose('Back');
  tab='dashboard';render();return {inFinance,back,notice,pill,next};
 }),{inFinance:true,back:'shipping',notice:true,pill:false,next:'Nothing scanned at SHIP'});

 eq('кредитный клиент: Loaded без окна о долге и без подсветки (кредит — дело бухгалтерии)',await t.p.evaluate(()=>{
  const id=swSeed({paymentMode:'credit',creditDays:30}),s=swPS(id,'delivery');swOpen(s);
  const pill=!!document.querySelector('[data-ps-balance]');shippingLoaded(s.id);const next=salesDialog&&salesDialog.title;oqChoose('Back');
  tab='dashboard';render();return {pill,next};
 }),{pill:false,next:'Nothing scanned at SHIP'});

 eq('срок оплаты: у доставки «Net 30 after delivery» и «At delivery», у самовывоза — «after pickup»',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({paymentMode:'credit',creditDays:30}),cash=oqCustomer({legalName:'Cash',paymentMode:'cash'});
  const d=oqOrder(c,{delivery:'delivery'}),p=oqOrder(c,{delivery:'pickup'}),k=oqOrder(cash,{delivery:'delivery'});salesDraftDrop();
  const f=id=>finOrderFinancial(salesRecord(id));
  return {delivery:f(d).status,pickup:f(p).status,timing:finDueTiming({f:f(d),days:null}),print:finDueText(f(k)),cash:finDueTiming({f:f(k),days:null})};
 }),{delivery:'Net 30 after delivery',pickup:'Net 30 after pickup',timing:'After delivery',print:'At delivery',cash:'At delivery'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
