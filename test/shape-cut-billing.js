/* Стекло фигуры — по режущему прямоугольнику (руководство, 09.11.2026):
   готовый размер плюс Safety Border модуля реза (по толщине: 6 мм — 1″,
   10 мм — 1 1/2″; только там, где кромка косая или дуга; правится в самой
   фигуре), сторона вверх до дюйма, площадь вверх до десятой. Припуск CNC —
   внутри, не добавляется. Обработка CNC — по контуру, как была.
   Прямоугольник — по размеру. Заказ, созданный до правила, — по габариту. */
module.exports=async function({page,eq}){
 console.log('shape cut billing');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.scOrder=function(){
   oqReset();const g=glassProductByCode('6CLEAR');g.salePriceTempered=5.85;
   const w=DB.serviceRate.find(r=>r.id==='flatPolish');w.tiers.forEach(x=>{x.price=0.28;});
   const c=oqCustomer();tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0];
   Object.assign(m.panes[0],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT',priceOverride:null,heatSoak:false});soDraft.lines=[];
   const add=(wi,hi)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:wi*16,height16:hi*16,qty:1});soDraft.lines.push(l);salesEnsureLineShape(l);return l;};
   const l=add(40,60),sh=newShapeDef('raked');sh.w='40';sh.h='60';Object.assign(sh.params,{shortHeight:'54',rakeSide:'top',shortSide:'left'});
   sh.ownerLineId=l.id;DB.shapeDef.push(normalizeShapeDef(sh));l.shapeRef=salesShapeRefFrom(sh);
   add(28,76);
   salesApplyCustomerDefaults(c.id);soDraft.customerPo='PO-SC';if(!salesOrderSave())throw new Error('Order did not save');
   const id=soDraft.id;soDraft=null;soEdit=null;return id;
  };
  window.scLine=(o,i)=>{const l=o.lines[i],a=salesLineAreas(l,o),p=salesLineCommercialPrice(l,o),edge=salesLineChargeRows(l,o).find(r=>/^EDGE:/.test(r.key));
   return {cut:a.cut?[a.cut.w,a.cut.h,a.cut.borders.top]:null,rounded:[a.roundedWidth,a.roundedHeight,a.rounded],billable:a.billable,actual:+a.actual.toFixed(4),glass:+p.materials.toFixed(4),edge:edge?edge.basis:null};};
 });

 eq('новый заказ — по правилу режущего прямоугольника',await t.p.evaluate(()=>newSalesOrderDraft('order').shapeCut),true);

 eq('скос 40 × 60, 6 мм: Safety Border сверху 1″ → 40 × 61 = 17.0 ft², стекло 17 × 5.85; кромка по контуру 195″; прямоугольник 28 × 76 — 14.8 ft² без бордера',await t.p.evaluate(()=>{
  const o=salesRecord(scOrder());return [scLine(o,0),scLine(o,1)];
 }),[{cut:[40,61,1],rounded:[40,61,17],billable:17,actual:15.8333,glass:99.45,edge:195},{cut:null,rounded:[28,76,14.8],billable:14.8,actual:14.7778,glass:86.58,edge:208}]);

 eq('бордер правится в фигуре: Safety Border 2″ → 40 × 62 = 17.3 ft²',await t.p.evaluate(()=>{
  const o=salesRecord(scOrder()),s=salesShapeByRef(o.lines[0].shapeRef);s.safetyBorder='2';o.lines.forEach(l=>{delete l.measure;});touch();return scLine(o,0).rounded;
 }),[40,62,17.3]);

 eq('заказ, созданный до правила, — по габариту: 16.7 ft², сумма прежняя; метка переживает JSON',await t.p.evaluate(()=>{
  const id=scOrder(),o=salesRecord(id);const old=normalizeSalesOrder(Object.assign(JSON.parse(JSON.stringify(o)),{shapeCut:undefined}));
  old.lines.forEach(l=>{delete l.measure;});const back=prepareImportedState(JSON.parse(JSON.stringify(DB))).salesOrder.find(x=>x.id===id);
  return [('shapeCut' in old),scLine(old,0).rounded,back.shapeCut];
 }),[false,[40,60,16.7],true]);

 eq('строка показывает рез: в ячейке Rounded «cut 40 × 61», в окне площади — режущий прямоугольник; у прямоугольника — нет',await t.p.evaluate(()=>{
  const id=scOrder();tab='sales';salesOrderEdit(id);render();
  const cells=[...document.querySelectorAll('td[data-metric="rounded"]')].map(td=>{const c=td.querySelector('[data-metric-cut]');return c?c.textContent:'';});
  salesOpenMetrics('area',soDraft.lines[0].id);const row=document.querySelector('[data-area-cut]'),text=row?row.textContent:'';
  salesCloseMetrics();soDraft=null;soEdit=null;render();return [cells,text];
 }),[['cut 40 × 61',''],'40″ × 60″ + top 1″ → 40″ × 61″']);

 eq('бордеры фигуры без ошибок страницы',t.errs,[]);await t.c.close();
};
