/* =====================================================================
   shape/contour  ·  v4.5-port
   Построение единого замкнутого контура: рёбра A/B/C, AUTO-D, лесенки углов.
   IN : нормализованная модель + W/H
   OUT: {pts, segs, base, sides}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

/* Длина ребра — это длина САМОГО ребра, а угловая лесенка идёт СВЕРХ неё.
   Ввели C = 60 — правая сторона ровно 60, стояк нотча добавляется ниже, и
   сторона целиком выходит длиннее. Так устроен Smart-Shape: там E = 60 это
   правая сторона, а нотч C = 5 и D = 8 сидят под ней отдельными рёбрами.

   Внутри контур по-прежнему строится от габарита и потом подрезается
   лесенками, поэтому здесь длина раздувается ровно на то, что лесенки съедят,
   а уход умножается на то же отношение. Иначе введённые 7/8 размазывались по
   укороченному отрезку и печатались на чертеже как 13/16. */
function ssEdgeEaten(S,e){
  if(e==='A')return {pre:ssCornerTotals(S,'bl').v,post:ssCornerTotals(S,'tl').v};
  if(e==='C')return {pre:ssCornerTotals(S,'br').v,post:ssCornerTotals(S,'tr').v};
  if(e==='B')return {pre:ssCornerTotals(S,'bl').h,post:ssCornerTotals(S,'br').h};
  return {pre:0,post:0};
}
function ssEdgeLocal(S,e){
  var m=ssModel(S),s=m[e],vert=(e==='A'||e==='C'),L=ssEdgeLen(S,e),
      eat=ssEdgeEaten(S,e),Lf=L+eat.pre+eat.post,k=L>1e-9?Lf/L:1;
  if(!m.elbowsOn){
    var o=ssNN(s.out)*k;
    if(vert)return [[0,0],[s.dir==='right'?o:s.dir==='left'?-o:0,Lf]];
    return [[0,0],[Lf,s.dir==='up'?o:s.dir==='down'?-o:0]];
  }
  /* Излом отсчитывается от начала САМОГО ребра, поэтому его положение сдвигается
     на то, что лесенка съела в начале. */
  var E=s.elbow,to=ssNN(E.to)*k,past=ssNN(E.past)*k,
      h=Math.min(ssNN(E.elbowLen),L)+eat.pre,M=ssMode(E.mode)||{s1:0,s2:0};
  var o1=M.s1*to,o2=o1+M.s2*past,coll=(h<=eat.pre+1e-9||h>=Lf-1e-9);
  if(vert)return coll?[[0,0],[o2,Lf]]:[[0,0],[o1,h],[o2,Lf]];
  return coll?[[0,0],[Lf,o2]]:[[0,0],[h,o1],[Lf,o2]];
}
function ssPathLen(P){var t=0;for(var i=1;i<P.length;i++)t+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);return t;}
/* Верхняя сторона D замыкает контур, поэтому её концы НЕ свободны: начало —
   верх A, конец — верх C. Отсюда длина и полный уход по вертикали выводятся и
   вводу не подлежат. Свободна только форма МЕЖДУ концами — излом.
   Задаются положение излома (elbowLen вдоль пробега) и уход первого отрезка от
   УРОВНЯ (to); уход второго получается сам, как остаток до конечной точки.
   Ровно так это устроено в Smart-Shape: у D серой была только Length. */
