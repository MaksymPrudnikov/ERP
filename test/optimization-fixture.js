/* Демо-заказы с настоящими ценами и фигурами; используются проверками очереди. */
module.exports=async function(p){
 await p.evaluate(()=>{
  window.oqReset=function(){DB.salesOrder=[];DB.glassBatch=[];DB.glassPiece=[];DB.glassPieceSeq=0;if(typeof ncrSeedRows==='function'){DB.ncr=[];DB.recut=[];DB.ncrReason=ncrSeedRows();ncrForm=null;ncrViewId='';}glassBatchSelection.clear();glassBatchAnchor='';glassBatchOpenNumber='';salesQueuePrefs.glassQueue=null;salesQueuePrefs.glassBatches=null;salesQueuePrefs.glassContents=null;['glassQueue','glassBatches','glassContents'].forEach(k=>localStorage.removeItem('glass_erp_'+k+'_list_v1'));DB.receipt=[];DB.customer=[];soEdit=null;soDraft=null;soQuoteCopyOf=null;salesDialog=null;salesListMenu=null;salesListSel=new Set();salesHoldDialog=null;finDraft=null;finEdit=null;optimizationTab='new';shippingTab='awaiting';optimizationScope='';salesQueuePrefs.optimization=null;salesQueuePrefs.shipping=null;localStorage.removeItem('glass_erp_optimization_list_v1');localStorage.removeItem('glass_erp_shipping_list_v1');optimizationSel=new Set();optimizationNotice=null;tab='sales';salesShow={orders:true,quotes:false};salesStatusFilter='';render();};
  window.oqCustomer=function(extra){const c=normalizeCustomer(Object.assign({legalName:'Northside Windows Ltd',code:'QA'+(DB.customer.length+1),paymentMode:'credit',creditDays:30},extra));DB.customer.push(c);return c;};
  window.oqOrder=function(c,extra){
   tab='sales';salesOrderNew(extra&&extra.kind||'order');salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});m.cavities.forEach(c=>{c.priceOverride=3.1;});soDraft.lines=[];
   [[37,71,2,'Kitchen'],[30,40,1,'Bedroom']].forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   salesApplyCustomerDefaults(c.id);Object.assign(soDraft,extra||{});if(!salesOrderSave())throw new Error('Fixture order did not save');return soDraft.id;
  };
  window.oqPay=function(id){const o=salesRecord(id);DB.receipt.push(normalizeReceipt({number:'R-'+(DB.receipt.length+1),customerId:o.customerId,amount:finOrderBalance(o).total,allocations:[{orderId:id,amount:finOrderBalance(o).total}]}));};
  window.oqQueue=function(key){tab=['awaiting','ready','done'].includes(key)?'shipping':'optimization';optimizationSetTab(key||'new');};
  window.oqChoose=function(label){const i=salesDialog?salesDialog.buttons.findIndex(b=>b.label===label):-1;if(i<0)throw new Error('Missing dialog button: '+label);salesDialogChoose(i);};
  window.oqAdvance=function(id,next,delivery){optimizationRunOrders([id],next,{delivery});};
  window.oqThrough=function(id,status){for(const s of ['verified','batched','ready','done','closed']){salesSetRecordStatus(id,s);if(s===status)break;}};
 });
};
