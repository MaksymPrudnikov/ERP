import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CentralStore } from '../central-store.mjs';
import { GatewayStore } from '../gateway-store.mjs';
import { identityServer, centralClient } from '../http.mjs';
import { postgresPool, FakeCentral } from './helpers.mjs';
const key='order-1|line-1',req=()=>randomUUID();
const issue=(store,kind='G',count=1,extra={})=>store.issue({requestId:req(),originLineKey:key,kind,count,...extra});
const job=(kind,count=100,extra={})=>({id:key+':'+kind,originLineKey:key,kind,count,...extra});
const release=(store,budget=30)=>store.release({requestId:req(),jobs:[job('G'),job('U',50)],reserveBudget:budget});

test('PostgreSQL atomic identity, retries, independent counters and long bases',async()=>{
 const db=await postgresPool(),store=new CentralStore(db.pool);try{
  await store.migrate();const body={requestId:req(),originLineKey:key,kind:'G',count:20};
  const both=await Promise.all([store.issue(body),store.issue(body)]);assert.deepEqual(both[0],both[1]);
  const more=await Promise.all(Array.from({length:10},()=>issue(store,'G',10)));
  const codes=both[0].entities.concat(...more.map(x=>x.entities)).map(e=>e.code);assert.equal(new Set(codes).size,120);
  assert.equal((await issue(store,'U')).entities[0].code,'U-0000000001-1');
  await assert.rejects(()=>store.issue({...body,count:21}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  const old=both[0].entities[0];const replacement=(await issue(store,'G',1,{replacesIds:[old.id]})).entities[0];assert.equal(replacement.replacesId,old.id);assert.notEqual(replacement.code,old.code);
  await db.pool.query("SELECT setval('identity_line_base',9007199254740993,true)");
  const large=await store.issue({requestId:req(),originLineKey:'other|line',kind:'G',count:1});assert.equal(large.line.base,'9007199254740994');assert.equal(typeof large.entities[0].instance,'string');
  assert.equal((await store.lookup(old.code)).entity.id,old.id);
 }finally{await db.close();}
});

test('LAN SQLite: 72h, 30,000 offline issuances, exhaustion and lost acknowledgement',async()=>{
 const central=new FakeCentral();let clock='2026-10-04T00:00:00Z';const gateway=new GatewayStore({path:':memory:',gatewayId:'factory-a',central,now:()=>clock});try{
  const released=await release(gateway,30000);assert.equal(released.reservedCount,30000);
  central.online=false;const ranges=released.reservations;
  const entities=[];for(let hour=0;hour<72;hour++){
   clock=new Date(Date.parse('2026-10-04T00:00:00Z')+hour*3600000).toISOString();
   for(const range of ranges){const total=Number(BigInt(range.end)-BigInt(range.start)+1n),count=Math.floor(total*(hour+1)/72)-Math.floor(total*hour/72);if(count)entities.push(...(await issue(gateway,range.kind,count)).entities);}
  }
  assert.equal(entities.length,30000);assert.equal(new Set(entities.map(e=>e.code)).size,30000);
  assert.throws(()=>issue(gateway),e=>e.code==='RANGE_EXHAUSTED');assert.equal(gateway.lookup(entities[0].code).entity.id,entities[0].id);
  central.online=true;central.dropAckOnce=true;await assert.rejects(()=>gateway.sync(),e=>e.code==='ACK_LOST');
  assert.equal(gateway.pendingCount(),30000);await gateway.sync();assert.equal(gateway.pendingCount(),0);assert.equal(central.entities.size,30000);
 }finally{gateway.close();}
});

test('gateway restoration burns old leases; other factories never share a range',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'glass-identity-')),central=new FakeCentral(),path=join(dir,'gateway.sqlite');let gateway=new GatewayStore({path,gatewayId:'factory-a',central});
 try{
  const lease=await release(gateway,12);const first=await issue(gateway);gateway.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');copyFileSync(path,join(dir,'backup.sqlite'));
  const second=await issue(gateway);gateway.close();copyFileSync(join(dir,'backup.sqlite'),path);gateway=new GatewayStore({path,gatewayId:'factory-a',central});
  central.online=false;assert.throws(()=>issue(gateway),e=>e.code==='RECONCILIATION_REQUIRED');assert.equal(gateway.lookup(first.entities[0].code).entity.id,first.entities[0].id);
  central.online=true;await release(gateway,12);const restored=await issue(gateway);assert.notEqual(restored.entities[0].code,second.entities[0].code);assert.ok(BigInt(restored.entities[0].instance)>BigInt(lease.reservations[0].end));
  const other=new GatewayStore({path:':memory:',gatewayId:'factory-b',central});try{await release(other,12);assert.notEqual((await issue(other)).entities[0].code,restored.entities[0].code);}finally{other.close();}
  assert.throws(()=>new GatewayStore({path,gatewayId:'factory-a',central}),e=>e.code==='GATEWAY_ALREADY_RUNNING');
 }finally{gateway.close();rmSync(dir,{recursive:true,force:true});}
});

