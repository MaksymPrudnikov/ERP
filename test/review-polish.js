/* Мелочи после проверки Glass Farm (владелец, 2 октября 2026): буквы сторон
   в редакторе формы видны в тёмной теме; имя клиента в шапке заказа не
   обрезается. Overview с 9 октября 2026 — «что сейчас» вместо карты разделов
   (test/reports.js); здесь — что прототипного текста там по-прежнему нет. */
module.exports=async function({page,eq}){
 console.log('review-polish');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 eq('Overview: блоки «что сейчас», плитка ведёт в свой раздел; прототипного текста нет',await t.p.evaluate(()=>{
  tab='dashboard';render();const app=document.getElementById('app'),blocks=['orders','shop','ship','quality'].filter(k=>app.querySelector('[data-dash-'+k+']'));
  const text=app.innerText,stale=['Roadmap','prototype','ERP map','Inventory','Purchasing','needs a decision'].filter(w=>text.includes(w));
  app.querySelector('[data-dash-tile="ready"]').click();const went=tab;tab='dashboard';render();
  return {blocks,stale,went};
 }),{blocks:['orders','shop','ship','quality'],stale:[],went:'shipping'});
 eq('редактор формы: буква A — цвет чертежа в светлой теме и светлее в тёмной',await t.p.evaluate(()=>{
  tab='configurators';subtab='shape';openShapeNew('smart');
  /* color-mix браузер отдаёт как color(srgb 0..1) — приводим к 0..255. */
  const col=()=>{const c=getComputedStyle(document.querySelector('.em-col')).color,m=c.match(/[\d.]+/g).map(Number),k=c.startsWith('color(')?255:1;return m.slice(0,3).map(v=>Math.round(v*k));};
  const lum=m=>m[0]+m[1]+m[2];
  const light=col();themeApply(true);render();const dark=col();themeApply(false);sEdit=null;sDraft=null;tab='dashboard';render();
  return {light,brighter:lum(dark)>lum(light)+150};
 }),{light:[40,40,220],brighter:true});
 eq('шапка заказа: имя клиента целиком, пустых колонок нет',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer({legalName:'Northside Windows Ltd'}));salesDraftDrop&&salesDraftDrop();salesOrderEdit(id);
  const head=document.querySelector('.sales-header-compact'),sel=head.querySelector('select');
  const fits=sel.scrollWidth<=sel.clientWidth&&sel.getBoundingClientRect().width>=200;
  const right=Math.max(...[...head.children].map(x=>x.getBoundingClientRect().right)),edge=head.getBoundingClientRect().right;
  soDraft=null;soEdit=null;tab='dashboard';render();return {fits,noGap:edge-right<20};
 }),{fits:true,noGap:true});
 eq('Customers: статус клиента по-английски (Active / Inactive / Archived), русского на экране нет',await t.p.evaluate(()=>{
  oqReset();const a=oqCustomer({legalName:'Status Active Ltd'}),b=oqCustomer({legalName:'Status Inactive Ltd'});b.status='inactive';
  tab='customers';render();const text=document.getElementById('app').innerText,labels=['active','inactive','archived'].map(customerStatusLabel);
  tab='dashboard';render();return {labels,russian:/[А-яЁё]/.test(text)};
 }),{labels:['Active','Inactive','Archived'],russian:false});
 eq('review-polish без ошибок страницы',t.errs,[]);
 await t.c.close();
};
