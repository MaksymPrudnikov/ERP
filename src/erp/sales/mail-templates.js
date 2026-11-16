/* ============================================================================
   Шаблоны ответов клиенту: текст письма с полями {order}, {back order lines}…,
   которые ERP заменяет данными заказа. Панель Gmail вставляет готовый текст в
   ответ (конверт), правят шаблоны в Master Data → Email templates.
   IN : DB.emailTemplate (свои и правленые шаблоны), заказ, его клиент,
        salesLineProgress / salesOrderProgress (erp/sales/order-progress),
        Shipping (PS заказа), DB.company, вошедший человек (signinUser)
   OUT: MAIL_TPL_FIELDS — поля по группам; mailTemplates() — список шаблонов;
        mailTplRender(text, order, {from}) — готовый текст; mailTplSave,
        mailTplDelete — запись шаблона командой
   Владелец, 16.11.2026: «вариант ответа шаблоном с возможностью добавить
   самому и прописать шаблон самому»; back order — «лучше показать, что
   осталось 5 стёкол с такой-то линии, чем 195 строк, что выдано»; все четыре
   кучки, что считает система (Shipped, Ready, In production, Not started) —
   «если нужно соврать, руками напишут»; подпись — того, кто вошёл, а не
   название приложения. Денег в полях нет — как и в панели. Нет данных —
   поле пустое: ERP ничего не придумывает. Неизвестное поле ({opps}) остаётся
   в тексте как есть — опечатку видно в просмотре.
   ============================================================================ */
DEFAULT.emailTemplate=[];
/* Четыре шаблона есть сразу. Правка встроенного пишет строку с тем же id;
   удалённый встроенный — строка {id, deleted:true}. */
const MAIL_TPL_BUILTIN=[
 {id:'ET-received',name:'Order received',text:'Hi {contact first name},\n\nThank you for your order. We have it as order {order} (PO {po}): {units} units, due {due}.\n\nBest regards,\n{my name}\n{company}'},
 {id:'ET-status',name:'Status',text:'Hi {contact first name},\n\nOrder {order} (PO {po}) is {status}: {done} of {units} units done.\n\nShipped: {shipped}\nReady for pickup: {ready}\nIn production: {in production}\nNot started yet: {not started}\n\nDue date: {due}.\n\nBest regards,\n{my name}'},
 {id:'ET-backorder',name:'Back order',text:'Hi {contact first name},\n\nHere is where order {order} (PO {po}) stands — {done} of {units} units done:\n\nShipped: {shipped}\nReady for pickup: {ready}\nIn production: {in production}\nNot started yet: {not started}\n\nStill on back order — {back order} units:\n{back order lines}\n\nDue date: {due}.\n\nBest regards,\n{my name}'},
 {id:'ET-ready',name:'Ready for pickup',text:'Hi {contact first name},\n\n{ready} units of order {order} (PO {po}) are ready for pickup:\n{ready lines}\n\nStill on back order: {back order} units.\n\nBest regards,\n{my name}\n{company} · {company phone}\n{company address}'}
];
const MAIL_TPL_MAX=60,MAIL_TPL_TEXT=4000;
function mailTplString(v,n){return String(v==null?'':v).slice(0,n);}
function mailTplRows(){return Array.isArray(DB.emailTemplate)?DB.emailTemplate:[];}
function mailTplClean(t){
 t=t&&typeof t==='object'?t:{};
 const id=mailTplString(t.id,40);if(!id)return null;
 if(t.deleted===true)return {id,deleted:true};
 return {id,name:mailTplString(t.name,60).trim()||'Template',text:mailTplString(t.text,MAIL_TPL_TEXT).replace(/\r\n?/g,'\n'),updatedAt:mailTplString(t.updatedAt,40),updatedBy:mailTplString(t.updatedBy,80)};
}
function normalizeMailTemplates(){if(!Array.isArray(DB.emailTemplate))DB.emailTemplate=[];DB.emailTemplate=DB.emailTemplate.map(mailTplClean).filter(Boolean);}
/* Встроенные — в своём порядке, свои — за ними, в порядке создания. */
function mailTemplates(){
 const own=new Map(mailTplRows().map(t=>[t.id,t]));
 const base=MAIL_TPL_BUILTIN.map(b=>{const t=own.get(b.id);return t?(t.deleted?null:Object.assign({},t,{builtin:true})):Object.assign({},b,{builtin:true,updatedAt:'',updatedBy:''});}).filter(Boolean);
 return base.concat(mailTplRows().filter(t=>!t.deleted&&!MAIL_TPL_BUILTIN.some(b=>b.id===t.id)).map(t=>Object.assign({},t,{builtin:false})));
}
function mailTplFind(id){return mailTemplates().find(t=>t.id===id)||null;}
function mailTplWho(){const u=typeof signinUser==='function'?signinUser():null;return u&&u.name||'';}
function mailTplCanEdit(){return accessCan('masterdata');}
function mailTplSave(id,input){
 if(!mailTplCanEdit())return {ok:false,error:'Master Data access needed.'};
 const name=String(input&&input.name||'').trim(),text=String(input&&input.text||'');
 if(!name)return {ok:false,error:'Enter a name.'};
 if(!text.trim())return {ok:false,error:'Enter the text.'};
 if(!id&&mailTemplates().length>=MAIL_TPL_MAX)return {ok:false,error:'Up to '+MAIL_TPL_MAX+' templates.'};
 const tid=id||salesUid('ET');
 const out=storageCommand(()=>{
  if(!Array.isArray(DB.emailTemplate))DB.emailTemplate=[];
  const row=mailTplClean({id:tid,name,text,updatedAt:new Date().toISOString(),updatedBy:mailTplWho()}),i=DB.emailTemplate.findIndex(t=>t.id===tid);
  if(i>=0)DB.emailTemplate[i]=row;else DB.emailTemplate.push(row);return true;
 },{emailTemplate:[tid]});
 return out.ok?{ok:true,id:tid}:{ok:false,error:out.error};
}
function mailTplDelete(id){
 if(!mailTplCanEdit())return {ok:false,error:'Master Data access needed.'};
 const builtin=MAIL_TPL_BUILTIN.some(b=>b.id===id);
 const out=storageCommand(()=>{
  if(!Array.isArray(DB.emailTemplate))DB.emailTemplate=[];
  DB.emailTemplate=DB.emailTemplate.filter(t=>t.id!==id);if(builtin)DB.emailTemplate.push({id,deleted:true});return true;
 },{emailTemplate:[id]});
 return out.ok?{ok:true}:{ok:false,error:out.error};
}

