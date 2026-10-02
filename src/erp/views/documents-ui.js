/* =====================================================================
   views/documents-ui  ·  documents-1.0
   Окно бланков заказа и вкладка Master Data → Company. Условия оплаты
   живут в карточке клиента (владелец, 14 сентября 2026), не в заказе.
   IN : открытый заказ soDraft, DB.company, DB.documentSettings
   OUT: Preview / Print / Email; сохранённый набор полей бланка
   Владелец, 14 сентября 2026: панель полей открывается только карандашом
   ✎ Customize — «а не каждый раз при открытии». Базовый набор уже отмечен,
   большинство бланков печатаются без панели.
   ===================================================================== */

let docState=null,docLastKind='proforma';

/* Квота печатается только бланком Quote, заказ — тремя бланками заказа. У
   квоты с ревизиями галочками выбирается, какие ревизии печатать и слать. */
function docKindsFor(o){return DOC_KINDS.filter(d=>salesIsQuote(o)?d.k==='quote':d.k!=='quote');}
/* Чертежи строк — не бланк, а своя вкладка окна (владелец, 26–27.09.2026):
   лист текущей строки крупно, лента мини-листов, печать — этот лист или все.
   focus — строка, с которой открыть окно (клик по форме строки в батче). */
function docOpen(kind,focus){
 if(!soDraft)return;
 const kinds=docKindsFor(soDraft).map(d=>d.k),q=salesIsQuote(soDraft);
 kind=kind==='drawings'||kinds.includes(kind)?kind:q?'quote':kinds.includes(docLastKind)?docLastKind:kinds[0];
 const cur=q?salesQuoteCurrentId():null;
 docState={kind,opts:kind==='drawings'?{}:docDefaultOptions(kind),panel:false,status:'',revs:cur?[cur]:[],cur,focus:focus||'',current:focus||'',drawings:null};
 render();
}
function docClose(){docState=null;render();}
function docSetKind(kind){
 if(!docState||!soDraft||!(kind==='drawings'||docKindsFor(soDraft).some(d=>d.k===kind)))return;
 if(kind!=='quote'&&kind!=='drawings')docLastKind=kind;
 docState.kind=kind;docState.opts=kind==='drawings'?{}:docDefaultOptions(kind);docState.status='';if(kind==='drawings')docState.panel=false;render();
}
function docTogglePanel(){if(!docState)return;docState.panel=!docState.panel;render();}
/* Галочка меняет только этот показ. В заказ ничего не пишется, а набор по
   умолчанию меняет лишь явная кнопка Save as default. */
function docSetOption(key,value){
 if(!docState)return;
 const o=Object.assign({},docState.opts);
 if(key==='priceMode')o.priceMode=value;else o[key]=!!value;
 docState.opts=docCleanOptions(docState.kind,o);docState.status='';render();
}
function docResetOptions(){if(!docState)return;docState.opts=docBaseOptions(docState.kind);docState.status='Base set restored.';render();}
function docSaveDefault(){
 if(!docState)return;
 DB.documentSettings=Object.assign({},DB.documentSettings,{[docState.kind]:docCleanOptions(docState.kind,docState.opts)});
 touch();docState.status='Saved as default for every '+docKindLabel(docState.kind)+'.';render();
}
function docQuoteRecords(){
 const ids=docState&&docState.revs||[];if(!ids.length)return [soDraft];
 const cur=salesQuoteCurrentId(),dirty=salesDraftHasWork();
 return ids.map(id=>id===cur&&dirty?soDraft:(DB.salesOrder||[]).find(o=>o.id===id)).filter(Boolean).sort((a,b)=>(a.quoteRev||0)-(b.quoteRev||0));
}
function docToggleRev(id,on){
 if(!docState)return;
 const s=new Set(docState.revs||[]);if(on)s.add(id);else s.delete(id);
 docState.revs=[...s];docState.status='';render();
}
function docCurrentPages(){
 if(docState.kind!=='quote')return docLayout(docBuildModel(docState.kind,soDraft,docState.opts));
 return docQuoteRecords().flatMap(r=>finWithOrder(r,()=>docLayout(docBuildModel('quote',r,docState.opts))));
}
function docRevisionPicker(){
 if(!docState||docState.kind!=='quote')return '';
 const cur=salesQuoteCurrentId(),ref=cur&&(DB.salesOrder||[]).find(o=>o.id===cur);if(!ref)return '';
 const ms=salesQuoteMembers(ref);if(ms.length<2)return '';
 return `<span class="doc-revs">Revisions ${ms.map(m=>`<label><input type="checkbox" data-doc-rev="${esc(m.id)}" ${(docState.revs||[]).includes(m.id)?'checked':''} onchange="docToggleRev('${esc(m.id)}',this.checked)"> ${esc(salesQuoteRevName(m))}</label>`).join('')}</span>`;
}
function docWarnings(){
 const out=[];if(docState.kind==='drawings')return '';
 if(!soDraft.businessNumber&&!salesQuoteCurrentId())out.push(salesIsQuote(soDraft)?'Save the quote to give the document its number.':'Save the order to give the document its number.');
 if(docState.kind==='quote'&&salesQuoteCurrentId()&&!(docState.revs||[]).length)out.push('Tick at least one revision to print or email.');
 if(!soDraft.customerId)out.push('No customer selected.');
 if(salesIsQuote(soDraft)&&docState.kind==='workOrder')out.push('This is a quote. Convert it to an order before sending a work order to the shop.');
 if(docState.kind!=='workOrder'){const t=salesOrderCommercialTotals(soDraft);if(!t.complete)out.push(t.missing+(t.missing>1?' items need':' item needs')+' pricing — totals are not complete.');}
 return out.map(x=>'<span class="warn">'+esc(x)+'</span>').join('');
}

