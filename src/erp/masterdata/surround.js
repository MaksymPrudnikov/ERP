/* =====================================================================
   erp/masterdata/surround  ·  surround-1.0
   Обвязка стеклопакета рецептом (план Master Data, этап 3; владелец,
   22.10.2026: «рамка, PIB, второй герметик, газ, осушитель остаются
   отдельными айтемами со своими ценами; из них собирается рецепт обвязки,
   и вы контролируете его целиком»).
   IN : DB.spacerVariant, sealantProduct, gasProduct, iguPart
   OUT: DB.spacerSystem {id, code, name, family} — справочник систем рамок;
        DB.surroundRecipe {id, name, pibPerSideMm, rows[{id, part, amount,
        per, wastePct}]} — рецепт; у рамки recipeId, weightG / weightPer /
        weightMeasured; у газа densityKgM3;
        surroundRecipeOf, surroundCavityParts — части камеры: в изделии,
        расход с отходом; цену и количество к оплате даёт карточка части
        (erp/sales/line-metrics)

   Строка рецепта — часть камеры. `part` — слот камеры (spacer, primary,
   secondary, gas: что выбрано в makeup) или свой айтем `iguPart:<id>` /
   `sealantProduct:<id>` (осушитель, уголки). Вес рамки — в её карточке,
   плотность газа — в карточке газа; у остальных норма в строке рецепта:
   граммы на ft² юнита, на метр или фут периметра, на камеру. Пусто —
   «нормы нет», вес юнита честно неполный; 0 — ноль.

   Отход увеличивает расход, но не вес отгрузки: вес юнита — «в изделии».
   Ничего из чисел цеха здесь не зашито: засев ниже — только стартовые
   строки данных, их правят в Data.
   ===================================================================== */
const SURROUND_SLOTS={spacer:'Spacer',primary:'Primary sealant',secondary:'Secondary sealant',gas:'Gas'};
const SURROUND_PART_TABLES=['iguPart','sealantProduct'];
const SURROUND_PER={ft2:'g / ft² of unit',m:'g / m of perimeter',ft:'g / ft of perimeter',cavity:'g / cavity'};
const SPACER_WEIGHT_PER={ft:'g / ft',m:'g / m',ft2:'g / ft² of unit'};
const SURROUND_FT_PER_M=1/0.3048;

/* Засев. Числа — те, что до этапа 3 считал код (sales/data.js, line-metrics),
   чтобы сверка «до / после» сошлась; дальше их ведёт владелец. */
DEFAULT.spacerSystem=SPACER_SYSTEMS.map(s=>({id:'SYS-'+s.code,code:s.code,name:s.system,family:s.family}));
DEFAULT.iguPart=[{id:'IGU-DESICCANT',name:'Desiccant',code:'DES',salePrice:0},{id:'IGU-CONNECTORS',name:'Spacer connectors',code:'CON',salePrice:0}].map(x=>normalizeSimpleMaterial(x,'iguPart'));
DEFAULT.surroundRecipe=[
 {id:'REC-BWE-1732',name:'17/32 Black Warm Edge',pibPerSideMm:.4,rows:[
  {id:'R1',part:'spacer',wastePct:0},
  {id:'R2',part:'iguPart:IGU-DESICCANT',amount:33,per:'ft2',wastePct:0},
  {id:'R3',part:'primary',amount:5,per:'ft2',wastePct:0},
  {id:'R4',part:'secondary',amount:127,per:'ft2',wastePct:0},
  {id:'R5',part:'iguPart:IGU-CONNECTORS',amount:40,per:'cavity',wastePct:0},
  {id:'R6',part:'gas',wastePct:0}]},
 {id:'REC-STD',name:'Standard',pibPerSideMm:.4,rows:[
  {id:'R1',part:'spacer',wastePct:0},
  {id:'R2',part:'iguPart:IGU-DESICCANT',amount:null,per:'ft2',wastePct:0},
  {id:'R3',part:'primary',amount:null,per:'ft2',wastePct:0},
  {id:'R4',part:'secondary',amount:null,per:'ft2',wastePct:0},
  {id:'R5',part:'iguPart:IGU-CONNECTORS',amount:null,per:'cavity',wastePct:0},
  {id:'R6',part:'gas',wastePct:0}]}
];

