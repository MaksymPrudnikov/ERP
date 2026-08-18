/* =====================================================================
   shape/index  ·  v4.5-port
   ПУБЛИЧНЫЙ КОНТРАКТ модуля: ShapeModule.compute(shapeDef).
   IN : определение фигуры {w,h,smart}
   OUT: {valid, width, height, area, points, segs, line}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function defaultSmartModel(){return ssNormalize({elbowsOn:false,A:{out:'0'},B:{out:'0'},C:{len:'',out:'0'},corners:{tl:'none',tr:'none',br:'none',bl:'none'},extraEdges:{}});}
function newShapeId(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return 's'+crypto.randomUUID();
  return 's'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
function newSmartShapeDef(){return {id:newShapeId(),name:'',w:'48',h:'36',smart:defaultSmartModel()};}
/* Значения по умолчанию принадлежат только новой форме. Пустой/нулевой размер
   существующей формы нельзя молча заменять на 48×36 — это производственный брак. */
function shapeDefToLine(s){s=s||{};return {w:String(s.w==null?'':s.w),h:String(s.h==null?'':s.h),shape:{type:'smart',smart:ssNormalize(s.smart||{})}};}
function smartShapeResult(s){
  var S=shapeDefToLine(s),G=shapeGeometry(S);if(!G.ok)return {valid:false,reason:G.error||'Invalid Smart-Shape',errors:G.errors||[G.error],warns:G.warns||[],line:S,geometry:G};
  var Q=ssContour(S),area=Math.abs(fabSignedArea(Q.pts));
  return {valid:true,width:G.bboxW,height:G.bboxH,area:area,points:Q.pts,segs:Q.segs,base:Q.base,warns:G.warns||[],line:S,geometry:G};
}
const ShapeModule={code:'SHAPE',name:'Smart-Shape / Advanced',version:'v4.5-port',compute:smartShapeResult};
