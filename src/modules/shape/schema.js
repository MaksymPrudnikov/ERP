/* =====================================================================
   shape/schema · schema-v2
   Нормализация определения Shape. Старый Smart-Shape остаётся совместимым.
   ===================================================================== */

var SHAPE_EDGE_OPS=['Rough Arris','Flat Polish','CNC Shape Polish','Mitering','Beveling'];
var SHAPE_FEATURE_TYPES=['hole','cutout','radius','hardware','stamp','sandblast'];
/* A stamp is a free annotation on the production drawing. The selected text is
   intentionally short: it must remain readable inside the glass contour. Keep
   accepting older/custom text so saved revisions never lose their marking. */
var SHAPE_STAMP_TYPES=['Temp Stamp','HS Stamp','Lami Stamp','OWN Stamp'];
function shapeStampType(f){
  f=shapePlainObject(f);var explicit=shapeTextValue(f.stampType,''),text=shapeTextValue(f.text,'');
  if(SHAPE_STAMP_TYPES.indexOf(explicit)>=0)return explicit;
  return SHAPE_STAMP_TYPES.indexOf(text)>=0?text:(text?'OWN Stamp':SHAPE_STAMP_TYPES[0]);
}
function shapeStampText(f){
  var type=shapeStampType(f),text=shapeTextValue(shapePlainObject(f).text,'');
  return type==='OWN Stamp'?(text||'OWN Stamp'):type;
}
var SHAPE_SANDBLAST_COVERAGES=['full','pattern'],SHAPE_SANDBLAST_SIDES=['front','back'];
function shapeSandblastCoverage(f){return shapePlainObject(f).coverage==='pattern'?'pattern':'full';}
function shapeSandblastSide(f){return shapePlainObject(f).side==='back'?'back':'front';}
function shapeSandblastServiceLabel(f){return 'Sandblast · '+(shapeSandblastCoverage(f)==='pattern'?'Pattern':'Full covered')+' · '+(shapeSandblastSide(f)==='back'?'Back':'Front');}
function shapeSandblastText(f){return shapeSandblastServiceLabel(f).toUpperCase();}
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
  if(type==='stamp'){
    var stampType=shapeStampType(f),stampText=stampType==='OWN Stamp'?shapeTextValue(f.text,''):stampType;
    Object.assign(out,{x:shapeTextValue(f.x,'3'),y:shapeTextValue(f.y,'1'),stampType:stampType,text:stampText});
  }
  if(type==='sandblast')Object.assign(out,{x:shapeTextValue(f.x,'3'),y:shapeTextValue(f.y,'1'),coverage:shapeSandblastCoverage(f),side:shapeSandblastSide(f)});
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
/* Вид метки — ОТКРЫТЫЙ список. Справочник фурнитуры живёт в базе, а не
   в коде: владелец добавляет пивоты и прочее сам, без правки кода.
   Закрытый список здесь означал бы тихую потерю данных: старая нормализация
   отдавала 'hole' на любой незнакомый тип, и патч на кромке при первой же
   загрузке становился бы отверстием в нулевой точке. Здесь остались заводские
   виды только как заготовка для пустого справочника; проверка идёт по формату кода. */
const SHAPE_MANUFACTURING_ITEM_TYPES=['clamp','hinge','patch','hole'];
const SHAPE_MI_TYPE_RE=/^[a-z][a-z0-9_-]{0,23}$/;
function shapeManufacturingItemType(v){var t=shapeTextValue(v,'').trim().toLowerCase();return SHAPE_MI_TYPE_RE.test(t)?t:'hole';}
function shapeHoleCount(item){var n=item&&+item.count;return n===2||n===3?n:1;}
function shapeHoleAxis(item){return item&&item.axis==='vertical'?'vertical':'horizontal';}
function shapeHoleSpacing(item){var p=fabParseDimStrict(item&&item.spacing);return p.ok?Math.round(p.v*16)/16:NaN;}
function shapeHoleTripleVSpacing(item){var p=fabParseDimStrict(item&&item.verticalSpacing);return p.ok?Math.round(p.v*16)/16:NaN;}
function shapeHoleTripleHSpacing(item){var p=fabParseDimStrict(item&&item.horizontalSpacing);return p.ok?Math.round(p.v*16)/16:NaN;}
function shapeHoleTripleDirection(item){return item&&item.horizontalDirection==='left'?'left':'right';}
function shapeHoleCenters(item){
  var x=+item.x||0,y=+item.y||0,count=shapeHoleCount(item),out=[[x,y]];if(count===1)return out;
  if(count===2){var spacing=shapeHoleSpacing(item);if(!isFinite(spacing))spacing=0;out.push(shapeHoleAxis(item)==='vertical'?[x,y+spacing]:[x+spacing,y]);return out;}
  var vs=shapeHoleTripleVSpacing(item),hs=shapeHoleTripleHSpacing(item);if(!isFinite(vs))vs=0;if(!isFinite(hs))hs=0;
  out.push([x,y+vs]);out.push([x+(shapeHoleTripleDirection(item)==='left'?-hs:hs),y+vs]);return out;
}
function shapeHoleOperation(item){var count=shapeHoleCount(item);return count>1?'Drill Hole × '+count:'Drill Hole';}
function shapeHoleRequirementParams(item,diameter){
  var count=shapeHoleCount(item),out={diameter:diameter,count:count,centers:shapeHoleCenters(item)};
  if(count===2){out.spacing=shapeHoleSpacing(item);out.axis=shapeHoleAxis(item);}
  else if(count===3){out.verticalSpacing=shapeHoleTripleVSpacing(item);out.horizontalSpacing=shapeHoleTripleHSpacing(item);out.horizontalDirection=shapeHoleTripleDirection(item);}
  return out;
}
/* Отверстие задаётся точкой внутри стекла, вся остальная фурнитура —
   кромкой и расстоянием до её центра. Правило одно — и место у него одно. */
