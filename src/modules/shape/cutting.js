/* =====================================================================
   shape/cutting · schema-v2
   Детерминированная Cutting Geometry. Невалидный offset блокируется.
   Generic DXF — нейтральный обменный файл, не постпроцессор конкретного CNC.
   ===================================================================== */

function shapeOffsetVariable(points,distances){
  if(!points||points.length<3)return {valid:false,error:'Offset requires a closed contour.'};
  var n=points.length,orient=fabSignedArea(points),lines=[],i;
  for(i=0;i<n;i++){
    var a=points[i],b=points[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<1e-9)return {valid:false,error:'Offset source contains a degenerate edge.'};
    var d=Math.max(0,+distances[i]||0),nx=orient<0?-dy/L:dy/L,ny=orient<0?dx/L:-dx/L;
    lines.push({a:[a[0]+nx*d,a[1]+ny*d],b:[b[0]+nx*d,b[1]+ny*d],d:d,sourceId:i});
  }
  var out=[];
  for(i=0;i<n;i++){
    var prev=lines[(i-1+n)%n],cur=lines[i],hit=fabLineIntersection(prev.a,prev.b,cur.a,cur.b),v=points[i],lim=Math.max(.25,Math.max(prev.d,cur.d)*10);
    if(!hit)hit=[(prev.b[0]+cur.a[0])/2,(prev.b[1]+cur.a[1])/2];
    if(Math.hypot(hit[0]-v[0],hit[1]-v[1])>lim)return {valid:false,error:'Cutting offset creates an excessive miter at contour vertex '+(i+1)+'.'};
    out.push(hit);
  }
  if(fabPolySelfIntersects(out))return {valid:false,error:'Cutting offset self-intersects. Change the contour or edge allowances.'};
  if(Math.abs(fabSignedArea(out))<1e-6)return {valid:false,error:'Cutting offset encloses no area.'};
  return {valid:true,points:out};
}
/* ---------- Внешняя оболочка контура ----------
   Стол режет только наружный контур: нотчи, угловые блоки и любые вогнутые
   вырезы выпиливаются позже, от обработанной кромки. Поэтому перед offset
   контур сводится к выпуклой оболочке — вогнутые участки исчезают, скосы и
   наклонные стороны остаются как есть.
   Припуск исчезнувших кромок не теряется: ребро оболочки берёт максимум из
   припусков всех кромок, которые оно перекрыло. */
function shapeConcaveVertex(P,i,orient){
  var n=P.length,a=P[(i-1+n)%n],b=P[i],c=P[(i+1)%n];
  return ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))*orient<-1e-7;
}
/* Вогнутый участок заполняется ПРОДОЛЖЕНИЕМ соседних кромок до их
   пересечения, а не хордой от точки до точки: заготовка под нотчем в углу
   должна остаться прямоугольной, а не срезанной по диагонали. */
