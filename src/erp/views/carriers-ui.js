/* =====================================================================
   view/carriers-ui  ·  carriers-1.0
   Master Data → Dollies & Skids: список тары, добавить, отключить, что на
   ней сейчас, печать этикеток на TSC (4 × 6″, как стикеры стёкол).
   IN : DB.carrier, carrierContents() (erp/shopfloor/carriers)
   OUT: html
   ===================================================================== */
let carrierSel=new Set();
let carrierEmptied=null;   // последнее обнуление здесь: строка с Undo
function viewMdCarriers(){
 const contents=carrierContents(),out=skidsOut(),list=(DB.carrier||[]).slice().sort((a,b)=>{const x=CARRIER_RE.exec(a.code),y=CARRIER_RE.exec(b.code);return x[1].localeCompare(y[1])||(+x[2])-(+y[2]);});
 const rows=list.map(c=>{
  const t=carrierType(c.code),on=contents.get(c.code)||[],where=[...new Set(on.map(x=>x.place.waiting).filter(Boolean))],at=out.get(c.code);
  return `<tr data-carrier="${esc(c.code)}"${c.active?'':' class="mut"'}><td><input type="checkbox" ${carrierSel.has(c.code)?'checked':''} onchange="carrierPick('${esc(c.code)}',this.checked)"></td>
   <td class="mono"><b>${esc(c.code)}</b></td><td>${esc(t.label)}</td>
   <td>${on.length?`<b>${on.length}</b> glass${where.length?' · waiting at '+esc(where.join(', ')):''} <span class="mut">since ${esc(carrierSince(on))}</span> <button class="sm" data-carrier-empty="${esc(c.code)}" onclick="carrierEmptyAsk('${esc(c.code)}')">Empty</button>`:at?`<span data-carrier-out>at ${esc(salesCustomerDisplay(at.customerId))} since ${esc(docDate(finLocalDate(at.since)))} · ${esc(at.ps)}</span>`:'<span class="mut">empty</span>'}</td>
   <td><input value="${esc(c.note)}" placeholder="Note" onchange="carrierSet('${esc(c.code)}','note',this.value)" style="max-width:220px"></td>
   <td><label class="chk"><input type="checkbox" ${c.active?'checked':''} onchange="carrierSet('${esc(c.code)}','active',this.checked);render()"> Active</label></td>
   <td><button class="sm" onclick="carrierPrintLabels(['${esc(c.code)}'])">Label</button></td></tr>`;
 }).join('');
 return `<div class="sub">Scan the dolly or skid, then the glass on it. The code says what to look for: DL · DA — L- and A-shape dolly, SL · SA — L- and A-shape skid.</div>
  <div class="row" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">${CARRIER_TYPES.map(t=>`<button class="sm" data-carrier-add="${t.k}" onclick="carrierAdd('${t.k}',1);render()">+ ${esc(t.label)}</button>`).join('')}
   <span class="sp"></span><button class="sm" ${carrierSel.size?'':'disabled'} onclick="carrierPrintLabels([...carrierSel])">Print ${carrierSel.size||''} label${carrierSel.size===1?'':'s'}</button></div>
  ${carrierEmptied?`<div class="shipping-notice" data-carrier-emptied>${esc(carrierEmptied.code)} emptied · ${carrierEmptied.count} glass without a ${carrierEmptied.word} <button class="sm" data-carrier-empty-undo onclick="carrierEmptyBack()">Undo</button></div>`:''}
  <table><thead><tr><th></th><th>Code</th><th>Type</th><th>On it now</th><th>Note</th><th>Active</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="7" class="empty">No dollies or skids yet</td></tr>'}</tbody></table>`;
}
/* С какого дня на таре лежит самое старое: давно — значит, забыли снять. */
function carrierSince(on){const at=on.map(x=>x.scan.at).filter(Boolean).sort()[0]||'',d=at?finLocalDate(at):'';return !d?'—':d===finToday()?new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):docDate(d);}
/* Стереть всё, что на таре (владелец, 7.10.2026): стекло остаётся на своей
   станции, просто без тары. Спрашиваем один раз; Undo — сразу после. */
function carrierEmptyAsk(code){
 const on=carrierContents().get(code)||[],t=carrierType(code);if(!on.length||!t)return false;
 const word=t.kind==='Skid'?'skid':'dolly';
 salesDialogOpen({title:'Empty '+code+'?',note:on.length+' glass will be without a '+word+'. The glass stays at its station.',buttons:[{label:'Back'},{label:'Empty',kind:'pri',run:()=>{
  const r=carrierEmpty(code,typeof signinUser==='function'?signinUser():null);
  if(r.error){salesDialogOpen({title:'Not emptied',note:r.error,buttons:[{label:'Back'}]});return;}
  carrierEmptied=Object.assign({word},r);render();
 }}]});
 return true;
}
function carrierEmptyBack(){
 const r=carrierEmptied&&carrierEmptyUndo(carrierEmptied);carrierEmptied=null;
 if(r&&r.error)salesDialogOpen({title:'Not undone',note:r.error,buttons:[{label:'Back'}]});else render();
}
function carrierPick(code,on){if(on)carrierSel.add(code);else carrierSel.delete(code);render();}
/* Этикетка 4 × 6″ стоя: крупный код — его видно через цех, тип словами,
   штрихкод Code 128 с тем же текстом — сканер вводит ровно код тары. */
function carrierLabelSVG(code){
 const t=carrierType(code)||{label:''},W=288,H=432,bars=barcode128Items(code,0,0,110,2.4),bw=barcode128Width(code)*2.4,x0=(W-bw)/2;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="4in" height="6in" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
  <text x="${W/2}" y="60" text-anchor="middle" font-size="22" font-weight="700" fill="#000">${esc(t.label.toUpperCase())}</text>
  <text x="${W/2}" y="190" text-anchor="middle" font-size="${code.length>5?84:100}" font-weight="800" fill="#000">${esc(code)}</text>
  <g transform="translate(${x0.toFixed(1)} 250)">${bars.map(b=>`<rect x="${b.x.toFixed(2)}" y="0" width="${b.w.toFixed(2)}" height="110" fill="#000"/>`).join('')}</g>
  <text x="${W/2}" y="390" text-anchor="middle" font-size="18" fill="#000">${esc(code)}</text>
 </svg>`;
}
function carrierPrintLabels(codes){
 const list=(codes||[]).map(carrierFind).filter(Boolean);if(!list.length)return false;
 let st=document.getElementById('stkPageStyle');if(!st){st=document.createElement('style');st.id='stkPageStyle';document.head.appendChild(st);}
 st.textContent='@page stk{size:4in 6in;margin:0}';
 stkPrintHost().innerHTML=list.map(c=>`<div class="stk-print-page" style="width:4in;height:6in" data-carrier-label="${esc(c.code)}">${carrierLabelSVG(c.code)}</div>`).join('');
 document.body.classList.add('stk-printing');
 window.addEventListener('afterprint',stkPrintCleanup,{once:true});setTimeout(stkPrintCleanup,60000);
 try{window.print();}catch(e){stkPrintCleanup();return false;}
 return list.length;
}
