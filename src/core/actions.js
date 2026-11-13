/* =====================================================================
   core/actions  ·  actions-1.0
   Действия экрана без кода в разметке: кнопка несёт имя функции и её
   аргументы данными, а вызывает функцию один слушатель на document.
   Нужно, чтобы убрать 'unsafe-inline' из script-src (CSP, build/build.js):
   браузер перестанет выполнять код, вписанный в разметку, — и текст из
   базы, попавший на экран без esc, останется текстом (задание
   «CSP без inline», хвост этапа 3 плана «до 10», 13.11.2026).
   IN : разметка с data-on-<событие>="имя" и data-args-<событие>='[…]' —
        её пишет onAct, руками эти атрибуты не набирают
   OUT: onAct(type, fn, ...args) — атрибуты действия для разметки;
        onActStop(type, fn, ...args) — то же и остановить подъём события;
        onActSelf(type, fn, ...args) — то же, но только когда событие началось
        на самом элементе, а не внутри него (клик по фону окна закрывает окно);
        EL, EVENT, EL_VALUE, EL_CHECKED, elData(key) — метки аргументов:
        сам элемент, событие, его value, checked, dataset[key];
        actStop, actPrevent — готовые действия «дальше не идти» и «отменить
        действие браузера»; actAllow(fn, …) — разрешить действие для готовой
        разметки (shell.html)

   Как писать (было → стало):
     onclick="salesOrderDelete('${esc(id)}')"   → ${onAct('click',salesOrderDelete,id)}
     onchange="salesHoldPick(${i})"             → ${onAct('change',salesHoldPick,i)}
     oninput="mdSet('name',this.value)"         → ${onAct('input',mdSet,'name',EL_VALUE)}
     onclick="salesListToggleRow(event,'${id}')"→ ${onAct('click',salesListToggleRow,EVENT,id)}
     oninput="salesListValueSearch(this)"       → ${onAct('input',salesListValueSearch,EL)}
     onclick="event.stopPropagation();f('a')"   → ${onActStop('click',f,'a')}
     onclick="event.stopPropagation()"          → ${onAct('click',actStop,EVENT)}
     onclick="if(event.target===this)xClose()"  → ${onActSelf('click',xClose)}
     ondragover="event.preventDefault()"        → ${onAct('dragover',actPrevent,EVENT)}
   В строке, склеенной через '+': '<b onclick="f()">' → '<b '+onAct('click',f)+'>'.
   Правила:
   - fn — функция модуля, объявленная на верхнем уровне (ссылкой, не строкой).
     Имя попадает в реестр ACT_FN в момент отрисовки; слушатель зовёт только
     функции из реестра и никогда не ищет имя из разметки в window.
   - Аргументы — данные (строки, числа, true/false, null, массивы, объекты):
     их считают при отрисовке и кладут в JSON; esc для них не нужен, onAct
     экранирует сам. Что должно считаться в момент клика (другая функция,
     переменная экрана) — в самой функции-действии, не в аргументах.
   - Несколько шагов, условие, присваивание — маленькая функция рядом со
     своим экраном: onclick="a=1;render()" → function xSetA(){a=1;render();}.
   - event.stopPropagation() внутри действия работает как раньше: действия
     на внешних элементах и слушатели document не вызываются.
     event.currentTarget — элемент с действием, как у встроенного обработчика.
   - Действие на элементе внутри отключённой кнопки не сработает: браузер
     такой клик до document не доводит. Таких мест в ERP нет.
   ===================================================================== */
/* События с подъёмом: действие ищем от цели вверх, как шёл встроенный обработчик. */
const ACT_BUBBLE=['click','dblclick','contextmenu','mousedown','mouseover','change','input','keydown','submit','paste',
 'pointerdown','pointermove','pointerup','pointercancel','pointerover','dragstart','dragend','dragover','dragleave','drop'];
