/* =====================================================================
   shape/presets · schema-v2
   Каталог параметрических фигур и стабильная topology-модель.
   OUT: вершины, физические рёбра и sampled contour для расчётов.
   ===================================================================== */

var SHAPE_PRESETS=[
  {id:'smart',code:'SMART',label:'Advanced Smart-Shape'},
  {id:'rectangle',code:'RECT',label:'Rectangle'},
  {id:'corner-offset',code:'C-OFF',label:'Corner Offset / Smart Quad'},
  {id:'parallelogram',code:'PARA',label:'Parallelogram'},
  {id:'raked',code:'RAKE',label:'Raked Rectangle'},
  {id:'triangle',code:'TRI',label:'Triangle'},
  {id:'polygon',code:'POLY',label:'Polygon'},
  {id:'custom',code:'CUST',label:'Custom Shape'},
  {id:'circle',code:'CIRC',label:'Circle'},
  {id:'ellipse',code:'ELL',label:'Ellipse'},
  {id:'oval',code:'OVAL',label:'Oval / Capsule'},
  {id:'notch-left',code:'N-L',label:'Notch Left',legacy:true},
  {id:'notch-right',code:'N-R',label:'Notch Right',legacy:true},
  {id:'notch-middle',code:'N-M',label:'Notch Middle',legacy:true},
  {id:'notch-both',code:'N-B',label:'Notch Both',legacy:true},
  {id:'notch-left-double',code:'N-L2',label:'Notch Left Double',legacy:true},
  {id:'notch-right-double',code:'N-R2',label:'Notch Right Double',legacy:true}
];
/* Parallelogram is measured several different ways on site.  Keep the four
   entry modes in the engineering module (rather than only in the UI), so an
   imported/saved definition produces the same contour, DXF and edge lengths.

   Left/Right: Width is the physical horizontal edge and Height is the plumb
   projection of the sloping side.  Up/Down is the same construction turned
   through 90 degrees: Height is the physical vertical edge and Width is the
   level projection of the sloping top/bottom edge. */
var SHAPE_PARA_MEASURES=[
  {id:'height-oos',label:'Height and OOS'},
  {id:'height-diagonal',label:'Height and Diagonal'},
  {id:'diagonal-angle',label:'Diagonal and Angle'},
  {id:'height-angle',label:'Height and Angle'}
];
var SHAPE_PARA_DIRECTIONS=[
  {id:'left',label:'Left',arrow:'←'},
  {id:'right',label:'Right',arrow:'→'},
  {id:'up',label:'Up',arrow:'↑'},
  {id:'down',label:'Down',arrow:'↓'}
];
function shapeParaMeasure(v){return SHAPE_PARA_MEASURES.some(function(x){return x.id===v;})?v:'height-oos';}
function shapeParaDirection(v){return SHAPE_PARA_DIRECTIONS.some(function(x){return x.id===v;})?v:'right';}
function shapeParaAngleText(v){return isFinite(v)?(+v.toFixed(2)).toFixed(2):'';}
/* Editable/saved fields follow the rest of ERP and store a bare fraction.
   The inch mark belongs only to diagrams and readouts. */
function shapeParaDimText(v){return isFinite(v)?frac16(v):'';}
var SHAPE_RAKE_SIDES=[{id:'top',label:'Top'},{id:'bottom',label:'Bottom'},{id:'left',label:'Left'},{id:'right',label:'Right'}];
var SHAPE_RAKE_SHORT_SIDES=[{id:'left',label:'Left'},{id:'right',label:'Right'}];
function shapeRakeSide(v){v=String(v||'').toLowerCase();return ['top','bottom','left','right'].indexOf(v)>=0?v:'top';}
function shapeRakeShortSide(v){return String(v||'').toLowerCase()==='left'?'left':'right';}
/* Raked Rectangle uses the long height as its stable master height.  For the
   historic model, leftDrop/rightDrop were the two top offsets; migrate those
   values into the same long/short-height construction without changing its
   contour. */
