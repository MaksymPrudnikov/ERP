/* Shipping PR 5: Hold units и Cancel units — выбор юнитов, Hold на станции,
   цена отмены по сканам до Hold, стекло отменённых юнитов, итоги заказа.
   Заказ — одна строка двойных IGU (два закалённых лайта) на N юнитов. */
module.exports=async function({page,eq,ok}){
 console.log('unit-cancel');const t=await page();await require('./optimization-fixture')(t.p);
 await t.p.evaluate(()=>{
  window.print=()=>{};
  /* Заказ в батче: строка 37 × 71, qty юнитов. */
  window.ucOrder=function(qty,extra){
   oqReset();DB.carrier=[];DB.orderEvent=[];DB.stockOffcut=[];const id=oqOrder(oqCustomer(Object.assign({legalName:'Customer A'},extra)));
   salesOrderEdit(id);soDraft.lines=soDraft.lines.slice(0,1);soDraft.lines[0].qty=qty;if(!salesOrderSave())throw new Error('order not saved');salesDraftDrop();oqThrough(id,'batched');window.ucId=id;return id;
  };
  window.ucO=function(){return salesRecord(ucId);};window.ucL=function(){return ucO().lines[0];};
  /* Стёкла слота n (1…qty): по одному на лайт. */
  window.ucSlot=function(n){return [...glassPieceMap(ucId).values()].filter(r=>r.key.split('|')[1]===ucL().id).map(r=>r.ids[n-1]);};
  /* Довести стёкла слота до станции stop (она остаётся следующей). */
  window.ucMove=function(n,stop){
   const ids=ucSlot(n);for(let pass=0;pass<20;pass++){let moved=false;ids.forEach(piece=>{const g=stationGlass(piece),p=g&&stationPlace(g);if(!p||p.assembling&&false||!p.waiting||p.waiting===stop)return;const c=stationCheck(p.waiting,piece);if(c&&c.kind==='ok')moved=stationMove(p.waiting,c,{name:'Shop'},{}).ok||moved;});if(!moved)break;}
  };
  window.ucHeat=function(){return salesRouteStationOf('tempering','HEAT');};
  window.ucAfter=function(station){const codes=stationRouteOf(stationGlass(ucSlot(1)[0])).codes;return codes[codes.indexOf(station)+1];};
  window.ucPrice=function(){return finWithOrder(ucO(),()=>salesLineCommercialPrice(ucL(),ucO()));};
 });
 eq('Units are picked in the owner order: not cut, then cut, then tempered, assembled last',await t.p.evaluate(()=>{
  ucOrder(4);ucMove(2,ucAfter('CUT'));ucMove(3,ucAfter(ucHeat()));ucMove(4,shippingStations().ready);
  const list=unitList(ucO(),ucL());return {stages:list.map(u=>u.stage),first:list[0].pieces.slice().sort().join()===ucSlot(1).slice().sort().join(),last:list[3].assembled,sizes:list.map(u=>u.pieces.length)};
 }),{stages:['uncut','cut','tempered','assembled'],first:true,last:true,sizes:[2,2,2,2]});
 eq('Hold units: the system takes the least advanced; their glass is HOLD at any station, the scan is still written, and they do not become Ready',await t.p.evaluate(()=>{
  ucOrder(3);ucMove(3,shippingStations().ship);const bad=[unitHold(ucId,ucL().id,0,'Stop').error,unitHold(ucId,ucL().id,1,' ').error,unitHold(ucId,ucL().id,9,'Stop').error];
  const out=unitHold(ucId,ucL().id,2,'Customer asked to stop'),held=ucL().heldUnits,pieces=held.flatMap(h=>h.pieces).sort(),check=stationCheck('CUT',ucSlot(1)[0]);
  const moved=stationMove('CUT',check,{name:'Shop'},{}).ok,free=stationCheck('CUT',ucSlot(1)[1]).kind;
  ucMove(1,shippingStations().ship);ucMove(2,shippingStations().ship);const q=shippingSummary(ucO());
  return {bad,ok:out.ok,held:held.length,slots:pieces.join()===ucSlot(1).concat(ucSlot(2)).sort().join(),kind:check.kind,unit:check.unit,reason:check.reason,moved,free,ready:q.ready,log:DB.orderEvent.filter(e=>e.what==='Units on hold').map(e=>e.note)};
 }),{bad:['Enter how many units.','Enter a reason for the hold.','Only 3 units can be held.'],ok:true,held:2,slots:true,kind:'hold',unit:true,reason:'Customer asked to stop',moved:true,free:'hold',ready:1,log:['line 1 · 2 units · Customer asked to stop']});
 eq('Release hold lets the units go on; nothing else changed',await t.p.evaluate(()=>{
  ucOrder(2);unitHold(ucId,ucL().id,1,'Stop');const kind=stationCheck('CUT',ucSlot(1)[0]).kind,out=unitRelease(ucId,ucL().id);
  return {kind,ok:out.ok,field:'heldUnits' in ucL(),after:stationCheck('CUT',ucSlot(1)[0]).kind,again:unitRelease(ucId,ucL().id).error};
 }),{kind:'hold',ok:true,field:false,after:'ok',again:'No units on hold.'});
 eq('Cancel price follows the scans: not cut $0, cut = annealed glass and the work done, tempered = tempered glass, assembled = the full unit',await t.p.evaluate(()=>{
  ucOrder(4);ucMove(2,ucAfter('CUT'));ucMove(3,ucAfter(ucHeat()));ucMove(4,shippingStations().ready);
  const o=ucO(),l=ucL(),p=ucPrice(),m=salesMakeupById(o,l.makeupId),g=glassProductById(m.panes[0].glassProductId),area=p.areas.billable,now=new Date().toISOString();
  const plan=unitCancelPlan(o,l,4,now).units,pane=m.panes[0].priceOverride,annealed=Math.min(g.salePriceAnnealed,pane);
  const works=share=>finWithOrder(o,()=>salesLineChargeRows(l).reduce((n,row)=>n+row.basis*salesChargePricingState(l,row).effectiveRate*share(unitRowStation(row)),0));
  const passedCut=st=>st&&st==='CUT'?1:0,cut=salesMoney(2*annealed*area+works(passedCut));
  return {stages:plan.map(u=>u.stage),uncut:plan[0].charge,cut:plan[1].charge===cut&&plan[1].glass===salesMoney(2*annealed*area),temperedGlass:plan[2].glass===salesMoney(2*pane*area),temperedBelowFull:plan[2].charge<p.unit&&plan[2].charge>plan[1].charge,noCavity:salesMoney(p.unit-plan[2].charge)>=salesMoney(m.cavities[0].priceOverride*area),assembled:plan[3].charge===p.unit};
 }),{stages:['uncut','cut','tempered','assembled'],uncut:0,cut:true,temperedGlass:true,temperedBelowFull:true,noCavity:true,assembled:true});
 eq('Work done after the hold is ours: cut after Hold costs the customer $0',await t.p.evaluate(()=>{
  ucOrder(2);unitHold(ucId,ucL().id,1,'Stop on Tuesday');const h=ucL().heldUnits[0];h.at=new Date(Date.now()-864e5).toISOString();
  h.pieces.forEach(piece=>{const c=stationCheck('CUT',piece);stationMove('CUT',c,{name:'Shop'},{});});
  const u=unitCancelPlan(ucO(),ucL(),1,new Date().toISOString()).units[0],out=unitCancel(ucId,ucL().id,1,'Changed mind',{}),rec=out.value;
  return {stage:u.stage,after:u.after,charge:u.charge,ok:out.ok,saved:[rec.charge,rec.units[0].stage,!!rec.units[0].heldAt],cancelled:ucL().cancelledUnits,held:'heldUnits' in ucL()};
 }),{stage:'uncut',after:true,charge:0,ok:true,saved:[0,'uncut',true],cancelled:1,held:false});
 eq('Not cut glass leaves its batch without Unbatch: the order stays Batched, the queue does not get it back, other units go on',await t.p.evaluate(()=>{
  ucOrder(3);const o=ucO(),l=ucL(),batch=DB.glassBatch[0],before=batch.items.filter(i=>!i.releasedAt).length;
  const out=unitCancel(ucId,l.id,1,'Not needed',{}),gone=out.value.units[0].pieces,live=batch.items.filter(i=>!i.releasedAt).length;
  const check=stationCheck('CUT',gone[0]),other=stationCheck('CUT',ucSlot(2)[0]).kind;
  return {ok:out.ok,charge:out.value.charge,released:before-live,history:batch.history.at(-1).action,status:o.status,locked:salesLineLocked(l),queue:glassBatchRows([o]).length,remaining:glassBatchRemaining(o,l),kind:check.kind,unit:check.unit,other,waiting:(stationWaiting().get('CUT')||[]).length,ordered:shippingSummary(o).ordered};
 }),{ok:true,charge:0,released:2,history:'Cancelled',status:'batched',locked:true,queue:0,remaining:0,kind:'cancelled',unit:true,other:'ok',waiting:4,ordered:2});
 eq('Order total and balance: remaining units at the unit price plus the charge for the work done; the seller can change the charge',await t.p.evaluate(()=>{
  ucOrder(3);[1,2,3].forEach(n=>ucMove(n,ucAfter('CUT')));const o=ucO(),l=ucL(),unit=ucPrice().unit,totals=()=>finWithOrder(o,()=>salesOrderCommercialTotals(o)),before=totals().subtotal;
  const rec=unitCancel(ucId,l.id,1,'Not needed',{}).value,p=ucPrice(),t=totals(),bal=finOrderBalance(o);
  const set=unitSetCharge(ucId,rec.id,'10'),t2=totals(),bad=unitSetCharge(ucId,rec.id,'-1').error;unitSetCharge(ucId,rec.id,'');
  return {before:before===salesMoney(unit*3),qty:[p.qty,p.ordered,p.cancelled],line:p.line===salesMoney(unit*2),charge:rec.charge>0&&rec.units[0].stage==='cut',subtotal:t.subtotal===salesMoney(unit*2+rec.charge),balance:bal.total===t.grand,override:set.ok&&t2.subtotal===salesMoney(unit*2+10),bad,back:totals().subtotal===t.subtotal};
 }),{before:true,qty:[2,3,1],line:true,charge:true,subtotal:true,balance:true,override:true,bad:'Check the charge.',back:true});
 eq('Glass of cancelled units: scrap by default, to stock only when not tempered, customer takes rides on the next packing slip',await t.p.evaluate(()=>{
  ucOrder(4);ucMove(1,ucAfter('CUT'));ucMove(2,ucAfter(ucHeat()));ucMove(3,shippingStations().ship);ucMove(4,shippingStations().ship);const o=ucO(),l=ucL();
  const stock=unitCancel(ucId,l.id,1,'To stock',{glass:'stock'}),rows=DB.stockOffcut.map(r=>[r.glass,r.w>0&&r.h>0,r.status]);
  const tempered=unitCancel(ucId,l.id,1,'To stock',{glass:'stock'}).error,takes=unitCancel(ucId,l.id,1,'Customer takes',{glass:'customer'}),pending=unitTakes(o).map(x=>[x.line,x.pieces]);
  const s=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:[]}).value;
  const text=shippingPages(shippingDocument(s)).flatMap(pg=>pg.items.filter(i=>i.t==='text').map(i=>i.s)).join(' | ');shippingMarkShipped(s.id);
  const taken=unitTakes(o).length,frozen=shippingDocument(s).orders[0].takes.length;shippingRevert(s.id,'dispatch');
  return {stock:stock.ok,glass:stock.value.units[0].glass,rows,tempered,takes:takes.ok,pending,line:text.includes('Cancelled, customer takes · Line 1'),taken,frozen,rolled:unitTakes(o).length,units:s.items.length};
 }),{stock:true,glass:'stock',rows:[['6CLEAR',true,'stock'],['6CLEAR',true,'stock']],tempered:'Tempered glass cannot go to stock.',takes:true,pending:[[1,2]],line:true,taken:0,frozen:1,rolled:1,units:2});
 eq('The last back order is cancelled: the order is Delivered from the last delivery, and the paper shows what was cancelled',await t.p.evaluate(()=>{
  ucOrder(3);ucMove(1,shippingStations().ship);ucMove(2,shippingStations().ship);const o=ucO(),l=ucL();
  const s=shippingCreate({customerId:o.customerId,method:'pickup',shipTo:{},date:finToday(),items:shippingAvailable(o).map(shippingItem),extras:[]}).value;shippingMarkShipped(s.id);shippingMarkDelivered(s.id);
  const mid={status:o.status,back:shippingSummary(o).back},out=unitCancel(ucId,l.id,1,'Not needed',{}),more=unitCancel(ucId,l.id,1,'x',{}).error;
  const model=docBuildModel('proforma',o),item=model.items[0],extra=(model.extra&&model.extra.rows||[]).map(r=>[r.name,r.amount]);
  return {mid,ok:out.ok,status:o.status,bill:finBillingDate(o)===finToday(),more,qty:item.qty,extra};
 }),{mid:{status:'shipping',back:1},ok:true,status:'done',bill:true,more:'No units left to cancel.',qty:'Qty 3 · 1 cancelled',extra:[['Cancelled 1 unit · line 1 · work done','$0.00']]});
 eq('Hold and cancellation survive export and import; a copy of the order starts clean',await t.p.evaluate(()=>{
  ucOrder(3);[1,2,3].forEach(n=>ucMove(n,ucAfter('CUT')));unitCancel(ucId,ucL().id,1,'Not needed',{glass:'customer'});unitHold(ucId,ucL().id,1,'Stop');
  const next=prepareImportedState(JSON.parse(JSON.stringify(DB))),o=next.salesOrder.find(x=>x.id===ucId),l=o.lines[0],copy=salesCopySalesRecord(ucO(),{});
  return {held:l.heldUnits.length,cancelled:l.cancelledUnits,rec:[o.cancellations.length,o.cancellations[0].units[0].glass,o.cancellations[0].units[0].stage],copy:['heldUnits' in copy.lines[0],'cancelledUnits' in copy.lines[0]]};
 }),{held:1,cancelled:1,rec:[1,'customer','cut'],copy:[false,false]});
 // Настоящие элементы: меню строки в батче, окно Hold, полоса под строкой, окно Cancel.
 await t.p.evaluate(()=>{ucOrder(4);[1,2].forEach(n=>ucMove(n,ucAfter('CUT')));tab='sales';salesOrderEdit(ucId);render();});
 const at=await t.p.evaluate(()=>{const r=document.querySelector('tr.line-locked');r.scrollIntoView({block:'center'});const b=r.getBoundingClientRect();return {x:b.left+40,y:b.top+b.height/2};});
 await t.p.mouse.click(at.x,at.y,{button:'right'});
 eq('Line menu of a line in the shop offers Hold units and Cancel units; Release appears only with a hold',await t.p.evaluate(()=>[...document.querySelectorAll('[data-line-units]')].map(b=>b.dataset.lineUnits)),['hold','cancel']);
 await t.p.locator('[data-line-units="hold"]').click();await t.p.locator('[data-units-count]').fill('2');await t.p.locator('[data-units-count]').press('Tab');await t.p.locator('[data-units-reason]').fill('Customer asked to stop');await t.p.locator('[data-units-confirm]').click();
 eq('Hold units from the menu: a red strip under the line says how many, why and since when',await t.p.evaluate(()=>{const e=document.querySelector('[data-units-held]');return {held:ucL().heldUnits.length,draft:soDraft.lines[0].heldUnits.length,text:e&&e.textContent.replace(/\s+/g,' ').includes('2 units on hold')&&e.textContent.includes('Customer asked to stop'),buttons:[!!document.querySelector('[data-units-release]'),!!document.querySelector('[data-units-cancel]')],menu:salesLineHoldMenu===null};}),{held:2,draft:2,text:true,buttons:[true,true],menu:true});
 await t.p.locator('[data-units-cancel]').click();
 eq('Cancel units opens with the held units, their place and charge; not cut costs nothing',await t.p.evaluate(()=>({count:document.querySelector('[data-units-count]').value,reason:document.querySelector('[data-units-reason]').value,rows:[...document.querySelectorAll('[data-units-plan]')].map(r=>r.dataset.unitsPlan+' '+r.cells[2].textContent),total:document.querySelector('[data-units-total]').textContent,glass:!!document.querySelector('.line-units-glass')})),{count:'2',reason:'Customer asked to stop',rows:['uncut $0.00','uncut $0.00'],total:'$0.00',glass:false});
 await t.p.locator('[data-units-count]').fill('3');await t.p.locator('[data-units-count]').press('Tab');
 const third=await t.p.evaluate(()=>({rows:[...document.querySelectorAll('[data-units-plan]')].map(r=>r.dataset.unitsPlan),glass:!!document.querySelector('.line-units-glass'),paid:document.querySelector('[data-units-total]').textContent!=='$0.00'}));
 await t.p.getByLabel('Customer takes').check();await t.p.locator('[data-units-confirm]').click();
 eq('Cancel three: the cut unit is charged and its glass goes with the customer; the strip shows the cancellation and the line counts one unit',await t.p.evaluate(third=>{
  const e=document.querySelector('[data-units-cancelled]'),o=ucO(),rec=o.cancellations[0],p=ucPrice();
  return {third,cancelled:ucL().cancelledUnits,held:'heldUnits' in ucL(),strip:e&&e.textContent.replace(/\s+/g,' ').includes('Cancelled 3 units')&&e.textContent.includes('customer takes'),charge:+e.querySelector('input').value===rec.charge&&rec.charge>0,glass:rec.units.map(u=>u.glass),qty:[p.qty,p.ordered],draft:soDraft.cancellations.length,status:o.status};
 },third),{third:{rows:['uncut','uncut','cut'],glass:true,paid:true},cancelled:3,held:false,strip:true,charge:true,glass:['','','customer'],qty:[1,4],draft:1,status:'batched'});
 await t.p.getByLabel('Cancellation charge').fill('25');await t.p.getByLabel('Cancellation charge').press('Tab');
 eq('The seller changes the charge in the strip and the order total follows',await t.p.evaluate(()=>{const o=ucO(),t=finWithOrder(o,()=>salesOrderCommercialTotals(o));return {override:o.cancellations[0].chargeOverride,subtotal:t.subtotal===salesMoney(ucPrice().unit+25),log:DB.orderEvent.filter(e=>e.what==='Units cancelled'||e.what==='Cancellation charge').map(e=>e.what)};}),{override:25,subtotal:true,log:['Units cancelled','Cancellation charge']});
 eq('Unit cancel browser errors',t.errs,[]);await t.c.close();
};
