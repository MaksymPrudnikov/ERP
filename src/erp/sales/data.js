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
const SALES_LAMINATED_GLASS_TYPES=['lowe','reflective','uncoated'];
const SALES_LAMINATED_FRIT_POSITIONS=['outside','in_film'];
const SALES_MAX_INTERLAYERS=4;
const SALES_INTERLAYER_LAYER_MM=.38;
const SALES_MAX_INTERLAYER_LAYERS=6;
const SALES_PRIMARY_SEALANT_ID='SEAL-PIB';

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
/* Кромка лайта: пусто = по правилу (пакет → арис, одиночное → по толщине,
   ламинат → по суммарной), либо выбранная руками. Нужна, когда у пакета одно
   стекло полируют, а второе только зачищают. */
const SALES_PANE_EDGEWORK=['','arris','polish'];
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

/* В выборе Lite первая позиция — Clear, затем всё, что реально есть на
   складе, и только после этого предзаказ. Для покрытого стекла Clear — это
   базовое стекло варианта; в общем каталоге Clear означает именно обычное
   непокрытое стекло, чтобы покрытия "on Clear" не обгоняли складские позиции.
   Исходный каталог не мутируем: на него опираются Master Data и импорты. */
function salesGlassIsClear(g,preferBaseClear){
 return !!g&&g.substrate==='clear'&&(preferBaseClear||g.coatingFamily==='uncoated');
}
function salesGlassPriority(g,preferBaseClear){return salesGlassIsClear(g,preferBaseClear)?0:(g&&g.stocked===true?1:2);}
function salesGlassSortLabel(g,preferBaseClear){return String(preferBaseClear?glassBaseName(g):(g&&g.name)||'');}
function salesSortGlass(rows,preferBaseClear){
 return (Array.isArray(rows)?rows:[]).slice().sort((a,b)=>{
  const priority=salesGlassPriority(a,preferBaseClear)-salesGlassPriority(b,preferBaseClear);
  if(priority)return priority;
  const label=salesGlassSortLabel(a,preferBaseClear).localeCompare(salesGlassSortLabel(b,preferBaseClear),'en',{sensitivity:'base',numeric:true});
  if(label)return label;
  return String((a&&a.name)||'').localeCompare(String((b&&b.name)||''),'en',{sensitivity:'base',numeric:true})||String((a&&a.code)||'').localeCompare(String((b&&b.code)||''),'en',{sensitivity:'base',numeric:true});
 });
}
/* У покрытого стекла первым шагом выбирают покрытие. Поэтому общий список
   группируем именно по покрытию: сначала покрытия, у которых для выбранных
   производителя и толщины есть хотя бы одна складская позиция, затем только
   предзаказ. Внутри покрытия сохраняется правило Clear → склад → предзаказ. */
function salesSortCoatedGlass(rows){
 const groups=Object.create(null);
 (Array.isArray(rows)?rows:[]).forEach(g=>{const coating=glassCoatingName(g);if(!groups[coating])groups[coating]=[];groups[coating].push(g);});
 return Object.keys(groups).sort((a,b)=>{
  const stock=(groups[a].some(g=>g.stocked===true)?0:1)-(groups[b].some(g=>g.stocked===true)?0:1);
  return stock||a.localeCompare(b,'en',{sensitivity:'base',numeric:true});
 }).reduce((out,coating)=>out.concat(salesSortGlass(groups[coating],true)),[]);
}

