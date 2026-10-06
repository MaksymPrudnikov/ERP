/* =====================================================================
   view/delivery  ·  Shipping PR 3, 6 октября 2026
   Shipping → Delivery: день → машины → остановки (PS) по порядку, у каждой
   время отбытия; PS этого дня без машины; самовывозы отдельным списком.
   Master Data → Trucks. Лист рейса на Letter — один или вместе с PS.
   Данные и команды — erp/shipping/delivery.
   ===================================================================== */
let deliveryDate='',deliveryNotice='';
function deliveryShownDate(){return shippingDateValid(deliveryDate)?deliveryDate:finToday();}
function deliverySetDate(v){deliveryDate=shippingDateValid(v)?v:'';deliveryNotice='';render();}
function deliveryRun(out){deliveryNotice=out.ok?'':out.error;render();}
/* На листе время — как пишут на доске: «8:00 AM», «11:30 AM». */
function deliveryTime(v){const m=/^(\d{2}):(\d{2})$/.exec(v||'');if(!m)return '—';const h=+m[1];return (h%12||12)+':'+m[2]+(h<12?' AM':' PM');}
function deliveryWeight(load){return (load.exact?'':'~')+docNum(load.kg,0)+' kg';}
function deliveryHTML(){
 const day=deliveryDay(deliveryShownDate()),date=day.date,users=(DB.user||[]).filter(u=>u.name),active=(DB.truck||[]).filter(t=>t.active);
 const status=s=>`<span class="pill">${shippingStatus(s)}</span>`,ps=s=>`<button type="button" class="sm" onclick="shippingGo('${esc(s.id)}')">${esc(s.number)}</button>`;
 const address=s=>esc(docAddressText(s.shipTo))||'<span class="mut">No address</span>';
 const head=`<div class="card delivery-day"><button type="button" class="sm" aria-label="Previous day" onclick="deliverySetDate(finAddDays('${date}',-1))">‹</button><input type="date" aria-label="Delivery day" value="${date}" onchange="deliverySetDate(this.value)"><button type="button" class="sm" aria-label="Next day" onclick="deliverySetDate(finAddDays('${date}',1))">›</button><button type="button" class="sm" onclick="deliverySetDate('')">Today</button><b>${esc(docDate(date))}</b></div>`;
 const trucks=day.trucks.map(({t,stops})=>{
  const loads=stops.map(deliveryLoad),kg=loads.reduce((n,l)=>n+l.kg,0),exact=loads.every(l=>l.exact),skids=loads.reduce((n,l)=>n+l.skids.length,0),driver=deliveryDriver(date,t.id);
  const rows=stops.map((s,i)=>{const locked=s.status==='delivered',load=loads[i];
   return `<tr data-stop="${esc(s.number)}"><td>${i+1}</td><td><input type="time" aria-label="Departs ${esc(s.number)}" value="${esc(s.departAt||'')}" ${locked?'disabled':''} onchange="deliveryRun(deliverySetTime('${esc(s.id)}',this.value))"></td><td>${ps(s)}</td><td><b>${esc(salesCustomerDisplay(s.customerId))}</b></td><td>${address(s)}</td><td>${esc(load.skids.join(', '))||'—'}</td><td>${deliveryWeight(load)}</td><td>${status(s)}</td><td class="delivery-acts">${locked?'':`<button type="button" class="sm" aria-label="Move ${esc(s.number)} up" ${i?'':'disabled'} onclick="deliveryRun(deliveryMove('${esc(s.id)}',-1))">▲</button><button type="button" class="sm" aria-label="Move ${esc(s.number)} down" ${i<stops.length-1?'':'disabled'} onclick="deliveryRun(deliveryMove('${esc(s.id)}',1))">▼</button><button type="button" class="sm" aria-label="Take ${esc(s.number)} off the truck" onclick="deliveryRun(deliveryAssign('${esc(s.id)}',''))">×</button>`}</td></tr>`;}).join('');
  return `<section class="card shipping-customer delivery-truck" data-truck="${esc(t.id)}"><div class="shipping-customer-head"><div><h3>${esc(t.name)}${t.active?'':' <span class="pill">inactive</span>'}</h3><span class="mut" data-truck-load>${shippingCount(stops.length,'stop')} · ${shippingCount(skids,'skid')} · ${(exact?'':'~')+docNum(kg,0)} kg</span></div><label>Driver<select aria-label="Driver ${esc(t.name)}" ${stops.length?'':'disabled'} onchange="deliveryRun(deliverySetDriver('${date}','${esc(t.id)}',this.value))"><option value="">Not set</option>${users.map(u=>`<option value="${esc(u.viewProfileId)}" ${driver&&driver.viewProfileId===u.viewProfileId?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><div class="row">${stops.length?`<button type="button" class="sm" data-trip-sheet onclick="deliveryPrint('${date}','${esc(t.id)}',false)">Trip sheet</button><button type="button" class="sm" data-trip-packet onclick="deliveryPrint('${date}','${esc(t.id)}',true)">With packing slips</button>`:''}</div></div>${stops.length?`<div class="sales-table-wrap"><table class="sl-table delivery-table"><thead><tr><th>#</th><th>Departs</th><th>Packing slip</th><th>Customer</th><th>Address</th><th>Skids</th><th>Weight</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="mut">No stops</p>'}</section>`;
 }).join('');
 const free=day.free.length?`<section class="card shipping-customer" data-delivery-free><h3>Not on a truck</h3><div class="sales-table-wrap"><table class="sl-table delivery-table"><thead><tr><th>Packing slip</th><th>Customer</th><th>Address</th><th>Skids</th><th>Weight</th><th>Status</th><th>Truck</th></tr></thead><tbody>${day.free.map(s=>{const load=deliveryLoad(s);return `<tr data-free="${esc(s.number)}"><td>${ps(s)}</td><td><b>${esc(salesCustomerDisplay(s.customerId))}</b></td><td>${address(s)}</td><td>${esc(load.skids.join(', '))||'—'}</td><td>${deliveryWeight(load)}</td><td>${status(s)}</td><td>${s.status==='delivered'?'':`<select aria-label="Truck for ${esc(s.number)}" onchange="deliveryRun(deliveryAssign('${esc(s.id)}',this.value))"><option value="">Choose truck</option>${active.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select>`}</td></tr>`;}).join('')}</tbody></table></div></section>`:'';
 const pickups=day.pickups.length?`<section class="card shipping-customer" data-delivery-pickups><h3>Pickups</h3>${day.pickups.map(s=>`<div class="delivery-pickup">${ps(s)}<b>${esc(salesCustomerDisplay(s.customerId))}</b><span class="mut">${shippingCount(s.items.length,'unit')}</span>${status(s)}</div>`).join('')}</section>`:'';
 const none=!active.length?'<div class="card empty">No trucks yet. Add them in Master Data → Trucks.</div>':!day.free.length&&!day.pickups.length&&!day.trucks.some(x=>x.stops.length)?'<div class="card empty">No packing slips for this day.</div>':'';
 return head+(deliveryNotice?`<div class="shipping-notice bad" role="alert">${esc(deliveryNotice)}</div>`:'')+none+free+trucks+pickups;
}
/* Лист рейса: что стоит в списке машины на момент печати. */
function deliveryPages(date,truckId){
 const t=truckFind(truckId),stops=deliveryStops(date,truckId),company=docCompanyBlock(),driver=deliveryDriver(date,truckId),pages=[];let P,y;
 const header=()=>{
  P=docPage();pages.push(P);P.text(36,44,docFit(company.name||'Glass Farm',13,true,320),{size:13,bold:true});
  P.text(576,44,'TRIP SHEET',{size:17,bold:true,align:'right'});P.text(576,64,docDate(date),{size:13,bold:true,align:'right'});
  P.text(36,70,docFit((t?t.name:'Truck')+' · Driver: '+(driver?driver.name:'not set'),12,true,380),{size:12,bold:true});y=104;
  P.rect(36,y-11,540,21,{fill:DOC_COLOR.bar});['#','Departs','Customer / address','Packing slip','Skids','Weight'].forEach((h,n)=>P.text([41,62,122,372,452,571][n],y+2,h,{size:7,bold:true,align:n===5?'right':'left'}));y+=25;
 };
 header();let total=0,exact=true,skids=0;
 stops.forEach((s,i)=>{
  const load=deliveryLoad(s),a=s.shipTo,place=docWrap([a.addressee,docAddressText(a)].filter(Boolean).join(' · ')||'No address',8,false,240),contact=[a.contact,a.phone].filter(Boolean).join(' · ');
  const lines=[salesCustomerDisplay(s.customerId)].concat(place,contact?[contact]:[]),sk=docWrap(load.skids.join(', ')||'—',8,false,70),h=Math.max(lines.length,sk.length,2)*11+14;
  if(y+h>720)header();
  P.text(41,y,String(i+1),{size:9,bold:true});P.text(62,y,deliveryTime(s.departAt),{size:9,bold:true});
  lines.forEach((text,k)=>P.text(122,y+k*11,docFit(text,k?8:9,!k,240),{size:k?8:9,bold:!k}));
  P.text(372,y,s.number,{size:9,bold:true});P.text(372,y+11,shippingCount(load.units,'unit'),{size:8,color:DOC_COLOR.mut});
  sk.forEach((text,k)=>P.text(452,y+k*11,text,{size:8}));P.text(571,y,deliveryWeight(load),{size:9,align:'right'});
  y+=h;P.line(36,y-6,576,y-6);total+=load.kg;exact=exact&&load.exact;skids+=load.skids.length;
 });
 if(!stops.length){P.text(41,y,'No stops',{size:9});y+=20;}
 P.text(576,y+10,shippingCount(stops.length,'stop')+' · '+shippingCount(skids,'skid')+' · '+(exact?'':'~')+docNum(total,0)+' kg',{size:10,bold:true,align:'right'});
 pages.forEach((p,n)=>p.text(576,766,'Trip sheet · '+(n+1)+' / '+pages.length,{size:8,align:'right',color:DOC_COLOR.mut}));return pages;
}
/* withPS — лист рейса и PS всех остановок одной пачкой; долг проверяется,
   как при печати каждого PS. Один лист ничего не записывает и не проверяет. */
function deliveryPrint(date,truckId,withPS){
 const stops=deliveryStops(date,truckId);if(!stops.length)return;
 if(!withPS){shippingShowPrint(deliveryPages(date,truckId));return;}
 shippingWithChecks(stops.flatMap(shippingOrderIds),'delivery',true,()=>{
  let pages;const out=storageCommand(()=>{pages=deliveryPages(date,truckId);deliveryStops(date,truckId).forEach(s=>{pages=pages.concat(shippingPrintRecord(s.id));});return true;});
  if(!out.ok){deliveryNotice=out.error;render();return;}
  render();shippingShowPrint(pages);
 });
}

/* ----------------------- Master Data → Trucks ----------------------- */
function viewMdTrucks(){
 const set=(t,field,value)=>`mdTruckSet('${esc(t.id)}','${field}',${value})`;
 const rows=(DB.truck||[]).map(t=>`<tr data-truck-row="${esc(t.id)}"${t.active?'':' class="mut"'}><td><input aria-label="Truck name" value="${esc(t.name)}" onchange="${set(t,'name','this.value')}" style="max-width:220px"></td><td><input aria-label="Note" value="${esc(t.note)}" placeholder="Note" onchange="${set(t,'note','this.value')}" style="max-width:260px"></td><td><label class="chk"><input type="checkbox" ${t.active?'checked':''} onchange="${set(t,'active','this.checked')}"> Active</label></td></tr>`).join('');
 return `<div class="sub">Own trucks for the delivery plan. The driver is picked for the day in Shipping → Delivery.</div>
  <div class="row" style="margin:0 0 12px"><button class="sm" data-truck-add onclick="mdTruckAdd()">+ Truck</button></div>
  <table><thead><tr><th>Name</th><th>Note</th><th>Active</th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="empty">No trucks yet</td></tr>'}</tbody></table>`;
}
function mdTruckAdd(){const out=truckAdd('');if(!out.ok)alert(out.error);render();}
function mdTruckSet(id,field,value){const out=truckSet(id,field,value);if(!out.ok)alert(out.error);render();}
