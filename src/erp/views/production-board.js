/* =====================================================================
   view/production-board  ·  board-1.0
   Production → In production: одна строка — один заказ, в колонках станций —
   сколько его стёкол ждёт на каждой. Раскрытие — позиция (размер, юниты) →
   стекло (код, Lite) → сколько где.
   IN : журнал сканов и «где стекло» (erp/shopfloor/scan); движок таблицы —
        views/sales-list-ui (фильтры колонок, блок дат, колонки — как Sales)
   OUT: html
   Владелец, 29 сентября 2026: в производстве бывает 3000+ стёкол — список
   стёкол бесконечен; номер G-0000867 ничего не говорит — «как мне узнать,
   сразу же посмотрев»; нужно: заказ, 24 × 80, 6CL — 2 на IGU, 6SNB60 — 1 на
   IGU, 1 на EDGE. Номеров стёкол на этом экране нет. Поиск стекла по номеру
   не нужен (он же).
   ===================================================================== */
let prodOpen=new Set();
function prodListScope(){return subtab==='orders'?'prodOrders':'';}
function prodListColumns(){
 const st=(DB.station||[]).map(s=>({k:'st_'+s.code,label:s.code,type:'number',def:true,sum:true,station:s.code}));
 return [
  {k:'number',label:'Order',type:'text',def:true},
  {k:'customer',label:'Customer',type:'text',def:true},
  {k:'priority',label:'Priority',type:'list',def:true},
  {k:'due',label:'Due',type:'date',def:true,presets:SALES_LIST_DUE_PRESETS,range:[['overdue','Overdue'],['next7','7 days'],['next30','30 days'],['','All']]},
  {k:'glass',label:'Glass',type:'text',tokens:true,def:true},
  {k:'shipped',label:'Shipped',type:'number',def:true},
  {k:'queue',label:'To batch',type:'number',def:true,sum:true}
 ].concat(st,[{k:'on',label:'On',type:'text',tokens:true,def:false},{k:'rank',label:'Urgency',type:'number',def:false}]);
}
/* Сначала Critical, потом Rush, дальше по сроку — горящее всегда наверху. */
function prodListDefaultSort(){return {k:'rank',dir:'asc'};}

/* Доска считается одним проходом по стёклам и кэшируется, пока не
   изменились сканы, батчи и заказы: движок таблицы спрашивает строки
   несколько раз за одну отрисовку. */
