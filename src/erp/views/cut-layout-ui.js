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
let cutNotice='',cutInfo=null,cutMdNotice='',cutUi={batch:'',glass:'',sheet:1,sel:'',drag:''};
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
  <div class="cut-md-head"><div><h3>Cutting parameters</h3><p class="mut">Trim — bottom and left sheet edge. Border — top and right. Min distance — around shaped pieces only. Small number — shop minimum. An offcut counts when it is at least Min offcut W × H, or at least the ft² next to them.</p></div>
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
   <label><span class="ncr-label">OR FT²</span><input type="text" data-cut-offcut-ft2 value="${esc(frac16(s.minOffcutFt2))}" onchange="cutMdSetting('minOffcutFt2',this.value)"></label>
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
/* Build идёт по кусочкам: между кусками экран успевает нарисовать полоску
   хода; Cancel останавливает, и раскрой остаётся каким был — в базу пишется
   только в конце. Пока идёт Build, экран раскроя закрыт. */
let cutBusy=null,cutWhat=null;
function cutBuildDone(){return cutBusy?cutBusy.promise:Promise.resolve(null);}
/* Долгий счёт кусками: между кусками экран рисует полоску. */
function cutUiSteps(number,it,label,done){
 if(cutBusy)return cutBusy.promise;
 const job={batch:number,pct:0,stop:false,label};
 job.promise=new Promise(resolve=>{
  const finish=r=>{cutBusy=null;done(r);render();resolve(r);};
  const tick=()=>{
   if(job.stop)return finish({cancelled:true});
   const t0=Date.now();let r;
   try{do{r=it.next();if(!r.done)job.pct=r.value;}while(!r.done&&Date.now()-t0<40);}
   catch(e){return finish({error:e&&e.message||label+' failed.'});}
   if(r.done)return finish(r.value);
   cutUiProgress();setTimeout(tick,0);
  };
  /* Сначала экран с полоской, потом счёт. */
  setTimeout(tick,30);
 });
 cutBusy=job;cutNotice='';render();
 return job.promise;
}
function cutUiBuild(number){
 cutInfo=null;cutWhat=null;
 return cutUiSteps(number,cutPlanSteps(number),'Building',r=>{
  cutNotice=r&&r.error||'';
  if(r&&r.plan&&cutUi.batch===number){cutUi.sheet=1;cutUi.sel='';}
 });
}
/* «А что если»: несколько прикидок подряд, ничего не меняется — только цифры. */
function cutUiWhatIf(number){
 cutWhat=null;
 return cutUiSteps(number,cutWhatIfSteps(number),'What if',r=>{
  cutNotice=r&&r.error||'';cutWhat=r&&r.rows?{batch:number,rows:r.rows}:null;
 });
}
function cutUiWhatClose(){cutWhat=null;render();}
/* Принять прикидку: сброс с новыми параметрами и сразу Build. */
function cutUiWhatUse(number,key,label){
 const row=cutWhat&&cutWhat.rows.find(x=>x.key===key);
 if(!confirm('Reset the optimization and build with «'+(label||key)+'»?'))return;
 const r=cutWhatIfApply(number,key);if(r.error){cutNotice=r.error;render();return;}
 cutUiBuild(number);
}
function cutUiProgress(){
 const job=cutBusy;if(!job)return;
 const pct=Math.min(99,Math.round(job.pct*100)),bar=document.querySelector('[data-cut-progress]'),txt=document.querySelector('[data-cut-progress-pct]');
 if(bar){bar.setAttribute('aria-valuenow',pct);const i=bar.querySelector('i');if(i)i.style.width=pct+'%';}
 if(txt)txt.textContent=job.label+' · '+pct+'%';
}
function cutUiCancel(){if(cutBusy)cutBusy.stop=true;}
/* Reset — листов раскладки больше нет, параметры открыты. Заблокированные
   листы остаются. */
function cutUiReset(number){
 const plan=cutPlanFor(number);if(!plan||plan.reset||cutBusy)return;
 const st=plan.groups.flatMap(g=>g.sheets.filter(x=>!x.locked).flatMap(x=>(x.stock||[]).map(o=>o.id)));
 const kept=plan.groups.reduce((n,g)=>n+g.sheets.filter(x=>x.locked).length,0);
 if(!confirm('Reset the optimization? Sheets are cleared'+(kept?', '+kept+' locked sheet'+(kept>1?'s stay':' stays'):'')+'.'+(st.length?' Stock '+st.join(', ')+' goes back to waste.':'')))return;
 const r=cutPlanReset(number);cutNotice=r.error||'';cutInfo=null;cutWhat=null;cutUi.sheet=1;cutUi.sel='';render();
}
/* Размер листа прямо с экрана оптимизации: уходит в размеры цеха (Master
   Data → Cutting). Из блока «No sheet size» — сразу Build; из таблицы
   SHEETS — в параметры сброшенного раскроя. */
