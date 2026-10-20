/* =====================================================================
   erp/inventory/sheets  ·  inventory-1.0
   Склад листов стекла: сколько лежит на пирамиде и сколько свободно —
   по каждому стеклу + размеру листа.
   IN : приёмки Purchasing (DB.purchaseReceipt), раскрои батчей
        (DB.cutPlan), сканы CUT (DB.stationScan — лист записан в скане),
        лопнувшие листы (DB.sheetBreak), пересчёты и списания
        (DB.inventoryEvent), минимумы (DB.inventoryMin)
   OUT: invSheetRows() — строки склада, invMoves() — журнал движений;
        команды invCountSave, invWriteOff, invSetMin, invBreakUndo

   Владелец, 14 октября 2026 (docs/ЗАДАЧА_ИНВЕНТАРИЗАЦИЯ.md):
   · On rack — физически на пирамиде: + приход, − порезанный лист (первый
     скан CUT любого стекла с него), − лопнувший на столе;
   · Free — свободно: On rack минус листы собранных раскроев, которые ещё
     не резали («по Build»). Reserved = On rack − Free;
   · приход — только реальные листы: в листах — пришло − бой; в блоках —
     вписанные Sheets − бой, пока Sheets пустое — 0 и «Enter sheets»;
   · пересчёт вводит офис, разница — запись «было → стало», кто и когда;
     до первого пересчёта строка — Not counted;
   · минимум — вручную, Free ниже минимума — красным;
   · «всё флексибл и без кирпичей»: отрицательный остаток разрешён,
     ошибка исправляется встречной записью, а не удалением;
   · стекло без «We cut it» (COG) на склад не идёт.
   Ответы владельца 14.10: пересчитывает оптимизатор с галочкой Inventory;
   «каталог = то, что на складе» — в пересчёте все стёкла каталога сразу;
   размер — из точек поставки Master Data, где его нет — базовый 130 × 96
   («в будущем я поправлю все»).

   Остаток не хранится числом — он считается из фактов, как балансы
   Purchasing: отмена приёмки, Unbatch, Reset и пересборка раскроя сами
   исправляют склад. Порезанный лист остаётся расходом и после Reset,
   Unbatch и Delete заказа: скан CUT записывает лист раскладки, с которого
   режут (invScanSheet), — Reset убирает листы из раскладки, а лист уже
   порезан. Вернуть лист может только Undo самого скана (отсканировали по
   ошибке — значит, не резали).
   ===================================================================== */
DEFAULT.inventoryEvent=[];DEFAULT.inventoryMin={};
const INV_BASE_SHEET={w:130,h:96};
const INV_WRITE_OFF=['Broken on rack','Defect','Other'];
/* Записи журнала склада: пересчёт и списание листов; кусок S- не найден
   при пересчёте и найден снова (erp/inventory/offcuts). */
const INV_EVENT_KINDS=['count','writeoff','offcut-lost','offcut-found'],INV_SHEET_KINDS=['count','writeoff'];
const INV_STATUSES=['OK','Below minimum','Negative','Not counted','Size missing'];
const INV_KEY_RE=/^[^|]+\|(\d+(\.\d+)?x\d+(\.\d+)?|\?)$/;

/* Размер листа лёжа: длинная × короткая, 1/16″ — как ключ размера в
   журнале листов Optimization → Sheets (erp/production/sheet-usage). */
function invSize(w,h){w=+w;h=+h;if(!(w>0&&h>0))return null;return {w:cutGrid16(Math.max(w,h)),h:cutGrid16(Math.min(w,h))};}
/* Лист раскладки с Offset (стол Maver) меньше со всех краёв; на складе это
   тот же лист настоящего размера (владелец, 14.10.2026: «в саму
   инвентаризацию не повлияет»). */
