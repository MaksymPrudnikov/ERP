/* =====================================================================
   erp/sales/quotes  ·  sales-quotes-1.0
   Ревизии квоты, отправка по Email, срок цен квоты.
   IN : квоты в DB.salesOrder, DB.company.quoteValidDays
   OUT: ревизии Q-10003-R1…, статус Sent, группа квоты в списке Sales
   Владелец, 15 сентября 2026: «иногда клиент просит квоту с разными
   ревизиями и потом выбирает, какая ему подходит — так что затирать версии
   не нужно»; номера — «квота Q1000 и к ней Q1000-R1 и Q1000-R2». Sent
   ставит только Email. Срок цен — около 180 дней, с возможностью поменять.
   Итоги выигрыша на главный экран не выносить: программа только записывает
   даты отправки и выигрыша и выбранную ревизию для будущего отчёта.
   Каждая ревизия — отдельная запись со своими строками и фигурами, поэтому
   цены, бланки и уборка фигур работают с ней как с обычным заказом.
   ===================================================================== */

/* Открытая на экране копия отправленной ревизии: номер той ревизии, с
   которой снята копия. Отправленная ревизия правкой не меняется — изменения
   сохраняются следующей ревизией. */
let soQuoteCopyOf=null;

function salesQuoteGroupId(o){return o?(o.quoteGroupId||o.id):'';}
function salesQuoteMembers(o){
 const g=salesQuoteGroupId(o);if(!g)return [];
 return (DB.salesOrder||[]).filter(x=>salesIsQuote(x)&&salesQuoteGroupId(x)===g).sort((a,b)=>(a.quoteRev||0)-(b.quoteRev||0));
}
function salesQuoteWonMember(o){return salesQuoteMembers(o).find(m=>m.status==='won')||null;}
function salesQuoteRepresentative(o){const ms=salesQuoteMembers(o);return ms.find(m=>m.status==='won')||ms[ms.length-1]||o;}
function salesQuoteGroupStatus(o){const ms=salesQuoteMembers(o);return ms.some(m=>m.status==='won')?'won':ms.some(m=>m.status==='sent')?'sent':'open';}
function salesListStatus(o){return salesIsQuote(o)?salesQuoteGroupStatus(o):o.status;}
function salesQuoteBaseNumber(o){
 const base=salesQuoteMembers(o).find(m=>!m.quoteRev);
 return base&&base.businessNumber?base.businessNumber:String(o&&o.businessNumber||'').replace(/-R\d+$/,'');
}
function salesQuoteRevName(m){return m&&m.quoteRev?'R'+m.quoteRev:(m&&m.businessNumber||'Quote');}
function salesQuoteNextRev(o){return salesQuoteMembers(o).reduce((n,m)=>Math.max(n,m.quoteRev||0),0)+1;}
function salesQuoteCurrentId(){return soQuoteCopyOf||(soEdit&&soEdit!=='new'?soEdit:null);}
function salesQuoteCopySource(){return soQuoteCopyOf?(DB.salesOrder||[]).find(x=>x.id===soQuoteCopyOf)||null:null;}
function salesQuoteShown(o){if(o&&o===soDraft){const s=salesQuoteCopySource();if(s)return s;}return o;}
function salesQuoteNextRevName(){const s=salesQuoteCopySource();return s?'R'+salesQuoteNextRev(s):'';}
function salesQuoteOpensAsCopy(o){return salesIsQuote(o)&&o.status==='sent'&&!salesQuoteWonMember(o);}

/* ---------------------------- Срок цен ---------------------------------- */
function salesQuoteValidDays(){const d=DB.company&&DB.company.quoteValidDays;return Number.isFinite(+d)&&+d>0?+d:180;}
function salesAddDays(iso,days){
 const t=new Date(iso||Date.now()),p=v=>String(v).padStart(2,'0');if(isNaN(t))return '';
 t.setDate(t.getDate()+days);return t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate());
}
/* Дата не задана руками — срок считается от отправки; не отправлена — от
   сегодняшнего дня, как будет, если отправить сейчас. */
function salesQuoteValidUntil(o){return o&&o.validUntil||salesAddDays(o&&o.sentAt||new Date().toISOString(),salesQuoteValidDays());}

