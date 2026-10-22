/* Commercial line metrics. Geometry stays in Shape; visibility never changes
   the calculation. Monetary amounts here are before energy, tax and delivery. */
/* Нормы веса, которых ещё нет в карточках (плёнка, фрит, спандрел,
   шпросы), — строки Weight norms; обвязка — в карточках и рецепте
   (erp/masterdata/surround). */
DEFAULT.materialWeightRates=[];
if(!Array.isArray(DB.materialWeightRates))DB.materialWeightRates=[];
/* Надбавки — работы Works с правилом (этап 4, часть 2 плана Master Data):
   минимальная площадь, Triple, большой юнит и любые, что заведёт владелец.
   Число — цена работы с учётом прайса клиента. Заказ замораживает набор на
   Save целиком (snap:surcharges): новая надбавка или новое число в Data не
   меняют сохранённый заказ. */
let salesSurchargeParsed={src:null,v:[]};
function salesSurcharges(order){
 const k='snap:surcharges',b=order&&order.priceBook;let v;
 /* Площадь юнита спрашивают на каждой отрисовке: разбор снимка — один раз. */
 if(b&&Object.prototype.hasOwnProperty.call(b,k)){
  if(salesSurchargeParsed.src!==b[k]){let p=[];try{p=JSON.parse(b[k])||[];}catch(e){}salesSurchargeParsed={src:b[k],v:Array.isArray(p)?p:[]};}
  v=salesSurchargeParsed.v;
 }else{
  const cid=order&&order.customerId||'';
  v=(DB.serviceRate||[]).filter(r=>r&&r.rule&&r.active!==false).map(r=>{
   const tier=serviceRateTierFor(r,null),lp=salesPriceListFor('service:'+r.id,tier?tier.id:'',cid);
   const value=lp?lp.price:tier&&tier.price!=null?tier.price:null;
   return Object.assign({id:r.id,name:r.name,rule:r.rule,value},lp?{from:lp.listId}:{});
  }).filter(x=>x.value!=null&&x.value>0);
 }
 if(salesBookRec)salesBookRec[k]=JSON.stringify(v);
 return v;
}
/* Подходит ли надбавка юниту: виды юнита (single/double/triple, плюс
   laminated, если в нём есть ламинат) и площадь к оплате одного юнита. */
