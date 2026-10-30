/* Production → Dollies & Skids (15.10.2026): вкладка с тарой по станциям,
   одно окно «что на ней лежит» (с вкладки, с доски In production, из Data),
   Move / Take off / Empty с Undo, колонки — у каждого человека свои, печать
   листа Letter, скид у клиента. */
module.exports=async function({page,eq,ok}){
 console.log('dollies-skids');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.dsPrinted=(window.dsPrinted||0)+1;};
  window.dsReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.carrierSeq={};DB.carrierCols=[];DB.skidReturn=[];DB.truck=[];carrierWin=null;carrierBoardShow='loaded';salesDialog=null;stationDrawer=null;stationLast=null;
   carrierAdd('DL',4);carrierAdd('SL',3);try{localStorage.removeItem('glass_erp_prodCarriers_list_v1');}catch(e){}salesQueuePrefs.prodCarriers=null;
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  /* Одинарное стекло: CUT → ARRIS → HEAT … (как в test/carriers). */
  window.dsOrder=function(sizes,name,extra){
   const id=oqOrder(oqCustomer({legalName:name||'North Shore Windows'}),Object.assign({dueDate:'2026-10-20'},extra||{}));
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.dsIds=function(id){return [...glassPieceMap(id).values()].flatMap(r=>r.ids);};
  /* Скан станции, где стекло ждёт; on — на какую тару положили. */
  window.dsScan=function(pieces,on){pieces.forEach(p=>{const g=stationGlass(p),pl=stationPlace(g),c=stationCheck(pl.waiting,p);stationMove(pl.waiting,c,{name:'Roman H.'},on?{on}:{});});};
  window.dsText=function(sel){const el=document.querySelector(sel);return el?el.innerText.replace(/\s+/g,' ').trim():'';};
  window.dsInner=function(el){return el?el.innerText.replace(/\s+/g,' ').trim():'';};
  /* Кто нажал — подменяется только здесь: подмена входа в ERP перезагрузила бы страницу. */
  window.dsAs=function(name){window.carrierMe=()=>({id:'view-'+name,name});};
  window.dsOpenTab=function(){tab='production';subtab='carriers';render();};
 });

 eq('вкладка Dollies & Skids: плитки, карточка долли под станцией, где ждёт стекло; клик — окно: сверху положенное последним, сводка по заказам, все колонки',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,3]],'Granite City Glazing',{priority:'critical'}),b=dsOrder([[30,20,2]],'Vista Railings'),ga=dsIds(a),gb=dsIds(b),na=salesRecord(a).businessNumber,nb=salesRecord(b).businessNumber,ab=x=>x.split(na).join('A').split(nb).join('B');
  dsScan(ga,'DL-1');dsScan(gb,'DL-1');dsOpenTab();const since=carrierWhen(DB.stationScan[0].at);
  const tabs=[...document.querySelectorAll('.tabs button')].map(b=>b.textContent).join('|'),tiles=[...document.querySelectorAll('.cb-tile')].map(dsInner).join('|');
  const card=document.querySelector('[data-carrier-card="DL-1"]'),group=card.closest('[data-carrier-group]').dataset.carrierGroup,cardText=ab(dsInner(card)).replace(since,'T');
  card.click();const w=document.querySelector('[data-carrier-window="DL-1"]');
  const rows=[...w.querySelectorAll('[data-carrier-row]')].map(r=>r.dataset.carrierRow),heads=[...w.querySelectorAll('thead th')].map(th=>th.textContent).filter(Boolean).join(',');
  return {tabs,tiles,group,cardText,top:rows[0]===gb[1],bottom:rows.at(-1)===ga[0],n:rows.length,chips:ab([...w.querySelectorAll('[data-carrier-order]')].map(dsInner).join('|')),sub:dsText('.cw-sub').replace(since,'T'),heads,total:dsText('[data-carrier-total]')};
 }),{tabs:'In production|Stations|Terminals|Dollies & Skids',tiles:'1 registered · DL 1 · DA 0 · SL 0 · SA 0|1 in the shop · 1 loaded · 5 glass · 0 empty|0 at customers|0 glass with no dolly or skid|— no count yet|— found without a label|6 not confirmed yet',group:'ARRIS',
  cardText:'DL-1 5 glass A · B Critical since T',top:true,bottom:true,n:5,chips:'A Granite City Glazing · 3 Critical|B Vista Railings · 2',sub:'At ARRIS · since T · 5 glass · 2 orders',
  heads:'#,Order,Customer,Customer PO,Line,Mark,Size,Glass,Makeup,Glass / unit ID,Batch,Next,Due,Weight kg,Put on',total:'Total: 5 glass · 2 orders'});

 eq('выбор заказа целиком → Move to DL-2, строка с Undo; Undo возвращает; Take off — стекло на своей станции без тары, Undo; Empty — с вопросом, Undo',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,3]],'Granite City Glazing'),b=dsOrder([[30,20,2]],'Vista Railings'),ga=dsIds(a),gb=dsIds(b);dsScan(ga.concat(gb),'DL-1');
  dsOpenTab();carrierWinOpen('DL-1');
  document.querySelector('[data-carrier-order="'+salesRecord(b).businessNumber+'"] input').dispatchEvent(new Event('change'));
  const sel=dsText('[data-carrier-sel] b');
  document.querySelector('[data-carrier-to]').value='dl-2';document.querySelector('[data-carrier-move]').click();
  const after={dl1:(carrierContents().get('DL-1')||[]).length,dl2:(carrierContents().get('DL-2')||[]).length,done:dsText('[data-carrier-done] b')};
  document.querySelector('[data-carrier-undo]').click();const undone=(carrierContents().get('DL-1')||[]).length;
  carrierWinPick('g|'+ga[0]);document.querySelector('[data-carrier-takeoff]').click();
  const off=Object.assign({},DB.stationScan.find(s=>s.piece===ga[0])),place=stationPlace(stationGlass(ga[0])).waiting,offDone=dsText('[data-carrier-done] b');
  carrierWinUndo();const offBack=DB.stationScan.find(s=>s.piece===ga[0]).on;
  document.querySelector('[data-carrier-empty]').click();const ask=salesDialog&&salesDialog.title;oqChoose('Empty');
  const emptied=(carrierContents().get('DL-1')||[]).length,emptyDone=dsText('[data-carrier-done] b');carrierWinUndo();
  const back=(carrierContents().get('DL-1')||[]).length,same=dsText('[data-carrier-to]')==='';carrierWinMove('DL-1');const err=dsText('[data-carrier-error]');
  return {sel,after,undone,offOn:off.on||'',offBy:off.moved&&off.moved.from,place,offDone,offBack,ask,emptied,emptyDone,back,err};
 }),{sel:'2 glass selected',after:{dl1:3,dl2:2,done:'2 glass moved DL-1 → DL-2'},undone:5,offOn:'',offBy:'DL-1',place:'ARRIS',offDone:'1 glass taken off DL-1 · stays at its station',offBack:'DL-1',ask:'Empty DL-1?',emptied:0,emptyDone:'DL-1 emptied · 5 glass without a dolly',back:5,err:'Select glass first'});

 eq('долли со стёклами на разные станции — карточка под каждой («2 of 3», also …); в плитках считается один раз',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,2]],'Granite City Glazing'),b=dsOrder([[30,20,1]],'Vista Railings'),ga=dsIds(a),gb=dsIds(b);
  dsScan(ga);dsScan(ga,'DL-3');dsScan(gb,'DL-3');dsOpenTab();
  const cards=[...document.querySelectorAll('[data-carrier-card="DL-3"]')].map(c=>c.closest('[data-carrier-group]').dataset.carrierGroup+': '+c.querySelector('.cb-top b').textContent+' / '+(c.querySelector('.cb-s')||{}).textContent).join('|');
  return {cards,tile:dsText('[data-carrier-tile="shop"]'),pill:dsText('[data-carrier-show="loaded"]')};
 }),{cards:'ARRIS: 1 of 3 / also HEAT 2|HEAT: 2 of 3 / also ARRIS 1',tile:'1 in the shop · 1 loaded · 3 glass · 0 empty',pill:'Loaded 1'});

 eq('стекло без тары: карточка «No dolly» на станции, где ждёт, жёлтая плитка; окно — Move to кладёт на долли, Take off нет',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,2]],'Granite City Glazing'),ga=dsIds(a);dsScan(ga);dsOpenTab();
  const card=document.querySelector('[data-carrier-card="No dolly:ARRIS"]'),tile=document.querySelector('[data-carrier-loose-tile]');
  card.click();const w=document.querySelector('[data-carrier-window="none:ARRIS"]'),title=dsText('.cw-title');carrierWinPickAll(true);
  const takeoff=!!document.querySelector('[data-carrier-takeoff]'),empty=!!document.querySelector('[data-carrier-empty]');carrierWinMove('DL-2');
  return {card:!!card,warn:tile.classList.contains('warn'),tileN:tile.querySelector('b').textContent,window:!!w,title,takeoff,empty,on:(carrierContents().get('DL-2')||[]).length,done:dsText('[data-carrier-done] b')};
 }),{card:true,warn:true,tileN:'2',window:true,title:'No dolly Waiting at ARRIS',takeoff:false,empty:false,on:2,done:'2 glass moved onto DL-2'});

 eq('скид со стеклопакетами: строка на юнит, итог «юниты — юнитами, стёкла — стёклами»; у клиента — что уехало по PS и «Back at the shop»',await t.p.evaluate(()=>{
  dsReset();const c=oqCustomer({legalName:'Kingsway Renovations'}),id=oqOrder(c);salesDraftDrop();oqThrough(id,'ready');
  const units=shippingAvailable(salesRecord(id));units.forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const single=dsOrder([[30,20,1]],'Kingsway Renovations'),gs=dsIds(single);oqReady(single);stationScansFor(gs[0]).at(-1).on='SL-1';
  dsOpenTab();carrierWinOpen('SL-1');const rows=[...document.querySelectorAll('[data-carrier-row]')].map(r=>r.dataset.carrierRow.slice(0,2)).join(','),total=dsText('[data-carrier-total]'),tile=dsInner(document.querySelector('[data-carrier-tile="shop"]'));
  carrierWinClose();carrierEmpty('SL-1',{name:'QA'});
  units.forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-2';}));
  const s=shippingCreate({customerId:c.id,method:'delivery',shipTo:{address1:'1 Main St'},date:finToday(),items:shippingAvailable(salesRecord(id)).map(shippingItem),extras:[]}).value;shippingMarkShipped(s.id);
  carrierBoardSet('out');const card=dsText('[data-carrier-card="SL-2"]');carrierWinOpen('SL-2');
  const out=dsText('[data-carrier-out]'),went=document.querySelectorAll('[data-carrier-row]').length,check=document.querySelectorAll('[data-carrier-window] tbody input').length;
  document.querySelector('[data-carrier-back]').click();
  return {rows,total,tile,card:card.startsWith('SL-2 Kingsway Renovations 0 days · PS-'),out:out.startsWith('At Kingsway Renovations since'),went,check,back:dsText('[data-carrier-done] b'),left:skidsOut().has('SL-2')};
 }),{rows:'G-,U-,U-,U-',total:'Total: 3 units · 1 glass · 2 orders',tile:'1 in the shop · 1 loaded · 3 units · 1 glass · 0 empty',card:true,out:true,went:3,check:0,back:'SL-2 back from Kingsway Renovations · 0 days',left:false});

 /* Владелец, 15.10.2026: «для одиночного стекла я не увидел вес». */
 eq('вес: у одинарного стекла — вес юнита позиции, у лайта стеклопакета на долли — его стекло; у стеклопакета без норм рамки — известная часть со «~»',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,1]],'Granite City Glazing'),ga=dsIds(a);dsScan(ga,'DL-1');
  const c=oqCustomer({legalName:'Royal Crest Windows'}),b=oqOrder(c);salesDraftDrop();oqThrough(b,'batched');const gb=[...glassPieceMap(b).values()].flatMap(r=>r.ids).slice(0,2);dsScan(gb,'DL-1');
  dsOpenTab();carrierWinOpen('DL-1');const m=carrierWinModel(),w=id=>carrierText(m.items.find(i=>i.label===id),'weight');
  const one=w(ga[0]),lite=w(gb[0]),line=finWithOrder(salesRecord(a),()=>salesLineWeight(salesRecord(a).lines[0],salesRecord(a))).kg;
  const igu=salesRecord(b),l=igu.lines[0],full=finWithOrder(igu,()=>salesLineWeight(l,igu)),glassRows=full.rows.filter(r=>/^Lite 1 ·/.test(r.label)).reduce((n,r)=>n+r.kg,0);
  carrierWinClose();const r=oqOrder(c);salesDraftDrop();oqThrough(r,'ready');shippingAvailable(salesRecord(r)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  const save=window.salesWeightRate,card=window.surroundSpacerCard;window.salesWeightRate=(k,o)=>k==='glass'?save(k,o):null;window.surroundSpacerCard=()=>({recipeId:'',weightG:null,weightPer:'ft2'});carrierWinOpen('SL-1');const unit=carrierText(carrierWinModel().items[0],'weight');window.salesWeightRate=save;window.surroundSpacerCard=card;carrierWinClose();
  return {one:one===docNum(line,1),lite:lite===docNum(glassRows,1)&&+lite>0,litePart:+lite<full.kg,unit:/^~[0-9.]+$/.test(unit)};
 }),{one:true,lite:true,litePart:true,unit:true});

 eq('колонки — у каждого свои и в базе: Тому без Customer и Size вторым, у Сергея — все; переживают нормализацию; Standard view; импорт без массива — ошибка',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,1]],'Granite City Glazing');dsScan(dsIds(a),'DL-1');
  const real=window.carrierMe,who=dsAs;
  who('tom');carrierWinOpen('DL-1');document.querySelector('[data-carrier-cols-button]').click();const menu=!!document.querySelector('[data-carrier-cols]');
  carrierColSet('customer',false);carrierColMove('size',-5);
  const heads=()=>[...document.querySelectorAll('[data-carrier-window] thead th')].map(th=>th.textContent).filter(Boolean).slice(0,4).join(',');
  const tom=heads();who('sergiy');render();const sergiy=heads();
  normalizeCarriers();who('tom');render();const again=heads(),stored=DB.carrierCols.map(r=>r.userId).join();
  let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(DB)),{carrierCols:{}}));}catch(e){err=e.message;}
  carrierColsStandard();const std=heads(),left=DB.carrierCols.length;window.carrierMe=real;carrierWinClose();
  return {menu,tom,sergiy,again,stored,err,std,left};
 }),{menu:true,tom:'#,Size,Order,Customer PO',sergiy:'#,Order,Customer,Customer PO',again:'#,Size,Order,Customer PO',stored:'view-tom',err:'The "carrierCols" field must be an array.',std:'#,Order,Customer,Customer PO',left:0});

 /* Владелец, 15.10.2026: «как с чертежом — печать на любом варианте, горизонтальный, вертикальный, просто отступы от краёв». */
 eq('Print: лист сам ложится на бумагу — у @page только поля, без размера; SKID CONTENTS, код, клиент с адресом и заказом; колонки как в окне, без Order и Customer; итог; после печати лист убирается',await t.p.evaluate(()=>{
  dsReset();const c=oqCustomer({legalName:'Kingsway Renovations'}),id=oqOrder(c,{customerPo:'KR-4471'});salesDraftDrop();oqThrough(id,'ready');
  shippingAvailable(salesRecord(id)).forEach(u=>u.pieces.forEach(p=>{stationScansFor(p).at(-1).on='SL-1';}));
  dsOpenTab();carrierWinOpen('SL-1');window.dsPrinted=0;document.querySelector('[data-carrier-print]').click();
  const host=document.getElementById('carrierPrintHost'),txt=host.innerText.replace(/\s+/g,' '),page=document.getElementById('carrierPageStyle').textContent,printing=document.body.classList.contains('carrier-printing');
  const heads=[...host.querySelectorAll('thead th')].map(th=>th.textContent).join(',');window.dispatchEvent(new Event('afterprint'));
  return {printed:window.dsPrinted,printing,margins:/@page carriersheet\{margin:/.test(page),size:/size:/.test(page),pages:/counter\(pages\)/.test(page),kind:host.querySelector('.cs-code small').textContent+' '+host.querySelector('.cs-code b').textContent==='SKID CONTENTS SL-1',customer:txt.includes('Kingsway Renovations'),order:txt.includes('Order '+salesRecord(id).businessNumber),po:txt.includes('PO KR-4471'),
   heads,total:txt.includes('Total: 3 units · 1 order'),after:document.body.classList.contains('carrier-printing')};
 }),{printed:1,printing:true,margins:true,size:false,pages:true,kind:true,customer:true,order:true,po:true,heads:'#,Line,Mark,Size,Glass,Makeup,Glass / unit ID,Batch,Next,Due,Weight kg,Put on',total:true,after:false});

 eq('In production: код долли под цифрой станции открывает окно, строка не раскрывается; Data → Dollies & Skids: Loaded / At customers / Empty / All и код — окно',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,2]],'Granite City Glazing');dsScan(dsIds(a),'DL-1');
  tab='production';subtab='orders';prodOpen=new Set();const p=salesListLoadPrefs();p.filters={};render();
  document.querySelector('.pb-on-open').click();const fromBoard=!!document.querySelector('[data-carrier-window="DL-1"]'),opened=prodOpen.size;carrierWinClose();
  tab='masterdata';mdTab='carriers';mdCarrierShow='loaded';render();const loaded=[...document.querySelectorAll('tr[data-carrier]')].map(r=>r.dataset.carrier).join();
  mdCarrierShow='empty';render();const empty=document.querySelectorAll('tr[data-carrier]').length;mdCarrierShow='all';render();
  document.querySelector('[data-carrier-open="DL-1"]').click();const fromData=!!document.querySelector('[data-carrier-window="DL-1"]');carrierWinClose();
  return {fromBoard,opened,loaded,empty,fromData,pills:[...document.querySelectorAll('[data-md-carrier-show]')].map(b=>b.textContent.replace(/\s+/g,' ').trim()).join('|')};
 }),{fromBoard:true,opened:0,loaded:'DL-1',empty:6,fromData:true,pills:'Loaded 1|At customers 0|Empty 6|All 7'});

 eq('фильтры как в Sales: Order — только карточки с этим заказом; Station; снять — все снова',await t.p.evaluate(()=>{
  dsReset();const a=dsOrder([[36,24,1]],'Granite City Glazing'),b=dsOrder([[30,20,1]],'Vista Railings');dsScan(dsIds(a),'DL-1');dsScan(dsIds(b),'DL-2');dsOpenTab();
  const cards=()=>[...document.querySelectorAll('[data-carrier-card]')].map(c=>c.dataset.carrierCard).join();const all=cards();
  const nb=salesRecord(b).businessNumber;salesListSetFilter('order',{mode:'include',values:[nb],conds:[]});const byOrder=cards(),chip=dsText('[data-filter-chip="order"]').replace(nb,'B');
  salesListClearAll();salesListSetFilter('station',{mode:'include',values:['ARRIS'],conds:[]});const byStation=cards();salesListClearAll();
  return {all,byOrder,chip,byStation,back:cards()};
 }),{all:'DL-1,DL-2',byOrder:'DL-2',chip:'Order: B ×',byStation:'DL-1,DL-2',back:'DL-1,DL-2'});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
