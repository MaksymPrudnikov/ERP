/* =====================================================================
   erp/views/shape-production-ui · production workflow extension
   Экран Shape остаётся отдельным от Sales/Service Set. Здесь только UX
   finished geometry -> edge processing -> manufacturing -> cutting.
   ===================================================================== */

let shapeProdExceptionsOpen=false,shapeProdSelectedEdgeId=null;

function shapeProdResetUi(){
  shapeProdExceptionsOpen=false;shapeProdSelectedEdgeId=null;
  sEdgeworkOpen=false;sFeaturesOpen=false;sManufacturingOpen=false;
  sManufacturingPlace=null;sManufacturingSelected=null;sSourceOpen=false;
  sManufacturingCustomId=null;sDimEdit=null;
}
function shapeProdHasGeometryBoundData(){
  return !!(Object.keys((sDraft&&sDraft.edgeOps)||{}).length||
    ((sDraft&&sDraft.manufacturingItems)||[]).length||
    ((sDraft&&sDraft.features)||[]).length);
}
function shapeProdClearGeometryBoundData(){
  if(!sDraft)return;
  sDraft.edgeOps={};sDraft.manufacturingItems=[];sDraft.features=[];
  sManufacturingPlace=null;sManufacturingSelected=null;
  shapeProdSelectedEdgeId=null;shapeProdExceptionsOpen=false;
}
function shapeProdStripStaleSegments(){
  if(!sDraft||shapeIsDxfSource(sDraft)||!sDraft.edgeOps)return;
  Object.keys(sDraft.edgeOps).forEach(function(id){if(/^seg\d+$/i.test(id))delete sDraft.edgeOps[id];});
  (sDraft.manufacturingItems||[]).forEach(function(item){if(item&&item.edgeId&&/^seg\d+$/i.test(item.edgeId))delete item.edgeId;});
}

/* ---------- Safety Border ----------
   Отступ для безопасной резки и ломки вдоль скошенных и дуговых кромок.
   В контур реза не входит — только сообщает раскрою, сколько места оставить.
   Пустое поле = AUTO по толщине, введённое число = OVERRIDE. */
function shapeProdBorderPlan(){
  if(!sDraft)return null;
  /* У DXF-источника своя ветка расчёта — обычный compute для него закрыт. */
  var r=shapeIsDxfSource(sDraft)?ShapeModule.dxfProductionResult(sDraft):ShapeModule.compute(sDraft);
  if(!(r&&r.cutting&&r.cutting.valid))return null;
  return {plan:r.cutting.safetyBorder,cut:r.cutting,fw:r.width,fh:r.height};
}
function setShapeSafetyBorder(v){if(sDraft)sDraft.safetyBorder=String(v==null?'':v);render();}
function setShapeSafetyBorderEdge(id,v){
  if(!sDraft)return;
  if(!sDraft.safetyBorderEdges)sDraft.safetyBorderEdges={};
  var t=String(v==null?'':v).trim();
  if(t)sDraft.safetyBorderEdges[id]=t;else delete sDraft.safetyBorderEdges[id];
  render();
}
function resetShapeSafetyBorder(){if(sDraft){sDraft.safetyBorder='';sDraft.safetyBorderEdges={};}render();}
function shapeBorderEdgeLabel(id){
  var d=typeof salesSetSideDescription==='function'?salesSetSideDescription(id):'';
  return d||'Physical edge';
}
function shapeProdBorderField(){
  var ctx=shapeProdBorderPlan();
  if(!ctx)return '';
  var plan=ctx.plan,cut=ctx.cut,fp=cut.footprint||{width:cut.width,height:cut.height};
  var ov=(sDraft&&sDraft.safetyBorderEdges)||{};
  /* Откуда и куда: готовый размер → плюс припуск кромки → размер реза →
     плюс бордер → оплачиваемый габарит. Без этой цепочки непонятно, какое
     число откуда берётся. */
  var chain=`<div class='shape-border-chain'>`+
    `<span><i>Finished</i><b>${esc(dimIn16(ctx.fw))} × ${esc(dimIn16(ctx.fh))}</b></span>`+
    `<em>+ edge allowance</em>`+
    `<span><i>Cut</i><b>${esc(dimIn16(cut.width))} × ${esc(dimIn16(cut.height))}</b></span>`+
    `<em>+ safety border</em>`+
    `<span><i>Billable</i><b>${esc(dimIn16(fp.width))} × ${esc(dimIn16(fp.height))}</b></span>`+
    `</div>`;
  var rows=plan.edges.map(function(e){
    var id=String(e.id),v=ov[id]==null?'':ov[id];
    var tag=e.state==='OVERRIDE'?`<span class='pill info'>MANUAL</span>`
      :e.angled?`<span class='pill ok'>AUTO</span>`:`<span class='pill'>—</span>`;
    return `<div class='shape-border-row'><b>${esc(id)}</b><span>${esc(shapeBorderEdgeLabel(id))}</span>`+
      `<input value='${esc(v)}' placeholder='${esc(e.angled?dimIn16(plan.base):'—')}' oninput='setShapeSafetyBorderEdge("${esc(id)}",this.value)'>`+
      `${tag}<i>${e.value>0?esc(dimIn16(e.value)):''}</i></div>`;
  }).join('');
  return `<div class='shape-prod-border'>
    <div class='shape-border-head'><b>Safety Border</b><label>Base<input value='${esc(sDraft.safetyBorder||'')}' placeholder='${esc(dimIn16(plan.autoValue))}' oninput='setShapeSafetyBorder(this.value)'></label>${plan.state==='OVERRIDE'?`<button type='button' class='sm' onclick='resetShapeSafetyBorder()'>Reset to calculated</button>`:`<span class='pill ok'>AUTO</span>`}</div>
    ${chain}
    <div class='shape-border-rows'>${rows}</div>
    <small>${plan.manualRequired
      ? 'No automatic value for this thickness — enter the border manually.'
      : 'Base value goes to angled and curved edges automatically. Any edge can be set by hand. Nesting clearance, never cut.'}</small>
  </div>`;
}

/* Configurators — рабочее место; сохранённый master-list остаётся доступен,
   но не создаёт постоянную визуальную «свалку». */
