/* ============================================================================
   Мост для панели Gmail: страница ERP отвечает расширению Chrome, какой заказ
   показать рядом с открытым письмом, и выполняет его команды — открыть заказ,
   создать заказ или квоту, привязать письмо (задание
   docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md, этап 3, раздел «Логика панели»).
   IN : сообщения window {gf:'mail', id, req, …} от своей же страницы (их
        кладёт расширение); DB.salesOrder, DB.customer, archiveIndex;
        salesOrderProgress (erp/sales/order-progress), orderEmail*
        (erp/sales/order-emails), шаблоны (erp/sales/mail-templates), PDF
        бланков (erp/documents, erp/shipping/print), вход и доступ
   OUT: ответ window {gf:'mail-reply', id, req, res}; mailBridgeHandle(m) —
        тот же ответ вызовом (тесты). Чтение: lookup, orders, search,
        templates, reply, documents, document (PDF base64; чертежи — Promise). Команды:
        openOrder, openCustomer, newOrder, linkEmail, mailLog, threadLog,
        openTemplates
   Заказчик задания, 15.11.2026: панель показывает то, что относится к
   открытому письму, а не всё, что есть у клиента; «не хочу, чтобы код работал
   под логикой слов или шаблонов и предугадывал». Поэтому мост текста письма
   не получает вообще: только адрес отправителя, номер ветки и письма. Порядок
   решения — сверху вниз, срабатывает первое:
     0. человек не вошёл или нет галочки Sales — {error:'signin'|'access'};
     1. адрес отправителя стоит в карточке ровно одного клиента — клиент
        известен; у двух и больше — панель не выбирает за человека;
     2. есть заказы или квоты с привязкой к этой ветке — они, и на этом всё;
     3. номер или PO открытого заказа в тексте письма ищет сама панель по
        списку known — текст из вкладки Gmail не выходит;
     4. до трёх открытых заказов клиента и счётчик по статусам.
   Сам мост ничего не привязывает: запись — только командой linkEmail по
   нажатию человека. Денег в ответах нет.
   ============================================================================ */
const MAIL_BRIDGE_VERSION=2,MAIL_OPEN_DAYS=14,MAIL_ROWS=3,MAIL_SEARCH_ROWS=8,MAIL_CLOSED_ROWS=30,MAIL_KNOWN_MAX=400;
/* Порядок «самых актуальных» у непривязанного письма: готовое к выдаче —
   первым, затем то, что в цеху, внутри — ближний срок выше. */
const MAIL_RANK=['ready','shipping','batched','verified','new','done'];
function mailCustomerEmails(c){
 const out=new Set(),add=v=>String(v||'').split(/[\s,;]+/).forEach(x=>{const a=orderEmailAddress(x);if(a)out.add(a);});
 (c.contacts||[]).forEach(x=>add(x.email));add(c.invoiceEmail);add(c.statementEmail);return out;
}
function mailCustomersFor(addr){return addr?(DB.customer||[]).filter(c=>c&&c.status!=='archived'&&mailCustomerEmails(c).has(addr)):[];}
function mailCustomer(c,from){
 const p=(c.contacts||[]).find(x=>orderEmailAddress(x.email)===from)||customerPrimaryContact(c);
 return {id:c.id,name:c.displayName||c.legalName||c.code||'',contact:{name:p.name||'',role:p.role||'',phone:p.phone||p.mobile||p.phone2||'',email:p.email||''},
  terms:c.paymentMode==='credit'?'Credit'+(c.creditDays?' · Net '+c.creditDays:''):'Cash'};
}
/* Открытый — тот, о котором клиент может спросить: не Closed, не Cancelled;
   выданный — ещё MAIL_OPEN_DAYS дней после выдачи; квота — пока не Won и не
   вышел срок цен. */
