/* «We cut it» on a glass (owner, 14 October 2026, like Spil): bought glass
   such as COG is never batched or cut; its lite goes straight to assembly. */
module.exports=async function({page,eq}){
 console.log('glass no cut');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  oqReset();window.ncC=oqCustomer();
  const base=glassProductByCode('6CLEAR');
  DB.glassProduct.push(normalizeGlassProduct(Object.assign({},base,{id:glassProductId('6COG'),code:'6COG',name:'Clear 6mm COG',cut:false})));
  window.ncCOG=glassProductByCode('6COG');
  window.ncOrder=(lites)=>{const id=oqOrder(ncC),o=salesRecord(id);lites.forEach(i=>{o.makeups[0].panes[i].glassProductId=ncCOG.id;});soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');return salesRecord(id);};
  window.ncRoute=(o,lite)=>{const l=o.lines[0],c=glassBatchComponents(o,l).find(c=>c.lite===String(lite));return finWithOrder(o,()=>stkRoute(o,l,c)).codes;};
 });
 eq('glass is cut by default; an unticked glass stays bought through save and JSON import',await t.p.evaluate(()=>({fresh:normalizeGlassProduct({code:'X'}).cut,cog:ncCOG.cut,base:glassProductByCode('6CLEAR').cut,imported:prepareImportedState(storageExportEnvelope()).glassProduct.find(g=>g.code==='6COG').cut})),{fresh:true,cog:false,base:true,imported:false});
 eq('in an IGU with a COG lite only our own lite waits in To batch',await t.p.evaluate(()=>{
  const o=ncOrder([1]),rows=glassBatchRows().filter(r=>r.orderId===o.id);window.ncMixed=o;
  return {rows:rows.length,lites:[...new Set(rows.map(r=>r.lite))],progress:glassBatchProgress(o),queued:optimizationMatches(o,'batch')};
 }),{rows:3,lites:['1'],progress:{total:3,left:3,assigned:0},queued:true});
 eq('the COG lite goes straight to IGU; our lite still starts at CUT',await t.p.evaluate(()=>({cog:ncRoute(ncMixed,2),own:ncRoute(ncMixed,1)[0],ownIgu:ncRoute(ncMixed,1).includes('IGU')})),{cog:['IGU','SHIPR','SHIP'],own:'CUT',ownIgu:true});
 eq('batching our lites leaves nothing to batch: the order is not stuck at 3/6',await t.p.evaluate(()=>{
  glassBatchAssign(glassBatchRows().filter(r=>r.orderId===ncMixed.id));const o=salesRecord(ncMixed.id);
  return {status:o.status,left:glassBatchProgress(o).left,unbatched:salesUnbatchedLines(o).length,queued:optimizationMatches(o,'batch')};
 }),{status:'batched',left:0,unbatched:0,queued:false});
 eq('the COG glass waits at IGU on the shop floor, not at CUT',await t.p.evaluate(()=>{
  const o=salesRecord(ncMixed.id),c=glassBatchComponents(o,o.lines[0]).find(c=>c.lite==='2'),id=glassPieceMap(o.id).get(c.key).ids[0],g=stationGlass(id);
  return {waiting:stationPlace(g).waiting,cut:stationCheck('CUT',id).kind};
 }),{waiting:'IGU',cut:'route'});
 eq('an order of bought units only never waits in To batch',await t.p.evaluate(()=>{
  const o=ncOrder([0,1]);return {rows:glassBatchRows().filter(r=>r.orderId===o.id).length,queued:optimizationMatches(o,'batch'),needs:glassOrderNeedsCut(o),route:ncRoute(o,1)};
 }),{rows:0,queued:false,needs:false,route:['IGU','SHIPR','SHIP']});
 eq('the Sales cut estimate leaves bought glass out with a reason',await t.p.evaluate(()=>{const s=cutEstScan(salesRecord(ncMixed.id));return {pieces:s.pieces.length,skipped:[...new Set(s.skipped.map(x=>x.reason))]};}),{pieces:3,skipped:['Bought glass · no cut']});
 eq('Sales shows the glass as bought and Master Data has the tick',await t.p.evaluate(()=>{
  const meta=salesGlassMeta(ncCOG).includes('Bought · no cut');tab='masterdata';mdGlassEdit(ncCOG.id);render();const box=document.getElementById('md_cut');
  return {meta,box:!!box,checked:box&&box.checked};
 }),{meta:true,box:true,checked:false});
 eq('glass no cut screens have no JavaScript errors',t.errs,[]);await t.c.close();
};
