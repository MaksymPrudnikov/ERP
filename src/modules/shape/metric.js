/* =====================================================================
   shape/metric · schema-v2
   Чистая метрическая модель внешнего контура: мм, наклоны и внутренние углы.
   IN : результат ShapeModule.compute и необязательная подмена контура
   OUT: данные для отрисовки без DOM, SVG, заказов и цен
   ===================================================================== */

var SHAPE_MM_PER_INCH=25.4;
function shapeMetricRound(v){return Math.round((+v||0)*100)/100;}
function shapeMetricFormat(v){return shapeMetricRound(v).toFixed(2);}
function shapeMetricAngleDelta(v){
  while(v<=-180)v+=360;
  while(v>180)v-=360;
  return v;
}
/* opts.points / opts.edgeIds позволяют тому же расчёту работать с контуром
   выбранного лайта. Подмена остаётся явной: сама метрика ничего не знает ни
   про экран, ни про Sales, ни про то, откуда пришёл этот контур. */
function shapeMetricAnnotations(result,opts){
  opts=opts||{};
  var sourcePoints=opts.points||(result&&result.points)||[];
  var points=sourcePoints.map(function(p){return [+p[0],+p[1]];});
  if(points.length<3)return {units:'mm',segments:[],vertices:[],bbox:{widthMm:0,heightMm:0},perimeterMm:0};
  var orient=fabSignedArea(points)>=0?1:-1,geo=result&&result.geometry||{},edgeIds=opts.edgeIds||geo.pointEdgeIds||[],perimeterIn=0;
  var sourceEdges=!opts.points&&geo.edges&&geo.edges.length===points.length?geo.edges:null;
  var segments=points.map(function(p1,i){
    var p2=points[(i+1)%points.length],edge=sourceEdges&&sourceEdges[i],dx=p2[0]-p1[0],dy=p2[1]-p1[1];
    var len=edge&&isFinite(edge.length)?+edge.length:Math.hypot(dx,dy);perimeterIn+=len;
    return {edgeId:String(edge&&edge.id!=null?edge.id:(edgeIds[i]!=null?edgeIds[i]:'SEG-'+(i+1))),index:i,p1:p1.slice(),p2:p2.slice(),lengthMm:shapeMetricRound(len*SHAPE_MM_PER_INCH),bearingDeg:shapeMetricRound(Math.atan2(dy,dx)*180/Math.PI)};
  });
  var vertices=points.map(function(point,i){
    var prev=points[(i-1+points.length)%points.length],next=points[(i+1)%points.length];
    var inDeg=Math.atan2(point[1]-prev[1],point[0]-prev[0])*180/Math.PI;
    var outDeg=Math.atan2(next[1]-point[1],next[0]-point[0])*180/Math.PI;
    var turn=shapeMetricAngleDelta(outDeg-inDeg),angle=180-orient*turn;
    if(angle<=0)angle+=360;
    if(angle>360)angle-=360;
    return {index:i,point:point.slice(),angleDeg:shapeMetricRound(angle),convex:angle<=180+1e-7};
  });
  /* После округления каждой вершины отдельно может остаться сотая градуса.
     Возвращаемые значения всё равно обязаны сохранять инвариант многоугольника. */
  var expected=(points.length-2)*180,angleSum=vertices.reduce(function(sum,v){return sum+v.angleDeg;},0),angleResidual=shapeMetricRound(expected-angleSum);
  if(vertices.length&&angleResidual)vertices[vertices.length-1].angleDeg=shapeMetricRound(vertices[vertices.length-1].angleDeg+angleResidual);
  var b=fabEdgeBounds(points);
  return {units:'mm',segments:segments,vertices:vertices,bbox:{widthMm:shapeMetricRound((b.maxX-b.minX)*SHAPE_MM_PER_INCH),heightMm:shapeMetricRound((b.maxY-b.minY)*SHAPE_MM_PER_INCH)},perimeterMm:shapeMetricRound(perimeterIn*SHAPE_MM_PER_INCH)};
}
