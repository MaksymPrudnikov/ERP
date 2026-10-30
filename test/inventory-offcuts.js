/* Остатки S- на складе (Inventory PR 2, владелец 14.10.2026): кусок Coming,
   пока его лист не порезан; на стеллаже — после реза; взят в раскрой —
   In batch, порезан — Used; лопнул — Broken; пересчёт Not found и Found
   встречной записью; склад листов не трогает; Export / Import; экран. */
module.exports=async function({page,eq}){
 console.log('inventory offcuts');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.ofReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.cutting=cutSettingsDefault();
   DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'})];
   invView='offcuts';invOffcutLostDraft.clear();invOffcutAll=false;invNotice='';
   ['inventory-offcuts','inventory-journal'].forEach(k=>{salesQueuePrefs[k]=null;localStorage.removeItem('glass_erp_'+k+'_list_v1');});
  };
  window.ofOrder=function(sizes){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return {id,n:DB.glassBatch[DB.glassBatch.length-1].number};
  };
  window.ofWho={name:'Ivan P.',id:'U-ivan'};
  window.ofCut=piece=>{const r=stationRecord(stationCutCode(),stationCheck(stationCutCode(),piece),ofWho);if(!r)throw new Error('scan failed');return r;};
  /* B-0001: одно стекло 50 × 50 на листе 130 × 96, крупный обрезок — в сток. */
  window.ofBook=function(){const a=ofOrder([[50,50,1]]);cutPlanRun(a.n);const id=cutStockTake(a.n,'6CLEAR',1,0).id;return {a,id};};
  window.ofSt=id=>{const o=invOffcutFind(id);return o&&o.status;};
 });

 eq('booked offcut is Coming until its sheet is cut; the first CUT scan puts it on the rack; Reset after the cut keeps it',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook(),out=[ofSt(id),invOffcutFind(id).age];
  ofCut(cutPlanFor(a.n).groups[0].sheets[0].pieces[0].piece);const o=invOffcutFind(id);out.push(o.status,o.age,!!o.onRackAt);
  cutPlanReset(a.n);out.push(ofSt(id),stockOffcutFind(id).status);
  return out;
 }),['Coming',null,'On rack',0,true,'On rack','stock']);

 eq('Reset before the cut keeps the locked sheet and its Coming offcut; Back to waste hides it on the screen unless asked',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook();cutPlanReset(a.n);const reset=ofSt(id);stockOffcutDrop(id);
  const hidden=!invOffcutInfos().some(i=>i.o.id===id);invOffcutAll=true;const shown=invOffcutInfos().some(i=>i.o.id===id);
  return [reset,ofSt(id),hidden,shown];
 }),['Coming','Back to waste',true,true]);

 eq('taken into another batch it is In batch; cutting that sheet uses it up; the sheet stock is not touched',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook();ofCut(cutPlanFor(a.n).groups[0].sheets[0].pieces[0].piece);
  const before=invRowFind('6CLEAR|130x96').onRack;
  const b=ofOrder([[20,20,2]]);cutPlanReset(b.n);cutSetStock(b.n,'6CLEAR',id,'off',false);cutPlanRun(b.n);
  const sh=cutPlanFor(b.n).groups[0].sheets.find(s=>s.size&&s.size.key===id),inBatch=[ofSt(id),invOffcutFind(id).claim];
  const scan=ofCut(sh.pieces[0].piece),o=invOffcutFind(id);
  return {inBatch,laid:!!sh,scanStock:scan.sheet.stock,used:[o.status,o.used.batch],sheets:invRowFind('6CLEAR|130x96').onRack===before,optimization:stockOffcutFind(id).status};
 }),{inBatch:['In batch','B-0002'],laid:true,scanStock:'S-0000001',used:['Used','B-0002'],sheets:true,optimization:'stock'});

 eq('a sheet broke on an offcut: the offcut is Broken, not a sheet; Undo brings it back',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook();ofCut(cutPlanFor(a.n).groups[0].sheets[0].pieces[0].piece);
  const b=ofOrder([[20,20,2]]);cutPlanReset(b.n);cutSetStock(b.n,'6CLEAR',id,'off',false);cutPlanRun(b.n);
  const sh=cutPlanFor(b.n).groups[0].sheets.find(s=>s.size&&s.size.key===id),rack=invRowFind('6CLEAR|130x96').onRack;
  stationSheetBreak(b.n,'6CLEAR',sh.no,ofWho);const broke=[ofSt(id),invRowFind('6CLEAR|130x96').onRack===rack];
  invBreakUndo(DB.sheetBreak[0].id);return {broke,undone:ofSt(id)};
 }),{broke:['Broken',true],undone:'In batch'});

 eq('recount: Not found writes it off (who, when); Coming cannot be written off; Found brings it back as a counter-entry',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook(),early=invOffcutLost([id]).error,none=invOffcutLost([]).error;
  ofCut(cutPlanFor(a.n).groups[0].sheets[0].pieces[0].piece);
  const lost=invOffcutLost([id]),o=invOffcutFind(id),again=invOffcutLost([id]).error;
  const found=invOffcutFound(id),twice=invOffcutFound(id).error;
  return {early,none,lost:[lost.ok,o.status,o.lost.reason,!!o.lost.at],again,found:[found.ok,ofSt(id)],twice,events:DB.inventoryEvent.map(e=>[e.kind,e.offcut,e.qty]),sheets:invRowFind('6CLEAR|130x96').onRack};
 }),{early:'S-0000001 is not on the rack (coming).',none:'Tick the offcuts that are not on the rack.',lost:[true,'Written off','Not found',true],again:'S-0000001 is not on the rack (written off).',found:[true,'On rack'],twice:'S-0000001 is not written off.',
  events:[['offcut-lost','S-0000001',-1],['offcut-found','S-0000001',1]],sheets:-1});

 eq('journal lists offcut moves; Export / Import keeps them; a bad offcut record is refused',await t.p.evaluate(()=>{
  ofReset();const {a,id}=ofBook();ofCut(cutPlanFor(a.n).groups[0].sheets[0].pieces[0].piece);invOffcutLost([id]);invOffcutFound(id);
  const kinds=invMoves().filter(m=>m.offcut).map(m=>[m.kind,m.rack,m.ref]);
  const next=prepareImportedState(JSON.parse(JSON.stringify(storageExportEnvelope()))),old=DB;DB=next;const after=ofSt(id);DB=old;
  let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{inventoryEvent:[Object.assign({},DB.inventoryEvent[0],{offcut:'X-1'})]}));}catch(e){err=e.message;}
  return {kinds,kept:next.inventoryEvent.filter(e=>e.offcut===id).length,after,err};
 }),{kinds:[['Offcut found',1,'S-0000001'],['Offcut not found',-1,'S-0000001'],['Offcut on rack',1,'S-0000001']],kept:2,after:'On rack',err:'Inventory journal row 1: invalid or duplicate record.'});

 eq('Offcuts screen: tiles, where it is, tick Not found and write off, Found, Show used and written off',await t.p.evaluate(()=>{
  ofReset();const x=ofBook();ofCut(cutPlanFor(x.a.n).groups[0].sheets[0].pieces[0].piece);const y=ofBook();
  navGo('inventory');invGo('offcuts');
  const tile=k=>document.querySelector('[data-inv-tile="'+k+'"] b').textContent;
  const tiles={rack:tile('On rack, pcs'),coming:tile('Coming'),old:tile('Oldest, days')};
  const where=[...document.querySelectorAll('[data-inv-offcut-status]')].map(e=>e.textContent);
  const boxes=document.querySelectorAll('[data-inv-lost]').length;
  const box=document.querySelector('[data-inv-lost="'+x.id+'"]');box.checked=true;box.dispatchEvent(new Event('change'));
  const n=document.querySelector('[data-inv-lost-n]').textContent;document.querySelector('[data-inv-lost-save]').click();
  const hidden=!document.querySelector('[data-inv-row="'+x.id+'"]');
  document.querySelector('[data-inv-offcut-all]').click();document.querySelector('[data-inv-found="'+x.id+'"]').click();
  const russian=/[А-яЁё]/.test(document.querySelector('.inventory-workspace').innerText);
  return {tiles,where,boxes,n,hidden,back:ofSt(x.id),total:document.querySelector('[data-inv-offcut-total]').textContent.startsWith('1 on the rack'),russian};
 }),{tiles:{rack:'1',coming:'1',old:'0'},where:['On rack','Coming · B-0002'],boxes:1,n:'1',hidden:true,back:'On rack',total:true,russian:false});

 eq('inventory offcuts have no JavaScript errors',t.errs,[]);await t.c.close();
};
