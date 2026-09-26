/* Бланки заказа: реквизиты компании, условия оплаты, модель бланка, раскладка
   на листы, PDF, окно Preview с панелью ✎, печать и письмо. Решения владельца
   14 сентября 2026. Прогоняется и на src, и на собранном dist. */
module.exports=async function({page,eq,ok}){
 console.log('documents');
 const t=await page();
 await t.p.evaluate(()=>{
  /* Заказ с известными ценами: стекло и камера — ручная цена, сервисы строки —
     своя ставка, чтобы проверки не зависели от прайса справочника. */
  window.docFixture=function(opts){
   opts=opts||{};
   tab='sales';salesOrderNew();salesSetUnitType(opts.unitType||'double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   (opts.lines||[[37,71,3,'W-1']]).forEach(x=>{
    const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});
    soDraft.lines.push(l);salesEnsureLineShape(l);
    salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   });
   soDraft.businessNumber='T-100';soDraft.customerPo='PO-1';soDraft.dueDate='2026-09-28';soDraft.notes='Rear entrance';
   return {m,l:soDraft.lines[0]};
  };
  window.docCents=s=>Math.round(parseFloat(String(s).replace(/[$,]/g,''))*100);
 });

 eq('реквизиты компании: пустое название и мусор приводятся в порядок, картинка не-JPEG не хранится',await t.p.evaluate(()=>{
  const keep=JSON.parse(JSON.stringify(DB.company));
  DB.company={legalName:'  ',depositPercent:'abc',logo:'data:image/png;base64,AAAA',termsText:' Terms ',province:['x']};normalizeCompany();
  const r={name:DB.company.legalName,deposit:DB.company.depositPercent,logo:DB.company.logo,terms:DB.company.termsText,province:DB.company.province,footer:DB.company.footerText};
  DB.company={legalName:'QA Only Name'};normalizeCompany();r.onlyProvince=docCompanyBlock().lines;
  DB.company=keep;return r;
 }),{name:'Infinity Glass Group Inc',deposit:50,logo:'',terms:'Terms',province:'x',footer:'Thank you for your business',onlyProvince:[]});

 eq('условия оплаты: «45 Days Net» — кредит 45 дней, пусто — cash с депозитом компании, процент клиента важнее',await t.p.evaluate(()=>{
  const net=paymentTermsFrom({paymentTerms:'45 Days Net'}),empty=paymentTermsFrom({}),own=paymentTermsFrom({paymentMode:'cash',depositPercent:'30'});
  const before=paymentTermsLabel(empty);DB.company.depositPercent=40;const after=paymentTermsLabel(empty);DB.company.depositPercent=50;
  return {net,empty,labels:[paymentTermsLabel(net),before,after,paymentTermsLabel(own)],deposit:[paymentDepositPercent(net),paymentDepositPercent(own)]};
 }),{net:{paymentMode:'credit',depositPercent:null,creditDays:45},empty:{paymentMode:'cash',depositPercent:null,creditDays:null},labels:['Net 45 days','Cash · 50% deposit','Cash · 40% deposit','Cash · 30% deposit'],deposit:[0,30]});

 eq('Cash/Credit хранится только у клиента и проходит CSV клиентов; Export/Import JSON несёт реквизиты и наборы полей',await t.p.evaluate(()=>{
  const c=normalizeCustomer({legalName:'QA Credit',paymentMode:'credit',creditDays:'30'});
  const orderHasTerms='paymentMode' in normalizeSalesOrder({paymentMode:'credit',creditDays:'15'});
  DB.customer.push(c);
  const rows=customerCsvRows(),h=rows[0],row=rows.find(r=>r[2]==='QA Credit');
  const csv=['Payment Mode','Deposit %','Credit Days'].map(k=>row[h.indexOf(k)]);
  const src=JSON.parse(JSON.stringify(DB));src.company.hstNumber='123 RT0001';src.documentSettings={proforma:{priceMode:'glass',signature:true,bogus:1},nonsense:{a:1}};
  const next=prepareImportedState(src);
  DB.customer=DB.customer.filter(x=>x.id!==c.id);
  return {customer:[c.paymentMode,c.creditDays],orderHasTerms,csv,hst:next.company.hstNumber,kinds:Object.keys(next.documentSettings),proforma:[next.documentSettings.proforma.priceMode,next.documentSettings.proforma.signature,'bogus' in next.documentSettings.proforma]};
 }),{customer:['credit',30],orderHasTerms:false,csv:['credit','',30],hst:'123 RT0001',kinds:['proforma'],proforma:['glass',true,false]});

 eq('Full breakdown: строки под позицией складываются ровно в Unit price, итог строки — цена × Qty, как в заказе',await t.p.evaluate(()=>{
  const {l}=docFixture(),p=salesLineCommercialPrice(l,soDraft),it=docBuildModel('proforma',soDraft).items[0];
  const sum=it.groups.flatMap(g=>g.rows).reduce((s,r)=>s+docCents(r.amount),0);
  return {complete:p.complete,groups:it.groups.map(g=>g.label),sumIsUnit:sum===Math.round(p.unit*100),amount:it.amount===docMoney(p.line),unitRow:it.unitRow.map(u=>u.label),lineIsUnitTimesQty:Math.round(p.line*100)===Math.round(p.unit*100)*3};
 }),{complete:true,groups:['Materials · per unit','Processing · per unit'],sumIsUnit:true,amount:true,unitRow:['Unit price','×','Line total'],lineIsUnitTimesQty:true});

 eq('Glass price only и Totals by group: цена строки без сервисов, группы складываются ровно в Subtotal',await t.p.evaluate(()=>{
  docFixture({lines:[[37,71,3,'W-1'],[100,110,1,'BIG']]});
  DB.stockItem.push({id:'STK-QA-DOC',type:'stock',name:'QA Doc Door',code:'',thicknessMm:0,salePrice:80,availability:'stock',supplier:'',leadTimeDays:0,subcategory:'door',sellsAsOwnLine:true,active:true});
  salesExtraItemAdd('stockItem','STK-QA-DOC');
  const doc=docBuildModel('proforma',soDraft,{priceMode:'glass'}),tot=salesOrderCommercialTotals(soDraft),big=salesLineCommercialPrice(soDraft.lines[1],soDraft);
  const at=doc.end.rows.findIndex(r=>r.label==='Subtotal'),groups=doc.end.rows.slice(0,at);
  const r={labels:groups.map(x=>x.label),groupsAreSubtotal:groups.reduce((s,x)=>s+docCents(x.value),0)===Math.round(tot.subtotal*100),subtotal:doc.end.rows[at].value===docMoney(tot.subtotal),
   glassAmount:doc.items[1].amount===docMoney(big.materials),note:/priced separately in totals/.test(doc.items[1].note),surcharge:big.adjustments.length>0,door:doc.extra.rows[0].amount};
  DB.stockItem=DB.stockItem.filter(s=>s.id!=='STK-QA-DOC');return r;
 }),{labels:['Glass & IGU','Services and processing','Surcharges','Additional items'],groupsAreSubtotal:true,subtotal:true,glassAmount:true,note:true,surcharge:true,door:'$80.00'});

 eq('низ Proforma: cash — депозит от Total и остаток, credit — срок без депозита; Order confirmation — «before production» и подпись',await t.p.evaluate(()=>{
  docFixture();const tot=salesOrderCommercialTotals(soDraft),dep=salesMoney(tot.grand*.5);
  const cust=normalizeCustomer({id:'CUS-QA-DEP',legalName:'QA Deposit Ltd'});DB.customer.push(cust);soDraft.customerId=cust.id;
  const cash=docBuildModel('proforma',soDraft).end.deposit.map(d=>d.label+'='+d.value),oc=docBuildModel('confirmation',soDraft);
  cust.paymentMode='credit';cust.creditDays=30;
  const credit=docBuildModel('proforma',soDraft).end.deposit.map(d=>d.label);DB.customer=DB.customer.filter(c=>c.id!==cust.id);
  /* Подпись в рамке депозита печатается целиком, без «…» — длинная мельчает. */
  const ocPrinted=docLayout(oc).some(p=>p.items.some(x=>x.t==='text'&&x.s==='Deposit before production · 50%'));
  return {cash:cash[0]==='Deposit due now · 50%='+docMoney(dep)&&cash[1]==='Balance on completion='+docMoney(salesMoney(tot.grand-dep)),oc:oc.end.deposit[0].label,ocPrinted,signature:/signed and the deposit is received/.test(oc.signature),credit};
 }),{cash:true,oc:'Deposit before production · 50%',ocPrinted:true,signature:true,credit:['Payment terms · Net 30 days','Due within 30 days of invoice · no deposit']});

 eq('цены нет — бланк пишет Rate required и прочерк в итоге, а не выдуманную сумму',await t.p.evaluate(()=>{
  const {m}=docFixture();m.panes[0].priceOverride=null;m.panes[0].glassProductId=(DB.glassProduct.find(g=>g.salePriceAnnealed==null&&g.salePriceTempered==null)||{}).id;
  const doc=docBuildModel('proforma',soDraft),it=doc.items[0];
  return {required:it.groups.flatMap(g=>g.rows).some(r=>r.amount==='Rate required'),warn:it.sub.some(s=>s.tone==='warn'&&/Pricing incomplete/.test(s.text)),amount:it.amount,grand:doc.end.grand.value,missing:doc.end.missing};
 }),{required:true,warn:true,amount:'—',grand:'—',missing:'1 item needs pricing'});

 eq('Work order: ни одного доллара, маршрут по станциям с размером реза, вес и итоги заказа',await t.p.evaluate(()=>{
  docFixture();const doc=docBuildModel('workOrder',soDraft),it=doc.items[0];
  const text=docLayout(doc).flatMap(p=>p.items.filter(x=>x.t==='text').map(x=>x.s)).join(' ');
  return {dollars:/\$/.test(text),codes:it.lites[0].chips.map(c=>c.code),cut:/37/.test(it.lites[0].chips[0].text),info:/kg\/unit/.test(it.info),summary:doc.summary.map(s=>s.label),cavities:it.cavities.length};
 }),{dollars:false,codes:['CUT','EDGE','HEAT','IGU'],cut:true,info:true,summary:['Glass units','Total area','Total weight','Due date'],cavities:1});

 eq('Shape drawing: у прямоугольника чертежа нет — размер уже сказан в строке',await t.p.evaluate(()=>{docFixture();return docBuildModel('proforma',soDraft,{shapeDrawing:true}).items[0].drawing;}),null);

 eq('раскладка: длинный заказ делится на листы Letter, у каждого «Page N of M», текст не выходит за поля',await t.p.evaluate(()=>{
  docFixture({lines:Array.from({length:24},(_,i)=>[20+i,30+i,1,'M'+(i+1)])});
  const pages=docLayout(docBuildModel('proforma',soDraft));
  let outside=0;
  pages.forEach(p=>p.items.forEach(x=>{if(x.t!=='text')return;const w=docTextWidth(x.s,x.size,x.bold,x.ls),left=x.align==='right'?x.x-w:x.align==='center'?x.x-w/2:x.x;if(left<35.5||left+w>576.5||x.y<0||x.y>792)outside++;}));
  return {many:pages.length>2,labels:pages.every((p,i)=>{const l=p.items.filter(x=>x.pageLabel);return l.length===1&&l[0].s==='Page '+(i+1)+' of '+pages.length;}),outside};
 }),{many:true,labels:true,outside:0});

 eq('PDF: заголовок, число страниц и таблица xref сходятся байт в байт',await t.p.evaluate(()=>{
  docFixture({lines:Array.from({length:18},(_,i)=>[20+i,30+i,1,'M'+(i+1)])});
  const pages=docLayout(docBuildModel('proforma',soDraft)),b=docPdfBytes(pages,{title:'QA',date:'20260914120000'});
  let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
  const xref=+s.match(/startxref\n(\d+)\n%%EOF\n$/)[1],table=s.slice(xref).split('\n'),count=+table[1].split(' ')[1];
  const offsets=table.slice(3,3+count-1).map(x=>+x.slice(0,10));
  return {head:s.slice(0,8),pages:(s.match(/\/Type \/Page /g)||[]).length===pages.length,objects:offsets.length===count-1&&offsets.every((o,i)=>s.startsWith((i+1)+' 0 obj',o)),title:s.includes('(PROFORMA INVOICE) Tj')};
 }),{head:'%PDF-1.4',pages:true,objects:true,title:true});

 eq('Preview открывается чистым: панель полей только по ✎ Customize; Save as default запоминает набор',await t.p.evaluate(()=>{
  docFixture();render();docOpen('proforma');
  const sheets=document.querySelectorAll('.doc-sheet').length===docCurrentPages().length,panelAtOpen=!!document.querySelector('.doc-panel');
  docTogglePanel();const panelAfterPen=!!document.querySelector('.doc-panel');
  const box=document.querySelector('[data-doc-field="makeupFull"]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));
  const fullShown=document.querySelector('.doc-sheet svg').textContent.includes('Lite 1: ');
  docSaveDefault();docClose();docOpen('proforma');
  const r={sheets,panelAtOpen,panelAfterPen,fullShown,saved:DB.documentSettings.proforma.makeupFull,reopened:docState.opts.makeupFull,panelAfterReopen:docState.panel};
  docClose();DB.documentSettings={};return r;
 }),{sheets:true,panelAtOpen:false,panelAfterPen:true,fullShown:true,saved:true,reopened:true,panelAfterReopen:false});

 await t.p.evaluate(()=>{docFixture();render();docOpen('proforma');window.docPrintCount=docPrintPrepare();});
 await t.p.emulateMedia({media:'print'});
 eq('печать: на бумагу уходят только листы бланка — по листу Letter на страницу',await t.p.evaluate(()=>{
  const host=document.getElementById('docPrintHost'),sheets=host.querySelectorAll('.doc-print-page');
  return {sheets:sheets.length===window.docPrintCount,appHidden:[...document.body.children].filter(x=>x!==host).every(x=>getComputedStyle(x).display==='none'),host:getComputedStyle(host).display,width:getComputedStyle(sheets[0]).width};
 }),{sheets:true,appHidden:true,host:'block',width:'816px'});
 await t.p.emulateMedia({media:'screen'});
 await t.p.evaluate(()=>{docPrintCleanup();docClose();});

 eq('Email: PDF уходит в Загрузки, Gmail открывается с адресом клиента, темой и депозитом',await t.p.evaluate(()=>{
  docFixture();
  DB.customer.push(normalizeCustomer({id:'CUS-QA-MAIL',legalName:'QA Mail Ltd',invoiceEmail:'ap@qa-mail.ca',contacts:[{name:'Anna Lee',email:'anna@qa-mail.ca',isPrimary:true}]}));
  salesApplyCustomerDefaults('CUS-QA-MAIL');render();docOpen('proforma');
  const oldOpen=window.open,oldDownload=docDownload;let url='',file=null;
  window.open=u=>{url=u;return {};};docDownload=(n,b)=>{file={n,head:String.fromCharCode.apply(null,Array.from(b.slice(0,8)))};};
  try{docEmail();}finally{window.open=oldOpen;docDownload=oldDownload;}
  const u=new URL(url),q=u.searchParams,status=docState.status;
  docClose();DB.customer=DB.customer.filter(c=>c.id!=='CUS-QA-MAIL');
  return {host:u.host,to:q.get('to'),subject:q.get('su'),hello:q.get('body').startsWith('Hello Anna,'),deposit:/Deposit due now \(50%\)/.test(q.get('body')),file,status:/Downloads/.test(status)};
 }),{host:'mail.google.com',to:'ap@qa-mail.ca',subject:'Proforma invoice T-100 · PO PO-1 · Infinity Glass Group Inc',hello:true,deposit:true,file:{n:'Proforma_invoice_T_100.pdf',head:'%PDF-1.4'},status:true});

 eq('Master Data → Company: поле сохраняется, логотип PNG становится JPEG и встаёт в шапку бланка и в PDF',await t.p.evaluate(async()=>{
  tab='masterdata';mdSetTab('company');render();
  const input=document.querySelector('[data-company="phone"]');input.value='(905) 555-0100';input.dispatchEvent(new Event('change',{bubbles:true}));
  const cv=document.createElement('canvas');cv.width=300;cv.height=100;const g=cv.getContext('2d');g.fillStyle='#16325c';g.fillRect(0,0,150,100);
  const img=new Image();await new Promise(r=>{img.onload=r;img.src=cv.toDataURL('image/png');});
  DB.company.logo=companyLogoJpeg(img);normalizeCompany();
  const info=docJpegInfo(DB.company.logo);docFixture();
  const pg=docLayout(docBuildModel('proforma',soDraft))[0],logo=pg.items.find(x=>x.t==='img'),pdf=docPdfBytes([pg]);
  let s='';for(let i=0;i<pdf.length;i++)s+=String.fromCharCode(pdf[i]);
  const r={phone:DB.company.phone,jpeg:DB.company.logo.startsWith('data:image/jpeg;base64,'),size:info&&[info.w,info.h],ratio:!!logo&&Math.round(logo.w/logo.h),pdfImage:s.includes('/Subtype /Image /Width 300 /Height 100')&&s.includes('/Im1 Do')};
  DB.company.logo='';DB.company.phone='';return r;
 }),{phone:'(905) 555-0100',jpeg:true,size:[300,100],ratio:3,pdfImage:true});

 eq('шапка заказа без Terms: условия оплаты живут в карточке клиента, бланк берёт их оттуда',await t.p.evaluate(()=>{
  DB.customer.push(normalizeCustomer({id:'CUS-QA-NET',legalName:'QA Net Ltd',paymentMode:'credit',creditDays:30}));
  docFixture();salesApplyCustomerDefaults('CUS-QA-NET');render();
  const labels=[...document.querySelectorAll('.sales-header-compact label')].map(l=>l.textContent.trim()),terms=docBuildModel('proforma',soDraft).meta.find(x=>x.label==='Terms');
  DB.customer=DB.customer.filter(c=>c.id!=='CUS-QA-NET');
  return {termsField:labels.includes('Terms'),control:!!document.querySelector('.sales-terms'),orderKeys:['paymentMode','creditDays','depositPercent'].some(k=>k in soDraft),docTerms:terms&&terms.value};
 }),{termsField:false,control:false,orderKeys:false,docTerms:'Net 30 days'});

 eq('карточка клиента: Payment — выбор Cash/Credit, у Credit поле дней, в списке понятная подпись',await t.p.evaluate(()=>{
  DB.customer.push(normalizeCustomer({id:'CUS-QA-CARD',code:'QACARD',legalName:'QA Card Ltd',paymentTerms:'45 Days Net'}));
  tab='customers';cEdit=null;render();
  const row=[...document.querySelectorAll('tbody tr')].find(tr=>tr.textContent.includes('QA Card Ltd')),listLabel=!!row&&row.textContent.includes('Net 45 days');
  customerEdit('CUS-QA-CARD');cTab='credit';render();
  const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='credit'&&/Credit/.test(o.textContent)));
  const days=[...document.querySelectorAll('label')].some(l=>l.textContent.trim()==='Credit Days');
  cEdit=null;cDraft=null;DB.customer=DB.customer.filter(c=>c.id!=='CUS-QA-CARD');render();
  return {listLabel,select:sel?sel.value:null,days};
 }),{listLabel:true,select:'credit',days:true});

 /* Владелец, 26.09.2026: чертежи всех строк — мокапами, печать всех сразу или
    по выбору; строка в батче тоже; DXF получает свой лист (контур и габарит). */
 eq('Drawings: мокапы всех строк, строка в батче и DXF со своим листом, печать отмеченных по одному на страницу',await t.p.evaluate(()=>{
  docFixture({lines:[[37,71,1,'W-1'],[30,40,1,'W-2'],[20,20,1,'W-3']]});
  const add=(l,setup)=>{const s=newShapeDef('custom');setup(s);const def=normalizeShapeDef(s);def.ownerLineId=l.id;DB.shapeDef.push(def);l.shapeRef=salesShapeRefFrom(def);salesSyncLineFromShape(l,def);};
  add(soDraft.lines[1],s=>{s.type='circle';s.w='30';s.h='30';});
  add(soDraft.lines[2],s=>{s.w='20';s.h='20';s.source={kind:'dxf',fileName:'part.dxf',fileSize:4000,uploadedAt:'2026-09-26',preview:{units:'in',points:[[0,0],[20,0],[20,12],[10,20],[0,12]],width16:320,height16:320}};});
  soDraft.lines[0].batchedAt='2026-09-26T10:00:00Z';
  const before={draft:sDraft,bridge:salesBridge};
  render();docOpen('drawings');
  const cards=[...document.querySelectorAll('[data-doc-drawing]')],dxf=cards[2];
  const r={cards:cards.length,checked:cards.filter(c=>c.querySelector('input').checked).length,
   sheets:cards.filter(c=>c.querySelector('.print-shape-sheet')).length,
   dxf:!!dxf&&!!dxf.querySelector('.shape-dxf-svg')&&!dxf.querySelector('.shape-dxf-svg[onclick]')&&dxf.textContent.includes('Finished 20″ × 20″'),
   bar:[...document.querySelectorAll('.doc-bar button')].map(b=>b.textContent).filter(x=>/Email|Customize|All|None|Print/.test(x)),
   count:document.querySelector('[data-doc-drawing-count]').textContent};
  docDrawingToggle(soDraft.lines[1].id,false);
  r.after=document.querySelector('[data-doc-drawing-count]').textContent;
  const oldPrint=window.print;let printed=0;window.print=()=>{printed++;};
  docPrint();window.print=oldPrint;
  const host=document.getElementById('printSheetHost'),ids=[...host.querySelectorAll('[id]')].map(x=>x.id);
  r.print={calls:printed,pages:host.querySelectorAll('.print-sheet').length,sheets:host.querySelectorAll('.print-shape-sheet').length,uniqueIds:new Set(ids).size===ids.length};
  printSheetCleanup();docDrawingAll(false);docPrint();r.none=docState.status;
  r.kept=sDraft===before.draft&&salesBridge===before.bridge;
  docClose();soDraft.lines[0].batchedAt='';return r;
 }),{cards:3,checked:3,sheets:3,dxf:true,bar:['All','None','Print'],count:'3 of 3',after:'2 of 3',print:{calls:1,pages:2,sheets:2,uniqueIds:true},none:'Tick at least one drawing.',kept:true});

 eq('окно бланков с панелью и вкладка Company — без русского текста',await t.p.evaluate(()=>{
  docFixture();render();docOpen('workOrder');docTogglePanel();let a=document.querySelector('.doc-window').innerText;docSetKind('drawings');a+=document.querySelector('.doc-window').innerText;docClose();
  tab='masterdata';mdSetTab('company');render();const b=document.querySelector('.doc-company').innerText;
  return /[А-яЁё]/.test(a+b);
 }),false);
 eq('бланки не дали ошибок страницы',t.errs,[]);
 await t.c.close();
};
