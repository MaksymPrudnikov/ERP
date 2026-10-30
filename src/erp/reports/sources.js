/* =====================================================================
   reports/sources  ·  sources-1.0
   Источники конструктора отчётов: что можно считать и по чему делить.
   IN : факты reports/facts, reports/facts-office
   OUT: REP_SRC — источник: строки, поля (измерения, даты, числа), метрики

   Владелец, 9 октября 2026: отчёты «как в Looker», источники — по участкам
   и логике цеха, у каждого свои метрики: «не к каждой станции применяется
   линейный инч, а только к полировке»; закалка — стёкла, мм, ft²; выдача на
   Shipping — кто сколько стёкол и юнитов выдал; доставка — рейсы и км;
   резка — «сколько порезали за прошлый год». Источники — «все и даже то,
   что ты считаешь»: сверх названного — заказанное стекло, листы, время у
   станции.

   Поле: {k, label, type: 'dim' (значения списком) | 'text' | 'date' | 'num',
   get(row) — значение, если оно не лежит в row[k]}. Метрика: {k, label,
   agg: 'count' | 'sum' | 'distinct' | 'ratio', f — поле, num/den — для
   доли, pct — в процентах, digits, money}. Любое числовое поле можно взять
   ещё средним, минимумом и максимумом (reports/query).
   ===================================================================== */
/* Клиент — по имени. Одно имя у двух клиентов — к имени код клиента, иначе
   отчёт сложил бы их строкой (аудит 25.10.2026, R-5). Имена считаются раз
   до следующей записи (storageInvalidate). */
let repCustomerNames=null;
function repCustomer(id){
 if(!id)return '—';const name=salesCustomerDisplay(id)||'—';
 if(!repCustomerNames){repCustomerNames=new Map();(DB.customer||[]).forEach(x=>{const n=salesCustomerDisplay(x.id);repCustomerNames.set(n,(repCustomerNames.get(n)||0)+1);});}
 if((repCustomerNames.get(name)||0)<2)return name;
 const c=(DB.customer||[]).find(x=>x.id===id);return c?name+' · '+(c.code||c.id):name;
}
function repMmText(mm){return mm?String(+mm)+' mm':'—';}
const REP_F={
 date:(k,label)=>({k,label,type:'date'}),
 dim:(k,label,get)=>({k,label,type:'dim',get}),
 text:(k,label,get)=>({k,label,type:'text',get}),
 num:(k,label,opts)=>Object.assign({k,label,type:'num'},opts||{})
};
/* Поля заказа и строки — во всех источниках, где есть заказ. */
function repOrderFields(){
 return [REP_F.text('po','PO',r=>r.po||'—'),REP_F.dim('rep','Sales rep',r=>r.rep||'—'),REP_F.dim('city','City',r=>r.city||'—'),REP_F.dim('province','Province',r=>r.province||'—'),
  REP_F.dim('terms','Terms',r=>r.terms||'—'),REP_F.dim('ctype','Customer type',r=>r.ctype||'—')];
}
function repLineFields(){return [REP_F.text('mark','Line mark',r=>r.mark||'—'),REP_F.dim('size','Size',r=>r.size||'—'),REP_F.dim('shape','Shape',r=>r.shape||'—'),
 REP_F.dim('sizeBand','Size band',r=>r.sizeBand||'—'),REP_F.dim('maker','Manufacturer',r=>r.maker||'—')];}
/* Поля, общие для сканов станций. */
function repScanFields(person){
 return [REP_F.date('at','Scan time'),REP_F.dim('station','Station'),REP_F.dim('person',person||'Person',r=>r.person||'—'),
  REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.text('order','Order'),REP_F.dim('glass','Glass',r=>r.glass||'—'),
  REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('heat','Temper',r=>r.heat||'—'),REP_F.dim('unitType','Unit type',r=>r.unitType||'—'),
  REP_F.dim('priority','Priority',r=>SALES_LIST_PRIORITY[r.priority]||'Normal'),REP_F.text('batch','Batch',r=>r.batch||'—'),
  REP_F.dim('scan','Scan',r=>r.confirmedAt?'Confirmed elsewhere':r.manual?'By hand':'Scanned'),REP_F.text('piece','Glass ID'),
  REP_F.dim('on','Dolly / skid',r=>r.on||'—'),REP_F.dim('recut','Original or recut',r=>r.recut||'—'),REP_F.date('due','Due')]
  .concat(repOrderFields(),repLineFields(),[REP_F.num('area','Glass ft²',{digits:1}),REP_F.num('usd','$ by price list',{money:true})]);
}
/* Станции работы по справочнику Works: закалка — станция работы tempering. */
function repStationsOf(ids){return [...new Set(ids.map(id=>{const w=salesRouteWork(id);return w&&w.station;}).filter(Boolean))];}
function repScansAt(codes){const set=new Set(codes);return repWorkFacts().filter(f=>set.has(f.station));}
/* Операции: скан × работа станции. Кромка — строки начислений EDGE (в
   дюймах), сверловка и ЧПУ — штуки (отверстия, фурнитура, нотчи, вырезы). */
