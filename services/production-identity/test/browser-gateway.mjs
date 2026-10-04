// Isolated test service; no production data or credentials.
import { GatewayStore } from '../gateway-store.mjs';
import { identityServer } from '../http.mjs';
import { FakeCentral } from './helpers.mjs';
import { fileURLToPath } from 'node:url';
const central=new FakeCentral(),store=new GatewayStore({path:':memory:',gatewayId:'browser-test',central});
await store.reconcile();
const server=identityServer({store,role:'gateway',token:process.env.IDENTITY_TEST_TOKEN,erpRoot:fileURLToPath(new URL('../../../src/',import.meta.url))});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({url:'http://127.0.0.1:'+server.address().port})+'\n'));
process.on('message',async message=>{try{
 if(message==='offline')central.online=false;
 if(message==='online'){central.online=true;await store.sync();}
 process.send({online:central.online,pending:store.pendingCount()});
}catch(e){process.send({error:e.message});}});
process.on('SIGTERM',()=>server.close(()=>{store.close();process.exit(0);}));
