/* =====================================================================
   erp/sales/data · sales-0.3b-makeup
   Draft Sales Order domain with order-scoped Makeups.
   No global Configuration Library. Shape/Muntin stay external configurators.
   ===================================================================== */

DEFAULT.salesOrder=[];
if(!Array.isArray(DB.salesOrder))DB.salesOrder=[];

const SALES_PRIORITIES=['normal','rush','critical'];
const SALES_DELIVERY_TYPES=['pickup','delivery'];
/* Статусы квоты и заказа живут в erp/sales/lifecycle. */
const SALES_UNIT_TYPES=['single','double','triple'];
const SALES_LITE_CATEGORIES=['vision','spandrel','laminated'];
const SALES_VISION_TYPES=['lowe','reflective','frit','uncoated'];
const SALES_LAMINATED_GLASS_TYPES=['lowe','reflective','uncoated'];
const SALES_LAMINATED_FRIT_POSITIONS=['outside','in_film'];
const SALES_MAX_INTERLAYERS=4;
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
function salesOrderChargeNumber(v,fallback){const n=Number(v);return Number.isFinite(n)&&n>=0?n:fallback;}
/* Сборы заказа — снимок Setup на момент создания (erp/sales/order-setup).
   Карта хранит своё имя и ставку: удалённая из Setup карта в старом заказе
   остаётся. Нет базы сбора — прежнее правило: HST на Subtotal + Energy,
   карта на Subtotal + Energy + HST. */
function salesOrderChargeBase(v,kind,legacy){return Array.isArray(v)?ORDER_CHARGE_BASE_PARTS[kind].filter(p=>v.includes(p)):legacy;}
function normalizeSalesOrderCharges(raw){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const s=orderSetup(),rc=raw.card&&typeof raw.card==='object'?raw.card:{};
 const network=salesRefId(rc.network)||((s.cardNetworks[0]?s.cardNetworks[0].id:'')),known=orderSetupNetwork(network);
 return {
  energy:{enabled:raw.energy&&typeof raw.energy.enabled==='boolean'?raw.energy.enabled:s.energyOn,rate:salesOrderChargeNumber(raw.energy&&raw.energy.rate,s.energyRate)},
  hst:{enabled:raw.hst&&typeof raw.hst.enabled==='boolean'?raw.hst.enabled:s.hstOn,rate:salesOrderChargeNumber(raw.hst&&raw.hst.rate,s.hstRate),base:salesOrderChargeBase(raw.hst&&raw.hst.base,'hst',['energy'])},
  card:{enabled:!!rc.enabled,network:network,name:salesString(rc.name).slice(0,60)||(known&&known.name)||'Card fee',rate:salesOrderChargeNumber(rc.rate,known?known.rate:0),base:salesOrderChargeBase(rc.base,'card',['energy','hst'])},
  delivery:{enabled:!!(raw.delivery&&raw.delivery.enabled),amount:salesOrderChargeNumber(raw.delivery&&raw.delivery.amount,0)},
  skidDeposit:{enabled:!!(raw.skidDeposit&&raw.skidDeposit.enabled),amount:salesOrderChargeNumber(raw.skidDeposit&&raw.skidDeposit.amount,0)}
 };
}

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
function salesDefaultLaminatedFrit(){const fd=orderSetupFrit();return {enabled:false,position:'outside',productId:'FRIT-CERAMIC',color:FRIT_COLORS[0],pattern:FRIT_PATTERNS[0],dotMm:fd.dotMm,marginFrom:fd.marginFrom,marginW16:fd.margin16,marginH16:fd.margin16,marking:''};}
function normalizeSalesLaminatedFrit(raw,d){
 raw=raw&&typeof raw==='object'?raw:{};d=d||salesDefaultLaminatedFrit();
 const position=SALES_LAMINATED_FRIT_POSITIONS.includes(raw.position)?raw.position:d.position,color=salesString(raw.color),pattern=salesString(raw.pattern),corner=salesString(raw.marginFrom);
 return {enabled:raw.enabled===true||raw.active===true||raw.fritEnabled===true,position,productId:salesString(raw.productId)||d.productId,color:FRIT_COLORS.includes(color)?color:d.color,pattern:FRIT_PATTERNS.includes(pattern)?pattern:d.pattern,dotMm:salesFritDotMm(raw.dotMm,d.dotMm),marginFrom:FRIT_MARGIN_CORNERS.includes(corner)?corner:d.marginFrom,marginW16:salesStoredMargin16(raw.marginW16,d.marginW16),marginH16:salesStoredMargin16(raw.marginH16,d.marginH16),marking:salesString(raw.marking)};
}
function salesRecommendedHeat(g){return glassNeedsFurnace(g)?'HT-FT':glassBannedFromFurnace(g)?'HT-AN':null;}
/* Каталог меняет закалку только при конфликте со стеклом: HS и FT + Heat Soak,
   выбранные вручную, переживают смену толщины или производителя. */
function salesApplyRecommendedHeat(p,g){
 const heat=salesRecommendedHeat(g);if(!heat)return;
 const ht=mdById('heatTreatment',p.heatTreatmentId),code=String(ht&&ht.code||'').toUpperCase();
 if(heat==='HT-FT'?code==='FT'||code==='HS':code==='AN')return;
 p.heatTreatmentId=heat;p.heatSoak=false;
}
function salesDefaultLaminatedPly(g){return {priceOverride:null,manufacturer:g?g.manufacturer:'',thicknessMm:g?g.thicknessMm:6,visionType:g&&SALES_LAMINATED_GLASS_TYPES.includes(g.coatingFamily)?g.coatingFamily:'uncoated',glassProductId:g?g.id:'',heatTreatmentId:salesRecommendedHeat(g)||'HT-AN',heatSoak:false,coatingPosition:'outside',frit:salesDefaultLaminatedFrit()};}
/* Покрытие на плите ламината лежит либо на её открытой грани (номер
   поверхности пакета, как у фрита «Outside film»), либо к плёнке. Владелец,
   28 сентября 2026: у 4Q272/4CL выбрать поверхность было нельзя, а маршрут
   требовал её. */
