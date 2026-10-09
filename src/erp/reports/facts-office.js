/* =====================================================================
   reports/facts-office  ·  facts-1.0
   Факты офиса и отгрузки для конструктора отчётов: брак, заказы и сроки,
   заказанное стекло, доставки, листы, время людей у станций.
   IN : DB (Recut, NCR, заказы, PS, раскрои), факты сканов (reports/facts)
   OUT: repBreakFacts · repOrderFacts · repOrderedFacts · repDeliveryFacts ·
        repSheetFacts · repTimeFacts · repQuoteFacts · repReceiptFacts ·
        repBalanceFacts · repOffcutFacts — массивы строк, кэш по метке данных
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
  rows.push({...(o?repOrderInfo(o):{}),...(l?repLineInfo(l):{}),id:kind+'-'+ref+'-'+(s?s.piece:(c?c.key:'')),at,day:repDay(at),hour:repHour(at),kind,ref,station:src.where||'',reason:src.reason||'',
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
  const shapes=lines.filter(l=>typeof salesListShapedLine==='function'&&salesListShapedLine(l)).length;
  let kg=0;try{finWithOrder(o,()=>lines.forEach(l=>{const w=salesLineWeight(l,o);if(w&&w.lineKg!=null)kg+=w.lineKg;}));}catch(e){}
  rows.push({...repOrderInfo(o),id:o.id,at:o.createdAt||'',created,due,shipped,order:o.businessNumber||'',customerId:o.customerId||'',rep:c.salesRep||'',priority:SALES_LIST_PRIORITY[o.priority]||'Normal',
   lines:lines.length,shapes,kg:kg||null,hold:o.onHold?'On hold':'Not on hold',
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
    rows.push({...repOrderInfo(o),...repLineInfo(l),sizeBand:repSizeBand(per),maker:repMaker(c.glassId),id:o.id+'|'+l.id+'|'+c.key,at:o.createdAt||'',created:salesListIsoDay(o.createdAt),due:o.dueDate||'',order:o.businessNumber||'',customerId:o.customerId||'',
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
 const stamp=(DB.shipment||[]).map(s=>s.id+s.status+s.date+(s.truckId||'')+(s.stop||'')+(s.items||[]).length).join(',')+'|'+(DB.truck||[]).length+'|'+JSON.stringify(DB.tripKm||[]);
 if(repDeliveryCache.stamp===stamp&&repDeliveryCache.rows)return repDeliveryCache.rows;
 const rows=shippingWithCtx(()=>(DB.shipment||[]).filter(s=>shippingActive(s)).map(s=>{
  const truck=s.method==='delivery'?truckFind(s.truckId):null,drv=s.driverId?(DB.user||[]).find(u=>u.viewProfileId===s.driverId):null;
  let load={skids:[],units:(s.items||[]).length,kg:null};try{load=deliveryLoad(s);}catch(e){}
  /* Километры рейса — у первой остановки рейса: сумма по PS даёт километры. */
  const first=truck&&deliveryStops(s.date,truck.id)[0],km=first&&first.id===s.id?(tripKmFind(s.date,truck.id)||{}).km:null;
  return {id:s.id,at:s.date,date:s.date,ps:s.number,method:s.method==='pickup'?'Pickup':'Delivery',status:s.status==='delivered'&&s.method==='pickup'?'Picked up':REP_PS_STATUS[s.status]||s.status,
   customerId:s.customerId||'',truck:truck?truck.name:'',driver:drv?drv.name:'',trip:truck?s.date+'|'+truck.id:'',units:load.units,skids:(load.skids||[]).length,kg:load.kg||null,
   city:s.shipTo&&s.shipTo.city||'',stop:s.method==='delivery'&&s.stop?s.stop:null,depart:s.departAt?String(+String(s.departAt).slice(0,2))+':00':'',
   km:km==null?null:km,tripFirst:first&&first.id===s.id?1:0,kmDone:km==null?0:1};
 }));
 repDeliveryCache={stamp,rows};
 return rows;
}

