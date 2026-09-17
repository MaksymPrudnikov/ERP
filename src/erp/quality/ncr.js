/* =====================================================================
   erp/quality/ncr  ·  ncr-1.0
   Запись NCR на основе сохранённого заказа: кто нашёл (Source), где и что
   (справочник erp/quality/reasons), действие и затронутое стекло позиций.
   IN : DB.salesOrder, DB.ncrReason
   OUT: DB.ncr {id, number NCR1001, orderId, createdAt, source, where, reasonId,
        reason, action, note, glass[{lineId, line, mark, which, lite, keys, qty}],
        remakeOrderId}
   Владелец, 17 сентября 2026: кнопка NCR внутри заказа; Recut — новые стёкла
   этой позиции уходят в To batch этого же заказа, заказ не закроется, пока их
   не сделают; Remake order — новый заказ, связанный с исходным, $0 по
   умолчанию; номер «обычный NCR2021»; список — в Sales рядом с Orders и Quotes.
   Glass ID в Sales не показывается: стёкла выбираются позицией и лайтом.
   ===================================================================== */
DEFAULT.ncr=[];
const NCR_RECUT='Recut',NCR_REMAKE='Remake order';
function ncrNextNumber(){let n=1000;(DB.ncr||[]).forEach(r=>{const m=/^NCR(\d+)$/.exec(r&&r.number||'');if(m)n=Math.max(n,+m[1]);});return 'NCR'+(n+1);}
function ncrForOrder(orderId){return (DB.ncr||[]).filter(n=>n.orderId===orderId);}
function ncrFind(id){return (DB.ncr||[]).find(n=>n.id===id)||null;}
function ncrPaneCode(p){
 if(p&&p.category==='laminated'){const L=p.laminated||{},a=glassProductById(L.outer&&L.outer.glassProductId),b=glassProductById(L.inner&&L.inner.glassProductId);return (a?a.code:'?')+'+'+(b?b.code:'?');}
 const g=glassProductById(p&&p.glassProductId);return g?g.code:'?';
}
/* Какое стекло позиции: весь пакет или один лайт (у ламината — обе плиты). */
function ncrLiteOptions(o,l){
 const m=salesMakeupById(o,l.makeupId),panes=m&&m.panes||[];
 if(panes.length<2)return [{value:'unit',label:panes.length?'Glass · '+ncrPaneCode(panes[0]):'Whole unit'}];
 return [{value:'unit',label:'Whole unit'}].concat(panes.map((p,i)=>({value:String(i),label:'Lite '+(i+1)+' · '+ncrPaneCode(p)})));
}
function ncrGlassKeys(o,l,which){return glassBatchComponents(o,l).filter(c=>which==='unit'||String(c.index)===String(which)).map(c=>c.key);}
/* Стёкла перереза: ключ стекла позиции и место «NCR1001.1». Номер стекла
   выдаётся при создании NCR (erp/production/glass-batches). */
function ncrRecutSlots(n){
 if(!n||n.action!==NCR_RECUT)return [];
 return (n.glass||[]).flatMap(g=>(g.keys||[]).flatMap(key=>Array.from({length:Math.max(0,Math.floor(+g.qty)||0)},(_,i)=>({key,lineId:g.lineId,unit:n.number+'.'+(i+1),k:i+1,of:+g.qty,ncr:n.number}))));
}
function ncrRecutSlotsFor(orderId,lineId){return (DB.ncr||[]).filter(n=>n&&n.orderId===orderId).flatMap(ncrRecutSlots).filter(s=>!lineId||s.lineId===lineId);}
/* Статус выводится из связей: Recut открыт, пока его стекло не в батче или
   заказ не дошёл до Ready; Remake — пока новый заказ не выдан или не закрыт. */
