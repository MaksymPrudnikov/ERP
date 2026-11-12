/* Компактные средства списка Sales: период, Show, статусы, быстрый выбор. Период
   использует тот же фильтр created, что и меню колонки: второго, невидимого
   ограничения здесь нет.
   IN : DB.salesOrder, DB.ncr; настройки списка (erp/views/sales-list*)
   OUT: salesListDateButton, salesListStatusControlHTML, salesListShowMenuHTML,
        salesListFit, salesQuickPick — кнопки и поля над таблицей */
function salesListShowButton(){
 const label=[['orders','Orders'],['quotes','Quotes'],['ncr','NCR']].filter(x=>salesShow[x[0]]).map(x=>x[1]).join(' + ')||'Orders';
 return `<button type="button" class="sl-quiet" data-show-menu aria-label="Show orders or quotes" aria-expanded="${!!salesListMenu&&salesListMenu.kind==='show'}" onclick="salesListOpenShow(event)">${label}<span class="sl-disclosure" aria-hidden="true">▾</span></button>`;
}
function salesListOpenShow(e){salesListMenu=Object.assign({kind:'show',scope:'sales'},salesListAt(e,220));render();}
function salesListShowMenuHTML(style){
 return `<div class="sl-menu sl-show-menu" style="${style}" role="dialog" aria-label="Show orders or quotes">${[['orders','Orders'],['quotes','Quotes'],['ncr','NCR']].map(([key,label])=>{
 const n=key==='ncr'?(DB.ncr||[]).length:(DB.salesOrder||[]).filter(o=>(key==='quotes')===salesIsQuote(o)&&(!salesIsQuote(o)||salesQuoteRepresentative(o).id===o.id)).length;
 const only=salesShow[key]&&['orders','quotes','ncr'].filter(k=>salesShow[k]).length===1;
 return `<label><input type="checkbox" data-show="${key}" ${salesShow[key]?'checked':''} ${only?'disabled':''} onchange="salesToggleShow('${key}')">${label}<small>${n}</small></label>`;
 }).join('')}</div>`;
}
/* Один All (владелец, 2.11.2026): снимает быстрый вид и кнопку статуса; когда
   снимать нечего, прячет и показывает ряд статусов, выбор запоминается. */
function salesQuickPick(key){
 if(key!=='all'){salesQuickSet(key);return;}
 const p=salesListLoadPrefs();
 if(p.quick==='all'&&!salesStatusFilter){p.statusHidden=!p.statusHidden;salesListSavePrefs();render();return;}
 salesStatusFilter='';salesQuickSet('all');
}
let salesListStepNow=0,salesListChipsNow=[],salesListScrollKeep=null;
/* Ступени ширины экрана: на них меняются колонки, подписи и место Created. */
function salesListStep(){return [1200,1400,1600,1620,1800].filter(x=>window.innerWidth>=x).length;}
function salesListShortLabel(s){return window.innerWidth>=1400?s:({'Due this week':'This week','Needs attention':'Attention','Partially shipped':'Partial','Picked up / Delivered':'Delivered'})[s]||s;}
/* Ряд кнопок статусов; на узком экране все статусы в одной кнопке Status. */
function salesListStatusPills(chips){
 const cur=chips.find(c=>c.key===salesStatusFilter);
 if(window.innerWidth<1200)return `<button type="button" class="sl-quick-pill${cur?' on':''}" data-status-menu aria-haspopup="dialog" onclick="salesListOpenStatus(event)">Status: ${esc(cur?salesListShortLabel(cur.label):'All')}<span class="sl-disclosure" aria-hidden="true">▾</span></button>`;
 return '';
}
/* Статусы — второй строкой и только при All (владелец 07.11.2026): на
   Today, Not invoiced и других видах одна строка. Выбранный статус —
   часть All, строка остаётся. */
