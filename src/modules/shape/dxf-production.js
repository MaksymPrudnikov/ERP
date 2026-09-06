/* =====================================================================
   shape/dxf-production · schema-v2 extension
   Производственная логика внешнего DXF. Файл не знает про Sales, цены,
   клиентов или заказы: только finished contour -> edgework -> cutting.
   ===================================================================== */

/* Лами-полировка — АЛЬТЕРНАТИВА арису и обычной полировке на той же кромке,
   а не добавка к ним: кромку доводят либо по каждой плите до склейки, либо по
   склеенному пакету после. Попав в этот список, они автоматически получают и
   взаимное исключение, и переключение через shapeTogglePrimaryFinish. */
const SHAPE_PRIMARY_FINISHES=['Rough Arris','Flat Polish','CNC Shape Polish','Lami Polish','CNC Lami Polish'];
/* Перечисление финишей в тексте ошибки собирается из самого списка: добавили
   финиш — сообщение обновилось само. Список и текст уже жили порознь в двух
   файлах, и разойтись им было нечем помешать. */
function shapePrimaryFinishList(){
  var a=SHAPE_PRIMARY_FINISHES;
  return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
}

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
  if(primary>1)return {ok:false,reason:'Edge '+edgeId+': '+shapePrimaryFinishList()+' are mutually exclusive finishes.'};
  return {ok:true};
}

/* Не используем нулевой fallback там, где технологическая таблица неизвестна. */
/* Цеховые значения припуска, подтверждены владельцем 31 августа 2026 — из
   кода их вывести нельзя.
   Rough Arris = 0 ВСЕГДА: ручная зачистка фаски контур не съедает, она только
   делает кромку безопасной, поэтому лист под неё не увеличивается никогда. */
/* Цеховая таблица припуска. Раньше эти цифры были зашиты сюда ветками if, и
   поправить их можно было только правкой кода. Теперь это ДАННЫЕ: владелец
   меняет их в Справочниках, а строки ниже — заводской сид.

   scope='mono' меряется по самому стеклу, scope='lami' — по ПЛИТЕ склейки.
   Признак обязателен, а не удобен: на двенадцати миллиметрах таблицы
   расходятся (монолит 3/16, ламинат 1/8).

   Верхний ламинатный банд открыт: 10+10 и 12+12 иначе остаются без правила
   навсегда. У CNC Shape Polish широкая строка 0–1000 повторяет прежнее «1/4 на
   всё остальное», а узкая 15–19 её перекрывает — выигрывает самая УЗКАЯ
   подходящая строка, поэтому порядок строк ничего не решает. */
function shapeAllowanceRow(op,scope,minMm,maxMm,allowance,note){
  return {id:'ALW-'+op.replace(/[^A-Za-z]+/g,'').toUpperCase()+'-'+scope.toUpperCase()+'-'+minMm+'-'+maxMm,
          op:op,scope:scope,minMm:minMm,maxMm:maxMm,allowance:allowance,note:note||''};
}
function shapeAllowanceDefaults(){
  var rows=[],flatLike=['Flat Polish','Mitering','Beveling'];
  /* Арис не увеличивает лист НИКОГДА: ручная зачистка фаски делает кромку
     безопасной, но контур не съедает. */
  rows.push(shapeAllowanceRow('Rough Arris','mono',0,1000,'0','притупление контур не съедает'));
  rows.push(shapeAllowanceRow('Rough Arris','lami',0,1000,'0','притупление контур не съедает'));
  flatLike.forEach(function(op){
    rows.push(shapeAllowanceRow(op,'mono',3,6,'1/16'));
    rows.push(shapeAllowanceRow(op,'mono',8,10,'1/8'));
    rows.push(shapeAllowanceRow(op,'mono',12,15,'3/16'));
    rows.push(shapeAllowanceRow(op,'mono',16,19,'1/2'));
    rows.push(shapeAllowanceRow(op,'lami',3,6,'1/16','по толщине ПЛИТЫ'));
    rows.push(shapeAllowanceRow(op,'lami',8,1000,'1/8','по толщине ПЛИТЫ'));
  });
  rows.push(shapeAllowanceRow('CNC Shape Polish','mono',0,1000,'1/4'));
  rows.push(shapeAllowanceRow('CNC Shape Polish','mono',15,19,'1/2','толстое стекло с большим съёмом'));
  rows.push(shapeAllowanceRow('CNC Shape Polish','lami',3,6,'1/16','по толщине ПЛИТЫ'));
  rows.push(shapeAllowanceRow('CNC Shape Polish','lami',8,1000,'1/8','по толщине ПЛИТЫ'));
  SHAPE_LAMI_ONLY_OPS.forEach(function(op){
    rows.push(shapeAllowanceRow(op,'lami',3,6,'1/16','склеенная кромка, по толщине ПЛИТЫ'));
    rows.push(shapeAllowanceRow(op,'lami',8,1000,'1/8','склеенная кромка, по толщине ПЛИТЫ'));
  });
  return rows;
}
/* Съём на сторону физически не бывает больше пары дюймов. Предел здесь не
   формальность: «316» вместо «3/16» — валидное число для парсера, и такая
   опечатка молча увела бы рез на 316 дюймов. */
