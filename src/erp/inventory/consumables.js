/* =====================================================================
   erp/inventory/consumables  ·  consumables-1.0
   Склад расходников обвязки (план Master Data, задача 6): рамка, герметики,
   газ, части пакета.
   IN : приёмки Purchasing (строки Stock: таблица + айтем), сохранённые
        заказы, сканы сборки IGU (DB.stationScan: asm + unit), пересчёты
        (DB.consumableEvent), расход ушедших в архив (DB.inventoryArchived.cons)
   OUT: consRows() — строки склада; consPerUnitSaved — рецепт юнита
        сохранённой позиции; consCountSave, consSetPack

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
/* Физические переводы — не нормы цеха (аудит 25.10.2026, I-4): длина и вес. */
const CONS_PHYS={ft:['len',1],inch:['len',1/12],m:['len',CONS_FT_PER_M],kg:['kg',1],lb:['kg',0.45359237]};
function consPhys(from,to){const a=CONS_PHYS[from],b=CONS_PHYS[to];return a&&b&&a[0]===b[0]?a[1]/b[1]:null;}
/* Во что покупают: список карточки, а у старой карточки — «в упаковке» за
   её единицу закупки (без единицы — коробка). */
function consPacks(x){
 if(!x)return [];if(Array.isArray(x.packs)&&x.packs.length)return x.packs;
 return x.packQty>0?[{unit:mdUnitCode(x.purchaseUnit,'')||'box',qty:x.packQty}]:[];
}
/* Сколько единиц склада в одной единице закупки; неизвестно — null. */
function consPerUnitOf(x,table,unit){
 const stock=consUnitOf(table),u=mdUnitCode(unit,'');if(!u)return null;
 if(u===stock)return 1;const ph=consPhys(u,stock);if(ph!=null)return ph;
 const p=consPacks(x).find(p=>p.unit===u);return p?p.qty:null;
}
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
  const hit=index.get(s.piece);if(hit)asm.set(s.asm,{orderId:hit.orderId,lineId:hit.lineId,piece:s.piece,at:s.at,by:s.by||'',scan:s.id,asm:s.asm});
 });
 return [...asm.values()];
}
/* Рецепт юнита записанной позиции помнится, пока заказ не менялся
   (updatedAt) и не менялись нормы Data — рецепты обвязки, карточки рамки,
   герметика, газа, частей. Без этого склад на годе считал геометрию каждой
   собранной и зарезервированной позиции на каждой отрисовке: 1,3 с на
   клик и на цифру в пересчёте, на слабом ПК 5,7 с. Черновик заказа сюда не
   идёт: его updatedAt — от прошлого Save. consPerFresh — раз на расчёт. */
