/* Заказ на сотни строк (2.11.2026): строка считается один раз за отрисовку,
   геометрия — один раз на отпечаток, в странице только видимые строки, новая
   строка и полосы над таблицей меняются на месте. Числа те же, что без всего
   этого; всё, что считается по данным, видит и строки, которых нет в странице. */
module.exports=async function({page,eq}){
 console.log('big order');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 await run(()=>{
  window.boOrder=(n,saved)=>{
   const id=oqOrder(oqCustomer());salesOrderEdit(id);
   const a=soDraft.makeups[0];soDraft.lines=[];
   for(let i=0;i<n;i++){const l=normalizeSalesOrderLine({makeupId:a.id,width16:(20+i%9)*16,height16:(30+i%7)*16,qty:1+i%3,mark:'M'+(i+1)});soDraft.lines.push(l);salesEnsureLineShape(l);}
   if(saved){if(!salesOrderSave())throw new Error('not saved');salesDraftDrop();tab='sales';salesOrderEdit(id);}
   else{tab='sales';render();}
   return id;
  };
  window.boRows=()=>[...document.querySelectorAll('.sales-lines-table tbody tr[data-metrics-line-id]')];
  window.boFoot=()=>document.querySelector('[data-lines-foot] [data-foot="qty"]').textContent;
  /* Сколько раз вызвана функция, пока идёт fn. Сверка тестов (GF_SCOPE_CHECK) сама считает по фигуре — на это время выключена. */
  window.boCount=(name,fn)=>{const old=window[name],check=window.GF_SCOPE_CHECK;let n=0;window.GF_SCOPE_CHECK=false;window[name]=function(){n++;return old.apply(this,arguments);};try{fn();}finally{window[name]=old;window.GF_SCOPE_CHECK=check;}return n;};
 });

 eq('цена, вес и статус строки — один расчёт за отрисовку; вне отрисовки считается заново, правка Qty видна сразу',await run(()=>{
  boOrder(6);const l=soDraft.lines[0];
  const one=boCount('salesLinePriceLive',()=>readScope(()=>{salesLineCommercialPrice(l,soDraft);salesLineCommercialPrice(l,soDraft);salesLineCommercialAdjustments(l,soDraft);}));
  const two=boCount('salesLinePriceLive',()=>{salesLineCommercialPrice(l,soDraft);salesLineCommercialPrice(l,soDraft);});
  const weight=boCount('salesLineWeightLive',()=>readScope(()=>{salesLineWeight(l,soDraft);salesLineWeight(l,soDraft);}));
  const render1=boCount('salesLinePriceLive',()=>render());
  const before=readScope(()=>salesLineCommercialPrice(l,soDraft).line);l.qty=l.qty+1;
  const after=readScope(()=>salesLineCommercialPrice(l,soDraft).line),live=salesLineCommercialPrice(l,soDraft).line;
  return {one,two,weight,perLine:render1<=soDraft.lines.length,grew:after>before,same:after===live};
 }),{one:1,two:2,weight:1,perLine:true,grew:true,same:true});

 eq('геометрия несохранённой строки — один раз на отпечаток: галочка и перерисовка не считают фигуры, новый размер считает одну строку, чужая запись — все',await run(()=>{
  boOrder(6);const lines=soDraft.lines,l=lines[1];
  storageInvalidate();render();
  const quiet=boCount('salesMeasureLive',()=>{render();render();});
  const status=boCount('salesLineStatusLive',()=>render());
  const area0=readScope(()=>salesLineAreas(l,soDraft).actual);
  const edit=boCount('salesMeasureLive',()=>{l.width16=l.width16+16;salesSyncShapeFromLine(l);touchScope({shapeDef:[salesShapeByRef(l.shapeRef).id]},true);render();});
  const area1=readScope(()=>salesLineAreas(l,soDraft).actual),live=(()=>{const m=salesMeasureLive(l,soDraft);return m.areas.actual;})();
  const other=boCount('salesMeasureLive',()=>{storageInvalidate();render();});
  return {quiet,status,edit,bigger:area1>area0,same:area1===live,other};
 }),{quiet:0,status:0,edit:1,bigger:true,same:true,other:6});

 eq('Master Data поменяли — статус строки не остаётся старым (кэш сбрасывает любая запись, кроме самих фигур)',await run(()=>{
  boOrder(3);render();const l=soDraft.lines[0];
  const held=boCount('salesLineStatusLive',()=>{storageInvalidate(true);readScope(()=>salesLineServiceStatus(l));});
  const n=boCount('salesLineStatusLive',()=>{storageInvalidate();readScope(()=>salesLineServiceStatus(l));});
  return {held,recount:n};
 }),{held:0,recount:1});

 eq('заказ на 450 строк: в странице начало, остальное по прокрутке; итог, Select all, диапазон и Shift видят все строки',await run(async()=>{
  boOrder(450);const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  window.requestIdleCallback=()=>0;render();render();
  const first=boRows().length,tail=!!document.querySelector('.sales-lines-table [data-list-rest]');
  const qty=soDraft.lines.reduce((s,l)=>s+l.qty,0),foot=boFoot()===String(qty);
  salesToggleAllLines(true);const all=soSelectedLines.size;salesToggleAllLines(false);
  salesRangeInput('from','10');salesRangeInput('to','300');const range=soSelectedLines.size;salesBulkClear();
  soShiftAnchor=null;salesLineCheck({target:{checked:true}},soDraft.lines[5].id);salesLineCheck({shiftKey:true,target:{checked:true}},soDraft.lines[420].id);const shift=soSelectedLines.size;
  render();for(let i=0;i<40&&document.querySelector('[data-list-rest]');i++){window.scrollTo(0,document.documentElement.scrollHeight);await frames();}
  const rows=boRows(),end={rows:rows.length,tail:!!document.querySelector('[data-list-rest]'),picked:rows[300].hasAttribute('data-picked'),out:rows[430].hasAttribute('data-picked'),num:rows[449].querySelector('.line-num').textContent.trim()};
  salesBulkClear();window.scrollTo(0,0);delete window.requestIdleCallback;
  return {few:first<=80,tail,foot,all,range,shift,end};
 }),{few:true,tail:true,foot:true,all:450,range:291,shift:416,end:{rows:450,tail:false,picked:true,out:false,num:'450'}});

 eq('+ Line в недорисованном заказе: строка в странице, курсор в её Qty, итог с новой строкой',await run(async()=>{
  boOrder(450);window.requestIdleCallback=()=>0;render();render();
  const before=boRows().length;salesOrderAddLine(null,true);await new Promise(r=>setTimeout(r,20));
  const rows=boRows(),last=rows[rows.length-1],focus=document.activeElement===last.querySelector('input.line-qty');
  delete window.requestIdleCallback;
  return {few:before<=80,rows:rows.length,lines:soDraft.lines.length,focus,num:last.querySelector('.line-num').textContent.trim()};
 }),{few:true,rows:451,lines:451,focus:true,num:'451'});

 eq('новая строка внизу — на месте: таблица та же, поля выше не тронуты, итоги, фильтры и номер To обновились',await run(async()=>{
  boOrder(5);const table=document.querySelector('.sales-lines-table'),mark=boRows()[2].querySelector('.line-mark');mark.value='typing';
  const renders=boCount('render',()=>salesOrderAddLine(null,false));
  const rows=boRows(),attn=[...document.querySelectorAll('.ss-filter')].map(b=>b.textContent.replace(/\s+/g,' ').trim());
  const qty=soDraft.lines.reduce((s,l)=>s+l.qty,0);
  /* Tab из последнего поля заполненной последней строки — та же дорога, курсор в новой Qty. */
  const end=soDraft.lines.length-1,box=salesLineInputs(boRows()[end]);soDraft.lines[end].width16=480;soDraft.lines[end].height16=480;
  salesLineTab(end,{key:'Tab',shiftKey:false,preventDefault(){},target:box[box.length-1]});await new Promise(r=>setTimeout(r,20));
  const after=boRows(),focus=document.activeElement===after[after.length-1].querySelector('input.line-qty');
  return {renders,same:table===document.querySelector('.sales-lines-table'),kept:boRows()[2].querySelector('.line-mark')===mark&&mark.value==='typing',rows:rows.length,num:rows[5].querySelector('.line-num').textContent.trim(),foot:boFoot()===String(qty+soDraft.lines[6].qty),all:attn.some(x=>x==='All 7'||x==='All 6'),focus,lines:soDraft.lines.length};
 }),{renders:0,same:true,kept:true,rows:6,num:'6',foot:true,all:true,focus:true,lines:7});

 eq('под фильтром новая строка идёт обычной перерисовкой: в отфильтрованной таблице её не появится чужой',await run(()=>{
  boOrder(5);soDraft.lines[1].onHold=true;soDraft.lines[1].holdReason='x';render();salesSetServiceFilter('hold');
  const before=boRows().length,renders=boCount('render',()=>salesOrderAddLine(null,false));
  const shown=boRows().length;salesSetServiceFilter('all');
  return {before,renders,shown,lines:boRows().length};
 }),{before:1,renders:1,shown:1,lines:6});

 eq('первая галочка: полосы меняются на месте, таблица и набранное не тронуты; снятие — так же; один и два Makeup',await run(()=>{
  boOrder(4);let table=document.querySelector('.sales-lines-table');const first=boRows()[0].querySelector('td.line-check input');
  const mark=boRows()[1].querySelector('.line-mark');mark.value='typing';
  const click=b=>b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  click(first);const one={bar:!!document.querySelector('[data-mk-bar] .ss-bulk'),count:document.querySelector('[data-mk-count]').textContent.trim(),picked:boRows()[0].hasAttribute('data-picked')};
  click(first);const off={bar:!!document.querySelector('[data-mk-bar]'),same:table===document.querySelector('.sales-lines-table'),typed:mark.value==='typing',picked:boRows()[0].hasAttribute('data-picked')};
  const a=soDraft.makeups[0],b=JSON.parse(JSON.stringify(a));b.id=salesUid('MU');b.code='B';soDraft.makeups.push(b);render();
  table=document.querySelector('.sales-lines-table');const box=boRows()[0].querySelector('td.line-check input');
  click(box);const two={edge:!!document.querySelector('[data-mk-bar] .ss-bulk'),apply:!!document.querySelector('[data-mk-apply]'),same:table===document.querySelector('.sales-lines-table')};
  click(box);two.gone=!document.querySelector('[data-mk-bar] .ss-bulk');two.bar=!!document.querySelector('[data-mk-bar]');
  return {one,off,two};
 }),{one:{bar:true,count:'1 selected',picked:true},off:{bar:false,same:true,typed:true,picked:false},two:{edge:true,apply:true,same:true,gone:true,bar:true}});

 eq('сохранённый заказ на 450 строк: те же деньги и вес, что по фигурам; строка за строкой',await run(()=>{
  const id=boOrder(450,true),o=salesRecord(id);render();
  const shown=readScope(()=>salesOrderCommercialTotals(o).grand);
  salesMeasureOff++;let live;try{live=salesOrderCommercialTotals(o).grand;}finally{salesMeasureOff--;}
  const foot=boFoot()===String(o.lines.reduce((s,l)=>s+l.qty,0));
  return {same:shown===live,foot,positive:live>0};
 }),{same:true,foot:true,positive:true});

 eq('большой заказ не дал ошибок страницы',t.errs,[]);
 await t.c.close();
};
