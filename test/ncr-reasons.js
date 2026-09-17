/* Справочник NCR «Где + Что»: станции и Office, общие причины, добавление,
   переименование, Active, сохранение, JSON, английский экран, XSS, телефон. */
module.exports=async function({page,eq,ok}){
 console.log('ncr reasons');const t=await page();
 const open=where=>t.p.evaluate(where=>{tab='masterdata';mdSetTab('ncr');if(where)ncrSelect(where);},where);
 const rowOf=name=>t.p.evaluate(name=>{const r=DB.ncrReason.find(x=>x.name===name);return r&&r.id;},name);

 eq('стартовый набор: Office первым, у каждой станции общие и свои причины, у Office только свои',await t.p.evaluate(()=>{
  const where=ncrWhereList().map(w=>w.code),stations=DB.station.map(s=>s.code);
  return {office:where[0],stations:stations.every(c=>where.includes(c)),own:stations.every(c=>ncrReasonsFor(c).some(r=>r.where===c)),
   base:ncrReasonsFor('*').map(r=>r.name),heat:ncrReasonsFor('HEAT').map(r=>r.name),office:ncrReasonsFor('OFFICE').map(r=>r.name),
   ids:new Set(DB.ncrReason.map(r=>r.id)).size===DB.ncrReason.length,sources:NCR_SOURCES,actions:NCR_ACTIONS};
 }),{office:'OFFICE',stations:true,own:true,base:['Impact','Broke','Chipped','Scratched','Fell from dolly / skid'],
  heat:['Impact','Broke','Chipped','Scratched','Fell from dolly / skid','Exploded in furnace','Broke in quench','Broke in heat soak','Bow / warp','Roller marks','Wrong treatment (FT / HS)'],
  office:['Order entered wrong','Drawing wrong','Cut list wrong','Program error'],ids:true,sources:['Found in shop','Customer claim'],actions:['Remake order','Repair','Replace from stock','Credit','No action']});

 eq('новая станция сразу появляется в «Где» и получает общие причины',await t.p.evaluate(()=>{
  DB.station.push(Object.assign({},DB.station[0],{seq:99,code:'WASH',name:'Washer',nameEn:'Washer'}));
  const has=ncrWhereList().some(w=>w.code==='WASH'),reasons=[...new Set(ncrReasonsFor('WASH').map(r=>r.where))];DB.station.pop();return {has,reasons};
 }),{has:true,reasons:['*']});

 await open('HEAT');
 eq('вкладка Master Data → NCR: место слева, причины справа; общие на станции только для чтения',await t.p.evaluate(()=>{
  const tabs=[...document.querySelectorAll('.tabs button')].map(b=>b.textContent),rows=[...document.querySelectorAll('[data-ncr-reason]')];
  const base=rows.filter(r=>r.textContent.includes('All stations')),own=rows.filter(r=>r.textContent.includes('HEAT only'));
  return {tab:tabs.includes('NCR'),on:document.querySelector('[data-ncr-where="HEAT"]').classList.contains('on'),rows:rows.length,base:base.length,own:own.length,
   baseReadOnly:base.every(r=>!r.querySelector('input')),ownEditable:own.every(r=>r.querySelector('[data-ncr-name]')&&r.querySelector('[data-ncr-active]')),title:document.querySelector('.ncr-head h3').textContent};
 }),{tab:true,on:true,rows:11,base:5,own:6,baseReadOnly:true,ownEditable:true,title:'HEAT · Heat treatment'});

 await t.p.locator('[data-ncr-new]').fill('Broke on loading table');await t.p.locator('[data-ncr-add]').click();
 await t.p.locator('[data-ncr-new]').fill('impact');await t.p.locator('[data-ncr-add]').click();
 eq('+ Add reason добавляет причину только этой станции; повтор общей причины не проходит',await t.p.evaluate(()=>{
  const dup=document.querySelector('.ncr-error').textContent;const empty=ncrReasonAdd('HEAT','   ');
  return {heat:ncrReasonsFor('HEAT').some(r=>r.name==='Broke on loading table'&&r.where==='HEAT'),cut:ncrReasonsFor('CUT').some(r=>r.name==='Broke on loading table'),dup,empty,officeSame:ncrReasonAdd('OFFICE','Impact')};
 }),{heat:true,cut:false,dup:'Already exists',empty:'Enter a reason.',officeSame:''});

 await open('*');
 await t.p.locator('[data-ncr-new]').fill('Cracked in handling');await t.p.locator('[data-ncr-add]').click();
 eq('All stations: новая общая причина появляется на каждой станции, но не в Office; совпадение со станцией не проходит',await t.p.evaluate(()=>({
  cut:ncrReasonsFor('CUT').some(r=>r.name==='Cracked in handling'),ship:ncrReasonsFor('SHIP').some(r=>r.name==='Cracked in handling'),office:ncrReasonsFor('OFFICE').some(r=>r.name==='Cracked in handling'),
  clash:ncrReasonAdd('*','Roller marks')})),{cut:true,ship:true,office:false,clash:'Already exists'});

 const chipped=await rowOf('Chipped');
 await t.p.locator(`[data-ncr-reason="${chipped}"] .ncr-switch span`).click();
 await open('EDGE');
 eq('выключенная общая причина не предлагается ни на одной станции, но остаётся в справочнике серой',await t.p.evaluate(id=>{
  const row=document.querySelector(`[data-ncr-reason="${id}"]`);
  return {edge:ncrReasonsFor('EDGE',{activeOnly:true}).some(r=>r.id===id),heat:ncrReasonsFor('HEAT',{activeOnly:true}).some(r=>r.id===id),kept:DB.ncrReason.some(r=>r.id===id&&!r.active),grey:row.classList.contains('ncr-off'),label:row.querySelector('.ncr-active').textContent};
 },chipped),{edge:false,heat:false,kept:true,grey:true,label:'Off'});

 const burn=await rowOf('Polish burn');
 await t.p.locator(`[data-ncr-reason="${burn}"] [data-ncr-name]`).fill('Polish burn marks');await t.p.locator(`[data-ncr-reason="${burn}"] [data-ncr-name]`).press('Enter');
 await t.p.locator(`[data-ncr-reason="${burn}"] [data-ncr-name]`).fill('');await t.p.locator(`[data-ncr-reason="${burn}"] [data-ncr-name]`).press('Tab');
 eq('название правится в строке; пустое название не записывается и показывает ошибку',await t.p.evaluate(id=>({name:DB.ncrReason.find(r=>r.id===id).name,error:(document.querySelector('.ncr-error')||{}).textContent,
  clash:ncrReasonRename(id,'Wrong edgework')}),burn),{name:'Polish burn marks',error:'Enter a reason.',clash:'Already exists'});

 const saved=await t.p.evaluate(()=>JSON.stringify(DB.ncrReason));
 await t.p.reload();
 eq('после перезагрузки справочник тот же',await t.p.evaluate(saved=>JSON.stringify(DB.ncrReason)===saved,saved),true);

 eq('JSON: справочник переживает экспорт и импорт; старый файл без NCR получает стартовый набор; испорченное поле не импортируется',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const old=JSON.parse(JSON.stringify(src));delete old.ncrReason;const seeded=prepareImportedState(old).ncrReason;
  let error='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(src)),{ncrReason:{}}));}catch(e){error=e.message;}
  return {same:JSON.stringify(next.ncrReason)===JSON.stringify(src.ncrReason),seeded:seeded.length===ncrSeedRows().length,error};
 }),{same:true,seeded:true,error:'The "ncrReason" field must be an array.'});

 await open('HEAT');
 eq('экран без русского; название причины не исполняет HTML',await t.p.evaluate(()=>{
  ncrReasonAdd('HEAT','<img src=x onerror="window.ncrXss=1">');render();
  return {russian:/[А-яЁё]/.test(document.querySelector('.ncr-layout').innerText),imgs:document.querySelectorAll('.ncr-layout img').length,xss:!!window.ncrXss,shown:[...document.querySelectorAll('[data-ncr-name]')].some(i=>i.value.startsWith('<img'))};
 }),{russian:false,imgs:0,xss:false,shown:true});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне вкладка NCR не шире экрана',await t.p.evaluate(()=>{render();return document.documentElement.scrollWidth<=innerWidth+1;}),true);
 eq('справочник NCR без ошибок страницы',t.errs,[]);await t.c.close();
};