let repOpCache={src:null,rows:null};
function repOpFacts(){
 const src=repWorkFacts();if(repOpCache.src===src&&repOpCache.rows)return repOpCache.rows;
 const rows=[];
 src.forEach(f=>(f.works||[]).forEach((w,i)=>rows.push(Object.assign({},f,{id:f.id+'#'+i,works:null,op:w.op||w.label,unit:w.unit==='in'?'Linear in':w.unit==='ft²'?'ft²':'pcs',kind:String(w.key).split(':')[0],
  qty:w.qty,inches:w.unit==='in'?w.qty:0,workFt2:w.unit==='ft²'?w.qty:0,pcs:w.unit==='pc'?w.qty:0,usd:w.usd}))));
 repOpCache={src,rows};
 return rows;
}
function repOpFields(){
 return repScanFields().filter(f=>!['usd','area','scan','piece'].includes(f.k)).concat([REP_F.dim('op','Operation'),REP_F.dim('unit','Unit'),
  REP_F.num('qty','Quantity',{digits:1}),REP_F.num('inches','Linear in'),REP_F.num('workFt2','Work ft²',{digits:1}),REP_F.num('pcs','Pieces'),REP_F.num('usd','$ by price list',{money:true})]);
}
const REP_SRC={
 glass:{label:'Station work',group:'Production',hint:'Glass through every station',rows:()=>repWorkFacts(),date:['at'],fields:()=>repScanFields(),
  metrics:[{k:'count',label:'Glass',agg:'count'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'units',label:'Units',agg:'distinct',f:'unitKey'},
   {k:'orders',label:'Orders',agg:'distinct',f:'order'},{k:'usd',label:'$ by price list',agg:'sum',f:'usd',money:true}]},
 cutting:{label:'Cutting',group:'Production',hint:'Glass cut at CUT',rows:()=>repScansAt([stationCutCode()]),date:['at'],fields:()=>repScanFields('Cutter'),
  metrics:[{k:'count',label:'Glass cut',agg:'count'},{k:'area',label:'ft² cut',agg:'sum',f:'area',digits:1},{k:'orders',label:'Orders',agg:'distinct',f:'order'},{k:'batches',label:'Batches',agg:'distinct',f:'batch'}]},
 sheets:{label:'Sheets',group:'Production',hint:'Sheet sizes used and waste',rows:()=>repSheetFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Built'),REP_F.text('batch','Batch'),REP_F.dim('glass','Glass'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('size','Sheet size'),REP_F.dim('kind','Sheet or offcut'),REP_F.dim('status','Status'),REP_F.dim('maker','Manufacturer',r=>r.maker||'—'),
   REP_F.num('sheets','Sheets'),REP_F.num('broken','Broken'),REP_F.num('area','Sheet ft²',{digits:1}),REP_F.num('used','Glass ft²',{digits:1}),REP_F.num('waste','Waste ft²',{digits:1}),REP_F.num('keep','To stock ft²',{digits:1})],
  metrics:[{k:'sheets',label:'Sheets',agg:'sum',f:'sheets'},{k:'area',label:'Sheet ft²',agg:'sum',f:'area',digits:1},{k:'used',label:'Glass ft²',agg:'sum',f:'used',digits:1},{k:'waste',label:'Waste ft²',agg:'sum',f:'waste',digits:1},
   {k:'yield',label:'Used %',agg:'ratio',num:'used',den:'area',pct:true,digits:1},{k:'broken',label:'Broken',agg:'sum',f:'broken'}]},
 edgework:{label:'Edgework',group:'Production',hint:'Linear inches by operation',rows:()=>repOpFacts().filter(r=>r.kind==='EDGE'),date:['at'],fields:repOpFields,
  metrics:[{k:'inches',label:'Linear in',agg:'sum',f:'inches'},{k:'count',label:'Operations',agg:'count'},{k:'glass',label:'Glass',agg:'distinct',f:'piece'},{k:'usd',label:'$ by price list',agg:'sum',f:'usd',money:true}]},
 drilling:{label:'Drilling & CNC',group:'Production',hint:'Holes, notches, cutouts, hardware',rows:()=>repOpFacts().filter(r=>r.unit==='pcs'),date:['at'],fields:repOpFields,
  metrics:[{k:'pcs',label:'Pieces',agg:'sum',f:'pcs'},{k:'glass',label:'Glass',agg:'distinct',f:'piece'},{k:'usd',label:'$ by price list',agg:'sum',f:'usd',money:true}]},
 ops:{label:'All operations',group:'Production',hint:'Every priced work at every station',rows:()=>repOpFacts(),date:['at'],fields:repOpFields,
  metrics:[{k:'qty',label:'Quantity',agg:'sum',f:'qty',digits:1},{k:'inches',label:'Linear in',agg:'sum',f:'inches'},{k:'workFt2',label:'Work ft²',agg:'sum',f:'workFt2',digits:1},{k:'pcs',label:'Pieces',agg:'sum',f:'pcs'},{k:'usd',label:'$ by price list',agg:'sum',f:'usd',money:true}]},
 tempering:{label:'Tempering',group:'Production',hint:'Glass through the furnace',rows:()=>repScansAt(repStationsOf(['tempering','heat_strengthening'])),date:['at'],fields:()=>repScanFields('Operator'),
  metrics:[{k:'count',label:'Glass',agg:'count'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'orders',label:'Orders',agg:'distinct',f:'order'}]},
 assembly:{label:'IGU & lamination',group:'Production',hint:'Units assembled',rows:()=>repScansAt(stationMergeCodes()),date:['at'],fields:()=>repScanFields('Assembler'),
  metrics:[{k:'units',label:'Units',agg:'distinct',f:'asmDone'},{k:'count',label:'Glass',agg:'count'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1}]},
 shipping:{label:'Shipping handout',group:'Shipping',hint:'Glass and units handed out at SHIP',rows:()=>repScansAt([shippingStations().ship]),date:['at'],fields:()=>repScanFields('Handed out by'),
  metrics:[{k:'units',label:'Units',agg:'distinct',f:'unitKey'},{k:'count',label:'Glass',agg:'count'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'orders',label:'Orders',agg:'distinct',f:'order'}]},
 deliveries:{label:'Deliveries & pickups',group:'Shipping',hint:'Packing slips, trips, skids',rows:()=>repDeliveryFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Date'),REP_F.dim('method','Method'),REP_F.dim('status','Status'),REP_F.dim('truck','Truck',r=>r.truck||'—'),REP_F.dim('driver','Driver',r=>r.driver||'—'),
   REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.text('ps','Packing slip'),REP_F.dim('city','City',r=>r.city||'—'),REP_F.dim('depart','Departs',r=>r.depart||'—'),
   REP_F.num('stop','Stop #'),REP_F.num('units','Units'),REP_F.num('skids','Skids'),REP_F.num('kg','Weight kg'),REP_F.num('km','Km',{digits:1})],
  metrics:[{k:'count',label:'Packing slips',agg:'count'},{k:'trips',label:'Trips',agg:'distinct',f:'trip'},{k:'units',label:'Units',agg:'sum',f:'units'},{k:'skids',label:'Skids',agg:'sum',f:'skids'},{k:'kg',label:'Weight kg',agg:'sum',f:'kg'},
   {k:'km',label:'Km',agg:'sum',f:'km',digits:1},{k:'kmPerTrip',label:'Km per trip',agg:'ratio',num:'km',den:'kmDone',digits:1}]},
 /* Этапы заказа: день Verified, Batched, Ready, Done и дни между ними —
    пусто, если этапа не было (reports/facts-office). */
 orders:{label:'Orders & due dates',group:'Sales',hint:'On time, late, days at each stage',rows:()=>repOrderFacts(),date:['due','created','shipped','stVerified','stBatched','stReady','stDone'],
  fields:()=>[REP_F.date('due','Due'),REP_F.date('created','Created'),REP_F.date('shipped','Shipped'),REP_F.date('ready','Ready for pickup'),
   REP_F.date('stVerified','Verified'),REP_F.date('stBatched','Batched'),REP_F.date('stReady','All ready'),REP_F.date('stDone','Done'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
   REP_F.dim('priority','Priority'),REP_F.dim('delivery','Delivery'),REP_F.dim('status','Status'),REP_F.dim('state','On time'),REP_F.dim('hold','On hold')]
   .concat(repOrderFields(),[REP_F.num('units','Units'),REP_F.num('glassN','Glass pcs'),REP_F.num('area','Area ft²',{digits:1}),REP_F.num('lines','Lines'),REP_F.num('shapes','Shapes'),REP_F.num('kg','Weight kg'),REP_F.dim('kgStatus','Weight'),
   REP_F.num('daysLate','Days late'),REP_F.num('lead','Lead time, days'),REP_F.num('dVerify','Days new → verified'),REP_F.num('dBatch','Days verified → batched'),
   REP_F.num('dReady','Days batched → ready'),REP_F.num('dDone','Days ready → done'),REP_F.num('total','Order total',{money:true})]),
  metrics:[{k:'count',label:'Orders',agg:'count'},{k:'late',label:'Late orders',agg:'sum',f:'late'},{k:'onTime',label:'On time %',agg:'ratio',num:'onTimeN',den:'judgedN',pct:true,digits:0},
   {k:'units',label:'Units',agg:'sum',f:'units'},{k:'glassN',label:'Glass pcs',agg:'sum',f:'glassN'},{k:'area',label:'Area ft²',agg:'sum',f:'area',digits:1},{k:'total',label:'Order total',agg:'sum',f:'total',money:true}]},
 ordered:{label:'Ordered glass',group:'Sales',hint:'Glass, thickness and ft² ordered',rows:()=>repOrderedFacts(),date:['created','due'],
  fields:()=>[REP_F.date('created','Created'),REP_F.date('due','Due'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('glass','Glass'),
   REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('heat','Temper'),REP_F.dim('unitType','Unit type'),REP_F.dim('status','Status')]
   .concat(repOrderFields(),repLineFields(),[REP_F.num('glassN','Glass pcs'),REP_F.num('area','Glass ft²',{digits:1}),REP_F.num('units','Units')]),
  metrics:[{k:'glassN',label:'Glass pcs',agg:'sum',f:'glassN'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'units',label:'Units',agg:'sum',f:'units'},{k:'orders',label:'Orders',agg:'distinct',f:'order'}]},
 breaks:{label:'Breaks & recuts',group:'Quality',hint:'Recut and NCR glass',rows:()=>repBreakFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Date'),REP_F.dim('kind','Kind'),REP_F.dim('station','Station',r=>r.station||'—'),REP_F.dim('reason','Reason',r=>r.reason||'—'),REP_F.dim('person','Person',r=>r.person||'—'),
   REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.text('order','Order'),REP_F.dim('glass','Glass',r=>r.glass||'—'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm))]
   .concat(repOrderFields(),repLineFields(),[REP_F.num('glassN','Glass pcs'),REP_F.num('area','Glass ft²',{digits:1}),REP_F.num('usd','$ by price list',{money:true})]),
  metrics:[{k:'glassN',label:'Glass pcs',agg:'sum',f:'glassN'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'usd',label:'$ by price list',agg:'sum',f:'usd',money:true},{k:'count',label:'Records',agg:'count'}]},
 time:{label:'Time at stations',group:'People',hint:'First to last scan per person and day',rows:()=>repTimeFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Day'),REP_F.dim('person','Person'),REP_F.dim('station','Station'),REP_F.num('start','First scan hour'),REP_F.num('end','Last scan hour'),
   REP_F.num('hours','Hours between scans',{digits:1}),REP_F.num('glassN','Glass'),REP_F.num('area','Glass ft²',{digits:1})],
  metrics:[{k:'hours',label:'Hours',agg:'sum',f:'hours',digits:1},{k:'glassN',label:'Glass',agg:'sum',f:'glassN'},{k:'perHour',label:'Glass per hour',agg:'ratio',num:'glassTimed',den:'hoursTimed',digits:1},
   {k:'count',label:'Person-days',agg:'count'}]}
};
/* Источник с access виден только с этой галочкой в Users: деньги — Finance. */
function repSourceAllowed(k){const S=REP_SRC[k];return !!S&&(!S.access||typeof accessCan!=='function'||accessCan(S.access));}
Object.assign(REP_SRC,{
 quotes:{label:'Quotes',group:'Sales',hint:'Won, sent, expired, value',rows:()=>repQuoteFacts(),date:['created','sent','validUntil'],
  fields:()=>[REP_F.date('created','Created'),REP_F.date('sent','Sent'),REP_F.date('validUntil','Valid until'),REP_F.text('quote','Quote'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
   REP_F.dim('state','Status'),REP_F.text('order','Won order',r=>r.order||'—')].concat(repOrderFields(),[REP_F.num('revisions','Revisions'),REP_F.num('units','Units'),REP_F.num('area','Area ft²',{digits:1}),
   REP_F.num('value','Quote value',{money:true}),REP_F.num('wonValue','Won value',{money:true})]),
  metrics:[{k:'count',label:'Quotes',agg:'count'},{k:'won',label:'Won',agg:'sum',f:'won'},{k:'winRate',label:'Win rate %',agg:'ratio',num:'won',den:'one',pct:true,digits:0},
   {k:'value',label:'Quote value',agg:'sum',f:'value',money:true},{k:'wonValue',label:'Won value',agg:'sum',f:'wonValue',money:true},{k:'area',label:'Area ft²',agg:'sum',f:'area',digits:1}]},
 payments:{label:'Payments',group:'Finance',access:'finance',hint:'Receipts by date, customer, method',rows:()=>repReceiptFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Date'),REP_F.text('receipt','Receipt'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('method','Method'),REP_F.dim('currency','Currency'),
   REP_F.dim('rep','Sales rep',r=>r.rep||'—'),REP_F.dim('city','City',r=>r.city||'—'),REP_F.dim('ctype','Customer type',r=>r.ctype||'—'),
   REP_F.num('amount','Amount',{money:true}),REP_F.num('applied','Applied to orders',{money:true}),REP_F.num('onAccount','On account',{money:true}),REP_F.num('orders','Orders paid')],
  metrics:[{k:'amount',label:'Amount',agg:'sum',f:'amount',money:true},{k:'count',label:'Receipts',agg:'count'},{k:'applied',label:'Applied to orders',agg:'sum',f:'applied',money:true},
   {k:'onAccount',label:'On account',agg:'sum',f:'onAccount',money:true},{k:'customers',label:'Customers',agg:'distinct',f:'customer'}]},
 /* now — то, что есть сейчас, а не события: архив (erp/archive) им не нужен. */
 balances:{label:'Balances & overdue',group:'Finance',access:'finance',now:true,hint:'What customers owe and how late',rows:()=>repBalanceFacts(),date:['due','billed'],
  fields:()=>[REP_F.date('due','Payment due'),REP_F.date('billed','Billed'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('status','Status')]
   .concat(repOrderFields(),[REP_F.num('total','Order total',{money:true}),REP_F.num('paid','Paid',{money:true}),REP_F.num('balance','Balance',{money:true}),REP_F.num('overdue','Overdue',{money:true}),REP_F.num('daysOverdue','Days overdue')]),
  metrics:[{k:'balance',label:'Balance',agg:'sum',f:'balance',money:true},{k:'overdue',label:'Overdue',agg:'sum',f:'overdue',money:true},{k:'overdueN',label:'Overdue orders',agg:'sum',f:'overdueN'},
   {k:'count',label:'Orders',agg:'count'},{k:'paid',label:'Paid',agg:'sum',f:'paid',money:true},{k:'total',label:'Order total',agg:'sum',f:'total',money:true}]},
 /* Продано (reports/facts-sold): количество — в единице продукта, у
    продукта она и в имени («Flat Polish · in»); где единицы разные, итога
    количества нет (unitBy). Меры по видам — свои колонки. */
 sold:{label:'Products sold',group:'Sales',hint:'Every product, work and service sold',rows:h=>repSoldFacts(h),date:['created','due','shipped'],
  fields:()=>[REP_F.date('created','Order date'),REP_F.date('due','Due'),REP_F.date('shipped','Shipped'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
   REP_F.dim('category','Category'),REP_F.dim('type','Type',r=>r.type||'—'),REP_F.dim('product','Product',r=>r.unitName&&r.unitName!=='—'?r.product+' · '+r.unitName:r.product||'—'),REP_F.dim('unitName','Unit'),
   REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('heat','Temper',r=>r.heat||'—'),REP_F.dim('station','Station',r=>r.station||'—'),REP_F.dim('unitType','Unit type',r=>r.unitType||'—'),
   REP_F.text('makeup','Makeup',r=>r.makeup||'—'),REP_F.dim('charge','Charged'),REP_F.dim('status','Status'),REP_F.dim('priority','Priority'),REP_F.dim('delivery','Delivery')]
   .concat(repOrderFields(),repLineFields(),[REP_F.num('qty','Quantity',{digits:1,unitBy:'unitName'}),REP_F.num('amount','Amount',{money:true}),REP_F.num('unitPrice','Price per unit',{money:true,unitBy:'unitName'}),
   REP_F.num('list','By price list',{money:true}),REP_F.num('units','Units'),REP_F.num('unitFt2','Unit ft²',{digits:1}),REP_F.num('glassFt2','Glass ft²',{digits:1}),REP_F.num('filmFt2','Film ft²',{digits:1}),
   REP_F.num('lamFt2','Laminate ft²',{digits:1}),REP_F.num('spacerFt','Spacer ft',{digits:1}),REP_F.num('inches','Linear in'),REP_F.num('pcs','Pieces'),REP_F.num('workFt2','Work ft²',{digits:1})]),
  metrics:[{k:'amount',label:'Amount',agg:'sum',f:'amount',money:true},{k:'qty',label:'Quantity',agg:'sum',f:'qty',digits:1,unitBy:'unitName'},
   {k:'price',label:'Avg price per unit',agg:'ratio',num:'amount',den:'qty',money:true,unitBy:'unitName'},{k:'orders',label:'Orders',agg:'distinct',f:'order'},{k:'customers',label:'Customers',agg:'distinct',f:'customer'},
   {k:'units',label:'Units',agg:'sum',f:'units'},{k:'unitFt2',label:'Unit ft²',agg:'sum',f:'unitFt2',digits:1},{k:'glassFt2',label:'Glass ft²',agg:'sum',f:'glassFt2',digits:1},
   {k:'filmFt2',label:'Film ft²',agg:'sum',f:'filmFt2',digits:1},{k:'lamFt2',label:'Laminate ft²',agg:'sum',f:'lamFt2',digits:1},{k:'inches',label:'Linear in',agg:'sum',f:'inches'},
   {k:'pcs',label:'Pieces',agg:'sum',f:'pcs'},{k:'workFt2',label:'Work ft²',agg:'sum',f:'workFt2',digits:1},{k:'spacerFt',label:'Spacer ft',agg:'sum',f:'spacerFt',digits:1},
   {k:'list',label:'By price list',agg:'sum',f:'list',money:true}]},
 /* Цех сейчас и листы по резчику (reports/facts-shop). now — то, что есть
    сейчас: период не нужен, срок и «ждёт с» — свои даты для фильтра. */
 shopnow:{label:'Shop now',group:'Production',now:true,hint:'Where every glass is, days waiting, overdue',rows:()=>repShopFacts(),date:['due','since'],
  fields:()=>[Object.assign(REP_F.dim('where','Where'),{seq:v=>v==='To verify'?-2:v==='To batch'?-1:v==='Ready'?1000:repStationAt(v)}),REP_F.dim('stage','Stage'),REP_F.dim('state','Due state'),REP_F.date('due','Due'),REP_F.date('since','Waiting since'),REP_F.text('order','Order'),
   REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('priority','Priority'),REP_F.dim('delivery','Delivery'),REP_F.dim('hold','On hold'),REP_F.dim('status','Status'),
   REP_F.dim('from','Came from',r=>r.from||'—'),REP_F.dim('on','Dolly / skid',r=>r.on||'—'),REP_F.dim('glass','Glass'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),
   REP_F.text('batch','Batch',r=>r.batch||'—'),REP_F.text('piece','Glass ID',r=>r.piece||'—')].concat(repOrderFields(),repLineFields(),
   [REP_F.num('glassN','Glass'),REP_F.num('area','Glass ft²',{digits:1}),REP_F.num('days','Days waiting'),REP_F.num('daysOver','Days overdue'),REP_F.num('over','Overdue glass')]),
  metrics:[{k:'glass',label:'Glass',agg:'sum',f:'glassN'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'orders',label:'Orders',agg:'distinct',f:'order'},
   {k:'overdueOrders',label:'Overdue orders',agg:'distinct',f:'overOrder'},{k:'over',label:'Overdue glass',agg:'sum',f:'over'}]},
 sheetcut:{label:'Sheets cut',group:'Production',hint:'Sheets cut and broken by cutter',rows:()=>repSheetCutFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Date'),REP_F.dim('person','Cutter',r=>r.person||'—'),REP_F.dim('event','Cut or broke'),REP_F.dim('glass','Glass'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),
   REP_F.dim('size','Sheet size'),REP_F.dim('kind','Sheet or offcut'),REP_F.text('batch','Batch'),REP_F.num('sheets','Sheets cut'),REP_F.num('broke','Broken'),REP_F.num('area','Sheet ft²',{digits:1})],
  metrics:[{k:'sheets',label:'Sheets cut',agg:'sum',f:'sheets'},{k:'broke',label:'Broken',agg:'sum',f:'broke'},{k:'area',label:'Sheet ft²',agg:'sum',f:'area',digits:1},{k:'batches',label:'Batches',agg:'distinct',f:'batch'}]},
 offcuts:{label:'Offcuts in stock',group:'Production',now:true,hint:'Sheet offcuts kept, used, removed',rows:()=>repOffcutFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Booked'),REP_F.text('offcut','Offcut'),REP_F.dim('glass','Glass'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('maker','Manufacturer',r=>r.maker||'—'),
   REP_F.dim('size','Size'),REP_F.text('batch','Batch',r=>r.batch||'—'),REP_F.dim('status','Status'),REP_F.num('area','Area ft²',{digits:1})],
  metrics:[{k:'count',label:'Offcuts',agg:'count'},{k:'area',label:'Area ft²',agg:'sum',f:'area',digits:1}]}
});
/* Батчи раскроя (reports/facts-batches): батч × стекло × заказ; листы и
   дни до реза — один раз на батч и стекло. Денег нет — их видит и
   Optimization. */
