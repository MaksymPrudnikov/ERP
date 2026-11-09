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
function repCellHTML(m,v){return v===0&&!m.money&&!m.pct?REP_DASH:esc(repFmt(m,v));}
/* Пустая клетка — серый прочерк, как в списках Sales (владелец, 04.11.2026). */
const REP_DASH='<span class="mut sl-dash">–</span>';
/* Таблица — все строки (владелец, 03.11.2026: «ничего не ограничивать»):
   первые REP_TABLE_STEP сразу, дальше дорисовываются, когда карточку
   прокручивают вниз (repTableMore). */
const REP_TABLE_STEP=300;
let repFitRaf=0;
let repTableRest=new Map();
function repTableBody(w,keys,rowHTML){
 if(keys.length<=REP_TABLE_STEP){repTableRest.delete(w.id);return keys.map(rowHTML).join('');}
 repTableRest.set(w.id,{keys,rowHTML,at:REP_TABLE_STEP});
 return keys.slice(0,REP_TABLE_STEP).map(rowHTML).join('');
}
function repTableMore(el){
 if(!repFitRaf)repFitRaf=requestAnimationFrame(()=>{repFitRaf=0;repSheetFit();});
 const x=repTableRest.get(el.dataset.repScroll);if(!x||el.scrollTop+el.clientHeight<el.scrollHeight-600)return;
 const body=el.querySelector('tbody'),end=Math.min(x.at+REP_TABLE_STEP,x.keys.length);if(!body)return;
 body.insertAdjacentHTML('beforeend',readScope(()=>{let html='';for(let i=x.at;i<end;i++)html+=x.rowHTML(x.keys[i],i,x.keys);return html;}));x.at=end;if(end>=x.keys.length)repTableRest.delete(el.dataset.repScroll);
}
/* Таблица отчёта — как в Sales (владелец, 04.11.2026): ширина и порядок
   колонок мышью, Columns — какие видны. Вид у зрителя свой (в этом браузере),
   в Edit — вид отчёта по умолчанию (w.tv). Измерения строк стоят слева. */
