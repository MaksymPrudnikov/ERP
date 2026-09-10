/* =====================================================================
   erp/sales/service-sets · service-set-v1
   Order-scoped bulk edgework recipes and one Effective Production snapshot.
   Shape stays independent; prices/orders stay in ERP.
   ===================================================================== */

/* Набор — рецепт на много строк, и makeup он не знает. Лами-полировка в нём
   есть, но при применении она ложится ТОЛЬКО на строки со склейкой: на
   обычном стекле её выполнить нечем. Пропуск не молчаливый — он виден в
   предпросмотре массового применения. */
const SALES_SERVICE_SET_OPS=SHAPE_EDGE_OPS;
function salesSetOpLists(set){
  if(!set)return [];
  var s=set.sides||{};
  return set.mode==='perimeter'?[set.perimeter]:[s.A,s.B,s.C,s.D,s.other];
}
function salesSetHasLamiOps(set){
  return salesSetOpLists(set).some(function(list){
    return salesServiceOps(list).some(function(o){return shapeIsLamiOnlyOp(o.type);});
  });
}
function salesLineIsLaminated(line){
  return salesLineLites(line).some(function(l){return l.laminated;});
}

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
  out.liteShapes=normalizeSalesLiteShapes(src.liteShapes);
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
    line.liteShapes=normalizeSalesLiteShapes(raw.liteShapes);
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
  /* Источник кромки ровно один — форма строки. Если на кромке формы ничего не
     задано, действует базовая кромка её стекла (арис до 8 mm, полировка от
     10 mm — правило владельца, переопределяется на самом продукте).
     Edgework Set больше НЕ участвует в расчёте: он был третьим источником,
     молча затирал обработку формы и переживал её смену. Ручных правок кромки
     на строке тоже нет — хранить нечего, значит устаревать нечему. */
  var lites=salesLineLites(line),baseOps=salesLineBaseEdgeworkOps(line),physical=salesShapePhysicalEdges(shape),mappingPending=false,groups=[];
  for(var i=0;i<physical.length;i++){
    var edge=physical[i],shapeOps=salesShapeOpsForPhysicalEdge(shape,edge),side=salesSideForPhysicalEdge(line,edge),setOps=[],ops=shapeOps,source='Shape';
    if(!ops.length&&baseOps.length){ops=baseOps;source='Glass';}
    var v=ShapeModule.validateEdgeOperations(ops,edge.id);
    if(!v.ok)return {valid:false,reason:v.reason,groups:groups,shape:shape,set:set,operationConflict:true,mappingPending:mappingPending};
    groups.push({id:edge.id,length:+edge.length||0,side:side,source:source,p1:edge.p1,p2:edge.p2,parentEdges:edge.parentEdges||[],shapeOps:salesServiceOps(shapeOps),setOps:salesServiceOps(setOps),ops:salesServiceOps(ops),allowance:null});
  }
  /* Пакет 10 + 6 — это два разных стекла: у каждого своя базовая кромка, свой
     припуск и свой размер реза. Поэтому кроме общей геометрии снимок несёт
     раскладку ПО ЛАЙТАМ; обработка, заданная на форме, одинакова для всех
     лайтов (контур один), а различаются они базовой кромкой и толщиной. */
  var liteViews=lites.map(function(lite){
    /* У лайта может быть СВОЯ форма — тогда и кромки у него свои, а общий
       контур строки к нему отношения не имеет. */
    var ownShape=salesLineLiteShape(line,lite.index);
    if(ownShape){
      var ownEdges=salesShapePhysicalEdges(ownShape);
      return Object.assign({},lite,{shape:ownShape,ownShape:true,groups:ownEdges.map(function(edge){
        var ops=salesShapeOpsForPhysicalEdge(ownShape,edge);
        var src='Shape · lite';
        if(!ops.length&&lite.baseOps.length){ops=lite.baseOps;src='Glass';}
        return {id:edge.id,length:+edge.length||0,side:salesSideForPhysicalEdge(line,edge),ops:salesServiceOps(ops),source:src,allowance:null,p1:edge.p1,p2:edge.p2};
      })});
    }
    return Object.assign({},lite,{shape:shape,ownShape:false,groups:groups.map(function(g){
      /* Порядок источников на кромке лайта: своя обработка лайта на форме →
         общая обработка формы → базовая кромка стекла этого лайта. */
      var own=salesServiceOps((shapeLiteSpec(shape,lite.index).edgeOps||{})[g.id]||[]);
      var liteOps=own.length?own:(g.shapeOps.length?g.shapeOps:lite.baseOps);
      var src=own.length?'Shape · lite':(g.shapeOps.length?'Shape':'Glass');
      return {id:g.id,length:g.length,side:g.side,ops:salesServiceOps(liteOps),source:src,allowance:null};
    })});
  });
  /* Полировка склеенной кромки на обычном стекле — не опечатка в данных, а
     работа, которую цех физически не выполнит: склеивать нечего. Молча выбросить
     её нельзя (операция оплачиваемая), поэтому строка встаёт на проверку с
     конкретной причиной: какой лайт и почему. */
  for(var li=0;li<liteViews.length;li++){
    var lv=liteViews[li];
    if(lv.laminated)continue;
    for(var lg2=0;lg2<lv.groups.length;lg2++){
      var bad=lv.groups[lg2].ops.find(function(o){return shapeIsLamiOnlyOp(o.type);});
      if(bad)return {valid:false,reason:bad.type+' applies to a laminated lite only. '+lv.label+' is a single glass.',
                     groups:groups,shape:shape,set:set,lamiMisapplied:true,mappingPending:mappingPending};
    }
  }
  /* Если у лайтов кромка разная, карточка кромки не должна выдавать одну из них
     за общую: помечаем такие кромки, а раскладка по лайтам показана ниже. */
  groups.forEach(function(g){
    var sigs={},first=null;
    liteViews.forEach(function(lv){
      var lg=lv.groups.find(function(x){return x.id===g.id;});
      if(lg&&!first)first=lg;
      sigs[lg?salesServiceOpsSignature(lg.ops):'']=true;
    });
    g.liteVaries=Object.keys(sigs).length>1;
    /* Карточка кромки обязана показывать то, что реально уйдёт в производство:
       обработка лайта сильнее общей, и если показать общую, экран соврёт. */
    g.effectiveOps=first?salesServiceOps(first.ops):salesServiceOps(g.ops);
    if(first&&first.source&&!g.liteVaries)g.source=first.source;
  });
  return {valid:true,shape:shape,set:set,groups:groups,lites:liteViews,mappingPending:mappingPending,mappingClassified:shapeIsDxfSource(shape)?salesDxfSideMapClassified(line,shape):true,mappingCurrent:shapeIsDxfSource(shape)?salesDxfSideMapCurrent(line,shape):true};
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

