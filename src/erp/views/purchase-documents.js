/* Действия с документом закупки: скачать PDF и открыть письмо Gmail — и только.
   IN : документ PO (erp/purchasing/documents)
   OUT: purDocOpen, purDocHTML; DB.purchaseDocumentOptions — выбор полей
   Подготовленные письма пишутся в журнал отдельно от Mark sent человека. */
function purDocOpen(){
 if(!purOrderSaveForm(true))return;
 purDoc={opts:purDocOptions(DB.purchaseDocumentOptions),panel:false,status:''};render();
}
function purDocSet(k,on){purDoc.opts[k]=!!on;render();}
function purDocReset(){purDoc.opts=purDocOptions();render();}
function purDocPanelToggle(){purDoc.panel=!purDoc.panel;render();}
function purDocClose(){purDoc=null;render();}
function purDocSaveDefault(){
 const r=purPersist(()=>{DB.purchaseDocumentOptions=purDocOptions(purDoc.opts);});
 purDoc.status=r.ok?'Saved as default.':r.error;render();
}
function purDocHTML(){
 const d=purDoc,p=purOrderDraft,groups=[...new Set(PUR_PO_FIELDS.map(f=>f.g))];
 let body;try{body=docDraftMark(purDocPages(p,d.opts),'purchaseOrder',p.id).map(pg=>'<div class="doc-sheet">'+docPageSVG(pg)+'</div>').join('');}catch(e){body='<div class="err" style="display:block">'+esc(e.message)+'</div>';}
 const panel='<aside class="doc-panel"><b>Customize · Purchase order</b><p class="mut">Changes apply to this preview.</p>'+groups.map(g=>'<h4>'+g+'</h4>'+PUR_PO_FIELDS.filter(f=>f.g===g).map(f=>'<label class="doc-opt"><input type="checkbox" data-pur-doc-field="'+f.k+'" '+(d.opts[f.k]?'checked':'')+' '+onAct('change',purDocSet,String(f.k),EL_CHECKED)+'><span>'+f.label+'</span></label>').join('')).join('')+'<div class="doc-panel-actions"><button type="button" '+onAct('click',purDocReset)+'>Reset to base</button><button type="button" '+onAct('click',purDocSaveDefault)+'>Save as default</button></div></aside>';
 return '<div class="doc-back"><div class="doc-window" role="dialog" aria-label="Purchase order preview"><div class="doc-bar"><b>'+esc(p.number)+'</b><span class="doc-spacer"></span><button type="button" '+onAct('click',purDocPanelToggle)+'>✎ Customize</button><button type="button" data-pur-pdf '+onAct('click',purDocAction,'pdf')+'>Download PDF</button><button type="button" '+onAct('click',purDocAction,'print')+'>Print</button><button type="button" data-pur-gmail '+onAct('click',purDocAction,'email')+'>Open Gmail + PDF</button><button type="button" '+onAct('click',purOrderState,'sent')+'>Mark sent</button><button type="button" '+onAct('click',purDocClose)+'>Close</button></div><div class="doc-status">'+esc(d.status||'Attach the downloaded PDF yourself. Mark sent after sending the message.')+'</div><div class="doc-body'+(d.panel?' with-panel':'')+'"><div class="doc-pages">'+body+'</div>'+(d.panel?panel:'')+'</div></div></div>';
}
function purDocAction(action){
 const p=purOrderDraft,d=purDoc;if(!p||!d)return;
 try{
  const pages=docDraftMark(purDocPages(p,d.opts),'purchaseOrder',p.id);
  if(action==='print'){
   docPrintHost().innerHTML=pages.map(pg=>'<div class="doc-print-page">'+docPageSVG(pg)+'</div>').join('');
   document.body.classList.add('doc-printing');window.addEventListener('afterprint',docPrintCleanup,{once:true});setTimeout(docPrintCleanup,60000);window.print();
   const r=purOrderLog(p.id,'Print prepared',[]);d.status=r.ok?'Print prepared.':r.error;
  }else{
   docDownload(purDocFile(p),docPdfBytes(pages,{title:'Purchase order '+p.number}));
   if(action==='email'){
    const win=window.open(purDocGmailURL(p),'_blank');
    const r=purOrderLog(p.id,'Email prepared',[{field:'to',label:'To',before:null,after:p.to},{field:'cc',label:'CC',before:null,after:p.cc}]);
    d.status=r.ok?'PDF downloaded. Attach it to Gmail, then mark this PO sent.'+(win?'':' Gmail was blocked. Allow pop-ups and retry.'):r.error;
   }else{const r=purOrderLog(p.id,'PDF prepared',[]);d.status=r.ok?'PDF downloaded.':r.error;}
  }
 }catch(e){d.status='Document could not be prepared: '+e.message;docPrintCleanup();}
 render();
}
