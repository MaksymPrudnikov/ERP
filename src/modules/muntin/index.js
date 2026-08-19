/* =====================================================================
   muntin/index  ·  v4.5-port
   ПУБЛИЧНЫЙ КОНТРАКТ модуля: MuntinModule.compute(shape, mdef).
   IN : shape (из ShapeModule), определение мунтина
   OUT: {valid, geo, count, totalLengthIn, segments}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function defaultMuntinModel(){return normalizeMuntinModel({enabled:true,productId:'mb058_black',flipped:false,layout:{type:'grid',verticalBars:2,horizontalBars:1},production:{mode:'equal',edgeInsetX:0.4375,edgeInsetY:0.4375,endClearance:0,edgeMode:'offset',verticalPositions:[],horizontalPositions:[]}});}
function newMuntinId(){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return 'm'+crypto.randomUUID();
  return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
function newMuntinDef(shapeId){return {id:newMuntinId(),name:'',shapeId:String(shapeId||''),shapeRevision:null,shapeFingerprint:'',muntin:defaultMuntinModel()};}
function pinMuntinShape(mdef,shape){
  if(!mdef||!shape)return mdef;var sr=ShapeModule.compute(shape);if(!sr.valid)return mdef;
  mdef.shapeId=String(shape.id||sr.definition.id);mdef.shapeRevision=sr.definition.revision||0;mdef.shapeFingerprint=sr.fingerprint;return mdef;
}
function invalidMuntin(code,reason,M,geo){return {valid:false,code:code,reason:reason,M:M,geo:geo};}
function muntinLayoutError(M,geo){
  var P=M.production,eps=1e-7;
  function checkCustom(raw,count,span,inset,label){
    if(count<=0)return null;
    if(raw.length!==count)return invalidMuntin('MUNTIN_CUSTOM_COUNT',label+': enter exactly '+count+' custom centerline position(s).',M,geo);
    var min=inset+geo.face/2,max=span-inset-geo.face/2,vals=raw.map(function(x){return +x;}).sort(function(a,b){return a-b;});
    if(max<min-eps)return invalidMuntin('MUNTIN_NO_ROOM',label+': the profile and edge insets do not fit inside the glass.',M,geo);
    for(var i=0;i<vals.length;i++){
      if(!isFinite(vals[i])||vals[i]<min-eps||vals[i]>max+eps)return invalidMuntin('MUNTIN_CUSTOM_RANGE',label+': every custom centerline must stay inside the usable perimeter.',M,geo);
      if(i&&vals[i]-vals[i-1]<geo.face-eps)return invalidMuntin('MUNTIN_OVERLAP',label+': bar profiles overlap or use the same centerline.',M,geo);
    }
    return null;
  }
  if(P.mode==='custom'){
    var customV=checkCustom(P.verticalPositions,M.layout.verticalBars,geo.spanW,geo.ix,'Vertical bars');if(customV)return customV;
    var customH=checkCustom(P.horizontalPositions,M.layout.horizontalBars,geo.spanH,geo.iy,'Horizontal bars');if(customH)return customH;
  }
  function checkBuilt(count,positions,segments,label){
    if(positions.length!==count)return invalidMuntin('MUNTIN_NO_ROOM',label+': the requested bars do not fit between the edge insets.',M,geo);
    for(var i=0;i<count;i++)if(!segments.some(function(s){return s.bar===i;}))return invalidMuntin('MUNTIN_MISSED_BAR',label+': requested bar '+(i+1)+' does not intersect the usable glass perimeter.',M,geo);
    for(i=0;i<segments.length;i++)if(!isFinite(segments[i].cut)||segments[i].cut<=eps)return invalidMuntin('MUNTIN_BAD_CUT',label+': a generated cut length is invalid.',M,geo);
    return null;
  }
  var builtV=checkBuilt(M.layout.verticalBars,geo.v||[],geo.verticalSegments||[],'Vertical bars');if(builtV)return builtV;
  return checkBuilt(M.layout.horizontalBars,geo.h||[],geo.horizontalSegments||[],'Horizontal bars');
}
function realMuntinResult(shape,mdef){
  if(!shape)return {valid:false,code:'MUNTIN_SHAPE_NOT_FOUND',reason:'Shape not found'};
  var sr=ShapeModule.compute(shape);if(!sr.valid)return {valid:false,code:'MUNTIN_SHAPE_INVALID',reason:'Shape is invalid: '+sr.reason};
  if(mdef&&mdef.shapeFingerprint&&mdef.shapeFingerprint!==sr.fingerprint)return {valid:false,code:'MUNTIN_SHAPE_REVISION',reason:'Shape revision changed. Revalidate this Muntin layout against the current Shape revision.',expectedFingerprint:mdef.shapeFingerprint,currentFingerprint:sr.fingerprint,currentRevision:sr.definition.revision||0};
  var M=normalizeMuntinModel((mdef&&mdef.muntin)||mdef||{}),geo=productionGeometryForLine(M,sr.line);
  var invalid=muntinLayoutError(M,geo);if(invalid)return invalid;
  var segs=(geo.verticalSegments||[]).concat(geo.horizontalSegments||[]),total=segs.reduce(function(a,s){return a+s.cut;},0);
  return {valid:true,geo:geo,M:M,count:segs.length,totalLengthIn:total,verticalSegments:geo.verticalSegments||[],horizontalSegments:geo.horizontalSegments||[]};
}
const MuntinModule={code:'MUNTIN',name:'Adaptive Muntin',version:'v4.5-port',compute:realMuntinResult};