viewShapeSkill=function(){
  if(sEdit!==null)return shapeForm();
  /* Формы, принадлежащие строкам заказа, в этот список не попадают: каждая
     строка с размерами заводит свой прямоугольник, и двести строк сделали бы
     список нечитаемым. Такая форма открывается из своей строки. */
  var library=DB.shapeDef.map(function(s,i){return {s:s,i:i};}).filter(function(x){return !salesShapeIsLineOwned(x.s);});
  var rows=library.map(function(x){
    var s=x.s,i=x.i;
    var r=ShapeModule.compute(s),p=shapePresetInfo(s.type),external=shapeIsDxfSource(s),featureCount=(s.features||[]).filter(function(f){return f.type!=='radius';}).length;
    var ready=external?(r.sourceValid!==false):(r.valid!==false),state=ready?'<span class="pill ok">Ready</span>':'<span class="pill bad">'+esc(moduleErrorText(r))+'</span>';
    var size=external?(r.sourceValid===false?'<span class="bad pill">Invalid</span>':dimIn16(r.width)+' × '+dimIn16(r.height)):(r.valid?dimIn16(r.width)+' × '+dimIn16(r.height):'<span class="bad pill">Invalid</span>');
    return `<tr><td><div class='shape-name-line'><b>${raw(s.name)}</b>${external?'<span class="pill info shape-source-pill">DXF</span>':''}</div><small class='shape-row-meta'>${esc(p.code+' · '+p.label)} · Rev ${s.revision||0}</small></td><td class='mono'>${size}</td><td class='mono'>${external?'—':(r.valid?r.edges.length:'—')}</td><td class='mono'>${external?'—':featureCount}</td><td>${state}</td><td class='shape-actions'><button class='sm' onclick='openShapeEdit(${i})'>Edit</button><button class='sm dl' onclick='delShape(${i})'>×</button></td></tr>`;
  }).join('');
  var opts=SHAPE_PRESETS.map(function(p){return `<option value='${esc(p.id)}'>${esc(p.code+' · '+p.label)}</option>`;}).join('')+`<option value='__DXF__'>DXF · Fusion 360</option>`;
  return `<div class='shape-workspace-empty'><div><b>Production Shape workspace</b><span>Create or open a reusable Production Shape. Order Shapes are normally opened from their Sales Order line.</span></div><div class='shape-new-row'><select id='s_new_type'>${opts}</select><button class='pri' onclick='shapeProdOpenNew(document.getElementById("s_new_type").value)'>New Shape</button></div></div>
    <details class='shape-saved-details'><summary>Saved Shapes <span class='pill info'>${library.length}</span></summary><div class='shape-saved-table'><table><thead><tr><th>Name / type</th><th>Size</th><th>Edges</th><th>Features</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">No saved Shapes.</td></tr>'}</tbody></table></div></details>`;
};
function shapeProdOpenNew(type){
  if(type==='__DXF__'){
    openShapeNew('rectangle');
    setTimeout(function(){var el=document.getElementById('shape_prod_dxf_pick');if(el)el.click();},0);
    return;
  }
  openShapeNew(type);
}

const __shapeProdOpenNew=openShapeNew;
openShapeNew=function(type){shapeProdResetUi();return __shapeProdOpenNew(type);};
const __shapeProdOpenEdit=openShapeEdit;
openShapeEdit=function(i){shapeProdResetUi();return __shapeProdOpenEdit(i);};
const __shapeProdSalesConfigureShape=salesOrderConfigureShape;
salesOrderConfigureShape=function(i){shapeProdResetUi();return __shapeProdSalesConfigureShape(i);};

/* ---------- Geometry/source safety ---------- */
setShapeType=function(type){
  type=shapeType(type);if(!sDraft||type===sDraft.type&&!shapeIsDxfSource(sDraft))return;
  var changing=shapeIsDxfSource(sDraft)||type!==sDraft.type;
  if(changing&&shapeProdHasGeometryBoundData()&&!confirm('Changing the physical geometry will clear edge processing, Manufacturing Items and geometry modifiers. Continue?')){render();return;}
  if(changing)shapeProdClearGeometryBoundData();
  if(shapeIsDxfSource(sDraft))sDraft.source=shapeNormalizeSource(null);
  sDraft.type=type;sDraft.params=shapeDefaultParams(type);
  if(type==='polygon')sDraft.polygon=shapeNormalizePolygon(null);
  if(type==='circle')sDraft.h=sDraft.w;
  render();
};

shapeAttachDxf=function(input){
  var file=input&&input.files&&input.files[0];if(!file)return;
  if(!/\.dxf$/i.test(String(file.name||''))){alert('Choose a DXF file.');input.value='';return;}
  if(!(file.size>0)){alert('DXF file is empty.');input.value='';return;}
  var reader=new FileReader();
  reader.onerror=function(){input.value='';alert('DXF file could not be read.');};
  reader.onload=function(){
    var parsed=shapeParseFusionDxf(String(reader.result||''));
    if(!parsed.ok){input.value='';alert(parsed.error||'DXF file could not be parsed.');return;}
    var oldTopology=shapeIsDxfSource(sDraft)?ShapeModule.dxfTopologyFingerprint(sDraft):'',newTopology=ShapeModule.dxfTopologyFingerprint(parsed.preview),geometryChanged=!oldTopology||oldTopology!==newTopology;
    if(geometryChanged&&shapeProdHasGeometryBoundData()&&!confirm('This DXF changes the physical contour. Existing edge processing, Manufacturing Items and geometry modifiers will be cleared. Continue?')){input.value='';render();return;}
    if(geometryChanged)shapeProdClearGeometryBoundData();
    var note=sDraft&&sDraft.source?String(sDraft.source.note||''):'';
    sDraft.source={kind:'dxf',fileName:String(file.name),fileSize:Math.floor(file.size),uploadedAt:new Date().toISOString(),note:note,preview:parsed.preview};
    sDraft.w=frac64(parsed.preview.width16/16);sDraft.h=frac64(parsed.preview.height16/16);
    if(!sDraft.thickness)sDraft.thickness='6';sView='production';sSourceOpen=false;render();
  };
  reader.readAsText(file);
};
removeShapeDxf=function(){
  if(!sDraft||!shapeIsDxfSource(sDraft))return;
  if(shapeProdHasGeometryBoundData()&&!confirm('Removing the DXF will clear edge processing, Manufacturing Items and geometry modifiers tied to this contour. Continue?')){render();return;}
  shapeProdClearGeometryBoundData();sDraft.source=shapeNormalizeSource(null);sView='setup';render();
};

