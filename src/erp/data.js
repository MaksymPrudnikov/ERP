/* =====================================================================
   erp/data  ·  erp-1.0
   Справочники прототипа, дефолтные данные, нормализация после загрузки.
   IN : localStorage / импорт JSON
   OUT: DB
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function normalizeSalesModules(){
  if(!Array.isArray(DB.shapeDef))DB.shapeDef=[];
  DB.shapeDef=DB.shapeDef.map(function(s,i){
    if(s&&s.smart&&s.w!=null&&s.h!=null){s.smart=ssNormalize(s.smart);return s;}
    var w=48,h=36;
    if(s&&Array.isArray(s.points)&&s.points.length){var xs=s.points.map(function(p){return +p.x||0}),ys=s.points.map(function(p){return +p.y||0});w=Math.max.apply(null,xs)-Math.min.apply(null,xs)||w;h=Math.max.apply(null,ys)-Math.min.apply(null,ys)||h;}
    return {id:(s&&s.id)||('s'+Date.now()+i),name:(s&&s.name)||('Smart Shape '+(i+1)),w:String(w),h:String(h),smart:defaultSmartModel(),legacyPoints:s&&s.points?s.points:undefined};
  });
  if(!DB.shapeDef.length)DB.shapeDef.push({id:'s1',name:'Advanced 48×36 / C=30',w:'48',h:'36',smart:(function(){var m=defaultSmartModel();m.C.len='30';return m;})()});
  if(!Array.isArray(DB.muntinDef))DB.muntinDef=[];
  DB.muntinDef=DB.muntinDef.map(function(m,i){
    if(m&&m.muntin){m.muntin=normalizeMuntinModel(m.muntin);if(!m.shapeId)m.shapeId=DB.shapeDef[0].id;return m;}
    var M=defaultMuntinModel();if(m){M.layout.verticalBars=clampBars(m.cols==null?2:m.cols);M.layout.horizontalBars=clampBars(m.rows==null?1:m.rows);}
    return {id:(m&&m.id)||('m'+Date.now()+i),name:(m&&m.name)||('Adaptive Muntin '+(i+1)),shapeId:(m&&m.shapeId)||DB.shapeDef[0].id,muntin:M};
  });
  if(!DB.muntinDef.length)DB.muntinDef.push({id:'m1',name:'Adaptive 2V × 1H',shapeId:DB.shapeDef[0].id,muntin:defaultMuntinModel()});
}

const ROLES=['Админ','Руководство','Продажи','Технолог','Цех','Отгрузка','Снабжение'];
const SKILLS=['Резка','Кромка (arris/polish)','ЧПУ полировка','Сверловка/выемки','Закалка','Контроль качества','Отгрузка/погрузка'];
const SKILL_LEVELS=['Новичок','Мидл','Синьор'];
/* старые записи могли хранить навык просто строкой — приводим к {skill, level} на лету */
const normSkill = x => (typeof x==='string') ? {skill:x, level:'Мидл'} : x;
function normalizeUsers(){
 DB.user=DB.user.filter(u=>u&&typeof u==='object');
 DB.user.forEach(u=>{ u.skills=(u.skills||[]).map(normSkill).filter(x=>x&&x.skill); });
}
/* Уровень станции обязан быть ЧИСЛОМ или null. Из импортированного/руками
   правленного JSON он приезжал строкой ("1"), и станция молча выпадала из
   маршрута, потому что сравнение s.level===l.n строгое. */
