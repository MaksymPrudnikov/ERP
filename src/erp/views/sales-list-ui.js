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
   Ширина и порядок колонок — за заголовок (views/col-widths, пункт 11,
   30.10.2026); Order Items — отдельные стёкла заказа по материалам.
   Все экраны (владелец, 2.11.2026): короткие колонки на своих ширинах,
   остаток — Customer; когда места нет, колонки прячутся по порядку
   (SALES_LIST_NARROW), включённая шестерёнкой видна всегда. Итоги прилипают
   к низу экрана, что считать — раздел Show at bottom в меню колонки.
   ===================================================================== */

const SALES_LIST_PREFS_KEY='glass_erp_sales_list_v1';
const SALES_LIST_PRIORITY={normal:'Normal',rush:'Rush',critical:'Critical'};
/* def — видна по умолчанию (владелец выбрал «как на макете»); sum — итог внизу. */
const SALES_LIST_COLUMNS=[
 {k:'type',label:'Type',type:'list',def:true},
 {k:'number',label:'Number',type:'text',def:true},
 {k:'customer',label:'Customer',type:'text',def:true},
 {k:'createdBy',label:'Created by',type:'text'},
 {k:'po',label:'PO',type:'text',def:true},
 {k:'created',label:'Created',type:'date',def:true},
 {k:'due',label:'Due',type:'date',def:true},
 {k:'status',label:'Status',type:'list',def:true},
 /* Счёт (владелец 06.11.2026): Invoiced — бухгалтер напечатал или отправил
    Invoice клиенту (журнал заказа); Not invoiced — всё выдано, счёта не было.
    07.11.2026 — видна сразу, за Status, с фильтром ▾ как у других колонок. */
 {k:'invoice',label:'Invoice',type:'list',def:true},
 {k:'priority',label:'Priority',type:'list',def:true},
 {k:'glass',label:'Glass',type:'text',def:true},
 {k:'orderItems',label:'Order Items',type:'text',def:true},
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
 {k:'updated',label:'Updated',type:'date'},
 /* Поля заказа, которых не было на экране (владелец 07.11.2026: «если где-то
    не хватает данных в колонках, даже в Sales — добавь»): в ⚙ Columns. */
 {k:'account',label:'Account',type:'text'},
 {k:'contact',label:'Contact',type:'text'},
 {k:'currency',label:'Currency',type:'list'},
 {k:'billed',label:'Picked up',type:'date'},
 {k:'payDue',label:'Payment due',type:'date'},
 {k:'daysLate',label:'Days late',type:'number'},
 {k:'holdReason',label:'Hold reason',type:'text'},
 {k:'notes',label:'Notes',type:'text'}
];
const SALES_LIST_OPS={
 text:[['contains','Contains'],['notContains','Does not contain'],['startsWith','Starts with'],['endsWith','Ends with'],['equals','Equals'],['notEqual','Not equal'],['empty','Is empty'],['notEmpty','Is not empty']],
 number:[['startsWith','Starts with'],['gt','> Greater than'],['gte','≥ At least'],['lt','< Less than'],['lte','≤ At most'],['eq','= Equal to'],['ne','≠ Not equal'],['between','Between'],['empty','Is empty']],
 date:[['between','Between'],['startsWith','Starts with'],['on','On'],['before','Before'],['after','After'],['empty','Is empty']],
 list:[]
};
const SALES_LIST_PRESETS=[['today','Today'],['yesterday','Yesterday'],['thisWeek','This week'],['last7','Last 7 days'],['last14','Last 14 days'],['last30','Last 30 days'],['thisMonth','This month'],['lastMonth','Last month'],['thisYear','This year']];
/* Сроки оплаты смотрят вперёд (Finance → Due dates): просрочено и ближайшие дни. */
const SALES_LIST_DUE_PRESETS=[['overdue','Overdue'],['today','Today'],['next7','Next 7 days'],['next30','Next 30 days'],['thisMonth','This month'],['nextMonth','Next month']];
const SALES_HOLD_REASONS=['Waiting for payment','Customer asked to wait','Sizes or drawing to confirm','Credit check'];
/* Sales: колонка прячется на экране уже этой ширины (владелец, 2.11.2026).
   Created — до 1820 (07.11.2026): место колонке Invoice, таблица без прокрутки. */
const SALES_LIST_NARROW={orderItems:1800,glass:1620,created:1820,priority:1400,area:1400,units:1200,po:1200,receipts:1200};
/* Show at bottom: что считать под колонкой. Таблицы с итогом salesListFooter. */
const SALES_LIST_CALC_NUMBER=[['sum','Sum'],['avg','Average'],['count','Count'],['min','Min'],['max','Max'],['none','None']];
const SALES_LIST_CALC_TEXT=[['count','Count'],['unique','Unique'],['none','None']];

let salesListPrefs=null,salesListMenu=null,salesListSel=new Set(),salesListAnchor=null,salesListDragKey=null,salesHoldDialog=null;

