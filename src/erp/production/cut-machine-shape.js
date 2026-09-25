/* =====================================================================
   erp/production/cut-machine-shape
   Score lines and arcs of a Shape for the trial Maver / Disai files.

   Read from the owner's Perfect Cut exports (10 mm pair, 13 Disai projects,
   126 Maver shape programs, 24–25 September 2026):
   · only contour edges that do NOT lie on the sides of the piece's
     rectangular footprint are scored — the sides come from the through
     cuts. The Safety border stays between the contour and the footprint;
   · a straight edge, and an arc end at a side, is clipped to the footprint
     shrunk by 1.001 mm (`1.001 682.313 1141.917 680.446`);
   · curves are circular arcs: Maver `G2` (clockwise) / `G3` with the
     absolute centre in `I J` (96 arcs), Disai `x0 y0 cx cy sweep r F CR`
     (start, centre, signed sweep in degrees, radius; 7 arcs of one sheet
     chain end to start within 0.01 mm). An ellipse is a chain of arcs;
   · Disai `F` is `C` when the next segment carries on with less than 5°
     of turn and `D` otherwise; Maver keeps the wheel down on the same 5°
     (no lift up to 4.83°, lift from 5.13° in 173 joints);
   · Maver cuts the pieces in the SCHEME order; inside a piece, connected
     edges are one chain, started from its nearer end (97 of 113 programs);
   · a closed loop runs counter-clockwise on Disai; an ellipse is Perfect
     Cut's 34 arcs (6 mm shape set, 25.09.2026).
   The ERP contour is a polyline sampled to ~0.01 mm; it is refitted to
   lines and arcs within 0.1 mm, or the export is refused.
   ===================================================================== */
const CUT_SHAPE_INSET=1001,CUT_SHAPE_ON_SIDE=1600,CUT_SHAPE_TOL=100,CUT_SHAPE_CORNER=25,CUT_SHAPE_SMOOTH=5;
const cutShapeDeg=r=>r*180/Math.PI;
function cutShapeTurn(a,b){return Math.abs(((a-b)%360+540)%360-180);}
function cutShapeHeading(p,atEnd){
 if(p.type==='line')return cutShapeDeg(Math.atan2(p.y1-p.y0,p.x1-p.x0));
 const x=atEnd?p.x1:p.x0,y=atEnd?p.y1:p.y0;
 return cutShapeDeg(Math.atan2(y-p.cy,x-p.cx))+(p.sweep<0?-90:90);
}
function cutShapeReverse(p){
 return p.type==='line'?{type:'line',x0:p.x1,y0:p.y1,x1:p.x0,y1:p.y0}:
  {type:'arc',x0:p.x1,y0:p.y1,x1:p.x0,y1:p.y0,cx:p.cx,cy:p.cy,r:p.r,sweep:-p.sweep};
}
function cutShapeArcPoint(p,t){
 const a=Math.atan2(p.y0-p.cy,p.x0-p.cx)+t*p.sweep*Math.PI/180;
 return [p.cx+p.r*Math.cos(a),p.cy+p.r*Math.sin(a)];
}
function cutShapeCircle(a,b,c){
 const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
 if(Math.abs(d)<1e-3)return null;
 const a2=a[0]*a[0]+a[1]*a[1],b2=b[0]*b[0]+b[1]*b[1],c2=c[0]*c[0]+c[1]*c[1];
 const cx=(a2*(b[1]-c[1])+b2*(c[1]-a[1])+c2*(a[1]-b[1]))/d,cy=(a2*(c[0]-b[0])+b2*(a[0]-c[0])+c2*(b[0]-a[0]))/d;
 return {cx,cy,r:Math.hypot(a[0]-cx,a[1]-cy)};
}
/* An upright ellipse the way Perfect Cut writes it (GR03 40×20″ and GR04
   12×6″ of 25.09.2026, Disai and Maver alike): 34 arcs, each turning the
   tangent by 360/34°, centred on the ends of the minor axis; an arc passes
   through its two ends and its middle point on the ellipse. Counter-
   clockwise, Perfect Cut starts at the arc on the top end of the minor axis
   (the left end for a standing ellipse); returned clockwise like the ERP
   contour, which the Disai writer turns back. Null unless every sample lies
   within 0.1 mm of the ellipse. */
