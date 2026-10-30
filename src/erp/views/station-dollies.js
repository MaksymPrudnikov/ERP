/* =====================================================================
   view/station-dollies  ·  carriers-3.0
   Вкладка Dollies на станции (план доработок v1.16, пункты 3 и 7, этап 8;
   владелец выбрал вариант 2, 30.10.2026): вся тара списком, поле «скан или
   номер» и карточка выбранной — что на ней, Empty, Print label;
   Register new — новая тара, пришедшая в цех.
   IN : DB.carrier, carrierContents(), skidsOut() · stationWho()
   OUT: html; команды erp/shopfloor/carriers (carrierEmpty, carrierRegister,
        carrierPrintLog) и печать этикетки carrierPrintLabels (view/carriers-ui)
   Скан тары в этой вкладке только выбирает её: не «кладу на», не забирает
   стекло без тары, не оформляет возврат скида (P3-R1, P7-R5). Скан стекла —
   обычный скан, экран уходит на Scan.
   ===================================================================== */
let stationDollyShow='all';   // all | loaded | empty | out
let stationDollyCode='';      // выбранная тара
let stationDollyAsk='';       // Empty: первое нажатие сделано
let stationDollyWarn=null;    // {code, sig} — этикетка занятой тары ждёт подтверждения
let stationDollyReg=null;     // {type, req, error, done}
let stationDollyEmptied=null; // последнее обнуление здесь — для Undo
let stationDollyNote='';

function stationDollyInfo(code,contents,out){
 const on=contents.get(code)||[],x=out.get(code);
 if(on.length){const w=[...new Set(on.map(i=>i.place.waiting).filter(Boolean))];return {code,st:'loaded',n:stationTareCount(on),where:(w.length?'waiting at '+w.join(', '):'on it')+' since '+carrierSince(on),orders:[...new Set(on.map(i=>i.g.o.businessNumber||''))].filter(Boolean)};}
 if(x)return {code,st:'out',n:'',where:'at '+salesCustomerDisplay(x.customerId)+' since '+docDate(finLocalDate(x.since))+' · '+x.ps+' · '+stationPlural(skidDays(x.since),'day','days'),orders:[]};
 return {code,st:'empty',n:'',where:'',orders:[]};
}
/* Скан или набранный номер во вкладке: только выбор. Не тара — null, и
   скан идёт обычным путём. */
function stationDollyScan(raw){
 const code=carrierCode(raw);if(!CARRIER_RE.test(code))return null;
 return stationDollyPick(code)?'dollyPick':'dollyUnknown';
}
function stationDollyPick(code){
 const c=carrierFind(code);stationDollyAsk='';stationDollyWarn=null;stationDollyReg=null;stationDollyEmptied=null;
 if(!c){stationDollyCode='';stationDollyNote=carrierCode(code)+' not found · nothing created';stationBeep('error');render();return false;}
 stationDollyCode=c.code;stationDollyNote='';stationBeep('info');render();return true;
}
function stationDollyClose(){stationDollyCode='';stationDollyAsk='';stationDollyWarn=null;stationDollyEmptied=null;render();}
/* Empty в два нажатия; стекло остаётся на своей станции без тары (P3-R3),
   обнуляется вся тара, не только то, что видит эта станция (P3-R2). */
function stationDollyEmpty(){
 const code=stationDollyCode;if(!code)return false;
 if(stationDollyAsk!==code){stationDollyAsk=code;render();return false;}
 stationDollyAsk='';const list=carrierContents().get(code)||[],what=list.length?stationTareCount(list):'',mine=stationPutOn()===code;
 const r=carrierEmpty(code,stationWho());
 if(r.error){stationDollyNote=r.error;stationBeep('error');render();return false;}
 /* Эта станция клала на неё — кладёт и дальше (свой выбор не устарел). */
 if(mine)stationSetPutOn(code);
 stationDollyEmptied=Object.assign({what},r);stationBeep('ok');render();return true;
}
function stationDollyEmptyUndo(){
 const r=stationDollyEmptied&&carrierEmptyUndo(stationDollyEmptied);stationDollyEmptied=null;
 stationDollyNote=r&&r.error?r.error:'Back on '+stationDollyCode;stationBeep(r&&r.error?'error':'twice');render();
}
/* Этикетка: свободная — сразу; занятая или у клиента — сначала
   предупреждение с тем, что на ней сейчас (P7-R6). Подтверждение
   разрешает только печать. */
