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
 ].concat(st,[{k:'on',label:'On',type:'text',def:true},{k:'rank',label:'Urgency',type:'number',def:false}]);
}
/* Сначала Critical, потом Rush, дальше по сроку — горящее всегда наверху. */
function prodListDefaultSort(){return {k:'rank',dir:'asc'};}

/* Доска считается одним проходом по стёклам и кэшируется, пока не
   изменились сканы, батчи и заказы: движок таблицы спрашивает строки
   несколько раз за одну отрисовку. */
let prodBoardCache={stamp:'',data:null};
function prodBoardStamp(){
 const scans=DB.stationScan||[];let undone=0;scans.forEach(s=>{if(s.undoneAt)undone++;});
 let items=0,released=0,cut=0;(DB.glassBatch||[]).forEach(b=>b.items.forEach(i=>{items++;if(i.releasedAt)released++;if(i.cutStartedAt)cut++;}));
 return [scans.length,undone,DB.stationScanSeq,items,released,cut,(DB.salesOrder||[]).map(o=>o.id+o.updatedAt+o.status+(o.priority||'')+(o.dueDate||'')).join(',')].join('|');
}
function prodBoard(){
 const stamp=prodBoardStamp();if(prodBoardCache.stamp===stamp&&prodBoardCache.data)return prodBoardCache.data;
 const batches=stationBatchIndex(),scansBy=new Map(),orders=[];
 (DB.stationScan||[]).forEach(s=>{if(s.undoneAt)return;if(!scansBy.has(s.piece))scansBy.set(s.piece,[]);scansBy.get(s.piece).push(s);});
 (DB.salesOrder||[]).forEach(o=>{
  if(!o||salesIsQuote(o)||['cancelled','closed'].includes(o.status))return;
  const pieces=glassPieceMap(o.id);if(!pieces.size)return;
  const counts={queue:0},lines=[],codes=[];let inProd=false,shipped=0,total=0;
  (o.lines||[]).forEach((l,li)=>{
   const lites=[];
   glassBatchComponents(o,l).forEach(c=>{
    if(c.missing)return;
    const rec=pieces.get(c.key);if(!rec)return;
    const ids=rec.ids.concat(...Object.values(rec.extra||{})).filter(Boolean),lc={queue:0};let ls=0;
    ids.forEach(id=>{
     const e=batches.get(id)||null,scans=scansBy.get(id)||[];total++;
     if(!e&&!scans.length){lc.queue++;counts.queue++;return;}
     inProd=true;
     const place=stationPlace({id,o,l,c,entry:e},scans);
     if(place.shipped||!place.waiting){ls++;shipped++;return;}
     lc[place.waiting]=(lc[place.waiting]||0)+1;counts[place.waiting]=(counts[place.waiting]||0)+1;
    });
    if(!codes.includes(c.glass))codes.push(c.glass);
    lites.push({glass:c.glass,lite:c.lite,counts:lc,shipped:ls,total:ids.length});
   });
   if(lites.length)lines.push({no:li+1,mark:l.mark||'',size:frac16(l.width16/16)+' × '+frac16(l.height16/16),units:l.qty,lites});
  });
  if(!inProd)return;
  const urg=stationUrgency(o),t=Date.parse(o.dueDate||''),days=Number.isNaN(t)?99999:Math.floor(t/864e5);
  orders.push({o,customer:salesCustomerDisplay(o.customerId),glass:codes,counts,shipped,total,lines,rank:(2-urg)*1e6+days});
 });
 prodBoardCache={stamp,data:orders};
 return orders;
}
function prodListInfos(){
 return prodBoard().map(x=>{
  const memo={number:x.o.businessNumber||'',customer:x.customer,priority:SALES_LIST_PRIORITY[x.o.priority]||'Normal',due:x.o.dueDate||'',glass:x.glass.join(', '),shipped:x.shipped,queue:x.counts.queue||0,on:'',rank:x.rank};
  (DB.station||[]).forEach(s=>{memo['st_'+s.code]=x.counts[s.code]||0;});
  return {o:x.o,q:false,c:{},x,tokens:{glass:x.glass},memo};
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
function prodTh(c,p){const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}${c.station?' pb-st':''}" data-col="${c.k}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function prodCount(n,code){return n?`<span class="pb-n${code===stationCutCode()?' pb-cut':''}">${n}</span>`:'<span class="pb-z">·</span>';}
function prodCell(r,c){
 const v=salesListValue(r,c.k),x=r.x;
 if(c.station)return `<td class="pb-st">${prodCount(v,c.station)}</td>`;
 switch(c.k){
  case 'number':return `<td class="mono"><button type="button" class="pb-open" onclick="event.stopPropagation();prodToggle('${esc(x.o.id)}')">${prodOpen.has(x.o.id)?'▾':'▸'} <b>${esc(v)}</b></button></td>`;
  case 'customer':return `<td>${raw(v)}</td>`;
  case 'priority':return `<td>${x.o.priority==='critical'?'<span class="pill bad">Critical</span>':x.o.priority==='rush'?'<span class="pill warn">Rush</span>':''}</td>`;
  case 'due':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'glass':return `<td data-raw>${esc(v)}</td>`;
  case 'shipped':return `<td class="pb-prog"><span class="pb-bar"><i style="width:${x.total?Math.round(x.shipped/x.total*100):0}%"></i></span>${x.shipped} / ${x.total}</td>`;
  case 'queue':return `<td class="pb-st">${prodCount(v)}</td>`;
  case 'on':return '<td><span class="pb-z">—</span></td>';
  default:return `<td>${v==null||v===''?'':esc(String(v))}</td>`;
 }
}
/* Позиция → стекло: те же колонки, что у заказа, чтобы цифры стояли под
   своими станциями. */
function prodSubRows(r,cols){
 return r.x.lines.map(L=>L.lites.map((t,i)=>`<tr class="pb-sub">${cols.map(c=>{
  if(c.station)return `<td class="pb-st">${prodCount(t.counts[c.station]||0,c.station)}</td>`;
  switch(c.k){
   case 'number':return `<td class="mut">${i?'':'Line '+L.no}</td>`;
   case 'customer':return `<td>${i?'':`<b>${esc(L.size)}</b> · ${L.units} unit${L.units===1?'':'s'}${L.mark?` · <span data-raw>${esc(L.mark)}</span>`:''}`}</td>`;
   case 'glass':return `<td><b data-raw>${esc(t.glass)}</b>${L.lites.length>1?` <span class="mut">Lite ${esc(t.lite)}</span>`:''}</td>`;
   case 'shipped':return `<td class="pb-prog mut">${t.shipped} / ${t.total}</td>`;
   case 'queue':return `<td class="pb-st">${prodCount(t.counts.queue||0)}</td>`;
   case 'on':return '<td><span class="pb-z">—</span></td>';
   default:return '<td></td>';
  }
 }).join('')}<td></td></tr>`).join('')).join('');
}
function viewProdOrders(){
 const infos=prodListInfos(),p=salesListLoadPrefs(),rows=salesListRows(infos);
 const total=k=>infos.reduce((n,i)=>n+(i.memo[k]||0),0),cut=stationCutCode();
 /* Двенадцать станций в ширину не влезают: пустая станция колонку не
    занимает и появляется, как только на ней появится стекло. Плитки
    сверху — все. */
 const cols=salesListColumns().filter(c=>!(c.station||c.k==='queue')||total(c.k)>0);
 const tiles=`<div class="pb-tiles"><div class="pb-tile q"><b>To batch</b><span>${total('queue').toLocaleString('en-US')}</span><small>in queue</small></div>`+(DB.station||[]).map(s=>{
  const k='st_'+s.code,n=total(k),f=p.filters[k],on=!!f&&salesListFilterActive(f);
  return `<button type="button" class="pb-tile${n?'':' zero'}${on?' sel':''}" data-prod-station="${esc(s.code)}" onclick="prodFocusStation('${esc(s.code)}')"><b>${esc(s.code)}</b><span>${n.toLocaleString('en-US')}</span><small>${s.code===cut?'in batches':'waiting'}</small></button>`;
 }).join('')+'</div>';
 const body=rows.map(r=>`<tr class="pb-row${r.x.o.priority==='critical'?' pb-hot':''}${prodOpen.has(r.x.o.id)?' pb-opened':''}" data-prod-order="${esc(r.x.o.id)}" onclick="prodToggle('${esc(r.x.o.id)}')">${cols.map(c=>prodCell(r,c)).join('')}<td></td></tr>`+(prodOpen.has(r.x.o.id)?prodSubRows(r,cols):'')).join('');
 const glassN=rows.reduce((n,r)=>n+r.x.total-r.x.shipped,0);
 const foot=rows.length?`<tfoot><tr class="sl-foot">${cols.map((c,i)=>i===0?`<td data-foot-count><b>${rows.length} order${rows.length===1?'':'s'}</b></td>`:c.sum?`<td class="n pb-st">${rows.reduce((n,r)=>n+(salesListValue(r,c.k)||0),0)||''}</td>`:'<td></td>').join('')}<td></td></tr></tfoot>`:'';
 return `${tiles}<div class="sales-toolbar">${salesListDateButton('due')}<span class="sales-toolbar-sp"></span><span class="mut small">${rows.length} order${rows.length===1?'':'s'} · ${glassN.toLocaleString('en-US')} glass in production</span></div>${salesListFilterChips()}
  <div class="sales-table-wrap"><table class="sl-table pb-table"><thead><tr>${cols.map(c=>prodTh(c,p)).join('')}<th><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></th></tr></thead>
  <tbody>${body||`<tr><td colspan="${cols.length+1}" class="empty">${infos.length?'Nothing matches the filters.':'No glass in production yet.'}</td></tr>`}</tbody>${foot}</table></div>${salesListMenuHTML(infos)}`;
}
