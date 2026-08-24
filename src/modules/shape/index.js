/* =====================================================================
   shape/index  ·  v4.5-port
   ПУБЛИЧНЫЙ КОНТРАКТ модуля: ShapeModule.compute(shapeDef).
   IN : определение фигуры {w,h,smart}
   OUT: {valid, width, height, area, points, segs, line}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function defaultSmartModel(){return ssNormalize({elbowsOn:false,A:{out:'0'},B:{out:'0'},C:{len:'',out:'0'},corners:{tl:'none',tr:'none',br:'none',bl:'none'},extraEdges:{}});}
function newShapeId(){return shapeNewEntityId('s');}
/* Значения по умолчанию принадлежат только новой форме. Пустой/нулевой размер
   существующей формы нельзя молча заменять — это производственный брак. */
function shapeDefToLine(s){
  var n=normalizeShapeDef(s||{});return {w:n.w,h:n.h,shape:{type:n.type,smart:n.smart,params:n.params,polygon:n.polygon,features:n.features,edgeOps:n.edgeOps,definition:n},definition:n};
}
function shapeFingerprint(def){
  var payload=shapeIsDxfSource(def)?{source:{kind:'dxf',fileName:def.source.fileName,fileSize:def.source.fileSize,uploadedAt:def.source.uploadedAt,preview:def.source.preview}}:{type:def.type,w:def.w,h:def.h,thickness:def.thickness,params:def.params,polygon:def.polygon,smart:def.smart,features:def.features,edgeOps:def.edgeOps};
  /* Preserve every legacy fingerprint when no PR2 items exist. Once a
     manufacturing annotation is added, it becomes part of the Shape revision. */
  if(def.manufacturingItems&&def.manufacturingItems.length)payload.manufacturingItems=def.manufacturingItems;
  var src=JSON.stringify(payload),h=2166136261;
  for(var i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619);}return 'shp-'+(h>>>0).toString(16).padStart(8,'0');
}
function shapeModuleResult(s){
  var def=normalizeShapeDef(s||{});
  if(shapeIsDxfSource(def)){
    var sourceValidation=shapeValidateSource(def),fingerprint=shapeFingerprint(def),preview=def.source.preview||shapeNormalizeDxfPreview(null);
    if(sourceValidation.errors.length)return {valid:false,externalFile:true,sourceValid:false,reason:sourceValidation.errors[0],errors:sourceValidation.errors,warns:sourceValidation.warns,definition:def,fingerprint:fingerprint};
    var width=preview.width16/16,height=preview.height16/16,points=preview.points||[],contourArea=Math.abs(fabSignedArea(points)),externalReq=shapeDerivedRequirements(def,{edges:[]},{holes:[],cutouts:[],hardware:[],radii:[]});
    return {valid:false,externalFile:true,sourceValid:true,reason:'External DXF source uses validated preview geometry, not ERP cutting geometry.',errors:[],warns:sourceValidation.warns,definition:def,fingerprint:fingerprint,width:width,height:height,points:points,area:contourArea,billableArea:width*height,perimeter:fabPolylineLength(points,true),requirements:externalReq};
  }
  var S=shapeDefToLine(def),G=shapeGeometry(S);
  if(!G.ok)return {valid:false,reason:G.error||'Invalid Shape',errors:G.errors||[G.error],warns:G.warns||[],line:S,geometry:G,definition:def};
  var fg=shapeFeatureGeometry(def,G),v=shapeValidateComputed(def,G,fg);
  if(v.errors.length)return {valid:false,reason:v.errors[0],errors:v.errors,warns:v.warns,line:S,geometry:G,definition:def,featureGeometry:fg};
  var cutting=shapeCuttingGeometry(def,G,fg);if(!cutting.valid)return {valid:false,reason:cutting.error,errors:[cutting.error],warns:v.warns,line:S,geometry:G,definition:def,featureGeometry:fg,cutting:cutting};
  var outer=Math.abs(fabSignedArea(G.points)),removed=(fg.holes||[]).reduce(function(a,h){return a+Math.PI*Math.pow(h.diameter/2,2);},0)+(fg.cutouts||[]).reduce(function(a,c){return a+c.width*c.height-(4-Math.PI)*Math.pow(c.cornerRadius||0,2);},0),req=shapeDerivedRequirements(def,G,fg);
  var edgeGroups=shapeEdgeGroups(G),segs=(G.smartSegs||G.edges||[]);
  return {valid:true,width:G.bboxW,height:G.bboxH,area:Math.max(0,outer-removed),grossArea:outer,perimeter:fabPolylineLength(G.points,true),points:G.points,segs:segs,edges:edgeGroups,vertices:G.vertices||[],base:G.smartBase||null,warns:(G.warns||[]).concat(v.warns||[]).concat(cutting.warnings||[]),line:S,geometry:G,definition:def,featureGeometry:fg,requirements:req,cutting:cutting,fingerprint:shapeFingerprint(def)};
}
const ShapeModule={
  code:'SHAPE',name:'Production Shape / Drawing / Cutting',version:'schema-v2',catalog:SHAPE_PRESETS,
  compute:shapeModuleResult,productionSvg:shapeProductionSvg,cuttingSvg:shapeCuttingSvg,
  machinePayload:shapeMachinePayload,genericDxf:shapeGenericDxf
};
