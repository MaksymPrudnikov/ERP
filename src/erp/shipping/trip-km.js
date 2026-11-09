/* =====================================================================
   shipping/trip-km  ·  km-1.0
   Километры рейса по карте Google: цех → остановки по порядку → цех.
   IN : остановки машины на день (deliveryStops), адрес цеха (Master Data →
        Company), ключ Google Maps (хранится только в этом браузере)
   OUT: DB.tripKm [{key:'день|машина', km, stops:[PS], at}] — отчёты
        доставки берут километры отсюда, без интернета

   Владелец, 9 октября 2026: доставку «нужно считать количество поездок и
   км от локации изначальной»; км — «по карте (Google)». Ключ — платный
   ключ владельца в Google Cloud (Maps JavaScript API, Directions); в Export
   JSON он не уходит. Остановки поменяли после расчёта — экран это
   показывает, пересчёт одной кнопкой.
   ===================================================================== */
DEFAULT.tripKm=[];
const TRIP_KM_KEY='glass_erp_gmaps_key';
function tripKmKey(){try{return localStorage.getItem(TRIP_KM_KEY)||'';}catch(e){return '';}}
function tripKmSetKey(v){try{const k=String(v||'').trim();if(k)localStorage.setItem(TRIP_KM_KEY,k);else localStorage.removeItem(TRIP_KM_KEY);}catch(e){}}
function tripKmAddr(a){a=a||{};return [a.address1,a.address2,a.city,a.province,a.postalCode,a.country].map(x=>String(x||'').trim()).filter(Boolean).join(', ');}
function tripKmOrigin(){const c=DB.company||{};return c.address1||c.city?tripKmAddr(c):'';}
function tripKmFind(date,truckId){return (DB.tripKm||[]).find(r=>r&&r.key===date+'|'+truckId)||null;}
/* Отпечаток маршрута: начало (цех), остановки по порядку и их адреса.
   Номера PS одни — адрес PS или цеха сменили, а km выглядели верными
   (аудит Codex 09.11.2026, F11). Запись без отпечатка (до 09.11) — по
   номерам, как раньше. */
function tripKmRoute(stops){return sha256Hex([tripKmOrigin()].concat(stops.map(s=>s.number+'\t'+tripKmAddr(s.shipTo))).join('\n')).slice(0,16);}
function tripKmStale(r,stops){return !!r&&(r.route?r.route!==tripKmRoute(stops):r.stops.join('|')!==stops.map(s=>s.number).join('|'));}
function normalizeTripKm(){
 if(!Array.isArray(DB.tripKm))DB.tripKm=[];
 const seen=new Set();
 DB.tripKm=DB.tripKm.filter(r=>r&&typeof r==='object'&&typeof r.key==='string'&&/^\d{4}-\d{2}-\d{2}\|.+/.test(r.key)&&Number.isFinite(+r.km)&&+r.km>=0&&!seen.has(r.key)&&(seen.add(r.key),true))
  .map(r=>Object.assign({key:r.key.slice(0,140),km:Math.round(+r.km*10)/10,stops:(Array.isArray(r.stops)?r.stops:[]).map(x=>String(x).slice(0,20)).slice(0,60),at:String(r.at||'').slice(0,40)},typeof r.route==='string'&&r.route?{route:r.route.slice(0,16)}:{}));
}
/* Карта грузится только по кнопке: файл офлайновый, интернет нужен лишь
   для расчёта. */
let tripKmLoading=null;
function tripKmMaps(){
 if(window.google&&google.maps&&google.maps.DirectionsService)return Promise.resolve(google.maps);
 const key=tripKmKey();if(!key)return Promise.reject(new Error('Enter the Google Maps key first.'));
 if(tripKmLoading)return tripKmLoading;
 tripKmLoading=new Promise((ok,no)=>{
  const cb='tripKmReady'+Date.now(),s=document.createElement('script');
  window[cb]=()=>{delete window[cb];ok(google.maps);};
  s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&callback='+cb;s.async=true;
  s.onerror=()=>{tripKmLoading=null;no(new Error('Google Maps did not load. Check the internet and the key.'));};
  document.head.appendChild(s);
 });
 return tripKmLoading;
}
async function tripKmCalc(date,truckId){
 const stops=deliveryStops(date,truckId),origin=tripKmOrigin(),route=tripKmRoute(stops);
 if(!origin)throw new Error('Fill the company address in Master Data → Company.');
 const addr=stops.map(s=>tripKmAddr(s.shipTo)).filter(Boolean);
 if(!addr.length)throw new Error('No delivery addresses on this truck.');
 const maps=await tripKmMaps();
 const res=await new Promise((ok,no)=>new maps.DirectionsService().route({origin,destination:origin,waypoints:addr.map(a=>({location:a,stopover:true})),optimizeWaypoints:false,travelMode:'DRIVING'},
  (r,status)=>status==='OK'&&r&&r.routes&&r.routes[0]?ok(r):no(new Error('Google could not build the route: '+status))));
 const meters=(res.routes[0].legs||[]).reduce((n,l)=>n+(l&&l.distance&&+l.distance.value||0),0);
 const out=storageCommand(()=>{
  /* Пока Google считал, остановки или адреса сменили — ответ про старый маршрут. */
  if(tripKmRoute(deliveryStops(date,truckId))!==route)throw new Error('Stops changed while calculating. Recalculate km.');
  if(!Array.isArray(DB.tripKm))DB.tripKm=[];
  const key=date+'|'+truckId,rec={key,km:Math.round(meters/100)/10,stops:stops.map(s=>s.number),route,at:new Date().toISOString()},i=DB.tripKm.findIndex(r=>r.key===key);
  if(i<0)DB.tripKm.push(rec);else DB.tripKm[i]=rec;return rec;
 });
 if(!out.ok)throw new Error(out.error||'Not saved.');
 return out.value;
}