function shapeFillNotches(points,dist,ids){
  var P=points.map(function(p){return p.slice();}),D=(dist||[]).slice(),I=(ids||[]).slice();
  if(P.length<4)return {points:P,dist:D,ids:I,reduced:false,removed:0};
  var orient=fabSignedArea(P)>=0?1:-1,guard=0,removed=0,i,n;
  while(guard++<400){
    n=P.length;if(n<4)break;
    var found=-1;
    for(i=0;i<n;i++)if(shapeConcaveVertex(P,i,orient)){found=i;break;}
    if(found<0)break;
    var pm2=(found-2+n)%n,pm=(found-1+n)%n,pp=(found+1)%n,pp2=(found+2)%n;
    if(pm2===pp||pm2===pp2||pm===pp2)break;
    var hit=fabLineIntersection(P[pm2],P[pm],P[pp],P[pp2]);
    if(!hit)break;
    /* Припуск снятых кромок не теряется: он поднимается в обе оставшиеся. */
    var lost=Math.max(+D[pm]||0,+D[found]||0);
    var keepP=[],keepD=[],keepI=[],j=pp2;
    while(true){
      keepP.push(P[j]);
      keepD.push(j===pm2?Math.max(+D[j]||0,lost):(+D[j]||0));
      keepI.push(I[j]);
      if(j===pm2)break;
      j=(j+1)%n;
    }
    keepP.push(hit);keepD.push(Math.max(+D[pp]||0,lost));keepI.push(I[pm]!=null?I[pm]:I[pp]);
    P=keepP;D=keepD;I=keepI;removed+=2;
  }
  /* Точки, оказавшиеся на одной прямой, схлопываем — они ничего не задают. */
  if(removed){
    var cp=[],cd=[],ci=[],m=P.length;
    for(i=0;i<m;i++){
      var a=P[(i-1+m)%m],b=P[i],c=P[(i+1)%m];
      var cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(Math.abs(cr)<1e-7&&Math.abs((+D[(i-1+m)%m]||0)-(+D[i]||0))<1e-9)continue;
      cp.push(b);cd.push(D[i]);ci.push(I[i]);
    }
    if(cp.length>=3){P=cp;D=cd;I=ci;}
  }
  return {points:P,dist:D,ids:I,reduced:removed>0,removed:removed};
}
function shapeCuttingGeometry(def,geo,fg){
  var points=(geo.points||[]).map(function(p){return p.slice();}),ids=geo.pointEdgeIds||[],dist=points.map(function(_,i){var e=(geo.edges||[])[i]||{id:ids[i]};return shapeEdgeAllowance(def,e);});
  var hull=shapeFillNotches(points,dist,ids);
  var off=shapeOffsetVariable(hull.points,hull.dist);if(!off.valid)return {valid:false,error:off.error,finishedPoints:points,points:[],holes:[],cutouts:[],hardware:[],warnings:[]};
  var b=fabEdgeBounds(off.points),curves=(geo.edges||[]).some(function(e){return e.type!=='line';}),warnings=[];
  if(curves)warnings.push('Curved cutting contour is tessellated to the Shape sampling tolerance; verify the target machine postprocessor.');
  /* Первичная резка — только внешний контур. Порядок цеха: рез → кромка →
     отверстия/нотчи/подготовка под фурнитуру. Всё, что делается ПОСЛЕ кромки,
     базируется на обработанном крае и в cutting-файл не попадает никогда —
     это не исключение для отдельной детали, а безусловное правило.
     Готовый чертёж по-прежнему показывает их из featureGeometry. */
  var holes=[],cutouts=[],hardware=[];
  var types={};(geo.edges||[]).forEach(function(e){if(e&&e.id!=null)types[e.id]=e.type;});
  var border=shapeSafetyBorderPlan(def,hull.points,hull.ids,types),footprint=shapeBorderFootprint(off.points,border);
  if(border.manualRequired)warnings.push('Safety Border has no automatic value for this thickness — set it manually before cutting.');
  if(hull.reduced)warnings.push('Notches and cutouts are excluded from the cutting contour — they are fabricated after edgework.');
  return {valid:true,points:off.points,finishedPoints:points,edgeIds:(hull.ids||[]).slice(),allowances:(hull.dist||[]).slice(),notchesRemoved:hull.removed,holes:holes,cutouts:cutouts,hardware:hardware,minX:b.minX,maxX:b.maxX,minY:b.minY,maxY:b.maxY,width:b.maxX-b.minX,height:b.maxY-b.minY,safetyBorder:border,footprint:footprint,warnings:warnings,toleranceIn:1/256};
}
function shapeMachinePayload(result){
  if(!result||!result.valid||!result.cutting||!result.cutting.valid)return null;
  var c=result.cutting,round=function(v){return Math.round(v*1000000)/1000000;},pts=function(P){return P.map(function(p){return [round(p[0]),round(p[1])];});};
  /* Бордер уезжает в payload отдельным блоком, а не в геометрии outer:
     раскрою нужно знать требуемый отступ, но контур реза от него не меняется. */
  var brd=c.safetyBorder||{value:0,state:'AUTO',edgeIds:[],applies:false},fp=c.footprint||{width:c.width,height:c.height,sides:[]};
  return {schema:'glass-erp-cutting/v1',units:'inch',shapeId:result.definition.id,revision:result.definition.revision||0,type:result.definition.type,toleranceIn:c.toleranceIn,outer:{closed:true,points:pts(c.points)},safetyBorder:{value:round(brd.value),state:brd.state,applies:!!brd.applies,edgeIds:(brd.edgeIds||[]).slice()},billableFootprint:{width:round(fp.width),height:round(fp.height),sides:(fp.sides||[]).slice()},holes:c.holes.map(function(h){return {id:h.id,center:pts([h.center])[0],diameter:round(h.diameter)};}),cutouts:c.cutouts.map(function(x){return {id:x.id,closed:true,points:pts(x.points),cornerRadius:round(x.cornerRadius||0)};}),hardware:c.hardware.map(function(h){return {id:h.id,name:h.name,closed:true,points:pts(h.points),hole:{center:pts([h.hole.center])[0],diameter:round(h.hole.diameter)}};}),requirements:(result.requirements||[]).filter(function(q){return q.source!=='MANUFACTURING';})};
}
/* ---------- DXF ----------
   Три файла разного назначения:
   · чертёж   — готовая деталь, что получает клиент;
   · резка    — ТОЛЬКО линия реза. Неизвестно, как станок отреагирует на
                постороннюю геометрию, поэтому её там нет вообще;
   · проверка — всё слоями в одном нуле, чтобы наложить и померить в Fusion.
                На станок не отдавать.
   Ноль: у чертежа и проверки — нижний левый угол ГОТОВОГО контура, тогда
   припуск читается прямо по координатам (рез уходит в минус). У файла резки —
   нижний левый угол самого реза, чтобы все координаты были в плюсе. */