function invPlanSize(z){const i=z&&+z.inset>0?+z.inset:0;return z?invSize(+z.w+2*i,+z.h+2*i):null;}
function invKey(code,size){return String(code||'').trim().toUpperCase()+'|'+(size?size.w+'x'+size.h:'?');}
function invSizeText(r){return r.w>0?frac16(r.w)+' × '+frac16(r.h):'Size missing';}
/* COG и стекло клиента (галочка «We cut it» снята) на складе не лежат. */
function invGlassCut(code){const g=glassProductByCode(code);return !(g&&g.cut===false);}
function invPersist(fn){
 if(!accessCan('inventory'))return {ok:false,error:'Inventory access is required.'};
 return storageCommand(fn);
}

/* Размеры каталога: точки поставки стекла, без них — базовый 130 × 96. */
function invCatalogSizes(code){
 const seen=new Set(),out=[];
 glassSheetsFor(code).filter(s=>s&&s.availability!=='inactive').forEach(s=>{const z=invSize(s.sheetWIn,s.sheetHIn);if(z&&!seen.has(z.w+'x'+z.h)){seen.add(z.w+'x'+z.h);out.push(z);}});
 return out.length?out:[invSize(INV_BASE_SHEET.w,INV_BASE_SHEET.h)];
}

/* ---------------------------------------------------------------------
   Лист раскладки, с которого режут стекло. Записывается в скан CUT в
   момент скана (erp/shopfloor/scan): раскладка потом может смениться
   (Reset, Build), а лист уже порезан. stock — кусок S- со стеллажа: это не
   купленный лист, склад листов его не считает.
   --------------------------------------------------------------------- */
function invScanSheet(entry,piece){
 const b=entry&&entry.batch,plan=b&&typeof cutPlanFor==='function'?cutPlanFor(b.number):null;
 if(!plan||plan.reset||!Array.isArray(plan.groups))return null;
 const hit=cutFind(plan,piece);if(!hit)return null;
 const z=hit.sheet.size||hit.group.sheet||{},n=invPlanSize(z)||{};
 return invScanSheetClean({batch:b.number,plan:plan.at||'',no:hit.sheet.no,anchor:invSheetAnchor(hit.sheet),glass:hit.group.glass,w:n.w,h:n.h,stock:/^S-/.test(z.key||'')?z.key:''});
}
/* Лист узнаём по его стёклам, а не по номеру: перенос листа в другой батч и
   удаление листа перенумеровывают остальные (аудит 15.10.2026). anchor —
   первое по номеру стекло листа. */
function invSheetAnchor(sheet){return (sheet.pieces||[]).map(p=>p.piece).sort()[0]||'';}
function invScanSheetClean(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.batch!=='string'||!x.batch||!(Number.isInteger(x.no)&&x.no>0)||typeof x.glass!=='string'||!x.glass||!(+x.w>0&&+x.h>0))return null;
 return Object.assign({batch:x.batch,plan:typeof x.plan==='string'?x.plan:'',no:x.no,glass:x.glass,w:+x.w,h:+x.h},typeof x.anchor==='string'&&x.anchor?{anchor:x.anchor}:{},typeof x.stock==='string'&&/^S-/.test(x.stock)?{stock:x.stock}:{});
}

/* Строки приёмок, которые несут листы на склад. */
function invReceiptLines(){
 const out=[];
 (DB.purchaseReceipt||[]).forEach(r=>{
  if(r.voidAt)return;
  r.lines.forEach(l=>{
   if(!['glass','sheet'].includes(l.kind))return;
   const g=purGlassProduct(l),code=g?g.code:l.productCode;if(!code||!invGlassCut(code))return;
   const unit=purUnit(l.unit),size=invSize(l.widthIn,l.heightIn);
   let qty=0,issue='';
   /* 0 блоков — листов не ждём (аудит 19.10.2026, F05). */
   if(unit==='block'){if(l.actualSheets==null&&l.qty!==0)issue='Enter sheets';else qty=(l.actualSheets||0)-(l.damagedSheets||0);}
   else if(unit==='sheet')qty=(l.qty||0)-purBroken(l,l);
   else issue='Not in sheets';
   out.push({r,l,code,size,qty,issue,day:r.date||salesListIsoDay(r.createdAt),at:r.createdAt||''});
  });
 });
 return out;
}

