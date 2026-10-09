/* =====================================================================
   reports/model  ·  reports-2.0
   Отчёты конструктора: хранение, права, стартовые отчёты, команды.
   IN : DB.report, вошедший человек (erp/signin), REP_SRC
   OUT: DB.report — [{id, name, folder, ownerId, share, controls, date,
        pages:[{id, name, widgets:[{id, type, title, width, q, opts}]}]}]

   Владелец, 9 октября 2026: «модуль отчётов не хуже Looker Studio или
   Tableau», «а если я хочу 10 или 50 разных заготовленных отчётов для
   владельца?», «создавать отчёты по своему логическому порядку», «не должны
   сразу вываливаться блоком». Отчёт — страницы и графики в своём порядке;
   у графика свой источник, тип и настройки (reports/query).
   Кто правит: автор и администратор (Users); остальные смотрят и берут
   копию. share: 'all' — всем с Reports, 'me' — только автору, [id] — кому.
   Стартовые отчёты — обычные, их можно править и удалять.
   ===================================================================== */
DEFAULT.report=[];
DEFAULT.reportSeed=0;
const REP_TYPES=[['number','Number'],['table','Table'],['bars','Bars'],['columns','Columns'],['line','Line'],['pie','Pie']];
const REP_SEED_VERSION=1;
/* Короткий id: отчёт, страница, график. Чистка его не меняет (до 80 знаков). */
function repUid(p){return p+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();}
function repMe(){const u=typeof signinUser==='function'?signinUser():null;return u?u.viewProfileId:'';}
/* Администратор — галочка Users; без входа (пустая база, картинки) — открыто, как accessCan. */
function repIsAdmin(){return typeof accessCan==='function'&&accessCan(ACCESS_ADMIN);}
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
 const d=r.date&&typeof r.date==='object'?r.date:{};
 return {id:repStr(r.id,80)||repUid('RP'),name:repStr(r.name,120)||'Untitled report',folder:repStr(r.folder,60),note:repStr(r.note,500),ownerId:repStr(r.ownerId,80),
  share:r.share==='all'||r.share==='me'?r.share:Array.isArray(r.share)?r.share.map(x=>repStr(x,80)).slice(0,200):'me',
  controls:(Array.isArray(r.controls)?r.controls:[]).map(x=>repStr(x,40)).filter(Boolean).slice(0,10),
  date:{preset:REP_PRESETS.some(p=>p[0]===d.preset)?d.preset:'thisMonth',from:/^\d{4}-\d{2}-\d{2}$/.test(d.from||'')?d.from:'',to:/^\d{4}-\d{2}-\d{2}$/.test(d.to||'')?d.to:''},
  pages:pages.length?pages:[{id:repUid('PG'),name:'Page 1',widgets:[]}],createdAt:repStr(r.createdAt,40),updatedAt:repStr(r.updatedAt,40)};
}
function normalizeReports(){
 if(!Array.isArray(DB.report))DB.report=[];
 const seen=new Set();DB.report=DB.report.filter(r=>r&&typeof r==='object').map(repClean).filter(r=>!seen.has(r.id)&&(seen.add(r.id),true));
 if(!(+DB.reportSeed>=REP_SEED_VERSION)){REP_STARTERS().forEach(r=>{if(!DB.report.some(x=>x.id===r.id))DB.report.push(repClean(r));});DB.reportSeed=REP_SEED_VERSION;}
}
function validateReportsPayload(src){
 if(src.report!=null&&!Array.isArray(src.report))throw new Error('The "report" field must be an array.');
 (src.report||[]).forEach(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw new Error('Reports: every report must be an object.');});
}

/* --------------------------- Стартовые ------------------------------- */
/* Образцы по участкам — первые отчёты каталога. w(тип, источник, …). */
function repW(type,source,o){o=o||{};return {type,title:o.title||'',width:o.width||'full',q:{source,date:o.date||{},dims:o.dims||[],metrics:o.metrics||[],filters:o.filters||[],sort:o.sort||null,limit:o.limit||0,other:!!o.other,compare:o.compare||''},opts:o.opts||{}};}
function REP_STARTERS(){
 const R=(id,name,folder,date,controls,pages)=>({id:'RP-start-'+id,name,folder,ownerId:'',share:'all',date:{preset:date},controls,pages:pages.map((p,i)=>({id:'PG-start-'+id+'-'+i,name:p[0],widgets:p[1].map((w,j)=>Object.assign({id:'W-start-'+id+'-'+i+'-'+j},w))}))});
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
    repW('bars','breaks',{title:'By station',dims:['station'],metrics:['glassN'],width:'half'}),repW('columns','breaks',{title:'By week · kind',dims:['at:week','kind'],metrics:['glassN']})]]])
 ];
}

/* ------------------------------ Команды ------------------------------ */
function repWrite(fn){
 const out=storageCommand(()=>{const v=fn();if(v===false)throw new Error('Not saved.');return v;});
 if(!out.ok&&typeof alert==='function')alert(out.error||'Not saved.');
 return out.ok?out.value:null;
}
function repTouch(r){r.updatedAt=new Date().toISOString();}
function repCreate(folder){
 return repWrite(()=>{const r=repClean({name:'New report',folder:folder||'',ownerId:repMe(),share:'me',createdAt:new Date().toISOString(),date:{preset:'thisMonth'},pages:[{name:'Page 1',widgets:[repW('table','glass',{dims:['station'],metrics:['count']})]}]});repTouch(r);DB.report.push(r);return r;});
}
function repCopy(id){
 const src=repFind(id);if(!src)return null;
 return repWrite(()=>{const r=repClean(JSON.parse(JSON.stringify(src)));r.id=repUid('RP');r.name=(src.name+' · copy').slice(0,120);r.ownerId=repMe();r.share='me';r.createdAt=new Date().toISOString();
  r.pages.forEach(p=>{p.id=repUid('PG');p.widgets.forEach(w=>{w.id=repUid('W');});});repTouch(r);DB.report.push(r);return r;});
}
function repDelete(id){const r=repFind(id);if(!repCanEdit(r))return false;return repWrite(()=>{DB.report=DB.report.filter(x=>x.id!==id);return true;});}
/* Правка отчёта одной командой: fn меняет отчёт, потом чистка и время. */
function repEditReport(id,fn){
 const r=repFind(id);if(!repCanEdit(r))return null;
 return repWrite(()=>{const x=repFind(id);fn(x);const c=repClean(x);Object.assign(x,c);repTouch(x);return x;});
}
