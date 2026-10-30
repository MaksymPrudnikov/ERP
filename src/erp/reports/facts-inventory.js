/* =====================================================================
   reports/facts-inventory  ·  facts-1.0
   Склад: пересчёты (было → стало, разница, причина), движения листов
   (приход, рез, слом, списание, добавление, поправка пересчётом) и расход
   материалов IGU по скану сборки.
   IN : DB.inventoryEvent (пересчёт листов), DB.consumableEvent (пересчёт
        расходников), DB.stockItemEvent (пересчёт Stock items, pcs), журнал листов invMoves (erp/inventory/sheets), сборки
        IGU consAssembled × рецепт юнита consPerUnit
        (erp/inventory/consumables), расход ушедших в архив
        DB.inventoryArchived.cons
   OUT: repCountFacts(), repSheetMoveFacts(), repIguMaterialFacts()
   Правило: файл ничего не рисует.

   План отчётов, часть «Склад» (владелец, 26.10.2026). Денег нет. Меры —
   каждая в своей единице и своей колонкой: листы — штуки и ft² (размер ×
   разница), рамка — ft, герметик, газ и части пакета — kg. Количество в
   единице строки (Difference, Quantity) там, где единицы разные, итога не
   даёт (unitBy).
   ===================================================================== */
/* Мера расходника — колонка по таблице: рамка в футах, остальное в кг. */
const REP_CONS_MEASURE={spacerVariant:'spacerFt',sealantProduct:'sealantKg',gasProduct:'gasKg',iguPart:'partsKg'};
function repConsMeasures(table,q){const out={spacerFt:0,sealantKg:0,gasKg:0,partsKg:0},k=REP_CONS_MEASURE[table];if(k&&Number.isFinite(q))out[k]=q;return out;}
/* Айтем расходника по ключу «таблица:id»: вид (CONS_TABLES), имя, единица. */
function repConsItem(key){
 const [t,...rest]=String(key||'').split(':'),id=rest.join(':'),tb=typeof CONS_TABLES!=='undefined'&&CONS_TABLES.find(x=>x[0]===t);if(!tb||!id)return null;
 const x=mdById(t,id);return {table:t,kind:tb[1],unit:tb[2],name:x?x.name:id};
}
function repConsNames(){return typeof CONS_TABLES==='undefined'?'':CONS_TABLES.map(t=>(DB[t[0]]||[]).map(x=>x&&x.id+'='+x.name).join()).join('|');}
function repConsTables(){return typeof CONS_TABLES==='undefined'?[]:CONS_TABLES.map(t=>DB[t[0]]);}

/* ---------------------------- Пересчёты ------------------------------
   Строка — одна строка пересчёта. Разница = стало − было: минус —
   недостача (Short), плюс — излишек (Over). Причины нет — «No reason». */
let repCountCache={stamp:'',rows:null};
function repCountFacts(){
 const stamp=readMemo('repCountStamp',[DB.inventoryEvent,DB.consumableEvent,DB.stockItemEvent,DB.stockItem].concat(repConsTables()),()=>[(DB.inventoryEvent||[]).length,(DB.consumableEvent||[]).length,(DB.stockItemEvent||[]).length,((DB.stockItemEvent||[]).slice(-1)[0]||{}).id,(DB.stockItem||[]).map(x=>x&&x.id+'='+x.name).join(),
  ((DB.inventoryEvent||[]).slice(-1)[0]||{}).id,((DB.consumableEvent||[]).slice(-1)[0]||{}).id,repConsNames()].join('|'));
 if(repCountCache.stamp===stamp&&repCountCache.rows)return repCountCache.rows;
 const rows=[],put=(e,r)=>{
  /* Расходник — дробный: тысячные, как «было» в записи (consCountSave). */
  const diff=Math.round((+e.qty||0)*1000)/1000;
  rows.push(Object.assign({id:e.id,at:e.at,day:repDay(e.at),person:e.by||'',glass:'',size:'',mm:null,was:e.before,counted:e.after,diff,
   dir:diff<0?'Short':diff>0?'Over':'Exact',off:diff?1:0,short:diff<0?1:0,over:diff>0?1:0,reason:e.reason||'No reason',note:e.note||'',
   sheets:0,sheetFt2:0,spacerFt:0,sealantKg:0,gasKg:0,partsKg:0,stockPcs:0},r));
 };
 (DB.inventoryEvent||[]).forEach(e=>{
  if(e.kind!=='count')return;const g=glassProductByCode(e.glass),size=invSizeText(e);
  put(e,{kind:'Sheets',material:e.glass+' · '+size,glass:e.glass,size,mm:g&&g.thicknessMm||null,unit:'sheets',sheets:+e.qty||0,sheetFt2:(+e.qty||0)*e.w*e.h/144});
 });
 (DB.consumableEvent||[]).forEach(e=>{
  const x=repConsItem(e.key);if(!x)return;
  put(e,Object.assign({kind:x.kind,material:x.name,unit:x.unit},repConsMeasures(x.table,Math.round((+e.qty||0)*1000)/1000)));
 });
 /* Stock items (двери и другое) — штуки, своей колонкой: с kg и ft не складываются. */
 (DB.stockItemEvent||[]).forEach(e=>{if(e.kind!=='count')return;const x=(DB.stockItem||[]).find(s=>s&&s.id===e.itemId);
  put(e,{kind:'Stock items',material:x?x.name:e.itemId,unit:'pcs',stockPcs:+e.qty||0});});
 repCountCache={stamp,rows};
 return rows;
}

