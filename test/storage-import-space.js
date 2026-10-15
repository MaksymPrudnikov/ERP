/* Import, когда в браузере нет места (владелец, 15.10.2026: база недели не
   загрузилась — «Not saved»). Новая база и копия текущей вместе не
   помещаются: вопрос, текущая база уходит файлом, новая встаёт без копии; не
   помещается и одна — понятная ошибка, база прежняя. */
module.exports=async function({page,eq}){
 console.log('storage import space');const t=await page();
 await t.p.waitForFunction(()=>storageWriter&&!storageStarting);
 const out=await t.p.evaluate(()=>{
  const real=Storage.prototype.setItem,said=[],files=[],dl=window.storageDownload,al=window.alert;
  /* Потолок хранилища в символах, как у браузера. */
  const cap=limit=>{Storage.prototype.setItem=function(k,v){let n=String(v).length;for(let i=0;i<this.length;i++){const key=this.key(i);if(key!==k)n+=(this.getItem(key)||'').length;}if(n>limit)throw new DOMException('Quota','QuotaExceededError');return real.call(this,k,v);};};
  window.storageDownload=(name,text)=>files.push([name,text.length>0]);window.alert=m=>said.push(m);
  const big=(n,tag)=>{const d=JSON.parse(JSON.stringify(DB));d.customer=d.customer.concat(Array.from({length:n},(x,i)=>normalizeCustomer({legalName:'Space test '+i,code:tag+i,notes:'x'.repeat(2000)})));return {format:'glass-erp',schemaVersion:1,data:d};};
  const cur=JSON.stringify(DB).length,fits=big(150,'SPA'),n=JSON.stringify(fits.data).length;
  try{
   cap(cur+n-1000);
   const ok=storageImportState(fits),a={ok,customers:DB.customer.filter(c=>/^Space test/.test(c.legalName)).length,files:files.slice(),backup:localStorage.getItem('glazing_system_v1-before-import')===null,said:said.slice()};
   files.length=0;said.length=0;const before=JSON.stringify(DB.customer.length);
   cap(n-1000);const huge=big(300,'SPB'),no=storageImportState(huge);
   const b={ok:no,same:JSON.stringify(DB.customer.length)===before,files:files.slice(),said:said.map(m=>m.replace(/[0-9.]+ MB/,'N MB'))};
   return {a,b};
  }finally{Storage.prototype.setItem=real;window.storageDownload=dl;window.alert=al;}
 });
 eq('no room for the new database next to a recovery copy: the current one is saved as a file, the new one replaces it',out.a,
  {ok:true,customers:150,files:[['glazing_system_before_import.json',true]],backup:true,said:[]});
 eq('a file too big even alone: a plain message, the database stays as it was, no file is downloaded',out.b,
  {ok:false,same:true,files:[],said:['The file (N MB) is too big for this browser. Nothing was replaced.']});
 eq('storage import space has no JavaScript errors',t.errs,[]);await t.c.close();
};
