/* Production → Floor, A1 (20.11.2026, docs/ЗАДАЧА_КАРТА_ЦЕХА.md): план цеха в
   метрах — таблица floorItem, нормализатор, Start from sketch, редактор с
   черновиком (Undo / Redo, прилипание, наложения), Save одной командой,
   цвет станции токеном, правка только с Master Data, второй ПК. */
module.exports=async function({page,eq,ok}){
 console.log('floor');const t=await page();
 await t.p.evaluate(()=>{
  window.flReset=function(){floorEdit=null;floorCam=null;floorDrag=null;floorPick='';DB.floorItem=[];DB.station.forEach(s=>{delete s.color;});touch();};
  window.flOpen=function(){tab='production';subtab='floor';render();};
  window.flText=function(sel){const el=document.querySelector(sel);return el?el.innerText.replace(/\s+/g,' ').trim():'';};
  window.flPick=function(label){const r=floorEdit.items.find(x=>x.label===label);floorEdit.sel=[r.id];render();return r;};
  window.flSet=function(k,v){const el=document.getElementById('fl_'+k);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));};
 });

 eq('нормализатор: метры с двумя знаками, плохие числа — безопасные, размер не меньше 0.1, один зал, повторный id отброшен',await t.p.evaluate(()=>{
  flReset();
  DB.floorItem=[{id:'a',kind:'machine',station:'polish',x:'1.234',y:'x',w:0,l:-5,h:'abc'},{id:'h1',kind:'hall',x:9,y:9,w:65,l:70},{id:'h2',kind:'hall',w:10,l:10},{id:'a',kind:'wall'},{id:'z',kind:'zone',station:'HEAT',x:70,y:-8,w:6,l:4,h:3},{kind:'object'},'junk'];
  normalizeFloor();const r=DB.floorItem;
  return {ids:r.map(x=>x.id).join(),m:[r[0].station,r[0].x,r[0].y,r[0].w,r[0].l,r[0].h],hall:[r[1].x,r[1].y],zone:[r[2].x,r[2].y,r[2].h]};
 }),{ids:'a,h1,z',m:['POLISH',1.23,0,0.1,0.1,1.2],hall:[0,0],zone:[70,-8,0]});

 eq('длина: 6.5, 650 cm, 6500 mm, 6,5 m — одно и то же; мусор — NaN',await t.p.evaluate(()=>['6.5','650 cm','6500 mm','6,5 m',' 7 '].map(floorParseLen).concat(isNaN(floorParseLen('six'))))
  ,[6.5,6.5,6.5,6.5,7,true]);

 eq('пустая таблица на старте: Floor предлагает Start from sketch; без Master Data — «not set up yet» и ни одной кнопки',await t.p.evaluate(()=>{
  flReset();flOpen();const can=!!document.querySelector('[data-floor-sketch]')&&!!document.querySelector('[data-floor-blank]');
  const tabs=[...document.querySelectorAll('[aria-label="Production"] button')].map(b=>b.textContent).join('|');
  const was=window.accessCan;window.accessCan=k=>k!=='masterdata';render();
  const text=flText('[data-floor-empty]'),buttons=document.querySelectorAll('[data-floor-empty] button').length;
  window.accessCan=was;render();
  return {tabs,can,text,buttons,stored:DB.floorItem.length};
 }),{tabs:'In production|Stations|Terminals|Dollies & Skids|Floor',can:true,text:'Floor plan is not set up yet',buttons:0,stored:0});

 eq('Start from sketch: зал 65 × 70, две стены, блоки наброска без станций; Cancel — без записи; Save — одна команда',await t.p.evaluate(()=>{
  flReset();flOpen();document.querySelector('[data-floor-sketch]').click();
  const items=floorEdit.items,hall=items.find(r=>r.kind==='hall'),unsaved=storageFormsUnsaved();
  const was=window.confirm;window.confirm=()=>true;document.querySelector('[data-floor-cancel]').click();window.confirm=was;
  const afterCancel=DB.floorItem.length;
  document.querySelector('[data-floor-sketch]').click();
  let cmds=0;const sc=window.storageCommand;window.storageCommand=function(){cmds++;return sc.apply(this,arguments);};
  document.querySelector('[data-floor-save]').click();window.storageCommand=sc;
  return {hall:[hall.w,hall.l],walls:items.filter(r=>r.kind==='wall').length,blocks:items.filter(r=>r.kind==='machine').length,named:items.filter(r=>r.station).length,
   unsaved,afterCancel,cmds,stored:DB.floorItem.length,edit:floorEdit===null,view:!!document.querySelector('[data-floor-edit]')};
 }),{hall:[65,70],walls:2,blocks:21,named:0,unsaved:true,afterCancel:0,cmds:1,stored:24,edit:true,view:true});

 eq('второй ПК уже завёл план — Save наброска: «Plan already exists on another PC», второго плана нет, черновик цел',await t.p.evaluate(()=>{
  flReset();flOpen();document.querySelector('[data-floor-sketch]').click();
  /* План другого ПК пришёл синхронизацией — он уже в базе. */
  DB.floorItem=[floorClean({id:'other-pc-hall',kind:'hall',w:50,l:40})];touch();
  document.querySelector('[data-floor-save]').click();
  const r={err:flText('[data-floor-error]'),stored:DB.floorItem.map(x=>x.id).join(),draft:!!floorEdit&&floorEdit.items.length};
  floorEdit=null;return r;
 }),{err:'Plan already exists on another PC.',stored:'other-pc-hall',draft:24});

 eq('инспектор: станция, точный размер 650 cm → 6.50 m, плохой размер — подсказка без правки; Undo / Redo черновика; Save; F5 — на месте',await t.p.evaluate(async()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  flPick('7');flSet('station','POLISH');flSet('l','650 cm');
  const r=floorEdit.items.find(x=>x.label==='7'),dims=[...document.querySelectorAll('.fl-dimt')].map(x=>x.textContent);
  flSet('w','wide');const err=flText('[data-floor-error]'),w=r.w;
  floorUndo();const undone=floorEdit.items.find(x=>x.label==='7').l;floorRedo();const redone=floorEdit.items.find(x=>x.label==='7').l;
  document.querySelector('[data-floor-save]').click();
  const saved=DB.floorItem.find(x=>x.label==='7');
  return {st:saved.station,l:saved.l,w,err,dims:dims.slice(0,2),undone,redone,stored:testStoredState().floorItem.find(x=>x.label==='7').l};
 }),{st:'POLISH',l:6.5,w:2,err:'Size: a number in m, cm or mm — 6.5, 650 cm, 6500 mm',dims:['2.00 m','6.50 m'],undone:6,redone:6.5,stored:6.5});

 eq('Rotate 90° меняет ширину и длину вокруг центра; Duplicate — рядом; Delete и Ctrl+Z возвращает; стрелки — 0.1 и Shift 1 м',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  const r=flPick('3');document.querySelector('[data-floor-rotate]').click();const rot=[r.x,r.y,r.w,r.l];
  document.querySelector('[data-floor-dup]').click();const dup=floorSel()[0],copy=[dup.x-r.x,dup.y-r.y,dup.label];
  const n=floorEdit.items.length;document.querySelector('[data-floor-delete]').click();const del=floorEdit.items.length;
  const c=document.querySelector('[data-floor-canvas]');c.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));const back=floorEdit.items.length;
  flPick('3');const x0=r.x;document.querySelector('[data-floor-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  document.querySelector('[data-floor-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true}));
  const moved=floorEdit.items.find(x=>x.id===r.id);
  const out={rot,copy,del:n-del,back:back===n,step:[floorRound(moved.x-x0),floorRound(moved.y-rot[1])]};floorEdit=null;return out;
 }),{rot:[23.05,-3.05,2.1,12],copy:[1,1,'3'],del:1,back:true,step:[0.1,1]});

 eq('перетаскивание: шаг 0.1 м и прилипание к краю соседа ближе 0.5 м с направляющей; рамка выбирает несколько; Shift+клик добавляет',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  const a=floorEdit.items.find(x=>x.label==='7'),b=floorEdit.items.find(x=>x.label==='8');
  floorEdit.sel=[a.id];floorDrag={mode:'move',at:{x:0,y:0},ids:[a.id],orig:[{id:a.id,x:a.x,y:a.y}],pushed:false,moved:false};
  /* 7 на 23.0 шириной 2: сдвиг 3.7 — правый край 28.7 липнет к 8 на 29.1; верх 20.2 уже вровень с 8 — вторая направляющая. */
  const s=floorSnapDelta([a.id],3.7,0);floorDrag=null;
  const guides=s.guides.length,dx=floorRound(s.dx);
  /* Рамка вокруг 7, 8 и 9 — три блока; Shift+клик по 6 — четвёртый. */
  floorDrag={mode:'box',at:{x:22,y:19},now:{x:32,y:36}};floorUp({});const box=floorSel().map(x=>x.label).sort().join();
  const six=floorEdit.items.find(x=>x.label==='6'),el=document.querySelector(`[data-floor-item="${six.id}"]`);
  floorDown({button:0,shiftKey:true,target:el,clientX:0,clientY:0,pointerId:1});const shift=floorSel().map(x=>x.label).sort().join();
  floorEdit=null;return {dx,guides,box,shift};
 }),{dx:4.1,guides:2,box:'7,8,9',shift:'6,7,8,9'});

 eq('наложение и станок за залом — жёлтая полоса, Save не блокирует; зона ожидания за залом — не наложение; зона одна на станцию',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  const r=flPick('8');flSet('station','POLISH');flSet('x','23.5');const over=flText('[data-floor-overlaps]');
  flSet('x','29.1');
  floorEdit.adding='zone';floorDrag={mode:'draw',at:{x:40,y:-9},now:{x:52,y:-4}};floorUp({});
  const z=floorSel()[0];flSet('station','SHIP');const zoneOver=!!document.querySelector('[data-floor-overlaps]');
  floorEdit.adding='zone';floorDrag={mode:'draw',at:{x:20,y:-9},now:{x:30,y:-4}};floorUp({});
  const opts=[...document.querySelectorAll('#fl_station option')].map(o=>o.textContent).includes('SHIP');
  floorEdit.items.find(x=>x.id===r.id).x=23.5;render();
  document.querySelector('[data-floor-save]').click();
  return {over,zone:[z.kind,z.x,z.y,z.w,z.l],zoneOver,opts,saved:floorEdit===null&&DB.floorItem.filter(x=>x.kind==='zone').length};
 }),{over:'Overlaps Block 7 · POLISH',zone:['zone',40,-9,12,5],zoneOver:false,opts:false,saved:2});

 eq('цвет станции: Save пишет токен в DB.station.color, блоки и зона станции — этим цветом; без своего цвета — по порядку станции',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  flPick('7');flSet('station','POLISH');document.querySelector('[data-floor-color="series-16"]').click();
  const before=DB.station.find(s=>s.code==='POLISH').color;document.querySelector('[data-floor-save]').click();
  const st=DB.station.find(s=>s.code==='POLISH'),block=document.querySelector(`[data-floor-item="${DB.floorItem.find(x=>x.label==='7').id}"]`);
  const cut=floorStationColor('CUT'),i=DB.station.findIndex(s=>s.code==='CUT');
  const imported=prepareImportedState(storageExportEnvelope());
  return {before:before===undefined,color:st.color,style:block.getAttribute('style'),cut:cut==='series-'+(i%24+1),kept:imported.station.find(s=>s.code==='POLISH').color,bad:(()=>{st.color='#ff0000';normalizeShopFloor();return 'color' in DB.station.find(s=>s.code==='POLISH');})()};
 }),{before:true,color:'series-16',style:'--fc:var(--series-16)',cut:true,kept:'series-16',bad:false});

 eq('Export / Import сохраняют план; переименование станции в Master Data правит блоки плана; чужой код — «Unknown station»',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();DB.floorItem.find(x=>x.label==='7').station='POLISH';touch();
  const imported=prepareImportedState(storageExportEnvelope()),same=JSON.stringify(imported.floorItem)===JSON.stringify(DB.floorItem);
  const keep=JSON.parse(JSON.stringify(DB.station));
  tab='masterdata';mdSetTab('stations');stEditOpen(DB.station.findIndex(s=>s.code==='POLISH'));
  document.getElementById('sf_code').value='POL';saveSfStation();
  const renamed=DB.floorItem.find(x=>x.label==='7').station;
  DB.floorItem.find(x=>x.label==='8').station='GHOST';flOpen();
  /* Подпись не влезает в маленький блок — тогда видна жёлтая заливка и подсказка. */
  const gb=document.querySelector(`[data-floor-item="${DB.floorItem.find(x=>x.label==='8').id}"]`),ghost=gb.getAttribute('class').includes('fl-unknown')&&gb.querySelector('title').textContent==='Unknown station GHOST';
  tab='masterdata';mdSetTab('stations');stEditOpen(DB.station.findIndex(s=>s.code==='POL'));document.getElementById('sf_code').value='POLISH';saveSfStation();
  return {same,renamed,ghost,back:DB.floorItem.find(x=>x.label==='7').station,stations:JSON.stringify(DB.station.map(s=>s.code))===JSON.stringify(keep.map(s=>s.code))};
 }),{same:true,renamed:'POL',ghost:true,back:'POLISH',stations:true});

 eq('фоновая перерисовка (синхронизация) не сбрасывает черновик; без Master Data кнопки Edit нет',await t.p.evaluate(()=>{
  flReset();DB.floorItem=floorSketchItems();flOpen();document.querySelector('[data-floor-edit]').click();
  flPick('7');flSet('w','3');render();render();
  const kept=floorEdit&&floorEdit.items.find(x=>x.label==='7').w,editing=!!document.querySelector('[data-floor-editing]');
  floorEdit=null;const was=window.accessCan;window.accessCan=k=>k!=='masterdata';render();
  const edit=!!document.querySelector('[data-floor-edit]');window.accessCan=was;render();
  return {kept,editing,edit};
 }),{kept:3,editing:true,edit:false});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
