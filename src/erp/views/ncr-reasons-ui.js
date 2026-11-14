/* =====================================================================
   view/ncr-reasons · ncr-reasons-ui-1.0
   Master Data → NCR: слева «Где» (All stations, Office, станции), справа
   «Что» этого места. Общие причины правятся в All stations; на станции они
   видны только для чтения. Название правится прямо в строке; причину не
   удаляют — выключают переключателем Active.
   IN : DB.ncrReason, DB.station (erp/quality/reasons)
   OUT: HTML вкладки; запись через ncrReasonAdd / Rename / SetActive
   ===================================================================== */
/* Набранное при отказе остаётся в поле (аудит 19.10.2026, F11): ncrNew —
   новая причина, ncrTyped — {id, name} строки, которую не переименовали. */
let ncrWhere='CUT',ncrError='',ncrNew='',ncrTyped=null;
function ncrSelect(code){ncrWhere=code;ncrError='';ncrNew='';ncrTyped=null;render();}
function ncrNewSet(v){ncrNew=v;}
function ncrAddKey(ev){if(ev.key==='Enter')ncrAddFromInput();}
function ncrAddFromInput(){
 const el=document.querySelector('[data-ncr-new]');ncrNew=el?el.value:'';ncrTyped=null;
 ncrError=ncrReasonAdd(ncrWhere,ncrNew);if(!ncrError)ncrNew='';render();
 if(!ncrError){const next=document.querySelector('[data-ncr-new]');if(next)next.focus();}
}
function ncrRenameFromInput(id,el){const name=el.value;ncrError=ncrReasonRename(id,name);ncrTyped=ncrError?{id,name}:null;render();}
function ncrToggle(id,on){ncrError=ncrReasonSetActive(id,on);ncrTyped=null;render();}
function viewMdNcr(){
 const places=ncrWhereList();
 if(ncrWhere!==NCR_ALL&&!places.some(w=>w.code===ncrWhere))ncrWhere=places.length>1?places[1].code:NCR_ALL;
 const active=code=>(code===NCR_ALL?(DB.ncrReason||[]).filter(r=>r.where===NCR_ALL):ncrReasonsFor(code)).filter(r=>r.active).length;
 const place=(code,label,name)=>`<button type="button" class="ncr-where${ncrWhere===code?' on':''}" data-ncr-where="${esc(code)}" aria-pressed="${ncrWhere===code}" ${onAct('click',ncrSelect,String(code??''))}><span><b>${esc(label)}</b>${esc(name)}</span><span class="ncr-count">${active(code)}</span></button>`;
 const side=place(NCR_ALL,'ALL','All stations')+'<hr>'+places.map(w=>place(w.code,w.code,w.name)).join('');
 const station=ncrWhere!==NCR_ALL&&ncrWhere!==NCR_OFFICE;
 const hint=ncrWhere===NCR_ALL?'Shown on every station':'';
 const base=r=>station&&r.where===NCR_ALL,scopeText=r=>r.where===NCR_ALL?'All stations':(r.where===NCR_OFFICE?'Office':r.where)+' only';
 const rows=ncrReasonsFor(ncrWhere);
 /* Таблица вида Sales (владелец 07.11.2026): фильтр, сортировка, ширина, порядок. */
 const table=slTable('mdNcrReasons',{list:rows,id:r=>r.id,cls:'ncr-table',empty:'No reasons yet.',noun:l=>l.length+' reason'+(l.length===1?'':'s'),
  columns:()=>[
   {k:'name',label:'Reason',type:'text',v:r=>r.name,cell:r=>base(r)?`<span class="ncr-name">${esc(r.name)}</span>`:`<input class="ncr-name-input" data-ncr-name value="${esc(ncrTyped&&ncrTyped.id===r.id?ncrTyped.name:r.name)}" maxlength="80" aria-label="Reason name" ${onAct('change',ncrRenameFromInput,String(r.id??''),EL)}>`},
   {k:'where',label:'Applies to',type:'list',v:scopeText,cell:r=>`<span class="pill ${r.where===NCR_ALL?'ncr-scope-all':'ncr-scope-own'}">${esc(scopeText(r))}</span>`},
   {k:'active',label:'Active',type:'list',v:r=>r.active?'On':'Off',cell:r=>`<span class="ncr-active">${base(r)?`<span class="mut" title="Change in All stations">${r.active?'On':'Off'}</span>`:`<label class="ncr-switch"><input type="checkbox" data-ncr-active ${r.active?'checked':''} aria-label="Active: ${esc(r.name)}" ${onAct('change',ncrToggle,String(r.id??''),EL_CHECKED)}><span></span></label>`}</span>`}],
  row:i=>({attrs:` data-ncr-reason="${esc(i.x.id)}" class="${i.x.active?'':'ncr-off'}"`})});
 const pills=list=>`<div class="ncr-pills">${list.map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div>`;
 return ` <div class="ncr-layout">
  <div class="card ncr-side"><div class="ncr-label">WHERE</div>${side}</div>
  <div>
   <div class="card ncr-main">
    <div class="ncr-head"><div><div class="ncr-label">WHAT HAPPENED</div><h3>${esc(ncrWhere===NCR_ALL?'All stations':ncrWhere===NCR_OFFICE?'Office':ncrWhere+' · '+ncrWhereName(ncrWhere))}</h3>${hint?`<p>${esc(hint)}</p>`:''}</div>
     <div class="ncr-add"><input data-ncr-new maxlength="80" placeholder="New reason" aria-label="New reason" value="${esc(ncrNew)}" ${onAct('input',ncrNewSet,EL_VALUE)} ${onAct('keydown',ncrAddKey,EVENT)}><button type="button" class="pri" data-ncr-add ${onAct('click',ncrAddFromInput)}>+ Add reason</button></div></div>
    ${ncrError?`<div class="ncr-error" role="alert">${esc(ncrError)}</div>`:''}
    ${table}
   </div>
   <div class="card ncr-actions-card"><div class="ncr-label">NCR ACTION</div>${pills(NCR_ACTIONS)}</div>
  </div>
 </div>`;
}

