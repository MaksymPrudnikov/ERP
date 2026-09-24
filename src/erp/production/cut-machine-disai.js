/* =====================================================================
   erp/production/cut-machine-disai
   Disai [SCHEME] and [BREAKLN] for one trial sheet, written from the same
   verified cut tree the ERP draws (cutSheetCuts). Trial only.

   Read from the owner's Perfect Cut exports (6, 4 and 10 mm, 132 patterns,
   24 September 2026). SCHEME letters are NOT machine axes but depth in a
   guillotine tree; the cut direction alternates level by level:
     X — strips across the width, starting at TRIMLEFT;
     Y — rows inside a strip, from the bottom edge of the sheet;
     Z — pieces inside a row, U — inside Z, V — inside U.
   Each entry is a span in mm, `IBn` marks the glass. A leading gap is a
   span without IB, the trailing remainder is left implicit; at most five
   levels. BREAKLN lists every score line of that tree: vertical lines
   sorted by X, then horizontal by Y; touching collinear lines merged;
   both ends stop 1 mm short. The table itself cuts plain X/Y lines.
   ===================================================================== */
const CUT_DISAI_LEVELS='XYZUV';
/* Positions in 0.001 mm integers. Every span is a difference of rounded
   absolute positions, so long rows do not accumulate rounding drift. */
function cutDisaiQ(inches){return Math.round(inches*25400);}
function cutDisaiText(um,digits){return (um/1000).toFixed(digits);}
/* SCHEME back to rectangles. frame — the tree field in 0.001 mm: X from
   TRIMLEFT, Y from the bottom edge. */
function cutDisaiParse(scheme,frame){
 const T=2,root=Object.assign({level:0,children:[],cursor:frame.x0},frame),stack=[root],boxes=[];
 for(const line of scheme){
  const m=/^([XYZUV])(\d+(?:\.\d+)?)((?:\s+(?:DB|IB)\d+)*)\s*$/.exec(String(line).trim());
  if(!m)return {error:'Unreadable Disai SCHEME line '+line+'.'};
  const level=CUT_DISAI_LEVELS.indexOf(m[1])+1,parent=stack[level-1];
  if(!parent)return {error:'Disai SCHEME line '+line+' has no parent level.'};
  const alongX=level%2===1,span=Math.round(parseFloat(m[2])*1000),start=parent.cursor,end=start+span;
  if(!(span>0)||end>(alongX?parent.x1:parent.y1)+T)return {error:'Disai SCHEME line '+line+' runs outside its parent.'};
  const ib=/IB(\d+)/.exec(m[3]);
  const box={level,children:[],ib:ib?+ib[1]:null,
   x0:alongX?start:parent.x0,x1:alongX?end:parent.x1,y0:alongX?parent.y0:start,y1:alongX?parent.y1:end};
  box.cursor=alongX?box.y0:box.x0;
  parent.cursor=end;parent.children.push(box);boxes.push(box);
  stack[level]=box;stack.length=level+1;
 }
 return {root,boxes};
}
/* Collinear touching lines become one score line, also across a crossing
   cut: Perfect Cut writes a row edge shared by two strips as one line.
   Spans are rounded per strip, so "collinear" allows 0.002 mm. */
function cutDisaiMerge(list){
 const T=2,out=[],sorted=list.slice().sort((p,q)=>(p.axis==='y')-(q.axis==='y')||p.at-q.at||p.a-q.a);
 const lanes=[];
 sorted.forEach(c=>{
  let lane=lanes.find(l=>l.axis===c.axis&&Math.abs(l.at-c.at)<=T);
  if(!lane){lane={axis:c.axis,at:c.at,list:[]};lanes.push(lane);}
  lane.list.push(c);
 });
 lanes.forEach(l=>{
  let cur=null;
  l.list.sort((p,q)=>p.a-q.a).forEach(s=>{if(cur&&s.a<=cur.b+T)cur.b=Math.max(cur.b,s.b);else{cur={axis:l.axis,at:l.at,a:s.a,b:s.b};out.push(cur);}});
 });
 return out.sort((p,q)=>(p.axis==='y')-(q.axis==='y')||p.at-q.at||p.a-q.a);
}
/* The bottom trim: when every strip starts with the same empty row and
   only the right border is left past the last strip, Perfect Cut scores
   that row edge across the border too (15 patterns of the 6 mm sample).
   With a wider remainder it stops at the strip (all four 10 mm ones). */