function stationDollySig(code){const i=stationDollyInfo(code,carrierContents(),skidsOut());return i.st+'|'+i.n+'|'+i.where;}
function stationDollyPrint(confirmed){
 const code=stationDollyCode;if(!code||!carrierFind(code))return false;
 const sig=stationDollySig(code),busy=!sig.startsWith('empty');
 if(busy&&!(confirmed&&stationDollyWarn&&stationDollyWarn.code===code&&stationDollyWarn.sig===sig)){
  stationDollyNote=confirmed?'Changed — check and reprint':'';stationDollyWarn={code,sig};render();return false;
 }
 stationDollyWarn=null;return stationDollyLabel(code);
}
function stationDollyLabel(code){
 const log=carrierPrintLog(code,stationWho(),stationCode);
 stationDollyNote=log.ok?'Label sent to print · '+code:log.error;
 const n=carrierPrintLabels([code]);render();return n;
}
/* Register new: тип — плиткой, номер даёт система; одно окно — одна тара. */
function stationDollyRegOpen(){stationDollyReg={type:'',req:salesUid('RQ'),error:'',done:''};stationDollyCode='';stationDollyWarn=null;stationDollyEmptied=null;stationDollyNote='';render();}
function stationDollyRegType(k){if(!stationDollyReg||stationDollyReg.done)return;stationDollyReg.type=k;stationDollyReg.error='';render();}
function stationDollyRegSave(){
 const g=stationDollyReg;if(!g||!g.type)return false;
 const r=carrierRegister(g.type,stationWho(),stationCode,g.req);
 if(r.error){g.error=r.error;stationBeep('error');render();return false;}
 g.done=r.code;stationBeep('ok');render();return r.code;
}

