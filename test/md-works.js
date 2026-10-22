/* Работы как конструктор, этап 4, часть 2 плана Master Data: надбавки
   (минимальная площадь, Triple, большой юнит) — работы Works с правилом;
   округление количества и минимальная сумма работы; фрит и спандрел
   называют свою работу, и маршрут берёт станцию из неё. */
module.exports=async function({page,eq}){
 console.log('md-works');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.mwOrder=function(){const id=oqOrder(oqCustomer());salesOrderEdit(id);return soDraft;};
  window.mwKeep=function(fn){const keep=JSON.stringify({sr:DB.serviceRate,fr:DB.fritProduct,sp:DB.spandrelProduct});
   try{return fn();}finally{const k=JSON.parse(keep);DB.serviceRate=k.sr;DB.fritProduct=k.fr;DB.spandrelProduct=k.sp;normalizeMasterData();}};
 });
 eq('старые Pricing rules переезжают в надбавки со своими числами; настройки больше нет',await t.p.evaluate(()=>mwKeep(()=>{
  DB.serviceRate=DB.serviceRate.filter(r=>!['minArea','triple','largeUnit'].includes(r.id));
  DB.salesMetricRules={minimumAreaFt2:6,triplePercent:40,largePercent:30,largeThresholdFt2:50,combination:'compound'};
  normalizeMasterData();
  const r=id=>DB.serviceRate.find(x=>x.id===id);
  return [r('minArea').tiers[0].price,r('triple').tiers[0].price,r('largeUnit').tiers[0].price,r('largeUnit').rule.areaOver,r('triple').rule.onTop,r('triple').unit,'salesMetricRules' in DB];
 })),[6,40,30,50,true,'%',false]);
 eq('фрит и спандрел без работы получают её по прежнему правилу маршрута; выбранная пустая — остаётся пустой',await t.p.evaluate(()=>mwKeep(()=>{
  DB.fritProduct.forEach(x=>{delete x.workId;});DB.spandrelProduct.forEach(x=>{delete x.workId;});
  const other=DB.fritProduct.find(x=>x.id!=='FRIT-DIGITAL');other.workId='';
  normalizeMasterData();
  return [mdById('fritProduct','FRIT-DIGITAL').workId,mdById('fritProduct',other.id).workId,[...new Set(DB.spandrelProduct.map(x=>x.workId))]];
 })),['digital_print','',['painting']]);
 eq('карточка работы: надбавка — процент, виды юнита, площадь, порядок; список пишет правило',await t.p.evaluate(()=>mwKeep(()=>{
  tab='masterdata';mdSetTab('works');mdCatKind='serviceRate';mdCatNew();render();
  document.getElementById('md_catName').value='Laminated';
  const k=document.getElementById('md_ruleKind');k.value='percent';k.dispatchEvent(new Event('change'));
  document.getElementById('md_catName').value='Laminated';document.getElementById('md_tierPrice0').value='15';
  document.getElementById('md_ruleT_laminated').checked=true;document.getElementById('md_ruleOver').value='20';document.getElementById('md_rulePriority').value='5';
  mdCatSave();
  const r=DB.serviceRate.find(x=>x.name==='Laminated'),row=document.querySelector(`[data-md-work="${r.id}"]`).textContent.replace(/\s+/g,' ');
  return [r.unit,r.tiers.map(x=>x.price),r.rule.unitTypes,r.rule.areaOver,r.rule.priority,row.includes('+15% · Laminated units, area > 20 ft²')];
 })),['%',[15],['laminated'],20,5,true]);
 eq('округление количества и минимальная сумма работы — на юнит; заметка в количестве',await t.p.evaluate(()=>mwKeep(()=>{
  const o=mwOrder(),l=o.lines[0];
  DB.serviceRate.push(normalizeServiceRate({id:'crate',name:'Crate',unit:'pc',tiers:[{id:'flat',price:10}],roundTo:1,minCharge:50}));
  l.extraServices=[normalizeSalesExtraService({rateId:'crate',qty:2.3})];
  const row=salesLineChargeRows(l).find(r=>r.svc==='crate'),q=salesPositiveInt(l.qty,1),sum=salesLinePricingSummary(l);
  const before=sum.total;l.extraServices[0].qty=6.2;const after=salesLinePricingSummary(l).total;
  return [row.basis,row.minCharge,+((after-before)/q).toFixed(2),salesChargeBasisText(row,l).includes('min 50.00 / unit')];
 })),[3,50,20,true]);
 eq('надбавки не в «+ Add service»; работа, уже начисленная строке сама, — предупреждение',await t.p.evaluate(()=>{
  const o=mwOrder(),l=o.lines[0],cat=salesExtraServiceCatalog().map(r=>r.id);
  salesExtraFormOpen('line:'+l.id);salesExtraFormSet('rateId','roughArris');const dup=salesExtraAutoDup(soExtraForm);
  salesExtraFormSet('rateId','sandblastFull');const other=salesExtraAutoDup(soExtraForm);salesExtraFormClose();
  return [cat.includes('triple'),cat.includes('minArea'),dup,other];
 }),[false,false,true,false]);
 eq('фрит: работа карточки — станция маршрута и строка счёта знает свою работу',await t.p.evaluate(()=>mwKeep(()=>{
  const o=mwOrder(),l=o.lines[0],m=salesMakeupById(o,l.makeupId),p=m.panes[0];
  p.category='vision';p.visionType='frit';p.frit=Object.assign({},p.frit||{},{enabled:true,productId:'FRIT-DIGITAL',surface:2});
  const route=()=>{const s=salesLineGeometryShape(l);return salesPrintRoute(l,o,s,ShapeModule.compute(s)).lites[0].stations.filter(x=>x.items.some(i=>/^Frit/.test(i))).map(x=>x.code).join();};
  const a=route(),glaze=salesLineChargeRows(l).find(r=>r.key.indexOf('GLAZE:frit')===0);
  mdById('fritProduct','FRIT-DIGITAL').workId='sandblastFull';const b=route();
  return [a===salesServiceRateRow('digital_print').station,glaze&&glaze.svc,b];
 })),[true,'digital_print','SAND']);
 await t.c.close();
};
