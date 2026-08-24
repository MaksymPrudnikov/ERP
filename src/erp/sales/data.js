/* =====================================================================
   erp/sales/data · sales-0.3b-makeup
   Draft Sales Order domain with order-scoped Makeups.
   No global Configuration Library. Shape/Muntin stay external configurators.
   ===================================================================== */

DEFAULT.salesOrder=[];
if(!Array.isArray(DB.salesOrder))DB.salesOrder=[];

const SALES_PRIORITIES=['normal','rush','critical'];
const SALES_DELIVERY_TYPES=['pickup','delivery'];
const SALES_ORDER_STATUSES=['draft'];
const SALES_UNIT_TYPES=['single','double','triple'];
const SALES_LITE_CATEGORIES=['vision','spandrel','laminated'];
const SALES_VISION_TYPES=['lowe','reflective','frit','uncoated'];

function salesUid(prefix){
 prefix=prefix||'SO';
 try{if(globalThis.crypto&&typeof crypto.randomUUID==='function')return prefix+'-'+crypto.randomUUID();}catch(e){}
 return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,9).toUpperCase();
}
function salesString(v){return String(v==null?'':v).trim();}
const SALES_ENTITY_ID=/^[A-Za-z0-9_-]{1,96}$/;
function salesEntityId(v,prefix){const s=salesString(v);return SALES_ENTITY_ID.test(s)?s:salesUid(prefix);}
function salesRefId(v){const s=salesString(v);return SALES_ENTITY_ID.test(s)?s:'';}
function salesPositiveInt(v,def){const n=Math.floor(+v);return Number.isFinite(n)&&n>0?n:(def==null?1:def);}
function salesPriorityLabel(v){return ({normal:'Normal',rush:'Rush',critical:'Critical'})[v]||'Normal';}
function salesDeliveryLabel(v){return v==='delivery'?'Delivery':'Pickup';}
function salesUnitLabel(v){return ({single:'Single Lite',double:'Double',triple:'Triple'})[v]||'Double';}
function salesLiteCategoryLabel(v){return ({vision:'Vision',spandrel:'Spandrel',laminated:'Laminated'})[v]||'Vision';}
function salesVisionTypeLabel(v){return ({lowe:'Low-E',reflective:'Reflective',frit:'Frit',uncoated:'Uncoated'})[v]||'Uncoated';}
function salesPaneCount(unitType){return unitType==='single'?1:unitType==='triple'?3:2;}

function salesDimTo16(v){
 const r=fabParseDimStrict(v);return r.ok&&r.v>0?Math.round(r.v*16):null;
}
function salesStoredDim16(v){const n=+v;return Number.isInteger(n)&&n>0?n:null;}

function salesDimFrom16(v){return Number.isInteger(v)&&v>0?frac64(v/16):'';}
/* Отступ узора фрита — размер заказа, а не константа, и ноль в нём законен:
   узор идёт до самой кромки. Поэтому у отступа свой парсер — salesDimTo16
   отбрасывает 0 вместе с мусором, и «0» превращалось бы в пустое поле. */
function salesMarginTo16(v){const r=fabParseDimStrict(v);return r.ok&&r.v>=0?Math.round(r.v*16):null;}
function salesMarginFrom16(v){return Number.isInteger(v)&&v>=0?frac64(v/16):'';}
function salesStoredMargin16(v,def){if(v==null||v==='')return def;const n=+v;return Number.isInteger(n)&&n>=0?n:def;}
function salesFritDotMm(v,def){const n=+v;return Number.isFinite(n)&&n>0?n:def;}
function salesDimDisplay(v){return Number.isInteger(v)&&v>0?frac64(v/16)+'″':'—';}