/* ------------------------------- Поля ---------------------------------- */
function mailTplDay(iso){
 const s=String(iso||''),t=Date.parse(s.length===10?s+'T12:00:00':s);if(Number.isNaN(t))return '';
 const d=new Date(t);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+(d.getFullYear()!==new Date().getFullYear()?', '+d.getFullYear():'');
}
function mailTplUnits(n){return n+(n===1?' unit':' units');}
function mailTplNum(n){return typeof n==='number'?String(n):'';}
/* Строка заказа так, как её узнает клиент: номер, марка, размер, состав —
   именами стекла, как на бланках клиента (код и Short name — внутренние). */
function mailTplLineName(o,l){
 const i=(o.lines||[]).indexOf(l),m=salesMakeupById(o,l.makeupId);
 return ['Line '+(i+1),l.mark||'',docSize(l),m?salesMakeupSummary(m,'name'):''].filter(Boolean).join(' · ');
}
function mailTplParts(r,withShipped){
 return [withShipped&&r.shipped?r.shipped+' shipped':'',r.ready?r.ready+' ready':'',r.inProduction?r.inProduction+' in production':'',r.notStarted?r.notStarted+' not started yet':''].filter(Boolean);
}
function mailTplBreak(n,parts){return mailTplUnits(n)+(parts.length===1?', '+parts[0].replace(/^\d+ /,''):parts.length?': '+parts.join(', '):'');}
function mailTplLinesText(c,pick){return c.lines().map(r=>pick(r)).filter(Boolean).join('\n');}
function mailTplCompany(){return DB.company||{};}
function mailTplNextTrip(c){
 const o=c.o,s=(typeof shippingForOrder==='function'?shippingForOrder(o.id):[]).filter(x=>x.status==='planned'&&x.date&&shippingCarries(x,o.id)).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0];
 if(!s)return '';
 const t=s.method==='delivery'&&typeof truckFind==='function'?truckFind(s.truckId):null;
 return (s.method==='delivery'?'Delivery ':'Pickup ')+mailTplDay(s.date)+(s.departAt?' at '+s.departAt:'')+(t?' · '+t.name:'');
}
function mailTplSlips(c){
 const o=c.o;
 return (typeof shippingForOrder==='function'?shippingForOrder(o.id):[]).filter(s=>shippingSent(s)&&shippingCarries(s,o.id)).sort((a,b)=>String(a.shippedAt).localeCompare(String(b.shippedAt)));
}
/* Группы и поля — порядок на экране редактора. hint — что подставится. */
const MAIL_TPL_FIELDS=[
 {group:'Order',fields:[
  ['order','Order number',c=>c.o.businessNumber||''],
  ['po','Customer PO',c=>c.o.customerPo||''],
  ['status','Status as in Sales',c=>c.p().status||''],
  ['due','Due date',c=>mailTplDay(c.o.dueDate)],
  ['order date','When the order was created',c=>mailTplDay(c.o.createdAt)],
  ['priority','Normal, Rush or Critical',c=>({normal:'Normal',rush:'Rush',critical:'Critical'})[c.o.priority]||''],
  ['pickup or delivery','Pickup or Delivery',c=>c.o.delivery==='delivery'?'Delivery':'Pickup'],
  ['branch','Branch',c=>c.o.branch||''],
  ['hold reason','Why the order is on hold',c=>c.o.onHold?c.o.holdReason||'On hold':''],
  ['order link','Link that opens the order in Glass Farm',c=>c.o.businessNumber&&typeof location!=='undefined'?location.href.split('#')[0]+'#order='+encodeURIComponent(c.o.businessNumber):'']
 ]},
 {group:'Quote',fields:[
  ['quote','Quote number',c=>salesIsQuote(c.o)?c.o.businessNumber||'':''],
  ['revision','Quote revision',c=>salesIsQuote(c.o)?salesQuoteRevName(c.o):''],
  ['valid until','Prices valid until',c=>salesIsQuote(c.o)?mailTplDay(salesQuoteValidUntil(c.o)):''],
  ['from quote','Quote the order came from',c=>{const q=c.o.fromQuoteId&&(DB.salesOrder||[]).find(x=>x.id===c.o.fromQuoteId);return q&&q.businessNumber||'';}]
 ]},
 {group:'Customer',fields:[
  ['customer','Customer name',c=>c.cust?c.cust.displayName||c.cust.legalName||'':''],
  ['customer code','Customer code',c=>c.cust&&c.cust.code||''],
  ['contact name','Contact who wrote, or the main contact',c=>c.contact().name||''],
  ['contact first name','First word of the contact name',c=>String(c.contact().name||'').trim().split(/\s+/)[0]||''],
  ['contact phone','Contact phone',c=>{const k=c.contact();return k.phone||k.mobile||k.phone2||'';}],
  ['contact email','Contact email',c=>c.contact().email||''],
  ['delivery address','Default delivery address',c=>c.cust?docAddressText(customerAddressByType(c.cust,'delivery')):''],
  ['payment terms','Cash or Credit · Net days',c=>!c.cust?'':c.cust.paymentMode==='credit'?'Credit'+(c.cust.creditDays?' · Net '+c.cust.creditDays:''):'Cash']
 ]},
 {group:'Progress · units',fields:[
  ['units','All units of the order',c=>mailTplNum(c.u().total)],
  ['done','Shipped and ready together',c=>mailTplNum(c.u().done)],
  ['percent done','Done as a percent',c=>{const u=c.u();return u.total?Math.round(u.done/u.total*100)+'%':'';}],
  ['shipped','Units shipped',c=>mailTplNum(c.u().shipped)],
  ['ready','Units ready to ship',c=>mailTplNum(c.u().ready)],
  ['in production','Units in the shop',c=>mailTplNum(c.u().inProduction)],
  ['not started','Units not in production yet',c=>mailTplNum(c.u().notStarted)],
  ['back order','Units not shipped yet',c=>{const u=c.u();return !salesIsQuote(c.o)&&typeof u.total==='number'?String(u.total-(u.shipped||0)):'';}],
  ['cancelled','Cancelled units',c=>String((c.o.cancellations||[]).reduce((n,x)=>n+(x.units||[]).length,0))],
  ['where is the glass','Stations where lites wait',c=>(c.p().stations||[]).filter(s=>s.waiting).map(s=>s.code+' — '+s.waiting+(s.waiting===1?' lite':' lites')).join(', ')]
 ]},
 {group:'Lines',fields:[
  ['back order lines','Lines with something left — one per row',c=>mailTplLinesText(c,r=>{const n=r.ordered-r.shipped;return n>0?'• '+mailTplLineName(c.o,r.l)+' — '+mailTplBreak(n,mailTplParts(r)):'';})],
  ['ready lines','Lines with units ready to ship',c=>mailTplLinesText(c,r=>r.ready?'• '+mailTplLineName(c.o,r.l)+' — '+mailTplUnits(r.ready)+' ready':'')],
  ['shipped lines','Lines with units shipped',c=>mailTplLinesText(c,r=>r.shipped?'• '+mailTplLineName(c.o,r.l)+' — '+r.shipped+' of '+r.ordered+' shipped':'')],
  ['all lines','Every line with its state',c=>mailTplLinesText(c,r=>'• '+mailTplLineName(c.o,r.l)+' — '+mailTplBreak(r.ordered,mailTplParts(r,true)))],
  ['line count','Number of lines',c=>String((c.o.lines||[]).length)],
  ['area ft²','Glass area, ft²',c=>{const a=(c.o.lines||[]).reduce((n,l)=>n+(salesLineAreaFt2(l)||0)*salesPositiveInt(l.qty,1),0);return a?(Math.round(a*10)/10).toLocaleString('en-US'):'';}],
  ['weight ~lb','Approximate weight, lb',c=>{const w=salesOrderWeight(c.o);return w&&w.kg?'~'+Math.round(w.kg*2.20462).toLocaleString('en-US')+' lb':'';}]
 ]},
 {group:'Shipping',fields:[
  ['packing slips','Sent packing slips with dates',c=>mailTplSlips(c).map(s=>'• '+s.number+' · '+mailTplDay(s.shippedAt)+' · '+mailTplUnits((s.items||[]).filter(i=>i.orderId===c.o.id).length)).join('\n')],
  ['last shipped','Date of the last packing slip',c=>{const l=mailTplSlips(c).pop();return l?mailTplDay(l.shippedAt):'';}],
  ['delivered','Units delivered',c=>{const n=c.lines().reduce((s,r)=>s+(r.delivered||0),0);return n?String(n):'';}],
  ['next delivery','Planned pickup or delivery',c=>mailTplNextTrip(c)],
  ['ready since','When the order became Ready',c=>mailTplDay(c.o.statusDates&&c.o.statusDates.ready)],
  ['stock items','Stock items shipped of ordered',c=>{const x=c.p().extras;return x?x.shipped+' of '+x.ordered+' shipped':'';}]
 ]},
 {group:'Me · company · date',fields:[
  ['my name','Who is signed in to Glass Farm',c=>c.user?c.user.name||'':''],
  ['my email','Server login of who is signed in',c=>c.user&&c.user.email||''],
  ['company','Company name (Master Data → Company)',()=>mailTplCompany().legalName||''],
  ['company phone','Company phone',()=>mailTplCompany().phone||''],
  ['company email','Company email',()=>mailTplCompany().email||''],
  ['company website','Company website',()=>mailTplCompany().website||''],
  ['company address','Company address',()=>docCompanyBlock().lines.slice(0,2).join(', ')],
  ['today','Today’s date',()=>mailTplDay(new Date().toISOString())]
 ]}
];
const MAIL_TPL_FIELD=new Map(MAIL_TPL_FIELDS.flatMap(g=>g.fields.map(f=>[f[0],f])));
/* Что нужно полям — считается один раз и только если поле есть в тексте. */
function mailTplContext(o,opts){
 const memo={},once=(k,f)=>()=>k in memo?memo[k]:(memo[k]=f());
 const cust=salesFindCustomer(o.customerId),from=orderEmailAddress(opts&&opts.from);
 const c={o,cust,user:typeof signinUser==='function'?signinUser():null};
 c.contact=once('contact',()=>cust?(from&&(cust.contacts||[]).find(x=>orderEmailAddress(x.email)===from))||customerPrimaryContact(cust):{});
 c.p=once('p',()=>salesOrderProgress(o)||{units:{}});
 c.u=once('u',()=>c.p().units||{});
 c.lines=once('lines',()=>salesIsQuote(o)?[]:salesLineProgress(o));
 return c;
}
function mailTplRender(text,o,opts){
 o=salesOrderArg(o);if(!o)return '';
 const c=mailTplContext(o,opts);
 return String(text||'').replace(/\{([^{}\n]{1,40})\}/g,(all,k)=>{const f=MAIL_TPL_FIELD.get(k.trim().toLowerCase());if(!f)return all;try{return String(f[2](c)||'');}catch(e){return '';}}).replace(/\n{3,}/g,'\n\n');
}