function mailIsOpen(o){
 if(salesIsQuote(o))return salesQuoteGroupStatus(o)!=='won'&&salesQuoteValidUntil(salesQuoteRepresentative(o))>=finToday();
 if(o.status==='closed'||o.status==='cancelled')return false;
 if(o.status==='done'){const d=Date.parse(o.statusDates&&o.statusDates.done||'');return !Number.isNaN(d)&&Date.now()-d<MAIL_OPEN_DAYS*864e5;}
 return true;
}
function mailNumberOf(id){const o=id&&(DB.salesOrder||[]).find(x=>x.id===id);return o&&o.businessNumber||'';}
function mailCard(o){
 const p=salesOrderProgress(o),q=salesIsQuote(o);
 return {id:o.id,number:o.businessNumber||'',po:o.customerPo||'',customer:salesCustomerDisplay(o.customerId),open:mailIsOpen(o),draft:salesIsDraft(o),
  fromQuote:q?'':mailNumberOf(o.fromQuoteId),wonOrder:q?mailNumberOf(p.wonOrderId):'',progress:p};
}
function mailRank(o){const i=salesIsQuote(o)?MAIL_RANK.length:MAIL_RANK.indexOf(o.status);return i<0?MAIL_RANK.length:i;}
function mailByRank(a,b){return mailRank(a)-mailRank(b)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||String(b.createdAt||'').localeCompare(String(a.createdAt||''));}
/* Запись, которую показывают за квоту: одна на группу ревизий, как в Sales. */
function mailShown(o){return salesIsQuote(o)?salesQuoteRepresentative(o):o;}
function mailLookup(m){
 const from=orderEmailAddress(m.from),threadId=orderEmailId(m.threadId),messageId=orderEmailId(m.messageId);
 const custs=mailCustomersFor(from),c=custs.length===1?custs[0]:null;
 const out={step:5,customer:c?mailCustomer(c,from):null,customers:custs.length,linked:[],closed:[],closedCount:0,archived:[],rows:[],openCount:0,counts:[],known:[]};
 /* Шаг 2: привязанное к ветке. Письмо, из которого привязали, — первым. */
 if(threadId){
  const seen=new Set(),open=[],closed=[];
  (DB.salesOrder||[]).forEach(o=>{
   const e=(o.emails||[]).find(x=>x.threadId===threadId);if(!e)return;
   const s=mailShown(o);if(seen.has(s.id))return;seen.add(s.id);
   (mailIsOpen(s)?open:closed).push({o:s,here:!!messageId&&e.messageId===messageId});
  });
  open.sort((a,b)=>Number(b.here)-Number(a.here)||mailByRank(a.o,b.o));
  closed.sort((a,b)=>String(b.o.updatedAt||'').localeCompare(String(a.o.updatedAt||'')));
  out.linked=open.map(x=>Object.assign(mailCard(x.o),{here:x.here,talk:mailTalk(x.o)}));
  out.closedCount=closed.length;out.closed=closed.slice(0,MAIL_CLOSED_ROWS).map(x=>mailCard(x.o));
  if(typeof archiveIndex!=='undefined')archiveIndex.forEach((a,id)=>{if(a.rep&&Array.isArray(a.mail)&&a.mail.includes(threadId))out.archived.push({id,number:a.number||'',status:a.row&&a.row.status||''});});
  if(out.linked.length||out.closedCount||out.archived.length){out.step=2;return out;}
 }
 if(!c)return out;
 /* Шаги 3–4: открытые заказы и квоты клиента. Черновик ни в чём не участвует. */
 const open=(DB.salesOrder||[]).filter(o=>o.customerId===c.id&&!salesIsDraft(o)&&mailShown(o).id===o.id&&mailIsOpen(o)).sort(mailByRank);
 out.step=4;out.openCount=open.length;
 out.known=open.slice(0,MAIL_KNOWN_MAX).map(o=>({id:o.id,number:o.businessNumber||'',po:o.customerPo||''}));
 out.rows=open.slice(0,MAIL_ROWS).map(mailCard);
 if(open.length>MAIL_ROWS){const n=new Map();open.forEach(o=>{const k=salesIsQuote(o)?'Quote':salesStatusLabel(o);n.set(k,(n.get(k)||0)+1);});out.counts=[...n].map(([label,count])=>({label,count}));}
 return out;
}
function mailOrders(m){
 const ids=(Array.isArray(m.ids)?m.ids:[]).slice(0,20).map(String);
 return {orders:ids.map(id=>(DB.salesOrder||[]).find(o=>o.id===id)).filter(Boolean).map(mailCard)};
}
/* Link to order: поиск по номеру или PO среди заказов и квот — и закрытых. */
function mailSearch(m){
 const q=String(m.q||'').trim().toLowerCase();if(q.length<2)return {rows:[]};
 const hit=o=>{const n=String(o.businessNumber||'').toLowerCase(),p=String(o.customerPo||'').toLowerCase();return n.startsWith(q)?0:p.startsWith(q)?1:n.includes(q)||p.includes(q)?2:-1;};
 const found=[];(DB.salesOrder||[]).forEach(o=>{if(salesIsDraft(o)||mailShown(o).id!==o.id)return;const r=hit(o);if(r>=0)found.push({o,r});});
 found.sort((a,b)=>a.r-b.r||Number(mailIsOpen(b.o))-Number(mailIsOpen(a.o))||String(b.o.createdAt||'').localeCompare(String(a.o.createdAt||'')));
 return {rows:found.slice(0,MAIL_SEARCH_ROWS).map(x=>mailCard(x.o)),more:Math.max(0,found.length-MAIL_SEARCH_ROWS)};
}
/* ------------------------------ Команды -------------------------------- */
function mailOpenOrder(m){
 const id=String(m.orderId||''),o=(DB.salesOrder||[]).find(x=>x.id===id);
 if(!o&&!(typeof archiveKnown==='function'&&archiveKnown(id)))return {error:'missing'};
 tab='sales';subtab='orders';salesLeaveDraft(()=>o?salesOrderEdit(id):archiveOpen(id));return {ok:true};
}
/* «+24 more · open in ERP»: Sales с фильтром по клиенту, без срока Created —
   открытый заказ бывает старше двух недель. */