/* ---------- Compact master/source ---------- */
function shapeProdTypeOptions(){
  return SHAPE_PRESETS.map(function(p){return `<option value='${esc(p.id)}' ${!shapeIsDxfSource(sDraft)&&p.id===sDraft.type?'selected':''}>${esc(p.code+' · '+p.label)}</option>`;}).join('')+
    `<option value='__DXF__' ${shapeIsDxfSource(sDraft)?'selected':''}>DXF · Fusion 360</option>`;
}
function shapeProdChooseType(value){
  if(value==='__DXF__'){
    if(shapeIsDxfSource(sDraft))return;
    var input=document.getElementById('shape_prod_dxf_pick');if(input)input.click();return;
  }
  setShapeType(value);
}
function shapeProdDxfFileRow(){
  if(!shapeIsDxfSource(sDraft))return `<input id='shape_prod_dxf_pick' type='file' accept='.dxf,application/dxf' hidden onchange='shapeAttachDxf(this)'>`;
  var src=shapeNormalizeSource(sDraft.source);
  return `<div class='shape-prod-source-line'><span>DXF</span><b class='shape-dxf-name'>${raw(src.fileName||'—')}</b><span>${esc(shapeFileSizeText(src.fileSize))}</span><span class='sp'></span><label class='shape-file-pick'><input id='shape_prod_dxf_pick' type='file' accept='.dxf,application/dxf' onchange='shapeAttachDxf(this)'><span>Replace</span></label><button type='button' onclick='removeShapeDxf()'>Remove</button></div>`;
}
function shapeProdMasterFields(){
  var external=shapeIsDxfSource(sDraft),common=`<div><label>Name *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Shape type</label><select onchange='shapeProdChooseType(this.value)'>${shapeProdTypeOptions()}</select>${external?'':shapeProdDxfFileRow()}</div>`;
  if(external)return `<div class='grid shape-master-fields shape-prod-master'>${common}<div><label>Width</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.width16||0)/16))}'></div><div><label>Height</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.height16||0)/16))}'></div></div>${shapeProdDxfFileRow()}`;
  return `<div class='grid shape-master-fields shape-prod-master'>${common}${shapeMasterSizeFields()}</div>`;
}

/* ---------- Edge processing: shared invariant ---------- */
function shapeProdDefaultOp(type){
  if(type==='Mitering')return shapeNormalizeOp({type:type,angle:45,side:'back'});
  if(type==='Beveling')return shapeNormalizeOp({type:type,width:'1',side:'front'});
  return shapeNormalizeOp({type:type});
}
function shapeProdToggleOps(list,type,on){
  list=(Array.isArray(list)?list:[]).map(shapeNormalizeOp).filter(Boolean).filter(function(op){return op.type!==type;});
  if(on){
    if(SHAPE_PRIMARY_FINISHES.indexOf(type)>=0)list=list.filter(function(op){return SHAPE_PRIMARY_FINISHES.indexOf(op.type)<0;});
    list.push(shapeProdDefaultOp(type));
  }
  return list;
}

/* Переопределения toggleShapeEdgeOp здесь больше нет: оно игнорировало выбранный
   лайт и молча перебивало правку в sales-shape-ui.js. Логика значений по
   умолчанию осталась в shapeProdToggleOps выше, её и зовёт единственная
   реализация переключателя. */
function shapeProdConfiguredUniform(type){
  var groups=shapeGroups();return !!groups.length&&groups.every(function(g){var f=shapePrimaryFinish(shapeEdgeOps(sDraft,g.id));return f&&f.type===type;});
}
/* AR · ALL AROUND — решение по всей форме, а значит и по всем её лайтам:
   собственная обработка лайтов снимается. Иначе кнопка отрабатывала молча:
   форма получала полировку, а лайт со своей старой обработкой продолжал
   уходить в производство и в счёт арисом. */
function shapeProdClearLiteFinishes(){
  if(!sDraft||!sDraft.lites)return;
  Object.keys(sDraft.lites).forEach(function(key){
    var spec=sDraft.lites[key];if(!spec||!spec.edgeOps)return;
    Object.keys(spec.edgeOps).forEach(function(id){delete spec.edgeOps[id];});
  });
}
function shapeProdApplyConfiguredAR(type){
  if(!sDraft.edgeOps)sDraft.edgeOps={};shapeGroups().forEach(function(g){var list=shapeTogglePrimaryFinish(sDraft.edgeOps[g.id]||[],type,true);if(list.length)sDraft.edgeOps[g.id]=list;else delete sDraft.edgeOps[g.id];});shapeProdClearLiteFinishes();render();
}
function shapeProdClearConfiguredAR(){
  shapeGroups().forEach(function(g){var list=(sDraft.edgeOps[g.id]||[]).filter(function(op){return SHAPE_PRIMARY_FINISHES.indexOf(op.type)<0;});if(list.length)sDraft.edgeOps[g.id]=list;else delete sDraft.edgeOps[g.id];});shapeProdClearLiteFinishes();render();
}
function shapeProdConfiguredArBar(){
  var groups=shapeGroups();if(!groups.length)return'';
  return `<div class='shape-prod-ar'><div class='shape-prod-ar-head'><b>AR · ALL AROUND</b><span>Primary finish · ${groups.length} physical edges</span></div><div class='shape-prod-ar-actions'><button class='${shapeProdConfiguredUniform('Rough Arris')?'on':''}' onclick='shapeProdApplyConfiguredAR("Rough Arris")'>AR · Arris</button><button class='${shapeProdConfiguredUniform('Flat Polish')?'on':''}' onclick='shapeProdApplyConfiguredAR("Flat Polish")'>AR · Polish</button><button class='${shapeProdConfiguredUniform('CNC Shape Polish')?'on':''}' onclick='shapeProdApplyConfiguredAR("CNC Shape Polish")'>AR · CNC</button><button onclick='shapeProdClearConfiguredAR()'>Clear AR</button></div></div>`;
}
const __shapeProdEdgeworkEditor=shapeEdgeworkEditor;
shapeEdgeworkEditor=function(){
  var html=__shapeProdEdgeworkEditor();if(!sDraft||shapeIsDxfSource(sDraft)||!sEdgeworkOpen)return html;
  var bar=shapeProdConfiguredArBar(),needle="<div class='shape-edgework-scroll'>";
  return bar&&html.indexOf(needle)>=0?html.replace(needle,bar+needle):html;
};