function shapeRakedValues(widthRaw,longHeightRaw,rawParams){
  var p=rawParams&&typeof rawParams==='object'?rawParams:{},errors=[],Wq=fabParseDimStrict(widthRaw),Hq=fabParseDimStrict(longHeightRaw);
  if(!Wq.ok)errors.push('Raked Rectangle: Width is not a valid dimension.');
  if(!Hq.ok)errors.push('Raked Rectangle: Long Height is not a valid dimension.');
  var W=Wq.ok?Wq.v:NaN,H=Hq.ok?Hq.v:NaN,legacy=p.leftDrop!=null||p.rightDrop!=null,shortQ=fabParseDimStrict(p.shortHeight),shortH=shortQ.ok?shortQ.v:NaN,rake=shapeRakeSide(p.rakeSide),shortSide=shapeRakeShortSide(p.shortSide),leftH,rightH;
  if(legacy){
    var ld=fabParseDimStrict(p.leftDrop),rd=fabParseDimStrict(p.rightDrop);
    if(!ld.ok||!rd.ok)errors.push('Raked Rectangle: legacy top drops are not valid dimensions.');
    else{leftH=H-ld.v;rightH=H-rd.v;shortH=Math.min(leftH,rightH);shortSide=leftH<=rightH?'left':'right';rake='top';}
  }else{
    if(!shortQ.ok)errors.push('Raked Rectangle: Short Height is not a valid dimension.');
    leftH=shortSide==='left'?shortH:H;rightH=shortSide==='right'?shortH:H;
  }
  if(isFinite(W)&&W<=0)errors.push('Raked Rectangle: Width must be greater than zero.');
  if(isFinite(H)&&H<=0)errors.push('Raked Rectangle: Long Height must be greater than zero.');
  if(isFinite(shortH)&&(shortH<=0||shortH>H))errors.push('Raked Rectangle: Short Height must be greater than zero and no greater than Long Height.');
  if(!isFinite(leftH)||!isFinite(rightH)||leftH<=0||rightH<=0)errors.push('Raked Rectangle: both side heights must be greater than zero.');
  return {ok:errors.length===0,errors:errors,width:W,longHeight:H,shortHeight:shortH,leftHeight:leftH,rightHeight:rightH,rakeSide:rake,shortSide:shortSide,legacy:legacy};
}
function shapeRakedVertices(q){
  var W=q.width,H=q.longHeight,L=q.leftHeight,R=q.rightHeight,V=[];
  if(q.rakeSide==='top')V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,L,'D'),shapeVertex('TR',W,R,'C'),shapeVertex('BR',W,0,'B')];
  else if(q.rakeSide==='bottom')V=[shapeVertex('BL',0,H-L,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,H-R,'B')];
  else if(q.rakeSide==='left'){
    var topX=q.shortSide==='left'?H-q.shortHeight:0,bottomX=q.shortSide==='left'?0:H-q.shortHeight;
    V=[shapeVertex('BL',bottomX,0,'A'),shapeVertex('TL',topX,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
  }else{
    var topR=q.shortSide==='left'?W:W-(H-q.shortHeight),bottomR=q.shortSide==='left'?W-(H-q.shortHeight):W;
    V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',topR,H,'C'),shapeVertex('BR',bottomR,0,'B')];
  }
  return shapeLineTopology(V);
}
/* Triangle. Оператор снимает треугольник одним из двух способов: «квадратным»
   набором (низ, высота и смещение вершины) или тремя сторонами — как рулеткой
   на объекте. Оба набора описывают ОДИН контур, поэтому переключение режима
   фигуру не двигает: недостающая пара считается из имеющейся. */
var SHAPE_TRI_MEASURES=[{id:'square',label:'Square Mode · Height and Top Offset'},{id:'diagonal',label:'Diagonal Mode · Left and Right edges'}];
function shapeTriMeasure(v){v=String(v||'').toLowerCase();return SHAPE_TRI_MEASURES.some(function(x){return x.id===v;})?v:'square';}
function shapeTriangleValues(bottomRaw,heightRaw,rawParams){
  var p=rawParams&&typeof rawParams==='object'?rawParams:{},errors=[],mode=shapeTriMeasure(p.measureMode);
  var Bq=fabParseDimStrict(bottomRaw),B=Bq.ok?Bq.v:NaN,height=NaN,offset=NaN,left=NaN,right=NaN;
  if(!Bq.ok)errors.push('Triangle: Bottom is not a valid dimension.');
  if(isFinite(B)&&B<=0)errors.push('Triangle: Bottom must be greater than zero.');
  if(mode==='diagonal'){
    var Lq=fabParseDimStrict(p.leftEdge),Rq=fabParseDimStrict(p.rightEdge);
    if(!Lq.ok)errors.push('Triangle: Left Edge is not a valid dimension.');
    if(!Rq.ok)errors.push('Triangle: Right Edge is not a valid dimension.');
    left=Lq.ok?Lq.v:NaN;right=Rq.ok?Rq.v:NaN;
    if(isFinite(left)&&left<=0)errors.push('Triangle: Left Edge must be greater than zero.');
    if(isFinite(right)&&right<=0)errors.push('Triangle: Right Edge must be greater than zero.');
    /* Три стороны либо замыкаются, либо нет — это школьное неравенство, и
       честная ошибка здесь лучше, чем NaN, уехавший в контур. */
    if(isFinite(B)&&B>0&&isFinite(left)&&left>0&&isFinite(right)&&right>0){
      if(left+right<=B||B+left<=right||B+right<=left)errors.push('Triangle: Bottom, Left and Right edges do not close a triangle.');
      else{
        offset=(B*B+left*left-right*right)/(2*B);
        var sq=left*left-offset*offset;height=sq>0?Math.sqrt(sq):NaN;
        if(!(height>0))errors.push('Triangle: Bottom, Left and Right edges do not close a triangle.');
        else if(offset<0||offset>B)errors.push('Triangle: Left and Right edges put the apex outside the Bottom edge.');
      }
    }
  }else{
    var Hq=fabParseDimStrict(heightRaw),Oq=fabParseDimStrict(p.topOffset);
    if(!Hq.ok)errors.push('Triangle: Height is not a valid dimension.');
    if(!Oq.ok)errors.push('Triangle: Top Offset is not a valid dimension.');
    height=Hq.ok?Hq.v:NaN;offset=Oq.ok?Oq.v:NaN;
    if(isFinite(height)&&height<=0)errors.push('Triangle: Height must be greater than zero.');
    if(isFinite(offset)&&isFinite(B)&&(offset<0||offset>B))errors.push('Triangle: Top Offset must be between zero and Bottom.');
    if(isFinite(height)&&isFinite(offset)&&isFinite(B)){left=Math.hypot(offset,height);right=Math.hypot(B-offset,height);}
  }
  return {ok:errors.length===0,errors:errors,mode:mode,bottom:B,height:height,topOffset:offset,leftEdge:left,rightEdge:right};
}
/* Вершины и коды рёбер те же, что были у старого треугольника: сохранённая
   обработка кромки A/B/C переживает переход на режимы ввода. */
function shapeTriangleVertices(q){
  return shapeLineTopology([shapeVertex('BL',0,0,'A'),shapeVertex('APEX',q.topOffset,q.height,'C'),shapeVertex('BR',q.bottom,0,'B')]);
}
/* Polygon — правильный многоугольник: оператор задаёт число сторон и длину
   стороны, координаты вершин система считает сама. Свободный контур по точкам
   никуда не делся, он живёт отдельным типом Custom Shape.
   Ориентация как в эталоне: снизу горизонтальная сторона, у чётного числа
   сторон горизонтальной выходит и верхняя. Обход по часовой стрелке от левого
   нижнего угла — как у прямоугольника, чтобы рёбра нумеровались привычно. */
var SHAPE_POLYGON_MIN_SIDES=3,SHAPE_POLYGON_MAX_SIDES=60;
function shapeRegularPolygonValues(rawParams){
  var p=rawParams&&typeof rawParams==='object'?rawParams:{},errors=[];
  var rawSides=String(p.sides==null?'':p.sides).trim(),n=rawSides===''?NaN:Number(rawSides);
  var Sq=fabParseDimStrict(p.sideLength),side=Sq.ok?Sq.v:NaN;
  if(!isFinite(n)||Math.floor(n)!==n)errors.push('Polygon: Number of Sides must be a whole number.');
  else if(n<SHAPE_POLYGON_MIN_SIDES||n>SHAPE_POLYGON_MAX_SIDES)errors.push('Polygon: Number of Sides must be between '+SHAPE_POLYGON_MIN_SIDES+' and '+SHAPE_POLYGON_MAX_SIDES+'.');
  if(!Sq.ok)errors.push('Polygon: Side Length is not a valid dimension.');
  else if(!(side>0))errors.push('Polygon: Side Length must be greater than zero.');
  var points=[],width=NaN,height=NaN,radius=NaN,apothem=NaN;
  if(!errors.length){
    radius=side/(2*Math.sin(Math.PI/n));apothem=side/(2*Math.tan(Math.PI/n));
    var xs=[],ys=[],i,a;
    for(i=0;i<n;i++){
      a=-Math.PI/2-Math.PI/n-i*2*Math.PI/n;
      points.push([radius*Math.cos(a),radius*Math.sin(a)]);xs.push(points[i][0]);ys.push(points[i][1]);
    }
    var minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys);
    width=Math.max.apply(null,xs)-minX;height=Math.max.apply(null,ys)-minY;
    points=points.map(function(q){return [q[0]-minX,q[1]-minY];});
  }
  return {ok:errors.length===0,errors:errors,sides:n,sideLength:side,radius:radius,apothem:apothem,width:width,height:height,perimeter:isFinite(n)&&isFinite(side)?n*side:NaN,points:points};
}
function shapeRegularPolygonVertices(q){
  return shapeLineTopology(q.points.map(function(pt,i){var id='V'+(i+1);return shapeVertex(id,pt[0],pt[1],'E:'+id,id);}));
}
function shapeParaParsed(raw,label,errors){
  var q=fabParseDimStrict(raw);
  if(!q.ok){errors.push('Parallelogram: '+label+' is not a valid dimension.');return NaN;}
  return q.v;
}
/* Resolve the active measurement pair into one canonical construction.
   The return value deliberately contains both input and calculated values;
   callers can show the latter for checking without keeping a second geometry. */