function salesSurchargeFits(rule,kinds,area){
 if(rule.unitTypes.length&&!rule.unitTypes.some(t=>kinds.includes(t)))return false;
 if(rule.areaOver!=null&&!(area>rule.areaOver))return false;
 if(rule.areaUnder!=null&&!(area<rule.areaUnder))return false;
 return true;
}
function salesUnitKinds(m){
 if(!m)return [];
 const out=[m.unitType];if((m.panes||[]).some(p=>p&&p.category==='laminated'))out.push('laminated');return out;
}
function salesNormalizeWeightRates(){
 const seen=new Set();
 DB.materialWeightRates=(Array.isArray(DB.materialWeightRates)?DB.materialWeightRates:[]).filter(r=>r&&typeof r.key==='string'&&!seen.has(r.key)&&(seen.add(r.key),true)).map(r=>({key:r.key,label:mdString(r.label),rate:mdNonNeg(r.rate),unit:mdString(r.unit),note:mdString(r.note)}));
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
 /* Периметр для продажи за погонную длину — вверх до целого дюйма, как в
    Spiel (владелец, 22.10.2026); у фигуры — её контур. */
 const perimeterIn=valid?Math.ceil((shapeValid&&+r.perimeter>0?+r.perimeter:2*(Math.ceil(w)+Math.ceil(h)))-1e-9):null;
 /* Минимальная площадь — самая большая из подходящих надбавок minArea. Вид
    юнита нужен только при условии по видам: без макапа условие не сходится. */
 let min=0,minBy=null;
 if(valid){const kinds=salesUnitKinds(salesMakeupById(order||soDraft,line&&line.makeupId));
  salesSurcharges(order||soDraft).forEach(x=>{if(x.rule.kind==='minArea'&&x.value>min&&salesSurchargeFits(x.rule,kinds,rounded)){min=x.value;minBy=x;}});}
 return {actual:actual,rounded:rounded,billable:valid?Math.max(rounded,min):null,minArea:valid&&min>rounded?{id:minBy.id,name:minBy.name,value:min}:null,perimeterIn:perimeterIn,width:w,height:h,roundedWidth:Math.ceil(w),roundedHeight:Math.ceil(h),valid:valid};
}
function salesMoney(value){return Math.round((value+Number.EPSILON)*100)/100;}
function salesApplyOrderCharges(subtotal,raw){
 const c=normalizeSalesOrderCharges(raw),base=salesMoney(+subtotal||0);
 const energy=c.energy.enabled?salesMoney(base*c.energy.rate/100):0;
 const hstBase=salesMoney(base+energy),hst=c.hst.enabled?salesMoney(hstBase*c.hst.rate/100):0;
 const cardBase=salesMoney(hstBase+hst),card=c.card.enabled?salesMoney(cardBase*c.card.rate/100):0;
 const delivery=c.delivery.enabled?salesMoney(c.delivery.amount):0;
 const skidDeposit=c.skidDeposit.enabled?salesMoney(c.skidDeposit.amount):0;
 return {charges:c,subtotal:base,energy:energy,hstBase:hstBase,hst:hst,cardBase:cardBase,card:card,delivery:delivery,skidDeposit:skidDeposit,grand:salesMoney(cardBase+card+delivery+skidDeposit)};
}
function salesOrderCommercialTotals(order){
 order=order||soDraft;let subtotal=0,missing=0,qty=0;
 /* Переделка NCR без оплаты: итог заказа $0, пока офис не снимет No charge. */
 if(order&&order.noCharge){(order.lines||[]).forEach(l=>{qty+=salesPositiveInt(l.qty,1);});const out=salesApplyOrderCharges(0,{});Object.keys(out).forEach(k=>{if(typeof out[k]==='number')out[k]=0;});out.complete=true;out.missing=0;out.qty=qty;out.noCharge=true;return out;}
 (order&&order.lines||[]).forEach(function(line){const p=salesLineCommercialPrice(line,order);qty+=p.qty;if(p.complete)subtotal+=p.line;else missing++;});
 /* Позиции каталога — те же деньги, в тот же subtotal, без геометрии и без
    Makeup: у них попросту нет areas/services, которые считает p.complete выше. */
 (order&&order.extraItems||[]).forEach(function(x){const t=salesExtraItemLineTotal(x);qty+=salesPositiveInt(x.qty,1);if(t!=null)subtotal+=t;else missing++;});
 /* Отменённые юниты: клиент платит за сделанную работу (erp/sales/unit-cancel). */
 (order&&order.cancellations||[]).forEach(function(c){const v=unitChargeOf(c);if(v!=null)subtotal+=v;else missing++;});
 /* Поправки руками (normalizeSalesAdjustments). */
 (order&&order.adjustments||[]).forEach(function(a){if(Number.isFinite(+a.amount))subtotal=salesMoney(subtotal+(+a.amount));});
 const out=salesApplyOrderCharges(subtotal,order&&order.orderCharges);out.complete=!missing;out.missing=missing;out.qty=qty;return out;
}
/* Единица продажи айтема (план Master Data, этап 2, часть 3; владелец,
   22.10.2026): поле Sales unit карточки говорит, за что цена — площадь
   (sq ft, sq m), длина периметра (inch, ft, m), вес (kg, lb) или штука.
   Свой минимум площади и суммы айтема поднимает счёт (выбор владельца
   22.10.2026), с пометкой в строке; ручная цена юнита всё равно главнее.
   Единица и минимумы замораживаются в заказе на Save, как цены. */
function salesItemSaleRules(table,x,fallbackUnit){
 if(!x)return {unit:fallbackUnit||'sqft',minArea:null,minCharge:null};
 const k=table+':'+x.id;
 return {unit:salesBook('unit:'+k,()=>mdUnitCode(x.salesUnit,fallbackUnit||'sqft'))||fallbackUnit||'sqft',
  minArea:salesBook('minArea:'+k,()=>x.minAreaFt2==null?null:x.minAreaFt2),
  minCharge:salesBook('minCharge:'+k,()=>x.minCharge==null?null:x.minCharge)};
}
const SALES_KG_PER_LB=0.45359237;
/* Количество одного лайта в единице продажи. kg — вес этого айтема в лайте. */
function salesSaleQty(rules,areas,kg){
 const u=rules.unit,unit=mdUnit(u),calc=unit?unit.calc:'area';
 if(u==='kg')return kg;
 if(u==='lb')return kg==null?null:kg/SALES_KG_PER_LB;
 if(calc==='area'){const ft2=Math.max(areas.billable,rules.minArea||0);return u==='sqm'?ft2*GLASS_M2_PER_FT2:ft2;}
 if(calc==='linear')return u==='ft'?areas.perimeterIn/12:u==='m'?areas.perimeterIn*.0254:areas.perimeterIn;
 return 1;
}
/* Материалы одного юнита по частям. Части за sq ft без своего минимума
   считаются как раньше: сумма цен × Billable Area — числа старых заказов не
   меняются. Остальные — цена × своё количество, со своими минимумами. */
