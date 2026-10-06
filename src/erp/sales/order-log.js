/* =====================================================================
   erp/sales/order-log  ·  order-log-1.0
   Журнал заказа: кто и когда создал, изменил, напечатал, отправил в батч,
   выдал. Только главное — «у заказа не так много манипуляций» (владелец,
   2 октября 2026). Смотрят правой кнопкой на заказе → Activity log.
   IN : DB.salesOrder до и после каждой записи базы (touch в erp/storage);
        печать и письма — orderLogAdd из Documents и Stickers;
        кто — signinUser() (erp/signin) или рабочий станции
   OUT: DB.orderEvent {id, at, orderId, no, what, note, by, byId};
        orderLogFor(id) — строки окна вместе с оплатами из Finance

   Изменения не размечаются по всему коду: журнал сравнивает заказ с тем,
   что лежало в базе до записи, поэтому ловит правку из любого экрана —
   Sales, Optimization, Shipping, батчи, станции. Значений «было → стало»
   не храним: Edited называет только, что тронули (строку, срок, клиента).
   Журнал локальный, как и вся база; это не защищённый аудит.
   ===================================================================== */
DEFAULT.orderEvent=[];
if(!Array.isArray(DB.orderEvent))DB.orderEvent=[];
const ORDER_LOG_HEAD=[['customerId','customer'],['customerPo','PO'],['dueDate','due date'],['priority','priority'],['delivery','delivery'],['paymentTerms','terms'],['currency','currency'],['branch','branch'],['notes','notes'],['orderCharges','charges'],['makeups','makeups'],['extraItems','items'],['noCharge','no charge'],['validUntil','valid until']];
/* Поля строки, которые ведёт цех (батч, Hold строки) — у них свои записи. */
const ORDER_LOG_LINE_OWN=['batchManaged','batchedAt','cutStartedAt','batchNo','onHold','holdReason','holdAt','shipQueue','heldUnits','cancelledUnits'];
let orderLogBase={text:null,map:null},orderLogPending=null;

function normalizeOrderLog(){
 if(!Array.isArray(DB.orderEvent))DB.orderEvent=[];
 const s=v=>typeof v==='string'?v:'';
 DB.orderEvent=DB.orderEvent.filter(e=>e&&typeof e==='object'&&typeof e.orderId==='string'&&e.orderId&&typeof e.what==='string'&&e.what&&typeof e.at==='string')
  .map(e=>({id:s(e.id)||salesUid('OE'),at:e.at,orderId:e.orderId,no:s(e.no),what:e.what.slice(0,60),note:s(e.note).slice(0,200),by:s(e.by).slice(0,80),byId:s(e.byId)}));
}
/* Кто: на экране станции — вошедший рабочий и станция, в офисе — вход по PIN. */
function orderLogActor(){
 if(typeof tab!=='undefined'&&tab==='station'&&typeof stationWho==='function'){const w=stationWho();if(w)return {by:w.name+' · '+stationCode,byId:w.id};}
 const u=typeof signinUser==='function'?signinUser():null;
 return u?{by:u.name,byId:u.viewProfileId}:{by:'',byId:''};
}
function orderLogPush(o,what,note){
 if(!o||!o.id)return null;
 if(!Array.isArray(DB.orderEvent))DB.orderEvent=[];
 const e=Object.assign({id:salesUid('OE'),at:new Date().toISOString(),orderId:o.id,no:String(o.businessNumber||''),what,note:String(note||'').slice(0,200)},orderLogActor());
 DB.orderEvent.push(e);return e;
}
/* Печать и письмо базу не меняют — запись журнала сохраняется отдельно.
   Вкладка, которая сейчас не пишет, сначала забирает запись себе. */
function orderLogAdd(orderId,what,note){
 const o=(DB.salesOrder||[]).find(x=>x.id===orderId);if(!o)return;
 storageWhenWriter(()=>storageCommand(()=>{const now=(DB.salesOrder||[]).find(x=>x.id===orderId);if(now)orderLogPush(now,what,note);return true;}));
}

