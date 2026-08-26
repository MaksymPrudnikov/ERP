/* =====================================================================
   erp/views/sales-service-sets-ui · service-set-v1
   UI for order-scoped Edgework Sets and line Effective Production.
   Business resolution lives in erp/sales/service-sets.js.
   ===================================================================== */

let soServiceSetOpen=false,soServiceSetEditingId=null,soServiceSetDraft=null;
let soEdgeworkLineId=null,soServiceFilter='all',soBulkServiceSetId='',soBulkServicePolicy='keep',soServiceBulkPreview=null;

function salesServiceShort(type){return type==='Rough Arris'?'Rough':type==='Flat Polish'?'Flat':type==='CNC Shape Polish'?'CNC':type==='Mitering'?'Miter':type==='Beveling'?'Bevel':type;}
function salesServiceOpsText(ops){var a=salesServiceOps(ops);return a.length?a.map(function(o){return o.type==='Mitering'?(o.angle||45)+'° '+((o.side||'back')==='front'?'Front':'Back')+' Mitre':o.type==='Beveling'?'Bevel '+(o.width||'1')+'″ ('+((o.side||'front')==='back'?'Back':'Front')+')':salesServiceShort(o.type);}).join(' + '):'None';}

function salesServiceFilteredEntries(){
  if(!soDraft)return [];
  return soDraft.lines.map(function(line,index){return {line:line,index:index};}).filter(function(entry){
    var line=entry.line;
    if(soServiceFilter==='unset')return !line.serviceSetId;
    if(soServiceFilter==='attention')return salesLineNeedsServiceAttention(line);
    if(soServiceFilter==='override')return salesHasLineEdgeOverrides(line);
    if(soServiceFilter==='dxf'){var s=salesShapeByRef(line.shapeRef);return !!(s&&shapeIsDxfSource(s));}
    return true;
  });
}
function salesServiceFilterCount(key){var old=soServiceFilter;soServiceFilter=key;var n=salesServiceFilteredEntries().length;soServiceFilter=old;return n;}
function salesServiceVisibleSelected(){var ids=new Set(salesServiceFilteredEntries().map(function(x){return x.line.id;}));return (soDraft&&soDraft.lines||[]).filter(function(line){return soSelectedLines.has(line.id)&&ids.has(line.id);});}
function salesServiceAvailableFilters(){
  return [['unset','No set'],['attention','Needs attention'],['override','Has overrides'],['dxf','DXF']].map(function(d){return {key:d[0],label:d[1],count:salesServiceFilterCount(d[0])};}).filter(function(d){return d.count>0;});
}
function salesNormalizeVisibleServiceFilter(){var a=salesServiceAvailableFilters();if(soServiceFilter!=='all'&&!a.some(function(d){return d.key===soServiceFilter;}))soServiceFilter='all';}
function salesSetServiceFilter(key){var a=salesServiceAvailableFilters();soServiceFilter=key==='all'||a.some(function(d){return d.key===key;})?key:'all';soServiceBulkPreview=null;render();}
function salesServiceFiltersHtml(){
  salesNormalizeVisibleServiceFilter();var a=salesServiceAvailableFilters();if(!a.length)return '';
  return `<div class='ss-filters'><button class='ss-filter ${soServiceFilter==='all'?'on':''}' onclick='salesSetServiceFilter("all")'>All <span>${salesServiceFilterCount('all')}</span></button>${a.map(function(d){return `<button class='ss-filter ${soServiceFilter===d.key?'on':''} ${d.key==='attention'?'attn':''}' onclick='salesSetServiceFilter("${d.key}")'>${esc(d.label)} <span>${d.count}</span></button>`;}).join('')}</div>`;
}

const __salesServiceToggleLine=salesToggleLine;
salesToggleLine=function(id,on){__salesServiceToggleLine(id,on);soServiceBulkPreview=null;render();};
salesToggleAllLines=function(on){salesServiceFilteredEntries().forEach(function(x){if(on)soSelectedLines.add(x.line.id);else soSelectedLines.delete(x.line.id);});soServiceBulkPreview=null;render();};
salesRefreshBulkBar=function(){var el=document.getElementById('salesBulkCount');if(el)el.textContent=salesServiceVisibleSelected().length+' selected';};
salesAssignSelected=function(makeupId){if(!makeupId||!salesMakeupById(soDraft,makeupId))return;salesServiceVisibleSelected().forEach(function(l){l.makeupId=makeupId;});soServiceBulkPreview=null;render();};

function salesSetBadge(line){
  var set=salesServiceSetById(soDraft,line.serviceSetId),ov=salesHasLineEdgeOverrides(line);
  if(line.serviceSetId&&!set)return `<button type='button' class='ss-badge missing' title='Referenced Bulk Service Set is missing' onclick='salesOpenLineEdgework("${esc(line.id)}")'>?</button>`;
  if(!set)return `<button type='button' class='ss-badge' title='No Bulk Service Set' onclick='salesOpenLineEdgework("${esc(line.id)}")'>—</button>`;
  return `<button type='button' class='ss-badge${ov?' override':''}' title='${esc(salesServiceSetFormula(set))}' onclick='salesOpenLineEdgework("${esc(line.id)}")'>${esc(set.code)}${ov?'*':''}</button>`;
}

