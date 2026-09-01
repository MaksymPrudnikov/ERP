/* =====================================================================
   shape/features · schema-v2
   Радиусы, отверстия, cutout, hardware prep и производные требования.
   ===================================================================== */

function shapeRadiusMap(def){var out={};(def.features||[]).forEach(function(f){if(f.type==='radius'&&f.vertexId)out[f.vertexId]=Math.max(0,inch(f.radius));});return out;}
function shapeApplyCornerRadii(topo,def){
  var V=topo.vertices||[],rmap=shapeRadiusMap(def),keys=Object.keys(rmap).filter(function(k){return rmap[k]>1e-9;});
  if(!keys.length||V.length<3)return Object.assign({radiusErrors:[]},topo);
  var orient=fabSignedArea(V.map(function(v){return [v.x,v.y];})),corners=[],errors=[],i;
  for(i=0;i<V.length;i++){
    var v=V[i],r=rmap[v.id]||0;if(!(r>0)){corners.push(null);continue;}
    var prev=V[(i-1+V.length)%V.length],next=V[(i+1)%V.length],u1=[prev.x-v.x,prev.y-v.y],u2=[next.x-v.x,next.y-v.y],l1=Math.hypot(u1[0],u1[1]),l2=Math.hypot(u2[0],u2[1]);
    if(l1<1e-8||l2<1e-8){errors.push('Radius '+v.id+': adjacent edge is degenerate.');corners.push(null);continue;}
    u1=[u1[0]/l1,u1[1]/l1];u2=[u2[0]/l2,u2[1]/l2];
    var cross=u1[0]*u2[1]-u1[1]*u2[0],convex=cross*orient<0;
    if(!convex){errors.push('Radius '+v.id+': concave corner fillets require a hardware/CNC template.');corners.push(null);continue;}
    var dot=Math.max(-1,Math.min(1,u1[0]*u2[0]+u1[1]*u2[1])),theta=Math.acos(dot),tan=Math.tan(theta/2),sin=Math.sin(theta/2);
    if(theta<.02||Math.PI-theta<.02||Math.abs(tan)<1e-8||Math.abs(sin)<1e-8){errors.push('Radius '+v.id+': corner angle cannot be filleted.');corners.push(null);continue;}
    var tangent=r/tan;if(tangent>=l1-1e-7||tangent>=l2-1e-7){errors.push('Radius '+v.id+' does not fit adjacent edges.');corners.push(null);continue;}
    var bis=[u1[0]+u2[0],u1[1]+u2[1]],bl=Math.hypot(bis[0],bis[1]);bis=[bis[0]/bl,bis[1]/bl];
    corners.push({vertexId:v.id,r:r,t:tangent,prev:[v.x+u1[0]*tangent,v.y+u1[1]*tangent],next:[v.x+u2[0]*tangent,v.y+u2[1]*tangent],center:[v.x+bis[0]*(r/sin),v.y+bis[1]*(r/sin)],parentEdges:[prev.outEdge,v.outEdge]});
  }
  for(i=0;i<V.length;i++){
    var a=corners[i],b=corners[(i+1)%V.length],L=Math.hypot(V[(i+1)%V.length].x-V[i].x,V[(i+1)%V.length].y-V[i].y);
    if((a?a.t:0)+(b?b.t:0)>=L-1e-7)errors.push('Corner radii overlap on edge '+(V[i].outEdge||('E'+(i+1)))+'.');
  }
  if(errors.length)return Object.assign({radiusErrors:errors},topo);
  var points=[],ids=[],arcMeta={},dir=orient<0?-1:1;
  function same(a,b){return a&&b&&Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7;}
  function pushSegment(id,end){if(!points.length)points.push(end.slice());else if(!same(points[points.length-1],end)){ids.push(id);points.push(end.slice());}}
  var first=corners[0]?corners[0].next:[V[0].x,V[0].y];points.push(first.slice());
  for(i=0;i<V.length;i++){
    var ni=(i+1)%V.length,edgeId=V[i].outEdge||('E'+(i+1)),end=corners[ni]?corners[ni].prev:[V[ni].x,V[ni].y];pushSegment(edgeId,end);
    var c=corners[ni];if(c){
      var a0=Math.atan2(c.prev[1]-c.center[1],c.prev[0]-c.center[0]),a1=Math.atan2(c.next[1]-c.center[1],c.next[0]-c.center[0]);
      if(dir<0){while(a1>=a0)a1-=Math.PI*2;if(a0-a1>Math.PI)a1+=Math.PI*2;}else{while(a1<=a0)a1+=Math.PI*2;if(a1-a0>Math.PI)a1-=Math.PI*2;}
      var delta=a1-a0,n=Math.max(4,Math.min(64,Math.ceil(Math.abs(delta)*Math.max(5,c.r*10)))),rid='R:'+c.vertexId;arcMeta[rid]=c;
      for(var k=1;k<=n;k++){var ang=a0+delta*k/n;pushSegment(rid,[c.center[0]+c.r*Math.cos(ang),c.center[1]+c.r*Math.sin(ang)]);}
    }
  }
  if(points.length>1&&same(points[0],points[points.length-1]))points.pop();
  while(ids.length<points.length)ids.push(ids[ids.length-1]||'EDGE');
  var edges=[];for(i=0;i<points.length;i++){var p1=points[i],p2=points[(i+1)%points.length],id=ids[i],meta=arcMeta[id];edges.push({id:id,segmentId:id+':'+i,type:meta?'arc-sample':'line',p1:p1,p2:p2,length:Math.hypot(p2[0]-p1[0],p2[1]-p1[1]),parentEdges:meta?meta.parentEdges:null});}
  return {vertices:V,points:points,pointEdgeIds:ids,edges:edges,analytic:topo.analytic,radiusErrors:[],radiusMeta:arcMeta};
}

