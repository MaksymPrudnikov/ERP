/* =====================================================================
   reports/facts-office  ·  facts-1.0
   Факты офиса и отгрузки для конструктора отчётов: брак, заказы и сроки,
   заказанное стекло, доставки, листы, время людей у станций.
   IN : DB (Recut, NCR, заказы, PS, раскрои), факты сканов (reports/facts)
   OUT: repBreakFacts · repOrderFacts · repOrderedFacts · repDeliveryFacts ·
        repSheetFacts · repTimeFacts — массивы строк, кэш по метке данных
   Правило: файл ничего не рисует. Каждая строка — одно событие или одна
   вещь; считает и группирует движок (reports/query).
   ===================================================================== */
/* Цена стекла по прайсу — как Makeup берёт её без ручной правки
   (salesPaneCatalogPrice): каталог стекла, закалённое или нет. У плиты
   ламината — своё стекло и своя закалка. $ за ft². */
function repGlassPrice(c){
 const spec=c&&c.spec||{},g=glassProductById(spec.glassProductId);if(!g)return null;
 const ht=mdById('heatTreatment',spec.heatTreatmentId),code=String(ht&&ht.code||'').toUpperCase();
 const v=code==='FT'||code==='HS'?g.salePriceTempered:g.salePriceAnnealed;
 return v==null||v===''||!Number.isFinite(+v)?null:+v;
}
function repCompMm(c){const mm=c&&c.pane?stkGlassInfo(c.pane,c.index,c.ply).mm:null;return mm||null;}

/* Брак: разбитое стекло и переделки. Разбитое на станции — строка на стекло
   со сканом поломки: кто, где, когда (erp/shopfloor/scan, stationBreak).
   Recut, заведённый в офисе, и NCR (претензия после отгрузки) человека не
   знают — строка на стекло заказа × количество. $ — стекло по прайсу × ft²:
   сколько стоило бы такое стекло без работ. */
let repBreakCache={stamp:'',rows:null};
function repBreakFacts(){
 const stamp=[repWorkStamp(),(DB.recut||[]).length,(DB.ncr||[]).length,(DB.recut||[]).map(r=>r.createdAt).join(','),(DB.ncr||[]).map(n=>n.createdAt).join(',')].join('|');
 if(repBreakCache.stamp===stamp&&repBreakCache.rows)return repBreakCache.rows;
 const index=stationPieceIndex(),batches=stationBatchIndex(),byRef=new Map(),rows=[];
 (DB.stationScan||[]).forEach(s=>{
  if(!s.broken||s.undoneAt||!s.recut)return;const g=stationGlass(s.piece,index,batches);if(!g)return;
  const k=g.o.id+'|'+s.recut;if(!byRef.has(k))byRef.set(k,[]);byRef.get(k).push({s,g});
 });
 const row=(kind,ref,src,o,l,c,qty,s)=>{
  const at=s?s.at:src.createdAt,per=o&&l?finWithOrder(o,()=>{const a=salesLineAreas(l,o);return a&&a.valid?a.actual:0;}):0,area=qty*per,price=repGlassPrice(c);
  rows.push({id:kind+'-'+ref+'-'+(s?s.piece:(c?c.key:'')),at,day:repDay(at),hour:repHour(at),kind,ref,station:src.where||'',reason:src.reason||'',
   personId:s?s.byId||s.by||'':'',person:s?s.by||'':'',orderId:o?o.id:'',order:o?o.businessNumber||'':'',customerId:o?o.customerId||'':'',
   glass:c?c.glass:'',mm:repCompMm(c),glassN:qty,area:area||null,usd:price==null||!area?null:area*price});
 };
 (DB.recut||[]).forEach(r=>{
  const o=salesRecord(r.orderId),l=o&&(o.lines||[]).find(x=>x.id===r.lineId),ref='R'+r.no,hit=byRef.get(r.orderId+'|'+ref);
  if(hit&&hit.length){hit.forEach(({s,g})=>row('Recut',r.no,r,g.o,g.l,g.c,1,s));return;}
  const comps=o&&l?glassBatchComponents(o,l):[];
  (r.keys||[]).forEach(key=>row('Recut',r.no,r,o,l,comps.find(c=>c.key===key)||null,+r.qty||0,null));
 });
 (DB.ncr||[]).forEach(n=>{
  const o=salesRecord(n.orderId);
  (n.glass||[]).forEach(gr=>{const l=o&&(o.lines||[]).find(x=>x.id===gr.lineId),comps=o&&l?glassBatchComponents(o,l):[];
   (gr.keys||[]).forEach(key=>row('NCR',n.number,n,o,l,comps.find(c=>c.key===key)||null,+gr.qty||0,null));});
 });
 repBreakCache={stamp,rows};
 return rows;
}

