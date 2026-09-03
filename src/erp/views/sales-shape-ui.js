/* =====================================================================
   view/sales/shape-ui · schema-v2
   Полный редактор finished geometry, features, edgework и cutting output.
   Геометрия и экспорт принадлежат modules/shape/*; экран только редактирует.
   ===================================================================== */

let sEdit=null,sDraft=null,sView='setup',sWorkspaceTab='designer',sEdgeworkOpen=false,sFeaturesOpen=false,sFeatureExpandedId=null,sSourceOpen=false,sManufacturingOpen=false,sManufacturingPlace=null,sManufacturingSelected=null;
/* Карточка, у которой открыт ввод своей модели. Состояние экрана, а не
   данных: пока имя не вписано, «своя модель» и «модель не выбрана» выглядят
   в записи одинаково — у обеих пустые id и имя. */
let sManufacturingCustomId=null;
/* Размер, у которого открыта панель управления прямо на чертеже. */
let sDimEdit=null,sMetricDimEdit=null;
/* Редко используемый метрический слой — только состояние экрана. Он не входит
   в Shape definition и потому никогда не меняет ревизию или fingerprint. */
var SHAPE_METRIC_STORAGE_KEY='glass_erp_shape_metric_detail',SHAPE_METRIC_OFFSETS_STORAGE_KEY='glass_erp_shape_metric_offsets_v1',sMetricDetail=false,sMetricOffsets={};
try{sMetricDetail=localStorage.getItem(SHAPE_METRIC_STORAGE_KEY)==='1';}catch(e){}
try{var metricStored=JSON.parse(localStorage.getItem(SHAPE_METRIC_OFFSETS_STORAGE_KEY)||'{}');if(metricStored&&typeof metricStored==='object')sMetricOffsets=metricStored;}catch(e){}
function setShapeMetricDetail(value){
  sMetricDetail=!!value;sMetricDimEdit=null;
  try{localStorage.setItem(SHAPE_METRIC_STORAGE_KEY,sMetricDetail?'1':'0');}catch(e){}
  render();
}
function toggleShapeMetricDetail(){setShapeMetricDetail(!sMetricDetail);}
function shapeMetricToggleButton(disabled){
  var off=!!disabled;
  return `<button type='button' class='shape-metric-toggle ${sMetricDetail&&!off?'on':''}' ${off?'disabled':''} onclick='toggleShapeMetricDetail()' title='Metric detail · mm and angles' aria-label='Metric detail · mm and angles' aria-pressed='${sMetricDetail&&!off?'true':'false'}'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M4 19h16M6 19v-3m4 3v-2m4 2v-3m4 3v-2'/><path d='M5 13l5-7 5 7M10 6v7h7'/></svg></button>`;
}
function shapeMetricSelectedLite(){
  var selected=sEdgeLite;
  if(selected==null&&typeof salesBridge!=='undefined'&&salesBridge&&salesBridge.kind==='shape'&&salesBridge.liteIndex!=null)selected=salesBridge.liteIndex;
  return selected;
}
function shapeMetricOffsetScope(result,selected,mode){
  var d=(result&&result.definition)||sDraft||{},id=d.id||d.name||'draft';
  return 'shape:'+String(id)+(mode==='inch'?'|inches':'|lite:'+(selected==null?'outer':selected));
}
function shapeCurrentDrawingOffsetScope(result){return sMetricDetail?shapeMetricOffsetScope(result,shapeMetricSelectedLite()):shapeMetricOffsetScope(result,null,'inch');}
function shapeMetricSaveOffsets(){try{localStorage.setItem(SHAPE_METRIC_OFFSETS_STORAGE_KEY,JSON.stringify(sMetricOffsets));}catch(e){}}
function shapeSelectMetricLabel(key){
  var r=shapeDraftResult(),scope=shapeCurrentDrawingOffsetScope(r),same=sMetricDimEdit&&sMetricDimEdit.scope===scope&&sMetricDimEdit.key===key;
  sDimEdit=null;sMetricDimEdit=same?null:{scope:scope,key:key};refreshShapeEditor();
}
function shapeNudgeMetricLabel(key,delta){
  var r=shapeDraftResult(),scope=shapeCurrentDrawingOffsetScope(r),map=sMetricOffsets[scope]||(sMetricOffsets[scope]={});
  var next=Math.max(-4,Math.min(8,(+map[key]||0)+(delta<0?-1:1)));
  if(next)map[key]=next;else delete map[key];
  if(!Object.keys(map).length)delete sMetricOffsets[scope];
  sMetricDimEdit={scope:scope,key:key};shapeMetricSaveOffsets();refreshShapeEditor();
}
function shapeMetricProductionOptions(result,interactive){
  if(!sMetricDetail){
    var inchScope=shapeMetricOffsetScope(result,null,'inch');
    return {annotation:{offsets:Object.assign({},sMetricOffsets[inchScope]||{}),interactive:!!interactive,selectedKey:interactive&&sMetricDimEdit&&sMetricDimEdit.scope===inchScope?sMetricDimEdit.key:null}};
  }
  var metric={thicknessMm:shapeThicknessMm((result&&result.definition)||sDraft||{})};
  var selected=shapeMetricSelectedLite(),scope=shapeMetricOffsetScope(result,selected);
  metric.offsets=Object.assign({},sMetricOffsets[scope]||{});
  metric.interactive=!!interactive;
  metric.selectedKey=metric.interactive&&sMetricDimEdit&&sMetricDimEdit.scope===scope?sMetricDimEdit.key:null;
  if(selected!=null){
    var lites=shapeEditorLites(),lite=lites.find(function(l){return l.index===selected;});
    metric.liteLabel=(lite&&lite.label)||('Lite '+(selected+1));
    if(lite&&isFinite(+lite.mm)&&+lite.mm>0)metric.thicknessMm=+lite.mm;
    /* На общей форме выбранный лайт может иметь inset, зеркало или свою форму.
       Контур подменяется явно; сама метрическая функция остаётся чистой. */
    if(sEdgeLite!=null){
      var pts=shapeLiteContourPoints(selected);
      if(pts&&pts.length>=3){
        metric.points=pts;
        var line=(typeof soDraft!=='undefined'&&soDraft&&typeof salesBridge!=='undefined'&&salesBridge&&salesBridge.kind==='shape')?(soDraft.lines||[]).find(function(l){return l.id===salesBridge.lineId;}):null;
        var own=line?salesLineLiteShape(line,selected):null,source=own?ShapeModule.compute(own):result;
        metric.edgeIds=source&&source.geometry?(source.geometry.edges||[]).map(function(e){return e.id;}):[];
      }
    }
  }
  return {metric:metric};
}

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
  var presetOptions=shapePresetChoices().map(function(p){return `<option value='${esc(p.id)}'>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  return `${sEdit!==null?'':`<div class='real-module-note'><b>Shape schema v2</b><span>Finished Geometry, Production Drawing и Cutting Geometry формируются из одной ревизии. Для DXF из Fusion 360 ERP хранит метаданные, лёгкий 2D-контур превью и габариты; исходное содержимое DXF в localStorage не сохраняется.</span></div>`}
    ${sEdit!==null?shapeForm():''}
    <table><thead><tr><th>Название / тип</th><th>Габарит</th><th>Кромок</th><th>Features</th><th>Статус</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">пусто</td></tr>'}</tbody></table>
    ${sEdit===null?`<div class='shape-new-row'><select id='s_new_type'>${presetOptions}</select><button class='pri' onclick='openShapeNew(document.getElementById("s_new_type").value)'>Новая фигура</button></div>`:''}`;
}

function openShapeNew(type){shapeResetMarkAnchors();sEdit='new';sView='setup';sWorkspaceTab='designer';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;sFeatureExpandedId=null;sSourceOpen=false;sManufacturingOpen=false;sManufacturingPlace=null;sManufacturingSelected=null;sManufacturingCustomId=null;sDimEdit=null;sDraft=newShapeDef(type||'smart');sDraft.name=shapePresetInfo(sDraft.type).label;if(typeof setSidebarCollapsed==='function')setSidebarCollapsed(true,false);render();}
function openShapeEdit(i){shapeResetMarkAnchors();sEdit=i;sView='setup';sWorkspaceTab='designer';sEdgeLite=null;sEdgeworkOpen=false;sFeaturesOpen=false;sFeatureExpandedId=null;sSourceOpen=false;sManufacturingOpen=false;sManufacturingPlace=null;sManufacturingSelected=null;sManufacturingCustomId=null;sDimEdit=null;sDraft=normalizeShapeDef(JSON.parse(JSON.stringify(DB.shapeDef[i])));if(typeof setSidebarCollapsed==='function')setSidebarCollapsed(true,false);render();}
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
function shapeParaDraftValues(){return shapeParallelogramValues(sDraft.w,sDraft.h,sDraft.params||{});}
function shapeParaRemember(q){
  if(!q||!q.ok)return q;if(!sDraft.params)sDraft.params={};
  sDraft.params.outOfSquare=shapeParaDimText(q.outOfSquare);
  sDraft.params.diagonal=shapeParaDimText(q.diagonal);
  sDraft.params.angle=shapeParaAngleText(q.angle);
  if(q.mode==='diagonal-angle'){
    if(q.sideways)sDraft.h=shapeParaDimText(q.height);else sDraft.w=shapeParaDimText(q.width);
  }
  return q;
}
function shapeParaApplyResolved(){return shapeParaRemember(shapeParaDraftValues());}
function setShapeParaMeasure(v){
  shapeParaRemember(shapeParaDraftValues());sDraft.params.measureMode=shapeParaMeasure(v);shapeParaApplyResolved();render();
}
function setShapeParaDirection(v){
  shapeParaRemember(shapeParaDraftValues());sDraft.params.slopeDirection=shapeParaDirection(v);shapeParaApplyResolved();render();
}
function shapeTriDraftValues(){return shapeTriangleValues(sDraft.w,sDraft.h,sDraft.params||{});}
/* Второй набор измерений пересчитывается на каждом вводе. Поэтому переключение
   Measure не двигает уже построенный треугольник: режим берёт готовые числа,
   а не строит фигуру заново из того, что осталось в полях. */
function shapeTriRemember(q){
  if(!q||!q.ok)return q;if(!sDraft.params)sDraft.params={};
  if(q.mode==='diagonal'){sDraft.h=shapeParaDimText(q.height);sDraft.params.topOffset=shapeParaDimText(q.topOffset);}
  else{sDraft.params.leftEdge=shapeParaDimText(q.leftEdge);sDraft.params.rightEdge=shapeParaDimText(q.rightEdge);}
  return q;
}
function shapeTriApplyResolved(){return shapeTriRemember(shapeTriDraftValues());}
function setShapeTriMeasure(v){
  shapeTriRemember(shapeTriDraftValues());sDraft.params.measureMode=shapeTriMeasure(v);shapeTriApplyResolved();render();
}
function setShapeField(k,v){sDraft[k]=v;if(sDraft.type==='circle'&&(k==='w'||k==='h')){sDraft.w=v;sDraft.h=v;}if(sDraft.type==='parallelogram')shapeParaApplyResolved();if(sDraft.type==='triangle')shapeTriApplyResolved();refreshShapeEditor();}
function setShapeParam(k,v){sDraft.params[k]=v;if(sDraft.type==='parallelogram')shapeParaApplyResolved();if(sDraft.type==='triangle')shapeTriApplyResolved();if(sDraft.type==='polygon')shapePolyApplyResolved();refreshShapeEditor();}
function setShapeC(v){var S=shapeDraftLine();S.shape.smart.C.len=v;sDraft.smart=S.shape.smart;refreshShapeEditor();}
function setShapeElbows(v){sDraft.smart.elbowsOn=!!v;render();}
function setShapeSimple(edge,k,v){sDraft.smart[edge][k]=v||null;refreshShapeEditor();}
function setShapeElbow(edge,k,v){sDraft.smart[edge].elbow[k]=v||null;refreshShapeEditor();}
/* Чистка идёт ДО render(): панель ошибок рисуется раньше блока Smart-полей, и
   уборка только в нём оставляла бы красный «missing edge» висеть ещё один кадр. */
function setShapeCorner(c,v){var S=shapeDraftLine();S.shape.smart.corners[c]=v;ssSyncExtra(S);sDraft.smart=S.shape.smart;shapePruneExtraEdgeOps(sDraft.smart);render();}
function setShapeCornerOffset(c,k,v){sDraft.smart.cornerOffsets[c][k]=v||(k.indexOf('Dir')>=0?null:'');refreshShapeEditor();}
function setShapeExtra(id,v){if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};sDraft.smart.extraEdges[id].len=v;refreshShapeEditor();}
/* Скос ребра нотча: out — величина ухода, dir — направление. */
function setShapeExtraOut(id,k,v){
  if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};
  sDraft.smart.extraEdges[id][k]=(k==='dir')?(v||null):v;
  refreshShapeEditor();
}
/* Правка геометрии всегда идёт через одну дверь: перед ней снимаются привязки
   меток, после — восстанавливаются. Список закрытый и явный, чтобы случайная
   функция не начала двигать метки за спиной у оператора. Обёртка не зовёт
   render(): расстояния в карточках как раз не меняются, а полный ререндер сбил
   бы фокус в поле, где сейчас печатают размер. */
['setShapeField','setShapeParam','setShapeC','setShapeElbows','setShapeSimple','setShapeElbow',
 'setShapeCorner','setShapeCornerOffset','setShapeExtra','setShapeExtraOut'].forEach(function(name){
  var original=typeof window!=='undefined'?window[name]:null;
  if(typeof original!=='function')return;
  window[name]=function(){var args=arguments;return shapeGeometryEdit(function(){return original.apply(null,args);});};
});
function setShapeView(v){if(shapeIsDxfSource(sDraft)){if(v!=='production'&&v!=='cutting')return;sView=v;refreshShapeEditor();return;}sView=v;refreshShapeEditor();}
function setShapeWorkspaceTab(v){sWorkspaceTab=v==='cutout'?'cutout':'designer';sDimEdit=null;render();}
/* Cutout — ОДНА секция. Раньше их было две («Manufacturing items» и
   «Geometry modifiers»), и одно и то же посадочное место можно было завести
   двумя разными способами. Флаг остался один: sFeaturesOpen сохранён только
   для старых вызовов и на разметку больше не влияет. */
function toggleShapeSection(section){if(section==='edgework')sEdgeworkOpen=!sEdgeworkOpen;if(section==='features'||section==='manufacturing'||section==='cutout')sManufacturingOpen=!sManufacturingOpen;render();}
function toggleShapeFeatureCard(id){sManufacturingSelected=null;sFeatureExpandedId=sFeatureExpandedId===id?null:id;render();}

function setShapeType(type){
  type=shapeType(type);if(type===sDraft.type)return;
  var linked=Object.keys(sDraft.edgeOps||{}).length||(sDraft.features||[]).some(function(f){return f.type==='radius'||f.type==='hardware';});
  if(linked&&!confirm('Changing the shape type will remove topology-bound radii, hardware prep and edgework. Continue?')){render();return;}
  sDraft.type=type;sDraft.params=shapeDefaultParams(type);sDraft.edgeOps={};sDraft.features=(sDraft.features||[]).filter(function(f){return f.type!=='radius'&&f.type!=='hardware';});
  if(type==='polygon'||type==='custom')sDraft.polygon=shapeNormalizePolygon(null);
  if(type==='circle')sDraft.h=sDraft.w;
  render();
}

/* ---------- Manufacturing items / derived Services ----------
   One click in the editor creates one production mark. The mark belongs to the
   Shape revision and is visible on the Production Drawing, but it never changes
   the DXF/cutting contour. Commercial Services are calculated from the marks. */
function shapeManufacturingItems(){if(!sDraft.manufacturingItems)sDraft.manufacturingItems=[];return sDraft.manufacturingItems;}
/* Имя и короткий код вида приходят из справочника фурнитуры: там владелец
   заводит пивоты и всё остальное сам. Hole в справочнике нет намеренно —
   отверстие не фурнитура, у него своя единица и свой прайс по диаметру. */
function shapeManufacturingItemTitle(type){
  if(type==='hole')return 'Hole';
  return hardwareKindIsKnown(type)?hardwareKindName(type):shapeMiOperationName(type);
}
function shapeHoleName(item){var count=shapeHoleCount(item);return count===3?'Hole Triple':count===2?'Hole Double':'Hole Single';}
function shapeManufacturingShort(type,item){var count=shapeHoleCount(item);return type==='hole'?(count===3?'HOL3':count===2?'HOL2':'HOLE'):hardwareKindShort(type);}
/* Модель, как её видит цех. Пусто = модель ещё не выбрана: это не ошибка
   расчёта, но по чертежу тогда непонятно, какой шаблон брать. */
function shapeManufacturingModelName(item){return hardwareItemModelName(item);}
/* Подпись метки на чертеже. Модель выводится КОРОТКИМ именем: `GEN37` читается
   и с экрана, и с бумаги, а `HNG · Geneva 37` в ту же строку не влезает. Кода
   вида рядом с моделью нет намеренно — `GEN37` уже говорит, что это петля. Без
   модели остаётся код вида: `CLMP` лучше, чем пустое место. */
function shapeMarkDrawingLabel(item){
  if(item&&item.type==='hole')return shapeHoleName(item).toUpperCase();
  return hardwareItemModelShort(item)||shapeManufacturingShort(item.type);
}
function shapeSnapManufacturing16(v){var n=+v;return isFinite(n)?Math.round(n*16)/16:NaN;}
function shapeFrac16(v){
  var n=shapeSnapManufacturing16(v);if(!isFinite(n))return '';var sign=n<0?'-':'';n=Math.abs(n);var whole=Math.floor(n+1e-9),num=Math.round((n-whole)*16);if(num===16){whole++;num=0;}if(!num)return sign+String(whole);var a=num,b=16;while(b){var t=a%b;a=b;b=t;}num/=a;var den=16/a;return sign+(whole?whole+' ':'')+num+'/'+den;
}
function shapeDim16(v){return shapeFrac16(v)+'″';}
/* Короткое число для листа: единицы указаны в примечании чертежа. */
function shapeDrawingDim16(v){return shapeFrac16(v);}
function shapeManufacturingGeometry(){
  if(shapeIsDxfSource(sDraft)){var source=shapeNormalizeSource(sDraft.source),P=source.preview.points||[];if(P.length<3)return null;return {P:P,b:fabEdgeBounds(P)};}
  var r=shapeDraftResult();if(!r||!r.valid||!(r.points||[]).length)return null;return {P:r.points,b:fabEdgeBounds(r.points)};
}
/* Датумы размера для точки: где проходит кромка слева, справа, снизу и сверху
   НА УРОВНЕ самой точки. У прямой стороны это совпадает с габаритом и цифра не
   меняется; у скошенной, у нотча и у выреза берётся сама кромка. Владелец:
   «кладу на левый край, а меряет от правого» — так и было, пока отсчёт шёл от
   габаритного прямоугольника, который у скошенной детали стоит на дальнем углу. */
function shapeRefDatums(g,x,y){
  var b=(g&&g.b)||{minX:0,maxX:0,minY:0,maxY:0},P=(g&&g.P)||[],p=[x,y];
  var l=fabAxisEdgeCoord(P,p,'h','left'),r=fabAxisEdgeCoord(P,p,'h','right'),
      bo=fabAxisEdgeCoord(P,p,'v','bottom'),t=fabAxisEdgeCoord(P,p,'v','top');
  return {left:l==null?b.minX:l,right:r==null?b.maxX:r,bottom:bo==null?b.minY:bo,top:t==null?b.maxY:t};
}
/* ---------- Метка держится за свой край ----------
   Владелец 2 сентября 2026: «если изменить высоту фигуры с учётом отверстия, то
   метка пусть следует расстоянию, указанному от края». В записи по-прежнему
   лежат абсолютные координаты — они нужны раскрою, чертежу и DXF, — поэтому
   перед правкой геометрии снимаются расстояния до привязанных кромок, а после
   правки координаты восстанавливаются по ним.

   sMarkAnchorHold — метки, которым новое место не подошло: при уменьшении
   фигуры центр вышел бы за контур. Такая метка остаётся на месте, но её
   расстояние помнится «в долг» и возвращается, как только фигура снова
   вырастет. Без этого набранная в поле высота «36» после промежуточного «3»
   возвращала метку не туда, откуда её увели. */
var sMarkAnchorHold={},sMarkAnchorLast=null;
function shapeResetMarkAnchors(){sMarkAnchorHold={};sMarkAnchorLast=null;}
function shapeCaptureMarkAnchors(){
  /* Мерить не по чему: контур сейчас невалиден. Отдаём последнюю снятую
     привязку — по ней метка и вернётся, когда фигуру починят. Набранная в поле
     высота проходит через невалидные промежуточные состояния постоянно. */
  var g=shapeManufacturingGeometry();if(!g)return null;
  var snap={holes:{},points:{},cutouts:{},edges:{}},held=sMarkAnchorHold;
  var defs=shapeManufacturingEdgeDefs(g);
  /* Долг записан уже в виде привязки, свежий замер — в виде позиции: у них
     разные имена полей, и читать их надо по-разному. */
  function anchorOf(id,pos){
    if(held[id])return {hRef:held[id].hRef,vRef:held[id].vRef,h:held[id].h,v:held[id].v};
    return pos?{hRef:pos.hRef,vRef:pos.vRef,h:pos.hDistance,v:pos.vDistance}:null;
  }
  shapeManufacturingItems().forEach(function(item){
    if(item.type==='hole'){
      var a=anchorOf(item.id,shapeManufacturingHolePosition(item,g));
      if(a)snap.holes[item.id]=a;
      return;
    }
    var ed=defs[item.edge||'left'];
    if(ed)snap.edges[item.id]={edge:item.edge||'left',shown:shapeMiShownDistance(item,ed.len)};
  });
  ((sDraft&&sDraft.features)||[]).forEach(function(f){
    if(f.type==='stamp'||f.type==='sandblast'){
      var sp=anchorOf(f.id,shapeStampPosition(f,g));
      if(sp)snap.points[f.id]=sp;
    }else if(f.type==='cutout'){
      var cp=anchorOf(f.id,shapeCutoutCenterPosition(f,g));
      if(cp)snap.cutouts[f.id]=cp;
    }
  });
  sMarkAnchorLast=snap;
  return snap;
}
/* Датумы зависят от точки, а точка — от датумов: у скошенной кромки левый край
   на новой высоте стоит уже в другом месте. Решается парой итераций от старого
   положения; на прямых сторонах сходится с первого раза. */
function shapeSolveAnchorPoint(g,a,x0,y0){
  var x=x0,y=y0,i,d,nx,ny;
  for(i=0;i<5;i++){
    d=shapeRefDatums(g,x,y);
    nx=shapeSnapManufacturing16(a.hRef==='right'?d.right-a.h:d.left+a.h);
    ny=shapeSnapManufacturing16(a.vRef==='top'?d.top-a.v:d.bottom+a.v);
    if(!isFinite(nx)||!isFinite(ny))return null;
    if(Math.abs(nx-x)<1/64&&Math.abs(ny-y)<1/64){x=nx;y=ny;break;}
    x=nx;y=ny;
  }
  return fabPointInPoly([x,y],g.P)?[x,y]:null;
}
function shapeApplyMarkAnchors(snap){
  if(!snap)return false;
  var g=shapeManufacturingGeometry();if(!g)return false;
  var moved=false,defs=shapeManufacturingEdgeDefs(g);
  function place(id,anchor,x0,y0,commit){
    var p=shapeSolveAnchorPoint(g,anchor,x0,y0);
    if(!p){sMarkAnchorHold[id]=anchor;return;}
    delete sMarkAnchorHold[id];
    if(Math.abs(p[0]-x0)>1e-9||Math.abs(p[1]-y0)>1e-9){if(commit(p))moved=true;}
  }
  shapeManufacturingItems().forEach(function(item){
    var a=snap.holes[item.id];
    if(a&&item.type==='hole'){
      place(item.id,a,item.x,item.y,function(p){
        if(shapeHolePairProblem(Object.assign({},item,{x:p[0],y:p[1]}),g))return false;
        item.x=p[0];item.y=p[1];return true;
      });
      return;
    }
    var e=snap.edges[item.id],ed=e&&defs[e.edge];
    if(!ed)return;
    var d=shapeMiRefIsEnd(item.id)?ed.len-e.shown:e.shown;
    d=shapeSnapManufacturing16(Math.max(0,Math.min(ed.len,d)));
    if(isFinite(d)&&Math.abs(d-(+item.distance||0))>1e-9){item.distance=d;moved=true;}
  });
  ((sDraft&&sDraft.features)||[]).forEach(function(f){
    var a=snap.points[f.id];
    if(a&&(f.type==='stamp'||f.type==='sandblast')){
      place(f.id,a,inch(f.x),inch(f.y),function(p){f.x=shapeFrac16(p[0]);f.y=shapeFrac16(p[1]);return true;});
      return;
    }
    var c=snap.cutouts[f.id];
    if(c&&f.type==='cutout'){
      var cw=inch(f.width)/2,ch=inch(f.height)/2;
      place(f.id,c,inch(f.x)+cw,inch(f.y)+ch,function(p){
        f.x=frac64(shapeSnapManufacturing16(p[0]-cw));f.y=frac64(shapeSnapManufacturing16(p[1]-ch));return true;
      });
    }
  });
  return moved;
}
function shapeGeometryEdit(fn){
  if(!sDraft)return fn();
  var snap=shapeCaptureMarkAnchors()||sMarkAnchorLast;
  var out=fn();
  if(shapeApplyMarkAnchors(snap))refreshShapeEditor();
  return out;
}
function shapeManufacturingRelative(item){var g=shapeManufacturingGeometry();if(!g||item.type!=='hole')return {x:0,y:0};return {x:shapeSnapManufacturing16(item.x-g.b.minX),y:shapeSnapManufacturing16(item.y-g.b.minY)};}
function shapeManufacturingHolePosition(item,g){
  g=g||shapeManufacturingGeometry();if(!g||!item||item.type!=='hole')return null;
  var hRef=item.hRef==='right'?'right':'left',vRef=item.vRef==='top'?'top':'bottom',dat=shapeRefDatums(g,item.x,item.y);
  var left=shapeSnapManufacturing16(item.x-dat.left),right=shapeSnapManufacturing16(dat.right-item.x),bottom=shapeSnapManufacturing16(item.y-dat.bottom),top=shapeSnapManufacturing16(dat.top-item.y);
  return {hRef:hRef,vRef:vRef,hDistance:hRef==='right'?right:left,vDistance:vRef==='top'?top:bottom,left:left,right:right,bottom:bottom,top:top,
    hDatum:hRef==='right'?dat.right:dat.left,vDatum:vRef==='top'?dat.top:dat.bottom};
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
  var x=item.x,y=item.y,dat=shapeRefDatums(g,item.x,item.y);
  if(axis==='h')x=(item.hRef==='right'?dat.right-d:dat.left+d);
  else if(axis==='v')y=(item.vRef==='top'?dat.top-d:dat.bottom+d);
  else return;
  x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  var moved=Object.assign({},item,{x:x,y:y}),problem=shapeHolePairProblem(moved,g);
  if(!fabPointInPoly([x,y],g.P)||problem){alert(problem||'The hole center must stay inside the finished glass contour.');render();return;}
  item.x=x;item.y=y;render();
}
function shapeHolePairProblem(item,g){
  var count=shapeHoleCount(item);if(count===1)return '';
  var d=fabParseDimStrict(item.diameter),centers=shapeHoleCenters(item);
  if(count===2){var spacing=shapeHoleSpacing(item);if(!isFinite(spacing)||!(spacing>0))return 'Center-to-center distance must be greater than zero.';if(d.ok&&spacing<d.v-1e-9)return 'Center-to-center distance cannot be smaller than the hole diameter.';}
  else{var vs=shapeHoleTripleVSpacing(item),hs=shapeHoleTripleHSpacing(item);if(!isFinite(vs)||!(vs>0))return 'Vertical center-to-center distance must be greater than zero.';if(d.ok&&vs<d.v-1e-9)return 'Vertical center-to-center distance cannot be smaller than the hole diameter.';if(!isFinite(hs)||!(hs>0))return 'Horizontal center-to-center distance must be greater than zero.';if(d.ok&&hs<d.v-1e-9)return 'Horizontal center-to-center distance cannot be smaller than the hole diameter.';}
  if(!g||!centers.every(function(c){return fabPointInPoly(c,g.P);}))return 'All hole centers must stay inside the finished glass contour.';
  return '';
}
function shapePruneHoleInternalDimState(id,keep){
  var all=sDraft&&sDraft.dims,entry=all&&all[id];if(!entry)return;
  ['c','cv','ch'].forEach(function(axis){if(keep.indexOf(axis)<0)delete entry[axis];});
  if(!Object.keys(entry).length)delete all[id];
}
function shapeSetHoleCount(id,count){
  var item=shapeManufacturingItemById(id);if(!item||item.type!=='hole')return;
  count=+count;var g=shapeManufacturingGeometry(),next,problem;
  if(count===2){next=Object.assign({},item,{count:2,spacing:isFinite(shapeHoleSpacing(item))?shapeHoleSpacing(item):(isFinite(shapeHoleTripleVSpacing(item))?shapeHoleTripleVSpacing(item):SHAPE_HOLE_DROP_SPACING),axis:shapeHoleAxis(item)});problem=shapeHolePairProblem(next,g);if(problem&&next.axis==='horizontal'){next.axis='vertical';problem=shapeHolePairProblem(next,g);}if(problem){alert(problem);render();return;}item.count=2;item.spacing=next.spacing;item.axis=next.axis;delete item.verticalSpacing;delete item.horizontalSpacing;delete item.horizontalDirection;shapePruneHoleInternalDimState(id,['c']);}
  else if(count===3){next=Object.assign({},item,{count:3,verticalSpacing:isFinite(shapeHoleTripleVSpacing(item))?shapeHoleTripleVSpacing(item):(isFinite(shapeHoleSpacing(item))?shapeHoleSpacing(item):SHAPE_HOLE_DROP_VSPACING),horizontalSpacing:isFinite(shapeHoleTripleHSpacing(item))?shapeHoleTripleHSpacing(item):SHAPE_HOLE_DROP_HSPACING,horizontalDirection:shapeHoleTripleDirection(item)});problem=shapeHolePairProblem(next,g);if(problem&&next.horizontalDirection==='right'){next.horizontalDirection='left';problem=shapeHolePairProblem(next,g);}if(problem){alert(problem);render();return;}item.count=3;item.verticalSpacing=next.verticalSpacing;item.horizontalSpacing=next.horizontalSpacing;item.horizontalDirection=next.horizontalDirection;delete item.spacing;delete item.axis;shapePruneHoleInternalDimState(id,['cv','ch']);}
  else{delete item.count;delete item.spacing;delete item.axis;delete item.verticalSpacing;delete item.horizontalSpacing;delete item.horizontalDirection;shapePruneHoleInternalDimState(id,[]);}
  render();
}
function shapeSetHoleSpacing(id,value){
  var item=shapeManufacturingItemById(id),p=fabParseDimStrict(value);if(!item||item.type!=='hole'||shapeHoleCount(item)!==2)return;
  var spacing=p.ok?shapeSnapManufacturing16(p.v):NaN,next=Object.assign({},item,{spacing:spacing}),problem=shapeHolePairProblem(next,shapeManufacturingGeometry());
  if(problem){alert(problem);render();return;}item.spacing=spacing;render();
}
function shapeSetHoleAxis(id,value){
  var item=shapeManufacturingItemById(id);if(!item||item.type!=='hole'||shapeHoleCount(item)!==2)return;
  var next=Object.assign({},item,{axis:value==='vertical'?'vertical':'horizontal'}),problem=shapeHolePairProblem(next,shapeManufacturingGeometry());if(problem){alert(problem);render();return;}item.axis=next.axis;render();
}
function shapeSetHoleTripleSpacing(id,axis,value){
  var item=shapeManufacturingItemById(id),p=fabParseDimStrict(value);if(!item||item.type!=='hole'||shapeHoleCount(item)!==3)return;
  var key=axis==='h'?'horizontalSpacing':'verticalSpacing',spacing=p.ok?shapeSnapManufacturing16(p.v):NaN,next=Object.assign({},item);next[key]=spacing;
  var problem=shapeHolePairProblem(next,shapeManufacturingGeometry());if(problem){alert(problem);render();return;}item[key]=spacing;render();
}
function shapeSetHoleTripleDirection(id,value){
  var item=shapeManufacturingItemById(id);if(!item||item.type!=='hole'||shapeHoleCount(item)!==3)return;
  var next=Object.assign({},item,{horizontalDirection:value==='left'?'left':'right'}),problem=shapeHolePairProblem(next,shapeManufacturingGeometry());if(problem){alert(problem);render();return;}item.horizontalDirection=next.horizontalDirection;render();
}
/* Удаление живёт в ШАПКЕ карточки. Владелец: «если я хочу удалить хардвеар,
   мне нужно открывать аккордеон» — лишний шаг ради одной кнопки. Разметка та
   же, что у карточек геометрии: заголовок-кнопка плюс «×» рядом. */
function shapeCardDeleteHTML(call){
  return `<button type='button' class='sm dl shape-card-del' title='Delete' aria-label='Delete' onclick='event.stopPropagation();${call}'>×</button>`;
}
/* ---------- Нотч как оплачиваемая работа ----------
   Владелец 2 сентября 2026: «при нажатии на любой нотч пусть появляется сервис
   notch, от меня будет зависеть только решение hand or cnc — переменных очень
   много». Поэтому у нотча в Cutout своя карточка: геометрия остаётся в Shape
   Designer, здесь выбирается только способ, и он попадает в список услуг. */
const SHAPE_NOTCH_CORNERS=[{k:'tl',label:'Top left'},{k:'tr',label:'Top right'},
  {k:'br',label:'Bottom right'},{k:'bl',label:'Bottom left'}];
function shapeNotchCorners(){
  if(!sDraft||shapeIsDxfSource(sDraft))return [];
  var names={};SHAPE_NOTCH_CORNERS.forEach(function(c){names[c.k]=c.label;});
  return ssNotchList(sDraft).map(function(n){return {k:n.corner,label:names[n.corner]||n.corner,mode:n.mode,pieces:n.pieces,method:n.method};});
}
function shapeNotchMethodLabel(method){return ssNotchLabel(method);}
function setShapeNotchMethod(k,v){
  if(!sDraft||!sDraft.smart)return;
  if(!sDraft.smart.notch)sDraft.smart.notch={};
  sDraft.smart.notch[k]=v==='cnc'?'cnc':'hand';
  render();
}
/* Одна строка на угол: значок, где нотч, сколько их там и способ. Размеры и
   скос правятся в Shape Designer, снимается нотч там же — подсказки об этом
   живут в коде, а не на экране. */
function shapeNotchCardsHTML(){
  var rows=shapeNotchCorners();if(!rows.length)return '';
  return `<div class='shape-notch-list'>${rows.map(function(n){
    return `<div class='shape-notch-row'><span class='shape-mi-kind notch'>NOTCH</span><b>${esc(n.label)}</b><span>${esc(String(n.mode))}${n.pieces>1?' · ×'+n.pieces:''}</span><select onchange='setShapeNotchMethod("${esc(n.k)}",this.value)'><option value='hand' ${n.method==='hand'?'selected':''}>Hand notch</option><option value='cnc' ${n.method==='cnc'?'selected':''}>CNC notch</option></select></div>`;
  }).join('')}</div>`;
}
function shapeManufacturingEdgeLabel(edge){return edge==='left'?'Left':edge==='right'?'Right':edge==='top'?'Top':'Bottom';}
/* ---------- Привязка размера и его оформление ----------
   У отверстия привязку задают его собственные hRef/vRef. У фурнитуры и выреза
   она живёт в карте оформления фигуры: сама величина всегда каноническая
   (`distance` от начала кромки, `x`/`y` у выреза), а привязка отвечает только
   на вопрос «от какого края мерить». Так у одного факта остаётся один хозяин. */
function shapeMiRefIsEnd(id){return shapeDimRef(sDraft,id,'e','start')==='end';}
function shapeMiShownDistance(item,edgeLen){
  var d=shapeSnapManufacturing16(+item.distance||0),len=+edgeLen;
  if(!isFinite(len)||len<=0||!shapeMiRefIsEnd(item.id))return d;
  return Math.max(0,shapeSnapManufacturing16(len-d));
}
function shapeMiOriginText(edge,fromEnd){
  if(edge==='left'||edge==='right')return fromEnd?'from the top corner to the center':'from the bottom corner to the center';
  return fromEnd?'from the right corner to the center':'from the left corner to the center';
}
/* Центр внутреннего выреза и расстояния до него — та же величина, что показывает
   отверстие. По умолчанию меряем от БЛИЖНЕЙ стороны: так цифра меньше и её
   труднее прочитать не с того края. */
function shapeCutoutCenterPosition(f,g){
  if(!f||!g||!g.b)return null;
  var cx=inch(f.x)+inch(f.width)/2,cy=inch(f.y)+inch(f.height)/2;
  if(!isFinite(cx)||!isFinite(cy))return null;
  var dat=shapeRefDatums(g,cx,cy);
  var hRef=shapeDimRef(sDraft,f.id,'h','')||((cx-dat.left)<=(dat.right-cx)?'left':'right');
  var vRef=shapeDimRef(sDraft,f.id,'v','')||((cy-dat.bottom)<=(dat.top-cy)?'bottom':'top');
  if(hRef!=='right')hRef='left';
  if(vRef!=='top')vRef='bottom';
  var left=shapeSnapManufacturing16(cx-dat.left),right=shapeSnapManufacturing16(dat.right-cx),
      bottom=shapeSnapManufacturing16(cy-dat.bottom),top=shapeSnapManufacturing16(dat.top-cy);
  return {hRef:hRef,vRef:vRef,hDistance:hRef==='right'?right:left,vDistance:vRef==='top'?top:bottom,center:[cx,cy],
    hDatum:hRef==='right'?dat.right:dat.left,vDatum:vRef==='top'?dat.top:dat.bottom};
}
/* Stamp position is stored as one canonical point. Left/Right and Bottom/Top
   only choose which finished bound the operator measures from, exactly like a
   cutout center. This keeps reference changes out of production geometry. */
function shapeStampFeatures(){return ((sDraft&&sDraft.features)||[]).map(function(f,i){return {f:f,i:i};}).filter(function(x){return x.f.type==='stamp';});}
function shapeSandblastFeatures(){return ((sDraft&&sDraft.features)||[]).map(function(f,i){return {f:f,i:i};}).filter(function(x){return x.f.type==='sandblast';});}
function shapeStampPosition(f,g){
  if(!f||!g||!g.b)return null;
  var x=inch(f.x),y=inch(f.y);if(!isFinite(x)||!isFinite(y))return null;
  var dat=shapeRefDatums(g,x,y);
  var hRef=shapeDimRef(sDraft,f.id,'h','')||((x-dat.left)<=(dat.right-x)?'left':'right');
  var vRef=shapeDimRef(sDraft,f.id,'v','')||((y-dat.bottom)<=(dat.top-y)?'bottom':'top');
  if(hRef!=='right')hRef='left';if(vRef!=='top')vRef='bottom';
  var left=shapeSnapManufacturing16(x-dat.left),right=shapeSnapManufacturing16(dat.right-x),
      bottom=shapeSnapManufacturing16(y-dat.bottom),top=shapeSnapManufacturing16(dat.top-y);
  return {hRef:hRef,vRef:vRef,hDistance:hRef==='right'?right:left,vDistance:vRef==='top'?top:bottom,point:[x,y],
    hDatum:hRef==='right'?dat.right:dat.left,vDatum:vRef==='top'?dat.top:dat.bottom};
}
function shapeDefaultStampPoint(g){
  if(!g||!g.b||!(g.P||[]).length)return [3,1];
  var b=g.b,w=Math.max(0,b.maxX-b.minX),h=Math.max(0,b.maxY-b.minY),dx=Math.min(2,w/2),dy=Math.min(2,h/2);
  var candidates=[[b.maxX-dx,b.minY+dy],[b.maxX-dx,b.maxY-dy],[b.minX+dx,b.minY+dy],[b.minX+dx,b.maxY-dy],[(b.minX+b.maxX)/2,(b.minY+b.maxY)/2]];
  for(var i=0;i<candidates.length;i++){var p=candidates[i].map(shapeSnapManufacturing16);if(fabPointInPoly(p,g.P))return p;}
  /* A concave contour can have its bounding-box center in empty space. Search
     from the preferred bottom-right corner inward before falling back. */
  for(var gy=1;gy<16;gy++)for(var gx=15;gx>0;gx--){
    var q=[shapeSnapManufacturing16(b.minX+w*gx/16),shapeSnapManufacturing16(b.minY+h*gy/16)];if(fabPointInPoly(q,g.P))return q;
  }
  return candidates[4].map(shapeSnapManufacturing16);
}
function shapeDefaultSandblastPoint(g){
  if(!g||!g.b||!(g.P||[]).length)return [3,1];
  var b=g.b,c=[shapeSnapManufacturing16((b.minX+b.maxX)/2),shapeSnapManufacturing16((b.minY+b.maxY)/2)];if(fabPointInPoly(c,g.P))return c;
  var best=null,w=b.maxX-b.minX,h=b.maxY-b.minY;
  for(var gy=1;gy<32;gy++)for(var gx=1;gx<32;gx++){
    var q=[shapeSnapManufacturing16(b.minX+w*gx/32),shapeSnapManufacturing16(b.minY+h*gy/32)];if(!fabPointInPoly(q,g.P))continue;
    var d=Math.hypot(q[0]-c[0],q[1]-c[1]);if(!best||d<best.d)best={p:q,d:d};
  }
  return best?best.p:shapeDefaultStampPoint(g);
}
function shapeSetPointAnnotationDistance(index,axis,value,noun){
  var f=sDraft&&sDraft.features&&sDraft.features[index],g=shapeManufacturingGeometry(),parsed=fabParseDimStrict(value);if(!f||(f.type!=='stamp'&&f.type!=='sandblast'))return;
  noun=noun||'Drawing mark';
  if(!g||!parsed.ok){alert('Enter a valid '+noun.toLowerCase()+' position in inches.');render();return;}
  var d=shapeSnapManufacturing16(parsed.v);if(!isFinite(d)||d<0){alert(noun+' position must be zero or greater.');render();return;}
  var pos=shapeStampPosition(f,g),x=inch(f.x),y=inch(f.y);if(!pos)return;
  var dat=shapeRefDatums(g,x,y);
  if(axis==='h')x=pos.hRef==='right'?dat.right-d:dat.left+d;
  else if(axis==='v')y=pos.vRef==='top'?dat.top-d:dat.bottom+d;
  else return;
  x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  if(!fabPointInPoly([x,y],g.P)){alert('The '+noun.toLowerCase()+' center must stay inside the finished glass contour.');render();return;}
  f.x=shapeFrac16(x);f.y=shapeFrac16(y);render();
}
function shapeSetStampDistance(index,axis,value){shapeSetPointAnnotationDistance(index,axis,value,'Stamp');}
function shapeSetSandblastDistance(index,axis,value){shapeSetPointAnnotationDistance(index,axis,value,'Sandblast');}
function shapeDimsMap(){if(!sDraft.dims||typeof sDraft.dims!=='object')sDraft.dims={};return sDraft.dims;}
function shapeDimEntry(id,axis){var m=shapeDimsMap(),e=m[id]||(m[id]={});return e[axis]||(e[axis]={});}
/* Пустая запись оформления не хранится: карта должна показывать только то, что
   оператор действительно поменял, иначе экспорт заказа обрастает шумом. */
function shapeDimPrune(id,axis){
  var m=shapeDimsMap(),e=m[id];if(!e)return;
  var rec=e[axis];
  if(rec&&rec.hide!==true&&!rec.off&&!rec.ref)delete e[axis];
  if(!Object.keys(e).length)delete m[id];
}
function shapeSelectDim(id,axis){
  var same=sDimEdit&&sDimEdit.id===id&&sDimEdit.axis===axis;
  sMetricDimEdit=null;sDimEdit=same?null:{id:id,axis:axis};
  /* Размер и его карточка — одно и то же: выбрали на чертеже, открылась карточка. */
  if(!same){
    if(shapeManufacturingItemById(id))sManufacturingSelected=id;
    else sFeatureExpandedId=id;
  }
  render();
}
function shapeToggleDimHide(id,axis){
  var rec=shapeDimEntry(id,axis);
  if(rec.hide===true)delete rec.hide;else rec.hide=true;
  shapeDimPrune(id,axis);render();
}
function shapeNudgeDim(id,axis,step){
  var rec=shapeDimEntry(id,axis),v=Math.max(SHAPE_DIM_OFF_MIN,Math.min(SHAPE_DIM_OFF_MAX,(+rec.off||0)+step));
  if(v)rec.off=v;else delete rec.off;
  shapeDimPrune(id,axis);render();
}
function shapeSetDimRef(id,axis,ref){
  var rec=shapeDimEntry(id,axis);
  if(ref)rec.ref=String(ref);else delete rec.ref;
  shapeDimPrune(id,axis);render();
}
/* Те же кнопки, что и в панели на чертеже. Нужны обе: скрытый размер иначе
   было бы нечем вернуть, если элемент не выбран. */
function shapeDimControlsHTML(id,axes){
  return `<div class='shape-dim-controls'>${axes.map(function(a){
    var hidden=shapeDimHidden(sDraft,id,a.key),off=shapeDimOffset(sDraft,id,a.key);
    return `<div class='shape-dim-control'><span>${a.label}</span><button type='button' class='sm${hidden?' off':''}' onclick='shapeToggleDimHide("${esc(id)}","${esc(a.key)}")'>${hidden?'Show':'Hide'}</button><button type='button' class='sm' onclick='shapeNudgeDim("${esc(id)}","${esc(a.key)}",-1)'>−</button><button type='button' class='sm' onclick='shapeNudgeDim("${esc(id)}","${esc(a.key)}",1)'>+</button>${off?`<i data-raw>${off>0?'+':''}${off}</i>`:''}</div>`;
  }).join('')}</div>`;
}
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
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item||item.type==='hole')return;var parsed=fabParseDimStrict(v),g=shapeManufacturingGeometry(),e=shapeManufacturingEdgeDef(item.edge,g);if(!parsed.ok||!e){alert('Enter a valid distance in inches.');render();return;}var d=shapeSnapManufacturing16(parsed.v);if(!isFinite(d)||d<0||d>e.len+1e-9){alert('The distance must stay on the selected glass edge.');render();return;}
  /* Введено ОТ ПРИВЯЗКИ, хранится от начала кромки: у величины остаётся один
     смысл, как бы её ни показывали. */
  item.distance=shapeMiRefIsEnd(id)?Math.max(0,shapeSnapManufacturing16(e.len-d)):d;render();
}
/* Центр выреза задаётся так же, как центр отверстия: расстоянием от выбранной
   стороны. Хранится по-прежнему нижний левый угол — от него считается контур. */
function shapeSetCutoutCenter(i,axis,v){
  var f=sDraft.features[i];if(!f||f.type!=='cutout')return;
  var parsed=fabParseDimStrict(v),g=shapeManufacturingGeometry();
  if(!parsed.ok||!g){alert('Enter a valid distance in inches.');render();return;}
  var d=shapeSnapManufacturing16(parsed.v);
  if(!isFinite(d)||d<0){alert('The distance must be zero or greater.');render();return;}
  var pos=shapeCutoutCenterPosition(f,g);if(!pos)return;
  var dat=shapeRefDatums(g,pos.center[0],pos.center[1]);
  if(axis==='h'){var cx=pos.hRef==='right'?dat.right-d:dat.left+d;f.x=frac64(shapeSnapManufacturing16(cx-inch(f.width)/2));}
  else{var cy=pos.vRef==='top'?dat.top-d:dat.bottom+d;f.y=frac64(shapeSnapManufacturing16(cy-inch(f.height)/2));}
  render();
}
/* Заготовка отверстия при первом дропе — числа владельца. По горизонтали центр
   встаёт на 3″ от ближнего вертикального края, вертикаль остаётся там, куда
   положили. Пара расходится на 6″, тройка — 6″ по вертикали и 12″ по горизонтали.
   Это только стартовые значения: каждое поле правится в карточке после установки,
   а перенос уже поставленного отверстия заготовку не применяет.
   Диаметр по умолчанию — 1/2″: 3/4″ идёт редко и только под Serenity. */
var SHAPE_HOLE_DROP_INSET=3,SHAPE_HOLE_DROP_SPACING=6,SHAPE_HOLE_DROP_VSPACING=6,SHAPE_HOLE_DROP_HSPACING=12,SHAPE_HOLE_DROP_DIAMETER='1/2';
function shapeStartManufacturingPlacement(type,holeCount){
  if(type!=='hole'&&!hardwareKindIsKnown(type))return;
  var r=shapeDraftResult();
  if(!shapeIsDxfSource(sDraft)&&!r.valid){alert('Fix the Shape geometry before placing a manufacturing item.');return;}
  var count=type==='hole'&&(+holeCount===2||+holeCount===3)?+holeCount:1;
  sManufacturingOpen=true;sManufacturingPlace={type:type,diameter:type==='hole'?SHAPE_HOLE_DROP_DIAMETER:'',holeCount:count,spacing:SHAPE_HOLE_DROP_SPACING,axis:'horizontal',verticalSpacing:SHAPE_HOLE_DROP_VSPACING,horizontalSpacing:SHAPE_HOLE_DROP_HSPACING,horizontalDirection:'right'};sManufacturingSelected=null;sView='production';render();
}
function shapeCancelManufacturingPlacement(){sManufacturingPlace=null;render();}
function shapeMoveManufacturingItem(id){var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item)return;sManufacturingPlace={type:item.type,diameter:item.diameter||'',holeCount:shapeHoleCount(item),spacing:shapeHoleSpacing(item),axis:shapeHoleAxis(item),verticalSpacing:shapeHoleTripleVSpacing(item),horizontalSpacing:shapeHoleTripleHSpacing(item),horizontalDirection:shapeHoleTripleDirection(item),moveId:id};sManufacturingSelected=id;render();}
function shapeRemoveManufacturingItem(id){sDraft.manufacturingItems=shapeManufacturingItems().filter(function(x){return x.id!==id;});if(sManufacturingSelected===id)sManufacturingSelected=null;if(sManufacturingPlace&&sManufacturingPlace.moveId===id)sManufacturingPlace=null;render();}
function shapeSetManufacturingField(id,k,v){
  var item=shapeManufacturingItems().find(function(x){return x.id===id;});if(!item)return;
  if(k==='diameter'){var d=fabParseDimStrict(v);item.diameter=String(v);var el=document.getElementById('mi_d_'+id);if(el)el.classList.toggle('bad',!(d.ok&&d.v>=0.5));}
  else item[k]=String(v==null?'':v);
  refreshShapeEditor();
}
/* ---------- Модель фурнитуры ----------
   Владелец: «у него есть заготовленные шаблоны петель, он видит например
   Vienna 180 и использует тот шаблон». Поэтому метка несёт название модели,
   а не размеры выреза: размеры знает шаблон в руках человека.
   `__custom` = модели нет в справочнике, имя вписывается руками. */
const SHAPE_MI_CUSTOM_MODEL='__custom';
function shapeManufacturingItemById(id){return shapeManufacturingItems().find(function(x){return x.id===id;})||null;}
function shapeSetManufacturingModel(id,value){
  var item=shapeManufacturingItemById(id);if(!item||item.type==='hole')return;
  if(value===SHAPE_MI_CUSTOM_MODEL){sManufacturingCustomId=id;item.modelId='';render();return;}
  sManufacturingCustomId=null;
  if(!value){item.modelId='';item.model='';render();return;}
  var row=hardwareModelById(value);
  if(!row){alert('This hardware model is no longer in the catalog.');render();return;}
  /* Имя кладётся снимком рядом с id: справочник переименуют, а принятый
     заказ обязан показывать то, что заказывали. */
  item.modelId=row.id;item.model=row.name;render();
}
function shapeSetManufacturingModelText(id,value){
  var item=shapeManufacturingItemById(id);if(!item||item.type==='hole')return;
  item.modelId='';item.model=String(value==null?'':value).trim().slice(0,60);
  /* refreshShapeEditor, а не render: иначе поле теряет фокус на каждой букве. */
  refreshShapeEditor();
}
function shapeManufacturingModelIsCustom(item){return hardwareItemIsCustomModel(item)||sManufacturingCustomId===(item&&item.id);}
function shapeDxfPreviewTransform(source){
  source=shapeNormalizeSource(source);var P=source.preview.points||[];if(P.length<3)return null;
  var b=fabEdgeBounds(P),W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),vw=760,vh=390,padL=88,padR=88,padT=62,padB=72;
  var sc=Math.min((vw-padL-padR)/W,(vh-padT-padB)/H),dw=W*sc,dh=H*sc,x0=padL+(vw-padL-padR-dw)/2,y0=padT+(vh-padT-padB-dh)/2;
  return {P:P,b:b,W:W,H:H,vw:vw,vh:vh,sc:sc,dw:dw,dh:dh,x0:x0,y0:y0,X:function(x){return x0+(x-b.minX)*sc;},Y:function(y){return y0+dh-(y-b.minY)*sc;}};
}
/* Накладка меток считается ТЕМ ЖЕ полем, что и сам чертёж. На печатном листе
   поля канвы урезаны, и без общего расчёта метки уезжали за контур. */
function shapeDrawnPreviewTransform(result,extra){
  if(!result||!result.valid||!(result.points||[]).length)return null;
  var F=shapeProductionDrawingFrame(result,Object.assign({},shapeMetricProductionOptions(result),extra||{}));
  F.P=result.points;return F;
}
function shapePlaceManufacturingFromEvent(ev,svg){
  if(!sManufacturingPlace)return;
  var external=shapeIsDxfSource(sDraft),r=shapeDraftResult(),T=external?shapeDxfPreviewTransform(sDraft.source):shapeDrawnPreviewTransform(r);if(!T)return;
  var rect=svg.getBoundingClientRect(),vx=(ev.clientX-rect.left)*T.vw/Math.max(1,rect.width),vy=(ev.clientY-rect.top)*T.vh/Math.max(1,rect.height);
  var x=T.b.minX+(vx-T.x0)/T.sc,y=T.b.minY+(T.y0+T.dh-vy)/T.sc,g={P:T.P,b:T.b};x=shapeSnapManufacturing16(x);y=shapeSnapManufacturing16(y);
  var type=sManufacturingPlace.type,data={};
  if(type==='hole'){
    if(!fabPointInPoly([x,y],T.P)){alert('Place the hole inside the glass contour.');return;}data.x=x;data.y=y;data.diameter=sManufacturingPlace.diameter||SHAPE_HOLE_DROP_DIAMETER;
    /* Ближняя сторона считается по самим кромкам, а не по середине габарита:
       у скошенной детали середина габарита стоит не там, где середина стекла,
       и отверстие у наклонного края получало привязку к дальней стороне. */
    var dropDat=shapeRefDatums(g,x,y);
    data.hRef=(x-dropDat.left)<=(dropDat.right-x)?'left':'right';data.vRef=(y-dropDat.bottom)<=(dropDat.top-y)?'bottom':'top';
    /* Горизонталь новой установки берётся из заготовки, а не из точки клика:
       отверстия сажают на стандартный отступ от края, а по высоте — по месту.
       Если на этой форме отступ уводит центр за контур, остаётся точка дропа. */
    if(!sManufacturingPlace.moveId){
      var inset=shapeSnapManufacturing16(data.hRef==='right'?dropDat.right-SHAPE_HOLE_DROP_INSET:dropDat.left+SHAPE_HOLE_DROP_INSET);
      if(fabPointInPoly([inset,data.y],T.P))data.x=inset;
    }
    if(+sManufacturingPlace.holeCount===2){data.count=2;data.spacing=isFinite(+sManufacturingPlace.spacing)?+sManufacturingPlace.spacing:SHAPE_HOLE_DROP_SPACING;data.axis=sManufacturingPlace.axis==='vertical'?'vertical':'horizontal';var pairProblem=shapeHolePairProblem(data,g);if(pairProblem&&data.axis==='horizontal'){data.axis='vertical';pairProblem=shapeHolePairProblem(data,g);}if(pairProblem){alert(pairProblem);return;}}
    else if(+sManufacturingPlace.holeCount===3){data.count=3;data.verticalSpacing=isFinite(+sManufacturingPlace.verticalSpacing)?+sManufacturingPlace.verticalSpacing:SHAPE_HOLE_DROP_VSPACING;data.horizontalSpacing=isFinite(+sManufacturingPlace.horizontalSpacing)?+sManufacturingPlace.horizontalSpacing:SHAPE_HOLE_DROP_HSPACING;data.horizontalDirection=sManufacturingPlace.horizontalDirection==='left'?'left':'right';var tripleProblem=shapeHolePairProblem(data,g);if(tripleProblem&&data.horizontalDirection==='right'){data.horizontalDirection='left';tripleProblem=shapeHolePairProblem(data,g);}if(tripleProblem){alert(tripleProblem);return;}}
  }else{
    var snap=shapeNearestManufacturingEdge(x,y,g);if(!snap){alert('No valid glass edge is available for this item.');return;}data.edge=snap.edge;data.distance=snap.distance;
  }
  if(sManufacturingPlace.moveId){var moving=shapeManufacturingItems().find(function(v){return v.id===sManufacturingPlace.moveId;});if(moving){if(type==='hole'){moving.x=data.x;moving.y=data.y;}else{moving.edge=data.edge;moving.distance=data.distance;}}}
  else{var raw={id:shapeNewEntityId('mi-'),type:type,note:''};Object.keys(data).forEach(function(k){raw[k]=data[k];});var item=shapeNormalizeManufacturingItem(raw);shapeManufacturingItems().push(item);}
  sManufacturingSelected=null;sManufacturingPlace=null;render();
}
/* ---------- Размерные цепочки на чертеже ----------
   Одна реализация на всё: у отверстия их две, у фурнитуры одна вдоль кромки, у
   внутреннего выреза снова две — до ЦЕНТРА, как у отверстия. Раньше эта разметка
   была переписана трижды подряд внутри одной функции, и любая правка касалась
   только той копии, до которой дошли руки.

   Размер можно убрать с листа и отодвинуть от детали: владелец, «иногда патч
   прямо от края и странно указывать 0», и «было бы неплохо спрятать измерения
   или немного двигать их вперёд-назад». Скрытый размер не пропадает насовсем:
   пока элемент выбран, на его месте стоит пунктирный след — по нему размер и
   возвращают. */
const SHAPE_DIM_STEP=14;
/* Панель управления размером и след скрытого размера — это ИНТЕРФЕЙС, а не
   чертёж. На печать и в скачиваемый SVG они уходить не должны: лист получает
   деталь, а не следы работы оператора. Флаг снимается на время сборки
   непечатной разметки. */
let shapeDimUi=true;
/* Меню закрывается кликом мимо него — так ведёт себя любое меню, и без этого
   оно оставалось раскрытым до повторного клика по самому размеру.
   Слушатель ставится ОДИН раз на документ: render() пересоздаёт разметку, и
   обработчик, повешенный на узел, пережил бы ровно одну перерисовку. */
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',function(ev){
  if(!sDimEdit&&!sMetricDimEdit)return;
  var t=ev&&ev.target;
  if(t&&t.closest&&t.closest('.shape-dim-menu,.shape-mi-prod-dims,.shape-dim-ghost,.shape-dim-controls,.shape-metric-movable,.shape-inch-primary-movable'))return;
  sDimEdit=null;sMetricDimEdit=null;render();
});
function shapeDimArrowDefs(){
  return `<defs><marker id='shapeMiDimArrow' viewBox='0 0 8 8' refX='8' refY='4' markerWidth='5' markerHeight='5' orient='auto-start-reverse'><path d='M0,0 L8,4 L0,8 Z' fill='#d92d20'/></marker></defs>`;
}
function shapeDimIsActive(id,axis){return !!(sDimEdit&&sDimEdit.id===id&&sDimEdit.axis===axis);}
/* Панель шириной ~130 держим внутри листа: у размера, отодвинутого к самому
   краю, она иначе уезжает за границу картинки и становится некликабельной. */
function shapeDimMenuX(x,T){
  var half=70,w=(T&&T.vw)||690;
  return Math.max(half,Math.min(w-half,x));
}
/* Панель у самого размера: владелец просил, чтобы опция появлялась по нажатию
   на измерение, а не пряталась в карточке. Те же кнопки есть и в карточке —
   скрытый размер иначе было бы нечем вернуть. */
function shapeDimMenuSvg(id,axis,cx,cy){
  var hidden=shapeDimHidden(sDraft,id,axis);
  /* Знаки вместо слов: цифры размеров выросли до 14 px, и «closer / further /
     hide» перестали помещаться в свои кнопки — слова налезали друг на друга.
     − двигает размер ближе, + дальше, как в карточке Cutout. */
  var btns=[{t:'−',a:'shapeNudgeDim',v:-1},{t:'+',a:'shapeNudgeDim',v:1},{t:hidden?'show':'hide',a:'shapeToggleDimHide',v:null}];
  var w=[24,24,hidden?46:38],total=w.reduce(function(n,x){return n+x;},0),h=20,x0=cx-total/2,run=0;
  /* Клик по самой панели дальше не идёт: она лежит ВНУТРИ группы метки, а у той
     свой обработчик — он сбрасывал выбор, и панель закрывалась от попадания по
     собственному фону. */
  return `<g class='shape-dim-menu' onclick='event.stopPropagation()'><rect x='${x0-4}' y='${cy-h/2-4}' width='${total+8}' height='${h+8}' rx='7'/>${btns.map(function(b,i){
    var bx=x0+run;run+=w[i];
    var call=b.v==null?`${b.a}("${esc(id)}","${esc(axis)}")`:`${b.a}("${esc(id)}","${esc(axis)}",${b.v})`;
    return `<g class='shape-dim-btn' onclick='event.stopPropagation();${call}'><rect x='${bx}' y='${cy-h/2}' width='${w[i]}' height='${h}' rx='4'/><text x='${bx+w[i]/2}' y='${cy+4}' text-anchor='middle'>${b.t}</text></g>`;
  }).join('')}</g>`;
}
/* o = {id, axis, a:[x,y], b:[x,y], pos, dir, text, side, selected}
   axis 'h' — линия горизонтальна на y=pos, 'v' и 'e' — вертикальна на x=pos.
   dir — в какую сторону «дальше от детали». */
function shapeDimChainSvg(o){
  /* Направление приходит ЯВНО, а не из ключа оси. Ключ `e` у фурнитуры говорит
     «цепочка вдоль кромки» и о направлении не знает ничего: на левой и правой
     кромке она вертикальная, на верхней и нижней — горизонтальная. Пока
     направление выводилось из ключа, зажим на нижней кромке получал
     вертикальную линию с повёрнутым текстом и координатой Y, поставленной
     вместо X. */
  var vertical=o.vertical!=null?!!o.vertical:o.axis!=='h',hidden=shapeDimHidden(sDraft,o.id,o.axis);
  var pos=o.pos+o.dir*shapeDimOffset(sDraft,o.id,o.axis)*SHAPE_DIM_STEP;
  var active=shapeDimUi&&shapeDimIsActive(o.id,o.axis);
  var pick=`onclick='event.stopPropagation();shapeSelectDim("${esc(o.id)}","${esc(o.axis)}")'`;
  if(hidden){
    /* След скрытого размера. Видно только когда элемент выбран — иначе лист
       остаётся чистым, ради чего размер и убирали. На печати следа нет вообще. */
    if(!o.selected||!shapeDimUi)return '';
    var gx=vertical?pos:(o.a[0]+o.b[0])/2,gy=vertical?(o.a[1]+o.b[1])/2:pos;
    return `<g class='shape-dim-ghost' ${pick}><circle cx='${gx}' cy='${gy}' r='7'/><text x='${gx}' y='${gy+3.5}' text-anchor='middle'>+</text></g>`+
      (active?shapeDimMenuSvg(o.id,o.axis,shapeDimMenuX(gx,o.T),gy+(vertical?0:22)):'');
  }
  var body,menuX,menuY;
  /* Рыска на конце стрелки — короткая засечка поперёк размерной линии. По ней
     видно, до какой ТОЧКИ размер, а не примерно куда смотрит остриё; в цепочке
     из нескольких размеров засечки соседей сходятся в одну общую границу.
     trimA / trimB подрезают НАРИСОВАННЫЙ конец, когда он упирается в отверстие:
     окружность залита белым и рисуется поверх, так что стрелка в самом центре
     просто не видна. Замеряется всё равно от центра до центра. */
  var TICK=5,trimA=+o.trimA||0,trimB=+o.trimB||0;
  if(!vertical){
    var mid=(o.a[0]+o.b[0])/2,sx=o.b[0]>=o.a[0]?1:-1,ax=o.a[0],bx=o.b[0];
    if(Math.abs(bx-ax)>trimA+trimB+6){ax+=sx*trimA;bx-=sx*trimB;}
    body=`<line x1='${ax}' y1='${pos}' x2='${bx}' y2='${pos}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
      <line class='shape-dim-tick' x1='${ax}' y1='${pos-TICK}' x2='${ax}' y2='${pos+TICK}'/>
      <line class='shape-dim-tick' x1='${bx}' y1='${pos-TICK}' x2='${bx}' y2='${pos+TICK}'/>
      <line class='shape-dim-hit' x1='${ax}' y1='${pos}' x2='${bx}' y2='${pos}'/>
      <text x='${mid}' y='${pos+(o.side>0?19:-11)}' text-anchor='middle'>${esc(o.text)}</text>`;
    menuX=mid;menuY=pos+(o.side>0?38:-34);
  }else{
    var midY=(o.a[1]+o.b[1])/2,tx=pos+(o.side>0?19:-19),sy=o.b[1]>=o.a[1]?1:-1,ay=o.a[1],by=o.b[1];
    if(Math.abs(by-ay)>trimA+trimB+6){ay+=sy*trimA;by-=sy*trimB;}
    body=`<line x1='${pos}' y1='${ay}' x2='${pos}' y2='${by}' marker-start='url(#shapeMiDimArrow)' marker-end='url(#shapeMiDimArrow)'/>
      <line class='shape-dim-tick' x1='${pos-TICK}' y1='${ay}' x2='${pos+TICK}' y2='${ay}'/>
      <line class='shape-dim-tick' x1='${pos-TICK}' y1='${by}' x2='${pos+TICK}' y2='${by}'/>
      <line class='shape-dim-hit' x1='${pos}' y1='${ay}' x2='${pos}' y2='${by}'/>
      <text x='${tx}' y='${midY}' text-anchor='middle' transform='rotate(-90 ${tx} ${midY})'>${esc(o.text)}</text>`;
    menuX=pos+(o.side>0?64:-64);menuY=midY;
  }
  return `<g class='shape-mi-prod-dims${active?' active':''}' ${pick}>${body}</g>`+(active?shapeDimMenuSvg(o.id,o.axis,shapeDimMenuX(menuX,o.T),menuY):'');
}

/* Внутренний C-C идёт ПРЯМО от центра к центру: линия сама и есть измеряемое
   расстояние, поэтому выносные линии ей не нужны. Между центрами ничего нет,
   стрелки упираются точно в окружности. Сдвинуть линию с ряда, если она мешает,
   по-прежнему можно кнопками − / +. */
function shapeHoleInternalDimsSvg(item,centerPx,T,selected,sideRight,sideTop,r){
  var count=shapeHoleCount(item);if(count===1||centerPx.length<count)return '';
  r=+r||0;
  if(count===2){
    var vertical=shapeHoleAxis(item)==='vertical',dir=vertical?(sideRight?-1:1):(sideTop?1:-1),a=centerPx[0],b=centerPx[1];
    return `<g class='shape-hole-pair-dim'>${shapeDimChainSvg({id:item.id,axis:'c',vertical:vertical,a:a,b:b,pos:vertical?a[0]:a[1],dir:dir,side:dir,trimA:r,trimB:r,text:shapeDrawingDim16(shapeHoleSpacing(item)),selected:selected,T:T})}</g>`;
  }
  /* Цифра вертикального C-C уходит в сторону ОТ базовой кромки — там же по ряду
     отверстия идёт размер положения, и две цифры садились друг на друга. */
  var lower=centerPx[0],upper=centerPx[1],third=centerPx[2],vDir=sideRight?-1:1,hDir=sideTop?1:-1;
  var verticalDim=shapeDimChainSvg({id:item.id,axis:'cv',vertical:true,a:lower,b:upper,pos:lower[0],dir:vDir,side:vDir,trimA:r,trimB:r,text:shapeDrawingDim16(shapeHoleTripleVSpacing(item)),selected:selected,T:T});
  var horizontalDim=shapeDimChainSvg({id:item.id,axis:'ch',vertical:false,a:upper,b:third,pos:upper[1],dir:hDir,side:hDir,trimA:r,trimB:r,text:shapeDrawingDim16(shapeHoleTripleHSpacing(item)),selected:selected,T:T});
  return `<g class='shape-hole-pair-dim'>${verticalDim}${horizontalDim}</g>`;
}

function shapeManufacturingMarkersSvg(source,T){
  var items=shapeManufacturingItems();if(!items.length)return '';var g={P:T.P,b:T.b};
  /* Коридоры размерных линий считаются ОБЩИМ счётчиком на сторону. Отверстие и
     фурнитура выносят размер в одно и то же место слева от детали, и пока у
     каждого семейства был свой отсчёт, их подписи налезали друг на друга —
     с крупными подписями это стало видно сразу. */
  var corridor={left:0,right:0,top:0,bottom:0},CORRIDOR=22;
  function lane(side){return corridor[side]++;}
  /* Подписи меток не должны затирать друг друга. Метки стоят там, где их
     поставил оператор, и две соседние — патч на кромке и отверстие рядом с ней —
     легко оказываются на одной высоте. Подпись, наехавшая на соседнюю, для цеха
     то же самое, что её отсутствие, поэтому вторая уходит выше первой.
     Ширина считается по моноширинному шрифту: 18 px даёт ~10.8 px на знак. */
  var placedLabels=[],LABEL_H=18,LABEL_CH=10.8;
  function labelBaseline(x,y,text,anchor){
    var w=String(text).length*LABEL_CH;
    var left=anchor==='end'?x-w:(anchor==='middle'?x-w/2:x);
    /* Зазор в рамке: две подписи, сошедшиеся вплотную, читаются как одна строка. */
    var box={x:left-6,y:y-LABEL_H-2,w:w+12,h:LABEL_H+8};
    for(var guard=0;guard<12;guard++){
      var clash=null;
      for(var k=0;k<placedLabels.length;k++){
        var p=placedLabels[k];
        if(!(box.x+box.w<p.x||p.x+p.w<box.x||box.y+box.h<p.y||p.y+p.h<box.y)){clash=p;break;}
      }
      if(!clash)break;
      box.y=clash.y-box.h-2;
    }
    placedLabels.push(box);
    return box.y+LABEL_H+2;
  }
  return shapeDimArrowDefs()+items.map(function(item,i){
    var pt=item.type==='hole'?{x:item.x,y:item.y}:shapeManufacturingEdgePoint(item,g);if(!pt)return '';
    var x=T.X(pt.x),y=T.Y(pt.y),chosen=item.id===sManufacturingSelected,selected=chosen?' selected':'',label=shapeMarkDrawingLabel(item);
    if(item.type==='hole'){
      var d=fabParseDimStrict(item.diameter),dia=d.ok&&d.v>0?d.v:.75,r=Math.max(4,Math.min(14,dia*T.sc/2)),pos=shapeManufacturingHolePosition(item,g),centers=shapeHoleCenters(item),centerPx=centers.map(function(c){return [T.X(c[0]),T.Y(c[1])];});if(!pos)return '';
      /* Выноска начинается ОТ ТОЙ ЖЕ кромки, по которой посчитана цифра. */
      var hRefX=T.X(pos.hDatum),vRefY=T.Y(pos.vDatum);
      var sideRight=pos.hRef==='right',sideTop=pos.vRef==='top';
      /* Горизонтальный размер идёт ПО РЯДУ отверстия — от кромки прямо к центру.
         Выносных линий нет вовсе, поэтому смещать линию в коридор нельзя: она
         повиснет ни от чего. Если ряд занят, размер отодвигается кнопками − / +. */
      /* Оба размера идут по СВОИМ линиям метки: горизонтальный по её ряду,
         вертикальный по её столбцу. У наклонной кромки коридор сбоку врал
         вдвойне — засечка висела в пустоте рядом с фигурой, а не на кромке,
         от которой посчитана цифра. Сдвинуть линию по-прежнему можно − / +. */
      var hDimY=y;
      var vDimX=x;
      var diamDirX=sideRight?-1:1,diamDirY=sideTop?-1:1;
      /* У пары и тройки внутренние C-C занимают промежуток МЕЖДУ центрами, и
         выноска диаметра ложилась прямо на размерную линию. Уводим её в сторону
         от остальных отверстий. */
      if(centerPx.length>1){var restY=centerPx.slice(1).reduce(function(s,c){return s+c[1];},0)/(centerPx.length-1);diamDirY=restY<y?1:-1;}
      var diamX=x+diamDirX*(r+24),diamY=y+diamDirY*22,diamAnchor=sideRight?'end':'start';
      var hChain=shapeDimChainSvg({id:item.id,axis:'h',a:[hRefX,y],b:[x,y],pos:hDimY,dir:sideTop?1:-1,side:sideTop?1:-1,trimB:r,text:shapeDrawingDim16(pos.hDistance),selected:chosen,T:T});
      var vChain=shapeDimChainSvg({id:item.id,axis:'v',a:[hRefX,vRefY],b:[x,y],pos:vDimX,dir:sideRight?1:-1,side:sideRight?1:-1,text:shapeDrawingDim16(pos.vDistance),selected:chosen,T:T});
      var pairDim=shapeHoleInternalDimsSvg(item,centerPx,T,chosen,sideRight,sideTop,r),diameterText=(centerPx.length>1?centerPx.length+' × Ø ':'Ø ')+shapeDrawingDim(dia);
      return `<g class='shape-mi-marker hole${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";sDimEdit=null;render()'>
        ${hChain}${vChain}${pairDim}
        ${centerPx.map(function(c){return `<circle cx='${c[0]}' cy='${c[1]}' r='${r}'/>`;}).join('')}
        <line x1='${x+diamDirX*r}' y1='${y+diamDirY*r}' x2='${diamX}' y2='${diamY}' class='shape-mi-hole-leader'/>
        <text x='${diamX+diamDirX*4}' y='${labelBaseline(diamX+diamDirX*4,diamY+(diamDirY<0?-5:13),diameterText,diamAnchor)}' text-anchor='${diamAnchor}'>${centerPx.length>1?centerPx.length+' × ':''}Ø ${esc(shapeDrawingDim(dia))}</text>
      </g>`;
    }
    var e=pt.edge,ex1=T.X(e.start[0]),ey1=T.Y(e.start[1]),ex2=T.X(e.end[0]),ey2=T.Y(e.end[1]),ang=Math.atan2(ey2-ey1,ex2-ex1)*180/Math.PI,mark;
    /* Свой значок нарисован только у зажима: у него другая посадка. Остальная
       фурнитура, включая виды, добавленные владельцем, берёт общий значок —
       что именно стоит, говорит подпись с кодом вида и именем модели. */
    if(item.type==='clamp')mark=`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-13' y='-13' width='26' height='26' rx='3'/><path d='M -5 -10 V 10 M 5 -10 V 10'/></g>`;
    else mark=`<g transform='translate(${x} ${y}) rotate(${ang})'><rect x='-16' y='-10' width='32' height='20' rx='3'/><line x1='0' y1='-10' x2='0' y2='10'/><circle cx='-7' cy='0' r='2.4'/><circle cx='7' cy='0' r='2.4'/></g>`;
    var edge=item.edge||e.edge,band=lane(edge==='left'||edge==='right'?edge:edge)%4;
    /* Откуда меряем — выбор оператора, как Left/Right у отверстия. Хранится в
       карте оформления: сама величина `distance` всегда считается от начала
       кромки и от привязки не зависит. */
    var fromEnd=shapeMiRefIsEnd(item.id),origin=fromEnd?e.end:e.start,shown=shapeMiShownDistance(item,e.len);
    var dimSvg='',labelTextSvg='';
    if(edge==='left'||edge==='right'){
      var dimX=edge==='left'?T.X(g.b.minX)-(34+band*CORRIDOR):T.X(g.b.maxX)+(34+band*CORRIDOR),originY=T.Y(origin[1]),labelX=edge==='left'?x+24:x-24,labelAnchor=edge==='left'?'start':'end';
      dimSvg=shapeDimChainSvg({id:item.id,axis:'e',vertical:true,a:[T.X(origin[0]),originY],b:[x,y],pos:dimX,dir:edge==='left'?-1:1,side:edge==='left'?-1:1,text:shapeDrawingDim16(shown),selected:chosen,T:T});
      labelTextSvg=`<text data-raw x='${labelX}' y='${labelBaseline(labelX,y-14,label,labelAnchor)}' text-anchor='${labelAnchor}'>${esc(label)}</text>`;
    } else {
      var dimY=edge==='top'?T.Y(g.b.maxY)-(30+band*CORRIDOR):T.Y(g.b.minY)+(30+band*CORRIDOR),originX=T.X(origin[0]),labelY=edge==='top'?y+28:y-18;
      dimSvg=shapeDimChainSvg({id:item.id,axis:'e',vertical:false,a:[originX,T.Y(origin[1])],b:[x,y],pos:dimY,dir:edge==='top'?-1:1,side:edge==='top'?-1:1,text:shapeDrawingDim16(shown),selected:chosen,T:T});
      labelTextSvg=`<text data-raw x='${x+20}' y='${labelBaseline(x+20,labelY,label,'start')}' text-anchor='start'>${esc(label)}</text>`;
    }
    return `<g class='shape-mi-marker ${esc(item.type)}${selected}' onclick='event.stopPropagation();sManufacturingSelected="${esc(item.id)}";sDimEdit=null;render()'>${dimSvg}${mark}${labelTextSvg}</g>`;
  }).join('');
}
/* Размеры внутреннего выреза — до его ЦЕНТРА, ровно как у отверстия: владелец
   разбирал их рядом и просил одинаковую привязку. Рисуются здесь, а не в модуле
   чертежа: привязка и оформление — вопрос экрана, модуль остаётся чистой
   геометрией. */
