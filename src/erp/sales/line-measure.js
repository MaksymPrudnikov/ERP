/* =====================================================================
   sales/line-measure · measure-1.0
   Количества работ и площадь позиции записываются в строку при Save.
   Владелец, 27.10.2026: «каждый раз читать фигуру не имеет смысла, если при
   сохранении заказа мы уже получили данные». Сумма заказа — количество ×
   ставка; количества (дюймы кромки по лайтам, ft², штуки) каждый расчёт
   заново доставал из фигуры: ~5 расчётов фигуры на позицию, на годе 3 с из
   4,7 с первого расчёта всех сумм.
   IN : строка заказа, её makeup, наборы работ и прайс заказа, фигуры строки
        (DB.shapeDef); при Save — расчёт по фигуре (sales/service-sets,
        sales/line-metrics)
   OUT: line.measure {sig, rows, areas}; salesMeasureFor — записанное, если
        отпечаток сошёлся; salesMeasureWrite — запись заказа (Save, правка
        данных 9)

   Отпечаток (sig) — всё, что читает расчёт количеств из самого заказа:
   строка без полей учёта (батч, Hold, Cancel, количество, ставки, заметки),
   её makeup, наборы работ, клиент и прайс заказа, фигуры строки и лайтов.
   Не сошёлся — строку считают по фигуре, как раньше, а запишет её
   следующий Save. Справочники Master Data (стекло, ставки, прайсы клиента)
   в отпечаток не входят: сохранённый заказ от них не меняется (владелец,
   20.10.2026). При Save (пишется прайс заказа, salesBookRec) — всегда расчёт
   по фигуре: прайс заказа — ровно те цены, по которым он посчитан.
   ===================================================================== */
const SALES_MEASURE_SKIP=new Set(['measure','qty','chargePricing','priceManual','batchedAt','cutStartedAt','batchNo','batchManaged',
 'onHold','holdReason','holdAt','heldUnits','cancelledUnits','shipQueue','mark','notes','weightExtras']);
let salesMeasureOff=0;
/* Два независимых 32-битных хеша — 16 знаков. */
function salesMeasureHash(s){
 let a=2166136261,b=5381;
 for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619);b=(Math.imul(b,33)+c)|0;}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
/* Хеш части (makeup, фигура, прайс заказа) — один раз на объект за
   отрисовку: makeup общий у позиций заказа и длиннее самой строки. */
function salesMeasurePart(x){
 if(!x||typeof x!=='object')return JSON.stringify(x===undefined?null:x);
 const memo=readOn()?readMemo('salesMeasurePart',[],()=>new WeakMap()):null,hit=memo&&memo.get(x);if(hit)return hit;
 const h=salesMeasureHash(JSON.stringify(x));if(memo)memo.set(x,h);return h;
}
function salesMeasureSig(line,order){
 const own={};Object.keys(line).forEach(k=>{if(!SALES_MEASURE_SKIP.has(k))own[k]=line[k];});
 const shape=ref=>salesMeasurePart(ref&&ref.id?salesShapeByRef(ref):null),lites={};
 Object.keys(line.liteShapes||{}).sort().forEach(k=>{lites[k]=shape(line.liteShapes[k]);});
 const m=(order.makeups||[]).find(x=>x&&x.id===line.makeupId)||null;
 return salesMeasureHash(JSON.stringify([own,shape(line.shapeRef),lites,salesMeasurePart(m),order.customerId||'',salesMeasurePart(order.serviceSets||[]),salesMeasurePart(order.priceBook||{})]));
}
/* Расчёт по фигуре — то, что записывается. */
function salesMeasureLive(line,order){
 salesMeasureOff++;
 try{return finWithOrder(order,()=>({rows:salesLineChargeRowsRaw(line),areas:salesLineAreas(line,order)}));}
 finally{salesMeasureOff--;}
}
function salesMeasureWrite(order){
 (order&&order.lines||[]).forEach(l=>{const m=salesMeasureLive(l,order);l.measure={sig:salesMeasureSig(l,order),rows:m.rows,areas:m.areas};});
}
/* Отпечаток — один раз на строку за отрисовку (erp/read-scope): расчёт
   суммы спрашивает строки работ и площадь позиции несколько раз. */
function salesMeasureFor(line,order){
 if(salesMeasureOff||salesBookRec||!order||!line||!line.measure)return null;
 const memo=readOn()?readMemo('salesMeasureSig',[],()=>new WeakMap()):null,hit=memo&&memo.get(line);
 const sig=hit&&hit.order===order?hit.sig:salesMeasureSig(line,order);
 if(memo&&!hit)memo.set(line,{order,sig});
 if(sig!==line.measure.sig)return null;
 if(typeof window!=='undefined'&&window.GF_SCOPE_CHECK)salesMeasureCheck(line,order);
 return line.measure;
}
/* Тесты (GF_SCOPE_CHECK): каждое чтение записанного сверяется с расчётом по
   фигуре. */
function salesMeasureCheck(line,order){
 const now=salesMeasureLive(line,order),m=line.measure;
 if(JSON.stringify(now.rows)!==JSON.stringify(m.rows)||JSON.stringify(now.areas)!==JSON.stringify(m.areas))
  console.error('Stale measure: '+(order.businessNumber||order.id)+' · line '+line.id);
}
/* Запись переживает F5, Import и облако; битая — отбрасывается, строка
   считается по фигуре. */
function salesMeasureClean(m){
 if(!m||typeof m!=='object'||typeof m.sig!=='string'||!/^[0-9a-f]{16}$/.test(m.sig)||!Array.isArray(m.rows)||!m.areas||typeof m.areas!=='object')return null;
 if(!m.rows.every(r=>r&&typeof r==='object'&&typeof r.key==='string'&&Number.isFinite(r.basis)))return null;
 return {sig:m.sig,rows:m.rows,areas:m.areas};
}
const __salesMeasureNormalizeLine=normalizeSalesOrderLine;
normalizeSalesOrderLine=function(line){
 const out=__salesMeasureNormalizeLine(line),m=salesMeasureClean(line&&line.measure);
 if(m)out.measure=m;else delete out.measure;
 return out;
};
