/* =====================================================================
   view/station-print  ·  station-print-1.0
   Печать на CUT — пункт 9 плана v1.16, вариант 2 владельца (30.10.2026:
   «визуально проще выглядит печать, а так и надо»). Кнопка Print в шапке
   листа открывает окно станции: текущий лист или весь батч и три действия —
   схема, чертежи, стикеры. Состав и порядок — те же, что в окне Print ·
   Batch офиса (stkBatchJobs): по листам, внутри листа — как стёкла лежат на
   схеме; куски в сток — за стёклами своего листа, у них стикер без чертежа.
   Печать ничего не меняет в производстве: ни сканов, ни мест, ни раскроя.
   Принтера на CUT пока нет (план 11.1): стикеры — 4-дюймовый принтер
   этикеток, схемы и чертежи — обычный принтер, Letter.
   IN : stationSheetView · stkBatchView · cutPrintLayouts · batchDrawingsPrint · stkPages
   OUT: html · печать браузера · журнал заказа (Printed)
   ===================================================================== */
function stationOpenPrint(){
 const v=stationSheetView;if(!v||!glassBatchFind(v.batch))return false;
 stationMenu=null;stationDrawer={kind:'print',batch:v.batch,glass:v.glass,no:v.no,area:'sheet',shown:'',notice:'',error:'',warning:''};render();return true;
}
/* Область: лист станции — ровно он (стекло и номер), весь батч — все листы. */
function stationPrintView(d,area){
 return stkBatchView({batchNo:d.batch,sheets:'',sheetKey:area==='sheet'&&d.glass&&d.no?stkSheetKey(d.glass,d.no):'',off:new Set()});
}
function stationPrintArea(a){const d=stationDrawer;if(!d||d.kind!=='print')return;d.area=a==='all'?'all':'sheet';d.notice=d.error=d.warning='';render();}
function stationPrintSig(x){return x?JSON.stringify(x.selected.map(stkJobKey).concat(x.sheets)):'';}
/* Печатается то, что рабочий видел: батч изменился после открытия окна —
   сначала новые цифры, печать — следующим нажатием. */
