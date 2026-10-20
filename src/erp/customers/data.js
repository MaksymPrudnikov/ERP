/* =====================================================================
   erp/customers/data  ·  customers-1.0
   Customer master: schema, normalization, export CSV / JSON. Импорт одних
   клиентов убран (владелец, аудит F07 / F10): клиенты приходят полным
   импортом базы или заводятся в Customers.
   IN : DB.customer
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
function customerStatusLabel(v){return v==='archived'?'Archived':v==='inactive'?'Inactive':'Active';}
function customerStatementLabel(v){return v==='print'?'Print':v==='both'?'Email + print':v==='none'?'Do not send':'Email';}
function customerFuelLabel(v){return v==='custom'?'Custom rate':v==='exempt'?'No fuel surcharge':'Default';}

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
  paymentTerms:customerString(c.paymentTerms),...paymentTermsFrom(c),currency:CUSTOMER_CURRENCIES.includes(c.currency)?c.currency:'CAD',creditLimit:customerNumber(c.creditLimit),
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
 const collections=['salesOrder','salesOrders','orderRevision','orderRevisions','receipt','refund','financeEvent','financeTerms'];
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
 const H=['Customer ID','Account','Name','Display Name','Status','IsProspect','CustomerType','Group','Area','SalesRep','Telephone','Telephone2','Mobile','Fax1','EMail','Addressee','Post Add1','Post Add2','Post Add3','Post Add4','Post Add5','Post PC','Del Add1','Del Add2','Del Add3','Del Add4','Del Add5','Del PC','Deliver To','On Hold','Hold Reason','I.W.G','Print Statements','Email Statements','Check Terms','TAX Number','Registration','Credit Limit','Delivery Method','Fuel Levy Rate','Fuel Levy Mode','Currency','AccountOpenDate','CreditApplicationDate','PaymentTerms','PO Required','Statement Email','Invoice Email','Notes','Internal Notes','Contacts JSON','Addresses JSON','DCLink','FLID','iClassID','RepID','iAreasID','uiARDeliveryMethod','uiARCATID','AccountStatusID','Payment Mode','Deposit %','Credit Days'];
 const rows=DB.customer.map(c=>{
  const p=customerPrimaryContact(c),b=customerAddressByType(c,'billing'),d=customerAddressByType(c,'delivery'),lr=c.legacyRefs||{};
  const print=['print','both'].includes(c.statementDelivery),email=['email','both'].includes(c.statementDelivery);
  const vals=[c.id,c.code,c.legalName,c.displayName,c.status,c.isProspect,c.customerType,c.group,c.area,c.salesRep,p.phone,p.phone2,p.mobile,p.fax,p.email,p.name,b.address1,b.address2,b.address3,'','',b.postalCode,d.address1,d.address2,d.address3,'','',d.postalCode,c.deliverTo,c.onHold,c.holdReason,lr.iwg,print,email,c.checkTerms,c.taxNumber,c.registrationNumber,c.creditLimit==null?'':c.creditLimit,c.defaultDeliveryMethod,c.fuelLevyRate==null?'':c.fuelLevyRate,c.fuelLevyMode,c.currency,c.accountOpenedAt,c.creditApplicationDate,c.paymentTerms,c.poRequired,c.statementEmail,c.invoiceEmail,c.notes,c.internalNotes,JSON.stringify(c.contacts),JSON.stringify(c.addresses),lr.dcLink,lr.flid,lr.iClassID,lr.repID,lr.iAreasID,lr.uiARDeliveryMethod,lr.uiARCATID,lr.accountStatusID,c.paymentMode,c.depositPercent==null?'':c.depositPercent,c.creditDays==null?'':c.creditDays];
  return vals;
 });
 return [H].concat(rows);
}
function exportCustomersCSV(){customerDownload('glass_erp_customers.csv',customerCsvRows().map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
