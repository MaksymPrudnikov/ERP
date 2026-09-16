/* Список Sales как в Excel: колонки, фильтры с условиями и датами, чипы,
   сортировка, итоги внизу, выбор строк, меню правой кнопки, On Hold заказа.
   Решения владельца 15 сентября 2026. Прогоняется и на src, и на dist. */
module.exports=async function({page,eq,ok}){
 console.log('sales list');
 const t=await page();
 const init=()=>t.p.evaluate(()=>{
  window.slCustomer=(name,extra)=>{const c=normalizeCustomer(Object.assign({legalName:name,displayName:name,code:'QASL'+(DB.customer.length+1)},extra||{}));DB.customer.push(c);return c;};
  window.slOrder=(cust,opt)=>{
   opt=opt||{};tab='sales';salesOrderNew(opt.kind||'order');salesSetUnitType('double');
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';p.heatSoak=false;});
   m.cavities.forEach(c=>{c.priceOverride=3.1;});
   soDraft.lines=[];
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:37*16,height16:71*16,qty:opt.qty||1,mark:'L-1'});soDraft.lines.push(l);salesEnsureLineShape(l);
   salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});
   salesApplyCustomerDefaults(cust.id);soDraft.customerPo=opt.po||'';if(opt.priority)soDraft.priority=opt.priority;
   salesOrderSave();
   const id=soDraft.id,o=DB.salesOrder.find(x=>x.id===id);
   if(opt.days!=null){const d=new Date();d.setDate(d.getDate()-opt.days);d.setHours(10,0,0,0);o.createdAt=d.toISOString();}
   soEdit=null;soDraft=null;return id;
  };
  window.slCleanup=()=>{DB.receipt=[];DB.salesOrder=[];DB.customer=DB.customer.filter(c=>!/^QASL/.test(c.code||''));soEdit=null;soDraft=null;salesDialog=null;salesListMenu=null;salesHoldDialog=null;salesListSel=new Set();salesListPrefs=null;try{localStorage.removeItem('glass_erp_sales_list_v1');}catch(e){}salesShow={orders:true,quotes:true};salesStatusFilter='';tab='sales';salesPruneOrphanShapes();};
  window.slById=id=>DB.salesOrder.find(o=>o.id===id);
  window.slByNum=num=>DB.salesOrder.find(o=>o.businessNumber===num);
  window.slNums=()=>[...document.querySelectorAll('[data-order-row]')].map(tr=>(slById(tr.dataset.orderRow)||{}).businessNumber);
  window.slHeads=()=>[...document.querySelectorAll('.sales-list-card thead th')].map(th=>th.textContent.trim()).filter(Boolean);
  window.slSeed=()=>{
   slCleanup();const a=slCustomer('North Condo Build'),b=slCustomer('ABC Glazing Inc');
   slOrder(a,{qty:1,po:'PO-100',days:0});slOrder(b,{qty:3,po:'',days:3,priority:'rush'});slOrder(a,{kind:'quote',qty:2,days:1});
   render();
  };
 });
 await init();
 const HEADS=['Type','Number','Customer','PO','Created','Due','Status','Priority','Glass','Units','Area ft²','Total','Receipts','Balance'];

 eq('колонки по умолчанию как на макете; Type — только когда видны и заказы, и квоты; строки поиска нет',await t.p.evaluate(()=>{
  slSeed();const heads=slHeads();
  salesShow={orders:true,quotes:false};render();const noType=!slHeads().includes('Type');
  salesShow={orders:true,quotes:true};render();
  return {heads,noType,search:!document.getElementById('salesOrderSearch')};
 }),{heads:HEADS,noType:true,search:true});

 eq('условия текста как в Looker Studio: Starts with, + Or Contains, Exclude',await t.p.evaluate(()=>{
  const n=()=>slNums().sort();
  salesListSetFilter('customer',{conds:[{op:'startsWith',v:'north'}]});const starts=n();
  salesListSetFilter('customer',{conds:[{op:'startsWith',v:'north'},{op:'contains',v:'glazing',join:'or'}]});const or=n();
  salesListSetFilter('customer',{mode:'exclude',conds:[{op:'startsWith',v:'north'}]});const excl=n();
  salesListClearAll();return {starts,or,excl};
 }),{starts:['76002','Q-10001'],or:['76002','76003','Q-10001'],excl:['76003']});

 eq('условия чисел: Total больше и меньше, Between; PO — Is empty',await t.p.evaluate(()=>{
  const tot=num=>finOrderTotals(slByNum(num)).grand,t1=tot('76002'),t2=tot('76003'),tq=tot('Q-10001');
  salesListSetFilter('total',{conds:[{op:'gt',v:String(t1+0.01)},{op:'lt',v:String(t2-0.01),join:'and'}]});const between=slNums();
  salesListSetFilter('total',{conds:[{op:'between',v:String(t1),v2:String(tq)}]});const range=slNums().sort();
  salesListClearAll();
  salesListSetFilter('po',{conds:[{op:'empty'}]});const empty=slNums().sort();
  salesListClearAll();
  return {order:t1<tq&&tq<t2,between,range,empty};
 }),{order:true,between:['Q-10001'],range:['76002','Q-10001'],empty:['76003','Q-10001']});

 eq('даты: Today, Last 7 days, Between; итоги внизу считают только отфильтрованное',await t.p.evaluate(()=>{
  const foot=()=>((document.querySelector('[data-foot-count] b')||{}).textContent||'').trim();
  salesListSetFilter('created',{preset:'today'});const today=slNums(),todayFoot=foot();
  salesListSetFilter('created',{preset:'last7'});const week=slNums().length;
  const d=new Date();d.setDate(d.getDate()-2);
  salesListSetFilter('created',{conds:[{op:'between',v:salesListDay(d),v2:salesListDay(new Date())}]});const between=slNums().sort();
  salesListClearAll();
  return {today,todayFoot,week,between};
 }),{today:['76002'],todayFoot:'1 row · Orders 1 · Quotes 0',week:3,between:['76002','Q-10001']});

 eq('галочки значений в Status, сортировка Total, чипы: × снимает один фильтр, Clear filters — все',await t.p.evaluate(()=>{
  salesListSetFilter('status',{values:['New']});const onlyNew=slNums().sort();
  salesListSort('total','asc');const asc=slNums();
  salesListSetFilter('priority',{values:['Rush']});const chips=document.querySelectorAll('[data-filter-chip]').length,both=slNums();
  document.querySelector('[data-filter-chip="priority"] button').click();const afterX=document.querySelectorAll('[data-filter-chip]').length;
  document.querySelector('[data-clear-filters]').click();const cleared=document.querySelectorAll('[data-filter-chip]').length,all=slNums().length;
  salesListSort('created','desc');
  return {onlyNew,asc,chips,both,afterX,cleared,all};
 }),{onlyNew:['76002','76003'],asc:['76002','76003'],chips:2,both:['76003'],afterX:1,cleared:0,all:3});

 eq('итоги внизу: Units и Total — суммы видимых строк, строк и заказов по счёту',await t.p.evaluate(()=>{
  const sum=k=>((document.querySelector(`[data-sum="${k}"]`)||{}).textContent||'').trim();
  const total=finMoney(DB.salesOrder.reduce((s,o)=>s+finOrderTotals(o).grand,0));
  return {units:sum('units'),total:sum('total')===finFmt(total),rows:((document.querySelector('[data-foot-count] b')||{}).textContent||'').trim()};
 }),{units:'6',total:true,rows:'3 rows · Orders 2 · Quotes 1'});

 eq('меню колонки: сортировка, условие, + And, пресеты дат, значения галочками; Apply ставит чип',await t.p.evaluate(()=>{
  document.querySelector('[data-filter-col="total"]').click();
  const ops=[...document.querySelectorAll('[data-cond-op="0"] option')].map(o=>o.value);
  const v=document.querySelector('[data-cond-v="0"]');v.value='1000';v.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-add-cond="and"]').click();
  const sel=document.querySelector('[data-cond-op="1"]');sel.value='lt';sel.dispatchEvent(new Event('change',{bubbles:true}));
  const v2=document.querySelector('[data-cond-v="1"]');v2.value='1000000';v2.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('[data-filter-apply]').click();
  const chip=((document.querySelector('[data-filter-chip="total"]')||{}).textContent||'').replace('×','').trim(),active=document.querySelector('[data-filter-col="total"]').classList.contains('on');
  salesListClearAll();
  document.querySelector('[data-filter-col="created"]').click();const presets=document.querySelectorAll('[data-preset]').length;salesListCloseMenu();
  document.querySelector('[data-filter-col="status"]').click();const vals=[...document.querySelectorAll('[data-val]')].map(x=>x.dataset.val);salesListCloseMenu();
  return {ops,chip,active,presets,vals};
 }),{ops:['gt','gte','lt','lte','eq','ne','between','empty'],chip:'Total: > $1,000.00 and < $1,000,000.00',active:true,presets:9,vals:['New','Not sent']});

 const MOVED=['Type','Number','Customer','PO','Created','Due','Status','Units','Total','Area ft²','Receipts','Balance','Weight kg'];
 eq('колонки: скрыть Priority и Glass, включить Weight, поднять Total',await t.p.evaluate(()=>{
  salesListSetColumn('priority',false);salesListSetColumn('glass',false);salesListSetColumn('weight',true);salesListMoveColumn('total',-1);
  return slHeads();
 }),MOVED);
 await t.p.reload();await t.p.waitForTimeout(300);await init();
 eq('колонки запоминаются в браузере после перезагрузки; Standard view возвращает как было',await t.p.evaluate(()=>{
  tab='sales';soEdit=null;soDraft=null;salesShow={orders:true,quotes:true};render();
  const after=slHeads();salesListStandardView();
  return {after,standard:slHeads()};
 }),{after:MOVED,standard:HEADS});

 eq('On Hold: выбор галочками и Shift, окно причины, строки красные, в заказе полоса, Verify не проходит, Release',await t.p.evaluate(()=>{
  slSeed();const o3=slOrder(DB.customer.find(c=>c.legalName==='ABC Glazing Inc'),{qty:1,days:2});render();
  const rowsIds=()=>[...document.querySelectorAll('[data-order-row]')].map(tr=>tr.dataset.orderRow);
  const box=id=>document.querySelector(`[data-order-row="${id}"] [data-row-check]`);
  let ids=rowsIds();box(ids[0]).click();
  box(ids[ids.length-1]).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:true}));
  const range=salesListSel.size;
  box(slByNum('Q-10001').id).click();box(o3).click();
  const btnBefore=document.querySelector('[data-hold-button]').textContent.trim();
  document.querySelector('[data-hold-button]').click();
  const choices=document.querySelectorAll('[data-hold-choice]').length;
  document.querySelector('[data-hold-choice="3"]').click();
  document.querySelector('[data-hold-confirm]').click();
  const a=slByNum('76002'),b=slByNum('76003'),held=[a.onHold,b.onHold],reason=[a.holdReason,b.holdReason];
  const red=document.querySelectorAll('.sl-row-hold').length,btnAfter=document.querySelector('[data-hold-button]').textContent.trim();
  salesOrderEdit(a.id);
  const bar=((document.querySelector('[data-hold-bar]')||{}).textContent||'').includes('Credit check');
  tab='optimization';optimizationRunOrders([a.id],'verified');
  const title=salesDialog?salesDialog.title:'',buttons=salesDialog?salesDialog.buttons.map(x=>x.label):[];
  salesDialogChoose(1);
  const released=[slByNum('76002').onHold,soDraft.onHold],status=soDraft.status,work=salesDraftHasWork();
  soEdit=null;soDraft=null;salesListSel=new Set();tab='sales';render();
  return {range,btnBefore,choices,held,reason,red,btnAfter,bar,title,buttons,released,status,work};
 }),{range:4,btnBefore:'On Hold (2)',choices:5,held:[true,true],reason:['Credit check','Credit check'],red:2,btnAfter:'Release (2)',bar:true,
  title:'Order 76002 is On Hold',buttons:['Back','Release hold'],released:[false,false],status:'new',work:false});

 eq('правая кнопка мыши на строке: Open, On Hold…, Documents, Cancel order, Delete; On Hold… открывает окно для этой строки',await t.p.evaluate(()=>{
  const id=slByNum('76004').id,tr=document.querySelector(`[data-order-row="${id}"]`);
  tr.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}));
  const items=[...document.querySelectorAll('.sl-ctx [data-menu]')].map(x=>x.dataset.menu);
  document.querySelector('.sl-ctx [data-menu="hold"]').click();
  const dlg=!!salesHoldDialog&&salesHoldDialog.ids.length===1&&salesHoldDialog.ids[0]===id;
  salesHoldClose();salesListSel=new Set();render();
  return {items,dlg,closed:!document.querySelector('.sl-hold-dialog')};
 }),{items:['open','hold','documents','cancel','delete'],dlg:true,closed:true});

 eq('цвет строки: Batched — серая, On Hold — красная',await t.p.evaluate(()=>{
  slByNum('76004').status='batched';render();
  const bg=num=>getComputedStyle(document.querySelector(`[data-order-row="${slByNum(num).id}"] td:nth-child(2)`)).backgroundColor;
  const work=bg('76004'),hold=bg('76003'),plain=bg('Q-10001');
  return {work,hold,plain:plain!==work&&plain!==hold};
 }),{work:'rgb(234, 236, 240)',hold:'rgb(254, 228, 226)',plain:true});

 eq('список, меню фильтра, колонки, меню строки и окно On Hold — без русского текста',await t.p.evaluate(()=>{
  let text='';const grab=()=>{text+=document.getElementById('app').innerText;};
  document.querySelector('[data-filter-col="customer"]').click();grab();salesListCloseMenu();
  document.querySelector('[data-filter-col="created"]').click();grab();salesListCloseMenu();
  document.querySelector('[data-columns-button]').click();grab();salesListCloseMenu();
  const id=slByNum('76002').id;salesListContext({preventDefault(){},stopPropagation(){},clientX:100,clientY:100},id);grab();salesListCloseMenu();
  salesHoldOpen([id]);grab();salesHoldClose();
  slCleanup();render();
  return /[А-яЁё]/.test(text);
 }),false);
 eq('список Sales не дал ошибок страницы',t.errs,[]);
 await t.c.close();
};