function shapeEdgePath(geo,id){return (geo.edges||[]).filter(function(e){return e.id===id||e.segmentId===id;});}
function shapePointAlongPhysicalEdge(geo,id,distance){
  var path=shapeEdgePath(geo,id),left=Math.max(0,+distance||0);if(!path.length)return null;
  for(var i=0;i<path.length;i++){var e=path[i],L=e.length||Math.hypot(e.p2[0]-e.p1[0],e.p2[1]-e.p1[1]);if(left<=L+1e-8){var t=L?Math.max(0,Math.min(1,left/L)):0,dx=e.p2[0]-e.p1[0],dy=e.p2[1]-e.p1[1],ll=Math.hypot(dx,dy)||1;return {point:[e.p1[0]+dx*t,e.p1[1]+dy*t],tangent:[dx/ll,dy/ll],edge:e};}left-=L;}
  e=path[path.length-1];var dx2=e.p2[0]-e.p1[0],dy2=e.p2[1]-e.p1[1],l2=Math.hypot(dx2,dy2)||1;return {point:e.p2.slice(),tangent:[dx2/l2,dy2/l2],edge:e,clamped:true};
}
function shapeHardwarePolygon(anchor,def,orientation){
  var w=inch(def.prepWidth),h=inch(def.prepHeight),ins=inch(def.inset),t=anchor.tangent,n=orientation<0?[t[1],-t[0]]:[-t[1],t[0]],c=[anchor.point[0]+n[0]*(ins+h/2),anchor.point[1]+n[1]*(ins+h/2)],hw=w/2,hh=h/2;
  function p(a,b){return [c[0]+t[0]*a+n[0]*b,c[1]+t[1]*a+n[1]*b];}
  return {center:c,points:[p(-hw,-hh),p(-hw,hh),p(hw,hh),p(hw,-hh)],normal:n,tangent:t};
}
function shapeFeatureGeometry(def,geo){
  var out={holes:[],cutouts:[],hardware:[],stamps:[],sandblasts:[],radii:[],all:[]},orientation=fabSignedArea(geo.points||[]);
  (def.features||[]).forEach(function(f){
    if(f.type==='radius'){out.radii.push({id:f.id,vertexId:f.vertexId,radius:inch(f.radius),source:f});return;}
    if(f.type==='hole'){var h={id:f.id,type:'hole',center:[inch(f.x),inch(f.y)],diameter:inch(f.diameter),minEdge:inch(f.minEdge),source:f};out.holes.push(h);out.all.push(h);return;}
    if(f.type==='cutout'){var x=inch(f.x),y=inch(f.y),w=inch(f.width),hh=inch(f.height),cr=inch(f.cornerRadius),c={id:f.id,type:'cutout',x:x,y:y,width:w,height:hh,cornerRadius:cr,points:shapeRoundedRectPoints(x,y,w,hh,cr),source:f};out.cutouts.push(c);out.all.push(c);return;}
    if(f.type==='hardware'){
      var a=shapePointAlongPhysicalEdge(geo,f.edgeId,inch(f.distance));if(!a){var bad={id:f.id,type:'hardware',invalid:true,source:f};out.hardware.push(bad);out.all.push(bad);return;}
      var pg=shapeHardwarePolygon(a,f,orientation),hw={id:f.id,type:'hardware',name:f.name,edgeId:f.edgeId,anchor:a,center:pg.center,points:pg.points,holeDia:inch(f.holeDia),source:f};out.hardware.push(hw);out.all.push(hw);return;
    }
    if(f.type==='stamp'){var s={id:f.id,type:'stamp',point:[inch(f.x),inch(f.y)],text:shapeStampText(f),source:f};out.stamps.push(s);out.all.push(s);}
    if(f.type==='sandblast'){var sb={id:f.id,type:'sandblast',point:[inch(f.x),inch(f.y)],coverage:shapeSandblastCoverage(f),side:shapeSandblastSide(f),text:shapeSandblastText(f),source:f};out.sandblasts.push(sb);out.all.push(sb);}
  });
  return out;
}

