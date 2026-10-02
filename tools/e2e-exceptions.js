const { chromium } = require('playwright');
const path = require('path');

async function run(){
 const browser=await chromium.launch(),context=await browser.newContext();await context.addInitScript(()=>{window.GF_NO_SIGNIN=true;});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('file://'+path.resolve(__dirname,process.env.TARGET==='dist'?'../dist/GLASS_ERP.html':'../src/index.html'));
 await require('../test/optimization-fixture')(page);
 const result=await page.evaluate(()=>{
  const who={id:'pilot',name:'Pilot Worker'};
  function start(){
   oqReset();DB.stationScan=[];DB.stationScanSeq=0;
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
   const id=oqOrder(oqCustomer({legalName:'Damage Pilot',paymentMode:'credit'}));salesOrderEdit(id);
   const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:36*16,height16:24*16,qty:2,mark:'Broken test'})];
   salesEnsureLineShape(soDraft.lines[0]);salesOrderSave();soDraft=null;soEdit=null;
   salesSetRecordStatus(id,'verified');const b=glassBatchAssign(glassBatchRows([salesRecord(id)]),{});cutPlanRun(b.number);
   return {id,b,ids:b.items.map(i=>i.piece)};
  }
  function move(st,piece){const c=stationCheck(st,piece),r=stationMove(st,c,who,{});return {kind:c.kind,ok:r.ok,error:r.error||''};}
  const out=[];
  try{
   const x=start(),a=x.ids[0];move('CUT',a);
   const reason=ncrReasonsFor('CUT',{activeOnly:true}).find(r=>r.name==='Broke');
   const damaged=stationBreak('CUT',stationCheck('CUT',a),who,reason.id),replacement=damaged.newIds[0];
   const waiting=glassBatchRows([salesRecord(x.id)]).map(r=>r.piece),newBatch=glassBatchAssign(glassBatchRows([salesRecord(x.id)]),{});cutPlanRun(newBatch.number);
   const cut=move('CUT',replacement),old=stationCheck('CUT',a).kind;
   out.push({name:'CUT break',damaged:damaged.ok,recut:DB.recut.map(r=>r.no),replacement,waiting,originalBatch:x.b.number,newBatch:newBatch.number,newPlan:!!cutPlanFor(newBatch.number),cut,old,originalStatus:glassBatchStatus(x.b),replacementStatus:glassBatchStatus(newBatch)});
  }catch(e){out.push({name:'CUT break',error:e.message,stack:e.stack});}
  try{
   const x=start(),a=x.ids[0];move('CUT',a);
   const reason=ncrReasonsFor('ARRIS',{activeOnly:true}).find(r=>r.name==='Fell from dolly / skid');
   const lost=stationBreak('ARRIS',stationCheck('ARRIS',a),who,reason.id),replacement=lost.newIds[0],queue=glassBatchRows([salesRecord(x.id)]).map(r=>r.piece);
   const next=glassBatchAssign(glassBatchRows([salesRecord(x.id)]),{});cutPlanRun(next.number);
   const follow=['CUT','ARRIS'].map(st=>move(st,replacement));
   out.push({name:'lost at ARRIS',reason:reason&&reason.name,lost:lost.ok,recut:DB.recut.map(r=>r.no),replacement,queue,next:next.number,follow,old:stationCheck('ARRIS',a).kind,waiting:stationPlace(stationGlass(replacement)).waiting});
  }catch(e){out.push({name:'lost at ARRIS',error:e.message,stack:e.stack});}
  try{
   const x=start();for(const st of stationRouteOf(stationGlass(x.ids[0])).codes)for(const piece of x.ids)move(st,piece);
   salesSetRecordStatus(x.id,'ready');salesSetRecordStatus(x.id,'done',{delivery:'pickup'});
   const reason=ncrReasonsFor('SHIP',{activeOnly:true}).find(r=>r.name==='Broke in transit');
   const l=salesRecord(x.id).lines[0],n=ncrCreate({orderId:x.id,where:'SHIP',reasonId:reason.id,action:'Remake order',lines:{[l.id]:{on:true,qty:1,which:'unit'}},note:'Pilot damage after delivery'});
   const record=n&&n.ncr,remake=record&&record.remakeOrderId&&salesRecord(record.remakeOrderId);
   out.push({name:'after delivery NCR',original:salesRecord(x.id).status,ncr:record&&record.number,error:n&&n.error,action:record&&record.action,remake:remake&&{number:remake.businessNumber,status:remake.status,noCharge:remake.noCharge,total:finOrderTotals(remake).grand},recuts:DB.recut.length,queue:remake&&glassBatchRows([remake]).length});
  }catch(e){out.push({name:'after delivery NCR',error:e.message,stack:e.stack});}
  return out;
 });
 await browser.close();return {result,errors};
}
module.exports=run;
if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exit(1);});
