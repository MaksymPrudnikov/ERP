/* =====================================================================
   muntin/layout  ·  v4.5-port
   Equal-clear раскладка на сетке 1/16″ по bounding box.
   IN : модель, ширина, высота
   OUT: позиции осей баров + просветы
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

var MUNTIN_GRID=1/16;
function muntinSnap(v){return Math.round(v/MUNTIN_GRID)*MUNTIN_GRID;}
function equalClearPositions(count,span,inset,face){
  var a=[],clears=[],free=span-2*inset-count*face,i;
  if(count<=0)return {positions:a,clear:Math.max(0,free),clears:free>0?[free]:[]};
  if(free<0)return {positions:a,clear:0,clears:[]};
  var n=count+1,U=Math.round(free/MUNTIN_GRID),base=Math.floor(U/n),rem=U-base*n;
  for(i=0;i<n;i++)clears.push(base*MUNTIN_GRID);
  var order=[],lo=0,hi=n-1;
  while(lo<=hi){order.push(lo);if(hi!==lo)order.push(hi);lo++;hi--;}
  for(i=0;i<rem;i++)clears[order[i%n]]+=MUNTIN_GRID;
  var sum=0;for(i=0;i<n;i++)sum+=clears[i];
  clears[n-1]+=free-sum;
  var edge=inset;
  for(i=0;i<count;i++){edge+=clears[i];a.push(edge+face/2);edge+=face;}
  return {positions:a,clear:clears.length?clears[0]:0,clears:clears};
}
function productionGeometry(M,W,H){
  M=normalizeMuntinModel(M);var P=M.production,MP=muntinProduct(M.productId),face=Math.max(0,+MP.faceWidthIn||0),ix=Math.max(0,+P.edgeInsetX||0),iy=Math.max(0,+P.edgeInsetY||0),ec=Math.max(0,+P.endClearance||0);
  var eqV=equalClearPositions(M.layout.verticalBars,W,ix,face),eqH=equalClearPositions(M.layout.horizontalBars,H,iy,face);
  var v=P.mode==='custom'?P.verticalPositions.slice(0,M.layout.verticalBars):eqV.positions.slice();
  var h=P.mode==='custom'?P.horizontalPositions.slice(0,M.layout.horizontalBars):eqH.positions.slice();
  if(P.mode==='custom'){
    while(v.length<M.layout.verticalBars)v.push(eqV.positions[v.length]||W/2);
    while(h.length<M.layout.horizontalBars)h.push(eqH.positions[h.length]||H/2);
  }
  v=v.map(function(x){return Math.max(ix+face/2,Math.min(W-ix-face/2,+x||0));}).sort(function(a,b){return a-b;});
  h=h.map(function(y){return Math.max(iy+face/2,Math.min(H-iy-face/2,+y||0));}).sort(function(a,b){return a-b;});
  return {W:W,H:H,ix:ix,iy:iy,ec:ec,face:face,v:v,h:h,clearX:eqV.clear,clearY:eqH.clear,clearsX:eqV.clears||[],clearsY:eqH.clears||[],grid:MUNTIN_GRID,verticalCut:Math.max(0,H-2*iy-2*ec),horizontalCut:Math.max(0,W-2*ix-2*ec)};
}
