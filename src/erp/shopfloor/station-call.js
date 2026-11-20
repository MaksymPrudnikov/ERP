/* =====================================================================
   erp/shopfloor/station-call  ·  call-1.0
   Вызов HELP со станции (часть C задания «Карта цеха»): рабочий нажимает
   HELP на экране станции — станция горит красным на плане цеха в офисе;
   Resolved — на той же станции или в карточке станции на Floor.
   IN : DB.station
   OUT: DB.stationCall {id, station, machine, by, byId, at, closedAt,
        closedBy} · normalizeStationCalls · stationCallOpen(code) ·
        stationCallsOpen() · stationHelpCommand(code, who, machine) ·
        stationResolveCommand(code, who)
   Владелец, 19–20.11.2026: «потом в экран производства добавим знак вызова
   мастера (продакт-менеджера), и станция должна подсвечиваться и гореть
   красным»; уточнение — просто HELP, «чтобы не акцентировать внимание»;
   мастер — production manager, сейчас один человек, следит за экраном
   производства в офисе; без звука, телефона и Overview; записи остаются,
   отчёт по ним — потом, если попросит. У станции открыт один вызов:
   повторное нажатие нового не заводит.
   ===================================================================== */
DEFAULT.stationCall=[];
const STATION_CALL_ID_RE=/^HC-[A-Za-z0-9-]{4,60}$/;

function normalizeStationCalls(){
 const iso=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v)),seen=new Set();
 DB.stationCall=(Array.isArray(DB.stationCall)?DB.stationCall:[]).filter(c=>c&&typeof c==='object'&&STATION_CALL_ID_RE.test(String(c.id))&&!seen.has(c.id)&&iso(c.at)&&typeof c.station==='string'&&c.station.trim()&&(seen.add(c.id),true))
  .map(c=>({id:c.id,station:sfCode(c.station),machine:typeof c.machine==='string'&&SF_CODE_RE.test(sfCode(c.machine))?sfCode(c.machine):'',
   by:String(c.by==null?'':c.by).slice(0,80),byId:String(c.byId==null?'':c.byId).slice(0,80),at:c.at,
   closedAt:iso(c.closedAt)?c.closedAt:'',closedBy:iso(c.closedAt)?String(c.closedBy==null?'':c.closedBy).slice(0,80):''}));
}
/* Открытый вызов станции (последний, если вдруг два с разных ПК). */
function stationCallOpen(code){let out=null;(DB.stationCall||[]).forEach(c=>{if(c.station===code&&!c.closedAt&&(!out||c.at>out.at))out=c;});return out;}
function stationCallsOpen(){const m=new Map();(DB.stationCall||[]).forEach(c=>{if(!c.closedAt){const w=m.get(c.station);if(!w||c.at>w.at)m.set(c.station,c);}});return m;}
function stationCallId(){return 'HC-'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));}
/* HELP: один открытый вызов на станцию. */
function stationHelpCommand(code,who,machine){
 return storageCommand(()=>{
  if(!(DB.station||[]).some(s=>s.code===code))throw new Error('Unknown station.');
  const open=stationCallOpen(code);if(open)return open;
  if(!Array.isArray(DB.stationCall))DB.stationCall=[];
  const c={id:stationCallId(),station:code,machine:machine||'',by:String(who&&who.name||'').slice(0,80),byId:String(who&&who.id||'').slice(0,80),at:new Date().toISOString(),closedAt:'',closedBy:''};
  DB.stationCall.push(c);return c;
 });
}
/* Resolved: закрывает все открытые вызовы станции. */
function stationResolveCommand(code,who){
 return storageCommand(()=>{
  const now=new Date().toISOString(),list=(DB.stationCall||[]).filter(c=>c.station===code&&!c.closedAt);
  if(!list.length)throw new Error('No help call here.');
  list.forEach(c=>{c.closedAt=now;c.closedBy=String(who&&who.name||'').slice(0,80);});
  return list.length;
 });
}
/* Минуты с вызова — для «Help · 4 min». */
function stationCallMinutes(c,now){return Math.max(0,Math.floor(((now?Date.parse(now):Date.now())-Date.parse(c.at))/6e4));}
