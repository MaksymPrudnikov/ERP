/* =====================================================================
   erp/sales/price-lists-file  ·  price-lists-file-1.0
   Прайсы в Excel «было / станет» (план Master Data, этап 2, часть 2;
   владелец, 22.10.2026). Выгрузка — CSV, который открывает Excel: все
   прайсы или шаблон одного прайса со всеми айтемами, уже с настоящими
   клиентами и айтемами. Загрузка ничего не пишет сама: сначала список
   «было → станет» и ошибки по строкам, запись — отдельной кнопкой.
   IN : DB.priceList, DB.itemGroup, DB.customer; salesPriceTargets()
   OUT: priceFileExport(scope) — текст CSV; priceFilePlan(text) — {changes,
        same, errors}; priceFileApply(text) — пишет план заново по свежей базе

   Строки файла, которых нет, не трогаются: файл может быть частью прайса.
   Пустая цена в строке, где цена была, — цену убрать (дальше решает
   следующий прайс). Пустая строка шаблона без цены — пропуск. Неизвестная
   группа клиентов — новая группа (видно в предпросмотре), неизвестный
   клиент или айтем — ошибка строки.
   ===================================================================== */
/* Цена работы по толщине — отдельная строка файла на каждую строку таблицы
   цен этой работы (этап 4: строк в таблице сколько угодно, своих колонок
   под них не напасёшься). Колонка Thickness — подпись строки таблицы, Tier —
   её id; строка без Tier — цена на все толщины. */
const PRICE_FILE_HEAD=['List type','List','Customer code','Item type','Item','Unit','Thickness mm','Base','Price','Key','Tier'];

function priceFileNum(v){return v==null?'':String(+(+v).toFixed(4));}
function priceFileCustomerName(c){return c?(c.displayName||c.legalName||c.code||c.id):'';}
/* Строки выгрузки одного прайса: его цены, а для шаблона — ещё все айтемы
   и группы айтемов без цены. */
function priceFileRows(list,customer,targets,every){
 const type=list?list.kind==='customer'?'Personal':'Customer group':customer?'Personal':'Customer group';
 const name=customer?priceFileCustomerName(customer):list.name,code=customer?customer.code||'':'';
 const byKey=new Map(targets.map(t=>[t.key,t])),rows=list?list.rows.slice():[];
 if(every){const have=new Set(rows.map(r=>r.target));
  (DB.itemGroup||[]).map(g=>'group:'+g.id).concat(targets.map(t=>t.key)).forEach(k=>{if(!have.has(k))rows.push({target:k,price:null});});}
 const out=[];
 rows.forEach(r=>{
  const t=byKey.get(r.target),g=String(r.target).indexOf('group:')===0?itemGroupById(r.target.slice(6)):null;
  const kind=g?'Item group':t?t.kind:'Removed',label=g?g.name||'Unnamed':t?t.label:r.target,unit=t?t.unit||'':'';
  out.push([type,name,code,kind,label,unit,'',t&&!t.tiers?priceFileNum(t.base):'',priceFileNum(r.price),r.target,'']);
  ((t&&t.tiers)||[]).forEach(x=>out.push([type,name,code,kind,label,unit,serviceRateTierShort(x),priceFileNum(x.price),r.bands&&r.bands[x.id]!=null?priceFileNum(r.bands[x.id]):'',r.target,x.id]));
 });
 return out;
}
/* scope: 'all' — все прайсы с ценами; 'list:<id>' — шаблон прайса группы;
   'customer:<id>' — шаблон личного прайса клиента (есть он или нет). */
