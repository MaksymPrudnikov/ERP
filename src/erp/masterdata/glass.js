/* =====================================================================
   erp/masterdata/glass · masterdata-0.3b
   Seed catalog for the Sales Makeup Builder.
   The schema deliberately separates product identity from supply facts so
   stock/order state, suppliers and sheet sizes can be enriched later.
   ===================================================================== */

const MATERIAL_AVAILABILITY=['stock','order','special','inactive'];

function mdString(v){return String(v==null?'':v).trim();}
function mdNum(v){if(v==null||v==='')return null;const n=+v;return Number.isFinite(n)?n:null;}
function mdAvailability(v){return MATERIAL_AVAILABILITY.includes(v)?v:'order';}
function normalizeSheetSize(s){s=s&&typeof s==='object'?s:{};return {id:mdString(s.id),wIn:mdNum(s.wIn),hIn:mdNum(s.hIn),stockQty:mdNum(s.stockQty),supplier:mdString(s.supplier)};}
function normalizeGlassProduct(p){p=p&&typeof p==='object'?p:{};return {
 id:mdString(p.id),manufacturer:mdString(p.manufacturer),thicknessMm:mdNum(p.thicknessMm),family:['uncoated','lowe','reflective'].includes(p.family)?p.family:'uncoated',
 name:mdString(p.name),code:mdString(p.code),availability:mdAvailability(p.availability),supplier:mdString(p.supplier),leadTimeDays:mdNum(p.leadTimeDays),
 sheetSizes:(Array.isArray(p.sheetSizes)?p.sheetSizes:[]).map(normalizeSheetSize),active:p.active!==false
};}
function normalizeSimpleMaterial(p,type){p=p&&typeof p==='object'?p:{};return {id:mdString(p.id),type,name:mdString(p.name),code:mdString(p.code),thicknessMm:mdNum(p.thicknessMm),availability:mdAvailability(p.availability),supplier:mdString(p.supplier),leadTimeDays:mdNum(p.leadTimeDays),active:p.active!==false};}

/* Starter subset aligned with the public IGU Builder vocabulary. It is a
   seed, not a purchasing truth: availability/supplier/sheet sizes remain
   intentionally editable and mostly blank until the plant catalog is loaded. */
DEFAULT.glassProduct=[
 {id:'GL-VITRO-6-CLR',manufacturer:'Vitro',thicknessMm:6,family:'uncoated',name:'Clear',code:'6CL',availability:'order',sheetSizes:[]},
 {id:'GL-VITRO-6-GRY',manufacturer:'Vitro',thicknessMm:6,family:'uncoated',name:'Gray',code:'6GRY',availability:'order',sheetSizes:[]},
 {id:'GL-VITRO-6-BRZ',manufacturer:'Vitro',thicknessMm:6,family:'uncoated',name:'Bronze',code:'6BRZ',availability:'order',sheetSizes:[]},
 {id:'GL-VITRO-6-SB60',manufacturer:'Vitro',thicknessMm:6,family:'lowe',name:'Solarban 60',code:'6SB60',availability:'order',sheetSizes:[]},
 {id:'GL-VITRO-6-SB70',manufacturer:'Vitro',thicknessMm:6,family:'lowe',name:'Solarban 70',code:'6SB70',availability:'order',sheetSizes:[]},
 {id:'GL-VITRO-6-SB90',manufacturer:'Vitro',thicknessMm:6,family:'lowe',name:'Solarban 90',code:'6SB90',availability:'order',sheetSizes:[]},
 {id:'GL-PILK-6-CLR',manufacturer:'Pilkington',thicknessMm:6,family:'uncoated',name:'Clear',code:'6CL-P',availability:'order',sheetSizes:[]},
 {id:'GL-PILK-6-EAC',manufacturer:'Pilkington',thicknessMm:6,family:'lowe',name:'Energy Advantage C',code:'6EAC',availability:'order',sheetSizes:[]},
 {id:'GL-PILK-6-EA',manufacturer:'Pilkington',thicknessMm:6,family:'lowe',name:'Energy Advantage Low-E',code:'6EA',availability:'order',sheetSizes:[]},
 {id:'GL-PILK-6-EAOW',manufacturer:'Pilkington',thicknessMm:6,family:'lowe',name:'Energy Advantage OW',code:'6EAOW',availability:'order',sheetSizes:[]},
 {id:'GL-GUARD-6-CLR',manufacturer:'Guardian',thicknessMm:6,family:'uncoated',name:'Clear',code:'6CL-G',availability:'order',sheetSizes:[]},
 {id:'GL-GUARD-6-SN68',manufacturer:'Guardian',thicknessMm:6,family:'lowe',name:'SunGuard SN 68',code:'6SN68',availability:'order',sheetSizes:[]},
 {id:'GL-GUARD-6-SNX6227',manufacturer:'Guardian',thicknessMm:6,family:'lowe',name:'SunGuard SNX 62/27',code:'6SNX6227',availability:'order',sheetSizes:[]},
 {id:'GL-GUARD-6-RGY',manufacturer:'Guardian',thicknessMm:6,family:'reflective',name:'Reflective Gray',code:'6REF-GRY',availability:'order',sheetSizes:[]},
 {id:'GL-GUARD-6-RBZ',manufacturer:'Guardian',thicknessMm:6,family:'reflective',name:'Reflective Bronze',code:'6REF-BRZ',availability:'order',sheetSizes:[]},
 {id:'GL-GEN-10-CLR',manufacturer:'Generic',thicknessMm:10,family:'uncoated',name:'Clear',code:'10CL',availability:'order',sheetSizes:[]}
].map(normalizeGlassProduct);

