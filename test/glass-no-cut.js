/* «We cut it» on a glass (owner, 14 October 2026, like Spil): bought or
   customer glass such as COG is never batched or cut. Only cutting is
   skipped; the rest of its route follows the services on the lite. */
module.exports=async function({page,eq}){
 console.log('glass no cut');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  oqReset();window.ncC=oqCustomer();
  window.ncCOG=glassProductByCode('6COG');
  window.ncOrder=(lites)=>{const id=oqOrder(ncC),o=salesRecord(id);lites.forEach(i=>{Object.assign(o.makeups[0].panes[i],{glassProductId:ncCOG.id,heatTreatmentId:'HT-AN'});});soDraft=null;soEdit=null;salesSetRecordStatus(id,'verified');return salesRecord(id);};
  window.ncRoute=(o,lite)=>{const l=o.lines[0],c=glassBatchComponents(o,l).find(c=>c.lite===String(lite));return finWithOrder(o,()=>stkRoute(o,l,c)).codes;};
  window.ncPane=(o,patch)=>{const p=JSON.parse(JSON.stringify(o));Object.assign(p.makeups[0].panes[1],patch);return ncRoute(p,2);};
 });
 eq('the catalogue has one manufacturer COG, 3–19 mm, not cut; other glass is cut',await t.p.evaluate(()=>{const cog=DB.glassProduct.filter(g=>g.manufacturer==='COG');return {mm:cog.map(g=>g.thicknessMm),names:cog[3].name,cut:cog.every(g=>g.cut===false),preorder:glassIsPreorder(ncCOG),fresh:normalizeGlassProduct({code:'X'}).cut,base:glassProductByCode('6CLEAR').cut,imported:prepareImportedState(storageExportEnvelope()).glassProduct.find(g=>g.code==='6COG').cut};}),
  {mm:[3,4,5,6,8,10,12,16,19],names:'COG 6mm',cut:true,preorder:false,fresh:true,base:true,imported:false});
 eq('a saved catalogue gets the missing COG glass once, without touching what the owner made',await t.p.evaluate(()=>{
  const old=JSON.parse(JSON.stringify(storageExportEnvelope()));old.data.dataFix=6;old.data.glassProduct=old.data.glassProduct.filter(g=>g.manufacturer!=='COG'||g.code==='8COG');const own=old.data.glassProduct.find(g=>g.code==='8COG');own.name='Customer 8 mm';own.cut=true;
  const d=prepareImportedState(old);const cog=d.glassProduct.filter(g=>g.manufacturer==='COG');return {n:cog.length,own:[d.glassProduct.find(g=>g.code==='8COG').name,d.glassProduct.find(g=>g.code==='8COG').cut],fix:d.dataFix};
 }),{n:9,own:['Customer 8 mm',true],fix:7});
 eq('in an IGU with a COG lite only our own lite waits in To batch',await t.p.evaluate(()=>{
  const o=ncOrder([1]),rows=glassBatchRows().filter(r=>r.orderId===o.id);window.ncMixed=o;
  return {rows:rows.length,lites:[...new Set(rows.map(r=>r.lite))],progress:glassBatchProgress(o),queued:optimizationMatches(o,'batch')};
 }),{rows:3,lites:['1'],progress:{total:3,left:3,assigned:0},queued:true});
 eq('a COG lite with nothing added goes straight to IGU, with no default edge; our lite still starts at CUT',await t.p.evaluate(()=>({cog:ncRoute(ncMixed,2),own:ncRoute(ncMixed,1)[0],ownIgu:ncRoute(ncMixed,1).includes('IGU'),edge:salesPaneBaseEdgework(ncMixed.makeups[0].panes[1],'double')})),{cog:['IGU','SHIPR','SHIP'],own:'CUT',ownIgu:true,edge:''});
 eq('services added to COG glass lead it through their own stations, cutting stays skipped',await t.p.evaluate(()=>{
  const heat=ncPane(ncMixed,{heatTreatmentId:'HT-FT'}),polish=ncPane(ncMixed,{edgework:'polish'}),both=ncPane(ncMixed,{edgework:'polish',heatTreatmentId:'HT-FT'});
  return {heat,polish:polish.length===4&&polish[0]!=='CUT'&&polish[1]==='IGU',order:both.indexOf('HEAT')>both.indexOf(polish[0])&&both.indexOf('HEAT')<both.indexOf('IGU'),cut:[heat,polish,both].some(r=>r.includes('CUT'))};
 }),{heat:['HEAT','IGU','SHIPR','SHIP'],polish:true,order:true,cut:false});
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
  const meta=salesGlassMeta(ncCOG).includes('No cut')&&!salesGlassMeta(ncCOG).includes('pre-order');tab='masterdata';mdGlassEdit(ncCOG.id);render();const box=document.getElementById('md_cut');
  return {meta,box:!!box,checked:box&&box.checked};
 }),{meta:true,box:true,checked:false});
 eq('glass no cut screens have no JavaScript errors',t.errs,[]);await t.c.close();
};
