/* =====================================================================
   muntin/index  ·  v4.5-port
   ПУБЛИЧНЫЙ КОНТРАКТ модуля: MuntinModule.compute(shape, mdef).
   IN : shape (из ShapeModule), определение мунтина
   OUT: {valid, geo, count, totalLengthIn, segments}
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function defaultMuntinModel(){return normalizeMuntinModel({enabled:true,productId:'mb058_black',flipped:false,layout:{type:'grid',verticalBars:2,horizontalBars:1},production:{mode:'equal',edgeInsetX:0.4375,edgeInsetY:0.4375,endClearance:0,edgeMode:'offset',verticalPositions:[],horizontalPositions:[]}});}
function newMuntinDef(){return {id:'m'+Date.now(),name:'',shapeId:(DB.shapeDef[0]||{}).id||'',muntin:defaultMuntinModel()};}
function realMuntinResult(shape,mdef){
  if(!shape)return {valid:false,reason:'Shape not found'};
  var sr=ShapeModule.compute(shape);if(!sr.valid)return {valid:false,reason:'Shape is invalid: '+sr.reason};
  var M=normalizeMuntinModel((mdef&&mdef.muntin)||mdef||{}),geo=productionGeometryForLine(M,sr.line);
  var segs=(geo.verticalSegments||[]).concat(geo.horizontalSegments||[]),total=segs.reduce(function(a,s){return a+s.cut;},0);
  return {valid:true,geo:geo,M:M,count:segs.length,totalLengthIn:total,verticalSegments:geo.verticalSegments||[],horizontalSegments:geo.horizontalSegments||[]};
}
const MuntinModule={code:'MUNTIN',name:'Adaptive Muntin',version:'v4.5-port',compute:realMuntinResult};