let prodBoardCache={stamp:'',data:null};
function prodBoardStamp(){
 /* Тара стекла меняется без новых сканов («Not on DL-1», перенос на другую
    долли) — её коды тоже в метке. */
 const scans=DB.stationScan||[];let undone=0,on=0;scans.forEach(s=>{if(s.undoneAt)undone++;const v=s.on||'';for(let i=0;i<v.length;i++)on=(on*31+v.charCodeAt(i))|0;on=(on*31+1)|0;});
 let items=0,released=0,cut=0;(DB.glassBatch||[]).forEach(b=>b.items.forEach(i=>{items++;if(i.releasedAt)released++;if(i.cutStartedAt)cut++;}));
 return [scans.length,undone,on,DB.stationScanSeq,items,released,cut,(DB.salesOrder||[]).map(o=>o.id+o.updatedAt+o.status+(o.priority||'')+(o.dueDate||'')).join(',')].join('|');
}
function prodBoard(){
 const stamp=prodBoardStamp();if(prodBoardCache.stamp===stamp&&prodBoardCache.data)return prodBoardCache.data;
 const batches=stationBatchIndex(),scansBy=new Map(),orders=[];
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!scansBy.has(s.piece))scansBy.set(s.piece,[]);scansBy.get(s.piece).push(s);});
 (DB.salesOrder||[]).forEach(o=>{
  if(!o||salesIsQuote(o)||['cancelled','closed'].includes(o.status))return;
  const pieces=glassPieceMap(o.id);if(!pieces.size)return;
  const counts={queue:0},route={},lines=[],codes=[],onAll=new Set(),onAt={};let inProd=false,shipped=0,total=0;
  (o.lines||[]).forEach((l,li)=>{
   const lites=[];
   glassBatchComponents(o,l).forEach(c=>{
    if(c.missing)return;
    const rec=pieces.get(c.key);if(!rec)return;
    const ids=rec.ids.concat(...Object.values(rec.extra||{})).filter(Boolean),lc={queue:0},lr={},lon=new Set(),lonAt={};let ls=0,lb=0;
    ids.forEach(id=>{
     const e=batches.get(id)||null,scans=scansBy.get(id)||[],g={id,o,l,c,entry:e};total++;
     const place=stationPlace(g,scans),queued=!e&&!scans.length;
     /* Разбитое стекло не в производстве: вместо него едет стекло Recut. */
     if(place.broken){total--;lb++;return;}
     /* Клетка станции знает три вещи: сколько ждёт здесь, сколько уже
        прошло и есть ли станция в маршруте вообще. «·» у стеклопакета
        перед IGU и пусто у одинарного стекла — разные вещи (владелец). */
     place.route.forEach((code,i)=>{
      const t=lr[code]||(lr[code]={w:0,p:0,n:0}),u=route[code]||(route[code]={w:0,p:0,n:0});
      t.n++;u.n++;if(!queued&&i<=place.far){t.p++;u.p++;}
      if(!queued&&place.waiting&&i===place.far+1){t.w++;u.w++;}
     });
     if(queued){lc.queue++;counts.queue++;return;}
     inProd=true;
     if(place.shipped||!place.waiting){ls++;shipped++;return;}
     /* На чём лежит: последний скан стекла положил его на долли или скид. */
     const last=scans[scans.length-1];if(last&&last.on){lon.add(last.on);onAll.add(last.on);}
     /* По станции и таре: «HEAT 20 — DL-7 5, DL-8 15»; без тары — ключ ''. */
     const on=last&&last.on||'',w=place.waiting;(lonAt[w]||(lonAt[w]={}))[on]=(lonAt[w][on]||0)+1;(onAt[w]||(onAt[w]={}))[on]=(onAt[w][on]||0)+1;
     lc[place.waiting]=(lc[place.waiting]||0)+1;counts[place.waiting]=(counts[place.waiting]||0)+1;
    });
    if(!codes.includes(c.glass))codes.push(c.glass);
    lites.push({glass:c.glass,lite:c.lite,counts:lc,route:lr,on:[...lon],onAt:lonAt,shipped:ls,total:ids.length-lb});
   });
   if(lites.length)lines.push({no:li+1,mark:l.mark||'',size:frac16(l.width16/16)+' × '+frac16(l.height16/16),units:l.qty,lites});
  });
  if(!inProd)return;
  const urg=stationUrgency(o),t=Date.parse(o.dueDate||''),days=Number.isNaN(t)?99999:Math.floor(t/864e5);
  orders.push({o,customer:salesCustomerDisplay(o.customerId),glass:codes,counts,route,on:[...onAll].sort(),onAt,shipped,total,lines,rank:(2-urg)*1e6+days});
 });
 prodBoardCache={stamp,data:orders};
 return orders;
}
function prodListInfos(){
 return prodBoard().map(x=>{
  const memo={number:x.o.businessNumber||'',customer:x.customer,priority:SALES_LIST_PRIORITY[x.o.priority]||'Normal',due:x.o.dueDate||'',glass:x.glass.join(', '),shipped:x.shipped,queue:x.counts.queue||0,on:x.on.join(', '),rank:x.rank};
  (DB.station||[]).forEach(s=>{memo['st_'+s.code]=x.counts[s.code]||0;});
  return {o:x.o,q:false,c:{},x,tokens:{glass:x.glass,on:x.on},memo};
 });
}
function prodToggle(id){if(prodOpen.has(id))prodOpen.delete(id);else prodOpen.add(id);render();}
/* Плитка станции ставит фильтр колонки «> 0»: остаются заказы, у которых
   есть стекло на этой станции. Повторное нажатие — снимает. */
function prodFocusStation(code){
 const k='st_'+code,p=salesListLoadPrefs(),f=p.filters[k];salesListMenu=null;
 if(f&&salesListFilterActive(f))delete p.filters[k];
 else{const c=salesListCleanFilter(k,{mode:'include',conds:[{op:'gt',v:'0',v2:'',join:'and'}],values:null,preset:''});if(c)p.filters[k]=c;}
 salesListSavePrefs();render();
}
function prodOn(list){return list&&list.length?list.map(c=>`<span class="st-on">${esc(c)}</span>`).join(' '):'<span class="pb-z">—</span>';}
function prodTh(c,p){const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}${c.station?' pb-st':''}" data-col="${c.k}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function prodCount(n,code){return n?`<span class="pb-n${code===stationCutCode()?' pb-cut':''}">${n}</span>`:'<span class="pb-z">·</span>';}
/* Где стекло, там и тара (владелец, 6 октября 2026: «20 стёкол на
   tempering — 5 on dolly #7, 15 on dolly #8»): под числом столбиком. Ни
   одно не на таре — только число. */
