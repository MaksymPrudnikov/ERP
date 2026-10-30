/* Copy order (пункт 8; вариант 1 владельца 30.10.2026). Кнопка Copy в шапке и
   пункт Copy в меню Sales — одна команда; «Все копируется на 100 процентов»,
   исполнение — нет; номер — только при Save; заказ и квота — одинаково. */
module.exports=async function({page,eq}){
 console.log('copy order');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main копии нет). */
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const ids=await run(()=>{
  oqReset();
  DB.stockItem.push({id:'STK-CO',type:'stock',name:'CO Door',code:'',thicknessMm:0,salePrice:100,availability:'stock',supplier:'',leadTimeDays:0,subcategory:'door',sellsAsOwnLine:true,active:true});
  const c=oqCustomer({legalName:'Copy Windows Ltd',contacts:[{name:'First',isPrimary:true},{name:'Second'}]});touch();
  window.coBtns=()=>salesDialog?salesDialog.buttons.map(b=>b.label):[];
  window.coClick=()=>{const b=document.querySelector('[data-copy-order]');if(!b)throw new Error('No Copy button');b.click();};
  /* Заказ со всем: контакт, PO, срок, приоритет, Notes, надбавки заказа, склад, ручная цена. */
  window.coFull=()=>{const cu=salesFindCustomer(c.id);
   const id=oqOrder(cu,{customerPo:'GL-2291',dueDate:'2026-11-06',priority:'rush',notes:'Second house',customerContactId:cu.contacts[1].id,surchargeRates:{largeUnit:{value:40}},extraItems:[normalizeSalesExtraItem({table:'stockItem',itemId:'STK-CO',qty:2})]});
   salesOrderEdit(id);soDraft.lines[0].priceManual=150;salesOrderSave();salesDraftDrop();return id;};
  return {c:c.id};
 });

 eq('Copy: кнопка Copy в шапке сразу после Documents у заказа и квоты, у нового — нет; в меню Sales — Copy второй строкой после Open',await run(c=>{
  const cu=salesFindCustomer(c),id=oqOrder(cu),q=oqOrder(cu,{kind:'quote'});
  salesOrderEdit(id);const b=[...document.querySelectorAll('.sales-editor-actions button')].map(x=>x.textContent);
  salesOrderEdit(q);const quote=!!document.querySelector('[data-copy-order]');
  salesOrderNew('order');const fresh=!!document.querySelector('[data-copy-order]');salesDraftDrop(true);
  tab='sales';render();salesListContext(null,id);const menu=[...document.querySelectorAll('.sl-ctx [data-menu]')].slice(0,2).map(x=>x.textContent);salesListCloseMenu();
  return {after:b[b.indexOf('Documents')+1],quote,fresh,menu};
 },ids.c),{after:'Copy',quote:true,fresh:false,menu:['Open','Copy']});

 eq('Copy: копия на 100 % — клиент, контакт, PO, срок, приоритет, Notes, строки, Makeup, формы, склад, цены заказа, ручная цена и надбавки; новые номера записи, строк и фигур; полоса Copy of; в базе ничего не прибавилось',await run(()=>{
  const id=coFull(),src=salesRecord(id),n=DB.salesOrder.length,num=nextSalesOrderNumber();
  tab='sales';salesOrderEdit(id);coClick();const d=soDraft,strip=document.querySelector('[data-copy-strip]');
  const r={edit:soEdit,kind:d.kind,status:d.status,number:d.businessNumber,content:salesQuoteContentKey(d)===salesQuoteContentKey(src),contact:d.customerContactId===src.customerContactId,
   po:d.customerPo,due:d.dueDate,manual:d.lines[0].priceManual,surcharge:d.surchargeRates,items:d.extraItems.map(x=>[x.itemId,x.qty].join()),book:JSON.stringify(d.priceBook)===JSON.stringify(src.priceBook),
   total:finOrderTotals(d).grand===finOrderTotals(src).grand,ids:d.id!==src.id&&d.lines.every((l,i)=>l.id!==src.lines[i].id&&l.shapeRef.id!==src.lines[i].shapeRef.id&&salesShapeByRef(l.shapeRef).ownerLineId===l.id),
   strip:!!strip&&strip.textContent==='Copy of '+src.businessNumber+'Not saved yet',state:document.querySelector('[data-order-state]').textContent,added:DB.salesOrder.length-n,num:nextSalesOrderNumber()===num};
  salesDraftDrop(true);return r;
 }),{edit:'new',kind:'order',status:'new',number:'',content:true,contact:true,po:'GL-2291',due:'2026-11-06',manual:150,surcharge:{largeUnit:{value:40}},items:['STK-CO,2'],book:true,total:true,ids:true,
  strip:true,state:'Unsaved changes',added:0,num:true});

 eq('Copy: исполнение не переносится — отгруженный и оплаченный заказ → копия New без батча, Hold и блокировок, Qty полные; Save — следующий номер, своё стекло, без оплат и отгрузок; исходный не изменился',await run(()=>{
  const id=coFull();oqThrough(id,'done');oqPay(id);const held=coFull();salesRecord(held).onHold=true;salesRecord(held).holdReason='Waiting';touch();
  const before=JSON.stringify(salesRecord(id)),num=nextSalesOrderNumber();
  tab='sales';render();salesListContext(null,id);salesListMenuRun('copy');const d=soDraft,src=salesRecord(id);
  const r={status:d.status,batch:!d.batchNo&&!d.batchHistory.length,locked:d.lines.some(salesLineLocked),readonly:salesOrderReadOnly(d),qty:d.lines.map(l=>l.qty).join()===src.lines.map(l=>l.qty).join(),
   lines:d.lines.every(l=>!l.batchedAt&&!l.batchNo&&!l.onHold&&!l.heldUnits&&!l.cancelledUnits),saved:salesOrderSave()};
  const o=salesRecord(soEdit);salesDraftDrop();
  salesListContext(null,held);salesListMenuRun('copy');const hold=soDraft.onHold;salesDraftDrop(true);
  return Object.assign(r,{number:o.businessNumber===num,glass:glassPieceMap(o.id).size>0&&!glassPieceMap(o.id).has([...glassPieceMap(id).keys()][0]),paid:finOrderBalance(o).paid,shipped:shippingForOrder(o.id).length,hold,same:JSON.stringify(salesRecord(id))===before});
 }),{status:'new',batch:true,locked:false,readonly:false,qty:true,lines:true,saved:true,number:true,glass:true,paid:0,shipped:0,hold:false,same:true});

 eq('Copy: фигуры независимы — правка фигуры копии не меняет исходную, правка исходной — копию',await run(()=>{
  const id=coFull();tab='sales';salesOrderEdit(id);coClick();
  salesShapeByRef(soDraft.lines[0].shapeRef).name='Copy only';salesOrderSave();const copy=soEdit;salesDraftDrop();
  const a=salesShapeByRef(salesRecord(id).lines[0].shapeRef).name;
  salesOrderEdit(id);salesShapeByRef(soDraft.lines[0].shapeRef).name='Source only';soDraft.notes='changed';salesOrderSave();salesDraftDrop();
  return {source:a,copy:salesShapeByRef(salesRecord(copy).lines[0].shapeRef).name,after:salesShapeByRef(salesRecord(id).lines[0].shapeRef).name};
 }),{source:'SO · Kitchen',copy:'Copy only',after:'Source only'});

 eq("Copy: несохранённые правки — окно выхода: Back — копии нет, Don't update — копия с записанного, Update — с правкой; ошибка Update — исходный открыт; у черновика Save as Draft",await run(c=>{
  const id=coFull();tab='sales';
  salesOrderEdit(id);soDraft.notes='edited';coClick();const buttons=coBtns();oqChoose('Back');const back=soEdit===id&&soDraft.notes==='edited';
  coClick();oqChoose("Don't update");const dont=soEdit==='new'&&soDraft.notes==='Second house'&&salesRecord(id).notes==='Second house';salesDraftDrop(true);
  salesOrderEdit(id);soDraft.notes='edited';coClick();oqChoose('Update');const upd=soEdit==='new'&&soDraft.notes==='edited'&&salesRecord(id).notes==='edited';salesDraftDrop(true);
  salesOrderEdit(id);soDraft.customerPo='';coClick();oqChoose('Update');const fail=soEdit===id&&!soCopyOf&&document.getElementById('e_sales_order').textContent;salesDraftDrop(true);
  salesOrderNew('order');salesApplyCustomerDefaults(c);soDraft.lines[0].width16=30*16;soDraft.lines[0].height16=40*16;salesOrderClose();oqChoose('Save as Draft');const dr=DB.salesOrder[DB.salesOrder.length-1].id;
  salesOrderEdit(dr);soDraft.notes='draft note';coClick();const draftButtons=coBtns();oqChoose('Save as Draft');
  const draft={kept:salesRecord(dr).isDraft===true&&salesRecord(dr).notes==='draft note',copy:soEdit==='new'&&soDraft.notes==='draft note'&&!soDraft.isDraft};salesDraftDrop(true);
  return {buttons,back,dont,upd,fail,draftButtons,draft};
 },ids.c),{buttons:['Back',"Don't update",'Update'],back:true,dont:true,upd:true,fail:'Enter the Customer PO.',draftButtons:['Back',"Don't update",'Save as Draft','Save'],draft:{kept:true,copy:true}});

 eq("Copy: выход без сохранения — окно Save the order, Don't save: заказа и номера нет, копии фигур убраны, исходные на месте",await run(()=>{
  const id=coFull(),n=DB.salesOrder.length,shapes=DB.shapeDef.length,num=nextSalesOrderNumber();
  tab='sales';salesOrderEdit(id);coClick();const grew=DB.shapeDef.length-shapes;salesOrderClose();const title=salesDialog&&salesDialog.title;oqChoose("Don't save");
  return {grew,title,added:DB.salesOrder.length-n,shapes:DB.shapeDef.length===shapes,num:nextSalesOrderNumber()===num,source:salesRecord(id).lines.every(l=>!!salesShapeByRef(l.shapeRef)),closed:soDraft===null};
 }),{grew:2,title:'Save the order before leaving?',added:0,shapes:true,num:true,source:true,closed:true});

 eq('Copy: несколько отмеченных строк — копия только той, по которой правая кнопка; повтор Copy при открытой копии — окно, копия одна; Save as Draft копии — черновик со следующим номером',await run(()=>{
  const a=coFull(),b=coFull(),n=DB.salesOrder.length,num=nextSalesOrderNumber();
  tab='sales';render();salesListSel=new Set([a,b]);salesListContext(null,b);salesListMenuRun('copy');const which=soCopyOf&&soCopyOf.id===b,draftId=soDraft.id;
  salesCopyOrder(a);const asked=coBtns().length>0;oqChoose('Back');const one=soDraft.id===draftId&&DB.salesOrder.length===n;
  salesOrderClose();oqChoose('Save as Draft');const o=DB.salesOrder[DB.salesOrder.length-1];
  return {which,asked,one,added:DB.salesOrder.length-n,draft:o.isDraft===true,number:o.businessNumber===num,closed:soDraft===null};
 }),{which:true,asked:true,one:true,added:1,draft:true,number:true,closed:true});

 eq('Copy квоты — так же: новая отдельная квота (своя группа, не отправлена, без срока цен), ревизии исходной не меняются',await run(c=>{
  const q=oqOrder(salesFindCustomer(c),{kind:'quote',notes:'Quote note'});salesQuoteMarkSent([q]);const members=salesQuoteMembers(salesRecord(q)).length;
  tab='sales';salesOrderEdit(q);coClick();const d=soDraft,r={kind:d.kind,status:d.status,sent:d.sentAt,valid:d.validUntil,notes:d.notes,strip:!!document.querySelector('[data-copy-strip]')};
  salesOrderSave();const o=salesRecord(soEdit);salesDraftDrop();
  return Object.assign(r,{number:/^Q-\d+$/.test(o.businessNumber),own:salesQuoteMembers(o).length,members:salesQuoteMembers(salesRecord(q)).length===members,srcSent:salesRecord(q).status});
 },ids.c),{kind:'quote',status:'open',sent:'',valid:'',notes:'Quote note',strip:true,number:true,own:1,members:true,srcSent:'sent'});

 eq('copy-order без ошибок страницы',t.errs,[]);
 await t.c.close();
};
