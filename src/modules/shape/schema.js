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
  /* Сторона обработки — производственный параметр, а не оформление:
     Front Mitre оставляет длинной ЛИЦЕВУЮ грань и подрезает тыльную,
     Back Mitre — наоборот. От неё зависит вид сверху и тип машинной линии. */
  if(type==='Mitering'){out.angle=[22.5,45].indexOf(+op.angle)>=0?+op.angle:45;out.side=op.side==='front'?'front':'back';}
  if(type==='Beveling'){out.width=shapeTextValue(op.width,'1');out.side=op.side==='back'?'back':'front';}
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
function shapeDxfCoord(v){var n=+v;return isFinite(n)?Math.round(n*1000000)/1000000:NaN;}
function shapeNormalizeDxfPreview(raw){
  raw=shapePlainObject(raw);var pts=Array.isArray(raw.points)?raw.points:[],clean=[];
  if(pts.length>=3&&pts.length<=2048)for(var i=0;i<pts.length;i++){
    var p=Array.isArray(pts[i])?pts[i]:[],x=shapeDxfCoord(p[0]),y=shapeDxfCoord(p[1]);if(!isFinite(x)||!isFinite(y)){clean=[];break;}clean.push([x,y]);
  }
  var width16=Math.max(0,Math.floor(+raw.width16||0)),height16=Math.max(0,Math.floor(+raw.height16||0));
  return {units:raw.units==='in'?'in':'',points:clean,width16:width16,height16:height16};
}
function shapeNormalizeSource(raw){
  raw=shapePlainObject(raw);var kind=raw.kind==='dxf'?'dxf':'drawn',out={kind:kind,fileName:kind==='dxf'?shapeTextValue(raw.fileName,''):'',fileSize:kind==='dxf'?Math.max(0,Math.floor(+raw.fileSize||0)):0,uploadedAt:kind==='dxf'?shapeTextValue(raw.uploadedAt,''):'',note:shapeTextValue(raw.note,'')};
  if(kind==='dxf')out.preview=shapeNormalizeDxfPreview(raw.preview);return out;
}
function shapeIsDxfSource(def){return !!(def&&def.source&&def.source.kind==='dxf');}

/* Manufacturing marks are annotations tied to a Shape revision.
   They do NOT modify cutting geometry or the original DXF. Services and pricing
   are derived from these marks elsewhere; the Shape stores only what/where. */
