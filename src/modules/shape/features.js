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
  var out={holes:[],cutouts:[],hardware:[],stamps:[],radii:[],all:[]},orientation=fabSignedArea(geo.points||[]);
  (def.features||[]).forEach(function(f){
    if(f.type==='radius'){out.radii.push({id:f.id,vertexId:f.vertexId,radius:inch(f.radius),source:f});return;}
    if(f.type==='hole'){var h={id:f.id,type:'hole',center:[inch(f.x),inch(f.y)],diameter:inch(f.diameter),minEdge:inch(f.minEdge),source:f};out.holes.push(h);out.all.push(h);return;}
    if(f.type==='cutout'){var x=inch(f.x),y=inch(f.y),w=inch(f.width),hh=inch(f.height),cr=inch(f.cornerRadius),c={id:f.id,type:'cutout',x:x,y:y,width:w,height:hh,cornerRadius:cr,points:shapeRoundedRectPoints(x,y,w,hh,cr),source:f};out.cutouts.push(c);out.all.push(c);return;}
    if(f.type==='hardware'){
      var a=shapePointAlongPhysicalEdge(geo,f.edgeId,inch(f.distance));if(!a){var bad={id:f.id,type:'hardware',invalid:true,source:f};out.hardware.push(bad);out.all.push(bad);return;}
      var pg=shapeHardwarePolygon(a,f,orientation),hw={id:f.id,type:'hardware',name:f.name,edgeId:f.edgeId,anchor:a,center:pg.center,points:pg.points,holeDia:inch(f.holeDia),source:f};out.hardware.push(hw);out.all.push(hw);return;
    }
    if(f.type==='stamp'){var s={id:f.id,type:'stamp',point:[inch(f.x),inch(f.y)],text:f.text||'TEMPER',source:f};out.stamps.push(s);out.all.push(s);}
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
function shapePolishAllowance(th){if(th>=3&&th<=6)return 1/16;if(th>=8&&th<=10)return 1/8;if(th>=12&&th<=15)return 3/16;return 0;}
function shapeOperationAllowance(type,th){if(type==='CNC Shape Polish')return .25;if(type==='Flat Polish'||type==='Beveling'||type==='Mitering')return shapePolishAllowance(th);return 0;}
function shapeEdgeOps(def,id){return (def.edgeOps&&def.edgeOps[id])||[];}
function shapeEdgeAllowance(def,edge){
  var th=shapeThicknessMm(def),ops=shapeEdgeOps(def,edge.id).slice();
  if(edge.parentEdges)edge.parentEdges.forEach(function(id){ops=ops.concat(shapeEdgeOps(def,id));});
  var vals=ops.map(function(op){return shapeOperationAllowance(op.type,th);});return vals.length?Math.max.apply(null,vals):0;
}
function shapeDerivedRequirements(def,geo,fg){
  var req=[],groups={};
  (geo.edges||[]).forEach(function(e){shapeEdgeOps(def,e.id).forEach(function(op){var key=op.type+'|'+(op.angle||'')+'|'+(op.width||'');if(!groups[key])groups[key]={operation:op.type,edgeIds:[],params:{}};if(groups[key].edgeIds.indexOf(e.id)<0)groups[key].edgeIds.push(e.id);if(op.angle)groups[key].params.angle=op.angle;if(op.width)groups[key].params.width=op.width;});});
  Object.keys(groups).forEach(function(k){var g=groups[k],station=g.operation==='Rough Arris'?'ARRISING':g.operation==='Flat Polish'?'POLISHING':g.operation==='Mitering'?'MITERING':g.operation==='Beveling'?'BEVELING':'CNC';req.push({id:'EDGE:'+k,source:'EDGE',operation:g.operation,stationClass:station,edgeIds:g.edgeIds,params:g.params});});
  (fg.holes||[]).forEach(function(h){var drill=h.diameter>=.375&&h.diameter<=1.5;req.push({id:'FEATURE:'+h.id,source:'FEATURE',operation:drill?'Drill Hole':'Machine Hole',stationClass:drill?'DRILLING':'CNC',featureId:h.id,params:{diameter:h.diameter}});});
  (fg.cutouts||[]).forEach(function(c){req.push({id:'FEATURE:'+c.id,source:'FEATURE',operation:'Machine Cutout',stationClass:'CNC',featureId:c.id,params:{width:c.width,height:c.height}});});
  (fg.hardware||[]).forEach(function(h){req.push({id:'FEATURE:'+h.id,source:'FEATURE',operation:'Hardware Preparation',stationClass:'CNC',featureId:h.id,params:{template:h.name}});});
  if((fg.radii||[]).some(function(r){return r.radius>0;}))req.push({id:'CONTOUR:RADIUS',source:'CONTOUR',operation:'Radius / Fillet Machining',stationClass:'CNC',featureIds:fg.radii.map(function(r){return r.id;})});
  return req;
}
