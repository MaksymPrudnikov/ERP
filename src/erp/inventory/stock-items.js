/* =====================================================================
   erp/inventory/stock-items  ·  stock-items-1.0
   Склад Stock items (план доработок v1.16, пункт 4): готовые двери,
   комплекты и другое из Data → Stock items — в штуках (pcs).
   IN : приёмки Purchasing (строки Stock, таблица stockItem), накладные
        Shipping (extras заказа, Shipped / Delivered), сохранённые заказы
        (extraItems), пересчёты и + / − (DB.stockItemEvent), ушедшее в
        архив (DB.inventoryArchived.stock)
   OUT: sinvRows(), sinvRowOf(id), sinvMoves(), sinvCount, sinvMove

   Остаток не хранится числом — он считается из фактов, как у листов и
   расходников: повторное открытие экрана, F5 и повторный Save ничего не
   прибавляют и не списывают дважды; отмена приёмки или отгрузки убирает
   её факт ровно один раз.
   - On hand = приёмки (принятое без битого) − отгрузки (PS Shipped или
     Delivered) + пересчёты и + / −. Delivered второй раз не списывает.
   - Reserved = неотгруженное в сохранённых заказах; Draft, Quote,
     отменённые, закрытые и выполненные заказы не резервируют. Резерв
     считается из заказа как он есть — не копится от Save к Save.
   - Available = On hand − Reserved; минус — нехватка (Short), заказ всё
     равно сохраняется (ничего не запрещаем «по логике данных»).
   - Пересчёт пишет «было → стало»: поправка = посчитано − остаток. Первый
     пересчёт — начальный остаток (старые приёмки поверх него не
     прибавляются: они уже в «было»); до него позиция «Not counted».
     Ошибку исправляют новым пересчётом или + / −, историю не стирают.
   ===================================================================== */
DEFAULT.stockItemEvent=[];
const SINV_KINDS=['count','add','remove'];
const SINV_REMOVE=['Damaged','Lost','Other'];
const SINV_MAX=100000;
function sinvKey(id){return 'stock:'+id;}
/* Отправлено по строке заказа: «заказ|строка склада» → штуки. */
function sinvSentExtras(){
 const sent=new Map(),moves=[];
 (DB.shipment||[]).forEach(s=>{if(!shippingSent(s))return;(s.extras||[]).forEach(i=>{
  const k=i.orderId+'|'+i.extraId;sent.set(k,(sent.get(k)||0)+i.qty);moves.push({s,i});});});
 return {sent,moves};
}
function sinvBuild(){
 const rows=new Map(),row=id=>{
  if(!rows.has(id)){const x=(DB.stockItem||[]).find(r=>r&&r.id===id);rows.set(id,{id,key:sinvKey(id),x,name:x?x.name:id,code:x?x.code||'':'',kind:x?x.subcategory||'':'',measures:x?stockMeasureText(x):'',off:!!x&&x.active===false,
   received:0,shipped:0,adjust:0,reserved:0,orders:[],lastCount:null,moves:[]});}
  return rows.get(id);
 };
 (DB.stockItem||[]).forEach(x=>{if(x&&x.id&&x.active!==false)row(x.id);});
 /* Приход — принятое без битого (битое приходит в приёмке, но не на полку). */
 (DB.purchaseReceipt||[]).forEach(r=>{if(r.voidAt)return;(r.lines||[]).forEach(l=>{
  if(l.kind!=='stock'||l.table!=='stockItem'||!l.itemId)return;
  const q=Math.max(0,(l.qty||0)-(l.damaged||0)),x=row(l.itemId);x.received+=q;
  x.moves.push({id:'GR|'+r.id+'|'+l.id,kind:'Receipt',ref:r.number,receipt:r.id,day:r.date||salesListIsoDay(r.createdAt),at:r.createdAt||r.date||'',rack:q,by:r.receivedBy||r.createdBy||'',note:l.damaged?l.damaged+' damaged':''});
 });});
 const {sent,moves}=sinvSentExtras();
 moves.forEach(({s,i})=>{
  const o=salesRecord(i.orderId),x=o&&(o.extraItems||[]).find(e=>e.id===i.extraId);if(!x||x.table!=='stockItem'||!x.itemId)return;
  const r=row(x.itemId);r.shipped+=i.qty;
  r.moves.push({id:'PS|'+s.id+'|'+i.orderId+'|'+i.extraId,kind:'Shipped',ref:s.number,day:finLocalDate(s.shippedAt),at:s.shippedAt,rack:-i.qty,by:s.shippedBy||'',note:'Order '+(o.businessNumber||'')});
 });
 (DB.salesOrder||[]).forEach(o=>{
  if(!(o.extraItems||[]).length||salesIsQuote(o)||salesIsDraft(o)||['cancelled','closed','done'].includes(o.status))return;
  o.extraItems.forEach(x=>{if(x.table!=='stockItem'||!x.itemId)return;
   const left=salesPositiveInt(x.qty,1)-(sent.get(o.id+'|'+x.id)||0);if(left<=0)return;
   const r=row(x.itemId);r.reserved+=left;r.orders.push({id:o.id,n:o.businessNumber||'',qty:left});});
 });
 Object.entries(DB.inventoryArchived&&DB.inventoryArchived.stock||{}).forEach(([id,a])=>{const r=row(id);r.received+=+a.received||0;r.shipped+=+a.shipped||0;});
 (DB.stockItemEvent||[]).forEach(e=>{const r=row(e.itemId);r.adjust+=e.qty;
  if(e.kind==='count'&&(!r.lastCount||e.at>r.lastCount.at))r.lastCount=e;
  r.moves.push({id:e.id,kind:e.kind==='count'?'Count':e.kind==='add'?'Add':'Remove',ref:'',day:salesListIsoDay(e.at),at:e.at,rack:e.qty,by:e.by||'',event:e,
   note:[e.kind==='count'?'Was '+e.before+' → '+e.after:'',e.reason,e.note].filter(Boolean).join(' · ')});});
 return [...rows.values()].map(r=>{r.onHand=r.received-r.shipped+r.adjust;r.available=r.onHand-r.reserved;
  r.status=r.available<0?'Short':!r.lastCount?'Not counted':'OK';r.moves.sort((a,b)=>String(b.at).localeCompare(String(a.at)));return r;})
  .sort((a,b)=>String(a.kind).localeCompare(String(b.kind))||String(a.name).localeCompare(String(b.name)));
}
function sinvRows(){return readMemo('sinvRows',[DB.stockItem,DB.purchaseReceipt,DB.shipment,DB.salesOrder,DB.stockItemEvent],sinvBuild);}
function sinvRowOf(id){return sinvRows().find(r=>r.id===id)||null;}
/* Движения для журнала Inventory: та же строка, что у листов, без размера. */
function sinvMoves(){
 return sinvRows().flatMap(r=>r.moves.map(m=>Object.assign({stock:true,itemId:r.id,key:r.key,code:r.code,name:r.name,w:0,h:0,layout:null},m))).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}
