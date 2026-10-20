/* Комиссии тем, кто привёл клиента (владелец, 11.10.2026): человек со
   стороны, 1–3 клиента со своим процентом; процент — только с того, что
   клиент заплатил, без HST (галочка — колонки с HST); выплаты владелец
   записывает сам; раздел свой, продажники его не видят. */
module.exports=async function({page,eq,ok}){
 console.log('commissions');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.cmPay=function(id,amount,date){const o=salesRecord(id);DB.receipt.push(normalizeReceipt({number:'R-'+String(DB.receipt.length+1).padStart(4,'0'),customerId:o.customerId,date:date||finToday(),method:'cheque',reference:'#'+(DB.receipt.length+1),amount,allocations:[{orderId:id,amount}]}));touch();return DB.receipt[DB.receipt.length-1];};
  window.cmSeed=function(){oqReset();DB.receipt=[];DB.referrer=[];DB.referrerPayout=[];
   const sky=oqCustomer({legalName:'Skyline Glazing'}),north=oqCustomer({legalName:'Northview Windows'});
   const a=oqOrder(sky),b=oqOrder(north);salesDraftDrop();return {sky,north,a,b};};
 });

 eq('Процент — только с оплаченного и без HST: заплатили половину заказа — комиссия с половины суммы без налога; с HST — отдельной колонкой',await t.p.evaluate(()=>{
  const {sky,a}=cmSeed(),o=salesRecord(a),tt=finOrderTotals(o),half=finMoney(tt.grand/2);cmPay(a,half);
  const r=comSave({name:'Sergey Petrov',phone:'416-555-0101',customers:[{customerId:sky.id,pct:3}]}).value,s=comSummary(r,null);
  const base=finMoney(half*(tt.grand-tt.hst)/tt.grand);
  return {orders:s.orders,base:s.base===base,com:s.com===finMoney(base*0.03),comHst:s.comHst===finMoney(half*0.03),hst:tt.hst>0,toPay:s.toPay===s.com};
 }),{orders:1,base:true,com:true,comHst:true,hst:true,toPay:true});

 eq('Аннулированная оплата не считается; оплата прошлого года — не в «This year», но в долге за всё время',await t.p.evaluate(()=>{
  const {sky,a}=cmSeed(),y=+finToday().slice(0,4);cmPay(a,100);cmPay(a,50,(y-1)+'-06-15');const v=cmPay(a,30);v.voided=true;v.voidReason='Bounced';
  const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:10}]}).value,tt=finOrderTotals(salesRecord(a)),k=(tt.grand-tt.hst)/tt.grand;
  const year=comSummary(r,{from:y+'-01-01',to:y+'-12-31'}),all=comSummary(r,null);
  return {yearPaid:year.paid,allPaid:all.paid,com:all.com===finMoney(finMoney(150*k)*0.1),toPay:year.toPay===all.com};
 }),{yearPaid:100,allPaid:150,com:true,toPay:true});

 eq('Дважды за один заказ не заплатить: выплата закрывает долг заказов; вторая — «Nothing to pay»; клиент доплатил — к выплате только новая часть; удалили выплату — долг вернулся',await t.p.evaluate(()=>{
  const {sky,a,b}=cmSeed();const o2=oqOrder(sky);salesDraftDrop();cmPay(a,200);cmPay(o2,100);
  const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:5}]}).value,before=comSummary(r,null).toPay;
  const p1=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a,o2],note:'Cash'}).value;
  const after=comSummary(r,null).toPay,again=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a,o2]}).error;
  cmPay(a,100);const d=comDue(r).get(a),tt=finOrderTotals(salesRecord(a)),k=(tt.grand-tt.hst)/tt.grand;
  const onlyNew=d.due===finMoney(finMoney(finMoney(300*k)*0.05)-finMoney(finMoney(200*k)*0.05));
  const p2=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a,o2]}).value;
  comPayoutDelete(p1.id);const back=comDue(r).get(o2).due>0&&comDue(r).get(a).due===comDue(r).get(a).com-p2.amount;
  return {p1:p1.orders.length,sum:p1.amount===before,after,again,onlyNew,p2:p2.orders.map(x=>x.orderId===a),back,other:!!b};
 }),{p1:2,sum:true,after:0,again:'Nothing to pay.',onlyNew:true,p2:[true],back:true,other:true});

 eq('Клиент — у одного человека: отдал клиента другому — у первого он пропал; без имени и без процента не сохраняется',await t.p.evaluate(()=>{
  const {sky,north}=cmSeed();const a=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:3},{customerId:north.id,pct:2}]}).value;
  const b=comSave({name:'Olga Marchenko',email:'olga@example.com',customers:[{customerId:north.id,pct:4}]}).value;
  return {a:comFind(a.id).customers.map(c=>c.customerId===sky.id),b:comOfCustomer(north.id).name,noName:comSave({name:' ',customers:[]}).error,noPct:comSave({name:'X',customers:[{customerId:sky.id,pct:''}]}).error};
 }),{a:[true],b:'Olga Marchenko',noName:'Enter a name.',noPct:'Enter a percent from 0.01 to 100.'});

 eq('Раздел Agents — своя галочка: без неё пункта меню нет и вкладка не открывается; продажник с Sales его не видит',await t.p.evaluate(()=>{
  const old=window.accessCan;
  try{window.accessCan=k=>k!=='commissions';tab='commissions';render();const hidden=!document.querySelector('.side [title="Agents"]'),moved=tab!=='commissions';
   window.accessCan=k=>true;tab='commissions';render();const shown=!!document.querySelector('.side [title="Agents"]')&&!!document.querySelector('[data-com-table]');
   return {inSections:USER_SECTIONS.includes('commissions'),hidden,moved,shown};}
  finally{window.accessCan=old;tab='dashboard';render();}
 }),{inSections:true,hidden:true,moved:true,shown:true});

 eq('Экран: люди с итогами, With HST — ещё колонки; клик — заказы человека, «To pay», + Payout записывает выплату',await t.p.evaluate(()=>{
  const {sky,north,a,b}=cmSeed();cmPay(a,200);cmPay(b,300);
  comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:3}]});comSave({name:'Olga Marchenko',customers:[{customerId:north.id,pct:5}]});
  comOpen='';comDraft=null;comPayDraft=null;comHst=false;comPeriod='year';tab='commissions';render();
  const heads=()=>[...document.querySelectorAll('[data-com-table] thead th')].map(x=>x.textContent);const h1=heads();
  const people=[...document.querySelectorAll('[data-com-row] td:first-child')].map(x=>x.textContent);
  document.querySelector('[data-com-hst]').click();const h2=heads().length;
  document.querySelector(`[data-com-row="${comOfCustomer(north.id).id}"]`).click();const orders=[...document.querySelectorAll('[data-com-order]')].map(x=>x.dataset.comOrder);
  const before=document.querySelector('[data-com-topay]').textContent;document.querySelector('[data-com-pay]').click();
  const checked=[...document.querySelectorAll('[data-com-pay-order]')].map(x=>x.checked),total=document.querySelector('[data-com-pay-total]').textContent;document.querySelector('[data-com-pay-save]').click();
  const after=document.querySelector('[data-com-topay]').textContent,due=document.querySelector('[data-com-due]').textContent,payouts=[...document.querySelectorAll('[data-com-payouts] tbody tr td:nth-child(3)')].map(x=>x.textContent);
  document.querySelector('[data-com-pay]').click();const nothing=/Nothing to pay/.test(document.querySelector('[data-com-pay-form]').textContent)&&document.querySelector('[data-com-pay-save]').disabled;
  comPayDraft=null;comHst=false;tab='dashboard';render();
  return {h1,people,h2,orders:orders.length===1&&orders[0]===salesRecord(b).businessNumber,checked,total:total===before,after,due,payouts:payouts.length===1&&payouts[0].startsWith(salesRecord(b).businessNumber+' '),nothing};
 }),{h1:['Person','Contact','Customers · %','Orders','Paid','Commission','Paid out','To pay'],people:['Olga Marchenko','Sergey Petrov'],h2:10,orders:true,checked:[true],total:true,after:'$0.00',due:'$0.00',payouts:true,nothing:true});

 eq('Export / Import JSON: люди и выплаты переносятся, мусор чистится',await t.p.evaluate(()=>{
  const {sky,a}=cmSeed();cmPay(a,500);const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:3}]}).value;const paid=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a],note:''}).value.amount;
  const next=prepareImportedState(JSON.parse(JSON.stringify(Object.assign({},DB,{referrer:DB.referrer.concat([{id:'x',name:''},null]),referrerPayout:DB.referrerPayout.concat([{id:'p',referrerId:'nobody',date:finToday(),amount:5}])}))));
  return {people:next.referrer.map(x=>x.name),pct:next.referrer[0].customers[0].pct,payouts:next.referrerPayout.map(p=>p.amount===paid&&p.orders.length)};
 }),{people:['Sergey Petrov'],pct:3,payouts:[1]});

 /* Ревью 12.10.2026 (агент): переплата по одному заказу не вычиталась из
    выплаты по другому — одну комиссию можно было выплатить дважды. */
 eq('Оплату перенесли на другой заказ после выплаты: новая выплата не платит второй раз («earlier payouts cover it»), выплачено = начислено',await t.p.evaluate(()=>{
  const {sky,a}=cmSeed();const b=oqOrder(sky);salesDraftDrop();const r0=cmPay(a,500);
  const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:10}]}).value;comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a,b]});
  r0.allocations=[{orderId:b,amount:500}];touch();
  const again=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a,b]}).error,s=comSummary(r,null);
  return {again,paidOut:s.paidOut===s.earned,toPay:s.toPay};
 }),{again:'Nothing to pay: earlier payouts cover it.',paidOut:true,toPay:0});

 eq('Переплата вычитается из следующей выплаты строкой: заказ отменили и удалили после выплаты, клиент заплатил по новому — выплата только разницы',await t.p.evaluate(()=>{
  const {sky,a}=cmSeed();cmPay(a,300);const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:10}]}).value;
  const p1=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a]}).value.amount;
  DB.receipt.forEach(x=>{x.allocations=x.allocations.filter(al=>al.orderId!==a);});DB.salesOrder=DB.salesOrder.filter(o=>o.id!==a);touch();
  const b=oqOrder(sky);salesDraftDrop();cmPay(b,500);const due=comDue(r),gone=[...due.values()].find(x=>x.orderId===a);
  const p2=comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[b]}).value,s=comSummary(r,null);
  return {gone:gone&&gone.number==='Deleted order'&&gone.due===-p1,lines:p2.orders.length,amount:p2.amount===finMoney(due.get(b).due-p1),paidOut:s.paidOut===s.earned,dues:[...comDue(r).values()].every(x=>x.due===0)};
 }),{gone:true,lines:2,amount:true,paidOut:true,dues:true});

 eq('Экран Agents считает итоги заказа один раз за показ (раньше ~10 раз на заказ)',await t.p.evaluate(()=>{
  const {sky,north,a,b}=cmSeed();const c=oqOrder(sky);salesDraftDrop();[a,b,c].forEach(id=>cmPay(id,100));
  const r=comSave({name:'Sergey Petrov',customers:[{customerId:sky.id,pct:3},{customerId:north.id,pct:2}]}).value;comPayoutAdd({referrerId:r.id,date:finToday(),orderIds:[a]});
  const old=window.finOrderTotals;let n=0;window.finOrderTotals=o=>{n++;return old(o);};
  try{comOpen=r.id;comDraft=null;comPayDraft={referrerId:r.id,date:finToday(),note:'',orderIds:[b,c]};comHst=true;tab='commissions';render();}finally{window.finOrderTotals=old;}
  comPayDraft=null;comHst=false;tab='dashboard';render();return {calls:n};
 }),{calls:3});

 /* Новый процент — с даты From; прошлые оплаты по прежнему (владелец,
    19–20.10.2026, вариант Б; аудит COM04). */
 const rate=await t.p.evaluate(()=>{const {sky,a}=cmSeed();cmPay(a,100,'2026-10-15');const r=comSave({name:'Ivan Rate',customers:[{customerId:sky.id,pct:10}]}).value;
  tab='commissions';comOpen=r.id;comEditOpen(r.id);return {id:r.id,a,sky:sky.id};});
 await t.p.locator('[data-com-customer="0"] input[aria-label="Percent"]').fill('12');await t.p.locator('[data-com-customer="0"] input[aria-label="Percent"]').press('Tab');
 const fromDefault=await t.p.locator('[data-com-from]').inputValue();
 await t.p.locator('[data-com-from]').fill('2026-10-20');await t.p.locator('[data-com-save]').click();
 eq('процент с From: оплата до даты — по 10 %, после — по 12 %; прежний процент хранится; повторный Save историю не трогает; пустой процент — ошибка',await t.p.evaluate(x=>{
  cmPay(x.a,100,'2026-10-25');const r=comFind(x.id),c=r.customers[0],k=comNoHstShare(finOrderTotals(salesRecord(x.a))),row=comSummary(r,null).rows[0];
  const again=comSave(JSON.parse(JSON.stringify(r))).value.customers[0],empty=comSave(Object.assign(JSON.parse(JSON.stringify(r)),{customers:[{customerId:x.sky,pct:''}]})).error;
  render();const label=document.querySelector('[data-com-row]').textContent.includes('12%');comOpen='';tab='dashboard';render();
  return {stored:{pct:c.pct,from:c.from,was:c.was},com:row.com===finMoney(finMoney(100*k)*0.1+finMoney(100*k)*0.12),pct:row.pct,again:{from:again.from,was:again.was.length},empty,label};
 },rate),{stored:{pct:12,from:'2026-10-20',was:[{pct:10,from:''}]},com:true,pct:'10 · 12',again:{from:'2026-10-20',was:1},empty:'Enter a percent from 0.01 to 100.',label:true});
 eq('From по умолчанию — сегодня',fromDefault,await t.p.evaluate(()=>finToday()));

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