/* ------------------------------ Настройки ------------------------------ */
/* Один движок колонок/фильтров, отдельные настройки Sales, Optimization и Shipping. */
const salesQueuePrefs={optimization:null,shipping:null};
function salesListScope(){const g=typeof slGenericScope==='function'?slGenericScope():'';if(g)return g;if(tab==='purchasing'&&typeof purListScope==='function')return purListScope();if(tab==='inventory'&&typeof invListScope==='function')return invListScope();if(tab==='shipping'&&typeof shippingListScope==='function'&&shippingListScope())return shippingListScope();if(tab==='users'&&typeof usersListScope==='function'&&usersListScope())return usersListScope();if(tab==='customers'&&typeof custListScope==='function'&&custListScope())return custListScope();if(tab==='masterdata'&&typeof mdListScope==='function'&&mdListScope())return mdListScope();if(tab==='finance'&&typeof finListScope==='function')return finListScope();if(tab==='commissions'&&typeof comListScope==='function')return comListScope();if(tab==='production'&&typeof prodListScope==='function'&&prodListScope())return prodListScope();if(tab==='optimization'&&typeof glassBatchViewScope==='function'&&glassBatchViewScope())return glassBatchViewScope();return tab==='optimization'||tab==='shipping'?tab:'sales';}
function salesListCatalog(){
 /* Таблицы на views/sl-generic — свои колонки по scope. */
 if(typeof SL_GENERIC!=='undefined'&&SL_GENERIC[salesListScope()])return SL_GENERIC[salesListScope()].columns();
 if(tab==='purchasing'&&typeof purListColumns==='function')return purListColumns();
 if(tab==='inventory'&&typeof invListColumns==='function')return invListColumns();
 if(salesListScope()==='shippingPS')return shippingListColumns();
 if(salesListScope()==='shippingSkids'&&typeof skidsListColumns==='function')return skidsListColumns();
 if(salesListScope()==='shippingBackorders'&&typeof shippingBackorderColumns==='function')return shippingBackorderColumns();
 if(salesListScope()==='shippingDelivery'&&typeof deliveryListColumns==='function')return deliveryListColumns();
 if(salesListScope().startsWith('fin')&&typeof finListColumns==='function')return finListColumns();
 if(salesListScope().startsWith('prod')&&typeof prodListColumns==='function')return prodListColumns();
 if(salesListScope()==='glassSheets'&&typeof sheetUsageColumns==='function')return sheetUsageColumns();
 if(salesListScope()==='glassStock'&&typeof stockListColumns==='function')return stockListColumns();
 if(typeof glassBatchColumns==='function'&&salesListScope().startsWith('glass'))return glassBatchColumns();
 if(salesListScope()==='mdSupply'&&typeof mdSupplyColumns==='function')return mdSupplyColumns();
 if(salesListScope()==='customers'&&typeof custColumns==='function')return custColumns();
 if(salesListScope()==='usersLog'&&typeof authLogColumns==='function')return authLogColumns();
 if(salesListScope()==='agents'&&typeof comListColumns==='function')return comListColumns();
 if(salesListScope()==='sales')return SALES_LIST_COLUMNS;
 /* Priority видна сразу: Critical-заказ стоял посередине очереди, и офис
    не видел, что он срочный (проход 7.10.2026). */
 const defaults=['number','customer','due','status','priority','glass','unitType','units','batch','balance'].concat(tab==='shipping'&&shippingTab==='done'?['orderItems']:[]);
 /* Оптимизатору деньги не нужны — «лишняя информация» (владелец,
    7.10.2026): в очереди Optimization нет Total, Receipts и Balance. В
    Shipping долг остаётся — по нему решают, отдавать ли. */
 const money=tab==='optimization';
 /* Оптимизатору важно, сколько стекла и сколько ft² (владелец, 7.10.2026):
    Area ft² видна сразу, рядом с Units — Glass pcs, стекло к резке (у
    стеклопакета два-три, у ламината — каждая плита, как в To batch). */
 const pcs={k:'pcs',label:'Glass pcs',type:'number',def:true,sum:true};
 /* Order Items — в очередях Shipping, как в Sales (владелец, 04.11.2026). */
 return SALES_LIST_COLUMNS.filter(c=>!['type','validUntil','revisions','fromQuote'].concat(tab==='shipping'?[]:['orderItems']).includes(c.k)&&!(money&&c.money)).flatMap(c=>{const col=Object.assign({},c,{def:defaults.includes(c.k)||money&&c.k==='area',tokens:c.k==='glass'});return money&&c.k==='units'?[col,pcs]:[col];})
  .concat([{k:'batch',label:'Batch',type:'text',def:true,tokens:true},{k:'newLines',label:'New lines',type:'number',def:false,sum:true}]).concat(tab==='shipping'&&shippingTab==='awaiting'?[{k:'readyQty',label:'Ready',type:'text',def:true}]:[]);
}
function salesListColumn(k){return salesListCatalog().find(c=>c.k===k)||null;}
function salesListPrefsKey(){const scope=salesListScope();return scope==='sales'?SALES_LIST_PREFS_KEY:'glass_erp_'+scope+'_list_v1';}
function salesListLoadPrefs(){
 const scope=salesListScope(),cached=scope==='sales'?salesListPrefs:salesQueuePrefs[scope];if(cached)return cached;
 let p={};try{p=JSON.parse(localStorage.getItem(salesListPrefsKey())||'{}')||{};}catch(e){p={};}
 const clean=salesListCleanPrefs(p);if(scope==='sales')salesListPrefs=clean;else salesQueuePrefs[scope]=clean;
 return clean;
}
function salesListSavePrefs(){try{localStorage.setItem(salesListPrefsKey(),JSON.stringify(salesListLoadPrefs()));}catch(e){}}
function salesListCleanPrefs(p){
 p=p&&typeof p==='object'&&!Array.isArray(p)?p:{};
 const seen=new Set(),cols=[];
 (Array.isArray(p.cols)?p.cols:[]).forEach(c=>{if(c&&salesListColumn(c.k)&&!seen.has(c.k)){seen.add(c.k);cols.push({k:c.k,on:!!c.on});}});
 /* Новая колонка встаёт за соседкой по каталогу, а не в конец (Order Items — сразу после Glass). */
 salesListCatalog().forEach((c,i,all)=>{if(seen.has(c.k))return;const prev=all.slice(0,i).reverse().find(x=>cols.some(y=>y.k===x.k));cols.splice(prev?cols.findIndex(y=>y.k===prev.k)+1:0,0,{k:c.k,on:!!c.def});});
 const filters={},src=p.filters&&typeof p.filters==='object'&&!Array.isArray(p.filters)?p.filters:{};
 Object.keys(src).forEach(k=>{const f=salesListCleanFilter(k,src[k]);if(f&&salesListFilterActive(f))filters[k]=f;});
 const sort=p.sort&&salesListColumn(p.sort.k)?{k:p.sort.k,dir:p.sort.dir==='asc'?'asc':'desc'}:null;
 if(salesListScope()==='sales'&&p.createdRangeInitialized!==true&&!filters.created)filters.created=salesListCleanFilter('created',{preset:'last14'});
 if(salesListScope()==='usersLog'&&p.createdRangeInitialized!==true&&!filters.when)filters.when=salesListCleanFilter('when',{preset:'last14'});
 if(salesListScope()==='customers'&&p.createdRangeInitialized!==true&&typeof custListDefaults==='function')Object.entries(custListDefaults()).forEach(([k,f])=>{const c=salesListCleanFilter(k,f);if(c&&salesListFilterActive(c))filters[k]=c;});
 if(salesListScope().startsWith('fin')&&p.createdRangeInitialized!==true&&typeof finListDefaults==='function')Object.entries(finListDefaults()).forEach(([k,f])=>{const c=salesListCleanFilter(k,f);if(c&&salesListFilterActive(c))filters[k]=c;});
 if(tab==='purchasing'&&p.purchasingDateInitialized!==true&&typeof purListDefaults==='function')Object.entries(purListDefaults()).forEach(([k,f])=>{if(!filters[k])filters[k]=salesListCleanFilter(k,f);});
 const calc={},src2=p.calc&&typeof p.calc==='object'&&!Array.isArray(p.calc)?p.calc:{};
 Object.keys(src2).forEach(k=>{const c=salesListColumn(k);if(c&&salesListCalcOptions(c).some(x=>x[0]===src2[k]))calc[k]=src2[k];});
 const clean={cols,filters,sort,createdRangeInitialized:true,statusExpanded:p.statusExpanded===true,statusHidden:p.statusHidden===true,quick:SALES_QUICK_ALL.some(q=>q[0]===p.quick)?p.quick:'all',calc,pinned:(Array.isArray(p.pinned)?p.pinned:[]).filter(k=>salesListColumn(k)),frozen:(Array.isArray(p.frozen)?p.frozen:[]).filter(k=>salesListColumn(k))};
 if(tab==='inventory'&&p.inventoryDateInitialized!==true&&typeof invListDefaults==='function')Object.entries(invListDefaults()).forEach(([k,f])=>{if(!filters[k])filters[k]=salesListCleanFilter(k,f);});
 if(tab==='purchasing')clean.purchasingDateInitialized=true;
 if(salesListCwId()){const w=cwClean(p.widths);if(Object.keys(w).length)clean.widths=w;}
 if(salesListScope()==='shippingPS')clean.dayInit=p.dayInit===true;
 if(tab==='inventory')clean.inventoryDateInitialized=true;
 /* Колонка Invoice (07.11.2026) включается один раз и встаёт за Status —
    и у списков, сохранённых раньше, где она была выключена. */
 if(salesListScope()==='sales'){
  if(p.invoiceShown!==true){const i=cols.findIndex(c=>c.k==='invoice');if(i>=0){const c=cols.splice(i,1)[0];c.on=true;const at=cols.findIndex(x=>x.k==='status');cols.splice(at>=0?at+1:cols.length,0,c);}}
  clean.invoiceShown=true;
 }
 return clean;
}
function salesListDefaultOp(col){return col.type==='number'?'gt':col.type==='date'?'between':'contains';}
function salesListEmptyFilter(col){return {mode:'include',conds:col.type==='list'?[]:[{op:salesListDefaultOp(col),v:'',v2:'',join:'and'}],values:null,preset:''};}
function salesListCleanFilter(k,f){
 const col=salesListColumn(k);if(!col||!f||typeof f!=='object'||Array.isArray(f))return null;
 const ops=(SALES_LIST_OPS[col.type]||[]).map(x=>x[0]);
 const conds=(Array.isArray(f.conds)?f.conds:[]).filter(c=>c&&ops.includes(c.op)).slice(0,6)
  .map((c,i)=>({op:c.op,v:String(c.v==null?'':c.v).slice(0,120),v2:String(c.v2==null?'':c.v2).slice(0,120),join:i&&c.join==='or'?'or':'and'}));
 const values=(col.type==='list'||col.type==='text')&&Array.isArray(f.values)?f.values.map(v=>String(v)).slice(0,500):null;
 const preset=col.type==='date'&&(col.presets||SALES_LIST_PRESETS).some(x=>x[0]===f.preset)?f.preset:'';
 return {mode:f.mode==='exclude'?'exclude':'include',conds,values,preset};
}
function salesListColumns(){
 const p=salesListLoadPrefs(),both=['orders','quotes','ncr'].filter(k=>salesShow[k]).length>1;
 /* Type нужна, только когда в списке больше одного вида: заказы, квоты, NCR. */
 const cols=p.cols.filter(c=>c.on&&(c.k!=='type'||both)&&!salesListAutoHidden(c.k)).map(c=>salesListColumn(c.k));
 /* Закреплённые (Freeze) — слева, в порядке Columns; снятая встаёт на своё место. */
 return cols.filter(c=>p.frozen.includes(c.k)).concat(cols.filter(c=>!p.frozen.includes(c.k)));
}
/* Freeze (владелец, 05.11.2026, вариант B — значок в ряду Sort): колонка
   встаёт слева и не уезжает при прокрутке вбок. Закрепить можно и скрытую:
   включится, когда её снова покажут. */
function salesListFreeze(k){
 const p=salesListLoadPrefs();p.frozen=p.frozen.includes(k)?p.frozen.filter(x=>x!==k):p.frozen.concat(k);
 salesListMenu=null;salesListSavePrefs();render();
}
/* Таблицы с ширинами и порядком за заголовок (views/col-widths): Sales и список PS. */
function salesListCwId(){const s=salesListScope();return s==='sales'?'sales':s==='shippingPS'?'shipments':CW_TABLES[s]?s:'';}
function salesListNarrowRule(k){return salesListScope()==='sales'&&window.innerWidth<(SALES_LIST_NARROW[k]||0);}
/* Agents: колонки с HST видны только с галочкой With HST. */
function salesListAutoHidden(k){return salesListNarrowRule(k)&&!salesListLoadPrefs().pinned.includes(k)||typeof comHstHidden==='function'&&comHstHidden(k);}

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
  case 'last7':case 'last14':case 'last30':return [salesListDay(add(d,1-Number(key.slice(4)))),salesListDay(d)];
  case 'thisMonth':return [salesListDay(new Date(d.getFullYear(),d.getMonth(),1)),salesListDay(new Date(d.getFullYear(),d.getMonth()+1,0))];
  case 'lastMonth':return [salesListDay(new Date(d.getFullYear(),d.getMonth()-1,1)),salesListDay(new Date(d.getFullYear(),d.getMonth(),0))];
  case 'thisYear':return [d.getFullYear()+'-01-01',d.getFullYear()+'-12-31'];
  case 'lastYear':return [(d.getFullYear()-1)+'-01-01',(d.getFullYear()-1)+'-12-31'];
  /* Без нижней границы: пустое From в блоке дат, а сравнение строк '' <= любой дате. */
  case 'overdue':return ['',salesListDay(add(d,-1))];
  case 'next7':case 'next30':return [salesListDay(d),salesListDay(add(d,Number(key.slice(4))))];
  case 'nextMonth':return [salesListDay(new Date(d.getFullYear(),d.getMonth()+1,1)),salesListDay(new Date(d.getFullYear(),d.getMonth()+2,0))];
 }
 return null;
}
/* Стёкла по лайтам — Short name, пусто — код (владелец, 29.10.2026);
   несколько Makeup — через «·». byCode — те же стёкла кодами: фильтр Glass
   находит и по короткому названию, и по коду. */
