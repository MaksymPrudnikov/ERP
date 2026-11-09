/* Аудит Codex 09.11.2026 (F01–F16), проверка и исправления — Claude.
   Сценарии двух компьютеров (F06, F09) — в test/audit-2026-11-08.js рядом с
   C4/C12/C13: там модель сервера. */
module.exports=async function({page,eq}){
 console.log('audit 2026-11-09');
 const t=await page();await require('./optimization-fixture')(t.p);

 /* F01: текст с апострофом в Mark / Notes — целиком, и не становится
    атрибутом поля, в том числе после Save и F5. */
 const id=await t.p.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();tab='sales';salesOrderEdit(id);render();return id;});
 const bad="x' onfocus='window.__auditInjected=1' data-extra='";
 await t.p.locator('input.line-mark').first().fill("O'Brien");
 await t.p.locator('input.line-notes').first().fill(bad);
 await t.p.evaluate(async()=>{salesOrderSave();await storageFlush();});
 await t.p.reload();await t.p.evaluate(()=>storageReady);
 await t.p.evaluate(id=>{tab='sales';salesOrderEdit(id);render();},id);
 await t.p.locator('input.line-notes').first().focus();
 eq('F01: Mark O\'Brien и Notes с апострофами — целиком после Save и F5; лишних атрибутов и кода нет',await t.p.evaluate(id=>{
  const l=salesRecord(id).lines[0],n=document.querySelector('input.line-notes');
  return {mark:l.mark,notes:l.notes,field:document.querySelector('input.line-mark').value,notesField:n.value,attrs:n.hasAttribute('onfocus')||n.hasAttribute('data-extra'),ran:!!window.__auditInjected};
 },id),{mark:"O'Brien",notes:bad,field:"O'Brien",notesField:bad,attrs:false,ran:false});

 /* F02: изменённый поставщик — вопрос при смене раздела Purchasing и в меню
    слева; «нет» — карточка остаётся. */
 eq('F02: изменённый Supplier — вопрос при смене раздела и уходе из Purchasing; «нет» оставляет карточку',await t.p.evaluate(()=>{
  const said=[];const keep=window.confirm;let answer=false;window.confirm=m=>{said.push(m);return answer;};
  try{
   tab='purchasing';purSupplierEdit('');purSupplierDraft.name='Unsaved audit supplier';
   purGo('orders');const stay=[purView,!!purSupplierDraft];
   navGo('sales');const stayNav=[tab,!!purSupplierDraft];
   answer=true;purGo('orders');
   return {said:said.length,stay,stayNav,gone:[purView,purSupplierDraft],stored:DB.supplier.some(s=>s.name==='Unsaved audit supplier')};
  }finally{window.confirm=keep;}
 }),{said:3,stay:['suppliers',true],stayNav:['purchasing',true],gone:['orders',null],stored:false});

 /* F14: F5 / закрытие спрашивают и про формы разделов; запись в фоне — тоже (F13). */
 eq('F14: F5 с изменённым Supplier или Agent — браузер спрашивает; без формы — нет',await t.p.evaluate(()=>{
  const asks=()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;};
  tab='purchasing';purSupplierEdit('');purSupplierDraft.name='Draft supplier';const supplier=asks();purSupplierDraft=null;
  tab='commissions';comEditOpen('');const agent=!!comDraft&&asks();comDraft=null;
  tab='sales';render();return {supplier,agent,none:asks()};
 }),{supplier:true,agent:true,none:false});
 eq('F13: F5 посреди записи — браузер спрашивает; после записи — нет',await t.p.evaluate(async()=>{
  const asks=()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;};
  storageCommand(()=>{DB.customer.push(normalizeCustomer({id:'C-F13',code:'F13',legalName:'F13 write'}));});const during=asks();
  await storageFlush();return {during,after:asks()};
 }),{during:true,after:false});
 await t.c.close();

 /* F04, F05: таблица и быстрый фильтр — свои, мышь и клавиатура одинаково. */
 const u=await page();await require('./optimization-fixture')(u.p);
 await u.p.evaluate(()=>{oqReset();oqOrder(oqCustomer());salesDraftDrop();tab='production';subtab='stations';render();});
 await u.p.locator('[data-sl-scope]').first().click({position:{x:15,y:15}});
 await u.p.locator('#side button[title="Sales"]').focus();await u.p.keyboard.press('Enter');
 eq('F04: клик в таблице станций, Enter на Sales в меню — колонки Sales, а не станций',await u.p.evaluate(()=>({tab,scope:salesListScope(),number:!!document.querySelector('#app th[data-col="number"]')})),
  {tab:'sales',scope:'sales',number:true});
 await u.c.close();
 const v=await page();await require('./optimization-fixture')(v.p);
 await v.p.evaluate(()=>{oqReset();oqOrder(oqCustomer());salesDraftDrop();shippingTab='shipments';tab='sales';render();});
 await v.p.locator('th[data-col="number"] [data-cw-label]').first().click();
 await v.p.locator('.sl-qf').fill('AUDIT-Z');
 await v.p.locator('#side button[title="Shipping"]').click();
 await v.p.waitForTimeout(400);
 const inShipping=await v.p.locator('.sl-qf').count();
 if(inShipping)await v.p.locator('.sl-qf').press('Enter');
 await v.p.evaluate(()=>new Promise(r=>setTimeout(r,50)));
 eq('F05: быстрый фильтр Number начат в Sales, открыт Shipping — поле не переезжает, фильтр у Sales, у Shipping нет',await v.p.evaluate(n=>{
  const sh=Object.entries(salesQueuePrefs).filter(([k,v])=>v&&v.filters&&v.filters.number).map(([k])=>k);
  const was=slScopeNow;slScopeNow='sales';let sales;try{sales=salesListLoadPrefs().filters.number;}finally{slScopeNow=was;}
  return {fieldInShipping:n,otherScopes:sh,sales:sales?sales.conds[0].v:null};
 },inShipping),{fieldInShipping:0,otherScopes:[],sales:'AUDIT-Z'});
 await v.c.close();

 /* F08: отчёт после смены срока оплаты и Sales rep — без F5 и без сброса кэша руками. */
 const r=await page();await require('./optimization-fixture')(r.p);
 eq('F08: срок оплаты перенесли с 5 на 15 ноября — отчёт оплат сразу 15-е / On time',await r.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),id=oqOrder(c);salesDraftDrop();
  DB.receipt.push(normalizeReceipt({id:'CACHE-R',number:'R-0001',customerId:c.id,date:'2026-11-08',amount:100,allocations:[{orderId:id,amount:100}]}));touch();
  const base={paymentMode:'credit',depositPercent:0,creditDays:30,issuedOn:'2026-11-01',dueOn:'2026-11-05'};
  finPersist(()=>finSaveTerms(id,base,'Audit first due date'));
  const pick=()=>repPayOrderFacts().find(x=>x.order===salesRecord(id).businessNumber),a=pick();
  finPersist(()=>finSaveTerms(id,Object.assign({},base,{dueOn:'2026-11-15'}),'Audit corrected due date'));
  const b=pick();return {before:[a.due,a.state],after:[b.due,b.state]};
 }),{before:['2026-11-05','Late'],after:['2026-11-15','On time']});
 eq('F08: Sales rep клиента сменили — факты цеха сразу у нового',await r.p.evaluate(()=>{
  oqReset();const c=oqCustomer({salesRep:'Before Rep'}),id=oqOrder(c);salesDraftDrop();salesSetRecordStatus(id,'verified');salesSetRecordStatus(id,'batched');
  const piece=glassBatchRows([salesRecord(id)]).map(x=>x.piece)[0]||glassPieceMap(id).values().next().value.ids[0];
  stationMove('CUT',stationCheck('CUT',piece),{name:'Audit operator'},{});
  const before=repWorkFacts().find(x=>x.orderId===id).rep;storageCommand(()=>{salesFindCustomer(c.id).salesRep='After Rep';});
  return [before,repWorkFacts().find(x=>x.orderId===id).rep];
 }),['Before Rep','After Rep']);
 await r.c.close();

 /* F10, F11, F12: Excel — показанные строки и итог первой колонки; km — по маршруту. */
 const x=await page();await require('./optimization-fixture')(x.p);
 const seeded=await x.p.evaluate(()=>{
  oqReset();const c=oqCustomer(),id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');
  const make=address=>{const r=shippingCreate({customerId:c.id,method:'delivery',date:finToday(),shipTo:{address1:address},items:shippingAvailable(salesRecord(id)).slice(0,1).map(shippingItem),extras:[]});if(!r.ok)throw new Error(r.error);return r.value;};
  const a=make('Audit Street One'),b=make('Audit Street Two'),t=truckAdd('Audit Truck').value;deliveryAssign(a.id,t.id);
  tab='shipping';shippingTab='delivery';deliveryPill='free';render();
  return {ps:a.id,free:b.number,truckId:t.id,date:a.date};
 });
 eq('F10: Delivery, таблетка Not on a truck — в Excel та же одна PS, что на экране',await x.p.evaluate(()=>{
  const d=salesListExcelData();return {shown:document.querySelectorAll('tr[data-free],tr[data-stop],tr[data-pickup]').length,ps:d.rows.map(r=>r[d.head.indexOf('Packing slip')].v)};
 }),{shown:1,ps:[seeded.free]});
 eq('F11: адрес PS сменили — прежние km «stops changed»; ответ Google про старый маршрут не записывается',await x.p.evaluate(async s=>{
  DB.company.address1='Audit shop';DB.company.city='Audit City';touch();
  window.google={maps:{DirectionsService:class{route(req,cb){const km=req.waypoints.some(w=>String(w.location).includes('Distant'))?20000:10000;if(window.f11Hold){const h=window.f11Hold;window.f11Hold=null;h();}cb({routes:[{legs:[{distance:{value:km}}]}]},'OK');}}}};
  const first=await tripKmCalc(s.date,s.truckId),ps=shippingFind(s.ps);
  shippingUpdate(ps.id,Object.assign({},shippingClone(ps),{shipTo:{address1:'Distant changed address'}}));
  const stops=()=>deliveryStops(s.date,s.truckId),stale=tripKmStale(tripKmFind(s.date,s.truckId),stops()),shown=deliveryKmHTML(s.date,truckFind(s.truckId),stops()).includes('stops changed');
  const recalc=await tripKmCalc(s.date,s.truckId),fresh=!tripKmStale(tripKmFind(s.date,s.truckId),stops());
  /* Адрес меняют, пока Google считает. */
  window.f11Hold=()=>{const p=shippingFind(s.ps);shippingUpdate(p.id,Object.assign({},shippingClone(p),{shipTo:{address1:'Audit Street Three'}}));};
  let late='';try{await tripKmCalc(s.date,s.truckId);}catch(e){late=e.message;}
  return {old:first.km,stale,shown,recalc:recalc.km,fresh,late,kept:tripKmFind(s.date,s.truckId).km,staleNow:tripKmStale(tripKmFind(s.date,s.truckId),stops())};
 },seeded),{old:10,stale:true,shown:true,recalc:20,fresh:true,late:'Stops changed while calculating. Recalculate km.',kept:20,staleNow:true});
 eq('F12: Total первой колонкой — в Excel под ней сумма, «N rows» — в следующей колонке',await x.p.evaluate(()=>{
  tab='sales';salesListMenu=null;slScopePin='';slScopeNow='';render();const p=salesListLoadPrefs(),c=p.cols.find(x=>x.k==='total');c.on=true;p.cols=[c,...p.cols.filter(x=>x.k!=='total')];p.calc.total='sum';render();
  const d=salesListExcelData(),sum=Math.round(d.rows.reduce((s,r)=>s+(r[0]&&r[0].v||0),0)*100)/100;
  return {first:d.head[0],total:d.foot[0].v===sum&&d.foot[0].t,rows:d.foot[1]&&d.foot[1].v};
 }),{first:'Total',total:'n',rows:'1 rows'});
 await x.c.close();

 /* Личный аудит Claude 09.11.2026: Master Data и Users не стирают изменённую
    карточку при смене вкладки молча. */
 const m=await page();await require('./optimization-fixture')(m.p);
 eq('аудит Claude: Master Data — изменённая карточка стекла: вопрос при смене вкладки, «нет» оставляет; без правки — без вопроса',await m.p.evaluate(()=>{
  const said=[];const keep=window.confirm;let answer=false;window.confirm=q=>{said.push(q);return answer;};
  try{
   tab='masterdata';mdSetTab('materials');const g=DB.glassProduct[0];mdGlassEdit(g.id);
   mdSetTab('stations');const quiet=[said.length,mdTab];mdSetTab('materials');mdGlassEdit(g.id);
   mdDraft.name='Edited name';mdSetTab('stations');const stay=[mdTab,mdEdit===g.id,mdDraft&&mdDraft.name];
   answer=true;mdSetTab('stations');return {quiet,said:said.length,stay,gone:[mdTab,mdEdit]};
  }finally{window.confirm=keep;}
 }),{quiet:[0,'stations'],said:2,stay:['materials',true,'Edited name'],gone:['stations',null]});
 eq('аудит Claude: Users — изменённая карточка человека: вопрос при смене Office / Production, «нет» оставляет',await m.p.evaluate(()=>{
  const said=[];const keep=window.confirm;let answer=false;window.confirm=q=>{said.push(q);return answer;};
  try{
   tab='users';subtab='office';userEditOpen(0);usersTab('production');const quiet=[said.length,subtab];
   usersTab('office');userEditOpen(0);uDraft.name='Edited person';usersTab('production');const stay=[subtab,uDraft&&uDraft.name];
   answer=true;usersTab('production');return {quiet,said:said.length,stay,gone:[subtab,uDraft]};
  }finally{window.confirm=keep;}
 }),{quiet:[0,'production'],said:2,stay:['office','Edited person'],gone:['production',null]});
 await m.c.close();
};