function mailOpenCustomer(m){
 const c=(DB.customer||[]).find(x=>x.id===String(m.customerId||''));if(!c)return {error:'missing'};
 tab='sales';subtab='orders';
 salesLeaveDraft(()=>{
  const p=salesListLoadPrefs();p.filters.customer=salesListCleanFilter('customer',{conds:[{op:'equals',v:c.displayName||c.legalName||''}]});delete p.filters.created;p.quick='all';
  salesListSavePrefs();render();
 });
 return {ok:true};
}
function mailNewOrder(m){
 const c=(DB.customer||[]).find(x=>x.id===String(m.customerId||'')),e=orderEmailStamp(m.email);
 tab='sales';subtab='orders';
 salesLeaveDraft(()=>{salesOrderNew(m.kind==='quote'?'quote':'order');if(c)salesApplyCustomerDefaults(c.id);if(e)orderEmailSet(soDraft,[e]);render();});
 return {ok:true};
}
function mailLinkEmail(m){
 const id=String(m.orderId||'');
 if(!(DB.salesOrder||[]).some(o=>o.id===id))return {error:typeof archiveKnown==='function'&&archiveKnown(id)?'The order is in the archive. Open it in Glass Farm first.':'The order was not found.'};
 const r=orderEmailAdd(id,m.email);if(r.ok)render();
 return r.ok?{ok:true}:{error:r.error};
}
/* ------------------- Ответ: шаблоны, документы, журнал ------------------- */
/* Конверт панели: список шаблонов и готовый текст на этом заказе
   (erp/sales/mail-templates). Подпись — вошедший в эту вкладку ERP. */
function mailOrderOf(m){const id=String(m.orderId||'');return (DB.salesOrder||[]).find(o=>o.id===id)||null;}
function mailTemplatesList(m){
 if(!mailOrderOf(m))return {error:'missing'};
 return {templates:mailTemplates().map(t=>({id:t.id,name:t.name})),canEdit:mailTplCanEdit()};
}
function mailReply(m){
 const o=mailOrderOf(m),t=mailTplFind(String(m.templateId||''));if(!o||!t)return {error:'missing'};
 return {name:t.name,text:mailTplRender(t.text,o,{from:m.from})};
}
/* Скрепка панели: те же PDF, что Documents заказа, с настройками бланков из
   Master Data; Invoice — только когда клиент получил последний юнит; PS —
   отправленные. Work order — тоже (владелец, 16.11.2026: «пусть будет»). */
