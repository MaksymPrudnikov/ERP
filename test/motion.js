/* Движение экрана (2.11.2026): заказ — лист от настоящего клика, окно поднимается
   один раз, раздел и вкладка чуть всплывают. Из кода всё синхронно, станция
   мгновенна, при «уменьшить движение» ничего не двигается. */
module.exports=async function({page,eq}){
 console.log('motion');
 const t=await page(undefined,{width:1440,height:900}),p=t.p;await require('./optimization-fixture')(p);
 await p.evaluate(()=>{
  window.mvCount=0;const start=document.startViewTransition.bind(document);
  document.startViewTransition=go=>{window.mvCount++;return start(go);};
  window.mvMode=()=>document.documentElement.dataset.motion||'in';
 });
 const nav=k=>p.click(`#side .nav-item[title="${k}"]`),settle=()=>p.evaluate(()=>new Promise(r=>setTimeout(r,520)));

 eq('из кода раздел меняется сразу и без анимации',await p.evaluate(()=>{navGo('sales');const now=tab;document.querySelector('#side .nav-item[title="Production"]').click();const also=tab;navGo('dashboard');return {now,also,count:mvCount};}),{now:'sales',also:'production',count:0});

 await nav('Sales');await settle();
 const rise=()=>p.evaluate(()=>!!document.querySelector('#app .motion-tab'));
 eq('настоящий клик по разделу — подъём без листа, экран уже на месте; клик по своему разделу не двигает экран',await (async()=>{
  await nav('Production');const moved=await rise(),now=await p.evaluate(()=>tab+':'+mvCount);await nav('Production');
  return {moved,now,again:await rise()};
 })(),{moved:true,now:'production:0',again:false});

 eq('клики идут сквозь анимацию: второй раздел открывается посреди первого',await (async()=>{
  await nav('Production');await nav('Shipping');await settle();
  return p.evaluate(()=>tab);
 })(),'shipping');

 const id=await p.evaluate(()=>{const id=oqOrder(oqCustomer());tab='sales';soDraft=null;soEdit=null;salesShow={orders:true,quotes:false,ncr:false};render();return id;});
 eq('Open — лист вперёд, Close — лист назад; с несохранённым сначала вопрос, без листа',await (async()=>{
  const before=await p.evaluate(()=>mvCount);
  await p.click('[data-order-row] button.sm');await settle();
  const open=await p.evaluate(b=>({n:mvCount-b,mode:mvMode(),edit:!!soEdit}),before);
  await p.click('.sales-save-state ~ button');await settle();
  const close=await p.evaluate(b=>({n:mvCount-b,mode:mvMode(),edit:!!soEdit}),before);
  await p.evaluate(i=>salesOrderEdit(i),id);await p.evaluate(()=>{soDraft.notes='changed';});
  await p.click('.sales-save-state ~ button');
  const dirty=await p.evaluate(b=>({n:mvCount-b,asked:!!document.querySelector('[role="dialog"]'),edit:!!soEdit}),before);
  await p.evaluate(()=>{salesDialog=null;salesDraftDrop(true);render();});
  return {open,close,dirty};
 })(),{open:{n:1,mode:'in',edit:true},close:{n:2,mode:'out',edit:false},dirty:{n:2,asked:true,edit:true}});

 eq('окно поднимается один раз: перерисовка не повторяет движение, из кода окно без движения',await (async()=>{
  await p.evaluate(i=>{salesOrderEdit(i);render();const b=document.createElement('button');b.id='mvWin';b.textContent='w';b.style.cssText='position:fixed;left:200px;top:10px;z-index:99';b.onclick=()=>{salesDialogOpen({title:'T',rows:[],buttons:[]});};document.body.append(b);},id);
  await p.click('#mvWin');
  const first=await p.evaluate(()=>!!document.querySelector('.motion-window'));
  const again=await p.evaluate(()=>{render();return !!document.querySelector('.sales-service-modal-back')&&!document.querySelector('.motion-window');});
  const code=await p.evaluate(()=>{salesDialog=null;render();salesDialogOpen({title:'T',rows:[],buttons:[]});const o=!!document.querySelector('.sales-service-modal-back'),m=!!document.querySelector('.motion-window');salesDialog=null;salesDraftDrop(true);render();document.getElementById('mvWin').remove();return {o,m};});
  return {first,again,code};
 })(),{first:true,again:true,code:{o:true,m:false}});

 eq('вкладка раздела чуть всплывает, из кода — нет',await (async()=>{
  await p.evaluate(()=>{navGo('production');});
  await p.locator('#app .tabs button').nth(1).click();
  const click=await p.evaluate(()=>!!document.querySelector('#app .motion-tab'));
  const code=await p.evaluate(()=>{render();return !!document.querySelector('#app .motion-tab');});
  return {click,code};
 })(),{click:true,code:false});

 eq('станции: настоящий клик не двигает ничего',await (async()=>{
  const b=await p.evaluate(()=>{tab='station';render();const x=document.createElement('button');x.id='mvSt';x.onclick=()=>{window.mvOk=motionOk();motionSheet(()=>{window.mvSync=true;});};document.body.append(x);return mvCount;});
  await p.click('#mvSt',{force:true});
  return p.evaluate(b=>{const r={ok:mvOk,sync:mvSync===true,count:mvCount-b};document.getElementById('mvSt').remove();navGo('dashboard');return r;},b);
 })(),{ok:false,sync:true,count:0});

 await p.emulateMedia({reducedMotion:'reduce'});
 eq('«уменьшить движение» в системе: раздел меняется без движения',await (async()=>{
  await nav('Finance');return {tab:await p.evaluate(()=>tab),moved:await rise()};
 })(),{tab:'finance',moved:false});
 await p.emulateMedia({reducedMotion:null});

 eq('движение не дало ошибок страницы',t.errs,[]);
 await t.c.close();
};
