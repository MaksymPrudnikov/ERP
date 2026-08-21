/* =====================================================================
   erp/customers/data  ·  customers-1.0
   Customer master: schema, normalization, dedicated import/export.
   IN : DB.customer / CSV / JSON
   OUT: normalized Customer entities
   Rule: no Sales Order / Work Order behavior here.
   ===================================================================== */

DEFAULT.customer=[];
if(!Array.isArray(DB.customer))DB.customer=[];

const CUSTOMER_STATUSES=['active','inactive','archived'];
const CUSTOMER_CURRENCIES=['CAD','USD'];
const CUSTOMER_STATEMENT_DELIVERY=['email','print','both','none'];
const CUSTOMER_FUEL_MODES=['default','custom','exempt'];

function customerUid(prefix){
 prefix=prefix||'CUS';
 try{if(globalThis.crypto&&typeof crypto.randomUUID==='function')return prefix+'-'+crypto.randomUUID();}catch(e){}
 return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,9).toUpperCase();
}
function customerString(v){return String(v==null?'':v).trim();}
function customerBool(v){
 if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;
 const s=customerString(v).toLowerCase();
 return ['1','true','yes','y','on','checked','x','да','так'].includes(s);
}
function customerNumber(v){
 if(v==null||v==='')return null;
 const n=Number(String(v).replace(/[$,\s]/g,''));return Number.isFinite(n)?n:null;
}
function customerStatus(v){
 const s=customerString(v).toLowerCase();
 if(['archived','archive','архив','closed','deleted'].includes(s))return 'archived';
 if(['inactive','disabled','неактивный','неактивен'].includes(s))return 'inactive';
 return 'active';
}
function customerStatusLabel(v){return v==='archived'?'Архив':v==='inactive'?'Неактивный':'Активный';}
function customerStatementLabel(v){return v==='print'?'Печать':v==='both'?'Email + печать':v==='none'?'Не отправлять':'Email';}
function customerFuelLabel(v){return v==='custom'?'Индивидуальная ставка':v==='exempt'?'Без топливного сбора':'По умолчанию';}

