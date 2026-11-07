/* =====================================================================
   view/carriers-ui  ·  carriers-1.0
   Master Data → Dollies & Skids: список тары, добавить, отключить, что на
   ней сейчас, печать этикеток на TSC (4 × 6″, как стикеры стёкол).
   IN : DB.carrier, carrierContents() (erp/shopfloor/carriers)
   OUT: html
   ===================================================================== */
let carrierSel=new Set();
let carrierEmptied=null;   // последнее обнуление здесь: строка с Undo
let mdCarrierShow='all';   // Loaded · At customers · Empty · All — как в Production
function viewMdCarriers(){
 const contents=carrierContents(),out=skidsOut(),list=(DB.carrier||[]).slice().sort((a,b)=>{const x=CARRIER_RE.exec(a.code),y=CARRIER_RE.exec(b.code);return x[1].localeCompare(y[1])||(+x[2])-(+y[2]);});
 const state=c=>(contents.get(c.code)||[]).length?'loaded':out.has(c.code)?'out':'empty',count=k=>list.filter(c=>k==='all'||state(c)===k).length;
 const on=c=>contents.get(c.code)||[],where=c=>[...new Set(on(c).map(x=>x.place.waiting).filter(Boolean))];
 const nowCell=c=>{const l=on(c),w=where(c),at=out.get(c.code);return l.length?`<b>${l.length}</b> glass${w.length?' · waiting at '+esc(w.join(', ')):''} <span class="mut">since ${esc(carrierSince(l))}</span> <button class="sm" data-carrier-empty="${esc(c.code)}" onclick="carrierEmptyAsk('${esc(c.code)}')">Empty</button>`:at?`<span data-carrier-out>at ${esc(salesCustomerDisplay(at.customerId))} since ${esc(docDate(finLocalDate(at.since)))} · ${esc(at.ps)}</span>`:'<span class="mut">empty</span>';};
 const nowText=c=>{const l=on(c),at=out.get(c.code);return l.length?l.length+' glass'+(where(c).length?' · waiting at '+where(c).join(', '):''):at?'at '+salesCustomerDisplay(at.customerId)+' · '+at.ps:'empty';};
 /* Таблица вида Sales (владелец 07.11.2026); Status, Glass, At customer, Since — в ⚙ Columns. */
 const table=slTable('mdCarriers',{list:list.filter(c=>mdCarrierShow==='all'||state(c)===mdCarrierShow),id:c=>c.code,empty:'No dollies or skids yet',noun:l=>l.length+' dollies and skids',fill:'now',
  columns:()=>[
   {k:'code',label:'Code',type:'text',v:c=>c.code,cell:c=>`<button type="button" class="cw-code sm" data-carrier-open="${esc(c.code)}" title="What is on it" onclick="carrierWinOpen('${esc(c.code)}')">${esc(c.code)}</button>`},
   {k:'kind',label:'Type',type:'list',v:c=>carrierType(c.code).label},
   {k:'now',label:'On it now',type:'text',v:nowText,cell:c=>nowCell(c)},
   {k:'state',label:'Status',type:'list',def:false,v:c=>({loaded:'Loaded',out:'At customer',empty:'Empty'})[state(c)]},
   {k:'glass',label:'Glass',type:'number',def:false,sum:true,v:c=>on(c).length||''},
   {k:'customer',label:'At customer',type:'text',def:false,v:c=>{const at=out.get(c.code);return at?salesCustomerDisplay(at.customerId):'';}},
   {k:'since',label:'Since',type:'date',def:false,v:c=>{const l=on(c),at=out.get(c.code),d=l.map(x=>x.scan.at).filter(Boolean).sort()[0]||(at&&at.since)||'';return d?finLocalDate(d):'';}},
   {k:'note',label:'Note',type:'text',v:c=>c.note,cell:c=>`<input value="${esc(c.note)}" placeholder="Note" onchange="carrierSet('${esc(c.code)}','note',this.value)" style="max-width:220px">`},
   {k:'active',label:'Active',type:'list',v:c=>c.active?'Yes':'No',cell:c=>`<label class="chk"><input type="checkbox" ${c.active?'checked':''} onchange="carrierSet('${esc(c.code)}','active',this.checked);render()"> Active</label>`}],
  row:i=>({attrs:` data-carrier="${esc(i.x.code)}"${i.x.active?'':' class="mut"'}`,first:`<td class="sl-check"><input type="checkbox" ${carrierSel.has(i.x.code)?'checked':''} onchange="carrierPick('${esc(i.x.code)}',this.checked)"></td>`,last:`<button class="sm" onclick="carrierPrintLabels(['${esc(i.x.code)}'])">Label</button>`})});
 return `<div class="sub">DL · DA — dolly, SL · SA — skid.</div>
  <div class="row" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">${CARRIER_TYPES.map(t=>`<button class="sm" data-carrier-add="${t.k}" onclick="carrierAdd('${t.k}',1);render()">+ ${esc(t.label)}</button>`).join('')}
   <span class="cb-seg">${[['loaded','Loaded'],['out','At customers'],['empty','Empty'],['all','All']].map(([k,l])=>`<button type="button" class="${mdCarrierShow===k?'on':''}" data-md-carrier-show="${k}" onclick="mdCarrierShow='${k}';render()">${l} <b>${count(k)}</b></button>`).join('')}</span>
   <span class="sp"></span><button class="sm" ${carrierSel.size?'':'disabled'} onclick="carrierPrintLabels([...carrierSel])">Print ${carrierSel.size||''} label${carrierSel.size===1?'':'s'}</button></div>
  ${carrierEmptied?`<div class="shipping-notice" data-carrier-emptied>${esc(carrierEmptied.code)} emptied · ${carrierEmptied.count} glass without a ${carrierEmptied.word} <button class="sm" data-carrier-empty-undo onclick="carrierEmptyBack()">Undo</button></div>`:''}
  ${table}`;
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
/* Вид наклейки — форма Dolly / Skid label (erp/documents/carrier-form);
   по умолчанию — прежняя (carrierLabelLegacySVG — эталон проверки). */
function carrierLabelSVG(code){return carrierLabelSVGOf(carrierLabelTpl(),code,null);}
function carrierLabelLegacySVG(code){
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
 /* Размер наклейки — из формы Dolly / Skid label (4 × 6 или 3 × 4). */
 const Z=CL_SIZES[carrierLabelSize(carrierLabelTpl())];
 st.textContent='@page stk{size:'+Z.inW+'in '+Z.inH+'in;margin:0}';
 stkPrintHost().innerHTML=list.map(c=>`<div class="stk-print-page" style="width:${Z.inW}in;height:${Z.inH}in" data-carrier-label="${esc(c.code)}">${carrierLabelSVG(c.code)}</div>`).join('');
 document.body.classList.add('stk-printing');
 window.addEventListener('afterprint',stkPrintCleanup,{once:true});setTimeout(stkPrintCleanup,60000);
 try{window.print();}catch(e){stkPrintCleanup();return false;}
 return list.length;
}