/* ---------------- сравнение заказа до и после записи ---------------- */
function orderLogLineKey(l){const c=Object.assign({},l);ORDER_LOG_LINE_OWN.forEach(k=>delete c[k]);return JSON.stringify(c);}
function orderLogBatchNos(o){return new Set((o.lines||[]).map(l=>l.batchNo).concat(o.batchNo||'').filter(Boolean));}
function orderLogDiff(a,b){
 const out=[],add=(what,note)=>out.push([what,note||'']),q=salesIsQuote(b);
 /* Edited: шапка и строки, без цеховых полей. */
 const parts=ORDER_LOG_HEAD.filter(([k])=>JSON.stringify(a[k]??null)!==JSON.stringify(b[k]??null)).map(([,label])=>label);
 const before=new Map((a.lines||[]).map(l=>[l.id,l]));
 (b.lines||[]).forEach((l,i)=>{const was=before.get(l.id);if(!was)parts.push('line '+(i+1)+' added');else if(orderLogLineKey(was)!==orderLogLineKey(l))parts.push('line '+(i+1));});
 const gone=(a.lines||[]).filter(l=>!(b.lines||[]).some(x=>x.id===l.id)).length;
 if(gone)parts.push(gone===1?'line removed':gone+' lines removed');
 if(parts.length)add('Edited',parts.length>6?parts.slice(0,6).join(', ')+' +'+(parts.length-6):parts.join(', '));
 /* Hold заказа и строк. */
 if(!a.onHold&&b.onHold)add('On Hold',b.holdReason);
 if(a.onHold&&!b.onHold)add('Hold released');
 (b.lines||[]).forEach((l,i)=>{const was=before.get(l.id);if(!was)return;if(!was.onHold&&l.onHold)add('Line '+(i+1)+' on hold',l.holdReason);if(was.onHold&&!l.onHold)add('Line '+(i+1)+' released');});
 /* Батч. */
 const wasNos=orderLogBatchNos(a),batched=[...orderLogBatchNos(b)].filter(n=>!wasNos.has(n));
 batched.forEach(n=>add('Batched',n));
 const unb=(b.unbatchHistory||[]).slice((a.unbatchHistory||[]).length);
 unb.forEach(u=>add('Unbatched',(u.batchNumbers||[]).join(', ')));
 /* Статус. Переход в батч и из батча уже записан строкой Batched / Unbatched. */
 if(a.status!==b.status&&!((a.status==='batched'||b.status==='batched')&&(batched.length||unb.length))){
  if(q){const won=b.status==='won'&&(DB.salesOrder||[]).find(x=>x.id===b.wonOrderId);add(salesStatusLabel(b,b.status),won?'→ '+won.businessNumber:'');}
  else if(a.status==='cancelled')add('Restored',salesStatusLabel(b,b.status));
  else if(b.status==='cancelled')add('Cancelled');
  else add((typeof salesPrevStatus==='function'&&salesPrevStatus(a)===b.status?'Back to ':'')+salesStatusLabel(b,b.status));
 }
 return out;
}
function orderLogCreatedNote(o){
 if(o.fromQuoteId){const qt=(DB.salesOrder||[]).find(x=>x.id===o.fromQuoteId);return 'from quote '+(qt&&qt.businessNumber||'');}
 if(o.remakeNcrId)return 'remake';
 if(salesIsQuote(o)&&o.quoteRev>1)return 'revision '+o.quoteRev;
 return salesIsQuote(o)?'quote':'';
}
/* Заказы того, что лежит в базе сейчас (storageBaseline): разбираем текст
   один раз и дальше держим копию после каждой своей записи. */
function orderLogBaseMap(){
 if(typeof storageBaseline!=='string'||!storageBaseline)return null;
 if(orderLogBase.text!==storageBaseline){
  let orders;try{const d=JSON.parse(storageBaseline);orders=Array.isArray(d&&d.salesOrder)?d.salesOrder:[];}catch(e){return null;}
  orderLogBase={text:storageBaseline,map:new Map(orders.filter(o=>o&&o.id).map(o=>[o.id,JSON.stringify(o)]))};
 }
 return orderLogBase.map;
}
/* touch(): перед записью — события по разнице с базой. */
function orderLogCapture(){
 orderLogPending=null;
 if(!Array.isArray(DB.salesOrder))return;
 const now=new Map(DB.salesOrder.filter(o=>o&&o.id).map(o=>[o.id,JSON.stringify(o)]));
 orderLogPending=now;
 /* Импорт JSON заменяет базу целиком — это не правка заказов. */
 if(typeof storageImporting!=='undefined'&&storageImporting)return;
 const base=orderLogBaseMap();if(!base)return;
 now.forEach((text,id)=>{
  const o=DB.salesOrder.find(x=>x.id===id);
  if(!base.has(id)){orderLogPush(o,'Created',orderLogCreatedNote(o));return;}
  if(base.get(id)===text)return;
  let a,b;try{a=normalizeSalesOrder(JSON.parse(base.get(id)));b=normalizeSalesOrder(JSON.parse(text));}catch(e){return;}
  orderLogDiff(a,b).forEach(([what,note])=>orderLogPush(o,what,note));
 });
 base.forEach((text,id)=>{if(now.has(id))return;let o;try{o=JSON.parse(text);}catch(e){return;}orderLogPush(o,'Deleted');});
}
function orderLogCommitted(text){if(orderLogPending)orderLogBase={text,map:orderLogPending};orderLogPending=null;}

/* ---------------------------- для окна ---------------------------- */
/* Записи журнала и оплаты Finance по этому заказу, по времени. У заказа,
   созданного до журнала, первой строкой — дата создания без имени. */
function orderLogFor(orderId){
 const o=(DB.salesOrder||[]).find(x=>x.id===orderId);
 const rows=(DB.orderEvent||[]).filter(e=>e.orderId===orderId).map(e=>({at:e.at,by:e.by,what:e.what,note:e.note}));
 (DB.financeEvent||[]).forEach(e=>{
  if(e.kind==='opening'||!(e.orders||[]).some(x=>x.id===orderId))return;
  const r=e.after||e.before||{},amount=typeof r.amount==='number'?'$'+r.amount.toFixed(2):'';
  rows.push({at:e.at,by:e.actor==='Not specified'?'':e.actor,what:typeof FIN_EVENT_LABELS!=='undefined'&&FIN_EVENT_LABELS[e.kind]||e.kind,note:[r.number||'',amount].filter(Boolean).join(' · ')});
 });
 if(o&&!rows.some(r=>r.what==='Created'))rows.push({at:o.createdAt||'',by:'',what:'Created',note:'before the log'});
 return rows.sort((x,y)=>String(x.at).localeCompare(String(y.at)));
}