function salesCoatingSurfaceOf(p,index,side){
 const spec=side?p&&p.laminated&&p.laminated[side]:p;
 if(!spec||(spec.visionType!=='lowe'&&spec.visionType!=='reflective'))return 0;
 if(!side)return spec.coatingSurface||0;
 return spec.coatingPosition==='in_film'?'film':salesPaneSurfaces(index)[side==='inner'?1:0];
}
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
 const out={priceOverride:salesNonNegOrNull(raw.priceOverride),manufacturer,thicknessMm,visionType,glassProductId:requestedId,heatTreatmentId:salesString(raw.heatTreatmentId||legacyHeatTreatmentId)||d.heatTreatmentId,heatSoak:raw.heatSoak===true&&(raw.heatTreatmentId||legacyHeatTreatmentId)==='HT-FT',
  coatingPosition:SALES_LAMINATED_FRIT_POSITIONS.includes(raw.coatingPosition)?raw.coatingPosition:'outside',frit:normalizeSalesLaminatedFrit(raw.frit,d.frit)};
 /* Выбранное стекло подходит — список кандидатов не нужен (F5 перебирал его
    на каждый слой каждой строки). */
 const g=requested;
 if(g&&g.active!==false&&(!out.manufacturer||g.manufacturer===out.manufacturer)&&(!out.thicknessMm||g.thicknessMm===+out.thicknessMm)&&g.coatingFamily===(SALES_LAMINATED_GLASS_TYPES.includes(out.visionType)?out.visionType:'uncoated'))return out;
 const rows=salesLaminatedPlyCandidates(out);if(!rows.some(g=>g.id===out.glassProductId))out.glassProductId=(rows[0]||{}).id||'';
 return out;
}
/* Слой плёнки и разрешённые толщины — в её карточке (erp/masterdata/glass,
   interlayerCardFields). Число слоёв — толщина / слой. */
function salesInterlayerPlyMm(productId){const p=mdById('interlayerProduct',productId);return p&&p.plyMm>0?p.plyMm:INTERLAYER_SEED_PLY_MM;}
function salesInterlayerLayerCount(v,def){const n=Math.round(+v);return Number.isFinite(n)&&n>=1?n:(def==null?1:def);}
function salesInterlayerThicknessForLayers(layers,productId){return +(salesInterlayerLayerCount(layers)*salesInterlayerPlyMm(productId)).toFixed(2);}
function salesInterlayerLayersFromThickness(v,productId){const n=+v;if(!Number.isFinite(n)||n<=0)return 1;return Math.max(1,Math.round(n/salesInterlayerPlyMm(productId)));}
function normalizeSalesInterlayer(layer,defaultProductId){
 layer=typeof layer==='string'?{productId:layer}:(layer&&typeof layer==='object'?layer:{});
 const sourceProductId=salesString(layer.productId)||defaultProductId,migration=interlayerProductMigration(sourceProductId);
 const productId=interlayerCanonicalProductId(sourceProductId)||interlayerCanonicalProductId(defaultProductId)||INTERLAYER_DEFAULT_ID;
 const explicit=layer.layers!=null&&layer.layers!==''?layer.layers:layer.layerCount,oldThickness=layer.thicknessMm;
 const layers=explicit!=null&&explicit!==''?salesInterlayerLayerCount(explicit)
  :(oldThickness!=null&&oldThickness!==''?salesInterlayerLayersFromThickness(oldThickness,productId):(migration?migration.layers:1));
 /* Толщина заказа хранится: смена слоя в карточке сохранённый заказ не меняет. */
 const kept=+oldThickness>0&&explicit!=null&&explicit!==''?+(+oldThickness).toFixed(2):null;
 return {productId,layers,thicknessMm:kept!=null?kept:salesInterlayerThicknessForLayers(layers,productId),priceOverride:salesNonNegOrNull(layer.priceOverride)};
}
function normalizeSalesInterlayers(lam,d){
 let rows=Array.isArray(lam.interlayers)?lam.interlayers:(Array.isArray(lam.interlayerProductIds)?lam.interlayerProductIds:(lam.interlayerProductId?[lam.interlayerProductId]:d.interlayers));
 rows=rows.slice(0,SALES_MAX_INTERLAYERS).map(x=>normalizeSalesInterlayer(x,d.interlayers[0].productId));
 return rows.length?rows:[normalizeSalesInterlayer({},d.interlayers[0].productId)];
}
function salesDefaultPane(i){
 const g=salesFirstGlass('uncoated','Vitro',6)||salesFirstGlass();
 const ply=salesDefaultLaminatedPly(g),fd=orderSetupFrit();
 return {
  id:salesUid('LITE'),category:'vision',manufacturer:g?g.manufacturer:'',thicknessMm:g?g.thicknessMm:6,visionType:'uncoated',glassProductId:g?g.id:'',heatTreatmentId:salesRecommendedHeat(g)||'HT-AN',heatSoak:false,
  coatingSurface:null,
  frit:{productId:'FRIT-CERAMIC',color:FRIT_COLORS[0],pattern:FRIT_PATTERNS[0],dotMm:fd.dotMm,marginFrom:fd.marginFrom,marginW16:fd.margin16,marginH16:fd.margin16,marking:'',surface:null},
  /* Цвет по умолчанию — строка палитры, а не слово: иначе новый лайт сразу
     получал бы значение, которого в справочнике нет. Чёрный сохранён как
     прежнее поведение. Тип по умолчанию — силикон ICD, потому что Black
     #3-818 принадлежит его палитре: пара «керамика + цвет силикона» давала бы
     на новом лайте «нет в палитре». */
  spandrel:{productId:'SPAN-SILICONE',color:'SPC-3-818',colorNote:'',surface:null},
  laminated:{outer:Object.assign({},ply,{frit:Object.assign({},ply.frit)}),interlayers:[normalizeSalesInterlayer({},INTERLAYER_DEFAULT_ID)],inner:Object.assign({},ply,{frit:Object.assign({},ply.frit)})}
 };
}
/* ---- Цены позиции ----------------------------------------------------
   Обвязка считается по-настоящему: базовая ставка висит на СЕМЕЙСТВЕ рамки,
   силикон дороже полисульфида, аргон добавляется сверху. Цены продажи стекла
   в каталоге пока нет — функция честно возвращает null, и поле остаётся
   пустым, пока прайс не заведён. */