function cutUiAddSize(number,wId,hId,build){
 const w=document.getElementById(wId),h=document.getElementById(hId);
 const plan=cutPlanFor(number),built=plan&&!plan.reset;
 if(build&&built&&!confirm('Reset the optimization and build again?'))return;
 const r=cutShopSizeAdd(w?w.value:'',h?h.value:'');
 if(r.error){cutNotice=r.error;render();return;}
 if(build)return cutUiBuild(number);
 const d=cutPlanEditable(number);if(!d.error)cutPlanRedraft(number);cutNotice=d.error||'';render();
}
/* Стёкла батча, для которых не нашлось ни одного размера листа. */
function cutNeedSizes(b,plan,pieces){
 const pick=g=>plan&&plan.sheetPick&&plan.sheetPick[g]||null;
 const need=[...new Set((pieces||cutPieces(b,plan&&plan.settings||{})).filter(p=>!p.off).map(p=>p.glass))].filter(g=>!cutStockFor(g,pick(g)).length).sort();
 if(!need.length)return '';
 return `<div class="cut-need" data-cut-need><span><b>No sheet size</b> · ${esc(need.join(', '))}</span>
  <input type="text" id="cutNeedW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="cutNeedH" placeholder="width" aria-label="Sheet width, in">
  <button type="button" class="pri" data-cut-need-add onclick="cutUiAddSize('${esc(b.number)}','cutNeedW','cutNeedH',true)">Add and build</button>
  <span class="mut">Saved to Master Data → Cutting</span></div>`;
}
function cutUiPick(pieceId){cutUi.sel=cutUi.sel===pieceId?'':pieceId;const at=cutUi.sel&&cutFind(cutPlanFor(cutUi.batch)||{groups:[]},cutUi.sel);if(at){cutUi.glass=at.group.glass;cutUi.sheet=at.sheet.no;}render();}
function cutUiSheet(glass,no){cutUi.glass=glass;cutUi.sheet=+no;render();cutUiStripShow();}
function cutUiStripShow(){const el=document.querySelector('[data-cut-strip] .on');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest',inline:'nearest'});}
function cutUiStep(glass,delta){
 const plan=cutPlanFor(cutUi.batch),g=plan&&plan.groups.find(x=>x.glass===glass);if(!g)return;
 const i=g.sheets.findIndex(x=>x.no===cutUi.sheet),next=g.sheets[Math.min(g.sheets.length-1,Math.max(0,i+delta))];
 if(next)cutUiSheet(glass,next.no);
}
function cutUiRun(fn){const r=fn();cutNotice=r&&r.error||'';cutInfo=null;render();}
/* Лист не режем — стёкла в новый батч. Решает человек, поэтому спрашиваем. */
function cutUiMoveSheet(glass,no,target){
 const at=cutSheetAt(cutUi.batch,glass,no);if(!at)return;
 if(!confirm('Move the '+at.s.pieces.length+' glass of sheet '+no+' to '+(target||'a new batch')+'? This sheet will not be cut in '+cutUi.batch+'.'))return;
 const r=cutMoveSheet(cutUi.batch,glass,no,target||'');cutNotice=r.error||'';
 cutInfo=r.ok?{text:'Sheet '+no+' · '+r.pieces+' glass → '+r.number+(r.added?' · sheet '+r.sheet:''),batch:r.number}:null;
 if(r.ok){cutUi.sheet=1;cutUi.sel='';}render();
}
/* Куда перенести лист: новый батч или открытый батч с тем же стеклом. */
function cutMoveItems(act,glass,no){
 act('Move sheet → new batch','',()=>cutUiMoveSheet(glass,no,''),'data-cut-menu="move-new"');
 cutMoveTargets(cutUi.batch,glass).slice(0,8).forEach(t=>act('Move sheet → '+t.number+' · '+t.pieces+' glass','',()=>cutUiMoveSheet(glass,no,t.number),'data-cut-menu-move="'+esc(t.number)+'"'));
}
function cutUiMoveMenu(e,glass,no){
 e.preventDefault();e.stopPropagation();cutUiMenuClose();
 const rows=[],act=cutMenuAct(rows);cutMoveItems(act,glass,no);
 const r=e.currentTarget.getBoundingClientRect();cutUiMenuShow(rows,r.left,r.bottom+4);
}
function cutUiSheetDelete(glass,no){
 const at=cutSheetAt(cutUi.batch,glass,no);if(!at)return;
 const n=at.s.pieces.length,st=(at.s.stock||[]).map(x=>x.id);
 if(!confirm('Delete sheet '+no+'?'+(n?' Its '+n+' glass go to "Not on a sheet".':'')+(st.length?' Stock '+st.join(', ')+' goes back to waste.':'')))return;
 cutUi.sel='';cutUiRun(()=>cutSheetDelete(cutUi.batch,glass,no));
 const g=(cutPlanFor(cutUi.batch)||{groups:[]}).groups.find(x=>x.glass===glass);
 if(g){cutUi.sheet=Math.max(1,Math.min(+no,g.sheets.length));render();}
}
/* Лист на весь экран: меню и шапки прячутся, пока открыт раскрой. Отдельная
   вкладка опаснее: данные в одном хранилище браузера, две вкладки затёрли бы
   правки друг друга. */
let cutFull=true;
function cutUiFull(on){cutFull=typeof on==='boolean'?on:!cutFull;document.body.classList.toggle('cut-full',cutFull);render();}
/* Второй лист того же размера — для оверсайза, без Trim и Border. */
function cutUiSameSize(glass,key){cutUiRun(()=>cutAddSameSize(cutUi.batch,glass,key));}
function cutUiSameSizeRemove(glass,key){cutUiRun(()=>cutRemoveSameSize(cutUi.batch,glass,key));}
/* Стекло больше листа: тот же лист без Trim и Border — сброс, строка
   размера и Build одним нажатием. */
function cutUiOverSize(glass,key){
 const n=cutUi.batch,plan=cutPlanFor(n);
 if(plan&&!plan.reset){if(!confirm('Reset the optimization and build again with this sheet?'))return;cutPlanReset(n);}
 const r=cutAddSameSize(n,glass,key);if(r.error){cutNotice=r.error;render();return;}
 cutUiBuild(n);
}
function cutUiOpenBatch(number){cutInfo=null;glassBatchOpen(number);glassBatchDetailTab='optimization';render();}
function cutUiRotate(){cutUiRun(()=>cutPieceRotate(cutUi.batch,cutUi.sel));}
function cutUiTake(){cutUiRun(()=>cutPieceTake(cutUi.batch,cutUi.sel));}
function cutUiLock(){cutUiRun(()=>cutPieceLock(cutUi.batch,cutUi.sel));}
/* Склад листов и параметры — только в сброшенном раскрое; Build — кнопкой. */
function cutUiStock(glass,key,field,value){cutUiRun(()=>cutSetStock(cutUi.batch,glass,key,field,value));}
function cutUiParam(glass,field,value){cutUiRun(()=>cutSetParam(cutUi.batch,glass,field,value));}
function cutUiResetParams(glass){cutUiRun(()=>cutResetParams(cutUi.batch,glass));}
function cutUiSheetLock(){cutUiRun(()=>cutSheetLock(cutUi.batch,cutUi.glass,cutUi.sheet));}
/* Клик по линии реза — перевернуть её; кнопка на листе — сложить лист заново
   сквозными резами. */
function cutUiFlipCut(glass,no,key){cutUiRun(()=>cutFlipCut(cutUi.batch,glass,no,key));}
function cutUiRepack(glass,no){cutUiRun(()=>cutSheetRepack(cutUi.batch,glass,no));}
/* В сток: номер S-… и запись. Стикер не печатается сразу — он идёт вместе со
   стикерами листа (печать «By sheet»); перепечатать — кнопкой в таблице. */
function cutUiStockDone(r){cutNotice=r&&r.error||'';render();}
function cutUiStockTake(glass,no,i){cutUi.glass=glass;cutUi.sheet=+no;cutUiStockDone(cutStockTake(cutUi.batch,glass,no,i));}
function cutUiStockSplit(glass,no,i,axis,inputId){
 const el=document.getElementById(inputId);
 cutUi.glass=glass;cutUi.sheet=+no;cutUiStockDone(cutStockSplit(cutUi.batch,glass,no,i,axis,el?el.value:''));
}
/* Split одним резом: видно, какой кусок уйдёт в сток — вписанная сторона ×
   вторая сторона остатка целиком. */
function cutSplitForm(glass,no,i,o,pre,menu){
 const btn=(axis,id)=>menu?'':`<button type="button" data-cut-split-${axis} onclick="cutUiStockSplit('${esc(glass)}',${no},${i},'${axis}','${id}')">Cut</button>`;
 const L=pre+'L',W=pre+'W';
 return {L,W,html:`<span class="cut-split-row"><input type="text" id="${L}" placeholder="length" aria-label="Length to stock, in" onkeydown="if(event.key==='Enter')cutUiStockSplit('${esc(glass)}',${no},${i},'length','${L}')"> × ${esc(frac16(o.h))}″ ${btn('length',L)}</span>
  <span class="cut-split-row">${esc(frac16(o.w))}″ × <input type="text" id="${W}" placeholder="width" aria-label="Width to stock, in" onkeydown="if(event.key==='Enter')cutUiStockSplit('${esc(glass)}',${no},${i},'width','${W}')"> ${btn('width',W)}</span>`};
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
 /* Линия реза: клик переворачивает её по горизонтали или вертикали. */
 const cl=t.closest&&t.closest('[data-cut-line]');
 if(cl){e.preventDefault();cutUi.glass=glass;cutUi.sheet=+no;cutUiFlipCut(glass,+no,cl.dataset.cutLine);return;}
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
function cutMenuAct(rows){return (label,key,fn,attr)=>{cutMenuActs.push(fn);rows.push(`<button type="button" ${attr||''} onclick="cutUiMenuDo(${cutMenuActs.length-1})"><span>${esc(label)}</span>${key?`<kbd>${key}</kbd>`:''}</button>`);};}
function cutUiMenuShow(rows,x,y){
 const m=document.createElement('div');m.id='cutMenu';m.className='cut-menu';m.setAttribute('role','menu');m.innerHTML=rows.join('');
 document.body.appendChild(m);
 const w=m.offsetWidth,h=m.offsetHeight;
 m.style.left=Math.max(4,Math.min(x,window.innerWidth-w-4))+'px';m.style.top=Math.max(4,Math.min(y,window.innerHeight-h-4))+'px';
}
function cutUiMenu(e,glass,no){
 e.preventDefault();cutUiMenuClose();
 const ctx=cutUiCtx(glass,no);if(!ctx)return;
 const t=e.target,g=t.closest&&t.closest('[data-cut-piece]'),off=t.closest&&t.closest('[data-cut-offcut]'),stk=t.closest&&t.closest('[data-cut-stock]');
 const rows=[],act=cutMenuAct(rows);
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
   /* Один рез: по длине — кусок длиной N на всю ширину остатка; по ширине —
      на всю длину. */
   rows.push(`<div class="cut-menu-sub">Split · one cut to stock</div><div class="cut-menu-split"><input type="text" id="cutSplitL" placeholder="length" aria-label="Length to stock, in" onkeydown="if(event.key==='Enter')document.querySelector('[data-cut-menu=split-length]').click()"> × ${esc(frac16(o.h))}″`);
   act('Cut','',()=>cutUiStockSplit(glass,no,i,'length','cutSplitL'),'data-cut-menu="split-length"');
   rows.push(`</div><div class="cut-menu-split">${esc(frac16(o.w))}″ × <input type="text" id="cutSplitW" placeholder="width" aria-label="Width to stock, in" onkeydown="if(event.key==='Enter')document.querySelector('[data-cut-menu=split-width]').click()">`);
   act('Cut','',()=>cutUiStockSplit(glass,no,i,'width','cutSplitW'),'data-cut-menu="split-width"');
   rows.push('</div>');
  }
 }
 act(ctx.sheet.locked?'Unlock sheet':'Lock sheet','',()=>cutUiSheetLock(),'data-cut-menu="sheet-lock"');
 if(!g&&!off&&!stk){
  if(ctx.sheet.pieces.length)cutMoveItems(act,glass,no);
  act('Delete sheet','',()=>cutUiSheetDelete(glass,no),'data-cut-menu="sheet-delete"');
 }
 cutUiMenuShow(rows,e.clientX,e.clientY);
}
/* Клавиши — пока открыт раскрой и курсор не в поле ввода. */
function cutUiKey(e){
 if(cutBusy||!document.querySelector('[data-cut-sheet]'))return;
 const t=e.target,tag=t&&t.tagName||'';
 if(/^(INPUT|SELECT|TEXTAREA)$/.test(tag)||t&&t.isContentEditable)return;
 if(e.key==='Escape'){if(cutUiMenuClose())return;if(cutUi.sel){cutUi.sel='';render();return;}if(cutFull)cutUiFull(false);return;}
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
/* Поле слева и снизу под подписи осей. 34 — чтобы влезала высота с дробью
   («96 1/4″»): у кусков со стеллажа размеры всегда дробные. */
const CUT_SVG_PAD=34;
/* Подпись в прямоугольнике w × h с центром cx, cy: одна строка, две строки,
   мельче — или поперёк, если кусок узкий и высокий. Ширина текста — по
   средней ширине знака Helvetica. */
function cutFitLabel(cx,cy,w,h,lines,color){
 const tw=(t,f)=>String(t).length*f*0.56,pad=6;
 const draw=(rows,f,rot)=>{const lh=f*1.15,y0=-(rows.length-1)*lh/2+f*0.35;
  return '<g transform="translate('+cx.toFixed(1)+' '+cy.toFixed(1)+')'+(rot?' rotate(-90)':'')+'" pointer-events="none">'+rows.map((t,i)=>'<text x="0" y="'+(y0+i*lh).toFixed(1)+'" text-anchor="middle" font-size="'+f+'" fill="'+color+'">'+esc(t)+'</text>').join('')+'</g>';};
 for(const rot of [false,true]){
  const W=(rot?h:w)-pad,H=(rot?w:h)-4;
  for(const f of [10,9,8,7]){
   const one=lines.join(' · ');
   if(tw(one,f)<=W&&f*1.2<=H)return draw([one],f,rot);
   if(Math.max(...lines.map(t=>tw(t,f)))<=W&&lines.length*f*1.15+2<=H)return draw(lines,f,rot);
  }
 }
 return '';
}
function cutSheetSVG(group,sheet,px,pieces,opts){
 opts=opts||{};
 const size=sheet.size||group.sheet,S=px/Math.max(size.w,size.h),W=size.w*S,H=size.h*S,by=new Map((pieces||[]).map(p=>[p.piece,p]));
 const pr=typeof cutGroupParams==='function'?cutGroupParams(group,size):{},u=cutUsable(size,pr),outside=p=>p.x<u.x0-1e-6||p.y<u.y0-1e-6||p.x+p.w>u.x1+1e-6||p.y+p.h>u.y1+1e-6,edged=u.x0>0||u.y0>0||u.x1<size.w||u.y1<size.h;
 const fy=(y,h)=>(size.h-y-h)*S,pad=CUT_SVG_PAD;
 /* На экране лист тянется на всю ширину колонки; в печати — свой размер. */
 /* Ширину листа на экране ограничивает высота окна: --cut-ar — отношение
    сторон рисунка, по нему CSS считает ширину. Рамка элемента совпадает с
    рисунком, иначе мышь считала бы дюймы неверно. */
 const ar=((W+pad)/(H+pad)).toFixed(3);
 const out=['<svg viewBox="'+(-pad)+' 0 '+(W+pad).toFixed(1)+' '+(H+pad).toFixed(1)+'" '+(opts.ids?'style="--cut-ar:'+ar+'" ':'width="'+(W+pad).toFixed(0)+'" height="'+(H+pad).toFixed(0)+'" ')+'class="cut-svg" data-cut-scale="'+S+'" data-cut-sh="'+size.h+'" font-family="Helvetica, Arial, sans-serif">',
  /* Блик стекла — мягкая диагональ вместо штриховки Perfect Cut. */
  '<defs><linearGradient id="cutGlassSheen" x1="0" y1="0" x2="1" y2="1"><stop class="cut-g1" offset="0"/><stop class="cut-g2" offset="45%"/><stop class="cut-g3" offset="100%"/></linearGradient></defs>',
  '<rect class="'+(edged?'cut-sheet-band':'cut-sheet-free')+'" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'"/>'];
 if(edged)out.push('<rect class="cut-sheet-free" x="'+(u.x0*S).toFixed(1)+'" y="'+fy(u.y0,u.H).toFixed(1)+'" width="'+(u.W*S).toFixed(1)+'" height="'+(u.H*S).toFixed(1)+'"/>');
 /* Остатки: подсказка серым — это отход, пока его не взяли; забуканный в сток
    кусок — зелёный с номером S-…. Правая кнопка по ним — To stock, Split. */
 /* Подпись куска влезает в кусок: одна строка, иначе две, иначе мельче,
    а у узкого высокого куска — вдоль длинной стороны. Раньше строка
    «S-0000001 · 29 1/16 × 45 1/4″» вылезала за кусок и её обрезало. */
 const labels=[];
 const block=(o,cls,attr,lines,color)=>{const oy=fy(o.y,o.h);
  out.push('<g '+attr+'><rect class="'+cls+'" x="'+(o.x*S).toFixed(1)+'" y="'+oy.toFixed(1)+'" width="'+(o.w*S).toFixed(1)+'" height="'+(o.h*S).toFixed(1)+'"/></g>');
  labels.push(cutFitLabel((o.x+o.w/2)*S,oy+o.h*S/2,o.w*S,o.h*S,lines,color));};
 (sheet.offcuts||[]).forEach((o,i)=>block(o,'cut-off','data-cut-offcut="'+i+'"',['Offcut',frac16(o.w)+' × '+frac16(o.h)+'″'],'#98a2b3'));
 (sheet.stock||[]).forEach(o=>block(o,'cut-stk','data-cut-stock="'+esc(o.id)+'"',[o.id,frac16(o.w)+' × '+frac16(o.h)+'″'],'#067647'));
 sheet.pieces.forEach((p,i)=>{
  const x=p.x*S,y=fy(p.y,p.h),w=p.w*S,h=p.h*S,src=by.get(p.piece)||{},sel=opts.sel===p.piece;
  /* Стекло — группа: прямоугольник и подписи ловят мышь вместе. */
  out.push(opts.ids?'<g data-cut-piece="'+esc(p.piece)+'" class="cut-pc'+(sel?' sel':'')+(p.locked?' locked':'')+'">':'<g>');
  out.push('<rect class="cut-glass" rx="1.5" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'"'+(outside(p)?' data-cut-out':'')+'/>');
  /* Полная подпись — клиент, заказ, номер, размер; у узкого высокого стекла
     она идёт вдоль длинной стороны, как у Perfect Cut. Раньше строка
     «1 · 20 1/4 × 100 1/4″» на узком стекле налезала на соседей. */
  const size16=frac16(p.w)+' × '+frac16(p.h)+'″'+(p.rot?' ⟲':''),turn=!(h>52&&w>84)&&w>52&&h>84;
  if(h>52&&w>84||turn){
   const lines=[[src.customer||'',9,'#475467'],[(src.order?src.order+' / '+src.line:''),10,'#101828'],[String(i+1),15,'#101828'],[size16,9,'#475467']];
   const total=lines.reduce((a,l)=>a+l[1]*1.25,0);let ty2=-total/2;
   out.push('<g transform="translate('+(x+w/2).toFixed(1)+' '+(y+h/2).toFixed(1)+')'+(turn?' rotate(-90)':'')+'">');
   lines.forEach(l=>{ty2+=l[1]*1.15;if(l[0])out.push('<text x="0" y="'+ty2.toFixed(1)+'" text-anchor="middle" font-size="'+l[1]+'" fill="'+l[2]+'">'+esc(l[0])+'</text>');});
   out.push('</g>');
  }else out.push(cutFitLabel(x+w/2,y+h/2,w,h,[String(i+1),size16],'#101828')||cutFitLabel(x+w/2,y+h/2,w,h,[String(i+1)],'#101828'));
  if(p.locked&&w>20&&h>20)out.push('<text x="'+(x+w-4).toFixed(1)+'" y="'+(y+11).toFixed(1)+'" text-anchor="end" font-size="9" fill="#93370d">lock</text>');
  out.push('</g>');
  /* У выбранного стекла — кнопка поворота в углу, левой кнопкой мыши. */
  if(sel&&opts.ids&&!p.locked&&w>30&&h>30)out.push('<g data-cut-rot-handle="'+esc(p.piece)+'" class="cut-rot"><title>Rotate (R)</title><circle cx="'+(x+w-11).toFixed(1)+'" cy="'+(y+11).toFixed(1)+'" r="8" fill="#1f6f9f"/><text x="'+(x+w-11).toFixed(1)+'" y="'+(y+15).toFixed(1)+'" text-anchor="middle" font-size="11" fill="#ffffff">⟲</text></g>');
 });
 out.push(labels.join(''));
 /* Резы стола: ступень 1 — через всё поле, дальше мельче. По линии можно
    кликнуть и перевернуть её (cutFlipCut). */
 const cuts=typeof cutSheetCuts==='function'?cutSheetCuts(sheet,size,pr,sheet.flip):{lines:[],stuck:[]};
 cuts.lines.forEach(c=>{
  /* Первый рез идёт через весь лист — лезвие не останавливается на поле;
     дальше резы живут внутри своей полосы. */
  const full=c.level===1;
  const a=c.axis==='x'?[c.at*S,full?0:fy(c.y1,0),c.at*S,full?H:fy(c.y0,0)]:[full?0:c.x0*S,fy(c.at,0),full?W:c.x1*S,fy(c.at,0)];
  const seg=(cls,extra)=>'<line class="'+cls+'" x1="'+a[0].toFixed(1)+'" y1="'+a[1].toFixed(1)+'" x2="'+a[2].toFixed(1)+'" y2="'+a[3].toFixed(1)+'"'+(extra||'')+'/>';
  /* Кликается только сквозной рез: у него и выбирают направление, а тонкую
     линию у края стекла мышь перехватывала бы при захвате. */
  const pick=opts.ids&&full;
  out.push('<g class="cut-cut cut-cut'+Math.min(c.level,3)+'"'+(pick?' data-cut-line="'+esc(c.key)+'"><title>Through cut · click to turn</title>':'>')
   +(pick?seg('cut-cut-hit'):'')+seg('cut-cut-line')+'</g>');
 });
 /* Область, которую сквозными резами не взять: обводим и говорим в шапке. */
 (cuts.stuck||[]).forEach(r=>out.push('<rect class="cut-stuck" data-cut-stuck x="'+(r.x0*S).toFixed(1)+'" y="'+fy(r.y1,0).toFixed(1)+'" width="'+((r.x1-r.x0)*S).toFixed(1)+'" height="'+((r.y1-r.y0)*S).toFixed(1)+'"/>'));
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
/* Цифры раскроя — одна иерархия: одна главная цифра на уровень (Used %),
   остальное мелко одной строкой. Весь батч — в строке кнопок, этот лист — в
   шапке листа. «Цифры над оптимизацией сделай корректнее — они выглядят как
   хаос» (владелец, 18 сентября 2026): было две карточки по 4–9 цифр, Scrap и
   Net почти всегда одинаковые, процент листа повторялся в шапке. */
function cutNum(v,d){return (+v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});}
/* Плитка: крупное значение сверху, подпись мелко снизу. Все цифры на месте —
   «количество данных было нормально, отображение некрасивое, друг на друге»
   (владелец, 18 сентября 2026). */
/* Все плитки одного размера; различие только цветом: использование — зелёное,
   отход — красный («не нужно играть с высотой шрифтов» — владелец). */
function cutTile(label,value,kind,main){return `<div class="cut-tile${kind?' cut-'+kind:''}"${main?' data-cut-used-pct':''}><b>${value}</b><small>${label}</small></div>`;}
function cutSumTotal(plan){
 const s=plan.stats,n=plan.groups.reduce((a,g)=>a+g.sheets.reduce((b,x)=>b+(x.stock||[]).length,0),0);
 return `<div class="cut-tiles" data-cut-total><span class="cut-tiles-cap">All sheets</span>
  ${cutTile('Used %',cutNum(s.usedPct,1)+'%','use',1)}${cutTile('Used',cutNum(s.used,1)+' ft²','use')}${cutTile('Scrap',cutNum(s.gross,1)+' ft²','waste')}${cutTile('Net',cutNum(s.net,1)+' ft²','waste')}${cutTile('Net %',cutNum(s.netPct,1)+'%','waste')}
  <span class="cut-tiles-gap"></span>${cutTile('Sheets',s.sheets)}${cutTile('Pieces',s.placed+' / '+s.total)}${cutTile('To stock',n?n+' · '+cutNum(s.keep,1)+' ft²':'0')}</div>`;
}
function cutSumSheet(group,sheet){
 const z=sheet.size||group.sheet,area=cutArea(z.w,z.h),id=/^S-/.test(z.key||'')?z.key:'';
 return `<span class="cut-sheet-size">${id?`<span class="pill ok">${esc(id)}</span> `:''}${esc(frac16(z.w))} × ${esc(frac16(z.h))}″ · ${sheet.pieces.length} glass${(sheet.stock||[]).length?' · stock '+sheet.stock.length:''}</span>
  <div class="cut-tiles cut-tiles-sheet" data-cut-current>${cutTile('Used %',cutNum(cutPct(sheet.used,area),1)+'%','use',1)}${cutTile('Used',cutNum(sheet.used,1)+' ft²','use')}${cutTile('Scrap',cutNum(sheet.gross,1)+' ft²','waste')}${cutTile('Net',cutNum(sheet.net,1)+' ft²','waste')}</div>`;
}
function cutPieceRow(p,at,sel,lock){
 const place=at?at.sheet.no+' · '+(at.index+1):'—';
 return `<tr data-cut-list="${esc(p.piece)}" class="${sel?'on':''}${p.off?' off':''}" draggable="true" ondragstart="cutUiDragStart(event,'${esc(p.piece)}')" onclick="cutUiPick('${esc(p.piece)}')" onmouseenter="cutUiHover('${esc(p.piece)}')" onmouseleave="cutUiHover('')">
  <td><input type="checkbox" data-cut-on ${p.off?'':'checked'} ${lock?'disabled':''} aria-label="Cut ${esc(p.piece)}" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','off',!this.checked)"></td>
  <td class="gb-piece">${esc(p.piece)}</td><td class="nowrap">${esc(frac16(p.w))} × ${esc(frac16(p.h))}″${p.shape?' <span class="pill">shape</span>':''}</td>
  <td><button type="button" class="gb-link" data-cut-open="${esc(p.orderId)}" title="Open the order and its shape" onclick="event.stopPropagation();optimizationOpenOrder('${esc(p.orderId)}')">${esc(p.order)} / ${p.line}</button>${p.mark?' · '+esc(p.mark):''}</td><td>${esc(p.customer)}</td>
  <td class="n"><input type="number" min="0" max="10" step="1" data-cut-priority value="${p.priority||''}" placeholder="—" ${lock?'disabled':''} aria-label="Priority, 1 is the most urgent" onclick="event.stopPropagation()" onchange="cutUiSet('${esc(p.piece)}','priority',this.value||0)"></td>
  <td class="n">${place}</td></tr>`;
}
/* Прикидки «а что если»: только цифры, ничего не меняется. Use — сброс с
   этими параметрами и Build. */
function cutWhatTable(number,busy){
 if(busy||!cutWhat||cutWhat.batch!==number)return '';
 const sign=v=>v<-1e-9?`<b class="cut-win">−${cutNum(-v,1)} ft²</b>`:v>1e-9?`<span class="mut">+${cutNum(v,1)} ft²</span>`:'<span class="mut">—</span>';
 const rows=cutWhat.rows.map(r=>`<tr class="${r.now?'on':r.sub?'cut-what-sub':''}" data-cut-what-row="${esc(r.key||'now')}"><td>${r.sub?'<span class="mut">└ </span>':''}${esc(r.label)}</td><td class="n">${r.sheets}</td><td class="n">${cutNum(r.area,0)}</td><td class="n">${cutNum(r.used,1)}%</td><td class="n">${r.now?'<span class="mut">now</span>':sign(r.delta)}</td>
  <td>${r.now?'':`<button type="button" class="gb-link" data-cut-what-use="${esc(r.key)}" onclick="cutUiWhatUse('${esc(number)}','${esc(r.key)}','${esc(r.label)}')">Use</button>`}</td></tr>`).join('');
 return `<div class="cut-what" data-cut-what><div class="cut-what-head"><b>What if</b><span class="mut">Numbers only — nothing is changed</span><span class="sp"></span>
  <button type="button" class="gb-link" data-cut-what-close onclick="cutUiWhatClose()">Close</button></div>
  <table class="sl-table"><thead><tr><th>Option</th><th class="n">Sheets</th><th class="n">ft²</th><th class="n">Used</th><th class="n">Difference</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function viewCutLayout(b){
 /* Собранный раскрой — параметры закрыты, правится только раскладка;
    сброшенный (и раскроя ещё нет) — черновик по текущим стёклам батча:
    сначала параметры, потом Build. */
 const s=cutUiState(b.number),stored=cutPlanFor(b.number),built=!!(stored&&!stored.reset);
 const plan=built||stored&&!cutPlanStale(b.number)?stored:cutPlanDraft(b.number);
 const stale=built&&cutPlanStale(b.number),busy=!!(cutBusy&&cutBusy.batch===b.number),lock=built||!!cutBusy;
 const pieces=cutPieces(b,plan.settings||{}),laid=plan.groups.some(g=>g.sheets.length),live=pieces.filter(p=>!p.off).length;
 const pct=busy?Math.min(99,Math.round(cutBusy.pct*100)):0;
 /* Build идёт — полоска хода и Cancel вместо кнопок. */
 const acts=busy?`<div class="cut-progress" data-cut-progress role="progressbar" aria-label="${esc(cutBusy.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><span class="cut-progress-pct" data-cut-progress-pct>${esc(cutBusy.label)} · ${pct}%</span><button type="button" data-cut-cancel onclick="cutUiCancel()">Cancel</button>`
  :`${built?`<button type="button" data-cut-whatif onclick="cutUiWhatIf('${esc(b.number)}')">What if</button><button type="button" data-cut-reset-plan onclick="cutUiReset('${esc(b.number)}')">Reset</button>`:''}<button type="button" class="pri" data-cut-run ${lock?`disabled title="${built?'Reset first':'Building'}"`:''} onclick="cutUiBuild('${esc(b.number)}')">Build</button>`;
 const head=`<div class="oq-toolbar cut-toolbar">${laid?cutSumTotal(plan):`<b data-cut-stats>Not built</b><span class="mut">${live} glass</span>`}
  <span class="sp"></span>${plan.groups.length?`<button type="button" data-cut-full onclick="cutUiFull()">${cutFull?'Exit full screen':'⤢ Full screen'}</button>`:''}${laid?`<button type="button" data-cut-print ${busy?'disabled':''} onclick="cutPrintLayouts('${esc(b.number)}')">Print layouts</button>`:''}
  ${acts}</div>`;
 /* Про пустой размер листа говорит жёлтый блок с полями — красная строка
    над ним повторяла бы то же самое. */
 const need=cutNeedSizes(b,plan,pieces),own=cutNotice&&!(need&&/^No sheet size/.test(cutNotice));
 const info=cutInfo?`<div class="cut-info" data-cut-info>${esc(cutInfo.text)}<button type="button" class="gb-link" data-cut-open-batch onclick="cutUiOpenBatch('${esc(cutInfo.batch)}')">Open ${esc(cutInfo.batch)}</button></div>`:'';
 const notice=(own?`<div class="ncr-error" role="alert" data-cut-error>${esc(cutNotice)}</div>`:stale?'<div class="ncr-warning" data-cut-stale>⚠ Batch changed after the layout — Reset, then Build.</div>':'')+info+cutWhatTable(b.number,busy);
 if(!plan.groups.length)return `${head}${notice}${need}<p class="mut cut-empty">Build lays this batch on sheets: one glass, orders mixed, rectangles cut edge to edge. Sheet sizes: glass supply rows and Master Data → Cutting.</p>`;
 const group=plan.groups.find(g=>g.glass===s.glass)||plan.groups[0];
 const sheet=group&&(group.sheets.find(x=>x.no===s.sheet)||group.sheets[0]);
 const at=id=>cutFind(plan,id);
 const placed=new Set();plan.groups.forEach(g=>g.sheets.forEach(x=>x.pieces.forEach(p=>placed.add(p.piece))));
 const waiting=pieces.filter(p=>!p.off&&!placed.has(p.piece)),onSheet=pieces.filter(p=>placed.has(p.piece)),off=pieces.filter(p=>p.off);
 const rows=list=>list.map(p=>cutPieceRow(p,at(p.piece),s.sel===p.piece,lock)).join('');
 const listTable=body=>`<table class="sl-table cut-list"><thead><tr><th></th><th>Glass ID</th><th>Cut size</th><th>Order</th><th>Customer</th><th class="n">Pri</th><th class="n">Sheet</th></tr></thead><tbody>${body}</tbody></table>`;
 const selAt=s.sel?at(s.sel):null,selSrc=pieces.find(p=>p.piece===s.sel);
 const actions=selSrc?`<div class="cut-actions" data-cut-actions><b>${esc(selSrc.piece)}</b><span class="mut">${esc(frac16(selSrc.w))} × ${esc(frac16(selSrc.h))}″ · ${esc(selSrc.order)} / ${selSrc.line}</span><span class="sp"></span>
  <button type="button" data-cut-rotate ${selAt?'':'disabled'} onclick="cutUiRotate()">Rotate</button>
  <button type="button" data-cut-take ${selAt?'':'disabled'} onclick="cutUiTake()">Take off</button>
  <button type="button" class="${selAt&&selAt.piece.locked?'on':''}" data-cut-lock ${selAt?'':'disabled'} onclick="cutUiLock()">${selAt&&selAt.piece.locked?'Unlock':'Lock'}</button></div>`:'';
 /* До восьми листов — вкладки; дальше стрелки и выбор: батч бывает на
    десятки листов, и вкладками его не пролистать. */
 /* Листы — лента прямо под листом, с прокруткой: номер, штук, Used %.
    На ленту можно бросить стекло — оно переедет на тот лист. */
 const strip=!group||!group.sheets.length?'':`<div class="cut-strip-wrap"><button type="button" class="cut-strip-step" data-cut-prev ${sheet.no<=group.sheets[0].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',-1)" aria-label="Previous sheet">‹</button>
  <div class="cut-strip" data-cut-strip>${group.sheets.map(x=>{const z=x.size||group.sheet;return `<button type="button" class="${x.no===sheet.no?'on':''}" data-cut-tab="${x.no}" ondragover="event.preventDefault()" ondrop="cutUiTabDrop(event,'${esc(group.glass)}',${x.no})" onclick="cutUiSheet('${esc(group.glass)}',${x.no})"><b>${x.no}${x.locked?' 🔒':''}</b><small>${x.pieces.length} pcs · ${cutPct(x.used,cutArea(z.w,z.h))}%${(x.stock||[]).length?' · S'+x.stock.length:''}</small></button>`;}).join('')}</div>
  <button type="button" class="cut-strip-step" data-cut-next ${sheet.no>=group.sheets[group.sheets.length-1].no?'disabled':''} onclick="cutUiStep('${esc(group.glass)}',1)" aria-label="Next sheet">›</button><span class="mut cut-strip-count">${sheet.no} / ${group.sheets.length}</span></div>`;
 const glasses=plan.groups.length>1?`<div class="stk-seg cut-glass">${plan.groups.map(g=>`<button type="button" class="${g.glass===group.glass?'on':''}" data-cut-glass="${esc(g.glass)}" onclick="cutUiSheet('${esc(g.glass)}',1)">${esc(g.glass)} · ${g.mm} mm</button>`).join('')}</div>`:'';
 /* Все переменные правятся здесь же: склад листов прогона и параметры реза.
    Master Data остаётся значением по умолчанию. */
 const pick=group&&plan.sheetPick&&plan.sheetPick[group.glass]||{},stock=group?cutStockFor(group.glass,pick,group.mm,b.number):[];
 const allSizes=group?cutSheetOptions(group.glass):[];
 const dis=lock?'disabled':'';
 /* Минимальный остаток не двигает стёкла — его можно менять и в собранном. */
 const num=(label,field,value,ph)=>`<label>${label} <input type="text" data-cut-param="${field}" value="${esc(value)}" ${ph?'placeholder="'+ph+'"':''} ${cutBusy||built&&!/^minOffcut/.test(field)?'disabled':''} onchange="cutUiParam('${esc(group.glass)}','${field}',this.value)"></label>`;
 /* У каждого размера свои Trim и Border — прямо в строке размера. */
 /* Строки склада: размеры стекла и строки «+ same size» этого прогона. У
    каждой — сколько листов ушло, Used % и отход по листам этого размера:
    «мне нужно видеть % использования и мусора по каждому из добавленных
    типов» (владелец, 18 сентября 2026). Какие размеры брать и сколько
    каждого, решает укладчик: галочка — размер можно брать, Qty — сколько
    листов есть. Кнопки use first больше нет. */
 const variants=(pick.sizes||[]).filter(x=>x&&x.base&&+x.w>0&&+x.h>0).map(x=>({key:x.key,base:x.base,w:+x.w,h:+x.h,supplier:''}));
 /* Куски со стеллажа — в конце таблицы, каждый штучный. Галочка — взять его
    в этот рез; укладчик возьмёт, только если так уйдёт меньше ft². */
 const fromStock=group?cutStockPieces(group.glass,group.mm,b.number):[];
 const rowsAll=allSizes.map(x=>Object.assign({},x,{key:cutSheetKey(x)})).flatMap(x=>[x].concat(variants.filter(v=>v.base===x.key))).concat(fromStock);
 const stockRows=rowsAll.map(x=>{const key=x.key,row=stock.find(r=>r.key===key),on=!!row,mine=group.sheets.filter(sh=>cutSheetKey(sh.size||group.sheet)===key),used=mine.length;
  const pr=cutGroupParams(group,{key,w:x.w,h:x.h}),area=mine.reduce((a,sh)=>a+cutArea(x.w,x.h),0),u=mine.reduce((a,sh)=>a+sh.used,0),net=mine.reduce((a,sh)=>a+sh.net,0);
  const nums=used?`<b>${used}</b> · ${cutPct(u,area)}% used · ${cutPct(net,area)}% waste · ${cutFt2(net)} ft²`:'';
  const edge=(f,label)=>`<td><input type="text" data-cut-edge-${f.toLowerCase()} value="${esc(frac16(pr[f]))}" ${dis} aria-label="${label} ${esc(key)}" onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','${f}',this.value)"></td>`;
  return `<tr class="cut-stock-row${on?'':' off'}" data-cut-stock="${esc(key)}">
   <td><label class="chk"><input type="checkbox" data-cut-use ${on?'checked':''} ${dis} onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','off',!this.checked)"> ${x.stock?`<span class="pill ok">${esc(x.id)}</span> `:''}${esc(frac16(x.w))} × ${esc(frac16(x.h))}″${x.base?' · '+esc(key.split('#')[1]):''}</label>
    <div class="cut-size-nums" data-cut-size-nums="${esc(key)}">${nums}</div></td>
   <td>${x.stock?'<span class="mut">1</span>':`<input type="number" min="0" step="1" data-cut-qty value="${row&&row.limit?row.limit:''}" placeholder="all" ${dis} aria-label="Sheets available ${esc(key)}" onchange="cutUiStock('${esc(group.glass)}','${esc(key)}','limit',this.value)">`}</td>
   ${edge('trimX','Trim X')}${edge('trimY','Trim Y')}${edge('borderX','Border X')}${edge('borderY','Border Y')}${edge('minDist','Min dist')}
   <td class="cut-size-acts">${x.stock?'<span class="mut">from stock</span>':x.base?`<button type="button" class="gb-link dl" data-cut-same-remove="${esc(key)}" ${dis} aria-label="Remove ${esc(key)}" onclick="cutUiSameSizeRemove('${esc(group.glass)}','${esc(key)}')">×</button>`:`<button type="button" class="gb-link" data-cut-same="${esc(key)}" ${dis} title="Same size with its own Trim and Border" onclick="cutUiSameSize('${esc(group.glass)}','${esc(key)}')">+ same size</button>`}</td></tr>`;}).join('');
 const params=group?`<div class="cut-params" data-cut-params>
  <div class="cut-stock-wrap"><table class="cut-stock"><thead><tr><th>Sheets</th><th>Qty</th><th>Trim X <small>bottom</small></th><th>Trim Y <small>left</small></th><th>Border X <small>top</small></th><th>Border Y <small>right</small></th><th>Min dist</th><th></th></tr></thead><tbody>${stockRows}
   ${lock?'':`<tr class="cut-stock-add"><td colspan="8"><input type="text" id="cutRunSizeW" placeholder="length" aria-label="Sheet length, in"> × <input type="text" id="cutRunSizeH" placeholder="width" aria-label="Sheet width, in">
    <button type="button" class="gb-link" data-cut-size-new onclick="cutUiAddSize('${esc(b.number)}','cutRunSizeW','cutRunSizeH')">+ Add sheet size</button></td></tr>`}</tbody></table></div>
  <div class="cut-knobs">
   ${num('Min offcut W','minOffcutW',frac16(group.params.minOffcutW))}${num('H','minOffcutH',frac16(group.params.minOffcutH))}${num('or ft²','minOffcutFt2',frac16(group.params.minOffcutFt2))}
   <label class="chk"><input type="checkbox" data-cut-rot ${group.params.rotate?'checked':''} ${dis} onchange="cutUiParam('${esc(group.glass)}','rotate',this.checked)"> Rotate</label>
   ${lock?'':`<button type="button" class="gb-link" data-cut-reset-params onclick="cutUiResetParams('${esc(group.glass)}')">Reset to Master Data</button>`}
   ${built?'<span class="mut" data-cut-locked>Reset to change</span>':''}</div></div>`:'';
 /* Остатки внизу: подсказки (в сток — кнопкой или Split) и то, что уже в
    стоке, с номером и стикером. Не взятое — отход. */
 const hints=plan.groups.flatMap(g=>g.sheets.flatMap(x=>(x.offcuts||[]).map((o,i)=>({g,x,o,i}))));
 const booked=plan.groups.flatMap(g=>g.sheets.flatMap(x=>(x.stock||[]).map(o=>({g,x,o}))));
 const sizeOf=o=>esc(frac16(o.w))+' × '+esc(frac16(o.h))+'″';
 const hintRowsOf=({g,x,o,i})=>`<tr data-cut-hint-row="${x.no}-${i}"><td><button type="button" class="gb-link" onclick="cutUiSheet('${esc(g.glass)}',${x.no})">Sheet ${x.no}</button></td><td>${esc(g.glass)} · ${g.mm} mm</td><td><b>${sizeOf(o)}</b></td><td class="n">${cutFt2(cutArea(o.w,o.h))}</td><td class="mut">Waste</td>
  <td class="cut-offcut-acts"><button type="button" data-cut-stock-take onclick="cutUiStockTake('${esc(g.glass)}',${x.no},${i})">To stock</button>
   <span class="mut">or split:</span>${cutSplitForm(g.glass,x.no,i,o,'cutSp'+x.no+'_'+i,false).html}</td></tr>`;
 const bookRowsOf=({g,x,o})=>`<tr data-cut-stock-row="${esc(o.id)}"><td><button type="button" class="gb-link" onclick="cutUiSheet('${esc(g.glass)}',${x.no})">Sheet ${x.no}</button></td><td>${esc(g.glass)} · ${g.mm} mm</td><td><b>${sizeOf(o)}</b></td><td class="n">${cutFt2(cutArea(o.w,o.h))}</td><td><span class="pill ok">${esc(o.id)}</span></td>
  <td class="cut-offcut-acts"><button type="button" data-cut-stock-print onclick="cutUiStockPrint(['${esc(o.id)}'])">Print sticker</button><button type="button" class="gb-link" data-cut-stock-cancel onclick="cutUiStockCancel('${esc(o.id)}')">Back to waste</button></td></tr>`;
 /* Крупные сверху; видно первые пять, остальное — прокруткой. */
 const offRows=booked.map(x=>({a:x.o.w*x.o.h,html:bookRowsOf(x)})).concat(hints.map(x=>({a:x.o.w*x.o.h,html:hintRowsOf(x)}))).sort((a,c)=>c.a-a.a).map(x=>x.html).join('');
 const stockList=hints.length||booked.length?`<div class="cut-orders" data-cut-offcuts><div class="cut-offcuts-head"><h4>Offcuts · ${booked.length} in stock · ${hints.length} possible</h4><span class="mut">Not taken — waste · stock stickers print with the sheet</span></div>
  <div class="cut-offcuts-scroll"><table class="sl-table"><thead><tr><th>Sheet</th><th>Glass</th><th>Size</th><th class="n">ft²</th><th>Stock</th><th></th></tr></thead><tbody>${offRows}</tbody></table></div></div>`:'';
 const orders=(plan.orders||[]).length?`<div class="cut-orders" data-cut-orders><h4>Waste by order</h4><table class="sl-table"><thead><tr><th>Order</th><th>Customer</th><th class="n">Pcs</th><th class="n">Glass ft²</th><th class="n">Net scrap ft²</th><th class="n">%</th></tr></thead><tbody>${plan.orders.map(o=>`<tr><td>${esc(o.order)}</td><td>${esc(o.customer)}</td><td class="n">${o.pieces}</td><td class="n">${o.used}</td><td class="n">${o.net}</td><td class="n">${o.pct}%</td></tr>`).join('')}</tbody></table></div>`:'';
 /* Оверсайз: стекло не влезает между линиями ни на один лист — сразу
    предложить тот же лист без Trim и Border. */
 const overIds=new Set((group&&group.unplaced||[]).filter(x=>x.reason==='Larger than the sheet').map(x=>x.piece)),overList=pieces.filter(p=>overIds.has(p.piece));
 let over='';
 if(overList.length){
  const big=overList.slice().sort((a,c)=>c.w*c.h-a.w*a.h)[0],rot=group.params&&group.params.rotate;
  const fitIn=x=>big.w<=x.w+1e-6&&big.h<=x.h+1e-6||rot&&big.h<=x.w+1e-6&&big.w<=x.h+1e-6;
  const size=allSizes.slice().sort((a,c)=>a.w*a.h-c.w*c.h).find(fitIn);
  over=`<div class="cut-need" data-cut-over><span><b>${overList.length} glass larger than the sheet</b> · ${overList.slice(0,4).map(p=>esc(frac16(p.w))+' × '+esc(frac16(p.h))+'″').join(', ')}${overList.length>4?' …':''}</span>
   ${size?`<button type="button" class="pri" data-cut-over-add onclick="cutUiOverSize('${esc(group.glass)}','${esc(cutSheetKey(size))}')">+ ${esc(frac16(size.w))} × ${esc(frac16(size.h))}″ without Trim and Border</button>`:'<span class="mut">Larger than any sheet size.</span>'}</div>`;
 }
 /* Порядок экрана по макету владельца (18 сентября 2026): слева список стёкол
    со своей прокруткой, высотой с правую часть; справа — цифры, лист, лента
    листов и сразу под ней склад листов и параметры; внизу остатки. */
 if(document.body)document.body.classList.toggle('cut-full',cutFull);
 return `${head}${notice}${need}${over}
 <div class="cut-grid${busy?' cut-busy':''}">
  <div class="cut-side" ondragover="event.preventDefault()" ondrop="cutUiDropList(event)"><div class="cut-side-scroll">
   ${waiting.length?`<div class="cut-list-head" data-cut-waiting>Not on a sheet · ${waiting.length}</div>${listTable(rows(waiting))}`:''}
   <div class="cut-list-head">On sheets · ${onSheet.length}</div>${listTable(rows(onSheet))}
   ${off.length?`<div class="cut-list-head" data-cut-off>Not cutting · ${off.length}</div>${listTable(rows(off))}`:''}
  </div></div>
  <div class="cut-sheet-pane">
   ${glasses}
   ${sheet?`<div class="cut-sheet-head"><b>Sheet ${sheet.no}</b>${cutSumSheet(group,sheet)}
    ${(c=>c&&!c.ok?`<span class="pill bad" data-cut-not-cuttable>Not cuttable</span><button type="button" data-cut-repack onclick="cutUiRepack('${esc(group.glass)}',${sheet.no})">Re-pack sheet</button>`:'')(typeof cutSheetCutsFor==='function'?cutSheetCutsFor(group,sheet):null)}<span class="sp"></span>
    ${sheet.pieces.length?`<button type="button" data-cut-move-sheet onclick="cutUiMoveMenu(event,'${esc(group.glass)}',${sheet.no})">Move to batch ▾</button>`:''}
    <button type="button" class="dl" data-cut-sheet-delete onclick="cutUiSheetDelete('${esc(group.glass)}',${sheet.no})">Delete sheet</button>
    <button type="button" class="${sheet.locked?'on':''}" data-cut-sheet-lock onclick="cutUiSheetLock()">${sheet.locked?'Unlock sheet':'Lock sheet'}</button></div>
   <div class="cut-paper" data-cut-sheet="${sheet.no}" ondragover="cutUiDragOver(event,'${esc(group.glass)}',${sheet.no})" ondragleave="cutUiDragLeave(event)" ondrop="cutUiDrop(event,'${esc(group.glass)}',${sheet.no})" onpointerdown="cutUiDown(event,'${esc(group.glass)}',${sheet.no})" oncontextmenu="cutUiMenu(event,'${esc(group.glass)}',${sheet.no})" onpointerover="cutUiOver(event)" onpointerleave="cutUiHover('')">${cutSheetSVG(group,sheet,520,pieces,{sel:s.sel,ids:true})}</div>`
   /* Листов нет — пустой лист первого размера с линиями Trim и Border:
      правка отступов видна сразу, до Build. */
   :`<div class="cut-paper cut-paper-empty" data-cut-empty>${cutSheetSVG(group,{no:0,size:group.sheet,pieces:[],stock:[],offcuts:[]},520,[],{ids:true})}<div class="cut-empty-cap"><b>${waiting.length} glass</b><span>${busy?'Building…':'Press Build'}</span></div></div>`}
   ${strip}${actions}<p class="mut cut-hint">Drag glass on the sheet, onto a sheet below or to the list · double-click or R — rotate · right-click — menu · click a cut line to turn it</p>
   ${params}
  </div>
 </div>${busy?'':stockList+orders}`;
}
