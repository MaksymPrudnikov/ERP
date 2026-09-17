/* =====================================================================
   view/ncr-reasons · ncr-reasons-ui-1.0
   Master Data → NCR: слева «Где» (All stations, Office, станции), справа
   «Что» этого места. Общие причины правятся в All stations; на станции они
   видны только для чтения. Название правится прямо в строке; причину не
   удаляют — выключают переключателем Active.
   IN : DB.ncrReason, DB.station (erp/quality/reasons)
   OUT: HTML вкладки; запись через ncrReasonAdd / Rename / SetActive
   ===================================================================== */
let ncrWhere='CUT',ncrError='';
function ncrSelect(code){ncrWhere=code;ncrError='';render();}
function ncrAddFromInput(){
 const el=document.querySelector('[data-ncr-new]');ncrError=ncrReasonAdd(ncrWhere,el?el.value:'');render();
 if(!ncrError){const next=document.querySelector('[data-ncr-new]');if(next)next.focus();}
}
function ncrRenameFromInput(id,el){ncrError=ncrReasonRename(id,el.value);render();}
function ncrToggle(id,on){ncrReasonSetActive(id,on);ncrError='';render();}
function viewMdNcr(){
 const places=ncrWhereList();
 if(ncrWhere!==NCR_ALL&&!places.some(w=>w.code===ncrWhere))ncrWhere=places.length>1?places[1].code:NCR_ALL;
 const active=code=>(code===NCR_ALL?(DB.ncrReason||[]).filter(r=>r.where===NCR_ALL):ncrReasonsFor(code)).filter(r=>r.active).length;
 const place=(code,label,name)=>`<button type="button" class="ncr-where${ncrWhere===code?' on':''}" data-ncr-where="${esc(code)}" aria-pressed="${ncrWhere===code}" onclick="ncrSelect('${esc(code)}')"><span><b>${esc(label)}</b>${esc(name)}</span><span class="ncr-count">${active(code)}</span></button>`;
 const side=place(NCR_ALL,'ALL','All stations')+'<hr>'+places.map(w=>place(w.code,w.code,w.name)).join('');
 const station=ncrWhere!==NCR_ALL&&ncrWhere!==NCR_OFFICE;
 const hint=ncrWhere===NCR_ALL?'Shown on every station':'';
 const row=r=>{
  const base=station&&r.where===NCR_ALL,scope=r.where===NCR_ALL?'All stations':(r.where===NCR_OFFICE?'Office':r.where)+' only';
  return `<tr data-ncr-reason="${esc(r.id)}" class="${r.active?'':'ncr-off'}"><td>${base?`<span class="ncr-name">${esc(r.name)}</span>`:`<input class="ncr-name-input" data-ncr-name value="${esc(r.name)}" maxlength="80" aria-label="Reason name" onchange="ncrRenameFromInput('${esc(r.id)}',this)">`}</td>
   <td><span class="pill ${r.where===NCR_ALL?'ncr-scope-all':'ncr-scope-own'}">${esc(scope)}</span></td>
   <td class="ncr-active">${base?`<span class="mut" title="Change in All stations">${r.active?'On':'Off'}</span>`:`<label class="ncr-switch"><input type="checkbox" data-ncr-active ${r.active?'checked':''} aria-label="Active: ${esc(r.name)}" onchange="ncrToggle('${esc(r.id)}',this.checked)"><span></span></label>`}</td></tr>`;
 };
 const rows=ncrReasonsFor(ncrWhere);
 const pills=list=>`<div class="ncr-pills">${list.map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div>`;
 return ` <div class="ncr-layout">
  <div class="card ncr-side"><div class="ncr-label">WHERE</div>${side}</div>
  <div>
   <div class="card ncr-main">
    <div class="ncr-head"><div><div class="ncr-label">WHAT HAPPENED</div><h3>${esc(ncrWhere===NCR_ALL?'All stations':ncrWhere===NCR_OFFICE?'Office':ncrWhere+' · '+ncrWhereName(ncrWhere))}</h3>${hint?`<p>${esc(hint)}</p>`:''}</div>
     <div class="ncr-add"><input data-ncr-new maxlength="80" placeholder="New reason" aria-label="New reason" onkeydown="if(event.key==='Enter')ncrAddFromInput()"><button type="button" class="pri" data-ncr-add onclick="ncrAddFromInput()">+ Add reason</button></div></div>
    ${ncrError?`<div class="ncr-error" role="alert">${esc(ncrError)}</div>`:''}
    <table class="ncr-table"><thead><tr><th>Reason</th><th>Applies to</th><th>Active</th></tr></thead><tbody>${rows.map(row).join('')||'<tr><td colspan="3" class="empty">No reasons yet.</td></tr>'}</tbody></table>
   </div>
   <div class="ncr-lists">
    <div class="card"><div class="ncr-label">SOURCE · WHO FOUND IT</div>${pills(NCR_SOURCES)}</div>
    <div class="card"><div class="ncr-label">ACTION</div>${pills(NCR_ACTIONS)}</div>
   </div>
  </div>
 </div>`;
}
