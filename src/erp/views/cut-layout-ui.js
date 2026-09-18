/* =====================================================================
   views/cut-layout-ui  ·  cut-2.0
   Master Data → Cutting (параметры реза) и вкладка Optimization у батча:
   список стёкол, лист с подписями, потери, правки мышкой, печать.
   IN : DB.cutting, DB.cutPlan, открытый батч
   OUT: экран и печать; раскладку считает erp/production/cut-layout

   Владелец, 17 сентября 2026: функции как в Perfect Cut, вид наш —
   «приятно, логично, минималистично, эффективно». Поэтому: слева стёкла,
   справа лист, сверху цифры потерь и параметры прогона; действия — у
   выбранной детали, а не кнопками в каждой строке.
   ===================================================================== */
let cutNotice='',cutMdNotice='',cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
/* ------------------------- Master Data → Cutting ------------------------- */
function cutMdSet(mm,field,value){
 const s=cutSettings(),row=s.rows.find(r=>r.mm===+mm);if(!row)return;
 const v=cutIn(value,null);if(v==null)return render();
 row[field]=v;normalizeCutting();touch();render();
}
function cutMdSetting(field,value){
 const s=cutSettings();
 if(field==='rotate')s.rotate=!!value;else s[field]=cutIn(value,s[field]);
 normalizeCutting();touch();render();
}
function cutMdSheetTrim(key,field,value){cutSheetTrimSet(key,field,value);render();}
/* Сброс к таблице цеха не трогает размеры листов: это не параметры реза, а
   то, что лежит на складе. */
function cutMdReset(){const sizes=cutSettings().sizes||[];DB.cutting=Object.assign(cutSettingsDefault(),{sizes});normalizeCutting();touch();render();}
function cutMdSizeAdd(){const r=cutShopSizeAdd(mdVal('cutMdSizeW'),mdVal('cutMdSizeH'));cutMdNotice=r.error||'';render();}
function cutMdSizeRemove(key){if(!confirm('Remove this sheet size?'))return;const r=cutShopSizeRemove(key);cutMdNotice=r.error||'';render();}
function viewMdCutting(){
 const s=cutSettings();
 const cell=(row,field)=>`<td class="n"><input type="text" data-cut-${field}="${row.mm}" value="${esc(frac16(row[field]))}" aria-label="${field} ${row.mm} mm" onchange="cutMdSet(${row.mm},'${field}',this.value)"><small>${esc(frac16(row[field+'Min']))}</small></td>`;
 const rows=s.rows.map(r=>`<tr data-cut-row="${r.mm}"><td><b>${r.mm} mm</b></td>${cell(r,'trim')}${cell(r,'border')}<td class="n"><input type="text" data-cut-minDist="${r.mm}" value="${esc(frac16(r.minDist))}" aria-label="min distance ${r.mm} mm" onchange="cutMdSet(${r.mm},'minDist',this.value)"></td></tr>`).join('');
 return `<div class="cut-md" data-cut-md>
  <div class="cut-md-head"><div><h3>Cutting parameters</h3><p class="mut">Trim — bottom and left sheet edge. Border — top and right. Min distance — around shaped pieces only. Small number — shop minimum.</p></div>
   <button type="button" data-cut-reset onclick="cutMdReset()">Reset to shop table</button></div>
  <div class="sales-table-wrap"><table class="ncr-table cut-table"><thead><tr><th>Thickness</th><th class="n">Trim</th><th class="n">Border</th><th class="n">Min distance</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${(function(){const sizes=cutSheetSizes();
   const edge=(x,own,f,label)=>`<td class="n"><input type="text" data-cut-${f.toLowerCase()}="${esc(x.key)}" value="${own[f]==null?'':esc(frac16(own[f]))}" placeholder="—" aria-label="${label} ${esc(x.key)}" onchange="cutMdSheetTrim('${esc(x.key)}','${f}',this.value)"></td>`;
   const whose=x=>[x.shop?'All glass':'',x.codes.slice(0,4).join(', ')+(x.codes.length>4?' +'+(x.codes.length-4):'')].filter(Boolean).join(' · ');
   return `<h4 class="cut-md-sub">Sheet sizes</h4><p class="mut">Supply sizes of a glass go first, shop sizes work for any glass. Empty edge — the value by thickness.</p>
   <div class="sales-table-wrap"><table class="ncr-table cut-table" data-cut-sheet-table><thead><tr><th>Sheet</th><th>Glass</th><th class="n">Trim X <small>bottom</small></th><th class="n">Trim Y <small>left</small></th><th class="n">Border X <small>top</small></th><th class="n">Border Y <small>right</small></th><th></th></tr></thead><tbody>${sizes.map(x=>{const own=cutSheetTrim(x.key)||{};
    return `<tr data-cut-sheet-row="${esc(x.key)}"><td><b>${esc(frac16(x.w))} × ${esc(frac16(x.h))}″</b></td><td class="mut">${esc(whose(x))}</td>
     ${edge(x,own,'trimX','Trim X')}${edge(x,own,'trimY','Trim Y')}${edge(x,own,'borderX','Border X')}${edge(x,own,'borderY','Border Y')}
     <td>${x.shop?`<button type="button" class="sm dl" data-cut-size-remove="${esc(x.key)}" aria-label="Remove ${esc(x.key)}" onclick="cutMdSizeRemove('${esc(x.key)}')">×</button>`:''}</td></tr>`;}).join('')||'<tr><td colspan="7" class="mut" data-cut-sheets-empty>No sheet sizes yet — add the ones you cut.</td></tr>'}</tbody></table></div>
   <div class="cut-size-add" data-cut-size-add><input type="text" id="cutMdSizeW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="cutMdSizeH" placeholder="width" aria-label="Sheet width, in"> <button type="button" onclick="cutMdSizeAdd()">+ Add sheet size</button>
   ${cutMdNotice?`<span class="cut-md-error" role="alert" data-cut-md-error>${esc(cutMdNotice)}</span>`:''}</div>`;})()}
  <div class="cut-md-foot">
   <label><span class="ncr-label">MIN OFFCUT W</span><input type="text" data-cut-offcut-w value="${esc(frac16(s.minOffcutW))}" onchange="cutMdSetting('minOffcutW',this.value)"></label>
   <label><span class="ncr-label">MIN OFFCUT H</span><input type="text" data-cut-offcut-h value="${esc(frac16(s.minOffcutH))}" onchange="cutMdSetting('minOffcutH',this.value)"></label>
   <label class="chk"><input type="checkbox" data-cut-rotate ${s.rotate?'checked':''} onchange="cutMdSetting('rotate',this.checked)"> Rotate pieces on the sheet</label>
  </div></div>`;
}
/* --------------------------- Батч → Optimization -------------------------- */
function cutUiState(number){
 if(cutUi.batch!==number){cutUi={batch:number,glass:'',sheet:1,sel:'',drag:''};}
 const plan=cutPlanFor(number);
 if(plan&&plan.groups.length){
  if(!plan.groups.some(g=>g.glass===cutUi.glass))cutUi.glass=plan.groups[0].glass;
  const g=plan.groups.find(x=>x.glass===cutUi.glass);
  if(g&&!g.sheets.some(s=>s.no===cutUi.sheet))cutUi.sheet=g.sheets.length?g.sheets[0].no:1;
 }
 return cutUi;
}
function cutRunBatch(number){const r=cutPlanRun(number);cutNotice=r.error||'';render();}
/* Размер листа прямо с экрана оптимизации: уходит в размеры цеха (Master
   Data → Cutting) и сразу пересчитывает раскрой. */
