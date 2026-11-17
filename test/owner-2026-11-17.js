/* Правки владельца 17.11.2026, Master Data: припуск на рез — свой пункт
   Data → Cutting allowance (строка ввода по Add, правка не двигает строку,
   проверка вместо зашитых примеров); счётчик строк не обрезан; цена со своей
   единицей; Frit и Spandrel — своя единица продажи; минимум площади у
   каждого айтема и работы свой, число заказа по макапу главнее. Эталон —
   счёт Spiel владельца (спандрел 6 мм закалённый, стороны вверх до дюйма). */
module.exports=async function({page,eq}){
 console.log('owner 2026-11-17');
 const t=await page(undefined,{width:1500,height:1000});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));

 eq('Cutting allowance — свой пункт дерева Services; под Works его больше нет; + New — строка ввода, в базу только по Add; новая строка наверху; правка Operation строку не двигает',await run(()=>{
  tab='masterdata';mdCatalogGo('serviceRate');render();
  const underWorks=!!document.querySelector('[data-md-allow]');
  document.querySelector('[data-md-node="edgeAllowance"]').click();
  const screen=!!document.querySelector('[data-md-allow]'),n0=DB.edgeAllowance.length;
  document.querySelector('[data-md-allow-new-btn]').click();
  const draft=!!document.querySelector('[data-md-allow-new]'),notYet=DB.edgeAllowance.length===n0;
  document.querySelector('[data-md-allow-add]').click();
  const refused=document.getElementById('e_mdAllow').textContent;
  Object.assign(mdAllowanceDraft,{op:'Mitering',scope:'mono',minMm:'20',maxMm:'25',allowance:'3/16'});
  document.querySelector('[data-md-allow-add]').click();
  const id=DB.edgeAllowance[DB.edgeAllowance.length-1].id,first=()=>document.querySelector('[data-md-allow-row]').getAttribute('data-md-allow-row');
  const top=first()===id;
  const other=[...document.querySelectorAll('[data-md-allow-row]')][3].getAttribute('data-md-allow-row');
  mdAllowanceSet(other,'op','Beveling');
  const stays=[...document.querySelectorAll('[data-md-allow-row]')][3].getAttribute('data-md-allow-row')===other;
  return {underWorks,screen,draft,notYet,refused,added:DB.edgeAllowance.length===n0+1,top,stays};
 }),{underWorks:false,screen:true,draft:true,notYet:true,refused:'Pick an operation',added:true,top:true,stays:true});

 eq('Check: работа + толщина + монолит/ламинат → припуск; нет правила — «No rule — cutting is blocked» и строкой над таблицей',await run(()=>{
  tab='masterdata';const keep=DB.edgeAllowance;DB.edgeAllowance=keep.filter(r=>r.op!=='Lami Polish');normalizeEdgeAllowance();mdCatalogGo('edgeAllowance');
  mdAllowanceCheckSet('op','Flat Polish');mdAllowanceCheckSet('scope','mono');mdAllowanceCheckSet('mm','6');
  const ok=document.querySelector('[data-md-allow-result]').textContent.trim();
  mdAllowanceCheckSet('op','Lami Polish');mdAllowanceCheckSet('scope','lami');mdAllowanceCheckSet('mm','10');
  const blocked=document.querySelector('[data-md-allow-result]').textContent.trim();
  const gaps=document.querySelector('[data-md-allow-gaps]'),r={ok,blocked,gaps:!!gaps&&/Lami Polish/.test(gaps.textContent)};
  DB.edgeAllowance=keep;normalizeEdgeAllowance();render();return r;
 }),{ok:'+1/16″ per side',blocked:'No rule — cutting is blocked',gaps:true});

 eq('счётчик строк без итогов колонок — на всю ширину, не «2…»; цена в списке и карточке со своей единицей',await run(()=>{
  tab='masterdata';mdCatalogGo('iguPart');render();
  const td=document.querySelector('[data-md-catalog] tfoot .sl-foot-head'),th=document.querySelectorAll('[data-md-catalog] thead th').length;
  mdCatalogGo('spandrelProduct');render();
  const price=[...document.querySelectorAll('[data-md-catalog] tbody tr')][0].textContent;
  mdCatEditRow(DB.spandrelProduct[0].id);
  const label=document.querySelector('[data-md-price-unit]').textContent,units=[...document.querySelectorAll('#md_salesunit option')].map(o=>o.value);
  mdCatCancel&&mdCatCancel();
  return {span:+td.getAttribute('colspan')===th-1,count:/^\d+ rows$/.test(td.textContent.trim()),perFt:/per sq ft/.test(price),label,units};
 }),{span:true,count:true,perFt:true,label:'per sq ft',units:['','inch','each']});

 /* Счёт Spiel владельца (17.11.2026): 6 мм SPANDREL BLACK TEMPERED, стекло
    7.65/ft², Backpainting 2.95/ft² — оба от 4 ft² минимума своей карточки,
    стороны вверх до дюйма, площадь вверх до десятой. */
 await t.p.evaluate(()=>{
  window.o17Order=sizes=>{
   tab='sales';salesOrderNew();salesSetUnitType('single');
   const g=glassProductByCode('6CLEAR'),sp=mdById('spandrelProduct','SPAN-SILICONE');
   g.salePriceTempered=7.65;g.minAreaFt2=4;sp.salePrice=2.95;sp.minAreaFt2=4;sp.salesUnit='';
   const m=soDraft.makeups[0],p=m.panes[0];
   Object.assign(p,{category:'spandrel',glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT',priceOverride:null});
   p.spandrel=Object.assign({},p.spandrel||{},{productId:sp.id});
   soDraft.lines=sizes.map(([w,h])=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:1});salesEnsureLineShape(l);return l;});
   return {o:soDraft,m,g,sp};
  };
  window.o17Money=(o,m)=>o.lines.map(l=>{
   const a=salesLineAreas(l,o),mat=salesLineMaterials(m,a,o).rows.find(r=>r.table==='glassProduct');
   const glaze=salesLineChargeRowsRaw(l,undefined,o).find(r=>String(r.key).indexOf('GLAZE:')===0);
   return [a.rounded,+mat.amount.toFixed(4),+(glaze.basis*glaze.catalogRate).toFixed(4)];
  });
 });
 eq('эталон Spiel: стекло и Backpainting каждой детали — от площади вверх до дюйма и до десятой, деталь 2.4 ft² — от 4 ft² карточки',await run(()=>{
  const {o,m}=o17Order([[38+1/16,16+5/8],[38+1/16,53+3/8],[19.75,16+5/8],[19.75,53+3/8]]);
  const r=o17Money(o,m);salesDraftDrop(true);return r;
 }),[[4.7,35.955,13.865],[14.7,112.455,43.365],[2.4,30.6,11.8],[7.5,57.375,22.125]]);

 eq('каждый сам по себе: в карточке Spandrel 3 — спандрел от 3 при стекле 4; заказ по макапу главнее: стекло 1 → 2.4 ft², спандрел 0 → настоящая',await run(()=>{
  const {o,m,sp}=o17Order([[19.75,16+5/8]]);
  sp.minAreaFt2=3;const own=o17Money(o,m)[0];
  o.minArea={[m.id]:{['glassProduct:'+glassProductByCode('6CLEAR').id]:1,['spandrelProduct:'+sp.id]:0}};
  const order=o17Money(o,m)[0];
  salesDraftDrop(true);sp.minAreaFt2=4;return {own,order};
 }),{own:[2.4,30.6,8.85],order:[2.4,18.36,7.08]});

 eq('Spandrel за погонный дюйм: периметр вверх до дюйма, строка в дюймах',await run(()=>{
  const {o,sp}=o17Order([[19.75,16+5/8]]);sp.salesUnit='inch';
  const g=salesLineChargeRowsRaw(o.lines[0],undefined,o).find(r=>String(r.key).indexOf('GLAZE:')===0);
  salesDraftDrop(true);sp.salesUnit='';return [g.basis,g.unit];
 }),[74,'in']);

 eq('работа за ft² — свой минимум карточки Works; в заказе по макапу — своё число',await run(()=>{
  const {o,m}=o17Order([[14,18]]);const p=m.panes[0];p.category='vision';p.heatSoak=true;
  const w=salesServiceRateRow('heat_soak'),was=w.minAreaFt2;w.minAreaFt2=4;
  const soak=()=>salesLineChargeRowsRaw(o.lines[0],undefined,o).find(r=>String(r.key).indexOf('HEATSOAK:')===0).basis;
  const card=soak();o.minArea={[m.id]:{'serviceRate:heat_soak':2}};const order=soak();
  w.minAreaFt2=null;delete o.minArea;const none=soak();
  salesDraftDrop(true);w.minAreaFt2=was;return {card,order,none};
 }),{card:4,order:2,none:1.75});

 eq('правка данных 12: стёклам и работам за ft² — 4, распоркам — 1, своё число остаётся; общий Minimum area выключен',await run(()=>{
  const g=DB.glassProduct[0],g2=DB.glassProduct[1],sp=DB.spacerVariant[0],w=salesServiceRateRow('heat_soak'),min=DB.serviceRate.find(r=>r.rule&&r.rule.kind==='minArea');
  g.minAreaFt2=null;g2.minAreaFt2=2;sp.salesUnit='';sp.minAreaFt2=null;w.minAreaFt2=null;min.active=true;DB.dataFix=11;
  applyDataFixes();
  return [g.minAreaFt2,g2.minAreaFt2,sp.minAreaFt2,w.minAreaFt2,min.active,DB.dataFix];
 }),[4,2,1,4,false,12]);

 eq('окно Surcharges: минимум по макапу на виду — стекло, спандрел; число заказа пишется в order.minArea',await run(()=>{
  const {o,m,sp}=o17Order([[19.75,16+5/8]]);
  const html=salesOrderMinPanel(),parts=[...new DOMParser().parseFromString(html,'text/html').querySelectorAll('[data-order-min]')].map(x=>x.getAttribute('data-order-min').split(':')[0]);
  salesSetOrderMin(m.id,'spandrelProduct:'+sp.id,'2');const stored=o.minArea&&o.minArea[m.id]['spandrelProduct:'+sp.id],log=salesSurchargeLogNotes({},o);
  salesSetOrderMin(m.id,'spandrelProduct:'+sp.id,'');const cleared=!o.minArea;
  salesDraftDrop(true);return {parts,stored,cleared,log:log.length===1&&/^Minimum area · .* → 2 ft²$/.test(log[0])};
 }),{parts:['glassProduct','spandrelProduct'],stored:2,cleared:true,log:true});

 eq('правки 17.11 без ошибок страницы',t.errs,[]);await t.c.close();
};
