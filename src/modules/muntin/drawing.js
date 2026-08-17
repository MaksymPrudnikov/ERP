/* =====================================================================
   muntin/drawing  ·  v4.5-port + configurator dimensions
   Визуализация мунтина в конфигураторе (SVG).
   Для прямоугольника сохраняет согласованную схему размеров.
   Для Shape показывает: реальный Edge Inset, чистые просветы и
   накопительные установочные размеры без V1/V2/V3 и H1/H2/H3.
   IN : {geo, M}
   OUT: строка SVG
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */
function mpSvg(x){
  var g=x.geo,M=x.M,P=muntinProduct(M.productId),C=muntinColors(M),minX=g.minX==null?0:g.minX,maxX=g.maxX==null?g.W:g.maxX,minY=g.minY==null?0:g.minY,maxY=g.maxY==null?g.H:g.maxY,W=Math.max(.001,maxX-minX),H=Math.max(.001,maxY-minY);
  var COL={outline:'#282725',overall:'#373532',setout:'#4f4f4f',setoutExt:'#9a9a9a',inset:'#b36b00',dlo:'#0057b8',dloLabel:'#0057b8'};
  var isShape=!!g.shapeAdaptive,vCount=(g.v||[]).length,hCount=(g.h||[]).length;

  /* Rectangle оставляем в согласованной компоновке.
     Для Shape убираем верхнюю лесенку: вертикальные setout-размеры идут вниз.
     Правые поля растут только под горизонтальные setout-размеры. */
  var extraTop=isShape?0:Math.max(0,vCount-2)*22;
  var extraBottom=isShape?Math.max(0,vCount)*22:0;
  var extraRight=Math.max(0,hCount-2)*44;
  if(isShape)extraRight=Math.max(0,hCount-1)*44;
  var vw=760+extraRight,vh=520+extraTop+extraBottom;
  var pL=104,pR=54+extraRight,pT=isShape?42:68+extraTop,pB=84+extraBottom;
  var aw=vw-pL-pR,ah=vh-pT-pB,sc=Math.min(aw/W,ah/H),dw=W*sc,dh=H*sc,x0=pL+(aw-dw)/2,y0=pT+(ah-dh)/2;

  function X(v){return x0+(v-minX)*sc}
  function Y(v){return y0+dh-(v-minY)*sc}
  function tx(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
  function dimText(txt,xp,yp,size,anchor,fill,rotate){size=size||12;anchor=anchor||'middle';fill=fill||COL.setout;var tr=rotate?' transform="rotate('+rotate+' '+xp+' '+yp+')"':'';return '<text x="'+xp+'" y="'+yp+'" text-anchor="'+anchor+'" dominant-baseline="middle" font-size="'+size+'" fill="'+fill+'" stroke="#fff" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"'+tr+'>'+tx(txt)+'</text>'; }
  function shapeText(txt,xp,yp,size,anchor,fill,rotate){size=size||11;anchor=anchor||'middle';fill=fill||COL.setout;var tr=rotate?' transform="rotate('+rotate+' '+xp+' '+yp+')"':'';return '<text x="'+xp+'" y="'+yp+'" text-anchor="'+anchor+'" dominant-baseline="middle" font-size="'+size+'" font-weight="600" fill="'+fill+'"'+tr+'>'+tx(txt)+'</text>'; }
  function fitText(txt,xp,yp,span,size,fill,rotate){var s=size||11,need=String(txt).length*s*.57,max=Math.max(1,Math.abs(span)-8);if(need>max)s=Math.max(7,s*max/need);return shapeText(txt,xp,yp,s,'middle',fill,rotate);}
  function ln(x1,y1,x2,y2,stroke,markers,width,opacity){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+(stroke||COL.setout)+'" stroke-width="'+(width||1)+'"'+(opacity==null?'':' opacity="'+opacity+'"')+(markers?' marker-start="url(#arr)" marker-end="url(#arr)"':'')+'/>';}
  function exactHDim(x1,x2,y,stroke){var a=Math.min(5,Math.max(2,Math.abs(x2-x1)/4)),b=3;return ln(x1,y,x2,y,stroke,false,1.15)+'<path d="M '+(x1+a)+' '+(y-b)+' L '+x1+' '+y+' L '+(x1+a)+' '+(y+b)+' M '+(x2-a)+' '+(y-b)+' L '+x2+' '+y+' L '+(x2-a)+' '+(y+b)+'" fill="none" stroke="'+stroke+'" stroke-width="1.15"/>';}
  function exactVDim(xp,y1,y2,stroke){var a=Math.min(5,Math.max(2,Math.abs(y2-y1)/4)),b=3;return ln(xp,y1,xp,y2,stroke,false,1.15)+'<path d="M '+(xp-b)+' '+(y1+a)+' L '+xp+' '+y1+' L '+(xp+b)+' '+(y1+a)+' M '+(xp-b)+' '+(y2-a)+' L '+xp+' '+y2+' L '+(xp+b)+' '+(y2-a)+'" fill="none" stroke="'+stroke+'" stroke-width="1.15"/>';}
  function signedArea(Pts){var a=0;for(var i=0;i<Pts.length;i++){var j=(i+1)%Pts.length;a+=Pts[i][0]*Pts[j][1]-Pts[j][0]*Pts[i][1];}return a/2;}
  function lineHit(A,B,Cc,D){var x1=A[0],y1=A[1],x2=B[0],y2=B[1],x3=Cc[0],y3=Cc[1],x4=D[0],y4=D[1],den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-10)return null;var q1=x1*y2-y1*x2,q2=x3*y4-y3*x4;return [(q1*(x3-x4)-(x1-x2)*q2)/den,(q1*(y3-y4)-(y1-y2)*q2)/den];}
  function offsetData(Pts,d){
    if(!Pts||Pts.length<3||!(d>0))return null;
    var n=Pts.length,ccw=signedArea(Pts)>0,edges=[],i;
    for(i=0;i<n;i++){
      var A=Pts[i],B=Pts[(i+1)%n],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy);if(L<1e-9)return null;
      var nx=ccw?-dy/L:dy/L,ny=ccw?dx/L:-dx/L;
      edges.push({A:[A[0]+nx*d,A[1]+ny*d],B:[B[0]+nx*d,B[1]+ny*d],nx:nx,ny:ny,L:L,srcA:A,srcB:B});
    }
    var poly=[];
    for(i=0;i<n;i++){
      var prev=edges[(i+n-1)%n],cur=edges[i],hit=lineHit(prev.A,prev.B,cur.A,cur.B);
      if(!hit||!isFinite(hit[0])||!isFinite(hit[1]))hit=[(prev.B[0]+cur.A[0])/2,(prev.B[1]+cur.A[1])/2];
      var V=Pts[i],m=Math.hypot(hit[0]-V[0],hit[1]-V[1]);
      if(m>Math.max(d*12,2))hit=[(prev.B[0]+cur.A[0])/2,(prev.B[1]+cur.A[1])/2];
      poly.push(hit);
    }
    var bad=false;if(typeof fabPolySelfIntersects==='function')try{bad=fabPolySelfIntersects(poly);}catch(e){bad=false;}
    return {poly:bad?null:poly,edges:edges};
  }
  function scanIntervals(Pts,axis,value){
    var hits=[],eps=1e-7,i;if(!Pts||Pts.length<3)return [];
    for(i=0;i<Pts.length;i++){
      var A=Pts[i],B=Pts[(i+1)%Pts.length],a0=axis==='v'?A[0]:A[1],b0=axis==='v'?B[0]:B[1];
      if(!((a0<=value&&value<b0)||(b0<=value&&value<a0)))continue;
      var den=b0-a0;if(Math.abs(den)<eps)continue;
      var t=(value-a0)/den,other=axis==='v'?(A[1]+(B[1]-A[1])*t):(A[0]+(B[0]-A[0])*t);if(isFinite(other))hits.push(other);
    }
    hits.sort(function(a,b){return a-b;});var clean=[];for(i=0;i<hits.length;i++)if(!clean.length||Math.abs(hits[i]-clean[clean.length-1])>1e-5)clean.push(hits[i]);
    var out=[];for(i=0;i+1<clean.length;i+=2)if(clean[i+1]-clean[i]>eps)out.push([clean[i],clean[i+1]]);return out;
  }
  function longestVerticalEdge(Pts){
    var best=null,center=(minX+maxX)/2;for(var i=0;i<(Pts||[]).length;i++){
      var A=Pts[i],B=Pts[(i+1)%Pts.length],dx=Math.abs(B[0]-A[0]),L=Math.abs(B[1]-A[1]);if(dx>1e-6||L<1e-6)continue;
      var right=A[0]>=center,score=L+(right?W*10:0);if(!best||score>best.score)best={x:A[0],y1:Math.min(A[1],B[1]),y2:Math.max(A[1],B[1]),right:right,score:score};
    }return best;
  }
  function shapeHorizontalRef(Pts){
    var fallback={y:minY+g.iy,x1:minX+g.ix,x2:maxX-g.ix},poly=Pts||null;if(!poly||poly.length<3)return fallback;
    var leftFace=vCount?minX+g.v[0]-g.face/2:null,rightFace=vCount?minX+g.v[vCount-1]+g.face/2:null;
    var fr=[.03,.06,.1,.15,.22,.3,.4,.5],span=Math.max(.001,H-2*(g.offsetInset||0));
    for(var fi=0;fi<fr.length;fi++){
      var yy=minY+(g.offsetInset||0)+span*fr[fi],all=true;
      for(var bi=0;bi<vCount;bi++){
        var bx=minX+g.v[bi],cross=(g.verticalSegments||[]).some(function(s){return s.bar===bi&&yy>=Math.min(s.y1,s.y2)-1e-6&&yy<=Math.max(s.y1,s.y2)+1e-6;});
        if(!cross){all=false;break;}
      }
      if(!all)continue;
      var ivs=scanIntervals(poly,'h',yy);
      for(var ii=0;ii<ivs.length;ii++){
        var iv=ivs[ii];if((leftFace==null||iv[0]<=leftFace+1e-6)&&(rightFace==null||iv[1]>=rightFace-1e-6))return {y:yy,x1:iv[0],x2:iv[1]};
      }
    }
    return fallback;
  }
  function insetMark(data,d){
    if(!data||!data.edges||!data.edges.length||!(d>0))return '';
    var cand=null;for(var i=0;i<data.edges.length;i++){
      var e=data.edges[i],dx=e.srcB[0]-e.srcA[0],dy=e.srcB[1]-e.srcA[1],diag=Math.abs(dx)>1e-6&&Math.abs(dy)>1e-6,score=e.L+(diag?W+H:0);if(!cand||score>cand.score)cand={e:e,score:score};
    }
    if(!cand)return '';
    var e=cand.e,tests=[.25,.38,.62,.75],bestT=.5,bestGap=-1;
    for(var ti=0;ti<tests.length;ti++){
      var tt=tests[ti],qx=e.srcA[0]+(e.srcB[0]-e.srcA[0])*tt,qpx=X(qx),gap=1e9;
      (g.v||[]).forEach(function(v){gap=Math.min(gap,Math.abs(qpx-X(minX+v)));});
      if(gap>bestGap){bestGap=gap;bestT=tt;}
    }
    var mx=e.srcA[0]+(e.srcB[0]-e.srcA[0])*bestT,my=e.srcA[1]+(e.srcB[1]-e.srcA[1])*bestT,ax=X(mx),ay=Y(my),bx=X(mx+e.nx*d),by=Y(my+e.ny*d),dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1,px=-dy/L,py=dx/L,tick=4;
    var out=ln(ax,ay,bx,by,COL.inset,false,1.4);
    out+=ln(ax-px*tick,ay-py*tick,ax+px*tick,ay+py*tick,COL.inset,false,1.2);
    out+=ln(bx-px*tick,by-py*tick,bx+px*tick,by+py*tick,COL.inset,false,1.2);
    var lx=bx+dx/L*18+px*10,ly=by+dy/L*18+py*10;
    out+=shapeText(dimIn(d),lx,ly,10,'middle',COL.inset);
    return out;
  }

  var sw=Math.max(2.5,P.faceWidthIn*sc),o='<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7" fill="none" stroke="'+COL.overall+'" stroke-width="1"/></marker></defs>';

  if(g.outline&&g.outline.length){var d=g.outline.map(function(q,i){return (i?'L ':'M ')+X(q[0])+' '+Y(q[1]);}).join(' ')+' Z';o+='<path d="'+d+'" fill="#f7fbfb" stroke="'+COL.outline+'" stroke-width="2"/>';}
  else o+='<rect x="'+x0+'" y="'+y0+'" width="'+dw+'" height="'+dh+'" fill="#f7fbfb" stroke="'+COL.outline+'" stroke-width="2"/>';

  var insetGeom=null,insetPoly=null;
  if(!isShape&&(g.ix||g.iy)){
    o+='<rect x="'+X(minX+g.ix)+'" y="'+Y(maxY-g.iy)+'" width="'+Math.max(0,(W-2*g.ix)*sc)+'" height="'+Math.max(0,(H-2*g.iy)*sc)+'" fill="none" stroke="'+COL.inset+'" stroke-width="1.8"/>';
  }else if(isShape&&g.edgeMode==='offset'&&g.offsetInset>0&&g.outline&&g.outline.length){
    insetGeom=offsetData(g.outline,g.offsetInset);insetPoly=insetGeom&&insetGeom.poly;
    if(insetPoly){
      var idp=insetPoly.map(function(q,i){return (i?'L ':'M ')+X(q[0])+' '+Y(q[1]);}).join(' ')+' Z';
      o+='<path d="'+idp+'" fill="none" stroke="'+COL.inset+'" stroke-width="1.8"/>';
    }else if(insetGeom){
      insetGeom.edges.forEach(function(e){o+=ln(X(e.A[0]),Y(e.A[1]),X(e.B[0]),Y(e.B[1]),COL.inset,false,1.8);});
    }
  }

  (g.verticalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="#555" stroke-width="1"/>';});
  (g.horizontalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="#555" stroke-width="1"/>';});

  /* Общий размер стекла. Для Shape общий Width ставится ниже всей setout-лесенки. */
  var overallY=isShape?y0+dh+34+vCount*22:y0+dh+38;
  o+=ln(x0,overallY,x0+dw,overallY,COL.overall,true)+dimText(dimIn(W),x0+dw/2,overallY+23,15,'middle',COL.overall);
  o+=ln(x0-44,y0,x0-44,y0+dh,COL.overall,true)+dimText(dimIn(H),x0-68,y0+dh/2,15,'middle',COL.overall,-90);

  if(!isShape){
    /* Rectangle: согласованная ранее логика — не меняем. */
    var baseVX=X(minX+g.ix),topRefY=Y(maxY-g.iy);
    (g.v||[]).forEach(function(v,i){
      var setout=Math.max(0,v-g.face/2-g.ix),targetX=X(minX+v-g.face/2),yy=y0-22-i*22;
      o+=ln(baseVX,yy,targetX,yy,COL.setout,true);
      o+=ln(baseVX,yy+4,baseVX,topRefY,COL.setoutExt,false,.8,.9);
      o+=ln(targetX,yy+4,targetX,topRefY,COL.setoutExt,false,.8,.9);
      o+=dimText(dimIn(setout),(baseVX+targetX)/2,yy-10,11,'middle',COL.setout);
    });
    var baseHY=Y(minY+g.iy),rightRefX=X(maxX-g.ix);
    (g.h||[]).forEach(function(h,i){
      var setout=Math.max(0,h-g.face/2-g.iy),targetY=Y(minY+h-g.face/2),xx=x0+dw+24+i*44;
      o+=ln(xx,baseHY,xx,targetY,COL.setout,true);
      o+=ln(rightRefX,baseHY,xx+4,baseHY,COL.setoutExt,false,.8,.9);
      o+=ln(rightRefX,targetY,xx+4,targetY,COL.setoutExt,false,.8,.9);
      o+=dimText(dimIn(setout),xx+11,(baseHY+targetY)/2,11,'middle',COL.setout,-90);
    });
  }else{
    /* Shape: никаких V1/V2/V3 и H1/H2/H3.
       1) синим внутри — реальные чистые просветы;
       2) серым снаружи — накопительные размеры от Edge Inset до ближней грани бара;
       3) setout вертикальных баров уходит вниз, чтобы не конфликтовать с наклонным контуром. */
    var href=shapeHorizontalRef(insetPoly),xb=[href.x1-minX],bi;
    for(bi=0;bi<vCount;bi++){xb.push(g.v[bi]-g.face/2);xb.push(g.v[bi]+g.face/2);}xb.push(href.x2-minX);
    var bottomInsetY=Y(href.y),yClear=Math.min(y0+dh-18,bottomInsetY+18);
    for(bi=0;bi<xb.length-1;bi+=2){
      var xa=X(minX+xb[bi]),xc=X(minX+xb[bi+1]),span=xc-xa;if(xc<=xa+1)continue;
      o+=ln(xa,bottomInsetY,xa,yClear+5,COL.dlo,false,1,.92);
      o+=ln(xc,bottomInsetY,xc,yClear+5,COL.dlo,false,1,.92);
      o+=exactHDim(xa,xc,yClear,COL.dlo);
      var segIndex=bi/2,labelY=yClear-10-(segIndex%2?13:0),labelSize=span>=24?9:7;o+=shapeText(dimIn(xb[bi+1]-xb[bi]),(xa+xc)/2,labelY,labelSize,'middle',COL.dloLabel);
    }
    var shapeBaseData=href.x1,shapeBaseX=X(shapeBaseData);
    (g.v||[]).forEach(function(v,i){
      var targetData=minX+v-g.face/2,setout=Math.max(0,targetData-shapeBaseData),targetX=X(targetData),yy=y0+dh+28+i*22;
      o+=ln(shapeBaseX,yy,targetX,yy,COL.setout,true);
      o+=ln(shapeBaseX,bottomInsetY,shapeBaseX,yy-4,COL.setoutExt,false,.8,.85);
      o+=ln(targetX,bottomInsetY,targetX,yy-4,COL.setoutExt,false,.8,.85);
      o+=fitText(dimIn(setout),(shapeBaseX+targetX)/2,yy-9,targetX-shapeBaseX,11,COL.setout);
    });

    /* Вертикальные размеры привязываем к реальной вертикальной стороне Shape,
       а не к условному bounding box. Если такой стороны нет — не рисуем
       потенциально ложный DLO, но сами горизонтальные бары остаются видны. */
    var vEdge=longestVerticalEdge(g.outline||[]),refPoly=insetPoly||null;
    if(vEdge&&refPoly&&hCount){
      var refXData=vEdge.right?vEdge.x-g.offsetInset:vEdge.x+g.offsetInset,scanX=refXData+(vEdge.right?-1e-5:1e-5),ivs=scanIntervals(refPoly,'v',scanX);
      if(ivs.length){
        var iv=ivs.sort(function(a,b){return (b[1]-b[0])-(a[1]-a[0]);})[0],cross=[];
        (g.h||[]).forEach(function(h,idx){
          var lo=h-g.face/2,hi=h+g.face/2,has=(g.horizontalSegments||[]).some(function(s){return s.bar===idx&&refXData>=s.x1-1e-6&&refXData<=s.x2+1e-6;});
          if(has&&hi>iv[0]&&lo<iv[1])cross.push({idx:idx,h:h,lo:lo,hi:hi});
        });
        cross.sort(function(a,b){return a.h-b.h;});
        var yBounds=[iv[0]],ci;for(ci=0;ci<cross.length;ci++){yBounds.push(cross[ci].lo);yBounds.push(cross[ci].hi);}yBounds.push(iv[1]);
        var xRef= X(refXData),xClear=xRef+(vEdge.right?-18:18);
        for(ci=0;ci<yBounds.length-1;ci+=2){
          var ya=Y(yBounds[ci]),yc=Y(yBounds[ci+1]),spanY=Math.abs(yc-ya);
          o+=ln(xRef,ya,xClear+(vEdge.right?5:-5),ya,COL.dlo,false,1,.92);
          o+=ln(xRef,yc,xClear+(vEdge.right?5:-5),yc,COL.dlo,false,1,.92);
          o+=exactVDim(xClear,ya,yc,COL.dlo);
          o+=fitText(dimIn(yBounds[ci+1]-yBounds[ci]),xClear+(vEdge.right?12:-12),(ya+yc)/2,spanY,11,COL.dloLabel,-90);
        }
        cross.forEach(function(b,i){
          if(i===0)return; /* первый setout совпадает с первым blue clear — не дублируем */
          var setout=Math.max(0,b.lo-iv[0]),targetY=Y(b.lo),baseY=Y(iv[0]),rank=i-1,xx=(vEdge.right?X(vEdge.x)+24+rank*44:X(vEdge.x)-24-rank*44);
          o+=ln(xx,baseY,xx,targetY,COL.setout,true);
          o+=ln(xRef,baseY,xx+(vEdge.right?-4:4),baseY,COL.setoutExt,false,.8,.85);
          o+=ln(xRef,targetY,xx+(vEdge.right?-4:4),targetY,COL.setoutExt,false,.8,.85);
          o+=fitText(dimIn(setout),xx+(vEdge.right?11:-11),(baseY+targetY)/2,Math.abs(targetY-baseY),11,COL.setout,-90);
        });
      }
    }

    /* Edge Inset подписываем один раз и именно перпендикулярно реальному краю. */
    if(insetGeom&&g.offsetInset>0)o+=insetMark(insetGeom,g.offsetInset);
  }

  if(!isShape&&M.production.mode!=="custom"){
    /* Rectangle clear openings — согласованная ранее логика. */
    var rxb=[g.ix],ri;
    for(ri=0;ri<g.v.length;ri++){rxb.push(g.v[ri]-g.face/2);rxb.push(g.v[ri]+g.face/2);}rxb.push(W-g.ix);
    var yDlo=y0+17,yDloRef=Y(maxY-g.iy);
    for(ri=0;ri<rxb.length-1;ri+=2){
      var rxa=X(minX+rxb[ri]),rxc=X(minX+rxb[ri+1]);
      o+=ln(rxa,yDloRef,rxa,yDlo+5,COL.dlo,false,1,.95);o+=ln(rxc,yDloRef,rxc,yDlo+5,COL.dlo,false,1,.95);o+=exactHDim(rxa,rxc,yDlo,COL.dlo);o+=dimText(dimIn(rxb[ri+1]-rxb[ri]),(rxa+rxc)/2,yDlo-11,11,'middle',COL.dloLabel);
    }
    var ryb=[g.iy];for(ri=0;ri<g.h.length;ri++){ryb.push(g.h[ri]-g.face/2);ryb.push(g.h[ri]+g.face/2);}ryb.push(H-g.iy);
    var xDlo=x0+20,xDloRef=X(minX+g.ix);
    for(ri=0;ri<ryb.length-1;ri+=2){
      var rya=Y(minY+ryb[ri]),ryc=Y(minY+ryb[ri+1]);
      o+=ln(xDloRef,rya,xDlo+5,rya,COL.dlo,false,1,.95);o+=ln(xDloRef,ryc,xDlo+5,ryc,COL.dlo,false,1,.95);o+=exactVDim(xDlo,rya,ryc,COL.dlo);o+=dimText(dimIn(Math.abs(ryb[ri+1]-ryb[ri])),xDlo+11,(rya+ryc)/2,11,'middle',COL.dloLabel,-90);
    }
  }

  return '<svg viewBox="0 0 '+vw+' '+vh+'" aria-label="Muntin configurator drawing">'+o+'</svg>';
}
