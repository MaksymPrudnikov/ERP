/* ============================================================================
   Права на сервере — из ERP, а не SQL (задание «База», этап 4; владелец,
   24.10.2026: «а зачем же нам интерфейс если ты спрятал под код?»).
   IN : cloudRpc (erp/cloud), DB.user (email — вход человека на сервер)
   OUT: cloudAccess, cloudAccessLoad, cloudMemberPush, cloudMemberState,
        cloudRulesSave; cloudJournal, cloudJournalLoad — журнал «кто что записал»
   · человек: почта входа + галочки разделов. Save в Users отправляет их на
     сервер (erp_member_set): галочка Users — администратор сервера, без
     офиса — вход отключён;
   · правила таблиц (erp_table_rule): кто читает и кто пишет — Users →
     Cloud → Access, Save отправляет весь список (erp_rules_set).
   Отказ сервера не отменяет правку в ERP: он виден внизу экрана и в колонке
   Server у человека.
   · журнал «кто что записал» (план «до 10», этап 3, 12.11.2026) — Users →
     Cloud → Journal, только администратор: команды сервера (erp_journal) —
     когда, кто, с какого ПК, сколько строк каких таблиц, или отказ.
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
/* Журнал по 200 команд, новые сверху; older — продолжить с последней. */
const CLOUD_JOURNAL_PAGE=200;
let cloudJournal={rows:null,busy:false,error:'',more:false};
async function cloudJournalLoad(older){
 if(cloudJournal.busy)return;
 cloudJournal.busy=true;cloudJournal.error='';render();
 try{
  const last=older&&cloudJournal.rows&&cloudJournal.rows[cloudJournal.rows.length-1];
  const got=await cloudRpc('erp_journal',{before_at:last?last.at:null,n:CLOUD_JOURNAL_PAGE});
  const rows=Array.isArray(got)?got:[];
  cloudJournal.rows=last?cloudJournal.rows.concat(rows):rows;cloudJournal.more=rows.length===CLOUD_JOURNAL_PAGE;
 }catch(e){cloudJournal.error=e.message;}
 cloudJournal.busy=false;render();
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