function shapeCutoutDimsSvg(T){
  var feats=(sDraft&&sDraft.features)||[],cutouts=feats.filter(function(f){return f.type==='cutout';});
  if(!cutouts.length)return '';
  return cutouts.map(function(f,i){
    var cx=inch(f.x)+inch(f.width)/2,cy=inch(f.y)+inch(f.height)/2;
    if(!isFinite(cx)||!isFinite(cy))return '';
    var pos=shapeCutoutCenterPosition(f,{P:T.P,b:T.b});if(!pos)return '';
    var x=T.X(cx),y=T.Y(cy),chosen=sFeatureExpandedId===f.id,lane=i%4;
    var sideRight=pos.hRef==='right',sideTop=pos.vRef==='top';
    var hRefX=T.X(pos.hDatum),vRefY=T.Y(pos.vDatum);
    var hDimY=y;
    var vDimX=x;
    return `<g class='shape-cut-dims${chosen?' selected':''}'>`+
      shapeDimChainSvg({id:f.id,axis:'h',a:[hRefX,y],b:[x,y],pos:hDimY,dir:sideTop?1:-1,side:sideTop?1:-1,text:shapeDrawingDim16(pos.hDistance),selected:chosen,T:T})+
      shapeDimChainSvg({id:f.id,axis:'v',a:[hRefX,vRefY],b:[x,y],pos:vDimX,dir:sideRight?1:-1,side:sideRight?1:-1,text:shapeDrawingDim16(pos.vDistance),selected:chosen,T:T})+
      `<circle class='shape-cut-center' cx='${x}' cy='${y}' r='3'/></g>`;
  }).join('');
}
function shapeStampMarkerSvg(T){
  return shapeStampFeatures().map(function(row){
    var f=row.f,x=T.X(inch(f.x)),y=T.Y(inch(f.y)),label=shapeStampText(f),w=Math.max(62,Math.min(164,label.length*6+18)),selected=sFeatureExpandedId===f.id?' selected':'';
    if(!isFinite(x)||!isFinite(y))return '';
    return `<g class='shape-temper-stamp external${selected}' data-stamp-id='${esc(f.id)}' onclick='event.stopPropagation();toggleShapeFeatureCard("${esc(f.id)}")'><rect x='${x-w/2}' y='${y-10}' width='${w}' height='20' rx='2'/><text data-raw x='${x}' y='${y+3.5}' text-anchor='middle'>${esc(label)}</text></g>`;
  }).join('');
}
function shapeSandblastMarkerSvg(T){
  return shapeSandblastFeatures().map(function(row){
    var f=row.f,x=T.X(inch(f.x)),y=T.Y(inch(f.y)),spec=shapeSandblastDrawingSpec(f,T.W*T.sc),selected=sFeatureExpandedId===f.id?' selected':'';
    if(!isFinite(x)||!isFinite(y))return '';
    return `<g class='shape-sandblast-mark external${selected}' data-sandblast-id='${esc(f.id)}' onclick='event.stopPropagation();toggleShapeFeatureCard("${esc(f.id)}")'><rect x='${x-spec.w/2}' y='${y-spec.h/2}' width='${spec.w}' height='${spec.h}' rx='2'/><text data-raw x='${x}' y='${y-2}' text-anchor='middle' style='font-size:${spec.font}px'><tspan x='${x}'>${esc(spec.lines[0])}</tspan><tspan x='${x}' dy='${spec.font+2}'>${esc(spec.lines[1])}</tspan></text></g>`;
  }).join('');
}
function shapePointAnnotationDimsSvg(rows,T){
  if(!rows.length)return '';
  return rows.map(function(row,i){
    var f=row.f,pos=shapeStampPosition(f,{P:T.P,b:T.b});if(!pos)return '';
    var x=T.X(pos.point[0]),y=T.Y(pos.point[1]),chosen=sFeatureExpandedId===f.id,lane=i%4,sideRight=pos.hRef==='right',sideTop=pos.vRef==='top';
    var hRefX=T.X(pos.hDatum),vRefY=T.Y(pos.vDatum);
    var hDimY=y,vDimX=x;
    return `<g class='shape-stamp-dims${chosen?' selected':''}'>`+
      shapeDimChainSvg({id:f.id,axis:'h',a:[hRefX,y],b:[x,y],pos:hDimY,dir:sideTop?1:-1,side:sideTop?1:-1,text:shapeDrawingDim16(pos.hDistance),selected:chosen,T:T})+
      shapeDimChainSvg({id:f.id,axis:'v',vertical:true,a:[hRefX,vRefY],b:[x,y],pos:vDimX,dir:sideRight?1:-1,side:sideRight?1:-1,text:shapeDrawingDim16(pos.vDistance),selected:chosen,T:T})+
      `</g>`;
  }).join('');
}
function shapeStampDimsSvg(T){return shapePointAnnotationDimsSvg(shapeStampFeatures(),T);}
function shapeAnnotationDimsSvg(T){return shapePointAnnotationDimsSvg(shapeStampFeatures().concat(shapeSandblastFeatures()),T);}
function shapeAnnotationOverlaySvg(T){var marker=shapeStampMarkerSvg(T)+shapeSandblastMarkerSvg(T),dims=shapeAnnotationDimsSvg(T);return marker+(dims?shapeDimArrowDefs()+dims:'');}
function shapeStampOverlaySvg(T){return shapeAnnotationOverlaySvg(T);}
function shapeHoleServiceBand(d){if(d>=.5&&d<=1)return {key:'0.5-1',label:'1/2″–1″'};if(d>1&&d<=2)return {key:'1-2',label:'1-1/16″–2″'};if(d>2&&d<=3)return {key:'2-3',label:'2-1/16″–3″'};if(d>3&&d<=4)return {key:'3-4',label:'3-1/16″–4″'};if(d>4)return {key:'4+',label:'> 4″'};return null;}
function shapeServiceEntries(){return shapeManufacturingItems().map(function(item){return {id:item.id,type:item.type,diameter:item.diameter||'',count:shapeHoleCount(item)};});}
function shapeDerivedServices(){
  var groups=Object.create(null),invalid=[];
  shapeServiceEntries().forEach(function(item){var key=item.type,label=shapeManufacturingItemTitle(item.type),qty=1;if(item.type==='hole'){var d=fabParseDimStrict(item.diameter),hb=d.ok?shapeHoleServiceBand(d.v):null;qty=item.count;if(!hb){invalid.push(item.id);key='hole-invalid-'+item.id;label='Hole · invalid diameter';}else{key='hole:'+hb.key;label='Hole '+hb.label;}}if(!groups[key])groups[key]={label:label,qty:0};groups[key].qty+=qty;});
  /* Геометрия из той же категории тоже становится начислением, поэтому и в
     сводке она рядом: категория одна — итог по ней тоже один. У внешнего DXF
     своей геометрии в ERP нет, там этот блок пуст. */
  if(!shapeIsDxfSource(sDraft)){
    var feats=(sDraft&&sDraft.features)||[];
    var radius=feats.filter(function(f){return f.type==='radius'&&inch(f.radius)>0;}).length;
    if(radius)groups['feature:radius']={label:'Radius Corner',qty:radius};
    var cutout=feats.filter(function(f){return f.type==='cutout';}).length;
    if(cutout)groups['feature:cutout']={label:'Cutout',qty:cutout};
  }
  shapeSandblastFeatures().forEach(function(row){var f=row.f,key='feature:sandblast:'+shapeSandblastCoverage(f)+':'+shapeSandblastSide(f);if(!groups[key])groups[key]={label:shapeSandblastServiceLabel(f),qty:0};groups[key].qty++;});
  /* Нотч оплачивается как работа, а не как геометрия: контур раскроя от него не
     меняется, но вырезать и обработать угол цех обязан. */
  shapeNotchCorners().forEach(function(n){var key='notch:'+n.method;if(!groups[key])groups[key]={label:shapeNotchMethodLabel(n.method),qty:0};groups[key].qty+=n.pieces;});
  return {rows:Object.keys(groups).map(function(k){return groups[k];}),invalid:invalid};
}
function shapeManufacturingServicesHTML(){
  var svc=shapeDerivedServices(),stamps=shapeStampFeatures().length;
  if(!svc.rows.length)return `<div class='shape-service-summary empty-service${stamps?' has-free-stamp':''}'><b>Services</b><span>${stamps?(stamps+(stamps===1?' stamp is':' stamps are')+' FREE drawing annotations. No charge is added.'):'Add an item in Cutout — quantity and services appear here automatically.'}</span>${stamps?`<strong>FREE</strong>`:''}</div>`;
  return `<div class='shape-service-summary'><div class='shape-service-head'><div><b>Services · derived from the drawing</b><small>Pricing happens in the Sales Order. Stamps are always free.</small></div></div><div class='shape-service-table shape-service-table-qty'><div class='shape-service-row head'><span>Service</span><span>Qty</span></div>${svc.rows.map(function(r){return `<div class='shape-service-row'><span>${esc(r.label)}</span><b>${r.qty}</b></div>`;}).join('')}</div>${stamps?`<div class='shape-service-free-row'><span>Stamp × ${stamps}</span><b>FREE</b></div>`:''}</div>`;
}
/* ---------- Метки: Hole и фурнитура ----------
   Кнопки видов приходят из справочника фурнитуры, а не из кода: владелец
   добавляет пивот или что угодно ещё сам, и кнопка появляется сама. */
