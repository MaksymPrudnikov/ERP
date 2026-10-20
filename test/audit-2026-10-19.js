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

 /* Цена заказа — на день сохранения (владелец, 20.10.2026: «при сохранении
    цена фиксируется, но её руками можно изменить и обновить заказ»; «деньги
    — всегда повод для споров»; «измерять результаты корректно день за днём»). */
 await t.p.evaluate(()=>{
  window.a19Live=function(kind){const c=oqCustomer({legalName:'Price Book Co'}),id=oqOrder(c,kind?{kind}:undefined);salesOrderEdit(id);
   soDraft.makeups.forEach(m=>{m.panes.forEach(p=>{p.priceOverride=null;});m.cavities.forEach(x=>{x.priceOverride=null;});});salesOrderSave();salesDraftDrop(true);return id;};
  window.a19Set=v=>{const g=glassProductByCode('6CLEAR');g.salePriceTempered=v;g.salePriceAnnealed=v;};
 });
 eq('цена фиксируется при Save: правка прайса не меняет сохранённый заказ; новый заказ — по новому прайсу; Update без правок — прежняя сумма; ручная цена + Update — новая',await t.p.evaluate(()=>{
  oqReset();a19Set(10);const id=a19Live(),t1=finOrderTotals(salesRecord(id)).grand,book=salesRecord(id).priceBook;
  a19Set(20);const kept=finOrderTotals(salesRecord(id)).grand,fresh=finOrderTotals(salesRecord(a19Live())).grand;
  salesOrderEdit(id);salesOrderSave();salesDraftDrop(true);const update=finOrderTotals(salesRecord(id)).grand;
  salesOrderEdit(id);soDraft.makeups[0].panes.forEach(p=>{p.priceOverride=15;});salesOrderSave();salesDraftDrop(true);const manual=finOrderTotals(salesRecord(id)).grand;
  return {book:(book||{})['glass:'+glassProductByCode('6CLEAR').id+':salePriceTempered'],kept:kept===t1,fresh:fresh>t1,update:update===t1,manual:manual>t1&&manual<fresh};
 }),{book:10,kept:true,fresh:true,update:true,manual:true});

 eq('старые заказы при загрузке получают цены, что в них видны сейчас (правка данных 8); отчёт стоимости работ и Convert квоты — по цене дня сохранения',await t.p.evaluate(()=>{
  oqReset();a19Set(10);const id=a19Live(),o=salesRecord(id),before=finOrderTotals(o).grand;delete o.priceBook;DB.dataFix=7;applyDataFixes();
  a19Set(20);const migrated={book:!!salesRecord(id).priceBook,same:finOrderTotals(salesRecord(id)).grand===before};
  const report=finWithOrder(salesRecord(id),()=>repGlassPrice({spec:{glassProductId:glassProductByCode('6CLEAR').id,heatTreatmentId:'HT-FT'}}));
  a19Set(10);const q=a19Live('quote'),qt=finOrderTotals(salesRecord(q)).grand;a19Set(20);salesConvertQuoteRecord(q,'PO-A19');
  const won=DB.salesOrder.find(x=>x.fromQuoteId===q);a19Set(null);
  return {migrated,report,converted:!!won&&finOrderTotals(won).grand===qt};
 }),{migrated:{book:true,same:true},report:10,converted:true});

 /* U01 (не проверялся сканером): станция в одной вкладке, запись забрала
    другая. Первый скан после возврата — код и Enter подряд, как сканер, — в
    поле и мимо поля. Раньше перерисовка стирала полкода — «unknown». */
 const u01=await t.p.evaluate(()=>{oqReset();DB.stationScan=[];DB.stationScanSeq=0;
  const id=oqOrder(oqCustomer({legalName:'U01 Glass'}));salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
  soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,width16:36*16,height16:24*16,qty:3,mark:'M1'})];salesEnsureLineShape(soDraft.lines[0]);
  if(!salesOrderSave())throw new Error('save');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  DB.user=DB.user.filter(u=>u.name!=='Scan U01');DB.user.push({name:'Scan U01',role:'Shop',station:'',skills:[],pin:'4321'});normalizeUsers();touch();
  stationCode='CUT';tab='station';render();stationLogin(DB.user.find(u=>u.name==='Scan U01').viewProfileId);render();
  return [...glassPieceMap(id).values()].flatMap(r=>r.ids);});
 const other=await t.c.newPage();other.on('pageerror',e=>t.errs.push(e.message));
 await other.goto(t.p.url());await other.waitForFunction(()=>typeof storageStarting!=='undefined'&&!storageStarting&&storageWriter,null,{timeout:5000});
 const scanBack=async(code,away)=>{await other.bringToFront();await other.dispatchEvent('body','pointerdown');await other.waitForFunction(()=>storageWriter,null,{timeout:5000});
  await t.p.bringToFront();if(away)await t.p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  /* Вкладка, забирающая запись, перерисовывает экран, когда получит право, —
     посреди скана или нет, как повезёт. Здесь — ровно посередине. */
  const half=Math.ceil(code.length/2);await t.p.keyboard.type(code.slice(0,half),{delay:0});
  const kept=await t.p.evaluate(()=>{storageRerender();return (document.querySelector('[data-station-scan]')||{}).value;})===code.slice(0,half);
  await t.p.keyboard.type(code.slice(half),{delay:0});await t.p.keyboard.press('Enter');await t.p.waitForFunction(()=>storageWriter,null,{timeout:5000});await t.p.waitForTimeout(300);
  return t.p.evaluate(kept=>({kept,stored:JSON.parse(localStorage.getItem(STORAGE_KEY)).stationScan.length,result:(document.querySelector('[data-station-result]')||{dataset:{}}).dataset.stationResult||''}),kept);};
 eq('U01: перерисовка посреди скана не стирает набранное (иначе остаток кода — чужое стекло или «unknown»); первый скан после смены вкладки записывается — в поле и мимо поля',{inField:await scanBack(u01[0],false),away:await scanBack(u01[1],true)},
  {inField:{kept:true,stored:1,result:'ok'},away:{kept:true,stored:2,result:'ok'}});
 await other.close();await t.p.evaluate(()=>{stationSwitch&&stationSwitch();tab='dashboard';render();});

 eq('форма станции: старая форма не пишет поверх чужой правки и не попадает на соседнюю станцию; переоткрыл — сохраняет',await t.p.evaluate(()=>{
  tab='masterdata';mdTab='stations';const i=DB.station.findIndex(s=>s.code==='POLISH');stEditOpen(i);
  DB.station[i].note='other tab';document.getElementById('sf_note').value='mine';const stale=saveSfStation(),err1=document.getElementById('e_sfStation').textContent,kept=DB.station[i].note;
  stEdit=null;stSeen=null;const j=DB.station.findIndex(s=>s.code==='POLISH');stEditOpen(j);const removed=DB.station.splice(0,1)[0];
  document.getElementById('sf_note').value='mine';saveSfStation();const err2=document.getElementById('e_sfStation').textContent,neighbour=DB.station[j]&&DB.station[j].note;
  DB.station.unshift(removed);stEdit=null;stSeen=null;stEditOpen(DB.station.findIndex(s=>s.code==='POLISH'));document.getElementById('sf_note').value='mine';const ok=saveSfStation();
  const note=DB.station.find(s=>s.code==='POLISH').note;tab='dashboard';render();
  return {stale,err1,kept,err2,neighbourUntouched:neighbour!=='mine',ok,note};
 }),{stale:false,err1:'Changed elsewhere — reopen',kept:'other tab',err2:'Changed elsewhere — reopen',neighbourUntouched:true,ok:true,note:'mine'});

 eq('аудит 19.10: без ошибок страницы',t.errs,[]);await t.c.close();
};
