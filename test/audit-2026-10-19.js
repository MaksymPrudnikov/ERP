/* Проверка аудита Codex 18–19.10.2026 (Claude), мелочи экрана: F12 — без
   своих разделов пустой Overview; F04 — номер PS прокручивает к карточке, а
   поле сканера берёт курсор без прокрутки; F06 — без Shipping номер PS в
   заказе — текст; F05 — 0 блоков не просит Enter sheets; F03 — строка To
   batch на Overview считает всё стекло, которое ждёт батча (владелец 20.10:
   «оно очень нужно»). */
module.exports=async function({page,eq}){
 console.log('audit 2026-10-19');const t=await page(undefined,{width:1440,height:900});
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.a19Ship=function(){
   oqReset();const id=oqOrder(oqCustomer({legalName:'Lakeview Windows Inc'}),{delivery:'delivery'});salesDraftDrop();oqThrough(id,'ready');
   const s=shippingCreate({customerId:salesRecord(id).customerId,method:'pickup',shipTo:{},date:finToday(),items:shippingAvailable(salesRecord(id)).slice(0,1).map(shippingItem),extras:[]}).value;
   return {id,ps:s.id,number:s.number};
  };
  window.a19Deny=function(no,fn){const keep=window.accessCan;window.accessCan=k=>!no.includes(k);try{return fn();}finally{window.accessCan=keep;}};
 });

 eq('F12: ни одного своего раздела — пустой Overview, а не прежний экран Users',await t.p.evaluate(()=>{
  tab='users';subtab=null;render();
  return a19Deny(USER_SECTIONS,()=>{render();return {tab,users:!!document.querySelector('[data-user-row]'),empty:document.getElementById('app').textContent.includes('Nothing to show here.')};});
 }),{tab:'dashboard',users:false,empty:true});

 const ship=await t.p.evaluate(()=>{const r=a19Ship();tab='shipping';shippingTab='shipments';shippingOpenId='';render();scrollTo(0,0);return r;});
 await t.p.setViewportSize({width:1440,height:420});
 await t.p.locator('.shipping-list-card button.sm',{hasText:ship.number}).click();await t.p.waitForTimeout(50);
 eq('F04: номер PS в Shipments прокручивает к карточке; курсор в поле сканера, страница не уходит наверх',await t.p.evaluate(()=>{
  const card=document.querySelector('.shipping-detail').getBoundingClientRect();
  return {open:!!document.querySelector('.shipping-detail'),scrolled:scrollY>0,inView:card.top>=0&&card.top<innerHeight,scanner:document.activeElement&&document.activeElement.id};
 }),{open:true,scrolled:true,inView:true,scanner:'shippingSigned'});
 await t.p.setViewportSize({width:1440,height:900});

 eq('F06: в заказе номер PS — кнопка с Shipping и просто текст без него',await t.p.evaluate(id=>{
  tab='sales';salesOrderEdit(id);render();const strip=()=>({buttons:document.querySelectorAll('.shipping-order-strip button').length,text:document.querySelectorAll('.shipping-order-strip [data-order-ps]').length});
  const with_=strip(),without=a19Deny(['shipping'],()=>{render();return strip();});salesDraftDrop(true);tab='dashboard';render();return {with:with_,without};
 },ship.id),{with:{buttons:1,text:0},without:{buttons:0,text:1}});

 eq('F05: блок с 0 листов не просит Enter sheets — ни склад, ни форма приёмки; блок с листами — просит, пока Sheets пусто',await t.p.evaluate(()=>{
  const code=glassProductByCode('6CLEAR'),line=(qty,i)=>({id:'L'+i,kind:'glass',productId:code.id,productCode:'6CLEAR',unit:'block',qty,actualSheets:null,widthIn:144,heightIn:96});
  DB.purchaseReceipt=[{id:'R-A19',number:'RC-A19',date:'2026-10-19',createdAt:'2026-10-19T10:00:00Z',lines:[line(0,0),line(2,1)]}];
  const stock=invReceiptLines().filter(x=>x.r.id==='R-A19').map(x=>x.issue);
  const form=[{qty:'0',actualSheets:''},{qty:'2',actualSheets:''},{qty:'2',actualSheets:'32'}].map(x=>purEnterSheets(Object.assign({kind:'glass',unit:'block'},x)));
  DB.purchaseReceipt=[];return {stock,form};
 }),{stock:['','Enter sheets'],form:[false,true,false]});

 eq('F03: To batch на Overview — всё стекло, которое ждёт батча, и у проверенного заказа, ещё не начатого в цеху',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Verified Only Glass'}));salesDraftDrop();oqThrough(id,'verified');
  const waiting=glassBatchRows([salesRecord(id)]).length;tab='dashboard';render();
  const row=[...document.querySelectorAll('[data-dash-shop] .ch-grid-row')].find(r=>(r.querySelector('.ch-grid-label')||{}).textContent==='To batch');
  return {waiting:waiting>0,shown:+row.querySelector('.ch-grid-cell b').textContent===waiting,board:prodBoard().some(x=>x.o.id===id)};
 }),{waiting:true,shown:true,board:false});

 /* Владелец 20.10: «1–3 исправляй». Старые формы Master Data и Agents из
    другой вкладки — как карточка клиента; юниты и стёкла — только целые;
    листов в строке — до 10 000. */
 eq('Master Data: старая форма не пишет поверх свежей правки и не возвращает удалённое; переоткрыл — сохраняет',await t.p.evaluate(()=>{
  tab='masterdata';const g=DB.glassProduct.find(p=>p.code==='6CLEAR');mdGlassEdit(g.id);render();
  g.name=g.name+' (other tab)';document.getElementById('md_name').value='Mine';mdGlassSave();
  const glass={err:(document.getElementById('e_mdGlass')||{}).textContent,kept:glassProductById(g.id).name.endsWith('(other tab)'),open:mdEdit===g.id};
  mdEdit=null;mdDraft=null;mdGlassEdit(g.id);render();mdGlassSave();const again=mdEdit===null&&glassProductById(g.id).name.endsWith('(other tab)');
  mdTab='materials';mdMatCategory='glass';mdMatView='glassSheet';
  if(!DB.glassSheet.length){DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:130,sheetHIn:96,availability:'stock'}));normalizeMasterData();}
  const s=DB.glassSheet[0];mdSheetEditRow(s.id);render();DB.glassSheet=DB.glassSheet.filter(x=>x.id!==s.id);mdSheetSave();
  const sheet={err:(document.getElementById('e_mdSheet')||{}).textContent,back:DB.glassSheet.some(x=>x.id===s.id)};mdSheetEdit=null;mdSheetDraft=null;
  mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('roughArris');render();const r=DB.serviceRate.find(x=>x.id==='roughArris');r.name=r.name+' (other tab)';mdCatSave();
  const cat=(document.getElementById('e_mdCat')||{}).textContent;mdCatEdit=null;mdCatDraft=null;tab='dashboard';render();
  return {glass,again,sheet,cat};
 }),{glass:{err:'Changed elsewhere — reopen',kept:true,open:true},again:true,sheet:{err:'This item was deleted',back:false},cat:'Changed elsewhere — reopen'});

 eq('Agents: старая форма не пишет поверх свежей правки и не возвращает удалённого; переоткрыл — сохраняет',await t.p.evaluate(()=>{
  oqReset();DB.referrer=[];DB.referrerPayout=[];const c=oqCustomer({legalName:'Agent Client'}),r=comSave({name:'Ivan Petrenko',customers:[{customerId:c.id,pct:10}]}).value;tab='commissions';
  comEditOpen(r.id);comFind(r.id).phone='416-555-0100';comDraft.note='mine';comFormSave();const stale={notice:comNotice,phone:comFind(r.id).phone,open:!!comDraft};
  comEditOpen(r.id);comDraft.note='mine';comFormSave();const again={note:comFind(r.id).note,phone:comFind(r.id).phone,closed:!comDraft};
  comEditOpen(r.id);DB.referrer=[];comFormSave();const gone={notice:comNotice,back:DB.referrer.length};comDraft=null;comNotice='';tab='dashboard';render();
  return {stale,again,gone};
 }),{stale:{notice:'Changed elsewhere — reopen',phone:'416-555-0100',open:true},again:{note:'mine',phone:'416-555-0100',closed:true},gone:{notice:'This person was deleted',back:0}});

 eq('юниты только целые: Hold units и Cancel units — 1.5 не становится 1, а отказ «Whole units only.»; пусто — прежнее «Enter how many units.»',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Units Co'}));salesDraftDrop();oqThrough(id,'batched');const l=salesRecord(id).lines[0];
  return {hold:unitHold(id,l.id,'1.5','x').error,cancel:unitCancel(id,l.id,'2.5','x').error,empty:unitHold(id,l.id,'','x').error,held:(salesRecord(id).lines[0].heldUnits||[]).length};
 }),{hold:'Whole units only.',cancel:'Whole units only.',empty:'Enter how many units.',held:0});

 const qtyId=await t.p.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer({legalName:'Typing Co'}));tab='sales';render();return id;});
 await t.p.locator('.line-qty').first().fill('');await t.p.locator('.line-qty').first().type('1.5');
 const typed=await t.p.locator('.line-qty').first().inputValue();
 await t.p.evaluate(()=>{salesDraftDrop(true);tab='customers';customerNew();cTab='payment';cDraft.paymentMode='cash';render();});
 await t.p.locator('input[oninput="cDraft.depositPercent=this.value"]').type('12.5');
 eq('поля количества стёкол и юнитов: точку не набрать (1.5 → 15); проценты и деньги — как раньше (12.5)',{typed,deposit:await t.p.evaluate(()=>{const v=cDraft.depositPercent;cEdit=null;cDraft=null;tab='dashboard';render();return v;})},{typed:'15',deposit:'12.5'});

 eq('листов в строке — до 10 000: пересчёт и приёмка стекла отказывают с причиной, 10 000 — можно',await t.p.evaluate(()=>{
  const err=f=>{try{f();return 'ok';}catch(e){return e.message;}};
  if(!window.a19Sup)window.a19Sup=purSupplierSave({name:'Limit Glass Co'}).value;
  const rec=sheets=>{const r=purFulfilSave('receipt',{supplierId:a19Sup.id,date:'2026-10-20',lines:[{id:'L0',kind:'glass',productId:glassProductByCode('6CLEAR').id,unit:'block',qty:2,actualSheets:sheets,widthIn:130,heightIn:96}]});return r.ok?'ok':r.error;};
  return {count:err(()=>invWhole('10001','6CLEAR 130×96')),max:invWhole('10000','x'),huge:err(()=>invWhole('9007199254740993','x')),receipt:rec(20000),receiptOk:rec(64)};
 }),{count:'6CLEAR 130×96: up to 10,000.',max:10000,huge:'x: up to 10,000.',receipt:'Line 1: up to 10,000 sheets.',receiptOk:'ok'});

 eq('аудит 19.10: без ошибок страницы',t.errs,[]);await t.c.close();
};
