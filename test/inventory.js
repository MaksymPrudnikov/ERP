/* Склад листов (Inventory PR 1, владелец 14.10.2026): On rack — на пирамиде,
   Free — свободно после Build; приход только реальными листами; порезанный
   лист — расход и после Reset, Unbatch и Delete заказа, Undo скана — нет;
   Sheet broke и его Undo; пересчёт, списание, минимум; COG не на складе;
   Export / Import; раздел Inventory с дашбордом, Count и Journal. */
module.exports=async function({page,eq}){
 console.log('inventory sheets');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.ivReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.glassSheet=[];DB.cutting=cutSettingsDefault();
   ['purchaseOrder','purchaseReceipt','purchaseDeliveryRequest','purchasingEvent'].forEach(k=>DB[k]=[]);DB.purchaseOrderSeq=0;DB.purchaseReceiptSeq=0;
   DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
   if(!window.ivSup)window.ivSup=purSupplierSave({name:'Inventory Glass Co'}).value;
   invView='sheets';invCountDraft={};invJournalKey='';invMoveDraft=null;invNotice='';
   ['inventory-sheets','inventory-count','inventory-journal'].forEach(k=>{salesQueuePrefs[k]=null;localStorage.removeItem('glass_erp_'+k+'_list_v1');});
  };
  window.ivKey='6CLEAR|144x96';
  window.ivRow=(k)=>{const r=invRowFind(k||ivKey);return r&&{onRack:r.onRack,reserved:r.reserved,free:r.free,status:r.status};};
  window.ivRec=(lines)=>purFulfilSave('receipt',{supplierId:ivSup.id,date:'2026-10-14',lines:lines.map((l,i)=>Object.assign({id:'L'+i,kind:'glass',productId:glassProductByCode(l.code||'6CLEAR').id},l))});
  window.ivOrder=function(sizes){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return {id,n:DB.glassBatch[DB.glassBatch.length-1].number};
  };
  /* Батч на 3 листа 144 × 96 (по 4 стекла 60 × 40 на лист). */
  window.ivBatch=function(){const x=ivOrder([[60,40,12]]);const r=cutPlanRun(x.n);if(r.error)throw new Error(r.error);return x;};
  window.ivSheets=n=>cutPlanFor(n).groups[0].sheets;
  window.ivWho={name:'Ivan P.',id:'U-ivan'};
  window.ivCut=piece=>{const c=stationCheck(stationCutCode(),piece);const r=stationRecord(stationCutCode(),c,ivWho);if(!r)throw new Error('scan failed: '+c.kind);return r;};
 });

 eq('catalogue rows: supply sizes, else shop sizes, else Size missing; COG glass is not on the rack; Pre-order only with a movement; nothing counted yet',await t.p.evaluate(()=>{
  ivReset();const other=activeGlassProducts().find(g=>g.code!=='6CLEAR'&&g.cut!==false),cog=activeGlassProducts().find(g=>g.code!==other.code&&g.code!=='6CLEAR');cog.cut=false;
  const rows=invSheetRows(),keys=rows.filter(r=>r.code==='6CLEAR').map(r=>r.key);
  const out={clear:keys,other:rows.filter(r=>r.code===other.code).map(r=>r.w+'x'+r.h),cog:rows.some(r=>r.code===cog.code),status:ivRow(),catalogue:rows.length===activeGlassProducts().filter(g=>g.cut!==false&&g.stocked).length};
  const pre=activeGlassProducts().find(g=>!g.stocked&&g.cut!==false&&g.code!==cog.code);out.pre=[rows.some(r=>r.code===pre.code)];ivRec([{code:pre.code,qty:2,unit:'sheet',widthIn:130,heightIn:96}]);out.pre.push(invSheetRows().some(r=>r.code===pre.code));
  out.otherMissing=rows.filter(r=>r.code===other.code).map(r=>r.status);cutShopSizeAdd('130','96');out.other=invSheetRows().filter(r=>r.code===other.code).map(r=>r.w+'x'+r.h);
  ivRec([{code:cog.code,qty:10,unit:'sheet',widthIn:130,heightIn:96}]);out.cogAfter=invSheetRows().some(r=>r.code===cog.code);delete cog.cut;return out;
 }),{clear:['6CLEAR|144x96'],other:['130x96'],cog:false,status:{onRack:0,reserved:0,free:0,status:'Not counted'},catalogue:true,pre:[false,true],otherMissing:['Size missing'],cogAfter:false});

 eq('receipts: sheets minus broken; blocks only with Sheets entered; no size — Size missing; undo receipt gives the sheets back',await t.p.evaluate(()=>{
  ivReset();const out=[];
  const a=ivRec([{qty:20,damaged:2,unit:'sheet',widthIn:96,heightIn:144}]).value;out.push(ivRow().onRack);
  const b=ivRec([{qty:3,unit:'block',widthIn:144,heightIn:96}]).value;const r=invRowFind(ivKey);out.push([r.onRack,r.enterSheets]);
  const b2=purClone(b);b2.lines[0].actualSheets=48;b2.lines[0].damagedSheets=1;purFulfilSave('receipt',b2);const r2=invRowFind(ivKey);out.push([r2.onRack,r2.enterSheets]);
  ivRec([{qty:5,unit:'sheet'}]);const miss=invSheetRows().find(r=>r.code==='6CLEAR'&&r.sizeMissing);out.push([miss.key,miss.onRack,miss.status,invSizeText(miss)]);
  purFulfilUndo('receipt',a.id,a.rev);out.push(ivRow().onRack);
  return out;
 }),[18,[18,1],[65,0],['6CLEAR|?',5,'Size missing','Size missing'],47]);

 eq('Build reserves sheets: On rack stays, Free goes down; Build over the rack makes Free negative, never blocks',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:5,unit:'sheet',widthIn:144,heightIn:96}]);invCountSave({[ivKey]:'5'});
  const x=ivBatch(),n=ivSheets(x.n).length,a=ivRow(),r=invRowFind(ivKey);
  const y=ivBatch(),b=ivRow();
  return {sheets:n,a,batches:[...r.batches.entries()],b};
 }),{sheets:3,a:{onRack:5,reserved:3,free:2,status:'OK'},batches:[['B-0001',3]],b:{onRack:5,reserved:6,free:-1,status:'Negative'}});

 eq('first CUT scan of any glass takes its sheet off the rack; the scan remembers the sheet; Undo of the scan puts it back',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);
  const x=ivBatch(),sh=ivSheets(x.n)[0],[p1,p2]=sh.pieces.map(p=>p.piece),plan=cutPlanFor(x.n);
  const s1=ivCut(p1),one=ivRow();ivCut(p2);const two=ivRow();
  const remembered=s1.sheet&&s1.sheet.batch===x.n&&s1.sheet.plan===plan.at&&s1.sheet.no===sh.no&&s1.sheet.glass==='6CLEAR'&&s1.sheet.w===144&&s1.sheet.h===96;
  const last=DB.stationScan.filter(s=>!s.undoneAt).pop();stationUndo(last.id,ivWho);stationUndo(s1.id,ivWho);
  return {one,two,remembered,undone:ivRow()};
 }),{one:{onRack:9,reserved:2,free:7,status:'Not counted'},two:{onRack:9,reserved:2,free:7,status:'Not counted'},remembered:true,undone:{onRack:10,reserved:3,free:7,status:'Not counted'}});

 eq('Reset after a cut keeps the cut sheet spent; the new Build reserves only sheets with uncut glass',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);
  const x=ivBatch();ivSheets(x.n)[0].pieces.forEach(p=>ivCut(p.piece));const cut=ivRow();
  cutPlanReset(x.n);const reset=ivRow();cutPlanRun(x.n);
  const b=glassBatchFind(x.n),live=new Map(glassBatchActiveItems(b).map(i=>[i.piece,i]));
  const expect=ivSheets(x.n).filter(s=>s.pieces.some(p=>live.get(p.piece)&&!live.get(p.piece).cutStartedAt)).length,rebuilt=ivRow();
  return {cut,reset,rebuilt:rebuilt.onRack===9&&rebuilt.reserved===expect&&rebuilt.free===9-expect,journalCuts:invMoves().filter(m=>m.kind==='Cut').length};
 }),{cut:{onRack:9,reserved:2,free:7,status:'Not counted'},reset:{onRack:9,reserved:0,free:9,status:'Not counted'},rebuilt:true,journalCuts:1});

 eq('Unbatch before the cut frees the sheet; Delete of an order with cut glass keeps the cut sheet spent',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);
  const x=ivBatch(),b=glassBatchFind(x.n),last=ivSheets(x.n)[2];
  glassBatchRelease(b.items.filter(i=>last.pieces.some(p=>p.piece===i.piece)).map(item=>({batch:b,item})),{confirmed:true});const unbatched=ivRow();
  ivCut(ivSheets(x.n)[0].pieces[0].piece);const cut=ivRow();
  const c=window.confirm;window.confirm=()=>true;try{salesOrderDelete(x.id);}finally{window.confirm=c;}
  return {unbatched,cut,deleted:ivRow(),gone:!salesRecord(x.id),undone:DB.stationScan.every(s=>s.undoneAt)};
 }),{unbatched:{onRack:10,reserved:2,free:8,status:'Not counted'},cut:{onRack:9,reserved:1,free:8,status:'Not counted'},deleted:{onRack:9,reserved:0,free:9,status:'Not counted'},gone:true,undone:true});

 eq('Sheet broke takes a sheet off the rack; Undo in the inventory journal brings it back, keeps who and when; Sheets usage and CUT drop it',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);
  const x=ivBatch(),no=ivSheets(x.n)[1].no;stationSheetBreak(x.n,'6CLEAR',no,ivWho);
  const broke=ivRow(),used=sheetUsageRows()[0].broken,move=invMoves().find(m=>m.kind==='Sheet broke');
  const r=invBreakUndo(move.breakId),again=invBreakUndo(move.breakId),rec=DB.sheetBreak[0];
  return {broke,used,ref:move.ref,rack:move.rack,ok:r.ok,again:again.error,back:ivRow(),who:[rec.undoneBy,!!rec.undoneAt],usedAfter:sheetUsageRows()[0].broken,
   moves:invMoves().filter(m=>/sheet broke/i.test(m.kind)).map(m=>[m.kind,m.rack,m.undone||false])};
 }),{broke:{onRack:9,reserved:3,free:6,status:'Not counted'},used:1,ref:'B-0001 · sheet 2',rack:-1,ok:true,again:'Already undone.',back:{onRack:10,reserved:3,free:7,status:'Not counted'},who:['',true],usedAfter:0,
  moves:[['Undo sheet broke',1,false],['Sheet broke',-1,true]]});

 eq('count records was → is; write off with a reason; minimum flags Below minimum; wrong input is refused',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);const out={};
  out.bad=[invCountSave({[ivKey]:'-1'}).error,invCountSave({[ivKey]:'2.5'}).error,invCountSave({}).error,invWriteOff(ivKey,'2','').error,invWriteOff(ivKey,'0','Defect').error];
  const c=invCountSave({[ivKey]:'12'}).value[0];out.count=[c.before,c.after,c.qty,ivRow().onRack,ivRow().status];
  out.writeoff=[invWriteOff(ivKey,'3','Broken on rack','fork lift').ok,ivRow().onRack];
  invSetMin(ivKey,'10');out.min=[DB.inventoryMin[ivKey],ivRow().status];invSetMin(ivKey,'');out.cleared=[ivKey in DB.inventoryMin,ivRow().status];
  out.journal=invMoves().filter(m=>['Count','Write off'].includes(m.kind)).map(m=>[m.kind,m.rack,m.note]);
  return out;
 }),{bad:['6CLEAR 144 × 96: enter a whole number, 0 or more.','6CLEAR 144 × 96: enter a whole number, 0 or more.','Enter at least one count.','Choose a reason.','Sheets: enter 1 or more.'],
  count:[10,12,2,12,'OK'],writeoff:[true,9],min:[10,'Below minimum'],cleared:[false,'OK'],journal:[['Write off',-3,'Broken on rack · fork lift'],['Count',2,'Was 10 → 12']]});

 eq('without Inventory access every inventory command is refused',await t.p.evaluate(()=>{
  ivReset();const a=window.accessCan;window.accessCan=k=>k!=='inventory';
  try{renderNav();return [invCountSave({[ivKey]:'1'}).error,invSetMin(ivKey,'1').error,invWriteOff(ivKey,'1','Defect').error,viewInventory().includes('Inventory access is required.'),NAV.some(n=>n.k==='inventory')&&!document.querySelector('#side [onclick*="inventory"]')];}
  finally{window.accessCan=a;renderNav();}
 }),['Inventory access is required.','Inventory access is required.','Inventory access is required.',true,true]);

 eq('Export / Import keeps counts, minimums, the sheet on CUT scans and undone breaks; broken records are refused',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);invCountSave({[ivKey]:'10'});invSetMin(ivKey,'4');
  const x=ivBatch();ivCut(ivSheets(x.n)[0].pieces[0].piece);stationSheetBreak(x.n,'6CLEAR',2,ivWho);invBreakUndo(DB.sheetBreak[0].id);
  const before=ivRow(),next=prepareImportedState(JSON.parse(JSON.stringify(storageExportEnvelope())));
  const kept={events:next.inventoryEvent.length,min:next.inventoryMin[ivKey],sheet:!!next.stationScan.find(s=>s.sheet&&s.sheet.batch===x.n),undone:!!next.sheetBreak[0].undoneAt};
  const old=DB;DB=next;const after=ivRow();DB=old;
  const err=patch=>{try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),patch));return '';}catch(e){return e.message;}};
  return {kept,same:JSON.stringify(after)===JSON.stringify(before),bad:[err({inventoryEvent:[{id:'x',kind:'count'}]}),err({inventoryMin:[]}),err({inventoryMin:{[ivKey]:-1}})]};
 }),{kept:{events:1,min:4,sheet:true,undone:true},same:true,bad:['Inventory journal row 1: invalid or duplicate record.','The "inventoryMin" field must be an object.','Inventory minimum "6CLEAR|144x96": invalid.']});

 eq('menu and Users: Inventory after Purchasing, its own access checkbox',await t.p.evaluate(()=>{
  const i=NAV.findIndex(n=>n.k==='inventory');
  return {after:NAV[i-1].k,section:USER_SECTIONS.indexOf('inventory')===USER_SECTIONS.indexOf('purchasing')+1,nav:!!document.querySelector('#side .nav-item[onclick*="inventory"]')};
 }),{after:'purchasing',section:true,nav:true});

 eq('dashboard: tiles follow column filters, status chip from a tile, minimum in the row, row opens the journal of this glass',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96},{qty:2,unit:'block',widthIn:144,heightIn:96}]);invCountSave({[ivKey]:'10'});ivBatch();
  navGo('inventory');const tile=k=>document.querySelector('[data-inv-tile="'+k+'"] b').textContent;
  const tiles={rack:tile('On rack'),free:tile('Free'),enter:tile('Enter sheets'),notCounted:+tile('Not counted')>0,missing:+tile('Size missing')>0};
  document.querySelector('[data-inv-tile="Not counted"]').click();const filtered=document.querySelectorAll('[data-inv-row]').length===Math.min(50,invSheetRows().filter(r=>r.status==='Not counted').length)&&!document.querySelector('[data-inv-row="'+ivKey+'"]');
  invListStatus('');salesListSetFilter('code',{values:['6CLEAR']});const follows=tile('Glass × size')===String(document.querySelectorAll('[data-inv-row]').length);const row=document.querySelector('[data-inv-row="'+ivKey+'"]'),cells=[...row.querySelectorAll('td')].map(td=>td.textContent.trim());
  const min=row.querySelector('[data-inv-min]');min.value='9';min.dispatchEvent(new Event('change'));
  const below=document.querySelector('[data-inv-row="'+ivKey+'"]').textContent.includes('Below minimum');
  document.querySelector('[data-inv-row="'+ivKey+'"] .inv-glass').click();
  return {tiles,filtered,follows,size:cells.includes('144 × 96'),reserved:cells.some(c=>c==='3B-0001'),below,view:invView,key:!!document.querySelector('[data-inv-journal-key]'),
   kinds:[...document.querySelectorAll('[data-inv-row] td:nth-child(6)')].map(td=>td.textContent.trim().replace(/\s+/g,' '))};
 }),{tiles:{rack:'10',free:'7',enter:'1',notCounted:false,missing:true},filtered:true,follows:true,size:true,reserved:true,below:true,view:'journal',key:true,kinds:['Build','Count','Receipt','Receipt']});

 eq('Count screen: type counts, see the difference, Save writes only filled rows in one go; Write off form; Journal Undo',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);const x=ivBatch();stationSheetBreak(x.n,'6CLEAR',1,ivWho);
  navGo('inventory');invGo('count');salesListSetFilter('code',{values:['6CLEAR']});
  const input=document.querySelector('[data-inv-count="'+ivKey+'"]');input.value='7';input.dispatchEvent(new Event('input'));
  const diff=input.closest('tr').querySelector('[data-inv-diff]').textContent,n=document.querySelector('[data-inv-count-n]').textContent;
  document.querySelector('[data-inv-count-save]').click();const saved=DB.inventoryEvent.map(e=>[e.glass,e.before,e.after]);
  document.querySelector('[data-inv-row="'+ivKey+'"] [data-inv-writeoff]').click();
  document.getElementById('inv_wo_qty').value='1';document.getElementById('inv_wo_qty').dispatchEvent(new Event('input'));
  const sel=document.getElementById('inv_wo_reason');sel.value='Defect';sel.dispatchEvent(new Event('change'));
  document.querySelector('[data-inv-writeoff-save]').click();const wo=[ivRow().onRack,!document.querySelector('[data-inv-writeoff-form]')];
  invGo('journal');document.querySelector('[data-inv-undo]').click();
  const russian=/[А-яЁё]/.test(document.querySelector('.inventory-workspace').innerText);
  return {diff,n,saved,wo,undone:!!DB.sheetBreak[0].undoneAt,rack:ivRow().onRack,russian};
 }),{diff:'−2',n:'1',saved:[['6CLEAR',9,7]],wo:[6,true],undone:true,rack:7,russian:false});

 eq('Sheets row: + adds with a reason, − removes, Count sets the number; Glass on rack brings a Pre-order glass with its supply sheet; sections are buttons',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);navGo('inventory');invGo('count');invGo('sheets');salesListSetFilter('code',{values:['6CLEAR']});
  const act=(sel,qty,reason)=>{document.querySelector('[data-inv-row="'+ivKey+'"] '+sel).click();const q=document.getElementById('inv_wo_qty');q.value=qty;q.dispatchEvent(new Event('input'));
   const r=document.getElementById('inv_wo_reason');if(r){r.value=reason;r.dispatchEvent(new Event('change'));}document.querySelector('[data-inv-writeoff-save]').click();return ivRow().onRack;};
  const noReason=(()=>{document.querySelector('[data-inv-row="'+ivKey+'"] [data-inv-add]').click();const q=document.getElementById('inv_wo_qty');q.value='2';q.dispatchEvent(new Event('input'));document.querySelector('[data-inv-writeoff-save]').click();const e=invNotice;invMoveDraft=null;invNotice='';render();return e;})();
  const racks=[act('[data-inv-add]','3','Found'),act('[data-inv-remove]','1','Broken on rack'),act('[data-inv-count-one]','9')];
  const pre=activeGlassProducts().find(g=>!g.stocked&&g.cut!==false&&g.code!=='6CLEAR');DB.glassSheet.push(normalizeGlassSheet({productCode:pre.code,supplier:'Vitro',sheetWIn:120,sheetHIn:84,availability:'order'}));
  document.querySelector('[data-inv-glass-on-rack]').click();invMovePick('code',pre.code);
  const size=[document.getElementById('inv_mv_w').value,document.getElementById('inv_mv_h').value];
  const q=document.getElementById('inv_wo_qty');q.value='5';q.dispatchEvent(new Event('input'));document.querySelector('[data-inv-writeoff-save]').click();
  const added=invSheetRows().find(r=>r.code===pre.code);
  invGo('journal');const kinds=invMoves().filter(m=>m.code==='6CLEAR'||m.code===pre.code).map(m=>m.kind).sort();
  return {noReason,racks,size,added:added&&[added.key===pre.code+'|120x84',added.onRack],kinds,tabs:document.querySelectorAll('[data-inv-sections] [data-inv-section]').length};
 }),{noReason:'Choose a reason.',racks:[13,12,9],size:['120','84'],added:[true,5],kinds:['Add','Add','Count','Receipt','Write off'],tabs:6});

 eq('a short row without a count is Negative, not Not counted; the Negative tile finds it',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:5,unit:'sheet',widthIn:144,heightIn:96}]);ivBatch();ivBatch();
  const r=ivRow();navGo('inventory');invGo('sheets');const tile=+document.querySelector('[data-inv-tile="Negative"] b').textContent;
  document.querySelector('[data-inv-tile="Negative"]').click();const found=!!document.querySelector('[data-inv-row="'+ivKey+'"]');invListStatus('');
  return {r,last:invLastCount(invRowFind(ivKey)).includes('—'),tile,found};
 }),{r:{onRack:5,reserved:6,free:-1,status:'Negative'},last:true,tile:1,found:true});

 eq('the sheet move window takes focus at once, so typing lands in the right box',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:5,unit:'sheet',widthIn:144,heightIn:96}]);navGo('inventory');invGo('sheets');
  invMoveOpen(ivKey,'add');const one=document.activeElement&&document.activeElement.id;invMoveDraft=null;render();
  invMoveOpen('','add');const two=document.activeElement&&document.activeElement.id;invMoveDraft=null;render();
  return [one,two];
 }),['inv_wo_qty','inv_mv_mfr']);

 /* Владелец 26.10.2026 (вопрос 3 аудита): у разницы пересчёта — причина
    из списка Data и заметка; видны в журнале; не обязательны. */
 eq('a count difference takes a reason from Data and a note; the journal shows them; Data adds and turns reasons off',await t.p.evaluate(()=>{
  ivReset();ivRec([{qty:10,unit:'sheet',widthIn:144,heightIn:96}]);navGo('inventory');invGo('count');salesListSetFilter('code',{values:['6CLEAR']});
  const row=()=>document.querySelector('[data-inv-row="'+ivKey+'"]'),box=()=>row().querySelector('[data-inv-why]');const hidden=box().hidden;
  const inp=row().querySelector('[data-inv-count]');inp.value='8';inp.dispatchEvent(new Event('input'));const shown=!box().hidden;
  const sel=box().querySelector('[data-inv-why-reason]');sel.value='Broken on rack';sel.dispatchEvent(new Event('change'));
  const note=box().querySelector('[data-inv-why-note]');note.value='forklift';note.dispatchEvent(new Event('input'));
  document.querySelector('[data-inv-count-save]').click();const e=DB.inventoryEvent.filter(x=>x.kind==='count').pop();
  const plain=invCountSave({[ivKey]:'8'}).ok;
  tab='masterdata';mdSetTab('stockreasons');render();document.querySelector('[data-stock-reason-new]').value='Stolen';stockReasonNew='Stolen';document.querySelector('[data-stock-reason-add]').click();
  const twice=stockReasonAdd('stolen');stockReasonSetActive(DB.stockReason.find(r=>r.name==='Defect').id,false);
  return {hidden,shown,ev:[e.reason,e.note,e.qty],journal:invMoves().find(m=>m.id===e.id).note,plain,list:stockReasonsActive().slice(-2),off:stockReasonsActive().includes('Defect'),twice};
 }),{hidden:true,shown:true,ev:['Broken on rack','forklift',-2],journal:'Was 10 → 8 · Broken on rack · forklift',plain:true,list:['Other','Stolen'],off:false,twice:'This reason is already there.'});

 eq('inventory has no JavaScript errors',t.errs,[]);await t.c.close();
};
