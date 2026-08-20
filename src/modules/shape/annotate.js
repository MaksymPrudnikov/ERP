/* =====================================================================
   shape/annotate  ·  designer-port
   Производственные аннотации чертежа Shape: цепочки размеров по сторонам
   (включая скошенные края), базовые линии отвеса/уровня, локальные выноски
   уклона, машинные линии митры/фацета и вид сверху Front/Back Mitre.

   Перенесено из утверждённого автономного Designer
   (reference_shapes/01_SMART_SHAPE_APPROVED.html) БЕЗ изменения геометрии:
   контур по-прежнему строит shape/contour, здесь только отображение.

   ГЛАВНОЕ ОТЛИЧИЕ ОТ ПРОСТОГО ЧЕРТЕЖА:
   реальный уклон в 1/16″ на детали 72″ физически неразличим на экране, но
   для цеха это ключевой размер. Поэтому контур показывается с локальным
   усилением отклонения от отвеса/уровня, а размеры при этом печатаются
   ИСТИННЫЕ. Усиление — только визуальное, в раскрой и BOM не попадает.

   IN : result из ShapeModule.compute + рамка кадра F
   OUT: строка SVG
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* ---------- формат размера: 9 15/16 → 9-15/16, как на чертежах цеха ---------- */
function shapeAnnDim(v){
  try{return String(dimIn(Math.abs(+v||0))).replace(/[″”"]/g,'').trim().replace(/^(\d+)\s+(\d+\/\d+)$/,'$1-$2');}
  catch(e){return String(v==null?'':v);}
}
function shapeAnnText(x,y,txt,o){
  o=o||{};var rot=o.rot?' transform="rotate('+o.rot+' '+x+' '+y+')"':'';
  return '<text x="'+x+'" y="'+y+'" text-anchor="'+(o.anchor||'middle')+'" font-size="'+(o.size||11)+'" fill="'+(o.color||'#101828')+'" font-family="Arial,sans-serif"'+(o.weight?' font-weight="'+o.weight+'"':'')+' stroke="#fff" stroke-width="'+(o.halo==null?3.2:o.halo)+'" stroke-linejoin="round" paint-order="stroke fill"'+rot+'>'+shapeXml(txt)+'</text>';
}
function shapeAnnDimH(x1,x2,y,label){
  if(Math.abs(x2-x1)<0.5)return '';
  return '<line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="#101828" stroke-width="1" marker-start="url(#shpArr)" marker-end="url(#shpArr)"/>'+shapeAnnText((x1+x2)/2,y-6,label,{size:10,weight:600});
}
function shapeAnnDimV(x,y1,y2,label){
  if(Math.abs(y2-y1)<0.5)return '';
  var cy=(y1+y2)/2;
  return '<line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="#101828" stroke-width="1" marker-start="url(#shpArr)" marker-end="url(#shpArr)"/>'+shapeAnnText(x-8,cy,label,{size:10,weight:600,rot:-90});
}
function shapeAnnEqP(a,b){return Math.abs(a[0]-b[0])<1e-7&&Math.abs(a[1]-b[1])<1e-7;}

/* ---------- топология: к какой стороне и оси принадлежит ребро ---------- */
function shapeAnnExtraInfo(S,id){
  try{var all=ssEdgeMap(S).all;for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];}catch(e){}
  return null;
}
function shapeAnnAxis(S,id){
  if(id==='A'||id==='C')return 'v';
  if(id==='B'||id==='D')return 'h';
  var e=shapeAnnExtraInfo(S,id);return e&&e.axis==='v'?'v':'h';
}
function shapeAnnSide(S,id){
  if(id==='A')return 'left';if(id==='B')return 'bottom';if(id==='C')return 'right';if(id==='D')return 'top';
  var e=shapeAnnExtraInfo(S,id);if(!e)return null;
  if(e.axis==='h')return (e.corner==='tl'||e.corner==='tr')?'top':'bottom';
  return (e.corner==='tl'||e.corner==='bl')?'left':'right';
}
function shapeAnnSideAxis(side){return (side==='top'||side==='bottom')?'x':'y';}
function shapeAnnSideSegments(r,S,side){
  var ax=shapeAnnSideAxis(side),idx=ax==='x'?0:1;
  return (r.geometry.edges||[]).filter(function(e){
    if(shapeAnnSide(S,e.id)!==side)return false;
    var pa=shapeAnnAxis(S,e.id);
    return (pa==='h'&&ax==='x')||(pa==='v'&&ax==='y');
  }).slice().sort(function(a,b){return (a.p1[idx]+a.p2[idx])/2-(b.p1[idx]+b.p2[idx])/2;});
}
/* Для цепочки размеров нужен ВЕСЬ участок границы этой стороны, включая
   ПОПЕРЕЧНЫЕ рёбра нотча: скошенное вертикальное ребро нотча даёт горизонтальный
   ход, и без него верхняя цепочка не сходится с общим размером. */
var SHAPE_SIDE_CORNERS={top:['tl','tr'],bottom:['bl','br'],left:['tl','bl'],right:['tr','br']};
var SHAPE_SIDE_MAIN={top:'D',bottom:'B',left:'A',right:'C'};
function shapeAnnChainSegments(r,S,side){
  var idx=shapeAnnSideAxis(side)==='x'?0:1,cs=SHAPE_SIDE_CORNERS[side]||[],main=SHAPE_SIDE_MAIN[side];
  return (r.geometry.edges||[]).filter(function(e){
    if(e.id===main)return true;
    var inf=shapeAnnExtraInfo(S,e.id);
    return !!(inf&&cs.indexOf(inf.corner)>=0);
  }).slice().sort(function(a,b){return (a.p1[idx]+a.p2[idx])/2-(b.p1[idx]+b.p2[idx])/2;});
}
function shapeAnnGroupPoints(g){
  if(!g||!g.segments||!g.segments.length)return [];
  var P=[g.segments[0].p1];g.segments.forEach(function(e){P.push(e.p2);});return P;
}

/* ---------- нейтральный контур: та же топология, нулевой уклон ----------
   Это производственная база отвеса/уровня, от которой считается отклонение.
   Длины рёбер и угловые блоки сохраняются, обнуляются только перпендикулярные
   выносы, поэтому число и порядок сегментов совпадают с реальным контуром. */
function shapeAnnNeutralGeometry(S){
  if(!S||!S.shape||S.shape.type!=='smart')return null;
  try{
    var m=JSON.parse(JSON.stringify(ssNormalize(S.shape.smart)));
    ['A','B','C'].forEach(function(e){
      m[e].out='0';m[e].dir=null;
      m[e].elbow.to='0';m[e].elbow.past='0';
    });
    var N={w:S.w,h:S.h,shape:{type:'smart',smart:m}},q=ssContour(N);
    if(!q||q.pts.length<3)return null;
    return {points:q.pts,edges:q.segs.map(function(e,i){
      return {id:e.id,segmentId:e.id+':'+i,p1:e.p1.slice(),p2:e.p2.slice(),length:Math.hypot(e.p2[0]-e.p1[0],e.p2[1]-e.p1[1])};
    })};
  }catch(e){return null;}
}

/* ---------- усиление отклонения ----------
   Малый уклон растягивается до различимой величины, большой — почти не
   трогается. Рёбра угловых блоков усиливаются слабее (0.55), иначе короткая
   ступенька визуально забивает основной уклон стороны. */
function shapeAnnMag(v,damp){
  var a=Math.abs(v);if(a<.12)return 0;
  var sg=v<0?-1:1,base=a<=10?(20+0.2*a):Math.min(46,22+14*(a-10));
  return sg*base*(damp==null?1:damp);
}
/* Возвращает функцию DP: точка инженерная → точка экранная (с усилением). */
function shapeAnnDisplay(r,S,F){
  var ident=function(p){return [F.X(p[0]),F.Y(p[1])];};
  var N=shapeAnnNeutralGeometry(S);
  if(!N)return ident;
  var AE=r.geometry.edges||[],NE=N.edges||[],map={},k;

  if(NE.length===AE.length&&AE.length){
    var vecs=[],i,a,n,nv,av;
    for(i=0;i<AE.length;i++){
      a=AE[i];n=NE[i];
      nv=[(n.p2[0]-n.p1[0])*F.sc,-(n.p2[1]-n.p1[1])*F.sc];
      av=[(a.p2[0]-a.p1[0])*F.sc,-(a.p2[1]-a.p1[1])*F.sc];
      var damp=shapeAnnExtraInfo(S,a.id)?0.55:1;
      vecs.push([nv[0]+shapeAnnMag(av[0]-nv[0],damp),nv[1]+shapeAnnMag(av[1]-nv[1],damp)]);
    }
    /* D — замыкающее ребро Smart-Shape. Остаточную невязку усиления гасим в нём,
       иначе отображаемый многоугольник перестанет быть замкнутым. */
    var sxv=0,syv=0,lastD=-1;
    vecs.forEach(function(v,j){sxv+=v[0];syv+=v[1];if(AE[j].id==='D')lastD=j;});
    if(lastD>=0){vecs[lastD][0]-=sxv;vecs[lastD][1]-=syv;}
    var cur=[0,0],raw=[[0,0]];
    for(i=0;i<AE.length;i++){
      a=AE[i];
      map[a.p1[0].toFixed(8)+','+a.p1[1].toFixed(8)]=cur.slice();
      cur=[cur[0]+vecs[i][0],cur[1]+vecs[i][1]];
      map[a.p2[0].toFixed(8)+','+a.p2[1].toFixed(8)]=cur.slice();
      raw.push(cur.slice());
    }
    var xs=raw.map(function(p){return p[0];}),ys=raw.map(function(p){return p[1];});
    var cx=(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2,cy=(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2;
    var tx=F.x0+F.dw/2-cx,ty=F.y0+F.dh/2-cy;
    for(k in map)if(Object.prototype.hasOwnProperty.call(map,k))map[k]=[map[k][0]+tx,map[k][1]+ty];
  }else if(N.points.length===r.points.length){
    for(var z=0;z<r.points.length;z++){
      var pa=r.points[z],pn=N.points[z],nx=F.X(pn[0]),ny=F.Y(pn[1]);
      map[pa[0].toFixed(8)+','+pa[1].toFixed(8)]=[nx+shapeAnnMag(F.X(pa[0])-nx),ny+shapeAnnMag(F.Y(pa[1])-ny)];
    }
  }else return ident;

  return function(p){
    var v=map[p[0].toFixed(8)+','+p[1].toFixed(8)];
    return v?v:[F.X(p[0]),F.Y(p[1])];
  };
}

/* ---------- пунктирная база отвеса / уровня ----------
   Линия ложится на ВНЕШНЮЮ огибающую стороны (слева min X, справа max X,
   сверху min Y, снизу max Y). Именно поэтому малый размер уклона сам
   переезжает на нужный конец, когда направление наклона меняется. */
function shapeAnnRefLines(r,S,DP){
  var out='';
  (r.edges||[]).forEach(function(g){
    if(!g.segments||!g.segments.length)return;
    var side=shapeAnnSide(S,g.id);if(!side)return;
    var vert=shapeAnnAxis(S,g.id)==='v',sp=shapeAnnGroupPoints(g).map(DP);
    if(sp.length<2)return;
    var ref,vals,lo,hi,dev;
    if(vert){
      ref=side==='left'?Math.min.apply(null,sp.map(function(q){return q[0];})):Math.max.apply(null,sp.map(function(q){return q[0];}));
      vals=sp.map(function(q){return q[1];});
    }else{
      ref=side==='top'?Math.min.apply(null,sp.map(function(q){return q[1];})):Math.max.apply(null,sp.map(function(q){return q[1];}));
      vals=sp.map(function(q){return q[0];});
    }
    lo=Math.min.apply(null,vals);hi=Math.max.apply(null,vals);
    dev=Math.max.apply(null,sp.map(function(q){return Math.abs((vert?q[0]:q[1])-ref);}));
    if(dev<1.2)return;
    out+=vert
      ? '<line x1="'+ref+'" y1="'+lo+'" x2="'+ref+'" y2="'+hi+'" stroke="#101828" stroke-width=".8" stroke-dasharray="8 5"/>'
      : '<line x1="'+lo+'" y1="'+ref+'" x2="'+hi+'" y2="'+ref+'" stroke="#101828" stroke-width=".8" stroke-dasharray="8 5"/>';
  });
  return out;
}

/* ---------- машинные линии обработки ----------
   Производственная договорённость цеха:
   Front Mitre — сплошная параллельная линия внутри стекла,
   Back  Mitre — штриховая,
   Bevel       — пунктир точками.
   Это индикаторы обработки, а НЕ дополнительные физические рёбра. */
function shapeAnnOpOf(def,id,type){
  var l=shapeEdgeOps(def,id);
  for(var i=0;i<l.length;i++)if(l[i].type===type)return l[i];
  return null;
}
function shapeAnnWitness(r,S,DP){
  var def=r.definition,pts=r.points.map(DP),out='';
  if(!pts.length)return '';
  var cxx=0,cyy=0;pts.forEach(function(p){cxx+=p[0]/pts.length;cyy+=p[1]/pts.length;});
  (r.edges||[]).forEach(function(g){
    var mit=shapeAnnOpOf(def,g.id,'Mitering'),bev=shapeAnnOpOf(def,g.id,'Beveling');
    if(!mit&&!bev)return;
    var side=mit?(mit.side||'back'):(bev.side||'front'),style;
    if(mit)style=side==='front'?'stroke-dasharray:none':'stroke-dasharray:10 6';
    else style='stroke-dasharray:1 6;stroke-linecap:round';
    (g.segments||[]).forEach(function(seg){
      var a=DP(seg.p1),b=DP(seg.p2),dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
      if(L<1e-6)return;
      var tx=dx/L,ty=dy/L,nx=-ty,ny=tx,mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
      if(nx*(cxx-mx)+ny*(cyy-my)<0){nx=-nx;ny=-ny;}
      var cut=Math.min(6,L*.18),o=8;
      out+='<line x1="'+(a[0]+tx*cut+nx*o)+'" y1="'+(a[1]+ty*cut+ny*o)+'" x2="'+(b[0]-tx*cut+nx*o)+'" y2="'+(b[1]-ty*cut+ny*o)+'" stroke="#101828" stroke-width="1.05" style="'+style+'"/>';
    });
  });
  return out;
}

/* ---------- вид сверху для митры ----------
   Реальная схема направления обработки, не декорация.
   Верхняя линия — ЛИЦЕВАЯ грань стекла, нижняя — ТЫЛЬНАЯ.
   Front Mitre оставляет лицевую грань длинной и подрезает тыльную, Back — наоборот. */
function shapeAnnNeedsOverhead(r){
  var def=r&&r.definition;if(!def)return false;
  return !!(shapeAnnOpOf(def,'A','Mitering')||shapeAnnOpOf(def,'C','Mitering'));
}
function shapeAnnOverhead(r,F,left,right){
  var def=r.definition,lm=shapeAnnOpOf(def,'A','Mitering'),rm=shapeAnnOpOf(def,'C','Mitering');
  if(!lm&&!rm)return '';
  var yF=96,yB=112,bl=Math.max(120,left-34),br=Math.min(F.vw-120,right+34);
  function shift(op){
    if(!op)return 0;
    var ang=Math.max(1,Math.min(75,Math.abs(+op.angle||45)));
    return Math.max(5,Math.min(34,(yB-yF)*Math.tan(ang*Math.PI/180)));
  }
  var ld=shift(lm),rd=shift(rm),lf=bl,lb=bl,rf=br,rb=br;
  if(lm){if((lm.side||'back')==='front')lb+=ld;else lf+=ld;}
  if(rm){if((rm.side||'back')==='front')rb-=rd;else rf-=rd;}
  return '<path d="M'+lf+' '+yF+' L'+rf+' '+yF+' L'+rb+' '+yB+' L'+lb+' '+yB+' Z" fill="none" stroke="#101828" stroke-width="1"/>'
    +shapeAnnText((bl+br)/2,yB+14,'Overhead View',{size:11,weight:700});
}

/* ---------- прямоугольные метки угла (чертёжная договорённость) ---------- */
function shapeAnnRightAngles(r,DP){
  var P=r.points,out='';
  for(var i=0;i<P.length;i++){
    var a=P[(i-1+P.length)%P.length],b=P[i],c=P[(i+1)%P.length];
    var v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]],l1=Math.hypot(v1[0],v1[1]),l2=Math.hypot(v2[0],v2[1]);
    if(l1<1e-6||l2<1e-6)continue;
    if(Math.abs((v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2))>.08)continue;
    var q=DP(b),qa=DP(a),qc=DP(c);
    var s1=[qa[0]-q[0],qa[1]-q[1]],s2=[qc[0]-q[0],qc[1]-q[1]],sl1=Math.hypot(s1[0],s1[1])||1,sl2=Math.hypot(s2[0],s2[1])||1,z=8;
    var u1=[s1[0]/sl1,s1[1]/sl1],u2=[s2[0]/sl2,s2[1]/sl2];
    var pA=[q[0]+u1[0]*z,q[1]+u1[1]*z],pB=[pA[0]+u2[0]*z,pA[1]+u2[1]*z],pC=[q[0]+u2[0]*z,q[1]+u2[1]*z];
    out+='<path d="M'+pA[0]+' '+pA[1]+' L'+pB[0]+' '+pB[1]+' L'+pC[0]+' '+pC[1]+'" fill="none" stroke="#101828" stroke-width=".7"/>';
  }
  return out;
}

/* ---------- цепочки размеров по сторонам ----------
   ЭТО ГЛАВНОЕ: каждая сторона разбивается на реальные производственные
   участки, и скошенный край получает свой размер, а не растворяется
   в общем габарите. Малые (≤2″) расхождения с огибающей выносятся
   отдельными размерами уклона; большие — это геометрия выреза. */
function shapeAnnChainItems(r,S,side){
  var idx=shapeAnnSideAxis(side)==='x'?0:1,out=[];
  shapeAnnChainSegments(r,S,side).forEach(function(e){
    var v=Math.abs(e.p2[idx]-e.p1[idx]);
    /* Ступенька верхнего левого угла, завалившаяся внутрь, укорачивает
       предыдущий горизонтальный участок — так размер читается в цеху. */
    var inf=shapeAnnExtraInfo(S,e.id);
    if(side==='top'&&inf&&inf.corner==='tl'&&inf.axis==='h'){
      var next=(r.geometry.edges||[]).filter(function(n){
        var ni=shapeAnnExtraInfo(S,n.id);
        return ni&&ni.corner==='tl'&&ni.axis==='v'&&shapeAnnEqP(n.p1,e.p2);
      })[0];
      if(next){var d=next.p2[0]-next.p1[0];if(d<0)v=Math.max(0,v+d);}
    }
    if(v>1/64)out.push({id:e.id,v:v});
  });
  return out;
}
function shapeAnnExtent(r,S,side,DP){
  var es=shapeAnnChainSegments(r,S,side),pts=[];
  es.forEach(function(e){pts.push(DP(e.p1),DP(e.p2));});
  if(!pts.length)return null;
  if(shapeAnnSideAxis(side)==='x'){var xs=pts.map(function(p){return p[0];});return {min:Math.min.apply(null,xs),max:Math.max.apply(null,xs)};}
  var ys=pts.map(function(p){return p[1];});return {min:Math.min.apply(null,ys),max:Math.max.apply(null,ys)};
}
function shapeAnnChains(r,S,DP,box){
  var out='';
  function hChain(side,y){
    var ex=shapeAnnExtent(r,S,side,DP);if(!ex)return;
    var items=shapeAnnChainItems(r,S,side),total=items.reduce(function(a,q){return a+q.v;},0);
    if(total<1e-9)return;
    var allX=r.points.map(function(p){return p[0];}),engMin=Math.min.apply(null,allX),engMax=Math.max.apply(null,allX);
    var sideXs=[];shapeAnnChainSegments(r,S,side).forEach(function(e){sideXs.push(e.p1[0],e.p2[0]);});
    var lp=Math.max(0,Math.min.apply(null,sideXs)-engMin),rp=Math.max(0,engMax-Math.max.apply(null,sideXs));
    var minSmall=22,cursor=ex.min,width=Math.max(1,ex.max-ex.min);
    if(lp>1/64&&lp<=2+1e-8){var g1=Math.max(ex.min-box.left,minSmall);out+=shapeAnnDimH(ex.min-g1,ex.min,y,shapeAnnDim(lp));}
    items.forEach(function(q,i){
      var w=(i===items.length-1)?(ex.max-cursor):width*q.v/total,nx=cursor+w;
      out+=shapeAnnDimH(cursor,nx,y,shapeAnnDim(q.v));cursor=nx;
    });
    if(rp>1/64&&rp<=2+1e-8){var g2=Math.max(box.right-ex.max,minSmall);out+=shapeAnnDimH(ex.max,ex.max+g2,y,shapeAnnDim(rp));}
  }
  function vChain(side,x){
    var ex=shapeAnnExtent(r,S,side,DP);if(!ex)return;
    var items=shapeAnnChainItems(r,S,side),total=items.reduce(function(a,q){return a+q.v;},0);
    if(total<1e-9)return;
    var allY=r.points.map(function(p){return p[1];}),engMin=Math.min.apply(null,allY),engMax=Math.max.apply(null,allY);
    var sideYs=[];shapeAnnChainSegments(r,S,side).forEach(function(e){sideYs.push(e.p1[1],e.p2[1]);});
    var bp=Math.max(0,Math.min.apply(null,sideYs)-engMin),tp=Math.max(0,engMax-Math.max.apply(null,sideYs));
    /* экранный Y перевёрнут: цепочка идёт снизу вверх */
    var minSmall=22,cursor=ex.max,height=Math.max(1,ex.max-ex.min);
    if(bp>1/64&&bp<=2+1e-8){var g1=Math.max(box.bottom-ex.max,minSmall);out+=shapeAnnDimV(x,ex.max,ex.max+g1,shapeAnnDim(bp));}
    items.forEach(function(q,i){
      var h=(i===items.length-1)?(cursor-ex.min):height*q.v/total,ny=cursor-h;
      out+=shapeAnnDimV(x,ny,cursor,shapeAnnDim(q.v));cursor=ny;
    });
    if(tp>1/64&&tp<=2+1e-8){var g2=Math.max(ex.min-box.top,minSmall);out+=shapeAnnDimV(x,ex.min-g2,ex.min,shapeAnnDim(tp));}
  }
  hChain('top',box.top-66);hChain('bottom',box.bottom+66);
  vChain('left',box.left-78);vChain('right',box.right+78);
  return out;
}

/* ---------- локальные выноски уклона ----------
   Чертёж ставит величину у того конца сегмента, чей уклон она описывает.
   При реальном локте нулевой «to» переносит выноску «past» на перелом. */
function shapeAnnCallouts(r,S,DP){
  var m=(S.shape&&S.shape.smart)||null;if(!m)return '';
  var out='';
  (r.edges||[]).forEach(function(g){
    var vert=shapeAnnAxis(S,g.id)==='v',sp=shapeAnnGroupPoints(g).map(DP);
    if(sp.length<2)return;
    function label(q,val){
      val=Math.abs(inch(val||'0'));if(val<1/64)return;
      out+=shapeAnnText(vert?q[0]+7:q[0],vert?q[1]-2:q[1]-6,shapeAnnDim(val),{size:8,anchor:vert?'start':'middle',weight:600});
    }
    /* Скос ребра нотча подписывается ВСЕГДА, в обоих режимах: у нотча нет
       локтя, но его уход от отвеса/уровня — такой же производственный размер,
       и без него внутренние скосы читались бы только по картинке. */
    var inf=shapeAnnExtraInfo(S,g.id);
    if(inf){
      var x=(m.extraEdges||{})[g.id]||{},ov=Math.abs(inch(x.out||'0'));
      if(ov>1/64){
        var mid=[(sp[0][0]+sp[sp.length-1][0])/2,(sp[0][1]+sp[sp.length-1][1])/2];
        var arrow=inf.axis==='v'?(x.dir==='right'?'→':x.dir==='left'?'←':''):(x.dir==='up'?'↑':x.dir==='down'?'↓':'');
        out+=shapeAnnText(inf.axis==='v'?mid[0]+9:mid[0],inf.axis==='v'?mid[1]:mid[1]-9,
          arrow+' '+shapeAnnDim(ov),{size:8,anchor:inf.axis==='v'?'start':'middle',weight:600,color:'#95430f'});
      }
      return;
    }
    if(m.elbowsOn){
      var E=(g.id==='A'||g.id==='B'||g.id==='C')?(m[g.id]||{}).elbow:null;
      if(!E)return;
      var h=Math.abs(inch(E.elbowLen||'0')),to=Math.abs(inch(E.to||'0')),past=Math.abs(inch(E.past||'0'));
      if(h>1e-9&&sp.length>=3){
        if(to>1/64)label(sp[0],E.to);
        if(past>1/64)label(to<1/64?sp[1]:sp[sp.length-1],E.past);
      }else if(past>1/64)label(sp[sp.length-1],E.past);
    }else{
      if(g.id!=='A'&&g.id!=='B'&&g.id!=='C')return;
      var v=Math.abs(inch((m[g.id]||{}).out||'0'));
      if(v>1/64)label(sp[sp.length-1],v);
    }
  });
  return out;
}

/* ---------- цвет физического ребра ----------
   Та же палитра, что в матрице Edge: опознание ребра идёт по цвету, поэтому
   на чертеже не нужны подписи «A · 48″» — размеры несут цепочки. */
var SHAPE_EDGE_HEX={A:'#2828dc',B:'#28b428',C:'#fe8d28',D:'#a00082',E:'#007d7d',F:'#7d0000',G:'#6b4cbc',H:'#916019',I:'#0074ad',J:'#a43e72',K:'#5c7a1f',L:'#a04040'};
function shapeEdgeColor(id){return SHAPE_EDGE_HEX[id]||'#555';}
/* Контур рёбрами, а не одним путём: каждое ребро своим цветом. */
function shapeAnnContour(r,DP,active){
  var out='';
  (r.geometry.edges||[]).forEach(function(e){
    var a=DP(e.p1),b=DP(e.p2),sel=active&&active===e.id;
    out+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+shapeEdgeColor(e.id)+'" stroke-width="'+(sel?4.6:1.3)+'"'+(sel?' stroke-linecap="square"':'')+'/>';
  });
  return out;
}

/* ---------- сборка ---------- */
function shapeAnnotationDefs(){
  return '<defs><marker id="shpArr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M7 1 L1 4 L7 7" fill="none" stroke="#101828" stroke-width=".75"/></marker></defs>';
}
/* Возвращает {contour, annotations, box} — контур считается по отображаемым
   точкам, чтобы усиленный уклон и его размеры совпадали друг с другом. */
function shapeAnnotationLayer(result,F,active){
  var S=result.line,DP=shapeAnnDisplay(result,S,F),disp=result.points.map(DP);
  var xs=disp.map(function(p){return p[0];}),ys=disp.map(function(p){return p[1];});
  var box={left:Math.min.apply(null,xs),right:Math.max.apply(null,xs),top:Math.min.apply(null,ys),bottom:Math.max.apply(null,ys)};
  var smart=S&&S.shape&&S.shape.type==='smart';
  var ann='';
  if(smart){
    ann+=shapeAnnRefLines(result,S,DP);
    ann+=shapeAnnChains(result,S,DP,box);
    ann+=shapeAnnCallouts(result,S,DP);
  }
  ann+=shapeAnnWitness(result,S,DP);
  ann+=shapeAnnRightAngles(result,DP);
  ann+=shapeAnnOverhead(result,F,box.left,box.right);
  /* Рёбер немного — рисуем цветной контур по рёбрам (как в Designer);
     у круга/многоугольника рёбер много, там цветная россыпь читается хуже. */
  var byEdge=((result.geometry.edges||[]).length<=12)?shapeAnnContour(result,DP,active):'';
  return {DP:DP,points:disp,box:box,annotations:ann,contour:byEdge,smart:smart,
    path:disp.map(function(p,i){return (i?'L ':'M ')+p[0]+' '+p[1];}).join(' ')+' Z'};
}
