/* Находки аудита 5 октября 2026 (Codex, проверено Claude): формы строк между
   вкладками, стекло из стока в цеху, заказ одного склада; отказ записи
   клиента, Recut и NCR; тара юнита, бланк бесплатной переделки, адрес
   выписки, импорт каталога стекла. */
module.exports=async function({page,eq,ok}){
 console.log('audit-2026-10-05');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  /* Другая вкладка сохранила ширину первой строки: строка и её форма. */
  window.a5OtherTabWidth=(id,inches)=>{
   const other=JSON.parse(localStorage.getItem(STORAGE_KEY)),o=other.salesOrder.find(x=>x.id===id),l=o.lines[0],s=other.shapeDef.find(x=>x.id===l.shapeRef.id);
   s.w=String(inches);s.revision=(+s.revision||0)+1;l.width16=inches*16;l.shapeRef.revision=s.revision;
   const text=JSON.stringify(other);localStorage.setItem(STORAGE_KEY,text);storageLiveReload(text);
  };
  window.a5FailWrite=fn=>{const keep=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new DOMException('Test quota','QuotaExceededError');return keep.call(this,k,v);};try{return fn();}finally{Storage.prototype.setItem=keep;storageLastError='';storageWarningShown=false;}};
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

 eq('заказ одного склада: Verify автоматически Ready, без Batched; ручного Back нет',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),o=normalizeSalesOrder({id:'SO-A5',businessNumber:'95001',customerId:c.id,status:'new',lines:[],extraItems:[{id:'EXT-A5',table:'stockItem',itemId:'X',qty:1,priceOverride:100}]});DB.salesOrder.push(o);
  const id=o.id,flow=salesOrderFlow(o).join();salesSetRecordStatus(id,'verified');
  const batchAllowed=salesRecordTransitionAllowed(salesRecord(id),'batched'),inBatch=optimizationMatches(salesRecord(id),'batch'),awaiting=optimizationMatches(salesRecord(id),'awaiting');
  const ready=salesRecord(id).status,back=salesSetRecordStatus(id,'verified',{back:true});
  salesOrderEdit(id);const steps=[...document.querySelectorAll('.sales-step')].map(x=>x.dataset.step).join();salesDraftDrop();
  return {flow,batchAllowed,inBatch,awaiting,ready,back,steps};
 }),{flow:'new,verified,ready,done,closed',batchAllowed:false,inBatch:false,awaiting:false,ready:'ready',back:false,steps:'new,verified,ready,done,closed'});

 eq('отказ записи клиента: форма и правка остаются, повторный Save сохраняет',await t.p.evaluate(()=>{
  const c=oqCustomer();tab='customers';customerEdit(c.id);cDraft.legalName='Renamed Windows Ltd';render();
  a5FailWrite(()=>saveCustomer());const kept={open:cEdit===c.id,name:cDraft&&cDraft.legalName,db:DB.customer.find(x=>x.id===c.id).legalName,error:/Not saved/.test(document.getElementById('e_customer').textContent)};
  saveCustomer();return Object.assign(kept,{closed:cEdit===null,saved:DB.customer.find(x=>x.id===c.id).legalName});
 }),{open:true,name:'Renamed Windows Ltd',db:'Northside Windows Ltd',error:true,closed:true,saved:'Renamed Windows Ltd'});

 eq('отказ записи Recut: форма открыта с ошибкой, повтор создаёт один Recut',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();oqThrough(id,'verified');salesOrderEdit(id);ncrOpenForm('recut');
  const reason=ncrReasonsFor('HEAT',{activeOnly:true})[0];ncrFormSet('where','HEAT');ncrFormSet('reasonId',reason.id);ncrFormLine(salesRecord(id).lines[0].id,'on',true,true);ncrForm.note='Exploded';
  a5FailWrite(()=>ncrFormCreate());const failed={open:!!ncrForm,error:/Not saved/.test(ncrForm&&ncrForm.error||''),recuts:DB.recut.length,stored:JSON.parse(localStorage.getItem(STORAGE_KEY)).recut.length};
  ncrFormCreate();const r=Object.assign(failed,{closed:!ncrForm,after:DB.recut.length});salesDraftDrop();return r;
 }),{open:true,error:true,recuts:0,stored:0,closed:true,after:1});

 eq('отказ записи NCR: ни NCR, ни переделки',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();oqThrough(id,'closed');const orders=DB.salesOrder.length;
  const reason=ncrReasonsFor('SHIP',{activeOnly:true})[0];
  const res=a5FailWrite(()=>ncrCreate({orderId:id,where:'SHIP',reasonId:reason.id,action:NCR_REMAKE,lines:{[salesRecord(id).lines[0].id]:{on:true,qty:1,which:'unit'}},note:''}));
  return {error:!!res.error,ncr:DB.ncr.length,orders:DB.salesOrder.length===orders};
 }),{error:true,ncr:0,orders:true});

 eq('«Not on DL-1» снимает с долли весь юнит',await t.p.evaluate(()=>{
  oqReset();DB.carrier=[];carrierAdd('DL',1);const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),pm=glassPieceMap(id),ids=glassBatchComponents(o,o.lines[0]).map(c=>pm.get(c.key).ids[0]),who={id:'a5',name:'Audit operator'};
  for(const st of ['CUT','ARRIS','HEAT','IGU'])ids.forEach(g=>{const c=stationCheck(st,g);if(STATION_RECORDED.includes(c.kind))stationMove(st,c,who);});
  const c=stationCheck('SHIPR',ids[0]);stationMove('SHIPR',c,who,{on:'DL-1'});const on=()=>ids.map(g=>{const r=stationScansFor(g).filter(s=>s.station==='SHIPR'&&!s.undoneAt).pop();return r&&r.on||'—';}).join();
  const before=on(),rec=stationScansFor(ids[0]).filter(s=>s.station==='SHIPR').pop();stationScanOff(rec.id);return {before,after:on()};
 }),{before:'DL-1,DL-1',after:'—,—'});

 eq('бесплатная переделка NCR: строка по цене, скидка No charge на всю сумму, итог $0',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();oqPay(id);oqThrough(id,'closed');
  const reason=ncrReasonsFor('SHIP',{activeOnly:true}).find(r=>r.name==='Broke in transit');
  const res=ncrCreate({orderId:id,where:'SHIP',reasonId:reason.id,action:NCR_REMAKE,lines:{[salesRecord(id).lines[0].id]:{on:true,qty:1,which:'unit'}},note:''});
  const r=salesRecord(res.ncr.remakeOrderId),m=docBuildModel('confirmation',r),line=m.items[0].amount;
  const free=m.end.rows.find(x=>/^No charge/.test(x.label));
  return {line:line!=='$0.00',free:free&&free.value==='−'+line,label:free&&free.label===('No charge · remake for '+res.ncr.number+' · order '+salesRecord(id).businessNumber),subtotal:m.end.rows.find(x=>x.label==='Subtotal').value,grand:m.end.grand.value};
 }),{line:true,free:true,label:true,subtotal:'$0.00',grand:'$0.00'});

 eq('выписка — на Statement Email, счета — на Invoice Email',await t.p.evaluate(()=>{
  const c=oqCustomer({statementEmail:'statement@example.test',invoiceEmail:'invoice@example.test'}),b=oqCustomer({invoiceEmail:'invoice-only@example.test'});
  const keep=[window.open,docDownload],urls=[];window.open=u=>{urls.push(decodeURIComponent(u));return {};};docDownload=()=>{};
  try{finEmailDoc({title:'Statement',c,mail:'statement',file:'S',subject:'S',body:''},[]);finEmailDoc({title:'Receipt',c,file:'R',subject:'R',body:''},[]);}catch(e){}
  window.open=keep[0];docDownload=keep[1];
  return {statement:finEmailTo(c,'statement'),invoice:finEmailTo(c),fallback:finEmailTo(b,'statement'),mailed:urls.map(u=>/statement@/.test(u)?'statement':/invoice@/.test(u)?'invoice':'?').join()};
 }),{statement:'statement@example.test',invoice:'invoice@example.test',fallback:'invoice-only@example.test',mailed:'statement,invoice'});

 eq('Glass catalogue грузит GLASS_PRODUCTS.csv, Supply points — GLASS_SHEETS.csv',await t.p.evaluate(()=>{
  tab='masterdata';mdSetTab('materials');const card=()=>{const d=document.createElement('div');d.innerHTML=mdImportCard();return d.querySelector('h3').textContent+' · '+d.querySelector('#mdCsv').getAttribute('onchange').match(/'(\w+)'/)[1];};
  mdMatView='glassProduct';const glass=card();mdMatView='glassSheet';const sheets=card();mdMatView='glassProduct';
  const rep=importGlassProductsCsv('code,name,thickness_mm\nA5TEST,A5 Test Glass,6');DB.glassProduct=DB.glassProduct.filter(p=>p.code!=='A5TEST');
  return {glass,sheets,added:rep.added};
 }),{glass:'Load GLASS_PRODUCTS.csv · glass',sheets:'Load GLASS_SHEETS.csv · sheets',added:1});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
