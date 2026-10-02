/* Производство и станция понятны с первого взгляда (владелец, 2 октября
   2026): маршрут в Production — нумерованный список с пояснениями; очередь
   CUT без цветной полосы; окно Drawings — настоящее окно с подсказкой. */
module.exports=async function({page,eq}){
 console.log('station-polish');const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 eq('Production → Stations: How glass moves — numbered steps in plain words, edges as one step, no warning notes, no sideways scroll',await t.p.evaluate(()=>{
  tab='production';subtab='stations';render();const card=document.querySelector('.sf-route-card');if(!card)return {missing:true};const steps=[...card.querySelectorAll('[data-route-step]')];
  const edges=steps.find(s=>s.dataset.routeCodes.includes('ARRIS')),cut=steps[0],text=card.innerText;
  edges.click();const hit=[...document.querySelectorAll('tr.sf-hit')].map(tr=>tr.dataset.sfStation).join(' ');
  return {title:card.querySelector('h3').textContent,count:steps.length===sfSteps().length,first:cut.querySelector('b').textContent+' · '+cut.querySelector('.when').textContent+' · '+cut.querySelector('.what').textContent,
   edges:edges.querySelector('b').textContent+' · '+edges.dataset.routeCodes,hit:hit===edges.dataset.routeCodes,notes:/Sizes not measured|Without works/.test(document.getElementById('app').innerText),
   scroll:card.scrollWidth<=card.clientWidth+1,russian:/[А-яЁё]/.test(text)};
 }),{title:'How glass moves',count:true,first:'Cutting · always · cut from the sheet',edges:'Edges · ARRIS POLISH BEVEL MITER CNC',hit:true,notes:false,scroll:true,russian:false});
 await t.p.evaluate(()=>{
  oqReset();DB.stationScan=[];
  if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));
  const mk=(name,sizes)=>{const id=oqOrder(oqCustomer({legalName:name}));salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});salesOrderSave();soDraft=null;soEdit=null;oqThrough(id,'verified');return id;};
  const a=mk('North Shore Windows',[[36,24,3],[48,30,2]]),b=mk('Lakeview Glass',[[40,40,2]]);
  glassBatchAssign(glassBatchRows([salesRecord(a)]),{});cutPlanRun(DB.glassBatch.at(-1).number);glassBatchAssign(glassBatchRows([salesRecord(b)]),{});
  DB.user.push({name:'Polish Cutter',role:'Shop',station:'CUT',skills:[],pin:''});normalizeUsers();
  stationCode='CUT';tab='station';render();stationLogin(DB.user.at(-1).viewProfileId);
 });
 eq('CUT → Queue: no colour strip; one line says how many batches and sheets; a batch without a plan reads in one line',await t.p.evaluate(()=>{
  stationTab='queue';render();const app=document.getElementById('app'),head=app.querySelector('[data-queue-head]'),q=stationQueueData();
  const noplan=app.querySelector('.st-qnoplan'),left=q.cards.reduce((t,c)=>t+c.groups.reduce((m,g)=>m+g.total-g.done,0),0);
  return {strip:!!app.querySelector('.st-qstrip')||/Suggested order/.test(app.innerText),head:head&&head.textContent,expected:'Batchesoffice order — cut any one · 2 batches · '+left+' sheet'+(left===1?'':'s')+' left',
   inlineColour:[...app.querySelectorAll('[style*="background"]')].some(el=>/#[0-9a-f]{3,6}/i.test(el.getAttribute('style'))),
   noplan:!!noplan&&noplan.getBoundingClientRect().height<30&&!noplan.classList.contains('st-qg'),order:[...app.querySelectorAll('[data-queue-batch]')].map(x=>x.dataset.queueBatch).join()===q.cards.map(c=>c.b.number).join()};
 }).then(r=>({...r,head:r.head===r.expected,expected:undefined})),{strip:false,head:true,inlineColour:false,noplan:true,order:true});
 eq('Drawings button: a real window with a one-line hint, a big Close, order tiles with the number of drawings',await t.p.evaluate(()=>{
  stationTab='scan';render();stationDrawPick();const d=document.querySelector('[data-station-draw]'),r=d.getBoundingClientRect(),tile=d.querySelector('[data-station-draw-order]');
  const o=DB.salesOrder.find(x=>x.businessNumber===tile.dataset.stationDrawOrder),n=stationDrawLines(o).length;
  const out={window:d.classList.contains('st-draw-pick')&&r.left>20&&r.top>60,title:d.querySelector('h2').textContent,hint:(d.querySelector('.st-draw-hint')||{}).textContent,close:(d.querySelector('.st-draw-close')||{}).textContent,
   tile:(tile.querySelector('small')||{}).textContent===n+' drawing'+(n===1?'':'s'),red:tile.classList.contains('st-reason')};
  stationCloseDrawer();out.closed=!document.querySelector('[data-station-draw]');return out;
 }),{window:true,title:'Drawings · CUT',hint:"Open any order's drawing: tap an order, type its number or scan a glass sticker.",close:'× Close',tile:true,red:false,closed:true});
 eq('station-polish без ошибок страницы',t.errs,[]);
 await t.c.close();
};