function cutShapeEllipse(P){
 const xs=P.map(p=>p[0]),ys=P.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;
 if(!(rx>0&&ry>0)||!P.every(p=>{const u=(p[0]-cx)/rx,v=(p[1]-cy)/ry;return Math.abs(u*u+v*v-1)/(2*Math.hypot(u/rx,v/ry))<=CUT_SHAPE_TOL;}))return null;
 const N=34,step=2*Math.PI/N,th0=rx>=ry?Math.PI:1.5*Math.PI;
 const at=f=>{const t=Math.atan2(-Math.cos(f)/rx,Math.sin(f)/ry);return [cx+rx*Math.cos(t),cy+ry*Math.sin(t)];};
 const ccw=[];
 for(let k=0;k<N;k++){
  const f=th0+k*step,a=at(f-step/2),b=at(f+step/2),c=cutShapeCircle(a,at(f),b);if(!c)return null;
  const sweep=((cutShapeDeg(Math.atan2(b[1]-c.cy,b[0]-c.cx)-Math.atan2(a[1]-c.cy,a[0]-c.cx))%360)+360)%360;
  ccw.push({type:'arc',x0:a[0],y0:a[1],x1:b[0],y1:b[1],cx:c.cx,cy:c.cy,r:c.r,sweep});
 }
 return ccw.reverse().map(cutShapeReverse);
}
/* Polyline (0.001 mm, closed, clockwise) → lines and arcs within 0.1 mm.
   Corners over 25° always split. Between them the longest arc wins over a
   line when every sample lies within tolerance of one circle and the
   samples step round it by at most 10° in one direction — a sampled curve,
   even a coarse DXF one (the chord midpoints of a 2.8° step sit 0.15 mm off
   the arc, which is the polyline's error, not the curve's). A real polygon
   has bigger steps and stays straight, and no chord may bulge more than
   0.5 mm from the arc — otherwise a long straight side next to a curve
   passes for a 10 m arc. At least three chords per arc. */
