/* =====================================================================
   view/customers  ·  customers-2.0
   Клиенты: таблица на общем движке Sales, карточка из пяти вкладок,
   заказы клиента, импорт / экспорт в меню «⋯», предупреждение о дубле.
   ===================================================================== */

let cEdit=null,cDraft=null,cTab='general',cMenu=null,cDup=null;
/* Список клиентов — на общем движке таблиц Sales (владелец, 3 октября 2026:
   «customer нужно поработать структурировано… этот супер поиск мне не
   нравится, пусть будет как везде, в Sales, Optimization, работать как
   экселька»). Своя область customers и свои настройки: воронка в каждой
   колонке, блок дат Created, без общего поиска и без плиток статистики
   (цифры — в будущие отчёты). Статус — фильтр колонки; архивные по
   умолчанию скрыты. Balance и Last order видны сразу (владелец). */
function custListScope(){return tab==='customers'&&cEdit===null?'customers':'';}
function custColumns(){
 const col=(k,label,type,def)=>({k,label,type:type||'text',def:def!==false});
 return [col('code','Account'),col('name','Customer'),col('contact','Contact'),col('phone','Phone'),col('email','Email'),col('terms','Terms','list'),
  col('credit','Credit limit','number'),col('balance','Balance','number'),col('lastOrder','Last order','date'),col('status','Status','list'),
  col('created','Created','date',false),col('type','Type','list',false),col('group','Group','list',false),col('area','Area','list',false),col('rep','Sales rep','list',false)];
}
function custListDefaults(){return {status:{mode:'exclude',values:['Archived']}};}
function custStatusText(c){return c.status==='archived'?'Archived':c.onHold?'On hold':c.isProspect?'Prospect':c.status==='inactive'?'Inactive':'Active';}
function custLastOrder(id){
 let last='';(DB.salesOrder||[]).forEach(o=>{if(o.customerId===id&&!salesIsQuote(o)&&String(o.createdAt||'')>last)last=String(o.createdAt||'');});
 return last?salesListIsoDay(last):'';
}
function custInfos(){
 return (DB.customer||[]).map(c=>{const p=customerPrimaryContact(c),money=typeof finCustomerMoney==='function'?finCustomerMoney(c.id):null;
  return {o:{createdAt:c.createdAt||''},c,memo:{code:c.code,name:c.displayName||c.legalName,contact:p.name||'',phone:p.phone||p.mobile||'',email:p.email||'',
   terms:paymentTermsLabel(c),credit:c.creditLimit,balance:money?money.balance:null,lastOrder:custLastOrder(c.id),status:custStatusText(c),
   created:c.createdAt?salesListIsoDay(c.createdAt):'',type:c.customerType||'',group:c.group||'',area:c.area||'',rep:c.salesRep||''}};});
}
function custHeader(c){const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th class="${c.type==='number'?'n':''}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;}
function custCell(i,c){
 const x=i.c,v=salesListValue(i,c.k),none='<span class="mut">—</span>';
 if(c.k==='code')return `<td class="mono"><b>${raw(x.code||'—')}</b></td>`;
 if(c.k==='name')return `<td><b>${raw(v)}</b>${x.legalName&&x.legalName!==v?`<div class="mut">${raw(x.legalName)}</div>`:''}</td>`;
 if(c.k==='credit')return `<td class="n mono">${x.creditLimit==null?none:esc(x.currency+' '+x.creditLimit.toLocaleString('en-CA',{maximumFractionDigits:2}))}</td>`;
 if(c.k==='balance')return `<td class="n">${v==null?none:`<span class="${v>0?'fin-due':''}">${esc(typeof finFmt==='function'?finFmt(v):String(v))}</span>`}</td>`;
 if(c.k==='lastOrder'||c.k==='created')return `<td>${v?esc(salesListShortDay(v)):none}</td>`;
 if(c.k==='status')return `<td><span class="pill ${v==='Archived'?'warn':v==='On hold'?'bad':v==='Active'?'ok':'info'}">${esc(v)}</span></td>`;
 return `<td>${v==null||v===''?none:raw(String(v))}</td>`;
}
function viewCustomers(){
 return `<div class="page-head"><div><h2>Customers</h2></div></div>${cEdit!==null?customerForm():customerList()}${custMenuHTML()}${custDupHTML()}`;
}
function customerList(){
 const infos=custInfos(),rows=salesListRows(infos),cols=salesListColumns();
 const settings=`<button type="button" class="gb-settings" data-columns-button title="Columns" aria-label="Columns" onclick="salesListOpenColumns(event)">${ico('settings')}</button>`;
 return `<div class="card sales-list-card">
  <div class="sales-toolbar">${salesListDateButton('created')}<span class="sales-toolbar-sp"></span><button class="pri" data-customer-new onclick="customerNew()">+ New customer</button><button type="button" class="cust-more" data-customer-more title="Import · Export" aria-label="Import and export" onclick="custMenuOpen(event,'more')">⋯</button></div>
  <input id="customerImportMerge" type="file" accept=".csv,.json,text/csv,application/json" hidden onchange="importCustomersFile(this,'merge')">
  <input id="customerImportReplace" type="file" accept=".csv,.json,text/csv,application/json" hidden onchange="importCustomersFile(this,'replace')">
  ${salesListFilterChips()}
  <div class="sales-table-wrap"><table class="sl-table cust-table"><thead><tr><th><span class="sl-header-tools">${settings}</span></th>${cols.map(custHeader).join('')}<th></th></tr></thead>
  <tbody>${rows.map(i=>`<tr data-customer-row="${esc(i.c.id)}" ondblclick="customerEdit('${esc(i.c.id)}')" oncontextmenu="custMenuOpen(event,'row','${esc(i.c.id)}')"><td></td>${cols.map(c=>custCell(i,c)).join('')}<td class="customer-row-actions"><button class="sm" onclick="customerEdit('${esc(i.c.id)}')">Open</button></td></tr>`).join('')||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'No customers match the filters':'No customers yet'}</td></tr>`}</tbody></table></div>
  <div class="mut cust-foot">${rows.length} of ${infos.length} customers · right-click a row for more</div>
 </div>${salesListMenuHTML(infos)}`;
}
/* Меню: правая кнопка на строке — Open / Duplicate / Archive / Delete;
   «⋯» в панели — импорт и экспорт (редкие действия, не на виду). */
function custMenuOpen(e,kind,id){
 if(e){e.preventDefault();e.stopPropagation();}
 const r=e&&e.currentTarget&&kind==='more'?e.currentTarget.getBoundingClientRect():null;
 cMenu={kind,id:id||'',x:r?Math.max(8,r.right-240):(e&&e.clientX)||40,y:r?r.bottom+4:(e&&e.clientY)||40};render();
}
function custMenuClose(){cMenu=null;render();}
function custMenuHTML(){
 const m=cMenu;if(!m||tab!=='customers')return '';
 const style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-248))}px;top:${Math.max(8,Math.min(m.y,window.innerHeight-200))}px`;
 const item=(act,label,cls,dis,title)=>`<button type="button" role="menuitem" class="${cls||''}" data-cust-menu="${act}" ${dis?'disabled':''} ${title?`title="${esc(title)}"`:''} onclick="custMenuRun('${act}')">${label}</button>`;
 let body='';
 if(m.kind==='more')body=item('import','Import / update…')+item('replace','Import and replace…','dl')+'<hr>'+item('csv','Export CSV')+item('json','Export JSON');
 else{const c=(DB.customer||[]).find(x=>x.id===m.id);if(!c)return '';const used=customerHasReferences(c.id);
  body=item('open','Open')+item('duplicate','Duplicate')+item('archive',c.status==='archived'?'Restore':'Archive')+'<hr>'+item('delete','Delete','dl',used,used?'Has orders — archive instead':'');}
 return `<div class="sl-backdrop" onclick="custMenuClose()" oncontextmenu="event.preventDefault();custMenuClose()"></div><div class="sl-ctx" style="${style}" role="menu" data-cust-menu-${m.kind}>${body}</div>`;
}
function custMenuRun(act){
 const m=cMenu;cMenu=null;if(!m){render();return;}
 if(act==='import')document.getElementById('customerImportMerge').click();
 else if(act==='replace')document.getElementById('customerImportReplace').click();
 else if(act==='csv')exportCustomersCSV();
 else if(act==='json')exportCustomersJSON();
 else if(act==='open')return customerEdit(m.id);
 else if(act==='duplicate')return customerDuplicate(m.id);
 else if(act==='archive')return customerToggleArchive(m.id);
 else if(act==='delete')return customerDelete(m.id);
 render();
}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(cDup){cDup=null;render();}else if(cMenu)custMenuClose();});
function customerNew(){cMenu=null;cEdit='new';cDraft=newCustomerDraft();cTab='general';render();}
function customerEdit(id){const c=DB.customer.find(x=>x.id===id);if(!c)return;cMenu=null;cEdit=id;cDraft=JSON.parse(JSON.stringify(c));cTab='general';render();}
function customerDuplicate(id){const src=DB.customer.find(x=>x.id===id);if(!src)return;cEdit='new';cDraft=normalizeCustomer(JSON.parse(JSON.stringify(src)));cDraft.id=customerUid('CUS');cDraft.code='';cDraft.legalName+=(cDraft.legalName?' — copy':'');cDraft.displayName+=(cDraft.displayName?' — copy':'');cDraft.createdAt=new Date().toISOString();cDraft.updatedAt=cDraft.createdAt;cTab='general';render();}
function customerToggleArchive(id){const c=DB.customer.find(x=>x.id===id);if(!c)return;if(c.status==='archived'){c.status='active';c.archivedAt='';}else{c.status='archived';c.archivedAt=new Date().toISOString();}c.updatedAt=new Date().toISOString();touch();render();}
function customerDelete(id){const i=DB.customer.findIndex(x=>x.id===id);if(i<0)return;if(customerHasReferences(id)){alert('This customer is already used by orders. Deletion is blocked — archive the customer instead.');return;}if(!confirm('Delete this customer permanently?'))return;DB.customer.splice(i,1);touch();render();}
function customerTabButton(id,label){return `<button class="${cTab===id?'on':''}" onclick="cTab='${id}';render()">${label}</button>`;}
/* Карточка клиента (владелец, 3 октября 2026): General, Contacts, Addresses,
   Payment (условия, кредит, выписки и строка денег из Finance — всё про
   оплату в одном месте), Orders (его квоты и заказы, New order / New quote).
   Legacy IDs (номера из Spil) — только если они заполнены. */
