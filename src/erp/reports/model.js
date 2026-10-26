/* =====================================================================
   reports/model  ·  reports-2.0
   Отчёты конструктора: хранение, права, стартовые отчёты, команды.
   IN : DB.report, вошедший человек (erp/signin), REP_SRC
   OUT: DB.report — [{id, name, folder, ownerId, share, controls, date,
        filters, screens:{stations, people},
        pages:[{id, name, widgets:[{id, type, title, width, q, opts}]}]}]

   Владелец, 9 октября 2026: «модуль отчётов не хуже Looker Studio или
   Tableau», «а если я хочу 10 или 50 разных заготовленных отчётов для
   владельца?», «создавать отчёты по своему логическому порядку», «не должны
   сразу вываливаться блоком». Отчёт — страницы и графики в своём порядке;
   у графика свой источник, тип и настройки (reports/query).
   Кто правит: автор и администратор (Users); остальные смотрят и берут
   копию. Правка идёт в черновике и записывается кнопкой Save (владелец:
   «вижу Edit, Copy, Print, но не вижу сохранить»); Cancel — как было. share: 'all' — всем с Reports, 'me' — только автору, [id] — кому.
   Стартовые отчёты — обычные, их можно править и удалять.
   Экраны (владелец: «я собираю для каждого»): администратор ставит отчёту
   «Show on» — станции и люди; отчёт появляется вкладкой на Board этих
   станций и в Overview этих людей. Фильтры «This station» и «Me» в
   графиках подставляют станцию и вошедшего человека.
   ===================================================================== */
DEFAULT.report=[];
DEFAULT.reportSeed=0;
const REP_TYPES=[['number','Number'],['table','Table'],['bars','Bars'],['columns','Columns'],['line','Line'],['pie','Pie']];
const REP_SEED_VERSION=7;
/* Версия 7 (26.10.2026): стартовые Production — по подпапкам (каталог
   деревом, view/reports). У базы переезжают только те, чью папку не меняли. */
const REP_START_FOLDERS={cut:'Production / Cutting',sheets:'Production / Cutting',sheetcut:'Production / Cutting',offcuts:'Production / Cutting',
 polish:'Production / Edgework',edge:'Production / Edgework',drill:'Production / Drilling & CNC',temper:'Production / Tempering',igu:'Production / IGU & lamination',
 stations:'Production / Shop',shopnow:'Production / Shop',sizes:'Production / Shop'};
/* Короткий id: отчёт, страница, график. Чистка его не меняет (до 80 знаков). */
function repUid(p){return p+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();}
function repMe(){const u=typeof signinUser==='function'?signinUser():null;return u?u.viewProfileId:'';}
/* Администратор — галочка Users; без входа (пустая база, картинки) — открыто, как accessCan. */
function repIsAdmin(){return typeof accessCan==='function'&&accessCan(ACCESS_ADMIN);}
/* Ставить отчёты на экраны станций и людей — администратор или галочка
   Screens в Users (владелец, 11.10.2026: начальник производства, Shipping). */
function repCanScreens(){return repIsAdmin()||typeof accessCan==='function'&&typeof USER_SECTIONS!=='undefined'&&USER_SECTIONS.includes('screens')&&accessCan('screens');}
function repCanEdit(r){return !!r&&(repIsAdmin()||!!r.ownerId&&r.ownerId===repMe());}
function repVisible(r){const me=repMe();return !!r&&(repIsAdmin()||r.share==='all'||r.ownerId===me||Array.isArray(r.share)&&r.share.includes(me));}
function repFind(id){return (DB.report||[]).find(r=>r.id===id)||null;}