/* Safety Border — зона, в которую раскрой не имеет права зайти вдоль скошенной
   или дуговой кромки. В контур реза она не входит НИКОГДА, но стол обязан её
   знать: это отступ до соседней детали. И она входит в оплачиваемый габарит —
   лист расходуется из-за скоса, который заказал клиент. До этой правки бордер
   считался только внутри Shape и в заказной payload не попадал вовсе. */
function salesEffectiveBorderPlan(shape,mm,finishedPoints,edgeIds,edgeTypes,cuttingPoints){
  var def=Object.assign({},shape||{},{thickness:String(mm)});
  var plan=shapeSafetyBorderPlan(def,finishedPoints||[],edgeIds||[],edgeTypes||{});
  return {border:plan,footprint:shapeBorderFootprint(cuttingPoints||[],plan)};
}
/* Припуск кромки лайта. Считается по СТЕКЛУ, которое лежит под инструментом:
   у ламината это плита — и когда её полируют по одной до склейки, и когда
   доводят составную кромку после. Суммарные 12.76 мм у 6+6 давали 3/16 вместо
   1/16, то есть рез на четверть дюйма крупнее по каждой оси.

   Плиты разной толщины (6+10) дают разные припуски — берём БОЛЬШИЙ: недорез
   необратим, лишнее снимается. Расхождение видно в карточке кромки, и там же
   его правят руками по стороне. */
function salesLiteAllowanceForOps(lite,ops,mm){
  var list=salesServiceOps(ops);
  if(!list.length)return {ok:true,value:0};
  var lam=!!(lite&&lite.laminated),th=lam&&lite.allowanceMm!=null?lite.allowanceMm:mm,best=0,r;
  for(var i=0;i<list.length;i++){
    r=ShapeModule.productionAllowanceRule(list[i],th,lam?'lami':'mono');
    if(!r.ok)return r;
    best=Math.max(best,+r.value||0);
  }
  return {ok:true,value:best};
}
/* Контур одного лайта: та же геометрия, свои припуски. Три ветки — простой
   прямоугольник строки, внешний DXF и рассчитанная форма. */
/* Порядок припуска на кромке: правка ЛАЙТА → правка формы → таблица. У
   ламината 6+10 стороны доводят по-разному, и правка принадлежит конкретному
   стеклу, а не всей строке. */