function salesListStatusRow(chips){
 const p=salesListLoadPrefs();
 if(window.innerWidth<1200||p.statusHidden||p.quick!=='all'&&!salesStatusFilter)return '';
 return `<div class="sl-filter-row sl-status-row">${chips.map(c=>`<button type="button" class="sl-quick-pill sl-status-pill${c.key===salesStatusFilter?' on':''}" aria-pressed="${c.key===salesStatusFilter}" data-status-chip="${esc(c.key)}" onclick="salesSetStatusFilter(${esc(JSON.stringify(c.key))})">${esc(salesListShortLabel(c.label))}<b>${c.n.toLocaleString('en-US')}</b></button>`).join('')}</div>`;
}
function salesListOpenStatus(e){salesListMenu=Object.assign({kind:'status',scope:'sales'},salesListAt(e,220));render();}
function salesListStatusMenuHTML(style){
 return `<div class="sl-menu sl-status-menu" style="${style}" role="dialog" aria-label="Status">${salesListChipsNow.map(c=>`<button type="button" class="sl-btn${c.key===salesStatusFilter?' on':''}" data-status-chip="${esc(c.key)}" onclick="salesListMenu=null;salesSetStatusFilter(${esc(JSON.stringify(c.key))})">${esc(c.label)}<b>${c.n.toLocaleString('en-US')}</b></button>`).join('')}</div>`;
}
/* После отрисовки. Итоги прилипают к низу страницы, а это работает, только
   пока обёртка таблицы не прокручивается. Шире экрана (включили колонку,
   потянули ширины) — таблица крутится сама, итоги внизу её окна. */
function salesListFit(){
 if(typeof salesListQuickDecorate==='function')salesListQuickDecorate();
 document.querySelectorAll('#app table.sl-table').forEach(salesListTableFit);
 const wrap=document.querySelector('#app .sl-foot-pin .sales-table-wrap');if(!wrap||!wrap.firstElementChild)return;
 const foot=(document.querySelector('.app-foot')||{}).offsetHeight||0,wide=wrap.firstElementChild.offsetWidth>wrap.clientWidth+1;
 wrap.style.setProperty('--sl-foot-bottom',foot+'px');wrap.classList.toggle('sl-wide',wide);
 wrap.style.maxHeight=wide?Math.max(260,window.innerHeight-foot-wrap.getBoundingClientRect().top-window.scrollY-12)+'px':'';
 if(wide&&salesListScrollKeep){wrap.scrollLeft=salesListScrollKeep.x;wrap.scrollTop=salesListScrollKeep.y;}
 wrap.classList.toggle('sl-scrolled-x',wrap.scrollLeft>0);
}
/* Таблицу прокрутили вбок — у закреплённых колонок тень: текст уходит под них. */
document.addEventListener('scroll',e=>{const w=e.target;if(w&&w.classList&&w.classList.contains('sales-table-wrap'))w.classList.toggle('sl-scrolled-x',w.scrollLeft>0);},true);
window.addEventListener('resize',()=>{
 if(tab!=='sales'||soEdit!==null){salesListFit();return;}
 if(salesListStep()===salesListStepNow)salesListFit();else render();
});
/* Optimization и Shipping: навигация — своя карточка над таблицей, в ней только вкладки
   (владелец, 05.11.2026); Open, поиск, Open a trip и действия — в ряду карточки таблицы.
   Сразу после отрисовки, до возврата фокуса (nav.js render): кнопки с onclick переносятся как есть. */
function salesListSplitNav(){
 const tabs=document.querySelector('#app .card.sales-list-card>.sl-filter-row:has([data-queue-tab],[data-shipping-tab])');if(!tabs)return;
 const card=tabs.parentElement,nav=document.createElement('div');
 nav.className='card sl-nav-card';nav.appendChild(tabs);
 card.before(nav);card.classList.add('sl-after-nav');
}
/* Список с меню колонок (заголовки data-col) после отрисовки:
   - Freeze: галочка и закреплённые колонки — первые N ячеек строки, им
     position:sticky и left (--fz1…, по ширине заголовков), класс fz-N;
   - пустая ячейка — серый «–» на месте значения, длинное «—» — тоже «–»
     (владелец, 05.11.2026, вариант 1). Подгрузка строк (list-window) зовёт
     ещё раз. Подрядные строки производства (pb-sub) пустые нарочно. */