/* ------------------------- Движения листов ---------------------------
   Журнал листов (invMoves) — только то, что меняет пирамиду: Build лишь
   занимает листы раскроя, куски S- и расходники — не листы (rackOnly).
   Причина — у пересчёта, списания и добавления (запись журнала склада). */
let repMoveCache={stamp:'',rows:null};
function repSheetMoveFacts(){
 const stamp=readMemo('repMoveStamp',[DB.stationScan,DB.sheetBreak,DB.cutPlan,DB.inventoryEvent,DB.purchaseReceipt,DB.productionUnbatch],()=>{
  let undone=0;(DB.stationScan||[]).forEach(s=>{if(s.undoneAt)undone++;});(DB.sheetBreak||[]).forEach(b=>{if(b.undoneAt)undone++;});
  return [(DB.stationScan||[]).length,undone,(DB.sheetBreak||[]).length,(DB.cutPlan||[]).map(p=>p&&p.batch+(p.at||'')+(p.reset?'R':'')).join(','),(DB.inventoryEvent||[]).length,
   (DB.purchaseReceipt||[]).map(r=>r.id+(r.updatedAt||'')+(r.voidAt||'')).join(','),(DB.productionUnbatch||[]).length].join('|');
 });
 if(repMoveCache.stamp===stamp&&repMoveCache.rows)return repMoveCache.rows;
 const ev=new Map((DB.inventoryEvent||[]).map(e=>[e.id,e])),rows=[];
 invMoves(true).forEach(m=>{
  if(m.rack==null)return;
  const n=+m.rack||0,ft=m.w&&m.h?m.w*m.h/144:0,e=ev.get(m.id),g=glassProductByCode(m.code),size=m.w?invSizeText(m):'Size missing';
  rows.push({id:m.id,at:m.at,person:m.by||'',kind:m.kind,dir:n>0?'In':n<0?'Out':'No change',glass:m.code,mm:g&&g.thicknessMm||null,size,sheet:m.code+' · '+size,
   ref:m.ref||'',batch:m.batch||'',reason:e?e.reason||'No reason':'',note:m.note||'',sheets:Math.abs(n),net:n,sIn:n>0?n:0,sOut:n<0?-n:0,
   area:Math.abs(n)*ft,netFt2:n*ft,ftIn:n>0?n*ft:0,ftOut:n<0?-n*ft:0});
 });
 repMoveCache={stamp,rows};
 return rows;
}