function salesLiteEdgeAllowanceOverride(shape,liteIndex,edgeId){
  if(liteIndex!=null){
    var spec=shapeLiteSpec(shape,liteIndex),own=spec&&spec.edgeAllowances;
    if(own){
      var v=ShapeModule.edgeAllowanceOverride({edgeAllowances:own},edgeId);
      if(v!=null)return v;
    }
  }
  return ShapeModule.edgeAllowanceOverride(shape,edgeId);
}
function salesEffectiveLiteContour(line,shape,groups,mm,liteIndex,lite){
  var i,ar,manual;
  for(i=0;i<groups.length;i++){
    ar=salesLiteAllowanceForOps(lite,groups[i].ops,mm);
    manual=salesLiteEdgeAllowanceOverride(shape,liteIndex,groups[i].id);
    /* Предложение таблицы показываем рядом с полем ввода даже когда его
       перебили — иначе не видно, от чего цех отступил. */
    groups[i].allowanceAuto=ar.ok?ar.value:null;
    groups[i].allowanceManual=manual!=null;
    if(manual!=null){groups[i].allowance=manual;continue;}
    if(!ar.ok)return {valid:false,reason:ar.reason,allowanceRuleMissing:true};
    groups[i].allowance=ar.value;
  }
  /* Ступенчатый пакет: у лайта свой отступ внутрь от контура формы, и дальше
     припуск кромки считается уже от ЕГО контура, а не от общего. */
  var insets=groups.map(function(g){return liteIndex==null?0:shapeLiteInsetFor(shape,liteIndex,g.id);});
  if(insets.some(function(v){return v>0;}))return salesEffectiveInsetContour(line,shape,groups,mm,insets);
  var byId=function(id){return groups.find(function(g){return g.id===id;})||{allowance:0};};
  if(String(shape.id||'').indexOf('IMPLICIT-RECT-')===0){
    var w=(+line.width16||0)/16,h=(+line.height16||0)/16;
    var a=byId('A').allowance||0,b=byId('B').allowance||0,c=byId('C').allowance||0,d=byId('D').allowance||0;
    var rectFinished=[[0,0],[w,0],[w,h],[0,h]],rectCut=[[-a,-b],[w+c,-b],[w+c,h+d],[-a,h+d]];
    var rectB=salesEffectiveBorderPlan(shape,mm,rectFinished,['B','C','D','A'],{A:'line',B:'line',C:'line',D:'line'},rectCut);
    return {valid:true,implicitRect:true,finishedPoints:rectFinished,cuttingPoints:rectCut,finishedW:w,finishedH:h,cutW:w+a+c,cutH:h+b+d,perimeter:2*(w+h),safetyBorder:rectB.border,footprint:rectB.footprint};
  }
  if(shapeIsDxfSource(shape)){
    var points=shapeNormalizeSource(shape.source).preview.points.map(function(p){return p.slice();});
    if(points.length<3||points.length!==groups.length)return {valid:false,reason:'DXF physical contour is unavailable.'};
    var tangent=shapeDxfTangentAllowanceIssue(groups);if(tangent)return {valid:false,reason:tangent.reason,tangentAllowanceConflict:true};
    var off=shapeOffsetVariable(points,groups.map(function(g){return g.allowance||0;}));
    if(!off.valid)return {valid:false,reason:'Effective cutting offset failed: '+off.error};
    var fb=fabEdgeBounds(points),cb=fabEdgeBounds(off.points);
    var dxfTypes={};ShapeModule.dxfEdges(shape).forEach(function(e){if(e&&e.id!=null)dxfTypes[e.id]=e.type;});
    var dxfB=salesEffectiveBorderPlan(shape,mm,points,groups.map(function(g){return g.id;}),dxfTypes,off.points);
    return {valid:true,external:true,finishedPoints:points,cuttingPoints:off.points,finishedW:fb.maxX-fb.minX,finishedH:fb.maxY-fb.minY,cutW:cb.maxX-cb.minX,cutH:cb.maxY-cb.minY,perimeter:fabPolylineLength(points,true),safetyBorder:dxfB.border,footprint:dxfB.footprint};
  }
  var effective=normalizeShapeDef(salesServiceClone(shape));effective.thickness=String(mm);effective.edgeOps={};
  groups.forEach(function(group){if(group.ops.length)effective.edgeOps[group.id]=salesServiceOps(group.ops);});
  /* ShapeModule считает контур реза сам и берёт припуск от ОДНОЙ скалярной
     толщины — посчитанные выше значения по плите иначе никуда бы не доехали.
     Отдаём их полем формы: нотчи, дуги и подготовка контура при этом работают
     прежним путём, без второго механизма переменного офсета. */
  effective.edgeAllowances={};
  groups.forEach(function(group){effective.edgeAllowances[group.id]=String(group.allowance||0);});
  var result=ShapeModule.compute(effective);
  if(!result||!result.valid)return {valid:false,reason:(result&&((result.errors&&result.errors[0])||result.reason))||'Effective Shape cutting failed.'};
  return {valid:true,external:false,effective:effective,result:result,finishedPoints:result.cutting.finishedPoints,cuttingPoints:result.cutting.points,finishedW:result.width,finishedH:result.height,cutW:result.cutting.width,cutH:result.cutting.height,perimeter:result.cutting.perimeter||fabPolylineLength(result.cutting.finishedPoints,true),safetyBorder:result.cutting.safetyBorder,footprint:result.cutting.footprint};
}
/* Зеркальный лайт: то же стекло, перевёрнутое. Отражаем контур по вертикальной
   оси его габарита и разворачиваем обход, чтобы обход остался прежним. Кромки
   сохраняют свои имена — это тот же кусок, просто повёрнутый другой стороной. */
function salesMirrorContour(points){
  var b=fabEdgeBounds(points),sum=b.minX+b.maxX;
  return points.map(function(p){return [sum-p[0],p[1]];});
}
/* Контур лайта со ступенькой: сначала уводим готовый контур внутрь на отступ
   этого лайта, потом раздуваем на припуск его кромки. Обе операции — тот же
   переменный офсет, которым считается рез. */
