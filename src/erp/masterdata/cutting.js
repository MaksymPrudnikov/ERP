/* =====================================================================
   masterdata/cutting  ·  cut-1.0
   Параметры раскроя по толщине стекла: отступы от четырёх краёв листа
   (TRIM и BORDER) и минимальное расстояние вокруг форм. Плюс минимальный
   остаток и можно ли поворачивать деталь на листе.
   IN : DB.cutting
   OUT: cutParamsFor(mm) для erp/production/cut-layout

   Базовый сетап владельца (17 сентября 2026, таблица Perfect Cut): слева
   минимум, справа рекомендуемое. Считаем по рекомендуемому, минимум — нижняя
   граница ручной правки.

   Что есть что — владелец, 18 сентября 2026, как в Perfect Cut:
     Trim X  — отступ от края листа по горизонтали снизу;
     Trim Y  — отступ по вертикали слева;
     Border X — отступ по горизонтали сверху;
     Border Y — отступ по вертикали справа;
   «и это не даёт деталям налазить на эти линии». То есть и TRIM, и BORDER —
   края листа, а не зазор между деталями. Между прямоугольниками зазора нет;
   вокруг формы со скосом — Min distance.
   15 и 19 мм в таблице одной цифрой: TRIM 0, BORDER 3 и 4. Min distance в
   таблице нет — берём минимальный BORDER (в проекте владельца на 6 мм
   Min.Dist.Z = 3/4, это он и есть). Оба пункта владелец подтвердил.
   ===================================================================== */
DEFAULT.cutting={};
/* Таблица цеха: TRIM — отступ снизу (X) и слева (Y), BORDER — сверху (X)
   и справа (Y); MIN DIST — между формами со скосом. */
const CUT_ROWS_SHOP=[
 {mm:3, trimMin:'1/2',  trim:'3/4',   borderMin:'1/2',  border:'3/4',   minDist:'1/2'},
 {mm:4, trimMin:'1/2',  trim:'3/4',   borderMin:'1/2',  border:'3/4',   minDist:'1/2'},
 {mm:5, trimMin:'5/8',  trim:'3/4',   borderMin:'5/8',  border:'3/4',   minDist:'5/8'},
 {mm:6, trimMin:'3/4',  trim:'7/8',   borderMin:'3/4',  border:'7/8',   minDist:'3/4'},
 {mm:8, trimMin:'7/8',  trim:'1',     borderMin:'7/8',  border:'1',     minDist:'7/8'},
 {mm:10,trimMin:'1',    trim:'1 1/4', borderMin:'1',    border:'1 1/4', minDist:'1'},
 {mm:12,trimMin:'1 1/4',trim:'1 1/2', borderMin:'1 1/4',border:'1 1/2', minDist:'1 1/4'},
 {mm:15,trimMin:'0',    trim:'0',     borderMin:'3',    border:'3',     minDist:'3'},
 {mm:19,trimMin:'0',    trim:'0',     borderMin:'4',    border:'4',     minDist:'4'}
];
const CUT_EDGES=['trimX','trimY','borderX','borderY'];
/* Остаток, который вообще стоит подсвечивать: «не меньше 40 на 40»
   (владелец, 18 сентября 2026). Было 12 × 12 — такие куски на склад не идут. */
const CUT_DEFAULT={minOffcutW:40,minOffcutH:40,rotate:true};
function cutIn(v,fallback){
 if(typeof v==='number')return Number.isFinite(v)&&v>=0?Math.round(v*16)/16:fallback;
 const r=typeof fabParseDimStrict==='function'?fabParseDimStrict(v):{ok:false};
 return r.ok&&r.v>=0?Math.round(r.v*16)/16:fallback;
}
function cutRow(r){
 /* Прежние поля gap/gapMin — это и был BORDER из таблицы. */
 return {mm:Math.round(+r.mm*100)/100,trimMin:cutIn(r.trimMin,0),trim:cutIn(r.trim,0),
  borderMin:cutIn(r.borderMin!=null?r.borderMin:r.gapMin,0),border:cutIn(r.border!=null?r.border:r.gap,0),minDist:cutIn(r.minDist,0)};
}
function cutRowsDefault(){return CUT_ROWS_SHOP.map(cutRow);}
function cutSettingsDefault(){return Object.assign({rows:cutRowsDefault(),sheets:[],sizes:[]},CUT_DEFAULT);}
/* Отступы у каждого размера листа свои: 130 и 144 режут по-разному
   (владелец, 18 сентября 2026). Пусто — берётся значение по толщине. */