function shapeProdDxfGroups(){
  if(!sDraft||!shapeIsDxfSource(sDraft))return[];
  var th=shapeThicknessMm(sDraft);
  return ShapeModule.dxfEdges(sDraft).map(function(edge){
    var ops=shapeEdgeOps(sDraft,edge.id).map(shapeNormalizeOp).filter(Boolean),a=ShapeModule.productionAllowanceForOps(ops,th);
    return Object.assign({},edge,{ops:ops,allowance:a.ok?a.value:null,allowanceError:a.ok?'':a.reason});
  });
}
function shapeProdSelectedDxfGroup(){
  var groups=shapeProdDxfGroups();if(!groups.length)return null;
  if(!groups.some(function(g){return g.id===shapeProdSelectedEdgeId;}))shapeProdSelectedEdgeId=groups[0].id;
  return groups.find(function(g){return g.id===shapeProdSelectedEdgeId;})||groups[0];
}
function shapeProdSetDxfEdge(id){shapeProdSelectedEdgeId=id;render();}
function shapeProdToggleDxfOp(edgeId,type,on){
  if(!sDraft.edgeOps)sDraft.edgeOps={};var list=shapeProdToggleOps(sDraft.edgeOps[edgeId]||[],type,on);
  if(list.length)sDraft.edgeOps[edgeId]=list;else delete sDraft.edgeOps[edgeId];render();
}
function shapeProdSetDxfOpParam(edgeId,type,key,value){
  var op=((sDraft.edgeOps&&sDraft.edgeOps[edgeId])||[]).find(function(x){return x.type===type;});if(!op)return;
  if(type==='Mitering'){
    if(key==='angle')op.angle=+value===22.5?22.5:45;
    if(key==='side')op.side=value==='front'?'front':'back';
  }else if(type==='Beveling'){
    if(key==='width'){if(!(inch(value)>0)){alert('Bevel width must be greater than zero.');render();return;}op.width=String(value);}
    if(key==='side')op.side=value==='back'?'back':'front';
  }
  render();
}
function shapeProdDxfUniform(type){
  var groups=shapeProdDxfGroups();return !!groups.length&&groups.every(function(g){var f=shapePrimaryFinish(g.ops);return f&&f.type===type;});
}
function shapeProdApplyDxfAR(type){
  if(!sDraft.edgeOps)sDraft.edgeOps={};ShapeModule.dxfEdges(sDraft).forEach(function(edge){var list=shapeTogglePrimaryFinish(sDraft.edgeOps[edge.id]||[],type,true);if(list.length)sDraft.edgeOps[edge.id]=list;else delete sDraft.edgeOps[edge.id];});shapeProdExceptionsOpen=false;render();
}
function shapeProdClearDxfAR(){
  ShapeModule.dxfEdges(sDraft).forEach(function(edge){var list=(sDraft.edgeOps[edge.id]||[]).filter(function(op){return SHAPE_PRIMARY_FINISHES.indexOf(op.type)<0;});if(list.length)sDraft.edgeOps[edge.id]=list;else delete sDraft.edgeOps[edge.id];});shapeProdExceptionsOpen=false;render();
}
function shapeProdDxfParams(edge){
  var m=edge.ops.find(function(op){return op.type==='Mitering';}),b=edge.ops.find(function(op){return op.type==='Beveling';});if(!m&&!b)return'';
  return `<div class='shape-prod-op-params'>${m?`<label>Miter angle<select onchange='shapeProdSetDxfOpParam("${esc(edge.id)}","Mitering","angle",this.value)'><option value='45' ${+m.angle===45?'selected':''}>45°</option><option value='22.5' ${+m.angle===22.5?'selected':''}>22.5°</option></select></label><label>Miter side<select onchange='shapeProdSetDxfOpParam("${esc(edge.id)}","Mitering","side",this.value)'><option value='back' ${(m.side||'back')==='back'?'selected':''}>Back mitre</option><option value='front' ${m.side==='front'?'selected':''}>Front mitre</option></select></label>`:''}${b?`<label>Bevel width<input value='${esc(b.width||'1')}' onchange='shapeProdSetDxfOpParam("${esc(edge.id)}","Beveling","width",this.value)'></label><label>Bevel side<select onchange='shapeProdSetDxfOpParam("${esc(edge.id)}","Beveling","side",this.value)'><option value='front' ${(b.side||'front')==='front'?'selected':''}>Front bevel</option><option value='back' ${b.side==='back'?'selected':''}>Back bevel</option></select></label>`:''}</div>`;
}
function shapeProdDxfEdgeProcessing(){
  var groups=shapeProdDxfGroups(),selected=shapeProdSelectedDxfGroup(),th=shapeThicknessMm(sDraft),count=groups.reduce(function(n,g){return n+g.ops.length;},0);
  return `<div class='shape-subsection shape-accordion shape-prod-edge'>
    <button type='button' class='shape-accordion-head' onclick='sEdgeworkOpen=!sEdgeworkOpen;render()'><span><b>Edge processing</b><small>Shape-owned processing · finished DXF → derived cutting allowance</small></span><span class='shape-accordion-state'>${count?count+' operations':'no processing'}<i>${sEdgeworkOpen?'−':'+'}</i></span></button>
    ${sEdgeworkOpen?`<div class='shape-accordion-body'><div class='shape-prod-thickness'><label>Shape thickness<select onchange='sDraft.thickness=this.value;render()'>${[3,4,5,6,8,10,12,15,19].map(function(n){return `<option value='${n}' ${th===n?'selected':''}>${n} mm</option>`;}).join('')}</select></label><small>Standalone Shape cutting only. Sales Makeup supplies runtime thickness later.</small></div>
      <div class='shape-prod-ar'><div class='shape-prod-ar-head'><b>AR · ALL AROUND</b><span>${groups.length} physical segments</span></div><div class='shape-prod-ar-actions'><button class='${shapeProdDxfUniform('Rough Arris')?'on':''}' onclick='shapeProdApplyDxfAR("Rough Arris")'>AR · Arris</button><button class='${shapeProdDxfUniform('Flat Polish')?'on':''}' onclick='shapeProdApplyDxfAR("Flat Polish")'>AR · Polish</button><button class='${shapeProdDxfUniform('CNC Shape Polish')?'on':''}' onclick='shapeProdApplyDxfAR("CNC Shape Polish")'>AR · CNC</button><button onclick='shapeProdClearDxfAR()'>Clear AR</button></div></div>
      ${selected?`<div class='shape-prod-selected'><span>Selected</span><b>${esc(selected.id.toUpperCase())} · ${esc(dimIn16(selected.length))}</b><span>${selected.allowance==null?'BLOCKED':selected.allowance?'+'+esc(dimIn16(selected.allowance)):'0″'}</span></div>`:''}
      <div class='shape-prod-exceptions'><button type='button' onclick='shapeProdExceptionsOpen=!shapeProdExceptionsOpen;render()'><span><b>Per-edge exceptions</b> · open only when a physical edge differs</span><i>${shapeProdExceptionsOpen?'−':'+'}</i></button>${shapeProdExceptionsOpen?`<div class='shape-prod-seg-head'><span>Edge</span><span>Processing</span><span>Allowance</span></div>${groups.map(function(edge){return `<div class='shape-prod-seg-row ${edge.id===shapeProdSelectedEdgeId?'on':''}' onclick='shapeProdSetDxfEdge("${esc(edge.id)}")'><div><b>${esc(edge.id.toUpperCase())}</b><small>${esc(dimIn16(edge.length))}</small></div><div class='shape-prod-opset'>${SHAPE_EDGE_OPS.map(function(type){var on=edge.ops.some(function(op){return op.type===type;});return `<label class='${on?'on':''}' onclick='event.stopPropagation()'><input type='checkbox' ${on?'checked':''} onchange='shapeProdToggleDxfOp("${esc(edge.id)}","${esc(type)}",this.checked)'><span>${esc(type==='Rough Arris'?'Rough':type==='Flat Polish'?'Flat':type==='CNC Shape Polish'?'CNC':type==='Mitering'?'Miter':'Bevel')}</span></label>`;}).join('')}${shapeProdDxfParams(edge)}</div><div class='shape-prod-allow ${edge.allowance==null?'bad':''}'><b>${edge.allowance==null?'BLOCKED':edge.allowance?'+'+esc(dimIn16(edge.allowance)):'0″'}</b><small>${esc(edge.allowanceError||edge.ops.map(function(op){return op.type;}).join(' + ')||'No processing')}</small></div></div>`;}).join('')}`:''}</div>
    </div>`:''}
  </div>`;
}

