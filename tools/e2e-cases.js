const { chromium } = require('playwright');
const path = require('path');

async function run() {
 const browser = await chromium.launch();
 const context = await browser.newContext();
 const page = await context.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('dialog', d => d.accept());
 await page.goto('file://' + path.resolve(__dirname, process.env.TARGET==='dist'?'../dist/GLASS_ERP.html':'../src/index.html'));
 await require('../test/optimization-fixture')(page);
 const result = await page.evaluate(() => {
  const cases = [
   { name: 'single rectangle', type: 'rectangle', count: 2, size: [36, 24] },
   { name: 'raked rectangle', type: 'raked', count: 2, size: [48, 36] },
   { name: 'smart skew radius', type: 'smart', count: 1, size: [37.625, 82.5625] },
   { name: 'circle', type: 'circle', count: 1, size: [36, 36] },
   { name: 'ellipse', type: 'ellipse', count: 1, size: [40, 28] },
   { name: 'double IGU', type: 'double', count: 1, size: [37, 71] },
   { name: 'triple IGU', type: 'triple', count: 1, size: [40, 60] },
   { name: 'laminated CNC twice', type: 'laminated', count: 1, size: [36, 28] }
  ];
  const out=[];
  for(const cfg of cases){
   try{
    oqReset();DB.stationScan=[];DB.stationScanSeq=0;
    if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
    const customer=oqCustomer({legalName:'Pilot '+cfg.name,paymentMode:'credit',creditDays:30});
    const id=oqOrder(customer);salesOrderEdit(id);
    const m=soDraft.makeups[0];
    if(cfg.type==='triple')salesSetUnitType('triple');
    if(!['double','triple'].includes(cfg.type)){
     m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
    }
    if(cfg.type==='laminated'){
     const pn=salesDefaultPane(0);pn.category='laminated';
     const gp=(DB.glassProduct||[]).find(x=>+x.thicknessMm===6);
     ['outer','inner'].forEach(k=>{pn.laminated[k].glassProductId=gp.id;pn.laminated[k].thicknessMm=6;pn.laminated[k].heatTreatmentId='HT-FT';});
     m.panes=[normalizeSalesPane(pn,0)];
    }
    soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:Math.round(cfg.size[0]*16),height16:Math.round(cfg.size[1]*16),qty:cfg.count,mark:cfg.name})];
    const l=soDraft.lines[0];salesEnsureLineShape(l);
    if(['raked','smart','circle','ellipse'].includes(cfg.type)){
     const shape=newShapeDef(cfg.type);shape.w=dimIn(cfg.size[0]).replace('″','');shape.h=dimIn(cfg.size[1]).replace('″','');shape.ownerLineId=l.id;
     if(cfg.type==='raked')Object.assign(shape.params,{shortHeight:'30',rakeSide:'top',shortSide:'left'});
     if(cfg.type==='smart'){shape.smart=ssNormalize({elbowsOn:false,C:{len:'82 11/16'},B:{out:'1/8',dir:'down'}});shape.features=[shapeNormalizeFeature({type:'radius',vertexId:'BL',radius:'8'})];}
     DB.shapeDef.push(shape);l.shapeRef=salesShapeRefFrom(shape);
    }
    if(cfg.type==='laminated'){
     const shape=salesLineGeometryShape(l);
     shape.edgeOps.A=[shapeNormalizeOp({type:'CNC Shape Polish'})];shape.edgeOps.C=[shapeNormalizeOp({type:'CNC Shape Polish'})];
     shape.edgeOps.B=[shapeNormalizeOp({type:'CNC Lami Polish'})];shape.edgeOps.D=[shapeNormalizeOp({type:'CNC Lami Polish'})];
    }
    const saved=salesOrderSave();soDraft=null;soEdit=null;
    const verified=salesSetRecordStatus(id,'verified');
    const batch=glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
    const built=cutPlanRun(batch.number),plan=cutPlanFor(batch.number),snap=cutMachineSnapshot(batch.number);
    const ids=batch.items.map(i=>i.piece),who={id:'pilot',name:'Pilot Worker'};
    const firstSheet=plan&&plan.groups[0]&&plan.groups[0].sheets[0];
    const exportState=firstSheet?['maver','disai'].map(machine=>{const r=cutTrialSheet(batch.number,plan.groups[0].glass,firstSheet.no,machine);if(r.error)return machine+':'+r.error;
     const file=machine==='maver'?cutTrialMaver(r):cutTrialDisai(r),pair=machine==='maver'?cutTrialMaverBmp(r):cutTrialDisaiSum(r);
     return machine+':'+(file.error||pair.error||(!file.data||!pair.data||!pair.data.length?'empty':'ok'));}):[];
    const sameSvg=firstSheet?(()=>{const pieces=cutPieces(batch,plan.settings||{}),a=document.createElement('div'),b=document.createElement('div');
     a.innerHTML=cutSheetSVG(plan.groups[0],firstSheet,700,pieces,{});b.innerHTML=stationSheetSVG(plan.groups[0],firstSheet,pieces,new Set(),'',false,new Set());
     const points=x=>[...x.querySelectorAll('.cut-glass')].map(y=>y.tagName+':'+(y.getAttribute('points')||['x','y','width','height'].map(k=>y.getAttribute(k)).join(',')));
     return JSON.stringify(points(a))===JSON.stringify(points(b))&&points(a).length===firstSheet.pieces.length;})():false;
    const sequence=[];
    const routes=ids.map(piece=>stationRouteOf(stationGlass(piece)).codes);
    for(let step=0;step<Math.max(...routes.map(r=>r.length));step++){
     for(let j=0;j<ids.length;j++){
      const st=routes[j][step];if(!st)continue;
      const check=stationCheck(st,ids[j]);
      if(check.kind==='already'){sequence.push(st+':already');continue;}
      const moved=stationMove(st,check,who,{});
      sequence.push(st+':'+check.kind+':'+!!moved.ok);
     }
    }
    const status=glassBatchStatus(batch),cutDone=batch.items.filter(i=>i.cutStartedAt).length,queue=glassBatchCutQueue().some(b=>b.number===batch.number),waiting=ids.map(piece=>stationPlace(stationGlass(piece)).waiting);
    const ready=salesSetRecordStatus(id,'ready'),done=salesSetRecordStatus(id,'done',{delivery:'pickup'});
    const order=salesRecord(id),balance=finOrderBalance(order);
    if(balance.total!=null&&balance.total>0)DB.receipt.push(normalizeReceipt({number:'R-PILOT',customerId:customer.id,amount:balance.total,allocations:[{orderId:id,amount:balance.total}]}));
    const paid=finOrderBalance(order),closed=salesSetRecordStatus(id,'closed');
    out.push({name:cfg.name,saved,verified,shapeRef:!!l.shapeRef.id,items:ids.length,built:!!plan,buildError:built&&built.error||'',sheetCount:plan?plan.groups.reduce((n,g)=>n+g.sheets.length,0):0,unplaced:plan?plan.groups.reduce((n,g)=>n+g.unplaced.length,0):0,sameSvg,machine:{valid:snap.valid,errors:snap.errors,files:exportState},routes,sequence,status,cutDone,queue,waiting,ready,done,closed,financial:{total:balance.total,balance:paid.balance,status:paid.status}});
   }catch(e){out.push({name:cfg.name,error:e.message,stack:e.stack});}
  }
  return out;
 });
 await browser.close();
 return {result,errors};
}
module.exports=run;
if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exit(1);});
