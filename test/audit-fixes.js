/* Regression cases from the 29 September audit. Exercise durable commands,
   assembly movement, immutable exports, import recovery, and real tab ownership. */
module.exports=async function({page,eq,ok}){
 console.log('audit-fixes');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.afOrder=(lam=false,double=true)=>{
   oqReset();DB.stationScan=[];DB.stationScanSeq=0;DB.productionRoute=[];DB.financeExport=[];DB.financeExportBatch=[];DB.financeEvent=[];DB.refund=[];stationRouteReset();
   const id=oqOrder(oqCustomer());salesOrderEdit(id);const l=soDraft.lines[0],m=salesMakeupById(soDraft,l.makeupId);soDraft.lines=[l];
   if(lam){const pn=salesDefaultPane(0);pn.category='laminated';['outer','inner'].forEach(k=>{Object.assign(pn.laminated[k],{glassProductId:glassProductByCode('6CLEAR').id,thicknessMm:6,heatTreatmentId:'HT-FT'});});
    m.unitType=double?'double':'single';m.panes=double?[normalizeSalesPane(pn,0),normalizeSalesPane({...pn,id:salesDefaultPane(1).id},1)]:[normalizeSalesPane(pn,0)];if(!double)m.cavities=[];
    const s=salesLineGeometryShape(l);['A','B','C','D'].forEach(k=>s.edgeOps[k]=['CNC Shape Polish','CNC Lami Polish'].map(type=>shapeNormalizeOp({type})));}
   if(!salesOrderSave())throw Error('Fixture save failed');salesDraftDrop();salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
   const o=salesRecord(id),line=o.lines[0],cs=glassBatchComponents(o,line),pm=glassPieceMap(id);window.af={id,o,l:line,ids:cs.map(c=>pm.get(c.key).ids[0]),who:{id:'af',name:'Audit operator'}};return af.ids;
  };
  window.afScan=(s,id)=>{const c=stationCheck(s,id);return STATION_RECORDED.includes(c.kind)?stationMove(s,c,af.who):{kind:c.kind};};
  window.afFailWrite=fn=>{const keep=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY)throw new DOMException('Test quota','QuotaExceededError');return keep.call(this,k,v);};try{return fn();}finally{Storage.prototype.setItem=keep;}};
 });
 eq('late storage events never replace the latest saved database',await t.p.evaluate(()=>{
  afOrder();const stale=localStorage.getItem(STORAGE_KEY);storageCommand(()=>{DB.customer[0].legalName='Newest saved value';});window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:stale}));return {name:DB.customer[0].legalName,baseline:storageBaseline===localStorage.getItem(STORAGE_KEY)};
 }),{name:'Newest saved value',baseline:true});
 eq('failed scan restores durable state, route and batch cut flag',await t.p.evaluate(()=>{
  afOrder();const before=localStorage.getItem(STORAGE_KEY),out=afFailWrite(()=>afScan('CUT',af.ids[0]));return {ok:out.ok,waiting:stationPlace(stationGlass(af.ids[0])).waiting,scans:DB.stationScan.length,frozen:DB.productionRoute.length,cut:!!stationGlass(af.ids[0]).entry.item.cutStartedAt,same:before===localStorage.getItem(STORAGE_KEY)};
 }),{ok:false,waiting:'CUT',scans:0,frozen:0,cut:false,same:true});
 eq('failed batch assignment leaves glass free and order status unchanged',await t.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer());salesDraftDrop();salesSetRecordStatus(id,'verified');const before=JSON.stringify(DB.glassBatch);const out=afFailWrite(()=>glassBatchAssign(glassBatchRows([salesRecord(id)]),{}));return {assigned:!!out,same:JSON.stringify(DB.glassBatch)===before,status:salesRecord(id).status,locked:salesRecord(id).lines.some(salesLineLocked)};
 }),{assigned:false,same:true,status:'verified',locked:false});
 eq('failed shipping transition retains order and open editor status',await t.p.evaluate(()=>{
  afOrder();salesSetRecordStatus(af.id,'ready');salesOrderEdit(af.id);const out=afFailWrite(()=>salesSetRecordStatus(af.id,'done',{delivery:'pickup'}));const result={changed:out,status:salesRecord(af.id).status,draft:soDraft.status};salesDraftDrop();return result;
 }),{changed:false,status:'ready',draft:'ready'});
 eq('scan UI reports failure, retains retry code, then records exactly once',await t.p.evaluate(()=>{
  afOrder();DB.user.push({name:'Audit operator',role:'Shop',station:'CUT',skills:[],pin:''});normalizeUsers();stationCode='CUT';tab='station';stationLogin(DB.user.at(-1).viewProfileId);
  const failed=afFailWrite(()=>stationSubmit(af.ids[0])),text=document.getElementById('app').textContent;const kind=stationSubmit(af.ids[0]);return {failed,message:text.includes('NOT SAVED'),kind,count:DB.stationScan.length};
 }),{failed:'saveError',message:true,kind:'ok',count:1});
 eq('nested LAM inside IGU blocks incomplete pairs, confirmation cannot bypass assembly',await t.p.evaluate(()=>{
  afOrder(true);for(const id of af.ids)for(const st of ['CUT','CNC','HEAT'])afScan(st,id);afScan('LAM',af.ids[0]);
  const confirm=stationConfirmSkipped('CNC',af.ids[0],af.who),blocked=!!confirm.error;afScan('LAM',af.ids[1]);const move=afScan('CNC',af.ids[0]);return {blocked,moved:move.value.mates.length+1,waiting:af.ids.map(id=>stationPlace(stationGlass(id)).waiting),unit:stationAsms(af.o,af.l,'LAM')[0].unit};
 }),{blocked:true,moved:2,waiting:['IGU','IGU','LAM','LAM'],unit:0});
 eq('laminated IGU finishes as one four-component unit',await t.p.evaluate(()=>{
  afScan('LAM',af.ids[2]);afScan('LAM',af.ids[3]);afScan('CNC',af.ids[2]);afScan('IGU',af.ids[0]);afScan('IGU',af.ids[2]);const unit=stationAsms(af.o,af.l,'IGU')[0];const move=afScan('SHIPR',af.ids[0]);return {assembled:unit.lites.size,unit:unit.unit,moved:move.value.mates.length+1,waiting:af.ids.map(id=>stationPlace(stationGlass(id)).waiting)};
 }),{assembled:4,unit:1,moved:4,waiting:['SHIP','SHIP','SHIP','SHIP']});
 eq('CNC work list selects the upcoming pass',await t.p.evaluate(()=>{
  afOrder(true,false);af.ids.forEach(id=>afScan('CUT',id));const before=stationWorksAt(stationGlass(af.ids[0]),'CNC');for(const id of af.ids)for(const st of ['CNC','HEAT','LAM'])afScan(st,id);return {before,after:stationWorksAt(stationGlass(af.ids[0]),'CNC')};
 }),{before:['CNC SHAPE POLISH'],after:['CNC LAMI POLISH · ALIGN ONLY']});
 eq('skipped-work confirmation includes only the missed CNC pass',await t.p.evaluate(()=>{
  afOrder(true);af.ids.forEach(id=>afScan('CUT',id));const early=stationSkippedWorks(stationCheck('HEAT',af.ids[0])).map(x=>x.text);
  for(const id of af.ids)for(const st of ['CNC','HEAT','LAM'])afScan(st,id);const late=stationSkippedWorks(stationCheck('IGU',af.ids[0])).map(x=>x.text);return {early,late};
 }),{early:['CNC SHAPE POLISH'],late:['CNC LAMI POLISH · ALIGN ONLY']});
 eq('master data reorder keeps a started route; reload/import keeps pass indices',await t.p.evaluate(()=>{
  const g=stationGlass(af.ids[0]),before=stationRouteOf(g).codes.join();const heat=DB.station.find(s=>s.code==='HEAT'),old=heat.seq;heat.seq=20;stationRouteReset();const after=stationRouteOf(g).codes.join();heat.seq=old;
  const imported=prepareImportedState(storageExportEnvelope());return {same:before===after,steps:imported.stationScan.map(s=>s.step).join(),frozen:imported.productionRoute.length};
 }),{same:true,steps:'0,0,0,0,1,2,3,1,2,3,1,2,3,1,2,3',frozen:4});
 eq('unit move and Undo are atomic for every component',await t.p.evaluate(()=>{
  afOrder();for(const id of af.ids)for(const st of ['CUT','ARRIS','HEAT','IGU'])afScan(st,id);afScan('SHIPR',af.ids[0]);const rec=stationScansFor(af.ids[0]).find(s=>s.station==='SHIPR');const blocked=stationUndo(stationScansFor(af.ids[1]).find(s=>s.station==='IGU').id,af.who);const undone=stationUndo(rec.id,af.who);return {blocked:!!blocked.error,pieces:undone.pieces.length,waiting:af.ids.map(id=>stationPlace(stationGlass(id)).waiting)};
 }),{blocked:true,pieces:2,waiting:['SHIPR','SHIPR']});
 eq('quota failure does not split a unit move',await t.p.evaluate(()=>{
  const n=DB.stationScan.length;const out=afFailWrite(()=>afScan('SHIPR',af.ids[0]));return {ok:out.ok,scans:DB.stationScan.length===n,waiting:af.ids.map(id=>stationPlace(stationGlass(id)).waiting)};
 }),{ok:false,scans:true,waiting:['SHIPR','SHIPR']});
 eq('station rename migrates history, station sign-in, NCR and frozen routes',await t.p.evaluate(()=>{
  afOrder();af.ids.forEach(id=>afScan('CUT',id));localStorage.setItem(STATION_SESSION_KEY,JSON.stringify({CUT:{userId:'view-rename',at:'x'}}));DB.ncrReason.push({id:'af-rename',where:'CUT',name:'Rename',active:true});
  tab='masterdata';mdTab='stations';stEdit=DB.station.findIndex(s=>s.code==='CUT');document.getElementById('app').innerHTML=sfStationForm();document.getElementById('sf_code').value='CUT2';saveSfStation();
  const out={waiting:af.ids.map(id=>stationPlace(stationGlass(id)).waiting),history:DB.stationScan.every(s=>s.station==='CUT2'),profile:Object.keys(stationSessions()).join(),reason:DB.ncrReason.at(-1).where,frozen:DB.productionRoute.every(x=>x.route.codes[0]==='CUT2')};
  stEdit=DB.station.findIndex(s=>s.code==='CUT2');document.getElementById('app').innerHTML=sfStationForm();document.getElementById('sf_code').value='CUT';saveSfStation();localStorage.removeItem(STATION_SESSION_KEY);return out;
 }),{waiting:['ARRIS','ARRIS'],history:true,profile:'CUT2',reason:'CUT2',frozen:true});
 eq('dolly edits invalidate production board immediately',await t.p.evaluate(()=>{
  afOrder();carrierAdd('DL',1);const out=stationMove('CUT',stationCheck('CUT',af.ids[0]),af.who,{on:'DL-1'});const before=prodBoard().find(x=>x.o.id===af.id).on;stationCode='CUT';stationLast={check:stationCheck('CUT',af.ids[0]),rec:out.value.rec};afFailWrite(()=>stationScanOffClick(out.value.rec.id));const restored=stationLast.rec.on==='DL-1';stationScanOff(out.value.rec.id);return {before,restored,after:prodBoard().find(x=>x.o.id===af.id).on};
 }),{before:['DL-1'],restored:true,after:[]});
 eq('Last file repeats exact CSV bytes after amount and customer edits',await t.p.evaluate(()=>{
  afOrder();const customer=salesFindCustomer(af.o.customerId);const r=finPersist(()=>finSaveReceiptRecord({customerId:customer.id,date:'2026-09-01',method:'cash',amount:100,allocations:[]},null,'',false)).value;
  const files=[],keep=customerDownload;customerDownload=(name,text)=>files.push({name,text});finExportQuickBooks();finPersist(()=>finSaveReceiptRecord({...r,amount:200},r.id,'Correct amount',false));customer.legalName='Changed name';finExportAgain();customerDownload=keep;
  const imported=prepareImportedState(storageExportEnvelope());return {same:JSON.stringify(files[0])===JSON.stringify(files[1]),pending:finExportPending()[0].state,roundtrip:imported.financeExportBatch[0].csv===files[0].text};
 }),{same:true,pending:'changed',roundtrip:true});
 eq('failed financial export does not mark records or keep a phantom file',await t.p.evaluate(()=>{
  const before=JSON.stringify([DB.financeExport,DB.financeExportBatch]);const out=afFailWrite(()=>finPersist(()=>finExportMark(finExportPending())));return {ok:out.ok,same:before===JSON.stringify([DB.financeExport,DB.financeExportBatch])};
 }),{ok:false,same:true});
 eq('empty, unrelated and unknown-version imports are rejected without replacing DB',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),values=[{}, {unrelated:[]},{format:'glass-erp',schemaVersion:999,data:DB},{productionRoute:[{key:'invalid',route:{codes:['CNC'],services:[{station:'CNC',text:'Polish',step:2}]}}]}];return {rejected:values.map(x=>{try{prepareImportedState(x);return false;}catch(e){return true;}}),same:before===JSON.stringify(DB)};
 }),{rejected:[true,true,true,true],same:true});
 eq('import keeps a verified pre-import copy, Restore brings the old database back',await t.p.evaluate(()=>{
  const before=DB.customer.map(x=>x.id).join(),raw=storageExportEnvelope();raw.data=JSON.parse(JSON.stringify(raw.data));raw.data.customer=[];raw.data.salesOrder=[];raw.data.receipt=[];raw.data.refund=[];raw.data.financeExport=[];raw.data.financeEvent=[];raw.data.glassPiece=[];raw.data.glassBatch=[];raw.data.recut=[];
  const imported=storageImportState(raw),backup=JSON.parse(localStorage.getItem(STORAGE_BACKUP_KEY)),restored=storageRestoreBackup();return {imported,backed:backup.data.customer.map(x=>x.id).join()===before,restored,same:DB.customer.map(x=>x.id).join()===before};
 }),{imported:true,backed:true,restored:true,same:true});
 eq('failed import keeps both current database and usable pre-import backup',await t.p.evaluate(()=>{
  const before=JSON.stringify(DB),stored=localStorage.getItem(STORAGE_KEY),raw=storageExportEnvelope();raw.data=JSON.parse(before);raw.data.customer[0].legalName='Imported change';const imported=afFailWrite(()=>storageImportState(raw));return {imported,same:before===JSON.stringify(DB),stored:stored===localStorage.getItem(STORAGE_KEY),backup:JSON.stringify(JSON.parse(localStorage.getItem(STORAGE_BACKUP_KEY)).data)===before};
 }),{imported:false,same:true,stored:true,backup:true});
 eq('pre-import copy expires after a week and gives way when storage is full',await t.p.evaluate(()=>{
  const env=days=>JSON.stringify({format:'glass-erp',schemaVersion:1,exportedAt:new Date(Date.now()-days*864e5).toISOString(),data:{}});
  localStorage.setItem(STORAGE_BACKUP_KEY,env(2));storageBackupCheck();const fresh=storageBackupPresent&&localStorage.getItem(STORAGE_BACKUP_KEY)!==null;
  localStorage.setItem(STORAGE_BACKUP_KEY,env(8));storageBackupCheck();const expired=!storageBackupPresent&&localStorage.getItem(STORAGE_BACKUP_KEY)===null;
  localStorage.setItem(STORAGE_BACKUP_KEY,env(1));storageBackupCheck();
  const keep=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===STORAGE_KEY&&localStorage.getItem(STORAGE_BACKUP_KEY)!==null)throw new DOMException('Test quota','QuotaExceededError');return keep.call(this,k,v);};
  let out;try{out=storageCommand(()=>{DB.customer[0].legalName='Saved after cleanup';});}finally{Storage.prototype.setItem=keep;}
  return {fresh,expired,saved:out.ok&&JSON.parse(localStorage.getItem(STORAGE_KEY)).customer[0].legalName==='Saved after cleanup',dropped:localStorage.getItem(STORAGE_BACKUP_KEY)===null&&!storageBackupPresent,button:!storageStatusHTML().includes('Restore pre-import')};
 }),{fresh:true,expired:true,saved:true,dropped:true,button:true});
 eq('partial UI import is rejected before confirmation or replacement',await t.p.evaluate(()=>{const before=JSON.stringify(DB);try{storageImportState({customer:[]});return false;}catch(e){return JSON.stringify(DB)===before&&e.message.includes('complete');}}),true);
 eq('production exceptions and station dimensions are visible without horizontal tile scrolling',await t.p.evaluate(()=>{
  tab='production';subtab='orders';render();const attention=!!document.querySelector('[data-prod-exceptions]'),wrap=getComputedStyle(document.querySelector('.pb-tiles')).flexWrap;
  DB.user.push({name:'CNC audit',role:'Shop',station:'CNC',skills:[],pin:''});normalizeUsers();stationCode='CNC';tab='station';stationLogin(DB.user.at(-1).viewProfileId);stationPeek(af.ids[0]);const text=document.getElementById('app').textContent;return {attention,wrap,dimensions:text.includes('Finished size'),keyboardNav:[...document.querySelectorAll('.nav-item:not(.soon)')].every(el=>el.tagName==='BUTTON')};
 }),{attention:true,wrap:'wrap',dimensions:true,keyboardNav:true});
 // Actual tabs share a Web Lock. The writer is the tab you work in: a tab you
 // open takes over, the other keeps reading and cannot persist; going back
 // takes over again and reloads the latest database before the first edit.
 const shared=await t.p.evaluate(()=>{tab='sales';const id=oqOrder(oqCustomer());salesDraftDrop();touch();return id;});
 const follower=await t.c.newPage();follower.on('pageerror',e=>t.errs.push(e.message));follower.on('dialog',d=>d.accept());await follower.goto(t.p.url());await follower.waitForFunction(()=>typeof storageStarting!=='undefined'&&!storageStarting);
 ok('a tab you open becomes the writer',await follower.evaluate(()=>storageWriter));
 eq('the tab left behind cannot overwrite the database',await t.p.evaluate(()=>{const before=localStorage.getItem(STORAGE_KEY),n=DB.customer.length,out=storageCommand(()=>DB.customer.push({id:'af-lost'}));return {writer:storageWriter,ok:out.ok,same:before===localStorage.getItem(STORAGE_KEY),count:DB.customer.length===n};}),{writer:false,ok:false,same:true,count:true});
 await follower.evaluate(id=>{tab='sales';salesOrderEdit(id);soDraft.notes='Local note';},shared);
 await t.p.evaluate(()=>storageTakeControl());
 await t.p.evaluate(id=>{salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});storageCommand(()=>{DB.customer[0].legalName='Latest tab value';});},shared);
 await follower.dispatchEvent('body','pointerdown');await follower.waitForFunction(()=>storageWriter,null,{timeout:5000});
 ok('a click takes the writer back, reloads the latest value and keeps the open draft',await follower.evaluate(()=>storageWriter&&DB.customer[0].legalName==='Latest tab value'&&soDraft&&soDraft.notes==='Local note'));
 eq('old writer loses editing after handoff',await t.p.evaluate(()=>({writer:storageWriter,ok:storageCommand(()=>DB.customer.push({id:'af-old-writer'})).ok})),{writer:false,ok:false});
 eq('stale order notes do not rewind batching or lose assigned glass',await follower.evaluate(id=>{const saved=salesOrderSave(),o=salesRecord(id);return {saved,status:o.status,notes:o.notes,assigned:DB.glassBatch.some(b=>b.items.some(i=>!i.releasedAt&&b.parts[i.part].orderId===id))};},shared),{saved:true,status:'batched',notes:'Local note',assigned:true});
 eq('conflicting edits are rejected and retain the local draft',await follower.evaluate(id=>{salesOrderEdit(id);soDraft.notes='Unsaved local';const o=salesRecord(id);o.notes='External edit';const saved=salesOrderSave();return {saved,notes:salesRecord(id).notes,draft:soDraft.notes};},shared),{saved:false,notes:'External edit',draft:'Unsaved local'});
 eq('quota failure keeps the sales draft and previous saved order',await follower.evaluate(id=>{salesOrderEdit(id);soDraft.notes='Retry note';const old=salesRecord(id).notes,keep=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError');};let saved;try{saved=salesOrderSave();}finally{Storage.prototype.setItem=keep;}return {saved,notes:salesRecord(id).notes===old,draft:soDraft.notes};},shared),{saved:false,notes:true,draft:'Retry note'});
 eq('handoff never discards unsaved work in the tab that gives way',await t.p.evaluate(async()=>({granted:await storageTakeControl(),writer:storageWriter})),{granted:true,writer:true});
 eq('the unsaved draft waits in its tab and is still there on return',await follower.evaluate(async()=>{const left=!storageWriter&&soDraft.notes;const back=await storageTakeControl();return {left,back,notes:soDraft.notes};}),{left:'Retry note',back:true,notes:'Retry note'});
 await follower.evaluate(()=>salesDraftDrop(true));await t.p.evaluate(()=>storageTakeControl());
 const payment=await t.p.evaluate(id=>finPersist(()=>finSaveReceiptRecord({customerId:salesRecord(id).customerId,date:'2026-09-01',method:'cash',amount:50,allocations:[]},null,'',false)).value.id,shared);
 await follower.waitForFunction(id=>(DB.receipt||[]).some(r=>r.id===id),payment);
 await follower.evaluate(id=>{tab='finance';finOpenReceipt(id);finDraft.amount='200';finDraft.reason='Local correction';render();},payment);
 await t.p.evaluate(id=>{const r=DB.receipt.find(r=>r.id===id);const out=finPersist(()=>finSaveReceiptRecord({...r,amount:75},id,'Other tab correction',false));if(!out.ok)throw new Error('Could not prepare the correction: '+out.error);},payment);
 await follower.evaluate(()=>storageTakeControl());
 eq('stale payment draft cannot overwrite a correction from another tab',await follower.evaluate(id=>{const saved=finSaveReceipt();return {saved,amount:DB.receipt.find(r=>r.id===id).amount,draft:finDraft&&finDraft.amount,message:document.getElementById('e_fin').textContent.includes('changed elsewhere')};},payment),{saved:false,amount:75,draft:'200',message:true});
 await follower.close();await t.c.close();
 // Owner, 2 October 2026: a big order in one tab, a walk-in client in another.
 const two=await page();await require('./optimization-fixture')(two.p);const A=two.p;
 const ready=await A.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer({legalName:'Walk-in Client'}));oqThrough(id,'ready');salesDraftDrop();return id;});
 const bigShape=await A.evaluate(()=>{window.afLines=(n,w,h,mark)=>{const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];Object.assign(m.panes[0],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT'});
   return Array.from({length:n},(_,i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:(w+i)*16,height16:h*16,qty:1,mark:mark+(i+1)});salesEnsureLineShape(l);return l;});};
  tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(oqCustomer({legalName:'Big Project Inc'}).id);soDraft.lines=afLines(12,30,40,'B');
  const s=DB.shapeDef.find(x=>x.id===soDraft.lines[0].shapeRef.id);s.name='Big custom shape';touch();render();return s.id;});
 const B=await two.c.newPage();B.on('pageerror',e=>two.errs.push(e.message));B.on('dialog',d=>{two.errs.push('dialog: '+d.message());d.accept();});await B.goto(A.url());await B.waitForFunction(()=>typeof storageStarting!=='undefined'&&!storageStarting);await require('./optimization-fixture')(B);
 await B.waitForFunction(()=>storageWriter,null,{timeout:5000});
 eq('walk-in: the new tab picks up an order and saves a 2-glass order while the big order waits',await B.evaluate(id=>{
  salesSetRecordStatus(id,'done');tab='sales';salesOrderNew('order');salesApplyCustomerDefaults(oqCustomer({legalName:'Walk-in Client 2'}).id);
  window.afLines=(n,w,h,mark)=>{const m=soDraft.makeups[0],g=glassProductByCode('6CLEAR');m.unitType='single';m.panes=[m.panes[0]];m.cavities=[];Object.assign(m.panes[0],{glassProductId:g.id,thicknessMm:6,heatTreatmentId:'HT-FT'});
   return Array.from({length:n},(_,i)=>{const l=normalizeSalesOrderLine({makeupId:m.id,width16:(w+i)*16,height16:h*16,qty:1,mark:mark+(i+1)});salesEnsureLineShape(l);return l;});};
  soDraft.lines=afLines(2,20,21,'S');return {saved:salesOrderSave(),status:salesRecord(id).status};},ready),{saved:true,status:'done'});
 eq('walk-in: the big order waited in its tab untouched',await A.evaluate(()=>({writer:storageWriter,lines:soDraft&&soDraft.lines.length})),{writer:false,lines:12});
 await A.dispatchEvent('body','pointerdown');await A.waitForFunction(()=>storageWriter,null,{timeout:5000});
 eq('walk-in: back in the big order, Update keeps everything from both tabs',await A.evaluate(([id,shape])=>{
  soDraft.lines.push(...afLines(1,50,50,'X'));const saved=salesOrderSave(),db=JSON.parse(localStorage.getItem(STORAGE_KEY)),nums=db.salesOrder.map(o=>o.businessNumber);
  const big=db.salesOrder.find(o=>o.lines.length===13),small=db.salesOrder.find(o=>o.lines.length===2&&o.lines[0].mark==='S1');
  return {saved,orders:db.salesOrder.length,unique:new Set(nums).size===nums.length,small:!!small,pickedUp:db.salesOrder.find(o=>o.id===id).status,
   shapes:!!big&&big.lines.every(l=>db.shapeDef.some(s=>s.id===l.shapeRef.id)),custom:(db.shapeDef.find(s=>s.id===shape)||{}).name};},[ready,bigShape]),
  {saved:true,orders:3,unique:true,small:true,pickedUp:'done',shapes:true,custom:'Big custom shape'});
 eq('a scan typed into the tab left behind waits for the handoff and is saved',await B.evaluate(async()=>{
  const left=!storageWriter;let done=null;storageWhenWriter(()=>{done=storageCommand(()=>{DB.customer[0].legalName='Saved from the scan tab';}).ok;});
  for(let i=0;i<50&&done===null;i++)await new Promise(r=>setTimeout(r,50));
  return {left,done,writer:storageWriter,stored:JSON.parse(localStorage.getItem(STORAGE_KEY)).customer[0].legalName};}),{left:true,done:true,writer:true,stored:'Saved from the scan tab'});
 /* A tab that does not answer (an old version still open): the alert bar
    explains it on the office screen, the station and a tablet. */
 await B.evaluate(()=>{storageYield=()=>{};});
 const stuck=await A.evaluate(async()=>{const granted=await storageTakeControl();const bar=()=>{const el=document.getElementById('storageAlert');return !!el&&!el.hidden&&el.offsetHeight>0&&/Edit here/.test(el.textContent);};
  const office=bar();tab='station';stationCode='CUT';render();const station=bar();tab='sales';render();return {granted,office,station};});
 await A.setViewportSize({width:820,height:1180});
 eq('a tab that does not answer: the alert bar with Edit here is visible in the office, on the station and on a tablet',{...stuck,tablet:await A.evaluate(()=>{const el=document.getElementById('storageAlert');return !el.hidden&&el.offsetHeight>0;})},{granted:false,office:true,station:true,tablet:true});
 await B.close();await A.dispatchEvent('body','pointerdown');await A.waitForFunction(()=>storageWriter,null,{timeout:5000});
 eq('the other tab closed: a click makes this one the writer and the alert goes away',await A.evaluate(()=>({writer:storageWriter,alert:!document.getElementById('storageAlert').hidden})),{writer:true,alert:false});
 const twoErrs=two.errs.slice();await two.c.close();
 const closing=await page();await require('./optimization-fixture')(closing.p);
 eq('closing an unsaved order restores saved shapes before releasing the writer',await closing.p.evaluate(()=>{
  oqReset();const id=oqOrder(oqCustomer()),o=salesRecord(id),shapeId=o.lines[0].shapeRef.id,old=DB.shapeDef.find(s=>s.id===shapeId).name;salesOrderEdit(id);DB.shapeDef.find(s=>s.id===shapeId).name='Uncommitted shape';soDraft.notes='Unsaved note';touch();window.dispatchEvent(new PageTransitionEvent('pagehide'));
  return {restored:JSON.parse(localStorage.getItem(STORAGE_KEY)).shapeDef.find(s=>s.id===shapeId).name===old,writer:storageWriter};
 }),{restored:true,writer:false});await closing.c.close();
 const corrupt=await page('{unreadable');
 eq('corrupt storage is preserved, screen explains recovery',await corrupt.p.evaluate(()=>({original:localStorage.getItem(STORAGE_KEY),recovery:storageRecovery,blocked:!storageCommand(()=>DB.customer.push({id:'unsafe'})).ok,text:document.getElementById('storageStatus').textContent.includes('recovery')})),{original:'{unreadable',recovery:true,blocked:true,text:true});
 eq('audit scenarios have no browser errors',t.errs.concat(twoErrs,closing.errs,corrupt.errs),[]);await corrupt.c.close();
};
