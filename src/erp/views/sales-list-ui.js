/* =====================================================================
   views/sales-list-ui  ·  sales-list-1.0
   Список Sales: колонки на выбор, фильтр каждой колонки (значения, условия,
   даты), чипы фильтров, сортировка, итоги внизу, выбор строк, меню правой
   кнопки мыши и On Hold заказа.
   IN : DB.salesOrder (через salesListVisible), оплаты, справочник стекла
   OUT: html списка; колонки, фильтры и сортировка — в localStorage браузера
   Владелец, 15 сентября 2026: фильтр каждой колонки «как в Excel», условия
   «как в Looker Studio» (больше, меньше, содержит, начинается с…), фильтр по
   дате, итоги внизу («сколько сегодня заказов и какого типа»), колонки можно
   скрывать и добавлять. Строка поиска убрана — «могу и так найти по
   фильтрам». On Hold — кнопка слева и правая кнопка мыши на строке; строка
   на удержании красная, Batched — серая («заказ уже в работе»). Коды стёкол —
   как в Master Data, программа их не сокращает. Итоги — только строкой под
   таблицей, не плитками на экране.
   ===================================================================== */

const SALES_LIST_PREFS_KEY='glass_erp_sales_list_v1';
const SALES_LIST_PRIORITY={normal:'Normal',rush:'Rush',critical:'Critical'};
/* def — видна по умолчанию (владелец выбрал «как на макете»); sum — итог внизу. */
const SALES_LIST_COLUMNS=[
 {k:'type',label:'Type',type:'list',def:true},
 {k:'number',label:'Number',type:'text',def:true},
 {k:'customer',label:'Customer',type:'text',def:true},
 {k:'po',label:'PO',type:'text',def:true},
 {k:'created',label:'Created',type:'date',def:true},
 {k:'due',label:'Due',type:'date',def:true},
 {k:'status',label:'Status',type:'list',def:true},
 {k:'priority',label:'Priority',type:'list',def:true},
 {k:'glass',label:'Glass',type:'text',def:true},
 {k:'units',label:'Units',type:'number',def:true,sum:true},
 {k:'area',label:'Area ft²',type:'number',def:true,sum:true,digits:1},
 {k:'total',label:'Total',type:'number',def:true,sum:true,money:true},
 {k:'receipts',label:'Receipts',type:'number',def:true,sum:true,money:true},
 {k:'balance',label:'Balance',type:'number',def:true,sum:true,money:true},
 {k:'hold',label:'On Hold',type:'list'},
 {k:'delivery',label:'Delivery',type:'list'},
 {k:'rep',label:'Sales rep',type:'text'},
 {k:'terms',label:'Terms',type:'list'},
 {k:'lines',label:'Lines',type:'number',sum:true},
 {k:'weight',label:'Weight kg',type:'number',sum:true},
 {k:'unitType',label:'Unit type',type:'list'},
 {k:'shapes',label:'Shapes',type:'number',sum:true},
 {k:'validUntil',label:'Valid until',type:'date'},
 {k:'revisions',label:'Revisions',type:'number'},
 {k:'fromQuote',label:'From quote',type:'text'},
 {k:'updated',label:'Updated',type:'date'}
];
const SALES_LIST_OPS={
 text:[['contains','Contains'],['notContains','Does not contain'],['startsWith','Starts with'],['endsWith','Ends with'],['equals','Equals'],['notEqual','Not equal'],['empty','Is empty'],['notEmpty','Is not empty']],
 number:[['gt','> Greater than'],['gte','≥ At least'],['lt','< Less than'],['lte','≤ At most'],['eq','= Equal to'],['ne','≠ Not equal'],['between','Between'],['empty','Is empty']],
 date:[['between','Between'],['on','On'],['before','Before'],['after','After'],['empty','Is empty']],
 list:[]
};
const SALES_LIST_PRESETS=[['today','Today'],['yesterday','Yesterday'],['thisWeek','This week'],['last7','Last 7 days'],['thisMonth','This month'],['lastMonth','Last month'],['thisYear','This year']];
const SALES_HOLD_REASONS=['Waiting for payment','Customer asked to wait','Sizes or drawing to confirm','Credit check'];

let salesListPrefs=null,salesListMenu=null,salesListSel=new Set(),salesListAnchor=null,salesListDragKey=null,salesHoldDialog=null;

/* ------------------------------ Настройки ------------------------------ */
function salesListColumn(k){return SALES_LIST_COLUMNS.find(c=>c.k===k)||null;}
function salesListLoadPrefs(){
 if(salesListPrefs)return salesListPrefs;
 let p={};try{p=JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY)||'{}')||{};}catch(e){p={};}
 salesListPrefs=salesListCleanPrefs(p);
 return salesListPrefs;
}
function salesListSavePrefs(){try{localStorage.setItem(SALES_LIST_PREFS_KEY,JSON.stringify(salesListPrefs));}catch(e){}}
function salesListCleanPrefs(p){
 p=p&&typeof p==='object'&&!Array.isArray(p)?p:{};
 const seen=new Set(),cols=[];
 (Array.isArray(p.cols)?p.cols:[]).forEach(c=>{if(c&&salesListColumn(c.k)&&!seen.has(c.k)){seen.add(c.k);cols.push({k:c.k,on:!!c.on});}});
 SALES_LIST_COLUMNS.forEach(c=>{if(!seen.has(c.k))cols.push({k:c.k,on:!!c.def});});
 const filters={},src=p.filters&&typeof p.filters==='object'&&!Array.isArray(p.filters)?p.filters:{};
 Object.keys(src).forEach(k=>{const f=salesListCleanFilter(k,src[k]);if(f&&salesListFilterActive(f))filters[k]=f;});
 const sort=p.sort&&salesListColumn(p.sort.k)?{k:p.sort.k,dir:p.sort.dir==='asc'?'asc':'desc'}:null;
 return {cols,filters,sort};
}
function salesListDefaultOp(col){return col.type==='number'?'gt':col.type==='date'?'between':'contains';}
function salesListEmptyFilter(col){return {mode:'include',conds:col.type==='list'?[]:[{op:salesListDefaultOp(col),v:'',v2:'',join:'and'}],values:null,preset:''};}
function salesListCleanFilter(k,f){
 const col=salesListColumn(k);if(!col||!f||typeof f!=='object'||Array.isArray(f))return null;
 const ops=(SALES_LIST_OPS[col.type]||[]).map(x=>x[0]);
 const conds=(Array.isArray(f.conds)?f.conds:[]).filter(c=>c&&ops.includes(c.op)).slice(0,6)
  .map((c,i)=>({op:c.op,v:String(c.v==null?'':c.v).slice(0,120),v2:String(c.v2==null?'':c.v2).slice(0,120),join:i&&c.join==='or'?'or':'and'}));
 const values=(col.type==='list'||col.type==='text')&&Array.isArray(f.values)?f.values.map(v=>String(v)).slice(0,500):null;
 const preset=col.type==='date'&&SALES_LIST_PRESETS.some(x=>x[0]===f.preset)?f.preset:'';
 return {mode:f.mode==='exclude'?'exclude':'include',conds,values,preset};
}
function salesListColumns(){
 const p=salesListLoadPrefs(),both=salesShow.orders&&salesShow.quotes;
 /* Type нужна, только когда в списке и заказы, и квоты. */
 return p.cols.filter(c=>c.on&&(c.k!=='type'||both)).map(c=>salesListColumn(c.k));
}

