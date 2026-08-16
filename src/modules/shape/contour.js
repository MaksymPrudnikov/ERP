/* =====================================================================
   shape/contour  ·  v4.5-port
   Построение единого замкнутого контура: рёбра A/B/C, AUTO-D, лесенки углов.
   IN : нормализованная модель + W/H
   OUT: {pts, segs, base, sides}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function ssEdgeLocal(S,e){
  var m=ssModel(S),s=m[e],vert=(e==='A'||e==='C'),L=ssEdgeLen(S,e);
  if(!m.elbowsOn){
    var o=ssNN(s.out);
    if(vert)return [[0,0],[s.dir==='right'?o:s.dir==='left'?-o:0,L]];
    return [[0,0],[L,s.dir==='up'?o:s.dir==='down'?-o:0]];
  }
  var E=s.elbow,to=ssNN(E.to),past=ssNN(E.past),h=Math.min(ssNN(E.elbowLen),L),M=ssMode(E.mode)||{s1:0,s2:0};
  var o1=M.s1*to,o2=o1+M.s2*past,coll=(h<=1e-9||h>=L-1e-9);
  if(vert)return coll?[[0,0],[o2,L]]:[[0,0],[o1,h],[o2,L]];
  return coll?[[0,0],[L,o2]]:[[0,0],[h,o1],[L,o2]];
}
function ssOff(P,o){return P.map(function(p){return [p[0]+o[0],p[1]+o[1]];});}
function ssBase(S){
  var BL=[0,0],
      Ap=ssOff(ssEdgeLocal(S,'A'),BL),AT=Ap[Ap.length-1],
      Bp=ssOff(ssEdgeLocal(S,'B'),BL),BR=Bp[Bp.length-1],
      Cp=ssOff(ssEdgeLocal(S,'C'),BR),CT=Cp[Cp.length-1];
  return {BL:BL,AT:AT,BR:BR,CT:CT,Ap:Ap,Bp:Bp,Cp:Cp,Dp:[AT,CT],
    Dlen:Math.abs(CT[0]-AT[0]),Dsigned:CT[0]-AT[0],Dout:Math.abs(CT[1]-AT[1]),
    Dtrue:Math.hypot(CT[0]-AT[0],CT[1]-AT[1]),
    DdirY:(CT[1]-AT[1])>1e-9?'up':(CT[1]-AT[1])<-1e-9?'down':null};
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
  function P(dx,dy){return [vertex[0]+g.h[0]*dx+g.v[0]*dy,vertex[1]+g.h[1]*dx+g.v[1]*dy];}
  var pts=[P(0,T.v)],ids=[],dx=0,dy=T.v;
  T.vals.forEach(function(s){dx+=s.H;pts.push(P(dx,dy));ids.push(s.hId);dy-=s.V;pts.push(P(dx,dy));ids.push(s.vId);});
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
  var spanA=ssSpan(G.Ap,1,G.BL[1]+T.bl.v,G.AT[1]-T.tl.v),
      spanD=ssSpan(G.Dp,0,G.AT[0]+dD*T.tl.h,G.CT[0]-dD*T.tr.h),
      spanC=ssSpan(G.Cp.slice().reverse(),1,G.CT[1]-T.tr.v,G.BR[1]+T.br.v),
      spanB=ssSpan(G.Bp.slice().reverse(),0,G.BR[0]+dB*T.br.h,G.BL[0]-dB*T.bl.h);
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