function shapeParallelogramValues(widthRaw,heightRaw,rawParams){
  var p=rawParams&&typeof rawParams==='object'?rawParams:{},errors=[];
  var mode=shapeParaMeasure(p.measureMode),direction=shapeParaDirection(p.slopeDirection);
  var sideways=direction==='left'||direction==='right';
  /* Diagonal + Angle derives Height for Left/Right and Width for Up/Down.
     Do not reject a stale hidden value that does not participate in the mode. */
  var W=(!sideways&&mode==='diagonal-angle')?NaN:shapeParaParsed(widthRaw,'Width',errors);
  var H=(sideways&&mode==='diagonal-angle')?NaN:shapeParaParsed(heightRaw,'Height',errors);
  var oos=NaN,diagonal=NaN,angle=NaN,component=sideways?H:W;
  if(mode==='height-oos'){
    oos=shapeParaParsed(p.outOfSquare,'Out of square',errors);
    if(isFinite(component)&&isFinite(oos)){diagonal=Math.hypot(component,oos);angle=Math.atan2(oos,component)*180/Math.PI;}
  }else if(mode==='height-diagonal'){
    diagonal=shapeParaParsed(p.diagonal,'Diagonal Length',errors);
    if(isFinite(component)&&isFinite(diagonal)){
      if(diagonal+1e-9<component)errors.push('Parallelogram: Diagonal Length cannot be shorter than the perpendicular Height / Width.');
      else{oos=Math.sqrt(Math.max(0,diagonal*diagonal-component*component));angle=Math.atan2(oos,component)*180/Math.PI;}
    }
  }else if(mode==='diagonal-angle'){
    diagonal=shapeParaParsed(p.diagonal,'Diagonal Length',errors);
    var aq=Number(p.angle);if(String(p.angle==null?'':p.angle).trim()===''||!isFinite(aq))errors.push('Parallelogram: OOS Angle is not a valid angle.');else angle=aq;
    if(isFinite(diagonal)&&isFinite(angle)&&angle>=0&&angle<90){
      component=diagonal*Math.cos(angle*Math.PI/180);oos=diagonal*Math.sin(angle*Math.PI/180);
      if(sideways)H=component;else W=component;
    }
  }else{
    var ar=Number(p.angle);if(String(p.angle==null?'':p.angle).trim()===''||!isFinite(ar))errors.push('Parallelogram: OOS Angle is not a valid angle.');else angle=ar;
    if(isFinite(component)&&isFinite(angle)&&angle>=0&&angle<90){oos=component*Math.tan(angle*Math.PI/180);diagonal=Math.hypot(component,oos);}
  }
  if(isFinite(W)&&!(W>0))errors.push('Parallelogram: Width must be greater than zero.');
  if(isFinite(H)&&!(H>0))errors.push('Parallelogram: Height must be greater than zero.');
  if(isFinite(oos)&&oos<0)errors.push('Parallelogram: Out of square cannot be negative.');
  if(isFinite(diagonal)&&!(diagonal>0))errors.push('Parallelogram: Diagonal Length must be greater than zero.');
  if(isFinite(angle)&&(angle<0||angle>=90))errors.push('Parallelogram: OOS Angle must be from 0° up to, but not including, 90°.');
  return {ok:errors.length===0,errors:errors,mode:mode,direction:direction,sideways:sideways,
    width:W,height:H,outOfSquare:oos,diagonal:diagonal,angle:angle};
}
/* Вырезы больше не заводятся отдельными типами: любой notch рисуется точками
   в Custom Shape. Сами типы остаются в каталоге — сохранённые формы обязаны
   открываться, — но из списка создания исчезают. Текущий тип показываем всегда,
   иначе у старой формы селект показал бы чужую строку. */
