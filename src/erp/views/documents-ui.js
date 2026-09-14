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

function docOpen(kind){
 if(!soDraft)return;
 kind=DOC_KINDS.some(d=>d.k===kind)?kind:docLastKind;
 docState={kind,opts:docDefaultOptions(kind),panel:false,status:''};
 render();
}
function docClose(){docState=null;render();}
function docSetKind(kind){
 if(!docState||!DOC_KINDS.some(d=>d.k===kind))return;
 docLastKind=kind;docState.kind=kind;docState.opts=docDefaultOptions(kind);docState.status='';render();
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
function docCurrentPages(){return docLayout(docBuildModel(docState.kind,soDraft,docState.opts));}
function docWarnings(){
 const out=[];
 if(!soDraft.businessNumber)out.push('Save the order to give the document its number.');
 if(!soDraft.customerId)out.push('No customer selected.');
 if(docState.kind!=='workOrder'){const t=salesOrderCommercialTotals(soDraft);if(!t.complete)out.push(t.missing+(t.missing>1?' items need':' item needs')+' pricing — totals are not complete.');}
 return out.map(x=>'<span class="warn">'+esc(x)+'</span>').join('');
}

function docModal(){
 if(!docState||!soDraft)return '';
 let pages=[],error='';
 try{pages=docCurrentPages();}catch(e){error=e&&e.message||String(e);console.error(e);}
 const warn=docWarnings(),status=docState.status?'<span>'+esc(docState.status)+'</span>':'';
 const kinds=DOC_KINDS.map(d=>`<button type="button" class="${d.k===docState.kind?'on':''}" onclick="docSetKind('${d.k}')">${d.label}</button>`).join('');
 return `<div class="doc-back" onclick="if(event.target===this)docClose()"><div class="doc-window" role="dialog" aria-modal="true" aria-label="Documents">
  <div class="doc-bar"><b class="doc-title">Preview · Order ${esc(soDraft.businessNumber||'draft')}</b><div class="doc-kinds">${kinds}</div><span class="doc-spacer"></span>
   <button type="button" class="doc-pen${docState.panel?' on':''}" aria-pressed="${docState.panel}" onclick="docTogglePanel()">✎ Customize</button>
   <button type="button" onclick="docPrint()">Print</button><button type="button" onclick="docEmail()">Email</button><button type="button" onclick="docClose()">Close</button></div>
  ${warn||status?`<div class="doc-status">${warn}${status}</div>`:''}
  <div class="doc-body${docState.panel?' with-panel':''}"><div class="doc-pages">${error?`<div class="err" style="display:block">${esc(error)}</div>`:pages.map(pg=>`<div class="doc-sheet">${docPageSVG(pg)}</div>`).join('')}</div>${docState.panel?docPanel():''}</div>
 </div></div>`;
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

/* -------------------------- Master Data → Company -------------------- */
function viewMdCompany(){
 const c=DB.company;
 const f=(k,label,o)=>{o=o||{};const ph=o.ph?` placeholder="${esc(o.ph)}"`:'';
  return `<div${o.wide?' class="doc-company-wide"':''}><label>${label}</label>${o.area?`<textarea rows="${o.rows||3}" data-company="${k}"${ph} onchange="companySet('${k}',this.value)">${esc(c[k])}</textarea>`:`<input${o.type?` type="${o.type}"`:''} data-company="${k}" value="${esc(c[k])}"${ph} onchange="companySet('${k}',this.value)">`}</div>`;};
 return `<div class="sub">Company details for Work orders, Proforma invoices and Order confirmations. Empty fields are not printed.</div>
 <div class="doc-company">
  <div class="doc-company-logo"><label>Logo</label><div class="doc-logo-box">${c.logo?`<img src="${c.logo}" alt="Company logo">`:'<span>No logo</span>'}</div>
   <div class="doc-logo-actions"><button type="button" onclick="document.getElementById('docLogoFile').click()">${c.logo?'Replace logo':'Upload logo'}</button>${c.logo?'<button type="button" onclick="companyRemoveLogo()">Remove</button>':''}</div>
   <input type="file" id="docLogoFile" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="companyLogoUpload(this)"><small>PNG or JPEG. Resized for printing and saved with the data.</small></div>
  <div class="doc-company-grid">${f('legalName','Legal name *')}${f('hstNumber','HST number',{ph:'123456789 RT0001'})}${f('address1','Address line 1')}${f('address2','Address line 2')}${f('city','City')}${f('province','Province')}${f('postalCode','Postal code')}${f('country','Country')}${f('phone','Phone')}${f('email','Email',{type:'email'})}${f('website','Website')}${f('depositPercent','Deposit for cash customers, %',{type:'number'})}${f('paymentInstructions','Payment instructions',{area:true,wide:true,ph:'e-Transfer to … · Cheque payable to …'})}${f('termsText','Terms and conditions',{area:true,rows:6,wide:true})}${f('footerText','Footer line on customer documents',{wide:true,ph:'Thank you for your business'})}</div>
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
