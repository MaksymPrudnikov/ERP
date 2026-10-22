/* =====================================================================
   erp/sales/price-lists  ·  price-lists-1.0
   Прайсы клиентов (план Master Data как конструктора, этап 2; владелец,
   22.10.2026). Порядок поиска цены: ручная в заказе → личный прайс клиента
   → прайс группы клиента → общая цена. Внутри одного прайса айтем важнее
   группы айтемов; айтем в двух группах — берётся группа, заданная последней.
   0 — это цена: на нём поиск заканчивается. У работы своя цена на каждую
   полосу толщины, как в Works («чем детальней и глубже, тем лучше»); пустая
   полоса — прайс молчит, ищем дальше.
   IN : DB.priceList, DB.itemGroup, customer.priceGroupId; заказ — soDraft
        (finWithOrder ставит в него считаемый заказ)
   OUT: salesPriceListFor(target) — {price, listId, rowId} или null;
        salesPriceTargets() — всё, чему прайс может дать цену;
        salesBook и salesCatalogRate (erp/sales) спрашивают прайсы первыми

   Строка прайса — «цель» и цена. Цель — то же имя цены, что в priceBook
   заказа: glass:<id>:salePriceAnnealed, item:<таблица>:<id>, service:<id
   работы>, group:<id группы айтемов>. Группа клиента — это её прайс
   (kind 'group'), личный прайс — kind 'customer' с customerId.
   ===================================================================== */
DEFAULT.priceList=[];DEFAULT.itemGroup=[];
if(!Array.isArray(DB.priceList))DB.priceList=[];
if(!Array.isArray(DB.itemGroup))DB.itemGroup=[];

function normalizePriceLists(){
 const s=v=>typeof v==='string'?v.trim():'';
 const price=v=>{if(v==null||v==='')return null;const n=+v;return Number.isFinite(n)&&n>=0?Math.round(n*10000)/10000:null;};
 if(!Array.isArray(DB.itemGroup))DB.itemGroup=[];
 const groups=new Set();
 DB.itemGroup=DB.itemGroup.filter(g=>g&&typeof g==='object').map(g=>{
  let id=s(g.id)||salesUid('IG');while(groups.has(id))id=salesUid('IG');groups.add(id);
  return {id,name:s(g.name),members:[...new Set((Array.isArray(g.members)?g.members:[]).map(s).filter(Boolean))]};
 });
 if(!Array.isArray(DB.priceList))DB.priceList=[];
 const ids=new Set(),personal=new Set();
 DB.priceList=DB.priceList.filter(l=>l&&typeof l==='object').map(l=>{
  let id=s(l.id)||salesUid('PL');while(ids.has(id))id=salesUid('PL');ids.add(id);
  const kind=l.kind==='customer'?'customer':'group',rowIds=new Set();
  const rows=(Array.isArray(l.rows)?l.rows:[]).filter(r=>r&&typeof r==='object'&&s(r.target)).map(r=>{
   let rid=s(r.id)||salesUid('PLR');while(rowIds.has(rid))rid=salesUid('PLR');rowIds.add(rid);
   const b=r.bands&&typeof r.bands==='object'?r.bands:null;
   return Object.assign({id:rid,target:s(r.target),price:price(r.price),at:s(r.at)},b?{bands:{'6':price(b['6']),'8-10':price(b['8-10']),'12-19':price(b['12-19'])}}:{});
  });
  return {id,kind,name:kind==='group'?s(l.name):'',customerId:kind==='customer'?s(l.customerId):'',rows};
 /* У клиента один личный прайс: повтор — ошибка импорта, первый остаётся. */
 }).filter(l=>l.kind==='group'||(l.customerId&&!personal.has(l.customerId)&&personal.add(l.customerId)));
 /* Group из Spil — та же группа спец-цен: текст, совпавший с именем группы,
    ставит клиента в неё. Выбор группы руками текст стирает. */
 const byName=new Map(DB.priceList.filter(l=>l.kind==='group'&&l.name).map(l=>[l.name.toLowerCase(),l.id]));
 (DB.customer||[]).forEach(c=>{if(c&&!c.priceGroupId&&c.group){const id=byName.get(String(c.group).trim().toLowerCase());if(id)c.priceGroupId=id;}});
}

function priceListById(id){return id?(DB.priceList||[]).find(l=>l.id===id)||null:null;}
function priceListGroups(){return (DB.priceList||[]).filter(l=>l.kind==='group');}
function priceListOfCustomer(customerId){return customerId?(DB.priceList||[]).find(l=>l.kind==='customer'&&l.customerId===customerId)||null:null;}
function itemGroupById(id){return id?(DB.itemGroup||[]).find(g=>g.id===id)||null:null;}
/* Имя прайса для «откуда цена»: группа — её имя, личный — Personal. */
function priceListName(id){const l=priceListById(id);return !l?'Deleted list':l.kind==='customer'?'Personal':(l.name||'Unnamed group');}

/* Цена строки: полоса толщины, если у строки она есть, иначе общая. */
function priceListRowPrice(r,band){const b=band&&r.bands?r.bands[band]:null;return b!=null?b:r.price;}
/* Группа клиента — поле Group карточки (владелец, 22.10.2026: «это спец
   цены для клиентов»). Старый текст из Spil виден, пока группа не выбрана. */
