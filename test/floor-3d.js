/* Production → Floor, A3 (20.11.2026, docs/ЗАДАЧА_КАРТА_ЦЕХА.md): 3D — проекция
   с поворотом и наклоном, видимые грани по углу камеры, порядок по глубине,
   длинные блоки модулями до 6 м, стены срезом 1.3 м, подписи скрыты на время
   поворота, Top · Iso, Fit, двойной клик — приблизить станцию, клавиши 2 / 3. */
module.exports=async function({page,eq,ok}){
 console.log('floor-3d');const t=await page();
 await t.p.evaluate(()=>{
  window.f3Reset=function(){floorEdit=null;floorCam=null;floorDrag=null;floorPick='';floorFind='';floorFilter='';floor3d=false;floorYaw=-35;floorPitch=55;floorLiveMemo={key:'',data:null};
   DB.floorItem=[floorClean({id:'h',kind:'hall',w:40,l:30}),floorClean({id:'heat',kind:'machine',station:'HEAT',x:30,y:1,w:2,l:40,h:1.2}),floorClean({id:'cut',kind:'machine',station:'CUT',x:5,y:5,w:4,l:6,h:1}),
    floorClean({id:'w',kind:'wall',x:0,y:20,w:40,l:0.2,h:3}),floorClean({id:'z',kind:'zone',station:'HEAT',x:33,y:2,w:5,l:4})];touch();
   tab='production';subtab='floor';render();};
  window.f3Polys=function(id){return [...document.querySelectorAll(`polygon[data-floor-item="${id}"]`)];};
 });

 eq('2D | 3D: 3D рисует грани, Top · Iso — только в 3D; клавиша 2 — обратно в 2D; Edit всегда рисует 2D',await t.p.evaluate(()=>{
  f3Reset();const top2d=!!document.querySelector('[data-floor-view]');
  document.querySelector('[data-floor-3d]').click();const polys=document.querySelectorAll('[data-floor-svg] polygon').length,views=[...document.querySelectorAll('[data-floor-view]')].map(b=>b.textContent).join();
  document.querySelector('[data-floor-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'2',bubbles:true}));const back=floor3d;
  document.querySelector('[data-floor-canvas]').dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));
  document.querySelector('[data-floor-edit]').click();const edit=document.querySelectorAll('[data-floor-svg] polygon').length,toggle=!!document.querySelector('[data-floor-3d]');floorEdit=null;render();
  return {top2d,polys:polys>10,views,back,edit,toggle,still:floor3d};
 }),{top2d:false,polys:true,views:'Top,Iso',back:false,edit:0,toggle:false,still:true});

 eq('проекция: вид Top (поворот 0, наклон 0) — крыша блока совпадает с планом, высота не сдвигает; Iso — сдвигает',await t.p.evaluate(()=>{
  f3Reset();floor3dView('top');const c=floor3dCenter(),a=floor3dProject(5,5,0,c),b=floor3dProject(5,5,3,c);
  floor3dView('iso');const d=floor3dProject(5,5,0,floor3dCenter()),e=floor3dProject(5,5,3,floor3dCenter());
  return {top:[+a.x.toFixed(6),+a.y.toFixed(6),+b.y.toFixed(6)],iso:e.y<d.y};
 }),{top:[5,5,5],iso:true});

 eq('видимые бока — по углу камеры: прямо (поворот 0) — только передний бок; при −35° — передний и левый; сверху (наклон 0) — без боков',await t.p.evaluate(()=>{
  f3Reset();floor3d=true;floorYaw=0;floorPitch=55;render();const s0=f3Polys('cut').map(p=>p.getAttribute('class').match(/sx|sy|fl-top/)[0]).sort().join();
  floorYaw=-35;render();const s1=f3Polys('cut').map(p=>p.getAttribute('class').match(/sx|sy|fl-top/)[0]).sort().join();
  floorPitch=0;render();const s2=f3Polys('cut').length;
  return {s0,s1,s2};
 }),{s0:'fl-top,sy',s1:'fl-top,sx,sy',s2:1});

 eq('длинная печь — модули до 6 м (40 м → 7 крыш); стена 3 м в 3D — срез 1.3 м; дальний модуль рисуется раньше ближнего',await t.p.evaluate(()=>{
  f3Reset();const boxes=floor3dBoxes(DB.floorItem),heat=boxes.filter(b=>b.item.id==='heat'),wall=boxes.find(b=>b.item.id==='w');
  floor3d=true;floorYaw=0;floorPitch=55;render();
  const tops=f3Polys('heat').filter(p=>p.getAttribute('class').includes('fl-top')).map(p=>Math.max(...p.getAttribute('points').split(' ').map(x=>+x.split(',')[1])));
  return {modules:heat.length,max:Math.max(...heat.map(b=>b.l))<=6,wall:wall.h,order:tops.every((y,i)=>!i||y>=tops[i-1])};
 }),{modules:7,max:true,wall:1.3,order:true});

 eq('поворот мышью: вправо — вокруг вертикали, вниз — наклон (не больше 75°); подписи скрыты, пока крутят; клик без движения — выбор станции',await t.p.evaluate(()=>{
  f3Reset();floor3dToggle(true);const svg=document.querySelector('[data-floor-svg]'),el=f3Polys('cut').find(p=>p.getAttribute('class').includes('fl-top'));
  floorDown({button:0,target:svg,clientX:100,clientY:100,pointerId:1});floorMove({clientX:200,clientY:400});
  const during=[floorDrag.mode,Math.round(floorYaw),floorPitch];floorRedraw();const labels=document.querySelectorAll('.fl-label').length;
  floorUp({});const after=document.querySelectorAll('.fl-label').length>0;
  floorDown({button:0,target:el,clientX:10,clientY:10,pointerId:1});floorUp({});
  return {during,labels,after,pick:floorPick};
 }),{during:['orbit',5,75],labels:0,after:true,pick:'CUT'});

 eq('двойной клик по станции — приблизить её: видимая область вокруг станции, станция выбрана; Fit — весь план',await t.p.evaluate(()=>{
  f3Reset();floor3dToggle(true);const all=floor3dBounds(),el=f3Polys('cut').find(p=>p.getAttribute('class').includes('fl-top'));
  floorDbl({target:el});const cam=floorCam,pick=floorPick,c=floor3dCenter(),p=floor3dProject(7,8,0.5,c);
  document.querySelector('[title="Fit (F)"]').click();
  return {smaller:cam.w<all.w,inside:p.x>cam.x&&p.x<cam.x+cam.w&&p.y>cam.y&&p.y<cam.y+cam.h,pick,fit:floorCam===null};
 }),{smaller:true,inside:true,pick:'CUT',fit:true});

 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
