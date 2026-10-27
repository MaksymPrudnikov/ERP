/* =====================================================================
   reports/facts-batches  ·  facts-1.0
   Батчи раскроя: что собрали в батч, сколько листов ушло, когда порезали.
   IN : DB.glassBatch — живые стёкла батча и их снимок (стекло, размер
        реза), раскрой батча — журнал листов Optimization → Sheets
        (sheetUsageRows), рез стекла — item.cutStartedAt (скан CUT)
   OUT: repBatchFacts() — строка: батч × стекло × заказ
   Правило: файл ничего не рисует.

   План отчётов, часть «этапы заказов + батчи» (владелец, 26.10.2026).
   Денег нет: Optimization их не видит.
   · Стекло — только живое (не снятое с батча); ft² — по размеру реза.
   · Листы, дни до первого и последнего реза — у батча и стекла, а не у
     заказа: они записаны в первой строке батча × стекла, сумма по заказам
     не умножается. Дни до последнего реза — когда всё стекло порезано.
   ===================================================================== */
let repBatchCache={stamp:'',rows:null};
function repBatchFacts(){
 /* Рез и снятие с батча пишутся в стекло батча на месте — метка считает их. */
 const stamp=readMemo('repBatchStamp',[DB.glassBatch,DB.cutPlan,DB.sheetBreak],()=>{
  const b=(DB.glassBatch||[]).map(x=>{let cut=0,off=0;x.items.forEach(i=>{if(i.cutStartedAt)cut++;if(i.releasedAt)off++;});return x.number+':'+x.items.length+':'+cut+':'+off;}).join(',');
  let undone=0;(DB.sheetBreak||[]).forEach(x=>{if(x.undoneAt)undone++;});
  return [b,(DB.cutPlan||[]).map(p=>p&&p.batch+(p.at||'')+(p.reset?'R':'')).join(','),(DB.sheetBreak||[]).length,undone].join('|');
 });
 if(repBatchCache.stamp===stamp&&repBatchCache.rows)return repBatchCache.rows;
 const sheets=new Map(),rows=[],mmOf=new Map();
 (typeof sheetUsageRows==='function'?sheetUsageRows():[]).forEach(r=>{
  const k=r.batch+'|'+r.glass;let s=sheets.get(k);if(!s)sheets.set(k,s={sheets:0,offcuts:0,sheetFt2:0,usedFt2:0,broken:0});
  if(r.stock)s.offcuts+=r.sheets;else s.sheets+=r.sheets;s.sheetFt2+=r.area;s.usedFt2+=r.used;s.broken+=r.broken;
 });
 (DB.glassBatch||[]).forEach(b=>{
  const live=glassBatchActiveItems(b);if(!live.length)return;
  const st=glassBatchStatus(b),status=SHEET_USAGE_STATUS[st]||st,built=b.createdAt||'',glass=new Map();
  live.forEach(i=>{
   const p=b.parts[i.part],sn=p.snapshot||{},code=sn.glass||'Unknown glass';
   let g=glass.get(code);if(!g)glass.set(code,g={orders:new Map(),first:'',last:'',all:true});
   if(i.cutStartedAt){if(!g.first||i.cutStartedAt<g.first)g.first=i.cutStartedAt;if(i.cutStartedAt>g.last)g.last=i.cutStartedAt;}else g.all=false;
   let r=g.orders.get(p.orderId);
   if(!r){const o=salesRecord(p.orderId);g.orders.set(p.orderId,r={orderId:p.orderId,order:o&&o.businessNumber||sn.order||'',customerId:o&&o.customerId||'',customerName:sn.customer||'',glassN:0,area:0,glassCut:0});}
   r.glassN++;if(sn.width>0&&sn.height>0)r.area+=sn.width*sn.height/144;if(i.cutStartedAt)r.glassCut++;
  });
  glass.forEach((g,code)=>{
   if(!mmOf.has(code)){const gp=glassProductByCode(code);mmOf.set(code,gp&&gp.thicknessMm||null);}
   const s=sheets.get(b.number+'|'+code)||{},day=repDay(built),days=at=>at&&day?Math.max(0,repDaysBetween(day,repDay(at))):null;
   [...g.orders.values()].forEach((r,n)=>rows.push(Object.assign(r,{id:b.number+'|'+code+'|'+r.orderId,at:built,built:day,batch:b.number,status,glass:code,mm:mmOf.get(code),
    first:n?'':g.first,last:n||!g.all?'':g.last,daysFirst:n?null:days(g.first),daysLast:n||!g.all?null:days(g.last),
    sheets:n?0:s.sheets||0,offcuts:n?0:s.offcuts||0,sheetFt2:n?0:s.sheetFt2||0,usedFt2:n?0:s.usedFt2||0,broken:n?0:s.broken||0})));
  });
 });
 repBatchCache={stamp,rows};
 return rows;
}
