/* =====================================================================
   view/customers  ·  customers-2.0
   Клиенты: таблица на общем движке Sales, карточка из пяти вкладок,
   заказы клиента, экспорт в меню «⋯», предупреждение о дубле.
   IN : DB.customer, DB.salesOrder, DB.company; прайс-группы (erp/sales/price-lists),
        балансы (erp/finance/ledger)
   OUT: экран Customers (viewCustomers); правка карточки пишет DB.customer
   ===================================================================== */

let cEdit=null,cDraft=null,cSeen='',cTab='general',cMenu=null,cDup=null;
/* Начатая форма: новая версия ERP не перезагружает вкладку сама (erp/storage). */
(window.STORAGE_UNSAVED=window.STORAGE_UNSAVED||[]).push(()=>customerChanged());
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
   created:c.createdAt?salesListIsoDay(c.createdAt):'',type:c.customerType||'',group:customerGroupName(c),area:c.area||'',rep:c.salesRep||''}};});
}
function custHeader(c){return salesListHead(c);}
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
/* Отмеченный клиент: Open / Duplicate / Archive / Delete — сверху, как в меню
   правой кнопки (вид Sales, владелец 03.11.2026). */
let custSel='';
function custSelect(id,on){custSel=on?id:'';render();}
function custMenuCloseRight(ev){ev.preventDefault();custMenuClose();}
function customerList(){
 const infos=custInfos(),rows=salesListRows(infos),cols=salesListColumns();
 if(custSel&&!rows.some(i=>i.c.id===custSel))custSel='';
 const sel=custSel&&(DB.customer||[]).find(x=>x.id===custSel),used=sel&&customerHasReferences(sel.id),q=(act,label,fn,cls,dis,title)=>`<button type="button" class="sl-quiet${cls?' '+cls:''}" data-cust-act="${act}" ${sel&&!dis?'':'disabled'} ${title?`title="${esc(title)}"`:''} ${onAct('click',fn,custSel)}>${label}</button>`;
 const acts=(sel?`<b class="oq-sel" title="${esc(salesCustomerDisplay(sel.id))}">1 selected</b>`:'')+q('open','Open',customerEdit)+q('duplicate','Duplicate',customerDuplicate)+q('archive',sel&&sel.status==='archived'?'Restore':'Archive',customerToggleArchive)+q('delete','Delete',customerDelete,'sl-delete-quiet',used,used?'Has orders — archive instead':'');
 const settings=`<button type="button" class="gb-settings" data-columns-button title="Columns" aria-label="Columns" ${onAct('click',salesListOpenColumns,EVENT)}>${ico('settings')}</button>`;
 return `<div class="card sales-list-card sl-foot-pin">
  <div class="sales-toolbar">${acts}<span class="sales-toolbar-sp"></span>${salesListDateButton('created')}<button class="pri" data-customer-new ${onAct('click',customerNew)}>+ New customer</button><button type="button" class="cust-more" data-customer-more title="Export" aria-label="Export" ${onAct('click',custMenuOpen,EVENT,'more')}>⋯</button></div>
  ${salesListFilterChips()}
  <div class="sales-table-wrap">${(cw=>`<table class="sl-table cust-table${cw.cls}"${cw.attrs}>${cw.col}`)(salesListCwTable(cols.map(c=>c.k),[44],20))}<thead><tr><th class="sl-check"><span class="sl-header-tools">${settings}</span></th>${cols.map(custHeader).join('')}<th></th></tr></thead>
  <tbody>${rows.map(i=>`<tr data-customer-row="${esc(i.c.id)}"${custSel===i.c.id?' class="oq-selected"':''} ${onAct('dblclick',customerEdit,String(i.c.id??''))} ${onAct('contextmenu',custMenuOpen,EVENT,'row',String(i.c.id??''))}><td class="sl-check"><input type="checkbox" aria-label="Select ${esc(i.c.id)}" ${custSel===i.c.id?'checked':''} ${onAct('change',custSelect,String(i.c.id??''),EL_CHECKED)}></td>${cols.map(c=>custCell(i,c)).join('')}<td></td></tr>`).join('')||`<tr><td colspan="${cols.length+2}" class="empty">${infos.length?'No customers match the filters':'No customers yet'}</td></tr>`}</tbody>${rows.length?(lead=>`<tfoot><tr class="sl-foot"><td colspan="${lead+1}" class="sl-foot-head"><b>${rows.length} of ${infos.length} customers</b></td>${cols.slice(lead).map(c=>salesListCalcCell(c,rows)).join('')}<td></td></tr></tfoot>`)(Math.max(0,cols.findIndex(c=>salesListCalc(c)!=='none'))):''}</table></div>
 </div>${salesListMenuHTML(infos)}`;
}
/* Меню: правая кнопка на строке — Open / Duplicate / Archive / Delete;
   «⋯» в панели — экспорт (редкое действие, не на виду). */
