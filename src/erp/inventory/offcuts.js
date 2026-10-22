/* =====================================================================
   erp/inventory/offcuts  ·  inventory-1.1
   Остатки S- на стеллаже: где сейчас каждый кусок, пересчёт «Not found»
   и «Found».
   IN : DB.stockOffcut (erp/production/stock-offcuts), раскрои батчей
        (DB.cutPlan), порезанные листы (invCutSheets), лопнувшие листы
        (invBreaks), записи склада (DB.inventoryEvent)
   OUT: invOffcutRows() — куски со статусом, invOffcutMoves() — их движения
        в журнале склада; команды invOffcutLost, invOffcutFound

   Владелец, 14 октября 2026: остатки S- — своя часть Inventory, «так же,
   как и самих листов»: дашборд (штук, ft², по стеклу, возраст на
   стеллаже) и пересчёт — отметить «not found» → списан (кто, когда).
   Ответы владельца в начале PR 2: кусок лежит на стеллаже после реза
   листа, из которого он вырезан, до этого он «Coming»; списанный и снова
   найденный кусок возвращает кнопка Found (встречная запись);
   Optimization → Stock остаётся как есть.

   Статус не хранится, а считается, как у листов. Кусок, взятый в раскрой
   как лист, в DB.stockOffcut остаётся «stock» (Optimization → Stock
   показывает «In B-…» и после реза) — склад видит, что его лист порезан
   (скан CUT записывает кусок, invScanSheet), и кусок ушёл.
   ===================================================================== */
const INV_OFFCUT_HERE=['On rack','In batch'];
const INV_OFFCUT_STATUSES=['On rack','In batch','Coming','Used','Broken','Written off','Back to waste'];
function invDays(from,to){const a=Date.parse(from),b=to?Date.parse(to):Date.now();return Number.isNaN(a)?null:Math.max(0,Math.floor((b-a)/864e5));}

/* Лист, из которого вырезан кусок, порезан? Кусок лежит в стоке листа
   текущей раскладки — смотрим, сканировали ли этот лист. В раскладке его
   нет — он остался в стоке после Reset, потому что лист уже порезали
   (v5.166), или раскроя нет совсем (старые данные): кусок на стеллаже. */
function invOffcutSource(r,cut,byPiece){
 const plan=cutPlanFor(r.batch),groups=plan&&Array.isArray(plan.groups)?plan.groups:[];
 const sh=groups.flatMap(g=>g.sheets).find(s=>(s.stock||[]).some(x=>x.id===r.id));
 if(sh&&!plan.reset){const c=invSheetCutScan(plan,sh,byPiece);return {cut:!!c,at:c?c.at:'',by:c?c.by:''};}
 const c=[...cut.values()].filter(x=>x.batch===r.batch&&x.no===(sh?sh.no:r.sheet)&&x.plan<=r.at).sort((a,b)=>String(a.at).localeCompare(String(b.at)))[0];
 return c?{cut:true,at:c.at,by:c.by}:{cut:!sh,at:'',by:''};
}
/* Куда кусок взят: лежит листом в раскрое батча или отмечен в SHEETS ещё не
   собранного раскроя. Отмечен, а собранный раскрой его не взял (укладчик
   берёт кусок, только если так уходит меньше ft²) — кусок свободен на
   стеллаже (аудит 15.10.2026: он навсегда значился «In B-…»). */