function salesEffectiveInsetContour(line,shape,groups,mm,insets){
  var base=salesEffectiveLiteContour(line,shape,groups.map(function(g){return {id:g.id,length:g.length,side:g.side,ops:[],source:g.source,allowance:0};}),mm,null);
  if(!base.valid)return base;
  var inner=shapeInsetVariable(base.finishedPoints,insets);
  if(!inner.valid)return {valid:false,reason:'Lite inset failed: '+inner.error};
  var cut=shapeOffsetVariable(inner.points,groups.map(function(g){return g.allowance||0;}));
  if(!cut.valid)return {valid:false,reason:'Effective cutting offset failed: '+cut.error};
  /* У сдвинутого внутрь контура кромки КОРОЧЕ — по ним и считается счёт, иначе
     клиент платил бы за длину кромки соседнего стекла. */
  inner.points.forEach(function(pt,i){
    var next=inner.points[(i+1)%inner.points.length];
    if(groups[i])groups[i].length=Math.hypot(next[0]-pt[0],next[1]-pt[1]);
  });
  var fb=fabEdgeBounds(inner.points),cb=fabEdgeBounds(cut.points);
  var types={};groups.forEach(function(g){types[g.id]='line';});
  var border=salesEffectiveBorderPlan(shape,mm,inner.points,groups.map(function(g){return g.id;}),types,cut.points);
  return {valid:true,inset:true,finishedPoints:inner.points,cuttingPoints:cut.points,
    finishedW:fb.maxX-fb.minX,finishedH:fb.maxY-fb.minY,cutW:cb.maxX-cb.minX,cutH:cb.maxY-cb.minY,
    perimeter:fabPolylineLength(inner.points,true),safetyBorder:border.border,footprint:border.footprint};
}
/* Рез считается ПО ЛАЙТАМ: у пакета 10 + 6 стёкла режутся по-разному, поэтому
   каждый лайт получает свой припуск и свой размер. Верхний уровень плана — это
   лайт с самым большим резом (по нему подбирается лист), а полная раскладка
   лежит в plan.lites. Раньше строка считалась одним куском, и любая комбинация
   разных толщин упиралась в «Exact Makeup thickness is unresolved». */
function salesEffectiveCuttingPlan(line,shape,order){
  var snap=salesEffectiveProductionSnapshot(line,shape,order);if(!snap.valid)return {valid:false,blocked:true,reason:snap.reason,groups:snap.groups||[],snapshot:snap};
  shape=snap.shape;
  var fallbackMm=Number(shape.thickness)||6;
  var liteViews=(snap.lites||[]).length?snap.lites:[{index:0,label:'Lite 1',thicknessMm:fallbackMm,baseEdgework:'',groups:snap.groups.map(function(g){return {id:g.id,length:g.length,side:g.side,ops:g.ops,source:g.source,allowance:null};})}];
  var built=[],i;
  for(i=0;i<liteViews.length;i++){
    var lite=liteViews[i],mm=Number.isFinite(+lite.thicknessMm)&&+lite.thicknessMm>0?+lite.thicknessMm:null;
    var hasProcessing=lite.groups.some(function(g){return g.ops.length>0;});
    if(hasProcessing&&mm==null)return {valid:false,blocked:true,reason:'Glass thickness of '+lite.label+' is unresolved. Effective cutting is blocked.',groups:snap.groups,snapshot:snap};
    /* Своя форма лайта считается сама по себе; отступ применяется только к
       лайтам, живущим на общей форме. */
    var liteShape=lite.shape||shape;
    var contour=salesEffectiveLiteContour(line,liteShape,lite.groups,mm==null?fallbackMm:mm,lite.ownShape?null:lite.index,lite);
    if(!contour.valid)return {valid:false,blocked:true,reason:lite.label+': '+contour.reason,groups:snap.groups,snapshot:snap,allowanceRuleMissing:contour.allowanceRuleMissing,tangentAllowanceConflict:contour.tangentAllowanceConflict};
    /* Зеркало не меняет ни размеры, ни припуски — только сторону, с которой
       стекло приходит на стол. */
    /* Флаг зеркала описывает лайт ЮНИТА, поэтому живёт на общей форме строки —
       даже когда у лайта своя геометрия. */
    if(shapeLiteMirrored(shape,lite.index)||(lite.ownShape&&shapeLiteMirrored(liteShape,lite.index))){
      contour=Object.assign({},contour,{mirrored:true,
        finishedPoints:salesMirrorContour(contour.finishedPoints),
        cuttingPoints:salesMirrorContour(contour.cuttingPoints)});
    }
    built.push(Object.assign({index:lite.index,label:lite.label,thickness:mm==null?fallbackMm:mm,plies:lite.plies,laminated:!!lite.laminated,allowanceMm:lite.allowanceMm,pliesVary:!!lite.pliesVary,baseEdgework:lite.baseEdgework,ownShape:!!lite.ownShape,shapeName:lite.ownShape?(liteShape.name||''):'',mirrored:!!contour.mirrored,groups:lite.groups},contour));
  }
  /* Лист подбирается по самому большому резу пакета. */
  var lead=built[0];
  built.forEach(function(x){if(x.cutW*x.cutH>lead.cutW*lead.cutH)lead=x;});
  var sameCut=built.every(function(x){return x.cutW===lead.cutW&&x.cutH===lead.cutH;});
  snap.groups.forEach(function(g){var lg=lead.groups.find(function(x){return x.id===g.id;});if(lg){g.allowance=lg.allowance;g.allowanceAuto=lg.allowanceAuto;g.allowanceManual=!!lg.allowanceManual;}});
  return Object.assign({},lead,{valid:true,blocked:false,groups:snap.groups,snapshot:snap,lites:built,uniformCut:sameCut,setPendingMapping:snap.mappingPending});
}