/* Сканы CUT, которые считаются резом. Скан, снятый Unbatch или Delete
   заказа, — всё равно рез: стекло порезано, лист ушёл; Undo скана — нет. */
function invCutScans(){
 const cut=stationCutCode(),unbatched=new Set();
 (DB.productionUnbatch||[]).forEach(u=>(u.scanIds||[]).forEach(id=>unbatched.add(id)));
 return (DB.stationScan||[]).filter(s=>s.station===cut&&!s.park&&(!s.undoneAt||unbatched.has(s.id)));
}
function invCutByPiece(scans){const m=new Map();scans.forEach(s=>{if(!m.has(s.piece))m.set(s.piece,[]);m.get(s.piece).push(s);});return m;}
/* Первый рез с листа этой раскладки: скан его стекла, записанный при ней
   (старый скан без записи листа — по стеклу). */
function invSheetCutScan(plan,sheet,byPiece){
 let first=null;
 (sheet.pieces||[]).forEach(p=>(byPiece.get(p.piece)||[]).forEach(s=>{if(s.sheet&&(s.sheet.batch!==plan.batch||s.sheet.plan!==(plan.at||'')))return;if(!first||s.at<first.at)first=s;}));
 return first;
}
/* Порезанные листы: лист раскладки, с которого отсканировали на CUT хоть
   одно стекло, — один раз на лист (батч, сборка раскроя, первое стекло
   листа). Скан без записанного листа (до inventory-1.0) или без anchor
   берёт лист из текущей раскладки. */
function invCutSheets(scans){
 scans=scans||invCutScans();
 let index=null;
 const fromPlan=piece=>{
  if(!index){index=new Map();(DB.cutPlan||[]).forEach(plan=>{if(!plan||plan.reset||!Array.isArray(plan.groups))return;
   plan.groups.forEach(g=>g.sheets.forEach(s=>{const z=s.size||g.sheet||{},n=invPlanSize(z)||{};s.pieces.forEach(p=>index.set(p.piece,invScanSheetClean({batch:plan.batch,plan:plan.at||'',no:s.no,anchor:invSheetAnchor(s),glass:g.glass,w:n.w,h:n.h,stock:/^S-/.test(z.key||'')?z.key:''})));}));});}
  return index.get(piece)||null;
 };
 const out=new Map();
 scans.forEach(s=>{
  let sh=s.sheet;
  if(!sh)sh=fromPlan(s.piece);
  else if(!sh.anchor){const f=fromPlan(s.piece);if(f&&f.batch===sh.batch&&f.plan===sh.plan)sh=Object.assign({},sh,{anchor:f.anchor});}
  if(!sh)return;
  const id=sh.batch+'|'+sh.plan+'|'+(sh.anchor||'#'+sh.no),cur=out.get(id);
  if(!cur||s.at<cur.at)out.set(id,Object.assign({},sh,{id,at:s.at,by:s.by}));
 });
 return out;
}
/* Листы собранных раскроев, которые ещё не резали: на листе есть живое
   стекло батча без реза, и с листа ещё ничего не сканировали. Лист, на
   котором всё стекло уже порезано раньше (раскрой собрали заново после
   Reset), не резервируется: его листы уже ушли. */