/* Ключ размера — всегда лёжа: длинная сторона первой (X). */
function cutSheetTrimKey(w,h){const a=Math.max(+w,+h),b=Math.min(+w,+h);return (Math.round(a*16)/16)+'x'+(Math.round(b*16)/16);}
function cutSheetTrim(key){
 const s=cutSettings(),row=(s.sheets||[]).find(r=>r.key===key);
 return row?{trimX:row.trimX,trimY:row.trimY,borderX:row.borderX,borderY:row.borderY}:null;
}
function cutSheetTrimSet(key,field,value){
 if(!CUT_EDGES.includes(field))return;
 const s=cutSettings();if(!Array.isArray(s.sheets))s.sheets=[];
 let row=s.sheets.find(r=>r.key===key);if(!row){row={key,trimX:null,trimY:null,borderX:null,borderY:null};s.sheets.push(row);}
 const v=cutIn(value,null);row[field]=v==null||v===0&&String(value).trim()===''?null:v;
 if(CUT_EDGES.every(f=>row[f]==null))s.sheets=s.sheets.filter(r=>r!==row);
 normalizeCutting();touch();
}
/* Размеры листов цеха — для любого стекла. Строки поставки пусты, пока их
   не завела закупка, а резать надо уже сейчас. Владелец, 18 сентября 2026, на
   первом настоящем батче: «говорит, что листа нет для оптимизации, и я не
   могу найти в Master Data, где его добавить». У стекла сначала идут размеры
   из его поставок, за ними — размеры цеха. */
const CUT_SIZE_MAX=400;
function cutShopSizes(){return (cutSettings().sizes||[]).map(s=>({key:s.key,w:s.w,h:s.h}));}
function cutShopSizeAdd(w,h){
 const a=cutIn(w,null),b=cutIn(h,null);
 if(!(a>0&&b>0))return {error:'Enter the sheet size, for example 130 × 96.'};
 if(a>CUT_SIZE_MAX||b>CUT_SIZE_MAX)return {error:'Sheet size is in inches, for example 130 × 96.'};
 const key=cutSheetTrimKey(a,b),s=cutSettings();
 if((s.sizes||[]).some(x=>x.key===key))return {error:'This sheet size is already there.'};
 s.sizes=(s.sizes||[]).concat([{w:a,h:b}]);normalizeCutting();touch();
 return {ok:true,key};
}
/* Убрать размер цеха; его отступы уходят вместе с ним, если этот размер не
   приходит и из поставок — иначе они остались бы невидимыми. */