function customerHasLegacy(c){return Object.values((c&&c.legacyRefs)||{}).some(v=>String(v==null?'':v).trim());}
function customerForm(){
 const c=cDraft,old=cEdit!=='new',legacy=customerHasLegacy(c);
 if(cTab==='credit'||cTab==='accounting')cTab='payment';
 if(cTab==='orders'&&!old||cTab==='legacy'&&!legacy)cTab='general';
 return `<div class="card customer-editor">
  <div class="section-title"><div><h3>${old?raw(c.displayName||c.legalName||'Customer'):'New customer'}</h3><div class="sub">${old?`Account <span class="mono" data-raw>${esc(c.code||'—')}</span>`:'Code is given on save'}</div></div><div class="row customer-editor-actions"><button class="pri" onclick="saveCustomer()">Save</button><button onclick="customerLeave(()=>{cEdit=null;cDraft=null;render();})">Cancel</button></div></div>
  <div class="tabs customer-tabs">${customerTabButton('general','General')}${customerTabButton('contacts','Contacts')}${customerTabButton('addresses','Addresses')}${customerTabButton('payment','Payment')}${old?customerTabButton('orders','Orders'):''}${legacy?customerTabButton('legacy','Legacy IDs'):''}</div>
  ${cTab==='general'?customerGeneralForm():cTab==='contacts'?customerContactsForm():cTab==='addresses'?customerAddressesForm():cTab==='payment'?customerPaymentForm():cTab==='orders'?customerOrdersTab():customerLegacyForm()}
  <div class="err" id="e_customer"></div>
 </div>`;
}
function customerPaymentForm(){
 return `${cEdit!=='new'&&typeof finCustomerStrip==='function'?finCustomerStrip(cEdit):''}${customerCreditForm()}${customerAccountingForm()}`;
}
/* Ушли из карточки с несохранёнными правками — спросить, как везде. */
function customerChanged(){
 if(!cDraft)return false;
 const saved=cEdit==='new'?null:(DB.customer||[]).find(c=>c.id===cEdit);
 return cEdit==='new'?!!(cDraft.legalName||cDraft.displayName||cDraft.code||(cDraft.contacts||[]).length):!!saved&&JSON.stringify(normalizeCustomer(JSON.parse(JSON.stringify(cDraft))))!==JSON.stringify(saved);
}
function customerLeave(go){if(!customerChanged()||confirm('Discard unsaved customer changes?'))go();}
/* Заказы клиента: те же номер, статус и суммы, что в списке Sales. */
function customerOrdersTab(){
 const id=cEdit,list=(DB.salesOrder||[]).filter(o=>o.customerId===id&&(!salesIsQuote(o)||salesQuoteRepresentative(o).id===o.id))
  .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const row=o=>{const i=salesListInfo(o),v=k=>salesListValue(i,k),total=v('total'),bal=v('balance');
  return `<tr data-customer-order="${esc(o.id)}" onclick="customerOpenOrder('${esc(o.id)}')"><td class="mono"><b>${esc(v('number')||'—')}</b></td><td>${esc(v('type'))}</td><td>${esc(v('status')||'')}</td><td>${esc(salesListShortDay(v('created'))||'—')}</td><td>${v('due')?esc(salesListShortDay(v('due'))):'<span class="mut">—</span>'}</td><td class="n">${total==null?'<span class="mut">—</span>':esc(finFmt(total))}</td><td class="n">${bal==null?'<span class="mut">—</span>':`<span class="${bal>0?'fin-due':''}">${esc(finFmt(bal))}</span>`}</td></tr>`;};
 return `<div class="section-title"><div><h3>Orders</h3><div class="sub">${list.length?customerOrdersCount(list)+' · newest first':'No quotes or orders yet'}</div></div><div class="row"><button class="pri" data-customer-new-order onclick="customerNewOrder('order')">+ New order</button><button data-customer-new-quote onclick="customerNewOrder('quote')">+ New quote</button></div></div>
  ${list.length?`<div class="sales-table-wrap"><table class="sl-table cust-orders"><thead><tr><th>Number</th><th>Type</th><th>Status</th><th>Created</th><th>Due</th><th class="n">Total</th><th class="n">Balance</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`:''}`;
}
function customerOrdersCount(list){const q=list.filter(salesIsQuote).length,o=list.length-q,n=(k,w)=>k+' '+w+(k===1?'':'s');return [o?n(o,'order'):'',q?n(q,'quote'):''].filter(Boolean).join(' · ');}
function customerToSales(go){
 customerLeave(()=>{cEdit=null;cDraft=null;cMenu=null;tab='sales';subtab=null;
  if(typeof soDraft!=='undefined'&&soDraft&&typeof salesLeaveDraft==='function')salesLeaveDraft(go);else go();});
}
function customerOpenOrder(id){customerToSales(()=>salesOrderEdit(id));}
function customerNewOrder(kind){const id=cEdit;customerToSales(()=>{salesOrderNew(kind==='quote'?'quote':'order');salesApplyCustomerDefaults(id);render();});}

