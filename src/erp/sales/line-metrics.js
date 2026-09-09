/* Commercial line metrics. Geometry stays in Shape; visibility never changes
   the calculation. Monetary amounts here are before energy, tax and delivery. */
const SALES_METRIC_RULE_DEFAULTS={minimumAreaFt2:4,triplePercent:50,largePercent:50,largeThresholdFt2:60,combination:'additive'};
DEFAULT.salesMetricRules=Object.assign({},SALES_METRIC_RULE_DEFAULTS);
const SALES_WEIGHT_RATE_DEFAULTS=[
 {key:'spacer:SP-BWE-1732',label:'17/32 Black Warm Edge spacer',rate:.030,unit:'kg/ft²',note:'Temporary shop estimate · 30 g/ft²'},
 {key:'desiccant:SP-BWE-1732',label:'17/32 Black Warm Edge desiccant',rate:.033,unit:'kg/ft²',note:'Shop norm · 33 g/ft²'},
 {key:'seal:SEAL-PIB:SP-BWE-1732',label:'17/32 Black Warm Edge · PIB',rate:.005,unit:'kg/ft²',note:'Shop norm · 5 g/ft²'},
 {key:'seal:SEAL-PS:SP-BWE-1732',label:'17/32 Black Warm Edge · Polysulphide + catalyst',rate:.127,unit:'kg/ft²',note:'Shop norm · 127 g/ft²'},
 {key:'connectors:SP-BWE-1732',label:'17/32 Black Warm Edge · connectors / corners',rate:.040,unit:'kg/unit',note:'Temporary allowance · 40 g per cavity'},
 {key:'gas:GAS-AIR',label:'Air',rate:1.225,unit:'kg/m³',note:'Reference density; editable for shop conditions'},
 {key:'gas:GAS-ARGON',label:'Argon',rate:1.784,unit:'kg/m³',note:'Reference density; editable for shop conditions'}
];
const SALES_SPACER_WEIGHT_REFERENCE={variantId:'SP-BWE-1732',rate:.030};
DEFAULT.materialWeightRates=JSON.parse(JSON.stringify(SALES_WEIGHT_RATE_DEFAULTS));
DB.salesMetricRules=Object.assign({},SALES_METRIC_RULE_DEFAULTS);
DB.materialWeightRates=JSON.parse(JSON.stringify(SALES_WEIGHT_RATE_DEFAULTS));
function salesNormalizeMetricRules(value){
 const v=value&&typeof value==='object'?value:{},out={};
 ['minimumAreaFt2','triplePercent','largePercent','largeThresholdFt2'].forEach(k=>{
  const n=v[k]===null||v[k]===''?NaN:Number(v[k]);
  out[k]=Number.isFinite(n)&&n>=0?n:SALES_METRIC_RULE_DEFAULTS[k];
 });
 out.combination=['additive','compound'].includes(v.combination)?v.combination:SALES_METRIC_RULE_DEFAULTS.combination;
 return out;
}
function salesMetricRules(order){return salesNormalizeMetricRules((order&&order.metricRules)||DB.salesMetricRules);}
function salesNormalizeWeightRates(){
 const seen=new Set();
 DB.materialWeightRates=(Array.isArray(DB.materialWeightRates)?DB.materialWeightRates:[]).filter(r=>r&&typeof r.key==='string'&&!seen.has(r.key)&&(seen.add(r.key),true)).map(r=>({key:r.key,label:mdString(r.label),rate:mdNonNeg(r.rate),unit:mdString(r.unit),note:mdString(r.note),derived:r.derived===true}));
 SALES_WEIGHT_RATE_DEFAULTS.forEach(d=>{const r=DB.materialWeightRates.find(x=>x.key===d.key);if(!r){DB.materialWeightRates.push(Object.assign({},d));seen.add(d.key);return;}const placeholder=!r.label&&!r.unit&&!r.note;if(placeholder)r.rate=d.rate;if(!r.label)r.label=d.label;if(!r.unit)r.unit=d.unit;if(!r.note)r.note=d.note;});
 /* Until a shop measurement overrides a row, every spacer profile uses the
    confirmed average for 17/32 and scales it by its physical thickness.  The
    generated rows are ordinary editable master data, so a measured value wins
    permanently over the estimate. */
 const ref=mdById('spacerVariant',SALES_SPACER_WEIGHT_REFERENCE.variantId),refMm=spacerThicknessMm(ref);
 (DB.spacerVariant||[]).forEach(sp=>{
  const key='spacer:'+sp.id,row=DB.materialWeightRates.find(r=>r.key===key);
  const mm=spacerThicknessMm(sp),rate=refMm>0&&mm>0?SALES_SPACER_WEIGHT_REFERENCE.rate*mm/refMm:null;
  if(row&&!row.derived)return;
  const estimate={key:key,label:(sp.name||sp.id)+' spacer',rate:rate,unit:'kg/ft²',note:'Calculated estimate · 17/32 average × thickness ratio',derived:true};
  if(row)Object.assign(row,estimate);else DB.materialWeightRates.push(estimate);seen.add(key);
 });
 DB.salesMetricRules=salesNormalizeMetricRules(DB.salesMetricRules);
}
function salesLineAreas(line,order){
 const lineW=(+(line&&line.width16)||0)/16,lineH=(+(line&&line.height16)||0)/16;
 const shape=salesShapeByRef(line&&line.shapeRef),r=shape?ShapeModule.compute(shape):null;
 const shapeValid=!!(r&&(r.valid||r.externalFile&&r.sourceValid)),w=shapeValid&&+r.width>0?+r.width:lineW,h=shapeValid&&+r.height>0?+r.height:lineH;
 const valid=(!shape||shapeValid)&&lineW>0&&lineH>0&&w>0&&h>0;
 const actual=valid?(shapeValid?r.area/144:w*h/144):null;
 /* Коммерческая площадь всегда идёт к следующей десятой. Обычный round
    занижал 33 × 80 с 18.3333 до 18.3 вместо подтверждённых 18.4 ft². */
 const rounded=valid?Math.ceil((Math.ceil(w)*Math.ceil(h)/144-1e-10)*10)/10:null;
 return {actual:actual,rounded:rounded,billable:valid?Math.max(rounded,salesMetricRules(order).minimumAreaFt2):null,width:w,height:h,roundedWidth:Math.ceil(w),roundedHeight:Math.ceil(h),valid:valid};
}
function salesMoney(value){return Math.round((value+Number.EPSILON)*100)/100;}
function salesApplyOrderCharges(subtotal,raw){
 const c=normalizeSalesOrderCharges(raw),base=salesMoney(Math.max(0,+subtotal||0));
 const energy=c.energy.enabled?salesMoney(base*c.energy.rate/100):0;
 const hstBase=salesMoney(base+energy),hst=c.hst.enabled?salesMoney(hstBase*c.hst.rate/100):0;
 const cardBase=salesMoney(hstBase+hst),card=c.card.enabled?salesMoney(cardBase*c.card.rate/100):0;
 const delivery=c.delivery.enabled?salesMoney(c.delivery.amount):0;
 const skidDeposit=c.skidDeposit.enabled?salesMoney(c.skidDeposit.amount):0;
 return {charges:c,subtotal:base,energy:energy,hstBase:hstBase,hst:hst,cardBase:cardBase,card:card,delivery:delivery,skidDeposit:skidDeposit,grand:salesMoney(cardBase+card+delivery+skidDeposit)};
}
function salesOrderCommercialTotals(order){
 order=order||soDraft;let subtotal=0,missing=0,qty=0;
 (order&&order.lines||[]).forEach(function(line){const p=salesLineCommercialPrice(line,order);qty+=p.qty;if(p.complete)subtotal+=p.line;else missing++;});
 const out=salesApplyOrderCharges(subtotal,order&&order.orderCharges);out.complete=!missing;out.missing=missing;out.qty=qty;return out;
}
function salesLineCommercialPrice(line,order){
 order=order||soDraft;
 const areas=salesLineAreas(line,order),m=salesMakeupById(order,line.makeupId),rate=salesMakeupUnitPrice(m),q=salesPositiveInt(line.qty,1);
 const services=salesLinePricingSummary(line),materials=areas.valid?rate.total*areas.billable:0;
 const base=salesMoney(materials+services.total/q),rules=salesMetricRules(order),adjustments=[];
 const unsupportedCurrency=!!(order.currency&&order.currency!=='CAD');
 let incomplete=!areas.valid||!m||!rate.known||services.unpriced>0||unsupportedCurrency;
 if(m&&m.unitType==='triple'&&rules.triplePercent>0)adjustments.push({key:'triple',label:'Triple units',percent:rules.triplePercent});
 if(areas.valid&&areas.billable>rules.largeThresholdFt2&&rules.largePercent>0)adjustments.push({key:'large',label:'Large units > '+rules.largeThresholdFt2+' ft²',percent:rules.largePercent});
 if(adjustments.length>1&&rules.combination==='pending')incomplete=true;
 let running=base;
 adjustments.forEach(a=>{a.base=rules.combination==='compound'?running:base;a.amount=salesMoney(a.base*a.percent/100);running=salesMoney(running+a.amount);});
 return {areas:areas,materialRate:rate.total,materials:salesMoney(materials),services:salesMoney(services.total/q),base:base,adjustments:adjustments,unit:incomplete?null:running,line:incomplete?null:salesMoney(running*q),knownSubtotal:running,complete:!incomplete,unsupportedCurrency:unsupportedCurrency,missingMaterials:!m||!rate.known,missingServices:services.unpriced,pendingCombination:adjustments.length>1&&rules.combination==='pending',qty:q};
}
function salesLineCommercialAdjustments(line,order){
 const price=salesLineCommercialPrice(line,order);
 return price.adjustments.map(a=>({key:a.key,label:a.label,percent:a.percent,base:price.complete?a.base:null,unitAmount:price.complete?a.amount:null,qty:price.qty,lineAmount:price.complete?salesMoney(a.amount*price.qty):null,complete:price.complete}));
}
function salesOrderCommercialAdjustments(order){
 order=order||soDraft;
 const groups=Object.create(null);
 (order&&order.lines||[]).forEach((line,lineIndex)=>salesLineCommercialAdjustments(line,order).forEach(a=>{
  if(!groups[a.key])groups[a.key]={key:a.key,label:a.label,percent:a.percent,lines:0,qty:0,total:0,incomplete:0,entries:[]};
  const g=groups[a.key];g.lines++;g.qty+=a.qty;g.entries.push({line:line,lineIndex:lineIndex,adjustment:a});
  if(a.complete)g.total=salesMoney(g.total+a.lineAmount);else g.incomplete++;
 }));
 return Object.keys(groups).map(k=>groups[k]);
}

