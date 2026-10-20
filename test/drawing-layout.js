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
 eq('layout values are cleaned and bounded',await t.p.evaluate(()=>shapeNormalizeDrawingLayout({'chain:bottom:B':{dx:9999,dy:'4',scale:5,hide:'yes'},'bad key!':{dx:1},'op:A':{dx:0,scale:1},'radius:R:BL':{hide:true,scale:.1,off:20}})),
  {'chain:bottom:B':{dx:1200,dy:4,scale:2},'radius:R:BL':{scale:.6,hide:true,off:8}});
 eq('a dimension line moves with its number, across itself only, with extension lines',await t.p.evaluate(()=>{
  const d=dlDef(),base=dlDoc(d),line=base.querySelector('.shape-layout-item[data-layout-key^="chain:bottom:"][data-layout-key$="|line"]'),key=line.getAttribute('data-layout-key');
  d.drawingLayout={[key]:{dy:20,dx:30,scale:2}};const moved=dlDoc(d),g=moved.querySelector('[data-layout-key="'+key+'"]');
  return {axis:line.getAttribute('data-layout-axis'),number:!!line.querySelector('.shape-layout-item'),transform:g.getAttribute('transform'),extensions:moved.querySelectorAll('.shape-layout-leader').length,
   menu:[...dlDoc(d,{annotation:{interactive:true,layoutSelected:key}}).querySelectorAll('.shape-layout-menu text')].map(x=>x.textContent)};
 }),{axis:'y',number:true,transform:'translate(0 20)',extensions:2,menu:['Hide','Reset','Chain −','Chain +']});
 /* Сдвиг вбок (dx у горизонтальной линии) не рисуется: раньше линия уезжала
    с детали, а выносные стояли на месте (аудит 21.10.2026). */
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
 /* Чертёж в мм (владелец, 20.10.2026): «как в смарт шейпе — и линию тянуть,
    и числа, и чтобы магнитилось». Фигура владельца: Smart 36 7/8 × 137 7/8,
    левая кромка уходит на 16 1/4 — верх во всю ширину 53 1/8, низ короче. */
 await t.p.evaluate(()=>{
  window.dlOwner=()=>{const d=newShapeDef('smart');d.w='36 7/8';d.h='137 7/8';d.smart=ssNormalize({});d.smart.elbowsOn=false;d.smart.A.out='16 1/4';d.smart.A.dir='left';
   const S={w:d.w,h:d.h,shape:{type:'smart',smart:d.smart}};ssSyncExtra(S);d.smart=S.shape.smart;return d;};
  window.dlMm=(d,o)=>new DOMParser().parseFromString(ShapeModule.productionSvg(ShapeModule.compute(d),Object.assign({metric:Object.assign({interactive:true},o||{})})),'image/svg+xml');
 });
 eq('mm: overall width sits on the full-width side, extension lines start at the glass',await t.p.evaluate(()=>{
  const doc=dlMm(dlOwner()),contour=doc.querySelector('.shape-metric-contour').getAttribute('d').replace(/[MLZ]/g,' ').trim().split(/\s+/).map(Number);
  const pts=[];for(let i=0;i<contour.length;i+=2)pts.push([contour[i],contour[i+1]]);
  const top=Math.min(...pts.map(p=>p[1])),left=Math.min(...pts.map(p=>p[0])),right=Math.max(...pts.map(p=>p[0]));
  const w=doc.querySelector('[data-metric-role="width"]');
  const feet=[...doc.querySelectorAll('.shape-dim-foot[data-foot-of="mm:overall:width"]')].map(l=>[+l.getAttribute('x1'),+l.getAttribute('y1')]);
  const onGlass=f=>pts.some(p=>Math.abs(p[0]-f[0])<.01&&Math.abs(p[1]-f[1])<.01);
  return {above:+w.getAttribute('y')<top,text:w.textContent,feet:feet.filter(onGlass).length,ends:feet.map(f=>f[0]).sort((a,b)=>a-b).map(x=>Math.round(x))[0]===Math.round(left)&&Math.round(feet.map(f=>f[0]).sort((a,b)=>b-a)[0])===Math.round(right)};
 }),{above:true,text:'1349.38',feet:2,ends:true});
 eq('mm: every label is a layout item with an mm key named by its edges',await t.p.evaluate(()=>{
  const keys=[...dlMm(dlOwner()).querySelectorAll('.shape-layout-item')].map(g=>g.getAttribute('data-layout-key'));
  return {all:keys.every(k=>k.indexOf('mm:')===0),edges:keys.filter(k=>/^mm:edge:/.test(k)&&!/\|line$/.test(k)).sort(),angles:keys.filter(k=>k.indexOf('mm:angle:')===0).sort(),lines:keys.filter(k=>/\|line$/.test(k)).sort()};
 }),{all:true,edges:['mm:edge:A','mm:edge:B'],angles:['mm:angle:A~D','mm:angle:B~A','mm:angle:C~B','mm:angle:D~C'],lines:['mm:edge:B|line','mm:overall:height|line','mm:overall:width|line']});
 eq('mm: the width line can be dragged to the far side; extensions follow it from the glass',await t.p.evaluate(()=>{
  const d=dlOwner();d.drawingLayout={'mm:overall:width|line':{dy:900}};
  const doc=dlMm(d),g=doc.querySelector('[data-layout-key="mm:overall:width|line"]'),line=g.querySelector('line[marker-start]');
  const y=+line.getAttribute('y1')+900,feet=[...doc.querySelectorAll('.shape-dim-foot[data-foot-of="mm:overall:width"]')];
  const bottom=Math.max(...doc.querySelector('.shape-metric-contour').getAttribute('d').replace(/[MLZ]/g,' ').trim().split(/\s+/).map(Number).filter((v,i)=>i%2));
  return {transform:g.getAttribute('transform'),belowGlass:y>bottom,feet:feet.length,feetReach:feet.every(l=>Math.abs(+l.getAttribute('y2')-(y+8))<.01)};
 }),{transform:'translate(0 900)',belowGlass:true,feet:2,feetReach:true});
 eq('mm: labels keep their edge after a vertex is added; inch layout ignores mm keys',await t.p.evaluate(()=>{
  const d=dlOwner();d.drawingLayout={'mm:edge:B':{dx:24},'mm:angle:B~A':{scale:1.5}};
  const before=dlMm(d).querySelector('[data-layout-key="mm:edge:B"] .shape-metric-length').getAttribute('data-edge-id');
  d.smart.corners.br='single';const S={w:d.w,h:d.h,shape:{type:'smart',smart:d.smart}};ssSyncExtra(S);d.smart=S.shape.smart;Object.keys(d.smart.extraEdges).forEach(k=>d.smart.extraEdges[k].len='4');
  const doc=dlMm(d),g=doc.querySelector('[data-layout-key="mm:edge:B"]'),inch=new DOMParser().parseFromString(ShapeModule.productionSvg(ShapeModule.compute(d),{annotation:{interactive:true,layout:d.drawingLayout}}),'image/svg+xml');
  return {before,after:g&&g.querySelector('.shape-metric-length').getAttribute('data-edge-id'),moved:!!g&&(g.getAttribute('transform')||'').startsWith('translate(24 0)'),inchTouched:inch.querySelectorAll('[data-layout-key^="mm:"]').length};
 }),{before:'B',after:'B',moved:true,inchTouched:0});
 eq('mm: a hidden label leaves the sheet; the hidden list shows only its own mode',await t.p.evaluate(()=>{
  const oldDraft=sDraft,oldDetail=sMetricDetail,d=dlOwner();d.drawingLayout={'mm:angle:B~A':{hide:true},'op:A':{hide:true}};
  const sheet=new DOMParser().parseFromString(ShapeModule.productionSvg(ShapeModule.compute(d),{metric:{},sheet:true}),'image/svg+xml');
  sDraft=d;sMetricDetail=true;const mm=shapeMetricHiddenControlsHTML(ShapeModule.compute(d));sMetricDetail=false;const inch=shapeMetricHiddenControlsHTML(ShapeModule.compute(d));
  sDraft=oldDraft;sMetricDetail=oldDetail;
  return {angles:sheet.querySelectorAll('.shape-metric-angle').length,arcs:sheet.querySelectorAll('.shape-metric-angle-arc').length,ui:sheet.querySelectorAll('.shape-layout-ghost,.shape-layout-menu,[onpointerdown]').length,
   mm:(mm.match(/shapeLayoutShow/g)||[]).length,mmKey:mm.includes('mm:angle:B~A'),inch:(inch.match(/shapeLayoutShow/g)||[]).length,inchKey:inch.includes('op:A')};
 }),{angles:3,arcs:3,ui:0,mm:1,mmKey:true,inch:1,inchKey:true});
 /* Меню числа лежит внутри его линии размера. Нажатие на A+ уходило линии и
    выделяло её: в мм габарит 508 не увеличивался (владелец, 21.10.2026).
    Настоящий клик мыши — синтетическое событие этого не ловит. */
 await t.p.evaluate(()=>{window.dlKeep={d:sDraft,m:sMetricDetail,e:sEdit,t:tab,s:subtab};tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='90';sMetricDetail=true;render();shapeLayoutSelect('mm:overall:width');});
 await t.p.locator('#shapeLivePreview .shape-layout-menu .shape-dim-btn',{hasText:'A+'}).first().click();
 const dlScaled=await t.p.evaluate(()=>({scale:(sDraft.drawingLayout['mm:overall:width']||{}).scale,selected:sLayoutEdit&&sLayoutEdit.key}));
 await t.p.evaluate(()=>shapeLayoutSelect('mm:overall:width|line'));
 await t.p.keyboard.press('ArrowLeft');await t.p.keyboard.press('ArrowDown');
 const dlKeys=await t.p.evaluate(()=>{const out=JSON.parse(JSON.stringify(sDraft.drawingLayout['mm:overall:width|line']||{}));sEdit=dlKeep.e;sDraft=dlKeep.d;sMetricDetail=dlKeep.m;tab=dlKeep.t;subtab=dlKeep.s;sLayoutEdit=null;render();return out;});
 eq('mm: A+ in the menu of a number inside its line scales the number',dlScaled,{scale:1.1,selected:'mm:overall:width'});
 eq('arrow keys move a dimension line only across itself',dlKeys,{dy:4});
 eq('drawing layout has no browser errors',t.errs,[]);
 await t.c.close();
};