function custMenuOpen(e,kind,id){
 if(e){e.preventDefault();e.stopPropagation();}
 const r=e&&e.currentTarget&&kind==='more'?e.currentTarget.getBoundingClientRect():null;
 cMenu={kind,id:id||'',x:r?Math.max(8,r.right-240):(e&&e.clientX)||40,y:r?r.bottom+4:(e&&e.clientY)||40};render();
}
function custMenuClose(){cMenu=null;render();}
function custMenuHTML(){
 const m=cMenu;if(!m||tab!=='customers')return '';
 const style=`left:${Math.max(8,Math.min(m.x,window.innerWidth-248))}px;top:${Math.max(8,Math.min(m.y,window.innerHeight-200))}px`;
 const item=(act,label,cls,dis,title)=>`<button type="button" role="menuitem" class="${cls||''}" data-cust-menu="${act}" ${dis?'disabled':''} ${title?`title="${esc(title)}"`:''} ${onAct('click',custMenuRun,String(act))}>${label}</button>`;
 let body='';
 if(m.kind==='more')body=item('csv','Export CSV')+item('json','Export JSON');
 else{const c=(DB.customer||[]).find(x=>x.id===m.id);if(!c)return '';const used=customerHasReferences(c.id);
  body=item('open','Open')+item('duplicate','Duplicate')+item('archive',c.status==='archived'?'Restore':'Archive')+'<hr>'+item('delete','Delete','dl',used,used?'Has orders — archive instead':'');}
 return `<div class="sl-backdrop" ${onAct('click',custMenuClose)} ${onAct('contextmenu',custMenuCloseRight,EVENT)}></div><div class="sl-ctx" style="${style}" role="menu" data-cust-menu-${m.kind}>${body}</div>`;
}
function custMenuRun(act){
 const m=cMenu;cMenu=null;if(!m){render();return;}
 if(act==='csv')exportCustomersCSV();
 else if(act==='json')exportCustomersJSON();
 else if(act==='open')return customerEdit(m.id);
 else if(act==='duplicate')return customerDuplicate(m.id);
 else if(act==='archive')return customerToggleArchive(m.id);
 else if(act==='delete')return customerDelete(m.id);
 render();
}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(cDup){cDup=null;render();}else if(cMenu)custMenuClose();});
function customerNew(){cMenu=null;cEdit='new';cDraft=newCustomerDraft();cTab='general';render();}
/* cSeen — updatedAt карточки, какой её открыли: по нему Save узнаёт чужую
   правку из другой вкладки (аудит 19.10.2026, F08). */
