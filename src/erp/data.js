/* =====================================================================
   erp/data  ·  erp-1.0
   Справочники прототипа, дефолтные данные, нормализация после загрузки.
   IN : localStorage / импорт JSON
   OUT: DB
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

function normalizeSalesModules(){
  if(!Array.isArray(DB.shapeDef))DB.shapeDef=[];
  var shapeIds=Object.create(null);
  function uniqueId(raw,prefix){
    var id=String(raw==null?'':raw).trim();
    if(!id||shapeIds[id]){do{id=prefix==='s'?newShapeId():newMuntinId();}while(shapeIds[id]);}
    shapeIds[id]=true;return id;
  }
  DB.shapeDef=DB.shapeDef.map(function(s,i){
    var src=s&&typeof s==='object'?s:{},legacy=Array.isArray(src.points)&&src.points.length>=3;
    if(legacy&&!src.type){
      var xs=src.points.map(function(p){return +p.x||0}),ys=src.points.map(function(p){return +p.y||0}),minX=Math.min.apply(null,xs),minY=Math.min.apply(null,ys);
      src=Object.assign({},src,{type:'polygon',w:String(Math.max.apply(null,xs)-minX||48),h:String(Math.max.apply(null,ys)-minY||36),polygon:src.points.map(function(p,n){return {id:'PV'+(n+1),x:String((+p.x||0)-minX),y:String((+p.y||0)-minY)};})});
    }
    var out=normalizeShapeDef(src);out.id=uniqueId(src.id,'s');out.name=String(src.name==null?(shapePresetInfo(out.type).label+' '+(i+1)):src.name);return out;
  });
  if(!Array.isArray(DB.muntinDef))DB.muntinDef=[];
  var firstShapeId=(DB.shapeDef[0]||{}).id||'',muntinIds=Object.create(null);
  function uniqueMuntinId(raw){var id=String(raw==null?'':raw).trim();if(!id||muntinIds[id]){do{id=newMuntinId();}while(muntinIds[id]);}muntinIds[id]=true;return id;}
  DB.muntinDef=DB.muntinDef.map(function(m,i){
    if(m&&typeof m==='object'&&m.muntin){m.id=uniqueMuntinId(m.id);m.name=String(m.name==null?'':m.name);m.shapeId=String(m.shapeId||firstShapeId);m.muntin=normalizeMuntinModel(m.muntin);var ms=DB.shapeDef.find(function(s){return s.id===m.shapeId;});if(ms&&!m.shapeFingerprint)pinMuntinShape(m,ms);return m;}
    var M=defaultMuntinModel();if(m){M.layout.verticalBars=clampBars(m.cols==null?2:m.cols);M.layout.horizontalBars=clampBars(m.rows==null?1:m.rows);}
    var out={id:uniqueMuntinId(m&&m.id),name:String((m&&m.name)||('Adaptive Muntin '+(i+1))),shapeId:String((m&&m.shapeId)||firstShapeId),muntin:M},shape=DB.shapeDef.find(function(s){return s.id===out.shapeId;});if(shape)pinMuntinShape(out,shape);return out;
  });
}

const ROLES=['Админ','Руководство','Продажи','Технолог','Цех','Отгрузка','Снабжение'];
const SAFE_DEFAULT_ROLE='Цех';
const SKILLS=['Резка','Кромка (arris/polish)','ЧПУ полировка','Сверловка/выемки','Закалка','Контроль качества','Отгрузка/погрузка'];
const SKILL_LEVELS=['Новичок','Мидл','Синьор'];
/* Старые записи могли хранить навык строкой — для них сохраняем исторический
   уровень «Мидл». Объект с неизвестным навыком/уровнем не угадываем и удаляем. */
const normSkill = x => {
 const src=typeof x==='string'?{skill:x,level:'Мидл'}:(x&&typeof x==='object'?x:null);
 if(!src)return null;
 const skill=String(src.skill==null?'':src.skill).trim();if(!SKILLS.includes(skill))return null;
 const level=typeof x==='string'?'Мидл':src.level;if(!SKILL_LEVELS.includes(level))return null;return {skill,level};
};
function normalizeUsers(){
 if(!Array.isArray(DB.user))DB.user=[];
 DB.user=DB.user.filter(u=>u&&typeof u==='object');
 DB.user.forEach(u=>{
  u.name=String(u.name==null?'':u.name);u.role=ROLES.includes(u.role)?u.role:SAFE_DEFAULT_ROLE;
  const station=String(u.station==null?'':u.station).trim().toUpperCase();u.station=DB.station.some(s=>s.code===station)?station:'';
  const seen=Object.create(null);u.skills=(Array.isArray(u.skills)?u.skills:[]).map(normSkill).filter(x=>x&&!seen[x.skill]&&(seen[x.skill]=true));
 });
}
/* Уровень станции обязан быть ЧИСЛОМ или null. Из импортированного/руками
   правленного JSON он приезжал строкой ("1"), и станция молча выпадала из
   маршрута, потому что сравнение s.level===l.n строгое. */
function normalizeStations(){
 const levelSeen=Object.create(null),stationSeen=Object.create(null);
 DB.level=DB.level.filter(l=>l&&isFinite(+l.n)&&Number.isInteger(+l.n)&&+l.n>0&&!levelSeen[+l.n]&&(levelSeen[+l.n]=true))
   .map(l=>({n:+l.n,label:String(l.label==null?'':l.label).trim()}))
   .sort((a,b)=>a.n-b.n);
 DB.station=DB.station.filter(s=>{if(!s||!s.code)return false;const code=String(s.code).trim().toUpperCase();if(!code||stationSeen[code])return false;stationSeen[code]=true;return true;}).map(s=>{
  const lv=(s.level===''||s.level==null)?null:+s.level;
  s.level=isFinite(lv)&&DB.level.some(l=>l.n===lv)?lv:null;
  ['maxW','maxL','minTh','maxTh'].forEach(k=>{const v=(s[k]===''||s[k]==null)?null:+s[k];s[k]=isFinite(v)&&v>0?v:null;});
  if(s.maxW==null||s.maxL==null)s.maxW=s.maxL=null;
  if(s.minTh==null||s.maxTh==null||s.minTh>s.maxTh)s.minTh=s.maxTh=null;
  s.code=String(s.code).trim().toUpperCase();s.name=String(s.name==null?'':s.name).trim();s.note=String(s.note==null?'':s.note);
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
 if(!s)return '';
 return `<span class="skill-badge">${ico(skillIconName(s.skill),'icon-inline')}<span>${esc(s.skill)}</span><span class="pill">${esc(s.level)}</span></span>`;
}
function salesSkillCards(){
 const cards=[
  {id:'shape', icon:'shape', title:'Production Shape', desc:'finished geometry · features · edgework · cutting', meta:'schema v2 · fail closed'},
  {id:'muntin', icon:'muntin', title:'Adaptive Muntin', desc:'pinned Shape revision · 1/16″ grid · real cut lengths', meta:'shape-driven · v4.5'}
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