/* ----------------------------- Копия ------------------------------------ */
/* Копия записи: новые номера строк и свои копии фигур, чтобы правка фигуры
   копии не переписала оригинал. Нужна ревизии, копии отправленной ревизии и
   заказу из квоты. */
function salesCopySalesRecord(src,fields){
 const copy=JSON.parse(JSON.stringify(src));Object.assign(copy,{id:salesUid('SO')},fields||{});
 copy.lines.forEach(line=>{
  const oldId=line.id;line.id=salesUid('SOL');line.batchedAt='';
  const clone=ref=>{const s=salesShapeByRef(ref);if(!s)return ref;const c=JSON.parse(JSON.stringify(s));c.id=salesUid('SHP');if(c.ownerLineId===oldId)c.ownerLineId=line.id;DB.shapeDef.push(c);return Object.assign({},ref,{id:c.id});};
  line.shapeRef=clone(line.shapeRef);
  Object.keys(line.liteShapes||{}).forEach(k=>{line.liteShapes[k]=clone(line.liteShapes[k]);});
 });
 return copy;
}
function salesQuoteWorkingCopy(src){
 const now=new Date().toISOString();
 return salesCopySalesRecord(src,{businessNumber:'',status:'open',sentAt:'',statusDates:{},quoteGroupId:salesQuoteGroupId(src),quoteRev:0,wonOrderId:'',createdAt:now,updatedAt:now});
}
/* Содержание квоты без номеров записей и строк: фигура сравнивается своим
   видом, а не номером — у копии номера фигур другие. */
function salesQuoteContentKey(o){
 const shape=ref=>{const s=salesShapeByRef(ref);if(!s)return null;const c=JSON.parse(JSON.stringify(s));['id','ownerLineId','revision','createdAt','updatedAt'].forEach(k=>{delete c[k];});return c;};
 const n=normalizeSalesOrder(JSON.parse(JSON.stringify(o)));
 const lines=n.lines.map(l=>{const c=JSON.parse(JSON.stringify(l));delete c.id;delete c.batchedAt;c.shapeRef=shape(l.shapeRef);c.liteShapes={};Object.keys(l.liteShapes||{}).forEach(k=>{c.liteShapes[k]=shape(l.liteShapes[k]);});return c;});
 return JSON.stringify({customerId:n.customerId,customerPo:n.customerPo,dueDate:n.dueDate,priority:n.priority,branch:n.branch,delivery:n.delivery,currency:n.currency,notes:n.notes,validUntil:n.validUntil,
  servicePricing:n.servicePricing,orderCharges:n.orderCharges,makeups:n.makeups,extraItems:n.extraItems,serviceSets:n.serviceSets,lines});
}
/* Квота на экране записана: несохранённые правки сохраняются (у отправленной
   ревизии — новой ревизией). Возвращает номер записи того, что на экране. */
function salesQuoteSettle(){
 if(!soDraft||!salesIsQuote(soDraft))return null;
 if(soQuoteCopyOf&&!salesDraftHasWork())return soQuoteCopyOf;
 if(soEdit==='new'||salesDraftHasWork()){if(!salesOrderSave())return null;}
 return soEdit&&soEdit!=='new'?soEdit:null;
}

