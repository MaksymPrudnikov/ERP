/* Delivery requests reuse PO layout, with their own title/number and
   requested quantities. Gmail remains a compose link plus manual PDF. */
function purRequestPages(d,options){
 const p=purOrderFind(d.poId),supplier=p?p.supplier:null;
 const model=purOrderClean(Object.assign({},d,{supplier,currency:p?p.currency:'USD',note:[p?'For '+p.number:'',d.note].filter(Boolean).join('\n'),lines:d.lines.map(l=>{
  const source=p&&p.lines.find(x=>x.id===l.poLineId);
  return Object.assign({},source||{},l,{held:false,sheetsPerBlock:null});
 })}));
 return purDocPages(model,Object.assign({},purDocOptions(options),{currency:false,prices:false,totals:false,receiving:false,damage:false}),'DELIVERY REQUEST');
}
function purRequestPreviewOpen(){
 if(!purFulfilSaveForm())return;purFulfilPreview={opts:purDocOptions(DB.purchaseDocumentOptions),panel:false};render();
}
function purRequestPreviewHTML(){
 const d=purFulfilDraft.data,v=purFulfilPreview,fields=PUR_PO_FIELDS.filter(f=>!['currency','prices','totals','receiving','damage','held'].includes(f.k));
 const panel='<aside class="doc-panel"><b>Customize · Delivery request</b>'+fields.map(f=>'<label class="doc-opt"><input type="checkbox" '+(v.opts[f.k]?'checked':'')+' onchange="purFulfilPreview.opts.'+f.k+'=this.checked;render()"><span>'+f.label+'</span></label>').join('')+'</aside>';
 return '<div class="doc-back"><div class="doc-window" role="dialog" aria-label="Delivery request preview"><div class="doc-bar"><b>'+esc(d.number)+'</b><span class="doc-spacer"></span><button type="button" onclick="purFulfilPreview.panel=!purFulfilPreview.panel;render()">✎ Customize</button><button type="button" onclick="purRequestDocAction(\'pdf\')">Download PDF</button><button type="button" onclick="purRequestDocAction(\'print\')">Print</button><button type="button" onclick="purRequestDocAction(\'email\')">Open Gmail + PDF</button><button type="button" onclick="purRequestSentForm()">Mark sent</button><button type="button" onclick="purFulfilPreview=false;render()">Close</button></div><div class="doc-status">'+esc(purNotice||'Attach the PDF yourself. Mark sent after sending.')+'</div><div class="doc-body'+(v.panel?' with-panel':'')+'"><div class="doc-pages">'+purRequestPages(d,v.opts).map(pg=>'<div class="doc-sheet">'+docPageSVG(pg)+'</div>').join('')+'</div>'+(v.panel?panel:'')+'</div></div></div>';
}
function purRequestSentForm(){
 const d=purFulfilDraft.data,r=purRequestMarkSent(d.id,d.rev);if(r.ok){purFulfilDraft.data=purClone(r.value);purFulfilOriginal=JSON.stringify(purFulfilDraft);}purNotice=r.ok?'Marked sent.':r.error;render();
}
function purRequestDocAction(action){
 const d=purFulfilDraft.data;
 try{
  const pages=purRequestPages(d,purFulfilPreview.opts);
  if(action==='print'){docPrintHost().innerHTML=pages.map(pg=>'<div class="doc-print-page">'+docPageSVG(pg)+'</div>').join('');document.body.classList.add('doc-printing');window.addEventListener('afterprint',docPrintCleanup,{once:true});setTimeout(docPrintCleanup,60000);window.print();}
  else{docDownload(d.number+'.pdf',docPdfBytes(pages,{title:'Delivery request '+d.number}));if(action==='email')window.open(purRequestGmailURL(d),'_blank');}
  const r=purPersist(()=>purRecordEvent('request',d.id,action==='email'?'Email prepared':action==='print'?'Print prepared':'PDF prepared',action==='email'?[{field:'to',label:'To',before:null,after:d.to},{field:'cc',label:'CC',before:null,after:d.cc}]:[]));
  purNotice=r.ok?(action==='email'?'PDF downloaded. Attach it to Gmail, then mark the request sent.':'Document prepared.'):r.error;
 }catch(e){purNotice='Document could not be prepared: '+e.message;docPrintCleanup();}render();
}
function purRequestGmailURL(d){
 const p=purOrderFind(d.poId),body=['Hello,','','Please deliver the items in the attached request.',p?'Purchase order: '+p.number:'',d.expectedDate?'Requested delivery: '+docDate(d.expectedDate):'',d.note,'','Thank you,',(DB.company||{}).legalName||''].join('\n');
 return docGmailUrl(d.to,'Delivery request '+d.number+(p?' · '+p.number:''),body)+(d.cc?'&cc='+encodeURIComponent(d.cc):'');
}
