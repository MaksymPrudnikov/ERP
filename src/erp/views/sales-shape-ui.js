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
  return `${sEdit!==null?'':`<div class='real-module-note'><b>Shape schema v2</b><span>Finished Geometry, Production Drawing и Cutting Geometry формируются из одной ревизии. Отверстия, вырезы, hardware prep, радиусы и обработка кромки больше не теряются при экспорте.</span></div>`}
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
function setShapeExtra(id,v){if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};sDraft.smart.extraEdges[id].len=v;refreshShapeEditor();}
/* Скос ребра нотча: out — величина ухода, dir — направление. */
function setShapeExtraOut(id,k,v){
  if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:'',out:'0',dir:null};
  sDraft.smart.extraEdges[id][k]=(k==='dir')?(v||null):v;
  refreshShapeEditor();
}
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
  /* Мини-превью живёт в ЛЕВОЙ колонке, которую этот обход не перерисовывает.
     Без явного обновления оно застывало на прошлом рендере и показывало
     «невалидна» уже после того, как фигуру починили. */
  var mp=document.getElementById('shapeMiniPreview');if(mp)mp.innerHTML=shapeMiniPreview();
  /* Перерисовываем только SVG-иконки и вычисляемые readonly-ячейки: полный
     ререндер левой колонки сбил бы фокус в поле, где сейчас печатают. */
  ['A','B','C','D'].forEach(function(e){var el=document.getElementById('oi_'+e);if(el)el.innerHTML=shapeOutageIcon(e);});
  if(sDraft.type==='smart'){
    var bs=r.valid&&r.base,dl=document.getElementById('emDlen'),dv=document.getElementById('emDout');
    if(dl)dl.value=bs?dimIn(bs.Dtrue):'AUTO';
    if(dv)dv.value=bs?dimIn(bs.Dout):'0';
  }
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
  if(edge==='D'){d=seg(pad,H/2,W-pad,H/2);return `<svg viewBox='0 0 ${W} ${H}' class='outage-icon'>${d}</svg>`;}
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
function shapeEdgeMatrix(){
  var m=sDraft.smart,cols=['A','B','C','D'],r=shapeDraftResult(),base=(r.valid&&r.base)||null;
  var head=cols.map(function(e){return `<span class='em-col' style='color:${shapeEdgeColor(e)}'>${e}</span>`;}).join('');
  function cell(e,html){return `<span class='em-cell'>${html}</span>`;}
  function lengthCell(e){
    if(e==='A')return cell(e,`<input data-vfield='len' value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'>`);
    if(e==='B')return cell(e,`<input data-vfield='len' value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'>`);
    if(e==='C')return cell(e,`<input data-vfield='num' value='${esc(m.C.len||'')}' placeholder='AUTO = A' oninput='setShapeC(this.value)'>`);
    return cell(e,`<input class='ro' id='emDlen' readonly value='${base?esc(dimIn(base.Dtrue)):'AUTO'}'>`);
  }
  var rows=[{k:'Length',cells:cols.map(lengthCell).join('')}];
  if(!m.elbowsOn){
    rows.push({k:'Out of plumb / level',cells:cols.map(function(e){
      return e==='D'?cell(e,`<input class='ro' id='emDout' readonly value='${base?esc(dimIn(base.Dout)):'0'}'>`)
        :cell(e,`<input data-vfield='num' value='${esc(m[e].out||'0')}' oninput='setShapeSimple("${e}","out",this.value)' onblur='shapeZeroIfEmpty(this)'>`);
    }).join('')});
    rows.push({k:'Define Outage',cells:cols.map(function(e){
      if(e==='D')return cell(e,`<div class='outage-pick ro'>${shapeOutageIcon(e)}</div>`);
      var vert=shapeEdgeIsVert(e),opts=vert?[['','—'],['left','← Left'],['right','→ Right']]:[['','—'],['up','↑ Up'],['down','↓ Down']];
      return cell(e,`<div class='outage-pick'><span class='oi' id='oi_${e}'>${shapeOutageIcon(e)}</span><select onchange='setShapeSimple("${e}","dir",this.value)'>${opts.map(function(x){return `<option value='${x[0]}' ${(m[e].dir||'')===x[0]?'selected':''}>${x[1]}</option>`;}).join('')}</select></div>`);
    }).join('')});
  }else{
    [['to','Outage to elbow'],['elbowLen','Elbow length'],['past','Outage past elbow']].forEach(function(f){
      rows.push({k:f[1],cells:cols.map(function(e){
        return e==='D'?cell(e,`<input class='ro' readonly value='${f[0]==='past'&&base?esc(dimIn(base.Dout)):'—'}'>`)
          :cell(e,`<input data-vfield='num' value='${esc(m[e].elbow[f[0]]||'0')}' oninput='setShapeElbow("${e}","${f[0]}",this.value)' onblur='shapeZeroIfEmpty(this)'>`);
      }).join('')});
    });
    rows.push({k:'Elbow form',cells:cols.map(function(e){
      if(e==='D')return cell(e,`<div class='outage-pick ro'>${shapeOutageIcon(e)}</div>`);
      return cell(e,`<div class='outage-pick'><span class='oi' id='oi_${e}'>${shapeOutageIcon(e)}</span><select onchange='setShapeElbow("${e}","mode",this.value)'><option value=''>—</option>${SS_MODES.map(function(x){return `<option value='${x.id}' ${m[e].elbow.mode===x.id?'selected':''}>${x.id.toUpperCase()} · ${x.s1>0?'+':'−'}/${x.s2>0?'+':'−'}</option>`;}).join('')}</select></div>`);
    }).join('')});
  }
  return `<div class='edge-matrix'>
    <div class='em-row em-head'><span class='em-key'>Edge</span>${head}</div>
    ${rows.map(function(x){return `<div class='em-row'><span class='em-key'>${esc(x.k)}</span>${x.cells}</div>`;}).join('')}
    <div class='em-row em-foot'><span class='em-key'><button class='${m.elbowsOn?'on':''}' onclick='setShapeElbows(${m.elbowsOn?'false':'true'})'>${m.elbowsOn?'Hide Elbows':'Show Elbows'}</button></span><span class='em-note'>${m.elbowsOn?'составной перелом стороны':'простой уклон стороны'} · D считается автоматически</span></div>
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
  var m=sDraft.smart,s=m[edge],vert=edge==='A'||edge==='C',name=edge==='A'?'A · Left / Height':edge==='B'?'B · Bottom / Width':'C · Right',shown=edge==='A'?sDraft.h:edge==='B'?sDraft.w:(s.len||'AUTO = A');
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
          <input data-vfield='num' value='${esc(x.out||'0')}' placeholder='0' oninput='setShapeExtraOut("${e.id}","out",this.value)' onblur='shapeZeroIfEmpty(this)' title='${vert?'уход от отвеса':'уход от уровня'}'>
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
  if(!r.valid){if(e)fail(e,'Невалидная геометрия не печатается: '+(r.errors&&r.errors[0]||r.reason||''));return;}
  var cutting=sView==='cutting',svg=cutting?ShapeModule.cuttingSvg(r):ShapeModule.productionSvg(r);
  var name=(sDraft.name||'').trim()||'Shape';
  printSheet(svg,name+' · '+(cutting?'Cutting Shape':'Production Drawing')+' · Rev '+(sDraft.revision||0));
}
function shapeSmartControls(){
  var S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;var map=ssEdgeMap(S).all;
  return `${shapeSmartVisual()}
    ${shapeEdgeMatrix()}
    ${shapeCornerSectionsVisible()?`<div class='extra-edges'><div class='corner-title'><b>Corner edge dimensions</b><span>каждое ребро нотча можно скосить отдельно</span></div>${map.length?shapeNotchMatrix(map):`<div class='empty compact'>Значения появятся, когда угловой блок получит рёбра</div>`}</div>
    <div class='corner-title'><b>Corner blocks · Out of plumb / level</b><span>finished corner coordinates</span></div><div class='corner-grid'>${SS_ORDER.map(function(c){var o=sDraft.smart.cornerOffsets[c];return `<div class='corner-card'><div class='corner-card-head'><b>${c.toUpperCase()}</b><small>corner coordinate</small></div><div class='corner-offset'><label>Out of plumb<input data-vfield='num' value='${esc(o.plumb||'0')}' oninput='setShapeCornerOffset("${c}","plumb",this.value)' onblur='shapeZeroIfEmpty(this)'></label><select aria-label='${c.toUpperCase()} plumb direction' onchange='setShapeCornerOffset("${c}","plumbDir",this.value)'><option value=''>—</option><option value='left' ${o.plumbDir==='left'?'selected':''}>←</option><option value='right' ${o.plumbDir==='right'?'selected':''}>→</option></select></div><div class='corner-offset'><label>Out of level<input data-vfield='num' value='${esc(o.level||'0')}' oninput='setShapeCornerOffset("${c}","level",this.value)' onblur='shapeZeroIfEmpty(this)'></label><select aria-label='${c.toUpperCase()} level direction' onchange='setShapeCornerOffset("${c}","levelDir",this.value)'><option value=''>—</option><option value='up' ${o.levelDir==='up'?'selected':''}>↑</option><option value='down' ${o.levelDir==='down'?'selected':''}>↓</option></select></div></div>`;}).join('')}</div>`:''}`;
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
    return `<div class='shape-edgework-row'><span class='shape-edge-code'><b>${esc(g.id)}</b><small>${dimIn(g.length)}</small></span>${SHAPE_EDGE_OPS.map(function(t,oi){return `<label class='shape-op-compact ${has(t)?'on':''}' title='${esc(t)}'><input type='checkbox' ${has(t)?'checked':''} onchange='toggleShapeEdgeOp(${gi},${oi},this.checked)'><span>${short[oi]}</span></label>`;}).join('')}${miter||bevel?`<div class='shape-edge-params'>${miter?`<label>Miter<select onchange='setShapeOpParam(${gi},"Mitering","angle",this.value)'><option value='45' ${+miter.angle===45?'selected':''}>45°</option><option value='22.5' ${+miter.angle===22.5?'selected':''}>22.5°</option></select></label><label>Сторона<select onchange='setShapeOpParam(${gi},"Mitering","side",this.value)'><option value='back' ${(miter.side||'back')==='back'?'selected':''}>Back mitre</option><option value='front' ${miter.side==='front'?'selected':''}>Front mitre</option></select></label>`:''}${bevel?`<label>Bevel width<input value='${esc(bevel.width)}' oninput='setShapeOpParam(${gi},"Beveling","width",this.value)'></label><label>Сторона<select onchange='setShapeOpParam(${gi},"Beveling","side",this.value)'><option value='front' ${(bevel.side||'front')==='front'?'selected':''}>Front bevel</option><option value='back' ${bevel.side==='back'?'selected':''}>Back bevel</option></select></label>`:''}</div>`:''}</div>`;
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
  /* Полный render() пересоздаёт DOM, поэтому подсветку полей ставим сразу
     после вставки разметки — иначе первый показ был бы без неё. */
  setTimeout(function(){shapeMarkFields();shapeFitPreview();},0);
  var r=shapeDraftResult(),geo=shapeDraftGeometry(),presetOptions=SHAPE_PRESETS.map(function(p){return `<option value='${p.id}' ${p.id===sDraft.type?'selected':''}>${esc(p.code+' · '+p.label)}</option>`;}).join('');
  return `<div class='module-editor' id='shapeEditorRoot'><div class='module-editor-head'><div><h3>${sEdit==='new'?'Новая производственная фигура':'Изменение фигуры'}</h3><p>Все размеры — finished size в дюймах; толщина — в миллиметрах. Невалидная геометрия не сохраняется и не экспортируется.</p></div><span class='pill ok'>schema v2 · fail closed</span></div>
    <div class='shape-editor-layout'><div class='shape-controls'>
      <div class='grid shape-master-fields'><div><label>Название *</label><input value='${esc(sDraft.name||'')}' oninput='sDraft.name=this.value'></div><div><label>Тип фигуры</label><select onchange='setShapeType(this.value)'>${presetOptions}</select></div><div><label>${sDraft.type==='circle'?'Diameter':'B · Width'}</label><input value='${esc(sDraft.w)}' oninput='setShapeField("w",this.value)'></div>${sDraft.type==='circle'?'':`<div><label>A · Height</label><input value='${esc(sDraft.h)}' oninput='setShapeField("h",this.value)'></div>`}<div><label>Glass thickness, mm</label><input type='number' min='1' step='1' value='${esc(sDraft.thickness)}' oninput='setShapeField("thickness",this.value)'></div>${sDraft.type==='smart'?`<div><label>C · Right height</label><input value='${esc(sDraft.smart.C.len||'')}' placeholder='= A' oninput='setShapeC(this.value)'></div>`:''}</div>
      ${sDraft.type==='smart'?shapeSmartControls():shapeGenericControls()}
      ${shapeEdgeworkEditor()}
      ${shapeFeaturesEditor(geo)}
    </div><div class='shape-preview-side'><div class='shape-view-tabs'><button data-shape-view='setup' class='${sView==='setup'?'on':''}' onclick='setShapeView("setup")'>Setup</button><button data-shape-view='production' class='${sView==='production'?'on':''}' onclick='setShapeView("production")'>Production Drawing</button><button data-shape-view='cutting' class='${sView==='cutting'?'on':''}' onclick='setShapeView("cutting")'>Cutting Shape</button><button class='shape-print-btn' onclick='shapePrintDrawing()' title='Печать чертежа или сохранение в PDF'>Печать / PDF</button></div><div id='shapeLivePreview' class='shape-drawing-preview'>${shapePreviewMarkup(r)}</div><div id='shapeLiveDerived'>${shapeDerivedHTML(r)}</div>${shapeArtifacts(r)}</div></div>
    <div class='err' id='e_shape'></div><div class='row'><button class='pri' onclick='saveShape()'>Сохранить ревизию</button><button onclick='cancelShapeEdit()'>Отмена</button></div></div>`;
}

function saveShape(){
  var e=document.getElementById('e_shape');e.style.display='none';sDraft.name=String(sDraft.name||'').trim();if(!sDraft.name)return fail(e,'Укажи название');
  var r=ShapeModule.compute(sDraft);if(!r.valid)return fail(e,(r.errors||[r.reason]).map(function(x){return moduleErrorText({reason:x});}).join(' · '));
  var prior=sEdit==='new'?null:DB.shapeDef[sEdit],used=prior&&DB.muntinDef.some(function(m){return m.shapeId===prior.id;});
  if(used&&shapeFingerprint(prior)!==r.fingerprint&&!confirm('Эта фигура используется в Muntinbar. Новая геометрия изменит связанную раскладку. Сохранить новую ревизию?'))return;
  var saved=r.definition;saved.name=sDraft.name;saved.revision=prior?(prior.revision||0)+1:1;saved.status='draft';
  if(sEdit==='new')DB.shapeDef.push(saved);else DB.shapeDef[sEdit]=saved;var savedId=saved.id;touch();
  if(typeof salesBridgeOnShapeSaved==='function'&&salesBridgeOnShapeSaved(savedId))return;
  sEdit=null;sDraft=null;render();
}
function cancelShapeEdit(){if(typeof salesBridgeCancel==='function'&&salesBridgeCancel('shape'))return;sEdit=null;sDraft=null;render();}
function shapeSafeFileName(s){return String(s||'shape').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'shape';}
function shapeDownload(textValue,mime,name){var b=new Blob([textValue],{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);}
function downloadShapeArtifact(kind){
  var r=shapeDraftResult();if(!r.valid)return alert(moduleErrorText(r));var base=shapeSafeFileName(r.definition.name)+'_R'+(r.definition.revision||0);
  if(kind==='production')shapeDownload(ShapeModule.productionSvg(r),'image/svg+xml',base+'_production.svg');
  if(kind==='cutting')shapeDownload(ShapeModule.cuttingSvg(r),'image/svg+xml',base+'_cutting.svg');
  if(kind==='json')shapeDownload(JSON.stringify(ShapeModule.machinePayload(r),null,2),'application/json',base+'_machine.json');
  if(kind==='dxf')shapeDownload(ShapeModule.genericDxf(r),'application/dxf',base+'_generic.dxf');
}
function delShape(i){var s=DB.shapeDef[i];if(DB.muntinDef.some(function(m){return m.shapeId===s.id;}))return alert('Нельзя удалить — фигура используется в Muntinbar');if(typeof salesShapeHasReferences==='function'&&salesShapeHasReferences(s.id))return alert('Нельзя удалить — Shape используется в Sales Order');if(!confirm('Удалить фигуру?'))return;DB.shapeDef.splice(i,1);touch();render();}