function shapePresetChoices(current){
  return SHAPE_PRESETS.filter(function(p){return !p.legacy||p.id===current;});
}
/* Габарит Custom Shape не вводится руками, а следует за координатами точек. */
function shapeCustomBounds(points){
  var xs=[],ys=[];
  (points||[]).forEach(function(v){var x=fabParseDimStrict(v&&v.x),y=fabParseDimStrict(v&&v.y);if(x.ok&&y.ok){xs.push(x.v);ys.push(y.v);}});
  if(xs.length<3)return null;
  return {width:Math.max.apply(null,xs)-Math.min.apply(null,xs),height:Math.max.apply(null,ys)-Math.min.apply(null,ys)};
}
function shapePresetInfo(id){for(var i=0;i<SHAPE_PRESETS.length;i++)if(SHAPE_PRESETS[i].id===id)return SHAPE_PRESETS[i];return SHAPE_PRESETS[0];}
function shapeType(id){return SHAPE_PRESETS.some(function(x){return x.id===id;})?id:'smart';}
function shapeClamp(v,a,b){v=+v||0;return Math.max(a,Math.min(b,v));}
function shapeParamNumber(p,k,d){var r=fabParseDimStrict(p&&p[k]);return r.ok?r.v:(d||0);}
function shapeDefaultParams(type){
  var all={
    'corner-offset':{tlx:'0',tly:'0',trx:'0',try:'0',brx:'0',bry:'0',blx:'0',bly:'0'},
    parallelogram:{measureMode:'height-oos',outOfSquare:'4',diagonal:'36 1/4',angle:'6.34',slopeDirection:'right'},raked:{shortHeight:'30',rakeSide:'top',shortSide:'right'},triangle:{measureMode:'square',topOffset:'24',leftEdge:'43 1/4',rightEdge:'43 1/4'},polygon:{sides:'6',sideLength:'12'},
    'notch-left':{depth:'6',height:'12',fromBottom:'12'},'notch-right':{depth:'6',height:'12',fromBottom:'12'},
    'notch-middle':{width:'8',depth:'8',fromLeft:'20'},'notch-both':{depth:'6',height:'10',fromBottom:'12'},
    'notch-left-double':{depth1:'4',height1:'8',gap:'8',depth2:'7',height2:'8'},
    'notch-right-double':{depth1:'4',height1:'8',gap:'8',depth2:'7',height2:'8'}
  };
  return JSON.parse(JSON.stringify(all[type]||{}));
}
function shapeVertex(id,x,y,outEdge,label){return {id:id,x:+x,y:+y,outEdge:outEdge,label:label||id};}
function shapeLineTopology(vertices){
  var pts=vertices.map(function(v){return [v.x,v.y];}),edges=[];
  for(var i=0;i<vertices.length;i++){
    var a=vertices[i],b=vertices[(i+1)%vertices.length],id=a.outEdge||('E'+(i+1));
    edges.push({id:id,segmentId:id,type:'line',p1:[a.x,a.y],p2:[b.x,b.y],startVertexId:a.id,endVertexId:b.id,length:Math.hypot(b.x-a.x,b.y-a.y)});
  }
  return {vertices:vertices,points:pts,pointEdgeIds:edges.map(function(e){return e.id;}),edges:edges};
}
function shapeSampleEllipse(W,H,type){
  var cx=W/2,cy=H/2,rx=W/2,ry=H/2,curvature=Math.max(rx*rx/Math.max(ry,1e-9),ry*ry/Math.max(rx,1e-9)),target=1/2048;
  var n=Math.max(128,Math.min(4096,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-target/Math.max(curvature,target))))));n=Math.ceil(n/4)*4;
  var pts=[],ids=[],edges=[];
  for(var i=0;i<n;i++){
    var a=Math.PI-(Math.PI*2*i/n),id='ARC';
    pts.push([cx+rx*Math.cos(a),cy+ry*Math.sin(a)]);ids.push(id);
  }
  for(i=0;i<n;i++){var p1=pts[i],p2=pts[(i+1)%n];edges.push({id:ids[i],segmentId:ids[i]+':'+i,type:'arc-sample',p1:p1,p2:p2,length:Math.hypot(p2[0]-p1[0],p2[1]-p1[1])});}
  return {vertices:[],points:pts,pointEdgeIds:ids,edges:edges,analytic:{type:type,cx:cx,cy:cy,rx:rx,ry:ry}};
}
function shapeSampleCapsule(W,H){
  if(Math.abs(W-H)<1e-9)return shapeSampleEllipse(W,H,'circle');
  var pts=[],ids=[],radius=Math.min(W,H)/2,target=1/2048,n=Math.max(48,Math.min(2048,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-target/Math.max(radius,target)))))),i,a;
  if(H>W){
    var r=W/2,cx=W/2,bot=r,top=H-r;
    pts.push([0,bot],[0,top]);ids.push('A','ARC-TOP');
    for(i=1;i<=n;i++){a=Math.PI-Math.PI*i/n;pts.push([cx+r*Math.cos(a),top+r*Math.sin(a)]);ids.push(i<n?'ARC-TOP':'C');}
    pts.push([W,bot]);ids.push('ARC-BOTTOM');
    for(i=1;i<n;i++){a=-Math.PI*i/n;pts.push([cx+r*Math.cos(a),bot+r*Math.sin(a)]);ids.push('ARC-BOTTOM');}
  }else{
    r=H/2;var cy=H/2,left=r,right=W-r;
    pts.push([left,0],[right,0]);ids.push('B','ARC-RIGHT');
    for(i=1;i<=n;i++){a=-Math.PI/2+Math.PI*i/n;pts.push([right+r*Math.cos(a),cy+r*Math.sin(a)]);ids.push(i<n?'ARC-RIGHT':'D');}
    pts.push([left,H]);ids.push('ARC-LEFT');
    for(i=1;i<n;i++){a=Math.PI/2+Math.PI*i/n;pts.push([left+r*Math.cos(a),cy+r*Math.sin(a)]);ids.push('ARC-LEFT');}
  }
  var edges=[];for(i=0;i<pts.length;i++){var p=pts[i],q=pts[(i+1)%pts.length],id=ids[i]||'ARC';edges.push({id:id,segmentId:id+':'+i,type:id.indexOf('ARC')===0?'arc-sample':'line',p1:p,p2:q,length:Math.hypot(q[0]-p[0],q[1]-p[1])});}
  return {vertices:[],points:pts,pointEdgeIds:ids,edges:edges,analytic:{type:'oval'}};
}
function shapePresetTopology(S){
  var W=inch(S.w),H=inch(S.h),p=(S.shape&&S.shape.params)||{},t=shapeType(S.shape&&S.shape.type),V=[];
  if(t==='circle')return shapeSampleEllipse(W,H,'circle');
  if(t==='ellipse')return shapeSampleEllipse(W,H,'ellipse');
  if(t==='oval')return shapeSampleCapsule(W,H);
  if(t==='custom'){
    var raw=(S.shape&&S.shape.polygon)||[];
    V=raw.map(function(v,i){return shapeVertex(v.id||('V'+(i+1)),shapeParamNumber(v,'x',0),shapeParamNumber(v,'y',0),'E:'+(v.id||('V'+(i+1))),'V'+(i+1));});
    return shapeLineTopology(V);
  }
  if(t==='polygon'){
    var pq=shapeRegularPolygonValues(p);
    if(pq.ok){W=pq.width;H=pq.height;return shapeRegularPolygonVertices(pq);}
  }
  if(t==='rectangle')V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
  if(t==='parallelogram'){
    var para=shapeParallelogramValues(S.w,S.h,p),sk=para.outOfSquare;W=para.width;H=para.height;
    if(para.direction==='right')V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',sk,H,'D'),shapeVertex('TR',sk+W,H,'C'),shapeVertex('BR',W,0,'B')];
    if(para.direction==='left')V=[shapeVertex('BL',sk,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',sk+W,0,'B')];
    if(para.direction==='up')V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H+sk,'C'),shapeVertex('BR',W,sk,'B')];
    if(para.direction==='down')V=[shapeVertex('BL',0,sk,'A'),shapeVertex('TL',0,H+sk,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
  }
  if(t==='raked'){
    var rq=shapeRakedValues(S.w,S.h,p);if(rq.ok){W=rq.width;H=rq.longHeight;return shapeRakedVertices(rq);}
  }
  if(t==='corner-offset'){
    var tlx=shapeParamNumber(p,'tlx',0),tly=shapeParamNumber(p,'tly',0),trx=shapeParamNumber(p,'trx',0),tryy=shapeParamNumber(p,'try',0),brx=shapeParamNumber(p,'brx',0),bry=shapeParamNumber(p,'bry',0),blx=shapeParamNumber(p,'blx',0),bly=shapeParamNumber(p,'bly',0);
    V=[shapeVertex('BL',blx,bly,'A'),shapeVertex('TL',tlx,H-tly,'D'),shapeVertex('TR',W-trx,H-tryy,'C'),shapeVertex('BR',W-brx,bry,'B')];
  }
  if(t==='triangle'){
    var tq=shapeTriangleValues(S.w,S.h,p);
    if(tq.ok){W=tq.bottom;H=tq.height;return shapeTriangleVertices(tq);}
    var ax=shapeParamNumber(p,'topOffset',W/2);V=[shapeVertex('BL',0,0,'A'),shapeVertex('APEX',ax,H,'C'),shapeVertex('BR',W,0,'B')];
  }
  function notchSide(left,doubleNotch){
    var fb=shapeParamNumber(p,'fromBottom',12),d=shapeParamNumber(p,'depth',6),nh=shapeParamNumber(p,'height',12);
    if(!doubleNotch){
      if(left)return [shapeVertex('BL',0,0,'A1'),shapeVertex('N1',0,fb,'N1'),shapeVertex('N2',d,fb,'N2'),shapeVertex('N3',d,fb+nh,'N3'),shapeVertex('N4',0,fb+nh,'A2'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
      return [shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C1'),shapeVertex('N4',W,fb+nh,'N3'),shapeVertex('N3',W-d,fb+nh,'N2'),shapeVertex('N2',W-d,fb,'N1'),shapeVertex('N1',W,fb,'C2'),shapeVertex('BR',W,0,'B')];
    }
    var h1=shapeParamNumber(p,'height1',8),gap=shapeParamNumber(p,'gap',8),h2=shapeParamNumber(p,'height2',8),d1=shapeParamNumber(p,'depth1',4),d2=shapeParamNumber(p,'depth2',7),y1=h1,y2=y1+gap,y3=y2+h2;
    if(left)return [shapeVertex('BL',0,0,'A0'),shapeVertex('L1',d1,0,'N1'),shapeVertex('L2',d1,y1,'N2'),shapeVertex('L3',d2,y1,'N3'),shapeVertex('L4',d2,y3,'N4'),shapeVertex('L5',0,y3,'A1'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
    return [shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C0'),shapeVertex('R5',W,y3,'N4'),shapeVertex('R4',W-d2,y3,'N3'),shapeVertex('R3',W-d2,y1,'N2'),shapeVertex('R2',W-d1,y1,'N1'),shapeVertex('R1',W-d1,0,'C1'),shapeVertex('BR',W,0,'B')];
  }
  if(t==='notch-left')V=notchSide(true,false);
  if(t==='notch-right')V=notchSide(false,false);
  if(t==='notch-left-double')V=notchSide(true,true);
  if(t==='notch-right-double')V=notchSide(false,true);
  if(t==='notch-middle'){
    var nw=shapeParamNumber(p,'width',8),dep=shapeParamNumber(p,'depth',8),fl=shapeParamNumber(p,'fromLeft',20);
    V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D1'),shapeVertex('NM1',fl,H,'N1'),shapeVertex('NM2',fl,H-dep,'N2'),shapeVertex('NM3',fl+nw,H-dep,'N3'),shapeVertex('NM4',fl+nw,H,'D2'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
  }
  if(t==='notch-both'){
    var ndep=shapeParamNumber(p,'depth',6),nhei=shapeParamNumber(p,'height',10),nfb=shapeParamNumber(p,'fromBottom',12);
    V=[shapeVertex('BL',0,0,'A1'),shapeVertex('L1',0,nfb,'NL1'),shapeVertex('L2',ndep,nfb,'NL2'),shapeVertex('L3',ndep,nfb+nhei,'NL3'),shapeVertex('L4',0,nfb+nhei,'A2'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C1'),shapeVertex('R4',W,nfb+nhei,'NR3'),shapeVertex('R3',W-ndep,nfb+nhei,'NR2'),shapeVertex('R2',W-ndep,nfb,'NR1'),shapeVertex('R1',W,nfb,'C2'),shapeVertex('BR',W,0,'B')];
  }
  return shapeLineTopology(V.length?V:[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')]);
}
