/* =====================================================================
   shape/geometry  ·  v4.5-port
   ERP-адаптер: из модели Shape в контур + габарит для остальной системы.
   IN : линия Shape S
   OUT: {ok, pts, bboxW, bboxH, sidePaths, ...}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function shapeGeometry(S){
  var W=inch(S.w),H=inch(S.h),kind=(S.shape&&S.shape.type)||'smart';
  if(W<=0||H<=0)return {ok:false,error:'Enter valid width and height.',W:W,H:H,pts:[],type:kind,minX:0,minY:0,maxX:W,maxY:H};
  if(kind==='smart'){
    if(!S.shape.smart)S.shape.smart=ssNormalize({});
    var sv=ssValidate(S);if(sv.errors.length)return {ok:false,error:sv.errors[0],errors:sv.errors,warns:sv.warns,W:W,H:H,pts:[],type:kind};
    var sq=ssContour(S);if(sq.pts.length<3)return {ok:false,error:'Smart-Shape outline could not be built.',W:W,H:H,pts:[],type:kind};
    var sb=fabEdgeBounds(sq.pts);return {ok:true,W:W,H:H,pts:sq.pts,type:kind,minX:sb.minX,maxX:sb.maxX,minY:sb.minY,maxY:sb.maxY,bboxW:sb.maxX-sb.minX,bboxH:sb.maxY-sb.minY,sidePaths:sq.sides,smartSegs:sq.segs,smartBase:sq.base,warns:sv.warns};
  }
  return {ok:true,W:W,H:H,pts:[[0,0],[W,0],[W,H],[0,H]],type:'rectangle',minX:0,maxX:W,minY:0,maxY:H,bboxW:W,bboxH:H};
}
function fabOutlinePoints(S,G){return (G&&G.pts&&G.pts.length)?G.pts.slice():[[0,0],[inch(S.w),0],[inch(S.w),inch(S.h)],[0,inch(S.h)]];}
