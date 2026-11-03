/* =====================================================================
   view/reports  ·  reports-2.0
   Конструктор отчётов: каталог слева, отчёт со страницами и фильтрами в
   центре, настройка выбранного графика справа (в режиме Edit).
   IN : DB.report (reports/model), движок reports/query, графики view/charts
   OUT: html

   Владелец, 9 октября 2026: «не хуже Looker Studio», «создавать отчёты по
   своему логическому порядку», «не должны сразу вываливаться блоком» —
   сначала каталог, отчёт открывается по выбору, на странице только её
   графики. Тип графика меняется в один клик, как в Looker.
   Свои фильтры зрителя (период, значения) живут в этом браузере; Save as
   default записывает их в отчёт. Сам отчёт — в базе (Export JSON его
   уносит). Edit открывает черновик: Save — записать, Cancel — как было;
   уход с несохранёнными правками спрашивает.
   ===================================================================== */
let repOpenId='',repPageId='',repEditOn=false,repSelW='',repQ='',repMenu=null,repPicks=[],repDraft=null,repDraftBase='';
const REP_VIEW_KEY='glass_erp_report_view_v1';
function repViewAll(){try{const v=JSON.parse(localStorage.getItem(REP_VIEW_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return {};}}
function repView(id){const v=repViewAll()[id];return v&&typeof v==='object'?v:{};}
function repViewSet(id,fn){const all=repViewAll(),v=all[id]&&typeof all[id]==='object'?all[id]:{};fn(v);all[id]=v;try{localStorage.setItem(REP_VIEW_KEY,JSON.stringify(all));}catch(e){}}
function repOpenReport(){if(repDraft&&repDraft.id===repOpenId)return repDraft;const r=repFind(repOpenId);return r&&repVisible(r)?r:null;}
/* Черновик правки: новый (ещё не в базе) — всегда несохранён. */
function repDirty(){return !!repDraft&&(!repFind(repDraft.id)||JSON.stringify(repDraft)!==repDraftBase);}
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(repDirty);
function repCanLeave(){return !repDirty()||confirm('Leave without saving the report?');}
function repDropDraft(){repDraft=null;repDraftBase='';repEditOn=false;repSelW='';repMenu=null;}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k,go){if(tab!=='reports'||k==='reports')return false;if(!repCanLeave())return true;repDropDraft();repBuild=null;return false;});
window.addEventListener('beforeunload',function(e){if(!repDirty())return;e.preventDefault();e.returnValue='';});
/* Фильтры зрителя: свои в этом браузере, иначе — сохранённые в отчёте. */
function repViewFilters(r){const v=repView(r.id);return v.f!==undefined?v.f:r.filters||{};}
function repPage(r){return r?r.pages.find(p=>p.id===repPageId)||r.pages[0]:null;}
function repSelWidget(r){const p=repPage(r);return p?p.widgets.find(w=>w.id===repSelW)||null:null;}
/* Подстановки фильтров: «Me» — вошедший человек, «This station» — станция
   экрана. На экране станции и в Overview их задаёт сам экран. */
let repCtxOverride=null;
function repCtx(){if(repCtxOverride)return repCtxOverride;const u=typeof signinUser==='function'?signinUser():null;return {person:u?u.name:'',station:''};}
function repDateText(d){if(!d)return 'All time';if(d.from||d.to)return (d.from?salesListShortDay(d.from):'…')+' – '+(d.to?salesListShortDay(d.to):'…');const p=REP_PRESETS.find(x=>x[0]===d.preset);return p?p[1]:'All time';}
/* Запрос графика с периодом и фильтрами отчёта (если график не задал свой
   период): фильтр отчёта действует там, где у источника есть это поле. */
function repWidgetQuery(r,w){
 const q=JSON.parse(JSON.stringify(w.q)),v=repView(r.id),S=REP_SRC[q.source];
 if(q.date.use!=='own'){const d=v.date||r.date;q.date=Object.assign({},q.date,{preset:d.preset||'',from:d.from||'',to:d.to||''});}
 if(w.type!=='table')q.more=[];
 const vs=v.s&&v.s[w.id];if(vs)q.sort=vs;
 q.custom=r.custom||[];
 q.skip=[];Object.entries(repViewFilters(r)).forEach(([f,vals])=>{if(!Array.isArray(vals)||!vals.length||!S)return;if(repField(S,f))q.filters.push({f,op:'in',v:vals});else q.skip.push(f);});
 return q;
}

/* ------------------------------ Каталог ------------------------------ */
/* Владелец, 26.10.2026: «если отчётов будет 300, то что — одним длинным
   листом? презентабельней, минималистично, производительно и эффективно».
   Выбран вид A + B: панель — поиск, Pinned, Recent и папки деревом
   (подпапки — через « / » в имени папки, открыта одна папка, в ней первые
   8 отчётов и «All N»); «‹» прячет панель — отчёт на всю ширину, сверху
   путь и быстрые ссылки, «☰ Reports» возвращает. Избранное и недавние —
   свои у каждого человека, в этом браузере (как фильтры зрителя). */
