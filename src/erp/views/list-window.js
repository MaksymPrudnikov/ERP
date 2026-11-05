/* ERP module: erp/views/list-window — длинная таблица без рывка.
   Sales и Production клали в страницу все строки: 213 заказов — 7000 элементов,
   половина времени каждого клика, хотя на экране 15 строк (2.11.2026). Сразу
   идёт то, что видно, с запасом; остальное дорисовывается в простое (до
   LIST_IDLE_ROWS строк, чтобы Ctrl+F и печать видели обычный список) и при
   прокрутке. Высоту таблицы до дорисовки держит строка data-list-rest.
   Итоги и выбор строк считаются по данным, а не по странице.
   Строки всегда идут с начала: номер поля среди строк не меняется, и курсор
   после перерисовки (renderFocusBack) не уходит в чужую строку заказа.
   Ширину колонок задают все строки: дорисовка сдвигала их на глазах (Production
   на 65 px). Поэтому первая отрисовка экрана длинная, запоминает ширины, а
   дальше колонки стоят на них с первого кадра.
   IN:  storageLockButtons (erp/storage), readScope (erp/read-scope)
   OUT: listWindowBody(rows,rowHTML,span,opt), listWindowAll(), listWindowAfter(),
        listWindowDrop(table) */
const LIST_BATCH=60,LIST_IDLE_ROWS=400,LIST_ROW_PX=55,LIST_ROW_MIN=28,LIST_AHEAD_PX=1500;
let listRest=null,listScrollWait=false,listDraw=null;
const listSizes=new Map();
/* opt: table — селектор таблицы, rowPx — высота строки. */
function listWindowBody(rows,rowHTML,span,opt){
 const table=opt&&opt.table||'.sl-table',rowPx=opt&&opt.rowPx||LIST_ROW_PX;
 /* Перерисовка при прокрутке вниз: всё выше экрана на месте, страница не прыгает. */
 const box=document.querySelector('#app .sl-wide'),fit=Math.max(LIST_BATCH,Math.ceil((window.scrollY+(box?box.scrollTop:0)+window.innerHeight)/LIST_ROW_MIN)+20);
 const key=tab+':'+subtab+table,now=listSizes.has(key)?fit:Math.max(fit,LIST_IDLE_ROWS);
 listDraw=rows.length>fit?{key,table}:null;
 if(rows.length<=now){listRest=null;return rows.map(rowHTML).join('');}
 listRest={rows,rowHTML,at:now,rowPx,table};
 return rows.slice(0,now).map(rowHTML).join('')+`<tr class="list-rest" data-list-rest><td colspan="${span}" style="height:${(rows.length-now)*rowPx}px"></td></tr>`;
}
function listWindowTail(){return listRest&&document.querySelector('[data-list-rest]');}
/* Данных таблицы больше нет (заказ закрыли): дорисовка в простое и при прокрутке не
   должна читать их после этого. Строка-распорка уйдёт со следующей отрисовкой. */
function listWindowDrop(table){if(listRest&&listRest.table===table)listRest=null;}
function listWindowGrow(){
 const tail=listWindowTail();if(!tail)return false;
 const r=listRest,end=Math.min(r.at+LIST_BATCH,r.rows.length),table=tail.closest('table');
 tail.insertAdjacentHTML('beforebegin',readScope(()=>r.rows.slice(r.at,end).map(r.rowHTML).join('')));
 r.at=end;
 if(end<r.rows.length)tail.firstChild.style.height=(r.rows.length-end)*r.rowPx+'px';else{tail.remove();listRest=null;}
 storageLockButtons();
 /* Прочерки и Freeze — и у дорисованных строк (views/sales-list-controls). */
 if(table&&typeof salesListTableFit==='function')salesListTableFit(table);
 return !!listRest;
}
/* Нужен конец таблицы: новая строка заказа внизу. */
function listWindowAll(){while(listWindowGrow());}
function listWindowAfter(){
 const draw=listDraw;listDraw=null;
 const table=draw&&document.querySelector('#app '+draw.table);
 if(table){
  const name=th=>th.dataset.col||th.dataset.cwKey,heads=[...table.tHead.rows[0].cells].filter(name),sizes=listSizes.get(draw.key);
  if(sizes)heads.forEach(th=>{if(sizes[name(th)])th.style.minWidth=sizes[name(th)]+'px';});
  /* Ширины, заданные вручную (views/col-widths), не трогаем. */
  else listSizes.set(draw.key,getComputedStyle(table).tableLayout==='fixed'?{}:Object.fromEntries(heads.map(th=>[name(th),Math.ceil(th.getBoundingClientRect().width)])));
 }
 listWindowIdle();
}
function listWindowIdle(){
 const r=listRest;if(!r||r.at>=LIST_IDLE_ROWS)return;
 (window.requestIdleCallback||setTimeout)(()=>{if(listRest===r&&listWindowGrow())listWindowIdle();});
}
function listWindowScrollStep(){
 const tail=listWindowTail();
 if(tail&&tail.getBoundingClientRect().top<window.innerHeight+LIST_AHEAD_PX&&listWindowGrow()){requestAnimationFrame(listWindowScrollStep);return;}
 listScrollWait=false;
}
window.addEventListener('scroll',()=>{if(!listRest||listScrollWait)return;listScrollWait=true;requestAnimationFrame(listWindowScrollStep);},{passive:true,capture:true});
