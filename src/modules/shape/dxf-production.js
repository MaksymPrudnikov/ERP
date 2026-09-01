/* =====================================================================
   shape/dxf-production · schema-v2 extension
   Производственная логика внешнего DXF. Файл не знает про Sales, цены,
   клиентов или заказы: только finished contour -> edgework -> cutting.
   ===================================================================== */

const SHAPE_PRIMARY_FINISHES=['Rough Arris','Flat Polish','CNC Shape Polish'];

function shapeStableHash(prefix,payload){
  var src=JSON.stringify(payload),h=2166136261;
  for(var i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619);}
  return prefix+(h>>>0).toString(16).padStart(8,'0');
}

function shapeDxfPhysicalEdges(def){
  if(!shapeIsDxfSource(def))return [];
  var preview=shapeNormalizeSource(def.source).preview,points=preview.points||[],out=[];
  for(var i=0;i<points.length;i++){
    var a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
    if(L<=1e-9)continue;
    var id='seg'+(i+1);
    out.push({id:id,segmentId:id,type:'line',p1:a.slice(),p2:b.slice(),length:L,parentEdges:[]});
  }
  return out;
}

/* Только физический контур. Обработка/толщина не инвалидируют side mapping. */
function shapeDxfTopologyFingerprint(defOrPreview){
  var preview=null;
  if(defOrPreview&&defOrPreview.kind==='dxf'&&defOrPreview.preview)preview=defOrPreview.preview;
  else if(defOrPreview&&shapeIsDxfSource(defOrPreview))preview=shapeNormalizeSource(defOrPreview.source).preview;
  else if(defOrPreview&&Array.isArray(defOrPreview.points))preview=defOrPreview;
  if(!preview)return '';
  var points=(preview.points||[]).map(function(p){return [shapeDxfCoord(p[0]),shapeDxfCoord(p[1])];});
  return points.length>=3?shapeStableHash('top-',{points:points}):'';
}

function shapePrimaryFinish(ops){
  return (Array.isArray(ops)?ops:[]).map(shapeNormalizeOp).filter(Boolean).find(function(op){return SHAPE_PRIMARY_FINISHES.indexOf(op.type)>=0;})||null;
}

function shapeTogglePrimaryFinish(ops,type,on){
  var list=(Array.isArray(ops)?ops:[]).map(shapeNormalizeOp).filter(Boolean).filter(function(op){return op.type!==type;});
  if(on){
    if(SHAPE_PRIMARY_FINISHES.indexOf(type)>=0)list=list.filter(function(op){return SHAPE_PRIMARY_FINISHES.indexOf(op.type)<0;});
    list.push(shapeNormalizeOp({type:type}));
  }
  return list.filter(Boolean);
}

function shapeValidateEdgeOperations(ops,edgeId){
  var seen=Object.create(null),primary=0,list=(Array.isArray(ops)?ops:[]).map(shapeNormalizeOp).filter(Boolean);
  for(var i=0;i<list.length;i++){
    var op=list[i];
    if(seen[op.type])return {ok:false,reason:'Edge '+edgeId+': duplicate '+op.type+' operation.'};
    seen[op.type]=true;
    if(SHAPE_PRIMARY_FINISHES.indexOf(op.type)>=0)primary++;
    if(op.type==='Mitering'&&[22.5,45].indexOf(+op.angle)<0)return {ok:false,reason:'Edge '+edgeId+': Mitering angle must be 22.5° or 45°.'};
    if(op.type==='Beveling'&&!(inch(op.width)>0))return {ok:false,reason:'Edge '+edgeId+': Bevel width must be greater than zero.'};
  }
  if(primary>1)return {ok:false,reason:'Edge '+edgeId+': Rough Arris, Flat Polish and CNC Shape Polish are mutually exclusive finishes.'};
  return {ok:true};
}

/* Не используем нулевой fallback там, где технологическая таблица неизвестна. */
/* Цеховые значения припуска, подтверждены владельцем 31 августа 2026 — из
   кода их вывести нельзя.
   Rough Arris = 0 ВСЕГДА: ручная зачистка фаски контур не съедает, она только
   делает кромку безопасной, поэтому лист под неё не увеличивается никогда. */
