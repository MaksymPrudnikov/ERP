/* =====================================================================
   erp/sales/service-sets · service-set-v1
   Order-scoped bulk edgework recipes and one Effective Production snapshot.
   Shape stays independent; prices/orders stay in ERP.
   ===================================================================== */

const SALES_SERVICE_SET_OPS=['Rough Arris','Flat Polish','CNC Shape Polish','Mitering','Beveling'];

function salesServiceClone(x){return JSON.parse(JSON.stringify(x==null?null:x));}
function salesServicePlain(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
function salesServiceOps(raw){return (Array.isArray(raw)?raw:[]).map(shapeNormalizeOp).filter(Boolean);}
function salesServiceOpSignature(op){return [op.type,op.angle||'',op.width||'',op.side||''].join('|');}
function salesServiceOpsSignature(raw){return salesServiceOps(raw).map(salesServiceOpSignature).sort().join('||');}
function salesServiceSameOps(a,b){return salesServiceOpsSignature(a)===salesServiceOpsSignature(b);}

function salesNormalizeServiceSet(raw,index){
  raw=salesServicePlain(raw);
  var mode=raw.mode==='perimeter'?'perimeter':'sides',sides=salesServicePlain(raw.sides),code=salesString(raw.code).toUpperCase();
  return {
    id:salesEntityId(raw.id,'SVC'),
    code:code||('S'+((index||0)+1)),
    name:salesString(raw.name),
    mode:mode,
    sides:{A:salesServiceOps(sides.A),B:salesServiceOps(sides.B),C:salesServiceOps(sides.C),D:salesServiceOps(sides.D),other:salesServiceOps(sides.other)},
    perimeter:salesServiceOps(raw.perimeter),
    createdAt:salesString(raw.createdAt),updatedAt:salesString(raw.updatedAt)
  };
}

function salesNormalizeServiceOverrides(raw){
  raw=salesServicePlain(raw);var edges=salesServicePlain(raw.edges),out={};
  Object.keys(edges).forEach(function(id){if(/^[A-Za-z0-9:_-]{1,96}$/.test(id))out[id]=salesServiceOps(edges[id]);});
  return {pinnedTopology:salesString(raw.pinnedTopology),edges:out};
}

function salesNormalizeSideMap(raw){
  raw=salesServicePlain(raw);var out={A:[],B:[],C:[],D:[],other:[]},seen=Object.create(null);
  ['A','B','C','D','other'].forEach(function(k){
    (Array.isArray(raw[k])?raw[k]:[]).forEach(function(id){id=salesString(id);if(id&&!seen[id]){seen[id]=true;out[k].push(id);}});
  });
  return Object.keys(out).some(function(k){return out[k].length;})?out:null;
}

/* Нормализация включается до storage.boot(), поэтому старые заказы мигрируют на лету. */
const __salesServiceNormalizeLine=normalizeSalesOrderLine;
normalizeSalesOrderLine=function(line){
  var src=salesServicePlain(line),out=__salesServiceNormalizeLine(src);
  out.serviceSetId=salesRefId(src.serviceSetId);
  out.serviceOverrides=salesNormalizeServiceOverrides(src.serviceOverrides);
  out.sideMap=salesNormalizeSideMap(src.sideMap);
  out.sideMapTopology=salesString(src.sideMapTopology);
  return out;
};

const __salesServiceNormalizeOrder=normalizeSalesOrder;
normalizeSalesOrder=function(order){
  var src=salesServicePlain(order),out=__salesServiceNormalizeOrder(src),usedIds=Object.create(null),usedCodes=Object.create(null);
  out.serviceSets=(Array.isArray(src.serviceSets)?src.serviceSets:[]).map(salesNormalizeServiceSet).map(function(set,i){
    while(usedIds[set.id])set.id=salesUid('SVC');usedIds[set.id]=true;
    if(!set.code||usedCodes[set.code]){var n=i+1;do{set.code='S'+n++;}while(usedCodes[set.code]);}
    usedCodes[set.code]=true;return set;
  });
  /* Base normalizer recreates line objects, so restore service fields from raw rows. */
  var rawLines=Array.isArray(src.lines)?src.lines:[];
  out.lines=(out.lines||[]).map(function(line,i){
    var raw=salesServicePlain(rawLines[i]);
    line.serviceSetId=salesRefId(raw.serviceSetId);
    line.serviceOverrides=salesNormalizeServiceOverrides(raw.serviceOverrides);
    line.sideMap=salesNormalizeSideMap(raw.sideMap);
    line.sideMapTopology=salesString(raw.sideMapTopology);
    return line;
  });
  return out;
};

function salesServiceSetById(order,id){return (order&&order.serviceSets||[]).find(function(set){return set.id===id;})||null;}
function salesServiceSetUsage(order,id){return (order&&order.lines||[]).filter(function(line){return line.serviceSetId===id;}).length;}
function salesNextServiceSetCode(order){var used=new Set((order&&order.serviceSets||[]).map(function(s){return s.code;})),n=1,code;do{code='S'+n++;}while(used.has(code));return code;}
function salesServiceSetFormula(set){
  if(!set)return '—';
  function txt(ops){var a=salesServiceOps(ops);return a.length?a.map(function(o){return o.type==='Rough Arris'?'Rough':o.type==='Flat Polish'?'Flat':o.type==='CNC Shape Polish'?'CNC':o.type==='Mitering'?'Miter '+(o.angle||45)+'°':'Bevel '+(o.width||'1');}).join(' + '):'—';}
  if(set.mode==='perimeter')return 'ALL = '+txt(set.perimeter);
  return ['A','B','C','D','other'].map(function(k){return (k==='other'?'OTHER':k)+' = '+txt(set.sides[k]);}).join(' · ');
}

function salesLineHasRectGeometry(line){return !!(line&&(+line.width16||0)>0&&(+line.height16||0)>0);}
function salesImplicitRectShape(line){
  if(!salesLineHasRectGeometry(line))return null;
  var w=(+line.width16||0)/16,h=(+line.height16||0)/16;
  return {id:'IMPLICIT-RECT-'+(line.id||'LINE'),name:'Order-line rectangle',type:'rectangle',w:String(w),h:String(h),thickness:'6',edgeOps:{},features:[],manufacturingItems:[],source:{kind:'drawn'}};
}
function salesLineGeometryShape(line){return salesShapeByRef(line&&line.shapeRef)||salesImplicitRectShape(line);}

function salesShapePhysicalEdges(shape){
  if(!shape)return [];
  if(String(shape.id||'').indexOf('IMPLICIT-RECT-')===0){
    var w=+shape.w||0,h=+shape.h||0;
    /* Canonical order follows the physical boundary: A left, B bottom, C right, D top. */
    return [
      {id:'A',type:'line',length:h,p1:[0,h],p2:[0,0],parentEdges:[]},
      {id:'B',type:'line',length:w,p1:[0,0],p2:[w,0],parentEdges:[]},
      {id:'C',type:'line',length:h,p1:[w,0],p2:[w,h],parentEdges:[]},
      {id:'D',type:'line',length:w,p1:[w,h],p2:[0,h],parentEdges:[]}
    ];
  }
  if(shapeIsDxfSource(shape))return ShapeModule.dxfEdges(shape);
  try{
    var geo=shapeGeometry(shapeDefToLine(shape));if(!geo||!geo.ok)return [];
    return shapeEdgeGroups(geo).map(function(group){
      var parents=[];(group.segments||[]).forEach(function(seg){(seg.parentEdges||[]).forEach(function(id){if(parents.indexOf(id)<0)parents.push(id);});});
      (group.parentEdges||[]).forEach(function(id){if(parents.indexOf(id)<0)parents.push(id);});
      var seg=group.segments&&group.segments[0];
      return Object.assign({},group,{p1:seg&&seg.p1,p2:seg&&seg.p2,parentEdges:parents,length:+group.length||0});
    });
  }catch(e){return [];}
}

function salesShapeOpsForPhysicalEdge(shape,edge){
  if(!shape||String(shape.id||'').indexOf('IMPLICIT-RECT-')===0)return [];
  var all=[],ids=[edge.id].concat(Array.isArray(edge.parentEdges)?edge.parentEdges:[]),seen=Object.create(null);
  ids.forEach(function(id){shapeEdgeOps(shape,id).forEach(function(op){op=shapeNormalizeOp(op);if(!op)return;var key=salesServiceOpSignature(op);if(!seen[key]){seen[key]=true;all.push(op);}});});
  return all;
}

function salesMappedSide(line,edgeId){
  var map=line&&line.sideMap;if(!map)return '';
  for(var i=0;i<5;i++){var k=['A','B','C','D','other'][i];if((map[k]||[]).indexOf(edgeId)>=0)return k;}
  return '';
}

function salesSideForPhysicalEdge(line,edge){
  var id=edge&&edge.id||'';
  if(['A','B','C','D'].indexOf(id)>=0)return id;
  for(var i=0;i<4;i++){var k=['A','B','C','D'][i];if(new RegExp('^'+k+'\\d+$').test(id))return k;}
  var mapped=salesMappedSide(line,id);if(mapped)return mapped;
  if(/^seg\d+$/i.test(id))return 'unmapped';
  var parents=Array.isArray(edge&&edge.parentEdges)?edge.parentEdges:[];
  for(i=0;i<parents.length;i++)if(['A','B','C','D'].indexOf(parents[i])>=0)return parents[i];
  return 'other';
}

function salesDxfSideMapClassified(line,shape){
  var edges=shape&&shapeIsDxfSource(shape)?ShapeModule.dxfEdges(shape):[];
  return !!(edges.length&&line&&line.sideMap&&edges.every(function(edge){return !!salesMappedSide(line,edge.id);}));
}
function salesDxfSideMapCurrent(line,shape){
  var key=shape&&shapeIsDxfSource(shape)?ShapeModule.dxfTopologyFingerprint(shape):'';
  return !!(key&&line&&line.sideMapTopology===key);
}
function salesDxfMappingComplete(line,shape){return !!(salesDxfSideMapClassified(line,shape)&&salesDxfSideMapCurrent(line,shape));}

function salesDxfSetNeedsMapping(line,shape,set){
  if(!shape||!shapeIsDxfSource(shape)||!set||set.mode!=='sides')return false;
  var hasWork=['A','B','C','D','other'].some(function(k){return ((set.sides&&set.sides[k])||[]).length>0;});
  return hasWork&&!salesDxfMappingComplete(line,shape);
}

function salesHasLineEdgeOverrides(line){return !!Object.keys((line&&line.serviceOverrides&&line.serviceOverrides.edges)||{}).length;}
function salesDxfOverrideStale(line,shape){
  if(!shape||!shapeIsDxfSource(shape)||!salesHasLineEdgeOverrides(line))return false;
  var key=ShapeModule.dxfTopologyFingerprint(shape),pinned=line.serviceOverrides&&line.serviceOverrides.pinnedTopology;
  return !pinned||pinned!==key;
}

/* Единый snapshot. Он не занимается машинным offset — поэтому известные Services
   не исчезают только из-за того, что Cutting сейчас blocked. */
function salesEffectiveProductionSnapshot(line,shape,order){
  order=order||soDraft;shape=shape||salesLineGeometryShape(line);
  if(!shape)return {valid:false,reason:'Line needs Width and Height or a Shape.',groups:[]};
  var set=salesServiceSetById(order,line&&line.serviceSetId);
  if(line&&line.serviceSetId&&!set)return {valid:false,reason:'Referenced Bulk Service Set is missing.',groups:[],shape:shape};
  if(salesDxfOverrideStale(line,shape))return {valid:false,reason:'DXF line override belongs to another physical contour. Review or clear it before production.',groups:[],shape:shape,overrideStale:true};
  var mappingPending=salesDxfSetNeedsMapping(line,shape,set),overrides=line&&line.serviceOverrides&&line.serviceOverrides.edges||{},physical=salesShapePhysicalEdges(shape),groups=[];
  for(var i=0;i<physical.length;i++){
    var edge=physical[i],shapeOps=salesShapeOpsForPhysicalEdge(shape,edge),side=salesSideForPhysicalEdge(line,edge),setOps=[],ops=shapeOps,source='Shape';
    if(Object.prototype.hasOwnProperty.call(overrides,edge.id)){ops=salesServiceOps(overrides[edge.id]);source='Line override';}
    else if(set&&!mappingPending){
      if(set.mode==='perimeter')setOps=salesServiceOps(set.perimeter);
      else if(side!=='unmapped')setOps=salesServiceOps((set.sides&&set.sides[side])||[]);
      if(setOps.length){ops=setOps;source=set.code;}
    }else if(set&&mappingPending)source='Shape · '+set.code+' pending mapping';
    var v=ShapeModule.validateEdgeOperations(ops,edge.id);
    if(!v.ok)return {valid:false,reason:v.reason,groups:groups,shape:shape,set:set,operationConflict:true,mappingPending:mappingPending};
    groups.push({id:edge.id,length:+edge.length||0,side:side,source:source,p1:edge.p1,p2:edge.p2,parentEdges:edge.parentEdges||[],shapeOps:salesServiceOps(shapeOps),setOps:salesServiceOps(setOps),ops:salesServiceOps(ops),allowance:null});
  }
  return {valid:true,shape:shape,set:set,groups:groups,mappingPending:mappingPending,mappingClassified:shapeIsDxfSource(shape)?salesDxfSideMapClassified(line,shape):true,mappingCurrent:shapeIsDxfSource(shape)?salesDxfSideMapCurrent(line,shape):true};
}

function salesEffectiveEdgeSignature(line,shape,order){
  var snap=salesEffectiveProductionSnapshot(line,shape,order);if(!snap.valid)return {valid:false,reason:snap.reason,ops:[],snapshot:snap};
  var acc=Object.create(null);
  snap.groups.forEach(function(group){group.ops.forEach(function(op){var key=salesServiceOpSignature(op);if(!acc[key])acc[key]={op:op,length:0};acc[key].length+=group.length;});});
  return {valid:true,ops:Object.keys(acc).map(function(k){return acc[k];}),snapshot:snap,mappingPending:snap.mappingPending};
}

function salesLineExactGlassThickness(line){
  var values=salesLineGlassThicknesses(line);return values.length===1?{ok:true,mm:values[0]}:{ok:false,mm:null,values:values};
}

function salesEffectiveCuttingPlan(line,shape,order){
  var snap=salesEffectiveProductionSnapshot(line,shape,order);if(!snap.valid)return {valid:false,blocked:true,reason:snap.reason,groups:snap.groups||[],snapshot:snap};
  shape=snap.shape;
  var hasProcessing=snap.groups.some(function(g){return g.ops.length>0;}),t=salesLineExactGlassThickness(line);
  if(hasProcessing&&!t.ok)return {valid:false,blocked:true,reason:'Exact Makeup thickness is unresolved. Effective cutting is blocked.',groups:snap.groups,snapshot:snap};
  var mm=t.ok?t.mm:Number(shape.thickness)||6;
  for(var i=0;i<snap.groups.length;i++){
    var ar=ShapeModule.productionAllowanceForOps(snap.groups[i].ops,mm);
    if(!ar.ok)return {valid:false,blocked:true,reason:ar.reason,groups:snap.groups,snapshot:snap,allowanceRuleMissing:true};
    snap.groups[i].allowance=ar.value;
  }
  if(String(shape.id||'').indexOf('IMPLICIT-RECT-')===0){
    var w=(+line.width16||0)/16,h=(+line.height16||0)/16,byId=function(id){return snap.groups.find(function(g){return g.id===id;})||{allowance:0};},a=byId('A').allowance||0,b=byId('B').allowance||0,c=byId('C').allowance||0,d=byId('D').allowance||0;
    return {valid:true,implicitRect:true,thickness:mm,groups:snap.groups,snapshot:snap,finishedPoints:[[0,0],[w,0],[w,h],[0,h]],cuttingPoints:[[-a,-b],[w+c,-b],[w+c,h+d],[-a,h+d]],finishedW:w,finishedH:h,cutW:w+a+c,cutH:h+b+d,perimeter:2*(w+h),setPendingMapping:snap.mappingPending};
  }
  if(shapeIsDxfSource(shape)){
    var points=shapeNormalizeSource(shape.source).preview.points.map(function(p){return p.slice();});
    if(points.length<3||points.length!==snap.groups.length)return {valid:false,blocked:true,reason:'DXF physical contour is unavailable.',groups:snap.groups,snapshot:snap};
    var tangent=shapeDxfTangentAllowanceIssue(snap.groups);if(tangent)return {valid:false,blocked:true,reason:tangent.reason,groups:snap.groups,snapshot:snap,tangentAllowanceConflict:true};
    var off=shapeOffsetVariable(points,snap.groups.map(function(g){return g.allowance||0;}));
    if(!off.valid)return {valid:false,blocked:true,reason:'Effective cutting offset failed: '+off.error,groups:snap.groups,snapshot:snap};
    var fb=fabEdgeBounds(points),cb=fabEdgeBounds(off.points);
    return {valid:true,external:true,thickness:mm,groups:snap.groups,snapshot:snap,finishedPoints:points,cuttingPoints:off.points,finishedW:fb.maxX-fb.minX,finishedH:fb.maxY-fb.minY,cutW:cb.maxX-cb.minX,cutH:cb.maxY-cb.minY,perimeter:fabPolylineLength(points,true),setPendingMapping:snap.mappingPending};
  }
  var effective=normalizeShapeDef(salesServiceClone(shape));effective.thickness=String(mm);effective.edgeOps={};
  snap.groups.forEach(function(group){if(group.ops.length)effective.edgeOps[group.id]=salesServiceOps(group.ops);});
  var result=ShapeModule.compute(effective);
  if(!result||!result.valid)return {valid:false,blocked:true,reason:(result&&((result.errors&&result.errors[0])||result.reason))||'Effective Shape cutting failed.',groups:snap.groups,snapshot:snap};
  return {valid:true,external:false,thickness:mm,groups:snap.groups,snapshot:snap,effective:effective,result:result,finishedPoints:result.cutting.finishedPoints,cuttingPoints:result.cutting.points,finishedW:result.width,finishedH:result.height,cutW:result.cutting.width,cutH:result.cutting.height,setPendingMapping:snap.mappingPending};
}

function salesEdgeChargeMetaForServiceSet(op,ctx){
  var id='',label=op.type,rate=null;
  if(op.type==='Rough Arris'){id='roughArris';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='Flat Polish'){id='flatPolish';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='CNC Shape Polish'){id='cncShapePolish';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='Mitering'){id='miter'+String(op.angle||45).replace('.','_');label='Mitering '+(op.angle||45)+'°';rate=+op.angle===22.5?salesCatalogRate('miter225',ctx):null;}
  else if(op.type==='Beveling'){id='bevel:'+String(op.width||'');label='Beveling '+String(op.width||'');rate=null;}
  else return null;
  return {id:id,label:label,rate:rate};
}

/* Billing and Cutting read the SAME effective snapshot. */
salesLineChargeRows=function(line){
  var shape=salesLineGeometryShape(line),rows=[],ctx=salesPricingThickness(line);if(!shape)return rows;
  var saved=line&&line.shapeRef?salesShapeByRef(line.shapeRef):null,items=saved&&Array.isArray(saved.manufacturingItems)?saved.manufacturingItems:[],mi=Object.create(null);
  items.forEach(function(item){
    if(item.type==='clamp'||item.type==='hinge'){if(!mi[item.type])mi[item.type]={qty:0};mi[item.type].qty++;return;}
    if(item.type==='hole'){var d=fabParseDimStrict(item.diameter),hb=d.ok?salesPricingHoleBand(d.v):null,key=hb?'hole:'+hb.key:'hole:unpriced';if(!mi[key])mi[key]={qty:0,holeBand:hb};mi[key].qty++;}
  });
  if(mi.clamp)rows.push(salesChargeRow('MI:clamp:'+ctx.band,'Clamp',mi.clamp.qty,'pc',salesCatalogRate('clamp',ctx),'Manufacturing item'));
  if(mi.hinge)rows.push(salesChargeRow('MI:hinge:'+ctx.band,'Hinge',mi.hinge.qty,'pc',salesCatalogRate('hinge',ctx),'Manufacturing item'));
  Object.keys(mi).filter(function(k){return k.indexOf('hole:')===0;}).forEach(function(k){var g=mi[k],hb=g.holeBand;rows.push(salesChargeRow('MI:'+k+':'+ctx.band,'Hole '+(hb?hb.label:'—'),g.qty,'pc',hb?salesCatalogRate('hole',ctx,hb.key):null,'Manufacturing item'));});
  var sig=salesEffectiveEdgeSignature(line,shape,soDraft);
  if(sig.valid)sig.ops.forEach(function(group){var meta=salesEdgeChargeMetaForServiceSet(group.op,ctx);if(meta&&group.length>0)rows.push(salesChargeRow('EDGE:'+meta.id+':'+ctx.band,meta.label,group.length,'in',meta.rate,'Effective Edge Processing'));});
  if(saved&&!shapeIsDxfSource(saved)){
    var radius=(saved.features||[]).filter(function(f){return f.type==='radius'&&inch(f.radius)>0;}).length;if(radius)rows.push(salesChargeRow('FEATURE:radius:'+ctx.band,'Radius Corner',radius,'pc',salesCatalogRate('radiusCorner',ctx),'Shape feature'));
    var cutout=(saved.features||[]).filter(function(f){return f.type==='cutout';}).length;if(cutout)rows.push(salesChargeRow('FEATURE:cutout:'+ctx.band,'Cutout',cutout,'pc',null,'Shape feature'));
  }
  return rows.filter(function(row){return row.basis>0;});
};

function salesLineServiceStatus(line){
  var shape=salesLineGeometryShape(line);if(!shape)return {key:'geometry',label:'Needs geometry',cls:'warn'};
  var set=salesServiceSetById(soDraft,line.serviceSetId);if(line.serviceSetId&&!set)return {key:'missing',label:'Missing set',cls:'bad'};
  if(salesDxfOverrideStale(line,shape))return {key:'lost',label:'Override needs review',cls:'bad'};
  var snap=salesEffectiveProductionSnapshot(line,shape,soDraft);if(!snap.valid)return {key:'effective',label:'Needs review',cls:'bad'};
  if(snap.mappingPending){var own=snap.groups.some(function(g){return g.shapeOps.length>0;});return {key:'mapping',label:own?'Set pending mapping':'Needs side mapping',cls:'warn'};}
  var cut=salesEffectiveCuttingPlan(line,shape,soDraft);if(!cut.valid)return {key:'cutting',label:'Cutting blocked',cls:'bad'};
  if(salesHasLineEdgeOverrides(line))return {key:'override',label:'Line override',cls:'info'};
  if(line.serviceSetId)return {key:'ready',label:'Set applied',cls:'ok'};
  if(snap.groups.some(function(g){return g.shapeOps.length>0;}))return {key:'shape',label:'Shape processing',cls:'ok'};
  if(!line.shapeRef&&salesLineHasRectGeometry(line))return {key:'ready',label:'Rectangle',cls:'ok'};
  return {key:'ready',label:'No processing',cls:'ok'};
}
function salesLineNeedsServiceAttention(line){return ['geometry','missing','lost','effective','mapping','cutting'].indexOf(salesLineServiceStatus(line).key)>=0;}

function salesLostOverrideEdges(line){
  var shape=salesLineGeometryShape(line),current=salesShapePhysicalEdges(shape).map(function(e){return e.id;}),edges=Object.keys((line&&line.serviceOverrides&&line.serviceOverrides.edges)||{});
  if(salesDxfOverrideStale(line,shape))return edges;
  return edges.filter(function(id){return current.indexOf(id)<0;});
}

function salesApplyLineEdgeOperation(line,edgeId,type,on){
  var shape=salesLineGeometryShape(line);if(!shape)return {ok:false,reason:'Line has no geometry.'};
  if(!line.serviceOverrides)line.serviceOverrides={pinnedTopology:'',edges:{}};
  var base=salesServiceClone(line);base.serviceOverrides={pinnedTopology:'',edges:{}};
  var baseSnap=salesEffectiveProductionSnapshot(base,shape,soDraft),curSnap=salesEffectiveProductionSnapshot(line,shape,soDraft);if(!baseSnap.valid||!curSnap.valid)return {ok:false,reason:curSnap.reason||baseSnap.reason};
  var baseGroup=baseSnap.groups.find(function(g){return g.id===edgeId;})||{ops:[]},curGroup=curSnap.groups.find(function(g){return g.id===edgeId;})||baseGroup,current=Object.prototype.hasOwnProperty.call(line.serviceOverrides.edges,edgeId)?line.serviceOverrides.edges[edgeId]:curGroup.ops;
  var list=shapeTogglePrimaryFinish(current,type,on);
  if(salesServiceSameOps(list,baseGroup.ops))delete line.serviceOverrides.edges[edgeId];else line.serviceOverrides.edges[edgeId]=list;
  line.serviceOverrides.pinnedTopology=Object.keys(line.serviceOverrides.edges).length&&shapeIsDxfSource(shape)?ShapeModule.dxfTopologyFingerprint(shape):'';
  return {ok:true};
}

/* Machine export is intentionally line-specific. Standalone Shape export remains separate. */
function salesEffectiveMachineIssue(line,shape,plan){
  plan=plan||salesEffectiveCuttingPlan(line,shape,soDraft);if(!plan.valid)return plan.reason||'Effective cutting is unresolved.';
  if(plan.setPendingMapping)return 'Bulk Service Set is assigned but DXF side mapping is not confirmed. Review mapping before releasing a machine file.';
  return '';
}
function salesEffectiveProductionFingerprint(line,shape,plan){
  plan=plan||salesEffectiveCuttingPlan(line,shape,soDraft);if(!plan.valid)return '';
  var snap=plan.snapshot,src=JSON.stringify({lineId:line&&line.id||'',topology:shape&&shapeIsDxfSource(shape)?ShapeModule.dxfTopologyFingerprint(shape):'',dimensions:{w:+line.width16||0,h:+line.height16||0},thickness:plan.thickness,groups:(snap.groups||[]).map(function(g){return {id:g.id,ops:salesServiceOps(g.ops),allowance:g.allowance};}),cuttingPoints:(plan.cuttingPoints||[]).map(function(p){return [+p[0],+p[1]];})}),h=2166136261;
  for(var i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619);}return 'eff-'+(h>>>0).toString(16).padStart(8,'0');
}
function salesEffectiveMachinePayload(line){
  var shape=salesLineGeometryShape(line),plan=salesEffectiveCuttingPlan(line,shape,soDraft),issue=salesEffectiveMachineIssue(line,shape,plan);if(issue)return {ok:false,reason:issue};
  return {ok:true,fingerprint:salesEffectiveProductionFingerprint(line,shape,plan),schema:'glass-erp-order-effective/v1',units:'inch',lineId:line.id,outer:{closed:true,points:plan.cuttingPoints.map(function(p){return [Math.round(p[0]*1000000)/1000000,Math.round(p[1]*1000000)/1000000];})},snapshot:plan.snapshot};
}
