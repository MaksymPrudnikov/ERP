/* Фурнитура на краю внутреннего выреза и радиус выреза на чертеже (владелец,
   27.11.2026: «внутри выреза нужно разместить петли, иногда клемы»; вариант A —
   расстояние от угла выреза; «задал радиус, а на чертеже его не видно»). */
module.exports=async function({page,eq}){
 console.log('cutout hardware');
 const t=await page(undefined,{width:1500,height:1100});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await run(()=>{window.chOpen=()=>{tab='sales';salesOrderNew('order');salesSetUnitType('single');const l=soDraft.lines[0];l.width16=800;l.height16=1280;salesEnsureLineShape(l);salesOrderConfigureShape(0);sView='production';
  sDraft.features.push(shapeNormalizeFeature({type:'cutout',x:'15',y:'20',width:'20',height:'40',cornerRadius:'4'}));
  sDraft.manufacturingItems.push(shapeNormalizeManufacturingItem({type:'hinge',edge:'left',distance:5}),shapeNormalizeManufacturingItem({type:'clamp',edge:'left',distance:35}));
  sWorkspaceTab='cutout';render();return sDraft.features[sDraft.features.length-1];};});

 eq('Edge: стороны выреза в списке; петля — 10 от нижнего угла выреза, клема — 25 по правому краю; дальше края выреза — нельзя',await run(()=>{
  const cut=chOpen(),[h,c]=sDraft.manufacturingItems;sManufacturingSelected=h.id;render();
  const opts=[...document.querySelector('.shape-mi-card.expanded select[data-on-change]')?document.querySelectorAll('.shape-mi-card.expanded label select'):[]].map(s=>[...s.options].map(o=>o.textContent)).find(a=>a.length===8)||[];
  shapeSetManufacturingEdge(h.id,'cut:'+cut.id+':left');shapeSetManufacturingDistance(h.id,'10');
  shapeSetManufacturingEdge(c.id,'cut:'+cut.id+':right');shapeSetManufacturingDistance(c.id,'25');
  const g=shapeManufacturingGeometry(),p=it=>{const q=shapeManufacturingEdgePoint(it,g);return [q.x,q.y];};
  const before=c.distance;shapeSetManufacturingDistance(c.id,'41');
  return {opts:opts.slice(4),hinge:p(h),clamp:p(c),keep:c.distance===before,summary:shapeMiEdgeTitle(h)};
 }),{opts:['Cutout 20″ × 40″ · Left','Cutout 20″ × 40″ · Right','Cutout 20″ × 40″ · Bottom','Cutout 20″ × 40″ · Top'],hinge:[15,30],clamp:[35,45],keep:true,summary:'Cutout 20″ × 40″ · Left'});

 eq('вырез сдвинули — петля едет с ним; клик у края выреза ставит на него; Save и чтение, требования цеха сохраняют вырез; удалили вырез — фурнитура на том же крае стекла',await run(()=>{
  const cut=chOpen(),[h]=sDraft.manufacturingItems;shapeSetManufacturingEdge(h.id,'cut:'+cut.id+':left');shapeSetManufacturingDistance(h.id,'10');
  cut.x='20';const moved=shapeManufacturingEdgePoint(h,shapeManufacturingGeometry());
  const near=shapeNearestManufacturingEdge(20.4,35,shapeManufacturingGeometry());
  const back=normalizeShapeDef(JSON.parse(JSON.stringify(sDraft))).manufacturingItems.map(x=>x.cutoutId===cut.id?'cut':'glass');
  const req=ShapeModule.compute(sDraft).requirements.filter(r=>r.manufacturingItemId===h.id).map(r=>r.params.cutoutId===cut.id);
  removeShapeFeature(sDraft.features.indexOf(cut));
  return {moved:[moved.x,moved.y],near:[near.edge,near.cutoutId===cut.id],back,req,after:sDraft.manufacturingItems.map(x=>x.edge+(x.cutoutId?'*':''))};
 }),{moved:[20,30],near:['left',true],back:['cut','glass'],req:[true],after:['left','left']});

 eq('радиус углов выреза подписан на чертеже «R 4»; без радиуса подписи нет',await run(()=>{
  chOpen();const r=ShapeModule.compute(sDraft),svg=ShapeModule.productionSvg(r);
  const cut=sDraft.features.find(f=>f.type==='cutout');cut.cornerRadius='0';const svg0=ShapeModule.productionSvg(ShapeModule.compute(sDraft));
  const el=document.createElement('div');el.innerHTML=svg;
  return {r:(el.querySelector('[data-cutout-radius] text')||{}).textContent,none:!/data-cutout-radius/.test(svg0)};
 }),{r:'R 4',none:true});

 eq('фурнитура в вырезе без ошибок страницы',t.errs,[]);await t.c.close();
};