/* ------------------------------ Значения ------------------------------- */
function salesListDay(d){const p=v=>String(v).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function salesListIsoDay(iso){
 const s=String(iso||'');if(!s)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const t=new Date(s);return isNaN(t)?'':salesListDay(t);
}
function salesListShortDay(ymd){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd||''));if(!m)return String(ymd||'');
 return DOC_MONTHS[+m[2]-1]+' '+(+m[3])+(+m[1]!==new Date().getFullYear()?', '+m[1]:'');
}
function salesListPresetRange(key){
 const now=new Date(),d=new Date(now.getFullYear(),now.getMonth(),now.getDate()),add=(x,n)=>{const t=new Date(x);t.setDate(t.getDate()+n);return t;};
 switch(key){
  case 'today':return [salesListDay(d),salesListDay(d)];
  case 'yesterday':{const y=add(d,-1);return [salesListDay(y),salesListDay(y)];}
  case 'thisWeek':{const dow=(d.getDay()+6)%7;return [salesListDay(add(d,-dow)),salesListDay(add(d,6-dow))];}
  case 'last7':return [salesListDay(add(d,-6)),salesListDay(d)];
  case 'thisMonth':return [salesListDay(new Date(d.getFullYear(),d.getMonth(),1)),salesListDay(new Date(d.getFullYear(),d.getMonth()+1,0))];
  case 'lastMonth':return [salesListDay(new Date(d.getFullYear(),d.getMonth()-1,1)),salesListDay(new Date(d.getFullYear(),d.getMonth(),0))];
  case 'thisYear':return [d.getFullYear()+'-01-01',d.getFullYear()+'-12-31'];
 }
 return null;
}
/* Коды стёкол по лайтам как в Master Data; несколько Makeup — через «·». */
function salesListGlass(o){
 const used=new Set((o.lines||[]).map(l=>l.makeupId));
 const code=p=>{
  if(p.category==='laminated'){const L=p.laminated||{},a=glassProductById(L.outer&&L.outer.glassProductId),b=glassProductById(L.inner&&L.inner.glassProductId);return (a?a.code:'?')+'+'+(b?b.code:'?');}
  const g=glassProductById(p.glassProductId);return g?g.code:'?';
 };
 return (o.makeups||[]).filter(m=>used.has(m.id)).map(m=>(m.panes||[]).map(code).join(' / ')).join(' · ');
}
function salesListInfo(o){return {o,q:salesIsQuote(o),c:salesFindCustomer(o.customerId)||{},memo:{}};}
function salesListValue(info,k){
 if(Object.prototype.hasOwnProperty.call(info.memo,k))return info.memo[k];
 const o=info.o,q=info.q,c=info.c,lines=o.lines||[];let v=null;
 switch(k){
  case 'type':v=q?'Quote':'Order';break;
  case 'number':v=(q?salesQuoteBaseNumber(o):o.businessNumber)||'';break;
  case 'customer':v=c.displayName||c.legalName||'';break;
  case 'po':v=o.customerPo||'';break;
  case 'created':v=salesListIsoDay(o.createdAt);break;
  case 'due':v=o.dueDate||'';break;
  case 'status':v=salesStatusLabel(o,salesListStatus(o));break;
  case 'priority':v=SALES_LIST_PRIORITY[o.priority]||'Normal';break;
  case 'glass':v=salesListGlass(o);break;
  case 'units':v=lines.reduce((s,l)=>s+salesPositiveInt(l.qty,1),0);break;
  case 'area':v=Math.round(finWithOrder(o,()=>lines.reduce((s,l)=>{const a=salesLineAreas(l,o);return s+(a.valid?a.actual*salesPositiveInt(l.qty,1):0);},0))*10)/10;break;
  case 'total':{const t=finOrderTotals(o);v=t.complete?finMoney(t.grand):null;break;}
  case 'receipts':v=!q&&finOrderCounts(o)?finOrderPaid(o.id).paid:null;break;
  case 'balance':if(!q&&finOrderCounts(o)){const b=finOrderBalance(o);info.memo.balanceInfo=b;v=b.balance;}break;
  case 'hold':v=!q&&o.onHold?'On Hold':'Not on hold';break;
  case 'delivery':v=o.delivery==='delivery'?'Delivery':'Pickup';break;
  case 'rep':v=c.salesRep||'';break;
  case 'terms':v=paymentTermsFrom(c).paymentMode==='credit'?'Credit':'Cash';break;
  case 'lines':v=lines.length;break;
  case 'weight':v=finWithOrder(o,()=>{let kg=0,known=lines.length>0;lines.forEach(l=>{const w=salesLineWeight(l,o);if(w.complete&&w.lineKg!=null)kg+=w.lineKg;else known=false;});return known?Math.round(kg):null;});break;
  case 'unitType':v=[...new Set((o.makeups||[]).filter(m=>lines.some(l=>l.makeupId===m.id)).map(m=>docUnitLabel(m.unitType)))].join(', ');break;
  case 'shapes':v=lines.filter(salesListShapedLine).length;break;
  case 'validUntil':v=q?(o.validUntil||''):'';break;
  case 'revisions':v=q?salesQuoteMembers(o).length:null;break;
  case 'fromQuote':v=o.fromQuoteId?(((DB.salesOrder||[]).find(x=>x.id===o.fromQuoteId)||{}).businessNumber||''):'';break;
  case 'updated':v=salesListIsoDay(o.updatedAt);break;
 }
 info.memo[k]=v;return v;
}
/* Фигура — всё, что не прямоугольник по Width × Height (тот же признак, что «Rect» в строках заказа). */
function salesListShapedLine(l){const s=salesShapeByRef(l&&l.shapeRef);return !!s&&!salesShapeIsLineRect(s);}
/* Текст значения для галочек фильтра. */
function salesListText(info,k){const v=salesListValue(info,k);return v==null||v===''?'(empty)':String(v);}