function ssTopPath(S,AT,CT){
  var m=ssModel(S),s=m.D;
  if(!m.elbowsOn||!s)return [AT,CT];
  var E=s.elbow||{},h=ssNN(E.elbowLen),to=ssNN(E.to),M=ssMode(E.mode),run=CT[0]-AT[0],span=Math.abs(run);
  /* Излом нулевой длины, во всю сторону или без выбранной формы — это прямая
     сторона, а не ошибка: так же ведут себя A/B/C. */
  if(!(h>1e-9)||h>=span-1e-9||!M)return [AT,CT];
  return [AT,[AT[0]+(run>=0?1:-1)*h,AT[1]+M.s1*to],CT];
}
function ssOff(P,o){return P.map(function(p){return [p[0]+o[0],p[1]+o[1]];});}
function ssCornerMorph(P,a,b){
  if(P.length<2)return P.slice();
  var run=[0],total=0;for(var i=1;i<P.length;i++){total+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);run.push(total);}
  return P.map(function(p,j){var t=total?run[j]/total:j/(P.length-1);return [p[0]+a[0]+(b[0]-a[0])*t,p[1]+a[1]+(b[1]-a[1])*t];});
}
function ssBase(S){
  var dBL=ssCornerDelta(S,'bl'),dTL=ssCornerDelta(S,'tl'),dBR=ssCornerDelta(S,'br'),dTR=ssCornerDelta(S,'tr'),
      A0=ssEdgeLocal(S,'A'),B0=ssEdgeLocal(S,'B'),BR0=B0[B0.length-1],C0=ssOff(ssEdgeLocal(S,'C'),BR0),BL=[dBL[0],dBL[1]],
      Ap=ssCornerMorph(A0,dBL,dTL),AT=Ap[Ap.length-1],
      Bp=ssCornerMorph(B0,dBL,dBR),BR=Bp[Bp.length-1],
      Cp=ssCornerMorph(C0,dBR,dTR),CT=Cp[Cp.length-1];
  /* Верхняя сторона идёт от ВЕРХА лесенки, а не от угла габарита.
     Раньше D строилась хордой AT→CT, а лесенку нотча потом принудительно
     сажали на эту хорду. Хорда за ширину нотча успевала опуститься, и ровно на
     столько молча укорачивался введённый стояк: 12 превращалось в 9-1/2, левая
     сторона переставала складываться в заданную высоту, а контур уходил в резку
     коротким. В Smart-Shape верх начинается от верха стояка — делаем так же,
     и тогда пробег и угол верха совпадают с эталоном. */
  var Ttl=ssCornerTotals(S,'tl'),Ttr=ssCornerTotals(S,'tr'),
      dD0=(CT[0]-AT[0])>=0?1:-1,
      /* Начало лесенки — реальный конец подрезанной стороны: при уклоне A/C он
         смещён по X, и брать вершину габарита нельзя. */
      aT=ssPointAt(Ap,1,AT[1]-Ttl.v),cT=ssPointAt(Cp,1,CT[1]-Ttr.v),
      DL=[aT[0]+dD0*Ttl.h,aT[1]+Ttl.v],
      DR=[cT[0]-dD0*Ttr.h,cT[1]+Ttr.v],
      Dp=ssTopPath(S,DL,DR);
  /* Dlen / Dout / DdirY описывают сторону в целом и считаются по её СОБСТВЕННЫМ
     концам: излом внутри не меняет ни пробег, ни полный уход. Dtrue — истинная
     длина ломаной, по всем звеньям, иначе излом терялся бы в отчётах. */
  return {BL:BL,AT:AT,BR:BR,CT:CT,Ap:Ap,Bp:Bp,Cp:Cp,Dp:Dp,DL:DL,DR:DR,
    Dlen:Math.abs(DR[0]-DL[0]),Dsigned:DR[0]-DL[0],Dout:Math.abs(DR[1]-DL[1]),
    Dtrue:ssPathLen(Dp),
    DdirY:(DR[1]-DL[1])>1e-9?'up':(DR[1]-DL[1])<-1e-9?'down':null,
    /* Уход второго отрезка излома — выводимая величина, её показывает матрица
       рёбер в ячейке «Outage past elbow» для D. */
    DpastOut:Dp.length>2?Math.abs(DR[1]-Dp[1][1]):Math.abs(DR[1]-DL[1])};
}
function ssPointAt(P,ax,val){
  for(var i=0;i<P.length-1;i++){
    var a=P[i],b=P[i+1],lo=Math.min(a[ax],b[ax]),hi=Math.max(a[ax],b[ax]);
    if(val>=lo-1e-9&&val<=hi+1e-9){
      var t=(b[ax]-a[ax])===0?0:(val-a[ax])/(b[ax]-a[ax]);
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    }
  }
  var f=P[0],l=P[P.length-1];
  return Math.abs(val-f[ax])<Math.abs(val-l[ax])?[f[0],f[1]]:[l[0],l[1]];
}
function ssSpan(P,ax,from,to){
  var p0=ssPointAt(P,ax,from),p1=ssPointAt(P,ax,to),lo=Math.min(from,to)+1e-9,hi=Math.max(from,to)-1e-9;
  var mids=P.filter(function(p){return p[ax]>lo&&p[ax]<hi;}).slice();
  mids.sort(function(a,b){return from<to?a[ax]-b[ax]:b[ax]-a[ax];});
  return [p0].concat(mids,[p1]);
}
var SS_CG={tl:{h:[1,0],v:[0,-1],rev:false},tr:{h:[-1,0],v:[0,-1],rev:true},
           br:{h:[-1,0],v:[0,1],rev:false},bl:{h:[1,0],v:[0,1],rev:true}};
