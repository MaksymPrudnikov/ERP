/* Конструктор отчётов (view/reports, reports/model). Владелец, 9 октября
   2026: «не хуже Looker», каталог отчётов, «создавать по своему логическому
   порядку», тип графика меняется, «не вываливать всё сразу», печать. */
module.exports=async function({page,eq,ok}){
 console.log('report-builder');const t=await page(undefined,{width:1500,height:950});
 await require('./optimization-fixture')(t.p);
 await require('./report-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.rpScans=function(){
   oqReset();const c=oqCustomer({legalName:'North Shore Windows'}),andrei=rbUser('Andrei','1111'),vasyl=rbUser('Vasyl','2222');
   const a=rbOrder(c,'6CLEAR','double',[[37,71,1]]),b=rbOrder(c,'12CLEAR','single',[[30,40,2]]);rbBatch([a,b]);
   rbIds(a).forEach(p=>{rbGo('CUT',p,andrei);rbGo('ARRIS',p,andrei);});rbIds(b).forEach(p=>{rbGo('CUT',p,vasyl);rbGo('POLISH',p,vasyl);});
   try{localStorage.removeItem(REP_VIEW_KEY);}catch(e){}
  };
  window.rpOpenTab=function(){repOpenId='';repEditOn=false;repSelW='';repMenu=null;tab='reports';render();};
  window.rpWidgets=function(){return [...document.querySelectorAll('[data-rep-widget]')].map(x=>x.dataset.repType);};
 });

 eq('Reports — по галочке; сначала каталог, отчёт не открыт; стартовые отчёты по папкам',await t.p.evaluate(()=>{
  const old=window.accessCan;window.accessCan=k=>k!=='reports';tab='dashboard';render();const hidden=!document.querySelector('.side [title="Reports"]');window.accessCan=old;
  rpOpenTab();const folders=[...document.querySelectorAll('[data-rep-folder]')].map(x=>x.dataset.repFolder);
  return {inSections:USER_SECTIONS.includes('reports'),hidden,empty:!!document.querySelector('[data-rep-empty]'),widgets:rpWidgets().length,folders,starters:(DB.report||[]).filter(r=>/^RP-start-/.test(r.id)).length};
 }),{inSections:true,hidden:true,empty:true,widgets:0,folders:['All','People','Production','Quality','Sales','Shipping'],starters:16});

 eq('Отчёт «Glass cut · by month» открывается страницей Summary; на второй странице — свои графики; поиск по каталогу',await t.p.evaluate(()=>{
  rpScans();rpOpenTab();repQ='glass cut';render();const found=[...document.querySelectorAll('[data-rep-item]')].map(x=>x.querySelector('b').textContent);
  repQ='';document.querySelector('[data-rep-item="RP-start-cut"]').click();const p1=rpWidgets(),pages=[...document.querySelectorAll('[data-rep-page]')].map(x=>x.textContent);
  document.querySelectorAll('[data-rep-page]')[1].click();return {found,p1,pages,p2:rpWidgets()};
 }),{found:['Glass cut · by month'],p1:['number','columns','table'],pages:['Summary','By cutter'],p2:['table','columns']});

 eq('Edit: тип графика меняется одной кнопкой (как в Looker), настройки сохраняются в отчёте; Copy — своя копия только для себя',await t.p.evaluate(()=>{
  rpScans();rpOpenTab();repOpen('RP-start-edge');repEditToggle();const w=repFind('RP-start-edge').pages[0].widgets[0];repSelectWidget(w.id);
  document.querySelector('[data-rep-type-btn="columns"]').click();const saved=repFind('RP-start-edge').pages[0].widgets[0].type;
  document.querySelector('[data-rep-type-btn="pie"]').click();const pie=!!document.querySelector(`[data-rep-widget="${w.id}"] .ch-pie`);
  repEditToggle();repCopyOpen();const copy=repOpenReport();
  return {saved,pie,copy:{name:copy.name,share:copy.share,own:copy.id!=='RP-start-edge',editing:repEditOn,pages:copy.pages.length}};
 }),{saved:'columns',pie:true,copy:{name:'Edgework · by operation · copy',share:'me',own:true,editing:true,pages:1}});

 eq('Новый отчёт: источник Tempering по толщине, метрики стекло и ft²; свой фильтр; период графика свой или отчёта',await t.p.evaluate(()=>{
  rpScans();const ids=rbIds(DB.salesOrder[0].id),who={id:'u3',name:'Oleg'};ids.forEach(p=>rbGo('HEAT',p,who));
  rpOpenTab();repNew();const r=repOpenReport();
  repSetW('type','table');repSetSource('tempering');repSetDim(0,'mm');repSetMetric(0,'count');repAddMetric();repSetMetric(1,'area');
  const cells=()=>[...document.querySelectorAll(`[data-rep-widget="${repSelW}"] tbody tr`)].map(tr=>[...tr.children].map(td=>td.textContent.trim()).join('|'));
  const before=cells();repAddFilter();repSetFilter(0,'f','mm');repSetFilter(0,'op','notIn');repFilterAddVal(0,'6 mm');const filtered=cells();
  repDelFilter(0);repSetDateUse('lastYear');const lastYear=cells();repSetDateUse('report');
  return {name:r.name,before,filtered,lastYear,after:cells(),stored:repFind(r.id).pages[0].widgets[0].q.metrics};
 }),{name:'New report',before:['6 mm|2|36.5'],filtered:[],lastYear:[],after:['6 mm|2|36.5'],stored:['count','area']});

 eq('Фильтры отчёта: значение в Station действует на все графики с этим полем; нажатие на строку ставит фильтр; Reset снимает',await t.p.evaluate(()=>{
  rpScans();rpOpenTab();repOpen('RP-start-people');const num=()=>[...document.querySelectorAll('[data-rep-widget] tbody tr')].length;
  const before=num();repOpenCtl(null,'station');repCtlToggle('POLISH',true);repCtlApply();const ctl=document.querySelector('[data-rep-ctl="station"]').textContent.replace('▾','').trim();
  const rows=[...document.querySelectorAll('[data-rep-widget]')][1].querySelectorAll('tbody tr').length;
  repResetView();document.querySelector('[data-rep-widget] [data-rep-pick="person"]').click();const picked=repView('RP-start-people').f;
  repResetView();return {before,ctl,rows,picked:JSON.stringify(picked),after:num()};
 }),{before:4,ctl:'Station: POLISH',rows:1,picked:'{"person":["Andrei"]}',after:4});

 eq('Права: стартовый отчёт правит только администратор, остальным — Copy; свою копию человек правит',await t.p.evaluate(()=>{
  rpScans();const oldA=window.accessCan,oldU=window.signinUser;window.accessCan=k=>k!=='users';window.signinUser=()=>({viewProfileId:'U-anna',name:'Anna'});
  try{rpOpenTab();repOpen('RP-start-cut');const editBtn=!!document.querySelector('[data-rep-edit]'),can=repCanEdit(repFind('RP-start-cut'));
   repCopyOpen();const mine=repOpenReport();return {editBtn,can,copyOwner:mine.ownerId,canCopy:repCanEdit(mine),visibleToOthers:mine.share};}
  finally{window.accessCan=oldA;window.signinUser=oldU;}
 }),{editBtn:false,can:false,copyOwner:'U-anna',canCopy:true,visibleToOthers:'me'});

 eq('Export / Import JSON: отчёты уезжают с базой; битое поле report при импорте отклоняется',await t.p.evaluate(()=>{
  rpScans();rpOpenTab();repNew();repSetMeta('name','Owner · weekly');const json=JSON.parse(JSON.stringify(DB));
  let bad='';try{validateImportedState(Object.assign({},json,{report:{}}));}catch(e){bad=e.message;}
  DB.report=DB.report.filter(r=>r.name!=='Owner · weekly');normalizeReports();const gone=!DB.report.some(r=>r.name==='Owner · weekly');
  DB.report=json.report;normalizeReports();return {back:DB.report.some(r=>r.name==='Owner · weekly'),gone,bad,starters:DB.report.filter(r=>/^RP-start-/.test(r.id)).length};
 }),{back:true,gone:true,bad:'The "report" field must be an array.',starters:16});

 eq('Линия со сравнением — пунктир прошлого периода; печать — название, период, графики, без кнопок правки',await t.p.evaluate(()=>{
  rpScans();rpOpenTab();repOpen('RP-start-stations');const line=document.querySelector('[data-rep-type="line"]');
  const html=repPrintHTML();return {dashed:!!line.querySelector('.ch-dash'),legend:[...line.querySelectorAll('.ch-legend > span')].map(x=>x.textContent),
   print:{name:html.includes('Stations · glass by day'),period:/Date: This week/.test(html),charts:(html.match(/data-rep-widget=/g)||[]).length,tools:/rep-wtools/.test(html)}};
 }),{dashed:true,legend:['Glass','vs previous period'],print:{name:true,period:true,charts:4,tools:false}});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
