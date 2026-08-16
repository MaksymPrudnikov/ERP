/* =====================================================================
   muntin/adaptive  ·  v4.5-port
   Shape-adaptive production geometry: раскладка + обрезка контуром.
   IN : модель мунтина M, линия Shape S
   OUT: сегменты баров с cut length
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function productionGeometryForLine(M,S){
  var fallback=productionGeometry(M,inch(S.w),inch(S.h));
  fallback.minX=0;fallback.maxX=fallback.W;fallback.minY=0;fallback.maxY=fallback.H;fallback.spanW=fallback.W;fallback.spanH=fallback.H;fallback.shapeType='rectangle';fallback.shapeAdaptive=false;
  fallback.outline=[[0,0],[fallback.W,0],[fallback.W,fallback.H],[0,fallback.H]];
  fallback.verticalSegments=fallback.v.map(function(pos,bar){return {bar:bar,segment:0,segments:1,pos:pos,x:pos,y1:fallback.iy+fallback.ec,y2:fallback.H-fallback.iy-fallback.ec,cut:fallback.verticalCut};});
  fallback.horizontalSegments=fallback.h.map(function(pos,bar){return {bar:bar,segment:0,segments:1,pos:pos,y:pos,x1:fallback.ix+fallback.ec,x2:fallback.W-fallback.ix-fallback.ec,cut:fallback.horizontalCut};});
  fallback.missedVertical=[];fallback.missedHorizontal=[];fallback.edgeMode='axis';fallback.edgeModeForced=false;fallback.offsetInset=0;
  if(typeof shapeGeometry!=='function'||typeof fabOutlinePoints!=='function')return fallback;
  var G;try{G=shapeGeometry(S);}catch(e){return fallback;}if(!G||!G.ok)return fallback;
  var outline;try{outline=fabOutlinePoints(S,G);}catch(e2){outline=(G.pts||[]).slice();}
  if(!outline||outline.length<3)return fallback;
  var xs=outline.map(function(p){return p[0];}),ys=outline.map(function(p){return p[1];});
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys),spanW=Math.max(.001,maxX-minX),spanH=Math.max(.001,maxY-minY);
  var base=productionGeometry(M,spanW,spanH);
  base.minX=minX;base.maxX=maxX;base.minY=minY;base.maxY=maxY;base.spanW=spanW;base.spanH=spanH;base.outline=outline;base.shapeType=G.type||'shape';
  base.shapeAdaptive=!muntinIsRectOutline(outline,minX,maxX,minY,maxY);
  base.verticalSegments=[];base.horizontalSegments=[];base.missedVertical=[];base.missedHorizontal=[];
  var Pset=normalizeMuntinModel(M).production,isoInset=Math.abs(base.ix-base.iy)<1e-9,useOffset=(Pset.edgeMode!=='axis')&&isoInset,dOff=base.ix,ec=base.ec;
  base.edgeMode=useOffset?'offset':'axis';base.edgeModeForced=(Pset.edgeMode!=='axis')&&!isoInset;base.offsetInset=useOffset?dOff:0;
  base.v.forEach(function(rel,bi){
    var x=minX+rel,ints=muntinScanIntervals(outline,'v',x),made=0,si=0,holes=useOffset?muntinOffsetHoles(outline,'v',x,dOff):null;
    ints.forEach(function(iv){var spans=useOffset?muntinIntervalSubtract(iv,holes):[[iv[0]+base.iy,iv[1]-base.iy]];spans.forEach(function(sp){var a=sp[0]+ec,b=sp[1]-ec;if(b>a+1e-6){base.verticalSegments.push({bar:bi,segment:si++,pos:rel,x:x,y1:a,y2:b,cut:b-a});made++;}});});
    if(!made)base.missedVertical.push(bi);
  });
  base.h.forEach(function(rel,bi){
    var y=minY+rel,ints=muntinScanIntervals(outline,'h',y),made=0,si=0,holes=useOffset?muntinOffsetHoles(outline,'h',y,dOff):null;
    ints.forEach(function(iv){var spans=useOffset?muntinIntervalSubtract(iv,holes):[[iv[0]+base.ix,iv[1]-base.ix]];spans.forEach(function(sp){var a=sp[0]+ec,b=sp[1]-ec;if(b>a+1e-6){base.horizontalSegments.push({bar:bi,segment:si++,pos:rel,y:y,x1:a,x2:b,cut:b-a});made++;}});});
    if(!made)base.missedHorizontal.push(bi);
  });
  var vN={},hN={};
  base.verticalSegments.forEach(function(s){vN[s.bar]=(vN[s.bar]||0)+1;});base.horizontalSegments.forEach(function(s){hN[s.bar]=(hN[s.bar]||0)+1;});
  base.verticalSegments.forEach(function(s){s.segments=vN[s.bar];});base.horizontalSegments.forEach(function(s){s.segments=hN[s.bar];});
  var vc=base.verticalSegments.map(function(x){return x.cut;}),hc=base.horizontalSegments.map(function(x){return x.cut;});
  base.verticalCut=vc.length?Math.max.apply(null,vc):0;base.horizontalCut=hc.length?Math.max.apply(null,hc):0;
  base.variableVertical=vc.length>1&&(Math.max.apply(null,vc)-Math.min.apply(null,vc)>.01);base.variableHorizontal=hc.length>1&&(Math.max.apply(null,hc)-Math.min.apply(null,hc)>.01);
  return base;
}
