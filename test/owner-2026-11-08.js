/* Правки владельца 08.11.2026 (Sales): ламинат словами, работа с чертежа
   убирается из окна сервисов строки, минимальная площадь по макапам заказа
   и по материалам внутри макапа. */
module.exports=async function({page,eq}){
 console.log('owner 2026-11-08');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  window.o8Lam=i=>{const g=glassProductByCode('6CLEAR'),pn=salesDefaultPane(i);pn.category='laminated';['outer','inner'].forEach(k=>Object.assign(pn.laminated[k],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT'}));pn.laminated.interlayers=[normalizeSalesInterlayer({productId:'INT-EVA-CL',layers:2})];return normalizeSalesPane(pn,i);};
  window.o8Order=()=>{const id=oqOrder(oqCustomer({legalName:'Owner 08.11'}));salesOrderEdit(id);return soDraft;};
 });
 /* Владелец, 08.11.2026: «все описание что имеется LAM так точно не должно»;
    вариант B1 — толщина и в скобках стекло + плёнка + стекло. */
 eq('ламинат словами: LAM, номинальная толщина, стекло + плёнка + стекло; внутри — Short name, клиенту — Name, в документах — закалка',await run(()=>{
  const o=o8Order(),m=o.makeups[0],g=glassProductByCode('6CLEAR');
  const lam=JSON.parse(JSON.stringify(m));lam.unitType='single';lam.panes=[o8Lam(0)];lam.cavities=[];
  const igu=JSON.parse(JSON.stringify(m));igu.panes=[m.panes[0],o8Lam(1)];
  const s=glassShortName(g);
  return {inside:salesMakeupSummary(lam)===`LAM 12.76 (${s} + 0.76 EVA-CL + ${s})`,client:salesMakeupSummary(lam,'name')===`LAM 12.76 (${g.name} + 0.76 EVA Clear + ${g.name})`,
   igu:salesMakeupSummary(igu).endsWith(` / LAM 12.76 (${s} + 0.76 EVA-CL + ${s})`),doc:docMakeupShort(lam)===`LAM 12.76 (${g.code} T + 0.76 EVA-CL + ${g.code} T)`,
   noBareLam:!/(^| )LAM( \/|$)/.test(salesMakeupSummary(igu))};
 }),{inside:true,client:true,igu:true,doc:true,noBareLam:true});
 /* Владелец, 08.11.2026: «удалить имеющийся сервис и он пропадает из чертежа
    тоже» — в окне сервисов ОДНОЙ строки; вид E2 — две лёгкие иконки. */
 eq('сервисы строки: × у работы с чертежа убирает её из цены и с чертежа этой строки; общая форма — строке своя копия; у кромки только ↺',await run(()=>{
  const o=o8Order(),[a,b]=o.lines,s=salesShapeByRef(a.shapeRef),segs=ShapeModule.compute(s).edges||[];
  [[3,3],[9,3]].forEach(([x,y])=>s.manufacturingItems.push(shapeNormalizeManufacturingItem({type:'hole',x,y,diameter:'1/2'})));
  s.manufacturingItems.push(shapeNormalizeManufacturingItem({type:'hinge',edgeId:segs[0]&&segs[0].id,distance:4}));
  const keys=l=>salesLineChargeRowsRaw(l).map(r=>r.key.split(':').slice(0,2).join(':'));
  salesOpenLineServices(a.id);const acts=[...document.querySelectorAll('.sales-line-service-row:not(.head)')].map(r=>[!!r.querySelector('[data-charge-reset]'),!!r.querySelector('[data-shape-remove]')]);salesCloseServices();
  const hole=salesLineChargeRowsRaw(a).find(r=>/^MI:hole/.test(r.key)).key,own=a.shapeRef.id;
  const ok=salesRemoveShapeCharge(a.id,hole),after=keys(a),items=salesShapeByRef(a.shapeRef).manufacturingItems.map(x=>x.type),same=a.shapeRef.id===own;
  /* Общая форма: строка b ссылается на ту же — убрать петлю у b. */
  b.shapeRef=normalizeShapeRef({id:a.shapeRef.id,revision:a.shapeRef.revision});
  const hinge=salesLineChargeRowsRaw(b).find(r=>/^MI:hinge/.test(r.key)).key,ok2=salesRemoveShapeCharge(b.id,hinge);
  return {acts,ok,after,items,same,ok2,copy:b.shapeRef.id!==a.shapeRef.id,aKeeps:keys(a).includes('MI:hinge'),bLost:!keys(b).includes('MI:hinge'),edge:salesShapeChargeRemovable('EDGE:roughArris:6')};
 }),{acts:[[true,true],[true,true],[true,false]],ok:true,after:['MI:hinge','EDGE:roughArris'],items:['hinge'],same:true,ok2:true,copy:true,aKeeps:true,bLost:true,edge:false});
 /* Владелец, 08.11.2026: «массовый на виду, детальный — скрытой выпадающей
    функцией для мейкапов, а что внутри него — базово чтобы не было видно». */
 eq('Minimum area: общий 4 ft² на виду; по макапу своё число; материал внутри макапа — своё; записывается в заказ и в журнал',await run(()=>{
  const o=o8Order(),m=o.makeups[0],l=o.lines[1],sid=salesSurchargeCatalog(o).find(x=>x.rule.kind==='minArea').id;
  l.width16=10*16;l.height16=12*16;salesSyncShapeFromLine(l);
  const price=()=>salesLineCommercialPrice(l,soDraft),bill=()=>price().areas.billable;
  salesOpenMetrics('rules');const closed=!document.querySelector('[data-minarea-makeup]')&&!!document.querySelector('[data-minarea-toggle]');
  salesMinAreaToggle('');const mk=document.querySelectorAll('[data-minarea-makeup]').length,parts0=document.querySelectorAll('[data-minarea-part]').length;
  salesMinAreaToggle(m.id);const parts=[...document.querySelectorAll('[data-minarea-part]')].map(x=>x.dataset.minareaPart.split(':')[0]);
  const base=bill();salesSetMinAreaOverride(sid,m.id,'','1');const mkMin=bill();
  salesSetMinAreaOverride(sid,m.id,'','');salesSetMinAreaOverride(sid,m.id,'glassProduct:'+m.panes[0].glassProductId,'2');
  const glass=price().materialRows.filter(r=>r.table==='glassProduct').map(r=>+r.qty.toFixed(2)),unit=bill();
  const bad=(salesSetMinAreaOverride(sid,m.id,'','-1'),salesSurchargeError&&salesSurchargeError.text);salesSurchargeError=null;
  const notes=salesSurchargeLogNotes({surchargeRates:{}},soDraft).length;
  salesCloseMetrics();if(!salesOrderSave())return 'save failed';
  const kept=salesRecord(o.id).surchargeRates[sid].byMakeup[m.id].parts;
  return {closed,mk,parts0,parts,base,mkMin,glass,unit,bad,notes,kept:Object.values(kept)};
 }),{closed:true,mk:1,parts0:0,parts:['glassProduct','spacerVariant'],base:4,mkMin:1,glass:[2,2],unit:4,bad:'Enter 0 or more',notes:1,kept:[2]});
 await t.c.close();
};