function salesListGlass(o,byCode){
 const used=new Set((o.lines||[]).map(l=>l.makeupId)),name=g=>g?(byCode?g.code:glassShortName(g)):'?';
 const code=p=>{
  if(p.category==='laminated'){const L=p.laminated||{},a=glassProductById(L.outer&&L.outer.glassProductId),b=glassProductById(L.inner&&L.inner.glassProductId);return name(a)+'+'+name(b);}
  return name(glassProductById(p.glassProductId));
 };
 return (o.makeups||[]).filter(m=>used.has(m.id)).map(m=>(m.panes||[]).map(code).join(' / ')).join(' · ');
}
/* Order Items (пункт 11): отдельные стёкла по материалам — Qty строки ×
   вхождения стекла в её Makeup, у ламината каждая плита; прослойка — не
   стекло. Short name, пусто — код; byCode — те же группы кодами (фильтр
   находит и по коду). Порядок — первое появление. Неполное не выдаётся за
   ноль: стекла нет в каталоге — Unknown glass, строка без Makeup или Qty — «not counted». */
function salesListOrderItems(o,byCode){
 const lines=o.lines||[];if(!lines.length)return null;
 const sum=new Map();let unknown=0,skipped=0;
 lines.forEach(l=>{
  const q=Number(l.qty),m=salesMakeupById(o,l.makeupId);
  if(!(q>0)||!m||!(m.panes||[]).length){skipped++;return;}
  glassBatchComponents(o,l).forEach(c=>{const g=glassProductById(c.glassId);if(!g){unknown+=q;return;}const x=sum.get(g.id);if(x)x.n+=q;else sum.set(g.id,{g,n:q});});
 });
 const parts=[...sum.values()].map(x=>(byCode?x.g.code:glassShortName(x.g))+': '+x.n);
 if(unknown)parts.push('Unknown glass: '+unknown);
 if(skipped)parts.push(skipped+' line'+(skipped===1?'':'s')+' not counted');
 return parts.length?parts.join(' | '):null;
}
/* Значения строк живут между отрисовками вместе с указателями (erp/read-scope):
   сортировка и фильтр не считают их заново. Открытый заказ — всегда заново. */
function salesListInfo(o){
 const keep=readOn()&&!(typeof storageDepth!=='undefined'&&storageDepth)&&o!==soDraft?readMemo('salesListInfos',[DB.salesOrder,DB.customer],()=>new WeakMap()):null;
 let info=keep&&keep.get(o);if(info)return info;
 info={o,q:salesIsQuote(o),c:salesFindCustomer(o.customerId)||{},memo:{}};if(keep)keep.set(o,info);return info;
}
function salesListValue(info,k){
 if(Object.prototype.hasOwnProperty.call(info.memo,k))return info.memo[k];
 /* Заказ в архиве — значения из строки, снятой в день ухода (erp/archive). */
 if(info.a)return archiveListValue(info,k);
 const o=info.o,q=info.q,c=info.c,lines=o.lines||[];let v=null;
 switch(k){
  case 'readyQty':{const r=shippingSummary(o);v=r.physicalReady+' / '+r.glass;break;}
  case 'type':v=q?'Quote':'Order';break;
  case 'number':v=(q?salesQuoteBaseNumber(o):o.businessNumber)||'';break;
  case 'customer':v=c.displayName||c.legalName||'';break;
  case 'po':v=o.customerPo||'';break;
  case 'created':v=salesListIsoDay(o.createdAt);break;
  case 'due':v=o.dueDate||'';break;
  case 'status':v=salesStatusLabel(o,salesListStatus(o));break;
  case 'priority':v=SALES_LIST_PRIORITY[o.priority]||'Normal';break;
  case 'glass':v=salesListGlass(o);break;
  case 'orderItems':v=salesListOrderItems(o);break;
  case 'batch':v=salesOrderBatchNumbers(o).join(', ');break;
  case 'newLines':v=salesUnbatchedLines(o).length;break;
  case 'units':v=lines.reduce((s,l)=>s+salesPositiveInt(l.qty,1),0);break;
  case 'pcs':v=lines.reduce((s,l)=>s+salesPositiveInt(l.qty,1)*glassBatchComponents(o,l).length,0);break;
  case 'area':v=Math.round(finWithOrder(o,()=>lines.reduce((s,l)=>{const a=salesLineAreas(l,o);return s+(a.valid?a.actual*salesPositiveInt(l.qty,1):0);},0))*10)/10;break;
  case 'total':{const t=finOrderTotals(o);v=t.complete?finMoney(t.grand):null;break;}
  case 'receipts':v=!q&&finOrderCounts(o)?finOrderPaid(o.id).paid:null;break;
  case 'balance':if(!q&&finOrderCounts(o)){const b=finOrderBalance(o);info.memo.balanceInfo=b;v=b.balance;}break;
  case 'hold':v=!q&&o.onHold?'On Hold':'Not on hold';break;
  case 'delivery':v=o.delivery==='delivery'?'Delivery':'Pickup';break;
  case 'rep':v=c.salesRep||'';break;
  case 'account':v=c.code||'';break;
  case 'contact':{const p=(c.contacts||[]).find(x=>x.id===o.customerContactId);v=p?p.name||p.email||'':'';break;}
  case 'currency':v=o.currency||'';break;
  case 'billed':v=q||typeof finBillingDate!=='function'?'':finBillingDate(o)||'';break;
  case 'payDue':v=q||typeof finOrderFinancial!=='function'?'':finOrderFinancial(o).dueOn||'';break;
  case 'daysLate':{if(q||typeof finOrderFinancial!=='function'){v=null;break;}const f=finOrderFinancial(o),d=f.dueOn&&f.b.balance>0&&f.dueOn<finToday()?Math.floor((Date.parse(finToday())-Date.parse(f.dueOn))/864e5):0;v=d||null;break;}
  case 'holdReason':v=o.onHold?o.holdReason||'':'';break;
  case 'notes':v=o.notes||'';break;
  case 'createdBy':{const e=orderCreatedBy(o.id);v=e?e.by:'';break;}
  case 'terms':v=finTermsFor(o).paymentMode==='credit'?'Credit':'Cash';break;
  case 'invoice':v=q?'':!finInvoiceDate(o)?'In work':salesInvoicedSet().has(o.id)?'Invoiced':'Not invoiced';break;
  case 'lines':v=lines.length;break;
  /* Пункт 14: известный вес всегда, неполный — с Partial (salesListWeightCell);
     число — для сортировки и фильтра, признак — в memo. */
  case 'weight':{const w=finWithOrder(o,()=>salesOrderWeight(o));info.memo.weightInfo=w;v=w.kg;break;}
  case 'unitType':v=[...new Set((o.makeups||[]).filter(m=>lines.some(l=>l.makeupId===m.id)).map(m=>docUnitLabel(m.unitType)))].join(', ');break;
  case 'shapes':v=lines.filter(salesListShapedLine).length;break;
  case 'validUntil':v=q?(o.validUntil||''):'';break;
  case 'revisions':v=q?salesQuoteMembers(o).length:null;break;
  /* Квота ушла в архив вместе с заказом — номер из указателя архива. */
  case 'fromQuote':{const f=o.fromQuoteId?(DB.salesOrder||[]).find(x=>x.id===o.fromQuoteId):null,a=o.fromQuoteId&&!f&&typeof archiveKnown==='function'?archiveKnown(o.fromQuoteId):null;v=f?f.businessNumber||'':a?a.number||'':'';break;}
  case 'updated':v=salesListIsoDay(o.updatedAt);break;
 }
 info.memo[k]=v;return v;
}
/* Фигура — всё, что не прямоугольник по Width × Height (тот же признак, что «Rect» в строках заказа). */
function salesListShapedLine(l){const s=salesShapeByRef(l&&l.shapeRef);return !!s&&!salesShapeIsLineRect(s);}
/* Текст значения для галочек фильтра. */
function salesListText(info,k){const v=salesListValue(info,k);return v==null||v===''?'(empty)':String(v);}

/* ------------------------------ Фильтры -------------------------------- */
function salesListCondReady(c){return c.op==='empty'||c.op==='notEmpty'||String(c.v==null?'':c.v).trim()!==''||(c.op==='between'&&String(c.v2==null?'':c.v2).trim()!=='');}
function salesListFilterActive(f){return !!f&&(!!f.preset||Array.isArray(f.values)||(f.conds||[]).some(salesListCondReady));}
function salesListCondTest(type,c,val){
 const empty=val==null||val==='';
 if(c.op==='empty')return empty;
 if(c.op==='notEmpty')return !empty;
 /* Starts with у чисел и дат (быстрый фильтр в заголовке): по тексту
    значения — «76» находит 76025, «2026-10» и «Oct» — даты октября. */
 if(c.op==='startsWith'&&type!=='text'&&type!=='list'){
  if(empty)return false;const x=String(c.v==null?'':c.v).trim().toLowerCase().replace(/[$,]/g,'');
  return String(val).toLowerCase().startsWith(x)||type==='date'&&String(salesListShortDay(val)).toLowerCase().startsWith(x);
 }
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
  if(c.op==='between'&&!okA&&okB)return val<=b;
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
 /* Glass: условие проверяется и по Short name, и по коду. «Не содержит» —
    по обоим сразу. */
 const alt=info.a?null:col.k==='glass'?salesListGlass(info.o,true):col.k==='orderItems'?salesListOrderItems(info.o,true):null;
 const test=c=>{const t=salesListCondTest(col.type,c,val);if(alt==null||alt===val)return t;const u=salesListCondTest(col.type,c,alt);return c.op==='notContains'||c.op==='notEqual'?t&&u:t||u;};
 if(Array.isArray(f.values))ok=col.tokens?salesListTokens(info,col.k).some(v=>f.values.includes(v)):f.values.includes(salesListText(info,col.k));
 if(ok&&f.preset&&col.type==='date'){const r=readMemo('salesPreset:'+f.preset,[],()=>salesListPresetRange(f.preset));ok=!!val&&!!r&&val>=r[0]&&val<=r[1];}
 const conds=(f.conds||[]).filter(salesListCondReady);
 if(ok&&conds.length){
  let r=test(conds[0]);
  for(let i=1;i<conds.length;i++){const t=test(conds[i]);r=conds[i].join==='or'?(r||t):(r&&t);}
  ok=r;
 }
 return f.mode==='exclude'?!ok:ok;
}
/* Один Intl.Collator на сортировку: тот же порядок, что localeCompare с теми
   же настройками, но он не собирается заново на каждое сравнение. */
