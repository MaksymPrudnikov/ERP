/* =====================================================================
   views/col-widths  ·  col-widths-1.0
   Ширина и порядок колонок прямо в заголовке — один механизм для списка
   Sales и Order Lines (пункт 11 плана v1.16). Владелец, 30.10.2026: вид —
   вариант 1 («черта как в Excel»: тонкая черта между заголовками, при
   наведении и перетаскивании зелёная, через таблицу — линия); «чтобы колонки
   можно было ренжовать как в экселе: беру колонку за голову и переношу».
   - Граница заголовка (.cw-grip) — ширина колонки; заголовок — перенос.
   - Ширины — {ключ колонки: px} в настройках самой таблицы этого браузера
     (адаптер cwRegister): Sales и Order Lines хранят свои отдельно.
   - Пока ширин нет, таблица как раньше (авто). Первое перетаскивание
     запоминает ширины всех видимых колонок такими, как они на экране, и
     дальше таблица держит их (table-layout:fixed, <colgroup>); длинный
     текст — многоточие, полный — подсказкой при наведении.
   - Конец перетаскивания — отпускание где угодно (захват указателя);
     Escape — отмена. Ширина не трогает заказ, ввод и выделение строк.
   ===================================================================== */

const CW_MIN=40,CW_MAX=1200;
const CW_TABLES={};
/* id → {widths(), save(widths), def(key), min(key), move(from,to,after),
   lead: [px служебных колонок слева], trail: px кнопок справа} */
function cwRegister(id,adapter){CW_TABLES[id]=adapter;}
/* Ширины из настроек: ключ колонки → целые px; чужое и отрицательное — вон,
   слишком узкое и широкое — к границам. */
function cwClean(w){
 const out={};if(!w||typeof w!=='object'||Array.isArray(w))return out;
 Object.keys(w).forEach(k=>{const n=Math.round(Number(w[k]));if(/^[A-Za-z0-9_]{1,40}$/.test(k)&&Number.isFinite(n)&&n>0)out[k]=Math.min(CW_MAX,Math.max(CW_MIN,n));});
 return out;
}
function cwWidths(id){const a=CW_TABLES[id];return a?cwClean(a.widths()):{};}
function cwFixed(id){return Object.keys(cwWidths(id)).length>0;}
/* Сумма ширин: служебные колонки, колонки данных и кнопки в конце. Таблица
   не уже экрана и не уже суммы — лишнее берёт последняя колонка (кнопки),
   нехватка — прокрутка вбок, сохранённые ширины не сжимаются. */
function cwSum(a,keys,w){return a.lead.reduce((s,x)=>s+x,0)+keys.reduce((s,k)=>s+(w[k]||a.def(k)),0)+a.trail;}
function cwColgroupFor(id,keys,w){
 const a=CW_TABLES[id];if(!a||!Object.keys(w).length)return '';
 return `<colgroup>${a.lead.map(x=>`<col style="width:${x}px">`).join('')}${keys.map(k=>`<col data-cw-col="${k}" style="width:${w[k]||a.def(k)}px">`).join('')}<col></colgroup>`;
}
/* Разметка таблицы: метка, класс и ширина; без сохранённых ширин — как раньше. */
function cwTableAttrs(id,keys){
 const a=CW_TABLES[id],w=cwWidths(id);
 return ` data-cw-table="${id}"`+(Object.keys(w).length?` style="width:max(100%,${cwSum(a,keys,w)}px)"`:'');
}
function cwTableClass(id){return cwFixed(id)?' cw-fixed':'';}
function cwColgroup(id,keys){return cwColgroupFor(id,keys,cwWidths(id));}
function cwGrip(){return '<span class="cw-grip" data-cw-grip aria-hidden="true"></span>';}

/* ------------------------------ Жесты ---------------------------------- */
let cwDrag=null;
function cwKeys(table){return [...table.querySelectorAll('thead th[data-cw-key]')];}
/* Ширины всех видимых колонок такими, как они на экране, — один раз, при первом жесте. */
function cwSnapshot(table,id){
 const w=cwWidths(id);if(Object.keys(w).length)return w;
 cwKeys(table).forEach(th=>{w[th.dataset.cwKey]=Math.max(CW_MIN,Math.ceil(th.getBoundingClientRect().width));});
 return w;
}
/* Таблица на экране — в режим ширин без перерисовки (ввод и фокус на месте). */
function cwApply(table,id,w){
 const a=CW_TABLES[id],keys=cwKeys(table).map(th=>th.dataset.cwKey),tmp=document.createElement('table');
 tmp.innerHTML=cwColgroupFor(id,keys,w);const g=tmp.querySelector('colgroup'),old=table.querySelector(':scope>colgroup');
 if(old)old.replaceWith(g);else table.insertBefore(g,table.firstChild);
 table.classList.add('cw-fixed');table.style.width=`max(100%,${cwSum(a,keys,w)}px)`;
}
function cwGuide(x,table){
 let g=document.querySelector('.cw-guide');if(!g){g=document.createElement('div');g.className='cw-guide';document.body.appendChild(g);}
 const r=table.getBoundingClientRect(),wrap=table.parentElement.getBoundingClientRect(),top=Math.max(r.top,wrap.top,0),bottom=Math.min(r.bottom,wrap.bottom,innerHeight);
 g.style.left=Math.round(x-1)+'px';g.style.top=top+'px';g.style.height=Math.max(0,bottom-top)+'px';return g;
}
function cwClear(){document.querySelectorAll('.cw-guide,.cw-ghost,.cw-drop').forEach(e=>e.remove());document.body.classList.remove('cw-resizing','cw-moving');document.querySelectorAll('th.cw-active,th.cw-src').forEach(th=>th.classList.remove('cw-active','cw-src'));}
/* Клик после жеста не должен открыть фильтр, сортировку или заказ. */
function cwSwallowClick(){const f=e=>{e.stopPropagation();e.preventDefault();};document.addEventListener('click',f,true);setTimeout(()=>document.removeEventListener('click',f,true),0);}