function salesLineMaterials(m,areas,order){
 const out={total:0,amount:0,known:true,rows:[]};
 if(!m||!areas.valid)return Object.assign(out,salesMakeupUnitPrice(m),{amount:0});
 let plain=0;
 const add=(label,price,table,item,kg,fixedUnit)=>{
  if(price==null){out.known=false;out.rows.push({label,price:null});return;}
  const rules=fixedUnit?{unit:fixedUnit,minArea:null,minCharge:null}:salesItemSaleRules(table,item);
  if(rules.unit==='sqft'&&rules.minArea==null&&rules.minCharge==null){plain+=price;out.rows.push({label,price,unit:'sqft',qty:areas.billable,amount:price*areas.billable});return;}
  const needKg=rules.unit==='kg'||rules.unit==='lb',qty=salesSaleQty(rules,areas,needKg?kg():null);
  if(qty==null){out.known=false;out.rows.push({label,price,unit:rules.unit,qty:null,note:'No weight'});return;}
  const notes=[];let amount=price*qty;
  if(rules.minArea!=null&&mdUnit(rules.unit)&&mdUnit(rules.unit).calc==='area'&&rules.minArea>areas.billable)notes.push('min '+rules.minArea+' ft²');
  if(rules.minCharge!=null&&amount<rules.minCharge){amount=rules.minCharge;notes.push('min charge '+rules.minCharge.toFixed(2));}
  out.rows.push({label,price,unit:rules.unit,qty,amount,note:notes.join(' · '),special:true});out.amount+=amount;
 };
 const glassKg=(ply,g)=>()=>{const t=glassEffectiveThicknessMm(g),mm=t.mm||+(ply&&ply.thicknessMm)||0;return mm>0&&areas.actual!=null?glassLayerWeightKg(mm,GLASS_DENSITY_KG_M3,areas.actual):null;};
 (m.panes||[]).forEach((p,i)=>{
  const label='Lite '+(i+1);
  if(p.category==='laminated'){
   if(p.priceOverride!=null)return add(label+' · laminated',p.priceOverride,'','',null,'sqft');
   const lam=p.laminated||{};
   [lam.outer,lam.inner].forEach((ply,j)=>{const g=ply&&glassProductById(ply.glassProductId);add(label+(j?'b':'a')+(g?' · '+g.code:''),salesPlyPrice(ply),'glassProduct',g,glassKg(ply,g));});
   (lam.interlayers||[]).forEach(f=>{
    const prod=mdById('interlayerProduct',f.productId),layers=salesInterlayerLayerCount(f.layers!=null?f.layers:2);
    const price=f.priceOverride!=null?f.priceOverride:salesInterlayerSalePrice(f.productId);
    const rules=salesItemSaleRules('interlayerProduct',prod),byWeight=rules.unit==='kg'||rules.unit==='lb';
    const kg=()=>{const d=salesWeightRate('film:'+f.productId,order);return d!=null&&areas.actual!=null&&+f.thicknessMm>0?d*areas.actual*GLASS_M2_PER_FT2*f.thicknessMm/1000:null;};
    /* Плёнка за вес — вес всей плёнки; иначе цена × число слоёв, как раньше. */
    add(label+' · '+(prod?prod.name:'Interlayer')+(byWeight||layers===1?'':' × '+layers),price==null?null:byWeight?price:price*layers,'interlayerProduct',prod,kg);
   });
  }else{
   const g=glassProductById(p.glassProductId);
   add(label+(g?' · '+g.code:''),p.priceOverride!=null?p.priceOverride:salesPaneCatalogPrice(p),'glassProduct',g,glassKg(p,g));
  }
 });
 /* Обвязка — по частям рецепта; ручная ставка камеры — одна строка за ft². */
 const geo={areaFt2:areas.actual,perimeterM:areas.perimeterIn*.0254};
 (m.cavities||[]).forEach((c,i)=>{
  const at=out.rows.length;
  if(c.priceOverride!=null)add('Surround · cavity '+(i+1),c.priceOverride,'','',null,'sqft');
  else{const parts=surroundCavityParts(c,geo,order).parts;if(!parts.length)add('Surround · cavity '+(i+1),null);
   parts.forEach(x=>add('Cavity '+(i+1)+' · '+x.label,salesSurroundPartPrice(x),x.table,x.item,()=>x.usedKg));}
  for(let k=at;k<out.rows.length;k++)out.rows[k].cavity=i;
 });
 plain=Math.round(plain*100)/100;out.amount+=plain*areas.billable;
 out.total=out.rows.some(r=>r.special)&&areas.billable>0?Math.round(out.amount/areas.billable*100)/100:plain;
 return out;
}
/* Мин. и макс. размер айтема — только предупреждение (владелец, 22.10.2026). */
function salesItemSizeProblems(line,order){
 const m=salesMakeupById(order,line.makeupId),a=salesLineAreas(line,order),out=[];
 if(!m||!a.valid)return out;
 const check=x=>{if(!x)return;const name=x.code||x.name||x.id,W=a.width,H=a.height;
  if(x.maxWidthIn!=null&&W>x.maxWidthIn||x.maxHeightIn!=null&&H>x.maxHeightIn)out.push(name+': over max '+(x.maxWidthIn==null?'—':x.maxWidthIn)+' × '+(x.maxHeightIn==null?'—':x.maxHeightIn)+'″');
  if(x.minWidthIn!=null&&W<x.minWidthIn||x.minHeightIn!=null&&H<x.minHeightIn)out.push(name+': under min '+(x.minWidthIn==null?'—':x.minWidthIn)+' × '+(x.minHeightIn==null?'—':x.minHeightIn)+'″');};
 (m.panes||[]).forEach(p=>{if(p.category==='laminated'){const l=p.laminated||{};[l.outer,l.inner].forEach(x=>check(x&&glassProductById(x.glassProductId)));(l.interlayers||[]).forEach(f=>check(mdById('interlayerProduct',f.productId)));}else check(glassProductById(p.glassProductId));});
 (m.cavities||[]).forEach(c=>check(mdById('spacerVariant',c.spacerVariantId)));
 return [...new Set(out)];
}
function salesItemSizeWarnings(order){
 const out=[];(order&&order.lines||[]).forEach((line,i)=>salesItemSizeProblems(line,order).forEach(t=>out.push('Line '+(i+1)+(line.mark?' ('+line.mark+')':'')+' · '+t)));return out;
}
function salesLineCommercialPrice(line,order){
 order=order||soDraft;
 const areas=salesLineAreas(line,order),m=salesMakeupById(order,line.makeupId),q=salesPositiveInt(line.qty,1),live=Math.max(0,q-unitCancelled(line));
 const rate=salesLineMaterials(m,areas,order),services=salesLinePricingSummary(line),materials=areas.valid?rate.amount:0;
 const base=salesMoney(materials+services.total/q);
 const unsupportedCurrency=!!(order.currency&&order.currency!=='CAD');
 const incomplete=!areas.valid||!m||!rate.known||services.unpriced>0||unsupportedCurrency;
 /* Процентные надбавки — по приоритету; onTop — от цены с предыдущими. */
 const kinds=salesUnitKinds(m);
 const adjustments=areas.valid?salesSurcharges(order).filter(x=>x.rule.kind==='percent'&&salesSurchargeFits(x.rule,kinds,areas.billable))
  .sort((a,b)=>a.rule.priority-b.rule.priority).map(x=>({key:'svc:'+x.id,svc:x.id,label:x.name,percent:x.value,onTop:x.rule.onTop,rule:x.rule})):[];
 let running=base;
 adjustments.forEach(a=>{a.base=a.onTop?running:base;a.amount=salesMoney(a.base*a.percent/100);running=salesMoney(running+a.amount);});
 const out={areas:areas,materialRate:rate.total,materialRows:rate.rows,materials:salesMoney(materials),services:salesMoney(services.total/q),base:base,adjustments:adjustments,unit:incomplete?null:running,line:incomplete?null:salesMoney(running*live),knownSubtotal:running,complete:!incomplete,unsupportedCurrency:unsupportedCurrency,missingMaterials:!m||!rate.known,missingServices:services.unpriced,qty:live,ordered:q,cancelled:q-live};
 /* Цена руками: итоговая цена юнита, наценки к ней не прибавляются; расчёт
    остаётся для справки (computedUnit). */
 if(line.priceManual!=null&&Number.isFinite(+line.priceManual)&&+line.priceManual>=0){const v=salesMoney(+line.priceManual);Object.assign(out,{manual:true,computedUnit:out.unit,adjustments:[],unit:v,line:salesMoney(v*live),complete:true,unsupportedCurrency:false});}
 return out;
}
function salesLineCommercialAdjustments(line,order){
 const price=salesLineCommercialPrice(line,order);
 return price.adjustments.map(a=>({key:a.key,label:a.label,percent:a.percent,rule:a.rule,base:price.complete?a.base:null,unitAmount:price.complete?a.amount:null,qty:price.qty,lineAmount:price.complete?salesMoney(a.amount*price.qty):null,complete:price.complete}));
}
function salesOrderCommercialAdjustments(order){
 order=order||soDraft;
 const groups=Object.create(null);
 (order&&order.lines||[]).forEach((line,lineIndex)=>salesLineCommercialAdjustments(line,order).forEach(a=>{
  if(!groups[a.key])groups[a.key]={key:a.key,label:a.label,percent:a.percent,rule:a.rule,lines:0,qty:0,total:0,incomplete:0,entries:[]};
  const g=groups[a.key];g.lines++;g.qty+=a.qty;g.entries.push({line:line,lineIndex:lineIndex,adjustment:a});
  if(a.complete)g.total=salesMoney(g.total+a.lineAmount);else g.incomplete++;
 }));
 return Object.keys(groups).map(k=>groups[k]);
}