function shapeMiIsEdgeBound(item){return !!item&&shapeManufacturingItemType(item.type)!=='hole';}
function shapeNormalizeManufacturingItem(raw){
  raw=shapePlainObject(raw);var type=shapeManufacturingItemType(raw.type);
  var out={id:shapeTextValue(raw.id,shapeNewEntityId('mi-')),type:type,note:shapeTextValue(raw.note,'')};
  if(type==='hole'){
    var x=shapeDxfCoord(raw.x),y=shapeDxfCoord(raw.y);if(!isFinite(x))x=0;if(!isFinite(y))y=0;
    out.x=Math.round(x*16)/16;out.y=Math.round(y*16)/16;out.diameter=shapeTextValue(raw.diameter,'1/2');
    out.hRef=raw.hRef==='right'?'right':'left';out.vRef=raw.vRef==='top'?'top':'bottom';
    var count=shapeHoleCount(raw);
    if(count===2){var spacing=shapeHoleSpacing(raw);out.count=2;out.spacing=isFinite(spacing)&&spacing>0?spacing:2;out.axis=shapeHoleAxis(raw);}
    else if(count===3){var vs=shapeHoleTripleVSpacing(raw),hs=shapeHoleTripleHSpacing(raw);out.count=3;out.verticalSpacing=isFinite(vs)&&vs>0?vs:2;out.horizontalSpacing=isFinite(hs)&&hs>0?hs:2;out.horizontalDirection=shapeHoleTripleDirection(raw);}
  }else{
    var edges=['left','right','bottom','top'],edge=edges.indexOf(raw.edge)>=0?raw.edge:'left',distance=shapeDxfCoord(raw.distance);
    if(!isFinite(distance)||distance<0)distance=0;out.edge=edge;out.distance=Math.round(distance*16)/16;
    /* Модель фурнитуры: id справочника и ИМЯ снимком. Имя не украшение —
       по нему человек в цеху находит свой шаблон, а справочник могли
       переименовать уже после того, как заказ приняли. Пустой id при
       заполненном имени = «своя модель», вписанная руками.
       Оба поля пишутся ТОЛЬКО когда заполнены: отпечаток ревизии считается
       по JSON меток, и пустые ключи сдвинули бы его у всех старых фигур —
       привязанная раскладка Muntin решила бы, что геометрия изменилась. */
    var modelId=shapeTextValue(raw.modelId,'').trim().slice(0,64),model=shapeTextValue(raw.model,'').trim().slice(0,60);
    if(modelId)out.modelId=modelId;
    if(model)out.model=model;
  }
  return out;
}
/* ---------- Оформление размерных цепочек ----------
   Как размер ПОКАЗАН на чертеже: от какого края меряем, отодвинут ли он от
   детали, показан ли вообще. Это не геометрия и не производственный факт,
   поэтому оно живёт отдельной картой `dims` на уровне фигуры, а не внутри
   элемента, и НЕ входит в отпечаток ревизии (см. shapeFingerprint): решение
   «этот размер мешает, убери его с листа» не должно выглядеть как новая
   геометрия и поднимать тревогу у привязанной раскладки Muntin.

   Ключи осей: `h` — горизонтальная цепочка, `v` — вертикальная, `e` — цепочка
   вдоль кромки (у фурнитуры она одна, и её направление зависит от выбранной
   кромки, поэтому осью h/v её называть нельзя). `c` — C-C у Double, `cv` и
   `ch` — вертикальный и горизонтальный C-C у Triple.

   `ref` — от какого конца меряем. У отверстия эту роль играют его собственные
   `hRef`/`vRef`: они там были с самого начала и переносить их сюда значило бы
   тронуть отпечатки всех сохранённых фигур. */