/* Цена из справочника — на день сохранения заказа (владелец, 20.10.2026:
   «при сохранении цена фиксируется, но её руками можно будет изменить и
   обновить заказ»; «деньги — всегда повод для споров»; «измерять результаты
   корректно день за днём, год за годом»). Стекло, плёнка и складские позиции
   читаются через salesBook: у сохранённого заказа — из его priceBook, у нового
   — из Master Data. Save записывает в priceBook ровно те цены, по которым
   посчитан заказ; ставки услуг фиксировались и раньше (chargePricing). Заказ
   берётся из контекста расчёта (finWithOrder ставит его в soDraft). */
/* Новая цена сначала ищется в прайсах клиента (erp/sales/price-lists), потом
   в Master Data. Откуда она пришла, заказ помнит в priceFrom: ключ цены →
   прайс. */
let salesBookRec=null,salesFromRec=null;
function salesBook(key,live){
 const o=typeof soDraft!=='undefined'&&soDraft,b=o&&o.priceBook;
 let v;
 if(b&&Object.prototype.hasOwnProperty.call(b,key)){v=b[key];if(salesFromRec&&o.priceFrom&&o.priceFrom[key])salesFromRec[key]=o.priceFrom[key];}
 else{const lp=salesPriceListFor(salesPriceTargetOfKey(key));v=lp?lp.price:live();if(salesFromRec&&lp)salesFromRec[key]=lp.listId;}
 if(salesBookRec)salesBookRec[key]=v==null?null:v;
 return v;
}
/* Откуда цена по ключу priceBook: прайс заказа или живой поиск. '' — общая. */
function salesPriceFromOf(key){
 const o=typeof soDraft!=='undefined'&&soDraft;if(!o)return '';
 if(o.priceBook&&Object.prototype.hasOwnProperty.call(o.priceBook,key))return (o.priceFrom&&o.priceFrom[key])||'';
 const lp=salesPriceListFor(salesPriceTargetOfKey(key));return lp?lp.listId:'';
}
/* Цены и нормы веса, по которым заказ посчитан сейчас: прежние — из его
   priceBook, новые позиции — из Master Data. */
function salesPriceBookOf(o){
 const keep=salesBookRec,keepFrom=salesFromRec;salesBookRec={};salesFromRec={};
 try{
  finOrderTotals(o);
  if(typeof salesLineWeight==='function')finWithOrder(o,()=>(o.lines||[]).forEach(l=>{try{salesLineWeight(l,o);}catch(e){console.warn('weight book '+(o.businessNumber||o.id)+': '+e.message);}}));
  /* Откуда цены — рядом с самими ценами, тем же снимком. */
  if(Object.keys(salesFromRec).length)o.priceFrom=salesFromRec;else delete o.priceFrom;
  return salesBookRec;
 }finally{salesBookRec=keep;salesFromRec=keepFrom;}
}
function salesPriceFromClean(f){const out={};if(f&&typeof f==='object'&&!Array.isArray(f))Object.keys(f).forEach(k=>{if(typeof f[k]==='string'&&f[k])out[k]=f[k];});return out;}
function salesPriceBookClean(b){const out={};Object.keys(b).forEach(k=>{const v=b[k];if(v===null)out[k]=null;else if(typeof v==='number'&&Number.isFinite(v))out[k]=v;else if(typeof v==='string'&&(k.indexOf('unit:')===0||k.indexOf('snap:')===0))out[k]=v;});return out;}
function salesGlassSalePrice(g,tempered){const f=tempered?'salePriceTempered':'salePriceAnnealed';return salesBook('glass:'+g.id+':'+f,()=>g[f]==null?null:g[f]);}
/* Прайс, давший цену листа (лайт или слой ламината) — для «откуда цена». */
function salesGlassPriceFrom(x){
 const g=x&&glassProductById(x.glassProductId);if(!g)return '';
 const ht=mdById('heatTreatment',x.heatTreatmentId),code=String((ht&&ht.code)||'').toUpperCase();
 return salesPriceFromOf('glass:'+g.id+':'+(code==='FT'||code==='HS'?'salePriceTempered':'salePriceAnnealed'));
}
function salesInterlayerSalePrice(id){return salesBook('interlayer:'+id,()=>{const p=mdById('interlayerProduct',id);return p&&p.salePrice!=null?p.salePrice:null;});}
/* Обвязка — рецепт из айтемов (этап 3 плана Master Data,
   erp/masterdata/surround): у каждой части своя цена и единица продажи в
   карточке, цена ищется по прайсам клиента, как у любого айтема. */
function salesSurroundPartPrice(part){
 if(!part||!part.item)return null;
 return salesBook('item:'+part.table+':'+part.item.id,()=>part.item.salePrice==null?null:part.item.salePrice);
}
/* Ставка обвязки за ft² юнита: сумма частей, продаваемых за ft² без своих
   минимумов. Части с другой единицей (погонный дюйм, штука, вес) считаются
   в строке заказа по геометрии — salesCavityOtherUnits говорит, что они есть. */
function salesCavityCatalogPrice(c){
 if(!c)return null;
 const parts=surroundCavityParts(c,null,typeof soDraft!=='undefined'?soDraft:null).parts;
 if(!parts.length)return null;
 let p=0;
 for(const x of parts){
  const v=salesSurroundPartPrice(x);if(v==null)return null;
  if(salesSurroundPartIsPlain(x))p+=v;
 }
 return Math.round(p*100)/100;
}
function salesSurroundPartIsPlain(x){const r=salesItemSaleRules(x.table,x.item);return r.unit==='sqft'&&r.minArea==null&&r.minCharge==null;}
function salesCavityOtherUnits(c){return !!c&&c.priceOverride==null&&surroundCavityParts(c,null,typeof soDraft!=='undefined'?soDraft:null).parts.some(x=>x.item&&!salesSurroundPartIsPlain(x));}
/* Цена лайта = стекло из прайса + надбавка за то, что на нём делают.
   Spandrel и Frit продаются поверх стекла своей ставкой из справочника, а не
   вместо него: покрасить лист дешевле, чем купить другой лист. */