const salesListTextOrder=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'}),salesListPlainOrder=new Intl.Collator();
function salesListCompare(col,dir){
 return (a,b)=>{
  const va=salesListValue(a,col.k),vb=salesListValue(b,col.k),ea=va==null||va==='',eb=vb==null||vb==='';
  if(ea||eb)return ea&&eb?0:ea?1:-1;
  const r=col.type==='number'?va-vb:salesListTextOrder.compare(String(va),String(vb));
  return dir==='asc'?r:-r;
 };
}
/* Строки после галочек Show и кнопок статусов (до фильтров колонок). */
function salesListBase(){
 if(salesListScope()==='shippingPS'){const infos=shippingListInfos();return {all:infos.map(i=>i.o),infos};}
 if(salesListScope().startsWith('fin')&&typeof finListInfos==='function'){const infos=finListInfos();return {all:infos.map(i=>i.o),infos};}
 if(salesListScope()==='glassSheets'&&typeof sheetUsageInfos==='function'){const infos=sheetUsageInfos();return {all:infos.map(i=>i.o),infos};}
 if(salesListScope().startsWith('glass')){const infos=glassBatchInfos();return {all:infos.map(i=>i.o),infos};}
 if(salesListScope().startsWith('prod')&&typeof prodListInfos==='function'){const infos=prodListInfos();return {all:infos.map(i=>i.o),infos};}
 if(salesListScope()!=='sales'){const infos=optimizationBase();return {all:infos.map(i=>i.o),infos};}
 const all=salesListVisible(),ncrs=salesShow.ncr&&typeof ncrListInfos==='function'?ncrListInfos():[];
 /* Ушедшие в архив — вместе с живыми: за любой период, в фильтрах и итогах. */
 const old=typeof archiveListInfos==='function'?archiveListInfos(a=>salesShow[a.kind==='quote'?'quotes':'orders']):[];
 /* pool — без кнопки статуса: по нему считаются числа на кнопках. */
 const pool=all.map(salesListInfo).concat(old,ncrs);
 return {all:all.concat(old.map(i=>i.o),ncrs.map(i=>i.o)),pool,infos:salesStatusFilter?pool.filter(r=>salesListStatusKey(r)===salesStatusFilter):pool};
}
/* Сортировка по умолчанию: у Sales — новые сверху, у таблиц Finance — своя. */
function salesListDefaultSort(){const g=typeof SL_GENERIC!=='undefined'&&SL_GENERIC[salesListScope()];if(g)return g.sort||{k:'',dir:'asc'};if(tab==='purchasing'&&typeof purListDefaultSort==='function')return purListDefaultSort();if(tab==='inventory'&&typeof invListDefaultSort==='function')return invListDefaultSort();if(salesListScope()==='shippingPS')return {k:'number',dir:'desc'};const s=salesListScope(),f=s.startsWith('fin')&&typeof finListDefaultSort==='function'?finListDefaultSort():s.startsWith('prod')&&typeof prodListDefaultSort==='function'?prodListDefaultSort():null;return f||(s==='agents'?{k:'toPay',dir:'desc'}:s==='mdSupply'?{k:'product',dir:'asc'}:s==='glassSheets'?{k:'built',dir:'desc'}:{k:'created',dir:'desc'});}
/* Колонка блока дат над таблицей: её фильтр показан кнопкой, а не чипом. */
function salesListDateColumn(){if(tab==='purchasing'&&typeof purListDateColumn==='function')return purListDateColumn();if(tab==='inventory'&&typeof invListDateColumn==='function')return invListDateColumn();return salesListScope()==='usersLog'?'when':salesListScope()==='shippingPS'?'date':salesListScope()==='sales'?'created':salesListScope()==='glassSheets'?'built':salesListScope().startsWith('fin')&&typeof finListDateColumn==='function'?finListDateColumn():salesListScope().startsWith('prod')?'due':'';}
function salesListRows(infos,skip){
 const p=salesListLoadPrefs(),active=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k])&&!(skip||[]).includes(k));
 const rows=infos.filter(info=>active.every(k=>salesListFilterTest(salesListColumn(k),p.filters[k],info)));
 const d=salesListDefaultSort(),s=p.sort||d,col=salesListColumn(s.k)||salesListColumn(d.k),cmp=col?salesListCompare(col,s.dir):()=>0;
 return rows.sort((a,b)=>cmp(a,b)||salesListPlainOrder.compare(String(b.o.createdAt||''),String(a.o.createdAt||'')));
}
/* Быстрые виды Sales (владелец, 1 октября 2026): таблетки над таблицей.
   Работают поверх фильтров колонок, кроме даты создания: заказ, созданный
   месяц назад, сдаётся сегодня или уже просрочен — он должен быть виден в
   Today и Needs attention, хотя список по умолчанию показывает 14 дней.
   Выданные, закрытые и отменённые заказы в сроки и «внимание» не попадают —
   с ними уже ничего делать не нужно. */
const SALES_QUICK=[['all','All'],['today','Today'],['week','Due this week'],['attention','Needs attention']];
/* Только в Sales: заказы, которым пора выставить счёт. */
const SALES_QUICK_ALL=SALES_QUICK.concat([['invoice','Not invoiced']]);
/* Заказы, чей Invoice напечатан или отправлен (журнал заказа). */
let salesInvoicedCache=null;
function salesInvoicedSet(){
 const ev=Array.isArray(DB.orderEvent)?DB.orderEvent:[];
 if(salesInvoicedCache&&salesInvoicedCache.ev===ev&&salesInvoicedCache.n===ev.length)return salesInvoicedCache.s;
 const s=new Map();ev.forEach(e=>{if(e&&(e.what==='Printed'||e.what==='Emailed')&&e.note==='Invoice'){const d=String(e.at||'').slice(0,10);if(!s.has(e.orderId)||d<s.get(e.orderId))s.set(e.orderId,d);}});
 salesInvoicedCache={ev,n:ev.length,s};return s;
}
/* Ячейка Invoice: Invoiced зелёным; Not invoiced — сколько дней заказ
   выдан без счёта, с 3 дней жёлтым; в работе — прочерк. */
function salesInvoicePill(o,v){
 if(v==='Invoiced')return '<span class="pill ok sl-inv-pill">Invoiced</span>';
 if(v!=='Not invoiced')return v?`<span class="mut" title="${esc(v)}">—</span>`:'';
 const d=Math.max(0,Math.round((Date.parse(finToday())-Date.parse(finInvoiceDate(o)))/864e5));
 return `<span class="pill sl-inv-pill${d>=3?' warn':''}" title="Days without invoice">Not invoiced · ${d} d</span>`;
}
function salesQuickOpen(o){return !salesIsQuote(o)&&!['done','closed','cancelled'].includes(o.status);}
function salesQuickTest(key,info){
 if(key==='all'||info.n)return key==='all';
 if(key==='invoice')return salesListValue(info,'invoice')==='Not invoiced';
 const o=info.o,today=salesListDay(new Date()),week=salesListPresetRange('thisWeek'),due=o.dueDate||'';
 if(!salesQuickOpen(o))return false;
 if(key==='today')return due===today;
 if(key==='week')return !!due&&due>=today&&due<=week[1];
 return !!o.onHold||(o.lines||[]).some(l=>l.onHold)||(!!due&&due<today);
}
function salesQuickSet(key){const p=salesListLoadPrefs();p.quick=SALES_QUICK_ALL.some(q=>q[0]===key)?key:'all';salesListSel=new Set();salesListSavePrefs();render();}
function salesQuickHTML(rows,anyDate,options){
 const cur=options&&options.cur||salesListLoadPrefs().quick||'all',test=options&&options.test||salesQuickTest,set=options&&options.set||'salesQuickSet',name=options&&options.name||(x=>x);
 return `<div class="sl-quick" role="tablist" aria-label="Quick views">${(options&&options.invoice?SALES_QUICK_ALL:SALES_QUICK).map(([k,label])=>{const n=(k==='all'?rows:anyDate).filter(r=>test(k,r)).length;if(k==='invoice'&&!n&&cur!=='invoice')return '';
  return `<button type="button" role="tab" class="sl-quick-pill${k===cur?' on':''}${k==='attention'&&n?' warn':''}" aria-selected="${k===cur}" data-quick="${k}" onclick="${set}('${k}')">${name(label)}${k==='all'||n?`<b>${n}</b>`:''}</button>`;}).join('')}</div>`;
}
/* В очереди флажок Glass — конкретное стекло из каталога, даже если оно
   встречается вместе с другими стёклами в Double/Triple или нескольких Makeup. */
