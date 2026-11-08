/* Правки владельца 08.11.2026, часть 2: итог Finance под своими колонками,
   Excel в меню ⚙ каждой таблицы, окно Production из Sales («где продукт
   по PO»). */
const zlibFree=buf=>{
 /* Файл из ZIP без сжатия (как пишет views/sl-excel): по локальным заголовкам. */
 const out={};let i=0;
 while(i+30<=buf.length&&buf.readUInt32LE(i)===0x04034b50){
  const method=buf.readUInt16LE(i+8),size=buf.readUInt32LE(i+18),nl=buf.readUInt16LE(i+26),el=buf.readUInt16LE(i+28);
  const name=buf.slice(i+30,i+30+nl).toString('utf8'),start=i+30+nl+el;out[name]={method,text:buf.slice(start,start+size).toString('utf8')};i=start+size;
 }
 return out;
};
module.exports=async function({page,eq}){
 console.log('excel and production');
 const t=await page(undefined,{width:1500,height:950});await require('./optimization-fixture')(t.p);
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  window.xpCaught=[];window.xpKeep=window.storageDownload;
  window.xpGrab=async()=>{window.storageDownload=(name,parts)=>{window.xpCaught.push({name,blob:new Blob(parts)});};
   try{document.querySelector('[data-columns-button]').click();document.querySelector('[data-excel]').click();}finally{window.storageDownload=window.xpKeep;}
   const x=window.xpCaught.pop();if(!x)return null;const b=new Uint8Array(await x.blob.arrayBuffer());let s='';b.forEach(v=>s+=String.fromCharCode(v));return {name:x.name,b64:btoa(s)};};
 });
 const sheet=r=>{if(!r||!r.b64)return r;const z=zlibFree(Buffer.from(r.b64,'base64')),ws=(z['xl/worksheets/sheet1.xml']||{}).text||'';
  const rows=[...ws.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map(m=>[...m[2].matchAll(/<c [^>]*>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)<\/c>/g)].map(c=>c[1]!=null?c[1]:+c[2]));
  return {name:r.name.replace(/_\d{4}-\d{2}-\d{2}/,''),parts:Object.keys(z).length,stored:Object.values(z).every(f=>f.method===0),head:rows[0],rows:rows.length-1,last:rows[rows.length-1]};};
 /* Владелец: суммы подвала Finance стояли на колонку левее. */
 eq('Finance: итог подвала — под своей колонкой (колонка галочки учтена)',await run(()=>{
  const c=oqCustomer({legalName:'Footer Co'}),id=oqOrder(c),o=salesRecord(id);
  DB.receipt.push(normalizeReceipt({number:'RF-1',customerId:c.id,method:'cash',amount:300,allocations:[{orderId:o.id,amount:300}]}));touch();
  tab='finance';finTab='receipts';render();
  const t=document.querySelector('table.fin-list'),heads=[...t.querySelectorAll('thead th')],foot=[...t.querySelectorAll('tfoot td')];
  let col=0;const at=foot.map(td=>{const i=col;col+=td.colSpan||1;return i;});
  const idx=k=>at[foot.findIndex(td=>td.dataset.sum===k)];
  return {amount:heads[idx('amount')].dataset.col,onAccount:heads[idx('onAccount')].dataset.col};
 }),{amount:'amount',onAccount:'onAccount'});
 /* Владелец: «экспортировать таблицы в виде Excel отовсюду, где есть таблицы»; место — ⚙. */
 const sales=sheet(await run(async()=>{['Excel A','Excel B'].forEach(n=>oqOrder(oqCustomer({legalName:n})));tab='sales';subtab='orders';soEdit=null;soDraft=null;render();
  window.xpSalesRows=salesListLastRows.sales.length;return xpGrab();}));
 const want=await t.p.evaluate(()=>({rows:salesListLastRows.sales.length,head:salesListColumns().map(c=>String(c.label).replace(/<[^>]*>/g,''))}));
 eq('Excel из Sales: настоящий .xlsx (ZIP, лист, стили), колонки и строки — как на экране, итог внизу',{name:sales&&sales.name,parts:sales&&sales.parts,stored:sales&&sales.stored,head:sales&&sales.head,rows:sales&&sales.rows,foot:sales&&String(sales.last[0])},
  {name:'sales.xlsx',parts:6,stored:true,head:want.head,rows:want.rows+1,foot:want.rows+' rows'});
 const other=await run(async()=>{const out={};
  tab='finance';finTab='receipts';render();out.fin=await xpGrab();
  tab='production';subtab='orders';render();out.prod=await xpGrab();
  tab='customers';render();out.cust=await xpGrab();return out;});
 eq('Excel из Finance, Production и Customers — пункт Excel в ⚙ каждой таблицы',['fin','prod','cust'].map(k=>{const s=sheet(other[k]);return s&&s.name;}),['finPayments.xlsx','prodOrders.xlsx','customers.xlsx']);
 /* Владелец: клиент звонит, называет PO — «где сейчас мой продукт». */
 eq('Sales → Production: значок рядом с ✂ и правый клик; строки и стёкла по станциям; долли под числом открывает её окно; не в цеху — так и написано',await run(()=>{
  carrierAdd('DL',2);const id=oqOrder(oqCustomer({legalName:'Where Is It'}),{customerPo:'WI-77'});
  salesSetRecordStatus(id,'verified');glassBatchAssign(glassBatchRows([salesRecord(id)]),{});
  const o=salesRecord(id),who={id:'w',name:'Shop'},pm=glassPieceMap(id),all=[];
  o.lines.forEach(l=>glassBatchComponents(o,l).forEach(c=>{const r=pm.get(c.key);if(r)r.ids.forEach(x=>all.push(x));}));
  const go=(pid,n,on)=>{for(let i=0;i<n;i++){const pl=stationPlace(stationGlass(pid));if(!pl||!pl.waiting)break;const ch=stationCheck(pl.waiting,pid);if(STATION_RECORDED.includes(ch.kind))stationMove(pl.waiting,ch,who,i===n-1?{on}:{});}};
  all.forEach((pid,i)=>go(pid,i<2?2:1,i<2?'DL-1':'DL-2'));touch();
  tab='sales';subtab='orders';soEdit=null;soDraft=null;salesListSel=new Set();render();
  const off=document.querySelector('[data-prod-open]').disabled;salesListSel=new Set([id]);render();
  const on=!document.querySelector('[data-prod-open]').disabled;document.querySelector('[data-prod-open]').click();
  const win=document.querySelector('[data-sales-prod]'),lines=win.querySelectorAll('[data-prod-line]').length,glass=win.querySelectorAll('.sales-prod-glass').length,po=win.textContent.includes('PO WI-77');
  const dl=win.querySelector('.pb-on-open');dl.click();const carrier=carrierWin&&carrierWin.code;carrierWinClose();salesProdClose();
  salesListMenu={kind:'context',id,x:40,y:40,w:220};render();const ctx=!!document.querySelector('.sl-ctx [data-menu="production"]');salesListMenuRun('production');const viaCtx=!!document.querySelector('[data-sales-prod]');salesProdClose();
  const other=oqOrder(oqCustomer({legalName:'Not Yet'}));salesProdOpen(other);const empty=(document.querySelector('[data-prod-empty]')||{}).textContent||'';salesProdClose();
  return {off,on,lines,glass,po,carrier:/^DL-[12]$/.test(carrier||''),ctx,viaCtx,empty:empty.startsWith('Not in production yet')};
 }),{off:true,on:true,lines:2,glass:4,po:true,carrier:true,ctx:true,viaCtx:true,empty:true});
 await t.c.close();
};
