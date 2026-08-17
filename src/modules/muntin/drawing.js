/* =====================================================================
   muntin/drawing  ·  v4.5-port + production setout
   Производственный чертёж мунтина (SVG).
   Показывает реальные просветы от Edge Inset до грани бара и
   накопительные установочные размеры до ближней грани каждого бара.
   IN : {geo, M}
   OUT: строка SVG
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */
function mpSvg(x){
  var g=x.geo,M=x.M,P=muntinProduct(M.productId),C=muntinColors(M),minX=g.minX==null?0:g.minX,maxX=g.maxX==null?g.W:g.maxX,minY=g.minY==null?0:g.minY,maxY=g.maxY==null?g.H:g.maxY,W=Math.max(.001,maxX-minX),H=Math.max(.001,maxY-minY);

  /* Цвета чертежа.
     Делаем контрастнее и читаемее:
     - Edge Inset: тёплый янтарный, чтобы не спорил с чёрным профилем
     - Clear Opening (бывший светло-голубой): насыщенный тёмно-синий
     - Production setout: нейтральный тёмно-серый
  */
  var COL={
    outline:'#282725',
    overall:'#373532',
    setout:'#4f4f4f',
    setoutExt:'#9a9a9a',
    inset:'#b36b00',
    dlo:'#0057b8',
    dloLabel:'#0057b8',
    shapeInfo:'#0057b8'
  };

  /*
     Для прямоугольника установочные размеры идут лесенкой:
     первый бар — ближе всего к стеклу, следующий — выше/правее и т.д.
     Увеличиваем viewBox вместе с полями, чтобы 4+ размеров не обрезались.
     Для shape-adaptive оставляем старую систему координатных размеров,
     потому что там реальный край может быть наклонным/ступенчатым.
  */
  var setoutV=!g.shapeAdaptive?(g.v||[]).length:0,setoutH=!g.shapeAdaptive?(g.h||[]).length:0;
  var extraTop=Math.max(0,setoutV-2)*22,extraRight=Math.max(0,setoutH-2)*44;
  var vw=760+extraRight,vh=520+extraTop,pL=104,pR=54+extraRight,pT=68+extraTop,pB=84,aw=vw-pL-pR,ah=vh-pT-pB,sc=Math.min(aw/W,ah/H),dw=W*sc,dh=H*sc,x0=pL+(aw-dw)/2,y0=pT+(ah-dh)/2;

  function X(v){return x0+(v-minX)*sc}
  function Y(v){return y0+dh-(v-minY)*sc}
  function tx(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
  function dimText(txt,xp,yp,size,anchor,fill,rotate){size=size||12;anchor=anchor||'middle';fill=fill||COL.setout;var tr=rotate?' transform="rotate('+rotate+' '+xp+' '+yp+')"':'';return '<text x="'+xp+'" y="'+yp+'" text-anchor="'+anchor+'" dominant-baseline="middle" font-size="'+size+'" fill="'+fill+'" stroke="#fff" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"'+tr+'>'+tx(txt)+'</text>';}
  function ln(x1,y1,x2,y2,stroke,markers,width,opacity){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+(stroke||COL.setout)+'" stroke-width="'+(width||1)+'"'+(opacity==null?'':' opacity="'+opacity+'"')+(markers?' marker-start="url(#arr)" marker-end="url(#arr)"':'')+'/>'; }
  function exactHDim(x1,x2,y,stroke){var a=5,b=3;return ln(x1,y,x2,y,stroke,false,1.15)+'<path d="M '+(x1+a)+' '+(y-b)+' L '+x1+' '+y+' L '+(x1+a)+' '+(y+b)+' M '+(x2-a)+' '+(y-b)+' L '+x2+' '+y+' L '+(x2-a)+' '+(y+b)+'" fill="none" stroke="'+stroke+'" stroke-width="1.15"/>'; }
  function exactVDim(x,y1,y2,stroke){var a=5,b=3;return ln(x,y1,x,y2,stroke,false,1.15)+'<path d="M '+(x-b)+' '+(y1+a)+' L '+x+' '+y1+' L '+(x+b)+' '+(y1+a)+' M '+(x-b)+' '+(y2-a)+' L '+x+' '+y2+' L '+(x+b)+' '+(y2-a)+'" fill="none" stroke="'+stroke+'" stroke-width="1.15"/>'; }

  var sw=Math.max(2.5,P.faceWidthIn*sc),o='<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7" fill="none" stroke="'+COL.overall+'" stroke-width="1"/></marker></defs>';

  if(g.outline&&g.outline.length){var d=g.outline.map(function(q,i){return (i?'L ':'M ')+X(q[0])+' '+Y(q[1]);}).join(' ')+' Z';o+='<path d="'+d+'" fill="#f7fbfb" stroke="'+COL.outline+'" stroke-width="2"/>';}
  else o+='<rect x="'+x0+'" y="'+y0+'" width="'+dw+'" height="'+dh+'" fill="#f7fbfb" stroke="'+COL.outline+'" stroke-width="2"/>';

  /* Edge Inset для прямоугольной детали. */
  if(!g.shapeAdaptive&&(g.ix||g.iy))o+='<rect x="'+X(minX+g.ix)+'" y="'+Y(maxY-g.iy)+'" width="'+Math.max(0,(W-2*g.ix)*sc)+'" height="'+Math.max(0,(H-2*g.iy)*sc)+'" fill="none" stroke="'+COL.inset+'" stroke-width="1.8"/>';

  (g.verticalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="#555" stroke-width="1"/>';});
  (g.horizontalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="#555" stroke-width="1"/>';});

  /* Общий размер стекла остаётся по внешнему контуру. */
  o+=ln(x0,y0+dh+38,x0+dw,y0+dh+38,COL.overall,true)+dimText(dimIn(W),x0+dw/2,y0+dh+61,15,'middle',COL.overall);
  o+=ln(x0-44,y0,x0-44,y0+dh,COL.overall,true)+dimText(dimIn(H),x0-68,y0+dh/2,15,'middle',COL.overall,-90);

  if(!g.shapeAdaptive){
    /*
       УСТАНОВОЧНЫЕ РАЗМЕРЫ ДЛЯ ПРОИЗВОДСТВА.
       Вместо V1/V2/V3... от внешнего края до центра бара показываем:
       Edge Inset -> ближняя грань первого бара,
       Edge Inset -> ближняя грань второго бара и т.д.
       Пример: 8 15/16, 18 1/2, 28, 37 9/16.
    */
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
    /*
       Для фигурной детали сохраняем старую координатную привязку.
       У неё Edge Inset может идти по наклонному/ступенчатому периметру,
       поэтому прямоугольная setout-база была бы визуально ложной.
    */
    g.v.forEach(function(v,i){var xx=X(minX+v),yy=y0-22-i%2*22;o+=ln(x0,yy,xx,yy,COL.setout,true)+ln(xx,yy-7,xx,y0,COL.setoutExt,false)+dimText('V'+(i+1)+' '+dimIn(v),(x0+xx)/2,yy-10,11,'middle',COL.setout);});
    g.h.forEach(function(h,i){var yy=Y(minY+h),xx=x0+dw+24+i%2*44;o+=ln(xx,Y(minY),xx,yy,COL.setout,true)+ln(x0+dw,yy,xx+7,yy,COL.setoutExt,false)+dimText('H'+(i+1)+' '+dimIn(h),xx+11,(Y(minY)+yy)/2,11,'middle',COL.setout,-90);});
  }

  if(g.shapeAdaptive)o+='<text x="'+(x0+dw)+'" y="28" text-anchor="end" font-size="10" font-weight="700" fill="'+COL.shapeInfo+'">SHAPE-ADAPTIVE MUNTIN</text><text x="'+(x0+dw)+'" y="43" text-anchor="end" font-size="9" fill="#777">Bar ends clipped to actual perimeter · DLO varies at shaped edges</text>';
  else if(M.production.mode!=="custom"){
    /*
       СИНИЕ РАЗМЕРЫ = ЧИСТЫЕ ПРОСВЕТЫ.
       Числа и раньше считались правильно. Добавляем выносные линии,
       чтобы было однозначно видно: первый/последний просвет начинается
       от линии Edge Inset, внутренние — от грани до грани баров.
    */
    var xb=[g.ix],bi;
    for(bi=0;bi<g.v.length;bi++){xb.push(g.v[bi]-g.face/2);xb.push(g.v[bi]+g.face/2);}
    xb.push(W-g.ix);
    var yDlo=y0+17,yDloRef=Y(maxY-g.iy);
    for(bi=0;bi<xb.length-1;bi+=2){
      var xa=X(minX+xb[bi]),xc=X(minX+xb[bi+1]);
      o+=ln(xa,yDloRef,xa,yDlo+5,COL.dlo,false,1,.95);
      o+=ln(xc,yDloRef,xc,yDlo+5,COL.dlo,false,1,.95);
      o+=exactHDim(xa,xc,yDlo,COL.dlo);
      o+=dimText(dimIn(xb[bi+1]-xb[bi]),(xa+xc)/2,yDlo-11,11,'middle',COL.dloLabel);
    }

    var yb=[g.iy];
    for(bi=0;bi<g.h.length;bi++){yb.push(g.h[bi]-g.face/2);yb.push(g.h[bi]+g.face/2);}
    yb.push(H-g.iy);
    var xDlo=x0+20,xDloRef=X(minX+g.ix);
    for(bi=0;bi<yb.length-1;bi+=2){
      var ya=Y(minY+yb[bi]),yc=Y(minY+yb[bi+1]);
      o+=ln(xDloRef,ya,xDlo+5,ya,COL.dlo,false,1,.95);
      o+=ln(xDloRef,yc,xDlo+5,yc,COL.dlo,false,1,.95);
      o+=exactVDim(xDlo,ya,yc,COL.dlo);
      o+=dimText(dimIn(Math.abs(yb[bi+1]-yb[bi])),xDlo+11,(ya+yc)/2,11,'middle',COL.dloLabel,-90);
    }
  }

  return '<svg viewBox="0 0 '+vw+' '+vh+'" aria-label="Muntin production drawing">'+o+'</svg>';
}
