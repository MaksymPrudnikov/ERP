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
 /* tokens — колонка со списком через « · »: фильтр по каждому значению отдельно. */
 return (list||[]).map((x,i)=>{const memo={},tokens={};cols.forEach(c=>{let v;try{v=c.v(x,i);}catch(e){v='';}memo[c.k]=v==null?'':v;if(c.tokens)tokens[c.k]=String(memo[c.k]).split(' · ').filter(Boolean);});return {o:{id:String(id(x,i)),createdAt:''},x,i,memo,tokens};});
}
/* Готовая строка экрана (rowHTML) → её <tr> и ячейки: колонка с td:N берёт N-ю
   ячейку как есть — вид строки не меняется, движок только ставит порядок колонок. */
function slParseRow(html){
 const t=document.createElement('template');t.innerHTML='<table><tbody>'+html+'</tbody></table>';
 const tr=t.content.querySelector('tr'),at=el=>[...el.attributes].map(a=>` ${a.name}="${esc(a.value)}"`).join('');
 return tr?{attrs:at(tr),tds:[...tr.children].map(td=>({attrs:at(td),html:td.innerHTML})),after:[...t.content.querySelectorAll('tbody > tr')].slice(1).map(x=>x.outerHTML).join('')}:{attrs:'',tds:[],after:''};
}
/* Ячейка по типу колонки, если у колонки нет своей. */
function slCell(info,c){
 const v=info.memo[c.k];
 if(c.td!=null&&info.row){const d=info.row.tds[c.td];return d?`<td${d.attrs}>${d.html}</td>`:'<td></td>';}
 if(c.cell)return `<td${c.type==='number'?' class="n"':''}>${c.cell(info.x,v,info)}</td>`;
 if(v===''||v==null)return `<td${c.type==='number'?' class="n"':''}><span class="mut">—</span></td>`;
 if(c.type==='date')return `<td>${esc(salesListShortDay(v))}</td>`;
 if(c.type==='number')return `<td class="n">${c.money?esc(finFmt(v)):esc(typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:c.digits==null?2:c.digits}):String(v))}</td>`;
 return `<td>${esc(String(v))}</td>`;
}
/* o: {columns:()=>[...], list, id(x), sort:{k,dir}, fill — колонка во всю ширину, acts — ширина колонки кнопок справа (px), c.w — ширина колонки, row(info)→{attrs, first, last, after(colspan) — строка под строкой},
   rowHTML(x) — готовая строка экрана: колонки берут её ячейки (td:N), firstTd/lastTd — галочка и кнопки,
   tail(cols) — строки после списка (итог «All»), их фильтр не трогает, noun(rows), empty, widths, cls}.
   Колонки без def видны сразу; def:false — только в ⚙ Columns. Ключ 'type' не брать: в движке он
   прячется, когда в Sales один вид (заказы без квот). */
function slTable(scope,o){
 const cols0=o.columns().map(c=>Object.assign({def:true},c));
 SL_GENERIC[scope]={columns:()=>cols0,sort:o.sort||null};
 const was=slScopeNow;slScopeNow=scope;let html='';
 try{
  /* Колонка появилась или пропала (Server — пока подключён сервер): настройки
     перечитываются и чистятся с новым набором колонок. */
  const p=salesListLoadPrefs(),keys=new Set(cols0.map(c=>c.k));
  if(cols0.some(c=>!p.cols.some(x=>x.k===c.k))||p.cols.some(x=>!keys.has(x.k)))delete salesQueuePrefs[scope];
  const cols=salesListColumns(),infos=slInfos(o.list,o.id||((x,i)=>i),cols0);
  const defs=Object.assign({},...cols0.filter(c=>c.w).map(c=>({[c.k]:c.w})),o.widths||{});
  salesListCwTable(cols.map(c=>c.k),[44],o.acts||20,defs);
  /* Колонка, что забирает остаток ширины (как Customer в Sales): своя или первая текстовая. */
  const reg=CW_TABLES[scope];if(reg){reg.fill=o.fill||(cols0.find(c=>c.type==='text')||cols0[0]||{}).k||'';reg.trail=o.acts||20;}
  const rows=salesListRows(infos);
  if(o.rowHTML)rows.forEach(i=>{i.row=slParseRow(o.rowHTML(i.x,i.i));});
  html=salesListTableHTML({infos,rows,cls:o.cls,tail:o.tail,
   cell:(i,c)=>slCell(i,c),
   row:info=>{const r=o.row?o.row(info)||{}:{},R=info.row;
    if(R){/* rowHTML: атрибуты строки, первая (галочка) и последняя (кнопки) ячейки — из неё. */
     const cell=n=>n==null?undefined:R.tds[n<0?R.tds.length+n:n];
     const f=cell(o.firstTd),l=cell(o.lastTd);
     return {attrs:R.attrs+(r.attrs||'')+` data-sl-row="${esc(info.o.id)}"`,first:f?`<td${f.attrs}>${f.html}</td>`:r.first,last:l?l.html:r.last,after:R.after?()=>R.after:r.after};}
    return {attrs:(r.attrs||'')+` data-sl-row="${esc(info.o.id)}"`,first:r.first,last:r.last,after:r.after};},
   noun:rows=>o.noun?o.noun(rows):rows.length+' row'+(rows.length===1?'':'s'),empty:infos.length?'Nothing matches the filters.':(o.empty||'Nothing here yet.')});
 }finally{slScopeNow=was;}
 return `<div class="sl-generic" data-sl-scope="${esc(scope)}">${html}</div>`;
}
/* Готовая таблица экрана — заголовки [[ключ, подпись, класс]] и строки HTML —
   на движок Sales без переписывания строк: значения для фильтра и сортировки —
   текст ячеек (у колонок с классом n — число). Колонка без подписи в конце —
   кнопки строки. Строка с одной ячейкой на всю ширину — надпись «пусто». */
function slHtmlTable(scope,head,body,o){
 o=o||{};
 const t=document.createElement('template');t.innerHTML='<table><tbody>'+(body||'')+'</tbody></table>';
 const trs=[...t.content.querySelectorAll('tbody > tr')],data=trs.filter(tr=>!(tr.children.length===1&&tr.children[0].colSpan>1));
 const empty=trs.length&&!data.length?trs[0].textContent.trim():o.empty;
 const acts=head.length&&!head[head.length-1][1];
 const list=data.map(tr=>({html:tr.outerHTML,tds:[...tr.children].map(td=>td.textContent.replace(/\s+/g,' ').trim())}));
 const num=s=>{const n=parseFloat(String(s).replace(/[^\d.\-]/g,''));return Number.isFinite(n)?(/^\s*[−-]/.test(s)?-Math.abs(n):n):'';};
 return slTable(scope,Object.assign({list,rowHTML:x=>x.html,lastTd:acts?-1:undefined,empty},o,{
  columns:()=>head.slice(0,acts?-1:head.length).map(([k,label,cls],i)=>{const n=/\bn\b/.test(cls||'');return {k,label,type:n?'number':'text',td:i,v:x=>n?num(x.tds[i]):x.tds[i]};})}));
}
