/* Пункт 14 (вариант 1 владельца 30.10.2026): вес показывается всегда —
   известное число и метка Partial, у нас — чего нет и где внести.
   «Наверное лучше первый, так как он акцентирует внимание офиса на том, что
   нет информации». Контрольный расчёт — раздел 16.3 плана v1.16. */
module.exports=async function({page,eq}){
 console.log('order weight');
 const t=await page(undefined,{width:1600,height:900});await require('./optimization-fixture')(t.p);
 const run=(fn,arg)=>t.p.evaluate(fn,arg).catch(e=>({error:String(e.message).split('\n')[0]}));
 const setup=()=>run(()=>{
  /* Стёкла с фактической толщиной 6, 5 и 10 мм; плотность 2500; плёнка без плотности. */
  window.owGlass=mm=>{const id='GL-QA'+mm;let g=DB.glassProduct.find(x=>x.id===id);
   if(!g){g=Object.assign(JSON.parse(JSON.stringify(glassProductByCode('6CLEAR'))),{id,code:'QA'+mm,shortName:'',name:'QA clear '+mm+' mm',thicknessMm:mm});DB.glassProduct.push(g);}
   g.actualThicknessMm=mm;return g;};
  window.owPly=(ply,mm)=>{const g=owGlass(mm);Object.assign(ply,{glassProductId:g.id,thicknessMm:mm,manufacturer:g.manufacturer});};
  window.owFilm=()=>DB.interlayerProduct[0];
  window.owSetup=()=>{(DB.materialWeightRates.find(r=>r.key==='glass')||{}).rate=2500;DB.materialWeightRates=DB.materialWeightRates.filter(r=>r.key!=='film:'+owFilm().id);[6,5,10].forEach(owGlass);touch();};
  /* Позиция A — ламинат 6 + 5 мм, Qty 2; B — одиночное 10 мм, Qty 1; лайты 39 3/8″ ≈ 1 м². */
  window.owOrder=(opts)=>{
   opts=opts||{};tab='sales';salesOrderNew('order');salesSetUnitType('single');salesSetPaneCategory(0,'laminated');
   const a=soDraft.makeups[0],lam=a.panes[0].laminated;
   owPly(lam.outer,6);owPly(lam.inner,5);lam.interlayers=[{productId:owFilm().id,thicknessMm:0.76,layers:2}];
   const b=JSON.parse(JSON.stringify(a));b.id=salesUid('MU');b.code='B';b.panes=[normalizeSalesPane({})];owPly(b.panes[0],10);soDraft.makeups.push(b);
   const side=39*16+6;soDraft.lines=[];
   (opts.rows||[['A',2],['B',1]]).forEach(([mu,qty,w])=>{const l=normalizeSalesOrderLine({makeupId:mu==='?'?'':mu==='A'?a.id:b.id,width16:w==null?side:w,height16:side,qty});soDraft.lines.push(l);salesEnsureLineShape(l);});
   salesApplyCustomerDefaults(oqCustomer().id);soDraft.customerPo='PO-W';
   if(opts.save===false)return soDraft;
   if(!salesOrderSave())throw new Error('owOrder not saved');const id=soDraft.id;salesDraftDrop();return id;
  };
  window.owW=o=>{const w=finWithOrder(o,()=>salesOrderWeight(o));return {kg:w.kg==null?null:+w.kg.toFixed(1),complete:w.complete,partial:w.partial,gaps:w.gaps.map(g=>g.key.split(':')[0]+'@'+g.lines.join('.')),text:salesWeightMissingText(w)};};
 });
 await setup();

 eq('16.3: A — ламинат 6 + 5 мм без плотности плёнки: юнит 27.5, строка 55.0 известно; B — 25.0; заказ 80.0 Partial — «Interlayer weight not included», обе плиты и Qty учтены',await run(()=>{
  owSetup();const o=salesRecord(owOrder()),la=finWithOrder(o,()=>salesLineWeight(o.lines[0],o)),lb=finWithOrder(o,()=>salesLineWeight(o.lines[1],o));
  return {unitA:+la.knownKg.toFixed(1),lineA:+(la.knownKg*2).toFixed(1),aDone:la.complete,b:+lb.kg.toFixed(1),order:owW(o)};
 }),{unitA:27.5,lineA:55,aDone:false,b:25,order:{kg:80,complete:false,partial:true,gaps:['film@1'],text:'Interlayer weight not included'}});

 eq('16.3: плотность плёнки, дающая 0.8 кг на изделие A, — 81.6 без пропусков; убрать её — снова 80.0 Partial, в норме пусто, а не 0',await run(()=>{
  owSetup();const id=owOrder(),f=owFilm(),d=0.8/((39.375*39.375/144)*GLASS_M2_PER_FT2*0.00076);
  DB.materialWeightRates.push({key:'film:'+f.id,label:f.name,rate:d,unit:'kg/m³',note:''});touch();
  salesOrderEdit(id);const full=owW(soDraft);salesDraftDrop(true);
  DB.materialWeightRates=DB.materialWeightRates.filter(r=>r.key!=='film:'+f.id);touch();salesOrderEdit(id);const back=owW(soDraft);salesDraftDrop(true);
  return {full,back,norm:(DB.materialWeightRates.find(r=>r.key==='film:'+f.id)||{rate:null}).rate};
 }),{full:{kg:81.6,complete:true,partial:false,gaps:[],text:''},back:{kg:80,complete:false,partial:true,gaps:['film@1'],text:'Interlayer weight not included'},norm:null});

 eq('Sales: 80 Partial, 25 и заказ без размеров — ячейки «80 Partial», «25», «—»; итог 105 Partial; только неизвестный — «—», а не 0; число для сортировки — 80.0',await run(()=>{
  owSetup();DB.salesOrder=[];const a=owOrder(),b=owOrder({rows:[['B',1]]}),c=owOrder({rows:[['B',3]]});salesRecord(c).lines[0].width16=0;touch();
  salesListPrefs=null;const p=salesListLoadPrefs();p.cols.forEach(x=>{if(x.k==='weight')x.on=true;});tab='sales';render();
  const cell=id=>{const tr=[...document.querySelectorAll('table.sl-table tbody tr')].find(r=>r.textContent.includes(salesRecord(id).businessNumber));const i=[...document.querySelectorAll('table.sl-table thead th')].findIndex(h=>/Weight kg/.test(h.textContent));return tr.children[i].textContent.trim();};
  const foot=(document.querySelector('[data-sum="weight"]')||{}).textContent;
  const cols=salesListColumns(),only=salesListFooter([salesListInfo(salesRecord(c))],cols).match(/data-sum="weight"[^>]*>(.*?)<\/td>/)[1].replace(/<[^>]+>/g,'');
  const tip=document.querySelector('[data-weight-partial]').title;
  return {cells:[cell(a),cell(b),cell(c)],foot,only,sort:+salesListValue(salesListInfo(salesRecord(a)),'weight').toFixed(1),tip};
 }),{cells:['80Partial','25','—'],foot:'105Partial',only:'—',sort:80,tip:'Interlayer weight not included\nEVA Clear density → Data → Materials → Lamination → EVA Clear (line 1)'});

 /* Владелец, 30.10.2026: вес — не отдельной строкой в итогах, а «внизу
    сумм, как в Excel — сабтотал для всех таких переменных». */
 const owCols=keys=>run(k=>{const p=salesLoadViewPrefs();if(!p.profiles[p.active])p.profiles[p.active]={};p.profiles[p.active].screen=k;salesSaveViewPrefs();},keys);
 await owCols(['actual','rounded','lineWeight','unitPrice','lineTotal']);
 eq('Order Lines: строка Total под колонками — Qty 3, площадь × Qty, Line Weight «80.02 Partial», деньги — как итог; вес в «Entire order» и жёлтой строки нет; окно Order weight — что и где внести; показ ничего не пишет в базу',await run(()=>{
  owSetup();const id=owOrder();salesOrderEdit(id);render();const before=testStoredText(),f=k=>{const c=document.querySelector('[data-foot="'+k+'"]');return c?c.textContent.trim():null;};
  const a=salesLineAreas(soDraft.lines[0],soDraft),t=salesOrderCommercialTotals(soDraft);
  const r={label:document.querySelector('[data-lines-foot] .line-foot-label').textContent,qty:f('qty'),actual:f('actual')===(a.actual*3).toFixed(2),weight:f('lineWeight'),total:f('lineTotal')===t.subtotal.toFixed(2)||f('lineTotal'),
   caption:/kg/.test(document.querySelector('.metric-order-total-main>small').textContent),strip:!!document.querySelector('.sales-lines-block>[data-weight-gaps]')};
  document.querySelector('[data-foot="lineWeight"] button').click();const f2=owFilm().name;
  r.panel=document.querySelector('.metric-modal [data-weight-gaps]').textContent===`${f2} density · line 1 → Data → Materials → Lamination → ${f2} Open`;salesCloseMetrics();
  salesOpenMetrics('weight',soDraft.lines[0].id);r.where=document.querySelector('[data-weight-where]').textContent===`${f2} density → Data → Materials → Lamination → ${f2}`;salesCloseMetrics();
  r.stored=testStoredText()===before;salesDraftDrop(true);return r;
 }),{label:'Total',qty:'3',actual:true,weight:'80.02Partial',total:true,caption:false,strip:false,panel:true,where:true,stored:true});

 eq('Ячейки строки: Line Weight неполной — «55.01 Partial», полной — «25.01»; фильтр строк — «Total · 1 of 2 lines» и сумма только видимых',await run(()=>{
  owSetup();const id=owOrder();salesOrderEdit(id);soDraft.lines[1].onHold=true;render();
  const cells=[...document.querySelectorAll('.sales-lines-table tbody td[data-metric="lineWeight"]')].map(x=>x.textContent.trim());
  salesSetServiceFilter('hold');const label=document.querySelector('[data-lines-foot] .line-foot-label').textContent,w=document.querySelector('[data-foot="lineWeight"]').textContent.trim();
  salesDraftDrop(true);return {cells,label,w};
 }),{cells:['55.01Partial','25.01'],label:'Total · 1 of 2 lines',w:'25.01'});

 eq('Open у плёнки в окне Order weight — уход из заказа и карточка плёнки в Data; заказ без правок не спрашивает',await run(()=>{
  owSetup();const id=owOrder();salesOrderEdit(id);render();document.querySelector('[data-foot="lineWeight"] button').click();document.querySelector('.metric-modal [data-weight-gaps] button').click();
  return {tab,draft:!!soDraft,card:mdCatEdit===owFilm().id,kind:mdCatKind};
 }),{tab:'masterdata',draft:false,card:true,kind:'interlayerProduct'});
 await owCols(null);

 eq('Нормы заказа: заполненная плотность стекла заморожена при Save (2500 → 2600 в Data не меняет сохранённый, новый — по 2600); пустая плотность плёнки не заморожена — внесли в Data, сохранённый заказ стал полным',await run(()=>{
  owSetup();const f=owFilm(),id=owOrder({rows:[['B',1]]}),lam=owOrder();
  DB.materialWeightRates.find(r=>r.key==='glass').rate=2600;DB.materialWeightRates.push({key:'film:'+f.id,label:f.name,rate:1000,unit:'kg/m³',note:''});touch();
  const kept=owW(salesRecord(id)).kg,fresh=owW(owOrder({rows:[['B',1]],save:false})).kg;salesDraftDrop(true);
  const lamW=owW(salesRecord(lam));
  DB.materialWeightRates.find(r=>r.key==='glass').rate=2500;DB.materialWeightRates=DB.materialWeightRates.filter(r=>r.key!=='film:'+f.id);touch();
  return {kept,fresh,lam:[lamW.complete,lamW.gaps.length]};
 }),{kept:25,fresh:26,lam:[true,0]});

 eq('Черновик без клиента и номера: известное считается; строка без размера — пробел «Size» с номером строки, не ноль; Qty пустым не бывает (пусто — 1, как в Units)',await run(()=>{
  owSetup();const d=owOrder({rows:[['B',2],['B',1,0]],save:false});d.customerId='';d.customerPo='';
  const w=owW(d),l=normalizeSalesOrderLine({qty:''});salesDraftDrop(true);return {w,qty:l.qty};
 }),{w:{kg:50,complete:false,partial:true,gaps:['line-size@2'],text:'Line 2 weight not included'},qty:1});

 eq('Число: 0.14 + 0.14 — сначала сумма, «0.28», не «0»; крупное — целыми с запятой; нет — «—»',await run(()=>[salesKgText(.14+.14),salesKgText(1234.6),salesKgText(null)]),['0.28','1,235','—']);

 eq('Data → Interlayers: «No density N» — плёнки без плотности; в карточке-превью «no density»',await run(()=>{
  owSetup();tab='masterdata';mdCatalogGo('interlayerProduct');const n=DB.interlayerProduct.filter(x=>x.active!==false&&!DB.materialWeightRates.some(r=>r.key==='film:'+x.id&&r.rate!=null)).length;
  const chip=[...document.querySelectorAll('[data-md-health] .pill')].map(x=>x.textContent);mdPeek='interlayerProduct:'+owFilm().id;render();
  const peek=[...document.querySelectorAll('[data-md-peek] .pill')].map(x=>x.textContent);mdPeek='';tab='sales';render();return {chip:chip.includes('No density '+n),n:n>0,peek:peek.includes('no density')};
 }),{chip:true,n:true,peek:true});

 eq('Архив: строка Sales снята с весом и пометкой — «80 Partial» и чего нет; старая строка без пометки — просто число',await run(()=>{
  owSetup();const o=salesRecord(owOrder()),a=archiveRowOf(o,'2026-10-30','2026-10-30T12:00:00Z');
  const cell=x=>{const div=document.createElement('table');div.innerHTML='<tr>'+salesListCell(x,salesListColumn('weight'))+'</tr>';return div.textContent;};
  const info={o:{id:'X'},a,q:false,c:null,memo:{}},old={o:{id:'Y'},a:{row:{weight:42}},q:false,c:null,memo:{}};
  return {kg:Math.round(a.row.weight),note:a.row.weightPartial,cell:cell(info),old:cell(old)};
 }),{kg:80,note:'Interlayer weight not included',cell:'80Partial',old:'42'});

 eq('Бланки: Order summary во всех, где отмечен, — «80 kg · Partial» и строка «Partial weight: interlayer weight not included.» на листе; выключенный — нет; Weight per unit: Work order «27.5 kg/unit · Partial», «25.0 kg/unit»; Order confirmation — «Weight 27.5 kg per unit · Partial»',await run(()=>{
  owSetup();const o=salesRecord(owOrder()),opt=(k,on)=>docCleanOptions(k,Object.assign(docBaseOptions(k),{orderSummary:on,weight:on}));
  const sum=k=>{const m=finWithOrder(o,()=>docBuildModel(k,o,opt(k,true)));const svg=docLayout(m).map(docPageSVG).join('');return [m.summary.find(c=>c.label==='Total weight').value,m.summaryNote,svg.includes('80 kg · Partial')&&svg.includes('Partial weight: interlayer weight not included.')];};
  const off=finWithOrder(o,()=>docBuildModel('confirmation',o,opt('confirmation',false))).summary;
  const wo=finWithOrder(o,()=>docBuildModel('workOrder',o,opt('workOrder',true))).items.map(i=>i.info.split(' · ').slice(1).join(' · '));
  const conf=finWithOrder(o,()=>docBuildModel('confirmation',o,opt('confirmation',true))).items.map(i=>((i.sub.find(x=>/Weight/.test(x.text))||{}).text||'').split(' · ').slice(1).join(' · '));
  return {kinds:['workOrder','proforma','confirmation'].map(sum),off,wo,conf};
 }),{kinds:[['80 kg · Partial','Partial weight: interlayer weight not included.',true],['80 kg · Partial','Partial weight: interlayer weight not included.',true],['80 kg · Partial','Partial weight: interlayer weight not included.',true]],off:null,
  wo:['27.5 kg/unit · Partial','25.0 kg/unit'],conf:['Weight 27.5 kg per unit · Partial','Weight 25.0 kg per unit']});

 eq('Бланк заказа без размеров: «Weight unavailable», не 0; полный — без Partial и без строки под блоком',await run(()=>{
  owSetup();const a=salesRecord(owOrder({rows:[['B',1]]})),b=salesRecord(owOrder({rows:[['B',2]]}));b.lines[0].width16=0;touch();
  const v=o=>{const m=finWithOrder(o,()=>docBuildModel('proforma',o,Object.assign(docBaseOptions('proforma'),{orderSummary:true})));return [m.summary.find(c=>c.label==='Total weight').value,m.summaryNote];};
  return {full:v(a),none:v(b)};
 }),{full:['25 kg',''],none:['Weight unavailable','']});

 eq('Стикер стекла: лайт с номинальной толщиной — «≈», а не точное число; Reports: Weight kg — известное (80), поле Weight — Partial',await run(()=>{
  owSetup();const id=owOrder({rows:[['B',1]]}),o=salesRecord(id);const g=owGlass(10);delete g.actualThicknessMm;touch();
  const lite=finWithOrder(o,()=>stkWeight(o.lines[0],o,1));g.actualThicknessMm=10;touch();
  const p=salesRecord(owOrder());repOrderCache={stamp:'',rows:null};const r=repOrderFacts().find(x=>x.id===p.id);
  return {exact:lite.exact,kg:Math.round(r.kg),status:r.kgStatus};
 }),{exact:false,kg:80,status:'Partial'});

 eq('Геометрия лайтов для веса записана в строку при Save: вес сохранённого заказа не строит план резки; старым строкам её дописывает правка данных 11 — вес тот же',await run(()=>{
  owSetup();const o=salesRecord(owOrder()),before=owW(o).kg,keep=salesEffectiveCuttingPlan;let plans=0;
  window.salesEffectiveCuttingPlan=function(){plans++;return keep.apply(this,arguments);};
  const check=window.GF_SCOPE_CHECK;window.GF_SCOPE_CHECK=false;readScope(()=>salesOrderWeight(o));window.GF_SCOPE_CHECK=check;const used=plans;window.salesEffectiveCuttingPlan=keep;
  o.lines.forEach(l=>{delete l.measure.lites;});DB.dataFix=10;applyDataFixes();
  return {stored:o.lines.every(l=>Array.isArray(l.measure.lites)&&l.measure.lites.length>0),plans:used,fix:DB.dataFix,same:owW(o).kg===before};
 }),{stored:true,plans:0,fix:11,same:true});

 await run(()=>{owSetup();window.owF5=owOrder();return storageFlush();});
 await t.p.reload();await t.p.evaluate(()=>window.storageReady);await require('./optimization-fixture')(t.p);await setup();
 eq('После F5 — тот же вес: 80 Partial, плёнка, строка 1',await run(()=>{const o=DB.salesOrder[DB.salesOrder.length-1];return owW(o);}),{kg:80,complete:false,partial:true,gaps:['film@1'],text:'Interlayer weight not included'});

 eq('order weight: без ошибок страницы',t.errs,[]);
 await t.c.close();
};
