/* =====================================================================
   erp/inventory/consumables  ·  consumables-1.0
   Склад расходников обвязки (план Master Data, задача 6): рамка, герметики,
   газ, части пакета.
   IN : приёмки Purchasing (строки Stock: таблица + айтем), сохранённые
        заказы, сканы сборки IGU (DB.stationScan: asm + unit), пересчёты
        (DB.consumableEvent)
   OUT: consRows() — строки склада; consCountSave, consSetPack

   Владелец, 23.10.2026: заказ резервирует материал на Save, со склада он
   уходит на скане сборки IGU. Остаток не хранится числом — он считается из
   фактов, как склад листов: повторный Save ничего не списывает дважды,
   Undo скана возвращает материал. Расход юнита — рецепт обвязки с отходом
   (salesLineWeight → строки обвязки); рамка — в футах по периметру камеры,
   остальное — в кг. Пересчёт пишет разницу «было → стало» — отход по факту.
   ===================================================================== */
DEFAULT.consumableEvent=[];
if(!Array.isArray(DB.consumableEvent))DB.consumableEvent=[];
const CONS_TABLES=[['spacerVariant','Spacers','ft'],['sealantProduct','Sealants','kg'],['gasProduct','Gas','kg'],['iguPart','IGU parts','kg']];
const CONS_RESERVE_STATES=['new','verified','batched'];
const CONS_FT_PER_M=1/0.3048;
function consUnitOf(table){const t=CONS_TABLES.find(x=>x[0]===table);return t?t[2]:'';}
function consKey(table,id){return table+':'+id;}
/* Расход одного юнита позиции: ключ айтема → количество в единице склада. */
function consPerUnit(line,order){
 const out=new Map();
 /* Лайты строки читаются из soDraft — заказ подставляется, как в Finance. */
 finWithOrder(order,()=>salesLineWeight(line,order)).rows.forEach(r=>{
  if(!r.table||!r.itemId||!consUnitOf(r.table))return;
  const k=consKey(r.table,r.itemId),waste=1+(r.wastePct||0)/100;
  const q=r.table==='spacerVariant'?(r.perimeterM!=null?r.perimeterM*CONS_FT_PER_M*waste:null):r.usedKg;
  out.set(k,q==null?NaN:(out.has(k)?out.get(k):0)+q);
 });
 return out;
}
/* Собранные на IGU юниты: сборка (asm) — один юнит; позиция — по её стеклу. */
function consAssembled(){
 const index=stationPieceIndex(),asm=new Map();
 (DB.stationScan||[]).forEach(s=>{
  if(s.undoneAt||s.broken||!s.asm||!s.unit||asm.has(s.asm))return;
  const hit=index.get(s.piece);if(hit)asm.set(s.asm,{orderId:hit.orderId,lineId:hit.lineId,piece:s.piece,at:s.at});
 });
 return [...asm.values()];
}
function consRows(){
 const rows=new Map(),row=(table,id)=>{
  const k=consKey(table,id);
  if(!rows.has(k)){const x=mdById(table,id),t=CONS_TABLES.find(t=>t[0]===table);rows.set(k,{key:k,table,id,group:t?t[1]:table,name:x?x.name:id,code:x?x.code||'':'',off:!!x&&x.active===false,unit:consUnitOf(table),pack:x&&x.packQty!=null?x.packQty:null,received:0,used:0,reserved:0,adjust:0,noPack:0,unknown:0,lastCount:null});}
  return rows.get(k);
 };
 CONS_TABLES.forEach(([t])=>(DB[t]||[]).forEach(x=>{if(x&&x.id&&x.active!==false)row(t,x.id);}));
 /* Приход: строки Stock приёмок; не в единице склада — через «в упаковке». */
 (DB.purchaseReceipt||[]).forEach(r=>{if(r.voidAt)return;(r.lines||[]).forEach(l=>{
  if(l.kind!=='stock'||!consUnitOf(l.table)||!l.itemId)return;
  const x=row(l.table,l.itemId),qty=(l.qty||0)-(l.damaged||0);
  if(mdUnitCode(l.unit,'')===x.unit)x.received+=qty;else if(x.pack!=null)x.received+=qty*x.pack;else x.noPack++;
 });});
 /* Расход по сканам IGU и резерв несобранных юнитов сохранённых заказов.
    Отменённые юниты (Cancel units) не резервируются; собранный и потом
    отменённый остаётся расходом (аудит 25.10.2026, I-3). */
 const per=new Map(),perOf=(o,l)=>{const k=o.id+'|'+l.id;if(!per.has(k))per.set(k,consPerUnit(l,o));return per.get(k);};
 const built=new Map(),gone=new Map(),goneOf=o=>{if(!gone.has(o.id))gone.set(o.id,unitCancelledSet(o));return gone.get(o.id);};
 consAssembled().forEach(a=>{
  const o=salesRecord(a.orderId),l=o&&(o.lines||[]).find(x=>x.id===a.lineId);if(!l)return;
  if(!goneOf(o).has(a.piece))built.set(o.id+'|'+l.id,(built.get(o.id+'|'+l.id)||0)+1);
  perOf(o,l).forEach((q,k)=>{const[t,...id]=k.split(':'),x=row(t,id.join(':'));if(Number.isFinite(q))x.used+=q;else x.unknown++;});
 });
 (DB.salesOrder||[]).forEach(o=>{
  if(salesIsQuote(o)||!CONS_RESERVE_STATES.includes(o.status))return;
  (o.lines||[]).forEach(l=>{
   const m=salesMakeupById(o,l.makeupId);if(!m||!(m.cavities||[]).length)return;
   const left=salesPositiveInt(l.qty,1)-unitCancelled(l)-(built.get(o.id+'|'+l.id)||0);if(left<=0)return;
   perOf(o,l).forEach((q,k)=>{const[t,...id]=k.split(':'),x=row(t,id.join(':'));if(Number.isFinite(q))x.reserved+=q*left;else x.unknown++;});
  });
 });
 /* Пересчёт держит строку и у неактивной карточки (I-7). */
 (DB.consumableEvent||[]).forEach(e=>{const[t,...id]=String(e.key).split(':');if(!consUnitOf(t)||!id.length)return;const x=row(t,id.join(':'));x.adjust+=e.qty;if(!x.lastCount||e.at>x.lastCount.at)x.lastCount=e;});
 /* Нехватка видна раньше «Not counted» (I-5). */
 return [...rows.values()].map(x=>{x.onHand=x.received-x.used+x.adjust;x.free=x.onHand-x.reserved;
  x.status=x.noPack?'Pack size missing':x.unknown?'Norm missing':x.free<0?'Short':!x.lastCount?'Not counted':'OK';return x;})
  .sort((a,b)=>CONS_TABLES.findIndex(t=>t[0]===a.table)-CONS_TABLES.findIndex(t=>t[0]===b.table)||String(a.name).localeCompare(String(b.name)));
}
function consNumber(v,label){const s=String(v==null?'':v).trim(),n=Number(s);if(!s||!Number.isFinite(n)||n<0)throw new Error(label+': enter 0 or more.');return n;}
/* Пересчёт: разница с остатком — запись «было → стало», отход по факту. */
function consCountSave(counts){
 return invPersist(()=>{
  const rows=new Map(consRows().map(r=>[r.key,r])),now=new Date().toISOString(),actor=orderLogActor(),out=[];
  Object.entries(counts||{}).forEach(([key,v])=>{
   const r=rows.get(key);if(!r)throw new Error('Item not found. Reopen the count.');
   const n=consNumber(v,r.name),before=Math.round(r.onHand*1000)/1000;
   const e={id:salesUid('CE'),key,qty:n-r.onHand,before,after:n,at:now,by:actor.by,byId:actor.byId};
   DB.consumableEvent.push(e);out.push(e);
  });
  if(!out.length)throw new Error('Enter at least one count.');
  return out;
 });
}
/* В упаковке — в карточке айтема (packQty), правка отсюда же. */
function consSetPack(key,v){
 return invPersist(()=>{
  const i=key.indexOf(':'),x=mdById(key.slice(0,i),key.slice(i+1));if(!x)throw new Error('Item not found.');
  x.packQty=String(v==null?'':v).trim()===''?null:consNumber(v,'Per pack');return x;
 });
}
function consEventValid(e){return !!(e&&typeof e==='object'&&typeof e.id==='string'&&e.id&&typeof e.key==='string'&&e.key.indexOf(':')>0&&Number.isFinite(+e.qty)&&typeof e.at==='string');}
function normalizeConsumables(){
 const ids=new Set();
 DB.consumableEvent=(Array.isArray(DB.consumableEvent)?DB.consumableEvent:[]).filter(e=>consEventValid(e)&&!ids.has(e.id)&&(ids.add(e.id),true))
  .map(e=>({id:e.id,key:e.key,qty:+e.qty,before:Number.isFinite(+e.before)?+e.before:null,after:Number.isFinite(+e.after)?+e.after:null,at:e.at,by:String(e.by||''),byId:String(e.byId||'')}));
}