/* ------------------------------ Фильтры -------------------------------- */
function salesListCondReady(c){return c.op==='empty'||c.op==='notEmpty'||String(c.v==null?'':c.v).trim()!=='';}
function salesListFilterActive(f){return !!f&&(!!f.preset||Array.isArray(f.values)||(f.conds||[]).some(salesListCondReady));}
function salesListCondTest(type,c,val){
 const empty=val==null||val==='';
 if(c.op==='empty')return empty;
 if(c.op==='notEmpty')return !empty;
 if(type==='number'){
  if(empty)return false;
  const a=Number(c.v),b=Number(c.v2);if(!Number.isFinite(a))return true;
  switch(c.op){
   case 'eq':return Math.abs(val-a)<0.005;case 'ne':return Math.abs(val-a)>=0.005;
   case 'gt':return val>a;case 'gte':return val>=a-0.0001;case 'lt':return val<a;case 'lte':return val<=a+0.0001;
   case 'between':return Number.isFinite(b)&&String(c.v2).trim()!==''?val>=Math.min(a,b)-0.0001&&val<=Math.max(a,b)+0.0001:val>=a-0.0001;
  }
  return true;
 }
 if(type==='date'){
  if(empty)return false;
  const a=String(c.v||''),b=String(c.v2||''),okA=/^\d{4}-\d{2}-\d{2}$/.test(a),okB=/^\d{4}-\d{2}-\d{2}$/.test(b);
  if(!okA)return true;
  switch(c.op){
   case 'on':return val===a;case 'before':return val<a;case 'after':return val>a;
   case 'between':return okB?val>=(a<b?a:b)&&val<=(a<b?b:a):val>=a;
  }
  return true;
 }
 const s=String(val==null?'':val).trim().toLowerCase(),x=String(c.v==null?'':c.v).trim().toLowerCase();
 switch(c.op){
  case 'contains':return s.includes(x);case 'notContains':return !s.includes(x);
  case 'startsWith':return s.startsWith(x);case 'endsWith':return s.endsWith(x);
  case 'equals':return s===x;case 'notEqual':return s!==x;
 }
 return true;
}
function salesListFilterTest(col,f,info){
 const val=salesListValue(info,col.k);let ok=true;
 if(Array.isArray(f.values))ok=f.values.includes(salesListText(info,col.k));
 if(ok&&f.preset&&col.type==='date'){const r=salesListPresetRange(f.preset);ok=!!val&&!!r&&val>=r[0]&&val<=r[1];}
 const conds=(f.conds||[]).filter(salesListCondReady);
 if(ok&&conds.length){
  let r=salesListCondTest(col.type,conds[0],val);
  for(let i=1;i<conds.length;i++){const t=salesListCondTest(col.type,conds[i],val);r=conds[i].join==='or'?(r||t):(r&&t);}
  ok=r;
 }
 return f.mode==='exclude'?!ok:ok;
}
function salesListCompare(col,dir){
 return (a,b)=>{
  const va=salesListValue(a,col.k),vb=salesListValue(b,col.k),ea=va==null||va==='',eb=vb==null||vb==='';
  if(ea||eb)return ea&&eb?0:ea?1:-1;
  const r=col.type==='number'?va-vb:String(va).localeCompare(String(vb),undefined,{numeric:true,sensitivity:'base'});
  return dir==='asc'?r:-r;
 };
}
/* Строки после галочек Show и кнопок статусов (до фильтров колонок). */
function salesListBase(){
 const all=salesListVisible();
 const infos=all.filter(o=>!salesStatusFilter||salesStatusFilter===salesKindOf(o)+':'+salesListStatus(o)).map(salesListInfo);
 return {all,infos};
}
function salesListRows(infos){
 const p=salesListLoadPrefs(),active=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k]));
 const rows=infos.filter(info=>active.every(k=>salesListFilterTest(salesListColumn(k),p.filters[k],info)));
 const s=p.sort||{k:'created',dir:'desc'},col=salesListColumn(s.k)||salesListColumn('created'),cmp=salesListCompare(col,s.dir);
 return rows.sort((a,b)=>cmp(a,b)||String(b.o.createdAt||'').localeCompare(String(a.o.createdAt||'')));
}
function salesListValueOptions(k,infos){
 const p=salesListLoadPrefs(),others=Object.keys(p.filters).filter(x=>x!==k&&salesListColumn(x)&&salesListFilterActive(p.filters[x])),counts={};
 infos.filter(info=>others.every(x=>salesListFilterTest(salesListColumn(x),p.filters[x],info))).forEach(info=>{const t=salesListText(info,k);counts[t]=(counts[t]||0)+1;});
 return Object.keys(counts).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(text=>({text,n:counts[text]}));
}
function salesListSetFilter(k,f){
 const p=salesListLoadPrefs(),clean=salesListCleanFilter(k,f);
 if(clean&&salesListFilterActive(clean))p.filters[k]=clean;else delete p.filters[k];
 salesListSavePrefs();render();
}
function salesListClearFilter(k){const p=salesListLoadPrefs();delete p.filters[k];if(salesListMenu&&salesListMenu.col===k)salesListMenu=null;salesListSavePrefs();render();}
function salesListClearAll(){const p=salesListLoadPrefs();p.filters={};salesListMenu=null;salesListSavePrefs();render();}
function salesListSort(k,dir){const p=salesListLoadPrefs();p.sort={k,dir:dir==='asc'?'asc':'desc'};salesListMenu=null;salesListSavePrefs();render();}
function salesListFilterSummary(col,f){
 const opText={contains:'contains',notContains:'does not contain',startsWith:'starts with',endsWith:'ends with',equals:'equals',notEqual:'not equal',empty:'is empty',notEmpty:'is not empty',
  eq:'=',ne:'≠',gt:'>',gte:'≥',lt:'<',lte:'≤',between:'between',on:'on',before:'before',after:'after'};
 const fmt=v=>col.money&&String(v).trim()!==''&&Number.isFinite(+v)?finFmt(+v):col.type==='date'?salesListShortDay(v):String(v);
 const parts=[];
 if(f.preset)parts.push((SALES_LIST_PRESETS.find(x=>x[0]===f.preset)||['',''])[1]);
 if(Array.isArray(f.values))parts.push(f.values.length?f.values.length<=3?f.values.join(', '):f.values.length+' values':'nothing');
 const conds=(f.conds||[]).filter(salesListCondReady).map((c,i)=>(i?(c.join==='or'?' or ':' and '):'')+opText[c.op]+(c.op==='empty'||c.op==='notEmpty'?'':' '+(c.op==='between'&&String(c.v2).trim()!==''?fmt(c.v)+' – '+fmt(c.v2):fmt(c.v))));
 if(conds.length)parts.push(conds.join(''));
 return (f.mode==='exclude'?'Not · ':'')+col.label+': '+parts.join(' · ');
}
function salesListFilterChips(){
 const p=salesListLoadPrefs(),keys=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k]));
 if(!keys.length)return '';
 return `<div class="sl-chips"><span class="sl-chips-label">Filters</span>${keys.map(k=>`<span class="sl-chip" data-filter-chip="${k}">${esc(salesListFilterSummary(salesListColumn(k),p.filters[k]))}<button type="button" aria-label="Remove filter" onclick="salesListClearFilter('${k}')">×</button></span>`).join('')}<button type="button" class="sl-clear" data-clear-filters onclick="salesListClearAll()">Clear filters</button></div>`;
}