var SHAPE_ALLOWANCE_MAX_IN=2;
function shapeNormalizeAllowanceRows(raw){
  var out=[];
  (Array.isArray(raw)?raw:[]).forEach(function(r){
    if(!r||SHAPE_EDGE_OPS.indexOf(r.op)<0)return;
    var scope=r.scope==='lami'?'lami':'mono',lo=Number(r.minMm),hi=Number(r.maxMm);
    var p=fabParseDimStrict(r.allowance==null?'':r.allowance);
    if(!isFinite(lo)||!isFinite(hi)||lo<0||hi<lo)return;
    if(!p.ok||!(p.v>=0)||p.v>SHAPE_ALLOWANCE_MAX_IN)return;
    out.push({id:String(r.id||shapeAllowanceRow(r.op,scope,lo,hi,String(r.allowance)).id),
              op:r.op,scope:scope,minMm:lo,maxMm:hi,allowance:String(r.allowance).trim(),value:p.v,note:String(r.note==null?'':r.note)});
  });
  return out;
}
var SHAPE_ALLOWANCE_ROWS=null,SHAPE_ALLOWANCE_FALLBACK=null;
/* Модуль остаётся самодостаточным: без инъекции работает заводской сид, и
   тесты самого Shape не требуют поднятой базы ERP. Битая или пустая таблица
   из базы тоже откатывается сюда, а не блокирует рез. */
function shapeAllowanceTable(){
  if(SHAPE_ALLOWANCE_ROWS&&SHAPE_ALLOWANCE_ROWS.length)return SHAPE_ALLOWANCE_ROWS;
  if(!SHAPE_ALLOWANCE_FALLBACK)SHAPE_ALLOWANCE_FALLBACK=shapeNormalizeAllowanceRows(shapeAllowanceDefaults());
  return SHAPE_ALLOWANCE_FALLBACK;
}
function shapeSetAllowanceTable(rows){
  var n=shapeNormalizeAllowanceRows(rows);
  SHAPE_ALLOWANCE_ROWS=n.length?n:null;
  return SHAPE_ALLOWANCE_ROWS?SHAPE_ALLOWANCE_ROWS.length:0;
}
/* Выигрывает самая УЗКАЯ подходящая строка: широкая задаёт умолчание, узкая
   описывает исключение внутри него. */
function shapeAllowanceRowFor(type,mm,scope){
  var rows=shapeAllowanceTable(),best=null,i,r;
  for(i=0;i<rows.length;i++){
    r=rows[i];
    if(r.op!==type||r.scope!==scope)continue;
    if(!(mm>=r.minMm&&mm<=r.maxMm))continue;
    if(!best||(r.maxMm-r.minMm)<(best.maxMm-best.minMm))best=r;
  }
  return best;
}
function shapeProductionAllowanceRule(op,thicknessMm,scope){
  var type=typeof op==='string'?op:(op&&op.type)||'',mm=Number(thicknessMm);
  if(SHAPE_EDGE_OPS.indexOf(type)<0)return {ok:true,value:0};
  var lami=scope==='lami'||shapeIsLamiOnlyOp(type),row=null;
  if(lami)row=shapeAllowanceRowFor(type,mm,'lami');
  /* Плита толще ламинатной таблицы падает в монолитную строку — объяснимое
     число лучше, чем блокировка. Своей строки нет только у лами-полировки:
     вне ламината она не выполняется. */
  if(!row&&!shapeIsLamiOnlyOp(type))row=shapeAllowanceRowFor(type,mm,'mono');
  if(row)return {ok:true,value:row.value};
  return {ok:false,value:null,reason:type+' allowance rule is not configured for '+mm+' mm glass.'};
}

/* Припуск кромки на производственном пути: ручная правка сильнее таблицы и
   СНИМАЕТ блокировку «правило не заведено» — цех уже назвал число сам. */
