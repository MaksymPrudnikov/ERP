/* Short name стекла (владелец, 29.10.2026): код задаётся один раз и
   остаётся ключом — к нему привязаны поставка, склад, раскрой; Short name —
   то, что читают люди; Name — полное название. Пусто — код, как раньше.
   Код и Short name — одно пространство имён: чужое не занять. */
module.exports=async function({page,eq}){
 console.log('glass short name');
 const t=await page(undefined,{width:1600,height:1000});await require('./optimization-fixture')(t.p);
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main функций ещё нет). */
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  window.snErr=()=>{const e=document.getElementById('e_mdGlass');return e&&e.style.display!=='none'?e.textContent:'';};
  /* Карточка стекла: вписать Short name (и код) и нажать Save. */
  window.snSave=(code,short,newCode)=>{const g=glassProductByCode(code);tab='masterdata';mdCatalogGo('glassProduct');mdGlassEdit(g.id);const el=document.getElementById('md_short');if(el)el.value=short;
   if(newCode)document.getElementById('md_code').value=newCode;mdGlassSave();const err=snErr();mdEdit=null;render();return err;};
 });
 eq('Data → Glass: Short name в карточке и таблице; пустые — черта у строки, add, счётчик, полоса и фильтр',await run(()=>{
  tab='masterdata';mdCatalogGo('glassProduct');const g=glassProductByCode('6CLEAR'),err=snSave('6CLEAR','6 Clear');
  mdSearch='6CLEAR';render();
  const row=document.querySelector('[data-md-row="glassProduct:'+g.id+'"]'),heads=[...document.querySelectorAll('.customer-table-wrap thead th')].map(x=>x.textContent).slice(0,3);
  const other=glassProductByCode('6E272');mdSearch='6E272';render();
  const miss=document.querySelector('[data-md-row="glassProduct:'+other.id+'"]'),add=miss&&miss.querySelector('.md-short-add');
  const live=DB.glassProduct.filter(x=>x.active!==false&&!x.shortName).length;
  const pill=[...document.querySelectorAll('[data-md-health] .pill')].map(x=>x.textContent).find(x=>/short/.test(x))||'';
  const banner=document.querySelector('[data-md-short-banner]');
  mdSearch='';mdStatus='noshort';render();const only=mdVisibleProducts().length===live&&mdVisibleProducts().every(x=>!x.shortName);
  mdStatus='all';mdSearch='6 clear';render();const found=mdVisibleProducts().map(x=>x.code);mdSearch='';render();
  if(add)add.click();const focus=document.activeElement&&document.activeElement.id;mdEdit=null;render();
  return {err,saved:glassProductByCode('6CLEAR').shortName,heads,cell:row?row.querySelector('[data-md-short]').textContent:'',noshortRow:!!(miss&&miss.classList.contains('md-row-noshort')),add:!!add,
   pill:pill==='No short name '+live,banner:!!banner&&banner.textContent.includes(String(live)),only,found,focus};
 }),{err:'',saved:'6 Clear',heads:['Code','Short name','Name'],cell:'6 Clear',noshortRow:true,add:true,pill:true,banner:true,only:true,found:['6CLEAR'],focus:'md_short'});
 eq('одно пространство имён: чужой код и чужое короткое название не берутся; своё можно',await run(()=>{
  const otherCode=[snSave('6E272','6CLEAR'),glassProductByCode('6E272').shortName||''];
  const otherShort=[snSave('6E272','6  clear'),glassProductByCode('6E272').shortName||''];
  const own=[snSave('6E272','6E272'),glassProductByCode('6E272').shortName||''];snSave('6E272','');
  /* Новое стекло с кодом, который уже короткое название другого. */
  snSave('6CLEAR','6CL');mdGlassNew();document.getElementById('md_code').value='6cl';document.getElementById('md_name').value='Probe';mdGlassSave();
  const newCode=[snErr(),!!glassProductByCode('6CL')];mdEdit=null;snSave('6CLEAR','6 Clear');
  return {otherCode,otherShort,own,newCode};
 }),{otherCode:['6CLEAR is the code of another glass',''],otherShort:['6 clear is the short name of 6CLEAR',''],own:['','6E272'],newCode:['6cl is the short name of 6CLEAR',false]});
 eq('смена кода сохранённого стекла — вопрос: «нет» оставляет код, «да» меняет; у нового стекла вопроса нет',await run(()=>{
  const keep=window.confirm;let asked=0;window.confirm=()=>{asked++;return true;};
  try{
   mdGlassNew();document.getElementById('md_code').value='PROBE1';document.getElementById('md_name').value='Probe';mdGlassSave();mdEdit=null;const onNew=asked;
   const g=glassProductByCode('PROBE1'),run=answer=>{window.confirm=m=>{asked=m;return answer;};mdGlassEdit(g.id);document.getElementById('md_code').value='PROBE2';mdGlassSave();mdEdit=null;return glassProductById(g.id).code;};
   const no=run(false),text=/linked by the code/.test(asked),yes=run(true);return {onNew,no,text,yes};
  }finally{window.confirm=keep;mdEdit=null;render();}
 }),{onNew:0,no:'PROBE1',text:true,yes:'PROBE2'});
 /* Владелец, 29.10.2026: «всё, что идёт к клиенту, — имя; сокращения —
    для общения внутри и чертежей». */
 eq('внутри — Short name (Sales, заказ, Work order, чертёж, станция, раскрой, файл станка), клиенту — Name (документы, packing slip, стикер); связи и сумма — по коду',await run(()=>{
  oqReset();const g=glassProductByCode('6CLEAR');snSave('6CLEAR','');
  const id=oqOrder(oqCustomer({legalName:'Short Name Glass'})),o=salesRecord(id),l=o.lines[0],m=salesMakeupById(o,l.makeupId),pane=m.panes[0];
  const doc=kind=>{const md=docBuildModel(kind,o,{makeupShort:true,makeupFull:true}),it=md.items[0];return [it.short.split(' / ')[0],it.full[0].split(' · ')[0]];};
  const look=name=>{const info=salesListInfo(o),comp=glassBatchComponents(o,l)[0],sum=salesMakeupSummary(m),sheet={glass:comp.glass,no:1};return {
   inside:{glass:salesListGlass(o)===name+' / '+name,makeup:sum.startsWith(name+' / ')&&sum.endsWith(' / '+name),drawing:salesSheetPaneText(pane,0).startsWith(name),
    station:glassCodeLabel(comp.glass)===name,maver:cutUiTrialFolderName({batch:'1001',sheet},'maver').split('_')[1],disai:cutTrialDisaiBase({batch:'1001',sheet}).split('_').pop(),
    workOrder:doc('workOrder')},
   client:{confirmation:doc('confirmation'),slip:salesMakeupSummary(m,'name').split(' / ')[0],sticker:stkGlassText(stkGlassInfo(pane,0,''),{}),stickerCode:stkGlassText(stkGlassInfo(pane,0,''),{code:true})},
   key:comp.glass,purchase:docMakeupShort(m).split(' / ')[0],
   byCode:salesListFilterTest({k:'glass',type:'text'},{conds:[{op:'contains',v:'6clear'}]},info),
   notCode:salesListFilterTest({k:'glass',type:'text'},{conds:[{op:'notContains',v:'6clear'}]},info),
   tokens:salesListTokens(info,'glass')};};
  const total=finOrderTotals(o).grand,plain=look('6CLEAR');snSave('6CLEAR','6 Clear');const named=look('6 Clear');
  return {plain,named,sameTotal:finOrderTotals(salesRecord(id)).grand===total,heat:docHeatCode(pane),name:g.name};
 }),await t.p.evaluate(()=>{
  const g=glassProductByCode('6CLEAR'),heat=' T',client={confirmation:[g.name+heat,'Lite 1: '+g.name],slip:g.name,sticker:g.name,stickerCode:'6CLEAR'};
  const common={key:'6CLEAR',purchase:'6CLEAR'+heat,byCode:true,notCode:false};
  return {plain:Object.assign({inside:{glass:true,makeup:true,drawing:true,station:true,maver:'6CLEAR',disai:'6CLEAR',workOrder:['6CLEAR'+heat,'Lite 1: '+g.name+' (6CLEAR)']},client},common,{tokens:['6CLEAR']}),
   named:Object.assign({inside:{glass:true,makeup:true,drawing:true,station:true,maver:'6-Clear',disai:'6Clear',workOrder:['6 Clear'+heat,'Lite 1: '+g.name+' (6 Clear)']},client},common,{tokens:['6 Clear']}),
   sameTotal:true,heat,name:g.name};
 }));
 /* Владелец, 29.10.2026: «поставщики пусть будет имя тоже». */
 eq('поставщику — Name: спецификация юнита, состав и описание без нашего кода; строка Glass code в PO выключена, и правка 10 выключает её в старой базе',await run(()=>{
  const id=DB.salesOrder[0].id,o=salesRecord(id),g=glassProductByCode('6CLEAR'),l=purOrderComponentLine(id,o.lines[0].id),part=purOrderComponentLine(id,o.lines[0].id,glassBatchComponents(o,o.lines[0])[0].key);
  const keep={fix:DB.dataFix,opts:DB.purchaseDocumentOptions};DB.purchaseDocumentOptions=Object.assign({},keep.opts,{productCode:true});DB.dataFix=9;applyDataFixes();
  const fixed=DB.purchaseDocumentOptions.productCode;DB.dataFix=keep.fix;DB.purchaseDocumentOptions=keep.opts;
  return {description:l.description.split(' / ')[0],makeup:l.spec.makeup[0].split(' · ')[0],part:part.description.split(' · ')[0],code:[l.description,part.description,...l.spec.makeup].some(x=>/6CLEAR/.test(x)),
   name:g.name,option:purDocOptions({}).productCode,fixed};
 }),await t.p.evaluate(()=>{const g=glassProductByCode('6CLEAR');return {description:g.name+docHeatCode(salesMakeupById(DB.salesOrder[0],DB.salesOrder[0].lines[0].makeupId).panes[0]),makeup:'Lite 1: '+g.name,part:g.name,code:false,name:g.name,option:false,fixed:false};}));
 await t.c.close();
};
