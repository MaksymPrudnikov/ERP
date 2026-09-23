/* =====================================================================
   erp/production/cut-machine-export
   A read-only, machine-neutral snapshot of a built cutting plan.

   This is NOT a controller program. Maver uses ISO + BMP, while Disai uses
   DST + SUM in the owner's Perfect Cut samples (23 September 2026). Their
   commands, thickness encoding and shaped-glass records must be verified
   before either machine format is offered for download.
   ===================================================================== */
function cutMachinePoint(piece,q){
 const turn=cutPieceTurn(piece),x=+q[0],y=+q[1];
 if(turn===1)return [piece.x+piece.w-y,piece.y+x];
 if(turn===2)return [piece.x+piece.w-x,piece.y+piece.h-y];
 if(turn===3)return [piece.x+y,piece.y+piece.h-x];
 return [piece.x+x,piece.y+y];
}
function cutMachineSnapshot(number){
 const errors=[],batch=glassBatchFind(number),plan=cutPlanFor(number);
 if(!batch)errors.push('Batch not found.');
 if(!plan||plan.reset)errors.push('Build the cutting layout first.');
 if(errors.length)return {valid:false,batch:number,errors,sheets:[]};
 if(cutPlanStale(number))errors.push('The batch changed after Build. Reset and Build again.');
 const source=cutPieces(batch,plan.settings||{}).filter(p=>!p.off),byId=new Map(),seen=new Set(),sheets=[];
 source.forEach(p=>{if(byId.has(p.piece))errors.push('Duplicate source piece '+p.piece+'.');byId.set(p.piece,p);});
 (plan.groups||[]).forEach(group=>(group.sheets||[]).forEach(sheet=>{
  /* A manually added empty sheet is not a cutting program. Keep its number in
     the ERP plan, but do not invent a machine file for it. */
  if(!(sheet.pieces||[]).length&&!(sheet.stock||[]).length)return;
  const localErrors=errors.length;
  const size=sheet.size||group.sheet;
  if(!size||!(+size.w>0)||!(+size.h>0)){
   errors.push('Sheet '+sheet.no+' has invalid dimensions or margins.');return;
  }
  const params=cutGroupParams(group,size),usable=cutUsable(size,params),effectiveTrimY=cutEffectiveTrimY(sheet,params);
  if(!(usable.W>0)||!(usable.H>0)){
   errors.push('Sheet '+sheet.no+' has invalid dimensions or margins.');return;
  }
  if(!Number.isFinite(+group.mm)||!(+group.mm>0))errors.push('Sheet '+sheet.no+' has no valid glass thickness.');
  const occupants=[],parts=[];
  (sheet.pieces||[]).forEach(piece=>{
   const src=byId.get(piece.piece),turn=cutPieceTurn(piece),odd=turn%2===1;
   if(!src){errors.push('Sheet '+sheet.no+' contains an unknown piece '+piece.piece+'.');return;}
   if(seen.has(piece.piece))errors.push('Piece '+piece.piece+' is placed more than once.');
   seen.add(piece.piece);
   if(src.glass!==group.glass||Math.abs(src.mm-group.mm)>1e-6)errors.push('Piece '+piece.piece+' has the wrong glass or thickness.');
   if(!src.shape&&turn>1)errors.push('Rectangle '+piece.piece+' has an unsupported rotation.');
   if(![piece.x,piece.y,piece.w,piece.h].every(Number.isFinite)||!(piece.w>0)||!(piece.h>0)||
      Math.abs(piece.w-(odd?src.h:src.w))>1/16+1e-6||Math.abs(piece.h-(odd?src.w:src.h))>1/16+1e-6){
    errors.push('Piece '+piece.piece+' has invalid placement dimensions.');return;
   }
   const footprint={x:piece.x,y:piece.y,w:piece.w,h:piece.h};
   if(src.shape&&(!Array.isArray(src.pts)||src.pts.length<3))errors.push('Shape '+piece.piece+' has no verified cutting contour.');
   const local=src.shape?Array.isArray(src.pts)?src.pts:[]:[[0,0],[src.w,0],[src.w,src.h],[0,src.h]];
   const contour=local.map(q=>cutMachinePoint(piece,q));
   if(contour.some(q=>!q.every(Number.isFinite)||q[0]<piece.x-1e-6||q[0]>piece.x+piece.w+1e-6||
      q[1]<piece.y-1e-6||q[1]>piece.y+piece.h+1e-6))errors.push('Piece '+piece.piece+' has a contour outside its footprint.');
   occupants.push(footprint);
   parts.push({id:piece.piece,order:src.order,orderId:src.orderId,customer:src.customer,line:src.line,
    unit:src.unit,mark:src.mark,glass:src.glass,mm:src.mm,shape:!!src.shape,turn,
    footprint,contour});
  });
  const stock=(sheet.stock||[]).map(p=>({id:p.id,x:+p.x,y:+p.y,w:+p.w,h:+p.h}));
  stock.forEach(p=>occupants.push({x:p.x,y:p.y,w:p.w,h:p.h}));
  occupants.forEach((p,i)=>{
   if(![p.x,p.y,p.w,p.h].every(Number.isFinite)||!(p.w>0)||!(p.h>0)||
      p.x<usable.x0-1e-6||p.y<usable.y0-1e-6||p.x+p.w>usable.x1+1e-6||p.y+p.h>usable.y1+1e-6)
    errors.push('Sheet '+sheet.no+' has an occupant outside the usable area.');
   occupants.slice(i+1).forEach(q=>{
    if(p.x<q.x+q.w-1e-6&&q.x<p.x+p.w-1e-6&&p.y<q.y+q.h-1e-6&&q.y<p.y+p.h-1e-6)
     errors.push('Sheet '+sheet.no+' has overlapping occupants.');
   });
  });
  let cut=null;
  if(errors.length===localErrors){
   try{cut=cutSheetCutsFor(group,sheet);}catch(e){}
   if(!cut||!cut.ok)errors.push('Sheet '+sheet.no+' cannot be separated by through cuts.');
  }
  sheets.push({glass:group.glass,mm:+group.mm,no:sheet.no,
   size:{w:+size.w,h:+size.h,key:cutSheetKey(size)},
   margins:{trimX:params.trimX,trimY:effectiveTrimY,borderX:params.borderX,borderY:params.borderY},
   minimumMargins:{trimX:params.trimX,trimY:params.trimY,borderX:params.borderX,borderY:params.borderY},
   usable:{x0:effectiveTrimY,y0:usable.y0,x1:usable.x1,y1:usable.y1},
   pieces:parts,stock,
   throughCuts:cut?(cut.lines||[]).map(x=>({x0:x.x0,y0:x.y0,x1:x.x1,y1:x.y1,level:x.level})):[]});
 }));
 source.forEach(p=>{if(!seen.has(p.piece))errors.push('Piece '+p.piece+' is not on any sheet.');});
 if(!sheets.length)errors.push('There are no occupied sheets to export.');
 return {valid:!errors.length,batch:number,stamp:plan.stamp,at:plan.at,
  sheets,excluded:(plan.excluded||[]).slice(),errors};
}
