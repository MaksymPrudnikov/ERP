/* ============================================================================
   Права на сервере — из ERP, а не SQL (задание «База», этап 4; владелец,
   24.10.2026: «а зачем же нам интерфейс если ты спрятал под код?»).
   IN : cloudRpc (erp/cloud), DB.user (email — вход человека на сервер)
   OUT: cloudAccess, cloudAccessLoad, cloudMemberPush, cloudMemberState,
        cloudRulesSave
   · человек: почта входа + галочки разделов. Save в Users отправляет их на
     сервер (erp_member_set): галочка Users — администратор сервера, без
     офиса — вход отключён;
   · правила таблиц (erp_table_rule): кто читает и кто пишет — Users →
     Cloud → Access, Save отправляет весь список (erp_rules_set).
   Отказ сервера не отменяет правку в ERP: он виден внизу экрана и в колонке
   Server у человека.
   ============================================================================ */
let cloudAccess={members:null,rules:null,error:'',busy:false,asked:false,draft:null,open:''};
function cloudAccessOn(){const s=cloudConfig().session;return !!(s&&s.access);}
/* Люди сервера видны только администратору: не администратор — members
   пусто (null), и колонки Server нет. */
async function cloudAccessLoad(){
 if(!cloudAccessOn()||cloudAccess.busy)return;
 cloudAccess.busy=true;cloudAccess.asked=true;
 try{
  cloudAccess.rules=await cloudRpc('erp_rules');
  try{cloudAccess.members=await cloudRpc('erp_members');}
  catch(e){if(!/administrator/.test(e.message))throw e;cloudAccess.members=null;}
  cloudAccess.error='';
 }catch(e){cloudAccess.error=e.message;}
 cloudAccess.busy=false;render();
}
function cloudMemberOf(u){
 const access=u.access||[];
 return {email:u.email,name:u.name||'',admin:access.includes(ACCESS_ADMIN),active:access.length>0,sections:access};
}
/* old — почта, которая была у человека до правки: другой вход больше не
   его, на сервере он отключается. */
async function cloudMemberPush(u,old){
 if(!cloudAccessOn())return;
 const list=[];
 if(old&&old!==(u&&u.email))list.push({email:old,name:u&&u.name||'',admin:false,active:false,sections:[]});
 if(u&&u.email)list.push(cloudMemberOf(u));
 if(!list.length)return;
 for(const m of list){
  try{await cloudRpc('erp_member_set',m);}
  catch(e){if(typeof cloudSync!=='undefined')cloudSync.warn='Server: '+m.email+' — '+e.message;}
 }
 await cloudAccessLoad();
}
/* Совпадает ли человек ERP с сервером: '' — не с чем сравнить. */
function cloudMemberState(u){
 if(!Array.isArray(cloudAccess.members)||!u.email)return '';
 const m=cloudAccess.members.find(x=>x.email===u.email);
 if(!m)return 'missing';
 const want=cloudMemberOf(u),secs=a=>USER_SECTIONS.filter(k=>(a||[]).includes(k)).join(',');
 return m.active===want.active&&(!want.active||m.admin===want.admin&&secs(m.sections)===secs(want.sections))?'ok':'differs';
}
async function cloudRulesSave(rules){
 cloudAccess.busy=true;cloudAccess.error='';render();
 try{
  cloudAccess.rules=await cloudRpc('erp_rules_set',{rules:rules.map(r=>({tbl:r.tbl,read:r.read||'',write:r.write||''}))});
  cloudAccess.draft=null;cloudAccess.open='';
 }catch(e){cloudAccess.error=e.message;}
 cloudAccess.busy=false;render();
 return !cloudAccess.error;
}