/* ---------- Exact DXF Manufacturing Items ---------- */
function shapeProdDxfEdgeById(id){return ShapeModule.dxfEdges(sDraft).find(function(e){return e.id===id;})||null;}
function shapeProdNearestDxfEdge(x,y){
  var best=null;ShapeModule.dxfEdges(sDraft).forEach(function(e){var dx=e.p2[0]-e.p1[0],dy=e.p2[1]-e.p1[1],L2=dx*dx+dy*dy;if(!(L2>1e-12))return;var t=((x-e.p1[0])*dx+(y-e.p1[1])*dy)/L2;t=Math.max(0,Math.min(1,t));var px=e.p1[0]+dx*t,py=e.p1[1]+dy*t,err=Math.hypot(x-px,y-py);if(!best||err<best.error)best={edgeId:e.id,distance:shapeSnapManufacturing16(t*e.length),error:err};});return best;
}
const __shapeProdManufacturingEdgePoint=shapeManufacturingEdgePoint;
shapeManufacturingEdgePoint=function(item,g){
  if(sDraft&&shapeIsDxfSource(sDraft)&&item&&item.edgeId){var p=ShapeModule.dxfManufacturingPoint(item,sDraft);if(!p)return null;return {x:p.point[0],y:p.point[1],edge:{edgeId:p.edge.id,start:p.edge.p1,end:p.edge.p2,len:p.edge.length},distance:p.distance};}
  return __shapeProdManufacturingEdgePoint(item,g);
};
const __shapeProdPlaceManufacturing=shapePlaceManufacturingFromEvent;
shapePlaceManufacturingFromEvent=function(ev,svg){
  if(!sManufacturingPlace||!sDraft||!shapeIsDxfSource(sDraft)||sManufacturingPlace.type==='hole')return __shapeProdPlaceManufacturing(ev,svg);
  var T=shapeDxfPreviewTransform(sDraft.source);if(!T)return;var rect=svg.getBoundingClientRect(),vx=(ev.clientX-rect.left)*T.vw/Math.max(1,rect.width),vy=(ev.clientY-rect.top)*T.vh/Math.max(1,rect.height),x=T.b.minX+(vx-T.x0)/T.sc,y=T.b.minY+(T.y0+T.dh-vy)/T.sc,snap=shapeProdNearestDxfEdge(x,y);if(!snap){alert('No valid DXF segment is available for this item.');return;}
  if(sManufacturingPlace.moveId){var moving=shapeManufacturingItems().find(function(v){return v.id===sManufacturingPlace.moveId;});if(moving){moving.edgeId=snap.edgeId;delete moving.edge;moving.distance=snap.distance;}}
  else shapeManufacturingItems().push(shapeNormalizeManufacturingItem({id:shapeNewEntityId('mi-'),type:sManufacturingPlace.type,note:'',edgeId:snap.edgeId,distance:snap.distance}));
  sManufacturingSelected=null;sManufacturingPlace=null;render();
};
function shapeProdSetManufacturingSegment(id,edgeId){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;}),edge=shapeProdDxfEdgeById(edgeId);if(!item||item.type==='hole'||!edge)return;item.edgeId=edgeId;delete item.edge;if((+item.distance||0)>edge.length)item.distance=shapeSnapManufacturing16(edge.length);render();
}
const __shapeProdSetManufacturingDistance=shapeSetManufacturingDistance;
shapeSetManufacturingDistance=function(id,value){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});
  if(item&&item.type!=='hole'&&item.edgeId&&sDraft&&shapeIsDxfSource(sDraft)){
    var parsed=fabParseDimStrict(value),edge=shapeProdDxfEdgeById(item.edgeId);if(!parsed.ok||!edge){alert('Enter a valid distance in inches.');render();return;}var d=shapeSnapManufacturing16(parsed.v);if(!isFinite(d)||d<0||d>edge.length+1e-9){alert('The distance must stay on the selected physical segment.');render();return;}
    item.distance=shapeMiRefIsEnd(id)?Math.max(0,shapeSnapManufacturing16(edge.length-d)):d;render();return;
  }
  return __shapeProdSetManufacturingDistance(id,value);
};
const __shapeProdManufacturingMarkers=shapeManufacturingMarkersSvg;
shapeManufacturingMarkersSvg=function(source,T){
  if(!sDraft||!shapeIsDxfSource(sDraft))return __shapeProdManufacturingMarkers(source,T);
  var items=shapeManufacturingItems();if(!items.length)return'';
  return items.map(function(item,i){var selected=item.id===sManufacturingSelected?' selected':'',label=shapeManufacturingShort(item.type);if(item.type==='hole'){var x=T.X(item.x),y=T.Y(item.y),d=fabParseDimStrict(item.diameter),dia=d.ok&&d.v>0?d.v:.75,r=Math.max(4,Math.min(14,dia*T.sc/2));return `<g class='shape-mi-marker hole${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";render()'><circle cx='${x}' cy='${y}' r='${r}'/><text x='${x+r+6}' y='${y-6}'>${esc(label)} · Ø ${esc(dimIn16(dia))}</text></g>`;}var pt=shapeManufacturingEdgePoint(item,{P:T.P,b:T.b});if(!pt)return'';var e=pt.edge,x=T.X(pt.x),y=T.Y(pt.y),ang=Math.atan2(T.Y(e.end[1])-T.Y(e.start[1]),T.X(e.end[0])-T.X(e.start[0]))*180/Math.PI,mark=item.type==='clamp'?`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-8' y='-8' width='16' height='16' rx='2'/><path d='M -3 -6 V 6 M 3 -6 V 6'/></g>`:`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-10' y='-6' width='20' height='12' rx='2'/><line x1='0' y1='-6' x2='0' y2='6'/></g>`;return `<g class='shape-mi-marker ${item.type}${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";render()'>${mark}<text data-raw x='${x+12}' y='${y-10}'>${esc(label+shapeMarkModelSuffix(item)+' · '+item.edgeId+' @ '+shapeDim16(shapeMiShownDistance(item,pt.edge&&pt.edge.len)))}</text></g>`;}).join('');
};
/* Список меток для фигуры из DXF. Отличие одно: метка привязана к конкретному
   физическому сегменту файла (SEG), а не к стороне габарита. Оболочка категории
   Cutout общая — она живёт в sales-shape-ui и здесь не дублируется. */
