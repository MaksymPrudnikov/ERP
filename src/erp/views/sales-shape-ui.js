/* =====================================================================
   view/sales/shape-ui · schema-v2
   Полный редактор finished geometry, features, edgework и cutting output.
   Геометрия и экспорт принадлежат modules/shape/*; экран только редактирует.
   ===================================================================== */

let sEdit=null,sDraft=null,sView='setup',sEdgeworkOpen=false,sFeaturesOpen=false,sFeatureExpandedId=null,sSourceOpen=false,sManufacturingOpen=true,sManufacturingPlace=null,sManufacturingSelected=null;

/* Формы, принадлежащие строкам заказа, в библиотеке не показываются: каждая
   вставленная строка заводит свой прямоугольник, и двести строк заказа сделали
   бы этот список нечитаемым. Открываются они из своей строки. */
function viewShapeSkill(){
  var rows=DB.shapeDef.map(function(s,i){return {s:s,i:i};}).filter(function(x){return !salesShapeIsLineOwned(x.s);}).map(function(x){
    var s=x.s,i=x.i;
    var r=ShapeModule.compute(s),p=shapePresetInfo(s.type),external=shapeIsDxfSource(s),featureCount=(s.features||[]).filter(function(f){return f.type!=='radius';}).length;
    var state=external?(r.sourceValid?'<span class="pill info">DXF · внешний файл</span>':'<span class="pill bad">'+esc(moduleErrorText(r))+'</span>'):(r.valid?'<span class="pill ok">готова к экспорту</span>':'<span class="pill bad">'+esc(moduleErrorText(r))+'</span>');
    return `<tr><td><div class='shape-name-line'><b>${raw(s.name)}</b>${external?'<span class="pill info shape-source-pill">DXF</span>':''}</div><small class='shape-row-meta'>${esc(p.code+' · '+p.label)} · Rev ${s.revision||0}</small></td><td class='mono'>${external?(r.sourceValid?dimIn16(r.width)+' × '+dimIn16(r.height):'<span class="bad pill">невалидна</span>'):(r.valid?dimIn16(r.width)+' × '+dimIn16(r.height):'<span class="bad pill">невалидна</span>')}</td><td class='mono'>${external?'—':(r.valid?r.edges.length:'—')}</td><td class='mono'>${external?'—':featureCount}</td><td>${state}</td><td class='shape-actions'><button class='sm' onclick='openShapeEdit(${i})'>Изменить</button><button class='sm dl' onclick='delShape(${i})'>×</button></td></tr>`;
  }).join('');
  var presetOptions=SHAPE_PRESETS.map(function(p){return `<option value='${esc(p.id)}'>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  return `${sEdit!==null?'':`<div class='real-module-note'><b>Shape schema v2</b><span>Finished Geometry, Production Drawing и Cutting Geometry формируются из одной ревизии. Для DXF из Fusion 360 ERP хранит метаданные, лёгкий 2D-контур превью и габариты; исходное содержимое DXF в localStorage не сохраняется.</span></div>`}
    ${sEdit!==null?shapeForm():''}
    <table><thead><tr><th>Название / тип</th><th>Габарит</th><th>Кромок</th><th>Features</th><th>Статус</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">пусто</td></tr>'}</tbody></table>
    ${sEdit===null?`<div class='shape-new-row'><select id='s_new_type'>${presetOptions}</select><button class='pri' onclick='openShapeNew(document.getElementById("s_new_type").value)'>Новая фигура</button></div>`:''}`;
}

function openShapeNew(type){sEdit='new';sView='setup';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;sFeatureExpandedId=null;sSourceOpen=false;sManufacturingOpen=true;sManufacturingPlace=null;sManufacturingSelected=null;sDraft=newShapeDef(type||'smart');sDraft.name=shapePresetInfo(sDraft.type).label;render();}
function openShapeEdit(i){sEdit=i;sView='setup';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;sFeatureExpandedId=null;sSourceOpen=false;sManufacturingOpen=true;sManufacturingPlace=null;sManufacturingSelected=null;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(DB.shapeDef[i])));render();}
function shapeFileSizeText(bytes){
  var n=Math.max(0,+bytes||0);if(n<1024)return Math.round(n)+' B';if(n<1024*1024)return (n/1024).toFixed(n<10240?1:0)+' KB';return (n/(1024*1024)).toFixed(1)+' MB';
}
function shapeAttachDxf(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  if(!/\.dxf$/i.test(String(file.name||''))){alert('Choose a DXF file.');input.value='';return;}
  if(!(file.size>0)){alert('DXF file is empty.');input.value='';return;}
  var reader=new FileReader();
  reader.onerror=function(){input.value='';alert('DXF file could not be read.');};
  reader.onload=function(){
    var parsed=shapeParseFusionDxf(String(reader.result||''));
    if(!parsed.ok){input.value='';alert(parsed.error||'DXF file could not be parsed.');return;}
    var note=sDraft&&sDraft.source?String(sDraft.source.note||''):'';
    sDraft.source={kind:'dxf',fileName:String(file.name),fileSize:Math.floor(file.size),uploadedAt:new Date().toISOString(),note:note,preview:parsed.preview};
    sDraft.w=frac64(parsed.preview.width16/16);sDraft.h=frac64(parsed.preview.height16/16);sView='production';sSourceOpen=false;render();
  };
  reader.readAsText(file);
}
function removeShapeDxf(){sDraft.source=shapeNormalizeSource(null);sView='setup';sSourceOpen=true;render();}
function setShapeSourceNote(v){if(!sDraft.source)sDraft.source=shapeNormalizeSource(null);sDraft.source.note=String(v==null?'':v);}
function toggleShapeSource(){sSourceOpen=!sSourceOpen;render();}
function shapeSourceEditor(){
  sDraft.source=shapeNormalizeSource(sDraft.source);var source=sDraft.source,external=source.kind==='dxf',valid=external&&shapeValidateSource(sDraft).errors.length===0;
  var state=external?(valid?'DXF · '+shapeFileSizeText(source.fileSize):'DXF · ошибка'):'геометрия конфигуратора';
  var body=external?`<div class='shape-source-box dxf'><div class='shape-source-head'><div><b>DXF из Fusion 360</b><small>Исходный DXF не сохраняется в ERP. Для повторного открытия хранятся имя файла, точный производный 2D-контур и габариты, округлённые до 1/16 дюйма.</small></div><span class='pill ${valid?'info':'bad'}'>${valid?'внешний раскрой':'ошибка файла'}</span></div><div class='shape-file-meta'><b class='shape-dxf-name'>${raw(source.fileName)}</b><span data-raw>${esc(shapeFileSizeText(source.fileSize))}</span><span data-raw>${esc(source.uploadedAt||'—')}</span></div><label>Примечание к DXF<input data-raw value='${esc(source.note)}' oninput='setShapeSourceNote(this.value)'></label><div class='row'><label class='shape-file-pick'><input id='shape_dxf_file' type='file' accept='.dxf,application/dxf' onchange='shapeAttachDxf(this)'><span>Заменить DXF</span></label><button type='button' onclick='removeShapeDxf()'>Убрать файл</button></div></div>`:
    `<div class='shape-source-box'><div><b>Источник раскроя</b><small>По умолчанию Production Shape использует геометрию конфигуратора. DXF из Fusion 360 можно прикрепить как внешний файл раскроя.</small></div><label class='shape-file-pick'><input id='shape_dxf_file' type='file' accept='.dxf,application/dxf' onchange='shapeAttachDxf(this)'><span>Загрузить DXF из Fusion 360</span></label></div>`;
  return `<div class='shape-subsection shape-accordion shape-source-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeSource()'><span><b>Cutting source</b><small>Configurator geometry или внешний DXF из Fusion 360</small></span><span class='shape-accordion-state'>${external?`<span class='shape-dxf-name'>${raw(source.fileName)}</span>`:esc(state)}<i>${sSourceOpen?'−':'+'}</i></span></button>${sSourceOpen?`<div class='shape-accordion-body'>${body}</div>`:''}</div>`;
}
function shapeDraftLine(){return shapeDefToLine(sDraft);}
function shapeDraftGeometry(){try{return shapeGeometry(shapeDraftLine());}catch(e){return {ok:false,error:e.message,points:[],edges:[],vertices:[]};}}
function shapeDraftResult(){try{return ShapeModule.compute(sDraft);}catch(e){return {valid:false,reason:e.message,errors:[e.message]};}}
function setShapeField(k,v){sDraft[k]=v;if(sDraft.type==='circle'&&(k==='w'||k==='h')){sDraft.w=v;sDraft.h=v;}refreshShapeEditor();}
function setShapeParam(k,v){sDraft.params[k]=v;refreshShapeEditor();}
function setShapeC(v){var S=shapeDraftLine();S.shape.smart.C.len=v;sDraft.smart=S.shape.smart;refreshShapeEditor();}
function setShapeElbows(v){sDraft.smart.elbowsOn=!!v;render();}
function setShapeSimple(edge,k,v){sDraft.smart[edge][k]=v||null;refreshShapeEditor();}
function setShapeElbow(edge,k,v){sDraft.smart[edge].elbow[k]=v||null;refreshShapeEditor();}
function setShapeCorner(c,v){var S=shapeDraftLine();S.shape.smart.corners[c]=v;ssSyncExtra(S);sDraft.smart=S.shape.smart;render();}
function setShapeCornerOffset(c,k,v){sDraft.smart.cornerOffsets[c][k]=v||(k.indexOf('Dir')>=0?null:'');refreshShapeEditor();}
function setShapeExtra(id,v){if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};sDraft.smart.extraEdges[id].len=v;refreshShapeEditor();}
/* Скос ребра нотча: out — величина ухода, dir — направление. */
function setShapeExtraOut(id,k,v){
  if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};
  sDraft.smart.extraEdges[id][k]=(k==='dir')?(v||null):v;
  refreshShapeEditor();
}
function setShapeView(v){if(shapeIsDxfSource(sDraft)){if(v!=='production'&&v!=='cutting')return;sView=v;refreshShapeEditor();return;}sView=v;refreshShapeEditor();}
function toggleShapeSection(section){if(section==='edgework')sEdgeworkOpen=!sEdgeworkOpen;if(section==='features')sFeaturesOpen=!sFeaturesOpen;if(section==='manufacturing')sManufacturingOpen=!sManufacturingOpen;render();}
function toggleShapeFeatureCard(id){sFeatureExpandedId=sFeatureExpandedId===id?null:id;render();}

function setShapeType(type){
  type=shapeType(type);if(type===sDraft.type)return;
  var linked=Object.keys(sDraft.edgeOps||{}).length||(sDraft.features||[]).some(function(f){return f.type==='radius'||f.type==='hardware';});
  if(linked&&!confirm('Changing the shape type will remove topology-bound radii, hardware prep and edgework. Continue?')){render();return;}
  sDraft.type=type;sDraft.params=shapeDefaultParams(type);sDraft.edgeOps={};sDraft.features=(sDraft.features||[]).filter(function(f){return f.type!=='radius'&&f.type!=='hardware';});
  if(type==='polygon')sDraft.polygon=shapeNormalizePolygon(null);
  if(type==='circle')sDraft.h=sDraft.w;
  render();
}

/* ---------- Manufacturing items / derived Services ----------
   One click in the editor creates one production mark. The mark belongs to the
   Shape revision and is visible on the Production Drawing, but it never changes
   the DXF/cutting contour. Commercial Services are calculated from the marks. */
function shapeManufacturingItems(){if(!sDraft.manufacturingItems)sDraft.manufacturingItems=[];return sDraft.manufacturingItems;}
function shapeManufacturingItemTitle(type){return type==='clamp'?'Clamp':type==='hinge'?'Hinge':type==='hole'?'Hole':type;}
function shapeManufacturingShort(type){return type==='clamp'?'CLMP':type==='hinge'?'HNG':type==='hole'?'HOLE':String(type||'').toUpperCase();}
function shapeSnapManufacturing16(v){var n=+v;return isFinite(n)?Math.round(n*16)/16:NaN;}
function shapeFrac16(v){
  var n=shapeSnapManufacturing16(v);if(!isFinite(n))return '';var sign=n<0?'-':'';n=Math.abs(n);var whole=Math.floor(n+1e-9),num=Math.round((n-whole)*16);if(num===16){whole++;num=0;}if(!num)return sign+String(whole);var a=num,b=16;while(b){var t=a%b;a=b;b=t;}num/=a;var den=16/a;return sign+(whole?whole+' ':'')+num+'/'+den;
}
function shapeDim16(v){return shapeFrac16(v)+'″';}
function shapeManufacturingGeometry(){
  if(shapeIsDxfSource(sDraft)){var source=shapeNormalizeSource(sDraft.source),P=source.preview.points||[];if(P.length<3)return null;return {P:P,b:fabEdgeBounds(P)};}
  var r=shapeDraftResult();if(!r||!r.valid||!(r.points||[]).length)return null;return {P:r.points,b:fabEdgeBounds(r.points)};
}
function shapeManufacturingRelative(item){var g=shapeManufacturingGeometry();if(!g||item.type!=='hole')return {x:0,y:0};return {x:shapeSnapManufacturing16(item.x-g.b.minX),y:shapeSnapManufacturing16(item.y-g.b.minY)};}
function shapeManufacturingHolePosition(item,g){
  g=g||shapeManufacturingGeometry();if(!g||!item||item.type!=='hole')return null;
  var hRef=item.hRef==='right'?'right':'left',vRef=item.vRef==='top'?'top':'bottom';
  var left=shapeSnapManufacturing16(item.x-g.b.minX),right=shapeSnapManufacturing16(g.b.maxX-item.x),bottom=shapeSnapManufacturing16(item.y-g.b.minY),top=shapeSnapManufacturing16(g.b.maxY-item.y);
  return {hRef:hRef,vRef:vRef,hDistance:hRef==='right'?right:left,vDistance:vRef==='top'?top:bottom,left:left,right:right,bottom:bottom,top:top};
}
function shapeSetManufacturingHoleReference(id,axis,ref){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type!=='hole')return;
  if(axis==='h'&&(ref==='left'||ref==='right'))item.hRef=ref;
  if(axis==='v'&&(ref==='bottom'||ref==='top'))item.vRef=ref;
  render();
}
function shapeSetManufacturingHoleDistance(id,axis,v){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type!=='hole')return;
  var parsed=fabParseDimStrict(v),g=shapeManufacturingGeometry();if(!parsed.ok||!g){alert('Enter a valid hole position in inches.');render();return;}
  var d=shapeSnapManufacturing16(parsed.v);if(!isFinite(d)||d<0){alert('Hole position must be zero or greater.');render();return;}
  var x=item.x,y=item.y;
  if(axis==='h')x=(item.hRef==='right'?g.b.maxX-d:g.b.minX+d);
  else if(axis==='v')y=(item.vRef==='top'?g.b.maxY-d:g.b.minY+d);
  else return;
  x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  if(!fabPointInPoly([x,y],g.P)){alert('The hole center must stay inside the finished glass contour.');render();return;}
  item.x=x;item.y=y;render();
}
function shapeManufacturingEdgeLabel(edge){return edge==='left'?'Left':edge==='right'?'Right':edge==='top'?'Top':'Bottom';}
function shapeManufacturingEdgeOrigin(edge){return edge==='left'||edge==='right'?'от нижнего угла':'от левого угла';}
function shapeManufacturingEdgeDefs(g){
  if(!g||!Array.isArray(g.P)||g.P.length<3)return {};
  var segs=g.P.map(function(a,i){var b=g.P[(i+1)%g.P.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);return {a:a,b:b,dx:dx,dy:dy,len:len,mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2,h:Math.abs(dx)>=Math.abs(dy)};}).filter(function(e){return e.len>1e-9;});
  var hs=segs.filter(function(e){return e.h;}),vs=segs.filter(function(e){return !e.h;});if(!hs.length)hs=segs.slice();if(!vs.length)vs=segs.slice();
  function pick(arr,key,dir){return arr.reduce(function(best,e){return !best||(dir<0?e[key]<best[key]:e[key]>best[key])?e:best;},null);}
  function orient(seg,edge){if(!seg)return null;var a=seg.a,b=seg.b;if(edge==='top'||edge==='bottom'){if(a[0]>b[0]){var t=a;a=b;b=t;}}else if(a[1]>b[1]){var q=a;a=b;b=q;}return {edge:edge,start:a,end:b,len:Math.hypot(b[0]-a[0],b[1]-a[1])};}
  return {left:orient(pick(vs,'mx',-1),'left'),right:orient(pick(vs,'mx',1),'right'),bottom:orient(pick(hs,'my',-1),'bottom'),top:orient(pick(hs,'my',1),'top')};
}
function shapeManufacturingEdgeDef(edge,g){return shapeManufacturingEdgeDefs(g)[edge]||null;}
function shapeManufacturingEdgePoint(item,g){var e=shapeManufacturingEdgeDef(item.edge,g);if(!e||!e.len)return null;var d=Math.max(0,Math.min(e.len,shapeSnapManufacturing16(item.distance||0))),t=d/e.len;return {x:e.start[0]+(e.end[0]-e.start[0])*t,y:e.start[1]+(e.end[1]-e.start[1])*t,edge:e,distance:d};}
function shapeNearestManufacturingEdge(x,y,g){
  var defs=shapeManufacturingEdgeDefs(g),best=null;['left','right','bottom','top'].forEach(function(k){var e=defs[k];if(!e||!e.len)return;var dx=e.end[0]-e.start[0],dy=e.end[1]-e.start[1],t=((x-e.start[0])*dx+(y-e.start[1])*dy)/(e.len*e.len);t=Math.max(0,Math.min(1,t));var px=e.start[0]+dx*t,py=e.start[1]+dy*t,dist=Math.hypot(x-px,y-py);if(!best||dist<best.error)best={edge:k,distance:shapeSnapManufacturing16(t*e.len),x:px,y:py,error:dist};});return best;
}
function shapeSetManufacturingCoord(id,k,v){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type!=='hole')return;var parsed=fabParseDimStrict(v),g=shapeManufacturingGeometry();if(!parsed.ok||!g){alert('Enter a valid position in inches.');render();return;}
  var rel=shapeSnapManufacturing16(parsed.v);if(!isFinite(rel)||rel<0){alert('Hole coordinates must be zero or greater.');render();return;}
  var x=k==='x'?g.b.minX+rel:item.x,y=k==='y'?g.b.minY+rel:item.y;x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  if(!fabPointInPoly([x,y],g.P)){alert('The X/Y position must place the hole inside the finished glass contour.');render();return;}
  item[k]=k==='x'?x:y;render();
}
function shapeSetManufacturingEdge(id,edge){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type==='hole')return;var g=shapeManufacturingGeometry(),e=shapeManufacturingEdgeDef(edge,g);if(!e){alert('The selected glass edge is not available.');render();return;}item.edge=edge;if((+item.distance||0)>e.len)item.distance=shapeSnapManufacturing16(e.len);render();
}
function shapeSetManufacturingDistance(id,v){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type==='hole')return;var parsed=fabParseDimStrict(v),g=shapeManufacturingGeometry(),e=shapeManufacturingEdgeDef(item.edge,g);if(!parsed.ok||!e){alert('Enter a valid distance in inches.');render();return;}var d=shapeSnapManufacturing16(parsed.v);if(!isFinite(d)||d<0||d>e.len+1e-9){alert('The distance must stay on the selected glass edge.');render();return;}item.distance=d;render();
}
function shapeStartManufacturingPlacement(type){
  if(SHAPE_MANUFACTURING_ITEM_TYPES.indexOf(type)<0)return;
  var r=shapeDraftResult();
  if(!shapeIsDxfSource(sDraft)&&!r.valid){alert('Fix the Shape geometry before placing a manufacturing item.');return;}
  sManufacturingOpen=true;sManufacturingPlace={type:type,diameter:type==='hole'?'3/4':''};sManufacturingSelected=null;sView='production';render();
}
function shapeCancelManufacturingPlacement(){sManufacturingPlace=null;render();}
function shapeMoveManufacturingItem(id){var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item)return;sManufacturingPlace={type:item.type,diameter:item.diameter||'',moveId:id};sManufacturingSelected=id;render();}
function shapeRemoveManufacturingItem(id){sDraft.manufacturingItems=shapeManufacturingItems().filter(function(x){return x.id!==id;});if(sManufacturingSelected===id)sManufacturingSelected=null;if(sManufacturingPlace&&sManufacturingPlace.moveId===id)sManufacturingPlace=null;render();}
function shapeSetManufacturingField(id,k,v){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item)return;
  if(k==='diameter'){var d=fabParseDimStrict(v);item.diameter=String(v);var el=document.getElementById('mi_d_'+id);if(el)el.classList.toggle('bad',!(d.ok&&d.v>=0.5));}
  else item[k]=String(v==null?'':v);
  refreshShapeEditor();
}
function shapeDxfPreviewTransform(source){
  source=shapeNormalizeSource(source);var P=source.preview.points||[];if(P.length<3)return null;
  var b=fabEdgeBounds(P),W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),vw=760,vh=390,padL=88,padR=88,padT=62,padB=72;
  var sc=Math.min((vw-padL-padR)/W,(vh-padT-padB)/H),dw=W*sc,dh=H*sc,x0=padL+(vw-padL-padR-dw)/2,y0=padT+(vh-padT-padB-dh)/2;
  return {P:P,b:b,W:W,H:H,vw:vw,vh:vh,sc:sc,dw:dw,dh:dh,x0:x0,y0:y0,X:function(x){return x0+(x-b.minX)*sc;},Y:function(y){return y0+dh-(y-b.minY)*sc;}};
}
function shapeDrawnPreviewTransform(result){
  if(!result||!result.valid||!(result.points||[]).length)return null;
  var pT=shapeAnnNeedsOverhead(result)?210:150,pB=170,pL=170,pR=190,pb=fabEdgeBounds(result.points),pw=Math.max(.001,pb.maxX-pb.minX),ph=Math.max(.001,pb.maxY-pb.minY),ar=pw/ph,LONG=660,SHORT=260;
  var aw=ar>=1?LONG:Math.max(SHORT,LONG*ar),ah=ar>=1?Math.max(SHORT,LONG/ar):LONG;
  var F=shapeDrawingFrame(result.points,{vw:Math.round(aw+pL+pR),vh:Math.round(ah+pT+pB),pL:pL,pR:pR,pT:pT,pB:pB});
  F.P=result.points;return F;
}
function shapePlaceManufacturingFromEvent(ev,svg){
  if(!sManufacturingPlace)return;
  var external=shapeIsDxfSource(sDraft),r=shapeDraftResult(),T=external?shapeDxfPreviewTransform(sDraft.source):shapeDrawnPreviewTransform(r);if(!T)return;
  var rect=svg.getBoundingClientRect(),vx=(ev.clientX-rect.left)*T.vw/Math.max(1,rect.width),vy=(ev.clientY-rect.top)*T.vh/Math.max(1,rect.height);
  var x=T.b.minX+(vx-T.x0)/T.sc,y=T.b.minY+(T.y0+T.dh-vy)/T.sc,g={P:T.P,b:T.b};x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  var type=sManufacturingPlace.type,data={};
  if(type==='hole'){
    if(!fabPointInPoly([x,y],T.P)){alert('Place the hole inside the glass contour.');return;}data.x=x;data.y=y;data.diameter=sManufacturingPlace.diameter||'3/4';
    data.hRef=x<=(T.b.minX+T.b.maxX)/2?'left':'right';data.vRef=y<=(T.b.minY+T.b.maxY)/2?'bottom':'top';
  }else{
    var snap=shapeNearestManufacturingEdge(x,y,g);if(!snap){alert('No valid glass edge is available for this item.');return;}data.edge=snap.edge;data.distance=snap.distance;
  }
  if(sManufacturingPlace.moveId){var moving=shapeManufacturingItems().find(function(v){return v.id===sManufacturingPlace.moveId;});if(moving){if(type==='hole'){moving.x=data.x;moving.y=data.y;}else{moving.edge=data.edge;moving.distance=data.distance;}}}
  else{var raw={id:shapeNewEntityId('mi-'),type:type,note:''};Object.keys(data).forEach(function(k){raw[k]=data[k];});var item=shapeNormalizeManufacturingItem(raw);shapeManufacturingItems().push(item);}
  sManufacturingSelected=null;sManufacturingPlace=null;render();
}
function shapeManufacturingMarkersSvg(source,T){
  var items=shapeManufacturingItems();if(!items.length)return '';var g={P:T.P,b:T.b},holes=items.filter(function(x){return x.type==='hole';});
  var defs=items.length?`<defs><marker id='shapeMiDimArrow' viewBox='0 0 8 8' refX='4' refY='4' markerWidth='5' markerHeight='5' orient='auto-start-reverse'><path d='M0,0 L8,4 L0,8 Z' fill='#d92d20'/></marker></defs>`:'';
  return defs+items.map(function(item,i){
    var pt=item.type==='hole'?{x:item.x,y:item.y}:shapeManufacturingEdgePoint(item,g);if(!pt)return '';var x=T.X(pt.x),y=T.Y(pt.y),selected=item.id===sManufacturingSelected?' selected':'',code=shapeManufacturingShort(item.type),num=i+1,label=code+' '+num;
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),dia=d.ok&&d.v>0?d.v:.75,r=Math.max(4,Math.min(14,dia*T.sc/2)),pos=shapeManufacturingHolePosition(item,g);if(!pos)return '';
      var hRefX=T.X(pos.hRef==='right'?g.b.maxX:g.b.minX),vRefY=T.Y(pos.vRef==='top'?g.b.maxY:g.b.minY),holeIndex=holes.indexOf(item),lane=holeIndex%4;
      var sideRight=pos.hRef==='right',sideTop=pos.vRef==='top';
      var hOffset=28+lane*16,hDimY=sideTop?y+hOffset:y-hOffset;
      var vOffset=48+lane*18,vDimX=sideRight?T.X(g.b.maxX)+vOffset:T.X(g.b.minX)-vOffset;
      var hMid=(hRefX+x)/2,vMid=(vRefY+y)/2;
      var diamDirX=sideRight?-1:1,diamDirY=sideTop?-1:1,diamX=x+diamDirX*(r+28),diamY=y+diamDirY*24,diamAnchor=sideRight?'end':'start';
      return `<g class='shape-mi-marker hole${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";render()'>
        <g class='shape-mi-prod-dims'>
          <line x1='${hRefX}' y1='${hDimY}' x2='${x}' y2='${hDimY}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
          <line x1='${hRefX}' y1='${hDimY}' x2='${hRefX}' y2='${y}' class='shape-mi-prod-guide'/><line x1='${x}' y1='${hDimY}' x2='${x}' y2='${y}' class='shape-mi-prod-guide'/>
          <text x='${hMid}' y='${hDimY+(sideTop?15:-9)}' text-anchor='middle'>${esc(shapeDim16(pos.hDistance))}</text>
          <line x1='${vDimX}' y1='${vRefY}' x2='${vDimX}' y2='${y}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
          <line x1='${vDimX}' y1='${vRefY}' x2='${T.X(pos.hRef==='right'?g.b.maxX:g.b.minX)}' y2='${vRefY}' class='shape-mi-prod-guide'/><line x1='${vDimX}' y1='${y}' x2='${x}' y2='${y}' class='shape-mi-prod-guide'/>
          <text x='${vDimX+(sideRight?16:-16)}' y='${vMid}' text-anchor='middle' transform='rotate(-90 ${vDimX+(sideRight?16:-16)} ${vMid})'>${esc(shapeDim16(pos.vDistance))}</text>
        </g>
        <circle cx='${x}' cy='${y}' r='${r}'/>
        <line x1='${x+diamDirX*r}' y1='${y+diamDirY*r}' x2='${diamX}' y2='${diamY}' class='shape-mi-hole-leader'/>
        <text x='${diamX+diamDirX*4}' y='${diamY+(diamDirY<0?-4:12)}' text-anchor='${diamAnchor}'>Ø ${esc(dimIn16(dia))}</text>
      </g>`;
    }
    var e=pt.edge,ex1=T.X(e.start[0]),ey1=T.Y(e.start[1]),ex2=T.X(e.end[0]),ey2=T.Y(e.end[1]),ang=Math.atan2(ey2-ey1,ex2-ex1)*180/Math.PI,mark;
    if(item.type==='clamp')mark=`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-8' y='-8' width='16' height='16' rx='2'/><path d='M -3 -6 V 6 M 3 -6 V 6'/></g>`;
    else mark=`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-10' y='-6' width='20' height='12' rx='2'/><line x1='0' y1='-6' x2='0' y2='6'/><circle cx='-4' cy='0' r='1.5'/><circle cx='4' cy='0' r='1.5'/></g>`;
    var edge=item.edge||e.edge,sameEdgeIndex=items.slice(0,i).filter(function(x){return x.type!=='hole'&&x.edge===edge;}).length,lane=sameEdgeIndex%4;
    var dimSvg='',labelTextSvg='';
    if(edge==='left'||edge==='right'){
      var dimX=edge==='left'?T.X(g.b.minX)-(34+lane*18):T.X(g.b.maxX)+(34+lane*18),originY=T.Y(e.start[1]),midY=(originY+y)/2,textX=dimX+(edge==='left'?-16:16),labelX=edge==='left'?x+15:x-15,labelAnchor=edge==='left'?'start':'end';
      dimSvg=`<g class='shape-mi-prod-dims'>
        <line x1='${dimX}' y1='${originY}' x2='${dimX}' y2='${y}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
        <line x1='${dimX}' y1='${originY}' x2='${T.X(e.start[0])}' y2='${originY}' class='shape-mi-prod-guide'/>
        <line x1='${dimX}' y1='${y}' x2='${x}' y2='${y}' class='shape-mi-prod-guide'/>
        <text x='${textX}' y='${midY}' text-anchor='middle' transform='rotate(-90 ${textX} ${midY})'>${esc(shapeDim16(pt.distance||0))}</text>
      </g>`;
      labelTextSvg=`<text x='${labelX}' y='${y-8}' text-anchor='${labelAnchor}'>${esc(label)}</text>`;
    } else {
      var dimY=edge==='top'?T.Y(g.b.maxY)-(30+lane*18):T.Y(g.b.minY)+(30+lane*18),originX=T.X(e.start[0]),midX=(originX+x)/2,textY=dimY+(edge==='top'?-10:14),labelY=edge==='top'?y+18:y-10;
      dimSvg=`<g class='shape-mi-prod-dims'>
        <line x1='${originX}' y1='${dimY}' x2='${x}' y2='${dimY}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
        <line x1='${originX}' y1='${dimY}' x2='${originX}' y2='${T.Y(e.start[1])}' class='shape-mi-prod-guide'/>
        <line x1='${x}' y1='${dimY}' x2='${x}' y2='${y}' class='shape-mi-prod-guide'/>
        <text x='${midX}' y='${textY}' text-anchor='middle'>${esc(shapeDim16(pt.distance||0))}</text>
      </g>`;
      labelTextSvg=`<text x='${x+13}' y='${labelY}' text-anchor='start'>${esc(label)}</text>`;
    }
    return `<g class='shape-mi-marker ${item.type}${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";render()'>${dimSvg}${mark}${labelTextSvg}</g>`;
  }).join('');
}
function shapeHoleServiceBand(d){if(d>=.5&&d<=1)return {key:'0.5-1',label:'1/2″–1″'};if(d>1&&d<=2)return {key:'1-2',label:'1-1/16″–2″'};if(d>2&&d<=3)return {key:'2-3',label:'2-1/16″–3″'};if(d>3&&d<=4)return {key:'3-4',label:'3-1/16″–4″'};if(d>4)return {key:'4+',label:'> 4″'};return null;}
function shapeServiceEntries(){return shapeManufacturingItems().map(function(item){return {id:item.id,type:item.type,diameter:item.diameter||''};});}
function shapeDerivedServices(){
  var groups=Object.create(null),invalid=[];
  shapeServiceEntries().forEach(function(item){var key=item.type,label=shapeManufacturingItemTitle(item.type);if(item.type==='hole'){var d=fabParseDimStrict(item.diameter),hb=d.ok?shapeHoleServiceBand(d.v):null;if(!hb){invalid.push(item.id);key='hole-invalid-'+item.id;label='Hole · invalid diameter';}else{key='hole:'+hb.key;label='Hole '+hb.label;}}if(!groups[key])groups[key]={label:label,qty:0};groups[key].qty++;});
  return {rows:Object.keys(groups).map(function(k){return groups[k];}),invalid:invalid};
}
function shapeManufacturingServicesHTML(){
  var svc=shapeDerivedServices();if(!svc.rows.length)return `<div class='shape-service-summary empty-service'><b>Services</b><span>Добавь Hole / Clamp / Hinge — количество и сервисы появятся здесь автоматически.</span></div>`;
  return `<div class='shape-service-summary'><div class='shape-service-head'><div><b>Services · автоматически из чертежа</b><small>Цена рассчитывается в Sales Order. Геометрия и количество здесь не являются денежными полями.</small></div></div><div class='shape-service-table shape-service-table-qty'><div class='shape-service-row head'><span>Service</span><span>Qty</span></div>${svc.rows.map(function(r){return `<div class='shape-service-row'><span>${esc(r.label)}</span><b>${r.qty}</b></div>`;}).join('')}</div></div>`;
}
function shapeManufacturingEditor(){
  var items=shapeManufacturingItems(),placing=sManufacturingPlace,body=`<div class='shape-mi-toolbar'><button class='sm' onclick='shapeStartManufacturingPlacement("clamp")'>+ Clamp</button><button class='sm' onclick='shapeStartManufacturingPlacement("hinge")'>+ Hinge</button><button class='sm' onclick='shapeStartManufacturingPlacement("hole")'>+ Hole</button><span>Clamp / Hinge привязываются к краю. Hole задаётся двумя размерными привязками с точностью 1/16″.</span></div>`;
  if(placing)body+=`<div class='shape-mi-place'><b><span>${placing.moveId?'Переместить':'Добавить'}</span>: ${esc(shapeManufacturingItemTitle(placing.type))}</b><span>${placing.type==='hole'?'Кликни внутри стекла для стартовой точки, затем точно задай Left/Right и Top/Bottom.':'Кликни возле нужного края; элемент привяжется к Left / Right / Top / Bottom.'}</span><button class='sm' onclick='shapeCancelManufacturingPlacement()'>Отмена</button></div>`;
  var g=shapeManufacturingGeometry(),defs=shapeManufacturingEdgeDefs(g);
  body+=`<div class='shape-mi-list'>${items.length?items.map(function(item,i){
    var expanded=item.id===sManufacturingSelected,d=item.type==='hole'?fabParseDimStrict(item.diameter):null,summary,fields;
    if(item.type==='hole'){
      var pos=shapeManufacturingHolePosition(item,g)||{hRef:'left',vRef:'bottom',hDistance:0,vDistance:0};
      summary='Ø '+(d&&d.ok?dimIn16(d.v):item.diameter)+' · '+shapeManufacturingEdgeLabel(pos.hRef)+' '+shapeDim16(pos.hDistance)+' · '+shapeManufacturingEdgeLabel(pos.vRef)+' '+shapeDim16(pos.vDistance);
      fields=`<div class='shape-mi-hole-position-grid'>
        <div class='shape-mi-axis-card'><label>Горизонтальная привязка<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","h",this.value)'><option value='left' ${pos.hRef==='left'?'selected':''}>Left</option><option value='right' ${pos.hRef==='right'?'selected':''}>Right</option></select></label><label>Расстояние до центра<input value='${esc(shapeFrac16(pos.hDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","h",this.value)'><small>от ${pos.hRef==='right'?'правого':'левого'} габарита · 1/16″</small></label></div>
        <div class='shape-mi-axis-card'><label>Вертикальная привязка<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","v",this.value)'><option value='bottom' ${pos.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${pos.vRef==='top'?'selected':''}>Top</option></select></label><label>Расстояние до центра<input value='${esc(shapeFrac16(pos.vDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","v",this.value)'><small>от ${pos.vRef==='top'?'верхнего':'нижнего'} габарита · 1/16″</small></label></div>
      </div><label>Диаметр<input id='mi_d_${esc(item.id)}' value='${esc(item.diameter)}' oninput='shapeSetManufacturingField("${esc(item.id)}","diameter",this.value)' onchange='render()'></label>`;
    }else{
      var edge=item.edge||'left',ed=defs[edge],max=ed?shapeDim16(ed.len):'—';summary=`<span>${esc(shapeManufacturingEdgeLabel(edge))}</span> · <span data-raw>${esc(shapeDim16(item.distance||0))}</span> <span>${esc(shapeManufacturingEdgeOrigin(edge))}</span>`;
      fields=`<div class='shape-mi-coordinate-grid'><label>Край стекла<select onchange='shapeSetManufacturingEdge("${esc(item.id)}",this.value)'>${['left','right','bottom','top'].map(function(k){return `<option value='${k}' ${edge===k?'selected':''}>${shapeManufacturingEdgeLabel(k)}</option>`;}).join('')}</select><small>элемент остаётся на finished edge</small></label><label><span>${edge==='left'||edge==='right'?'Расстояние от нижнего угла':'Расстояние от левого угла'}</span><input value='${esc(shapeFrac16(item.distance||0))}' onchange='shapeSetManufacturingDistance("${esc(item.id)}",this.value)'><small><span>Длина края</span> <span data-raw>${esc(max)}</span> · 1/16″</small></label></div>`;
    }
    var summaryMarkup=item.type==='hole'?esc(summary):summary;
    return `<div class='shape-mi-card${expanded?' selected expanded':''}'><button type='button' class='shape-mi-card-toggle' onclick='sManufacturingSelected=${expanded?'null':'"'+esc(item.id)+'"'};render()'><span class='shape-mi-kind ${item.type}'>${esc(shapeManufacturingShort(item.type))}</span><span><b>${esc(shapeManufacturingItemTitle(item.type))} #${i+1}</b><small>${summaryMarkup}</small></span><i>${expanded?'−':'+'}</i></button>${expanded?`<div class='shape-mi-card-body'>${fields}<label>Примечание<input data-raw value='${esc(item.note||'')}' oninput='shapeSetManufacturingField("${esc(item.id)}","note",this.value)'></label><div class='shape-mi-actions'><button class='sm' onclick='shapeMoveManufacturingItem("${esc(item.id)}")'>Выбрать на чертеже</button><button class='sm dl' onclick='shapeRemoveManufacturingItem("${esc(item.id)}")'>Удалить</button></div></div>`:''}</div>`;
  }).join(''):'<div class="empty compact">Пока нет производственных элементов</div>'}</div>`;
  return `<div class='shape-subsection shape-accordion shape-manufacturing'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("manufacturing")'><span><b>Manufacturing items</b><small>Clamp / Hinge = позиция на краю · Hole = Left/Right + Top/Bottom → Production Drawing → Service</small></span><span class='shape-accordion-state'>${items.length?items.length+' items':'no items'}<i>${sManufacturingOpen?'−':'+'}</i></span></button>${sManufacturingOpen?`<div class='shape-accordion-body'>${body}${shapeManufacturingServicesHTML()}</div>`:''}</div>`;
}
function shapeDxfPreviewSvg(source,includeMarks){
  source=shapeNormalizeSource(source);var T=shapeDxfPreviewTransform(source);if(!T)return '';
  var P=T.P,b=T.b,W=T.W,H=T.H,vw=T.vw,vh=T.vh,sc=T.sc,dw=T.dw,dh=T.dh,x0=T.x0,y0=T.y0,X=T.X,Y=T.Y;
  var path=P.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(2)+' '+Y(p[1]).toFixed(2);}).join(' ')+' Z';
  var widthLabel=dimIn16(source.preview.width16/16),heightLabel=dimIn16(source.preview.height16/16),topY=Math.max(20,y0-24),leftX=Math.max(24,x0-26),markers=includeMarks?shapeManufacturingMarkersSvg(source,T):'',placing=includeMarks&&sManufacturingPlace?' placing':'';
  return `<svg class='shape-dxf-svg${placing}' viewBox='0 0 ${vw} ${vh}' role='img' aria-label='DXF contour preview' ${includeMarks?"onclick='shapePlaceManufacturingFromEvent(event,this)'":''}>
    <defs><marker id='shapeDxfArrow' viewBox='0 0 8 8' refX='4' refY='4' markerWidth='5' markerHeight='5' orient='auto-start-reverse'><path d='M0,0 L8,4 L0,8 Z' fill='#d92d20'/></marker></defs>
    <path d='${path}' fill='rgba(46,144,250,.04)' stroke='#667085' stroke-width='1.5'/>
    ${markers}
    <line x1='${x0}' y1='${topY}' x2='${x0+dw}' y2='${topY}' class='shape-dxf-dim-line' marker-start='url(#shapeDxfArrow)' marker-end='url(#shapeDxfArrow)'/>
    <line x1='${x0}' y1='${topY-8}' x2='${x0}' y2='${y0}' class='shape-dxf-guide'/><line x1='${x0+dw}' y1='${topY-8}' x2='${x0+dw}' y2='${y0}' class='shape-dxf-guide'/>
    <text x='${x0+dw/2}' y='${topY-9}' class='shape-dxf-dim-text' text-anchor='middle'>Width ${esc(widthLabel)}</text>
    <line x1='${leftX}' y1='${y0}' x2='${leftX}' y2='${y0+dh}' class='shape-dxf-dim-line' marker-start='url(#shapeDxfArrow)' marker-end='url(#shapeDxfArrow)'/>
    <line x1='${leftX-8}' y1='${y0}' x2='${x0}' y2='${y0}' class='shape-dxf-guide'/><line x1='${leftX-8}' y1='${y0+dh}' x2='${x0}' y2='${y0+dh}' class='shape-dxf-guide'/>
    <text x='${leftX-10}' y='${y0+dh/2}' class='shape-dxf-dim-text' text-anchor='middle' transform='rotate(-90 ${leftX-10} ${y0+dh/2})'>Height ${esc(heightLabel)}</text>
  </svg>`;
}
function shapeDrawnProductionSvg(result,interactive){
  var svg=ShapeModule.productionSvg(result),T=shapeDrawnPreviewTransform(result);if(!T)return svg;
  var marks=shapeManufacturingMarkersSvg(null,T);if(marks)svg=svg.replace('</svg>',marks+'</svg>');
  if(interactive)svg=svg.replace('<svg ','<svg class="shape-drawn-production-interactive'+(sManufacturingPlace?' placing':'')+'" onclick="shapePlaceManufacturingFromEvent(event,this)" ');
  return svg;
}
function shapePreviewMarkup(r){
  if(r&&r.externalFile){
    var source=(r.definition&&r.definition.source)||shapeNormalizeSource(null),cutting=sView==='cutting',svg=r.sourceValid?shapeDxfPreviewSvg(source,!cutting):'';
    var title=cutting?'CUTTING DXF · source file':'Production Drawing · DXF';
    var note=cutting?'Это чистый контур внешнего DXF, который является источником раскроя. Clamp / Hinge / Hole из ERP здесь намеренно НЕ показаны.':(sManufacturingPlace?'Нажми внутри контура, чтобы поставить '+esc(shapeManufacturingItemTitle(sManufacturingPlace.type))+'.':'Контур считан из Fusion 360. Красные линии — максимальный габарит; цветные метки — Manufacturing items и не меняют Cutting DXF.');
    return `<div class='shape-dxf-preview visual ${cutting?'cutting-source-view':''}'><div class='shape-dxf-preview-title'><b>${esc(title)}</b><span>${esc(note)}</span></div>${svg||'<div class="module-invalid">Превью DXF недоступно</div>'}${source.fileName?`<div class='shape-dxf-preview-file'><span data-raw>${raw(source.fileName)}</span><small data-raw>${esc(shapeFileSizeText(source.fileSize))}</small>${cutting?'<b>→ CUTTING SOURCE</b>':''}</div>`:''}</div>`;
  }
  if(sView==='production')return shapeDrawnProductionSvg(r,true);
  if(sView==='cutting')return ShapeModule.cuttingSvg(r);
  return shapeDrawnProductionSvg(r,true);
}
function shapeDerivedHTML(r){
  if(r&&r.externalFile){
    if(!r.sourceValid){var sourceErrors=(r.errors&&r.errors.length?r.errors:[r.reason||'Invalid DXF source']);return `<div class='validation-box badbox'><b>Ошибка DXF-файла</b>${sourceErrors.map(function(x){return '<div>'+esc(moduleErrorText({reason:x}))+'</div>';}).join('')}</div>`;}
    return `<div class='smart-kpis'><div><span>Width</span><b>${dimIn16(r.width)}</b></div><div><span>Height</span><b>${dimIn16(r.height)}</b></div><div><span>Продажная площадь</span><b>${(r.billableArea/144).toFixed(2)} ft²</b></div><div><span>Grid</span><b>1/16″</b></div></div>
      <div class='validation-box okbox'><b>DXF проверен и принят</b><div>Габариты округлены до ближайшей 1/16″. Продажная площадь считается по габаритному прямоугольнику Width × Height. Исходное содержимое DXF в localStorage не сохраняется.</div></div>`;
  }
  if(!r.valid){
    var errors=(r.errors&&r.errors.length?r.errors:[r.reason||'Invalid Shape']);
    return `<div class='validation-box badbox'><b>Ошибка геометрии</b>${errors.map(function(x){return '<div>'+esc(moduleErrorText({reason:x}))+'</div>';}).join('')}</div>`;
  }
  var req=r.requirements||[],warns=r.warns||[];
  return `<div class='smart-kpis'><div><span>Finished</span><b>${dimIn16(r.width)} × ${dimIn16(r.height)}</b></div><div><span>Net area</span><b>${(r.area/144).toFixed(2)} ft²</b></div><div><span>Perimeter</span><b>${dimIn16(r.perimeter)}</b></div><div><span>Cut size</span><b>${dimIn16(r.cutting.width)} × ${dimIn16(r.cutting.height)}</b></div>${r.cutting.safetyBorder&&r.cutting.safetyBorder.applies?`<div><span>Safety Border</span><b>${r.cutting.safetyBorder.manualRequired?'не задан':dimIn16(r.cutting.safetyBorder.value)+' · '+esc(r.cutting.safetyBorder.state)}</b></div><div><span>Оплачиваемый габарит</span><b>${dimIn16(r.cutting.footprint.width)} × ${dimIn16(r.cutting.footprint.height)}</b></div>`:''}</div>
    ${typeof shapeProdBorderField==='function'?shapeProdBorderField():''}
    <div class='shape-requirements'><b>Производственные требования</b>${req.length?req.map(function(q){return `<span><i>${esc(q.stationClass)}</i> ${esc(q.operation)}${q.edgeIds?' · '+esc(q.edgeIds.join(', ')):''}</span>`;}).join(''):'<span>Дополнительных операций нет</span>'}</div>
    ${warns.length?`<div class='validation-box warnbox'>${warns.map(function(w){return esc(moduleErrorText({reason:w}));}).join('<br>')}</div>`:`<div class='validation-box okbox'>Контур валиден · Production Drawing и Cutting Geometry синхронизированы · ${esc(r.fingerprint)}</div>`}`;
}
function refreshShapeEditor(){
  if(!sDraft)return;var r=shapeDraftResult(),p=document.getElementById('shapeLivePreview'),d=document.getElementById('shapeLiveDerived');
  if(p)p.innerHTML=shapePreviewMarkup(r);if(d)d.innerHTML=shapeDerivedHTML(r);
  /* Набор файлов зависит от открытого листа: на чертеже свои, на резке свои.
     Переключение вкладки идёт через refreshShapeEditor, а не через render(),
     поэтому блок надо обновлять здесь — иначе кнопки остаются от того листа,
     на котором редактор открыли. */
  var art=document.querySelector('.shape-artifacts');if(art)art.outerHTML=shapeArtifacts(r);
  /* Мини-превью живёт в ЛЕВОЙ колонке, которую этот обход не перерисовывает.
     Без явного обновления оно застывало на прошлом рендере и показывало
     «невалидна» уже после того, как фигуру починили. */
  var mp=document.getElementById('shapeMiniPreview');if(mp)mp.innerHTML=shapeMiniPreview();
  /* Перерисовываем только SVG-иконки и вычисляемые readonly-ячейки: полный
     ререндер левой колонки сбил бы фокус в поле, где сейчас печатают. */
  ['A','B','C','D'].forEach(function(e){var el=document.getElementById('oi_'+e);if(el)el.innerHTML=shapeOutageIcon(e);});
  /* Размер живёт сразу в двух местах — в шапке и в матрице, — а подсказка у C
     показывает фактическую высоту. Всё это надо подтягивать здесь, иначе поле,
     в котором сейчас НЕ печатают, остаётся со старым значением: набрали 50 в
     матрице, а в шапке всё ещё 36. Поле под кареткой не трогаем никогда. */
  var act=document.activeElement;
  function syncField(id,val,asPlaceholder){
    var el=document.getElementById(id);if(!el||el===act)return;
    if(asPlaceholder)el.setAttribute('placeholder',val);else el.value=val;
  }
  if(sDraft.type==='smart'){
    var bs=r.valid&&r.base;
    syncField('emDlen',bs?dimIn16(bs.Dlen):'AUTO');
    syncField('emDout',bs?dimIn16(bs.Dout):'0');
    syncField('emDpast',bs?dimIn16(bs.DpastOut):'—');
    syncField('emClen',shapeCEffective(),true);
    syncField('shapeCField',shapeCEffective(),true);
    syncField('emClen',sDraft.smart.C.len||'');
    syncField('shapeCField',sDraft.smart.C.len||'');
  }
  syncField('emAlen',sDraft.h);syncField('shapeHField',sDraft.h);
  syncField('emBlen',sDraft.w);syncField('shapeWField',sDraft.w);
  shapeMarkFields();shapeFitPreview();
  document.querySelectorAll('[data-shape-view]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-shape-view')===sView);});
  if(p)applyLang(p);if(d)applyLang(d);
}

