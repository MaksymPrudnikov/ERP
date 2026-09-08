/* End-to-end commercial metrics and view preferences, run against src and dist. */
module.exports=async function({page,eq,ok}){
 const t=await page();
 await t.p.evaluate(()=>{
  window.metricFixture=function(type='single',w=47,h=73.5,qty=2){
   tab='sales';salesOrderNew();salesSetUnitType(type);
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');g.actualThicknessMm=6;
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5;p.heatTreatmentId='HT-AN';});
   m.cavities.forEach(c=>{c.priceOverride=5;});
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:qty});soDraft.lines=[l];salesEnsureLineShape(l);
   salesLineChargeRows(l).forEach(r=>salesEnsureChargePricing(l,r).orderRate=0);
   return {l,m,g};
  };
 });
 eq('47 × 73½: true area, whole-inch dimensions, one decimal for billing',await t.p.evaluate(()=>{
  const {l}=metricFixture();const a=salesLineAreas(l,soDraft),p=salesLineCommercialPrice(l,soDraft);
  return {actual:a.actual.toFixed(4),rounded:a.rounded,billed:a.billable,price:p.unit,line:p.line};
 }),{actual:'23.9896',rounded:24.2,billed:24.2,price:121,line:242});
 eq('minimum billing area does not alter actual area or weight',await t.p.evaluate(()=>{
  const {l}=metricFixture('single',12,12,3),a=salesLineAreas(l,soDraft),w=salesLineWeight(l,soDraft);
  return {areas:[a.actual,a.rounded,a.billable],unit:Math.round(w.kg*1e6),line:Math.round(w.lineKg*1e6)};
 }),{areas:[1,1,4],unit:1393546,line:4180637});
 eq('Triple base 100 -> 150; Qty is applied once',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',12,12,3),p=salesLineCommercialPrice(l,soDraft);
  return {base:p.base,adjustments:p.adjustments.map(a=>a.amount),unit:p.unit,line:p.line};
 }),{base:100,adjustments:[50],unit:150,line:450});
 eq('Triple + Large: additive, each percentage of the base unit price',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,84,2),p=salesLineCommercialPrice(l,soDraft);
  return {base:p.base,adjustments:p.adjustments.map(a=>[a.base,a.amount]),unit:p.unit,line:p.line};
 }),{base:1750,adjustments:[[1750,875],[1750,875]],unit:3500,line:7000});
 eq('60 ft² is not oversized, even when Qty is 100',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,72,100);return salesLineCommercialPrice(l,soDraft).adjustments.map(a=>a.key);
 }),['triple']);
 eq('surcharges include service charges in their common base',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',12,12,1);const row=salesLineChargeRows(l)[0];salesEnsureChargePricing(l,row).orderRate=10/row.basis;
  const p=salesLineCommercialPrice(l,soDraft);return [p.base,p.adjustments[0].amount,p.unit];
 }),[110,55,165]);
 eq('missing material, missing service, and USD cannot masquerade as complete totals',await t.p.evaluate(()=>{
  const {l,m,g}=metricFixture();m.panes[0].priceOverride=null;g.salePriceAnnealed=null;
  const a=salesLineCommercialPrice(l,soDraft).unit;m.panes[0].priceOverride=5;
  const r=salesLineChargeRows(l)[0];l.chargePricing[r.key]={catalogRate:null,orderRate:null};const b=salesLineCommercialPrice(l,soDraft).unit;
  l.chargePricing[r.key].orderRate=0;soDraft.currency='USD';return [a,b,salesLineCommercialPrice(l,soDraft).unit];
 }),[null,null,null]);
 eq('saved order rules survive normalization and changes to defaults',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',12,12,1);soDraft.metricRules=salesMetricRules(soDraft);
  DB.salesMetricRules.triplePercent=80;soDraft=normalizeSalesOrder(JSON.parse(JSON.stringify(soDraft)));
  const p=salesLineCommercialPrice(soDraft.lines[0],soDraft);DB.salesMetricRules.triplePercent=50;
  return [soDraft.metricRules.triplePercent,p.unit];
 }),[50,150]);
 eq('missing component weights stay incomplete rather than becoming zero',await t.p.evaluate(()=>{
  const {l}=metricFixture('double',40,40,2);DB.materialWeightRates=[];
  const w=salesLineWeight(l,soDraft);return [w.complete,w.kg,w.lineKg,w.missing,w.knownKg>0];
 }),[false,null,null,6,true]);
 eq('Triple mass includes three glasses and both complete cavity assemblies',await t.p.evaluate(()=>{
  const {l,m}=metricFixture('triple',40,40,2);DB.materialWeightRates=[];
  m.cavities.forEach(c=>mdById('spacerVariant',c.spacerVariantId).thicknessMm=12);
  const rates={spacer:.1,desiccant:.02,connectors:.03,seal:.04,gas:1.8};
  salesLineWeight(l,soDraft).rows.filter(r=>r.key).forEach(r=>{if(!DB.materialWeightRates.some(x=>x.key===r.key))DB.materialWeightRates.push({key:r.key,rate:rates[r.key.split(':')[0]]});});
  const w=salesLineWeight(l,soDraft),a=(40*.0254)**2,p=4*40*.0254;
  const expected=3*a*.006*2500+2*(p*(.1+.02+.04+.04)+.03+a*.012*1.8);
  return [w.complete,Math.abs(w.kg-expected)<1e-8,Math.abs(w.lineKg-2*expected)<1e-8,w.rows.length];
 }),[true,true,true,15]);
 eq('laminated mass counts both plies and the exact film stack; extra mass persists',await t.p.evaluate(()=>{
  const {l,m,g}=metricFixture('single',40,40,3);const p=m.panes[0];p.category='laminated';
  [p.laminated.outer,p.laminated.inner].forEach(ply=>{ply.glassProductId=g.id;ply.thicknessMm=6;});
  p.laminated.interlayers=[normalizeSalesInterlayer({productId:INTERLAYER_DEFAULT_ID,layers:3})];
  DB.materialWeightRates=[{key:'film:'+INTERLAYER_DEFAULT_ID,rate:1070}];l.weightExtras=[{label:'Supplied bracket',kg:.5}];
  soDraft=normalizeSalesOrder(JSON.parse(JSON.stringify(soDraft)));
  const w=salesLineWeight(soDraft.lines[0],soDraft),a=(40*.0254)**2,expected=a*(.012*2500+.00114*1070)+.5;
  return [w.complete,Math.abs(w.kg-expected)<1e-8,Math.abs(w.lineKg-3*expected)<1e-8,soDraft.lines[0].weightExtras[0].label];
 }),[true,true,true,'Supplied bracket']);
 eq('Muntin weight uses the common bar calculation, including manual positions',await t.p.evaluate(()=>{
  const {l}=metricFixture('double',40,40,1),s=salesShapeByRef(l.shapeRef);
  s.muntin={enabled:true,productId:'mb058_black',verticalBars:1,horizontalBars:1,vertical:['12'],horizontal:['17']};
  const got=shapeMuntinGeoFor(s),row=salesLineWeight(l,soDraft).rows.find(r=>r.key==='muntin:mb058_black');
  return !!got&&Math.abs(row.basis-got.result.totalLengthIn*.0254)<1e-9;
 }),true);
 eq('shaped Actual Area follows the contour while billing uses its rectangle',await t.p.evaluate(()=>{
  const {l}=metricFixture('single',48,36,1),s=newShapeDef('raked');s.id='metrics-raked';s.w='48';s.h='36';Object.assign(s.params,{shortHeight:'24',rakeSide:'top',shortSide:'right'});DB.shapeDef.push(s);l.shapeRef=salesShapeRefFrom(s);
  const a=salesLineAreas(l,soDraft),r=salesLineChargeRows(l).find(r=>r.key==='SURCHARGE:shape-unit');return [a.actual,a.rounded,a.billable,r.basis];
 }),[10,12,12,12]);
 eq('Frit on each laminated ply is included in service pricing',await t.p.evaluate(()=>{
  const {l,m}=metricFixture('single',48,36,2),p=m.panes[0];p.category='laminated';
  const product=DB.fritProduct[0];product.salePrice=3;
  [p.laminated.outer,p.laminated.inner].forEach(ply=>Object.assign(ply.frit,{enabled:true,productId:product.id}));
  const r=salesLineChargeRows(l).find(r=>r.key==='GLAZE:frit:'+product.id);return [r.basis,r.catalogRate,r.basis*l.qty*r.catalogRate];
 }),[24,3,144]);
 await t.p.evaluate(()=>{metricFixture();render();});
 await t.p.locator('[data-so-width]').fill('48');
 await t.p.locator('[data-so-width]').press('Tab');
 eq('changing Width refreshes metrics immediately without losing Tab focus',await t.p.evaluate(()=>({rounded:document.querySelector('td[data-metric="rounded"] b').textContent,price:document.querySelector('td[data-metric="unitPrice"] b').textContent,heightFocused:document.activeElement===document.querySelectorAll('.line-dim')[1]})),{rounded:'24.7',price:'123.50',heightFocused:true});
 await t.p.locator('[data-so-width]').fill('');await t.p.locator('[data-so-width]').press('Tab');
 eq('invalid dimension clears the previously displayed price',await t.p.locator('td[data-metric="unitPrice"] b').textContent(),'—');
 await t.p.evaluate(()=>{metricFixture();render();salesOpenMetrics('columns');});
 await t.p.getByLabel('screen Unit Weight',{exact:true}).check();
 eq('visibility changes leave pricing untouched',await t.p.evaluate(()=>[salesMetricColumnsFor('screen').some(c=>c.key==='unitWeight'),salesLineCommercialPrice(soDraft.lines[0],soDraft).line]),[true,242]);
 await t.p.getByLabel('print Unit Weight',{exact:true}).uncheck();
 eq('screen and print column choices are independent',await t.p.evaluate(()=>[salesMetricColumnsFor('screen').some(c=>c.key==='unitWeight'),salesOrderPrintMarkup().includes('data-metric="unitWeight"')]),[true,false]);
 const profile=await t.p.evaluate(()=>DB.user[0].viewProfileId);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.getByLabel('screen Line Weight',{exact:true}).check();
 await t.p.locator('.metric-profile select').selectOption('browser');
 eq('each profile has its own choices',await t.p.evaluate(()=>salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight')),false);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.evaluate(()=>{soDraft=null;soEdit=null;});await t.p.reload();
 eq('profile and choices persist after reload',await t.p.evaluate(()=>[salesLoadViewPrefs().active,salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight')]),[profile,true]);
 await t.p.evaluate(()=>{tab='sales';salesOrderNew();salesOpenMetrics('columns');salesResetMetricColumns('screen');});
 eq('reset restores only the selected context',await t.p.evaluate(()=>salesMetricColumnsFor('screen').map(c=>c.key)),['actual','rounded','unitPrice','lineTotal']);
 await t.p.evaluate(()=>{salesOpenMetrics('rules');});
 await t.p.locator('input[name="triplePercent"]').fill('40');
 await t.p.getByRole('button',{name:'Apply to this and new orders'}).click();
 eq('pricing settings update this order and persisted defaults',await t.p.evaluate(()=>[soDraft.metricRules.triplePercent,JSON.parse(localStorage.getItem('glazing_system_v1')).salesMetricRules.triplePercent]),[40,40]);
 await t.p.evaluate(()=>salesOpenMetrics('columns'));
 await t.p.setViewportSize({width:390,height:844});
 eq('column chooser fits a 390 px screen',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await t.p.getByRole('button',{name:'Close',exact:true}).last().click();
 eq('order table scroll remains local on mobile',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 eq('metrics have no browser errors',t.errs,[]);
 await t.c.close();
};