/* Дубль при создании (владелец, 3 октября 2026): похожее название (без
   регистра, точек и Inc / Ltd), тот же телефон по цифрам или тот же email.
   Не запрет — окно: открыть найденного, сохранить всё равно или назад. */
function customerNameKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9а-яё]+/g,' ').replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|company)\b/g,' ').replace(/\s+/g,' ').trim();}
function customerPhones(c){return (c.contacts||[]).flatMap(x=>[x.phone,x.mobile]).map(p=>String(p||'').replace(/\D/g,'')).filter(p=>p.length>=7);}
function customerEmails(c){return (c.contacts||[]).map(x=>String(x.email||'').trim().toLowerCase()).filter(Boolean);}
function customerDuplicates(c){
 const name=[customerNameKey(c.legalName),customerNameKey(c.displayName)].filter(Boolean),phones=customerPhones(c),emails=customerEmails(c);
 return (DB.customer||[]).filter(x=>x.id!==c.id).map(x=>{const why=[];
  if(name.length&&[customerNameKey(x.legalName),customerNameKey(x.displayName)].some(n=>n&&name.includes(n)))why.push('name');
  if(phones.length&&customerPhones(x).some(p=>phones.includes(p)))why.push('phone');
  if(emails.length&&customerEmails(x).some(e=>emails.includes(e)))why.push('email');
  return why.length?{c:x,why}:null;}).filter(Boolean);
}
function custDupHTML(){
 const d=cDup;if(!d||tab!=='customers')return '';
 return `<div class="sales-service-modal-back sales-dialog-back" onclick="if(event.target===this){cDup=null;render();}"><div class="sales-service-modal sales-dialog cust-dup" role="dialog" aria-modal="true" aria-label="Possible duplicate" data-customer-dup>
  <div class="sales-service-modal-head"><div><span>Possible duplicate</span><h3>Same ${esc(d.found[0].why.join(', '))} as an existing customer</h3></div><button type="button" aria-label="Close" onclick="cDup=null;render()">×</button></div>
  <div class="sales-dialog-body">${d.found.slice(0,5).map(x=>`<div class="cust-dup-row"><b data-raw>${esc(x.c.displayName||x.c.legalName)}</b> <span class="mono" data-raw>${esc(x.c.code||'')}</span> <span class="mut">${esc(x.why.join(', '))}</span><button class="sm" onclick="cDup=null;cEdit=null;cDraft=null;customerEdit('${esc(x.c.id)}')">Open existing</button></div>`).join('')}
   <div class="row"><button class="pri" data-dup-save onclick="cDup=null;saveCustomer(true)">Save anyway</button><button onclick="cDup=null;render()">Back</button></div></div></div></div>`;
}
function customerGeneralForm(){const c=cDraft;return `<div class="form"><h3>General information</h3><div class="grid customer-grid-4">
 <div><label>Account / Customer Code</label><input value="${esc(c.code)}" placeholder="auto: C-00001" oninput="cDraft.code=this.value"></div>
 <div><label>Legal Name *</label><input value="${esc(c.legalName)}" oninput="cDraft.legalName=this.value;if(!cDraft.displayName)cDraft.displayName=this.value"></div>
 <div><label>Display Name</label><input value="${esc(c.displayName)}" oninput="cDraft.displayName=this.value"></div>
 <div><label>Status</label><select onchange="cDraft.status=this.value"><option value="active" ${c.status==='active'?'selected':''}>Active</option><option value="inactive" ${c.status==='inactive'?'selected':''}>Inactive</option><option value="archived" ${c.status==='archived'?'selected':''}>Archived</option></select></div>
 <div><label>Customer Type</label><input value="${esc(c.customerType)}" oninput="cDraft.customerType=this.value"></div><div><label>Group</label><input value="${esc(c.group)}" oninput="cDraft.group=this.value"></div><div><label>Area / Territory</label><input value="${esc(c.area)}" oninput="cDraft.area=this.value"></div><div><label>Sales Rep</label><input value="${esc(c.salesRep)}" oninput="cDraft.salesRep=this.value"></div>
 <div><label>Account Open Date</label><input type="date" value="${esc(c.accountOpenedAt)}" onchange="cDraft.accountOpenedAt=this.value"></div><div><label>TAX Number</label><input value="${esc(c.taxNumber)}" oninput="cDraft.taxNumber=this.value"></div><div><label>Registration</label><input value="${esc(c.registrationNumber)}" oninput="cDraft.registrationNumber=this.value"></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${c.isProspect?'checked':''} onchange="cDraft.isProspect=this.checked"> Prospect</label><label class="chk"><input type="checkbox" ${c.poRequired?'checked':''} onchange="cDraft.poRequired=this.checked"> PO required</label></div>
 </div><div class="grid" style="margin-top:12px"><div><label>Notes</label><textarea rows="3" oninput="cDraft.notes=this.value">${esc(c.notes)}</textarea></div><div><label>Internal Notes</label><textarea rows="3" oninput="cDraft.internalNotes=this.value">${esc(c.internalNotes)}</textarea></div></div></div>`;}
