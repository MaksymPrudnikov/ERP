/* Shipping · план доставки (PR 3, 6 октября 2026).
   IN : DB.shipment (PS со способом Delivery) · DB.user (водитель)
   OUT: DB.truck {id, name, note, active} · у PS: truckId, driverId, departAt, stop
   Владелец: свои машины, нужен план на день и лист рейса водителю. Машина
   делает за день «0, 1, 2, 3, 4 рейса, зависит от дистанции»; на доске
   сейчас пишут «ABC morning 8:00, BCA 11:30 am» — время отбытия, и оно
   плавает (пробки). Поэтому рейса с номером нет: у машины на день список
   остановок по порядку, у каждой своё время отбытия, которое правят одним
   вводом. План ничего не блокирует — погрузка и PS живут по своим правилам. */
DEFAULT.truck=[];
function truckFind(id){return id?(DB.truck||[]).find(t=>t.id===id)||null:null;}
function truckAdd(name){return storageCommand(()=>{
 if(!Array.isArray(DB.truck))DB.truck=[];
 const t={id:salesUid('TRK'),name:String(name||'').trim().slice(0,60)||'Truck '+(DB.truck.length+1),note:'',active:true};DB.truck.push(t);return t;
});}
function truckSet(id,field,value){return storageCommand(()=>{
 const t=truckFind(id);shippingAssert(t,'Truck not found.');
 if(field==='name'){const v=String(value||'').trim().slice(0,60);shippingAssert(v,'Enter a truck name.');t.name=v;}
 else if(field==='note')t.note=String(value==null?'':value).slice(0,120);
 else if(field==='active')t.active=!!value;
 else shippingAssert(false,'Unknown field.');
 return t;
});}
function normalizeTrucks(){
 if(!Array.isArray(DB.truck))DB.truck=[];
 const seen=new Set();
 DB.truck=DB.truck.filter(t=>t&&typeof t==='object'&&salesRefId(t.id)&&!seen.has(t.id)&&(seen.add(t.id),true))
  .map(t=>({id:t.id,name:String(t.name==null?'':t.name).trim().slice(0,60)||'Truck',note:String(t.note==null?'':t.note).slice(0,120),active:t.active!==false}));
 /* Поля плана у PS: мусор и машину, которой больше нет, снимаем. */
 (DB.shipment||[]).forEach(s=>{
  if(!s||typeof s!=='object')return;
  if(!seen.has(s.truckId)){delete s.truckId;delete s.stop;delete s.driverId;delete s.departAt;return;}
  if(!Number.isSafeInteger(s.stop)||s.stop<1)s.stop=1;
  if(typeof s.driverId!=='string')delete s.driverId;
  if(!/^\d{2}:\d{2}$/.test(s.departAt||''))delete s.departAt;
 });
}
function validateTruckPayload(src){
 if(src&&Object.prototype.hasOwnProperty.call(src,'truck')&&!Array.isArray(src.truck))throw new Error('The "truck" field must be an array.');
}
/* Остановки машины за день — по порядку. */
function deliveryStops(date,truckId){
 return (DB.shipment||[]).filter(s=>shippingActive(s)&&s.method==='delivery'&&s.date===date&&s.truckId===truckId).sort((a,b)=>(a.stop||0)-(b.stop||0)||a.number.localeCompare(b.number));
}
function deliveryRenumber(date,truckId){deliveryStops(date,truckId).forEach((s,i)=>{s.stop=i+1;});}
function deliveryStop(id){const s=shippingFind(id);shippingAssert(s&&shippingActive(s)&&s.method==='delivery','Only a delivery packing slip goes on a truck.');shippingAssert(s.status!=='delivered','This packing slip is already delivered.');return s;}
/* truckId пустой — снять с машины. Новая остановка встаёт последней и берёт
   водителя, который уже стоит у этой машины в этот день. */
function deliveryAssign(id,truckId){return storageCommand(()=>{
 const s=deliveryStop(id),from=s.truckId||'';truckId=truckId||'';
 if(truckId){const t=truckFind(truckId);shippingAssert(t&&t.active,'Choose an active truck.');}
 if(from===truckId)return s;
 if(truckId){const mates=deliveryStops(s.date,truckId);s.truckId=truckId;s.stop=mates.length+1;if(mates.length&&mates[0].driverId)s.driverId=mates[0].driverId;else delete s.driverId;}
 else{delete s.truckId;delete s.stop;delete s.driverId;delete s.departAt;}
 if(from)deliveryRenumber(s.date,from);
 return s;
});}
function deliveryMove(id,dir){return storageCommand(()=>{
 const s=deliveryStop(id);shippingAssert(s.truckId,'Put the packing slip on a truck first.');
 const list=deliveryStops(s.date,s.truckId),i=list.indexOf(s),j=i+(dir<0?-1:1);if(j<0||j>=list.length)return s;
 list[i]=list[j];list[j]=s;list.forEach((x,n)=>{x.stop=n+1;});return s;
});}
function deliverySetTime(id,value){return storageCommand(()=>{
 const s=deliveryStop(id),v=String(value||'').trim();shippingAssert(!v||/^([01]\d|2[0-3]):[0-5]\d$/.test(v),'Enter the time as HH:MM.');
 if(v)s.departAt=v;else delete s.departAt;return s;
});}
function deliverySetDriver(date,truckId,driverId){return storageCommand(()=>{
 shippingAssert(truckFind(truckId),'Truck not found.');shippingAssert(!driverId||(DB.user||[]).some(u=>u.viewProfileId===driverId),'Driver not found.');
 deliveryStops(date,truckId).forEach(s=>{if(driverId)s.driverId=driverId;else delete s.driverId;});return true;
});}
function deliveryDriver(date,truckId){const s=deliveryStops(date,truckId).find(s=>s.driverId);return s?(DB.user||[]).find(u=>u.viewProfileId===s.driverId)||null:null;}
/* Сколько везёт остановка: скиды, юниты и вес по тем же строкам, что на PS. */
function deliveryLoad(s){
 const d=shippingDocument(s);let kg=0,exact=true;
 d.orders.forEach(o=>o.rows.forEach(r=>{if(!r.now)return;if(r.kg==null)exact=false;kg+=(r.kg==null?r.knownKg:r.kg)*r.now;}));
 return {skids:d.skids.map(k=>k.code),units:s.items.length,kg,exact};
}
function deliveryDay(date){
 const all=(DB.shipment||[]).filter(s=>shippingActive(s)&&s.date===date);
 return {date,trucks:(DB.truck||[]).filter(t=>t.active||all.some(s=>s.truckId===t.id)).map(t=>({t,stops:deliveryStops(date,t.id)})),
  free:all.filter(s=>s.method==='delivery'&&!truckFind(s.truckId)).sort((a,b)=>a.number.localeCompare(b.number)),pickups:all.filter(s=>s.method==='pickup').sort((a,b)=>a.number.localeCompare(b.number))};
}