function shapeMarksToolbarHTML(hint){
  var kinds=hardwareKinds();
  return `<div class='shape-mi-toolbar'><button class='sm' onclick='shapeStartManufacturingPlacement("hole",1)'>+ Hole</button>${kinds.map(function(k){
    return `<button class='sm' onclick='shapeStartManufacturingPlacement("${esc(k.code)}")'>+ ${raw(hardwareKindName(k.code))}</button>`;
  }).join('')}<button class='sm shape-add-stamp' onclick='addShapeFeature("stamp")'>+ Stamp</button><button class='sm shape-add-sandblast' onclick='addShapeFeature("sandblast")'>+ Sandblast</button></div>`;
}
/* Выбор модели. Владелец: «у него есть заготовленные шаблоны петель, он видит
   например Vienna 180 и использует тот шаблон» — значит цеху нужно название, а
   не размеры выреза.

   Выбранная модель показывается ВСЕГДА, даже если её выключили в справочнике
   или удалили оттуда: иначе принятый заказ молча потерял бы имя, по которому
   цех берёт шаблон. Выключенная и пропавшая — это разные случаи, и подпись
   под полем говорит, какой именно. */
function shapeMarkModelFieldHTML(item){
  if(item.type==='hole')return '';
  var models=hardwareModelsFor(item.type),custom=shapeManufacturingModelIsCustom(item);
  var current=custom?'':String(item.modelId||''),row=current?hardwareModelById(current):null;
  var listed=!!row&&models.some(function(m){return m.id===current;});
  var orphan=!!current&&!row,inactive=!!row&&!listed;
  var chosen=custom||!!current;
  var note=custom?'typed by hand':(orphan?'this model is not in the catalog':(inactive?'this model is switched off in the catalog':(models.length?'from the hardware catalog':'the catalog for this kind is empty — type the model by hand')));
  var options=`<option value='' ${chosen?'':'selected'}>— not selected —</option>`+
    (orphan||inactive?`<option value='${esc(current)}' selected data-raw>${esc(shapeManufacturingModelName(item)||current)}</option>`:'')+
    models.map(function(m){return `<option value='${esc(m.id)}' ${current===m.id?'selected':''} data-raw>${esc(m.name)}</option>`;}).join('')+
    `<option value='${SHAPE_MI_CUSTOM_MODEL}' ${custom?'selected':''}>Own model</option>`;
  return `<label>Model<select class='${chosen?'':'bad'}' onchange='shapeSetManufacturingModel("${esc(item.id)}",this.value)'>${options}</select><small>${note}</small></label>`+
    (custom?`<label>Model name<input data-raw value='${esc(item.model||'')}' placeholder='Vienna 180' oninput='shapeSetManufacturingModelText("${esc(item.id)}",this.value)'></label>`:'');
}
/* Метка на карточке. Дублирует подпись группы намеренно: группа уезжает вверх
   при прокрутке, а ошибиться здесь стоит уехавшего файла раскроя. */