const MAIL_DOC_KINDS=['workOrder','confirmation','proforma','invoice'];
/* Больше — не передаём панели: Gmail берёт до 25 МБ, а сообщение между вкладками не резиновое. */
const MAIL_PDF_MAX=40*1048576;
/* Чертежи — все строки заказа одним PDF (владелец, 16.11.2026). */
function mailDocList(o){
 const n=(o.lines||[]).length,drawings=n?[{key:'drawings',label:'Drawings',hint:n+(n===1?' line':' lines')+' · 1 PDF'}]:[];
 if(salesIsQuote(o))return [{key:'quote',label:'Quote',hint:salesQuoteRevName(o)}].concat(drawings);
 const inv=!!finInvoiceDate(o);
 return MAIL_DOC_KINDS.map(k=>({key:k,label:docKindLabel(k),hint:k==='invoice'&&!inv?'after last unit':'',off:k==='invoice'&&!inv})).concat(drawings)
  .concat(shippingForOrder(o.id).filter(s=>shippingSent(s)&&shippingCarries(s,o.id)).map(s=>({key:'ps:'+s.id,label:'Packing slip',hint:s.number})));
}
function mailDocuments(m){const o=mailOrderOf(m);return o?{docs:mailDocList(o)}:{error:'missing'};}
function mailBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function mailDocument(m){
 const o=mailOrderOf(m),key=String(m.key||'');if(!o)return {error:'missing'};
 const d=mailDocList(o).find(x=>x.key===key);if(!d||d.off)return {error:'This document is not available for the order.'};
 /* Чертежи рисуются картинками — не сразу: ответ — Promise (мост ждёт его). */
 if(key==='drawings')return docDrawingsPdf(o).then(r=>r.bytes.length>MAIL_PDF_MAX?{error:'Drawings are '+Math.round(r.bytes.length/1048576)+' MB — too big for an email. Print them from Documents in Glass Farm.'}:{name:r.name,label:'Drawings · '+r.sheets+(r.sheets===1?' sheet':' sheets'),data:mailBase64(r.bytes)},e=>({error:e&&e.message||'The drawings could not be prepared.'}));
 let pages,name,title;
 if(key.startsWith('ps:')){const s=shippingFind(key.slice(3));pages=shippingPages(shippingDocument(s));title='Packing slip '+s.number;name=title.replace(/[^A-Za-z0-9]+/g,'_')+'.pdf';}
 else{pages=docPages(Object.assign(docBuildModel(key,o,docDefaultOptions(key)),{form:''}));title=docKindLabel(key)+' '+(o.businessNumber||'draft');name=docFileName(key,o);}
 return {name,label:d.label+(key.startsWith('ps:')?' '+d.hint:''),data:mailBase64(docPdfBytes(pages,{title}))};
}
/* Журнал заказа: что сделали кнопками панели. */
const MAIL_LOG_KINDS={text:'Reply text',doc:'Document attached'};
function mailLog(m){
 const o=mailOrderOf(m),what=MAIL_LOG_KINDS[m.kind];if(!o||!what)return {error:'missing'};
 const r=storageCommand(()=>{const now=mailOrderOf(m);if(now)orderLogPush(now,what,String(m.note||'').slice(0,200));return true;},{orderEvent:[]});
 return r.ok?{ok:true}:{error:r.error};
}
/* Письма переписки — в журнал каждого заказа, привязанного к ней: когда
   клиент написал, когда ответили мы (письмо с ящика, открытого в Gmail).
   Только время, кто и тема — текста письма мост не получает. Запись одна на
   письмо и заказ: id события несёт номер письма. */
const MAIL_LOG_WHATS=['Customer email','Reply sent','Reply text','Document attached','Email linked','Email removed'];
/* Наше письмо — с ящика, открытого в Gmail, или с адреса нашего домена,
   которого нет у клиента заказа (ответили с другого адреса компании). Ящик
   не узнали — наше всё, чего нет в карточке клиента. */
