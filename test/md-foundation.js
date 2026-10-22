/* Master Data как конструктор, этап 1 (владелец, 22.10.2026): заказ
   замораживает на Save и обвязку, и нормы веса; журнал Master Data «было →
   стало»; Export / Import только Master Data — повтор файла не плодит
   дубли, нет поля — значение остаётся. */
module.exports=async function({page,eq,ok}){
 console.log('master data · foundation');
 const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.mdfOrder=function(){const c=oqCustomer({legalName:'Freeze Co'}),id=oqOrder(c);salesOrderEdit(id);
   soDraft.makeups.forEach(m=>m.cavities.forEach(x=>{x.priceOverride=null;}));salesOrderSave();salesDraftDrop(true);return id;};
  window.mdfWeight=id=>{const o=salesRecord(id);return finWithOrder(o,()=>salesLineWeight(o.lines[0],o).knownKg);};
 });

 eq('Save замораживает обвязку и нормы веса: правка карточки рамки не меняет сохранённый заказ, новый заказ — по новым числам',await t.p.evaluate(()=>{
  oqReset();const id=mdfOrder(),o=salesRecord(id),c=o.makeups[0].cavities[0],sp=mdById('spacerVariant',c.spacerVariantId),rec=surroundRecipeById(sp.recipeId);
  const total=finOrderTotals(o).grand,kg=mdfWeight(id),keys=Object.keys(o.priceBook||{});
  const surround=finWithOrder(o,()=>salesCavityCatalogPrice(c));
  const was={p:sp.salePrice,w:sp.weightG,pib:rec.pibPerSideMm};
  sp.salePrice+=1;sp.weightG*=2;rec.pibPerSideMm=1;
  const kept={total:finOrderTotals(salesRecord(id)).grand===total,kg:mdfWeight(id)===kg};
  const fresh=mdfOrder(),moved={total:finOrderTotals(salesRecord(fresh)).grand>total,kg:mdfWeight(fresh)>kg};
  sp.salePrice=was.p;sp.weightG=was.w;rec.pibPerSideMm=was.pib;
  return {priceKey:keys.includes('item:spacerVariant:'+sp.id),cardKey:keys.includes('snap:spacer:'+sp.id),recipeKey:keys.includes('snap:recipe:'+rec.id),surround:surround>0,kept,moved};
 }),{priceKey:true,cardKey:true,recipeKey:true,surround:true,kept:{total:true,kg:true},moved:{total:true,kg:true}});

 eq('окно веса заказа: части обвязки — из карточки и рецепта, норма не правится в заказе, «не замерено» видно',await t.p.evaluate(()=>{
  oqReset();const id=mdfOrder();salesOrderEdit(id);const l=soDraft.lines[0];
  const rows=salesLineWeight(l,soDraft).rows,sp=rows.find(r=>/Cavity 1/.test(r.label)&&/not measured/.test(r.note));salesDraftDrop(true);
  return {spacer:!!sp,key:sp&&sp.key===undefined,basis:!!(sp&&/perimeter .* m · area/.test(sp.basisText))};
 }),{spacer:true,key:true,basis:true});

 eq('журнал Master Data: правка поля — было → стало, новая строка — Created, удалённая — Deleted, настройки — по полю; пустая заметка вместо её отсутствия — не правка',await t.p.evaluate(()=>{
  const n=DB.masterDataEvent.length,g=glassProductByCode('6CLEAR'),was=g.salePriceAnnealed;
  g.salePriceAnnealed=7.25;touch();
  DB.gasProduct.push({id:'GAS-KR-T',code:'KR',name:'Krypton'});touch();
  DB.gasProduct=DB.gasProduct.filter(x=>x.id!=='GAS-KR-T');touch();
  const ma=DB.serviceRate.find(r=>r.id==='minArea'),maNote=ma.note;ma.note='Min 5';touch();
  const sp=DB.spacerVariant[0],note=sp.note;sp.note=note||'';touch();
  const ev=DB.masterDataEvent.slice(n,n+4).map(e=>[e.tbl,e.row,e.what,e.field,e.was,e.now]),tail=DB.masterDataEvent.length-n;
  g.salePriceAnnealed=was;ma.note=maNote;touch();
  return {ev,tail,glass:ev[0][1]===(g.name||g.code)&&ev[0][4]===String(was??'')};
 }),{ev:[['glassProduct',await t.p.evaluate(()=>{const g=glassProductByCode('6CLEAR');return g.name||g.code;}),'Edited','salePriceAnnealed',await t.p.evaluate(()=>String(glassProductByCode('6CLEAR').salePriceAnnealed??'')),'7.25'],
  ['gasProduct','Krypton','Created','','',''],['gasProduct','Krypton','Deleted','','',''],['serviceRate','Minimum area','Edited','note','Each unit is billed at least this area','Min 5']],tail:4,glass:true});

 eq('журнал виден в Data overview → Change log: поиск и раздел',await t.p.evaluate(()=>{
  tab='masterdata';mdTab='overview';mdOverviewView='log';mdLogQuery='';mdLogFilter='';render();
  const all=document.querySelectorAll('[data-md-log-row]').length;
  mdLogFilter='gasProduct';render();const gas=document.querySelectorAll('[data-md-log-row]').length;
  mdLogFilter='';mdLogQuery='Min 5';render();const q=document.querySelectorAll('[data-md-log-row]').length;
  mdLogQuery='';mdOverviewView='collections';render();
  return {all:all>=6,gas,q};
 }),{all:true,gas:2,q:2});

 eq('Export / Import только Master Data: план «новые / изменённые / без изменений», повтор файла не плодит дубли, нет поля — остаётся, null — очищает, заказы не тронуты',await t.p.evaluate(()=>{
  const orders=DB.salesOrder.length,file=mdExportData();
  const gas=file.tables.gasProduct,air=gas.find(x=>x.code==='AIR');
  air.note='from file';delete air.name;gas.push({id:'GAS-XE-T',code:'XE',name:'Xenon'});
  const plan=mdImportPlan(file).tables.find(x=>x.tbl==='gasProduct');
  const first=mdImportApply(file).ok,second=mdImportApply(file).ok;
  const a=DB.gasProduct.find(x=>x.code==='AIR');
  const clear=JSON.parse(JSON.stringify(file));clear.tables.gasProduct.find(x=>x.code==='AIR').note=null;mdImportApply(clear);
  const bad=(()=>{try{mdImportPlan({kind:'other'});return 'ok';}catch(e){return e.message;}})();
  const out={plan:[plan.added,plan.changed,plan.rejected],first,second,xenon:DB.gasProduct.filter(x=>x.id==='GAS-XE-T').length,name:a.name,cleared:DB.gasProduct.find(x=>x.code==='AIR').note,orders:DB.salesOrder.length===orders,bad,logged:DB.masterDataEvent.some(e=>e.row==='Xenon'&&e.what==='Created')};
  DB.gasProduct=DB.gasProduct.filter(x=>x.id!=='GAS-XE-T');touch();return out;
 }),{plan:[1,1,0],first:true,second:true,xenon:1,name:'Air',cleared:'',orders:true,bad:'This is not a Master Data file.',logged:true});
 await t.p.close();
};
