/* Находки аудита 5 октября 2026 (Codex, проверено Claude): формы строк между
   вкладками, стекло из стока в цеху, заказ одного склада. */
module.exports=async function({page,eq,ok}){
 console.log('audit-2026-10-05');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  /* Другая вкладка сохранила ширину первой строки: строка и её форма. */
  window.a5OtherTabWidth=(id,inches)=>{
   const other=JSON.parse(localStorage.getItem(STORAGE_KEY)),o=other.salesOrder.find(x=>x.id===id),l=o.lines[0],s=other.shapeDef.find(x=>x.id===l.shapeRef.id);
   s.w=String(inches);s.revision=(+s.revision||0)+1;l.width16=inches*16;l.shapeRef.revision=s.revision;
   const text=JSON.stringify(other);localStorage.setItem(STORAGE_KEY,text);storageLiveReload(text);
  };
  window.a5Shape=id=>{const o=salesRecord(id);return DB.shapeDef.find(x=>x.id===o.lines[0].shapeRef.id);};
 });

 eq('Notes из другой вкладки не возвращают старую форму: строка 50″ и форма 50″',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesOrderEdit(id);
  a5OtherTabWidth(id,50);soDraft.notes='Call before delivery';const saved=salesOrderSave();const o=salesRecord(id),s=a5Shape(id);
  const r={saved,width:o.lines[0].width16/16,shape:s.w,revision:s.revision===o.lines[0].shapeRef.revision,notes:o.notes};salesDraftDrop();return r;
 }),{saved:true,width:50,shape:'50',revision:true,notes:'Call before delivery'});

 eq('Don\'t update после чужого сохранения оставляет форму другой вкладки',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesOrderEdit(id);
  a5OtherTabWidth(id,50);soDraft.notes='Not saved';salesDraftDrop(true);return {shape:a5Shape(id).w,width:salesRecord(id).lines[0].width16/16};
 }),{shape:'50',width:50});

 eq('свою правку формы черновик сохраняет; ту же форму поменяли обе вкладки — Update отказывает',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesOrderEdit(id);
  const second=soDraft.lines[1],mine=DB.shapeDef.find(x=>x.id===second.shapeRef.id);mine.note='edited here';
  a5OtherTabWidth(id,50);const kept=DB.shapeDef.find(x=>x.id===second.shapeRef.id).note;
  const first=soDraft.lines[0],both=DB.shapeDef.find(x=>x.id===first.shapeRef.id);both.h='30';const text=localStorage.getItem(STORAGE_KEY);
  const other=JSON.parse(text);other.shapeDef.find(x=>x.id===first.shapeRef.id).h='35';const next=JSON.stringify(other);localStorage.setItem(STORAGE_KEY,next);storageLiveReload(next);
  const saved=salesOrderSave(),error=(document.getElementById('e_sales_order')||{}).textContent||'';salesDraftDrop(true);
  return {kept,saved,error:/shape of line 1 changed elsewhere/.test(error)};
 }),{kept:'edited here',saved:false,error:true});

 eq('стекло из стока отсканировано — Qty и размер строки не меняются, номер стекла остаётся',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');
  const o=salesRecord(id),l=o.lines[0],key=glassBatchComponents(o,l)[0].key,glass=glassPieceMap(id).get(key).ids[1];
  const who={id:'a5',name:'Audit operator'};['CUT','ARRIS'].forEach(s=>{const c=stationCheck(s,glass);stationMove(s,c,who);});
  salesOrderEdit(id);soDraft.lines[0].qty=1;const saved=salesOrderSave(),error=(document.getElementById('e_sales_order')||{}).textContent||'';salesDraftDrop(true);
  salesOrderEdit(id);const guard=salesLockedLineGuard(soDraft.lines[0]),other=salesLockedLineGuard(soDraft.lines[1]);salesDraftDrop(true);
  const deleteBlocked=salesDeleteBlocked(salesRecord(id));
  const r={saved,error:/Glass already in production: line 1 \(Kitchen\) changed/.test(error),qty:salesRecord(id).lines[0].qty,id:glassPieceMap(id).get(key).ids[1]===glass,heat:stationCheck('HEAT',glass).kind!=='unknown',guard,other,deleteBlocked};
  stationScansFor(glass).slice().reverse().forEach(s=>stationUndo(s.id,who));
  salesOrderEdit(id);soDraft.lines[0].qty=1;r.afterUndo=salesOrderSave();salesDraftDrop();return r;
 }),{saved:false,error:true,qty:2,id:true,heat:true,guard:true,other:false,deleteBlocked:true,afterUndo:true});

 eq('заказ одного склада: Save активна, Close спрашивает, пустая строка стекла не мешает',await t.p.evaluate(()=>{
  oqReset();DB.stockItem.push({id:'STK-A5',type:'stock',name:'A5 Door',code:'',thicknessMm:0,salePrice:100,availability:'stock',supplier:'',leadTimeDays:0,subcategory:'door',sellsAsOwnLine:true,active:true});
  const c=oqCustomer();tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(c.id);const before=salesDraftHasWork();
  salesExtraItemAdd('stockItem','STK-A5');render();const button=document.querySelector('[data-order-save]'),enabled=!!button&&!button.disabled;
  salesOrderClose();const asked=!!salesDialog;salesDialog=null;
  const saved=salesOrderSave(),o=salesRecord(soDraft.id),r={before,enabled,asked,saved,lines:o.lines.length,items:o.extraItems.length};salesDraftDrop();
  salesOrderNew('order');soDraft.customerPo='PO-77';r.poAsks=salesDraftHasWork();salesDraftDrop(true);
  DB.stockItem=DB.stockItem.filter(s=>s.id!=='STK-A5');return r;
 }),{before:false,enabled:true,asked:true,saved:true,lines:0,items:1,poAsks:true});

 eq('заказ одного склада: после Verified сразу Ready, без Batched; Back — в Verified',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),o=normalizeSalesOrder({id:'SO-A5',businessNumber:'95001',customerId:c.id,status:'new',lines:[],extraItems:[{id:'EXT-A5',table:'stockItem',itemId:'X',qty:1,priceOverride:100}]});DB.salesOrder.push(o);
  const id=o.id,flow=salesOrderFlow(o).join();salesSetRecordStatus(id,'verified');
  const batchAllowed=salesRecordTransitionAllowed(salesRecord(id),'batched'),inBatch=optimizationMatches(salesRecord(id),'batch'),awaiting=optimizationMatches(salesRecord(id),'awaiting');
  oqAdvance(id,'ready');const ready=salesRecord(id).status;oqAdvance(id,'back');oqChoose('Move back');const back=salesRecord(id).status;
  salesOrderEdit(id);const steps=[...document.querySelectorAll('.sales-step')].map(x=>x.dataset.step).join();salesDraftDrop();
  return {flow,batchAllowed,inBatch,awaiting,ready,back,steps};
 }),{flow:'new,verified,ready,done,closed',batchAllowed:false,inBatch:false,awaiting:true,ready:'ready',back:'verified',steps:'new,verified,ready,done,closed'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