function customerGroupName(c){const l=c&&priceListById(c.priceGroupId);return l&&l.kind==='group'?(l.name||'Unnamed group'):(c&&c.group)||'';}
function customerGroupSelect(c){
 const old=!c.priceGroupId&&c.group?`<option value="" selected>${esc(c.group)} · not a price group</option>`:'';
 return `<select data-customer-group onchange="cDraft.priceGroupId=this.value;cDraft.group=''">${old}<option value="" ${!old&&!c.priceGroupId?'selected':''}>— None —</option>${priceListGroups().map(l=>`<option value="${esc(l.id)}" ${c.priceGroupId===l.id?'selected':''}>${esc(l.name||'Unnamed group')}</option>`).join('')}</select>`;
}
/* Строка прайса для цели: сама цель, иначе группа айтемов, заданная
   последней. Строка без цены — ещё не заполнена, её пропускаем. */
function priceListRowFor(list,target,band){
 if(!list)return null;
 const direct=list.rows.find(r=>r.target===target&&priceListRowPrice(r,band)!=null);if(direct)return direct;
 let best=null;
 list.rows.forEach(r=>{
  if(priceListRowPrice(r,band)==null||r.target.indexOf('group:')!==0)return;
  const g=itemGroupById(r.target.slice(6));
  if(g&&g.members.includes(target)&&(!best||String(r.at)>=String(best.at)))best=r;
 });
 return best;
}
/* Цена из прайсов клиента заказа: личный, затем группа. null — прайсы
   молчат, идёт общая цена. */
function salesPriceListFor(target,band,customerId){
 if(customerId===undefined)customerId=typeof soDraft!=='undefined'&&soDraft?soDraft.customerId:'';
 if(!target||!customerId)return null;
 const c=(DB.customer||[]).find(x=>x.id===customerId);
 const lists=[priceListOfCustomer(customerId),c&&c.priceGroupId?priceListById(c.priceGroupId):null];
 for(const l of lists){const r=priceListRowFor(l,target,band);if(r)return {price:priceListRowPrice(r,band),listId:l.id,rowId:r.id};}
 return null;
}
/* Имя цены в priceBook → цель прайса. Плёнка в ламинате — та же строка
   interlayerProduct, что и плёнка отдельной позицией. Обвязка — пока не цель:
   она станет рецептом из айтемов на этапе 3. */
function salesPriceTargetOfKey(key){
 key=String(key||'');
 if(key.indexOf('glass:')===0||key.indexOf('item:')===0)return key;
 if(key.indexOf('interlayer:')===0)return 'item:interlayerProduct:'+key.slice(11);
 return '';
}

/* Всё, чему прайс может дать цену: стекло (отожжённое и закалённое), плёнки,
   фрит, спандрел, складские позиции на продажу, работы из Works. */
const PRICE_ITEM_TABLES=[['interlayerProduct','Interlayer',true],['fritProduct','Frit',true],['spandrelProduct','Spandrel',true],
 ['stockItem','Stock',false],['sealantProduct','Sealant',false],['gasProduct','Gas',false]];
function salesPriceTargets(){
 const out=[];
 (DB.glassProduct||[]).forEach(g=>{if(!g||g.active===false)return;const n=g.name||g.code||g.id;
  out.push({key:'glass:'+g.id+':salePriceAnnealed',kind:'Glass',label:n+' · Annealed',unit:'ft²',base:g.salePriceAnnealed==null?null:g.salePriceAnnealed});
  out.push({key:'glass:'+g.id+':salePriceTempered',kind:'Glass',label:n+' · Tempered',unit:'ft²',base:g.salePriceTempered==null?null:g.salePriceTempered});});
 PRICE_ITEM_TABLES.forEach(([table,kind,all])=>(DB[table]||[]).forEach(x=>{if(!x||x.active===false||!all&&x.sellsAsOwnLine!==true)return;
  out.push({key:'item:'+table+':'+x.id,kind,label:x.name||x.code||x.id,unit:all?'ft²':'pc',base:x.salePrice==null?null:x.salePrice});}));
 (DB.serviceRate||[]).forEach(r=>{if(!r||!r.id)return;
  out.push({key:'service:'+r.id,kind:'Service',label:r.name||r.id,unit:r.unit||'pc',base:r.kind==='flat'?r.flat:null,bands:r.kind==='flat'?null:r.bands});});
 return out;
}
function salesPriceTargetLabel(key,targets){
 if(String(key).indexOf('group:')===0){const g=itemGroupById(key.slice(6));return g?'Item group · '+(g.name||'Unnamed'):'Deleted item group';}
 const t=(targets||salesPriceTargets()).find(x=>x.key===key);return t?t.kind+' · '+t.label:'Removed · '+key;
}

/* Update prices в сохранённом заказе (владелец, 22.10.2026: при смене
   клиента ручные цены остаются; кнопка пересчитывает по прайсам на сегодня).
   Сбрасываются только снимки цен; нормы веса (weight:) и ручные цены —
   priceOverride, ставка строки и заказа — не трогаются. */
function salesUpdatePrices(){
 if(!soDraft)return;
 const b=soDraft.priceBook||{},keep={};
 Object.keys(b).forEach(k=>{if(k.indexOf('weight:')===0)keep[k]=b[k];});
 soDraft.priceBook=keep;delete soDraft.priceFrom;
 (soDraft.lines||[]).forEach(line=>{
  const map=line.chargePricing||{};
  salesLineChargeRows(line).forEach(row=>{const rec=map[row.key];if(!rec)return;rec.catalogRate=row.catalogRate==null?null:row.catalogRate;if(row.from)rec.from=row.from;else delete rec.from;});
 });
}
