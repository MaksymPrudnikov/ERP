/* Purchasing P1: old supply data survives, cards persist, column filters
   work, and a failed/stale/unauthorised save cannot lose the user's work. */
module.exports=async function({page,eq}){
 console.log('purchasing suppliers');const t=await page(undefined,{width:1440,height:1000});
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 await t.p.evaluate(()=>{
  window.ppReset=()=>{purView='suppliers';purOrderDraft=null;DB.supplier=[];DB.purchasingEvent=[];DB.glassSheet=[];purSupplierDraft=null;purNotice='';salesListMenu=null;delete salesQueuePrefs.purchaseSuppliers;localStorage.removeItem('glass_erp_purchaseSuppliers_list_v1');tab='purchasing';};
  window.ppSheet=(supplier,w,currency)=>normalizeGlassSheet({productCode:'6CLEAR',supplier,sheetWIn:w,sheetHIn:96,currency:currency||'USD',purchasePrice:2.15,purchaseUnit:'ft2',availability:'stock',leadTimeDays:5,note:'Keep this point'});
  ppReset();
 });
 eq('old supply names become cards without changing any sheet data; names differing in case share a card',await t.p.evaluate(()=>{
  DB.glassSheet=[ppSheet('North Glass',144,'CAD'),ppSheet('north glass',130,'USD'),ppSheet('East Glass',120,'USD')];
  const withoutId=rows=>JSON.stringify(rows.map(({supplierId,...s})=>s)),before=withoutId(DB.glassSheet);
  normalizePurchasing();
  return {names:DB.supplier.map(s=>s.name),same:withoutId(DB.glassSheet)===before,linked:DB.glassSheet.every(s=>!!purSupplierFind(s.supplierId)),shared:DB.glassSheet[0].supplierId===DB.glassSheet[1].supplierId,currency:DB.supplier[0].currency};
 }),{names:['North Glass','East Glass'],same:true,linked:true,shared:true,currency:'CAD'});

 eq('repeated normalization and old-backup imports keep stable card IDs, with no duplicate suppliers',await t.p.evaluate(()=>{
  const before=JSON.stringify({cards:DB.supplier,rows:DB.glassSheet});normalizePurchasing();normalizePurchasing();
  const old=DB.glassSheet.map(({supplierId,...s})=>s),a=prepareImportedState({glassSheet:old}),b=prepareImportedState({glassSheet:old});
  return {same:before===JSON.stringify({cards:DB.supplier,rows:DB.glassSheet}),stable:JSON.stringify(a.supplier)===JSON.stringify(b.supplier),sameIds:a.supplier.map(s=>s.id).join()===DB.supplier.map(s=>s.id).join()};
 }),{same:true,stable:true,sameIds:true});

 eq('renaming/archiving a supplier keeps explicit links and every legacy supply-point value',await t.p.evaluate(()=>{
  const s=purClone(DB.supplier[0]),before=JSON.stringify(DB.glassSheet);s.name='North Glass Group';s.active=false;s.currency='USD';
  const r=purSupplierSave(s);normalizePurchasing();
  return {ok:r.ok,cards:DB.supplier.length,unchanged:before===JSON.stringify(DB.glassSheet),renamed:purSupplierFind(s.id).name,archived:!purSupplierFind(s.id).active};
 }),{ok:true,cards:2,unchanged:true,renamed:'North Glass Group',archived:true});

 eq('CSV updates retain card links; a new size at a renamed supplier uses its old supply-point alias',await t.p.evaluate(()=>{
  const id=DB.glassSheet[0].supplierId;
  const rep=importGlassSheetsCsv('code,supplier,sheet_w_in,sheet_h_in,purchase_price,currency\n6CLEAR,North Glass,144,96,2.75,CAD\n6CLEAR,North Glass,102,96,,CAD');
  return {accepted:rep.accepted,cards:DB.supplier.length,sizes:DB.glassSheet.filter(s=>s.supplier==='North Glass').map(s=>[s.sheetWIn,s.purchasePrice,s.supplierId===id]),currencies:DB.glassSheet.filter(s=>s.supplier==='North Glass').map(s=>s.currency)};
 }),{accepted:2,cards:2,sizes:[[144,2.75,true],[102,null,true]],currencies:['CAD','CAD']});

 eq('a minimal supplier needs no email, address, terms or delivery lead time',await t.p.evaluate(()=>{
  const before=JSON.stringify({receipts:DB.receipt,orders:DB.salesOrder,shipments:DB.shipment}),r=purSupplierSave({name:'Small local shop'});
  return {ok:r.ok,name:r.value.name,currency:r.value.currency,email:r.value.email,days:r.value.paymentDays,lead:r.value.leadTimeDays,otherData:before===JSON.stringify({receipts:DB.receipt,orders:DB.salesOrder,shipments:DB.shipment})};
 }),{ok:true,name:'Small local shop',currency:'CAD',email:'',days:null,lead:null,otherData:true});

 eq('contact lists, custom fields, zero-day terms and blank values survive Export / Import JSON',await t.p.evaluate(()=>{
  const r=purSupplierSave({name:'Special supplier',paymentDays:0,leadTimeDays:'',currency:'CAD',accountNumber:'AC-77',contacts:[{name:'Anna',role:'Orders',email:'anna@example.test',phone:''},{name:'Max',role:'Cover',email:'cover@example.test',phone:'123'}],customFields:[{id:'dock',label:'Dock instructions',value:'Call before arrival'},{id:'extra',label:'Reference',value:''}]});
  const restored=prepareImportedState(storageExportEnvelope()),s=restored.supplier.find(s=>s.id===r.value.id);
  return {same:JSON.stringify(s)===JSON.stringify(r.value),contacts:s.contacts.length,fields:s.customFields.length,days:s.paymentDays,lead:s.leadTimeDays};
 }),{same:true,contacts:2,fields:2,days:0,lead:null});

 eq('a stale card cannot overwrite someone else’s changes',await t.p.evaluate(()=>{
  const stale=purClone(DB.supplier[0]),edit=purClone(stale);edit.phone='416-555-0100';purSupplierSave(edit);
  stale.note='This was typed before the phone change';const r=purSupplierSave(stale),s=purSupplierFind(stale.id);
  return {refused:!r.ok,phone:s.phone,note:s.note,reason:r.error.includes('changed elsewhere')};
 }),{refused:true,phone:'416-555-0100',note:'',reason:true});

 eq('a failed browser write rolls the card back and keeps the draft available to retry',await t.p.evaluate(()=>{
  const s=DB.supplier[0];purSupplierEdit(s.id);purSupplierDraft.phone='retry-value';
  const before=JSON.stringify(DB),original=Storage.prototype.setItem;let prevented=false;
  Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY){prevented=true;throw new Error('Test quota');}return original.call(this,k,v);};
  try{purSupplierFormSave();}finally{Storage.prototype.setItem=original;}
  const out={prevented,unchanged:JSON.stringify(DB)===before,draft:purSupplierDraft.phone,error:!!document.querySelector('[data-pur-error]')};
  purSupplierFormSave();out.retry=purSupplierFind(s.id).phone==='retry-value'&&purSupplierDraft===null;return out;
 }),{prevented:true,unchanged:true,draft:'retry-value',error:true,retry:true});

 eq('a read-only tab cannot write a supplier',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),was=storageWriter;storageWriter=false;
  const r=purSupplierSave({name:'Must not be written'});storageWriter=was;
  return {refused:!r.ok,unchanged:before===JSON.stringify(DB)};
 }),{refused:true,unchanged:true});

 eq('bad supplier imports fail before changing the current database',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),errors=[];
  for(const supplier of [[{id:'same',name:'A'},{id:'same',name:'B'}],[{id:'a',name:'A',contacts:{email:'x'}}],[{id:'a',name:'A',customFields:[null]}]]){
   try{prepareImportedState({supplier});errors.push(false);}catch(e){errors.push(e.message.includes('Supplier'));}
  }
  return {errors,unchanged:JSON.stringify(DB)===before};
 }),{errors:[true,true,true],unchanged:true});

 eq('supplier history preserves exact edits, archive / restore and import; unchanged saves add no event',await t.p.evaluate(()=>{
  let s=purSupplierSave({name:'History supplier',email:'old@example.test'}).value;
  s=purSupplierSave(Object.assign(purClone(s),{email:'new@example.test',paymentMethod:''})).value;
  s=purSupplierSave(Object.assign(purClone(s),{active:false})).value;
  s=purSupplierSave(Object.assign(purClone(s),{active:true})).value;
  purSupplierSave(purClone(s));
  const events=purHistory('supplier',s.id),edit=events.find(e=>e.what==='Edited'),restored=prepareImportedState(storageExportEnvelope());
  const history=rows=>rows.map(e=>[e.id,e.entity,e.entityId,e.what,e.at,e.by,e.byId,e.changes]);
  purSupplierEdit(s.id);document.querySelector('[data-pur-history] details').open=true;
  return {actions:events.map(e=>e.what),email:edit.changes.find(c=>c.field==='email'),blank:purSupplierFind(s.id).paymentMethod,roundtrip:JSON.stringify(history(restored.purchasingEvent))===JSON.stringify(history(DB.purchasingEvent)),visible:document.querySelector('[data-pur-history]').textContent.includes('old@example.test → new@example.test')};
 }),{actions:['Restored','Archived','Edited','Created'],email:{field:'email',label:'Email for PO',before:'old@example.test',after:'new@example.test'},blank:'',roundtrip:true,visible:true});

 eq('invalid purchasing history imports cannot replace the database',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),e=purClone(DB.purchasingEvent[0]),errors=[];
  for(const purchasingEvent of [[e,Object.assign({},e,{id:' '+e.id+' '})],[Object.assign({},e,{changes:[null]})],[Object.assign({},e,{entity:''})]]){
   try{prepareImportedState({purchasingEvent});errors.push(false);}catch(err){errors.push(err.message.startsWith('Purchasing history'));}
  }
  return {errors,unchanged:JSON.stringify(DB)===before};
 }),{errors:[true,true,true],unchanged:true});

 /* Actual form controls: extra rows must not erase what is already typed. */
 await t.p.evaluate(()=>{ppReset();render();});
 await t.p.locator('[data-pur-new]').click();
 await t.p.locator('#pur_supplier_name').fill('West Glass');
 await t.p.locator('#pur_supplier_email').fill('orders@example.test');
 await t.p.locator('#pur_supplier_paymentDays').fill('30');
 await t.p.locator('[data-pur-add-contact]').click();
 await t.p.locator('#pur_contact_0_name').fill('Anna');
 await t.p.locator('#pur_contact_0_email').fill('cover@example.test');
 await t.p.locator('[data-pur-add-field]').click();
 await t.p.locator('#pur_custom_label_0').fill('Delivery entrance');
 await t.p.locator('#pur_custom_value_0').fill('North gate');
 await t.p.locator('[data-pur-save]').click();
 eq('the real supplier form saves typed data through adding contacts and custom fields',await t.p.evaluate(()=>{
  const s=DB.supplier[0];return {name:s.name,email:s.email,days:s.paymentDays,contact:s.contacts[0].email,field:s.customFields[0].value,closed:!purSupplierDraft};
 }),{name:'West Glass',email:'orders@example.test',days:30,contact:'cover@example.test',field:'North gate',closed:true});

 eq('supplier lists use independent Sales column filters, including blank lead times and archive status',await t.p.evaluate(()=>{
  purSupplierSave({name:'Other supplier',currency:'USD',leadTimeDays:7,active:false});render();
  const rows=()=>document.querySelectorAll('[data-pur-supplier]').length;
  const all=rows();salesListSetFilter('currency',{values:['USD']});const usd=rows();
  salesListClearAll();salesListSetFilter('leadTimeDays',{conds:[{op:'empty',v:''}]});const unknown=rows();
  salesListClearAll();salesListSetFilter('status',{values:['Archived']});const archive=rows();salesListClearAll();
  return {scope:salesListScope(),all,usd,unknown,archive,search:!!document.querySelector('.purchasing-workspace input[type=search]')};
 }),{scope:'purchaseSuppliers',all:2,usd:1,unknown:1,archive:1,search:false});

 eq('supplier text and even imported IDs are rendered as text, not executable markup',await t.p.evaluate(()=>{
  window.ppInjected=false;
  const s=purSupplierClean({id:'quote"and\'apostrophe',name:'<img src=x onerror="window.ppInjected=true">',customFields:[{label:'<b>Label</b>',value:'<script>bad</script>'}]});DB.supplier.push(s);render();
  const button=[...document.querySelectorAll('[data-pur-open]')].find(e=>e.dataset.purOpen===s.id);button.click();
  return {injected:window.ppInjected,field:document.getElementById('pur_supplier_name').value===s.name,images:document.querySelectorAll('.purchasing-workspace img').length,custom:document.getElementById('pur_custom_label_0').value};
 }),{injected:false,field:true,images:0,custom:'<b>Label</b>'});
 await t.p.evaluate(()=>{purSupplierDraft=null;});
 await t.p.setViewportSize({width:390,height:844});
 await t.p.evaluate(()=>{purSupplierEdit(DB.supplier[0].id);});
 eq('supplier card fits a phone width',await t.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await t.p.setViewportSize({width:1440,height:1000});

 eq('the Supply points form links a card without renaming or repricing the existing supply row',await t.p.evaluate(()=>{
  purSupplierDraft=null;DB.glassSheet=[ppSheet('West warehouse',144,'CAD')];normalizePurchasing();
  const row=DB.glassSheet[0],target=DB.supplier.find(s=>s.name==='West Glass');
  tab='masterdata';mdTab='materials';mdMatCategory='glass';mdMatView='glassSheet';mdSheetEditRow(row.id);
  document.getElementById('md_sheetSupplierId').value=target.id;mdSheetSupplierPicked(target.id);mdSheetSave();
  const s=DB.glassSheet[0];return {linked:s.supplierId===target.id,point:s.supplier,currency:s.currency,price:s.purchasePrice,size:[s.sheetWIn,s.sheetHIn],closed:mdSheetEdit===null};
 }),{linked:true,point:'West warehouse',currency:'CAD',price:2.15,size:[144,96],closed:true});

 const auth=await page(undefined,{width:1440,height:900},{signin:true});
 await auth.p.waitForFunction(()=>storageWriter&&!storageStarting&&!signinChecking);
 eq('Purchasing is its own access checkbox: hiding the menu also prevents direct writes; allowed writes identify the user',await auth.p.evaluate(()=>{
  const u=DB.user.find(x=>x.name==='Demo Owner');userPasswordSet(u,'test-owner-123');u.access=['users','dashboard'];signinAs(u.viewProfileId);
  render();const before=JSON.stringify(DB),hidden=!document.querySelector('[onclick="navGo(\'purchasing\')"]'),denied=purSupplierSave({name:'Hidden supplier'});
  const unchanged=before===JSON.stringify(DB);
  u.access.push('purchasing');touch();render();const visible=!!document.querySelector('[onclick="navGo(\'purchasing\')"]'),r=purSupplierSave({name:'Allowed supplier'});
  const event=purHistory('supplier',r.value.id)[0];
  return {hidden,denied:!denied.ok,unchanged,visible,saved:r.ok,actor:r.value&&r.value.createdBy,actorId:r.value&&r.value.createdById===u.viewProfileId,history:event.by==='Demo Owner'&&event.byId===u.viewProfileId&&!!event.at};
 }),{hidden:true,denied:true,unchanged:true,visible:true,saved:true,actor:'Demo Owner',actorId:true,history:true});
 eq('purchasing pages have no JavaScript errors',t.errs.concat(auth.errs),[]);
 await auth.c.close();await t.c.close();
};