function salesListTokens(info,k){
 if(info.tokens&&info.tokens[k])return info.tokens[k].length?info.tokens[k]:['(empty)'];
 if(k==='batch'){const v=salesOrderBatchNumbers(info.o);return v.length?v:['(empty)'];}
 if(k!=='glass')return [salesListText(info,k)];
 const used=new Set((info.o.lines||[]).map(l=>l.makeupId)),codes=[];
 (info.o.makeups||[]).filter(m=>used.has(m.id)).forEach(m=>(m.panes||[]).forEach(p=>{
  const panes=p.category==='laminated'?[p.laminated&&p.laminated.outer,p.laminated&&p.laminated.inner]:[p];
  panes.forEach(x=>{const g=glassProductById(x&&x.glassProductId);if(g)codes.push(glassShortName(g));});
 }));
 return codes.length?[...new Set(codes)]:['(empty)'];
}
function salesListValueOptions(k,infos){
 const p=salesListLoadPrefs(),col=salesListColumn(k),others=Object.keys(p.filters).filter(x=>x!==k&&salesListColumn(x)&&salesListFilterActive(p.filters[x])),counts=new Map();
 infos.filter(info=>others.every(x=>salesListFilterTest(salesListColumn(x),p.filters[x],info))).forEach(info=>{
  (col.tokens?salesListTokens(info,k):[salesListText(info,k)]).forEach(t=>counts.set(t,(counts.get(t)||0)+1));
 });
 return [...counts.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(text=>({text,n:counts.get(text)}));
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
 if(f.preset)parts.push(((col.presets||SALES_LIST_PRESETS).find(x=>x[0]===f.preset)||['',''])[1]);
 if(Array.isArray(f.values))parts.push(f.values.length?f.values.length<=3?f.values.join(', '):f.values.length+' values':'nothing');
 const conds=(f.conds||[]).filter(salesListCondReady).map((c,i)=>(i?(c.join==='or'?' or ':' and '):'')+opText[c.op]+(c.op==='empty'||c.op==='notEmpty'?'':' '+(c.op==='between'&&String(c.v2).trim()!==''?fmt(c.v)+' – '+fmt(c.v2):fmt(c.v))));
 if(conds.length)parts.push(conds.join(''));
 return (f.mode==='exclude'?'Not · ':'')+col.label+': '+parts.join(' · ');
}
function salesListFilterChips(){
 const p=salesListLoadPrefs(),dateCol=salesListDateColumn(),keys=Object.keys(p.filters).filter(k=>salesListColumn(k)&&salesListFilterActive(p.filters[k])&&k!==dateCol);
 if(!keys.length)return '';
 return `<div class="sl-chips"><span class="sl-chips-label">Filters</span>${keys.map(k=>`<span class="sl-chip" data-filter-chip="${k}">${esc(salesListFilterSummary(salesListColumn(k),p.filters[k]))}<button type="button" aria-label="Remove filter" onclick="salesListClearFilter('${k}')">×</button></span>`).join('')}<button type="button" class="sl-clear" data-clear-filters onclick="salesListClearAll()">Clear filters</button></div>`;
}

/* ------------------------------ Экран ---------------------------------- */
function salesListNum(v,digits){return v==null||v===''?'<span class="mut">—</span>':Number(v).toLocaleString('en-US',{minimumFractionDigits:digits||0,maximumFractionDigits:digits||0});}
/* Вес (вариант 1 владельца, 30.10.2026): число всегда, неполный — метка
   Partial, в подсказке чего нет и где внести; нет ничего — «—», не 0.
   «Наверное лучше первый, так как он акцентирует внимание офиса на том, что
   нет информации». Ушедший в архив до 30.10 — только число (полный вес). */
function salesListWeightCell(v,w){
 if(v==null)return '<td class="n" title="Weight unavailable"><span class="mut">—</span></td>';
 if(!w||w.complete)return `<td class="n"${w&&w.estimated?' title="Nominal glass thickness"':''}>${w&&w.estimated?'≈ ':''}${esc(salesKgText(v))}</td>`;
 return `<td class="n" title="${esc(salesWeightTip(w))}" data-weight-partial>${esc(salesKgText(v))}<span class="pill warn sl-partial">Partial</span></td>`;
}
function salesListCell(info,col){
 if(info.n)return ncrListCell(info,col);
 const o=info.o,q=info.q,v=salesListValue(info,col.k);
 switch(col.k){
  case 'type':return `<td><span class="pill ${q?'kind-quote':'kind-order'}">${q?'Quote':'Order'}</span></td>`;
  case 'number':{const from=!q&&o.fromQuoteId?salesListValue(info,'fromQuote'):'';return `<td><b class="mono">${raw(v||'Auto Number')}</b>${from?` <span class="mut small">from ${raw(from)}</span>`:''}</td>`;}
  case 'customer':return `<td><b>${raw(v||'—')}</b></td>`;
  case 'created':case 'due':case 'validUntil':case 'updated':case 'billed':case 'payDue':return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
  case 'status':return `<td>${q?salesQuoteGroupPill(o):salesStatusPill(o)}${!q&&o.onHold?' <span class="pill hold">On Hold</span>':''}</td>`;
  case 'invoice':return `<td>${salesInvoicePill(o,v)}</td>`;
  case 'glass':case 'orderItems':return `<td><span class="sl-glass" title="${esc(v)}">${raw(v||'—')}</span></td>`;
  case 'weight':return salesListWeightCell(v,info.memo.weightInfo);
  case 'daysLate':return `<td class="n">${v?`<b class="fin-due">${v} d</b>`:'<span class="mut">—</span>'}</td>`;
  case 'units':case 'pcs':case 'lines':case 'shapes':case 'revisions':return `<td class="n">${salesListNum(v)}</td>`;
  case 'area':return `<td class="n">${salesListNum(v,1)}</td>`;
  case 'total':return `<td class="n${!q&&finOrderCounts(o)?'':' mut'}">${finFmt(v)}</td>`;
  case 'receipts':return `<td class="n">${v==null?'<span class="mut">—</span>':finFmt(v)}</td>`;
  case 'balance':{
   if(v==null&&!info.memo.balanceInfo)return '<td class="n"><span class="mut">—</span></td>';
   const b=info.memo.balanceInfo;
   return `<td class="n">${b.status==='review'?'<span class="pill warn">Review required</span>':b.status==='due'?`<span class="pill bad">${finFmt(b.balance)}</span>`:b.status==='paid'?'<span class="pill good">Paid</span>':b.status==='overpaid'?`<span class="pill info">Overpaid ${finFmt(-b.balance)}</span>`:finFmt(b.balance)}</td>`;
  }
  default:return `<td>${v==null||v===''?'<span class="mut">—</span>':raw(String(v))}</td>`;
 }
}
function salesListFooter(rows,cols){
 const orders=rows.filter(r=>!r.q&&!r.n),quotes=rows.filter(r=>r.q),ncrs=rows.filter(r=>r.n);
 const tally=(list,fn)=>{const m={};list.forEach(r=>{const s=fn(r);m[s]=(m[s]||0)+1;});return Object.keys(m).map(k=>k+' '+m[k]).join(' · ');};
 const detail=[tally(orders,r=>r.a?salesListValue(r,'status'):salesStatusLabel(r.o)),quotes.length?'Quotes: '+tally(quotes,r=>salesStatusLabel(r.o,salesListStatus(r.o))):'',ncrs.length?'NCR: '+tally(ncrs,r=>r.memo.status):''].filter(Boolean).join(' · ');
 /* В очередях (Optimization, Shipping) квот не бывает — квоты считают и
    мешают в Sales (владелец, 7.10.2026): только «N orders». */
 const queue=salesListScope()!=='sales';
 const head=`<b>${queue?orders.length+' order'+(orders.length===1?'':'s'):rows.length+' row'+(rows.length===1?'':'s')+' · Orders '+orders.length+' · Quotes '+quotes.length+(salesShow.ncr?' · NCR '+ncrs.length:'')}</b>${detail?`<small>${esc(detail)}</small>`:''}`;
 const first=cols.findIndex(c=>salesListCalc(c)!=='none'),lead=first<0?cols.length:first;
 const sums=cols.slice(lead).map(c=>salesListCalcCell(c,rows)).join('');
 /* Sales: «Rows» над числом; разбивка по видам и статусам — в подсказке. */
 if(!queue)return `<tfoot><tr class="sl-foot"><td class="sl-check"></td>${lead?`<td colspan="${lead}" class="sl-calc sl-foot-head" data-foot-count title="${esc(rows.length+' row'+(rows.length===1?'':'s')+' · Orders '+orders.length+' · Quotes '+quotes.length+(salesShow.ncr?' · NCR '+ncrs.length:'')+(detail?' · '+detail:''))}"><small>Rows</small><b>${rows.length.toLocaleString('en-US')}</b></td>`:''}${sums}<td></td></tr></tfoot>`;
 return `<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head" data-foot-count>${head}</td>${sums}<td></td></tr></tfoot>`;
}
/* Что считать под колонкой: выбранное в меню, иначе Sum у числовых с итогом. */
function salesListCalcOptions(col){return col.type==='number'?SALES_LIST_CALC_NUMBER:SALES_LIST_CALC_TEXT;}
function salesListCalc(col){const v=salesListLoadPrefs().calc[col.k];return salesListCalcOptions(col).some(x=>x[0]===v)?v:col.sum?'sum':'none';}
function salesListSetCalc(k,v){const p=salesListLoadPrefs();p.calc[k]=v;salesListSavePrefs();render();}
function salesListCalcHere(){return ['sales','optimization','shipping','shippingPS'].includes(salesListScope());}
function salesListCalcCell(c,rows){
 const kind=salesListCalc(c);if(kind==='none')return '<td></td>';
 const vals=rows.map(r=>salesListValue(r,c.k)).filter(v=>v!=null&&v!==''),nums=vals.map(Number),total=nums.reduce((s,v)=>s+v,0);
 const whole=n=>n.toLocaleString('en-US'),cell=html=>`<td class="sl-calc${c.type==='number'?' n':''}"><small>${(salesListCalcOptions(c).find(x=>x[0]===kind)||[])[1]}</small><span data-sum="${c.k}">${html}</span></td>`;
 if(kind==='count')return cell(whole(vals.length));
 if(kind==='unique')return cell(whole(new Set(vals.map(String)).size));
 /* Вес: сумма известного; хоть один заказ неполный или без веса — Partial;
    ничего не известно — «—», а не 0. NCR веса не имеют. */
 if(c.k==='weight'&&kind==='sum'){const own=rows.filter(r=>!r.n),part=own.filter(r=>{const w=r.memo.weightInfo;return salesListValue(r,'weight')==null||!!w&&!w.complete;}).length;
  return cell(`<span${part?` title="${part} order${part===1?'':'s'} without full weight"`:''}>${vals.length?esc(salesKgText(total))+(part?'<span class="pill warn sl-partial">Partial</span>':''):'<span class="mut">—</span>'}</span>`);}
 if(kind!=='sum'&&!vals.length)return cell('<span class="mut">—</span>');
 const x=kind==='sum'?total:kind==='avg'?total/vals.length:kind==='min'?Math.min(...nums):Math.max(...nums);
 const digits=Math.max(c.digits||0,kind==='avg'?1:0);
 return cell(c.money?finFmt(finMoney(x)):c.k==='weight'?esc(salesKgText(x)):x.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}));
}
/* Галочка строки без заказа в базе: NCR и архив открываются той же кнопкой Open. */
function salesListSideCheck(id,label){return `<td class="sl-check"><input type="checkbox" data-row-check ${salesListSel.has(id)?'checked':''} aria-label="Select ${esc(label)}" onclick="salesListToggleRow(event,'${esc(id)}')"></td>`;}
let salesListRowsNow=[];
function salesListOpenSelected(){
 const id=[...salesListSel][0],r=salesListRowsNow.find(x=>x.o.id===id);if(!r||salesListSel.size!==1)return;
 if(r.n)ncrView(r.n.id);else if(r.a)archiveOpen(r.o.id);else motionSheet(()=>salesOrderEdit(id));
}
function salesListSelectedOrders(){return [...salesListSel].filter(id=>{const o=(DB.salesOrder||[]).find(x=>x.id===id);return !!o&&!salesIsQuote(o);});}
function salesListView(){
 const box=document.querySelector('#app .sl-wide');salesListScrollKeep=box?{x:box.scrollLeft,y:box.scrollTop}:null;salesListStepNow=salesListStep();
 const p=salesListLoadPrefs(),{all,infos,pool}=salesListBase(),own=salesListScope()==='sales',source=own?pool:infos,filtered=salesListRows(source),quick=own?p.quick||'all':'all',anyDate=quick==='all'&&!own?filtered:salesListRows(source,['created']),shown=quick==='all'?filtered:anyDate.filter(r=>salesQuickTest(quick,r)),rows=own&&salesStatusFilter?shown.filter(r=>salesListStatusKey(r)===salesStatusFilter):shown,cols=salesListColumns();
 salesListSel=new Set([...salesListSel].filter(id=>rows.some(r=>r.o.id===id)));
 const selOrders=salesListSelectedOrders(),allHeld=selOrders.length>0&&selOrders.every(id=>(DB.salesOrder.find(o=>o.id===id)||{}).onHold);
 const holdBtn=`<button type="button" class="sl-quiet sl-hold-quiet" data-hold-button ${selOrders.length?'':'disabled'} onclick="salesListHoldSelected()">${allHeld?'Release':'On Hold'}${selOrders.length?' ('+selOrders.length+')':''}</button>`;
 /* Open и Delete над таблицей, у отмеченной строки (владелец, 2.11.2026). */
 const only=salesListSel.size===1?[...salesListSel][0]:'',onlyRow=only?rows.find(r=>r.o.id===only):null;
 const openBtn=`<button type="button" class="sl-quiet" data-open-button ${onlyRow?'':'disabled'} onclick="salesListOpenSelected()">Open</button>`;
 const deleteBtn=`<button type="button" class="sl-quiet sl-delete-quiet" data-delete-button ${onlyRow&&!onlyRow.n&&!onlyRow.a?'':'disabled'} onclick="salesOrderDelete('${esc(only)}')">Delete</button>`;
 const stickerOrder=selOrders.length===1&&typeof stkCanPrintOrder==='function'&&stkCanPrintOrder(salesRecord(selOrders[0]))?selOrders[0]:'';
 const stickersBtn=`<button type="button" class="sl-quiet" data-stickers-button ${stickerOrder?'':'disabled'} onclick="stkOpenForOrder('${esc(stickerOrder)}')">Stickers</button>`;
 /* Cut preview: раскрой отмеченных заказов и квот вместе — только просмотр
    (views/sales-cut-estimate). */
 const estN=typeof salesCutEstimateIds==='function'?salesCutEstimateIds().length:0;
 const estBtn=typeof salesCutEstimateOpen==='function'?`<button type="button" class="sl-quiet sl-est-btn" data-cut-est-open title="Cut preview${estN?' · '+estN+' selected':': select orders or quotes'}" aria-label="Cut preview" ${estN?'':'disabled'} onclick="salesCutEstimateOpen(salesCutEstimateIds())">${ico('cut')}${estN?`<b>${estN}</b>`:''}</button>`:'';
 const rowIds=rows.filter(r=>!r.n&&!r.a).map(r=>r.o.id),allSel=rowIds.length>0&&rowIds.every(id=>salesListSel.has(id));
 /* Ширина и порядок за заголовок — только у списка Sales (views/col-widths). */
 const cw=salesListScope()==='sales',keys=cols.map(c=>c.k);
 const th=c=>{const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}"${cw?` data-cw-key="${c.k}"`:''}><span class="sl-th"><span data-cw-label>${c.label}</span><button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cw?cwGrip():''}</th>`;};
 salesListIds=rowIds;salesListRowsNow=rows;
 const body=listWindowBody(rows,r=>{
  if(r.n)return ncrListRow(r,cols);
  if(r.a)return archiveListRow(r,cols);
  const o=r.o,sel=salesListSel.has(o.id),cls=[salesIsDraft(o)?'sl-row-draft':'',!r.q&&o.onHold?'sl-row-hold':'',!r.q&&o.status==='batched'?'sl-row-work':'',!r.q&&o.status==='done'?'sl-row-done':'',!r.q&&o.status==='closed'?'sl-row-closed':'',sel?'sl-row-sel':''].filter(Boolean).join(' ');
  return `<tr data-order-row="${esc(o.id)}"${cls?` class="${cls}"`:''} oncontextmenu="salesListContext(event,'${esc(o.id)}')"><td class="sl-check"><input type="checkbox" data-row-check ${sel?'checked':''} aria-label="Select ${esc(salesListValue(r,'number'))}" onclick="salesListToggleRow(event,'${esc(o.id)}')"></td>${cols.map(c=>salesListCell(r,c)).join('')}<td></td></tr>`;
 },cols.length+2);
 const empty=`<tr><td colspan="${cols.length+2}" class="empty">${all.length?'Nothing matches the filters.':'No Sales Orders yet'}</td></tr>`;
 const wide=window.innerWidth>=1600,dateBtn=salesListDateButton(),chips=salesStatusChips(shown);salesListChipsNow=chips;
 return `<div class="card sales-list-card sl-foot-pin"><div class="sales-toolbar">${salesListShowButton()}${openBtn}${deleteBtn}${holdBtn}${stickersBtn}${estBtn}<span class="sales-toolbar-sp"></span>${wide?'':dateBtn}<button onclick="salesOrderNew('quote')">+ New Quote</button><button class="pri" onclick="salesOrderNew('order')">+ New Sales Order</button></div><div class="sl-filter-row">${salesQuickHTML(filtered,anyDate,{cur:salesStatusFilter?'-':quick,set:'salesQuickPick',name:salesListShortLabel,invoice:true})}${salesListStatusPills(chips)}${wide?`<span class="sales-toolbar-sp"></span>${dateBtn}`:''}</div>${salesListStatusRow(chips)}${salesListFilterChips()}<div class="sales-table-wrap"><table class="sl-table${cw?cwTableClass('sales'):''}"${cw?cwTableAttrs('sales',keys):''}>${cw?cwColgroup('sales',keys):''}<thead><tr><th class="sl-check"><span class="sl-header-tools"><input type="checkbox" data-select-all ${allSel?'checked':''} aria-label="Select all rows" onclick="salesListToggleAll(this.checked)"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button></span></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||empty}</tbody>${rows.length?salesListFooter(rows,cols):''}</table></div>${salesListMenuHTML(infos)}${salesHoldDialogHTML()}${typeof ncrModalHTML==='function'?ncrModalHTML():''}${typeof stkDialogHTML==='function'?stkDialogHTML():''}</div>`;
}