function cutUiAddSize(number,wId,hId){
 const w=document.getElementById(wId),h=document.getElementById(hId);
 const r=cutShopSizeAdd(w?w.value:'',h?h.value:'');
 if(r.error){cutNotice=r.error;render();return;}
 const run=cutPlanRun(number);cutNotice=run.error||'';render();
}
/* Стёкла батча, для которых не нашлось ни одного размера листа. */
function cutNeedSizes(b,plan,pieces){
 const pick=g=>plan&&plan.sheetPick&&plan.sheetPick[g]||null;
 const need=[...new Set((pieces||cutPieces(b,plan&&plan.settings||{})).filter(p=>!p.off).map(p=>p.glass))].filter(g=>!cutStockFor(g,pick(g)).length).sort();
 if(!need.length)return '';
 return `<div class="cut-need" data-cut-need><span><b>No sheet size</b> · ${esc(need.join(', '))}</span>
  <input type="text" id="cutNeedW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="cutNeedH" placeholder="width" aria-label="Sheet width, in">
  <button type="button" class="pri" data-cut-need-add onclick="cutUiAddSize('${esc(b.number)}','cutNeedW','cutNeedH')">Add and optimize</button>
  <span class="mut">Saved to Master Data → Cutting</span></div>`;
}
function cutUiPick(pieceId){cutUi.sel=cutUi.sel===pieceId?'':pieceId;const at=cutUi.sel&&cutFind(cutPlanFor(cutUi.batch)||{groups:[]},cutUi.sel);if(at){cutUi.glass=at.group.glass;cutUi.sheet=at.sheet.no;}render();}
function cutUiSheet(glass,no){cutUi.glass=glass;cutUi.sheet=+no;render();}
function cutUiStep(glass,delta){
 const plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass);if(!g)return;
 const i=g.sheets.findIndex(x=>x.no===cutUi.sheet),next=g.sheets[Math.min(g.sheets.length-1,Math.max(0,i+delta))];
 if(next)cutUiSheet(glass,next.no);
}
function cutUiRun(fn){const r=fn();cutNotice=r&&r.error||'';render();}
function cutUiRotate(){cutUiRun(()=>cutPieceRotate(cutUi.batch,cutUi.sel));}
function cutUiTake(){cutUiRun(()=>cutPieceTake(cutUi.batch,cutUi.sel));}
function cutUiLock(){cutUiRun(()=>cutPieceLock(cutUi.batch,cutUi.sel));}
function cutUiStock(glass,key,field,value){cutUiRun(()=>cutSetStock(cutUi.batch,glass,key,field,value));}
function cutUiParam(glass,field,value){cutUiRun(()=>cutSetParam(cutUi.batch,glass,field,value));}
function cutUiResetParams(glass){cutUiRun(()=>cutResetParams(cutUi.batch,glass));}
function cutUiSheetLock(){cutUiRun(()=>cutSheetLock(cutUi.batch,cutUi.glass,cutUi.sheet));}
/* В сток: номер S-…, запись и сразу стикер — «и потом генерить для него стикер». */
function cutUiStockDone(r){cutNotice=r&&r.error||'';render();if(r&&r.ok&&r.id&&typeof stkPrintStock==='function')stkPrintStock([r.id]);}
function cutUiStockTake(glass,no,i){cutUi.glass=glass;cutUi.sheet=+no;cutUiStockDone(cutStockTake(cutUi.batch,glass,no,i));}
function cutUiStockSplit(glass,no,i,wId,hId){
 const w=document.getElementById(wId),h=document.getElementById(hId);
 cutUi.glass=glass;cutUi.sheet=+no;cutUiStockDone(cutStockSplit(cutUi.batch,glass,no,i,w?w.value:'',h?h.value:''));
}
function cutUiStockCancel(id){if(!confirm('Put '+id+' back to waste?'))return;cutUiRun(()=>cutStockCancel(cutUi.batch,id));}
function cutUiStockPrint(ids){if(ids.length&&typeof stkPrintStock==='function')stkPrintStock(ids);}
function cutUiSet(pieceId,field,value){cutUiRun(()=>cutSetting(cutUi.batch,pieceId,field,value));}
function cutUiDragStart(e,pieceId){
 cutUi.drag=pieceId;cutUi.sel=pieceId;cutUi.dropBox=null;
 /* Размер детали — один раз на весь перенос, а не на каждое движение мыши. */
 const plan=cutPlanFor(cutUi.batch),at=plan&&cutFind(plan,pieceId),src=plan&&cutPieces(glassBatchFind(cutUi.batch),plan.settings||{}).find(p=>p.piece===pieceId);
 cutUi.dragDim=at?{w:at.piece.w,h:at.piece.h,shape:!!at.piece.shape}:src?{w:src.w,h:src.h,shape:!!src.shape}:null;
 try{e.dataTransfer.setData('text/plain',pieceId);e.dataTransfer.effectAllowed='move';}catch(x){}
}
/* ------------------------------ Мышь на листе ------------------------------
   Владелец, 18 сентября 2026: «интерфейс не сильно подстроен на работу с
   мышкой». Нужно: заблокировать лайаут и стекло, повернуть стекло левой
   кнопкой, вынести стекло с листа и занести обратно. Поэтому:
   - стекло тащится прямо по листу; тень показывает, куда ляжет (синяя —
     можно, красная — занято), и липнет к линиям листа и к соседям;
   - бросить стекло на вкладку листа — перенос на тот лист, в список — снять;
   - клик по стеклу выбирает (и по подписи тоже), двойной клик или ⟲ —
     поворот; клик по пустому месту снимает выбор;
   - правая кнопка — меню; клавиши R, Delete, L, Esc;
   - наведение подсвечивает стекло и на листе, и в списке. */
