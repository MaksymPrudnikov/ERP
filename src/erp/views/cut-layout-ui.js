/* =====================================================================
   views/cut-layout-ui  ·  cut-1.0
   Master Data → Cutting (параметры реза) и вкладка Optimization у батча:
   схемы листов, выход, печать схем для стола резки.
   IN : DB.cutting, DB.cutPlan, открытый батч
   OUT: экран и печать; сам раскрой считает erp/production/cut-layout
   ===================================================================== */
let cutNotice='';
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
function cutMdReset(){DB.cutting=cutSettingsDefault();normalizeCutting();touch();render();}
function viewMdCutting(){
 const s=cutSettings();
 const cell=(row,field)=>`<td class="n"><input type="text" data-cut-${field}="${row.mm}" value="${esc(frac16(row[field]))}" aria-label="${field} ${row.mm} mm" onchange="cutMdSet(${row.mm},'${field}',this.value)"></td>`;
 const rows=s.rows.map(r=>`<tr data-cut-row="${r.mm}"><td><b>${r.mm} mm</b></td>${cell(r,'trimMin')}${cell(r,'trim')}${cell(r,'gapMin')}${cell(r,'gap')}</tr>`).join('');
 return `<div class="cut-md" data-cut-md>
  <div class="cut-md-head"><div><h3>Cutting parameters</h3><p class="mut">Trim — off the sheet edge. Gap — between pieces. Minimum is the floor, the shop value is used.</p></div>
   <button type="button" data-cut-reset onclick="cutMdReset()">Reset to shop table</button></div>
  <div class="sales-table-wrap"><table class="ncr-table cut-table"><thead><tr><th>Thickness</th><th class="n">Trim min</th><th class="n">Trim</th><th class="n">Gap min</th><th class="n">Gap</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="cut-md-foot">
   <label><span class="ncr-label">MIN OFFCUT W</span><input type="text" data-cut-offcut-w value="${esc(frac16(s.minOffcutW))}" onchange="cutMdSetting('minOffcutW',this.value)"></label>
   <label><span class="ncr-label">MIN OFFCUT H</span><input type="text" data-cut-offcut-h value="${esc(frac16(s.minOffcutH))}" onchange="cutMdSetting('minOffcutH',this.value)"></label>
   <label class="chk"><input type="checkbox" data-cut-rotate ${s.rotate?'checked':''} onchange="cutMdSetting('rotate',this.checked)"> Rotate pieces on the sheet</label>
  </div></div>`;
}
/* --------------------------- Батч → Optimization -------------------------- */
function cutRunBatch(number){
 const r=cutPlanRun(number);cutNotice=r.error||'';render();
}
function cutSheetSVG(group,sheet,px){
 const S=px/Math.max(group.sheet.w,group.sheet.h),W=group.sheet.w*S,H=group.sheet.h*S;
 const out=['<svg viewBox="0 0 '+W.toFixed(1)+' '+H.toFixed(1)+'" width="'+W.toFixed(0)+'" height="'+H.toFixed(0)+'" class="cut-svg" font-family="Helvetica, Arial, sans-serif"><rect width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'" fill="#f2f4f7" stroke="#98a2b3"/>'];
 if(sheet.offcut)out.push('<rect x="'+(sheet.offcut.x*S).toFixed(1)+'" y="'+(sheet.offcut.y*S).toFixed(1)+'" width="'+(sheet.offcut.w*S).toFixed(1)+'" height="'+(sheet.offcut.h*S).toFixed(1)+'" fill="#fff" stroke="#98a2b3" stroke-dasharray="4 3"/><text x="'+((sheet.offcut.x+sheet.offcut.w/2)*S).toFixed(1)+'" y="'+((sheet.offcut.y+sheet.offcut.h/2)*S+4).toFixed(1)+'" text-anchor="middle" font-size="10" fill="#667085">Offcut '+esc(frac16(sheet.offcut.w))+' × '+esc(frac16(sheet.offcut.h))+'″</text>');
 sheet.pieces.forEach((p,i)=>{
  const x=p.x*S,y=p.y*S,w=p.w*S,h=p.h*S,label=(i+1)+' · '+frac16(p.w)+' × '+frac16(p.h)+'″';
  out.push('<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="#ffffff" stroke="#101828"/>');
  if(w>52&&h>16)out.push('<text x="'+(x+w/2).toFixed(1)+'" y="'+(y+h/2+3).toFixed(1)+'" text-anchor="middle" font-size="9" fill="#101828">'+esc(label)+'</text>');
  else out.push('<text x="'+(x+w/2).toFixed(1)+'" y="'+(y+h/2+3).toFixed(1)+'" text-anchor="middle" font-size="8" fill="#101828">'+(i+1)+'</text>');
 });
 return out.join('')+'</svg>';
}
function cutPrintHost(){let h=document.getElementById('cutPrintHost');if(!h){h=document.createElement('div');h.id='cutPrintHost';document.body.appendChild(h);}return h;}
function cutPrintCleanup(){document.body.classList.remove('cut-printing');const h=document.getElementById('cutPrintHost');if(h)h.innerHTML='';}
function cutPrintLayouts(number){
 const plan=cutPlanFor(number);if(!plan)return false;
 const pages=[];
 plan.groups.forEach(g=>g.sheets.forEach(s=>{
  const rows=s.pieces.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.piece)}</td><td>${esc(p.order)} / ${p.line}</td><td>${esc(frac16(p.w))} × ${esc(frac16(p.h))}″</td><td>${p.rot?'rotated':''}</td></tr>`).join('');
  pages.push(`<div class="cut-print-page"><h3>Batch ${esc(number)} · Sheet ${s.no} · ${esc(g.glass)} ${g.mm} mm · ${esc(frac16(g.sheet.w))} × ${esc(frac16(g.sheet.h))}″</h3>
   <div class="cut-print-sheet">${cutSheetSVG(g,s,520)}</div>
   <table class="cut-print-table"><thead><tr><th>#</th><th>Glass ID</th><th>Order</th><th>Size</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`);
 }));
 if(!pages.length)return false;
 cutPrintHost().innerHTML=pages.join('');
 document.body.classList.add('cut-printing');
 window.addEventListener('afterprint',cutPrintCleanup,{once:true});setTimeout(cutPrintCleanup,60000);
 try{window.print();}catch(e){cutPrintCleanup();return false;}
 return true;
}
function viewCutLayout(b){
 const plan=cutPlanFor(b.number),stale=plan&&cutPlanStale(b.number);
 const head=`<div class="oq-toolbar cut-toolbar">${plan?`<b data-cut-stats>${plan.stats.sheets} sheet${plan.stats.sheets===1?'':'s'} · ${plan.stats.placed} pcs · yield ${plan.stats.yield}%</b>`:'<b data-cut-stats>Not optimized</b>'}
  <span class="sp"></span>${plan?`<button type="button" data-cut-print onclick="cutPrintLayouts('${esc(b.number)}')">Print layouts</button>`:''}
  <button type="button" class="pri" data-cut-run onclick="cutRunBatch('${esc(b.number)}')">${plan?'Re-optimize':'Optimize'}</button></div>`;
 const notice=cutNotice?`<div class="ncr-error" role="alert" data-cut-error>${esc(cutNotice)}</div>`:stale?'<div class="ncr-warning" data-cut-stale>⚠ Batch changed after the layout — re-optimize.</div>':'';
 if(!plan)return `${head}${notice}<p class="mut cut-empty">Optimize lays the glass of this batch on sheets: one glass, orders mixed. Sheet size comes from Master Data.</p>`;
 const groups=plan.groups.map(g=>`<div class="cut-group" data-cut-group="${esc(g.glass)}">
  <div class="cut-group-head"><b>${esc(g.glass)} · ${g.mm} mm</b><span class="mut">Sheet ${esc(frac16(g.sheet.w))} × ${esc(frac16(g.sheet.h))}″ · Trim ${esc(frac16(g.params.trim))}″ · Gap ${esc(frac16(g.params.gap))}″${g.params.rotate?'':' · no rotation'}</span></div>
  <div class="cut-sheets">${g.sheets.map(s=>`<div class="cut-sheet" data-cut-sheet="${s.no}"><div class="cut-sheet-head">Sheet ${s.no} · ${s.pieces.length} pcs</div>${cutSheetSVG(g,s,260)}</div>`).join('')}</div>
  ${g.skipped.length?`<p class="mut" data-cut-skipped>${g.skipped.length} piece${g.skipped.length===1?'':'s'} larger than the sheet: ${esc(g.skipped.map(x=>x.piece).join(', '))}</p>`:''}</div>`).join('');
 const missing=(plan.missing||[]).length?`<p class="mut" data-cut-missing>No sheet size for ${esc(plan.missing.join(', '))} — add it in Master Data.</p>`:'';
 return `${head}${notice}<div class="cut-plan">${groups}${missing}</div>`;
}