let consPerCache=new Map(),consPerNorms='';
function consPerFresh(){
 const n=JSON.stringify([DB.surroundRecipe||[]].concat(CONS_TABLES.map(t=>DB[t[0]]||[])));
 if(n!==consPerNorms){consPerCache=new Map();consPerNorms=n;}
}
function consPerUnitSaved(line,order){
 const k=order.id+'|'+line.id,u=order.updatedAt||'',was=consPerCache.get(k);
 if(was&&was.u===u)return was.per;
 const per=consPerUnit(line,order);consPerCache.set(k,{u,per});return per;
}
function consRows(){
 consPerFresh();
 const rows=new Map(),row=(table,id)=>{
  const k=consKey(table,id);
  if(!rows.has(k)){const x=mdById(table,id),t=CONS_TABLES.find(t=>t[0]===table);rows.set(k,{key:k,table,id,group:t?t[1]:table,name:x?x.name:id,code:x?x.code||'':'',off:!!x&&x.active===false,unit:consUnitOf(table),pack:x&&x.packQty!=null?x.packQty:null,packs:consPacks(x),received:0,used:0,reserved:0,adjust:0,noPack:0,unknown:0,lastCount:null});}
  return rows.get(k);
 };
 CONS_TABLES.forEach(([t])=>(DB[t]||[]).forEach(x=>{if(x&&x.id&&x.active!==false)row(t,x.id);}));
 /* Приход: строки Stock приёмок. Пересчёт в единицу склада — тот, что был
    при приёмке (stockPer, аудит I-2: смена упаковки прошлое не меняет); не
    было — по карточке сейчас; чужая единица без пересчёта — не коробка, а
    «Pack size missing» (I-4). */
 (DB.purchaseReceipt||[]).forEach(r=>{if(r.voidAt)return;(r.lines||[]).forEach(l=>{
  if(l.kind!=='stock'||!consUnitOf(l.table)||!l.itemId)return;
  const x=row(l.table,l.itemId),qty=(l.qty||0)-(l.damaged||0),per=l.stockPer!=null?l.stockPer:consPerUnitOf(mdById(l.table,l.itemId),l.table,l.unit);
  if(per!=null)x.received+=qty*per;else x.noPack++;
 });});
 /* Расход по сканам IGU и резерв несобранных юнитов сохранённых заказов.
    Отменённые юниты (Cancel units) не резервируются; собранный и потом
    отменённый остаётся расходом (аудит 25.10.2026, I-3). */
 const perOf=(o,l)=>consPerUnitSaved(l,o);
 const built=new Map(),gone=new Map(),goneOf=o=>{if(!gone.has(o.id))gone.set(o.id,unitCancelledSet(o));return gone.get(o.id);};
 consAssembled().forEach(a=>{
  const o=salesRecord(a.orderId),l=o&&(o.lines||[]).find(x=>x.id===a.lineId);if(!l)return;
  if(!goneOf(o).has(a.piece))built.set(o.id+'|'+l.id,(built.get(o.id+'|'+l.id)||0)+1);
  perOf(o,l).forEach((q,k)=>{const[t,...id]=k.split(':'),x=row(t,id.join(':'));if(Number.isFinite(q))x.used+=q;else x.unknown++;});
 });
 (DB.salesOrder||[]).forEach(o=>{if(salesIsDraft(o))return;
  if(salesIsQuote(o)||!CONS_RESERVE_STATES.includes(o.status))return;
  (o.lines||[]).forEach(l=>{
   const m=salesMakeupById(o,l.makeupId);if(!m||!(m.cavities||[]).length)return;
   const left=salesPositiveInt(l.qty,1)-unitCancelled(l)-(built.get(o.id+'|'+l.id)||0);if(left<=0)return;
   perOf(o,l).forEach((q,k)=>{const[t,...id]=k.split(':'),x=row(t,id.join(':'));if(Number.isFinite(q))x.reserved+=q*left;else x.unknown++;});
  });
 });
 /* Ушедшее в архив (erp/archive): расход — разницей на день ухода (I-1). */
 Object.entries(DB.inventoryArchived&&DB.inventoryArchived.cons||{}).forEach(([key,a])=>{const[t,...id]=key.split(':');if(!consUnitOf(t)||!id.length)return;const x=row(t,id.join(':'));x.used+=+a.used||0;x.unknown+=+a.unknown||0;});
 /* Пересчёт держит строку и у неактивной карточки (I-7). */
 (DB.consumableEvent||[]).forEach(e=>{const[t,...id]=String(e.key).split(':');if(!consUnitOf(t)||!id.length)return;const x=row(t,id.join(':'));x.adjust+=e.qty;if(!x.lastCount||e.at>x.lastCount.at)x.lastCount=e;});
 /* Нехватка видна раньше «Not counted» (I-5). */
 return [...rows.values()].map(x=>{x.onHand=x.received-x.used+x.adjust;x.free=x.onHand-x.reserved;
  x.status=x.noPack?'Pack size missing':x.unknown?'Norm missing':x.free<0?'Short':!x.lastCount?'Not counted':'OK';return x;})
  .sort((a,b)=>CONS_TABLES.findIndex(t=>t[0]===a.table)-CONS_TABLES.findIndex(t=>t[0]===b.table)||String(a.name).localeCompare(String(b.name)));
}
function consNumber(v,label){const s=String(v==null?'':v).trim(),n=Number(s);if(!s||!Number.isFinite(n)||n<0)throw new Error(label+': enter 0 or more.');return n;}
/* Пересчёт: разница с остатком — запись «было → стало», отход по факту. */
function consCountSave(counts,why){
 return invPersist(()=>{
  const rows=new Map(consRows().map(r=>[r.key,r])),now=new Date().toISOString(),actor=orderLogActor(),out=[];
  Object.entries(counts||{}).forEach(([key,v])=>{
   const r=rows.get(key);if(!r)throw new Error('Item not found. Reopen the count.');
   const n=consNumber(v,r.name),before=Math.round(r.onHand*1000)/1000;
   const e=Object.assign({id:salesUid('CE'),key,qty:n-r.onHand,before,after:n},stockReasonOf(why&&why[key]),{at:now,by:actor.by,byId:actor.byId});
   DB.consumableEvent.push(e);out.push(e);
  });
  if(!out.length)throw new Error('Enter at least one count.');
  return out;
 });
}
/* Строки журнала Inventory: пересчёт расходника — было → стало, причина. */
function consCountMoves(){
 const q=v=>(Math.round(v*100)/100).toLocaleString('en-US',{maximumFractionDigits:2});
 return (DB.consumableEvent||[]).map(e=>{
  const[t,...id]=String(e.key).split(':'),x=mdById(t,id.join(':')),unit=consUnitOf(t);
  return {id:e.id,kind:'Count',cons:true,code:x?x.code||'':'',name:x?x.name:id.join(':'),key:e.key,w:0,h:0,ref:'',day:salesListIsoDay(e.at),at:e.at,rack:Math.round(e.qty*100)/100,layout:null,by:e.by||'',
   note:['Was '+q(e.before)+' '+unit+' → '+q(e.after)+' '+unit,e.reason,e.note].filter(Boolean).join(' · ')};
 });
}
/* В упаковке — в карточке айтема (packQty), правка отсюда же: первая
   упаковка списка. */
