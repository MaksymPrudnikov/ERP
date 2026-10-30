/* Аудит склада 15.10.2026: порезанный лист узнаётся по стёклам, а не по
   номеру (перенос листа в другой батч и удаление листа перенумеровывают
   остальные); фильтр журнала по стеклу не остаётся при входе из меню; кусок
   S-, отмеченный в SHEETS, но не взятый собранным раскроем, свободен. */
module.exports=async function({page,eq}){
 console.log('inventory audit');const t=await page(undefined,{width:1440,height:1000});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.iaReset=function(){
   oqReset();DB.sheetBreak=[];DB.inventoryEvent=[];DB.inventoryMin={};DB.cutting=cutSettingsDefault();
   DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'})];
   invView='sheets';invJournalKey='';
  };
  window.iaOrder=function(sizes){
   const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');
   glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return DB.glassBatch[DB.glassBatch.length-1].number;
  };
  window.iaCut=piece=>{const r=stationRecord(stationCutCode(),stationCheck(stationCutCode(),piece),{name:'Ivan P.',id:'U-ivan'});if(!r)throw new Error('scan failed');return r;};
  window.iaRow=()=>{const r=invRowFind('6CLEAR|144x96');return [r.cut,r.reserved,[...r.batches.entries()].map(x=>x.join(':')).join()];};
 });

 eq('sheet 2 cut, sheet 1 moved to a new batch: the renumbered uncut sheet stays reserved',await t.p.evaluate(()=>{
  iaReset();const n=iaOrder([[60,40,12]]);cutPlanRun(n);const sh=cutPlanFor(n).groups[0].sheets;
  sh[1].pieces.forEach(p=>iaCut(p.piece));const before=iaRow();
  const mv=cutMoveSheet(n,'6CLEAR',1,'');
  return {moved:!mv.error,before,after:iaRow(),nos:cutPlanFor(n).groups[0].sheets.map(s=>s.no).join()};
 }),{moved:true,before:[1,2,'B-0001:2'],after:[1,2,'B-0001:1,B-0002:1'],nos:'1,2'});

 eq('sheet 2 cut, sheet 1 deleted: the renumbered uncut sheet stays reserved, the cut sheet counted once',await t.p.evaluate(()=>{
  iaReset();const n=iaOrder([[60,40,12]]);cutPlanRun(n);const sh=cutPlanFor(n).groups[0].sheets;
  iaCut(sh[1].pieces[0].piece);cutSheetDelete(n,'6CLEAR',1);
  const s1=cutPlanFor(n).groups[0].sheets[0];iaCut(s1.pieces[1].piece);
  return {row:iaRow(),cutMoves:invMoves().filter(m=>m.kind==='Cut').length};
 }),{row:[1,1,'B-0001:1'],cutMoves:1});

 eq('a glass journal opened from the dashboard is cleared when Journal is chosen from the menu',await t.p.evaluate(()=>{
  iaReset();tab='inventory';render();invOpenJournal('6CLEAR|144x96');const a=!!document.querySelector('[data-inv-journal-key]');
  invGo('sheets');invGo('journal');return [a,!!document.querySelector('[data-inv-journal-key]'),invJournalKey];
 }),[true,false,'']);

 eq('an offcut ticked in SHEETS is In batch only until Build; if the built layout did not take it, it is on the rack',await t.p.evaluate(()=>{
  iaReset();const a=iaOrder([[50,50,1]]);cutPlanRun(a);const id=cutStockTake(a,'6CLEAR',1,0).id;iaCut(cutPlanFor(a).groups[0].sheets[0].pieces[0].piece);
  const b=iaOrder([[60,40,12]]);cutPlanReset(b);cutSetStock(b,'6CLEAR',id,'off',false);const draft=invOffcutFind(id).status;
  cutPlanRun(b);const laid=cutPlanFor(b).groups[0].sheets.some(s=>s.size&&s.size.key===id);
  return {draft,laid,built:invOffcutFind(id).status};
 }),{draft:'In batch',laid:false,built:'On rack'});

 eq('inventory audit has no JavaScript errors',t.errs,[]);await t.c.close();
};
