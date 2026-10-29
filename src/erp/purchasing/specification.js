/* PO specification snapshots use the same glass/geometry/service readers
   as stickers and work orders. Selecting an order never verifies, batches
   or changes it. A missing catalogue glass can still be bought by text.
   The office uses existing Skip after receiving external glass. */
function purComponentLabel(c){return 'Lite '+c.lite+(c.ply?' · '+c.ply+' ply':'');}
/* Поставщику — Name, без нашего кода (владелец, 29.10.2026: «поставщики
   пусть будет имя тоже»). */
function purSpecComponent(o,l,c){
 const d=stkGlassData('final',o,l,c,1),route=stkRoute(o,l,c),g=d.glass;
 const glass=[g.name,g.mm?g.mm+' mm':'',g.heat,g.heatSoak?'Heat soak':'',g.surface?'Coating '+g.surface:'',...(g.paint||[])].filter(Boolean).join(' · ');
 return {key:c.key,label:purComponentLabel(c),glass,finished:d.finished,cut:d.cut,shape:d.shape,
  services:route.services.map(s=>s.text),missing:!g.code,raw:{pane:purClone(c.pane),spec:purClone(c.spec)}};
}
function purOrderComponentLine(orderId,lineId,key){
 const o=salesRecord(orderId),l=o&&(o.lines||[]).find(l=>l.id===lineId);if(!o||!l)return null;
 return finWithOrder(o,()=>{
  const cs=glassBatchComponents(o,l),chosen=key?cs.filter(c=>c.key===key):cs;if(!chosen.length)return null;
  const m=salesMakeupById(o,l.makeupId),parts=chosen.map(c=>purSpecComponent(o,l,c)),whole=!key;
  const spec={orderNumber:o.businessNumber,lineNumber:o.lines.indexOf(l)+1,mark:l.mark||'',part:whole?'Whole unit':purComponentLabel(chosen[0]),
   makeup:whole&&m?docMakeupFullLines(m,{glassNames:'name'}):[],parts,note:l.notes||'',capturedAt:new Date().toISOString()};
  return purLineClean({id:salesUid('PL'),kind:'order',orderId,lineId,componentKey:key||'',description:whole?(m?docMakeupShort(m,{glassNames:'name'}):'Whole unit'):parts[0].glass,
   unit:'each',priceUnit:'each',qty:l.qty,spec},0);
 });
}
function purSpecTexts(spec,opts){
 if(!spec)return [];
 const out=[],on=k=>!opts||opts[k]!==false;
 if(on('source'))out.push([spec.orderNumber,'Line '+spec.lineNumber,spec.mark,spec.part].filter(Boolean).join(' · '));
 if(on('makeup'))out.push(...(spec.makeup||[]));
 (spec.parts||[]).forEach(p=>{
  if(on('glass'))out.push(p.label+': '+p.glass);
  if(on('size')&&p.finished)out.push(p.label+' finished: '+p.finished.w+' × '+p.finished.h+' in');
  if(on('cutSize')&&p.cut)out.push(p.label+' before edgework: '+p.cut.w+' × '+p.cut.h+' in');
  if(on('services'))out.push(...p.services.map(s=>p.label+' · '+s));
 });
 if(on('notes')&&spec.note)out.push(spec.note);
 return out;
}
function purLinkedPurchases(orderId,lineId){
 return (DB.purchaseOrder||[]).filter(p=>!p.deletedAt&&p.state!=='cancelled').flatMap(p=>p.lines.filter(l=>l.orderId===orderId&&l.lineId===lineId).map(l=>({p,l})));
}
