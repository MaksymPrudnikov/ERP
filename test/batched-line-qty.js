/* Строка в батче, стекло не порезано (владелец, 6.10.2026): «если с 20 юнитов
   стало 16 — меняю на 16, лишнюю строку — крестиком; 4 пойдут новой линией или
   новым заказом». Лишнее стекло уходит из батча, батч подсвечен «Re-optimize».
   Порезано хоть одно стекло строки — только Cancel units. */
module.exports=async function({page,eq,ok}){
 console.log('batched-line-qty');const t=await page(undefined,{width:1440,height:1000});await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  /* Заказ в батче с раскроем: однокамерные строки [ширина, высота, qty]. */
  window.bqOrder=function(sizes){
   oqReset();DB.stationScan=[];DB.orderEvent=[];
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
   const id=oqOrder(oqCustomer({legalName:'Northside Windows Ltd'}));salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'batched');
   const n=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanRun(n);window.bqId=id;window.bqN=n;return id;
  };
  window.bqO=function(){return salesRecord(bqId);};
  window.bqGlass=function(l){return [...glassPieceMap(bqId).values()].filter(r=>r.key.split('|')[1]===l.id).map(r=>r.ids.length);};
  window.bqLive=function(){return glassBatchActiveItems(glassBatchFind(bqN)).length;};
 });
 eq('Glass not cut: the quantity of a batched line goes 20 → 16 right in the line; 4 glass leave the batch and it asks to re-optimize',await t.p.evaluate(()=>{
  bqOrder([[24,18,20],[30,20,2]]);tab='sales';salesOrderEdit(bqId);render();
  const input=document.querySelectorAll('tr[data-metrics-line-id] .line-qty')[0],open=!input.closest('td').hasAttribute('inert'),max=input.getAttribute('max');
  input.value='16';input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));
  const saved=salesOrderSave()===true,l=bqO().lines[0],stale=glassBatchStale(glassBatchFind(bqN));
  return {open,max,saved,qty:l.qty,locked:salesLineLocked(l),glass:bqGlass(l),live:bqLive(),stale:stale&&stale.text,history:glassBatchFind(bqN).history.slice(-1)[0].action,
   log:DB.orderEvent.filter(e=>e.orderId===bqId&&e.what==='Quantity changed').map(e=>e.note.replace(/B-\d+/,'B-#'))};
 }),{open:true,max:'20',saved:true,qty:16,locked:true,glass:[16],live:18,stale:'4 removed',history:'Quantity changed',log:['line 1 · 20 → 16 · 4 glass out of B-#']});
 eq('More units on a batched line: the field does not go up, and a save with more is refused — add a new line',await t.p.evaluate(()=>{
  bqOrder([[24,18,4]]);salesOrderEdit(bqId);render();const input=document.querySelector('tr[data-metrics-line-id] .line-qty');
  input.value='6';input.dispatchEvent(new Event('input'));const clamped=soDraft.lines[0].qty;
  soDraft.lines[0].qty=6;const saved=salesOrderSave();const msg=(document.getElementById('e_sales_order')||{}).textContent||'';salesDraftDrop();
  return {clamped,saved:saved===true,msg:/can only go down/.test(msg),qty:bqO().lines[0].qty};
 }),{clamped:4,saved:false,msg:true,qty:4});
 eq('Glass not cut: the × removes a batched line; its glass leaves the batch and loses its numbers',await t.p.evaluate(()=>{
  bqOrder([[24,18,3],[30,20,2]]);salesOrderEdit(bqId);render();const line2=bqO().lines[1].id;
  const del=document.querySelectorAll('tr[data-metrics-line-id] .line-delete')[1],open=!del.closest('td').hasAttribute('inert');del.click();
  const saved=salesOrderSave()===true;
  return {open,saved,lines:bqO().lines.length,glassLeft:[...glassPieceMap(bqId).keys()].some(k=>k.split('|')[1]===line2),live:bqLive(),stale:glassBatchStale(glassBatchFind(bqN)).text,
   log:DB.orderEvent.some(e=>e.orderId===bqId&&e.what==='Line removed')};
 }),{open:true,saved:true,lines:1,glassLeft:false,live:3,stale:'2 removed',log:true});
 eq('One glass of the line is cut: the line stays locked — no fewer units, no ×; that is Cancel units',await t.p.evaluate(()=>{
  bqOrder([[24,18,4]]);const piece=[...glassPieceMap(bqId).values()][0].ids[0];stationMove('CUT',stationCheck('CUT',piece),{name:'Cutter'},{});
  salesOrderEdit(bqId);render();const tr=document.querySelector('tr[data-metrics-line-id]');
  const inert=[tr.querySelector('.line-qty').closest('td').hasAttribute('inert'),tr.querySelector('.line-delete').closest('td').hasAttribute('inert')];
  soDraft.lines[0].qty=3;const fewer=salesOrderSave();const msg=(document.getElementById('e_sales_order')||{}).textContent||'';salesDraftDrop();
  return {inert,fewer:fewer===true,msg:/changed/.test(msg),qty:bqO().lines[0].qty};
 }),{inert:[true,true],fewer:false,msg:true,qty:4});
 eq('Units on hold that leave with the fewer units take their hold along; the rest stay held, nothing to cancel twice',await t.p.evaluate(()=>{
  bqOrder([[24,18,4]]);const l=bqO().lines[0];unitHold(bqId,l.id,4,'Customer checks sizes');
  salesOrderEdit(bqId);soDraft.lines[0].qty=3;const saved=salesOrderSave()===true,nl=bqO().lines[0];
  return {saved,qty:nl.qty,held:(nl.heldUnits||[]).length,cancelMax:unitCancelPlan(bqO(),nl,9,new Date().toISOString()).max};
 }),{saved:true,qty:3,held:3,cancelMax:3});
 eq('Batched line qty browser errors',t.errs,[]);await t.c.close();
};