function shapeProductionAllowanceRule(op,thicknessMm){
  var type=typeof op==='string'?op:(op&&op.type)||'',mm=Number(thicknessMm);
  if(type==='Rough Arris')return {ok:true,value:0};
  /* Толстое стекло полируется с большим съёмом: до 15 mm — 1/4", 15–19 — 1/2". */
  if(type==='CNC Shape Polish'){
    if(mm>=15&&mm<=19)return {ok:true,value:.5};
    return {ok:true,value:.25};
  }
  if(type==='Flat Polish'||type==='Mitering'||type==='Beveling'){
    if(mm>=3&&mm<=6)return {ok:true,value:1/16};
    if(mm>=8&&mm<=10)return {ok:true,value:1/8};
    if(mm>=12&&mm<=15)return {ok:true,value:3/16};
    if(mm>=16&&mm<=19)return {ok:true,value:.5};
    return {ok:false,value:null,reason:type+' allowance rule is not configured for '+mm+' mm glass.'};
  }
  return {ok:true,value:0};
}

function shapeProductionAllowanceForOps(ops,thicknessMm){
  var max=0,list=(Array.isArray(ops)?ops:[]).map(shapeNormalizeOp).filter(Boolean);
  for(var i=0;i<list.length;i++){
    var r=shapeProductionAllowanceRule(list[i],thicknessMm);
    if(!r.ok)return r;
    max=Math.max(max,r.value||0);
  }
  return {ok:true,value:max};
}

function shapeDxfTangentAllowanceIssue(groups){
  var eps=1e-7;
  if(!Array.isArray(groups)||groups.length<2)return null;
  for(var i=0;i<groups.length;i++){
    var before=groups[(i-1+groups.length)%groups.length],after=groups[i];
    if(before.allowance==null||after.allowance==null||Math.abs(before.allowance-after.allowance)<=eps)continue;
    var u=[before.p2[0]-before.p1[0],before.p2[1]-before.p1[1]],v=[after.p2[0]-after.p1[0],after.p2[1]-after.p1[1]],lu=Math.hypot(u[0],u[1])||1,lv=Math.hypot(v[0],v[1])||1;
    var dot=(u[0]*v[0]+u[1]*v[1])/(lu*lv);
    if(dot>.995)return {before:before.id,after:after.id,reason:'Cutting allowance cannot change across tangent-continuous edges '+before.id+' and '+after.id+'.'};
  }
  return null;
}

/* Фурнитура на DXF хранит конкретный physical SEG + расстояние от его начала.
   Вид метки здесь не перечисляется: их список открытый (см. shape/schema). */
const __shapeDxfNormalizeManufacturingItem=shapeNormalizeManufacturingItem;
shapeNormalizeManufacturingItem=function(raw){
  raw=shapePlainObject(raw);
  var out=__shapeDxfNormalizeManufacturingItem(raw);
  if(out.type!=='hole'){
    var candidate=shapeTextValue(raw.edgeId,/^seg\d+$/i.test(shapeTextValue(raw.edge,''))?raw.edge:'');
    if(/^seg\d+$/i.test(candidate)){
      out.edgeId=candidate;
      delete out.edge;
    }
  }
  return out;
};

function shapeDxfManufacturingPoint(item,def){
  if(!item||item.type==='hole'||!item.edgeId)return null;
  var edge=shapeDxfPhysicalEdges(def).find(function(e){return e.id===item.edgeId;});
  if(!edge)return null;
  var d=Math.max(0,+item.distance||0),t=edge.length?Math.max(0,Math.min(1,d/edge.length)):0;
  return {edge:edge,distance:Math.min(d,edge.length),point:[edge.p1[0]+(edge.p2[0]-edge.p1[0])*t,edge.p1[1]+(edge.p2[1]-edge.p1[1])*t]};
}

