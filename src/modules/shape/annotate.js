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
  try{return String(dimIn16(Math.abs(+v||0))).replace(/[″”"]/g,'').trim().replace(/^(\d+)\s+(\d+\/\d+)$/,'$1-$2');}
  catch(e){return String(v==null?'':v);}
}
function shapeAnnText(x,y,txt,o){
  o=o||{};var rot=o.rot?' transform="rotate('+o.rot+' '+x+' '+y+')"':'';
  return '<text x="'+x+'" y="'+y+'" text-anchor="'+(o.anchor||'middle')+'" font-size="'+(o.size||11)+'" fill="'+(o.color||'#101828')+'" font-family="Arial,sans-serif"'+(o.weight?' font-weight="'+o.weight+'"':'')+' stroke="#fff" stroke-width="'+(o.halo==null?3.2:o.halo)+'" stroke-linejoin="round" paint-order="stroke fill"'+rot+'>'+shapeXml(txt)+'</text>';
}
/* Экранное оформление дюймовых размеров. Смещение хранится отдельно от
   Shape definition и в машинные данные не попадает; в печать приходит только
   итоговая позиция, без кнопок интерфейса. */
function shapeAnnUiShift(opts,key){var n=opts&&opts.offsets?+(opts.offsets[key]||0):0;return Math.max(-4,Math.min(8,isFinite(n)?n:0))*8;}
function shapeAnnUiMenu(opts,key,cx,cy,F){
  if(!opts||!opts.interactive||opts.selectedKey!==key)return '';
  var x=Math.max(34,Math.min((F&&F.vw||960)-34,cx)),w=24,h=20,x0=x-w;
  return '<g class="shape-dim-menu shape-inch-primary-menu" onclick="event.stopPropagation()"><rect x="'+(x0-4)+'" y="'+(cy-h/2-4)+'" width="'+(w*2+8)+'" height="'+(h+8)+'" rx="7"/><g class="shape-dim-btn" onclick="event.stopPropagation();shapeNudgeMetricLabel(\''+shapeXml(key)+'\',-1)"><rect x="'+x0+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" rx="4"/><text x="'+(x0+w/2)+'" y="'+(cy+4)+'" text-anchor="middle">−</text></g><g class="shape-dim-btn" onclick="event.stopPropagation();shapeNudgeMetricLabel(\''+shapeXml(key)+'\',1)"><rect x="'+(x0+w)+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" rx="4"/><text x="'+(x0+w+w/2)+'" y="'+(cy+4)+'" text-anchor="middle">+</text></g></g>';
}
function shapeAnnUiWrap(opts,key,body,cx,cy,F){
  if(!opts||!opts.interactive)return body;
  return '<g class="shape-inch-primary-movable'+(opts.selectedKey===key?' active':'')+'" data-inch-primary-key="'+shapeXml(key)+'" onclick="event.stopPropagation();shapeSelectMetricLabel(\''+shapeXml(key)+'\')"><title>Move inch dimension · − / +</title>'+body+'</g>'+shapeAnnUiMenu(opts,key,cx,cy,F);
}
/* ---------- раскладка подписей без наложений ----------
   Подпись рисуется с белой обводкой, поэтому наложение не «сливается», а
   ЗАТИРАЕТ то, что под ним: соседнее число пропадает целиком, и на чертеже
   вместо двух размеров остаётся один. Держим список занятых прямоугольников и
   отодвигаем новую подпись по заданному направлению, пока не найдётся место.
   Направление всегда «наружу от фигуры», чтобы подпись не уезжала на геометрию. */
var SS_ANN_BOXES=[];
function shapeAnnResetBoxes(){SS_ANN_BOXES=[];}
/* Место занимают не только подписи, но и САМ КОНТУР. Пока реестр знал лишь про
   соседние числа, подпись честно обходила их — и садилась на линию или
   прижималась к углу. Засеваем реестр точками контура, и раскладка обходит
   геометрию сама, без отдельных правил на каждый случай. */
function shapeAnnSeedContour(pts){
  for(var i=0;i<pts.length;i++){
    var a=pts[i],b=pts[(i+1)%pts.length],
        L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/14));
    for(var k=0;k<=n;k++){
      var t=k/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
      SS_ANN_BOXES.push({x1:x-5,y1:y-5,x2:x+5,y2:y+5,c:1});
    }
  }
}
function shapeAnnBoxOf(x,y,txt,o){
  var size=o.size||11,w=String(txt).length*size*.62,h=size*1.15;
  if(o.rot){var q=w;w=h;h=q;}
  var ax=o.anchor==='start'?0:(o.anchor==='end'?-w:-w/2);
  return {x1:x+ax-1.5,y1:y-h,x2:x+ax+w+1.5,y2:y+3};
}
function shapeAnnFree(b,skipContour){
  for(var i=0;i<SS_ANN_BOXES.length;i++){var o=SS_ANN_BOXES[i];
    if(skipContour&&o.c)continue;
    if(b.x1<o.x2&&b.x2>o.x1&&b.y1<o.y2&&b.y2>o.y1)return false;}
  return true;
}
function shapeAnnPlace(x,y,txt,o,step){
  o=o||{};step=step||[0,-1];
  var d=(o.size||11)+2;
  for(var k=0;k<16;k++){
    var px=x+step[0]*k*d,py=y+step[1]*k*d,b=shapeAnnBoxOf(px,py,txt,o);
    if(shapeAnnFree(b)){SS_ANN_BOXES.push(b);return shapeAnnText(px,py,txt,o);}
  }
  return shapeAnnText(x,y,txt,o);
}
/* Выноска уклона — единый блок из двух строк: величина и под ней угол. Место
   ищется сразу под обе, иначе угол уезжал от своего числа и приклеивался
   к чужому. */
function shapeAnnPlace2(x,y,l1,l2,o,step){
  o=o||{};step=step||[0,-1];
  var d=(o.size||11)+2,gap=(o.size||11)+6;
  /* Блок из двух строк растёт ВНИЗ. Вынесенный вверх, он возвращался бы к линии
     нижней строкой — угол ложился на контур. Сдвигаем блок целиком, чтобы
     наружу уходил он весь, а не только первая строка. */
  if(l2&&step[1]<0)y-=gap;
  /* Выноска уклона стоит в СВОЁМ зазоре, и контур ей не помеха: зазор им и
     ограничен. Узкий зазор подпись не вмещает — реестр выталкивал её за пунктир,
     и число уходило от того места, которое описывает. Поэтому контур для неё
     прозрачен, а отодвигают её только другие числа. */
  var skip=!!o.overContour;
  for(var k=0;k<16;k++){
    var px=x+step[0]*k*d,py=y+step[1]*k*d,
        b1=shapeAnnBoxOf(px,py,l1,o),b2=l2?shapeAnnBoxOf(px,py+gap,l2,o):null;
    if(shapeAnnFree(b1,skip)&&(!b2||shapeAnnFree(b2,skip))){
      SS_ANN_BOXES.push(b1);if(b2)SS_ANN_BOXES.push(b2);
      return shapeAnnText(px,py,l1,o)+(l2?shapeAnnText(px,py+gap,l2,o):'');
    }
  }
  return shapeAnnText(x,y,l1,o)+(l2?shapeAnnText(x,y+gap,l2,o):'');
}
/* Стоп-рыска на концах — то же оформление, что у размеров Cutout: видно, до
   какой ТОЧКИ размер, а не примерно куда смотрит остриё. Smart-Shape рисует свои
   цепочки здесь, поэтому без этих двух засечек он оставался со старыми
   «голыми» стрелками, когда весь остальной лист уже перешёл на новые. */
function shapeAnnTickH(x,y){return '<line x1="'+x+'" y1="'+(y-5)+'" x2="'+x+'" y2="'+(y+5)+'" stroke="#101828" stroke-width="1"/>';}
function shapeAnnTickV(x,y){return '<line x1="'+(x-5)+'" y1="'+y+'" x2="'+(x+5)+'" y2="'+y+'" stroke="#101828" stroke-width="1"/>';}
function shapeAnnDimH(x1,x2,y,label){
  if(Math.abs(x2-x1)<0.5)return '';
  return '<line x1="'+x1+'" y1="'+y+'" x2="'+x2+'" y2="'+y+'" stroke="#101828" stroke-width="1" marker-start="url(#shpArr)" marker-end="url(#shpArr)"/>'+shapeAnnTickH(x1,y)+shapeAnnTickH(x2,y)+shapeAnnPlace((x1+x2)/2,y-8,label,{size:14,weight:700},[0,-1]);
}
function shapeAnnDimV(x,y1,y2,label){
  if(Math.abs(y2-y1)<0.5)return '';
  var cy=(y1+y2)/2;
  return '<line x1="'+x+'" y1="'+y1+'" x2="'+x+'" y2="'+y2+'" stroke="#101828" stroke-width="1" marker-start="url(#shpArr)" marker-end="url(#shpArr)"/>'+shapeAnnTickV(x,y1)+shapeAnnTickV(x,y2)+shapeAnnPlace(x-10,cy,label,{size:14,weight:700,rot:-90},[-1,0]);
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
    /* D обнуляется наравне с остальными: её излом — такое же отклонение от
       уровня. Длина излома НЕ трогается, иначе у нейтрального контура пропало бы
       звено и сегменты перестали бы сходиться с реальным один в один. */
    ['A','B','C','D'].forEach(function(e){
      m[e].out='0';m[e].dir=null;
      m[e].elbow.to='0';m[e].elbow.past='0';
    });
    /* База обязана быть ОРТОГОНАЛЬНОЙ, иначе усиление считается от кривой
       отсчёта. C нельзя просто приравнять к A: вертикальные рёбра угловых
       лесенок тоже входят в полную высоту стороны. Например, A=36, нижний
       правый notch=1 и C=35 дают настоящий ровный верх 36; база с C=36
       поднимала правую вершину до 37 и сама рисовала ложный скос.

       Поэтому после обнуления скосов длина C выводится из баланса вертикальных
       рёбер: A + TL + BL = C + TR + BR. Координаты углов и скосы рёбер нотча
       обнуляются, но их длины и состав сохраняются — топология не меняется. */
    ['tl','tr','br','bl'].forEach(function(k){
      var c=m.cornerOffsets[k];if(!c)return;
      c.plumb='0';c.plumbDir=null;c.level='0';c.levelDir=null;
    });
    Object.keys(m.extraEdges).forEach(function(k){
      m.extraEdges[k].out='0';m.extraEdges[k].dir=null;
    });
    var N={w:S.w,h:S.h,shape:{type:'smart',smart:m}},cv={};
    ['tl','tr','br','bl'].forEach(function(k){cv[k]=ssCornerTotals(N,k).v;});
    var levelC=ssEdgeLen(N,'A')+cv.tl+cv.bl-cv.tr-cv.br;
    /* Если ортогональная C выродилась бы в ноль, оставляем исходную C: такая
       экстремальная форма уже имеет крупный видимый уклон и усиление ей не
       требуется. Главное — не терять сегмент и соответствие вершин. */
    if(levelC>1e-9)m.C.len=String(Math.round(levelC*1e9)/1e9);
    var q=ssContour(N);
    if(!q||q.pts.length<3)return null;
    return {points:q.pts,edges:q.segs.map(function(e,i){
      return {id:e.id,segmentId:e.id+':'+i,p1:e.p1.slice(),p2:e.p2.slice(),length:Math.hypot(e.p2[0]-e.p1[0],e.p2[1]-e.p1[1])};
    })};
  }catch(e){return null;}
}