/* По каким стёклам фактически идёт операция кромки.

   Лами-полировка работает по СКЛЕЕННОЙ кромке: один проход по периметру, и
   толщина у неё пакетная. Всё остальное на ламинате делается ДО склейки — по
   каждой плите отдельно, то есть два прохода и банд прайса по толщине ПЛИТЫ.
   Для 6+6 это 0.07+0.07 против 0.28 у Lami Polish, ровно как в прайсе.

   У обычного лайта список из одной цели с прежней толщиной, поэтому в расчёте
   начислений нет ветки «если ламинат»: сегодняшний счёт — её частный случай. */
function salesEdgeOpThicknessTargets(lite,op){
  var packMm=lite&&lite.thicknessMm!=null?lite.thicknessMm:null;
  if(!lite)return [{thicknessMm:null,count:1}];
  if(shapeIsLamiOnlyOp(op&&op.type))return [{thicknessMm:packMm,count:1}];
  var plies=(Array.isArray(lite.plies)?lite.plies:[]).filter(function(p){return Number.isFinite(p.mm)&&p.mm>0;});
  if(!plies.length)return [{thicknessMm:packMm,count:1}];
  var seen={},out=[];
  plies.forEach(function(p){
    if(seen[p.mm]){seen[p.mm].count++;return;}
    seen[p.mm]={thicknessMm:p.mm,count:1};out.push(seen[p.mm]);
  });
  return out;
}
function salesEdgeChargeMetaForServiceSet(op,ctx){
  var id='',label=op.type,rate=null;
  if(op.type==='Rough Arris'){id='roughArris';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='Flat Polish'){id='flatPolish';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='CNC Shape Polish'){id='cncShapePolish';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='Lami Polish'){id='lamiPolish';rate=salesCatalogRate(id,ctx);}
  else if(op.type==='CNC Lami Polish'){id='cncLamiPolish';rate=salesCatalogRate(id,ctx);}
  /* Обе митры теперь тарифицируются: 45° получила свою ставку 10 сентября.
     Ключ строки по-прежнему выводится из угла, поэтому сохранённые заказы с
     miter22_5 читаются без миграции. */
  else if(op.type==='Mitering'){id='miter'+String(op.angle||45).replace('.','_');label='Mitering '+(op.angle||45)+'°';rate=salesCatalogRate(+op.angle===22.5?'miter225':'miter45',ctx);}
  else if(op.type==='Beveling'){id='bevel:'+String(op.width||'');label='Beveling '+String(op.width||'');rate=null;}
  else return null;
  return {id:id,label:label,rate:rate,bandKey:salesRateBandKey(id,ctx)};
}