function invOffcutClaims(){
 const out=new Map();
 (DB.cutPlan||[]).forEach(p=>{
  if(!p||!glassBatchFind(p.batch))return;
  if(p.reset)Object.keys(p.sheetPick||{}).forEach(glass=>((p.sheetPick[glass]||{}).sizes||[]).forEach(x=>{if(x&&/^S-/.test(x.key)&&x.off===false&&!out.has(x.key))out.set(x.key,p.batch);}));
  if(!p.reset)(p.groups||[]).forEach(g=>g.sheets.forEach(s=>{if(s.size&&/^S-/.test(s.size.key||''))out.set(s.size.key,p.batch);}));
 });
 return out;
}
function invOffcutEvents(){
 const m=new Map();
 (DB.inventoryEvent||[]).filter(e=>e.offcut).sort((a,b)=>String(a.at).localeCompare(String(b.at))).forEach(e=>{if(!m.has(e.offcut))m.set(e.offcut,[]);m.get(e.offcut).push(e);});
 return m;
}
function invOffcutRows(){
 const scans=invCutScans(),cut=invCutSheets(scans),byPiece=invCutByPiece(scans),used=new Map(),broken=new Map(),claims=invOffcutClaims(),events=invOffcutEvents();
 cut.forEach(c=>{if(c.stock&&!used.has(c.stock))used.set(c.stock,c);});
 invBreaks(true).forEach(b=>{if(b.stock&&!b.x.undoneAt&&!broken.has(b.stock))broken.set(b.stock,b.x);});
 /* Факты из записей, ушедших в архив (erp/archive): берутся, только если
    своих в работе нет — новый скан или бой их перекрывают. */
 const arch=DB.inventoryArchived&&DB.inventoryArchived.offcuts||{};
 return (DB.stockOffcut||[]).map(r=>{
  const a=arch[r.id]||{},ev=events.get(r.id)||[],last=ev[ev.length-1],u=used.get(r.id)||a.used||undefined,b=broken.get(r.id)||a.broken||undefined;
  let src=invOffcutSource(r,cut,byPiece);if(a.onRackAt&&(!src.cut||!src.at))src={cut:true,at:a.onRackAt,by:a.onRackBy||''};
  const status=r.status==='cancelled'?'Back to waste':u?'Used':b?'Broken':last&&last.kind==='offcut-lost'?'Written off':!src.cut?'Coming':claims.has(r.id)?'In batch':'On rack';
  const here=INV_OFFCUT_HERE.includes(status),since=src.at||r.at;
  return {id:r.id,r,glass:r.glass,mm:r.mm,w:Math.max(r.w,r.h),h:Math.min(r.w,r.h),area:Math.round(r.w*r.h/144*100)/100,batch:r.batch,sheet:r.sheet,booked:r.at,
   onRackAt:src.cut?since:'',onRackBy:src.by||'',age:here?invDays(since):null,status,claim:claims.get(r.id)||'',used:u||null,broken:b||null,lost:status==='Written off'?last:null,events:ev};
 }).sort((a,b)=>(a.age==null)-(b.age==null)||(b.age||0)-(a.age||0)||a.id.localeCompare(b.id));
}
function invOffcutFind(id){return invOffcutRows().find(x=>x.id===id)||null;}

/* Журнал склада: кусок лёг на стеллаж (лист порезан), ушёл в раскрой как
   лист и порезан, лопнул, не найден, найден. rack — штуки, не листы. */
function invOffcutMoves(){
 const out=[];
 invOffcutRows().forEach(o=>{
  const g=glassProductByCode(o.glass),add=(m)=>out.push(Object.assign({code:o.glass,name:g?g.name:'',key:'offcut|'+o.id,w:o.w,h:o.h,ref:o.id,offcut:o.id,layout:null,by:'',note:''},m,{day:salesListIsoDay(m.at)}));
  if(o.onRackAt&&o.status!=='Back to waste')add({id:'OR|'+o.id,kind:'Offcut on rack',at:o.onRackAt,rack:1,batch:o.batch,by:o.onRackBy,note:'From '+o.batch+(o.sheet?' · sheet '+o.sheet:'')});
  if(o.used)add({id:'OU|'+o.id,kind:'Offcut used',at:o.used.at,rack:-1,batch:o.used.batch,by:o.used.by,note:'Cut in '+o.used.batch});
  if(o.broken)add({id:'OB|'+o.id,kind:'Offcut broke',at:o.broken.at,rack:-1,batch:o.broken.batch,by:o.broken.by,note:o.broken.batch+' · sheet '+o.broken.sheet});
  o.events.forEach(e=>add({id:e.id,kind:e.kind==='offcut-lost'?'Offcut not found':'Offcut found',at:e.at,rack:e.qty,by:e.by,note:e.note}));
 });
 return out;
}

/* Пересчёт: кусков нет на стеллаже — списаны одной командой. */
function invOffcutLost(ids,note){
 return invPersist(()=>{
  const rows=new Map(invOffcutRows().map(o=>[o.id,o])),list=[...new Set(ids||[])];
  if(!list.length)throw new Error('Tick the offcuts that are not on the rack.');
  const actor=orderLogActor(),now=new Date().toISOString();
  return list.map(id=>{
   const o=rows.get(id);if(!o)throw new Error(id+' not found in stock.');
   if(!INV_OFFCUT_HERE.includes(o.status))throw new Error(id+' is not on the rack ('+o.status.toLowerCase()+').');
   const e={id:salesUid('IE'),kind:'offcut-lost',offcut:id,glass:String(o.glass).toUpperCase()||'?',w:o.w,h:o.h,qty:-1,before:null,after:null,reason:'Not found',note:String(note||'').trim().slice(0,200),at:now,by:actor.by,byId:actor.byId};
   DB.inventoryEvent.push(e);return e;
  });
 });
}
/* Found: встречная запись к Not found, запись о списании остаётся. */
function invOffcutFound(id){
 return invPersist(()=>{
  const o=invOffcutFind(id);if(!o)throw new Error(id+' not found in stock.');
  if(o.status!=='Written off')throw new Error(id+' is not written off.');
  const actor=orderLogActor(),e={id:salesUid('IE'),kind:'offcut-found',offcut:id,glass:String(o.glass).toUpperCase()||'?',w:o.w,h:o.h,qty:1,before:null,after:null,reason:'Found',note:'',at:new Date().toISOString(),by:actor.by,byId:actor.byId};
  DB.inventoryEvent.push(e);return e;
 });
}
