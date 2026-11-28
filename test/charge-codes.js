/* Коды сборов заказа (вариант A владельца, 27.11.2026): у всего, что стоит денег,
   — набор процентных сборов ES · HST · свои % · Card fee; код — именованный
   набор в Data → Setup. Свои сборы («+ Charge», % или Fixed), код у работы и у
   разового сервиса (Custom… — галочки только для него), код сбора в заказе.
   Заказы без своих кодов считаются до цента как раньше. */
module.exports=async function({page,eq}){
 console.log('charge codes');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  window.ccOrder=function(){const id=oqOrder(oqCustomer());salesOrderEdit(id);soDraft.lines=[soDraft.lines[0]];soDraft.lines[0].qty=1;return soDraft;};
  window.ccAdd=function(form){const l=soDraft.lines[0];salesExtraFormOpen('line:'+l.id);if(form.rateId)salesExtraFormSet('rateId',form.rateId);if(form.code)salesExtraFormSet('code',form.code);Object.assign(soExtraForm,form);return salesExtraAdd();};
 });

 eq('Setup до кодов: галочки базы становятся кодами — ES «HST + card», HST «Card only», доставка под HST — свой код «HST only»; снимок нового заказа несёт наборы',await run(()=>{
  const keep=JSON.stringify(DB.orderSetup);
  try{
   DB.orderSetup={energyOn:true,energyRate:9.75,hstOn:true,hstRate:13,hstOnEnergy:true,hstOnDelivery:true,cardOn:false,cardOnEnergy:true,cardOnHst:true,cardOnDelivery:false,deliveryOn:false,deliveryAmount:0,skidDepositOn:false,skidDepositAmount:0};
   normalizeOrderSetup();const s=orderSetup(),name=id=>s.chargeCodes.find(c=>c.id===id).name,c=salesOrderChargeDefaults();
   return {codes:s.chargeCodes.map(c=>c.name+':'+c.on.join(',')),refs:[name(s.energyCode),name(s.hstCode),name(s.deliveryCode),name(s.skidDepositCode)],
    snap:[c.items.on.join(','),c.energy.on.join(','),c.hst.on.join(','),c.delivery.on.join(','),c.skidDeposit.on.join(',')],old:'hstOnDelivery' in s};
  }finally{DB.orderSetup=JSON.parse(keep);normalizeOrderSetup();}
 }),{codes:['Standard:energy,hst,card','HST + card:hst,card','Card only:card','No charges:','HST only:hst'],refs:['HST + card','Card only','HST only','No charges'],
  snap:['energy,hst,card','hst,card','card','hst',''],old:false});

 eq('заказ до кодов (hst.base / card.base) считается до цента как прежняя формула',await run(()=>{
  const legacy={energy:{enabled:true,rate:9.75},hst:{enabled:true,rate:13,base:['energy','delivery']},card:{enabled:true,network:'visa',name:'Visa card fee',rate:2.34,base:['energy','hst']},delivery:{enabled:true,amount:150},skidDeposit:{enabled:true,amount:40}};
  const S=1234.567,base=salesCents(S),energy=salesCents(S*9.75/100),hstBase=salesMoney(base+energy+150),hst=salesCents(hstBase*13/100),cardBase=salesMoney(base+energy+hst),card=salesCents(cardBase*2.34/100);
  const want=[energy,hstBase,hst,cardBase,card,salesMoney(base+energy+hst+card+150+40)],x=salesApplyOrderCharges(S,legacy);
  const plain=salesApplyOrderCharges(S,{});
  return {same:JSON.stringify([x.energy,x.hstBase,x.hst,x.cardBase,x.card,x.grand])===JSON.stringify(want),on:[x.charges.energy.on,x.charges.hst.on,x.charges.delivery.on,x.charges.skidDeposit.on].map(a=>a.join(',')),
   plain:[plain.hstBase,plain.cardBase]};
 }),{same:true,on:['hst,card','card','hst',''],plain:[1354.94,1531.08]});

 eq('пример владельца: кран — HST + card, разрешение — Custom без всего, доставка в этом заказе — HST + card, Visa; базы под итогом',await run(()=>{
  const o=ccOrder(),c=o.orderCharges=normalizeSalesOrderCharges(o.orderCharges);
  const t0=salesOrderCommercialTotals(o),exact=t0.energyBase;
  ccAdd({name:'Crane rental',unit:'pc',rate:'200',code:'hst-card'});
  ccAdd({name:'City permit',unit:'pc',rate:'50',code:'custom',on:[]});
  salesSetOrderChargeEnabled('delivery',true);salesSetOrderChargeValue('delivery','amount','150');salesSetOrderChargeCode('delivery','hst-card');salesSetOrderChargeEnabled('card',true);
  const tt=salesOrderCommercialTotals(o),S=salesExact(exact+250);
  const energy=salesCents(salesExact(S-250)*9.75/100),hstBase=salesMoney(salesCents(S-50)+energy+150),hst=salesCents(hstBase*13/100),cardBase=salesMoney(salesCents(S-50)+energy+hst+150),card=salesCents(cardBase*2.34/100);
  salesOpenMetrics('orderCharges');const bases=(document.querySelector('[data-order-bases]')||{}).textContent||'',codeSel=!!document.querySelector('[data-order-charge="delivery"] select.metric-charge-code');
  salesCloseMetrics&&salesCloseMetrics();salesOpenLineServices(o.lines[0].id);render();const tags=[...document.querySelectorAll('[data-extra-code-tag]')].map(x=>x.textContent);salesCloseServices();
  const x=o.lines[0].extraServices.map(e=>[e.name,(e.on||[]).join(','),e.code]);
  return {sums:JSON.stringify([tt.energy,tt.hstBase,tt.hst,tt.cardBase,tt.card,tt.grand])===JSON.stringify([energy,hstBase,hst,cardBase,card,salesMoney(salesCents(S)+energy+hst+card+150)]),
   x,free:tt.uncharged.map(f=>f.name+' '+f.amount),bases:/ES on .* · HST on .* · Visa card fee on .* · not charged: City permit 50\.00/.test(bases),codeSel,tags};
 }),{sums:true,x:[['Crane rental','hst,card','hst-card'],['City permit','','']],free:['City permit 50'],bases:true,codeSel:true,tags:['HST + card','Custom']});

 eq('Charge code работы (Data → Works): снимается со всех сборов — строка «not charged»; код по умолчанию — снова под всеми',await run(()=>{
  soDraft=null;soEdit=null;salesMetricsPanel=null;navGo('masterdata');mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('roughArris');render();
  const opts=[...document.querySelectorAll('#md_catChargeCode option')].map(o=>o.textContent);
  document.getElementById('md_catChargeCode').value='none';mdCatSave();const saved=DB.serviceRate.find(w=>w.id==='roughArris').chargeCode;
  const o=ccOrder(),has=salesLineChargeRows(o.lines[0]).some(r=>r.svc==='roughArris'),a=salesOrderCommercialTotals(o).uncharged.map(f=>f.name);
  soDraft=null;soEdit=null;navGo('masterdata');mdSetTab('works');mdCatKind='serviceRate';mdCatEditRow('roughArris');render();document.getElementById('md_catChargeCode').value='';mdCatSave();
  const b=salesOrderCommercialTotals(ccOrder()).uncharged.map(f=>f.name);
  return {opts,saved,has,a,b,gone:!('chargeCode' in DB.serviceRate.find(w=>w.id==='roughArris'))};
 }),{opts:['Default · Standard','HST + card','Card only','No charges'],saved:'none',has:true,a:['Rough Arris'],b:[],gone:true});

 eq('аудит: сохранённый до кода работы заказ не меняется, когда работе ставят код; открытый в Sales — с кодом; Save пишет снимок, и дальше код работы его не меняет',await run(()=>{
  soDraft=null;soEdit=null;const keep=JSON.stringify(DB.serviceRate);
  try{
   const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;
   const o=salesRecord(id),t0=salesOrderCommercialTotals(o),hadKey=Object.keys(o.priceBook||{}).some(k=>k.indexOf('snap:svcOn:')===0);
   DB.serviceRate.find(w=>w.id==='roughArris').chargeCode='none';
   const t1=salesOrderCommercialTotals(o);
   salesOrderEdit(id);const open=salesOrderCommercialTotals(soDraft);
   const saved=salesOrderSave();soDraft=null;soEdit=null;const o2=salesRecord(id),key=o2.priceBook&&o2.priceBook['snap:svcOn:roughArris'];
   DB.serviceRate.find(w=>w.id==='roughArris').chargeCode='hst-card';
   const t2=salesOrderCommercialTotals(salesRecord(id));
   return {hadKey,same:t1.grand===t0.grand&&t1.energyBase===t0.energyBase,open:open.energyBase<t0.energyBase&&open.uncharged.some(f=>f.name==='Rough Arris'),saved:!!saved,key,keeps:t2.grand===open.grand&&t2.energyBase===open.energyBase};
  }finally{DB.serviceRate=JSON.parse(keep);}
 }),{hadKey:false,same:true,open:true,saved:true,key:'',keeps:true});

 eq('Commission (28.11): у каждого сбора галочка «в базе комиссии агента» — HST и свой PST не идут, остальное как было; снимок заказа; старый заказ — всё, кроме HST',await run(()=>{
  const keep=JSON.stringify(DB.orderSetup);
  try{
   soDraft=null;soEdit=null;
   orderSetupChargeAdd();const id=DB.orderSetup.charges[0].id;orderSetupChargeSet(id,'name','PST');orderSetupChargeSet(id,'kind','percent');orderSetupChargeSet(id,'value','8');orderSetupChargeSet(id,'enabled',true);orderSetupCodeToggle(0,id,true);
   const c=newSalesOrderDraft().orderCharges,flags=[c.energy.com,c.hst.com,c.card.com,c.delivery.com,c.skidDeposit.com,c.extra[0].com];
   const t=salesApplyOrderCharges(1000,c),pst=t.extra[0].amount,share=comNoHstShare(t);
   const c2=JSON.parse(JSON.stringify(c));c2.extra[0].com=true;const t2=salesApplyOrderCharges(1000,c2);
   const old=salesApplyOrderCharges(1000,{energy:{enabled:true,rate:9.75},hst:{enabled:true,rate:13}});
   navGo('masterdata');mdSetTab('setup');render();const box=!!document.querySelector('[data-setup="hstCom"]')&&!!document.querySelector('[data-setup-charge-com="'+id+'"]');
   return {flags,excl:t.comExcluded===salesMoney(t.hst+pst),share:Math.abs(share-(t.grand-t.hst-pst)/t.grand)<1e-12,ticked:t2.comExcluded===t2.hst,old:old.comExcluded===old.hst,box};
  }finally{DB.orderSetup=JSON.parse(keep);normalizeOrderSetup();}
 }),{flags:[true,false,true,true,true,false],excl:true,share:true,ticked:true,old:true,box:true});

 eq('аудит Qwen №2: копейки — от итога заказа: сумма строк Products · sold = итог до HST, разбивка бланка (с отменёнными юнитами) = Subtotal',await run(()=>{
  soDraft=null;soEdit=null;
  const id=oqOrder(oqCustomer());salesOrderEdit(id);const o=soDraft;o.lines.forEach(l=>{l.qty=1;});
  /* Каждая позиция — с половиной цента: сумма строк в центах уходит от итога. */
  o.lines.forEach(l=>{const e=salesLineCommercialPrice(l,o).exact,x=+(Math.floor(e*100)/100+0.005+1-e).toFixed(6);salesExtraFormOpen('line:'+l.id);Object.assign(soExtraForm,{name:'Half',unit:'pc',rate:String(x)});salesExtraAdd();});
  o.cancellations=[{id:'CX1',lineId:o.lines[0].id,units:['u1'],charge:12.34,at:new Date().toISOString()}];
  const ex=o.lines.map(l=>salesLineCommercialPrice(l,o).exact),t=salesOrderCommercialTotals(o);
  const rows=[];repSoldOrder(o,'',rows);const sold=salesMoney(rows.reduce((n,x)=>n+(x.amount||0),0));
  const doc=docBuildModel('invoice',o,Object.assign({},docDefaultOptions('invoice'),{groupTotals:true})).end.rows,at=doc.findIndex(r=>r.label==='Subtotal');
  const cents=v=>Math.round(+String(v).replace(/[^0-9.-]/g,'')*100),parts=doc.slice(0,at),sum=parts.reduce((n,r)=>n+cents(r.value),0);
  soDraft=null;soEdit=null;
  return {halves:ex.every(e=>Math.abs(e*1000%10-5)<1e-6),sold:sold===salesMoney(t.grand-t.hst),groups:sum===Math.round(t.subtotal*100),cancel:parts.some(r=>r.label==='Cancelled units')};
 }),{halves:true,sold:true,groups:true,cancel:true});

 eq('Adjustments с кодом (28.11): поправка «как стекло», с кодом заказа или Custom… — базы ES / HST / карты; кнопка у итога — Charges; итог не налезает',await run(()=>{
  soDraft=null;soEdit=null;const o=ccOrder();o.orderCharges=normalizeSalesOrderCharges(o.orderCharges);salesSetOrderChargeEnabled('card',true);
  const t0=salesOrderCommercialTotals(o);
  salesAddAdjustment();salesSetAdjustment(0,'label','Crane rental');salesSetAdjustment(0,'amount','200');salesSetAdjustmentCode(0,'hst-card');
  salesAddAdjustment();salesSetAdjustment(1,'label','City permit');salesSetAdjustment(1,'amount','50');salesSetAdjustmentCode(1,'custom');['energy','hst','card'].forEach(k=>salesSetAdjustmentOn(1,k,false));
  const t=salesOrderCommercialTotals(o);
  salesOpenMetrics('orderCharges');render();
  const codes=[...document.querySelectorAll('[data-adjustment-code]')].map(s=>s.value),ticks=document.querySelectorAll('[data-adjustment-on]').length;
  const items=[...document.querySelectorAll('.metric-order-charge-preview .metric-order-charge-item:not(.is-empty)')].map(x=>x.getBoundingClientRect()),apart=items.slice(1).every((r,i)=>r.left>=items[i].right-0.5);
  salesSetAdjustmentCode(0,'');const back=!('on' in o.adjustments[0]);
  salesCloseMetrics();const btn=(document.querySelector('.metric-order-service-add')||{}).textContent;soDraft=null;soEdit=null;
  return {es:salesMoney(t.energyBase-t0.energyBase),hst:salesMoney(t.hstBase-t0.hstBase),free:t.uncharged.map(f=>f.name+' '+f.amount),codes,ticks,apart,back,btn:(btn||'').trim()};
 }),{es:0,hst:200,free:['City permit 50'],codes:['hst-card','custom'],ticks:3,apart:true,back:true,btn:'Charges'});

 eq('Setup: «+ Charge» — свой сбор % с колонкой в Charge codes, в окне заказа со своим кодом, на бланке строкой; удалённый код уходит на первый',await run(()=>{
  const keep=JSON.stringify(DB.orderSetup);
  try{
   soDraft=null;soEdit=null;salesMetricsPanel=null;navGo('masterdata');mdSetTab('setup');render();
   document.querySelector('[data-setup-charge-add]').click();const id=DB.orderSetup.charges[0].id;
   orderSetupChargeSet(id,'name','Eco fee');orderSetupChargeSet(id,'kind','percent');orderSetupChargeSet(id,'value','2');orderSetupChargeSet(id,'enabled',true);
   orderSetupCodeToggle(0,id,true);
   const heads=[...document.querySelectorAll('[data-sl-scope="mdSetupCodes"] thead th[data-cw-key]')].map(th=>th.textContent.trim()).filter(Boolean);
   const means=[...document.querySelectorAll('[data-setup-charge] td')].map(td=>td.textContent.trim()).filter(x=>/charged on/.test(x));
   const o=ccOrder(),fresh=newSalesOrderDraft();o.orderCharges=fresh.orderCharges;
   const tt=salesOrderCommercialTotals(o),eco=tt.extra.find(x=>x.name==='Eco fee'),sub=salesCents(tt.energyBase),es=tt.energy;
   const doc=docBuildModel('proforma',o).end.rows.map(r=>r.label).filter(l=>/Eco|HST|Card/.test(l));
   salesOpenMetrics('orderCharges');const row=!!document.querySelector('[data-order-charge="'+id+'"] select.metric-charge-code');
   const n=DB.orderSetup.chargeCodes.length;orderSetupCodeRemove(1);
   const left=[DB.orderSetup.chargeCodes.length,DB.orderSetup.energyCode===DB.orderSetup.chargeCodes[0].id];
   return {heads,means:means.length>=4,eco:[eco.rate,eco.amount===salesCents(sub*2/100)],doc,row,n,left};
  }finally{DB.orderSetup=JSON.parse(keep);normalizeOrderSetup();}
 }),{heads:['Code','ES','HST','Eco fee','Card fee','What it means'],means:true,eco:[2,true],doc:['HST 13%','Eco fee 2%'],row:true,n:4,left:[3,true]});
};
