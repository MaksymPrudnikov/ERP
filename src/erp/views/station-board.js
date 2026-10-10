/* =====================================================================
   view/station-board  ·  board-1.0
   Board — третья вкладка экрана станции: Scan · Queue · Board. Своя станция
   картинкой. Владелец, 9 октября 2026: «на третью вкладку кинул бы дашборд
   для визуального анализа, но так, чтобы он не влиял на сканирование —
   как правило, борды тяжёлые»; «не только строчки, но и визуально понятно».

   · Только эта станция: «полировка — только станция полировка, им не нужно
     видеть нагрузку других станций, каждый для себя; а для менеджера и
     офиса надо» (он же) — все станции вместе только в Overview офиса.
   · Считается, только когда вкладка открыта. Данные — из кэшей табло
     Production (prodBoard) и фактов работы (reports/facts): повторная
     отрисовка без новых сканов ничего не пересчитывает.
   · Скан с Board засчитывается и возвращает на Scan (stationSubmit).
   · Человек видит себя (You today) и итог станции без имён; долларов здесь
     нет — они в отчётах офиса.
   · Сегодня — сутки 0:00–24:00, часы — все 24: работают и через полночь,
     «никаких лимитов и блоков по времени».
   IN : prodBoard(), repWorkFacts(), DB.shipment, вошедший на станцию
   OUT: html
   ===================================================================== */
let stationBoardBuilds=0;

