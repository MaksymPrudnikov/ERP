/* =====================================================================
   muntin/clip  ·  v4.5-port
   Обрезка бара реальным контуром: сканлайны, интервалы, перпендикулярный отступ.
   IN : контур, ось, координата, отступ
   OUT: интервалы, где бар физически есть
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function muntinScanIntervals(points,axis,value){
  var hits=[],eps=1e-7;if(!points||points.length<3)return [];
  for(var i=0;i<points.length;i++){
    var a=points[i],b=points[(i+1)%points.length],a0=axis==='v'?a[0]:a[1],b0=axis==='v'?b[0]:b[1];
    if(!((a0<=value&&value<b0)||(b0<=value&&value<a0)))continue;
    var den=b0-a0;if(Math.abs(den)<eps)continue;
    var t=(value-a0)/den,other=axis==='v'?(a[1]+(b[1]-a[1])*t):(a[0]+(b[0]-a[0])*t);
    if(isFinite(other))hits.push(other);
  }
  hits.sort(function(a,b){return a-b;});
  var clean=[];for(i=0;i<hits.length;i++)if(!clean.length||Math.abs(hits[i]-clean[clean.length-1])>1e-5)clean.push(hits[i]);
  var out=[];for(i=0;i+1<clean.length;i+=2)if(clean[i+1]-clean[i]>eps)out.push([clean[i],clean[i+1]]);
  return out;
}
function muntinIntervalUnion(list){
  if(!list.length)return [];
  list.sort(function(a,b){return a[0]-b[0];});
  var out=[list[0].slice()],i;
  for(i=1;i<list.length;i++){
    var cur=out[out.length-1],nx=list[i];
    if(nx[0]<=cur[1]+1e-9){if(nx[1]>cur[1])cur[1]=nx[1];}
    else out.push(nx.slice());
  }
  return out;
}
function muntinIntervalSubtract(span,holes){
  var res=[[span[0],span[1]]],i,j;
  for(i=0;i<holes.length;i++){
    var h=holes[i],next=[];
    for(j=0;j<res.length;j++){
      var s=res[j];
      if(h[1]<=s[0]+1e-12||h[0]>=s[1]-1e-12){next.push(s);continue;}
      if(h[0]>s[0]+1e-9)next.push([s[0],h[0]]);
      if(h[1]<s[1]-1e-9)next.push([h[1],s[1]]);
    }
    res=next;if(!res.length)break;
  }
  return res;
}
function muntinSegmentBand(ax,ay,bx,by,axis,c,d){
  var lo=Infinity,hi=-Infinity,i;
  function disk(px,py){
    var off=(axis==='v')?(c-px):(c-py);
    if(Math.abs(off)>d)return;
    var r=Math.sqrt(Math.max(0,d*d-off*off)),base=(axis==='v')?py:px;
    if(base-r<lo)lo=base-r;
    if(base+r>hi)hi=base+r;
  }
  disk(ax,ay);disk(bx,by);
  var dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);
  if(L>1e-12){
    var tx=dx/L,ty=dy/L,nx=-ty,ny=tx,
        planes=[[nx,ny,nx*ax+ny*ay+d],[-nx,-ny,-(nx*ax+ny*ay)+d],[-tx,-ty,-(tx*ax+ty*ay)],[tx,ty,tx*ax+ty*ay+L]],
        blo=-Infinity,bhi=Infinity,good=true;
    for(i=0;i<planes.length;i++){
      var A=planes[i][0],B=planes[i][1],K=planes[i][2],coef=(axis==='v')?B:A,rhs=K-((axis==='v')?(A*c):(B*c));
      if(Math.abs(coef)<1e-12){if(rhs<-1e-9){good=false;break;}continue;}
      var q=rhs/coef;if(coef>0){if(q<bhi)bhi=q;}else{if(q>blo)blo=q;}
    }
    if(good&&bhi>blo-1e-12){if(blo<lo)lo=blo;if(bhi>hi)hi=bhi;}
  }
  return hi<lo?null:[lo,hi];
}
function muntinOffsetHoles(outline,axis,c,d){
  var out=[],i,n=outline.length;if(!(d>0))return out;
  for(i=0;i<n;i++){var A=outline[i],B=outline[(i+1)%n],iv=muntinSegmentBand(A[0],A[1],B[0],B[1],axis,c,d);if(iv)out.push(iv);}
  return muntinIntervalUnion(out);
}
function muntinIsRectOutline(points,minX,maxX,minY,maxY){
  if(!points||points.length<4)return false;
  var P=points.slice(),eps=1e-5,a=P[0],b=P[P.length-1];
  if(P.length>4&&Math.abs(a[0]-b[0])<eps&&Math.abs(a[1]-b[1])<eps)P.pop();
  if(P.length!==4)return false;
  var targets=[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]];
  return targets.every(function(t){return P.some(function(p){return Math.abs(p[0]-t[0])<eps&&Math.abs(p[1]-t[1])<eps;});});
}
