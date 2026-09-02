/* =====================================================================
   shape/drawing · schema-v2
   Production Drawing и Cutting Shape из одного Component/Shape revision.
   ===================================================================== */

function shapeXml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function shapeSvgPath(P,X,Y){return (P||[]).map(function(p,i){return (i?'L ':'M ')+X(p[0])+' '+Y(p[1]);}).join(' ')+' Z';}
/* На самом листе единицы уже объявлены один раз в примечании. Повторять знак
   дюйма у каждого числа — визуальный шум, особенно вокруг фурнитуры. */
function shapeDrawingDim(v){return String(dimIn16(v)).replace(/[″”"]/g,'').trim();}
/* Поля кадра задаёт вызывающий: производственному чертежу нужен запас под
   цепочки размеров и вид сверху, раскройному — нет. */
function shapeDrawingFrame(points,opts){
  opts=opts||{};
  var b=fabEdgeBounds(points),W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),
      vw=opts.vw||960,vh=opts.vh||700,pL=opts.pL||150,pR=opts.pR||180,pT=opts.pT||95,pB=opts.pB||125,
      sc=Math.min((vw-pL-pR)/W,(vh-pT-pB)/H),dw=W*sc,dh=H*sc,x0=pL+(vw-pL-pR-dw)/2,y0=pT+(vh-pT-pB-dh)/2;
  return {vw:vw,vh:vh,b:b,W:W,H:H,sc:sc,x0:x0,y0:y0,X:function(x){return x0+(x-b.minX)*sc;},Y:function(y){return y0+dh-(y-b.minY)*sc;},dw:dw,dh:dh,margin:opts.margin||42};
}
/* Габаритный размер оформлен так же, как размеры на детали: стрелка и стоп-рыска
   на каждом конце, между ними ничего. */
function shapeDimH(x1,x2,y,label,color){color=color||'#344054';return '<line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="'+color+'"/><path d="M '+x1+' '+y+' l 7 -4 v 8 z M '+x2+' '+y+' l -7 -4 v 8 z" fill="'+color+'"/><line x1="'+x1+'" y1="'+(y-5)+'" x2="'+x1+'" y2="'+(y+5)+'" stroke="'+color+'"/><line x1="'+x2+'" y1="'+(y-5)+'" x2="'+x2+'" y2="'+(y+5)+'" stroke="'+color+'"/><text x="'+((x1+x2)/2)+'" y="'+(y-8)+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+color+'">'+shapeXml(label)+'</text>';}
function shapeDimV(x,y1,y2,label,color){color=color||'#344054';var cy=(y1+y2)/2;return '<line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="'+color+'"/><path d="M '+x+' '+y1+' l -4 7 h 8 z M '+x+' '+y2+' l -4 -7 h 8 z" fill="'+color+'"/><line x1="'+(x-5)+'" y1="'+y1+'" x2="'+(x+5)+'" y2="'+y1+'" stroke="'+color+'"/><line x1="'+(x-5)+'" y1="'+y2+'" x2="'+(x+5)+'" y2="'+y2+'" stroke="'+color+'"/><text x="'+(x-10)+'" y="'+cy+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+color+'" transform="rotate(-90 '+(x-10)+' '+cy+')">'+shapeXml(label)+'</text>';}
function shapeMetricShift(opts,key){var n=opts&&opts.offsets?+(opts.offsets[key]||0):0;return Math.max(-4,Math.min(8,isFinite(n)?n:0))*8;}
function shapeMetricMenuSvg(opts,key,cx,cy,F){
  if(!opts||!opts.interactive||opts.selectedKey!==key)return '';
  var x=Math.max(34,Math.min((F&&F.vw||960)-34,cx)),w=24,h=20,x0=x-w;
  return '<g class="shape-dim-menu shape-metric-menu" onclick="event.stopPropagation()"><rect x="'+(x0-4)+'" y="'+(cy-h/2-4)+'" width="'+(w*2+8)+'" height="'+(h+8)+'" rx="7"/><g class="shape-dim-btn" onclick="event.stopPropagation();shapeNudgeMetricLabel(\''+shapeXml(key)+'\',-1)"><rect x="'+x0+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" rx="4"/><text x="'+(x0+w/2)+'" y="'+(cy+4)+'" text-anchor="middle">−</text></g><g class="shape-dim-btn" onclick="event.stopPropagation();shapeNudgeMetricLabel(\''+shapeXml(key)+'\',1)"><rect x="'+(x0+w)+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" rx="4"/><text x="'+(x0+w+w/2)+'" y="'+(cy+4)+'" text-anchor="middle">+</text></g></g>';
}
function shapeMetricMovableSvg(opts,key,text,cx,cy,F){
  if(!opts||!opts.interactive)return text;
  return '<g class="shape-metric-movable'+(opts.selectedKey===key?' active':'')+'" data-metric-label-key="'+shapeXml(key)+'" onclick="event.stopPropagation();shapeSelectMetricLabel(\''+shapeXml(key)+'\')"><title>Move metric label · − / +</title>'+text+'</g>'+shapeMetricMenuSvg(opts,key,cx,cy,F);
}
function shapeMetricDimH(x1,x2,edgeY,y,label,opts,F){
  var c='#111827',key='overall:width',shift=shapeMetricShift(opts,key);y=Math.max(edgeY+24,y+shift);var mid=(x1+x2)/2;
  var text='<text data-metric-role="width" x="'+mid+'" y="'+(y-9)+'" text-anchor="middle" font-size="16" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="5" paint-order="stroke fill">'+shapeXml(label)+'</text>';
  return '<line x1="'+x1+'" y1="'+edgeY+'" x2="'+x1+'" y2="'+(y+8)+'" stroke="'+c+'" stroke-width="1"/><line x1="'+x2+'" y1="'+edgeY+'" x2="'+x2+'" y2="'+(y+8)+'" stroke="'+c+'" stroke-width="1"/><line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="'+c+'" stroke-width="1.15" marker-start="url(#shapeMetricArrow)" marker-end="url(#shapeMetricArrow)"/>'+shapeMetricMovableSvg(opts,key,text,mid,y-34,F);
}
function shapeMetricDimV(x,edgeX,y1,y2,label,opts,F){
  var c='#111827',key='overall:height',shift=shapeMetricShift(opts,key);x=Math.min(edgeX-28,x-shift);var mid=(y1+y2)/2,tx=x-11;
  var text='<text data-metric-role="height" x="'+tx+'" y="'+mid+'" text-anchor="middle" font-size="16" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="5" paint-order="stroke fill" transform="rotate(-90 '+tx+' '+mid+')">'+shapeXml(label)+'</text>';
  return '<line x1="'+edgeX+'" y1="'+y1+'" x2="'+(x-8)+'" y2="'+y1+'" stroke="'+c+'" stroke-width="1"/><line x1="'+edgeX+'" y1="'+y2+'" x2="'+(x-8)+'" y2="'+y2+'" stroke="'+c+'" stroke-width="1"/><line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="'+c+'" stroke-width="1.15" marker-start="url(#shapeMetricArrow)" marker-end="url(#shapeMetricArrow)"/>'+shapeMetricMovableSvg(opts,key,text,x-64,mid,F);
}
function shapeInchDimH(x1,x2,fromY,y,label){
  var c='#98a2b3',mid=(x1+x2)/2;
  return '<line x1="'+x1+'" y1="'+fromY+'" x2="'+x1+'" y2="'+(y+7)+'" stroke="'+c+'" stroke-width=".75"/><line x1="'+x2+'" y1="'+fromY+'" x2="'+x2+'" y2="'+(y+7)+'" stroke="'+c+'" stroke-width=".75"/><line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="'+c+'" stroke-width=".8" marker-start="url(#shapeInchArrow)" marker-end="url(#shapeInchArrow)"/><text class="shape-inch-reference" data-inch-role="width" x="'+mid+'" y="'+(y-7)+'" text-anchor="middle" font-size="10.5" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="3" paint-order="stroke fill">'+shapeXml(label)+'</text>';
}
function shapeInchDimV(x,fromX,y1,y2,label){
  var c='#98a2b3',mid=(y1+y2)/2;
  return '<line x1="'+fromX+'" y1="'+y1+'" x2="'+(x-7)+'" y2="'+y1+'" stroke="'+c+'" stroke-width=".75"/><line x1="'+fromX+'" y1="'+y2+'" x2="'+(x-7)+'" y2="'+y2+'" stroke="'+c+'" stroke-width=".75"/><line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="'+c+'" stroke-width=".8" marker-start="url(#shapeInchArrow)" marker-end="url(#shapeInchArrow)"/><text class="shape-inch-reference" data-inch-role="height" x="'+(x-9)+'" y="'+mid+'" text-anchor="middle" font-size="10.5" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="3" paint-order="stroke fill" transform="rotate(-90 '+(x-9)+' '+mid+')">'+shapeXml(label)+'</text>';
}
function shapeMetricPositiveAngle(v){while(v<0)v+=Math.PI*2;while(v>=Math.PI*2)v-=Math.PI*2;return v;}
function shapeMetricLayerSvg(result,F,L,metric,opts){
  if(!metric||metric.vertices.length<3)return '';
  opts=opts||{};
  var P=metric.vertices.map(function(v){return v.point;}),DP=opts.points?function(p){return [F.X(p[0]),F.Y(p[1])];}:L.DP;
  var Q=P.map(DP),orient=fabSignedArea(Q)>=0?1:-1,c='#111827',ic='#98a2b3';
  var path=Q.map(function(p,i){return (i?'L ':'M ')+p[0]+' '+p[1];}).join(' ')+' Z';
  var o='<g class="shape-metric-layer" data-units="mm"><defs><marker id="shapeMetricArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="'+c+'" stroke-width=".9"/></marker><marker id="shapeInchArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="'+ic+'" stroke-width=".75"/></marker></defs>';
  o+='<path class="shape-metric-contour" d="'+path+'" fill="#f2f4f7" fill-opacity=".72" stroke="#344054" stroke-width="1.2"/>';
  var inchEdges='';
  metric.segments.forEach(function(seg,i){
    var a=Q[i],b=Q[(i+1)%Q.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
    /* Горизонтальное/вертикальное ребро, равное полному W/H, уже подписано
       габаритной цепочкой. Вторую такую же цифру возле кромки не рисуем. */
    var pdx=Math.abs(seg.p2[0]-seg.p1[0]),pdy=Math.abs(seg.p2[1]-seg.p1[1]);
    var repeatsWidth=pdy<1e-7&&Math.abs(seg.lengthMm-metric.bbox.widthMm)<.015;
    var repeatsHeight=pdx<1e-7&&Math.abs(seg.lengthMm-metric.bbox.heightMm)<.015;
    if(repeatsWidth||repeatsHeight)return;
    var nx=orient>0?-dy/len:dy/len,ny=orient>0?dx/len:-dx/len;
    var key='edge:'+i,off=Math.max(6,15+shapeMetricShift(opts,key));
    var x=(a[0]+b[0])/2+nx*off,y=(a[1]+b[1])/2+ny*off,ang=Math.atan2(dy,dx)*180/Math.PI;
    if(ang>90)ang-=180;if(ang<-90)ang+=180;
    var metricText='<text class="shape-metric-length" data-edge-id="'+shapeXml(seg.edgeId)+'" data-length-mm="'+shapeMetricFormat(seg.lengthMm)+'" x="'+x+'" y="'+(y+4.5)+'" text-anchor="middle" font-size="14.5" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="5" paint-order="stroke fill" transform="rotate('+ang+' '+x+' '+y+')">('+shapeMetricFormat(seg.lengthMm)+')</text>';
    o+=shapeMetricMovableSvg(opts,key,metricText,x,y+27,F);
    var ix=(a[0]+b[0])/2+nx*(off+21),iy=(a[1]+b[1])/2+ny*(off+21);
    inchEdges+='<text class="shape-inch-reference shape-inch-edge-reference" data-edge-id="'+shapeXml(seg.edgeId)+'" x="'+ix+'" y="'+(iy+3.5)+'" text-anchor="middle" font-size="10.5" font-weight="600" fill="'+ic+'" stroke="#fff" stroke-width="3" paint-order="stroke fill" transform="rotate('+ang+' '+ix+' '+iy+')">'+shapeXml(shapeDrawingDim(seg.lengthMm/SHAPE_MM_PER_INCH))+'″</text>';
  });
  if(inchEdges)o+='<g class="shape-inch-reference-layer" data-units="in">'+inchEdges+'</g>';
  metric.vertices.forEach(function(v,i){
    var b=Q[i],prev=Q[(i-1+Q.length)%Q.length],next=Q[(i+1)%Q.length];
    var a0=Math.atan2(next[1]-b[1],next[0]-b[0]),a1=Math.atan2(prev[1]-b[1],prev[0]-b[0]);
    var span=orient>0?shapeMetricPositiveAngle(a1-a0):shapeMetricPositiveAngle(a0-a1),delta=orient*span;
    var r=Math.max(12,Math.min(30,Math.min(Math.hypot(prev[0]-b[0],prev[1]-b[1]),Math.hypot(next[0]-b[0],next[1]-b[1]))*.24));
    var steps=Math.max(5,Math.ceil(span/(Math.PI/12))),arc='';
    for(var j=0;j<=steps;j++){var a=a0+delta*j/steps,x=b[0]+Math.cos(a)*r,y=b[1]+Math.sin(a)*r;arc+=(j?' L ':'M ')+x+' '+y;}
    var mid=a0+delta/2,key='angle:'+i,lr=Math.max(r+5,r+15+shapeMetricShift(opts,key)),lx=b[0]+Math.cos(mid)*lr,ly=b[1]+Math.sin(mid)*lr;
    o+='<path class="shape-metric-angle-arc" data-vertex-index="'+i+'" d="'+arc+'" fill="none" stroke="'+c+'" stroke-width="1.15"/>';
    var angleText='<text class="shape-metric-angle" data-vertex-index="'+i+'" data-convex="'+(v.convex?'true':'false')+'" x="'+lx+'" y="'+(ly+4.5)+'" text-anchor="middle" font-size="13.5" font-weight="600" fill="'+c+'" stroke="#fff" stroke-width="5" paint-order="stroke fill">('+shapeMetricFormat(v.angleDeg)+'°)</text>';
    o+=shapeMetricMovableSvg(opts,key,angleText,lx,ly+27,F);
  });
  var xs=Q.map(function(p){return p[0];}),ys=Q.map(function(p){return p[1];});
  var box={left:Math.min.apply(null,xs),right:Math.max.apply(null,xs),top:Math.min.apply(null,ys),bottom:Math.max.apply(null,ys)};
  /* Габариты держим рядом с деталью: большой пустой коридор создавал ложное
     ощущение, будто сам контур растянут до размерной линии. */
  var widthGap=Math.max(24,44+shapeMetricShift(opts,'overall:width'));
  var heightGap=Math.max(28,48+shapeMetricShift(opts,'overall:height'));
  o+=shapeMetricDimH(box.left,box.right,box.bottom,box.bottom+44,shapeMetricFormat(metric.bbox.widthMm),opts,F);
  o+=shapeMetricDimV(box.left-48,box.left,box.top,box.bottom,shapeMetricFormat(metric.bbox.heightMm),opts,F);
  o+='<g class="shape-inch-reference-layer shape-inch-overall" data-units="in">'+shapeInchDimH(box.left,box.right,box.bottom+widthGap+8,box.bottom+widthGap+34,shapeDrawingDim(metric.bbox.widthMm/SHAPE_MM_PER_INCH)+'″')+shapeInchDimV(box.left-heightGap-36,box.left-heightGap-8,box.top,box.bottom,shapeDrawingDim(metric.bbox.heightMm/SHAPE_MM_PER_INCH)+'″')+'</g>';
  var summary=[];
  if(opts.liteLabel)summary.push(String(opts.liteLabel));
  /* W/H уже стоят на габаритных линиях; в сводке оставляем только то, чего
     больше нигде на листе нет. */
  summary.push('Perimeter '+shapeMetricFormat(metric.perimeterMm)+' mm');
  summary.push('Thickness '+shapeMetricFormat(opts.thicknessMm==null?shapeThicknessMm(result.definition):opts.thicknessMm)+' mm');
  o+='<g class="shape-metric-summary" font-family="Arial,sans-serif" text-anchor="end" fill="'+c+'">'+summary.map(function(s,i){return '<text x="'+(F.vw-24)+'" y="'+(68+i*17)+'" font-size="'+(i===0&&opts.liteLabel?'13':'12')+'" font-weight="600">'+shapeXml(s)+'</text>';}).join('')+'</g>';
  return o+'</g>';
}
/* Архитектурное обозначение стекла: три параллельных диагональных штриха
   short / long / short. Clip-path гарантирует, что знак не выйдет за контур. */
function shapeGlassHatchSvg(layer){
  if(!layer||!layer.path||(layer.points||[]).length<3)return '';
  var P=layer.points,b=layer.box,w=Math.max(1,b.right-b.left),h=Math.max(1,b.bottom-b.top);
  var cx=P.reduce(function(s,p){return s+p[0];},0)/P.length,cy=P.reduce(function(s,p){return s+p[1];},0)/P.length;
  if(typeof fabPointInPoly==='function'&&!fabPointInPoly([cx,cy],P)){cx=(b.left+b.right)/2;cy=(b.top+b.bottom)/2;}
  var unit=Math.max(16,Math.min(30,Math.min(w,h)*.07)),lens=[unit,unit*1.85,unit],g='';
  lens.forEach(function(len,i){
    var off=(i-1)*12,x=cx+off*.7071,y=cy+off*.7071,dx=len*.35355,dy=len*.35355;
    g+='<line x1="'+(x-dx)+'" y1="'+(y+dy)+'" x2="'+(x+dx)+'" y2="'+(y-dy)+'"/>';
  });
  return '<g class="shape-glass-hatch" aria-label="Glass" stroke="#667085" stroke-width="1.15" stroke-linecap="round" opacity=".72"><defs><clipPath id="shapeGlassHatchClip"><path d="'+layer.path+'"/></clipPath></defs><g clip-path="url(#shapeGlassHatchClip)">'+g+'</g></g>';
}
function shapeEdgeGroups(geo){
  var g={},order=[];(geo.edges||[]).forEach(function(e){if(!g[e.id]){g[e.id]={id:e.id,length:0,segments:[]};order.push(e.id);}g[e.id].length+=e.length||0;g[e.id].segments.push(e);});return order.map(function(id){return g[id];});
}
/* Короткая цеховая запись обработки: 45° Back Mitre · FP · Bevel 1 (Front). */
function shapeOpText(o){
  if(o.type==='Mitering')return (o.angle||45)+'° '+((o.side||'back')==='front'?'Front':'Back')+' Mitre';
  if(o.type==='Beveling')return 'Bevel '+shapeDrawingDim(inch(o.width||'1'))+' ('+((o.side||'front')==='back'?'Back':'Front')+')';
  if(o.type==='Flat Polish')return 'FP';
  if(o.type==='Rough Arris')return 'RA';
  if(o.type==='CNC Shape Polish')return 'CNC';
  return o.type;
}
function shapeEdgeLabelsSvg(result,F,layer,metricMode,layoutOpts){
  var orient=fabSignedArea(result.points),lanes={},out='',DP=(layer&&layer.DP)||function(p){return [F.X(p[0]),F.Y(p[1])];};
  shapeEdgeGroups(result.geometry).forEach(function(g){
    var total=g.length/2,walk=0,seg=g.segments[0],t=.5;for(var i=0;i<g.segments.length;i++){var L=g.segments[i].length||0;if(walk+L>=total){seg=g.segments[i];t=L?(total-walk)/L:.5;break;}walk+=L;}
    var dx=seg.p2[0]-seg.p1[0],dy=seg.p2[1]-seg.p1[1],L=Math.hypot(dx,dy)||1,n=orient<0?[-dy/L,dx/L]:[dy/L,-dx/L],key=Math.abs(n[0])>Math.abs(n[1])?(n[0]>0?'R':'L'):(n[1]>0?'T':'B'),lane=lanes[key]||0;lanes[key]=lane+1;
    /* якорь берётся по отображаемым точкам, иначе подпись отрывается от усиленного края */
    var a=DP(seg.p1),b=DP(seg.p2),ax=a[0]+(b[0]-a[0])*t,ay=a[1]+(b[1]-a[1])*t;
    var ops=shapeEdgeOps(result.definition,g.id).map(shapeOpText);
    /* Smart-Shape уже подписывает длины своими цепочками. Для обычных форм
       оставляем короткую запись без символов единиц и декоративных разделителей. */
    var operationsOnly=!!(layer&&layer.contour&&layer.smart);
    var txt=metricMode?ops.join(' + '):(operationsOnly?ops.join(' + '):([g.id,shapeDrawingDim(g.length)].concat(ops).join(' ')));
    if(!txt)return;
    /* A/B/C/D и обработка всегда стоят СНАРУЖИ контура. Короткая подпись
       поворачивается вдоль ребра и не отнимает место у отверстий и петель. */
    var moveKey='inch:edge:'+g.id,off=Math.max(6,18+lane*14+(operationsOnly?0:shapeAnnUiShift(layoutOpts,moveKey))),x=ax+n[0]*off,y=ay-n[1]*off;
    var ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
    if(ang>90)ang-=180;if(ang<-90)ang+=180;
    var body='<text class="shape-edge-label-outside" data-edge-id="'+shapeXml(g.id)+'" x="'+x+'" y="'+y+'" text-anchor="middle" font-size="9" font-weight="700" fill="#344054" stroke="#fff" stroke-width="4" paint-order="stroke fill" transform="rotate('+ang+' '+x+' '+y+')">'+shapeXml(txt)+'</text>';
    out+=operationsOnly||metricMode?body:shapeAnnUiWrap(layoutOpts,moveKey,body,x,y+27,F);
  });return out;
}
function shapeProductionFeaturesSvg(result,F){
  var fg=result.featureGeometry,out='';
  fg.holes.forEach(function(h,i){var x=F.X(h.center[0]),y=F.Y(h.center[1]),r=Math.max(3,h.diameter/2*F.sc),right=h.center[0]<(F.b.minX+F.b.maxX)/2,lx=x+(right?55:-55),anchor=right?'start':'end';out+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#fff" stroke="#101828" stroke-width="1.5"/><line x1="'+(x+(right?r:-r))+'" y1="'+(y-r)+'" x2="'+lx+'" y2="'+(y-28-i*4)+'" stroke="#667085"/><text x="'+(lx+(right?4:-4))+'" y="'+(y-30-i*4)+'" text-anchor="'+anchor+'" font-size="10" fill="#101828">Ø '+shapeXml(shapeDrawingDim(h.diameter))+' · X '+shapeXml(shapeDrawingDim(h.center[0]))+' · Y '+shapeXml(shapeDrawingDim(h.center[1]))+'</text>';});
  fg.cutouts.forEach(function(c,i){out+='<path d="'+shapeSvgPath(c.points,F.X,F.Y)+'" fill="#fff" stroke="#101828" stroke-width="1.5"/><text x="'+F.X(c.x+c.width/2)+'" y="'+(F.Y(c.y+c.height)-8-i*3)+'" text-anchor="middle" font-size="10" fill="#101828">CUTOUT '+shapeXml(shapeDrawingDim(c.width))+' × '+shapeXml(shapeDrawingDim(c.height))+'</text>';});
  fg.hardware.forEach(function(h,i){if(h.invalid)return;out+='<path d="'+shapeSvgPath(h.points,F.X,F.Y)+'" fill="#fff" stroke="#7f56d9" stroke-width="1.7"/><circle cx="'+F.X(h.center[0])+'" cy="'+F.Y(h.center[1])+'" r="'+Math.max(2,h.holeDia/2*F.sc)+'" fill="#fff" stroke="#7f56d9"/><text x="'+(F.X(h.center[0])+12)+'" y="'+(F.Y(h.center[1])-12-i*3)+'" font-size="10" fill="#6941c6">'+shapeXml(h.name)+' · '+shapeXml(h.edgeId)+'</text>';});
  fg.stamps.forEach(function(s){var x=F.X(s.point[0]),y=F.Y(s.point[1]),w=Math.max(62,Math.min(164,String(s.text||'').length*6+18));out+='<g class="shape-temper-stamp" data-stamp-id="'+shapeXml(s.id)+'"><rect x="'+(x-w/2)+'" y="'+(y-10)+'" width="'+w+'" height="20" rx="2" fill="#fff" stroke="#101828" stroke-width="1.4"/><text x="'+x+'" y="'+(y+3.5)+'" text-anchor="middle" font-size="9" font-weight="700" fill="#101828">'+shapeXml(s.text)+'</text></g>';});
  (fg.sandblasts||[]).forEach(function(s){var x=F.X(s.point[0]),y=F.Y(s.point[1]),spec=shapeSandblastDrawingSpec(s.source,F.W*F.sc);out+='<g class="shape-sandblast-mark" data-sandblast-id="'+shapeXml(s.id)+'"><rect x="'+(x-spec.w/2)+'" y="'+(y-spec.h/2)+'" width="'+spec.w+'" height="'+spec.h+'" rx="2" fill="#fff" stroke="#087e8b" stroke-width="1.4" stroke-dasharray="5 3"/><text x="'+x+'" y="'+(y-2)+'" text-anchor="middle" font-size="'+spec.font+'" font-weight="700" fill="#075e68"><tspan x="'+x+'">'+shapeXml(spec.lines[0])+'</tspan><tspan x="'+x+'" dy="'+(spec.font+2)+'">'+shapeXml(spec.lines[1])+'</tspan></text></g>';});return out;
}
function shapeSandblastDrawingSpec(f,glassPixelWidth){
  var line2=(shapeSandblastCoverage(f)==='pattern'?'PATTERN':'FULL COVERED')+' · '+(shapeSandblastSide(f)==='back'?'BACK':'FRONT'),available=Math.max(44,(+glassPixelWidth||0)*.72);
  var desired=Math.max(72,line2.length*5.4+16),w=Math.max(44,Math.min(190,available,desired)),font=Math.max(6,Math.min(9,(w-12)/Math.max(8,line2.length*.62)));
  return {lines:['SANDBLAST',line2],w:Math.round(w*10)/10,h:Math.round((font*2+10)*10)/10,font:Math.round(font*10)/10};
}
function shapeTitleBlock(result,kind,F){
  var d=result.definition,p=shapePresetInfo(d.type),rx=(F&&F.vw?F.vw:960)-24;
  return '<g font-family="Arial,sans-serif"><text x="24" y="28" font-size="19" font-weight="700" fill="#101828">'+shapeXml(kind)+'</text><text x="24" y="50" font-size="12" fill="#475467">'+shapeXml(d.name||'(unnamed)')+' · '+shapeXml(p.code+' / '+p.label)+'</text><text x="'+rx+'" y="28" text-anchor="end" font-size="11" fill="#475467">Shape '+shapeXml(d.id)+' · Rev '+shapeXml(d.revision||0)+'</text><text x="'+rx+'" y="48" text-anchor="end" font-size="11" fill="#475467">Area '+(result.area/144).toFixed(2)+' ft²</text></g>';
}
/* Производственный чертёж. Контур берётся из слоя аннотаций: скошенные края
   показываются с усиленным уклоном, чтобы читались в цеху, но ВСЕ подписанные
   размеры остаются истинными. Раскрой (shapeCuttingSvg) усиления не использует. */
function shapeProductionDrawingFrame(result,opts){
  opts=opts||{};
  var metric=opts.metric?shapeMetricAnnotations(result,opts.metric):null;
  var framePoints=(result.points||[]).slice();
  if(metric)metric.vertices.forEach(function(v){framePoints.push(v.point);});
  var pT=shapeAnnNeedsOverhead(result)?210:150,pB=170,pL=170,pR=190;
  var pb=fabEdgeBounds(framePoints),pw=Math.max(.001,pb.maxX-pb.minX),ph=Math.max(.001,pb.maxY-pb.minY),ar=pw/ph;
  var LONG=660,SHORT=260;
  var aw=ar>=1?LONG:Math.max(SHORT,LONG*ar),ah=ar>=1?Math.max(SHORT,LONG/ar):LONG;
  var F=shapeDrawingFrame(framePoints,{vw:Math.round(aw+pL+pR),vh:Math.round(ah+pT+pB),pL:pL,pR:pR,pT:pT,pB:pB});
  F.metric=metric;return F;
}
function shapeProductionSvg(result,opts){
  if(!result||!result.valid)return '<svg viewBox="0 0 960 780"><text x="480" y="390" text-anchor="middle" fill="#b42318">Invalid Shape</text></svg>';
  opts=opts||{};
  /* Вид сверху получает отдельное верхнее поле; выбранный лайт тоже входит в
     рамку, чтобы его метрический контур не обрезался собственной формой. */
  var F=shapeProductionDrawingFrame(result,opts);
  var L=shapeAnnotationLayer(result,F,null,opts.annotation);
  var o='<rect width="'+F.vw+'" height="'+F.vh+'" fill="#fff"/>'+shapeAnnotationDefs()+shapeTitleBlock(result,'PRODUCTION DRAWING',F);
  if(result.definition.type!=='rectangle')o+='<rect x="'+F.X(0)+'" y="'+F.Y(inch(result.definition.h))+'" width="'+(inch(result.definition.w)*F.sc)+'" height="'+(inch(result.definition.h)*F.sc)+'" fill="none" stroke="#d0d5dd" stroke-dasharray="7 6"/>';
  /* Белое поле и цветные рёбра — производственная договорённость чертежа:
     цвет опознаёт ребро, поэтому подписи несут только обработку. */
  o+=L.contour?('<path d="'+L.path+'" fill="#fff" stroke="none"/>'+L.contour)
             :('<path d="'+L.path+'" fill="#f9fafb" stroke="#101828" stroke-width="2"/>');
  /* Метрический режим — отдельный чистый лист, а не два чертежа друг поверх
     друга. Дюймовые цепочки скрываем; отверстия и прочие производственные
     обозначения ниже остаются в исходных единицах согласно спецификации. */
  if(!F.metric)o+=L.annotations;
  if(F.metric)o+=shapeMetricLayerSvg(result,F,L,F.metric,opts.metric)+shapeGlassHatchSvg(L);
  /* Габаритная пара нужна только там, где нет цепочек по сторонам. У Smart-Shape
     каждая сторона уже расписана по участкам, и общий размер вставал вторым
     числом рядом с той же цепочкой: снизу читалось «48» и тут же «48″», слева
     «1/4 + 36» и тут же «36 1/4″». Эталон общий габарит на чертеже не рисует
     вовсе — он читается из карточек Finished и Cut size под чертежом. */
  if(!L.smart&&!F.metric){
    var annOpts=opts.annotation||{},wKey='inch:overall:width',hKey='inch:overall:height';
    var wy=L.box.bottom+118+shapeAnnUiShift(annOpts,wKey),hx=L.box.left-128-shapeAnnUiShift(annOpts,hKey);
    o+=shapeAnnUiWrap(annOpts,wKey,shapeDimH(L.box.left,L.box.right,wy,shapeDrawingDim(F.W)),(L.box.left+L.box.right)/2,wy+28,F);
    o+=shapeAnnUiWrap(annOpts,hKey,shapeDimV(hx,L.box.top,L.box.bottom,shapeDrawingDim(F.H)),hx-58,(L.box.top+L.box.bottom)/2,F);
  }
  /* Feature callouts go down first; edgework labels remain the top layer and
     can never be hidden by a centered Sandblast note. */
  o+=shapeProductionFeaturesSvg(result,F)+shapeEdgeLabelsSvg(result,F,L,!!F.metric,opts.annotation);
  o+='<text x="24" y="'+(F.vh-16)+'" font-size="10" fill="#667085">'+(F.metric?'Finished contour in millimetres · feature callouts remain in inches':'Finished geometry · dimensions in inches · skew shown exaggerated for readability, printed dimensions are true')+'</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+F.vw+' '+F.vh+'" aria-label="Production Drawing">'+o+'</svg>';
}
/* ---------- Safety Border overlay ----------
   Рисуется ВДОЛЬ той кромки, которая его получила: видно, от какой стороны и
   на сколько отступает раскрой. Общая рамка вокруг детали этого не показывала.
   Сегменты одной кромки сшиваются в одну ломаную — у круга контур
   тесселирован сотнями отрезков, и рисовать их по отдельности незачем. */
function shapeBorderZone(c){
  var brd=c&&c.safetyBorder,fp=c&&c.footprint;
  if(!brd||!brd.applies||!fp||!fp.pad)return null;
  var b=fabEdgeBounds(c.points||[]),p=fp.pad;
  return {b:b,pad:p,x0:b.minX-(p.left||0),x1:b.maxX+(p.right||0),y0:b.minY-(p.bottom||0),y1:b.maxY+(p.top||0)};
}
function shapeBorderFramePoints(c){
  var z=shapeBorderZone(c);
  return z?[[z.x0,z.y0],[z.x1,z.y0],[z.x1,z.y1],[z.x0,z.y1]]:[];
}
function shapeBorderOverlaySvg(c,X,Y){
  var z=shapeBorderZone(c);if(!z)return '';
  var col='#f79009',o='',cx=(z.b.minX+z.b.maxX)/2,cy=(z.b.minY+z.b.maxY)/2;
  var seg=function(x1,y1,x2,y2){return '<line x1="'+x1.toFixed(2)+'" y1="'+y1.toFixed(2)+'" x2="'+x2.toFixed(2)+'" y2="'+y2.toFixed(2)+'" stroke="'+col+'" stroke-width="1"/>';};
  var txt=function(x,y,s2,a){return '<text x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" text-anchor="'+a+'" font-size="10" font-weight="700" fill="'+col+'">'+shapeXml(s2)+'</text>';};
  o+='<rect x="'+X(z.x0).toFixed(2)+'" y="'+Y(z.y1).toFixed(2)+'" width="'+(X(z.x1)-X(z.x0)).toFixed(2)+'" height="'+(Y(z.y0)-Y(z.y1)).toFixed(2)+'" fill="none" stroke="'+col+'" stroke-width="1.4" stroke-dasharray="8 5"/>';
  if(z.pad.left>0)o+=seg(X(z.x0),Y(cy),X(z.b.minX),Y(cy))+txt((X(z.x0)+X(z.b.minX))/2,Y(cy)-5,shapeDrawingDim(z.pad.left),'middle');
  if(z.pad.right>0)o+=seg(X(z.b.maxX),Y(cy),X(z.x1),Y(cy))+txt((X(z.b.maxX)+X(z.x1))/2,Y(cy)-5,shapeDrawingDim(z.pad.right),'middle');
  if(z.pad.top>0)o+=seg(X(cx),Y(z.b.maxY),X(cx),Y(z.y1))+txt(X(cx)+5,(Y(z.b.maxY)+Y(z.y1))/2+3,shapeDrawingDim(z.pad.top),'start');
  if(z.pad.bottom>0)o+=seg(X(cx),Y(z.b.minY),X(cx),Y(z.y0))+txt(X(cx)+5,(Y(z.b.minY)+Y(z.y0))/2+3,shapeDrawingDim(z.pad.bottom),'start');
  return o+txt(X(z.x1),Y(z.y1)-6,'SAFETY BORDER','end');
}
function shapeCuttingSvg(result){
  if(!result||!result.valid||!result.cutting.valid)return '<svg viewBox="0 0 960 700"><text x="480" y="350" text-anchor="middle" fill="#b42318">'+shapeXml(result&&result.cutting&&result.cutting.error||'Invalid Cutting Geometry')+'</text></svg>';
  var c=result.cutting,cb=fabEdgeBounds(c.points),cw=Math.max(.001,cb.maxX-cb.minX),ch=Math.max(.001,cb.maxY-cb.minY),car=cw/ch;
  var cL=620,cS=250,caw=car>=1?cL:Math.max(cS,cL*car),cah=car>=1?Math.max(cS,cL/car):cL;
  var F=shapeDrawingFrame(c.points.concat(shapeBorderFramePoints(c)),{vw:Math.round(caw+330),vh:Math.round(cah+220),pL:150,pR:180,pT:95,pB:125});
  var o='<rect width="'+F.vw+'" height="'+F.vh+'" fill="#fff"/>'+shapeTitleBlock(result,'CUTTING SHAPE',F);
  o+='<path d="'+shapeSvgPath(c.finishedPoints,F.X,F.Y)+'" fill="none" stroke="#98a2b3" stroke-width="1" stroke-dasharray="7 6"/><path d="'+shapeSvgPath(c.points,F.X,F.Y)+'" fill="none" stroke="#101828" stroke-width="2.2"/>';
  c.holes.forEach(function(h){o+='<circle cx="'+F.X(h.center[0])+'" cy="'+F.Y(h.center[1])+'" r="'+Math.max(2,h.diameter/2*F.sc)+'" fill="none" stroke="#101828" stroke-width="1.5"/>';});
  c.cutouts.forEach(function(x){o+='<path d="'+shapeSvgPath(x.points,F.X,F.Y)+'" fill="none" stroke="#101828" stroke-width="1.5"/>';});
  c.hardware.forEach(function(h){o+='<path d="'+shapeSvgPath(h.points,F.X,F.Y)+'" fill="none" stroke="#101828" stroke-width="1.5"/><circle cx="'+F.X(h.hole.center[0])+'" cy="'+F.Y(h.hole.center[1])+'" r="'+Math.max(2,h.hole.diameter/2*F.sc)+'" fill="none" stroke="#101828"/>';});
  /* Safety Border — оранжевый пунктир: зона, в которую раскрой не имеет права
     положить соседнюю деталь или подвести край листа. Сам контур реза внутри
     неё не меняется. */
  o+=shapeBorderOverlaySvg(c,F.X,F.Y);
  o+=shapeDimH(F.x0,F.x0+F.dw,F.y0+F.dh+58,shapeDrawingDim(c.width));o+=shapeDimV(F.x0-62,F.y0,F.y0+F.dh,shapeDrawingDim(c.height));
  o+='<g font-size="10" fill="#667085"><text x="24" y="'+(F.vh-50)+'">Solid = cutting contour · dashed = finished contour · orange = safety border (nesting clearance, never cut)</text><text x="24" y="'+(F.vh-32)+'">Generic geometry tolerance '+shapeXml(c.toleranceIn.toFixed(4))+' in · verify machine-specific postprocessor before production</text></g>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+F.vw+' '+F.vh+'" aria-label="Cutting Shape">'+o+'</svg>';
}
