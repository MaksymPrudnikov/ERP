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

 eq('аудит 19.10: без ошибок страницы',t.errs,[]);await t.c.close();
};
