/* =====================================================================
   erp/production/stock-offcuts  ·  stock-1.0
   Остатки листа, забуканные в сток: номер S-0000001, стекло, размер и
   откуда он (батч, лист). Это задел будущего склада остатков.
   IN : раскрой батча (erp/production/cut-layout)
   OUT: DB.stockOffcut, стикер Stock (erp/production/stickers)

   Владелец, 18 сентября 2026: «ты только подсказываешь, что стекло было бы
   неплохо для стока, но если мы его не выбрали — значит, это не сток, а
   отход». В сток — только руками; потом стикер (номер стока, размер, тип
   стекла), и только после этого остаток уходит из отходов. Номер
   S-0000001 — в одном ряду с G- и U-. Снятый со стока номер не выдаётся
   повторно: стикер с ним мог уже уйти на стеллаж.
   ===================================================================== */
DEFAULT.stockOffcut=[];DEFAULT.stockOffcutSeq=0;
const STOCK_STATUSES=['stock','cancelled'];
function stockIdValid(id){return typeof id==='string'&&/^S-\d{7,}$/.test(id);}
function stockIdNumber(id){return stockIdValid(id)?+id.slice(2):0;}
function stockIdNext(){
 const top=(DB.stockOffcut||[]).reduce((m,r)=>Math.max(m,stockIdNumber(r&&r.id)),0);
 DB.stockOffcutSeq=Math.max(Number.isSafeInteger(DB.stockOffcutSeq)&&DB.stockOffcutSeq>0?DB.stockOffcutSeq:0,top)+1;
 return 'S-'+String(DB.stockOffcutSeq).padStart(7,'0');
}
function stockOffcutFind(id){return (DB.stockOffcut||[]).find(r=>r.id===id)||null;}
function stockOffcutClean(r){
 const num=(v,d)=>Number.isFinite(+v)?Math.round(+v*16)/16:d;
 return {id:r.id,glass:String(r.glass||''),mm:Number.isFinite(+r.mm)?+r.mm:0,w:num(r.w,0),h:num(r.h,0),
  batch:String(r.batch||''),sheet:Number.isSafeInteger(+r.sheet)&&+r.sheet>0?+r.sheet:0,x:num(r.x,0),y:num(r.y,0),
  at:typeof r.at==='string'?r.at:'',status:STOCK_STATUSES.includes(r.status)?r.status:'stock'};
}
function stockOffcutAdd(rec){
 const r=stockOffcutClean(Object.assign({id:stockIdNext(),at:new Date().toISOString(),status:'stock'},rec));
 if(!Array.isArray(DB.stockOffcut))DB.stockOffcut=[];
 DB.stockOffcut.push(r);return r;
}
function stockOffcutCancel(id){const r=stockOffcutFind(id);if(r)r.status='cancelled';return r;}
function normalizeStockOffcuts(){
 const seen=new Set();
 DB.stockOffcut=(Array.isArray(DB.stockOffcut)?DB.stockOffcut:[])
  .filter(r=>r&&typeof r==='object'&&stockIdValid(r.id)&&!seen.has(r.id)&&(seen.add(r.id),true)).map(stockOffcutClean)
  .filter(r=>r.w>0&&r.h>0);
 const top=DB.stockOffcut.reduce((m,r)=>Math.max(m,stockIdNumber(r.id)),0);
 DB.stockOffcutSeq=Math.max(Number.isSafeInteger(DB.stockOffcutSeq)&&DB.stockOffcutSeq>0?DB.stockOffcutSeq:0,top);
}
function validateStockOffcutPayload(src){
 if(src.stockOffcut==null)return;
 if(!Array.isArray(src.stockOffcut))throw new Error('Stock offcuts must be an array.');
 const seen=new Set();
 src.stockOffcut.forEach(r=>{
  if(!r||typeof r!=='object'||!stockIdValid(r.id))throw new Error('Invalid stock offcut.');
  if(seen.has(r.id))throw new Error('Duplicate stock offcut '+r.id+'.');seen.add(r.id);
 });
}