/* ------------------------------ Экран ---------------------------------- */
function salesListNum(v,digits){return v==null||v===''?'<span class="mut">—</span>':Number(v).toLocaleString('en-US',{minimumFractionDigits:digits||0,maximumFractionDigits:digits||0});}
function salesListCell(info,col){
 const o=info.o,q=info.q,v=salesListValue(info,col.k);
 switch(col.k){
  case 'type':return `<td><span class="pill ${q?'kind-quote':'kind-order'}">${q?'Quote':'Order'}</span></td>`;
  case 'number':{const from=!q&&o.fromQuoteId?salesListValue(info,'fromQuote'):'';return `<td><b class="mono">${raw(v||'Auto Number')}</b>${from?` <span class="mut small">from ${raw(from)}</span>`:''}</td>`;}
  case 'customer':return `<td><b>${raw(v||'—')}</b></td>`;
  case 'created':case 'due':case 'validUntil':case 'updated':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'status':return `<td>${q?salesQuoteGroupPill(o):salesStatusPill(o)}${!q&&o.onHold?' <span class="pill hold">On Hold</span>':''}</td>`;
  case 'glass':return `<td><span class="sl-glass" title="${esc(v)}">${raw(v||'—')}</span></td>`;
  case 'units':case 'lines':case 'shapes':case 'revisions':case 'weight':return `<td class="n">${salesListNum(v)}</td>`;
  case 'area':return `<td class="n">${salesListNum(v,1)}</td>`;
  case 'total':return `<td class="n${!q&&finOrderCounts(o)?'':' mut'}">${finFmt(v)}</td>`;
  case 'receipts':return `<td class="n">${v==null?'<span class="mut">—</span>':finFmt(v)}</td>`;
  case 'balance':{
   if(v==null&&!info.memo.balanceInfo)return '<td class="n"><span class="mut">—</span></td>';
   const b=info.memo.balanceInfo;
   return `<td class="n">${b.status==='due'?`<span class="pill bad">${finFmt(b.balance)}</span>`:b.status==='paid'?'<span class="pill good">Paid</span>':b.status==='overpaid'?`<span class="pill info">Overpaid ${finFmt(-b.balance)}</span>`:finFmt(b.balance)}</td>`;
  }
  default:return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
 }
}
function salesListFooter(rows,cols){
 const orders=rows.filter(r=>!r.q),quotes=rows.filter(r=>r.q);
 const tally=(list,fn)=>{const m={};list.forEach(r=>{const s=fn(r);m[s]=(m[s]||0)+1;});return Object.keys(m).map(k=>k+' '+m[k]).join(' · ');};
 const detail=[tally(orders,r=>salesStatusLabel(r.o)),quotes.length?'Quotes: '+tally(quotes,r=>salesStatusLabel(r.o,salesListStatus(r.o))):''].filter(Boolean).join(' · ');
 const head=`<b>${rows.length} row${rows.length===1?'':'s'} · Orders ${orders.length} · Quotes ${quotes.length}</b>${detail?`<small>${esc(detail)}</small>`:''}`;
 const first=cols.findIndex(c=>c.sum),lead=first<0?cols.length:first;
 const sums=cols.slice(lead).map(c=>{
  if(!c.sum)return '<td></td>';
  const vals=rows.map(r=>salesListValue(r,c.k)).filter(v=>v!=null&&v!=='');
  const total=vals.reduce((s,v)=>s+Number(v),0);
  return `<td class="n" data-sum="${c.k}">${c.money?finFmt(finMoney(total)):total.toLocaleString('en-US',{minimumFractionDigits:c.digits||0,maximumFractionDigits:c.digits||0})}</td>`;
 }).join('');
 return `<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head" data-foot-count>${head}</td>${sums}<td></td></tr></tfoot>`;
}
function salesListSelectedOrders(){return [...salesListSel].filter(id=>{const o=(DB.salesOrder||[]).find(x=>x.id===id);return !!o&&!salesIsQuote(o);});}
function salesListView(){
 const p=salesListLoadPrefs(),{all,infos}=salesListBase(),rows=salesListRows(infos),cols=salesListColumns();
 salesListSel=new Set([...salesListSel].filter(id=>(DB.salesOrder||[]).some(o=>o.id===id)));
 const toggle=(key,label)=>`<button type="button" data-show="${key}" class="sales-show-toggle ${salesShow[key]?'on':''}" onclick="salesToggleShow('${key}')"><i>${salesShow[key]?'✓':''}</i>${label} <b>${(DB.salesOrder||[]).filter(o=>(key==='quotes')===salesIsQuote(o)&&(!salesIsQuote(o)||salesQuoteRepresentative(o).id===o.id)).length}</b></button>`;
 const selOrders=salesListSelectedOrders(),allHeld=selOrders.length>0&&selOrders.every(id=>(DB.salesOrder.find(o=>o.id===id)||{}).onHold);
 const holdBtn=`<button type="button" class="sl-hold" data-hold-button ${selOrders.length?'':'disabled'} onclick="salesListHoldSelected()">⛔ ${allHeld?'Release':'On Hold'}${selOrders.length?' ('+selOrders.length+')':''}</button>`;
 const rowIds=rows.map(r=>r.o.id),allSel=rowIds.length>0&&rowIds.every(id=>salesListSel.has(id));
 const th=c=>{const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}"><span class="sl-th">${c.label}<button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;};
 const body=rows.map(r=>{
  const o=r.o,sel=salesListSel.has(o.id),cls=[!r.q&&o.onHold?'sl-row-hold':'',!r.q&&o.status==='batched'?'sl-row-work':'',sel?'sl-row-sel':''].filter(Boolean).join(' ');
  return `<tr data-order-row="${esc(o.id)}"${cls?` class="${cls}"`:''} oncontextmenu="salesListContext(event,'${esc(o.id)}')"><td class="sl-check"><input type="checkbox" data-row-check ${sel?'checked':''} aria-label="Select ${esc(salesListValue(r,'number'))}" onclick="salesListToggleRow(event,'${esc(o.id)}')"></td>${cols.map(c=>salesListCell(r,c)).join('')}<td class="sales-row-actions"><button class="sm" onclick="salesOrderEdit('${esc(o.id)}')">Open</button><button class="sm dl" onclick="salesOrderDelete('${esc(o.id)}')">×</button></td></tr>`;
 }).join('');
 const empty=`<tr><td colspan="${cols.length+2}" class="empty">${all.length?'Nothing matches the filters.':'No Sales Orders yet'}</td></tr>`;
 return `<div class="card sales-list-card"><div class="sales-toolbar"><div class="sales-show"><span>Show</span>${toggle('orders','Orders')}${toggle('quotes','Quotes')}</div><div class="sl-left">${holdBtn}<button type="button" data-columns-button onclick="salesListOpenColumns(event)">Columns</button></div><span class="sales-toolbar-sp"></span><button onclick="salesOrderNew('quote')">+ New Quote</button><button class="pri" onclick="salesOrderNew('order')">+ New Sales Order</button></div>${salesListFilterChips()}${salesStatusChips(all)}<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th class="sl-check"><input type="checkbox" data-select-all ${allSel?'checked':''} aria-label="Select all rows" onclick="salesListToggleAll(this.checked)"></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||empty}</tbody>${rows.length?salesListFooter(rows,cols):''}</table></div>${salesListMenuHTML(infos)}${salesHoldDialogHTML()}</div>`;
}

