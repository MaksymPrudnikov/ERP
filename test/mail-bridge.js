/* Мост для панели Gmail (erp/mail-bridge; задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md, этап 3,
   раздел «Логика панели»): что показать рядом с открытым письмом — по шагам
   сверху вниз; команды панели. Мост текста письма не получает и сам ничего
   не привязывает. */
module.exports=async function({page,eq}){
 console.log('mail bridge');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  oqReset();DB.orderEvent=[];localStorage.removeItem(SALES_LIST_PREFS_KEY);salesListPrefs=null;
  window.mbC=oqCustomer({legalName:'ABC Glass Ltd',invoiceEmail:'ap@abcglass.example; billing@abcglass.example',contacts:[{name:'Anna Kowal',email:'anna@abcglass.example',isPrimary:true,phone:'416-555-0100'},{name:'John Miller',role:'Purchasing',email:'John@ABCglass.example',phone:'416-555-0142'}]});
  window.mbD=oqCustomer({legalName:'Chen Windows Inc',contacts:[{name:'Mary Chen',email:'mary@chen.example',isPrimary:true},{name:'Shared Desk',email:'shared@both.example'}]});
  window.mbE=oqCustomer({legalName:'Echo Glazing',statementEmail:'shared@both.example',contacts:[{name:'Eve',isPrimary:true}]});
  window.mb=(req,extra)=>mailBridgeHandle(Object.assign({gf:'mail',req},extra));
  window.mbMail=(n,msg)=>({threadId:'18c3f2a9b1d4e5'+n,messageId:'18c3f2a9b1d4f0'+(msg||n),account:'sales@infinity.example',from:'john@abcglass.example',fromName:'John Miller',subject:'Thread '+n,at:'2026-11-15T14:42:00.000Z'});
  window.mbOrder=(c,extra)=>{const id=oqOrder(c,extra);salesDraftDrop();return id;};
  window.mbNo=id=>salesRecord(id).businessNumber;
  touch();
 });
 eq('Мост: hello — версия и состояние; сообщением window ответ приходит с тем же номером; чужое сообщение и неизвестный запрос ответа «готово» не дают',await t.p.evaluate(async()=>{
  const got=[];const on=ev=>{if(ev.data&&ev.data.gf==='mail-reply')got.push(ev.data);};window.addEventListener('message',on);
  window.postMessage({gf:'mail',id:'q1',req:'hello'},'*');window.postMessage({gf:'other',id:'q2',req:'hello'},'*');window.postMessage({gf:'mail',id:'q3',req:'nothing'},'*');
  await new Promise(r=>setTimeout(r,60));window.removeEventListener('message',on);
  const h=mb('hello');
  return {hello:[h.ok,h.version,h.state,typeof h.build],replies:got.map(x=>x.id+':'+(x.res.ok?x.res.state:x.res.error))};
 }).catch(e=>({error:String(e.message).split('\n')[0]})),{hello:[true,2,'ready','string'],replies:['q1:ready','q3:unknown']});
 eq('Мост, шаг 1: клиент — только по точному адресу (контакт, Invoice Email, Statement Email), регистр не важен; нет адреса — клиента нет; адрес у двух клиентов — мост не выбирает',await run(()=>{
  const who=from=>{const r=mb('lookup',{from});return [r.step,r.customer?r.customer.name:null,r.customers];};
  const c=mb('lookup',{from:'john@abcglass.example'}).customer;
  return {contact:who('JOHN@abcglass.example'),invoice:who('billing@abcglass.example'),domain:who('bob@abcglass.example'),two:who('shared@both.example'),none:who(''),junk:who('not an address'),
   card:[c.contact.name,c.contact.role,c.contact.phone,c.terms]};
 }),{contact:[4,'ABC Glass Ltd',1],invoice:[4,'ABC Glass Ltd',1],domain:[5,null,0],two:[5,null,2],none:[5,null,0],junk:[5,null,0],card:['John Miller','Purchasing','416-555-0142','Credit · Net 30']});
 eq('Мост, шаг 4: открытые заказы клиента — не больше трёх, готовое и цех выше, внутри по сроку; known — номера и PO всех открытых; денег в ответе нет',await run(()=>{
  window.mbA=mbOrder(mbC,{customerPo:'4471',dueDate:'2026-12-10'});window.mbB=mbOrder(mbC,{customerPo:'4502',dueDate:'2026-11-28'});oqThrough(mbB,'verified');
  const r=mb('lookup',{from:'john@abcglass.example',threadId:'18c3f2a9b1d4e5zz'}),text=JSON.stringify(r);
  return {step:r.step,rows:r.rows.map(x=>x.po+' '+x.progress.status+' '+x.progress.units.done+'/'+x.progress.units.total+(x.number===mbNo(x.id)?'':' ?')),open:r.openCount,counts:r.counts,known:r.known.map(k=>k.po).sort(),linked:r.linked.length,
   money:['grand','balance','price','subtotal','amount'].filter(k=>text.toLowerCase().includes('"'+k)),other:mb('lookup',{from:'mary@chen.example'}).rows.length};
 }),{step:4,rows:['4502 Verified 0/3','4471 New 0/3'],open:2,counts:[],known:['4471','4502'],linked:0,money:[],other:0});
 eq('Мост, шаг 4: у клиента больше трёх открытых — три строки, счётчик по статусам, known все; черновик и чужие заказы не в счёт',await run(()=>{
  const ids=[mbOrder(mbC,{customerPo:'P-1',dueDate:'2026-12-01'}),mbOrder(mbC,{customerPo:'P-2',dueDate:'2026-11-25'}),mbOrder(mbC,{customerPo:'P-3',dueDate:'2027-01-15'})];mbOrder(mbD,{customerPo:'D-1'});
  const d=mbOrder(mbC,{customerPo:'P-DRAFT'});salesRecord(d).isDraft=true;touch();window.mbMany=ids;
  const r=mb('lookup',{from:'john@abcglass.example'});
  return {rows:r.rows.map(x=>x.po+' '+x.progress.status),open:r.openCount,counts:r.counts.map(c=>c.label+' '+c.count),known:r.known.length,draft:r.known.some(k=>k.po==='P-DRAFT'||k.po==='D-1')};
 }),{rows:['4502 Verified','P-2 New','P-1 New'],open:5,counts:['Verified 1','New 4'],known:5,draft:false});
 eq('Мост, шаг 2: Link записывает привязку сразу; ветка показывает свой заказ, и на этом всё — списка клиента и known нет; заказ, привязанный из открытого письма, первым',await run(()=>{
  const link=mb('linkEmail',{orderId:mbA,email:mbMail('a1')}),again=mb('linkEmail',{orderId:mbB,email:mbMail('a1','b9')});
  const r=mb('lookup',{from:'john@abcglass.example',threadId:mbMail('a1').threadId,messageId:mbMail('a1').messageId}),other=mb('lookup',{from:'john@abcglass.example',threadId:mbMail('a1').threadId,messageId:mbMail('a1','b9').messageId});
  return {link,again,saved:(salesRecord(mbA).emails||[]).length,step:r.step,linked:r.linked.map(x=>x.po+(x.here?' here':'')),second:other.linked.map(x=>x.po+(x.here?' here':'')),rows:r.rows.length,known:r.known.length,
   stranger:mb('lookup',{from:'someone@else.example',threadId:mbMail('a1').threadId}).linked.length,log:DB.orderEvent.filter(e=>e.orderId===mbA&&e.what==='Email linked').length};
 }),{link:{ok:true},again:{ok:true},saved:1,step:2,linked:['4471 here','4502'],second:['4502 here','4471'],rows:0,known:0,stranger:2,log:1});
 eq('Мост, шаг 2: закрытые и давно выданные — отдельно от открытых (Closed · N); выданный меньше 14 дней назад ещё открыт; заказ из архива находится по ветке',await run(()=>{
  const day=n=>new Date(Date.now()-n*864e5).toISOString(),mk=(po,st,ago)=>{const id=mbOrder(mbC,{customerPo:po});mb('linkEmail',{orderId:id,email:mbMail('c1')});const o=salesRecord(id);o.status=st;if(ago!=null)o.statusDates=Object.assign({},o.statusDates,{done:day(ago)});return id;};
  mk('OLD-CANCEL','cancelled');mk('OLD-CLOSED','closed');mk('DONE-30','done',30);mk('DONE-3','done',3);mk('LIVE','new');touch();
  const row=archiveRowOf(salesRecord(mbA),'2026-11-16','2026-11-16T00:00:00.000Z'),plain=archiveRowOf(salesRecord(mbMany[0]),'2026-11-16','2026-11-16T00:00:00.000Z');
  archiveIndex.set('SO-archived-test',{rep:true,kind:'order',number:'70001',mail:[mbMail('c1').threadId],row:{status:'Closed'}});
  let r;try{r=mb('lookup',{from:'john@abcglass.example',threadId:mbMail('c1').threadId});}finally{archiveIndex.delete('SO-archived-test');}
  return {open:r.linked.map(x=>x.po).sort(),closed:r.closed.map(x=>x.po).sort(),n:r.closedCount,archived:r.archived,pointer:row.mail,noMail:'mail' in plain};
 }),{open:['DONE-3','LIVE'],closed:['DONE-30','OLD-CANCEL','OLD-CLOSED'],n:3,archived:[{id:'SO-archived-test',number:'70001',status:'Closed'}],pointer:['18c3f2a9b1d4e5a1'],noMail:false});
 eq('Мост: квота — одна карточка на группу ревизий; после Convert ветка показывает заказ «from Q-…», квота уходит в закрытые как Won → номер заказа',await run(()=>{
  const q=mbOrder(mbD,{kind:'quote'});mb('linkEmail',{orderId:q,email:mbMail('q1')});
  salesOrderEdit(q);salesQuoteNewRevision();const rev=soDraft.id;salesDraftDrop();
  const before=mb('lookup',{from:'mary@chen.example',threadId:mbMail('q1').threadId});
  salesConvertQuoteRecord(rev,'PO-Q1');const order=soDraft.id;salesDraftDrop();
  const after=mb('lookup',{from:'mary@chen.example',threadId:mbMail('q1').threadId});
  return {before:before.linked.map(x=>x.progress.kind+' '+x.progress.status+' '+(x.id===rev)),after:after.linked.map(x=>x.progress.kind+' '+x.po+' from '+(x.fromQuote===mbNo(rev))),won:after.closed.map(x=>x.progress.status+' → '+(x.wonOrder===mbNo(order)))};
 }),{before:['quote Not sent true'],after:['order PO-Q1 from true'],won:['Won → true']});
 eq('Мост: search — по началу номера и по PO, среди заказов и квот, закрытые тоже; меньше двух знаков — пусто; orders — карточки по списку',await run(()=>{
  const no=mbNo(mbA),s=q=>mb('search',{q}).rows.map(x=>x.po);
  return {byNo:mb('search',{q:no}).rows[0].id===mbA,byPo:s('447'),closed:s('old-').sort(),one:s('4'),none:s('zzzz'),customer:mb('search',{q:'4471'}).rows[0].customer,
   orders:mb('orders',{ids:[mbB,'SO-nowhere',mbA]}).orders.map(x=>x.po),cap:mb('orders',{ids:'x'}).orders.length};
 }),{byNo:true,byPo:['4471'],closed:['OLD-CANCEL','OLD-CLOSED'],one:[],none:[],customer:'ABC Glass Ltd',orders:['4502','4471'],cap:0});
 eq('Мост: Create order и Create quote открывают новый черновик в Sales — клиент и письмо уже в нём, в базе ничего нет до Save; без клиента — пустой Customer',await run(()=>{
  tab='dashboard';render();const before=DB.salesOrder.length;
  const a=mb('newOrder',{kind:'order',customerId:mbC.id,email:mbMail('n1')}),order={tab,isNew:soEdit==='new',kind:soDraft.kind,customer:soDraft.customerId===mbC.id,po:soDraft.customerPo,mails:(soDraft.emails||[]).map(e=>e.subject),count:(document.querySelector('[data-mail-count]')||{}).textContent};
  salesDraftDrop();
  const b=mb('newOrder',{kind:'quote',email:mbMail('n2')}),quote={kind:soDraft.kind,customer:soDraft.customerId,mails:(soDraft.emails||[]).length};salesDraftDrop();
  return {a,b,order,quote,base:DB.salesOrder.length-before};
 }),{a:{ok:true},b:{ok:true},order:{tab:'sales',isNew:true,kind:'order',customer:true,po:'',mails:['Thread n1'],count:'1'},quote:{kind:'quote',customer:'',mails:1},base:0});
 eq('Мост: Open in ERP открывает заказ; «+N more» ставит в Sales фильтр по клиенту и снимает срок Created; нет заказа или клиента — missing; привязка без ветки и к неизвестному заказу — отказ с текстом',await run(()=>{
  tab='dashboard';render();const open=mb('openOrder',{orderId:mbB}),opened={tab,id:soEdit===mbB};salesDraftDrop();
  const cust=mb('openCustomer',{customerId:mbC.id}),p=salesListLoadPrefs(),names=[...document.querySelectorAll('[data-order-row]')].map(r=>salesCustomerDisplay(salesRecord(r.dataset.orderRow).customerId));
  const r={open,opened,cust,filter:p.filters.customer.conds[0].v,created:'created' in p.filters,only:names.length>0&&names.every(n=>n==='ABC Glass Ltd'),
   missing:[mb('openOrder',{orderId:'SO-nowhere'}).error,mb('openCustomer',{customerId:'CUS-nowhere'}).error],badLink:mb('linkEmail',{orderId:mbA,email:{subject:'no thread'}}).error,noOrder:mb('linkEmail',{orderId:'SO-nowhere',email:mbMail('z1')}).error};
  delete p.filters.customer;salesListSavePrefs();render();return r;
 }),{open:{ok:true},opened:{tab:'sales',id:true},cust:{ok:true},filter:'ABC Glass Ltd',created:false,only:true,missing:['missing','missing'],badLink:'This is not a link to a Gmail email.',noOrder:'The order was not found.'});
 eq('Мост, шаг 0: вход включён, а человека нет — signin на любой запрос; вошёл без галочки Sales — access; hello говорит состояние',await run(()=>{
  const keepUser=window.signinUser,flag=window.GF_NO_SIGNIN,users=DB.user;
  try{
   window.GF_NO_SIGNIN=false;DB.user=[{viewProfileId:'U-test',name:'Admin',access:['users'],password:{algo:'x',salt:'x',hash:'x'}}];
   window.signinUser=()=>null;const out={on:signinOn(),nobody:[mb('lookup',{from:'john@abcglass.example'}).error,mb('newOrder',{kind:'order'}).error,mb('hello').state]};
   window.signinUser=()=>({viewProfileId:'U-fin',name:'Fin',access:['finance']});out.noSales=[mb('lookup',{from:'john@abcglass.example'}).error,mb('linkEmail',{orderId:mbA,email:mbMail('g1')}).error,mb('hello').state];
   window.signinUser=()=>({viewProfileId:'U-sales',name:'Sales',access:['sales']});out.sales=mb('lookup',{from:'john@abcglass.example'}).step;
   out.untouched=!(salesRecord(mbA).emails||[]).some(e=>e.threadId===mbMail('g1').threadId);return out;
  }finally{window.signinUser=keepUser;window.GF_NO_SIGNIN=flag;DB.user=users;}
 }),{on:true,nobody:['signin','signin','signin'],noSales:['access','access','access'],sales:4,untouched:true});
 eq('mail-bridge без ошибок страницы',t.errs,[]);
 await t.c.close();
};