/* Цена ламината складывается из того, что в нём физически есть: два стекла плюс
   плёнки по числу слоёв. Считать его «как одно стекло» значит потерять половину
   стоимости — внутренний лист и плёнка стоят не меньше внешнего. */
function salesPlyCatalogPrice(ply){
 if(!ply)return null;
 const g=glassProductById(ply.glassProductId);
 if(!g)return null;
 const ht=mdById('heatTreatment',ply.heatTreatmentId);
 const code=String((ht&&ht.code)||'').toUpperCase();
 const base=salesGlassSalePrice(g,code==='FT'||code==='HS');
 return base==null?null:base;
}
function salesPlyPrice(ply){
 /* Ручная цена плиты старше каталожной — её ввели, глядя на конкретный заказ. */
 if(ply&&ply.priceOverride!=null)return ply.priceOverride;
 if(!ply)return null;
 const g=glassProductById(ply.glassProductId);
 if(!g)return null;
 const ht=mdById('heatTreatment',ply.heatTreatmentId);
 const code=String((ht&&ht.code)||'').toUpperCase();
 const base=salesGlassSalePrice(g,code==='FT'||code==='HS');
 if(base==null)return null;
 return base;
}
function salesLaminatedPrice(p){
 const lam=(p&&p.laminated)||{};
 const a=salesPlyPrice(lam.outer),b=salesPlyPrice(lam.inner);
 if(a==null||b==null)return null;
 let total=a+b,known=true;
 (lam.interlayers||[]).forEach(function(x){
  const layers=salesInterlayerLayerCount(x.layers!=null?x.layers:2);
  const rate=x.priceOverride!=null?x.priceOverride:salesInterlayerSalePrice(x.productId);
  if(rate==null){known=false;return;}
  total+=rate*layers;
 });
 /* Плёнка без цены делает неизвестной всю позицию: показать сумму двух стёкол
    как цену ламината значит занизить её молча. */
 return known?Math.round(total*100)/100:null;
}
function salesPaneCatalogPrice(p){
 if(!p)return null;
 if(p.category===`laminated`)return salesLaminatedPrice(p);
 const g=glassProductById(p.glassProductId);
 if(!g)return null;
 const ht=mdById('heatTreatment',p.heatTreatmentId);
 const code=String((ht&&ht.code)||'').toUpperCase();
 const tempered=code==='FT'||code==='HS';
 const base=salesGlassSalePrice(g,tempered);
 /* Стекло без цены в прайсе — прочерк, а не надбавка сама по себе:
    складывать надбавку с неизвестной базой значит выдать неполную цену за полную. */
 if(base==null)return null;
 /* Фрит и спандрел сюда НЕ входят: это работа, и она приходит начислением
    в сервисы строки (salesGlazingChargeRows). Цена лайта — цена листа. */
 return base;
}
/* Закалка выбрана вразрез с каталогом: стекло идёт только закалённым, а в
   позиции стоит Annealed. Цены на такую пару в прайсе нет, и это не молчаливый
   ноль — интерфейс подсвечивает несоответствие. */
function salesPaneTemperConflict(p){
 const g=glassProductById(p&&p.glassProductId);
 if(!g)return false;
 const ht=mdById('heatTreatment',p&&p.heatTreatmentId);
 const code=String((ht&&ht.code)||'').toUpperCase();
 if(glassNeedsFurnace(g)&&code==='AN')return true;
 return !!(glassBannedFromFurnace(g)&&(code==='FT'||code==='HS'));
}
/* Итог сборки: сумма ставок за sq ft по всем лайтам и камерам. Площадь сюда не
   входит — она у строки заказа, а не у makeup: один и тот же makeup стоит в
   позициях разного размера. Сервисы и обработка кромки считаются отдельно. */