/* Заказы и сроки: одна строка на заказ. Отгружен — последний отправленный PS,
   когда заказ выдан целиком (Done / Closed). Вовремя — отгружен не позже
   срока; Late — позже срока или срок прошёл, а заказ не выдан; Open — срок
   ещё не наступил. */
let repOrderCache={stamp:'',rows:null};
function repOrderFacts(){
 const today=finToday(),stamp=[today,(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')+o.status).join(','),(DB.shipment||[]).map(s=>s.id+s.status+s.date).join(',')].join('|');
 if(repOrderCache.stamp===stamp&&repOrderCache.rows)return repOrderCache.rows;
 const rows=[],days=(a,b)=>Math.round((Date.parse(b+'T12:00:00')-Date.parse(a+'T12:00:00'))/864e5);
 (DB.salesOrder||[]).forEach(o=>{
  if(!o||salesIsQuote(o)||o.status==='cancelled')return;
  const done=['done','closed'].includes(o.status),sent=done?shippingForOrder(o.id).filter(s=>shippingSent(s)&&shippingCarries(s,o.id)).map(s=>s.date).sort():[];
  const shipped=done?sent[sent.length-1]||salesListIsoDay(o.statusDates&&o.statusDates.done)||'':'',due=o.dueDate||'';
  const state=!due?'No due date':shipped?(shipped<=due?'On time':'Late'):(due<today?'Late':'Open');
  const lines=o.lines||[],units=lines.reduce((n,l)=>n+Math.max(0,salesPositiveInt(l.qty,1)-unitCancelled(l)),0);
  const area=finWithOrder(o,()=>lines.reduce((n,l)=>{const a=salesLineAreas(l,o);return n+(a.valid?a.actual*Math.max(0,salesPositiveInt(l.qty,1)-unitCancelled(l)):0);},0));
  const created=salesListIsoDay(o.createdAt),c=salesFindCustomer(o.customerId)||{},t=finOrderTotals(o);
  const glassN=lines.reduce((n,l)=>n+Math.max(0,salesPositiveInt(l.qty,1)-unitCancelled(l))*glassBatchComponents(o,l).filter(x=>!x.missing).length,0);
  rows.push({id:o.id,at:o.createdAt||'',created,due,shipped,order:o.businessNumber||'',customerId:o.customerId||'',rep:c.salesRep||'',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',
   delivery:o.delivery==='delivery'?'Delivery':'Pickup',status:salesStatusLabel(o),state,daysLate:state==='Late'?Math.max(0,days(due,shipped||today)):0,
   lead:shipped&&created?Math.max(0,days(created,shipped)):null,units,glassN,area:area||null,late:state==='Late'?1:0,onTimeN:state==='On time'?1:0,shippedN:shipped&&due?1:0,total:t&&t.complete?t.grand:null});
 });
 repOrderCache={stamp,rows};
 return rows;
}

/* Заказанное стекло: строка заказа × стекло юнита (лайт, плита ламината) —
   что заказали: стекло, толщина, закалка, ft², фигура или прямоугольник.
   Юниты строки записаны у первого стекла, чтобы сумма юнитов не умножалась
   на число стёкол. */
let repOrderedCache={stamp:'',rows:null};
function repOrderedFacts(){
 const stamp=(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')+o.status).join(',');
 if(repOrderedCache.stamp===stamp&&repOrderedCache.rows)return repOrderedCache.rows;
 const rows=[];
 (DB.salesOrder||[]).forEach(o=>{
  if(!o||salesIsQuote(o)||o.status==='cancelled')return;
  finWithOrder(o,()=>(o.lines||[]).forEach(l=>{
   const live=Math.max(0,salesPositiveInt(l.qty,1)-unitCancelled(l)),a=salesLineAreas(l,o),per=a&&a.valid?a.actual:0,m=salesMakeupById(o,l.makeupId);
   const unitType=m?(m.unitType==='single'&&(m.panes||[]).some(p=>p.category==='laminated')?'Laminated':docUnitLabel(m.unitType)):'';
   const shape=typeof salesListShapedLine==='function'&&salesListShapedLine(l)?'Shape':'Rectangle';
   glassBatchComponents(o,l).filter(c=>!c.missing).forEach((c,i)=>{
    const info=stkGlassInfo(c.pane,c.index,c.ply);
    rows.push({id:o.id+'|'+l.id+'|'+c.key,at:o.createdAt||'',created:salesListIsoDay(o.createdAt),due:o.dueDate||'',order:o.businessNumber||'',customerId:o.customerId||'',
     status:salesStatusLabel(o),glass:c.glass,mm:info.mm||null,heat:info.heat||'Annealed',unitType,shape,glassN:live,area:live*per||null,units:i?0:live});
   });
  }));
 });
 repOrderedCache={stamp,rows};
 return rows;
}

/* Доставка и самовывоз: строка на PS. Рейс — день и машина: на одной
   машине за день несколько остановок. Километры — по карте Google (позже,
   владелец 9 октября 2026). */
const REP_PS_STATUS={planned:'Planned',shipped:'Shipped',delivered:'Delivered'};
let repDeliveryCache={stamp:'',rows:null};
function repDeliveryFacts(){
 const stamp=(DB.shipment||[]).map(s=>s.id+s.status+s.date+(s.truckId||'')+(s.stop||'')+(s.items||[]).length).join(',')+'|'+(DB.truck||[]).length;
 if(repDeliveryCache.stamp===stamp&&repDeliveryCache.rows)return repDeliveryCache.rows;
 const rows=shippingWithCtx(()=>(DB.shipment||[]).filter(s=>shippingActive(s)).map(s=>{
  const truck=s.method==='delivery'?truckFind(s.truckId):null,drv=s.driverId?(DB.user||[]).find(u=>u.viewProfileId===s.driverId):null;
  let load={skids:[],units:(s.items||[]).length,kg:null};try{load=deliveryLoad(s);}catch(e){}
  return {id:s.id,at:s.date,date:s.date,ps:s.number,method:s.method==='pickup'?'Pickup':'Delivery',status:s.status==='delivered'&&s.method==='pickup'?'Picked up':REP_PS_STATUS[s.status]||s.status,
   customerId:s.customerId||'',truck:truck?truck.name:'',driver:drv?drv.name:'',trip:truck?s.date+'|'+truck.id:'',units:load.units,skids:(load.skids||[]).length,kg:load.kg||null};
 }));
 repDeliveryCache={stamp,rows};
 return rows;
}

/* Листы: батч × стекло × размер листа (журнал Optimization → Sheets). */
function repSheetFacts(){
 return (typeof sheetUsageRows==='function'?sheetUsageRows():[]).map(r=>({id:r.batch+'|'+r.glass+'|'+(r.stock||r.w+'x'+r.h),at:r.built||'',built:salesListIsoDay(r.built),batch:r.batch,glass:r.glass,mm:r.mm||null,
  size:(r.stock?r.stock+' · ':'')+frac16(r.w)+' × '+frac16(r.h)+'″',kind:r.stock?'Offcut':'Sheet',status:r.status,sheets:r.sheets,broken:r.broken,area:r.area,used:r.used,waste:r.net,keep:r.keep}));
}

/* Время у станции: человек × день × станция — первый и последний скан.
   Табеля нет; это время между сканами, а не рабочие часы. «В час» считается
   только по дням, где между сканами не меньше получаса: пять ручных сканов
   за минуту дали бы тысячи стёкол в час. */
let repTimeCache={src:null,rows:null};
function repTimeFacts(){
 const src=repWorkFacts();if(repTimeCache.src===src&&repTimeCache.rows)return repTimeCache.rows;
 const m=new Map();
 src.forEach(f=>{if(!f.day||!f.personId)return;const k=f.personId+'|'+f.day+'|'+f.station;let r=m.get(k);
  if(!r){r={id:k,at:f.at,day:f.day,person:f.person,personId:f.personId,station:f.station,first:f.at,last:f.at,glassN:0,area:0};m.set(k,r);}
  if(f.at<r.first)r.first=f.at;if(f.at>r.last)r.last=f.at;r.glassN++;r.area+=+f.area||0;});
 const rows=[...m.values()].map(r=>{const hours=Math.max(0,(Date.parse(r.last)-Date.parse(r.first))/36e5),timed=hours>=0.5;return Object.assign(r,{at:r.first,hours,start:repHour(r.first),end:repHour(r.last),hoursTimed:timed?hours:0,glassTimed:timed?r.glassN:0});});
 repTimeCache={src,rows};
 return rows;
}