function shapeRoundedRectPoints(x,y,w,h,r){
  r=Math.max(0,Math.min(+r||0,Math.max(0,w/2),Math.max(0,h/2)));if(!(r>0))return [[x,y],[x,y+h],[x+w,y+h],[x+w,y]];
  var target=1/2048,n=Math.max(6,Math.ceil((Math.PI/2)/Math.acos(Math.max(-1,1-target/Math.max(r,target))))),P=[],centers=[[x+r,y+h-r],[x+w-r,y+h-r],[x+w-r,y+r],[x+r,y+r]],starts=[Math.PI,Math.PI/2,0,-Math.PI/2];
  for(var q=0;q<4;q++)for(var i=0;i<n;i++){var a=starts[q]-Math.PI*i/(2*n);P.push([centers[q][0]+r*Math.cos(a),centers[q][1]+r*Math.sin(a)]);}
  return P;
}
function shapeThicknessMm(def){var v=Number(String(def&&def.thickness==null?'':def.thickness).trim());return isFinite(v)?v:NaN;}
/* Таблица припуска в проекте ОДНА — shapeProductionAllowanceRule. Здесь она
   только переспрашивается: раньше значения были продублированы, и после
   правки цеховых цифр рассчитанная геометрия продолжала блокировать рез на
   16–19 mm, пока производственный путь уже считал 1/2". Ноль здесь означает
   «правила нет» — этот случай ловит validate и блокирует рез. */
function shapeOperationAllowance(type,th){var r=shapeProductionAllowanceRule(type,th);return r.ok?(+r.value||0):0;}
function shapePolishAllowance(th){return shapeOperationAllowance('Flat Polish',th);}
function shapeEdgeOps(def,id){return (def.edgeOps&&def.edgeOps[id])||[];}
function shapeEdgeAllowance(def,edge){
  var th=shapeThicknessMm(def),ops=shapeEdgeOps(def,edge.id).slice();
  if(edge.parentEdges)edge.parentEdges.forEach(function(id){ops=ops.concat(shapeEdgeOps(def,id));});
  var vals=ops.map(function(op){return shapeOperationAllowance(op.type,th);});return vals.length?Math.max.apply(null,vals):0;
}
/* ---------- Safety Border ----------
   Защитный отступ при резке и ломке на столе. В контур реза НЕ входит:
   деталь режется по finished + припуск кромки. Бордер сообщает раскрою,
   сколько пустого места оставить вдоль скошенной или дуговой кромки — и до
   соседней детали, и до края листа. Прямые кромки под 90° его не требуют:
   детали и так разделены собственными припусками.
   Клиент за бордер платит (лист расходуется из-за его скоса), поэтому он
   входит в оплачиваемый габарит, но никогда — в вырезаемый контур. */
/* Авто-значение бордера по толщине. 16–19 mm добавлены 31 августа 2026 по
   словам владельца: это очень редкие типы стекла, и 1/2" бордера там хватает,
   чтобы избежать проблем при резке и ломке. Меньше, чем у 8–15 mm, — так и
   задумано. Вне таблицы значение обязан ввести оператор. */
function shapeSafetyBorderAuto(th){if(th>=4&&th<8)return 1;if(th>=8&&th<=15)return 1.5;if(th>=16&&th<=19)return .5;return 0;}
function shapeBorderStep(v){return Math.round((+v||0)*16)/16;}
function shapeEdgeNeedsBorder(edge,a,b){
  if(edge&&edge.type&&edge.type!=='line')return true;
  /* Скос — любое отклонение от вертикали/горизонтали больше 1/256″: та же
     величина, что и геометрический допуск контура (toleranceIn). На детали
     140″ это ловит уклон, вчетверо более мелкий, чем 1/64″.
     Угловой допуск здесь не годится: уклон 1/8″ на высоте 40″ — всего 0.18°,
     но ломать вдоль такой кромки уже небезопасно. */
  var dx=Math.abs(b[0]-a[0]),dy=Math.abs(b[1]-a[1]);
  return Math.min(dx,dy)>1/256;
}
/* Бордер задаётся по кромкам, как обработка в Edge Set: базовое значение
   ставится автоматически на скосы и дуги, а любую кромку — включая прямую —
   оператор может переопределить вручную. Ввод читается тем же строгим
   парсером, что Width/Height: «1 1/2», «1-1/2», «1/2», «1.5».
   Считается по контуру РЕЗКИ (после снятия нотчей), иначе кромки выреза
   ошибочно выглядят скошенными. */
