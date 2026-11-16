/* ============================================================================
   Письма заказа: привязка ветки Gmail к заказу или квоте и ссылки на неё
   (задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md, этап 1).
   IN : DB.salesOrder[].emails, открытый заказ (soDraft, soEdit, soQuoteCopyOf),
        адрес письма из Gmail текстом
   OUT: orderEmailsClean, orderEmailUrl, orderEmailFindUrl, orderEmailFromLink,
        orderEmailLatest, orderEmailAdd, orderEmailRemove, orderEmailLogNotes
   Заказчик задания, 15.11.2026: заказы приходят письмами на общий ящик — из
   заказа должно быть легко открыть оригинальное письмо. Привязка — запись о
   ветке (thread): одна на ветку, сколько бы ответов ни пришло; хранит и ветку,
   и письмо, из которого её привязали (messageId). Текст письма не хранится.
   Привязка пишется сразу, без Save (как Hold): она не меняет содержание
   заказа, и закрытый заказ её тоже принимает. Система сама ничего не
   привязывает — только по действию человека.
   Ссылка: ящик из записи (authuser) + ветка; запасная — поиск Gmail по
   отправителю и теме, она находит письмо и в другом ящике.
   ============================================================================ */
const ORDER_EMAIL_MAX=20;
function orderEmailText(v,n){return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);}
function orderEmailAddress(v){const s=orderEmailText(v,120).toLowerCase();return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s)?s:'';}
function orderEmailId(v){const s=orderEmailText(v,80);return /^[A-Za-z0-9_-]{10,80}$/.test(s)?s:'';}
function orderEmailIso(v){const s=orderEmailText(v,40);return s&&!Number.isNaN(Date.parse(s))?s:'';}
function orderEmailClean(e){
 e=e&&typeof e==='object'?e:{};
 const threadId=orderEmailId(e.threadId);if(!threadId)return null;
 return {threadId,messageId:orderEmailId(e.messageId),account:orderEmailAddress(e.account),from:orderEmailAddress(e.from),fromName:orderEmailText(e.fromName,80),
  subject:orderEmailText(e.subject,200),at:orderEmailIso(e.at),by:orderEmailText(e.by,80),addedAt:orderEmailIso(e.addedAt)};
}
/* Одна запись на ветку: повторная привязка той же ветки заменяет запись на
   её месте. Больше ORDER_EMAIL_MAX не храним — остаются последние. */
function orderEmailsClean(list){
 const out=[];
 (Array.isArray(list)?list:[]).forEach(x=>{const e=orderEmailClean(x);if(!e)return;const i=out.findIndex(y=>y.threadId===e.threadId);if(i>=0)out[i]=e;else out.push(e);});
 return out.slice(-ORDER_EMAIL_MAX);
}
function orderEmailLatest(o){const l=o&&Array.isArray(o.emails)?o.emails:[];return l.length?l[l.length-1]:null;}
function orderEmailBase(e){return 'https://mail.google.com/mail/u/'+(e.account?'?authuser='+encodeURIComponent(e.account):'0/');}
function orderEmailUrl(e){return e&&e.threadId?orderEmailBase(e)+'#all/'+encodeURIComponent(e.threadId):'';}
/* Поиск Gmail по отправителю и теме. Нет ни того, ни другого (ссылку вставили
   руками) — искать нечем. */
function orderEmailFindUrl(e){
 if(!e)return '';
 const q=[e.from?'from:'+e.from:'',e.subject?'subject:"'+e.subject.replace(/"/g,' ')+'"':''].filter(Boolean).join(' ');
 return q?orderEmailBase(e)+'#search/'+encodeURIComponent(q):'';
}
/* Адрес открытого письма из строки браузера: …/mail/u/0/#inbox/<ветка>,
   #label/<метка>/<ветка>, #search/<запрос>/<ветка>. Список писем (#inbox) и
   настройки ветки не несут — null. */
function orderEmailFromLink(text){
 let u;try{u=new URL(String(text||'').trim());}catch(err){return null;}
 if(u.protocol!=='https:'||u.hostname!=='mail.google.com')return null;
 const parts=u.hash.replace(/^#/,'').split('?')[0].split('/').filter(Boolean),id=parts.length>1&&parts[0]!=='settings'?parts[parts.length-1]:'';
 return id.length>=14?orderEmailClean({threadId:id,account:u.searchParams.get('authuser')||''}):null;
}
function orderEmailWho(){const u=typeof signinUser==='function'?signinUser():null;return u&&u.name||'';}
/* Запись, чьи письма правит открытый редактор: сохранённый заказ или
   отправленная ревизия квоты, открытая рабочей копией. Новый, ещё не
   записанный заказ — null: его письма живут в черновике до Save. */
function orderEmailEditorId(){return typeof soQuoteCopyOf!=='undefined'&&soQuoteCopyOf||(typeof soEdit!=='undefined'&&soEdit&&soEdit!=='new'?soEdit:null);}
function orderEmailSet(o,list){if(list.length)o.emails=list;else delete o.emails;}
/* Правка писем сохранённой записи одной командой; открытый в редакторе
   черновик получает то же, чтобы его несохранённые правки не потерялись. */
function orderEmailWrite(orderId,change){
 const out=storageCommand(()=>{
  const o=(DB.salesOrder||[]).find(x=>x.id===orderId);if(!o)return {error:'The order was not found.'};
  orderEmailSet(o,orderEmailsClean(change((o.emails||[]).slice())));o.updatedAt=new Date().toISOString();
  /* Запись — в том же порядке полей, что даёт нормализация: иначе открытый
     заказ считался бы изменённым. */
  const now=normalizeSalesOrderIn(orderId)||o;
  if(typeof soDraft!=='undefined'&&soDraft&&orderEmailEditorId()===orderId){orderEmailSet(soDraft,JSON.parse(JSON.stringify(now.emails||[])));if(soDraft.id===orderId)soDraft.updatedAt=now.updatedAt;}
  return true;
 },{salesOrder:[orderId]});
 return out.ok?{ok:true}:{ok:false,error:out.error};
}
function orderEmailStamp(email){const e=orderEmailClean(email);return e?Object.assign(e,{by:orderEmailWho(),addedAt:new Date().toISOString()}):null;}
function orderEmailAdd(orderId,email){
 const e=orderEmailStamp(email);if(!e)return {ok:false,error:'This is not a link to a Gmail email.'};
 return orderEmailWrite(orderId,list=>list.concat(e));
}
function orderEmailRemove(orderId,threadId){return orderEmailWrite(orderId,list=>list.filter(x=>x.threadId!==threadId));}
/* Журнал заказа (erp/sales/order-log): что привязали и что сняли. */
function orderEmailLogNotes(a,b){
 const was=new Map((a.emails||[]).map(e=>[e.threadId,e])),now=new Map((b.emails||[]).map(e=>[e.threadId,e])),out=[],name=e=>e.subject||e.from||'Gmail link';
 now.forEach((e,id)=>{if(!was.has(id))out.push(['Email linked',name(e)]);});
 was.forEach((e,id)=>{if(!now.has(id))out.push(['Email removed',name(e)]);});
 return out;
}