function normalizeCustomerContact(c,i){
 c=c&&typeof c==='object'?c:{};
 return {
  id:customerString(c.id)||customerUid('CON'),
  name:customerString(c.name),role:customerString(c.role),phone:customerString(c.phone),phone2:customerString(c.phone2),
  mobile:customerString(c.mobile),fax:customerString(c.fax),email:customerString(c.email),
  isPrimary:customerBool(c.isPrimary),isInvoice:customerBool(c.isInvoice),isShipping:customerBool(c.isShipping)
 };
}
function normalizeCustomerAddress(a,i){
 a=a&&typeof a==='object'?a:{};
 const type=['billing','delivery','other'].includes(a.type)?a.type:'other';
 return {
  id:customerString(a.id)||customerUid('ADR'),type,label:customerString(a.label),addressee:customerString(a.addressee),
  address1:customerString(a.address1),address2:customerString(a.address2),address3:customerString(a.address3),
  city:customerString(a.city),province:customerString(a.province),postalCode:customerString(a.postalCode),country:customerString(a.country)||'Canada',
  isDefault:customerBool(a.isDefault)
 };
}
function normalizeLegacyRefs(v){
 const src=v&&typeof v==='object'&&!Array.isArray(v)?v:{};
 const out={sourceSystem:customerString(src.sourceSystem)};
 ['dcLink','flid','iClassID','repID','iAreasID','uiARDeliveryMethod','uiARCATID','accountStatusID','iwg'].forEach(k=>{out[k]=customerString(src[k]);});
 return out;
}
function normalizeCustomer(c,i){
 c=c&&typeof c==='object'?c:{};
 const contacts=(Array.isArray(c.contacts)?c.contacts:[]).map(normalizeCustomerContact);
 const addresses=(Array.isArray(c.addresses)?c.addresses:[]).map(normalizeCustomerAddress);
 /* Keep only one primary/default marker of each kind; imported duplicates are
    made deterministic rather than causing surprising UI behavior. */
 let primary=false,invoice=false,shipping=false;
 contacts.forEach(x=>{if(x.isPrimary){if(primary)x.isPrimary=false;else primary=true;}if(x.isInvoice){if(invoice)x.isInvoice=false;else invoice=true;}if(x.isShipping){if(shipping)x.isShipping=false;else shipping=true;}});
 const addrDefault={billing:false,delivery:false,other:false};
 addresses.forEach(x=>{if(x.isDefault){if(addrDefault[x.type])x.isDefault=false;else addrDefault[x.type]=true;}});
 const status=customerStatus(c.status);
 const statement=CUSTOMER_STATEMENT_DELIVERY.includes(c.statementDelivery)?c.statementDelivery:'email';
 const fuelMode=CUSTOMER_FUEL_MODES.includes(c.fuelLevyMode)?c.fuelLevyMode:'default';
 return {
  id:customerString(c.id)||customerUid('CUS'),code:customerString(c.code),legalName:customerString(c.legalName||c.name),displayName:customerString(c.displayName||c.legalName||c.name),
  status,isProspect:customerBool(c.isProspect),customerType:customerString(c.customerType),group:customerString(c.group),area:customerString(c.area),salesRep:customerString(c.salesRep),
  accountOpenedAt:customerString(c.accountOpenedAt),notes:customerString(c.notes),internalNotes:customerString(c.internalNotes),
  taxNumber:customerString(c.taxNumber),registrationNumber:customerString(c.registrationNumber),taxExempt:customerBool(c.taxExempt),taxExemptionNumber:customerString(c.taxExemptionNumber),
  paymentTerms:customerString(c.paymentTerms),currency:CUSTOMER_CURRENCIES.includes(c.currency)?c.currency:'CAD',creditLimit:customerNumber(c.creditLimit),
  onHold:customerBool(c.onHold),holdReason:customerString(c.holdReason),creditApplicationDate:customerString(c.creditApplicationDate),poRequired:customerBool(c.poRequired),checkTerms:customerBool(c.checkTerms),
  defaultDeliveryMethod:customerString(c.defaultDeliveryMethod),deliverTo:customerString(c.deliverTo),fuelLevyMode:fuelMode,fuelLevyRate:customerNumber(c.fuelLevyRate),
  statementDelivery:statement,statementEmail:customerString(c.statementEmail),invoiceEmail:customerString(c.invoiceEmail),
  contacts,addresses,legacyRefs:normalizeLegacyRefs(c.legacyRefs),
  createdAt:customerString(c.createdAt),updatedAt:customerString(c.updatedAt),archivedAt:status==='archived'?customerString(c.archivedAt):''
 };
}
function normalizeCustomers(){
 if(!Array.isArray(DB.customer))DB.customer=[];
 const ids=new Set(),codes=new Set();
 DB.customer=DB.customer.filter(x=>x&&typeof x==='object').map((x,i)=>{
  const c=normalizeCustomer(x,i);
  while(ids.has(c.id))c.id=customerUid('CUS');ids.add(c.id);
  if(c.code){const key=c.code.toUpperCase();if(codes.has(key))c.code='';else codes.add(key);}
  return c;
 });
}
function validateCustomersPayload(src){
 if(!src||!Object.prototype.hasOwnProperty.call(src,'customer'))return;
 if(!Array.isArray(src.customer))throw new Error('The "customer" field must be an array.');
 const ids=new Set(),codes=new Set();
 src.customer.forEach((c,i)=>{
  if(!c||typeof c!=='object'||Array.isArray(c))throw new Error('Customer row '+(i+1)+' must be an object.');
  if(c.contacts!=null&&!Array.isArray(c.contacts))throw new Error('Customer '+(i+1)+': contacts must be an array.');
  if(c.addresses!=null&&!Array.isArray(c.addresses))throw new Error('Customer '+(i+1)+': addresses must be an array.');
  if(c.id){const id=customerString(c.id);if(ids.has(id))throw new Error('Customers contains duplicate id "'+id+'".');ids.add(id);}
  if(c.code){const code=customerString(c.code).toUpperCase();if(codes.has(code))throw new Error('Customers contains duplicate code "'+c.code+'".');codes.add(code);}
 });
}
function nextCustomerCode(){
 let max=0;DB.customer.forEach(c=>{const m=String(c.code||'').match(/^C-(\d+)$/i);if(m)max=Math.max(max,+m[1]||0);});
 let n=max+1,code;do{code='C-'+String(n++).padStart(5,'0');}while(DB.customer.some(c=>String(c.code).toUpperCase()===code));return code;
}
function newCustomerDraft(){
 const now=new Date().toISOString();
 return normalizeCustomer({id:customerUid('CUS'),code:'',status:'active',currency:'CAD',statementDelivery:'email',fuelLevyMode:'default',createdAt:now,updatedAt:now,contacts:[],addresses:[]});
}
function customerHasReferences(id){
 if(!id)return false;
 const collections=['salesOrder','salesOrders','orderRevision','orderRevisions'];
 return collections.some(k=>Array.isArray(DB[k])&&DB[k].some(x=>x&&x.customerId===id));
}

