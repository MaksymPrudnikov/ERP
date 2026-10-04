/* LAN gateway transport. Credentials stay on this terminal, outside exports.
   The synchronous adapter matches existing ERP commands. Issuance is committed
   on the gateway before returning a printable barcode; there is no fallback. */
const PRODUCTION_GATEWAY_CONFIG='glass-production-gateway';
let productionGatewayRevision='0',productionGatewayStatus=null,productionGatewayNotice='',productionGatewayJobs=new Set();
function productionGatewayConfig(){try{return JSON.parse(localStorage.getItem(PRODUCTION_GATEWAY_CONFIG)||'null');}catch(e){return null;}}
function productionGatewayRequest(method,path,body){
 const config=productionGatewayConfig();if(!config)throw new Error('Configure the production gateway before issuing labels.');
 const xhr=new XMLHttpRequest();xhr.open(method,config.url+path,false);xhr.setRequestHeader('Authorization','Bearer '+config.token);
 if(body!==undefined)xhr.setRequestHeader('Content-Type','application/json');
 try{xhr.send(body===undefined?null:JSON.stringify(body));}catch(e){throw new Error('Production gateway unavailable. Check the factory network.');}
 let value;try{value=JSON.parse(xhr.responseText);}catch(e){throw new Error('Invalid production gateway response.');}
 if(xhr.status<200||xhr.status>=300)throw new Error(value.error&&value.error.message||'Production gateway rejected this operation.');return value;
}
function productionGatewayJob(orderId,lineId,kind){
 const key=productionIdentityLineKey(orderId,lineId),o=salesRecord(orderId)||(typeof soDraft!=='undefined'&&soDraft&&soDraft.id===orderId?soDraft:null),l=o&&o.lines.find(x=>x.id===lineId);
 if(!o||!l||salesIsQuote(o))throw new Error('Save an order before releasing production numbers.');
 return {id:key+':'+kind,originLineKey:key,kind,count:Math.max(1,kind==='G'?glassBatchComponents(o,l).length*l.qty:l.qty),payload:{orderId,lineId}};
}
function productionIdentityRemote(command,body){
 const status=productionGatewayRequest('GET','/v1/status');if(!status.reconciled)throw new Error('Reconcile the restarted factory gateway and release fresh ranges.');
 if(command==='issue'){
  const jobKey=body.originLineKey+':'+body.kind;
  if(!productionGatewayJobs.has(jobKey)){
   const ids=body.originLineKey.split('|'),job=productionGatewayJob(ids[0],ids[1],body.kind);
   productionGatewayRequest('POST','/v1/release',{requestId:productionIdentityUUID(),jobs:[job],reserveBudget:Math.min(30000,Math.max(job.count,1000))});productionGatewayJobs.add(jobKey);
  }
 }
 return productionGatewayRequest('POST',command==='line'?'/v1/lines':'/v1/issue',body);
}
function productionGatewayLoad(){
 if(!productionGatewayConfig())return;
 const workspace=productionGatewayRequest('GET','/v1/workspace');productionGatewayRevision=workspace.revision;
 if(workspace.data){DB=workspace.data;productionIdentityReconcile(DB);storageInvalidate();}
 const status=productionGatewayRequest('GET','/v1/status');productionGatewayStatus=status;
 if(DB.productionIdentity.authority==='gateway')DB.productionIdentity.reconciliationRequired=!status.reconciled;
 productionGatewayJobs=new Set(productionGatewayRequest('GET','/v1/jobs').jobs.map(j=>j.originLineKey+':'+j.kind));
}
function productionGatewayCheckCurrent(){
 if(productionIdentityState().authority!=='gateway')return;
 const workspace=productionGatewayRequest('GET','/v1/workspace');
 if(workspace.revision!==productionGatewayRevision){
  if(!workspace.data)throw new Error('Factory workspace needs recovery.');
  DB=workspace.data;productionIdentityReconcile(DB);storageBaseline=JSON.stringify(DB);storageInvalidate();productionGatewayRevision=workspace.revision;
  throw new Error('Another terminal updated production. Repeat this action.');
 }
}
function productionGatewaySave(){
 if(productionIdentityState().authority!=='gateway')return;
 const result=productionGatewayRequest('POST','/v1/workspace',{requestId:productionIdentityUUID(),revision:productionGatewayRevision,data:DB});productionGatewayRevision=result.revision;
}
function productionGatewayRelease(){
 const jobs=[];(DB.salesOrder||[]).filter(o=>!salesIsQuote(o)&&!['cancelled','archived'].includes(o.status)).forEach(o=>o.lines.forEach(l=>{
  if(!(l.qty>0))return;jobs.push(productionGatewayJob(o.id,l.id,'G'));if(glassBatchComponents(o,l).filter(c=>!c.missing).length>=2)jobs.push(productionGatewayJob(o.id,l.id,'U'));
 }));
 if(jobs.length){const result=productionGatewayRequest('POST','/v1/release',{requestId:productionIdentityUUID(),jobs,reserveBudget:30000});productionGatewayJobs=new Set(result.jobs.map(j=>j.originLineKey+':'+j.kind));}
 return jobs.length;
}
function productionGatewayConnect(){
 const priorConfig=localStorage.getItem(PRODUCTION_GATEWAY_CONFIG);
 try{
  const url=document.getElementById('productionGatewayUrl').value.trim().replace(/\/+$/,''),token=document.getElementById('productionGatewayToken').value;
  if(!/^https?:\/\//.test(url)||token.length<32)throw new Error('Enter a gateway URL and a service token of at least 32 characters.');
  localStorage.setItem(PRODUCTION_GATEWAY_CONFIG,JSON.stringify({url,token}));
  productionGatewayRequest('POST','/v1/sync',{});
  const workspace=productionGatewayRequest('GET','/v1/workspace');
  if(workspace.data){productionGatewayLoad();normalizeDB();}
  else{
   normalizeProductionIdentity();productionGatewayRequest('POST','/v1/import-registry',{requestId:productionIdentityUUID(),registry:DB.productionIdentity});
   productionGatewayRevision=workspace.revision;productionGatewayRelease();DB.productionIdentity.authority='gateway';DB.productionIdentity.reconciliationRequired=false;
  }
  if(touch()===false)throw new Error(storageLastError);productionGatewayNotice='Connected';
 }catch(e){if(DB.productionIdentity.authority==='browser'){if(priorConfig)localStorage.setItem(PRODUCTION_GATEWAY_CONFIG,priorConfig);else localStorage.removeItem(PRODUCTION_GATEWAY_CONFIG);}productionGatewayNotice=e.message;}render();
}
function productionGatewayAction(action){try{
 if(action==='release')productionGatewayRelease();else productionGatewayRequest('POST','/v1/sync',{});
 productionGatewayStatus=productionGatewayRequest('GET','/v1/status');
 if(productionGatewayStatus.reconciled&&DB.productionIdentity.authority==='gateway')productionIdentityAuthorityReconciled('gateway');
 productionGatewayNotice=action==='release'?'Queue released':'Synchronized';
 }catch(e){productionGatewayNotice=e.message;}render();}
function viewMdProductionIdentity(){
 const c=productionGatewayConfig(),s=productionGatewayStatus;
 return '<div class="card"><h3>Production identity</h3><p>'+esc(DB.productionIdentity.authority==='gateway'?'Factory gateway':'Single browser database')+'</p><label>Gateway URL <input id="productionGatewayUrl" value="'+esc(c&&c.url||location.origin+'/')+'" placeholder="http://factory-server:8782"></label><label>Service token <input id="productionGatewayToken" type="password" autocomplete="off" value="'+esc(c&&c.token||'')+'"></label><button onclick="productionGatewayConnect()">Connect</button><button onclick="productionGatewayAction(\'release\')">Release queue</button><button onclick="productionGatewayAction(\'sync\')">Sync</button><p role="status">'+esc(productionGatewayNotice)+'</p>'+(s?'<p>'+esc(s.gatewayId)+' · '+s.pendingEvents+' pending events · '+(s.reconciled?'Ready':'Reconciliation required')+'</p><ul>'+s.reservations.map(r=>'<li>'+esc(r.originLineKey)+' · '+r.kind+' · '+r.remaining+' remaining</li>').join('')+'</ul>':'')+'</div>';
}