function cwDown(e){
 if(e.button!==0||cwDrag)return;
 const th=e.target.closest&&e.target.closest('th[data-cw-key]'),table=th&&th.closest('table[data-cw-table]');
 if(!table||!CW_TABLES[table.dataset.cwTable])return;
 const id=table.dataset.cwTable,key=th.dataset.cwKey;
 if(e.target.closest('[data-cw-grip]')){
  e.preventDefault();e.stopPropagation();
  const w=cwSnapshot(table,id);cwApply(table,id,w);
  cwDrag={kind:'resize',id,key,table,th,w,start:w[key]||th.getBoundingClientRect().width,x:e.clientX,pointer:e.pointerId};
  try{e.target.setPointerCapture(e.pointerId);}catch(x){}
  document.body.classList.add('cw-resizing');th.classList.add('cw-active');cwGuide(th.getBoundingClientRect().right,table);
  return;
 }
 if(e.target.closest('button,input,select,textarea,a,label'))return;
 e.preventDefault();
 cwDrag={kind:'move',id,key,table,th,x:e.clientX,y:e.clientY,pointer:e.pointerId,on:false};
 try{th.setPointerCapture(e.pointerId);}catch(x){}
}
function cwMoveTarget(d,x){
 const ths=cwKeys(d.table);let best=null;
 ths.forEach(th=>{const r=th.getBoundingClientRect();[[r.left,false],[r.right,true]].forEach(([edge,after])=>{const dist=Math.abs(x-edge);if(!best||dist<best.dist)best={th,after,edge,dist};});});
 return best;
}
function cwMove(e){
 const d=cwDrag;if(!d||e.pointerId!==d.pointer)return;
 if(d.kind==='resize'){
  const min=CW_TABLES[d.id].min(d.key),px=Math.min(CW_MAX,Math.max(min,Math.round(d.start+e.clientX-d.x)));d.w[d.key]=px;
  const col=d.table.querySelector(`col[data-cw-col="${d.key}"]`);if(col)col.style.width=px+'px';
  d.table.style.width=`max(100%,${cwSum(CW_TABLES[d.id],cwKeys(d.table).map(th=>th.dataset.cwKey),d.w)}px)`;cwGuide(d.th.getBoundingClientRect().right,d.table);
  return;
 }
 if(!d.on){if(Math.abs(e.clientX-d.x)<6)return;d.on=true;document.body.classList.add('cw-moving');d.th.classList.add('cw-src');
  const g=document.createElement('div');g.className='cw-ghost';g.textContent=(d.th.querySelector('[data-cw-label]')||d.th).textContent.trim();document.body.appendChild(g);}
 const g=document.querySelector('.cw-ghost');if(g){g.style.left=(e.clientX+12)+'px';g.style.top=(e.clientY+10)+'px';}
 const t=cwMoveTarget(d,e.clientX);d.target=t;
 let line=document.querySelector('.cw-drop');if(!line){line=document.createElement('div');line.className='cw-drop';document.body.appendChild(line);}
 const r=d.table.getBoundingClientRect(),wrap=d.table.parentElement.getBoundingClientRect(),top=Math.max(r.top,wrap.top,0),bottom=Math.min(r.bottom,wrap.bottom,innerHeight);
 line.style.left=Math.round(t.edge-1.5)+'px';line.style.top=top+'px';line.style.height=Math.max(0,bottom-top)+'px';
}
function cwUp(e){
 const d=cwDrag;if(!d||(e&&e.pointerId!==d.pointer))return;cwDrag=null;cwClear();
 if(d.kind==='resize'){CW_TABLES[d.id].save(cwClean(d.w));cwSwallowClick();return;}
 if(!d.on)return;cwSwallowClick();
 const t=d.target;if(!t||t.th===d.th)return;
 CW_TABLES[d.id].move(d.key,t.th.dataset.cwKey,t.after);
}
function cwCancel(){
 const d=cwDrag;if(!d)return;cwDrag=null;cwClear();
 /* Отмена: настройки не менялись — перерисовка вернёт прежние ширины. */
 if(d.kind==='resize')render();
}
document.addEventListener('pointerdown',cwDown,true);
document.addEventListener('pointermove',cwMove,true);
document.addEventListener('pointerup',cwUp,true);
document.addEventListener('pointercancel',e=>{if(cwDrag&&e.pointerId===cwDrag.pointer)cwUp(e);},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cwDrag){e.stopPropagation();cwCancel();}},true);

/* Полный текст обрезанной ячейки — подсказкой при наведении (вариант 1:
   обычная подсказка браузера). Несколько признаков (Batched, On Hold) — через «·». */
function cwCellText(td){
 const out=[],walk=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);let n;
 while((n=walk.nextNode())){const t=n.nodeValue.replace(/\s+/g,' ').trim();if(t)out.push(t);}
 return out.join(' · ');
}
document.addEventListener('mouseover',e=>{
 const td=e.target.closest&&e.target.closest('table.cw-fixed>tbody>tr>td');if(!td||td.hasAttribute('title'))return;
 const cut=[td,...td.querySelectorAll('*')].some(x=>x.clientWidth>0&&x.scrollWidth>x.clientWidth+1);
 if(cut){const t=cwCellText(td);if(t)td.title=t;}
},true);
