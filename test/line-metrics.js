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
 eq('commercial area always rounds upward to the next tenth before Qty',await t.p.evaluate(()=>{
  const a=metricFixture('single',33,80,1).l,b=metricFixture('single',40,40,10).l;
  const aa=salesLineAreas(a,soDraft),bb=salesLineAreas(b,soDraft);
  return [aa.actual.toFixed(4),aa.rounded,aa.billable,bb.actual.toFixed(4),bb.rounded,bb.billable*10];
 }),['18.3333',18.4,18.4,'11.1111',11.2,112]);
 eq('order charges follow Subtotal -> ES -> HST -> Card -> fixed Delivery and Skid Deposit',await t.p.evaluate(()=>{
  const c={energy:{enabled:true,rate:9.75},hst:{enabled:true,rate:13},card:{enabled:true,network:'visa',rate:2.34},delivery:{enabled:true,amount:500},skidDeposit:{enabled:true,amount:750}};
  const x=salesApplyOrderCharges(13000,c),deliveryOnly=salesApplyOrderCharges(13000,{energy:{enabled:false},hst:{enabled:false},card:{enabled:false},delivery:{enabled:true,amount:500}});
  return {x:[x.subtotal,x.energy,x.hstBase,x.hst,x.cardBase,x.card,x.delivery,x.skidDeposit,x.grand],deliveryOnly:deliveryOnly.grand};
 }),{x:[13000,1267.5,14267.5,1854.78,16122.28,377.26,500,750,17749.54],deliveryOnly:13500});
 eq('new order snapshots ES 9.75 and HST 13 while card, delivery and skid deposit are optional',await t.p.evaluate(()=>{
  const o=newSalesOrderDraft(),c=o.orderCharges;return [c.energy.enabled,c.energy.rate,c.hst.enabled,c.hst.rate,c.card.enabled,c.card.network,c.card.rate,c.delivery.enabled,c.delivery.amount,c.skidDeposit.enabled,c.skidDeposit.amount];
 }),[true,9.75,true,13,false,'visa',2.34,false,0,false,0]);
 eq('Service + opens editable charges and fixed delivery/skid amounts with a stable breakdown',await t.p.evaluate(()=>{
  metricFixture('single',47,73.5,2);render();
  const summary=document.querySelector('.metric-order-total'),before={button:summary.querySelector('.metric-order-service-add').textContent.trim(),labels:[...summary.querySelectorAll('.metric-order-charge-item:not(.is-empty) .metric-order-charge-label')].map(x=>x.textContent.replace(/\s+/g,' ').trim())};
  salesOpenMetrics('orderCharges');
  const modal=document.querySelector('.metric-order-charge-editor'),initial={checked:modal.querySelectorAll('input[type="checkbox"]:checked').length,rates:[...modal.querySelectorAll('input[type="number"]')].map(x=>+x.value),cards:[...modal.querySelectorAll('select option')].map(x=>x.value)};
  salesSetOrderChargeEnabled('card',true);salesSetOrderChargeEnabled('delivery',true);salesSetOrderChargeValue('delivery','amount','500');salesSetOrderChargeEnabled('skidDeposit',true);salesSetOrderChargeValue('skidDeposit','amount','750');
  const after=salesOrderCommercialTotals(soDraft),text=document.querySelector('.metric-order-total').textContent.replace(/\s+/g,' ').trim();
  return {before,initial,after:[after.subtotal,after.energy,after.hst,after.card,after.delivery,after.skidDeposit,after.grand],shown:['ES','HST','Visa card fee','Delivery','Skid Deposit','Total'].every(x=>text.includes(x)),slots:document.querySelector('.metric-order-charge-preview').querySelectorAll('.metric-order-charge-item').length,printButton:/metric-order-service-add/.test(salesOrderPrintMarkup())};
 }),{before:{button:'Service +',labels:['Subtotal','ES 9.75%','HST 13%','Total']},initial:{checked:2,rates:[9.75,13,2.34,0,0],cards:['visa','mastercard','amex']},after:[242,23.6,34.53,7.02,500,750,1557.15],shown:true,slots:7,printButton:false});
 eq('Triple base 100 -> 150; Qty is applied once',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',12,12,3),p=salesLineCommercialPrice(l,soDraft);
  return {base:p.base,adjustments:p.adjustments.map(a=>a.amount),unit:p.unit,line:p.line};
 }),{base:100,adjustments:[50],unit:150,line:450});
 eq('Triple + Large: additive, each percentage of the base unit price',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,84,2),p=salesLineCommercialPrice(l,soDraft);
  return {base:p.base,adjustments:p.adjustments.map(a=>[a.base,a.amount]),unit:p.unit,line:p.line};
 }),{base:1750,adjustments:[[1750,875],[1750,875]],unit:3500,line:7000});
 eq('Triple and over-60 adjustments are visible in the Services cell and both Services dialogs',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,84,2),price=salesLineCommercialPrice(l,soDraft),serviceTotal=salesLinePricingSummary(l).total;render();
  const cell=document.querySelector('.line-services-cell').textContent.replace(/\s+/g,' ').trim();salesOpenLineServices(l.id);
  const lineDialog=document.querySelector('.sales-service-modal').textContent.replace(/\s+/g,' ').trim();salesCloseServices();salesOpenOrderServices();
  const orderDialog=document.querySelector('.sales-service-modal').textContent.replace(/\s+/g,' ').trim();
  return {cell:[cell.includes('TRI +50%'),cell.includes('>60 +50%')],line:[lineDialog.includes('Triple units'),lineDialog.includes('Large units > 60 ft²')],order:[orderDialog.includes('Triple units'),orderDialog.includes('Large units > 60 ft²')],cyrillic:Array.from(new Set((lineDialog+orderDialog).match(/[^ ]*[А-Яа-яЁё][^ ]*/g)||[])),serviceTotal:serviceTotal,unit:price.unit};
 }),{cell:[true,true],line:[true,true],order:[true,true],cyrillic:[],serviceTotal:0,unit:3500});
 eq('60 ft² is not oversized, even when Qty is 100',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,72,100),html=salesLineServicesSummary(l);return [salesLineCommercialPrice(l,soDraft).adjustments.map(a=>a.key),html.includes('&gt;60')||html.includes('>60')];
 }),[['triple'],false]);
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
 eq('unmeasured spacer sizes derive an editable estimate from the 17/32 average and thickness',await t.p.evaluate(()=>{
  DB.materialWeightRates=JSON.parse(JSON.stringify(SALES_WEIGHT_RATE_DEFAULTS));salesNormalizeWeightRates();
  const ref=mdById('spacerVariant','SP-BWE-1732'),target=mdById('spacerVariant','SP-BL-916'),key='spacer:'+target.id,originalMm=target.thicknessMm;
  const expected=.03*spacerThicknessMm(target)/spacerThicknessMm(ref);target.thicknessMm=20;salesNormalizeWeightRates();let row=DB.materialWeightRates.find(r=>r.key===key),recalculated=row.rate;mdWeightSet(key,'50',1000);target.thicknessMm=25;salesNormalizeWeightRates();row=DB.materialWeightRates.find(r=>r.key===key);target.thicknessMm=originalMm;
  return {grams:+(expected*1000).toFixed(3),recalculated:+(recalculated*1000).toFixed(3),manual:+(row.rate*1000).toFixed(3),derived:row.derived,note:row.note,editable:row.unit};
 }),{grams:31.778,recalculated:44.444,manual:50,derived:false,note:'Calculated estimate · 17/32 average × thickness ratio',editable:'kg/ft²'});
 eq('Triple mass includes three glasses and both complete cavity assemblies',await t.p.evaluate(()=>{
 const {l,m}=metricFixture('triple',40,40,2);DB.materialWeightRates=[];
  m.cavities.forEach(c=>mdById('spacerVariant',c.spacerVariantId).thicknessMm=12);
  const rates={spacer:.1,desiccant:.02,connectors:.03,seal:.04,gas:1.8};
  salesLineWeight(l,soDraft).rows.filter(r=>r.key).forEach(r=>{if(!DB.materialWeightRates.some(x=>x.key===r.key))DB.materialWeightRates.push({key:r.key,rate:rates[r.key.split(':')[0]]});});
  const w=salesLineWeight(l,soDraft),a=(40*.0254)**2,ft2=40*40/144;
  const expected=3*a*.006*2500+2*(ft2*(.1+.02+.04+.04)+.03+a*.012*1.8);
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
 eq('Shape Unit applies to shaped DGU/TGU, never to shaped Single Lite',await t.p.evaluate(()=>{
  const single=metricFixture('single',48,36,1),s=newShapeDef('raked');s.id='metrics-raked';s.w='48';s.h='36';Object.assign(s.params,{shortHeight:'24',rakeSide:'top',shortSide:'right'});DB.shapeDef.push(s);single.l.shapeRef=salesShapeRefFrom(s);
  const a=salesLineAreas(single.l,soDraft),singleShape=salesLineChargeRows(single.l).find(r=>r.key==='SURCHARGE:shape-unit');
  const dgu=metricFixture('double',48,36,1);dgu.l.shapeRef=salesShapeRefFrom(s);const dguShape=salesLineChargeRows(dgu.l).find(r=>r.key==='SURCHARGE:shape-unit');
  return [a.actual,a.rounded,a.billable,!!singleShape,dguShape&&dguShape.basis];
 }),[10,12,12,false,12]);
 eq('removing a Shape clears its geometry, lite Shapes and Shape services',await t.p.evaluate(()=>{
  const {l}=metricFixture('single',12,12,1),old=salesShapeByRef(l.shapeRef);old.type='raked';old.w='41';old.h='50';old.params={shortHeight:'30',rakeSide:'top',shortSide:'right'};old.edgeOps={A:[shapeNormalizeOp({type:'Mitering',angle:45,side:'front'})]};
  const lite=newShapeDef('rectangle');lite.id='metrics-old-lite';lite.ownerLineId=l.id;DB.shapeDef.push(lite);l.liteShapes={'0':salesShapeRefFrom(lite)};const oldId=old.id;
  salesUnlinkShape(0);const now=salesShapeByRef(l.shapeRef),a=salesLineAreas(l,soDraft);
  return [DB.shapeDef.some(s=>s.id===oldId),DB.shapeDef.some(s=>s.id===lite.id),salesShapeIsLineRect(now),now.w,now.h,a.actual,a.rounded,salesLineChargeRows(l).some(r=>r.key==='SURCHARGE:shape-unit')];
 }),[false,false,true,'12','12',1,1,false]);
 eq('opening an older order repairs a stale line-owned rectangle',await t.p.evaluate(()=>{
  const {l}=metricFixture('single',12,12,1),s=salesShapeByRef(l.shapeRef);s.w='41';s.h='50';salesEnsureAllLineShapes();const a=salesLineAreas(l,soDraft);return [s.w,s.h,a.actual,a.rounded];
 }),['12','12',1,1]);
 eq('Frit on each laminated ply is included in service pricing',await t.p.evaluate(()=>{
  const {l,m}=metricFixture('single',48,36,2),p=m.panes[0];p.category='laminated';
  const product=DB.fritProduct[0];product.salePrice=3;
  [p.laminated.outer,p.laminated.inner].forEach(ply=>Object.assign(ply.frit,{enabled:true,productId:product.id}));
  const r=salesLineChargeRows(l).find(r=>r.key==='GLAZE:frit:'+product.id);return [r.basis,r.catalogRate,r.basis*l.qty*r.catalogRate];
 }),[24,3,144]);
 await t.p.evaluate(()=>{metricFixture();render();});
 await t.p.locator('[data-so-width]').fill('48');
 await t.p.locator('[data-so-width]').press('Tab');
 eq('changing Width refreshes Shape and every metric without losing Tab focus',await t.p.evaluate(()=>({shape:salesShapeByRef(soDraft.lines[0].shapeRef).w,actual:document.querySelector('td[data-metric="actual"] b').textContent,rounded:document.querySelector('td[data-metric="rounded"] b').textContent,price:document.querySelector('td[data-metric="unitPrice"] b').textContent,heightFocused:document.activeElement===document.querySelectorAll('.line-dim')[1]})),{shape:'48',actual:'24.5000',rounded:'24.7',price:'123.50',heightFocused:true});
 await t.p.locator('[data-so-width]').fill('');await t.p.locator('[data-so-width]').press('Tab');
 eq('invalid dimension clears the previously displayed price',await t.p.locator('td[data-metric="unitPrice"] b').textContent(),'—');
 await t.p.evaluate(()=>{metricFixture();render();salesOpenMetrics('columns');});
 eq('table headers stay compact and do not repeat units',await t.p.evaluate(()=>Array.from(document.querySelectorAll('th.line-metric')).every(th=>!/(ft²|CAD|kg)/.test(th.textContent))),true);
 eq('metric cells contain values only; explanations stay behind the click',await t.p.evaluate(()=>document.querySelectorAll('td.line-metric small').length),0);
 await t.p.getByLabel('screen Unit Weight',{exact:true}).check();
 eq('visibility changes leave pricing untouched',await t.p.evaluate(()=>[salesMetricColumnsFor('screen').some(c=>c.key==='unitWeight'),salesLineCommercialPrice(soDraft.lines[0],soDraft).line]),[true,242]);
 await t.p.getByLabel('print Unit Weight',{exact:true}).uncheck();
 eq('screen and print column choices are independent',await t.p.evaluate(()=>[salesMetricColumnsFor('screen').some(c=>c.key==='unitWeight'),salesOrderPrintMarkup().includes('data-metric="unitWeight"')]),[true,false]);
 const profile=await t.p.evaluate(()=>DB.user[0].viewProfileId);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.getByLabel('screen Line Weight',{exact:true}).check();
 await t.p.evaluate(()=>salesMoveMetricColumn('lineTotal',-1));
 await t.p.evaluate(()=>salesMoveMetricColumn('notes',-1));
 await t.p.locator('.metric-profile select').selectOption('browser');
 eq('each profile has its own choices',await t.p.evaluate(()=>salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight')),false);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.evaluate(()=>{soDraft=null;soEdit=null;});await t.p.reload();
 eq('profile, choices and reordered base/metric columns persist after reload',await t.p.evaluate(()=>[salesLoadViewPrefs().active,salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight'),salesMetricOrder().indexOf('lineTotal')<salesMetricOrder().indexOf('unitPrice'),salesOrderScreenColumns().indexOf('notes')<salesOrderScreenColumns().indexOf('unitPrice')]),[profile,true,true,true]);
 await t.p.evaluate(()=>{tab='sales';salesOrderNew();salesSetUnitType('single');const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');g.actualThicknessMm=6;m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5;p.heatTreatmentId='HT-AN';});const l=normalizeSalesOrderLine({makeupId:m.id,width16:47*16,height16:73.5*16,qty:2});soDraft.lines=[l];salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>salesEnsureChargePricing(l,r).orderRate=0);render();salesOpenMetrics('columns');salesResetMetricColumns('screen');});
 eq('reset restores only the selected context',await t.p.evaluate(()=>salesMetricColumnsFor('screen').map(c=>c.key)),['materials','actual','rounded','unitPrice','lineTotal']);
 eq('Materials is visible beside Services and opens the existing unit-price breakdown',await t.p.evaluate(()=>{const cols=salesOrderScreenColumns(),line=soDraft.lines[0],holder=document.createElement('tr');holder.innerHTML=salesMetricCell(line,SALES_METRIC_COLUMNS.find(c=>c.key==='materials'),'screen');document.body.append(holder);const cell=holder.querySelector('button'),value=cell.textContent.trim();cell.click();holder.remove();return {afterServices:cols.indexOf('materials')===cols.indexOf('services')+1,value:value,panel:salesMetricsPanel};}),{afterServices:true,value:'121.00',panel:'price'});
 eq('provided shop weight norms are editable Master Data in grams',await t.p.evaluate(()=>{salesNormalizeWeightRates();mdTab='weight';const r=DB.materialWeightRates.find(x=>x.key==='spacer:SP-BWE-1732');mdWeightSet(r.key,'31',1000);return [r.rate,viewMdWeight().includes('Polysulphide + catalyst')];}),[.031,true]);
 eq('legacy placeholder ones migrate to shop norms; gas uses nominal cavity volume',await t.p.evaluate(()=>{DB.materialWeightRates=SALES_WEIGHT_RATE_DEFAULTS.map(d=>({key:d.key,rate:1,note:''}));salesNormalizeWeightRates();salesOrderNew();salesSetUnitType('double');const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');g.actualThicknessMm=6;m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;});const l=normalizeSalesOrderLine({makeupId:m.id,width16:192,height16:192,qty:1});soDraft.lines=[l];salesEnsureLineShape(l);const w=salesLineWeight(l,soDraft),rate=k=>DB.materialWeightRates.find(r=>r.key===k).rate,gas=w.rows.find(r=>r.key==='gas:GAS-ARGON'),connectors=w.rows.find(r=>r.key==='connectors:SP-BWE-1732'),master=mdWeightDisplay(DB.materialWeightRates.find(r=>r.key==='connectors:SP-BWE-1732'));return [rate('spacer:SP-BWE-1732'),rate('desiccant:SP-BWE-1732'),rate('seal:SEAL-PIB:SP-BWE-1732'),rate('seal:SEAL-PS:SP-BWE-1732'),rate('connectors:SP-BWE-1732'),rate('gas:GAS-ARGON'),gas.basis>0,connectors.kg,salesWeightNormDisplay(connectors),master];}),[.03,.033,.005,.127,.04,1.784,true,.04,{value:'40',unit:'g/unit',factor:1000},{value:40,unit:'g/unit',factor:1000}]);
 eq('Print and saved-order Update live in the order header; row Status is folded into Set',await t.p.evaluate(()=>{soEdit='saved-order';render();const l=soDraft.lines[0],top=document.querySelector('.sales-editor-actions').textContent,head=document.querySelector('.sales-lines-table thead').textContent;salesDropLineOwnedShape(l);l.shapeRef=normalizeShapeRef({});l.width16=null;l.height16=null;render();const badge=document.querySelector('.ss-badge');return [top.includes('Print'),top.includes('Update'),head.includes('Status'),badge.classList.contains('issue'),badge.textContent.trim()];}),[true,true,false,true,'!']);
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
