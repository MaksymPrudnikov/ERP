/* Стикеры стёкол: штрихкод Code 128, номера юнитов U-, данные стикера,
   раскладка шаблона, конструктор Master Data → Stickers (размер, детали,
   перетаскивание, сохранение), печать из Sales и из батча. */
module.exports=async function({page,eq,ok}){
 console.log('stickers');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.print=()=>{window.stPrinted=(window.stPrinted||0)+1;};
  /* IGU: Lite 2 — Solarban 60, покрытие на #3. */
  window.stOrder=extra=>{const id=oqOrder(oqCustomer({legalName:'Northside Windows'}),Object.assign({customerPo:'123',dueDate:'2026-09-25'},extra||{}));
   salesOrderEdit(id);const p=soDraft.makeups[0].panes[1],g=glassProductByCode('6SBN60');p.glassProductId=g.id;p.visionType='lowe';p.coatingSurface=3;soDraft.lines[0].mark='Kitchen W2';salesOrderSave();soDraft=null;soEdit=null;return id;};
  /* TGU: снаружи ламинат 6 + плёнка + 6. */
  window.stTgu=()=>{tab='sales';salesOrderNew('order');salesSetUnitType('triple');const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');
   m.panes.forEach(p=>{p.glassProductId=g.id;p.thicknessMm=6;p.priceOverride=5.55;p.heatTreatmentId='HT-FT';});
   const lam=normalizeSalesPane({category:'laminated',heatTreatmentId:'HT-HS',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0);lam.id=m.panes[0].id;lam.priceOverride=9;m.panes[0]=lam;
   m.cavities.forEach(x=>{x.priceOverride=3.1;});soDraft.lines=[];const l=normalizeSalesOrderLine({makeupId:m.id,width16:48*16,height16:36*16,qty:2,mark:'Lobby'});soDraft.lines.push(l);salesEnsureLineShape(l);
   salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;});salesApplyCustomerDefaults(oqCustomer({legalName:'City Glazing'}).id);if(!salesOrderSave())throw new Error('TGU not saved');const id=soDraft.id;soDraft=null;soEdit=null;return id;};
  window.stList=ids=>{soDraft=null;soEdit=null;tab='sales';salesListSel=new Set(ids);render();};
  window.stHost=()=>[...document.querySelectorAll('#stkPrintHost .stk-print-page')].map(p=>p.textContent.replace(/\s+/g,' ').trim());
  window.stDecode=widths=>{let i=0;const vals=[];while(i<widths.length){const run=widths.slice(i,i+6).join('');const v=BARCODE128.indexOf(run);if(v===106||run==='233111'){vals.push(106);break;}if(v<0)return null;vals.push(v);i+=6;}
   let sum=vals[0];for(let k=1;k<vals.length-2;k++)sum+=vals[k]*k;return sum%103===vals[vals.length-2]?vals.slice(1,-2).map(v=>String.fromCharCode(v+32)).join(''):'bad checksum';};
 });};
 await helpers();

 eq('штрихкод Code 128 B: старт, данные, контрольная сумма, стоп; читается обратно; 107 узоров по 11 модулей',await t.p.evaluate(()=>{
  const sums=BARCODE128.map((p,i)=>p.split('').reduce((a,b)=>a+ +b,0)===(i===106?13:11)).every(Boolean);
  return {values:barcode128Values('G-0000001'),width:barcode128Width('G-0000001'),sums,unique:new Set(BARCODE128).size,
   back:['G-0000001','U-0000123','G-1234567'].map(s=>stDecode(barcode128Modules(s))),bars:barcode128Items('G-0000001',0,0,40,1.44).length};
 }),{values:[104,39,13,16,16,16,16,16,16,17,26,106],width:154,sums:true,unique:107,back:['G-0000001','U-0000123','G-1234567'],bars:37});

 eq('номер юнита U- у позиций с двумя и больше стёклами, по изделию; одинарному не выдаётся; qty меньше — последние снимаются; скан G, U, Recut',await t.p.evaluate(()=>{
  oqReset();const id=stOrder(),o=salesRecord(id);
  const first=DB.glassUnitId.map(r=>r.ids.slice());
  salesOrderEdit(id);soDraft.lines[0].qty=1;const m=soDraft.makeups[0];soDraft.makeups.push(Object.assign(JSON.parse(JSON.stringify(m)),{id:'MK-single',code:'B',unitType:'single',panes:[JSON.parse(JSON.stringify(m.panes[0]))],cavities:[]}));soDraft.lines[1].makeupId='MK-single';salesOrderSave();soDraft=null;soEdit=null;
  const after=DB.glassUnitId.map(r=>r.ids.slice()),rec=salesRecord(id);
  oqThrough(id,'verified');const reason=ncrReasonsFor('HEAT',{activeOnly:true})[0];recutCreate({orderId:id,where:'HEAT',reasonId:reason.id,lines:{[rec.lines[0].id]:{on:true,qty:1,which:'0'}}});
  const recutId=glassPieceMap(id).get(glassBatchComponents(rec,rec.lines[0])[0].key).extra.R1[0];
  const look=[DB.glassPiece[0].ids[0],after[0][0],recutId,' '+after[0][0].toLowerCase()+' ','G-9999999','X-1'].map(c=>{const r=glassLookup(c);return r?r.kind+' '+r.unit:null;});
  return {first,after,seq:DB.glassUnitIdSeq,look};
 }),{first:[['U-0000001','U-0000002'],['U-0000003']],after:[['U-0000001']],seq:3,look:['glass 1','unit 1','glass R1.1','unit 1',null,null]});

 eq('номера юнитов в JSON: повтор отклоняется, после перезагрузки те же',await t.p.evaluate(()=>{
  oqReset();stOrder();const src=JSON.parse(JSON.stringify(DB));
  const fail=fn=>{const x=JSON.parse(JSON.stringify(src));fn(x);try{validateImportedState(x);return 'accepted';}catch(e){return e.message;}};
  const next=JSON.parse(JSON.stringify(src));DB=next;normalizeDB();
  return {same:JSON.stringify(DB.glassUnitId)===JSON.stringify(src.glassUnitId),dup:fail(x=>{x.glassUnitId[1].ids[0]=x.glassUnitId[0].ids[0];}),bad:fail(x=>{x.glassUnitId[0].ids[0]='U-12';}),tpl:fail(x=>{x.stickerTemplate=[];})};
 }),{same:true,dup:'Invalid or duplicate Unit ID.',bad:'Invalid or duplicate Unit ID.',tpl:'Sticker templates must be an object.'});

 eq('данные Production: маршрут станций с SHIPR/SHIP, сервисы, размер резки, вес kg, сторона покрытия, батч',await t.p.evaluate(()=>{
  oqReset();const id=stOrder();oqThrough(id,'verified');const o=salesRecord(id);glassBatchAssign(glassBatchRows([o]),{});
  const l=o.lines[0],cs=glassBatchComponents(o,l),d=stkGlassData('production',o,l,cs[1],2,{batch:stkBatchOf(o,cs[1],2)});
  return {id:d.id===glassPieceMap(id).get(cs[1].key).ids[1],order:d.order+' / '+d.line,unit:d.unit+' of '+d.of,lite:d.lite+' of '+d.lites,glass:stkGlassText(d.glass,stkDetailsBase(stkBlockDef('glass'))),code:stkGlassText(d.glass,{code:true,surface:true}),
   route:d.route.codes.join(' > '),services:d.route.services.map(s=>s.station+' '+s.text),cut:d.cut,kg:Math.round(d.weight.kg*10)/10,batch:d.batch,due:d.dueWeekday+' '+d.due};
 }),{id:true,order:'76002 / 1',unit:'2 of 2',lite:'2 of 2',glass:'Solarban 60 on Clear 6mm · Tempered · #3',code:'6SBN60 · #3',route:'CUT > EDGE > HEAT > IGU > SHIPR > SHIP',services:['EDGE ROUGH ARRIS','HEAT TEMPERING'],cut:{w:37,h:71},kg:24,batch:'B-0001',due:'Fri Sep 25'});

 eq('данные Final · whole unit: TGU с ламинатом — плёнка и её мм, рамки, газ, толщина; детали выключаются',await t.p.evaluate(()=>{
  oqReset();const id=stTgu(),o=salesRecord(id),d=stkUnitData(o,o.lines[0],2),det=stkDetailsBase(stkBlockDef('makeup'));
  const rows=d.rows.map(r=>r.label+': '+stkMakeupRowText(r,det)),off=stkMakeupRowText(d.rows[0],Object.assign({},det,{film:false,heat:false}));
  return {id:d.id,heading:d.heading,mm:Math.round(d.thicknessMm),rows,off,finished:d.finished,sealant:stkMakeupRowText(d.rows[1],Object.assign({},det,{sealant:true}))};
 }),{id:'U-0000002',heading:'Triple IGU · laminated',mm:52,
  rows:['Lite 1: Clear 6mm · Heat Strengthened + EVA Clear 0.76 mm (2 layers) + Clear 6mm · Heat Strengthened','Space: Black Warm Edge 17/32″ · Argon','Lite 2: Clear 6mm · Tempered','Space: Black Warm Edge 17/32″ · Argon','Lite 3: Clear 6mm · Tempered'],
  off:'Clear 6mm + EVA Clear + Clear 6mm',finished:{w:48,h:36},sealant:'Black Warm Edge 17/32″ · Argon · PIB / PS'});

 eq('базовые шаблоны: 3 стикера × 4×6 и 3×4 × стоя и лёжа помещаются, только чёрное и белое; Bottom прижат к низу',await t.p.evaluate(()=>{
  oqReset();const id=stOrder(),o=salesRecord(id),l=o.lines[0],cs=glassBatchComponents(o,l),bad=[];let colors=0,bottom=[];
  STK_TYPES.forEach(ty=>STK_SIZES.forEach(z=>['portrait','landscape'].forEach(or=>{
   const d=ty.k==='unit'?stkUnitData(o,l,1):stkGlassData(ty.k,o,l,cs[1],1,{batch:'B-0001'}),tpl=stkBase(ty.k,z.k,or),pg=stkLayout(tpl,z.k,d);
   if(pg.overflow.length)bad.push(ty.k+' '+z.k+' '+or+': '+pg.overflow.join(','));
   colors+=pg.items.filter(i=>i.color&&!['#000000','#ffffff'].includes(i.color)||i.fill&&!['#000000','none'].includes(i.fill)).length;
   if(ty.k==='production'){const box=k=>pg.boxes.find(b=>tpl.blocks.find(x=>x.id===b.id).k===k),last=box('services'),route=box('route');bottom.push(Math.abs(last.y+last.h-(pg.h-stkMargin(z.k)))<1&&route.y>pg.h*.6&&route.y<last.y);}
  })));
  return {bad,colors,bottom};
 }),{bad:[],colors:0,bottom:[true,true,true,true]});

 eq('не влезло — называется; штрихкод в узкой колонке не печатается сжатым',await t.p.evaluate(()=>{
  const d=stkDemoData('production'),tpl=stkBase('production','4x6','portrait');
  const big=JSON.parse(JSON.stringify(tpl));big.blocks.find(b=>b.k==='order').size=90;big.blocks.find(b=>b.k==='size').size=72;
  const narrow=stkBase('production','3x4','portrait');narrow.blocks.find(b=>b.k==='barcode').at='left';narrow.blocks.find(b=>b.k==='order').at='right';
  const pg=stkLayout(narrow,'3x4',d),bar=pg.boxes.find(b=>b.id===narrow.blocks.find(x=>x.k==='barcode').id),ord=pg.boxes.find(b=>b.id===narrow.blocks.find(x=>x.k==='order').id),num=pg.items.find(i=>i.t==='text'&&i.s==='76622 / 1');
  const bars=pg.items.filter(i=>i.t==='rect'&&i.x>=bar.x-1&&i.x<=bar.x+bar.w&&i.y===bar.y),narrowest=Math.min(...bars.map(i=>i.w));
  return {big:stkLayout(big,'4x6',d).overflow.length>0,narrow:pg.overflow,module:Math.round(narrowest*100)/100,shrunk:num.size<24&&docTextWidth(num.s,num.size,true)<=ord.w+.5,base:stkLayout(tpl,'4x6',d).overflow};
 }),{big:true,narrow:[],module:0.72,shrunk:true,base:[]});

 eq('конструктор: вкладка Stickers, размер −/+ в pt, жирный, детали, свой текст; Unsaved changes; Save хранит шаблон',await t.p.evaluate(()=>{
  oqReset();stOrder();tab='masterdata';mdSetTab('stickers');
  const row=k=>document.querySelector('[data-stk-kind="'+k+'"]'),fontOf=s=>{const x=[...document.querySelectorAll('[data-stk-paper] text')].find(e=>e.textContent.includes(s));return x?+x.getAttribute('font-size'):null;};
  const tabs=[...document.querySelectorAll('.card > .tabs button')].map(b=>b.textContent),saveOff=document.querySelector('[data-stk-save]').disabled,before=fontOf('NORTHSIDE');
  row('customer').querySelector('[data-stk-plus]').click();row('customer').querySelector('[data-stk-plus]').click();const plus=fontOf('NORTHSIDE');
  const input=row('customer').querySelector('[data-stk-size]');input.value='200';input.dispatchEvent(new Event('change'));const clamped=+row('customer').querySelector('[data-stk-size]').value;
  input.value;row('customer').querySelector('[data-stk-size]').value='18';row('customer').querySelector('[data-stk-size]').dispatchEvent(new Event('change'));
  row('glass').querySelector('[data-stk-gear]').click();const panel=!!document.querySelector('[data-stk-details-panel]');
  document.querySelector('[data-stk-details-panel] [data-stk-detail="code"]').click();const code=document.querySelector('[data-stk-paper]').textContent.includes('6CLEAR · Tempered');
  document.querySelector('[data-stk-add="text"]').click();const txt=document.querySelectorAll('[data-stk-kind="text"]');const mine=txt[txt.length-1].querySelector('[data-stk-text]');mine.value='FRAGILE';mine.dispatchEvent(new Event('change'));
  const shown=document.querySelector('[data-stk-paper]').textContent.includes('FRAGILE'),dirty=!!document.querySelector('[data-stk-dirty]');
  document.querySelector('[data-stk-save]').click();
  const saved=DB.stickerTemplate['production|4x6'],cust=saved.blocks.find(b=>b.k==='customer');
  return {tabs:tabs.includes('Stickers'),saveOff,before,plus,clamped,panel,code,shown,dirty,after:!!document.querySelector('[data-stk-dirty]'),saved:[cust.size,saved.blocks.find(b=>b.k==='glass').details.code,saved.blocks.filter(b=>b.k==='text').map(b=>b.text).includes('FRAGILE')]};
 }),{tabs:true,saveOff:true,before:16,plus:18,clamped:60,panel:true,code:true,shown:true,dirty:true,after:false,saved:[18,true,true]});

 eq('шаблон переживает перезагрузку; Reset to base возвращает базу; 3×4 и ориентация — свои шаблоны',await t.p.evaluate(async()=>{
  const k=DB.stickerTemplate['production|4x6'].blocks.find(b=>b.k==='customer').size;
  stkBuilder=null;DB=JSON.parse(JSON.stringify(DB));normalizeDB();tab='masterdata';mdSetTab('stickers');
  const kept=stkTemplate('production','4x6').blocks.find(b=>b.k==='customer').size;
  document.querySelector('[data-stk-seg="3x4"]').click();const small=stkDraft().tpl.orient;document.querySelector('[data-stk-seg="portrait"]').click();const orient=stkDraft().tpl.orient;
  document.querySelector('[data-stk-seg="4x6"]').click();document.querySelector('[data-stk-reset]').click();const reset=stkDraft().tpl.blocks.find(b=>b.k==='customer').size;
  const marks=[...document.querySelectorAll('[data-stk-seg]')].filter(b=>b.textContent.endsWith('•')).map(b=>b.dataset.stkSeg);
  return {k,kept,small,orient,reset,marks};
 }),{k:18,kept:18,small:'landscape',orient:'portrait',reset:16,marks:['production','4x6','3x4']});

 await t.p.evaluate(()=>{stkBuilder=null;DB.stickerTemplate={};tab='masterdata';mdSetTab('stickers');});
 const orderOf=()=>t.p.evaluate(()=>stkDraft().tpl.blocks.filter(b=>b.at!=='bottom').map(b=>b.k).slice(0,6));
 const beforeDrag=await orderOf();
 await t.p.locator('[data-stk-kind="customer"] .stk-grip').dragTo(t.p.locator('[data-stk-kind="company"]'),{targetPosition:{x:20,y:3}});
 const afterList=await orderOf();
 const hitOf=k=>t.p.evaluate(k=>{const b=stkDraft().tpl.blocks.find(x=>x.k===k);return '[data-stk-hit="'+b.id+'"]';},k);
 await t.p.locator(await hitOf('po')).dragTo(t.p.locator(await hitOf('due')),{targetPosition:{x:10,y:2}});
 eq('перетаскивание: в списке меняется порядок; на стикере блок встаёт в колонку того, на кого брошен; в Bottom — к низу',{beforeDrag,afterList,po:await t.p.evaluate(()=>{
  const bl=stkDraft().tpl.blocks,po=bl.find(b=>b.k==='po'),due=bl.find(b=>b.k==='due');const at=po.at,next=bl.indexOf(po)===bl.indexOf(due)-1;
  stkMoveToZone(bl.find(b=>b.k==='glass').id,'bottom');const b2=stkDraft().tpl.blocks;return {at,next,glass:b2.find(b=>b.k==='glass').at,last:b2[b2.length-1].k};})},
  {beforeDrag:['company','batch','barcode','divider','order','unit'],afterList:['customer','company','batch','barcode','divider','order'],po:{at:'right',next:true,glass:'bottom',last:'glass'}});

 eq('Sales: кнопка Stickers — один выбранный заказ; квота, несколько, отменённый — нет; пункт Print stickers… в меню',await t.p.evaluate(()=>{
  oqReset();DB.stickerTemplate={};const a=stOrder(),b=stOrder(),q=oqOrder(oqCustomer(),{kind:'quote'});soDraft=null;soEdit=null;const c=stOrder();salesSetRecordStatus(c,'cancelled');
  const btn=ids=>{stList(ids);return !document.querySelector('[data-stickers-button]').disabled;};
  const res={one:btn([a]),none:btn([]),many:btn([a,b]),quote:btn([q]),cancelled:btn([c])};
  stList([]);salesListContext({preventDefault(){},stopPropagation(){},clientX:300,clientY:300},a);res.menu=!!document.querySelector('[data-menu="stickers"]');
  salesListMenuRun('stickers');res.dialog=document.querySelector('.stk-modal h3').textContent;return res;
 }),{one:true,none:false,many:false,quote:false,cancelled:false,menu:true,dialog:'Print stickers · Order 76002'});

 eq('окно печати: все стёкла всех позиций; выбор стекла и номеров; ошибка номеров; Final · whole unit — только юниты; без Glass ID на экране',await t.p.evaluate(()=>{
  const id=DB.salesOrder[0].id,o=salesRecord(id),L=o.lines,cs=glassBatchComponents(o,L[0]);stkOpenForOrder(id);
  const count=()=>document.querySelector('[data-stk-count]').textContent,res={all:count()};
  stkDialogRow('L:'+L[1].id,'on',false,true);stkDialogRow('L:'+L[0].id,'which',cs[1].key,true);stkDialogRow('L:'+L[0].id,'units','2');res.one=count();
  stkDialogRow('L:'+L[0].id,'units','1-9');res.bad=[count(),document.querySelector('[data-stk-print]').disabled];stkDialogRow('L:'+L[0].id,'units','1, 2');
  stkDialogType('unit');res.unit=count();res.which=document.querySelector('[data-stk-row="L:'+L[0].id+'"] [data-stk-which]').disabled;
  res.ids=/[GU]-\d{7}/.test(document.querySelector('.stk-modal').innerText+document.getElementById('app').innerText);
  res.russian=/[А-яЁё]/.test(document.querySelector('.stk-modal').innerText);return res;
 }),{all:'6 stickers',one:'1 sticker',bad:['Line 1: units 1 to 2',true],unit:'2 stickers',which:true,ids:false,russian:false});

 eq('Print: страницы по одной на стикер, @page нужного размера, размер рулона запоминается; стикер с U-номером и составом',await t.p.evaluate(()=>{
  stkDialogSize('3x4');stkDialogPrint();const page=document.getElementById('stkPageStyle').textContent,pages=stHost();stkPrintCleanup();
  const o=DB.salesOrder[0];stkOpenForOrder(o.id);const pref=stkDialog.size;stkDialogClose();
  return {page,count:pages.length,first:pages[0].includes(DB.glassUnitId[0].ids[0])&&pages[0].includes('Unit 1 of 2')&&pages[0].includes('IGU'),pref,dialog:stkDialog};
 }),{page:'@page stk{size:4in 3in;margin:0}',count:2,first:true,pref:'3x4',dialog:null});

 eq('Recut в окне печати: стекло R с меткой RECUT; не влезло — предупреждение и Print anyway',await t.p.evaluate(()=>{
  oqReset();const id=stOrder();oqThrough(id,'batched');const o=salesRecord(id);const reason=ncrReasonsFor('HEAT',{activeOnly:true})[0];
  recutCreate({orderId:id,where:'HEAT',reasonId:reason.id,lines:{[o.lines[0].id]:{on:true,qty:2,which:'0'}}});const r=DB.recut[0];
  stkOpenForOrder(id);Object.keys(stkDialog.rows).forEach(k=>{stkDialog.rows[k].on=k==='R:'+r.id;});stkDialogSize('4x6');render();
  const count=document.querySelector('[data-stk-count]').textContent;stkDialogPrint();const pages=stHost();stkPrintCleanup();
  DB.stickerTemplate={'production|4x6':(()=>{const x=stkBase('production','4x6');x.blocks.find(b=>b.k==='order').size=90;x.blocks.find(b=>b.k==='size').size=72;return x;})()};
  stkOpenForOrder(id);stkDialogPrint();const warn=document.querySelector('[data-stk-warning]').textContent,btn=document.querySelector('[data-stk-print]').textContent;const printed=window.stPrinted;stkDialogPrint();
  const after=window.stPrinted-printed;stkPrintCleanup();DB.stickerTemplate={};
  return {count,recut:pages.every(p=>p.includes('RECUT 1')),ids:pages.map(p=>/G-\d{7}/.exec(p)[0]).join()===glassPieceMap(id).get(r.keys[0]).extra.R1.join(),warn:warn.startsWith("⚠ Doesn't fit"),btn,after};
 }),{count:'2 stickers',recut:true,ids:true,warn:true,btn:'Print anyway',after:1});

 eq('батч: Print stickers — все стёкла по порядку заказ → позиция → изделие → лайт; с выбором — только выбранные',await t.p.evaluate(()=>{
  oqReset();const b1=stOrder({businessNumber:'80002'}),a1=stOrder({businessNumber:'80001'});[a1,b1].forEach(id=>oqThrough(id,'verified'));
  glassBatchAssign(glassBatchRows([salesRecord(b1),salesRecord(a1)]),{});const bno=DB.glassBatch[0].number;glassBatchOpen(bno);
  const btn=document.querySelector('[data-print-stickers]').textContent;document.querySelector('[data-print-stickers]').click();const title=document.querySelector('.stk-modal h3').textContent,count=document.querySelector('[data-stk-count]').textContent;
  const jobs=stkDialogJobs().jobs.map(j=>j.o.businessNumber+'/'+(j.o.lines.indexOf(j.l)+1)+'/'+j.unit+'/'+j.c.lite).slice(0,5);stkDialogClose();
  const rows=[...document.querySelectorAll('[data-glass-check]')].slice(0,2);rows.forEach(c=>c.click());const sel=document.querySelector('[data-print-stickers]').textContent;
  document.querySelector('[data-print-stickers]').click();stkDialogPrint();const pages=stHost().length;stkPrintCleanup();
  return {btn,title,count,jobs,sel,pages};
 }),{btn:'Print stickers',title:'Print stickers · Batch B-0001',count:'12 stickers',jobs:['80001/1/1/1','80001/1/1/2','80001/1/2/1','80001/1/2/2','80001/2/1/1'],sel:'Print 2 stickers',pages:2});

 eq('конструктор без русского; пустая программа — демо-стекло',await t.p.evaluate(()=>{
  oqReset();stkBuilder=null;tab='masterdata';mdSetTab('stickers');const text=document.querySelector('[data-stk-builder]').innerText;
  return {russian:/[А-яЁё]/.test(text),demo:text.includes('Demo glass'),fits:document.querySelector('[data-stk-fit]').dataset.stkFit};
 }),{russian:false,demo:true,fits:'yes'});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне конструктор и окно печати не шире экрана',await t.p.evaluate(()=>{
  const wide=()=>document.documentElement.scrollWidth<=innerWidth+1;render();const builder=wide();oqReset();const id=stOrder();stOrder();stkOpenForOrder(id);const r=document.querySelector('.stk-modal').getBoundingClientRect();return {builder,dialog:r.left>=0&&r.right<=innerWidth+1};
 }),{builder:true,dialog:true});
 eq('стикеры без ошибок страницы',t.errs,[]);await t.c.close();
};