function salesAssignmentWarning(line,set){
  var test=salesServiceClone(line);test.serviceSetId=set.id;var shape=salesLineGeometryShape(test);if(!shape)return 'Needs geometry';
  if(shapeIsDxfSource(shape)&&set.mode==='sides'&&!salesDxfMappingComplete(test,shape))return 'DXF Set will wait for confirmed side mapping';
  if(salesDxfOverrideStale(test,shape))return 'DXF line override belongs to another physical contour';
  var cut=salesEffectiveCuttingPlan(test,shape,soDraft);return cut.valid?'':cut.reason;
}
function salesPlanServiceAssignment(setId,policy){
  var set=salesServiceSetById(soDraft,setId),rows=salesServiceVisibleSelected();policy=policy||'keep';if(!set||!rows.length)return null;
  var affected=rows.filter(function(l){return !(policy==='empty'&&l.serviceSetId);}),warnings=[],preserved=policy==='keep'?affected.reduce(function(n,l){return n+Object.keys((l.serviceOverrides&&l.serviceOverrides.edges)||{}).length;},0):0,edges=0;
  affected.forEach(function(line){var shape=salesLineGeometryShape(line);edges+=shape?salesShapePhysicalEdges(shape).length:0;var w=salesAssignmentWarning(line,set);if(w)warnings.push({mark:line.mark||line.id,text:w});});
  return {setId:set.id,policy:policy,lineIds:affected.map(function(l){return l.id;}),lineCount:affected.length,edgeCount:edges,preserved:preserved,warnings:warnings};
}
function salesPreviewServiceAssignment(){soServiceBulkPreview=salesPlanServiceAssignment(soBulkServiceSetId,soBulkServicePolicy);if(!soServiceBulkPreview)alert('Select visible rows and choose a Bulk Service Set.');render();}
function salesApplyServiceAssignment(){
  var p=soServiceBulkPreview;if(!p)return;var ids=new Set(p.lineIds);
  soDraft.lines.forEach(function(line){if(!ids.has(line.id))return;line.serviceSetId=p.setId;if(p.policy==='overwrite')line.serviceOverrides={pinnedTopology:'',edges:{}};});
  soServiceBulkPreview=null;soSelectedLines=new Set();render();
}
function salesServiceBulkPreviewHtml(){
  var p=soServiceBulkPreview;if(!p)return '';
  return `<div class='ss-preview'><strong>Will change ${p.lineCount} line(s) · ${p.edgeCount} physical edge(s) · ${p.preserved} manual override(s) preserved</strong>${p.warnings.length?`<ul>${p.warnings.map(function(w){return `<li>${esc(w.mark)} — ${esc(w.text)}</li>`;}).join('')}</ul>`:`<div class='mut'>No production warnings detected.</div>`}<div class='ss-preview-actions'><button class='pri sm' onclick='salesApplyServiceAssignment()'>Apply</button><button class='sm' onclick='soServiceBulkPreview=null;render()'>Cancel</button></div></div>`;
}
function salesBulkServiceControls(){
  var selected=salesServiceVisibleSelected();if(!selected.length)return '';
  return `<div class='sales-bulk ss-bulk'><b id='salesBulkCount'>${selected.length} selected</b><span>Makeup</span><select onchange='salesAssignSelected(this.value)'><option value=''>—</option>${soDraft.makeups.map(function(m){return `<option value='${esc(m.id)}'>${esc(m.code)}</option>`;}).join('')}</select><span>Bulk Set</span><select onchange='soBulkServiceSetId=this.value;soServiceBulkPreview=null;render()'><option value=''>—</option>${(soDraft.serviceSets||[]).map(function(s){return `<option value='${esc(s.id)}' ${soBulkServiceSetId===s.id?'selected':''}>${esc(s.code)} · ${esc(salesServiceSetFormula(s))}</option>`;}).join('')}</select><span>Policy</span><select onchange='soBulkServicePolicy=this.value;soServiceBulkPreview=null;render()'><option value='keep' ${soBulkServicePolicy==='keep'?'selected':''}>Keep overrides</option><option value='overwrite' ${soBulkServicePolicy==='overwrite'?'selected':''}>Overwrite overrides</option><option value='empty' ${soBulkServicePolicy==='empty'?'selected':''}>Only empty</option></select><button class='sm' onclick='salesPreviewServiceAssignment()'>Preview</button><button class='sm' onclick='soSelectedLines=new Set();soServiceBulkPreview=null;render()'>Clear</button></div>${salesServiceBulkPreviewHtml()}`;
}

