/* =====================================================================
   shape/geometry  ·  v4.5-port
   ERP-адаптер: из модели Shape в контур + габарит для остальной системы.
   IN : линия Shape S
   OUT: {ok, pts, bboxW, bboxH, sidePaths, ...}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function shapeGeometry(S){
  var W=inch(S.w),H=inch(S.h),kind=(S.shape&&S.shape.type)||'smart';
  /* Diagonal + Angle calculates one master projection.  Resolve it before the
     common Width/Height gate so the calculated dimension is the one validated
     and used everywhere downstream. */
  if(kind==='parallelogram'){
    var para=shapeParallelogramValues(S.w,S.h,(S.shape&&S.shape.params)||{});
    if(!para.ok)return {ok:false,error:para.errors[0],errors:para.errors,W:para.width,H:para.height,pts:[],type:kind};
    W=para.width;H=para.height;
  }
  if(W<=0||H<=0)return {ok:false,error:'Enter valid width and height.',W:W,H:H,pts:[],type:kind,minX:0,minY:0,maxX:W,maxY:H};
  if(kind==='smart'){
    if(!S.shape.smart)S.shape.smart=ssNormalize({});
    var sv=ssValidate(S);if(sv.errors.length)return {ok:false,error:sv.errors[0],errors:sv.errors,warns:sv.warns,W:W,H:H,pts:[],type:kind};
    var sq=ssContour(S);if(sq.pts.length<3)return {ok:false,error:'Smart-Shape outline could not be built.',W:W,H:H,pts:[],type:kind};
    /* Smart Shape used to expose no physical vertices, so Radius Corner was
       impossible even though its contour is the same ordered line topology as
       the preset shapes.  Keep the production edge ids, add stable corner ids,
       and pass that topology through the shared fillet engine. */
    var canonical={'B>A':'BL','A>D':'TL','D>C':'TR','C>B':'BR'};
    var smartVertices=sq.pts.map(function(p,i){
      var prev=sq.segs[(i-1+sq.segs.length)%sq.segs.length],next=sq.segs[i],pair=prev.id+'>'+next.id,id=canonical[pair]||('V'+(i+1));
      return shapeVertex(id,p[0],p[1],next.id,canonical[pair]?(id+' corner'):('Corner '+(i+1)+' · '+prev.id+' / '+next.id));
    });
    var smartEdges=smartVertices.map(function(v,i){var n=smartVertices[(i+1)%smartVertices.length];return {id:v.outEdge,segmentId:v.outEdge+':'+i,type:'line',p1:[v.x,v.y],p2:[n.x,n.y],startVertexId:v.id,endVertexId:n.id,length:Math.hypot(n.x-v.x,n.y-v.y)};});
    var rounded=shapeApplyCornerRadii({vertices:smartVertices,points:sq.pts,pointEdgeIds:smartEdges.map(function(e){return e.id;}),edges:smartEdges},S.shape.definition||{features:S.shape.features||[]});
    var smartPoints=rounded.points||sq.pts,sb=fabEdgeBounds(smartPoints);
    return {ok:true,W:W,H:H,pts:smartPoints,points:smartPoints,pointEdgeIds:rounded.pointEdgeIds||[],edges:rounded.edges||smartEdges,vertices:smartVertices,radiusErrors:rounded.radiusErrors||[],radiusMeta:rounded.radiusMeta||{},type:kind,minX:sb.minX,maxX:sb.maxX,minY:sb.minY,maxY:sb.maxY,bboxW:sb.maxX-sb.minX,bboxH:sb.maxY-sb.minY,sidePaths:sq.sides,smartSegs:sq.segs,smartBase:sq.base,warns:sv.warns};
  }
  var topo=shapePresetTopology(S),rounded=shapeApplyCornerRadii(topo,S.shape.definition||{features:S.shape.features||[]}),pts=rounded.points||[];
  if(pts.length<3)return {ok:false,error:'Shape outline could not be built.',W:W,H:H,pts:[],type:kind};
  var b=fabEdgeBounds(pts);return {ok:true,W:W,H:H,pts:pts,points:pts,pointEdgeIds:rounded.pointEdgeIds||[],edges:rounded.edges||[],vertices:rounded.vertices||[],analytic:rounded.analytic,type:kind,minX:b.minX,maxX:b.maxX,minY:b.minY,maxY:b.maxY,bboxW:b.maxX-b.minX,bboxH:b.maxY-b.minY,warns:[],radiusErrors:rounded.radiusErrors||[],radiusMeta:rounded.radiusMeta||{}};
}
function fabOutlinePoints(S,G){return (G&&G.pts&&G.pts.length)?G.pts.slice():[[0,0],[inch(S.w),0],[inch(S.w),inch(S.h)],[0,inch(S.h)]];}