function shapeDxfRequirements(def){
  var req=[],groups=Object.create(null);
  shapeDxfPhysicalEdges(def).forEach(function(edge){
    shapeEdgeOps(def,edge.id).map(shapeNormalizeOp).filter(Boolean).forEach(function(op){
      var key=op.type+'|'+(op.angle||'')+'|'+(op.width||'')+'|'+(op.side||'');
      if(!groups[key])groups[key]={operation:op.type,edgeIds:[],params:{}};
      groups[key].edgeIds.push(edge.id);
      if(op.angle)groups[key].params.angle=op.angle;
      if(op.width)groups[key].params.width=op.width;
      if(op.side)groups[key].params.side=op.side;
    });
  });
  Object.keys(groups).forEach(function(key){
    var g=groups[key],station=g.operation==='Rough Arris'?'ARRISING':g.operation==='Flat Polish'?'POLISHING':g.operation==='Mitering'?'MITERING':g.operation==='Beveling'?'BEVELING':'CNC';
    req.push({id:'EDGE:'+key,source:'EDGE',operation:g.operation,stationClass:station,edgeIds:g.edgeIds,params:g.params});
  });
  (def.manufacturingItems||[]).forEach(function(item){
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),dia=d.ok?d.v:0;
      req.push({id:'MANUFACTURING:'+item.id,source:'MANUFACTURING',operation:'Drill Hole',stationClass:'DRILLING',manufacturingItemId:item.id,params:{diameter:dia,x:item.x,y:item.y}});
    }else{
      req.push({id:'MANUFACTURING:'+item.id,source:'MANUFACTURING',operation:shapeMiOperationName(item.type),stationClass:'SERVICE',manufacturingItemId:item.id,params:{edgeId:item.edgeId||'',distance:item.distance,model:item.model||''}});
    }
  });
  (def.features||[]).filter(function(f){return f.type==='sandblast';}).forEach(function(s){
    req.push({id:'SANDBLAST:'+s.id,source:'MANUFACTURING',operation:shapeSandblastServiceLabel(s),stationClass:'SAND',featureId:s.id,params:{coverage:shapeSandblastCoverage(s),side:shapeSandblastSide(s)}});
  });
  return req;
}

function shapeValidateDxfProduction(def,edges){
  var errors=[],warns=[],preview=shapeNormalizeSource(def.source).preview,points=preview.points||[],ids=Object.create(null),th=shapeThicknessMm(def);
  edges.forEach(function(e){ids[e.id]=true;});
  Object.keys(def.edgeOps||{}).forEach(function(id){
    if(!ids[id]){errors.push('Edge processing references missing DXF edge '+id+'.');return;}
    var v=shapeValidateEdgeOperations(shapeEdgeOps(def,id),id);if(!v.ok)errors.push(v.reason);
    if(isFinite(th))shapeEdgeOps(def,id).forEach(function(op){var r=shapeProductionAllowanceRule(op,th);if(!r.ok)errors.push('Edge '+id+': '+r.reason);});
  });
  if(!isFinite(th)||!(th>0))errors.push('Shape thickness must be a positive number for DXF cutting.');
  (def.manufacturingItems||[]).forEach(function(item){
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter);
      if(!d.ok||!(d.v>0))errors.push('Hole '+item.id+': diameter must be greater than zero.');
      if(!fabPointInPoly([+item.x||0,+item.y||0],points))errors.push('Hole '+item.id+': center must stay inside the finished DXF contour.');
      return;
    }
    if(!item.edgeId||!ids[item.edgeId]){errors.push(shapeMiOperationName(item.type)+' '+item.id+': referenced physical DXF segment does not exist.');return;}
    var e=edges.find(function(x){return x.id===item.edgeId;}),distance=+item.distance||0;
    if(distance<0||distance>e.length+1e-8)errors.push(shapeMiOperationName(item.type)+' '+item.id+': distance must stay on '+item.edgeId+'.');
  });
  (def.features||[]).filter(function(f){return f.type==='stamp';}).forEach(function(stamp){
    var point=[inch(stamp.x),inch(stamp.y)];
    if(!isFinite(point[0])||!isFinite(point[1])||!fabPointInPoly(point,points))errors.push('Stamp '+stamp.id+': annotation must stay inside the finished DXF contour.');
  });
  (def.features||[]).filter(function(f){return f.type==='sandblast';}).forEach(function(mark){
    var point=[inch(mark.x),inch(mark.y)];
    if(!isFinite(point[0])||!isFinite(point[1])||!fabPointInPoly(point,points))errors.push('Sandblast '+mark.id+': annotation must stay inside the finished DXF contour.');
  });
  return {errors:errors,warns:warns};
}

