/* Data → Catalog и шесть разделов (план Master Data; владелец 23.10.2026):
   дерево групп слева, превью строки справа, поиск по всему каталогу;
   вкладка Weight norms ушла — плотность стекла в Setup, плёнки в её карточке. */
module.exports=async function({page,eq}){
 console.log('master data catalog');const t=await page(undefined,{width:1440,height:1000});
 eq('six sections; the tree opens a list; a row click shows the preview; Open card opens the tabbed card',await t.p.evaluate(()=>{
  tab='masterdata';mdSetTab('materials');render();
  const sections=[...document.querySelectorAll('[data-md-section]')].map(b=>b.textContent.trim());
  document.querySelector('[data-md-node="spacerVariant"]').click();
  const list=!!document.querySelector('[data-spacer-health]');
  const sp=DB.spacerVariant[0],row=document.querySelector('[data-md-row="spacerVariant:'+sp.id+'"] td');row.click();
  const peek=document.querySelector('[data-md-peek]').getAttribute('data-md-peek');
  [...document.querySelectorAll('[data-md-peek] button')].find(b=>b.textContent==='Open card').click();
  return {sections,list,peek,card:!!document.querySelector('[data-md-card="spacer"]')};
 }),{sections:['Catalog','Prices','Production','Shipping','Company & print','Setup'],list:true,peek:'spacerVariant:'+await t.p.evaluate(()=>DB.spacerVariant[0].id),card:true});
 /* Аудит 25.10.2026, D-1: превью у Supply points, Hardware и Recipes. */
 eq('Supply points, Hardware models and Recipes preview a row like Glass; Open card / Open recipe goes to it',await t.p.evaluate(()=>{
  DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock',leadTimeDays:5})];
  const sh=DB.glassSheet[0],m=DB.hardwareModel[0],rc=DB.surroundRecipe[0],facts=()=>[...document.querySelectorAll('[data-md-peek] dt')].map(d=>d.textContent);
  const peekOf=sel=>{document.querySelector(sel).click();return document.querySelector('[data-md-peek]').getAttribute('data-md-peek');};
  tab='masterdata';mdCatalogGo('glassSheet');const supply=peekOf('[data-md-row="glassSheet:'+sh.id+'"] td:nth-child(3)'),supplyFacts=facts(),noPrice=!supplyFacts.some(f=>f==='Purchase price'||f==='Price'||f==='Freight');
  [...document.querySelectorAll('[data-md-peek] button')].find(b=>b.textContent==='Open card').click();const sheetForm=mdSheetEdit===sh.id;mdSheetEdit=null;
  mdCatalogGo('hardwareModel');const row=peekOf('[data-md-row="hardwareModel:'+m.id+'"] td'),hwFacts=facts();
  mdCatalogGo('surroundRecipe');const recipe=peekOf('[data-md-row="surroundRecipe:'+rc.id+'"] label'),btn=[...document.querySelectorAll('[data-md-peek] button')].find(b=>b.textContent==='Open recipe');btn.click();const on=!!document.querySelector('[data-recipe="'+rc.id+'"].md-recipe-on');
  const empty=DB.surroundRecipe.find(r=>r.rows.some(x=>x.part!=='spacer'&&x.part!=='gas'&&x.amount==null));let unknown=null;
  if(empty){mdPeek='surroundRecipe:'+empty.id;render();const p=document.querySelector('[data-md-peek]');unknown={null:/null/.test(p.textContent),warn:/norm missing/.test(p.textContent)};}
  return {supply,supplyFacts:supplyFacts.slice(0,3),noPrice,sheetForm,row,hw:hwFacts.includes('Kind')&&hwFacts.includes('On drawings'),recipe,on,unknown};
 }),await t.p.evaluate(()=>({supply:'glassSheet:'+DB.glassSheet[0].id,supplyFacts:['Glass','Supplier','Sheet'],noPrice:true,sheetForm:true,
  row:'hardwareModel:'+DB.hardwareModel[0].id,hw:true,recipe:'surroundRecipe:'+DB.surroundRecipe[0].id,on:true,
  unknown:DB.surroundRecipe.some(r=>r.rows.some(x=>x.part!=='spacer'&&x.part!=='gas'&&x.amount==null))?{null:false,warn:true}:null})));
 /* Аудит 25.10.2026, D-3: плитки каталога — только в обзоре Catalog. */
 eq('catalog tiles only on the catalog overview: not over other sections, an open card or a search',await t.p.evaluate(()=>{
  const kpi=()=>!!document.querySelector('[data-md-kpi]');tab='masterdata';mdCatalogGo('glassProduct');const over=kpi();
  mdGlassEdit(DB.glassProduct[0].id);render();const card=kpi();mdEdit=null;
  mdCatalogQuery='argon';render();const search=kpi();mdCatalogQuery='';
  const other=['prices','company','setup','trucks'].map(k=>{mdSetTab(k);render();return kpi();});mdSetTab('materials');render();
  return {over,card,search,other};
 }),{over:true,card:false,search:false,other:[false,false,false,false]});
 /* Владелец 26.10.2026 (аудит D-2): закупочные цены в Data видит и правит
    только тот, у кого Cost & margin; администратор (Users) — всё. */
 eq('Cost & margin: purchase prices in Data only with the tick or for the admin; Save without it keeps them',await t.p.evaluate(()=>{
  const keep={no:window.GF_NO_SIGNIN,user:window.signinUser,on:window.signinOn};
  const as=access=>{window.GF_NO_SIGNIN=false;window.signinOn=()=>true;window.signinUser=()=>({name:'T',viewProfileId:'t',access});};
  DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock',purchasePrice:12.5,freightPct:3,priceDate:'2026-10-01'})];
  const sh=DB.glassSheet[0],sp=DB.spacerVariant[0];sp.purchasePrice=40;
  const look=()=>{tab='masterdata';mdSheetEdit=null;mdSpacerEdit=null;mdCatalogGo('glassSheet');const cols=[...document.querySelectorAll('.md-supply-table thead th')].map(th=>th.textContent.trim()).filter(Boolean);
   mdSheetEditRow(sh.id);const form=!!document.getElementById('md_sheetPrice')&&!document.getElementById('md_sheetPrice').closest('[hidden]');
   mdSheetSave();const saved=[DB.glassSheet[0].purchasePrice,DB.glassSheet[0].freightPct,DB.glassSheet[0].priceDate];
   mdCatalogGo('spacerVariant');mdSpacerEditRow(sp.id);const spacer=!document.getElementById('md_spBuyPrice').closest('[hidden]')&&!!document.querySelector('[data-md-cost]');mdSpacerSave();
   return {price:cols.includes('Purchase price'),form,saved,spacer,spKept:DB.spacerVariant.find(x=>x.id===sp.id).purchasePrice,can:accessCost()};};
  /* Настройки колонок уже есть: без галочки цены нет, с галочкой она снова видна. */
  tab='masterdata';mdCatalogGo('glassSheet');salesListSavePrefs();
  try{as(['masterdata']);const data=look();as(['masterdata','cost']);const cost=look();as(['masterdata','users']);const admin=look();return {data,cost,admin};}
  finally{window.GF_NO_SIGNIN=keep.no;window.signinUser=keep.user;window.signinOn=keep.on;mdSheetEdit=null;mdSpacerEdit=null;render();}
 }),{data:{price:false,form:false,saved:[12.5,3,'2026-10-01'],spacer:false,spKept:40,can:false},
  cost:{price:true,form:true,saved:[12.5,3,'2026-10-01'],spacer:true,spKept:40,can:true},
  admin:{price:true,form:true,saved:[12.5,3,'2026-10-01'],spacer:true,spKept:40,can:true}});
 /* Аудит 25.10.2026, D-4: одна строка инструментов, счётчики открытого
    списка, найденное считается и показывается дальше, модели выше видов. */
 eq('catalog lists: one toolbar row, counts for the open list, search count and Show more, Hardware models above kinds',await t.p.evaluate(()=>{
  tab='masterdata';mdCatalogGo('glassProduct');const tb=document.querySelector('[data-md-toolbar]');
  const glass=[tb.querySelectorAll('input').length,tb.querySelectorAll('select').length,!!tb.querySelector('.pri')];
  const head=k=>{mdCatalogGo(k);return [...document.querySelectorAll('[data-md-health] .pill')].map(p=>p.textContent.replace(/\s*\d+$/,''));};
  const counts={glass:head('glassProduct'),gas:head('gasProduct'),spacer:head('spacerVariant'),works:head('serviceRate'),hw:head('hardwareModel')};
  mdCatalogGo('gasProduct');const gasNew=!!document.querySelector('.md-toolbar .pri');
  mdCatalogQuery='a';mdCatalogLimit=0;render();const found=+document.querySelector('[data-md-search-count]').textContent.split(' ')[0],first=document.querySelectorAll('[data-md-search] tbody tr').length;
  const more=document.querySelector('[data-md-more]');if(more)more.click();const next=document.querySelectorAll('[data-md-search] tbody tr').length;mdCatalogQuery='';
  mdCatalogGo('hardwareModel');const order=[...document.querySelectorAll('.section-title h3')].map(h=>h.textContent);
  return {glass,counts,gasNew,paged:found>MD_PAGE?[first,next]:[found,found],order};
 }),await t.p.evaluate(()=>{const found=mdCatalogSearch('a').length;return {glass:[1,3,true],counts:{glass:['No price'],gas:['No price'],spacer:['No price','No weight','Not measured','No recipe'],works:['No station'],hw:[]},gasNew:true,
  paged:found>MD_PAGE?[MD_PAGE,Math.min(found,2*MD_PAGE)]:[found,found],order:['Models','Kinds']};}));
 /* Аудит D-5: модель Hardware и строка поставки — в общем виде карточки;
    над открытой карточкой нет шапки каталога; длинное имя — шире. */
 eq('Hardware model and supply row open in the common card; no catalog head over an open card; the name field is wide',await t.p.evaluate(()=>{
  tab='masterdata';DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'})];
  const look=sel=>[!!document.querySelector(sel),!!document.querySelector('[data-md-health]'),!!document.getElementById('mdCatalogSearch')];
  mdCatalogGo('hardwareModel');mdHwModelEditRow(DB.hardwareModel[0].id);const hw=look('[data-md-card="hwModel"]'),title=document.querySelector('[data-md-card="hwModel"] h3').textContent===DB.hardwareModel[0].name;mdHwModelEdit=null;
  mdCatalogGo('glassSheet');mdSheetEditRow(DB.glassSheet[0].id);const sheet=look('[data-md-card="sheet"]'),err=!!document.getElementById('e_mdSheet');mdSheetEdit=null;
  mdCatalogGo('glassProduct');mdGlassEdit(DB.glassProduct[0].id);const wide=!!document.getElementById('md_name').closest('.md-wide');mdEdit=null;render();
  return {hw,title,sheet,err,wide,back:!!document.querySelector('[data-md-health]')};
 }),{hw:[true,false,false],title:true,sheet:[true,false,false],err:true,wide:true,back:true});
 eq('catalog search finds a row in any table; Open goes to its card',await t.p.evaluate(()=>{
  mdSetTab('materials');mdCatalogQuery='argon';render();
  const rows=document.querySelectorAll('[data-md-search] tbody tr').length;
  document.querySelector('[data-md-search] tbody button').click();
  return {rows,card:document.querySelector('[data-md-card]').getAttribute('data-md-card'),query:mdCatalogQuery};
 }),{rows:1,card:'cat-gasProduct',query:''});
 eq('glass density lives in Setup; film density in the film card; Weight norms tab is gone',await t.p.evaluate(()=>{
  mdSetTab('setup');render();const inp=document.querySelector('[data-setup-density]');inp.value='2600';inp.dispatchEvent(new Event('change'));
  const glass=DB.materialWeightRates.find(r=>r.key==='glass').rate;
  mdCatalogGo('interlayerProduct');const f=DB.interlayerProduct[0];mdCatEditRow(f.id);render();
  document.getElementById('md_filmDensity').value='1070';mdCatSave();
  return {glass,film:(DB.materialWeightRates.find(r=>r.key==='film:'+f.id)||{}).rate,weightTab:MD_TABS.some(x=>x.k==='weight')};
 }),{glass:2600,film:1070,weightTab:false});
 eq('glass card without supply: + Supply row opens a row for this glass; Inventory size code opens its supply row',await t.p.evaluate(()=>{
  DB.glassSheet=[normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'})];
  const sh=DB.glassSheet[0],g=DB.glassProduct.find(p=>p.code!==sh.productCode&&!glassSheetsFor(p.code).length);
  tab='masterdata';mdCatalogGo('glassProduct');mdGlassEdit(g.id);
  document.querySelector('[data-md-glass-supply-add]').click();
  const draft=[mdSheetEdit,mdSheetDraft.productCode===g.code,document.getElementById('md_sheetCode').value===g.code];
  mdSheetEdit=null;tab='inventory';invView='sizes';render();
  document.querySelector('[data-inv-size="'+cutSheetTrimKey(sh.sheetWIn,sh.sheetHIn)+'"] [data-inv-size-supply="'+sh.productCode+'"]').click();
  return {draft,tab,open:DB.glassSheet.find(x=>x.id===mdSheetEdit).productCode===sh.productCode};
 }),{draft:['new',true,true],tab:'masterdata',open:true});
};
