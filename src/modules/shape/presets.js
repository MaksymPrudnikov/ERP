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
  {id:'circle',code:'CIRC',label:'Circle'},
  {id:'ellipse',code:'ELL',label:'Ellipse'},
  {id:'oval',code:'OVAL',label:'Oval / Capsule'},
  {id:'notch-left',code:'N-L',label:'Notch Left'},
  {id:'notch-right',code:'N-R',label:'Notch Right'},
  {id:'notch-middle',code:'N-M',label:'Notch Middle'},
  {id:'notch-both',code:'N-B',label:'Notch Both'},
  {id:'notch-left-double',code:'N-L2',label:'Notch Left Double'},
  {id:'notch-right-double',code:'N-R2',label:'Notch Right Double'}
];
function shapePresetInfo(id){for(var i=0;i<SHAPE_PRESETS.length;i++)if(SHAPE_PRESETS[i].id===id)return SHAPE_PRESETS[i];return SHAPE_PRESETS[0];}
function shapeType(id){return SHAPE_PRESETS.some(function(x){return x.id===id;})?id:'smart';}
function shapeClamp(v,a,b){v=+v||0;return Math.max(a,Math.min(b,v));}
function shapeParamNumber(p,k,d){var r=fabParseDimStrict(p&&p[k]);return r.ok?r.v:(d||0);}
function shapeDefaultParams(type){
  var all={
    'corner-offset':{tlx:'0',tly:'0',trx:'0',try:'0',brx:'0',bry:'0',blx:'0',bly:'0'},
    parallelogram:{skew:'4'},raked:{leftDrop:'0',rightDrop:'6'},triangle:{apexX:'24'},
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
  if(t==='polygon'){
    var raw=(S.shape&&S.shape.polygon)||[];
    V=raw.map(function(v,i){return shapeVertex(v.id||('V'+(i+1)),shapeParamNumber(v,'x',0),shapeParamNumber(v,'y',0),'E:'+(v.id||('V'+(i+1))),'V'+(i+1));});
    return shapeLineTopology(V);
  }
  if(t==='rectangle')V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W,0,'B')];
  if(t==='parallelogram'){
    var sk=shapeParamNumber(p,'skew',0);V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',sk,H,'D'),shapeVertex('TR',W,H,'C'),shapeVertex('BR',W-sk,0,'B')];
  }
  if(t==='raked'){
    var ld=shapeParamNumber(p,'leftDrop',0),rd=shapeParamNumber(p,'rightDrop',0);V=[shapeVertex('BL',0,0,'A'),shapeVertex('TL',0,H-ld,'D'),shapeVertex('TR',W,H-rd,'C'),shapeVertex('BR',W,0,'B')];
  }
  if(t==='corner-offset'){
    var tlx=shapeParamNumber(p,'tlx',0),tly=shapeParamNumber(p,'tly',0),trx=shapeParamNumber(p,'trx',0),tryy=shapeParamNumber(p,'try',0),brx=shapeParamNumber(p,'brx',0),bry=shapeParamNumber(p,'bry',0),blx=shapeParamNumber(p,'blx',0),bly=shapeParamNumber(p,'bly',0);
    V=[shapeVertex('BL',blx,bly,'A'),shapeVertex('TL',tlx,H-tly,'D'),shapeVertex('TR',W-trx,H-tryy,'C'),shapeVertex('BR',W-brx,bry,'B')];
  }
  if(t==='triangle'){
    var ax=shapeParamNumber(p,'apexX',W/2);V=[shapeVertex('BL',0,0,'A'),shapeVertex('APEX',ax,H,'C'),shapeVertex('BR',W,0,'B')];
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
