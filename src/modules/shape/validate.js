/* =====================================================================
   shape/validate  ·  v4.5-port
   Валидация Smart-Shape: размеры, локти, угловые блоки, самопересечение.
   IN : линия Shape S
   OUT: {errors[], warns[]}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function ssValidate(S){
  var m=ssModel(S),errors=[],warns=[];
  ['A','B','C'].forEach(function(e){
    var L=ssEdgeLen(S,e),nm=(e==='A'?'A (left / Height)':e==='B'?'B (bottom / Width)':'C (right)');
    if(!(L>0)){errors.push('Edge '+nm+': length must be greater than 0.');return;}
    if(e==='C'){var rc=fabParseDimStrict(m.C.len);if(m.C.len!==''&&!rc.ok)errors.push('Edge C: "'+m.C.len+'" is not a valid dimension.');}
    if(!m.elbowsOn){
      var ro=fabParseDimStrict(m[e].out);
      if(m[e].out!==''&&!ro.ok)errors.push('Edge '+e+': out of plumb / level "'+m[e].out+'" is not a valid dimension.');
      else if(ro.ok&&ro.v<0)errors.push('Edge '+e+': out of plumb / level cannot be negative.');
      else if(ro.ok&&ro.v>0&&!m[e].dir)errors.push('Edge '+e+': pick which way it is out of plumb / level.');
      return;
    }
    var E=m[e].elbow,bad=null;
    ['to','elbowLen','past'].forEach(function(k){var r=fabParseDimStrict(E[k]);if(E[k]!==''&&!r.ok)bad=k;else if(r.ok&&r.v<0)bad=k;});
    if(bad){errors.push('Edge '+e+': "'+E[bad]+'" is not a valid '+(bad==='elbowLen'?'elbow length':'outage')+'.');return;}
    var to=ssNN(E.to),past=ssNN(E.past),h=ssNN(E.elbowLen);
    if(h>L+1e-9){errors.push('Edge '+e+': elbow length '+dimIn(h)+' is longer than the edge ('+dimIn(L)+').');return;}
    /* Излом без уклона хотя бы с одной стороны геометрически НЕ существует —
       сторона выходит прямой. Раньше такой ввод молча выбрасывался: человек
       задавал длину излома, на чертеже не менялось ничего и причина нигде
       не называлась. Теперь это ошибка с текстом. */
    if(h>1e-9&&to<=0&&past<=0){errors.push('Edge '+e+': an edge with an elbow must be out of plumb / level on at least one side of the elbow.');return;}
    if(to<=0&&past<=0)return;
    if(!E.mode){errors.push('Edge '+e+': pick the elbow form (direction of the skew).');return;}
    /* elbow length 0 (или равный ребру) — обычный способ задать простой уклон:
       ребро берётся прямым, предупреждать не о чем. */
  });
  /* Верхняя сторона проверяется отдельно: у неё входными являются только длина
     излома, уход первого отрезка и форма. Длину стороны и уход второго отрезка
     задаёт замыкание контура, вводить их нельзя, значит и проверять нечего. */
  if(!errors.length&&m.elbowsOn){
    var ED=m.D.elbow,badD=null;
    ['to','elbowLen'].forEach(function(k){var r=fabParseDimStrict(ED[k]);if(ED[k]!==''&&!r.ok)badD=k;else if(r.ok&&r.v<0)badD=k;});
    if(badD)errors.push('Edge D (top): "'+ED[badD]+'" is not a valid '+(badD==='elbowLen'?'elbow length':'outage')+'.');
    else{
      var hD=ssNN(ED.elbowLen),toD=ssNN(ED.to),GD=ssBase(S),spanD=Math.abs(GD.Dsigned),dropD=Math.abs(GD.Dout);
      if(hD>1e-9){
        if(hD>=spanD-1e-9)errors.push('Edge D (top): elbow length '+dimIn(hD)+' leaves no room on a side of '+dimIn(spanD)+'.');
        else if(!ED.mode)errors.push('Edge D (top): pick the elbow form (direction of the skew).');
        /* Уход второго отрезка выводится из замыкания. Если стороны выходят на
           одну высоту, а первый отрезок не уведён, ломаная вырождается в прямую. */
        else if(toD<=0&&dropD<=1e-9)errors.push('Edge D (top): an edge with an elbow must be out of level on at least one side of the elbow.');
      }
    }
  }
  if(errors.length)return {errors:errors,warns:warns};
  SS_ORDER.forEach(function(k){
    var c=m.cornerOffsets[k]||{};
    [['plumb','plumbDir'],['level','levelDir']].forEach(function(pair){
      var raw=c[pair[0]],r=fabParseDimStrict(raw),axis=pair[0]==='plumb'?'out of plumb':'out of level';
      if(raw!==''&&!r.ok)errors.push('Corner '+k.toUpperCase()+': '+axis+' "'+raw+'" is not a valid dimension.');
      else if(r.ok&&r.v<0)errors.push('Corner '+k.toUpperCase()+': '+axis+' cannot be negative.');
      else if(r.ok&&r.v>0&&!c[pair[1]])errors.push('Corner '+k.toUpperCase()+': pick the '+axis+' direction.');
    });
  });
  if(errors.length)return {errors:errors,warns:warns};
  var all=ssEdgeMap(S).all;
  all.forEach(function(e){
    var x=m.extraEdges[e.id]||{},raw=x.len;if(raw==null)raw='';var r=fabParseDimStrict(raw);
    if(!r.ok||r.v<=0){errors.push('Corner edge '+e.id+' ('+e.corner.toUpperCase()+'): '+((!r.ok&&raw!=='')?'"'+raw+'" is not a valid dimension':'no value yet')+'.');return;}
    /* Скос ребра нотча проверяется теми же правилами, что и уклон основной стороны. */
    var ro=fabParseDimStrict(x.out==null?'0':x.out);
    if(x.out!==''&&x.out!=null&&!ro.ok)errors.push('Corner edge '+e.id+': out of plumb / level "'+x.out+'" is not a valid dimension.');
    else if(ro.ok&&ro.v<0)errors.push('Corner edge '+e.id+': out of plumb / level cannot be negative.');
    else if(ro.ok&&ro.v>0&&!x.dir)errors.push('Corner edge '+e.id+': pick which way it is out of '+(e.axis==='v'?'plumb':'level')+'.');
    else if(ro.ok&&ro.v>=r.v)errors.push('Corner edge '+e.id+': out of plumb / level '+dimIn(ro.v)+' must be smaller than the edge itself ('+dimIn(r.v)+').');
  });
  if(errors.length)return {errors:errors,warns:warns};
  var G=ssBase(S),T={tl:ssCornerTotals(S,'tl'),tr:ssCornerTotals(S,'tr'),br:ssCornerTotals(S,'br'),bl:ssCornerTotals(S,'bl')};
  /* Скос ребра нотча входит в суммы угла и может увести их в минус —
     это значит, что лесенка выворачивается наружу детали. */
  ['tl','tr','br','bl'].forEach(function(c){
    if(!T[c].vals.length)return;
    if(T[c].v<-1e-9)errors.push('Corner '+c.toUpperCase()+': the skew of the horizontal notch edges turns the corner inside out.');
    if(T[c].h<-1e-9)errors.push('Corner '+c.toUpperCase()+': the skew of the vertical notch edges turns the corner inside out.');
  });
  function fit(used,avail,txt){if(used-avail>1e-9)errors.push(txt+': corner steps '+dimIn(used)+' do not fit in '+dimIn(avail)+'.');}
  fit(T.tl.v+T.bl.v,Math.abs(G.AT[1]-G.BL[1]),'Left side (A)');
  fit(T.tr.v+T.br.v,Math.abs(G.CT[1]-G.BR[1]),'Right side (C)');
  fit(T.bl.h+T.br.h,Math.abs(G.BR[0]-G.BL[0]),'Bottom (B)');
  fit(T.tl.h+T.tr.h,G.Dlen,'Top (D)');
  if(G.Dlen<=1e-9)errors.push('Top D is degenerate: its horizontal projection is zero.');
  if(!errors.length){
    var Q=ssContour(S);
    if(Q.pts.length<3)errors.push('Smart-Shape outline could not be built.');
    else if(fabPolySelfIntersects(Q.pts))errors.push('Smart-Shape outline self-intersects. Check the outages and corner blocks.');
    else if(Math.abs(fabSignedArea(Q.pts))<1e-6)errors.push('Smart-Shape outline encloses no area.');
  }
  Object.keys(SS_BAD).forEach(function(k){warns.push('"'+SS_BAD[k]+'" is not a valid dimension ('+k.replace(/:/g,' · ')+') — the last valid value is still in use.');});
  return {errors:errors,warns:warns};
}
function ssWarnings(S){
  if(!S||!S.shape||S.shape.type!=='smart')return [];
  try{return ssValidate(S).warns;}catch(e){return [];}
}

