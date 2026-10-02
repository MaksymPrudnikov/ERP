/* =====================================================================
   erp/production/sheet-usage  ·  sheets-1.0
   Учёт листов: какие размеры листов ушли на батчи и какой отход.
   IN : собранные раскрои DB.cutPlan (erp/production/cut-layout),
        лопнувшие на столе листы DB.sheetBreak (erp/shopfloor/scan)
   OUT: строки журнала Optimization → Sheets; в базу ничего не пишет

   Владелец, 2 октября 2026: «после оптимизации батча хочу, чтобы был учёт,
   какие размеры листов были использованы и какой вейстедж». Размеры нужны:
   листы покупают по размерам, отход у размеров разный, а будущий склад целых
   листов будет списывать именно их. Цифры — те же, что в таблице размеров
   раскроя батча (cutSheetNumbers), своих формул здесь нет. Лопнувший лист —
   ещё один лист того же размера: он входит в ft² листов и целиком в отход.
   Батч без активных стёкол (Unbatched, Moved) в учёт не идёт: его раскрой
   резать уже нечего.
   ===================================================================== */
const SHEET_USAGE_STATUS={'Awaiting cutting':'Planned','Cutting started':'Cutting','Cutting complete':'Cut'};
/* Одна строка — батч × стекло × размер листа. Кусок со стеллажа (S-…) —
   своя строка: это не купленный лист. */
function sheetUsageRows(){
 const out=[];
 (DB.cutPlan||[]).forEach(plan=>{
  if(!plan||plan.reset||!Array.isArray(plan.groups))return;
  const b=glassBatchFind(plan.batch),status=b&&SHEET_USAGE_STATUS[typeof glassBatchStatus==='function'?glassBatchStatus(b):''];
  if(!status)return;
  plan.groups.forEach(g=>{
   const rows=new Map();
   const rowFor=(size,stock)=>{
    const w=cutRound(Math.max(+size.w,+size.h)),h=cutRound(Math.min(+size.w,+size.h)),key=stock||w+'x'+h;
    if(!rows.has(key))rows.set(key,{batch:plan.batch,built:plan.at||'',glass:g.glass,mm:g.mm,w,h,stock:stock||'',sheets:0,broken:0,area:0,used:0,net:0,keep:0,status});
    return rows.get(key);
   };
   g.sheets.forEach(s=>{
    const size=s.size||g.sheet,r=rowFor(size,/^S-/.test(size.key||'')?size.key:'');
    r.sheets++;r.area+=cutArea(size.w,size.h);r.used+=+s.used||0;r.net+=+s.net||0;r.keep+=+s.keep||0;
   });
   /* Размер лопнувшего листа записан в момент поломки; если лист с тем же
      номером и размером — кусок стока, ломается кусок, а не целый лист. */
   (DB.sheetBreak||[]).filter(x=>x&&x.batch===plan.batch&&x.glass===g.glass&&+x.w>0&&+x.h>0).forEach(x=>{
    const size={w:Math.max(+x.w,+x.h),h:Math.min(+x.w,+x.h)},sh=g.sheets.find(s=>s.no===x.sheet),z=sh&&(sh.size||g.sheet);
    const same=z&&Math.abs(Math.max(+z.w,+z.h)-size.w)<1e-6&&Math.abs(Math.min(+z.w,+z.h)-size.h)<1e-6&&/^S-/.test(z.key||'');
    const r=rowFor(size,same?z.key:''),a=cutArea(size.w,size.h);
    r.broken++;r.area+=a;r.net+=a;
   });
   rows.forEach(r=>{r.usedPct=cutPct(r.used,r.area);['area','used','net','keep'].forEach(k=>{r[k]=cutFt2(r[k]);});out.push(r);});
  });
 });
 return out;
}