function priceFileExport(scope){
 const targets=salesPriceTargets(),out=[PRICE_FILE_HEAD];
 const cust=l=>l.kind==='customer'?(DB.customer||[]).find(c=>c.id===l.customerId)||null:null;
 if(scope==='all')(DB.priceList||[]).forEach(l=>out.push(...priceFileRows(l,cust(l),targets,false)));
 else if(String(scope).indexOf('list:')===0){const l=priceListById(scope.slice(5));if(l)out.push(...priceFileRows(l,cust(l),targets,true));}
 else if(String(scope).indexOf('customer:')===0){const c=(DB.customer||[]).find(x=>x.id===scope.slice(9));if(c)out.push(...priceFileRows(priceListOfCustomer(c.id),c,targets,true));}
 return '﻿'+out.map(r=>r.map(csvCell).join(',')).join('\r\n');
}

/* Число из Excel: «$1,234.50», «2,5» (запятая вместо точки), пусто. */
function priceFileParseNum(v){
 let s=String(v==null?'':v).replace(/[\s$]/g,'');if(s==='')return null;
 if(s.includes(',')&&!s.includes('.')&&/^\d*,\d+$/.test(s))s=s.replace(',','.');else s=s.replace(/,/g,'');
 const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*10000)/10000:NaN;
}
/* На экране: не меньше двух знаков (0 → 0.00, как в счёте), до четырёх. */
function priceFileMoney(v){const s=(+v).toFixed(4).replace(/0{1,2}$/,'');return s;}
function priceFileSame(a,b){return a===b||(a==null&&b==null);}
function priceFileText(p){
 if(!p)return '—';
 return priceListRowText({target:p.target,price:p.price,bands:p.bands},priceFileMoney)||'—';
}
/* Разбор файла против текущей базы. Ничего не пишет. Строки одной цели в
   одном прайсе (общая цена и цены по толщине) собираются в одно изменение. */
