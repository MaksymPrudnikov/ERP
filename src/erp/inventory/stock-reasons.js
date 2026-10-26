/* =====================================================================
   erp/inventory/stock-reasons  ·  stock-reasons-1.0
   Причины разницы при пересчёте склада — листов и расходников. Владелец,
   26.10.2026 (вопрос 3 аудита): «да, с причинами и с ноутом … чтобы потом
   в журнале видеть, что происходило». Список правят в Data → Production →
   Stock reasons, как причины NCR: причину не удаляют — выключают. Причина
   и заметка необязательны: пересчёт ими не блокируется.
   IN : —
   OUT: DB.stockReason {id, name, active}; stockReasonsActive(),
        stockReasonAdd / stockReasonRename / stockReasonSetActive
   ===================================================================== */
DEFAULT.stockReason=[];
/* Стартовый набор — только если список пуст (новая база, старый файл). */
const STOCK_REASON_SEED=['Miscount','Broken on rack','Defect','Used without scan','Found','Returned','Other'];
function normalizeStockReasons(){
 if(!Array.isArray(DB.stockReason)||!DB.stockReason.length){DB.stockReason=STOCK_REASON_SEED.map((name,i)=>({id:'SR-'+String(i+1).padStart(2,'0'),name,active:true}));return;}
 const ids=new Set();
 DB.stockReason=DB.stockReason.filter(r=>r&&typeof r==='object')
  .map(r=>({id:typeof r.id==='string'&&r.id?r.id:salesUid('SR'),name:stockReasonName(r.name),active:r.active!==false}))
  .filter(r=>{if(!r.name||ids.has(r.id))return false;ids.add(r.id);return true;});
}
function stockReasonName(v){return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,80);}
function stockReasonsActive(){return (DB.stockReason||[]).filter(r=>r.active).map(r=>r.name);}
function stockReasonProblem(name,id){
 const n=stockReasonName(name);if(!n)return 'Enter a reason.';
 return (DB.stockReason||[]).some(r=>r.id!==id&&r.name.toLowerCase()===n.toLowerCase())?'This reason is already there.':'';
}
function stockReasonSave(fn){const out=storageCommand(()=>{fn();return true;});return out.ok?'':out.error;}
function stockReasonAdd(name){const p=stockReasonProblem(name);if(p)return p;return stockReasonSave(()=>DB.stockReason.push({id:salesUid('SR'),name:stockReasonName(name),active:true}));}
function stockReasonRename(id,name){
 const r=(DB.stockReason||[]).find(x=>x.id===id);if(!r)return 'Reason not found.';
 const p=stockReasonProblem(name,id);if(p)return p;return stockReasonSave(()=>{r.name=stockReasonName(name);});
}
function stockReasonSetActive(id,on){const r=(DB.stockReason||[]).find(x=>x.id===id);if(!r)return 'Reason not found.';return stockReasonSave(()=>{r.active=!!on;});}
/* Причина и заметка строки пересчёта — как их записывает событие. */
function stockReasonOf(x){x=x||{};return {reason:stockReasonName(x.reason),note:String(x.note==null?'':x.note).trim().slice(0,200)};}