/* ------------------------------ Меню ----------------------------------- */
function salesListCloseMenu(){salesListMenu=null;render();}
function salesListAt(e,w){const r=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;return {x:r?r.left:(e&&e.clientX)||40,y:r?r.bottom+6:(e&&e.clientY)||40,w};}
function salesListOpenFilter(e,k){
 if(e)e.stopPropagation();
 const col=salesListColumn(k);if(!col)return;
 const p=salesListLoadPrefs(),draft=JSON.parse(JSON.stringify(p.filters[k]||salesListEmptyFilter(col)));
 if(col.type!=='list'&&!draft.conds.length)draft.conds.push({op:salesListDefaultOp(col),v:'',v2:'',join:'and'});
 salesListMenu=Object.assign({kind:'filter',col:k,draft,search:''},salesListAt(e,340));
 render();
}
function salesListOpenColumns(e){if(e)e.stopPropagation();salesListMenu=Object.assign({kind:'columns'},salesListAt(e,300));render();}
function salesListContext(e,id){
 if(e){e.preventDefault();e.stopPropagation();}
 if(!salesListSel.has(id))salesListSel=new Set([id]);
 salesListMenu={kind:'context',id,x:(e&&e.clientX)||40,y:(e&&e.clientY)||40,w:220};
 render();
}
function salesListMenuHTML(infos){
 const m=salesListMenu;if(!m)return '';
 const top=Math.max(8,Math.min(m.y,window.innerHeight-80)),style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-(m.w||300)-8))}px;top:${top}px;max-height:${Math.max(180,window.innerHeight-top-12)}px`;
 const back='<div class="sl-backdrop" onclick="salesListCloseMenu()" oncontextmenu="event.preventDefault();salesListCloseMenu()"></div>';
 if(m.kind==='context')return back+salesListContextHTML(m,style);
 if(m.kind==='columns')return back+salesListColumnsHTML(style);
 if(m.kind==='filter')return back+salesListFilterHTML(m,infos,style);
 return '';
}
function salesListFilterHTML(m,infos,style){
 const col=salesListColumn(m.col);if(!col)return '';
 const d=m.draft,p=salesListLoadPrefs(),sort=p.sort||{k:'created',dir:'desc'};
 const labels=col.type==='number'?['↑ Smallest first','↓ Largest first']:col.type==='date'?['↑ Oldest first','↓ Newest first']:['↑ A → Z','↓ Z → A'];
 let html=`<div class="sl-menu" style="${style}" role="dialog" aria-label="Filter ${esc(col.label)}" data-filter-menu="${col.k}"><h5>Sort</h5><div class="sl-row"><button type="button" class="sl-btn${sort.k===col.k&&sort.dir==='asc'?' on':''}" data-sort="asc" onclick="salesListSort('${col.k}','asc')">${labels[0]}</button><button type="button" class="sl-btn${sort.k===col.k&&sort.dir==='desc'?' on':''}" data-sort="desc" onclick="salesListSort('${col.k}','desc')">${labels[1]}</button></div>`;
 if(col.type==='date')html+=`<h5>Date</h5><div class="sl-presets">${SALES_LIST_PRESETS.map(x=>`<button type="button" class="sl-btn${d.preset===x[0]?' on':''}" data-preset="${x[0]}" onclick="salesListDraft('preset','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
 if(col.type!=='list'){
  const ops=SALES_LIST_OPS[col.type],input=col.type==='number'?'number':col.type==='date'?'date':'text',step=input==='number'?' step="any"':'';
  html+=`<h5>Condition</h5><div class="sl-row"><button type="button" class="sl-btn${d.mode!=='exclude'?' on':''}" data-mode="include" onclick="salesListDraft('mode','include')">Include</button><button type="button" class="sl-btn${d.mode==='exclude'?' on':''}" data-mode="exclude" onclick="salesListDraft('mode','exclude')">Exclude</button></div>`;
  d.conds.forEach((c,i)=>{
   const needs=c.op!=='empty'&&c.op!=='notEmpty';
   if(i)html+=`<div class="sl-join"><button type="button" class="${c.join!=='or'?'on':''}" onclick="salesListDraftCond(${i},'join','and')">AND</button><button type="button" class="${c.join==='or'?'on':''}" onclick="salesListDraftCond(${i},'join','or')">OR</button></div>`;
   html+=`<div class="sl-row sl-cond"><select data-cond-op="${i}" onchange="salesListDraftCond(${i},'op',this.value)">${ops.map(o=>`<option value="${o[0]}" ${c.op===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>${needs?`<input type="${input}"${step} data-cond-v="${i}" value="${esc(c.v)}" oninput="salesListDraftInput(${i},'v',this.value)">`:''}${c.op==='between'?`<input type="${input}"${step} data-cond-v2="${i}" value="${esc(c.v2)}" oninput="salesListDraftInput(${i},'v2',this.value)">`:''}${d.conds.length>1?`<button type="button" class="sl-x" aria-label="Remove condition" onclick="salesListDraftRemoveCond(${i})">×</button>`:''}</div>`;
  });
  html+=`<div class="sl-row"><button type="button" class="sl-btn" data-add-cond="and" onclick="salesListDraftAddCond('and')">+ And</button><button type="button" class="sl-btn" data-add-cond="or" onclick="salesListDraftAddCond('or')">+ Or</button></div>`;
 }
 if(col.type==='list'||col.type==='text'){
  const opts=salesListValueOptions(col.k,infos),q=String(m.search||'').toLowerCase(),shown=opts.filter(x=>!q||x.text.toLowerCase().includes(q));
  const checked=t=>!Array.isArray(d.values)||d.values.includes(t);
  html+=`<h5>Values</h5><input type="text" id="salesListValueSearch" class="sl-search" placeholder="Search values…" value="${esc(m.search||'')}" oninput="salesListValueSearch(this)"><div class="sl-vals"><label><input type="checkbox" data-val-all ${!Array.isArray(d.values)?'checked':''} onchange="salesListDraftAllValues(this.checked)"> (Select all)</label>${shown.map(x=>`<label><input type="checkbox" data-val="${esc(x.text)}" ${checked(x.text)?'checked':''} onchange="salesListDraftValue(this.dataset.val,this.checked)"> <span>${esc(x.text)}</span><b>${x.n}</b></label>`).join('')}</div>`;
 }
 return html+`<div class="sl-actions"><button type="button" class="sl-btn" data-filter-clear onclick="salesListClearFilter('${col.k}')">Clear</button><button type="button" class="pri" data-filter-apply onclick="salesListApplyFilter()">Apply</button></div></div>`;
}
function salesListDraft(key,val){
 const m=salesListMenu;if(!m||!m.draft)return;
 if(key==='preset')m.draft.preset=m.draft.preset===val?'':val;else if(key==='mode')m.draft.mode=val==='exclude'?'exclude':'include';
 render();
}
function salesListDraftCond(i,key,val){const m=salesListMenu,c=m&&m.draft&&m.draft.conds[i];if(!c)return;c[key]=val;render();}
/* Ввод значения условия не перерисовывает экран — курсор остаётся в поле. */
function salesListDraftInput(i,key,val){const m=salesListMenu,c=m&&m.draft&&m.draft.conds[i];if(c)c[key]=val;}
function salesListDraftAddCond(join){
 const m=salesListMenu;if(!m||!m.draft||m.draft.conds.length>=6)return;
 m.draft.conds.push({op:salesListDefaultOp(salesListColumn(m.col)),v:'',v2:'',join:join==='or'?'or':'and'});render();
}
function salesListDraftRemoveCond(i){const m=salesListMenu;if(!m||!m.draft)return;m.draft.conds.splice(i,1);render();}
function salesListDraftValue(text,on){
 const m=salesListMenu;if(!m||!m.draft)return;
 const all=salesListValueOptions(m.col,salesListBase().infos).map(x=>x.text);
 let cur=Array.isArray(m.draft.values)?m.draft.values.slice():all.slice();
 if(on){if(!cur.includes(text))cur.push(text);}else cur=cur.filter(x=>x!==text);
 m.draft.values=all.every(x=>cur.includes(x))?null:cur;render();
}
function salesListDraftAllValues(on){const m=salesListMenu;if(!m||!m.draft)return;m.draft.values=on?null:[];render();}
function salesListValueSearch(el){
 if(!salesListMenu)return;
 salesListMenu.search=el.value;const pos=el.selectionStart;render();
 requestAnimationFrame(()=>{const e=document.getElementById('salesListValueSearch');if(e){e.focus();try{e.setSelectionRange(pos,pos);}catch(x){}}});
}
function salesListApplyFilter(){const m=salesListMenu;if(!m||m.kind!=='filter')return;salesListMenu=null;salesListSetFilter(m.col,m.draft);}