const __shapeProdMarksBody=shapeMarksBodyHTML;
shapeMarksBodyHTML=function(){
  if(!sDraft||!shapeIsDxfSource(sDraft))return __shapeProdMarksBody();
  var items=shapeManufacturingItems(),placing=sManufacturingPlace,edges=ShapeModule.dxfEdges(sDraft);
  var body=shapeMarksToolbarHTML('Hardware binds to an exact physical SEG. Hole keeps coordinate references.');
  if(placing)body+=`<div class='shape-mi-place'><b>${placing.moveId?'Move':'Add'}: ${raw(shapeManufacturingItemTitle(placing.type))}</b><span>${placing.type==='hole'?'Click inside the glass.':'Click near the exact DXF segment.'}</span><button class='sm' onclick='shapeCancelManufacturingPlacement()'>Cancel</button></div>`;
  body+=`<div class='shape-mi-list'>${items.length?items.map(function(item,i){
    var expanded=item.id===sManufacturingSelected,summary='',fields='';
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),pos=shapeManufacturingHolePosition(item,shapeManufacturingGeometry())||{hRef:'left',vRef:'bottom',hDistance:0,vDistance:0};
      summary='Ø '+(d&&d.ok?dimIn16(d.v):item.diameter)+' · '+shapeManufacturingEdgeLabel(pos.hRef)+' '+shapeDim16(pos.hDistance)+' · '+shapeManufacturingEdgeLabel(pos.vRef)+' '+shapeDim16(pos.vDistance);
      fields=`<div class='shape-mi-hole-position-grid'><div class='shape-mi-axis-card'><label>Horizontal reference<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","h",this.value)'><option value='left' ${pos.hRef==='left'?'selected':''}>Left</option><option value='right' ${pos.hRef==='right'?'selected':''}>Right</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(pos.hDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","h",this.value)'></label></div><div class='shape-mi-axis-card'><label>Vertical reference<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","v",this.value)'><option value='bottom' ${pos.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${pos.vRef==='top'?'selected':''}>Top</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(pos.vDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","v",this.value)'></label></div></div><label>Diameter<input id='mi_d_${esc(item.id)}' value='${esc(item.diameter)}' oninput='shapeSetManufacturingField("${esc(item.id)}","diameter",this.value)' onchange='render()'></label>`;
    }else{
      var edge=shapeProdDxfEdgeById(item.edgeId),len=edge?edge.length:0,max=edge?shapeDim16(len):'—';
      var fromEnd=shapeMiRefIsEnd(item.id),shown=shapeMiShownDistance(item,len);
      summary=(item.edgeId||'Missing SEG')+' · '+shapeDim16(shown)+' to center from segment '+(fromEnd?'end':'start');
      fields=shapeMarkModelFieldHTML(item)+`<div class='shape-mi-hole-position-grid'>
        <div class='shape-mi-axis-card'><label>Physical segment<select onchange='shapeProdSetManufacturingSegment("${esc(item.id)}",this.value)'>${edges.map(function(x){return `<option value='${esc(x.id)}' ${item.edgeId===x.id?'selected':''}>${esc(x.id.toUpperCase())} · ${esc(dimIn16(x.length))}</option>`;}).join('')}</select><small>Exact finished DXF segment</small></label></div>
        <div class='shape-mi-axis-card'><label>Measured from<select onchange='shapeSetDimRef("${esc(item.id)}","e",this.value)'><option value='start' ${fromEnd?'':'selected'}>Segment start</option><option value='end' ${fromEnd?'selected':''}>Segment end</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(shown))}' onchange='shapeSetManufacturingDistance("${esc(item.id)}",this.value)'><small>Segment length ${esc(max)} · 1/16″</small></label></div>
      </div>`;
    }
    return `<div class='shape-mi-card${expanded?' selected expanded':''}'><button type='button' class='shape-mi-card-toggle' onclick='sManufacturingSelected=${expanded?'null':'"'+esc(item.id)+'"'};render()'><span class='shape-mi-kind ${esc(item.type)}'>${esc(shapeManufacturingShort(item.type))}</span><span><b>${shapeMarkTitleHTML(item)}</b><small>${shapeCutFlagHTML(false)}<span data-raw>${esc(summary)}</span></small></span><i>${expanded?'−':'+'}</i></button>${expanded?`<div class='shape-mi-card-body'>${fields}<label>Note<input data-raw value='${esc(item.note||'')}' oninput='shapeSetManufacturingField("${esc(item.id)}","note",this.value)'></label><div class='shape-mi-actions'><button class='sm' onclick='shapeMoveManufacturingItem("${esc(item.id)}")'>Pick on drawing</button><button class='sm dl' onclick='shapeRemoveManufacturingItem("${esc(item.id)}")'>Delete</button></div></div>`:''}</div>`;
  }).join(''):'<div class="empty compact">No manufacturing items yet</div>'}</div>`;
  return body;
};

/* ---------- DXF Production / Cutting preview ---------- */
function shapeProdDxfProductionSvg(){
  var result=ShapeModule.compute(sDraft),T=shapeDxfPreviewTransform(sDraft.source);if(!T)return `<div class='module-invalid'>DXF preview unavailable</div>`;
  var P=T.P,path=P.map(function(p,i){return (i?'L':'M')+T.X(p[0]).toFixed(2)+' '+T.Y(p[1]).toFixed(2);}).join(' ')+' Z',groups=shapeProdDxfGroups(),placing=sManufacturingPlace?' placing':'';
  var edges=groups.map(function(g){var selected=g.id===shapeProdSelectedEdgeId,processed=g.ops.length,m=[(g.p1[0]+g.p2[0])/2,(g.p1[1]+g.p2[1])/2];return `<line class='shape-prod-edge-line ${selected?'selected ':''}${processed?'processed':''}' x1='${T.X(g.p1[0])}' y1='${T.Y(g.p1[1])}' x2='${T.X(g.p2[0])}' y2='${T.Y(g.p2[1])}'/><line class='shape-prod-edge-hit' x1='${T.X(g.p1[0])}' y1='${T.Y(g.p1[1])}' x2='${T.X(g.p2[0])}' y2='${T.Y(g.p2[1])}' onclick='event.stopPropagation();shapeProdSetDxfEdge("${esc(g.id)}")'/><text class='shape-prod-edge-label' x='${T.X(m[0])}' y='${T.Y(m[1])-7}' text-anchor='middle'>${esc(g.id.toUpperCase())}</text>`;}).join('');
  var markers=shapeManufacturingMarkersSvg(sDraft.source,T),topY=Math.max(20,T.y0-24),leftX=Math.max(24,T.x0-26);
  return `<div class='shape-prod-dxf-card'>${sManufacturingPlace?`<div class='shape-prod-place-note'><b>Placement mode:</b> click ${sManufacturingPlace.type==='hole'?'inside the finished contour':'near the required physical SEG'}.</div>`:''}<svg class='shape-dxf-svg shape-prod-dxf-svg${placing}' viewBox='0 0 ${T.vw} ${T.vh}' ${sManufacturingPlace?"onclick='shapePlaceManufacturingFromEvent(event,this)'":''}><defs><marker id='shapeProdArrow' viewBox='0 0 8 8' refX='4' refY='4' markerWidth='5' markerHeight='5' orient='auto-start-reverse'><path d='M0,0 L8,4 L0,8 Z' fill='#d92d20'/></marker></defs><path d='${path}' fill='rgba(46,144,250,.04)' stroke='#667085' stroke-width='1.5'/>${edges}${markers}<line x1='${T.x0}' y1='${topY}' x2='${T.x0+T.dw}' y2='${topY}' class='shape-dxf-dim-line' marker-start='url(#shapeProdArrow)' marker-end='url(#shapeProdArrow)'/><text x='${T.x0+T.dw/2}' y='${topY-9}' class='shape-dxf-dim-text' text-anchor='middle'>MAX WIDTH ${esc(dimIn16(T.W))}</text><line x1='${leftX}' y1='${T.y0}' x2='${leftX}' y2='${T.y0+T.dh}' class='shape-dxf-dim-line' marker-start='url(#shapeProdArrow)' marker-end='url(#shapeProdArrow)'/><text x='${leftX-10}' y='${T.y0+T.dh/2}' class='shape-dxf-dim-text' text-anchor='middle' transform='rotate(-90 ${leftX-10} ${T.y0+T.dh/2})'>MAX HEIGHT ${esc(dimIn16(T.H))}</text></svg><div class='shape-prod-dxf-help'><b>FINISHED contour</b><span>Edge processing derives Cutting. Manufacturing Items do not change the outer cutting contour.</span></div></div>`;
}
function shapeProdDxfCuttingSvg(){
  var plan=ShapeModule.dxfCuttingPlan(sDraft);if(!plan.valid)return `<div class='shape-prod-cut-block'><b>CUTTING BLOCKED</b><span>${esc(plan.error||'Invalid cutting input.')}</span></div>`;
  var finished=plan.finishedPoints,cut=plan.points,all=finished.concat(cut).concat(shapeBorderFramePoints(plan)),b=fabEdgeBounds(all),vw=820,vh=480,p=70,W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),sc=Math.min((vw-2*p)/W,(vh-2*p)/H),X=function(x){return p+(x-b.minX)*sc;},Y=function(y){return vh-p-(y-b.minY)*sc;},path=function(P){return P.map(function(q,i){return (i?'L':'M')+X(q[0]).toFixed(2)+' '+Y(q[1]).toFixed(2);}).join(' ')+' Z';},cb=fabEdgeBounds(cut);
  return `<div class='shape-prod-machine-card'><div class='shape-prod-machine-head'><b>MACHINE CUTTING CONTOUR</b><span>Orange = exported cutting geometry · gray dashed = finished reference · amber dashed = safety border (nesting clearance, never cut)</span></div><svg viewBox='0 0 ${vw} ${vh}'><path d='${path(finished)}' class='shape-prod-finished-ref'/><path d='${path(cut)}' class='shape-prod-cutting-main'/>${shapeBorderOverlaySvg(plan,X,Y)}</svg><div class='shape-prod-machine-kpi'><span>CUT WIDTH <b>${esc(dimIn16(cb.maxX-cb.minX))}</b></span><span>CUT HEIGHT <b>${esc(dimIn16(cb.maxY-cb.minY))}</b></span></div></div>`;
}
const __shapeProdPreviewMarkup=shapePreviewMarkup;
shapePreviewMarkup=function(r){if(sDraft&&shapeIsDxfSource(sDraft))return sView==='cutting'?shapeProdDxfCuttingSvg():shapeProdDxfProductionSvg();return __shapeProdPreviewMarkup(r);};
const __shapeProdDerivedHTML=shapeDerivedHTML;
shapeDerivedHTML=function(r){
  if(!sDraft||!shapeIsDxfSource(sDraft))return __shapeProdDerivedHTML(r);
  var pr=ShapeModule.dxfProductionResult(sDraft);
  if(!pr.sourceValid){var errors=pr.errors&&pr.errors.length?pr.errors:[pr.reason||'Invalid DXF source'];return `<div class='validation-box badbox'><b>Invalid DXF</b>${errors.map(function(x){return `<div>${esc(x)}</div>`;}).join('')}</div>`;}
  if(!pr.valid){var errs=pr.errors&&pr.errors.length?pr.errors:[pr.reason||'Invalid production input'];return `<div class='smart-kpis'><div><span>Finished</span><b>${esc(dimIn16(pr.width))} × ${esc(dimIn16(pr.height))}</b></div><div><span>Thickness</span><b>${esc(String(shapeThicknessMm(sDraft)))} mm</b></div></div><div class='validation-box badbox'><b>Cutting blocked</b>${errs.map(function(x){return `<div>${esc(x)}</div>`;}).join('')}</div>`;}
  var req=pr.requirements||[];return `<div class='smart-kpis'><div><span>Finished</span><b>${esc(dimIn16(pr.width))} × ${esc(dimIn16(pr.height))}</b></div><div><span>Thickness</span><b>${esc(String(shapeThicknessMm(sDraft)))} mm</b></div><div><span>Cut size</span><b>${esc(dimIn16(pr.cutting.width))} × ${esc(dimIn16(pr.cutting.height))}</b></div><div><span>Perimeter</span><b>${esc(dimIn16(pr.perimeter))}</b></div>${pr.cutting.safetyBorder&&pr.cutting.safetyBorder.applies?`<div><span>Safety Border</span><b>${esc(dimIn16(pr.cutting.safetyBorder.value))} · ${esc(pr.cutting.safetyBorder.state)}</b></div>`:''}</div>${shapeProdBorderField()}<div class='shape-requirements'><b>Production requirements</b>${req.length?req.map(function(q){return `<span><i>${esc(q.stationClass)}</i> ${esc(q.operation)}${q.edgeIds?' · '+esc(q.edgeIds.join(', ')):''}</span>`;}).join(''):'<span>No additional operations</span>'}</div><div class='validation-box okbox'>Finished DXF, edge processing and Cutting geometry are synchronized · ${esc(pr.fingerprint)}</div>`;
};

function shapeProdDownloadDxf(kind){
  var pr=ShapeModule.dxfProductionResult(sDraft);if(!pr.valid)return alert(pr.reason||'Cutting is blocked.');var base=shapeSafeFileName((sDraft.name||'Shape')+'_R'+(sDraft.revision||0));
  if(kind==='dxf')return shapeDownload(ShapeModule.genericDxf(pr),'application/dxf',base+'_cutting.dxf');
  if(kind==='finished')return shapeDownload(ShapeModule.finishedDxf(pr),'application/dxf',base+'_finished.dxf');
  if(kind==='check')return shapeDownload(ShapeModule.checkDxf(pr),'application/dxf',base+'_check.dxf');
  if(kind==='json')return shapeDownload(JSON.stringify(ShapeModule.machinePayload(pr),null,2),'application/json',base+'_machine.json');
  var plan=pr.cutting,P=plan.points,b=fabEdgeBounds(P),pad=Math.max(.25,Math.max(plan.width,plan.height)*.03),pts=P.map(function(p){return (p[0]-b.minX+pad)+','+(b.maxY-p[1]+pad);}).join(' '),svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.width+2*pad} ${plan.height+2*pad}"><polygon points="${pts}" fill="none" stroke="black"/></svg>`;shapeDownload(svg,'image/svg+xml',base+'_cutting.svg');
}
const __shapeProdArtifacts=shapeArtifacts;
shapeArtifacts=function(r){
  if(!sDraft||!shapeIsDxfSource(sDraft))return __shapeProdArtifacts(r);
  var pr=ShapeModule.dxfProductionResult(sDraft);
  if(!pr.valid)return `<div class='shape-artifacts dxf-source'><b>Machine export blocked</b><span>${esc(pr.reason||'Fix the production input first.')}</span></div>`;
  if(sView!=='cutting')return `<div class='shape-artifacts'><b>Finished drawing</b><button onclick='shapeProdDownloadDxf("finished")'>Finished DXF</button><small>Finished DXF — готовая деталь: контур, отверстия и вырезы, без припуска. Ноль в нижнем левом углу готового контура.</small></div>`;
  return `<div class='shape-artifacts'><b>Machine cutting files</b><button onclick='shapeProdDownloadDxf("dxf")'>Cutting DXF</button><button onclick='shapeProdDownloadDxf("check")'>Check DXF</button><button onclick='shapeProdDownloadDxf("json")'>Machine JSON</button><button onclick='shapeProdDownloadDxf("svg")'>Cutting SVG</button><small>Cutting DXF — только линия реза, слой CUT_OUTER: это файл для станка. Check DXF — проверочный, слоями FINISHED_OUTER, CUT_OUTER, SAFETY_BORDER, REFERENCE в одном нуле; на станок его не отдавать.</small></div>`;
};