function surroundPartValid(p){
 if(SURROUND_SLOTS[p])return true;
 const i=String(p||'').indexOf(':');return i>0&&SURROUND_PART_TABLES.includes(p.slice(0,i))&&!!p.slice(i+1);
}
function normalizeSurroundRecipe(r){
 r=r&&typeof r==='object'?r:{};
 const seen=new Set();
 const rows=(Array.isArray(r.rows)?r.rows:[]).filter(x=>x&&surroundPartValid(x.part)).map((x,i)=>{
  let id=mdString(x.id)||'R'+(i+1);while(seen.has(id))id+='b';seen.add(id);
  return {id:id,part:x.part,amount:mdNonNeg(x.amount),per:SURROUND_PER[x.per]?x.per:'ft2',wastePct:mdNonNeg(x.wastePct)};
 });
 return {id:mdString(r.id),name:mdString(r.name),pibPerSideMm:mdNonNeg(r.pibPerSideMm),note:mdString(r.note),rows:rows};
}
function normalizeSpacerSystem(s){s=s&&typeof s==='object'?s:{};return {id:mdString(s.id),code:mdString(s.code).toUpperCase(),name:mdString(s.name),family:mdString(s.family)};}
function spacerSystemByName(name){return (DB.spacerSystem||[]).find(s=>s&&s.name===name)||null;}
/* Код системы для печати и кода рамки: из справочника, иначе из id рамки. */
function spacerSystemCode(sp){
 if(!sp)return '';
 const s=spacerSystemByName(sp.system);if(s&&s.code)return s.code;
 const m=String(sp.id||'').match(/^SP-([^-]+)-/i);return m?m[1].toUpperCase():String(sp.system||sp.code||'').trim();
}

/* Этап 3 впервые на этой базе: таблиц рецептов ещё нет. Нормы и цены
   переезжают из старых мест (Weight norms, цена по семейству рамки) в
   карточки — с правками владельца, если они были; вес рамки — «не замерено». */
function surroundMigrate(){
 /* Признак старой базы — рамка без поля recipeId: Import может долить
    пустые таблицы засевом раньше, чем дойдёт сюда. */
 const first=!Array.isArray(DB.surroundRecipe)||(DB.spacerVariant||[]).some(sp=>sp&&sp.recipeId===undefined);
 const rates=Array.isArray(DB.materialWeightRates)?DB.materialWeightRates:[];
 const rate=k=>{const r=rates.find(x=>x&&x.key===k);return r?mdNonNeg(r.rate):undefined;};
 if(!Array.isArray(DB.spacerSystem))DB.spacerSystem=JSON.parse(JSON.stringify(DEFAULT.spacerSystem));
 if(!Array.isArray(DB.iguPart))DB.iguPart=JSON.parse(JSON.stringify(DEFAULT.iguPart));
 if(first){
  DB.surroundRecipe=JSON.parse(JSON.stringify(DEFAULT.surroundRecipe));
  const bwe=DB.surroundRecipe.find(r=>r.id==='REC-BWE-1732'),set=(part,k,f)=>{const v=rate(k);if(v!==undefined){const row=bwe.rows.find(x=>x.part===part);if(row)row.amount=v==null?null:v*f;}};
  set('iguPart:IGU-DESICCANT','desiccant:SP-BWE-1732',1000);set('primary','seal:SEAL-PIB:SP-BWE-1732',1000);
  set('secondary','seal:SEAL-PS:SP-BWE-1732',1000);set('iguPart:IGU-CONNECTORS','connectors:SP-BWE-1732',1000);
  /* Цены частей: обвязка до этапа 3 стоила «семейство рамки + силикон +
     аргон» за ft² юнита. Те же числа ложатся в карточки, ft² — по умолчанию. */
  ['gasProduct','sealantProduct'].forEach(t=>(DB[t]||[]).forEach(x=>{const d=(DEFAULT[t]||[]).find(y=>y.id===x.id);if(x&&x.salePrice==null&&d&&d.salePrice!=null)x.salePrice=d.salePrice;if(x&&x.densityKgM3==null&&d&&d.densityKgM3!=null)x.densityKgM3=d.densityKgM3;}));
  (DB.gasProduct||[]).forEach(g=>{const v=rate('gas:'+g.id);if(v!==undefined)g.densityKgM3=v;});
 }
 (DB.spacerVariant||[]).forEach(sp=>{
  if(!sp||sp.recipeId!==undefined)return;
  const d=(DEFAULT.spacerVariant||[]).find(x=>x.id===sp.id)||(DEFAULT.spacerVariant||[]).find(x=>x.system===sp.system)||{};
  sp.recipeId=d.recipeId||'REC-STD';
  if(sp.salePrice==null&&d.salePrice!=null)sp.salePrice=d.salePrice;
  const v=rate('spacer:'+sp.id);
  sp.weightG=v!==undefined?(v==null?null:Math.round(v*1e6)/1e3):(sp.id===d.id?d.weightG:null);sp.weightPer='ft2';sp.weightMeasured=false;
 });
 /* Старые строки норм обвязки больше не читаются — их место в карточках. */
 if(Array.isArray(DB.materialWeightRates))DB.materialWeightRates=DB.materialWeightRates.filter(r=>!r||!/^(spacer|desiccant|seal|connectors|gas):/.test(r.key||''));
}
function normalizeSurround(){
 surroundMigrate();
 DB.spacerSystem=DB.spacerSystem.map(normalizeSpacerSystem).filter(s=>s.id&&s.name);
 const seen=new Set();
 DB.surroundRecipe=DB.surroundRecipe.map(normalizeSurroundRecipe).filter(r=>r.id&&!seen.has(r.id)&&(seen.add(r.id),true));
}

