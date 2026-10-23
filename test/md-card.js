/* Карточка Data в виде плана (view/md-card; владелец 23.10.2026): шапка,
   вкладки слева, точка «не хватает»; все вкладки в странице — Save читает
   поля со всех, переключение не теряет набранное. */
module.exports=async function({page,eq}){
 console.log('master data cards');const t=await page(undefined,{width:1440,height:1000});
 eq('spacer card: tabs on the left, a dot where the price is missing, Save reads fields from every tab',await t.p.evaluate(()=>{
  tab='masterdata';mdSetTab('materials');mdMatSwitch('igu','spacerVariant');
  const sp=DB.spacerVariant[0];sp.salePrice=null;mdSpacerEditRow(sp.id);render();
  const card=document.querySelector('[data-md-card="spacer"]'),tabs=[...card.querySelectorAll('[data-md-tab]')].map(b=>b.textContent.trim());
  const dot=!!card.querySelector('[data-md-tab="prices"] .md-dot'),shown=card.querySelectorAll('.md-card-pane.on').length;
  card.querySelector('[data-md-tab="prices"]').click();document.getElementById('md_spPrice').value='3.10';
  card.querySelector('[data-md-tab="units"]').click();document.getElementById('md_spPack').value='1880';
  const kept=document.getElementById('md_spPrice').value;card.querySelector('[data-md-tab="general"]').click();mdSpacerSave();
  const x=DB.spacerVariant.find(v=>v.id===sp.id);
  return {tabs,dot,shown,kept,price:x.salePrice,pack:x.packQty,closed:mdSpacerEdit===null};
 }),{tabs:['General','Units','Measurements','Purchase','Prices','Stock','Consumption'],dot:true,shown:1,kept:'3.10',price:3.1,pack:1880,closed:true});
 eq('glass card: prices are edited in the card; the open tab survives a re-render',await t.p.evaluate(()=>{
  tab='masterdata';mdSetTab('materials');mdMatSwitch('glass','glassProduct');
  const g=DB.glassProduct.find(p=>p.code==='6CLEAR');mdGlassEdit(g.id);render();
  document.querySelector('[data-md-card="glass"] [data-md-tab="prices"]').click();render();
  const open=document.querySelector('[data-md-card="glass"] .md-card-pane.on').getAttribute('data-md-pane');
  document.getElementById('md_priceFT').value='6.25';mdGlassSave();
  return {open,price:glassProductById(g.id).salePriceTempered,closed:mdEdit===null};
 }),{open:'prices',price:6.25,closed:true});
};
