/* Количества работ и площадь позиции — в строке при Save (sales/line-measure).
   Владелец, 27.10.2026: «каждый раз читать фигуру не имеет смысла, если при
   сохранении заказа мы уже получили данные». */
module.exports=async function({page,eq}){
 console.log('line measure');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.lmTotal=id=>finWithOrder(salesRecord(id),()=>salesOrderCommercialTotals(salesRecord(id)));
  window.lmLive=id=>{salesMeasureOff++;try{return lmTotal(id);}finally{salesMeasureOff--;}};
  /* Расчёты фигуры за fn; сверка тестов (GF_SCOPE_CHECK) сама считает по фигуре — на это время выключена. */
  window.lmShapeCalls=fn=>{let n=0;const f=ShapeModule.compute,was=window.GF_SCOPE_CHECK;window.GF_SCOPE_CHECK=false;ShapeModule.compute=function(){n++;return f.apply(this,arguments);};try{fn();}finally{ShapeModule.compute=f;window.GF_SCOPE_CHECK=was;}return n;};
 });
 eq('Save записывает строки работ и площадь каждой позиции; сумма сохранённого заказа — из записанного, без расчёта фигуры, та же до поля',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Measure Co'})),o=salesRecord(id);
  const calls=lmShapeCalls(()=>lmTotal(id));
  return {written:o.lines.map(l=>!!l.measure&&l.measure.rows.length>0&&l.measure.areas.valid),rows:o.lines.map(l=>l.measure.rows.map(r=>r.key+' '+r.basis).join()),
   calls,same:JSON.stringify(lmTotal(id))===JSON.stringify(lmLive(id)),liveCalls:lmShapeCalls(()=>lmLive(id))>0};
 }),{written:[true,true],rows:['EDGE:roughArris:6 432','EDGE:roughArris:6 280'],calls:0,same:true,liveCalls:true});
 eq('правка размера в заказе (37 → 47 × 71, два лайта): строка сразу считается по новой фигуре — кромка 472″, остальные — из записанного; Save пишет новое',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Measure Co'}));salesOrderEdit(id);
  const [a,b]=soDraft.lines;delete a.shapeRef;a.width16+=10*16;salesEnsureLineShape(a);
  const draft={a:!!salesMeasureFor(a,soDraft),b:!!salesMeasureFor(b,soDraft),edge:salesLineChargeRowsRaw(a)[0].basis};
  salesOrderSave();salesDraftDrop(true);const l=salesRecord(id).lines[0];
  return {draft,saved:l.measure.rows[0].basis,area:+l.measure.areas.actual.toFixed(4),fresh:!!salesMeasureFor(l,salesRecord(id)),same:JSON.stringify(lmTotal(id))===JSON.stringify(lmLive(id))};
 }),{draft:{a:false,b:true,edge:472},saved:472,area:23.1736,fresh:true,same:true});
 eq('строка, изменённая мимо Save (импорт, старая версия), считается по фигуре; батч, Hold, количество и ставка запись не сбивают',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Measure Co'})),o=salesRecord(id),l=o.lines[0],ok=()=>!!salesMeasureFor(l,o);
  l.batchedAt='2026-10-27T12:00:00.000Z';l.batchNo='B-0001';l.onHold=true;l.qty=5;l.mark='Changed';l.chargePricing={};const kept=ok();
  l.height16+=16;const height=ok();l.height16-=16;
  o.makeups[0].panes[0].glassProductId=glassProductByCode('10CLEAR').id;const makeup=ok();
  return {kept,height,makeup};
 }),{kept:true,height:false,makeup:false});
 eq('правка данных 9: заказы без записи получают её при загрузке, суммы не сдвигаются; битая запись отбрасывается',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Measure Co'})),before=JSON.stringify(lmLive(id));
  salesRecord(id).lines.forEach(l=>{delete l.measure;});DB.dataFix=8;applyDataFixes();
  const o=salesRecord(id),bad=normalizeSalesOrderLine(Object.assign({},o.lines[0],{measure:{sig:'x',rows:[],areas:{}}})),good=normalizeSalesOrderLine(o.lines[0]);
  return {written:o.lines.every(l=>!!salesMeasureFor(l,o)),same:JSON.stringify(lmTotal(id))===before,bad:'measure' in bad,good:!!good.measure,fix:DB.dataFix};
 }),{written:true,same:true,bad:false,good:true,fix:11});
 eq('line measure: без ошибок страницы',t.errs,[]);await t.c.close();
};
