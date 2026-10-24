/* Права на сервере из ERP (этап 4 «Базы»): почта входа и галочки
   человека уходят на сервер по Save, правила таблиц — Users → Cloud →
   Access. Сервер поддельный (page.route); настоящий — tools/supabase/check.sql. */
module.exports=async function({page,eq}){
 console.log('cloud-access');
 const t=await page();
 const srv={admin:true,logins:['admin@glass-erp.test','office@glass-erp.test'],members:[{email:'admin@glass-erp.test',name:'Admin',admin:true,active:true,sections:[]}],
  rules:[{tbl:'receipt',read:'finance,sales',write:'finance'},{tbl:'refund',read:'finance,sales',write:'finance'}],calls:[]};
 await t.c.route('https://testref.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),body=JSON.parse(req.postData()||'{}'),fn=u.pathname.replace('/rest/v1/rpc/','');
  const json=(status,o)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
  if(u.pathname==='/auth/v1/token')return json(200,{access_token:'A1',refresh_token:'R1',expires_in:3600,user:{email:body.email}});
  srv.calls.push([fn,body]);
  const admin=()=>srv.admin?null:json(400,{message:'Only an administrator can see people.'});
  if(fn==='erp_whoami')return json(200,{user_id:'u1',name:'Admin',admin:srv.admin,sections:[]});
  if(fn==='erp_rules')return json(200,srv.rules);
  if(fn==='erp_members')return admin()||json(200,srv.members);
  if(fn==='erp_rules_set'){srv.rules=body.rules.map(r=>({tbl:r.tbl,read:r.read||null,write:r.write||null}));return json(200,srv.rules);}
  if(fn==='erp_member_set'){
   if(!srv.logins.includes(body.email))return json(400,{message:'No login with this email. Create it in Authentication first.'});
   srv.members=srv.members.filter(m=>m.email!==body.email).concat([{email:body.email,name:body.name,admin:body.admin,active:body.active,sections:body.sections}]);
   return json(200,{user_id:'x'});
  }
  return json(404,{message:'Not found'});
 });
 await t.p.evaluate(async()=>{await cloudConnect('https://testref.supabase.co','sb_publishable_test','admin@glass-erp.test','pass');});
 const save=(fill)=>t.p.evaluate(async f=>{userEditOpen(f.i==='new'?'new':DB.user.findIndex(u=>u.name===f.i));Object.assign(uDraft,f.set);const r=await saveUser();
  await new Promise(ok=>setTimeout(ok,300));return r&&r.ok?'ok':(document.getElementById('e_user')||{}).textContent;},fill);
 const office=()=>t.p.evaluate(()=>{tab='users';subtab='office';render();
  const st=n=>{const u=DB.user.find(u=>u.name===n),c=u&&document.querySelector('[data-user-row="'+u.viewProfileId+'"] [data-user-server]');return c&&c.dataset.userServer;};
  return [st('Boss'),st('Clerk')];});
 await office();await t.p.waitForFunction(()=>Array.isArray(cloudAccess.members));

 eq('Users: человек с почтой входа — Save отправляет на сервер галочки; Users — администратор',await (async()=>{
  srv.calls.length=0;
  const a=await save({i:'new',set:{name:'Boss',access:['users','sales'],newPassword:'admin-pass1',email:' Admin@Glass-ERP.test '}});
  const b=await save({i:'new',set:{name:'Clerk',access:['sales','finance'],newPassword:'office-pass1',email:'office@glass-erp.test'}});
  return {a,b,sent:srv.calls.filter(c=>c[0]==='erp_member_set').map(c=>c[1]),server:await office()};
 })(),{a:'ok',b:'ok',sent:[
  {email:'admin@glass-erp.test',name:'Boss',admin:true,active:true,sections:['sales','users']},
  {email:'office@glass-erp.test',name:'Clerk',admin:false,active:true,sections:['sales','finance']}],server:['ok','ok']});

 eq('сервер изменили в обход ERP — у человека «differs»',await (async()=>{
  srv.members.find(m=>m.email==='office@glass-erp.test').sections=['sales'];
  await t.p.evaluate(()=>cloudAccessLoad());return (await office())[1];})(),'differs');

 eq('не почта — ошибка у Save; чужая почта — «belongs to Boss»',[
  await save({i:'Clerk',set:{email:'office'}}),await save({i:'Clerk',set:{email:'admin@glass-erp.test'}})],
  ['Server login: enter an email','Server login belongs to Boss']);

 eq('сменил почту на вход, которого нет на сервере: старый вход отключён, отказ внизу и «not on server»',await (async()=>{
  srv.calls.length=0;
  const r=await save({i:'Clerk',set:{email:'new@glass-erp.test'}});
  return {r,sent:srv.calls.filter(c=>c[0]==='erp_member_set').map(c=>[c[1].email,c[1].active]),
   warn:await t.p.evaluate(()=>cloudSync.warn),server:(await office())[1],old:srv.members.find(m=>m.email==='office@glass-erp.test').active};
 })(),{r:'ok',sent:[['office@glass-erp.test',false],['new@glass-erp.test',true]],
  warn:'Server: new@glass-erp.test — No login with this email. Create it in Authentication first.',server:'missing',old:false});

 eq('× у офиса — вход на сервере отключён',await (async()=>{
  await save({i:'Clerk',set:{email:'office@glass-erp.test'}});srv.calls.length=0;
  await t.p.evaluate(()=>{window.confirm=()=>true;});
  await t.p.evaluate(()=>delUser(DB.user.findIndex(u=>u.name==='Clerk'),'office'));await t.p.waitForFunction(()=>!cloudAccess.busy);await new Promise(ok=>setTimeout(ok,300));
  return srv.calls.filter(c=>c[0]==='erp_member_set').map(c=>[c[1].email,c[1].active,c[1].sections]);
 })(),[['office@glass-erp.test',false,[]]]);

 eq('Cloud → Access: правила сервера, пусто — «Everyone»',await t.p.evaluate(()=>{tab='users';subtab='cloud';render();
  return [...document.querySelectorAll('[data-rule-row]')].map(r=>[...r.cells].slice(0,3).map(c=>c.textContent.trim().replace(/\s+/g,' ')));}),
  [['receipt','Finance Sales','Finance'],['refund','Finance Sales','Finance']]);

 eq('Edit галочками, Add rule, ×, Save access — на сервер весь список',await (async()=>{
  srv.calls.length=0;
  await t.p.click('[data-rule-row="receipt"] [data-rule-open]');
  await t.p.click('[data-rule-edit] [data-rule-side="read"] [data-rule-sec="production"] input');
  await t.p.click('[data-rule-edit] [data-rule-side="write"] [data-rule-sec="finance"] input');
  await t.p.click('[data-rule-row="refund"] [data-rule-drop]');
  await t.p.selectOption('#cl_rule_tbl','customer');await t.p.click('[data-rule-add]');
  await t.p.click('[data-rule-edit] [data-rule-side="write"] [data-rule-sec="customers"] input');
  await t.p.click('[data-rule-save]');await t.p.waitForFunction(()=>!cloudAccess.busy&&!cloudAccess.draft);
  return {sent:srv.calls.filter(c=>c[0]==='erp_rules_set').map(c=>c[1].rules),
   shown:await t.p.evaluate(()=>[...document.querySelectorAll('[data-rule-row]')].map(r=>[...r.cells].slice(0,3).map(c=>c.textContent.trim().replace(/\s+/g,' '))))};
 })(),{sent:[[{tbl:'receipt',read:'sales,production,finance',write:''},{tbl:'customer',read:'',write:'customers'}]],
  shown:[['receipt','Sales Production Finance','Everyone'],['customer','Everyone','Customers']]});

 eq('не администратор сервера: ни колонки Server, ни Access',await (async()=>{
  srv.admin=false;await t.p.evaluate(()=>cloudAccessLoad());
  return t.p.evaluate(()=>{tab='users';subtab='office';render();const col=!!document.querySelector('[data-user-server]');
   subtab='cloud';render();return {col,access:!!document.querySelector('[data-cloud-rules]')};});
 })(),{col:false,access:false});
 eq('Users ↔ сервер без ошибок страницы',t.errs,[]);
 await t.c.close();
};