function stationBoardDay(offset){const d=new Date(),p=v=>String(v).padStart(2,'0');d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function stationBoardData(){
 stationBoardBuilds++;
 const today=finToday();
 return {today,orders:prodBoard(),facts:repWorkFacts().filter(f=>f.day===today)};
}
function stationBoardHours(list,label){
 const now=new Date().getHours();
 return chartColumns(Array.from({length:24},(_,h)=>{const n=list.filter(f=>f.hour===h).length;return {label:String(h),value:n,on:h===now,tick:h%3===0,title:h+':00 · '+n+' glass'};}),{label});
}
/* Мера работы — из работ станции: дюймы кромки, ft² работ, штуки; на
   сборке — собранные юниты. Пустая мера не показывается. */
function stationBoardMeasures(list){
 const sum=k=>list.reduce((n,f)=>n+(+f[k]||0),0),tiles=[chartStat('Glass',chNum(list.length))];
 const area=sum('area');if(area)tiles.push(chartStat('Glass ft²',chNum(area,1)));
 if(stationMergeCodes().includes(stationCode)){const u=new Set(list.filter(f=>f.unitDone&&f.asm).map(f=>f.asm)).size;tiles.push(chartStat('Units',chNum(u)));}
 const inches=sum('inches'),wf=sum('workFt2'),pcs=sum('pcs');
 if(inches)tiles.push(chartStat('Linear in',chNum(inches,0)));
 if(wf)tiles.push(chartStat('Work ft²',chNum(wf,1)));
 if(pcs)tiles.push(chartStat('Works, pcs',chNum(pcs,0)));
 return tiles;
}
/* 1. Станция: сколько ждёт здесь сейчас (на какой таре), сколько прошло
   здесь сегодня — всеми, без имён — и по часам. */
function stationBoardHere(d){
 const code=stationCode,here=d.facts.filter(f=>f.station===code),cut=code===stationCutCode();
 let waiting=0;const tare=new Set();
 d.orders.forEach(x=>{waiting+=x.counts[code]||0;Object.keys((x.onAt||{})[code]||{}).forEach(c=>{if(c)tare.add(c);});});
 const n=tare.size,word=[...tare].every(c=>/^S/.test(c))?(n===1?'skid':'skids'):(n===1?'dolly':'dollies');
 const tiles=[chartStat('Waiting here',chNum(waiting),cut?'in batches':n?'on '+n+' '+word:'',' data-board-waiting')].concat(stationBoardMeasures(here).map((t,i)=>i?t:chartStat('Done today',chNum(here.length),'glass · all shifts',' data-board-done')));
 return `<div class="card" data-board-here><div class="st-sec"><h3>${esc(code)} today</h3></div><div class="ch-stats">${tiles.join('')}</div>${here.length?stationBoardHours(here,code+' glass by hour'):''}</div>`;
}
/* 2. Ты сегодня: только вошедший человек на этой станции. */
function stationBoardMine(d,who){
 const mine=d.facts.filter(f=>f.station===stationCode&&f.personId===who.id);
 return `<div class="card" data-board-mine><div class="st-sec"><h3>You today</h3><span class="sp"></span><span class="mut" data-raw>${esc(who.name)}</span></div><div class="ch-stats">${stationBoardMeasures(mine).join('')}</div>${mine.length?stationBoardHours(mine,'Your glass by hour'):'<div class="mut">Nothing scanned here today.</div>'}</div>`;
}
/* 3. Горящее для этой станции: Critical и Rush, срок сегодня, завтра или
   уже прошёл — и только заказы, у которых стекло ждёт здесь или ещё придёт
   сюда. Сколько здесь, сколько в пути, сколько уже прошло здесь. */
function stationBoardDue(v,today){
 if(!v)return '<span class="mut">—</span>';
 if(v<today)return '<span class="sb-late">Overdue · '+esc(salesListShortDay(v))+'</span>';
 return v===today?'<b>Today</b>':v===stationBoardDay(1)?'Tomorrow':esc(salesListShortDay(v));
}
function stationBoardHot(d){
 const code=stationCode,soon=stationBoardDay(1);
 const hot=d.orders.map(x=>{const r=x.route[code]||{w:0,p:0,n:0};return {x,here:r.w,coming:Math.max(0,r.n-r.p-r.w),passed:r.p,of:r.n};})
  .filter(h=>(h.here||h.coming)&&(stationUrgency(h.x.o)>0||h.x.o.dueDate&&h.x.o.dueDate<=soon)).sort((a,b)=>a.x.rank-b.x.rank);
 const MAX=8,rows=hot.slice(0,MAX).map(h=>{const x=h.x,pct=h.of?Math.round(h.passed/h.of*100):0;
  return `<div class="sb-hot${x.o.priority==='critical'?' crit':''}" data-board-hot="${esc(x.o.businessNumber||'')}"><b class="mono">${esc(x.o.businessNumber||'')}</b><span class="sb-cust" data-raw>${esc(x.customer)}</span><span>${x.o.priority==='critical'?'<span class="pill bad">Critical</span>':x.o.priority==='rush'?'<span class="pill warn">Rush</span>':''}</span><span class="sb-due">${stationBoardDue(x.o.dueDate,d.today)}</span><span class="sb-at">${h.here?`<span class="sb-chip on">Here <b>${h.here}</b></span>`:''}${h.coming?`<span class="sb-chip">Coming <b>${h.coming}</b></span>`:''}</span><span class="sb-prog" title="${h.passed} of ${h.of} glass done here"><span class="ch-track"><i style="width:${pct}%"></i></span>${h.passed} / ${h.of} done</span></div>`;
 }).join('');
 return `<div class="card" data-board-hot-list><div class="st-sec"><h3>Hot</h3><span class="sp"></span><span class="mut">Critical · Rush · due by tomorrow</span></div>${rows||'<div class="mut">Nothing urgent for '+esc(code)+'.</div>'}${hot.length>MAX?`<div class="mut">+${hot.length-MAX} more</div>`:''}</div>`;
}
/* 4. Отгрузки сегодня — только станциям отгрузки (SHIPR, SHIP): PS на
   сегодня, сколько юнитов готово и погружено. */
function stationBoardShipRows(d){
 const list=(DB.shipment||[]).filter(s=>s.date===d.today&&s.status!=='cancelled').sort((a,b)=>String(a.departAt||'~').localeCompare(String(b.departAt||'~'))||a.number.localeCompare(b.number));
 return shippingWithCtx(()=>list.map(s=>{
  const st=shippingLoadState(s),ready=st.units.filter(u=>u.ready).length,truck=s.method==='delivery'?truckFind(s.truckId):null;
  const how=s.method==='pickup'?'Pickup':'Delivery'+(truck?' · '+esc(truck.name):'')+(s.departAt?' · '+esc(s.departAt):'');
  const state=s.status==='delivered'?(s.method==='pickup'?'Picked up':'Delivered'):s.status==='shipped'?'Shipped':`<b>${ready}</b> / ${st.units.length} ready${st.loaded.length?' · '+st.loaded.length+' loaded':''}`;
  return `<div class="sb-ship" data-board-ship="${esc(s.number)}"><span class="st-dchip">${esc(s.number)}</span><span><b data-raw>${esc(salesCustomerDisplay(s.customerId))}</b> <span class="mut">${how}</span></span><span>${state}</span></div>`;
 }).join(''));
}
function stationBoardShipping(d){
 const rows=stationBoardShipRows(d);
 return `<div class="card" data-board-shipping><div class="st-sec"><h3>Shipping today</h3></div>${rows||'<div class="mut">No packing slips today.</div>'}</div>`;
}
/* Отчёты, которые администратор поставил на эту станцию (Reports → Show
   on), — вкладками после «Now»; «This station» и «Me» — эта станция и
   вошедший человек. */
let stationBoardShow='';
function stationBoardSet(id){stationBoardShow=id||'';render();}
function stationBoardView(who){
 const reps=typeof repScreensFor==='function'?repScreensFor('stations',stationCode):[],cur=reps.some(r=>r.id===stationBoardShow)?stationBoardShow:'';
 const tabs=reps.length?'<div class="sb-tabs">'+repScreenTabs(reps,cur,'stationBoardSet')+'</div>':'';
 if(cur)return tabs+'<div class="sb-report">'+repScreenHTML(reps.find(r=>r.id===cur),{station:stationCode,person:who.name})+'</div>';
 const d=stationBoardData(),ship=stationIsShip()||stationIsReady();
 return tabs+'<div class="st-body sb"><div class="st-col">'+stationBoardHere(d)+stationBoardMine(d,who)+'</div><div class="st-col">'+stationBoardHot(d)+(ship?stationBoardShipping(d):'')+'</div></div>';
}
