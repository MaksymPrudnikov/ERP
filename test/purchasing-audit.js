/* Purchasing audit, 14 October 2026 (owner): held glass arrives only when
   brought, broken glass for Replacement waits as a backorder, every Master
   Data material can be bought, currency follows the supplier card, short
   one-row receipt and request forms, invoice total from its POs. */
module.exports=async function({page,eq}){
 console.log('purchasing audit');const t=await page(undefined,{width:1440,height:1000});
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await t.p.evaluate(()=>{
  ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchaseInvoice','purchasePayment','purchasingEvent'].forEach(k=>DB[k]=[]);
  DB.purchaseOrderSeq=0;DB.purchaseReceiptSeq=0;DB.purchaseDeliveryRequestSeq=0;DB.purchaseInvoiceSeq=0;DB.purchasePaymentSeq=0;
  window.paUSD=purSupplierSave({name:'Audit US Glass',currency:'USD',email:'po@us.test',paymentDays:30}).value;
  window.paCAD=purSupplierSave({name:'Audit Local Glass'}).value;
  window.paGlass=activeGlassProducts()[0];
  window.paPO=purOrderSave({supplierId:paUSD.id,currency:'USD',state:'sent',lines:[
   {id:'sheets',kind:'glass',productId:paGlass.id,qty:10,unit:'sheet',widthIn:130,heightIn:96,price:50,priceUnit:'sheet'},
   {id:'held',kind:'glass',productId:paGlass.id,qty:40,unit:'block',widthIn:130,heightIn:96,held:true}]}).value;
 });
 eq('a plain receipt lists held glass empty and fills only what is outstanding here',await t.p.evaluate(()=>purFulfilFromPO('receipt',paPO.id).lines.map(l=>[l.poLineId,l.qty])),[['sheets',10],['held',null]]);
 eq('Receive + Save from the PO does not move held blocks: empty rows are left out',await t.p.evaluate(()=>{
  tab='purchasing';purFulfilEdit('receipt','',paPO.id);const rows=document.querySelectorAll('[data-pur-receive-row]').length;
  purFulfilSaveForm();const p=purOrderFind(paPO.id);
  return {rows,saved:purFulfilDraft.data.lines.map(l=>l.poLineId),held:purReceived(p,p.lines[1]).remaining,status:purOrderStatus(p),waiting:purWaitingRows(true).length};
 }),{rows:2,saved:['sheets'],held:40,status:'Partially received',waiting:1});
 eq('a delivery request still fills its requested held blocks',await t.p.evaluate(()=>{
  const q=purFulfilFromPO('request',paPO.id);q.lines[0].qty=5;const r=purFulfilSave('request',q).value;
  return purFulfilFromPO('receipt',paPO.id,r.id).lines.map(l=>[l.poLineId,l.qty]);
 }),[['held',5]]);
 eq('broken glass with Credit requested is not brought again',await t.p.evaluate(()=>{
  const r=purFulfilSave('receipt',{poId:paPO.id,supplierId:paUSD.id,lines:[{id:'c',poLineId:'sheets',kind:'glass',productId:paGlass.id,qty:2,unit:'sheet',damaged:1,resolution:'Credit requested'}]}).value;
  const b=purReceived(purOrderFind(paPO.id),paPO.lines[0]);purFulfilUndo('receipt',r.id,r.rev,false);return {left:b.replaceLeft,due:b.replaceDue};
 }),{left:0,due:0});
 eq('Replacement keeps broken sheets waiting: backorder row, PO not Received',await t.p.evaluate(()=>{
  DB.purchaseReceipt=[];
  purFulfilSave('receipt',{poId:paPO.id,supplierId:paUSD.id,lines:[{id:'r1',poLineId:'sheets',kind:'glass',productId:paGlass.id,qty:10,unit:'sheet',damaged:2,damagedSheets:2,reason:'Factory defect',resolution:'Replacement'},{id:'r2',poLineId:'held',kind:'glass',productId:paGlass.id,qty:40,unit:'block'}]});
  const p=purOrderFind(paPO.id),b=purReceived(p,p.lines[0]),back=purWaitingRows(false).filter(x=>x.replace).map(x=>x.b.replaceLeft);
  return {remaining:b.remaining,left:b.replaceLeft,unit:b.replaceUnit,status:purOrderStatus(p),back,prefill:purFulfilFromPO('receipt',p.id).lines.filter(l=>l.replacement).map(l=>[l.qty,l.unit])};
 }),{remaining:0,left:2,unit:'sheet',status:'Partially received',back:[2],prefill:[[2,'sheet']]});
 eq('the replacement arriving closes it without an over-delivery warning',await t.p.evaluate(()=>{
  const d=purFulfilFromPO('receipt',paPO.id);d.lines=d.lines.filter(l=>l.replacement);const warn=purFulfilWarnings('receipt',d);purFulfilSave('receipt',d);
  const p=purOrderFind(paPO.id),b=purReceived(p,p.lines[0]);return {warn,left:b.replaceLeft,received:b.received,status:purOrderStatus(p),back:purWaitingRows(false).length};
 }),{warn:[],left:0,received:10,status:'Received',back:0});
 eq('a block line counts broken glass in sheets from the one Broken field',await t.p.evaluate(()=>{
  const l={unit:'block',broken:'3'};purFulfilMapBroken(l);const s={unit:'sheet',broken:'2'};purFulfilMapBroken(s);return {block:[l.damaged,l.damagedSheets],sheet:[s.damaged,s.damagedSheets]};
 }),{block:[null,'3'],sheet:['2','2']});
 eq('materials not sold as their own line can be bought from Master Data',await t.p.evaluate(()=>{
  const groups=purMaterialGroups().map(g=>g.table),sp=DB.spacerVariant.find(x=>x.active!==false),l=purStockLine('spacerVariant',sp.id);
  return {spacer:groups.includes('spacerVariant'),sealant:groups.includes('sealantProduct'),gas:groups.includes('gasProduct'),sells:sp.sellsAsOwnLine===true,line:[l.kind,l.table,l.itemId===sp.id,l.description==='Spacer '+sp.name]};
 }),{spacer:true,sealant:true,gas:true,sells:false,line:['stock','spacerVariant',true,true]});
 eq('a receipt without PO can take a catalogue material and keeps its identity',await t.p.evaluate(()=>{
  purFulfilDraft=null;purFulfilEdit('receipt','');const g=DB.sealantProduct[0];purPicker={kind:'stock',target:'receipt'};purPickerMaterial('sealantProduct|'+g.id);
  const l=purFulfilDraft.data.lines.at(-1);l.qty=4;const r=purFulfilSave('receipt',Object.assign({},purFulfilDraft.data,{lines:[l]})).value;purFulfilDraft=null;
  return [r.lines[0].kind,r.lines[0].table,r.lines[0].itemId===g.id];
 }),['stock','sealantProduct',true]);
 eq('the PO currency follows the supplier card, CAD by default',await t.p.evaluate(()=>{
  purOrderEdit('');purPickSupplier(paUSD.id);const usd=purOrderDraft.currency;purPickSupplier(paCAD.id);const cad=purOrderDraft.currency;purOrderDraft=null;
  purMoneyEdit('invoice','');purMoneySetSupplier(paUSD.id);const inv=purMoneyDraft.data.currency;purMoneyDraft=null;return {usd,cad,inv,card:paCAD.currency};
 }),{usd:'USD',cad:'CAD',inv:'USD',card:'CAD'});
 eq('an invoice from a priced PO starts with its total; a typed amount is kept',await t.p.evaluate(()=>{
  const po=lines=>purOrderSave({supplierId:paUSD.id,currency:'USD',lines}).value,p1=po([{id:'x',kind:'other',description:'PIB',qty:10,unit:'each',price:50}]),p2=po([{id:'x',kind:'other',description:'Sealant',qty:4,unit:'each',price:25}]);
  purMoneyEdit('invoice','',null,p1.id);const one=purMoneyDraft.data.amount;purInvoiceAddPO(p2.id,false);const two=purMoneyDraft.data.amount;purInvoiceAddPO(paPO.id,false);const unpriced=purMoneyDraft.data.amount;
  purMoneyDraft.data.amount='480';purInvoiceRemovePO(p2.id);const typed=purMoneyDraft.data.amount;purMoneyDraft=null;
  return {one,two,unpriced,typed};
 }),{one:500,two:600,unpriced:null,typed:'480'});
 eq('the PO status box shows the same status as the badge',await t.p.evaluate(()=>{
  purMoneyDraft=null;purOrderEdit(paPO.id);const sel=document.getElementById('pur_po_state');return {badge:purOrderStatus(purOrderDraft),box:sel.options[sel.selectedIndex].textContent};
 }),{badge:'Received',box:'Received'});
 eq('receipt and request forms are one table row per item',await t.p.evaluate(()=>{
  purOrderDraft=null;purFulfilEdit('request','',paPO.id);const req=document.querySelectorAll('.pur-request-table [data-pur-receive-row]').length;purFulfilDraft=null;
  purFulfilEdit('receipt','',paPO.id);const rec=document.querySelectorAll('.pur-receive-table [data-pur-receive-row]').length,cards=document.querySelectorAll('.pur-receiving-row').length;
  return {req,rec,cards};
 }),{req:1,rec:2,cards:0});
 await t.p.setViewportSize({width:390,height:844});
 eq('the receipt table scrolls inside its block on a phone',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 eq('purchasing audit screens have no JavaScript errors',t.errs,[]);await t.c.close();
};