REP_SRC.batches={label:'Batches',group:'Production',hint:'Glass, sheets and days to cut by batch',rows:()=>repBatchFacts(),date:['at','first','last'],
 fields:()=>[REP_F.date('at','Built'),REP_F.date('first','First cut'),REP_F.date('last','Last cut'),REP_F.dim('built','Batch day'),REP_F.text('batch','Batch'),REP_F.dim('status','Status'),REP_F.dim('glass','Glass'),
  REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.text('order','Order',r=>r.order||'—'),REP_F.dim('customer','Customer',r=>r.customerId?repCustomer(r.customerId):r.customerName||'—'),
  REP_F.num('glassN','Glass'),REP_F.num('area','Glass ft²',{digits:1}),REP_F.num('glassCut','Glass cut'),REP_F.num('sheets','Sheets'),REP_F.num('offcuts','Offcuts used'),
  REP_F.num('sheetFt2','Sheet ft²',{digits:1}),REP_F.num('usedFt2','Used ft²',{digits:1}),REP_F.num('broken','Sheets broken'),REP_F.num('daysFirst','Days to first cut'),REP_F.num('daysLast','Days to last cut')],
 metrics:[{k:'batches',label:'Batches',agg:'distinct',f:'batch'},{k:'glassN',label:'Glass',agg:'sum',f:'glassN'},{k:'area',label:'Glass ft²',agg:'sum',f:'area',digits:1},{k:'orders',label:'Orders',agg:'distinct',f:'order'},
  {k:'sheets',label:'Sheets',agg:'sum',f:'sheets'},{k:'offcuts',label:'Offcuts used',agg:'sum',f:'offcuts'},{k:'sheetFt2',label:'Sheet ft²',agg:'sum',f:'sheetFt2',digits:1},{k:'yield',label:'Used %',agg:'ratio',num:'usedFt2',den:'sheetFt2',pct:true,digits:1},
  {k:'broken',label:'Sheets broken',agg:'sum',f:'broken'},{k:'daysFirst',label:'Days to first cut · avg',agg:'avg',f:'daysFirst',digits:1},{k:'daysLast',label:'Days to last cut · avg',agg:'avg',f:'daysLast',digits:1}]};