/* События без подъёма: слушаем в фазе capture, действие — только у самой цели. */
const ACT_DIRECT=['focus','blur','scroll','toggle','mouseenter','mouseleave','pointerleave'];
/* Реестр разрешённых действий: имя → функция. Пополняют onAct и actAllow. */
const ACT_FN=Object.create(null);
function ActArg(kind,key){this.$=kind;if(key!==undefined)this.k=key;}
const EL=new ActArg('el'),EVENT=new ActArg('event'),EL_VALUE=new ActArg('value'),EL_CHECKED=new ActArg('checked'),ACT_UNDEF=new ActArg('undef');
function elData(key){return new ActArg('data',String(key));}
function actEsc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function actAllow(...fns){
 fns.forEach(fn=>{if(typeof fn!=='function'||!fn.name)throw new Error('Action must be a named function.');ACT_FN[fn.name]=fn;});
}
function onAct(type,fn,...args){
 if(!ACT_BUBBLE.includes(type)&&!ACT_DIRECT.includes(type))throw new Error('Unknown action event: '+type);
 actAllow(fn);
 const list=args.map(a=>{
  if(a===undefined)return ACT_UNDEF;
  if(a&&typeof a==='object'&&!(a instanceof ActArg)&&typeof a.$==='string')throw new Error('Action argument cannot have a $ key.');
  return a;});
 return 'data-on-'+type+'="'+fn.name+'"'+(list.length?' data-args-'+type+'="'+actEsc(JSON.stringify(list))+'"':'');
}
function onActStop(type,fn,...args){return onAct(type,fn,...args)+' data-stop-'+type;}
function onActSelf(type,fn,...args){return onAct(type,fn,...args)+' data-self-'+type;}
function actStop(ev){ev.stopPropagation();}
function actPrevent(ev){ev.preventDefault();}
function actArgs(raw,el,ev){
 if(!raw)return [];
 return JSON.parse(raw).map(a=>{
  if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.$!=='string')return a;
  return a.$==='el'?el:a.$==='event'?ev:a.$==='value'?el.value:a.$==='checked'?el.checked:a.$==='data'?el.dataset[a.k]:undefined;});
}
/* Один проход события. Цепочку «элемент → действие» собираем до первого
   вызова: действие обычно перерисовывает экран, а встроенные обработчики
   внешних элементов срабатывали и после этого. */
function actRun(ev,direct){
 const type=ev.type,chain=[];
 let el=ev.target;if(el&&el.nodeType!==1)el=el.parentElement;
 for(;el&&el.getAttribute;el=direct?null:el.parentElement){
  const name=el.getAttribute('data-on-'+type);
  if(name)chain.push([el,name,el.getAttribute('data-args-'+type)]);
 }
 if(!chain.length)return;
 let stopped=false;
 /* Раньше stopPropagation в обработчике не пускал событие к внешним
    элементам и к document. Слушатель уже на document — останавливаем свой
    обход и слушателей, записанных после этого модуля. */
 Object.defineProperty(ev,'stopPropagation',{configurable:true,value(){stopped=true;if(!direct)Event.prototype.stopImmediatePropagation.call(ev);}});
 try{
  for(const [node,name,raw] of chain){
   if(stopped)break;
   if(node!==ev.target&&node.hasAttribute('data-self-'+type))continue;
   const fn=ACT_FN[name];
   if(!fn){console.error('Action is not allowed: '+name);continue;}
   Object.defineProperty(ev,'currentTarget',{configurable:true,value:node});
   if(node.hasAttribute('data-stop-'+type))ev.stopPropagation();
   fn(...actArgs(raw,node,ev));
  }
 }finally{delete ev.stopPropagation;delete ev.currentTarget;}
}
/* Слушатели ставятся первыми на странице (модуль в начале manifest):
   встроенные обработчики тоже шли раньше слушателей document. Не passive —
   dragover, drop и keydown отменяют действие браузера сразу. */
if(typeof document!=='undefined'&&document.addEventListener){
 ACT_BUBBLE.forEach(t=>document.addEventListener(t,ev=>actRun(ev,false),{passive:false}));
 ACT_DIRECT.forEach(t=>document.addEventListener(t,ev=>actRun(ev,true),{capture:true,passive:false}));
}
