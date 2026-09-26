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
/* Чертежи строк — не бланк, а своя вкладка окна (владелец, 26.09.2026):
   мокапы всех строк, галочками — какие печатать. focus — строка, к которой
   прокрутить окно (клик по форме строки в батче). */
function docOpen(kind,focus){
 if(!soDraft)return;
 const kinds=docKindsFor(soDraft).map(d=>d.k),q=salesIsQuote(soDraft);
 kind=kind==='drawings'||kinds.includes(kind)?kind:q?'quote':kinds.includes(docLastKind)?docLastKind:kinds[0];
 const cur=q?salesQuoteCurrentId():null;
 docState={kind,opts:kind==='drawings'?{}:docDefaultOptions(kind),panel:false,status:'',revs:cur?[cur]:[],cur,skip:[],focus:focus||''};
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
 const drawings=docState.kind==='drawings';
 let pages=[],error='';
 if(!drawings)try{pages=docCurrentPages();}catch(e){error=e&&e.message||String(e);console.error(e);}
 const warn=docWarnings(),status=docState.status?'<span>'+esc(docState.status)+'</span>':'';
 const kinds=docKindsFor(soDraft).map(d=>`<button type="button" class="${d.k===docState.kind?'on':''}" onclick="docSetKind('${d.k}')">${d.label}</button>`).join('')+`<button type="button" class="${drawings?'on':''}" data-doc-kind="drawings" onclick="docSetKind('drawings')">Drawings</button>`;
 const tools=drawings?docDrawingTools():`<button type="button" class="doc-pen${docState.panel?' on':''}" aria-pressed="${docState.panel}" onclick="docTogglePanel()">✎ Customize</button>`;
 const body=drawings?docDrawingsBody():`<div class="doc-pages">${error?`<div class="err" style="display:block">${esc(error)}</div>`:pages.map(pg=>`<div class="doc-sheet">${docPageSVG(pg)}</div>`).join('')}</div>`;
 return `<div class="doc-back" onclick="if(event.target===this)docClose()"><div class="doc-window" role="dialog" aria-modal="true" aria-label="Documents">
  <div class="doc-bar"><b class="doc-title">Preview · ${docState.kind==='quote'?'Quote '+esc(salesQuoteBaseNumber(salesQuoteShown(soDraft))||'draft'):'Order '+esc(soDraft.businessNumber||'draft')}</b><div class="doc-kinds">${kinds}${docRevisionPicker()}</div><span class="doc-spacer"></span>
   ${tools}
   <button type="button" data-doc-print onclick="docPrint()">Print</button>${drawings?'':'<button type="button" onclick="docEmail()">Email</button>'}<button type="button" onclick="docClose()">Close</button></div>
  ${warn||status?`<div class="doc-status">${warn}${status}</div>`:''}
  <div class="doc-body${docState.panel&&!drawings?' with-panel':''}">${body}${docState.panel&&!drawings?docPanel():''}</div>
 </div></div>`;
}
/* ----------------------------- Чертежи ------------------------------ */
/* Мокап — тот же лист, что уйдёт на печать (salesLineDrawing), в уменьшенной
   бумаге. Галочка снимается без перерисовки окна: листов может быть много. */
function docDrawingItems(){return (soDraft.lines||[]).map((l,i)=>{const d=salesLineDrawing(l);return d?Object.assign({i},d):null;}).filter(Boolean);}
function docDrawingPicked(items){const skip=new Set(docState.skip||[]);return items.filter(x=>x.html&&!skip.has(x.line.id));}
function docDrawingTools(){
 const items=(soDraft.lines||[]).filter(l=>salesShapeByRef(l.shapeRef)),skip=new Set(docState.skip||[]),n=items.filter(l=>!skip.has(l.id)).length;
 return `<span class="doc-drawing-count" data-doc-drawing-count>${n} of ${items.length}</span><button type="button" onclick="docDrawingAll(true)">All</button><button type="button" onclick="docDrawingAll(false)">None</button>`;
}
function docDrawingsBody(){
 const items=docDrawingItems(),skip=new Set(docState.skip||[]);
 setTimeout(docDrawingsFit,0);
 if(!items.length)return '<div class="doc-drawings"><div class="empty">No drawings.</div></div>';
 return `<div class="doc-drawings">${items.map(x=>{const id=esc(x.line.id),on=!!x.html&&!skip.has(x.line.id);
  return `<figure class="doc-drawing${on?' on':''}" data-doc-drawing="${id}">
   <label class="doc-drawing-head"><input type="checkbox" ${x.html?'':'disabled'} ${on?'checked':''} onchange="docDrawingToggle('${id}',this.checked)"><b>Line ${x.i+1}</b><span>${esc(x.line.mark||'')}</span></label>
   <div class="doc-drawing-paper">${x.html?`<div class="doc-drawing-scale"><div class="print-sheet">${printSheetUniqueIds(x.html)}</div></div>`:`<div class="doc-drawing-error">${esc(x.error)}</div>`}</div></figure>`;}).join('')}</div>`;
}
function docDrawingsFit(){
 document.querySelectorAll('.doc-drawing .print-sheet').forEach(el=>salesSheetFitDrawing(el));
 const f=docState&&docState.focus;if(!f)return;docState.focus='';
 const el=[...document.querySelectorAll('[data-doc-drawing]')].find(x=>x.dataset.docDrawing===f);
 if(el){el.scrollIntoView({block:'center'});el.classList.add('focus');}
}
function docDrawingCount(){const el=document.querySelector('[data-doc-drawing-count]'),t=document.createElement('span');t.innerHTML=docDrawingTools();if(el)el.textContent=t.querySelector('[data-doc-drawing-count]').textContent;}
function docDrawingToggle(id,on){
 if(!docState)return;
 const s=new Set(docState.skip||[]);if(on)s.delete(id);else s.add(id);docState.skip=[...s];
 const el=[...document.querySelectorAll('[data-doc-drawing]')].find(x=>x.dataset.docDrawing===id);if(el)el.classList.toggle('on',!!on);
 docDrawingCount();
}
function docDrawingAll(on){if(!docState)return;docState.skip=on?[]:(soDraft.lines||[]).map(l=>l.id);docState.status='';render();}
function docDrawingsPrint(){
 const sheets=docDrawingPicked(docDrawingItems()).map(x=>x.html);
 if(!sheets.length){docState.status='Tick at least one drawing.';render();return;}
 docState.status='';printSheet(sheets,'',salesSheetFitDrawing);
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
 if(docState.kind==='drawings'){docDrawingsPrint();return;}
 try{docPrintPrepare();}catch(e){alert('The document could not be prepared: '+(e&&e.message||e));return;}
 window.addEventListener('afterprint',docPrintCleanup,{once:true});
 setTimeout(docPrintCleanup,60000);
 try{window.print();}catch(e){docPrintCleanup();}
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
  const t=salesOrderCommercialTotals(soDraft),terms=paymentTermsFrom(C||{}),pct=paymentDepositPercent(terms),got=typeof finOrderPaid==='function'?finOrderPaid(soDraft.id).paid:0;
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
