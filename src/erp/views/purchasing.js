/* Purchasing P1: supplier cards. Column filters use the Sales list engine.
   Edits stay in a draft until one storageCommand saves the whole card.
   Additional contacts and custom fields are optional (owner, 12.10.2026).
   No global search, no stock balances and no purchase in customer Finance. */
let purSupplierDraft=null,purSupplierOriginal='',purNotice='';
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>!!purSupplierDraft&&JSON.stringify(purSupplierDraft)!==purSupplierOriginal);
function purArg(v){return esc(JSON.stringify(String(v)));}
function purListScope(){if(['invoices','payments','payables'].includes(purView))return 'purchasing-'+purView;if(['receipts','requests','backorders','held'].includes(purView))return 'purchasing-'+purView;return purView==='suppliers'?'purchaseSuppliers':purView==='history'?'purchaseHistory':'purchaseOrders';}
function purListColumns(){
 if(['invoices','payments','payables'].includes(purView))return purMoneyColumns();
 if(['receipts','requests','backorders','held'].includes(purView))return purReceivingColumns();
 if(purView!=='suppliers')return purOrderColumns();
 const visible=['name','email','phone','currency','paymentDays','leadTimeDays'];
 return PUR_SUPPLIER_FIELDS.map(f=>({k:f.k,label:f.label,type:f.type==='days'?'number':f.k==='currency'?'list':'text',def:visible.includes(f.k)}))
  .concat([{k:'supplyCount',label:'Supply rows',type:'number',def:true},{k:'status',label:'Status',type:'list',def:true}]);
}
function purListDefaultSort(){if(purView==='payables')return {k:'supplierName',dir:'asc'};if(purView==='held')return {k:'orderBy',dir:'asc'};return purView==='suppliers'?{k:'name',dir:'asc'}:{k:purView==='history'?'at':'number',dir:'desc'};}
function purSupplierInfos(){
 const counts=new Map();(DB.glassSheet||[]).forEach(s=>counts.set(s.supplierId,(counts.get(s.supplierId)||0)+1));
 return (DB.supplier||[]).map(s=>({o:{id:s.id},s,memo:Object.assign({},s,{supplyCount:counts.get(s.id)||0,status:s.active?'Active':'Archived'})}));
}
function purListHeader(c){
 const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);
 return `<th class="${c.type==='number'?'n':''}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;
}
function viewPurchasing(){
 if(!accessCan('purchasing'))return '<div class="empty">Purchasing access is required.</div>';
 if(purMoneyDraft)return purMoneyForm();
 if(purFulfilDraft)return purFulfilForm();
 if(purSupplierDraft)return purSupplierForm();
 if(purOrderDraft)return purOrderForm();
 if(['invoices','payments','payables'].includes(purView))return purMoneyList();
 if(['receipts','requests','backorders','held'].includes(purView))return purReceivingList();
 if(purView!=='suppliers')return purOrderList();
 const infos=purSupplierInfos(),rows=salesListRows(infos),cols=salesListColumns();
 const cell=(i,c)=>{
  const v=salesListValue(i,c.k);
  if(c.k==='name')return `<td><button type="button" class="fin-link pur-supplier-name" data-pur-open="${esc(i.s.id)}" onclick="purSupplierEdit(${purArg(i.s.id)})" data-raw>${esc(v)||'Unnamed supplier'}</button></td>`;
  if(c.k==='status')return `<td><span class="pill ${i.s.active?'ok':''}">${esc(v)}</span></td>`;
  return `<td class="${c.type==='number'?'n':''}" data-raw>${v==null||v===''?'<span class="mut">—</span>':esc(v)}</td>`;
 };
 return `<div class="purchasing-workspace"><div class="card sales-list-card"><div class="sales-toolbar">${purNav()}<span class="sales-toolbar-sp"></span><button type="button" class="pri" data-pur-new onclick="purSupplierEdit('')">+ Supplier</button></div>
  ${purNotice?`<div class="ncr-error" role="alert">${esc(purNotice)}</div>`:''}
  ${purListFilters(infos)}<div class="sales-table-wrap"><table class="sl-table" data-pur-suppliers><thead><tr><th><button type="button" class="sl-settings" title="Columns" aria-label="Columns" data-columns-button onclick="salesListOpenColumns(event)">${ico('settings')}</button></th>${cols.map(purListHeader).join('')}</tr></thead>
  <tbody>${purPageRows(rows).map(i=>`<tr data-pur-supplier="${esc(i.s.id)}"><td></td>${cols.map(c=>cell(i,c)).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length+1}" class="empty">${infos.length?'Nothing matches the filters.':'No suppliers yet. Add a supplier when you need a reusable card.'}</td></tr>`}</tbody>
  </table></div>${purListPager(rows)}${salesListMenuHTML(infos)}</div></div>`;
}
function purSupplierEdit(id){
 if(!accessCan('purchasing'))return;
 const s=id?purSupplierFind(id):null;if(id&&!s)return;purView='suppliers';
 purSupplierDraft=purClone(s||purSupplierClean({}));purSupplierOriginal=JSON.stringify(purSupplierDraft);purNotice='';salesListMenu=null;render();
 /* render is synchronous; a delayed focus can steal input from Email. */
 if(!id)document.getElementById('pur_supplier_name')?.focus();
}
function purSupplierInput(f){
 const d=purSupplierDraft,id='pur_supplier_'+f.k,v=d[f.k]==null?'':d[f.k];
 const attrs=`id="${id}" data-pur-field="${f.k}" value="${esc(v)}" oninput="purSupplierDraft.${f.k}=this.value"`;
 const input=f.type==='area'?`<textarea id="${id}" data-pur-field="${f.k}" rows="3" oninput="purSupplierDraft.${f.k}=this.value">${esc(v)}</textarea>`:
  `<input ${attrs} ${f.type==='days'?'type="number" step="1" min="0"':f.k==='currency'?'list="pur_currencies" maxlength="3"':'type="text"'}>`;
 return `<div class="${f.type==='area'?'pur-wide':''}"><label for="${id}">${esc(f.label)}${f.k==='name'?' *':''}</label>${input}</div>`;
}
function purSupplierForm(){
 const d=purSupplierDraft,groups=[...new Set(PUR_SUPPLIER_FIELDS.map(f=>f.group))];
 const extra=d.contacts.map((c,i)=>`<div class="pur-contact" data-pur-contact="${i}">
  ${[['name','Name'],['role','Role / department'],['email','Email'],['phone','Phone']].map(([k,l])=>`<div><label for="pur_contact_${i}_${k}">${l}</label><input id="pur_contact_${i}_${k}" value="${esc(c[k])}" oninput="purSupplierDraft.contacts[${i}].${k}=this.value"></div>`).join('')}
  <button type="button" class="sm dl" aria-label="Remove contact ${i+1}" onclick="purSupplierDraft.contacts.splice(${i},1);render()">×</button></div>`).join('');
 const custom=d.customFields.map((f,i)=>`<div class="pur-custom-row" data-pur-custom="${i}"><div><label for="pur_custom_label_${i}">Label</label><input id="pur_custom_label_${i}" value="${esc(f.label)}" oninput="purSupplierDraft.customFields[${i}].label=this.value"></div><div><label for="pur_custom_value_${i}">Value</label><input id="pur_custom_value_${i}" value="${esc(f.value)}" oninput="purSupplierDraft.customFields[${i}].value=this.value"></div><button type="button" class="sm dl" aria-label="Remove custom field ${i+1}" onclick="purSupplierDraft.customFields.splice(${i},1);render()">×</button></div>`).join('');
 const sheets=d.id?(DB.glassSheet||[]).filter(s=>s.supplierId===d.id):[];
 return `<div class="purchasing-workspace"><div class="sales-toolbar pur-toolbar"><button type="button" class="sl-btn" onclick="purSupplierCancel()">← Suppliers</button><h2 data-raw>${d.id?esc(d.name)||'Supplier':'New supplier'}</h2><span class="sales-toolbar-sp"></span><button type="button" class="pri" data-pur-save onclick="purSupplierFormSave()">Save</button><button type="button" onclick="purSupplierCancel()">Cancel</button></div>
  ${purNotice?`<div class="ncr-error" data-pur-error role="alert">${esc(purNotice)}</div>`:''}
  <div class="pur-form form" data-pur-form><datalist id="pur_currencies"><option value="USD"></option><option value="CAD"></option></datalist>
  ${groups.map(g=>`<section class="card pur-card"><h3>${g}</h3><div class="pur-fields">${PUR_SUPPLIER_FIELDS.filter(f=>f.group===g).map(purSupplierInput).join('')}</div></section>`).join('')}
  <section class="card pur-card pur-wide"><div class="pur-section-head"><h3>Other contacts</h3><button type="button" class="sm" data-pur-add-contact onclick="purSupplierDraft.contacts.push({name:'',role:'',email:'',phone:''});render()">+ Contact</button></div>${extra||'<p class="mut">Add another person or department when needed.</p>'}</section>
  <section class="card pur-card pur-wide"><div class="pur-section-head"><h3>Custom fields</h3><button type="button" class="sm" data-pur-add-field onclick="purSupplierDraft.customFields.push({id:salesUid('SF'),label:'',value:''});render()">+ Field</button></div>${custom||'<p class="mut">Your own labels and values.</p>'}</section>
  ${sheets.length?`<section class="card pur-card pur-wide"><h3>Supply points · ${sheets.length}</h3><div class="sales-table-wrap"><table class="sl-table"><thead><tr><th>Supply point</th><th>Glass</th><th>Sheet, in</th><th>Currency</th></tr></thead><tbody>${sheets.map(s=>`<tr><td data-raw>${esc(s.supplier)}</td><td data-raw>${esc(s.productCode)}</td><td>${s.sheetWIn==null?'—':esc(s.sheetWIn+' × '+s.sheetHIn)}</td><td>${esc(s.currency)}</td></tr>`).join('')}</tbody></table></div></section>`:''}
  <section class="card pur-card pur-wide"><label class="pur-active"><input type="checkbox" data-pur-active ${d.active?'checked':''} onchange="purSupplierDraft.active=this.checked"> Active supplier</label><p class="mut">Archived cards keep their supply links and can be restored here.</p></section>
  ${d.id?purHistoryHTML('supplier',d.id):''}
  </div></div>`;
}
function purHistoryValue(value){
 if(value==null||value==='')return '—';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(Array.isArray(value)&&value.some(x=>x&&(x.kind||Object.prototype.hasOwnProperty.call(x,'description'))))return value.map((x,i)=>'Line '+(i+1)+': '+JSON.stringify(x)).join('\n');
 if(Array.isArray(value))return value.map(x=>x&&typeof x==='object'?(x.label?x.label+': '+x.value:[x.name,x.role,x.email,x.phone].filter(Boolean).join(' · ')):String(x)).join('; ')||'—';
 return typeof value==='object'?JSON.stringify(value):String(value);
}
function purHistoryHTML(entity,id){
 const events=purHistory(entity,id);
 return `<section class="card pur-card pur-wide" data-pur-history><h3>History</h3>${events.length?events.map(e=>`<details class="pur-event"><summary><b>${esc(e.what)}</b><span>${esc(new Date(e.at).toLocaleString())}</span><span data-raw>${esc(e.by)||'Setup'}</span></summary><dl>${e.changes.map(c=>`<div><dt data-raw>${esc(c.label||c.field)}</dt><dd data-raw>${esc(purHistoryValue(c.before))} → ${esc(purHistoryValue(c.after))}</dd></div>`).join('')}</dl></details>`).join(''):'<p class="mut">No recorded changes yet.</p>'}</section>`;
}
function purSupplierFormSave(){
 if(!purSupplierDraft)return;const r=purSupplierSave(purSupplierDraft);
 if(!r.ok){purNotice=r.error;render();return;}
 purSupplierDraft=null;purNotice='';render();
}
function purSupplierCancel(){
 if(purSupplierDraft&&JSON.stringify(purSupplierDraft)!==purSupplierOriginal&&!confirm('Discard changes and return to suppliers?'))return;
 purSupplierDraft=null;purNotice='';render();
}