function cutShapeFit(P){
 const n=P.length,T=CUT_SHAPE_TOL;
 const lineOk=(q,i,j)=>{
  const a=q[i],b=q[j],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<1)return false;
  for(let k=i+1;k<j;k++)if(Math.abs((b[0]-a[0])*(a[1]-q[k][1])-(a[0]-q[k][0])*(b[1]-a[1]))/L>T)return false;
  return true;
 };
 const arcOk=(q,i,j)=>{
  if(j-i<3)return null;
  const m=(i+j)>>1,c=cutShapeCircle(q[i],q[m],q[j]);if(!c||c.r>1e8)return null;
  const ccw=(q[m][0]-q[i][0])*(q[j][1]-q[m][1])-(q[m][1]-q[i][1])*(q[j][0]-q[m][0])>0;
  for(let k=i;k<=j;k++){
   if(Math.abs(Math.hypot(q[k][0]-c.cx,q[k][1]-c.cy)-c.r)>T)return null;
   if(k<j){
    const s=cutShapeDeg(Math.atan2(q[k+1][1]-c.cy,q[k+1][0]-c.cx)-Math.atan2(q[k][1]-c.cy,q[k][0]-c.cx)),d=((s%360)+540)%360-180;
    const L=Math.hypot(q[k+1][0]-q[k][0],q[k+1][1]-q[k][1]),sag=c.r-Math.sqrt(Math.max(0,c.r*c.r-L*L/4));
    if((ccw?d:-d)<=0||Math.abs(d)>10||sag>500)return null;
   }
  }
  const a0=Math.atan2(q[i][1]-c.cy,q[i][0]-c.cx),a1=Math.atan2(q[j][1]-c.cy,q[j][0]-c.cx);
  let sweep=cutShapeDeg(a1-a0);sweep=ccw?(sweep%360+360)%360:-((-sweep%360+360)%360);
  if(!(Math.abs(sweep)>0.01&&Math.abs(sweep)<359))return null;
  return {type:'arc',x0:q[i][0],y0:q[i][1],x1:q[j][0],y1:q[j][1],cx:c.cx,cy:c.cy,r:c.r,sweep};
 };
 const fitRun=q=>{
  const out=[];let i=0;const m=q.length-1;
  while(i<m){
   let lj=i+1;while(lj<m&&lineOk(q,i,lj+1))lj++;
   let aj=-1,arc=null;
   for(let j=i+3;j<=m;j++){const c=arcOk(q,i,j);if(!c)break;aj=j;arc=c;}
   if(arc&&aj>lj){out.push(arc);i=aj;}
   else{out.push({type:'line',x0:q[i][0],y0:q[i][1],x1:q[lj][0],y1:q[lj][1]});i=lj;}
  }
  return out;
 };
 const turn=i=>{
  const a=P[(i+n-1)%n],p=P[i],b=P[(i+1)%n];
  return cutShapeTurn(cutShapeDeg(Math.atan2(b[1]-p[1],b[0]-p[0])),cutShapeDeg(Math.atan2(p[1]-a[1],p[0]-a[0])));
 };
 const corners=[];for(let i=0;i<n;i++)if(turn(i)>CUT_SHAPE_CORNER)corners.push(i);
 if(!corners.length){
  /* A smooth closed loop: one full circle — counter-clockwise from its
     rightmost point, as 66 of the 67 full circles of the Maver samples
     (G3, Z90) — or arcs around it. */
  const c=cutShapeCircle(P[0],P[Math.floor(n/3)],P[Math.floor(2*n/3)]);
  if(c&&P.every(q=>Math.abs(Math.hypot(q[0]-c.cx,q[1]-c.cy)-c.r)<=T))
   return {prims:[{type:'arc',x0:c.cx+c.r,y0:c.cy,x1:c.cx+c.r,y1:c.cy,cx:c.cx,cy:c.cy,r:c.r,sweep:360}]};
  return {prims:cutShapeEllipse(P)||fitRun(P.concat([P[0]]))};
 }
 const prims=[];
 corners.forEach((s,k)=>{
  const e=corners[(k+1)%corners.length],q=[];
  for(let i=s;;i=(i+1)%n){q.push(P[i]);if(i===e&&q.length>1)break;}
  fitRun(q).forEach(p=>prims.push(p));
 });
 return {prims};
}
/* Liang–Barsky: the part of a..b inside the rectangle, in 0.001 mm. */
function cutShapeClip(a,b,x0,y0,x1,y1){
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-x0],[dx,x1-a[0]],[-dy,a[1]-y0],[dy,y1-a[1]]]){
  if(p===0){if(q<0)return null;continue;}
  const r=q/p;
  if(p<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}
 }
 const s={type:'line',x0:a[0]+t0*dx,y0:a[1]+t0*dy,x1:a[0]+t1*dx,y1:a[1]+t1*dy};
 return Math.hypot(s.x1-s.x0,s.y1-s.y0)>2000?s:null;
}
/* How far along the arc, from its start, the score begins when the start
   lies on a side (`sides`: [axis, side, inward] from cutShapeScoreChains).
   Perfect Cut ends an arc on the footprint shrunk by 1.001 mm, as it does a
   line (RC14, RC21, L50, L59 of 25.09.2026). An arc that meets the side
   nearly along it would lose centimetres that way, so beyond 5 mm it stops
   1.001 mm along the arc instead. */