/* Data → Production → Stock reasons (erp/inventory/stock-reasons): причины
   разницы при пересчёте склада. Как причины NCR: добавить, переименовать,
   выключить; удаления нет. */
let stockReasonNew='',stockReasonError='';
function viewMdStockReasons(){
 const table=slTable('mdStockReasons',{list:DB.stockReason||[],id:r=>r.id,cls:'ncr-table',empty:'No reasons yet.',noun:l=>l.length+' reason'+(l.length===1?'':'s'),
  columns:()=>[
   {k:'name',label:'Reason',type:'text',v:r=>r.name,cell:r=>`<input class="ncr-name-input" data-stock-reason-name value="${esc(r.name)}" maxlength="80" aria-label="Reason" ${onAct('change',stockReasonRenameUi,String(r.id??''),EL_VALUE)}>`},
   {k:'active',label:'Active',type:'list',v:r=>r.active?'On':'Off',cell:r=>`<span class="ncr-active"><label class="ncr-switch"><input type="checkbox" data-stock-reason-active ${r.active?'checked':''} aria-label="Active: ${esc(r.name)}" ${onAct('change',stockReasonActiveUi,String(r.id??''),EL_CHECKED)}><span></span></label></span>`}],
  row:i=>({attrs:` data-stock-reason="${esc(i.x.id)}" class="${i.x.active?'':'ncr-off'}"`})});
 return `<div class="card ncr-main" data-stock-reasons>
  <div class="ncr-head"><div><div class="ncr-label">STOCK COUNT</div><h3>Reasons</h3><p>Shown when a count differs.</p></div>
   <div class="ncr-add"><input data-stock-reason-new maxlength="80" placeholder="New reason" aria-label="New reason" value="${esc(stockReasonNew)}" ${onAct('input',stockReasonNewSet,EL_VALUE)} ${onAct('keydown',stockReasonAddKey,EVENT)}><button type="button" class="pri" data-stock-reason-add ${onAct('click',stockReasonAddUi)}>+ Add</button></div></div>
  ${stockReasonError?`<div class="ncr-error" role="alert">${esc(stockReasonError)}</div>`:''}
  ${table}</div>`;
}
function stockReasonNewSet(v){stockReasonNew=v;}
function stockReasonAddKey(ev){if(ev.key==='Enter')stockReasonAddUi();}
function stockReasonRenameUi(id,v){stockReasonError=stockReasonRename(id,v);render();}
function stockReasonActiveUi(id,on){stockReasonError=stockReasonSetActive(id,on);render();}
function stockReasonAddUi(){stockReasonError=stockReasonAdd(stockReasonNew);if(!stockReasonError)stockReasonNew='';render();}
