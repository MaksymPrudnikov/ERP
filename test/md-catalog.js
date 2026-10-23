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