/* Approved Sales line layout: Set column immediately after MU. */
salesOrderLines=function(){
  var entries=salesServiceFilteredEntries(),visible=entries.map(function(x){return x.line;}),allSelected=visible.length>0&&visible.every(function(l){return soSelectedLines.has(l.id);}),currency=soDraft.currency||'CAD',pricing=salesOrderPricingSummary(),hasServices=pricing.charges>0;
  return `<section class='sales-block sales-lines-block'><div class='sales-lines-head'><div><b>ORDER LINES</b><span>MU → Set → Qty → Dimensions → Mark → Shape / Muntin → Services</span></div><div class='sales-line-tools'><button class='sales-services-order-btn ${hasServices?'has-services':''}${pricing.unpriced?' incomplete':''}' onclick='salesOpenOrderServices()'><span>Services & prices</span><span class='sales-order-price-summary'><b>${pricing.total.toFixed(2)} ${esc(currency)}</b>${pricing.unpriced?`<small>${pricing.unpriced} no rate</small>`:''}</span></button><button class='ss-order-btn' onclick='salesOpenServiceSets()'>Edgework Sets <span>${(soDraft.serviceSets||[]).length}</span></button><button onclick='salesExcelOpen()'>Paste Excel</button><button onclick='salesOrderAddTen()'>+10</button><button class='pri' onclick='salesOrderAddLine(null,true)'>+ Line</button></div></div>${salesServiceFiltersHtml()}${salesBulkServiceControls()}<div class='sales-table-wrap'><table class='sales-lines-table sales-lines-with-services'><thead><tr><th class='line-check'><input type='checkbox' ${allSelected?'checked':''} onchange='salesToggleAllLines(this.checked)'></th><th>#</th><th>MU</th><th>Set</th><th>Qty</th><th>Width</th><th>Height</th><th>Mark</th><th>Shape</th><th>Muntin</th><th>Services</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>${entries.map(function(x){var l=x.line,i=x.index,linked=!!(l.shapeRef&&l.shapeRef.id),st=salesLineServiceStatus(l);return `<tr><td class='line-check'><input type='checkbox' ${soSelectedLines.has(l.id)?'checked':''} onchange='salesToggleLine("${esc(l.id)}",this.checked)'></td><td class='mono line-num'>${i+1}</td><td><select class='line-mu' onchange='soDraft.lines[${i}].makeupId=this.value;render()'>${soDraft.makeups.map(function(m){return `<option value='${esc(m.id)}' ${l.makeupId===m.id?'selected':''}>${esc(m.code)}</option>`;}).join('')}</select></td><td class='ss-cell'>${salesSetBadge(l)}</td><td><input class='line-qty' type='number' min='1' step='1' value='${esc(l.qty)}' oninput='soDraft.lines[${i}].qty=salesPositiveInt(this.value,1)' onchange='render()'></td><td><input data-so-width class='line-dim' ${linked?'disabled title="Dimensions come from Shape"':''} value='${esc(salesDimFrom16(l.width16))}' placeholder='34 13/16' onchange='salesLineDimChange(${i},"width",this)'></td><td><input class='line-dim' ${linked?'disabled title="Dimensions come from Shape"':''} value='${esc(salesDimFrom16(l.height16))}' placeholder='15 5/16' onchange='salesLineDimChange(${i},"height",this)'></td><td><input class='line-mark' value='${esc(l.mark)}' oninput='soDraft.lines[${i}].mark=this.value' onkeydown='salesLineMarkKey(${i},event)'></td><td>${salesLineShapeCell(l,i)}</td><td>${salesLineMuntinCell(l,i)}</td><td class='line-services-cell'>${salesLineServicesSummary(l)}</td><td class='ss-status'><span class='pill ${st.cls}'>${esc(st.label)}</span></td><td><input class='line-notes line-notes-compact' value='${esc(l.notes)}' oninput='soDraft.lines[${i}].notes=this.value'></td><td><button class='sm dl line-delete' onclick='salesOrderRemoveLine(${i})'>×</button></td></tr>`;}).join('')||`<tr><td colspan='14' class='empty'>No lines in this filter.</td></tr>`}</tbody></table></div></section>`;
};

