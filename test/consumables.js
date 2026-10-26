/* Склад расходников обвязки (план Master Data, задача 6; владелец
   23.10.2026): резерв на Save заказа, расход на скане сборки IGU, Undo
   скана возвращает; повторный Save не списывает дважды; приход строкой
   Stock приёмки — в единице склада или упаковками («в упаковке» из
   карточки); пересчёт пишет разницу — отход по факту. Аудит 25.10.2026:
   Cancel units снимает резерв (I-3), нехватка раньше «Not counted» (I-5),
   несохранённый пересчёт не теряется молча (I-6), неактивная карточка с
   пересчётом остаётся в списке (I-7). */
module.exports=async function({page,eq}){
 console.log('consumables stock');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.csReset=function(){oqReset();DB.consumableEvent=[];DB.purchaseReceipt=[];DB.purchaseReceiptSeq=0;consCountDraft={};consNotice='';
   if(!window.csSup)window.csSup=purSupplierSave({name:'Spacer Supply Co'}).value;};
  window.csSpacer=()=>consRows().find(r=>r.table==='spacerVariant'&&r.reserved>0);
  window.csRow=k=>{const r=consRows().find(x=>x.key===k);return r&&{received:+r.received.toFixed(3),used:+r.used.toFixed(3),reserved:+r.reserved.toFixed(3),onHand:+r.onHand.toFixed(3),status:r.status};};
  window.csRec=(key,qty,unit)=>{const i=key.indexOf(':');return purFulfilSave('receipt',{supplierId:csSup.id,date:'2026-10-23',lines:[{id:'L0',kind:'stock',table:key.slice(0,i),itemId:key.slice(i+1),qty,unit}]});};
  window.csScan=(pieces,unit,asm)=>pieces.forEach(p=>DB.stationScan.push({id:stationScanNextId(),at:new Date().toISOString(),piece:p,station:'IGU',by:'QA',byId:'',asm,unit}));
 });

 eq('Save reserves the recipe for every unit; a quote reserves nothing; Save again does not count twice',await t.p.evaluate(()=>{
  csReset();const q=oqOrder(oqCustomer({}),{kind:'quote'});const none=consRows().every(r=>r.reserved===0);
  const id=oqOrder(oqCustomer({}));const o=salesRecord(id),r=csSpacer();
  const want=o.lines.reduce((s,l)=>s+consPerUnit(l,o).get(r.key)*l.qty,0);
  soDraft=null;soEdit=null;salesOrderEdit(id);salesOrderSave();soDraft=null;soEdit=null;
  return {none,unit:r.unit,match:Math.abs(r.reserved-want)<1e-9,again:Math.abs(csSpacer().reserved-want)<1e-9,status:r.status,quote:!!q};
 }),{none:true,unit:'ft',match:true,again:true,status:'Short',quote:true});

 eq('IGU scan of a unit moves its recipe from reserved to used; Undo of the scan gives it back',await t.p.evaluate(()=>{
  csReset();const id=oqOrder(oqCustomer({}));oqThrough(id,'verified');const o=salesRecord(id);glassBatchAssign(glassBatchRows([o]),{});
  const k=csSpacer().key,before=csRow(k),per=+consPerUnit(o.lines[0],o).get(k).toFixed(3);
  const ids=DB.glassPiece.filter(p=>p.key.split('|')[1]===o.lines[0].id).map(p=>p.ids[0]);
  csScan(ids,1,'SC-9000001');const after=csRow(k);
  DB.stationScan.forEach(s=>{s.undoneAt=new Date().toISOString();});const undone=csRow(k);
  return {used:after.used===per,reserved:+(before.reserved-after.reserved).toFixed(3)===per,onHand:after.onHand===-per,undone:undone.used===0&&undone.reserved===before.reserved};
 }),{used:true,reserved:true,onHand:true,undone:true});

 eq('Cancel units frees the reserve of units not built; a built unit cancelled later stays used',await t.p.evaluate(()=>{
  csReset();const id=oqOrder(oqCustomer({}));oqThrough(id,'verified');const o=salesRecord(id);glassBatchAssign(glassBatchRows([o]),{});
  const l=o.lines[0],k=csSpacer().key,per=consPerUnit(l,o).get(k),r0=csRow(k).reserved,fx=v=>+v.toFixed(3);
  csScan(DB.glassPiece.filter(p=>p.key.split('|')[1]===l.id).map(p=>p.ids[0]),1,'SC-9000002');const built=csRow(k);
  const one=unitCancel(id,l.id,1,'Not needed',{chargeOverride:0}),a=csRow(k);
  const two=unitCancel(id,l.id,1,'Not needed',{chargeOverride:0}),b=csRow(k);
  return {qty:l.qty,built:built.reserved===fx(r0-per),one:one.ok&&a.reserved===fx(r0-2*per)&&a.used===fx(per),two:two.ok&&b.reserved===a.reserved&&b.used===fx(per),errors:[one.error||'',two.error||'']};
 }),{qty:2,built:true,one:true,two:true,errors:['','']});

 eq('receipt in the stock unit counts as is; a box without Per pack warns; Per pack converts it',await t.p.evaluate(()=>{
  csReset();oqOrder(oqCustomer({}));const k=csSpacer().key;
  csRec(k,500,'ft');const ft=csRow(k).received;csRec(k,2,'box');const miss=csRow(k);
  const set=consSetPack(k,'1880');const boxed=csRow(k);const bad=consSetPack(k,'-1');
  return {ft,missReceived:miss.received,miss:miss.status,set:set.ok,boxed:boxed.received,bad:bad.error};
 }),{ft:500,missReceived:500,miss:'Pack size missing',set:true,boxed:500+2*1880,bad:'Per pack: enter 0 or more.'});

 eq('count writes the difference as waste by fact; free below zero is Short, never blocked',await t.p.evaluate(()=>{
  csReset();oqOrder(oqCustomer({}));const k=csSpacer().key;csRec(k,30,'ft');
  const r=consCountSave({[k]:'20'});const e=r.value[0],a=csRow(k);
  const empty=consCountSave({}).error,neg=consCountSave({[k]:'-5'}).error;
  return {ok:r.ok,qty:e.qty,before:e.before,after:e.after,onHand:a.onHand,shown:a.status,empty,neg:neg.endsWith(': enter 0 or more.')};
 }),{ok:true,qty:-10,before:30,after:20,onHand:20,shown:'Short',empty:'Enter at least one count.',neg:true});
 await t.p.evaluate(()=>{csReset();oqOrder(oqCustomer({}));window.csK=csSpacer().key;tab='inventory';invGo('consumables');});
 const sel=k=>'[data-cons-row="'+k+'"]',k=await t.p.evaluate(()=>csK);
 await t.p.fill(sel(k)+' [data-cons-pack]','1880');await t.p.dispatchEvent(sel(k)+' [data-cons-pack]','change');
 await t.p.fill(sel(k)+' [data-cons-count]','12');await t.p.click('[data-cons-count-save]');
 eq('Inventory → Consumables: Per pack goes to the card, Save count books the difference; the table shows it',await t.p.evaluate(k=>{const row=document.querySelector('[data-cons-row="'+k+'"]');
  return {pack:mdById('spacerVariant',k.split(':')[1]).packQty,events:DB.consumableEvent.length,onHand:row.querySelector('[data-cons-onHand]').textContent,status:row.querySelector('.pill').textContent,draft:row.querySelector('[data-cons-count]').value,error:consNotice};
 },k),{pack:1880,events:1,onHand:'12 ft',status:'Short',draft:'',error:''});

 eq('an unsaved consumables count asks before Inventory moves on; Cancel keeps it',await t.p.evaluate(k=>{
  const c=window.confirm,asked=[];let answer=false;window.confirm=m=>{asked.push(m);return answer;};
  try{
   const box=()=>document.querySelector('[data-cons-row="'+k+'"] [data-cons-count]');
   box().value='17';box().dispatchEvent(new Event('input'));const unsaved=window.STORAGE_UNSAVED.some(f=>f());
   invGo('sheets');const kept={view:invView,value:box()&&box().value};
   answer=true;invGo('sheets');
   return {unsaved,asked,kept,left:invView,draft:consCountDirty()};
  }finally{window.confirm=c;}
 },k),{unsaved:true,asked:['Discard counts you have not saved?','Discard counts you have not saved?'],kept:{view:'consumables',value:'17'},left:'sheets',draft:false});

 eq('an inactive consumable with a count keeps its row, marked inactive',await t.p.evaluate(()=>{
  csReset();const sp=DB.spacerVariant.find(x=>x.active!==false&&!consRows().find(r=>r.key===consKey('spacerVariant',x.id)&&(r.received||r.used||r.reserved))),k=consKey('spacerVariant',sp.id);
  consCountSave({[k]:'17'});sp.active=false;const r=consRows().find(x=>x.key===k);
  tab='inventory';invGo('consumables');const pill=document.querySelector('[data-cons-row="'+k+'"] .pill.warn');sp.active=true;
  return {row:!!r&&r.onHand,off:!!r&&r.off,pill:pill&&pill.textContent};
 }),{row:17,off:true,pill:'inactive'});
};