function ssStairs(S,corner,vertex,pVert,pHoriz){
  var T=ssCornerTotals(S,corner);
  if(!T.vals.length)return [];
  var g=SS_CG[corner];
  /* Начало лесенки — РЕАЛЬНЫЙ конец подрезанной стороны, а не вершина габарита.
     Если сторона A/B/C имеет уклон, её конец смещён, и привязка к вершине
     съедала это смещение первым ребром нотча (ребро 10″ становилось 10-7/64″). */
  function P(dx,dy){return [pVert[0]+g.h[0]*dx+g.v[0]*(dy-T.v),pVert[1]+g.h[1]*dx+g.v[1]*(dy-T.v)];}
  /* Каждое ребро нотча идёт не строго по оси: горизонтальное добавляет
     вертикальный вынос (HP), вертикальное — горизонтальный (VP). Суммы угла
     уже это учитывают, поэтому цепочка приходит ровно в pHoriz. */
  var pts=[P(0,T.v)],ids=[],dx=0,dy=T.v;
  T.vals.forEach(function(s){
    dx+=s.H;dy+=(s.HP||0);pts.push(P(dx,dy));ids.push(s.hId);
    dy-=s.V;dx+=(s.VP||0);pts.push(P(dx,dy));ids.push(s.vId);
  });
  pts[0]=[pVert[0],pVert[1]];
  pts[pts.length-1]=[pHoriz[0],pHoriz[1]];
  var segs=ids.map(function(id,i){return {id:id,p1:pts[i],p2:pts[i+1]};});
  if(g.rev)segs=segs.slice().reverse().map(function(s){return {id:s.id,p1:s.p2,p2:s.p1};});
  return segs;
}
/* Единый замкнутый контур + пути сторон в терминах приложения */
function ssContour(S){
  var G=ssBase(S),T={tl:ssCornerTotals(S,'tl'),tr:ssCornerTotals(S,'tr'),br:ssCornerTotals(S,'br'),bl:ssCornerTotals(S,'bl')};
  var dD=G.Dsigned>=0?1:-1,dB=-1;
  /* Сначала вертикальные стороны: их подрезанные концы задают, откуда реально
     начинаются горизонтальные стороны. Брать вершину габарита нельзя — при
     уклоне A/C конец стороны смещён по X, и лесенка нотча не сходилась. */
  var spanA=ssSpan(G.Ap,1,G.BL[1]+T.bl.v,G.AT[1]-T.tl.v),
      spanC=ssSpan(G.Cp.slice().reverse(),1,G.CT[1]-T.tr.v,G.BR[1]+T.br.v);
  var aTop=spanA[spanA.length-1],aBot=spanA[0],cTop=spanC[0],cBot=spanC[spanC.length-1];
  var spanD=ssSpan(G.Dp,0,aTop[0]+dD*T.tl.h,cTop[0]-dD*T.tr.h),
      spanB=ssSpan(G.Bp.slice().reverse(),0,cBot[0]+dB*T.br.h,aBot[0]-dB*T.bl.h);
  var segs=[];
  function push(P,id){for(var i=0;i<P.length-1;i++)segs.push({id:id,p1:P[i],p2:P[i+1]});}
  push(spanA,'A');
  segs=segs.concat(ssStairs(S,'tl',G.AT,spanA[spanA.length-1],spanD[0]));
  push(spanD,'D');
  segs=segs.concat(ssStairs(S,'tr',G.CT,spanC[0],spanD[spanD.length-1]));
  push(spanC,'C');
  segs=segs.concat(ssStairs(S,'br',G.BR,spanC[spanC.length-1],spanB[0]));
  push(spanB,'B');
  segs=segs.concat(ssStairs(S,'bl',G.BL,spanA[0],spanB[spanB.length-1]));
  segs=segs.filter(function(s){return Math.hypot(s.p2[0]-s.p1[0],s.p2[1]-s.p1[1])>1e-9;});
  var pts=[];
  if(segs.length){
    pts.push(segs[0].p1);
    segs.forEach(function(s){pts.push(s.p2);});
    var a=pts[0],b=pts[pts.length-1];
    if(Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9)pts.pop();
  }
  /* стороны приложения: bottom=B, right=C, top=D, left=A, в порядке обхода */
  return {pts:pts,segs:segs,base:G,
    sides:{bottom:spanB.slice().reverse(),right:spanC.slice().reverse(),top:spanD.slice().reverse(),left:spanA.slice().reverse()}};
}
