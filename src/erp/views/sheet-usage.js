/* =====================================================================
   views/sheet-usage  ·  sheets-1.0
   Optimization → Sheets: журнал листов по собранным раскроям батчей.
   IN : sheetUsageRows (erp/production/sheet-usage)
   OUT: таблица как в Sales — фильтры колонок, блок дат, итоги отфильтрованного

   Плиток над таблицей нет: статистику на главный экран не выносить
   (владелец, 15 сентября 2026) — итоги только строкой под таблицей. По ней
   же видно расход по размерам за месяц: блок дат → This month, фильтр Sheet
   size или Status = Cut.
   ===================================================================== */
function sheetUsageColumns(){
 const col=(k,label,type,def,extra)=>Object.assign({k,label,type:type||'text',def:def!==false},extra||{});
 return [col('batch','Batch'),col('built','Built','date'),col('glass','Glass','list'),col('mm','mm','number',false),col('size','Sheet size','list'),
  col('sheets','Sheets','number',true,{sum:true}),col('broken','Broken','number',true,{sum:true}),col('area','Sheet ft²','number',true,{sum:true,digits:1}),
  col('used','Glass ft²','number',true,{sum:true,digits:1}),col('waste','Waste ft²','number',true,{sum:true,digits:1}),col('usedPct','Used %','number'),
  col('keep','To stock ft²','number',false,{sum:true,digits:1}),col('status','Status','list')];
}
function sheetUsageSizeText(r){return (r.stock?r.stock+' · ':'')+frac16(r.w)+' × '+frac16(r.h)+'″';}
/* Фильтры Batch и Glass у Sales читают заказ; здесь значения готовые. */
function sheetUsageInfos(){
 return sheetUsageRows().map(r=>({o:{createdAt:r.built},r,tokens:{batch:[r.batch],glass:[r.glass]},
  memo:{batch:r.batch,built:salesListIsoDay(r.built),glass:r.glass,mm:r.mm,size:sheetUsageSizeText(r),sheets:r.sheets,broken:r.broken,
   area:r.area,used:r.used,waste:r.net,usedPct:r.usedPct,keep:r.keep,status:r.status}}));
}
function sheetUsageOpenBatch(number){optimizationSetTab('production');glassBatchOpen(number);glassBatchDetailTab='optimization';render();}
function sheetUsageCell(i,c){
 const v=salesListValue(i,c.k);
 if(c.k==='batch')return `<td><button type="button" class="gb-link" data-sheet-batch onclick="sheetUsageOpenBatch('${esc(v)}')">${esc(v)}</button></td>`;
 if(c.k==='built')return `<td>${v?esc(salesListShortDay(v)):'<span class="mut">—</span>'}</td>`;
 if(c.k==='size')return `<td class="nowrap"><b>${esc(v)}</b></td>`;
 if(c.k==='status')return `<td><span class="gb-state ${v==='Cut'?'done':''}">${esc(v)}</span></td>`;
 if(c.k==='usedPct')return `<td class="n">${cutNum(v,1)}%</td>`;
 if(c.type==='number')return `<td class="n">${c.k==='broken'&&v?'<b>'+v+'</b>':cutNum(v,c.digits||0)}</td>`;
 return `<td>${esc(v==null?'':String(v))}</td>`;
}
/* Итог отфильтрованных строк: суммы ft² и листов; Used % — от сумм, а не
   среднее процентов. */
function sheetUsageFooter(rows,cols){
 const sum=k=>rows.reduce((a,i)=>a+(+i.memo[k]||0),0),batches=new Set(rows.map(i=>i.r.batch)).size;
 const label=`<b data-sheet-foot>${rows.length} row${rows.length===1?'':'s'} · ${batches} batch${batches===1?'':'es'}</b>`;
 const cell=c=>c.sum?`<td class="n" data-sum="${c.k}">${cutNum(sum(c.k),c.digits||0)}</td>`:c.k==='usedPct'?`<td class="n" data-sum="usedPct">${cutNum(cutPct(sum('used'),sum('area')),1)}%</td>`:'<td></td>';
 const first=cols.findIndex(c=>c.sum||c.k==='usedPct');
 if(first<=0)return `<tfoot><tr class="sl-foot"><td colspan="${cols.length}" class="sl-foot-head">${label}</td></tr><tr class="sl-foot">${cols.map(cell).join('')}</tr></tfoot>`;
 return `<tfoot><tr class="sl-foot"><td colspan="${first}" class="sl-foot-head">${label}</td>${cols.slice(first).map(cell).join('')}</tr></tfoot>`;
}
function viewSheetUsage(){
 const infos=sheetUsageInfos(),rows=salesListRows(infos),cols=salesListColumns();
 const th=c=>{const active=salesListFilterActive(salesListLoadPrefs().filters[c.k]);return `<th class="${c.type==='number'?'n':''}" data-col="${c.k}"><span class="sl-th">${esc(c.label)}<button type="button" class="sl-fbtn${active?' on':''}" data-filter-col="${c.k}" aria-label="Filter and sort ${esc(c.label)}" onclick="salesListOpenFilter(event,'${c.k}')"></button></span></th>`;};
 const body=rows.map(i=>`<tr data-sheet-row="${esc(i.r.batch+'|'+i.r.glass+'|'+(i.r.stock||i.r.w+'x'+i.r.h))}">${cols.map(c=>sheetUsageCell(i,c)).join('')}</tr>`).join('')
  ||`<tr><td colspan="${cols.length}" class="empty" data-sheet-empty>${infos.length?'Nothing matches the filters.':'No built layouts yet.'}</td></tr>`;
 return `<section class="optimization-queue sheet-usage"><div class="page-head"><div><h2>Sheets</h2><p>Sheets in built batch layouts. A broken sheet counts as a used sheet and as waste.</p></div></div>
  <div class="oq-tabs" role="tablist">${glassBatchTabs()}</div>
  <div class="card oq-card"><div class="oq-toolbar">${salesListDateButton('built')}<span class="sp"></span><button type="button" data-columns-button onclick="salesListOpenColumns(event)">Columns</button></div>
   ${salesListFilterChips()}
   <div class="sales-table-wrap"><table class="sl-table" data-sheet-table><thead><tr>${cols.map(th).join('')}</tr></thead><tbody>${body}</tbody>${rows.length?sheetUsageFooter(rows,cols):''}</table></div>
  </div>${salesListMenuHTML(infos)}</section>`;
}
