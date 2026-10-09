/* Sales → Unbatch order. Same selection vocabulary as Skip, reverse targets.
   The preview is read-only. Confirmation submits the captured database stamp;
   a stale window or failed save keeps the selection open. No Undo button. */
let productionUnbatchDialog=null;
function productionUnbatchOpen(orderId){
 const o=salesRecord(orderId);salesListMenu=null;
 if(!productionUnbatchAllowed()||!productionUnbatchCanOpen(o)){render();return false;}
 productionUnbatchDialog={orderId,lines:{},codes:'',target:PRODUCTION_UNBATCH_UNCUT,reason:'',all:false,error:'',stamp:productionUnbatchStamp()};render();return true;
}
function productionUnbatchClose(){productionUnbatchDialog=null;render();}
function productionUnbatchSet(key,value){
 const d=productionUnbatchDialog;if(!d)return;d[key]=value;d.error='';
 if(key==='codes')d.all=false;
 if(['codes','target'].includes(key))render();
}
function productionUnbatchSetLine(id,value){const d=productionUnbatchDialog;if(!d)return;d.lines[id]=value;d.all=false;d.error='';render();}
function productionUnbatchSetAll(on){const d=productionUnbatchDialog,o=d&&salesRecord(d.orderId);if(!o)return;d.all=!!on;d.codes='';d.lines=Object.fromEntries(o.lines.map(l=>[l.id,on?'all':'']));d.error='';render();}
function productionUnbatchRequest(){
 const d=productionUnbatchDialog;return d&&{orderId:d.orderId,lines:d.lines,codes:d.codes.split(/[\s,;]+/).filter(Boolean),target:d.target,reason:d.reason,stamp:d.stamp};
}
function productionUnbatchConfirm(){
 const d=productionUnbatchDialog;if(!d)return false;
 const o=salesRecord(d.orderId),clean=!!o&&!!soDraft&&soDraft.id===o.id&&JSON.stringify(o)===JSON.stringify(normalizeSalesOrder(soDraft));
 const r=productionUnbatchRun(productionUnbatchRequest());
 if(r.error){d.error=r.error;render();return false;}
 productionUnbatchDialog=null;if(clean)salesOrderEdit(o.id);else render();return true;
}
function productionUnbatchDialogHTML(){
 const d=productionUnbatchDialog;if(!d)return '';
 const o=salesRecord(d.orderId);if(!productionUnbatchAllowed()||!productionUnbatchCanOpen(o)){productionUnbatchDialog=null;return '';}
 const p=productionUnbatchPreview(productionUnbatchRequest()),catalog=p.catalog||productionUnbatchUnits(o),targets=p.targets||productionUnbatchTargets([]);
 const rows=o.lines.map((l,n)=>{const count=catalog.filter(u=>u.lineId===l.id).length,v=d.lines[l.id]??'';return `<tr data-unbatch-line="${esc(l.id)}"><td>Line ${n+1}${l.mark?' · '+esc(l.mark):''}</td><td>${esc(docSize(l))}</td><td class="n">${count}</td><td><input type="number" data-unbatch-qty aria-label="Line ${n+1} units" min="0" max="${count}" step="1" value="${v==='all'?count:esc(v)}" ${count?'':'disabled'} onchange="productionUnbatchSetLine('${esc(l.id)}',this.value)"></td></tr>`;}).join('');
 const summary=p.error?`<p class="mut">${esc(p.error)}</p>`:`<div data-unbatch-summary><p><b>${shippingCount(p.units.length,'unit')} · ${shippingCount(p.pieces.length,'glass piece')}</b> → ${esc(productionUnbatchTargetLabel(d.target))}</p><p class="mut">Assemblies: ${p.asmIds.length} · Batches: ${esc(p.batchNumbers.join(', ')||'None')} · Packing slips: ${esc(p.shipments.map(s=>s.number+' ('+s.qty+')').join(', ')||'None')}</p><p class="mut">${esc(p.units.map(u=>u.label+' · '+shippingCount(u.pieces.length,'glass piece')).join(', '))}</p>${p.unchanged.length?`<p class="mut" data-unbatch-unchanged>No return needed: ${esc(p.unchanged.join(', '))}</p>`:''}</div>`;
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this)productionUnbatchClose()"><div class="sales-service-modal sales-dialog ncr-modal skip-dialog" role="dialog" aria-modal="true" aria-label="Unbatch order" data-production-unbatch-dialog>
  <div class="sales-service-modal-head"><h3>Unbatch · Order ${esc(o.businessNumber)}</h3><button type="button" aria-label="Close" onclick="productionUnbatchClose()">×</button></div>
  <div class="sales-dialog-body ncr-form"><p class="mut">${esc([salesCustomerDisplay(o.customerId),salesStatusLabel(o)].join(' · '))}</p>
  <label class="skip-all"><input type="checkbox" data-unbatch-all ${d.all?'checked':''} onchange="productionUnbatchSetAll(this.checked)"> Whole order · glass only</label>
  <div class="ncr-lines-wrap"><table class="ncr-lines"><thead><tr><th>Line</th><th>Size</th><th class="n">Units</th><th>Unbatch</th></tr></thead><tbody>${rows}</tbody></table></div>
  <label><span class="ncr-label">GLASS ID OR UNIT</span><input type="text" data-unbatch-codes value="${esc(d.codes)}" placeholder="Scan G- or U-" onchange="productionUnbatchSet('codes',this.value)"></label>
  <label><span class="ncr-label">TO</span><select data-unbatch-target onchange="productionUnbatchSet('target',this.value)">${targets.map(t=>`<option value="${esc(t.id)}" ${d.target===t.id?'selected':''}>${esc(t.label)}</option>`).join('')}</select></label>
  <label><span class="ncr-label">REASON</span><input type="text" data-unbatch-reason maxlength="200" value="${esc(d.reason)}" placeholder="Optional" oninput="productionUnbatchSet('reason',this.value)"></label>
  ${summary}${d.target===PRODUCTION_UNBATCH_UNCUT?'<p class="mut">Selected glass leaves its batches. Verify again.</p>':''}${d.error?`<div class="ncr-error" role="alert" data-unbatch-error>${esc(d.error)}</div>`:''}</div>
  <div class="sales-dialog-actions"><button type="button" onclick="productionUnbatchClose()">Back</button><button type="button" class="pri" data-unbatch-run ${p.error||!p.pieces?.length?'disabled':''} onclick="productionUnbatchConfirm()">Unbatch</button></div></div></div>`;
}
(window.APP_OVERLAYS=window.APP_OVERLAYS||[]).push(productionUnbatchDialogHTML);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&productionUnbatchDialog)productionUnbatchClose();});