function shapeDxfCuttingPlan(def){
  def=normalizeShapeDef(def||{});
  if(!shapeIsDxfSource(def))return {valid:false,error:'Shape is not a DXF source.'};
  var sv=shapeValidateSource(def);if(sv.errors.length)return {valid:false,error:sv.errors[0],errors:sv.errors};
  var points=shapeNormalizeSource(def.source).preview.points.map(function(p){return p.slice();}),edges=shapeDxfPhysicalEdges(def),v=shapeValidateDxfProduction(def,edges),th=shapeThicknessMm(def);
  if(v.errors.length)return {valid:false,error:v.errors[0],errors:v.errors,warns:v.warns};
  var groups=[],allowances=[];
  for(var i=0;i<edges.length;i++){
    var e=edges[i],ar=shapeProductionAllowanceForOps(shapeEdgeOps(def,e.id),th);
    if(!ar.ok)return {valid:false,error:ar.reason,errors:[ar.reason]};
    allowances.push(ar.value);groups.push(Object.assign({},e,{allowance:ar.value}));
  }
  var tangent=shapeDxfTangentAllowanceIssue(groups);if(tangent)return {valid:false,error:tangent.reason,errors:[tangent.reason]};
  /* Тот же закон, что и для рассчитанной геометрии: стол режет только внешний
     контур. Нотчи заполняются продолжением кромок, отверстия в файл резки не
     попадают — они сверлятся после обработки кромки. */
  var srcIds=edges.map(function(e){return e.id;});
  var filled=shapeFillNotches(points,allowances,srcIds);
  var off=shapeOffsetVariable(filled.points,filled.dist);if(!off.valid)return {valid:false,error:off.error,errors:[off.error]};
  var b=fabEdgeBounds(off.points),warnings=[];
  var types={};edges.forEach(function(e){if(e&&e.id!=null)types[e.id]=e.type;});
  var border=shapeSafetyBorderPlan(def,filled.points,filled.ids,types),footprint=shapeBorderFootprint(off.points,border);
  if(border.manualRequired)warnings.push('Safety Border has no automatic value for this thickness — set it manually before cutting.');
  if(filled.reduced)warnings.push('Notches and cutouts are excluded from the cutting contour — they are fabricated after edgework.');
  return {valid:true,points:off.points,finishedPoints:points,edgeIds:(filled.ids||[]).slice(),allowances:(filled.dist||[]).slice(),notchesRemoved:filled.removed,holes:[],cutouts:[],hardware:[],safetyBorder:border,footprint:footprint,minX:b.minX,maxX:b.maxX,minY:b.minY,maxY:b.maxY,width:b.maxX-b.minX,height:b.maxY-b.minY,warnings:warnings,toleranceIn:1/256,edges:edges};
}

const __shapeDxfFingerprint=shapeFingerprint;
shapeFingerprint=function(def){
  def=normalizeShapeDef(def||{});
  if(!shapeIsDxfSource(def))return __shapeDxfFingerprint(def);
  var payload={source:{kind:'dxf',fileName:def.source.fileName,fileSize:def.source.fileSize,uploadedAt:def.source.uploadedAt,preview:def.source.preview},thickness:def.thickness,edgeOps:def.edgeOps,manufacturingItems:def.manufacturingItems||[]};
  var annotations=(def.features||[]).filter(function(f){return f.type==='stamp'||f.type==='sandblast';});
  if(annotations.length)payload.features=annotations;
  return shapeStableHash('shp-',payload);
};

function shapeValidateProductionEdgework(def){
  def=normalizeShapeDef(def||{});
  var errors=[],th=shapeThicknessMm(def);
  Object.keys(def.edgeOps||{}).forEach(function(edgeId){
    var ops=shapeEdgeOps(def,edgeId),v=shapeValidateEdgeOperations(ops,edgeId);
    if(!v.ok)errors.push(v.reason);
    if(isFinite(th))ops.forEach(function(op){var ar=shapeProductionAllowanceRule(op,th);if(!ar.ok)errors.push('Edge '+edgeId+': '+ar.reason);});
  });
  return errors;
}