function salesFirstGlass(family,manufacturer,thickness){
 const rows=activeGlassProducts().filter(x=>(!family||x.coatingFamily===family)&&(!manufacturer||x.manufacturer===manufacturer)&&(!thickness||x.thicknessMm===+thickness));
 return rows[0]||activeGlassProducts()[0]||null;
}
function salesDefaultPane(i){
 const g=salesFirstGlass('uncoated','Vitro',6)||salesFirstGlass();
 return {
  id:salesUid('LITE'),category:'vision',manufacturer:g?g.manufacturer:'',thicknessMm:g?g.thicknessMm:6,visionType:'uncoated',glassProductId:g?g.id:'',heatTreatmentId:'HT-AN',
  coatingSurface:null,
  frit:{productId:'FRIT-CERAMIC',color:FRIT_COLORS[0],pattern:FRIT_PATTERNS[0],dotMm:FRIT_DEFAULT_DOT_MM,marginFrom:FRIT_DEFAULT_CORNER,marginW16:FRIT_DEFAULT_MARGIN16,marginH16:FRIT_DEFAULT_MARGIN16,marking:'',surface:null},
  spandrel:{productId:'SPAN-CERAMIC',color:'Black',surface:null},
  laminated:{outerGlassProductId:g?g.id:'',interlayerProductId:'INT-PVB030',innerGlassProductId:g?g.id:''}
 };
}
function salesDefaultCavity(i){return {id:salesUid('CAV'),spacerVariantId:'SP-BWE-1732',gasProductId:'GAS-ARGON',primarySealantId:'SEAL-PIB',secondarySealantId:'SEAL-SIL'};}
function normalizeSurface(v,allowed){const n=+v;return Number.isInteger(n)&&allowed.includes(n)?n:null;}
/* Спецификация фрита нормализуется по РЕАЛЬНОМУ ассортименту цеха. Старые
   заказы несут 'Black' + 'Full coverage' + coverage:'100' — изделие, которого
   не существует; такие значения падают в дефолт, а поля coverage больше нет:
   в спецификации силкскрина его нет вообще. */