function salesFirstGlass(family,manufacturer,thickness){
 const rows=activeGlassProducts().filter(x=>(!family||x.coatingFamily===family)&&(!manufacturer||x.manufacturer===manufacturer)&&(!thickness||x.thicknessMm===+thickness));
 const preferBaseClear=family==='lowe'||family==='reflective';
 return (preferBaseClear?salesSortCoatedGlass(rows):salesSortGlass(rows,false))[0]||salesSortGlass(activeGlassProducts(),false)[0]||null;
}
function salesDefaultLaminatedFrit(){return {enabled:false,position:'outside',productId:'FRIT-CERAMIC',color:FRIT_COLORS[0],pattern:FRIT_PATTERNS[0],dotMm:FRIT_DEFAULT_DOT_MM,marginFrom:FRIT_DEFAULT_CORNER,marginW16:FRIT_DEFAULT_MARGIN16,marginH16:FRIT_DEFAULT_MARGIN16,marking:''};}
function normalizeSalesLaminatedFrit(raw,d){
 raw=raw&&typeof raw==='object'?raw:{};d=d||salesDefaultLaminatedFrit();
 const position=SALES_LAMINATED_FRIT_POSITIONS.includes(raw.position)?raw.position:d.position,color=salesString(raw.color),pattern=salesString(raw.pattern),corner=salesString(raw.marginFrom);
 return {enabled:raw.enabled===true||raw.active===true||raw.fritEnabled===true,position,productId:salesString(raw.productId)||d.productId,color:FRIT_COLORS.includes(color)?color:d.color,pattern:FRIT_PATTERNS.includes(pattern)?pattern:d.pattern,dotMm:salesFritDotMm(raw.dotMm,d.dotMm),marginFrom:FRIT_MARGIN_CORNERS.includes(corner)?corner:d.marginFrom,marginW16:salesStoredMargin16(raw.marginW16,d.marginW16),marginH16:salesStoredMargin16(raw.marginH16,d.marginH16),marking:salesString(raw.marking)};
}
function salesDefaultLaminatedPly(g){return {manufacturer:g?g.manufacturer:'',thicknessMm:g?g.thicknessMm:6,visionType:g&&SALES_LAMINATED_GLASS_TYPES.includes(g.coatingFamily)?g.coatingFamily:'uncoated',glassProductId:g?g.id:'',heatTreatmentId:'HT-AN',frit:salesDefaultLaminatedFrit()};}
function salesLaminatedPlyCandidates(ply){
 const fam=SALES_LAMINATED_GLASS_TYPES.includes(ply&&ply.visionType)?ply.visionType:'uncoated';
 const rows=activeGlassProducts().filter(g=>(!ply.manufacturer||g.manufacturer===ply.manufacturer)&&(!ply.thicknessMm||g.thicknessMm===+ply.thicknessMm)&&g.coatingFamily===fam);
 return fam==='lowe'||fam==='reflective'?salesSortCoatedGlass(rows):salesSortGlass(rows,false);
}
function normalizeSalesLaminatedPly(raw,legacyProductId,legacyHeatTreatmentId,d){
 raw=raw&&typeof raw==='object'?raw:{};
 const requestedId=salesString(raw.glassProductId||legacyProductId),requested=glassProductById(requestedId),fallback=glassProductById(d.glassProductId);
 const basis=requested||fallback,manufacturer=salesString(raw.manufacturer)||(basis&&basis.manufacturer)||d.manufacturer;
 const thicknessMm=+raw.thicknessMm>0?+raw.thicknessMm:((basis&&basis.thicknessMm)||d.thicknessMm);
 const requestedType=raw.visionType||raw.type||(basis&&basis.coatingFamily),visionType=SALES_LAMINATED_GLASS_TYPES.includes(requestedType)?requestedType:d.visionType;
 const out={manufacturer,thicknessMm,visionType,glassProductId:requestedId,heatTreatmentId:salesString(raw.heatTreatmentId||legacyHeatTreatmentId)||d.heatTreatmentId,frit:normalizeSalesLaminatedFrit(raw.frit,d.frit)};
 const rows=salesLaminatedPlyCandidates(out);if(!rows.some(g=>g.id===out.glassProductId))out.glassProductId=(rows[0]||{}).id||'';
 return out;
}
function salesInterlayerLayerCount(v,def){const n=Math.round(+v);return Number.isFinite(n)?Math.max(1,Math.min(SALES_MAX_INTERLAYER_LAYERS,n)):(def==null?1:def);}
function salesInterlayerThicknessForLayers(layers){return +(salesInterlayerLayerCount(layers)*SALES_INTERLAYER_LAYER_MM).toFixed(2);}
function salesInterlayerLayersFromThickness(v){const n=+v;if(!Number.isFinite(n)||n<=0)return 1;return Math.max(1,Math.min(SALES_MAX_INTERLAYER_LAYERS,Math.round(n/SALES_INTERLAYER_LAYER_MM)));}
function normalizeSalesInterlayer(layer,defaultProductId){
 layer=typeof layer==='string'?{productId:layer}:(layer&&typeof layer==='object'?layer:{});
 const sourceProductId=salesString(layer.productId)||defaultProductId,migration=interlayerProductMigration(sourceProductId);
 const productId=interlayerCanonicalProductId(sourceProductId)||interlayerCanonicalProductId(defaultProductId)||'INT-PVB';
 const explicit=layer.layers!=null&&layer.layers!==''?layer.layers:layer.layerCount,oldThickness=layer.thicknessMm;
 const layers=explicit!=null&&explicit!==''?salesInterlayerLayerCount(explicit)
  :(oldThickness!=null&&oldThickness!==''?salesInterlayerLayersFromThickness(oldThickness):(migration?migration.layers:1));
 return {productId,layers,thicknessMm:salesInterlayerThicknessForLayers(layers)};
}
function normalizeSalesInterlayers(lam,d){
 let rows=Array.isArray(lam.interlayers)?lam.interlayers:(Array.isArray(lam.interlayerProductIds)?lam.interlayerProductIds:(lam.interlayerProductId?[lam.interlayerProductId]:d.interlayers));
 rows=rows.slice(0,SALES_MAX_INTERLAYERS).map(x=>normalizeSalesInterlayer(x,d.interlayers[0].productId));
 return rows.length?rows:[normalizeSalesInterlayer({},d.interlayers[0].productId)];
}
function salesDefaultPane(i){
 const g=salesFirstGlass('uncoated','Vitro',6)||salesFirstGlass();
 const ply=salesDefaultLaminatedPly(g);
 return {
  id:salesUid('LITE'),category:'vision',manufacturer:g?g.manufacturer:'',thicknessMm:g?g.thicknessMm:6,visionType:'uncoated',glassProductId:g?g.id:'',heatTreatmentId:'HT-AN',
  coatingSurface:null,
  frit:{productId:'FRIT-CERAMIC',color:FRIT_COLORS[0],pattern:FRIT_PATTERNS[0],dotMm:FRIT_DEFAULT_DOT_MM,marginFrom:FRIT_DEFAULT_CORNER,marginW16:FRIT_DEFAULT_MARGIN16,marginH16:FRIT_DEFAULT_MARGIN16,marking:'',surface:null},
  spandrel:{productId:'SPAN-CERAMIC',color:'Black',surface:null},
  laminated:{outer:Object.assign({},ply,{frit:Object.assign({},ply.frit)}),interlayers:[normalizeSalesInterlayer({},'INT-PVB')],inner:Object.assign({},ply,{frit:Object.assign({},ply.frit)})}
 };
}
function salesActiveSpacerVariants(){return (DB.spacerVariant||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
function salesCavitySpacer(c){return mdById('spacerVariant',c&&c.spacerVariantId)||salesActiveSpacerVariants()[0]||null;}
function salesSpacerWidths(){return [...new Set(salesActiveSpacerVariants().map(x=>x.size).filter(Boolean))];}
function salesDefaultCavity(i){return {id:salesUid('CAV'),spacerVariantId:'SP-BWE-1732',gasProductId:'GAS-ARGON',primarySealantId:SALES_PRIMARY_SEALANT_ID,secondarySealantId:'SEAL-SIL'};}
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
  edgework:SALES_PANE_EDGEWORK.includes(p.edgework)?p.edgework:'',
  manufacturer:salesString(p.manufacturer)||d.manufacturer,thicknessMm:+p.thicknessMm>0?+p.thicknessMm:d.thicknessMm,
  visionType,glassProductId:salesString(p.glassProductId)||d.glassProductId,heatTreatmentId:salesString(p.heatTreatmentId)||d.heatTreatmentId,
  coatingSurface:normalizeSurface(p.coatingSurface,allowed),
  frit:normalizeFritSpec(frit,d.frit,allowed),
  spandrel:{productId:salesString(sp.productId)||d.spandrel.productId,color:salesString(sp.color)||d.spandrel.color,surface:normalizeSurface(sp.surface,allowed)},
  laminated:{outer:normalizeSalesLaminatedPly(lam.outer,lam.outerGlassProductId,lam.outerHeatTreatmentId||p.heatTreatmentId,d.laminated.outer),interlayers:normalizeSalesInterlayers(lam,d.laminated),inner:normalizeSalesLaminatedPly(lam.inner,lam.innerGlassProductId,lam.innerHeatTreatmentId||p.heatTreatmentId,d.laminated.inner)}
 };
}
/* PIB — обязательный первичный герметик стеклопакета. Он остаётся в данных и
   спецификации, но не является выбором оператора в Cavity. Нормализация также
   исправляет старые черновики, где первичный герметик могли сменить вручную. */