/* Coefficients are measured product norms. Empty is unknown, explicit zero is
   allowed (e.g. consumables already included in a filled-spacer norm). */
/* Нормы веса замораживаются в заказе на Save, как цены (priceBook, ключ
   weight:…): новая норма в Master Data не меняет вес сохранённого заказа.
   Заказ — свой, не soDraft: наклейки и отгрузка считают вес чужого заказа. */
function salesWeightRate(key,order){
 const k='weight:'+key,b=order&&order.priceBook;
 const v=b&&Object.prototype.hasOwnProperty.call(b,k)?b[k]:(()=>{const r=(DB.materialWeightRates||[]).find(r=>r.key===key);return r?mdNonNeg(r.rate):null;})();
 if(salesBookRec)salesBookRec[k]=v==null?null:v;
 return v;
}
/* productionPlan — фактические лайты собранного юнита (частичный Recut).
   Без него коммерческие документы по-прежнему считают геометрию заказа. */
function salesLineWeight(line,order,productionPlan){
 order=order||soDraft;
 const rows=[],m=salesMakeupById(order,line.makeupId),shape=salesLineGeometryShape(line),areas=salesLineAreas(line,order);
 const plan=productionPlan||(shape&&m?salesEffectiveCuttingPlan(line,shape,order):null);
 const add=(label,kg,note)=>rows.push({label:label,kg:Number.isFinite(kg)&&kg>=0?kg:null,note:note||''});
 const norm=(key,label,basis,unit,note)=>{const rate=salesWeightRate(key,order);rows.push({key:key,label:label,basis:basis,unit:unit,rate:rate,kg:rate!=null&&Number.isFinite(basis)&&basis>=0?rate*basis:null,note:note||''});};
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
 /* Обвязка по рецепту рамки: рамка идёт по контуру камеры. У ступенчатого
    пакета контуры лайтов разные — контур выбирают в камере (Contour). */
 (m.cavities||[]).forEach((c,i)=>{
  const a=geometry(i),b=geometry(i+1),same=plan&&plan.valid&&plan.lites[i]&&plan.lites[i+1]&&JSON.stringify(plan.lites[i].finishedPoints)===JSON.stringify(plan.lites[i+1].finishedPoints);
  const pick=same?a:c.contour==='a'?a:c.contour==='b'?b:null,suffix=' · Cavity '+(i+1);
  const geo=pick&&pick.area!=null?{areaFt2:pick.area,perimeterM:pick.perimeter}:null;
  const got=surroundCavityParts(c,geo,order);
  if(!mdById('spacerVariant',c.spacerVariantId))add('Spacer'+suffix,null,'Spacer not found');
  else if(!got.recipe)add('Surround'+suffix,null,'No recipe in the spacer card');
  const basis=geo?'perimeter '+geo.perimeterM.toFixed(2)+' m · area '+geo.areaFt2.toFixed(2)+' ft²':'';
  got.parts.forEach(x=>rows.push({label:x.label+suffix,kg:x.kg,usedKg:x.usedKg,wastePct:x.wastePct,basisText:basis,note:x.note+(x.wastePct?' · used with '+x.wastePct+'% waste: '+(x.usedKg==null?'—':x.usedKg.toFixed(3)+' kg'):'')}));
  if(!same&&!geo)add('Cavity '+(i+1)+' · stepped / differing contours',null,'Choose the spacer contour in the cavity');
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