function sinvInt(v,label,min){
 const s=String(v==null?'':v).trim(),n=Number(s);
 if(!s||!Number.isInteger(n)||n<min||n>SINV_MAX)throw new Error(label+': enter a whole number'+(min?' from 1':' 0 or more')+'.');
 return n;
}
function sinvPush(e){
 const a=orderLogActor(),row=Object.assign({id:salesUid('SE')},e,{at:new Date().toISOString(),by:a.by||'',byId:a.byId||''});
 if(!Array.isArray(DB.stockItemEvent))DB.stockItemEvent=[];DB.stockItemEvent.push(row);return row;
}
/* Пересчёт: «стоит ровно N» — запись было → стало; разница 0 тоже пишется:
   позиция посчитана. */
function sinvCount(itemId,counted,why){
 if(!accessCan('inventory'))return {ok:false,error:'Inventory access is required.'};
 return storageCommand(()=>{
  const r=sinvBuild().find(x=>x.id===itemId);if(!r)throw new Error('Item not found.');
  const n=sinvInt(counted,'Counted',0);
  return sinvPush(Object.assign({itemId,kind:'count',qty:n-r.onHand,before:r.onHand,after:n},stockReasonOf(why)));
 },{stockItemEvent:true});
}
/* + приход без PO (Opening stock, Found, Returned) и − списание. */
function sinvMove(itemId,kind,qty,why){
 if(!accessCan('inventory'))return {ok:false,error:'Inventory access is required.'};
 return storageCommand(()=>{
  if(kind!=='add'&&kind!=='remove')throw new Error('Choose add or remove.');
  if(!(DB.stockItem||[]).some(x=>x&&x.id===itemId))throw new Error('Item not found.');
  const n=sinvInt(qty,'Quantity',1),w=why||{};
  return sinvPush({itemId,kind,qty:kind==='add'?n:-n,reason:String(w.reason||'').slice(0,80),note:String(w.note||'').trim().slice(0,200)});
 },{stockItemEvent:true});
}
function sinvEventValid(e){return !!(e&&typeof e==='object'&&typeof e.id==='string'&&e.id&&typeof e.itemId==='string'&&e.itemId&&SINV_KINDS.includes(e.kind)&&Number.isInteger(+e.qty)&&typeof e.at==='string'&&!isNaN(Date.parse(e.at)));}
function normalizeStockItems(){
 const ids=new Set(),int=v=>Number.isInteger(+v)?+v:null;
 DB.stockItemEvent=(Array.isArray(DB.stockItemEvent)?DB.stockItemEvent:[]).filter(e=>sinvEventValid(e)&&!ids.has(e.id)&&(ids.add(e.id),true))
  .map(e=>Object.assign({id:e.id,itemId:e.itemId,kind:e.kind,qty:+e.qty},e.kind==='count'?{before:int(e.before),after:int(e.after)}:{},
   {reason:String(e.reason||'').slice(0,80),note:String(e.note||'').slice(0,200),at:e.at,by:String(e.by||''),byId:String(e.byId||'')}));
}
function validateStockItemPayload(src){
 if(src.stockItemEvent==null)return;
 if(!Array.isArray(src.stockItemEvent))throw new Error('Stock item counts must be an array.');
 const ids=new Set();src.stockItemEvent.forEach(e=>{if(!sinvEventValid(e)||ids.has(e.id))throw new Error('Stock item count: invalid or duplicate record.');ids.add(e.id);});
}