function normalizeSalesCavity(c,index){c=c&&typeof c==='object'?c:{};const d=salesDefaultCavity(index);return {id:salesEntityId(c.id,'CAV'),spacerVariantId:salesString(c.spacerVariantId)||d.spacerVariantId,gasProductId:salesString(c.gasProductId)||d.gasProductId,primarySealantId:SALES_PRIMARY_SEALANT_ID,secondarySealantId:salesString(c.secondarySealantId)||d.secondarySealantId};}
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
/* Отдельная форма на лайт. Ступенчатый пакет с фигурой: у 10 мм один контур, у
   6 мм — другой, меньший, и отступом от общего он не выводится. Пусто = лайт
   живёт на общей форме строки (со своим отступом, если он задан). */
function normalizeSalesLiteShapes(raw){
 const out={};
 if(raw&&typeof raw==='object')Object.keys(raw).forEach(function(key){
  if(!/^\d+$/.test(String(key)))return;
  const ref=normalizeShapeRef(raw[key]);
  if(ref.id)out[String(key)]=ref;
 });
 return out;
}
function normalizeSalesOrderLine(l){
 l=l&&typeof l==='object'?l:{};
 const width16=l.width16!=null?salesStoredDim16(l.width16):salesDimTo16(l.width),height16=l.height16!=null?salesStoredDim16(l.height16):salesDimTo16(l.height);
 return {id:salesEntityId(l.id,'SOL'),lineType:'physical',makeupId:salesString(l.makeupId),qty:salesPositiveInt(l.qty,1),width16,height16,mark:salesString(l.mark),notes:salesString(l.notes),shapeRef:normalizeShapeRef(l.shapeRef||{shapeId:l.shapeId}),liteShapes:normalizeSalesLiteShapes(l.liteShapes),muntinRef:normalizeMuntinRef(l.muntinRef||{muntinId:l.muntinId}),chargePricing:normalizeSalesChargePricing(l.chargePricing)};
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
function newSalesOrderDraft(){const now=new Date().toISOString(),o=normalizeSalesOrder({status:'draft',priority:'normal',branch:'Infinity Glass Group Inc',delivery:'pickup',currency:'CAD',createdAt:now,updatedAt:now,makeups:[{code:'A',unitType:'double'}],lines:[]});o.lines.push(normalizeSalesOrderLine({makeupId:o.makeups[0].id,qty:1}));return o;}
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
  p.glassProductId===id||(p.laminated&&((p.laminated.outer&&p.laminated.outer.glassProductId===id)||(p.laminated.inner&&p.laminated.inner.glassProductId===id)))));
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
 let total=0,known=true;m.panes.forEach(p=>{if(p.category==='laminated'){const a=glassProductById(p.laminated.outer&&p.laminated.outer.glassProductId),b=glassProductById(p.laminated.inner&&p.laminated.inner.glassProductId),films=p.laminated.interlayers||[];if(a&&b&&films.length&&films.every(x=>Number.isFinite(+x.thicknessMm)&&+x.thicknessMm>0))total+=(a.thicknessMm||0)+(b.thicknessMm||0)+films.reduce((n,x)=>n+(+x.thicknessMm||0),0);else known=false;}else{const g=glassProductById(p.glassProductId);if(g)total+=g.thicknessMm||0;else known=false;}});m.cavities.forEach(c=>{const sp=mdById('spacerVariant',c.spacerVariantId),r=sp&&fabParseDimStrict(sp.size);if(r&&r.ok)total+=r.v*25.4;else known=false;});return known?total:null;
}