/* ------------------------------ Меню ----------------------------------- */
function salesListCloseMenu(){salesListMenu=null;render();}
function salesListAt(e,w){const r=e&&e.currentTarget&&e.currentTarget.getBoundingClientRect?e.currentTarget.getBoundingClientRect():null;return {x:r?r.left:(e&&e.clientX)||40,y:r?r.bottom+6:(e&&e.clientY)||40,w};}
function salesListOpenFilter(e,k){
 if(e)e.stopPropagation();
 const col=salesListColumn(k);if(!col)return;
 const p=salesListLoadPrefs(),draft=JSON.parse(JSON.stringify(p.filters[k]||salesListEmptyFilter(col)));
 if(col.type!=='list'&&!draft.conds.length)draft.conds.push({op:salesListDefaultOp(col),v:'',v2:'',join:'and'});
 salesListMenu=Object.assign({kind:'filter',scope:salesListScope(),col:k,draft,search:''},salesListAt(e,340));
 render();
}
function salesListOpenColumns(e){if(e)e.stopPropagation();salesListMenu=Object.assign({kind:'columns',scope:salesListScope()},salesListAt(e,300));render();}
function salesListContext(e,id){
 if(e){e.preventDefault();e.stopPropagation();}
 if(!salesListSel.has(id))salesListSel=new Set([id]);
 salesListMenu={kind:'context',id,x:(e&&e.clientX)||40,y:(e&&e.clientY)||40,w:220};
 render();
}
function salesListMenuHTML(infos){
 const m=salesListMenu;if(!m||(m.scope&&m.scope!==salesListScope()))return '';
 const top=Math.max(8,Math.min(m.y,window.innerHeight-80)),style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-(m.w||300)-8))}px;top:${top}px;max-height:${Math.max(180,window.innerHeight-top-12)}px`;
 const back='<div class="sl-backdrop" onclick="salesListCloseMenu()" oncontextmenu="event.preventDefault();salesListCloseMenu()"></div>';
 if(m.kind==='pur-sections')return back+purSectionsMenuHTML(style);
 if(m.kind==='show')return back+salesListShowMenuHTML(style);
 if(m.kind==='status')return back+salesListStatusMenuHTML(style);
 if(m.kind==='date')return back+salesListDateMenuHTML(m,style);
 if(m.kind==='context')return back+salesListContextHTML(m,style);
 if(m.kind==='oq-context')return back+optimizationContextHTML(m,style);
 if(m.kind==='fin-context'&&typeof finListContextHTML==='function')return back+finListContextHTML(m,style);
 if(m.kind==='columns')return back+salesListColumnsHTML(style);
 if(m.kind==='filter')return back+salesListFilterHTML(m,infos,style);
 return '';
}
function salesListFilterHTML(m,infos,style){
 const col=salesListColumn(m.col);if(!col)return '';
 const d=m.draft,p=salesListLoadPrefs(),sort=p.sort||salesListDefaultSort();
 const labels=col.type==='number'?['↑ Smallest first','↓ Largest first']:col.type==='date'?['↑ Oldest first','↓ Newest first']:['↑ A → Z','↓ Z → A'];
 let html=`<div class="sl-menu" style="${style}" role="dialog" aria-label="Filter ${esc(col.label)}" data-filter-menu="${col.k}"><h5>Sort</h5><div class="sl-row"><button type="button" class="sl-btn${sort.k===col.k&&sort.dir==='asc'?' on':''}" data-sort="asc" onclick="salesListSort('${col.k}','asc')">${labels[0]}</button><button type="button" class="sl-btn${sort.k===col.k&&sort.dir==='desc'?' on':''}" data-sort="desc" onclick="salesListSort('${col.k}','desc')">${labels[1]}</button><button type="button" class="sl-btn sl-freeze${p.frozen.includes(col.k)?' on':''}" data-freeze="${col.k}" aria-pressed="${p.frozen.includes(col.k)}" title="${p.frozen.includes(col.k)?'Unfreeze':'Freeze'}" aria-label="${p.frozen.includes(col.k)?'Unfreeze':'Freeze'} ${esc(col.label)}" onclick="salesListFreeze('${col.k}')">${ico('freeze')}</button></div>`;
 if(salesListCalcHere()){const on=salesListCalc(col);html+=`<h5>Show at bottom</h5><div class="sl-calc-pick">${salesListCalcOptions(col).map(x=>`<button type="button" class="sl-btn${on===x[0]?' on':''}" data-calc="${x[0]}" onclick="salesListSetCalc('${col.k}','${x[0]}')">${x[1]}</button>`).join('')}</div>`;}
 if(col.type==='date')html+=`<h5>Date</h5><div class="sl-presets">${(col.presets||SALES_LIST_PRESETS).map(x=>`<button type="button" class="sl-btn${d.preset===x[0]?' on':''}" data-preset="${x[0]}" onclick="salesListDraft('preset','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
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
  const opts=salesListValueOptions(col.k,infos),q=String(m.search||'').toLowerCase(),shown=opts.filter(x=>!q||x.text.toLowerCase().includes(q)||col.k==='glass'&&((glassNameOwner(x.text,'')||{}).code||'').toLowerCase().includes(q));
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
 const rows=p.cols.map((c,i)=>{const col=salesListColumn(c.k);return `<div class="sl-cols-row" draggable="true" data-col-row="${c.k}" ondragstart="salesListDragKey='${c.k}'" ondragover="event.preventDefault()" ondrop="event.preventDefault();salesListDropColumn('${c.k}')"><span class="h" aria-hidden="true">⋮⋮</span><label><input type="checkbox" data-col-toggle="${c.k}" ${c.on&&!salesListAutoHidden(c.k)?'checked':''} onchange="salesListSetColumn('${c.k}',this.checked)"> ${esc(col.label)}</label><button type="button" class="sm" aria-label="Move ${esc(col.label)} up" ${i===0?'disabled':''} onclick="salesListMoveColumn('${c.k}',-1)">↑</button><button type="button" class="sm" aria-label="Move ${esc(col.label)} down" ${i===p.cols.length-1?'disabled':''} onclick="salesListMoveColumn('${c.k}',1)">↓</button></div>`;}).join('');
 return `<div class="sl-menu sl-cols" style="${style}" role="dialog" aria-label="Columns"><h5>Columns · drag to reorder</h5>${rows}<div class="sl-actions"><button type="button" class="sl-btn" data-standard-view onclick="salesListStandardView()">Standard view</button>${salesListCwId()?`<button type="button" class="sl-btn" data-reset-widths ${cwFixed(salesListCwId())?'':'disabled'} onclick="salesListResetWidths()">Reset widths</button>`:''}</div></div>`;
}
/* Шестерёнка на узком экране: включённая колонка видна всегда (прокрутка вбок),
   снятая снова прячется только здесь, а на широком экране остаётся. */
function salesListSetColumn(k,on){
 const p=salesListLoadPrefs(),c=p.cols.find(x=>x.k===k);if(!c)return;
 const rule=salesListNarrowRule(k);p.pinned=p.pinned.filter(x=>x!==k);
 if(!rule)c.on=!!on;else if(on){c.on=true;p.pinned.push(k);}
 salesListSavePrefs();render();
}
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
function salesListStandardView(){const p=salesListLoadPrefs();p.cols=salesListCatalog().map(c=>({k:c.k,on:!!c.def}));p.pinned=[];p.frozen=[];delete p.widths;salesListSavePrefs();render();}
/* Reset widths — только ширины этой таблицы: порядок, видимость, фильтры и выбор строк на месте. */
function salesListResetWidths(){delete salesListLoadPrefs().widths;salesListSavePrefs();render();}
/* Перенос колонки за заголовок — тот же порядок, что в меню Columns. */
function salesListMoveColumnTo(from,to,after){
 const cols=salesListLoadPrefs().cols,a=cols.findIndex(c=>c.k===from);if(a<0||from===to)return;
 const [c]=cols.splice(a,1),b=cols.findIndex(x=>x.k===to);if(b<0){cols.splice(a,0,c);return;}
 cols.splice(after?b+1:b,0,c);salesListSavePrefs();render();
}
const SALES_LIST_WIDTH={type:76,number:96,customer:110,po:88,created:92,due:84,status:140,priority:84,glass:150,orderItems:160,batch:110,unitType:96,readyQty:80,units:76,area:92,total:100,receipts:100,balance:100,invoice:126};
cwRegister('sales',{
 widths:()=>salesListLoadPrefs().widths||{},
 save:w=>{const p=salesListLoadPrefs();if(Object.keys(w).length)p.widths=w;else delete p.widths;salesListSavePrefs();},
 def:k=>{const c=salesListColumn(k);return SALES_LIST_WIDTH[k]||(c&&c.money?110:c&&c.type==='number'?84:c&&c.type==='text'?160:100);},
 min:()=>CW_MIN,move:salesListMoveColumnTo,lead:[68],trail:20,fill:'customer'
});
/* Список PS (Shipping → Shipments): те же жесты, свои ширины; справа кнопка Print. */
const SHIPPING_LIST_WIDTH={number:116,customer:110,date:84,method:94,skids:110,units:76,area:80,kg:90,glass:150,balance:100,status:180};
cwRegister('shipments',{
 widths:()=>salesListLoadPrefs().widths||{},
 save:w=>{const p=salesListLoadPrefs();if(Object.keys(w).length)p.widths=w;else delete p.widths;salesListSavePrefs();},
 def:k=>SHIPPING_LIST_WIDTH[k]||100,
 min:()=>CW_MIN,move:salesListMoveColumnTo,lead:[40],trail:70,fill:'customer'
});

/* Остальные списки с шапкой Sales: очередь заказов, батчи, стекло, листы, Production
   (этап 6 плана): те же жесты, ширины и порядок — в настройках своего списка. */
/* lead — ширина служебной колонки слева (галочка, шестерёнка): без неё <colgroup>
   отдаёт ширины колонок соседям, и ячейки съезжают с заголовков (Backorders, 04.11.2026). */
[['optimization','customer',68],['shipping','customer',68],['shippingAwaiting','customer',68],['shippingDone','customer',68],['glassQueue','customer',68],['glassBatches','glass',68],['glassContents','customer',68],['glassSheets','glass',68],['glassStock','glass',68],['prodOrders','customer',0],['shippingSkids','customer',68],['shippingBackorders','customer',68],['shippingDelivery','customer',68]].forEach(([id,fill,lead])=>cwRegister(id,{
 widths:()=>salesListLoadPrefs().widths||{},
 save:w=>{const p=salesListLoadPrefs();if(Object.keys(w).length)p.widths=w;else delete p.widths;salesListSavePrefs();},
 def:k=>{const c=salesListColumn(k);return SALES_LIST_WIDTH[k]||(c&&c.station?64:c&&c.money?110:c&&c.type==='number'?84:c&&c.type==='text'?160:100);},
 min:()=>CW_MIN,move:salesListMoveColumnTo,lead:lead?[lead]:[],trail:20,fill
}));

/* Заголовок колонки любого списка: фильтр и сортировка, ширина и перенос. */
function salesListHead(c){const f=salesListLoadPrefs().filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}" data-cw-key="${c.k}"><span class="sl-th"><span data-cw-label>${esc(c.label)}</span><button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cwGrip()}</th>`;}
/* Ширина и порядок за заголовок для списка этого экрана: адаптер по scope
   регистрируется при первом показе (lead — служебные колонки слева, trail —
   кнопки справа, px). Возвращает класс, атрибуты и <colgroup> таблицы. */
function salesListCwTable(keys,lead,trail,defs){
 const id=salesListScope();
 if(!CW_TABLES[id])cwRegister(id,{widths:()=>salesListLoadPrefs().widths||{},
  save:w=>{const p=salesListLoadPrefs();if(Object.keys(w).length)p.widths=w;else delete p.widths;salesListSavePrefs();},
  def:k=>{const c=salesListColumn(k);return (defs&&defs[k])||SALES_LIST_WIDTH[k]||(c&&c.money?110:c&&c.type==='number'?84:c&&c.type==='text'?160:100);},
  min:()=>CW_MIN,move:salesListMoveColumnTo,lead:lead||[],trail:trail||0,
  /* Остаток ширины — Customer, Glass, Item, Name, Supplier или первая текстовая колонка: у каждой таблицы своя «резина». */
  fill:['customer','glass','item','name','supplierName','description'].find(k=>keys.includes(k))||keys.find(k=>{const c=salesListColumn(k);return c&&c.type==='text';})||''});
 return {cls:cwTableClass(id),attrs:cwTableAttrs(id,keys),col:cwColgroup(id,keys)};
}
/* Таблица списка вида Sales для вкладок со своими строками (Skids, Backorders,
   Delivery): шестерёнка Columns, фильтр и сортировка в заголовке, ширина и
   порядок перетаскиванием, итог внизу. o: {infos, rows, cell(info,col,prev),
   row(info,i) — атрибуты и первая клетка строки, noun, empty}. */
function salesListTableHTML(o){
 const p=salesListLoadPrefs(),cols=salesListColumns(),keys=cols.map(c=>c.k),cwId=salesListCwId(),rows=o.rows;
 const th=c=>{const f=p.filters[c.k],on=!!f&&salesListFilterActive(f);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}" data-cw-key="${c.k}"><span class="sl-th"><span data-cw-label>${c.label}</span><button type="button" class="sl-fbtn${on?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${c.label}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span>${cwGrip()}</th>`;};
 const body=rows.map((i,k)=>{const r=o.row(i,k);return `<tr${r.attrs||''}>${r.first||'<td class="sl-check"></td>'}${cols.map(c=>o.cell(i,c,rows[k-1])).join('')}${r.last!=null?`<td class="sl-row-acts">${r.last}</td>`:'<td></td>'}</tr>${r.after?r.after(cols.length+2):''}`;}).join('');
 const lead=Math.max(0,cols.findIndex(c=>salesListCalc(c)!=='none')),foot=rows.length?`<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head"><b>${o.noun(rows)}</b></td>${cols.slice(lead).map(c=>salesListCalcCell(c,rows)).join('')}<td></td></tr></tfoot>`:'';
 return `${salesListFilterChips()}<div class="sales-table-wrap"><table class="sl-table${o.cls?' '+o.cls:''}${cwTableClass(cwId)}"${cwTableAttrs(cwId,keys)}>${cwColgroup(cwId,keys)}<thead><tr><th class="sl-check"><span class="sl-header-tools"><button type="button" class="sl-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button>${o.firstTh||''}</span></th>${cols.map(th).join('')}<th></th></tr></thead><tbody>${body||`<tr><td colspan="${cols.length+2}" class="empty">${o.empty}</td></tr>`}${o.tail?o.tail(cols):''}</tbody>${foot}</table></div>${salesListMenuHTML(o.infos)}`;
}

/* ------------------------------ Выбор строк ---------------------------- */
/* Все заказы списка по порядку: в странице может быть только их начало. */
let salesListIds=[];
function salesListToggleRow(e,id){
 if(e)e.stopPropagation();
 const ids=salesListIds,on=!salesListSel.has(id);
 if(e&&e.shiftKey&&salesListAnchor&&ids.includes(salesListAnchor)&&ids.includes(id)){
  const a=ids.indexOf(salesListAnchor),b=ids.indexOf(id);
  ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>{if(on)salesListSel.add(x);else salesListSel.delete(x);});
 }else if(on)salesListSel.add(id);else salesListSel.delete(id);
 salesListAnchor=id;render();
}
function salesListToggleAll(on){
 salesListIds.forEach(id=>{if(on)salesListSel.add(id);else salesListSel.delete(id);});render();
}
function salesListContextHTML(m,style){
 const o=(DB.salesOrder||[]).find(x=>x.id===m.id);if(!o)return '';
 const q=salesIsQuote(o),ids=salesListSelectedOrders(),many=ids.length>1&&ids.includes(o.id);
 const item=(act,label,cls)=>`<button type="button" role="menuitem" class="${cls||''}" data-menu="${act}" onclick="salesListMenuRun('${act}')">${label}</button>`;
 const hold=q?'':o.onHold?item('release',many?'Release · '+ids.length+' orders':'Release'):item('hold',many?'⛔ On Hold… · '+ids.length+' orders':'⛔ On Hold…');
 return `<div class="sl-ctx" style="${style}" role="menu">${item('open','Open')}${item('copy','Copy')}${typeof orderLogOpen==='function'?item('log','Activity log'):''}${typeof skipAllowed==='function'&&!many&&skipAllowed()&&skipCanOpen(o)?item('skip','Skip…'):''}${hold}<hr>${item('documents','Documents')}${item('drawings','Drawings')}${typeof salesCutEstimateOpen==='function'&&cutEstUsable(o)?item('cutpreview',salesCutEstimateIds().length>1?'Cut preview · '+salesCutEstimateIds().length+' selected':'Cut preview'):''}${!q&&o.status!=='cancelled'?item('stickers','Print stickers…'):''}${!q&&typeof productionUnbatchAllowed==='function'&&productionUnbatchAllowed()&&productionUnbatchCanOpen(o)?item('unbatch','Unbatch order…'):''}${!q&&o.status!=='cancelled'&&o.status!=='closed'?item('cancel','Cancel order'):''}${!q&&o.status==='cancelled'?item('restore','Restore as New'):''}<hr>${item('delete','Delete','dl')}</div>`;
}
function salesListMenuRun(act){
 const m=salesListMenu;salesListMenu=null;
 const o=m&&(DB.salesOrder||[]).find(x=>x.id===m.id);if(!o){render();return;}
 const sel=salesListSelectedOrders(),ids=sel.includes(o.id)?sel:[o.id],held=id=>!!(DB.salesOrder.find(x=>x.id===id)||{}).onHold;
 if(act==='open')salesOrderEdit(o.id);
 /* Copy — только заказ этой строки, даже при нескольких отмеченных. */
 else if(act==='copy')salesCopyOrder(o.id);
 else if(act==='log')orderLogOpen(o.id);
 else if(act==='skip')skipOpen(o.id);
 else if(act==='hold')salesHoldOpen(ids.filter(id=>!held(id)));
 else if(act==='release')salesReleaseHold(ids.filter(held));
 else if(act==='documents'){salesOrderEdit(o.id);docOpen();}
 else if(act==='drawings'){salesOrderEdit(o.id);docOpen('drawings');}
 else if(act==='cutpreview')salesCutEstimateOpen(salesListSel.has(o.id)?salesCutEstimateIds():[o.id]);
 else if(act==='unbatch')productionUnbatchOpen(o.id);
 else if(act==='stickers')stkOpenForOrder(o.id);
 else if(act==='cancel')salesCancelOrder(o.id);
 else if(act==='restore')salesRestoreOrder(o.id);
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
 if(!orders.length){alert('Select orders first.');return;}
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
function salesHoldBlocked(orderId){
 const o=orderId?salesRecord(orderId):soDraft;if(!o)return;
 salesDialogOpen({title:'Order '+(o.businessNumber||'')+' is On Hold',sub:o.holdReason||'',rows:[],note:'Release the hold first.',
  buttons:[{label:'Back'},{label:'Release hold',kind:'pri',run:()=>salesReleaseHold([o.id])}]});
}
