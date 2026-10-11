/* Проход «цех за 14 месяцев», 11 октября 2026 (tools/sim-shop.js, волна 1):
   баги, которые нашли оптимизатор, продажник, Shipping, бухгалтер и CUT.
   Владелец: без Finance — «только показать окно, что заказ не оплачен…
   ничего не блокируем»; Hold на погруженном — «только уведомить»; Unbatch —
   «чтобы оптимизатор понял, что одно из стёкол ушло именно этого заказа». */
module.exports=async function({page,eq,ok}){
 console.log('sim-walk-fixes');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);await require('./report-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  window.swSeed=function(extra){oqReset();DB.carrier=[];carrierAdd('SL',2);DB.orderEvent=[];stationLast=null;stationNote='';const id=oqOrder(oqCustomer(Object.assign({legalName:'Maria Gonzalez'},extra||{})));salesDraftDrop();oqThrough(id,'ready');return id;};
  window.swPS=function(id,method){return shippingCreate({customerId:salesRecord(id).customerId,method:method||'pickup',shipTo:method==='delivery'?{address1:'1 Main St'}:{},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]}).value;};
  window.swOpen=function(s){tab='shipping';shippingTab='shipments';shippingOpenId=s.id;render();};
  window.swNoFinance=function(fn){const old=window.accessCan;window.accessCan=k=>k!=='finance';try{return fn();}finally{window.accessCan=old;}};
 });

 eq('Без Finance: окно «balance due» без Take payment — Back и Load anyway; в заказе нет кнопок Payments и Apply deposit, суммы видны',await t.p.evaluate(()=>swNoFinance(()=>{
  const id=swSeed({paymentMode:'cash'}),s=swPS(id);swOpen(s);
  shippingLoaded(s.id);const buttons=salesDialog?salesDialog.buttons.map(b=>b.label):[];oqChoose('Back');
  tab='sales';salesOrderEdit(id);const strip=document.querySelector('.fin-strip'),pay=[...strip.querySelectorAll('button')].map(b=>b.textContent);
  const out={buttons,pay,sums:/Balance/.test(strip.textContent),status:shippingFind(s.id).status};salesDraftDrop();tab='dashboard';render();return out;
 })),{buttons:['Back','Load anyway'],pay:[],sums:true,status:'planned'});

 eq('Convert квоты у клиента «PO required»: окно спрашивает PO, пустое не пускает, заказ создаётся с введённым PO',await t.p.evaluate(()=>{
  oqReset();const c=oqCustomer({legalName:'Redwood Glass',poRequired:true}),q=oqOrder(c,{kind:'quote'});salesOrderEdit(q);const before=DB.salesOrder.length;
  salesConvertQuote();const title=salesDialog&&salesDialog.title,input=!!document.querySelector('[data-dialog-input]');
  oqChoose('Convert to order');const again=salesDialog&&salesDialog.note,none=DB.salesOrder.length===before&&salesRecord(q).status!=='won';
  document.querySelector('[data-dialog-input]').value='RW-48213';document.querySelector('[data-dialog-input]').dispatchEvent(new Event('input'));oqChoose('Convert to order');
  const o=DB.salesOrder.find(x=>x.fromQuoteId===q);salesDraftDrop();
  return {title:/^PO required · Q-/.test(title),input,again,none,po:o&&o.customerPo,quote:salesRecord(q).status};
 }),{title:true,input:true,again:'Enter the PO.',none:true,po:'RW-48213',quote:'won'});

 eq('Received by — одной накладной: после скана подписанного PS поле пустеет; кто и когда принял — в карточке PS',await t.p.evaluate(()=>{
  const id=swSeed(),s=swPS(id,'delivery');shippingMarkShipped(s.id,'');swOpen(s);
  shippingReceivedBy='John Brown';shippingSigned(s.number);
  const out={status:shippingFind(s.id).status,by:shippingFind(s.id).receivedBy,field:shippingReceivedBy,input:document.getElementById('shippingReceiver').value,card:(document.querySelector('[data-ps-received]')||{}).textContent||''};
  tab='dashboard';render();return Object.assign(out,{card:/^Received \S+ \d+ · John Brown$/.test(out.card)});
 }),{status:'delivered',by:'John Brown',field:'',input:'',card:true});

 eq('Payments: итог внизу без аннулированных — число и сумма только живых, «1 void not counted»',await t.p.evaluate(()=>{
  const id=swSeed({paymentMode:'cash'});oqPay(id);DB.receipt.push(normalizeReceipt({number:'R-0099',customerId:salesRecord(id).customerId,date:finToday(),method:'cash',amount:50,allocations:[]}));
  const r=DB.receipt[0];r.voided=true;r.voidReason='Entered twice';tab='finance';finTab='receipts';subtab=null;render();
  const out={count:document.querySelector('[data-foot-count] b').textContent,voids:(document.querySelector('[data-foot-void]')||{}).textContent||'',sum:(document.querySelector('[data-sum="amount"]')||{}).textContent};
  tab='dashboard';render();return out;
 }),{count:'1 payment',voids:'· 1 void not counted',sum:'$50.00'});

 eq('Скид погрузили, потом заказ поставили на Hold: Loaded — окно «On Hold» с причиной, Back ничего не пишет, Ship anyway отправляет погруженное',await t.p.evaluate(()=>{
  const id=swSeed(),s=swPS(id,'delivery');shippingLoadState(s).units.forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const loaded=shippingLoad('SL-1',s.id,{id:'qa',name:'QA'}).kind;salesHoldApply([id],'Customer request');swOpen(s);
  shippingLoaded(s.id);const d={title:/^Order \d+ is On Hold$/.test(salesDialog.title),rows:salesDialog.rows.map(r=>r[1]),buttons:salesDialog.buttons.map(b=>b.label)};
  oqChoose('Back');const back=shippingFind(s.id).status;
  shippingLoaded(s.id);oqChoose('Ship anyway');const out={loaded,d,back,status:shippingFind(s.id).status};
  tab='dashboard';render();return out;
 }),{loaded:'shipLoaded',d:{title:true,rows:['Customer request'],buttons:['Back','Ship anyway']},back:'planned',status:'shipped'});

 eq('Unbatch стекла из батча с раскроем: окно «Re-optimize» — какое стекло какого заказа ушло; то же списком в шапке батча и в Optimization',await t.p.evaluate(()=>{
  oqReset();DB.stationScan=[];
  if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
  const id=oqOrder(oqCustomer({legalName:'Downtown Furniture'}));salesDraftDrop();oqThrough(id,'batched');const b=DB.glassBatch[DB.glassBatch.length-1];cutPlanRun(b.number);
  tab='optimization';glassBatchOpen(b.number);glassBatchDetailTab='contents';render();
  const target=glassBatchActiveItems(b)[0],o=salesRecord(id),part=b.parts[target.part];
  document.querySelector(`[data-glass-id="${target.piece}"] [data-glass-check]`).click();document.querySelector('[data-glass-action="unbatch"]').click();salesDialogConfirm(true);oqChoose('Unbatch selected glass');
  const d={title:salesDialog&&salesDialog.title,row:salesDialog&&salesDialog.rows[0],buttons:salesDialog?salesDialog.buttons.map(x=>x.label):[]};
  const want=target.piece+' · Order '+o.businessNumber+' · Line '+part.snapshot.line;oqChoose('Later');
  const head=(document.querySelector('[data-batch-stale-list]')||{}).textContent;
  glassBatchDetailTab='optimization';render();const opt=(document.querySelector('[data-cut-stale-list]')||{}).textContent;tab='dashboard';render();
  return {title:d.title==='Re-optimize '+b.number,row:d.row&&d.row[0]===want&&d.row[1]==='Removed',buttons:d.buttons,head:head===want,opt:opt===want};
 }),{title:true,row:true,buttons:['Later','Open Optimization'],head:true,opt:true});

 /* Медиазапросы шапки — от ширины окна: окно меняется снаружи. */
 await t.p.evaluate(()=>{
  oqReset();DB.carrier=[];carrierAdd('DL',1);const id=oqOrder(oqCustomer());salesDraftDrop();oqThrough(id,'batched');window.swBatch=DB.glassBatch[DB.glassBatch.length-1].number;
  const who=rbUser('Roman Hrytsenko','1234');rbStation('CUT',who);stationSetPutOn('DL-1');window.swLoose=window.stationLoose;window.stationLoose=()=>[1,2,3];
 });
 const wide=[];
 for(const w of [1440,1366,1280,1024]){await t.p.setViewportSize({width:w,height:900});
  wide.push(...await t.p.evaluate(w=>['queue','board'].map(k=>{stationTab=k;stationSheetView={batch:swBatch,glass:'',no:1};render();const top=document.querySelector('.st-top');
   return !top.querySelector('.st-topscan')||!top.querySelector('[data-station-puton]')||document.documentElement.scrollWidth>innerWidth+1?k+' '+w+' '+top.scrollWidth:'';}).filter(Boolean),w));}
 await t.p.setViewportSize({width:1440,height:900});await t.p.evaluate(()=>{window.stationLoose=swLoose;stationSwitch();tab='dashboard';render();});
 eq('Шапка CUT на Queue и Board с плашками No dolly, Putting on, батча и рабочего — не шире окна на 1440, 1366, 1280 и 1024',wide,[]);

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