function repTableView(r,w){const v=!repEditOn&&repView(r.id).tv;return v&&v[w.id]?repCleanTableView(v[w.id]):repCleanTableView(w.tv);}
function repTableViewSet(wid,fn){
 const r=repOpenReport();if(!r)return;
 if(repEditOn){repEditCur(x=>x.pages.forEach(p=>p.widgets.forEach(w=>{if(w.id===wid){const v=repCleanTableView(w.tv);fn(v);w.tv=v;}})));return;}
 const w=r.pages.flatMap(p=>p.widgets).find(x=>x.id===wid);if(!w)return;
 repViewSet(r.id,v=>{v.tv=v.tv&&typeof v.tv==='object'?v.tv:{};const cur=repCleanTableView(v.tv[wid]||w.tv);fn(cur);v.tv[wid]=cur;});render();
}
function repColKey(s){let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))|0;return 'v'+(h>>>0).toString(36);}
function repTableHTML(r,S,res,w){
 const ms=res.metrics,d1=res.dims[0],d2=res.dims[1],cmp=res.compare&&!d2;
 /* Измерения строк: первое и ещё (res.more) — каждое своей колонкой. */
 /* Клик по заголовку — порядок строк (как в Looker): свой у зрителя, в этом браузере. */
 const so=repWidgetQuery(r,w).sort,fb=(by,i,key,on)=>`<button type="button" class="sl-fbtn${on?' on':''}" data-rep-colmenu="${key}" aria-label="Sort and columns" onclick="event.stopPropagation();repColMenuOpen(event,'${esc(w.id)}','${by}',${i},'${key}')"></button>`,sortTh=(text,by,i,cls,at,j,key)=>{const on=!!so&&so.by===by&&(by==='label'?!j:so.i===i);return `<th${at||''} class="${cls||''} rep-sortable${on?' rep-sort-on':''}" data-rep-sort="${by}:${i}"${key?` data-cw-key="${key}"`:''} onclick="repSortClick('${esc(w.id)}','${by}',${i})"><span class="sl-th"><span data-cw-label>${esc(text)}${on?(so.dir==='asc'?' ▲':' ▼'):''}</span>${key&&!j||key&&by==='metric'?fb(by,i,key,on):''}</span>${key?cwGrip():''}</th>`;};
 const rowDims=[d1].concat(res.more||[]);
 /* Значение, как в строке выше, — бледно: группа видна, «6 mm · 6CLEAR» и батчи под ней. */
 const rowCells=(k,i,arr)=>{const parts=String(k).split('\u0002'),prev=i>0&&arr?String(arr[i-1]).split('\u0002'):[];let same=rowDims.length>1;
  return rowDims.map((d,j)=>{const v=parts[j];if(v==null)return '<td></td>';same=same&&j<rowDims.length-1&&prev[j]===v;const t=esc(repKeyText(S,d,v));return `<td${repPickAttrs(r,S,d,v)}${same?' class="rep-same"':''}>${j?`<span data-raw>${t}</span>`:`<b data-raw>${t}</b>`}</td>`;}).join('');},totalCell=`<td colspan="${rowDims.length}"><b>Total</b></td>`;
 if(!d1)return `<div class="sales-table-wrap"><table class="sl-table rep-table"><thead><tr>${ms.map(m=>`<th class="n">${esc(m.label)}</th>`).join('')}</tr></thead><tbody><tr>${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`).join('')}</tr></tbody></table></div>`;
 const keys=res.keys,tv=repTableView(r,w),dimKeys=rowDims.map((d,j)=>'d'+j);let head,body,foot='',cw=null;
 if(d2&&ms.length>1){
  /* Разбивка и несколько метрик: у каждого значения разбивки — все метрики
     (раньше молча оставалась только первая). Две строки шапки — вид постоянный. */
  const k2=res.keys2,cell=(v,m)=>v?esc(repFmt(m,v)):REP_DASH;
  head=`${rowDims.map((d,j)=>sortTh(repDimLabel(S,d),'label',0,'',' rowspan="2"',j)).join('')}${k2.map(k=>`<th class="n rep-group" colspan="${ms.length}" data-raw>${esc(repKeyText(S,d2,k))}</th>`).join('')}<th class="n rep-group" colspan="${ms.length}">Total</th></tr><tr>${k2.concat(['']).map(()=>ms.map(m=>`<th class="n">${esc(m.label)}</th>`).join('')).join('')}`;
  body=repTableBody(w,keys,(k,i,arr)=>`<tr>${rowCells(k,i,arr)}${k2.map(b=>ms.map((m,i)=>`<td class="n">${cell((res.cells.get(k+'\u0001'+b)||[])[i],m)}</td>`).join('')).join('')}${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.rowTotals.get(k)[i]))}</b></td>`).join('')}</tr>`);
  if(w.opts.totals)foot=`<tr class="sl-foot">${totalCell}${k2.map(b=>ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.colTotals.get(b)[i]))}</b></td>`).join('')).join('')}${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`).join('')}</tr>`;
 }else{
  /* Колонки значений: {k, th, cell(строка), foot} — видимость, порядок и ширина по виду таблицы. */
  let list;
  if(d2){const m=ms[0],cell=v=>v?esc(repFmt(m,v)):REP_DASH;
   list=res.keys2.map(b=>{const k=repColKey(b),label=repKeyText(S,d2,b);return {k,label,th:`<th class="n" data-cw-key="${k}"><span class="sl-th"><span data-cw-label data-raw>${esc(label)}</span>${fb('col',0,k,false)}</span>${cwGrip()}</th>`,cell:row=>`<td class="n">${cell((res.cells.get(row+'\u0001'+b)||[])[0])}</td>`,foot:()=>`<td class="n"><b>${esc(repFmt(m,res.colTotals.get(b)[0]))}</b></td>`};})
    .concat([{k:'total',label:'Total',th:`<th class="n" data-cw-key="total"><span class="sl-th"><span data-cw-label>Total</span>${fb('col',0,'total',false)}</span>${cwGrip()}</th>`,cell:row=>`<td class="n"><b>${esc(repFmt(m,res.rowTotals.get(row)[0]))}</b></td>`,foot:()=>`<td class="n"><b>${esc(repFmt(m,res.total[0]))}</b></td>`}]);
  }else list=ms.flatMap((m,i)=>{const k='m'+repColKey(m.k||m.label).slice(1);return [{k,label:m.label,th:sortTh(m.label,'metric',i,'n','',0,k),cell:row=>`<td class="n">${repCellHTML(m,res.rowTotals.get(row)[i])}</td>`,foot:()=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`}]
   .concat(cmp?[{k:k+'c',label:m.label+' · '+repCmpText(res),th:`<th class="n rep-cmp" data-cw-key="${k}c"><span class="sl-th"><span data-cw-label>${esc(repCmpText(res))}</span>${fb('col',0,k+'c',false)}</span>${cwGrip()}</th>`,cell:row=>`<td class="n rep-cmp">${esc(repDelta(res.rowTotals.get(row)[i],(res.compare.rowTotals.get(row)||[])[i]))}</td>`,foot:()=>`<td class="n rep-cmp">${esc(repDelta(res.total[i],res.compare.total[i]))}</td>`}]:[]);});
  repTableColsCur.set(w.id,list.map(c=>[c.k,c.label]));
  const pos=k=>{const i=tv.order.indexOf(k);return i<0?1e6+list.findIndex(c=>c.k===k):i;};
  const cols=list.filter(c=>!tv.hide.includes(c.k)).sort((a,b)=>pos(a.k)-pos(b.k)),allKeys=dimKeys.concat(cols.map(c=>c.k)),id='rep_'+w.id;
  cwRegister(id,{widths:()=>tv.cw,save:x=>repTableViewSet(w.id,v=>{v.cw=x;}),def:k=>k.startsWith('d')?170:110,min:()=>CW_MIN,
   move:(from,to,after)=>{if(from.startsWith('d')||to.startsWith('d'))return;repTableViewSet(w.id,v=>{const ord=list.map(c=>c.k).sort((a,b)=>pos(a)-pos(b)).filter(k=>k!==from);let at=ord.indexOf(to);if(at<0)return;if(after)at++;ord.splice(at,0,from);v.order=ord;});},lead:[44],trail:0,fill:''});
  cw={id,keys:allKeys};
  const gear=repPrintBusy?'<th class="sl-check"></th>':`<th class="sl-check"><span class="sl-header-tools"><button type="button" class="sl-settings" data-rep-cols title="Columns" aria-label="Columns" onclick="repTableColsOpen(event,'${esc(w.id)}')">${ico('settings')}</button></span></th>`;
  head=gear+rowDims.map((d,j)=>sortTh(repDimLabel(S,d),'label',0,'','',j,'d'+j)).join('')+cols.map(c=>c.th).join('');
  body=repTableBody(w,keys,(k,n,arr)=>`<tr><td class="sl-check"></td>${rowCells(k,n,arr)}${cols.map(c=>c.cell(k)).join('')}</tr>`);
  if(w.opts.totals)foot=`<tr class="sl-foot"><td class="sl-check"></td>${totalCell}${cols.map(c=>c.foot()).join('')}</tr>`;
 }
 const tcls=cw?cwTableClass(cw.id):'',tattrs=cw?cwTableAttrs(cw.id,cw.keys):'',tcol=cw?cwColgroup(cw.id,cw.keys):'';
 return `<div class="sales-table-wrap rep-scroll" data-rep-scroll="${esc(w.id)}" onscroll="repTableMore(this)"><table class="sl-table rep-table${tcls}"${tattrs} data-rep-rows="${keys.length}">${tcol}<thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>${keys.length>REP_TABLE_STEP?`<div class="mut small" data-rep-rows>${chNum(keys.length)} rows</div>`:''}`;
}
/* Columns у таблицы отчёта: галочка — колонка видна; Standard view — вид отчёта. */
const repTableColsCur=new Map();
function repTableColsOpen(e,wid){if(e)e.stopPropagation();repMenu=Object.assign({kind:'tcols',wid},repAt(e));render();}
function repTableColsHTML(r,m,style){
 const w=r.pages.flatMap(p=>p.widgets).find(x=>x.id===m.wid),list=repTableColsCur.get(m.wid)||[];if(!w)return '';
 const tv=repTableView(r,w),own=!repEditOn&&!!(repView(r.id).tv||{})[w.id];
 return `<div class="sl-menu sl-cols" style="${style}" role="dialog" aria-label="Columns" data-rep-cols-menu><h5>Columns · drag a header to reorder</h5>${list.map(([k,l])=>`<label class="sl-cols-row"><input type="checkbox" data-rep-col="${k}" ${tv.hide.includes(k)?'':'checked'} onchange="repTableColToggle('${esc(w.id)}','${k}',this.checked)"> <span data-raw>${esc(l)}</span></label>`).join('')||'<div class="mut">No columns to choose.</div>'}
  <div class="sl-actions">${repEditOn?`<button type="button" class="sl-btn" onclick="repTableViewSet('${esc(w.id)}',v=>{v.hide=[];v.order=[];v.cw={};})">Reset</button>`:`<button type="button" class="sl-btn" data-rep-cols-std ${own?'':'disabled'} onclick="repTableStd('${esc(w.id)}')">Standard view</button>`}</div></div>`;
}
function repColMenuOpen(e,wid,by,i,key){repMenu=Object.assign({kind:'colmenu',wid,by,i,key},repAt(e));render();}
function repColMenuHTML(r,m,style){
 const hide=m.key&&!m.key.startsWith('d'),sort=m.by!=='col';
 return `<div class="sl-menu rep-colmenu" style="${style}" role="menu" data-rep-colmenu-open>${sort?`<button type="button" class="sl-btn" data-rep-sort-asc onclick="repSortSet('${esc(m.wid)}','${m.by}',${m.i},'asc')">Sort A → Z / low → high</button><button type="button" class="sl-btn" data-rep-sort-desc onclick="repSortSet('${esc(m.wid)}','${m.by}',${m.i},'desc')">Sort Z → A / high → low</button>`:''}${hide?`<button type="button" class="sl-btn" data-rep-col-hide onclick="repMenu=null;repTableColToggle('${esc(m.wid)}','${m.key}',false)">Hide column</button>`:''}</div>`;
}
function repSortSet(wid,by,i,dir){const r=repOpenReport();repMenu=null;if(!r)return;repViewSet(r.id,v=>{v.s=v.s&&typeof v.s==='object'?v.s:{};v.s[wid]={by,i,dir};});render();}
function repTableColToggle(wid,k,on){repTableViewSet(wid,v=>{v.hide=v.hide.filter(x=>x!==k);if(!on)v.hide.push(k);});}
function repTableStd(wid){const r=repOpenReport();if(!r)return;repViewSet(r.id,v=>{if(v.tv)delete v.tv[wid];});repMenu=null;render();}
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
  return chartLegend([{label:m.label,cls:'rep-key-acc'}].concat(m2?[{label:m2.label+' (inner)',cls:'ch-inner-key'}]:[]))+chartColumns(pts,{fmt,label:w.title,all:true})+(m2?'':'<div class="mut small">Add a second metric for the inner column.</div>');
 }
 if(w.type==='columns'){
  const pts=res.keys.map((k,i)=>({label:text(k),value:res.rowTotals.get(k)[0]||0,parts:d2?repParts(res,cls,k):null,tick:i%every===0,attrs:repPickAttrs(r,S,d1,k),title:text(k)+': '+fmt(res.rowTotals.get(k)[0])+(res.compare?' · '+repCmpText(res)+' '+fmt((res.compare.rowTotals.get(k)||[])[0]):'')}));
  return (d2?repLegend(S,res,cls):'')+chartColumns(pts,{fmt,label:w.title,all:true});
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
/* Кнопки блока — значками в строке заголовка (владелец, 04.11.2026): в
   просмотре Columns у таблицы и CSV; правка, копия, порядок и × — только в Edit.
   Уголок справа внизу (Edit) — высота и ширина блока руками. */
function repIcoBtn(icon,title,on,attrs,cls){return `<button type="button" class="rep-ib${cls?' '+cls:''}" title="${title}" aria-label="${title}" ${attrs||''} onclick="${on}">${ico(icon)}</button>`;}
function repWidgetCard(r,w,i,n){
 const sel=repEditOn&&w.id===repSelW,id=esc(w.id),tools=repEditOn?`<span class="rep-wtools">${repIcoBtn('edge','Edit',`repSelectWidget('${id}')`,'data-rep-wedit')}${repIcoBtn('copy','Duplicate',`repDupWidget('${id}')`)}${repIcoBtn('up','Move up',`repMoveWidget('${id}',-1)`,i?'':'disabled')}${repIcoBtn('down','Move down',`repMoveWidget('${id}',1)`,i<n-1?'':'disabled')}${repIcoBtn('close','Remove',`repDelWidget('${id}')`,'','dl')}</span>`:'';
 const src=REP_SRC[w.q.source],own=w.q.date.use==='own'?' · '+repDateText(w.q.date):'';
 /* Выгрузка — Excel (владелец, 08.11.2026: «а зачем тогда мне CSV»); repCsvText остаётся для проверки строк. */
 const csv=w.type!=='number'||!repEditOn?repIcoBtn('download','Export all rows to Excel',`repExcel('${id}')`,'data-rep-excel','rep-csv'):'';
 return `<div class="card rep-w${w.width==='half'?' half':''}${sel?' sel':''}" data-rep-widget="${id}" data-rep-type="${w.type}"${w.h?` style="--rep-h:${w.h}px"`:''}${repEditOn&&!sel?` onclick="if(!event.target.closest('button,[role=button],input,select,[data-rep-corner]'))repSelectWidget('${id}')"`:''}><div class="rep-wh"><h3 data-raw>${esc(repWidgetTitle(w))}</h3><span class="mut">${esc(src?src.label:'')}${esc(own)}</span><span class="rep-wbtns">${tools}${csv}</span></div>${repChart(r,w)}${repSkipHTML(r,w)}${repEditOn?`<span class="rep-corner" data-rep-corner="${id}" title="Drag to resize" aria-hidden="true"></span>`:''}</div>`;
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
 const btn=f=>{const vals=vf[f]||[],on=vals.length>0;return `<span class="rep-ctl${on?' on':''}"><button type="button" class="sl-quiet" data-rep-ctl="${esc(f)}" onclick="repOpenCtl(event,'${esc(f)}')">${esc(labels.get(f)||f)}${on?': '+esc(vals.length>2?vals.length+' values':vals.join(', ')):''}<span class="sl-disclosure">▾</span></button>${on?`<button type="button" class="rep-x" aria-label="Clear" onclick="repClearCtl('${esc(f)}')">×</button>`:''}${repEditOn&&r.controls.includes(f)&&!on?`<button type="button" class="rep-x" title="Remove filter" aria-label="Remove filter" data-rep-del-ctl="${esc(f)}" onclick="repDelControl('${esc(f)}')">×</button>`:''}</span>`;};
 const free=[...labels.keys()].filter(f=>!keys.includes(f));
 return `<div class="rep-bar"><button type="button" class="sl-quiet rep-ctl-date" data-rep-date onclick="repOpenDate(event)">Date: ${esc(repDateText(repEditOn?r.date:v.date||r.date))}<span class="sl-disclosure">▾</span></button>${keys.map(btn).join('')}${repEditOn&&free.length?`<button type="button" class="sl-quiet rep-add-ctl" data-rep-add-ctl onclick="repAddCtlOpen(event)">+ Filter</button>`:''}${v.date||v.f!==undefined||v.s?`<button type="button" class="sm" data-rep-reset onclick="repResetView()" title="Back to the report's own period and filters">Reset</button>${!repEditOn&&repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-save-view onclick="repSaveDefaults()" title="Keep this period and these filters in the report">Save as default</button>`:''}`:''}</div>`;
}
function repMenuHTML(r){
 const m=repMenu;if(!m||!r)return '';
 const style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-320))}px;top:${Math.max(8,m.y)}px`,back='<div class="sl-backdrop" onclick="repMenu=null;render()"></div>';
 if(m.kind==='tcols')return back+repTableColsHTML(r,m,style);
 if(m.kind==='settings')return repSettingsHTML(r);
 if(m.kind==='page')return back+repPageMenuHTML(r,m,style);
 if(m.kind==='addctl')return back+repAddCtlHTML(r,style);
 if(m.kind==='colmenu')return back+repColMenuHTML(r,m,style);
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
/* Строки выгрузки виджета (как в Looker: меню графика → Export): все строки и
   колонки, как в таблице, строка Total. Ячейка — {v, t:'s'|'n', money}: CSV
   пишет числа без форматирования, Excel — числами (views/sl-excel). */
function repExportRows(r,w){
 const q=repWidgetQuery(r,w),S=REP_SRC[q.source],res=repResultOf(q,repCtx());if(!S||!res)return null;
 const n=(m,v)=>({v:v==null||!Number.isFinite(+v)?null:+v,t:'n',money:!!m.money}),t=v=>({v:v==null?'':String(v),t:'s'});
 const ms=res.metrics,d1=res.dims[0],d2=res.dims[1],rowDims=d1?[d1].concat(res.more||[]):[],rows=[];
 const keys2=d2?res.keys2:[],head=rowDims.map(d=>repDimLabel(S,d)).concat(d2?keys2.flatMap(b=>ms.map(m=>repKeyText(S,d2,b)+' · '+m.label)).concat(ms.map(m=>'Total · '+m.label)):ms.map(m=>m.label));
 if(!d1)rows.push(ms.map((m,i)=>n(m,res.total[i])));
 else{
  res.keys.forEach(k=>{const parts=String(k).split('\u0002'),dims=rowDims.map((d,j)=>t(parts[j]==null?'':repKeyText(S,d,parts[j])));
   rows.push(dims.concat(d2?keys2.flatMap(b=>ms.map((m,i)=>n(m,(res.cells.get(k+'\u0001'+b)||[])[i]))).concat(ms.map((m,i)=>n(m,res.rowTotals.get(k)[i]))):ms.map((m,i)=>n(m,res.rowTotals.get(k)[i]))));});
  rows.push([t('Total')].concat(rowDims.slice(1).map(()=>t(''))).concat(d2?keys2.flatMap(b=>ms.map((m,i)=>n(m,(res.colTotals.get(b)||[])[i]))).concat(ms.map((m,i)=>n(m,res.total[i]))):ms.map((m,i)=>n(m,res.total[i]))));
 }
 return {head,rows};
}
function repCsvText(r,w){
 const x=repExportRows(r,w);if(!x)return '';
 const cell=v=>{const s=v==null?'':String(v);return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 const val=c=>c.t!=='n'?c.v:c.v==null?'':c.money?c.v.toFixed(2):String(+c.v.toFixed(6));
 return [x.head].concat(x.rows.map(row=>row.map(val))).map(l=>l.map(cell).join(',')).join('\r\n')+'\r\n';
}
/* Excel — те же строки, что CSV, числами (владелец, 08.11.2026: «добавь»). */
function repExcel(wid){
 const r=repOpenReport();if(!r)return;const w=r.pages.flatMap(p=>p.widgets).find(x=>x.id===wid);if(!w)return;
 const x=readScope(()=>repExportRows(r,w));if(!x)return;
 const title=(r.name+' - '+repWidgetTitle(w)).replace(/[\\/:*?"<>|]+/g,' ').trim();
 storageDownload(title+' '+finToday()+'.xlsx',xlsxBook(repWidgetTitle(w),x.head,x.rows,null),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
 const tab=repPropTab==='style'?'style':'setup',label=(REP_TYPES.find(t=>t[0]===w.type)||[0,'Chart'])[1];
 const top=`<div class="card rep-setup" data-rep-setup><div class="rep-setup-head"><h3>${esc(label)}</h3><button type="button" class="rep-ib" title="Close" aria-label="Close" onclick="repSelW='';render()">${ico('close')}</button></div>
  <div class="rep-types">${REP_TYPES.map(([k,l])=>`<button type="button" class="${w.type===k?'on':''}" data-rep-type-btn="${k}" title="${l}" onclick="repSetW('type','${k}')">${REP_TYPE_ICO[k]||''}<span>${l}</span></button>`).join('')}</div>
  <div class="rep-ptabs" role="tablist"><button type="button" class="${tab==='setup'?'on':''}" data-rep-ptab="setup" onclick="repPropTab='setup';render()">Setup</button><button type="button" class="${tab==='style'?'on':''}" data-rep-ptab="style" onclick="repPropTab='style';render()">Style</button></div>`;
 if(tab==='style')return top+repStyleHTML(w)+'</div>';
 return top+`
  <h5>Data source</h5><select data-rep-source onchange="repSetSource(this.value)">${repSrcOptions(q.source)}</select><div class="hint">${esc(S.hint||'')}</div>
  <h5>Dimension</h5><div class="rep-drop" data-rep-drop="dim0" ondragover="repDragOver(event)" ondragleave="this.classList.remove('over')" ondrop="repDropField(event,'dim0')"><select data-rep-dim="0" onchange="repSetDim(0,this.value)">${repOpt(dims,q.dims[0]||'','None — totals only')}</select></div>${repNoteOf(dims,q.dims[0]||'')}${repMoreHTML(w,S)}
  ${w.type==='combo'?'<div class="hint" data-rep-combo>First metric — column; second — inner column.</div>':''}${w.type!=='number'&&w.type!=='pie'&&w.type!=='combo'?`<h5>Breakdown</h5><div class="rep-drop" data-rep-drop="dim1" ondragover="repDragOver(event)" ondragleave="this.classList.remove('over')" ondrop="repDropField(event,'dim1')"><select data-rep-dim="1" onchange="repSetDim(1,this.value)">${repOpt(dims.filter(d=>d[0]!==q.dims[0]),q.dims[1]||'','None')}</select></div>${q.dims[1]&&w.type!=='table'&&q.metrics.length>1?'<div class="hint" data-rep-first-metric>Chart shows the first metric; Table shows all.</div>':''}`:''}
  <h5>Metrics</h5><div class="rep-drop" data-rep-drop="metric" ondragover="repDragOver(event)" ondragleave="this.classList.remove('over')" ondrop="repDropField(event,'metric')">${(q.metrics.length?q.metrics:[S.metrics[0].k]).map((k,i)=>{const c=repCalcParse(k),del=q.metrics.length>1?`<button type="button" class="sm dl" onclick="repDelMetric(${i})">×</button>`:'';
   if(!c)return `<div class="sl-row"><select data-rep-metric="${i}" onchange="repSetMetric(${i},this.value)">${repOpt(mets,k)}</select>${del}</div>${repNoteOf(mets,k)}`;
   const num=/^n:/.test(c.b);
   return `<div class="rep-calc" data-rep-calc="${i}"><div class="sl-row"><select aria-label="First metric" onchange="repSetCalc(${i},'a',this.value)">${repOpt(mets,c.a)}</select>${del}</div><div class="sl-row"><select aria-label="Operation" onchange="repSetCalc(${i},'op',this.value)">${repOpt(REP_CALC_OPS,c.op)}</select><select aria-label="Second metric or number" onchange="repSetCalc(${i},'b',this.value)">${repOpt([['n:','Number']].concat(mets),num?'n:':c.b)}</select>${num?`<input type="number" step="any" aria-label="Number" value="${esc(c.b.slice(2))}" onchange="repSetCalc(${i},'n',this.value)">`:''}</div></div>`;}).join('')}
  </div><div class="sl-row"><button type="button" class="sl-btn" data-rep-add-metric onclick="repAddMetric()">+ Add metric</button><button type="button" class="sl-btn" data-rep-add-calc onclick="repAddCalc()" title="Metric ÷ × + − another metric or a number">+ Calculated</button></div>
  ${repCustomHTML(r,S,q)}
  <h5>Filter on this chart</h5><div class="rep-drop" data-rep-drop="filter" ondragover="repDragOver(event)" ondragleave="this.classList.remove('over')" ondrop="repDropField(event,'filter')">${q.filters.map((f,i)=>repFilterRow(S,f,i)).join('')}<button type="button" class="sl-btn" data-rep-add-filter onclick="repAddFilter()">+ Add filter</button></div>
  ${(q.having||[]).map((h,i)=>repHavingRow(mets,h,i)).join('')}<button type="button" class="sl-btn" data-rep-add-having onclick="repAddHaving()" title="Keep rows whose value fits">+ Metric filter</button>
  <h5>Date range</h5>${dates.length>1?`<select aria-label="Date field" onchange="repSetW('date.f',this.value)">${repOpt(dates.map(k=>[k,repField(S,k).label]),q.date.f||dates[0])}</select>`:''}
  <select data-rep-date-use onchange="repSetDateUse(this.value)">${repOpt([['report','Report period']].concat(REP_PRESETS).concat([['custom','Custom dates']]),dateCur)}</select>
  ${dateCur==='custom'?`<div class="sl-row"><input type="date" value="${esc(q.date.from)}" onchange="repSetW('date.from',this.value)"><input type="date" value="${esc(q.date.to)}" onchange="repSetW('date.to',this.value)"></div>`:''}
  <select data-rep-compare onchange="repSetW('compare',this.value)">${repOpt(cmp,q.compare||'')}</select>
  <h5>Sort · rows</h5><select data-rep-sort onchange="repSetSort(this.value)">${repOpt(sortOpts,sortCur)}</select>
  <div class="sl-row"><label class="rep-inline">Top <input type="number" min="0" step="1" value="${q.limit||''}" placeholder="all" onchange="repSetW('limit',this.value)"></label><label class="rep-inline"><input type="checkbox" ${q.other?'checked':''} onchange="repSetW('other',this.checked)"> Other row</label></div></div>`;
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
 else if(p[0]==='h')w.h=Math.max(0,Math.round(+v||0));
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
   уменьшается только под ширину бумаги: граница листа на экране
   (repSheetMark) — там же, где край бумаги. Что ниже края, на бумагу не идёт
   (владелец, 05.11.2026: «вылез — в печать не пойдёт»): блок за краем снят,
   таблица — по целой строке, «+ N more rows — Excel» и итог Total по всем
   строкам. Таблица и в своём блоке печатает только то, что видно в нём. */
let repPrintW=0;
function repPrintFit(el){
 const x=el.querySelector('.rep-print');if(!x)return;const land=x.dataset.repOrient==='landscape',[W,H]=REP_SHEET[land?'landscape':'portrait'],w=repPrintW||W-REP_SHEET_PAD;
 el.classList.add(land?'rep-land':'rep-port');x.style.width=w+'px';x.style.zoom='';
 const z=(W-REP_SHEET_PAD)/w,top=x.getBoundingClientRect().top,limit=top+(H-REP_SHEET_PAD)*REP_SHEET_SPARE/z;
 x.querySelectorAll('.rep-w').forEach(b=>{
  const r=b.getBoundingClientRect();if(r.top>=limit-1){b.remove();return;}
  const box=b.querySelector('.rep-scroll'),body=box&&box.querySelector('tbody');
  if(!body){if(r.bottom>limit+1)b.remove();return;}
  if(!repPrintCutTable(b,box,body,limit))b.remove();
 });
 x.style.zoom=String(Math.floor(z*1000)/1000);
}
/* Таблица на бумаге: видимое в её блоке и выше края листа — целыми строками;
   остальное — строкой «+ N more rows — Excel», итог Total остаётся. false — не
   влезла ни одна строка. */
function repPrintCutTable(b,box,body,limit){
 const table=box.querySelector('table'),all=+(table&&table.dataset.repRows)||body.rows.length,cols=(body.rows[0]||{cells:[]}).cells.length||1;
 const boxBottom=box.getBoundingClientRect().bottom,fits=()=>b.getBoundingClientRect().bottom<=limit+1;
 if(body.rows.length>=all&&table.getBoundingClientRect().bottom<=boxBottom+1&&fits())return true;
 let keep=0;for(const tr of body.rows){if(tr.getBoundingClientRect().bottom<=boxBottom)keep++;else break;}
 while(body.rows.length>keep)body.deleteRow(keep);
 box.classList.add('rep-print-cut');
 const tr=body.insertRow(-1);tr.className='rep-more-row';const td=tr.insertCell(0);td.colSpan=cols;
 const label=()=>{td.textContent='+ '+chNum(all-keep)+' more row'+(all-keep===1?'':'s')+' \u2014 Excel';};label();
 while(!fits()&&keep>0){body.deleteRow(--keep);label();}
 return keep>0||fits();
}
/* Граница печатного листа в Edit (владелец, 03.11.2026: «чтобы я понимал, как
   расположить данные на печатный лист»): пунктир на высоте листа при ширине
   отчёта; высота — через padding в процентах от ширины, минус шапка листа. */
const REP_PRINT_HEAD=76;
function repSheetMark(p,no){
 const [W,H]=REP_SHEET[p.orient==='landscape'?'landscape':'portrait'],pct=((H-REP_SHEET_PAD)*REP_SHEET_SPARE/(W-REP_SHEET_PAD)*100).toFixed(2);
 return `<div class="rep-sheet-mark" aria-hidden="true" data-rep-sheet style="padding-top:calc(${pct}% - ${REP_PRINT_HEAD}px)"><span>End of page${no?' '+no:''} · Letter ${p.orient==='landscape'?'landscape':'portrait'}</span><b data-rep-over hidden></b></div>`;
}
/* Вариант 2 владельца (05.11.2026): «вылез — твои проблемы, в печать не
   пойдёт». После отрисовки: блоки ниже линии листа и строки таблиц под ней
   бледнеют со штриховкой, на линии — сколько не войдёт. Сам лист ничего не
   сжимает: влезть — уголком блока. */
function repSheetFit(){
 const ws=document.querySelector('.rep-main .rep-ws'),mark=ws&&ws.querySelector('[data-rep-sheet]');if(!mark)return;
 const y=mark.getBoundingClientRect().bottom;let rows=0,blocks=0;
 ws.querySelectorAll('.rep-over,.rep-over-row').forEach(e=>e.classList.remove('rep-over','rep-over-row'));
 ws.querySelectorAll('.rep-w').forEach(b=>{
  const r=b.getBoundingClientRect();if(r.bottom<=y+1)return;
  if(r.top>=y-1){b.classList.add('rep-over');blocks++;return;}
  const box=b.querySelector('.rep-scroll'),body=box&&box.querySelector('tbody');
  if(!body){b.classList.add('rep-over');blocks++;return;}
  const bottom=box.getBoundingClientRect().bottom;
  [...body.rows].forEach(tr=>{const t=tr.getBoundingClientRect();if(t.top<bottom&&t.bottom>y+1){tr.classList.add('rep-over-row');rows++;}});
  const foot=box.querySelector('tfoot tr');if(foot&&foot.getBoundingClientRect().bottom>y+1)foot.classList.add('rep-over-row');
 });
 const badge=mark.querySelector('[data-rep-over]'),parts=[rows?rows+' row'+(rows===1?'':'s'):'',blocks?blocks+' block'+(blocks===1?'':'s'):''].filter(Boolean);
 mark.classList.toggle('over',parts.length>0);if(badge){badge.hidden=!parts.length;badge.textContent=parts.join(' · ')+' won\u2019t print';}
}
window.addEventListener('resize',()=>{if(typeof tab!=='undefined'&&tab==='reports')repSheetFit();});
/* Уголок блока (Edit): вниз-вверх — высота области (таблица, столбики, подписи
   пая), вбок — ширина: меньше трёх четвертей строки — половина. */
let repRz=null;
document.addEventListener('pointerdown',e=>{
 const c=e.button===0&&e.target.closest&&e.target.closest('[data-rep-corner]');if(!c||!repEditOn)return;
 e.preventDefault();e.stopPropagation();const b=c.closest('.rep-w'),ws=b&&b.closest('.rep-ws');if(!ws)return;
 const area=b.querySelector('.rep-scroll,.ch-cols,.ch-pie-legend');
 repRz={wid:c.dataset.repCorner,b,ws,area,h0:area?area.getBoundingClientRect().height:0,x:e.clientX,y:e.clientY,w0:b.getBoundingClientRect().width,half:b.classList.contains('half'),h:0,pointer:e.pointerId};
 try{c.setPointerCapture(e.pointerId);}catch(x){}document.body.classList.add('rep-resizing');
},true);
document.addEventListener('pointermove',e=>{
 const d=repRz;if(!d||e.pointerId!==d.pointer)return;
 if(d.area){d.h=Math.max(80,Math.round(d.h0+e.clientY-d.y));d.b.style.setProperty('--rep-h',d.h+'px');}
 d.half=d.w0+e.clientX-d.x<d.ws.getBoundingClientRect().width*0.75;d.b.classList.toggle('half',d.half);repSheetFit();
},true);
document.addEventListener('pointerup',e=>{
 const d=repRz;if(!d||e.pointerId!==d.pointer)return;repRz=null;document.body.classList.remove('rep-resizing');
 repEditCur(r=>r.pages.forEach(p=>p.widgets.forEach(w=>{if(w.id===d.wid){if(d.h)w.h=d.h;w.width=d.half?'half':'full';}})));
},true);
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
 /* Edit по образцу Looker (владелец, 05.11.2026): верх — одна строка; папка,
    доступ, Show on и Delete — в окне Report settings; листы — панель слева. */
 const dirty=repDirty(),saved=!!repFind(r.id),at=r.pages.indexOf(p);
 const head=repEditOn?`<input type="text" class="rep-name-inline" data-rep-name value="${esc(r.name)}" aria-label="Report name" onchange="repSetMeta('name',this.value)"><span class="mut small rep-folder-crumb" data-raw>${esc(r.folder||'No folder')}</span>`
  :`<h2 class="rep-title" data-raw>${esc(r.name)}</h2>`;
 /* Готовый отчёт: листы стрелками «‹ Page 2 of 4 ›» (владелец, 05.11.2026). */
 const pager=!repEditOn&&r.pages.length>1?`<span class="rep-pager" data-rep-pager>${repIcoBtn('previous','Previous page',`repPageStep(-1)`,at>0?'':'disabled')}<span class="mut small">Page ${at+1} of ${r.pages.length}</span>${repIcoBtn('next','Next page',`repPageStep(1)`,at<r.pages.length-1?'':'disabled')}</span>`:'';
 const acts=repEditOn?`${dirty?'<span class="rep-unsaved" data-rep-unsaved>● Unsaved changes</span>':''}<button type="button" class="sm" data-rep-settings onclick="repSettingsOpen(event)">${ico('settings','icon-inline')} Report settings</button><button type="button" class="sm" data-rep-cancel onclick="repCancelEdit()">Cancel</button><button type="button" class="pri sm" data-rep-save onclick="repSaveEdit()">Save</button>`
  :`${pager}${saved?`<button type="button" class="sm rep-pin${repPinned(r.id)?' on':''}" data-rep-pin="${esc(r.id)}" title="${repPinned(r.id)?'Unpin':'Pin'}" aria-label="${repPinned(r.id)?'Unpin':'Pin'}" onclick="repPinToggle(this.dataset.repPin)">${repPinned(r.id)?'★':'☆'}</button>`:''}${repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-edit onclick="repEditToggle()">Edit</button>`:''}<button type="button" class="sm" data-rep-copy onclick="repCopyOpen()">Copy</button><button type="button" class="sm" data-rep-print onclick="repPrint()">Print</button>`;
 const tabs=`<div class="tabs rep-pages">${r.pages.map(x=>`${x.sep?'<span class="rep-tab-sep" aria-hidden="true"></span>':''}<button type="button" class="${x.id===p.id?'on':''}" data-rep-page="${esc(x.id)}" onclick="repPageId=this.dataset.repPage;repSelW='';render()"${repEditOn?` oncontextmenu="repPageMenuOpen(event,'${esc(x.id)}')"`:''}>${esc(x.name)}</button>`).join('')}${repEditOn?`<button type="button" data-rep-add-page onclick="repAddPage()">+ Page</button>`:''}</div>`;
 /* Период захватывает ушедшие в архив заказы — сначала их строки с диска. */
 const ranges=repArchiveRanges(r,p),arch=ranges?archiveScopeFor(ranges,repArchiveNeed(r,p)):'none';
 if(!ranges)archiveScopeDrop();
 const ready=arch==='loading'?'':repPageReady(r,p),wait=arch==='loading'?archiveFactsText(archiveScope):ready==='wait'?repBuildText(repBuild):'';
 const body=wait?`<div class="card mut" data-rep-archive-wait>${esc(wait)}</div>`:(n||repEditOn?repSheetMark(p,r.pages.indexOf(p)+1):'')+p.widgets.map((w,i)=>repWidgetCard(r,w,i,n)).join('')+(repEditOn?`<button type="button" class="card rep-add" data-rep-add onclick="repAddWidget()">+ Add chart</button>`:n?'':'<div class="card mut">This page is empty.</div>');
 return `<div class="card rep-head"><div class="rep-head-row">${head}<span class="sales-toolbar-sp"></span>${ready==='stale'?`<span class="mut small" data-rep-updating>${esc(repBuildText(repBuild,true))}</span>`:''}${acts}</div>${!can&&!repEditOn?`<div class="mut small">${r.ownerId?'Shared with you':'Starter report'} · Copy to change it</div>`:''}${tabs}${repControls(r)}</div><div class="rep-ws">${body}</div>`;
}
function viewReports(){
 repPicks=[];
 const r=repOpenReport();if(!r){repOpenId='';repEditOn=false;}
 repCustomCur=r&&r.custom||[];repColorsCur=r&&r.colors||{};
 /* Edit (выбор владельца 05.11.2026): листы слева (вариант 3), свойства блока и
    колонка Data справа (вариант 1); список отчётов спрятан. */
 if(r&&repEditOn){const folded=repUi().pagesHidden===true;
  return `<div class="rep-app rep-edit${folded?' pages-folded':''}">${repPagesPanel(r,folded)}<div class="rep-main">${repMain(r)}</div>${repSetup(r)}${repDataPanel(r)}</div>${repMenuHTML(r)}`;}
 const hide=repCatHidden();
 return `<div class="rep-app${hide?' flat':''}">${hide?'':repCatalog()}<div class="rep-main">${hide?repCatBar(r):''}${repMain(r)}</div></div>${repMenuHTML(r)}`;
}

/* ---------------- Edit по образцу Looker (часть Б, выбор владельца 05.11.2026) ---------------- */
let repPropTab='setup',repDataQ='',repDataSrc='',repDragKey=null,repPageDrag='';
const REP_TYPE_ICO={
 number:'<svg viewBox="0 0 22 16" width="22" height="16"><rect x="1" y="1" width="20" height="14" rx="2" fill="none" stroke="currentColor"/><text x="11" y="11.5" font-size="7.5" text-anchor="middle" fill="currentColor" font-weight="700">123</text></svg>',
 table:'<svg viewBox="0 0 22 16" width="22" height="16"><rect x="1" y="1" width="20" height="14" rx="2" fill="none" stroke="currentColor"/><path d="M1 5h20M1 10h20M8 1v14" stroke="currentColor"/></svg>',
 bars:'<svg viewBox="0 0 22 16" width="22" height="16"><path d="M2 3h12M2 8h17M2 13h8" stroke="currentColor" stroke-width="3"/></svg>',
 columns:'<svg viewBox="0 0 22 16" width="22" height="16"><path d="M3 15V7M8 15V3M13 15V9M18 15V5" stroke="currentColor" stroke-width="3"/></svg>',
 combo:'<svg viewBox="0 0 22 16" width="22" height="16"><path d="M3 15V6M9 15V3M15 15V8" stroke="currentColor" stroke-width="4" opacity=".45"/><path d="M3 15V10M9 15V8M15 15V12" stroke="currentColor" stroke-width="1.6"/></svg>',
 line:'<svg viewBox="0 0 22 16" width="22" height="16"><path d="M1 13l5-5 4 3 5-7 6 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
 pie:'<svg viewBox="0 0 22 16" width="22" height="16"><circle cx="11" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 8V1.5A6.5 6.5 0 0 1 17.5 8z" fill="currentColor"/></svg>'
};
/* Style — коротко: заголовок, ширина, высота, итог у таблицы, цвета; Reset to default. */
function repStyleHTML(w){
 const rows=[`<h5>Title</h5><input type="text" data-rep-title value="${esc(w.title)}" placeholder="${esc(repWidgetTitle(Object.assign({},w,{title:''})))}" onchange="repSetW('title',this.value)">`,
  `<h5>Size</h5><div class="sl-row"><select aria-label="Width" onchange="repSetW('width',this.value)">${repOpt([['full','Full width'],['half','Half width']],w.width)}</select><input type="number" min="80" step="20" aria-label="Height, px" placeholder="Height · auto" value="${w.h||''}" onchange="repSetW('h',this.value)"></div><div class="hint">Or drag the corner of the chart.</div>`];
 if(w.type==='table')rows.push(`<h5>Table</h5><label class="rep-inline"><input type="checkbox" ${w.opts.totals?'checked':''} onchange="repSetW('opts.totals',this.checked)"> Total row</label><div class="hint">Columns, widths and order — the gear and headers of the table.</div>`);
 if(w.type!=='number'&&w.type!=='table'&&w.type!=='line')rows.push(`<h5>Colors</h5><div class="hint">Click a color in the legend to change it.</div>`);
 rows.push(`<div class="sl-row" style="margin-top:12px"><button type="button" class="sl-btn" data-rep-style-reset onclick="repStyleReset()">${ico('reset','icon-inline')} Reset to default</button></div>`);
 return rows.join('');
}
function repStyleReset(){repWEdit(w=>{w.title='';w.width='full';w.h=0;w.opts.totals=true;w.tv={hide:[],order:[],cw:{}};});}
/* Report settings — редкое: папка, кто видит, Show on, удалить отчёт. */
function repSettingsOpen(e){if(e)e.stopPropagation();repMenu={kind:'settings',x:0,y:0};render();}
function repSettingsHTML(r){
 const folders=[...new Set((DB.report||[]).map(x=>x.folder).filter(Boolean))],saved=!!repFind(r.id),n=r.screens.stations.length+r.screens.people.length;
 return `<div class="sl-backdrop rep-shade" onclick="repMenu=null;render()"></div><div class="rep-modal" role="dialog" aria-label="Report settings" data-rep-settings-box><div class="rep-setup-head"><h3>Report settings</h3><button type="button" class="rep-ib" title="Close" aria-label="Close" onclick="repMenu=null;render()">${ico('close')}</button></div>
  <label>Folder</label><input type="text" list="repFolders" data-rep-folder value="${esc(r.folder)}" placeholder="Folder / sub-folder" onchange="repSetMeta('folder',this.value)"><datalist id="repFolders">${folders.map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
  <label>Who sees it</label><select data-rep-share onchange="repSetMeta('share',this.value)">${repOpt([['me','Only me'],['all','Everyone with Reports']],r.share==='all'?'all':'me')}</select>
  ${repCanScreens()?`<label>Show on</label><button type="button" class="sl-btn" data-rep-screens onclick="repOpenScreens(event)" title="Station boards and people's Overview">Station boards and Overview${n?' · '+n:''}</button>`:''}
  <div class="rep-modal-foot">${saved?`<button type="button" class="sm dl" data-rep-delete onclick="repMenu=null;repDeleteOpen()">Delete report</button>`:''}<span class="sales-toolbar-sp"></span><button type="button" class="pri sm" onclick="repMenu=null;render()">Done</button></div></div>`;
}
/* Листы слева (как Report Pages в Looker): клик — лист, перетаскивание — порядок,
   правая кнопка — меню листа; разделитель — черта над листом. «‹» сворачивает. */
function repPagesPanel(r,folded){
 const p=repPage(r);
 if(folded)return `<div class="card rep-pages-panel folded" data-rep-pages-panel><button type="button" class="rep-ib" title="Pages" aria-label="Show pages" onclick="repUiSet(v=>{v.pagesHidden=false;});render()">${ico('next')}</button></div>`;
 return `<div class="card rep-pages-panel" data-rep-pages-panel><div class="rep-setup-head"><h3>Pages</h3><button type="button" class="rep-ib" title="Hide pages" aria-label="Hide pages" onclick="repUiSet(v=>{v.pagesHidden=true;});render()">${ico('previous')}</button></div>
  <div class="rep-plist">${r.pages.map(x=>`${x.sep?'<div class="rep-psep" aria-hidden="true"></div>':''}<button type="button" class="rep-pitem${x.id===p.id?' on':''}" draggable="true" data-rep-pitem="${esc(x.id)}" onclick="repPageId='${esc(x.id)}';repSelW='';render()" oncontextmenu="repPageMenuOpen(event,'${esc(x.id)}')" ondragstart="repPageDrag='${esc(x.id)}'" ondragover="event.preventDefault()" ondrop="event.preventDefault();repPageDrop('${esc(x.id)}')"><span class="rep-grip" aria-hidden="true">⋮⋮</span><span class="rep-pname" data-raw>${esc(x.name)}</span><span class="mut small">${x.orient==='landscape'?'L':'P'}</span></button>`).join('')}</div>
  <button type="button" class="sl-btn rep-padd" data-rep-add-page onclick="repAddPage()">+ Page</button><button type="button" class="sl-btn rep-padd" data-rep-add-sep onclick="repPageSep(repPage(repOpenReport()).id)">+ Separator</button>
  <div class="hint">Right-click a page: name, Portrait / Landscape, delete.</div></div>`;
}
function repPageStep(d){const r=repOpenReport();if(!r)return;const i=r.pages.indexOf(repPage(r)),p=r.pages[i+d];if(!p)return;repPageId=p.id;repSelW='';render();}
function repPageMenuOpen(e,pid){e.preventDefault();e.stopPropagation();repMenu={kind:'page',pid,x:e.clientX,y:e.clientY};render();}
function repPageMenuHTML(r,m,style){
 const p=r.pages.find(x=>x.id===m.pid);if(!p)return '';const i=r.pages.indexOf(p),item=(attr,label,on,cls,dis)=>`<button type="button" role="menuitem" class="${cls||''}" ${attr} ${dis?'disabled':''} onclick="${on}">${label}</button>`;
 return `<div class="sl-ctx rep-page-menu" style="${style}" role="menu" data-rep-page-menu>${item('data-rep-page-rename','Rename…',`repPageRename('${esc(p.id)}')`)}${item('data-rep-orient="portrait"','Portrait'+(p.orient!=='landscape'?' ✓':''),`repPageSet('${esc(p.id)}','orient','portrait')`)}${item('data-rep-orient="landscape"','Landscape'+(p.orient==='landscape'?' ✓':''),`repPageSet('${esc(p.id)}','orient','landscape')`)}<hr>${item('','Move up',`repPageMove('${esc(p.id)}',-1)`,'',!i)}${item('','Move down',`repPageMove('${esc(p.id)}',1)`,'',i>=r.pages.length-1)}${item('data-rep-page-dup','Duplicate page',`repPageDup('${esc(p.id)}')`)}${item('data-rep-page-sep',p.sep?'Remove separator above':'Separator above',`repPageSep('${esc(p.id)}')`)}<hr>${item('data-rep-page-del','Delete page',`repMenu=null;repPageId='${esc(p.id)}';repDelPage()`,'dl',r.pages.length<2)}</div>`;
}
function repPageEdit(pid,fn){repMenu=null;repEditCur(r=>{const p=r.pages.find(x=>x.id===pid);if(p)fn(p,r);});}
function repPageSet(pid,k,v){repPageEdit(pid,p=>{p[k]=v;});}
function repPageRename(pid){const r=repOpenReport(),p=r&&r.pages.find(x=>x.id===pid);if(!p)return;const v=prompt('Page name',p.name);if(v===null||!v.trim()){repMenu=null;render();return;}repPageEdit(pid,x=>{x.name=v.trim().slice(0,60);});}
function repPageSep(pid){repPageEdit(pid,p=>{p.sep=!p.sep;});}
function repPageMove(pid,d){repPageEdit(pid,(p,r)=>{const i=r.pages.indexOf(p),j=i+d;if(j<0||j>=r.pages.length)return;r.pages.splice(i,1);r.pages.splice(j,0,p);});}
function repPageDup(pid){let nid='';repPageEdit(pid,(p,r)=>{const c=JSON.parse(JSON.stringify(p));c.id=repUid('PG');c.name=(p.name+' copy').slice(0,60);c.sep=false;c.widgets.forEach(w=>{w.id=repUid('W');});r.pages.splice(r.pages.indexOf(p)+1,0,c);nid=c.id;});if(nid){repPageId=nid;render();}}
function repPageDrop(to){const from=repPageDrag;repPageDrag='';if(!from||from===to)return;repEditCur(r=>{const a=r.pages.findIndex(x=>x.id===from),b=r.pages.findIndex(x=>x.id===to);if(a<0||b<0)return;const [p]=r.pages.splice(a,1);r.pages.splice(b,0,p);});}
/* Колонка Data: поля источника выбранного графика с типом и поиском; поле
   тянут в Setup (или нажимают — встаёт в Dimension / Metrics); «+ Field» — свой показатель. */
function repDataPanel(r){
 const w=repSelWidget(r),key=w?w.q.source:(REP_SRC[repDataSrc]?repDataSrc:Object.keys(REP_SRC).find(repSourceAllowed)),S=REP_SRC[key];
 if(!S)return '<div class="card rep-data-panel" data-rep-data></div>';
 const q=repDataQ.trim().toLowerCase(),hit=l=>!q||String(l).toLowerCase().includes(q);
 const dims=repFields(S).filter(f=>f.type!=='num'&&hit(f.label)).map(f=>[f.type==='date'?'DATE':'ABC',f.type==='date'?'d':'',f.label,'dim',f.type==='date'?f.k+':month':f.k]);
 const mk=new Set(),mets=repMetricOptions(S).filter(m=>!mk.has(m[0])&&mk.add(m[0])&&hit(m[1])).map(m=>[/^cm:/.test(m[0])?'fx':'123','n',m[1],'metric',m[0]]);
 const row=([t,c,l,kind,k])=>`<div class="rep-field" draggable="true" data-rep-field="${esc(k)}" data-kind="${kind}" title="${w?'Drag into Setup, or click to add':'Pick a chart first'}" ondragstart="repDragKey={kind:'${kind}',k:this.dataset.repField}" onclick="repFieldClick('${kind}',this.dataset.repField)"><i class="${c}">${t}</i><span data-raw>${esc(l)}</span></div>`;
 return `<div class="card rep-data-panel" data-rep-data><h3>Data</h3><input type="search" class="rep-data-q" placeholder="Search fields…" value="${esc(repDataQ)}" oninput="repDataQ=this.value;repDataRefresh()" aria-label="Search fields">
  ${w?`<div class="rep-data-src"><b data-raw>${esc(S.label)}</b><span class="mut small">${esc(S.group||'')}</span></div>`:`<select aria-label="Data source" onchange="repDataSrc=this.value;render()">${repSrcOptions(key)}</select>`}
  <div class="rep-fields" data-rep-fields><h5>Dimensions</h5>${dims.map(row).join('')||'<div class="mut small">No fields</div>'}<h5>Metrics</h5>${mets.map(row).join('')||'<div class="mut small">No fields</div>'}</div>
  ${w?`<button type="button" class="sl-btn" data-rep-add-field onclick="repCmOpen('')">+ Field</button>`:''}<div class="hint">Sources: ${esc(REP_GROUPS.join(' · '))}</div></div>`;
}
function repDataRefresh(){const el=document.querySelector('[data-rep-data]');const r=repOpenReport();if(!el||!r)return;const pos=el.querySelector('.rep-data-q').selectionStart;el.outerHTML=repDataPanel(r);const q=document.querySelector('[data-rep-data] .rep-data-q');if(q){q.focus();try{q.setSelectionRange(pos,pos);}catch(e){}}}
function repDragOver(e){if(!repDragKey)return;e.preventDefault();e.currentTarget.classList.add('over');}
function repDropField(e,zone){e.preventDefault();e.currentTarget.classList.remove('over');const d=repDragKey;repDragKey=null;if(d)repPlaceField(d.kind,d.k,zone);}
function repFieldClick(kind,k){const r=repOpenReport(),w=r&&repSelWidget(r);if(!w)return;repPlaceField(kind,k,kind==='metric'?'metric':!w.q.dims[0]?'dim0':w.q.dims[0]===k?'dim0':'dim1');}
function repPlaceField(kind,k,zone){
 const r=repOpenReport(),w=r&&repSelWidget(r);if(!w)return;
 if(zone==='metric'){if(kind!=='metric')return;if(w.q.metrics.includes(k))return;repWEdit(x=>{x.q.metrics=(x.q.metrics.length?x.q.metrics:[]).concat([k]);x.q.sort=null;});return;}
 if(kind!=='dim')return;
 if(zone==='dim0'||zone==='dim1'){repSetDim(zone==='dim0'?0:1,k);return;}
 if(zone==='filter'){const f=k.split(':')[0];repWEdit(x=>{x.q.filters.push({f,op:'in',v:[]});});}
}
/* Фильтры отчёта в Edit — таблетки с × внутри и «+ Filter» в том же ряду. */
function repAddCtlOpen(e){if(e)e.stopPropagation();repMenu=Object.assign({kind:'addctl'},repAt(e));render();}
function repAddCtlHTML(r,style){
 const labels=repControlFields(r),free=[...labels.keys()].filter(f=>!r.controls.includes(f));
 return `<div class="sl-menu rep-colmenu" style="${style}" role="menu" data-rep-addctl-menu><h5>Filter by</h5>${free.map(f=>`<button type="button" class="sl-btn" data-rep-addctl="${esc(f)}" onclick="repMenu=null;repAddControl('${esc(f)}')">${esc(labels.get(f))}</button>`).join('')||'<div class="mut">Every field is already here.</div>'}</div>`;
}