const SHAPE_MANUFACTURING_ITEM_TYPES=['clamp','hinge','hole'];
function shapeNormalizeManufacturingItem(raw){
  raw=shapePlainObject(raw);var type=SHAPE_MANUFACTURING_ITEM_TYPES.indexOf(raw.type)>=0?raw.type:'hole';
  var out={id:shapeTextValue(raw.id,shapeNewEntityId('mi-')),type:type,note:shapeTextValue(raw.note,'')};
  if(type==='hole'){
    var x=shapeDxfCoord(raw.x),y=shapeDxfCoord(raw.y);if(!isFinite(x))x=0;if(!isFinite(y))y=0;
    out.x=Math.round(x*16)/16;out.y=Math.round(y*16)/16;out.diameter=shapeTextValue(raw.diameter,'3/4');
    out.hRef=raw.hRef==='right'?'right':'left';out.vRef=raw.vRef==='top'?'top':'bottom';
  }else{
    var edges=['left','right','bottom','top'],edge=edges.indexOf(raw.edge)>=0?raw.edge:'left',distance=shapeDxfCoord(raw.distance);
    if(!isFinite(distance)||distance<0)distance=0;out.edge=edge;out.distance=Math.round(distance*16)/16;
  }
  return out;
}
function shapeNormalizeManufacturingItems(raw){
  return (Array.isArray(raw)?raw:[]).map(shapeNormalizeManufacturingItem).slice(0,200);
}
function shapeDxfFail(message){return {ok:false,error:message};}
function shapeParseFusionDxf(text){
  text=String(text==null?'':text);if(!text.trim())return shapeDxfFail('DXF file is empty.');
  var lines=text.replace(/\r/g,'').split('\n'),pairs=[];
  for(var i=0;i+1<lines.length;i+=2){var code=String(lines[i]).trim();if(code==='')continue;pairs.push({code:code,value:String(lines[i+1]).trim()});}
  if(!pairs.length)return shapeDxfFail('DXF file has no readable group codes.');
  var units=null;
  for(i=0;i<pairs.length;i++)if(pairs[i].code==='9'&&pairs[i].value==='$INSUNITS'){
    for(var ui=i+1;ui<pairs.length&&ui<i+8;ui++){if(pairs[ui].code==='9'||(pairs[ui].code==='0'&&pairs[ui].value==='ENDSEC'))break;if(pairs[ui].code==='70'){units=+pairs[ui].value;break;}}
    break;
  }
  if(units!==1)return shapeDxfFail('DXF units must be inches (INSUNITS = 1).');
  var inEntities=false,entities=[],current=null;
  for(i=0;i<pairs.length;i++){
    var q=pairs[i];
    if(q.code==='0'&&q.value==='SECTION'&&pairs[i+1]&&pairs[i+1].code==='2'&&pairs[i+1].value==='ENTITIES'){inEntities=true;i++;continue;}
    if(inEntities&&q.code==='0'&&q.value==='ENDSEC'){if(current)entities.push(current);current=null;inEntities=false;continue;}
    if(!inEntities)continue;
    if(q.code==='0'){
      if(current)entities.push(current);
      current={type:q.value,groups:[]};
    }else if(current)current.groups.push(q);
  }
  if(current)entities.push(current);
  if(!entities.length)return shapeDxfFail('DXF ENTITIES section is empty.');
  var unsupported=entities.filter(function(e){return e.type!=='LWPOLYLINE';});
  if(unsupported.length)return shapeDxfFail('DXF contains unsupported entity type '+unsupported[0].type+'.');
  if(entities.length!==1)return shapeDxfFail('DXF must contain exactly one closed LWPOLYLINE contour.');
  var e=entities[0],flags=0,expected=0,points=[],pendingX=null,hasBulge=false;
  e.groups.forEach(function(g){
    if(g.code==='70')flags=+g.value||0;
    else if(g.code==='90')expected=Math.max(0,Math.floor(+g.value||0));
    else if(g.code==='10'){
      if(pendingX!==null)points.push([pendingX,NaN]);
      pendingX=+g.value;
    }else if(g.code==='20'&&pendingX!==null){points.push([pendingX,+g.value]);pendingX=null;}
    else if(g.code==='42'&&Math.abs(+g.value||0)>1e-12)hasBulge=true;
  });
  if(pendingX!==null)points.push([pendingX,NaN]);
  if(!(flags&1))return shapeDxfFail('DXF contour must be closed.');
  if(hasBulge)return shapeDxfFail('DXF contour must contain straight line segments only.');
  if(points.length<3)return shapeDxfFail('DXF contour must contain at least three vertices.');
  if(points.length>2048)return shapeDxfFail('DXF contour has too many vertices for the Production Shape preview.');
  if(expected&&expected!==points.length)return shapeDxfFail('DXF vertex count does not match the LWPOLYLINE header.');
  if(points.some(function(p){return !isFinite(p[0])||!isFinite(p[1]);}))return shapeDxfFail('DXF contour contains an invalid coordinate.');
  for(i=0;i<points.length;i++)if(Math.hypot(points[(i+1)%points.length][0]-points[i][0],points[(i+1)%points.length][1]-points[i][1])<1e-8)return shapeDxfFail('DXF contour contains a zero-length edge.');
  if(fabPolySelfIntersects(points))return shapeDxfFail('DXF contour self-intersects.');
  if(Math.abs(fabSignedArea(points))<1e-8)return shapeDxfFail('DXF contour encloses no area.');
  var b=fabEdgeBounds(points),w=b.maxX-b.minX,h=b.maxY-b.minY,width16=Math.round(w*16),height16=Math.round(h*16);
  if(!(width16>0&&height16>0))return shapeDxfFail('DXF bounding Width and Height must be greater than zero.');
  var normalized=points.map(function(p){return [shapeDxfCoord(p[0]-b.minX),shapeDxfCoord(p[1]-b.minY)];});
  return {ok:true,preview:{units:'in',points:normalized,width16:width16,height16:height16},exactWidth:w,exactHeight:h};
}
function normalizeShapeDef(s){
  s=shapePlainObject(s);var type=s.type==null||s.type===''?'smart':String(s.type),defaults=shapeDefaultParams(type),params=shapePlainObject(s.params),edgeOps=shapePlainObject(s.edgeOps),ops={};
  Object.keys(defaults).forEach(function(k){if(params[k]==null)params[k]=defaults[k];else params[k]=shapeTextValue(params[k]);});
  Object.keys(edgeOps).forEach(function(id){var list=Array.isArray(edgeOps[id])?edgeOps[id]:[],clean=list.map(shapeNormalizeOp).filter(Boolean);if(clean.length)ops[id]=clean;});
  var source=shapeNormalizeSource(s.source),out={
    id:shapeTextValue(s.id,shapeNewEntityId('s')),name:shapeTextValue(s.name,''),type:type,
    w:shapeTextValue(s.w,type==='circle'?'36':'48'),h:shapeTextValue(s.h,type==='circle'?(s.w||'36'):'36'),
    thickness:shapeTextValue(s.thickness,'6'),params:params,polygon:shapeNormalizePolygon(s.polygon),
    /* Safety Border: базовое значение (пусто = AUTO по толщине) плюс ручной
       ввод по конкретным кромкам, как обработка в Edge Set. */
    safetyBorder:shapeTextValue(s.safetyBorder,''),
    safetyBorderEdges:shapeNormalizeBorderEdges(s.safetyBorderEdges),
    smart:ssNormalize(s.smart||{}),features:(Array.isArray(s.features)?s.features:[]).map(shapeNormalizeFeature),edgeOps:ops,
    manufacturingItems:shapeNormalizeManufacturingItems(s.manufacturingItems),
    source:source,schemaVersion:2,revision:Math.max(0,Math.floor(+s.revision||0)),status:s.status==='released'?'released':'draft'
  };
  if(source.kind==='dxf'&&source.preview.width16>0&&source.preview.height16>0){out.w=frac64(source.preview.width16/16);out.h=frac64(source.preview.height16/16);}
  else if(type==='circle'&&s.h==null)out.h=out.w;
  return out;
}
function newShapeDef(type){
  /* Smart-Shape открывается нейтральным шаблоном 1×1, без сохранённого примера
     геометрии: реальные размеры приходят из заказа, а не из заготовки в коде.
     У остальных пресетов размер связан с их собственными параметрами (глубина
     выреза, апекс и т.д.), поэтому им 1×1 не навязываем — иначе шаблон родится
     невалидным. */
  type=shapeType(type||'smart');
  var W=type==='smart'?'1':(type==='circle'?'36':'48'),H=type==='smart'?'1':(type==='circle'?'36':'36');
  var out=normalizeShapeDef({id:shapeNewEntityId('s'),name:'',type:type,w:W,h:H,params:shapeDefaultParams(type),smart:defaultSmartModel(),features:[],edgeOps:{}});
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
