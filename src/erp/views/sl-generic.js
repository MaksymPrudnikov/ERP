/* =====================================================================
   views/sl-generic  ·  любая таблица — вид Sales
   Владелец 07.11.2026: «все таблицы должны быть одинакового формата, все до
   одной» — фильтр, сортировка, ширина, перетаскивание столбцов, ⚙ Columns.
   Таблица экрана подключается к движку Sales (sales-list-ui) своим scope:
   колонки — {k, label, type, v(x), cell(x,v)?, def?}, значения — из v(x),
   строку рисует cell или вид по типу. Две таблицы на одном экране не мешают:
   scope — на время отрисовки (slScopeNow) и по нажатию внутри обёртки
   [data-sl-scope] (slScopePin) — фильтр, ширина, Columns попадают в свою.
   IN : строки экрана, колонки
   OUT: HTML таблицы с шапкой движка Sales
   ===================================================================== */

const SL_GENERIC={};
let slScopeNow='',slScopePin='';
function slGenericScope(){return slScopeNow||slScopePin||'';}
document.addEventListener('pointerdown',e=>{const w=e.target&&e.target.closest?e.target.closest('[data-sl-scope]'):null;slScopePin=w?w.dataset.slScope:'';},true);

/* Строки: memo — значения всех колонок (фильтр и сортировка читают их). */
function slInfos(list,id,cols){
 return (list||[]).map((x,i)=>{const memo={};cols.forEach(c=>{let v;try{v=c.v(x,i);}catch(e){v='';}memo[c.k]=v==null?'':v;});return {o:{id:String(id(x,i)),createdAt:''},x,i,memo};});
}
/* Ячейка по типу колонки, если у колонки нет своей. */
function slCell(info,c){
 const v=info.memo[c.k];
 if(c.cell)return `<td${c.type==='number'?' class="n"':''}>${c.cell(info.x,v,info)}</td>`;
 if(v===''||v==null)return `<td${c.type==='number'?' class="n"':''}><span class="mut">—</span></td>`;
 if(c.type==='date')return `<td>${esc(salesListShortDay(v))}</td>`;
 if(c.type==='number')return `<td class="n">${c.money?esc(finFmt(v)):esc(typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:c.digits==null?2:c.digits}):String(v))}</td>`;
 return `<td>${esc(String(v))}</td>`;
}
/* o: {columns:()=>[...], list, id(x), sort:{k,dir}, fill — колонка во всю ширину, row(info)→{attrs, first, last}, noun(rows), empty, widths, cls}.
   Колонки без def видны сразу; def:false — только в ⚙ Columns. Ключ 'type' не брать: в движке он
   прячется, когда в Sales один вид (заказы без квот). */
function slTable(scope,o){
 const cols0=o.columns().map(c=>Object.assign({def:true},c));
 SL_GENERIC[scope]={columns:()=>cols0,sort:o.sort||null};
 const was=slScopeNow;slScopeNow=scope;let html='';
 try{
  const cols=salesListColumns(),infos=slInfos(o.list,o.id||((x,i)=>i),cols0);
  salesListCwTable(cols.map(c=>c.k),[44],20,o.widths);
  /* Колонка, что забирает остаток ширины (как Customer в Sales): своя или первая текстовая. */
  const reg=CW_TABLES[scope];if(reg)reg.fill=o.fill||(cols0.find(c=>c.type==='text')||cols0[0]||{}).k||'';
  const rows=salesListRows(infos);
  html=salesListTableHTML({infos,rows,cls:o.cls,
   cell:(i,c)=>slCell(i,c),
   row:info=>{const r=o.row?o.row(info)||{}:{};return {attrs:(r.attrs||'')+` data-sl-row="${esc(info.o.id)}"`,first:r.first,last:r.last};},
   noun:rows=>o.noun?o.noun(rows):rows.length+' row'+(rows.length===1?'':'s'),empty:infos.length?'Nothing matches the filters.':(o.empty||'Nothing here yet.')});
 }finally{slScopeNow=was;}
 return `<div class="sl-generic" data-sl-scope="${esc(scope)}">${html}</div>`;
}
