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
  const o=newSalesOrderDraft(),c=o.orderCharges;return [c.energy.enabled,c.energy.rate,c.hst.enabled,c.hst.rate,c.card.enabled,c.card.network,c.card.rate,c.hst.base,c.card.base,c.delivery.enabled,c.delivery.amount,c.skidDeposit.enabled,c.skidDeposit.amount];
 }),[true,9.75,true,13,false,'visa',2.34,['energy'],['energy','hst'],false,0,false,0]);
 eq('Service + opens editable charges and packs enabled totals without gaps',await t.p.evaluate(()=>{
  metricFixture('single',47,73.5,2);render();
  const compactLayout=summary=>{const line=summary.querySelector('.metric-order-charge-lines'),items=[...line.querySelectorAll('.metric-order-charge-item')].filter(x=>getComputedStyle(x).display!=='none'),rects=items.map(x=>x.getBoundingClientRect()),labels=items.map(x=>x.querySelector('.metric-order-charge-label').textContent.replace(/\s+/g,' ').trim());return {labels,contiguous:rects.slice(1).every((r,i)=>Math.abs(rects[i].right-r.left)<.1),totalAnchored:Math.abs(rects[rects.length-1].right-line.getBoundingClientRect().right)<.1};};
  const summary=document.querySelector('.metric-order-total'),amountNodes=[...summary.querySelectorAll('.metric-order-charge-item>b')],before={button:summary.querySelector('.metric-order-service-add').textContent.trim(),layout:compactLayout(summary),currency:summary.querySelector('.metric-order-currency').textContent.trim(),currencyCount:summary.querySelectorAll('.metric-order-currency').length,amountCurrencyCount:amountNodes.filter(x=>/CAD/.test(x.textContent)).length,amountFontSizes:[...new Set(amountNodes.map(x=>getComputedStyle(x).fontSize))],noLaptopOverflow:summary.scrollWidth===summary.clientWidth};
  salesOpenMetrics('orderCharges');
  const modal=document.querySelector('.metric-order-charge-editor'),initial={checked:modal.querySelectorAll('input[type="checkbox"]:checked').length,rates:[...modal.querySelectorAll('input[type="number"]')].map(x=>+x.value),cards:[...modal.querySelectorAll('select option')].map(x=>x.value)};
  salesSetOrderChargeEnabled('card',true);salesSetOrderChargeEnabled('delivery',true);salesSetOrderChargeValue('delivery','amount','500');salesSetOrderChargeEnabled('skidDeposit',true);salesSetOrderChargeValue('skidDeposit','amount','750');
  const after=salesOrderCommercialTotals(soDraft),text=document.querySelector('.metric-order-total').textContent.replace(/\s+/g,' ').trim();
  return {before,initial,after:[after.subtotal,after.energy,after.hst,after.card,after.delivery,after.skidDeposit,after.grand],shown:['ES','HST','Visa card fee','Delivery','Skid Deposit','Total'].every(x=>text.includes(x)),slots:document.querySelector('.metric-order-charge-preview').querySelectorAll('.metric-order-charge-item').length};
 }),{before:{button:'Service +',layout:{labels:['Subtotal','ES 9.75%','HST 13%','Total'],contiguous:true,totalAnchored:true},currency:'CAD',currencyCount:1,amountCurrencyCount:0,amountFontSizes:['12px'],noLaptopOverflow:true},initial:{checked:2,rates:[9.75,13,2.34,0,0],cards:['visa','mastercard','amex']},after:[242,23.6,34.53,7.02,500,750,1557.15],shown:true,slots:7});
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
  return {cell:[cell.includes('Triple unit +50%'),cell.includes('Large unit +50%')],line:[lineDialog.includes('Triple units'),lineDialog.includes('area > 60 ft²')],order:[orderDialog.includes('Triple units'),orderDialog.includes('area > 60 ft²')],cyrillic:Array.from(new Set((lineDialog+orderDialog).match(/[^ ]*[А-Яа-яЁё][^ ]*/g)||[])),serviceTotal:serviceTotal,unit:price.unit};
 }),{cell:[true,true],line:[true,true],order:[true,true],cyrillic:[],serviceTotal:0,unit:3500});
 eq('60 ft² is not oversized, even when Qty is 100',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',120,72,100),html=salesLineServicesSummary(l);return [salesLineCommercialPrice(l,soDraft).adjustments.map(a=>a.key),html.includes('Large unit')];
 }),[['svc:triple'],false]);
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
 eq('saved order keeps its surcharges when the Works card changes later',await t.p.evaluate(()=>{
  const {l}=metricFixture('triple',12,12,1);soDraft.priceBook=salesPriceBookOf(soDraft);
  const w=DB.serviceRate.find(r=>r.id==='triple');w.tiers[0].price=80;soDraft=normalizeSalesOrder(JSON.parse(JSON.stringify(soDraft)));
  const p=salesLineCommercialPrice(soDraft.lines[0],soDraft);w.tiers[0].price=50;delete soDraft.priceBook;
  return [p.adjustments.map(a=>a.percent),p.unit];
 }),[[50],150]);
 eq('surcharge rules from Works: unit types, area over/under, on top and priority',await t.p.evaluate(()=>{
  const keep=JSON.stringify(DB.serviceRate);
  try{
   const {l}=metricFixture('double',120,84,1);
   const a=salesLineCommercialPrice(l,soDraft).adjustments.map(x=>x.key);
   DB.serviceRate.push(normalizeServiceRate({id:'smallDouble',name:'Small double',unit:'%',tiers:[{id:'flat',price:10}],rule:{kind:'percent',unitTypes:['double'],areaUnder:100,priority:3,onTop:true}}));
   const p=salesLineCommercialPrice(l,soDraft),b=p.adjustments.map(x=>[x.key,x.base]);
   DB.serviceRate.find(r=>r.id==='minArea').rule.unitTypes=['triple'];
   const {l:s}=metricFixture('double',12,12,1),min=salesLineAreas(s,soDraft).billable;
   return [a,b,p.base,min];
  }finally{DB.serviceRate=JSON.parse(keep);}
 }),[['svc:largeUnit'],[['svc:largeUnit',1050],['svc:smallDouble',1575]],1050,1]);
 /* Нормы обвязки — в карточках и рецепте (этап 3 плана Master Data);
    lmSurround меняет их на время проверки и возвращает назад. */
 await t.p.evaluate(()=>{window.lmSurround=function(fn){const keep=JSON.stringify({sp:DB.spacerVariant,rec:DB.surroundRecipe,gas:DB.gasProduct});
  try{return fn();}finally{const k=JSON.parse(keep);DB.spacerVariant=k.sp;DB.surroundRecipe=k.rec;DB.gasProduct=k.gas;}};});
 eq('missing component weights stay incomplete rather than becoming zero',await t.p.evaluate(()=>lmSurround(()=>{
  const {l,m}=metricFixture('double',40,40,2);const sp=mdById('spacerVariant',m.cavities[0].spacerVariantId);sp.weightG=null;
  surroundRecipeById(sp.recipeId).rows.forEach(r=>{r.amount=null;});mdById('gasProduct',m.cavities[0].gasProductId).densityKgM3=null;
  const w=salesLineWeight(l,soDraft);return [w.complete,w.kg,w.lineKg,w.missing,w.knownKg>0];
 })),[false,null,null,6,true]);
 eq('pre-phase-3 data migrates into cards: spacer weight not measured, recipe norms and gas density from old weight norms; old rows go',await t.p.evaluate(()=>lmSurround(()=>{
  const keepRates=DB.materialWeightRates;
  DB.surroundRecipe=undefined;DB.spacerVariant.forEach(sp=>{delete sp.recipeId;sp.salePrice=null;});
  DB.materialWeightRates=[{key:'glass',rate:2500},{key:'spacer:SP-BL-916',rate:.0321},{key:'seal:SEAL-PS:SP-BWE-1732',rate:.13},{key:'gas:GAS-ARGON',rate:1.8},{key:'film:X',rate:1070}];
  normalizeMasterData();
  const bl=mdById('spacerVariant','SP-BL-916'),al=mdById('spacerVariant','SP-AL-012'),bwe=surroundRecipeById('REC-BWE-1732');
  const out={bl:[bl.weightG,bl.weightPer,bl.weightMeasured,bl.recipeId,bl.salePrice],al:[al.salePrice,al.recipeId],ps:bwe.rows.find(r=>r.part==='secondary').amount,
   argon:mdById('gasProduct','GAS-ARGON').densityKgM3,left:DB.materialWeightRates.map(r=>r.key)};
  DB.materialWeightRates=keepRates;return out;
 })),{bl:[32.1,'ft2',false,'REC-STD',2.4],al:[2.4,'REC-STD'],ps:130,argon:1.8,left:['glass','film:X']});
 eq('Triple mass includes three glasses and both complete cavity assemblies',await t.p.evaluate(()=>lmSurround(()=>{
  const {l,m}=metricFixture('triple',40,40,2);
  m.cavities.forEach(c=>{const sp=mdById('spacerVariant',c.spacerVariantId);sp.thicknessMm=12;sp.weightG=100;sp.weightPer='ft2';mdById('gasProduct',c.gasProductId).densityKgM3=1.8;
   surroundRecipeById(sp.recipeId).rows.forEach(r=>{if(r.part==='iguPart:IGU-DESICCANT')r.amount=20;if(r.part==='primary'||r.part==='secondary')r.amount=40;if(r.part==='iguPart:IGU-CONNECTORS')r.amount=30;});});
  const w=salesLineWeight(l,soDraft),a=(40*.0254)**2,ft2=40*40/144;
  const expected=3*a*.006*2500+2*(ft2*(.1+.02+.04+.04)+.03+a*.012*1.8);
  return [w.complete,Math.abs(w.kg-expected)<1e-8,Math.abs(w.lineKg-2*expected)<1e-8,w.rows.length];
 })),[true,true,true,15]);
 eq('waste raises consumption, not the unit weight; a part sold by weight is billed on consumption',await t.p.evaluate(()=>lmSurround(()=>{
  const {l,m}=metricFixture('double',40,40,1),c=m.cavities[0],sp=mdById('spacerVariant',c.spacerVariantId),rec=surroundRecipeById(sp.recipeId),row=rec.rows.find(r=>r.part==='primary');
  const kg0=salesLineWeight(l,soDraft).kg;row.wastePct=10;const w=salesLineWeight(l,soDraft),pib=w.rows.find(r=>/^PIB/.test(r.label));
  c.priceOverride=null;const pibItem=mdById('sealantProduct',c.primarySealantId);pibItem.salePrice=20;pibItem.salesUnit='kg';
  const p=salesLineCommercialPrice(l,soDraft),bill=p.materialRows.find(r=>/PIB/.test(r.label));pibItem.salePrice=0;pibItem.salesUnit='';
  return {same:Math.abs(w.kg-kg0)<1e-9,used:Math.abs(pib.usedKg-pib.kg*1.1)<1e-12,billed:Math.abs(bill.amount-20*pib.usedKg)<1e-9,note:/10% waste/.test(pib.note)};
 })),{same:true,used:true,billed:true,note:true});
 eq('spacer sold per inch of perimeter: own row in the price, PIB per metre of perimeter in the weight',await t.p.evaluate(()=>lmSurround(()=>{
  const {l,m}=metricFixture('double',40,40,1),c=m.cavities[0],sp=mdById('spacerVariant',c.spacerVariantId),rec=surroundRecipeById(sp.recipeId);
  c.priceOverride=null;sp.salesUnit='inch';sp.salePrice=.09;rec.rows.find(r=>r.part==='primary').amount=5.5;rec.rows.find(r=>r.part==='primary').per='m';
  const p=salesLineCommercialPrice(l,soDraft),a=salesLineAreas(l,soDraft),row=p.materialRows.find(r=>r.label.indexOf(sp.name)>=0);
  const w=salesLineWeight(l,soDraft),pib=w.rows.find(r=>/^PIB/.test(r.label)),perM=160*.0254;
  return {qty:row.qty===a.perimeterIn,amount:Math.abs(row.amount-.09*a.perimeterIn)<1e-9,other:salesCavityOtherUnits(c),pib:Math.abs(pib.kg-5.5*perM/1000)<1e-6};
 })),{qty:true,amount:true,other:true,pib:true});
 eq('laminated mass counts both plies and the exact film stack; extra mass persists',await t.p.evaluate(()=>{
  const {l,m,g}=metricFixture('single',40,40,3);const p=m.panes[0];p.category='laminated';
  [p.laminated.outer,p.laminated.inner].forEach(ply=>{ply.glassProductId=g.id;ply.thicknessMm=6;});
  p.laminated.interlayers=[normalizeSalesInterlayer({productId:INTERLAYER_DEFAULT_ID,layers:3})];
  DB.materialWeightRates=[{key:'glass',rate:2500},{key:'film:'+INTERLAYER_DEFAULT_ID,rate:1070}];l.weightExtras=[{label:'Supplied bracket',kg:.5}];
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
  const product=DB.fritProduct[0];product.salePrice=3;touch();
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
 const profile=await t.p.evaluate(()=>DB.user[0].viewProfileId);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.getByLabel('screen Line Weight',{exact:true}).check();
 await t.p.evaluate(()=>salesMoveMetricColumn('lineTotal',-1));
 await t.p.evaluate(()=>salesMoveMetricColumn('notes',-1));
 await t.p.locator('.metric-profile select').selectOption('browser');
 eq('each profile has its own choices',await t.p.evaluate(()=>salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight')),false);
 await t.p.locator('.metric-profile select').selectOption(profile);
 await t.p.evaluate(()=>{soDraft=null;soEdit=null;});await t.p.reload();await t.p.evaluate(()=>window.storageReady);
 eq('profile, choices and reordered base/metric columns persist after reload',await t.p.evaluate(()=>[salesLoadViewPrefs().active,salesMetricColumnsFor('screen').some(c=>c.key==='lineWeight'),salesMetricOrder().indexOf('lineTotal')<salesMetricOrder().indexOf('unitPrice'),salesOrderScreenColumns().indexOf('notes')<salesOrderScreenColumns().indexOf('unitPrice')]),[profile,true,true,true]);
 await t.p.evaluate(()=>{tab='sales';salesOrderNew();salesSetUnitType('single');const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');g.actualThicknessMm=6;m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5;p.heatTreatmentId='HT-AN';});const l=normalizeSalesOrderLine({makeupId:m.id,width16:47*16,height16:73.5*16,qty:2});soDraft.lines=[l];salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>salesEnsureChargePricing(l,r).orderRate=0);render();salesOpenMetrics('columns');salesResetMetricColumns('screen');});
 eq('reset restores only the selected context',await t.p.evaluate(()=>salesMetricColumnsFor('screen').map(c=>c.key)),['materials','actual','rounded','unitPrice','lineTotal']);
 eq('Materials is visible beside Services and opens the existing unit-price breakdown',await t.p.evaluate(()=>{const cols=salesOrderScreenColumns(),line=soDraft.lines[0],holder=document.createElement('tr');holder.innerHTML=salesMetricCell(line,SALES_METRIC_COLUMNS.find(c=>c.key==='materials'),'screen');document.body.append(holder);const cell=holder.querySelector('button'),value=cell.textContent.trim();cell.click();holder.remove();return {afterServices:cols.indexOf('materials')===cols.indexOf('services')+1,value:value,panel:salesMetricsPanel};}),{afterServices:true,value:'121.00',panel:'price'});
 eq('surround norms are editable Master Data in grams: recipe row and spacer card',await t.p.evaluate(()=>{const r=surroundRecipeById('REC-BWE-1732'),i=r.rows.findIndex(x=>x.part==='secondary'),was=r.rows[i].amount;mdRecipeRowSet(r.id,i,'amount','131');const html=viewMdRecipes(),got=r.rows[i].amount;mdRecipeRowSet(r.id,i,'amount',String(was));return [got,html.includes('Secondary sealant of the cavity'),html.includes('Weight from the spacer card')];}),[131,true,true]);
 eq('seed norms are the pre-phase-3 numbers; gas uses nominal cavity volume',await t.p.evaluate(()=>{salesOrderNew();salesSetUnitType('double');const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');g.actualThicknessMm=6;m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;});const l=normalizeSalesOrderLine({makeupId:m.id,width16:192,height16:192,qty:1});soDraft.lines=[l];salesEnsureLineShape(l);const w=salesLineWeight(l,soDraft),r=surroundRecipeById('REC-BWE-1732'),amt=p=>r.rows.find(x=>x.part===p).amount,gas=w.rows.find(x=>/^Argon/.test(x.label)),connectors=w.rows.find(x=>/^Spacer connectors/.test(x.label));return [mdById('spacerVariant','SP-BWE-1732').weightG,amt('iguPart:IGU-DESICCANT'),amt('primary'),amt('secondary'),amt('iguPart:IGU-CONNECTORS'),mdById('gasProduct','GAS-ARGON').densityKgM3,gas.kg>0,connectors.kg,r.pibPerSideMm];}),[30,33,5,127,40,1.784,true,.04,.4]);
 eq('Documents and saved-order Update live in the order header; row Status is folded into Set',await t.p.evaluate(()=>{soEdit='saved-order';render();const l=soDraft.lines[0],top=document.querySelector('.sales-editor-actions').textContent,head=document.querySelector('.sales-lines-table thead').textContent;salesDropLineOwnedShape(l);l.shapeRef=normalizeShapeRef({});l.width16=null;l.height16=null;render();const badge=document.querySelector('.ss-badge');return [top.includes('Documents'),top.includes('Update'),head.includes('Status'),badge.classList.contains('issue'),badge.textContent.trim()];}),[true,true,false,true,'!']);
 await t.p.evaluate(()=>{salesOpenMetrics('rules');});
 eq('Surcharges panel lists the Works surcharges in force',await t.p.evaluate(()=>{const t=document.querySelector('[data-surcharge-list]').textContent;return [t.includes('Triple unit'),t.includes('+50%'),t.includes('min 4 ft²'),t.includes('Data → Works')];}),[true,true,true,true]);
 await t.p.evaluate(()=>salesOpenMetrics('columns'));
 await t.p.setViewportSize({width:390,height:844});
 eq('column chooser fits a 390 px screen',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await t.p.getByRole('button',{name:'Close',exact:true}).last().click();
 eq('order table scroll remains local on mobile',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 eq('cents: a half-cent tie rounds up whatever the float noise (98.175 + 2.82, 29.4 + 32.395, 1.005)',await t.p.evaluate(()=>[salesMoney(98.17499999999998+2.82),salesMoney(98.17499999999998+2.8200000000000003),salesMoney(29.4+32.394999999999996),salesMoney(29.4+32.395),salesMoney(1.005),salesMoney(0.1+0.2)]),[101,101,61.8,61.8,1.01,0.3]);
 eq('metrics have no browser errors',t.errs,[]);
 await t.c.close();
 /* Пункт 15 плана (владелец, 29.10.2026): числа надбавок меняются в окне
    Surcharges только для этого заказа. Контрольный заказ 17.3 — 90 × 120″
    Double 6CLEAR / BWE 17/32 ARG / 6CLEAR, Rough Arris: юнит 968.40, Large
    unit 50% → 1452.60. Возможность снимали 22.10 (v5.240) вместе с проверкой;
    эти проверки её сторожат. */
 const s=await page();await require('./optimization-fixture')(s.p);
 const p15Helpers=()=>{
  window.p15Order=function(w=90,h=120,type='double',customer){
   tab='sales';salesOrderNew();salesSetUnitType(type);const m=soDraft.makeups[0],l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:1});
   soDraft.lines=[l];salesEnsureLineShape(l);if(customer!==false)salesApplyCustomerDefaults((customer||oqCustomer({legalName:'Surcharge Co'})).id);render();return l;
  };
  window.p15Unit=()=>salesLineCommercialPrice(soDraft.lines[0],soDraft).unit;
  /* Ввод как у человека: поле окна Surcharges, событие change. */
  window.p15Type=function(id,field,value){
   tab='sales';salesOpenMetrics('rules');
   const el=document.querySelector(`[data-surcharge-input="${id}:${field}"]`);if(!el)return;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));
  };
  window.p15Switch=function(id,on){tab='sales';salesOpenMetrics('rules');const el=document.querySelector(`[data-surcharge="${id}"] input[type=checkbox]`);if(!el)return;el.checked=on;el.dispatchEvent(new Event('change',{bubbles:true}));};
  window.p15Row=id=>{const r=document.querySelector(`[data-surcharge="${id}"]`);if(!r)return null;return {off:r.classList.contains('off'),on:r.querySelector('input[type=checkbox]').checked,tag:r.querySelector('.sales-rate-origin').textContent,value:r.querySelector(`[data-surcharge-input="${id}:value"]`).value};};
  window.p15Works=id=>DB.serviceRate.find(r=>r.id===id).tiers[0].price;
 };
 await s.p.evaluate(p15Helpers);
 /* Узкая запись (X-01): Save → F5 через 2 с, до сверки в простое. */
 const sf5=async()=>{await s.p.evaluate(()=>storageFlush());await s.p.waitForTimeout(2000);await s.p.reload();await s.p.evaluate(()=>window.storageReady);await require('./optimization-fixture')(s.p);await s.p.evaluate(p15Helpers);};
 const p15=await s.p.evaluate(()=>{
  p15Order();const before=p15Unit();p15Type('largeUnit','value','40');
  const row=p15Row('largeUnit'),badge=document.querySelector('[data-surcharge-badge]')?.textContent;
  salesOpenLineServices(soDraft.lines[0].id);const own=(document.querySelector('[data-surcharge-own]')?.textContent||'').replace(/\s+/g,' ').trim();salesCloseServices();
  const cell=document.querySelector('.line-services-cell').textContent.replace(/\s+/g,' ');
  const a=salesLineCommercialPrice(soDraft.lines[0],soDraft).adjustments[0]||{};
  salesOrderSave();const id=soEdit;salesDraftDrop(true);
  return {id,before,amount:a.amount,row,badge,own:[own.includes('ORDER'),own.includes('968.40 × 40% = 387.36'),own.includes('Catalog +50% · > 60 ft²')],cell:cell.includes('Large unit +40%'),works:p15Works('largeUnit')};
 });
 eq('P15-01 Large unit 40% в окне Surcharges заказа: надбавка 387.36, юнит 968.40 → 1355.76; метка ORDER, признак на кнопке, расчёт в окне строки; Data → Works по-прежнему 50%',
  {before:p15.before,amount:p15.amount,row:p15.row,badge:p15.badge,own:p15.own,cell:p15.cell,works:p15.works},
  {before:1452.6,amount:387.36,row:{off:false,on:true,tag:'ORDER',value:'40'},badge:'ORDER 1',own:[true,true,true],cell:true,works:50});
 await sf5();
 eq('P15-01 после Save → F5 через 2 с: у заказа 40% и 1355.76; Works 50%; новый заказ — 50% и 1452.60',await s.p.evaluate(id=>{
  const o=salesRecord(id),saved=finWithOrder(o,()=>salesLineCommercialPrice(o.lines[0],o).unit);
  p15Order();return {rates:o.surchargeRates,saved,works:p15Works('largeUnit'),fresh:p15Unit(),freshRates:soDraft.surchargeRates||null};
 },p15.id),{rates:{largeUnit:{value:40}},saved:1355.76,works:50,fresh:1452.6,freshRates:null});
 eq('P15-06 Order confirmation, Invoice и Finance считают по числу заказа: 1355.76',await s.p.evaluate(id=>{
  const o=salesRecord(id),docs=['confirmation','invoice'].map(k=>finWithOrder(o,()=>docBuildModel(k,o).items[0].amount));
  return [docs.map(x=>x===docMoney(1355.76)),finOrderTotals(o).subtotal];
 },p15.id),[[true,true],1355.76]);
 eq('P15-02 порог 80 ft², 0 → Off, включатель, Reset; −5, текст и порог 0 не приняты — прежнее число на месте',await s.p.evaluate(()=>{
  p15Order();const out={};
  p15Type('largeUnit','areaOver','80');out.over80=p15Unit();p15Type('largeUnit','areaOver','');
  p15Type('largeUnit','value','0');out.zero=[p15Unit(),p15Row('largeUnit'),soDraft.surchargeRates?.largeUnit];
  out.hidden=[document.querySelector('.line-services-cell').textContent.includes('Large unit'),salesLineCommercialAdjustments(soDraft.lines[0],soDraft).length];
  p15Switch('largeUnit',true);out.back=p15Unit();
  p15Type('largeUnit','value','40');p15Switch('largeUnit',false);out.offKeeps=[p15Unit(),p15Row('largeUnit')?.value];p15Switch('largeUnit',true);out.onAgain=p15Unit();
  const bad=['-5','abc'].map(v=>{p15Type('largeUnit','value',v);return [p15Unit(),!!document.querySelector('[data-surcharge-error]')];});
  p15Type('largeUnit','areaOver','0');bad.push([p15Unit(),!!document.querySelector('[data-surcharge-error]'),soDraft.surchargeRates?.largeUnit?.areaOver==null]);
  document.querySelector('[data-surcharge="largeUnit"] button')?.click();out.reset=[p15Unit(),soDraft.surchargeRates||null,!!document.querySelector('[data-surcharge-badge]')];
  out.bad=bad;return out;
 }),{over80:968.4,zero:[968.4,{off:true,on:false,tag:'OFF',value:''},{off:true}],hidden:[false,0],back:1452.6,offKeeps:[968.4,'40'],onAgain:1355.76,
  reset:[1452.6,null,false],bad:[[1355.76,true],[1355.76,true],[1355.76,true,true]]});
 eq('P15-03 Minimum area 8 ft² для заказа: строка 10 × 10″ оплачивается как 8 ft², в другом заказе — 4 ft²',await s.p.evaluate(()=>{
  const l=p15Order(10,10);const was=salesLineAreas(l,soDraft).billable;p15Type('minArea','value','8');
  const a=salesLineAreas(soDraft.lines[0],soDraft),own=document.querySelector('[data-surcharge="minArea"] .metric-surcharge-effect')?.textContent;
  const other=p15Order(10,10);return [was,a.billable,a.minArea&&a.minArea.value,own,salesLineAreas(other,soDraft).billable];
 }),[4,8,8,'1 line at 8 ft²',4]);
 eq('P15-04 сохранённый заказ держит снимок: Works Large unit 60% — у заказа своё 40%, Reset возвращает 50% снимка, а не 60%',await s.p.evaluate(id=>{
  const g=DB.serviceRate.find(r=>r.id==='largeUnit');g.tiers[0].price=60;
  salesOrderEdit(id);const own=p15Unit();salesOpenMetrics('rules');const row=document.querySelector('[data-surcharge="largeUnit"]')?.textContent||'';
  if(typeof salesResetOrderSurcharge==='function')salesResetOrderSurcharge('largeUnit');const reset=p15Unit(),dirty=salesSaveState(soDraft).dirty;salesDraftDrop(true);g.tiers[0].price=50;
  return [own,row.includes('+50% · > 60 ft²'),reset,dirty];
 },p15.id),[1355.76,true,1452.6,true]);
 eq('P15-07 журнал заказа: правка надбавки записана «было → стало»; правка в открытом заказе — несохранённое изменение',await s.p.evaluate(id=>{
  const notes=()=>DB.orderEvent.filter(e=>e.orderId===id&&e.what==='Surcharge').map(e=>e.note);const first=notes();
  salesOrderEdit(id);p15Type('largeUnit','areaOver','70');const dirty=salesSaveState(soDraft).dirty;salesOrderSave();salesDraftDrop(true);
  return {first,next:notes().slice(first.length),dirty};
 },p15.id),{first:['Large unit: +50% → +40%'],next:['Large unit: > 60 ft² → > 70 ft²'],dirty:true});
 eq('P15-09 две надбавки на одном юните — каждая от цены юнита с работами: Triple 50% + Large 50% → 100 + 50 + 50; у заказа Large 40% → 100 + 50 + 40',await s.p.evaluate(()=>{
  const l=p15Order(120,84,'triple',false),m=soDraft.makeups[0];m.panes.forEach(x=>{x.priceOverride=5;});m.cavities.forEach(c=>{c.priceOverride=5;});salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0;});
  const p=salesLineCommercialPrice(l,soDraft);
  soDraft.surchargeRates={largeUnit:{value:40}};const q=salesLineCommercialPrice(l,soDraft);
  return [p.base,p.adjustments.map(a=>a.amount),p.unit,q.adjustments.map(a=>[a.label,a.base,a.amount]),q.unit];
 }),[1750,[875,875],3500,[['Triple unit',1750,875],['Large unit',1750,700]],3325]);
 const p15w=await s.p.evaluate(()=>{
  const l1=p15Order(),l2=normalizeSalesOrderLine({makeupId:l1.makeupId,width16:90*16,height16:120*16,qty:1});soDraft.lines.push(l2);salesEnsureLineShape(l2);
  const key=salesChargeGroupKey(salesLineChargeRows(l1)[0]);salesSetOrderGroupRate(key,'0.02');salesSetChargeOrderRate(l2.id,salesLineChargeRows(l2)[0].key,'0.03');
  salesOrderSave();const id=soEdit,tot=[salesLinePricingSummary(soDraft.lines[0]).total,salesLinePricingSummary(soDraft.lines[1]).total];salesDraftDrop(true);return {id,tot};
 });
 eq('P15-08 сторож: order-wide rate работы (Services & prices) и LINE RATE строки — Save → F5 на месте',p15w.tot,[16.8,25.2]);
 await sf5();
 eq('P15-08 сторож после F5: ставки работ заказа и строки те же; надбавка заказа их не меняет',await s.p.evaluate(id=>{
  salesOrderEdit(id);const [l1,l2]=soDraft.lines,key=salesChargeGroupKey(salesLineChargeRows(l1)[0]),tot=()=>[salesLinePricingSummary(l1).total,salesLinePricingSummary(l2).total];
  const kept=[soDraft.servicePricing[key]?.orderRate,l2.chargePricing[salesLineChargeRows(l2)[0].key].orderRate,...tot()];
  p15Type('largeUnit','value','30');const after=tot();salesDraftDrop(true);return [kept,after];
 },p15w.id),[[0.02,0.03,16.8,25.2],[16.8,25.2]]);
 eq('P15-05 поле проходит Import (нормализация) и ревизию квоты → Convert; смена клиента числа заказа не трогает',await s.p.evaluate(()=>{
  const n=normalizeSalesOrder(JSON.parse(JSON.stringify({surchargeRates:{largeUnit:{value:40,areaOver:'70'},triple:{off:true},bad:{value:-1},'x y':{value:5},minArea:{}}}))).surchargeRates;
  const qid=oqOrder(oqCustomer({legalName:'Quote Surcharge'}),{kind:'quote',surchargeRates:{largeUnit:{value:40}}});salesQuoteMarkSent([qid]);
  salesOrderEdit(qid);p15Type('largeUnit','value','35');salesOrderSave();const rev=soEdit;salesDraftDrop(true);
  const won=salesConvertQuoteRecord(rev,'PO-S'),order=DB.salesOrder.find(o=>o.fromQuoteId===rev);
  p15Order();p15Type('largeUnit','value','45');salesApplyCustomerDefaults(oqCustomer({legalName:'Other Customer'}).id);const kept=soDraft.surchargeRates;salesDraftDrop(true);
  return {n,rev:salesRecord(rev)?.surchargeRates,rev2:rev!==qid,order:order&&order.surchargeRates,kept};
 }),{n:{largeUnit:{value:40,areaOver:70},triple:{off:true}},rev:{largeUnit:{value:35}},rev2:true,order:{largeUnit:{value:35}},kept:{largeUnit:{value:45}}});
 eq('P15-07 закрытый / отменённый заказ только для чтения: поля надбавок недоступны',await s.p.evaluate(id=>{
  salesSetRecordStatus(id,'cancelled');salesOrderEdit(id);salesOpenMetrics('rules');
  const inputs=[...document.querySelectorAll('[data-surcharge-list] input')],was=JSON.stringify(soDraft.surchargeRates);if(typeof salesSetOrderSurcharge==='function')salesSetOrderSurcharge('largeUnit','value','10');
  const out=[inputs.length>0&&inputs.every(x=>x.disabled||x.closest('[inert]')),JSON.stringify(soDraft.surchargeRates)===was];salesDraftDrop(true);return out;
 },p15.id),[true,true]);
 eq('надбавки заказа — без ошибок страницы',s.errs,[]);
 await s.c.close();
};