function ncrStatus(n){
 if(n.action===NCR_RECUT){
  const o=salesRecord(n.orderId);if(!o||o.status==='cancelled')return 'Done';
  const active=glassBatchActive(o.id);
  return ncrRecutSlots(n).some(s=>!active.has(s.key+'|'+s.unit))||!['ready','done','closed'].includes(o.status)?'Open':'Done';
 }
 if(n.action===NCR_REMAKE){const r=salesRecord(n.remakeOrderId);return r&&['done','closed','cancelled'].includes(r.status)?'Done':'Open';}
 return 'Done';
}
function ncrPieces(n){return (n.glass||[]).reduce((s,g)=>s+g.qty*(n.action===NCR_REMAKE?1:(g.keys||[]).length),0);}
function ncrWhereLabel(n){return n.where===NCR_OFFICE?'Office':n.where;}
function ncrOrderStamp(o){return JSON.stringify([o&&o.lines,o&&o.makeups,o&&o.status]);}
/* Создание: всё проверяется до записи; ошибка возвращается текстом для окна. */
function ncrCreate(d){
 const o=salesRecord(d&&d.orderId);
 if(!o||salesIsQuote(o)||o.status==='cancelled')return {error:'This order cannot get an NCR.'};
 if(d.stamp&&d.stamp!==ncrOrderStamp(o))return {error:'Order changed. Reopen NCR.'};
 if(!NCR_SOURCES.includes(d.source))return {error:'Choose who found it.'};
 if(!NCR_ACTIONS.includes(d.action))return {error:'Choose the action.'};
 const reason=ncrReasonsFor(d.where,{activeOnly:true}).find(r=>r.id===d.reasonId);
 if(!reason)return {error:'Choose where and what happened.'};
 if(d.action===NCR_RECUT&&o.status==='closed')return {error:'Order closed · use Remake'};
 const glass=[];
 for(let i=0;i<o.lines.length;i++){
  const l=o.lines[i],x=d.lines&&d.lines[l.id];if(!x||!x.on)continue;
  const qty=Number(x.qty);if(!Number.isInteger(qty)||qty<1||qty>l.qty)return {error:'Line '+(i+1)+': 1 to '+l.qty+' pcs'};
  const which=d.action===NCR_REMAKE?'unit':String(x.which||'unit'),keys=ncrGlassKeys(o,l,which),opt=ncrLiteOptions(o,l).find(v=>v.value===which);
  if(!keys.length||!opt)return {error:'Line '+(i+1)+': choose which glass.'};
  glass.push({lineId:l.id,line:i+1,mark:l.mark||'',which,lite:opt.label,keys,qty});
 }
 if(!glass.length)return {error:'Select the affected glass.'};
 const now=new Date().toISOString();
 const n={id:salesUid('NCR'),number:ncrNextNumber(),orderId:o.id,createdAt:now,source:d.source,where:d.where,reasonId:reason.id,reason:reason.name,action:d.action,note:salesString(d.note).slice(0,500),glass,remakeOrderId:''};
 DB.ncr.push(n);
 if(n.action===NCR_RECUT){glassPieceEnsure(o);o.updatedAt=now;}
 if(n.action===NCR_REMAKE){
  const src=JSON.parse(JSON.stringify(o)),byLine=new Map(glass.map(g=>[g.lineId,g.qty]));
  src.lines=src.lines.filter(l=>byLine.has(l.id)).map(l=>Object.assign(l,{qty:byLine.get(l.id),batchedAt:'',batchNo:'',cutStartedAt:'',batchManaged:false,onHold:false,holdReason:'',holdAt:''}));
  const used=new Set(src.lines.map(l=>l.makeupId));src.makeups=src.makeups.filter(m=>used.has(m.id));src.extraItems=[];
  const copy=salesCopySalesRecord(src,{kind:'order',status:'new',statusDates:{new:now},businessNumber:nextSalesOrderNumber(),fromQuoteId:'',wonOrderId:'',quoteGroupId:'',quoteRev:0,sentAt:'',validUntil:'',
   batchNo:'',batchHistory:[],unbatchHistory:[],onHold:false,holdReason:'',holdAt:'',fulfilledVia:'',dueDate:'',notes:'Remake for '+n.number+' · order '+o.businessNumber,noCharge:true,remakeNcrId:n.id,createdAt:now,updatedAt:now});
  DB.salesOrder.push(normalizeSalesOrder(copy));normalizeSalesData();
  n.remakeOrderId=copy.id;glassPieceEnsure(salesRecord(copy.id));
 }
 touch();return {ncr:n};
}
function normalizeNcrRecords(){
 if(!Array.isArray(DB.ncr))DB.ncr=[];
 const ids=new Set(),numbers=new Set();
 DB.ncr=DB.ncr.filter(n=>n&&typeof n==='object').map(n=>({id:typeof n.id==='string'&&n.id?n.id:salesUid('NCR'),number:/^NCR\d+$/.test(n.number||'')?n.number:'',orderId:salesString(n.orderId),createdAt:salesString(n.createdAt),
  source:NCR_SOURCES.includes(n.source)?n.source:NCR_SOURCES[0],where:salesString(n.where).toUpperCase(),reasonId:salesString(n.reasonId),reason:ncrName(n.reason),action:NCR_ACTIONS.includes(n.action)?n.action:'No action',note:salesString(n.note).slice(0,500),
  glass:(Array.isArray(n.glass)?n.glass:[]).filter(g=>g&&typeof g==='object').map(g=>({lineId:salesString(g.lineId),line:Math.max(1,Math.floor(+g.line)||1),mark:salesString(g.mark),which:g.which==null?'unit':String(g.which),lite:salesString(g.lite),
   keys:(Array.isArray(g.keys)?g.keys:[]).filter(k=>typeof k==='string'&&k.split('|').length===4),qty:Math.max(1,Math.floor(+g.qty)||1)})).filter(g=>g.lineId&&g.keys.length),remakeOrderId:salesString(n.remakeOrderId)}))
  .filter(n=>{if(!n.orderId||ids.has(n.id))return false;ids.add(n.id);return true;});
 DB.ncr.forEach(n=>{if(n.number&&numbers.has(n.number))n.number='';if(n.number)numbers.add(n.number);});
 DB.ncr.forEach(n=>{if(!n.number)n.number=ncrNextNumber();});
}
function validateNcrPayload(src){
 if(src.ncr==null||!Array.isArray(src.ncr))return;
 const numbers=new Set();
 src.ncr.forEach(n=>{
  if(!n||typeof n!=='object'||Array.isArray(n)||!salesRefId(n.orderId))throw new Error('Invalid NCR record.');
  if(n.number!=null&&n.number!==''){if(!/^NCR\d+$/.test(n.number))throw new Error('Invalid NCR number.');if(numbers.has(n.number))throw new Error('Duplicate NCR number '+n.number+'.');numbers.add(n.number);}
  if(n.glass!=null&&!Array.isArray(n.glass))throw new Error('Invalid NCR record.');
 });
}