function surroundRecipeById(id){return (DB.surroundRecipe||[]).find(r=>r&&r.id===id)||null;}
/* Снимок карточки или рецепта в заказе: сохранённый заказ считается по
   нормам на момент Save (владелец, 22.10.2026), как по ценам. Ключ snap:
   хранит JSON — состав рецепта, а не одно число. */
function surroundSnap(key,order,live){
 const b=order&&order.priceBook;let v;
 if(b&&Object.prototype.hasOwnProperty.call(b,key)){try{v=b[key]==null?null:JSON.parse(b[key]);}catch(e){v=null;}}
 else v=live();
 if(salesBookRec)salesBookRec[key]=v==null?null:JSON.stringify(v);
 return v;
}
/* Пустой вес и пустые нормы снимка берутся из Data, когда их внесли (пункт
   14, как salesWeightRate): незнание не замораживается. Архив на просмотре —
   как записан. */
function surroundLiveFill(order){return !(typeof archiveVisit!=='undefined'&&archiveVisit&&order&&archiveVisit.ids.has(order.id));}
function surroundSpacerCard(sp,order){
 if(!sp)return null;
 const card=surroundSnap('snap:spacer:'+sp.id,order,()=>({recipeId:sp.recipeId||'',weightG:sp.weightG==null?null:sp.weightG,weightPer:sp.weightPer||'ft2',measured:sp.weightMeasured===true,mm:spacerThicknessMm(sp)}));
 if(card&&card.weightG==null&&sp.weightG!=null&&surroundLiveFill(order))return Object.assign({},card,{weightG:sp.weightG,weightPer:sp.weightPer||'ft2',measured:sp.weightMeasured===true});
 return card;
}
function surroundRecipeOf(sp,order){
 const card=surroundSpacerCard(sp,order);if(!card||!card.recipeId)return null;
 const r=surroundSnap('snap:recipe:'+card.recipeId,order,()=>{const r=surroundRecipeById(card.recipeId);return r?JSON.parse(JSON.stringify(r)):null;});
 const live=r&&r.rows.some(x=>x.amount==null)&&surroundLiveFill(order)?surroundRecipeById(card.recipeId):null;
 if(!live)return r;
 return Object.assign({},r,{rows:r.rows.map(x=>{const y=x.amount==null&&live.rows.find(y=>y.id===x.id&&y.part===x.part&&y.per===x.per);return y&&y.amount!=null?Object.assign({},x,{amount:y.amount}):x;})});
}
/* PIB добавляет к толщине пакета по pibPerSideMm с каждой стороны рамки. */
function surroundPibMm(sp,order){const r=surroundRecipeOf(sp,order);return r&&r.pibPerSideMm!=null?2*r.pibPerSideMm:null;}
function surroundGasDensity(gas,order){
 if(!gas)return null;
 const k='weight:gas:'+gas.id,b=order&&order.priceBook;
 const live=gas.densityKgM3==null?null:gas.densityKgM3,kept=b&&Object.prototype.hasOwnProperty.call(b,k);
 const v=kept&&(b[k]!=null||!surroundLiveFill(order))?b[k]:live;
 if(salesBookRec)salesBookRec[k]=v==null?null:v;
 return v;
}
function surroundPartLabel(part){
 if(SURROUND_SLOTS[part])return SURROUND_SLOTS[part];
 const i=part.indexOf(':'),x=mdById(part.slice(0,i),part.slice(i+1));return x?x.name:'Removed · '+part;
}
/* Части одной камеры. geo — {areaFt2, perimeterM} контура, по которому идёт
   рамка; пусто — вес неизвестен. Для каждой части: айтем и его таблица (цена
   и единица продажи — из карточки), кг в изделии и кг расхода с отходом. */
