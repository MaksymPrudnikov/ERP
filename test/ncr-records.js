/* Записи NCR на основе заказа: кнопка в заказе, форма, номер NCR1001,
   Recut в очередь этого заказа, Remake — новый заказ без оплаты, список в Sales,
   полоса в заказе, запрет удаления, сохранение, JSON, Glass ID не в Sales. */
module.exports=async function({page,eq,ok}){
 console.log('ncr records');const t=await page();
 const helpers=async()=>{await require('./optimization-fixture')(t.p);await t.p.evaluate(()=>{
  window.nrReason=(where,name)=>ncrReasonsFor(where,{activeOnly:true}).find(r=>r.name===name).id;
  window.nrOrder=status=>{const id=oqOrder(oqCustomer());soDraft=null;soEdit=null;if(status)oqThrough(id,status);tab='sales';salesOrderEdit(id);return id;};
  window.nrFill=(id,o)=>{ncrOpenForm();const rec=salesRecord(id);if(o.source)ncrFormSet('source',o.source);if(o.action)ncrFormSet('action',o.action);if(o.where)ncrFormSet('where',o.where);if(o.reason)ncrFormSet('reasonId',nrReason(o.where,o.reason));
   (o.lines||[]).forEach(([i,qty,which])=>{ncrFormLine(rec.lines[i].id,'on',true,true);ncrFormLine(rec.lines[i].id,'qty',String(qty));if(which!=null)ncrFormLine(rec.lines[i].id,'which',String(which),true);});if(o.note)ncrForm.note=o.note;};
  window.nrText=()=>document.getElementById('app').innerText;
 });};
 await helpers();

 eq('кнопка NCR есть у сохранённого заказа; нет у квоты, нового и отменённого; с несохранёнными правками — сначала сохранить',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('batched'),order=!!document.querySelector('[data-ncr-open]');
  soDraft.notes='Unsaved';ncrOpenForm();const unsaved=salesDialog&&salesDialog.title;salesDialog=null;
  const q=oqOrder(oqCustomer(),{kind:'quote'});const quote=!!document.querySelector('[data-ncr-open]');salesOrderNew('order');const fresh=!!document.querySelector('[data-ncr-open]');
  soDraft=null;soEdit=null;const c=nrOrder();salesSetRecordStatus(c,'cancelled');salesOrderEdit(c);const cancelled=!!document.querySelector('[data-ncr-open]');
  return {order,unsaved,quote,fresh,cancelled,form:!!ncrForm};
 }),{order:true,unsaved:'Save the order first',quote:false,fresh:false,cancelled:false,form:false});

 eq('форма: причины только выбранного места и только активные; проверки не пропускают пустое и лишнее',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('batched'),rec=salesRecord(id);ncrReasonSetActive(nrReason('HEAT','Roller marks'),false);ncrOpenForm();
  const before=[...document.querySelectorAll('[data-ncr-reason-select] option')].length;ncrFormSet('where','HEAT');
  const heat=[...document.querySelectorAll('[data-ncr-reason-select] option')].map(o=>o.textContent).slice(1);
  const errors=[];ncrFormCreate();errors.push(ncrForm.error);ncrFormSet('reasonId',nrReason('HEAT','Exploded in furnace'));ncrFormCreate();errors.push(ncrForm.error);
  ncrFormLine(rec.lines[0].id,'on',true,true);ncrFormLine(rec.lines[0].id,'qty','9');ncrFormCreate();errors.push(ncrForm.error);
  ncrFormLine(rec.lines[0].id,'qty','0');ncrFormCreate();errors.push(ncrForm.error);
  const which=[...document.querySelectorAll(`[data-ncr-line="${rec.lines[0].id}"] [data-ncr-line-which] option`)].map(o=>o.textContent);
  return {before,heat,errors,which,records:DB.ncr.length};
 }),{before:1,heat:['Impact','Broke','Chipped','Scratched','Fell from dolly / skid','Exploded in furnace','Broke in quench','Broke in heat soak','Bow / warp','Wrong treatment (FT / HS)'],
  errors:['Choose where and what happened.','Select the affected glass.','Line 1: affected must be from 1 to 2.','Line 1: affected must be from 1 to 2.'],which:['Whole unit','Lite 1 · 6CLEAR','Lite 2 · 6CLEAR'],records:0});

 eq('Recut: NCR1001, 2 новых стекла Lite 1 в очереди этого заказа с новыми номерами; Ready закрыт до их батча',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('batched'),before=DB.glassPieceSeq;nrFill(id,{where:'HEAT',reason:'Exploded in furnace',lines:[[0,2,0]],note:'Second load'});
  const effect=document.querySelector('[data-ncr-effect]').textContent;ncrFormCreate();
  const n=DB.ncr[0],o=salesRecord(id),rows=glassBatchRows([o]);window.nrRecut=id;
  return {number:n.number,action:n.action,source:n.source,glass:n.glass.map(g=>[g.line,g.lite,g.qty,g.keys.length]),effect,view:document.querySelector('.ncr-modal h3').textContent.startsWith('NCR1001 · Order '),
   rows:rows.map(r=>r.unit+' · '+r.lite+' · '+(r.piece>'G-'+String(before).padStart(7,'0'))),ready:salesRecordTransitionAllowed(o,'ready'),status:ncrStatus(n),pill:salesStatusPill(o).includes('6/8 pcs'),
   lines:o.lines.map(l=>l.qty),queueUnit:glassBatchInfo(rows[0]).memo.unit};
 }),{number:'NCR1001',action:'Recut',source:'Found in shop',glass:[[1,'Lite 1 · 6CLEAR',2,1]],effect:'2 new glass go to the glass queue of order 76002. The order stays open until they are ready.',view:true,
  rows:['NCR1001.1 · 1 · true','NCR1001.2 · 1 · true'],ready:false,status:'Open',pill:true,lines:[2,1],queueUnit:'Recut NCR1001 · 1 of 2'});

 eq('Recut в батче: заказ снова Batched; после Ready NCR — Done; номера перереза не меняются',await t.p.evaluate(()=>{
  const id=nrRecut,pieces=glassBatchRows([salesRecord(id)]).map(r=>r.piece);salesSetRecordStatus(id,'ready');const early=salesRecord(id).status;
  const batch=glassBatchAssign(glassBatchRows([salesRecord(id)]),{deferTouch:true});const n=DB.ncr[0],mid=ncrStatus(n);salesSetRecordStatus(id,'ready');normalizeDB();
  return {early,batch:batch.number,items:batch.items.map(i=>i.unit),same:JSON.stringify(batch.items.map(i=>i.piece))===JSON.stringify(pieces),mid,after:ncrStatus(DB.ncr[0]),status:salesRecord(id).status,
   contents:(()=>{tab='optimization';glassBatchOpen(batch.number);return [...document.querySelectorAll('[data-glass-row]')].map(r=>r.innerText.includes('Recut NCR1001')).every(Boolean);})()};
 }),{early:'batched',batch:'B-0002',items:['NCR1001.1','NCR1001.2'],same:true,mid:'Open',after:'Done',status:'ready',contents:true});

 eq('Recut у закрытого заказа не проходит; Remake order создаёт новый заказ без оплаты, связанный с NCR',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder();oqPay(id);oqThrough(id,'closed');salesOrderEdit(id);ncrOpenForm();const action=ncrForm.action,recutDisabled=[...document.querySelectorAll('[data-ncr-action-select] option')].find(o=>o.value==='Recut').disabled;
  const forced=ncrCreate({orderId:id,source:'Customer claim',where:'SHIP',reasonId:nrReason('SHIP','Broke in transit'),action:'Recut',lines:{[salesRecord(id).lines[1].id]:{on:true,qty:1,which:'unit'}},note:''}).error;
  ncrFormSet('source','Customer claim');ncrFormSet('where','SHIP');ncrFormSet('reasonId',nrReason('SHIP','Broke in transit'));ncrFormLine(salesRecord(id).lines[1].id,'on',true,true);
  const whichDisabled=document.querySelector(`[data-ncr-line="${salesRecord(id).lines[1].id}"] [data-ncr-line-which]`).disabled;ncrFormCreate();
  const n=DB.ncr[0],o=salesRecord(id),r=salesRecord(n.remakeOrderId);window.nrRemake=[id,r.id];
  return {action,recutDisabled,forced,whichDisabled,number:n.number,remake:[r.businessNumber!==o.businessNumber,r.status,r.lines.length,r.lines[0].qty,r.lines[0].width16===o.lines[1].width16,r.makeups.length,r.noCharge,finOrderTotals(r).grand,r.remakeNcrId===n.id,r.notes],
   original:[o.status,o.lines.length],pieces:glassPieceMap(r.id).size>0,status:ncrStatus(n)};
 }),{action:'Remake order',recutDisabled:true,forced:'The order is closed. Use Remake order instead of Recut.',whichDisabled:true,number:'NCR1001',
  remake:[true,'new',1,1,true,1,true,0,true,'Remake for NCR1001 · order 76002'],original:['closed',2],pieces:true,status:'Open'});

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
  oqReset();const a=nrOrder('batched');nrFill(a,{where:'HEAT',reason:'Exploded in furnace',lines:[[0,1,0]]});ncrFormCreate();ncrViewId='';
  const b=nrOrder();nrFill(b,{where:'OFFICE',reason:'Drawing wrong',action:'No action',lines:[[1,1]]});ncrFormCreate();ncrViewId='';soDraft=null;soEdit=null;tab='sales';
  salesShow={orders:true,quotes:false,ncr:false};render();const plainTotal=document.querySelector('[data-sum="total"]').textContent;
  salesListOpenShow(null);const menu=[...document.querySelectorAll('[data-show]')].map(x=>x.dataset.show);salesListMenu=null;salesToggleShow('ncr');
  const rows=[...document.querySelectorAll('[data-ncr-row]')].map(r=>r.innerText.replace(/\s+/g,' ').trim());
  const types=[...document.querySelectorAll('.sl-table tbody .pill.kind-ncr')].length,label=document.querySelector('[data-show-menu]').textContent,foot=document.querySelector('[data-foot-count]').innerText.replace(/\s+/g,' ');
  const total=document.querySelector('[data-sum="total"]').textContent;salesSetStatusFilter('ncr:done');const done=[...document.querySelectorAll('[data-ncr-row]')].length;salesSetStatusFilter('');
  salesToggleShow('orders');const onlyNcr=[...document.querySelectorAll('[data-order-row]')].length+'/'+[...document.querySelectorAll('[data-ncr-row]')].length;salesToggleShow('ncr');const stays=salesShow.ncr;
  document.querySelector('[data-ncr-row] button').click();const opened=!!document.querySelector('[data-ncr-status]');
  return {menu,rows:rows.length,first:rows.some(r=>r.includes('NCR1001')&&r.includes('Open')&&r.includes('Recut · HEAT · Exploded in furnace')),types,label,foot:foot.includes('Orders 2 · Quotes 0 · NCR 2')&&/NCR: (Done 1 · Open 1|Open 1 · Done 1)/.test(foot),same:total===plainTotal,done,onlyNcr,stays,opened};
 }),{menu:['orders','quotes','ncr'],rows:2,first:true,types:2,label:'Orders + NCR▾',foot:true,same:true,done:1,onlyNcr:'0/2',stays:true,opened:true});

 const saved=await t.p.evaluate(()=>JSON.stringify([DB.ncr,DB.glassPiece]));
 await t.p.reload();
 eq('после перезагрузки NCR, номера перереза и выбор Show те же',await t.p.evaluate(saved=>({same:JSON.stringify([DB.ncr,DB.glassPiece])===saved,show:salesShow.ncr}),saved),{same:true,show:true});
 await helpers();

 eq('JSON: NCR переживает экспорт и импорт; повтор номера и не-массив не импортируются; запись без номера получает номер',await t.p.evaluate(()=>{
  const src=JSON.parse(JSON.stringify(DB)),next=prepareImportedState(JSON.parse(JSON.stringify(src)));
  const fail=m=>{const x=JSON.parse(JSON.stringify(src));m(x);try{prepareImportedState(x);return '';}catch(e){return e.message;}};
  const legacy=JSON.parse(JSON.stringify(src));legacy.ncr[1].number='';const fixed=prepareImportedState(legacy).ncr.map(n=>n.number);
  return {same:JSON.stringify(next.ncr)===JSON.stringify(src.ncr),dup:fail(x=>{x.ncr[1].number=x.ncr[0].number;}),shape:fail(x=>{x.ncr={};}),fixed};
 }),{same:true,dup:'Duplicate NCR number NCR1001.',shape:'The "ncr" field must be an array.',fixed:['NCR1001','NCR1002']});

 eq('Glass ID не видны в Sales: форма, окно NCR, полоса и список; экран без русского; заметка не исполняет HTML',await t.p.evaluate(()=>{
  oqReset();const id=nrOrder('batched');nrFill(id,{where:'HEAT',reason:'Broke in quench',lines:[[0,2,'unit']],note:'<img src=x onerror="window.nrXss=1">'});const texts=[nrText()];ncrFormCreate();texts.push(nrText());
  ncrViewId='';salesOrderEdit(id);texts.push(nrText());soDraft=null;soEdit=null;tab='sales';salesShow={orders:true,quotes:false,ncr:true};render();texts.push(nrText());
  return {pieces:(DB.glassPiece||[]).some(r=>r.ids.length),glassIds:texts.some(s=>/G-\d{7}/.test(s)),russian:texts.some(s=>/[А-яЁё]/.test(s)),imgs:document.querySelectorAll('img').length,xss:!!window.nrXss};
 }),{pieces:true,glassIds:false,russian:false,imgs:0,xss:false});

 await t.p.setViewportSize({width:390,height:844});
 eq('на телефоне форма NCR не шире экрана',await t.p.evaluate(()=>{oqReset();const id=nrOrder('batched');ncrOpenForm();const r=document.querySelector('.ncr-modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1;}),true);
 eq('NCR без ошибок страницы',t.errs,[]);await t.c.close();
};
