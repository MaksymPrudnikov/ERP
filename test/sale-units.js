/* Единица продажи айтема, этап 2 части 3 плана Master Data (владелец,
   22.10.2026): Sales unit карточки — ft², погонный дюйм периметра, вес или
   штука; свой минимум площади и суммы поднимает счёт; мин./макс. размер
   только предупреждает. Единица и минимумы замораживаются на Save. */
module.exports=async function({page,eq}){
 console.log('sale units · item card');
 const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.suReset=function(){oqReset();DB.priceList=[];const g=glassProductByCode('6CLEAR');Object.assign(g,{salesUnit:'sqft',minAreaFt2:null,minCharge:null,minWidthIn:null,minHeightIn:null,maxWidthIn:null,maxHeightIn:null});return g;};
  /* Двойной 40 × 50 из 6CLEAR без ручных цен: 13.9 ft², периметр 180″. */
  window.suDraft=function(){tab='sales';salesOrderNew('order');salesSetUnitType('double');salesApplyCustomerDefaults(oqCustomer({legalName:'Unit Co'}).id);
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');m.panes.forEach(p=>{p.glassProductId=g.id;p.heatTreatmentId='HT-AN';p.priceOverride=null;});m.cavities.forEach(c=>{c.priceOverride=3;});
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:40*16,height16:50*16,qty:1});soDraft.lines=[l];salesEnsureLineShape(l);return l;};
  window.suMat=l=>salesLineCommercialPrice(l,soDraft).materials;
 });

 eq('Sales unit карточки: ft² как раньше; погонный дюйм периметра; штука; кг — вес лайта',await t.p.evaluate(()=>{
  const g=suReset(),base=g.salePriceAnnealed,l=suDraft(),a=salesLineAreas(l,soDraft),out={per:a.perimeterIn,area:a.billable};
  out.sqft=suMat(l)===salesMoney((base*2+3)*a.billable);
  g.salesUnit='inch';out.inch=suMat(l)===salesMoney(base*180*2+3*a.billable);
  g.salesUnit='each';out.each=suMat(l)===salesMoney(base*2+3*a.billable);
  g.salesUnit='kg';const kg=glassLayerWeightKg(glassEffectiveThicknessMm(g).mm,GLASS_DENSITY_KG_M3,a.actual);out.kg=suMat(l)===salesMoney(base*kg*2+3*a.billable);
  out.rows=salesLineCommercialPrice(l,soDraft).materialRows.map(r=>r.unit);
  salesDraftDrop(true);return out;
 }),{per:180,area:13.9,sqft:true,inch:true,each:true,kg:true,rows:['kg','kg','sqft']});

 eq('свой минимум площади и суммы поднимает счёт с пометкой; ручная цена юнита главнее',await t.p.evaluate(()=>{
  const g=suReset(),base=g.salePriceAnnealed,l=suDraft(),a=salesLineAreas(l,soDraft),out={};
  g.minAreaFt2=20;let p=salesLineCommercialPrice(l,soDraft);out.minArea=p.materials===salesMoney(base*20*2+3*a.billable);out.note=p.materialRows[0].note;
  g.minAreaFt2=null;g.salesUnit='each';g.minCharge=100;p=salesLineCommercialPrice(l,soDraft);out.minCharge=p.materials===salesMoney(200+3*a.billable);out.note2=p.materialRows[0].note;
  l.priceManual=50;out.manual=salesLineCommercialPrice(l,soDraft).unit;
  salesDraftDrop(true);return out;
 }),{minArea:true,note:'min 20 ft²',minCharge:true,note2:'min charge 100.00',manual:50});

 eq('Save замораживает единицу и минимум; правка карточки не меняет сохранённый заказ',await t.p.evaluate(()=>{
  const g=suReset();g.salesUnit='each';g.minCharge=100;const l=suDraft();salesOrderSave();const id=soDraft.id,before=salesRecord(id).priceBook;salesDraftDrop(true);
  const was=finWithOrder(salesRecord(id),()=>suMat(salesRecord(id).lines[0]));
  g.salesUnit='sqft';g.minCharge=null;touch();
  const now=finWithOrder(salesRecord(id),()=>suMat(salesRecord(id).lines[0]));
  return {unit:before['unit:glassProduct:'+g.id],min:before['minCharge:glassProduct:'+g.id],same:was===now};
 }),{unit:'each',min:100,same:true});

 eq('мин. и макс. размер — предупреждение в строке и при Save, заказ сохраняется',await t.p.evaluate(()=>{
  const g=suReset();g.maxWidthIn=36;g.minHeightIn=60;const l=suDraft();
  const probs=salesItemSizeProblems(l,soDraft),status=salesLineServiceStatus(l).label;
  let asked='';const keep=window.confirm;window.confirm=m=>{if(/Item size/.test(m))asked=m;return true;};
  try{salesOrderSave();}finally{window.confirm=keep;}
  const saved=!!salesRecord(soDraft.id);salesDraftDrop(true);
  return {probs,status,asked:asked.includes('Line 1 · 6CLEAR: over max 36 × —″'),saved};
 }),{probs:['6CLEAR: over max 36 × —″','6CLEAR: under min — × 60″'],status:'Item size · 6CLEAR',asked:true,saved:true});

 eq('карточка: Sales unit и правила продажи у стекла и плёнки; разбор цены показывает части',await t.p.evaluate(()=>{
  const g=suReset();tab='masterdata';mdTab='materials';mdGlassEdit(g.id);render();
  const glass=['md_salesunit','md_minArea','md_minCharge','md_maxW'].every(id=>!!document.getElementById(id));
  document.getElementById('md_minArea').value='6';document.getElementById('md_salesunit').value='inch';mdGlassSave();
  const saved=[glassProductById(g.id).minAreaFt2,glassProductById(g.id).salesUnit];
  mdMatCategory='lamination';mdMatView='interlayerProduct';mdCatKind='interlayerProduct';mdCatEdit=DB.interlayerProduct[0].id;mdCatDraft=JSON.parse(JSON.stringify(DB.interlayerProduct[0]));render();
  const film=!!document.getElementById('md_salesunit')&&!!document.getElementById('md_minCharge');mdCatEdit=null;mdCatDraft=null;mdEdit=null;mdDraft=null;
  const l=suDraft();tab='sales';const html=salesPricePanel(l);salesDraftDrop(true);suReset();
  return {glass,saved,film,rows:html.includes('data-material-rows')&&html.includes('/ inch × 180')};
 }),{glass:true,saved:[6,'inch'],film:true,rows:true});
 await t.p.close();
};