/* ------------------------------ Колонки -------------------------------- */
function salesListColumnsHTML(style){
 const p=salesListLoadPrefs();
 const rows=p.cols.map((c,i)=>{const col=salesListColumn(c.k);return `<div class="sl-cols-row" draggable="true" data-col-row="${c.k}" ondragstart="salesListDragKey='${c.k}'" ondragover="event.preventDefault()" ondrop="event.preventDefault();salesListDropColumn('${c.k}')"><span class="h" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-col-toggle="${c.k}" ${c.on?'checked':''} onchange="salesListSetColumn('${c.k}',this.checked)"> ${esc(col.label)}</label><button type="button" class="sm" aria-label="Move ${esc(col.label)} up" ${i===0?'disabled':''} onclick="salesListMoveColumn('${c.k}',-1)">↑</button><button type="button" class="sm" aria-label="Move ${esc(col.label)} down" ${i===p.cols.length-1?'disabled':''} onclick="salesListMoveColumn('${c.k}',1)">↓</button></div>`;}).join('');
 return `<div class="sl-menu sl-cols" style="${style}" role="dialog" aria-label="Columns"><h5>Columns · drag to reorder</h5>${rows}<div class="sl-actions"><button type="button" class="sl-btn" data-standard-view onclick="salesListStandardView()">Standard view</button></div></div>`;
}
function salesListSetColumn(k,on){const c=salesListLoadPrefs().cols.find(x=>x.k===k);if(!c)return;c.on=!!on;salesListSavePrefs();render();}
function salesListMoveColumn(k,delta){
 const cols=salesListLoadPrefs().cols,at=cols.findIndex(c=>c.k===k),to=at+delta;
 if(at<0||to<0||to>=cols.length)return;
 const [c]=cols.splice(at,1);cols.splice(to,0,c);salesListSavePrefs();render();
}
function salesListDropColumn(k){
 const from=salesListDragKey;salesListDragKey=null;if(!from||from===k)return;
 const cols=salesListLoadPrefs().cols,at=cols.findIndex(c=>c.k===from);if(at<0)return;
 const [c]=cols.splice(at,1);cols.splice(cols.findIndex(x=>x.k===k),0,c);salesListSavePrefs();render();
}
function salesListStandardView(){salesListLoadPrefs().cols=SALES_LIST_COLUMNS.map(c=>({k:c.k,on:!!c.def}));salesListSavePrefs();render();}