function invReservedSheets(byPiece){
 const out=[];
 (DB.cutPlan||[]).forEach(plan=>{
  if(!plan||plan.reset||!Array.isArray(plan.groups))return;
  const b=glassBatchFind(plan.batch);if(!b)return;
  const live=new Map(glassBatchActiveItems(b).map(i=>[i.piece,i]));
  plan.groups.forEach(g=>g.sheets.forEach(s=>{
   const z=s.size||g.sheet||{},size=invPlanSize(z);
   if(!size||/^S-/.test(z.key||'')||invSheetCutScan(plan,s,byPiece))return;
   if(!s.pieces.some(p=>{const i=live.get(p.piece);return i&&!i.cutStartedAt;}))return;
   out.push({batch:plan.batch,plan:plan.at||'',no:s.no,glass:g.glass,size});
  }));
 });
 return out;
}
/* Лопнувший на столе лист. Отменённый (Undo в журнале склада) — не в счёт.
   Лопнул кусок S- со стеллажа — это не лист (как в журнале листов): с
   withStock такие записи приходят с номером куска (erp/inventory/offcuts). */
function invBreaks(withStock){
 return (DB.sheetBreak||[]).map(x=>{
  const plan=cutPlanFor(x.batch),g=plan&&Array.isArray(plan.groups)&&plan.groups.find(y=>y.glass===x.glass),sh=g&&g.sheets.find(s=>s.no===x.sheet),z=sh&&(sh.size||g.sheet);
  const own=z?invPlanSize(z):null,size=invPlanSize(x)||own,stock=own&&size&&/^S-/.test(z.key||'')&&own.w===size.w&&own.h===size.h?z.key:'';
  return {x,size,stock};
 }).filter(b=>withStock||!b.stock);
}
/* Что ещё у поставщика (Held at supplier) и в пути по PO — в листах; блоки
   без числа листов в блоке остаются блоками. */
function invPurchaseWaiting(){
 const out=[];
 [true,false].forEach(held=>purWaitingRows(held).forEach(({l,b,replace})=>{
  if(!['glass','sheet'].includes(l.kind))return;
  const g=purGlassProduct(l),code=g?g.code:l.productCode,size=invSize(l.widthIn,l.heightIn);if(!code||!size||!invGlassCut(code))return;
  const qty=replace?b.replaceLeft:b.remaining,unit=purUnit(replace?b.replaceUnit:l.unit);if(qty==null||qty<=0)return;
  const per=purNumber(l.sheetsPerBlock),sheets=unit==='sheet'?qty:unit==='block'&&per!=null?qty*per:null;
  out.push({code,size,held,sheets:sheets||0,blocks:unit==='block'&&sheets==null?qty:0});
 }));
 return out;
}

/* ------------------------------ Строки ------------------------------ */
function invSheetRows(){
 const rows=new Map();
 const row=(code,size)=>{
  const key=invKey(code,size);
  if(!rows.has(key)){const g=glassProductByCode(code);rows.set(key,{key,code:g?g.code:String(code).toUpperCase(),name:g?g.name:'',mm:g?g.thicknessMm:null,w:size?size.w:0,h:size?size.h:0,
   received:0,cut:0,broken:0,adjust:0,reserved:0,batches:new Map(),enterSheets:0,held:0,heldBlocks:0,onOrder:0,onOrderBlocks:0,lastCount:null,min:null});}
  return rows.get(key);
 };
 activeGlassProducts().filter(g=>g.cut!==false).forEach(g=>invCatalogSizes(g.code).forEach(z=>row(g.code,z)));
 invReceiptLines().forEach(x=>{const r=row(x.code,x.size);r.received+=x.qty;if(x.issue==='Enter sheets')r.enterSheets++;});
 const scans=invCutScans(),cut=invCutSheets(scans);
 cut.forEach(s=>{if(!s.stock&&invGlassCut(s.glass))row(s.glass,invSize(s.w,s.h)).cut++;});
 invReservedSheets(invCutByPiece(scans)).forEach(s=>{const r=row(s.glass,s.size);r.reserved++;r.batches.set(s.batch,(r.batches.get(s.batch)||0)+1);});
 invBreaks().forEach(b=>{if(!b.x.undoneAt&&invGlassCut(b.x.glass))row(b.x.glass,b.size).broken++;});
 (DB.inventoryEvent||[]).filter(e=>INV_SHEET_KINDS.includes(e.kind)).forEach(e=>{const r=row(e.glass,invSize(e.w,e.h));r.adjust+=e.qty;if(e.kind==='count'&&(!r.lastCount||e.at>r.lastCount.at))r.lastCount=e;});
 Object.entries(DB.inventoryMin||{}).forEach(([key,n])=>{const [code,dim]=key.split('|'),[w,h]=dim.split('x');row(code,invSize(w,h)).min=n;});
 invPurchaseWaiting().forEach(x=>{const r=row(x.code,x.size);if(x.held){r.held+=x.sheets;r.heldBlocks+=x.blocks;}else{r.onOrder+=x.sheets;r.onOrderBlocks+=x.blocks;}});
 return [...rows.values()].map(r=>{
  r.onRack=r.received-r.cut-r.broken+r.adjust;r.free=r.onRack-r.reserved;r.sizeMissing=!r.w;
  r.status=r.sizeMissing?'Size missing':!r.lastCount?'Not counted':r.free<0?'Negative':r.min!=null&&r.free<r.min?'Below minimum':'OK';
  return r;
 }).sort((a,b)=>a.code.localeCompare(b.code)||b.w-a.w||b.h-a.h);
}
function invRowFind(key){return invSheetRows().find(r=>r.key===key)||null;}
/* Подсказка раскроя (PR 3): сколько листов батч ещё возьмёт с пирамиды и
   сколько свободно без него — «need 5 · free 2». Владелец, 14.10.2026:
   Build при нехватке только предупреждает. Ключ — размер «ДЛИНАxШИРИНА». */