DEFAULT.heatTreatment=[
 {id:'HT-AN',name:'Annealed',code:'AN'},{id:'HT-HS',name:'Heat Strengthened',code:'HS'},{id:'HT-FT',name:'Tempered',code:'FT'}
].map(x=>normalizeSimpleMaterial(x,'heatTreatment'));
DEFAULT.spacerVariant=[
 ['SP-BWE-038','Black Warm Edge','3/8'],['SP-BWE-716','Black Warm Edge','7/16'],['SP-BWE-012','Black Warm Edge','1/2'],['SP-BWE-1732','Black Warm Edge','17/32'],['SP-BWE-058','Black Warm Edge','5/8'],
 ['SP-AL-038','Aluminum','3/8'],['SP-AL-012','Aluminum','1/2'],['SP-AL-058','Aluminum','5/8']
].map(x=>({id:x[0],system:x[1],size:x[2],name:x[1]+' '+x[2]+'″',code:x[0],availability:'order',supplier:'',leadTimeDays:null,active:true}));
DEFAULT.gasProduct=[{id:'GAS-AIR',name:'Air',code:'AIR'},{id:'GAS-ARGON',name:'Argon',code:'ARG'}].map(x=>normalizeSimpleMaterial(x,'gas'));
DEFAULT.sealantProduct=[{id:'SEAL-PIB',name:'PIB',code:'PIB'},{id:'SEAL-SIL',name:'Silicone',code:'SIL'},{id:'SEAL-HM',name:'Hot Melt',code:'HM'}].map(x=>normalizeSimpleMaterial(x,'sealant'));
DEFAULT.interlayerProduct=[{id:'INT-PVB030',name:'PVB Clear .030',code:'PVB030',thicknessMm:.762},{id:'INT-PVB060',name:'PVB Clear .060',code:'PVB060',thicknessMm:1.524},{id:'INT-SGP035',name:'Structural interlayer .035',code:'SGP035',thicknessMm:.889}].map(x=>normalizeSimpleMaterial(x,'interlayer'));
DEFAULT.fritProduct=[
 {id:'FRIT-CERAMIC',name:'Ceramic Frit',code:'FRIT-CER'},{id:'FRIT-DIGITAL',name:'Digital Ceramic Print',code:'FRIT-DIG'}
].map(x=>normalizeSimpleMaterial(x,'frit'));
DEFAULT.spandrelProduct=[
 {id:'SPAN-CERAMIC',name:'Ceramic Spandrel',code:'SPAN-CER'},{id:'SPAN-SILICONE',name:'Silicone Spandrel',code:'SPAN-SIL'}
].map(x=>normalizeSimpleMaterial(x,'spandrel'));

const FRIT_COLORS=['Black','White','Gray','Bronze','Custom'];
const FRIT_PATTERNS=['Full coverage','Dots','Lines','Custom'];
const SPANDREL_COLORS=['Black','White','Gray','Bronze','Custom'];

function normalizeMasterData(){
 if(!Array.isArray(DB.glassProduct))DB.glassProduct=JSON.parse(JSON.stringify(DEFAULT.glassProduct));
 DB.glassProduct=DB.glassProduct.filter(x=>x&&typeof x==='object').map(normalizeGlassProduct).filter(x=>x.id&&x.name);
 [['heatTreatment','heatTreatment'],['gasProduct','gas'],['sealantProduct','sealant'],['interlayerProduct','interlayer'],['fritProduct','frit'],['spandrelProduct','spandrel']].forEach(pair=>{
  const k=pair[0],type=pair[1];if(!Array.isArray(DB[k]))DB[k]=JSON.parse(JSON.stringify(DEFAULT[k]));DB[k]=DB[k].filter(x=>x&&typeof x==='object').map(x=>normalizeSimpleMaterial(x,type)).filter(x=>x.id&&x.name);
 });
 if(!Array.isArray(DB.spacerVariant))DB.spacerVariant=JSON.parse(JSON.stringify(DEFAULT.spacerVariant));
 DB.spacerVariant=DB.spacerVariant.filter(x=>x&&typeof x==='object').map(x=>({id:mdString(x.id),system:mdString(x.system),size:mdString(x.size),name:mdString(x.name)||[mdString(x.system),mdString(x.size)].filter(Boolean).join(' '),code:mdString(x.code),availability:mdAvailability(x.availability),supplier:mdString(x.supplier),leadTimeDays:mdNum(x.leadTimeDays),active:x.active!==false})).filter(x=>x.id&&x.system&&x.size);
}

function mdById(key,id){return (DB[key]||[]).find(x=>x.id===id)||null;}
function glassProductById(id){return mdById('glassProduct',id);}
function activeGlassProducts(){return (DB.glassProduct||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
function activeSimple(key){return (DB[key]||[]).filter(x=>x.active!==false&&x.availability!=='inactive');}