/* Склад (reports/facts-inventory) — только с галочкой Inventory, денег нет.
   Меры — каждая своей колонкой: листы шт и ft², рамка ft, герметик, газ и
   части пакета kg; количество в единице строки — unitBy. */
function repConsFields(){return [REP_F.num('spacerFt','Spacer ft',{digits:1}),REP_F.num('sealantKg','Sealant kg',{digits:2}),REP_F.num('gasKg','Gas kg',{digits:2}),REP_F.num('partsKg','IGU parts kg',{digits:2})];}
function repConsMetrics(){return [{k:'spacerFt',label:'Spacer ft',agg:'sum',f:'spacerFt',digits:1},{k:'sealantKg',label:'Sealant kg',agg:'sum',f:'sealantKg',digits:2},
 {k:'gasKg',label:'Gas kg',agg:'sum',f:'gasKg',digits:2},{k:'partsKg',label:'IGU parts kg',agg:'sum',f:'partsKg',digits:2}];}
function repMaterialText(r){return r.unit?r.material+' · '+r.unit:r.material||'—';}
Object.assign(REP_SRC,{
 counts:{label:'Stock counts',group:'Inventory',access:'inventory',hint:'Was → counted, difference, reason',rows:()=>repCountFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Counted'),REP_F.dim('day','Count day'),REP_F.dim('person','Counted by',r=>r.person||'—'),REP_F.dim('kind','Kind'),REP_F.dim('material','Material',repMaterialText),
   REP_F.dim('glass','Glass',r=>r.glass||'—'),REP_F.dim('size','Sheet size',r=>r.size||'—'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('unit','Unit'),
   REP_F.dim('dir','Short or over'),REP_F.dim('reason','Reason'),REP_F.text('note','Note',r=>r.note||'—'),
   REP_F.num('was','Was',{digits:2,unitBy:'unit'}),REP_F.num('counted','Counted',{digits:2,unitBy:'unit'}),REP_F.num('diff','Difference',{digits:2,unitBy:'unit'}),
   REP_F.num('sheets','Sheets'),REP_F.num('sheetFt2','Sheet ft²',{digits:1})].concat(repConsFields(),[REP_F.num('stockPcs','Stock items, pcs')]),
  metrics:[{k:'count',label:'Lines counted',agg:'count'},{k:'off',label:'With difference',agg:'sum',f:'off'},{k:'short',label:'Short',agg:'sum',f:'short'},{k:'over',label:'Over',agg:'sum',f:'over'},
   {k:'days',label:'Days counted',agg:'distinct',f:'day'},{k:'diff',label:'Difference',agg:'sum',f:'diff',digits:2,unitBy:'unit'},
   {k:'sheets',label:'Sheets',agg:'sum',f:'sheets'},{k:'sheetFt2',label:'Sheet ft²',agg:'sum',f:'sheetFt2',digits:1}].concat(repConsMetrics(),[{k:'stockPcs',label:'Stock items, pcs',agg:'sum',f:'stockPcs'}])},
 moves:{label:'Sheet moves',group:'Inventory',access:'inventory',hint:'Received, cut, broke, written off, counted',rows:()=>repSheetMoveFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Date'),REP_F.dim('kind','Move'),REP_F.dim('dir','In or out'),REP_F.dim('sheet','Sheet'),REP_F.dim('glass','Glass'),REP_F.dim('size','Sheet size'),
   REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('person','Person',r=>r.person||'—'),REP_F.dim('reason','Reason',r=>r.reason||'—'),REP_F.text('ref','Reference',r=>r.ref||'—'),
   REP_F.text('batch','Batch',r=>r.batch||'—'),REP_F.text('note','Note',r=>r.note||'—'),
   REP_F.num('sheets','Sheets moved'),REP_F.num('sIn','Sheets in'),REP_F.num('sOut','Sheets out'),REP_F.num('net','Net sheets'),
   REP_F.num('area','ft² moved',{digits:1}),REP_F.num('ftIn','ft² in',{digits:1}),REP_F.num('ftOut','ft² out',{digits:1}),REP_F.num('netFt2','Net ft²',{digits:1})],
  metrics:[{k:'sIn',label:'Sheets in',agg:'sum',f:'sIn'},{k:'sOut',label:'Sheets out',agg:'sum',f:'sOut'},{k:'net',label:'Net sheets',agg:'sum',f:'net'},{k:'sheets',label:'Sheets moved',agg:'sum',f:'sheets'},
   {k:'ftIn',label:'ft² in',agg:'sum',f:'ftIn',digits:1},{k:'ftOut',label:'ft² out',agg:'sum',f:'ftOut',digits:1},{k:'netFt2',label:'Net ft²',agg:'sum',f:'netFt2',digits:1},{k:'count',label:'Moves',agg:'count'}]},
 igumat:{label:'IGU materials used',group:'Inventory',access:'inventory',hint:'Spacer, sealant, gas by IGU scan',rows:h=>repIguMaterialFacts(h),date:['day'],
  fields:()=>[REP_F.date('day','Assembled'),REP_F.dim('person','Assembled by',r=>r.person||(r.record==='By scan'?'—':r.record)),REP_F.dim('kind','Kind'),REP_F.dim('material','Material',repMaterialText),
   REP_F.dim('unit','Unit'),REP_F.dim('record','Record'),REP_F.dim('norm','Norm'),REP_F.num('qty','Quantity',{digits:2,unitBy:'unit'})].concat(repConsFields(),[REP_F.num('units','Units built with it'),REP_F.num('missing','Units without norm')]),
  metrics:[{k:'qty',label:'Quantity',agg:'sum',f:'qty',digits:2,unitBy:'unit'}].concat(repConsMetrics(),[{k:'units',label:'Units built with it',agg:'sum',f:'units'},{k:'missing',label:'Units without norm',agg:'sum',f:'missing'},
   {k:'days',label:'Days',agg:'distinct',f:'day'}])}
});
/* Закупки (reports/facts-purchasing) — только с галочкой Purchasing, цены
   видны. Деньги — в валюте документа: CAD и USD итогом не складываются
   (unitBy currency); Account — поставщик · валюта. */