/* Coefficients are measured product norms. Empty is unknown, explicit zero is
   allowed (e.g. consumables already included in a filled-spacer norm). */
function salesWeightRate(key){const r=(DB.materialWeightRates||[]).find(r=>r.key===key);return r?mdNonNeg(r.rate):null;}
function salesLineWeight(line,order){
 order=order||soDraft;
 const rows=[],m=salesMakeupById(order,line.makeupId),shape=salesLineGeometryShape(line),areas=salesLineAreas(line,order);
 const plan=shape&&m?salesEffectiveCuttingPlan(line,shape,order):null;
 const add=(label,kg,note)=>rows.push({label:label,kg:Number.isFinite(kg)&&kg>=0?kg:null,note:note||''});
 const norm=(key,label,basis,unit,note)=>{const rate=salesWeightRate(key);rows.push({key:key,label:label,basis:basis,unit:unit,rate:rate,kg:rate!=null&&Number.isFinite(basis)&&basis>=0?rate*basis:null,note:note||''});};
 if(!m||!areas.valid)return {rows:[],kg:null,lineKg:null,knownKg:0,complete:false,missing:1};
 const geometry=(i)=>{
  const lite=plan&&plan.valid&&(plan.lites||[]).find(l=>l.index===i);
  if(!lite)return {area:null,perimeter:null};
  const area=lite.result&&lite.result.valid?lite.result.area:Math.abs(fabSignedArea(lite.finishedPoints));
  return {area:area/144,perimeter:fabPolylineLength(lite.finishedPoints,true)*.0254};
 };
 const glass=(ply,label,geo)=>{
  const product=glassProductById(ply&&ply.glassProductId),t=glassEffectiveThicknessMm(product);
  const mm=t.mm||+(ply&&ply.thicknessMm)||0;
  add(label+(product?' · '+product.code:''),geo.area!=null&&mm>0?glassLayerWeightKg(mm,GLASS_DENSITY_KG_M3,geo.area):null,t.exact?'':'Nominal thickness estimate');
 };
 const surface=(ply,label,geo)=>{
  if(ply.category==='spandrel')norm('spandrel:'+ply.spandrel.productId,label+' · Spandrel',geo.area==null?null:geo.area*GLASS_M2_PER_FT2,'kg/m²','Applied coating norm per finished area');
  if(ply.visionType==='frit'||ply.frit&&ply.frit.enabled)norm('frit:'+ply.frit.productId+':'+(ply.frit.pattern||'custom'),label+' · Frit',geo.area==null?null:geo.area*GLASS_M2_PER_FT2,'kg/m²','Applied pattern norm per finished area');
 };
 (m.panes||[]).forEach((p,i)=>{
  const g=geometry(i),label='Lite '+(i+1);
  if(p.category==='laminated'){
   const lam=p.laminated||{};
   [lam.outer,lam.inner].forEach((ply,j)=>{if(ply){glass(ply,label+(j?'b':'a'),g);surface(ply,label+(j?'b':'a'),g);}});
   (lam.interlayers||[]).forEach(f=>{
    const prod=mdById('interlayerProduct',f.productId);
    norm('film:'+f.productId,label+' · '+(prod?prod.name:'Interlayer'),g.area==null?null:g.area*GLASS_M2_PER_FT2*(f.thicknessMm/1000),'kg/m³','Density × actual interlayer volume');
   });
  }else{glass(p,label,g);surface(p,label,g);}
 });
 (m.cavities||[]).forEach((c,i)=>{
  const a=geometry(i),b=geometry(i+1),same=plan&&plan.valid&&plan.lites[i]&&plan.lites[i+1]&&JSON.stringify(plan.lites[i].finishedPoints)===JSON.stringify(plan.lites[i+1].finishedPoints);
  const perimeter=same?a.perimeter:null,area=same?a.area:null,sp=mdById('spacerVariant',c.spacerVariantId),suffix=' · Cavity '+(i+1);
  norm('spacer:'+c.spacerVariantId,(sp?sp.name:'Spacer')+suffix,area,'kg/ft²','Shop norm per finished unit area; exclude separately listed desiccant');
  norm('desiccant:'+c.spacerVariantId,'Desiccant'+suffix,area,'kg/ft²','Use 0 if included in spacer weight');
  norm('connectors:'+c.spacerVariantId,'Spacer connectors'+suffix,1,'kg/unit','Total connectors per cavity');
  [c.primarySealantId,c.secondarySealantId].forEach(id=>{const p=mdById('sealantProduct',id);norm('seal:'+id+':'+c.spacerVariantId,(p?p.name:'Sealant')+suffix,area,'kg/ft²','Shop norm per finished unit area for this spacer size');});
  const gas=mdById('gasProduct',c.gasProductId),mm=spacerThicknessMm(sp);
  norm('gas:'+c.gasProductId,(gas?gas.name:'Gas')+suffix,area!=null&&mm>0?area*GLASS_M2_PER_FT2*mm/1000:null,'kg/m³','Fill-mixture density; nominal cavity volume');
  if(!same)add('Cavity '+(i+1)+' · stepped / differing contours',null,'Spacer path and cavity volume require confirmation');
 });
 const muntin=shape&&shape.muntin;
 if(muntin&&muntin.enabled&&(m.cavities||[]).length){
  const got=shapeMuntinGeoFor(shape),prod=muntinProduct(muntin.productId);
  norm('muntin:'+muntin.productId,'Muntin · '+prod.label,got?got.result.totalLengthIn*.0254:null,'kg/m','Calculated bar cut length');
  norm('muntin-connectors:'+muntin.productId,'Muntin connectors',1,'kg/unit','Total connectors per unit');
 }
 (line.weightExtras||[]).forEach(x=>add(x.label||'Additional component',mdNonNeg(x.kg),'Per unit'));
 const missing=rows.filter(r=>r.kg==null).length,known=rows.reduce((s,r)=>s+(r.kg||0),0),complete=rows.length>0&&missing===0;
 return {rows:rows,kg:complete?known:null,lineKg:complete?known*salesPositiveInt(line.qty,1):null,knownKg:known,complete:complete,missing:missing};
}