const SHAPE_DIM_AXES=['h','v','e','c','cv','ch'];
const SHAPE_DIM_OFF_MIN=-4,SHAPE_DIM_OFF_MAX=12;
function shapeNormalizeDims(raw){
  var out={};
  if(raw&&typeof raw==='object')Object.keys(raw).forEach(function(id){
    var src=shapePlainObject(raw[id]),entry={};
    SHAPE_DIM_AXES.forEach(function(axis){
      var a=shapePlainObject(src[axis]),rec={};
      if(a.hide===true)rec.hide=true;
      var off=Math.round(+a.off||0);
      if(off)rec.off=Math.max(SHAPE_DIM_OFF_MIN,Math.min(SHAPE_DIM_OFF_MAX,off));
      var ref=shapeTextValue(a.ref,'').trim();
      if(ref)rec.ref=ref.slice(0,8);
      if(Object.keys(rec).length)entry[axis]=rec;
    });
    if(Object.keys(entry).length)out[String(id)]=entry;
  });
  return out;
}
function shapeDimRec(def,id,axis){
  var all=(def&&def.dims)||{},entry=all[String(id)]||{};
  return entry[axis]||{};
}
function shapeDimHidden(def,id,axis){return shapeDimRec(def,id,axis).hide===true;}
function shapeDimOffset(def,id,axis){return Math.round(+shapeDimRec(def,id,axis).off||0);}
function shapeDimRef(def,id,axis,fallback){var r=shapeDimRec(def,id,axis).ref;return r||fallback||'';}
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
/* Отступ лайта задаётся по кромкам той же строкой, что и Width/Height, и
   читается тем же строгим парсером. Обработка лайта перекрывает общую. */
