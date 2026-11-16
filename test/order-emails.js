/* Письма заказа (erp/sales/order-emails; задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md, этап 1):
   ветка Gmail привязана к заказу или квоте — конверт у поля Customer, строка
   писем под шапкой, колонка Email в Sales. Привязка — одна на ветку, пишется
   сразу, без Save; сама система ничего не привязывает. */
module.exports=async function({page,eq}){
 console.log('order emails');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];
  window.oeC=oqCustomer({legalName:'ABC Glass Ltd',contacts:[{name:'John Miller',email:'john@abcglass.example',isPrimary:true}]});
  window.oeLink='https://mail.google.com/mail/u/0/#inbox/FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF';
  window.oeMail=n=>({threadId:'18c3f2a9b1d4e5f'+n,messageId:'18c3f2a9b1d4e60'+n,account:'sales@infinity.example',from:'john@abcglass.example',fromName:'John Miller',subject:'New order — PO 450'+n,at:'2026-11-15T14:42:00.000Z'});
  window.oeRow=()=>[...document.querySelectorAll('[data-order-mail] [data-mail]')].map(r=>({text:r.querySelector('[data-mail-link]').textContent,href:r.querySelector('[data-mail-link]').getAttribute('href'),find:!!r.querySelector('[data-mail-find]'),x:!!r.querySelector('.so-mail-x')}));
  window.oePaste=v=>{const el=document.querySelector('[data-mail-paste]');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mail-add]').click();};
  window.oeLog=id=>DB.orderEvent.filter(e=>e.orderId===id&&/^Email/.test(e.what)).map(e=>e.what+' · '+e.note);
  touch();
 });
 eq('Письма: чистка — без ветки запись не берётся, одна запись на ветку, не больше 20, лишнее обрезается',await run(()=>{
  const many=[];for(let i=0;i<25;i++)many.push({threadId:'thread-number-'+String(i).padStart(3,'0')});
  const c=orderEmailsClean([{threadId:'short'},{subject:'no thread'},null,oeMail(1),Object.assign(oeMail(1),{subject:'Second link of the same thread'}),{threadId:'18c3f2a9b1d4e5f2',account:'NOT AN ADDRESS',from:' John@ABCglass.example ',subject:'x'.repeat(300),at:'yesterday'}]);
  return {n:c.length,same:c[0].subject,account:c[1].account,from:c[1].from,subject:c[1].subject.length,at:c[1].at,cap:orderEmailsClean(many).length,last:orderEmailsClean(many).pop().threadId,none:orderEmailsClean('x').length};
 }),{n:2,same:'Second link of the same thread',account:'',from:'john@abcglass.example',subject:200,at:'',cap:20,last:'thread-number-024',none:0});
 eq('Письма: ссылка на ветку — ящик из записи и ветка; поиск — по отправителю и теме; без ящика — первый ящик браузера',await run(()=>{
  const e=orderEmailClean(oeMail(1)),bare=orderEmailClean({threadId:'FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF'});
  return {url:orderEmailUrl(e),find:orderEmailFindUrl(e),bare:orderEmailUrl(bare),bareFind:orderEmailFindUrl(bare)};
 }),{url:'https://mail.google.com/mail/u/?authuser=sales%40infinity.example#all/18c3f2a9b1d4e5f1',
  find:'https://mail.google.com/mail/u/?authuser=sales%40infinity.example#search/'+encodeURIComponent('from:john@abcglass.example subject:"New order — PO 4501"'),
  bare:'https://mail.google.com/mail/u/0/#all/FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF',bareFind:''});
 eq('Письма: адрес из строки браузера — открытое письмо берётся (Inbox, метка, поиск, authuser); список, настройки, чужой сайт и текст — нет',await run(()=>{
  const id=v=>{const e=orderEmailFromLink(v);return e?e.threadId+(e.account?' @'+e.account:''):null;};
  return [id(oeLink),id('https://mail.google.com/mail/u/1/#label/Orders/18c3f2a9b1d4e5f6'),id('https://mail.google.com/mail/u/0/#search/po+4471/FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF'),
   id('https://mail.google.com/mail/u/0/?authuser=Sales@Infinity.example#all/18c3f2a9b1d4e5f6'),id('https://mail.google.com/mail/u/0/#inbox/18c3f2a9b1d4e5f6?compose=new'),
   id('https://mail.google.com/mail/u/0/#inbox'),id('https://mail.google.com/mail/u/0/#settings/fwdandpopsettings'),id('https://example.com/mail/u/0/#inbox/18c3f2a9b1d4e5f6'),id('http://mail.google.com/mail/u/0/#inbox/18c3f2a9b1d4e5f6'),id('PO 4471'),id('')];
 }),['FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF','18c3f2a9b1d4e5f6','FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF','18c3f2a9b1d4e5f6 @sales@infinity.example','18c3f2a9b1d4e5f6',null,null,null,null,null,null]);
 eq('Письма: у заказа без писем поля emails нет — прежние заказы не меняются; конверт без числа, строка спрятана',await run(()=>{
  const id=oqOrder(oeC);salesDraftDrop();salesOrderEdit(id);
  const r={field:'emails' in salesRecord(id),btn:!!document.querySelector('.so-cust-cell [data-mail-toggle]'),count:!!document.querySelector('[data-mail-count]'),row:!!document.querySelector('[data-order-mail]')};
  salesDraftDrop();return r;
 }),{field:false,btn:true,count:false,row:false});
 eq('Письма: конверт открывает строку и закрывает строку контакта; вставили адрес письма — привязано сразу, без Save, заказ не «изменён»; журнал — Email linked',await run(()=>{
  const id=oqOrder(oeC);salesDraftDrop();salesOrderEdit(id);window.oeA=id;
  document.querySelector('[data-contact-toggle]').click();const contact=!!document.querySelector('[data-order-contact]');
  document.querySelector('[data-mail-toggle]').click();const open={mail:!!document.querySelector('[data-order-mail]'),contact:!!document.querySelector('[data-order-contact]'),pressed:document.querySelector('[data-mail-toggle]').getAttribute('aria-expanded'),joined:document.querySelector('.sales-header-compact').classList.contains('has-contact')};
  oePaste(oeLink);
  const saved=salesRecord(id).emails||[],r={contact,open,rows:oeRow(),count:(document.querySelector('[data-mail-count]')||{}).textContent,saved:saved.map(e=>e.threadId),stamped:saved.every(e=>!!e.addedAt),dirty:salesDraftHasWork(),input:document.querySelector('[data-mail-paste]').value,log:oeLog(id)};
  document.querySelector('[data-contact-toggle]').click();r.swap={mail:!!document.querySelector('[data-order-mail]'),contact:!!document.querySelector('[data-order-contact]')};
  salesDraftDrop();return r;
 }),{contact:true,open:{mail:true,contact:false,pressed:'true',joined:true},rows:[{text:'Gmail link',href:'https://mail.google.com/mail/u/0/#all/FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF',find:false,x:true}],count:'1',
  saved:['FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF'],stamped:true,dirty:false,input:'',log:['Email linked · Gmail link'],swap:{mail:false,contact:true}});
 eq('Письма: не адрес письма — сообщение, ничего не записано; Enter в поле привязывает так же, как кнопка',await run(()=>{
  const id=oeA;salesOrderEdit(id);document.querySelector('[data-mail-toggle]').click();
  oePaste('https://mail.google.com/mail/u/0/#inbox');const err=(document.querySelector('[data-mail-error]')||{}).textContent,after=salesRecord(id).emails.length;
  const el=document.querySelector('[data-mail-paste]');el.value='https://mail.google.com/mail/u/0/#inbox/18c3f2a9b1d4e5f6';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  const r={err,after,enter:salesRecord(id).emails.length,cleared:!document.querySelector('[data-mail-error]')};salesDraftDrop();return r;
 }),{err:'Open the email in Gmail and copy its address.',after:1,enter:2,cleared:true});
 eq('Письма: та же ветка второй раз — одна запись, обновлённая на месте; × снимает сразу; журнал — Email removed',await run(()=>{
  const id=oeA;orderEmailAdd(id,Object.assign(oeMail(1),{threadId:'18c3f2a9b1d4e5f6'}));const again=salesRecord(id).emails.map(e=>e.subject||'-');
  salesOrderEdit(id);document.querySelector('[data-mail-toggle]').click();const rows=oeRow();
  document.querySelector('[data-mail="18c3f2a9b1d4e5f6"] .so-mail-x').click();
  const r={again,rows:rows.map(x=>x.text+(x.find?' +find':'')),left:salesRecord(id).emails.map(e=>e.threadId),screen:oeRow().length,count:document.querySelector('[data-mail-count]').textContent,dirty:salesDraftHasWork(),log:oeLog(id)};
  salesDraftDrop();return r;
 }),{again:['-','New order — PO 4501'],rows:['Gmail link','New order — PO 4501 +find'],left:['FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF'],screen:1,count:'1',dirty:false,log:['Email linked · Gmail link','Email linked · Gmail link','Email removed · New order — PO 4501']});
 eq('Письма: несохранённые правки заказа при привязке остаются, Update проходит без «changed elsewhere»; снять последнее письмо — поле emails исчезает',await run(()=>{
  const id=oeA;salesOrderEdit(id);soDraft.notes='Call before delivery';document.querySelector('[data-mail-toggle]').click();
  oePaste('https://mail.google.com/mail/u/0/#inbox/18c3f2a9b1d4e5f7');
  const kept={notes:soDraft.notes,dirty:salesDraftHasWork(),saved:salesRecord(id).notes,mails:salesRecord(id).emails.length};
  const upd=salesOrderSave(),after={notes:salesRecord(id).notes,mails:salesRecord(id).emails.length};salesDraftDrop();
  orderEmailRemove(id,'18c3f2a9b1d4e5f7');orderEmailRemove(id,'FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF');
  return {kept,upd:upd!==false,after,gone:!('emails' in salesRecord(id)),missing:orderEmailAdd('SO-nowhere',oeMail(1)).ok};
 }),{kept:{notes:'Call before delivery',dirty:true,saved:'',mails:2},upd:true,after:{notes:'Call before delivery',mails:2},gone:true,missing:false});
 eq('Письма: новый, ещё не записанный заказ — письмо в черновике, в базу попадает с Save; журнал — Created и Email linked',await run(()=>{
  tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(oeC.id);soDraft.customerPo='PO-NEW';const first=soDraft.lines[0];Object.assign(first,{width16:30*16,height16:40*16});salesEnsureLineShape(first);
  const g=glassProductByCode('6CLEAR');soDraft.makeups[0].panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;});soDraft.makeups[0].cavities.forEach(c=>{c.priceOverride=3.1;});
  render();document.querySelector('[data-mail-toggle]').click();oePaste(oeLink);
  const before={draft:(soDraft.emails||[]).length,count:document.querySelector('[data-mail-count]').textContent,inBase:DB.salesOrder.some(o=>o.id===soDraft.id)};
  const ok=salesOrderSave(),id=soDraft.id,r={before,ok:ok!==false,saved:(salesRecord(id).emails||[]).map(e=>e.threadId),log:DB.orderEvent.filter(e=>e.orderId===id).map(e=>e.what)};
  salesDraftDrop();return r;
 }),{before:{draft:1,count:'1',inBase:false},ok:true,saved:['FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDeF'],log:['Created','Email linked']});
 eq('Письма: Copy заказа писем не копирует; новая ревизия квоты и Convert переносят письма в заказ',await run(()=>{
  const a=oqOrder(oeC);salesDraftDrop();orderEmailAdd(a,oeMail(3));
  const copy=salesCopyOrderDraft(salesRecord(a)),c={src:salesRecord(a).emails.length,copy:'emails' in copy};
  const q=oqOrder(oeC,{kind:'quote'});salesDraftDrop();orderEmailAdd(q,oeMail(4));
  salesOrderEdit(q);salesQuoteNewRevision();const rev=soDraft.id,revMails=(salesRecord(rev).emails||[]).map(e=>e.subject);salesDraftDrop();
  salesConvertQuoteRecord(rev,'PO-4504');const order=soDraft.id,r={c,revMails,order:{kind:salesRecord(order).kind,mails:(salesRecord(order).emails||[]).map(e=>e.subject),from:salesRecord(order).fromQuoteId===rev}};
  salesDraftDrop();return r;
 }),{c:{src:1,copy:false},revMails:['New order — PO 4504'],order:{kind:'order',mails:['New order — PO 4504'],from:true}});
 eq('Письма: закрытый заказ — шапка не нажимается, письма видны полосой над ней: ссылки и Find in Gmail, без × и без поля',await run(()=>{
  const id=oqOrder(oeC);salesDraftDrop();orderEmailAdd(id,oeMail(5));salesRecord(id).status='cancelled';touch();salesOrderEdit(id);
  const strip=document.querySelector('[data-order-mail-strip]'),r={ro:salesOrderReadOnly(soDraft),strip:!!strip,inert:!!(strip&&strip.closest('[inert]')),link:strip?strip.querySelector('[data-mail-link]').getAttribute('href'):'',find:!!(strip&&strip.querySelector('[data-mail-find]')),x:!!(strip&&strip.querySelector('.so-mail-x')),paste:!!document.querySelector('[data-mail-paste]')};
  salesDraftDrop();
  /* Привязка из Gmail приходит и к закрытому заказу (этап 3): команда его принимает. */
  r.addClosed=orderEmailAdd(id,oeMail(6)).ok&&salesRecord(id).emails.length===2;
  const plain=oqOrder(oeC);salesDraftDrop();salesRecord(plain).status='cancelled';touch();salesOrderEdit(plain);r.none=!document.querySelector('[data-order-mail-strip]');salesDraftDrop();
  return r;
 }),{ro:true,strip:true,inert:false,link:'https://mail.google.com/mail/u/?authuser=sales%40infinity.example#all/18c3f2a9b1d4e5f5',find:true,x:false,paste:false,addClosed:true,none:true});
 eq('Sales: конверт в ячейке PO — ссылка на последнюю ветку, набор колонок прежний; без письма ячейка обычная; колонка Email в Columns — тема ссылкой, встаёт за PO',await run(()=>{
  localStorage.removeItem(SALES_LIST_PREFS_KEY);salesListPrefs=null;
  const a=oqOrder(oeC),b=oqOrder(oeC);salesDraftDrop();orderEmailAdd(a,oeMail(7));orderEmailAdd(a,oeMail(8));window.oeA=a;window.oeB=b;
  tab='sales';render();
  const heads=()=>[...document.querySelectorAll('.sl-table thead th[data-col]')].map(th=>th.dataset.col),row=id=>document.querySelector('[data-order-row="'+id+'"]'),po=id=>row(id).children[heads().indexOf('po')+1];
  const link=row(a).querySelector('[data-mail-open]'),r={column:heads().includes('email'),inPo:link.closest('td')===po(a),po:po(a).textContent.trim(),link:link.getAttribute('href'),tab:link.target+' '+link.rel,title:link.title,plain:po(b).textContent.trim()+(po(b).querySelector('a,svg')?' +icon':''),
   value:[salesListValue(salesListInfo(salesRecord(a)),'email'),salesListValue(salesListInfo(salesRecord(b)),'email')]};
  salesListLoadPrefs().cols.find(c=>c.k==='email').on=true;render();
  const subj=row(a).querySelector('[data-mail-subject]');r.on={after:heads()[heads().indexOf('po')+1],text:subj.textContent,same:subj.getAttribute('href')===r.link,none:!row(b).querySelector('[data-mail-subject]')};
  salesListLoadPrefs().cols.find(c=>c.k==='email').on=false;render();
  return r;
 }),{column:false,inPo:true,po:'PO-QA',link:'https://mail.google.com/mail/u/?authuser=sales%40infinity.example#all/18c3f2a9b1d4e5f8',tab:'_blank noopener',title:'New order — PO 4508',plain:'PO-QA',value:['New order — PO 4508',''],
  on:{after:'email',text:'New order — PO 4508',same:true,none:true}});
 eq('Sales: фильтр Email «Is empty» оставляет заказы без письма; правый клик — Open email только у заказа с письмом, открывает ту же ветку',await run(()=>{
  const p=salesListLoadPrefs();p.filters.email=salesListCleanFilter('email',{conds:[{op:'empty'}]});render();
  const rows=[...document.querySelectorAll('[data-order-row]')].map(r=>r.dataset.orderRow),empty={without:rows.includes(oeB),withMail:rows.includes(oeA),all:rows.every(id=>!(salesRecord(id).emails||[]).length)};delete p.filters.email;render();
  const menu=id=>{salesListMenu={kind:'context',id,x:20,y:20};render();return !!document.querySelector('[data-menu="email"]');};
  const has=menu(oeA),keep=window.open;let opened='';window.open=u=>{opened=u;return null;};
  try{document.querySelector('[data-menu="email"]').click();}finally{window.open=keep;}
  const none=menu(oeB);salesListMenu=null;render();
  return {empty,has,opened,none};
 }),{empty:{without:true,withMail:false,all:true},has:true,opened:'https://mail.google.com/mail/u/?authuser=sales%40infinity.example#all/18c3f2a9b1d4e5f8',none:false});
 eq('order-emails без ошибок страницы',t.errs,[]);
 await t.c.close();
};
