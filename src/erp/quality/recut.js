/* =====================================================================
   erp/quality/recut  ·  recut-1.0
   Recut — брак до выдачи заказа клиенту. Это часть заказа, а не NCR: новые
   стёкла позиции уходят в To batch этого же заказа, и заказ не выдаётся, пока
   их не отправят в батч. NCR — повреждение после выдачи (erp/quality/ncr).
   IN : DB.salesOrder, DB.ncrReason
   OUT: DB.recut {id, orderId, no, createdAt, lineId, line, mark, which, lite,
        keys, qty, where, reasonId, reason, note}; места стёкол «ключ|R1.k»
   Владелец, 17 сентября 2026: «Recut — это то, что можно решить, пока заказ
   ещё не выдан, и он должен упасть в заказ; NCR — повредили при
   транспортировке, скретч внутри стекла по нашей вине, поцарапанное»; кнопка
   доступна сразу — «вдруг я дал стикер резать из стока… и потом он сломался»;
   нумерация внутри заказа, отдельный блок над Notes. Следующий этап — окно
   RECUT на станции производства: сломалось — ввели — ушло в батч.
   ===================================================================== */
DEFAULT.recut=[];
const RECUT_OPEN_STATUSES=['new','verified','batched','ready'];
function recutForOrder(orderId){return (DB.recut||[]).filter(r=>r.orderId===orderId).sort((a,b)=>a.no-b.no);}
function recutCanOpen(o){return !!o&&!salesIsQuote(o)&&!!salesRecord(o.id)&&RECUT_OPEN_STATUSES.includes(o.status);}
function recutNextNo(orderId){return (DB.recut||[]).filter(r=>r&&r.orderId===orderId).reduce((n,r)=>Math.max(n,+r.no||0),0)+1;}
function recutSlots(r){
 return (r&&r.keys||[]).flatMap(key=>Array.from({length:Math.max(0,Math.floor(+r.qty)||0)},(_,i)=>({key,lineId:r.lineId,unit:'R'+r.no+'.'+(i+1),k:i+1,of:+r.qty,ref:'R'+r.no,label:'Recut '+r.no})));
}
function recutSlotsFor(orderId,lineId){return (DB.recut||[]).filter(r=>r&&r.orderId===orderId&&(!lineId||r.lineId===lineId)).flatMap(recutSlots);}
/* «Recut 1 · 2 of 3» по месту стекла; старые места NCR1001.2 — до переноса. */
function recutUnitText(unit,of){const [ref,k]=String(unit).split('.');return 'Recut '+(ref.startsWith('R')?ref.slice(1):ref)+' · '+k+' of '+(of||'?');}
function recutStatus(r){
 const active=glassBatchActive(r.orderId),slots=recutSlots(r),pending=slots.some(s=>!active.has(s.key+'|'+s.unit));
 return pending?'In queue':'Batched · '+[...new Set(slots.map(s=>active.get(s.key+'|'+s.unit).batch.number))].join(', ');
}
/* Одна позиция формы — один Recut. Всё проверяется до записи. */
function recutCreate(d){
 const o=salesRecord(d&&d.orderId);
 if(!recutCanOpen(o))return {error:'Recut not available'};
 if(d.stamp&&d.stamp!==ncrOrderStamp(o))return {error:'Order changed. Reopen Recut.'};
 const reason=ncrReasonsFor(d.where,{activeOnly:true}).find(r=>r.id===d.reasonId);
 if(!reason)return {error:'Choose where and what happened.'};
 const picks=[];
 for(let i=0;i<o.lines.length;i++){
  const l=o.lines[i],x=d.lines&&d.lines[l.id];if(!x||!x.on)continue;
  const qty=Number(x.qty);if(!Number.isInteger(qty)||qty<1||qty>l.qty)return {error:'Line '+(i+1)+': 1 to '+l.qty+' pcs'};
  const which=String(x.which||'unit'),keys=ncrGlassKeys(o,l,which),opt=ncrLiteOptions(o,l).find(v=>v.value===which);
  if(!keys.length||!opt)return {error:'Line '+(i+1)+': choose which glass.'};
  picks.push({lineId:l.id,line:i+1,mark:l.mark||'',which,lite:opt.label,keys,qty});
 }
 if(!picks.length)return {error:'Select the affected glass.'};
 const now=new Date().toISOString();let no=recutNextNo(o.id);
 const made=picks.map(p=>Object.assign({id:salesUid('RC'),orderId:o.id,no:no++,createdAt:now},p,{where:d.where,reasonId:reason.id,reason:reason.name,note:salesString(d.note).slice(0,500)}));
 DB.recut.push(...made);glassPieceEnsure(o);o.updatedAt=now;touch();
 return {recuts:made};
}
/* Recut, записанный раньше как действие NCR, переносится в заказ один раз:
   номер внутри заказа, места стёкол NCR1001.k → R1.k, номера стёкол те же. */