function cutDisaiBottomTrim(root){
 const T=2,strips=root.children;
 if(!strips.length)return null;
 const first=strips.map(s=>s.children[0]),end=strips[strips.length-1].x1;
 if(first.some(r=>!r||r.ib||r.children.length))return null;
 const g=first[0].y1;
 if(!first.every(r=>Math.abs(r.y1-g)<=T)||g<=root.y0+T)return null;
 return end<root.x1-T&&root.x1-end<=(+root.borderRight||0)+T?g:null;
}
/* Every cut of the tree: the end of each child while the parent field
   continues past it, plus the left and bottom trims across the sheet. */
function cutDisaiCuts(root){
 const T=2,out=[],bottom=cutDisaiBottomTrim(root);
 if(root.x0>T)out.push({axis:'x',at:root.x0,a:root.y0,b:root.y1});
 if(bottom!==null)out.push({axis:'y',at:bottom,a:root.x0,b:root.x1});
 const walk=box=>box.children.forEach(c=>{
  const alongX=c.level%2===1;
  if(alongX&&c.x1<box.x1-T)out.push({axis:'x',at:c.x1,a:box.y0,b:box.y1});
  if(!alongX&&c.y1<box.y1-T)out.push({axis:'y',at:c.y1,a:box.x0,b:box.x1});
  walk(c);
 });
 walk(root);
 return cutDisaiMerge(out);
}
function cutDisaiBreakLines(cuts){
 const lines=[];
 for(const c of cuts){
  if(c.b-c.a<=2002)return {error:'A cut line is too short for the 1 mm Disai end gap.'};
  const a=c.a+1000,b=c.b-1000;
  lines.push((c.axis==='x'?[c.at,a,c.at,b]:[a,c.at,b,c.at]).map(v=>cutDisaiText(v,2)).join(' '));
 }
 return {lines};
}
/* The ERP cut tree → Disai levels. Same-direction cuts in a row collapse
   into one level; a level that does not cut here gets one full-width span.
   The result is parsed back: every glass and every cut line must match the
   drawing, otherwise nothing is written. */