let cutDrag=null,cutClick={id:'',t:0};
/* Экранная точка → дюймы: X от нуля, Y от верха листа (yTop) и высота листа. */
function cutUiSvgInches(svg,cx,cy){
 const m=svg&&svg.getScreenCTM&&svg.getScreenCTM();if(!m)return null;
 const pt=svg.createSVGPoint();pt.x=cx;pt.y=cy;const u=pt.matrixTransform(m.inverse()),S=+svg.dataset.cutScale||1;
 return {x:u.x/S,yTop:u.y/S,sh:+svg.dataset.cutSh||0};
}
function cutUiCtx(glass,no){
 const plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass),sheet=g&&g.sheets.find(x=>x.no===+no);
 if(!sheet)return null;
 const params=cutGroupParams(g,sheet.size);
 return {plan,g,sheet,params,u:cutUsable(sheet.size||g.sheet,params)};
}
/* Угол детали липнет к линиям листа и краям соседей ближе 1 1/2″. */
function cutUiSnap(ctx,id,x,y,w,h){
 const tol=1.5,xs=[ctx.u.x0,ctx.u.x1-w],ys=[ctx.u.y0,ctx.u.y1-h];
 ctx.sheet.pieces.forEach(q=>{if(q.piece!==id){xs.push(q.x+q.w,q.x-w,q.x);ys.push(q.y+q.h,q.y-h,q.y);}});
 const near=(v,list)=>{let best=v,d=tol;list.forEach(t=>{if(Math.abs(t-v)<=d){d=Math.abs(t-v);best=t;}});return best;};
 return {x:cutRound(near(x,xs)),y:cutRound(near(y,ys))};
}
function cutUiGhost(svg,box,ok){
 let r=svg&&svg.querySelector('[data-cut-ghost]');
 if(!box){if(r)r.remove();return;}
 if(!r){r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('data-cut-ghost','');r.setAttribute('pointer-events','none');svg.appendChild(r);}
 const S=+svg.dataset.cutScale,sh=+svg.dataset.cutSh;
 r.setAttribute('x',(box.x*S).toFixed(1));r.setAttribute('y',((sh-box.y-box.h)*S).toFixed(1));
 r.setAttribute('width',(box.w*S).toFixed(1));r.setAttribute('height',(box.h*S).toFixed(1));
 r.setAttribute('fill',ok?'rgba(31,111,159,.16)':'rgba(217,45,32,.16)');r.setAttribute('stroke',ok?'#1f6f9f':'#d92d20');r.setAttribute('stroke-width','1.5');
 r.setAttribute('data-ok',ok?'1':'0');
}
/* Куда бросят: вкладка листа или список стёкол — подсветить. */
function cutUiHot(el){
 document.querySelectorAll('.cut-hot').forEach(x=>x.classList.remove('cut-hot'));
 const t=el&&el.closest&&(el.closest('[data-cut-tab]')||el.closest('.cut-side'));if(t)t.classList.add('cut-hot');
}
function cutUiHover(id){
 document.querySelectorAll('.cut-hl').forEach(x=>x.classList.remove('cut-hl'));
 if(!id)return;
 document.querySelectorAll('[data-cut-piece="'+CSS.escape(id)+'"],[data-cut-list="'+CSS.escape(id)+'"]').forEach(x=>x.classList.add('cut-hl'));
}
function cutUiOver(e){const g=e.target&&e.target.closest&&e.target.closest('[data-cut-piece]');if(!cutDrag)cutUiHover(g?g.dataset.cutPiece:'');}
function cutUiDown(e,glass,no){
 if(e.button!==0)return;
 cutUiMenuClose();
 const svg=e.currentTarget.querySelector('svg');if(!svg)return;
 const t=e.target,rot=t.closest&&t.closest('[data-cut-rot-handle]');
 if(rot){e.preventDefault();cutUi.sel=rot.dataset.cutRotHandle;cutUiRotate();return;}
 const g=t.closest&&t.closest('[data-cut-piece]'),id=g?g.dataset.cutPiece:'',pt=cutUiSvgInches(svg,e.clientX,e.clientY);if(!pt)return;
 const d={id,glass,no:+no,svg,sx:e.clientX,sy:e.clientY,moving:false};
 if(id){
  e.preventDefault();
  const ctx=cutUiCtx(glass,no),p=ctx&&ctx.sheet.pieces.find(x=>x.piece===id);
  if(p){d.ctx=ctx;d.p=p;d.dx=pt.x-p.x;d.dy=(pt.sh-pt.yTop)-p.y;}
 }
 cutDrag=d;
 window.addEventListener('pointermove',cutUiMove);
 window.addEventListener('pointerup',cutUiUp);
}
function cutUiMove(e){
 const d=cutDrag;if(!d||!d.p||d.ctx.sheet.locked||d.p.locked)return;
 if(!d.moving&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<5)return;
 if(!d.moving){
  d.moving=true;document.body.classList.add('cut-dragging');
  const el=d.svg.querySelector('[data-cut-piece="'+CSS.escape(d.id)+'"]');if(el)el.classList.add('cut-drag-src');
 }
 const over=document.elementFromPoint(e.clientX,e.clientY);
 if(!(over&&(over===d.svg||d.svg.contains(over)))){cutUiGhost(d.svg,null);d.box=null;cutUiHot(over);return;}
 cutUiHot(null);
 const pt=cutUiSvgInches(d.svg,e.clientX,e.clientY);if(!pt)return;
 const s=cutUiSnap(d.ctx,d.id,pt.x-d.dx,(pt.sh-pt.yTop)-d.dy,d.p.w,d.p.h),box={x:s.x,y:s.y,w:d.p.w,h:d.p.h};
 d.box=box;d.ok=!cutRoom(d.ctx.g,d.ctx.sheet,box,d.ctx.params,d.id,d.p);cutUiGhost(d.svg,box,d.ok);
}
function cutUiUp(e){
 window.removeEventListener('pointermove',cutUiMove);window.removeEventListener('pointerup',cutUiUp);
 const d=cutDrag;cutDrag=null;document.body.classList.remove('cut-dragging');if(!d)return;
 if(d.moving){
  cutUiGhost(d.svg,null);cutUiHot(null);
  const over=document.elementFromPoint(e.clientX,e.clientY),tab=over&&over.closest&&over.closest('[data-cut-tab]'),side=over&&over.closest&&over.closest('.cut-side');
  cutUi.sel=d.id;
  if(tab){const to=+tab.dataset.cutTab;cutUi.sheet=to;return cutUiRun(()=>cutPieceAuto(cutUi.batch,d.id,to));}
  if(side)return cutUiRun(()=>cutPieceTake(cutUi.batch,d.id));
  if(d.box)return cutUiRun(()=>cutPiecePlace(cutUi.batch,d.id,d.no,d.box.x,d.box.y));
  return render();
 }
 /* Клик: по стеклу — выбрать, второй клик по нему же — повернуть; по пустому
    месту — снять выбор. Двойной клик ловим сами: после первого клика экран
    перерисован, и браузерный dblclick не доходит. */
 if(d.id){
  const now=Date.now(),twice=cutClick.id===d.id&&now-cutClick.t<450;
  cutClick=twice?{id:'',t:0}:{id:d.id,t:now};
  cutUi.sel=d.id;cutUi.glass=d.glass;cutUi.sheet=d.no;
  return twice?cutUiRotate():render();
 }
 if(cutUi.sel){cutUi.sel='';render();}
}
/* Бросок из списка: тень под курсором, деталь центром к курсору. */
function cutUiDragOver(e,glass,no){
 e.preventDefault();
 const dim=cutUi.drag&&cutUi.dragDim,svg=e.currentTarget.querySelector('svg'),ctx=dim&&cutUiCtx(glass,no);
 if(!ctx||!svg)return;
 const pt=cutUiSvgInches(svg,e.clientX,e.clientY);if(!pt)return;
 const s=cutUiSnap(ctx,cutUi.drag,pt.x-dim.w/2,(pt.sh-pt.yTop)-dim.h/2,dim.w,dim.h),box={x:s.x,y:s.y,w:dim.w,h:dim.h};
 const ok=!cutRoom(ctx.g,ctx.sheet,box,ctx.params,cutUi.drag,dim);
 cutUi.dropBox=box;cutUiGhost(svg,box,ok);
}
function cutUiDragLeave(e){if(!e.currentTarget.contains(e.relatedTarget))cutUiGhost(e.currentTarget.querySelector('svg'),null);}
function cutUiDrop(e,glass,no){
 e.preventDefault();const id=cutUi.drag,box=cutUi.dropBox;cutUi.drag='';cutUi.dropBox=null;
 cutUiGhost(e.currentTarget.querySelector('svg'),null);if(!id)return;
 cutUi.sel=id;cutUi.glass=glass;cutUi.sheet=+no;
 cutUiRun(()=>box?cutPiecePlace(cutUi.batch,id,no,box.x,box.y):cutPieceAuto(cutUi.batch,id,no));
}
/* Правая кнопка: меню стекла, остатка или листа. */
let cutMenuActs=[];
function cutUiMenuClose(){const m=document.getElementById('cutMenu');if(m){m.remove();cutMenuActs=[];return true;}return false;}
function cutUiMenuDo(i){const fn=cutMenuActs[i];if(fn)fn();cutUiMenuClose();}
function cutUiMenu(e,glass,no){
 e.preventDefault();cutUiMenuClose();
 const ctx=cutUiCtx(glass,no);if(!ctx)return;
 const t=e.target,g=t.closest&&t.closest('[data-cut-piece]'),off=t.closest&&t.closest('[data-cut-offcut]'),stk=t.closest&&t.closest('[data-cut-stock]');
 const rows=[],act=(label,key,fn,attr)=>{cutMenuActs.push(fn);rows.push(`<button type="button" ${attr||''} onclick="cutUiMenuDo(${cutMenuActs.length-1})"><span>${esc(label)}</span>${key?`<kbd>${key}</kbd>`:''}</button>`);};
 cutUi.glass=glass;cutUi.sheet=+no;
 if(g){
  const id=g.dataset.cutPiece,p=ctx.sheet.pieces.find(x=>x.piece===id);
  /* Выбор переходит на это стекло — полоса действий и подсветка про него же. */
  if(cutUi.sel!==id){cutUi.sel=id;render();}
  rows.push(`<div class="cut-menu-head">${esc(id)}${p?' · '+esc(frac16(p.w))+' × '+esc(frac16(p.h))+'″':''}</div>`);
  act('Rotate','R',()=>cutUiRotate(),'data-cut-menu="rotate"');
  act('Take off the sheet','Del',()=>cutUiTake(),'data-cut-menu="take"');
  act(p&&p.locked?'Unlock glass':'Lock glass','L',()=>cutUiLock(),'data-cut-menu="lock"');
  const others=ctx.g.sheets.filter(x=>x.no!==ctx.sheet.no&&!x.locked);
  if(others.length){
   rows.push('<div class="cut-menu-sub">Move to sheet</div><div class="cut-menu-sheets">');
   others.forEach(x=>act(String(x.no),'',()=>{cutUi.sheet=x.no;cutUiRun(()=>cutPieceAuto(cutUi.batch,id,x.no));},'data-cut-menu-sheet="'+x.no+'"'));
   rows.push('</div>');
  }
 }else if(stk){
  const id=stk.dataset.cutStock,x=(ctx.sheet.stock||[]).find(q=>q.id===id);
  rows.push(`<div class="cut-menu-head">${esc(id)}${x?' · '+esc(frac16(x.w))+' × '+esc(frac16(x.h))+'″':''}</div>`);
  act('Print sticker','',()=>cutUiStockPrint([id]),'data-cut-menu="stock-print"');
  act('Back to waste','',()=>cutUiStockCancel(id),'data-cut-menu="stock-cancel"');
 }else if(off){
  /* Подсказка: взять целиком или отрезать нужный размер (Split). */
  const i=+off.dataset.cutOffcut,o=(ctx.sheet.offcuts||[])[i];
  if(o){
   rows.push(`<div class="cut-menu-head">Offcut ${esc(frac16(o.w))} × ${esc(frac16(o.h))}″</div>`);
   act('To stock','',()=>cutUiStockTake(glass,no,i),'data-cut-menu="stock"');
   rows.push(`<div class="cut-menu-sub">Split — cut a size to stock</div><div class="cut-menu-split"><input type="text" id="cutSplitW" placeholder="length" aria-label="Length, in"> × <input type="text" id="cutSplitH" placeholder="width" aria-label="Width, in" onkeydown="if(event.key==='Enter')document.querySelector('[data-cut-menu=split]').click()">`);
   act('Cut','',()=>cutUiStockSplit(glass,no,i,'cutSplitW','cutSplitH'),'data-cut-menu="split"');
   rows.push('</div>');
  }
 }
 act(ctx.sheet.locked?'Unlock sheet':'Lock sheet','',()=>cutUiSheetLock(),'data-cut-menu="sheet-lock"');
 const m=document.createElement('div');m.id='cutMenu';m.className='cut-menu';m.setAttribute('role','menu');m.innerHTML=rows.join('');
 document.body.appendChild(m);
 const w=m.offsetWidth,h=m.offsetHeight;
 m.style.left=Math.max(4,Math.min(e.clientX,window.innerWidth-w-4))+'px';m.style.top=Math.max(4,Math.min(e.clientY,window.innerHeight-h-4))+'px';
}
/* Клавиши — пока открыт раскрой и курсор не в поле ввода. */
function cutUiKey(e){
 if(!document.querySelector('[data-cut-sheet]'))return;
 const t=e.target,tag=t&&t.tagName||'';
 if(/^(INPUT|SELECT|TEXTAREA)$/.test(tag)||t&&t.isContentEditable)return;
 if(e.key==='Escape'){if(cutUiMenuClose())return;if(cutUi.sel){cutUi.sel='';render();}return;}
 if(!cutUi.sel||e.metaKey||e.ctrlKey||e.altKey)return;
 const k=String(e.key||'').toLowerCase();
 if(k==='r'){e.preventDefault();cutUiRotate();}
 else if(k==='delete'||k==='backspace'){e.preventDefault();cutUiTake();}
 else if(k==='l'){e.preventDefault();cutUiLock();}
}
if(typeof document!=='undefined'&&!window.cutUiKeysOn){
 window.cutUiKeysOn=true;
 document.addEventListener('keydown',cutUiKey);
 document.addEventListener('pointerdown',e=>{const m=document.getElementById('cutMenu');if(m&&!m.contains(e.target))cutUiMenuClose();},true);
 /* Закрываем по колесу, а не по scroll: прокрутка страницы доходит на
    следующем кадре и закрыла бы только что открытое меню. */
 window.addEventListener('wheel',()=>cutUiMenuClose(),{passive:true,capture:true});
 window.addEventListener('resize',()=>cutUiMenuClose());
}
function cutUiTabDrop(e,glass,sheetNo){
 e.preventDefault();const id=cutUi.drag;cutUi.drag='';if(!id)return;
 cutUi.glass=glass;cutUi.sheet=+sheetNo;cutUiRun(()=>cutPieceAuto(cutUi.batch,id,sheetNo));
}
function cutUiDropList(e){
 e.preventDefault();const id=cutUi.drag;cutUi.drag='';
 if(id)cutUiRun(()=>cutPieceTake(cutUi.batch,id));
}
/* ------------------------------- Схема листа ------------------------------ */
/* Лист лёжа, ноль слева внизу: X вправо по длинной стороне, Y вверх.
   Отступы от краёв — четыре сплошные оранжевые линии через весь лист, как
   идёт рез: Trim X снизу, Trim Y слева, Border X сверху, Border Y справа.
   Детали за них не заходят. Пунктиров нет: «делай прямым вектором — в
   будущем для раскроя на машине, чтобы она считала линии правильно»
   (владелец, 18 сентября 2026). Линии рисуются поверх деталей, чтобы их было
   видно и там, где детали к ним прилегают. Полезный остаток — зелёный: этот
   кусок уходит на сток. */