function consSetPack(key,v){
 const i=key.indexOf(':'),x=mdById(key.slice(0,i),key.slice(i+1));if(!x)return {ok:false,error:'Item not found.'};
 const packs=consPacks(x).map(p=>Object.assign({},p)),first=packs[0]||{unit:mdUnitCode(x.purchaseUnit,'')||'box'};
 const t=String(v==null?'':v).trim();if(t!==''){const n=Number(t);if(!Number.isFinite(n)||n<0)return {ok:false,error:'Per pack: enter 0 or more.'};}
 if(t===''||+t===0)packs.splice(0,packs.length?1:0);else{first.qty=+t;if(packs.length)packs[0]=first;else packs.push(first);}
 return consSetPacks(key,packs);
}
/* Весь список «во что покупают»; первая упаковка — и единица закупки с «в
   упаковке» карточки (их читает карточка рамки и цена за единицу). */
function consSetPacks(key,packs){
 return invPersist(()=>{
  const i=key.indexOf(':'),t=key.slice(0,i),x=mdById(t,key.slice(i+1));if(!x)throw new Error('Item not found.');
  const clean=[],seen=new Set();
  (packs||[]).forEach(p=>{const u=mdUnitCode(p&&p.unit,''),q=p&&p.qty;if(!u)return;
   if(u===consUnitOf(t))throw new Error('Same as the stock unit.');if(seen.has(u))throw new Error(mdUnitName(u)+' is there twice.');
   if(q==null||q==='')return;const n=consNumber(q,'Per '+mdUnitName(u));if(!n)return;seen.add(u);clean.push({unit:u,qty:n});});
  if(clean.length){x.packs=clean;x.purchaseUnit=clean[0].unit;x.packQty=clean[0].qty;}else{delete x.packs;x.packQty=null;}
  return x;
 });
}
function consEventValid(e){return !!(e&&typeof e==='object'&&typeof e.id==='string'&&e.id&&typeof e.key==='string'&&e.key.indexOf(':')>0&&Number.isFinite(+e.qty)&&typeof e.at==='string');}
/* Причина и заметка пересчёта переживают F5 и Import: без них журнал и
   отчёт Stock counts после перезагрузки показывали бы «No reason». */
function normalizeConsumables(){
 const ids=new Set();
 DB.consumableEvent=(Array.isArray(DB.consumableEvent)?DB.consumableEvent:[]).filter(e=>consEventValid(e)&&!ids.has(e.id)&&(ids.add(e.id),true))
  .map(e=>({id:e.id,key:e.key,qty:+e.qty,before:Number.isFinite(+e.before)?+e.before:null,after:Number.isFinite(+e.after)?+e.after:null,
   reason:String(e.reason||'').slice(0,80),note:String(e.note||'').slice(0,200),at:e.at,by:String(e.by||''),byId:String(e.byId||'')}));
}
