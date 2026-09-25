/* =====================================================================
   erp/production/cut-machine-shape
   Score lines of a straight-edged Shape for the trial Maver / Disai files.

   Read from the owner's Perfect Cut exports (10 mm pair, 13 Disai projects,
   126 Maver shape programs, 24–25 September 2026):
   · only the contour edges that do NOT lie on the sides of the piece's
     rectangular footprint are scored — the sides come from the through
     cuts. The Safety border stays between the contour and the footprint;
   · each edge is clipped to the footprint shrunk by 1.001 mm, so the wheel
     stops just short of the edge (`1.001 682.313 1141.917 680.446`);
   · Disai lists them in `[DB<IB>]` in footprint coordinates, Maver in sheet
     coordinates — the same segments;
   · Maver cuts the pieces in the SCHEME order; inside a piece, connected
     edges are one chain, started from its nearer end (97 of 113 programs).
   Arcs are not handled here: a curved Shape is refused before this point.
   ===================================================================== */
const CUT_SHAPE_INSET=1001,CUT_SHAPE_ON_SIDE=1600;
/* Liang–Barsky: the part of a..b inside the rectangle, in 0.001 mm. */
function cutShapeClip(a,b,x0,y0,x1,y1){
 let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-x0],[dx,x1-a[0]],[-dy,a[1]-y0],[dy,y1-a[1]]]){
  if(p===0){if(q<0)return null;continue;}
  const r=q/p;
  if(p<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}
 }
 const s={x0:Math.round(a[0]+t0*dx),y0:Math.round(a[1]+t0*dy),x1:Math.round(a[0]+t1*dx),y1:Math.round(a[1]+t1*dy)};
 return Math.hypot(s.x1-s.x0,s.y1-s.y0)>2000?s:null;
}
/* Chains of score segments of one snapshot part, sheet coordinates in
   0.001 mm, clockwise as Perfect Cut lists `[DB]`. A rectangle-like Shape
   whose contour runs along the footprint has no chains. */
function cutShapeScoreChains(part){
 const q=cutDisaiQ,f=part.footprint,X0=q(f.x),Y0=q(f.y),X1=q(f.x+f.w),Y1=q(f.y+f.h);
 let pts=(part.contour||[]).map(p=>[q(p[0]),q(p[1])]);
 pts=pts.filter((p,i)=>{const n=pts[(i+1)%pts.length];return Math.hypot(p[0]-n[0],p[1]-n[1])>2;});
 if(pts.length<3)return {error:'Shape '+part.id+' has no cutting contour.'};
 const area=pts.reduce((s,p,i)=>{const n=pts[(i+1)%pts.length];return s+p[0]*n[1]-n[0]*p[1];},0);
 if(area>0)pts.reverse();
 /* The footprint is on the 1/16″ grid, the contour is exact: an edge within
    1.6 mm of a side is that side, not a separate score. */
 const onSide=(a,b)=>[[0,X0],[0,X1],[1,Y0],[1,Y1]].some(([k,v])=>Math.abs(a[k]-v)<=CUT_SHAPE_ON_SIDE&&Math.abs(b[k]-v)<=CUT_SHAPE_ON_SIDE);
 const edges=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return {a,b,side:onSide(a,b)};});
 const k=edges.findIndex(e=>e.side),ring=k<0?edges:edges.slice(k+1).concat(edges.slice(0,k+1));
 const chains=[];let cur=null;
 ring.forEach(e=>{
  if(e.side){cur=null;return;}
  const s=cutShapeClip(e.a,e.b,X0+CUT_SHAPE_INSET,Y0+CUT_SHAPE_INSET,X1-CUT_SHAPE_INSET,Y1-CUT_SHAPE_INSET);
  if(!s)return;
  if(!cur){cur=[];chains.push(cur);}
  cur.push(s);
 });
 return {chains,box:{x:X0,y:Y0}};
}
/* Maver order of all Shape scores of a sheet: pieces in `order`, chains by
   the nearer end from where the head is. */
function cutShapeMaverOrder(parts,order,start){
 const byId=new Map(parts.map(p=>[p.id,p])),out=[];let x=start[0],y=start[1];
 order.forEach(id=>{
  const p=byId.get(id);if(!p||!p.scores||!p.scores.length)return;
  const left=p.scores.map(c=>c.slice()),segs=[];
  while(left.length){
   let best=null;
   left.forEach((c,i)=>{
    const a=[c[0].x0,c[0].y0],b=[c[c.length-1].x1,c[c.length-1].y1];
    const da=Math.hypot(a[0]-x,a[1]-y),db=Math.hypot(b[0]-x,b[1]-y);
    if(!best||Math.min(da,db)<best.d-1e-9)best={d:Math.min(da,db),i,rev:db<da};
   });
   const c=left.splice(best.i,1)[0],run=best.rev?c.slice().reverse().map(s=>({x0:s.x1,y0:s.y1,x1:s.x0,y1:s.y0})):c;
   run.forEach(s=>segs.push(s));
   const e=run[run.length-1];x=e.x1;y=e.y1;
  }
  out.push({id,name:p.shapeName,segs});
 });
 return out;
}
/* Maver head angle for a Shape score: the direction of the cut in degrees,
   kept in (-90, 270] as in every sample (180.053, -89.828, 253.273). */
function cutShapeMaverAngle(s){
 let a=Math.atan2(s.y1-s.y0,s.x1-s.x0)*180/Math.PI;
 if(a<=-90)a+=360;
 return a.toFixed(3);
}
