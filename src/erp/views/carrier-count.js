/* =====================================================================
   view/carrier-count  ·  carriers-3.0
   Production → Dollies & Skids: плитки учёта тары и пересчёт (план
   доработок v1.16, пункт 7, этап 8; владелец выбрал вариант 1 офиса,
   30.10.2026: плитки сверху, кнопка Count, пересчёт — на месте доски).
   IN : carrierSummary(), DB.carrierCount (erp/shopfloor/carrier-count)
   OUT: html; команды пересчёта erp/shopfloor/carrier-count
   ===================================================================== */
let carrierCountShow='';     // id открытого на экране пересчёта ('' — доска)
let carrierCountPlace='Shop';
let carrierCountNotice='';
const CARRIER_COUNT_PLACES=['Shop','Yard'];

function carrierTilesHTML(b){
 const s=carrierSummary(),days=s.oldest?skidDays(s.oldest):0,types=CARRIER_TYPES.map(t=>t.k+' '+(s.byType[t.k]||0)).join(' · ');
 const shopN=s.shop.loaded+s.shop.empty,last=s.last?docDate(finLocalDate(s.last.finishedAt)):'';
 return `<div class="cb-tiles cb-tiles-7">
  <div class="cb-tile" data-carrier-tile="reg"><b>${s.reg}</b><span>registered · ${esc(types)}</span></div>
  <div class="cb-tile" data-carrier-tile="shop"><b>${shopN}</b><span>in the shop · ${s.shop.loaded} loaded${s.shop.items.length?' · '+esc(carrierCountText(carrierItems(s.shop.items))):''} · ${s.shop.empty} empty</span></div>
  <div class="cb-tile" data-carrier-tile="out"><b>${s.outN}</b><span>at customers${s.outN?' · oldest '+stationPlural(days,'day','days'):''}</span></div>
  <div class="cb-tile${b.looseN?' warn':''}" data-carrier-loose-tile><b>${b.looseN}</b><span>glass with no dolly or skid</span></div>
  <${s.last?'button type="button" onclick="carrierCountView(\''+esc(s.last.id)+'\')"':'div'} class="cb-tile${s.missing.length?' warn':''}" data-carrier-tile="missing"><b>${s.last?s.missing.length:'—'}</b><span>${s.last?'not found at last count · '+esc(last):'no count yet'}</span></${s.last?'button':'div'}>
  <${s.last?'button type="button" onclick="carrierCountView(\''+esc(s.last.id)+'\')"':'div'} class="cb-tile${s.nolabel?' warn':''}" data-carrier-tile="nolabel"><b>${s.last?s.nolabel:'—'}</b><span>found without a label</span></${s.last?'button':'div'}>
  <div class="cb-tile" data-carrier-tile="unconfirmed"><b>${s.unconfirmed}</b><span>not confirmed yet${s.retired?' · '+s.retired+' retired':''}</span></div></div>`;
}
function carrierCountButton(){
 const n=carrierCountOpen();
 return `<button type="button" class="b cb-count-btn" data-carrier-count-open onclick="carrierCountGo()">${n?'Count in progress · '+carrierCountCounted(n).size+' scanned':'Count dollies &amp; skids'}</button>`;
}
function carrierCountGo(){
 const n=carrierCountOpen();if(n){carrierCountView(n.id);return;}
 const out=carrierCountStart(carrierMe());if(!out.ok){carrierCountNotice=out.error;render();return;}
 carrierCountView(out.value.id);
}
function carrierCountView(id){carrierCountShow=id||'';carrierCountNotice='';render();}
function carrierCountScanUI(raw){
 const n=carrierCountFind(carrierCountShow);if(!n||!String(raw||'').trim())return false;
 const out=carrierCountScan(n.id,raw,carrierCountPlace,carrierMe());carrierCountNotice=out.ok?'':out.error;render();return out.ok?out.value.res:false;
}
function carrierCountKey(ev,el){if(ev.key!=='Enter')return;ev.preventDefault();const v=el.value;el.value='';carrierCountScanUI(v);}
function carrierCountFocus(){const el=document.querySelector('[data-carrier-count-scan]');if(el&&document.activeElement!==el&&!salesDialog)el.focus();}
function carrierCountNoLabelAsk(){
 const n=carrierCountFind(carrierCountShow);if(!n)return;
 const go=kind=>d=>{const out=carrierCountNoLabel(n.id,kind,carrierCountPlace,d.input.value,carrierMe());carrierCountNotice=out.ok?'':out.error;render();};
 salesDialogOpen({title:'Found without a label',sub:'Office checks it later. No code is given now.',input:{label:'Where and how it looks',value:''},buttons:[{label:'Back'},{label:'Dolly',run:go('dolly')},{label:'Skid',kind:'pri',run:go('skid')}]});
}
function carrierCountAct(fn){const out=fn();carrierCountNotice=out.ok?'':out.error;render();}
function carrierCountEnd(finish){
 const n=carrierCountFind(carrierCountShow);if(!n)return;
 if(finish){carrierCountAct(()=>carrierCountFinish(n.id));return;}
 salesDialogOpen({title:'Cancel this count?',note:'Its scans are thrown away.',buttons:[{label:'Back'},{label:'Cancel count',kind:'pri',run:()=>{const out=carrierCountCancel(n.id);carrierCountShow='';carrierCountNotice=out.ok?'':out.error;render();}}]});
}
function carrierCountResult(o,n,i,open){
 const when=x=>stationTime(x);
 switch(o.res){
  case 'ok':return '✓ Counted'+(o.place?' · '+esc(o.place):'');
  case 'dup':return `<span class="mut">Already counted at ${esc(when(o.info))} — not added again</span>${open?` <button type="button" class="sm" data-count-twin="${i}" onclick="carrierCountAct(()=>carrierCountTwin('${esc(n.id)}',${i}))">Another one with this label</button>`:''}`;
  case 'twin':return `<b class="cc-warn">Two with one label</b> — office checks`;
  case 'unknown':return `<b class="cc-bad">Unknown code</b> — not in the list, nothing created`;
  case 'retired':return `<b class="cc-warn">Retired — found here</b> — office checks`;
  case 'out':return o.fixed?`✓ Back from <span data-raw>${esc(salesCustomerDisplay(o.customerId))}</span>`:`<b class="cc-warn">⚠ Found here · records say at <span data-raw>${esc(salesCustomerDisplay(o.customerId))}</span> (${esc(o.info)})</b> <button type="button" class="sm" data-count-back="${i}" onclick="carrierCountAct(()=>carrierCountBack('${esc(n.id)}',${i},carrierMe()))">Back from customer</button>`;
  case 'nolabel':return `<b>Unidentified ${esc(o.kind)}</b>${o.place?' · '+esc(o.place):''}${o.note?' · “'+esc(o.note)+'”':''} — office checks`;
 }
 return '';
}
function carrierCountScreen(){
 const n=carrierCountFind(carrierCountShow);if(!n){carrierCountShow='';return '';}
 const open=!n.finishedAt,got=carrierCountCounted(n),exp=carrierExpected(),found=exp.filter(c=>got.has(c)).length;
 const contents=carrierContents(),out=typeof skidsOut==='function'?skidsOut():new Map(),seen=carrierSeenSet();
 const used=new Map();(DB.stationScan||[]).forEach(s=>{if(s.on&&!s.undoneAt){const u=used.get(s.on);if(!u||String(s.at)>u.at)used.set(s.on,{at:String(s.at),st:s.station});}});
 const lastSeen=code=>{const u=used.get(code);return u?' · last used '+docDate(finLocalDate(u.at))+' at '+u.st:'';};
 const cap=(list,f)=>list.slice(0,60).map(f).join('')+(list.length>60?`<div class="mut">+${list.length-60} more</div>`:'');
 const desc=code=>{const on=contents.get(code)||[];return on.length?stationTareCount(on)+' at '+[...new Set(on.map(x=>x.place.waiting).filter(Boolean))].join(', '):'empty'+lastSeen(code);};
 const ns=(code,t)=>`<div class="st-dl cc-ns" data-count-missing="${esc(code)}"><span class="cw-code sm">${esc(code)}</span><span class="mut" data-raw>${esc(t)}</span></div>`;
 const missing=open?exp.filter(c=>!got.has(c)):n.missing;
 const atCust=[...out.values()].filter(x=>!got.has(x.code)),unconf=(DB.carrier||[]).filter(c=>c.active&&!seen.has(c.code)&&!out.has(c.code)&&!got.has(c.code));
 const rows=n.obs.map((o,i)=>({o,i})).reverse().map(({o,i})=>`<tr data-count-obs="${esc(o.res)}"><td>${o.code?`<span class="cw-code sm">${esc(o.code)}</span>`:'<span class="cw-code sm none">no label</span>'}</td><td>${carrierCountResult(o,n,i,open)}</td><td class="mut">${esc(o.by)}</td><td class="mut">${esc(stationTime(o.at))}</td></tr>`).join('');
 if(open)setTimeout(carrierCountFocus,0);
 return `<div class="cc" data-carrier-count="${esc(n.id)}"><div class="cc-head"><h2>Count · ${esc(docDate(finLocalDate(n.startedAt)))}</h2><span class="mut">${open?'started '+esc(stationTime(n.startedAt)):'finished '+esc(stationTime(n.finishedAt))}${n.by?' · '+esc(n.by):''}</span><span class="cw-sp"></span>
  ${open?'<button type="button" class="b" data-count-cancel onclick="carrierCountEnd(false)">Cancel count</button><button type="button" class="b pri" data-count-finish onclick="carrierCountEnd(true)">Finish count</button>':'<button type="button" class="b" onclick="carrierCountView(\'\')">Back to dollies &amp; skids</button>'}</div>
  ${carrierCountNotice?`<div class="shipping-notice bad" role="alert">${esc(carrierCountNotice)}</div>`:''}
  <div class="cc-grid"><div class="cc-left">
  ${open?`<div class="cc-top"><div class="cc-scan" onclick="carrierCountFocus()">${ico('scan')}<div class="cc-scan-t"><b>SCAN EVERY DOLLY AND SKID</b><input data-carrier-count-scan autocomplete="off" spellcheck="false" placeholder="Label or code: DL-2" onkeydown="carrierCountKey(event,this)"></div></div>
   <div class="cc-place"><span class="mut">Place</span><span class="cb-seg">${CARRIER_COUNT_PLACES.map(p=>`<button type="button" class="${carrierCountPlace===p?'on':''}" data-count-place="${p}" onclick="carrierCountPlace='${p}';render()">${p}</button>`).join('')}</span></div>
   <div class="cb-tile cc-found" data-count-found><b>${found} of ${exp.length}</b><span>in the shop found</span></div></div>`:''}
  <div class="card cc-card"><div class="cc-sec"><h3>Scanned · ${got.size}</h3><span class="cw-sp"></span>${open?'<button type="button" class="sm" data-count-nolabel onclick="carrierCountNoLabelAsk()">+ No label</button>':''}</div>
   ${rows?`<table class="cc-table"><thead><tr><th>Code</th><th>Result</th><th>By</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`:'<div class="empty">Scan the first dolly or skid</div>'}</div></div>
  <div class="card cc-card cc-right"><div class="cc-sec"><h3>${open?'Not seen yet':'Not found'} · ${missing.length}</h3></div>${cap(missing,c=>ns(c,desc(c)))||'<div class="mut">All found</div>'}
   ${open&&atCust.length?`<div class="cc-sec"><h3>At customers · ${atCust.length}</h3></div>${cap(atCust,x=>ns(x.code,salesCustomerDisplay(x.customerId)+' · '+x.ps+' · '+stationPlural(skidDays(x.since),'day','days')))}`:''}
   ${open&&unconf.length?`<div class="cc-sec"><h3>Not confirmed yet · ${unconf.length}</h3><span class="mut">a scan here confirms</span></div>${cap(unconf,c=>ns(c.code,'never used'))}`:''}</div></div></div>`;
}