function shapeDxfPolyline(P,layer){
  var o='0\nPOLYLINE\n8\n'+layer+'\n66\n1\n70\n1\n';
  (P||[]).forEach(function(p){o+='0\nVERTEX\n8\n'+layer+'\n10\n'+(+p[0]).toFixed(6)+'\n20\n'+(+p[1]).toFixed(6)+'\n30\n0\n';});return o+'0\nSEQEND\n';
}
function shapeDxfCircle(c,r,layer){
  return '0\nCIRCLE\n8\n'+layer+'\n10\n'+(+c[0]).toFixed(6)+'\n20\n'+(+c[1]).toFixed(6)+'\n30\n0\n40\n'+(+r).toFixed(6)+'\n';
}
function shapeDxfOpen(){return '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';}
function shapeDxfClose(){return '0\nENDSEC\n0\nEOF\n';}
function shapeDxfShift(P,d){return (P||[]).map(function(q){return [q[0]-d[0],q[1]-d[1]];});}
function shapeDxfFinishedOrigin(result){
  var c=result&&result.cutting,P=(c&&c.finishedPoints&&c.finishedPoints.length)?c.finishedPoints:((result&&result.points)||[]);
  if(!P.length)return [0,0];
  var b=fabEdgeBounds(P);return [b.minX,b.minY];
}
/* Зона раскроя: прямоугольник контура реза плюс бордер с тех сторон, где он
   стоит. Бордер меряется по прямой, под 90°, а не параллельно скосу. */
function shapeBorderZoneRect(c){
  var brd=c&&c.safetyBorder,fp=c&&c.footprint;
  if(!brd||!brd.applies||!fp||!fp.pad)return null;
  var b=fabEdgeBounds(c.points||[]),p=fp.pad;
  var x0=b.minX-(p.left||0),x1=b.maxX+(p.right||0),y0=b.minY-(p.bottom||0),y1=b.maxY+(p.top||0);
  return [[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
}
/* Чертёж: то, что получает клиент. Отверстия и вырезы делаются после кромки,
   но на чертеже они обязаны быть. */
function shapeFinishedDxf(result){
  var c=result&&result.cutting;
  var P=(c&&c.finishedPoints)||(result&&result.points);
  if(!P||!P.length)return null;
  var d=shapeDxfFinishedOrigin(result),fg=(result&&result.featureGeometry)||{},o=shapeDxfOpen();
  o+=shapeDxfPolyline(shapeDxfShift(P,d),'FINISHED_OUTER');
  (fg.holes||[]).forEach(function(h){o+=shapeDxfCircle([h.center[0]-d[0],h.center[1]-d[1]],h.diameter/2,'HOLES');});
  (fg.cutouts||[]).forEach(function(x){o+=shapeDxfPolyline(shapeDxfShift(x.points,d),'CUTOUTS');});
  return o+shapeDxfClose();
}
/* Файл для станка: одна линия реза и ничего больше. */
function shapeGenericDxf(result){
  var p=shapeMachinePayload(result);if(!p)return null;
  var b=fabEdgeBounds(p.outer.points);
  return shapeDxfOpen()+shapeDxfPolyline(shapeDxfShift(p.outer.points,[b.minX,b.minY]),'CUT_OUTER')+shapeDxfClose();
}
/* Проверочный файл: готовый контур, рез, зона бордера и справочные фичи —
   слоями, в одном нуле. */
function shapeCheckDxf(result){
  var c=result&&result.cutting;
  if(!c||!c.valid)return null;
  var d=shapeDxfFinishedOrigin(result),fg=(result&&result.featureGeometry)||{},o=shapeDxfOpen();
  o+=shapeDxfPolyline(shapeDxfShift(c.finishedPoints,d),'FINISHED_OUTER');
  o+=shapeDxfPolyline(shapeDxfShift(c.points,d),'CUT_OUTER');
  var zone=shapeBorderZoneRect(c);
  if(zone)o+=shapeDxfPolyline(shapeDxfShift(zone,d),'SAFETY_BORDER');
  (fg.holes||[]).forEach(function(h){o+=shapeDxfCircle([h.center[0]-d[0],h.center[1]-d[1]],h.diameter/2,'REFERENCE');});
  (fg.cutouts||[]).forEach(function(x){o+=shapeDxfPolyline(shapeDxfShift(x.points,d),'REFERENCE');});
  return o+shapeDxfClose();
}
