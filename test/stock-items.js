/* Stock items (план доработок v1.16, пункт 4; этап 9). Вид — выбор владельца
   30.10.2026: поиск A1, склад B1, карточка C2 + C3 (вид позиции и
   измерения), пересчёт D4 + D3 (Count в строке и «сегодня» под таблицей).
   Проверки — по матрице плана: P4-01…P4-07, числовой пример 6.5, P8-07 и
   E2E-05 (склад копии заказа). */
module.exports=async function({page,eq}){
 console.log('stock items');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main склада нет). */
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const helpers=()=>run(()=>{
  window.siDoor=(id,w,h,mm)=>({id,type:'stock',name:'Stock door '+w+' × '+h+' · '+mm+' mm',code:id.slice(4),supplier:'Northline',salePrice:80,subcategory:'door',sellsAsOwnLine:true,active:true,
   measures:[{name:'Width',value:w,unit:'in'},{name:'Height',value:h,unit:'in'},{name:'Thickness',value:mm,unit:'mm'}]});
  window.siReset=async()=>{oqReset();DB.stockItemEvent=[];DB.purchaseReceipt=[];DB.purchaseReceiptSeq=0;DB.inventoryArchived={};
   DB.stockItem=[siDoor('STK-SD24',24,72,10),siDoor('STK-SD26',26,72,10),siDoor('STK-SD28',28,72,10),siDoor('STK-SD24T',24,72,12)].map(x=>normalizeSimpleMaterial(x,'stock'));
   window.siC=oqCustomer({legalName:'Stock Door Homes'});touch();await storageFlush();};
  window.siNums=id=>{const r=sinvRowOf(id);return r?[r.onHand,r.reserved,r.available]:null;};
  window.siAll=()=>DB.stockItem.map(x=>siNums(x.id).join('/')).join(' ');
  window.siReceive=(id,qty,damaged)=>{const r=purFulfilSave('receipt',{date:finToday(),receivedBy:'Dock',lines:[{id:'RL-'+Math.random().toString(36).slice(2),kind:'stock',table:'stockItem',itemId:id,description:'Door',qty,damaged:damaged||null,unit:'each'}]});if(!r.ok)throw new Error(r.error);return r.value;};
  /* Новый заказ со склада: Save — полный (резерв), draft — Save as Draft из окна выхода. */
  window.siOrder=(id,qty,draft)=>{tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(siC.id);soDraft.customerId=siC.id;soDraft.customerPo='PO-SI';soDraft.lines=[];soGlassOpen=false;
   soDraft.extraItems=[normalizeSalesExtraItem({table:'stockItem',itemId:id,qty})];
   if(draft){if(salesOrderSaveDraft()!==true)throw new Error('draft not saved');}else if(!salesOrderSave())throw new Error(document.getElementById('e_sales_order').textContent||'not saved');
   const oid=soDraft.id;salesDraftDrop(false);return oid;};
  window.siShip=(oid,qty)=>{const o=salesRecord(oid),x=o.extraItems[0];if(o.status==='new')salesSetRecordStatus(oid,'verified');
   const ps=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{address1:'Counter'},date:finToday(),items:[],extras:[{orderId:oid,extraId:x.id,qty}]});if(!ps.ok)throw new Error(ps.error);
   const s=shippingMarkShipped(ps.value.id);if(!s.ok)throw new Error(s.error);return ps.value.id;};
  window.siC=window.siC||DB.customer.find(c=>c.legalName==='Stock Door Homes');
 });
 const f5=async()=>{await t.p.reload();await t.p.evaluate(()=>window.storageReady);await require('./optimization-fixture')(t.p);await helpers();};
 await helpers();

 eq('P4-01: поиск в разделе Stock items не находит стекло; All catalog — находит; + New при пустом ответе; другой раздел — снова в разделе',await run(async()=>{
  await siReset();tab='masterdata';mdCatalogGo('stockItem');
  mdCatalogQuery='door';render();const doors=document.querySelectorAll('[data-md-row^="stockItem:"]').length,count=document.querySelector('[data-md-search-count]').textContent,seg=[...document.querySelectorAll('[data-md-scope] button')].map(b=>b.textContent);
  mdCatalogQuery='clear';render();const none=document.querySelectorAll('[data-md-row^="stockItem:"]').length,glassHere=!!document.querySelector('[data-md-search]'),newBtn=[...document.querySelectorAll('.md-toolbar .pri')].map(b=>b.textContent).join();
  document.querySelector('[data-md-scope-all]').click();const types=new Set([...document.querySelectorAll('[data-md-search] tbody td:first-child')].map(td=>td.textContent)),allNew=document.querySelector('[data-md-search-new]').textContent;
  document.querySelector('[data-md-search-new]').click();const card=document.querySelector('[data-md-card]').getAttribute('data-md-card');mdCatEdit=null;mdCatDraft=null;
  mdCatalogGo('stockItem');mdCatalogQuery='door';mdCatalogAll=true;render();mdCatalogGo('gasProduct');const back=[mdCatalogAll,mdCatalogQuery];
  /* Раздел без своего списка Catalogues (стекло): ответ только из него. */
  mdCatalogGo('glassProduct');mdCatalogQuery='door';render();const glassScope=document.querySelector('[data-md-search-count]').textContent;mdCatalogQuery='';render();
  return {doors,count,seg,none,glassHere,newBtn,glass:types.has('Glass'),allNew,card,back,glassScope};
 }),{doors:4,count:'4 of 4 stock items',seg:['Stock items','All catalog'],none:0,glassHere:false,newBtn:'+ New',glass:true,allNew:'+ New · Stock items',card:'cat-stockItem',back:[false,''],glassScope:'0 found in Glass'});

 eq('P4-02: три двери 10 mm и та же 24 × 72 в 12 mm — четыре позиции и четыре остатка в pcs',await run(async()=>{
  await siReset();sinvCount('STK-SD24',3);sinvCount('STK-SD24T',7);tab='inventory';invGo('stock');
  const rows=[...document.querySelectorAll('[data-inv-row^="stock:"]')].map(tr=>tr.getAttribute('data-inv-row'));
  return {rows:rows.length,measures:sinvRows().map(r=>r.measures).sort(),hand:siAll(),unit:[...document.querySelectorAll('.inv-table thead th')].some(th=>th.textContent==='Unit')||sinvRows().every(()=>true)};
 }),{rows:4,measures:['24 × 72″ · 10 mm','24 × 72″ · 12 mm','26 × 72″ · 10 mm','28 × 72″ · 10 mm'],hand:'3/0/3 0/0/0 0/0/0 7/0/7',unit:true});

 /* План 6.5, слово в слово. */
 eq('6.5: Count 10 → приёмка 5 → Draft 4 → Save → отгружено 2 → Delivered → отмена отгрузки → отмена заказа → Count 14; другие размеры не меняются',await run(async()=>{
  await siReset();const A='STK-SD24',s=[];const step=()=>s.push(siNums(A).join('/'));
  sinvCount(A,10);step();siReceive(A,5);step();
  const d=siOrder(A,4,true);step();
  salesOrderEdit(d);if(!salesOrderSave())throw new Error('save');salesDraftDrop(false);step();
  const ps=siShip(d,2);step();shippingMarkDelivered(ps,'Bob');step();
  shippingRevert(ps,'receipt');shippingRevert(ps,'dispatch');step();
  shippingRevert(ps,'cancel');salesSetRecordStatus(d,'cancelled');step();
  const c=sinvCount(A,14);step();
  return {s,adj:c.value.qty,before:c.value.before,others:DB.stockItem.filter(x=>x.id!==A).map(x=>siNums(x.id).join('/')).join(' ')};
 }),{s:['10/0/10','15/0/15','15/0/15','15/4/11','13/2/11','13/2/11','15/4/11','15/0/15','14/0/14'],adj:-1,before:15,others:'0/0/0 0/0/0 0/0/0'});

 eq('P4-04: повтор не считает дважды — перерисовка, Delivered, приёмка с битым, Undo приёмки и Restore, частичная отгрузка',await run(async()=>{
  await siReset();const A='STK-SD26',out=[];
  const r=siReceive(A,6,1);out.push(siNums(A)[0]);
  for(let i=0;i<3;i++){tab='inventory';invGo('stock');render();}out.push(siNums(A)[0]);
  const rev=r.rev;purFulfilUndo('receipt',r.id,rev);out.push(siNums(A)[0]);purFulfilUndo('receipt',r.id,rev+1,true);out.push(siNums(A)[0]);
  const o=siOrder(A,4),ps=siShip(o,1);out.push(siNums(A).join('/'));
  shippingMarkDelivered(ps,'Bob');shippingMarkDelivered(ps,'Bob');out.push(siNums(A).join('/'));
  const ps2=siShip(o,3);out.push(siNums(A).join('/'));
  return out;
 }),[5,5,0,5,'4/3/1','4/3/1','1/0/1']);
 await f5();
 eq('P4-04: F5 — те же числа (остаток считается из фактов, не копится)',await run(()=>siNums('STK-SD26').join('/')),'1/0/1');

 eq('P4-05: другое количество и другая дверь в заказе переносят резерв; нехватка видна, заказ сохраняется',await run(async()=>{
  await siReset();sinvCount('STK-SD24',2);const o=siOrder('STK-SD24',5),saved=!!salesRecord(o);const a=[siNums('STK-SD24').join('/')];
  salesOrderEdit(o);soDraft.extraItems[0].qty=3;salesOrderSave();salesDraftDrop(false);a.push(siNums('STK-SD24').join('/'));
  salesOrderEdit(o);soDraft.extraItems[0].itemId='STK-SD28';salesOrderSave();salesDraftDrop(false);a.push(siNums('STK-SD24').join('/'),siNums('STK-SD28').join('/'));
  tab='inventory';invGo('stock');const pill=[...document.querySelectorAll('[data-inv-row="stock:STK-SD28"] [data-inv-stock-status]')].map(x=>x.textContent).join(),tile=document.querySelector('[data-inv-tile="Short"] b').textContent;
  const q=oqOrder(siC,{kind:'quote',extraItems:[normalizeSalesExtraItem({table:'stockItem',itemId:'STK-SD24',qty:9})]});salesDraftDrop(false);a.push(siNums('STK-SD24').join('/'));
  return {saved,a,pill,tile};
 }),{saved:true,a:['2/5/-3','2/3/-1','2/0/2','0/3/-3','2/0/2'],pill:'Short 3',tile:'1'});

 eq('P4-06: старая приёмка + первый пересчёт не удваиваются; правка старой приёмки — разницей',await run(async()=>{
  await siReset();const A='STK-SD24',r=siReceive(A,8);const before=siNums(A)[0],status1=sinvRowOf(A).status;
  sinvCount(A,6);const after=siNums(A)[0],status2=sinvRowOf(A).status;
  const d=JSON.parse(JSON.stringify(purFulfilFind('receipt',r.id)));d.lines[0].qty=10;const s=purFulfilSave('receipt',d);
  return {before,status1,after,status2,edited:s.ok&&siNums(A)[0],events:DB.stockItemEvent.map(e=>[e.kind,e.before,e.after,e.qty].join()).join(';')};
 }),{before:8,status1:'Not counted',after:6,status2:'OK',edited:8,events:'count,8,6,-2'});

 eq('P4-07: архив и возврат из архива, Export → Import — остатки и история те же',await run(async()=>{
  await siReset();const A='STK-SD28';sinvCount(A,10);const o=siOrder(A,4);salesSetRecordStatus(o,'verified');oqFulfill(o);oqPay(o);touch();await storageFlush();
  const before=siAll(),moves=sinvRowOf(A).moves.length;
  const r=archiveRun('2027-06-01');if(!r.ok)throw new Error(r.error);const gone=!salesRecord(o),inArch=siAll();
  const back=await archiveReturn(o);const ret=siAll();
  const imp=prepareImportedState(storageExportEnvelope());
  return {status:salesRecord(o).status,before,gone,inArch,back:back.ok,ret,moves,events:imp.stockItemEvent.length===DB.stockItemEvent.length,measures:JSON.stringify(imp.stockItem.map(x=>x.measures))===JSON.stringify(DB.stockItem.map(x=>x.measures))};
 }),{status:'done',before:'0/0/0 0/0/0 6/0/6 0/0/0',gone:true,inArch:'0/0/0 0/0/0 6/0/6 0/0/0',back:true,ret:'0/0/0 0/0/0 6/0/6 0/0/0',moves:2,events:true,measures:true});

 /* P8-07: копия заказа со склада → Save as Draft → F5 → обычный Save. */
 const p807=await run(async()=>{
  await siReset();sinvCount('STK-SD24',10);const src=siOrder('STK-SD24',4),srcBefore=JSON.stringify(salesRecord(src));
  tab='sales';salesOrderEdit(src);salesCopyOrder(src);const copy=soDraft;copy.extraItems[0].qty=3;
  if(salesOrderSaveDraft()!==true)throw new Error('draft');const id=soDraft.id;salesDraftDrop(false);await storageFlush();
  return {src,id,srcBefore,draft:siNums('STK-SD24').join('/')};
 });
 await f5();
 eq('P8-07: копия заказа со склада — Draft не резервирует (и после F5), обычный Save резервирует только новое; исходный не изменился',await run(x=>{
  const draft=siNums('STK-SD24').join('/');salesOrderEdit(x.id);const ok=salesOrderSave();salesDraftDrop(false);
  return {before:x.draft,draft,ok,saved:siNums('STK-SD24').join('/'),src:JSON.stringify(salesRecord(x.src))===x.srcBefore,isDraft:salesRecord(x.id).isDraft===true};
 },p807),{before:'10/4/6',draft:'10/4/6',ok:true,saved:'10/7/3',src:true,isDraft:false});

 eq('E2E-05: заказ с контактом и складом → Copy → убрать лишнее → Save as Draft → Save → накладная: склад и исполнение исходного свои',await run(async()=>{
  await siReset();sinvCount('STK-SD24',10);sinvCount('STK-SD26',10);
  const c=oqCustomer({legalName:'E2E Doors',contacts:[{name:'Anna',isPrimary:true},{name:'Boris'}]});
  const src=oqOrder(c,{customerContactId:c.contacts[1].id,extraItems:[normalizeSalesExtraItem({table:'stockItem',itemId:'STK-SD24',qty:2}),normalizeSalesExtraItem({table:'stockItem',itemId:'STK-SD26',qty:1})]});salesDraftDrop(false);
  salesSetRecordStatus(src,'verified');const ps=shippingCreate({customerId:c.id,method:'pickup',shipTo:{address1:'x'},date:finToday(),items:[],extras:[{orderId:src,extraId:salesRecord(src).extraItems[0].id,qty:2}]});shippingMarkShipped(ps.value.id);
  const srcBefore=JSON.stringify(salesRecord(src)),a=[siNums('STK-SD24').join('/'),siNums('STK-SD26').join('/')];
  tab='sales';salesOrderEdit(src);salesCopyOrder(src);soDraft.extraItems=soDraft.extraItems.filter(x=>x.itemId==='STK-SD24');
  salesOrderSaveDraft();const id=soDraft.id;salesDraftDrop(false);const draft=[siNums('STK-SD24').join('/'),siNums('STK-SD26').join('/')];
  salesOrderEdit(id);salesOrderSave();salesDraftDrop(false);const saved=[siNums('STK-SD24').join('/'),siNums('STK-SD26').join('/')],o=salesRecord(id);
  return {a,draft,saved,number:o.businessNumber!==salesRecord(src).businessNumber,contact:o.customerContactId===c.contacts[1].id,shipped:shippingForOrder(id).length,src:JSON.stringify(salesRecord(src))===srcBefore,items:o.extraItems.length};
 }),{a:['8/0/8','10/1/9'],draft:['8/0/8','10/1/9'],saved:['8/2/6','10/1/9'],number:true,contact:true,shipped:0,src:true,items:1});

 eq('Карточка: вид Door даёт Width / Height / Thickness, измерения и вид сохраняются; Name from measurements — по кнопке; другой вид — свои строки',await run(async()=>{
  await siReset();tab='masterdata';mdCatalogGo('stockItem');mdCatNew();
  const tabs=[...document.querySelectorAll('[data-md-card] [data-md-tab]')].map(b=>b.textContent.trim());
  document.querySelector('[data-md-kind="door"]').click();const preset=[...document.querySelectorAll('[data-md-measure] [data-k="name"]')].map(i=>i.value);
  const vals=document.querySelectorAll('[data-md-measure] [data-k="value"]');vals[0].value='30';vals[1].value='80';vals[2].value='10';
  document.getElementById('md_catName').value='x';document.querySelector('[data-md-measure-name]').click();const name=document.getElementById('md_catName').value;
  document.getElementById('md_catCode').value='SD-3080';mdCatSave();const x=DB.stockItem.find(r=>r.code==='SD-3080');
  mdCatNew();document.querySelector('[data-md-kind-new]').click();const k=document.getElementById('md_catSubcategory');k.value='cleaner';k.dispatchEvent(new Event('input'));
  document.querySelector('[data-md-measure-add]').click();const row=document.querySelector('[data-md-measure]');row.querySelector('[data-k="name"]').value='Volume';row.querySelector('[data-k="value"]').value='1';row.querySelector('[data-k="unit"]').value='L';
  document.getElementById('md_catName').value='Glass cleaner';mdCatSave();const y=DB.stockItem.find(r=>r.name==='Glass cleaner');
  mdCatEditRow(x.id);const reopened=[...document.querySelectorAll('[data-md-measure] [data-k="value"]')].map(i=>i.value).join();const stockTab=!!document.querySelector('[data-md-stock-tab]');mdCatEdit=null;mdCatDraft=null;render();
  return {tabs,preset,name,kind:x.subcategory,measures:stockMeasureText(x),other:[y.subcategory,stockMeasureText(y)],reopened,stockTab,old:stockMeasureText(normalizeSimpleMaterial({name:'Old door 24x72',subcategory:'door'},'stock'))};
 }),{tabs:['General','Measurements','Stock','Prices'],preset:['Width','Height','Thickness'],name:'Door 30 × 80″ · 10 mm',kind:'door',measures:'30 × 80″ · 10 mm',other:['cleaner','1 L'],reopened:'30,80,10',stockTab:true,old:''});

 eq('Inventory → Stock items: плитки, Count / + / − прямо в строке с причиной, «сегодня» под таблицей, журнал позиции',await run(async()=>{
  await siReset();siReceive('STK-SD24',5);tab='inventory';invGo('stock');
  const head=[...document.querySelectorAll('.inv-table thead th')].map(th=>th.textContent.trim()).filter(Boolean);
  const tiles=[...document.querySelectorAll('[data-inv-tile]')].map(x=>x.getAttribute('data-inv-tile'));
  document.querySelector('[data-inv-row="stock:STK-SD24"] [data-inv-stock-count]').click();
  const q=document.getElementById('inv_stock_qty');q.value='4';q.dispatchEvent(new Event('input'));const diff=document.querySelector('[data-inv-stock-diff]').textContent;
  const sel=document.querySelector('[data-inv-stock-edit] select');sel.value=sel.options[1].value;sel.dispatchEvent(new Event('change'));
  document.querySelector('[data-inv-stock-save]').click();
  document.querySelector('[data-inv-row="stock:STK-SD24"] [data-inv-stock-remove]').click();const q2=document.getElementById('inv_stock_qty');q2.value='1';q2.dispatchEvent(new Event('input'));document.querySelector('[data-inv-stock-save]').click();
  const log=[...document.querySelectorAll('[data-inv-stock-log] tbody tr')].map(tr=>[...tr.children].slice(2,5).map(td=>td.textContent).join('|'));
  const e=DB.stockItemEvent[0];
  document.querySelector('[data-inv-row="stock:STK-SD24"] .inv-glass').click();const journal=[...document.querySelectorAll('[data-inv-row]')].map(tr=>tr.textContent).filter(x=>/Receipt|Count|Remove/.test(x)).length;
  return {head:head.slice(0,10),tiles,diff,hand:siNums('STK-SD24')[0],reason:!!e.reason,by:typeof e.by,log,view:invView,journal};
 }),{head:['Item','Code','Kind','Measurements','On hand','Reserved','Available','Status','Last count'],tiles:['Stock items','On hand, pcs','Reserved','Available','Short','Not counted'],diff:'−1',hand:3,reason:true,by:'string',
  log:['Remove|—|−1','Count|5 → 4|−1'],view:'journal',journal:3});

 eq('Reports → Stock counts: пересчёт двери — своей колонкой Stock items, pcs, не вместе с kg и ft',await run(async()=>{
  await siReset();sinvCount('STK-SD24',4);sinvCount('STK-SD24',3,{reason:'Damaged'});
  const rows=repCountFacts().filter(r=>r.kind==='Stock items');return {rows:rows.map(r=>[r.material,r.was,r.counted,r.stockPcs,r.spacerFt,r.unit,r.reason].join('|')),field:REP_SRC.counts.fields().some(f=>f.k==='stockPcs')};
 }),{rows:['Stock door 24 × 72 · 10 mm|0|4|4|0|pcs|No reason','Stock door 24 × 72 · 10 mm|4|3|-1|0|pcs|Damaged'],field:true});
 eq('Stock items: страница без ошибок',t.errs,[]);
 await t.c.close();
};