function normalizeFritSpec(f,d,allowed){
 f=f&&typeof f==='object'?f:{};
 const color=salesString(f.color),pattern=salesString(f.pattern),corner=salesString(f.marginFrom);
 return {
  productId:salesString(f.productId)||d.productId,
  color:FRIT_COLORS.includes(color)?color:d.color,
  pattern:FRIT_PATTERNS.includes(pattern)?pattern:d.pattern,
  dotMm:salesFritDotMm(f.dotMm,d.dotMm),
  marginFrom:FRIT_MARGIN_CORNERS.includes(corner)?corner:d.marginFrom,
  marginW16:salesStoredMargin16(f.marginW16,d.marginW16),
  marginH16:salesStoredMargin16(f.marginH16,d.marginH16),
  marking:salesString(f.marking),
  surface:normalizeSurface(f.surface,allowed)
 };
}
function salesPaneSurfaces(index){return [index*2+1,index*2+2];}
function normalizeSalesPane(p,index){
 const d=salesDefaultPane(index);p=p&&typeof p==='object'?p:{};
 const category=SALES_LITE_CATEGORIES.includes(p.category)?p.category:d.category;
 const visionType=SALES_VISION_TYPES.includes(p.visionType||p.type)?(p.visionType||p.type):d.visionType;
 const allowed=salesPaneSurfaces(index);
 const frit=p.frit&&typeof p.frit==='object'?p.frit:{};
 const sp=p.spandrel&&typeof p.spandrel==='object'?p.spandrel:{};
 const lam=p.laminated&&typeof p.laminated==='object'?p.laminated:{};
 return {
  id:salesEntityId(p.id,'LITE'),category,
  manufacturer:salesString(p.manufacturer)||d.manufacturer,thicknessMm:+p.thicknessMm>0?+p.thicknessMm:d.thicknessMm,
  visionType,glassProductId:salesString(p.glassProductId)||d.glassProductId,heatTreatmentId:salesString(p.heatTreatmentId)||d.heatTreatmentId,
  coatingSurface:normalizeSurface(p.coatingSurface,allowed),
  frit:normalizeFritSpec(frit,d.frit,allowed),
  spandrel:{productId:salesString(sp.productId)||d.spandrel.productId,color:salesString(sp.color)||d.spandrel.color,surface:normalizeSurface(sp.surface,allowed)},
  laminated:{outerGlassProductId:salesString(lam.outerGlassProductId)||d.laminated.outerGlassProductId,interlayerProductId:salesString(lam.interlayerProductId)||d.laminated.interlayerProductId,innerGlassProductId:salesString(lam.innerGlassProductId)||d.laminated.innerGlassProductId}
 };
}
function normalizeSalesCavity(c,index){c=c&&typeof c==='object'?c:{};const d=salesDefaultCavity(index);return {id:salesEntityId(c.id,'CAV'),spacerVariantId:salesString(c.spacerVariantId)||d.spacerVariantId,gasProductId:salesString(c.gasProductId)||d.gasProductId,primarySealantId:salesString(c.primarySealantId)||d.primarySealantId,secondarySealantId:salesString(c.secondarySealantId)||d.secondarySealantId};}
function normalizeOrderMakeup(m,index){
 m=m&&typeof m==='object'?m:{};const unitType=SALES_UNIT_TYPES.includes(m.unitType)?m.unitType:'double',count=salesPaneCount(unitType);
 const panes=(Array.isArray(m.panes)?m.panes:[]).slice(0,count);while(panes.length<count)panes.push(salesDefaultPane(panes.length));
 const cavities=(Array.isArray(m.cavities)?m.cavities:[]).slice(0,Math.max(0,count-1));while(cavities.length<count-1)cavities.push(salesDefaultCavity(cavities.length));
 return {id:salesEntityId(m.id,'MU'),code:salesString(m.code).toUpperCase()||String.fromCharCode(65+(index||0)%26),unitType,panes:panes.map(normalizeSalesPane),cavities:cavities.map(normalizeSalesCavity),notes:salesString(m.notes),createdAt:salesString(m.createdAt),updatedAt:salesString(m.updatedAt)};
}
function normalizeShapeRef(r){r=r&&typeof r==='object'?r:{};return {id:salesRefId(r.id||r.shapeId),revision:Number.isInteger(+r.revision)?+r.revision:null,fingerprint:salesString(r.fingerprint)};}
function normalizeMuntinRef(r){r=r&&typeof r==='object'?r:{};return {id:salesRefId(r.id||r.muntinId),shapeId:salesRefId(r.shapeId),shapeRevision:Number.isInteger(+r.shapeRevision)?+r.shapeRevision:null};}
function normalizeSalesChargePricing(raw){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const out={};
 Object.keys(raw).forEach(function(key){
  if(!/^[A-Za-z0-9:._|+\-]{1,180}$/.test(key))return;const r=raw[key]&&typeof raw[key]==='object'?raw[key]:{};
  const catalog=r.catalogRate==null||r.catalogRate===''?NaN:Number(r.catalogRate),order=r.orderRate==null||r.orderRate===''?NaN:Number(r.orderRate);
  out[key]={catalogRate:Number.isFinite(catalog)&&catalog>=0?catalog:null,orderRate:Number.isFinite(order)&&order>=0?order:null};
 });
 return out;
}
function normalizeSalesOrderLine(l){
 l=l&&typeof l==='object'?l:{};
 const width16=l.width16!=null?salesStoredDim16(l.width16):salesDimTo16(l.width),height16=l.height16!=null?salesStoredDim16(l.height16):salesDimTo16(l.height);
 return {id:salesEntityId(l.id,'SOL'),lineType:'physical',makeupId:salesString(l.makeupId),qty:salesPositiveInt(l.qty,1),width16,height16,mark:salesString(l.mark),notes:salesString(l.notes),shapeRef:normalizeShapeRef(l.shapeRef||{shapeId:l.shapeId}),muntinRef:normalizeMuntinRef(l.muntinRef||{muntinId:l.muntinId}),chargePricing:normalizeSalesChargePricing(l.chargePricing)};
}
function normalizeSalesOrder(o){
 o=o&&typeof o==='object'?o:{};const priority=SALES_PRIORITIES.includes(o.priority)?o.priority:'normal',delivery=SALES_DELIVERY_TYPES.includes(o.delivery)?o.delivery:'pickup',status=SALES_ORDER_STATUSES.includes(o.status)?o.status:'draft',currency=['CAD','USD'].includes(o.currency)?o.currency:'CAD';
 let makeups=(Array.isArray(o.makeups)?o.makeups:[]).map(normalizeOrderMakeup);if(!makeups.length)makeups=[normalizeOrderMakeup({code:'A',unitType:'double'},0)];
 const muIds=new Set(),muCodes=new Set();makeups=makeups.map((m,i)=>{while(muIds.has(m.id))m.id=salesUid('MU');muIds.add(m.id);if(!m.code||muCodes.has(m.code)){m.code=salesNextMakeupCodeFromSet(muCodes);}muCodes.add(m.code);return m;});
 const first=makeups[0].id;
 const lines=(Array.isArray(o.lines)?o.lines:[]).map(normalizeSalesOrderLine);lines.forEach(l=>{if(!muIds.has(l.makeupId))l.makeupId=first;});
 return {id:salesEntityId(o.id,'SO'),businessNumber:salesString(o.businessNumber),status,customerId:salesString(o.customerId),customerPo:salesString(o.customerPo||o.po),dueDate:salesString(o.dueDate),priority,branch:salesString(o.branch)||'Infinity Glass Group Inc',delivery,paymentTerms:salesString(o.paymentTerms||o.terms),currency,notes:salesString(o.notes),servicePricing:normalizeSalesChargePricing(o.servicePricing),makeups,lines,createdAt:salesString(o.createdAt),updatedAt:salesString(o.updatedAt)};
}
function salesNextMakeupCodeFromSet(used){const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const c of letters)if(!used.has(c))return c;let n=27,code;do{code='MU-'+String(n++).padStart(3,'0');}while(used.has(code));return code;}
function nextMakeupCode(order){return salesNextMakeupCodeFromSet(new Set((order.makeups||[]).map(m=>m.code)));}
function normalizeSalesData(){
 if(!Array.isArray(DB.salesOrder))DB.salesOrder=[];const ids=new Set(),numbers=new Set(),lineIds=new Set();
 DB.salesOrder=DB.salesOrder.filter(x=>x&&typeof x==='object').map(x=>{const o=normalizeSalesOrder(x);while(ids.has(o.id))o.id=salesUid('SO');ids.add(o.id);if(o.businessNumber){if(numbers.has(o.businessNumber))o.businessNumber='';else numbers.add(o.businessNumber);}o.lines.forEach(l=>{while(lineIds.has(l.id))l.id=salesUid('SOL');lineIds.add(l.id);});return o;});
}
function validateSalesPayload(src){
 if(!src||typeof src!=='object')return;if(Object.prototype.hasOwnProperty.call(src,'salesOrder')&&!Array.isArray(src.salesOrder))throw new Error('The "salesOrder" field must be an array.');
 const ids=new Set(),numbers=new Set(),lineIds=new Set(),entityId=/^[A-Za-z0-9_-]{1,96}$/;(src.salesOrder||[]).forEach((o,i)=>{
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Sales Order row '+(i+1)+' must be an object.');
  if(o.lines!=null&&!Array.isArray(o.lines))throw new Error('Sales Order '+(i+1)+': lines must be an array.');
  if(o.makeups!=null&&!Array.isArray(o.makeups))throw new Error('Sales Order '+(i+1)+': makeups must be an array.');
  if(o.id){const id=salesString(o.id);if(!entityId.test(id))throw new Error('Sales Order '+(i+1)+' has an invalid id.');if(ids.has(id))throw new Error('Sales Orders contains duplicate id "'+id+'".');ids.add(id);}
  if(o.businessNumber){const n=salesString(o.businessNumber);if(numbers.has(n))throw new Error('Sales Orders contains duplicate number "'+n+'".');numbers.add(n);}
  const muIds=new Set(),muCodes=new Set();(o.makeups||[]).forEach((m,j)=>{if(!m||typeof m!=='object')throw new Error('Sales Order '+(i+1)+', Makeup '+(j+1)+' must be an object.');if(m.id){const id=salesString(m.id);if(!entityId.test(id))throw new Error('Makeup '+(j+1)+' has an invalid id.');if(muIds.has(id))throw new Error('Makeups contains duplicate id "'+id+'".');muIds.add(id);}if(m.code){const c=salesString(m.code).toUpperCase();if(muCodes.has(c))throw new Error('Makeups contains duplicate code "'+c+'".');muCodes.add(c);}});
  (o.lines||[]).forEach((l,j)=>{if(!l||typeof l!=='object'||Array.isArray(l))throw new Error('Sales Order '+(i+1)+', line '+(j+1)+' must be an object.');if(l.id){const id=salesString(l.id);if(!entityId.test(id))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid id.');if(lineIds.has(id))throw new Error('Sales Order lines contains duplicate id "'+id+'".');lineIds.add(id);}if(!l.makeupId)throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has no Makeup.');if(!muIds.has(salesString(l.makeupId)))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Makeup.');if(l.width16!=null&&!salesStoredDim16(l.width16))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid width16.');if(l.height16!=null&&!salesStoredDim16(l.height16))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid height16.');});
 });
}
function validateSalesReferences(){
 const customers=new Set((DB.customer||[]).map(c=>c.id)),shapeIds=new Set((DB.shapeDef||[]).map(s=>s.id)),muntinIds=new Set((DB.muntinDef||[]).map(m=>m.id));
 DB.salesOrder.forEach((o,i)=>{if(o.customerId&&!customers.has(o.customerId))throw new Error('Sales Order '+(o.businessNumber||i+1)+' references a missing Customer.');const mus=new Set(o.makeups.map(m=>m.id));o.lines.forEach((l,j)=>{if(!mus.has(l.makeupId))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Makeup.');if(l.shapeRef.id&&!shapeIds.has(l.shapeRef.id))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Shape.');if(l.muntinRef.id&&!muntinIds.has(l.muntinRef.id))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Muntin.');});});
}
function nextSalesOrderNumber(){let max=76001;DB.salesOrder.forEach(o=>{const n=+String(o.businessNumber||'').replace(/\D/g,'');if(Number.isFinite(n))max=Math.max(max,n);});return String(max+1);}
function newSalesOrderDraft(){const now=new Date().toISOString();return normalizeSalesOrder({status:'draft',priority:'normal',branch:'Infinity Glass Group Inc',delivery:'pickup',currency:'CAD',createdAt:now,updatedAt:now,makeups:[{code:'A',unitType:'double'}],lines:[]});}
function salesCustomerDisplay(id){const c=(DB.customer||[]).find(x=>x.id===id);return c?(c.displayName||c.legalName||c.code):'';}
function salesMakeupById(order,id){return (order&&order.makeups||[]).find(m=>m.id===id)||null;}
/* Позицию каталога, на которую ссылается хоть один Makeup, удалять нельзя:
   старый заказ показал бы `?` вместо кода стекла. Проверка живёт здесь, а не в
   masterdata: справочник материалов не знает про заказы и знать не должен.
   Черновик заказа считается наравне с сохранёнными — он ещё не в базе, но
   человек уже выбрал в нём это стекло. */
function salesGlassProductHasReferences(id){
 if(!id)return false;
 const inMakeups=ms=>(Array.isArray(ms)?ms:[]).some(m=>(m&&m.panes||[]).some(p=>
  p.glassProductId===id||(p.laminated&&(p.laminated.outerGlassProductId===id||p.laminated.innerGlassProductId===id))));
 return (DB.salesOrder||[]).some(o=>inMakeups(o.makeups))||
  (typeof soDraft!=='undefined'&&!!soDraft&&inMakeups(soDraft.makeups));
}
function salesShapeHasReferences(id){return (DB.salesOrder||[]).some(o=>o.lines.some(l=>l.shapeRef&&l.shapeRef.id===id))||(typeof soDraft!=='undefined'&&soDraft&&soDraft.lines.some(l=>l.shapeRef&&l.shapeRef.id===id));}
function salesMuntinHasReferences(id){return (DB.salesOrder||[]).some(o=>o.lines.some(l=>l.muntinRef&&l.muntinRef.id===id))||(typeof soDraft!=='undefined'&&soDraft&&soDraft.lines.some(l=>l.muntinRef&&l.muntinRef.id===id));}

function salesGlassCodeForPane(p){
 if(p.category==='laminated')return 'LAM';
 const g=glassProductById(p.glassProductId),base=g?(g.code||g.name):'?';
 if(p.category==='spandrel')return base+' SP';
 if(p.visionType==='frit')return base+' FRIT';
 if(p.visionType==='lowe'||p.visionType==='reflective')return base;
 return base;
}
function salesMakeupSummary(m){
 const bits=[];m.panes.forEach((p,i)=>{if(i){const c=m.cavities[i-1],sp=mdById('spacerVariant',c&&c.spacerVariantId),gas=mdById('gasProduct',c&&c.gasProductId);bits.push((sp?sp.size+' '+sp.system:'Cavity')+(gas&&gas.code!=='AIR'?' '+gas.code:''));}bits.push(salesGlassCodeForPane(p));});return bits.join(' / ');
}
function salesMakeupThicknessMm(m){
 let total=0,known=true;m.panes.forEach(p=>{if(p.category==='laminated'){const a=glassProductById(p.laminated.outerGlassProductId),b=glassProductById(p.laminated.innerGlassProductId),il=mdById('interlayerProduct',p.laminated.interlayerProductId);if(a&&b&&il&&il.thicknessMm!=null)total+=(a.thicknessMm||0)+(b.thicknessMm||0)+il.thicknessMm;else known=false;}else{const g=glassProductById(p.glassProductId);if(g)total+=g.thicknessMm||0;else known=false;}});m.cavities.forEach(c=>{const sp=mdById('spacerVariant',c.spacerVariantId),r=sp&&fabParseDimStrict(sp.size);if(r&&r.ok)total+=r.v*25.4;else known=false;});return known?total:null;
}