function shapeValidateDefinitionInputs(def){
  var errors=[],W=inch(def.w),H=inch(def.h),p=def.params||{},type=def.type;
  if(!SHAPE_PRESETS.some(function(x){return x.id===type;}))errors.push('Unknown Shape type '+type+'.');
  function dim(k){var r=fabParseDimStrict(p[k]);if(!r.ok){errors.push(shapePresetInfo(type).label+': '+k+' is not a valid dimension.');return NaN;}return r.v;}
  var values={};shapeParamSpecsFor(type).forEach(function(s){values[s.key]=dim(s.key);});
  function nonnegative(k){if(isFinite(values[k])&&values[k]<0)errors.push(shapePresetInfo(type).label+': '+k+' cannot be negative.');}
  Object.keys(values).forEach(nonnegative);
  if(type==='parallelogram')errors=errors.concat(shapeParallelogramValues(def.w,def.h,p).errors);
  if(type==='raked'){
    var rq=shapeRakedValues(def.w,def.h,p);errors=errors.concat(rq.errors||[]);
    if(['top','bottom','left','right'].indexOf(String(p.rakeSide||'top').toLowerCase())<0)errors.push('Raked Rectangle: Rake Side must be Top, Bottom, Left or Right.');
    if(['left','right'].indexOf(String(p.shortSide||'right').toLowerCase())<0)errors.push('Raked Rectangle: Short Side must be Left or Right.');
  }
  if(type==='triangle'){
    errors=errors.concat(shapeTriangleValues(def.w,def.h,p).errors||[]);
    if(SHAPE_TRI_MEASURES.every(function(x){return x.id!==String(p.measureMode||'square').toLowerCase();}))errors.push('Triangle: Measure must be Square Mode or Diagonal Mode.');
  }
  if(type.indexOf('notch-left')===0||type.indexOf('notch-right')===0){
    if(type.indexOf('double')>=0){if(!(values.depth1>0&&values.depth1<W&&values.depth2>0&&values.depth2<W))errors.push('Double notch depths must be greater than zero and less than Width.');if(!(values.height1>0&&values.height2>0&&values.gap>=0&&values.height1+values.gap+values.height2<H))errors.push('Double notch heights and gap must fit inside Height.');}
    else{if(!(values.depth>0&&values.depth<W))errors.push('Notch depth must be greater than zero and less than Width.');if(!(values.height>0&&values.fromBottom>=0&&values.fromBottom+values.height<H))errors.push('Notch height and position must fit inside Height.');}
  }
  if(type==='notch-middle'){if(!(values.width>0&&values.fromLeft>=0&&values.fromLeft+values.width<W))errors.push('Middle notch width and position must fit inside Width.');if(!(values.depth>0&&values.depth<H))errors.push('Middle notch depth must be greater than zero and less than Height.');}
  if(type==='notch-both'){if(!(values.depth>0&&values.depth<W/2))errors.push('Both-notch depth must be greater than zero and less than half Width.');if(!(values.height>0&&values.fromBottom>=0&&values.fromBottom+values.height<H))errors.push('Both-notch height and position must fit inside Height.');}
  if(type==='polygon')errors=errors.concat(shapeRegularPolygonValues(p).errors||[]);
  if(type==='custom'){
    var cpts=def.polygon||[];
    if(cpts.length<3)errors.push('Custom Shape requires at least three points.');
    cpts.forEach(function(v,i){
      ['x','y'].forEach(function(k){if(!fabParseDimStrict(v[k]).ok)errors.push('Custom Shape point '+v.id+': '+k.toUpperCase()+' is not a valid dimension.');});
      /* Две совпавшие подряд точки дают ребро нулевой длины: контур ещё не
         пересечён, но обработка кромки уже некуда встать. */
      var prev=cpts[(i-1+cpts.length)%cpts.length],x=fabParseDimStrict(v.x),y=fabParseDimStrict(v.y),px=fabParseDimStrict(prev.x),py=fabParseDimStrict(prev.y);
      if(prev!==v&&x.ok&&y.ok&&px.ok&&py.ok&&Math.abs(x.v-px.v)<1e-9&&Math.abs(y.v-py.v)<1e-9)errors.push('Custom Shape point '+v.id+' repeats point '+prev.id+'.');
    });
  }
  return errors;
}

