/* =====================================================================
   view/sales/shape-ui · schema-v2
   Полный редактор finished geometry, features, edgework и cutting output.
   Геометрия и экспорт принадлежат modules/shape/*; экран только редактирует.
   ===================================================================== */

let sEdit=null,sDraft=null,sView='setup',sEdgeworkOpen=false,sFeaturesOpen=false;

function viewShapeSkill(){
  var rows=DB.shapeDef.map(function(s,i){
    var r=ShapeModule.compute(s),p=shapePresetInfo(s.type),featureCount=(s.features||[]).filter(function(f){return f.type!=='radius';}).length;
    return `<tr><td><b>${esc(s.name)}</b><small class='shape-row-meta'>${esc(p.code+' · '+p.label)} · Rev ${s.revision||0}</small></td><td class='mono'>${r.valid?dimIn(r.width)+' × '+dimIn(r.height):'<span class="bad pill">невалидна</span>'}</td><td class='mono'>${r.valid?r.edges.length:'—'}</td><td class='mono'>${featureCount}</td><td>${r.valid?'<span class="pill ok">готова к экспорту</span>':'<span class="pill bad">'+esc(moduleErrorText(r))+'</span>'}</td><td class='shape-actions'><button class='sm' onclick='openShapeEdit(${i})'>Изменить</button><button class='sm dl' onclick='delShape(${i})'>×</button></td></tr>`;
  }).join('');
  var presetOptions=SHAPE_PRESETS.map(function(p){return `<option value='${esc(p.id)}'>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  return `<div class='real-module-note'><b>Shape schema v2</b><span>Finished Geometry, Production Drawing и Cutting Geometry формируются из одной ревизии. Отверстия, вырезы, hardware prep, радиусы и обработка кромки больше не теряются при экспорте.</span></div>
    ${sEdit!==null?shapeForm():''}
    <table><thead><tr><th>Название / тип</th><th>Габарит</th><th>Кромок</th><th>Features</th><th>Статус</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">пусто</td></tr>'}</tbody></table>
    ${sEdit===null?`<div class='shape-new-row'><select id='s_new_type'>${presetOptions}</select><button class='pri' onclick='openShapeNew(document.getElementById("s_new_type").value)'>Новая фигура</button></div>`:''}`;
}

function openShapeNew(type){sEdit='new';sView='setup';sEdgeworkOpen=false;sFeaturesOpen=false;sDraft=newShapeDef(type||'smart');sDraft.name=shapePresetInfo(sDraft.type).label;render();}
function openShapeEdit(i){sEdit=i;sView='setup';sEdgeworkOpen=false;sFeaturesOpen=false;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(DB.shapeDef[i])));render();}
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
function setShapeExtra(id,v){if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:''};sDraft.smart.extraEdges[id].len=v;refreshShapeEditor();}
function setShapeView(v){sView=v;refreshShapeEditor();}
function toggleShapeSection(section){if(section==='edgework')sEdgeworkOpen=!sEdgeworkOpen;if(section==='features')sFeaturesOpen=!sFeaturesOpen;render();}

function setShapeType(type){
  type=shapeType(type);if(type===sDraft.type)return;
  var linked=Object.keys(sDraft.edgeOps||{}).length||(sDraft.features||[]).some(function(f){return f.type==='radius'||f.type==='hardware';});
  if(linked&&!confirm('Смена типа удалит привязанные к топологии радиусы, hardware prep и обработку кромок. Продолжить?')){render();return;}
  sDraft.type=type;sDraft.params=shapeDefaultParams(type);sDraft.edgeOps={};sDraft.features=(sDraft.features||[]).filter(function(f){return f.type!=='radius'&&f.type!=='hardware';});
  if(type==='polygon')sDraft.polygon=shapeNormalizePolygon(null);
  if(type==='circle')sDraft.h=sDraft.w;
  render();
}

function shapePreviewMarkup(r){
  if(sView==='production')return ShapeModule.productionSvg(r);
  if(sView==='cutting')return ShapeModule.cuttingSvg(r);
  return ShapeModule.productionSvg(r);
}
function shapeDerivedHTML(r){
  if(!r.valid){
    var errors=(r.errors&&r.errors.length?r.errors:[r.reason||'Invalid Shape']);
    return `<div class='validation-box badbox'><b>Ошибка геометрии</b>${errors.map(function(x){return '<div>'+esc(moduleErrorText({reason:x}))+'</div>';}).join('')}</div>`;
  }
  var req=r.requirements||[],warns=r.warns||[];
  return `<div class='smart-kpis'><div><span>Finished</span><b>${dimIn(r.width)} × ${dimIn(r.height)}</b></div><div><span>Net area</span><b>${(r.area/144).toFixed(2)} ft²</b></div><div><span>Perimeter</span><b>${dimIn(r.perimeter)}</b></div><div><span>Cut size</span><b>${dimIn(r.cutting.width)} × ${dimIn(r.cutting.height)}</b></div></div>
    <div class='shape-requirements'><b>Производственные требования</b>${req.length?req.map(function(q){return `<span><i>${esc(q.stationClass)}</i> ${esc(q.operation)}${q.edgeIds?' · '+esc(q.edgeIds.join(', ')):''}</span>`;}).join(''):'<span>Дополнительных операций нет</span>'}</div>
    ${warns.length?`<div class='validation-box warnbox'>${warns.map(function(w){return esc(moduleErrorText({reason:w}));}).join('<br>')}</div>`:`<div class='validation-box okbox'>Контур валиден · Production Drawing и Cutting Geometry синхронизированы · ${esc(r.fingerprint)}</div>`}`;
}
function refreshShapeEditor(){
  if(!sDraft)return;var r=shapeDraftResult(),p=document.getElementById('shapeLivePreview'),d=document.getElementById('shapeLiveDerived');
  if(p)p.innerHTML=shapePreviewMarkup(r);if(d)d.innerHTML=shapeDerivedHTML(r);
  document.querySelectorAll('[data-shape-view]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-shape-view')===sView);});
  if(p)applyLang(p);if(d)applyLang(d);
}

function shapeEdgeEditor(edge){
  var m=sDraft.smart,s=m[edge],vert=edge==='A'||edge==='C',name=edge==='A'?'A · Left / Height':edge==='B'?'B · Bottom / Width':'C · Right',shown=edge==='A'?sDraft.h:edge==='B'?sDraft.w:(s.len||'AUTO = A');
  if(!m.elbowsOn)return `<div class='edge-card'><div class='edge-card-head'><b>${name}</b><span>${esc(shown)}</span></div><div class='edge-fields'><div><label>Out of plumb / level</label><input value='${esc(s.out||'0')}' oninput='setShapeSimple("${edge}","out",this.value)'></div><div><label>Direction</label><select onchange='setShapeSimple("${edge}","dir",this.value)'><option value=''>—</option>${(vert?[['left','Left'],['right','Right']]:[['up','Up'],['down','Down']]).map(function(x){return `<option value='${x[0]}' ${s.dir===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div></div></div>`;
  var E=s.elbow;return `<div class='edge-card'><div class='edge-card-head'><b>${name}</b><span>${esc(shown)}</span></div><div class='edge-fields four'><div><label>Outage to elbow</label><input value='${esc(E.to)}' oninput='setShapeElbow("${edge}","to",this.value)'></div><div><label>Elbow length</label><input value='${esc(E.elbowLen)}' oninput='setShapeElbow("${edge}","elbowLen",this.value)'></div><div><label>Outage past elbow</label><input value='${esc(E.past)}' oninput='setShapeElbow("${edge}","past",this.value)'></div><div><label>Elbow form</label><select onchange='setShapeElbow("${edge}","mode",this.value)'><option value=''>—</option>${SS_MODES.map(function(x){return `<option value='${x.id}' ${E.mode===x.id?'selected':''}>${x.id.toUpperCase()} · ${x.s1>0?'+':'−'} / ${x.s2>0?'+':'−'}</option>`;}).join('')}</select></div></div></div>`;
}
function shapeSmartControls(){
  var S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;var map=ssEdgeMap(S).all;
  return `<div class='shape-mode-row'><span>Edge mode</span><button class='${!sDraft.smart.elbowsOn?'on':''}' onclick='setShapeElbows(false)'>Hide elbows · simple skew</button><button class='${sDraft.smart.elbowsOn?'on':''}' onclick='setShapeElbows(true)'>Show elbows · compound</button></div>
    <div class='edge-stack'>${['A','B','C'].map(shapeEdgeEditor).join('')}</div>
    <div class='corner-title'><b>Corner blocks</b><span>Single = 2 edges · Double = 4 · Triple = 6</span></div><div class='corner-grid corner-type-grid'>${SS_ORDER.map(function(c){return `<div class='corner-card'><div class='corner-card-head'><b>${c.toUpperCase()}</b><select onchange='setShapeCorner("${c}",this.value)'>${SS_CORNERS.map(function(x){return `<option value='${x[0]}' ${sDraft.smart.corners[c]===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div></div>`;}).join('')}</div>
    <div class='extra-edges'><div class='corner-title'><b>Corner edge dimensions</b><span>E / F / G…</span></div>${map.length?`<div class='extra-grid'>${map.map(function(e){return `<div><label>${e.id} · ${e.corner.toUpperCase()} · ${e.axis==='v'?'Vertical':'Horizontal'}</label><input value='${esc((sDraft.smart.extraEdges[e.id]||{}).len||'')}' oninput='setShapeExtra("${e.id}",this.value)'></div>`;}).join('')}</div>`:`<div class='empty compact'>Select Single / Double / Triple to create corner edge dimensions</div>`}</div>
    <div class='corner-title'><b>Corner blocks · Out of plumb / level</b><span>finished corner coordinates</span></div><div class='corner-grid'>${SS_ORDER.map(function(c){var o=sDraft.smart.cornerOffsets[c];return `<div class='corner-card'><div class='corner-card-head'><b>${c.toUpperCase()}</b><small>corner coordinate</small></div><div class='corner-offset'><label>Out of plumb<input value='${esc(o.plumb||'0')}' oninput='setShapeCornerOffset("${c}","plumb",this.value)'></label><select aria-label='${c.toUpperCase()} plumb direction' onchange='setShapeCornerOffset("${c}","plumbDir",this.value)'><option value=''>—</option><option value='left' ${o.plumbDir==='left'?'selected':''}>←</option><option value='right' ${o.plumbDir==='right'?'selected':''}>→</option></select></div><div class='corner-offset'><label>Out of level<input value='${esc(o.level||'0')}' oninput='setShapeCornerOffset("${c}","level",this.value)'></label><select aria-label='${c.toUpperCase()} level direction' onchange='setShapeCornerOffset("${c}","levelDir",this.value)'><option value=''>—</option><option value='up' ${o.levelDir==='up'?'selected':''}>↑</option><option value='down' ${o.levelDir==='down'?'selected':''}>↓</option></select></div></div>`;}).join('')}</div>`;
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
function toggleShapeEdgeOp(groupIndex,opIndex,on){
  var g=shapeGroupAt(groupIndex),type=SHAPE_EDGE_OPS[opIndex];if(!g||!type)return;if(!sDraft.edgeOps)sDraft.edgeOps={};var list=(sDraft.edgeOps[g.id]||[]).slice();
  list=list.filter(function(x){return x.type!==type;});if(on)list.push(shapeNormalizeOp({type:type}));if(list.length)sDraft.edgeOps[g.id]=list;else delete sDraft.edgeOps[g.id];render();
}
function setShapeOpParam(groupIndex,type,k,v){var op=shapeOperationAt(groupIndex,type);if(op)op[k]=v;refreshShapeEditor();}
function shapeEdgeworkEditor(){
  var groups=shapeGroups();if(!groups.length)return `<div class='validation-box badbox'>Сначала исправь основной контур — кромки не определены.</div>`;
  var operationCount=Object.keys(sDraft.edgeOps||{}).reduce(function(n,id){return n+(sDraft.edgeOps[id]||[]).length;},0),short=['Rough','Flat','CNC','Miter','Bevel'];
  return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("edgework")'><span><b>Обработка кромок</b><small>${groups.length} физических кромок · allowance и маршрут</small></span><span class='shape-accordion-state'>${operationCount?operationCount+' операций':'без обработки'}<i>${sEdgeworkOpen?'−':'+'}</i></span></button>${sEdgeworkOpen?`<div class='shape-edgework-scroll'><div class='shape-edgework-matrix'><div class='shape-edgework-row shape-edgework-labels'><span>Кромка</span>${short.map(function(x){return '<span>'+x+'</span>';}).join('')}</div>${groups.map(function(g,gi){
    var ops=(sDraft.edgeOps||{})[g.id]||[],has=function(t){return ops.some(function(o){return o.type===t;});},miter=ops.find(function(o){return o.type==='Mitering';}),bevel=ops.find(function(o){return o.type==='Beveling';});
    return `<div class='shape-edgework-row'><span class='shape-edge-code'><b>${esc(g.id)}</b><small>${dimIn(g.length)}</small></span>${SHAPE_EDGE_OPS.map(function(t,oi){return `<label class='shape-op-compact ${has(t)?'on':''}' title='${esc(t)}'><input type='checkbox' ${has(t)?'checked':''} onchange='toggleShapeEdgeOp(${gi},${oi},this.checked)'><span>${short[oi]}</span></label>`;}).join('')}${miter||bevel?`<div class='shape-edge-params'>${miter?`<label>Miter<select onchange='setShapeOpParam(${gi},"Mitering","angle",this.value)'><option value='45' ${+miter.angle===45?'selected':''}>45°</option><option value='22.5' ${+miter.angle===22.5?'selected':''}>22.5°</option></select></label>`:''}${bevel?`<label>Bevel width<input value='${esc(bevel.width)}' oninput='setShapeOpParam(${gi},"Beveling","width",this.value)'></label>`:''}</div>`:''}</div>`;
  }).join('')}</div></div>`:''}</div>`;
}

function addShapeFeature(type){var geo=shapeDraftGeometry();sFeaturesOpen=true;sDraft.features.push(newShapeFeature(type,geo));render();}
function setShapeFeature(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;refreshShapeEditor();}
function setShapeFeatureAndRender(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;render();}
function removeShapeFeature(i){sDraft.features.splice(i,1);render();}
function shapeFeatureFields(f,i,geo){
  function input(label,k){return `<label>${label}<input value='${esc(f[k])}' oninput='setShapeFeature(${i},"${k}",this.value)'></label>`;}
  if(f.type==='hole')return input('Diameter','diameter')+input('X from origin','x')+input('Y from origin','y')+input('Min edge clearance','minEdge');
  if(f.type==='cutout')return input('Width','width')+input('Height','height')+input('X from origin','x')+input('Y from origin','y')+input('Corner radius','cornerRadius');
  if(f.type==='stamp')return input('X from origin','x')+input('Y from origin','y')+input('Stamp text','text');
  if(f.type==='radius')return `<label>Physical vertex<select onchange='setShapeFeatureAndRender(${i},"vertexId",this.value)'>${(geo.vertices||[]).map(function(v){return `<option value='${esc(v.id)}' ${v.id===f.vertexId?'selected':''}>${esc(v.id+' · '+v.label)}</option>`;}).join('')}</select></label>`+input('Radius','radius');
  if(f.type==='hardware')return input('Template / name','name')+`<label>Physical edge<select onchange='setShapeFeatureAndRender(${i},"edgeId",this.value)'>${shapeEdgeGroups(geo).map(function(e){return `<option value='${esc(e.id)}' ${e.id===f.edgeId?'selected':''}>${esc(e.id+' · '+dimIn(e.length))}</option>`;}).join('')}</select></label>`+input('Distance along edge','distance')+input('Inset','inset')+input('Prep width','prepWidth')+input('Prep height','prepHeight')+input('Hole diameter','holeDia');
  return '';
}
function shapeFeaturesEditor(geo){
  var titles={hole:'Отверстие',cutout:'Внутренний вырез',radius:'Радиус вершины',hardware:'Hardware prep',stamp:'Маркировка'};
  var count=sDraft.features.length;return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("features")'><span><b>Features и технологические элементы</b><small>Отверстия, вырезы, радиусы, hardware и stamp</small></span><span class='shape-accordion-state'>${count?count+' элементов':'нет элементов'}<i>${sFeaturesOpen?'−':'+'}</i></span></button>${sFeaturesOpen?`<div class='shape-accordion-body'><div class='shape-feature-add'><button class='sm' onclick='addShapeFeature("hole")'>+ Отверстие</button><button class='sm' onclick='addShapeFeature("cutout")'>+ Вырез</button>${(geo.vertices||[]).length?`<button class='sm' onclick='addShapeFeature("radius")'>+ Радиус</button>`:''}<button class='sm' onclick='addShapeFeature("hardware")'>+ Hardware</button><button class='sm' onclick='addShapeFeature("stamp")'>+ Stamp</button></div><div class='shape-feature-list'>${count?sDraft.features.map(function(f,i){return `<div class='shape-feature-card'><div class='shape-edgework-head'><b>${esc(titles[f.type]||f.type)}</b><span class='mono'>${esc(f.id)}</span><button class='sm dl' onclick='removeShapeFeature(${i})'>×</button></div><div class='shape-feature-fields'>${shapeFeatureFields(f,i,geo)}</div></div>`;}).join(''):'<div class="empty compact">Features не добавлены</div>'}</div></div>`:''}</div>`;
}

function shapeArtifacts(r){
  var disabled=r.valid?'':'disabled';
  return `<div class='shape-artifacts'><b>Файлы текущей ревизии</b><button ${disabled} onclick='downloadShapeArtifact("production")'>Production SVG</button><button ${disabled} onclick='downloadShapeArtifact("cutting")'>Cutting SVG</button><button ${disabled} onclick='downloadShapeArtifact("json")'>Machine JSON</button><button ${disabled} onclick='downloadShapeArtifact("dxf")'>Generic DXF</button><small>DXF — нейтральная геометрия R12, не машинный постпроцессор. Перед производством нужен проверенный постпроцессор конкретного CNC.</small></div>`;
}
function shapeForm(){
  var r=shapeDraftResult(),geo=shapeDraftGeometry(),presetOptions=SHAPE_PRESETS.map(function(p){return `<option value='${p.id}' ${p.id===sDraft.type?'selected':''}>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  return `<div class='module-editor'><div class='module-editor-head'><div><h3>${sEdit==='new'?'Новая производственная фигура':'Изменение фигуры'}</h3><p>Все размеры — finished size в дюймах; толщина — в миллиметрах. Невалидная геометрия не сохраняется и не экспортируется.</p></div><span class='pill ok'>schema v2 · fail closed</span></div>
    <div class='shape-editor-layout'><div class='shape-controls'>
      <div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div><div><label>${sDraft.type==='circle'?'Diameter':'B · Width'}</label><input value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'></div>${sDraft.type==='circle'?'':`<div><label>A · Height</label><input value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`}<div><label>Glass thickness, mm</label><input type='number' min='1' step='1' value='${esc(sDraft.thickness)}' oninput='setShapeField("thickness",this.value)'></div>${sDraft.type==='smart'?`<div><label>C · Right height</label><input value='${esc(sDraft.smart.C.len||'')}' placeholder='= A' oninput='setShapeC(this.value)'></div>`:''}</div>
      ${sDraft.type==='smart'?shapeSmartControls():shapeGenericControls()}
      ${shapeEdgeworkEditor()}
      ${shapeFeaturesEditor(geo)}
    </div><div class='shape-preview-side'><div class='shape-view-tabs'><button data-shape-view='setup' class='${sView==='setup'?'on':''}' onclick='setShapeView("setup")'>Setup</button><button data-shape-view='production' class='${sView==='production'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button data-shape-view='cutting' class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting Shape</button></div><div id='shapeLivePreview' class='shape-drawing-preview'>${shapePreviewMarkup(r)}</div><div id='shapeLiveDerived'>${shapeDerivedHTML(r)}</div>${shapeArtifacts(r)}</div></div>
    <div class='err' id='e_shape'></div><div class='row'><button class='pri' onclick='saveShape()'>Сохранить ревизию</button><button onclick='sEdit=null;sDraft=null;render()'>Отмена</button></div></div>`;
}

function saveShape(){
  var e=document.getElementById('e_shape');e.style.display='none';sDraft.name=String(sDraft.name||'').trim();if(!sDraft.name)return fail(e,'Укажи название');
  var r=ShapeModule.compute(sDraft);if(!r.valid)return fail(e,(r.errors||[r.reason]).map(function(x){return moduleErrorText({reason:x});}).join(' · '));
  var prior=sEdit==='new'?null:DB.shapeDef[sEdit],used=prior&&DB.muntinDef.some(function(m){return m.shapeId===prior.id;});
  if(used&&shapeFingerprint(prior)!==r.fingerprint&&!confirm('Эта фигура используется в Muntinbar. Новая геометрия изменит связанную раскладку. Сохранить новую ревизию?'))return;
  var saved=r.definition;saved.name=sDraft.name;saved.revision=prior?(prior.revision||0)+1:1;saved.status='draft';
  if(sEdit==='new')DB.shapeDef.push(saved);else DB.shapeDef[sEdit]=saved;sEdit=null;sDraft=null;touch();render();
}
function shapeSafeFileName(s){return String(s||'shape').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'shape';}
function shapeDownload(textValue,mime,name){var b=new Blob([textValue],{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function downloadShapeArtifact(kind){
  var r=shapeDraftResult();if(!r.valid)return alert(moduleErrorText(r));var base=shapeSafeFileName(r.definition.name)+'_R'+(r.definition.revision||0);
  if(kind==='production')shapeDownload(ShapeModule.productionSvg(r),'image/svg+xml',base+'_production.svg');
  if(kind==='cutting')shapeDownload(ShapeModule.cuttingSvg(r),'image/svg+xml',base+'_cutting.svg');
  if(kind==='json')shapeDownload(JSON.stringify(ShapeModule.machinePayload(r),null,2),'application/json',base+'_machine.json');
  if(kind==='dxf')shapeDownload(ShapeModule.genericDxf(r),'application/dxf',base+'_generic.dxf');
}
function delShape(i){var s=DB.shapeDef[i];if(DB.muntinDef.some(function(m){return m.shapeId===s.id;}))return alert('Нельзя удалить — фигура используется в Muntinbar');if(!confirm('Удалить фигуру?'))return;DB.shapeDef.splice(i,1);touch();render();}