function docModal(){
 if(!docState||!soDraft)return '';
 const drawings=docState.kind==='drawings',items=drawings?docDrawingItems():null;
 let pages=[],error='';
 if(!drawings)try{pages=docCurrentPages();}catch(e){error=e&&e.message||String(e);console.error(e);}
 const warn=docWarnings(),status=docState.status?'<span>'+esc(docState.status)+'</span>':'';
 const kinds=docKindsFor(soDraft).map(d=>`<button type="button" class="${d.k===docState.kind?'on':''}" onclick="docSetKind('${d.k}')">${d.label}</button>`).join('')+`<button type="button" class="${drawings?'on':''}" data-doc-kind="drawings" onclick="docSetKind('drawings')">Drawings</button>`;
 const tools=drawings?docDrawingTools(items):`<button type="button" class="doc-pen${docState.panel?' on':''}" aria-pressed="${docState.panel}" onclick="docTogglePanel()">✎ Customize</button>`;
 const body=drawings?docDrawingsBody(items):`<div class="doc-pages">${error?`<div class="err" style="display:block">${esc(error)}</div>`:pages.map(pg=>`<div class="doc-sheet">${docPageSVG(pg)}</div>`).join('')}</div>`;
 return `<div class="doc-back" onclick="if(event.target===this)docClose()"><div class="doc-window" role="dialog" aria-modal="true" aria-label="Documents">
  <div class="doc-bar"><b class="doc-title">Preview · ${docState.kind==='quote'?'Quote '+esc(salesQuoteBaseNumber(salesQuoteShown(soDraft))||'draft'):'Order '+esc(soDraft.businessNumber||'draft')}</b><div class="doc-kinds">${kinds}${docRevisionPicker()}</div><span class="doc-spacer"></span>
   ${tools}
   ${drawings?`<span class="doc-print-pick"><button type="button" data-doc-print onclick="docDrawingPrintMenu(event)">Print ▾</button><span class="doc-print-menu" data-doc-print-menu hidden></span></span>`:'<button type="button" data-doc-print onclick="docPrint()">Print</button><button type="button" onclick="docEmail()">Email</button>'}<button type="button" onclick="docClose()">Close</button></div>
  ${warn||status?`<div class="doc-status">${warn}${status}</div>`:''}
  <div class="doc-body${docState.panel&&!drawings?' with-panel':''}">${body}${docState.panel&&!drawings?docPanel():''}</div>
 </div></div>`;
}
/* ----------------------------- Чертежи ------------------------------ */
/* Лист — тот же, что уйдёт на печать (salesLineDrawing), в бумаге 850 × 1100,
   уменьшенной под окно (крупно) и под ленту (мини). Листы строятся один раз на открытие окна: пока
   оно открыто, заказ не правится, а 60 строк считались ~3 с на перерисовку. */
