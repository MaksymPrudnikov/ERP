/* Eleven synthetic order journeys: ordinary and shaped glass, IGU and laminate,
   plus breakage, loss, Recut and an NCR after delivery. These run against the
   same browser code as the production screens, in an isolated test context. */
module.exports=async function({eq}){
 console.log('pilot orders');
 const normal=await require('../tools/e2e-cases')();
 eq('pilot journeys have no browser errors',normal.errors,[]);
 eq('eight synthetic orders completed',normal.result.length,8);
 normal.result.forEach(r=>{
  const label='pilot '+r.name;
  eq(label+' saves, verifies and places all glass',{
   saved:r.saved,verified:r.verified,built:r.built,unplaced:r.unplaced,sheets:r.sheetCount>0,
   sameDrawing:r.sameSvg,parts:r.items>0,error:r.error||r.buildError||''
  },{saved:true,verified:true,built:true,unplaced:0,sheets:true,sameDrawing:true,parts:true,error:''});
  eq(label+' exports a verified trial sheet for both tables',r.machine,
   {valid:true,errors:[],files:['maver:ok','disai:ok']});
  eq(label+' cuts each piece, completes the batch and empties the station queue',{
   steps:Array.isArray(r.sequence)&&r.sequence.every(s=>/:ok:true$|:already$/.test(s)),cut:r.cutDone===r.items,
   batch:r.status,queue:r.queue,waiting:Array.isArray(r.waiting)&&r.waiting.every(x=>!x)
  },{steps:true,cut:true,batch:'Cutting complete',queue:false,waiting:true});
  eq(label+' ships and settles exactly once',{
   ready:r.ready,done:r.done,closed:r.closed,total:r.financial.total>0,
   balance:r.financial.balance,status:r.financial.status
  },{ready:true,done:true,closed:true,total:true,balance:0,status:'paid'});
 });
 const byName=Object.fromEntries(normal.result.map(r=>[r.name,r]));
 eq('double and triple IGU join before shipping',[
  !!(byName['double IGU']&&byName['double IGU'].routes&&byName['double IGU'].routes.every(route=>route.includes('IGU'))),
  !!(byName['triple IGU']&&byName['triple IGU'].routes&&byName['triple IGU'].routes.every(route=>route.includes('IGU')))
 ],[true,true]);
 eq('laminate returns to CNC after joining',!!(byName['laminated CNC twice']&&byName['laminated CNC twice'].routes&&byName['laminated CNC twice'].routes.every(route=>route.filter(st=>st==='CNC').length===2)),true);
 const damage=await require('../tools/e2e-exceptions')();
 eq('damage journeys have no browser errors',damage.errors,[]);
 eq('three damage journeys completed',damage.result.length,3);
 const [cut,lost,ncr]=damage.result;
 eq('broken glass at CUT gets a fresh ID and a new planned batch',{
  damaged:cut.damaged,recuts:cut.recut,newId:/^G-\d{10,}-\d+$/.test(cut.replacement||'')&&cut.replacement===(cut.waiting||[])[0],
  next:cut.newBatch!==cut.originalBatch&&/^B-\d{4}$/.test(cut.newBatch||''),plan:cut.newPlan,cut:cut.cut&&cut.cut.ok,old:cut.old,status:cut.replacementStatus,error:cut.error||''
 },{damaged:true,recuts:[1],newId:true,next:true,plan:true,cut:true,old:'broken',status:'Cutting complete',error:''});
 eq('lost glass at ARRIS cannot proceed; replacement follows CUT and ARRIS',{
  reason:lost.reason,lost:lost.lost,queue:(lost.queue||[]).length===1&&lost.queue[0]===lost.replacement,follow:lost.follow&&lost.follow.map(x=>x.kind+':'+x.ok),old:lost.old,waiting:lost.waiting,error:lost.error||''
 },{reason:'Fell from dolly / skid',lost:true,queue:true,follow:['ok:true','ok:true'],old:'broken',waiting:'HEAT',error:''});
 eq('NCR after delivery creates one no-charge remake order',{
  original:ncr.original,ncr:ncr.ncr,action:ncr.action,remake:ncr.remake&&[ncr.remake.status,ncr.remake.noCharge,ncr.remake.total],recuts:ncr.recuts,error:ncr.error||''
 },{original:'done',ncr:'NCR1001',action:'Remake order',remake:['new',true,0],recuts:0,error:''});
};