/* ---------------------------- Действия ---------------------------------- */
function salesQuoteOpenRevision(id){
 if(id===salesQuoteCurrentId())return;
 if(salesDraftHasWork()&&!confirm('Leave this revision without saving the changes?'))return;
 salesOrderEdit(id);
}
function salesQuoteNewRevision(){
 if(!soDraft||!salesIsQuote(soDraft)||salesQuoteWonMember(soDraft))return;
 const cur=salesQuoteSettle();if(!cur)return;
 const src=DB.salesOrder.find(o=>o.id===cur);if(!src)return;
 const now=new Date().toISOString(),rev=salesQuoteNextRev(src);
 const copy=salesCopySalesRecord(src,{businessNumber:salesQuoteBaseNumber(src)+'-R'+rev,status:'open',sentAt:'',validUntil:'',statusDates:{open:now},
  quoteGroupId:salesQuoteGroupId(src),quoteRev:rev,wonOrderId:'',fromQuoteId:'',createdAt:now,updatedAt:now});
 DB.salesOrder.push(normalizeSalesOrder(copy));normalizeSalesData();touch();
 salesOrderEdit(copy.id);
}
function salesQuoteMarkSent(ids){
 const now=new Date().toISOString(),days=salesQuoteValidDays();
 (ids||[]).forEach(id=>{
  const r=(DB.salesOrder||[]).find(o=>o.id===id);if(!r||!salesIsQuote(r)||r.status==='won')return;
  r.status='sent';r.sentAt=now;r.statusDates=Object.assign({},r.statusDates,{sent:now});
  if(!r.validUntil)r.validUntil=salesAddDays(now,days);
  r.updatedAt=now;
 });
 touch();
}
function salesQuoteDeleteGroup(o){
 const ms=salesQuoteMembers(o);if(!ms.length)return;
 if(!confirm(ms.length>1?'Delete quote '+salesQuoteBaseNumber(o)+' and all '+ms.length+' revisions?':'Delete this quote?'))return;
 const ids=new Set(ms.map(m=>m.id));
 DB.salesOrder=DB.salesOrder.filter(x=>!ids.has(x.id));
 if((soEdit&&ids.has(soEdit))||(soQuoteCopyOf&&ids.has(soQuoteCopyOf))){soEdit=null;soDraft=null;soQuoteCopyOf=null;}
 salesPruneOrphanShapes();touch();render();
}

/* ------------------------------ Экран ----------------------------------- */
function salesQuoteRevState(m){
 if(m.status==='won'){const w=(DB.salesOrder||[]).find(x=>x.id===m.wonOrderId);return 'Won'+(w&&w.businessNumber?' → '+w.businessNumber:'');}
 return m.status==='sent'?'Emailed '+salesShortDate(m.sentAt):'Not sent';
}
function salesQuoteTotalText(m){const t=finOrderTotals(m);return t.complete?docMoney(t.grand):'price incomplete';}
function salesQuoteRevisionBar(shown){
 if(!shown||!(DB.salesOrder||[]).some(x=>x.id===shown.id))return '';
 const ms=salesQuoteMembers(shown),won=ms.some(m=>m.status==='won');
 return `<div class="quote-revs"><span>Revisions</span>${ms.map(m=>`<button type="button" class="quote-rev${m.id===shown.id?' on':''}" data-quote-rev="${esc(m.id)}" onclick="salesQuoteOpenRevision('${esc(m.id)}')"><b>${esc(salesQuoteRevName(m))}</b><small>${esc(salesQuoteRevState(m))} · ${esc(salesQuoteTotalText(m))}</small></button>`).join('')}${won?'':`<button type="button" class="quote-rev add" data-quote-new-rev onclick="salesQuoteNewRevision()"><b>+ New revision</b><small>copy of ${esc(salesQuoteRevName(shown))}</small></button>`}</div>`;
}
function salesQuoteSentBanner(){
 const s=salesQuoteCopySource();if(!s)return '';
 return `<div class="quote-sent-banner">🔒 <b>${esc(salesQuoteRevName(s))} was emailed ${esc(salesShortDate(s.sentAt))} and stays exactly as sent.</b> Change anything here and it is saved as <b>R${salesQuoteNextRev(s)}</b>.</div>`;
}
function salesQuoteGroupPill(o){
 const ms=salesQuoteMembers(o),more=ms.length>1?' · '+ms.length+' revisions':'',w=ms.find(m=>m.status==='won');
 if(w){const ord=(DB.salesOrder||[]).find(x=>x.id===w.wonOrderId);return `<span class="pill st-won">Won${w.quoteRev?' · R'+w.quoteRev:''}${ord&&ord.businessNumber?' → '+esc(ord.businessNumber):''}</span>`;}
 const sent=ms.filter(m=>m.status==='sent').map(m=>m.sentAt).sort().pop();
 /* В строке списка дата без года: длинная надпись сжимала колонки. */
 if(sent)return `<span class="pill st-sent">Sent ${esc(salesShortDate(sent).replace(/, \d{4}$/,''))}${more}</span>`;
 return `<span class="pill st-open">Not sent${more}</span>`;
}
