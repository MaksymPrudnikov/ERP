/* Список Sales как в Excel: колонки, фильтры с условиями и датами, чипы,
   сортировка, итоги внизу, выбор строк, меню правой кнопки, On Hold заказа.
   Решения владельца 15 сентября 2026. Прогоняется и на src, и на dist. */
module.exports=async function({page,eq,ok}){
 console.log('sales list');
 const t=await page(undefined,{width:1920,height:900});
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
   salesApplyCustomerDefaults(cust.id);soDraft.customerPo=opt.po||(opt.kind==='quote'?'':'PO-SL');if(opt.priority)soDraft.priority=opt.priority;
   salesOrderSave();
   const id=soDraft.id,o=DB.salesOrder.find(x=>x.id===id);
   /* Заказ без PO — только старый: PO у всех с 29.10.2026, Save без него не пишет. */
   if(opt.po==='')o.customerPo='';
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
 const HEADS=['Type','Number','Customer','PO','Created','Due','Status','Priority','Glass','Order Items','Units','Area ft²','Total','Receipts','Balance'];

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
 }),{today:['76002'],todayFoot:'1',week:3,between:['76002','Q-10001']});

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
 }),{units:'6',total:true,rows:'3'});

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

 const MOVED=['Type','Number','Customer','PO','Created','Due','Status','Order Items','Units','Total','Area ft²','Receipts','Balance','Weight kg'];
 eq('колонки: скрыть Priority и Glass, включить Weight, поднять Total',await t.p.evaluate(()=>{
  salesListSetColumn('priority',false);salesListSetColumn('glass',false);salesListSetColumn('weight',true);salesListMoveColumn('total',-1);
  return slHeads();
 }),MOVED);
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);await t.p.waitForTimeout(300);await init();
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

 eq('правая кнопка мыши на строке: Open, Copy, Activity log, Skip…, On Hold…, Documents, Drawings, Cut preview, Print stickers…, Unbatch order…, Cancel order, Delete; On Hold… открывает окно для этой строки',await t.p.evaluate(()=>{
  const id=slByNum('76004').id,tr=document.querySelector(`[data-order-row="${id}"]`);
  tr.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}));
  const items=[...document.querySelectorAll('.sl-ctx [data-menu]')].map(x=>x.dataset.menu);
  document.querySelector('.sl-ctx [data-menu="hold"]').click();
  const dlg=!!salesHoldDialog&&salesHoldDialog.ids.length===1&&salesHoldDialog.ids[0]===id;
  salesHoldClose();salesListSel=new Set();render();
  /* Drawings — сразу окно документов на вкладке чертежей этого заказа. */
  tr.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}));
  document.querySelector('.sl-ctx [data-menu="drawings"]').click();
  const drawings=!!docState&&docState.kind==='drawings'&&!!soDraft&&soDraft.id===id&&document.querySelectorAll('[data-doc-drawing]').length===1;
  docClose();soEdit=null;soDraft=null;tab='sales';subtab='orders';salesListSel=new Set();render();
  return {items,dlg,closed:!document.querySelector('.sl-hold-dialog'),drawings};
 }),{items:['open','copy','log','skip','hold','documents','drawings','cutpreview','stickers','unbatch','cancel','delete'],dlg:true,closed:true,drawings:true});

 eq('цвет строки: Batched — серая, On Hold — красная',await t.p.evaluate(()=>{
  slByNum('76004').status='batched';render();
  const bg=num=>getComputedStyle(document.querySelector(`[data-order-row="${slByNum(num).id}"] td:nth-child(2)`)).backgroundColor;
  const work=bg('76004'),hold=bg('76003'),plain=bg('Q-10001');const tok=n=>{const d=document.createElement('div');d.style.background='var(--'+n+')';document.body.appendChild(d);const c=getComputedStyle(d).backgroundColor;d.remove();return c;};
  return {work:work===tok('surface-3'),hold:hold===tok('danger-soft'),plain:plain!==work&&plain!==hold};
 }),{work:true,hold:true,plain:true});

 eq('быстрые виды: Today и Needs attention видят старые заказы, хотя список по умолчанию — 14 дней',await t.p.evaluate(()=>{
  slCleanup();const a=slCustomer('North Condo Build'),today=salesListDay(new Date());
  const old=slOrder(a,{days:30}),late=slOrder(a,{days:25}),fresh=slOrder(a,{days:1});
  slById(old).dueDate=today;slById(late).dueDate='2020-01-15';tab='sales';subtab='orders';render();
  const pills=()=>[...document.querySelectorAll('.sl-quick .sl-quick-pill')].map(b=>b.textContent.trim());
  const all=slNums().length,counts=pills();
  salesQuickSet('today');const todayRows=slNums();
  salesQuickSet('attention');const attRows=slNums();
  salesQuickSet('all');const back=slNums().length;
  return {all,counts,today:todayRows.length===1&&todayRows[0]===slById(old).businessNumber,attention:attRows.length===1&&attRows[0]===slById(late).businessNumber,back};
 }),{all:1,counts:['All1','Today1','Due this week1','Needs attention1'],today:true,attention:true,back:1});

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
 eq('длинный список: в странице начало, остальное по прокрутке; Select all, итог и Shift видят все заказы',await t.p.evaluate(async()=>{
  slSeed();const base=DB.salesOrder[0],frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  for(let i=0;i<500;i++)DB.salesOrder.push(Object.assign(JSON.parse(JSON.stringify(base)),{id:'SO-LONG'+i,businessNumber:String(90000+i)}));
  storageInvalidate();tab='sales';window.requestIdleCallback=()=>0;render();render();
  const all=salesListIds.length,first=document.querySelectorAll('[data-order-row]').length,tail=!!document.querySelector('[data-list-rest]');
  const foot=document.querySelector('.sl-foot').textContent.includes(String(all));
  document.querySelector('[data-select-all]').click();const selected=salesListSel.size;
  salesListSel=new Set();render();
  const a=document.querySelector('[data-row-check]');a.click();
  salesListToggleRow(new MouseEvent('click',{shiftKey:true}),salesListIds[99]);const range=salesListSel.size;
  salesListSel=new Set();render();
  for(let i=0;i<40&&document.querySelector('[data-list-rest]');i++){window.scrollTo(0,document.documentElement.scrollHeight);await frames();}
  const end={rows:document.querySelectorAll('[data-order-row]').length,tail:!!document.querySelector('[data-list-rest]')};
  window.scrollTo(0,0);delete window.requestIdleCallback;slCleanup();render();
  return {few:first<=80,tail,foot,all:selected===all,range,end:end.rows===all&&!end.tail};
 }),{few:true,tail:true,foot:true,all:true,range:100,end:true});
 /* Шапка, Draft, итоги внизу, все ширины экрана (владелец, 2.11.2026). */
 eq('Open и Delete над таблицей: только для одной отмеченной строки, в строках кнопок нет',await t.p.evaluate(()=>{
  slSeed();const open=()=>document.querySelector('[data-open-button]'),del=()=>document.querySelector('[data-delete-button]'),state=()=>[open().disabled,del().disabled],box=i=>document.querySelectorAll('[data-row-check]')[i];
  const none=state(),rowBtns=document.querySelectorAll('[data-order-row] button').length,first=[...document.querySelector('.sales-toolbar').querySelectorAll('button')].slice(1,3).map(b=>b.textContent);
  box(0).click();const one=state();box(1).click();const two=state();box(1).click();
  const id=[...salesListSel][0];const real=window.confirm;window.confirm=()=>true;del().click();window.confirm=real;
  const gone=!DB.salesOrder.some(o=>o.id===id),sel=salesListSel.size,after=state();
  box(0).click();const next=[...salesListSel][0];open().click();const opened=soEdit===next;
  soEdit=null;soDraft=null;salesListSel=new Set();render();return {none,rowBtns,first,one,two,gone,sel,after,opened};
 }),{none:[true,true],rowBtns:0,first:['Open','Delete'],one:[false,false],two:[true,true],gone:true,sel:0,after:[true,true],opened:true});
 eq('Draft — первая кнопка статусов, в New не считается; нажатие включает и выключает фильтр',await t.p.evaluate(()=>{
  slCleanup();const a=slCustomer('North Condo Build'),d=slOrder(a,{days:1});slOrder(a,{days:1});slById(d).isDraft=true;render();
  const pills=()=>[...document.querySelectorAll('[data-status-chip]')].map(b=>b.textContent.replace(/\s+/g,' ').trim()),press=k=>document.querySelector(`[data-status-chip="${k}"]`).click();
  const first=pills().slice(0,2);press('order:draft');const only=slNums().length,num=slNums()[0]===slById(d).businessNumber,on=document.querySelector('[data-status-chip="order:draft"]').classList.contains('on'),allOff=!document.querySelector('[data-quick="all"]').classList.contains('on');
  press('order:draft');return {first,only,num,on,allOff,back:slNums().length};
 }),{first:['Draft1','New1'],only:1,num:true,on:true,allOff:true,back:2});
 eq('числа статусов идут за быстрым видом и фильтрами, All и остальные быстрые — не за кнопкой статуса',await t.p.evaluate(()=>{
  slCleanup();const a=slCustomer('North Condo Build'),today=salesListDay(new Date()),x=slOrder(a,{days:1}),y=slOrder(a,{days:1});slById(x).dueDate=today;slById(y).dueDate='2099-01-01';render();
  /* Статусы видны только при All — счёт берём из тех же кнопок (salesListChipsNow). */
  const n=k=>String(salesListChipsNow.find(c=>c.key===k).n),q=k=>(document.querySelector(`[data-quick="${k}"] b`)||{}).textContent;
  const all=n('order:new');salesQuickSet('today');const inToday=n('order:new');salesQuickSet('all');
  salesSetStatusFilter('order:verified');const held=q('all');salesSetStatusFilter('');
  salesListSetFilter('customer',{values:['(none)']});const filtered=n('order:new');salesListClearAll();
  return {all,inToday,held,filtered};
 }),{all:'2',inToday:'1',held:'2',filtered:'0'});
 eq('один All: снимает быстрый вид и статус; когда снимать нечего — прячет и показывает статусы, выбор помнит',await t.p.evaluate(()=>{
  slCleanup();const a=slCustomer('North Condo Build');slOrder(a,{days:1});render();
  const all=()=>document.querySelector('[data-quick="all"]');
  const one=!document.querySelector('[data-status-all]')&&document.querySelectorAll('[data-quick="all"]').length;
  salesQuickSet('today');salesSetStatusFilter('order:new');all().click();
  const reset={quick:salesListLoadPrefs().quick,status:salesStatusFilter,chips:document.querySelectorAll('[data-status-chip]').length>0};
  all().click();const hidden=document.querySelectorAll('[data-status-chip]').length,saved=JSON.parse(localStorage.getItem(SALES_LIST_PREFS_KEY)).statusHidden;
  salesListPrefs=null;render();const after=document.querySelectorAll('[data-status-chip]').length;
  all().click();return {one,reset,hidden,saved,after,shown:document.querySelectorAll('[data-status-chip]').length>0};
 }),{one:1,reset:{quick:'all',status:'',chips:true},hidden:0,saved:true,after:0,shown:true});
 const WIDTHS={1920:[],1800:[],1799:['orderItems'],1620:['orderItems'],1600:['orderItems','glass','created'],1440:['orderItems','glass','created'],1399:['orderItems','glass','created','priority','area'],1280:['orderItems','glass','created','priority','area'],1199:['orderItems','glass','created','priority','area','units','po','receipts'],1024:['orderItems','glass','created','priority','area','units','po','receipts']};
 await t.p.evaluate(()=>{slCleanup();const a=slCustomer('Very Long Customer Name Architectural Glass And Mirror Incorporated');slOrder(a,{days:1,po:'PO-123456789012345'});salesShow={orders:true,quotes:false,ncr:false};render();});
 for(const w of Object.keys(WIDTHS).map(Number)){
  await t.p.setViewportSize({width:w,height:900});await t.p.waitForFunction(x=>innerWidth===x,w);
  const r=await t.p.evaluate(()=>{render();
   const card=document.querySelector('.sales-list-card').getBoundingClientRect(),row=document.querySelector('.sl-filter-row'),th=[...document.querySelectorAll('thead th[data-col]')],width=k=>th.find(x=>x.dataset.col===k).getBoundingClientRect().width;
   const out=[...document.querySelectorAll('.sales-list-card *')].filter(e=>e.offsetWidth&&e.getBoundingClientRect().right>card.right+1).length;
   return {hidden:Object.keys(SALES_LIST_NARROW).filter(k=>!th.some(x=>x.dataset.col===k)),out,oneRow:row.offsetHeight<44,fill:width('customer')>=110,wide:document.querySelector('.sales-table-wrap').classList.contains('sl-wide'),
    date:document.querySelector('.sales-toolbar [data-created-range]')?'top':'row',statusBtn:!!document.querySelector('[data-status-menu]'),week:document.querySelector('[data-quick="week"]').firstChild.textContent};
  });
  eq('Sales '+w+': колонки по порядку, ничего не вылезает, фильтры одной строкой',{hidden:r.hidden.sort(),out:r.out,oneRow:r.oneRow,fill:r.fill,wide:r.wide,date:r.date,statusBtn:r.statusBtn,week:r.week},
   {hidden:WIDTHS[w].slice().sort(),out:0,oneRow:true,fill:true,wide:false,date:w<1600?'top':'row',statusBtn:w<1200,week:w<1400?'This week':'Due this week'});
 }
 await t.p.setViewportSize({width:1024,height:900});await t.p.waitForFunction(()=>innerWidth===1024);
 eq('узкий экран: статусы в кнопке Status, выбор фильтрует и виден на кнопке',await t.p.evaluate(()=>{
  render();document.querySelector('[data-status-menu]').click();const n=document.querySelectorAll('.sl-status-menu [data-status-chip]').length;
  document.querySelector('.sl-status-menu [data-status-chip="order:new"]').click();const label=document.querySelector('[data-status-menu]').textContent.replace('▾','').trim(),menu=!!document.querySelector('.sl-status-menu');
  salesSetStatusFilter('');return {many:n>5,label,menu};
 }),{many:true,label:'Status: New',menu:false});
 await t.p.setViewportSize({width:1280,height:700});await t.p.waitForFunction(()=>innerWidth===1280);
 eq('колонка, включённая шестерёнкой, видна всегда, таблица крутится вбок; снятая снова прячется только на узком',await t.p.evaluate(()=>{
  render();const heads=()=>[...document.querySelectorAll('thead th[data-col]')].map(x=>x.dataset.col),wrap=()=>document.querySelector('.sales-table-wrap');
  document.querySelector('[data-columns-button]').click();const unchecked=!document.querySelector('[data-col-toggle="glass"]').checked;salesListCloseMenu();
  salesListSetColumn('glass',true);salesListSetColumn('orderItems',true);salesListSetColumn('area',true);salesListSetColumn('priority',true);
  const on=heads().includes('glass'),wide=wrap().classList.contains('sl-wide'),scrolls=wrap().scrollWidth>wrap().clientWidth,card=document.querySelector('.sales-list-card').getBoundingClientRect().right>=wrap().getBoundingClientRect().right;
  ['glass','orderItems','area','priority'].forEach(k=>salesListSetColumn(k,false));
  return {unchecked,on,wide,scrolls,card,off:heads().includes('glass'),kept:salesListLoadPrefs().cols.find(c=>c.k==='glass').on,narrow:wrap().classList.contains('sl-wide')};
 }),{unchecked:true,on:true,wide:true,scrolls:true,card:true,off:false,kept:true,narrow:false});
 await t.p.setViewportSize({width:1920,height:700});await t.p.waitForFunction(()=>innerWidth===1920);
 eq('итоги внизу: по умолчанию Sum у чисел, у текста ничего; Rows считает все строки',await t.p.evaluate(()=>{
  slCleanup();const a=slCustomer('North Condo Build'),b=slCustomer('ABC Glazing Inc');slOrder(a,{days:1,qty:1});slOrder(a,{days:1,qty:2});slOrder(b,{days:1,qty:6});render();
  const cell=k=>(document.querySelector(`[data-sum="${k}"]`)||{}),label=k=>cell(k).previousElementSibling.textContent;
  return {rows:document.querySelector('[data-foot-count] b').textContent,word:document.querySelector('[data-foot-count] small').textContent,units:cell('units').textContent,label:label('units'),customer:cell('customer').textContent||'',tip:/Orders 3/.test(document.querySelector('[data-foot-count]').title)};
 }),{rows:'3',word:'Rows',units:'9',label:'Sum',customer:'',tip:true});
 eq('Show at bottom: меню числа и текста, выбор сразу внизу, помнится, считает только видимое',await t.p.evaluate(()=>{
  const open=k=>document.querySelector(`[data-filter-col="${k}"]`).click(),opts=()=>[...document.querySelectorAll('[data-calc]')].map(b=>b.textContent),pick=c=>document.querySelector(`[data-calc="${c}"]`).click();
  const cell=k=>{const e=document.querySelector(`[data-sum="${k}"]`);return e?e.previousElementSibling.textContent+' '+e.textContent:'';};
  open('units');const number=opts(),title=[...document.querySelectorAll('.sl-menu h5')].map(x=>x.textContent).slice(0,3);
  const seen={};for(const c of ['avg','count','min','max']){pick(c);seen[c]=cell('units');}
  pick('none');seen.none=cell('units');salesListCloseMenu();
  open('customer');const text=opts();pick('unique');seen.unique=cell('customer');pick('count');seen.count2=cell('customer');salesListCloseMenu();
  salesListSetCalc('customer','unique');salesListSetCalc('units','sum');
  salesListSetFilter('customer',{values:['ABC Glazing Inc']});const shown={unique:cell('customer'),units:cell('units')};salesListClearAll();
  salesListPrefs=null;render();const kept=salesListLoadPrefs().calc.customer;
  salesListSetCalc('customer','none');
  return {number,title,text,seen,shown,kept,head:document.querySelector('[data-foot-count]').colSpan>1};
 }),{number:['Sum','Average','Count','Min','Max','None'],title:['Sort','Show at bottom','Condition'],text:['Count','Unique','None'],
  seen:{avg:'Average 3.0',count:'Count 3',min:'Min 1',max:'Max 6',none:'',unique:'Unique 2',count2:'Count 3'},shown:{unique:'Unique 1',units:'Sum 6'},kept:'unique',head:true});
 eq('длинный список: итоги у нижней полосы экрана, в том числе когда таблица шире экрана и крутится сама',await t.p.evaluate(async()=>{
  slSeed();const base=DB.salesOrder[0],frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  for(let i=0;i<200;i++)DB.salesOrder.push(Object.assign(JSON.parse(JSON.stringify(base)),{id:'SO-LONG'+i,businessNumber:String(90000+i)}));
  storageInvalidate();render();window.scrollTo(0,0);await frames();
  const gap=()=>Math.round(document.querySelector('.sl-foot td').getBoundingClientRect().bottom-document.querySelector('.app-foot').getBoundingClientRect().top),sticky=getComputedStyle(document.querySelector('.sl-foot td')).position;
  const page=gap();window.scrollTo(0,400);await frames();const scrolled=gap();window.scrollTo(0,0);
  const width={};document.querySelectorAll('thead th[data-col]').forEach(th=>{width[th.dataset.col]=500;});salesListLoadPrefs().widths=width;render();await frames();
  const wrap=()=>document.querySelector('.sales-table-wrap'),wide=wrap().classList.contains('sl-wide'),box=gap()<=0;
  wrap().scrollTop=300;wrap().scrollLeft=120;render();const keep=[wrap().scrollTop,wrap().scrollLeft];await frames();
  delete salesListLoadPrefs().widths;slCleanup();render();
  return {sticky,page,scrolled,wide,box,keep};
 }),{sticky:'sticky',page:0,scrolled:0,wide:true,box:true,keep:[300,120]});
 await t.p.setViewportSize({width:1280,height:720});await t.p.evaluate(()=>{render();});
 eq('список Sales не дал ошибок страницы',t.errs,[]);
 await t.c.close();
};