/* ---------- Edgework Set editor ---------- */
function salesOpenServiceSets(id){soServiceSetOpen=true;soEdgeworkLineId=null;if(id)salesSelectServiceSet(id);else if((soDraft.serviceSets||[]).length)salesSelectServiceSet(soDraft.serviceSets[0].id);else salesNewServiceSet();render();}
function salesCloseServiceSets(){soServiceSetOpen=false;soServiceSetEditingId=null;soServiceSetDraft=null;render();}
function salesSelectServiceSet(id){var s=salesServiceSetById(soDraft,id);if(!s)return;soServiceSetEditingId=id;soServiceSetDraft=salesServiceClone(s);render();}
function salesNewServiceSet(){var now=new Date().toISOString();soServiceSetEditingId='new';soServiceSetDraft=salesNormalizeServiceSet({id:salesUid('SVC'),code:salesNextServiceSetCode(soDraft),name:'',mode:'sides',sides:{A:[],B:[],C:[],D:[],other:[]},createdAt:now,updatedAt:now},(soDraft.serviceSets||[]).length);render();}
function salesSetSetField(key,value){if(!soServiceSetDraft)return;if(key==='code')soServiceSetDraft.code=salesString(value).toUpperCase();else soServiceSetDraft[key]=value;}
function salesSetSetMode(mode){if(!soServiceSetDraft)return;soServiceSetDraft.mode=mode==='perimeter'?'perimeter':'sides';render();}
function salesSetBucket(row){return row==='ALL'?soServiceSetDraft.perimeter:soServiceSetDraft.sides[row==='OTHER'?'other':row];}
function salesToggleSetOp(row,type,on){
  if(!soServiceSetDraft)return;var key=row==='OTHER'?'other':row,current=row==='ALL'?soServiceSetDraft.perimeter:soServiceSetDraft.sides[key],list=shapeTogglePrimaryFinish(current,type,on);
  if(row==='ALL')soServiceSetDraft.perimeter=list;else soServiceSetDraft.sides[key]=list;render();
}
function salesSetOpParam(row,type,key,value){
  var bucket=salesSetBucket(row),op=bucket.find(function(o){return o.type===type;});if(!op)return;
  if(type==='Mitering'){if(key==='angle')op.angle=+value===22.5?22.5:45;if(key==='side')op.side=value==='front'?'front':'back';}
  if(type==='Beveling'){if(key==='width'){if(!(inch(value)>0)){alert('Bevel width must be greater than zero.');render();return;}op.width=String(value);}if(key==='side')op.side=value==='back'?'back':'front';}render();
}
function salesValidateSetDraft(){
  if(!soServiceSetDraft)return 'No Service Set draft.';if(!/^[A-Za-z0-9_-]{1,20}$/.test(soServiceSetDraft.code||''))return 'Set code must contain letters, numbers, _ or -.';
  var rows=soServiceSetDraft.mode==='perimeter'?['ALL']:['A','B','C','D','OTHER'];
  for(var i=0;i<rows.length;i++){var v=ShapeModule.validateEdgeOperations(salesSetBucket(rows[i]),rows[i]);if(!v.ok)return v.reason;}
  var dup=(soDraft.serviceSets||[]).find(function(s){return s.code===soServiceSetDraft.code&&s.id!==soServiceSetDraft.id;});if(dup)return 'Another Service Set already uses code '+soServiceSetDraft.code+'.';return '';
}
function salesSaveServiceSet(){
  var error=salesValidateSetDraft();if(error)return alert(error);var now=new Date().toISOString(),draft=salesNormalizeServiceSet(soServiceSetDraft);draft.updatedAt=now;if(!draft.createdAt)draft.createdAt=now;
  if(soServiceSetEditingId==='new'){soDraft.serviceSets.push(draft);soServiceSetEditingId=draft.id;}else{var i=soDraft.serviceSets.findIndex(function(s){return s.id===soServiceSetEditingId;});if(i>=0)soDraft.serviceSets[i]=draft;}
  soServiceSetDraft=salesServiceClone(draft);render();
}
function salesDeleteServiceSet(){
  if(!soServiceSetDraft||soServiceSetEditingId==='new'){salesNewServiceSet();return;}var used=salesServiceSetUsage(soDraft,soServiceSetDraft.id);if(used&&!confirm('This Set is assigned to '+used+' line(s). Delete it and leave those lines needing review?'))return;if(!used&&!confirm('Delete '+soServiceSetDraft.code+'?'))return;
  soDraft.serviceSets=soDraft.serviceSets.filter(function(s){return s.id!==soServiceSetDraft.id;});if(soDraft.serviceSets.length)salesSelectServiceSet(soDraft.serviceSets[0].id);else salesNewServiceSet();render();
}
function salesSetSideDescription(row){return {A:'Left · Height',B:'Bottom · Width',C:'Right · Height',D:'Top · Width',OTHER:'Custom / extra edge',ALL:'All physical edges'}[row]||'';}
function salesSetSideGuide(){
  return `<div class='ss-side-guide'><div class='ss-side-guide-copy'><b>Rectangle side reference</b><span>A and C follow Height. B and D follow Width.</span><small>OTHER is used for custom or extra edges that do not belong to the four rectangle sides.</small></div><div class='ss-side-map' role='img' aria-label='Rectangle side reference: A is left and follows height; B is bottom and follows width; C is right and follows height; D is top and follows width.'><span class='ss-side-map-label top'><b>D</b> Top · Width</span><span class='ss-side-map-label left'><b>A</b> Left · Height</span><span class='ss-side-map-glass'>Finished lite</span><span class='ss-side-map-label right'><b>C</b> Right · Height</span><span class='ss-side-map-label bottom'><b>B</b> Bottom · Width</span></div></div>`;
}
function salesSetMatrixRow(row){
  var ops=salesSetBucket(row);return `<div class='ss-set-row'><div class='ss-set-side'><b>${esc(row)}</b><small>${esc(salesSetSideDescription(row))}</small></div><div class='ss-set-op-list'>${SALES_SERVICE_SET_OPS.map(function(type){var on=ops.some(function(o){return o.type===type;});return `<label class='ss-op ${on?'on':''}'><input type='checkbox' ${on?'checked':''} onchange='salesToggleSetOp("${row}","${type}",this.checked)'><span>${esc(salesServiceShort(type))}</span></label>`;}).join('')}</div><span class='ss-set-result'>${esc(salesServiceOpsText(ops))}</span></div>${ops.map(function(op){if(op.type==='Mitering')return `<div class='ss-param-row'><span>${row} · Miter</span><label>Angle<select onchange='salesSetOpParam("${row}","Mitering","angle",this.value)'><option value='45' ${+op.angle===45?'selected':''}>45°</option><option value='22.5' ${+op.angle===22.5?'selected':''}>22.5°</option></select></label><label>Side<select onchange='salesSetOpParam("${row}","Mitering","side",this.value)'><option value='back' ${(op.side||'back')==='back'?'selected':''}>Back</option><option value='front' ${op.side==='front'?'selected':''}>Front</option></select></label></div>`;if(op.type==='Beveling')return `<div class='ss-param-row'><span>${row} · Bevel</span><label>Width<input value='${esc(op.width||'1')}' onchange='salesSetOpParam("${row}","Beveling","width",this.value)'></label><label>Side<select onchange='salesSetOpParam("${row}","Beveling","side",this.value)'><option value='front' ${(op.side||'front')==='front'?'selected':''}>Front</option><option value='back' ${op.side==='back'?'selected':''}>Back</option></select></label></div>`;return '';}).join('')}`;
}
function salesServiceSetsModal(){
  if(!soServiceSetOpen||!soServiceSetDraft)return '';
  return `<div class='sales-service-modal-back' onclick='if(event.target===this)salesCloseServiceSets()'><div class='sales-service-modal ss-set-modal'><div class='sales-service-modal-head'><div><span>Sales Order ${esc(soDraft.businessNumber||'Draft')}</span><h3>Edgework Sets</h3><small>Reusable bulk edgework recipe inside this order.</small></div><button onclick='salesCloseServiceSets()'>×</button></div><div class='ss-set-workspace'><aside class='ss-set-list'><button class='pri sm' onclick='salesNewServiceSet()'>+ New Set</button>${(soDraft.serviceSets||[]).map(function(s){return `<button class='ss-set-list-item ${soServiceSetEditingId===s.id?'on':''}' onclick='salesSelectServiceSet("${esc(s.id)}")'><b>${esc(s.code)}</b><span>${esc(s.name||salesServiceSetFormula(s))}</span><small>${salesServiceSetUsage(soDraft,s.id)} line(s)</small></button>`;}).join('')}</aside><div class='ss-set-editor'><div class='ss-set-fields'><label>Code<input value='${esc(soServiceSetDraft.code)}' oninput='salesSetSetField("code",this.value)'></label><label>Name<input value='${esc(soServiceSetDraft.name)}' oninput='salesSetSetField("name",this.value)'></label><label>Mode<select onchange='salesSetSetMode(this.value)'><option value='sides' ${soServiceSetDraft.mode==='sides'?'selected':''}>Sides A/B/C/D/OTHER</option><option value='perimeter' ${soServiceSetDraft.mode==='perimeter'?'selected':''}>Whole perimeter</option></select></label></div>${salesSetSideGuide()}<div class='ss-set-matrix'><div class='ss-set-row head'><b>Side / reference</b><span>Operations</span><span>Resolved</span></div>${(soServiceSetDraft.mode==='perimeter'?['ALL']:['A','B','C','D','OTHER']).map(salesSetMatrixRow).join('')}</div><div class='ss-set-actions'><button class='dl' onclick='salesDeleteServiceSet()'>Delete</button><span class='sp'></span><button onclick='salesCloseServiceSets()'>Close</button><button class='pri' onclick='salesSaveServiceSet()'>Save Set</button></div></div></div></div></div>`;
}

