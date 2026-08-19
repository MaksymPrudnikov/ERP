/* =====================================================================
   core/poly  ·  v4.5-port
   Полигональная геометрия: самопересечение, площадь, габарит.
   IN : массив точек [[x,y],...]
   OUT: bool / число / {minX,maxX,minY,maxY}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function fabSegCross(p1,p2,p3,p4){
  function cr(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
  var e=1e-9,d1=cr(p3,p4,p1),d2=cr(p3,p4,p2),d3=cr(p1,p2,p3),d4=cr(p1,p2,p4);
  return ((d1>e&&d2<-e)||(d1<-e&&d2>e))&&((d3>e&&d4<-e)||(d3<-e&&d4>e));
}
function fabPolySelfIntersects(P){
  var n=P.length;if(n<4)return false;
  for(var i=0;i<n;i++)for(var j=i+2;j<n;j++){
    if(i===0&&j===n-1)continue;
    if(fabSegCross(P[i],P[(i+1)%n],P[j],P[(j+1)%n]))return true;
  }
  return false;
}
function fabSignedArea(P){var a=0;for(var i=0;i<P.length;i++){var j=(i+1)%P.length;a+=P[i][0]*P[j][1]-P[j][0]*P[i][1];}return a/2;}
function fabEdgeBounds(P){var xs=P.map(function(q){return q[0];}),ys=P.map(function(q){return q[1];});return {minX:Math.min.apply(null,xs),maxX:Math.max.apply(null,xs),minY:Math.min.apply(null,ys),maxY:Math.max.apply(null,ys)};}

/* Общие безопасные примитивы. Они используются Shape, Cutting Geometry и
   проверками features. Все функции чистые: входные массивы не изменяются. */
function fabPointInPoly(p,P){
  if(!p||!P||P.length<3)return false;
  var inside=false,x=p[0],y=p[1];
  for(var i=0,j=P.length-1;i<P.length;j=i++){
    var a=P[i],b=P[j],cross=((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/((b[1]-a[1])||1e-30)+a[0]);
    if(cross)inside=!inside;
  }
  return inside;
}
function fabPointSegDistance(p,a,b){
  var dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
  if(d<=1e-20)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  var t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d;t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-(a[0]+dx*t),p[1]-(a[1]+dy*t));
}
function fabPointPolyDistance(p,P){
  var d=Infinity;for(var i=0;i<(P||[]).length;i++)d=Math.min(d,fabPointSegDistance(p,P[i],P[(i+1)%P.length]));return d;
}
function fabLineIntersection(a,b,c,d){
  var x1=a[0],y1=a[1],x2=b[0],y2=b[1],x3=c[0],y3=c[1],x4=d[0],y4=d[1];
  var den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<1e-10)return null;
  var q1=x1*y2-y1*x2,q2=x3*y4-y3*x4;
  var x=(q1*(x3-x4)-(x1-x2)*q2)/den,y=(q1*(y3-y4)-(y1-y2)*q2)/den;
  return isFinite(x)&&isFinite(y)?[x,y]:null;
}
function fabPolylineLength(P,closed){
  var n=(P||[]).length,L=0;if(n<2)return 0;
  for(var i=0;i<n-(closed?0:1);i++){var a=P[i],b=P[(i+1)%n];L+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return L;
}
function fabBBoxContainsPoint(b,p,eps){eps=eps||0;return p[0]>=b.minX-eps&&p[0]<=b.maxX+eps&&p[1]>=b.minY-eps&&p[1]<=b.maxY+eps;}
function fabPointOnSegment(p,a,b,eps){
  eps=eps==null?1e-8:eps;return fabPointSegDistance(p,a,b)<=eps&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
}
function fabSegIntersectsInclusive(a,b,c,d){
  if(fabSegCross(a,b,c,d))return true;
  return fabPointOnSegment(a,c,d)||fabPointOnSegment(b,c,d)||fabPointOnSegment(c,a,b)||fabPointOnSegment(d,a,b);
}
function fabPolygonsOverlap(A,B){
  if(!A||!B||A.length<3||B.length<3)return false;
  for(var i=0;i<A.length;i++)for(var j=0;j<B.length;j++)if(fabSegIntersectsInclusive(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return true;
  return fabPointInPoly(A[0],B)||fabPointInPoly(B[0],A);
}
