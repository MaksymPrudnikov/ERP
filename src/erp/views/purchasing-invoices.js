/* Supplier ledger UI. Payments record bank/card/check facts; this screen
   does not initiate transfers. Every list uses the existing Sales filters. */
let purMoneyDraft=null,purMoneyOriginal='',purMoneyShowUndone=false,purAccountKey='';
function purMoneyLeave(){if(purMoneyDraft&&JSON.stringify(purMoneyDraft)!==purMoneyOriginal&&!confirm('Discard unsaved invoice or payment changes?'))return false;purMoneyDraft=null;purAccountKey='';return true;}
function purMoneyEdit(kind,id,invoiceId,poId){
 if(!accessCan('purchasing')||!purMoneyLeave()||!purFulfilLeave()||!purOrderLeave())return;
 const old=id?purMoneyFind(kind,id):null;if(id&&!old)return;
 purNewSupplier=null;purSupplierDraft=null;purView=kind==='invoice'?'invoices':'payments';purMoneyDraft={kind,data:purClone(old||purMoneyClean({date:finToday(),method:kind==='payment'?'Bank transfer':''}))};purNotice='';
 if(invoiceId)purMoneyPickInvoice(invoiceId,false);if(poId)purInvoiceAddPO(poId,false);purMoneyOriginal=JSON.stringify(purMoneyDraft);render();
}
function purMoneySetSupplier(id){
 const d=purMoneyDraft.data,s=purSupplierFind(id);d.supplierId=id;d.supplierName=s?s.name:'';if(s){d.paymentDays=s.paymentDays;if(purMoneyDraft.kind==='payment')d.method=s.paymentMethod;if(!d.dueDate)d.dueDate=purInvoiceDue(d.date,d.paymentDays);}render();
}
function purMoneyPickInvoice(id,draw){
 const d=purMoneyDraft.data,inv=purMoneyFind('invoice',id);d.invoiceId=id;
 if(inv&&!d.id){d.supplierId=inv.supplierId;d.supplierName=inv.supplierName;d.currency=inv.currency;const b=purInvoiceBalance(inv);d.amount=b.balance==null?null:Math.max(0,b.balance);const s=purSupplierFind(inv.supplierId);d.method=s?s.paymentMethod:'Bank transfer';}
 if(draw!==false)render();
}
function purInvoiceAddPO(id,draw){
 const d=purMoneyDraft.data,p=purOrderFind(id);if(!p)return;if(!d.poIds.includes(id))d.poIds.push(id);
 if(d.poIds.length===1&&!d.supplierName&&!d.supplierId){d.supplierId=p.supplierId;d.supplierName=p.supplierName;d.currency=p.currency;const s=p.supplier||purSupplierFind(p.supplierId);d.paymentDays=s?s.paymentDays:null;if(!d.dueDate)d.dueDate=purInvoiceDue(d.date,d.paymentDays);}
 if(draw!==false)render();
}
function purInvoiceFromPO(){if(!purOrderSaveForm(true))return;const id=purOrderDraft.id;purMoneyEdit('invoice','',null,id);}
function purInvoiceRecordPayment(){if(!purMoneySaveForm())return;const id=purMoneyDraft.data.id;purMoneyEdit('payment','',id);}
function purMoneySaveForm(){
 const f=purMoneyDraft,r=purMoneySave(f.kind,f.data);if(!r.ok){purNotice=r.error;render();return false;}f.data=purClone(r.value);purMoneyOriginal=JSON.stringify(f);purNotice='Saved.';render();return true;
}
function purMoneyUndoForm(restore){
 const f=purMoneyDraft,d=f.data,verb=restore?'Restore':f.kind==='invoice'?'Delete':'Undo';
 if(!confirm(verb+' '+d.number+'? '+(f.kind==='invoice'?'Payments remain recorded on the supplier account.':'Supplier balances are recalculated.')+' The document and its history remain.'))return;
 const r=purMoneyUndo(f.kind,d.id,d.rev,restore);if(r.ok){f.data=purClone(r.value);purMoneyOriginal=JSON.stringify(f);purNotice='';}else purNotice=r.error;render();
}
function purMoneyField(k,label,type){const d=purMoneyDraft.data;return '<div><label for="pur_money_'+k+'">'+label+'</label><input id="pur_money_'+k+'" type="'+(type||'text')+'" '+(type==='number'?'step="any"':'')+' value="'+esc(d[k]??'')+'" oninput="purMoneyDraft.data.'+k+'=this.value;purMoneyRefresh()"></div>';}
function purMoneyRefresh(){const el=document.querySelector('[data-pur-money-warnings]');if(el)el.innerHTML=purMoneyWarnings(purMoneyDraft.kind,purMoneyDraft.data).map(s=>'<p>'+esc(s)+'</p>').join('');}
function purMoneyForm(){
 const f=purMoneyDraft,d=f.data,invoice=f.kind==='invoice',b=invoice&&d.id?purInvoiceBalance(d):null;
 return '<div class="purchasing-workspace sales-order-editor"><div class="sales-editor-top pur-toolbar"><button type="button" onclick="if(purMoneyLeave())render()">← '+(invoice?'Invoices':'Payments')+'</button><h2>'+esc(d.number||'New '+(invoice?'supplier invoice':'payment record'))+'</h2><span class="pill">'+(invoice?purInvoiceStatus(d):d.voidAt?'Undone':d.id?'Recorded':'Draft')+'</span><span class="sales-toolbar-sp"></span>'+
  (d.voidAt?'<button type="button" onclick="purMoneyUndoForm(true)">Restore</button>':'<button type="button" class="pri" data-pur-money-save onclick="purMoneySaveForm()">Save</button>'+(invoice&&d.id?'<button type="button" onclick="purInvoiceRecordPayment()">Record payment</button>':'')+(d.id?'<button type="button" onclick="purMoneyUndoForm(false)">'+(invoice?'Delete invoice':'Undo payment')+'</button>':''))+'</div>'+
  (purNotice?'<div role="status" class="pur-notice">'+esc(purNotice)+'</div>':'')+'<div class="pur-notice" data-pur-money-warnings>'+purMoneyWarnings(f.kind,d).map(s=>'<p>'+esc(s)+'</p>').join('')+'</div>'+
  '<fieldset class="pur-po-edit form" '+(d.voidAt?'disabled':'')+'><section class="card pur-card"><div class="sales-header-compact">'+
  (!invoice?'<div class="pur-wide"><label for="pur_money_invoice">Invoice · optional</label><select id="pur_money_invoice" onchange="purMoneyPickInvoice(this.value)"><option value="">Without invoice / advance</option>'+(DB.purchaseInvoice||[]).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===d.invoiceId?'selected':'')+'>'+esc(purMoneyReference(x)+' · '+x.supplierName+' · '+x.currency+(x.voidAt?' · Deleted':''))+'</option>').join('')+(d.invoiceId&&!purMoneyFind('invoice',d.invoiceId)?'<option selected value="'+esc(d.invoiceId)+'">Missing invoice</option>':'')+'</select></div>':'')+
  purSupplierControl(d,'money')+
  (invoice?purMoneyField('invoiceNumber','Supplier invoice number'):'')+purMoneyField('date',invoice?'Invoice date':'Payment date','date')+purMoneyField('amount',invoice?'Invoice total':'Amount paid','number')+purCurrencyControl(d,'pur_money_currency','purMoneyDraft.data.currency=this.value')+
  (invoice?purMoneyField('paymentDays','Payment terms · Net days','number')+purMoneyField('dueDate','Due date','date'):'')+
  (!invoice?purMoneyField('method','Payment method')+purMoneyField('reference','Bank / cheque reference'):'')+'</div>'+
  (invoice?'<p><button type="button" onclick="purMoneyDraft.data.dueDate=purInvoiceDue(purMoneyDraft.data.date,purMoneyDraft.data.paymentDays);render()">Use payment terms</button></p>':'<p class="mut">Record a payment already made. Negative amounts record a refund.</p>')+
  '<label for="pur_money_note">Notes</label><textarea id="pur_money_note" oninput="purMoneyDraft.data.note=this.value">'+esc(d.note)+'</textarea></section>'+
  (invoice?'<section class="card pur-card"><h3>Purchase orders</h3><label for="pur_invoice_add_po">Link a PO · optional</label><select id="pur_invoice_add_po" onchange="purInvoiceAddPO(this.value)"><option value="">Choose a purchase order</option>'+(DB.purchaseOrder||[]).filter(p=>!d.poIds.includes(p.id)).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.number+' · '+p.supplierName+(p.deletedAt?' · Deleted':''))+'</option>').join('')+'</select><div class="pur-invoice-links">'+d.poIds.map(id=>{const p=purOrderFind(id);return '<span>'+esc(p?p.number+' · '+p.supplierName:id+' · Missing PO')+' <button type="button" aria-label="Remove PO link '+esc(p?p.number:id)+'" onclick="purMoneyDraft.data.poIds=purMoneyDraft.data.poIds.filter(x=>x!=='+purArg(id)+');render()">×</button></span>';}).join('')+'</div><p class="mut">One invoice can cover several POs. Enter the full supplier invoice total once.</p></section>':'')+'</fieldset>'+
  (b?'<section class="card pur-card"><h3>Payments</h3><p>'+esc('Paid: '+docNum(b.paid,2)+' '+d.currency+' · Balance: '+(b.balance==null?'Review amount / payments':docNum(b.balance,2)+' '+d.currency))+'</p>'+b.payments.map(p=>'<p><button type="button" class="fin-link" onclick="purMoneyEdit(\'payment\','+purArg(p.id)+')">'+esc(p.number+' · '+p.date+' · '+(p.amount==null?'Unknown':docNum(p.amount,2))+' '+p.currency+' · '+p.method)+'</button></p>').join('')+'</section>':'')+
  (d.id?purHistoryHTML(f.kind,d.id):'')+'</div>';
}
function purMoneyColumns(){
 const a=purView==='payables'?[['supplierName','Supplier','text'],['currency','Currency','list'],['invoiced','Invoiced','number'],['paid','Paid','number'],['balance','We owe','number'],['knownBalance','Known balance','number'],['overdue','Overdue invoices','number'],['unknown','Unknown amounts','number'],['review','Review payments','number']]:
  purView==='invoices'?[['reference','Invoice','text'],['number','Record','text'],['supplierName','Supplier','text'],['date','Date','date'],['dueDate','Due','date'],['currency','Currency','list'],['amount','Total','number'],['paid','Paid','number'],['balance','Balance','number'],['status','Status','list'],['overdue','Overdue','list'],['po','Purchase orders','text']]:
  [['number','Payment','text'],['reference','Reference','text'],['invoice','Invoice','text'],['supplierName','Supplier','text'],['date','Date','date'],['currency','Currency','list'],['amount','Amount','number'],['method','Method','list'],['status','Status','list'],['createdBy','Recorded by','text']];
 return a.map(([k,label,type])=>({k,label,type,def:k!=='knownBalance'}));
}
function purMoneyInfos(){
 if(purView==='payables')return purSupplierAccounts().map(a=>({o:{id:a.id},account:a,memo:a}));
 const kind=purView==='invoices'?'invoice':'payment';return (DB[PUR_MONEY[kind].key]||[]).filter(d=>purMoneyShowUndone||!d.voidAt).map(d=>{
  const b=kind==='invoice'?purInvoiceBalance(d):null,inv=kind==='payment'?purMoneyFind('invoice',d.invoiceId):null;
  return {o:{id:d.id},d,kind,memo:Object.assign({},d,{supplierName:purSupplierDisplay(d)},kind==='invoice'?{reference:purMoneyReference(d),paid:b.paid,balance:b.balance,status:purInvoiceStatus(d),overdue:!d.voidAt&&d.dueDate&&d.dueDate<finToday()&&b.balance>0?'Yes':'No',po:d.poIds.map(id=>(purOrderFind(id)||{}).number||id).join(', ')}:{invoice:inv?purMoneyReference(inv):'',status:d.voidAt?'Undone':'Recorded'})};
 });
}
function purMoneyList(){
 if(purAccountKey)return purAccountHTML();
 const infos=purMoneyInfos(),rows=salesListRows(infos),cols=salesListColumns(),accounts=purView==='payables',kind=purView==='invoices'?'invoice':'payment';
 const cell=(i,c)=>{const v=salesListValue(i,c.k),link=i.account&&c.k==='supplierName'||i.d&&c.k===(kind==='invoice'?'reference':'number');return '<td class="'+(c.type==='number'?'n':'')+'">'+(link?'<button type="button" class="fin-link" onclick="'+(i.account?'purAccountKey='+purArg(i.account.id)+';render()':'purMoneyEdit('+purArg(kind)+','+purArg(i.d.id)+')')+'">'+esc(v)+'</button>':v==null||v===''?'—':esc(c.type==='number'&&!['unknown','review'].includes(c.k)?docNum(v,2):v))+'</td>';};
 return '<div class="purchasing-workspace">'+purNav()+'<div class="card sales-list-card"><div class="sales-toolbar"><h2>'+({invoices:'Supplier invoices',payments:'Supplier payments',payables:'We owe suppliers'})[purView]+'</h2><span class="sales-toolbar-sp"></span>'+(accounts?'':'<label><input type="checkbox" '+(purMoneyShowUndone?'checked':'')+' onchange="purMoneyShowUndone=this.checked;render()"> Include deleted / undone</label><button type="button" class="pri" onclick="purMoneyEdit(\''+kind+'\',\'\')">+ '+(kind==='invoice'?'Invoice':'Payment record')+'</button>')+'</div>'+(accounts?'<p class="mut">Each currency has its own balance. Negative balances are supplier credits.</p>':'')+purListFilters(infos)+
  '<div class="sales-table-wrap"><table class="sl-table"><thead><tr><th><button type="button" class="sl-settings" data-columns-button aria-label="Columns" onclick="salesListOpenColumns(event)">'+ico('settings')+'</button></th>'+cols.map(purListHeader).join('')+'</tr></thead><tbody>'+purPageRows(rows).map(i=>'<tr><td></td>'+cols.map(c=>cell(i,c)).join('')+'</tr>').join('')+(!rows.length?'<tr><td colspan="'+(cols.length+1)+'" class="empty">No records in this view.</td></tr>':'')+'</tbody></table></div>'+purListPager(rows)+salesListMenuHTML(infos)+'</div></div>';
}
function purAccountHTML(){
 const a=purSupplierAccounts().find(a=>a.id===purAccountKey);if(!a){purAccountKey='';return purMoneyList();}
 const link=(kind,d)=>'<p><button type="button" class="fin-link" onclick="purMoneyEdit('+purArg(kind)+','+purArg(d.id)+')">'+esc((kind==='invoice'?purMoneyReference(d):d.number)+' · '+d.date+' · '+(d.amount==null?'Unknown':docNum(d.amount,2))+' '+d.currency)+'</button></p>';
 return '<div class="purchasing-workspace">'+purNav()+'<div class="sales-toolbar pur-toolbar"><button type="button" onclick="purAccountKey=\'\';render()">← Accounts</button><h2>'+esc(a.supplierName+' · '+a.currency)+'</h2></div><p>'+esc('We owe: '+(a.balance==null?'Incomplete':docNum(a.balance,2))+' · Known balance: '+docNum(a.knownBalance,2)+' · Overdue invoices: '+docNum(a.overdue,2))+'</p><div class="pur-form"><section class="card pur-card"><h3>Invoices</h3>'+a.invoices.map(d=>link('invoice',d)).join('')+'</section><section class="card pur-card"><h3>Payments</h3>'+a.payments.map(d=>link('payment',d)).join('')+'</section></div></div>';
}
function purPOInvoicesHTML(p){return '<section class="card pur-card pur-receiving"><div class="pur-section-head"><h3>Supplier invoices</h3><button type="button" onclick="purInvoiceFromPO()">+ Invoice</button></div>'+purInvoicesForPO(p.id).map(d=>'<p><button type="button" class="fin-link" onclick="purMoneyEdit(\'invoice\','+purArg(d.id)+')">'+esc(purMoneyReference(d)+' · '+purInvoiceStatus(d)+' · '+(d.amount==null?'Unknown':docNum(d.amount,2))+' '+d.currency+(d.poIds.length>1?' · shared across '+d.poIds.length+' POs':''))+'</button></p>').join('')+'</section>';}
(window.NAV_GUARDS=window.NAV_GUARDS||[]).push(to=>tab==='purchasing'&&to!=='purchasing'&&!purMoneyLeave());