/* ----------------------- Материалы IGU по скану ----------------------
   Собранный юнит (consAssembled) × рецепт юнита позиции (consPerUnit) —
   то же, что склад расходников списывает (consRows): собранный и потом
   отменённый юнит — тоже расход. Строка — день × кто собрал × материал:
   за год это тысячи строк, а не сотни тысяч (юнит × материал). Units —
   юниты этого дня и человека, в которые материал ушёл; нормы нет —
   количество не считается, юнит идёт в «Units without norm».
   want — период графика (reports/query, repSelect): рецепт считается только
   у юнитов, собранных в периоде, — месяц на годе не ждёт расчёта всех
   позиций года. Рецепт позиции — тот же, что у склада (consPerUnitSaved).
   Ушедшее в архив (DB.inventoryArchived.cons) — итогом, без дня и
   человека: строка «Archived · total only», только без периода (All time).
   Отчёт, который подгрузил ушедшие заказы (erp/archive), видит их сборки
   по дням — их расход из итога архива вычитается, чтобы не посчитать
   дважды. */
let repIguCache={stamp:'',asm:null,sets:new Map()};
function repIguMaterialFacts(want){
 /* Нормы Data (consPerFresh) — в метке: правка рецепта меняет расход. */
 consPerFresh();
 const stamp=readMemo('repIguStamp',[DB.stationScan,DB.salesOrder],()=>{
  let undone=0;(DB.stationScan||[]).forEach(s=>{if(s.undoneAt||s.broken)undone++;});
  return [(DB.stationScan||[]).length,undone,(DB.salesOrder||[]).map(o=>o.id+(o.updatedAt||'')).join(','),JSON.stringify(DB.inventoryArchived&&DB.inventoryArchived.cons||{})].join('|');
 })+'|'+(typeof storageVisit!=='undefined'&&storageVisit.get('stationScan')?storageVisit.get('stationScan').size:0)+'|'+consPerNorms;
 if(repIguCache.stamp!==stamp)repIguCache={stamp,asm:null,sets:new Map()};
 const pick=want&&want.range&&want.df==='day'?want.range:null,key=pick?pick.join('~'):'all';
 if(repIguCache.sets.has(key))return repIguCache.sets.get(key);
 if(!repIguCache.asm)repIguCache.asm=consAssembled().map(a=>Object.assign(a,{day:repDay(a.at)}));
 const perOf=(o,l)=>{try{return consPerUnitSaved(l,o);}catch(e){return new Map();}};
 const visit=!pick&&typeof storageVisit!=='undefined'&&storageVisit.get('stationScan')||null,fromArchive=new Map(),groups=new Map(),rows=[];
 const row=(id,x,base)=>{let r=groups.get(id);if(!r){r=Object.assign({id,kind:x.kind,material:x.name,unit:x.unit,qty:0,units:0,missing:0,spacerFt:0,sealantKg:0,gasKg:0,partsKg:0},base);groups.set(id,r);rows.push(r);}return r;};
 repIguCache.asm.forEach(a=>{
  if(pick&&(!a.day||(pick[0]&&a.day<pick[0])||(pick[1]&&a.day>pick[1])))return;
  const o=salesRecord(a.orderId),l=o&&(o.lines||[]).find(x=>x.id===a.lineId);if(!l)return;
  const mine=visit&&visit.has(a.scan);
  perOf(o,l).forEach((q,k)=>{
   const x=repConsItem(k);if(!x)return;const ok=Number.isFinite(q),r=row(a.day+'|'+a.by+'|'+k,x,{day:a.day,person:a.by||'',record:'By scan'});
   r.units++;if(ok){r.qty+=q;r[REP_CONS_MEASURE[x.table]]+=q;}else r.missing++;
   if(mine){const f=fromArchive.get(k)||{used:0,unknown:0};if(ok)f.used+=q;else f.unknown++;fromArchive.set(k,f);}
  });
 });
 if(!pick)Object.entries(DB.inventoryArchived&&DB.inventoryArchived.cons||{}).forEach(([k,a])=>{
  const x=repConsItem(k);if(!x)return;const f=fromArchive.get(k)||{used:0,unknown:0};
  let used=(+a.used||0)-f.used;const unknown=Math.max(0,(+a.unknown||0)-f.unknown);if(Math.abs(used)<1e-6)used=0;if(!used&&!unknown)return;
  const r=row('ARCH|'+k,x,{day:'',person:'',record:'Archived · total only'});r.qty=used;r[REP_CONS_MEASURE[x.table]]=used;r.missing=unknown;
 });
 rows.forEach(r=>{r.norm=r.missing?'Norm missing':'Norm set';});
 repIguCache.sets.set(key,rows);
 return rows;
}