function shapeNormalizeLiteSpecs(raw){
  var out={};
  if(raw&&typeof raw==='object')Object.keys(raw).forEach(function(key){
    if(!/^\d+$/.test(String(key)))return;
    var spec=raw[key]&&typeof raw[key]==='object'?raw[key]:{},inset={},ops={};
    var rawInset=spec.inset&&typeof spec.inset==='object'?spec.inset:{};
    Object.keys(rawInset).forEach(function(id){
      var t=String(rawInset[id]==null?'':rawInset[id]).trim();
      if(t)inset[String(id)]=t;
    });
    var rawOps=spec.edgeOps&&typeof spec.edgeOps==='object'?spec.edgeOps:{};
    Object.keys(rawOps).forEach(function(id){
      var list=(Array.isArray(rawOps[id])?rawOps[id]:[]).map(shapeNormalizeOp).filter(Boolean);
      if(list.length)ops[String(id)]=list;
    });
    /* Зеркало: то же стекло, перевёрнутое. Нужно, когда Low-E оказывается на
       поверхности №2 — фигура та же, но её надо показать зеркально. */
    var mirror=spec.mirror===true;
    if(mirror||Object.keys(inset).length||Object.keys(ops).length)out[String(key)]={inset:inset,edgeOps:ops,mirror:mirror};
  });
  return out;
}
function shapeLiteSpec(def,liteIndex){var l=(def&&def.lites)||{};return l[String(liteIndex)]||{inset:{},edgeOps:{},mirror:false};}
function shapeLiteMirrored(def,liteIndex){return !!shapeLiteSpec(def,liteIndex).mirror;}
function shapeLiteInsetFor(def,liteIndex,edgeId){
  var spec=shapeLiteSpec(def,liteIndex),raw=spec.inset[String(edgeId)];
  if(raw==null||raw==='')return 0;
  var p=fabParseDimStrict(raw);
  return p.ok&&p.v>0?p.v:0;
}
function normalizeShapeDef(s){
  s=shapePlainObject(s);var type=s.type==null||s.type===''?'smart':String(s.type),defaults=shapeDefaultParams(type),rawParams=shapePlainObject(s.params),params=Object.assign({},rawParams),edgeOps=shapePlainObject(s.edgeOps),ops={};
  var normalizedW=shapeTextValue(s.w,type==='circle'?'36':'48'),normalizedH=shapeTextValue(s.h,type==='circle'?(s.w||'36'):'36');
  /* Raked Rectangle used to store two top drops.  Convert that legacy pair to
     the new long/short-height vocabulary once, while retaining the same top
     contour and avoiding stale legacy fields overriding later edits. */
  if(type==='raked'&&params.shortHeight==null&&(params.leftDrop!=null||params.rightDrop!=null)){
    var rh=fabParseDimStrict(normalizedH),rld=fabParseDimStrict(params.leftDrop),rrd=fabParseDimStrict(params.rightDrop);
    if(rh.ok&&rld.ok&&rrd.ok){var lh=rh.v-rld.v,rrh=rh.v-rrd.v;params.shortHeight=shapeParaDimText(Math.min(lh,rrh));params.rakeSide='top';params.shortSide=lh<=rrh?'left':'right';}
    delete params.leftDrop;delete params.rightDrop;
  }
  /* Polygon раньше означал свободный контур по точкам. Теперь это правильный
     многоугольник, а свободный контур — отдельный тип Custom Shape. Всё, что
     сохранено списком точек и без числа сторон, уезжает в Custom вместе со
     своими координатами: ни одна сохранённая форма не меняется.
     Сюда же приходят старые импорты DXF: они тоже сохранялись как polygon. */
  if(type==='polygon'&&rawParams.sides==null&&Array.isArray(s.polygon)&&s.polygon.length>=3){
    type='custom';defaults=shapeDefaultParams(type);
  }
  /* Треугольник хранил apexX — то же смещение вершины под старым именем.
     Переносим значение и убираем ключ, чтобы старое поле не спорило с новым. */
  if(type==='triangle'&&params.apexX!=null){
    if(params.topOffset==null)params.topOffset=shapeTextValue(params.apexX,'');
    delete params.apexX;
  }
  /* Legacy Parallelogram stored Width as its complete bounding box and `skew`
     as a single positive offset.  Convert to the physical-edge Width used by
     the measurement modes while keeping the old contour in exactly the same
     place (up to translation for a negative legacy skew). */
  if(type==='parallelogram'&&params.measureMode==null&&params.outOfSquare==null&&params.skew!=null){
    var oldSkew=fabParseDimStrict(params.skew),oldWidth=fabParseDimStrict(normalizedW),legacyDirection=oldSkew.ok&&oldSkew.v<0?'left':'right';
    params={measureMode:'height-oos',outOfSquare:oldSkew.ok?shapeParaDimText(Math.abs(oldSkew.v)):shapeTextValue(params.skew,''),diagonal:'',angle:'',slopeDirection:legacyDirection};
    if(oldSkew.ok&&oldWidth.ok&&oldWidth.v-oldSkew.v>0)normalizedW=shapeParaDimText(oldWidth.v-oldSkew.v);
  }
  Object.keys(defaults).forEach(function(k){if(params[k]==null)params[k]=defaults[k];else params[k]=shapeTextValue(params[k]);});
  Object.keys(edgeOps).forEach(function(id){var list=Array.isArray(edgeOps[id])?edgeOps[id]:[],clean=list.map(shapeNormalizeOp).filter(Boolean);if(clean.length)ops[id]=clean;});
  var source=shapeNormalizeSource(s.source),out={
    id:shapeTextValue(s.id,shapeNewEntityId('s')),name:shapeTextValue(s.name,''),type:type,
    w:normalizedW,h:normalizedH,
    thickness:shapeTextValue(s.thickness,'6'),params:params,polygon:shapeNormalizePolygon(s.polygon),
    /* Safety Border: базовое значение (пусто = AUTO по толщине) плюс ручной
       ввод по конкретным кромкам, как обработка в Edge Set. */
    safetyBorder:shapeTextValue(s.safetyBorder,''),
    safetyBorderEdges:shapeNormalizeBorderEdges(s.safetyBorderEdges),
    /* Форма, заведённая автоматически по Width × Height строки заказа,
       принадлежит этой строке: в библиотеке форм её не показывают и живёт она
       ровно столько, сколько живёт строка. */
    ownerLineId:shapeTextValue(s.ownerLineId,''),
    /* Раскладка по лайтам. Ступенчатый пакет: у первого стекла контур формы, а
       второе меньше на отступ — поэтому у лайта есть свой inset по кромкам и
       своя обработка. Пусто = лайт повторяет форму строки. */
    lites:shapeNormalizeLiteSpecs(s.lites),
    /* Оформление размеров на чертеже. В отпечаток ревизии не входит. */
    dims:shapeNormalizeDims(s.dims),
    smart:ssNormalize(s.smart||{}),features:(Array.isArray(s.features)?s.features:[]).map(shapeNormalizeFeature),edgeOps:ops,
    manufacturingItems:shapeNormalizeManufacturingItems(s.manufacturingItems),
    source:source,schemaVersion:2,revision:Math.max(0,Math.floor(+s.revision||0)),status:s.status==='released'?'released':'draft'
  };
  if(source.kind==='dxf'&&source.preview.width16>0&&source.preview.height16>0){out.w=frac64(source.preview.width16/16);out.h=frac64(source.preview.height16/16);}
  else if(type==='circle'&&s.h==null)out.h=out.w;
  if(type==='parallelogram'){
    out.params.measureMode=shapeParaMeasure(out.params.measureMode);out.params.slopeDirection=shapeParaDirection(out.params.slopeDirection);
    var para=shapeParallelogramValues(out.w,out.h,out.params);
    if(para.ok){
      /* Persist calculated companions so switching Measure mode preserves the
         visible shape.  Only the projection derived by Diagonal + Angle is
         allowed to replace a master Width/Height field. */
      if(para.mode==='diagonal-angle'){
        if(para.sideways)out.h=shapeParaDimText(para.height);else out.w=shapeParaDimText(para.width);
      }
      if(para.mode!=='height-oos')out.params.outOfSquare=shapeParaDimText(para.outOfSquare);
      if(para.mode!=='height-diagonal'&&para.mode!=='diagonal-angle')out.params.diagonal=shapeParaDimText(para.diagonal);
      if(para.mode!=='diagonal-angle'&&para.mode!=='height-angle')out.params.angle=shapeParaAngleText(para.angle);
    }
  }
  /* Тот же приём, что и у параллелограмма: посчитанный набор сохраняется рядом
     с введённым, поэтому смена Measure у треугольника не двигает контур. */
  if(type==='triangle'){
    out.params.measureMode=shapeTriMeasure(out.params.measureMode);
    var tri=shapeTriangleValues(out.w,out.h,out.params);
    if(tri.ok){
      if(tri.mode==='diagonal'){out.h=shapeParaDimText(tri.height);out.params.topOffset=shapeParaDimText(tri.topOffset);}
      else{out.params.leftEdge=shapeParaDimText(tri.leftEdge);out.params.rightEdge=shapeParaDimText(tri.rightEdge);}
    }
  }
  /* У Custom Shape габарит тоже не вводится: он следует за точками контура,
     поэтому Finished, Cut size и раскрой читают его из тех же координат. */
  if(type==='custom'){
    var cb=shapeCustomBounds(out.polygon);
    if(cb){out.w=shapeParaDimText(cb.width);out.h=shapeParaDimText(cb.height);}
  }
  /* У правильного многоугольника габарит целиком выводится из числа сторон и
     длины стороны. Записываем его в w/h: карточки Finished и Cut size, раскрой
     и печать читают габарит оттуда же, откуда у остальных фигур. */
  if(type==='polygon'){
    var poly=shapeRegularPolygonValues(out.params);
    if(poly.ok){out.w=shapeParaDimText(poly.width);out.h=shapeParaDimText(poly.height);}
  }
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
  if(type==='polygon'||type==='custom')out.polygon=shapeNormalizePolygon(null);return out;
}
function newSmartShapeDef(){return newShapeDef('smart');}
function newShapeFeature(type,context){
  var f=shapeNormalizeFeature({id:shapeNewEntityId('sf-'),type:type}),r=context&&context.edges&&context.edges[0];
  if(type==='radius'&&context&&context.vertices&&context.vertices[0])f.vertexId=context.vertices[0].id;
  if(type==='hardware'&&r)f.edgeId=r.id;
  return f;
}
function shapeParamSpecsFor(type){
  if(type==='parallelogram')return [];
  if(type==='raked')return [{key:'shortHeight',label:'Short Height'}];
  if(type==='triangle')return [];
  if(type==='polygon'||type==='custom')return [];
  var labels={skew:'Skew',leftDrop:'Left top drop',rightDrop:'Right top drop',apexX:'Apex X',tlx:'TL X',tly:'TL Y',trx:'TR X',try:'TR Y',brx:'BR X',bry:'BR Y',blx:'BL X',bly:'BL Y',depth:'Notch depth',height:'Notch height',fromBottom:'From bottom',width:'Notch width',fromLeft:'From left',depth1:'Depth 1',height1:'Height 1',gap:'Gap',depth2:'Depth 2',height2:'Height 2'};
  return Object.keys(shapeDefaultParams(type)).map(function(k){return {key:k,label:labels[k]||k};});
}