function repPurItemFields(){return [REP_F.dim('kind','Kind'),REP_F.dim('group','Item group'),REP_F.dim('item','Item'),REP_F.dim('glass','Glass',r=>r.glass||'—'),
 REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('size','Sheet size',r=>r.size||'—'),REP_F.dim('unit','Unit',r=>r.unit||'—')];}
const REP_PUR_MONEY={money:true,unitBy:'currency'};
Object.assign(REP_SRC,{
 purlines:{label:'PO lines',group:'Purchasing',access:'purchasing',hint:'Ordered, received, waiting, amount',rows:()=>repPurLineFacts(),date:['date','expected','sent'],
  fields:()=>[REP_F.date('date','PO date'),REP_F.date('expected','Expected'),REP_F.date('sent','Sent'),REP_F.text('po','PO'),REP_F.dim('supplier','Supplier'),REP_F.dim('currency','Currency'),
   REP_F.dim('account','Account'),REP_F.dim('status','Status'),REP_F.dim('held','Held'),REP_F.dim('priceUnit','Price unit')].concat(repPurItemFields(),[
   REP_F.num('qty','Ordered',{digits:2,unitBy:'unit'}),REP_F.num('received','Received',{digits:2,unitBy:'unit'}),REP_F.num('remaining','Waiting',{digits:2,unitBy:'unit'}),
   REP_F.num('replaceLeft','Replacement due',{digits:2}),REP_F.num('sheets','Sheets ordered'),REP_F.num('sheetFt2','Sheet ft² ordered',{digits:1}),
   REP_F.num('price','Price',Object.assign({digits:2},REP_PUR_MONEY)),REP_F.num('amount','Amount',REP_PUR_MONEY)]),
  metrics:[{k:'lines',label:'PO lines',agg:'count'},{k:'pos',label:'POs',agg:'distinct',f:'po'},{k:'amount',label:'Amount',agg:'sum',f:'amount',money:true,unitBy:'currency'},
   {k:'waiting',label:'Lines waiting',agg:'sum',f:'waiting'},{k:'overdue',label:'Waiting past expected',agg:'sum',f:'overdue'},{k:'unpriced',label:'Lines without price',agg:'sum',f:'unpriced'},
   {k:'sheets',label:'Sheets ordered',agg:'sum',f:'sheets'},{k:'sheetFt2',label:'Sheet ft² ordered',agg:'sum',f:'sheetFt2',digits:1},{k:'suppliers',label:'Suppliers',agg:'distinct',f:'supplier'}]},
 purreceipts:{label:'Supplier receipts',group:'Purchasing',access:'purchasing',hint:'Arrived, broken, late',rows:()=>repPurReceiptFacts(),date:['at','expected'],
  fields:()=>[REP_F.date('at','Received'),REP_F.date('expected','Expected'),REP_F.text('receipt','Receipt'),REP_F.text('po','PO',r=>r.po||'—'),REP_F.dim('supplier','Supplier'),
   REP_F.dim('receivedBy','Received by',r=>r.receivedBy||'—'),REP_F.text('slip','Packing slip',r=>r.slip||'—'),REP_F.dim('arrival','New or replacement'),REP_F.dim('state','On time'),
   REP_F.dim('reason','Broken · reason',r=>r.reason||'—'),REP_F.dim('resolution','Broken · resolution',r=>r.resolution||'—')].concat(repPurItemFields(),[
   REP_F.num('qty','Received',{digits:2,unitBy:'unit'}),REP_F.num('broken','Broken',{digits:2,unitBy:'brokenUnit'}),REP_F.num('sheets','Sheets'),REP_F.num('sheetFt2','Sheet ft²',{digits:1}),
   REP_F.num('daysLate','Days late')]),
  metrics:[{k:'lines',label:'Receipt lines',agg:'count'},{k:'receipts',label:'Receipts',agg:'distinct',f:'receipt'},{k:'late',label:'Late lines',agg:'sum',f:'late'},
   {k:'onTime',label:'On time %',agg:'ratio',num:'onTimeN',den:'judgedN',pct:true,digits:0},{k:'brokenLines',label:'Lines with broken',agg:'sum',f:'brokenLines'},
   {k:'broken',label:'Broken',agg:'sum',f:'broken',digits:2,unitBy:'brokenUnit'},{k:'sheets',label:'Sheets',agg:'sum',f:'sheets'},{k:'sheetFt2',label:'Sheet ft²',agg:'sum',f:'sheetFt2',digits:1}]},
 purbills:{label:'Supplier bills',group:'Purchasing',access:'purchasing',hint:'Invoices, payments, balance, overdue',rows:()=>repPurBillFacts(),date:['date','due'],
  fields:()=>[REP_F.date('date','Date'),REP_F.date('due','Due'),REP_F.dim('kind','Invoice or payment'),REP_F.text('doc','Document'),REP_F.dim('supplier','Supplier'),REP_F.dim('currency','Currency'),
   REP_F.dim('account','Account'),REP_F.dim('status','Status'),REP_F.text('pos','POs',r=>r.pos||'—'),REP_F.dim('method','Payment method',r=>r.method||'—'),
   REP_F.num('invoiced','Invoiced',REP_PUR_MONEY),REP_F.num('paid','Paid',REP_PUR_MONEY),REP_F.num('net','Balance',REP_PUR_MONEY),REP_F.num('balance','Invoice balance',REP_PUR_MONEY),
   REP_F.num('overdue','Overdue',REP_PUR_MONEY),REP_F.num('daysOverdue','Days overdue'),REP_F.num('daysToPay','Days to pay')],
  metrics:[{k:'invoiced',label:'Invoiced',agg:'sum',f:'invoiced',money:true,unitBy:'currency'},{k:'paid',label:'Paid',agg:'sum',f:'paid',money:true,unitBy:'currency'},
   {k:'net',label:'Balance',agg:'sum',f:'net',money:true,unitBy:'currency'},{k:'overdue',label:'Overdue',agg:'sum',f:'overdue',money:true,unitBy:'currency'},
   {k:'invoices',label:'Invoices',agg:'sum',f:'invoices'},{k:'overdueN',label:'Invoices overdue',agg:'sum',f:'overdueN'},{k:'amountNeeded',label:'Amount needed',agg:'sum',f:'amountNeeded'},
   {k:'count',label:'Documents',agg:'count'}]}
});
/* Финансы и агенты (reports/facts-finance): оплаты по заказам и возвраты —
   с галочкой Finance, комиссии — с галочкой Commissions. */
