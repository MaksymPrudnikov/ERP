/* Delete на любом этапе (владелец, 9 октября 2026: «Олег ошибся… и
   накладную тоже удалить»; «не доверил бы Оле — только финансисту,
   оптимизатору, владельцу и админу»). Возврат стекла, своя и общая
   накладная, машина, IGU, NCR / Recut, права, сбой записи, QuickBooks. */
module.exports=async function({page,eq}){
 console.log('order delete');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.odWho={name:'Delete tester',id:'od'};
  window.odReset=()=>{oqReset();DB.skip=[];DB.productionUnbatch=[];DB.orderEvent=[];DB.financeExport=[];DB.truck=[];productionUnbatchDialog=null;stationRouteReset();};
  window.odOrder=(type='single',qty=10,customer)=>{
   const id=oqOrder(customer||oqCustomer());salesOrderEdit(id);const m=soDraft.makeups[0];
   if(type==='single'){m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];}
   soDraft.lines=[soDraft.lines[0]];soDraft.lines[0].qty=qty;if(!salesOrderSave())throw Error('Order save failed');salesDraftDrop();return id;
  };
  window.odIds=id=>[...stationPieceIndex()].filter(([,h])=>h.orderId===id).map(([p])=>p);
  window.odPs=(ids,method='pickup',to='delivered')=>{
   const o=salesRecord(ids[0]),items=ids.flatMap(id=>shippingAvailable(salesRecord(id))).map(shippingItem),made=shippingCreate({customerId:o.customerId,method,date:finToday(),shipTo:{address1:'Job site'},items,extras:[]});
   if(!made.ok)throw Error(made.error);if(to==='planned')return made.value;
   if(!shippingMarkShipped(made.value.id).ok)throw Error('Dispatch failed');if(to==='delivered'&&!shippingMarkDelivered(made.value.id).ok)throw Error('Receipt failed');return made.value;
  };
  /* Окна confirm / alert — записать текст и согласиться. */
  window.odSay=[];window.odDelete=id=>{const c=window.confirm,a=window.alert;window.confirm=m=>{odSay.push(m);return true;};window.alert=m=>{odSay.push('alert: '+m);};try{return salesOrderDelete(id);}finally{window.confirm=c;window.alert=a;}};
  window.odAs=(keys,fn)=>{const old=window.accessCan;window.accessCan=k=>keys.includes(k);try{return fn();}finally{window.accessCan=old;}};
  window.odImport=()=>{try{prepareImportedState(JSON.parse(JSON.stringify(prepareImportedState(JSON.parse(JSON.stringify(DB))))));return true;}catch(e){return e.message;}};
  window.odInBatch=id=>(DB.glassBatch||[]).some(b=>b.items.some(i=>!i.releasedAt&&(b.parts[i.part]||{}).orderId===id));
  window.odLiveScans=pieces=>DB.stationScan.filter(s=>!s.undoneAt&&pieces.includes(s.piece)).length;
 });

 eq('Олег ошибся: Skip → SHIP → сразу Delete — заказ и его накладная удалены, номер PS не занимается, импорт дважды',await t.p.evaluate(()=>{
  odReset();const id=odOrder(),o=salesRecord(id),l=o.lines[0],pieces=odIds(id);o.delivery='delivery';
  const sk=skipRun({orderId:id,lines:{[l.id]:'all'},to:'SHIP',date:finToday(),shipTo:{address1:'42 Test Road'}}),ps=shippingForOrder(id)[0],status=ps.status;
  const text=salesDeleteConfirmText(o),deleted=odDelete(id);
  const next=odOrder();oqThrough(next,'ready');const ps2=odPs([next]);
  return {skip:!sk.error,ps:status,text:text===`Delete order ${o.businessNumber}?\nPS-0001 is deleted.`,deleted,gone:!salesRecord(id),psGone:!DB.shipment.some(s=>s.id===ps.id),scans:odLiveScans(pieces),event:DB.orderEvent.some(e=>e.orderId===id&&e.what==='Deleted'),next:ps2.number,imported:odImport()};
 }),{skip:true,ps:'shipped',text:true,deleted:true,gone:true,psGone:true,scans:0,event:true,next:'PS-0002',imported:true});

 eq('в работе: Unbatch только до ARRIS → Delete проходит; стекло уходит из батча, окно называет батч',await t.p.evaluate(()=>{
  odReset();const id=odOrder('single',2);oqThrough(id,'ready');const b=DB.glassBatch[0].number,o=salesRecord(id);
  const r=productionUnbatchRun({orderId:id,lines:{[o.lines[0].id]:'all'},target:'ARRIS@1',stamp:productionUnbatchStamp()});
  const text=salesDeleteConfirmText(salesRecord(id)),deleted=odDelete(id);
  return {unbatch:!r.error,text:text.split('\n').slice(1),batchNo:b,deleted,gone:!salesRecord(id),batch:odInBatch(id),scans:odLiveScans(odIds(id)),imported:odImport()};
 }),{unbatch:true,text:['Glass leaves batch B-0001.'],batchNo:'B-0001',deleted:true,gone:true,batch:false,scans:0,imported:true});

 eq('разбитое стекло, Recut и NCR не мешают: из батча уходит всё, NCR и Recut остаются и открываются',await t.p.evaluate(()=>{
  odReset();const id=odOrder('single',2);oqThrough(id,'batched');const original=odIds(id)[0],o=salesRecord(id);
  stationMove('CUT',stationCheck('CUT',original),odWho);const reason=ncrReasonsFor('ARRIS',{activeOnly:true})[0];stationBreak('ARRIS',stationCheck('ARRIS',original),odWho,reason.id);
  const n=ncrCreate({orderId:id,action:NCR_ACTIONS.find(a=>a!==NCR_REMAKE),where:'ARRIS',reasonId:reason.id,lines:{[o.lines[0].id]:{on:true,qty:1,which:'unit'}}});
  const deleted=odDelete(id),ncr=DB.ncr.find(x=>x.orderId===id);ncrViewId=ncr?ncr.id:'';render();const view=document.body.innerText.includes(ncr?ncr.number:'NCR?');ncrViewId='';render();
  return {ncr:!n.error,recut:DB.recut.some(r=>r.orderId===id),deleted,gone:!salesRecord(id),batch:odInBatch(id),kept:!!ncr,view,imported:odImport()};
 }),{ncr:true,recut:true,deleted:true,gone:true,batch:false,kept:true,view:true,imported:true});

 eq('общая накладная двух заказов: удалённый уходит, второй остаётся выданным, накладная печатается',await t.p.evaluate(()=>{
  odReset();const c=oqCustomer(),a=odOrder('single',2,c),b=odOrder('single',3,c);oqThrough(a,'ready');oqThrough(b,'ready');const ps=odPs([a,b],'delivery');
  const text=salesDeleteConfirmText(salesRecord(a)),deleted=odDelete(a),kept=shippingFind(ps.id);
  return {text:text.split('\n').slice(1),deleted,gone:!salesRecord(a),ps:kept&&kept.status,items:kept&&kept.items.every(i=>i.orderId===b)&&kept.items.length,other:salesRecord(b).status,issued:shippingSummary(salesRecord(b)).delivered,print:shippingPrintRecord(ps.id).length>0,imported:odImport()};
 }),{text:['Glass leaves batch B-0001.','PS-0001 keeps the other orders.'],deleted:true,gone:true,ps:'delivered',items:3,other:'done',issued:3,print:true,imported:true});

 eq('собранный IGU в машине: Delete разбирает юниты, удаляет накладную и снимает её с машины',await t.p.evaluate(()=>{
  odReset();const c=oqCustomer(),a=odOrder('double',2,c),b=odOrder('single',1,c);oqThrough(a,'ready');oqThrough(b,'ready');
  const truck=truckAdd('Truck A').value,pa=odPs([a],'delivery','planned'),pb=odPs([b],'delivery','planned');deliveryAssign(pa.id,truck.id);deliveryAssign(pb.id,truck.id);
  const before=[pa.stop,pb.stop],pieces=odIds(a),asm=DB.stationScan.some(s=>!s.undoneAt&&s.asm&&pieces.includes(s.piece)),deleted=odDelete(a);
  return {asm,before,deleted,gone:!salesRecord(a),psGone:!shippingFind(pa.id),stop:shippingFind(pb.id).stop,scans:odLiveScans(pieces),batch:odInBatch(a),imported:odImport()};
 }),{asm:true,before:[1,2],deleted:true,gone:true,psGone:true,stop:1,scans:0,batch:false,imported:true});

 eq('права: Оля (только Sales) тронутый заказ не удаляет, новый — удаляет; Optimization, Finance и Users удаляют',await t.p.evaluate(()=>{
  odReset();const touched=odOrder();oqThrough(touched,'batched');const fresh=odOrder();odSay=[];
  const ola=odAs(['sales'],()=>({touched:odDelete(touched),say:odSay.slice(),still:!!salesRecord(touched),fresh:odDelete(fresh),freshGone:!salesRecord(fresh)}));
  const who=['optimization','finance','users'].map(k=>{const id=odOrder();oqThrough(id,'batched');return odAs([k],()=>odDelete(id))&&!salesRecord(id);});
  return {ola,who};
 }),{ola:{touched:false,say:['alert: Ask Finance, Optimization or Users to delete this order.'],still:true,fresh:true,freshGone:true},who:[true,true,true]});

 eq('деньги: Sales видит сумму, оптимизатор — без суммы; оплата уходит на депозит',await t.p.evaluate(()=>{
  odReset();const id=odOrder();oqThrough(id,'batched');oqPay(id);const o=salesRecord(id),paid=finOrderPaid(id).paid,customer=o.customerId;
  const sales=odAs(['sales','finance'],()=>salesDeleteConfirmText(o)),opt=odAs(['optimization'],()=>salesDeleteConfirmText(o)),deleted=odAs(['optimization'],()=>odDelete(id));
  return {sales:sales.includes('$'+paid.toFixed(2)+' goes back to the customer deposit.'),opt:opt.includes('Receipts go back to the customer deposit.')&&!opt.includes('$'),deleted,deposit:finCustomerDeposit(customer)===paid};
 }),{sales:true,opt:true,deleted:true,deposit:true});

 eq('счёт уже в QuickBooks — строка в окне; не выгружен — строки нет',await t.p.evaluate(()=>{
  odReset();const id=odOrder();oqThrough(id,'ready');odPs([id]);const o=salesRecord(id),before=salesDeleteConfirmText(o).includes('QuickBooks');
  DB.financeExport.push({entityId:id,kind:'invoice',sig:'x',at:new Date().toISOString(),batch:1});
  return {before,after:salesDeleteConfirmText(o).split('\n').pop()};
 }),{before:false,after:'The invoice is already in QuickBooks.'});

 eq('сбой записи: заказ, накладная, батч и сканы остаются как были; повтор удаляет',await t.p.evaluate(()=>{
  odReset();const id=odOrder('single',2);oqThrough(id,'ready');odPs([id]);
  const before=JSON.stringify(DB),saved=localStorage.getItem(STORAGE_KEY),old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw Error('Full');return old.call(this,k,v);};
  let deleted;try{deleted=odDelete(id);}finally{Storage.prototype.setItem=old;}
  return {deleted,same:JSON.stringify(DB)===before,saved:localStorage.getItem(STORAGE_KEY)===saved,retry:odDelete(id),gone:!salesRecord(id)};
 }),{deleted:false,same:true,saved:true,retry:true,gone:true});

 eq('Optimization: Delete рядом с Cancel order — для одного выбранного заказа',await t.p.evaluate(()=>{
  odReset();const a=odOrder(),b=odOrder();tab='optimization';optimizationSetTab('all');optimizationSel=new Set([a,b]);render();
  const two=document.querySelector('[data-queue-action="delete"]').disabled;optimizationSel=new Set([a]);render();
  const one=document.querySelector('[data-queue-action="delete"]');const enabled=!one.disabled,label=one.innerText;
  const c=window.confirm;window.confirm=()=>true;try{one.click();}finally{window.confirm=c;}
  return {two,enabled,label,gone:!salesRecord(a),other:!!salesRecord(b)};
 }),{two:true,enabled:true,label:'Delete',gone:true,other:true});

 eq('заказ открыт в редакторе, Delete из Optimization: черновик закрывается, Save не возвращает заказ',await t.p.evaluate(()=>{
  odReset();const id=odOrder();oqThrough(id,'batched');salesOrderEdit(id);tab='optimization';optimizationSetTab('all');render();
  const open=!!soDraft&&soDraft.id===id,deleted=odDelete(id);tab='sales';render();const saved=soDraft?salesOrderSave():false;
  return {open,deleted,draft:!!soDraft,back:!!salesRecord(id),saved};
 }),{open:true,deleted:true,draft:false,back:false,saved:false});

 eq('Delete без ошибок страницы',t.errs,[]);await t.c.close();
};
