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
let repOpenId='',repPageId='',repEditOn=false,repSelW='',repQ='',repFolderSel='All',repMenu=null,repPicks=[],repDraft=null,repDraftBase='';
const REP_VIEW_KEY='glass_erp_report_view_v1';
function repViewAll(){try{const v=JSON.parse(localStorage.getItem(REP_VIEW_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return {};}}
function repView(id){const v=repViewAll()[id];return v&&typeof v==='object'?v:{};}
function repViewSet(id,fn){const all=repViewAll(),v=all[id]&&typeof all[id]==='object'?all[id]:{};fn(v);all[id]=v;try{localStorage.setItem(REP_VIEW_KEY,JSON.stringify(all));}catch(e){}}
function repOpenReport(){if(repDraft&&repDraft.id===repOpenId)return repDraft;const r=repFind(repOpenId);return r&&repVisible(r)?r:null;}
/* Черновик правки: новый (ещё не в базе) — всегда несохранён. */
function repDirty(){return !!repDraft&&(!repFind(repDraft.id)||JSON.stringify(repDraft)!==repDraftBase);}
function repCanLeave(){return !repDirty()||confirm('Leave without saving the report?');}
function repDropDraft(){repDraft=null;repDraftBase='';repEditOn=false;repSelW='';repMenu=null;}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(function(k,go){if(tab!=='reports'||k==='reports')return false;if(!repCanLeave())return true;repDropDraft();return false;});
window.addEventListener('beforeunload',function(e){if(!repDirty())return;e.preventDefault();e.returnValue='';});
/* Фильтры зрителя: свои в этом браузере, иначе — сохранённые в отчёте. */
function repViewFilters(r){const v=repView(r.id);return v.f!==undefined?v.f:r.filters||{};}
function repPage(r){return r?r.pages.find(p=>p.id===repPageId)||r.pages[0]:null;}
function repSelWidget(r){const p=repPage(r);return p?p.widgets.find(w=>w.id===repSelW)||null:null;}
function repCtx(){const u=typeof signinUser==='function'?signinUser():null;return {person:u?u.name:'',station:''};}
function repDateText(d){if(!d)return 'All time';if(d.from||d.to)return (d.from?salesListShortDay(d.from):'…')+' – '+(d.to?salesListShortDay(d.to):'…');const p=REP_PRESETS.find(x=>x[0]===d.preset);return p?p[1]:'All time';}
/* Запрос графика с периодом и фильтрами отчёта (если график не задал свой
   период): фильтр отчёта действует там, где у источника есть это поле. */
function repWidgetQuery(r,w){
 const q=JSON.parse(JSON.stringify(w.q)),v=repView(r.id),S=REP_SRC[q.source];
 if(q.date.use!=='own'){const d=v.date||r.date;q.date=Object.assign({},q.date,{preset:d.preset||'',from:d.from||'',to:d.to||''});}
 Object.entries(repViewFilters(r)).forEach(([f,vals])=>{if(Array.isArray(vals)&&vals.length&&S&&repField(S,f))q.filters.push({f,op:'in',v:vals});});
 return q;
}

/* ------------------------------ Каталог ------------------------------ */
function repFolderOf(r){return r.folder||'Unfiled';}
function repCatalog(){
 const list=(DB.report||[]).filter(repVisible),q=repQ.trim().toLowerCase(),folders=[...new Set(list.map(repFolderOf))].sort((a,b)=>a.localeCompare(b));
 const inFolder=r=>repFolderSel==='All'||repFolderOf(r)===repFolderSel,shown=list.filter(r=>q?(r.name+' '+r.folder).toLowerCase().includes(q):inFolder(r)).sort((a,b)=>a.name.localeCompare(b.name));
 const src=r=>{const s=[...new Set(r.pages.flatMap(p=>p.widgets.map(w=>(REP_SRC[w.q.source]||{}).label)).filter(Boolean))];return s.slice(0,2).join(', ')+(s.length>2?' +'+(s.length-2):'');};
 return `<div class="card rep-cat" data-rep-catalog><div class="rep-cat-head"><h3>Reports</h3><button type="button" class="pri sm" data-rep-new onclick="repNew()">+ New</button></div>
  <input type="search" class="rep-search" data-rep-search placeholder="Search ${list.length} reports…" value="${esc(repQ)}" oninput="repQ=this.value;render()">
  <div class="rep-folders">${['All'].concat(folders).map(f=>{const n=f==='All'?list.length:list.filter(r=>repFolderOf(r)===f).length;return `<button type="button" class="rep-folder${!q&&repFolderSel===f?' on':''}" data-rep-folder="${esc(f)}" onclick="repFolderSel=this.dataset.repFolder;repQ='';render()"><span data-raw>${esc(f)}</span><span>${n}</span></button>`;}).join('')}</div>
  <div class="rep-list">${shown.map(r=>`<button type="button" class="rep-item${r.id===repOpenId?' on':''}" data-rep-item="${esc(r.id)}" onclick="repOpen(this.dataset.repItem)"><b data-raw>${esc(r.name)}</b><small data-raw>${esc(src(r))} · ${esc(repDateText(r.date))}</small></button>`).join('')||'<div class="mut">Nothing found.</div>'}</div></div>`;
}

/* ------------------------------ Графики ------------------------------ */
function repDelta(cur,prev){if(cur==null||prev==null||!prev)return '';const d=(cur-prev)/Math.abs(prev)*100;return (d>=0?'▲ ':'▼ ')+Math.abs(d).toFixed(Math.abs(d)<10?1:0)+'%';}
function repCmpText(res){const c=res.compare;return c?(c.kind==='year'?'vs last year':'vs previous period'):'';}
/* Цвет значения разбивки — по его месту в полном списке значений поля, а не
   в выборке: фильтр не перекрашивает (dataviz). */
function repSeriesCls(S,d,keys){
 const p=repDimParse(d),all=repIsTime(S,d)?keys:repFieldValues(S,p.f),rank=k=>{const i=all.indexOf(k);return i<0?9999:i;};
 const order=keys.filter(k=>k!=='__other').slice().sort((a,b)=>rank(a)-rank(b)),m=new Map();order.forEach((k,i)=>m.set(k,'ch-s'+(i%8+1)));m.set('__other','ch-so');return m;
}
function repPickAttrs(r,S,d,k){
 const p=repDimParse(d),f=repField(S,p.f);if(!f||f.type==='date'||k==='__other'||k==='—')return '';
 repPicks.push([r.id,p.f,k]);const i=repPicks.length-1;return ` role="button" tabindex="0" data-rep-pick="${esc(p.f)}" onclick="repPickAt(${i})" onkeydown="if(event.key==='Enter')repPickAt(${i})"`;
}
function repPickAt(i){const x=repPicks[i],r=repOpenReport();if(!x||!r)return;const base=Object.assign({},repViewFilters(r));repViewSet(x[0],v=>{v.f=Object.assign(base,{[x[1]]:[x[2]]});});repMenu=null;render();}
function repNumbers(res){
 /* Сравнение — изменение и само число прошлого периода: «▲ 12% · Last year 231». */
 const sub=(m,i)=>{if(!res.compare)return '';const d=repDelta(res.total[i],res.compare.total[i]);return esc((d?d+' · ':'')+(res.compare.kind==='year'?'Last year ':'Previous ')+repFmt(m,res.compare.total[i]));};
 return `<div class="ch-stats rep-nums">${res.metrics.map((m,i)=>chartStat(m.label,esc(repFmt(m,res.total[i])),sub(m,i),` data-rep-number="${esc(m.k)}"`)).join('')}</div>`;
}
function repTableHTML(r,S,res,w){
 const ms=res.metrics,d1=res.dims[0],d2=res.dims[1],MAX=200,cmp=res.compare&&!d2;
 if(!d1)return `<div class="sales-table-wrap"><table class="sl-table rep-table"><thead><tr>${ms.map(m=>`<th class="n">${esc(m.label)}</th>`).join('')}</tr></thead><tbody><tr>${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`).join('')}</tr></tbody></table></div>`;
 const keys=res.keys,label=k=>repKeyText(S,d1,k);let head,body,foot='';
 if(d2){
  const m=ms[0],k2=res.keys2;
  head=`<th>${esc(repDimLabel(S,d1))}</th>${k2.map(k=>`<th class="n" data-raw>${esc(repKeyText(S,d2,k))}</th>`).join('')}<th class="n">Total</th>`;
  body=keys.slice(0,MAX).map(k=>`<tr><td${repPickAttrs(r,S,d1,k)}><b data-raw>${esc(label(k))}</b></td>${k2.map(b=>{const v=(res.cells.get(k+'\u0001'+b)||[])[0];return `<td class="n">${v?esc(repFmt(m,v)):'<span class="mut">·</span>'}</td>`;}).join('')}<td class="n"><b>${esc(repFmt(m,res.rowTotals.get(k)[0]))}</b></td></tr>`).join('');
  if(w.opts.totals)foot=`<tr class="sl-foot"><td><b>Total</b></td>${k2.map(b=>`<td class="n"><b>${esc(repFmt(m,res.colTotals.get(b)[0]))}</b></td>`).join('')}<td class="n"><b>${esc(repFmt(m,res.total[0]))}</b></td></tr>`;
 }else{
  head=`<th>${esc(repDimLabel(S,d1))}</th>${ms.map(m=>`<th class="n">${esc(m.label)}</th>`+(cmp?`<th class="n rep-cmp">${esc(repCmpText(res))}</th>`:'')).join('')}`;
  body=keys.slice(0,MAX).map(k=>`<tr><td${repPickAttrs(r,S,d1,k)}><b data-raw>${esc(label(k))}</b></td>${ms.map((m,i)=>`<td class="n">${esc(repFmt(m,res.rowTotals.get(k)[i]))}</td>`+(cmp?`<td class="n rep-cmp">${esc(repDelta(res.rowTotals.get(k)[i],(res.compare.rowTotals.get(k)||[])[i]))}</td>`:'')).join('')}</tr>`).join('');
  if(w.opts.totals)foot=`<tr class="sl-foot"><td><b>Total</b></td>${ms.map((m,i)=>`<td class="n"><b>${esc(repFmt(m,res.total[i]))}</b></td>`+(cmp?`<td class="n rep-cmp">${esc(repDelta(res.total[i],res.compare.total[i]))}</td>`:'')).join('')}</tr>`;
 }
 return `<div class="sales-table-wrap"><table class="sl-table rep-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table></div>${keys.length>MAX?`<div class="mut">First ${MAX} of ${keys.length}</div>`:''}`;
}
function repParts(res,cls,k){return res.keys2.map(b=>({value:(res.cells.get(k+'\u0001'+b)||[])[0]||0,cls:cls.get(b)}));}
function repLegend(S,res,cls){const d2=res.dims[1];return chartLegend(res.keys2.filter(b=>(res.colTotals.get(b)||[])[0]).map(b=>({label:repKeyText(S,d2,b),cls:cls.get(b)})));}
function repChart(r,w){
 if(!repSourceAllowed(w.q.source))return '<div class="mut">Needs Finance access.</div>';
 const q=repWidgetQuery(r,w),res=repQuery(q,repCtx());if(!res)return '<div class="mut">Choose data.</div>';
 const S=REP_SRC[q.source],m=res.metrics[0],fmt=v=>repFmt(m,v),d1=res.dims[0],d2=res.dims[1];
 if(w.type==='number')return repNumbers(res);
 if(w.type==='table')return repTableHTML(r,S,res,w);
 if(!d1)return repNumbers(res)+'<div class="mut">Choose a dimension to draw this chart.</div>';
 if(!res.count&&!(res.compare&&res.compare.total.some(Boolean)))return '<div class="mut">No data for this period and filters.</div>';
 const cls=d2?repSeriesCls(S,d2,res.keys2):null,text=k=>repKeyText(S,d1,k),every=Math.max(1,Math.ceil(res.keys.length/14));
 if(w.type==='bars'){
  const rows=res.keys.slice(0,40).map(k=>({label:text(k),value:res.rowTotals.get(k)[0]||0,parts:d2?repParts(res,cls,k):null,attrs:repPickAttrs(r,S,d1,k),title:text(k)+': '+fmt(res.rowTotals.get(k)[0])}));
  return (d2?repLegend(S,res,cls):'')+chartHBars(rows,{fmt,label:w.title})+(res.keys.length>40?'<div class="mut">Top 40 — set Top N</div>':'');
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
  let keys=res.keys.filter(k=>(res.rowTotals.get(k)[0]||0)>0);const pc=repSeriesCls(S,d1,keys.slice(0,7));
  const parts=keys.slice(0,7).map(k=>({label:text(k),value:res.rowTotals.get(k)[0],cls:pc.get(k),attrs:repPickAttrs(r,S,d1,k)}));
  if(keys.length>7)parts.push({label:'Other',value:keys.slice(7).reduce((n,k)=>n+(res.rowTotals.get(k)[0]||0),0),cls:'ch-so'});
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
 return `<div class="card rep-w${w.width==='half'?' half':''}${sel?' sel':''}" data-rep-widget="${esc(w.id)}" data-rep-type="${w.type}"${repEditOn&&!sel?` onclick="if(!event.target.closest('button,[role=button],input,select'))repSelectWidget('${esc(w.id)}')"`:''}><div class="rep-wh"><h3 data-raw>${esc(repWidgetTitle(w))}</h3><span class="mut">${esc(src?src.label:'')}${esc(own)}</span>${tools}</div>${repChart(r,w)}</div>`;
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
 return `<div class="rep-bar"><button type="button" class="sl-quiet rep-ctl-date" data-rep-date onclick="repOpenDate(event)">Date: ${esc(repDateText(v.date||r.date))}<span class="sl-disclosure">▾</span></button>${keys.map(btn).join('')}${repEditOn&&free.length?`<select class="rep-add-ctl" aria-label="Add control" onchange="if(this.value)repAddControl(this.value)"><option value="">+ Control</option>${free.map(f=>`<option value="${esc(f)}">${esc(labels.get(f))}</option>`).join('')}</select>`:''}${v.date||v.f!==undefined?`<button type="button" class="sm" data-rep-reset onclick="repResetView()" title="Back to the report's own period and filters">Reset</button>${!repEditOn&&repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-save-view onclick="repSaveDefaults()" title="Keep this period and these filters in the report">Save as default</button>`:''}`:''}</div>`;
}
function repMenuHTML(r){
 const m=repMenu;if(!m||!r)return '';
 const style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-320))}px;top:${Math.max(8,m.y)}px`,back='<div class="sl-backdrop" onclick="repMenu=null;render()"></div>';
 if(m.kind==='date'){
  const cur=repView(r.id).date||r.date;
  return back+`<div class="sl-menu rep-menu" style="${style}" data-rep-date-menu><h5>Period</h5><div class="sl-presets">${REP_PRESETS.map(([k,l])=>`<button type="button" class="sl-btn${!cur.from&&!cur.to&&cur.preset===k?' on':''}" onclick="repSetViewDate({preset:'${k}'})">${l}</button>`).join('')}</div>
   <h5>Custom</h5><div class="sl-row"><input type="date" id="repFrom" value="${esc(cur.from||'')}"><input type="date" id="repTo" value="${esc(cur.to||'')}"></div><div class="sl-actions"><button type="button" class="pri" onclick="repSetViewDate({from:document.getElementById('repFrom').value,to:document.getElementById('repTo').value})">Apply</button></div></div>`;
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
function repOpenDate(e){if(e)e.stopPropagation();repMenu=Object.assign({kind:'date'},repAt(e));render();}
function repOpenCtl(e,f){if(e)e.stopPropagation();const r=repOpenReport();repMenu=Object.assign({kind:'ctl',f,draft:(repViewFilters(r)[f]||[]).slice(),search:''},repAt(e));render();}
function repCtlToggle(v,on){if(!repMenu)return;repMenu.draft=repMenu.draft.filter(x=>x!==v);if(on)repMenu.draft.push(v);}
function repCtlApply(){const r=repOpenReport(),m=repMenu;if(!r||!m)return;const base=Object.assign({},repViewFilters(r));if(m.draft.length)base[m.f]=m.draft.slice();else delete base[m.f];repViewSet(r.id,v=>{v.f=base;});repMenu=null;render();}
function repClearCtl(f){const r=repOpenReport();if(!r)return;const base=Object.assign({},repViewFilters(r));delete base[f];repViewSet(r.id,v=>{v.f=base;});render();}
function repSetViewDate(d){const r=repOpenReport();if(!r)return;repViewSet(r.id,v=>{v.date={preset:d.preset||'',from:d.from||'',to:d.to||''};});repMenu=null;render();}
function repResetView(){const r=repOpenReport();if(!r)return;repViewSet(r.id,v=>{delete v.date;delete v.f;});repMenu=null;render();}
/* Save as default: свой период и фильтры становятся периодом и фильтрами отчёта. */
function repSaveDefaults(){const r=repOpenReport();if(!r||repDraft)return;const v=repView(r.id);if(repEditReport(r.id,x=>{if(v.date)x.date=v.date;if(v.f!==undefined)x.filters=v.f;}))repResetView();}

/* ------------------------------ Настройка графика ------------------------------ */
function repOpt(list,cur,none){return (none?`<option value="">${esc(none)}</option>`:'')+list.map(([k,l])=>`<option value="${esc(k)}"${k===cur?' selected':''}>${esc(l)}</option>`).join('');}
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
  <h5>Dimension</h5><select data-rep-dim="0" onchange="repSetDim(0,this.value)">${repOpt(dims,q.dims[0]||'','None — totals only')}</select>
  ${w.type!=='number'&&w.type!=='pie'?`<h5>Breakdown</h5><select data-rep-dim="1" onchange="repSetDim(1,this.value)">${repOpt(dims.filter(d=>d[0]!==q.dims[0]),q.dims[1]||'','None')}</select>`:''}
  <h5>Metrics</h5>${(q.metrics.length?q.metrics:[S.metrics[0].k]).map((k,i)=>{const c=repCalcParse(k),del=q.metrics.length>1?`<button type="button" class="sm dl" onclick="repDelMetric(${i})">×</button>`:'';
   if(!c)return `<div class="sl-row"><select data-rep-metric="${i}" onchange="repSetMetric(${i},this.value)">${repOpt(mets,k)}</select>${del}</div>`;
   const num=/^n:/.test(c.b);
   return `<div class="rep-calc" data-rep-calc="${i}"><div class="sl-row"><select aria-label="First metric" onchange="repSetCalc(${i},'a',this.value)">${repOpt(mets,c.a)}</select>${del}</div><div class="sl-row"><select aria-label="Operation" onchange="repSetCalc(${i},'op',this.value)">${repOpt(REP_CALC_OPS,c.op)}</select><select aria-label="Second metric or number" onchange="repSetCalc(${i},'b',this.value)">${repOpt([['n:','Number']].concat(mets),num?'n:':c.b)}</select>${num?`<input type="number" step="any" aria-label="Number" value="${esc(c.b.slice(2))}" onchange="repSetCalc(${i},'n',this.value)">`:''}</div></div>`;}).join('')}
  <div class="sl-row"><button type="button" class="sl-btn" data-rep-add-metric onclick="repAddMetric()">+ Add metric</button><button type="button" class="sl-btn" data-rep-add-calc onclick="repAddCalc()" title="Metric ÷ × + − another metric or a number">+ Calculated</button></div>
  <h5>Filter</h5>${q.filters.map((f,i)=>repFilterRow(S,f,i)).join('')}<button type="button" class="sl-btn" data-rep-add-filter onclick="repAddFilter()">+ Add filter</button>
  <h5>Date range</h5>${dates.length>1?`<select aria-label="Date field" onchange="repSetW('date.f',this.value)">${repOpt(dates.map(k=>[k,repField(S,k).label]),q.date.f||dates[0])}</select>`:''}
  <select data-rep-date-use onchange="repSetDateUse(this.value)">${repOpt([['report','Report period']].concat(REP_PRESETS).concat([['custom','Custom dates']]),dateCur)}</select>
  ${dateCur==='custom'?`<div class="sl-row"><input type="date" value="${esc(q.date.from)}" onchange="repSetW('date.from',this.value)"><input type="date" value="${esc(q.date.to)}" onchange="repSetW('date.to',this.value)"></div>`:''}
  <select data-rep-compare onchange="repSetW('compare',this.value)">${repOpt(cmp,q.compare||'')}</select>
  <h5>Sort · rows</h5><select data-rep-sort onchange="repSetSort(this.value)">${repOpt(sortOpts,sortCur)}</select>
  <div class="sl-row"><label class="rep-inline">Top <input type="number" min="0" step="1" value="${q.limit||''}" placeholder="all" onchange="repSetW('limit',this.value)"></label><label class="rep-inline"><input type="checkbox" ${q.other?'checked':''} onchange="repSetW('other',this.checked)"> Other row</label></div>
  <h5>Layout</h5><div class="sl-row"><select aria-label="Width" onchange="repSetW('width',this.value)">${repOpt([['full','Full width'],['half','Half width']],w.width)}</select>${w.type==='table'?`<label class="rep-inline"><input type="checkbox" ${w.opts.totals?'checked':''} onchange="repSetW('opts.totals',this.checked)"> Totals</label>`:''}</div></div>`;
}

/* ------------------------------ Команды экрана ------------------------------ */
function repOpen(id){const r=repFind(id);if(!r||!repCanLeave())return;repDropDraft();repOpenId=id;repPageId=r.pages[0].id;render();}
function repStartDraft(r){repDraft=JSON.parse(JSON.stringify(r));repDraftBase=repFind(r.id)?JSON.stringify(repDraft):'';repOpenId=r.id;repPageId=repDraft.pages[0].id;repEditOn=true;repSelW='';repMenu=null;}
function repNew(){if(!repCanLeave())return;repDropDraft();const r=repBlank(repFolderSel!=='All'?repFolderSel:'');repStartDraft(r);repSelW=r.pages[0].widgets[0].id;render();}
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
 if(w.type==='number'||w.type==='pie')w.q.dims=w.type==='number'?[]:w.q.dims.slice(0,1);
});}
function repSetSource(k){const S=REP_SRC[k];if(!S)return;repWEdit(w=>{w.q.source=k;w.q.filters=[];w.q.metrics=[S.metrics[0].k];w.q.dims=w.type==='number'?[]:[repDimOptions(S)[0][0]];w.q.sort=null;w.q.date.f='';});}
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
function repRenamePage(v){const pid=repPage(repOpenReport()).id;repEditCur(r=>{const p=r.pages.find(x=>x.id===pid);if(p)p.name=String(v||'').trim()||p.name;});}
function repMovePage(d){const r=repOpenReport(),pid=repPage(r).id;repEditCur(x=>{const i=x.pages.findIndex(p=>p.id===pid),j=i+d;if(i<0||j<0||j>=x.pages.length)return;const t=x.pages[i];x.pages[i]=x.pages[j];x.pages[j]=t;});}
function repSetMeta(k,v){repEditCur(r=>{if(k==='name')r.name=String(v||'').trim()||r.name;if(k==='folder')r.folder=String(v||'').trim();if(k==='share')r.share=v==='all'?'all':'me';if(k==='date')r.date={preset:v,from:'',to:''};});}
function repAddControl(f){repEditCur(r=>{if(!r.controls.includes(f))r.controls.push(f);});}
function repDelControl(f){repEditCur(r=>{r.controls=r.controls.filter(x=>x!==f);});}

/* ------------------------------ Печать ------------------------------ */
/* Страница отчёта на Letter, светлым: название, период, фильтры, графики.
   Путь печати общий (printSheet); в окне печати есть и «Save as PDF». */
function repPrintHTML(){
 const r=repOpenReport();if(!r)return '';const p=repPage(r),v=repView(r.id),now=new Date();
 const filters=Object.entries(v.f||{}).filter(([f,x])=>x&&x.length).map(([f,x])=>(repControlFields(r).get(f)||f)+': '+x.join(', '));
 repEditOn=false;
 const body=p.widgets.map((w,i)=>repWidgetCard(r,w,i,p.widgets.length)).join('');
 return `<div class="rep-print"><div class="rep-print-head"><h2 data-raw>${esc(r.name)}${r.pages.length>1?' · '+esc(p.name):''}</h2><div>${esc(['Date: '+repDateText(v.date||r.date)].concat(filters).join(' · '))}</div><small>Glass Farm · printed ${esc(now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))} ${esc(now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}))}</small></div><div class="rep-ws">${body}</div></div>`;
}
function repPrint(){const was=repEditOn,html=repPrintHTML();repEditOn=was;repMenu=null;return html&&printSheet(html,'');}

/* ------------------------------ Экран ------------------------------ */
function repMain(r){
 if(!r)return `<div class="card rep-empty" data-rep-empty><h3>Pick a report</h3><p class="mut">Choose one on the left, or start a new one. Every chart can be changed: data, type, dimensions, metrics, filters, period.</p><button type="button" class="pri" onclick="repNew()">+ New report</button></div>`;
 const can=repEditOn||repCanEdit(repFind(r.id)),p=repPage(r),n=p.widgets.length,folders=[...new Set((DB.report||[]).map(x=>x.folder).filter(Boolean))];
 const head=repEditOn?`<div class="rep-title-edit"><input type="text" data-rep-name value="${esc(r.name)}" aria-label="Report name" onchange="repSetMeta('name',this.value)"><input type="text" list="repFolders" value="${esc(r.folder)}" placeholder="Folder" aria-label="Folder" onchange="repSetMeta('folder',this.value)"><datalist id="repFolders">${folders.map(f=>`<option value="${esc(f)}">`).join('')}</datalist>
   <select aria-label="Who sees it" onchange="repSetMeta('share',this.value)">${repOpt([['me','Only me'],['all','Everyone with Reports']],r.share==='all'?'all':'me')}</select><select aria-label="Default period" title="Default period" onchange="repSetMeta('date',this.value)">${repOpt(REP_PRESETS,r.date.preset)}</select></div>`
  :`<h2 class="rep-title" data-raw>${esc(r.name)}</h2>`;
 const dirty=repDirty(),saved=!!repFind(r.id);
 const acts=repEditOn?`${dirty?'<span class="mut small" data-rep-unsaved>Unsaved changes</span>':''}<button type="button" class="pri sm" data-rep-save onclick="repSaveEdit()">Save</button><button type="button" class="sm" data-rep-cancel onclick="repCancelEdit()">Cancel</button><button type="button" class="sm" data-rep-print onclick="repPrint()">Print</button>${saved?`<button type="button" class="sm dl" onclick="repDeleteOpen()">Delete</button>`:''}`
  :`${repCanEdit(repFind(r.id))?`<button type="button" class="sm" data-rep-edit onclick="repEditToggle()">Edit</button>`:''}<button type="button" class="sm" data-rep-copy onclick="repCopyOpen()">Copy</button><button type="button" class="sm" data-rep-print onclick="repPrint()">Print</button>`;
 const tabs=`<div class="tabs rep-pages">${r.pages.map(x=>`<button type="button" class="${x.id===p.id?'on':''}" data-rep-page="${esc(x.id)}" onclick="repPageId=this.dataset.repPage;repSelW='';render()">${esc(x.name)}</button>`).join('')}${repEditOn?`<button type="button" onclick="repAddPage()">+ Page</button>`:''}</div>
  ${repEditOn?`<div class="rep-page-edit"><input type="text" value="${esc(p.name)}" aria-label="Page name" onchange="repRenamePage(this.value)"><button type="button" class="sm" title="Move page left" onclick="repMovePage(-1)">←</button><button type="button" class="sm" title="Move page right" onclick="repMovePage(1)">→</button>${r.pages.length>1?`<button type="button" class="sm dl" onclick="repDelPage()">Delete page</button>`:''}</div>`:''}`;
 const body=p.widgets.map((w,i)=>repWidgetCard(r,w,i,n)).join('')+(repEditOn?`<button type="button" class="card rep-add" data-rep-add onclick="repAddWidget()">+ Add chart</button>`:n?'':'<div class="card mut">This page is empty.</div>');
 return `<div class="card rep-head"><div class="rep-head-row">${head}<span class="sales-toolbar-sp"></span>${acts}</div>${!can&&!repEditOn?`<div class="mut small">${r.ownerId?'Shared with you':'Starter report'} · Copy to change it</div>`:''}${tabs}${repControls(r)}</div><div class="rep-ws">${body}</div>`;
}
function viewReports(){
 repPicks=[];
 const r=repOpenReport();if(!r){repOpenId='';repEditOn=false;}
 const setup=r&&repEditOn?repSetup(r):'';
 return `<div class="rep-app${setup?' editing':''}">${repCatalog()}<div class="rep-main">${repMain(r)}</div>${setup}</div>${repMenuHTML(r)}`;
}
