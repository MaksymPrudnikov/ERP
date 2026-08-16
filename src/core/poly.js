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