function stationPrintFresh(){
 const d=stationDrawer;if(!d||d.kind!=='print')return null;
 const x=stationPrintView(d,d.area);
 if(!x){d.error='Batch '+d.batch+' not found';render();return null;}
 if(stationPrintSig(x)!==d.shown){d.notice=d.warning='';d.error='Batch changed — check and print again';render();return null;}
 return x;
}
function stationPrintCount(n,w){return n+' '+w+(n===1?'':'s');}
function stationPrintLayouts(){
 const d=stationDrawer,x=stationPrintFresh();if(!x||!x.laid||!x.sheets.length)return false;
 const ok=cutPrintLayouts(d.batch,x.sheets);
 d.warning=d.error='';d.notice=ok?stationPrintCount(x.sheets.length,'layout')+' sent':'';render();return ok;
}
function stationPrintDrawings(){
 const d=stationDrawer,x=stationPrintFresh();if(!x)return false;
 const n=x.selected.filter(j=>j.type!=='stock').length;if(!n||n>100&&!confirm('Print '+n+' drawings?'))return false;
 const r=batchDrawingsPrint(d.batch,x.selected);
 d.warning='';d.notice=r.printed?stationPrintCount(r.printed,'drawing')+' sent':'';
 d.error=r.bad.length?'No drawing: '+r.bad.slice(0,5).join(', ')+(r.bad.length>5?' …':''):'';render();return r.printed>0;
}
function stationPrintStickers(){
 const d=stationDrawer,x=stationPrintFresh();if(!x||!x.selected.length)return false;
 let pages;try{pages=stkPages(x.selected,stkPrefSize(),null);}catch(e){d.error='Stickers could not be prepared: '+(e&&e.message||e);render();return false;}
 const over=[...new Set(pages.flatMap(p=>p.overflow))];
 if(over.length&&!d.warning){d.warning="Doesn't fit: "+over.join(', ');render();return false;}
 d.warning=d.error='';d.notice=stationPrintCount(pages.length,'sticker')+' sent';render();
 if(!stkPrint(pages))return false;
 stkLogPrinted(x.selected,'Stickers',d.batch);return true;
}
function stationPrintHTML(){
 const d=stationDrawer,b=glassBatchFind(d.batch),close='<button type="button" class="b" onclick="stationCloseDrawer()">Close</button>';
 const shell=body=>'<div class="st-dim" onclick="stationCloseDrawer()"></div><div class="st-drawer st-drawer-sm st-print" role="dialog" aria-label="Print" data-station-print-window>'+body+'</div>';
 if(!b)return shell('<h2>Print</h2><div class="st-pin-err" data-station-print-error>Batch '+esc(d.batch)+' not found</div><div class="st-drawer-foot"><span class="mut"></span>'+close+'</div>');
 const cur=stationPrintView(d,'sheet'),all=stationPrintView(d,'all'),laid=!!all.laid,hasSheet=laid&&cur.scope.length>0;
 if(!hasSheet)d.area='all';
 const x=d.area==='sheet'?cur:all,glassOf=v=>v.selected.filter(j=>j.type!=='stock').length,stockOf=v=>v.selected.length-glassOf(v);
 d.shown=stationPrintSig(x);
 const what=v=>[glassOf(v)+' glass',stockOf(v)?stockOf(v)+' stock':''].filter(Boolean).join(' · ');
 const tile=(a,on,off,t,sub)=>'<button type="button" class="st-gbtn'+(on?' on':'')+'" data-print-area="'+a+'"'+(off?' disabled':'')+' onclick="stationPrintArea(\''+a+'\')"><b>'+t+'</b><span>'+esc(sub)+'</span></button>';
 const area='<div class="st-print-area">'+
  tile('sheet',d.area==='sheet',!hasSheet,'Current sheet',hasSheet?stkSheetLabel(d.glass,d.no,true)+' · '+what(cur):'No sheet')+
  tile('all',d.area==='all',false,'Whole batch',[laid?stationPrintCount(all.keys.length,'sheet'):'Not built · in order',what(all),all.away?all.away+' not on a sheet':''].filter(Boolean).join(' · '))+'</div>';
 const glassN=glassOf(x),size=stkSizeDef(stkPrefSize());
 const act=(k,t,meta,off)=>'<button type="button" class="b st-print-act" data-station-print-'+k+(off?' disabled':'')+' onclick="stationPrint'+k.charAt(0).toUpperCase()+k.slice(1)+'()">'+ico('printer')+'<b>'+t+'</b><em>'+esc(meta)+'</em></button>';
 const acts='<div class="st-print-acts">'+
  act('layouts',d.area==='sheet'?'Print layout':'Print layouts',laid?stationPrintCount(x.sheets.length,'sheet'):'Not built',!laid||!x.sheets.length)+
  act('drawings','Print drawings',stationPrintCount(glassN,'drawing'),!glassN)+
  act('stickers',d.warning?'Stickers anyway':'Print stickers',stationPrintCount(x.selected.length,'sticker')+' · '+(size?size.label:''),!x.selected.length)+'</div>';
 const msg=(d.notice?'<div class="stk-sent st-print-msg" data-station-print-notice>✓ '+esc(d.notice)+'</div>':'')+
  (d.warning?'<div class="ncr-warning st-print-msg" role="alert" data-station-print-warning>⚠ '+esc(d.warning)+'</div>':'')+
  (d.error?'<div class="st-pin-err st-print-msg" role="alert" data-station-print-error>'+esc(d.error)+'</div>':'');
 return shell('<h2>Print · Batch <b class="mono">'+esc(b.number)+'</b></h2>'+stationStaleHTML(glassBatchStale(b))+area+acts+msg+
  '<div class="st-drawer-foot"><span class="mut">Letter: layout, drawings · label printer: stickers</span>'+close+'</div>');
}
