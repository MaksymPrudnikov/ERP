/* Production → Floor, A2 (20.11.2026, docs/ЗАДАЧА_КАРТА_ЦЕХА.md): живой план —
   Working / Waiting / Idle по порогу станции, станки по отдельности, долли в
   зоне станции, которую ждёт их стекло, карточка станции за период, сводка-
   фильтр, Show on floor, клик из Overview. */
module.exports=async function({page,eq,ok}){
 console.log('floor-live');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.flvReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.carrierSeq={};DB.ncr=[];DB.sheetBreak=[];DB.floorItem=[];
   DB.station.forEach(s=>{delete s.machines;delete s.workingMin;delete s.color;});floorEdit=null;floorPick='';floorFind='';floorFilter='';floorPeriod='today';floorLiveMemo={key:'',data:null};carrierWin=null;floorCam=null;
   carrierAdd('DL',6);
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.flvOrder=function(sizes,name){
   const id=oqOrder(oqCustomer({legalName:name||'North Shore Windows'}),{dueDate:'2026-10-20'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   if(!soDraft.customerPo)soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.flvIds=function(id){return [...glassPieceMap(id).values()].flatMap(r=>r.ids);};
  window.flvScan=function(pieces,opts){pieces.forEach(p=>{const g=stationGlass(p),pl=stationPlace(g),c=stationCheck(pl.waiting,p);stationMove(pl.waiting,c,{name:'Roman H.'},opts||{});});};
  window.flvWait=function(p){return stationPlace(stationGlass(p)).waiting;};
  /* План: блок на каждую станцию в ряд, зона — по запросу. */
  window.flvPlan=function(zones){
   const rows=[floorClean({id:'h',kind:'hall',w:80,l:40})];
   DB.station.forEach((s,i)=>rows.push(floorClean({id:'m-'+s.code,kind:'machine',station:s.code,x:2+i*5,y:5,w:2,l:4})));
   (zones||[]).forEach((code,i)=>rows.push(floorClean({id:'z-'+code,kind:'zone',station:code,x:2+i*12,y:20,w:10,l:6})));
   DB.floorItem=rows;touch();
  };
  /* Вид приближен: подписи не влезающие в блок прячутся (остаётся точка) — тесту нужен текст. */
  window.flvOpen=function(){tab='production';subtab='floor';floorLiveMemo={key:'',data:null};floorCam={x:0,y:0,w:24,h:16};render();};
  window.flvText=function(sel){const el=document.querySelector(sel);return el?(el.innerText==null?el.textContent:el.innerText).replace(/\s+/g,' ').trim():'';};
  window.flvIn=function(rect,zone){const x=+rect.getAttribute('x'),y=+rect.getAttribute('y');return x>=zone.x&&y>=zone.y&&x<=zone.x+zone.w&&y<=zone.y+zone.l;};
 });

 eq('состояние: скан станции — Working; стекло ждёт без скана — Waiting; остальное — Idle; сводка считает станции; подпись на блоке — «● код очередь»',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,3]]),ids=flvIds(id);flvScan(ids);const st=flvWait(ids[0]),first=DB.stationScan[0].station;flvPlan();
  const live=floorLive();flvOpen();
  const cls=code=>document.querySelector(`[data-floor-item="m-${code}"]`).getAttribute('class');
  return {first:live.st[first].status,next:[live.st[st].status,live.st[st].waiting],idle:Object.values(live.st).filter(s=>s.status==='idle').length===DB.station.length-2,
   classes:[/is-working/.test(cls(first)),/is-waiting/.test(cls(st))],summary:flvText('[data-floor-filter="working"]')+' | '+flvText('[data-floor-filter="waiting"]'),
   tag:[flvText(`[data-floor-label="m-${st}"]`),document.querySelector(`[data-floor-label="m-${st}"] .fl-dt`).getAttribute('class'),flvText(`[data-floor-label="m-${first}"]`)].join('|')===`● ${st} 3|fl-dt is-waiting|● ${first}`,title:document.querySelector(`[data-floor-item="m-${st}"] title`).textContent.startsWith(st+' · Waiting · 3 waiting')};
 }),{first:'working',next:['waiting',3],idle:true,classes:[true,true],summary:'1 working | 1 waiting',tag:true,title:true});

 eq('порог Working — свой у станции: скан 40 минут назад — Idle при 15, Working при 120; подсказка «обычный перерыв» из сканов за 14 дней',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,6]]),ids=flvIds(id);flvScan(ids.slice(0,1));const code=DB.stationScan[0].station;
  const at=Date.parse(DB.stationScan[0].at),later=new Date(at+40*6e4).toISOString();
  const a=floorLive(later).st[code].working;DB.station.find(s=>s.code===code).workingMin=120;const b=floorLive(later).st[code].working;
  /* Сканы дня через 10, 20, 30… минут — 90-й процентиль промежутков. */
  const base=Date.parse('2026-11-18T08:00:00');DB.stationScan.push(...[0,10,20,30,40,50,95].map((m,i)=>({id:'SC-99'+String(i).padStart(5,'0'),at:new Date(base+m*6e4).toISOString(),piece:ids[0],station:code,undoneAt:''})));
  const gap=floorUsualGap(code,'2026-11-20T08:00:00');DB.stationScan=DB.stationScan.filter(s=>!/^SC-99/.test(s.id));
  return {a,b,gap};
 }),{a:false,b:true,gap:45});

 eq('Master Data → Stations: поле Working, min пишет порог; не число — ошибка; пусто — 15 по умолчанию',await t.p.evaluate(()=>{
  flvReset();tab='masterdata';mdSetTab('stations');const i=DB.station.findIndex(s=>s.code==='HEAT');
  stEditOpen(i);document.getElementById('sf_working').value='30';saveSfStation();const set=DB.station[i].workingMin;
  stEditOpen(i);document.getElementById('sf_working').value='0';const bad=saveSfStation(),err=document.getElementById('e_sfStation').textContent;stEditCancel();
  stEditOpen(i);document.getElementById('sf_working').value='';saveSfStation();
  return {set,bad,err,none:'workingMin' in DB.station[i],def:floorWorkingMin('HEAT')};
 }),{set:30,bad:false,err:'Working: whole minutes, 1–600, or empty',none:false,def:15});

 eq('станки: у POLISH-станции P1 и P2 — блок станка горит по своим сканам; станция Working, если работает хотя бы один станок',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,3]]),ids=flvIds(id);flvScan(ids);const st=flvWait(ids[0]);
  DB.station.find(s=>s.code===st).machines=['P1','P2'];flvPlan();DB.floorItem.find(r=>r.id==='m-'+st).machine='P1';
  DB.floorItem.push(floorClean({id:'m2',kind:'machine',station:st,machine:'P2',x:60,y:5,w:2,l:4}));
  flvScan([ids[0]],{machine:'P1'});const live=floorLive();flvOpen();
  const cls=id=>document.querySelector(`[data-floor-item="${id}"]`).getAttribute('class');
  return {station:live.st[st].status,p1:live.st[st].machines.P1.working,p2:live.st[st].machines.P2.working,blocks:[/is-working/.test(cls('m-'+st)),/is-waiting/.test(cls('m2'))],label:[document.querySelector('[data-floor-label="m2"]').textContent,document.querySelector(`[data-floor-label="m-${st}"]`).textContent].join('|')==='● P2|● P1 '+live.st[st].waiting};
 }),{station:'working',p1:true,p2:false,blocks:[true,true],label:true});

 eq('долли: в зоне станции, которую ждёт её стекло; стекло на разные станции — один значок, где его больше; без зоны — у станка; пустой долли нет',await t.p.evaluate(()=>{
  flvReset();const a=flvOrder([[36,24,3]],'Granite City Glazing'),ia=flvIds(a);
  flvScan(ia,{on:'DL-1'});const st=flvWait(ia[0]);
  /* Одно стекло дальше: на DL-1 два ждут st, одно — следующую станцию. */
  flvScan([ia[0]],{on:'DL-1'});const st2=flvWait(ia[0]);
  flvPlan([st]);const live=floorLive(),c=live.carriers.find(x=>x.code==='DL-1');flvOpen();
  const zone=DB.floorItem.find(r=>r.id==='z-'+st),icon=document.querySelector('[data-floor-carrier="DL-1"]');
  const icons=document.querySelectorAll('[data-floor-carrier]').length;
  /* Зону убрали — значок у станка станции. */
  DB.floorItem=DB.floorItem.filter(r=>r.kind!=='zone');touch();flvOpen();const near=document.querySelector('[data-floor-carrier="DL-1"]'),block=DB.floorItem.find(r=>r.id==='m-'+st);
  return {split:c.split[st]===2&&c.split[st2]===1&&Object.keys(c.split).length===2,station:c.station===st,inZone:flvIn(icon,zone),icons,near:+near.getAttribute('y')>block.y+block.l,title:icon.querySelector('title').textContent==='DL-1 · 3 glass · 2 → '+st+', 1 → '+st2};
 }),{split:true,station:true,inZone:true,icons:1,near:true,title:true});

 eq('карточка станции: Today — сделано, ждёт на долли (разбитое — уже не ждёт), брак здесь и NCR станции; 7 days — таблица по дням',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,4]]),ids=flvIds(id);flvScan(ids,{on:'DL-2'});const code=DB.stationScan[0].station,next=flvWait(ids[0]);flvPlan();
  DB.stationScan.push({id:'SC-0099999',at:new Date().toISOString(),piece:ids[0],station:code,undoneAt:'',broken:true,by:'',byId:''});
  DB.ncr.push({id:'n1',number:'NCR1001',orderId:id,createdAt:new Date().toISOString(),where:code,glass:[{qty:2}]});
  flvOpen();floorPickStation(code);
  const today=repDay(new Date().toISOString()),facts=repWorkFacts(today).filter(f=>f.station===code);
  const done=flvText('[data-floor-done] b'),broken=flvText('[data-floor-broken] b'),ncr=flvText('[data-floor-ncr] b');
  floorPickStation(next);const wait=[...document.querySelectorAll('.fl-tile')].find(x=>x.textContent.startsWith('Waiting now')).innerText.replace(/\s+/g,' ');
  const list=flvText('[data-floor-tare-list]');
  floorPickStation(code);document.querySelector('[data-floor-period="7"]').click();
  /* Рабочие дни: выходные без работы — не строки (сегодня работа есть — строка). */
  const work=floorPeriodRange('7',today).days.filter(d=>{const w=new Date(d+'T12:00:00').getDay();return d===today||(w!==0&&w!==6);}).length;
  const rows=document.querySelectorAll('[data-floor-days] tbody tr').length===work?7:-1,head=[...document.querySelectorAll('[data-floor-days] th')].map(x=>x.textContent).join(',');
  floorSetPeriod('today');
  return {done:done===String(facts.length),broken,ncr,wait,list,rows,head:head.startsWith('Date,Done,')&&head.endsWith(',People,Broken,NCR'),remembered:localStorage.getItem('glass_erp_floor_period_v1')};
 }),{done:true,broken:'1',ncr:'2',wait:'Waiting now 3 on 1 dolly',list:'DL-2 · 3 glass',rows:7,head:true,remembered:'today'});

 eq('работы станции по видам: «Holes 34 pcs» и размеры мелко — из фактов работы',await t.p.evaluate(()=>{
  flvReset();const f=[{station:'DRILL',day:'2026-11-20',works:[{op:'Hole',label:'Hole · 12 mm',unit:'pc',qty:20},{op:'Hole',label:'Hole · 25 mm',unit:'pc',qty:14},{op:'Cutout',label:'Cutout',unit:'pc',qty:6}],pcs:40}];
  const was=window.repWorkFacts;window.repWorkFacts=()=>f;const c=floorCard('DRILL','today','2026-11-20');window.repWorkFacts=was;
  return c.ops.map(o=>o.name+' '+o.qty+' '+o.unit+(o.sizes.size?' ('+[...o.sizes].map(([k,v])=>k+' '+v).join(' · ')+')':''));
 }),['Hole 34 pcs (12 mm 20 · 25 mm 14)','Cutout 6 pcs']);

 eq('сводка — фильтр: «working» гасит остальные станции, Show all возвращает; Esc снимает выбор',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,2]]),ids=flvIds(id);flvScan(ids);const first=DB.stationScan[0].station,st=flvWait(ids[0]);flvPlan();flvOpen();
  document.querySelector('[data-floor-filter="working"]').click();
  const dim=document.querySelector(`[data-floor-item="m-${st}"]`).getAttribute('class').includes('dim'),on=!document.querySelector(`[data-floor-item="m-${first}"]`).getAttribute('class').includes('dim');
  document.querySelector('.fl-show-all').click();const back=!document.querySelector(`[data-floor-item="m-${st}"]`).getAttribute('class').includes('dim');
  floorPickStation(st);document.querySelector('[data-floor-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return {dim,on,back,esc:floorPick===''&&!!document.querySelector('.fl-stations')};
 }),{dim:true,on:true,back:true,esc:true});

 eq('Show on floor из окна тары: Floor, зона мигает, значок в кольце, справа — что ждёт её стекло',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,2]]),ids=flvIds(id);flvScan(ids,{on:'DL-3'});const st=flvWait(ids[0]);flvPlan([st]);
  tab='production';subtab='carriers';carrierWinOpen('DL-3');document.querySelector('[data-carrier-floor]').click();
  return {sub:subtab,win:carrierWin===null,blink:document.querySelector(`[data-floor-item="z-${st}"]`).getAttribute('class').includes('blink'),ring:document.querySelector('[data-floor-carrier="DL-3"]').getAttribute('class').includes('find'),card:flvText('[data-floor-find="DL-3"]').includes('Dolly · 2 glass')};
 }),{sub:'floor',win:true,blink:true,ring:true,card:true});

 eq('Overview «Shop now»: станция на плане — клик открывает Floor с её карточкой; без плана — её заказы, как прежде',await t.p.evaluate(()=>{
  flvReset();flvPlan();navGo('dashboard');document.querySelector('[data-board-station="POLISH"]').click();
  const floor=[tab,subtab,floorPick,!!document.querySelector('[data-floor-card="POLISH"]')];
  DB.floorItem=[];touch();navGo('dashboard');document.querySelector('[data-board-station="POLISH"]').click();
  return {floor,orders:[tab,subtab]};
 }),{floor:['production','floor','POLISH',true],orders:['production','orders']});

 eq('Edit: у станции со станками — поле Machine; смена станции снимает станок прежней',await t.p.evaluate(()=>{
  flvReset();DB.station.find(s=>s.code==='POLISH').machines=['P1','P2'];flvPlan();flvOpen();document.querySelector('[data-floor-edit]').click();
  floorEdit.sel=['m-POLISH'];render();const sel=document.getElementById('fl_machine');sel.value='P2';sel.dispatchEvent(new Event('change',{bubbles:true}));
  const set=floorEdit.items.find(r=>r.id==='m-POLISH').machine;
  const st=document.getElementById('fl_station');st.value='CUT';st.dispatchEvent(new Event('change',{bubbles:true}));
  const r=floorEdit.items.find(x=>x.id==='m-POLISH'),out={set,after:[r.station,r.machine],field:!!document.getElementById('fl_machine')};floorEdit=null;return out;
 }),{set:'P2',after:['CUT',''],field:false});

 eq('карточка за 7 / 30 дней — только эта станция за эти дни (repWorkSpan): те же строки, что год всех станций; выходные без работы — не строки; подписей под столбиками не больше восьми; панель своей прокруткой — страница не скачет',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,4]]),ids=flvIds(id);flvScan(ids);flvScan(ids.slice(0,2));flvPlan();const today=repDay(new Date().toISOString());
  const same=['CUT','ARRIS',flvWait(ids[0])].every(st=>['7','30'].every(p=>{const r=floorPeriodRange(p,today);repWorkSpanCache={key:'',rows:null};const keep=repWorkCache;repWorkCache={stamp:'',rows:null};
   const a=JSON.stringify(repWorkSpan(st,r.from,r.to));repWorkCache=keep;return a===JSON.stringify(repWorkFacts().filter(f=>f.station===st&&f.day>=r.from&&f.day<=r.to));}));
  const c=floorCard('CUT','30',today),weekendRows=c.byDay.filter(d=>{const w=new Date(d.day+'T12:00:00').getDay();return (w===0||w===6)&&!d.done&&!d.broken&&!d.ncr;}).length;
  flvOpen();floorPickStation('CUT');floorSetPeriod('30');const labels=[...document.querySelectorAll('.fl-bars span')].filter(s=>s.textContent).length;
  const side=getComputedStyle(document.querySelector('[data-floor-side]')).overflowY;floorSetPeriod('today');
  return {same,weekendRows,labels:labels<=8,side};
 }),{same:true,weekendRows:0,labels:true,side:'auto'});

 /* Владелец, 21.11.2026: «карточка станций справа налазит на задний блок»;
    «даты блоки компактнее» — период одной строкой, ничего не вылезает. */
 await t.p.setViewportSize({width:1024,height:768});
 eq('раскладка на 1024: карта и панель с отступом, как вкладки (не у края карточки Production), низы вровень; период — одной строкой, без обрезки; в панели ничего не шире её',await t.p.evaluate(()=>{
  flvReset();const id=flvOrder([[36,24,4]]),ids=flvIds(id);flvScan(ids);flvPlan();flvOpen();floorPickStation('CUT');floorSetPeriod('30');
  const R=s=>document.querySelector(s).getBoundingClientRect(),card=R('.card.sales-list-card'),pill=R('.sl-quick-pill'),map=R('.fl-map'),side=R('[data-floor-side]'),el=document.querySelector('[data-floor-side]');
  const inset=Math.round(pill.left-card.left),per=[...document.querySelectorAll('[data-floor-period]')];
  const out={inset:inset>=16,left:Math.round(map.left-card.left)===inset,right:Math.round(card.right-side.right)===inset,bottom:Math.round(map.bottom)===Math.round(side.bottom),
   row:new Set(per.map(b=>Math.round(b.getBoundingClientRect().top))).size===1&&per.every(b=>b.scrollWidth<=b.clientWidth+1),wide:el.scrollWidth<=el.clientWidth+1};
  floorSetPeriod('today');return out;
 }),{inset:true,left:true,right:true,bottom:true,row:true,wide:true});
 await t.p.setViewportSize({width:1280,height:720});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