function shapeNormalizeBorderEdges(raw){
  var out={};
  if(raw&&typeof raw==='object')Object.keys(raw).forEach(function(id){
    var t=String(raw[id]==null?'':raw[id]).trim();
    if(t)out[String(id)]=t;
  });
  return out;
}
function shapeBorderOverrides(def){
  var raw=(def&&def.safetyBorderEdges)||{},out={};
  Object.keys(raw).forEach(function(id){
    var p=fabParseDimStrict(raw[id]==null?'':raw[id]);
    if(p.ok&&p.v>=0)out[id]=shapeBorderStep(p.v);
  });
  return out;
}
function shapeSafetyBorderPlan(def,pts,ids,edgeTypes){
  var th=shapeThicknessMm(def),auto=shapeSafetyBorderAuto(th);
  var parsed=fabParseDimStrict(def&&def.safetyBorder==null?'':def&&def.safetyBorder),baseOver=parsed.ok&&parsed.v>=0;
  var base=shapeBorderStep(baseOver?parsed.v:auto),over=shapeBorderOverrides(def);
  pts=pts||[];ids=ids||[];edgeTypes=edgeTypes||{};
  /* Строка на КРОМКУ, а не на сегмент: у круга контур тесселирован сотнями
     отрезков, но кромка одна («ARC»), и в списке она должна быть одной
     строкой. Сегментные значения нужны отдельно — по ним считается габарит. */
  var n=pts.length,byId={},order=[],segValues=new Array(n),i,id,angled,value,state,max=0,anyAngled=false;
  for(i=0;i<n;i++){
    id=String(ids[i]!=null?ids[i]:i);
    angled=shapeEdgeNeedsBorder({type:edgeTypes[id]},pts[i],pts[(i+1)%n]);
    if(!byId[id]){byId[id]={id:id,angled:false,segments:0};order.push(id);}
    byId[id].angled=byId[id].angled||angled;
    byId[id].segments++;
  }
  var list=order.map(function(key){
    var e=byId[key];
    if(e.angled)anyAngled=true;
    if(Object.prototype.hasOwnProperty.call(over,key)){e.value=over[key];e.state='OVERRIDE';}
    else if(e.angled){e.value=base;e.state='AUTO';}
    else {e.value=0;e.state='OFF';}
    if(e.value>max)max=e.value;
    return e;
  });
  for(i=0;i<n;i++)segValues[i]=byId[String(ids[i]!=null?ids[i]:i)].value;
  return {edges:list,segValues:segValues,base:base,autoValue:shapeBorderStep(auto),
    baseState:baseOver?'OVERRIDE':'AUTO',
    state:list.some(function(e){return e.state==='OVERRIDE';})||baseOver?'OVERRIDE':'AUTO',
    value:max,applies:max>0,
    edgeIds:list.filter(function(e){return e.value>0;}).map(function(e){return e.id;}),
    manualRequired:!baseOver&&auto===0&&anyAngled&&max===0};
}
/* Оплачиваемый габарит: прямоугольник контура реза плюс бордер с тех сторон,
   где он реально стоит. У стороны берётся наибольший бордер её кромок.
   Округление 1/16". */
function shapeBorderFootprint(points,plan){
  var b=fabEdgeBounds(points),w=b.maxX-b.minX,h=b.maxY-b.minY;
  if(!plan||!plan.applies)return {width:shapeBorderStep(w),height:shapeBorderStep(h),sides:[]};
  var cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2,n=points.length,sides={left:0,right:0,top:0,bottom:0},i,v,key;
  for(i=0;i<n;i++){
    v=(plan.segValues||[])[i]||0;if(!(v>0))continue;
    var a=points[i],c=points[(i+1)%n],mx=(a[0]+c[0])/2,my=(a[1]+c[1])/2;
    if(Math.abs(c[1]-a[1])>=Math.abs(c[0]-a[0]))key=mx>=cx?'right':'left';
    else key=my>=cy?'top':'bottom';
    if(v>sides[key])sides[key]=v;
  }
  /* pad — отступ по каждой стороне габарита. Бордер меряется по прямой, под
     90°, а не параллельно скосу: стол режет прямыми и зазор до соседней
     детали тоже прямой. Скошенная кромка отодвигает границу от САМОЙ ДАЛЬНЕЙ
     своей точки, поэтому величина ложится на сторону габарита. */
  return {width:shapeBorderStep(w+sides.left+sides.right),
    height:shapeBorderStep(h+sides.top+sides.bottom),
    pad:sides,
    sides:Object.keys(sides).filter(function(k){return sides[k]>0;}).sort()};
}
/* Название операции из кода вида: 'hinge' → 'Hinge', 'bottom_pivot' → 'Bottom
   Pivot'. Словаря видов здесь намеренно нет: справочник фурнитуры живёт в базе,
   а этот модуль — чистая геометрия и в базу не ходит. Имя конкретной модели
   («Vienna 180») приезжает снимком в самой метке. */
