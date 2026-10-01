/* Ручная раскладка подписей чертежа (владелец, 1 октября 2026): отдельное
   число цепочки, обработка кромки, R и подпись фурнитуры двигаются, меняют
   размер и скрываются. Раскладка живёт в форме, в отпечаток не входит и на
   печати идёт без интерфейса. */
module.exports=async function({page,eq}){
 console.log('drawing-layout');const t=await page();
 await t.p.evaluate(()=>{
  window.dlDef=()=>{const d=newShapeDef('smart');d.w='27 1/4';d.h='68 1/2';d.smart=ssNormalize({});d.smart.corners.bl='single';
   const S={w:d.w,h:d.h,shape:{type:'smart',smart:d.smart}};ssSyncExtra(S);d.smart=S.shape.smart;Object.keys(d.smart.extraEdges).forEach(k=>d.smart.extraEdges[k].len='6');
   d.edgeOps={A:[shapeNormalizeOp({type:'Flat Polish'})]};return d;};
  window.dlDoc=(d,opts)=>new DOMParser().parseFromString(ShapeModule.productionSvg(ShapeModule.compute(d),opts||{annotation:{interactive:true}}),'image/svg+xml');
  window.dlLines=doc=>[...doc.querySelectorAll('line[marker-start]')].map(l=>['x1','y1','x2','y2'].map(k=>l.getAttribute(k)).join()).join('|');
 });
 eq('layout values are cleaned and bounded',await t.p.evaluate(()=>shapeNormalizeDrawingLayout({'chain:bottom:B':{dx:999,dy:'4',scale:5,hide:'yes'},'bad key!':{dx:1},'op:A':{dx:0,scale:1},'radius:R:BL':{hide:true,scale:.1,off:20}})),
  {'chain:bottom:B':{dx:400,dy:4,scale:2},'radius:R:BL':{scale:.6,hide:true,off:8}});
 eq('a dimension line moves with its number, across itself only, with extension lines',await t.p.evaluate(()=>{
  const d=dlDef(),base=dlDoc(d),line=base.querySelector('.shape-layout-item[data-layout-key^="chain:bottom:"][data-layout-key$="|line"]'),key=line.getAttribute('data-layout-key');
  d.drawingLayout={[key]:{dy:20,dx:30,scale:2}};const moved=dlDoc(d),g=moved.querySelector('[data-layout-key="'+key+'"]');
  return {axis:line.getAttribute('data-layout-axis'),number:!!line.querySelector('.shape-layout-item'),transform:g.getAttribute('transform'),extensions:moved.querySelectorAll('.shape-layout-leader').length,
   menu:[...dlDoc(d,{annotation:{interactive:true,layoutSelected:key}}).querySelectorAll('.shape-layout-menu text')].map(x=>x.textContent)};
 }),{axis:'y',number:true,transform:'translate(30 20)',extensions:2,menu:['Hide','Reset','Chain −','Chain +']});
 eq('one chain number moves alone; dimension lines stay put',await t.p.evaluate(()=>{
  const d=dlDef(),base=dlDoc(d),keys=[...base.querySelectorAll('.shape-layout-item[data-layout-key^="chain:bottom:"]:not([data-layout-key$="|line"])')].map(g=>g.getAttribute('data-layout-key'));
  d.drawingLayout={[keys[0]]:{dx:24,scale:1.5}};const moved=dlDoc(d),items=[...moved.querySelectorAll('.shape-layout-item[data-layout-key^="chain:bottom:"]:not([data-layout-key$="|line"])')];
  return {several:keys.filter(k=>!k.endsWith('|line')).length>1,first:items[0].getAttribute('transform').startsWith('translate(24 0)')&&items[0].getAttribute('transform').includes('scale(1.5)'),
   others:items.slice(1).every(g=>!g.getAttribute('transform')),lines:dlLines(base)===dlLines(moved),leader:moved.querySelectorAll('.shape-layout-leader').length};
 }),{several:true,first:true,others:true,lines:true,leader:1});
 eq('hidden dimension leaves the printed sheet; editor keeps a ghost and Show',await t.p.evaluate(()=>{
  const d=dlDef(),key=dlDoc(d).querySelector('.shape-layout-item[data-layout-key^="chain:bottom:"]:not([data-layout-key$="|line"])').getAttribute('data-layout-key'),before=dlLines(dlDoc(d,{sheet:true}));
  d.drawingLayout={[key]:{hide:true},'op:A':{hide:true}};const print=dlDoc(d,{sheet:true}),screen=dlDoc(d);
  const old=sDraft;sDraft=d;const list=shapeLayoutHiddenHTML();sDraft=old;
  return {fewerLines:dlLines(print).split('|').length===before.split('|').length-1,noFp:![...print.querySelectorAll('text')].some(x=>x.textContent==='FP'),
   ghosts:screen.querySelectorAll('.shape-layout-ghost').length,printUi:print.querySelectorAll('.shape-layout-ghost,.shape-layout-menu,[onpointerdown]').length,show:(list.match(/Show /g)||[]).length};
 }),{fewerLines:true,noFp:true,ghosts:2,printUi:0,show:2});
 eq('selected label shows A− A+ Hide Reset only in the editor',await t.p.evaluate(()=>{
  const d=dlDef(),screen=dlDoc(d,{annotation:{interactive:true,layoutSelected:'op:A'}}),print=dlDoc(d,{sheet:true,annotation:{layoutSelected:'op:A'}});
  return {menu:[...screen.querySelectorAll('.shape-layout-menu text')].map(x=>x.textContent),print:print.querySelectorAll('.shape-layout-menu').length};
 }),{menu:['A−','A+','Hide','Reset'],print:0});
 eq('layout survives save, export and import without changing the fingerprint',await t.p.evaluate(()=>{
  const d=normalizeShapeDef(Object.assign(dlDef(),{drawingLayout:{'op:A':{dx:-8,dy:12}}})),plain=JSON.parse(JSON.stringify(d));plain.drawingLayout={};
  const same=ShapeModule.compute(d).fingerprint===ShapeModule.compute(plain).fingerprint;
  /* Импорт и чтение базы проходят через normalizeShapeDef — раскладка его переживает. */
  return {same,kept:normalizeShapeDef(JSON.parse(JSON.stringify(d))).drawingLayout};
 }),{same:true,kept:{'op:A':{dx:-8,dy:12}}});
 eq('drag snaps: a dimension number keeps one axis, a label sticks to its lines',await t.p.evaluate(()=>[
  shapeLayoutSnap({axis:'dim',dx0:0,dy0:0},37,5),shapeLayoutSnap({axis:'free',dx0:0,dy0:0},5,22),shapeLayoutSnap({axis:'free',dx0:0,dy0:0},30,14,true),shapeLayoutSnap({axis:'y',dx0:0,dy0:0},40,22)]),
  [[36,0],[0,24],[32,0],[0,24]]);
 eq('browser-only chain offsets move into the shape on the first layout edit',await t.p.evaluate(()=>{
  const oldDraft=sDraft,oldOffsets=sMetricOffsets,oldDetail=sMetricDetail;sMetricDetail=false;sDraft=dlDef();
  const scope=shapeMetricOffsetScope(ShapeModule.compute(sDraft),null,'inch');sMetricOffsets={[scope]:{'inch:chain:bottom':2}};
  shapeLayoutAdoptLegacy();const out={off:sDraft.drawingLayout['inch:chain:bottom'],left:!!sMetricOffsets[scope]};
  sDraft=oldDraft;sMetricOffsets=oldOffsets;sMetricDetail=oldDetail;shapeMetricSaveOffsets();return out;
 }),{off:{off:2},left:false});
 eq('hardware label in the editor is a movable item',await t.p.evaluate(()=>{
  tab='configurators';subtab='shape';openShapeNew('smart');
  sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({type:'clamp',edge:'left',distance:'12'})];
  const id=sDraft.manufacturingItems[0].id;sDraft.drawingLayout={['feat:'+id]:{dx:16}};render();
  const g=document.querySelector('#shapeLivePreview [data-layout-key="feat:'+id+'"]'),out={item:!!g,moved:!!g&&(g.getAttribute('transform')||'').startsWith('translate(16 0)')};
  sEdit=null;sDraft=null;render();return out;
 }),{item:true,moved:true});
 eq('drawing layout has no browser errors',t.errs,[]);
 await t.c.close();
};