Object.assign(REP_SRC,{
 payorders:{label:'Payments by order',group:'Finance',access:'finance',hint:'What each order got, when, how late',rows:()=>repPayOrderFacts(),date:['at','created','billed','due'],
  fields:()=>[REP_F.date('at','Paid'),REP_F.date('created','Order date'),REP_F.date('billed','Billed'),REP_F.date('due','Payment due'),REP_F.text('receipt','Receipt'),REP_F.text('order','Order'),
   REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('method','Method'),REP_F.dim('currency','Currency'),REP_F.dim('state','When paid'),
   REP_F.dim('rep','Sales rep',r=>r.rep||'—'),REP_F.dim('city','City',r=>r.city||'—'),REP_F.dim('ctype','Customer type',r=>r.ctype||'—'),
   REP_F.num('amount','Amount',{money:true,unitBy:'currency'}),REP_F.num('lateAmount','Paid late',{money:true,unitBy:'currency'}),REP_F.num('daysToPay','Days to pay'),REP_F.num('daysLate','Days late')],
  metrics:[{k:'amount',label:'Amount',agg:'sum',f:'amount',money:true,unitBy:'currency'},{k:'payments',label:'Payments',agg:'count'},{k:'orders',label:'Orders',agg:'distinct',f:'order'},
   {k:'lateAmount',label:'Paid late',agg:'sum',f:'lateAmount',money:true,unitBy:'currency'},{k:'daysToPay',label:'Days to pay · avg',agg:'avg',f:'daysToPay',digits:1},
   {k:'customers',label:'Customers',agg:'distinct',f:'customer'}]},
 refunds:{label:'Refunds',group:'Finance',access:'finance',hint:'Money back: amount, reason',rows:()=>repRefundFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Refunded'),REP_F.text('refund','Refund'),REP_F.text('receipt','From payment',r=>r.receipt||'—'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
   REP_F.dim('method','Method'),REP_F.dim('currency','Currency'),REP_F.dim('reason','Reason'),REP_F.dim('rep','Sales rep',r=>r.rep||'—'),
   REP_F.num('amount','Amount',{money:true,unitBy:'currency'}),REP_F.num('days','Days after payment')],
  metrics:[{k:'amount',label:'Refunded',agg:'sum',f:'amount',money:true,unitBy:'currency'},{k:'count',label:'Refunds',agg:'count'},{k:'customers',label:'Customers',agg:'distinct',f:'customer'}]},
 /* now — долг агенту сейчас, а не события: начислено за всё время. */
 commissions:{label:'Agent commissions',group:'Finance',access:'commissions',now:true,hint:'Earned, paid out, owed by agent',rows:()=>repCommissionFacts(),date:['date'],
  fields:()=>[REP_F.date('date','Order date'),REP_F.dim('agent','Agent'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.text('order','Order'),REP_F.dim('pct','Percent',r=>r.pct?r.pct+'%':'—'),
   REP_F.num('total','Order total',{money:true}),REP_F.num('paid','Paid by customer',{money:true}),REP_F.num('base','Paid without HST',{money:true}),REP_F.num('com','Earned',{money:true}),
   REP_F.num('comHst','Earned with HST',{money:true}),REP_F.num('paidOut','Paid out',{money:true}),REP_F.num('due','To pay',{money:true}),REP_F.num('dueHst','To pay with HST',{money:true})],
  metrics:[{k:'com',label:'Earned',agg:'sum',f:'com',money:true},{k:'paidOut',label:'Paid out',agg:'sum',f:'paidOut',money:true},{k:'due',label:'To pay',agg:'sum',f:'due',money:true},
   {k:'comHst',label:'Earned with HST',agg:'sum',f:'comHst',money:true},{k:'dueHst',label:'To pay with HST',agg:'sum',f:'dueHst',money:true},{k:'paid',label:'Paid by customers',agg:'sum',f:'paid',money:true},
   {k:'base',label:'Paid without HST',agg:'sum',f:'base',money:true},{k:'orders',label:'Orders',agg:'count'},{k:'owed',label:'Orders to pay',agg:'sum',f:'owed'},{k:'agents',label:'Agents',agg:'distinct',f:'agent'}]}
});
/* Клиенты (reports/facts-customers) — с галочкой Customers: последний заказ,
   дней с него, новые по месяцам (по первому заказу), сумма продаж. */