const SL_FRZ_MAX=12;
function salesListTableFit(table){
 const head=table.tHead&&table.tHead.rows[0];if(!head)return;
 const ths=[...head.cells],lead=ths.findIndex(th=>th.dataset.col);if(lead<0)return;
 const frozen=salesListLoadPrefs().frozen||[];let n=0;
 ths.forEach(th=>{const on=!!th.dataset.col&&frozen.includes(th.dataset.col);th.classList.toggle('sl-frz-col',on);if(on)n++;});
 const N=n?Math.min(SL_FRZ_MAX,lead+n):0;
 table.className=table.className.replace(/\s*\bfz-\d+\b/g,'');table.classList.toggle('sl-frz',!!N);
 if(N){table.classList.add('fz-'+N);let x=0;for(let i=0;i<N;i++){table.style.setProperty('--fz'+(i+1),x+'px');x+=ths[i].getBoundingClientRect().width;}}
 salesListDashes(table,ths,lead);
}
function salesListDashes(table,ths,lead){
 const span=ths.length,end=ths[span-1].dataset.col?span:span-1;
 [...table.tBodies].forEach(tb=>[...tb.rows].forEach(tr=>{
  if(tr.cells.length!==span||tr.classList.contains('pb-sub'))return;
  for(let i=lead;i<end;i++){
   const td=tr.cells[i],t=td.textContent.trim();
   if(t&&t!=='—'&&t!=='-')continue;
   if(td.querySelector('input,select,button,textarea,img,svg,canvas'))continue;
   td.innerHTML='<span class="mut sl-dash">–</span>';
  }
 }));
}
function salesListToggleStatuses(){const p=salesListLoadPrefs();p.statusExpanded=!p.statusExpanded;salesListSavePrefs();render();}
function salesListDateParts(f){
 if(!f||!salesListFilterActive(f))return {preset:'',from:'',to:'',simple:true};
 if(f.mode==='exclude')return {preset:'',from:'',to:'',simple:false};
 const cs=(f.conds||[]).filter(salesListCondReady);
 if(f.preset&&!cs.length){const r=salesListPresetRange(f.preset);return {preset:f.preset,from:r?r[0]:'',to:r?r[1]:'',simple:!!r};}
 if(cs.length===1&&cs[0].op==='between')return {preset:'',from:cs[0].v,to:cs[0].v2||'',simple:true};
 return {preset:'',from:'',to:'',simple:false};
}
/* Блок дат над таблицей. У Sales — Created; другие таблицы (Finance) дают
   свою колонку и свои быстрые кнопки (col.range). Фильтр — тот же, что в
   меню колонки. */