function customerEdit(id){const c=DB.customer.find(x=>x.id===id);if(!c)return;cMenu=null;cEdit=id;cDraft=JSON.parse(JSON.stringify(c));cSeen=c.updatedAt||'';cTab='general';render();}
function customerDuplicate(id){const src=DB.customer.find(x=>x.id===id);if(!src)return;cEdit='new';cDraft=normalizeCustomer(JSON.parse(JSON.stringify(src)));cDraft.id=customerUid('CUS');cDraft.code='';cDraft.legalName+=(cDraft.legalName?' — copy':'');cDraft.displayName+=(cDraft.displayName?' — copy':'');cDraft.createdAt=new Date().toISOString();cDraft.updatedAt=cDraft.createdAt;cTab='general';render();}
function customerToggleArchive(id){const c=DB.customer.find(x=>x.id===id);if(!c)return;if(c.status==='archived'){c.status='active';c.archivedAt='';}else{c.status='archived';c.archivedAt=new Date().toISOString();}c.updatedAt=new Date().toISOString();touch();render();}
function customerDelete(id){const i=DB.customer.findIndex(x=>x.id===id);if(i<0)return;if(customerHasReferences(id)){alert('This customer is already used by orders. Deletion is blocked — archive the customer instead.');return;}if(!confirm('Delete this customer permanently?'))return;DB.customer.splice(i,1);touch();render();}
function customerTabButton(id,label){return `<button class="${cTab===id?'on':''}" ${onAct('click',cTabGo,String(id))}>${label}</button>`;}
/* Карточка клиента (владелец, 3 октября 2026): General, Contacts, Addresses,
   Payment (условия, кредит, выписки и строка денег из Finance — всё про
   оплату в одном месте), Orders (его квоты и заказы, New order / New quote).
   Legacy IDs (номера из Spil) — только если они заполнены. */
