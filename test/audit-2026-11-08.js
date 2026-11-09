/* Аудит Codex 08.11.2026 «деньги и сохранность данных» (C1–C13), проверка и
   исправления — Claude. Сценарии — сценарии Codex: каждый был красным на
   a02e20cc. Сервер — модель erp_apply из tools/supabase/schema.sql (версии
   строк, номера документов, Save частями — grp и erp_stage), два компьютера
   — два контекста браузера со своими базами. */
module.exports=async function({page,eq}){
 console.log('audit 2026-11-08');
 const NO_CHARGES={energy:{enabled:false},hst:{enabled:false},card:{enabled:false},delivery:{enabled:false},skidDeposit:{enabled:false}};
 /* Помощники в странице: клиент, выданный заказ на $100 одной позицией склада. */
 const helpers=async p=>p.evaluate(nc=>{
  window.a8Cust=(id,extra)=>{const c=normalizeCustomer(Object.assign({id,code:id.slice(-6),legalName:'Audit '+id,paymentMode:'credit',creditDays:30},extra));storageCommand(()=>{DB.customer.push(c);});return c;};
  window.a8Order=(id,cid,number,day,status)=>{storageCommand(()=>{const o=normalizeSalesOrder({id,businessNumber:number,customerId:cid,customerPo:'PO-'+number,createdAt:(day||'2026-08-01')+'T12:00:00Z',lines:[],extraItems:[{id:'E-'+id,table:'stockItem',itemId:'TEST',qty:1,priceOverride:100}],orderCharges:JSON.parse(JSON.stringify(nc))});
   o.status=status||'done';o.statusDates={done:(day||'2026-08-01')+'T12:00:00Z'};DB.salesOrder.push(o);finCaptureTerms(o);});return id;};
  window.a8Pay=(cid,date,amount,alloc)=>{const r=finPersist(()=>finSaveReceiptRecord({customerId:cid,date,method:'cash',currency:'CAD',amount,allocations:alloc||[]}));if(!r.ok)throw new Error(r.error);return r.value;};
  window.a8Backup=()=>{try{prepareImportedState(storageExportEnvelope());return '';}catch(e){return e.message;}};
  window.a8Wait=async ms=>{await new Promise(r=>setTimeout(r,ms||400));await storageFlush();};
 },NO_CHARGES);

 /* ---------------- один компьютер ---------------- */
 const t=await page();await helpers(t.p);

 eq('C10: R-9999 и R-10000 в один день — «остаток после» по порядку номеров, а не строк',await t.p.evaluate(async()=>{
  const c=a8Cust('C-ROLL');a8Order('SO-ROLL',c.id,'99400','2026-11-01','new');
  storageCommand(()=>{DB.receipt.push(normalizeReceipt({id:'RCPT-OLD',customerId:c.id,number:'R-9998',date:'2026-01-01',amount:1,voided:true,voidReason:'Earlier'}));});
  const a=a8Pay(c.id,finToday(),50,[{orderId:'SO-ROLL',amount:50}]),b=a8Pay(c.id,finToday(),50,[{orderId:'SO-ROLL',amount:50}]);
  return [a,b].map(r=>r.number+' '+finReceiptModel(r.id).rows[0].cells[4]);
 }),['R-9999 $50.00','R-10000 $0.00']);

 eq('C11: возврат ушёл в архив — новый возврат RF-0002, а не второй RF-0001; после F5 так же',await (async()=>{
  const out=await t.p.evaluate(async()=>{
   const c=a8Cust('C-RFSEQ');a8Order('SO-RFSEQ',c.id,'99401');
   const r1=a8Pay(c.id,'2026-08-02',200,[{orderId:'SO-RFSEQ',amount:100}]);
   const f1=finPersist(()=>finCreateRefund({receiptId:r1.id,date:'2026-08-03',amount:100,method:'cash',reason:'Old excess'}));
   archiveRun('2026-11-08');await storageFlush();
   const r2=a8Pay(c.id,finToday(),100);const f2=finPersist(()=>finCreateRefund({receiptId:r2.id,date:finToday(),amount:100,method:'cash',reason:'New'}));await storageFlush();
   return [f1.value.number,f2.value.number,DB.archiveFloor.refund];
  });
  await t.p.reload();await t.p.evaluate(()=>storageReady);await helpers(t.p);
  return out.concat(await t.p.evaluate(()=>finStatementLines('C-RFSEQ').lines.filter(x=>x.kind==='refund').map(x=>x.doc)));
 })(),['RF-0001','RF-0002',1,'RF-0001','RF-0002']);

 eq('C5: у клиента все заказы в архиве — Delete запрещён, выписка открывается',await t.p.evaluate(async()=>{
  const c=a8Cust('C-ARCHDEL');a8Order('SO-ARCHDEL',c.id,'99003');a8Pay(c.id,'2026-08-02',100,[{orderId:'SO-ARCHDEL',amount:100}]);
  archiveRun('2026-11-08');await storageFlush();
  const live=['salesOrder','receipt','financeTerms','financeEvent'].some(k=>DB[k].some(x=>x.customerId===c.id));
  const was=window.alert;let said='';window.alert=m=>{said=m;};customerDelete(c.id);window.alert=was;await storageFlush();
  return {live,refs:customerHasReferences(c.id),said:/archive the customer/.test(said),exists:!!salesFindCustomer(c.id),statement:!!finStatementModel(c.id,'','')};
 }),{live:false,refs:true,said:true,exists:true,statement:true});

 eq('C1: Void квитанции, лежащей на заказе в архиве, — заказ в работе и должен $100 (Accounts, Overdue), после F5 так же',await (async()=>{
  const now=await t.p.evaluate(async()=>{
   const c=a8Cust('C-VOID');a8Order('SO-VOID',c.id,'99001');const r=a8Pay(c.id,'2026-08-02',200,[{orderId:'SO-VOID',amount:100}]);
   archiveRun('2026-11-08');await storageFlush();const archived=!!archiveKnown('SO-VOID')&&!salesRecord('SO-VOID');
   /* Команда без экрана — отказ, ничего не меняется. */
   const raw=finPersist(()=>finVoidReceipt(r.id,'Bounced'));
   tab='finance';finOpenReceipt(r.id);const was=window.prompt;window.prompt=()=>'Bounced cheque';finVoidCurrent();window.prompt=was;await a8Wait(800);
   const m=finCustomerMoney(c.id);
   return {archived,raw:raw.ok?'ok':raw.error,voided:DB.receipt.find(x=>x.id===r.id).voided,back:!!salesRecord('SO-VOID')&&!archiveKnown('SO-VOID'),balance:m.balance,overdue:m.overdue,open:finAccountOpen(finAccountMetrics(c)),statement:finStatementData(c.id,'','').closing};
  });
  await t.p.reload();await t.p.evaluate(()=>storageReady);await helpers(t.p);
  return Object.assign(now,{f5:await t.p.evaluate(()=>finCustomerMoney('C-VOID').balance)});
 })(),{archived:true,raw:'Order 99001 is archived. Open it first.',voided:true,back:true,balance:100,overdue:100,open:true,statement:100,f5:100});

 eq('C1: Unallocate связи с заказом в архиве (окно Allocate) — заказ возвращается в работу с долгом',await t.p.evaluate(async()=>{
  const c=a8Cust('C-UNAL');a8Order('SO-UNAL',c.id,'99002');a8Pay(c.id,'2026-08-02',150,[{orderId:'SO-UNAL',amount:100}]);
  archiveRun('2026-11-08');await storageFlush();
  finOpenAllocate(c.id);finAllocUnlink(DB.receipt.find(r=>r.customerId===c.id).id,'SO-UNAL');await a8Wait(800);finAlloc=null;
  return {back:!!salesRecord('SO-UNAL'),balance:finOrderBalance(salesRecord('SO-UNAL')).balance,deposit:finCustomerDeposit(c.id)};
 }),{back:true,balance:100,deposit:150});

 eq('C9: две квитанции? нет — одна общая на два заказа из архива: вернуть A, затем B до отправки — одна квитанция, баланс 0, F5 и Import',await (async()=>{
  const now=await t.p.evaluate(async()=>{
   const c=a8Cust('C-SHARE');a8Order('SO-SH-A',c.id,'99300');a8Order('SO-SH-B',c.id,'99301');
   a8Pay(c.id,'2026-08-02',200,[{orderId:'SO-SH-A',amount:100},{orderId:'SO-SH-B',amount:100}]);
   archiveRun('2026-11-08');await storageFlush();
   /* Сервер ещё отдаёт общую квитанцию из архива: возврат A не отправлен. */
   const serverCold=await storageIdbColdAll(),keep={on:cloudSync.on,loaded:cloudSync.loaded,rpc:cloudRpc};
   Object.assign(cloudSync,{on:true,loaded:true});cloudRpc=async(n,a)=>{if(n==='erp_cold_of')return serverCold.filter(r=>r.owners.some(o=>a.owners.includes(o)));throw new Error(n);};
   try{await archiveReturn('SO-SH-A');await storageFlush();await archiveReturn('SO-SH-B');await storageFlush();}
   finally{Object.assign(cloudSync,{on:keep.on,loaded:keep.loaded,out:[]});cloudRpc=keep.rpc;}
   return {receipts:DB.receipt.filter(r=>r.customerId===c.id).length,paid:[finOrderPaid('SO-SH-A').paid,finOrderPaid('SO-SH-B').paid],statement:finStatementData(c.id,'','').closing,backup:a8Backup()};
  });
  await t.p.reload();await t.p.evaluate(()=>storageReady);await helpers(t.p);
  return Object.assign(now,{f5:await t.p.evaluate(()=>DB.receipt.filter(r=>r.customerId==='C-SHARE').length)});
 })(),{receipts:1,paid:[100,100],statement:0,backup:'',f5:1});

 eq('C7: QuickBooks уже выгружали — заказ с невыгруженными счётом и оплатой ждёт выгрузки; до первой выгрузки архив как раньше',await t.p.evaluate(async()=>{
  const c=a8Cust('C-QB');a8Order('SO-QB1',c.id,'99200','2026-10-07');a8Pay(c.id,'2026-10-07',100,[{orderId:'SO-QB1',amount:100}]);
  const pending=()=>finExportPending().filter(x=>x.kind==='invoice'?x.x.id==='SO-QB1':(x.x.allocations||[]).some(a=>a.orderId==='SO-QB1')).length;
  const before=pending();
  storageCommand(()=>{DB.financeExportBatch.push({batch:1,at:new Date().toISOString(),name:'quickbooks_audit.csv',csv:''});});
  archiveRun('2026-11-08');await storageFlush();const held=!!salesRecord('SO-QB1')&&pending();
  const out=finPersist(()=>finExportMark(finExportPending()));archiveRun('2026-11-09');await storageFlush();
  const gone=!salesRecord('SO-QB1')&&!!archiveKnown('SO-QB1');
  storageCommand(()=>{DB.financeExportBatch=[];DB.financeExport=[];});
  const c2=a8Cust('C-QB2');a8Order('SO-QB2',c2.id,'99201','2026-10-07');a8Pay(c2.id,'2026-10-07',100,[{orderId:'SO-QB2',amount:100}]);
  archiveRun('2026-11-10');await storageFlush();
  return {before,held,exported:out.ok,gone,noExportYet:!salesRecord('SO-QB2')};
 }),{before:2,held:2,exported:true,gone:true,noExportYet:true});

 await t.c.close();

 /* ---------------- C2: смена валюты оплаченного заказа ---------------- */
 const cur=await page();await require('./optimization-fixture')(cur.p);await helpers(cur.p);
 eq('C2: оплаченный CAD-заказ стал USD — $100 CAD на счёте клиента, связи CAD↔USD нет, своя выгрузка импортируется и после F5',await (async()=>{
  const now=await cur.p.evaluate(()=>{
   oqReset();const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();window.a8Id=id;a8Pay(c.id,finToday(),100,[{orderId:id,amount:100}]);
   salesOrderEdit(id);return {before:a8Backup()};
  });
  await cur.p.locator('select[onchange^="soDraft.currency="]').selectOption('USD');
  return Object.assign(now,await cur.p.evaluate(async()=>{
   const saved=salesOrderSave();await storageFlush();const o=salesRecord(a8Id);
   const r=DB.receipt.find(x=>x.customerId===o.customerId);
   return {saved,currency:o.currency,paid:finOrderPaid(o.id).paid,deposit:finCustomerDeposit(o.customerId),alloc:r.allocations.length,journal:finHistoryFor(r.id).some(e=>e.kind==='released'),after:a8Backup()};
  }));
 })(),{before:'',saved:true,currency:'USD',paid:0,deposit:100,alloc:0,journal:true,after:''});
 await cur.c.close();

 /* ---------------- сервер: модель erp_apply ---------------- */
 /* Модель сервера в Node: версии строк, номера документов, Save частями. */
 function server(records){
  const rec=new Map(records.map(r=>[r.tbl+'|'+r.id,r])),log=[],cmds=new Map(),counter={},stage=new Map();let rev=2;
  const s={rec,calls:[],fail:null,
   rpc(name,a){
    if(s.fail&&s.fail(name,a))throw new Error('No connection to the server.');
    if(name==='erp_apply'){
     if(cmds.has(a.command_id))return cmds.get(a.command_id);
     const done=res=>{cmds.set(a.command_id,res);return res;};
     if(a.grp&&a.grp.total>1){
      const st=stage.get(a.grp.id)||[];
      if(a.grp.part<a.grp.total-1){st[a.grp.part]=a;stage.set(a.grp.id,st);s.calls.push({staged:a.changes.length});return done({ok:true,staged:true});}
      stage.delete(a.grp.id);if(st.filter(Boolean).length!==a.grp.total-1)return done({ok:false,conflict:[],lost:true});
      a=Object.assign({},a,{expect:st.flatMap(x=>x.expect).concat(a.expect),changes:st.flatMap(x=>x.changes).concat(a.changes)});
     }
     const conflict=a.expect.filter(e=>{const r=rec.get(e.tbl+'|'+e.id);return (r&&!r.deleted?r.ver:0)!==(e.ver||0);});
     s.calls.push({rows:a.changes.length,expect:[...new Set(a.expect.map(e=>e.tbl))],conflict:conflict.length});
     if(conflict.length)return done({ok:false,conflict});
     const vers={},numbers={},swap=[];
     a.changes.forEach(x=>{if(!x.number||x.data===null)return;const n=x.number,no=Math.max(counter[n.name]||0,+n.value.slice(n.prefix.length));counter[n.name]=no+1;
      const v=n.prefix+String(no).padStart(n.pad||0,'0');numbers[x.tbl+'|'+x.id]=v;if(v!==n.value)swap.push([n.value,v]);});
     a.changes.forEach(x=>{let d=x.data;if(d!==null&&swap.length){const keys='businessNumber|number|no|order|orderNumber|ps|doc|before|after'+(x.tbl==='orderEvent'?'|note':'');
      swap.forEach(([o],i)=>{d=d.replace(new RegExp('("(?:'+keys+')"\\s*:\\s*|[\\[,]\\s*)"'+o+'"(?=\\s*[,\\]}])','g'),'$1"#'+i+'#"');});swap.forEach(([,v],i)=>{d=d.split('"#'+i+'#"').join('"'+v+'"');});}
      const ver=++rev,r=Object.assign({},x,{data:d,deleted:d===null,ver});rec.set(x.tbl+'|'+x.id,r);log.push(r);vers[x.tbl+'|'+x.id]=ver;});
     return done({ok:true,rev,vers,numbers});
    }
    if(name==='erp_get')return a.keys.map(k=>rec.get(k.tbl+'|'+k.id)).filter(Boolean);
    if(name==='erp_changes'){const rows=log.filter(r=>r.ver>a.since).slice(0,a.lim||2000);return {rows,last:rows.length?rows[rows.length-1].ver:a.since};}
    if(name==='erp_whoami')return {admin:true};
    if(name==='erp_take'){const first=Math.max(counter['b-'+a.counter]||1,a.from_n||0);counter['b-'+a.counter]=first+a.n;return first;}
    throw new Error('Unexpected '+name);
   }};
  return s;
 }
 /* Два компьютера с одной базой: A делает её, B получает копией. */
 async function twoPcs(make){
  const A=await page();await require('./optimization-fixture')(A.p);await helpers(A.p);
  const seed=await A.p.evaluate(make);
  await A.p.evaluate(()=>storageFlush());
  const records=await A.p.evaluate(()=>[...storageBase].flatMap(([tbl,m])=>[...m].map(([id,r])=>({tbl,id,data:r.t,seq:r.s||0,ver:1}))));
  const state=await A.p.evaluate(()=>JSON.stringify(DB));
  const B=await page();await B.p.evaluate(async s=>{await storageSeed(JSON.parse(s));},state);await B.p.reload();await B.p.evaluate(()=>storageReady);
  await require('./optimization-fixture')(B.p);await helpers(B.p);
  const srv=server(records);
  for(const [i,x] of [A,B].entries()){
   await x.p.exposeFunction('a8rpc',(n,a)=>srv.rpc(n,a));
   await x.p.evaluate(({keys,i})=>{window.GF_CLOUD_MANUAL=true;Object.assign(cloudSync,{loaded:true,on:true,ref:'https://audit.invalid',out:[],n:0,since:0,vers:new Map(keys.map(k=>[k.replace('|','\u0000'),1]))});
    cloudSync.blocks.set('journal',[[1000+i*1000,1999+i*1000]]);cloudRpc=(n,a)=>window.a8rpc(n,a);},{keys:[...srv.rec.keys()],i});
  }
  const sync=async()=>{for(const x of [A,B])await x.p.evaluate(()=>cloudPushAll());for(const x of [A,B])await x.p.evaluate(()=>cloudPull());};
  return {A,B,seed,srv,sync,close:async()=>{await A.c.close();await B.c.close();}};
 }

 {const w=await twoPcs(()=>{oqReset();const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();const r=a8Pay(c.id,finToday(),100);return {cid:c.id,oid:id,rid:r.id};});
  const local=[];for(const x of [w.A,w.B])local.push(await x.p.evaluate(s=>finPersist(()=>finCreateRefund({receiptId:s.rid,amount:100,date:finToday(),method:'cash',reason:'Concurrent'})).ok,w.seed));
  await w.sync();
  eq('C4: два компьютера возвращают те же $100 — второй получает конфликт; один возврат, депозит 0, выгрузка цела',await w.B.p.evaluate(s=>({refunds:DB.refund.map(r=>r.number),deposit:finCustomerDeposit(s.cid),warn:/Changed on another computer: R-0001/.test(cloudSync.warn),backup:a8Backup()}),w.seed),
   {refunds:['RF-0001'],deposit:0,warn:true,backup:''});
  eq('C4: возврат сверяет квитанцию: в команде её версия',{local,expect:w.srv.calls.map(c=>c.expect.includes('receipt'))},{local:[true,true],expect:[true,true]});
  await w.close();}

 {const w=await twoPcs(()=>{oqReset();const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();return {cid:c.id,oid:id,total:finOrderBalance(salesRecord(id)).total};});
  for(const x of [w.A,w.B])await x.p.evaluate(s=>a8Pay(s.cid,finToday(),s.total,[{orderId:s.oid,amount:s.total}]),w.seed);
  await w.sync();
  eq('C4: два компьютера разносят по полной оплате на один заказ — вторая не проходит, переплаты нет',await w.B.p.evaluate(s=>{const b=finOrderBalance(salesRecord(s.oid));return {paid:b.paid===s.total,balance:b.balance,receipts:DB.receipt.length,backup:a8Backup()};},w.seed),
   {paid:true,balance:0,receipts:1,backup:''});
  await w.close();}

 {const w=await twoPcs(()=>{oqReset();const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');return {cid:c.id,oid:id};});
  for(const x of [w.A,w.B])await x.p.evaluate(s=>shippingCreate({customerId:s.cid,method:'pickup',shipTo:{},date:finToday(),items:shippingAvailable(salesRecord(s.oid)).map(shippingItem),extras:[]}).ok,w.seed);
  await w.sync();
  const merged=await w.B.p.evaluate(()=>({slips:DB.shipment.length,units:DB.shipment.flatMap(s=>s.items.map(i=>i.label)).length,backup:a8Backup(),warn:/Changed on another computer/.test(cloudSync.warn)}));
  await w.B.p.reload();await w.B.p.evaluate(()=>storageReady);
  eq('C12: два компьютера ставят те же 3 юнита в PS — одна PS, 3 юнита, выгрузка цела, после F5 так же',Object.assign(merged,{f5:await w.B.p.evaluate(()=>DB.shipment.length)}),{slips:1,units:3,backup:'',warn:true,f5:1});
  await w.close();}

 {const w=await twoPcs(()=>{oqReset();storageCommand(()=>{DB.stockItem=[normalizeSimpleMaterial({id:'STK-A8',name:'Concurrent count',code:'A8COUNT',salePrice:10,active:true},'stock')];DB.stockItemEvent=[];});sinvCount('STK-A8',100);return {};});
  for(const x of [w.A,w.B])await x.p.evaluate(()=>sinvCount('STK-A8',80).ok);
  await w.sync();
  eq('C13: два пересчёта «80» при остатке 100 — остаток 80, а не 60; второй — конфликт',await w.B.p.evaluate(()=>({onHand:sinvRowOf('STK-A8').onHand,counts:DB.stockItemEvent.length,warn:/Changed on another computer: Concurrent count/.test(cloudSync.warn)})),
   {onHand:80,counts:2,warn:true});
  /* Add и Remove по-прежнему складываются и не спорят. */
  for(const x of [w.A,w.B])await x.p.evaluate(()=>sinvMove('STK-A8','add',5).ok);
  await w.sync();
  eq('C13: два прихода +5 в одну минуту складываются без конфликта',await w.A.p.evaluate(()=>sinvRowOf('STK-A8').onHand),90);
  await w.close();}

 /* Аудит Codex 09.11.2026: та же защита у выплаты агенту (F06) и пересчёта
    листов и расходников (F09). */
 {const w=await twoPcs(()=>{oqReset();DB.referrer=[];DB.referrerPayout=[];const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();a8Pay(c.id,finToday(),100,[{orderId:id,amount:100}]);
   const r=comSave({name:'Audit Agent',customers:[{customerId:c.id,pct:10}]}).value;return {rid:r.id,oid:id,due:comDue(r).get(id).due};});
  for(const x of [w.A,w.B])await x.p.evaluate(s=>comPayoutAdd({referrerId:s.rid,date:finToday(),orderIds:[s.oid]}).ok,w.seed);
  await w.sync();
  eq('F06: два компьютера платят агенту один долг — одна выплата, второй — конфликт',await w.B.p.evaluate(s=>({payouts:DB.referrerPayout.length,paid:DB.referrerPayout.reduce((n,p)=>n+p.amount,0)===s.due,left:comDue(comFind(s.rid)).get(s.oid).due,warn:/Changed on another computer: Audit Agent/.test(cloudSync.warn)}),w.seed),
   {payouts:1,paid:true,left:0,warn:true});
  await w.close();}

 {const w=await twoPcs(()=>{oqReset();DB.inventoryEvent=[];const key='6CLEAR|144x96';invCountSave({[key]:'10'});return {key};});
  for(const x of [w.A,w.B])await x.p.evaluate(s=>invCountSave({[s.key]:'9'}).ok,w.seed);
  await w.sync();
  eq('F09: два пересчёта листов «9» при 10 на стеллаже — 9, а не 8; второй — конфликт',await w.B.p.evaluate(s=>({onRack:invSheetRows().find(r=>r.key===s.key).onRack,warn:/Changed on another computer/.test(cloudSync.warn)}),w.seed),
   {onRack:9,warn:true});
  await w.close();}

 {const w=await twoPcs(()=>{oqReset();DB.consumableEvent=[];const k=consRows()[0].key;consCountSave({[k]:'10'});return {k};});
  for(const x of [w.A,w.B])await x.p.evaluate(s=>consCountSave({[s.k]:'9'}).ok,w.seed);
  await w.sync();
  eq('F09: два пересчёта расходника «9» при 10 — 9, а не 8; второй — конфликт',await w.B.p.evaluate(s=>({onHand:consRows().find(r=>r.key===s.k).onHand,warn:/Changed on another computer/.test(cloudSync.warn)}),w.seed),
   {onHand:9,warn:true});
  await w.close();}

 /* C3: большой Save частями — заказ на другом компьютере поменяли. */
 {const w=await twoPcs(()=>{oqReset();const c=oqCustomer();const id=oqOrder(c);salesDraftDrop();return {oid:id,glass:DB.glassPiece.length};});
  await w.B.p.evaluate(s=>{const o=salesRecord(s.oid);return storageCommand(()=>{o.notes='Edited on B';}).ok;},w.seed);
  await w.B.p.evaluate(()=>cloudPushAll());
  await w.A.p.evaluate(s=>{salesOrderEdit(s.oid);for(let i=0;i<180;i++){const l=normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,width16:37*16,height16:71*16,qty:1,mark:'BIG-'+i});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=.013;});}
   salesOrderSave();salesDraftDrop();},w.seed);
  const parts=await w.A.p.evaluate(()=>cloudSync.out.map(c=>c.changes.length));
  await w.A.p.evaluate(()=>cloudPushAll());
  const srvRows=[...w.srv.rec.values()].filter(r=>r.tbl==='glassPiece'&&!r.deleted).length;
  eq('C3: Save на 722 строки двумя частями, конфликт по заказу — не записано ничего, у A заказ как на сервере',{parts:parts.length,staged:w.srv.calls.some(c=>c.staged),
   server:{lines:JSON.parse(w.srv.rec.get('salesOrder|'+w.seed.oid).data).lines.length,glass:srvRows},a:await w.A.p.evaluate(s=>({lines:salesRecord(s.oid).lines.length,notes:salesRecord(s.oid).notes,glass:DB.glassPiece.length,waiting:cloudSync.out.length}),w.seed)},
   {parts:2,staged:true,server:{lines:2,glass:w.seed.glass},a:{lines:2,notes:'Edited on B',glass:w.seed.glass,waiting:0}});
  await w.A.p.evaluate(()=>cloudPull());
  await w.A.p.evaluate(s=>{salesOrderEdit(s.oid);for(let i=0;i<180;i++){const l=normalizeSalesOrderLine({makeupId:soDraft.makeups[0].id,width16:37*16,height16:71*16,qty:1,mark:'BIG-'+i});soDraft.lines.push(l);salesEnsureLineShape(l);salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=.013;});}
   salesOrderSave();salesDraftDrop();},w.seed);
  await w.A.p.evaluate(()=>cloudPushAll());
  eq('C3: тот же Save без конфликта — обе части одной записью, версии у всех строк',{server:JSON.parse(w.srv.rec.get('salesOrder|'+w.seed.oid).data).lines.length,
   a:await w.A.p.evaluate(()=>({waiting:cloudSync.out.length,noVer:DB.glassPiece.filter(g=>!cloudSync.vers.has(cloudKey('glassPiece',storageRowKey('glassPiece',g)))).length}))},{server:182,a:{waiting:0,noVer:0}});
  await w.close();}

 /* C6: Export без связи и Import неполного файла. */
 {const A=await page();await helpers(A.p);
  const out=await A.p.evaluate(async()=>{
   const c=a8Cust('C-BACKUP');a8Order('SO-BACKUP',c.id,'99100');a8Pay(c.id,'2026-08-02',100,[{orderId:'SO-BACKUP',amount:100}]);
   archiveRun('2026-11-08');await storageFlush();
   const full=storageExportParts(await storageIdbColdAll(),await storageIdbArchiveAll()).join(''),index=await storageIdbArchiveAll();
   /* Новый компьютер с сервером: список архива есть, тел нет, связи нет. */
   const keep={on:cloudSync.on,rpc:cloudRpc,dl:storageDownload};let file=null,said='';const al=window.alert;window.alert=m=>{said=m;};
   Object.assign(cloudSync,{on:true});cloudRpc=async()=>{throw new Error('No connection to the server.');};storageDownload=(n,parts)=>{file=parts.join('');};
   const at=storageBackupAt;
   try{await doExport();}finally{Object.assign(cloudSync,{on:keep.on});cloudRpc=keep.rpc;storageDownload=keep.dl;window.alert=al;}
   /* Файл со списком архива без самих заказов. */
   const lines=full.trim().split('\n'),cut=lines.filter(l=>!/"cold":1/.test(l)),head=JSON.parse(cut[0]);head.records=cut.length-1;delete head.cold;cut[0]=JSON.stringify(head);
   let importErr='';try{const got=await storageReadRecords(new File([cut.join('\n')],'cut.ndjson'));await storageImportState(got.state,{cold:got.cold,archive:got.archive});}catch(e){importErr=e.message;}
   let fullOk=false;{const got=await storageReadRecords(new File([full],'full.ndjson'));fullOk=got.cold.length>0&&storageArchiveMissing(got.cold,got.archive).length===0;}
   return {exported:!!file,said:/Archive not read: No connection/.test(said),marked:storageBackupAt!==at,importErr,fullOk};
  });
  eq('C6: без связи Export не скачивает файл и не считается копией; Import файла без тел архива — отказ; полный файл — цел',out,
   {exported:false,said:true,marked:false,importErr:'the file is incomplete: 1 archived order is missing.',fullOk:true});
  await A.c.close();}

 /* C8: обрыв первого Upload. */
 {const A=await page();await require('./optimization-fixture')(A.p);await helpers(A.p);
  const srv=server([]);let n=0;srv.fail=(name)=>name==='erp_apply'&&++n===2;
  await A.p.exposeFunction('a8rpc',(nm,a)=>srv.rpc(nm,a));
  const out=await A.p.evaluate(async()=>{
   oqReset();const c=oqCustomer();oqOrder(c);salesDraftDrop();
   const sup=purSupplierSave({name:'Audit supplier',currency:'CAD'}).value;
   const inv=purMoneySave('invoice',{supplierId:sup.id,supplierName:sup.name,currency:'CAD',date:finToday(),amount:100,invoiceNumber:'A8-1'}).value;
   await storageFlush();window.GF_CLOUD_MANUAL=true;
   const keep=cloudRpc;cloudRpc=(nm,a)=>window.a8rpc(nm,a);
   const first=await cloudUpload(),e1=cloudSync.error;
   cloudSync.error='';const down=await cloudDownload(),e2=cloudSync.error;
   cloudSync.error='';const retry=await cloudUpload();const down2=await cloudDownload();
   cloudRpc=keep;await cloudSaveAll('',0,null);
   return {first,e1,down,e2,retry,down2,invoice:!!purMoneyFind('invoice',inv.id)};
  });
  eq('C8: Upload оборвался — Download отказывает, Upload с того же ПК доходит, после Download Purchasing на месте',out,
   {first:false,e1:'No connection to the server.',down:false,e2:'Upload to the server is not finished. Finish it on the computer that started it.',retry:true,down2:true,invoice:true});
  await A.c.close();}
};