function docDrawingItems(){
 const done=docState.drawings||(docState.drawings=new Map());
 return (soDraft.lines||[]).map((l,i)=>{if(!done.has(l.id))done.set(l.id,salesLineDrawing(l));const d=done.get(l.id);return d?Object.assign({i},d):null;}).filter(Boolean);
}
function docDrawingName(x){return 'Line '+(x.i+1)+(x.line.mark?' · '+x.line.mark:'');}
function docDrawingNow(items){return items.find(x=>x.line.id===docState.current)||items[0]||null;}
function docDrawingTools(items){
 const now=docDrawingNow(items);
 return `<span class="doc-drawing-now" data-doc-drawing-now>${now?esc(docDrawingName(now))+' · '+(items.indexOf(now)+1)+' of '+items.length:''}</span>`;
}
/* Владелец, 27.09.2026: «скролл по листам влево и вправо, чтобы чертежи
   было видно в мини-формате и по номерам». Посередине — лист текущей строки
   крупно, по бокам ‹ ›, снизу лента мини-листов с номерами строк; стрелки
   ← → на клавиатуре. Переход меняет только лист, ленту и подпись — весь экран
   не перерисовывается (заказ на 60 строк рисуется ~2,5 с). */
function docDrawingZoom(){return Math.max(.25,Math.min(1,(Math.min(1280,window.innerWidth-36)-140)/850,(window.innerHeight-36-58-110-24)/1100));}
function docDrawingSheet(x){return !x?'':x.html?`<div class="print-sheet">${printSheetUniqueIds(x.html)}</div>`:`<div class="doc-drawing-error"><b>${esc(docDrawingName(x))}</b> ${esc(x.error)}</div>`;}
function docDrawingsBody(items){
 setTimeout(docDrawingsFit,0);
 if(!items.length)return '<div class="doc-drawings"><div class="empty">No drawings.</div></div>';
 const now=docDrawingNow(items),at=items.indexOf(now),many=items.length>1;
 const step=(d,label,sign,off)=>many?`<button type="button" class="doc-step" data-doc-${d} aria-label="${label}" title="${label} (${d==='prev'?'←':'→'})" ${off?'disabled':''} onclick="docDrawingStep(${sign})">${d==='prev'?'‹':'›'}</button>`:'';
 return `<div class="doc-drawings" data-doc-drawings>
  <div class="doc-stage">${step('prev','Previous drawing',-1,at<=0)}<figure class="doc-drawing" data-doc-drawing="${esc(now.line.id)}" style="zoom:${docDrawingZoom().toFixed(3)}">${docDrawingSheet(now)}</figure>${step('next','Next drawing',1,at>=items.length-1)}</div>
  ${many?`<div class="doc-film" data-doc-film>${items.map(x=>`<button type="button" class="doc-thumb${x===now?' on':''}" data-doc-thumb="${esc(x.line.id)}" title="${esc(docDrawingName(x))}" onclick="docDrawingGo('${esc(x.line.id)}')"><span class="doc-thumb-paper"><span class="doc-thumb-sheet">${x.html?docDrawingSheet(x):''}</span></span><b>${x.i+1}</b></button>`).join('')}</div>`:''}
 </div>`;
}
function docDrawingsFit(){
 document.querySelectorAll('.doc-drawings .print-sheet').forEach(el=>salesSheetFitDrawing(el));
 docDrawingFilmShow();docState&&(docState.focus='');
}
function docDrawingFilmShow(){const el=document.querySelector('.doc-thumb.on');if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest',inline:'center'});}
function docDrawingGo(id){
 if(!docState||docState.kind!=='drawings')return;
 const items=docDrawingItems(),x=items.find(i=>i.line.id===id),fig=document.querySelector('[data-doc-drawing]');if(!x||!fig)return;
 docState.current=id;const at=items.indexOf(x);
 fig.dataset.docDrawing=id;fig.innerHTML=docDrawingSheet(x);
 const sheet=fig.querySelector('.print-sheet');if(sheet)salesSheetFitDrawing(sheet);
 document.querySelectorAll('[data-doc-thumb]').forEach(el=>el.classList.toggle('on',el.dataset.docThumb===id));
 const prev=document.querySelector('[data-doc-prev]'),next=document.querySelector('[data-doc-next]');
 if(prev)prev.disabled=at<=0;if(next)next.disabled=at>=items.length-1;
 const label=document.querySelector('[data-doc-drawing-now]'),t=document.createElement('span');t.innerHTML=docDrawingTools(items);
 if(label)label.textContent=t.textContent;
 const m=document.querySelector('[data-doc-print-menu]');if(m)m.hidden=true;
 docDrawingFilmShow();
}
function docDrawingStep(d){
 if(!docState||docState.kind!=='drawings')return;
 const items=docDrawingItems(),at=items.indexOf(docDrawingNow(items)),x=items[Math.max(0,Math.min(items.length-1,at+d))];
 if(x)docDrawingGo(x.line.id);
}
document.addEventListener('keydown',e=>{
 if(!docState||docState.kind!=='drawings'||e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.target&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();docDrawingStep(e.key==='ArrowRight'?1:-1);}
});
/* Print у чертежей спрашивает: этот лист или все (владелец, 27.09.2026). */
function docDrawingPrintMenu(e){
 e.stopPropagation();
 const m=document.querySelector('[data-doc-print-menu]');if(!m)return;
 const items=docDrawingItems().filter(x=>x.html),now=docDrawingNow(docDrawingItems());
 m.innerHTML=(now&&now.html?`<button type="button" data-doc-print-one onclick="docDrawingsPrint('one')">This drawing · ${esc('Line '+(now.i+1))}</button>`:'')+`<button type="button" data-doc-print-all onclick="docDrawingsPrint('all')">All · ${items.length}</button>`;
 m.hidden=!m.hidden;
 if(!m.hidden)setTimeout(()=>document.addEventListener('click',()=>{m.hidden=true;},{once:true}),0);
}
function docDrawingsPrint(which){
 const items=docDrawingItems(),now=docDrawingNow(items);
 const sheets=(which==='one'?[now]:items).filter(x=>x&&x.html).map(x=>x.html);
 const m=document.querySelector('[data-doc-print-menu]');if(m)m.hidden=true;
 if(!sheets.length)return;
 if(printSheet(sheets,'',salesSheetFitDrawing)&&soDraft&&typeof orderLogAdd==='function')orderLogAdd(soDraft.id,'Printed','Drawings'+(sheets.length>1?' · '+sheets.length:''));
}
function docPanel(){
 const kind=docState.kind,o=docState.opts,groups=[];
 docFieldsFor(kind).forEach(f=>{let g=groups.find(x=>x.name===f.g);if(!g){g={name:f.g,fields:[]};groups.push(g);}g.fields.push(f);});
 const hint=h=>h?'<small>'+h+'</small>':'';
 const box=f=>`<label class="doc-opt"><input type="checkbox" data-doc-field="${f.k}" ${o[f.k]?'checked':''} onchange="docSetOption('${f.k}',this.checked)"><span>${f.label}${hint(f.hint)}</span></label>`;
 const body=groups.map(g=>{
  if(g.name!=='Prices on lines')return `<h4>${g.name}</h4>${g.fields.map(box).join('')}`;
  const modes=DOC_PRICE_MODES.map(m=>`<label class="doc-opt"><input type="radio" name="docPriceMode" data-doc-price="${m.k}" ${o.priceMode===m.k?'checked':''} onchange="docSetOption('priceMode','${m.k}')"><span>${m.label}${hint(m.hint)}</span></label>`).join('');
  return `<h4>${g.name}</h4>${modes}<div class="doc-opt-sub">${g.fields.map(box).join('')}</div>`;
 }).join('');
 return `<aside class="doc-panel"><div class="doc-panel-head"><b>✎ Customize · ${docKindLabel(kind)}</b><button type="button" aria-label="Close panel" onclick="docTogglePanel()">×</button></div>
  <p class="doc-panel-sub">Base set is ticked. Changes show on the left at once and apply to this print only.</p>${body}
  <div class="doc-panel-actions"><button type="button" onclick="docResetOptions()">Reset to base</button><button type="button" class="pri" onclick="docSaveDefault()">Save as default</button></div></aside>`;
}

/* ------------------------------ Печать ------------------------------ */
/* Листы печатаются теми же SVG, что в Preview: один лист Letter — одна
   страница, поля листа задаёт сам бланк (@page docsheet без полей). */
function docPrintHost(){let h=document.getElementById('docPrintHost');if(!h){h=document.createElement('div');h.id='docPrintHost';document.body.appendChild(h);}return h;}
function docPrintPrepare(){
 const pages=docCurrentPages(),host=docPrintHost();
 host.innerHTML=pages.map(pg=>`<div class="doc-print-page">${docPageSVG(pg)}</div>`).join('');
 document.body.classList.add('doc-printing');
 return pages.length;
}
function docPrintCleanup(){document.body.classList.remove('doc-printing');const h=document.getElementById('docPrintHost');if(h)h.innerHTML='';}
function docPrint(){
 if(!docState)return;
 if(docState.kind==='drawings'){docDrawingsPrint('all');return;}
 try{docPrintPrepare();}catch(e){alert('The document could not be prepared: '+(e&&e.message||e));return;}
 window.addEventListener('afterprint',docPrintCleanup,{once:true});
 setTimeout(docPrintCleanup,60000);
 try{window.print();}catch(e){docPrintCleanup();return;}
 if(soDraft&&typeof orderLogAdd==='function')orderLogAdd(soDraft.id,'Printed',docKindLabel(docState.kind));
}

/* ------------------------------ Email ------------------------------- */
/* Владелец пишет клиентам из Gmail в Chrome. Программа с диска не может
   вложить файл в чужую вкладку, поэтому PDF сохраняется в Загрузки, а Gmail
   открывается с готовым адресом, темой и текстом — файл перетаскивается. */
function docFileName(kind,order){return (docKindLabel(kind)+' '+(order.businessNumber||'draft')).replace(/[^A-Za-z0-9]+/g,'_')+'.pdf';}
function docDownload(name,bytes){
 const b=new Blob([bytes],{type:'application/pdf'}),a=document.createElement('a');
 a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function docEmailRecipient(){const C=salesFindCustomer(soDraft.customerId);return C?(C.invoiceEmail||customerPrimaryContact(C).email||''):'';}
function docEmailSubject(){
 const c=DB.company||{};
 return [docKindLabel(docState.kind)+' '+(soDraft.businessNumber||''),soDraft.customerPo?'PO '+soDraft.customerPo:'',c.legalName].map(x=>String(x).trim()).filter(Boolean).join(' · ');
}
function docEmailBody(){
 const c=DB.company||{},C=salesFindCustomer(soDraft.customerId),first=String((C&&customerPrimaryContact(C).name)||'').trim().split(/\s+/)[0];
 const lines=['Hello'+(first?' '+first:'')+',','','Please find attached '+docKindLabel(docState.kind).toLowerCase()+' '+(soDraft.businessNumber||'')+(soDraft.customerPo?' for PO '+soDraft.customerPo:'')+'.'];
 if(docState.kind!=='workOrder'){
  const t=salesOrderCommercialTotals(soDraft),terms=finTermsFor(soDraft),pct=paymentDepositPercent(terms),got=typeof finOrderPaid==='function'?finOrderPaid(soDraft.id).paid:0;
  if(t.complete){
   lines.push('Total: '+docMoney(t.grand)+' '+soDraft.currency+'.');
   if(got>0)lines.push('Received: '+docMoney(got)+'. Balance due: '+docMoney(Math.max(0,salesMoney(t.grand-got)))+'.');
   if(terms.paymentMode==='credit')lines.push('Payment terms: '+paymentTermsLabel(terms)+'.');
   else if(pct>0&&got<salesMoney(t.grand*pct/100))lines.push((docState.kind==='proforma'?'Deposit due now':'Deposit before production')+' ('+pct+'%): '+docMoney(salesMoney(t.grand*pct/100-got))+'.');
  }
  if(docState.kind==='confirmation')lines.push('Please check sizes, makeups and quantities, then sign and send the confirmation back.');
 }
 lines.push('','Thank you,',c.legalName||'');
 if(c.phone)lines.push(c.phone);
 return lines.join('\n');
}
function docEmailUrl(){
 const to=docEmailRecipient();
 return 'https://mail.google.com/mail/?view=cm&fs=1'+(to?'&to='+encodeURIComponent(to):'')+'&su='+encodeURIComponent(docEmailSubject())+'&body='+encodeURIComponent(docEmailBody());
}
function docEmail(){
 if(docState&&soDraft&&docState.kind==='quote'){docEmailQuote();return;}
 if(!docState||!soDraft)return;
 let bytes;
 try{bytes=docPdfBytes(docCurrentPages(),{title:docKindLabel(docState.kind)+' '+(soDraft.businessNumber||'draft')});}
 catch(e){alert('The PDF could not be prepared: '+(e&&e.message||e));return;}
 const file=docFileName(docState.kind,soDraft),to=docEmailRecipient();
 docDownload(file,bytes);
 if(typeof orderLogAdd==='function')orderLogAdd(soDraft.id,'Emailed',docKindLabel(docState.kind));
 const win=window.open(docEmailUrl(),'_blank');
 docState.status='PDF saved to Downloads as '+file+' — drag it into the Gmail message.'+(to?'':' The customer has no email: add Invoice Email in the customer card.')+(win?'':' The browser blocked the Gmail tab: allow pop-ups for this file.');
 render();
}

/* Квота: отмеченные ревизии уходят одним письмом, каждая своим PDF, и
   становятся Sent. Несохранённые правки сначала сохраняются — у отправленной
   ревизии они становятся следующей ревизией, отправленная не меняется. */
function docGmailUrl(to,subject,body){return 'https://mail.google.com/mail/?view=cm&fs=1'+(to?'&to='+encodeURIComponent(to):'')+'&su='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);}
function docQuoteEmailSubject(recs){
 const c=DB.company||{},po=recs[0].customerPo;
 return ['Quote '+recs.map(r=>r.businessNumber).join(', '),po?'PO '+po:'',c.legalName].map(x=>String(x||'').trim()).filter(Boolean).join(' · ');
}
function docQuoteEmailBody(recs){
 const c=DB.company||{},q=recs[0],C=salesFindCustomer(q.customerId),first=String((C&&customerPrimaryContact(C).name)||'').trim().split(/\s+/)[0];
 const terms=paymentTermsFrom(C||{}),pct=paymentDepositPercent(terms),many=recs.length>1,po=q.customerPo?' for PO '+q.customerPo:'';
 const lines=['Hello'+(first?' '+first:'')+',','',many?'Please find attached quote '+salesQuoteBaseNumber(q)+' in '+recs.length+' options: '+recs.map(r=>r.businessNumber).join(', ')+po+'.':'Please find attached quote '+q.businessNumber+po+'.'];
 recs.forEach(r=>{const t=finWithOrder(r,()=>salesOrderCommercialTotals(r));if(t.complete)lines.push((many?r.businessNumber+': ':'Total: ')+docMoney(t.grand)+' '+r.currency+'.');});
 lines.push('Prices are valid until '+docDate(salesQuoteValidUntil(q))+'.');
 if(terms.paymentMode==='credit')lines.push('Payment terms: '+paymentTermsLabel(terms)+'.');
 else if(pct>0)lines.push('A '+pct+'% deposit is required to start production.');
 lines.push(many?'Reply to this email with the option you choose, or ask us for changes.':'Reply to this email to accept the quote or to ask for changes.','','Thank you,',c.legalName||'');
 if(c.phone)lines.push(c.phone);
 return lines.join('\n');
}
function docEmailQuote(){
 const before=salesQuoteCurrentId(),cur=salesQuoteSettle();if(!cur||!docState)return;
 let ids=(docState.revs||[]).filter(id=>(DB.salesOrder||[]).some(o=>o.id===id));
 if(before!==cur)ids=ids.filter(id=>id!==before).concat(cur);
 if(!ids.length)ids=[cur];
 const recs=ids.map(id=>DB.salesOrder.find(o=>o.id===id)).sort((a,b)=>(a.quoteRev||0)-(b.quoteRev||0)),files=[];
 try{recs.forEach(r=>{const pages=finWithOrder(r,()=>docLayout(docBuildModel('quote',r,docState.opts)));files.push({name:docFileName('quote',r),bytes:docPdfBytes(pages,{title:'Quote '+r.businessNumber})});});}
 catch(e){alert('The PDF could not be prepared: '+(e&&e.message||e));return;}
 const C=salesFindCustomer(recs[0].customerId),to=C?(C.invoiceEmail||customerPrimaryContact(C).email||''):'';
 const url=docGmailUrl(to,docQuoteEmailSubject(recs),docQuoteEmailBody(recs));
 files.forEach(f=>docDownload(f.name,f.bytes));
 salesQuoteMarkSent(recs.map(r=>r.id));
 const win=window.open(url,'_blank'),keep=docState;
 salesOrderEdit(cur);
 docState=Object.assign(keep,{revs:recs.map(r=>r.id),cur:salesQuoteCurrentId(),
  status:(files.length>1?files.length+' PDFs saved to Downloads: ':'PDF saved to Downloads as ')+files.map(f=>f.name).join(', ')+' — drag '+(files.length>1?'them':'it')+' into the Gmail message. '+recs.map(r=>r.businessNumber).join(', ')+(recs.length>1?' are':' is')+' marked Sent.'+(to?'':' The customer has no email: add Invoice Email in the customer card.')+(win?'':' The browser blocked the Gmail tab: allow pop-ups for this file.')});
 render();
}

/* -------------------------- Master Data → Company -------------------- */
function viewMdCompany(){
 const c=DB.company;
 const f=(k,label,o)=>{o=o||{};const ph=o.ph?` placeholder="${esc(o.ph)}"`:'';
  return `<div${o.wide?' class="doc-company-wide"':''}><label>${label}</label>${o.area?`<textarea rows="${o.rows||3}" data-company="${k}"${ph} onchange="companySet('${k}',this.value)">${esc(c[k])}</textarea>`:`<input${o.type?` type="${o.type}"`:''} data-company="${k}" value="${esc(c[k])}"${ph} onchange="companySet('${k}',this.value)">`}</div>`;};
 return `<div class="sub">Company details for Quotes, Work orders, Proforma invoices and Order confirmations. Empty fields are not printed.</div>
 <div class="doc-company">
  <div class="doc-company-logo"><label>Logo</label><div class="doc-logo-box">${c.logo?`<img src="${c.logo}" alt="Company logo">`:'<span>No logo</span>'}</div>
   <div class="doc-logo-actions"><button type="button" onclick="document.getElementById('docLogoFile').click()">${c.logo?'Replace logo':'Upload logo'}</button>${c.logo?'<button type="button" onclick="companyRemoveLogo()">Remove</button>':''}</div>
   <input type="file" id="docLogoFile" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="companyLogoUpload(this)"><small>PNG or JPEG. Resized for printing and saved with the data.</small></div>
  <div class="doc-company-grid">${f('legalName','Legal name *')}${f('hstNumber','HST number',{ph:'123456789 RT0001'})}${f('address1','Address line 1')}${f('address2','Address line 2')}${f('city','City')}${f('province','Province')}${f('postalCode','Postal code')}${f('country','Country')}${f('phone','Phone')}${f('email','Email',{type:'email'})}${f('website','Website')}${f('depositPercent','Deposit for cash customers, %',{type:'number'})}${f('quoteValidDays','Quote valid for, days',{type:'number'})}${f('paymentInstructions','Payment instructions',{area:true,wide:true,ph:'e-Transfer to … · Cheque payable to …'})}${f('termsText','Terms and conditions',{area:true,rows:6,wide:true})}${f('footerText','Footer line on customer documents',{wide:true,ph:'Thank you for your business'})}</div>
 </div>`;
}
function companySet(k,v){
 if(!DB.company||!Object.prototype.hasOwnProperty.call(COMPANY_DEFAULT,k)||k==='logo')return;
 DB.company[k]=v;normalizeCompany();touch();render();
}
function companyRemoveLogo(){DB.company.logo='';touch();render();}
/* Логотип приводится к JPEG не больше 900 × 300 точек на белом фоне: у PNG
   прозрачность в JPEG стала бы чёрной, а крупная фотография съела бы место
   всей базы в браузере. */
function companyLogoJpeg(img){
 const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;if(!w||!h)return '';
 const s=Math.min(1,900/w,300/h),cw=Math.max(1,Math.round(w*s)),ch=Math.max(1,Math.round(h*s));
 const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
 const g=cv.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,cw,ch);g.drawImage(img,0,0,cw,ch);
 try{return cv.toDataURL('image/jpeg',.9);}catch(e){return '';}
}
function companyLogoUpload(input){
 const file=input.files&&input.files[0];input.value='';if(!file)return;
 const reader=new FileReader();
 reader.onload=()=>{
  const img=new Image();
  img.onload=()=>{
   const url=companyLogoJpeg(img);if(!url){alert('This image could not be used as a logo.');return;}
   DB.company.logo=url;normalizeCompany();
   if(!DB.company.logo)alert('The logo is too large even after resizing. Use a simpler image.');
   touch();render();
  };
  img.onerror=()=>alert('This file is not an image the browser can read.');
  img.src=reader.result;
 };
 reader.readAsDataURL(file);
}
