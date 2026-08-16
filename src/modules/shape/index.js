/* =====================================================================
   shape/index  ·  v4.5-port
   ПУБЛИЧНЫЙ КОНТРАКТ модуля: ShapeModule.compute(shapeDef).
   IN : определение фигуры {w,h,smart}
   OUT: {valid, width, height, area, points, segs, line}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function defaultSmartModel(){return ssNormalize({elbowsOn:false,A:{out:'0'},B:{out:'0'},C:{len:'',out:'0'},corners:{tl:'none',tr:'none',br:'none',bl:'none'},extraEdges:{}});}
function newSmartShapeDef(){return {id:'s'+Date.now(),name:'',w:'48',h:'36',smart:defaultSmartModel()};}
function shapeDefToLine(s){s=s||{};return {w:String(s.w||'48'),h:String(s.h||'36'),shape:{type:'smart',smart:ssNormalize(s.smart||{})}};}
function smartShapeResult(s){
  var S=shapeDefToLine(s),G=shapeGeometry(S);if(!G.ok)return {valid:false,reason:G.error||'Invalid Smart-Shape',errors:G.errors||[G.error],warns:G.warns||[],line:S,geometry:G};
  var Q=ssContour(S),area=Math.abs(fabSignedArea(Q.pts));
  return {valid:true,width:G.bboxW,height:G.bboxH,area:area,points:Q.pts,segs:Q.segs,base:Q.base,warns:G.warns||[],line:S,geometry:G};
}
const ShapeModule={code:'SHAPE',name:'Smart-Shape / Advanced',version:'v4.5-port',compute:smartShapeResult};