function shapeCutFlagHTML(changesCut){
  return changesCut?`<span class='shape-cut-flag cut'>changes the cut</span>`:`<span class='shape-cut-flag draw'>drawing only</span>`;
}
/* Номера у меток нет намеренно. Он был сквозным по всему списку, и вторая петля
   становилась «#2», патч за ней — «#3», зажим — «#4»: порядок ввода читался как
   номер изделия. Метку опознают по виду, модели и её собственному размеру. */
function shapeMarkTitleHTML(item){
  if(item&&item.type==='hole')return esc(shapeHoleName(item));
  var model=shapeManufacturingModelName(item);
  return `${raw(shapeManufacturingItemTitle(item.type))}${model?' · '+raw(model):''}`;
}
function shapeStampCardsHTML(g){
  var stamps=shapeStampFeatures();if(!stamps.length)return '';
  return `<div class='shape-mi-list shape-stamp-list'>${stamps.map(function(row){
    var f=row.f,i=row.i,expanded=sFeatureExpandedId===f.id,pos=shapeStampPosition(f,g),summary=pos?shapeManufacturingEdgeLabel(pos.hRef)+' '+shapeDim16(pos.hDistance)+' · '+shapeManufacturingEdgeLabel(pos.vRef)+' '+shapeDim16(pos.vDistance):'position unavailable';
    return `<div class='shape-mi-card shape-stamp-card${expanded?' selected expanded':''}'><div class='shape-mi-card-head'><button type='button' class='shape-mi-card-toggle' onclick='toggleShapeFeatureCard("${esc(f.id)}")'><span class='shape-mi-kind stamp'>STAMP</span><span><b>${esc(shapeStampText(f))}</b><small>${shapeCutFlagHTML(false)}<span class='shape-free-pill'>FREE</span><span data-raw>${esc(summary)}</span></small></span><i>${expanded?'−':'+'}</i></button>${shapeCardDeleteHTML('removeShapeFeature('+i+')')}</div>${expanded?`<div class='shape-mi-card-body shape-stamp-card-body'>${shapeFeatureFields(f,i,{vertices:[]})}</div>`:''}</div>`;
  }).join('')}</div>`;
}
function shapeSandblastCardsHTML(g){
  var rows=shapeSandblastFeatures();if(!rows.length)return '';
  return `<div class='shape-mi-list shape-sandblast-list'>${rows.map(function(row){
    var f=row.f,i=row.i,expanded=sFeatureExpandedId===f.id,pos=shapeStampPosition(f,g),summary=pos?shapeManufacturingEdgeLabel(pos.hRef)+' '+shapeDim16(pos.hDistance)+' · '+shapeManufacturingEdgeLabel(pos.vRef)+' '+shapeDim16(pos.vDistance):'position unavailable';
    return `<div class='shape-mi-card shape-stamp-card shape-sandblast-card${expanded?' selected expanded':''}'><div class='shape-mi-card-head'><button type='button' class='shape-mi-card-toggle' onclick='toggleShapeFeatureCard("${esc(f.id)}")'><span class='shape-mi-kind sandblast'>SAND</span><span><b>${esc(shapeSandblastServiceLabel(f))}</b><small>${shapeCutFlagHTML(false)}<span data-raw>${esc(summary)}</span></small></span><i>${expanded?'−':'+'}</i></button>${shapeCardDeleteHTML('removeShapeFeature('+i+')')}</div>${expanded?`<div class='shape-mi-card-body shape-stamp-card-body'>${shapeFeatureFields(f,i,{vertices:[]})}</div>`:''}</div>`;
  }).join('')}</div>`;
}
function shapeHolePairFieldsHTML(item){
  var count=shapeHoleCount(item),fields=`<label>Hole type<select onchange='shapeSetHoleCount("${esc(item.id)}",this.value)'><option value='1' ${count===1?'selected':''}>Hole Single</option><option value='2' ${count===2?'selected':''}>Hole Double</option><option value='3' ${count===3?'selected':''}>Hole Triple</option></select></label>`;
  if(count===2)fields+=`<label>Pair direction<select onchange='shapeSetHoleAxis("${esc(item.id)}",this.value)'><option value='horizontal' ${shapeHoleAxis(item)==='horizontal'?'selected':''}>Horizontal →</option><option value='vertical' ${shapeHoleAxis(item)==='vertical'?'selected':''}>Vertical ↑</option></select></label><label>Center-to-center distance<input id='mi_s_${esc(item.id)}' value='${esc(shapeFrac16(shapeHoleSpacing(item)))}' onchange='shapeSetHoleSpacing("${esc(item.id)}",this.value)'></label>`;
  else if(count===3)fields+=`<label>Third hole side<select onchange='shapeSetHoleTripleDirection("${esc(item.id)}",this.value)'><option value='right' ${shapeHoleTripleDirection(item)==='right'?'selected':''}>Right →</option><option value='left' ${shapeHoleTripleDirection(item)==='left'?'selected':''}>Left ←</option></select></label><label>Vertical C-C<input id='mi_sv_${esc(item.id)}' value='${esc(shapeFrac16(shapeHoleTripleVSpacing(item)))}' onchange='shapeSetHoleTripleSpacing("${esc(item.id)}","v",this.value)'></label><label>Horizontal C-C<input id='mi_sh_${esc(item.id)}' value='${esc(shapeFrac16(shapeHoleTripleHSpacing(item)))}' onchange='shapeSetHoleTripleSpacing("${esc(item.id)}","h",this.value)'></label>`;
  return `<div class='shape-hole-library-fields'>${fields}</div>`;
}
function shapeMarksBodyHTML(){
  var items=shapeManufacturingItems(),placing=sManufacturingPlace;
  var body=shapeMarksToolbarHTML('Hole, Stamp and Sandblast use Left/Right plus Bottom/Top references on a 1/16″ grid. Hardware binds to an edge.');
  if(placing)body+=`<div class='shape-mi-place'><b><span>${placing.moveId?'Move':'Add'}</span>: ${placing.type==='hole'?esc(shapeHoleName({count:placing.holeCount})):raw(shapeManufacturingItemTitle(placing.type))}</b><span>${placing.type==='hole'?'Click the first center inside the glass, then set Left/Right and Top/Bottom exactly.':'Click near the required edge; the item binds to Left / Right / Top / Bottom.'}</span><button class='sm' onclick='shapeCancelManufacturingPlacement()'>Cancel</button></div>`;
  var g=shapeManufacturingGeometry(),defs=shapeManufacturingEdgeDefs(g);
  body+=`<div class='shape-mi-list'>${items.length?items.map(function(item,i){
    var expanded=item.id===sManufacturingSelected,d=item.type==='hole'?fabParseDimStrict(item.diameter):null,summary,fields;
    if(item.type==='hole'){
      var pos=shapeManufacturingHolePosition(item,g)||{hRef:'left',vRef:'bottom',hDistance:0,vDistance:0};
      var count=shapeHoleCount(item),pair=count===2?' · C-C '+shapeDim16(shapeHoleSpacing(item))+' · '+(shapeHoleAxis(item)==='vertical'?'Vertical':'Horizontal'):count===3?' · V C-C '+shapeDim16(shapeHoleTripleVSpacing(item))+' · H C-C '+shapeDim16(shapeHoleTripleHSpacing(item))+' · '+(shapeHoleTripleDirection(item)==='left'?'Left':'Right'):'';
      summary=`<span data-raw>${esc('Ø '+(d&&d.ok?dimIn16(d.v):item.diameter)+pair+' · '+shapeManufacturingEdgeLabel(pos.hRef)+' '+shapeDim16(pos.hDistance)+' · '+shapeManufacturingEdgeLabel(pos.vRef)+' '+shapeDim16(pos.vDistance))}</span>`;
      fields=shapeHolePairFieldsHTML(item)+`<div class='shape-mi-hole-position-grid'>
        <div class='shape-mi-axis-card'><label>Horizontal reference<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","h",this.value)'><option value='left' ${pos.hRef==='left'?'selected':''}>Left</option><option value='right' ${pos.hRef==='right'?'selected':''}>Right</option></select></label><label>${count>1?'Distance to first center':'Distance to center'}<input value='${esc(shapeFrac16(pos.hDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","h",this.value)'><small>from the ${pos.hRef==='right'?'right':'left'} edge · 1/16″</small></label></div>
        <div class='shape-mi-axis-card'><label>Vertical reference<select onchange='shapeSetManufacturingHoleReference("${esc(item.id)}","v",this.value)'><option value='bottom' ${pos.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${pos.vRef==='top'?'selected':''}>Top</option></select></label><label>${count>1?'Distance to first center':'Distance to center'}<input value='${esc(shapeFrac16(pos.vDistance))}' onchange='shapeSetManufacturingHoleDistance("${esc(item.id)}","v",this.value)'><small>from the ${pos.vRef==='top'?'top':'bottom'} edge · 1/16″</small></label></div>
      </div><label>Diameter<input id='mi_d_${esc(item.id)}' value='${esc(item.diameter)}' oninput='shapeSetManufacturingField("${esc(item.id)}","diameter",this.value)' onchange='render()'></label>`+shapeDimControlsHTML(item.id,[{key:'h',label:'Horizontal'},{key:'v',label:'Vertical'}].concat(count===2?[{key:'c',label:'C-C'}]:count===3?[{key:'cv',label:'Vertical C-C'},{key:'ch',label:'Horizontal C-C'}]:[]));
    }else{
      /* Навигация у фурнитуры теперь та же, что у отверстия: сначала край, затем
         привязка и расстояние ДО ЦЕНТРА. Раньше край всегда мерился от низа или
         слева, и патч у верхнего угла приходилось задавать длинным числом от
         противоположного конца. */
      var edge=item.edge||'left',ed=defs[edge],len=ed?ed.len:0,max=ed?shapeDim16(len):'—';
      var vertical=(edge==='left'||edge==='right'),fromEnd=shapeMiRefIsEnd(item.id),shown=shapeMiShownDistance(item,len);
      var refOpts=vertical?[['start','Bottom'],['end','Top']]:[['start','Left'],['end','Right']];
      summary=`<span>${esc(shapeManufacturingEdgeLabel(edge))}</span> · <span data-raw>${esc(shapeDim16(shown))}</span> <span>${esc(shapeMiOriginText(edge,fromEnd))}</span>`;
      fields=shapeMarkModelFieldHTML(item)+`<div class='shape-mi-hole-position-grid'>
        <div class='shape-mi-axis-card'><label>Glass edge<select onchange='shapeSetManufacturingEdge("${esc(item.id)}",this.value)'>${['left','right','bottom','top'].map(function(k){return `<option value='${k}' ${edge===k?'selected':''}>${shapeManufacturingEdgeLabel(k)}</option>`;}).join('')}</select><small>the item stays on the finished edge</small></label></div>
        <div class='shape-mi-axis-card'><label>Reference<select onchange='shapeSetDimRef("${esc(item.id)}","e",this.value)'>${refOpts.map(function(o){return `<option value='${o[0]}' ${(fromEnd?'end':'start')===o[0]?'selected':''}>${o[1]}</option>`;}).join('')}</select></label><label>Distance to center<input value='${esc(shapeFrac16(shown))}' onchange='shapeSetManufacturingDistance("${esc(item.id)}",this.value)'><small><span>${esc(shapeMiOriginText(edge,fromEnd))}</span> · <span>Edge length</span> <span data-raw>${esc(max)}</span></small></label></div>
      </div>`+shapeDimControlsHTML(item.id,[{key:'e',label:'Dimension on the drawing'}]);
    }
    return `<div class='shape-mi-card${expanded?' selected expanded':''}'><div class='shape-mi-card-head'><button type='button' class='shape-mi-card-toggle' onclick='sManufacturingSelected=${expanded?'null':'"'+esc(item.id)+'"'};render()'><span class='shape-mi-kind ${esc(item.type)}'>${esc(shapeManufacturingShort(item.type,item))}</span><span><b>${shapeMarkTitleHTML(item)}</b><small>${shapeCutFlagHTML(false)}${summary}</small></span><i>${expanded?'−':'+'}</i></button>${shapeCardDeleteHTML('shapeRemoveManufacturingItem(&quot;'+esc(item.id)+'&quot;)')}</div>${expanded?`<div class='shape-mi-card-body'>${fields}<label>Note<input data-raw value='${esc(item.note||'')}' oninput='shapeSetManufacturingField("${esc(item.id)}","note",this.value)'></label><div class='shape-mi-actions'><button class='sm' onclick='shapeMoveManufacturingItem("${esc(item.id)}")'>Pick on drawing</button></div></div>`:''}</div>`;
  }).join(''):(shapeStampFeatures().length||shapeSandblastFeatures().length?'':'<div class="empty compact">No items yet</div>')}</div>`;
  body+=shapeNotchCardsHTML();
  body+=shapeStampCardsHTML(g);
  body+=shapeSandblastCardsHTML(g);
  return body;
}
function shapeDxfPreviewSvg(source,includeMarks){
  source=shapeNormalizeSource(source);var T=shapeDxfPreviewTransform(source);if(!T)return '';
  var P=T.P,b=T.b,W=T.W,H=T.H,vw=T.vw,vh=T.vh,sc=T.sc,dw=T.dw,dh=T.dh,x0=T.x0,y0=T.y0,X=T.X,Y=T.Y;
  var path=P.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(2)+' '+Y(p[1]).toFixed(2);}).join(' ')+' Z';
  var widthLabel=shapeDrawingDim(source.preview.width16/16),heightLabel=shapeDrawingDim(source.preview.height16/16),topY=Math.max(20,y0-24),leftX=Math.max(24,x0-26),markers=includeMarks?(shapeManufacturingMarkersSvg(source,T)+shapeAnnotationOverlaySvg(T)):'',placing=includeMarks&&sManufacturingPlace?' placing':'';
  return `<svg class='shape-dxf-svg${placing}' viewBox='0 0 ${vw} ${vh}' role='img' aria-label='DXF contour preview' ${includeMarks?"onclick='shapePlaceManufacturingFromEvent(event,this)'":''}>
    <defs><marker id='shapeDxfArrow' viewBox='0 0 8 8' refX='8' refY='4' markerWidth='5' markerHeight='5' orient='auto-start-reverse'><path d='M0,0 L8,4 L0,8 Z' fill='#d92d20'/></marker></defs>
    <path d='${path}' fill='rgba(46,144,250,.04)' stroke='#667085' stroke-width='1.5'/>
    ${markers}
    <line x1='${x0}' y1='${topY}' x2='${x0+dw}' y2='${topY}' class='shape-dxf-dim-line' marker-start='url(#shapeDxfArrow)' marker-end='url(#shapeDxfArrow)'/>
    <line x1='${x0}' y1='${topY-5}' x2='${x0}' y2='${topY+5}' class='shape-dxf-dim-line'/><line x1='${x0+dw}' y1='${topY-5}' x2='${x0+dw}' y2='${topY+5}' class='shape-dxf-dim-line'/>
    <text x='${x0+dw/2}' y='${topY-9}' class='shape-dxf-dim-text' text-anchor='middle'>${esc(widthLabel)}</text>
    <line x1='${leftX}' y1='${y0}' x2='${leftX}' y2='${y0+dh}' class='shape-dxf-dim-line' marker-start='url(#shapeDxfArrow)' marker-end='url(#shapeDxfArrow)'/>
    <line x1='${leftX-5}' y1='${y0}' x2='${leftX+5}' y2='${y0}' class='shape-dxf-dim-line'/><line x1='${leftX-5}' y1='${y0+dh}' x2='${leftX+5}' y2='${y0+dh}' class='shape-dxf-dim-line'/>
    <text x='${leftX-10}' y='${y0+dh/2}' class='shape-dxf-dim-text' text-anchor='middle' transform='rotate(-90 ${leftX-10} ${y0+dh/2})'>${esc(heightLabel)}</text>
  </svg>`;
}
function shapeDrawnProductionSvg(result,interactive,extra){
  /* extra — режим печатного листа: он несёт свою шапку и свою подпись, поэтому
     чертёж рисуется без заголовка и в чёрно-белом варианте. */
  var metricOpts=Object.assign({},shapeMetricProductionOptions(result,interactive),extra||{});
  var svg=ShapeModule.productionSvg(result,metricOpts),T=shapeDrawnPreviewTransform(result,extra);if(!T)return svg;
  /* The footer remains in downloaded/printed production files. In the live
     workspace it only consumed drawing area and repeated information already
     represented by the active drawing tab. */
  if(interactive)svg=svg.replace(/<text x="24" y="[^"]+" font-size="10" fill="#667085">Finished geometry[^<]*<\/text>/,'');
  var uiWas=shapeDimUi;if(!interactive)shapeDimUi=false;
  try{return shapeDrawnProductionBody(svg,T,interactive);}finally{shapeDimUi=uiWas;}
}
function shapeDrawnProductionBody(svg,T,interactive){
  /* Стрелку размера объявляем один раз: метки объявляют её сами, а если меток
     нет — её объявляет блок выреза, иначе линии остались бы без наконечников. */
  var marks=shapeManufacturingMarkersSvg(null,T),cuts=shapeCutoutDimsSvg(T),annotations=shapeAnnotationDimsSvg(T),dims=cuts+annotations;
  var extra=marks+(dims?(marks?'':shapeDimArrowDefs())+dims:'');
  if(extra)svg=svg.replace('</svg>',extra+'</svg>');
  if(interactive)svg=svg.replace('<svg ','<svg class="shape-drawn-production-interactive'+(sManufacturingPlace?' placing':'')+'" onclick="shapePlaceManufacturingFromEvent(event,this)" ');
  return svg;
}
function shapePreviewMarkup(r){
  if(r&&r.externalFile){
    var source=(r.definition&&r.definition.source)||shapeNormalizeSource(null),cutting=sView==='cutting',svg=r.sourceValid?shapeDxfPreviewSvg(source,!cutting):'';
    var title=cutting?'CUTTING DXF · source file':'Production Drawing · DXF';
    var note=cutting?'This is the clean contour of the external DXF used as the cutting source. Clamp / Hinge / Hole marks from ERP are intentionally NOT shown here.':(sManufacturingPlace?'Click inside the contour to place '+esc(shapeManufacturingItemTitle(sManufacturingPlace.type))+'.':'The contour is read from Fusion 360. Red lines show the maximum bounding size; colored marks are Manufacturing items and do not modify the Cutting DXF.');
    return `<div class='shape-dxf-preview visual ${cutting?'cutting-source-view':''}'><div class='shape-dxf-preview-title'><b>${esc(title)}</b><span>${esc(note)}</span></div>${svg||'<div class="module-invalid">DXF preview unavailable</div>'}${source.fileName?`<div class='shape-dxf-preview-file'><span data-raw>${raw(source.fileName)}</span><small data-raw>${esc(shapeFileSizeText(source.fileSize))}</small>${cutting?'<b>→ CUTTING SOURCE</b>':''}</div>`:''}</div>`;
  }
  if(sView==='production')return shapeDrawnProductionSvg(r,true);
  if(sView==='cutting')return ShapeModule.cuttingSvg(r);
  return shapeDrawnProductionSvg(r,true);
}
function shapeDerivedHTML(r){
  if(r&&r.externalFile){
    if(!r.sourceValid){var sourceErrors=(r.errors&&r.errors.length?r.errors:[r.reason||'Invalid DXF source']);return `<div class='validation-box badbox'><b>DXF file error</b>${sourceErrors.map(function(x){return '<div>'+esc(moduleErrorText({reason:x}))+'</div>';}).join('')}</div>`;}
    return `<div class='smart-kpis'><div><span>Width</span><b>${dimIn16(r.width)}</b></div><div><span>Height</span><b>${dimIn16(r.height)}</b></div><div><span>Billable area</span><b>${(r.billableArea/144).toFixed(2)} ft²</b></div><div><span>Grid</span><b>1/16″</b></div></div>
      <div class='validation-box okbox'><b>DXF validated and accepted</b><div>Dimensions are rounded to the nearest 1/16″. Billable area is calculated from the Width × Height bounding rectangle. The original DXF contents are not stored in localStorage.</div></div>`;
  }
  if(!r.valid){
    var errors=(r.errors&&r.errors.length?r.errors:[r.reason||'Invalid Shape']);
    return `<div class='validation-box badbox'><b>Geometry error</b>${errors.map(function(x){return '<div>'+esc(moduleErrorText({reason:x}))+'</div>';}).join('')}</div>`;
  }
  var req=r.requirements||[],warns=r.warns||[];
  return `<div class='smart-kpis'><div><span>Finished</span><b>${dimIn16(r.width)} × ${dimIn16(r.height)}</b></div><div><span>Net area</span><b>${(r.area/144).toFixed(2)} ft²</b></div><div><span>Perimeter</span><b>${dimIn16(r.perimeter)}</b></div><div><span>Cut size</span><b>${dimIn16(r.cutting.width)} × ${dimIn16(r.cutting.height)}</b></div>${r.cutting.safetyBorder&&r.cutting.safetyBorder.applies?`<div><span>Safety Border</span><b>${r.cutting.safetyBorder.manualRequired?'not set':dimIn16(r.cutting.safetyBorder.value)+' · '+esc(r.cutting.safetyBorder.state)}</b></div><div><span>Billable footprint</span><b>${dimIn16(r.cutting.footprint.width)} × ${dimIn16(r.cutting.footprint.height)}</b></div>`:''}</div>
    ${typeof shapeProdBorderField==='function'?shapeProdBorderField():''}
    <div class='shape-requirements ${req.length?'':'empty'}'><b>Manufacturing requirements</b>${req.length?req.map(function(q){return `<span><i>${esc(q.stationClass)}</i> ${esc(q.operation)}${q.edgeIds?' · '+esc(q.edgeIds.join(', ')):''}</span>`;}).join(''):'<span>No additional operations</span>'}</div>
    ${warns.length?`<div class='validation-box warnbox'>${warns.map(function(w){return esc(moduleErrorText({reason:w}));}).join('<br>')}</div>`:`<div class='validation-box okbox'>Contour valid · Production Drawing and Cutting Geometry synchronized · ${esc(r.fingerprint)}</div>`}`;
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
  /* Topology inputs (especially a newly selected notch) can temporarily make
     the contour invalid. Keep Edge processing in the DOM and refresh its
     contents without rebuilding a field currently being edited inside it. */
  var ew=document.getElementById('shapeEdgeworkEditor'),actNow=document.activeElement;
  if(ew&&!(actNow&&ew.contains(actNow))){var ewBox=document.createElement('div');ewBox.innerHTML=shapeEdgeworkEditor();var ewNext=ewBox.firstElementChild;if(ewNext){ew.replaceWith(ewNext);applyLang(ewNext);}}
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
  if(sDraft.type==='parallelogram')shapeParaRefresh();
  if(sDraft.type==='triangle')shapeTriRefresh();
  if(sDraft.type==='polygon')shapePolyRefresh();
  if(sDraft.type==='custom')shapeCustomApplyResolved();
  shapeMarkFields();shapeFitPreview();
  document.querySelectorAll('[data-shape-view]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-shape-view')===sView);});
  var metricButton=document.querySelector('.shape-metric-toggle'),metricOff=sView==='cutting'||shapeIsDxfSource(sDraft);
  if(metricButton){metricButton.disabled=metricOff;metricButton.classList.toggle('on',sMetricDetail&&!metricOff);metricButton.setAttribute('aria-pressed',sMetricDetail&&!metricOff?'true':'false');}
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
  if(sDraft.type==='parallelogram')return shapeParaMasterSizeFields();
  if(sDraft.type==='triangle')return shapeTriMasterSizeFields();
  if(sDraft.type==='polygon')return shapePolyMasterSizeFields();
  if(sDraft.type==='custom')return shapeCustomMasterSizeFields();
  var w=`<div><label>${sDraft.type==='circle'?'Diameter':'B · Width'}</label><input id='shapeWField' value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'></div>`;
  var h=sDraft.type==='circle'?'':`<div><label>${sDraft.type==='raked'?'Long Height':'A · Height'}</label><input id='shapeHField' value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`;
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
    <div class='em-row em-foot'><span class='em-key'><button class='${m.elbowsOn?'on':''}' onclick='setShapeElbows(${m.elbowsOn?'false':'true'})'>${m.elbowsOn?'Hide Elbows':'Show Elbows'}</button></span><span class='em-note'>${m.elbowsOn?'compound edge break · on D the length and the outage past the elbow are calculated automatically':'simple edge slope · D is calculated automatically'}</span></div>
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
  if(!r.valid)return `<div class='mini-shape bad'>invalid</div>`;
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
      <div class='notch-row notch-head-row'><span>Edge</span><span>Length</span><span>Skew</span><span>Direction</span></div>
      ${byCorner[c].map(function(e){
        var x=sDraft.smart.extraEdges[e.id]||{},vert=e.axis==='v';
        var dirs=vert?[['left','← left'],['right','→ right']]:[['up','↑ up'],['down','↓ down']];
        var skewed=ssNN(x.out)>0&&x.dir;
        return `<div class='notch-row${skewed?' skewed':''}'>
          <span class='notch-id'>${e.id}<small>${vert?'vertical':'horizontal'}</small></span>
          <input data-vfield='len' value='${esc(x.len||'')}' placeholder='0' oninput='setShapeExtra("${e.id}",this.value)'>
          <input data-vfield='num' value='${esc(x.out||'0')}' placeholder='0' oninput='setShapeExtraOut("${e.id}","out",this.value)' onblur='shapeZeroIfEmpty(this)' data-i18n-title='${vert?'out of plumb':'out of level'}'>
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
    else if(kind==='angle')bad=!(v!==''&&isFinite(+v)&&+v>=0&&+v<90);
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
  if(r.externalFile){if(e)fail(e,'A DXF file from Fusion 360 is not printed as a Production Shape drawing.');return;}
  if(!r.valid){if(e)fail(e,'Invalid geometry cannot be printed: '+(r.errors&&r.errors[0]||r.reason||''));return;}
  /* Лист несёт свою шапку и маршрут, поэтому чертёж рисуется без собственного
     заголовка и в чёрно-белом варианте: цех печатает ч/б, и цветом стороны там
     не различить — их называет буква на кромке. */
  var cutting=sView==='cutting';
  var svg=cutting?ShapeModule.cuttingSvg(r):shapeDrawnProductionSvg(r,false,{sheet:true});
  var kind=cutting?'CUTTING SHAPE':'PRODUCTION DRAWING';
  printSheet(salesShapeSheetHTML(sDraft,r,svg,kind),'',salesSheetFitDrawing);
}
/* Снятый угловой блок уносит с собой свои рёбра E/F/G…, но обработка кромки по
   ним оставалась в edgeOps и навсегда роняла форму в «Edge processing references
   missing edge». Убрать её из интерфейса было нечем: строки такого ребра больше
   нет. Основные стороны A/B/C/D существуют всегда и не трогаются. */
function shapePruneExtraEdgeOps(model){
  if(!model||!model.extraEdges)return;
  var live={A:1,B:1,C:1,D:1};Object.keys(model.extraEdges).forEach(function(id){live[id]=1;});
  var drop=function(ops){if(ops)Object.keys(ops).forEach(function(id){if(!live[id])delete ops[id];});};
  drop(sDraft.edgeOps);
  Object.keys(sDraft.lites||{}).forEach(function(key){drop((sDraft.lites[key]||{}).edgeOps);});
}
function shapeSmartControls(){
  var S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;shapePruneExtraEdgeOps(sDraft.smart);var map=ssEdgeMap(S).all;
  return `${shapeSmartVisual()}
    ${shapeEdgeMatrix()}
    ${shapeCornerSectionsVisible()?`<div class='extra-edges'><div class='corner-title'><b>Corner edge dimensions</b><span>each notch edge can be skewed independently</span></div>${map.length?shapeNotchMatrix(map):`<div class='empty compact'>Values appear when the corner block has edges</div>`}</div>`:''}`;
}
function shapeParaMasterSizeFields(){
  var q=shapeParaDraftValues(),derived=q.mode==='diagonal-angle';
  var wDerived=derived&&!q.sideways,hDerived=derived&&q.sideways;
  return `<div><label>B · Width${wDerived?' · calculated':''}</label><input id='shapeWField' data-vfield='len' class='${wDerived?'ro':''}' ${wDerived?'readonly':''} value='${esc(wDerived&&q.ok?shapeParaDimText(q.width):sDraft.w)}' oninput='setShapeField("w",this.value)'></div>
    <div><label>A · Height${hDerived?' · calculated':''}</label><input id='shapeHField' data-vfield='len' class='${hDerived?'ro':''}' ${hDerived?'readonly':''} value='${esc(hDerived&&q.ok?shapeParaDimText(q.height):sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`;
}
function shapeParaDiagram(){
  var q=shapeParaDraftValues(),g=shapeDraftGeometry();
  if(!q.ok||!g.ok)return `<div class='shape-para-invalid'>Enter a valid measurement set</div>`;
  var b=fabEdgeBounds(g.points),bw=Math.max(.001,b.maxX-b.minX),bh=Math.max(.001,b.maxY-b.minY),vw=230,vh=150,pad=23,sc=Math.min((vw-pad*2)/bw,(vh-pad*2)/bh),x0=(vw-bw*sc)/2,y0=(vh-bh*sc)/2;
  function X(x){return x0+(x-b.minX)*sc;}function Y(y){return y0+bh*sc-(y-b.minY)*sc;}
  var d=g.points.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1);}).join(' ')+' Z';
  var arrow=SHAPE_PARA_DIRECTIONS.find(function(x){return x.id===q.direction;});
  return `<svg viewBox='0 0 ${vw} ${vh}' aria-label='Parallelogram measurement preview'><rect x='${x0.toFixed(1)}' y='${y0.toFixed(1)}' width='${(bw*sc).toFixed(1)}' height='${(bh*sc).toFixed(1)}' fill='none' stroke='#d0d5dd' stroke-dasharray='4 4'/><path d='${d}' fill='#fff' stroke='#101828' stroke-width='1.8'/><text x='${vw/2}' y='${vh-5}' text-anchor='middle'>Width ${esc(shapeParaDimText(q.width))}″</text><text x='7' y='${vh/2}' text-anchor='middle' transform='rotate(-90 7 ${vh/2})'>Height ${esc(shapeParaDimText(q.height))}″</text><text class='oos' x='${vw-8}' y='16' text-anchor='end'>OOS ${esc(shapeParaDimText(q.outOfSquare))}″</text><text class='dir' x='${vw/2}' y='16' text-anchor='middle'>${esc(arrow.arrow+' '+arrow.label)}</text></svg>`;
}
function shapeParaReadout(q){return q&&q.ok?{oos:shapeParaDimText(q.outOfSquare)+'″',diagonal:shapeParaDimText(q.diagonal)+'″',angle:shapeParaAngleText(q.angle)+'°'}:{oos:'—',diagonal:'—',angle:'—'};}
function shapeParaRefresh(){
  var q=shapeParaApplyResolved(),v=shapeParaReadout(q),act=document.activeElement;
  function val(id,value){var el=document.getElementById(id);if(el&&el!==act)el.value=value;}
  function txt(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
  if(q&&q.ok){
    if(q.mode!=='height-oos')val('shapeParaOosField',v.oos);
    if(q.mode!=='height-diagonal'&&q.mode!=='diagonal-angle')val('shapeParaDiagonalField',v.diagonal);
    if(q.mode!=='diagonal-angle'&&q.mode!=='height-angle')val('shapeParaAngleField',shapeParaAngleText(q.angle));
    if(q.mode==='diagonal-angle'){if(q.sideways)val('shapeHField',shapeParaDimText(q.height));else val('shapeWField',shapeParaDimText(q.width));}
  }
  txt('shapeParaReadOos',v.oos);txt('shapeParaReadDiagonal',v.diagonal);txt('shapeParaReadAngle',v.angle);
  var visual=document.getElementById('shapeParaVisual');if(visual)visual.innerHTML=shapeParaDiagram();
}
function shapeParaControls(){
  var q=shapeParaDraftValues(),mode=q.mode,read=shapeParaReadout(q);
  function input(id,label,key,value,kind){return `<label>${label}<input id='${id}' data-vfield='${kind||'num'}' value='${esc(value)}' oninput='setShapeParam("${key}",this.value)'></label>`;}
  var fields='';
  if(mode==='height-oos')fields=input('shapeParaOosField','Out of square','outOfSquare',sDraft.params.outOfSquare,'num');
  if(mode==='height-diagonal')fields=input('shapeParaDiagonalField','Diagonal Length','diagonal',sDraft.params.diagonal,'len');
  if(mode==='diagonal-angle')fields=input('shapeParaDiagonalField','Diagonal Length','diagonal',sDraft.params.diagonal,'len')+input('shapeParaAngleField','OOS Angle','angle',sDraft.params.angle,'angle');
  if(mode==='height-angle')fields=input('shapeParaAngleField','OOS Angle','angle',sDraft.params.angle,'angle');
  return `<div class='shape-subsection shape-para-editor'><div class='corner-title'><b>Parallelogram measurements</b><span>finished size · fractions supported</span></div>
    <label>Measure<select onchange='setShapeParaMeasure(this.value)'>${SHAPE_PARA_MEASURES.map(function(x){return `<option value='${x.id}' ${mode===x.id?'selected':''}>${x.label}</option>`;}).join('')}</select></label>
    <div class='shape-para-main'><div id='shapeParaVisual' class='shape-para-visual'>${shapeParaDiagram()}</div><div class='shape-para-entry'>${fields}<label>Slope Direction<div class='shape-para-directions'>${SHAPE_PARA_DIRECTIONS.map(function(x){return `<button type='button' class='${q.direction===x.id?'on':''}' onclick='setShapeParaDirection("${x.id}")'><i>${x.arrow}</i>${x.label}</button>`;}).join('')}</div></label></div></div>
    <div class='shape-para-readout'><span><small>Out of square</small><b id='shapeParaReadOos'>${esc(read.oos)}</b></span><span><small>Diagonal</small><b id='shapeParaReadDiagonal'>${esc(read.diagonal)}</b></span><span><small>OOS Angle</small><b id='shapeParaReadAngle'>${esc(read.angle)}</b></span></div></div>`;
}
/* Треугольник переиспользует раскладку измерений параллелограмма — схема,
   поля ввода и строка расчёта. Одна и та же сетка на всех фигурах с режимами
   ввода: оператор не переучивается, переходя с фигуры на фигуру. */
function shapeTriMasterSizeFields(){
  var q=shapeTriDraftValues(),derived=q.mode==='diagonal';
  return `<div><label>B · Bottom</label><input id='shapeWField' data-vfield='len' value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'></div>
    <div><label>A · Height${derived?' · calculated':''}</label><input id='shapeHField' data-vfield='len' class='${derived?'ro':''}' ${derived?'readonly':''} value='${esc(derived&&q.ok?shapeParaDimText(q.height):sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`;
}
function shapeTriReadout(q){
  return q&&q.ok?{offset:shapeParaDimText(q.topOffset)+'″',left:shapeParaDimText(q.leftEdge)+'″',right:shapeParaDimText(q.rightEdge)+'″'}:{offset:'—',left:'—',right:'—'};
}
function shapeTriDiagram(){
  var q=shapeTriDraftValues(),g=shapeDraftGeometry();
  if(!q.ok||!g.ok)return `<div class='shape-para-invalid'>Enter a valid measurement set</div>`;
  var b=fabEdgeBounds(g.points),bw=Math.max(.001,b.maxX-b.minX),bh=Math.max(.001,b.maxY-b.minY),vw=230,vh=150,pad=23,sc=Math.min((vw-pad*2)/bw,(vh-pad*2)/bh),x0=(vw-bw*sc)/2,y0=(vh-bh*sc)/2;
  function X(x){return x0+(x-b.minX)*sc;}function Y(y){return y0+bh*sc-(y-b.minY)*sc;}
  var d=g.points.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1);}).join(' ')+' Z';
  var ax=X(q.topOffset).toFixed(1),ay=Y(q.height).toFixed(1),base=Y(0).toFixed(1);
  return `<svg viewBox='0 0 ${vw} ${vh}' aria-label='Triangle measurement preview'><rect x='${x0.toFixed(1)}' y='${y0.toFixed(1)}' width='${(bw*sc).toFixed(1)}' height='${(bh*sc).toFixed(1)}' fill='none' stroke='#d0d5dd' stroke-dasharray='4 4'/><path d='${d}' fill='#fff' stroke='#101828' stroke-width='1.8'/><line x1='${ax}' y1='${ay}' x2='${ax}' y2='${base}' stroke='#b42318' stroke-width='1' stroke-dasharray='4 3'/><text x='${vw/2}' y='${vh-5}' text-anchor='middle'>Bottom ${esc(shapeParaDimText(q.bottom))}″</text><text x='7' y='${vh/2}' text-anchor='middle' transform='rotate(-90 7 ${vh/2})'>Height ${esc(shapeParaDimText(q.height))}″</text><text class='oos' x='${vw-8}' y='16' text-anchor='end'>Offset ${esc(shapeParaDimText(q.topOffset))}″</text></svg>`;
}
function shapeTriRefresh(){
  var q=shapeTriApplyResolved(),v=shapeTriReadout(q),act=document.activeElement;
  function val(id,value){var el=document.getElementById(id);if(el&&el!==act)el.value=value;}
  function txt(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
  if(q&&q.ok){
    if(q.mode!=='square')val('shapeTriOffsetField',shapeParaDimText(q.topOffset));
    if(q.mode!=='diagonal'){val('shapeTriLeftField',shapeParaDimText(q.leftEdge));val('shapeTriRightField',shapeParaDimText(q.rightEdge));}
  }
  txt('shapeTriReadOffset',v.offset);txt('shapeTriReadLeft',v.left);txt('shapeTriReadRight',v.right);
  var visual=document.getElementById('shapeTriVisual');if(visual)visual.innerHTML=shapeTriDiagram();
}
function shapeTriangleControls(){
  var q=shapeTriDraftValues(),mode=q.mode,read=shapeTriReadout(q),p=sDraft.params||{};
  function input(id,label,key,value,kind){return `<label>${label}<input id='${id}' data-vfield='${kind||'num'}' value='${esc(value)}' oninput='setShapeParam("${key}",this.value)'></label>`;}
  var fields=mode==='diagonal'
    ?input('shapeTriLeftField','Left Edge','leftEdge',p.leftEdge,'len')+input('shapeTriRightField','Right Edge','rightEdge',p.rightEdge,'len')
    :input('shapeTriOffsetField','Top Offset','topOffset',p.topOffset,'len');
  return `<div class='shape-subsection shape-para-editor shape-tri-editor'><div class='corner-title'><b>Triangle measurements</b><span>finished size · fractions supported</span></div>
    <label>Measure<select onchange='setShapeTriMeasure(this.value)'>${SHAPE_TRI_MEASURES.map(function(x){return `<option value='${x.id}' ${mode===x.id?'selected':''}>${x.label}</option>`;}).join('')}</select></label>
    <div class='shape-para-main'><div id='shapeTriVisual' class='shape-para-visual'>${shapeTriDiagram()}</div><div class='shape-para-entry'>${fields}</div></div>
    <div class='shape-para-readout'><span><small>Top offset</small><b id='shapeTriReadOffset'>${esc(read.offset)}</b></span><span><small>Left edge</small><b id='shapeTriReadLeft'>${esc(read.left)}</b></span><span><small>Right edge</small><b id='shapeTriReadRight'>${esc(read.right)}</b></span></div></div>`;
}
function shapeCustomApplyResolved(){
  var b=shapeCustomBounds(sDraft.polygon);
  if(b){sDraft.w=shapeParaDimText(b.width);sDraft.h=shapeParaDimText(b.height);}
  return b;
}
function shapeCustomMasterSizeFields(){
  var b=shapeCustomBounds(sDraft.polygon);
  return `<div><label>B · Width · from points</label><input id='shapeWField' data-vfield='len' class='ro' readonly value='${esc(b?shapeParaDimText(b.width):sDraft.w)}'></div>
    <div><label>A · Height · from points</label><input id='shapeHField' data-vfield='len' class='ro' readonly value='${esc(b?shapeParaDimText(b.height):sDraft.h)}'></div>`;
}
function shapePolyDraftValues(){return shapeRegularPolygonValues(sDraft.params||{});}
/* Габарит правильного многоугольника задан числом сторон и стороной, поэтому
   W и H живут в черновике как посчитанные значения: карточки Finished и Cut
   size, раскрой и печать читают их оттуда же, откуда у остальных фигур. */
function shapePolyRemember(q){
  if(!q||!q.ok)return q;
  sDraft.w=shapeParaDimText(q.width);sDraft.h=shapeParaDimText(q.height);
  return q;
}
function shapePolyApplyResolved(){return shapePolyRemember(shapePolyDraftValues());}
function shapePolyReadout(q){
  return q&&q.ok?{width:shapeParaDimText(q.width)+'″',height:shapeParaDimText(q.height)+'″',perimeter:shapeParaDimText(q.perimeter)+'″'}:{width:'—',height:'—',perimeter:'—'};
}
function shapePolyMasterSizeFields(){
  var q=shapePolyDraftValues();
  return `<div><label>B · Width · calculated</label><input id='shapeWField' data-vfield='len' class='ro' readonly value='${esc(q.ok?shapeParaDimText(q.width):sDraft.w)}'></div>
    <div><label>A · Height · calculated</label><input id='shapeHField' data-vfield='len' class='ro' readonly value='${esc(q.ok?shapeParaDimText(q.height):sDraft.h)}'></div>`;
}
function shapePolyDiagram(){
  var q=shapePolyDraftValues(),g=shapeDraftGeometry();
  if(!q.ok||!g.ok)return `<div class='shape-para-invalid'>Enter a valid measurement set</div>`;
  var b=fabEdgeBounds(g.points),bw=Math.max(.001,b.maxX-b.minX),bh=Math.max(.001,b.maxY-b.minY),vw=230,vh=150,pad=23,sc=Math.min((vw-pad*2)/bw,(vh-pad*2)/bh),x0=(vw-bw*sc)/2,y0=(vh-bh*sc)/2;
  function X(x){return x0+(x-b.minX)*sc;}function Y(y){return y0+bh*sc-(y-b.minY)*sc;}
  var d=g.points.map(function(p,i){return (i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1);}).join(' ')+' Z';
  return `<svg viewBox='0 0 ${vw} ${vh}' aria-label='Polygon measurement preview'><rect x='${x0.toFixed(1)}' y='${y0.toFixed(1)}' width='${(bw*sc).toFixed(1)}' height='${(bh*sc).toFixed(1)}' fill='none' stroke='#d0d5dd' stroke-dasharray='4 4'/><path d='${d}' fill='#fff' stroke='#101828' stroke-width='1.8'/><text x='${vw/2}' y='${vh-5}' text-anchor='middle'>Width ${esc(shapeParaDimText(q.width))}″</text><text x='7' y='${vh/2}' text-anchor='middle' transform='rotate(-90 7 ${vh/2})'>Height ${esc(shapeParaDimText(q.height))}″</text><text class='oos' x='${vw-8}' y='16' text-anchor='end'>${q.sides} × ${esc(shapeParaDimText(q.sideLength))}″</text></svg>`;
}
function shapePolyRefresh(){
  var q=shapePolyApplyResolved(),v=shapePolyReadout(q);
  function txt(id,value){var el=document.getElementById(id);if(el)el.textContent=value;}
  txt('shapePolyReadWidth',v.width);txt('shapePolyReadHeight',v.height);txt('shapePolyReadPerimeter',v.perimeter);
  var visual=document.getElementById('shapePolyVisual');if(visual)visual.innerHTML=shapePolyDiagram();
}
function shapePolygonControls(){
  var q=shapePolyDraftValues(),p=sDraft.params||{},read=shapePolyReadout(q);
  return `<div class='shape-subsection shape-para-editor shape-poly-editor'><div class='corner-title'><b>Polygon measurements</b><span>regular polygon · all sides equal</span></div>
    <div class='shape-para-main'><div id='shapePolyVisual' class='shape-para-visual'>${shapePolyDiagram()}</div><div class='shape-para-entry'><label>Number of Sides<input id='shapePolySidesField' data-vfield='num' value='${esc(p.sides)}' oninput='setShapeParam("sides",this.value)'></label><label>Side Length<input id='shapePolySideField' data-vfield='len' value='${esc(p.sideLength)}' oninput='setShapeParam("sideLength",this.value)'></label></div></div>
    <div class='shape-para-readout'><span><small>Width</small><b id='shapePolyReadWidth'>${esc(read.width)}</b></span><span><small>Height</small><b id='shapePolyReadHeight'>${esc(read.height)}</b></span><span><small>Perimeter</small><b id='shapePolyReadPerimeter'>${esc(read.perimeter)}</b></span></div></div>`;
}
/* Свободный контур по точкам: пришёл из старого Polygon и остаётся здесь без
   изменений — те же ID вершин, те же радиусы и та же обработка кромки. */
function shapeCustomControls(){
  return `<div class='shape-subsection'><div class='corner-title'><b>Custom Shape points</b><span>order sets the outline · last point closes back to the first · minimum three</span></div><div class='shape-vertex-grid'>${sDraft.polygon.map(function(v,i){return `<div class='shape-vertex-row'><b>${esc(v.id)}</b><label>X<input value='${esc(v.x)}' oninput='setPolygonCoord(${i},"x",this.value)'></label><label>Y<input value='${esc(v.y)}' oninput='setPolygonCoord(${i},"y",this.value)'></label><button class='sm dl' ${sDraft.polygon.length<=3?'disabled':''} onclick='removePolygonVertex(${i})'>×</button></div>`;}).join('')}</div><button class='sm' onclick='addPolygonVertex()'>Add point</button></div>`;
}
function shapeRakedControls(){
  var p=sDraft.params||{},side=shapeRakeSide(p.rakeSide),shortSide=shapeRakeShortSide(p.shortSide);
  return `<div class='shape-subsection shape-raked-editor'><div class='corner-title'><b>Raked Rectangle measurements</b><span>finished size · fractions supported</span></div><div class='grid'><div><label>Short Height</label><input data-vfield='len' value='${esc(p.shortHeight)}' oninput='setShapeParam("shortHeight",this.value)'></div><div><label>Rake Side</label><select onchange='setShapeParam("rakeSide",this.value)'>${SHAPE_RAKE_SIDES.map(function(x){return `<option value='${x.id}' ${side===x.id?'selected':''}>${x.label}</option>`;}).join('')}</select></div><div><label>Short Side</label><select onchange='setShapeParam("shortSide",this.value)'>${SHAPE_RAKE_SHORT_SIDES.map(function(x){return `<option value='${x.id}' ${shortSide===x.id?'selected':''}>${x.label}</option>`;}).join('')}</select></div></div></div>`;
}
function setPolygonCoord(i,k,v){if(sDraft.polygon[i])sDraft.polygon[i][k]=v;shapeCustomApplyResolved();refreshShapeEditor();}
/* Номер точки должен читаться человеком: он стоит и в таблице, и в коде
   ребра (E:PV5). Берём следующий свободный номер, а не UUID. */
function addPolygonVertex(){
  var last=sDraft.polygon[sDraft.polygon.length-1]||{x:'0',y:'0'};
  var used=sDraft.polygon.map(function(v){return Math.max(0,parseInt(String(v.id||'').replace(/[^0-9]/g,''),10)||0);});
  var next=Math.max.apply(null,used.concat([sDraft.polygon.length]))+1;
  sDraft.polygon.push({id:'PV'+next,x:String(inch(last.x)+4),y:String(inch(last.y))});shapeCustomApplyResolved();render();
}
function removePolygonVertex(i){if(sDraft.polygon.length<=3)return;sDraft.polygon.splice(i,1);shapeCustomApplyResolved();render();}
function shapeGenericControls(){
  if(sDraft.type==='parallelogram')return shapeParaControls();
  if(sDraft.type==='raked')return shapeRakedControls();
  if(sDraft.type==='triangle')return shapeTriangleControls();
  if(sDraft.type==='polygon')return shapePolygonControls();
  var specs=shapeParamSpecsFor(sDraft.type);
  return `${specs.length?`<div class='shape-subsection'><div class='corner-title'><b>Shape parameters</b><span>inches · fractions supported</span></div><div class='grid'>${specs.map(function(s){return `<div><label>${esc(s.label)}</label><input value='${esc(sDraft.params[s.key])}' oninput='setShapeParam("${s.key}",this.value)'></div>`;}).join('')}</div></div>`:''}${sDraft.type==='custom'?shapeCustomControls():''}`;
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
  return kind?`<small class='shape-edge-base' title='${esc(glassBaseEdgeworkLabel(kind))}'><span>from glass</span> <span data-raw>${esc(kind==='polish'?'Flat':'Rough')}</span></small>`:'';
}
/* Вкладки лайтов: «Все лайты» правит общую обработку формы, вкладка лайта —
   его отступ и его кромку. Показываем только когда лайтов больше одного. */
/* Открыта СВОЯ форма лайта — говорим об этом в шапке редактора, а не внутри
   свёрнутой секции кромок, иначе подсказку не видно. */
function shapeLiteBanner(){
  if(!salesBridge||salesBridge.kind!=='shape'||salesBridge.liteIndex==null)return '';
  return `<div class='shape-lite-note own'>This is the own Shape of <b>Lite ${salesBridge.liteIndex+1}</b> of this order line. The other lites live on the shared Shape.</div>`;
}
function shapeEdgeLiteTabs(){
  if(salesBridge&&salesBridge.kind==='shape'&&salesBridge.liteIndex!=null)return '';
  var lites=shapeEditorLites();
  if(lites.length<2)return '';
  return `<div class='shape-lite-tabs'><button type='button' class='${sEdgeLite==null?'on':''}' onclick='setShapeEdgeLite("")'>All lites</button>`
   +lites.map(function(l){
     var spec=(sDraft.lites||{})[String(l.index)]||{},marks=Object.keys(spec.inset||{}).length+Object.keys(spec.edgeOps||{}).length;
     return `<button type='button' class='${sEdgeLite===l.index?'on':''}' onclick='setShapeEdgeLite(${l.index})'>${esc(l.label)}${l.mm?' · '+esc(l.mm)+' mm':''}${marks?' <i>'+marks+'</i>':''}</button>`;
    }).join('')
   +`</div><div class='shape-lite-note'>${sEdgeLite==null?'Shape-wide edgework: applies to every lite unless the lite has its own.':'Edgework of this glass. Empty = the Shape-wide one, or the base edgework of the glass. Lite geometry lives in the “Lites of the unit” section.'}</div>`;
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
    var insets=(r.geometry.edges||[]).map(function(e){return shapeLiteInsetFor(sDraft,liteIndex,e.id);});
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
      :(spec.mirror?`<span class='pill info'>Mirror</span>`:'')+(insetCount?`<span class='pill info'>Inset</span>`:'')||`<span class='pill'>Same as Shape</span>`;
    var actions=own
      ? `<button type='button' class='sm' onclick='salesOpenLiteShape("${esc(line.id)}",${l.index})'>Open</button><button type='button' class='sm dl' onclick='salesReattachLiteShape("${esc(line.id)}",${l.index})'>Back to shared</button>`
      : `<label class='shape-lite-mirror'><input type='checkbox' ${spec.mirror?'checked':''} onchange='setShapeLiteMirror(${l.index},this.checked)'><span>Mirror</span></label>`
        +(line?`<button type='button' class='sm' onclick='salesOpenLiteShape("${esc(line.id)}",${l.index})'>Own shape</button>`:'');
    var insets=own?'':`<div class='shape-lite-insets'><span>Inset per edge</span>${groups.map(function(g,gi){
      var v=(spec.inset||{})[g.id]||'';
      return `<label><b>${esc(g.id)}</b><input value='${esc(v)}' placeholder='0' onchange='setShapeLiteInsetFor(${l.index},${gi},this.value)'></label>`;
     }).join('')}</div>`;
    var thumb=shapeMiniContourSvg(shapeLiteContourPoints(l.index),(spec.mirror?'mirrored':''));
    return `<div class='shape-lite-card'><div class='shape-lite-card-head'>${thumb}<b>${esc(l.label)}</b><small>${l.mm?esc(l.mm)+' mm':''}</small>${state}<span class='sp'></span>${actions}</div>${insets}</div>`;
  }).join('');
  /* Если все стёкла отделены в свои формы, общая не обслуживает никого — и
     правки в ней молча ни на что не влияют. Такое надо говорить вслух. */
  var orphan=line&&lites.length&&lites.every(function(l){return !!salesLineLiteShape(line,l.index);});
  var warn=orphan?`<div class='shape-lite-note own'>No lite lives on this Shape — each has its own. Changes here affect nothing until a lite is sent back with “Back to shared”.</div>`:'';
  return `<div class='shape-subsection shape-accordion'><button type='button' class='shape-accordion-head' onclick='toggleShapeLiteSplit()'><span><b>Lites of the unit</b><small>mirror · inset · own shape</small></span><span class='shape-accordion-state'>${changed?`<span data-raw>${changed}</span> differ`:'all on the shared shape'}<i>${sLiteSplitOpen?'−':'+'}</i></span></button>${sLiteSplitOpen?`<div class='shape-lite-cards'>${warn}${rows}</div>`:''}</div>`;
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
  var groups=shapeGroups(),edgeNames=shapeEdgeNames(shapeDraftGeometry());
  if(!groups.length)return `<div class='shape-subsection shape-accordion shape-edgework-disabled' id='shapeEdgeworkEditor'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("edgework")'><span><b>Edge processing</b><small>Waiting for a valid physical contour</small></span><span class='shape-accordion-state'>finish shape dimensions<i>${sEdgeworkOpen?'−':'+'}</i></span></button>${sEdgeworkOpen?`<div class='shape-accordion-body'><div class='validation-box badbox'>Finish the main contour first — Edge processing will appear automatically when all physical edges are defined.</div></div>`:''}</div>`;
  var operationCount=Object.keys(sDraft.edgeOps||{}).reduce(function(n,id){return n+(sDraft.edgeOps[id]||[]).length;},0),short=['Rough','Flat','CNC','Miter','Bevel'];
  return `<div class='shape-subsection shape-accordion' id='shapeEdgeworkEditor'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("edgework")'><span><b>Edge processing</b><small>${groups.length} физических кромок · allowance и маршрут</small></span><span class='shape-accordion-state'>${operationCount?operationCount+' операций':'no processing'}<i>${sEdgeworkOpen?'−':'+'}</i></span></button>${sEdgeworkOpen?`<div class='shape-edgework-scroll'><div class='shape-edgework-matrix'>${shapeEdgeLiteTabs()}<div class='shape-edgework-row shape-edgework-labels'><span>Edge work</span>${short.map(function(x){return '<span>'+x+'</span>';}).join('')}</div>${groups.map(function(g,gi){
    var ops=(sEdgeLite==null?(sDraft.edgeOps||{}):((sDraft.lites&&sDraft.lites[String(sEdgeLite)]&&sDraft.lites[String(sEdgeLite)].edgeOps)||{}))[g.id]||[],has=function(t){return ops.some(function(o){return o.type===t;});},miter=ops.find(function(o){return o.type==='Mitering';}),bevel=ops.find(function(o){return o.type==='Beveling';});
    return `<div class='shape-edgework-row'><span class='shape-edge-code'><b>${esc(edgeNames[g.id]||g.id)}</b><small>${dimIn16(g.length)}</small>${sEdgeLite==null?shapeBaseEdgeworkHint(has):''}</span>${SHAPE_EDGE_OPS.map(function(t,oi){return `<label class='shape-op-compact ${has(t)?'on':''}' title='${esc(t)}'><input type='checkbox' ${has(t)?'checked':''} onchange='toggleShapeEdgeOp(${gi},${oi},this.checked)'><span>${short[oi]}</span></label>`;}).join('')}${miter||bevel?`<div class='shape-edge-params'>${miter?`<label>Miter<select onchange='setShapeOpParam(${gi},"Mitering","angle",this.value)'><option value='45' ${+miter.angle===45?'selected':''}>45°</option><option value='22.5' ${+miter.angle===22.5?'selected':''}>22.5°</option></select></label><label>Side<select onchange='setShapeOpParam(${gi},"Mitering","side",this.value)'><option value='back' ${(miter.side||'back')==='back'?'selected':''}>Back mitre</option><option value='front' ${miter.side==='front'?'selected':''}>Front mitre</option></select></label>`:''}${bevel?`<label>Bevel width<input value='${esc(bevel.width)}' oninput='setShapeOpParam(${gi},"Beveling","width",this.value)'></label><label>Side<select onchange='setShapeOpParam(${gi},"Beveling","side",this.value)'><option value='front' ${(bevel.side||'front')==='front'?'selected':''}>Front bevel</option><option value='back' ${bevel.side==='back'?'selected':''}>Back bevel</option></select></label>`:''}</div>`:''}</div>`;
  }).join('')}</div></div>`:''}</div>`;
}