/* ---------- Line Effective Production ---------- */
function salesOpenLineEdgework(id){soEdgeworkLineId=id;soServiceSetOpen=false;render();}
function salesCloseLineEdgework(){soEdgeworkLineId=null;render();}
function salesSetDxfSegmentSide(lineId,segId,side){
  var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;var map=salesNormalizeSideMap(line.sideMap)||{A:[],B:[],C:[],D:[],other:[]};
  ['A','B','C','D','other'].forEach(function(k){map[k]=map[k].filter(function(id){return id!==segId;});});if(['A','B','C','D','other'].indexOf(side)>=0)map[side].push(segId);line.sideMap=salesNormalizeSideMap(map);line.sideMapTopology='';render();
}
function salesConfirmDxfMapping(lineId){var line=soDraft.lines.find(function(l){return l.id===lineId;}),shape=line&&salesShapeByRef(line.shapeRef);if(!line||!shape||!shapeIsDxfSource(shape))return;if(!salesDxfSideMapClassified(line,shape))return alert('Classify every DXF segment before confirming the mapping.');line.sideMapTopology=ShapeModule.dxfTopologyFingerprint(shape);render();}
function salesDxfMappingHtml(line,shape){
  var edges=ShapeModule.dxfEdges(shape),classified=salesDxfSideMapClassified(line,shape),current=salesDxfSideMapCurrent(line,shape),unmapped=edges.filter(function(e){return !salesMappedSide(line,e.id);}).length,key=ShapeModule.dxfTopologyFingerprint(shape);
  return `<div class='ss-dxf-map'><div class='ss-map-state'>${current?`<span class='ok'><b>Confirmed for this physical DXF contour</b></span>`:classified?`<span class='warn'><b>Review required.</b> Classification is complete but not confirmed.</span>`:`<span class='warn'><b>${unmapped} unmapped segment(s).</b> Unmapped is not OTHER.</span>`}<span class='sp'></span>${classified&&!current?`<button onclick='salesConfirmDxfMapping("${esc(line.id)}")'>Confirm mapping</button>`:''}<code>${esc(key)}</code></div><div class='ss-dxf-map-head'><b>Physical segment</b><b>Class</b><b>Length</b></div>${edges.map(function(edge){var side=salesMappedSide(line,edge.id);return `<div class='ss-dxf-map-row'><b class='mono'>${esc(edge.id.toUpperCase())}</b><select onchange='salesSetDxfSegmentSide("${esc(line.id)}","${esc(edge.id)}",this.value)'><option value='' ${!side?'selected':''}>Unmapped</option><option value='A' ${side==='A'?'selected':''}>A · Left / height</option><option value='B' ${side==='B'?'selected':''}>B · Bottom / width</option><option value='C' ${side==='C'?'selected':''}>C · Right / height</option><option value='D' ${side==='D'?'selected':''}>D · Top / width</option><option value='other' ${side==='other'?'selected':''}>OTHER · custom edge</option></select><span class='mono'>${esc(dimIn(edge.length))}</span></div>`;}).join('')}</div>`;
}
function salesSetLineEdgeOp(lineId,edgeId,type,on){var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;var r=salesApplyLineEdgeOperation(line,edgeId,type,on);if(!r.ok)alert(r.reason);render();}
function salesRevertEdge(lineId,edgeId){var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;delete line.serviceOverrides.edges[edgeId];if(!Object.keys(line.serviceOverrides.edges).length)line.serviceOverrides.pinnedTopology='';render();}
function salesRevertAllEdges(lineId){var line=soDraft.lines.find(function(l){return l.id===lineId;});if(line)line.serviceOverrides={pinnedTopology:'',edges:{}};render();}
function salesRemoveLostEdges(lineId){var line=soDraft.lines.find(function(l){return l.id===lineId;});if(!line)return;salesLostOverrideEdges(line).forEach(function(id){delete line.serviceOverrides.edges[id];});if(!Object.keys(line.serviceOverrides.edges).length)line.serviceOverrides.pinnedTopology='';render();}
function salesSetLineOpParam(lineId,edgeId,type,key,value){
  var line=soDraft.lines.find(function(l){return l.id===lineId;}),shape=line&&salesLineGeometryShape(line);if(!line||!shape)return;if(!line.serviceOverrides)line.serviceOverrides={pinnedTopology:'',edges:{}};
  var snap=salesEffectiveProductionSnapshot(line,shape,soDraft),group=snap.valid&&snap.groups.find(function(g){return g.id===edgeId;});if(!group)return alert(snap.reason||'Edge is unavailable.');
  if(!Object.prototype.hasOwnProperty.call(line.serviceOverrides.edges,edgeId))line.serviceOverrides.edges[edgeId]=salesServiceClone(group.ops);
  var op=line.serviceOverrides.edges[edgeId].find(function(o){return o.type===type;});if(!op)return;
  if(type==='Mitering'){if(key==='angle')op.angle=+value===22.5?22.5:45;if(key==='side')op.side=value==='front'?'front':'back';}
  if(type==='Beveling'){if(key==='width'){if(!(inch(value)>0)){alert('Bevel width must be greater than zero.');return render();}op.width=String(value);}if(key==='side')op.side=value==='back'?'back':'front';}
  if(shapeIsDxfSource(shape))line.serviceOverrides.pinnedTopology=ShapeModule.dxfTopologyFingerprint(shape);render();
}
function salesLineParamEditor(line,group){
  var m=group.ops.find(function(o){return o.type==='Mitering';}),b=group.ops.find(function(o){return o.type==='Beveling';});if(!m&&!b)return '';
  return `<div class='ss-edge-params'>${m?`<label>Miter angle<select onchange='salesSetLineOpParam("${esc(line.id)}","${esc(group.id)}","Mitering","angle",this.value)'><option value='45' ${+m.angle===45?'selected':''}>45°</option><option value='22.5' ${+m.angle===22.5?'selected':''}>22.5°</option></select></label><label>Miter side<select onchange='salesSetLineOpParam("${esc(line.id)}","${esc(group.id)}","Mitering","side",this.value)'><option value='back' ${(m.side||'back')==='back'?'selected':''}>Back</option><option value='front' ${m.side==='front'?'selected':''}>Front</option></select></label>`:''}${b?`<label>Bevel width<input value='${esc(b.width||'1')}' onchange='salesSetLineOpParam("${esc(line.id)}","${esc(group.id)}","Beveling","width",this.value)'></label><label>Bevel side<select onchange='salesSetLineOpParam("${esc(line.id)}","${esc(group.id)}","Beveling","side",this.value)'><option value='front' ${(b.side||'front')==='front'?'selected':''}>Front</option><option value='back' ${b.side==='back'?'selected':''}>Back</option></select></label>`:''}</div>`;
}
function salesEffectivePreviewSvg(plan){
  if(!plan||!plan.valid||!(plan.finishedPoints||[]).length)return '';
  var all=(plan.finishedPoints||[]).concat(plan.cuttingPoints||[]),b=fabEdgeBounds(all),W=Math.max(.01,b.maxX-b.minX),H=Math.max(.01,b.maxY-b.minY),vw=640,vh=420,p=45,sc=Math.min((vw-p*2)/W,(vh-p*2)/H),X=function(x){return p+(x-b.minX)*sc;},Y=function(y){return vh-p-(y-b.minY)*sc;},path=function(P){return P.map(function(q,i){return (i?'L ':'M ')+X(q[0])+' '+Y(q[1]);}).join(' ')+' Z';};
  return `<svg class='ss-effective-svg' viewBox='0 0 ${vw} ${vh}'><path d='${path(plan.finishedPoints)}' class='finished'/><path d='${path(plan.cuttingPoints)}' class='cutting'/></svg>`;
}
function salesDownloadBlob(text,type,name){var blob=new Blob([text],{type:type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function salesEffectiveFileBase(line){return String((soDraft.businessNumber||'SO')+'_'+(line.mark||line.id||'line')+'_EFFECTIVE_CUTTING').replace(/[^A-Za-z0-9_.-]+/g,'_');}
function salesDownloadEffectiveCutting(lineId,kind){
  var line=soDraft.lines.find(function(l){return l.id===lineId;}),payload=line&&salesEffectiveMachinePayload(line);if(!payload)return;if(!payload.ok)return alert(payload.reason);var base=salesEffectiveFileBase(line),points=payload.outer.points;
  if(kind==='dxf'){var dxf='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+shapeDxfPolyline(points,'CUT_OUTER')+'0\nENDSEC\n0\nEOF\n';salesDownloadBlob(dxf,'application/dxf',base+'.dxf');return;}
  var b=fabEdgeBounds(points),w=Math.max(.001,b.maxX-b.minX),h=Math.max(.001,b.maxY-b.minY),pad=Math.max(.25,Math.max(w,h)*.03),pts=points.map(function(p){return (p[0]-b.minX+pad)+','+(b.maxY-p[1]+pad);}).join(' ');salesDownloadBlob(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w+pad*2} ${h+pad*2}'><polygon points='${pts}' fill='none' stroke='black'/></svg>`,'image/svg+xml',base+'.svg');
}
function salesEffectiveMachineCard(line,shape,plan){var issue=salesEffectiveMachineIssue(line,shape,plan);if(issue)return `<div class='ss-machine blocked'><b>ORDER EFFECTIVE · machine cutting</b><span>BLOCKED · ${esc(issue)}</span></div>`;return `<div class='ss-machine ok'><div><b>ORDER EFFECTIVE · machine cutting</b><small>Same Effective edge map as Services & prices.</small></div><code>${esc(salesEffectiveProductionFingerprint(line,shape,plan))}</code><div><button onclick='salesDownloadEffectiveCutting("${esc(line.id)}","svg")'>Effective Cutting SVG</button><button onclick='salesDownloadEffectiveCutting("${esc(line.id)}","dxf")'>Effective Generic DXF</button></div></div>`;}
function salesLineEdgeworkModal(){
  var line=soDraft.lines.find(function(l){return l.id===soEdgeworkLineId;});if(!line)return '';var shape=salesLineGeometryShape(line),set=salesServiceSetById(soDraft,line.serviceSetId),snap=salesEffectiveProductionSnapshot(line,shape,soDraft),plan=salesEffectiveCuttingPlan(line,shape,soDraft),lost=salesLostOverrideEdges(line),dxf=shape&&shapeIsDxfSource(shape);
  var warning=!snap.valid?`<div class='ss-line-warning bad'>${esc(snap.reason)}</div>`:snap.mappingPending?`<div class='ss-line-warning warn'><b>${esc(set&&set.code||'Bulk Set')} is pending mapping.</b> Shape-owned processing remains active in Services; machine release is blocked until mapping is confirmed.</div>`:!plan.valid?`<div class='ss-line-warning bad'>${esc(plan.reason)}</div>`:lost.length?`<div class='ss-line-warning bad'>Lost override edge(s): ${esc(lost.join(', '))}</div>`:`<div class='ss-line-warning info'><b>Order Effective</b> = Shape + optional Bulk Set + optional Line Override + Makeup thickness.</div>`;
  var groups=snap.groups||[];
  return `<div class='sales-service-modal-back' onclick='if(event.target===this)salesCloseLineEdgework()'><div class='sales-service-modal line-modal'><div class='sales-service-modal-head'><div><span>Sales Order line ${esc(line.mark||line.id)}</span><h3>Effective Production</h3><small>${line.shapeRef&&line.shapeRef.id?esc(shape.name):'Width × Height rectangle'}${set?' · '+esc(set.code):''}</small></div><button onclick='salesCloseLineEdgework()'>×</button></div>${warning}<div class='ss-effective-workspace'><div class='ss-effective-visual'>${plan.valid?salesEffectivePreviewSvg(plan):`<div class='ss-cut-block'><b>CUTTING BLOCKED</b><span>${esc(plan.reason||snap.reason||'Unresolved')}</span></div>`}<div class='ss-effective-legend'><span>Finished</span><span>Cutting</span></div></div><div class='ss-effective-edges'>${groups.map(function(g){var ov=Object.prototype.hasOwnProperty.call((line.serviceOverrides&&line.serviceOverrides.edges)||{},g.id);return `<div class='ss-effective-edge'><div class='ss-effective-edge-head'><div><b>${esc(g.id.toUpperCase())}</b><small>${esc(dimIn(g.length))} · ${esc(g.side==='other'?'OTHER':g.side)}</small></div><div><span class='ss-source'>${esc(g.source)}</span>${g.allowance==null?'':`<b>${g.allowance?'+'+esc(dimIn(g.allowance)):'0″'}</b>`}</div></div><div class='ss-effective-opset'>${SALES_SERVICE_SET_OPS.map(function(type){var on=g.ops.some(function(o){return o.type===type;});return `<label class='ss-op ${on?'on':''}'><input type='checkbox' ${on?'checked':''} onchange='salesSetLineEdgeOp("${esc(line.id)}","${esc(g.id)}","${type}",this.checked)'><span>${esc(salesServiceShort(type))}</span></label>`;}).join('')}</div>${salesLineParamEditor(line,g)}${ov?`<button class='sm' onclick='salesRevertEdge("${esc(line.id)}","${esc(g.id)}")'>Return this edge to Set / Shape</button>`:''}</div>`;}).join('')||`<div class='empty compact'>No physical edges available.</div>`}</div></div>${dxf&&set&&set.mode==='sides'?salesDxfMappingHtml(line,shape):''}${salesEffectiveMachineCard(line,shape,plan)}<div class='ss-line-actions'>${salesHasLineEdgeOverrides(line)?`<button onclick='salesRevertAllEdges("${esc(line.id)}")'>Clear all line overrides</button>`:''}${lost.length?`<button class='dl' onclick='salesRemoveLostEdges("${esc(line.id)}")'>Remove lost overrides</button>`:''}${line.shapeRef&&line.shapeRef.id?`<button onclick='salesOpenShapeFromEdgework("${esc(line.id)}")'>Open Shape · standalone</button>`:''}<button class='pri' onclick='salesOpenLineServices("${esc(line.id)}")'>Open Services · same snapshot</button></div></div></div>`;
}
function salesOpenShapeFromEdgework(lineId){var i=soDraft.lines.findIndex(function(l){return l.id===lineId;});soEdgeworkLineId=null;if(i>=0)salesOrderConfigureShape(i);}

/* Existing Services modal remains authoritative for prices; dispatcher gains 2 new modal types. */
const __salesServiceServicesModal=salesServicesModal;
salesServicesModal=function(){if(soServiceSetOpen)return salesServiceSetsModal();if(soEdgeworkLineId)return salesLineEdgeworkModal();return __salesServiceServicesModal();};

/* Excel: optional Service Set column. */
const __salesServiceExcelModal=salesExcelModal;
salesExcelModal=function(){
  var m=salesCurrentMakeup();return `<div id='salesExcelModal' class='sales-modal-back'><div class='sales-modal'><div class='sales-modal-head'><div><h3>Paste Excel Rows</h3><span id='salesExcelCols'>${soExcelMode==='withSet'?'MU | SS | Qty | Width | Height | Mark':soExcelMode==='withMakeup'?'MU | Qty | Width | Height | Mark':'Qty | Width | Height | Mark'}</span></div><button onclick='salesExcelClose()'>×</button></div><div class='excel-mode'><button class='${soExcelMode==='current'?'on':''}' onclick='salesExcelSetMode("current");render()'>Current Makeup ${m?esc(m.code):''}</button><button class='${soExcelMode==='withMakeup'?'on':''}' onclick='salesExcelSetMode("withMakeup");render()'>MU first</button><button class='${soExcelMode==='withSet'?'on':''}' onclick='salesExcelSetMode("withSet");render()'>MU + SS</button></div><textarea id='salesExcelText' rows='10' placeholder='A&#9;S2&#9;1&#9;30&#9;80&#9;A1'></textarea><div class='sales-modal-actions'><button onclick='salesExcelClose()'>Cancel</button><button class='pri' onclick='salesExcelApply()'>Add Rows</button></div></div></div>`;
};
salesExcelSetMode=function(v){soExcelMode=v==='withSet'?'withSet':v==='withMakeup'?'withMakeup':'current';var hint=document.getElementById('salesExcelCols');if(hint)hint.textContent=soExcelMode==='withSet'?'MU | SS | Qty | Width | Height | Mark':soExcelMode==='withMakeup'?'MU | Qty | Width | Height | Mark':'Qty | Width | Height | Mark';};
salesExcelApply=function(){
  var text=document.getElementById('salesExcelText').value,rows=String(text||'').split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean),added=0,bad=0,current=salesCurrentMakeup();
  rows.forEach(function(row){var c=row.split(/\t|,|;/).map(function(x){return x.trim();}),mu=current,setId='',q,w,h,mark;
    if(soExcelMode==='withSet'){if(c.length<6){bad++;return;}mu=soDraft.makeups.find(function(m){return m.code.toUpperCase()===String(c[0]).toUpperCase();});var set=(soDraft.serviceSets||[]).find(function(s){return s.code.toUpperCase()===String(c[1]).toUpperCase();});if(c[1]&&!set){bad++;return;}setId=set?set.id:'';q=salesPositiveInt(c[2],0);w=salesDimTo16(c[3]);h=salesDimTo16(c[4]);mark=c[5];}
    else if(soExcelMode==='withMakeup'){if(c.length<5){bad++;return;}mu=soDraft.makeups.find(function(m){return m.code.toUpperCase()===String(c[0]).toUpperCase();});q=salesPositiveInt(c[1],0);w=salesDimTo16(c[2]);h=salesDimTo16(c[3]);mark=c[4];}
    else{if(c.length<4){bad++;return;}q=salesPositiveInt(c[0],0);w=salesDimTo16(c[1]);h=salesDimTo16(c[2]);mark=c[3];}
    if(!mu||!q||!w||!h){bad++;return;}soDraft.lines.push(normalizeSalesOrderLine({makeupId:mu.id,serviceSetId:setId,qty:q,width16:w,height16:h,mark:mark}));added++;
  });
  salesExcelClose();render();if(bad)alert('Rows added: '+added+'. Skipped: '+bad);else if(added)alert('Rows added: '+added);
};

/* Clear transient Service Set UI whenever the operator changes order. */
function salesResetServiceSetUi(){soServiceSetOpen=false;soServiceSetEditingId=null;soServiceSetDraft=null;soEdgeworkLineId=null;soServiceFilter='all';soBulkServiceSetId='';soBulkServicePolicy='keep';soServiceBulkPreview=null;}
const __salesServiceOrderNew=salesOrderNew,__salesServiceOrderEdit=salesOrderEdit,__salesServiceOrderClose=salesOrderClose;
salesOrderNew=function(){salesResetServiceSetUi();return __salesServiceOrderNew();};
salesOrderEdit=function(id){salesResetServiceSetUi();return __salesServiceOrderEdit(id);};
salesOrderClose=function(){salesResetServiceSetUi();return __salesServiceOrderClose();};