function cutShapeArcTrim(p,sides){
 const len=Math.abs(p.sweep)*Math.PI/180*p.r,a0=Math.atan2(p.y0-p.cy,p.x0-p.cx),dir=Math.sign(p.sweep);
 let cut=0;
 for(const [k,v,inward] of sides){
  const w=v+inward*CUT_SHAPE_INSET;
  if(((k?p.y0:p.x0)-w)*inward>=0)continue;
  const c=(w-(k?p.cy:p.cx))/p.r;let best=null;
  if(Math.abs(c)<=1){
   const b=k?Math.asin(c):Math.acos(c);
   for(const a of k?[b,Math.PI-b]:[b,-b]){
    const d=((dir*(a-a0))%(2*Math.PI)+2*Math.PI)%(2*Math.PI)*p.r;
    if(d<=len&&(best===null||d<best))best=d;
   }
  }
  cut=Math.max(cut,best!==null&&best<=5000?best:CUT_SHAPE_INSET);
 }
 return cut;
}
/* Chains of score segments of one snapshot part, sheet coordinates in
   0.001 mm, clockwise as Perfect Cut lists `[DB]`. */
function cutShapeScoreChains(part){
 const q=cutDisaiQ,f=part.footprint,X0=q(f.x),Y0=q(f.y),X1=q(f.x+f.w),Y1=q(f.y+f.h);
 let pts=(part.contour||[]).map(p=>[q(p[0]),q(p[1])]);
 pts=pts.filter((p,i)=>{const nx=pts[(i+1)%pts.length];return Math.hypot(p[0]-nx[0],p[1]-nx[1])>2;});
 if(pts.length<3)return {error:'Shape '+part.id+' has no cutting contour.'};
 const area=pts.reduce((s,p,i)=>{const nx=pts[(i+1)%pts.length];return s+p[0]*nx[1]-nx[0]*p[1];},0);
 if(area>0)pts.reverse();
 const fit=cutShapeFit(pts);
 /* The footprint is on the 1/16″ grid, the contour is exact: a straight
    edge within 1.6 mm of a side is that side, not a separate score. */
 const near=(x,y)=>[[0,X0,1],[0,X1,-1],[1,Y0,1],[1,Y1,-1]].filter(([k,v])=>Math.abs((k?y:x)-v)<=CUT_SHAPE_ON_SIDE);
 const onSide=p=>p.type==='line'&&[[0,X0],[0,X1],[1,Y0],[1,Y1]].some(([k,v])=>Math.abs((k?p.y0:p.x0)-v)<=CUT_SHAPE_ON_SIDE&&Math.abs((k?p.y1:p.x1)-v)<=CUT_SHAPE_ON_SIDE);
 const prims=fit.prims,k0=prims.findIndex(onSide),ring=k0<0?prims:prims.slice(k0+1).concat(prims.slice(0,k0+1));
 const chains=[];let cur=null;
 for(const p of ring){
  if(onSide(p)){cur=null;continue;}
  let s=null;
  if(p.type==='line')s=cutShapeClip([p.x0,p.y0],[p.x1,p.y1],X0+CUT_SHAPE_INSET,Y0+CUT_SHAPE_INSET,X1-CUT_SHAPE_INSET,Y1-CUT_SHAPE_INSET);
  else{
   /* Only an end that reaches a side is shortened; an arc touching a side
      between its ends keeps its whole length. */
   const full=Math.abs(p.sweep)>=359.99,len=Math.abs(p.sweep)*Math.PI/180*p.r;
   const cut0=full?0:cutShapeArcTrim(p,near(p.x0,p.y0)),cut1=full?0:cutShapeArcTrim(cutShapeReverse(p),near(p.x1,p.y1));
   if(len-cut0-cut1>2000){
    const t0=cut0/len,t1=1-cut1/len,a=cutShapeArcPoint(p,t0),b=full?a:cutShapeArcPoint(p,t1);
    s={type:'arc',x0:a[0],y0:a[1],x1:b[0],y1:b[1],cx:p.cx,cy:p.cy,r:p.r,sweep:p.sweep*(t1-t0)};
   }
  }
  if(!s)continue;
  const inside=pt=>pt[0]>=X0-2&&pt[0]<=X1+2&&pt[1]>=Y0-2&&pt[1]<=Y1+2;
  if(s.type==='arc'&&![0,0.25,0.5,0.75,1].every(t=>inside(cutShapeArcPoint(s,t))))return {error:'Shape '+part.id+' has a curve outside its footprint.'};
  if(!cur){cur=[];chains.push(cur);}
  cur.push(s);
 }
 /* Every contour sample must lie on what is written, within 0.1 mm. */
 const dist=(pt,s)=>{
  if(s.type==='arc'){const a=Math.atan2(pt[1]-s.cy,pt[0]-s.cx),b=Math.atan2(s.y0-s.cy,s.x0-s.cx);
   let d=cutShapeDeg(a-b);d=s.sweep>0?(d%360+360)%360:-((-d%360+360)%360);
   return Math.abs(d)<=Math.abs(s.sweep)+1e-6||Math.abs(s.sweep)>=359.99?Math.abs(Math.hypot(pt[0]-s.cx,pt[1]-s.cy)-s.r):Infinity;}
  const dx=s.x1-s.x0,dy=s.y1-s.y0,L2=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((pt[0]-s.x0)*dx+(pt[1]-s.y0)*dy)/L2));
  return Math.hypot(pt[0]-s.x0-t*dx,pt[1]-s.y0-t*dy);
 };
 if(pts.some(pt=>!prims.some(s=>dist(pt,s)<=CUT_SHAPE_TOL+2)))return {error:'Shape '+part.id+' could not be written as lines and arcs within 0.1 mm.'};
 return {chains,box:{x:X0,y:Y0}};
}
/* Maver order of all Shape scores of a sheet: pieces in `order`, chains by
   the nearer end from where the head is. A closed loop starts at its point
   nearest the head and keeps its clockwise direction (GR05B, L57 of the
   25.09.2026 set). */