const REP_UI_KEY='glass_erp_report_ui_v1',REP_FOLDER_SHOW=8,REP_FIND_SHOW=60;
let repFolderOpen='',repSubOpen='',repFolderAll=new Set();
function repUi(){try{const v=JSON.parse(localStorage.getItem(REP_UI_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return {};}}
function repUiSet(fn){const v=repUi();fn(v);try{localStorage.setItem(REP_UI_KEY,JSON.stringify(v));}catch(e){}}
function repUiList(k){const m=repUi()[k],l=m&&m[repMe()||'-'];return (Array.isArray(l)?l:[]).map(repFind).filter(r=>r&&repVisible(r));}
function repPinned(id){return repUiList('pins').some(r=>r.id===id);}
function repPinToggle(id){const on=repPinned(id);repUiSet(v=>{const me=repMe()||'-';v.pins=v.pins&&typeof v.pins==='object'?v.pins:{};const l=(Array.isArray(v.pins[me])?v.pins[me]:[]).filter(x=>x!==id);v.pins[me]=on?l:[id].concat(l).slice(0,20);});render();}
function repRecentAdd(id){repUiSet(v=>{const me=repMe()||'-';v.recent=v.recent&&typeof v.recent==='object'?v.recent:{};v.recent[me]=[id].concat((Array.isArray(v.recent[me])?v.recent[me]:[]).filter(x=>x!==id)).slice(0,8);});}
function repCatHidden(){return repUi().hidden===true;}
function repCatHide(on){repUiSet(v=>{v.hidden=!!on;});render();}
/* Путь папки: «Production / Cutting» — папка и подпапка; глубже — к подпапке. */
function repFolderPath(r){const p=String(r&&r.folder||'').split('/').map(x=>x.trim()).filter(Boolean);return p.length?[p[0],p.slice(1).join(' / ')]:['Unfiled',''];}
function repCatRow(r){
 return `<button type="button" class="rep-item${r.id===repOpenId?' on':''}" data-rep-item="${esc(r.id)}" onclick="repOpen(this.dataset.repItem)" title="${esc(r.name)}"><span data-raw>${esc(r.name)}</span>${repPinned(r.id)?'<i aria-label="Pinned">★</i>':''}</button>`;
}
function repCatList(list,key){
 const all=repFolderAll.has(key),shown=all?list:list.slice(0,REP_FOLDER_SHOW);
 return shown.map(repCatRow).join('')+(list.length>shown.length?`<button type="button" class="rep-more" data-rep-all="${esc(key)}" onclick="repFolderAll.add(this.dataset.repAll);render()">All ${list.length} →</button>`:'');
}
function repCatalog(){
 const list=(DB.report||[]).filter(repVisible).sort((a,b)=>a.name.localeCompare(b.name)),q=repQ.trim().toLowerCase();
 const head=`<div class="rep-cat-head"><h3>Reports</h3><span class="rep-cat-acts"><button type="button" class="pri sm" data-rep-new onclick="repNew()">+ New</button><button type="button" class="sm" data-rep-hide title="Hide list" aria-label="Hide list" onclick="repCatHide(true)">‹</button></span></div>
  <input type="search" class="rep-search" data-rep-search placeholder="Search ${list.length} reports…" value="${esc(repQ)}" oninput="repQ=this.value;render()">`;
 let body='';
 if(q){
  /* Поиск — по имени и папке, найденное строками с папкой. */
  const hit=list.filter(r=>(r.name+' '+r.folder).toLowerCase().includes(q));
  body=hit.slice(0,REP_FIND_SHOW).map(r=>`<button type="button" class="rep-item${r.id===repOpenId?' on':''}" data-rep-item="${esc(r.id)}" onclick="repOpen(this.dataset.repItem)"><span data-raw>${esc(r.name)}</span><small data-raw>${esc(repFolderPath(r).filter(Boolean).join(' / '))}</small></button>`).join('')
   +(hit.length>REP_FIND_SHOW?`<div class="mut small">First ${REP_FIND_SHOW} of ${hit.length}</div>`:'')||'<div class="mut">Nothing found.</div>';
 }else{
  const pins=repUiList('pins'),recent=repUiList('recent').filter(r=>!pins.includes(r)).slice(0,5);
  if(pins.length)body+=`<div class="rep-sec">Pinned</div>`+pins.map(repCatRow).join('');
  if(recent.length)body+=`<div class="rep-sec">Recent</div>`+recent.map(repCatRow).join('');
  const tops=[...new Set(list.map(r=>repFolderPath(r)[0]))].sort((a,b)=>(a==='Unfiled')-(b==='Unfiled')||a.localeCompare(b));
  body+=`<div class="rep-sec">Folders</div>`+tops.map(t=>{
   const inTop=list.filter(r=>repFolderPath(r)[0]===t),open=repFolderOpen===t;
   let h=`<button type="button" class="rep-folder${open?' on':''}" data-rep-folder="${esc(t)}" aria-expanded="${open}" onclick="repToggleFolder(this.dataset.repFolder)"><i>${open?'▾':'▸'}</i><span data-raw>${esc(t)}</span><span class="n">${inTop.length}</span></button>`;
   if(!open)return h;
   const subs=[...new Set(inTop.map(r=>repFolderPath(r)[1]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
   h+=`<div class="rep-tree">`+subs.map(sub=>{const inSub=inTop.filter(r=>repFolderPath(r)[1]===sub),so=repSubOpen===t+' / '+sub;
    return `<button type="button" class="rep-folder sub${so?' on':''}" data-rep-folder="${esc(t+' / '+sub)}" aria-expanded="${so}" onclick="repToggleSub(this.dataset.repFolder)"><i>${so?'▾':'▸'}</i><span data-raw>${esc(sub)}</span><span class="n">${inSub.length}</span></button>`
     +(so?`<div class="rep-tree">${repCatList(inSub,t+' / '+sub)}</div>`:'');}).join('')+repCatList(inTop.filter(r=>!repFolderPath(r)[1]),t)+`</div>`;
   return h;
  }).join('');
 }
 return `<div class="card rep-cat" data-rep-catalog>${head}<div class="rep-list">${body}</div></div>`;
}
function repToggleFolder(t){repFolderOpen=repFolderOpen===t?'':t;repSubOpen='';render();}
function repToggleSub(p){repSubOpen=repSubOpen===p?'':p;render();}
/* Панель спрятана: путь к отчёту и быстрые ссылки — избранное и недавние. */
function repCatBar(r){
 const path=r?repFolderPath(r).filter(Boolean):[],chips=repUiList('pins').concat(repUiList('recent')).filter((x,i,a)=>a.indexOf(x)===i&&(!r||x.id!==r.id)).slice(0,6);
 return `<div class="card rep-bar" data-rep-bar><button type="button" class="sm" data-rep-show onclick="repCatHide(false)">☰ Reports</button><span class="rep-crumb" data-raw>${['Reports'].concat(path).map(esc).join(' › ')}${r?' › <b>'+esc(r.name)+'</b>':''}</span>
  <span class="rep-chips">${chips.map(x=>`<button type="button" class="rep-chip" data-rep-item="${esc(x.id)}" onclick="repOpen(this.dataset.repItem)">${repPinned(x.id)?'★ ':''}<span data-raw>${esc(x.name)}</span></button>`).join('')}</span></div>`;
}

/* ------------------------------ Графики ------------------------------ */
function repDelta(cur,prev){if(cur==null||prev==null||!prev)return '';const d=(cur-prev)/Math.abs(prev)*100;return (d>=0?'▲ ':'▼ ')+Math.abs(d).toFixed(Math.abs(d)<10?1:0)+'%';}
function repCmpText(res){const c=res.compare;return c?(c.kind==='year'?'vs last year':'vs previous period'):'';}
/* Цвет значения разбивки — по его месту в полном списке значений поля, а не
   в выборке: фильтр не перекрашивает (dataviz). Цветов 24 (series-1…24,
   только для отчётов); 25-е и дальше — те же цвета светлее (ch-t2). Цвет,
   выбранный человеком квадратиком (r.colors[поле][значение]), — его. */
let repColorsCur={};
function repSeriesClass(i){return 'ch-s'+(i%24+1)+(i>=24?' ch-t2':'');}
function repSeriesCls(S,d,keys){
 const p=repDimParse(d),all=repIsTime(S,d)?keys:repFieldValues(S,p.f),rank=k=>{const i=all.indexOf(k);return i<0?9999:i;};
 const own=repColorsCur[p.f]||{},order=keys.filter(k=>k!=='__other').slice().sort((a,b)=>rank(a)-rank(b)),m=new Map();order.forEach((k,i)=>m.set(k,own[k]?'ch-s'+own[k]:repSeriesClass(i)));m.set('__other','ch-so');return m;
}
function repPickAttrs(r,S,d,k){
 const p=repDimParse(d),f=repField(S,p.f);if(!f||f.type==='date'||k==='__other'||k==='—')return '';
 repPicks.push([r.id,p.f,k]);const i=repPicks.length-1;return ` role="button" tabindex="0" data-rep-pick="${esc(p.f)}" onclick="repPickAt(${i})" onkeydown="if(event.key==='Enter')repPickAt(${i})"`;
}
function repPickAt(i){const x=repPicks[i],r=x&&(repOpenReport()&&repOpenReport().id===x[0]?repOpenReport():repFind(x[0]));if(!x||!r)return;const base=Object.assign({},repViewFilters(r));repViewSet(x[0],v=>{v.f=Object.assign(base,{[x[1]]:[x[2]]});});repMenu=null;render();}
function repNumbers(res){
 /* Сравнение — изменение и само число прошлого периода: «▲ 12% · Last year 231». */
 const sub=(m,i)=>{if(!res.compare)return '';const d=repDelta(res.total[i],res.compare.total[i]);return esc((d?d+' · ':'')+(res.compare.kind==='year'?'Last year ':'Previous ')+repFmt(m,res.compare.total[i]));};
 return `<div class="ch-stats rep-nums">${res.metrics.map((m,i)=>chartStat(m.label,esc(repFmt(m,res.total[i])),sub(m,i),` data-rep-number="${esc(m.k)}"`)).join('')}</div>`;
}
/* Ноль в строке таблицы — точкой, как пустая клетка разбивки: меньше шума.
   Деньги и проценты пишутся как есть. */
function repCellHTML(m,v){return v===0&&!m.money&&!m.pct?'<span class="mut">·</span>':esc(repFmt(m,v));}
/* Таблица — все строки (владелец, 03.11.2026: «ничего не ограничивать»):
   первые REP_TABLE_STEP сразу, дальше дорисовываются, когда карточку
   прокручивают вниз (repTableMore). */
const REP_TABLE_STEP=300;
let repTableRest=new Map();
function repTableBody(w,keys,rowHTML){
 if(keys.length<=REP_TABLE_STEP){repTableRest.delete(w.id);return keys.map(rowHTML).join('');}
 repTableRest.set(w.id,{keys,rowHTML,at:REP_TABLE_STEP});
 return keys.slice(0,REP_TABLE_STEP).map(rowHTML).join('');
}
function repTableMore(el){
 const x=repTableRest.get(el.dataset.repScroll);if(!x||el.scrollTop+el.clientHeight<el.scrollHeight-600)return;
 const body=el.querySelector('tbody'),end=Math.min(x.at+REP_TABLE_STEP,x.keys.length);if(!body)return;
 body.insertAdjacentHTML('beforeend',readScope(()=>{let html='';for(let i=x.at;i<end;i++)html+=x.rowHTML(x.keys[i],i,x.keys);return html;}));x.at=end;if(end>=x.keys.length)repTableRest.delete(el.dataset.repScroll);
}
function repTableHTML(r,S,res,w){
 const ms=res.metrics,d1=res.dims[0],d2=res.dims[1],cmp=res.compare&&!d2;
 /* Измерения строк: первое и ещё (res.more) — каждое своей колонкой. */
 /* Клик по заголовку — порядок строк (как в Looker): свой у зрителя, в этом браузере. */
 const so=repWidgetQuery(r,w).sort,sortTh=(text,by,i,cls,at,j)=>{const on=!!so&&so.by===by&&(by==='label'?!j:so.i===i);return `<th${at||''} class="${cls||''} rep-sortable${on?' rep-sort-on':''}" data-rep-sort="${by}:${i}" onclick="repSortClick('${esc(w.id)}','${by}',${i})">${esc(text)}${on?(so.dir==='asc'?' ▲':' ▼'):''}</th>`;};
 const rowDims=[d1].concat(res.more||[]),rowHead=at=>rowDims.map((d,j)=>sortTh(repDimLabel(S,d),'label',0,'',at,j)).join('');
 /* Значение, как в строке выше, — бледно: группа видна, «6 mm · 6CLEAR» и батчи под ней. */
 const rowCells=(k,i,arr)=>{const parts=String(k).split('\u0002'),prev=i>0&&arr?String(arr[i-1]).split('\u0002'):[];let same=rowDims.length>1;
  return rowDims.map((d,j)=>{const v=parts[j];if(v==null)return '<td></td>';same=same&&j<rowDims.length-1&&prev[j]===v;const t=esc(repKeyText(S,d,v));return `<td${repPickAttrs(r,S,d,v)}${same?' class="rep-same"':''}>${j?`<span data-raw>${t}</span>`:`<b data-raw>${t}</b>`}</td>`;}).join('');},totalCell=`<td colspan="${rowDims.length}"><b>Total</b></td>`;
 if(!d1)return `<div class="sales-table-wrap"><table class="sl-table rep-table"><thead><tr>${ms.map(m=>`<th class="n">${esc(m.label)}</th>`).join('')}</tr></thead><tbody><tr>${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`).join('')}</tr></tbody></table></div>`;
 const keys=res.keys,label=k=>repKeyText(S,d1,k);let head,body,foot='';
 if(d2){
  /* Разбивка и несколько метрик: у каждого значения разбивки — все метрики
     (раньше молча оставалась только первая). */
  const k2=res.keys2,cell=(v,m)=>v?esc(repFmt(m,v)):'<span class="mut">·</span>',many=ms.length>1;
  head=many?`${rowHead(' rowspan="2"')}${k2.map(k=>`<th class="n rep-group" colspan="${ms.length}" data-raw>${esc(repKeyText(S,d2,k))}</th>`).join('')}<th class="n rep-group" colspan="${ms.length}">Total</th></tr><tr>${k2.concat(['']).map(()=>ms.map(m=>`<th class="n">${esc(m.label)}</th>`).join('')).join('')}`
   :`${rowHead()}${k2.map(k=>`<th class="n" data-raw>${esc(repKeyText(S,d2,k))}</th>`).join('')}<th class="n">Total</th>`;
  body=repTableBody(w,keys,(k,i,arr)=>`<tr>${rowCells(k,i,arr)}${k2.map(b=>ms.map((m,i)=>`<td class="n">${cell((res.cells.get(k+'\u0001'+b)||[])[i],m)}</td>`).join('')).join('')}${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.rowTotals.get(k)[i]))}</b></td>`).join('')}</tr>`);
  if(w.opts.totals)foot=`<tr class="sl-foot">${totalCell}${k2.map(b=>ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.colTotals.get(b)[i]))}</b></td>`).join('')).join('')}${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`).join('')}</tr>`;
 }else{
  head=`${rowHead()}${ms.map((m,i)=>sortTh(m.label,'metric',i,'n')+(cmp?`<th class="n rep-cmp">${esc(repCmpText(res))}</th>`:'')).join('')}`;
  body=repTableBody(w,keys,(k,n,arr)=>`<tr>${rowCells(k,n,arr)}${ms.map((m,i)=>`<td class="n">${repCellHTML(m,res.rowTotals.get(k)[i])}</td>`+(cmp?`<td class="n rep-cmp">${esc(repDelta(res.rowTotals.get(k)[i],(res.compare.rowTotals.get(k)||[])[i]))}</td>`:'')).join('')}</tr>`);
  if(w.opts.totals)foot=`<tr class="sl-foot">${totalCell}${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`+(cmp?`<td class="n rep-cmp">${esc(repDelta(res.total[i],res.compare.total[i]))}</td>`:'')).join('')}</tr>`;
 }
 return `<div class="sales-table-wrap rep-scroll" data-rep-scroll="${esc(w.id)}" onscroll="repTableMore(this)"><table class="sl-table rep-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>${keys.length>REP_TABLE_STEP?`<div class="mut small" data-rep-rows>${chNum(keys.length)} rows</div>`:''}`;
}
function repParts(res,cls,k){return res.keys2.map(b=>({value:(res.cells.get(k+'\u0001'+b)||[])[0]||0,cls:cls.get(b)}));}
function repLegend(S,res,cls){const d2=res.dims[1];return chartLegend(res.keys2.filter(b=>(res.colTotals.get(b)||[])[0]).map(b=>({label:repKeyText(S,d2,b),cls:cls.get(b),attrs:repColorAttrs(S,d2,b)})));}
/* В Edit значение в легенде — выбор цвета квадратиком (два ряда по 12, как в Looker). */
function repColorAttrs(S,d,k){if(!repEditOn||k==='__other'||repIsTime(S,d))return '';return ` role="button" data-rep-color data-f="${esc(repDimParse(d).f)}" data-v="${esc(k)}" title="Colour" onclick="repColorOpen(event,this.dataset.f,this.dataset.v)"`;}
function repColorOpen(e,f,v){if(e)e.stopPropagation();repMenu=Object.assign({kind:'color',f,v},repAt(e));render();}
function repColorSet(n){const m=repMenu;repMenu=null;if(!m)return;repEditCur(r=>{r.colors=r.colors||{};const x=r.colors[m.f]=r.colors[m.f]||{};if(n)x[m.v]=n;else delete x[m.v];});}
/* ------------------------------ Расчёт графиков ------------------------------ */
/* Владелец, 03.11.2026: «не показывать, что он завис, а показывать, что он
   грузится, в процентах». Посчитанный график помнится до записи в базе
   (storageInvalidate) или нового дня; строки выборки не хранятся — только
   итоги. Страница, которой нужен долгий расчёт, сначала показывает процент,
   графики считаются в фоне по одному (repBuild). После записи (скан в другой
   вкладке) прежние графики остаются на экране, пока считаются новые
   (repStale), — страница не мигает процентом на каждый скан. Долгий — тот, чей источник в
   прошлый раз считался дольше REP_SYNC_MS, или ещё не считался на большой
   базе (repHeavy). */