function prodOnSplit(m){
 const keys=Object.keys(m||{}).filter(Boolean).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));if(!keys.length)return '';
 return '<span class="pb-split" data-prod-on>'+keys.map(k=>'<i><b>'+esc(k)+'</b> '+m[k]+'</i>').join('')+(m['']?'<i class="pb-loose" title="Not on a dolly">no dolly '+m['']+'</i>':'')+'</span>';
}
/* Станция в маршруте: число — ждут здесь, ✓ — все прошли, · — ещё не
   дошли. Станции нет в маршруте — клетка пустая. */
function prodStation(t,code,on){
 if(!t||!t.n)return '';
 if(t.w)return prodCount(t.w,code)+prodOnSplit(on);
 return t.p===t.n?'<span class="pb-done" title="Passed">✓</span>':'<span class="pb-z" title="Not there yet">·</span>';
}
function prodCell(r,c){
 const v=salesListValue(r,c.k),x=r.x;
 if(c.station)return `<td class="pb-st">${prodStation(x.route[c.station],c.station,x.onAt[c.station])}</td>`;
 switch(c.k){
  case 'number':return `<td class="mono"><button type="button" class="pb-open" onclick="event.stopPropagation();prodToggle('${esc(x.o.id)}')">${prodOpen.has(x.o.id)?'▾':'▸'} <b>${esc(v)}</b></button></td>`;
  case 'customer':return `<td>${raw(v)}</td>`;
  case 'priority':return `<td>${x.o.priority==='critical'?'<span class="pill bad">Critical</span>':x.o.priority==='rush'?'<span class="pill warn">Rush</span>':''}</td>`;
  case 'due':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'glass':return `<td data-raw>${esc(v)}</td>`;
  case 'shipped':return `<td class="pb-prog"><span class="pb-bar"><i style="width:${x.total?Math.round(x.shipped/x.total*100):0}%"></i></span>${x.shipped} / ${x.total}</td>`;
  case 'queue':return `<td class="pb-st">${prodCount(v)}</td>`;
  case 'on':return `<td>${prodOn(x.on)}</td>`;
  default:return `<td>${v==null||v===''?'':esc(String(v))}</td>`;
 }
}
/* Позиция → стекло: те же колонки, что у заказа, чтобы цифры стояли под
   своими станциями. */
