/* Offset листа (владелец 14.10.2026): для Maver лист уменьшают на 1/16 со
   всех краёв (130 × 96 → 129 7/8 × 95 7/8), для Disai — как есть. Поле Offset
   в строке размера SHEETS, по умолчанию 0: раскрой, станция и файл станка —
   на уменьшенном листе, Trim / Border строки остаются её, склад списывает
   настоящий размер; Offset 0 ничего не меняет. */
module.exports=async function({page,eq}){
 console.log('cut offset');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.coReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.cutting=cutSettingsDefault();cutNotice='';
   ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchasingEvent'].forEach(k=>DB[k]=[]);DB.purchaseReceiptSeq=0;
   DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'})];
   if(!window.coSup)window.coSup=purSupplierSave({name:'Offset Glass Co'}).value;
  };
  window.coBatch=function(){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:60*16,height16:40*16,qty:12,mark:'M1'})];salesEnsureLineShape(soDraft.lines[0]);
   salesLineChargeRows(soDraft.lines[0]).forEach(r=>{salesEnsureChargePricing(soDraft.lines[0],r).orderRate=0.013;});
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});const n=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanReset(n);return n;
  };
  window.coSizes=n=>cutPlanFor(n).groups[0].sheets.map(s=>JSON.stringify(s.size));
 });

 eq('Offset 1/16: sheets are laid as 129 7/8 × 95 7/8 with the 130 × 96 key; the row Trim stays with the row',await t.p.evaluate(()=>{
  coReset();const n=coBatch();cutSetStock(n,'6CLEAR','130x96','inset','1/16');cutSetStock(n,'6CLEAR','130x96','trimX','1');
  const r=cutPlanRun(n),g=cutPlanFor(n).groups[0],z=g.sheets[0].size,pr=cutGroupParams(g,z),u=cutUsable(z,pr);
  return {ok:!r.error,size:[z.key,z.w,z.h,z.inset],key:cutSheetKey(z),same:new Set(coSizes(n)).size,trimX:pr.trimX,top:u.y1===cutRound(95.875-pr.borderX)};
 }),{ok:true,size:['130x96',129.875,95.875,0.0625],key:'130x96',same:1,trimX:1,top:true});

 eq('the Maver file writes the reduced sheet, like Perfect Cut did by hand (VN211=3299, VN212=2435)',await t.p.evaluate(()=>{
  coReset();const n=coBatch();cutSetStock(n,'6CLEAR','130x96','inset','1/16');cutPlanRun(n);
  const mv=cutTrialSheet(n,'6CLEAR',1,'maver');if(mv.error)return mv.error;const iso=cutTrialMaver(mv).data;
  return [/VN211=3299 /.test(iso),/VN212=2435 /.test(iso)];
 }),[true,true]);

 eq('Offset 0 changes nothing: the same layout and plain sheet sizes',await t.p.evaluate(()=>{
  coReset();const a=coBatch();cutPlanRun(a);const plain=coSizes(a);
  const b=coBatch();cutSetStock(b,'6CLEAR','130x96','inset','0');cutPlanRun(b);
  const g=n=>cutPlanFor(n).groups[0].sheets.map(s=>s.pieces.map(p=>[p.x,p.y,p.w,p.h].join()).join('|')).join('/');
  return {sizes:JSON.stringify(coSizes(b))===JSON.stringify(plain),plain:plain[0],layout:g(a)===g(b)};
 }),{sizes:true,plain:'{"key":"130x96","w":130,"h":96,"supplier":"Vitro"}',layout:true});

 eq('Offset input: 0 to 1″, a size like 1/16; empty removes it',await t.p.evaluate(()=>{
  coReset();const n=coBatch();
  const out=[cutSetStock(n,'6CLEAR','130x96','inset','2').error,cutSetStock(n,'6CLEAR','130x96','inset','abc').error];
  cutSetStock(n,'6CLEAR','130x96','inset','1/16');const row=()=>cutPlanFor(n).sheetPick['6CLEAR'].sizes.find(x=>x.key==='130x96');out.push(row().inset);
  cutSetStock(n,'6CLEAR','130x96','inset','');out.push('inset' in row());return out;
 }),['Offset: 0 to 1″, for example 1/16.','Enter a size like 3/4 or 1 1/2.',0.0625,false]);

 eq('inventory takes the real 130 × 96 off the rack: reserve, CUT scan and Sheet broke; no 129 7/8 row',await t.p.evaluate(()=>{
  coReset();purFulfilSave('receipt',{supplierId:coSup.id,date:'2026-10-14',lines:[{id:'L0',kind:'glass',productId:glassProductByCode('6CLEAR').id,qty:10,unit:'sheet',widthIn:130,heightIn:96}]});
  const n=coBatch();cutSetStock(n,'6CLEAR','130x96','inset','1/16');cutPlanRun(n);const k='6CLEAR|130x96',row=()=>{const r=invRowFind(k);return [r.onRack,r.reserved,r.free];};
  const reserved=row(),s=cutPlanFor(n).groups[0].sheets[0];
  const scan=stationRecord(stationCutCode(),stationCheck(stationCutCode(),s.pieces[0].piece),{name:'Ivan P.',id:'U-ivan'});
  const cut=row();stationSheetBreak(n,'6CLEAR',2,{name:'Ivan P.'});const broke=row(),rec=DB.sheetBreak[0];
  return {reserved,scan:[scan.sheet.w,scan.sheet.h],cut,broke,rec:[rec.w,rec.h,rec.inset],odd:invSheetRows().filter(r=>r.code==='6CLEAR').map(r=>r.key)};
 }),{reserved:[10,3,7],scan:[130,96],cut:[9,2,7],broke:[8,2,6],rec:[129.875,95.875,0.0625],odd:['6CLEAR|130x96']});

 eq('SHEETS row: Offset field, laid as size, locked after Build; Export / Import keeps the offset',await t.p.evaluate(()=>{
  coReset();const n=coBatch();cutSetStock(n,'6CLEAR','130x96','inset','1/16');
  tab='optimization';optimizationSetTab('production');glassBatchOpen(n);glassBatchDetailTab='optimization';render();
  const input=()=>document.querySelector('[data-cut-stock="130x96"] [data-cut-inset]');
  const before={value:input().value,laid:(document.querySelector('[data-cut-laid="130x96"]')||{}).textContent,head:[...document.querySelectorAll('.cut-stock th')].map(th=>th.textContent.trim()).slice(0,3)};
  cutPlanRun(n);render();const locked=input().disabled;
  const next=prepareImportedState(JSON.parse(JSON.stringify(storageExportEnvelope()))),p=next.cutPlan.find(x=>x.batch===n);
  return {before,locked,kept:[p.sheetPick['6CLEAR'].sizes.find(x=>x.key==='130x96').inset,p.groups[0].sheets[0].size.inset],russian:/[А-яЁё]/.test(document.getElementById('app').innerText)};
 }),{before:{value:'1/16',laid:'laid as 129 7/8 × 95 7/8″',head:['Sheets','Qty','Offsetall sides']},locked:true,kept:[0.0625,0.0625],russian:false});

 eq('cut offset has no JavaScript errors',t.errs,[]);await t.c.close();
};