function normalizeStations(){
 DB.level=DB.level.filter(l=>l&&isFinite(+l.n))
   .map(l=>({n:+l.n,label:String(l.label==null?'':l.label)}))
   .sort((a,b)=>a.n-b.n);
 DB.station=DB.station.filter(s=>s&&s.code).map(s=>{
  const lv=(s.level===''||s.level==null)?null:+s.level;
  s.level=isFinite(lv)?lv:null;
  ['maxW','maxL','minTh','maxTh'].forEach(k=>{const v=(s[k]===''||s[k]==null)?null:+s[k];s[k]=isFinite(v)?v:null;});
  s.code=String(s.code);s.name=String(s.name==null?'':s.name);s.note=String(s.note==null?'':s.note);
  return s;
 });
 /* уровень, на который никто не ссылается, оставляем; станция без уровня — тоже
    штатное состояние (CNC1 / FURN1 ждут решения пользователя) */
}
function skillIconName(skill){
 return ({
  'Резка':'cut',
  'Кромка (arris/polish)':'edge',
  'ЧПУ полировка':'cnc',
  'Сверловка/выемки':'cnc',
  'Закалка':'furnace',
  'Контроль качества':'check',
  'Отгрузка/погрузка':'shipping'
 })[skill] || 'report';
}
function skillBadgeHTML(skillObj){
 const s=normSkill(skillObj);
 return `<span class="skill-badge">${ico(skillIconName(s.skill),'icon-inline')}<span>${esc(s.skill)}</span><span class="pill">${esc(s.level)}</span></span>`;
}
function salesSkillCards(){
 const cards=[
  {id:'shape', icon:'shape', title:'Smart-Shape / Advanced', desc:'A/B/C/D · elbows · corner blocks · validation', meta:'real contour · v4.5'},
  {id:'muntin', icon:'muntin', title:'Adaptive Muntin', desc:'actual perimeter · 1/16″ grid · real cut lengths', meta:'shape-driven · v4.5'}
 ];
 return `<div class="skill-card-grid sales-skill-grid">${cards.map(c=>`<button type="button" class="skill-card ${subtab===c.id?'active':''}" onclick="subtab='${c.id}';${c.id==='shape'?'sEdit=null;sDraft=null;':'mEdit=null;mDraft=null;'}render()"><div class="skill-card-icon">${ico(c.icon)}</div><div class="skill-card-body"><b>${c.title}</b><small>${c.desc}</small><div class="skill-card-meta"><span class="pill ${subtab===c.id?'ok':'info'}">${c.meta}</span></div></div></button>`).join('')}</div>`;
}

const DEFAULT={
 user:[],
 level:[{n:1,label:'Резка'},{n:2,label:'Кромка (arris / polish / CNC polishing)'},{n:3,label:'Drill & Notch'},{n:4,label:'—'}],
 station:[
  {code:'CUT1', name:'Раскроечный стол', level:1, maxW:null, maxL:null, minTh:3, maxTh:19, note:'Заведена под уровень 1 — раньше в модели не было отдельной резки, только печь/кромка/ЧПУ'},
  {code:'EDGE1', name:'Кромкообрабатывающая линия', level:2, maxW:null, maxL:null, minTh:3, maxTh:19, note:''},
  {code:'BEVEL1', name:'Фацетный станок', level:2, maxW:70, maxL:100, minTh:3, maxTh:19, note:''},
  {code:'CNC1', name:'Обрабатывающий центр ЧПУ', level:null, maxW:60, maxL:122, minTh:3, maxTh:19, note:'Уровень не назначен — уточни у себя: этот ЧПУ больше полирует кромку (уровень 2) или сверлит/выбирает пазы (уровень 3)?'},
  {code:'FURN1', name:'Печь закалки', level:null, maxW:90, maxL:150, minTh:3, maxTh:19, note:'Уровень не назначен — закалка обычно отдельный этап после кромки/сверловки, назначь номер сам'}
 ],
 shapeDef:[{id:'s1', name:'Advanced 48×36 / C=30', w:'48', h:'36', smart:{elbowsOn:false,A:{len:'',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},B:{len:'',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},C:{len:'30',out:'0',dir:null,elbow:{to:'0',elbowLen:'0',past:'0',mode:null}},corners:{tl:'none',tr:'none',br:'none',bl:'none'},extraEdges:{}}}],
 muntinDef:[{id:'m1', name:'Adaptive 2V × 1H', shapeId:'s1', muntin:{enabled:true,productId:'mb058_black',flipped:false,layout:{type:'grid',verticalBars:2,horizontalBars:1},production:{mode:'equal',edgeInsetX:0.4375,edgeInsetY:0.4375,endClearance:0,edgeMode:'offset',verticalPositions:[],horizontalPositions:[]}}}]
};
let DB=JSON.parse(JSON.stringify(DEFAULT)), dirty=false;