function shapeDxfProductionResult(source){
  var def=normalizeShapeDef(source||{}),fingerprint=shapeFingerprint(def);
  if(!shapeIsDxfSource(def))return {valid:false,reason:'Shape is not a DXF source.',errors:['Shape is not a DXF source.'],definition:def,fingerprint:fingerprint};
  var sv=shapeValidateSource(def),preview=def.source.preview||shapeNormalizeDxfPreview(null);
  if(sv.errors.length)return {valid:false,sourceValid:false,reason:sv.errors[0],errors:sv.errors,warns:sv.warns,definition:def,fingerprint:fingerprint};
  var cutting=shapeDxfCuttingPlan(def),points=preview.points||[],width=preview.width16/16,height=preview.height16/16,area=Math.abs(fabSignedArea(points)),edges=shapeDxfPhysicalEdges(def),requirements=shapeDxfRequirements(def);
  if(!cutting.valid)return {valid:false,sourceValid:true,reason:cutting.error,errors:cutting.errors||[cutting.error],warns:(sv.warns||[]).concat(cutting.warns||[]),definition:def,fingerprint:fingerprint,width:width,height:height,points:points,area:area,billableArea:width*height,perimeter:fabPolylineLength(points,true),edges:edges,segs:edges,requirements:requirements,cutting:cutting};
  var stamps=(def.features||[]).filter(function(f){return f.type==='stamp';}).map(function(f){return {id:f.id,type:'stamp',point:[inch(f.x),inch(f.y)],text:shapeStampText(f),source:f};});
  var sandblasts=(def.features||[]).filter(function(f){return f.type==='sandblast';}).map(function(f){return {id:f.id,type:'sandblast',point:[inch(f.x),inch(f.y)],coverage:shapeSandblastCoverage(f),side:shapeSandblastSide(f),text:shapeSandblastText(f),source:f};});
  return {valid:true,sourceValid:true,reason:'',errors:[],warns:sv.warns||[],definition:def,fingerprint:fingerprint,width:width,height:height,points:points,area:area,grossArea:area,billableArea:width*height,perimeter:fabPolylineLength(points,true),edges:edges,segs:edges,vertices:[],geometry:{ok:true,points:points,edges:edges,vertices:[],bboxW:width,bboxH:height},featureGeometry:{holes:cutting.holes,cutouts:[],hardware:[],stamps:stamps,sandblasts:sandblasts,radii:[],all:stamps.concat(sandblasts)},requirements:requirements,cutting:cutting};
}

const __shapeDxfCompute=ShapeModule.compute;
ShapeModule.compute=function(source){
  var def=normalizeShapeDef(source||{});
  if(!shapeIsDxfSource(def)){
    /* Configured Shapes keep the native ShapeModule contract intact.
       The base validator already owns thickness, allowance, finish-conflict,
       tangent-edge and Miter/Bevel validation. Do not pre-empt its errors here. */
    return __shapeDxfCompute(def);
  }

  /* Preserve the public external-DXF contract used by Muntin and legacy callers:
     an uploaded DXF is NOT ordinary computed ERP geometry. Production cutting is
     exposed explicitly instead of flipping result.valid to true. */
  var base=__shapeDxfCompute(def),production=shapeDxfProductionResult(def);
  base.fingerprint=shapeFingerprint(def);
  base.productionValid=!!production.valid;
  base.productionReason=production.reason||'';
  base.productionErrors=production.errors||[];
  base.productionWarnings=production.warns||[];
  base.productionRequirements=production.requirements||shapeDxfRequirements(def);
  base.productionCutting=production.valid?production.cutting:null;
  base.productionEdges=production.edges||shapeDxfPhysicalEdges(def);
  return base;
};

/* Внешний код использует эти helpers, не повторяя DXF topology/allowance math. */
ShapeModule.dxfEdges=shapeDxfPhysicalEdges;
ShapeModule.dxfTopologyFingerprint=shapeDxfTopologyFingerprint;
ShapeModule.productionAllowanceRule=shapeProductionAllowanceRule;
ShapeModule.productionAllowanceForOps=shapeProductionAllowanceForOps;
ShapeModule.validateEdgeOperations=shapeValidateEdgeOperations;
ShapeModule.validateProductionEdgework=shapeValidateProductionEdgework;
ShapeModule.dxfCuttingPlan=shapeDxfCuttingPlan;
ShapeModule.dxfProductionResult=shapeDxfProductionResult;
ShapeModule.dxfManufacturingPoint=shapeDxfManufacturingPoint;