function cutTrialDisaiScheme(sheet){
 const E=1e-6,parts=(sheet&&sheet.pieces||[]).slice(),size=sheet&&sheet.size||{};
 const trim=sheet&&sheet.margins?+sheet.margins.trimY:NaN,md=+(sheet&&sheet.minDist)||0;
 if(!parts.length)return {error:'There are no pieces on this sheet.'};
 if(!Number.isFinite(trim)||trim<0||![size.w,size.h].every(v=>Number.isFinite(+v)&&+v>0))return {error:'Disai trial has invalid sheet geometry.'};
 if(parts.length>=2500)return {error:'Disai trial has too many glass pieces for verified IB identifiers.'};
 if(parts.some(p=>!p||!p.footprint||![p.footprint.x,p.footprint.y,p.footprint.w,p.footprint.h].every(Number.isFinite)||p.footprint.w<=0||p.footprint.h<=0))return {error:'Disai trial has invalid glass geometry.'};
 /* Perfect Cut numbers a rotated glass 2500 + ID ([IB127] and [IB2627] in
    the 6 mm sample are the same glass type, ROTATE=0 and ROTATE=1). */
 const index=new Map(parts.map((p,i)=>[p.id,(p.turn===1?2500:0)+i+1]));
 if(index.size!==parts.length)return {error:'Disai trial has duplicate glass identifiers.'};
 const lines=sheet.throughCuts||[],byKey=new Map(lines.map(c=>[c.key,c])),top=lines.find(c=>c.level===1);
 if(!top)return {error:'Disai trial needs the verified cut lines of this sheet.'};
 let fail='';
 const inside=r=>parts.filter(p=>{const f=p.footprint;return f.x>=r.x0-E&&f.y>=r.y0-E&&f.x+f.w<=r.x1+E&&f.y+f.h<=r.y1+E;});
 const build=(r,depth)=>{
  if(fail)return null;
  if(depth>lines.length+1){fail='Disai trial found a looping cut tree.';return null;}
  const c=byKey.get(cutCutKey(r));
  if(!c){
   const list=inside(r),one=list[0];
   if(list.length>1||one&&[one.footprint.x-r.x0,one.footprint.y-r.y0,one.footprint.x+one.footprint.w-r.x1,one.footprint.y+one.footprint.h-r.y1].some(d=>Math.abs(d)>E))
    fail='Disai trial found glass without a verified cut around it.';
   return {r,piece:one||null};
  }
  const lo=c.axis==='x'?{x0:r.x0,y0:r.y0,x1:c.at,y1:r.y1}:{x0:r.x0,y0:r.y0,x1:r.x1,y1:c.at};
  const hi=c.axis==='x'?{x0:c.at,y0:r.y0,x1:r.x1,y1:r.y1}:{x0:r.x0,y0:c.at,x1:r.x1,y1:r.y1};
  return {r,axis:c.axis,at:c.at,lo:build(lo,depth+1),hi:build(hi,depth+1)};
 };
 const v=String(top.key).split(',').map(Number),tree=build({x0:v[0],y0:v[1],x1:v[2],y1:v[3]},0);
 if(fail)return {error:fail};
 /* Disai starts at the left trim line and cuts it through the full height,
    also through waste the drawing keeps whole. That extra cut must not
    leave a strip narrower than Min distance. */
 const clip=n=>{
  if(!n||fail)return null;
  if(n.r.x1<=trim+E){if(inside(n.r).length)fail='Glass lies left of the Trim Y line.';return null;}
  if(n.r.x0>=trim-E)return n;
  const r=Object.assign({},n.r,{x0:trim});
  if(!n.axis){
   if(n.piece)fail='Glass lies left of the Trim Y line.';
   else if(r.x1-trim<md-E)fail='The left Trim line would leave a '+frac16(r.x1-trim)+'″ strip narrower than Min distance.';
   return {r,piece:null};
  }
  if(n.axis==='x'&&n.at<=trim+E){
   if(inside(n.lo.r).length)fail='Glass lies left of the Trim Y line.';
   return clip(n.hi);
  }
  return {r,axis:n.axis,at:n.at,lo:clip(n.lo),hi:n.axis==='x'?n.hi:clip(n.hi)};
 };
 const field=clip(tree);
 if(fail||!field)return {error:fail||'Disai trial has no glass right of the Trim Y line.'};
 /* Levels: the drawing's own cuts first. Where they would need a sixth
    level, that region alone is cut the way Perfect Cut does it — at every
    edge that crosses no glass (for a 12″ stack beside waste: rows across
    the column, then one short cut per row). Every loose piece of waste must
    stay at least Min distance wide. */
 const nodes=new Map(),keep=n=>{if(!n)return;nodes.set(cutCutKey(n.r),n);keep(n.lo);keep(n.hi);};keep(field);
 const exact=(p,r)=>{const f=p.footprint;return [f.x-r.x0,f.y-r.y0,f.x+f.w-r.x1,f.y+f.h-r.y1].every(d=>Math.abs(d)<=E);};
 const flat=(n,axis)=>n.axis===axis?flat(n.lo,axis).concat(flat(n.hi,axis)):[n];
 const along=(r,axis)=>axis==='x'?[r.x0,r.x1]:[r.y0,r.y1];
 const spots=(r,axis,list)=>{
  const [lo,hi]=along(r,axis),out=new Set();
  list.forEach(p=>{const f=p.footprint;(axis==='x'?[f.x,f.x+f.w]:[f.y,f.y+f.h]).forEach(c=>{if(c>lo+E&&c<hi-E)out.add(c);});});
  return [...out].filter(c=>!list.some(p=>{const f=p.footprint,a=axis==='x'?f.x:f.y,b=axis==='x'?f.x+f.w:f.y+f.h;return a<c-E&&b>c+E;})).sort((a,b)=>a-b);
 };
 const split=(r,axis,points)=>{
  const [lo,hi]=along(r,axis),edge=[lo,...points,hi];
  return edge.slice(1).map((b,i)=>axis==='x'?{x0:edge[i],x1:b,y0:r.y0,y1:r.y1}:{x0:r.x0,x1:r.x1,y0:edge[i],y1:b});
 };
 let changed=false;
 const level=(r,L)=>{
  if(L>CUT_DISAI_LEVELS.length)return null;
  const axis=L%2?'x':'y',list=inside(r),n=nodes.get(cutCutKey(r)),tries=[];
  if(n)tries.push({regions:flat(n,axis).map(s=>s.r),own:true});
  tries.push({regions:split(r,axis,spots(r,axis,list)),own:false});
  for(const t of tries){
   const out=[];
   for(const s of t.regions){
    const here=inside(s),[a,b]=along(s,axis);
    if(!here.length){if(b-a<md-E){out.length=0;break;}out.push({r:s});continue;}
    if(here.length===1&&exact(here[0],s)){out.push({r:s,piece:here[0]});continue;}
    const kids=level(s,L+1);
    if(!kids){out.length=0;break;}
    out.push({r:s,kids});
   }
   if(out.length){if(!t.own)changed=changed||!!n;return out;}
  }
  return null;
 };
 const plan=level(field.r,1);
 if(!plan)return {error:'This sheet needs more than five Disai levels (X/Y/Z/U/V).'};
 const scheme=[];
 const emit=(slices,L)=>{
  const axis=L%2?'x':'y';let last=slices.length-1;
  while(last>=0&&!slices[last].piece&&!slices[last].kids)last--;
  for(let i=0;i<=last;i++){
   const s=slices[i],[a,b]=along(s.r,axis);
   scheme.push(CUT_DISAI_LEVELS[L-1]+cutDisaiText(cutDisaiQ(b)-cutDisaiQ(a),3)+(s.piece?' IB'+index.get(s.piece.id):''));
   if(s.kids)emit(s.kids,L+1);
  }
 };
 emit(plan,1);
 const W=cutDisaiQ(+size.w),H=cutDisaiQ(+size.h),T=cutDisaiQ(trim);
 const parsed=cutDisaiParse(scheme,{x0:T,y0:0,x1:W,y1:H,borderRight:cutDisaiQ(+sheet.margins.borderY||0)});
 if(parsed.error)return parsed;
 const boxes=new Map(parsed.boxes.filter(b=>b.ib).map(b=>[b.ib,b]));
 if(boxes.size!==parts.length||parts.some(p=>{
  const b=boxes.get(index.get(p.id)),f=p.footprint;
  return !b||[b.x0-cutDisaiQ(f.x),b.y0-cutDisaiQ(f.y),b.x1-cutDisaiQ(f.x+f.w),b.y1-cutDisaiQ(f.y+f.h)].some(d=>Math.abs(d)>2);
 }))return {error:'Disai SCHEME does not reconstruct every glass footprint exactly.'};
 const drawn=[];
 lines.forEach(c=>{
  if(c.axis==='x'){
   const at=cutDisaiQ(c.x0);
   if(Math.abs(at-T)>2)drawn.push({axis:'x',at,a:cutDisaiQ(Math.min(c.y0,c.y1)),b:cutDisaiQ(Math.max(c.y0,c.y1))});
  }else{
   const a=Math.max(T,cutDisaiQ(Math.min(c.x0,c.x1))),b=cutDisaiQ(Math.max(c.x0,c.x1));
   if(b-a>2)drawn.push({axis:'y',at:cutDisaiQ(c.y0),a,b});
  }
 });
 if(T>2)drawn.push({axis:'x',at:T,a:0,b:H});
 const bottom=cutDisaiBottomTrim(parsed.root);
 if(bottom!==null)drawn.push({axis:'y',at:bottom,a:T,b:W});
 const mine=cutDisaiCuts(parsed.root),theirs=cutDisaiMerge(drawn);
 if(mine.some(c=>parts.some(p=>{
  const f=p.footprint,x0=cutDisaiQ(f.x),x1=cutDisaiQ(f.x+f.w),y0=cutDisaiQ(f.y),y1=cutDisaiQ(f.y+f.h);
  return c.axis==='x'?x0<c.at-2&&c.at<x1-2&&y0<c.b-2&&c.a<y1-2:y0<c.at-2&&c.at<y1-2&&x0<c.b-2&&c.a<x1-2;
 })))return {error:'A Disai cut line would pass through glass.'};
 /* Same lines as on the screen, unless a region had to be re-cut for the
    five-level limit: then the operator is told the order differs. */
 const same=mine.length===theirs.length&&mine.every((c,i)=>{const d=theirs[i];return c.axis===d.axis&&[c.at-d.at,c.a-d.a,c.b-d.b].every(x=>Math.abs(x)<=2);});
 const breaks=cutDisaiBreakLines(mine);
 if(breaks.error)return breaks;
 return {scheme,index,breaks:breaks.lines,sameAsScreen:same&&!changed};
}