function customerHasLegacy(c){return Object.values((c&&c.legacyRefs)||{}).some(v=>String(v==null?'':v).trim());}
function customerForm(){
 const c=cDraft,old=cEdit!=='new',legacy=customerHasLegacy(c);
 if(cTab==='credit'||cTab==='accounting')cTab='payment';
 if((cTab==='orders'||cTab==='prices')&&!old||cTab==='legacy'&&!legacy)cTab='general';
 return `<div class="card customer-editor">
  <div class="section-title"><div><h3>${old?raw(c.displayName||c.legalName||'Customer'):'New customer'}</h3><div class="sub">${old?`Account <span class="mono" data-raw>${esc(c.code||'—')}</span>`:'Code is given on save'}</div></div><div class="row customer-editor-actions"><button class="pri" ${onAct('click',saveCustomer)}>Save</button><button ${onAct('click',customerCancelEdit)}>Cancel</button></div></div>
  <div class="tabs customer-tabs">${customerTabButton('general','General')}${customerTabButton('contacts','Contacts')}${customerTabButton('addresses','Addresses')}${customerTabButton('payment','Payment')}${old?customerTabButton('prices','Prices'):''}${old?customerTabButton('orders','Orders'):''}${legacy?customerTabButton('legacy','Legacy IDs'):''}</div>
  ${cTab==='general'?customerGeneralForm():cTab==='contacts'?customerContactsForm():cTab==='addresses'?customerAddressesForm():cTab==='payment'?customerPaymentForm():cTab==='orders'?customerOrdersTab():cTab==='prices'?customerPricesTab():customerLegacyForm()}
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
/* Заказы клиента: те же номер, статус и суммы, что в списке Sales; ушедшие
   в архив — тут же, с серой меткой Archived (erp/archive). */
function customerOrdersTab(){
 const id=cEdit,old=typeof archiveListInfos==='function'?archiveListInfos(a=>a.customerId===id):[];
 const list=(DB.salesOrder||[]).filter(o=>o.customerId===id&&(!salesIsQuote(o)||salesQuoteRepresentative(o).id===o.id)).map(salesListInfo).concat(old)
  .sort((a,b)=>String(b.o.createdAt||'').localeCompare(String(a.o.createdAt||'')));
 const row=i=>{const o=i.o,v=k=>salesListValue(i,k),total=v('total'),bal=v('balance');
  return `<tr data-customer-order="${esc(o.id)}"${i.a?' class="sl-row-archived"':''} ${onAct('click',i.a?customerOpenArchived:customerOpenOrder,String(o.id??''))}><td class="mono"><b>${esc(v('number')||'—')}</b></td><td>${esc(v('type'))}</td><td>${esc(v('status')||'')}${i.a?' <span class="pill archived" data-archived>Archived</span>':''}</td><td>${esc(salesListShortDay(v('created'))||'—')}</td><td>${v('due')?esc(salesListShortDay(v('due'))):'<span class="mut">—</span>'}</td><td class="n">${total==null?'<span class="mut">—</span>':esc(finFmt(total))}</td><td class="n">${bal==null?'<span class="mut">—</span>':`<span class="${bal>0?'fin-due':''}">${esc(finFmt(bal))}</span>`}</td></tr>`;};
 return `<div class="section-title"><div><h3>Orders</h3><div class="sub">${list.length?customerOrdersCount(list)+' · newest first':'No quotes or orders yet'}</div></div><div class="row"><button class="pri" data-customer-new-order ${onAct('click',customerNewOrder,'order')}>+ New order</button><button data-customer-new-quote ${onAct('click',customerNewOrder,'quote')}>+ New quote</button></div></div>
  ${list.length?`<div class="sales-table-wrap">${slFromTable('custOrders',`<table class="sl-table cust-orders"><thead><tr><th>Number</th><th>Type</th><th>Status</th><th>Created</th><th>Due</th><th class="n">Total</th><th class="n">Balance</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`)}</div>`:''}`;
}
function customerOrdersCount(list){const q=list.filter(i=>i.q).length,o=list.length-q,n=(k,w)=>k+' '+w+(k===1?'':'s');return [o?n(o,'order'):'',q?n(q,'quote'):''].filter(Boolean).join(' · ');}
function customerToSales(go){
 customerLeave(()=>{cEdit=null;cDraft=null;cMenu=null;tab='sales';subtab=null;
  if(typeof soDraft!=='undefined'&&soDraft&&typeof salesLeaveDraft==='function')salesLeaveDraft(go);else go();});
}
function customerOpenOrder(id){customerToSales(()=>salesOrderEdit(id));}
function customerOpenArchived(id){customerToSales(()=>{archiveOpenWork(id);});}
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
 return `<div class="sales-service-modal-back sales-dialog-back" ${onActSelf('click',custDupClose)}><div class="sales-service-modal sales-dialog cust-dup" role="dialog" aria-modal="true" aria-label="Possible duplicate" data-customer-dup>
  <div class="sales-service-modal-head"><div><span>Possible duplicate</span><h3>Same ${esc(d.found[0].why.join(', '))} as an existing customer</h3></div><button type="button" aria-label="Close" ${onAct('click',custDupClose)}>×</button></div>
  <div class="sales-dialog-body">${d.found.slice(0,5).map(x=>`<div class="cust-dup-row"><b data-raw>${esc(x.c.displayName||x.c.legalName)}</b> <span class="mono" data-raw>${esc(x.c.code||'')}</span> <span class="mut">${esc(x.why.join(', '))}</span><button class="sm" ${onAct('click',custDupOpen,String(x.c.id??''))}>Open existing</button></div>`).join('')}
   <div class="row"><button class="pri" data-dup-save ${onAct('click',saveCustomerAnyway)}>Save anyway</button><button ${onAct('click',custDupClose)}>Back</button></div></div></div></div>`;
}
function customerGeneralForm(){const c=cDraft;return `<div class="form"><h3>General information</h3><div class="grid customer-grid-4">
 <div><label>Account / Customer Code</label><input value="${esc(c.code)}" placeholder="auto: C-00001" ${onAct('input',custSet,'code',EL_VALUE)}></div>
 <div><label>Legal Name *</label><input value="${esc(c.legalName)}" ${onAct('input',custSetLegal,EL_VALUE)}></div>
 <div><label>Display Name</label><input value="${esc(c.displayName)}" ${onAct('input',custSet,'displayName',EL_VALUE)}></div>
 <div><label>Status</label><select ${onAct('change',custSet,'status',EL_VALUE)}><option value="active" ${c.status==='active'?'selected':''}>Active</option><option value="inactive" ${c.status==='inactive'?'selected':''}>Inactive</option><option value="archived" ${c.status==='archived'?'selected':''}>Archived</option></select></div>
 <div><label>Customer Type</label><input value="${esc(c.customerType)}" ${onAct('input',custSet,'customerType',EL_VALUE)}></div><div><label>Group</label>${customerGroupSelect(c)}</div><div><label>Area / Territory</label><input value="${esc(c.area)}" ${onAct('input',custSet,'area',EL_VALUE)}></div><div><label>Sales Rep</label><input value="${esc(c.salesRep)}" ${onAct('input',custSet,'salesRep',EL_VALUE)}></div>
 <div><label>Account Open Date</label><input type="date" value="${esc(c.accountOpenedAt)}" ${onAct('change',custSet,'accountOpenedAt',EL_VALUE)}></div><div><label>TAX Number</label><input value="${esc(c.taxNumber)}" ${onAct('input',custSet,'taxNumber',EL_VALUE)}></div><div><label>Registration</label><input value="${esc(c.registrationNumber)}" ${onAct('input',custSet,'registrationNumber',EL_VALUE)}></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${c.isProspect?'checked':''} ${onAct('change',custSet,'isProspect',EL_CHECKED)}> Prospect</label><label class="chk"><input type="checkbox" ${c.poRequired?'checked':''} ${onAct('change',custSet,'poRequired',EL_CHECKED)}> PO required</label></div>
 </div><div class="grid" style="margin-top:12px"><div><label>Notes</label><textarea rows="3" ${onAct('input',custSet,'notes',EL_VALUE)}>${esc(c.notes)}</textarea></div><div><label>Internal Notes</label><textarea rows="3" ${onAct('input',custSet,'internalNotes',EL_VALUE)}>${esc(c.internalNotes)}</textarea></div></div></div>`;}
function customerContactsForm(){const c=cDraft;return `<div class="section-title"><div><h3>Contacts</h3><div class="sub">Multiple people per customer: purchasing, accounting, receiving, project manager, etc.</div></div><button class="pri" ${onAct('click',customerAddContact)}>+ Contact</button></div>${c.contacts.map((x,i)=>`<div class="form customer-subrecord"><div class="customer-subrecord-head"><b>Contact ${i+1}</b><button class="sm dl" ${onAct('click',customerRemoveContact,i)}>Delete</button></div><div class="grid customer-grid-4"><div><label>Name</label><input value="${esc(x.name)}" ${onAct('input',custSetRow,'contacts',i,'name',EL_VALUE)}></div><div><label>Role / title</label><input value="${esc(x.role)}" ${onAct('input',custSetRow,'contacts',i,'role',EL_VALUE)}></div><div><label>Phone</label><input value="${esc(x.phone)}" ${onAct('input',custSetRow,'contacts',i,'phone',EL_VALUE)}></div><div><label>Phone 2</label><input value="${esc(x.phone2)}" ${onAct('input',custSetRow,'contacts',i,'phone2',EL_VALUE)}></div><div><label>Mobile</label><input value="${esc(x.mobile)}" ${onAct('input',custSetRow,'contacts',i,'mobile',EL_VALUE)}></div><div><label>Fax</label><input value="${esc(x.fax)}" ${onAct('input',custSetRow,'contacts',i,'fax',EL_VALUE)}></div><div><label>Email</label><input type="email" value="${esc(x.email)}" ${onAct('input',custSetRow,'contacts',i,'email',EL_VALUE)}></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${x.isPrimary?'checked':''} ${onAct('change',customerContactFlag,i,'isPrimary',EL_CHECKED)}> Primary</label><label class="chk"><input type="checkbox" ${x.isInvoice?'checked':''} ${onAct('change',customerContactFlag,i,'isInvoice',EL_CHECKED)}> Invoice</label><label class="chk"><input type="checkbox" ${x.isShipping?'checked':''} ${onAct('change',customerContactFlag,i,'isShipping',EL_CHECKED)}> Shipping</label></div></div></div>`).join('')||'<div class="empty">No contacts yet</div>'}`;}
function customerAddContact(){cDraft.contacts.push(normalizeCustomerContact({}));render();}function customerRemoveContact(i){cDraft.contacts.splice(i,1);render();}function customerContactFlag(i,k,v){if(v)cDraft.contacts.forEach((x,n)=>{if(n!==i)x[k]=false;});cDraft.contacts[i][k]=v;render();}
function customerAddressesForm(){const c=cDraft;return `<div class="section-title"><div><h3>Addresses</h3><div class="sub">Billing and multiple delivery/job-site addresses can exist at the same time.</div></div><button class="pri" ${onAct('click',customerAddAddress)}>+ Address</button></div>${c.addresses.map((x,i)=>`<div class="form customer-subrecord"><div class="customer-subrecord-head"><b>Address ${i+1}</b><button class="sm dl" ${onAct('click',customerRemoveAddress,i)}>Delete</button></div><div class="grid customer-grid-4"><div><label>Type</label><select ${onAct('change',custSetRow,'addresses',i,'type',EL_VALUE)}><option value="billing" ${x.type==='billing'?'selected':''}>Billing</option><option value="delivery" ${x.type==='delivery'?'selected':''}>Delivery</option><option value="other" ${x.type==='other'?'selected':''}>Other</option></select></div><div><label>Name</label><input value="${esc(x.label)}" placeholder="Main warehouse / Job Site" ${onAct('input',custSetRow,'addresses',i,'label',EL_VALUE)}></div><div><label>Addressee</label><input value="${esc(x.addressee)}" ${onAct('input',custSetRow,'addresses',i,'addressee',EL_VALUE)}></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${x.isDefault?'checked':''} ${onAct('change',customerAddressDefault,i,EL_CHECKED)}> Default</label></div><div><label>Address 1</label><input value="${esc(x.address1)}" ${onAct('input',custSetRow,'addresses',i,'address1',EL_VALUE)}></div><div><label>Address 2</label><input value="${esc(x.address2)}" ${onAct('input',custSetRow,'addresses',i,'address2',EL_VALUE)}></div><div><label>Address 3</label><input value="${esc(x.address3)}" ${onAct('input',custSetRow,'addresses',i,'address3',EL_VALUE)}></div><div><label>City</label><input value="${esc(x.city)}" ${onAct('input',custSetRow,'addresses',i,'city',EL_VALUE)}></div><div><label>Province / State</label><input value="${esc(x.province)}" ${onAct('input',custSetRow,'addresses',i,'province',EL_VALUE)}></div><div><label>Postal Code</label><input value="${esc(x.postalCode)}" ${onAct('input',custSetRow,'addresses',i,'postalCode',EL_VALUE)}></div><div><label>Country</label><input value="${esc(x.country)}" ${onAct('input',custSetRow,'addresses',i,'country',EL_VALUE)}></div></div></div>`).join('')||'<div class="empty">No addresses yet</div>'}`;}
function customerAddAddress(){cDraft.addresses.push(normalizeCustomerAddress({type:'delivery',country:'Canada'}));render();}function customerRemoveAddress(i){cDraft.addresses.splice(i,1);render();}function customerAddressDefault(i,v){if(v)cDraft.addresses.forEach((x,n)=>{if(n!==i&&x.type===cDraft.addresses[i].type)x.isDefault=false;});cDraft.addresses[i].isDefault=v;render();}
function customerCreditForm(){const c=cDraft;return `<div class="form"><h3>Credit and commercial terms</h3><div class="grid customer-grid-4"><div><label>Payment</label><select ${onAct('change',custSet,'paymentMode',EL_VALUE,true)}><option value="cash" ${c.paymentMode!=='credit'?'selected':''}>Cash · deposit before production</option><option value="credit" ${c.paymentMode==='credit'?'selected':''}>Credit · pay within days</option></select></div>${c.paymentMode==='credit'?`<div><label>Credit Days</label><input type="number" min="0" max="365" step="1" value="${c.creditDays==null?'':esc(c.creditDays)}" placeholder="30" ${onAct('input',custSet,'creditDays',EL_VALUE)}></div>`:`<div><label>Deposit %</label><input type="number" min="0" max="100" step="1" value="${c.depositPercent==null?'':esc(c.depositPercent)}" placeholder="${esc(DB.company.depositPercent)} · company default" ${onAct('input',custSet,'depositPercent',EL_VALUE)}></div>`}<div><label>Currency</label><select ${onAct('change',custSet,'currency',EL_VALUE)}>${CUSTOMER_CURRENCIES.map(x=>`<option ${c.currency===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label>Credit Limit</label><input type="number" step="0.01" min="0" value="${c.creditLimit==null?'':esc(c.creditLimit)}" ${onAct('input',custSet,'creditLimit',EL_VALUE)}></div><div><label>Credit Application Date</label><input type="date" value="${esc(c.creditApplicationDate)}" ${onAct('change',custSet,'creditApplicationDate',EL_VALUE)}></div><div class="customer-checks"><label class="chk"><input type="checkbox" ${c.onHold?'checked':''} ${onAct('change',custSet,'onHold',EL_CHECKED,true)}> On Hold</label><label class="chk"><input type="checkbox" ${c.checkTerms?'checked':''} ${onAct('change',custSet,'checkTerms',EL_CHECKED)}> Check Terms</label></div><div><label>Hold Reason</label><input value="${esc(c.holdReason)}" ${c.onHold?'':'disabled'} ${onAct('input',custSet,'holdReason',EL_VALUE)}></div><div><label>Delivery Method</label><input value="${esc(c.defaultDeliveryMethod)}" placeholder="Pickup / Company Truck" ${onAct('input',custSet,'defaultDeliveryMethod',EL_VALUE)}></div><div><label>Deliver To</label><input value="${esc(c.deliverTo)}" ${onAct('input',custSet,'deliverTo',EL_VALUE)}></div><div><label>Fuel Levy</label><select ${onAct('change',custSet,'fuelLevyMode',EL_VALUE,true)}><option value="default" ${c.fuelLevyMode==='default'?'selected':''}>Default</option><option value="custom" ${c.fuelLevyMode==='custom'?'selected':''}>Custom rate</option><option value="exempt" ${c.fuelLevyMode==='exempt'?'selected':''}>Fuel levy exempt</option></select></div><div><label>Fuel Levy Rate</label><input type="number" step="0.0001" min="0" value="${c.fuelLevyRate==null?'':esc(c.fuelLevyRate)}" ${c.fuelLevyMode==='custom'?'':'disabled'} ${onAct('input',custSet,'fuelLevyRate',EL_VALUE)}></div></div></div>`;}
function customerAccountingForm(){const c=cDraft;return `<div class="form"><h3>Accounting and statements</h3><div class="grid customer-grid-4"><div><label>Statement Delivery</label><select ${onAct('change',custSet,'statementDelivery',EL_VALUE)}><option value="email" ${c.statementDelivery==='email'?'selected':''}>Email</option><option value="print" ${c.statementDelivery==='print'?'selected':''}>Print</option><option value="both" ${c.statementDelivery==='both'?'selected':''}>Email + print</option><option value="none" ${c.statementDelivery==='none'?'selected':''}>Do not send</option></select></div><div><label>Statement Email</label><input type="email" value="${esc(c.statementEmail)}" ${onAct('input',custSet,'statementEmail',EL_VALUE)}></div><div><label>Invoice Email</label><input type="email" value="${esc(c.invoiceEmail)}" ${onAct('input',custSet,'invoiceEmail',EL_VALUE)}></div><div><label>TAX Exempt</label><label class="chk"><input type="checkbox" ${c.taxExempt?'checked':''} ${onAct('change',custSet,'taxExempt',EL_CHECKED,true)}> Tax Exempt</label></div><div><label>Tax Exemption Number</label><input value="${esc(c.taxExemptionNumber)}" ${c.taxExempt?'':'disabled'} ${onAct('input',custSet,'taxExemptionNumber',EL_VALUE)}></div></div></div>`;}
function customerLegacyForm(){const l=cDraft.legacyRefs||normalizeLegacyRefs({});cDraft.legacyRefs=l;return `<div class="note">Legacy IDs are preserved for migration and reconciliation with the old system. They are not business keys in the new ERP.</div><div class="form"><h3>Legacy / migration references</h3><div class="grid customer-grid-4"><div><label>Source System</label><input value="${esc(l.sourceSystem)}" ${onAct('input',custSetLegacy,'sourceSystem',EL_VALUE)}></div>${[['dcLink','DCLink'],['flid','FLID'],['iClassID','iClassID'],['repID','RepID'],['iAreasID','iAreasID'],['uiARDeliveryMethod','uiARDeliveryMethod'],['uiARCATID','uiARCATID'],['accountStatusID','AccountStatusID'],['iwg','I.W.G']].map(x=>`<div><label>${x[1]}</label><input value="${esc(l[x[0]])}" ${onAct('input',custSetLegacy,String(x[0]),EL_VALUE)}></div>`).join('')}</div></div>`;}
/* Поля карточки клиента: пишут в черновик cDraft; redraw — поле меняет вид формы. */
function custSet(key,v,redraw){cDraft[key]=v;if(redraw)render();}
function custSetRow(list,i,key,v){cDraft[list][i][key]=v;}
function custSetLegacy(key,v){cDraft.legacyRefs[key]=v;}
/* Legal name заполняет и пустое Display name. */
function custSetLegal(v){cDraft.legalName=v;if(!cDraft.displayName)cDraft.displayName=v;}
function cTabGo(id){cTab=id;render();}
function customerCancelEdit(){customerLeave(()=>{cEdit=null;cDraft=null;render();});}
function custDupClose(){cDup=null;render();}
function custDupOpen(id){cDup=null;cEdit=null;cDraft=null;customerEdit(id);}
/* Имя на save…: кнопку база запирает на время записи (storageLockButtons). */
function saveCustomerAnyway(){cDup=null;saveCustomer(true);}
function saveCustomer(force){
 const e=document.getElementById('e_customer');e.style.display='none';
 /* Старая форма не пишет поверх чужой правки и не возвращает удалённого;
    набранное остаётся в форме. */
 if(cEdit!=='new'){const cur=DB.customer.find(c=>c.id===cEdit);
  if(!cur)return fail(e,'This customer was deleted');
  if((cur.updatedAt||'')!==cSeen)return fail(e,'Changed elsewhere — reopen');}
 cDraft=normalizeCustomer(cDraft);cDraft.legalName=customerString(cDraft.legalName);cDraft.displayName=customerString(cDraft.displayName)||cDraft.legalName;
 if(!cDraft.legalName)return fail(e,'Enter Legal Name');
 if(!cDraft.code)cDraft.code=nextCustomerCode();
 if(DB.customer.some(c=>c.id!==cDraft.id&&String(c.code).toUpperCase()===String(cDraft.code).toUpperCase()))return fail(e,'Customer Code is already in use');
 if(cEdit==='new'&&force!==true){const found=customerDuplicates(cDraft);if(found.length){cDup={found};render();return;}}
 if(cDraft.onHold&&!cDraft.holdReason)cDraft.holdReason='Management hold';
 cDraft.updatedAt=new Date().toISOString();if(!cDraft.createdAt)cDraft.createdAt=cDraft.updatedAt;if(cDraft.status==='archived'&&!cDraft.archivedAt)cDraft.archivedAt=cDraft.updatedAt;if(cDraft.status!=='archived')cDraft.archivedAt='';
 /* Форма закрывается только после записи: при отказе правки остаются (аудит 05.10.2026). */
 const rec=JSON.parse(JSON.stringify(cDraft)),edit=cEdit;
 const out=storageCommand(()=>{if(edit==='new')DB.customer.push(rec);else DB.customer=DB.customer.map(c=>c.id===edit?rec:c);normalizeCustomers();return true;});
 if(!out.ok)return fail(e,out.error);
 cEdit=null;cDraft=null;render();
}
