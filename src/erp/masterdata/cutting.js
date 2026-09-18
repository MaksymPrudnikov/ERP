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
const CUT_DEFAULT={minOffcutW:12,minOffcutH:12,rotate:true};
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
function cutSettingsDefault(){return Object.assign({rows:cutRowsDefault(),sheets:[]},CUT_DEFAULT);}
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
/* Размеры листов, которые знает программа: из поставок стекла. */
function cutSheetSizes(){
 const out=new Map();
 (DB.glassSheet||[]).filter(x=>x&&+x.sheetWIn>0&&+x.sheetHIn>0).forEach(x=>{
  const key=cutSheetTrimKey(x.sheetWIn,x.sheetHIn);
  if(!out.has(key))out.set(key,{key,w:Math.max(+x.sheetWIn,+x.sheetHIn),h:Math.min(+x.sheetWIn,+x.sheetHIn),codes:new Set()});
  out.get(key).codes.add(x.productCode);
 });
 return [...out.values()].map(x=>Object.assign(x,{codes:[...x.codes].sort()})).sort((a,b)=>b.w*b.h-a.w*a.h);
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
 DB.cutting={rows:clean.length?clean:cutRowsDefault(),sheets,
  minOffcutW:cutIn(src.minOffcutW,CUT_DEFAULT.minOffcutW),minOffcutH:cutIn(src.minOffcutH,CUT_DEFAULT.minOffcutH),
  rotate:typeof src.rotate==='boolean'?src.rotate:CUT_DEFAULT.rotate};
}
function validateCuttingPayload(src){
 if(src.cutting==null)return;
 if(typeof src.cutting!=='object'||Array.isArray(src.cutting))throw new Error('Cutting parameters must be an object.');
 if(src.cutting.rows!=null&&!Array.isArray(src.cutting.rows))throw new Error('Cutting rows must be an array.');
 if(src.cutting.sheets!=null&&!Array.isArray(src.cutting.sheets))throw new Error('Cutting sheet trims must be an array.');
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
