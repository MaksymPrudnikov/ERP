/* Подсказки склада (Inventory PR 3, владелец 14.10.2026): в таблице SHEETS
   раскроя — free и после Build «need · free», красным при нехватке и строка
   Short; не пересчитанное стекло — «not counted» серым, без Short; Build не
   блокируется. В приёмке блоков без Sheets — «Enter sheets». */
module.exports=async function({page,eq}){
 console.log('inventory hints');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.ihReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.cutting=cutSettingsDefault();
   ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchasingEvent'].forEach(k=>DB[k]=[]);DB.purchaseOrderSeq=0;DB.purchaseReceiptSeq=0;
   DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}),normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'})];
   if(!window.ihSup)window.ihSup=purSupplierSave({name:'Hint Glass Co'}).value;
   purFulfilDraft=null;salesQueuePrefs['purchasing-receipts']=null;localStorage.removeItem('glass_erp_purchasing-receipts_list_v1');
  };
  window.ihRec=(lines)=>purFulfilSave('receipt',{supplierId:ihSup.id,date:'2026-10-14',lines:lines.map((l,i)=>Object.assign({id:'L'+i,kind:'glass',productId:glassProductByCode('6CLEAR').id},l))}).value;
  window.ihBatch=function(){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:60*16,height16:40*16,qty:12,mark:'M1'})];salesEnsureLineShape(soDraft.lines[0]);
   salesLineChargeRows(soDraft.lines[0]).forEach(r=>{salesEnsureChargePricing(soDraft.lines[0],r).orderRate=0.013;});
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});const n=DB.glassBatch[DB.glassBatch.length-1].number;
   cutPlanReset(n);cutSetStock(n,'6CLEAR','130x96','off',true);return n;
  };
  window.ihOpen=n=>{tab='optimization';optimizationSetTab('production');glassBatchOpen(n);glassBatchDetailTab='optimization';render();};
  window.ihHint=k=>{const e=document.querySelector('[data-cut-free="'+k+'"]');return e?[e.textContent,e.classList.contains('short'),e.classList.contains('mut')]:null;};
  window.ihShort=()=>(document.querySelector('[data-cut-short]')||{}).textContent||'';
 });

 eq('before Build each size shows what is free; a size never counted says not counted in grey',await t.p.evaluate(()=>{
  ihReset();ihRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);invCountSave({'6CLEAR|144x96':'10'});const n=ihBatch();ihOpen(n);
  return {a:ihHint('144x96'),b:ihHint('130x96'),short:ihShort()};
 }),{a:['free 10',false,false],b:['not counted',false,true],short:''});

 eq('after Build: need · free for this batch; cutting a sheet lowers need',await t.p.evaluate(()=>{
  ihReset();ihRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);invCountSave({'6CLEAR|144x96':'10'});const n=ihBatch();cutPlanRun(n);ihOpen(n);
  const sheets=cutPlanFor(n).groups[0].sheets.length,a=ihHint('144x96');
  const p=cutPlanFor(n).groups[0].sheets[0].pieces[0].piece;stationRecord(stationCutCode(),stationCheck(stationCutCode(),p),{name:'Ivan P.',id:'U-ivan'});ihOpen(n);
  return {sheets,a,cut:ihHint('144x96'),short:ihShort()};
 }),{sheets:3,a:['need 3 · free 10',false,false],cut:['need 2 · free 9',false,false],short:''});

 eq('not enough on the rack: red need · free and a Short line, the layout is still built',await t.p.evaluate(()=>{
  ihReset();ihRec([{qty:2,unit:'sheet',widthIn:144,heightIn:96}]);invCountSave({'6CLEAR|144x96':'2'});const n=ihBatch();const r=cutPlanRun(n);ihOpen(n);
  return {built:!r.error&&!cutPlanFor(n).reset,hint:ihHint('144x96'),short:ihShort(),free:invRowFind('6CLEAR|144x96').free};
 }),{built:true,hint:['need 3 · free 2',true,false],short:'Short: 6CLEAR 144 × 96 — need 3, free 2',free:-1});

 eq('glass never counted: need · not counted in grey and no Short line',await t.p.evaluate(()=>{
  ihReset();const n=ihBatch();cutPlanRun(n);ihOpen(n);return {hint:ihHint('144x96'),short:ihShort()};
 }),{hint:['need 3 · not counted',false,true],short:''});

 eq('without Inventory access the layout shows no stock hints',await t.p.evaluate(()=>{
  ihReset();const n=ihBatch();cutPlanRun(n);const a=window.accessCan;window.accessCan=k=>k!=='inventory';
  try{ihOpen(n);return [ihHint('144x96'),ihShort(),!!document.querySelector('[data-cut-stock="144x96"]')];}finally{window.accessCan=a;render();}
 }),[null,'',true]);

 eq('receipt: a block line without Sheets says Enter sheets until sheets are typed; Receipts list marks the receipt',await t.p.evaluate(()=>{
  ihReset();ihRec([{qty:2,unit:'block',widthIn:144,heightIn:96}]);ihRec([{qty:2,unit:'block',actualSheets:32,widthIn:144,heightIn:96}]);
  tab='purchasing';purGo('receipts');render();const list=[...document.querySelectorAll('[data-pur-enter-sheets-list]')].length;
  purFulfilEdit('receipt',DB.purchaseReceipt[0].id);const hint=()=>!document.querySelector('[data-pur-enter-sheets="0"]').hidden;const before=hint();
  const input=document.getElementById('pur_receive_0_actualSheets');input.value='32';input.dispatchEvent(new Event('input'));const after=hint();
  purFulfilDraft.data.lines[0].unit='sheet';purFulfilRefresh();const sheetUnit=hint();
  return {list,before,after,sheetUnit};
 }),{list:1,before:true,after:false,sheetUnit:false});

 eq('inventory hints have no JavaScript errors',t.errs,[]);await t.c.close();
};