/* ---------- Матрица Edge ----------
   Одна таблица на все стороны: колонка = ребро, строка = параметр. Так видно
   всю фигуру разом, а не четыре отдельные карточки. Цвет буквы совпадает
   с цветом ребра на чертеже — опознание идёт по цвету, а не по подписи. */
function shapeEdgeIsVert(e){return e==='A'||e==='C';}
/* Превью формы выноса: прямое ребро, простой уклон или локоть. */
function shapeOutageIcon(edge){
  var m=sDraft.smart,s=m[edge]||{},vert=shapeEdgeIsVert(edge),W=44,H=30,pad=5,col=shapeEdgeColor(edge),d;
  function seg(x1,y1,x2,y2){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="1.8" stroke-linecap="round"/>';}
  /* Простого уклона у D нет: без локтей её форма целиком задана концами, и
     выбирать нечего — рисуем прямую. С локтями показываем заданный излом;
     уход второго отрезка выводится, поэтому в превью он идёт ровно. */
  if(edge==='D'&&!m.elbowsOn){d=seg(pad,H/2,W-pad,H/2);return `<svg viewBox='0 0 ${W} ${H}' class='outage-icon'>${d}</svg>`;}
  var o=ssNN(s.out),lean=o>0?7:0;
  if(m.elbowsOn){
    var E=s.elbow||{},M=ssMode(E.mode)||{s1:0,s2:0},h=ssNN(E.elbowLen),to=ssNN(E.to),past=ssNN(E.past);
    var a=to>0?M.s1*6:0,b=a+(past>0?M.s2*6:0),mid=h>0?0.45:1;
    if(vert)d=seg(W/2+a,pad,W/2+(h>0?a:b),pad+(H-2*pad)*mid)+(h>0?seg(W/2+a,pad+(H-2*pad)*mid,W/2+b,H-pad):'');
    else d=seg(pad,H/2-a,pad+(W-2*pad)*mid,H/2-(h>0?a:b))+(h>0?seg(pad+(W-2*pad)*mid,H/2-a,W-pad,H/2-b):'');
  }else{
    var sgn=vert?(s.dir==='right'?1:s.dir==='left'?-1:0):(s.dir==='up'?-1:s.dir==='down'?1:0);
    if(vert)d=seg(W/2,pad,W/2+sgn*lean,H-pad);
    else d=seg(pad,H/2,W-pad,H/2+sgn*lean);
  }
  return `<svg viewBox='0 0 ${W} ${H}' class='outage-icon'>${d}</svg>`;
}
/* Пустое C означает «правая сторона как A» — это подстановка, а не расчёт.
   Раньше в поле стояло слово AUTO, и фактический размер правой стороны не был
   виден нигде: оператор должен был держать в голове, чему он равен. Показываем
   само число. Связь с A сохраняется — поменяли высоту, подсказка поехала за ней.
   Автоматически считается только D, у неё и поля длины нет. */
function shapeCEffective(){
  var r=fabParseDimStrict(sDraft.h);
  return r.ok&&r.v>0?dimIn16(r.v):'= A';
}
/* Размеры в шапке нужны только тем типам, у которых НЕТ матрицы рёбер.
   У Smart-Shape матрица уже содержит A, B и C — шапка повторяла те же три числа
   вторым набором полей, и одно и то же приходилось вводить дважды. Круг,
   прямоугольник и остальные пресеты матрицы не имеют, им шапка остаётся. */
function shapeMasterSizeFields(){
  if(sDraft.type==='smart')return '';
  var w=`<div><label>${sDraft.type==='circle'?'Diameter':'B · Width'}</label><input id='shapeWField' value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'></div>`;
  var h=sDraft.type==='circle'?'':`<div><label>A · Height</label><input id='shapeHField' value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`;
  return w+h;
}
function shapeEdgeMatrix(){
  var m=sDraft.smart,cols=['A','B','C','D'],r=shapeDraftResult(),base=(r.valid&&r.base)||null;
  var head=cols.map(function(e){return `<span class='em-col' style='color:${shapeEdgeColor(e)}'>${e}</span>`;}).join('');
  function cell(e,html){return `<span class='em-cell'>${html}</span>`;}
  function lengthCell(e){
    if(e==='A')return cell(e,`<input id='emAlen' data-vfield='len' value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'>`);
    if(e==='B')return cell(e,`<input id='emBlen' data-vfield='len' value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'>`);
    if(e==='C')return cell(e,`<input id='emClen' data-vfield='num' data-live-placeholder value='${esc(m.C.len||'')}' placeholder='${esc(shapeCEffective())}' oninput='setShapeC(this.value)'>`);
    return cell(e,`<input class='ro' id='emDlen' readonly value='${base?esc(dimIn16(base.Dlen)):'AUTO'}'>`);
  }
  var rows=[{k:'Length',cells:cols.map(lengthCell).join('')}];
  if(!m.elbowsOn){
    rows.push({k:'Out of plumb / level',cells:cols.map(function(e){
      return e==='D'?cell(e,`<input class='ro' id='emDout' readonly value='${base?esc(dimIn16(base.Dout)):'0'}'>`)
        :cell(e,`<input data-vfield='num' value='${esc(m[e].out||'0')}' oninput='setShapeSimple("${e}","out",this.value)' onblur='shapeZeroIfEmpty(this)'>`);
    }).join('')});
    rows.push({k:'Define Outage',cells:cols.map(function(e){
      if(e==='D')return cell(e,`<div class='outage-pick ro'>${shapeOutageIcon(e)}</div>`);
      var vert=shapeEdgeIsVert(e),opts=vert?[['','—'],['left','← Left'],['right','→ Right']]:[['','—'],['up','↑ Up'],['down','↓ Down']];
      return cell(e,`<div class='outage-pick'><span class='oi' id='oi_${e}'>${shapeOutageIcon(e)}</span><select onchange='setShapeSimple("${e}","dir",this.value)'>${opts.map(function(x){return `<option value='${x[0]}' ${(m[e].dir||'')===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div>`);
    }).join('')});
  }else{
    /* У D вводятся только положение излома и уход ПЕРВОГО отрезка. Уход второго
       выводится из замыкания контура — концы стороны заданы верхом A и верхом C,
       поэтому ячейка «Outage past elbow» у неё остаётся показывающей. */
    [['to','Outage to elbow'],['elbowLen','Elbow length'],['past','Outage past elbow']].forEach(function(f){
      rows.push({k:f[1],cells:cols.map(function(e){
        if(e==='D'&&f[0]==='past')return cell(e,`<input id='emDpast' class='ro' readonly value='${base?esc(dimIn16(base.DpastOut)):'—'}'>`);
        return cell(e,`<input data-vfield='num' value='${esc(m[e].elbow[f[0]]||'0')}' oninput='setShapeElbow("${e}","${f[0]}",this.value)' onblur='shapeZeroIfEmpty(this)'>`);
      }).join('')});
    });
    rows.push({k:'Elbow form',cells:cols.map(function(e){
      /* Для D значим только знак первого отрезка: второй досчитывается. Поэтому
         вместо четырёх режимов даём два и называем их по смыслу — вверх/вниз
         от уровня, как спрашивают на замере. */
      var opts=e==='D'?[['','—'],['m1','↑ Up'],['m3','↓ Down']]
        :[['','—']].concat(SS_MODES.map(function(x){return [x.id,x.id.toUpperCase()+' · '+(x.s1>0?'+':'−')+'/'+(x.s2>0?'+':'−')];}));
      return cell(e,`<div class='outage-pick'><span class='oi' id='oi_${e}'>${shapeOutageIcon(e)}</span><select onchange='setShapeElbow("${e}","mode",this.value)'>${opts.map(function(x){return `<option value='${x[0]}' ${(m[e].elbow.mode||'')===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div>`);
    }).join('')});
  }
  return `<div class='edge-matrix'>
    <div class='em-row em-head'><span class='em-key'>Edge</span>${head}</div>
    ${rows.map(function(x){return `<div class='em-row'><span class='em-key'>${esc(x.k)}</span>${x.cells}</div>`;}).join('')}
    <div class='em-row em-foot'><span class='em-key'><button class='${m.elbowsOn?'on':''}' onclick='setShapeElbows(${m.elbowsOn?'false':'true'})'>${m.elbowsOn?'Hide Elbows':'Show Elbows'}</button></span><span class='em-note'>${m.elbowsOn?'составной перелом стороны · у D длина и уход за изломом считаются автоматически':'простой уклон стороны · D считается автоматически'}</span></div>
  </div>`;
}
/* Визуальная область: угловые блоки иконками вокруг превью фигуры. */
function shapeCornerTile(c){
  var t=sDraft.smart.corners[c],on=t!=='none';
  var g={tl:'M6 26 L6 6 L26 6',tr:'M6 6 L26 6 L26 26',bl:'M6 6 L6 26 L26 26',br:'M26 6 L26 26 L6 26'}[c];
  return `<div class='corner-tile ${on?'on':''}'><svg viewBox='0 0 32 32'><path d='${g}' fill='none' stroke='currentColor' stroke-width='2.4'/></svg>
    <select onchange='setShapeCorner("${c}",this.value)'>${SS_CORNERS.map(function(x){return `<option value='${x[0]}' ${t===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div>`;
}
function shapeMiniPreview(){
  var r=shapeDraftResult();
  if(!r.valid)return `<div class='mini-shape bad'>невалидна</div>`;
  var b=fabEdgeBounds(r.points),W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),vw=150,vh=150,pad=12;
  var sc=Math.min((vw-2*pad)/W,(vh-2*pad)/H),dw=W*sc,dh=H*sc,x0=(vw-dw)/2,y0=(vh-dh)/2;
  function X(x){return x0+(x-b.minX)*sc;}function Y(y){return y0+dh-(y-b.minY)*sc;}
  var lines=(r.geometry.edges||[]).map(function(e){
    return '<line x1="'+X(e.p1[0])+'" y1="'+Y(e.p1[1])+'" x2="'+X(e.p2[0])+'" y2="'+Y(e.p2[1])+'" stroke="'+shapeEdgeColor(e.id)+'" stroke-width="1.8"/>';
  }).join('');
  return `<svg class='mini-shape' viewBox='0 0 ${vw} ${vh}'>${lines}</svg>`;
}
function shapeSmartVisual(){
  return `<div class='smart-visual'>
    <div class='cv tl'>${shapeCornerTile('tl')}</div><div class='cv top' id='shapeMiniPreview'>${shapeMiniPreview()}</div><div class='cv tr'>${shapeCornerTile('tr')}</div>
    <div class='cv bl'>${shapeCornerTile('bl')}</div><div class='cv bot'></div><div class='cv br'>${shapeCornerTile('br')}</div>
  </div>`;
}
function shapeEdgeEditor(edge){
  var m=sDraft.smart,s=m[edge],vert=edge==='A'||edge==='C',name=edge==='A'?'A · Left / Height':edge==='B'?'B · Bottom / Width':'C · Right',shown=edge==='A'?sDraft.h:edge==='B'?sDraft.w:(s.len||shapeCEffective());
  if(!m.elbowsOn)return `<div class='edge-card'><div class='edge-card-head'><b>${name}</b><span>${esc(shown)}</span></div><div class='edge-fields'><div><label>Out of plumb / level</label><input value='${esc(s.out||'0')}' oninput='setShapeSimple("${edge}","out",this.value)'></div><div><label>Direction</label><select onchange='setShapeSimple("${edge}","dir",this.value)'><option value=''>—</option>${(vert?[['left','Left'],['right','Right']]:[['up','Up'],['down','Down']]).map(function(x){return `<option value='${x[0]}' ${s.dir===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div></div></div>`;
  var E=s.elbow;return `<div class='edge-card'><div class='edge-card-head'><b>${name}</b><span>${esc(shown)}</span></div><div class='edge-fields four'><div><label>Outage to elbow</label><input value='${esc(E.to)}' oninput='setShapeElbow("${edge}","to",this.value)'></div><div><label>Elbow length</label><input value='${esc(E.elbowLen)}' oninput='setShapeElbow("${edge}","elbowLen",this.value)'></div><div><label>Outage past elbow</label><input value='${esc(E.past)}' oninput='setShapeElbow("${edge}","past",this.value)'></div><div><label>Elbow form</label><select onchange='setShapeElbow("${edge}","mode",this.value)'><option value=''>—</option>${SS_MODES.map(function(x){return `<option value='${x.id}' ${E.mode===x.id?'selected':''}>${x.id.toUpperCase()} · ${x.s1>0?'+':'−'} / ${x.s2>0?'+':'−'}</option>`;}).join('')}</select></div></div></div>`;
}
/* Матрица рёбер нотча: строка = ребро, колонки = длина / скос / направление.
   Одна раскладка на все углы — так видно, какое ребро куда уходит, без
   переключения между четырьмя разными карточками. */
function shapeNotchMatrix(map){
  var byCorner={};
  map.forEach(function(e){(byCorner[e.corner]=byCorner[e.corner]||[]).push(e);});
  return SS_ORDER.filter(function(c){return byCorner[c];}).map(function(c){
    return `<div class='notch-block'><div class='notch-head'><b>${c.toUpperCase()}</b><span>${byCorner[c].length} рёбер</span></div>
      <div class='notch-row notch-head-row'><span>Ребро</span><span>Длина</span><span>Скос</span><span>Куда</span></div>
      ${byCorner[c].map(function(e){
        var x=sDraft.smart.extraEdges[e.id]||{},vert=e.axis==='v';
        var dirs=vert?[['left','← влево'],['right','→ вправо']]:[['up','↑ вверх'],['down','↓ вниз']];
        var skewed=ssNN(x.out)>0&&x.dir;
        return `<div class='notch-row${skewed?' skewed':''}'>
          <span class='notch-id'>${e.id}<small>${vert?'вертикальное':'горизонтальное'}</small></span>
          <input data-vfield='len' value='${esc(x.len||'')}' placeholder='0' oninput='setShapeExtra("${e.id}",this.value)'>
          <input data-vfield='num' value='${esc(x.out||'0')}' placeholder='0' oninput='setShapeExtraOut("${e.id}","out",this.value)' onblur='shapeZeroIfEmpty(this)' data-i18n-title='${vert?'уход от отвеса':'уход от уровня'}'>
          <select onchange='setShapeExtraOut("${e.id}","dir",this.value)'><option value=''>—</option>${dirs.map(function(d){return `<option value='${d[0]}' ${x.dir===d[0]?'selected':''}>${d[1]}</option>`;}).join('')}</select>
        </div>`;
      }).join('')}</div>`;
  }).join('');
}
/* Оба угловых блока — размеры рёбер нотча и координаты углов — принадлежат
   одному состоянию: угловой блок выбран или нет. Пока ни один угол не выбран,
   оба скрыты целиком, без заглушек. Если значения уже введены, блоки остаются
   видимыми, чтобы данные нельзя было потерять из виду. */
function shapeCornerSectionsVisible(){
  var m=sDraft.smart;
  return SS_ORDER.some(function(c){return m.corners[c]!=='none';});
}
/* Пустое поле там, где ноль осмысленный (уклон, вынос, координата угла),
   само становится нулём при уходе из поля: иначе фигура «ломается» на пустом
   месте и приходится искать, где именно не хватает нуля. */
function shapeZeroIfEmpty(el){
  if(String(el.value).trim()!=='')return;
  el.value='0';
  el.dispatchEvent(new Event('input',{bubbles:true}));
}
/* Подсветка проблемных полей. Работает без ререндера левой колонки, поэтому
   не сбивает фокус: пересчитываем только классы по текущим значениям. */
function shapeMarkFields(){
  document.querySelectorAll('#shapeEditorRoot [data-vfield]').forEach(function(el){
    var kind=el.getAttribute('data-vfield'),v=String(el.value==null?'':el.value).trim(),bad;
    if(kind==='len')bad=!(inch(v)>0);
    else bad=(v!==''&&!fabParseDimStrict(v).ok);
    el.classList.toggle('bad',!!bad);
  });
}
/* Чертёж подгоняется под то, что реально осталось от экрана. CSS этого не
   знает: сверху ещё шапка приложения и заголовок редактора, и фиксированная
   формула либо резала чертёж, либо уводила его под сгиб. Берём СТАТИЧЕСКОЕ
   смещение панели (не текущий скролл), поэтому размер не скачет при прокрутке. */
function shapeFitPreview(){
  var box=document.getElementById('shapeLivePreview');if(!box)return;
  var svg=box.querySelector('svg');if(!svg)return;
  var top=box.getBoundingClientRect().top+(window.scrollY||0);
  var avail=Math.max(340,(window.innerHeight||800)-top-28);
  svg.style.maxHeight=Math.round(avail)+'px';
}
/* Печать активной вкладки чертежа. Setup показывает Production Drawing,
   поэтому печатается он же — печатаем ровно то, что человек видит. */
function shapePrintDrawing(){
  var r=shapeDraftResult(),e=document.getElementById('e_shape');
  if(e)e.style.display='none';
  if(r.externalFile){if(e)fail(e,'DXF-файл из Fusion 360 не печатается как чертёж Production Shape.');return;}
  if(!r.valid){if(e)fail(e,'Невалидная геометрия не печатается: '+(r.errors&&r.errors[0]||r.reason||''));return;}
  var cutting=sView==='cutting',svg=cutting?ShapeModule.cuttingSvg(r):shapeDrawnProductionSvg(r,false);
  var name=(sDraft.name||'').trim()||'Shape';
  printSheet(svg,name+' · '+(cutting?'Cutting Shape':'Production Drawing')+' · Rev '+(sDraft.revision||0));
}
function shapeSmartControls(){
  var S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;var map=ssEdgeMap(S).all;
  return `${shapeSmartVisual()}
    ${shapeEdgeMatrix()}
    ${shapeCornerSectionsVisible()?`<div class='extra-edges'><div class='corner-title'><b>Corner edge dimensions</b><span>каждое ребро нотча можно скосить отдельно</span></div>${map.length?shapeNotchMatrix(map):`<div class='empty compact'>Значения появятся, когда угловой блок получит рёбра</div>`}</div>`:''}`;
}
function shapePolygonControls(){
  return `<div class='shape-subsection'><div class='corner-title'><b>Вершины полигона</b><span>IDs стабильны для радиусов и ревизий</span></div><div class='shape-vertex-grid'>${sDraft.polygon.map(function(v,i){return `<div class='shape-vertex-row'><b>${esc(v.id)}</b><label>X<input value='${esc(v.x)}' oninput='setPolygonCoord(${i},"x",this.value)'></label><label>Y<input value='${esc(v.y)}' oninput='setPolygonCoord(${i},"y",this.value)'></label><button class='sm dl' ${sDraft.polygon.length<=3?'disabled':''} onclick='removePolygonVertex(${i})'>×</button></div>`;}).join('')}</div><button class='sm' onclick='addPolygonVertex()'>Добавить вершину</button></div>`;
}
function setPolygonCoord(i,k,v){if(sDraft.polygon[i])sDraft.polygon[i][k]=v;refreshShapeEditor();}
function addPolygonVertex(){var last=sDraft.polygon[sDraft.polygon.length-1]||{x:'0',y:'0'};sDraft.polygon.push({id:shapeNewEntityId('PV-'),x:String(inch(last.x)+4),y:String(inch(last.y))});render();}
function removePolygonVertex(i){if(sDraft.polygon.length<=3)return;sDraft.polygon.splice(i,1);render();}
function shapeGenericControls(){
  var specs=shapeParamSpecsFor(sDraft.type);
  return `${specs.length?`<div class='shape-subsection'><div class='corner-title'><b>Параметры фигуры</b><span>inches · дроби поддерживаются</span></div><div class='grid'>${specs.map(function(s){return `<div><label>${esc(s.label)}</label><input value='${esc(sDraft.params[s.key])}' oninput='setShapeParam("${s.key}",this.value)'></div>`;}).join('')}</div></div>`:''}${sDraft.type==='polygon'?shapePolygonControls():''}`;
}

function shapeGroups(){var g=shapeDraftGeometry();return g.ok?shapeEdgeGroups(g):[];}
function shapeGroupAt(i){return shapeGroups()[i]||null;}
function shapeOperationAt(groupIndex,type){var g=shapeGroupAt(groupIndex);if(!g)return null;return ((sDraft.edgeOps||{})[g.id]||[]).find(function(x){return x.type===type;})||null;}
/* Rough Arris, Flat Polish и CNC Shape Polish — взаимоисключающие базовые
   обработки: на кромке может быть ровно одна. Выбор новой ПОДМЕНЯЕТ прежнюю,
   а не добавляется к ней. Раньше кнопка просто дописывала операцию, и выбор
   CNC поверх уже стоявшей полировки давал ошибку «mutually exclusive
   finishes» и блокировал рез — вместо того, чтобы сделать очевидное. */
/* Переключатель обработки кромки ОДИН на проект: раньше рядом жило второе
   определение в shape-production-ui.js, и правки в этом расходились с тем, что
   реально работало. Логика значений по умолчанию и взаимного исключения
   базовых обработок — в shapeProdToggleOps. */
function toggleShapeEdgeOp(groupIndex,opIndex,on){
  var g=shapeGroupAt(groupIndex),type=SHAPE_EDGE_OPS[opIndex];if(!g||!type)return;
  /* Выбран конкретный лайт — пишем в его обработку, она перекрывает общую. */
  var store=sEdgeLite==null?(sDraft.edgeOps||(sDraft.edgeOps={})):shapeLiteOpsDraft(sEdgeLite,g.id).edgeOps;
  var list=shapeProdToggleOps(store[g.id]||[],type,on);
  if(list.length)store[g.id]=list;else delete store[g.id];
  /* «Все лайты» означает ВСЕ: правка на этой вкладке снимает собственную
     обработку лайтов по этой кромке, иначе выбор молча не срабатывал бы —
     у лайта своя обработка сильнее общей. Отступ лайта не трогаем: это
     геометрия, а не кромка. */
  if(sEdgeLite==null&&sDraft.lites)Object.keys(sDraft.lites).forEach(function(key){
    var spec=sDraft.lites[key];
    if(spec&&spec.edgeOps&&spec.edgeOps[g.id])delete spec.edgeOps[g.id];
  });
  render();
}
function setShapeOpParam(groupIndex,type,k,v){var op=shapeOperationAt(groupIndex,type);if(op)op[k]=v;refreshShapeEditor();}
/* Раскладка формы по лайтам. Ступенчатый пакет: у первого стекла контур формы,
   а второе меньше на отступ — поэтому у лайта есть свой inset по кромкам и своя
   обработка. Пока выбран «Все лайты», правится общая обработка формы. */
/* объявлено var, а не let: sales/orders.js загружается раньше и сбрасывает
   вкладку при открытии формы из строки заказа. */
var sEdgeLite=null;
function shapeEditorLites(){
  if(!salesBridge||salesBridge.kind!=='shape'||typeof soDraft==='undefined'||!soDraft)return [];
  var line=(soDraft.lines||[]).find(function(l){return l.id===salesBridge.lineId;});
  return line?salesLineLites(line).map(function(l){return {index:l.index,label:l.label,mm:l.thicknessMm};}):[];
}
function setShapeEdgeLite(v){sEdgeLite=v===''||v==null?null:+v;render();}
function shapeLiteOpsDraft(liteIndex,edgeId){
  if(!sDraft.lites)sDraft.lites={};
  var key=String(liteIndex);
  if(!sDraft.lites[key])sDraft.lites[key]={inset:{},edgeOps:{}};
  if(!sDraft.lites[key].edgeOps)sDraft.lites[key].edgeOps={};
  if(!sDraft.lites[key].inset)sDraft.lites[key].inset={};
  return sDraft.lites[key];
}
function setShapeLiteInset(groupIndex,value){
  var g=shapeGroupAt(groupIndex);if(!g||sEdgeLite==null)return;
  var spec=shapeLiteOpsDraft(sEdgeLite,g.id),t=String(value==null?'':value).trim();
  if(t)spec.inset[g.id]=t;else delete spec.inset[g.id];
  refreshShapeEditor();
}
/* Кромка без базовой обработки уйдёт в производство с той, что задана на
   стекле строки (арис до 8 mm, полировка от 10 mm). Всё, что задано ЗДЕСЬ, —
   база номер один и её перекрывает; подсказка показывает, что применится,
   если тут не трогать ничего. */
function shapeBaseEdgeworkHint(has){
  if(!salesBridge||salesBridge.kind!=='shape'||typeof soDraft==='undefined'||!soDraft)return '';
  if(SHAPE_PRIMARY_FINISHES.some(function(t){return has(t);}))return '';
  var line=(soDraft.lines||[]).find(function(l){return l.id===salesBridge.lineId;});
  var kind=line?salesLineBaseEdgeworkKind(line):'';
  return kind?`<small class='shape-edge-base' title='${esc(glassBaseEdgeworkLabel(kind))}'><span>от стекла</span> <span data-raw>${esc(kind==='polish'?'Flat':'Rough')}</span></small>`:'';
}
/* Вкладки лайтов: «Все лайты» правит общую обработку формы, вкладка лайта —
   его отступ и его кромку. Показываем только когда лайтов больше одного. */
/* Открыта СВОЯ форма лайта — говорим об этом в шапке редактора, а не внутри
   свёрнутой секции кромок, иначе подсказку не видно. */
function shapeLiteBanner(){
  if(!salesBridge||salesBridge.kind!=='shape'||salesBridge.liteIndex==null)return '';
  return `<div class='shape-lite-note own'>Это собственная форма <b>Lite ${salesBridge.liteIndex+1}</b> строки заказа. Остальные лайты живут на общей форме строки.</div>`;
}
function shapeEdgeLiteTabs(){
  if(salesBridge&&salesBridge.kind==='shape'&&salesBridge.liteIndex!=null)return '';
  var lites=shapeEditorLites();
  if(lites.length<2)return '';
  return `<div class='shape-lite-tabs'><button type='button' class='${sEdgeLite==null?'on':''}' onclick='setShapeEdgeLite("")'>Все лайты</button>`
   +lites.map(function(l){
     var spec=(sDraft.lites||{})[String(l.index)]||{},marks=Object.keys(spec.inset||{}).length+Object.keys(spec.edgeOps||{}).length;
     return `<button type='button' class='${sEdgeLite===l.index?'on':''}' onclick='setShapeEdgeLite(${l.index})'>${esc(l.label)}${l.mm?' · '+esc(l.mm)+' mm':''}${marks?' <i>'+marks+'</i>':''}</button>`;
    }).join('')
   +`</div><div class='shape-lite-note'>${sEdgeLite==null?'Общая обработка формы: действует на все лайты, если у лайта не задано своё.':'Обработка этого стекла. Пусто = берётся общая обработка формы или базовая кромка стекла. Геометрия лайта — в секции «Лайты юнита».'}</div>`;
}
/* ---------- Лайты: разделение юнита ----------
   Стекла в юните почти всегда повторяют одну фигуру, поэтому раздельная
   геометрия — исключение, и место ему на виду, а не внутри обработки кромок.
   Здесь три ответа на вопрос «чем это стекло отличается»:
   · зеркало — та же фигура, перевёрнутая (Low-E на #2 и любой другой случай);
   · отступ — тот же контур, но стекло уже на заданную величину по кромкам;
   · своя форма — контур, который отступом не описывается. */
var sLiteSplitOpen=false;
function toggleShapeLiteSplit(){sLiteSplitOpen=!sLiteSplitOpen;render();}
function setShapeLiteMirror(liteIndex,on){
  var spec=shapeLiteOpsDraft(liteIndex,null);
  spec.mirror=!!on;
  if(!spec.mirror&&!Object.keys(spec.inset).length&&!Object.keys(spec.edgeOps).length)delete sDraft.lites[String(liteIndex)];
  render();
}
/* Маленький контур для карточки лайта и для строки в окне кромки: без него
   зеркало и отступ никак не проверить — на общем чертеже формы они не видны,
   потому что описывают отдельное стекло, а не саму форму. */
function shapeMiniContourSvg(points,cls){
  var P=(points||[]).filter(function(p){return p&&isFinite(p[0])&&isFinite(p[1]);});
  if(P.length<3)return '';
  var b=fabEdgeBounds(P),W=Math.max(.01,b.maxX-b.minX),H=Math.max(.01,b.maxY-b.minY);
  var vw=88,vh=64,pad=6,sc=Math.min((vw-pad*2)/W,(vh-pad*2)/H);
  var ox=(vw-W*sc)/2,oy=(vh-H*sc)/2;
  var d=P.map(function(p,i){return (i?'L ':'M ')+(ox+(p[0]-b.minX)*sc).toFixed(2)+' '+(vh-oy-(p[1]-b.minY)*sc).toFixed(2);}).join(' ')+' Z';
  return `<svg class='shape-mini ${cls||''}' viewBox='0 0 ${vw} ${vh}' aria-hidden='true'><path d='${d}'/></svg>`;
}
/* Контур конкретного лайта прямо из редактора: своя форма → её контур, иначе
   контур формы с отступом лайта; зеркало применяется последним. */
function shapeLiteContourPoints(liteIndex){
  var line=(typeof soDraft!=='undefined'&&soDraft&&salesBridge&&salesBridge.kind==='shape')?(soDraft.lines||[]).find(function(l){return l.id===salesBridge.lineId;}):null;
  var own=line?salesLineLiteShape(line,liteIndex):null;
  var def=own||sDraft,r=def?ShapeModule.compute(def):null;
  if(!r||!r.valid||!r.cutting||!r.cutting.finishedPoints)return null;
  var pts=r.cutting.finishedPoints.map(function(p){return p.slice();});
  if(!own){
    var groups=shapeGroups(),insets=groups.map(function(g){return shapeLiteInsetFor(sDraft,liteIndex,g.id);});
    if(insets.some(function(v){return v>0;})&&insets.length===pts.length){
      var inner=shapeInsetVariable(pts,insets);
      if(inner.valid)pts=inner.points;
    }
  }
  if(shapeLiteMirrored(sDraft,liteIndex)){
    var bb=fabEdgeBounds(pts),sum=bb.minX+bb.maxX;
    pts=pts.map(function(p){return [sum-p[0],p[1]];});
  }
  return pts;
}
function shapeLiteSplitEditor(){
  if(salesBridge&&salesBridge.kind==='shape'&&salesBridge.liteIndex!=null)return '';
  var lites=shapeEditorLites();
  if(lites.length<2)return '';
  var line=(typeof soDraft!=='undefined'&&soDraft&&salesBridge)?(soDraft.lines||[]).find(function(l){return l.id===salesBridge.lineId;}):null;
  var groups=shapeGroups(),changed=0;
  var rows=lites.map(function(l){
    var spec=(sDraft.lites||{})[String(l.index)]||{},own=line?salesLineLiteShape(line,l.index):null;
    var insetCount=Object.keys(spec.inset||{}).length;
    if(own||spec.mirror||insetCount)changed++;
    var state=own?`<span class='pill info' data-raw>${esc(own.name)}</span>`
      :(spec.mirror?`<span class='pill info'>Зеркало</span>`:'')+(insetCount?`<span class='pill info'>Отступ</span>`:'')||`<span class='pill'>Как у формы</span>`;
    var actions=own
      ? `<button type='button' class='sm' onclick='salesOpenLiteShape("${esc(line.id)}",${l.index})'>Открыть</button><button type='button' class='sm dl' onclick='salesReattachLiteShape("${esc(line.id)}",${l.index})'>Вернуть на общую</button>`
      : `<label class='shape-lite-mirror'><input type='checkbox' ${spec.mirror?'checked':''} onchange='setShapeLiteMirror(${l.index},this.checked)'><span>Зеркало</span></label>`
        +(line?`<button type='button' class='sm' onclick='salesOpenLiteShape("${esc(line.id)}",${l.index})'>Своя форма</button>`:'');
    var insets=own?'':`<div class='shape-lite-insets'><span>Отступ по кромкам</span>${groups.map(function(g,gi){
      var v=(spec.inset||{})[g.id]||'';
      return `<label><b>${esc(g.id)}</b><input value='${esc(v)}' placeholder='0' onchange='setShapeLiteInsetFor(${l.index},${gi},this.value)'></label>`;
     }).join('')}</div>`;
    var thumb=shapeMiniContourSvg(shapeLiteContourPoints(l.index),(spec.mirror?'mirrored':''));
    return `<div class='shape-lite-card'><div class='shape-lite-card-head'>${thumb}<b>${esc(l.label)}</b><small>${l.mm?esc(l.mm)+' mm':''}</small>${state}<span class='sp'></span>${actions}</div>${insets}</div>`;
  }).join('');
  /* Если все стёкла отделены в свои формы, общая не обслуживает никого — и
     правки в ней молча ни на что не влияют. Такое надо говорить вслух. */
  var orphan=line&&lites.length&&lites.every(function(l){return !!salesLineLiteShape(line,l.index);});
  var warn=orphan?`<div class='shape-lite-note own'>Ни один лайт не живёт на этой форме — у каждого своя. Правки здесь ни на что не повлияют, пока лайт не вернут кнопкой «Вернуть на общую».</div>`:'';
  return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeLiteSplit()'><span><b>Лайты юнита</b><small>зеркало · отступ · своя форма</small></span><span class='shape-accordion-state'>${changed?`<span data-raw>${changed}</span> с отличиями`:'все по общей форме'}<i>${sLiteSplitOpen?'−':'+'}</i></span></button>${sLiteSplitOpen?`<div class='shape-lite-cards'>${warn}${rows}</div>`:''}</div>`;
}
/* Отступ конкретного лайта: тот же ввод, что и в колонке кромок, но заданный
   явно для лайта — вкладку переключать не нужно. */
function setShapeLiteInsetFor(liteIndex,groupIndex,value){
  var g=shapeGroupAt(groupIndex);if(!g)return;
  var spec=shapeLiteOpsDraft(liteIndex,g.id),t=String(value==null?'':value).trim();
  if(t)spec.inset[g.id]=t;else delete spec.inset[g.id];
  render();
}
function shapeEdgeworkEditor(){
  var groups=shapeGroups();if(!groups.length)return `<div class='validation-box badbox'>Сначала исправь основной контур — кромки не определены.</div>`;
  var operationCount=Object.keys(sDraft.edgeOps||{}).reduce(function(n,id){return n+(sDraft.edgeOps[id]||[]).length;},0),short=['Rough','Flat','CNC','Miter','Bevel'];
  return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("edgework")'><span><b>Обработка кромок</b><small>${groups.length} физических кромок · allowance и маршрут</small></span><span class='shape-accordion-state'>${operationCount?operationCount+' операций':'без обработки'}<i>${sEdgeworkOpen?'−':'+'}</i></span></button>${sEdgeworkOpen?`<div class='shape-edgework-scroll'><div class='shape-edgework-matrix'>${shapeEdgeLiteTabs()}<div class='shape-edgework-row shape-edgework-labels'><span>Кромка</span>${short.map(function(x){return '<span>'+x+'</span>';}).join('')}</div>${groups.map(function(g,gi){
    var ops=(sEdgeLite==null?(sDraft.edgeOps||{}):((sDraft.lites&&sDraft.lites[String(sEdgeLite)]&&sDraft.lites[String(sEdgeLite)].edgeOps)||{}))[g.id]||[],has=function(t){return ops.some(function(o){return o.type===t;});},miter=ops.find(function(o){return o.type==='Mitering';}),bevel=ops.find(function(o){return o.type==='Beveling';});
    return `<div class='shape-edgework-row'><span class='shape-edge-code'><b>${esc(g.id)}</b><small>${dimIn16(g.length)}</small>${sEdgeLite==null?shapeBaseEdgeworkHint(has):''}</span>${SHAPE_EDGE_OPS.map(function(t,oi){return `<label class='shape-op-compact ${has(t)?'on':''}' title='${esc(t)}'><input type='checkbox' ${has(t)?'checked':''} onchange='toggleShapeEdgeOp(${gi},${oi},this.checked)'><span>${short[oi]}</span></label>`;}).join('')}${miter||bevel?`<div class='shape-edge-params'>${miter?`<label>Miter<select onchange='setShapeOpParam(${gi},"Mitering","angle",this.value)'><option value='45' ${+miter.angle===45?'selected':''}>45°</option><option value='22.5' ${+miter.angle===22.5?'selected':''}>22.5°</option></select></label><label>Сторона<select onchange='setShapeOpParam(${gi},"Mitering","side",this.value)'><option value='back' ${(miter.side||'back')==='back'?'selected':''}>Back mitre</option><option value='front' ${miter.side==='front'?'selected':''}>Front mitre</option></select></label>`:''}${bevel?`<label>Bevel width<input value='${esc(bevel.width)}' oninput='setShapeOpParam(${gi},"Beveling","width",this.value)'></label><label>Сторона<select onchange='setShapeOpParam(${gi},"Beveling","side",this.value)'><option value='front' ${(bevel.side||'front')==='front'?'selected':''}>Front bevel</option><option value='back' ${bevel.side==='back'?'selected':''}>Back bevel</option></select></label>`:''}</div>`:''}</div>`;
  }).join('')}</div></div>`:''}</div>`;
}

function addShapeFeature(type){var geo=shapeDraftGeometry();sFeaturesOpen=true;sFeatureExpandedId=null;sDraft.features.push(newShapeFeature(type,geo));render();}
function setShapeFeature(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;refreshShapeEditor();}
function setShapeFeatureAndRender(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;render();}
function removeShapeFeature(i){sDraft.features.splice(i,1);render();}
function shapeFeatureFields(f,i,geo){
  function input(label,k){return `<label>${label}<input value='${esc(f[k])}' oninput='setShapeFeature(${i},"${k}",this.value)'></label>`;}
  if(f.type==='hole')return input('Diameter','diameter')+input('X from origin','x')+input('Y from origin','y')+input('Min edge clearance','minEdge');
  if(f.type==='cutout')return input('Width','width')+input('Height','height')+input('X from origin','x')+input('Y from origin','y')+input('Corner radius','cornerRadius');
  if(f.type==='stamp')return input('X from origin','x')+input('Y from origin','y')+input('Stamp text','text');
  if(f.type==='radius')return `<label>Physical vertex<select onchange='setShapeFeatureAndRender(${i},"vertexId",this.value)'>${(geo.vertices||[]).map(function(v){return `<option value='${esc(v.id)}' ${v.id===f.vertexId?'selected':''}>${esc(v.id+' · '+v.label)}</option>`;}).join('')}</select></label>`+input('Radius','radius');
  if(f.type==='hardware')return input('Template / name','name')+`<label>Physical edge<select onchange='setShapeFeatureAndRender(${i},"edgeId",this.value)'>${shapeEdgeGroups(geo).map(function(e){return `<option value='${esc(e.id)}' ${e.id===f.edgeId?'selected':''}>${esc(e.id+' · '+dimIn16(e.length))}</option>`;}).join('')}</select></label>`+input('Distance along edge','distance')+input('Inset','inset')+input('Prep width','prepWidth')+input('Prep height','prepHeight')+input('Hole diameter','holeDia');
  return '';
}

function shapeFeatureSummary(f,geo){
  if(f.type==='hole')return 'Ø '+f.diameter+' · X '+f.x+' · Y '+f.y;
  if(f.type==='cutout')return f.width+' × '+f.height+' · X '+f.x+' · Y '+f.y;
  if(f.type==='radius')return (f.vertexId||'—')+' · R '+f.radius;
  if(f.type==='hardware')return (f.name||'Hardware')+' · '+(f.edgeId||'—')+' @ '+f.distance;
  if(f.type==='stamp')return f.text||'Stamp';return '';
}
function shapeFeaturesEditor(geo){
  var titles={hole:'Legacy cutting hole',cutout:'Internal cutout',radius:'Corner radius',hardware:'Legacy hardware prep',stamp:'Legacy stamp'};
  var count=sDraft.features.length,legacy=sDraft.features.filter(function(f){return f.type==='hole'||f.type==='hardware'||f.type==='stamp';}).length;
  return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("features")'><span><b>Geometry modifiers</b><small>Только то, что реально изменяет Cutting Shape: Cutout / Radius.</small></span><span class='shape-accordion-state'>${count?count+' элементов':'нет элементов'}<i>${sFeaturesOpen?'−':'+'}</i></span></button>${sFeaturesOpen?`<div class='shape-accordion-body'><div class='validation-box infobox compact-warning'>Hole / Clamp / Hinge добавляются только через Manufacturing items и не попадают в Cutting Shape.</div><div class='shape-feature-add'><button class='sm' onclick='addShapeFeature("cutout")'>+ Cutout</button>${(geo.vertices||[]).length?`<button class='sm' onclick='addShapeFeature("radius")'>+ Radius</button>`:''}</div>${legacy?`<div class='validation-box warnbox compact-warning'><b>Legacy cutting items: ${legacy}</b><span>Эти Hole / Hardware / Stamp были созданы старой логикой и действительно меняют Cutting Shape. Удали их или оставь только если это намеренная cutting geometry.</span></div>`:''}<div class='shape-feature-list'>${count?sDraft.features.map(function(f,i){var expanded=sFeatureExpandedId===f.id;return `<div class='shape-feature-card collapsed-card${expanded?' expanded':''}'><div class='shape-feature-card-head'><button type='button' class='shape-feature-card-toggle' onclick='toggleShapeFeatureCard("${esc(f.id)}")'><span><b>${esc(titles[f.type]||f.type)}</b><small>${esc(shapeFeatureSummary(f,geo))}</small></span><i>${expanded?'−':'+'}</i></button><button class='sm dl' onclick='removeShapeFeature(${i})'>×</button></div>${expanded?`<div class='shape-feature-fields'>${shapeFeatureFields(f,i,geo)}</div>`:''}</div>`;}).join(''):'<div class="empty compact">Geometry modifiers не добавлены</div>'}</div></div>`:''}</div>`;
}
function shapeArtifacts(r){
  if(r.externalFile)return `<div class='shape-artifacts dxf-source'><b>Файл раскроя текущей ревизии</b><span>DXF из Fusion 360 используется как внешний файл раскроя. ERP хранит метаданные, превью-контура и габариты, но не хранит исходное содержимое DXF и не может скачать файл повторно.</span><small>ERP-экспорт Production SVG, Cutting SVG, Machine JSON и Generic DXF для этой ревизии отключён: он не должен подменять внешний раскрой.</small></div>`;
  var disabled=r.valid?'':'disabled';
  /* На листе чертежа скачивается чертёж, на листе резки — файл резки.
     Файл для станка держим отдельно от проверочного: неизвестно, как станок
     отреагирует на посторонние слои, поэтому в нём только линия реза. */
  if(sView==='cutting')return `<div class='shape-artifacts'><b>Файлы текущей ревизии</b><button ${disabled} onclick='downloadShapeArtifact("dxf")'>Cutting DXF</button><button ${disabled} onclick='downloadShapeArtifact("check")'>Check DXF</button><button ${disabled} onclick='downloadShapeArtifact("json")'>Machine JSON</button><button ${disabled} onclick='downloadShapeArtifact("cutting")'>Cutting SVG</button><small>Cutting DXF — только линия реза, слой CUT_OUTER, ноль в нижнем левом углу реза: это файл для станка. Check DXF — проверочный, слоями FINISHED_OUTER, CUT_OUTER, SAFETY_BORDER, REFERENCE в нуле готового контура; на станок его не отдавать.</small></div>`;
  return `<div class='shape-artifacts'><b>Файлы текущей ревизии</b><button ${disabled} onclick='downloadShapeArtifact("finished")'>Finished DXF</button><button ${disabled} onclick='downloadShapeArtifact("production")'>Production SVG</button><small>Finished DXF — готовая деталь: контур, отверстия и вырезы, без припуска. Ноль в нижнем левом углу готового контура.</small></div>`;
}
function shapeForm(){
  /* Полный render() пересоздаёт DOM, поэтому подсветку полей ставим сразу
     после вставки разметки — иначе первый показ был бы без неё. */
  setTimeout(function(){shapeMarkFields();shapeFitPreview();},0);
  var r=shapeDraftResult(),external=shapeIsDxfSource(sDraft),geo=external?{ok:false,points:[],edges:[],vertices:[]}:shapeDraftGeometry(),presetOptions=SHAPE_PRESETS.map(function(p){return `<option value='${p.id}' ${p.id===sDraft.type?'selected':''}>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  var master=external?`<div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div><div><label>Width</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.width16||0)/16))}'></div><div><label>Height</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.height16||0)/16))}'></div></div>`:`<div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div>${shapeMasterSizeFields()}</div>`;
  var controls=external?`<div class='validation-box infobox'>Геометрия конфигуратора для этой ревизии отключена: контур и габариты считаны из внешнего DXF.</div>${shapeManufacturingEditor()}`:`${sDraft.type==='smart'?shapeSmartControls():shapeGenericControls()}${shapeManufacturingEditor()}${shapeEdgeworkEditor()}${shapeFeaturesEditor(geo)}`;
  var tabs=external?`<div class='shape-view-tabs'><button class='${sView!=='cutting'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting DXF</button><button class='shape-print-btn' disabled>Печать / PDF</button></div>`:`<div class='shape-view-tabs'><button data-shape-view='setup' class='${sView==='setup'?'on':''}' onclick='setShapeView("setup")'>Setup</button><button data-shape-view='production' class='${sView==='production'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button data-shape-view='cutting' class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting Shape</button><button class='shape-print-btn' onclick='shapePrintDrawing()' data-i18n-title='Печать чертежа или сохранение в PDF'>Печать / PDF</button></div>`;
  return `<div class='module-editor' id='shapeEditorRoot'><div class='module-editor-head'><div><h3>${sEdit==='new'?'Новая производственная фигура':'Изменение фигуры'}</h3><p>${external?'Раскрой приходит DXF-файлом из Fusion 360; ERP сохраняет только производный 2D-контур и габариты, но не исходное содержимое файла.':'Все размеры — finished size в дюймах. Невалидная геометрия не сохраняется и не экспортируется.'}</p></div></div>
    <div class='shape-editor-layout'><div class='shape-controls'>
      ${master}${shapeSourceEditor()}${controls}
    </div><div class='shape-preview-side'>${tabs}<div id='shapeLivePreview' class='shape-drawing-preview'>${shapePreviewMarkup(r)}</div><div id='shapeLiveDerived'>${shapeDerivedHTML(r)}</div>${shapeArtifacts(r)}</div></div>
    <div class='err' id='e_shape'></div><div class='row'><button class='pri' onclick='saveShape()'>Сохранить ревизию</button><button onclick='cancelShapeEdit()'>Отмена</button></div></div>`;
}

function saveShape(){
  var e=document.getElementById('e_shape');e.style.display='none';sDraft.name=String(sDraft.name||'').trim();if(!sDraft.name)return fail(e,'Укажи название');
  var r=ShapeModule.compute(sDraft),external=r.externalFile&&r.sourceValid;if(!r.valid&&!external)return fail(e,(r.errors&&r.errors.length?r.errors:[r.reason]).map(function(x){return moduleErrorText({reason:x});}).join(' · '));
  var prior=sEdit==='new'?null:DB.shapeDef[sEdit],used=prior&&DB.muntinDef.some(function(m){return m.shapeId===prior.id;});
  if(used&&shapeFingerprint(prior)!==r.fingerprint&&!confirm('This shape is used by a Muntin layout. New geometry will change that layout. Save a new revision?'))return;
  var saved=r.definition||normalizeShapeDef(sDraft);saved.name=sDraft.name;saved.revision=prior?(prior.revision||0)+1:1;saved.status='draft';
  if(sEdit==='new')DB.shapeDef.push(saved);else DB.shapeDef[sEdit]=saved;var savedId=saved.id;touch();
  if(typeof salesBridgeOnShapeSaved==='function'&&salesBridgeOnShapeSaved(savedId))return;
  sEdit=null;sDraft=null;render();
}
function cancelShapeEdit(){if(typeof salesBridgeCancel==='function'&&salesBridgeCancel('shape'))return;sEdit=null;sDraft=null;render();}
function shapeSafeFileName(s){return String(s||'shape').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'shape';}
function shapeDownload(textValue,mime,name){var b=new Blob([textValue],{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function downloadShapeArtifact(kind){
  var r=shapeDraftResult();if(r.externalFile)return alert('ERP-generated artifacts are unavailable for an external DXF source.');if(!r.valid)return alert(moduleErrorText(r));var base=shapeSafeFileName(r.definition.name)+'_R'+(r.definition.revision||0);
  if(kind==='production')shapeDownload(shapeDrawnProductionSvg(r,false),'image/svg+xml',base+'_production.svg');
  if(kind==='cutting')shapeDownload(ShapeModule.cuttingSvg(r),'image/svg+xml',base+'_cutting.svg');
  if(kind==='json')shapeDownload(JSON.stringify(ShapeModule.machinePayload(r),null,2),'application/json',base+'_machine.json');
  if(kind==='dxf')shapeDownload(ShapeModule.genericDxf(r),'application/dxf',base+'_cutting.dxf');
  if(kind==='finished')shapeDownload(ShapeModule.finishedDxf(r),'application/dxf',base+'_finished.dxf');
  if(kind==='check')shapeDownload(ShapeModule.checkDxf(r),'application/dxf',base+'_check.dxf');
}
function delShape(i){var s=DB.shapeDef[i];if(DB.muntinDef.some(function(m){return m.shapeId===s.id;}))return alert('Cannot delete — this shape is used by a Muntin layout');if(typeof salesShapeHasReferences==='function'&&salesShapeHasReferences(s.id))return alert('Cannot delete — this Shape is used by a Sales Order');if(!confirm('Delete this shape?'))return;DB.shapeDef.splice(i,1);touch();render();}