function invBatchSheetHints(batch,glass){
 const out=new Map(),code=String(glass||'').toUpperCase();
 invSheetRows().forEach(r=>{if(r.code.toUpperCase()!==code||r.sizeMissing)return;const mine=r.batches.get(batch)||0;out.set(r.w+'x'+r.h,{need:mine,free:r.free+mine,counted:!!r.lastCount});});
 return out;
}

/* ------------------------------ Журнал ------------------------------
   Все движения листов. rack — сколько листов прибавилось (+) или ушло (−)
   с пирамиды; layout — листов в раскрое батча (Build ничего не снимает с
   пирамиды, он занимает листы). */
function invMoves(){
 const out=[],add=(m,code,size)=>{const g=glassProductByCode(code);out.push(Object.assign({code:g?g.code:String(code).toUpperCase(),name:g?g.name:'',key:invKey(code,size),w:size?size.w:0,h:size?size.h:0,rack:null,layout:null,by:'',note:''},m));};
 invReceiptLines().forEach(x=>add({id:'GR|'+x.r.id+'|'+x.l.id,kind:'Receipt',ref:x.r.number,receipt:x.r.id,day:x.day,at:x.at,rack:x.issue?0:x.qty,by:x.r.receivedBy||x.r.createdBy,note:x.issue||(x.l.replacement?'Replacement':'')},x.code,x.size));
 (DB.cutPlan||[]).forEach(plan=>{
  if(!plan||plan.reset||!Array.isArray(plan.groups)||!glassBatchFind(plan.batch))return;
  plan.groups.forEach(g=>{if(!invGlassCut(g.glass))return;const by=new Map();
   g.sheets.forEach(s=>{const z=s.size||g.sheet||{},size=invPlanSize(z);if(!size||/^S-/.test(z.key||''))return;const k=size.w+'x'+size.h;if(!by.has(k))by.set(k,{size,n:0});by.get(k).n++;});
   by.forEach(({size,n})=>add({id:'B|'+plan.batch+'|'+g.glass+'|'+size.w+'x'+size.h,kind:'Build',ref:plan.batch,batch:plan.batch,day:salesListIsoDay(plan.at),at:plan.at||'',layout:n,note:n+' sheet'+(n===1?'':'s')+' in layout'},g.glass,size));
  });
 });
 invCutSheets().forEach(s=>{if(s.stock||!invGlassCut(s.glass))return;add({id:'C|'+s.id,kind:'Cut',ref:s.batch+' · sheet '+s.no,batch:s.batch,day:salesListIsoDay(s.at),at:s.at,rack:-1,by:s.by},s.glass,invSize(s.w,s.h));});
 invBreaks().forEach(({x,size})=>{if(!invGlassCut(x.glass))return;
  add({id:'SB|'+x.id,kind:'Sheet broke',ref:x.batch+' · sheet '+x.sheet,batch:x.batch,breakId:x.id,undone:!!x.undoneAt,day:salesListIsoDay(x.at),at:x.at,rack:-1,by:x.by},x.glass,size);
  if(x.undoneAt)add({id:'SBU|'+x.id,kind:'Undo sheet broke',ref:x.batch+' · sheet '+x.sheet,batch:x.batch,day:salesListIsoDay(x.undoneAt),at:x.undoneAt,rack:1,by:x.undoneBy},x.glass,size);
 });
 (DB.inventoryEvent||[]).filter(e=>INV_SHEET_KINDS.includes(e.kind)).forEach(e=>add({id:e.id,kind:e.kind==='count'?'Count':'Write off',ref:'',day:salesListIsoDay(e.at),at:e.at,rack:e.qty,by:e.by,
  note:e.kind==='count'?'Was '+e.before+' → '+e.after:[e.reason,e.note].filter(Boolean).join(' · ')},e.glass,invSize(e.w,e.h)));
 if(typeof invOffcutMoves==='function')invOffcutMoves().forEach(m=>out.push(m));
 return out.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
}