function priceFilePlan(text){
 const parsed=parseCsv(text),plan={changes:[],same:0,errors:[],newGroups:[]};
 if(!parsed.header.includes('Price')||!parsed.header.includes('List')){plan.errors.push({line:1,why:'Not a price file: no List or Price column.'});return plan;}
 const targets=salesPriceTargets(),byKey=new Map(targets.map(t=>[t.key,t])),seen=new Set(),groups=new Map();
 const low=v=>String(v||'').trim().toLowerCase();
 const customers=(DB.customer||[]).filter(c=>c&&c.status!=='archived');
 parsed.rows.forEach((r,i)=>{
  const line=i+2,err=why=>plan.errors.push({line,why});
  const type=low(r['List type']),code=String(r['Customer code']||'').trim(),name=String(r.List||'').trim();
  const personal=type?type.startsWith('personal')||type==='customer':!!code;
  /* Прайс */
  let listId='',customerId='',listName=name;
  if(personal){
   const byCode=code?customers.filter(c=>low(c.code)===low(code)):[];
   const found=byCode.length?byCode:customers.filter(c=>name&&[c.displayName,c.legalName].some(x=>low(x)===low(name)));
   if(found.length!==1)return err(found.length?'Two customers named "'+name+'"; add the customer code.':'No customer "'+(code||name)+'".');
   customerId=found[0].id;listName=priceFileCustomerName(found[0]);const l=priceListOfCustomer(customerId);listId=l?l.id:'';
  }else{
   if(!name)return err('No list name.');
   const l=priceListGroups().find(g=>low(g.name)===low(name));listId=l?l.id:'';
   if(!l&&!plan.newGroups.some(g=>low(g)===low(name)))plan.newGroups.push(name);
  }
  /* Айтем: по Key, иначе по типу и имени */
  let target=String(r.Key||'').trim();
  if(target){
   if(target.indexOf('group:')===0?!itemGroupById(target.slice(6)):!byKey.has(target))return err('Unknown item key '+target+'.');
  }else{
   const kind=low(r['Item type']),item=low(r.Item);
   const hits=kind==='item group'?(DB.itemGroup||[]).filter(g=>low(g.name)===item).map(g=>'group:'+g.id):targets.filter(t=>low(t.kind)===kind&&low(t.label)===item).map(t=>t.key);
   if(hits.length!==1)return err(hits.length?'Two items "'+r.Item+'"; keep the Key column.':'No item "'+(r.Item||'')+'".');
   target=hits[0];
  }
  /* Строка таблицы цен работы: по Tier, иначе по подписи толщины */
  const t=byKey.get(target),mmText=String(r['Thickness mm']||'').trim();let tier=String(r.Tier||'').trim();
  if(!tier&&mmText){const hit=((t&&t.tiers)||[]).find(x=>serviceRateTierShort(x)===mmText);if(!hit)return err('No thickness row "'+mmText+'" in this service.');tier=hit.id;}
  if(tier&&!((t&&t.tiers)||[]).some(x=>x.id===tier))return err('Prices by mm only for services priced by thickness.');
  const listKey=customerId?'c:'+customerId:'g:'+low(name),dup=listKey+'|'+target+'|'+tier;
  if(seen.has(dup))return err('Same list and item twice; first row kept.');seen.add(dup);
  const price=priceFileParseNum(r.Price);
  if(Number.isNaN(price))return err('Price must be a number, 0 or more.');
  const gk=listKey+'|'+target;
  if(!groups.has(gk))groups.set(gk,{line,personal,listId,customerId,listName,target,cells:[]});
  groups.get(gk).cells.push([tier,price]);
 });
 groups.forEach(g=>{
  const list=priceListById(g.listId),old=list?list.rows.find(x=>x.target===g.target):null;
  const was=old?{target:g.target,price:old.price,bands:old.bands||null}:null;
  const next={target:g.target,price:was?was.price:null,bands:was&&was.bands?Object.assign({},was.bands):{}};
  g.cells.forEach(([tier,v])=>{if(tier)next.bands[tier]=v;else next.price=v;});
  Object.keys(next.bands).forEach(k=>{if(next.bands[k]==null)delete next.bands[k];});
  const empty=next.price==null&&!Object.keys(next.bands).length;
  if(!Object.keys(next.bands).length)next.bands=null;
  if(!was&&empty)return;
  const ob=was&&was.bands||{},nb=next.bands||{};
  if(was&&priceFileSame(was.price,next.price)&&[...new Set(Object.keys(ob).concat(Object.keys(nb)))].every(k=>priceFileSame(ob[k]==null?null:ob[k],nb[k]==null?null:nb[k]))){plan.same++;return;}
  plan.changes.push({line:g.line,personal:g.personal,listId:g.listId,customerId:g.customerId,listName:g.listName,target:g.target,label:salesPriceTargetLabel(g.target,targets),was,next:empty?null:next});
 });
 plan.changes.sort((a,b)=>a.line-b.line);
 return plan;
}
/* Запись: план строится заново по свежей базе, чтобы между просмотром и
   кнопкой ничего не потерялось. */
function priceFileApply(text){
 const plan=priceFilePlan(text),at=new Date().toISOString();let n=0;
 const out=storageCommand(()=>{
  plan.changes.forEach(ch=>{
   let l=ch.personal?priceListOfCustomer(ch.customerId):priceListById(ch.listId)||priceListGroups().find(g=>g.name.toLowerCase()===ch.listName.toLowerCase());
   if(!l){l=ch.personal?{id:salesUid('PL'),kind:'customer',name:'',customerId:ch.customerId,rows:[]}:{id:salesUid('PL'),kind:'group',name:ch.listName,customerId:'',rows:[]};DB.priceList.push(l);}
   let r=l.rows.find(x=>x.target===ch.target);
   if(!ch.next){if(r)l.rows=l.rows.filter(x=>x!==r);n++;return;}
   if(!r){r={id:salesUid('PLR'),target:ch.target};l.rows.push(r);}
   r.price=ch.next.price;if(ch.next.bands)r.bands=Object.assign({},ch.next.bands);else delete r.bands;r.at=at;n++;
  });
  normalizePriceLists();return true;
 });
 return {ok:out.ok,error:out.error,written:n,errors:plan.errors.length};
}
