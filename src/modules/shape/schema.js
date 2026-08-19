/* =====================================================================
   shape/schema · schema-v2
   Нормализация определения Shape. Старый Smart-Shape остаётся совместимым.
   ===================================================================== */

var SHAPE_EDGE_OPS=['Rough Arris','Flat Polish','CNC Shape Polish','Mitering','Beveling'];
var SHAPE_FEATURE_TYPES=['hole','cutout','radius','hardware','stamp'];
function shapeNewEntityId(prefix){
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return prefix+crypto.randomUUID();
  return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
}
function shapePlainObject(x){return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
function shapeTextValue(v,d){return String(v==null?(d==null?'':d):v);}
function shapeNormalizeOp(op){
  op=shapePlainObject(op);var type=SHAPE_EDGE_OPS.indexOf(op.type)>=0?op.type:null;if(!type)return null;
  var out={id:shapeTextValue(op.id,shapeNewEntityId('eo-')),type:type};
  if(type==='Mitering')out.angle=[22.5,45].indexOf(+op.angle)>=0?+op.angle:45;
  if(type==='Beveling')out.width=shapeTextValue(op.width,'1');
  return out;
}
function shapeNormalizeFeature(f){
  f=shapePlainObject(f);var type=SHAPE_FEATURE_TYPES.indexOf(f.type)>=0?f.type:'hole';
  var out={id:shapeTextValue(f.id,shapeNewEntityId('sf-')),type:type};
  if(type==='hole')Object.assign(out,{diameter:shapeTextValue(f.diameter,'1/2'),x:shapeTextValue(f.x,'3'),y:shapeTextValue(f.y,'3'),minEdge:shapeTextValue(f.minEdge,'1/2')});
  if(type==='cutout')Object.assign(out,{width:shapeTextValue(f.width,'4'),height:shapeTextValue(f.height,'4'),x:shapeTextValue(f.x,'8'),y:shapeTextValue(f.y,'8'),cornerRadius:shapeTextValue(f.cornerRadius,'0')});
  if(type==='radius')Object.assign(out,{vertexId:shapeTextValue(f.vertexId,''),radius:shapeTextValue(f.radius,'1/2')});
  if(type==='hardware')Object.assign(out,{name:shapeTextValue(f.name,'Custom Hardware'),edgeId:shapeTextValue(f.edgeId,''),distance:shapeTextValue(f.distance,'12'),inset:shapeTextValue(f.inset,'0'),prepWidth:shapeTextValue(f.prepWidth,'2'),prepHeight:shapeTextValue(f.prepHeight,'2'),holeDia:shapeTextValue(f.holeDia,'1/2')});
  if(type==='stamp')Object.assign(out,{x:shapeTextValue(f.x,'3'),y:shapeTextValue(f.y,'1'),text:shapeTextValue(f.text,'TEMPER')});
  return out;
}
function shapeNormalizePolygon(raw){
  if(!Array.isArray(raw)||raw.length<3)return [{id:'PV1',x:'0',y:'0'},{id:'PV2',x:'0',y:'36'},{id:'PV3',x:'48',y:'36'},{id:'PV4',x:'48',y:'0'}];
  var seen=Object.create(null);return raw.map(function(v,i){v=shapePlainObject(v);var id=shapeTextValue(v.id,'PV'+(i+1));if(seen[id])id='PV'+(i+1);seen[id]=true;return {id:id,x:shapeTextValue(v.x,'0'),y:shapeTextValue(v.y,'0')};});
}
function normalizeShapeDef(s){
  s=shapePlainObject(s);var type=s.type==null||s.type===''?'smart':String(s.type),defaults=shapeDefaultParams(type),params=shapePlainObject(s.params),edgeOps=shapePlainObject(s.edgeOps),ops={};
  Object.keys(defaults).forEach(function(k){if(params[k]==null)params[k]=defaults[k];else params[k]=shapeTextValue(params[k]);});
  Object.keys(edgeOps).forEach(function(id){var list=Array.isArray(edgeOps[id])?edgeOps[id]:[],clean=list.map(shapeNormalizeOp).filter(Boolean);if(clean.length)ops[id]=clean;});
  var out={
    id:shapeTextValue(s.id,shapeNewEntityId('s')),name:shapeTextValue(s.name,''),type:type,
    w:shapeTextValue(s.w,type==='circle'?'36':'48'),h:shapeTextValue(s.h,type==='circle'?(s.w||'36'):'36'),
    thickness:shapeTextValue(s.thickness,'6'),params:params,polygon:shapeNormalizePolygon(s.polygon),
    smart:ssNormalize(s.smart||{}),features:(Array.isArray(s.features)?s.features:[]).map(shapeNormalizeFeature),edgeOps:ops,
    schemaVersion:2,revision:Math.max(0,Math.floor(+s.revision||0)),status:s.status==='released'?'released':'draft'
  };
  if(type==='circle'&&s.h==null)out.h=out.w;
  return out;
}
function newShapeDef(type){
  type=shapeType(type||'smart');var out=normalizeShapeDef({id:shapeNewEntityId('s'),name:'',type:type,w:type==='circle'?'36':'48',h:type==='circle'?'36':'36',params:shapeDefaultParams(type),smart:defaultSmartModel(),features:[],edgeOps:{}});
  if(type==='polygon')out.polygon=shapeNormalizePolygon(null);return out;
}
function newSmartShapeDef(){return newShapeDef('smart');}
function newShapeFeature(type,context){
  var f=shapeNormalizeFeature({id:shapeNewEntityId('sf-'),type:type}),r=context&&context.edges&&context.edges[0];
  if(type==='radius'&&context&&context.vertices&&context.vertices[0])f.vertexId=context.vertices[0].id;
  if(type==='hardware'&&r)f.edgeId=r.id;
  return f;
}
function shapeParamSpecsFor(type){
  var labels={skew:'Skew',leftDrop:'Left top drop',rightDrop:'Right top drop',apexX:'Apex X',tlx:'TL X',tly:'TL Y',trx:'TR X',try:'TR Y',brx:'BR X',bry:'BR Y',blx:'BL X',bly:'BL Y',depth:'Notch depth',height:'Notch height',fromBottom:'From bottom',width:'Notch width',fromLeft:'From left',depth1:'Depth 1',height1:'Height 1',gap:'Gap',depth2:'Depth 2',height2:'Height 2'};
  return Object.keys(shapeDefaultParams(type)).map(function(k){return {key:k,label:labels[k]||k};});
}