function salesMakeupUnitPrice(m){
 if(!m)return {total:0,known:true};
 let total=0,known=true;
 (m.panes||[]).forEach(function(p){
  const v=p.priceOverride!=null?p.priceOverride:salesPaneCatalogPrice(p);
  if(v==null)known=false;else total+=v;
 });
 (m.cavities||[]).forEach(function(c){
  const v=c.priceOverride!=null?c.priceOverride:salesCavityCatalogPrice(c);
  if(v==null)known=false;else total+=v;
 });
 return {total:Math.round(total*100)/100,known:known};
}
function salesPriceValue(cat,over){return over!=null?over:cat;}
function salesNonNegOrNull(v){const n=+v;return v===``||v==null||!isFinite(n)||n<0?null:Math.round(n*100)/100;}
function salesActiveSpacerVariants(){return (DB.spacerVariant||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
function salesCavitySpacer(c){return mdById('spacerVariant',c&&c.spacerVariantId)||salesActiveSpacerVariants()[0]||null;}
/* Размеры в выпадающем списке — по возрастанию, а не в порядке заведения:
   шестнадцать дробей вперемешку читать невозможно. Сортируем по значению
   дроби, потому что как текст 1/2 встаёт раньше 3/16. С системой — только
   её ширины: несуществующую не предлагаем (владелец, 23.10.2026). */
function salesSpacerWidths(system){
 const seen=[...new Set(salesActiveSpacerVariants().filter(x=>!system||x.system===system).map(x=>x.size).filter(Boolean))];
 return seen.sort((a,b)=>{
  const qa=spacerSizeParts(a),qb=spacerSizeParts(b);
  if(qa&&qb)return qa.value-qb.value;
  return String(a).localeCompare(String(b));
 });
}
/* Делений столько, на сколько прямоугольников бары режут стекло: один
   горизонтальный даёт два, горизонтальный с вертикальным — четыре. По ним и
   считается цена. Раскладка принадлежит форме строки: makeup стоит в десятке
   строк, и бар на одном стекле не должен заводить отдельный состав. */
function salesMuntinSectionsOf(m){
 if(!m||!m.enabled)return 0;
 const v=Math.max(0,+m.verticalBars||0),h=Math.max(0,+m.horizontalBars||0);
 return (v||h)?(v+1)*(h+1):0;
}
function salesDefaultCavity(i){return {id:salesUid('CAV'),spacerVariantId:'SP-BWE-1732',gasProductId:'GAS-ARGON',primarySealantId:SALES_PRIMARY_SEALANT_ID,secondarySealantId:'SEAL-PS'};}
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
/* Спандрел: пять типов свели к двум 10 сентября 2026 (masterdata/glass, раздел
   5·7), и три отменённых id остаются только в СОХРАНЁННЫХ заказах — на каждый
   найдётся spandrelProductMigration. Ссылка переезжает при каждой нормализации
   панели, не разово при подъёме версии: заказ открывается одинаково честно
   независимо от того, когда его в последний раз сохраняли. Цвет не подменяется,
   если он уже валиден — переносится только цвет-заглушка старого типа. */
function normalizeSalesSpandrelSpec(sp,fallback,allowed){
 const rawId=salesString(sp.productId)||fallback.productId;
 const alias=(typeof spandrelProductMigration==='function')?spandrelProductMigration(rawId):null;
 const productId=alias?alias.id:rawId;
 const color=(alias&&alias.colour&&!salesString(sp.color))?alias.colour:(salesString(sp.color)||fallback.color);
 /* Название кастомного цвета. Ограничение длины — то же, что у произвольного
    stamp-текста в Shape: достаточно, чтобы назвать цвет, а не писать инструкцию. */
 const colorNote=salesString(sp.colorNote).slice(0,60);
 return {productId,color,colorNote,surface:normalizeSurface(sp.surface,allowed)};
}
function normalizeSalesPane(p,index){
 const d=salesDefaultPane(index);p=p&&typeof p==='object'?p:{};
 const category=SALES_LITE_CATEGORIES.includes(p.category)?p.category:d.category;
 const visionType=SALES_VISION_TYPES.includes(p.visionType||p.type)?(p.visionType||p.type):d.visionType;
 const allowed=salesPaneSurfaces(index);
 const frit=p.frit&&typeof p.frit==='object'?p.frit:{};
 const sp=p.spandrel&&typeof p.spandrel==='object'?p.spandrel:{};
 const lam=p.laminated&&typeof p.laminated==='object'?p.laminated:{};
 return {
  id:salesEntityId(p.id,'LITE'),category,priceOverride:salesNonNegOrNull(p.priceOverride),
  edgework:SALES_PANE_EDGEWORK.includes(p.edgework)?p.edgework:'',
  manufacturer:salesString(p.manufacturer)||d.manufacturer,thicknessMm:+p.thicknessMm>0?+p.thicknessMm:d.thicknessMm,
  visionType,glassProductId:salesString(p.glassProductId)||d.glassProductId,heatTreatmentId:salesString(p.heatTreatmentId)||d.heatTreatmentId,heatSoak:p.heatSoak===true&&p.heatTreatmentId==='HT-FT',
  /* У ламината поверхность покрытия живёт на плите (coatingPosition), номер
     панели от прежнего Vision здесь был бы чужим. */
  coatingSurface:category==='laminated'?null:normalizeSurface(p.coatingSurface,allowed),
  frit:normalizeFritSpec(frit,d.frit,allowed),
  spandrel:normalizeSalesSpandrelSpec(sp,d.spandrel,allowed),
  laminated:{outer:normalizeSalesLaminatedPly(lam.outer,lam.outerGlassProductId,lam.outerHeatTreatmentId||p.heatTreatmentId,d.laminated.outer),interlayers:normalizeSalesInterlayers(lam,d.laminated),inner:normalizeSalesLaminatedPly(lam.inner,lam.innerGlassProductId,lam.innerHeatTreatmentId||p.heatTreatmentId,d.laminated.inner)}
 };
}
/* PIB — обязательный первичный герметик стеклопакета. Он остаётся в данных и
   спецификации, но не является выбором оператора в Cavity. Нормализация также
   исправляет старые черновики, где первичный герметик могли сменить вручную. */
function normalizeSalesCavity(c,index){c=c&&typeof c==='object'?c:{};const d=salesDefaultCavity(index);return {id:salesEntityId(c.id,'CAV'),priceOverride:salesNonNegOrNull(c.priceOverride),spacerVariantId:salesString(c.spacerVariantId)||d.spacerVariantId,gasProductId:salesString(c.gasProductId)||d.gasProductId,primarySealantId:SALES_PRIMARY_SEALANT_ID,secondarySealantId:salesString(c.secondarySealantId)||d.secondarySealantId};}
function normalizeOrderMakeup(m,index){
 m=m&&typeof m==='object'?m:{};const unitType=SALES_UNIT_TYPES.includes(m.unitType)?m.unitType:'double',count=salesPaneCount(unitType);
 const panes=(Array.isArray(m.panes)?m.panes:[]).slice(0,count);while(panes.length<count)panes.push(salesDefaultPane(panes.length));
 const cavities=(Array.isArray(m.cavities)?m.cavities:[]).slice(0,Math.max(0,count-1));while(cavities.length<count-1)cavities.push(salesDefaultCavity(cavities.length));
 return {id:salesEntityId(m.id,'MU'),code:salesString(m.code).toUpperCase()||String.fromCharCode(65+(index||0)%26),unitType,panes:panes.map(normalizeSalesPane),cavities:cavities.map(normalizeSalesCavity),notes:salesString(m.notes),createdAt:salesString(m.createdAt),updatedAt:salesString(m.updatedAt)};
}
function normalizeShapeRef(r){r=r&&typeof r==='object'?r:{};return {id:salesRefId(r.id||r.shapeId),revision:Number.isInteger(+r.revision)?+r.revision:null,fingerprint:salesString(r.fingerprint)};}
function normalizeSalesChargePricing(raw){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const out={};
 Object.keys(raw).forEach(function(key){
  if(!/^[A-Za-z0-9:._|+\-]{1,180}$/.test(key))return;const r=raw[key]&&typeof raw[key]==='object'?raw[key]:{};
  const catalog=r.catalogRate==null||r.catalogRate===''?NaN:Number(r.catalogRate),order=r.orderRate==null||r.orderRate===''?NaN:Number(r.orderRate);
  out[key]={catalogRate:Number.isFinite(catalog)&&catalog>=0?catalog:null,orderRate:Number.isFinite(order)&&order>=0?order:null,...(typeof r.from==='string'&&r.from?{from:r.from}:{})};
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
 /* Hold units / Cancel units (erp/sales/unit-cancel) — поля только там, где они есть. */
 return normalizeUnitFields({id:salesEntityId(l.id,'SOL'),lineType:'physical',batchManaged:l.batchManaged===true,onHold:l.onHold===true,holdReason:l.onHold===true?salesString(l.holdReason).slice(0,200):'',holdAt:l.onHold===true?salesString(l.holdAt):'',makeupId:salesString(l.makeupId),qty:salesPositiveInt(l.qty,1),width16,height16,mark:salesString(l.mark),notes:salesString(l.notes),shapeRef:normalizeShapeRef(l.shapeRef||{shapeId:l.shapeId}),liteShapes:normalizeSalesLiteShapes(l.liteShapes),chargePricing:normalizeSalesChargePricing(l.chargePricing),batchedAt:salesString(l.batchedAt||l.cutStartedAt),cutStartedAt:salesString(l.cutStartedAt),batchNo:l.batchedAt||l.cutStartedAt?salesBatchNumber(l.batchNo):'',...(Number.isSafeInteger(l.shipQueue)&&l.shipQueue>0&&l.shipQueue<1000?{shipQueue:l.shipQueue}:{}),weightExtras:(Array.isArray(l.weightExtras)?l.weightExtras:[]).filter(x=>x&&typeof x==='object').map(x=>({label:salesString(x.label),kg:mdNonNeg(x.kg)})),
  /* Цена руками (line-metrics, salesLineCommercialPrice) — только если задана. */
  ...(salesNonNegOrNull(l.priceManual)!=null?{priceManual:salesNonNegOrNull(l.priceManual)}:{}),
  /* Сервисы, добавленные руками (sales/extra-services) — только если есть. */
  ...(Array.isArray(l.extraServices)&&l.extraServices.length?{extraServices:l.extraServices.map(normalizeSalesExtraService).slice(0,50)}:{})},l);
}
/* Сервис, добавленный к строке руками: из прайса (rateId) или свой — имя и
   единица. qty — на юнит строки; null у ft² и in — площадь и периметр юнита. */
function normalizeSalesExtraService(x){
 x=x&&typeof x==='object'?x:{};
 const rateId=salesString(x.rateId).slice(0,80),q=x.qty==null||x.qty===''?null:+x.qty;
 return {id:salesEntityId(x.id,'SX'),rateId,name:rateId?'':salesString(x.name).trim().slice(0,80),unit:rateId?'':(['pc','ft²','in'].includes(x.unit)?x.unit:'pc'),qty:Number.isFinite(q)&&q>0?q:null};
}
/* Строка-позиция каталога: изделие из стекла или готовая вещь — не одно и то
   же, и модель их не смешивает (раздел 6 схемы). Владелец: «там, где Single /
   Double / Triple, я бы добавил ещё один пункт, где могу выбрать любой предмет
   для продажи». Четвёртая кнопка стоит рядом с типом юнита, но данные у нового
   изделия — свои: ни Makeup, ни Shape, ни геометрии, ни маршрута, только
   позиция каталога, количество и цена.

   Кандидатов собираем по признаку `sellsAsOwnLine`, а не «всё кроме стекла»:
   правило «кроме стекла» пустило бы в список аргон, осушитель и герметик,
   которые поштучно не продаются. `table` хранит, ИЗ КАКОГО справочника взята
   позиция — их несколько (stockItem, interlayerProduct, …), и без имени
   таблицы найти строку обратно нечем. */
const SALES_EXTRA_ITEM_TABLES=['stockItem','interlayerProduct','sealantProduct','gasProduct','fritProduct','spandrelProduct'];
function salesExtraItemCandidates(){
 const out=[];
 SALES_EXTRA_ITEM_TABLES.forEach(table=>{
  (DB[table]||[]).forEach(x=>{if(x&&x.active!==false&&x.sellsAsOwnLine===true)out.push({table,id:x.id,name:x.name,code:x.code,salePrice:x.salePrice,subcategory:x.subcategory||''});});
 });
 return out;
}
function salesExtraItemRow(table,id){const rows=DB[table];return Array.isArray(rows)?rows.find(x=>x&&x.id===id)||null:null;}
function normalizeSalesExtraItem(x){
 x=x&&typeof x==='object'?x:{};
 return {id:salesEntityId(x.id,'EXT'),table:salesString(x.table),itemId:salesString(x.itemId),
  qty:salesPositiveInt(x.qty,1),priceOverride:salesNonNegOrNull(x.priceOverride),notes:salesString(x.notes)};
}
/* Цена — снимок каталога на момент, если строка её не переопределила: ставку
   меняют в справочнике, а сохранённый заказ остаётся при своей цифре. Пусто —
   позиция без цены честно встаёт Rate required, а не нулём. */
function salesExtraItemUnitPrice(x){
 if(x.priceOverride!=null)return x.priceOverride;
 return salesBook('item:'+x.table+':'+x.itemId,()=>{const row=salesExtraItemRow(x.table,x.itemId);return row&&row.salePrice!=null?row.salePrice:null;});
}
function salesExtraItemLineTotal(x){const p=salesExtraItemUnitPrice(x);return p==null?null:salesMoney(p*salesPositiveInt(x.qty,1));}
function salesExtraItemName(x){const row=salesExtraItemRow(x.table,x.itemId);return row?row.name:'(removed from catalogue)';}
function normalizeSalesOrder(o){
 o=o&&typeof o==='object'?o:{};const priority=SALES_PRIORITIES.includes(o.priority)?o.priority:'normal',delivery=SALES_DELIVERY_TYPES.includes(o.delivery)?o.delivery:'pickup',currency=['CAD','USD'].includes(o.currency)?o.currency:'CAD';
 let makeups=(Array.isArray(o.makeups)?o.makeups:[]).map(normalizeOrderMakeup);if(!makeups.length)makeups=[normalizeOrderMakeup({code:'A',unitType:'double'},0)];
 const muIds=new Set(),muCodes=new Set();makeups=makeups.map((m,i)=>{while(muIds.has(m.id))m.id=salesUid('MU');muIds.add(m.id);if(!m.code||muCodes.has(m.code)){m.code=salesNextMakeupCodeFromSet(muCodes);}muCodes.add(m.code);return m;});
 const first=makeups[0].id;
 const lines=(Array.isArray(o.lines)?o.lines:[]).map(normalizeSalesOrderLine);lines.forEach(l=>{if(!muIds.has(l.makeupId))l.makeupId=first;});
 const extraItems=(Array.isArray(o.extraItems)?o.extraItems:[]).map(normalizeSalesExtraItem);
 return {id:salesEntityId(o.id,'SO'),businessNumber:salesString(o.businessNumber),...salesLifecycleFields(o),customerId:salesString(o.customerId),customerPo:salesString(o.customerPo||o.po),dueDate:salesString(o.dueDate),priority,branch:salesString(o.branch)||'Infinity Glass Group Inc',delivery,paymentTerms:salesString(o.paymentTerms||o.terms),currency,notes:salesString(o.notes),servicePricing:normalizeSalesChargePricing(o.servicePricing),...(o.priceBook&&typeof o.priceBook==='object'&&!Array.isArray(o.priceBook)?{priceBook:salesPriceBookClean(o.priceBook)}:{}),...(f=>Object.keys(f).length?{priceFrom:f}:{})(salesPriceFromClean(o.priceFrom)),orderCharges:normalizeSalesOrderCharges(o.orderCharges),makeups,lines,extraItems,
  /* Заказ-переделка NCR (erp/quality/ncr): связь и «без оплаты» по умолчанию. */
  remakeNcrId:salesRefId(o.remakeNcrId),noCharge:o.noCharge===true,createdAt:salesString(o.createdAt),updatedAt:salesString(o.updatedAt),
  ...(c=>c.length?{cancellations:c}:{})(normalizeCancellations(o.cancellations,lines)),
  ...(a=>a.length?{adjustments:a}:{})(normalizeSalesAdjustments(o.adjustments))};
}
/* Поправка на заказ руками: свой текст и сумма, минус — меньше платить
   (владелец, 7.10.2026: «то, что касается денег, должно быть максимально
   флексибл — иногда где-то ошибка, и нужна возможность решить её руками»). */
function normalizeSalesAdjustments(raw){
 return (Array.isArray(raw)?raw:[]).filter(x=>x&&typeof x==='object'&&Number.isFinite(+x.amount)).map(x=>({id:salesEntityId(x.id,'ADJ'),label:salesString(x.label).slice(0,120),amount:Math.round(+x.amount*100)/100}));
}
function salesNextMakeupCodeFromSet(used){const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const c of letters)if(!used.has(c))return c;let n=27,code;do{code='MU-'+String(n++).padStart(3,'0');}while(used.has(code));return code;}
function nextMakeupCode(order){return salesNextMakeupCodeFromSet(new Set((order.makeups||[]).map(m=>m.code)));}
function normalizeSalesData(){
 if(!Array.isArray(DB.salesOrder))DB.salesOrder=[];const ids=new Set(),numbers=new Set(),lineIds=new Set();
 DB.salesOrder=DB.salesOrder.filter(x=>x&&typeof x==='object').map(x=>{const o=normalizeSalesOrder(x);while(ids.has(o.id))o.id=salesUid('SO');ids.add(o.id);if(o.businessNumber){if(numbers.has(o.businessNumber))o.businessNumber='';else numbers.add(o.businessNumber);}o.lines.forEach(l=>{while(lineIds.has(l.id))l.id=salesUid('SOL');lineIds.add(l.id);});return o;});
}
/* Один заказ — Save, Convert, копия квоты, переделка NCR меняют только его;
   остальные заказы уже приведены в порядок (старт, импорт). Раньше на каждый
   Save нормализовались все заказы — на базе 3 мес. это 0,7 с из 1,4 с
   (задание «База», П3). Повтор номера заказа, его строк или businessNumber с
   другим заказом — как в normalizeSalesData: новый номер, пустой номер. */
function normalizeSalesOrderIn(id){
 const i=DB.salesOrder.findIndex(x=>x&&x.id===id);if(i<0)return null;
 const o=normalizeSalesOrder(DB.salesOrder[i]),ids=new Set(),numbers=new Set(),lineIds=new Set();
 DB.salesOrder.forEach((x,k)=>{if(k===i||!x)return;ids.add(x.id);if(x.businessNumber)numbers.add(x.businessNumber);(x.lines||[]).forEach(l=>lineIds.add(l.id));});
 while(ids.has(o.id))o.id=salesUid('SO');
 if(o.businessNumber&&numbers.has(o.businessNumber))o.businessNumber='';
 o.lines.forEach(l=>{while(lineIds.has(l.id))l.id=salesUid('SOL');lineIds.add(l.id);});
 DB.salesOrder[i]=o;return o;
}
function validateSalesPayload(src){
 if(!src||typeof src!=='object')return;if(Object.prototype.hasOwnProperty.call(src,'salesOrder')&&!Array.isArray(src.salesOrder))throw new Error('The "salesOrder" field must be an array.');
 const ids=new Set(),numbers=new Set(),lineIds=new Set(),entityId=/^[A-Za-z0-9_-]{1,96}$/;(src.salesOrder||[]).forEach((o,i)=>{
  if(!o||typeof o!=='object'||Array.isArray(o))throw new Error('Sales Order row '+(i+1)+' must be an object.');
  if(o.lines!=null&&!Array.isArray(o.lines))throw new Error('Sales Order '+(i+1)+': lines must be an array.');
  if(o.adjustments!=null&&(!Array.isArray(o.adjustments)||o.adjustments.some(x=>!x||typeof x!=='object'||!Number.isFinite(+x.amount))))throw new Error('Sales Order '+(i+1)+': invalid adjustments.');
  (Array.isArray(o.lines)?o.lines:[]).forEach((l,j)=>{if(l&&l.priceManual!=null&&l.priceManual!==''&&!(Number.isFinite(+l.priceManual)&&+l.priceManual>=0))throw new Error('Sales Order '+(i+1)+', line '+(j+1)+': invalid price.');});
  if(o.extraItems!=null&&!Array.isArray(o.extraItems))throw new Error('Sales Order '+(i+1)+': extraItems must be an array.');
  if(o.makeups!=null&&!Array.isArray(o.makeups))throw new Error('Sales Order '+(i+1)+': makeups must be an array.');
  if(o.id){const id=salesString(o.id);if(!entityId.test(id))throw new Error('Sales Order '+(i+1)+' has an invalid id.');if(ids.has(id))throw new Error('Sales Orders contains duplicate id "'+id+'".');ids.add(id);}
  if(o.businessNumber){const n=salesString(o.businessNumber);if(numbers.has(n))throw new Error('Sales Orders contains duplicate number "'+n+'".');numbers.add(n);}
  const muIds=new Set(),muCodes=new Set();(o.makeups||[]).forEach((m,j)=>{if(!m||typeof m!=='object')throw new Error('Sales Order '+(i+1)+', Makeup '+(j+1)+' must be an object.');if(m.id){const id=salesString(m.id);if(!entityId.test(id))throw new Error('Makeup '+(j+1)+' has an invalid id.');if(muIds.has(id))throw new Error('Makeups contains duplicate id "'+id+'".');muIds.add(id);}if(m.code){const c=salesString(m.code).toUpperCase();if(muCodes.has(c))throw new Error('Makeups contains duplicate code "'+c+'".');muCodes.add(c);}});
  (o.lines||[]).forEach((l,j)=>{if(!l||typeof l!=='object'||Array.isArray(l))throw new Error('Sales Order '+(i+1)+', line '+(j+1)+' must be an object.');if(l.id){const id=salesString(l.id);if(!entityId.test(id))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid id.');if(lineIds.has(id))throw new Error('Sales Order lines contains duplicate id "'+id+'".');lineIds.add(id);}if(!l.makeupId)throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has no Makeup.');if(!muIds.has(salesString(l.makeupId)))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Makeup.');if(l.width16!=null&&!salesStoredDim16(l.width16))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid width16.');if(l.height16!=null&&!salesStoredDim16(l.height16))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' has an invalid height16.');});
 });
}
function validateSalesReferences(){
 const customers=new Set((DB.customer||[]).map(c=>c.id)),shapeIds=new Set((DB.shapeDef||[]).map(s=>s.id));
 DB.salesOrder.forEach((o,i)=>{if(o.customerId&&!customers.has(o.customerId))throw new Error('Sales Order '+(o.businessNumber||i+1)+' references a missing Customer.');const mus=new Set(o.makeups.map(m=>m.id));o.lines.forEach((l,j)=>{if(!mus.has(l.makeupId))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Makeup.');if(l.shapeRef.id&&!shapeIds.has(l.shapeRef.id))throw new Error('Sales Order '+(o.businessNumber||i+1)+', line '+(j+1)+' references a missing Shape.');});});
 /* Свой чертёж Recut (erp/quality/recut) — те же формы в DB.shapeDef. */
 (DB.recut||[]).forEach(r=>{if(r&&r.shapeRef&&[r.shapeRef].concat(Object.values(r.liteShapes||{})).some(x=>x&&x.id&&!shapeIds.has(x.id)))throw new Error('Recut '+r.no+' references a missing Shape.');});
}
function nextSalesOrderNumber(){let max=Math.max(76001,typeof archiveFloor==='function'?archiveFloor('order'):0);DB.salesOrder.forEach(o=>{if(o.kind==='quote'||/^Q-/i.test(String(o.businessNumber||'')))return;const n=+String(o.businessNumber||'').replace(/\D/g,'');if(Number.isFinite(n))max=Math.max(max,n);});return String(max+1);}
function newSalesOrderDraft(kind){const now=new Date().toISOString(),o=normalizeSalesOrder({kind:kind==='quote'?'quote':'order',priority:'normal',branch:'Infinity Glass Group Inc',delivery:'pickup',currency:'CAD',orderCharges:salesOrderChargeDefaults(),createdAt:now,updatedAt:now,makeups:[{code:'A',unitType:'double'}],lines:[]});o.lines.push(normalizeSalesOrderLine({makeupId:o.makeups[0].id,qty:1}));return o;}
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
  (typeof soDraft!=='undefined'&&!!soDraft&&inMakeups(soDraft.makeups))||
  /* Заказ в архиве (erp/archive) — тоже ссылка: на его просмотре стекло было бы «?». */
  typeof archiveGlassUsed==='function'&&archiveGlassUsed(id);
}
function salesShapeHasReferences(id){return (DB.salesOrder||[]).some(o=>o.lines.some(l=>l.shapeRef&&l.shapeRef.id===id))||(typeof soDraft!=='undefined'&&soDraft&&soDraft.lines.some(l=>l.shapeRef&&l.shapeRef.id===id));}

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
/* Толщина пакета складывается из стёкол и КАМЕР, а камера — это фактическая
   толщина рамки, а не её название. Раньше здесь разбиралась дробь из size, и
   пакет с Black Warm Edge 7/16 получался на 0.4 мм тоньше, чем собранный. */
function salesMakeupThicknessMm(m){
 function productMm(g){const q=typeof glassEffectiveThicknessMm==='function'?glassEffectiveThicknessMm(g):null;return q&&q.mm>0?q.mm:null;}
 let total=0,known=true;m.panes.forEach(p=>{if(p.category==='laminated'){const a=glassProductById(p.laminated.outer&&p.laminated.outer.glassProductId),b=glassProductById(p.laminated.inner&&p.laminated.inner.glassProductId),am=productMm(a),bm=productMm(b),films=p.laminated.interlayers||[];if(am!=null&&bm!=null&&films.length&&films.every(x=>Number.isFinite(+x.thicknessMm)&&+x.thicknessMm>0))total+=am+bm+films.reduce((n,x)=>n+(+x.thicknessMm||0),0);else known=false;}else{const mm=productMm(glassProductById(p.glassProductId));if(mm!=null)total+=mm;else known=false;}});m.cavities.forEach(c=>{const sp=mdById('spacerVariant',c.spacerVariantId),mm=spacerThicknessMm(sp),pib=surroundPibMm(sp,typeof soDraft!=='undefined'?soDraft:null);if(mm!=null&&pib!=null)total+=mm+pib;else known=false;});return known?total:null;
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