/* Catalog temperMode remains a hard production fact, but exceptional orders
   are allowed. Return messages for an explicit save-time confirmation instead
   of silently accepting the mismatch or blocking the operator completely. */
function salesTemperCompatibilityWarnings(order){
 const out=[];
 (order&&order.makeups||[]).forEach(m=>(m.panes||[]).forEach((p,index)=>{
  const rows=p.category==='laminated'
   ?[['OUTER PLY',p.laminated&&p.laminated.outer],['INNER PLY',p.laminated&&p.laminated.inner]]
   :[['',p]];
  rows.forEach(row=>{
   const spec=row[1]||{},g=glassProductById(spec.glassProductId),ht=mdById('heatTreatment',spec.heatTreatmentId),fired=spec.heatTreatmentId==='HT-HS'||spec.heatTreatmentId==='HT-FT';
   if(!g)return;
   const where='Makeup '+m.code+' · Lite '+(index+1)+(row[0]?' · '+row[0]:'');
   if(glassNeedsFurnace(g)&&!fired)out.push(where+': '+(g.code||g.name)+' requires furnace processing, but '+(ht?ht.name:'no heat treatment')+' is selected.');
   if(glassBannedFromFurnace(g)&&fired)out.push(where+': '+(g.code||g.name)+' cannot be heat-treated, but '+(ht?ht.name:'a furnace treatment')+' is selected.');
  });
 }));
 return out;
}
