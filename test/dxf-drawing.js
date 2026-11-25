/* Форма из DXF, 25.11.2026 (владелец тестировал треугольник из файла):
   - «где сверху бордер?» — вершина треугольника даёт бордер сверху, число,
     введённое на прямую сторону, остаётся;
   - чертёж DXF — как у обычной формы: длины кромок, углы, отступ вершины,
     в дюймах и в мм; печать — тот же чертёж;
   - Cutting allowance до 10″;
   - штамп без рамки, тянется мышкой, по умолчанию весь на стекле; клик
     считается в той же рамке, что и чертёж («штамп поплыл»). */
module.exports=async function({page,eq}){
 console.log('dxf-drawing');const t=await page();
 await t.p.evaluate(()=>{
  const g=(...kv)=>{let s='';for(let i=0;i<kv.length;i+=2)s+=kv[i]+'\n'+kv[i+1]+'\n';return s;};
  const pts=[[0,0],[78.8125,0],[39.40625,84.375]];
  const text=g(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,1,0,'ENDSEC')+g(0,'SECTION',2,'ENTITIES')+g(0,'LWPOLYLINE',8,'0',90,3,70,1)+pts.map(p=>g(10,p[0],20,p[1])).join('')+g(0,'ENDSEC',0,'EOF');
  window.dxTri=()=>{const r=shapeParseFusionDxf(text);tab='configurators';openShapeNew('rectangle');sDraft.thickness='6';sDraft.name='Tri';
   sDraft.source={kind:'dxf',fileName:'U1 OF 3.dxf',fileSize:2400,uploadedAt:'2026-11-24T12:00:00.000Z',note:'',preview:r.preview};
   sDraft.w=frac64(r.preview.width16/16);sDraft.h=frac64(r.preview.height16/16);render();};
 });
 eq('Safety Border: вершина треугольника — верх; ручное число на основании — низ',await t.p.evaluate(()=>{
  dxTri();const pad=()=>{const fp=ShapeModule.dxfCuttingPlan(sDraft).footprint;return [fp.pad.left,fp.pad.right,fp.pad.top,fp.pad.bottom];};
  const auto=pad();sDraft.safetyBorderEdges={seg1:'20',seg2:'20',seg3:'20'};const manual=pad();
  const preset=normalizeShapeDef(Object.assign(newShapeDef('triangle'),{w:'78 13/16',h:'84 3/8',thickness:'6'}));preset.params.topOffset='39 13/32';
  const fp=ShapeModule.compute(preset).cutting.footprint;
  const rect=normalizeShapeDef(Object.assign(newShapeDef('rectangle'),{w:'48',h:'36',thickness:'6'}));rect.safetyBorderEdges={A:'2'};
  /* Прямоугольник: ручной бордер прямой стороны — только на свою сторону. */
  const rp=ShapeModule.compute(rect).cutting.footprint;
  return {auto,manual,preset:[fp.pad.top,fp.pad.bottom],rect:rp.sides.length+':'+Object.values(rp.pad).sort().join(',')};
 }),{auto:[1,1,1,0],manual:[20,20,20,20],preset:[1,0],rect:'1:0,0,0,2'});
 eq('чертёж DXF: длины кромок, отступ вершины, углы; мм — мм и углы; печать — тот же чертёж',await t.p.evaluate(()=>{
  dxTri();setShapeMetricDetail(false);sView='production';render();
  const txt=s=>{const d=document.createElement('div');d.innerHTML=s;return d.textContent;};
  const inch=txt(document.getElementById('shapeLivePreview').innerHTML),print=txt(shapeSheetSvgBody(shapeDraftResult(),false));
  setShapeMetricDetail(true);const mm=txt(document.getElementById('shapeLivePreview').innerHTML);setShapeMetricDetail(false);
  return {sides:(inch.match(/93 1\/8/g)||[]).length,apex:inch.includes('39 7/16'),angle:inch.includes('50.06°'),file:inch.includes('Tri · DXF'),
   oldRed:!!document.querySelector('#shapeLivePreview .shape-dxf-dim-line'),print:print.includes('39 7/16')&&print.includes('93 1/8'),
   mm:mm.includes('2365.34')&&mm.includes('1000.92'),mmButton:!document.querySelector('.shape-metric-toggle').disabled};
 }),{sides:2,apex:true,angle:true,file:true,oldRed:false,print:true,mm:true,mmButton:true});
 eq('Cutting allowance: 5″ принимается, 12″ — нет',await t.p.evaluate(()=>{
  dxTri();setShapeEdgeAllowanceEdge('seg1','5');const a=(sDraft.edgeAllowances||{}).seg1;setShapeEdgeAllowanceEdge('seg2','12');
  return [a,(sDraft.edgeAllowances||{}).seg2||null,SHAPE_ALLOWANCE_MAX_IN];
 }),['5',null,10]);
 eq('штамп: весь на стекле, без рамки, мышкой — на новое место; клик — в рамке чертежа',await t.p.evaluate(async()=>{
  dxTri();addShapeFeature('stamp');sView='production';render();
  const f=sDraft.features.find(x=>x.type==='stamp'),T=shapeProdDxfTransform(),P=T.P,spec=shapeStampDrawingSpec(f),hw=spec.w/2/T.sc,hh=spec.h/2/T.sc,x=inch(f.x),y=inch(f.y);
  const inside=[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].every(d=>fabPointInPoly([x+d[0],y+d[1]],P));
  const el=document.querySelector('#shapeLivePreview .shape-temper-stamp[data-stamp-id]'),frame=el.querySelector('rect').getAttribute('stroke');
  const svg=el.ownerSVGElement,r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,k=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
  const ev=(type,x2,y2,target)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x2,clientY:y2,pointerId:1,button:0}));
  ev('pointerdown',cx,cy,el);ev('pointermove',cx-10*T.sc*k,cy-5*T.sc*k,el);ev('pointerup',cx-10*T.sc*k,cy-5*T.sc*k,el);
  const f2=sDraft.features.find(x=>x.type==='stamp'),moved=[+(inch(f2.x)-x).toFixed(2),+(inch(f2.y)-y).toFixed(2)];
  /* Перетащить за стекло — штамп остаётся где был. */
  const el2=document.querySelector('#shapeLivePreview .shape-temper-stamp[data-stamp-id]'),r2=el2.getBoundingClientRect();
  ev('pointerdown',r2.left+r2.width/2,r2.top+r2.height/2,el2);ev('pointermove',r2.left-2000,r2.top,el2);ev('pointerup',r2.left-2000,r2.top,el2);
  const f3=sDraft.features.find(x=>x.type==='stamp');
  const D=shapeDrawnPreviewTransform(shapeProdDxfDrawResult(),shapeProdDxfDrawExtra());
  return {inside,frame,moved,kept:f3.x===f2.x&&f3.y===f2.y,sameFrame:D.sc===T.sc&&D.x0===T.x0};
 }),{inside:true,frame:'none',moved:[-10,5],kept:true,sameFrame:true});
};