/* ------------------------------ Чистка ------------------------------- */
const repStr=(v,n)=>String(v==null?'':v).slice(0,n||200);
function repCleanQuery(q){
 q=q&&typeof q==='object'?q:{};const S=REP_SRC[q.source]?q.source:'glass';
 const arr=(v,n)=>(Array.isArray(v)?v:[]).map(x=>repStr(x,120)).filter(Boolean).slice(0,n);
 const d=q.date&&typeof q.date==='object'?q.date:{};
 return {source:S,date:{f:repStr(d.f,40),use:d.use==='own'?'own':'report',preset:REP_PRESETS.some(p=>p[0]===d.preset)?d.preset:'',from:/^\d{4}-\d{2}-\d{2}$/.test(d.from||'')?d.from:'',to:/^\d{4}-\d{2}-\d{2}$/.test(d.to||'')?d.to:''},
  filters:(Array.isArray(q.filters)?q.filters:[]).filter(f=>f&&typeof f==='object'&&f.f).slice(0,20).map(f=>({f:repStr(f.f,40),op:repStr(f.op,20)||'in',v:(Array.isArray(f.v)?f.v:[f.v]).map(x=>repStr(x,120)).slice(0,200)})),
  dims:arr(q.dims,2),metrics:arr(q.metrics,8),sort:q.sort&&typeof q.sort==='object'?{by:q.sort.by==='label'?'label':'metric',i:Math.max(0,Math.min(7,Math.floor(+q.sort.i||0))),dir:q.sort.dir==='asc'?'asc':'desc'}:null,
  limit:Math.max(0,Math.min(500,Math.floor(+q.limit||0))),other:q.other===true,compare:['prev','year'].includes(q.compare)?q.compare:''};
}
function repCleanWidget(w){
 w=w&&typeof w==='object'?w:{};
 return {id:repStr(w.id,80)||repUid('W'),type:REP_TYPES.some(t=>t[0]===w.type)?w.type:'table',title:repStr(w.title,120),width:w.width==='half'?'half':'full',
  q:repCleanQuery(w.q),opts:{totals:!(w.opts&&w.opts.totals===false),labels:!!(w.opts&&w.opts.labels)}};
}
function repClean(r){
 r=r&&typeof r==='object'?r:{};
 const pages=(Array.isArray(r.pages)?r.pages:[]).filter(p=>p&&typeof p==='object').slice(0,20).map(p=>({id:repStr(p.id,80)||repUid('PG'),name:repStr(p.name,60)||'Page',widgets:(Array.isArray(p.widgets)?p.widgets:[]).slice(0,40).map(repCleanWidget)}));
 const d=r.date&&typeof r.date==='object'?r.date:{},fl=r.filters&&typeof r.filters==='object'&&!Array.isArray(r.filters)?r.filters:{},filters={};
 Object.keys(fl).slice(0,20).forEach(k=>{if(Array.isArray(fl[k])&&fl[k].length)filters[repStr(k,40)]=fl[k].map(x=>repStr(x,120)).slice(0,200);});
 return {id:repStr(r.id,80)||repUid('RP'),name:repStr(r.name,120)||'Untitled report',folder:repStr(r.folder,60),note:repStr(r.note,500),ownerId:repStr(r.ownerId,80),
  share:r.share==='all'||r.share==='me'?r.share:Array.isArray(r.share)?r.share.map(x=>repStr(x,80)).slice(0,200):'me',
  controls:(Array.isArray(r.controls)?r.controls:[]).map(x=>repStr(x,40)).filter(Boolean).slice(0,10),
  date:{preset:REP_PRESETS.some(p=>p[0]===d.preset)?d.preset:'thisMonth',from:/^\d{4}-\d{2}-\d{2}$/.test(d.from||'')?d.from:'',to:/^\d{4}-\d{2}-\d{2}$/.test(d.to||'')?d.to:''},filters,
  screens:{stations:(r.screens&&Array.isArray(r.screens.stations)?r.screens.stations:[]).map(x=>repStr(x,40)).filter(Boolean).slice(0,100),people:(r.screens&&Array.isArray(r.screens.people)?r.screens.people:[]).map(x=>repStr(x,80)).filter(Boolean).slice(0,200)},
  pages:pages.length?pages:[{id:repUid('PG'),name:'Page 1',widgets:[]}],createdAt:repStr(r.createdAt,40),updatedAt:repStr(r.updatedAt,40)};
}
function normalizeReports(){
 if(!Array.isArray(DB.report))DB.report=[];
 const seen=new Set();DB.report=DB.report.filter(r=>r&&typeof r==='object').map(repClean).filter(r=>!seen.has(r.id)&&(seen.add(r.id),true));
 /* Стартовые отчёты добавляются по версиям: база получает только новые
    для себя — удалённый владельцем стартовый не возвращается. */
 const seed=+DB.reportSeed||0;
 if(seed<REP_SEED_VERSION){
  REP_STARTERS().filter(r=>(r.seed||1)>seed).forEach(r=>{if(!DB.report.some(x=>x.id===r.id))DB.report.push(repClean(r));});
  /* Версия 4: «Sales · my customers» считал заказы по сроку — заказ без Due
     date не попадал ни в один период. Теперь по дате заказа; правим только
     графики, которые ещё как в стартовом. */
  if(seed>=1&&seed<7)Object.entries(REP_START_FOLDERS).forEach(([k,f])=>{const x=DB.report.find(r=>r.id==='RP-start-'+k);if(x&&x.folder==='Production')x.folder=f;});
  if(seed>=3&&seed<4){const x=DB.report.find(r=>r.id==='RP-start-mycustomers');if(x)x.pages.forEach(p=>p.widgets.forEach(w=>{if(w.q.source==='orders'&&w.q.date.f==='due'&&w.q.date.use!=='own')w.q.date.f='created';}));}
  DB.reportSeed=REP_SEED_VERSION;
 }
}
function validateReportsPayload(src){
 if(src.report!=null&&!Array.isArray(src.report))throw new Error('The "report" field must be an array.');
 (src.report||[]).forEach(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw new Error('Reports: every report must be an object.');});
}