function addShapeFeature(type){
  var geo=shapeDraftGeometry(),f=newShapeFeature(type,geo);sManufacturingOpen=true;sManufacturingSelected=null;
  if(type==='stamp'||type==='sandblast'){
    var g=shapeManufacturingGeometry(),point=type==='sandblast'?shapeDefaultSandblastPoint(g):shapeDefaultStampPoint(g);f.x=shapeFrac16(point[0]);f.y=shapeFrac16(point[1]);
    shapeDimEntry(f.id,'h').ref=type==='sandblast'&&g?(point[0]<=(g.b.minX+g.b.maxX)/2?'left':'right'):'right';
    shapeDimEntry(f.id,'v').ref=type==='sandblast'&&g?(point[1]<=(g.b.minY+g.b.maxY)/2?'bottom':'top'):'bottom';sFeatureExpandedId=f.id;
  }else sFeatureExpandedId=null;
  sDraft.features.push(f);render();
}
function setShapeFeature(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;refreshShapeEditor();}
function setShapeFeatureAndRender(i,k,v){if(sDraft.features[i])sDraft.features[i][k]=v;render();}
function setShapeStampType(i,v){
  var f=sDraft.features[i];if(!f||f.type!=='stamp'||SHAPE_STAMP_TYPES.indexOf(v)<0)return;
  f.stampType=v;f.text=v==='OWN Stamp'?'':v;render();
}
function removeShapeFeature(i){var f=sDraft.features[i];if(f&&sDraft.dims)delete sDraft.dims[f.id];if(f&&sFeatureExpandedId===f.id)sFeatureExpandedId=null;sDraft.features.splice(i,1);render();}
function shapeFeatureFields(f,i,geo){
  function input(label,k){return `<label>${label}<input value='${esc(f[k])}' oninput='setShapeFeature(${i},"${k}",this.value)'></label>`;}
  if(f.type==='hole')return input('Diameter','diameter')+input('X from origin','x')+input('Y from origin','y')+input('Min edge clearance','minEdge');
  if(f.type==='cutout'){
    /* Вырез позиционируется ДО ЦЕНТРА, как отверстие: владелец разбирал их
       рядом и просил одинаковую привязку. В записи по-прежнему лежит нижний
       левый угол — от него строится контур реза. */
    var g=shapeManufacturingGeometry(),pos=g?shapeCutoutCenterPosition(f,g):null;
    var geoFields=pos?`<div class='shape-mi-hole-position-grid'>
      <div class='shape-mi-axis-card'><label>Horizontal reference<select onchange='shapeSetDimRef("${esc(f.id)}","h",this.value)'><option value='left' ${pos.hRef==='left'?'selected':''}>Left</option><option value='right' ${pos.hRef==='right'?'selected':''}>Right</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(pos.hDistance))}' onchange='shapeSetCutoutCenter(${i},"h",this.value)'><small>from the ${pos.hRef==='right'?'right':'left'} edge · 1/16″</small></label></div>
      <div class='shape-mi-axis-card'><label>Vertical reference<select onchange='shapeSetDimRef("${esc(f.id)}","v",this.value)'><option value='bottom' ${pos.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${pos.vRef==='top'?'selected':''}>Top</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(pos.vDistance))}' onchange='shapeSetCutoutCenter(${i},"v",this.value)'><small>from the ${pos.vRef==='top'?'top':'bottom'} edge · 1/16″</small></label></div>
    </div>`:input('X from origin','x')+input('Y from origin','y');
    return geoFields+input('Width','width')+input('Height','height')+input('Corner radius','cornerRadius')+shapeDimControlsHTML(f.id,[{key:'h',label:'Horizontal'},{key:'v',label:'Vertical'}]);
  }
  if(f.type==='stamp'){
    var sg=shapeManufacturingGeometry(),sp=sg?shapeStampPosition(f,sg):null,current=shapeStampType(f);
    var options=SHAPE_STAMP_TYPES.map(function(t){return `<option value='${esc(t)}' ${current===t?'selected':''}>${esc(t)}</option>`;}).join('');
    var placement=sp?`<div class='shape-mi-hole-position-grid'>
      <div class='shape-mi-axis-card'><label>Horizontal reference<select onchange='shapeSetDimRef("${esc(f.id)}","h",this.value)'><option value='left' ${sp.hRef==='left'?'selected':''}>Left</option><option value='right' ${sp.hRef==='right'?'selected':''}>Right</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(sp.hDistance))}' onchange='shapeSetStampDistance(${i},"h",this.value)'><small>from the ${sp.hRef==='right'?'right':'left'} edge · 1/16″</small></label></div>
      <div class='shape-mi-axis-card'><label>Vertical reference<select onchange='shapeSetDimRef("${esc(f.id)}","v",this.value)'><option value='bottom' ${sp.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${sp.vRef==='top'?'selected':''}>Top</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(sp.vDistance))}' onchange='shapeSetStampDistance(${i},"v",this.value)'><small>from the ${sp.vRef==='top'?'top':'bottom'} edge · 1/16″</small></label></div>
    </div>`:input('X from origin','x')+input('Y from origin','y');
    var own=current==='OWN Stamp'?`<label>Custom stamp text<input maxlength='24' value='${esc(f.text)}' placeholder='Enter stamp text' oninput='setShapeFeature(${i},"text",this.value)'><small>Up to 24 characters · shown on the production drawing</small></label>`:'';
    return `<label>Stamp type<select onchange='setShapeStampType(${i},this.value)'>${options}</select><small class='shape-stamp-free-note'>FREE · production drawing only</small></label>`+own+placement+shapeDimControlsHTML(f.id,[{key:'h',label:'Horizontal'},{key:'v',label:'Vertical'}]);
  }
  if(f.type==='sandblast'){
    var bg=shapeManufacturingGeometry(),bp=bg?shapeStampPosition(f,bg):null;
    var bPlacement=bp?`<div class='shape-mi-hole-position-grid'>
      <div class='shape-mi-axis-card'><label>Horizontal reference<select onchange='shapeSetDimRef("${esc(f.id)}","h",this.value)'><option value='left' ${bp.hRef==='left'?'selected':''}>Left</option><option value='right' ${bp.hRef==='right'?'selected':''}>Right</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(bp.hDistance))}' onchange='shapeSetSandblastDistance(${i},"h",this.value)'><small>from the ${bp.hRef==='right'?'right':'left'} edge · 1/16″</small></label></div>
      <div class='shape-mi-axis-card'><label>Vertical reference<select onchange='shapeSetDimRef("${esc(f.id)}","v",this.value)'><option value='bottom' ${bp.vRef==='bottom'?'selected':''}>Bottom</option><option value='top' ${bp.vRef==='top'?'selected':''}>Top</option></select></label><label>Distance to center<input value='${esc(shapeFrac16(bp.vDistance))}' onchange='shapeSetSandblastDistance(${i},"v",this.value)'><small>from the ${bp.vRef==='top'?'top':'bottom'} edge · 1/16″</small></label></div>
    </div>`:input('X from origin','x')+input('Y from origin','y');
    return `<label>Coverage<select onchange='setShapeFeatureAndRender(${i},"coverage",this.value)'><option value='full' ${shapeSandblastCoverage(f)==='full'?'selected':''}>Full covered</option><option value='pattern' ${shapeSandblastCoverage(f)==='pattern'?'selected':''}>Pattern</option></select></label>`+
      `<label>Glass side<select onchange='setShapeFeatureAndRender(${i},"side",this.value)'><option value='front' ${shapeSandblastSide(f)==='front'?'selected':''}>Front</option><option value='back' ${shapeSandblastSide(f)==='back'?'selected':''}>Back</option></select><small>Printed explicitly on the production drawing</small></label>`+
      bPlacement+shapeDimControlsHTML(f.id,[{key:'h',label:'Horizontal'},{key:'v',label:'Vertical'}]);
  }
  if(f.type==='radius')return `<label>Physical vertex<select onchange='setShapeFeatureAndRender(${i},"vertexId",this.value)'>${(geo.vertices||[]).map(function(v){return `<option value='${esc(v.id)}' ${v.id===f.vertexId?'selected':''}>${esc(v.id+' · '+v.label)}</option>`;}).join('')}</select></label>`+input('Radius','radius');
  if(f.type==='hardware')return input('Template / name','name')+`<label>Physical edge<select onchange='setShapeFeatureAndRender(${i},"edgeId",this.value)'>${(function(names){return shapeEdgeGroups(geo).map(function(e){return `<option value='${esc(e.id)}' ${e.id===f.edgeId?'selected':''}>${esc((names[e.id]||e.id)+' · '+dimIn16(e.length))}</option>`;}).join('');})(shapeEdgeNames(geo))}</select></label>`+input('Distance along edge','distance')+input('Inset','inset')+input('Prep width','prepWidth')+input('Prep height','prepHeight')+input('Hole diameter','holeDia');
  return '';
}

