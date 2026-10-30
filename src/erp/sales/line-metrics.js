/* Commercial line metrics. Geometry stays in Shape; visibility never changes
   the calculation. Monetary amounts here are before energy, tax and delivery. */
/* Нормы веса, которых ещё нет в карточках (плёнка, фрит, спандрел,
   шпросы), — строки Weight norms; обвязка — в карточках и рецепте
   (erp/masterdata/surround). */
DEFAULT.materialWeightRates=[{key:'glass',label:'Glass density',rate:GLASS_DENSITY_SEED_KG_M3,unit:'kg/m³',note:''}];
if(!Array.isArray(DB.materialWeightRates))DB.materialWeightRates=[];
/* Надбавки — работы Works с правилом (этап 4, часть 2 плана Master Data):
   минимальная площадь, Triple, большой юнит и любые, что заведёт владелец.
   Число — цена работы с учётом прайса клиента. Заказ замораживает набор на
   Save целиком (snap:surcharges): новая надбавка или новое число в Data не
   меняют сохранённый заказ. */
let salesSurchargeParsed={src:null,v:[]};
function salesSurchargeCatalog(order){
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
/* Надбавки в силе у заказа: каталог заказа (снимок на Save или Data → Works)
   и поверх него числа самого заказа (order.surchargeRates, окно Surcharges).
   Это одно место: минимальная площадь, проценты, документы, Finance и Save в
   фоне берут одно число. Выключенная у заказа надбавка (off или 0) не идёт в
   цену и нигде не показывается нулём (владелец, 29.10.2026). Снимок каталога
   остаётся каталогом — Reset у сохранённого заказа возвращает его. */
function salesSurcharges(order){
 const v=salesSurchargeCatalog(order),own=order&&order.surchargeRates;
 if(!own)return v;
 const out=[];
 v.forEach(x=>{
  const o=own[x.id];if(!o){out.push(x);return;}
  const value=o.value!=null?o.value:x.value;if(o.off||!(value>0))return;
  const rule=o.areaOver!=null||o.areaUnder!=null?Object.assign({},x.rule,o.areaOver!=null?{areaOver:o.areaOver}:null,o.areaUnder!=null?{areaUnder:o.areaUnder}:null):x.rule;
  out.push(Object.assign({},x,{value,rule,catalog:x}));
 });
 return out;
}
/* Надбавка словами: «+50% · > 60 ft²», «min 4 ft²», «Off»; o — числа
   заказа поверх каталога x. */
function salesSurchargeParts(x,o){
 if(o&&(o.off||o.value===0))return ['Off'];
 const v=o&&o.value!=null?o.value:x.value,over=o&&o.areaOver!=null?o.areaOver:x.rule.areaOver,under=o&&o.areaUnder!=null?o.areaUnder:x.rule.areaUnder;
 return [x.rule.kind==='minArea'?'min '+v+' ft²':'+'+v+'%',over!=null?'> '+over+' ft²':'',under!=null?'< '+under+' ft²':''];
}
function salesSurchargeShown(x,o){return salesSurchargeParts(x,o).filter(Boolean).join(' · ');}
/* Журнал заказа (erp/sales/order-log): что поменяли в числах надбавок,
   «было → стало» — только изменённое, например «Large unit: +50% → +40%». */
function salesSurchargeLogNotes(a,b){
 const ra=a&&a.surchargeRates||{},rb=b&&b.surchargeRates||{};
 const ids=[...new Set(Object.keys(ra).concat(Object.keys(rb)))].filter(id=>JSON.stringify(ra[id]||null)!==JSON.stringify(rb[id]||null));
 if(!ids.length)return [];
 const cat=new Map(salesSurchargeCatalog(b).map(x=>[x.id,x]));
 return ids.filter(id=>cat.has(id)).map(id=>{
  const x=cat.get(id),pa=salesSurchargeParts(x,ra[id]),pb=salesSurchargeParts(x,rb[id]),off=pa.length===1||pb.length===1;
  const pick=p=>(off?p:p.filter((v,i)=>pa[i]!==pb[i])).filter(Boolean).join(' · ');
  return pa.join()===pb.join()?'':x.name+': '+pick(pa)+' → '+pick(pb);
 }).filter(Boolean);
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
 /* Плотность стекла — засев нормы (этап 5 плана Master Data). */
 if(Array.isArray(DB.materialWeightRates)&&!DB.materialWeightRates.some(r=>r&&r.key==='glass'))DB.materialWeightRates.push({key:'glass',label:'Glass density',rate:GLASS_DENSITY_SEED_KG_M3,unit:'kg/m³',note:''});
 DB.materialWeightRates=(Array.isArray(DB.materialWeightRates)?DB.materialWeightRates:[]).filter(r=>r&&typeof r.key==='string'&&!seen.has(r.key)&&(seen.add(r.key),true)).map(r=>({key:r.key,label:mdString(r.label),rate:mdNonNeg(r.rate),unit:mdString(r.unit),note:mdString(r.note)}));
}
function salesLineAreas(line,order){
 /* Записано при Save (sales/line-measure) — без расчёта фигуры. */
 const kept=salesMeasureFor(line,order||soDraft);if(kept)return Object.assign({},kept.areas);
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
/* Центы: «ничья» в полцента (98.175 + 2.82 = 100.995) округляется вверх.
   Number.EPSILON для сотен долларов мал, и шум float решал её то вверх, то
   вниз — от порядка умножения (4 заказа из 2634 на годе цеха после #328). */
function salesMoney(value){return Math.round(+(value*100).toFixed(6))/100;}
/* Порядок один: Energy → HST → Card fee, доставка и депозит в конце; что
   входит в базу HST и карты — снимок заказа (erp/sales/order-setup). */
function salesApplyOrderCharges(subtotal,raw){
 const c=normalizeSalesOrderCharges(raw),base=salesMoney(+subtotal||0);
 const energy=c.energy.enabled?salesMoney(base*c.energy.rate/100):0;
 const delivery=c.delivery.enabled?salesMoney(c.delivery.amount):0;
 const skidDeposit=c.skidDeposit.enabled?salesMoney(c.skidDeposit.amount):0;
 const part={energy,delivery},sum=(list,more)=>salesMoney(list.reduce((n,p)=>n+(more[p]||0),base));
 const hstBase=sum(c.hst.base,part),hst=c.hst.enabled?salesMoney(hstBase*c.hst.rate/100):0;
 const cardBase=sum(c.card.base,Object.assign({hst},part)),card=c.card.enabled?salesMoney(cardBase*c.card.rate/100):0;
 return {charges:c,subtotal:base,energy:energy,hstBase:hstBase,hst:hst,cardBase:cardBase,card:card,delivery:delivery,skidDeposit:skidDeposit,grand:salesMoney(base+energy+hst+card+delivery+skidDeposit)};
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
 /* Что именно продано — справочник и айтем, лайт, плита, слои плёнки (tag):
    по ним отчёт Products · sold (reports/facts-sold) делит продажи. */
 const add=(label,price,table,item,kg,fixedUnit,tag)=>{
  const ref=Object.assign({table:table||'',itemId:item&&item.id||''},tag);
  if(price==null){out.known=false;out.rows.push(Object.assign({label,price:null},ref));return;}
  const rules=fixedUnit?{unit:fixedUnit,minArea:null,minCharge:null}:salesItemSaleRules(table,item);
  if(rules.unit==='sqft'&&rules.minArea==null&&rules.minCharge==null){plain+=price;out.rows.push(Object.assign({label,price,unit:'sqft',qty:areas.billable,amount:price*areas.billable},ref));return;}
  const needKg=rules.unit==='kg'||rules.unit==='lb',qty=salesSaleQty(rules,areas,needKg?kg():null);
  if(qty==null){out.known=false;out.rows.push(Object.assign({label,price,unit:rules.unit,qty:null,note:'No weight'},ref));return;}
  const notes=[];let amount=price*qty;
  if(rules.minArea!=null&&mdUnit(rules.unit)&&mdUnit(rules.unit).calc==='area'&&rules.minArea>areas.billable)notes.push('min '+rules.minArea+' ft²');
  if(rules.minCharge!=null&&amount<rules.minCharge){amount=rules.minCharge;notes.push('min charge '+rules.minCharge.toFixed(2));}
  out.rows.push(Object.assign({label,price,unit:rules.unit,qty,amount,note:notes.join(' · '),special:true},ref));out.amount+=amount;
 };
 const glassKg=(ply,g)=>()=>{const t=glassEffectiveThicknessMm(g),mm=t.mm||+(ply&&ply.thicknessMm)||0;const d=glassDensityKgM3(order);return mm>0&&d&&areas.actual!=null?glassLayerWeightKg(mm,d,areas.actual):null;};
 (m.panes||[]).forEach((p,i)=>{
  const label='Lite '+(i+1);
  if(p.category==='laminated'){
   if(p.priceOverride!=null)return add(label+' · laminated',p.priceOverride,'','',null,'sqft',{pane:i});
   const lam=p.laminated||{};
   [lam.outer,lam.inner].forEach((ply,j)=>{const g=ply&&glassProductById(ply.glassProductId);add(label+(j?'b':'a')+(g?' · '+glassShortName(g):''),salesPlyPrice(ply),'glassProduct',g,glassKg(ply,g),null,{pane:i,ply:j?'inner':'outer'});});
   (lam.interlayers||[]).forEach(f=>{
    const prod=mdById('interlayerProduct',f.productId),layers=salesInterlayerLayerCount(f.layers!=null?f.layers:2);
    const price=f.priceOverride!=null?f.priceOverride:salesInterlayerSalePrice(f.productId);
    const rules=salesItemSaleRules('interlayerProduct',prod),byWeight=rules.unit==='kg'||rules.unit==='lb';
    const kg=()=>{const d=salesWeightRate('film:'+f.productId,order);return d!=null&&areas.actual!=null&&+f.thicknessMm>0?d*areas.actual*GLASS_M2_PER_FT2*f.thicknessMm/1000:null;};
    /* Плёнка за вес — вес всей плёнки; иначе цена × число слоёв, как раньше. */
    add(label+' · '+(prod?prod.name:'Interlayer')+(byWeight||layers===1?'':' × '+layers),price==null?null:byWeight?price:price*layers,'interlayerProduct',prod,kg,null,{pane:i,layers});
   });
  }else{
   const g=glassProductById(p.glassProductId);
   add(label+(g?' · '+glassShortName(g):''),p.priceOverride!=null?p.priceOverride:salesPaneCatalogPrice(p),'glassProduct',g,glassKg(p,g),null,{pane:i});
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
  .sort((a,b)=>a.rule.priority-b.rule.priority).map(x=>({key:'svc:'+x.id,svc:x.id,label:x.name,percent:x.value,onTop:x.rule.onTop,rule:x.rule,catalog:x.catalog||null})):[];
 let running=base;
 adjustments.forEach(a=>{a.base=a.onTop?running:base;a.amount=salesMoney(a.base*a.percent/100);running=salesMoney(running+a.amount);});
 /* chargeRows — строки работ, по которым посчитана цена: отчёт Products sold
    берёт их отсюда, а не считает второй раз (фигура — самое дорогое). */
 const out={areas:areas,materialRate:rate.total,materialRows:rate.rows,chargeRows:services.rows,materials:salesMoney(materials),services:salesMoney(services.total/q),base:base,adjustments:adjustments,unit:incomplete?null:running,line:incomplete?null:salesMoney(running*live),knownSubtotal:running,complete:!incomplete,unsupportedCurrency:unsupportedCurrency,missingMaterials:!m||!rate.known,missingServices:services.unpriced,qty:live,ordered:q,cancelled:q-live};
 /* Цена руками: итоговая цена юнита, наценки к ней не прибавляются; расчёт
    остаётся для справки (computedUnit). */
 if(line.priceManual!=null&&Number.isFinite(+line.priceManual)&&+line.priceManual>=0){const v=salesMoney(+line.priceManual);Object.assign(out,{manual:true,computedUnit:out.unit,adjustments:[],unit:v,line:salesMoney(v*live),complete:true,unsupportedCurrency:false});}
 return out;
}
function salesLineCommercialAdjustments(line,order){
 const price=salesLineCommercialPrice(line,order);
 return price.adjustments.map(a=>({key:a.key,label:a.label,percent:a.percent,rule:a.rule,catalog:a.catalog,base:price.complete?a.base:null,unitAmount:price.complete?a.amount:null,qty:price.qty,lineAmount:price.complete?salesMoney(a.amount*price.qty):null,complete:price.complete}));
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
/* Пустая норма не замораживается (пункт 14, владелец 29.10.2026: «то, что мы
   не знаем, будет подсвечено — что нужно исправить и внести данные»):
   внесли норму в Data — сохранённый заказ берёт её; заполненная норма заказа
   остаётся своей. Заказ из архива на просмотре — как записан. */
function salesWeightRate(key,order){
 const k='weight:'+key,b=order&&order.priceBook,live=()=>{const r=(DB.materialWeightRates||[]).find(r=>r.key===key);return r?mdNonNeg(r.rate):null;};
 const kept=b&&Object.prototype.hasOwnProperty.call(b,k),archived=typeof archiveVisit!=='undefined'&&archiveVisit&&order&&archiveVisit.ids.has(order.id);
 const v=kept&&(b[k]!=null||archived)?b[k]:live();
 if(salesBookRec)salesBookRec[k]=v==null?null:v;
 return v;
}
/* productionPlan — фактические лайты собранного юнита (частичный Recut).
   Без него коммерческие документы по-прежнему считают геометрию заказа. */
/* Пробел в весе (пункт 14, владелец 29.10.2026): «то, что мы не знаем, будет
   подсвечено у нас — что нужно исправить и внести данные». what — чего нет,
   where — где внести, part — слово для клиента («Interlayer weight not
   included»). key — один пробел на весь заказ, сколько бы строк его ни имели. */
function salesWeightGap(key,what,where,part,go){return {key,what,where,part,go:go||null};}
const SALES_WEIGHT_WHERE={glass:'Data → Setup → Weights',card:'Data → Materials → Glass',film:'Data → Materials → Lamination',spacer:'Data → Materials → IGU assembly → Spacers',gas:'Data → Materials → IGU assembly → Gas',recipe:'Data → Materials → IGU assembly → Surround recipes',norm:'Order line → Weight → Edit weight norms',extra:'Order line → Weight → Additional components',line:'Order Lines',shape:'Shape of the line'};
/* Геометрия лайтов для веса: площадь ft², периметр м и отпечаток контура
   (одинаковые лайты — рамка по любому). Записывается в строку при Save
   (line.measure.lites, sales/line-measure) — владелец, 30.10.2026: «если
   данные с фигуры уже получены в ячейку веса, то зачем её пересчитывать!». */
function salesWeightLiteGeo(plan){
 if(!plan||!plan.valid)return [];
 return (plan.lites||[]).map(l=>({index:l.index,area:(l.result&&l.result.valid?l.result.area:Math.abs(fabSignedArea(l.finishedPoints)))/144,perimeter:fabPolylineLength(l.finishedPoints,true)*.0254,contour:salesMeasureHash(JSON.stringify(l.finishedPoints))}));
}
function salesLineLiteGeo(line,order){
 const shape=salesLineGeometryShape(line),m=salesMakeupById(order,line.makeupId);
 return salesWeightLiteGeo(shape&&m?salesEffectiveCuttingPlan(line,shape,order):null);
}
function salesLineWeight(line,order,productionPlan){
 order=order||soDraft;
 const rows=[],m=salesMakeupById(order,line.makeupId),shape=salesLineGeometryShape(line),areas=salesLineAreas(line,order);
 const kept=!productionPlan&&typeof salesMeasureFor==='function'?salesMeasureFor(line,order):null;
 const lites=kept&&kept.lites?kept.lites:salesWeightLiteGeo(productionPlan||(shape&&m?salesEffectiveCuttingPlan(line,shape,order):null));
 const add=(label,kg,note,gap)=>rows.push({label:label,kg:Number.isFinite(kg)&&kg>=0?kg:null,note:note||'',gap:gap||null});
 const norm=(key,label,basis,unit,note,gap)=>{const rate=salesWeightRate(key,order);rows.push({key:key,label:label,basis:basis,unit:unit,rate:rate,kg:rate!=null&&Number.isFinite(basis)&&basis>=0?rate*basis:null,note:note||'',gap:basis==null?salesWeightGap('shape','Size of the glass',SALES_WEIGHT_WHERE.shape,'glass'):gap});};
 if(!m||!areas.valid){
  const gap=!m?salesWeightGap('line-makeup','Makeup',SALES_WEIGHT_WHERE.line,'line'):salesWeightGap('line-size','Size',SALES_WEIGHT_WHERE.line,'line');
  return {rows:[],kg:null,lineKg:null,knownKg:0,complete:false,estimated:false,missing:1,gaps:[gap]};
 }
 const geometry=(i)=>{
  const lite=lites.find(l=>l.index===i);
  return lite?{area:lite.area,perimeter:lite.perimeter,contour:lite.contour}:{area:null,perimeter:null,contour:null};
 };
 const glass=(ply,label,geo)=>{
  const product=glassProductById(ply&&ply.glassProductId),t=glassEffectiveThicknessMm(product);
  const mm=t.mm||+(ply&&ply.thicknessMm)||0;
  const d=glassDensityKgM3(order);
  const gap=geo.area==null?salesWeightGap('shape','Size of the glass',SALES_WEIGHT_WHERE.shape,'glass'):!(mm>0)?salesWeightGap('thickness:'+(product?product.id:''),(product?glassShortName(product):'Glass')+' thickness',SALES_WEIGHT_WHERE.card,'glass',product?{t:'glassProduct',id:product.id}:null):!d?salesWeightGap('glass-density','Glass density',SALES_WEIGHT_WHERE.glass,'glass',{setup:true}):null;
  add(label+(product?' · '+product.code:''),geo.area!=null&&mm>0&&d?glassLayerWeightKg(mm,d,geo.area):null,!d?'No glass density in Weight norms':t.exact?'':'Nominal thickness estimate',gap);
  if(!t.exact&&mm>0)rows[rows.length-1].estimated=true;
 };
 const surface=(ply,label,geo)=>{
  if(ply.category==='spandrel')norm('spandrel:'+ply.spandrel.productId,label+' · Spandrel',geo.area==null?null:geo.area*GLASS_M2_PER_FT2,'kg/m²','Applied coating norm per finished area',salesWeightGap('weight:spandrel:'+ply.spandrel.productId,'Spandrel weight norm',SALES_WEIGHT_WHERE.norm,'spandrel coating',{line:true}));
  if(ply.visionType==='frit'||ply.frit&&ply.frit.enabled)norm('frit:'+ply.frit.productId+':'+(ply.frit.pattern||'custom'),label+' · Frit',geo.area==null?null:geo.area*GLASS_M2_PER_FT2,'kg/m²','Applied pattern norm per finished area',salesWeightGap('weight:frit:'+ply.frit.productId+':'+(ply.frit.pattern||'custom'),'Frit weight norm',SALES_WEIGHT_WHERE.norm,'frit',{line:true}));
 };
 (m.panes||[]).forEach((p,i)=>{
  const g=geometry(i),label='Lite '+(i+1);
  if(p.category==='laminated'){
   const lam=p.laminated||{};
   [lam.outer,lam.inner].forEach((ply,j)=>{if(ply){glass(ply,label+(j?'b':'a'),g);surface(ply,label+(j?'b':'a'),g);}});
   (lam.interlayers||[]).forEach(f=>{
    const prod=mdById('interlayerProduct',f.productId);
    norm('film:'+f.productId,label+' · '+(prod?prod.name:'Interlayer'),g.area==null?null:g.area*GLASS_M2_PER_FT2*(f.thicknessMm/1000),'kg/m³','Density × actual interlayer volume',salesWeightGap('film:'+f.productId,(prod?prod.name:'Interlayer')+' density',SALES_WEIGHT_WHERE.film+(prod?' → '+prod.name:''),'interlayer',prod?{t:'interlayerProduct',id:prod.id}:null));
   });
  }else{glass(p,label,g);surface(p,label,g);}
 });
 /* Обвязка по рецепту рамки: рамка идёт по контуру камеры. У ступенчатого
    пакета — всегда по меньшему лайту, иначе юнит не загерметизировать
    (владелец, 23.10.2026); размеры лайтов — из Shape designer. */
 (m.cavities||[]).forEach((c,i)=>{
  const a=geometry(i),b=geometry(i+1),same=!!a.contour&&a.contour===b.contour;
  const pick=same?a:a.area!=null&&b.area!=null?(b.area<a.area?b:a):null,suffix=' · Cavity '+(i+1);
  const geo=pick&&pick.area!=null?{areaFt2:pick.area,perimeterM:pick.perimeter}:null;
  const got=surroundCavityParts(c,geo,order),sp=mdById('spacerVariant',c.spacerVariantId);
  if(!sp)add('Spacer'+suffix,null,'Spacer not found',salesWeightGap('spacer-missing','Spacer of the Makeup',SALES_WEIGHT_WHERE.line,'spacer'));
  else if(!got.recipe)add('Surround'+suffix,null,'No recipe in the spacer card',salesWeightGap('recipe:'+sp.id,sp.name+' recipe',SALES_WEIGHT_WHERE.spacer,'spacer and sealant',{t:'spacerVariant',id:sp.id}));
  const basis=geo?'perimeter '+geo.perimeterM.toFixed(2)+' m · area '+geo.areaFt2.toFixed(2)+' ft²':'';
  const gapOf=x=>!geo?salesWeightGap('shape','Size of the glass',SALES_WEIGHT_WHERE.shape,'glass')
   :x.part==='spacer'?salesWeightGap('spacer-weight:'+sp.id,sp.name+' weight',SALES_WEIGHT_WHERE.spacer,'spacer',{t:'spacerVariant',id:sp.id})
   :x.part==='gas'?salesWeightGap('gas:'+(x.item?x.item.id:''),(x.item?x.item.name:'Gas')+' density',SALES_WEIGHT_WHERE.gas,'gas',x.item?{t:'gasProduct',id:x.item.id}:null)
   :salesWeightGap('recipe-row:'+(got.recipe?got.recipe.id:'')+':'+x.rowId,(got.recipe?got.recipe.name+' · ':'')+x.label+' norm',SALES_WEIGHT_WHERE.recipe,String(x.label).toLowerCase(),got.recipe?{t:'surroundRecipe',id:got.recipe.id}:null);
  got.parts.forEach(x=>rows.push({label:x.label+suffix,kg:x.kg,usedKg:x.usedKg,wastePct:x.wastePct,basisText:basis,table:x.table,itemId:x.item?x.item.id:'',perimeterM:geo?geo.perimeterM:null,note:x.note+(x.wastePct?' · used with '+x.wastePct+'% waste: '+(x.usedKg==null?'—':x.usedKg.toFixed(3)+' kg'):''),gap:x.kg==null?gapOf(x):null}));
 });
 const muntin=shape&&shape.muntin;
 if(muntin&&muntin.enabled&&(m.cavities||[]).length){
  const got=shapeMuntinGeoFor(shape),prod=muntinProduct(muntin.productId);
  norm('muntin:'+muntin.productId,'Muntin · '+prod.label,got?got.result.totalLengthIn*.0254:null,'kg/m','Calculated bar cut length',salesWeightGap('weight:muntin:'+muntin.productId,'Muntin weight norm',SALES_WEIGHT_WHERE.norm,'muntins',{line:true}));
  norm('muntin-connectors:'+muntin.productId,'Muntin connectors',1,'kg/unit','Total connectors per unit',salesWeightGap('weight:muntin-connectors:'+muntin.productId,'Muntin connectors norm',SALES_WEIGHT_WHERE.norm,'muntins',{line:true}));
 }
 (line.weightExtras||[]).forEach(x=>add(x.label||'Additional component',mdNonNeg(x.kg),'Per unit',salesWeightGap('extra:'+(x.label||''),(x.label||'Additional component')+' weight',SALES_WEIGHT_WHERE.extra,x.label?String(x.label).toLowerCase():'additional components',{line:true})));
 const missing=rows.filter(r=>r.kg==null).length,known=rows.reduce((s,r)=>s+(r.kg||0),0),complete=rows.length>0&&missing===0;
 const gaps=[];rows.forEach(r=>{if(r.kg==null&&r.gap&&!gaps.some(g=>g.key===r.gap.key))gaps.push(r.gap);});
 return {rows:rows,kg:complete?known:null,lineKg:complete?known*salesPositiveInt(line.qty,1):null,knownKg:known,complete:complete,estimated:rows.some(r=>r.estimated&&r.kg!=null),missing:missing,gaps:gaps};
}
/* Вес заказа (пункт 14): известное складывается всегда — снизу вверх,
   компонент → юнит → строка × Qty → заказ, до округления. Неизвестное не ноль:
   пробелы с номерами строк. kg — null, только если посчитать нечего; complete —
   все нормы есть; estimated — где-то номинальная толщина вместо фактической.
   Qty — заказанное (отгрузки, сканы и Recut вес заказа не меняют). */
function salesOrderWeight(order){
 order=order||soDraft;
 if(!order)return {kg:null,complete:false,estimated:false,partial:false,gaps:[]};
 const lines=order&&order.lines||[],gaps=new Map();let kg=0,counted=0,estimated=false,complete=lines.length>0;
 lines.forEach((l,i)=>{
  const w=salesLineWeight(l,order);
  if(w.complete||w.knownKg>0){kg+=w.knownKg*salesPositiveInt(l.qty,1);counted++;}
  if(w.estimated)estimated=true;
  if(w.complete)return;
  complete=false;
  (w.gaps.length?w.gaps:[salesWeightGap('unknown','Weight data',SALES_WEIGHT_WHERE.norm,'components')]).forEach(g=>{let x=gaps.get(g.key);if(!x){x=Object.assign({},g,{lines:[]});gaps.set(g.key,x);}x.lines.push(i+1);});
 });
 return {kg:counted?kg:null,complete:complete,estimated:estimated,partial:!complete&&counted>0,gaps:[...gaps.values()]};
}
/* Чего нет в весе — клиенту, без внутренних подсказок: «Interlayer weight not
   included», строка без размера — «line 3». */
function salesWeightMissingText(w){
 if(!w||w.complete)return '';
 const lines=[],parts=[];
 w.gaps.forEach(g=>{if(g.part==='line')g.lines.forEach(n=>{if(!lines.includes(n))lines.push(n);});else if(!parts.includes(g.part))parts.push(g.part);});
 const list=parts.concat(lines.length?[(lines.length===1?'line ':'lines ')+lines.sort((a,b)=>a-b).join(', ')]:[]);
 const t=list.join(', ');return t?t.charAt(0).toUpperCase()+t.slice(1)+' weight not included':'';
}
/* Подсказка у нас: чего нет, в каких строках и где внести. */
function salesWeightTip(w){
 if(!w||w.complete)return '';
 return [w.missingText||salesWeightMissingText(w)].concat((w.gaps||[]).map(g=>g.what+' → '+g.where+(g.lines&&g.lines.length?' (line'+(g.lines.length>1?'s ':' ')+g.lines.join(', ')+')':''))).filter(Boolean).join('\n');
}
/* Число веса: мелкое — с сотыми (0.28 kg не «0»), остальное — целыми. */
function salesKgText(kg){return kg==null?'—':kg<10?kg.toFixed(2):Math.round(kg).toLocaleString('en-US');}