/* Полная fail-closed проверка schema v2. Ошибка блокирует сохранение/экспорт
   режущего контура; предупреждение требует решения технолога, но не подменяет
   геометрию приблизительными значениями. */

function shapeValidateSource(def){
  var source=shapeNormalizeSource(def&&def.source),errors=[],warns=[],preview=source.preview||shapeNormalizeDxfPreview(null);
  if(source.kind!=='dxf')return {errors:errors,warns:warns};
  if(!source.fileName||!/\.dxf$/i.test(source.fileName))errors.push('DXF source requires a .dxf file.');
  if(!(source.fileSize>0))errors.push('DXF source file is empty.');
  if(!source.uploadedAt||isNaN(Date.parse(source.uploadedAt)))errors.push('DXF source upload timestamp is missing or invalid.');
  if(preview.units!=='in')errors.push('DXF preview units must be inches.');
  if(!Array.isArray(preview.points)||preview.points.length<3)errors.push('DXF preview contour is missing.');
  if(!(preview.width16>0&&preview.height16>0))errors.push('DXF preview Width and Height are missing.');
  if(preview.points.length>=3){
    if(preview.points.some(function(p){return !Array.isArray(p)||!isFinite(+p[0])||!isFinite(+p[1]);}))errors.push('DXF preview contour contains an invalid coordinate.');
    else{
      if(fabPolySelfIntersects(preview.points))errors.push('DXF preview contour self-intersects.');
      if(Math.abs(fabSignedArea(preview.points))<1e-8)errors.push('DXF preview contour encloses no area.');
      var b=fabEdgeBounds(preview.points),w16=Math.round((b.maxX-b.minX)*16),h16=Math.round((b.maxY-b.minY)*16);
      if(w16!==preview.width16||h16!==preview.height16)errors.push('DXF preview dimensions do not match its contour.');
    }
  }
  return {errors:Array.from(new Set(errors)),warns:warns};
}