/* ------------------------------ Команды ------------------------------ */
/* Больше 10 000 листов в одной строке не бывает: вся инвентаризация — до
   10 000, обычно 1000–1700; приёмка — двух-, максимум трёхзначные (владелец,
   20.10.2026). Лишние цифры — отказ, а не тихо изменённое число (аудит INV04). */
const INV_SHEETS_MAX=10000;
function invWhole(v,label){
 const s=String(v==null?'':v).trim(),n=Number(s);
 if(!s||!Number.isInteger(n)||n<0)throw new Error(label+': enter a whole number, 0 or more.');
 if(n>INV_SHEETS_MAX)throw new Error(label+': up to 10,000.');
 return n;
}
/* Пересчёт: counts — {ключ: сколько насчитали}. Одна команда на все
   строки; разница с On rack в момент записи — встречная запись. */
function invCountSave(counts){
 return invPersist(()=>{
  const rows=new Map(invSheetRows().map(r=>[r.key,r])),now=new Date().toISOString(),actor=orderLogActor(),out=[];
  Object.entries(counts||{}).forEach(([key,v])=>{
   const r=rows.get(key);if(!r||r.sizeMissing)throw new Error('Glass or sheet size not found. Reopen the count.');
   const n=invWhole(v,r.code+' '+invSizeText(r));
   const e={id:salesUid('IE'),kind:'count',glass:r.code,w:r.w,h:r.h,qty:n-r.onRack,before:r.onRack,after:n,reason:'',note:'',at:now,by:actor.by,byId:actor.byId};
   DB.inventoryEvent.push(e);out.push(e);
  });
  if(!out.length)throw new Error('Enter at least one count.');
  return out;
 });
}
function invWriteOff(key,qty,reason,note){
 return invPersist(()=>{
  const r=invRowFind(key);if(!r||r.sizeMissing)throw new Error('Glass or sheet size not found.');
  const n=invWhole(qty,'Sheets');if(!n)throw new Error('Sheets: enter 1 or more.');
  if(!INV_WRITE_OFF.includes(reason))throw new Error('Choose a reason.');
  const actor=orderLogActor(),e={id:salesUid('IE'),kind:'writeoff',glass:r.code,w:r.w,h:r.h,qty:-n,before:null,after:null,reason,note:String(note||'').trim().slice(0,200),at:new Date().toISOString(),by:actor.by,byId:actor.byId};
  DB.inventoryEvent.push(e);return e;
 });
}
function invSetMin(key,v){
 return invPersist(()=>{
  const r=invRowFind(key);if(!r||r.sizeMissing)throw new Error('Glass or sheet size not found.');
  if(String(v==null?'':v).trim()===''){delete DB.inventoryMin[key];return null;}
  const n=invWhole(v,'Minimum');DB.inventoryMin[key]=n;return n;
 });
}
/* Undo Sheet broke: запись слома остаётся, рядом — кто и когда отменил;
   лист вернулся на пирамиду (владелец откладывал отмену слома до склада,
   02.10.2026). */
