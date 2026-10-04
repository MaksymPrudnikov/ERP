const test=require('node:test'),assert=require('node:assert/strict'),{fork}=require('node:child_process'),{once}=require('node:events'),{randomBytes}=require('node:crypto'),path=require('node:path'),{chromium}=require('playwright');
test('ERP terminals share durable LAN scans, offline recuts, idempotent codes and conflicts',{timeout:60000},async()=>{
 const token=randomBytes(32).toString('hex'),child=fork(path.join(__dirname,'../services/production-identity/test/browser-gateway.mjs'),[],{silent:true,env:{...process.env,IDENTITY_TEST_TOKEN:token}});
 let browser;try{
  const url=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',s=>{out+=s;if(out.includes('\n'))resolve(JSON.parse(out.split('\n')[0]).url);});child.on('exit',code=>reject(new Error('Test gateway exited: '+code)));child.stderr.on('data',s=>process.stderr.write(s));});
  browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  const open=async()=>{const c=await browser.newContext();await c.addInitScript(()=>window.GF_NO_SIGNIN=true);const p=await c.newPage();p.on('dialog',d=>d.accept());await p.goto(url+'/erp/index.html');await p.waitForTimeout(300);return p;};
  const a=await open();await require('./optimization-fixture')(a);
  const original=await a.evaluate(()=>{oqReset();const id=oqOrder(oqCustomer());soEdit=null;soDraft=null;salesSetRecordStatus(id,'verified');return {id,codes:DB.glassPiece.flatMap(r=>r.ids),uuids:DB.productionIdentity.entities.map(e=>e.id)};});
  const connect=async p=>p.evaluate(({url,token})=>{tab='masterdata';mdTab='identity';render();document.getElementById('productionGatewayUrl').value=url;document.getElementById('productionGatewayToken').value=token;productionGatewayConnect();return productionGatewayNotice;},{url,token});
  assert.equal(await connect(a),'Connected');assert.deepEqual(await a.evaluate(()=>DB.productionIdentity.entities.map(e=>e.id)),original.uuids);
  const b=await open();assert.equal(await connect(b),'Connected');assert.equal(await b.evaluate(()=>DB.salesOrder[0].id),original.id);
  const scan=async(p,code)=>p.evaluate(code=>{const check=stationCheck('CUT',code),result=stationRecord('CUT',check,{id:'worker',name:'Worker'});return {ok:!!result,error:storageLastError,scans:DB.stationScan.length};},code);
  const stale=await scan(a,original.codes[0]);assert.equal(stale.ok,false);assert.match(stale.error,/Another terminal/);
  assert.equal((await scan(a,original.codes[0])).ok,true);
  const staleB=await scan(b,original.codes[1]);assert.equal(staleB.ok,false);assert.equal((await scan(b,original.codes[1])).ok,true);
  const message=async value=>{const response=once(child,'message');child.send(value);return (await response)[0];};
  await message('offline');
  // Refresh A first; then break an identified pane, allocating a replacement from its lease.
  await a.evaluate(()=>{try{productionGatewayCheckCurrent();}catch(e){}});
  const replacement=await a.evaluate(code=>{
   const g=stationGlass(code),reason=ncrReasonsFor('CUT',{activeOnly:true})[0];
   const result=stationBreak('CUT',stationCheck('CUT',code),{id:'worker',name:'Worker'},reason.id);
   if(result.error)throw new Error(result.error);const fresh=productionIdentityFind(result.allNew[0]);
   return {code:fresh.code,id:fresh.id,replacesId:fresh.replacesId,old:productionIdentityFind(code).id};
  },original.codes[0]);assert.equal(replacement.replacesId,replacement.old);assert.notEqual(replacement.code,original.codes[0]);
  await a.reload();await a.waitForTimeout(300);assert.equal(await a.evaluate(code=>productionIdentityFind(code).id,replacement.code),replacement.id);
  const response=await message('online');assert.equal(response.pending,0);assert.equal(response.error,undefined);
  assert.ok((await scan(b,original.codes[2])).error.includes('Another terminal'));assert.equal((await scan(b,original.codes[2])).ok,true);
  // Office Recut must reject a stale workspace before issuing any replacements.
  const office=await a.evaluate(code=>{
   const e=productionIdentityFind(code),o=salesRecord(e.orderId),before=DB.recut.length,reason=ncrReasonsFor('CUT',{activeOnly:true})[0];
   const result=recutCreate({orderId:o.id,where:'CUT',reasonId:reason.id,lines:{[e.lineId]:{on:true,qty:1,which:'unit',codes:code}}});
   return {error:result.error,before,after:DB.recut.length};
  },original.codes[3]);assert.match(office.error,/Another terminal/);assert.equal(office.after,office.before);
  // Server commit succeeds, but the terminal cannot cache it. A subsequent
  // command must reload the committed scan before it can save anything else.
  const cacheFailure=await a.evaluate(code=>{
   const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===STORAGE_KEY)throw new Error('Injected cache failure');return set.call(this,key,value);};
   let result;try{result=stationRecord('CUT',stationCheck('CUT',code),{id:'worker',name:'Worker'});}finally{Storage.prototype.setItem=set;}
   const revision=productionGatewayRevision;let refresh='';try{productionGatewayCheckCurrent();}catch(e){refresh=e.message;}
   return {ok:!!result,revision,refresh,scans:DB.stationScan.filter(r=>r.piece===code&&r.station==='CUT').length};
  },original.codes[3]);assert.equal(cacheFailure.ok,false);assert.equal(cacheFailure.revision,null);assert.match(cacheFailure.refresh,/Another terminal/);assert.equal(cacheFailure.scans,1);
  assert.equal((await scan(a,original.codes[4])).ok,true);
  await a.reload();await a.waitForTimeout(300);assert.equal(await a.evaluate(code=>DB.stationScan.filter(r=>r.piece===code&&r.station==='CUT').length,original.codes[3]),1);
  const requestId=randomBytes(12).toString('hex');const call=()=>fetch(url+'/v1/issue',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({requestId,originLineKey:'unreleased|line',kind:'G',count:1})});
  // A missing/released-line error must never allocate a browser substitute.
  assert.equal((await call()).status,404);
 }finally{if(browser)await browser.close();child.kill('SIGTERM');}
});