function shapeMiOperationName(type){
  return String(type==null?'':type).split(/[-_\s]+/).filter(Boolean)
    .map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ')||'Hardware';
}
function shapeDerivedRequirements(def,geo,fg){
  var req=[],groups={};
  (geo.edges||[]).forEach(function(e){shapeEdgeOps(def,e.id).forEach(function(op){var key=op.type+'|'+(op.angle||'')+'|'+(op.width||'');if(!groups[key])groups[key]={operation:op.type,edgeIds:[],params:{}};if(groups[key].edgeIds.indexOf(e.id)<0)groups[key].edgeIds.push(e.id);if(op.angle)groups[key].params.angle=op.angle;if(op.width)groups[key].params.width=op.width;});});
  Object.keys(groups).forEach(function(k){var g=groups[k],station=g.operation==='Rough Arris'?'ARRISING':g.operation==='Flat Polish'?'POLISHING':g.operation==='Mitering'?'MITERING':g.operation==='Beveling'?'BEVELING':'CNC';req.push({id:'EDGE:'+k,source:'EDGE',operation:g.operation,stationClass:station,edgeIds:g.edgeIds,params:g.params});});
  (fg.holes||[]).forEach(function(h){var drill=h.diameter>=.375&&h.diameter<=1.5;req.push({id:'FEATURE:'+h.id,source:'FEATURE',operation:drill?'Drill Hole':'Machine Hole',stationClass:drill?'DRILLING':'CNC',featureId:h.id,params:{diameter:h.diameter}});});
  (fg.cutouts||[]).forEach(function(c){req.push({id:'FEATURE:'+c.id,source:'FEATURE',operation:'Machine Cutout',stationClass:'CNC',featureId:c.id,params:{width:c.width,height:c.height}});});
  (fg.hardware||[]).forEach(function(h){req.push({id:'FEATURE:'+h.id,source:'FEATURE',operation:'Hardware Preparation',stationClass:'CNC',featureId:h.id,params:{template:h.name}});});
  (fg.sandblasts||[]).forEach(function(s){req.push({id:'SANDBLAST:'+s.id,source:'MANUFACTURING',operation:shapeSandblastServiceLabel(s.source),stationClass:'SAND',featureId:s.id,params:{coverage:s.coverage,side:s.side}});});
  if((fg.radii||[]).some(function(r){return r.radius>0;}))req.push({id:'CONTOUR:RADIUS',source:'CONTOUR',operation:'Radius / Fillet Machining',stationClass:'CNC',featureIds:fg.radii.map(function(r){return r.id;})});
  /* Manufacturing items belong to the production drawing, not cutting geometry.
     They still create production requirements so the shop does not lose the
     requested manipulation. A generic Hole is the only drilled station here;
     every hardware mark stays a SERVICE requirement, because its seat is made
     by hand from a named template. The mark therefore carries what and where,
     never a machined shape. */
  (def.manufacturingItems||[]).forEach(function(item){
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),dia=d.ok?d.v:0;
      req.push({id:'MANUFACTURING:'+item.id,source:'MANUFACTURING',operation:'Drill Hole',stationClass:'DRILLING',manufacturingItemId:item.id,params:{diameter:dia,x:item.x,y:item.y}});
    }else{
      /* Любая фурнитура на кромке, включая виды, добавленные владельцем.
         Станция SERVICE, а не CNC: посадочное место делает человек по
         своему шаблону, и станка, который его режет, у цеха нет. */
      req.push({id:'MANUFACTURING:'+item.id,source:'MANUFACTURING',operation:shapeMiOperationName(item.type),stationClass:'SERVICE',manufacturingItemId:item.id,params:{edge:item.edge,distance:item.distance,model:item.model||''}});
    }
  });
  return req;
}