function mailDomain(a){return String(a||'').split('@')[1]||'';}
function mailIsOurs(o,from,acc){
 if(acc&&from===acc)return true;
 const c=(DB.customer||[]).find(x=>x.id===o.customerId);if(c&&mailCustomerEmails(c).has(from))return false;
 return !acc||mailDomain(from)===mailDomain(acc);
}
function mailThreadLog(m){
 const threadId=orderEmailId(m.threadId),acc=orderEmailAddress(m.account),subject=orderEmailText(m.subject,160);
 if(!threadId)return {error:'missing'};
 const orders=(DB.salesOrder||[]).filter(o=>(o.emails||[]).some(e=>e.threadId===threadId));
 const have=new Set((DB.orderEvent||[]).map(e=>e.id)),add=[];
 (Array.isArray(m.messages)?m.messages:[]).slice(0,200).forEach(x=>{
  const id=orderEmailId(x&&x.id),from=orderEmailAddress(x&&x.from),at=orderEmailIso(x&&x.at);if(!id||!from||!at)return;
  const name=orderEmailText(x.name,60);
  orders.forEach(o=>{const eid='OEM-'+o.id+'-'+id;if(have.has(eid))return;have.add(eid);
   add.push({id:eid,at,orderId:o.id,no:String(o.businessNumber||''),what:mailIsOurs(o,from,acc)?'Reply sent':'Customer email',note:subject,by:(name&&name!==from?name+' · ':'')+from,byId:''});});
 });
 if(!add.length)return {ok:true,added:0};
 const r=storageCommand(()=>{if(!Array.isArray(DB.orderEvent))DB.orderEvent=[];add.forEach(e=>DB.orderEvent.push(e));return true;},{orderEvent:add.map(e=>e.id)});
 return r.ok?{ok:true,added:add.length}:{error:r.error};
}
/* Последнее письмо клиента и наш последний ответ — строкой в карточке панели. */
function mailTalk(o){
 let customerAt='',replyAt='';
 (DB.orderEvent||[]).forEach(e=>{if(e.orderId!==o.id)return;if(e.what==='Customer email'&&e.at>customerAt)customerAt=e.at;if(e.what==='Reply sent'&&e.at>replyAt)replyAt=e.at;});
 return customerAt||replyAt?{customerAt,replyAt}:null;
}
function mailOpenTemplates(){
 if(!accessCan('masterdata'))return {error:'No Master Data access.'};
 if(typeof mdLeave==='function'&&!mdLeave())return {ok:true};
 tab='masterdata';mdTab='emails';render();return {ok:true};
}
const MAIL_READ={lookup:mailLookup,orders:mailOrders,search:mailSearch,templates:mailTemplatesList,reply:mailReply,documents:mailDocuments,document:mailDocument},
 MAIL_DO={openOrder:mailOpenOrder,openCustomer:mailOpenCustomer,newOrder:mailNewOrder,linkEmail:mailLinkEmail,mailLog,threadLog:mailThreadLog,openTemplates:mailOpenTemplates};
/* Шаг 0. Вход включён, а человека нет — signin; вошёл без Sales — access. */
function mailBridgeGate(){
 if(!window.GF_NO_SIGNIN&&typeof signinOn==='function'&&signinOn()&&!signinUser())return 'signin';
 return accessCan('sales')?'':'access';
}
function mailBridgeHandle(m){
 m=m&&typeof m==='object'?m:{};
 const gate=mailBridgeGate();
 if(m.req==='hello')return {ok:true,version:MAIL_BRIDGE_VERSION,build:storageBuildId(),state:gate||'ready'};
 if(gate)return {error:gate};
 /* Чтение — одним проходом с общими указателями (erp/read-scope), как отрисовка. */
 if(MAIL_READ[m.req])return readScopeNow(()=>MAIL_READ[m.req](m));
 if(MAIL_DO[m.req])return MAIL_DO[m.req](m);
 return {error:'unknown'};
}
/* Сообщение принимается только от своего же окна и своего адреса. Страница,
   открытая файлом с диска, адреса не имеет — ей отвечаем без него. */
if(typeof window!=='undefined')window.addEventListener('message',ev=>{
 const m=ev.data,file=location.protocol==='file:';
 if(ev.source!==window||!file&&ev.origin!==location.origin||!m||m.gf!=='mail'||typeof m.req!=='string')return;
 let res;try{res=mailBridgeHandle(m);}catch(err){res={error:'failed'};}
 const post=r=>window.postMessage({gf:'mail-reply',id:m.id,req:m.req,res:r},file?'*':location.origin);
 if(res&&typeof res.then==='function')res.then(post,()=>post({error:'failed'}));else post(res);
});