const CUT_SVG_PAD=28;
function cutSheetSVG(group,sheet,px,pieces,opts){
 opts=opts||{};
 const size=sheet.size||group.sheet,S=px/Math.max(size.w,size.h),W=size.w*S,H=size.h*S,by=new Map((pieces||[]).map(p=>[p.piece,p]));
 const pr=typeof cutGroupParams==='function'?cutGroupParams(group,size):{},u=cutUsable(size,pr),edged=u.x0>0||u.y0>0||u.x1<size.w||u.y1<size.h;
 const fy=(y,h)=>(size.h-y-h)*S,pad=CUT_SVG_PAD;
 /* На экране лист тянется на всю ширину колонки; в печати — свой размер. */
 const out=['<svg viewBox="'+(-pad)+' 0 '+(W+pad).toFixed(1)+' '+(H+pad).toFixed(1)+'" '+(opts.ids?'':'width="'+(W+pad).toFixed(0)+'" height="'+(H+pad).toFixed(0)+'" ')+'class="cut-svg" data-cut-scale="'+S+'" data-cut-sh="'+size.h+'" font-family="Helvetica, Arial, sans-serif">',
  '<rect width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'" fill="'+(edged?'#fef0c7':'#f2f4f7')+'" stroke="#98a2b3"/>'];
 if(edged)out.push('<rect x="'+(u.x0*S).toFixed(1)+'" y="'+fy(u.y0,u.H).toFixed(1)+'" width="'+(u.W*S).toFixed(1)+'" height="'+(u.H*S).toFixed(1)+'" fill="#f2f4f7"/>');
 /* Остатки: подсказка серым — это отход, пока его не взяли; забуканный в сток
    кусок — зелёный с номером S-…. Правая кнопка по ним — To stock, Split. */
 const block=(o,fill,stroke,attr,label,color)=>{const oy=fy(o.y,o.h);
  out.push('<g '+attr+'><rect x="'+(o.x*S).toFixed(1)+'" y="'+oy.toFixed(1)+'" width="'+(o.w*S).toFixed(1)+'" height="'+(o.h*S).toFixed(1)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1.2"/>');
  if(o.w*S>70&&o.h*S>16)out.push('<text x="'+((o.x+o.w/2)*S).toFixed(1)+'" y="'+(oy+o.h*S/2+4).toFixed(1)+'" text-anchor="middle" font-size="10" fill="'+color+'">'+label+'</text>');
  out.push('</g>');};
 (sheet.offcuts||[]).forEach((o,i)=>block(o,'#f9fafb','#d0d5dd','data-cut-offcut="'+i+'"','Offcut '+esc(frac16(o.w))+' × '+esc(frac16(o.h))+'″','#98a2b3'));
 (sheet.stock||[]).forEach(o=>block(o,'#ecfdf3','#12b76a','data-cut-stock="'+esc(o.id)+'"',esc(o.id)+' · '+esc(frac16(o.w))+' × '+esc(frac16(o.h))+'″','#067647'));
 sheet.pieces.forEach((p,i)=>{
  const x=p.x*S,y=fy(p.y,p.h),w=p.w*S,h=p.h*S,src=by.get(p.piece)||{},sel=opts.sel===p.piece;
  /* Стекло — группа: прямоугольник и подписи ловят мышь вместе. */
  out.push(opts.ids?'<g data-cut-piece="'+esc(p.piece)+'" class="cut-pc'+(sel?' sel':'')+(p.locked?' locked':'')+'">':'<g>');
  out.push('<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="#ffffff" stroke="'+(sel?'#1f6f9f':'#101828')+'" stroke-width="'+(sel?2:1)+'"/>');
  const lines=[];
  if(h>52&&w>84){lines.push([src.customer||'',9,'#475467'],[(src.order?src.order+' / '+src.line:''),10,'#101828'],[String(i+1),15,'#101828'],[frac16(p.w)+' × '+frac16(p.h)+'″'+(p.rot?' ⟲':''),9,'#475467']);}
  else if(h>30&&w>64)lines.push([String(i+1)+' · '+frac16(p.w)+' × '+frac16(p.h)+'″',9,'#101828']);
  else if(h>12&&w>18)lines.push([String(i+1),9,'#101828']);
  const total=lines.reduce((a,l)=>a+l[1]*1.25,0);let ty2=y+h/2-total/2;
  lines.forEach(l=>{ty2+=l[1]*1.15;if(l[0])out.push('<text x="'+(x+w/2).toFixed(1)+'" y="'+ty2.toFixed(1)+'" text-anchor="middle" font-size="'+l[1]+'" fill="'+l[2]+'">'+esc(l[0])+'</text>');});
  if(p.locked&&w>20&&h>20)out.push('<text x="'+(x+w-4).toFixed(1)+'" y="'+(y+11).toFixed(1)+'" text-anchor="end" font-size="9" fill="#93370d">lock</text>');
  out.push('</g>');
  /* У выбранного стекла — кнопка поворота в углу, левой кнопкой мыши. */
  if(sel&&opts.ids&&!p.locked&&w>30&&h>30)out.push('<g data-cut-rot-handle="'+esc(p.piece)+'" class="cut-rot"><title>Rotate (R)</title><circle cx="'+(x+w-11).toFixed(1)+'" cy="'+(y+11).toFixed(1)+'" r="8" fill="#1f6f9f"/><text x="'+(x+w-11).toFixed(1)+'" y="'+(y+15).toFixed(1)+'" text-anchor="middle" font-size="11" fill="#ffffff">⟲</text></g>');
 });
 const line=(edge,x1,y1,x2,y2)=>out.push('<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="#f79009" stroke-width="1.2" pointer-events="none" data-cut-edge="'+edge+'"><title>'+edge.replace(/^(trim|border)/,m=>m[0].toUpperCase()+m.slice(1)+' ')+' '+esc(frac16(pr[edge]))+'″</title></line>');
 if(u.y0>0)line('trimX',0,H-u.y0*S,W,H-u.y0*S);
 if(u.x0>0)line('trimY',u.x0*S,0,u.x0*S,H);
 if(u.y1<size.h)line('borderX',0,H-u.y1*S,W,H-u.y1*S);
 if(u.x1<size.w)line('borderY',u.x1*S,0,u.x1*S,H);
 /* Ноль и оси: откуда считаются X и Y. */
 out.push('<text x="-4" y="'+(H+11).toFixed(1)+'" text-anchor="end" font-size="10" font-weight="700" fill="#101828">0</text>',
  '<text x="'+(W-2).toFixed(1)+'" y="'+(H+11).toFixed(1)+'" text-anchor="end" font-size="10" fill="#475467">X '+esc(frac16(size.w))+'″ →</text>',
  '<text x="-4" y="10" text-anchor="end" font-size="10" fill="#475467">Y</text>',
  '<text x="-4" y="22" text-anchor="end" font-size="9" fill="#475467">'+esc(frac16(size.h))+'″</text>');
 return out.join('')+'</svg>';
}
/* --------------------------------- Печать -------------------------------- */
function cutPrintHost(){let h=document.getElementById('cutPrintHost');if(!h){h=document.createElement('div');h.id='cutPrintHost';document.body.appendChild(h);}return h;}
function cutPrintCleanup(){document.body.classList.remove('cut-printing');const h=document.getElementById('cutPrintHost');if(h)h.innerHTML='';}
function cutPrintLayouts(number){
 const plan=cutPlanFor(number);if(!plan)return false;
 const pieces=cutPieces(glassBatchFind(number),plan.settings||{}),by=new Map(pieces.map(p=>[p.piece,p])),pages=[];
 plan.groups.forEach(g=>g.sheets.forEach(s=>{
  const rows=s.pieces.map((p,i)=>{const src=by.get(p.piece)||{};
   return `<tr><td>${i+1}</td><td>${esc(p.piece)}</td><td>${esc(src.customer||'')}</td><td>${esc(src.order||'')} / ${src.line||''}</td><td>${esc(src.mark||'')}</td><td>${esc(frac16(p.w))} × ${esc(frac16(p.h))}″</td><td>${p.rot?'rotated':''}</td></tr>`;}).join('');
  pages.push(`<div class="cut-print-page"><h3>Batch ${esc(number)} · Sheet ${s.no} · ${esc(g.glass)} ${g.mm} mm · ${esc(frac16((s.size||g.sheet).w))} × ${esc(frac16((s.size||g.sheet).h))}″</h3>
   <p>Used ${s.used} ft² · Scrap ${s.gross} ft² · Net ${s.net} ft²${(s.stock||[]).length?' · To stock '+s.stock.map(x=>esc(x.id)+' '+esc(frac16(x.w))+' × '+esc(frac16(x.h))+'″').join(', '):''}</p>
   <div class="cut-print-sheet">${cutSheetSVG(g,s,520,pieces)}</div>
   <table class="cut-print-table"><thead><tr><th>#</th><th>Glass ID</th><th>Customer</th><th>Order</th><th>Mark</th><th>Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
 }));
 if(!pages.length)return false;
 cutPrintHost().innerHTML=pages.join('');
 document.body.classList.add('cut-printing');
 window.addEventListener('afterprint',cutPrintCleanup,{once:true});setTimeout(cutPrintCleanup,60000);
 try{window.print();}catch(e){cutPrintCleanup();return false;}
 return true;
}
/* --------------------------------- Экран --------------------------------- */
function cutStatsBar(plan,sheet){
 /* Главная цифра — Used %: сколько листа ушло в заказы. */
 const cell=(k,v,main)=>`<span${main?' class="cut-main" data-cut-used-pct':''}><small>${k}</small><b>${v}</b></span>`;
 const area=sheet?cutArea((sheet.size||plan.groups[0].sheet).w,(sheet.size||plan.groups[0].sheet).h):0;
 const cur=sheet?`<div class="cut-stat" data-cut-current><i>This sheet</i>${cell('Used %',cutPct(sheet.used,area)+'%',1)}${cell('Used',sheet.used+' ft²')}${cell('Scrap',sheet.gross+' ft²')}${cell('Net',sheet.net+' ft²')}</div>`:'';
 const s=plan.stats;
 const stock=plan.groups.reduce((n,g)=>n+g.sheets.reduce((a,x)=>a+(x.stock||[]).length,0),0);
 return `${cur}<div class="cut-stat" data-cut-total><i>All sheets</i>${cell('Used %',s.usedPct+'%',1)}${cell('Used',s.used+' ft²')}${cell('Scrap',s.gross+' ft²')}${cell('Net',s.net+' ft²')}${cell('Net %',s.netPct+'%')}${cell('Sheets',s.sheets)}${cell('Pieces',s.placed+' / '+s.total)}${cell('To stock',stock+' · '+s.keep+' ft²')}</div>`;
}
function cutPieceRow(p,at,sel){
 const place=at?at.sheet.no+' · '+(at.index+1):'—';
 return `<tr data-cut-list="${esc(p.piece)}" class="${sel?'on':''}${p.off?' off':''}" draggable="true" ondragstart="cutUiDragStart(event,'${esc(p.piece)}')" onclick="cutUiPick('${esc(p.piece)}')" onmouseenter="cutUiHover('${esc(p.piece)}')" onmouseleave="cutUiHover('')">
  <td><input type="checkbox" data-cut-on ${p.off?'':'checked'} aria-label="Cut ${esc(p.piece)}" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','off',!this.checked)"></td>
  <td class="gb-piece">${esc(p.piece)}</td><td class="nowrap">${esc(frac16(p.w))} × ${esc(frac16(p.h))}″${p.shape?' <span class="pill">shape</span>':''}</td>
  <td><button type="button" class="gb-link" data-cut-open="${esc(p.orderId)}" title="Open the order and its shape" onclick="event.stopPropagation();optimizationOpenOrder('${esc(p.orderId)}')">${esc(p.order)} / ${p.line}</button>${p.mark?' · '+esc(p.mark):''}</td><td>${esc(p.customer)}</td>
  <td class="n"><input type="number" min="1" max="10" step="1" data-cut-priority value="${p.priority}" aria-label="Priority" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','priority',this.value)"></td>
  <td class="n">${place}</td></tr>`;
}
function viewCutLayout(b){
 const s=cutUiState(b.number),plan=cutPlanFor(b.number),stale=plan&&cutPlanStale(b.number);
 const head=`<div class="oq-toolbar cut-toolbar">${plan?`<b data-cut-stats>${plan.stats.sheets} sheet${plan.stats.sheets===1?'':'s'} · ${plan.stats.placed} / ${plan.stats.total} pcs · used ${plan.stats.usedPct}%</b>`:'<b data-cut-stats>Not optimized</b>'}
  <span class="sp"></span>${plan?`<button type="button" data-cut-print onclick="cutPrintLayouts('${esc(b.number)}')">Print layouts</button>`:''}
  <button type="button" class="pri" data-cut-run onclick="cutRunBatch('${esc(b.number)}')">${plan?'Re-optimize':'Optimize'}</button></div>`;
 /* Про пустой размер листа говорит жёлтый блок с полями — красная строка
    над ним повторяла бы то же самое. */
 const need=cutNeedSizes(b,plan),own=cutNotice&&!(need&&/^No sheet size/.test(cutNotice));
 const notice=own?`<div class="ncr-error" role="alert" data-cut-error>${esc(cutNotice)}</div>`:stale?'<div class="ncr-warning" data-cut-stale>⚠ Batch changed after the layout — re-optimize.</div>':'';
 if(!plan)return `${head}${notice}${need}<p class="mut cut-empty">Optimize lays this batch on sheets: one glass, orders mixed, rectangles cut edge to edge. Sheet sizes: glass supply rows and Master Data → Cutting.</p>`;
 const pieces=cutPieces(b,plan.settings||{}),group=plan.groups.find(g=>g.glass===s.glass)||plan.groups[0];
 const sheet=group&&(group.sheets.find(x=>x.no===s.sheet)||group.sheets[0]);
 const at=id=>cutFind(plan,id);
 const placed=new Set();plan.groups.forEach(g=>g.sheets.forEach(x=>x.pieces.forEach(p=>placed.add(p.piece))));
 const waiting=pieces.filter(p=>!p.off&&!placed.has(p.piece)),onSheet=pieces.filter(p=>placed.has(p.piece)),off=pieces.filter(p=>p.off);
 const rows=list=>list.map(p=>cutPieceRow(p,at(p.piece),s.sel===p.piece)).join('');
 const listTable=body=>`<table class="sl-table cut-list"><thead><tr><th></th><th>Glass ID</th><th>Cut size</th><th>Order</th><th>Customer</th><th class="n">Pri</th><th class="n">Sheet</th></tr></thead><tbody>${body}</tbody></table>`;
 const selAt=s.sel?at(s.sel):null,selSrc=pieces.find(p=>p.piece===s.sel);
 const actions=selSrc?`<div class="cut-actions" data-cut-actions><b>${esc(selSrc.piece)}</b><span class="mut">${esc(frac16(selSrc.w))} × ${esc(frac16(selSrc.h))}″ · ${esc(selSrc.order)} / ${selSrc.line}</span><span class="sp"></span>
  <button type="button" data-cut-rotate ${selAt?'':'disabled'} onclick="cutUiRotate()">Rotate</button>
  <button type="button" data-cut-take ${selAt?'':'disabled'} onclick="cutUiTake()">Take off</button>
  <button type="button" class="${selAt&&selAt.piece.locked?'on':''}" data-cut-lock ${selAt?'':'disabled'} onclick="cutUiLock()">${selAt&&selAt.piece.locked?'Unlock':'Lock'}</button></div>`:'';
 /* До восьми листов — вкладки; дальше стрелки и выбор: батч бывает на
    десятки листов, и вкладками его не пролистать. */
 const many=group&&group.sheets.length>8;
 const tabs=!group?'':many
  ?`<div class="cut-nav"><button type="button" data-cut-prev ${sheet.no<=group.sheets[0].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',-1)">‹</button>
    <select data-cut-jump onchange="cutUiSheet('${esc(group.glass)}',this.value)">${group.sheets.map(x=>`<option value="${x.no}" ${x.no===sheet.no?'selected':''}>Sheet ${x.no}${x.locked?' · locked':''} · ${x.pieces.length} pcs · net ${x.net} ft²</option>`).join('')}</select>
    <button type="button" data-cut-next ${sheet.no>=group.sheets[group.sheets.length-1].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',1)">›</button>
    <span class="mut">${sheet.no} / ${group.sheets.length}</span></div>`
  :group.sheets.map(x=>`<button type="button" class="${x.no===sheet.no?'on':''}" data-cut-tab="${x.no}" ondragover="event.preventDefault()" ondrop="cutUiTabDrop(event,'${esc(group.glass)}',${x.no})" onclick="cutUiSheet('${esc(group.glass)}',${x.no})">Sheet ${x.no}${x.locked?' 🔒':''}<small>${x.pieces.length} pcs · net ${x.net} ft²${(x.stock||[]).length?' · stock '+x.stock.length:''}</small></button>`).join('');
 const glasses=plan.groups.length>1?`<div class="stk-seg cut-glass">${plan.groups.map(g=>`<button type="button" class="${g.glass===group.glass?'on':''}" data-cut-glass="${esc(g.glass)}" onclick="cutUiSheet('${esc(g.glass)}',1)">${esc(g.glass)} · ${g.mm} mm</button>`).join('')}</div>`:'';
 /* Все переменные правятся здесь же: склад листов прогона и параметры реза.
    Master Data остаётся значением по умолчанию. */
 const pick=group&&plan.sheetPick&&plan.sheetPick[group.glass]||{},stock=group?cutStockFor(group.glass,pick):[];
 const allSizes=group?cutSheetOptions(group.glass):[];
 const num=(label,field,value,ph)=>`<label>${label} <input type="text" data-cut-param="${field}" value="${esc(value)}" ${ph?'placeholder="'+ph+'"':''} onchange="cutUiParam('${esc(group.glass)}','${field}',this.value)"></label>`;
 /* У каждого размера свои Trim и Border — прямо в строке размера. */
 const stockRows=allSizes.map(x=>{const key=cutSheetKey(x),row=stock.find(r=>r.key===key),on=!!row,used=group.sheets.filter(sh=>(sh.size||group.sheet).key===key||cutSheetKey(sh.size||group.sheet)===key).length;
  const pr=cutGroupParams(group,{key,w:x.w,h:x.h});
  const edge=(f,label)=>`<td><input type="text" data-cut-edge-${f.toLowerCase()} value="${esc(frac16(pr[f]))}" aria-label="${label} ${esc(key)}" onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','${f}',this.value)"></td>`;
  return `<tr class="cut-stock-row${on?'':' off'}" data-cut-stock="${esc(key)}">
   <td><label class="chk"><input type="checkbox" data-cut-use ${on?'checked':''} onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','off',!this.checked)"> ${esc(frac16(x.w))} × ${esc(frac16(x.h))}″</label></td>
   <td><input type="number" min="0" step="1" data-cut-qty value="${row&&row.limit?row.limit:''}" placeholder="all" aria-label="Sheets available ${esc(key)}" onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','limit',this.value)"></td>
   ${edge('trimX','Trim X')}${edge('trimY','Trim Y')}${edge('borderX','Border X')}${edge('borderY','Border Y')}
   <td class="mut">${used?'used '+used:''}</td>
   <td><button type="button" class="gb-link" data-cut-first onclick="cutUiStock('${esc(group.glass)}','${esc(key)}','first',1)">use first</button></td></tr>`;}).join('');
 const params=group?`<div class="cut-params" data-cut-params>
  <table class="cut-stock"><thead><tr><th>Sheets</th><th>Qty</th><th>Trim X <small>bottom</small></th><th>Trim Y <small>left</small></th><th>Border X <small>top</small></th><th>Border Y <small>right</small></th><th></th><th></th></tr></thead><tbody>${stockRows}
   <tr class="cut-stock-add"><td colspan="8"><input type="text" id="cutRunSizeW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="cutRunSizeH" placeholder="width" aria-label="Sheet width, in">
    <button type="button" class="gb-link" data-cut-size-new onclick="cutUiAddSize('${esc(b.number)}','cutRunSizeW','cutRunSizeH')">+ Add sheet size</button></td></tr></tbody></table>
  <div class="cut-knobs">
   ${num('Min dist','minDist',frac16(group.params.minDist))}
   ${num('Min offcut W','minOffcutW',frac16(group.params.minOffcutW))}${num('H','minOffcutH',frac16(group.params.minOffcutH))}
   <label class="chk"><input type="checkbox" data-cut-rot ${group.params.rotate?'checked':''} onchange="cutUiParam('${esc(group.glass)}','rotate',this.checked)"> Rotate</label>
   <button type="button" class="gb-link" data-cut-reset-params onclick="cutUiResetParams('${esc(group.glass)}')">Reset to Master Data</button></div></div>`:'';
 /* Остатки внизу: подсказки (в сток — кнопкой или Split) и то, что уже в
    стоке, с номером и стикером. Не взятое — отход. */
 const hints=plan.groups.flatMap(g=>g.sheets.flatMap(x=>(x.offcuts||[]).map((o,i)=>({g,x,o,i}))));
 const booked=plan.groups.flatMap(g=>g.sheets.flatMap(x=>(x.stock||[]).map(o=>({g,x,o}))));
 const sizeOf=o=>esc(frac16(o.w))+' × '+esc(frac16(o.h))+'″';
 const hintRows=hints.map(({g,x,o,i})=>`<tr data-cut-hint-row="${x.no}-${i}"><td><button type="button" class="gb-link" onclick="cutUiSheet('${esc(g.glass)}',${x.no})">Sheet ${x.no}</button></td><td>${esc(g.glass)} · ${g.mm} mm</td><td><b>${sizeOf(o)}</b></td><td class="n">${cutFt2(cutArea(o.w,o.h))}</td><td class="mut">Waste</td>
  <td class="cut-offcut-acts"><button type="button" data-cut-stock-take onclick="cutUiStockTake('${esc(g.glass)}',${x.no},${i})">To stock</button>
   <input type="text" id="cutSp${x.no}_${i}w" placeholder="length" aria-label="Split length"> × <input type="text" id="cutSp${x.no}_${i}h" placeholder="width" aria-label="Split width">
   <button type="button" data-cut-stock-split onclick="cutUiStockSplit('${esc(g.glass)}',${x.no},${i},'cutSp${x.no}_${i}w','cutSp${x.no}_${i}h')">Split</button></td></tr>`).join('');
 const bookRows=booked.map(({g,x,o})=>`<tr data-cut-stock-row="${esc(o.id)}"><td><button type="button" class="gb-link" onclick="cutUiSheet('${esc(g.glass)}',${x.no})">Sheet ${x.no}</button></td><td>${esc(g.glass)} · ${g.mm} mm</td><td><b>${sizeOf(o)}</b></td><td class="n">${cutFt2(cutArea(o.w,o.h))}</td><td><span class="pill ok">${esc(o.id)}</span></td>
  <td class="cut-offcut-acts"><button type="button" data-cut-stock-print onclick="cutUiStockPrint(['${esc(o.id)}'])">Print sticker</button><button type="button" class="gb-link" data-cut-stock-cancel onclick="cutUiStockCancel('${esc(o.id)}')">Back to waste</button></td></tr>`).join('');
 const stockList=hints.length||booked.length?`<div class="cut-orders" data-cut-offcuts><div class="cut-offcuts-head"><h4>Offcuts · ${booked.length} in stock · ${hints.length} possible</h4>${booked.length?`<button type="button" data-cut-stock-print-all onclick="cutUiStockPrint(${esc(JSON.stringify(booked.map(b=>b.o.id)))})">Print stock stickers · ${booked.length}</button>`:''}</div>
  <p class="mut">Not taken — waste.</p><table class="sl-table"><thead><tr><th>Sheet</th><th>Glass</th><th>Size</th><th class="n">ft²</th><th>Stock</th><th></th></tr></thead><tbody>${bookRows}${hintRows}</tbody></table></div>`:'';
 const orders=(plan.orders||[]).length?`<div class="cut-orders" data-cut-orders><h4>Waste by order</h4><table class="sl-table"><thead><tr><th>Order</th><th>Customer</th><th class="n">Pcs</th><th class="n">Glass ft²</th><th class="n">Net scrap ft²</th><th class="n">%</th></tr></thead><tbody>${plan.orders.map(o=>`<tr><td>${esc(o.order)}</td><td>${esc(o.customer)}</td><td class="n">${o.pieces}</td><td class="n">${o.used}</td><td class="n">${o.net}</td><td class="n">${o.pct}%</td></tr>`).join('')}</tbody></table></div>`:'';
 return `${head}${notice}${need}${params}<div class="cut-stats">${cutStatsBar(plan,sheet)}</div>
 <div class="cut-grid">
  <div class="cut-side" ondragover="event.preventDefault()" ondrop="cutUiDropList(event)">
   ${waiting.length?`<div class="cut-list-head" data-cut-waiting>Not on a sheet · ${waiting.length}</div>${listTable(rows(waiting))}`:''}
   <div class="cut-list-head">On sheets · ${onSheet.length}</div>${listTable(rows(onSheet))}
   ${off.length?`<div class="cut-list-head" data-cut-off>Not cutting · ${off.length}</div>${listTable(rows(off))}`:''}
  </div>
  <div class="cut-sheet-pane">${glasses}<div class="cut-tabs">${tabs}</div>
   ${sheet?`<div class="cut-sheet-head"><b>Sheet ${sheet.no}</b><span class="mut">${esc(frac16((sheet.size||group.sheet).w))} × ${esc(frac16((sheet.size||group.sheet).h))}″ · ${sheet.pieces.length} pcs · used ${sheet.used} ft² · net ${sheet.net} ft²</span><span class="sp"></span>
    <button type="button" class="${sheet.locked?'on':''}" data-cut-sheet-lock onclick="cutUiSheetLock()">${sheet.locked?'Unlock sheet':'Lock sheet'}</button></div>
   <div class="cut-paper" data-cut-sheet="${sheet.no}" ondragover="cutUiDragOver(event,'${esc(group.glass)}',${sheet.no})" ondragleave="cutUiDragLeave(event)" ondrop="cutUiDrop(event,'${esc(group.glass)}',${sheet.no})" onpointerdown="cutUiDown(event,'${esc(group.glass)}',${sheet.no})" oncontextmenu="cutUiMenu(event,'${esc(group.glass)}',${sheet.no})" onpointerover="cutUiOver(event)" onpointerleave="cutUiHover('')">${cutSheetSVG(group,sheet,520,pieces,{sel:s.sel,ids:true})}</div>`:'<p class="mut">No sheets.</p>'}
   ${actions}<p class="mut cut-hint">Drag glass on the sheet, to a sheet tab or to the list · double-click or R — rotate · right-click — menu</p>
  </div>
 </div>${stockList}${orders}`;
}