const SALES_LIST_RANGE=[['last7','7 days'],['last14','14 days'],['last30','30 days'],['','All time']];
function salesListDateButton(k){
 k=k||'created';const col=salesListColumn(k)||{label:'Created'},f=salesListLoadPrefs().filters[k],d=salesListDateParts(f),presets=(col.presets||SALES_LIST_PRESETS).concat(col.range||[]);
 const label=d.preset?(presets.find(x=>x[0]===d.preset)||['','Custom'])[1]:!d.simple?'Custom filter':d.from&&d.to?(d.from===d.to?salesListShortDay(d.from):salesListShortDay(d.from)+' – '+salesListShortDay(d.to)):d.from?'From '+salesListShortDay(d.from):d.to?'Through '+salesListShortDay(d.to):'All time';
 return `<button type="button" class="sl-quiet sl-date-toggle" data-created-range data-date-col="${esc(k)}" title="${esc(f?salesListFilterSummary(col,f):col.label+': all dates')}" aria-haspopup="dialog" onclick="salesListOpenDate(event,'${esc(k)}')">${esc(col.label)}: ${esc(label)}<span class="sl-disclosure" aria-hidden="true">▾</span></button>`;
}
function salesListOpenDate(e,k){k=k||'created';salesListMenu=Object.assign({kind:'date',scope:salesListScope(),col:k,error:''},salesListDateParts(salesListLoadPrefs().filters[k]),salesListAt(e,360));render();}
function salesListDatePreset(key){
 const m=salesListMenu;if(!m||m.kind!=='date')return;
 const r=key?salesListPresetRange(key):null;Object.assign(m,{preset:key,from:r?r[0]:'',to:r?r[1]:'',simple:true,error:''});render();
}
function salesListDateInput(key,value){const m=salesListMenu;if(!m||m.kind!=='date'||!['from','to'].includes(key))return;m[key]=value;m.preset='';m.simple=true;m.error='';}
function salesListDateToday(){const m=salesListMenu;if(!m||m.kind!=='date')return;m.to=salesListDay(new Date());m.preset='';m.simple=true;m.error='';render();}
function salesListDateReset(){const k=salesListMenu&&salesListMenu.col||'created';salesListMenu=null;salesListClearFilter(k);}
function salesListValidDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return !isNaN(d)&&salesListDay(d)===s;}
function salesListDateApply(){
 const m=salesListMenu;if(!m||m.kind!=='date')return;
 if(!m.simple){salesListCloseMenu();return;}
 if([m.from,m.to].some(s=>s&&!salesListValidDay(s))||(m.from&&m.to&&m.from>m.to)){m.error='Choose a valid range. From must not be after To.';render();return;}
 salesListMenu=null;
 salesListSetFilter(m.col||'created',m.preset?{preset:m.preset}:m.from||m.to?{conds:[{op:'between',v:m.from,v2:m.to}]}:null);
}
function salesListDateMenuHTML(m,style){
 const col=salesListColumn(m.col||'created')||{label:'Created'};
 return `<div class="sl-menu sl-date-menu" style="${style}" role="dialog" aria-label="${esc(col.label)} date range"><div class="sl-date-presets">${(col.range||SALES_LIST_RANGE).map(([k,v])=>`<button type="button" class="sl-btn${m.preset===k&&m.simple&&(k||!m.from&&!m.to)?' on':''}" data-range-preset="${k}" onclick="salesListDatePreset('${k}')">${v}</button>`).join('')}</div>
  ${!m.simple?`<p class="mut">A custom ${esc(col.label)} filter is active. Choose a range to replace it.</p>`:''}
  <div class="sl-date-inputs"><label>From<input type="date" data-range-from value="${esc(m.from)}" oninput="salesListDateInput('from',this.value)"></label><label>To<input type="date" data-range-to value="${esc(m.to)}" oninput="salesListDateInput('to',this.value)"></label></div>
  ${m.error?`<p class="sl-range-error" role="alert">${esc(m.error)}</p>`:''}<div class="sl-date-actions"><button type="button" class="sl-text-button" data-range-today onclick="salesListDateToday()">Today</button><button type="button" class="sl-reset" data-range-reset title="Clear date range · show all dates" aria-label="Clear date range" onclick="salesListDateReset()">↺</button><span class="sp"></span><button type="button" class="pri" data-range-apply onclick="salesListDateApply()">Apply</button></div></div>`;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&salesListMenu){e.preventDefault();salesListCloseMenu();}});

/* Shared status disclosure: the business statuses come from each list. */
function salesListStatusControlHTML(chips,selection,total,onSelect){
 const p=salesListLoadPrefs(),selected=chips.find(c=>c.key===selection),label=selected?selected.label:'All',n=selected?selected.n:total;
 const toggle=`<button type="button" class="sl-status-toggle" data-status-toggle aria-expanded="${p.statusExpanded}" title="${p.statusExpanded?'Hide status filters':'Show status filters'}" onclick="salesListToggleStatuses()">${esc(label)} <b>${n}</b><span class="sl-disclosure" aria-hidden="true">${p.statusExpanded?'▾':'▸'}</span></button>`;
 return `<div class="sales-status-chips sl-status-compact">${toggle}${p.statusExpanded?`<div class="sl-status-options"><button type="button" data-status-all class="${selection?'':'on'}" onclick="${onSelect}('')">All <b>${total}</b></button>${chips.map(c=>`<button type="button" data-status-chip="${esc(c.key)}" class="${selection===c.key?'on':''}" onclick="${onSelect}(${esc(JSON.stringify(c.key))})">${esc(c.label)} <b>${c.n}</b></button>`).join('')}</div>`:''}</div>`;
}