function cutShopSizeRemove(key){
 const s=cutSettings();if(!(s.sizes||[]).some(x=>x.key===key))return {error:'Sheet size not found.'};
 s.sizes=s.sizes.filter(x=>x.key!==key);
 if(!cutSupplySizes().some(x=>x.key===key))s.sheets=(s.sheets||[]).filter(r=>r.key!==key);
 normalizeCutting();touch();return {ok:true};
}
function cutSupplySizes(){
 const out=new Map();
 (DB.glassSheet||[]).filter(x=>x&&x.availability!=='inactive'&&+x.sheetWIn>0&&+x.sheetHIn>0).forEach(x=>{
  const key=cutSheetTrimKey(x.sheetWIn,x.sheetHIn);
  if(!out.has(key))out.set(key,{key,w:Math.max(+x.sheetWIn,+x.sheetHIn),h:Math.min(+x.sheetWIn,+x.sheetHIn),codes:new Set()});
  out.get(key).codes.add(x.productCode);
 });
 return [...out.values()].map(x=>Object.assign(x,{codes:[...x.codes].sort()}));
}
/* Все размеры, которые знает программа: из поставок стекла и размеры цеха. */
function cutSheetSizes(){
 const out=new Map(cutSupplySizes().map(x=>[x.key,Object.assign(x,{shop:false})]));
 cutShopSizes().forEach(x=>{if(out.has(x.key))out.get(x.key).shop=true;else out.set(x.key,{key:x.key,w:x.w,h:x.h,codes:[],shop:true});});
 return [...out.values()].sort((a,b)=>b.w*b.h-a.w*a.h);
}
function normalizeCutting(){
 const src=DB.cutting&&typeof DB.cutting==='object'&&!Array.isArray(DB.cutting)?DB.cutting:{};
 const rows=(Array.isArray(src.rows)?src.rows:[]).filter(r=>r&&typeof r==='object'&&+r.mm>0)
  .map(cutRow)
  .sort((a,b)=>a.mm-b.mm);
 const seen=new Set(),clean=rows.filter(r=>seen.has(r.mm)?false:(seen.add(r.mm),true));
 const sheets=(Array.isArray(src.sheets)?src.sheets:[]).filter(r=>r&&typeof r.key==='string'&&/^\d+(\.\d+)?x\d+(\.\d+)?$/.test(r.key))
  .map(r=>{const o={key:r.key};CUT_EDGES.forEach(f=>{o[f]=r[f]==null?null:cutIn(r[f],null);});return o;})
  .filter(r=>CUT_EDGES.some(f=>r[f]!=null));
 const keys=new Set(),sizes=(Array.isArray(src.sizes)?src.sizes:[]).filter(r=>r&&typeof r==='object')
  .map(r=>{const a=cutIn(r.w,null),b=cutIn(r.h,null);return a>0&&b>0&&a<=CUT_SIZE_MAX&&b<=CUT_SIZE_MAX?{key:cutSheetTrimKey(a,b),w:Math.max(a,b),h:Math.min(a,b)}:null;})
  .filter(r=>r&&!keys.has(r.key)&&(keys.add(r.key),true)).sort((a,b)=>b.w*b.h-a.w*a.h);
 /* Старое умолчание 12 × 12 никто не выбирал — переводим на 40 × 40 один раз. */
 const oldMin=!src.v&&+src.minOffcutW===12&&+src.minOffcutH===12;
 if(oldMin){src.minOffcutW=CUT_DEFAULT.minOffcutW;src.minOffcutH=CUT_DEFAULT.minOffcutH;}
 DB.cutting={v:2,rows:clean.length?clean:cutRowsDefault(),sheets,sizes,
  minOffcutW:cutIn(src.minOffcutW,CUT_DEFAULT.minOffcutW),minOffcutH:cutIn(src.minOffcutH,CUT_DEFAULT.minOffcutH),
  rotate:typeof src.rotate==='boolean'?src.rotate:CUT_DEFAULT.rotate};
}
function validateCuttingPayload(src){
 if(src.cutting==null)return;
 if(typeof src.cutting!=='object'||Array.isArray(src.cutting))throw new Error('Cutting parameters must be an object.');
 if(src.cutting.rows!=null&&!Array.isArray(src.cutting.rows))throw new Error('Cutting rows must be an array.');
 if(src.cutting.sheets!=null&&!Array.isArray(src.cutting.sheets))throw new Error('Cutting sheet trims must be an array.');
 if(src.cutting.sizes!=null&&!Array.isArray(src.cutting.sizes))throw new Error('Cutting sheet sizes must be an array.');
 (Array.isArray(src.cutting.rows)?src.cutting.rows:[]).forEach(r=>{
  if(!r||typeof r!=='object'||!(+r.mm>0))throw new Error('Invalid cutting row.');
 });
}
function cutSettings(){if(!DB.cutting||!Array.isArray(DB.cutting.rows)||!DB.cutting.rows.length)normalizeCutting();return DB.cutting;}
/* Строка своей толщины, иначе ближайшая снизу, иначе самая тонкая. */
function cutParamsFor(mm){
 const s=cutSettings(),n=+mm,rows=s.rows;
 let row=rows.find(r=>r.mm===n);
 if(!row)row=rows.filter(r=>r.mm<=n).slice(-1)[0]||rows[0];
  return {mm:row.mm,trim:row.trim,border:row.border,minDist:row.minDist,trimMin:row.trimMin,borderMin:row.borderMin,rotate:!!s.rotate,minOffcutW:s.minOffcutW,minOffcutH:s.minOffcutH};
}