REP_SRC.customers={label:'Customers',group:'Customers',access:'customers',now:true,hint:'Last order, days since, new by month',rows:()=>repCustomerFacts(),date:['lastOrder','firstOrder','created'],
 fields:()=>[REP_F.date('lastOrder','Last order'),REP_F.date('firstOrder','First order'),REP_F.date('created','Customer since'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
  REP_F.dim('recency','Last order · how long ago'),REP_F.dim('rep','Sales rep',r=>r.rep||'—'),REP_F.dim('ctype','Customer type',r=>r.ctype||'—'),REP_F.dim('city','City',r=>r.city||'—'),
  REP_F.dim('province','Province',r=>r.province||'—'),REP_F.dim('status','Status'),REP_F.dim('terms','Terms'),REP_F.dim('currency','Currency'),
  REP_F.num('daysSince','Days since last order'),REP_F.num('orders','Orders'),REP_F.num('total','Sales total',{money:true,unitBy:'currency'})],
 metrics:[{k:'customers',label:'Customers',agg:'sum',f:'customers'},{k:'buying',label:'With orders',agg:'sum',f:'buying'},{k:'active',label:'Ordered in 90 days',agg:'sum',f:'active'},
  {k:'lapsed',label:'No order 180+ days',agg:'sum',f:'lapsed'},{k:'orders',label:'Orders',agg:'sum',f:'orders'},{k:'total',label:'Sales total',agg:'sum',f:'total',money:true,unitBy:'currency'},
  {k:'avgOrder',label:'Average order',agg:'ratio',num:'total',den:'orders',money:true,unitBy:'currency'},{k:'daysSince',label:'Days since last order · avg',agg:'avg',f:'daysSince',digits:0}]};
const REP_GROUPS=['Production','Shipping','Sales','Customers','Inventory','Purchasing','Finance','Quality','People'];