/* ---------- усиление отклонения ----------
   Малый уклон растягивается до различимой величины, настоящий — остаётся собой.
   Рёбра угловых блоков поднимаются слабее (0.55), иначе короткая ступенька
   визуально забивает основной уклон стороны.

   Величина приходит в ПИКСЕЛЯХ, уже умноженная на масштаб чертежа. Прежняя
   формула не усиливала, а подменяла: результат не зависел от входа и упирался
   в потолок 46 px. При ширине чертежа ~660 px перепад верха в 40″ — это 660 px,
   и он рисовался как 46. Клин 50 → 10 выходил почти прямоугольником, а размерные
   линии ставились по искажённой форме и налезали друг на друга.

   Правило простое: показанное отклонение НИКОГДА не меньше настоящего. */
function shapeAnnMag(v,damp){
  var a=Math.abs(v);if(a<.12)return 0;
  var sg=v<0?-1:1,d=(damp==null?1:damp);
  var minVisible=Math.min(46,20+0.2*a)*d;
  return sg*Math.max(a,minVisible);
}
/* Возвращает функцию DP: точка инженерная → точка экранная (с усилением). */
function shapeAnnDisplay(r,S,F){
  var ident=function(p){return [F.X(p[0]),F.Y(p[1])];};
  var N=shapeAnnNeutralGeometry(S);
  if(!N)return ident;
  var AE=r.geometry.edges||[],NE=N.edges||[],map={},k;

  /* Отображение ПО ВЕРШИНАМ: каждая точка сдвигается от своего места на
     нейтральном контуре на усиленное отклонение. Многоугольник замыкается сам
     собой, невязки не возникает.

     Прежний путь складывал усиленные ВЕКТОРА рёбер, они не сходились, и всю
     накопленную невязку сваливали в верхнюю сторону. Уклон низа в 13/16
     раздувался до двух десятков пикселей, эта разница падала в верх, чей
     собственный перепад был всего 1-3/16 — и знак переворачивался: на чертеже
     верх задирался вправо, хотя в изделии и в DXF он опускался. */
  if(N.points.length===r.points.length&&r.points.length){
    for(var z=0;z<r.points.length;z++){
      var pa=r.points[z],pn=N.points[z],nx=F.X(pn[0]),ny=F.Y(pn[1]);
      map[pa[0].toFixed(8)+','+pa[1].toFixed(8)]=[nx+shapeAnnMag(F.X(pa[0])-nx),ny+shapeAnnMag(F.Y(pa[1])-ny)];
    }
  }else if(NE.length===AE.length&&AE.length){
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

/* ---------- прямоугольные метки угла (чертёжная договорённость) ----------
   Метка ставится ТОЛЬКО там, где угол действительно прямой, и только если в
   фигуре есть хоть один непрямой. На чистом прямоугольнике четыре квадратика —
   шум: отмечать нечего, когда прямое всё. Смысл метки в том, чтобы среди
   скошенных углов показать те, что остались точными.

   Допуск фактически нулевой. Метка утверждает «этот угол прямой», и уход даже
   в 1/16″ делает утверждение ложным: угол уже не прямой, а на увеличенном
   чертеже это ещё и видно. Прежние 0.08 объявляли прямым угол в 85°, а 0.02 —
   угол в 89.28°. Настоящие прямые углы дают косинус ровно 0, поэтому 1e-6
   отсекает всё скошенное и ничего не теряет на дробях дюйма. */
function shapeAnnRightAngles(r,DP){
  var P=r.points,out='',square=[],skewed=0;
  for(var i=0;i<P.length;i++){
    var a=P[(i-1+P.length)%P.length],b=P[i],c=P[(i+1)%P.length];
    var v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]],l1=Math.hypot(v1[0],v1[1]),l2=Math.hypot(v2[0],v2[1]);
    if(l1<1e-6||l2<1e-6)continue;
    if(Math.abs((v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2))>1e-6){skewed++;continue;}
    square.push([a,b,c]);
  }
  if(!skewed)return '';
  square.forEach(function(t){
    var a=t[0],b=t[1],c=t[2],q=DP(b),qa=DP(a),qc=DP(c);
    var s1=[qa[0]-q[0],qa[1]-q[1]],s2=[qc[0]-q[0],qc[1]-q[1]],sl1=Math.hypot(s1[0],s1[1])||1,sl2=Math.hypot(s2[0],s2[1])||1,z=8;
    var u1=[s1[0]/sl1,s1[1]/sl1],u2=[s2[0]/sl2,s2[1]/sl2];
    var pA=[q[0]+u1[0]*z,q[1]+u1[1]*z],pB=[pA[0]+u2[0]*z,pA[1]+u2[1]*z],pC=[q[0]+u2[0]*z,q[1]+u2[1]*z];
    out+='<path d="M'+pA[0]+' '+pA[1]+' L'+pB[0]+' '+pB[1]+' L'+pC[0]+' '+pC[1]+'" fill="none" stroke="#101828" stroke-width=".7"/>';
  });
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
function shapeAnnChains(r,S,DP,box,opts,F){
  var out='';
  function hChain(side,y){
    var ex=shapeAnnExtent(r,S,side,DP);if(!ex)return;
    var key='inch:chain:'+side,dir=side==='top'?-1:1;y+=dir*shapeAnnUiShift(opts,key);var chain='';
    var items=shapeAnnChainItems(r,S,side),total=items.reduce(function(a,q){return a+q.v;},0);
    if(total<1e-9)return;
    var allX=r.points.map(function(p){return p[0];}),engMin=Math.min.apply(null,allX),engMax=Math.max.apply(null,allX);
    var sideXs=[];shapeAnnChainSegments(r,S,side).forEach(function(e){sideXs.push(e.p1[0],e.p2[0]);});
    var lp=Math.max(0,Math.min.apply(null,sideXs)-engMin),rp=Math.max(0,engMax-Math.max.apply(null,sideXs));
    var minSmall=22,cursor=ex.min,width=Math.max(1,ex.max-ex.min);
    if(lp>1/64&&lp<=2+1e-8){var g1=Math.max(ex.min-box.left,minSmall);chain+=shapeAnnDimH(ex.min-g1,ex.min,y,shapeAnnDim(lp));}
    items.forEach(function(q,i){
      var w=(i===items.length-1)?(ex.max-cursor):width*q.v/total,nx=cursor+w;
      chain+=shapeAnnDimH(cursor,nx,y,shapeAnnDim(q.v));cursor=nx;
    });
    if(rp>1/64&&rp<=2+1e-8){var g2=Math.max(box.right-ex.max,minSmall);chain+=shapeAnnDimH(ex.max,ex.max+g2,y,shapeAnnDim(rp));}
    out+=shapeAnnUiWrap(opts,key,chain,(ex.min+ex.max)/2,y+dir*30,F);
  }
  function vChain(side,x){
    var ex=shapeAnnExtent(r,S,side,DP);if(!ex)return;
    var key='inch:chain:'+side,dir=side==='left'?-1:1;x+=dir*shapeAnnUiShift(opts,key);var chain='';
    var items=shapeAnnChainItems(r,S,side),total=items.reduce(function(a,q){return a+q.v;},0);
    if(total<1e-9)return;
    var allY=r.points.map(function(p){return p[1];}),engMin=Math.min.apply(null,allY),engMax=Math.max.apply(null,allY);
    var sideYs=[];shapeAnnChainSegments(r,S,side).forEach(function(e){sideYs.push(e.p1[1],e.p2[1]);});
    var bp=Math.max(0,Math.min.apply(null,sideYs)-engMin),tp=Math.max(0,engMax-Math.max.apply(null,sideYs));
    /* экранный Y перевёрнут: цепочка идёт снизу вверх */
    var minSmall=22,cursor=ex.max,height=Math.max(1,ex.max-ex.min);
    if(bp>1/64&&bp<=2+1e-8){var g1=Math.max(box.bottom-ex.max,minSmall);chain+=shapeAnnDimV(x,ex.max,ex.max+g1,shapeAnnDim(bp));}
    items.forEach(function(q,i){
      var h=(i===items.length-1)?(cursor-ex.min):height*q.v/total,ny=cursor-h;
      chain+=shapeAnnDimV(x,ny,cursor,shapeAnnDim(q.v));cursor=ny;
    });
    if(tp>1/64&&tp<=2+1e-8){var g2=Math.max(ex.min-box.top,minSmall);chain+=shapeAnnDimV(x,ex.min-g2,ex.min,shapeAnnDim(tp));}
    out+=shapeAnnUiWrap(opts,key,chain,x+dir*62,(ex.min+ex.max)/2,F);
  }
  /* На печатном листе цепочки стоят ближе к детали: поле там одно, и пустые
     поля вокруг фигуры съедают её размер. На экране расстояния прежние. */
  var near=(opts&&opts.tight)?.5:1;
  hChain('top',box.top-66*near);hChain('bottom',box.bottom+66*near);
  vChain('left',box.left-78*near);vChain('right',box.right+78*near);
  return out;
}

/* ---------- локальные выноски уклона ----------
   У КАЖДОГО скошенного участка своя подпись: величина ухода, под ней угол.

   Угол считается по СОБСТВЕННОМУ пробегу участка. У стороны свои две точки, и
   всё, что откусили нотч или наклон соседней стороны, её пробег уменьшает:
   верх шириной 48 при нотче 10 и отвесе 4 имеет пробег 34, и угол берётся от
   него, а не от габарита. Считаем по ИНЖЕНЕРНЫМ координатам — на экранных угол
   вышел бы от усиленной картинки, а не от изделия.

   Раньше выноски строились по полям модели, поэтому верхняя сторона D не
   получала подписи вообще: у неё нет своих полей ввода. Теперь источник —
   геометрия, и подписывается всё нарисованное, включая D и рёбра нотча. */
function shapeAnnSkewOf(p1,p2,vert){
  var run=Math.abs(vert?(p2[1]-p1[1]):(p2[0]-p1[0])),
      off=Math.abs(vert?(p2[0]-p1[0]):(p2[1]-p1[1]));
  return {off:off,run:run,deg:run>1e-9?Math.atan2(off,run)*180/Math.PI:0};
}
function shapeAnnCallouts(r,S,DP,opts,F){
  var out='';
  (r.edges||[]).forEach(function(g){
    if(!g.segments||!g.segments.length)return;
    var side=shapeAnnSide(S,g.id);if(!side)return;
    var vert=shapeAnnAxis(S,g.id)==='v',sp=shapeAnnGroupPoints(g).map(DP);
    if(sp.length<2)return;
    /* База стороны — её внешняя огибающая, ровно та же линия, что рисует пунктир. */
    var ax=vert?0:1,
        ref=(side==='left'||side==='top')
          ? Math.min.apply(null,sp.map(function(q){return q[ax];}))
          : Math.max.apply(null,sp.map(function(q){return q[ax];}));
    g.segments.forEach(function(sg,si){
      var k=shapeAnnSkewOf(sg.p1,sg.p2,vert);
      if(!(k.off>1/64))return;
      /* Подпись садится на СЕРЕДИНУ своего участка и выносится наружу. У конца
         она наезжала на вершину и на соседние размеры — особенно на крутом
         скосе, где оба конца заняты. Середина принадлежит только этому участку,
         поэтому и читается однозначно, к какому ребру относится число. */
      /* Подпись садится в ЦЕНТР ЗАЗОРА между пунктирной базой и ребром, на
         уровне того КОНЦА, где зазор шире всего. Это и есть место, где уход
         физически виден: между отвесом/уровнем и стеклом.
         Ни центр линии, ни сам конец не подходят — по центру число повисает
         вдоль ребра, у конца садится на угол. Если зазор узкий, подпись
         отодвинет реестр: он знает про контур и не даст сесть на линию. */
      var d1=DP(sg.p1),d2=DP(sg.p2),
          far=Math.abs(d1[ax]-ref)>=Math.abs(d2[ax]-ref)?d1:d2,
          gap=ref-far[ax],sg0=gap<0?-1:1,
          x=ax===0?(ref+far[0])/2:far[0],
          y=ax===0?far[1]:(ref+far[1])/2,
          anchor='middle',step=ax===0?[sg0,0]:[0,sg0];
      /* Угол печатается, только когда его есть смысл читать: при долях градуса
         скобки — шум, эталон их тоже не ставит. */
      var key='inch:callout:'+g.id+':'+si,shift=shapeAnnUiShift(opts,key);x+=step[0]*shift;y+=step[1]*shift;
      var body=shapeAnnPlace2(x,y,shapeAnnDim(k.off),k.deg>=2?'('+k.deg.toFixed(1)+'°)':'',
        {size:13,anchor:anchor,weight:600,overContour:true},step);
      out+=shapeAnnUiWrap(opts,key,body,x+step[0]*32,y+step[1]*32,F);
    });
  });
  return out;
}

/* ---------- цвет физического ребра ----------
   Та же палитра, что в матрице Edge: опознание ребра идёт по цвету, поэтому
   на чертеже не нужны подписи «A · 48″» — размеры несут цепочки. */
var SHAPE_EDGE_HEX={A:'#2828dc',B:'#28b428',C:'#fe8d28',D:'#a00082',E:'#007d7d',F:'#7d0000',G:'#6b4cbc',H:'#916019',I:'#0074ad',J:'#a43e72',K:'#5c7a1f',L:'#a04040'};
function shapeEdgeColor(id){return SHAPE_EDGE_HEX[id]||'#555';}
/* Контур рёбрами, а не одним путём: каждое ребро своим цветом. */
function shapeAnnContour(r,DP,active,mono){
  var edges=r.geometry.edges||[],out='';
  /* Цех печатает чёрно-белым, и цвет ребра там пропадает: все стороны
     становятся одинаковыми серыми линиями. Поэтому на печатном варианте
     сторону называет БУКВА рядом с ней, а не цвет. На экране цвет остаётся —
     он там работает. */
  var cx=0,cy=0,n=0;
  edges.forEach(function(e){var a=DP(e.p1),b=DP(e.p2);cx+=a[0]+b[0];cy+=a[1]+b[1];n+=2;});
  if(n){cx/=n;cy/=n;}
  var seen={};
  edges.forEach(function(e){
    var a=DP(e.p1),b=DP(e.p2),sel=active&&active===e.id;
    var col=mono?'#101828':shapeEdgeColor(e.id),w=mono?(sel?4.6:1.9):(sel?4.6:1.3);
    out+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="'+col+'" stroke-width="'+w+'"'+(sel?' stroke-linecap="square"':'')+'/>';
    if(!mono||seen[e.id])return;
    seen[e.id]=1;
    /* Буква садится на середину ребра и отодвигается ВНУТРЬ детали: снаружи
       уже стоят размерные цепочки и подписи обработки. */
    var mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=cx-mx,dy=cy-my,d=Math.hypot(dx,dy)||1;
    var lx=mx+dx/d*16,ly=my+dy/d*16;
    out+='<text class="shape-edge-letter" x="'+lx.toFixed(1)+'" y="'+(ly+4).toFixed(1)+'" text-anchor="middle" font-size="13" font-weight="700" fill="#101828" stroke="#fff" stroke-width="3.5" paint-order="stroke fill">'+shapeXml(e.id)+'</text>';
  });
  return out;
}

/* ---------- сборка ---------- */
function shapeAnnotationDefs(){
  return '<defs><marker id="shpArr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="#101828" stroke-width=".75"/></marker></defs>';
}
/* Возвращает {contour, annotations, box} — контур считается по отображаемым
   точкам, чтобы усиленный уклон и его размеры совпадали друг с другом. */
function shapeAnnotationLayer(result,F,active,opts){
  var S=result.line,DP=shapeAnnDisplay(result,S,F),disp=result.points.map(DP);
  var xs=disp.map(function(p){return p[0];}),ys=disp.map(function(p){return p[1];});
  var box={left:Math.min.apply(null,xs),right:Math.max.apply(null,xs),top:Math.min.apply(null,ys),bottom:Math.max.apply(null,ys)};
  var smart=S&&S.shape&&S.shape.type==='smart';
  /* Реестр занятых мест живёт ровно один чертёж: иначе второй чертёж считал бы
     занятыми места первого и разгонял бы подписи в пустоту. Контур засевается
     сразу, чтобы ни одна подпись не села на линию. */
  shapeAnnResetBoxes();shapeAnnSeedContour(disp);
  var ann='';
  if(smart){
    ann+=shapeAnnRefLines(result,S,DP);
    ann+=shapeAnnChains(result,S,DP,box,opts,F);
    ann+=shapeAnnCallouts(result,S,DP,opts,F);
  }
  ann+=shapeAnnWitness(result,S,DP);
  ann+=shapeAnnRightAngles(result,DP);
  ann+=shapeAnnOverhead(result,F,box.left,box.right);
  /* Рёбер немного — рисуем цветной контур по рёбрам (как в Designer);
     у круга/многоугольника рёбер много, там цветная россыпь читается хуже. */
  var byEdge=((result.geometry.edges||[]).length<=12)?shapeAnnContour(result,DP,active,!!(opts&&opts.mono)):'';
  return {DP:DP,points:disp,box:box,annotations:ann,contour:byEdge,smart:smart,
    path:disp.map(function(p,i){return (i?'L ':'M ')+p[0]+' '+p[1];}).join(' ')+' Z'};
}
