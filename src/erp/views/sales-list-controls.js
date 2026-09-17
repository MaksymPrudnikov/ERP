/* Компактные средства списка Sales. Период использует тот же фильтр created,
   что и меню колонки: второго, невидимого ограничения здесь нет. */
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
function salesListToggleStatuses(){const p=salesListLoadPrefs();p.statusExpanded=!p.statusExpanded;salesListSavePrefs();render();}
function salesListDateParts(f){
 if(!f||!salesListFilterActive(f))return {preset:'',from:'',to:'',simple:true};
 if(f.mode==='exclude')return {preset:'',from:'',to:'',simple:false};
 const cs=(f.conds||[]).filter(salesListCondReady);
 if(f.preset&&!cs.length){const r=salesListPresetRange(f.preset);return {preset:f.preset,from:r?r[0]:'',to:r?r[1]:'',simple:!!r};}
 if(cs.length===1&&cs[0].op==='between')return {preset:'',from:cs[0].v,to:cs[0].v2||'',simple:true};
 return {preset:'',from:'',to:'',simple:false};
}
function salesListDateButton(){
 const f=salesListLoadPrefs().filters.created,d=salesListDateParts(f);
 const label=d.preset?(SALES_LIST_PRESETS.find(x=>x[0]===d.preset)||['','Custom'])[1]:!d.simple?'Custom filter':d.from&&d.to?salesListShortDay(d.from)+' – '+salesListShortDay(d.to):d.from?'From '+salesListShortDay(d.from):d.to?'Through '+salesListShortDay(d.to):'All time';
 return `<button type="button" class="sl-quiet sl-date-toggle" data-created-range title="${esc(f?salesListFilterSummary(salesListColumn('created'),f):'Created: all dates')}" aria-haspopup="dialog" onclick="salesListOpenDate(event)">Created: ${esc(label)}<span class="sl-disclosure" aria-hidden="true">▾</span></button>`;
}
function salesListOpenDate(e){salesListMenu=Object.assign({kind:'date',scope:'sales',error:''},salesListDateParts(salesListLoadPrefs().filters.created),salesListAt(e,360));render();}
function salesListDatePreset(key){
 const m=salesListMenu;if(!m||m.kind!=='date')return;
 const r=key?salesListPresetRange(key):null;Object.assign(m,{preset:key,from:r?r[0]:'',to:r?r[1]:'',simple:true,error:''});render();
}
function salesListDateInput(key,value){const m=salesListMenu;if(!m||m.kind!=='date'||!['from','to'].includes(key))return;m[key]=value;m.preset='';m.simple=true;m.error='';}
function salesListDateToday(){const m=salesListMenu;if(!m||m.kind!=='date')return;m.to=salesListDay(new Date());m.preset='';m.simple=true;m.error='';render();}
function salesListDateReset(){salesListMenu=null;salesListClearFilter('created');}
function salesListValidDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return !isNaN(d)&&salesListDay(d)===s;}
function salesListDateApply(){
 const m=salesListMenu;if(!m||m.kind!=='date')return;
 if(!m.simple){salesListCloseMenu();return;}
 if([m.from,m.to].some(s=>s&&!salesListValidDay(s))||(m.from&&m.to&&m.from>m.to)){m.error='Choose a valid range. From must not be after To.';render();return;}
 salesListMenu=null;
 salesListSetFilter('created',m.preset?{preset:m.preset}:m.from||m.to?{conds:[{op:'between',v:m.from,v2:m.to}]}:null);
}
function salesListDateMenuHTML(m,style){
 return `<div class="sl-menu sl-date-menu" style="${style}" role="dialog" aria-label="Created date range"><div class="sl-date-presets">${[['last7','7 days'],['last14','14 days'],['last30','30 days'],['','All time']].map(([k,v])=>`<button type="button" class="sl-btn${m.preset===k&&m.simple&&(k||!m.from&&!m.to)?' on':''}" data-range-preset="${k}" onclick="salesListDatePreset('${k}')">${v}</button>`).join('')}</div>
  ${!m.simple?'<p class="mut">A custom Created filter is active. Choose a range to replace it.</p>':''}
  <div class="sl-date-inputs"><label>From<input type="date" data-range-from value="${esc(m.from)}" oninput="salesListDateInput('from',this.value)"></label><label>To<input type="date" data-range-to value="${esc(m.to)}" oninput="salesListDateInput('to',this.value)"></label></div>
  ${m.error?`<p class="sl-range-error" role="alert">${esc(m.error)}</p>`:''}<div class="sl-date-actions"><button type="button" class="sl-text-button" data-range-today onclick="salesListDateToday()">Today</button><button type="button" class="sl-reset" data-range-reset title="Clear date range · show all dates" aria-label="Clear date range" onclick="salesListDateReset()">↺</button><span class="sp"></span><button type="button" class="pri" data-range-apply onclick="salesListDateApply()">Apply</button></div></div>`;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&salesListMenu){e.preventDefault();salesListCloseMenu();}});
