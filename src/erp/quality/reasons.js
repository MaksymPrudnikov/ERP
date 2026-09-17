/* =====================================================================
   erp/quality/reasons  ·  ncr-reasons-1.0
   Справочник причин брака и рекламаций: «Где» — станция цеха или Office,
   «Что» — что случилось. Общие причины действуют на каждой станции.
   IN : DB.station — станции цеха; новая станция сразу появляется в «Где»
   OUT: DB.ncrReason {id, where: '*' | 'OFFICE' | код станции, name, active}
        NCR_SOURCES · NCR_ACTIONS
   Владелец, 15–17 сентября 2026: «по нашей системе — где и что»; «станция и
   что сломало: базовые — удар, сломалось; например, на закалке взорвалось
   в машине»; «добавь офис»; «скретч, а ещё с доли или со скида стекло падает».
   Списки Spil не переносятся. Причину не удаляют — выключают (Active).
   Записи NCR по номеру стекла и перерез — следующий этап.
   ===================================================================== */
DEFAULT.ncrReason=[];
const NCR_ALL='*',NCR_OFFICE='OFFICE';
const NCR_SOURCES=['Found in shop','Customer claim'];
const NCR_ACTIONS=['Recut','Remake order','Repair','Replace from stock','Credit','No action'];
/* Стартовый набор. Office — ошибки оформления, ударов и падений там нет. */
const NCR_SEED={
 '*':   ['Impact','Broke','Chipped','Scratched','Fell from dolly / skid'],
 OFFICE:['Order entered wrong','Drawing wrong','Cut list wrong','Program error'],
 CUT:   ['Wrong size','Wrong glass','Shape cut wrong'],
 EDGE:  ['Wrong edgework','Bevel width wrong','Miter angle wrong','Polish burn'],
 DRILL: ['Chipped at hole','Hole position wrong','Hole size wrong','Drilling skipped before tempering'],
 CNC:   ['Chipped at cut-out','Position wrong','Size / radius wrong','CNC program error'],
 CERP:  ['Frit position wrong','Pinholes / coverage','Wrong color or pattern'],
 HEAT:  ['Exploded in furnace','Broke in quench','Broke in heat soak','Bow / warp','Roller marks','Wrong treatment (FT / HS)'],
 SAND:  ['Pattern position wrong','Uneven frosting'],
 PAINT: ['Paint defect','Wrong color','Painted wrong side'],
 LAM:   ['Bubbles','Delamination','Lites offset','Debris inside'],
 IGU:   ['Seal failure / fogging','Dirty inside','Wrong spacer or gas','Low-E on wrong surface','Muntin misaligned'],
 SHIPR: ['Damaged in rack','Wrong label','Missing piece'],
 SHIP:  ['Broke in transit','Spontaneous breakage','Broke on install','Delivered to wrong customer']
};
function ncrSeedRows(){
 return Object.keys(NCR_SEED).flatMap(where=>NCR_SEED[where].map((name,i)=>({id:'NR-'+(where===NCR_ALL?'ALL':where)+'-'+String(i+1).padStart(2,'0'),where,name,active:true})));
}
function ncrName(v){return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,80);}
/* Пустой справочник (новая база или старый файл) получает стартовый набор. */
function normalizeNcrReasons(){
 if(!Array.isArray(DB.ncrReason)||!DB.ncrReason.length){DB.ncrReason=ncrSeedRows();return;}
 const ids=new Set();
 DB.ncrReason=DB.ncrReason.filter(r=>r&&typeof r==='object')
  .map(r=>({id:typeof r.id==='string'&&r.id?r.id:salesUid('NR'),where:typeof r.where==='string'?r.where.trim().toUpperCase():'',name:ncrName(r.name),active:r.active!==false}))
  .filter(r=>{if(!r.where||!r.name||ids.has(r.id))return false;ids.add(r.id);return true;});
}
function ncrWhereList(){
 return [{code:NCR_OFFICE,name:'Office'}].concat((DB.station||[]).slice().sort((a,b)=>(a.seq||0)-(b.seq||0)).map(s=>({code:s.code,name:s.nameEn||s.name||s.code})));
}
function ncrWhereName(code){if(code===NCR_ALL)return 'All stations';const w=ncrWhereList().find(x=>x.code===code);return w?w.name:code;}
/* Причины места: у станции — общие и свои, у Office и All stations — только свои. */
function ncrReasonsFor(where,opts){
 opts=opts||{};const all=(DB.ncrReason||[]).filter(r=>!opts.activeOnly||r.active);
 const base=where===NCR_ALL||where===NCR_OFFICE?[]:all.filter(r=>r.where===NCR_ALL);
 return base.concat(all.filter(r=>r.where===where));
}
/* Одинаковое название нельзя завести там, где обе причины окажутся в одном
   списке: общая причина видна на каждой станции, но не в Office. */
function ncrReasonProblem(where,name,exceptId){
 name=ncrName(name);if(!name)return 'Enter a reason.';
 const low=name.toLowerCase();
 const clash=(DB.ncrReason||[]).some(r=>r.id!==exceptId&&r.name.toLowerCase()===low&&(r.where===where||where!==NCR_OFFICE&&r.where!==NCR_OFFICE&&(r.where===NCR_ALL||where===NCR_ALL)));
 return clash?'Already exists':'';
}
function ncrReasonAdd(where,name){
 if(where!==NCR_ALL&&!ncrWhereList().some(w=>w.code===where))return 'Choose where it happened.';
 const problem=ncrReasonProblem(where,name);if(problem)return problem;
 DB.ncrReason.push({id:salesUid('NR'),where,name:ncrName(name),active:true});touch();return '';
}
function ncrReasonRename(id,name){
 const r=(DB.ncrReason||[]).find(x=>x.id===id);if(!r)return 'Reason not found.';
 const problem=ncrReasonProblem(r.where,name,id);if(problem)return problem;
 r.name=ncrName(name);touch();return '';
}
function ncrReasonSetActive(id,on){const r=(DB.ncrReason||[]).find(x=>x.id===id);if(!r)return false;r.active=!!on;touch();return true;}
