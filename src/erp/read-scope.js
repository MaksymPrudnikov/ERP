/* =====================================================================
   erp/read-scope  ·  erp-1.0
   Указатели на время одной отрисовки (задание «База», П1). Экран спрашивает
   «где стёкла заказа», «сканы стекла», «накладные заказа» для каждого
   заказа подряд — и каждый вопрос проходил всю историю цеха. Теперь
   указатель строится один раз на отрисовку экрана.
   Вне отрисовки (действие, печать) — как раньше, заново на каждый вопрос:
   действие меняет базу, а указатель, построенный до перемены, соврал бы
   (проверка Codex 22.10.2026). Запись посреди отрисовки (touch) и
   действие внутри неё указатели тоже не используют.
   IN : DB, storageDepth
   OUT: readScope(fn), readScopeNow(fn), readOn(), readMemo(key,sources,build), readMemoReset()
   ===================================================================== */
let readDepth=0,readMemos=null,readForce=false;
function readScope(fn){
 if(!readDepth++)readMemos=new Map();
 try{return fn();}finally{if(!--readDepth)readMemos=null;}
}
/* sources — таблицы, из которых строится указатель: другая ссылка или
   длина (отрисовка дописала строку) — строится заново. */
function readMemo(key,sources,build){
 if(!readOn())return build();
 const hit=readMemos.get(key);
 if(hit&&hit.src.length===sources.length&&hit.src.every((a,i)=>a===sources[i]&&hit.n[i]===(a?a.length:-1)))return hit.value;
 const value=build();readMemos.set(key,{src:sources,n:sources.map(a=>a?a.length:-1),value});return value;
}
/* Чистое чтение посреди действия (документ PS, проверка выбора): свои
   указатели на время fn. Внутри fn база не меняется — указатели не соврут;
   запись посреди (touch) их сбрасывает, как и в отрисовке. */
function readScopeNow(fn){
 const memos=readMemos,depth=readDepth,force=readForce;readMemos=new Map();readDepth=1;readForce=true;
 try{return fn();}finally{readMemos=memos;readDepth=depth;readForce=force;}
}
/* Отрисовка идёт и действие не начато — указатели можно брать. */
function readOn(){return !!readMemos&&(readForce||!(typeof storageDepth!=='undefined'&&storageDepth));}
/* Запись (storageInvalidate) — указатели этой отрисовки больше не верны. */
function readMemoReset(){if(readMemos)readMemos=new Map();}
