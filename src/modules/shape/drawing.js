/* =====================================================================
   shape/drawing · schema-v2
   Production Drawing и Cutting Shape из одного Component/Shape revision.
   ===================================================================== */

function shapeXml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function shapeSvgPath(P,X,Y){return (P||[]).map(function(p,i){return (i?'L ':'M ')+X(p[0])+' '+Y(p[1]);}).join(' ')+' Z';}
/* Поля кадра задаёт вызывающий: производственному чертежу нужен запас под
   цепочки размеров и вид сверху, раскройному — нет. */
function shapeDrawingFrame(points,opts){
  opts=opts||{};
  var b=fabEdgeBounds(points),W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),
      vw=opts.vw||960,vh=opts.vh||700,pL=opts.pL||150,pR=opts.pR||180,pT=opts.pT||95,pB=opts.pB||125,
      sc=Math.min((vw-pL-pR)/W,(vh-pT-pB)/H),dw=W*sc,dh=H*sc,x0=pL+(vw-pL-pR-dw)/2,y0=pT+(vh-pT-pB-dh)/2;
  return {vw:vw,vh:vh,b:b,W:W,H:H,sc:sc,x0:x0,y0:y0,X:function(x){return x0+(x-b.minX)*sc;},Y:function(y){return y0+dh-(y-b.minY)*sc;},dw:dw,dh:dh,margin:opts.margin||42};
}
function shapeDimH(x1,x2,y,label,color){color=color||'#344054';return '<line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="'+color+'"/><path d="M '+x1+' '+y+' l 7 -4 v 8 z M '+x2+' '+y+' l -7 -4 v 8 z" fill="'+color+'"/><text x="'+((x1+x2)/2)+'" y="'+(y-8)+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+color+'">'+shapeXml(label)+'</text>';}
function shapeDimV(x,y1,y2,label,color){color=color||'#344054';var cy=(y1+y2)/2;return '<line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="'+color+'"/><path d="M '+x+' '+y1+' l -4 7 h 8 z M '+x+' '+y2+' l -4 -7 h 8 z" fill="'+color+'"/><text x="'+(x-10)+'" y="'+cy+'" text-anchor="middle" font-size="13" font-weight="700" fill="'+color+'" transform="rotate(-90 '+(x-10)+' '+cy+')">'+shapeXml(label)+'</text>';}
function shapeEdgeGroups(geo){
  var g={},order=[];(geo.edges||[]).forEach(function(e){if(!g[e.id]){g[e.id]={id:e.id,length:0,segments:[]};order.push(e.id);}g[e.id].length+=e.length||0;g[e.id].segments.push(e);});return order.map(function(id){return g[id];});
}
/* Короткая цеховая запись обработки: 45° Back Mitre · FP · Bevel 1″ (Front). */
function shapeOpText(o){
  if(o.type==='Mitering')return (o.angle||45)+'° '+((o.side||'back')==='front'?'Front':'Back')+' Mitre';
  if(o.type==='Beveling')return 'Bevel '+dimIn(inch(o.width||'1'))+' ('+((o.side||'front')==='back'?'Back':'Front')+')';
  if(o.type==='Flat Polish')return 'FP';
  if(o.type==='Rough Arris')return 'RA';
  if(o.type==='CNC Shape Polish')return 'CNC';
  return o.type;
}
function shapeEdgeLabelsSvg(result,F,layer){
  var orient=fabSignedArea(result.points),lanes={},out='',DP=(layer&&layer.DP)||function(p){return [F.X(p[0]),F.Y(p[1])];},cen=null;
  if(layer&&layer.points&&layer.points.length){
    var cx=0,cy=0;layer.points.forEach(function(p){cx+=p[0]/layer.points.length;cy+=p[1]/layer.points.length;});cen=[cx,cy];
  }
  shapeEdgeGroups(result.geometry).forEach(function(g){
    var total=g.length/2,walk=0,seg=g.segments[0],t=.5;for(var i=0;i<g.segments.length;i++){var L=g.segments[i].length||0;if(walk+L>=total){seg=g.segments[i];t=L?(total-walk)/L:.5;break;}walk+=L;}
    var dx=seg.p2[0]-seg.p1[0],dy=seg.p2[1]-seg.p1[1],L=Math.hypot(dx,dy)||1,n=orient<0?[-dy/L,dx/L]:[dy/L,-dx/L],key=Math.abs(n[0])>Math.abs(n[1])?(n[0]>0?'R':'L'):(n[1]>0?'T':'B'),lane=lanes[key]||0;lanes[key]=lane+1;
    /* якорь берётся по отображаемым точкам, иначе подпись отрывается от усиленного края */
    var a=DP(seg.p1),b=DP(seg.p2),ax=a[0]+(b[0]-a[0])*t,ay=a[1]+(b[1]-a[1])*t;
    var ops=shapeEdgeOps(result.definition,g.id).map(shapeOpText);
    /* Когда работают цепочки размеров и цветной контур, подпись несёт ТОЛЬКО
       обработку — длина уже стоит в цепочке, а ребро опознаётся цветом. */
    var txt=(layer&&layer.contour&&layer.smart)?ops.join(' + '):(g.id+' · '+dimIn(g.length)+(ops.length?' · '+ops.join(' + '):''));
    if(!txt)return;
    if(cen){
      /* На производственном чертеже внешняя полоса занята цепочками размеров,
         поэтому подпись ребра уходит ВНУТРЬ стекла и поворачивается вдоль ребра. */
      var vx=cen[0]-ax,vy=cen[1]-ay,vl=Math.hypot(vx,vy)||1,off2=28+lane*14;
      var ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
      if(ang>90)ang-=180;if(ang<-90)ang+=180;
      if(Math.abs(ang)>65)ang=-90;else if(Math.abs(ang)<12)ang=0;
      var tx2=ax+vx/vl*off2,ty2=ay+vy/vl*off2;
      out+='<text x="'+tx2+'" y="'+ty2+'" text-anchor="middle" font-size="10" font-weight="700" fill="#344054" stroke="#fff" stroke-width="4" paint-order="stroke fill" transform="rotate('+ang+' '+tx2+' '+ty2+')">'+shapeXml(txt)+'</text>';
      return;
    }
    var off=23+lane*16,x=ax+n[0]*off,y=ay-n[1]*off;
    out+='<line x1="'+ax+'" y1="'+ay+'" x2="'+x+'" y2="'+y+'" stroke="#98a2b3"/><text x="'+(x+n[0]*5)+'" y="'+(y-n[1]*5)+'" text-anchor="'+(key==='L'?'end':key==='R'?'start':'middle')+'" font-size="10" font-weight="700" fill="#344054" stroke="#fff" stroke-width="4" paint-order="stroke fill">'+shapeXml(txt)+'</text>';
  });return out;
}
function shapeProductionFeaturesSvg(result,F){
  var fg=result.featureGeometry,out='';
  fg.holes.forEach(function(h,i){var x=F.X(h.center[0]),y=F.Y(h.center[1]),r=Math.max(3,h.diameter/2*F.sc),right=h.center[0]<(F.b.minX+F.b.maxX)/2,lx=x+(right?55:-55),anchor=right?'start':'end';out+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#fff" stroke="#101828" stroke-width="1.5"/><line x1="'+(x+(right?r:-r))+'" y1="'+(y-r)+'" x2="'+lx+'" y2="'+(y-28-i*4)+'" stroke="#667085"/><text x="'+(lx+(right?4:-4))+'" y="'+(y-30-i*4)+'" text-anchor="'+anchor+'" font-size="10" fill="#101828">Ø '+shapeXml(dimIn(h.diameter))+' · X '+shapeXml(dimIn(h.center[0]))+' · Y '+shapeXml(dimIn(h.center[1]))+'</text>';});
  fg.cutouts.forEach(function(c,i){out+='<path d="'+shapeSvgPath(c.points,F.X,F.Y)+'" fill="#fff" stroke="#101828" stroke-width="1.5"/><text x="'+F.X(c.x+c.width/2)+'" y="'+(F.Y(c.y+c.height)-8-i*3)+'" text-anchor="middle" font-size="10" fill="#101828">CUTOUT '+shapeXml(dimIn(c.width))+' × '+shapeXml(dimIn(c.height))+'</text>';});
  fg.hardware.forEach(function(h,i){if(h.invalid)return;out+='<path d="'+shapeSvgPath(h.points,F.X,F.Y)+'" fill="#fff" stroke="#7f56d9" stroke-width="1.7"/><circle cx="'+F.X(h.center[0])+'" cy="'+F.Y(h.center[1])+'" r="'+Math.max(2,h.holeDia/2*F.sc)+'" fill="#fff" stroke="#7f56d9"/><text x="'+(F.X(h.center[0])+12)+'" y="'+(F.Y(h.center[1])-12-i*3)+'" font-size="10" fill="#6941c6">'+shapeXml(h.name)+' · '+shapeXml(h.edgeId)+'</text>';});
  fg.stamps.forEach(function(s){var x=F.X(s.point[0]),y=F.Y(s.point[1]);out+='<rect x="'+(x-24)+'" y="'+(y-9)+'" width="48" height="18" fill="none" stroke="#101828"/><text x="'+x+'" y="'+(y+3)+'" text-anchor="middle" font-size="8" fill="#101828">'+shapeXml(s.text)+'</text>';});return out;
}
function shapeTitleBlock(result,kind,F){
  var d=result.definition,p=shapePresetInfo(d.type),rx=(F&&F.vw?F.vw:960)-24;
  return '<g font-family="Arial,sans-serif"><text x="24" y="28" font-size="19" font-weight="700" fill="#101828">'+shapeXml(kind)+'</text><text x="24" y="50" font-size="12" fill="#475467">'+shapeXml(d.name||'(unnamed)')+' · '+shapeXml(p.code+' / '+p.label)+'</text><text x="'+rx+'" y="28" text-anchor="end" font-size="11" fill="#475467">Shape '+shapeXml(d.id)+' · Rev '+shapeXml(d.revision||0)+'</text><text x="'+rx+'" y="48" text-anchor="end" font-size="11" fill="#475467">Area '+(result.area/144).toFixed(2)+' ft²</text></g>';
}
/* Производственный чертёж. Контур берётся из слоя аннотаций: скошенные края
   показываются с усиленным уклоном, чтобы читались в цеху, но ВСЕ подписанные
   размеры остаются истинными. Раскрой (shapeCuttingSvg) усиления не использует. */
function shapeProductionSvg(result){
  if(!result||!result.valid)return '<svg viewBox="0 0 960 780"><text x="480" y="390" text-anchor="middle" fill="#b42318">Invalid Shape</text></svg>';
  /* Вид сверху занимает верхнюю полосу — под него заранее увеличиваем поле,
     иначе он налезет на верхнюю цепочку размеров. */
  var pT=shapeAnnNeedsOverhead(result)?210:150,pB=170,pL=170,pR=190;
  /* Лист подгоняется под пропорцию детали. Фиксированный широкий лист на
     высокой узкой детали оставлял половину площади пустой, и чертёж на экране
     выходил мелким: масштаб задавала пустота, а не стекло. */
  var pb=fabEdgeBounds(result.points),pw=Math.max(.001,pb.maxX-pb.minX),ph=Math.max(.001,pb.maxY-pb.minY),ar=pw/ph;
  var LONG=660,SHORT=260;
  var aw=ar>=1?LONG:Math.max(SHORT,LONG*ar),ah=ar>=1?Math.max(SHORT,LONG/ar):LONG;
  var F=shapeDrawingFrame(result.points,{vw:Math.round(aw+pL+pR),vh:Math.round(ah+pT+pB),pL:pL,pR:pR,pT:pT,pB:pB});
  var L=shapeAnnotationLayer(result,F);
  var o='<rect width="'+F.vw+'" height="'+F.vh+'" fill="#fff"/>'+shapeAnnotationDefs()+shapeTitleBlock(result,'PRODUCTION DRAWING',F);
  if(result.definition.type!=='rectangle')o+='<rect x="'+F.X(0)+'" y="'+F.Y(inch(result.definition.h))+'" width="'+(inch(result.definition.w)*F.sc)+'" height="'+(inch(result.definition.h)*F.sc)+'" fill="none" stroke="#d0d5dd" stroke-dasharray="7 6"/>';
  /* Белое поле и цветные рёбра — производственная договорённость чертежа:
     цвет опознаёт ребро, поэтому подписи несут только обработку. */
  o+=L.contour?('<path d="'+L.path+'" fill="#fff" stroke="none"/>'+L.contour)
             :('<path d="'+L.path+'" fill="#f9fafb" stroke="#101828" stroke-width="2"/>');
  o+=L.annotations;
  /* Габаритная пара нужна только там, где нет цепочек по сторонам. У Smart-Shape
     каждая сторона уже расписана по участкам, и общий размер вставал вторым
     числом рядом с той же цепочкой: снизу читалось «48» и тут же «48″», слева
     «1/4 + 36» и тут же «36 1/4″». Эталон общий габарит на чертеже не рисует
     вовсе — он читается из карточек Finished и Cut size под чертежом. */
  if(!L.smart){
    o+=shapeDimH(L.box.left,L.box.right,L.box.bottom+118,dimIn(F.W));
    o+=shapeDimV(L.box.left-128,L.box.top,L.box.bottom,dimIn(F.H));
  }
  o+=shapeEdgeLabelsSvg(result,F,L)+shapeProductionFeaturesSvg(result,F);
  o+='<text x="24" y="'+(F.vh-16)+'" font-size="10" fill="#667085">Finished geometry · dimensions in inches · skew shown exaggerated for readability, printed dimensions are true</text>';
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
  if(z.pad.left>0)o+=seg(X(z.x0),Y(cy),X(z.b.minX),Y(cy))+txt((X(z.x0)+X(z.b.minX))/2,Y(cy)-5,dimIn(z.pad.left),'middle');
  if(z.pad.right>0)o+=seg(X(z.b.maxX),Y(cy),X(z.x1),Y(cy))+txt((X(z.b.maxX)+X(z.x1))/2,Y(cy)-5,dimIn(z.pad.right),'middle');
  if(z.pad.top>0)o+=seg(X(cx),Y(z.b.maxY),X(cx),Y(z.y1))+txt(X(cx)+5,(Y(z.b.maxY)+Y(z.y1))/2+3,dimIn(z.pad.top),'start');
  if(z.pad.bottom>0)o+=seg(X(cx),Y(z.b.minY),X(cx),Y(z.y0))+txt(X(cx)+5,(Y(z.b.minY)+Y(z.y0))/2+3,dimIn(z.pad.bottom),'start');
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
  o+=shapeDimH(F.x0,F.x0+F.dw,F.y0+F.dh+58,dimIn(c.width));o+=shapeDimV(F.x0-62,F.y0,F.y0+F.dh,dimIn(c.height));
  o+='<g font-size="10" fill="#667085"><text x="24" y="'+(F.vh-50)+'">Solid = cutting contour · dashed = finished contour · orange = safety border (nesting clearance, never cut)</text><text x="24" y="'+(F.vh-32)+'">Generic geometry tolerance '+shapeXml(c.toleranceIn.toFixed(4)+'\u2033')+' · verify machine-specific postprocessor before production</text></g>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+F.vw+' '+F.vh+'" aria-label="Cutting Shape">'+o+'</svg>';
}
