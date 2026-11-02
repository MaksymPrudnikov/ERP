/* ERP module: erp/views/list-window — длинная таблица без рывка.
   Sales и Production клали в страницу все строки: 213 заказов — 7000 элементов,
   половина времени каждого клика, хотя на экране 15 строк (2.11.2026). Сразу
   идёт то, что видно, с запасом; остальное дорисовывается в простое (до
   LIST_IDLE_ROWS строк, чтобы Ctrl+F и печать видели обычный список) и при
   прокрутке. Высоту таблицы до дорисовки держит строка data-list-rest.
   Итоги и выбор строк считаются по данным, а не по странице.
   IN:  storageLockButtons (erp/storage), readScope (erp/read-scope)
   OUT: listWindowBody(rows,rowHTML,span), listWindowIdle() */
const LIST_BATCH=60,LIST_IDLE_ROWS=400,LIST_ROW_PX=38,LIST_ROW_MIN=28,LIST_AHEAD_PX=1500;
let listRest=null,listScrollWait=false;
function listWindowBody(rows,rowHTML,span){
 /* Перерисовка при прокрутке вниз: всё выше экрана на месте, страница не прыгает. */
 const now=Math.max(LIST_BATCH,Math.ceil((window.scrollY+window.innerHeight)/LIST_ROW_MIN)+20);
 if(rows.length<=now){listRest=null;return rows.map(rowHTML).join('');}
 listRest={rows,rowHTML,at:now};
 return rows.slice(0,now).map(rowHTML).join('')+`<tr class="list-rest" data-list-rest><td colspan="${span}" style="height:${(rows.length-now)*LIST_ROW_PX}px"></td></tr>`;
}
function listWindowTail(){return listRest&&document.querySelector('[data-list-rest]');}
function listWindowGrow(){
 const tail=listWindowTail();if(!tail)return false;
 const r=listRest,end=Math.min(r.at+LIST_BATCH,r.rows.length);
 tail.insertAdjacentHTML('beforebegin',readScope(()=>r.rows.slice(r.at,end).map(r.rowHTML).join('')));
 r.at=end;
 if(end<r.rows.length)tail.firstChild.style.height=(r.rows.length-end)*LIST_ROW_PX+'px';else{tail.remove();listRest=null;}
 storageLockButtons();
 return !!listRest;
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