function shapeValidateComputed(def,geo,fg){
  var errors=[],warns=[],pts=geo.points||geo.pts||[],eps=1e-6;
  errors=errors.concat(shapeValidateDefinitionInputs(def));
  if(!geo.ok)errors=(geo.errors||[geo.error||'Shape geometry is invalid.']).slice();
  if(!(inch(def.w)>0&&inch(def.h)>0))errors.push('Width and Height must be greater than zero.');
  if(def.type==='circle'&&Math.abs(inch(def.w)-inch(def.h))>1/64)errors.push('Circle requires equal Width and Height (one physical diameter).');
  if(pts.length<3)errors.push('Finished contour must contain at least three points.');
  if(pts.some(function(p){return !isFinite(p[0])||!isFinite(p[1]);}))errors.push('Finished contour contains a non-finite coordinate.');
  if(pts.length>=3&&fabPolySelfIntersects(pts))errors.push('Finished contour self-intersects.');
  if(pts.length>=3&&Math.abs(fabSignedArea(pts))<1e-5)errors.push('Finished contour encloses no area.');
  (geo.radiusErrors||[]).forEach(function(e){errors.push(e);});
  var vertexIds=Object.create(null),radiusTargets=Object.create(null);(geo.vertices||[]).forEach(function(v){vertexIds[v.id]=true;});
  (def.features||[]).filter(function(f){return f.type==='radius';}).forEach(function(f){
    if(!(inch(f.radius)>0))errors.push('Radius '+f.id+': radius must be greater than zero.');
    if(!f.vertexId||!vertexIds[f.vertexId])errors.push('Radius '+f.id+': referenced physical vertex does not exist.');
    else if(radiusTargets[f.vertexId])errors.push('Only one radius definition is allowed at vertex '+f.vertexId+'.');
    radiusTargets[f.vertexId]=true;
  });
  Object.keys(geo.radiusMeta||{}).forEach(function(id){
    var meta=geo.radiusMeta[id],parents=meta.parentEdges||[];if(parents.length!==2)return;
    var a=shapeEdgeAllowance(def,{id:parents[0]}),b=shapeEdgeAllowance(def,{id:parents[1]});
    if(Math.abs(a-b)>eps)errors.push('Radius '+meta.vertexId+': adjacent edge cutting allowances must match ('+parents[0]+' versus '+parents[1]+').');
  });
  var contourEdges=geo.edges||[];for(var te=0;te<contourEdges.length;te++){
    var before=contourEdges[(te-1+contourEdges.length)%contourEdges.length],after=contourEdges[te],a1=shapeEdgeAllowance(def,before),a2=shapeEdgeAllowance(def,after);
    if(Math.abs(a1-a2)<=eps)continue;
    var u=[before.p2[0]-before.p1[0],before.p2[1]-before.p1[1]],v2=[after.p2[0]-after.p1[0],after.p2[1]-after.p1[1]],lu=Math.hypot(u[0],u[1])||1,lv=Math.hypot(v2[0],v2[1])||1,dot=(u[0]*v2[0]+u[1]*v2[1])/(lu*lv);
    if(dot>.995)errors.push('Cutting allowance cannot change across tangent-continuous edges '+before.id+' and '+after.id+'.');
  }
  var segmentIds=Object.create(null);(geo.edges||[]).forEach(function(e){if(segmentIds[e.segmentId])errors.push('Duplicate topology segment id '+e.segmentId+'.');segmentIds[e.segmentId]=true;if(!(e.length>eps))errors.push('Edge '+e.id+' is degenerate.');});
  function strictlyInside(p){return fabPointInPoly(p,pts)&&fabPointPolyDistance(p,pts)>eps;}
  (fg.holes||[]).forEach(function(h){
    var r=h.diameter/2;if(!(h.diameter>0))errors.push('Hole '+h.id+': diameter must be greater than zero.');
    else if(!strictlyInside(h.center))errors.push('Hole '+h.id+': center is outside the finished contour.');
    else{var d=fabPointPolyDistance(h.center,pts);if(d+eps<r)errors.push('Hole '+h.id+': hole crosses the finished contour.');else if(d<r+h.minEdge-eps)warns.push('Hole '+h.id+': requested edge clearance is not met; technology approval required.');}
  });
  (fg.cutouts||[]).forEach(function(c){
    if(!(c.width>0&&c.height>0))errors.push('Cutout '+c.id+': Width and Height must be greater than zero.');
    else if(!c.points.every(strictlyInside))errors.push('Cutout '+c.id+': the entire cutout must remain inside the finished contour.');
    if(c.cornerRadius<0||c.cornerRadius>Math.min(c.width,c.height)/2+eps)errors.push('Cutout '+c.id+': invalid corner radius.');
  });
  for(var ci=0;ci<(fg.cutouts||[]).length;ci++)for(var cj=ci+1;cj<fg.cutouts.length;cj++)if(fabPolygonsOverlap(fg.cutouts[ci].points,fg.cutouts[cj].points))errors.push('Cutouts '+fg.cutouts[ci].id+' and '+fg.cutouts[cj].id+' overlap.');
  (fg.hardware||[]).forEach(function(h){
    if(h.invalid){errors.push('Hardware '+h.id+': referenced physical edge does not exist.');return;}
    if(!(inch(h.source.prepWidth)>0&&inch(h.source.prepHeight)>0))errors.push('Hardware '+h.id+': prep dimensions must be greater than zero.');
    if(!(h.holeDia>0))errors.push('Hardware '+h.id+': hole diameter must be greater than zero.');
    if(h.anchor&&h.anchor.clamped)errors.push('Hardware '+h.id+': distance along edge is longer than the physical edge.');
    if(h.center&&!fabPointInPoly(h.center,pts))errors.push('Hardware '+h.id+': prep is placed outside the finished contour.');
    if(h.points&&!h.points.every(function(p){return fabPointInPoly(p,pts)||fabPointPolyDistance(p,pts)<eps;}))errors.push('Hardware '+h.id+': the entire prep must remain inside the finished contour.');
  });
  (fg.stamps||[]).forEach(function(s){if(!fabPointInPoly(s.point,pts))errors.push('Stamp '+s.id+': annotation is outside the finished contour.');});
  (fg.sandblasts||[]).forEach(function(s){if(!fabPointInPoly(s.point,pts))errors.push('Sandblast '+s.id+': annotation is outside the finished contour.');});
  for(var i=0;i<(fg.holes||[]).length;i++)for(var j=i+1;j<fg.holes.length;j++){
    var a=fg.holes[i],b=fg.holes[j],min=(a.diameter+b.diameter)/2;if(Math.hypot(a.center[0]-b.center[0],a.center[1]-b.center[1])<min-eps)errors.push('Holes '+a.id+' and '+b.id+' overlap.');
  }
  (fg.holes||[]).forEach(function(h){(fg.cutouts||[]).forEach(function(c){if(fabPointInPoly(h.center,c.points)||fabPointPolyDistance(h.center,c.points)<h.diameter/2-eps)errors.push('Hole '+h.id+' overlaps cutout '+c.id+'.');});});
  (def.manufacturingItems||[]).filter(function(item){return item.type==='hole'&&shapeHoleCount(item)>1;}).forEach(function(item){
    var d=fabParseDimStrict(item.diameter),count=shapeHoleCount(item),centers=shapeHoleCenters(item),name=count===3?'Hole Triple ':'Hole Double ';
    if(count===2){var spacing=shapeHoleSpacing(item);if(!isFinite(spacing)||!(spacing>0))errors.push(name+item.id+': center-to-center distance must be greater than zero.');else if(d.ok&&spacing<d.v-eps)errors.push(name+item.id+': center-to-center distance cannot be smaller than the diameter.');}
    else{var vs=shapeHoleTripleVSpacing(item),hs=shapeHoleTripleHSpacing(item);if(!isFinite(vs)||!(vs>0))errors.push(name+item.id+': vertical center-to-center distance must be greater than zero.');else if(d.ok&&vs<d.v-eps)errors.push(name+item.id+': vertical center-to-center distance cannot be smaller than the diameter.');if(!isFinite(hs)||!(hs>0))errors.push(name+item.id+': horizontal center-to-center distance must be greater than zero.');else if(d.ok&&hs<d.v-eps)errors.push(name+item.id+': horizontal center-to-center distance cannot be smaller than the diameter.');}
    if(!centers.every(function(c){return strictlyInside(c);}))errors.push(name+item.id+': all centers must stay inside the finished contour.');
  });
  var th=shapeThicknessMm(def),thicknessNeeded=false;
  Object.keys(def.edgeOps||{}).forEach(function(id){
    if(!(geo.edges||[]).some(function(e){return e.id===id;}))errors.push('Edge processing references missing edge '+id+'.');
    var ops=def.edgeOps[id]||[],seenOps=Object.create(null),finishes=0;
    ops.forEach(function(op){
      if(seenOps[op.type])errors.push('Edge '+id+': duplicate '+op.type+' operation.');seenOps[op.type]=true;
      if(op.type==='Rough Arris'||op.type==='Flat Polish'||op.type==='CNC Shape Polish')finishes++;
      if(op.type==='Flat Polish'||op.type==='Beveling'||op.type==='Mitering'){
        thicknessNeeded=true;
        if(th>0&&shapePolishAllowance(th)<=0)errors.push(op.type+' on edge '+id+': no cutting allowance is configured for '+th+' mm glass.');
      }
      if(op.type==='Mitering'&&[22.5,45].indexOf(+op.angle)<0)errors.push('Mitering on edge '+id+': angle must be 22.5° or 45°.');
      if(op.type==='Beveling'&&!(inch(op.width)>0))errors.push('Beveling on edge '+id+': width must be greater than zero.');
    });
    if(finishes>1)errors.push('Edge '+id+': Rough Arris, Flat Polish and CNC Shape Polish are mutually exclusive finishes.');
  });
  if(thicknessNeeded&&!(th>0))errors.push('Glass thickness for edge-processing allowance must come from the selected Sales Makeup.');
  return {errors:Array.from(new Set(errors)),warns:Array.from(new Set(warns))};
}