/* ------------------------ customer-only export ----------------------- */
function customerDownload(name,text,type){
 const b=new Blob([text],{type:type||'text/plain;charset=utf-8'}),a=document.createElement('a');
 a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportCustomersJSON(){
 customerDownload('glass_erp_customers.json',JSON.stringify({schema:'glass-erp-customers-v1',exportedAt:new Date().toISOString(),customers:DB.customer},null,2),'application/json');
}
function csvCell(v){const s=String(v==null?'':v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function customerPrimaryContact(c){return c.contacts.find(x=>x.isPrimary)||c.contacts[0]||{};}
function customerAddressByType(c,type){return c.addresses.find(x=>x.type===type&&x.isDefault)||c.addresses.find(x=>x.type===type)||{};}
function customerCsvRows(){
 const H=['Customer ID','Account','Name','Display Name','Status','IsProspect','CustomerType','Group','Area','SalesRep','Telephone','Telephone2','Mobile','Fax1','EMail','Addressee','Post Add1','Post Add2','Post Add3','Post Add4','Post Add5','Post PC','Del Add1','Del Add2','Del Add3','Del Add4','Del Add5','Del PC','Deliver To','On Hold','Hold Reason','I.W.G','Print Statements','Email Statements','Check Terms','TAX Number','Registration','Credit Limit','Delivery Method','Fuel Levy Rate','Fuel Levy Mode','Currency','AccountOpenDate','CreditApplicationDate','PaymentTerms','PO Required','Statement Email','Invoice Email','Notes','Internal Notes','Contacts JSON','Addresses JSON','DCLink','FLID','iClassID','RepID','iAreasID','uiARDeliveryMethod','uiARCATID','AccountStatusID'];
 const rows=DB.customer.map(c=>{
  const p=customerPrimaryContact(c),b=customerAddressByType(c,'billing'),d=customerAddressByType(c,'delivery'),lr=c.legacyRefs||{};
  const print=['print','both'].includes(c.statementDelivery),email=['email','both'].includes(c.statementDelivery);
  const vals=[c.id,c.code,c.legalName,c.displayName,c.status,c.isProspect,c.customerType,c.group,c.area,c.salesRep,p.phone,p.phone2,p.mobile,p.fax,p.email,p.name,b.address1,b.address2,b.address3,'','',b.postalCode,d.address1,d.address2,d.address3,'','',d.postalCode,c.deliverTo,c.onHold,c.holdReason,lr.iwg,print,email,c.checkTerms,c.taxNumber,c.registrationNumber,c.creditLimit==null?'':c.creditLimit,c.defaultDeliveryMethod,c.fuelLevyRate==null?'':c.fuelLevyRate,c.fuelLevyMode,c.currency,c.accountOpenedAt,c.creditApplicationDate,c.paymentTerms,c.poRequired,c.statementEmail,c.invoiceEmail,c.notes,c.internalNotes,JSON.stringify(c.contacts),JSON.stringify(c.addresses),lr.dcLink,lr.flid,lr.iClassID,lr.repID,lr.iAreasID,lr.uiARDeliveryMethod,lr.uiARCATID,lr.accountStatusID];
  return vals;
 });
 return [H].concat(rows);
}
function exportCustomersCSV(){customerDownload('glass_erp_customers.csv',customerCsvRows().map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}

/* ------------------------ customer-only import ----------------------- */
function csvParse(text){
 text=String(text||'').replace(/^\uFEFF/,'');
 const first=(text.split(/\r?\n/)[0]||''),counts={',':(first.match(/,/g)||[]).length,';':(first.match(/;/g)||[]).length,'\t':(first.match(/\t/g)||[]).length};
 const delim=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0]||',';
 const out=[],row=[];let cell='',q=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(q){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')q=false;else cell+=ch;continue;}
  if(ch==='"'){q=true;continue;}if(ch===delim){row.push(cell);cell='';continue;}
  if(ch==='\r'){continue;}if(ch==='\n'){row.push(cell);out.push(row.splice(0));cell='';continue;}cell+=ch;
 }
 row.push(cell);if(row.some(x=>x!==''))out.push(row);
 if(!out.length)return [];
 const headers=out.shift().map(customerColumnKey);
 return out.filter(r=>r.some(x=>customerString(x))).map(r=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=r[i]==null?'':r[i];});return o;});
}
function customerColumnKey(v){return customerString(v).toLowerCase().replace(/[._\-\/\\]+/g,' ').replace(/\s+/g,' ').trim();}
function rowPick(row){
 for(let i=1;i<arguments.length;i++){const k=customerColumnKey(arguments[i]);if(Object.prototype.hasOwnProperty.call(row,k)&&customerString(row[k])!=='')return row[k];}
 return '';
}
function customerJsonCell(v,fallback){try{const x=JSON.parse(v);return Array.isArray(x)?x:fallback;}catch(e){return fallback;}}
function customerFromImportRow(row){
 if(!row||typeof row!=='object')return newCustomerDraft();
 /* Canonical JSON export can be normalized directly. */
 if(row.legalName!==undefined||row.contacts!==undefined||row.addresses!==undefined){return normalizeCustomer(row);}
 const R={};Object.keys(row).forEach(k=>R[customerColumnKey(k)]=row[k]);
 const print=customerBool(rowPick(R,'Print Statements')),emailStmt=customerBool(rowPick(R,'Email Statements'));
 let statementDelivery=print&&emailStmt?'both':print?'print':emailStmt?'email':'none';
 const primary={id:customerUid('CON'),name:rowPick(R,'Addressee'),role:'',phone:rowPick(R,'Telephone'),phone2:rowPick(R,'Telephone2'),mobile:rowPick(R,'Mobile'),fax:rowPick(R,'Fax1'),email:rowPick(R,'EMail','Email'),isPrimary:true,isInvoice:false,isShipping:false};
 const billing={id:customerUid('ADR'),type:'billing',label:'Billing',addressee:rowPick(R,'Addressee'),address1:rowPick(R,'Post Add1','PostAdd1'),address2:rowPick(R,'Post Add2','PostAdd2'),address3:[rowPick(R,'Post Add3','PostAdd3'),rowPick(R,'Post Add4','PostAdd4'),rowPick(R,'Post Add5','PostAdd5')].filter(Boolean).join(', '),city:'',province:'',postalCode:rowPick(R,'Post PC','PostPC'),country:'Canada',isDefault:true};
 const delivery={id:customerUid('ADR'),type:'delivery',label:'Delivery',addressee:rowPick(R,'Deliver To'),address1:rowPick(R,'Del Add1','DelAdd1'),address2:rowPick(R,'Del Add2','DelAdd2'),address3:[rowPick(R,'Del Add3','DelAdd3'),rowPick(R,'Del Add4','DelAdd4'),rowPick(R,'Del Add5','DelAdd5')].filter(Boolean).join(', '),city:'',province:'',postalCode:rowPick(R,'Del PC','DelPC'),country:'Canada',isDefault:true};
 let contacts=(primary.name||primary.phone||primary.phone2||primary.mobile||primary.fax||primary.email)?[primary]:[];
 let addresses=[];if(billing.address1||billing.address2||billing.address3||billing.postalCode)addresses.push(billing);if(delivery.address1||delivery.address2||delivery.address3||delivery.postalCode)addresses.push(delivery);
 const cj=rowPick(R,'Contacts JSON'),aj=rowPick(R,'Addresses JSON');if(cj)contacts=customerJsonCell(cj,contacts);if(aj)addresses=customerJsonCell(aj,addresses);
 const name=rowPick(R,'Name','Legal Name','Customer Name'),statusRaw=rowPick(R,'Status');
 return normalizeCustomer({
  id:rowPick(R,'Customer ID','ID'),code:rowPick(R,'Account','Customer Code','Code'),legalName:name,displayName:rowPick(R,'Display Name')||name,status:statusRaw,
  isProspect:rowPick(R,'IsProspect','Is Prospect'),customerType:rowPick(R,'CustomerType','Customer Type'),group:rowPick(R,'Group'),area:rowPick(R,'Area'),salesRep:rowPick(R,'SalesRep','Sales Rep'),
  accountOpenedAt:rowPick(R,'AccountOpenDate','Account Open Date'),notes:rowPick(R,'Notes'),internalNotes:rowPick(R,'Internal Notes'),taxNumber:rowPick(R,'TAX Number','Tax Number'),registrationNumber:rowPick(R,'Registration'),
  paymentTerms:rowPick(R,'PaymentTerms','Payment Terms'),currency:rowPick(R,'Currency')||'CAD',creditLimit:rowPick(R,'Credit Limit'),onHold:rowPick(R,'On Hold'),holdReason:rowPick(R,'Hold Reason'),
  creditApplicationDate:rowPick(R,'CreditApplicationDate','Credit Application Date'),poRequired:rowPick(R,'PO Required'),checkTerms:rowPick(R,'Check Terms'),defaultDeliveryMethod:rowPick(R,'Delivery Method'),deliverTo:rowPick(R,'Deliver To'),
  fuelLevyMode:rowPick(R,'Fuel Levy Mode')||'default',fuelLevyRate:rowPick(R,'Fuel Levy Rate'),statementDelivery,statementEmail:rowPick(R,'Statement Email'),invoiceEmail:rowPick(R,'Invoice Email'),contacts,addresses,
  legacyRefs:{sourceSystem:'legacy-import',dcLink:rowPick(R,'DCLink'),flid:rowPick(R,'FLID'),iClassID:rowPick(R,'iClassID'),repID:rowPick(R,'RepID'),iAreasID:rowPick(R,'iAreasID'),uiARDeliveryMethod:rowPick(R,'uiARDeliveryMethod'),uiARCATID:rowPick(R,'uiARCATID'),accountStatusID:rowPick(R,'AccountStatusID'),iwg:rowPick(R,'I.W.G','IWG')}
 });
}
function parseCustomerImport(text,name){
 const ext=String(name||'').toLowerCase();
 if(ext.endsWith('.json')||/^\s*[\[{]/.test(text)){
  const src=JSON.parse(text),list=Array.isArray(src)?src:(Array.isArray(src.customers)?src.customers:Array.isArray(src.customer)?src.customer:null);
  if(!list)throw new Error('Customer JSON must contain a customers array.');
  return list.map(customerFromImportRow);
 }
 return csvParse(text).map(customerFromImportRow);
}
function validateCustomerImportList(list){
 if(!Array.isArray(list)||!list.length)throw new Error('The file contains no customers.');
 const codes=new Set();list.forEach((c,i)=>{
  if(!c.legalName)throw new Error('Customer row '+(i+1)+': Name is required.');
  if(c.code){const key=c.code.toUpperCase();if(codes.has(key))throw new Error('The import file contains duplicate Account "'+c.code+'".');codes.add(key);}
 });
}
function applyCustomerImport(list,mode){
 validateCustomerImportList(list);mode=mode==='replace'?'replace':'merge';
 if(mode==='replace'){
  const referenced=DB.customer.filter(c=>customerHasReferences(c.id));if(referenced.length)throw new Error('The customer master cannot be replaced because some customers are referenced by orders.');
  DB.customer=[];list.forEach(c=>{const n=normalizeCustomer(c);if(!n.code)n.code=nextCustomerCode();DB.customer.push(n);});
 }else{
  list.forEach(incoming=>{
   let current=null;if(incoming.id)current=DB.customer.find(c=>c.id===incoming.id)||null;
   if(!current&&incoming.code)current=DB.customer.find(c=>String(c.code).toUpperCase()===String(incoming.code).toUpperCase())||null;
   if(current){const keepId=current.id,created=current.createdAt;Object.assign(current,normalizeCustomer(Object.assign({},incoming,{id:keepId,createdAt:created||incoming.createdAt})));current.id=keepId;}
   else{const c=normalizeCustomer(incoming);if(!c.code)c.code=nextCustomerCode();DB.customer.push(c);}
  });
 }
 normalizeCustomers();touch();render();return list.length;
}
function importCustomersFile(inp,mode){
 const f=inp.files&&inp.files[0];if(!f)return;
 if(f.size>10*1024*1024){alert('Customer file exceeds 10 MB.');inp.value='';return;}
 if(mode==='replace'&&!confirm('Replace the entire customer master with data from the file? This cannot be undone without a backup export.')){inp.value='';return;}
 const r=new FileReader();r.onload=()=>{try{const list=parseCustomerImport(r.result,f.name);const n=applyCustomerImport(list,mode);alert('Customers imported: '+n);}catch(e){alert('Could not import customers: '+e.message);}finally{inp.value='';}};r.readAsText(f);
}