/* Листы: батч × стекло × размер листа (журнал Optimization → Sheets). */
function repSheetFacts(){
 return (typeof sheetUsageRows==='function'?sheetUsageRows():[]).map(r=>({id:r.batch+'|'+r.glass+'|'+(r.stock||r.w+'x'+r.h),at:r.built||'',built:salesListIsoDay(r.built),batch:r.batch,glass:r.glass,mm:r.mm||null,
  size:(r.stock?r.stock+' · ':'')+frac16(r.w)+' × '+frac16(r.h)+'″',kind:r.stock?'Offcut':'Sheet',maker:(glassProductByCode(r.glass)||{}).manufacturer||'',status:r.status,sheets:r.sheets,broken:r.broken,area:r.area,used:r.used,waste:r.net,keep:r.keep}));
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

/* Квоты: строка на квоту со всеми ревизиями. Won — какая-то ревизия
   выиграла; Expired — не выиграна и срок цены прошёл; иначе Sent или Not
   sent. Сумма и ft² — по выигравшей ревизии, иначе по последней. */
let repQuoteCache={stamp:'',rows:null};
function repQuoteFacts(){
 const today=finToday(),stamp=today+'|'+(DB.salesOrder||[]).filter(o=>o&&salesIsQuote(o)).map(o=>o.id+(o.updatedAt||'')+o.status).join(',');
 if(repQuoteCache.stamp===stamp&&repQuoteCache.rows)return repQuoteCache.rows;
 const groups=new Map();
 (DB.salesOrder||[]).forEach(o=>{if(!o||!salesIsQuote(o))return;const g=salesQuoteGroupId(o);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(o);});
 const rows=[...groups.entries()].map(([g,ms])=>{
  ms.sort((a,b)=>(a.quoteRev||0)-(b.quoteRev||0));
  const base=ms.find(m=>!m.quoteRev)||ms[0],won=ms.find(m=>m.status==='won'),q=won||ms[ms.length-1],sent=ms.map(m=>m.sentAt||'').filter(Boolean).sort().pop()||'';
  const valid=q.validUntil||'',state=won?'Won':valid&&valid<today?'Expired':sent?'Sent':'Not sent',t=finOrderTotals(q),lines=q.lines||[];
  const units=lines.reduce((n,l)=>n+salesPositiveInt(l.qty,1),0),area=finWithOrder(q,()=>lines.reduce((n,l)=>{const a=salesLineAreas(l,q);return n+(a.valid?a.actual*salesPositiveInt(l.qty,1):0);},0));
  const value=t&&t.complete?t.grand:null,order=won&&won.wonOrderId?(salesRecord(won.wonOrderId)||{}).businessNumber||'':'';
  return {...repOrderInfo(q),id:g,at:base.createdAt||'',created:salesListIsoDay(base.createdAt),sent:salesListIsoDay(sent),validUntil:valid,quote:salesQuoteBaseNumber(base),customerId:q.customerId||'',
   state,won:won?1:0,one:1,revisions:ms.length,units,area:area||null,value,wonValue:won?value:0,order};
 });
 repQuoteCache={stamp,rows};
 return rows;
}

/* Оплаты (только с Finance): квитанция — дата, клиент, способ, сумма,
   сколько разнесено на заказы и сколько осталось на счёте. Отменённые не
   считаются. */
function repReceiptFacts(){
 return (DB.receipt||[]).filter(r=>r&&!r.voided).map(r=>{
  const applied=(r.allocations||[]).reduce((n,a)=>n+(+a.amount||0),0),m=FIN_METHODS.find(x=>x.k===r.method);
  return {...repCustomerInfo(r.customerId),id:r.id,at:r.date,date:r.date,receipt:r.number,customerId:r.customerId||'',method:m?m.label:r.method,currency:r.currency||'CAD',
   amount:r.amount,applied,onAccount:Math.max(0,r.amount-applied),orders:(r.allocations||[]).length};
 });
}

/* Долги (только с Finance): заказ — сумма, оплачено, остаток, срок оплаты,
   просрочка (как в Finance: finOrderFinancial). */
const REP_BAL_STATUS={paid:'Paid',due:'Due',overpaid:'Overpaid',incomplete:'Not priced',review:'Review',empty:'Empty'};
function repBalanceFacts(){
 const today=finToday();
 return (DB.salesOrder||[]).filter(o=>o&&!salesIsQuote(o)&&o.status!=='cancelled').map(o=>{
  let f=null;try{f=finOrderFinancial(o,today);}catch(e){return null;}
  const b=f.b||{},billed=typeof finBillingDate==='function'?finBillingDate(o)||'':'',late=f.overdue>0;
  return {...repOrderInfo(o),id:o.id,at:billed||o.createdAt||'',billed,due:f.dueOn||'',order:o.businessNumber||'',customerId:o.customerId||'',
   status:late?'Overdue':REP_BAL_STATUS[b.status]||b.status||'',total:b.total,paid:b.paid,balance:b.balance,overdue:f.overdue||0,overdueN:late?1:0,
   daysOverdue:late&&f.dueOn?Math.max(0,Math.round((Date.parse(today+'T12:00:00')-Date.parse(f.dueOn+'T12:00:00'))/864e5)):0};
 }).filter(Boolean);
}

/* Остатки листа в стоке: лежит, ушёл в раскрой вместо листа или снят. */
function repOffcutFacts(){
 const used=new Set();
 (DB.cutPlan||[]).forEach(p=>{if(!p||p.reset)return;(p.groups||[]).forEach(g=>(g.sheets||[]).forEach(s=>{const k=s.size&&s.size.key;if(/^S-/.test(k||''))used.add(k);}));});
 return (DB.stockOffcut||[]).map(r=>({id:r.id,at:r.at,created:salesListIsoDay(r.at),offcut:r.id,glass:r.glass,mm:r.mm||null,maker:(glassProductByCode(r.glass)||{}).manufacturer||'',
  size:frac16(Math.max(r.w,r.h))+' × '+frac16(Math.min(r.w,r.h))+'″',area:r.w&&r.h?r.w*r.h/144:null,batch:r.batch,status:r.status==='cancelled'?'Removed':used.has(r.id)?'Used':'In stock'}));
}