/* Billing and Cutting read the SAME effective snapshot. */
salesLineChargeRows=function(line){
  var rows=[];
  /* Остекление (фрит, спандрел) приходит из makeup, а не из геометрии, и
     считается до выхода по отсутствию контура: наносят его и на прямоугольник. */
  salesGlazingChargeRows(line,salesLineAreaFt2(line)).forEach(function(row){rows.push(row);});
  /* Раскладка не зависит от геометрии кромки и считается до выхода по
     отсутствию контура — как и остекление выше. */
  if(typeof salesMuntinChargeRows==='function')salesMuntinChargeRows(line).forEach(function(row){rows.push(row);});
  var saved=line&&line.shapeRef?salesShapeByRef(line.shapeRef):null;
  salesUnitSurchargeRows(line,saved).forEach(function(row){rows.push(row);});
  var shape=salesLineGeometryShape(line),ctx=salesPricingThickness(line);if(!shape)return rows.filter(function(x){return x.basis>0;});
  var items=saved&&Array.isArray(saved.manufacturingItems)?saved.manufacturingItems:[];
  /* Разбор меток общий с обычной веткой расчёта — см. salesManufacturingChargeRows. */
  salesManufacturingChargeRows(items,ctx).forEach(function(row){rows.push(row);});
  var sandArea=(function(){var r=saved?ShapeModule.compute(saved):null;return r&&r.valid?r.area/144:0;})();
  salesSandblastChargeRows(saved&&saved.features,ctx,sandArea).forEach(function(row){rows.push(row);});
  /* Кромка тарифицируется ПО ЛАЙТАМ: у пакета 10 + 6 обрабатываются два разных
     стекла, каждое по своей ставке. Раньше строка считалась одним куском, и на
     любой комбинации толщин ставка не находилась вовсе. */
  var snap=salesEffectiveProductionSnapshot(line,shape,soDraft);
  if(snap.valid){
    /* Берём раскладку из ПЛАНА, если он посчитался: там длины кромок уже с
       учётом ступеньки лайта. Если рез заблокирован, счёт всё равно должен
       показывать работу — тогда работаем по снимку. */
    var plan=salesEffectiveCuttingPlan(line,shape,soDraft);
    var liteViews=(plan.valid&&(plan.lites||[]).length)?plan.lites.map(function(l){return {index:l.index,label:l.label,thicknessMm:l.thickness,plies:l.plies,laminated:l.laminated,groups:l.groups};})
      :((snap.lites||[]).length?snap.lites:[{label:'',thicknessMm:null,groups:snap.groups}]);
    /* Одинаковые операции с одинаковой ставкой складываются в одну строку счёта:
       у пакета 10 + 10 это 256″ ариса, а не две строки по 128″. Разные толщины
       остаются разными строками — у них разные ставки. */
    var acc=Object.create(null),order=[];
    liteViews.forEach(function(lite){
      lite.groups.forEach(function(group){group.ops.forEach(function(op){
        if(!(group.length>0))return;
        salesEdgeOpThicknessTargets(lite,op).forEach(function(target){
          var tCtx=target.thicknessMm==null?ctx:salesPricingBandFor(target.thicknessMm);
          var meta=salesEdgeChargeMetaForServiceSet(op,tCtx);
          if(!meta)return;
          var key=meta.id+':'+meta.bandKey;
          if(!acc[key]){acc[key]={id:meta.id,label:meta.label,band:meta.bandKey,mm:target.thicknessMm,rate:meta.rate,length:0};order.push(key);}
          acc[key].length+=group.length*(target.count||1);
        });
      });});
    });
    /* Уточнение толщины в ярлыке нужно, только когда строк с разной толщиной
       больше одной. Считаем по СОБРАННЫМ строкам, а не по лайтам: у ламината
       6+6 толщина лайта 12.76, а работа идёт по двум шестёркам. */
    var manyThickness=new Set(order.map(function(k){return acc[k].mm;})).size>1;
    order.forEach(function(key){
      var x=acc[key];
      rows.push(salesChargeRow('EDGE:'+x.id+':'+x.band,x.label+(manyThickness&&x.mm?' · '+x.mm+' mm':''),x.length,'in',x.rate,'Effective Edge Processing'));
    });
  }
  if(saved&&!shapeIsDxfSource(saved)){
    var radius=(saved.features||[]).filter(function(f){return f.type==='radius'&&inch(f.radius)>0;}).length;if(radius)rows.push(salesChargeRow('FEATURE:radius:'+ctx.band,'Radius Corner',radius,'pc',salesCatalogRate('radiusCorner',ctx),'Shape feature'));
    var cutout=(saved.features||[]).filter(function(f){return f.type==='cutout';}).length;if(cutout)rows.push(salesChargeRow('FEATURE:cutout:'+ctx.band,'Cutout',cutout,'pc',salesCatalogRate('cutout',ctx),'Shape feature'));
    salesNotchChargeRows(saved,ctx).forEach(function(row){rows.push(row);});
  }
  return rows.filter(function(row){return row.basis>0;});
};

/* Массовое изменение теперь ПИШЕТ обработку в формы выбранных строк, а не
   вешает на строку ссылку на набор. Набор стал рецептом: применили — операции
   легли в геометрию, и дальше правятся там же, где вся форма. Ничего, что
   могло бы устареть или заспорить с формой, на строке не остаётся. */
function salesApplySetOpsToShape(line,set){
  if(!line||!set)return false;
  var shape=salesEnsureLineShape(line)||salesShapeByRef(line.shapeRef);
  if(!shape)return false;
  /* Правило владельца: всё, что задано внутри формы, — это база номер один.
     Массовое изменение идёт МОДИФИКАЦИЕЙ и не имеет права встать выше: оно
     заполняет только те кромки, где на форме ничего не задано. Раньше оно
     переписывало форму целиком и сносило поставленный вручную CNC. */
  var edges=salesShapePhysicalEdges(shape),ops=salesServicePlain(shape.edgeOps),wrote=false,lam=salesLineIsLaminated(line);
  edges.forEach(function(edge){
    if((ops[edge.id]||[]).length)return;
    var list=set.mode==='perimeter'?salesServiceOps(set.perimeter):salesServiceOps((set.sides&&set.sides[salesSideForPhysicalEdge(line,edge)])||[]);
    /* Полировать склейку там, где её нет, цех не может — такую операцию из
       рецепта отбрасываем, вместо того чтобы завести строку в непроходное
       состояние. Остальное из набора ложится как обычно. */
    if(!lam)list=list.filter(function(o){return !shapeIsLamiOnlyOp(o.type);});
    if(list.length){ops[edge.id]=salesServiceClone(list);wrote=true;}
  });
  shape.edgeOps=ops;
  shape.revision=Math.max(0,Math.floor(+shape.revision||0))+1;
  line.shapeRef=normalizeShapeRef({id:shape.id,revision:shape.revision});
  return wrote;
}

