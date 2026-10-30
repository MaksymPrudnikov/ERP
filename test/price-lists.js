/* Прайсы клиентов, этап 2 плана Master Data (владелец, 22.10.2026): ручная в
   заказе → личный прайс → прайс группы клиента → общая; 0 — это цена; внутри
   прайса айтем важнее группы айтемов; у сервиса — цена на полосу толщины.
   Сохранённый заказ держит свои цены, Update prices пересчитывает. */
module.exports=async function({page,eq,ok}){
 console.log('price lists · customers');
 const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.plfReset=function(){oqReset();DB.priceList=[];DB.itemGroup=[];plBulk=null;};
  window.plfGroup=function(name,rows){const l={id:salesUid('PL'),kind:'group',name,customerId:'',rows:rows.map((r,i)=>Object.assign({id:salesUid('PLR'),at:'2026-10-22T10:0'+i+':00Z'},r))};DB.priceList.push(l);return l;};
  window.plfPersonal=function(c,rows){const l={id:salesUid('PL'),kind:'customer',name:'',customerId:c.id,rows:rows.map((r,i)=>Object.assign({id:salesUid('PLR'),at:'2026-10-22T11:0'+i+':00Z'},r))};DB.priceList.push(l);return l;};
  window.plfKey=()=>'glass:'+glassProductByCode('6CLEAR').id+':salePriceAnnealed';
  /* Новый заказ клиента с отожжённым 6CLEAR без ручной цены. */
  window.plfDraft=function(c){tab='sales';salesOrderNew('order');salesSetUnitType('double');salesApplyCustomerDefaults(c.id);if(!soDraft.customerPo&&!salesIsQuote(soDraft))soDraft.customerPo='PO-T';
   const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');m.panes.forEach(p=>{p.glassProductId=g.id;p.heatTreatmentId='HT-AN';p.priceOverride=null;});
   const l=normalizeSalesOrderLine({makeupId:m.id,width16:40*16,height16:50*16,qty:1});soDraft.lines=[l];salesEnsureLineShape(l);return m.panes[0];};
 });

 eq('порядок поиска: личный → группа → общая; 0 — цена; ручная цена важнее всех',await t.p.evaluate(()=>{
  plfReset();const g=glassProductByCode('6CLEAR'),base=g.salePriceAnnealed,c=oqCustomer({legalName:'Price Co'}),k=plfKey();
  const grp=plfGroup('Dealers',[{target:k,price:8}]);c.priceGroupId=grp.id;const mine=plfPersonal(c,[{target:k,price:9}]);
  const pane=plfDraft(c),out={};
  out.personal=salesPaneCatalogPrice(pane);out.from=priceListName(salesGlassPriceFrom(pane));
  mine.rows[0].price=0;out.zero=salesPaneCatalogPrice(pane);
  mine.rows=[];out.group=salesPaneCatalogPrice(pane);out.groupFrom=priceListName(salesGlassPriceFrom(pane));
  c.priceGroupId='';out.base=salesPaneCatalogPrice(pane)===base;out.baseFrom=salesGlassPriceFrom(pane);
  pane.priceOverride=5.55;out.manual=pane.priceOverride!=null?pane.priceOverride:salesPaneCatalogPrice(pane);
  salesDraftDrop(true);return out;
 }),{personal:9,from:'Personal',zero:0,group:8,groupFrom:'Dealers',base:true,baseFrom:'',manual:5.55});

 eq('внутри прайса айтем важнее группы айтемов; айтем в двух группах — группа, заданная последней',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'Group Co'}),k=plfKey();
  DB.itemGroup.push({id:'IG-A',name:'Clear glass',members:[k]},{id:'IG-B',name:'All glass',members:[k]});
  const l=plfPersonal(c,[{target:'group:IG-A',price:7,at:'2026-10-22T09:00:00Z'},{target:'group:IG-B',price:6,at:'2026-10-22T09:30:00Z'}]);
  const pane=plfDraft(c),out={};
  out.lastGroup=salesPaneCatalogPrice(pane);
  l.rows[0].at='2026-10-22T10:00:00Z';out.editedGroup=salesPaneCatalogPrice(pane);
  l.rows.push({id:'R-ITEM',target:k,price:11,at:'2026-10-21T00:00:00Z'});out.item=salesPaneCatalogPrice(pane);
  salesDraftDrop(true);return out;
 }),{lastGroup:6,editedGroup:7,item:11});

 eq('сервис в прайсе — цена на полосу толщины; пустая полоса ищет дальше; ставка помнит прайс',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'Edge Co'}),fp=DB.serviceRate.find(r=>r.id==='flatPolish');
  const grp=plfGroup('Contractors',[{target:'service:flatPolish',price:0.09}]);c.priceGroupId=grp.id;
  plfPersonal(c,[{target:'service:flatPolish',price:null,bands:{'6':0.05,'8-10':null,'12-19':null}}]);
  plfDraft(c);
  const r6=salesCatalogRate('flatPolish',salesPricingBandFor(6)),r10=salesCatalogRate('flatPolish',salesPricingBandFor(10));
  c.priceGroupId='';const base=salesCatalogRate('flatPolish',salesPricingBandFor(10));
  salesCatalogRate('flatPolish',salesPricingBandFor(6));const row=salesChargeRow('EDGE:flatPolish:6','Flat Polish',10,'in',0.05,'Edge');
  const plain=salesChargeRow('EDGE:x:6','X',1,'in',0.05,'Edge');
  salesDraftDrop(true);
  return {r6,r10,base:base===fp.tiers.find(x=>x.id==='8-10').price,from:priceListName(row.from),plain:plain.from===undefined};
 }),{r6:0.05,r10:0.09,base:true,from:'Personal',plain:true});

 eq('Save замораживает цену прайса и откуда она; правка прайса не меняет заказ; Update prices пересчитывает, ручная остаётся',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'Freeze Co'}),k=plfKey(),mine=plfPersonal(c,[{target:k,price:9}]);
  plfDraft(c);soDraft.makeups[0].cavities.forEach(x=>{x.priceOverride=3;});salesOrderSave();const id=soDraft.id;salesDraftDrop(true);
  const o=salesRecord(id),out={book:o.priceBook[k],from:priceListName(o.priceFrom[k])};
  mine.rows[0].price=12;touch();
  out.kept=finWithOrder(salesRecord(id),()=>salesPaneCatalogPrice(salesRecord(id).makeups[0].panes[0]));
  salesOrderEdit(id);soDraft.makeups[0].panes[1].priceOverride=4.4;salesUpdatePrices();
  out.updated=salesPaneCatalogPrice(soDraft.makeups[0].panes[0]);out.manual=soDraft.makeups[0].panes[1].priceOverride;
  salesOrderSave();out.saved=salesRecord(id).priceBook[k];salesDraftDrop(true);
  return out;
 }),{book:9,from:'Personal',kept:9,updated:12,manual:4.4,saved:12});

 eq('смена клиента в сохранённом заказе: цены стоят, пока не нажать Update prices',await t.p.evaluate(()=>{
  plfReset();const a=oqCustomer({legalName:'First Co'}),b=oqCustomer({legalName:'Second Co'}),k=plfKey();
  plfPersonal(b,[{target:k,price:3}]);
  plfDraft(a);salesOrderSave();const id=soDraft.id,before=salesRecord(id).priceBook[k];salesDraftDrop(true);
  salesOrderEdit(id);salesApplyCustomerDefaults(b.id);if(!soDraft.customerPo&&!salesIsQuote(soDraft))soDraft.customerPo='PO-T';const kept=salesPaneCatalogPrice(soDraft.makeups[0].panes[0]);
  salesUpdatePrices();const now=salesPaneCatalogPrice(soDraft.makeups[0].panes[0]);salesDraftDrop(true);
  return {same:kept===before,now};
 }),{same:true,now:3});

 eq('одна цена сразу нескольким клиентам: в личные прайсы, повтор не плодит строки; журнал пишет айтем «было → стало»',await t.p.evaluate(()=>{
  plfReset();const a=oqCustomer({legalName:'Bulk A'}),b=oqCustomer({legalName:'Bulk B'}),k=plfKey();touch();
  const n=DB.masterDataEvent.length;
  plBulk={target:k,price:'10',bands:{},ids:[a.id,b.id],q:''};plBulkApply();
  plBulk.price='0';plBulkApply();
  const rows=[a,b].map(c=>priceListOfCustomer(c.id).rows.map(r=>r.price));
  const ev=DB.masterDataEvent.slice(n).filter(e=>e.tbl==='priceList'&&e.field.includes('6CLEAR')||e.tbl==='priceList'&&e.what==='Edited').map(e=>[e.row,e.was,e.now]);
  return {rows,last:ev.slice(-2)};
 }),{rows:[[0],[0]],last:[['Personal · Bulk A','10','0'],['Personal · Bulk B','10','0']]});

 eq('Group из Spil с именем группы ставит клиента в неё; убрали из группы — не возвращается',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'Spil Co',group:'dealers '});touch();
  plCommand(()=>{plfGroup('Dealers',[]);});const g=priceListGroups()[0],joined=salesFindCustomer(c.id).priceGroupId===g.id;plSetCustomerGroup(c.id,'');
  return {joined,after:salesFindCustomer(c.id).priceGroupId,text:salesFindCustomer(c.id).group};
 }),{joined:true,after:'',text:''});

 eq('Excel прайса: шаблон с настоящими клиентами и айтемами; загрузка — «было → станет» и ошибки, запись только по кнопке',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'File Co',code:'FILE1'}),k=plfKey();plfPersonal(c,[{target:k,price:9}]);touch();
  const tpl=parseCsv(priceFileExport('customer:'+c.id)),all=parseCsv(priceFileExport('all'));
  const out={head:tpl.header.join('|'),every:tpl.rows.filter(r=>!r.Tier).length===salesPriceTargets().length,tiers:tpl.rows.filter(r=>r.Key==='service:flatPolish').map(r=>r['Thickness mm']+'='+r.Base).join(' '),mine:tpl.rows.find(r=>r.Key===k).Price,all:all.rows.length};
  const svc=tpl.rows.find(r=>r.Key==='service:flatPolish'&&!r.Tier),svc6=tpl.rows.find(r=>r.Key==='service:flatPolish'&&r.Tier==='6');
  const csv=r=>[r['List type'],r.List,r['Customer code'],r['Item type'],r.Item,'',r['Thickness mm'],'',r.Price,r.Key,r.Tier].map(csvCell).join(',');
  const text=[tpl.header.join(','),csv(Object.assign({},tpl.rows.find(r=>r.Key===k),{Price:'0'})),csv(Object.assign({},svc6,{Price:'0,05'})),
   csv({'List type':'Customer group',List:'New Dealers','Item type':'Glass',Item:salesPriceTargets().find(t=>t.key===k).label,Price:'$7.5'}),
   csv({'List type':'Personal',List:'Nobody',Price:'1',Key:k}),csv(Object.assign({},svc,{Price:'abc'})),csv({'List type':'Customer group',List:'New Dealers',Item:'Glass x',Price:'2',Tier:'6',Key:k})].join('\r\n');
  const n=DB.masterDataEvent.length,plan=priceFilePlan(text);
  out.plan=plan.changes.map(ch=>[ch.listName,priceFileText(ch.was),priceFileText(ch.next)]);out.errors=plan.errors.map(e=>e.line);out.newGroups=plan.newGroups;
  out.untouched=priceListOfCustomer(c.id).rows[0].price;
  const w=priceFileApply(text);out.written=w.written;out.now=priceListOfCustomer(c.id).rows.map(r=>priceFileText(r));
  const g=priceListGroups().find(x=>x.name==='New Dealers');out.group=g&&g.rows.map(r=>r.price);
  out.again=priceFilePlan(text).changes.length;out.log=DB.masterDataEvent.length>n;
  plView='file';plFile={name:'p.csv',text,plan:priceFilePlan(priceFileExport('all').replace(/,0,/,',1,'))};tab='masterdata';mdTab='prices';render();
  out.screen=[document.querySelectorAll('[data-pl-file-change]').length,!!document.querySelector('[data-pl-file-write]')];plFile=null;plView='groups';
  return out;
 }),{head:'List type|List|Customer code|Item type|Item|Unit|Thickness mm|Base|Price|Key|Tier',every:true,tiers:'= ≤7=0.07 8–11=0.1 12–19=0.13',mine:'9',all:1,
  plan:[['File Co','9.00','0.00'],['File Co','—','≤7 mm: 0.05'],['New Dealers','—','7.50']],errors:[5,6,7],newGroups:['New Dealers'],untouched:9,
  written:3,now:['0.00','≤7 mm: 0.05'],group:[7.5],again:0,log:true,screen:[1,true]});

 eq('экраны: Data → Prices, Group в карточке клиента — выбор группы, вкладка Prices, полоса цен заказа с Update prices',await t.p.evaluate(()=>{
  plfReset();const c=oqCustomer({legalName:'Screen Co',group:'Spil text'}),k=plfKey(),g=plfGroup('Dealers',[{target:k,price:8}]);touch();
  tab='masterdata';mdTab='prices';plView='groups';plGroupId=g.id;render();
  const groups=document.querySelectorAll('[data-pl-group]').length,rows=document.querySelectorAll('[data-pl-list] [data-pl-row]').length;
  plView='items';render();const items=!!document.querySelector('[data-pl-subs]');plView='bulk';render();const bulk=document.querySelectorAll('[data-pl-bulk-row]').length;
  tab='customers';customerEdit(c.id);render();const sel=document.querySelector('[data-customer-group]'),old=sel.options[0].textContent;
  cTab='prices';render();const newBtn=!!document.querySelector('[data-pl-personal-new]');cEdit=null;cDraft=null;
  c.priceGroupId=g.id;plfDraft(c);salesOrderSave();const id=soDraft.id;salesDraftDrop(true);salesOrderEdit(id);tab='sales';render();
  const strip=document.querySelector('[data-price-strip]').textContent,tag=(document.querySelector('[data-price-from]')||{}).textContent;
  const upd=!!document.querySelector('[data-update-prices]');salesDraftDrop(true);plView='groups';tab='sales';render();
  return {groups,rows,items,bulk,old,newBtn,strip:strip.includes('Dealers (1) → Base'),tag,upd};
 }),{groups:1,rows:1,items:true,bulk:1,old:'Spil text · not a price group',newBtn:true,strip:true,tag:'Dealers',upd:true});
 await t.p.close();
};