function surroundCavityParts(c,geo,order){
 const sp=mdById('spacerVariant',c&&c.spacerVariantId),recipe=surroundRecipeOf(sp,order),out={recipe:recipe,parts:[]};
 if(!sp)return out;
 const area=geo&&Number.isFinite(geo.areaFt2)?geo.areaFt2:null,perM=geo&&Number.isFinite(geo.perimeterM)?geo.perimeterM:null;
 const basis=per=>per==='cavity'?1:per==='ft2'?area:per==='m'?perM:per==='ft'?(perM==null?null:perM*SURROUND_FT_PER_M):null;
 const rows=recipe?recipe.rows:[{id:'R1',part:'spacer',wastePct:0}];
 rows.forEach(r=>{
  let table='',item=null,kg=null,note='';
  if(r.part==='spacer'){
   table='spacerVariant';item=sp;const card=surroundSpacerCard(sp,order),b=basis(card.weightPer);
   kg=card.weightG!=null&&b!=null?card.weightG*b/1000:null;
   note=card.weightG==null?'No spacer weight in the card':(card.weightG+' '+SPACER_WEIGHT_PER[card.weightPer]+(card.measured?'':' · not measured'));
  }else if(r.part==='gas'){
   /* Толщина рамки — из снимка заказа, как вес и рецепт (аудит 25.10.2026,
      I-8); в снимке её нет (заказ до v5.264) — из карточки. */
   const card=surroundSpacerCard(sp,order),mm=card&&card.mm!=null?card.mm:spacerThicknessMm(sp);
   table='gasProduct';item=mdById('gasProduct',c.gasProductId);const d=surroundGasDensity(item,order);
   kg=d!=null&&area!=null&&mm>0?d*area*GLASS_M2_PER_FT2*mm/1000:null;
   note=d==null?'No density in the gas card':d+' kg/m³ × cavity volume';
  }else{
   if(r.part==='primary'||r.part==='secondary'){table='sealantProduct';item=mdById('sealantProduct',r.part==='primary'?c.primarySealantId:c.secondarySealantId);}
   else{const i=r.part.indexOf(':');table=r.part.slice(0,i);item=mdById(table,r.part.slice(i+1));}
   const b=basis(r.per);kg=r.amount!=null&&b!=null?r.amount*b/1000:null;
   note=r.amount==null?'No norm in the recipe':r.amount+' '+SURROUND_PER[r.per];
  }
  if((r.part==='primary'||r.part==='secondary')&&!item)return;
  const waste=r.wastePct||0;
  out.parts.push({rowId:r.id,part:r.part,label:item?item.name:surroundPartLabel(r.part),table:table,item:item,kg:kg,usedKg:kg==null?null:kg*(1+waste/100),wastePct:waste,note:note});
 });
 return out;
}