/* Ручной припуск по стороне. Живёт в ФОРМЕ, а не на строке заказа: форма
   входит в отпечаток, поэтому правка честно помечает строку «форма
   изменилась». На строке она поменяла бы размер реза молча — а это уже брак,
   который никто не заметит. */
function salesSetEdgeAllowance(lineId,edgeId,v){
  var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;
  var shape=salesEnsureLineShape(line)||salesShapeByRef(line.shapeRef);if(!shape)return;
  var t=String(v==null?'':v).trim(),map=Object.assign({},shape.edgeAllowances||{});
  if(t){
    var p=fabParseDimStrict(t);
    /* Мусор и заведомо невозможный съём не принимаем: на экране остаётся
       прежнее значение, молчаливого нуля не будет. */
    if(!p.ok||!(p.v>=0)||p.v>SHAPE_ALLOWANCE_MAX_IN){render();return;}
    map[edgeId]=t;
  }else delete map[edgeId];
  shape.edgeAllowances=map;
  shape.revision=Math.max(0,Math.floor(+shape.revision||0))+1;
  line.shapeRef=normalizeShapeRef({id:shape.id,revision:shape.revision});
  touch();render();
}
function salesResetEdgeAllowances(lineId){
  var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;
  var shape=salesShapeByRef(line.shapeRef);if(!shape)return;
  if(!shape.edgeAllowances||!Object.keys(shape.edgeAllowances).length)return;
  shape.edgeAllowances={};
  shape.revision=Math.max(0,Math.floor(+shape.revision||0))+1;
  line.shapeRef=normalizeShapeRef({id:shape.id,revision:shape.revision});
  touch();render();
}
function salesHasEdgeAllowanceOverrides(line){
  var shape=line&&salesShapeByRef(line.shapeRef);
  return !!(shape&&shape.edgeAllowances&&Object.keys(shape.edgeAllowances).length);
}
/* Полировка склейки, оставшаяся на строке без ламината. Возвращает, сколько
   операций снято. Правит и общую форму, и обработку по лайтам. */
function salesShapeDropLamiOps(shape){
  if(!shape)return 0;
  var dropped=0;
  function clean(map){
    var src=salesServicePlain(map),out={};
    Object.keys(src).forEach(function(id){
      var list=salesServiceOps(src[id]).filter(function(o){
        if(shapeIsLamiOnlyOp(o.type)){dropped++;return false;}
        return true;
      });
      if(list.length)out[id]=list;
    });
    return out;
  }
  shape.edgeOps=clean(shape.edgeOps);
  var lites=salesServicePlain(shape.lites);
  Object.keys(lites).forEach(function(k){
    var spec=lites[k];if(spec&&typeof spec==='object')spec.edgeOps=clean(spec.edgeOps);
  });
  if(dropped)shape.revision=Math.max(0,Math.floor(+shape.revision||0))+1;
  return dropped;
}
/* Смена типа лайта или состава юнита убирает полировку склейки: склеивать
   больше нечего. Без этого операция оставалась в форме и держала строку в
   непроходном состоянии «Lami op on plain lite» — выйти можно было только сняв
   её вручную с каждой кромки, а причина при этом уже не была видна. */
function salesSyncLamiOpsForMakeup(makeupId){
  if(!soDraft||!makeupId)return 0;
  var dropped=0;
  (soDraft.lines||[]).forEach(function(line){
    if(line.makeupId!==makeupId||salesLineIsLaminated(line))return;
    var shapes=[salesShapeByRef(line.shapeRef)];
    (salesLineLites(line)||[]).forEach(function(l){
      var own=salesLineLiteShape(line,l.index);if(own)shapes.push(own);
    });
    var n=0;
    shapes.forEach(function(s){if(s)n+=salesShapeDropLamiOps(s);});
    if(n){
      dropped+=n;
      var main=salesShapeByRef(line.shapeRef);
      if(main)line.shapeRef=normalizeShapeRef({id:main.id,revision:main.revision});
    }
  });
  return dropped;
}
function salesLineServiceStatus(line){
  var shape=salesLineGeometryShape(line);if(!shape)return {key:'geometry',label:'Needs geometry',cls:'warn'};
  var set=salesServiceSetById(soDraft,line.serviceSetId);if(line.serviceSetId&&!set)return {key:'missing',label:'Missing set',cls:'bad'};
  if(salesDxfOverrideStale(line,shape))return {key:'lost',label:'Override needs review',cls:'bad'};
  var snap=salesEffectiveProductionSnapshot(line,shape,soDraft);
  if(!snap.valid&&snap.lamiMisapplied)return {key:'lami',label:'Lami op on plain lite',cls:'bad'};
  if(typeof salesLineMuntinMisapplied==='function'&&salesLineMuntinMisapplied(line))return {key:'muntin',label:'Muntin on single lite',cls:'bad'};
  if(!snap.valid)return {key:'effective',label:'Needs review',cls:'bad'};
  if(snap.mappingPending){var own=snap.groups.some(function(g){return g.shapeOps.length>0;});return {key:'mapping',label:own?'Set pending mapping':'Needs side mapping',cls:'warn'};}
  var cut=salesEffectiveCuttingPlan(line,shape,soDraft);if(!cut.valid)return {key:'cutting',label:'Cutting blocked',cls:'bad'};
  if(salesHasLineEdgeOverrides(line))return {key:'override',label:'Line override',cls:'info'};
  if(line.serviceSetId)return {key:'ready',label:'Set applied',cls:'ok'};
  if(snap.groups.some(function(g){return g.shapeOps.length>0;}))return {key:'shape',label:'Ready · custom edge',cls:'ok'};
  if(snap.groups.some(function(g){return g.source==='Glass'&&g.ops.length>0;}))return {key:'ready',label:'Ready · default edge',cls:'ok'};
  if(!line.shapeRef&&salesLineHasRectGeometry(line))return {key:'ready',label:'Rectangle',cls:'ok'};
  return {key:'ready',label:'No processing',cls:'ok'};
}
function salesLineNeedsServiceAttention(line){return ['geometry','missing','lost','effective','lami','muntin','mapping','cutting'].indexOf(salesLineServiceStatus(line).key)>=0;}

