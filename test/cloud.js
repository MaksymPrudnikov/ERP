/* Users → Cloud (этап 4 «Базы»): вход на сервер и проверка связи. Сервер
   поддельный (page.route): настоящего Supabase в тестах нет. */
module.exports=async function({page,eq}){
 console.log('cloud');
 const t=await page();
 const calls=[];let password='right-pass',expires=3600;
 await t.c.route('https://testref.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),body=JSON.parse(req.postData()||'{}'),h=req.headers();
  calls.push({path:u.pathname+u.search,apikey:h.apikey,auth:h.authorization,body});
  const json=(status,o)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
  if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password')
   return body.password===password?json(200,{access_token:'A1',refresh_token:'R1',expires_in:expires,user:{email:body.email}}):json(400,{error_description:'Invalid login credentials'});
  if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='refresh_token')
   return body.refresh_token==='R1'?json(200,{access_token:'A2',refresh_token:'R2',expires_in:3600,user:{email:'admin@glass-erp.test'}}):json(400,{error_description:'Invalid refresh token'});
  if(u.pathname==='/rest/v1/rpc/erp_whoami')
   return /Bearer A[12]$/.test(h.authorization||'')?json(200,{user_id:'u1',name:'Admin',admin:true}):json(401,{message:'JWT expired'});
  return json(404,{message:'Not found'});
 });
 await t.c.route('https://offline.supabase.co/**',r=>r.abort());
 const open=()=>t.p.evaluate(()=>{tab='users';subtab='cloud';render();});
 const fill=async(pass)=>{
  await t.p.fill('#cl_url','https://supabase.com/dashboard/project/testref');await t.p.fill('#cl_key','sb_publishable_test');
  await t.p.fill('#cl_email','admin@glass-erp.test');await t.p.fill('#cl_pass',pass);
  await t.p.click('[data-cloud-connect]');
  await t.p.waitForFunction(()=>!cloudState.busy);
 };
 await open();
 eq('Users → Cloud: вкладка, пусто — «Not connected»',await t.p.evaluate(()=>({tab:!!document.querySelector('[data-users-side="cloud"]'),status:document.querySelector('[data-cloud-status]').dataset.cloudStatus})),{tab:true,status:'off'});

 await fill('wrong');
 eq('неверный пароль: ошибка сервера на экране, сессии нет',await t.p.evaluate(()=>({status:document.querySelector('[data-cloud-status]').textContent,session:!!cloudConfig().session})),{status:'Invalid login credentials',session:false});

 calls.length=0;await fill('right-pass');
 eq('вход: ссылка панели → адрес проекта; ключ в каждом запросе; whoami с токеном входа; «Connected · Admin · admin»',await t.p.evaluate(()=>({status:document.querySelector('[data-cloud-status]').textContent,url:cloudConfig().url})),{status:'Connected · Admin · admin',url:'https://testref.supabase.co'});
 eq('запросы: пароль только во входе, apikey везде, Bearer A1 у whoami',calls.filter(c=>!/erp_rules|erp_members/.test(c.path)).map(c=>[c.path,c.apikey,c.auth,'password' in c.body]),[
  ['/auth/v1/token?grant_type=password','sb_publishable_test','Bearer sb_publishable_test',true],
  ['/rest/v1/rpc/erp_whoami','sb_publishable_test','Bearer A1',false]]);
 eq('пароль нигде не сохранён: ни в localStorage, ни в базе ERP',await t.p.evaluate(()=>{const ls=Object.keys(localStorage).map(k=>localStorage.getItem(k)).join('|');return {ls:ls.includes('right-pass'),db:JSON.stringify(DB).includes('right-pass'),db2:JSON.stringify(DB).includes('sb_publishable_test')};}),{ls:false,db:false,db2:false});

 eq('Connect ещё раз без пароля — вход остаётся, только проверка связи',await (async()=>{await t.p.fill('#cl_pass','');await t.p.click('[data-cloud-connect]');await t.p.waitForFunction(()=>!cloudState.busy);
  return t.p.evaluate(()=>({status:document.querySelector('[data-cloud-status]').textContent,session:!!cloudConfig().session}));})(),{status:'Connected · Admin · admin',session:true});
 calls.length=0;
 eq('токен истёк: Check берёт новый по refresh и проверяет связь',await t.p.evaluate(async()=>{const c=cloudConfig();c.session.exp=Date.now()-1;cloudConfigSave(c);await cloudCheck();return {me:cloudState.me&&cloudState.me.name,access:cloudConfig().session.access};}),{me:'Admin',access:'A2'});
 eq('…запросы: refresh, затем whoami с новым токеном',calls.map(c=>[c.path,c.auth]),[['/auth/v1/token?grant_type=refresh_token','Bearer sb_publishable_test'],['/rest/v1/rpc/erp_whoami','Bearer A2']]);

 eq('после F5 адрес и ключ на месте, вход тоже; Sign out — сессии нет, адрес остался',await (async()=>{
  await t.p.reload();await t.p.evaluate(()=>window.storageReady);await open();
  const kept=await t.p.evaluate(()=>({url:document.getElementById('cl_url').value,status:document.querySelector('[data-cloud-status]').dataset.cloudStatus}));
  await t.p.click('[data-cloud-out]');
  return Object.assign(kept,await t.p.evaluate(()=>({session:!!cloudConfig().session,url2:cloudConfig().url,after:document.querySelector('[data-cloud-status]').dataset.cloudStatus})));
 })(),{url:'https://testref.supabase.co',status:'signed',session:false,url2:'https://testref.supabase.co',after:'off'});

 eq('нет сети: «No connection to the server.»',await t.p.evaluate(async()=>{const c=cloudConfig();c.url='https://offline.supabase.co';cloudConfigSave(c);await cloudConnect(c.url,c.key,'a@b.c','x');return cloudState.error;}),'No connection to the server.');
 eq('ключ с лишним символом (…) — понятная ошибка, а не «нет связи»',await t.p.evaluate(async()=>{await cloudConnect('https://testref.supabase.co','sb_publishable_…','a@b.c','x');return cloudState.error;}),'The key has extra characters. Copy it again.');
 eq('Users → Cloud без ошибок страницы',t.errs,[]);
 await t.c.close();
};
