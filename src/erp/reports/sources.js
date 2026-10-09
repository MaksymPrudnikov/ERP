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
function repCustomer(id){return id?salesCustomerDisplay(id)||'—':'—';}
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
 orders:{label:'Orders & due dates',group:'Sales',hint:'On time, late, lead time',rows:()=>repOrderFacts(),date:['due','created','shipped'],
  fields:()=>[REP_F.date('due','Due'),REP_F.date('created','Created'),REP_F.date('shipped','Shipped'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),
   REP_F.dim('priority','Priority'),REP_F.dim('delivery','Delivery'),REP_F.dim('status','Status'),REP_F.dim('state','On time'),REP_F.dim('hold','On hold')]
   .concat(repOrderFields(),[REP_F.num('units','Units'),REP_F.num('glassN','Glass pcs'),REP_F.num('area','Area ft²',{digits:1}),REP_F.num('lines','Lines'),REP_F.num('shapes','Shapes'),REP_F.num('kg','Weight kg'),
   REP_F.num('daysLate','Days late'),REP_F.num('lead','Lead time, days'),REP_F.num('total','Order total',{money:true})]),
  metrics:[{k:'count',label:'Orders',agg:'count'},{k:'late',label:'Late orders',agg:'sum',f:'late'},{k:'onTime',label:'On time %',agg:'ratio',num:'onTimeN',den:'shippedN',pct:true,digits:0},
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
 balances:{label:'Balances & overdue',group:'Finance',access:'finance',hint:'What customers owe and how late',rows:()=>repBalanceFacts(),date:['due','billed'],
  fields:()=>[REP_F.date('due','Payment due'),REP_F.date('billed','Billed'),REP_F.text('order','Order'),REP_F.dim('customer','Customer',r=>repCustomer(r.customerId)),REP_F.dim('status','Status')]
   .concat(repOrderFields(),[REP_F.num('total','Order total',{money:true}),REP_F.num('paid','Paid',{money:true}),REP_F.num('balance','Balance',{money:true}),REP_F.num('overdue','Overdue',{money:true}),REP_F.num('daysOverdue','Days overdue')]),
  metrics:[{k:'balance',label:'Balance',agg:'sum',f:'balance',money:true},{k:'overdue',label:'Overdue',agg:'sum',f:'overdue',money:true},{k:'overdueN',label:'Overdue orders',agg:'sum',f:'overdueN'},
   {k:'count',label:'Orders',agg:'count'},{k:'paid',label:'Paid',agg:'sum',f:'paid',money:true},{k:'total',label:'Order total',agg:'sum',f:'total',money:true}]},
 offcuts:{label:'Offcuts in stock',group:'Production',hint:'Sheet offcuts kept, used, removed',rows:()=>repOffcutFacts(),date:['at'],
  fields:()=>[REP_F.date('at','Booked'),REP_F.text('offcut','Offcut'),REP_F.dim('glass','Glass'),REP_F.dim('mm','Thickness',r=>repMmText(r.mm)),REP_F.dim('maker','Manufacturer',r=>r.maker||'—'),
   REP_F.dim('size','Size'),REP_F.text('batch','Batch',r=>r.batch||'—'),REP_F.dim('status','Status'),REP_F.num('area','Area ft²',{digits:1})],
  metrics:[{k:'count',label:'Offcuts',agg:'count'},{k:'area',label:'Area ft²',agg:'sum',f:'area',digits:1}]}
});
const REP_GROUPS=['Production','Shipping','Sales','Finance','Quality','People'];