function customerContactsForm(){const c=cDraft;return `<div class="section-title"><div><h3>Contacts</h3><div class="sub">Multiple people per customer: purchasing, accounting, receiving, project manager, etc.</div></div><button class="pri" onclick="customerAddContact()">+ Contact</button></div>${c.contacts.map((x,i)=>`<div class="form customer-subrecord"><div class="customer-subrecord-head"><b>Contact ${i+1}</b><button class="sm dl" onclick="customerRemoveContact(${i})">Delete</button></div><div class="grid customer-grid-4"><div><label>Name</label><input value="${esc(x.name)}" oninput="cDraft.contacts[${i}].name=this.value"></div><div><label>Role / title</label><input value="${esc(x.role)}" oninput="cDraft.contacts[${i}].role=this.value"></div><div><label>Phone</label><input value="${esc(x.phone)}" oninput="cDraft.contacts[${i}].phone=this.value"></div><div><label>Phone 2</label><input value="${esc(x.phone2)}" oninput="cDraft.contacts[${i}].phone2=this.value"></div><div><label>Mobile</label><input value="${esc(x.mobile)}" oninput="cDraft.contacts[${i}].mobile=this.value"></div><div><label>Fax</label><input value="${esc(x.fax)}" oninput="cDraft.contacts[${i}].fax=this.value"></div><div><label>Email</label><input type="email" value="${esc(x.email)}" oninput="cDraft.contacts[${i}].email=this.value"></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${x.isPrimary?'checked':''} onchange="customerContactFlag(${i},'isPrimary',this.checked)"> Primary</label><label class="chk"><input type="checkbox" ${x.isInvoice?'checked':''} onchange="customerContactFlag(${i},'isInvoice',this.checked)"> Invoice</label><label class="chk"><input type="checkbox" ${x.isShipping?'checked':''} onchange="customerContactFlag(${i},'isShipping',this.checked)"> Shipping</label></div></div></div>`).join('')||'<div class="empty">No contacts yet</div>'}`;}
function customerAddContact(){cDraft.contacts.push(normalizeCustomerContact({}));render();}function customerRemoveContact(i){cDraft.contacts.splice(i,1);render();}function customerContactFlag(i,k,v){if(v)cDraft.contacts.forEach((x,n)=>{if(n!==i)x[k]=false;});cDraft.contacts[i][k]=v;render();}
function customerAddressesForm(){const c=cDraft;return `<div class="section-title"><div><h3>Addresses</h3><div class="sub">Billing and multiple delivery/job-site addresses can exist at the same time.</div></div><button class="pri" onclick="customerAddAddress()">+ Address</button></div>${c.addresses.map((x,i)=>`<div class="form customer-subrecord"><div class="customer-subrecord-head"><b>Address ${i+1}</b><button class="sm dl" onclick="customerRemoveAddress(${i})">Delete</button></div><div class="grid customer-grid-4"><div><label>Type</label><select onchange="cDraft.addresses[${i}].type=this.value"><option value="billing" ${x.type==='billing'?'selected':''}>Billing</option><option value="delivery" ${x.type==='delivery'?'selected':''}>Delivery</option><option value="other" ${x.type==='other'?'selected':''}>Other</option></select></div><div><label>Name</label><input value="${esc(x.label)}" placeholder="Main warehouse / Job Site" oninput="cDraft.addresses[${i}].label=this.value"></div><div><label>Addressee</label><input value="${esc(x.addressee)}" oninput="cDraft.addresses[${i}].addressee=this.value"></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${x.isDefault?'checked':''} onchange="customerAddressDefault(${i},this.checked)"> Default</label></div><div><label>Address 1</label><input value="${esc(x.address1)}" oninput="cDraft.addresses[${i}].address1=this.value"></div><div><label>Address 2</label><input value="${esc(x.address2)}" oninput="cDraft.addresses[${i}].address2=this.value"></div><div><label>Address 3</label><input value="${esc(x.address3)}" oninput="cDraft.addresses[${i}].address3=this.value"></div><div><label>City</label><input value="${esc(x.city)}" oninput="cDraft.addresses[${i}].city=this.value"></div><div><label>Province / State</label><input value="${esc(x.province)}" oninput="cDraft.addresses[${i}].province=this.value"></div><div><label>Postal Code</label><input value="${esc(x.postalCode)}" oninput="cDraft.addresses[${i}].postalCode=this.value"></div><div><label>Country</label><input value="${esc(x.country)}" oninput="cDraft.addresses[${i}].country=this.value"></div></div></div>`).join('')||'<div class="empty">No addresses yet</div>'}`;}
function customerAddAddress(){cDraft.addresses.push(normalizeCustomerAddress({type:'delivery',country:'Canada'}));render();}function customerRemoveAddress(i){cDraft.addresses.splice(i,1);render();}function customerAddressDefault(i,v){if(v)cDraft.addresses.forEach((x,n)=>{if(n!==i&&x.type===cDraft.addresses[i].type)x.isDefault=false;});cDraft.addresses[i].isDefault=v;render();}
function customerCreditForm(){const c=cDraft;return `<div class="form"><h3>Credit and commercial terms</h3><div class="grid customer-grid-4"><div><label>Payment</label><select onchange="cDraft.paymentMode=this.value;render()"><option value="cash" ${c.paymentMode!=='credit'?'selected':''}>Cash · deposit before production</option><option value="credit" ${c.paymentMode==='credit'?'selected':''}>Credit · pay within days</option></select></div>${c.paymentMode==='credit'?`<div><label>Credit Days</label><input type="number" min="0" max="365" step="1" value="${c.creditDays==null?'':esc(c.creditDays)}" placeholder="30" oninput="cDraft.creditDays=this.value"></div>`:`<div><label>Deposit %</label><input type="number" min="0" max="100" step="1" value="${c.depositPercent==null?'':esc(c.depositPercent)}" placeholder="${esc(DB.company.depositPercent)} · company default" oninput="cDraft.depositPercent=this.value"></div>`}<div><label>Currency</label><select onchange="cDraft.currency=this.value">${CUSTOMER_CURRENCIES.map(x=>`<option ${c.currency===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label>Credit Limit</label><input type="number" step="0.01" min="0" value="${c.creditLimit==null?'':esc(c.creditLimit)}" oninput="cDraft.creditLimit=this.value"></div><div><label>Credit Application Date</label><input type="date" value="${esc(c.creditApplicationDate)}" onchange="cDraft.creditApplicationDate=this.value"></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${c.onHold?'checked':''} onchange="cDraft.onHold=this.checked;render()"> On Hold</label><label class="chk"><input type="checkbox" ${c.checkTerms?'checked':''} onchange="cDraft.checkTerms=this.checked"> Check Terms</label></div><div><label>Hold Reason</label><input value="${esc(c.holdReason)}" ${c.onHold?'':'disabled'} oninput="cDraft.holdReason=this.value"></div><div><label>Delivery Method</label><input value="${esc(c.defaultDeliveryMethod)}" placeholder="Pickup / Company Truck" oninput="cDraft.defaultDeliveryMethod=this.value"></div><div><label>Deliver To</label><input value="${esc(c.deliverTo)}" oninput="cDraft.deliverTo=this.value"></div><div><label>Fuel Levy</label><select onchange="cDraft.fuelLevyMode=this.value;render()"><option value="default" ${c.fuelLevyMode==='default'?'selected':''}>Default</option><option value="custom" ${c.fuelLevyMode==='custom'?'selected':''}>Custom rate</option><option value="exempt" ${c.fuelLevyMode==='exempt'?'selected':''}>Fuel levy exempt</option></select></div><div><label>Fuel Levy Rate</label><input type="number" step="0.0001" min="0" value="${c.fuelLevyRate==null?'':esc(c.fuelLevyRate)}" ${c.fuelLevyMode==='custom'?'':'disabled'} oninput="cDraft.fuelLevyRate=this.value"></div></div></div>`;}
function customerAccountingForm(){const c=cDraft;return `<div class="form"><h3>Accounting and statements</h3><div class="grid customer-grid-4"><div><label>Statement Delivery</label><select onchange="cDraft.statementDelivery=this.value"><option value="email" ${c.statementDelivery==='email'?'selected':''}>Email</option><option value="print" ${c.statementDelivery==='print'?'selected':''}>Print</option><option value="both" ${c.statementDelivery==='both'?'selected':''}>Email + print</option><option value="none" ${c.statementDelivery==='none'?'selected':''}>Do not send</option></select></div><div><label>Statement Email</label><input type="email" value="${esc(c.statementEmail)}" oninput="cDraft.statementEmail=this.value"></div><div><label>Invoice Email</label><input type="email" value="${esc(c.invoiceEmail)}" oninput="cDraft.invoiceEmail=this.value"></div><div><label>TAX Exempt</label><label class="chk"><input type="checkbox" ${c.taxExempt?'checked':''} onchange="cDraft.taxExempt=this.checked;render()"> Tax Exempt</label></div><div><label>Tax Exemption Number</label><input value="${esc(c.taxExemptionNumber)}" ${c.taxExempt?'':'disabled'} oninput="cDraft.taxExemptionNumber=this.value"></div></div></div>`;}
function customerLegacyForm(){const l=cDraft.legacyRefs||normalizeLegacyRefs({});cDraft.legacyRefs=l;return `<div class="note">Legacy IDs are preserved for migration and reconciliation with the old system. They are not business keys in the new ERP.</div><div class="form"><h3>Legacy / migration references</h3><div class="grid customer-grid-4"><div><label>Source System</label><input value="${esc(l.sourceSystem)}" oninput="cDraft.legacyRefs.sourceSystem=this.value"></div>${[['dcLink','DCLink'],['flid','FLID'],['iClassID','iClassID'],['repID','RepID'],['iAreasID','iAreasID'],['uiARDeliveryMethod','uiARDeliveryMethod'],['uiARCATID','uiARCATID'],['accountStatusID','AccountStatusID'],['iwg','I.W.G']].map(x=>`<div><label>${x[1]}</label><input value="${esc(l[x[0]])}" oninput="cDraft.legacyRefs.${x[0]}=this.value"></div>`).join('')}</div></div>`;}
function saveCustomer(force){
 const e=document.getElementById('e_customer');e.style.display='none';
 cDraft=normalizeCustomer(cDraft);cDraft.legalName=customerString(cDraft.legalName);cDraft.displayName=customerString(cDraft.displayName)||cDraft.legalName;
 if(!cDraft.legalName)return fail(e,'Enter Legal Name');
 if(!cDraft.code)cDraft.code=nextCustomerCode();
 if(DB.customer.some(c=>c.id!==cDraft.id&&String(c.code).toUpperCase()===String(cDraft.code).toUpperCase()))return fail(e,'Customer Code is already in use');
 if(cEdit==='new'&&force!==true){const found=customerDuplicates(cDraft);if(found.length){cDup={found};render();return;}}
 if(cDraft.onHold&&!cDraft.holdReason)cDraft.holdReason='Management hold';
 cDraft.updatedAt=new Date().toISOString();if(!cDraft.createdAt)cDraft.createdAt=cDraft.updatedAt;if(cDraft.status==='archived'&&!cDraft.archivedAt)cDraft.archivedAt=cDraft.updatedAt;if(cDraft.status!=='archived')cDraft.archivedAt='';
 /* Форма закрывается только после записи: при отказе правки остаются (аудит 05.10.2026). */
 const rec=JSON.parse(JSON.stringify(cDraft)),edit=cEdit;
 const out=storageCommand(()=>{if(edit==='new')DB.customer.push(rec);else{const i=DB.customer.findIndex(c=>c.id===edit);if(i>=0)DB.customer[i]=rec;else DB.customer.push(rec);}normalizeCustomers();return true;});
 if(!out.ok)return fail(e,out.error);
 cEdit=null;cDraft=null;render();
}