const REP_SYNC_MS=300;
let repResults=new Map(),repStale=new Map(),repCost=new Map(),repBuild=null;
function repResultsDrop(){if(repResults.size)repStale=repResults;repResults=new Map();}
function repResultKey(q,ctx){return finToday()+'|'+JSON.stringify([q,ctx,typeof archiveScope!=='undefined'&&archiveScope&&archiveScope.ready?archiveScope.key:'']);}
function repResultOf(q,ctx){
 const key=repResultKey(q,ctx);if(repResults.has(key))return repResults.get(key);
 const t=performance.now(),res=repQuery(q,ctx);repCost.set(q.source,performance.now()-t);
 if(res){delete res.rows;delete res.groups;}
 if(repResults.size>300)repResults.delete(repResults.keys().next().value);
 repResults.set(key,res);return res;
}
function repHeavy(){return (DB.stationScan||[]).length+(DB.salesOrder||[]).length*40>60000;}
function repSlow(q){const c=repCost.get(q.source);return c==null?repHeavy():c>REP_SYNC_MS;}
function repPageQueries(r,p){return p.widgets.filter(w=>repSourceAllowed(w.q.source)).map(w=>repWidgetQuery(r,w));}
/* Страница: 'ready' — всё посчитано; 'stale' — показываются прежние графики,
   новые считаются; 'wait' — процент вместо графиков. Быстрые — сразу. */
function repPageReady(r,p){
 const ctx=repCtx(),qs=repPageQueries(r,p).filter(q=>!repResults.has(repResultKey(q,ctx)));
 qs.forEach(q=>{if(!repSlow(q))repResultOf(q,ctx);});
 const left=qs.filter(q=>!repResults.has(repResultKey(q,ctx)));
 if(!left.length){repBuild=null;return 'ready';}
 const key=r.id+'|'+p.id+'|'+repEditOn;
 if(!repBuild||repBuild.key!==key)repBuildStart(key,r,p);
 return left.every(q=>repStale.has(repResultKey(q,ctx)))?'stale':'wait';
}
/* Другая страница или другой отчёт — свой repBuild, прежний останавливается. */
function repBuildStart(key,r,p){
 const b=repBuild={key,pct:0};
 const step=()=>{
  if(repBuild!==b)return;
  const ctx=repCtx(),qs=repPageQueries(r,p),next=qs.find(q=>!repResults.has(repResultKey(q,ctx)));
  if(!next){repBuild=null;render();return;}
  readScope(()=>repResultOf(next,ctx));
  b.pct=Math.floor(qs.filter(q=>repResults.has(repResultKey(q,ctx))).length/qs.length*100);
  const el=document.querySelector('[data-rep-archive-wait]'),up=document.querySelector('[data-rep-updating]');if(el)el.textContent=repBuildText(b);if(up)up.textContent=repBuildText(b,true);
  setTimeout(step,0);
 };
 setTimeout(step,0);
}
function repBuildText(b,stale){return `${stale?'Updating':'Building report'} · ${b?b.pct:0}%`;}
function repChart(r,w){
 if(!repSourceAllowed(w.q.source)){const a=(REP_SRC[w.q.source]||{}).access||'finance';return '<div class="mut">Needs '+a.charAt(0).toUpperCase()+a.slice(1)+' access.</div>';}
 const q=repWidgetQuery(r,w),ctx=repCtx(),key=repResultKey(q,ctx),res=repResults.has(key)?repResults.get(key):repBuild&&repStale.has(key)?repStale.get(key):repResultOf(q,ctx);if(!res)return '<div class="mut">Choose data.</div>';
 const S=REP_SRC[q.source],m=res.metrics[0],fmt=v=>repFmt(m,v),d1=res.dims[0],d2=res.dims[1];
 if(w.type==='number')return repNumbers(res);
 if(w.type==='table')return repTableHTML(r,S,res,w);
 if(!d1)return repNumbers(res)+'<div class="mut">Choose a dimension to draw this chart.</div>';
 if(!res.count&&!(res.compare&&res.compare.total.some(Boolean)))return '<div class="mut">No data for this period and filters.</div>';
 const cls=d2?repSeriesCls(S,d2,res.keys2):null,text=k=>repKeyText(S,d1,k),every=Math.max(1,Math.ceil(res.keys.length/(res.keys.length>60?8:14)));
 if(w.type==='bars'){
  const rows=res.keys.map(k=>({label:text(k),value:res.rowTotals.get(k)[0]||0,parts:d2?repParts(res,cls,k):null,attrs:repPickAttrs(r,S,d1,k),title:text(k)+': '+fmt(res.rowTotals.get(k)[0])}));
  return (d2?repLegend(S,res,cls):'')+`<div class="rep-scroll">${chartHBars(rows,{fmt,label:w.title})}</div>`;
 }
 /* Combo (как в Looker): колонка — первый показатель, внутри узкая колонка —
    второй по своей шкале (самая высокая — 70% высоты, чтобы оставаться
    внутри); значения обоих — в подсказке. */
 if(w.type==='combo'){
  const m2=res.metrics[1],v2=k=>(res.rowTotals.get(k)||[])[1],max2=Math.max(0,...res.keys.map(k=>+v2(k)||0));
  const pts=res.keys.map((k,i)=>({label:text(k),value:res.rowTotals.get(k)[0]||0,inner:m2&&max2?(+v2(k)||0)/max2*70:null,tick:i%every===0,attrs:repPickAttrs(r,S,d1,k),title:text(k)+': '+fmt(res.rowTotals.get(k)[0])+(m2?' · '+m2.label+' '+repFmt(m2,v2(k)):'')}));
  return chartLegend([{label:m.label,cls:'rep-key-acc'}].concat(m2?[{label:m2.label+' (inner)',cls:'ch-inner-key'}]:[]))+chartColumns(pts,{fmt,label:w.title})+(m2?'':'<div class="mut small">Add a second metric for the inner column.</div>');
 }
 if(w.type==='columns'){
  const pts=res.keys.map((k,i)=>({label:text(k),value:res.rowTotals.get(k)[0]||0,parts:d2?repParts(res,cls,k):null,tick:i%every===0,attrs:repPickAttrs(r,S,d1,k),title:text(k)+': '+fmt(res.rowTotals.get(k)[0])+(res.compare?' · '+repCmpText(res)+' '+fmt((res.compare.rowTotals.get(k)||[])[0]):'')}));
  return (d2?repLegend(S,res,cls):'')+chartColumns(pts,{fmt,label:w.title});
 }
 if(w.type==='line'){
  const labels=res.keys.map(text);let series;
  if(d2)series=res.keys2.map(b=>({label:repKeyText(S,d2,b),cls:cls.get(b),values:res.keys.map(k=>(res.cells.get(k+'\u0001'+b)||[])[0]||0)}));
  else series=[{label:m.label,cls:'ch-acc',values:res.keys.map(k=>res.rowTotals.get(k)[0]||0)}];
  if(res.compare&&!d2)series.push({label:repCmpText(res),cls:'ch-so',dashed:true,values:res.keys.map(k=>(res.compare.rowTotals.get(k)||[])[0]||0)});
  const legend=d2?repLegend(S,res,cls):res.compare?chartLegend([{label:m.label,cls:'rep-key-acc'},{label:repCmpText(res),cls:'ch-so'}]):'';
  return legend+chartLine(labels,series,{fmt,label:w.title});
 }
 if(w.type==='pie'){
  /* Все доли (владелец, 03.11.2026: «количество долей тоже не ограничивать»). */
  const keys=res.keys.filter(k=>(res.rowTotals.get(k)[0]||0)>0),pc=repSeriesCls(S,d1,keys);
  const parts=keys.map(k=>({label:text(k),value:res.rowTotals.get(k)[0],cls:pc.get(k),attrs:repEditOn?repColorAttrs(S,d1,k):repPickAttrs(r,S,d1,k)}));
  return chartPie(parts,{fmt,label:w.title})||'<div class="mut">No data for this period and filters.</div>';
 }
 return '';
}
function repWidgetTitle(w){
 if(w.title)return w.title;const S=REP_SRC[w.q.source];if(!S)return 'Chart';
 const ms=w.q.metrics.map(k=>repMetric(S,k)).filter(Boolean).map(m=>m.label).join(', ')||S.metrics[0].label;
 return ms+(w.q.dims[0]?' by '+repDimLabel(S,w.q.dims[0]).toLowerCase():'')+(w.q.dims[1]?' · '+repDimLabel(S,w.q.dims[1]).toLowerCase():'');
}
function repWidgetCard(r,w,i,n){
 const sel=repEditOn&&w.id===repSelW,tools=repEditOn?`<span class="rep-wtools"><button type="button" class="sm" onclick="repSelectWidget('${esc(w.id)}')">Edit</button><button type="button" class="sm" title="Duplicate" onclick="repDupWidget('${esc(w.id)}')">Duplicate</button><button type="button" class="sm" title="Move up" ${i?'':'disabled'} onclick="repMoveWidget('${esc(w.id)}',-1)">↑</button><button type="button" class="sm" title="Move down" ${i<n-1?'':'disabled'} onclick="repMoveWidget('${esc(w.id)}',1)">↓</button><button type="button" class="sm dl" title="Remove" onclick="repDelWidget('${esc(w.id)}')">×</button></span>`:'';
 const src=REP_SRC[w.q.source],own=w.q.date.use==='own'?' · '+repDateText(w.q.date):'';
 return `<div class="card rep-w${w.width==='half'?' half':''}${sel?' sel':''}" data-rep-widget="${esc(w.id)}" data-rep-type="${w.type}"${repEditOn&&!sel?` onclick="if(!event.target.closest('button,[role=button],input,select'))repSelectWidget('${esc(w.id)}')"`:''}><div class="rep-wh"><h3 data-raw>${esc(repWidgetTitle(w))}</h3><span class="mut">${esc(src?src.label:'')}${esc(own)}</span>${tools}${w.type!=='number'||!repEditOn?`<button type="button" class="sm rep-csv" data-rep-csv title="Export all rows to CSV" onclick="repCsv('${esc(w.id)}')">CSV</button>`:''}</div>${repChart(r,w)}${repSkipHTML(r,w)}</div>`;
}

