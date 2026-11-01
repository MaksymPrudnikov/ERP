/* Синхронизация с сервером (этап 4 «Базы», erp/cloud-sync.js): два
   компьютера — два контекста браузера со своими базами — и один поддельный
   сервер с правилами schema.sql: версии строк, команда целиком, повтор
   команды, раздел Finance, курсор изменений. */
module.exports=async function({page,eq}){
 console.log('cloud sync');
 const srv={rev:0,rec:new Map(),log:[],cmd:new Map(),counter:{},down:false,
  members:{'admin@glass-erp.test':{name:'Admin',admin:true,sections:[]},'office@glass-erp.test':{name:'Office',admin:false,sections:['sales']}}};
 const rule={receipt:'finance'};
 const can=(m,t)=>m.admin||!rule[t]||m.sections.includes(rule[t]);
 const row=r=>({tbl:r.tbl,id:r.id,ver:r.ver,seq:r.seq,deleted:r.deleted,cold:!!r.cold,data:r.deleted||r.cold?null:r.data});
 const rpc={
  erp_whoami:m=>({name:m.name,admin:m.admin,sections:m.sections}),
  erp_apply:(m,a)=>{
   if(srv.cmd.has(a.command_id))return srv.cmd.get(a.command_id);
   let res;const denied=[...new Set(a.changes.filter(c=>!can(m,c.tbl)).map(c=>c.tbl))];
   const conflict=a.expect.filter(e=>{const r=srv.rec.get(e.tbl+'|'+e.id);return (r&&!r.deleted?r.ver:0)!==(e.ver||0);});
   if(srv.spy)srv.spy(a);
   if(denied.length)res={ok:false,denied};
   else if(conflict.length)res={ok:false,conflict};
   else{const vers={},numbers={},swap=[];
    /* Номер документа — как erp_apply в schema.sql. */
    a.changes.forEach(c=>{if(!c.number||c.data===null)return;const x=c.number,f=+x.value.slice(x.prefix.length);
     const n=Math.max(srv.counter[x.name]||0,f);srv.counter[x.name]=n+1;
     const t=x.prefix+String(n).padStart(x.pad||0,'0');numbers[c.tbl+'|'+c.id]=t;if(t!==x.value)swap.push([x.value,t]);});
    a.changes.forEach(c=>{const k=c.tbl+'|'+c.id,ver=++srv.rev;srv.log.push({rev:ver,k});
     /* Только поля номера и ссылок и строка списка — как в schema.sql (A-4). */
     let d=c.data;if(d!==null&&swap.length){const keys='businessNumber|number|no|order|orderNumber|ps|doc|before|after'+(c.tbl==='orderEvent'?'|note':'');
      swap.forEach(([o],i)=>{d=d.replace(new RegExp('("(?:'+keys+')"\\s*:\\s*|[\\[,]\\s*)"'+o+'"(?=\\s*[,\\]}])','g'),'$1"#'+i+'#"');});swap.forEach(([,t],i)=>{d=d.split('"#'+i+'#"').join('"'+t+'"');});}
     srv.rec.set(k,{tbl:c.tbl,id:c.id,ver,seq:c.seq||0,deleted:d===null,data:d,cold:!!c.cold,month:c.month||'',owners:c.owners||[]});vers[k]=ver;});
    res={ok:true,rev:srv.rev,vers,numbers};}
   srv.cmd.set(a.command_id,res);return res;
  },
  erp_take:(m,a)=>{const first=Math.max(srv.counter[a.counter]||1,a.from_n||0);srv.counter[a.counter]=first+a.n;return first;},
  erp_changes:(m,a)=>{
   const part=srv.log.filter(l=>l.rev>(a.since||0)).slice(0,a.lim||2000),keys=new Map();
   part.forEach(l=>keys.set(l.k,l.rev));
   const rows=[...keys.keys()].map(k=>srv.rec.get(k)).filter(r=>can(m,r.tbl)).map(row);
   return {rows,last:part.length?part[part.length-1].rev:(a.since||0)};
  },
  erp_cold_of:(m,a)=>[...srv.rec.values()].filter(r=>r.cold&&!r.deleted&&can(m,r.tbl)&&(r.owners||[]).some(o=>a.owners.includes(o))).map(r=>({tbl:r.tbl,id:r.id,ver:r.ver,seq:r.seq,month:r.month,owners:r.owners,data:r.data})),
  erp_cold:(m,a)=>a.keys.map(k=>srv.rec.get(k.tbl+'|'+k.id)).filter(r=>r&&r.cold&&!r.deleted&&can(m,r.tbl)).map(r=>({tbl:r.tbl,id:r.id,ver:r.ver,seq:r.seq,month:r.month,owners:r.owners,data:r.data})),
  erp_member_set:()=>({}),erp_members:m=>m.admin?[]:null,erp_rules:()=>[],
  erp_get:(m,a)=>a.keys.map(k=>srv.rec.get(k.tbl+'|'+k.id)).filter(r=>r&&can(m,r.tbl)).map(row),
 };
 const PGcold=k=>{const r=srv.rec.get(k);return !!r&&!!r.cold;};
 const route=async route=>{
  if(srv.down)return route.abort();
  const req=route.request(),u=new URL(req.url()),body=JSON.parse(req.postData()||'{}'),h=req.headers();
  const json=(status,o)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
  if(u.pathname==='/auth/v1/token'&&body.password==='bad')return json(400,{error_description:'Invalid login credentials'});
  if(u.pathname==='/auth/v1/token')return json(200,{access_token:'T:'+body.email,refresh_token:'R:'+body.email,expires_in:3600,user:{email:body.email}});
  const m=srv.members[String(h.authorization||'').replace('Bearer T:','')],fn=rpc[u.pathname.replace('/rest/v1/rpc/','')];
  if(!m)return json(401,{message:'Not a member of this ERP.'});
  return fn?json(200,fn(m,body)):json(404,{message:'Not found'});
 };
 const pc=async email=>{
  const t=await page();await t.c.route('https://shop.supabase.co/**',route);
  await t.c.addInitScript(()=>{window.GF_CLOUD_MANUAL=true;});await t.p.evaluate(()=>{window.GF_CLOUD_MANUAL=true;});
  await t.p.evaluate(async e=>{await cloudConnect('https://shop.supabase.co','sb_publishable_test',e,'pw');},email);
  return t;
 };
 /* Шаг синхронизации сейчас, а не через 5 секунд. */
 const sync=t=>t.p.evaluate(async()=>{while(cloudSync.running)await new Promise(r=>setTimeout(r,20));await cloudSyncTick();return cloudSyncText();});
 const name=(t,id)=>t.p.evaluate(id=>{const c=DB.customer.find(x=>x.id===id);return c?c.legalName:null;},id);
 const edit=(t,id,v,field)=>t.p.evaluate(([id,v,f])=>storageCommand(()=>{DB.customer.find(x=>x.id===id)[f||'legalName']=v;}).ok,[id,v,field]);

 const A=await pc('admin@glass-erp.test');
 await A.p.evaluate(()=>storageCommand(()=>{DB.customer.push({id:'C-CLOUD',legalName:'Cloud Co'});}));
 await A.p.evaluate(()=>{tab='users';subtab='cloud';render();});
 eq('Users → Cloud: после входа — «Not synced», Upload и Download',await A.p.evaluate(()=>({sync:document.querySelector('[data-cloud-sync]').dataset.cloudSync,up:!!document.querySelector('[data-cloud-upload]'),down:!!document.querySelector('[data-cloud-download]')})),{sync:'off',up:true,down:true});
 const up=await A.p.evaluate(()=>{const f=cloudRpc;cloudRpc=function(n,a){if(n==='erp_apply'){cloudRpc=f;cloudOutbox([{tbl:'customer',id:'C-COLD',seq:90,data:'{"id":"C-COLD"}',cold:true,owners:['SO-x'],month:'2026-01'}]);}return f(n,a);};return cloudUpload();});
 eq('Upload: база A на сервере, A — «Synced»',{up,has:!!srv.rec.get('customer|C-CLOUD'),text:await sync(A)},{up:true,has:true,text:'Synced'});
 eq('строка, ушедшая в архив посреди Upload, на сервере в архиве, а не удалена',(r=>r&&{cold:r.cold,deleted:r.deleted})(srv.rec.get('customer|C-COLD')),{cold:true,deleted:false});
 eq('Upload второй раз — отказ: на сервере уже есть данные',await A.p.evaluate(async()=>{await cloudSaveAll('',0,null);await cloudUpload();const e=cloudSync.error;cloudSync.error='';return e;}),'The server already has data. Use Download.');
 await A.p.evaluate(async()=>{await cloudDownload();});

 /* Фигура после Upload: пустая таблица не лежит на сервере целиком рядом
    с ней. Сервер со старой «*» (Upload до v5.257) — Download всё равно цел. */
 await A.p.evaluate(()=>storageCommand(()=>{DB.shapeDef.push({id:'SH-CLOUD',name:'Cloud shape'});}));await sync(A);
 eq('Upload: пустой таблицы целиком («*») на сервере нет, фигура — строкой',{star:srv.rec.has('shapeDef|*'),row:srv.rec.has('shapeDef|SH-CLOUD')},{star:false,row:true});
 srv.rec.set('shapeDef|*',{tbl:'shapeDef',id:'*',ver:++srv.rev,seq:0,deleted:false,data:'[]'});srv.log.push({rev:srv.rev,k:'shapeDef|*'});
 srv.rec.delete('customer|*');
 const B=await pc('office@glass-erp.test');
 const down=await B.p.evaluate(()=>cloudDownload());
 eq('Download: у B клиент A и связь с сервером (старая «*» фигур рядом со строкой не мешает)',{down,name:await name(B,'C-CLOUD'),error:await B.p.evaluate(()=>cloudSync.error),text:await sync(B)},{down:true,name:'Cloud Co',error:'',text:'Synced'});

 await edit(A,'C-CLOUD','Cloud Co Ltd');await sync(A);
 eq('правка A уходит на сервер и приходит к B опросом',(await sync(B),await name(B,'C-CLOUD')),'Cloud Co Ltd');
 eq('после F5 у B та же база и связь (курсор и версии в базе браузера)',await (async()=>{await B.p.reload();await B.p.evaluate(()=>window.storageReady);return {name:await name(B,'C-CLOUD'),text:await sync(B)};})(),{name:'Cloud Co Ltd',text:'Synced'});

 await edit(A,'C-CLOUD','From A');await edit(B,'C-CLOUD','From B');
 await sync(A);await sync(B);
 eq('одна строка на двух компьютерах: первый записанный остаётся, у второго — серверная копия и предупреждение',
  {a:await name(A,'C-CLOUD'),b:await name(B,'C-CLOUD'),warn:await B.p.evaluate(()=>cloudSync.warn),server:JSON.parse(srv.rec.get('customer|C-CLOUD').data).legalName},
  {a:'From A',b:'From A',warn:'Changed on another computer: C-CLOUD. Server copy shown.',server:'From A'});

 srv.down=true;
 await edit(B,'C-CLOUD','Offline 1','notes');await edit(B,'C-CLOUD','Offline 2','notes');
 eq('без сети: правки ждут в очереди — «Offline · 2 waiting»',await sync(B),'Offline · 2 waiting');
 eq('…и переживают F5',await (async()=>{await B.p.reload();await B.p.evaluate(()=>window.storageReady);return sync(B);})(),'Offline · 2 waiting');
 srv.down=false;
 eq('сеть вернулась: обе правки подряд уходят (вторая не спорит с первой), A их видит',
  {b:await sync(B),a:(await sync(A),await A.p.evaluate(()=>DB.customer.find(x=>x.id==='C-CLOUD').notes))},{b:'Synced',a:'Offline 2'});
 /* Download и Cancel на «Replace this browser database?»: связь, версии и
    очередь этого ПК — как были (аудит 25.10.2026, A-1). */
 await edit(B,'C-CLOUD','Waiting','notes');
 eq('Download и Cancel на замене базы: связь и очередь те же, и после F5',await B.p.evaluate(async()=>{
  const c=window.confirm,asked=[];window.confirm=m=>{asked.push(m.split('\n')[0]);return asked.length===1;};
  const was={on:cloudSync.on,ref:cloudSync.ref,out:cloudSync.out.length,vers:cloudSync.vers.size};
  try{const down=await cloudDownload();return {down,asked,same:JSON.stringify(was)===JSON.stringify({on:cloudSync.on,ref:cloudSync.ref,out:cloudSync.out.length,vers:cloudSync.vers.size}),out:was.out};}
  finally{window.confirm=c;}
 }).then(async r=>{await B.p.reload();await B.p.evaluate(()=>window.storageReady);return Object.assign(r,{after:await B.p.evaluate(()=>[cloudSync.on,cloudSync.out.length])});}),
  {down:false,asked:['1 changes here are not on the server yet and will be lost. Download anyway?','Replace this browser database?'],same:true,out:1,after:[true,1]});
 eq('…правка из очереди уходит, A её видит',{b:await sync(B),a:(await sync(A),await A.p.evaluate(()=>DB.customer.find(x=>x.id==='C-CLOUD').notes))},{b:'Synced',a:'Waiting'});

 await B.p.evaluate(()=>storageCommand(()=>{DB.receipt.push({id:'RCPT-CLOUD',orderId:'',amount:5});}));
 await sync(B);
 eq('без раздела Finance оплата не пишется: строки нет ни на сервере, ни у B; предупреждение',
  {server:srv.rec.has('receipt|RCPT-CLOUD'),b:await B.p.evaluate(()=>DB.receipt.some(r=>r.id==='RCPT-CLOUD')),warn:await B.p.evaluate(()=>cloudSync.warn)},
  {server:false,b:false,warn:'No access on server: receipt. Server copy shown.'});
 eq('отказ сервера виден и внизу экрана',await B.p.evaluate(()=>{render();const f=document.querySelector('[data-cloud-warn-foot]');return f&&f.textContent;}),'No access on server: receipt. Server copy shown.');

 /* Номера (владелец, 23.10.2026: на двух ПК открыли заказ — номер один). */
 const order=t=>t.p.evaluate(()=>{const o=newSalesOrderDraft('order');o.customerId='C-CLOUD';o.businessNumber=nextSalesOrderNumber();
  storageCommand(()=>{DB.salesOrder.push(o);normalizeSalesOrderIn(o.id);});return {id:o.id,no:o.businessNumber};});
 /* Строка чужого компьютера уходит назад только с правкой: дописанные
    рядом строки получают разные seq (storageSeqNext). */
 const idle=[];srv.spy=a=>a.changes.forEach(c=>{const r=srv.rec.get(c.tbl+'|'+c.id);if(r&&!r.deleted&&r.data===c.data&&r.seq===c.seq)idle.push(c.tbl);else if(r&&!r.deleted&&r.data===c.data)idle.push(c.tbl+' seq '+r.seq+'→'+c.seq);});
 await B.p.evaluate(()=>{cloudSync.warn='';});
 const upRev=srv.rev,oa=await order(A),ob=await order(B);
 await sync(A);await sync(B);await sync(A);
 const no=(t,id)=>t.p.evaluate(id=>DB.salesOrder.find(o=>o.id===id).businessNumber,id);
 eq('два ПК сохранили заказ с одним номером: первый его держит, второй получает следующий — и у себя, и у первого',
  {same:oa.no===ob.no,a:await no(A,oa.id),b:await no(B,ob.id),bOnA:await no(A,ob.id),warn:await B.p.evaluate(()=>cloudSync.warn)},
  {same:true,a:oa.no,b:String(+oa.no+1),bOnA:String(+oa.no+1),warn:''});
 eq('следующий заказ на любом ПК — после обоих',await (async()=>{const x=await order(B);await sync(B);return no(B,x.id);})(),String(+oa.no+2));
 await sync(A);srv.down=true;const oc=await order(B);
 await B.p.evaluate(id=>storageCommand(()=>{const o=DB.salesOrder.find(o=>o.id===id);o.customerPo=o.businessNumber;o.notes=o.businessNumber;}),oc.id);
 srv.down=false;const od=await order(A);await sync(A);await sync(B);
 eq('без сети: тот же номер уже занят другим ПК — после связи следующий, вторая правка его не затирает; PO и Notes с тем же текстом не меняются',
  {same:oc.no===od.no,b:await no(B,oc.id),server:JSON.parse(srv.rec.get('salesOrder|'+oc.id).data).businessNumber,po:JSON.parse(srv.rec.get('salesOrder|'+oc.id).data).customerPo,
   notes:JSON.parse(srv.rec.get('salesOrder|'+oc.id).data).notes,poOnB:await B.p.evaluate(id=>DB.salesOrder.find(o=>o.id===id).customerPo,oc.id)},
  {same:true,b:String(+od.no+1),server:String(+od.no+1),po:oc.no,notes:oc.no,poOnB:oc.no});
 const ids=t=>t.p.evaluate(()=>{let g;storageCommand(()=>{g=[glassPieceNextId(),glassPieceNextId(),stationScanNextId()];});return g;});
 const ga=await ids(A),gb=await ids(B);
 /* Блок A — 1001–2000: первый ушёл с прежней связью (Download её сменил). */
 eq('стёкла и сканы — из блоков сервера: на двух ПК не совпадают, счётчики базы на сервер не ходят',{a:ga,b:gb,meta:[...srv.rec.keys()].filter(k=>/^_meta\|.*Seq$/.test(k)&&srv.rec.get(k).ver>upRev)},
  {a:['G-0001001','G-0001002','SC-0001001'],b:['G-0002001','G-0002002','SC-0002001'],meta:[]});
 const num=id=>+id.slice(id.indexOf('-')+1);
 eq('после F5 — дальше по своему блоку, номер не повторяется',await (async()=>{await A.p.reload();await A.p.evaluate(()=>window.storageReady);
  const g=await ids(A);return {glass:num(g[0])>1002&&num(g[1])===num(g[0])+1&&num(g[1])<=2000,scan:g[2]};})(),{glass:true,scan:'SC-0001002'});
 eq('ни один ПК не отправил назад чужую строку без правки',idle,[]);
 /* Офис без Finance сохраняет заказ обычным Save: заодно пишутся условия
    оплаты (financeTerms) — сервер не отказывает (24.10.2026: отказывал,
    заказ оставался черновиком с номером первого ПК). */
 await require('./optimization-fixture')(B.p);await B.p.evaluate(()=>{cloudSync.warn='';});
 const saved=await B.p.evaluate(()=>{const c=DB.customer.find(x=>x.id==='C-CLOUD');oqOrder(c);return soEdit;});await sync(B);
 eq('офис без Finance: Save заказа уходит на сервер вместе с условиями оплаты',
  {server:!!srv.rec.get('salesOrder|'+saved),terms:!!srv.rec.get('financeTerms|'+saved),warn:await B.p.evaluate(()=>cloudSync.warn)},{server:true,terms:true,warn:''});
 /* Архив на сервере (24.10.2026): уход на одном ПК — у другого заказ тоже
    в архиве и открывается с диска; возврат — снова в работе у обоих. */
 await A.p.evaluate(id=>storageCommand(()=>{const o=DB.salesOrder.find(x=>x.id===id);o.status='cancelled';o.statusDates=Object.assign({},o.statusDates,{cancelled:'2026-01-10T12:00:00.000Z'});}),oa.id);
 await sync(A);await sync(B);
 const went=await A.p.evaluate(async id=>{const due=archiveDue('2026-06-01').has(id),r=archiveRun('2026-06-01',{});await storageFlush();return {due,ok:r.ok,hot:DB.salesOrder.some(o=>o.id===id)};},oa.id);
 await sync(A);await sync(B);
 const seen=t=>t.p.evaluate(async id=>({hot:DB.salesOrder.some(o=>o.id===id),index:archiveIndex.has(id),cold:(await storageColdOf(id)).some(r=>r.tbl==='salesOrder'&&r.id===id),disk:(await storageIdbColdOf(id)).length>0}),oa.id);
 eq('заказ ушёл в архив на A: на сервере архивная строка и указатель Sales; у B — тоже в архиве, с сервера, на диск не копируется',
  {went,server:{cold:PGcold('salesOrder|'+oa.id),index:!!srv.rec.get('_archive|'+oa.id)},a:await seen(A),b:await seen(B)},
  {went:{due:true,ok:true,hot:false},server:{cold:true,index:true},a:{hot:false,index:true,cold:true,disk:true},b:{hot:false,index:true,cold:true,disk:false}});
 eq('журнал денег: совпавшие номера двух компьютеров разводятся одинаково, новые — из блока сервера',await A.p.evaluate(()=>{
  const st={financeEvent:[{id:'b',seq:1,at:'2026-01-02T00:00:00.000Z'},{id:'a',seq:1,at:'2026-01-01T00:00:00.000Z'},{id:'c',seq:2,at:'2026-01-03T00:00:00.000Z'}]};cloudJournalUnique(st);
  return {seqs:st.financeEvent.map(e=>e.id+e.seq).sort(),block:Object.prototype.hasOwnProperty.call(CLOUD_BLOCK,'journal')};
 }),{seqs:['a1','b3','c2'],block:true});
 eq('большой заказ: номера берутся заранее, сервер даёт порциями до 10 000; предупреждение снимается',await A.p.evaluate(async()=>{
  const left=()=>cloudBlockLeft(cloudSync.blocks.get('scan'));await cloudNumbersReserve({scan:left()+25000});const enough=left()>=25000;
  cloudSync.warn=CLOUD_NO_BLOCK;await cloudBlocksFill();return {enough,warn:cloudSync.warn};
 }),{enough:true,warn:''});
 eq('Import и Restore на подключённом компьютере не трогают базу и сервер',await A.p.evaluate(async()=>{
  const was=window.alert;let said='';window.alert=m=>{said=m;};const n=DB.salesOrder.length,out=cloudSync.out.length;const raw=JSON.parse(JSON.stringify(DB));raw.salesOrder=[];const r=await storageImportState(raw,{});window.alert=was;return {r,said:/Stop sync/.test(said),same:DB.salesOrder.length===n,out:cloudSync.out.length===out};
 }),{r:false,said:true,same:true,out:true});
 eq('просроченный вход и конфликт — словами для людей',await A.p.evaluate(()=>{const was=cloudSync.warn;cloudSync.warn='x';cloudSync.warnAt=Date.now()-130e3;const f=cloudSync.running;return cloudSyncTick().then(()=>({warn:cloudSync.warn,at:cloudSync.warnAt}));}),{warn:'',at:0});
 const C=await pc('admin@glass-erp.test');
 eq('Download на третьем ПК: указатель Sales есть, записи архива — с сервера по запросу, на диск не копируются',await (async()=>{await C.p.evaluate(()=>cloudDownload());return seen(C);})(),{hot:false,index:true,cold:true,disk:false});
 eq('архивный заказ открывается с сервера',await C.p.evaluate(async id=>{const ok=await archiveOpen(id),n=soDraft&&soDraft.id;archiveVisitEnd();return {ok,same:n===id};},oa.id),{ok:true,same:true});
 await C.c.close();
 await B.p.evaluate(async id=>{await archiveReturn(id);await storageFlush();},oa.id);
 await sync(B);await sync(A);
 eq('возврат из архива на B — заказ снова в работе у обоих, архивной копии нет',{a:await seen(A),b:await seen(B),cold:PGcold('salesOrder|'+oa.id)},
  {a:{hot:true,index:false,cold:false,disk:false},b:{hot:true,index:false,cold:false,disk:false},cold:false});
 /* Один вход (владелец, 24.10.2026): у людей почта входа — офис входит
    почтой и паролем сервера; новый ПК подключается окном с экрана. */
 eq('Users с сервером: почта входа вместо пароля ERP',await A.p.evaluate(async()=>{
  const a=await usersSave({name:'Boss',office:true,access:USER_SECTIONS.slice(),email:'admin@glass-erp.test'},'setup');
  const b=await usersSave({name:'Clerk',office:true,access:['sales','customers'],email:'office@glass-erp.test'},'setup');
  await new Promise(r=>setTimeout(r,300));cloudSync.warn='';
  return [a.ok,b.ok,signinServer(),DB.user.filter(u=>u.email).map(u=>[u.name,!!u.password])];}),[true,true,true,[['Boss',false],['Clerk',false]]]);
 await sync(A);
 const D=await page(undefined,undefined,{signin:true});await D.c.route('https://shop.supabase.co/**',route);
 await D.c.addInitScript(()=>{window.GF_CLOUD_MANUAL=true;});await D.p.evaluate(()=>{window.GF_CLOUD_MANUAL=true;});
 const join=async pass=>{await D.p.click('[data-cloud-join],[data-cloud-join-foot]');
  await D.p.fill('#cj_url','https://shop.supabase.co');await D.p.fill('#cj_key','sb_publishable_test');await D.p.fill('#cj_email','Office@glass-erp.test');await D.p.fill('#cj_pass',pass);
  await D.p.click('[data-cloud-join-go]');await D.p.waitForFunction(()=>!cloudJoin||!cloudJoin.busy);};
 /* Переход в Publishable key в тот же оборот, что открытие окна, — отложенный
    фокус не уводит набранное в Server (падало под нагрузкой, 26.10.2026). */
 await D.p.evaluate(async()=>{cloudJoinOpen();document.getElementById('cj_key').focus();await new Promise(r=>setTimeout(r,0));});
 await D.p.keyboard.insertText('sb_publishable_test');
 eq('окно Server не уводит фокус: ключ остаётся в Publishable key',await D.p.evaluate(()=>{
  const r={focus:document.activeElement.id,url:document.getElementById('cj_url').value,key:document.getElementById('cj_key').value};cloudJoinClose();return r;}),
  {focus:'cj_key',url:'',key:'sb_publishable_test'});
 eq('новый ПК: «Connect server» внизу, неверный пароль — ошибка в окне',await (async()=>{const foot=await D.p.evaluate(()=>!!document.querySelector('[data-cloud-join-foot]'));
  await join('bad');return {foot,err:await D.p.evaluate(()=>cloudJoin&&cloudJoin.error)};})(),{foot:true,err:'Wrong email or password'});
 eq('…верный: база с сервера, вход в ERP — Clerk, без Users',await (async()=>{await D.p.evaluate(()=>cloudJoinClose());await join('pw');
  return D.p.evaluate(()=>({who:signinUser()&&signinUser().name,users:accessCan('users'),sales:accessCan('sales'),cust:DB.customer.some(c=>c.id==='C-CLOUD')}));})().then(async r=>Object.assign(r,{sync:await sync(D)})),
  {who:'Clerk',users:false,sales:true,cust:true,sync:'Synced'});
 eq('Sign out → экран входа: имена с почтой, пароль сервера; неверный — «Wrong password»',await (async()=>{
  await D.p.evaluate(()=>signinOut());
  const names=await D.p.evaluate(()=>[...document.querySelectorAll('[data-signin-user]')].map(b=>DB.user.find(u=>u.viewProfileId===b.dataset.signinUser).name).sort());
  await D.p.evaluate(()=>signinChoose(DB.user.find(u=>u.name==='Clerk').viewProfileId));
  await D.p.fill('#signinPass','bad');await D.p.click('[data-signin-form] button[type=submit]');await D.p.waitForFunction(()=>!signinBusy);
  const err=await D.p.evaluate(()=>signinError);
  await D.p.fill('#signinPass','pw');await D.p.click('[data-signin-form] button[type=submit]');await D.p.waitForFunction(()=>!signinBusy&&!!signinUser());
  return {names,err,who:await D.p.evaluate(()=>signinUser().name)};})(),{names:['Boss','Clerk'],err:'Wrong password',who:'Clerk'});
 eq('Sign out сервера в этом ПК — и вход в ERP закончен',await D.p.evaluate(()=>{cloudSignOut();return !!signinUser();}),false);
 eq('новый ПК без ошибок страницы',D.errs,[]);
 await D.c.close();
 await B.p.evaluate(()=>{tab='users';subtab='cloud';render();});
 eq('Stop sync: связь снята, база остаётся',await B.p.evaluate(async()=>{await cloudSyncStop();return {sync:document.querySelector('[data-cloud-sync]').dataset.cloudSync,name:DB.customer.find(x=>x.id==='C-CLOUD').legalName};}),{sync:'off',name:'From A'});
 eq('синхронизация без ошибок страницы',[A.errs,B.errs],[[],[]]);
 await A.c.close();await B.c.close();
};