/* ---------- Final approved editor order ---------- */
shapeForm=function(){
  shapeProdStripStaleSegments();setTimeout(function(){shapeMarkFields();shapeFitPreview();},0);
  var r=shapeDraftResult(),external=shapeIsDxfSource(sDraft),geo=external?{ok:false,points:[],edges:[],vertices:[]}:shapeDraftGeometry();
  var controls=external
    ? `<div class='shape-prod-external-note'>DXF is the <b>FINISHED</b> contour. Geometry is read-only; processing and manufacturing remain editable.</div>${shapeProdDxfEdgeProcessing()}${shapeCutoutEditor(geo)}`
    : `${sDraft.type==='smart'?shapeSmartControls():shapeGenericControls()}${shapeLiteSplitEditor()}${shapeEdgeworkEditor()}${shapeCutoutEditor(geo)}`;
  var tabs=external
    ? `<div class='shape-view-tabs'><button class='${sView!=='cutting'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting DXF</button><button class='shape-print-btn' disabled>Print / PDF</button></div>`
    : `<div class='shape-view-tabs'><button data-shape-view='setup' class='${sView==='setup'?'on':''}' onclick='setShapeView("setup")'>Setup</button><button data-shape-view='production' class='${sView==='production'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button data-shape-view='cutting' class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting Shape</button><button class='shape-print-btn' onclick='shapePrintDrawing()'>Print / PDF</button></div>`;
  return `<div class='module-editor' id='shapeEditorRoot'>${shapeLiteBanner()}<div class='module-editor-head'><div><h3>${sEdit==='new'?'New Production Shape':'Edit Production Shape'}</h3><p>${external?'Finished DXF → Edge processing → Cutout → derived Cutting DXF.':'Finished geometry → Edge processing → Cutout.'}</p></div></div><div class='shape-editor-layout'><div class='shape-controls'>${shapeProdMasterFields()}${controls}</div><div class='shape-preview-side'>${tabs}<div id='shapeLivePreview' class='shape-drawing-preview'>${shapePreviewMarkup(r)}</div><div id='shapeLiveDerived'>${shapeDerivedHTML(r)}</div>${shapeArtifacts(r)}</div></div><div class='err' id='e_shape'></div><div class='row'><button class='pri' onclick='saveShape()'>Save revision</button><button onclick='cancelShapeEdit()'>Cancel</button></div></div>`;
};
