/* =====================================================================
   shape/cutting · schema-v2
   Детерминированная Cutting Geometry. Невалидный offset блокируется.
   Generic DXF — нейтральный обменный файл, не постпроцессор конкретного CNC.
   ===================================================================== */

function shapeOffsetVariable(points,distances){
  if(!points||points.length<3)return {valid:false,error:'Offset requires a closed contour.'};
  var n=points.length,orient=fabSignedArea(points),lines=[],i;
  for(i=0;i<n;i++){
    var a=points[i],b=points[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<1e-9)return {valid:false,error:'Offset source contains a degenerate edge.'};
    var d=Math.max(0,+distances[i]||0),nx=orient<0?-dy/L:dy/L,ny=orient<0?dx/L:-dx/L;
    lines.push({a:[a[0]+nx*d,a[1]+ny*d],b:[b[0]+nx*d,b[1]+ny*d],d:d,sourceId:i});
  }
  var out=[];
  for(i=0;i<n;i++){
    var prev=lines[(i-1+n)%n],cur=lines[i],hit=fabLineIntersection(prev.a,prev.b,cur.a,cur.b),v=points[i],lim=Math.max(.25,Math.max(prev.d,cur.d)*10);
    if(!hit)hit=[(prev.b[0]+cur.a[0])/2,(prev.b[1]+cur.a[1])/2];
    if(Math.hypot(hit[0]-v[0],hit[1]-v[1])>lim)return {valid:false,error:'Cutting offset creates an excessive miter at contour vertex '+(i+1)+'.'};
    out.push(hit);
  }
  if(fabPolySelfIntersects(out))return {valid:false,error:'Cutting offset self-intersects. Change the contour or edge allowances.'};
  if(Math.abs(fabSignedArea(out))<1e-6)return {valid:false,error:'Cutting offset encloses no area.'};
  return {valid:true,points:out};
}
function shapeCuttingGeometry(def,geo,fg){
  var points=(geo.points||[]).map(function(p){return p.slice();}),ids=geo.pointEdgeIds||[],dist=points.map(function(_,i){var e=(geo.edges||[])[i]||{id:ids[i]};return shapeEdgeAllowance(def,e);});
  var off=shapeOffsetVariable(points,dist);if(!off.valid)return {valid:false,error:off.error,finishedPoints:points,points:[],holes:[],cutouts:[],hardware:[],warnings:[]};
  var b=fabEdgeBounds(off.points),curves=(geo.edges||[]).some(function(e){return e.type!=='line';}),warnings=[];
  if(curves)warnings.push('Curved cutting contour is tessellated to the Shape sampling tolerance; verify the target machine postprocessor.');
  var holes=(fg.holes||[]).map(function(h){return {id:h.id,center:h.center.slice(),diameter:h.diameter};});
  var cutouts=(fg.cutouts||[]).map(function(c){return {id:c.id,points:c.points.map(function(p){return p.slice();}),cornerRadius:c.cornerRadius||0};});
  var hardware=(fg.hardware||[]).filter(function(h){return !h.invalid;}).map(function(h){return {id:h.id,name:h.name,points:h.points.map(function(p){return p.slice();}),hole:{center:h.center.slice(),diameter:h.holeDia}};});
  return {valid:true,points:off.points,finishedPoints:points,edgeIds:ids.slice(),allowances:dist,holes:holes,cutouts:cutouts,hardware:hardware,minX:b.minX,maxX:b.maxX,minY:b.minY,maxY:b.maxY,width:b.maxX-b.minX,height:b.maxY-b.minY,warnings:warnings,toleranceIn:1/256};
}
function shapeMachinePayload(result){
  if(!result||!result.valid||!result.cutting||!result.cutting.valid)return null;
  var c=result.cutting,round=function(v){return Math.round(v*1000000)/1000000;},pts=function(P){return P.map(function(p){return [round(p[0]),round(p[1])];});};
  return {schema:'glass-erp-cutting/v1',units:'inch',shapeId:result.definition.id,revision:result.definition.revision||0,type:result.definition.type,toleranceIn:c.toleranceIn,outer:{closed:true,points:pts(c.points)},holes:c.holes.map(function(h){return {id:h.id,center:pts([h.center])[0],diameter:round(h.diameter)};}),cutouts:c.cutouts.map(function(x){return {id:x.id,closed:true,points:pts(x.points),cornerRadius:round(x.cornerRadius||0)};}),hardware:c.hardware.map(function(h){return {id:h.id,name:h.name,closed:true,points:pts(h.points),hole:{center:pts([h.hole.center])[0],diameter:round(h.hole.diameter)}};}),requirements:(result.requirements||[]).filter(function(q){return q.source!=='MANUFACTURING';})};
}
function shapeDxfPolyline(P,layer){
  var o='0\nPOLYLINE\n8\n'+layer+'\n66\n1\n70\n1\n';
  (P||[]).forEach(function(p){o+='0\nVERTEX\n8\n'+layer+'\n10\n'+(+p[0]).toFixed(6)+'\n20\n'+(+p[1]).toFixed(6)+'\n30\n0\n';});return o+'0\nSEQEND\n';
}
function shapeGenericDxf(result){
  var p=shapeMachinePayload(result);if(!p)return null;var o='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
  o+=shapeDxfPolyline(p.outer.points,'CUT_OUTER');
  p.holes.forEach(function(h){o+='0\nCIRCLE\n8\nCUT_HOLES\n10\n'+h.center[0].toFixed(6)+'\n20\n'+h.center[1].toFixed(6)+'\n30\n0\n40\n'+(h.diameter/2).toFixed(6)+'\n';});
  p.cutouts.forEach(function(c){o+=shapeDxfPolyline(c.points,'CUT_INNER');});
  p.hardware.forEach(function(h){o+=shapeDxfPolyline(h.points,'HARDWARE_PREP');o+='0\nCIRCLE\n8\nHARDWARE_HOLES\n10\n'+h.hole.center[0].toFixed(6)+'\n20\n'+h.hole.center[1].toFixed(6)+'\n30\n0\n40\n'+(h.hole.diameter/2).toFixed(6)+'\n';});
  return o+'0\nENDSEC\n0\nEOF\n';
}