/* ------------------------------ Выбор строк ---------------------------- */
function salesListToggleRow(e,id){
 if(e)e.stopPropagation();
 const ids=[...document.querySelectorAll('[data-order-row]')].map(tr=>tr.dataset.orderRow),on=!salesListSel.has(id);
 if(e&&e.shiftKey&&salesListAnchor&&ids.includes(salesListAnchor)&&ids.includes(id)){
  const a=ids.indexOf(salesListAnchor),b=ids.indexOf(id);
  ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>{if(on)salesListSel.add(x);else salesListSel.delete(x);});
 }else if(on)salesListSel.add(id);else salesListSel.delete(id);
 salesListAnchor=id;render();
}
function salesListToggleAll(on){
 const ids=[...document.querySelectorAll('[data-order-row]')].map(tr=>tr.dataset.orderRow);
 ids.forEach(id=>{if(on)salesListSel.add(id);else salesListSel.delete(id);});render();
}
function salesListContextHTML(m,style){
 const o=(DB.salesOrder||[]).find(x=>x.id===m.id);if(!o)return '';
 const q=salesIsQuote(o),ids=salesListSelectedOrders(),many=ids.length>1&&ids.includes(o.id);
 const item=(act,label,cls)=>`<button type="button" role="menuitem" class="${cls||''}" data-menu="${act}" onclick="salesListMenuRun('${act}')">${label}</button>`;
 const hold=q?'':o.onHold?item('release',many?'Release · '+ids.length+' orders':'Release'):item('hold',many?'⛔ On Hold… · '+ids.length+' orders':'⛔ On Hold…');
 return `<div class="sl-ctx" style="${style}" role="menu">${item('open','Open')}${hold}<hr>${item('documents','Documents')}${!q&&o.status!=='cancelled'&&o.status!=='closed'?item('cancel','Cancel order'):''}<hr>${item('delete','Delete','dl')}</div>`;
}
function salesListMenuRun(act){
 const m=salesListMenu;salesListMenu=null;
 const o=m&&(DB.salesOrder||[]).find(x=>x.id===m.id);if(!o){render();return;}
 const sel=salesListSelectedOrders(),ids=sel.includes(o.id)?sel:[o.id],held=id=>!!(DB.salesOrder.find(x=>x.id===id)||{}).onHold;
 if(act==='open')salesOrderEdit(o.id);
 else if(act==='hold')salesHoldOpen(ids.filter(id=>!held(id)));
 else if(act==='release')salesReleaseHold(ids.filter(held));
 else if(act==='documents'){salesOrderEdit(o.id);docOpen();}
 else if(act==='cancel'){salesOrderEdit(o.id);salesCancelOrder();}
 else if(act==='delete')salesOrderDelete(o.id);
 else render();
}