function salesLostOverrideEdges(line){
  var shape=salesLineGeometryShape(line),current=salesShapePhysicalEdges(shape).map(function(e){return e.id;}),edges=Object.keys((line&&line.serviceOverrides&&line.serviceOverrides.edges)||{});
  if(salesDxfOverrideStale(line,shape))return edges;
  return edges.filter(function(id){return current.indexOf(id)<0;});
}

function salesApplyLineEdgeOperation(line,edgeId,type,on){
  var shape=salesLineGeometryShape(line);if(!shape)return {ok:false,reason:'Line has no geometry.'};
  /* Ставить полировку склейки некуда, если склейки нет. Отказ с причиной —
     вызывающий её показывает; молчаливое согласие увело бы в производство
     операцию, которую не выполнить. */
  if(on&&shapeIsLamiOnlyOp(type)&&!salesLineLites(line).some(function(l){return l.laminated;}))
    return {ok:false,reason:type+' applies to a laminated lite only. This line has no laminated glass.'};
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
  var snap=plan.snapshot,src=JSON.stringify({lineId:line&&line.id||'',topology:shape&&shapeIsDxfSource(shape)?ShapeModule.dxfTopologyFingerprint(shape):'',dimensions:{w:+line.width16||0,h:+line.height16||0},thickness:plan.thickness,border:{v:(plan.safetyBorder&&plan.safetyBorder.value)||0,a:!!(plan.safetyBorder&&plan.safetyBorder.applies)},groups:(snap.groups||[]).map(function(g){return {id:g.id,ops:salesServiceOps(g.ops),allowance:g.allowance};}),cuttingPoints:(plan.cuttingPoints||[]).map(function(p){return [+p[0],+p[1]];})}),h=2166136261;
  for(var i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619);}return 'eff-'+(h>>>0).toString(16).padStart(8,'0');
}
function salesEffectiveMachinePayload(line){
  var shape=salesLineGeometryShape(line),plan=salesEffectiveCuttingPlan(line,shape,soDraft),issue=salesEffectiveMachineIssue(line,shape,plan);if(issue)return {ok:false,reason:issue};
  var round=function(v){return Math.round((+v||0)*1000000)/1000000;};
  var brd=plan.safetyBorder||{value:0,state:'AUTO',edgeIds:[],applies:false};
  var fp=plan.footprint||{width:plan.cutW,height:plan.cutH,sides:[]};
  /* Бордер уезжает отдельным блоком, а не в геометрии outer: столу нужен
     отступ до соседней детали, но контур реза от бордера не меняется. */
  return {ok:true,fingerprint:salesEffectiveProductionFingerprint(line,shape,plan),schema:'glass-erp-order-effective/v1',units:'inch',lineId:line.id,safetyBorder:{value:round(brd.value),state:brd.state,applies:!!brd.applies,edgeIds:(brd.edgeIds||[]).slice()},billableFootprint:{width:round(fp.width),height:round(fp.height),sides:(fp.sides||[]).slice(),pad:{left:round((fp.pad||{}).left),right:round((fp.pad||{}).right),top:round((fp.pad||{}).top),bottom:round((fp.pad||{}).bottom)}},lites:(plan.lites||[]).map(function(l){return {index:l.index,label:l.label,thicknessMm:l.thickness,outer:{closed:true,points:(l.cuttingPoints||[]).map(function(p){return [round(p[0]),round(p[1])];})},width:round(l.cutW),height:round(l.cutH)};}),outer:{closed:true,points:plan.cuttingPoints.map(function(p){return [Math.round(p[0]*1000000)/1000000,Math.round(p[1]*1000000)/1000000];})},snapshot:plan.snapshot};
}