/* --------------------------- Стартовые ------------------------------- */
/* Образцы по участкам — первые отчёты каталога. w(тип, источник, …). */
function repW(type,source,o){o=o||{};return {type,title:o.title||'',width:o.width||'full',q:{source,date:o.date||{},dims:o.dims||[],metrics:o.metrics||[],filters:o.filters||[],sort:o.sort||null,limit:o.limit||0,other:!!o.other,compare:o.compare||''},opts:o.opts||{}};}
function REP_STARTERS(){
 const R=(id,name,folder,date,controls,pages,seed)=>({id:'RP-start-'+id,name,folder:REP_START_FOLDERS[id]||folder,ownerId:'',share:'all',seed:seed||1,date:{preset:date},controls,pages:pages.map((p,i)=>({id:'PG-start-'+id+'-'+i,name:p[0],widgets:p[1].map((w,j)=>Object.assign({id:'W-start-'+id+'-'+i+'-'+j},w))}))});
 return [
  R('cut','Glass cut · by month','Production','thisYear',['glass','mm','person'],[
   ['Summary',[repW('number','cutting',{metrics:['count','area','batches'],compare:'year'}),repW('columns','cutting',{title:'Glass cut by month · thickness',dims:['at:month','mm'],metrics:['count']}),
    repW('table','cutting',{title:'By glass and thickness',dims:['glass','mm'],metrics:['count']})]],
   ['By cutter',[repW('table','cutting',{title:'By cutter',dims:['person'],metrics:['count','area','batches']}),repW('columns','cutting',{title:'By week · cutter',dims:['at:week','person'],metrics:['count']})]]]),
  R('polish','Polishing · linear in by person','Production','thisMonth',['person','mm'],[
   ['Summary',[repW('number','edgework',{metrics:['inches','glass','usd'],filters:[{f:'op',op:'in',v:['Flat Polish']}]}),
    repW('table','edgework',{title:'Linear in by person and thickness',dims:['person','mm'],metrics:['inches'],filters:[{f:'op',op:'in',v:['Flat Polish']}]}),
    repW('columns','edgework',{title:'By day · person',dims:['at:day','person'],metrics:['inches'],filters:[{f:'op',op:'in',v:['Flat Polish']}]})]]]),
  R('edge','Edgework · by operation','Production','thisMonth',['station','person','mm'],[
   ['Summary',[repW('bars','edgework',{title:'Linear in by operation',dims:['op'],metrics:['inches'],width:'half'}),repW('pie','edgework',{title:'Share by thickness',dims:['mm'],metrics:['inches'],width:'half'}),
    repW('table','edgework',{title:'Operation × thickness',dims:['op','mm'],metrics:['inches']}),repW('table','edgework',{title:'By person',dims:['person'],metrics:['inches','glass','usd']})]]]),
  R('temper','Tempering · ft² by thickness','Production','thisWeek',['mm','glass'],[
   ['Summary',[repW('number','tempering',{metrics:['count','area'],compare:'prev'}),repW('bars','tempering',{title:'ft² by thickness',dims:['mm'],metrics:['area'],width:'half'}),
    repW('columns','tempering',{title:'Glass by day',dims:['at:day'],metrics:['count'],width:'half'}),repW('table','tempering',{title:'Glass × thickness',dims:['glass','mm'],metrics:['count']})]]]),
  R('igu','IGU & lamination · units','Production','thisWeek',['person','unitType'],[
   ['Summary',[repW('number','assembly',{metrics:['units','count']}),repW('columns','assembly',{title:'Units by day · person',dims:['at:day','person'],metrics:['units']}),
    repW('table','assembly',{title:'By unit type',dims:['unitType'],metrics:['units','area']})]]]),
  R('drill','Drilling & CNC · pieces','Production','thisMonth',['station','person'],[
   ['Summary',[repW('bars','drilling',{title:'Pieces by operation',dims:['op'],metrics:['pcs']}),repW('table','drilling',{title:'Person × operation',dims:['person','op'],metrics:['pcs']})]]]),
  R('stations','Stations · glass by day','Production','thisWeek',['station','person'],[
   ['Summary',[repW('bars','glass',{title:'Glass by station',dims:['station'],metrics:['count'],width:'half'}),repW('line','glass',{title:'Glass by day',dims:['at:day'],metrics:['count'],width:'half',compare:'prev'}),
    repW('table','glass',{title:'Station × day',dims:['station','at:day'],metrics:['count']}),repW('columns','glass',{title:'Glass by hour',dims:['at:hour'],metrics:['count']})]]]),
  R('sheets','Sheets · waste by glass','Production','thisMonth',['glass','mm'],[
   ['Summary',[repW('number','sheets',{metrics:['sheets','area','waste','yield']}),repW('bars','sheets',{title:'Used % by glass',dims:['glass'],metrics:['yield']}),
    repW('table','sheets',{title:'Sheet size × glass',dims:['size','glass'],metrics:['sheets']})]]]),
  R('people','People · output by station','People','thisWeek',['station','person'],[
   ['Summary',[repW('table','glass',{title:'Glass by person and station',dims:['person','station'],metrics:['count']}),repW('table','glass',{title:'By person',dims:['person'],metrics:['count','area','units','usd']})]],
   ['Edgework',[repW('table','edgework',{title:'Linear in · person × operation',dims:['person','op'],metrics:['inches']}),repW('table','edgework',{title:'$ by price list · person × thickness',dims:['person','mm'],metrics:['usd']})]]]),
  R('time','People · time at stations','People','thisWeek',['person','station'],[
   ['Summary',[repW('table','time',{title:'By person',dims:['person'],metrics:['hours','glassN','perHour','count']}),repW('columns','time',{title:'Hours by day · person',dims:['at:day','person'],metrics:['hours']})]]]),
  R('handout','Shipping · handed out by person','Shipping','thisWeek',['person','customer'],[
   ['Summary',[repW('number','shipping',{metrics:['units','count','orders']}),repW('table','shipping',{title:'By person',dims:['person'],metrics:['units','count','area']}),
    repW('columns','shipping',{title:'Units by day · person',dims:['at:day','person'],metrics:['units']})]]]),
  R('trips','Deliveries · trips by truck','Shipping','thisMonth',['truck','driver','method'],[
   ['Summary',[repW('number','deliveries',{metrics:['trips','count','units','skids']}),repW('table','deliveries',{title:'By truck',dims:['truck'],metrics:['trips','count','units','kg']}),
    repW('columns','deliveries',{title:'Trips by week',dims:['at:week'],metrics:['trips']})]]]),
  R('due','Due dates · on time','Sales','thisMonth',['customer','priority'],[
   ['Summary',[repW('number','orders',{date:{f:'due'},metrics:['count','late','onTime']}),repW('columns','orders',{title:'Orders by due week',date:{f:'due'},dims:['due:week','state'],metrics:['count']}),
    repW('table','orders',{title:'By customer',date:{f:'due'},dims:['customer'],metrics:['count','late','onTime','units','area']})]]]),
  R('ordered','Ordered glass · by thickness','Sales','thisMonth',['customer','glass'],[
   ['Summary',[repW('bars','ordered',{title:'ft² by thickness',date:{f:'created'},dims:['mm'],metrics:['area'],width:'half'}),repW('pie','ordered',{title:'Units by type',date:{f:'created'},dims:['unitType'],metrics:['units'],width:'half'}),
    repW('table','ordered',{title:'Glass × thickness',date:{f:'created'},dims:['glass','mm'],metrics:['glassN']})]]]),
  R('lead','Lead time by customer','Sales','lastQuarter',['customer'],[
   ['Summary',[repW('table','orders',{title:'Lead time, days',date:{f:'shipped'},dims:['customer'],metrics:['lead:avg','lead:max','count']})]]]),
  R('recuts','Recuts · by reason','Quality','last30',['station','reason','person'],[
   ['Summary',[repW('number','breaks',{metrics:['glassN','area','usd']}),repW('bars','breaks',{title:'By reason',dims:['reason'],metrics:['glassN'],width:'half'}),
    repW('bars','breaks',{title:'By station',dims:['station'],metrics:['glassN'],width:'half'}),repW('columns','breaks',{title:'By week · kind',dims:['at:week','kind'],metrics:['glassN']})]]]),
  /* Версия 2 (10 октября 2026): квоты, оплаты, долги, остатки, размеры. */
  R('quotes','Quotes · win rate by rep','Sales','thisQuarter',['rep','customer'],[
   ['Summary',[repW('number','quotes',{date:{f:'created'},metrics:['count','won','winRate','wonValue']}),repW('table','quotes',{title:'By sales rep',date:{f:'created'},dims:['rep'],metrics:['count','won','winRate','value','wonValue']}),
    repW('columns','quotes',{title:'Quotes by month · status',date:{f:'created'},dims:['created:month','state'],metrics:['count']})]]],2),
  R('payments','Payments · by month','Finance','thisYear',['customer','method'],[
   ['Summary',[repW('number','payments',{metrics:['amount','count','onAccount'],compare:'year'}),repW('columns','payments',{title:'Received by month',dims:['at:month'],metrics:['amount']}),
    repW('pie','payments',{title:'By method',dims:['method'],metrics:['amount'],width:'half'}),repW('table','payments',{title:'Top customers',dims:['customer'],metrics:['amount','count'],limit:10,other:true,width:'half'})]]],2),
  R('balances','Balances · overdue by customer','Finance','all',['customer','terms'],[
   ['Summary',[repW('number','balances',{date:{f:'due'},metrics:['balance','overdue','overdueN']}),repW('table','balances',{title:'By customer',date:{f:'due'},dims:['customer'],metrics:['balance','overdue','overdueN','daysOverdue:max']}),
    repW('bars','balances',{title:'Balance by status',date:{f:'due'},dims:['status'],metrics:['balance']})]]],2),
  R('offcuts','Offcuts · stock by glass','Production','all',['glass','mm'],[
   ['Summary',[repW('number','offcuts',{metrics:['count','area'],filters:[{f:'status',op:'in',v:['In stock']}]}),repW('table','offcuts',{title:'Glass × status',dims:['glass','status'],metrics:['count']})]]],2),
  R('km','Deliveries · km by truck','Shipping','thisMonth',['truck','driver'],[
   ['Summary',[repW('number','deliveries',{metrics:['km','trips','kmPerTrip'],compare:'prev'}),repW('table','deliveries',{title:'By truck',dims:['truck'],metrics:['km','trips','kmPerTrip','count','units']}),
    repW('columns','deliveries',{title:'Km by week',dims:['at:week'],metrics:['km']})]]],2),
  /* Версия 3: экраны — «эта станция» и «я» подставляются на месте. */
  R('myday','Station · my day','Screens','today',[],[
   ['Today',[repW('number','glass',{title:'This station today',width:'half',metrics:['count','area'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('number','glass',{title:'You today',width:'half',metrics:['count','area'],filters:[{f:'station',op:'in',v:['@station']},{f:'person',op:'in',v:['@me']}]}),
    repW('columns','glass',{title:'Glass by hour',dims:['at:hour'],metrics:['count'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('table','glass',{title:'Orders done here today',dims:['order'],metrics:['count'],filters:[{f:'station',op:'in',v:['@station']}],limit:10,other:true})]]],3),
  R('myedge','Edgework · my day','Screens','today',[],[
   ['Today',[repW('number','edgework',{title:'Linear in here today',width:'half',metrics:['inches','glass'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('number','edgework',{title:'Your linear in today',width:'half',metrics:['inches','glass'],filters:[{f:'station',op:'in',v:['@station']},{f:'person',op:'in',v:['@me']}]}),
    repW('columns','edgework',{title:'Linear in by hour',dims:['at:hour'],metrics:['inches'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('table','edgework',{title:'By thickness',dims:['mm'],metrics:['inches','glass'],filters:[{f:'station',op:'in',v:['@station']}]})]]],3),
  R('mycustomers','Sales · my customers','Screens','thisMonth',['customer'],[
   ['Orders',[repW('number','orders',{date:{f:'created'},metrics:['count','late','onTime'],filters:[{f:'rep',op:'in',v:['@me']}]}),
    repW('table','orders',{title:'By customer',date:{f:'created'},dims:['customer'],metrics:['count','late','units','area'],filters:[{f:'rep',op:'in',v:['@me']}]})]],
   ['Quotes',[repW('table','quotes',{title:'My quotes',date:{f:'created'},dims:['state'],metrics:['count','value'],filters:[{f:'rep',op:'in',v:['@me']}]})]]],3),
  R('sizes','Glass by size band','Production','thisMonth',['station','glass'],[
   ['Summary',[repW('bars','glass',{title:'Glass by size band',dims:['sizeBand'],metrics:['count'],width:'half'}),repW('pie','ordered',{title:'Ordered ft² by size band',date:{f:'created'},dims:['sizeBand'],metrics:['area'],width:'half'}),
    repW('table','glass',{title:'Station × size band',dims:['station','sizeBand'],metrics:['count']})]]],2),
  /* Версия 5 (26.10.2026): продано по каждому продукту — деньги и меры.
     По умолчанию только оплачиваемое: переделка NCR за $0 — не продажа. */
  Object.assign(R('sold','Products · sold','Sales','thisMonth',['category','type','customer','charge'],[
   ['Summary',[repW('number','sold',{title:'Sold · money',metrics:['amount','orders','units','unitFt2'],filters:[{f:'category',op:'notIn',v:['Order charges']}]}),
    repW('number','sold',{title:'Sold · measures',metrics:['glassFt2','filmFt2','inches','pcs','workFt2']}),
    repW('table','sold',{title:'By category',dims:['category'],metrics:['amount','glassFt2','filmFt2','inches','pcs','workFt2','orders']}),
    repW('table','sold',{title:'Fabrication · by type',dims:['type'],metrics:['pcs','amount','price','orders'],filters:[{f:'category',op:'in',v:['Fabrication']}],width:'half'}),
    repW('table','sold',{title:'Interlayer · ft²',dims:['product'],metrics:['filmFt2','lamFt2','amount','price'],filters:[{f:'category',op:'in',v:['Interlayer']}],width:'half'})]],
   ['By product',[repW('table','sold',{title:'By product',dims:['product'],metrics:['qty','amount','price','orders','calc:qty~div~orders'],
     filters:[{f:'category',op:'notIn',v:['Order charges','Adjustments','Price set by hand','Cancelled units']}]})]],
   ['By month',[repW('columns','sold',{title:'Amount by month · category',date:{use:'own',preset:'thisYear'},dims:['created:month','category'],metrics:['amount'],filters:[{f:'category',op:'notIn',v:['Order charges']}]}),
    repW('table','sold',{title:'Type by month',date:{use:'own',preset:'thisYear'},dims:['type','created:month'],metrics:['amount'],filters:[{f:'category',op:'notIn',v:['Order charges']}],limit:30})]],
   ['Prices',[repW('table','sold',{title:'Price per unit · by product',dims:['product'],metrics:['price','unitPrice:min','unitPrice:max','customers'],
     filters:[{f:'category',op:'notIn',v:['Order charges','Adjustments','Price set by hand','Cancelled units']}]}),
    repW('table','sold',{title:'By customer',dims:['customer'],metrics:['amount','orders','calc:amount~div~orders'],limit:20,other:true})]]],5),{filters:{charge:['Charged']}}),
  /* Версия 6 (26.10.2026): цех сейчас — «что ждёт, что не ждёт, что
     овердью, что уже готово, а что нет»; листы по резчику; экраны станций. */
  R('shopnow','Shop · where is it now','Production','all',['where','state','customer','priority'],[
   ['Now',[repW('number','shopnow',{title:'In the shop now',metrics:['glass','area','orders','overdueOrders']}),
    repW('bars','shopnow',{title:'Glass by where it is',dims:['where'],metrics:['glass'],width:'half'}),repW('bars','shopnow',{title:'Glass by due',dims:['state'],metrics:['glass'],width:'half'}),
    repW('table','shopnow',{title:'Overdue · where it is stuck',dims:['order','where'],metrics:['glass'],filters:[{f:'state',op:'in',v:['Overdue']}]}),
    repW('table','shopnow',{title:'Waiting by station',dims:['where'],metrics:['glass','days:avg','days:max','over']}),
    repW('table','shopnow',{title:'Ready · waiting for pickup or delivery',dims:['order'],metrics:['glass','days:max'],filters:[{f:'where',op:'in',v:['Ready']}],limit:30})]],
   ['By customer',[repW('table','shopnow',{title:'By customer',dims:['customer'],metrics:['glass','orders','overdueOrders','over']}),
    repW('table','shopnow',{title:'Not started · to verify or to batch',dims:['order','where'],metrics:['glass'],filters:[{f:'stage',op:'in',v:['Not started']}]})]]],6),
  R('sheetcut','Cutting · sheets by cutter','Production','thisWeek',['person','glass'],[
   ['Summary',[repW('number','sheetcut',{title:'Sheets',metrics:['sheets','broke','area','batches'],compare:'prev'}),repW('table','sheetcut',{title:'By cutter',dims:['person'],metrics:['sheets','broke','area','batches']}),
    repW('columns','sheetcut',{title:'Sheets by day · cutter',dims:['at:day','person'],metrics:['sheets']}),repW('table','sheetcut',{title:'Glass × sheet size',dims:['glass','size'],metrics:['sheets']})]]],6),
  R('mycut','Cutting · my day','Screens','today',[],[
   ['Today',[repW('number','sheetcut',{title:'Sheets today',width:'half',metrics:['sheets','broke']}),repW('number','sheetcut',{title:'Your sheets today',width:'half',metrics:['sheets','broke'],filters:[{f:'person',op:'in',v:['@me']}]}),
    repW('number','cutting',{title:'Your glass today',width:'half',metrics:['count','area'],filters:[{f:'person',op:'in',v:['@me']}]}),repW('columns','sheetcut',{title:'Sheets by hour',width:'half',dims:['at:hour'],metrics:['sheets']})]]],6),
  R('mydrill','Drilling & CNC · my day','Screens','today',[],[
   ['Today',[repW('number','drilling',{title:'Pieces here today',width:'half',metrics:['pcs','glass'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('number','drilling',{title:'Your pieces today',width:'half',metrics:['pcs','glass'],filters:[{f:'station',op:'in',v:['@station']},{f:'person',op:'in',v:['@me']}]}),
    repW('table','drilling',{title:'By operation',dims:['op'],metrics:['pcs','glass'],filters:[{f:'station',op:'in',v:['@station']}]})]]],6),
  R('myasm','Assembly · my day','Screens','today',[],[
   ['Today',[repW('number','assembly',{title:'Units here today',width:'half',metrics:['units','count'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('number','assembly',{title:'Your units today',width:'half',metrics:['units','count'],filters:[{f:'station',op:'in',v:['@station']},{f:'person',op:'in',v:['@me']}]}),
    repW('table','assembly',{title:'By unit type',dims:['unitType'],metrics:['units','area'],filters:[{f:'station',op:'in',v:['@station']}]})]]],6),
  R('myship','Shipping · my day','Screens','today',[],[
   ['Today',[repW('number','glass',{title:'Here today',width:'half',metrics:['units','count'],filters:[{f:'station',op:'in',v:['@station']}]}),
    repW('number','glass',{title:'You today',width:'half',metrics:['units','count'],filters:[{f:'station',op:'in',v:['@station']},{f:'person',op:'in',v:['@me']}]}),
    repW('table','glass',{title:'By customer',dims:['customer'],metrics:['units','count'],filters:[{f:'station',op:'in',v:['@station']}],limit:10,other:true})]]],6)
 ];
}

/* Отчёты на экране станции или человека — по имени. */
function repScreensFor(kind,id){return (DB.report||[]).filter(r=>r.screens&&(r.screens[kind]||[]).includes(id)).sort((a,b)=>a.name.localeCompare(b.name));}

/* ------------------------------ Команды ------------------------------ */
function repWrite(fn){
 const out=storageCommand(()=>{const v=fn();if(v===false)throw new Error('Not saved.');return v;});
 if(!out.ok&&typeof alert==='function')alert(out.error||'Not saved.');
 return out.ok?out.value:null;
}
function repTouch(r){r.updatedAt=new Date().toISOString();}
/* Новый отчёт и копия — черновики: в базе они появятся по Save. */
function repBlank(folder){return repClean({name:'New report',folder:folder||'',ownerId:repMe(),share:'me',createdAt:new Date().toISOString(),date:{preset:'thisMonth'},pages:[{name:'Page 1',widgets:[repW('table','glass',{dims:['station'],metrics:['count']})]}]});}
function repCopyOf(src){
 const r=repClean(JSON.parse(JSON.stringify(src)));r.id=repUid('RP');r.name=(src.name+' · copy').slice(0,120);r.ownerId=repMe();r.share='me';r.createdAt=new Date().toISOString();
 r.pages.forEach(p=>{p.id=repUid('PG');p.widgets.forEach(w=>{w.id=repUid('W');});});return r;
}
/* Записать черновик: свой новый отчёт — любому с Reports, существующий —
   автору и администратору. */
function repSave(draft){
 const was=draft&&repFind(draft.id);if(!draft||(was?!repCanEdit(was):!(repIsAdmin()||draft.ownerId===repMe())))return null;
 return repWrite(()=>{const c=repClean(JSON.parse(JSON.stringify(draft)));repTouch(c);const i=DB.report.findIndex(x=>x.id===c.id);if(i<0)DB.report.push(c);else DB.report[i]=c;return c;});
}
function repDelete(id){const r=repFind(id);if(!repCanEdit(r))return false;return repWrite(()=>{DB.report=DB.report.filter(x=>x.id!==id);return true;});}
/* Правка отчёта одной командой: fn меняет отчёт, потом чистка и время. */
function repEditReport(id,fn){
 const r=repFind(id);if(!repCanEdit(r))return null;
 return repWrite(()=>{const x=repFind(id);fn(x);const c=repClean(x);Object.assign(x,c);repTouch(x);return x;});
}
