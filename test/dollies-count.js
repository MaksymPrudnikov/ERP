/* Этап 8 плана доработок v1.16 (владелец, 30.10.2026: «Станция 2, офис 1»):
   пункт 3 — Empty Dolly / Skid на станции, пункт 7 — Register new, этикетки,
   постоянные номера, пересчёт и учёт тары у нас и у клиентов. Вкладка Dollies
   на станции (вариант 2), плитки и Count на Production → Dollies & Skids
   (вариант 1). Проверки — по матрице плана (P3-01…P3-05, P7-01…P7-16, E2E-04). */
module.exports=async function({page,eq}){
 console.log('dollies-count');const t=await page();
 await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{window.dcPrinted=(window.dcPrinted||0)+1;};
  window.dcReset=function(){oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.carrier=[];DB.carrierSeq={};DB.carrierEvent=[];DB.carrierCount=[];DB.skidReturn=[];DB.sheetBreak=[];
   stationLast=null;stationSheetView=null;stationIncoming='';stationNote='';stationDrawer=null;stationTab='scan';stationDollyCode='';stationDollyReg=null;stationDollyWarn=null;stationDollyNote='';stationDollyEmptied=null;carrierCountShow='';window.dcPrinted=0;
   try{localStorage.removeItem(STATION_SESSION_KEY);}catch(e){}
   if(!DB.glassSheet.some(s=>s.productCode==='6CLEAR'&&+s.sheetWIn===144))DB.glassSheet.push(normalizeGlassSheet({productCode:'6CLEAR',supplier:'Vitro',sheetWIn:144,sheetHIn:96,availability:'stock'}));};
  window.dcOrder=function(sizes,name){
   const id=oqOrder(oqCustomer({legalName:name||'North Shore Windows'}),{dueDate:'2026-11-06'});
   salesOrderEdit(id);const m=soDraft.makeups[0];m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];
   soDraft.lines=sizes.map(([w,h,q],i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:w*16,height16:h*16,qty:q||1,mark:'M'+(i+1)});salesEnsureLineShape(l);return l;});
   soDraft.lines.forEach(l=>salesLineChargeRows(l).forEach(r=>{salesEnsureChargePricing(l,r).orderRate=0.013;}));
   soDraft.customerPo='PO-QA';if(!salesOrderSave())throw new Error('order not saved');soDraft=null;soEdit=null;oqThrough(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});return id;
  };
  window.dcIds=id=>[...glassPieceMap(id).values()].flatMap(r=>r.ids);
  window.dcLogin=function(station,name){if(!DB.user.some(u=>u.name===name)){DB.user.push({name,role:'Shop',station,skills:[],pin:'0000'});normalizeUsers();}stationCode=station;tab='station';stationIncoming='';stationLogin(DB.user.find(u=>u.name===name).viewProfileId);};
  window.dcOn=code=>(carrierContents().get(code)||[]).map(x=>x.id);
  window.dcText=s=>{const el=document.querySelector(s);return el?el.textContent.replace(/\s+/g,' ').trim():'';};
  window.dcProd=()=>JSON.stringify([DB.stationScan,DB.carrier,DB.skidReturn,DB.shipment]);
 });

 /* План 5.3: A с g1/g2, B на полировке с g3; g1/g2 переложили на B без скана. */
 eq('P3-01: Empty A на станции — g1/g2 без тары, прогресс тот же; на A только g4; на C — только отсканированные g1/g2/g3',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',3);const id=dcOrder([[36,24,4]]),g=dcIds(id);
  /* CUT: g1/g2 — на A (DL-1), g3 — на B (DL-2), g4 — в руках, без тары. */
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit(g[1]);stationSubmit('DL-2');stationSubmit(g[2]);stationClearPutOn();stationSubmit(g[3]);stationSwitch();
  const before=[g[0],g[1]].map(p=>stationPlace(stationGlass(p)).waiting).join();
  /* ARRIS: A стоит пустая (g1/g2 переложили на B руками) — Empty во вкладке Dollies. */
  dcLogin('ARRIS','Oleg K.');stationTab='dollies';render();stationSubmit('DL-1');stationDollyEmpty();stationDollyEmpty();
  const after=[g[0],g[1]].map(p=>stationPlace(stationGlass(p)).waiting).join(),a0=dcOn('DL-1').length;
  stationTab='scan';stationSubmit('DL-1');stationSubmit(g[3]);const a1=dcOn('DL-1');
  stationSubmit('DL-3');[g[0],g[1],g[2]].forEach(p=>stationSubmit(p));stationSwitch();
  const c=dcOn('DL-3').sort().join()===[g[0],g[1],g[2]].sort().join(),a=dcOn('DL-1').join()===g[3];
  return {before,after,a0,a1:a1.length,c,a,dl2:dcOn('DL-2').length};
 }),{before:'ARRIS,ARRIS',after:'ARRIS,ARRIS',a0:0,a1:1,c:true,a:true,dl2:0});

 eq('P3-02, P7-03: выбор тары во вкладке Dollies (скан и номер руками) при стекле без тары — ничего не назначается, не «кладу на»; Empty — вся A, и стекло другой станции',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',2);const id=dcOrder([[36,24,4]]),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit(g[1]);stationClearPutOn();stationSubmit(g[2]);
  const loose=stationLoose().length;stationTab='dollies';render();
  const field=document.querySelector('[data-station-dollies] [data-station-scan]');field.value='dl-1';stationKey({key:'Enter',preventDefault(){}},field);
  const picked={tab:stationTab,code:stationDollyCode,put:stationPutOn(),loose:stationLoose().length,on:dcOn('DL-1').length,card:!!document.querySelector('[data-station-dolly-card="DL-1"]')};
  stationSwitch();dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();stationSubmit('DL-1');
  const ask0=dcText('[data-dolly-empty]');stationDollyEmpty();const ask1=dcText('[data-dolly-empty]');stationDollyEmpty();
  stationSwitch();
  return {loose,picked,ask0,ask1,on:dcOn('DL-1').length,looseLeft:DB.stationScan.filter(s=>s.piece===g[2]&&!s.on).length};
 }),{loose:1,picked:{tab:'dollies',code:'DL-1',put:'',loose:1,on:2,card:true},ask0:'Empty DL-1',ask1:'Empty 2 glass — tap again',on:0,looseLeft:1});

 eq('P3-03: Undo обнуления возвращает только нетронутое; новое стекло на A не трогается, перенесённое на C не забирается',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',3);const id=dcOrder([[36,24,4]]),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');[g[0],g[1],g[2]].forEach(p=>stationSubmit(p));stationClearPutOn();stationSubmit(g[3]);stationSwitch();
  dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();stationSubmit('DL-1');stationDollyEmpty();stationDollyEmpty();const r1=stationDollyEmptied;
  stationDollyEmptyUndo();const back=dcOn('DL-1').length;
  stationDollyEmpty();stationDollyEmpty();const r2=stationDollyEmptied;
  stationTab='scan';stationSubmit('DL-3');stationSubmit(g[0]);stationSubmit('DL-1');stationSubmit(g[3]);
  carrierEmptyUndo(r2);
  const out={first:r1.count,back,a:dcOn('DL-1').length,c:dcOn('DL-3').join()===g[0],aHasG4:dcOn('DL-1').includes(g[3])};stationSwitch();return out;
 }),{first:3,back:3,a:3,c:true,aHasG4:true});

 eq('P3-04: «кладу на A», выбранное в другой вкладке до Empty, устарело — стекло ждёт тару; выбор после Empty и своя станция кладут дальше',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',2);const id=dcOrder([[36,24,4]]),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);
  /* Другая вкладка (офис) обнуляет A; сессия CUT всё ещё «кладёт на A». */
  const s=stationSessions();s.CUT.putOnAt=new Date(Date.now()-60000).toISOString();stationSessionsSave(s);
  carrierEmpty('DL-1',{name:'Office'});
  const stale=stationPutOn();stationSubmit(g[1]);const g2=DB.stationScan.filter(x=>x.piece===g[1]).pop().on||'';
  stationSubmit('DL-1');stationSubmit(g[2]);const fresh=DB.stationScan.filter(x=>x.piece===g[2]).pop().on||'';
  /* Своя станция обнулила свою «кладу на» — кладёт на неё и дальше. */
  stationSubmit('DL-1');stationSkidEmpty('DL-1');stationSkidEmpty('DL-1');const own=stationPutOn();stationSubmit(g[3]);const g4=DB.stationScan.filter(x=>x.piece===g[3]).pop().on||'';
  stationSwitch();return {stale,g2,fresh,own,g4};
 }),{stale:'',g2:'',fresh:'DL-1',own:'DL-1',g4:'DL-1'});

 eq('P3-05: офисный Empty работает как раньше; на SHIP у скида во вкладке Dollies нет Empty',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',1);carrierAdd('SL',1);const id=dcOrder([[36,24,2]]),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');g.forEach(p=>stationSubmit(p));stationSwitch();
  tab='masterdata';mdSetTab('carriers');const asked=carrierEmptyAsk('DL-1');oqChoose('Empty');const office=dcOn('DL-1').length;
  DB.stationScan.filter(s=>s.piece===g[0]).pop().on='SL-1';touch();
  dcLogin('SHIP','Petro D.');stationTab='dollies';render();stationSubmit('SL-1');const ship=!!document.querySelector('[data-dolly-empty]');stationSwitch();
  return {asked,office,ship};
 }),{asked:true,office:0,ship:false});

 eq('P7-01, P7-05: Print label свободной тары — та же этикетка 4 × 6, что в офисе, запись в журнал; тара, стекло и номер не меняются; печать стекла потом — без этикетки тары',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',1);carrierAdd('DA',1);carrierAdd('SL',1);carrierAdd('SA',1);const before=dcProd();
  dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();
  const labels=['DL-1','DA-1','SL-1','SA-1'].map(code=>{stationSubmit(code);document.querySelector('[data-dolly-print]').click();const el=document.querySelector('[data-carrier-label]'),ref=document.createElement('div');ref.innerHTML=carrierLabelSVG(code);return !!el&&el.dataset.carrierLabel===code&&el.innerHTML===ref.innerHTML;});
  const page=document.getElementById('stkPageStyle').textContent,printed=window.dcPrinted,log=DB.carrierEvent.map(e=>e.kind+':'+e.code+':'+e.by+':'+e.station).join('|');
  stkPrintCleanup();stationSwitch();
  return {labels,page,printed,log,same:dcProd()===before,left:!!document.querySelector('[data-carrier-label]')};
 }),{labels:[true,true,true,true],page:'@page stk{size:4in 6in;margin:0}',printed:4,log:'print:DL-1:Andrii S.:ARRIS|print:DA-1:Andrii S.:ARRIS|print:SL-1:Andrii S.:ARRIS|print:SA-1:Andrii S.:ARRIS',same:true,left:false});

 eq('P7-02: занятая тара и скид у клиента — сначала предупреждение (Back — печати нет); поменялось — предупреждение заново; подтверждение печатает, ничего не меняя',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',1);const c=oqCustomer({legalName:'Lakeview Glass & Mirror'}),id=dcOrder([[36,24,2]],'Lakeview Glass & Mirror'),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSwitch();
  dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();stationSubmit('DL-1');
  document.querySelector('[data-dolly-print]').click();const warn=dcText('[data-dolly-warn] b'),p0=window.dcPrinted;
  document.querySelector('[data-dolly-warn-back]').click();const back=!document.querySelector('[data-dolly-warn]')&&window.dcPrinted===0;
  document.querySelector('[data-dolly-print]').click();
  /* Пока окно открыто, на A положили ещё стекло. */
  DB.stationScan.push(Object.assign({},DB.stationScan.find(s=>s.piece===g[0]),{id:'SCX',piece:g[1],at:new Date().toISOString()}));touch();
  const before=dcProd();document.querySelector('[data-dolly-reprint]').click();const again=window.dcPrinted===0&&dcText('[data-dolly-warn] span').startsWith('waiting at')&&dcText('[data-dolly-note]');
  document.querySelector('[data-dolly-reprint]').click();const printed=window.dcPrinted,same=dcProd()===before;
  stkPrintCleanup();
  /* Скид у клиента. */
  carrierAdd('SL',1);DB.shipment.push({id:'PSX',number:'PS-0014',customerId:c.id,status:'shipped',method:'delivery',shippedAt:new Date(Date.now()-3*864e5).toISOString(),items:[],skidsOut:['SL-1']});
  stationSubmit('SL-1');document.querySelector('[data-dolly-print]').click();const out=dcText('[data-dolly-warn] b')+' / '+dcText('[data-dolly-warn] span');
  stationSwitch();
  return {warn,p0,back,again,printed,same,out:out.replace(/since .*? ·/,'since D ·')};
 }),{warn:'⚠ DL-1 is in use. Reprint its label for the same dolly?',p0:0,back:true,again:'Changed — check and reprint',printed:1,same:true,
  out:'⚠ SL-1 is at a customer. Reprint its label for the same skid? / at Lakeview Glass & Mirror since D · PS-0014 · 3 days. Stick it only on this skid.'});

 eq('P7-04: неизвестный код во вкладке и в обычном скане — «не найдено», ничего не создаётся; на Scan — подсказка Register new',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',1);dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();
  const r=stationSubmit('DL-77'),note=dcText('[data-dolly-note]');stationTab='scan';stationSubmit('DL-77');const card=dcText('[data-station-result="carrierBad"] .st-big span');
  stationSwitch();return {r,note,card,n:DB.carrier.length,seq:DB.carrierSeq.DL};
 }),{r:'dollyUnknown',note:'DL-77 not found · nothing created',card:'New one? Register it',n:1,seq:1});

 eq('P7-06, P7-14, P7-15: Register new на станции без прав офиса — следующий никогда не выданный номер, кто / когда / станция; двойной клик — одна тара; две вкладки — разные номера; ошибка записи — номера нет',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',3);DB.carrier=DB.carrier.filter(c=>c.code!=='DL-3');touch();
  dcLogin('ARRIS','Andrii S.');stationTab='dollies';render();
  document.querySelector('[data-dolly-reg-open]').click();document.querySelector('[data-dolly-reg-type="DL"]').click();
  const btn=dcText('[data-dolly-reg-save]');stationDollyRegSave();stationDollyRegSave();
  const c=carrierFind('DL-4'),reg={code:stationDollyReg.done,by:c.regBy,station:c.regStation,at:!!c.regAt,n:DB.carrier.filter(x=>x.code.startsWith('DL')).length};
  /* Вторая вкладка — своё окно, свой ключ. */
  const other=carrierRegister('DL',{name:'Oleg K.'},'POLISH','RQ-OTHER').code;
  /* Ошибка записи: номер не выдан, окно и выбор остаются. */
  stationDollyRegOpen();stationDollyRegType('SA');const failed=testFailWrite(()=>stationDollyRegSave());
  const err={failed,error:!!stationDollyReg.error,type:stationDollyReg.type,done:stationDollyReg.done,sa:DB.carrier.filter(x=>x.code.startsWith('SA')).length};
  const ok=stationDollyRegSave();stationSwitch();
  return {btn,reg,other,err,ok,admin:typeof stationDollyRegSave==='function'&&!document.querySelector('[data-carrier-add]')};
 }),{btn:'Register DL-4',reg:{code:'DL-4',by:'Andrii S.',station:'ARRIS',at:true,n:3},other:'DL-5',err:{failed:false,error:true,type:'SA',done:'',sa:0},ok:'SA-1',admin:true});

 eq('P7-07, P7-03: Empty освобождает от стекла, но не номер; новая регистрация не берёт пустой или списанный номер; номер не вернётся и после потери записи',await t.p.evaluate(()=>{
  dcReset();carrierAdd('SL',2);const id=dcOrder([[36,24,1]]),g=dcIds(id);DB.stationScan.push({id:'SC1',piece:g[0],station:'CUT',at:new Date().toISOString(),by:'QA',on:'SL-1'});touch();
  carrierEmpty('SL-1',{name:'QA'});carrierSet('SL-2','active',false);
  const a=carrierRegister('SL',{name:'Oleg K.'},'SHIPR','RQ-1').code;
  DB.carrier=DB.carrier.filter(c=>c.code!==a);touch();normalizeCarriers();
  const b=carrierRegister('SL',{name:'Oleg K.'},'SHIPR','RQ-2').code;
  return {a,b,sl1:!!carrierFind('SL-1'),seq:DB.carrierSeq.SL};
 }),{a:'SL-3',b:'SL-4',sl1:true,seq:4});

 eq('P7-09: 7 физических, 3 номера без тары, 1 списанная — плитки: 7 registered; не подтверждённые отдельно; DL-1 отсканирован дважды — 7, не 8',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',5);carrierAdd('SL',5);const id=dcOrder([[36,24,4]]),g=dcIds(id);
  /* Физическая: стекло клали (DL-1..DL-3), отгрузка и возврат (SL-1), регистрация цехом (SL-6), пересчёт видел (DL-4, SL-2). */
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit('DL-2');stationSubmit(g[1]);stationSubmit('DL-3');stationSubmit(g[2]);stationSwitch();
  DB.skidReturn.push({id:'SKR-1',at:new Date().toISOString(),code:'SL-1',customerId:'C1',kind:'back',newCode:'',by:'QA'});touch();
  carrierRegister('SL',{name:'Oleg K.'},'SHIPR','RQ-9');carrierSet('SL-5','active',false);
  const n=carrierCountStart({name:'Anna K.'}).value;['DL-4','SL-2','DL-1','DL-1'].forEach(c=>carrierCountScan(n.id,c,'Shop',{name:'Anna K.'}));carrierCountFinish(n.id);
  tab='production';subtab='carriers';carrierCountShow='';render();
  const tiles=[...document.querySelectorAll('.cb-tile')].map(x=>x.innerText.replace(/\s+/g,' ').trim().replace(docDate(finToday()),'D'));
  return {tiles};
 }),{tiles:['7 registered · DL 4 · DA 0 · SL 3 · SA 0','7 in the shop · 3 loaded · 3 glass · 4 empty','0 at customers','0 glass with no dolly or skid','4 not found at last count · D','0 found without a label','3 not confirmed yet · 1 retired']});

 eq('P7-10, P7-11, P7-13: пересчёт — повтор не добавляет, «другая с той же этикеткой» — офису, неизвестный — без записи, скид «у клиента» найден у нас — Back from customer; стекло не двигается; Finish — не найденные',await t.p.evaluate(()=>{
  dcReset();carrierAdd('DL',3);carrierAdd('SL',2);const c=oqCustomer({legalName:'North Shore Windows'}),id=dcOrder([[36,24,2]]),g=dcIds(id);
  dcLogin('CUT','Ivan P.');stationSubmit('DL-1');stationSubmit(g[0]);stationSubmit('DL-2');stationSubmit(g[1]);stationSwitch();
  DB.shipment.push({id:'PSY',number:'PS-0009',customerId:c.id,status:'shipped',method:'delivery',shippedAt:new Date(Date.now()-10*864e5).toISOString(),items:[{skid:'SL-1',pieces:[]}],skidsOut:['SL-1']});touch();
  const prod=JSON.stringify(DB.stationScan);
  tab='production';subtab='carriers';render();document.querySelector('[data-carrier-count-open]').click();
  const scan=v=>{const el=document.querySelector('[data-carrier-count-scan]');el.value=v;carrierCountKey({key:'Enter',preventDefault(){}},el);};
  ['DL-1','dl-1','DL-77','SL-1'].forEach(scan);
  document.querySelector('[data-count-twin]').click();
  carrierCountPlace='Yard';render();carrierCountNoLabelAsk();salesDialog.input.value='blue paint, near gate';oqChoose('Skid');
  const found=dcText('[data-count-found] b'),res=[...document.querySelectorAll('[data-count-obs]')].map(r=>r.dataset.countObs).join();
  document.querySelector('[data-count-back]').click();
  const back=skidsOut().has('SL-1'),ret=DB.skidReturn.map(r=>r.code+':'+r.kind).join();
  document.querySelector('[data-count-finish]').click();
  const n=carrierCountLast();
  return {found,res,back,ret,missing:n.missing.join(),same:JSON.stringify(DB.stationScan)===prod,carriers:DB.carrier.length,screen:dcText('[data-carrier-count] .cc-head h2').startsWith('Count')};
 }),{found:'1 of 2',res:'nolabel,out,unknown,twin,ok',back:false,ret:'SL-1:back',missing:'DL-2',same:true,carriers:5,screen:true});

 eq('P7-12: проверка у клиента — номерами отмечает увиденные скиды; только числом — число, номера не отмечены',await t.p.evaluate(()=>{
  dcReset();carrierAdd('SL',3);const c=oqCustomer({legalName:'Granite City Glazing'});
  DB.shipment.push({id:'PSZ',number:'PS-0020',customerId:c.id,status:'shipped',method:'delivery',shippedAt:new Date(Date.now()-5*864e5).toISOString(),items:[],skidsOut:['SL-1','SL-2','SL-3']});touch();
  tab='shipping';shippingTab='skids';render();
  skidsCheckAsk(c.id);salesDialog.input.value='sl-1, SL-3';oqChoose('Save');
  const codes={text:dcText('[data-skids-check]'),seen:[...document.querySelectorAll('[data-skid-seen]')].map(x=>x.textContent?'✓':'').join('|')};
  skidsCheckAsk(c.id);salesDialog.input.value='2';oqChoose('Save');
  const count=dcText('[data-skids-check]'),last=carrierCustomerChecks(c.id).pop();
  return {codes:{text:codes.text.replace(/Checked .*? ·/,'Checked D ·'),seen:codes.seen},count:count.replace(/Checked .*? ·/,'Checked D ·'),last:{count:last.count,codes:last.codes.length}};
 }),{codes:{text:'· Checked D · 2 of 3 seen',seen:'✓||✓'},count:'· Checked D · 2 counted · codes not checked',last:{count:2,codes:0}});

 eq('P7-16, P7-08: цех зарегистрировал полученный скид — обмен берёт эту запись (без дубля и второй этикетки); наш старый — списан офисом; перепечатка не делает обмен',await t.p.evaluate(()=>{
  dcReset();carrierAdd('SL',1);const c=oqCustomer({legalName:'Vista Railings'});
  DB.shipment.push({id:'PSW',number:'PS-0030',customerId:c.id,status:'shipped',method:'delivery',shippedAt:new Date(Date.now()-20*864e5).toISOString(),items:[],skidsOut:['SL-1']});touch();
  const reg=carrierRegister('SL',{name:'Oleg K.'},'SHIPR','RQ-SW').code;
  dcLogin('SHIPR','Oleg K.');stationTab='dollies';render();stationSubmit(reg);document.querySelector('[data-dolly-print]').click();stkPrintCleanup();stationSwitch();
  const before={n:DB.carrier.length,swaps:DB.skidReturn.length};
  tab='shipping';shippingTab='skids';render();skidsSwapAsk(c.id);const btns=salesDialog.buttons.map(b=>b.label.replace(/ · .*$/,''));oqChoose(salesDialog.buttons[1].label);
  return {reg,before,btns,n:DB.carrier.length,printed:window.dcPrinted,swap:DB.skidReturn.map(r=>r.code+'→'+r.newCode+':'+r.kind).join(),old:carrierFind('SL-1').active,cand:skidSwapCandidates().length};
 }),{reg:'SL-2',before:{n:2,swaps:0},btns:['Back','Use SL-2','L-shape skid','A-shape skid'],n:2,printed:1,swap:'SL-1→SL-2:swap',old:false,cand:0});

 eq('E2E-04: регистрация → этикетка → загрузка → отгрузка → возврат → перепечатка → пересчёт: одна тара, один код, история целая',await t.p.evaluate(()=>{
  dcReset();const c=oqCustomer({legalName:'Kingsway Renovations'});
  dcLogin('SHIPR','Oleg K.');stationTab='dollies';render();stationDollyRegOpen();stationDollyRegType('SA');const code=stationDollyRegSave();document.querySelector('[data-dolly-reg-print]').click();stkPrintCleanup();
  const id=dcOrder([[30,20,1]],'Kingsway Renovations'),g=dcIds(id);DB.stationScan.push({id:'SCE',piece:g[0],station:'SHIPR',at:new Date().toISOString(),by:'Oleg K.',on:code});
  DB.shipment.push({id:'PSE',number:'PS-0040',customerId:c.id,status:'shipped',method:'delivery',shippedAt:new Date().toISOString(),items:[{skid:code,pieces:[g[0]]}],skidsOut:[code]});touch();tab='station';
  const out=skidsOut().has(code);stationTab='scan';stationSubmit(code);const back=!skidsOut().has(code);
  stationTab='dollies';render();stationSubmit(code);document.querySelector('[data-dolly-print]').click();const warned=!!document.querySelector('[data-dolly-warn]');if(warned)document.querySelector('[data-dolly-reprint]').click();stkPrintCleanup();stationSwitch();
  const n=carrierCountStart({name:'Anna K.'}).value;carrierCountScan(n.id,code,'Shop',{name:'Anna K.'});carrierCountScan(n.id,code,'Shop',{name:'Anna K.'});carrierCountFinish(n.id);
  return {code,one:DB.carrier.filter(x=>x.code===code).length,all:DB.carrier.length,out,back,warned,log:DB.carrierEvent.map(e=>e.kind).join(),counted:carrierCountCounted(n).size};
 }),{code:'SA-1',one:1,all:1,out:true,back:true,warned:true,log:'register,print,print',counted:1});

 eq('P7-13: Export / Import — номера, счётчик, кто зарегистрировал, журнал и пересчёт на месте; мусор отсеивается',await t.p.evaluate(()=>{
  dcReset();carrierRegister('DL',{name:'Oleg K.'},'ARRIS','RQ-X');carrierPrintLog('DL-1',{name:'Oleg K.'},'ARRIS');const n=carrierCountStart({name:'Anna K.'}).value;carrierCountScan(n.id,'DL-1','Yard',{name:'Anna K.'});carrierCountFinish(n.id);
  const src=JSON.parse(JSON.stringify(DB));src.carrierSeq={DL:7,XX:3};src.carrierEvent.push({id:'bad'},{id:'CE-X',at:'nope',kind:'print'});src.carrierCount[0].obs.push({at:'x',res:'ok'});
  let err='';try{prepareImportedState(Object.assign(JSON.parse(JSON.stringify(src)),{carrierCount:{}}));}catch(e){err=e.message;}
  const st=prepareImportedState(src);
  const c=st.carrier.find(x=>x.code==='DL-1');
  return {err,reg:c.regBy+'/'+c.regStation+'/'+!!c.regAt,seq:JSON.stringify(st.carrierSeq),ev:st.carrierEvent.map(e=>e.kind).join(),obs:st.carrierCount[0].obs.length,done:!!st.carrierCount[0].finishedAt};
 }),{err:'The "carrierCount" field must be an array.',reg:'Oleg K./ARRIS/true',seq:'{"DL":7}',ev:'register,print',obs:1,done:true});

 /* Скан этикетки сканером: сканер печатает код и Enter в поле вкладки. */
 await t.p.evaluate(()=>{dcReset();carrierAdd('DA',2);dcLogin('DRILL','Andrii S.');stationTab='dollies';render();});
 await t.p.click('[data-station-dollies] [data-station-scan]');await t.p.keyboard.type('DA-2');await t.p.keyboard.press('Enter');
 eq('P7-13: скан этикетки сканером во вкладке Dollies выбирает тару; ошибок страницы нет',await t.p.evaluate(()=>{const r={code:stationDollyCode,put:stationPutOn()};stationSwitch();tab='dashboard';render();return r;}),{code:'DA-2',put:''});
 eq('без ошибок страницы',t.errs,[]);
 await t.c.close();
};
