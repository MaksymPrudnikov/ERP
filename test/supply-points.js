/* Data → Supply points (владелец, 2 октября 2026: «разбросано, без
   корректных фильтров»): таблица на движке Sales с фильтрами колонок;
   форма — Glass (производитель, толщина, поиск) и Supply (точка из списка,
   валюта от точки, дата календарём). */
module.exports=async function({page,eq}){
 console.log('supply-points');const t=await page(undefined,{width:1440,height:900});
 await t.p.evaluate(()=>{DB.glassSheet=[];[['6CLEAR','Vitro Barrie','CAD',2.85],['6CLEAR','Vitro USA','USD',2.1],['10CLEAR','Cardinal Toronto','CAD',4.4]].forEach(([c,s,cur,pr])=>DB.glassSheet.push(normalizeGlassSheet({productCode:c,supplier:s,currency:cur,sheetWIn:144,sheetHIn:96,purchasePrice:pr,priceDate:'2026-09-20',availability:'stock'})));
  try{localStorage.removeItem('glass_erp_mdSupply_list_v1');}catch(e){}tab='masterdata';mdTab='materials';mdMatCategory='glass';mdMatView='glassSheet';render();});
 eq('supply rows: a Sales-style table with column filters; a filter by supply point narrows the rows',await t.p.evaluate(()=>{
  const rows=()=>document.querySelectorAll('[data-supply-row]').length,heads=[...document.querySelectorAll('.md-supply-table thead [data-filter-col]')].map(b=>b.dataset.filterCol);
  const all=rows();salesListSetFilter('supplier',{values:['Vitro USA']});const one=rows(),cur=(document.querySelector('[data-supply-row]')||{textContent:''}).textContent.includes('USD');salesListSetFilter('supplier',null);
  return {scope:salesListScope(),heads:heads.slice(0,4),all,one,cur,back:rows()};
 }),{scope:'mdSupply',heads:['product','glass','supplier','sheet'],all:3,one:1,cur:true,back:3});
 eq('new supply row: manufacturer, thickness and search narrow the glass list without losing typed values',await t.p.evaluate(()=>{
  mdSheetNew();if(!document.getElementById('md_sheetMfr'))return {missing:true};document.getElementById('md_sheetPrice').value='3.15';
  const opts=()=>[...document.getElementById('md_sheetCode').options].map(o=>o.value),total=opts().length;
  mdSheetPickSet('mfr','Vitro');mdSheetPickSet('thick','6');const narrowed=opts(),vitro6=narrowed.every(c=>{const p=glassProductByCode(c);return p.manufacturer==='Vitro'&&+p.thicknessMm===6;});
  mdSheetPickSet('q','clear');const found=opts();
  return {total:total===DB.glassProduct.length,narrowed:narrowed.length>0&&narrowed.length<total,vitro6,found:found.includes('6CLEAR')&&found.length<narrowed.length,count:document.getElementById('md_sheetCount').textContent===found.length+' of '+DB.glassProduct.length,price:document.getElementById('md_sheetPrice').value};
 }),{total:true,narrowed:true,vitro6:true,found:true,count:true,price:'3.15'});
 eq('a known supply point fills its currency; the price date is a calendar field; the row saves',await t.p.evaluate(()=>{
  if(typeof mdSheetPoints!=='function')return {missing:true};const sup=document.getElementById('md_sheetSupplier');sup.value='Vitro USA';sup.dispatchEvent(new Event('change'));const cur=document.getElementById('md_sheetCurrency').value;
  document.getElementById('md_sheetCode').value='6CLEAR';document.getElementById('md_sheetW').value='130';document.getElementById('md_sheetH').value='96';
  const date=document.getElementById('md_sheetDate');date.value='2026-10-01';mdSheetSave();
  const row=DB.glassSheet.find(s=>s.supplier==='Vitro USA'&&+s.sheetWIn===130);
  return {cur,type:date.type,saved:!!row&&row.currency==='USD'&&row.priceDate==='2026-10-01'&&row.purchasePrice===3.15,closed:mdSheetEdit===null,points:[...mdSheetPoints().keys()].sort().join(', ')};
 }),{cur:'USD',type:'date',saved:true,closed:true,points:'Cardinal Toronto, Vitro Barrie, Vitro USA'});
 eq('supply-points без ошибок страницы',t.errs,[]);
 await t.c.close();
};