/* ------------------------------ On Hold -------------------------------- */
/* Заказ на удержании не верифицируется и не уходит в батч, пока его не
   отпустят. Сохранять и править его можно. Кто поставил — не пишется: входа
   под своим именем в программе ещё нет. */
function salesListHoldSelected(){
 const ids=salesListSelectedOrders();if(!ids.length)return;
 const held=id=>!!(DB.salesOrder.find(o=>o.id===id)||{}).onHold;
 if(ids.every(held))salesReleaseHold(ids);else salesHoldOpen(ids.filter(id=>!held(id)));
}
function salesHoldOpen(ids){
 const orders=(ids||[]).map(id=>(DB.salesOrder||[]).find(o=>o.id===id)).filter(o=>o&&!salesIsQuote(o)&&!o.onHold&&o.status!=='closed'&&o.status!=='cancelled');
 if(!orders.length){alert('Select orders to put on hold. Quotes, closed and cancelled orders cannot be put on hold.');return;}
 salesHoldDialog={ids:orders.map(o=>o.id),choice:0,other:''};render();
}
function salesHoldClose(){salesHoldDialog=null;render();}
function salesHoldPick(i){if(!salesHoldDialog)return;salesHoldDialog.choice=i;render();}
function salesHoldOtherInput(v){
 const d=salesHoldDialog;if(!d)return;d.other=v;
 if(d.choice!==SALES_HOLD_REASONS.length){
  d.choice=SALES_HOLD_REASONS.length;
  document.querySelectorAll('.sl-hold-choice').forEach((el,i)=>{el.classList.toggle('on',i===SALES_HOLD_REASONS.length);const r=el.querySelector('input[type=radio]');if(r)r.checked=i===SALES_HOLD_REASONS.length;});
 }
}
function salesHoldDialogHTML(){
 const d=salesHoldDialog;if(!d)return '';
 const orders=d.ids.map(id=>(DB.salesOrder||[]).find(o=>o.id===id)).filter(Boolean),other=SALES_HOLD_REASONS.length;
 const names=orders.slice(0,4).map(o=>(o.businessNumber||'')+' · '+(salesCustomerDisplay(o.customerId)||'—')).join(', ')+(orders.length>4?' +'+(orders.length-4):'');
 const choice=(i,label)=>`<label class="sl-hold-choice${d.choice===i?' on':''}"><input type="radio" name="salesHoldChoice" data-hold-choice="${i}" ${d.choice===i?'checked':''} onchange="salesHoldPick(${i})"> ${label}</label>`;
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)salesHoldClose()"><div class="sales-service-modal sales-dialog sl-hold-dialog" role="dialog" aria-modal="true" aria-label="On Hold">
  <div class="sales-service-modal-head"><h3>Put ${orders.length} order${orders.length===1?'':'s'} on hold</h3><button type="button" aria-label="Close" onclick="salesHoldClose()">×</button></div>
  <div class="sales-dialog-body"><p class="mut">${raw(names)}</p>${SALES_HOLD_REASONS.map((r,i)=>choice(i,esc(r))).join('')}
   <label class="sl-hold-choice${d.choice===other?' on':''}"><input type="radio" name="salesHoldChoice" data-hold-choice="${other}" ${d.choice===other?'checked':''} onchange="salesHoldPick(${other})"> Other <input type="text" id="salesHoldOther" value="${esc(d.other)}" placeholder="reason…" oninput="salesHoldOtherInput(this.value)"></label>
   <div class="sales-dialog-note">On hold orders are not verified and do not go to batch until released.</div></div>
  <div class="sales-dialog-actions"><button type="button" onclick="salesHoldClose()">Back</button><button type="button" class="pri" data-hold-confirm onclick="salesHoldConfirm()">Put on hold</button></div></div></div>`;
}
function salesHoldConfirm(){
 const d=salesHoldDialog;if(!d)return;
 const reason=d.choice===SALES_HOLD_REASONS.length?String(d.other||'').trim():SALES_HOLD_REASONS[d.choice];
 if(!reason){alert('Write the reason for the hold.');return;}
 salesHoldDialog=null;salesHoldApply(d.ids,reason);
}
/* Удержание пишется прямо в сохранённый заказ; открытый в редакторе черновик
   получает те же поля, чтобы его несохранённые правки не потерялись. */
function salesHoldApply(ids,reason){
 const now=new Date().toISOString();
 (ids||[]).forEach(id=>{
  const o=(DB.salesOrder||[]).find(x=>x.id===id);if(!o||salesIsQuote(o))return;
  Object.assign(o,{onHold:true,holdReason:String(reason).slice(0,200),holdAt:now,updatedAt:now});
  if(soDraft&&soDraft.id===id)Object.assign(soDraft,{onHold:true,holdReason:o.holdReason,holdAt:now,updatedAt:now});
 });
 touch();render();
}
function salesReleaseHold(ids){
 const now=new Date().toISOString();
 (ids||[]).forEach(id=>{
  const o=(DB.salesOrder||[]).find(x=>x.id===id);if(!o||!o.onHold)return;
  Object.assign(o,{onHold:false,holdReason:'',holdAt:'',updatedAt:now});
  if(soDraft&&soDraft.id===id)Object.assign(soDraft,{onHold:false,holdReason:'',holdAt:'',updatedAt:now});
 });
 touch();render();
}
function salesHoldBar(o){
 if(!o||salesIsQuote(o)||!o.onHold)return '';
 return `<div class="sales-holdbar" data-hold-bar>⛔ <b>On Hold since ${esc(salesShortDate(o.holdAt))}</b>${o.holdReason?' · '+raw(o.holdReason):''}<span class="sp"></span><button type="button" class="sm" onclick="salesReleaseHold(['${esc(o.id)}'])">Release</button></div>`;
}
function salesHoldBlocked(){
 const o=soDraft;if(!o)return;
 salesDialogOpen({title:'Order '+(o.businessNumber||'')+' is On Hold',sub:o.holdReason||'',rows:[],note:'Release the hold before verifying the order or sending it to batch.',
  buttons:[{label:'Back'},{label:'Release hold',kind:'pri',run:()=>salesReleaseHold([o.id])}]});
}