function cutShapeMaverOrder(parts,order,start){
 const byId=new Map(parts.map(p=>[p.id,p])),out=[];let x=start[0],y=start[1];
 order.forEach(id=>{
  const p=byId.get(id);if(!p||!p.scores||!p.scores.length)return;
  const left=p.scores.map(c=>c.slice()),chains=[];
  while(left.length){
   let best=null;
   left.forEach((c,i)=>{
    const a=[c[0].x0,c[0].y0],b=[c[c.length-1].x1,c[c.length-1].y1];
    if(c.length>1&&Math.hypot(a[0]-b[0],a[1]-b[1])<=10)c.forEach((g,j)=>{
     const d=Math.hypot(g.x0-x,g.y0-y);if(!best||d<best.d-1e-9)best={d,i,rev:false,at:j};
    });
    else{
     const da=Math.hypot(a[0]-x,a[1]-y),db=Math.hypot(b[0]-x,b[1]-y);
     if(!best||Math.min(da,db)<best.d-1e-9)best={d:Math.min(da,db),i,rev:db<da,at:0};
    }
   });
   /* A full circle keeps its counter-clockwise direction. */
   const c=left.splice(best.i,1)[0],ring=best.at?c.slice(best.at).concat(c.slice(0,best.at)):c;
   const run=best.rev&&!c.some(g=>Math.abs(g.sweep)>=359.99)?ring.slice().reverse().map(cutShapeReverse):ring;
   chains.push(run);
   const e=run[run.length-1];x=e.x1;y=e.y1;
  }
  out.push({id,name:p.shapeName,chains});
 });
 return out;
}
/* Maver head angle: the cut direction in degrees, kept in (-90, 270] as in
   every sample (180.053, -89.828, 253.273). Straight to the right is
   `-0.000` in all six such shape runs of the samples. */
function cutShapeMaverAngle(h){
 let a=((h%360)+360)%360;if(a>270)a-=360;
 return Math.abs(a)<0.0005?'-0.000':a.toFixed(3);
}
/* Does `b` carry on from `a` without lifting the wheel (< 5° of turn)? */
function cutShapeSmooth(a,b){
 return !!a&&!!b&&Math.hypot(b.x0-a.x1,b.y0-a.y1)<=10&&cutShapeTurn(cutShapeHeading(b,false),cutShapeHeading(a,true))<CUT_SHAPE_SMOOTH;
}