function invBreakUndo(id){
 return invPersist(()=>{
  const x=(DB.sheetBreak||[]).find(b=>b.id===id);if(!x)throw new Error('Sheet break not found.');
  if(x.undoneAt)throw new Error('Already undone.');
  const actor=orderLogActor();x.undoneAt=new Date().toISOString();x.undoneBy=actor.by;x.undoneById=actor.byId;return x;
 });
}

/* --------------------------- Хранение --------------------------- */
function invEventClean(e){
 const n=v=>v==null||v===''?null:Number(v);
 return {id:String(e.id),kind:e.kind,glass:String(e.glass).trim().toUpperCase(),w:cutGrid16(Math.max(+e.w,+e.h)),h:cutGrid16(Math.min(+e.w,+e.h)),qty:Number(e.qty),
  before:e.kind==='count'?n(e.before):null,after:e.kind==='count'?n(e.after):null,reason:String(e.reason||'').slice(0,80),note:String(e.note||'').slice(0,200),at:String(e.at),by:String(e.by||'').slice(0,80),byId:String(e.byId||'').slice(0,80),
  ...(INV_SHEET_KINDS.includes(e.kind)?{}:{offcut:e.offcut})};
}
function invEventValid(e){return !!(e&&typeof e==='object'&&!Array.isArray(e)&&typeof e.id==='string'&&e.id&&INV_EVENT_KINDS.includes(e.kind)&&(INV_SHEET_KINDS.includes(e.kind)||stockIdValid(e.offcut))&&typeof e.glass==='string'&&e.glass.trim()&&+e.w>0&&+e.h>0&&Number.isFinite(Number(e.qty))&&typeof e.at==='string'&&!Number.isNaN(Date.parse(e.at)));}
function invMinValid(k,v){return INV_KEY_RE.test(k)&&!k.endsWith('|?')&&Number.isInteger(v)&&v>=0;}
function normalizeInventory(){
 const ids=new Set();
 DB.inventoryEvent=(Array.isArray(DB.inventoryEvent)?DB.inventoryEvent:[]).filter(e=>invEventValid(e)&&!ids.has(e.id)&&(ids.add(e.id),true)).map(invEventClean);
 const src=DB.inventoryMin&&typeof DB.inventoryMin==='object'&&!Array.isArray(DB.inventoryMin)?DB.inventoryMin:{},min={};
 Object.keys(src).forEach(k=>{if(invMinValid(k,src[k]))min[k]=src[k];});DB.inventoryMin=min;
}
function validateInventoryPayload(src){
 if(Array.isArray(src.inventoryEvent)){const ids=new Set();src.inventoryEvent.forEach((e,i)=>{if(!invEventValid(e)||ids.has(e.id))throw new Error('Inventory journal row '+(i+1)+': invalid or duplicate record.');ids.add(e.id);});}
 if(src.inventoryMin!=null){
  if(typeof src.inventoryMin!=='object'||Array.isArray(src.inventoryMin))throw new Error('The "inventoryMin" field must be an object.');
  Object.keys(src.inventoryMin).forEach(k=>{if(!invMinValid(k,src.inventoryMin[k]))throw new Error('Inventory minimum "'+k+'": invalid.');});
 }
}