function shapeFeatureSummary(f,geo){
  if(f.type==='hole')return 'Ø '+f.diameter+' · X '+f.x+' · Y '+f.y;
  if(f.type==='cutout')return f.width+' × '+f.height+' · X '+f.x+' · Y '+f.y;
  if(f.type==='radius')return (f.vertexId||'—')+' · R '+f.radius;
  if(f.type==='hardware')return (f.name||'Hardware')+' · '+(f.edgeId||'—')+' @ '+f.distance;
  if(f.type==='stamp')return shapeStampText(f);
  if(f.type==='sandblast')return shapeSandblastServiceLabel(f);return '';
}
/* Геометрия, которая ДЕЙСТВИТЕЛЬНО меняет контур реза: внутренний вырез и
   радиусный угол. Всё остальное в этой категории — метки на чертёж. */
function shapeGeometryBodyHTML(geo){
  var titles={hole:'Legacy cutting hole',cutout:'Internal cutout',radius:'Radius corner',hardware:'Legacy hardware prep'};
  var rows=sDraft.features.map(function(f,i){return {f:f,i:i};}).filter(function(x){return x.f.type!=='stamp'&&x.f.type!=='sandblast';}),legacy=rows.filter(function(x){return x.f.type==='hole'||x.f.type==='hardware';}).length;
  return `<div class='shape-feature-add'><button class='sm' onclick='addShapeFeature("cutout")'>+ Internal cutout</button>${(geo.vertices||[]).length?`<button class='sm' onclick='addShapeFeature("radius")'>+ Radius corner</button>`:''}<span>These items are fabricated from the finished drawing after edgework.</span></div>${legacy?`<div class='validation-box warnbox compact-warning'><b>Legacy geometry items: ${legacy}</b><span>These older Hole / Hardware features are geometry-bound. Delete them unless that finished geometry is intentional.</span></div>`:''}<div class='shape-feature-list'>${rows.length?rows.map(function(row){
    var f=row.f,i=row.i;
    var expanded=sFeatureExpandedId===f.id;
    return `<div class='shape-feature-card collapsed-card${expanded?' expanded':''}'><div class='shape-feature-card-head'><button type='button' class='shape-feature-card-toggle' onclick='toggleShapeFeatureCard("${esc(f.id)}")'><span><b>${esc(titles[f.type]||f.type)}</b><small>${shapeCutFlagHTML(true)}<span data-raw>${esc(shapeFeatureSummary(f,geo))}</span></small></span><i>${expanded?'−':'+'}</i></button><button class='sm dl' onclick='removeShapeFeature(${i})'>×</button></div>${expanded?`<div class='shape-feature-fields'>${shapeFeatureFields(f,i,geo)}</div>`:''}</div>`;
  }).join(''):'<div class="empty compact">No contour changes</div>'}</div>`;
}
/* ---------- Cutout — ОДНА категория ----------
   Решение владельца 31 августа 2026: «давай сделаем это одной категорией
   Cutout — там будут hinge clamp patch cutout radius corner», и следом «hole
   тоже туда». Цех уже считает их одной семьёй: станция FAB описана как работа
   по ТЕЛУ стекла (hole · notch · cutout · radius · hinge · clamp), в отличие
   от EDGE — работы по периметру (erp/shopfloor/data).

   Плоским списком свести нельзя, и это не оформление: половина элементов
   меняет файл раскроя, а половина нет. Перепутанная кнопка означала бы молча
   уехавший рез — деталь приедет с вырезом, которого никто не заказывал.
   Поэтому внутри категории две подписанные группы плюс метка на карточке.

   Редактор ОДИН на оба источника. У фигуры из DXF своей геометрии в ERP нет —
   контур принадлежит файлу из Fusion 360, — поэтому вторая группа там просто
   не показывается; список меток для DXF подменяет shape-production-ui. */
