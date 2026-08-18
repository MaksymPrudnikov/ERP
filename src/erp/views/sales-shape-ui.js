/* =====================================================================
   view/sales/shape-ui  ·  erp-1.0
   Экран и live-превью модуля Smart-Shape. Геометрия — в modules/shape/*.
   ===================================================================== */

let sEdit=null,sDraft=null;
function viewShapeSkill(){
 const rows=DB.shapeDef.map((s,i)=>{const r=ShapeModule.compute(s);return `<tr><td><b>${raw(s.name)}</b></td><td class="mono">${r.valid?dimIn(r.width)+' × '+dimIn(r.height):'<span class="bad pill">невалидна</span>'}</td><td class="mono">${r.valid?r.points.length:'—'}</td><td>${r.valid?'<span class="pill ok">Smart-Shape</span>':'<span class="pill bad">'+esc(moduleErrorText(r))+'</span>'}</td><td style="white-space:nowrap"><button class="sm" onclick="openShapeEdit(${i})">Изменить</button><button class="sm dl" onclick="delShape(${i})">×</button></td></tr>`;}).join('');
 return `<div class="real-module-note"><b>Smart-Shape v4.5</b><span>Реальная модель из Configurator: A = Height, B = Width, C = правая сторона, D = AUTO. Поддерживаются out-of-plumb, elbows и угловые блоки Single / Double / Triple.</span></div>
  ${sEdit!==null?shapeForm():''}
  <table><thead><tr><th>Название</th><th>Габарит</th><th>Сегментов</th><th>Движок</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">пусто</td></tr>'}</tbody></table>
  ${sEdit===null?'<div class="row"><button class="pri" onclick="openShapeNew()">Новая Advanced-фигура</button></div>':''}`;
}
function openShapeNew(){sEdit='new';sDraft=newSmartShapeDef();render();}
function openShapeEdit(i){sEdit=i;sDraft=JSON.parse(JSON.stringify(DB.shapeDef[i]));sDraft.smart=ssNormalize(sDraft.smart);render();}
function shapeDraftLine(){return shapeDefToLine(sDraft);}
function setShapeDim(k,v){sDraft[k]=v;refreshShapeEditor();}
function setShapeC(v){var S=shapeDraftLine();S.shape.smart.C.len=v;sDraft.smart=S.shape.smart;refreshShapeEditor();}
function setShapeElbows(v){sDraft.smart.elbowsOn=!!v;render();}
function setShapeSimple(edge,k,v){sDraft.smart[edge][k]=v||null;refreshShapeEditor();}
function setShapeElbow(edge,k,v){sDraft.smart[edge].elbow[k]=v||null;refreshShapeEditor();}
function setShapeCorner(c,v){var S=shapeDraftLine();S.shape.smart.corners[c]=v;ssSyncExtra(S);sDraft.smart=S.shape.smart;render();}
function setShapeExtra(id,v){if(!sDraft.smart.extraEdges[id])sDraft.smart.extraEdges[id]={len:''};sDraft.smart.extraEdges[id].len=v;refreshShapeEditor();}
function shapePreviewSVG(r){
 if(!r.valid)return `<div class="module-invalid">${esc(moduleErrorText(r)||'Invalid shape')}</div>`;
 const pts=r.points,b=fabEdgeBounds(pts),vw=650,vh=390,p=36,W=Math.max(.001,b.maxX-b.minX),H=Math.max(.001,b.maxY-b.minY),sc=Math.min((vw-p*2)/W,(vh-p*2)/H),ox=p+(vw-p*2-W*sc)/2,oy=p+(vh-p*2-H*sc)/2;
 const X=x=>ox+(x-b.minX)*sc,Y=y=>vh-(oy+(y-b.minY)*sc);let o=`<rect x="0" y="0" width="${vw}" height="${vh}" fill="#fbfdfe"/>`;
 o+=`<path d="${pts.map((q,i)=>(i?'L':'M')+' '+X(q[0])+' '+Y(q[1])).join(' ')} Z" fill="#edf7fb" stroke="#1d2b34" stroke-width="2"/>`;
 r.segs.forEach(s=>{const c=SS_COLORS[s.id]||ssExtraColor(s.id),mx=(X(s.p1[0])+X(s.p2[0]))/2,my=(Y(s.p1[1])+Y(s.p2[1]))/2;o+=`<line x1="${X(s.p1[0])}" y1="${Y(s.p1[1])}" x2="${X(s.p2[0])}" y2="${Y(s.p2[1])}" stroke="${c}" stroke-width="4"/><text x="${mx}" y="${my-7}" text-anchor="middle" font-size="11" font-weight="700" fill="${c}" stroke="#fff" stroke-width="4" paint-order="stroke fill">${esc(s.id)}</text>`;});
 return `<svg class="smart-svg" viewBox="0 0 ${vw} ${vh}" aria-label="Smart Shape preview">${o}</svg>`;
}
function shapeDerivedHTML(r){if(!r.valid)return `<div class="validation-box badbox"><b>Ошибка геометрии</b><div>${esc(moduleErrorText(r))}</div></div>`;const G=r.base;return `<div class="smart-kpis"><div><span>Envelope</span><b>${dimIn(r.width)} × ${dimIn(r.height)}</b></div><div><span>Area</span><b>${(r.area/144).toFixed(2)} ft²</b></div><div><span>D projection</span><b>${dimIn(G.Dlen)}</b></div><div><span>True D cut</span><b>${dimIn(G.Dtrue)}</b></div></div>${r.warns&&r.warns.length?`<div class="validation-box warnbox">${r.warns.map(w=>esc(moduleErrorText({reason:w}))).join('<br>')}</div>`:'<div class="validation-box okbox">Контур валиден · тот же контур используется Muntinbar</div>'}`;}
function refreshShapeEditor(){if(!sDraft)return;const r=ShapeModule.compute(sDraft),p=document.getElementById('shapeLivePreview'),d=document.getElementById('shapeLiveDerived');if(p)p.innerHTML=shapePreviewSVG(r);if(d)d.innerHTML=shapeDerivedHTML(r);if(p)applyLang(p);if(d)applyLang(d);}
function shapeEdgeEditor(edge){const m=sDraft.smart,s=m[edge],vert=edge==='A'||edge==='C',name=edge==='A'?'A · Left / Height':edge==='B'?'B · Bottom / Width':'C · Right',shown=edge==='A'?sDraft.h:edge==='B'?sDraft.w:(s.len||'AUTO = A');if(!m.elbowsOn)return `<div class="edge-card"><div class="edge-card-head"><b>${name}</b><span>${esc(shown)}</span></div><div class="edge-fields"><div><label>Out of plumb / level</label><input value="${esc(s.out||'0')}" oninput="setShapeSimple('${edge}','out',this.value)"></div><div><label>Direction</label><select onchange="setShapeSimple('${edge}','dir',this.value)"><option value="">—</option>${(vert?[['left','Left'],['right','Right']]:[['up','Up'],['down','Down']]).map(x=>`<option value="${x[0]}" ${s.dir===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div></div></div>`;
 const E=s.elbow;return `<div class="edge-card"><div class="edge-card-head"><b>${name}</b><span>${esc(shown)}</span></div><div class="edge-fields four"><div><label>Outage to elbow</label><input value="${esc(E.to)}" oninput="setShapeElbow('${edge}','to',this.value)"></div><div><label>Elbow length</label><input value="${esc(E.elbowLen)}" oninput="setShapeElbow('${edge}','elbowLen',this.value)"></div><div><label>Outage past elbow</label><input value="${esc(E.past)}" oninput="setShapeElbow('${edge}','past',this.value)"></div><div><label>Elbow form</label><select onchange="setShapeElbow('${edge}','mode',this.value)"><option value="">—</option>${SS_MODES.map(x=>`<option value="${x.id}" ${E.mode===x.id?'selected':''}>${x.id.toUpperCase()} · ${x.s1>0?'+':'−'} / ${x.s2>0?'+':'−'}</option>`).join('')}</select></div></div></div>`;}
function shapeForm(){
 const r=ShapeModule.compute(sDraft),S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;const map=ssEdgeMap(S).all;
 return `<div class="module-editor"><div class="module-editor-head"><div><h3>${sEdit==='new'?'Новая Advanced-фигура':'Изменение Advanced-фигуры'}</h3><p>Алгоритм Smart-Shape перенесён из v4.5 без упрощения геометрии.</p></div><span class="pill ok">source v4.5</span></div>
 <div class="shape-editor-layout"><div class="shape-controls">
  <div class="grid"><div><label>Название *</label><input id="s_name" value="${esc(sDraft.name||'')}" oninput="sDraft.name=this.value"></div><div><label>B · Width</label><input value="${esc(sDraft.w)}" oninput="setShapeDim('w',this.value)"></div><div><label>A · Height</label><input value="${esc(sDraft.h)}" oninput="setShapeDim('h',this.value)"></div><div><label>C · Right height</label><input value="${esc(sDraft.smart.C.len||'')}" placeholder="= A" oninput="setShapeC(this.value)"></div></div>
  <div class="shape-mode-row"><span>Edge mode</span><button class="${!sDraft.smart.elbowsOn?'on':''}" onclick="setShapeElbows(false)">Hide elbows · simple skew</button><button class="${sDraft.smart.elbowsOn?'on':''}" onclick="setShapeElbows(true)">Show elbows · compound</button></div>
  <div class="edge-stack">${['A','B','C'].map(shapeEdgeEditor).join('')}</div>
  <div class="corner-title"><b>Corner blocks</b><span>Single = 2 edges · Double = 4 · Triple = 6</span></div><div class="corner-grid">${SS_ORDER.map(c=>`<div class="corner-card"><label>${c.toUpperCase()}</label><select onchange="setShapeCorner('${c}',this.value)">${SS_CORNERS.map(x=>`<option value="${x[0]}" ${sDraft.smart.corners[c]===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>`).join('')}</div>
  ${map.length?`<div class="extra-edges"><div class="corner-title"><b>Corner edge dimensions</b><span>E / F / G…</span></div><div class="extra-grid">${map.map(e=>`<div><label>${e.id} · ${e.corner.toUpperCase()} · ${e.axis==='v'?'Vertical':'Horizontal'}</label><input value="${esc((sDraft.smart.extraEdges[e.id]||{}).len||'')}" oninput="setShapeExtra('${e.id}',this.value)"></div>`).join('')}</div></div>`:''}
 </div><div class="shape-preview-side"><div id="shapeLivePreview">${shapePreviewSVG(r)}</div><div id="shapeLiveDerived">${shapeDerivedHTML(r)}</div></div></div>
 <div class="err" id="e_shape"></div><div class="row"><button class="pri" onclick="saveShape()">Сохранить</button><button onclick="sEdit=null;sDraft=null;render()">Отмена</button></div></div>`;
}
function saveShape(){const e=document.getElementById('e_shape');e.style.display='none';sDraft.name=(sDraft.name||'').trim();if(!sDraft.name)return fail(e,'Укажи название');const r=ShapeModule.compute(sDraft);if(!r.valid)return fail(e,moduleErrorText(r));if(sEdit==='new')DB.shapeDef.push(sDraft);else DB.shapeDef[sEdit]=sDraft;sEdit=null;sDraft=null;touch();render();}
function delShape(i){const s=DB.shapeDef[i];if(DB.muntinDef.some(m=>m.shapeId===s.id))return alert('Нельзя удалить — фигура используется в Muntinbar');if(!confirm('Удалить фигуру?'))return;DB.shapeDef.splice(i,1);touch();render();}
