/* =====================================================================
   views/sl-quick-filter  ·  быстрый фильтр в заголовке колонки
   IN : таблица на движке Sales после отрисовки (data-filter-col)
   OUT: salesListQuickDecorate — поле фильтра в заголовке колонки
   Владелец 07.11.2026: «засунуть быстрый поиск в саму ячейку заголовка: там
   текст, пока в неё не нажмёшь, тогда вводишь; всё меню остаётся в
   стрелочке; стрелочка — слева перед текстом». Нажали на название колонки —
   на его месте поле; набранное — условие колонки (по умолчанию Starts with,
   другое выбирают в ▾). Отфильтрованная колонка показывает в заголовке
   условие и значение. Любая таблица на движке Sales — заголовки не трогаем,
   после отрисовки поле ставится по data-filter-col (salesListFit).
   ===================================================================== */

let salesListQuick=null,salesListQuickTimer=0;
const SL_QUICK_SIGN={startsWith:'',contains:'∗',notContains:'≠∗',endsWith:'…',equals:'=',notEqual:'≠',gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'=',ne:'≠',on:'=',before:'<',after:'>'};
/* Простое условие колонки — одно, со значением: его и правит поле в заголовке. */
function salesListQuickCond(f){
 if(!f||Array.isArray(f.values)||f.preset||f.mode==='exclude')return null;
 const c=(f.conds||[]).filter(salesListCondReady);
 return c.length===1&&(f.conds||[]).length===1&&SL_QUICK_SIGN[c[0].op]!=null?c[0]:null;
}
/* Заголовок → его таблица: своя обёртка [data-sl-scope] или список экрана. */
function salesListQuickScopeOf(th){const w=th.closest('[data-sl-scope]');return w?w.dataset.slScope:'';}
function salesListQuickWith(scope,fn){const was=slScopeNow;if(scope)slScopeNow=scope;try{return fn();}finally{slScopeNow=was;}}
function salesListQuickTh(q){
 return [...document.querySelectorAll(`#app th[data-col="${CSS.escape(q.k)}"]`)].find(th=>th.querySelector('.sl-fbtn[data-filter-col]')&&salesListQuickScopeOf(th)===q.wrap)||null;
}
/* Нажатие мышью: перенос колонок (col-widths) захватывает указатель на th,
   и клик приходит в саму ячейку, а не в название — поэтому название
   запоминается при нажатии (08.11.2026: «выделяется, но не работает»; тест
   кликал кодом, без захвата, и этого не видел). */
let salesListQuickDown=null;
document.addEventListener('pointerdown',e=>{salesListQuickDown=e.target&&e.target.closest?e.target.closest('th [data-cw-label]'):null;},true);
document.addEventListener('click',e=>{
 const t=e.target&&e.target.closest?e.target:null;if(!t||t.closest('.sl-qf'))return;
 let lab=t.closest('th [data-cw-label]');
 if(!lab&&t.matches('th')&&salesListQuickDown&&t.contains(salesListQuickDown))lab=salesListQuickDown;
 salesListQuickDown=null;if(!lab)return;
 const th=lab.closest('th'),btn=th&&th.querySelector('.sl-fbtn[data-filter-col]');if(!btn)return;
 const k=btn.dataset.filterCol,wrap=salesListQuickScopeOf(th);
 const f=salesListQuickWith(wrap,()=>salesListLoadPrefs().filters[k]);
 /* Сложный фильтр (галочки значений, несколько условий) правят в ▾. */
 if(salesListFilterActive(f)&&!salesListQuickCond(f)){btn.click();return;}
 const c=salesListQuickCond(f);
 salesListQuick={wrap,scope:wrap||salesListScope(),k,v:c?String(c.v):''};salesListQuickDecorate();
});
function salesListQuickInput(el){
 if(!salesListQuick)return;salesListQuick.v=el.value;clearTimeout(salesListQuickTimer);
 salesListQuickTimer=setTimeout(salesListQuickApply,250);
}
function salesListQuickKey(e,el){
 if(e.key==='Enter'){e.preventDefault();clearTimeout(salesListQuickTimer);salesListQuickApply();salesListQuick=null;render();}
 else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();clearTimeout(salesListQuickTimer);salesListQuick=null;render();}
}
function salesListQuickBlur(){
 if(!salesListQuick)return;clearTimeout(salesListQuickTimer);const q=salesListQuick;
 /* Фокус ушёл в меню ▾ этой же колонки — поле остаётся. */
 /* Перерисовка после фильтра ставит новое поле и фокус в него — это не уход. */
 setTimeout(()=>{const a=document.activeElement;if(salesListQuick!==q||a&&a.classList&&a.classList.contains('sl-qf'))return;salesListQuickApply();salesListQuick=null;render();},0);
}
function salesListQuickApply(){
 const q=salesListQuick;if(!q)return;
 /* Своя таблица (scope при нажатии), а не та, что на экране сейчас: Enter
    после перехода в Shipping писал фильтр Sales туда (аудит Codex
    09.11.2026, F05). */
 salesListQuickWith(q.scope,()=>{
  const f=salesListLoadPrefs().filters[q.k],c=salesListQuickCond(f),v=String(q.v||'');
  if(salesListFilterActive(f)&&!c)return;
  salesListSetFilter(q.k,v.trim()===''?null:{mode:'include',conds:[{op:c?c.op:'startsWith',v,v2:'',join:'and'}],values:null,preset:''});
 });
}
/* После отрисовки: поле в заголовке, что сейчас правят; у отфильтрованных
   колонок — условие и значение вместо названия (название — в подсказке). */
function salesListQuickDecorate(){
 document.querySelectorAll('#app th .sl-fbtn[data-filter-col]').forEach(btn=>{
  const th=btn.closest('th'),lab=th.querySelector('[data-cw-label]');if(!lab||lab.querySelector('.sl-qf'))return;
  const k=btn.dataset.filterCol,wrap=salesListQuickScopeOf(th),q=salesListQuick;
  if(q&&q.k===k&&q.wrap===wrap&&q.scope===(wrap||salesListScope())){
   lab.dataset.label=lab.dataset.label||lab.textContent;
   lab.innerHTML=`<input class="sl-qf" data-sl-quick="${esc(k)}" aria-label="Filter ${esc(lab.dataset.label)}" value="${esc(q.v)}" ${onAct('input',salesListQuickInput,EL)} ${onAct('keydown',salesListQuickKey,EVENT,EL)} ${onAct('blur',salesListQuickBlur)}>`;
   const i=lab.firstChild;i.focus();try{i.setSelectionRange(i.value.length,i.value.length);}catch(x){}
   return;
  }
  const f=salesListQuickWith(wrap,()=>salesListLoadPrefs().filters[k]),c=salesListQuickCond(f);
  if(!c)return;
  const name=lab.dataset.label||lab.textContent;lab.dataset.label=name;
  const sign=SL_QUICK_SIGN[c.op];
  lab.innerHTML=`<span class="sl-qf-on" data-sl-quick-on="${esc(k)}">${sign?esc(sign)+' ':''}${esc(c.v)}${c.op==='startsWith'?'…':''}</span>`;
  th.title=name+' · '+((salesListQuickWith(wrap,()=>(SALES_LIST_OPS[(salesListColumn(k)||{}).type]||SALES_LIST_OPS.text).find(o=>o[0]===c.op))||[])[1]||c.op)+' '+c.v;
 });
}