function prodSubRows(r,cols){
 return r.x.lines.map(L=>L.lites.map((t,i)=>`<tr class="pb-sub">${cols.map(c=>{
  if(c.station)return `<td class="pb-st">${prodStation(t.route[c.station],c.station,t.onAt[c.station])}</td>`;
  switch(c.k){
   case 'number':return `<td class="mut">${i?'':'Line '+L.no}</td>`;
   case 'customer':return `<td>${i?'':`<b>${esc(L.size)}</b> · ${L.units} unit${L.units===1?'':'s'}${L.mark?` · <span data-raw>${esc(L.mark)}</span>`:''}`}</td>`;
   case 'glass':return `<td><b data-raw>${esc(t.glass)}</b>${L.lites.length>1?` <span class="mut">Lite ${esc(t.lite)}</span>`:''}</td>`;
   case 'shipped':return `<td class="pb-prog mut">${t.shipped} / ${t.total}</td>`;
   case 'queue':return `<td class="pb-st">${prodCount(t.counts.queue||0)}</td>`;
   case 'on':return `<td>${prodOn(t.on)}</td>`;
   default:return '<td></td>';
  }
 }).join('')}<td></td></tr>`).join('')).join('');
}
function viewProdOrders(){
 const infos=prodListInfos(),p=salesListLoadPrefs(),rows=salesListRows(infos);
 const total=k=>infos.reduce((n,i)=>n+(i.memo[k]||0),0),cut=stationCutCode();
 /* Двенадцать станций в ширину не влезают: колонка есть, пока станция
    впереди хоть у одного стекла в производстве (ждут или ещё не дошли).
    Нет сверловки в работе — нет колонки DRILL. Плитки сверху — все. */
 const ahead=code=>infos.some(i=>{const t=i.x.route[code];return t&&t.n>t.p;});
 const cols=salesListColumns().filter(c=>c.station?ahead(c.station):c.k!=='queue'||total('queue')>0);
 const tiles=`<div class="pb-tiles"><div class="pb-tile q"><b>To batch</b><span>${total('queue').toLocaleString('en-US')}</span><small>in queue</small></div>`+(DB.station||[]).filter(s=>ahead(s.code)||total('st_'+s.code)>0).map(s=>{
  const k='st_'+s.code,n=total(k),f=p.filters[k],on=!!f&&salesListFilterActive(f);
  const tare=[...new Set(infos.flatMap(i=>Object.keys(i.x.onAt[s.code]||{}).filter(Boolean)))],d=tare.length,word=tare.every(c=>/^S/.test(c))?(d===1?'skid':'skids'):(d===1?'dolly':'dollies');
  return `<button type="button" class="pb-tile${n?'':' zero'}${on?' sel':''}" data-prod-station="${esc(s.code)}" onclick="prodFocusStation('${esc(s.code)}')"><b>${esc(s.code)}</b><span>${n.toLocaleString('en-US')}</span><small>${s.code===cut?'in batches':'waiting'+(d?' · '+d+' '+word:'')}</small></button>`;
 }).join('')+'</div>';
 const body=rows.map(r=>`<tr class="pb-row${r.x.o.priority==='critical'?' pb-hot':''}${prodOpen.has(r.x.o.id)?' pb-opened':''}" data-prod-order="${esc(r.x.o.id)}" onclick="prodToggle('${esc(r.x.o.id)}')">${cols.map(c=>prodCell(r,c)).join('')}<td></td></tr>`+(prodOpen.has(r.x.o.id)?prodSubRows(r,cols):'')).join('');
 const glassN=rows.reduce((n,r)=>n+r.x.total-r.x.shipped,0);
 const foot=rows.length?`<tfoot><tr class="sl-foot">${cols.map((c,i)=>i===0?`<td data-foot-count><b>${rows.length} order${rows.length===1?'':'s'}</b></td>`:c.sum?`<td class="n pb-st">${rows.reduce((n,r)=>n+(salesListValue(r,c.k)||0),0)||''}</td>`:'<td></td>').join('')}<td></td></tr></tfoot>`:'';
 return `${tiles}${prodExceptionsHTML(infos)}<div class="sales-toolbar">${salesListDateButton('due')}<span class="sales-toolbar-sp"></span><span class="mut small">${rows.length} order${rows.length===1?'':'s'} · ${glassN.toLocaleString('en-US')} glass components in production</span></div>${salesListFilterChips()}
  <div class="sales-table-wrap"><table class="sl-table pb-table"><thead><tr>${cols.map(c=>prodTh(c,p)).join('')}<th><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></th></tr></thead>
  <tbody>${body||`<tr><td colspan="${cols.length+1}" class="empty">${infos.length?'Nothing matches the filters.':'No glass components in production yet.'}</td></tr>`}</tbody>${foot}</table></div>${salesListMenuHTML(infos)}`;
}

/* Exceptions stay visible alongside the station totals. Counts are components,
   while Hold and overdue counts are orders; one order can have both. */
function prodExceptionsHTML(infos){
 const orders=infos.map(x=>x.x.o),today=finToday();
 const hold=orders.filter(o=>o.onHold||(o.lines||[]).some(l=>l.onHold)).length;
 const late=orders.filter(o=>o.dueDate&&o.dueDate<today).length;
 const ids=new Set(orders.map(o=>o.id));
 const recuts=(DB.recut||[]).filter(r=>ids.has(r.orderId)).length;
 const parked=stationParked(hit=>ids.has(hit.orderId)).length;
 return '<div class="pb-exceptions" data-prod-exceptions><b>Needs attention</b><span>'+hold+' orders on hold</span><span>'+late+' overdue orders</span><span>'+parked+' components waiting for a pair</span><span>'+recuts+' recut records</span><button type="button" onclick="navGo(\'shipping\')">Shipping</button></div>';
}
