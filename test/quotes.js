/* Квоты, PR 2: ревизии Q-…-R1, отправка по Email одним письмом, бланк Quote,
   срок цен, Convert из выбранной ревизии. Решения владельца 15 сентября 2026.
   Прогоняется и на src, и на собранном dist. */
module.exports=async function({page,eq,ok}){
 console.log('quotes');
 const t=await page();
 await t.p.evaluate(()=>{
  window.qCustomer=function(extra){const c=normalizeCustomer(Object.assign({legalName:'QA Quote Ltd',code:'QAQUOTE'+(DB.customer.length+1),contacts:[{name:'Jane Buyer',email:'buyer@qaquote.ca',isPrimary:true}]},extra||{}));DB.customer.push(c);return c;};
  window.qNew=function(cust){
   tab='sales';salesOrderNew('quote');salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   [[37,71,2,'L-1'],[30,40,1,'L-2']].forEach(x=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:x[0]*16,height16:x[1]*16,qty:x[2],mark:x[3]});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});});
   salesApplyCustomerDefaults(cust.id);
   return soDraft;
  };
  window.qCleanup=function(){DB.receipt=[];DB.salesOrder=[];DB.customer=DB.customer.filter(c=>!/^QAQUOTE/.test(c.code||''));soEdit=null;soDraft=null;soQuoteCopyOf=null;salesDialog=null;docState=null;tab='sales';salesShow={orders:true,quotes:true};salesStatusFilter='';salesPruneOrphanShapes();};
  window.qDownloads=[];window.qOpened=[];
  docDownload=function(name){qDownloads.push(name);};
  window.open=function(url){qOpened.push(url);return {};};
  window.qShapes=o=>o.lines.map(l=>l.shapeRef.id);
 });

 eq('срок цен квоты: 180 дней по умолчанию, мусор — 180, своё число остаётся',await t.p.evaluate(()=>{
  const keep=DB.company.quoteValidDays;delete DB.company.quoteValidDays;normalizeCompany();const a=DB.company.quoteValidDays;
  DB.company.quoteValidDays='abc';normalizeCompany();const b=DB.company.quoteValidDays;
  companySet('quoteValidDays','90');const c=DB.company.quoteValidDays;
  companySet('quoteValidDays',String(keep||180));
  return [a,b,c];
 }),[180,180,90]);

 eq('+ New revision: копия с номером Q-…-R1 и своими фигурами, первая квота не меняется, в списке одна строка',await t.p.evaluate(()=>{
  qCleanup();const c=qCustomer();qNew(c);salesOrderSave();
  const base=soDraft.id,baseNo=soDraft.businessNumber,baseShapes=qShapes(soDraft);
  salesQuoteNewRevision();
  const r1=soDraft,saved=DB.salesOrder.find(o=>o.id===base);
  const bar=document.querySelectorAll('[data-quote-rev]').length,addBtn=!!document.querySelector('[data-quote-new-rev]');
  const r1Id=r1.id;soEdit=null;soDraft=null;render();const list=document.querySelectorAll('[data-order-row]').length;salesOrderEdit(r1Id);
  return {baseNo,r1:r1.businessNumber,group:r1.quoteGroupId===base,rev:r1.quoteRev,
   ownShapes:qShapes(r1).every((id,i)=>!!id&&id!==baseShapes[i]&&!!salesShapeByRef({id})),baseSame:JSON.stringify(qShapes(saved))===JSON.stringify(baseShapes),bar,addBtn,list};
 }),{baseNo:'Q-10001',r1:'Q-10001-R1',group:true,rev:1,ownShapes:true,baseSame:true,bar:2,addBtn:true,list:1});

 eq('Documents у квоты: только бланк Quote и галочки ревизий; Email — два PDF одним письмом, обе ревизии Sent, Valid until +180 дней',await t.p.evaluate(()=>{
  const r1=soDraft.id,base=soDraft.quoteGroupId;
  docOpen();
  const kinds=[...document.querySelectorAll('.doc-kinds>button')].map(b=>b.textContent.trim()),boxes=document.querySelectorAll('[data-doc-rev]').length;
  docToggleRev(base,true);
  const twoSheets=docCurrentPages().length>=2,model=docBuildModel('quote',DB.salesOrder.find(o=>o.id===r1));
  qDownloads.length=0;qOpened.length=0;docEmail();
  const b=DB.salesOrder.find(o=>o.id===base),r=DB.salesOrder.find(o=>o.id===r1),valid=salesAddDays(new Date().toISOString(),180),url=decodeURIComponent(qOpened[0]||'');
  return {kinds,boxes,twoSheets,title:model.title,validRow:model.meta.some(m=>m.label==='Valid until'),files:qDownloads.slice(),
   subject:url.includes('su=Quote Q-10001, Q-10001-R1'),to:url.includes('to=buyer@qaquote.ca'),sent:[b.status,r.status],dates:[b.validUntil===valid,r.validUntil===valid],
   copyMode:soQuoteCopyOf===r1,status:/marked Sent/.test(docState.status)};
 }),{kinds:['Quote'],boxes:2,twoSheets:true,title:'QUOTE',validRow:true,files:['Quote_Q_10001.pdf','Quote_Q_10001_R1.pdf'],subject:true,to:true,sent:['sent','sent'],dates:[true,true],copyMode:true,status:true});

 eq('отправленная ревизия открывается копией: баннер, свои фигуры; закрыть без правок — без вопроса, новой ревизии нет, копии фигур убраны',await t.p.evaluate(()=>{
  docClose();const r1=DB.salesOrder.find(o=>o.businessNumber==='Q-10001-R1');
  salesOrderEdit(r1.id);
  const copyShapes=qShapes(soDraft),banner=(document.querySelector('.quote-sent-banner')||{}).textContent||'',saveLabel=((document.querySelector('.sales-editor-actions .pri')||{}).textContent||'').trim();
  const copyOwn=copyShapes.every((id,i)=>id!==qShapes(r1)[i]),hasWork=salesDraftHasWork(),count=DB.salesOrder.length;
  let asked=0;const old=window.confirm;window.confirm=()=>{asked++;return true;};salesOrderClose();window.confirm=old;
  return {edit:soEdit,copyOwn,banner:/R1 was emailed .* and stays exactly as sent/.test(banner)&&/saved as R2/.test(banner),saveLabel,hasWork,asked,same:DB.salesOrder.length===count,pruned:copyShapes.every(id=>!DB.shapeDef.some(s=>s.id===id))};
 }),{edit:null,copyOwn:true,banner:true,saveLabel:'Save as R2',hasWork:false,asked:0,same:true,pruned:true});

 eq('правка отправленной ревизии сохраняется новой R2; R1 остаётся как отправлена',await t.p.evaluate(()=>{
  const r1=DB.salesOrder.find(o=>o.businessNumber==='Q-10001-R1'),before=JSON.stringify(r1);
  salesOrderEdit(r1.id);soDraft.lines[0].qty=5;
  const hasWork=salesDraftHasWork();salesOrderSave();
  const r2=soDraft,after=DB.salesOrder.find(o=>o.id===r1.id);
  return {hasWork,number:r2.businessNumber,status:r2.status,valid:r2.validUntil,copy:soQuoteCopyOf,r1Same:JSON.stringify(after)===before,qty:[after.lines[0].qty,r2.lines[0].qty]};
 }),{hasWork:true,number:'Q-10001-R2',status:'open',valid:'',copy:null,r1Same:true,qty:[2,5]});

 eq('Convert при нескольких ревизиях спрашивает, какую; заказ из выбранной R1, квота Won, все ревизии остаются и только для чтения',await t.p.evaluate(()=>{
  const r1=DB.salesOrder.find(o=>o.businessNumber==='Q-10001-R1'),r2=DB.salesOrder.find(o=>o.businessNumber==='Q-10001-R2');
  salesOrderEdit(r2.id);salesConvertQuote();
  const choices=salesDialog.choices.map(c=>c.label),radios=document.querySelectorAll('[data-dialog-choice]').length,preset=salesDialog.choice===r2.id;
  salesDialogPick(r1.id);
  salesDialogChoose(salesDialog.buttons.findIndex(b=>b.label==='Convert to order'));
  const order=soDraft,won=DB.salesOrder.find(o=>o.id===r1.id);
  soEdit=null;soDraft=null;render();
  const rows=[...document.querySelectorAll('[data-order-row]')].map(r=>r.textContent),quoteRow=(document.querySelector(`[data-order-row="${salesQuoteRepresentative(r1).id}"]`)||{}).textContent||'';
  salesOrderEdit(r2.id);
  return {choices,radios,preset,kind:order.kind,from:order.fromQuoteId===r1.id,qty:order.lines[0].qty,won:[won.status,won.wonOrderId===order.id],members:salesQuoteMembers(r1).length,
   rows:rows.length,pill:quoteRow.includes('Won · R1 → '+order.businessNumber),r2Direct:soEdit===r2.id&&!soQuoteCopyOf,ro:salesOrderReadOnly(soDraft)};
 }),{choices:['Q-10001','Q-10001-R1','Q-10001-R2'],radios:3,preset:true,kind:'order',from:true,qty:2,won:['won',true],members:3,rows:2,pill:true,r2Direct:true,ro:true});

 eq('список: одна строка на квоту, фильтры Not sent / Sent / Won; удаление квоты убирает все её ревизии',await t.p.evaluate(()=>{
  const c=DB.customer.find(x=>/^QAQUOTE/.test(x.code));qNew(c);salesOrderSave();const q2=soDraft.id;salesQuoteNewRevision();
  soEdit=null;soDraft=null;salesStatusFilter='';render();
  salesListLoadPrefs().statusExpanded=true;render();
  const chip=k=>{const b=document.querySelector(`[data-status-chip="${k}"]`);return b?b.textContent.replace(/\s+/g,' ').trim():'';};
  const chips=[chip('quote:open'),chip('quote:sent'),chip('quote:won')];
  const n=DB.salesOrder.length,old=window.confirm;let msg='';window.confirm=m=>{msg=m;return true;};salesOrderDelete(q2);window.confirm=old;
  return {chips,deleted:n-DB.salesOrder.length,msg:msg.includes('Delete quote Q-10002 and all 2 revisions')};
 }),{chips:['Not sent 1','Sent 0','Won 1'],deleted:2,msg:true});

 eq('у заказа — бланки заказа, бланка Quote нет',await t.p.evaluate(()=>{
  const o=DB.salesOrder.find(x=>x.kind==='order');salesOrderEdit(o.id);docOpen();
  const kinds=[...document.querySelectorAll('.doc-kinds>button')].map(b=>b.textContent.trim());docClose();soEdit=null;soDraft=null;render();return kinds;
 }),['Work order','Proforma invoice','Order confirmation']);

 eq('ревизии, бланк Quote и список квот — без русского текста',await t.p.evaluate(()=>{
  const c=DB.customer.find(x=>/^QAQUOTE/.test(x.code));qNew(c);salesOrderSave();salesQuoteNewRevision();docOpen();
  let text=document.getElementById('app').innerText;docClose();
  text+=docPageSVG(docLayout(docBuildModel('quote',soDraft))[0]);
  soEdit=null;soDraft=null;render();text+=document.getElementById('app').innerText;
  qCleanup();render();
  return /[А-яЁё]/.test(text);
 }),false);
 eq('квоты не дали ошибок страницы',t.errs,[]);
 await t.c.close();
};
