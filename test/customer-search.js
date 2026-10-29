/* Поиск клиента в заказе (пункт 12; владелец 30.10.2026: «искать с первой
   буквы, ввожу 3 — по первым 3 и дальше предлагать»). Справочник на 300+
   клиентов, настоящие нажатия клавиш: набор, стрелки, Enter, Escape, Tab,
   мышь. Набранный текст заказ не меняет — только выбор строки. */
module.exports=async function({page,eq}){
 console.log('customer search');
 const t=await page(undefined,{width:1440,height:900});const p=t.p;
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main поля ещё нет). */
 const run=(fn,arg)=>p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const act=fn=>fn().catch(e=>({error:String(e.message).split('\n')[0]}));
 await p.evaluate(()=>{
  const A=['Atlas','Birch','Cedar','Delta','Echo','Falcon','Harbor','Iron','Juniper','Keystone','Lakeside','Maple','Oak','Pine','Quarry','Ridge','Summit','Timber','Union','Vista'];
  const B=['Glass','Windows','Glazing','Doors','Construction','Builders','Homes','Contracting','Interiors','Renovations','Supply','Partners','Studio','Works','Mirrors'];
  const add=(x,code)=>{const c=normalizeCustomer(Object.assign({code,status:'active',paymentTerms:'Net 30',currency:'CAD'},x));DB.customer.push(c);return c;};
  DB.customer=[];let n=100;
  A.forEach(a=>B.forEach(b=>add({displayName:a+' '+b,legalName:a+' '+b+' Ltd.'},'C-'+String(n++).padStart(5,'0'))));
  window.csC={
   greenline:add({displayName:'Greenline Window Systems',legalName:'Greenline Window Systems Inc.',currency:'USD',paymentTerms:'Net 45'},'C-00007'),
   greenfield:add({displayName:'Greenfield Glass',legalName:'Greenfield Glass Ltd.'},'C-00012'),
   north:add({displayName:'North Greenline Services',legalName:'North Greenline Services Corp.'},'C-00045'),
   valleyTo:add({displayName:'Green Valley Construction',legalName:'Green Valley Construction Inc.',addresses:[{type:'billing',city:'Toronto',isDefault:true}]},'C-00031'),
   valleyHa:add({displayName:'Green Valley Construction',legalName:'Green Valley Construction (Hamilton) Ltd.',addresses:[{type:'billing',city:'Hamilton',isDefault:true}]},'C-00098'),
   ever:add({displayName:'Evergreen Doors',legalName:'Evergreen Doors & Windows Ltd.',onHold:true},'C-00076'),
   legal:add({displayName:'BTW Glass',legalName:'Bluewater Tempered Works Inc.'},'C-00050'),
   archived:add({displayName:'Greenhouse Glazing',legalName:'Greenhouse Glazing Ltd.',status:'archived'},'C-00060'),
   first:add({displayName:'Atlantic Windows',legalName:'Atlantic Windows Ltd.',paymentTerms:'Net 15'},'C-00090'),
  };
  /* Справочник записан: отказ Save возвращает базу к записанной. */
  touch();
  window.csOpen=()=>{tab='sales';if(soDraft)salesDraftDrop(true);salesOrderNew('order');salesApplyCustomerDefaults(csC.first.id);render();};
  window.csList=()=>[...document.querySelectorAll('#so_cust_list [data-customer-option]')].map(o=>[...o.children].map(x=>x.textContent).join(' '));
  window.csField=()=>{const el=document.getElementById('so_customer'),box=document.getElementById('so_cust_list');return {value:el.value,open:!box.hidden,focus:document.activeElement===el};};
  window.csKept=()=>soDraft.customerId===csC.first.id&&soDraft.paymentTerms==='Manual 10'&&soDraft.currency==='CAD';
 });
 const type=async q=>{await p.focus('#so_customer');await p.keyboard.press('ControlOrMeta+A');await p.keyboard.type(q);};
 const key=async(k,n)=>{for(let i=0;i<(n||1);i++)await p.keyboard.press(k);};

 eq('Customer: одна буква — сразу подсказки; «gre» — с начала названия, потом слово внутри, потом остальное; код справа',await act(async()=>{
  await run(()=>csOpen());await type('g');const one=await run(()=>csList().length>0);
  await type('gre');return {count:await run(()=>DB.customer.length>300),one,list:await run(()=>csList())};
 }),{count:true,one:true,list:['Green Valley Construction Toronto C-00031','Green Valley Construction Hamilton C-00098','Greenfield Glass C-00012','Greenline Window Systems C-00007','North Greenline Services C-00045','Evergreen Doors On Hold C-00076']});
 eq('Customer: регистр и пробелы вокруг не важны; поиск по словам внутри, юридическому имени и коду; архивного нет',await act(async()=>{
  await run(()=>csOpen());const q=async s=>{await type(s);return run(()=>csList());};
  const green=await q('green'),upper=await q('GREEN'),spaced=await q('   green  ');
  return {same:green.length===6&&JSON.stringify(green)===JSON.stringify(upper)&&JSON.stringify(green)===JSON.stringify(spaced),inside:await q('window sys'),legal:await q('bluewater'),code:await q('c-00007'),archived:(await q('greenhouse')).length};
 }),{same:true,inside:['Greenline Window Systems C-00007'],legal:['BTW Glass C-00050'],code:['Greenline Window Systems C-00007'],archived:0});
 eq('Customer: набор, Escape, Enter без стрелки, Tab — клиент, условия и поле прежние; заказ не сохраняется',await act(async()=>{
  const before=await run(()=>{csOpen();soDraft.paymentTerms='Manual 10';render();return DB.salesOrder.length;});
  await type('green');const typed=await run(()=>csField()),k1=await run(()=>csKept());
  await key('Escape');const esc=await run(()=>csField()),k2=await run(()=>csKept());
  await type('green');await key('Enter');const k3=await run(()=>csKept()),saved=await run(()=>DB.salesOrder.length);
  await type('green');await key('Tab');const tabbed=await run(()=>csField().value),k4=await run(()=>csKept());
  return {typed,esc,tabbed,kept:[k1,k2,k3,k4],saved:saved===before};
 }),{typed:{value:'green',open:true,focus:true},esc:{value:'Atlantic Windows',open:false,focus:true},tabbed:'Atlantic Windows',kept:[true,true,true,true],saved:true});
 eq('Customer: стрелки и Enter берут выбранную строку — вторую из двух одинаковых названий',await act(async()=>{
  await run(()=>csOpen());await type('green valley');await key('ArrowDown',2);await key('Enter');
  return run(()=>({second:soDraft.customerId===csC.valleyHa.id,first:soDraft.customerId===csC.valleyTo.id,value:document.getElementById('so_customer').value}));
 }),{second:true,first:false,value:'Green Valley Construction'});
 eq('Customer: мышью — новый клиент с его валютой и условиями; снова тот же — ручные условия остаются',await act(async()=>{
  await run(()=>csOpen());await type('greenline w');await p.click('#so_cust_list [data-customer-option]');
  const other=await run(()=>({id:soDraft.customerId===csC.greenline.id,currency:soDraft.currency,terms:soDraft.paymentTerms}));
  await run(()=>{soDraft.paymentTerms='Manual 5';});
  await type('greenline w');await key('ArrowDown');await key('Enter');
  return {other,same:await run(()=>({id:soDraft.customerId===csC.greenline.id,terms:soDraft.paymentTerms}))};
 }),{other:{id:true,currency:'USD',terms:'Net 45'},same:{id:true,terms:'Manual 5'}});
 eq('Customer: нет совпадений — No customers found; клиента из текста не создаём, Save без выбора не проходит',await act(async()=>{
  const n=await run(()=>{tab='sales';if(soDraft)salesDraftDrop(true);salesOrderNew('order');render();return DB.customer.length;});
  await type('zzqx');const none=await run(()=>document.getElementById('so_cust_list').textContent.trim());await key('Escape');
  const save=await run(()=>{soDraft.customerPo='PO-1';const ok=salesOrderSave();return {ok,err:document.getElementById('e_sales_order').textContent,customerId:soDraft.customerId,customers:DB.customer.length};});
  return {none,ok:save.ok,err:save.err,customerId:save.customerId,same:save.customers===n};
 }),{none:'No customers found',ok:false,err:'Select a Customer',customerId:'',same:true});
 eq('Customer: набор не перерисовывает заказ — то же поле, курсор на месте',await act(async()=>{
  await run(()=>csOpen());await type('greex');await key('ArrowLeft');await key('Backspace');
  const a=await run(()=>{const el=document.getElementById('so_customer');el.dataset.probe='1';return {value:el.value,caret:el.selectionStart,list:csList().length};});
  await p.keyboard.type('n');const b=await run(()=>{const el=document.getElementById('so_customer');return {same:el.dataset.probe==='1',value:el.value,caret:el.selectionStart};});
  await key('Escape');return {a,b,shown:await run(()=>csField().value)};
 }),{a:{value:'grex',caret:3,list:0},b:{same:true,value:'grenx',caret:4},shown:'Atlantic Windows'});
 eq('customer-search без ошибок страницы',t.errs,[]);
 await t.c.close();
};