function shapeCutoutItemCount(){
  var external=shapeIsDxfSource(sDraft),annotations=shapeStampFeatures().length+shapeSandblastFeatures().length,marks=shapeManufacturingItems().length+annotations,cuts=external?0:(sDraft.features||[]).filter(function(f){return f.type!=='stamp'&&f.type!=='sandblast';}).length;
  return marks+cuts+shapeNotchCorners().length;
}
function shapeCutoutEditor(geo,workspace){
  var external=shapeIsDxfSource(sDraft),total=shapeCutoutItemCount();
  var body=`<div class='shape-cut-group marks'><div class='shape-cut-group-head'><b>Does not change the cut</b><small>drawing marks · paid services shown below · never enters the cutting file</small></div>${shapeMarksBodyHTML()}</div>
    ${external?'':`<div class='shape-cut-group cuts'><div class='shape-cut-group-head'><b>Changes the cutting shape</b><small>goes into cutting and to the machine</small></div>${shapeGeometryBodyHTML(geo)}</div>`}
    ${shapeManufacturingServicesHTML()}`;
  if(workspace)return `<div class='shape-cutout-workspace'>${body}</div>`;
  return `<div class='shape-subsection shape-accordion shape-cutout'><button type='button' class='shape-accordion-head' onclick='toggleShapeSection("cutout")'><span><b>Cutout</b><small>Hole · hardware · stamp · sandblast · cutout · radius corner</small></span><span class='shape-accordion-state'>${total?esc(total+(total===1?' item':' items')):'no items'}<i>${sManufacturingOpen?'−':'+'}</i></span></button>${sManufacturingOpen?`<div class='shape-accordion-body'>
    ${body}</div>`:''}</div>`;
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
  var r=shapeDraftResult(),external=shapeIsDxfSource(sDraft),geo=external?{ok:false,points:[],edges:[],vertices:[]}:shapeDraftGeometry(),presetOptions=shapePresetChoices(sDraft.type).map(function(p){return `<option value='${p.id}' ${p.id===sDraft.type?'selected':''}>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  var master=external?`<div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div><div><label>Width</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.width16||0)/16))}'></div><div><label>Height</label><input class='ro' readonly value='${esc(frac64((sDraft.source.preview.height16||0)/16))}'></div></div>`:`<div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div>${shapeMasterSizeFields()}</div>`;
  var controls=external?`<div class='validation-box infobox'>Геометрия конфигуратора для этой ревизии отключена: контур и габариты считаны из внешнего DXF.</div>${shapeCutoutEditor(geo)}`:`${sDraft.type==='smart'?shapeSmartControls():shapeGenericControls()}${shapeCutoutEditor(geo)}${shapeEdgeworkEditor()}`;
  var tabs=external?`<div class='shape-view-tabs'><button class='${sView!=='cutting'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting DXF</button>${shapeMetricToggleButton(true)}<button class='shape-print-btn' disabled>Печать / PDF</button></div>`:`<div class='shape-view-tabs'><button data-shape-view='setup' class='${sView==='setup'?'on':''}' onclick='setShapeView("setup")'>Setup</button><button data-shape-view='production' class='${sView==='production'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button data-shape-view='cutting' class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting Shape</button>${shapeMetricToggleButton(sView==='cutting')}<button class='shape-print-btn' onclick='shapePrintDrawing()' data-i18n-title='Печать чертежа или сохранение в PDF'>Печать / PDF</button></div>`;
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
