/* =====================================================================
   muntin/drawing  ·  v4.5-port
   Производственный чертёж мунтина (SVG).
   IN : {geo, M}
   OUT: строка SVG
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function mpSvg(x){
  var g=x.geo,M=x.M,P=muntinProduct(M.productId),C=muntinColors(M),minX=g.minX==null?0:g.minX,maxX=g.maxX==null?g.W:g.maxX,minY=g.minY==null?0:g.minY,maxY=g.maxY==null?g.H:g.maxY,W=Math.max(.001,maxX-minX),H=Math.max(.001,maxY-minY),vw=760,vh=520,pL=104,pR=54,pT=68,pB=84,aw=vw-pL-pR,ah=vh-pT-pB,sc=Math.min(aw/W,ah/H),dw=W*sc,dh=H*sc,x0=pL+(aw-dw)/2,y0=pT+(ah-dh)/2;
  function X(v){return x0+(v-minX)*sc}function Y(v){return y0+dh-(v-minY)*sc}function tx(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;')}
  function dimText(txt,xp,yp,size,anchor,fill,rotate){size=size||12;anchor=anchor||'middle';fill=fill||'#555';var tr=rotate?' transform="rotate('+rotate+' '+xp+' '+yp+')"':'';return '<text x="'+xp+'" y="'+yp+'" text-anchor="'+anchor+'" dominant-baseline="middle" font-size="'+size+'" fill="'+fill+'" stroke="#fff" stroke-width="5" stroke-linejoin="round" paint-order="stroke fill"'+tr+'>'+tx(txt)+'</text>';}
  var sw=Math.max(2.5,P.faceWidthIn*sc),o='<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7" fill="none" stroke="#373532" stroke-width="1"/></marker></defs>';
  if(g.outline&&g.outline.length){var d=g.outline.map(function(q,i){return (i?'L ':'M ')+X(q[0])+' '+Y(q[1]);}).join(' ')+' Z';o+='<path d="'+d+'" fill="#f7fbfb" stroke="#282725" stroke-width="2"/>';}
  else o+='<rect x="'+x0+'" y="'+y0+'" width="'+dw+'" height="'+dh+'" fill="#f7fbfb" stroke="#282725" stroke-width="2"/>';
  if(!g.shapeAdaptive&&(g.ix||g.iy))o+='<rect x="'+X(minX+g.ix)+'" y="'+Y(maxY-g.iy)+'" width="'+Math.max(0,(W-2*g.ix)*sc)+'" height="'+Math.max(0,(H-2*g.iy)*sc)+'" fill="none" stroke="#8bbf53" stroke-width="1.5"/>';
  (g.verticalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x)+'" y1="'+Y(s.y1)+'" x2="'+X(s.x)+'" y2="'+Y(s.y2)+'" stroke="#555" stroke-width="1"/>';});
  (g.horizontalSegments||[]).forEach(function(s){o+='<line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="'+C.exterior.hex+'" stroke-width="'+sw+'"/><line x1="'+X(s.x1)+'" y1="'+Y(s.y)+'" x2="'+X(s.x2)+'" y2="'+Y(s.y)+'" stroke="#555" stroke-width="1"/>';});
  o+='<line x1="'+x0+'" y1="'+(y0+dh+38)+'" x2="'+(x0+dw)+'" y2="'+(y0+dh+38)+'" stroke="#373532" marker-start="url(#arr)" marker-end="url(#arr)"/>'+dimText(dimIn(W),x0+dw/2,y0+dh+61,15,'middle','#373532');
  o+='<line x1="'+(x0-44)+'" y1="'+y0+'" x2="'+(x0-44)+'" y2="'+(y0+dh)+'" stroke="#373532" marker-start="url(#arr)" marker-end="url(#arr)"/>'+dimText(dimIn(H),x0-68,y0+dh/2,15,'middle','#373532',-90);
  g.v.forEach(function(v,i){var xx=X(minX+v),yy=y0-22-i%2*22;o+='<line x1="'+x0+'" y1="'+yy+'" x2="'+xx+'" y2="'+yy+'" stroke="#555" marker-start="url(#arr)" marker-end="url(#arr)"/><line x1="'+xx+'" y1="'+(yy-7)+'" x2="'+xx+'" y2="'+y0+'" stroke="#aaa"/>'+dimText('V'+(i+1)+' '+dimIn(v),(x0+xx)/2,yy-10,11,'middle','#555');});
  g.h.forEach(function(h,i){var yy=Y(minY+h),xx=x0+dw+24+i%2*44;o+='<line x1="'+xx+'" y1="'+Y(minY)+'" x2="'+xx+'" y2="'+yy+'" stroke="#555" marker-start="url(#arr)" marker-end="url(#arr)"/><line x1="'+(x0+dw)+'" y1="'+yy+'" x2="'+(xx+7)+'" y2="'+yy+'" stroke="#aaa"/>'+dimText('H'+(i+1)+' '+dimIn(h),xx+11,(Y(minY)+yy)/2,11,'middle','#555',-90);});
  if(g.shapeAdaptive)o+='<text x="'+(x0+dw)+'" y="28" text-anchor="end" font-size="10" font-weight="700" fill="#267ea8">SHAPE-ADAPTIVE MUNTIN</text><text x="'+(x0+dw)+'" y="43" text-anchor="end" font-size="9" fill="#777">Bar ends clipped to actual perimeter · DLO varies at shaped edges</text>';
  else if(M.production.mode!=="custom"){
    var xb=[g.ix];for(var bi=0;bi<g.v.length;bi++){xb.push(g.v[bi]-g.face/2);xb.push(g.v[bi]+g.face/2);}xb.push(W-g.ix);for(bi=0;bi<xb.length-1;bi+=2){var xa=X(minX+xb[bi]),xc=X(minX+xb[bi+1]),yd=y0+17;o+='<line x1="'+xa+'" y1="'+yd+'" x2="'+xc+'" y2="'+yd+'" stroke="#267ea8" marker-start="url(#arr)" marker-end="url(#arr)"/>'+dimText(dimIn(xb[bi+1]-xb[bi]),(xa+xc)/2,yd-11,11,'middle','#267ea8');}
    var yb=[g.iy];for(bi=0;bi<g.h.length;bi++){yb.push(g.h[bi]-g.face/2);yb.push(g.h[bi]+g.face/2);}yb.push(H-g.iy);for(bi=0;bi<yb.length-1;bi+=2){var ya=Y(minY+yb[bi]),yc=Y(minY+yb[bi+1]),xd=x0+20;o+='<line x1="'+xd+'" y1="'+ya+'" x2="'+xd+'" y2="'+yc+'" stroke="#267ea8" marker-start="url(#arr)" marker-end="url(#arr)"/>'+dimText(dimIn(Math.abs(yb[bi+1]-yb[bi])),xd+11,(ya+yc)/2,11,'middle','#267ea8',-90);}
  }
  return '<svg viewBox="0 0 '+vw+' '+vh+'" aria-label="Muntin production drawing">'+o+'</svg>';
}
