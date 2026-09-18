/* =====================================================================
   masterdata/cutting  ·  cut-1.0
   Параметры раскроя по толщине стекла: обрезка кромки листа (TRIM) и зазор
   между деталями (BORDER). Плюс минимальный остаток и можно ли поворачивать
   деталь на листе.
   IN : DB.cutting
   OUT: cutParamsFor(mm) для erp/production/cut-layout

   Базовый сетап владельца (17 сентября 2026, таблица Perfect Cut): слева
   минимум, справа рекомендуемое. Считаем по рекомендуемому, минимум — нижняя
   граница ручной правки. У 15 и 19 мм цифры TRIM владелец уточняет: пока
   стоит как у 12 мм, зазор 3 · 4″ из той же таблицы.
   ===================================================================== */
DEFAULT.cutting={};
const CUT_ROWS_SHOP=[
 {mm:3, trimMin:'1/2',  trim:'3/4',   gapMin:'1/2',  gap:'3/4'},
 {mm:4, trimMin:'1/2',  trim:'3/4',   gapMin:'1/2',  gap:'3/4'},
 {mm:5, trimMin:'5/8',  trim:'3/4',   gapMin:'5/8',  gap:'3/4'},
 {mm:6, trimMin:'3/4',  trim:'7/8',   gapMin:'3/4',  gap:'7/8'},
 {mm:8, trimMin:'7/8',  trim:'1',     gapMin:'7/8',  gap:'1'},
 {mm:10,trimMin:'1',    trim:'1 1/4', gapMin:'1',    gap:'1 1/4'},
 {mm:12,trimMin:'1 1/4',trim:'1 1/2', gapMin:'1 1/4',gap:'1 1/2'},
 {mm:15,trimMin:'1 1/4',trim:'1 1/2', gapMin:'3',    gap:'4'},
 {mm:19,trimMin:'1 1/4',trim:'1 1/2', gapMin:'3',    gap:'4'}
];
const CUT_DEFAULT={minOffcutW:12,minOffcutH:12,rotate:true};
function cutIn(v,fallback){
 if(typeof v==='number')return Number.isFinite(v)&&v>=0?Math.round(v*16)/16:fallback;
 const r=typeof fabParseDimStrict==='function'?fabParseDimStrict(v):{ok:false};
 return r.ok&&r.v>=0?Math.round(r.v*16)/16:fallback;
}
function cutRowsDefault(){return CUT_ROWS_SHOP.map(r=>({mm:r.mm,trimMin:cutIn(r.trimMin,0),trim:cutIn(r.trim,0),gapMin:cutIn(r.gapMin,0),gap:cutIn(r.gap,0)}));}
function cutSettingsDefault(){return Object.assign({rows:cutRowsDefault()},CUT_DEFAULT);}
function normalizeCutting(){
 const src=DB.cutting&&typeof DB.cutting==='object'&&!Array.isArray(DB.cutting)?DB.cutting:{};
 const rows=(Array.isArray(src.rows)?src.rows:[]).filter(r=>r&&typeof r==='object'&&+r.mm>0)
  .map(r=>({mm:Math.round(+r.mm*100)/100,trimMin:cutIn(r.trimMin,0),trim:cutIn(r.trim,0),gapMin:cutIn(r.gapMin,0),gap:cutIn(r.gap,0)}))
  .sort((a,b)=>a.mm-b.mm);
 const seen=new Set(),clean=rows.filter(r=>seen.has(r.mm)?false:(seen.add(r.mm),true));
 DB.cutting={rows:clean.length?clean:cutRowsDefault(),
  minOffcutW:cutIn(src.minOffcutW,CUT_DEFAULT.minOffcutW),minOffcutH:cutIn(src.minOffcutH,CUT_DEFAULT.minOffcutH),
  rotate:typeof src.rotate==='boolean'?src.rotate:CUT_DEFAULT.rotate};
}
function validateCuttingPayload(src){
 if(src.cutting==null)return;
 if(typeof src.cutting!=='object'||Array.isArray(src.cutting))throw new Error('Cutting parameters must be an object.');
 if(src.cutting.rows!=null&&!Array.isArray(src.cutting.rows))throw new Error('Cutting rows must be an array.');
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
 return {mm:row.mm,trim:row.trim,gap:row.gap,trimMin:row.trimMin,gapMin:row.gapMin,rotate:!!s.rotate,minOffcutW:s.minOffcutW,minOffcutH:s.minOffcutH};
}
function cutParamsText(p){return 'Trim '+frac16(p.trim)+'″ · Gap '+frac16(p.gap)+'″'+(p.rotate?' · rotation on':' · no rotation');}