function stationDollyRowsHTML(list){
 return list.map(i=>'<div class="st-dl st-dly-row'+(i.code===stationDollyCode?' now':'')+'" data-station-dolly-row="'+esc(i.code)+'" onclick="stationDollyPick(\''+esc(i.code)+'\')"><span class="st-dchip'+(/^S/.test(i.code)?' skid':'')+'">'+esc(i.code)+'</span>'+
  '<span class="st-src-t"><b>'+(i.st==='loaded'?esc(i.n):i.st==='out'?'At customer':'Empty')+'</b> <span class="mut">'+esc(i.where.replace(/^waiting /,''))+'</span></span>'+
  '<span>'+(i.st==='loaded'?'<span class="pill warn">loaded</span>':i.st==='out'?'<span class="pill bad">at customer</span>':'<span class="pill ok">empty</span>')+'</span></div>').join('');
}
function stationDollyCardHTML(i){
 const c=carrierFind(i.code),t=carrierType(i.code),word=t.kind==='Skid'?'skid':'dolly',ask=stationDollyAsk===i.code,warn=stationDollyWarn&&stationDollyWarn.code===i.code;
 const reg=c&&c.regAt?'<div class="mut">Registered '+esc(docDate(finLocalDate(c.regAt)))+(c.regBy?' · '+esc(c.regBy):'')+(c.regStation?' · '+esc(c.regStation):'')+'</div>':'';
 const done=stationDollyEmptied&&stationDollyEmptied.code===i.code;
 const acts=warn?'<button type="button" class="b" data-dolly-warn-back onclick="stationDollyWarn=null;render()">Back</button><button type="button" class="b st-yes" data-dolly-reprint onclick="stationDollyPrint(true)">'+ico('printer')+'Reprint label</button>':
  '<button type="button" class="b" data-dolly-print onclick="stationDollyPrint()">'+ico('printer')+'Print label</button>'+
  (i.st==='loaded'&&!(stationIsShip()&&/^S[LA]-/.test(i.code))?'<button type="button" class="b'+(ask?' st-red-b':'')+'" data-dolly-empty onclick="stationDollyEmpty()">'+(ask?'Empty '+esc(i.n)+' — tap again':'Empty '+esc(i.code))+'</button>':'')+
  (done?'<button type="button" class="b" data-dolly-empty-undo onclick="stationDollyEmptyUndo()">Undo</button>':'')+
  '<span class="sp"></span><button type="button" class="b" onclick="stationDollyClose()">Close</button>';
 return '<div class="st-res st-dly-card'+(warn?' warn':done?' st-ok':'')+'" data-station-dolly-card="'+esc(i.code)+'"><div class="st-res-h">'+(done?'✓ '+esc(i.code)+' emptied · '+esc(stationDollyEmptied.what||stationDollyEmptied.count+' glass')+' without a '+word:esc(i.code)+' · '+esc(t.label))+'<span>'+esc(i.n)+'</span></div>'+
  '<div class="st-res-b"><div class="st-big st-dark"><small>'+({loaded:'ON IT NOW',out:'AT CUSTOMER',empty:'EMPTY'})[i.st]+'</small><b>'+esc(i.code)+'</b><span>'+esc(t.label)+'</span></div>'+
  '<div class="st-info"><div class="st-gid">'+(i.st==='loaded'?'<b>'+esc(i.n)+'</b> · ':'')+esc(i.where||'Nothing on it')+'</div>'+(i.orders.length?'<div class="mut">Orders '+esc(i.orders.slice(0,6).join(' · ')+(i.orders.length>6?' +'+(i.orders.length-6):''))+'</div>':'')+reg+
  (ask?'<div class="st-dly-red">The glass stays where it is, just without a '+word+'.</div>':done?'<div class="mut">Glass stays at its station · scan the '+word+' on Scan to put on it</div>':'')+'</div></div>'+
  (warn?'<div class="st-dly-warn" role="alert" data-dolly-warn><b>⚠ '+esc(i.code)+' is '+(i.st==='out'?'at a customer':'in use')+'. Reprint its label for the same '+word+'?</b><span>'+esc(i.where)+(i.orders.length?' · '+esc(i.orders.slice(0,3).join(' · ')):'')+'. Stick it only on this '+word+'.</span></div>':'')+
  '<div class="st-acts">'+acts+'</div></div>';
}
function stationDollyRegHTML(){
 const g=stationDollyReg;
 if(g.done){const t=carrierType(g.done),c=carrierFind(g.done);
  return '<div class="st-res st-ok" data-station-dolly-reg-done="'+esc(g.done)+'"><div class="st-res-h">✓ '+esc(g.done)+' registered<span>'+esc((c&&c.regBy||'')+' · '+stationCode+' · '+stationTime(c&&c.regAt))+'</span></div><div class="st-res-b"><div class="st-dly-label">'+carrierLabelSVG(g.done).replace('width="4in" height="6in"','width="100%"')+'</div>'+
   '<div class="st-info"><div class="st-gid">New '+esc(t.label)+' · <b>'+esc(g.done)+'</b></div><div class="mut">Print the label and stick it on this '+(t.kind==='Skid'?'skid':'dolly')+'.</div><div class="st-acts st-dly-acts"><button type="button" class="b st-yes" data-dolly-reg-print onclick="stationDollyLabel(\''+esc(g.done)+'\')">'+ico('printer')+'Print label</button><button type="button" class="b" onclick="stationDollyReg=null;stationDollyPick(\''+esc(g.done)+'\')">Done</button></div></div></div></div>';}
 return '<div class="card st-dly-reg" data-station-dolly-reg><div class="st-sec"><h3>Register a new dolly or skid</h3></div><div class="st-dly-types">'+
  CARRIER_TYPES.map(t=>'<button type="button" class="st-gbtn'+(g.type===t.k?' on':'')+'" data-dolly-reg-type="'+t.k+'" onclick="stationDollyRegType(\''+t.k+'\')"><b>'+esc(t.label)+'</b><span>next number '+t.k+'-'+carrierNextNo(t.k)+'</span></button>').join('')+'</div>'+
  '<div class="mut">Only a new dolly or skid that came to the shop. The number is given by the system.</div>'+(g.error?'<div class="st-pin-err" role="alert">'+esc(g.error)+'</div>':'')+
  '<div class="st-acts st-dly-acts"><button type="button" class="b" onclick="stationDollyReg=null;render()">Back</button>'+(g.type?'<button type="button" class="b st-yes" data-dolly-reg-save onclick="stationDollyRegSave()">Register '+g.type+'-'+carrierNextNo(g.type)+'</button>':'')+'</div></div>';
}
function stationDolliesView(){
 const contents=carrierContents(),out=typeof skidsOut==='function'?skidsOut():new Map();
 const all=(DB.carrier||[]).filter(c=>c.active).sort((a,b)=>{const x=CARRIER_RE.exec(a.code),y=CARRIER_RE.exec(b.code);return CARRIER_TYPES.findIndex(t=>t.k===x[1])-CARRIER_TYPES.findIndex(t=>t.k===y[1])||(+x[2])-(+y[2]);}).map(c=>stationDollyInfo(c.code,contents,out));
 const n=k=>k==='all'?all.length:all.filter(i=>i.st===k).length,list=all.filter(i=>stationDollyShow==='all'||i.st===stationDollyShow);
 const sel=stationDollyCode&&carrierFind(stationDollyCode)?stationDollyInfo(stationDollyCode,contents,out):null;
 return '<div class="st-body st-dly" data-station-dollies><div class="st-col"><div class="card"><div class="st-sec"><h3>Dollies &amp; skids</h3><span class="mut">'+all.length+' · tap or scan one</span><span class="sp"></span><button type="button" class="b" data-dolly-reg-open onclick="stationDollyRegOpen()">+ Register new</button></div>'+
  '<div class="cb-seg st-dly-seg">'+[['all','All'],['loaded','Loaded'],['empty','Empty'],['out','At customers']].map(([k,l])=>'<button type="button" class="'+(stationDollyShow===k?'on':'')+'" data-dolly-show="'+k+'" onclick="stationDollyShow=\''+k+'\';render()">'+l+' <b>'+n(k)+'</b></button>').join('')+'</div>'+
  (list.length?stationDollyRowsHTML(list):'<div class="empty">'+(all.length?'None here':'No dollies or skids yet')+'</div>')+'</div></div>'+
  '<div class="st-col"><label class="st-scan st-dly-find"><span class="st-scan-ico">'+ico('scan')+'</span><span class="st-scan-lab"><b>DOLLY OR SKID</b><input id="stationScanField" data-station-scan autocomplete="off" spellcheck="false" placeholder="Scan or type: DL-2" onkeydown="stationKey(event,this)"></span></label>'+
  (stationDollyNote?'<div class="st-note" data-dolly-note>'+esc(stationDollyNote)+'</div>':'')+
  (stationDollyReg?stationDollyRegHTML():sel?stationDollyCardHTML(sel):'<div class="st-idle">Scan a dolly or skid, or tap one in the list. Nothing is put on it.</div>')+'</div></div>';
}