function shapeProductionAllowanceForEdge(def,edgeId,ops,thicknessMm,parentEdges){
  var ov=shapeEdgeAllowanceOverride(def,edgeId,parentEdges);
  if(ov!=null)return {ok:true,value:ov,manual:true};
  return shapeProductionAllowanceForOps(ops,thicknessMm);
}
function shapeProductionAllowanceForOps(ops,thicknessMm,scope){
  var max=0,list=(Array.isArray(ops)?ops:[]).map(shapeNormalizeOp).filter(Boolean);
  for(var i=0;i<list.length;i++){
    var r=shapeProductionAllowanceRule(list[i],thicknessMm,scope);
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
      req.push({id:'MANUFACTURING:'+item.id,source:'MANUFACTURING',operation:shapeHoleOperation(item),stationClass:'DRILLING',manufacturingItemId:item.id,params:shapeHoleRequirementParams(item,dia)});
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
    if(isFinite(th)&&shapeEdgeAllowanceOverride(def,id)==null)shapeEdgeOps(def,id).forEach(function(op){var r=shapeProductionAllowanceRule(op,th);if(!r.ok)errors.push('Edge '+id+': '+r.reason);});
  });
  if(!isFinite(th)||!(th>0))errors.push('Shape thickness must be a positive number for DXF cutting.');
  (def.manufacturingItems||[]).forEach(function(item){
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),count=shapeHoleCount(item),centers=shapeHoleCenters(item),name=count===3?'Hole Triple ':count===2?'Hole Double ':'Hole ';
      if(!d.ok||!(d.v>0))errors.push('Hole '+item.id+': diameter must be greater than zero.');
      if(count===2){var spacing=shapeHoleSpacing(item);if(!isFinite(spacing)||!(spacing>0))errors.push(name+item.id+': center-to-center distance must be greater than zero.');else if(d.ok&&spacing<d.v-1e-8)errors.push(name+item.id+': center-to-center distance cannot be smaller than the diameter.');}
      else if(count===3){var vs=shapeHoleTripleVSpacing(item),hs=shapeHoleTripleHSpacing(item);if(!isFinite(vs)||!(vs>0))errors.push(name+item.id+': vertical center-to-center distance must be greater than zero.');else if(d.ok&&vs<d.v-1e-8)errors.push(name+item.id+': vertical center-to-center distance cannot be smaller than the diameter.');if(!isFinite(hs)||!(hs>0))errors.push(name+item.id+': horizontal center-to-center distance must be greater than zero.');else if(d.ok&&hs<d.v-1e-8)errors.push(name+item.id+': horizontal center-to-center distance cannot be smaller than the diameter.');}
      if(!centers.every(function(c){return fabPointInPoly(c,points);}))errors.push(name+item.id+': '+(count>1?'all centers must':'center must')+' stay inside the finished DXF contour.');
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
    var e=edges[i],ar=shapeProductionAllowanceForEdge(def,e.id,shapeEdgeOps(def,e.id),th,e.parentEdges);
    if(!ar.ok)return {valid:false,error:ar.reason,errors:[ar.reason]};
    allowances.push(ar.value);groups.push(Object.assign({},e,{allowance:ar.value}));
  }
  var tangent=shapeDxfTangentAllowanceIssue(groups);if(tangent)return {valid:false,error:tangent.reason,errors:[tangent.reason]};
  /* DXF — уже проверенный пользователем finished contour. Сохраняем его
     вогнутые участки в cutting contour; convex hull здесь меняет исходный
     файл. Отверстия и отдельные manufacturing items в файл резки не попадают. */
  var srcIds=edges.map(function(e){return e.id;});
  var contour=shapePrepareCuttingContour(points,allowances,srcIds,true);
  var off=shapeOffsetVariable(contour.points,contour.dist);if(!off.valid)return {valid:false,error:off.error,errors:[off.error]};
  var b=fabEdgeBounds(off.points),warnings=[];
  var types={};edges.forEach(function(e){if(e&&e.id!=null)types[e.id]=e.type;});
  var border=shapeSafetyBorderPlan(def,contour.points,contour.ids,types),footprint=shapeBorderFootprint(off.points,border);
  if(border.manualRequired)warnings.push('Safety Border has no automatic value for this thickness — set it manually before cutting.');
  return {valid:true,points:off.points,finishedPoints:points,edgeIds:(contour.ids||[]).slice(),allowances:(contour.dist||[]).slice(),notchesRemoved:contour.removed,holes:[],cutouts:[],hardware:[],safetyBorder:border,footprint:footprint,minX:b.minX,maxX:b.maxX,minY:b.minY,maxY:b.maxY,width:b.maxX-b.minX,height:b.maxY-b.minY,warnings:warnings,toleranceIn:1/256,edges:edges};
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
ShapeModule.setAllowanceTable=shapeSetAllowanceTable;
ShapeModule.edgeAllowanceOverride=shapeEdgeAllowanceOverride;
ShapeModule.allowanceTable=shapeAllowanceTable;
ShapeModule.allowanceDefaults=shapeAllowanceDefaults;
ShapeModule.productionAllowanceForOps=shapeProductionAllowanceForOps;
ShapeModule.validateEdgeOperations=shapeValidateEdgeOperations;
ShapeModule.validateProductionEdgework=shapeValidateProductionEdgework;
ShapeModule.dxfCuttingPlan=shapeDxfCuttingPlan;
ShapeModule.dxfProductionResult=shapeDxfProductionResult;
ShapeModule.dxfManufacturingPoint=shapeDxfManufacturingPoint;
