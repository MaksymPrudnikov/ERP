/* Шаблоны ответов и документы для панели Gmail (erp/sales/mail-templates,
   erp/mail-bridge; владелец, 16.11.2026): поля подставляются данными заказа,
   back order — только строки с остатком, свои шаблоны пишет владелец в Master
   Data → Email templates; PDF бланков — через мост; письма переписки — в
   журнал заказа одной записью на письмо. Денег в полях нет. */
module.exports=async function({page,eq}){
 console.log('mail templates');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];DB.emailTemplate=[];
  window.mtC=oqCustomer({legalName:'ABC Glass Ltd',contacts:[{name:'Anna Kowal',email:'anna@abcglass.example',isPrimary:true},{name:'John Miller',email:'john@abcglass.example',phone:'416-555-0142'}]});
  window.mb=(req,extra)=>mailBridgeHandle(Object.assign({gf:'mail',req},extra));
  window.mtA=oqOrder(mtC,{customerPo:'4502',dueDate:'2026-11-28'});salesDraftDrop();
  window.mtB=oqOrder(mtC,{customerPo:'4390',dueDate:'2026-12-01'});salesDraftDrop();oqThrough(mtB,'batched');oqReady(mtB);
  touch();
 });
 eq('Шаблоны: четыре встроенных в своём порядке; свой — за ними; правка встроенного — на месте, удалённый встроенный не показывается; без Master Data — отказ',await run(()=>{
  const names=()=>mailTemplates().map(x=>x.name+(x.builtin?'':'*'));
  const first=names(),own=mailTplSave('',{name:'Delivery tomorrow',text:'Hi {contact first name}, see you tomorrow.'}),bad=mailTplSave('',{name:'',text:'x'});
  mailTplSave('ET-status',{name:'Status update',text:'{order} is {status}.'});mailTplDelete('ET-received');
  const after=names(),rows=DB.emailTemplate.map(x=>x.id+(x.deleted?':deleted':'')).sort();
  const was=accessCan;accessCan=k=>k!=='masterdata'&&was(k);const denied=mailTplSave('',{name:'X',text:'Y'});accessCan=was;
  mailTplDelete(own.id);DB.emailTemplate=[];touch();
  return {first,own:own.ok,bad:bad.error,after,rows:rows.length,denied:denied.error};
 }),{first:['Order received','Status','Back order','Ready for pickup'],own:true,bad:'Enter a name.',after:['Status update','Back order','Ready for pickup','Delivery tomorrow*'],rows:3,denied:'Master Data access needed.'});
 eq('Шаблоны: поля заказа и клиента; контакт — тот, кто написал; неизвестное поле остаётся в тексте; пустое — пусто; денег нет',await run(()=>{
  const o=salesRecord(mtA),text='{order}|{po}|{due}|{units}|{done}|{contact first name}|{contact phone}|{customer}|{opps}|{hold reason}|{line count}|{status}';
  return {who:mailTplRender(text,o,{from:'john@abcglass.example'}).split('|').slice(1),primary:mailTplRender('{contact name}',o),num:mailTplRender('{order}',o)===o.businessNumber,
   money:MAIL_TPL_FIELDS.flatMap(g=>g.fields.map(f=>f[0])).filter(k=>/price|total|balance|amount|paid|\$/.test(k))};
 }),{who:['4502','Nov 28','3','0','John','416-555-0142','ABC Glass Ltd','{opps}','','2','New'],primary:'Anna Kowal',num:true,money:[]});
 eq('Шаблоны: back order — только строки с остатком и где стекло; готовый заказ — строки Ready, back order пуст; все четыре кучки',await run(()=>{
  const a=salesRecord(mtA),b=salesRecord(mtB),r=(x,o)=>mailTplRender(x,o);
  return {notStarted:r('{back order lines}',a).split('\n'),counts:r('{shipped}/{ready}/{in production}/{not started}/{back order}',a),
   ready:r('{ready lines}',b).split('\n'),readyCounts:r('{shipped}/{ready}/{in production}/{not started}/{back order}/{percent done}',b),
   all:r('{all lines}',b).split('\n').length,shipped:r('{shipped lines}',b)};
 }),{notStarted:['• Line 1 · Kitchen · 37" × 71" · Clear 6mm / 17/32 Black Warm Edge ARG / Clear 6mm — 2 units, not started yet','• Line 2 · Bedroom · 30" × 40" · Clear 6mm / 17/32 Black Warm Edge ARG / Clear 6mm — 1 unit, not started yet'],counts:'0/0/0/3/3',
  ready:['• Line 1 · Kitchen · 37" × 71" · Clear 6mm / 17/32 Black Warm Edge ARG / Clear 6mm — 2 units ready','• Line 2 · Bedroom · 30" × 40" · Clear 6mm / 17/32 Black Warm Edge ARG / Clear 6mm — 1 unit ready'],readyCounts:'0/3/0/0/3/100%',all:2,shipped:''});
 eq('Мост: конверт — список шаблонов и готовый текст на заказе; скрепка — бланки заказа, Invoice до выдачи серый, PDF настоящий; Reply text и Document attached — в журнале',await run(()=>{
  DB.orderEvent=[];
  const list=mb('templates',{orderId:mtA}),reply=mb('reply',{orderId:mtA,templateId:'ET-backorder',from:'john@abcglass.example'}),docs=mb('documents',{orderId:mtA});
  const pdf=mb('document',{orderId:mtA,key:'proforma'}),inv=mb('document',{orderId:mtA,key:'invoice'}),wo=mb('document',{orderId:mtA,key:'workOrder'});
  mb('mailLog',{orderId:mtA,kind:'text',note:'Template: Back order'});mb('mailLog',{orderId:mtA,kind:'doc',note:'Proforma invoice'});
  return {list:list.templates.map(x=>x.name),edit:list.canEdit,starts:reply.text.split('\n')[0],lines:reply.text.includes('Still on back order — 3 units:\n• Line 1'),
   docs:docs.docs.map(d=>d.label+(d.off?' (off: '+d.hint+')':'')),pdf:[pdf.name,atob(pdf.data).slice(0,5)],wo:atob(wo.data).slice(0,5),inv:inv.error,
   log:DB.orderEvent.filter(e=>e.orderId===mtA).map(e=>e.what+' · '+e.note),missing:mb('reply',{orderId:'nope',templateId:'ET-status'}).error};
 }),{list:['Order received','Status','Back order','Ready for pickup'],edit:true,starts:'Hi John,',lines:true,
  docs:['Work order','Order confirmation','Proforma invoice','Invoice (off: after last unit)','Drawings'],pdf:['Proforma_invoice_'+await t.p.evaluate(()=>salesRecord(mtA).businessNumber)+'.pdf','%PDF-'],wo:'%PDF-',inv:'This document is not available for the order.',
  log:['Reply text · Template: Back order','Document attached · Proforma invoice'],missing:'missing'});
 eq('Мост: письма привязанной переписки — в журнал (клиент / наш ящик), одна запись на письмо, повтор ничего не добавляет; в карточке панели — последнее письмо и ответ; Activity log → Emails',await run(()=>{
  DB.orderEvent=[];orderEmailAdd(mtA,{threadId:'18c3f2a9b1d4e5aa',from:'john@abcglass.example',subject:'PO 4502'});
  const msg=[{id:'18c3f2a9b1d4f101',from:'john@abcglass.example',name:'John Miller',at:'2026-11-16T15:56:00.000Z'},{id:'18c3f2a9b1d4f102',from:'sales@infinity.example',name:'Sales',at:'2026-11-16T16:04:00.000Z'},{id:'bad',from:'x',at:'nope'}];
  const a=mb('threadLog',{threadId:'18c3f2a9b1d4e5aa',account:'sales@infinity.example',subject:'PO 4502',messages:msg}),b=mb('threadLog',{threadId:'18c3f2a9b1d4e5aa',account:'sales@infinity.example',subject:'PO 4502',messages:msg});
  const card=mb('lookup',{from:'john@abcglass.example',threadId:'18c3f2a9b1d4e5aa'}).linked[0];
  orderLogOpen(mtA);render();const rows=()=>[...document.querySelectorAll('[data-order-log-row]')].length;const all=rows();
  document.querySelector('[data-order-log-filter="mail"]').click();const mail=[...document.querySelectorAll('[data-order-log-row]')].map(r=>r.textContent.includes('Customer email')||r.textContent.includes('Reply sent')||r.textContent.includes('Email linked'));orderLogClose();
  return {added:[a.added,b.added],log:DB.orderEvent.filter(e=>e.orderId===mtA&&/OEM-/.test(e.id)).map(e=>e.what+' · '+e.by+' · '+e.at),talk:card.talk,more:all>mail.length,mail};
 }),{added:[2,0],log:['Customer email · John Miller · john@abcglass.example · 2026-11-16T15:56:00.000Z','Reply sent · Sales · sales@infinity.example · 2026-11-16T16:04:00.000Z'],
  talk:{customerAt:'2026-11-16T15:56:00.000Z',replyAt:'2026-11-16T16:04:00.000Z'},more:true,mail:[true,true,true]});
 eq('Master Data → Email templates: поле встаёт на место курсора, просмотр — на заказе, Save — свой шаблон; несохранённая правка спрашивает при уходе',await run(async()=>{
  tab='masterdata';mdTab='emails';mtSel='';mtDraft=null;render();
  const pick=document.querySelector('[data-mt-item="ET-status"]');pick.click();
  const ta=document.querySelector('[data-mt-text]');ta.focus();ta.setSelectionRange(0,0);
  document.querySelector('[data-mt-field="po"]').click();await new Promise(r=>setTimeout(r,20));
  const head=document.querySelector('[data-mt-text]').value.slice(0,4),preview=document.querySelector('[data-mt-preview]').textContent.slice(0,20);
  const dirty=mtChanged();mtCancel();
  document.querySelector('[data-mt-new]').click();const n=document.querySelector('[data-mt-name]');n.value='Thanks';n.dispatchEvent(new Event('input',{bubbles:true}));
  const t2=document.querySelector('[data-mt-text]');t2.value='Thanks for order {order}.';t2.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-mt-save]').click();
  const saved=mailTemplates().filter(x=>!x.builtin).map(x=>x.name+': '+x.text);DB.emailTemplate=[];touch();mtSel='';mtDraft=null;tab='sales';render();
  return {head,preview:/^\d{4}Hi \w+,/.test(preview),dirty,saved};
 }),{head:'{po}',preview:true,dirty:true,saved:['Thanks: Thanks for order {order}.']});
 eq('Мост: скрепка — Drawings: все строки заказа одним PDF, по листу на строку; альбомный лист — страница с /Rotate 90',await run(async()=>{
  const docs=mb('documents',{orderId:mtA}).docs.filter(d=>d.key==='drawings').map(d=>d.label+' · '+d.hint);
  const r=await mb('document',{orderId:mtA,key:'drawings'}),pdf=atob(r.data),pages=(pdf.match(/\/Type \/Page /g)||[]).length;
  const k=formUseKey('drawing'),t=JSON.parse(JSON.stringify(drawFormTpl()));t.style=Object.assign({},t.style,{paper:'landscape'});DB.formTemplate=Object.assign({},DB.formTemplate,{[k]:t});
  const land=atob((await mb('document',{orderId:mtA,key:'drawings'})).data);delete DB.formTemplate[k];
  return {docs,name:r.name===('Drawings '+salesRecord(mtA).businessNumber).replace(/[^A-Za-z0-9]+/g,'_')+'.pdf',label:r.label,head:pdf.slice(0,5),pages,rotate:[(pdf.match(/\/Rotate 90/g)||[]).length,(land.match(/\/Rotate 90/g)||[]).length]};
 }),{docs:['Drawings · 2 lines · 1 PDF'],name:true,label:'Drawings · 2 sheets',head:'%PDF-',pages:2,rotate:[0,2]});
 eq('Шаблоны: без ошибок в странице',t.errs,[]);
 await t.c.close();
};