function recutMigrateFromNcr(){
 const legacy=(Array.isArray(DB.ncr)?DB.ncr:[]).filter(n=>n&&typeof n==='object'&&n.action==='Recut');
 if(!legacy.length)return;
 legacy.forEach(n=>{
  const old=String(n.number||'');
  (Array.isArray(n.glass)?n.glass:[]).filter(g=>g&&typeof g==='object').forEach(g=>{
   const no=recutNextNo(n.orderId),ref='R'+no,keys=(Array.isArray(g.keys)?g.keys:[]).filter(k=>typeof k==='string');
   DB.recut.push({id:salesUid('RC'),orderId:salesString(n.orderId),no,createdAt:salesString(n.createdAt),lineId:salesString(g.lineId),line:g.line,mark:g.mark,which:g.which,lite:g.lite,keys,qty:g.qty,where:n.where,reasonId:n.reasonId,reason:n.reason,note:n.note});
   keys.forEach(key=>{
    const rec=(DB.glassPiece||[]).find(r=>r&&r.key===key);
    if(rec&&rec.extra&&Array.isArray(rec.extra[old])){rec.extra[ref]=rec.extra[old];delete rec.extra[old];}
    (DB.glassBatch||[]).forEach(b=>(Array.isArray(b&&b.items)?b.items:[]).forEach(it=>{
     const p=(b.parts||[])[it&&it.part];
     if(p&&p.key===key&&typeof it.unit==='string'&&it.unit.startsWith(old+'.')){it.unit=ref+it.unit.slice(old.length);if(p.snapshot&&p.snapshot.recut===old)p.snapshot.recut=ref;}
    }));
   });
  });
 });
 DB.ncr=DB.ncr.filter(n=>!(n&&n.action==='Recut'));
}
function normalizeRecuts(){
 if(!Array.isArray(DB.recut))DB.recut=[];
 recutMigrateFromNcr();
 const ids=new Set();
 DB.recut=DB.recut.filter(r=>r&&typeof r==='object').map(r=>({id:typeof r.id==='string'&&r.id?r.id:salesUid('RC'),orderId:salesString(r.orderId),no:Math.max(1,Math.floor(+r.no)||1),createdAt:salesString(r.createdAt),
  lineId:salesString(r.lineId),line:Math.max(1,Math.floor(+r.line)||1),mark:salesString(r.mark),which:r.which==null?'unit':String(r.which),lite:salesString(r.lite),
  keys:(Array.isArray(r.keys)?r.keys:[]).filter(k=>typeof k==='string'&&k.split('|').length===4),qty:Math.max(1,Math.floor(+r.qty)||1),
  where:salesString(r.where).toUpperCase(),reasonId:salesString(r.reasonId),reason:ncrName(r.reason),note:salesString(r.note).slice(0,500)}))
  .filter(r=>{if(!r.orderId||!r.lineId||!r.keys.length||ids.has(r.id))return false;ids.add(r.id);return true;});
}
function validateRecutPayload(src){
 if(src.recut==null||!Array.isArray(src.recut))return;
 const seen=new Set();
 src.recut.forEach(r=>{
  if(!r||typeof r!=='object'||Array.isArray(r)||!salesRefId(r.orderId)||!Number.isSafeInteger(r.no)||r.no<1)throw new Error('Invalid recut record.');
  const k=r.orderId+'#'+r.no;if(seen.has(k))throw new Error('Duplicate recut number.');seen.add(k);
 });
}
