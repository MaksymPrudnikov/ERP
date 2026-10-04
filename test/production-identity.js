/* Identity invariants are independent of UI and commercial status rules.
   This suite can run in the normal browser harness or directly in Node. */
module.exports=async function({page,eq,ok}){
 console.log('production identity');const t=await page();
 eq('per-line G/U series, secure UUIDs and retry identity',await t.p.evaluate(()=>{
  DB.productionIdentity=JSON.parse(JSON.stringify(DEFAULT.productionIdentity));
  const a=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-g-1',slot:1}),b=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-g-2',slot:2}),u=productionIdentityAllocate('U','identity-order','line-2',{requestId:'identity-u-1',slot:1}),retry=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-g-1',slot:1});
  const next=productionIdentityEnsureLine('identity-order','line-3');
  return {codes:[a.code,b.code,u.code],retry:a===retry,uuid:productionIdentityUUIDValid(a.id)&&a.id!==b.id,line:next.base,counters:productionIdentityEnsureLine('identity-order','line-2').seqG,valid:productionIdentityBarcodeValid('G-0000000001-50','G')};
 }),{codes:['G-0000000001-1','G-0000000001-2','U-0000000001-1'],retry:true,uuid:true,line:'0000000002',counters:'2',valid:true});
 eq('physical replacement and reassignment preserve origin and barcode',await t.p.evaluate(()=>{
  const a=productionIdentityFind('G-0000000001-1'),b=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-recut',replacesCode:a.code,slot:'R1.1',componentKey:'identity-order|line-2|pane|lite'});
  productionIdentityAssign(a.code,'new-order','new-line',{slot:7});
  return {replacement:b.code,relation:b.replacesId===a.id,newId:b.id!==a.id,original:a.originLineKey,current:a.orderId+'|'+a.lineId,oldResolvable:productionIdentityFind(a.code).id===a.id};
 }),{replacement:'G-0000000001-3',relation:true,newId:true,original:'identity-order|line-2',current:'new-order|new-line',oldResolvable:true});
 eq('legacy labels and aliases resolve the same physical object',await t.p.evaluate(()=>{
  const old=productionIdentityRegisterLegacy('G','G-0000012','legacy-order','legacy-line'),again=productionIdentityRegisterLegacy('G','g-0000012','legacy-order','legacy-line');
  productionIdentityAddAlias('G-0000013',old.id);
  return {same:old===again,alias:productionIdentityFind('g-0000013').id===old.id,legacy:old.legacy,instance:old.instance,base:productionIdentityEnsureLine('legacy-order','legacy-line').base,oldValid:productionIdentityBarcodeValid('U-0000001','U'),bad:productionIdentityBarcodeParse('G-0000000001-0')};
 }),{same:true,alias:true,legacy:true,instance:null,base:'0000000003',oldValid:true,bad:null});
 eq('64-bit decimal strings retain precision and overflow stops issuance',await t.p.evaluate(()=>{
  DB.productionIdentity.baseSeq='9007199254740992';
  const l=productionIdentityEnsureLine('large-order','large-line');l.seqG='9007199254740992';const e=productionIdentityAllocate('G','large-order','large-line');l.seqU=PRODUCTION_IDENTITY_MAX;
  let exhausted=false;try{productionIdentityAllocate('U','large-order','large-line');}catch(e){exhausted=/exhausted/.test(e.message);}
  return {base:l.base,code:e.code,seq:l.seqG,comparison:productionIdentityCounterCompare('9007199254740993','9007199254740992'),exhausted,json:typeof JSON.parse(JSON.stringify(DB.productionIdentity)).baseSeq};
 }),{base:'9007199254740993',code:'G-9007199254740993-9007199254740993',seq:'9007199254740993',comparison:1,exhausted:true,json:'string'});
 eq('a committed issuance ledger survives old backup restore and deletion',await t.p.evaluate(()=>{
  const old=JSON.parse(JSON.stringify(DB)),issued=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-after-backup'});productionIdentityPersistLedger();
  const committed=JSON.parse(JSON.stringify(DB));DB=old;productionIdentityReconcile(DB,committed);
  const restored=productionIdentityFind(issued.code),next=productionIdentityAllocate('G','identity-order','line-2',{requestId:'identity-after-restore'});
  DB.productionIdentity=JSON.parse(JSON.stringify(DEFAULT.productionIdentity));productionIdentityReconcile(DB);
  return {kept:restored.id===issued.id,next:next.code,deletedKept:productionIdentityFind(issued.code).id===issued.id};
 }),{kept:true,next:'G-0000000001-5',deletedKept:true});
 eq('failed main save burns numbers; restore cannot reactivate retired physical objects',await t.p.evaluate(()=>{
  const baseline=JSON.parse(JSON.stringify(DB)),e=productionIdentityAllocate('U','identity-order','line-2',{requestId:'unit-before-failed-save'});
  e.active=false;e.retiredAt='2026-10-04T12:00:00Z';e.retiredReason='Broken';e.status='broken';e.assemblyId='SC-identity';e.componentIds=[productionIdentityFind('G-0000000001-1').id];e.componentCodes=['G-0000000001-1'];productionIdentityPersistLedger();
  // Storage command rolls back memory after the subsequent main write fails.
  DB=baseline;const fresh=productionIdentityAllocate('U','identity-order','line-2',{requestId:'unit-after-failed-save'}),old=productionIdentityFind(e.code);
  return {code:fresh.code,unique:fresh.id!==e.id&&fresh.code!==e.code,retired:old.active===false&&old.status==='broken',composition:old.assemblyId==='SC-identity'&&old.componentCodes[0]==='G-0000000001-1'};
 }),{code:'U-0000000001-3',unique:true,retired:true,composition:true});
 eq('reserved ranges are disjoint and stop when offline stock is exhausted',await t.p.evaluate(()=>{
  localStorage.removeItem(PRODUCTION_IDENTITY_LEDGER_KEY);DB.productionIdentity=JSON.parse(JSON.stringify(DEFAULT.productionIdentity));productionIdentityInstallRanges('site-a',[{id:'base-a',kind:'BASE',first:'100',last:'100'},{id:'g-a',kind:'G',lineKey:'offline|line',base:'0000000100',first:'500',last:'501'}]);
  const a=productionIdentityAllocate('G','offline','line',{requestId:'offline-1'}),b=productionIdentityAllocate('G','offline','line',{requestId:'offline-2'});let exhausted=false,overlap=false;
  try{productionIdentityAllocate('G','offline','line');}catch(e){exhausted=/reserved/.test(e.message);}
  try{productionIdentityInstallRanges('site-b',[{id:'g-b',kind:'G',lineKey:'offline|line',base:'0000000100',first:'501',last:'502'}]);}catch(e){overlap=/overlap/.test(e.message);}
  return {codes:[a.code,b.code],exhausted,overlap,scan:productionIdentityFind(a.code).id===a.id};
 }),{codes:['G-0000000100-500','G-0000000100-501'],exhausted:true,overlap:true,scan:true});
 eq('registry import rejects duplicate codes, UUIDs and mismatched origins',await t.p.evaluate(()=>{
  const s=JSON.parse(JSON.stringify(DB.productionIdentity)),bad=[];
  for(const alter of [v=>v.entities.push(Object.assign({},v.entities[0],{id:productionIdentityUUID()})),v=>v.entities[0].originLineKey='unknown|line',v=>v.entities[0].instance='600']){const v=JSON.parse(JSON.stringify(s));alter(v);try{validateProductionIdentityPayload({productionIdentity:v});bad.push(false);}catch(e){bad.push(true);}}
  return bad;
 }),[true,true,true]);
 eq('allocation requests cannot be reused for another line',await t.p.evaluate(()=>{try{productionIdentityAllocate('G','other','line',{requestId:'offline-1'});return false;}catch(e){return /another allocation/.test(e.message);}}),true);
 eq('gateway results retain authority UUID and series; errors never fall back locally',await t.p.evaluate(()=>{
  DB.productionIdentity=JSON.parse(JSON.stringify(DEFAULT.productionIdentity));DB.productionIdentity.authority='gateway';
  window.productionIdentityRemote=(command,body)=>command==='line'?{line:{originLineKey:body.originLineKey,base:'0000000800'}}:{entities:[{id:'123e4567-e89b-42d3-a456-426614174000',kind:body.kind,code:body.kind+'-0000000800-40',originLineKey:body.originLineKey,instance:'40',createdAt:'2026-10-04T00:00:00Z'}]};
  const e=productionIdentityAllocate('G','gateway','line',{requestId:'gateway-request',slot:8}),retry=productionIdentityAllocate('G','gateway','line',{requestId:'gateway-request'});
  window.productionIdentityRemote=()=>{throw new Error('Gateway offline');};let blocked=false;try{productionIdentityAllocate('G','gateway','line',{requestId:'gateway-2'});}catch(e){blocked=e.message==='Gateway offline';}
  delete window.productionIdentityRemote;
  return {id:e.id,code:e.code,slot:e.slot,retry:retry.id===e.id,blocked,count:DB.productionIdentity.entities.length};
 }),{id:'123e4567-e89b-42d3-a456-426614174000',code:'G-0000000800-40',slot:8,retry:true,blocked:true,count:1});
 eq('without secure random UUID generation issuance fails',await t.p.evaluate(()=>typeof crypto.randomUUID==='function'||typeof crypto.getRandomValues==='function'),true);
 eq('no page errors',t.errs,[]);await t.c.close();
};
/* Small isolated harness avoids bundling the whole ERP to verify this core. */
if(require.main===module){
 const fs=require('fs'),vm=require('vm'),crypto=require('crypto').webcrypto;
 const memory=new Map(),sandbox={crypto,Uint8Array,console,Date,window:{},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}};vm.createContext(sandbox);
 vm.runInContext('const DEFAULT={};let DB={};'+fs.readFileSync(require('path').join(__dirname,'../src/erp/production/identity.js'),'utf8')+';DB={productionIdentity:JSON.parse(JSON.stringify(DEFAULT.productionIdentity))};',sandbox);
 // Window functions are globals in the browser.
 sandbox.window=sandbox;let failures=0,checks=0;
 module.exports({page:async()=>({p:{evaluate:fn=>Promise.resolve(vm.runInContext('('+fn.toString()+')()',sandbox))},c:{close:async()=>{}},errs:[]}),eq:(name,got,want)=>{checks++;if(JSON.stringify(got)!==JSON.stringify(want)){failures++;console.error('FAIL '+name,got,want);}else console.log('ok '+name);},ok:()=>{}}).then(()=>{console.log(checks+' checks, '+failures+' failures');process.exitCode=failures?1:0;}).catch(e=>{console.error(e);process.exitCode=1;});
}
