/* Этап 7 плана доработок v1.16 (владелец, 30.10.2026: «делай этап 7»):
   пункт 1 — чертежи и герметик, пункт 9 — печать из производства, вес на
   чертеже — тем же расчётом, что в заказе. Выбор владельца: герметик —
   вариант 2 («Sealant: …» под камерой), Print drawing — A (в шапке окна
   Drawings), Print на CUT — вариант 2 (окно станции: «визуально проще
   выглядит печать, а так и надо»). Контрольный заказ — обезличенная копия
   P2610481 (план, раздел 18): размеры и уступы позиций 1, 3, 4, 10. */
module.exports=async function({page,eq}){
 console.log('drawing-print');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.dpDoc=h=>{const d=document.createElement('div');d.innerHTML=h;return d;};
  window.dpSheets=()=>{['6CLEAR','6E272'].forEach(code=>{if(!DB.glassSheet.some(s=>s.productCode===code&&+s.sheetWIn===130))DB.glassSheet.push(normalizeGlassSheet({productCode:code,supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'}));});};
  /* Makeup A: 6E272 #2 FT + 17/32 BWE + Argon + 6CLEAR FT; меньшее стекло — Lite 1, уступ слева. */
  window.dpCtl=function(seal){
   const cu=oqCustomer({legalName:'Sample Customer'});tab='sales';salesOrderNew('order');salesSetUnitType('double');
   const m=soDraft.makeups[0],lowe=glassProductByCode('6E272'),clear=glassProductByCode('6CLEAR');
   m.panes.forEach((p,i)=>{p.glassProductId=(i?clear:lowe).id;p.thicknessMm=6;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   if(seal)m.cavities.forEach(c=>{c.secondarySealantId=seal;});
   soDraft.lines=[];[['36 1/4','91 7/8',1],['43 7/16','91 7/8',1,'1'],['28 3/16','92 7/8',1,'1'],['41 1/2','92 1/2',1,'1 1/16']].forEach((x,i)=>{
    const l=normalizeSalesOrderLine({makeupId:m.id,width16:Math.round(inch(x[0])*16),height16:Math.round(inch(x[1])*16),qty:x[2],mark:'N'+(i+1)});soDraft.lines.push(l);salesEnsureLineShape(l);
    if(x[3])salesLineGeometryShape(l).lites={'0':{inset:{A:x[3]},edgeOps:{},mirror:false}};
   });
   salesApplyCustomerDefaults(cu.id);soDraft.customerPo='PO-SAMPLE';if(!salesOrderSave())throw new Error('control order not saved');
   const id=soDraft.id;soDraft=null;soEdit=null;return salesRecord(id);
  };
  window.dpDraw=(o,l,lite)=>finWithOrder(o,()=>salesLineDrawing(l,null,lite));
  window.dpLogin=function(){DB.user=DB.user.filter(u=>u.name!=='Ivan P.');DB.user.push({name:'Ivan P.',role:'Shop',station:'CUT',skills:[],pin:'0000'});normalizeUsers();try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}stationCode='CUT';tab='station';stationLogin(DB.user[DB.user.length-1].viewProfileId);};
  window.dpOut=function(){stationDrawer=null;stationSwitch();stationSheetView=null;tab='dashboard';render();};
  /* Производство не меняется печатью: сканы, батч, раскрой, сток, Glass ID. */
  window.dpProd=()=>JSON.stringify([DB.stationScan,DB.glassBatch,DB.cutPlan,DB.stockOffcut,DB.glassPiece,(DB.salesOrder||[]).map(o=>[o.status,o.lines])]);
  /* Смешанный батч: заказ IGU (6E272 + 6CLEAR) и одинарные 6CLEAR другого клиента. */
  window.dpBatch=function(){
   oqReset();DB.stationScan=[];DB.carrier=[];DB.carrierSeq={};DB.sheetBreak=[];stationLast=null;stationSheetView=null;stationDrawer=null;dpSheets();
   const a=dpCtl('SEAL-SIL'),cu=oqCustomer({legalName:'North Shore Windows'});tab='sales';salesOrderNew('order');salesSetUnitType('single');
   const mb=soDraft.makeups[0],clear=glassProductByCode('6CLEAR');mb.panes[0].glassProductId=clear.id;mb.panes[0].thicknessMm=6;
   soDraft.lines=[[30,40,2],[24,36,3]].map((x,i)=>{const l=normalizeSalesOrderLine({makeupId:mb.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:'B'+(i+1)});salesEnsureLineShape(l);return l;});
   salesApplyCustomerDefaults(cu.id);soDraft.customerPo='PO-2';if(!salesOrderSave())throw new Error('order B not saved');const bId=soDraft.id;soDraft=null;soEdit=null;
   oqThrough(a.id,'verified');oqThrough(bId,'verified');glassBatchAssign(glassBatchRows([salesRecord(a.id),salesRecord(bId)]),{});
   const n=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanRun(n);return n;
  };
  window.dpCount=n=>glassBatchActiveItems(glassBatchFind(n)).length;
  window.dpPlanOrder=(n,glass,no)=>cutPlanFor(n).groups.filter(g=>!glass||g.glass===glass).flatMap(g=>g.sheets.filter(s=>!no||s.no===no).flatMap(s=>s.pieces.map(p=>p.piece)));
 });

 /* Пункт 1, P1-R1…R4: листы 4/7/15 контрольного заказа — меньшее стекло
    рисовалось контурным слоем с «(90.00°)», серой заливкой, значком стекла и
    размерами только слева и снизу. Теперь — как лист большего (стр. 5). */
 eq('пункт 1: меньшее прямоугольное стекло — обычный дюймовый лист, как у большего: размер с каждой стороны, без «(90.00°)», заливки и значка стекла; геометрия и CUT те же; мм и обратно — тот же лист',await t.p.evaluate(()=>{
  oqReset();const o=dpCtl();
  const out=o.lines.slice(1).map(l=>{
   const geo=()=>JSON.stringify([ShapeModule.compute(salesLineGeometryShape(l)).fingerprint,salesLineStepInfo(l,o).lites.map(x=>[x.w,x.h])]),before=geo();
   const small=dpDoc(dpDraw(o,l,0).html),big=dpDoc(dpDraw(o,l,1).html);
   const nums=d=>[...d.querySelectorAll('.sheet-field svg text')].map(x=>x.textContent).filter(x=>/^\d/.test(x)).sort();
   const route=small.querySelector('.sheet-route').textContent.match(/CUT ([^›]+)/)[1].trim();
   return {angles:small.querySelectorAll('.shape-metric-angle').length,layer:!!small.querySelector('.shape-metric-layer'),hatch:!!small.querySelector('.shape-glass-hatch'),
    dims:nums(small).length,bigDims:nums(big).length,size:small.querySelector('.sheet-size').textContent,route,same:geo()===before};
  });
  const l=o.lines[1],inch1=dpDraw(o,l,0).html;sMetricDetail=true;const mm=dpDoc(dpDraw(o,l,0).html);sMetricDetail=false;const inch2=dpDraw(o,l,0).html;
  return {out,mm:!!mm.querySelector('.shape-metric-layer'),back:inch1===inch2};
 }),{out:[
  {angles:0,layer:false,hatch:false,dims:4,bigDims:4,size:'Finished 42 7/16″ × 91 7/8″',route:'42 7/16″ × 91 7/8″',same:true},
  {angles:0,layer:false,hatch:false,dims:4,bigDims:4,size:'Finished 27 3/16″ × 92 7/8″',route:'27 3/16″ × 92 7/8″',same:true},
  {angles:0,layer:false,hatch:false,dims:4,bigDims:4,size:'Finished 40 7/16″ × 92 1/2″',route:'40 7/16″ × 92 1/2″',same:true}],mm:true,back:true});

 /* Фигура: свой контур меньшего стекла остаётся, но в дюймах — без заливки
    и подписей прямых углов (уголок, как у обычного чертежа), углы фигуры
    остаются; кегль размеров 18. Metric detail — как был. */
 eq('пункт 1: меньшее стекло фигуры в дюймах — без «(90.00°)», заливки и значка стекла, прямой угол — уголок, острые углы подписаны, размер кеглем 18; в Metric detail — как был',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesOrderEdit(id);const sh=salesLineGeometryShape(soDraft.lines[0]);
  sh.type='triangle';sh.w='25 1/8';sh.h='33 1/4';sh.params=Object.assign({},sh.params,{topOffset:'0'});Object.assign(sh,normalizeShapeDef(sh));
  sh.lites={'0':{inset:{A:'10'},edgeOps:{},mirror:false}};salesOrderSave();const o=salesRecord(id),l=o.lines[0];soDraft=null;soEdit=null;
  const read=d=>{const texts=[...d.querySelectorAll('.shape-metric-angle')].map(x=>x.textContent);
   return {right:texts.filter(x=>x==='(90.00°)').length,other:texts.filter(x=>x!=='(90.00°)').length,mark:d.querySelectorAll('.shape-right-angle').length,
    fill:d.querySelector('.shape-metric-contour').getAttribute('fill'),hatch:!!d.querySelector('.shape-glass-hatch'),font:(d.querySelector('.shape-metric-length')||{getAttribute:()=>''}).getAttribute('font-size')};};
  const inchSheet=read(dpDoc(dpDraw(o,l,0).html));sMetricDetail=true;const mm=read(dpDoc(dpDraw(o,l,0).html));sMetricDetail=false;
  return {inch:inchSheet,mm};
 }),{inch:{right:0,other:2,mark:1,fill:'none',hatch:false,font:'18'},mm:{right:1,other:2,mark:0,fill:'#f2f4f7',hatch:true,font:'14.5'}});

 /* Пункт 1, P1-R5…R7: название вторичного герметика на каждом листе юнита
    и каждом листе стекла — у каждой камеры свой, вариант 2 владельца. */
 eq('пункт 1: герметик под каждой камерой на листе юнита и листах стёкол — Polysulphide по умолчанию, Silicone, новый из каталога, у Triple у каждой камеры свой, битая ссылка — not found; у ступеньки одной строкой со Step; порядок листов не влияет',await t.p.evaluate(()=>{
  oqReset();const seals=d=>[...d.querySelectorAll('.sheet-mk-rows .mk-row span')].filter(s=>/^Cavity/.test(s.textContent)).map(s=>(s.querySelector('small:last-of-type')||{textContent:''}).textContent);
  const ps=dpCtl(),sil=dpCtl('SEAL-SIL');
  DB.sealantProduct.push(normalizeSimpleMaterial({id:'SEAL-QA',name:'QA Hybrid',code:'QAH'},'sealant'));const qa=dpCtl('SEAL-QA');
  tab='sales';salesOrderNew('order');salesSetUnitType('triple');const m=soDraft.makeups[0];m.cavities[0].secondarySealantId='SEAL-SIL';m.cavities[1].secondarySealantId='SEAL-PS';
  soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:30*16,height16:40*16,qty:1,mark:'T1'})];salesEnsureLineShape(soDraft.lines[0]);
  salesApplyCustomerDefaults(oqCustomer().id);soDraft.customerPo='PO-T';salesOrderSave();const tri=salesRecord(soDraft.id);soDraft=null;soEdit=null;
  const gone=dpCtl('SEAL-SIL');gone.makeups[0].cavities[0].secondarySealantId='SEAL-GONE';
  const order=o=>o.lines.map(l=>dpDraw(o,l).html),fwd=order(sil),back=sil.lines.slice().reverse().map(l=>dpDraw(sil,l).html).reverse();
  return {ps:seals(dpDoc(dpDraw(ps,ps.lines[0]).html)),sil:seals(dpDoc(dpDraw(sil,sil.lines[0]).html)),qa:seals(dpDoc(dpDraw(qa,qa.lines[0]).html)),
   step:seals(dpDoc(dpDraw(sil,sil.lines[1]).html)),lites:[0,1].map(i=>seals(dpDoc(dpDraw(sil,sil.lines[1],i).html))[0]),
   triple:seals(dpDoc(dpDraw(tri,tri.lines[0]).html)),gone:seals(dpDoc(dpDraw(gone,gone.lines[0]).html)),sameOrder:fwd.join()===back.join()};
 }),{ps:['Sealant: Polysulphide'],sil:['Sealant: Silicone'],qa:['Sealant: QA Hybrid'],step:['Sealant: Silicone · Step · Flat seal'],
  lites:['Sealant: Silicone · Step · Flat seal','Sealant: Silicone · Step · Flat seal'],triple:['Sealant: Silicone','Sealant: Polysulphide'],gone:['Sealant not found'],sameOrder:true});

 /* Вес на листе — расчёт заказа (решение владельца 30.10.2026 для этапа 7):
    нормы заказа, геометрия лайтов строки; лист стекла — только его слои;
    неполный — «N kg · Partial» и чего нет; норма Data после Save лист не меняет. */
 eq('вес на чертеже — расчёт заказа: юнит со всем, что в нём, лист стекла — его стекло; Data после Save не меняет; ламинат без плотности плёнки — «63 kg · Partial» и чего нет, внесли плотность — полный',await t.p.evaluate(()=>{
  oqReset();const o=dpCtl('SEAL-SIL'),l=o.lines[1],w=salesLineWeight(l,o);
  const mass=h=>dpDoc(h).querySelector('.sheet-mass').textContent.split(' · ').slice(1).join(' · ');
  const unit=mass(dpDraw(o,l).html),lite=mass(dpDraw(o,l,0).html),liteKg=w.rows.filter(r=>r.lite===0).reduce((s,r)=>s+r.kg,0);
  const rate=DB.materialWeightRates.find(r=>r.key==='glass'),keep=rate.rate;rate.rate=keep+300;const after=mass(dpDraw(o,l).html);rate.rate=keep;
  tab='sales';salesOrderNew('order');salesSetUnitType('single');const m=soDraft.makeups[0],clear=glassProductByCode('6CLEAR'),pane=salesDefaultPane(0);pane.category='laminated';
  pane.laminated.outer.glassProductId=clear.id;pane.laminated.outer.thicknessMm=6;pane.laminated.inner.glassProductId=clear.id;pane.laminated.inner.thicknessMm=6;m.panes=[pane];m.cavities=[];
  const fid=pane.laminated.interlayers[0].productId;DB.materialWeightRates=DB.materialWeightRates.filter(x=>x.key!=='film:'+fid);
  soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:48*16,height16:72*16,qty:2,mark:'R1'})];salesEnsureLineShape(soDraft.lines[0]);
  salesApplyCustomerDefaults(oqCustomer().id);soDraft.customerPo='PO-L';salesOrderSave();const lam=salesRecord(soDraft.id);soDraft=null;soEdit=null;
  const part=dpDoc(dpDraw(lam,lam.lines[0]).html),partial=[mass(part.innerHTML),(part.querySelector('.sheet-mass-note')||{textContent:''}).textContent];
  DB.materialWeightRates.push({key:'film:'+fid,label:'Film',rate:1070,unit:'kg/m³',note:''});const full=dpDoc(dpDraw(lam,lam.lines[0]).html);
  return {unit:unit===Math.round(w.knownKg)+' kg',lite:lite===Math.round(liteKg)+' kg',more:w.knownKg>liteKg*2,after:after===unit,partial,full:[mass(full.innerHTML),!!full.querySelector('.sheet-mass-note')]};
 }),{unit:true,lite:true,more:true,after:true,partial:['63 kg · Partial','Interlayer weight not included'],full:['64 kg',false]});

 /* Пункт 9, P9-R1…R5: Print drawing в окне Drawings станции — ровно
    открытый лист (позиция, Lite, Recut), той же печатью, что офис. */
 eq('пункт 9: Print drawing на станции — открытый лист: Lite после стрелки, Recut со своим чертежом; нет листа — нет кнопки; производство не меняется, в журнале «Printed»',await t.p.evaluate(()=>{
  oqReset();const o=dpCtl('SEAL-SIL');tab='sales';salesOrderEdit(o.id);
  const reason=ncrReasonsFor('OFFICE',{activeOnly:true}).find(r=>r.name==='Drawing wrong').id;ncrOpenForm('recut');ncrFormSet('where','OFFICE');ncrFormSet('reasonId',reason);
  ncrFormLine(o.lines[0].id,'on',true,true);ncrFormLine(o.lines[0].id,'qty','1');ncrFormCreate();salesOpenRecutShape(DB.recut[0].id);sDraft.w='35';saveShape();soDraft=null;soEdit=null;
  dpLogin();const prod=dpProd(),keep=printSheet,got=[];printSheet=(h)=>{got.push([].concat(h));return true;};
  const press=()=>{const b=document.querySelector('[data-station-draw-print]');if(!b)return 'no button';b.click();const d=dpDoc(got[got.length-1].join(''));return [got[got.length-1].length,(d.querySelector('.sheet-lite')||{textContent:'unit'}).textContent,d.querySelector('.sheet-size').textContent,d.querySelector('.sheet-who b').textContent];};
  try{
   stationDrawOpen(o.id,o.lines[1].id,undefined,0);const lite1=press();stationDrawStep(1);const lite2=press();
   stationDrawOpen(o.id,o.lines[0].id,'R1.1');const recut=press();
   const shape=salesShapeByRef(o.lines[3].shapeRef),w=shape.w;shape.w='abc';stationDrawCache=new Map();stationDrawOpen(o.id,o.lines[3].id);const none=[!!document.querySelector('[data-station-draw-print]'),typeof stationDrawPrint==='function'&&stationDrawPrint()];shape.w=w;stationDrawCache=new Map();
   const log=(DB.orderEvent||[]).filter(e=>e.orderId===o.id&&e.what==='Printed').map(e=>e.note);
   return {lite1,lite2,recut,none,log,same:dpProd()===prod,closed:stationDrawer&&stationDrawer.kind};
  }finally{printSheet=keep;dpOut();}
 }),{lite1:[1,'Glass: Lite 1 of 2','Finished 42 7/16″ × 91 7/8″','2'],lite2:[1,'Glass: Lite 2 of 2','Finished 43 7/16″ × 91 7/8″','2'],
  recut:[1,'unit','Finished 35″ × 91 7/8″','1 · RECUT 1'],none:[false,false],log:['Drawing · Line 2 · Lite 1 · CUT','Drawing · Line 2 · Lite 2 · CUT','Drawing · Recut 1 · Line 1 · CUT'],same:true,closed:'draw'});

 /* Пункт 9, P9-R6…R13: Print на CUT — окно станции (вариант 2). Батч из
    двух заказов и двух стёкол; номера листов свои у каждого стекла. */
 eq('пункт 9: Print на CUT — текущий лист (стекло и номер): одна схема, его стёкла по месту на листе, сток после стёкол без чертежа; весь батч — по стеклу плана, листу и месту; батч изменился после открытия — сначала новые цифры; производство не меняется',await t.p.evaluate(()=>{
  const n=dpBatch(),plan=cutPlanFor(n),g=plan.groups.find(x=>x.glass==='6CLEAR'),sh=g.sheets.find(s=>(s.offcuts||[]).length)||g.sheets[0];
  dpLogin();stationSheetPick(n,'6CLEAR',sh.no);const prod=dpProd(),keepPrint=window.print;window.print=()=>{};
  try{
   const btn=document.querySelector('.st-sheet-card [data-station-print]');if(!btn)return 'no Print on CUT';btn.click();
   const win=document.querySelector('[data-station-print-window]'),tiles=[...win.querySelectorAll('[data-print-area]')].map(x=>x.querySelector('span').textContent);
   const total=plan.groups.reduce((a,x)=>a+x.sheets.length,0),wantTiles=['6CLEAR · Sheet '+sh.no+' · '+sh.pieces.length+' glass',total+' sheets · '+dpCount(n)+' glass'];
   const tags=()=>[...document.querySelectorAll('#printSheetHost .sheet-tag')].map(x=>x.textContent);
   const stk=()=>[...document.querySelectorAll('#stkPrintHost .stk-print-page')].map(p=>/S-\d{7}/.test(p.textContent)?'stock':(p.textContent.match(/G-\d{7}/)||[''])[0]);
   document.querySelector('[data-station-print-layouts]').click();const layout=[...document.querySelectorAll('#cutPrintHost .cut-print-page h3')].map(h=>/Sheet \d+ · \S+/.exec(h.textContent)[0]);
   document.querySelector('[data-station-print-drawings]').click();const drawings=tags();
   /* Кусок в сток после открытия окна: печать ждёт новых цифр. */
   const before=dpProd()===prod,sid=(sh.offcuts||[]).length?cutStockTake(n,g.glass,sh.no,0).id:'',prod2=dpProd();
   document.querySelector('[data-station-print-stickers]').click();const changed=[(document.querySelector('[data-station-print-error]')||{}).textContent,stk().length];
   document.querySelector('[data-station-print-stickers]').click();const stickers=stk(),classes=[...document.body.classList].filter(c=>/printing/.test(c));
   const cur={layout:layout.join()==='Sheet '+sh.no+' · 6CLEAR',drawings:drawings.length>0&&drawings.every(x=>x.startsWith(n+' · 6CLEAR · Sheet '+sh.no+' · '))&&drawings.map(x=>x.match(/G-\d{7}/)[0]).join()===dpPlanOrder(n,'6CLEAR',sh.no).join(),changed,
    stickers:stickers.join()===dpPlanOrder(n,'6CLEAR',sh.no).concat(sid?['stock']:[]).join(),classes};
   document.querySelector('[data-print-area="all"]').click();
   document.querySelector('[data-station-print-layouts]').click();const all=[...document.querySelectorAll('#cutPrintHost .cut-print-page h3')].map(h=>/Sheet \d+ · \S+/.exec(h.textContent)[0]);
   document.querySelector('[data-station-print-drawings]').click();const order=tags().map(x=>x.match(/G-\d{7}/)[0]);
   document.querySelector('[data-station-print-stickers]').click();const allStk=stk().filter(x=>x!=='stock');
   const notice=document.querySelector('[data-station-print-notice]').textContent,log=(DB.orderEvent||[]).filter(e=>e.what==='Printed'&&e.note.endsWith(' · '+n)).map(e=>e.note.split(' · ')[0]);
   return {tiles:tiles.join()===wantTiles.join(),cur,all:all.join()===plan.groups.flatMap(x=>x.sheets.map(s=>'Sheet '+s.no+' · '+x.glass)).join()&&all.length===total&&plan.groups.length===2,
    order:order.join()===dpPlanOrder(n).join(),stickers:allStk.join()===dpPlanOrder(n).join(),notice:notice==='✓ '+(dpCount(n)+(sid?1:0))+' stickers sent',log:[...new Set(log)],same:[before,dpProd()===prod2,!!sid]};
  }finally{window.print=keepPrint;printSheetCleanup();stkPrintCleanup();cutPrintCleanup();dpOut();}
 }),{tiles:true,
  cur:{layout:true,drawings:true,changed:['Batch changed — check and print again',0],stickers:true,classes:['stk-printing']},
  all:true,order:true,stickers:true,notice:true,log:['Drawings','Stickers'],same:[true,true,true]});

 /* Окно Print · Batch офиса на том же батче: «лист 1» двух стёкол больше не
    смешивается; This — лист, открытый в Optimization; номера 1, 2, 10. */
 eq('офис, Print · Batch из двух стёкол: 5 листов, This — лист Optimization (стекло и номер), заголовки со стеклом, Layouts · 5; листы 1, 2 … 10, 11 — по числу',await t.p.evaluate(()=>{
  const n=dpBatch(),plan=cutPlanFor(n);glassBatchOpen(n);glassBatchDetailTab='optimization';cutUi={batch:n,glass:'6E272',sheet:2,sel:'',drag:''};render();
  document.querySelector('[data-cut-print]').click();
  const sub=document.querySelector('.stk-modal p.mut').textContent,layouts=document.querySelector('[data-stk-print-layouts]').textContent.trim();
  document.querySelector('[data-stk-sheets-this]').click();
  const thisBtn=document.querySelector('[data-stk-sheets-this]').textContent,heads=[...document.querySelectorAll('.stk-sheet-row b')].map(b=>b.textContent),items=[...document.querySelectorAll('[data-stk-item]')].map(x=>x.dataset.stkItem);
  const want=dpPlanOrder(n,'6E272',2),count=dpCount(n),total=plan.groups.reduce((a,x)=>a+x.sheets.length,0);stkDialogClose();
  oqReset();dpSheets();const id=oqOrder(oqCustomer());salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
  soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:120*16,height16:90*16,qty:11,mark:'BIG'})];salesEnsureLineShape(soDraft.lines[0]);salesOrderSave();soDraft=null;soEdit=null;
  oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});const big=DB.glassBatch[DB.glassBatch.length-1].number;cutPlanRun(big);
  const jobs=stkBatchJobs(glassBatchFind(big),null,'sheet').map(j=>j.sheet);
  return {sub:sub===['6E272 / 6CLEAR',count+' glass',total+' sheets'].join(' · '),layouts:layouts==='Layouts · '+total,thisBtn,heads,items:items.length>0&&items.join()===want.join(),numeric:jobs.join()===jobs.slice().sort((a,b)=>a-b).join()&&jobs.length===11&&jobs[10]===11};
 }),{sub:true,layouts:true,thisBtn:'This · 6E272 2',heads:['6E272 · Sheet 2'],items:true,numeric:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