function repSkipHTML(r,w){
 const q=repWidgetQuery(r,w),S=REP_SRC[q.source],list=S?repSkippedFilters(S,q):[];
 return list.length?`<div class="mut small" data-rep-skip>Not filtered by ${esc(list.map(repFieldLabelAny).join(', '))}</div>`:'';
}

/* ------------------------------ Фильтры отчёта ------------------------------ */
function repSources(r){return [...new Set(r.pages.flatMap(p=>p.widgets.map(w=>w.q.source)))].filter(repSourceAllowed).map(k=>REP_SRC[k]);}
function repControlFields(r){const m=new Map();repSources(r).forEach(S=>repFields(S).forEach(f=>{if(f.type==='dim'&&!m.has(f.k))m.set(f.k,f.label);}));return m;}
function repControlValues(r,f){const set=new Set();repSources(r).forEach(S=>{if(repField(S,f))repFieldValues(S,f).forEach(v=>set.add(v));});return [...set].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
function repControls(r){
 const v=repView(r.id),vf=repViewFilters(r),labels=repControlFields(r),active=Object.keys(vf).filter(f=>(vf[f]||[]).length);
 const keys=[...new Set(r.controls.filter(f=>labels.has(f)).concat(active))];
 const btn=f=>{const vals=vf[f]||[],on=vals.length>0;return `<span class="rep-ctl${on?' on':''}"><button type="button" class="sl-quiet" data-rep-ctl="${esc(f)}" onclick="repOpenCtl(event,'${esc(f)}')">${esc(labels.get(f)||f)}${on?': '+esc(vals.length>2?vals.length+' values':vals.join(', ')):''}<span class="sl-disclosure">▾</span></button>${on?`<button type="button" class="rep-x" aria-label="Clear" onclick="repClearCtl('${esc(f)}')">×</button>`:''}${repEditOn&&r.controls.includes(f)?`<button type="button" class="rep-x" title="Remove control" onclick="repDelControl('${esc(f)}')">−</button>`:''}</span>`;};
 const free=[...labels.keys()].filter(f=>!keys.includes(f));
 return `<div class="rep-bar"><button type="button" class="sl-quiet rep-ctl-date" data-rep-date onclick="repOpenDate(event)">Date: ${esc(repDateText(repEditOn?r.date:v.date||r.date))}<span class="sl-disclosure">▾</span></button>${keys.map(btn).join('')}${repEditOn&&free.length?`<select class="rep-add-ctl" aria-label="Add control" onchange="if(this.value)repAddControl(this.value)"><option value="">+ Control</option>${free.map(f=>`<option value="${esc(f)}">${esc(labels.get(f))}</option>`).join('')}</select>`:''}${v.date||v.f!==undefined||v.s?`<button type="button" class="sm" data-rep-reset onclick="repResetView()" title="Back to the report's own period and filters">Reset</button>${!repEditOn&&repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-save-view onclick="repSaveDefaults()" title="Keep this period and these filters in the report">Save as default</button>`:''}`:''}</div>`;
}
function repMenuHTML(r){
 const m=repMenu;if(!m||!r)return '';
 const style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-320))}px;top:${Math.max(8,m.y)}px`,back='<div class="sl-backdrop" onclick="repMenu=null;render()"></div>';
 if(m.kind==='date'){
  const cur=repEditOn?r.date:repView(r.id).date||r.date;
  return back+`<div class="sl-menu rep-menu" style="${style}" data-rep-date-menu><h5>Period</h5><div class="sl-presets">${REP_PRESETS.map(([k,l])=>`<button type="button" class="sl-btn${!cur.from&&!cur.to&&cur.preset===k?' on':''}" onclick="repSetViewDate({preset:'${k}'})">${l}</button>`).join('')}</div>
   <h5>Custom</h5><div class="sl-row"><input type="date" id="repFrom" value="${esc(cur.from||'')}"><input type="date" id="repTo" value="${esc(cur.to||'')}"></div><div class="sl-actions"><button type="button" class="pri" onclick="repSetViewDate({from:document.getElementById('repFrom').value,to:document.getElementById('repTo').value})">Apply</button></div></div>`;
 }
 if(m.kind==='screens'){
  const sc=r.screens||{stations:[],people:[]},people=(DB.user||[]).filter(u=>u&&u.name&&(typeof userOffice!=='function'||userOffice(u)));
  const box=(kind,id,label)=>`<label><input type="checkbox" ${(m.draft[kind]||[]).includes(id)?'checked':''} onchange="repScreensToggle('${kind}',this.dataset.id,this.checked)" data-id="${esc(id)}" data-rep-screen-box="${kind}"> <span data-raw>${esc(label)}</span></label>`;
  return back+`<div class="sl-menu rep-menu" style="${style}" data-rep-screens-menu><h5>Board of stations</h5><div class="sl-vals">${(DB.station||[]).map(s=>box('stations',s.code,s.code+' · '+sfName(s))).join('')}</div>
   <h5>Overview of people</h5><div class="sl-vals">${people.map(u=>box('people',u.viewProfileId,u.name)).join('')||'<div class="mut">No office users</div>'}</div>
   <div class="hint">Filters “This station” and “Me” follow the screen.</div><div class="sl-actions"><button type="button" class="pri" data-rep-screens-apply onclick="repScreensApply()">Apply</button></div></div>`;
 }
 if(m.kind==='color'){
  const cur=((repColorsCur[m.f]||{})[m.v])||0;
  return back+`<div class="sl-menu rep-menu" style="${style}" data-rep-color-menu><h5 data-raw>${esc(m.v)}</h5><div class="rep-swatches">${Array.from({length:24},(_,i)=>`<button type="button" class="ch-s${i+1}${cur===i+1?' on':''}" aria-label="Colour ${i+1}" data-rep-swatch="${i+1}" onclick="repColorSet(${i+1})"></button>`).join('')}</div><div class="sl-actions"><button type="button" class="sl-btn" onclick="repColorSet(0)">Automatic</button></div></div>`;
 }
 if(m.kind==='ctl'){
  const all=repControlValues(r,m.f),q=String(m.search||'').toLowerCase(),shown=all.filter(x=>!q||x.toLowerCase().includes(q));
  return back+`<div class="sl-menu rep-menu" style="${style}" data-rep-ctl-menu="${esc(m.f)}"><input type="text" class="sl-search" id="repCtlSearch" placeholder="Search values…" value="${esc(m.search||'')}" oninput="repMenu.search=this.value;render();setTimeout(()=>{const e=document.getElementById('repCtlSearch');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},0)">
   <div class="sl-vals">${shown.map(x=>`<label><input type="checkbox" ${m.draft.includes(x)?'checked':''} onchange="repCtlToggle(this.dataset.v,this.checked)" data-v="${esc(x)}"> <span data-raw>${esc(x)}</span></label>`).join('')||'<div class="mut">No values</div>'}</div>
   <div class="sl-actions"><button type="button" class="sl-btn" onclick="repMenu.draft=[];repCtlApply()">Clear</button><button type="button" class="pri" data-rep-ctl-apply onclick="repCtlApply()">Apply</button></div></div>`;
 }
 return '';
}
function repAt(e){const t=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;return {x:t?t.left:40,y:t?t.bottom+6:40};}
/* Show on: станции и люди, на чьих экранах отчёт — вкладкой. Ставит
   администратор («я собираю для каждого»). */
function repOpenScreens(e){if(e)e.stopPropagation();const r=repOpenReport();if(!r)return;repMenu=Object.assign({kind:'screens',draft:JSON.parse(JSON.stringify(r.screens||{stations:[],people:[]}))},repAt(e));render();}
function repScreensToggle(kind,id,on){if(!repMenu)return;const l=repMenu.draft[kind]=(repMenu.draft[kind]||[]).filter(x=>x!==id);if(on)l.push(id);}
function repScreensApply(){const d=repMenu&&repMenu.draft;repMenu=null;if(!d)return;repEditCur(r=>{r.screens={stations:d.stations||[],people:d.people||[]};});}
function repOpenDate(e){if(e)e.stopPropagation();repMenu=Object.assign({kind:'date'},repAt(e));render();}
function repOpenCtl(e,f){if(e)e.stopPropagation();const r=repOpenReport();repMenu=Object.assign({kind:'ctl',f,draft:(repViewFilters(r)[f]||[]).slice(),search:''},repAt(e));render();}
function repCtlToggle(v,on){if(!repMenu)return;repMenu.draft=repMenu.draft.filter(x=>x!==v);if(on)repMenu.draft.push(v);}
function repCtlApply(){const r=repOpenReport(),m=repMenu;if(!r||!m)return;const base=Object.assign({},repViewFilters(r));if(m.draft.length)base[m.f]=m.draft.slice();else delete base[m.f];repViewSet(r.id,v=>{v.f=base;});repMenu=null;render();}
function repClearCtl(f){const r=repOpenReport();if(!r)return;const base=Object.assign({},repViewFilters(r));delete base[f];repViewSet(r.id,v=>{v.f=base;});render();}
/* В Edit кнопка Date — период самого отчёта (сохраняется по Save); в
   просмотре — свой период зрителя в этом браузере. Раньше и в Edit она
   меняла период зрителя, и Save его не сохранял. */
function repSetViewDate(d){const r=repOpenReport();if(!r)return;const date={preset:d.preset||'',from:d.from||'',to:d.to||''};
 if(repEditOn&&repDraft){repViewSet(r.id,v=>{delete v.date;});repMenu=null;repEditCur(x=>{x.date=date;});return;}
 repViewSet(r.id,v=>{v.date=date;});repMenu=null;render();}
function repResetView(){const r=repOpenReport();if(!r)return;repViewSet(r.id,v=>{delete v.date;delete v.f;delete v.s;});repMenu=null;render();}
function repSortClick(wid,by,i){
 const r=repOpenReport();if(!r)return;const w=r.pages.flatMap(p=>p.widgets).find(x=>x.id===wid);if(!w)return;
 const cur=repWidgetQuery(r,w).sort,same=cur&&cur.by===by&&(by==='label'||cur.i===i),dir=same?(cur.dir==='asc'?'desc':'asc'):by==='label'?'asc':'desc';
 repViewSet(r.id,v=>{v.s=v.s&&typeof v.s==='object'?v.s:{};v.s[wid]={by,i,dir};});render();
}
/* Export CSV (как в Looker: меню графика → Export): все строки и колонки,
   как в таблице, числа без форматирования, строка Total. */
function repCsvText(r,w){
 const q=repWidgetQuery(r,w),S=REP_SRC[q.source],res=repResultOf(q,repCtx());if(!S||!res)return '';
 const cell=v=>{const s=v==null?'':String(v);return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;},num=(m,v)=>v==null||!Number.isFinite(+v)?'':m.money?(+v).toFixed(2):String(+(+v).toFixed(6));
 const ms=res.metrics,d1=res.dims[0],d2=res.dims[1],rowDims=d1?[d1].concat(res.more||[]):[],lines=[];
 const keys2=d2?res.keys2:[],head=rowDims.map(d=>repDimLabel(S,d)).concat(d2?keys2.flatMap(b=>ms.map(m=>repKeyText(S,d2,b)+' · '+m.label)).concat(ms.map(m=>'Total · '+m.label)):ms.map(m=>m.label));
 lines.push(head);
 if(!d1)lines.push(ms.map((m,i)=>num(m,res.total[i])));
 else{
  res.keys.forEach(k=>{const parts=String(k).split('\u0002'),dims=rowDims.map((d,j)=>parts[j]==null?'':repKeyText(S,d,parts[j]));
   lines.push(dims.concat(d2?keys2.flatMap(b=>ms.map((m,i)=>num(m,(res.cells.get(k+'\u0001'+b)||[])[i]))).concat(ms.map((m,i)=>num(m,res.rowTotals.get(k)[i]))):ms.map((m,i)=>num(m,res.rowTotals.get(k)[i]))));});
  lines.push(['Total'].concat(rowDims.slice(1).map(()=>'')).concat(d2?keys2.flatMap(b=>ms.map((m,i)=>num(m,(res.colTotals.get(b)||[])[i]))).concat(ms.map((m,i)=>num(m,res.total[i]))):ms.map((m,i)=>num(m,res.total[i]))));
 }
 return lines.map(l=>l.map(cell).join(',')).join('\r\n')+'\r\n';
}
function repCsv(wid){
 const r=repOpenReport();if(!r)return;const w=r.pages.flatMap(p=>p.widgets).find(x=>x.id===wid);if(!w)return;
 const name=(r.name+' - '+repWidgetTitle(w)).replace(/[\\/:*?"<>|]+/g,' ').trim()+' '+finToday()+'.csv';
 storageDownload(name,['\ufeff'+readScope(()=>repCsvText(r,w))],'text/csv');
}
/* Save as default: свой период и фильтры становятся периодом и фильтрами отчёта. */
function repSaveDefaults(){const r=repOpenReport();if(!r||repDraft)return;const v=repView(r.id);if(repEditReport(r.id,x=>{if(v.date)x.date=v.date;if(v.f!==undefined)x.filters=v.f;}))repResetView();}

/* ------------------------------ Настройка графика ------------------------------ */
function repOpt(list,cur,none){return (none?`<option value="">${esc(none)}</option>`:'')+list.map(([k,l,t])=>`<option value="${esc(k)}"${k===cur?' selected':''}${t?` title="${esc(t)}"`:''}>${esc(l)}</option>`).join('');}
/* Что выбрано — одной строкой под списком. */
function repNoteOf(list,cur){const o=list.find(x=>x[0]===cur);return o&&o[2]?`<div class="hint" data-rep-note>${esc(o[2])}</div>`:'';}
function repSrcOptions(cur){return REP_GROUPS.map(g=>`<optgroup label="${esc(g)}">${Object.keys(REP_SRC).filter(k=>REP_SRC[k].group===g&&(repSourceAllowed(k)||k===cur)).map(k=>`<option value="${k}"${k===cur?' selected':''}>${esc(REP_SRC[k].label)}</option>`).join('')}</optgroup>`).join('');}
function repFilterRow(S,f,i){
 const fd=repField(S,f.f),ops=fd?REP_OPS[fd.type]||REP_OPS.text:REP_OPS.text,fields=repFields(S).map(x=>[x.k,x.label]);
 let val='';
 if(fd&&fd.type==='dim'&&(f.op==='in'||f.op==='notIn')){
  const sub={'@me':'Me (signed in)','@station':'This station'},left=['@me','@station'].concat(repFieldValues(S,f.f)).filter(x=>!f.v.includes(x));
  val=`<div class="rep-chips">${f.v.map((x,j)=>`<span class="rep-chip"><span data-raw>${esc(sub[x]||x)}</span><button type="button" onclick="repFilterDelVal(${i},${j})">×</button></span>`).join('')}<select aria-label="Add value" onchange="if(this.value)repFilterAddVal(${i},this.value)"><option value="">+ value</option>${left.map(x=>`<option value="${esc(x)}">${esc(sub[x]||x)}</option>`).join('')}</select></div>`;
 }else if(f.op==='between')val=`<div class="sl-row"><input type="${fd&&fd.type==='date'?'date':'number'}" value="${esc(f.v[0]||'')}" onchange="repSetFilter(${i},'v0',this.value)"><input type="${fd&&fd.type==='date'?'date':'number'}" value="${esc(f.v[1]||'')}" onchange="repSetFilter(${i},'v1',this.value)"></div>`;
 else val=`<input type="${fd&&fd.type==='num'?'number':'text'}" value="${esc(f.v[0]||'')}" onchange="repSetFilter(${i},'v0',this.value)">`;
 return `<div class="rep-filter-row"><div class="sl-row"><select aria-label="Field" onchange="repSetFilter(${i},'f',this.value)">${repOpt(fields,f.f)}</select><select aria-label="Condition" onchange="repSetFilter(${i},'op',this.value)">${repOpt(ops,f.op)}</select><button type="button" class="sm dl" onclick="repDelFilter(${i})">×</button></div>${val}</div>`;
}
function repSetup(r){
 const w=repSelWidget(r);if(!w)return `<div class="card rep-setup"><h3>Chart setup</h3><p class="mut">Click a chart to set it up, or add a new one.</p><button type="button" class="pri" onclick="repAddWidget()">+ Add chart</button></div>`;
 const S=REP_SRC[w.q.source],q=w.q,dims=repDimOptions(S),mets=repMetricOptions(S),dates=repDates(S),cmp=[['','No comparison'],['prev','Previous period'],['year','Same period last year']];
 const sortOpts=[['','Default']].concat([['label:asc','Name A → Z'],['label:desc','Name Z → A']]).concat(q.metrics.flatMap((k,i)=>{const m=repMetric(S,k);return m?[['metric:'+i+':desc',m.label+' · high → low'],['metric:'+i+':asc',m.label+' · low → high']]:[];}));
 const sortCur=!q.sort?'':q.sort.by==='label'?'label:'+q.sort.dir:'metric:'+q.sort.i+':'+q.sort.dir;
 const dateCur=q.date.use!=='own'?'report':q.date.from||q.date.to?'custom':q.date.preset||'all';
 return `<div class="card rep-setup" data-rep-setup><div class="rep-setup-head"><h3>Chart setup</h3><button type="button" class="sm" onclick="repSelW='';render()">Close</button></div>
  <h5>Chart type</h5><div class="rep-types">${REP_TYPES.map(([k,l])=>`<button type="button" class="${w.type===k?'on':''}" data-rep-type-btn="${k}" onclick="repSetW('type','${k}')">${l}</button>`).join('')}</div>
  <h5>Title</h5><input type="text" value="${esc(w.title)}" placeholder="${esc(repWidgetTitle(Object.assign({},w,{title:''})))}" onchange="repSetW('title',this.value)">
  <h5>Data</h5><select data-rep-source onchange="repSetSource(this.value)">${repSrcOptions(q.source)}</select><div class="hint">${esc(S.hint||'')}</div>
  <h5>Dimension</h5><select data-rep-dim="0" onchange="repSetDim(0,this.value)">${repOpt(dims,q.dims[0]||'','None — totals only')}</select>${repNoteOf(dims,q.dims[0]||'')}${repMoreHTML(w,S)}
  ${w.type==='combo'?'<div class="hint" data-rep-combo>First metric — column; second — inner column.</div>':''}${w.type!=='number'&&w.type!=='pie'&&w.type!=='combo'?`<h5>Breakdown</h5><select data-rep-dim="1" onchange="repSetDim(1,this.value)">${repOpt(dims.filter(d=>d[0]!==q.dims[0]),q.dims[1]||'','None')}</select>${q.dims[1]&&w.type!=='table'&&q.metrics.length>1?'<div class="hint" data-rep-first-metric>Chart shows the first metric; Table shows all.</div>':''}`:''}
  <h5>Metrics</h5>${(q.metrics.length?q.metrics:[S.metrics[0].k]).map((k,i)=>{const c=repCalcParse(k),del=q.metrics.length>1?`<button type="button" class="sm dl" onclick="repDelMetric(${i})">×</button>`:'';
   if(!c)return `<div class="sl-row"><select data-rep-metric="${i}" onchange="repSetMetric(${i},this.value)">${repOpt(mets,k)}</select>${del}</div>${repNoteOf(mets,k)}`;
   const num=/^n:/.test(c.b);
   return `<div class="rep-calc" data-rep-calc="${i}"><div class="sl-row"><select aria-label="First metric" onchange="repSetCalc(${i},'a',this.value)">${repOpt(mets,c.a)}</select>${del}</div><div class="sl-row"><select aria-label="Operation" onchange="repSetCalc(${i},'op',this.value)">${repOpt(REP_CALC_OPS,c.op)}</select><select aria-label="Second metric or number" onchange="repSetCalc(${i},'b',this.value)">${repOpt([['n:','Number']].concat(mets),num?'n:':c.b)}</select>${num?`<input type="number" step="any" aria-label="Number" value="${esc(c.b.slice(2))}" onchange="repSetCalc(${i},'n',this.value)">`:''}</div></div>`;}).join('')}
  <div class="sl-row"><button type="button" class="sl-btn" data-rep-add-metric onclick="repAddMetric()">+ Add metric</button><button type="button" class="sl-btn" data-rep-add-calc onclick="repAddCalc()" title="Metric ÷ × + − another metric or a number">+ Calculated</button></div>
  ${repCustomHTML(r,S,q)}
  <h5>Filter</h5>${q.filters.map((f,i)=>repFilterRow(S,f,i)).join('')}<button type="button" class="sl-btn" data-rep-add-filter onclick="repAddFilter()">+ Add filter</button>
  ${(q.having||[]).map((h,i)=>repHavingRow(mets,h,i)).join('')}<button type="button" class="sl-btn" data-rep-add-having onclick="repAddHaving()" title="Keep rows whose value fits">+ Metric filter</button>
  <h5>Date range</h5>${dates.length>1?`<select aria-label="Date field" onchange="repSetW('date.f',this.value)">${repOpt(dates.map(k=>[k,repField(S,k).label]),q.date.f||dates[0])}</select>`:''}
  <select data-rep-date-use onchange="repSetDateUse(this.value)">${repOpt([['report','Report period']].concat(REP_PRESETS).concat([['custom','Custom dates']]),dateCur)}</select>
  ${dateCur==='custom'?`<div class="sl-row"><input type="date" value="${esc(q.date.from)}" onchange="repSetW('date.from',this.value)"><input type="date" value="${esc(q.date.to)}" onchange="repSetW('date.to',this.value)"></div>`:''}
  <select data-rep-compare onchange="repSetW('compare',this.value)">${repOpt(cmp,q.compare||'')}</select>
  <h5>Sort · rows</h5><select data-rep-sort onchange="repSetSort(this.value)">${repOpt(sortOpts,sortCur)}</select>
  <div class="sl-row"><label class="rep-inline">Top <input type="number" min="0" step="1" value="${q.limit||''}" placeholder="all" onchange="repSetW('limit',this.value)"></label><label class="rep-inline"><input type="checkbox" ${q.other?'checked':''} onchange="repSetW('other',this.checked)"> Other row</label></div>
  <h5>Layout</h5><div class="sl-row"><select aria-label="Width" onchange="repSetW('width',this.value)">${repOpt([['full','Full width'],['half','Half width']],w.width)}</select>${w.type==='table'?`<label class="rep-inline"><input type="checkbox" ${w.opts.totals?'checked':''} onchange="repSetW('opts.totals',this.checked)"> Totals</label>`:''}</div></div>`;
}

/* ------------------------------ Команды экрана ------------------------------ */
function repOpen(id){const r=repFind(id);if(!r||!repCanLeave())return;repDropDraft();repOpenId=id;repPageId=r.pages[0].id;repRecentAdd(id);const p=repFolderPath(r);repFolderOpen=p[0];repSubOpen=p[1]?p[0]+' / '+p[1]:'';render();}
function repStartDraft(r){repDraft=JSON.parse(JSON.stringify(r));repDraftBase=repFind(r.id)?JSON.stringify(repDraft):'';repOpenId=r.id;repPageId=repDraft.pages[0].id;repEditOn=true;repSelW='';repMenu=null;}
function repNew(){if(!repCanLeave())return;repDropDraft();const r=repBlank(repSubOpen||repFolderOpen||'');repStartDraft(r);repSelW=r.pages[0].widgets[0].id;render();}
function repCopyOpen(){const src=repOpenReport();if(!src||!repCanLeave())return;const r=repCopyOf(src);repDropDraft();repStartDraft(r);render();}
function repEditToggle(){const r=repFind(repOpenId);if(!r||!repCanEdit(r))return;repStartDraft(r);render();}
function repSaveEdit(){if(!repDraft)return;const saved=repSave(repDraft);if(!saved)return;repDropDraft();repOpenId=saved.id;render();}
function repCancelEdit(){if(!repDraft||!repCanLeave())return;const kept=repFind(repDraft.id);repDropDraft();if(!kept)repOpenId='';render();}
function repDeleteOpen(){const r=repOpenReport();if(!r)return;if(!repFind(r.id)){repDropDraft();repOpenId='';render();return;}if(!confirm('Delete report "'+r.name+'"?'))return;if(repDelete(r.id)){repDropDraft();repOpenId='';render();}}
/* Правка черновика: изменения только в памяти до Save. */
function repEditCur(fn){if(!repDraft)return;fn(repDraft);Object.assign(repDraft,repClean(repDraft));render();}
function repWEdit(fn){const id=repSelW;repEditCur(r=>{r.pages.forEach(p=>p.widgets.forEach(w=>{if(w.id===id)fn(w);}));});}
function repSetW(path,v){repWEdit(w=>{
 const p=path.split('.');
 if(p[0]==='type'||p[0]==='title'||p[0]==='width')w[p[0]]=v;
 else if(p[0]==='opts')w.opts[p[1]]=v;
 else if(p[0]==='date'){w.q.date[p[1]]=v;}
 else if(p[0]==='limit')w.q.limit=Math.max(0,Math.floor(+v||0));
 else if(p[0]==='other')w.q.other=!!v;
 else if(p[0]==='compare')w.q.compare=v;
 if(w.type==='number'||w.type==='pie'||w.type==='combo')w.q.dims=w.type==='number'?[]:w.q.dims.slice(0,1);
 /* Combo — два показателя: второй добавляется сам. */
 if(w.type==='combo'&&w.q.metrics.length<2){const S=REP_SRC[w.q.source],have=w.q.metrics.length?w.q.metrics:[S.metrics[0].k],next=S.metrics.find(x=>!have.includes(x.k));w.q.metrics=have.concat(next?[next.k]:[]);}
});}
function repSetSource(k){const S=REP_SRC[k];if(!S)return;repWEdit(w=>{w.q.source=k;w.q.filters=[];w.q.metrics=[S.metrics[0].k];w.q.dims=w.type==='number'?[]:[repDimOptions(S)[0][0]];w.q.sort=null;w.q.date.f='';});}
/* Ещё измерения строк таблицы (как в Looker): «+ Row dimension». */
function repMoreHTML(w,S){
 const q=w.q,d0=q.dims[0];if(w.type!=='table'||!d0||repIsTime(S,d0))return '';
 const opts=repDimOptions(S).filter(d=>!d[0].includes(':')&&d[0]!==d0),more=q.more||[],free=opts.find(d=>!more.includes(d[0]));
 return more.map((d,i)=>`<div class="sl-row"><select aria-label="Row dimension" data-rep-more="${i}" onchange="repSetMore(${i},this.value)">${repOpt(opts,d)}</select><button type="button" class="sm dl" onclick="repSetMore(${i},'')">×</button></div>`).join('')
  +(free&&more.length<8?`<button type="button" class="sl-btn" data-rep-add-row onclick="repSetMore(${more.length},'${esc(free[0])}')">+ Row dimension</button>`:'');
}
function repSetMore(i,v){repWEdit(w=>{const m=(w.q.more||[]).slice();if(v)m[i]=v;else m.splice(i,1);w.q.more=m.filter(Boolean);w.q.sort=null;});}
/* ------------------------- Свои показатели ------------------------- */
/* Владелец, 03.11.2026: «кастомный показатель — ввожу название и что отнять
   или что на что поделить, и у меня моя личная формула». Показатель живёт в
   отчёте (r.custom) и стоит в списке Metrics у всех графиков этого источника. */
let repCm=null;
function repCustomHTML(r,S,q){
 const src=repSrcKey(S),mine=(r.custom||[]).filter(c=>c.source===src);
 const list=mine.map(c=>`<div class="rep-cm" data-rep-cm="${esc(c.id)}"><b data-raw>${esc(c.name)}</b><span class="rep-cm-acts"><button type="button" class="sm" onclick="repCmOpen('${esc(c.id)}')">Edit</button><button type="button" class="sm dl" title="Delete" onclick="repCmDel('${esc(c.id)}')">×</button></span><code data-raw>${esc(c.formula)}</code></div>`).join('');
 if(!repCm||repCm.source!==src)return list+`<button type="button" class="sl-btn" data-rep-cm-new onclick="repCmOpen('')" title="Your own metric by formula">+ Custom metric</button>`;
 /* Поле вставляется с выбранной функцией (как в Looker: Field as Sum, Count…);
    Auto — число суммой, текст — COUNT_DISTINCT. Метрика источника — как есть. */
 const f=repFields(S).filter(x=>x.type==='num'||x.type==='dim'||x.type==='text'),as=repCm.as||'auto',wrap=x=>{const t='['+x.label+']',fn=as==='auto'?(x.type==='num'?'':'COUNT_DISTINCT'):x.type!=='num'&&['SUM','AVG','MIN','MAX'].includes(as)?'COUNT_DISTINCT':as;return fn?fn+'('+t+')':t;};
 const tip=n=>`title="${esc(n)}" data-n="${esc(n)}" onmouseover="repCmTip(this)" onfocus="repCmTip(this)"`;
 const chips=f.map(x=>`<button type="button" class="sm" onclick="repCmInsert(this.dataset.t)" data-t="${esc(wrap(x))}" ${tip(repFieldNote(x)+' → '+wrap(x))}>${esc(x.label)}</button>`).join('')+(S.metrics||[]).filter(m=>!f.some(x=>x.label===m.label)).map(m=>`<button type="button" class="sm" onclick="repCmInsert(this.dataset.t)" data-t="${esc('['+m.label+']')}" ${tip(repMetricNote(S,m))}>${esc(m.label)}</button>`).join('');
 const asSel=`<div class="sl-row"><label class="rep-inline">Field as <select aria-label="Field as" data-rep-cm-as onchange="repCm.as=this.value;render()">${repOpt([['auto','Auto'],['SUM','Sum'],['AVG','Average'],['MIN','Min'],['MAX','Max'],['COUNT','Count'],['COUNT_DISTINCT','Count distinct']],as)}</select></label></div>`;
 const fns=REP_FORMULA_FUNCS.map(fn=>`<button type="button" class="sm" onclick="repCmInsert('${fn}(')">${fn}</button>`).join('')+['+','−','×','÷','(',')'].map(o=>`<button type="button" class="sm" onclick="repCmInsert(' ${{'−':'-','×':'*','÷':'/'}[o]||o} ')">${o}</button>`).join('');
 return list+`<div class="rep-calc" data-rep-cm-edit><input type="text" id="repCmName" placeholder="Name, e.g. Waste %" value="${esc(repCm.name)}" oninput="repCm.name=this.value">
  <textarea id="repCmFormula" class="rep-formula" placeholder="[Waste ft²] / [Sheet ft²] * 100" oninput="repCm.formula=this.value;repCmCheck()">${esc(repCm.formula)}</textarea>
  <div data-rep-cm-msg class="${repCmMsg().ok?'rep-formula-ok':'rep-formula-err'}">${esc(repCmMsg().text)}</div>
  <div class="rep-fchips">${fns}</div>${asSel}<div class="rep-fchips">${chips}</div><div class="hint" data-rep-cm-tip>Point at a field to see what it is.</div>
  <div class="sl-row"><select aria-label="Format" onchange="repCm.fmt=this.value">${repOpt([['number','Number'],['money','Money'],['pct','Percent']],repCm.fmt)}</select><select aria-label="Decimals" onchange="repCm.digits=+this.value">${repOpt([0,1,2,3].map(n=>[String(n),n+' decimals']),String(repCm.digits))}</select></div>
  <div class="sl-row"><button type="button" class="pri sm" data-rep-cm-save onclick="repCmSave()">Save metric</button><button type="button" class="sm" onclick="repCm=null;render()">Cancel</button></div></div>`;
}
function repCmSource(){const r=repOpenReport(),w=r&&repSelWidget(r);return w?w.q.source:'';}
function repCmOpen(id){const r=repOpenReport(),c=id&&(r.custom||[]).find(x=>x.id===id);repCm=c?Object.assign({},c):{id:'',name:'',formula:'',fmt:'number',digits:1,source:repCmSource()};render();}
function repCmMsg(){
 if(!repCm||!repCm.formula.trim())return {ok:false,text:'Type a formula: fields in [ ], + − × ÷, SUM, AVG, COUNT_DISTINCT…'};
 const r=repOpenReport(),S=REP_SRC[repCm.source],p=repFormulaParse(repCm.formula,S,(r.custom||[]).filter(c=>c.source===repCm.source&&c.id!==repCm.id));
 return p.error?{ok:false,text:p.error}:{ok:true,text:'Formula is OK'};
}
function repCmCheck(){const el=document.querySelector('[data-rep-cm-msg]');if(!el)return;const m=repCmMsg();el.textContent=m.text;el.className=m.ok?'rep-formula-ok':'rep-formula-err';}
function repCmTip(el){const t=document.querySelector('[data-rep-cm-tip]');if(t)t.textContent=el.dataset.n;}
function repCmInsert(t){const el=document.getElementById('repCmFormula');if(!el||!repCm)return;const a=el.selectionStart??el.value.length,b=el.selectionEnd??a;el.setRangeText(t,a,b,'end');repCm.formula=el.value;el.focus();repCmCheck();}
function repCmSave(){
 const c=repCm;if(!c)return;const name=String(c.name||'').trim();if(!name){alert('Name the metric.');return;}if(!repCmMsg().ok){alert(repCmMsg().text);return;}
 const r=repOpenReport();if((r.custom||[]).some(x=>x.id!==c.id&&x.source===c.source&&x.name.toLowerCase()===name.toLowerCase())){alert('A metric with this name already exists.');return;}
 const id=c.id||repUid('CM'),isNew=!c.id;repCm=null;
 repEditCur(x=>{x.custom=(x.custom||[]).filter(y=>y.id!==id).concat([{id,name,formula:c.formula,source:c.source,fmt:c.fmt,digits:c.digits}]);});
 if(isNew)repWEdit(w=>{if(w.q.source===c.source){const m=w.q.metrics.length?w.q.metrics:[REP_SRC[w.q.source].metrics[0].k];w.q.metrics=m.concat(['cm:'+id]);}});
}
function repCmDel(id){
 const r=repOpenReport(),c=(r.custom||[]).find(x=>x.id===id);if(!c||!confirm('Delete metric "'+c.name+'"?'))return;
 repEditCur(x=>{x.custom=(x.custom||[]).filter(y=>y.id!==id);x.pages.forEach(p=>p.widgets.forEach(w=>{w.q.metrics=w.q.metrics.filter(k=>k!=='cm:'+id);w.q.having=(w.q.having||[]).filter(h=>h.m!=='cm:'+id);}));});
}
/* Фильтр по показателю: строка графика остаётся, если её значение подходит. */
function repHavingRow(mets,h,i){
 return `<div class="rep-filter-row" data-rep-having="${i}"><div class="sl-row"><select aria-label="Metric" onchange="repSetHaving(${i},'m',this.value)">${repOpt(mets,h.m)}</select><select aria-label="Condition" onchange="repSetHaving(${i},'op',this.value)">${repOpt(REP_HAVING_OPS,h.op)}</select><button type="button" class="sm dl" onclick="repSetHaving(${i},'del')">×</button></div>
  <div class="sl-row"><input type="number" step="any" aria-label="Value" value="${esc(h.v[0]??'')}" onchange="repSetHaving(${i},'v0',this.value)">${h.op==='between'?`<input type="number" step="any" aria-label="To" value="${esc(h.v[1]??'')}" onchange="repSetHaving(${i},'v1',this.value)">`:''}</div></div>`;
}
function repAddHaving(){repWEdit(w=>{const m=w.q.metrics[0]||REP_SRC[w.q.source].metrics[0].k;w.q.having=(w.q.having||[]).concat([{m,op:'lt',v:['']}]);});}
function repSetHaving(i,k,v){repWEdit(w=>{const h=(w.q.having||[])[i];if(!h)return;if(k==='del'){w.q.having.splice(i,1);return;}if(k==='m')h.m=v;else if(k==='op')h.op=v;else if(k==='v0')h.v[0]=v===''?'':+v;else if(k==='v1')h.v[1]=v===''?'':+v;});}
function repSetDim(i,v){repWEdit(w=>{const d=w.q.dims.slice();d[i]=v;w.q.dims=d.filter(Boolean);if(w.q.dims[0]===w.q.dims[1])w.q.dims.length=1;w.q.sort=null;});}
function repSetMetric(i,v){repWEdit(w=>{const m=w.q.metrics.length?w.q.metrics.slice():[REP_SRC[w.q.source].metrics[0].k];m[i]=v;w.q.metrics=m;});}
function repAddMetric(){repWEdit(w=>{const S=REP_SRC[w.q.source],have=w.q.metrics.length?w.q.metrics:[S.metrics[0].k],next=S.metrics.find(m=>!have.includes(m.k));w.q.metrics=have.concat(next?[next.k]:[]);});}
/* Вычисляемая метрика: первая метрика ÷ вторая (или число) — по умолчанию. */
function repAddCalc(){repWEdit(w=>{const S=REP_SRC[w.q.source],have=w.q.metrics.length?w.q.metrics:[S.metrics[0].k],a=have.find(k=>!repCalcParse(k))||S.metrics[0].k,b=S.metrics.find(m=>m.k!==a);w.q.metrics=have.concat([repCalcKey(a,'div',b?b.k:'n:1')]);});}
function repSetCalc(i,part,v){repWEdit(w=>{const c=repCalcParse(w.q.metrics[i]);if(!c)return;if(part==='a')c.a=v;else if(part==='op')c.op=v;else if(part==='b')c.b=v==='n:'?'n:1':v;else if(part==='n')c.b='n:'+(Number.isFinite(+v)?+v:1);w.q.metrics[i]=repCalcKey(c.a,c.op,c.b);});}
function repDelMetric(i){repWEdit(w=>{w.q.metrics.splice(i,1);w.q.sort=null;});}
function repAddFilter(){repWEdit(w=>{const S=REP_SRC[w.q.source],f=repFields(S).find(x=>x.type==='dim');if(f)w.q.filters.push({f:f.k,op:'in',v:[]});});}
function repDelFilter(i){repWEdit(w=>{w.q.filters.splice(i,1);});}
function repSetFilter(i,key,v){repWEdit(w=>{const f=w.q.filters[i];if(!f)return;const S=REP_SRC[w.q.source];
 if(key==='f'){const fd=repField(S,v);f.f=v;f.op=fd?(REP_OPS[fd.type]||REP_OPS.text)[0][0]:'contains';f.v=[];}
 else if(key==='op'){f.op=v;f.v=[];}else if(key==='v0')f.v[0]=v;else if(key==='v1'){f.v[0]=f.v[0]||'';f.v[1]=v;}});}
function repFilterAddVal(i,v){repWEdit(w=>{const f=w.q.filters[i];if(f&&!f.v.includes(v))f.v.push(v);});}
function repFilterDelVal(i,j){repWEdit(w=>{const f=w.q.filters[i];if(f)f.v.splice(j,1);});}
function repSetDateUse(v){repWEdit(w=>{if(v==='report'){w.q.date.use='report';}else{w.q.date.use='own';if(v==='custom'){w.q.date.preset='';w.q.date.from=w.q.date.from||finToday();w.q.date.to=w.q.date.to||finToday();}else{w.q.date.preset=v;w.q.date.from='';w.q.date.to='';}}});}
function repSetSort(v){repWEdit(w=>{if(!v){w.q.sort=null;return;}const p=v.split(':');w.q.sort=p[0]==='label'?{by:'label',i:0,dir:p[1]}:{by:'metric',i:+p[1],dir:p[2]};});}
function repSelectWidget(id){repSelW=id;render();}
function repAddWidget(){let id='';repEditCur(r=>{const p=r.pages.find(x=>x.id===repPageId)||r.pages[0],last=p.widgets[p.widgets.length-1],src=last?last.q.source:'glass',S=REP_SRC[src];
 const w=repCleanWidget({type:'columns',q:{source:src,dims:[repDimOptions(S).find(d=>/:day$/.test(d[0]))?.[0]||repDimOptions(S)[0][0]],metrics:[S.metrics[0].k]}});id=w.id;p.widgets.push(w);});repSelW=id;render();}
function repDupWidget(wid){let nid='';repEditCur(r=>{r.pages.forEach(p=>{const i=p.widgets.findIndex(w=>w.id===wid);if(i<0)return;const c=repCleanWidget(JSON.parse(JSON.stringify(p.widgets[i])));c.id=repUid('W');nid=c.id;p.widgets.splice(i+1,0,c);});});repSelW=nid;render();}
function repDelWidget(wid){repEditCur(r=>{r.pages.forEach(p=>{p.widgets=p.widgets.filter(w=>w.id!==wid);});});if(repSelW===wid)repSelW='';render();}
function repMoveWidget(wid,d){repEditCur(r=>{r.pages.forEach(p=>{const i=p.widgets.findIndex(w=>w.id===wid),j=i+d;if(i<0||j<0||j>=p.widgets.length)return;const x=p.widgets[i];p.widgets[i]=p.widgets[j];p.widgets[j]=x;});});}
function repAddPage(){let id='';repEditCur(r=>{const p={id:repUid('PG'),name:'Page '+(r.pages.length+1),widgets:[]};id=p.id;r.pages.push(p);});repPageId=id;repSelW='';render();}
function repDelPage(){const r=repOpenReport();if(!r||r.pages.length<2||!confirm('Delete this page and its charts?'))return;const pid=repPage(r).id;repEditCur(x=>{x.pages=x.pages.filter(p=>p.id!==pid);});repPageId='';render();}
function repSetOrient(v){const pid=repPage(repOpenReport()).id;repEditCur(r=>{const p=r.pages.find(x=>x.id===pid);if(p)p.orient=v==='landscape'?'landscape':'portrait';});}
function repRenamePage(v){const pid=repPage(repOpenReport()).id;repEditCur(r=>{const p=r.pages.find(x=>x.id===pid);if(p)p.name=String(v||'').trim()||p.name;});}
function repMovePage(d){const r=repOpenReport(),pid=repPage(r).id;repEditCur(x=>{const i=x.pages.findIndex(p=>p.id===pid),j=i+d;if(i<0||j<0||j>=x.pages.length)return;const t=x.pages[i];x.pages[i]=x.pages[j];x.pages[j]=t;});}
function repSetMeta(k,v){repEditCur(r=>{if(k==='name')r.name=String(v||'').trim()||r.name;if(k==='folder')r.folder=String(v||'').trim();if(k==='share')r.share=v==='all'?'all':'me';if(k==='date')r.date={preset:v,from:'',to:''};});}
function repAddControl(f){repEditCur(r=>{if(!r.controls.includes(f))r.controls.push(f);});}
function repDelControl(f){repEditCur(r=>{r.controls=r.controls.filter(x=>x!==f);});}

/* ------------------------------ Печать ------------------------------ */
/* Владелец, 03.11.2026: «печать — один лист, одна страница; нужно две — сделаю
   две страницы»; «нужно горизонтально — горизонтально». Print печатает все
   страницы отчёта, каждую на свой лист Letter в её ориентации (page.orient):
   то, что видно на экране, уменьшенное под лист (repPrintFit). Страница с
   архивом или долгим расчётом сначала открывается и досчитывается. */
/* Лист Letter в px (96 на дюйм) без полей 9 мм; запас — раскладка печати чуть выше экранной. */
const REP_SHEET={portrait:[816,1056],landscape:[1056,816]},REP_SHEET_PAD=68,REP_SHEET_SPARE=0.94;
function repPrintPageHTML(r,p){
 const v=repView(r.id),now=new Date(),filters=Object.entries(v.f||{}).filter(([f,x])=>x&&x.length).map(([f,x])=>(repControlFields(r).get(f)||f)+': '+x.join(', '));
 const body=p.widgets.map((w,i)=>repWidgetCard(r,w,i,p.widgets.length)).join('');
 return `<div class="rep-print" data-rep-orient="${esc(p.orient||'portrait')}"><div class="rep-print-head"><h2 data-raw>${esc(r.name)}${r.pages.length>1?' · '+esc(p.name):''}</h2><div>${esc(['Date: '+repDateText(v.date||r.date)].concat(filters).join(' · '))}</div><small>Glass Farm · printed ${esc(now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))} ${esc(now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}))}</small></div><div class="rep-ws">${body}</div></div>`;
}
/* Лист раскладывается той же ширины, что отчёт на экране (repPrintW), и
   уменьшается под ширину листа: граница листа в Edit (repSheetMark) — там же,
   где на бумаге. Ниже границы не влезло — лист уменьшается ещё (zoom). */
let repPrintW=0;
function repPrintFit(el){
 const x=el.querySelector('.rep-print');if(!x)return;const land=x.dataset.repOrient==='landscape',[W,H]=REP_SHEET[land?'landscape':'portrait'],w=repPrintW||W-REP_SHEET_PAD;
 el.classList.add(land?'rep-land':'rep-port');x.style.width=w+'px';x.style.zoom='';
 const h=x.scrollHeight,z=Math.min((W-REP_SHEET_PAD)/w,(H-REP_SHEET_PAD)*REP_SHEET_SPARE/Math.max(1,h));x.style.zoom=String(Math.floor(z*1000)/1000);
}
/* Граница печатного листа в Edit (владелец, 03.11.2026: «чтобы я понимал, как
   расположить данные на печатный лист»): пунктир на высоте листа при ширине
   отчёта; высота — через padding в процентах от ширины, минус шапка листа. */
const REP_PRINT_HEAD=76;
function repSheetMark(p){
 const [W,H]=REP_SHEET[p.orient==='landscape'?'landscape':'portrait'],pct=((H-REP_SHEET_PAD)*REP_SHEET_SPARE/(W-REP_SHEET_PAD)*100).toFixed(2);
 return `<div class="rep-sheet-mark" aria-hidden="true" data-rep-sheet style="padding-top:calc(${pct}% - ${REP_PRINT_HEAD}px)"><span>End of sheet · ${p.orient==='landscape'?'Landscape':'Portrait'}</span></div>`;
}
let repPrintBusy=false;
async function repPrint(){
 const r0=repOpenReport();if(!r0||repPrintBusy)return false;
 const was={page:repPageId,edit:repEditOn},sheets=[],ws=document.querySelector('.rep-main .rep-ws');repPrintW=ws?ws.clientWidth:0;repPrintBusy=true;repEditOn=false;repMenu=null;
 try{
  for(const p of r0.pages){
   repPageId=p.id;render();
   for(let i=0;i<6000&&document.querySelector('[data-rep-archive-wait]');i++)await new Promise(res=>setTimeout(res,50));
   const r=repOpenReport();sheets.push(readScope(()=>repPrintPageHTML(r,repPage(r))));
  }
 }finally{repPageId=was.page;repEditOn=was.edit;repPrintBusy=false;render();}
 return printSheet(sheets,'',repPrintFit);
}
function repPrintHTML(){const r=repOpenReport();return r?repPrintPageHTML(r,repPage(r)):'';}

/* Отчёт на чужом экране — Board станции или Overview человека: страницы и
   графики, без правки и фильтров; подстановки — станция и человек экрана. */
let repScreenPage={};
function repScreenHTML(r,ctx){
 const was=repCtxOverride,wasEdit=repEditOn,wasC=[repCustomCur,repColorsCur];repCtxOverride=ctx;repEditOn=false;repCustomCur=r.custom||[];repColorsCur=r.colors||{};
 try{
  const p=r.pages.find(x=>x.id===repScreenPage[r.id])||r.pages[0],tabs=r.pages.length>1?`<div class="tabs rep-pages">${r.pages.map(x=>`<button type="button" class="${x.id===p.id?'on':''}" data-rep-screen-page="${esc(x.id)}" onclick="repScreenPage[this.dataset.rid]=this.dataset.repScreenPage;render()" data-rid="${esc(r.id)}">${esc(x.name)}</button>`).join('')}</div>`:'';
  return `<div class="rep-screen" data-rep-screen="${esc(r.id)}">${tabs}<div class="mut small rep-screen-period">${esc(repDateText(r.date))}</div><div class="rep-ws">${p.widgets.map((w,i)=>repWidgetCard(r,w,i,p.widgets.length)).join('')}</div></div>`;
 }finally{repCtxOverride=was;repEditOn=wasEdit;[repCustomCur,repColorsCur]=wasC;}
}
/* Вкладки экрана: «Now» — встроенный экран, дальше — назначенные отчёты. */
function repScreenTabs(reps,cur,setter){return `<div class="rep-screen-tabs tabs" data-rep-screen-tabs>${[['','Now']].concat(reps.map(r=>[r.id,r.name])).map(([id,n])=>`<button type="button" class="${id===cur?'on':''}" data-rep-screen-tab="${esc(id)}" onclick="${setter}(this.dataset.repScreenTab)">${esc(n)}</button>`).join('')}</div>`;}

/* Периоды страницы для архива (erp/archive): у каждого графика свой отрезок и
   отрезок сравнения. Дыры между ними не читаются: Today со сравнением «год
   назад» — два дня, а не год. «Всё время» — без границ. */
function repArchiveRanges(r,p){
 const list=[];
 p.widgets.forEach(w=>{const q=repWidgetQuery(r,w),S=REP_SRC[q.source];if(!S||S.now||!REP_ARCH_SRC[q.source]||!repDates(S).length)return;
  const range=repRange(q.date)||['',''];list.push(range);const c=repCompareRange(range,q.compare);if(c)list.push(c);});
 return list.length?list:null;
}
/* ------------------------------ Экран ------------------------------ */
function repMain(r){
 if(!r)return `<div class="card rep-empty" data-rep-empty><h3>Pick a report</h3><p class="mut">Choose one on the left, or start a new one. Every chart can be changed: data, type, dimensions, metrics, filters, period.</p><button type="button" class="pri" onclick="repNew()">+ New report</button></div>`;
 const can=repEditOn||repCanEdit(repFind(r.id)),p=repPage(r),n=p.widgets.length,folders=[...new Set((DB.report||[]).map(x=>x.folder).filter(Boolean))];
 const head=repEditOn?`<div class="rep-title-edit"><input type="text" data-rep-name value="${esc(r.name)}" aria-label="Report name" onchange="repSetMeta('name',this.value)"><input type="text" list="repFolders" value="${esc(r.folder)}" placeholder="Folder" aria-label="Folder" onchange="repSetMeta('folder',this.value)"><datalist id="repFolders">${folders.map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
   <select aria-label="Who sees it" onchange="repSetMeta('share',this.value)">${repOpt([['me','Only me'],['all','Everyone with Reports']],r.share==='all'?'all':'me')}</select>${repCanScreens()?`<button type="button" class="sm" data-rep-screens onclick="repOpenScreens(event)" title="Station boards and people's Overview">Show on${(r.screens.stations.length+r.screens.people.length)?' · '+(r.screens.stations.length+r.screens.people.length):''}</button>`:''}</div>`
  :`<h2 class="rep-title" data-raw>${esc(r.name)}</h2>`;
 const dirty=repDirty(),saved=!!repFind(r.id);
 const acts=repEditOn?`${dirty?'<span class="mut small" data-rep-unsaved>Unsaved changes</span>':''}<button type="button" class="pri sm" data-rep-save onclick="repSaveEdit()">Save</button><button type="button" class="sm" data-rep-cancel onclick="repCancelEdit()">Cancel</button><button type="button" class="sm" data-rep-print onclick="repPrint()">Print</button>${saved?`<button type="button" class="sm dl" onclick="repDeleteOpen()">Delete</button>`:''}`
  :`${saved?`<button type="button" class="sm rep-pin${repPinned(r.id)?' on':''}" data-rep-pin="${esc(r.id)}" title="${repPinned(r.id)?'Unpin':'Pin'}" aria-label="${repPinned(r.id)?'Unpin':'Pin'}" onclick="repPinToggle(this.dataset.repPin)">${repPinned(r.id)?'★':'☆'}</button>`:''}${repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-edit onclick="repEditToggle()">Edit</button>`:''}<button type="button" class="sm" data-rep-copy onclick="repCopyOpen()">Copy</button><button type="button" class="sm" data-rep-print onclick="repPrint()">Print</button>`;
 const tabs=`<div class="tabs rep-pages">${r.pages.map(x=>`<button type="button" class="${x.id===p.id?'on':''}" data-rep-page="${esc(x.id)}" onclick="repPageId=this.dataset.repPage;repSelW='';render()">${esc(x.name)}</button>`).join('')}${repEditOn?`<button type="button" onclick="repAddPage()">+ Page</button>`:''}</div>
  ${repEditOn?`<div class="rep-page-edit"><input type="text" value="${esc(p.name)}" aria-label="Page name" onchange="repRenamePage(this.value)"><select aria-label="Print" data-rep-orient onchange="repSetOrient(this.value)">${repOpt([['portrait','Portrait'],['landscape','Landscape']],p.orient)}</select><button type="button" class="sm" title="Move page left" onclick="repMovePage(-1)">←</button><button type="button" class="sm" title="Move page right" onclick="repMovePage(1)">→</button>${r.pages.length>1?`<button type="button" class="sm dl" onclick="repDelPage()">Delete page</button>`:''}</div>`:''}`;
 /* Период захватывает ушедшие в архив заказы — сначала их строки с диска. */
 const ranges=repArchiveRanges(r,p),arch=ranges?archiveScopeFor(ranges,repArchiveNeed(r,p)):'none';
 if(!ranges)archiveScopeDrop();
 const ready=arch==='loading'?'':repPageReady(r,p),wait=arch==='loading'?archiveFactsText(archiveScope):ready==='wait'?repBuildText(repBuild):'';
 const body=wait?`<div class="card mut" data-rep-archive-wait>${esc(wait)}</div>`:(repEditOn?repSheetMark(p):'')+p.widgets.map((w,i)=>repWidgetCard(r,w,i,n)).join('')+(repEditOn?`<button type="button" class="card rep-add" data-rep-add onclick="repAddWidget()">+ Add chart</button>`:n?'':'<div class="card mut">This page is empty.</div>');
 return `<div class="card rep-head"><div class="rep-head-row">${head}<span class="sales-toolbar-sp"></span>${ready==='stale'?`<span class="mut small" data-rep-updating>${esc(repBuildText(repBuild,true))}</span>`:''}${acts}</div>${!can&&!repEditOn?`<div class="mut small">${r.ownerId?'Shared with you':'Starter report'} · Copy to change it</div>`:''}${tabs}${repControls(r)}</div><div class="rep-ws">${body}</div>`;
}
function viewReports(){
 repPicks=[];
 const r=repOpenReport();if(!r){repOpenId='';repEditOn=false;}
 repCustomCur=r&&r.custom||[];repColorsCur=r&&r.colors||{};
 const setup=r&&repEditOn?repSetup(r):'';
 const hide=repCatHidden();
 return `<div class="rep-app${setup?' editing':''}${hide?' flat':''}">${hide?'':repCatalog()}<div class="rep-main">${hide?repCatBar(r):''}${repMain(r)}</div>${setup}</div>${repMenuHTML(r)}`;
}
