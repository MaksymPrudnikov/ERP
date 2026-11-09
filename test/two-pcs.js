/* Два компьютера с одной базой против сервера (аудит Codex 08.11.2026 и
   план «до 10», 09.11.2026). Сервер — настоящий SQL (test/cloud-server.js,
   PGlite), компьютеры — два контекста браузера со своими базами: A делает
   базу (make), B получает её копией, обе связаны с сервером, где эта база
   уже лежит (ver 1 у каждой строки, как после Upload). sync — отправить
   очереди обоих и принять чужое. Помощники a8* — в странице. */
const server=require('./cloud-server');
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
async function twoPcs(page,make){
 const A=await page();await require('./optimization-fixture')(A.p);await helpers(A.p);
 const seed=await A.p.evaluate(make);
 await A.p.evaluate(()=>storageFlush());
 const records=await A.p.evaluate(()=>[...storageBase].flatMap(([tbl,m])=>[...m].map(([id,r])=>({tbl,id,data:r.t,seq:r.s||0}))));
 const state=await A.p.evaluate(()=>JSON.stringify(DB));
 const B=await page();await B.p.evaluate(async s=>{await storageSeed(JSON.parse(s));},state);await B.p.reload();await B.p.evaluate(()=>storageReady);
 await require('./optimization-fixture')(B.p);await helpers(B.p);
 const srv=await server(records),keys=records.map(r=>r.tbl+'\u0000'+r.id);
 for(const [i,x] of [A,B].entries()){
  await x.p.exposeFunction('a8rpc',(n,a)=>srv.rpc(n,a));
  await x.p.evaluate(({keys,i})=>{window.GF_CLOUD_MANUAL=true;Object.assign(cloudSync,{loaded:true,on:true,ref:'https://audit.invalid',out:[],n:0,since:0,vers:new Map(keys.map(k=>[k,1]))});
   cloudSync.blocks.set('journal',[[1000+i*1000,1999+i*1000]]);cloudRpc=(n,a)=>window.a8rpc(n,a);},{keys,i});
 }
 const sync=async()=>{for(const x of [A,B])await x.p.evaluate(()=>cloudPushAll());for(const x of [A,B])await x.p.evaluate(()=>cloudPull());};
 return {A,B,seed,srv,sync,close:async()=>{await A.c.close();await B.c.close();await srv.close();}};
}
module.exports={helpers,twoPcs,server};