test('real central and gateway preserve free assembly, retirement, durable CAS and ordered sync',async()=>{
 const db=await postgresPool(),central=new CentralStore(db.pool);await central.migrate();
 const adapter={registerGateway:b=>central.registerGateway(b),createLine:b=>central.createLine(b),reserve:b=>central.reserve(b),releaseJobs:b=>central.releaseJobs(b),jobs:id=>central.jobs(id),ingest:b=>central.ingest(b),importRegistry:b=>central.importRegistry(b)};
 const gateway=new GatewayStore({path:':memory:',gatewayId:'factory-a',central:adapter});try{
  await release(gateway,30);const glass=(await issue(gateway,'G',4)).entities,unit=(await issue(gateway,'U')).entities[0];
  const assembly={requestId:req(),type:'assembly.completed',payload:{unitId:unit.id,glassIds:[glass[0].id,glass[3].id]}};
  const same=await gateway.command(assembly);assert.deepEqual(gateway.command(assembly),same);
  assert.throws(()=>gateway.command({...assembly,requestId:req(),payload:{...assembly.payload,glassIds:[glass[1].id,glass[2].id]}}),e=>e.code==='IMMUTABLE_COMPOSITION');
  await gateway.command({requestId:req(),type:'entity.broken',payload:{entityId:unit.id}});
  const next=(await issue(gateway,'U',1,{replacesIds:[unit.id]})).entities[0];assert.equal(next.replacesId,unit.id);
  const data={productionIdentity:{authority:'gateway',entities:glass.concat(unit,next)},stationScan:[]};
  const commit={requestId:req(),revision:'0',data};assert.equal(gateway.saveWorkspace(commit).revision,'1');assert.equal(gateway.saveWorkspace(commit).revision,'1');
  assert.throws(()=>gateway.saveWorkspace({...commit,requestId:req()}),e=>e.code==='WORKSPACE_CONFLICT');
  await gateway.sync();assert.equal(gateway.pendingCount(),0);assert.deepEqual((await central.lookup(unit.code)).composition,[glass[0].id,glass[3].id].sort());assert.equal((await central.lookup(unit.code)).entity.state,'broken');
  assert.equal((await db.pool.query('SELECT revision::text FROM identity_workspaces')).rows[0].revision,'1');
  const recovery=new CentralStore(db.pool,{recoveryRequired:true});assert.throws(()=>issue(recovery),e=>e.code==='CENTRAL_RECOVERY_REQUIRED');assert.equal((await recovery.lookup(unit.code)).entity.id,unit.id);
 }finally{gateway.close();await db.close();}
});

test('HTTP service auth, origin guard, JSON validation and lookup',async()=>{
 const central=new FakeCentral(),gateway=new GatewayStore({path:':memory:',gatewayId:'http-factory',central}),token='t'.repeat(40),server=identityServer({store:gateway,role:'gateway',token});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(url+'/v1/status')).status,401);
  assert.equal((await fetch(url+'/v1/status',{headers:{authorization:'Bearer '+token,origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(url+'/v1/issue',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'no'})).status,400);
  await release(gateway,12);const e=(await issue(gateway)).entities[0];assert.equal((await centralClient(url,token).lookup(e.code)).entity.id,e.id);
 }finally{await new Promise(r=>server.close(r));gateway.close();}
});

test('mixed registry migration preserves legacy UUIDs and high-water marks, rejects conflicts and cycles',async()=>{
 const db=await postgresPool(),central=new CentralStore(db.pool);try{
  await central.migrate();const old={id:req(),kind:'G',code:'G-0000042',instance:null,originLineKey:key,createdAt:'2026-10-04T00:00:00Z',replacesId:''};
  const modern={id:req(),kind:'G',code:'G-0000000020-51',instance:'51',originLineKey:key,createdAt:old.createdAt,replacesId:old.id};
  const registry={version:1,baseSeq:'100',lines:[{key,base:'0000000020',seqG:'55',seqU:'0'}],entities:[modern,old]};
  const body={requestId:req(),registry};assert.deepEqual(await central.importRegistry(body),await central.importRegistry(body));
  assert.equal((await central.lookup(old.code)).entity.id,old.id);assert.equal((await issue(central)).entities[0].code,'G-0000000020-56');
  const other=await central.createLine({requestId:req(),originLineKey:'new|line'});assert.ok(BigInt(other.base)>100n);
  await assert.rejects(()=>central.importRegistry({requestId:req(),registry:{...registry,entities:[...registry.entities,{...old,id:req()}]}}),e=>e.code==='REGISTRY_CONFLICT');
  await assert.rejects(()=>central.importRegistry({requestId:req(),registry:{...registry,entities:[{...old,replacesId:modern.id},modern]}}),e=>e.code==='INVALID_REPLACEMENT');
  assert.equal((await central.lookup(old.code)).entity.replacesId,null);
 }finally{await db.close();}
});

test('repair keeps historical composition while a surviving glass joins one new physical unit',async()=>{
 const central=new FakeCentral(),gateway=new GatewayStore({path:':memory:',gatewayId:'repair',central});try{
  await release(gateway,30);const g=(await issue(gateway,'G',3)).entities,u=(await issue(gateway,'U',3)).entities;
  const assemble=(unit,glass)=>gateway.command({requestId:req(),type:'assembly.completed',payload:{unitId:unit.id,glassIds:glass.map(e=>e.id)}});
  assemble(u[0],[g[0],g[1]]);gateway.command({requestId:req(),type:'entity.broken',payload:{entityId:u[0].id}});
  assemble(u[1],[g[0],g[2]]);assert.equal(gateway.lookup(u[0].code).composition.length,2);assert.equal(gateway.lookup(u[1].code).composition.length,2);
  assert.throws(()=>assemble(u[2],[g[0]]),e=>e.code==='GLASS_ALREADY_ASSEMBLED');assert.equal(gateway.lookup(u[2].code).composition.length,0);
 }finally{gateway.close();}
});
