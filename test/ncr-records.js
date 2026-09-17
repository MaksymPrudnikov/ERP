/* NCR — после выдачи заказа: кнопка в заказе, форма без Recut, номер NCR1001,
   Remake — новый заказ без оплаты, список в Sales, полоса в заказе, запрет
   удаления, сохранение, JSON, Glass ID не в Sales. Recut — test/recut.js. */
module.exports=async function({page,eq,ok}){
 console.log('ncr records');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.nrReason=(where,name)=>ncrReasonsFor(where,{activeOnly:true}).find(r=>r.name===name).id;
  window.nrOrder=status=>{const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;if(status)oqThrough(id,status);tab='sales';salesOrderEdit(id);return id;};
  window.nrFill=(id,o)=>{ncrOpenForm('ncr');const rec=salesRecord(id);if(o.action)ncrFormSet('action',o.action);if(o.where)ncrFormSet('where',o.where);if(o.reason)ncrFormSet('reasonId',nrReason(o.where,o.reason));
   (o.lines||[]).forEach(([i,qty,which])=>{ncrFormLine(rec.lines[i].id,'on',true,true);ncrFormLine(rec.lines[i].id,'qty',String(qty));if(which!=null)ncrFormLine(rec.lines[i].id,'which',String(which),true);});if(o.note)ncrForm.note=o.note;};
  window.nrText=()=>document.getElementById('app').innerText;
 });};
 await helpers();

 eq('NCR — у любого сохранённого заказа (частичные отгрузки); Recut — до выдачи; нет у квоты, нового несохранённого и отменённого',await t.p.evaluate(()=>{
  oqReset();const btn=()=>[!!document.querySelector('[data-ncr-open]'),!!document.querySelector('[data-recut-open]')];
  const done=nrOrder('done'),atDone=btn();soDraft.notes='Unsaved';ncrOpenForm('ncr');const unsaved=salesDialog&&salesDialog.title;salesDialog=null;
  soDraft=null;soEdit=null;nrOrder('closed');const atClosed=btn();soDraft=null;soEdit=null;nrOrder('batched');const atBatched=btn();soDraft=null;soEdit=null;nrOrder();const atNew=btn();
  oqOrder(oqCustomer(),{kind:'quote'});const quote=btn();salesOrderNew('order');const fresh=btn();soDraft=null;soEdit=null;const c=nrOrder();salesSetRecordStatus(c,'cancelled');salesOrderEdit(c);const cancelled=btn();
  return {atDone,unsaved,atClosed,atBatched,atNew,quote,fresh,cancelled,form:!!ncrForm};
 }),{atDone:[true,false],unsaved:'Save the order first',atClosed:[true,false],atBatched:[true,true],atNew:[true,true],quote:[false,false],fresh:[false,false],cancelled:[false,false],form:false});

 eq('NCR на место, до которого стекло не дошло: предупреждение, «Create anyway» создаёт; в остальных случаях без предупреждения',await t.p.evaluate(()=>{
  oqReset();const w=(id,where,lines)=>ncrStageWarning(salesRecord(id),{where,action:'Repair',lines:Object.fromEntries(lines.map(([i,which])=>[salesRecord(id).lines[i].id,{on:true,qty:1,which}]))});
  const fresh=nrOrder(),batched=(soDraft=null,soEdit=null,nrOrder('batched')),ready=(soDraft=null,soEdit=null,nrOrder('ready')),done=(soDraft=null,soEdit=null,nrOrder('done'));
  const checks={newHeat:w(fresh,'HEAT',[[0,'unit'],[1,'unit']]),newOffice:w(fresh,'OFFICE',[[0,'unit']]),batchedHeat:w(batched,'HEAT',[[0,'0']]),batchedShip:w(batched,'SHIP',[[0,'unit']]),batchedShipr:w(batched,'SHIPR',[[0,'unit']]),readyShipr:w(ready,'SHIPR',[[0,'unit']]),doneShip:w(done,'SHIP',[[0,'unit']])};
  salesOrderEdit(fresh);nrFill(fresh,{where:'HEAT',reason:'Exploded in furnace',action:'Repair',lines:[[0,1,'unit']]});ncrFormCreate();
  const first={warning:(document.querySelector('[data-ncr-warning]')||{}).textContent,button:document.querySelector('[data-ncr-create]').textContent,records:DB.ncr.length};
  ncrFormCreate();return Object.assign(checks,{first,created:DB.ncr.length,number:DB.ncr[0]&&DB.ncr[0].number,status:salesRecord(fresh).status});
 }),{newHeat:'Not cut yet · Line 1, Line 2',newOffice:'',batchedHeat:'',batchedShip:'No shipment in the system yet',batchedShipr:'Order not ready for shipping yet',readyShipr:'',doneShip:'',
  first:{warning:'⚠ Not cut yet · Line 1',button:'Create anyway',records:0},created:1,number:'NCR1001',status:'new'});

 eq('форма NCR: без Source и без Recut в действиях; причины только выбранного места и активные; проверки',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('done'),rec=salesRecord(id);ncrReasonSetActive(nrReason('HEAT','Roller marks'),false);ncrOpenForm('ncr');
  const source=!!document.querySelector('[data-ncr-source]'),actions=[...document.querySelectorAll('[data-ncr-action-select] option')].map(o=>o.value);
  const before=[...document.querySelectorAll('[data-ncr-reason-select] option')].length;ncrFormSet('where','HEAT');
  const heat=[...document.querySelectorAll('[data-ncr-reason-select] option')].map(o=>o.textContent).slice(1);
  const errors=[];ncrFormCreate();errors.push(ncrForm.error);ncrFormSet('reasonId',nrReason('HEAT','Exploded in furnace'));ncrFormCreate();errors.push(ncrForm.error);
  ncrFormLine(rec.lines[0].id,'on',true,true);ncrFormLine(rec.lines[0].id,'qty','9');ncrFormCreate();errors.push(ncrForm.error);
  ncrFormSet('action','Repair');const which=[...document.querySelectorAll(`[data-ncr-line="${rec.lines[0].id}"] [data-ncr-line-which] option`)].map(o=>o.textContent);
  return {source,actions,before,heat,errors,which,records:DB.ncr.length,title:document.querySelector('.ncr-modal h3').textContent};
 }),{source:false,actions:['Remake order','Repair','Replace from stock','Credit','No action'],before:1,heat:['Impact','Broke','Chipped','Scratched','Fell from dolly / skid','Exploded in furnace','Broke in quench','Broke in heat soak','Bow / warp','Wrong treatment (FT / HS)'],
  errors:['Choose where and what happened.','Select the affected glass.','Line 1: 1 to 2 pcs'],which:['Whole unit','Lite 1 · 6CLEAR','Lite 2 · 6CLEAR'],records:0,title:'New NCR · Order 76002'});

 eq('Remake order у закрытого заказа: новый заказ без оплаты, связанный с NCR; Recut в NCR не принимается',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder();oqPay(id);oqThrough(id,'closed');salesOrderEdit(id);ncrOpenForm('ncr');const action=ncrForm.action;
  const forced=ncrCreate({orderId:id,where:'SHIP',reasonId:nrReason('SHIP','Broke in transit'),action:'Recut',lines:{[salesRecord(id).lines[1].id]:{on:true,qty:1,which:'unit'}},note:''}).error;
  ncrFormSet('where','SHIP');ncrFormSet('reasonId',nrReason('SHIP','Broke in transit'));ncrFormLine(salesRecord(id).lines[1].id,'on',true,true);
  const whichDisabled=document.querySelector(`[data-ncr-line="${salesRecord(id).lines[1].id}"] [data-ncr-line-which]`).disabled;ncrFormCreate();
  const n=DB.ncr[0],o=salesRecord(id),r=salesRecord(n.remakeOrderId);window.nrRemake=[id,r.id];
  return {action,forced,whichDisabled,number:n.number,source:n.source,remake:[r.businessNumber!==o.businessNumber,r.status,r.lines.length,r.lines[0].qty,r.lines[0].width16===o.lines[1].width16,r.makeups.length,r.noCharge,finOrderTotals(r).grand,r.remakeNcrId===n.id,r.notes],
   original:[o.status,o.lines.length],pieces:glassPieceMap(r.id).size>0,status:ncrStatus(n),recuts:DB.recut.length};
 }),{action:'Remake order',forced:'Choose the action.',whichDisabled:true,number:'NCR1001',source:'Customer claim',
  remake:[true,'new',1,1,true,1,true,0,true,'Remake for NCR1001 · order 76002'],original:['closed',2],pieces:true,status:'Open',recuts:0});

 eq('заказ-переделка: полоса Remake for NCR и No charge; снятая галочка возвращает цену; удалить связанные заказы нельзя',await t.p.evaluate(()=>{
  const [id,rid]=nrRemake;ncrViewId='';salesOrderEdit(rid);const strip=document.querySelector('[data-ncr-remake]').innerText.replace(/\s+/g,' ');
  document.querySelector('[data-no-charge]').click();salesOrderSave();const charged=finOrderTotals(salesRecord(rid)).grand>0;
  const del=[salesDeleteBlocked(salesRecord(id)),salesDeleteBlocked(salesRecord(rid))];salesSetRecordStatus(rid,'cancelled');
  return {strip:strip.includes('Remake for NCR1001')&&strip.includes('No charge'),charged,del,done:ncrStatus(DB.ncr[0])};
 }),{strip:true,charged:true,del:[true,true],done:'Done'});

 eq('полоса NCR в исходном заказе: номер, место, причина, действие, количество, статус',await t.p.evaluate(()=>{
  const [id]=nrRemake;salesOrderEdit(id);return [...document.querySelectorAll('[data-ncr-strip]')].map(x=>x.innerText.replace(/\s+/g,' ').trim());
 }),['NCR1001 SHIP · Broke in transit · Remake order · 1 unit Done View']);

 eq('Sales → Show → NCR: строки NCR рядом с заказами, Type, статусы, итог; суммы денег только по заказам; нельзя снять все галочки',await t.p.evaluate(()=>{
  oqReset();const a=nrOrder('done');nrFill(a,{where:'SHIP',reason:'Broke in transit',action:'Remake order',lines:[[0,1]]});ncrFormCreate();ncrViewId='';
  const b=nrOrder('done');nrFill(b,{where:'OFFICE',reason:'Drawing wrong',action:'No action',lines:[[1,1]]});ncrFormCreate();ncrViewId='';soDraft=null;soEdit=null;tab='sales';
  salesShow={orders:true,quotes:false,ncr:false};render();const plainTotal=document.querySelector('[data-sum="total"]').textContent;
  salesListOpenShow(null);const menu=[...document.querySelectorAll('[data-show]')].map(x=>x.dataset.show);salesListMenu=null;salesToggleShow('ncr');
  const rows=[...document.querySelectorAll('[data-ncr-row]')].map(r=>r.innerText.replace(/\s+/g,' ').trim());
  const types=[...document.querySelectorAll('.sl-table tbody .pill.kind-ncr')].length,label=document.querySelector('[data-show-menu]').textContent,foot=document.querySelector('[data-foot-count]').innerText.replace(/\s+/g,' ');
  const total=document.querySelector('[data-sum="total"]').textContent;salesSetStatusFilter('ncr:done');const done=[...document.querySelectorAll('[data-ncr-row]')].length;salesSetStatusFilter('');
  salesToggleShow('orders');const onlyNcr=[...document.querySelectorAll('[data-order-row]')].length+'/'+[...document.querySelectorAll('[data-ncr-row]')].length;salesToggleShow('ncr');const stays=salesShow.ncr;
  document.querySelector('[data-ncr-row] button').click();const opened=!!document.querySelector('[data-ncr-status]');
  return {menu,rows:rows.length,first:rows.some(r=>r.includes('NCR1001')&&r.includes('Open')&&r.includes('Remake order · SHIP · Broke in transit')),types,label,foot:foot.includes('Orders 3 · Quotes 0 · NCR 2')&&/NCR: (Done 1 · Open 1|Open 1 · Done 1)/.test(foot),same:total===plainTotal,done,onlyNcr,stays,opened};
 }),{menu:['orders','quotes','ncr'],rows:2,first:true,types:2,label:'Orders + NCR▾',foot:true,same:true,done:1,onlyNcr:'0/2',stays:true,opened:true});

 const saved=await t.p.evaluate(()=>JSON.stringify([DB.ncr,DB.glassPiece]));
 await t.p.reload();
 eq('после перезагрузки NCR и выбор Show те же',await t.p.evaluate(saved=>({same:JSON.stringify([DB.ncr,DB.glassPiece])===saved,show:salesShow.ncr}),saved),{same:true,show:true});
 await helpers();

 eq('JSON: NCR переживает экспорт и импорт; повтор номера и не-массив не импортируются; запись без номера получает номер',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=m=>{const x=JSON.parse(JSON.stringify(src));m(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  const legacy=JSON.parse(JSON.stringify(src));legacy.ncr[1].number='';const fixed=prepareImportedState(legacy).ncr.map(n=>n.number);
  return {same:JSON.stringify(next.ncr)===JSON.stringify(src.ncr),dup:fail(x=>{x.ncr[1].number=x.ncr[0].number;}),shape:fail(x=>{x.ncr={};}),fixed};
 }),{same:true,dup:'Duplicate NCR number NCR1001.',shape:'The "ncr" field must be an array.',fixed:['NCR1001','NCR1002']});

 eq('Glass ID не видны в Sales: форма, окно NCR, полоса и список; экран без русского; заметка не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('done');nrFill(id,{where:'HEAT',reason:'Broke in quench',action:'Repair',lines:[[0,2,'unit']],note:'<img src=x onerror="window.nrXss=1">'});const texts=[nrText()];ncrFormCreate();texts.push(nrText());
  ncrViewId='';salesOrderEdit(id);texts.push(nrText());soDraft=null;soEdit=null;tab='sales';salesShow={orders:true,quotes:false,ncr:true};render();texts.push(nrText());
  return {pieces:(DB.glassPiece||[]).some(r=>r.ids.length),glassIds:texts.some(s=>/G-\d{7}/.test(s)),russian:texts.some(s=>/[А-яЁё]/.test(s)),imgs:document.querySelectorAll('img').length,xss:!!window.nrXss};
 }),{pieces:true,glassIds:false,russian:false,imgs:0,xss:false});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне форма NCR не шире экрана',await t.p.evaluate(()=>{oqReset();const id=nrOrder('done');ncrOpenForm('ncr');const r=document.querySelector('.ncr-modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;}),true);
 eq('NCR без ошибок страницы',t.errs,[]);await t.c.close();
};
