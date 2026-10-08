/* Деньги руками (владелец, 7 октября 2026: «то, что касается денег, должно
   быть максимально флексибл — иногда где-то ошибка, и нужна возможность
   решить её руками»): цена юнита строки руками — и у строки в батче, и после
   выдачи; поправка на заказ ±; документы клиента; журнал; JSON. */
module.exports=async function({page,eq}){
 console.log('money');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.mnOrder=status=>{oqReset();const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;if(status)oqThrough(id,status);tab='sales';salesOrderEdit(id);return id;};
  window.mnLog=(id,what)=>DB.orderEvent.filter(e=>e.orderId===id&&e.what===what).map(e=>e.note);
  window.mnDoc=(kind,id)=>{const o=salesRecord(id);return finWithOrder(o,()=>docBuildModel(kind,o));};
 });

 eq('строка в батче: цена открыта, Price by hand 199.99 сохраняется Update; итог, документ клиента без разбивки, журнал',await t.p.evaluate(()=>{
  const id=mnOrder('batched'),cell=document.querySelector('td[data-metric="unitPrice"]'),inert=!!cell.closest('[inert]');
  const before=finOrderTotals(salesRecord(id)).subtotal,calc=salesLineCommercialPrice(salesRecord(id).lines[0],salesRecord(id)).unit;
  cell.querySelector('button').click();const input=document.querySelector('[data-price-manual-input]');input.value='199.99';input.dispatchEvent(new Event('change'));
  const saved=salesOrderSave(),o=salesRecord(id),p=finWithOrder(o,()=>salesLineCommercialPrice(o.lines[0],o)),doc=mnDoc('confirmation',id).items[0];
  return {inert,saved,locked:salesLineLocked(o.lines[0]),unit:p.unit,line:p.line,manual:p.manual,calc:p.computedUnit===calc,
   sub:finOrderTotals(o).subtotal===Math.round((before-calc*2+399.98)*100)/100,doc:[doc.amount,doc.groups.length,doc.unitRow.map(x=>x.value).join(' ')],
   hand:!!document.querySelector('td[data-metric="unitPrice"] .metric-hand'),log:mnLog(id,'Price by hand')};
 }),{inert:false,saved:true,locked:true,unit:199.99,line:399.98,manual:true,calc:true,sub:true,doc:['$399.98',0,'$199.99 2 $399.98'],hand:true,log:['line 1 · calculated → $199.99']});

 eq('Clear возвращает расчёт',await t.p.evaluate(()=>{
  const id=DB.salesOrder[0].id;salesOrderEdit(id);salesOpenMetrics('price',soDraft.lines[0].id);document.querySelector('[data-price-manual-clear]').click();salesOrderSave();
  const o=salesRecord(id);return {has:'priceManual' in o.lines[0],manual:!!salesLineCommercialPrice(o.lines[0],o).manual,log:mnLog(id,'Price by hand')};
 }),{has:false,manual:false,log:['line 1 · calculated → $199.99','line 1 · $199.99 → calculated']});

 eq('поправка на заказ −12.40 «Price correction»: Subtotal меньше, строкой в документе клиента, в журнале',await t.p.evaluate(()=>{
  const id=DB.salesOrder[0].id;salesOrderEdit(id);const before=finOrderTotals(salesRecord(id)).subtotal;
  salesOpenMetrics('orderCharges');document.querySelector('[data-adjustment-add]').click();
  const label=document.querySelector('[data-adjustment-label]');label.value='Price correction';label.dispatchEvent(new Event('input'));
  const amount=document.querySelector('[data-adjustment-amount]');amount.value='-12.40';amount.dispatchEvent(new Event('change'));
  salesCloseMetrics();const saved=salesOrderSave(),o=salesRecord(id),extra=mnDoc('invoice',id).extra;
  return {saved,adj:o.adjustments.map(a=>[a.label,a.amount]),sub:Math.round((before-finOrderTotals(o).subtotal)*100)/100,row:extra&&extra.rows.map(r=>[r.name,r.amount]),log:mnLog(id,'Adjustments')};
 }),{saved:true,adj:[['Price correction',-12.4]],sub:12.4,row:[['Price correction','−$12.40']],log:['Price correction −$12.40']});

 eq('после выдачи: цену и поправку можно поправить, счёт меняется',await t.p.evaluate(()=>{
  const id=mnOrder('done'),o0=salesRecord(id),calc=salesLineCommercialPrice(o0.lines[1],o0).unit,before=finOrderTotals(o0).subtotal;
  salesSetLinePriceManual(soDraft.lines[1].id,'100');const saved=salesOrderSave(),o=salesRecord(id);
  return {status:o.status,saved,unit:mnDoc('invoice',id).items[1].unitRow[0].value,total:finOrderTotals(o).subtotal===Math.round((before-calc+100)*100)/100};
 }),{status:'done',saved:true,unit:'$100.00',total:true});

 eq('JSON: цена руками и поправки переживают экспорт и импорт; старый заказ без них не меняется; плохие значения не импортируются',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=m=>{const x=JSON.parse(JSON.stringify(src));m(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  const plain=normalizeSalesOrder(JSON.parse(JSON.stringify(Object.assign({},src.salesOrder[0],{adjustments:undefined}))));
  return {same:JSON.stringify(next.salesOrder)===JSON.stringify(src.salesOrder),plain:!('adjustments' in plain)&&!plain.lines.some(l=>'priceManual' in l&&l.priceManual==null),
   adj:fail(x=>{x.salesOrder[0].adjustments={};}),price:fail(x=>{x.salesOrder[0].lines[0].priceManual=-5;})};
 }),{same:true,plain:true,adj:'Sales Order 1: invalid adjustments.',price:'Sales Order 1, line 1: invalid price.'});

 eq('окна цены и поправок без русского',await t.p.evaluate(()=>{const id=DB.salesOrder[0].id;salesOrderEdit(id);salesOpenMetrics('price',soDraft.lines[0].id);const a=document.querySelector('.metric-modal').innerText;salesOpenMetrics('orderCharges');const b=document.querySelector('.metric-modal').innerText;salesCloseMetrics();return /[А-яЁё]/.test(a+b);}),false);
 eq('деньги руками без ошибок страницы',t.errs,[]);await t.c.close();
};
