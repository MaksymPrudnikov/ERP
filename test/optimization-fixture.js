/* Демо-заказы с настоящими ценами и фигурами; используются проверками очереди. */
module.exports=async function(p){
 await p.evaluate(()=>{
  window.oqReset=function(){DB.salesOrder=[];DB.productionUnbatch=[];DB.shipment=[];DB.shipmentSeq=0;['shippingPS','shippingAwaiting','shippingDone'].forEach(k=>{salesQueuePrefs[k]=null;localStorage.removeItem('glass_erp_'+k+'_list_v1');});DB.stationScan=[];DB.stationScanSeq=0;shippingDraft=null;shippingOpenId='';shippingSelection.clear();shippingNotice=null;DB.glassBatch=[];DB.productionRoute=[];DB.glassPiece=[];DB.glassPieceSeq=0;DB.glassUnitId=[];DB.glassUnitIdSeq=0;localStorage.removeItem(GLASS_ID_MARK_KEY);DB.stickerTemplate={};DB.cutPlan=[];DB.cutting={};normalizeCutting();DB.stockOffcut=[];DB.stockOffcutSeq=0;cutNotice='';glassBatchDetailTab='contents';stkDialog=null;stkBuilder=null;if(typeof ncrSeedRows==='function'){DB.ncr=[];DB.recut=[];DB.ncrReason=ncrSeedRows();ncrForm=null;ncrViewId='';}glassBatchSelection.clear();glassBatchAnchor='';glassBatchOpenNumber='';salesQueuePrefs.glassQueue=null;salesQueuePrefs.glassBatches=null;salesQueuePrefs.glassContents=null;['glassQueue','glassBatches','glassContents'].forEach(k=>localStorage.removeItem('glass_erp_'+k+'_list_v1'));DB.receipt=[];DB.customer=[];soEdit=null;soDraft=null;soQuoteCopyOf=null;salesDialog=null;salesListMenu=null;salesListSel=new Set();salesHoldDialog=null;finDraft=null;finEdit=null;optimizationTab='new';shippingTab='awaiting';optimizationScope='';salesQueuePrefs.optimization=null;salesQueuePrefs.shipping=null;localStorage.removeItem('glass_erp_optimization_list_v1');localStorage.removeItem('glass_erp_shipping_list_v1');optimizationSel=new Set();optimizationNotice=null;tab='sales';salesShow={orders:true,quotes:false};salesStatusFilter='';render();};
  window.oqCustomer=function(extra){const c=normalizeCustomer(Object.assign({legalName:'Northside Windows Ltd',code:'QA'+(DB.customer.length+1),paymentMode:'credit',creditDays:30},extra));DB.customer.push(c);return c;};
  window.oqOrder=function(c,extra){
   tab='sales';salesOrderNew(extra&&extra.kind||'order');salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});m.cavities.forEach(c=>{c.priceOverride=3.1;});soDraft.lines=[];
   [[37,71,2,'Kitchen'],[30,40,1,'Bedroom']].forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   salesApplyCustomerDefaults(c.id);Object.assign(soDraft,extra||{});if(!salesOrderSave())throw new Error('Fixture order did not save');return soDraft.id;
  };
  window.oqPay=function(id){const o=salesRecord(id);DB.receipt.push(normalizeReceipt({number:'R-'+(DB.receipt.length+1),customerId:o.customerId,amount:finOrderBalance(o).total,allocations:[{orderId:id,amount:finOrderBalance(o).total}]}));};
  window.oqQueue=function(key){tab=['awaiting','ready','shipments','backorders','done'].includes(key)?'shipping':'optimization';optimizationSetTab(key||'new');};
  window.oqChoose=function(label){const i=salesDialog?salesDialog.buttons.findIndex(b=>b.label===label):-1;if(i<0)throw new Error('Missing dialog button: '+label);salesDialogChoose(i);};
  window.oqAdvance=function(id,next,delivery){
   if(next==='ready'){oqReady(id);render();return;}
   if(next==='done'){const o=salesRecord(id);shippingWithChecks([id],delivery||o.delivery,false,()=>{oqFulfill(id,delivery);render();});return;}
   optimizationRunOrders([id],next,{delivery});
  };
  /* Readiness/fulfilment fixtures use real scans and PS commands. No manual
     status transitions remain in the production workflow (Shipping PR 1). */
  window.oqReady=function(id){
   const o=salesRecord(id);if(salesStockOnly(o))return o.status==='ready';
   const ids=[...stationPieceIndex()].filter(([id,h])=>h.orderId===o.id).map(([id])=>id);
   for(let pass=0;pass<20;pass++){let moved=false;
    for(const piece of ids){const g=stationGlass(piece),p=g&&stationPlace(g);if(!p||p.broken||p.assembling||!p.waiting||p.waiting===shippingStations().ship)continue;
     const c=stationCheck(p.waiting,piece);if(c.kind==='ok'){const r=stationMove(p.waiting,c,{name:'Fixture operator'},{});moved=moved||r.ok;}}
    if(!moved)break;
   }
   return salesRecord(id).status==='ready';
  };
  window.oqFulfill=function(id,delivery){const o=salesRecord(id);const made=shippingCreate({customerId:o.customerId,method:delivery||o.delivery||'pickup',shipTo:{address1:'Fixture job site'},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:shippingSummary(o).extras.filter(x=>x.ready).map(x=>({orderId:id,extraId:x.x.id,qty:x.ready}))});
   return made.ok&&shippingMarkShipped(made.value.id).ok&&shippingMarkDelivered(made.value.id).ok;
  };
  window.oqThrough=function(id,status){for(const s of ['verified','batched','ready','done','closed']){if(s==='ready')oqReady(id);else if(s==='done')oqFulfill(id);else salesSetRecordStatus(id,s);if(s===status)break;}};
 });
};
