/* =====================================================================
   views/sl-excel  ·  таблица → Excel (.xlsx)
   Владелец 08.11.2026: «экспортировать таблицы в виде Excel отовсюду, где
   есть таблицы»; место — пункт Excel в меню ⚙ таблицы (вариант B: «он
   внутри таблицы и отвечает за таблицы»), одним словом.
   Что в файле: видимые колонки в порядке экрана, строки после фильтров,
   дат и сортировки — те же, что показал движок списка (salesListRows), итог
   колонок с подсчётом внизу. Числа — числами, деньги — с двумя знаками,
   даты — датами Excel. Отмеченные строки (галочки Sales) — только они.
   Файл собирается здесь же: ZIP без сжатия и XML листа (SpreadsheetML),
   без библиотек.
   IN : движок списка (views/sales-list-ui), salesListLastRows
   OUT: загрузка <scope>_<дата>.xlsx
   ===================================================================== */

/* Строки, которые движок последний раз показал в таблице каждого scope:
   salesListRows без skip их записывает (фильтр меню считает с skip). */
const salesListLastRows=Object.create(null);
/* Экран дофильтровал строки после salesListRows (таблетка рейса Delivery,
   быстрый вид Purchasing) — в Excel идут показанные (аудит Codex 09.11.2026,
   F10). */
function salesListShown(rows){salesListLastRows[salesListScope()]=rows;return rows;}

const XLSX_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function xlsxCrc(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=XLSX_CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
/* ZIP «stored»: файлы как есть, без сжатия — Excel открывает такой xlsx. */
function xlsxZip(files){
 const enc=new TextEncoder(),parts=[],dir=[];let off=0;
 const u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
 files.forEach(([name,text])=>{
  const nb=enc.encode(name),data=enc.encode(text),crc=xlsxCrc(data);
  const head=[0x50,0x4b,0x03,0x04,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0)];
  parts.push(new Uint8Array(head),nb,data);
  dir.push([0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)],nb);
  off+=head.length+nb.length+data.length;
 });
 let size=0;dir.forEach(x=>{const a=x instanceof Uint8Array?x:new Uint8Array(x);parts.push(a);size+=a.length;});
 parts.push(new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(size),...u32(off),...u16(0)]));
 return parts;
}
function xlsxEsc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');}
function xlsxCol(i){let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
/* Дата Excel — дни от 1899-12-30. */
function xlsxDate(v){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));if(!m)return null;return Math.round((Date.UTC(+m[1],+m[2]-1,+m[3])-Date.UTC(1899,11,30))/864e5);}
/* Лист: head — подписи, rows — массивы ячеек {v, t:'n'|'d'|'s', money}, foot — итог. Стили: 1 — жирный, 2 — деньги, 3 — дата, 4 — жирные деньги. */
function xlsxBook(sheet,head,rows,foot){
 const cell=(c,r,x,bold)=>{const ref=xlsxCol(c)+r;if(x==null||x.v==null||x.v==='')return '';
  if(x.t==='n'&&Number.isFinite(+x.v))return `<c r="${ref}"${x.money?` s="${bold?4:2}"`:bold?' s="1"':''}><v>${+x.v}</v></c>`;
  if(x.t==='d'){const d=xlsxDate(x.v);if(d!=null)return `<c r="${ref}" s="3"><v>${d}</v></c>`;}
  return `<c r="${ref}" t="inlineStr"${bold?' s="1"':''}><is><t xml:space="preserve">${xlsxEsc(x.v)}</t></is></c>`;};
 const row=(cells,r,bold)=>`<row r="${r}">${cells.map((x,c)=>cell(c,r,x,bold)).join('')}</row>`;
 const all=[row(head.map(v=>({v,t:'s'})),1,true)].concat(rows.map((x,i)=>row(x,i+2,false)));if(foot)all.push(row(foot,rows.length+2,true));
 const widths=head.map((h,c)=>Math.min(60,Math.max(8,String(h).length+2,...rows.slice(0,500).map(x=>String(x[c]&&x[c].v!=null?x[c].v:'').length+2))));
 const ws=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${all.join('')}</sheetData>${head.length?`<autoFilter ref="A1:${xlsxCol(head.length-1)}${rows.length+1}"/>`:''}</worksheet>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`;
 const name=xlsxEsc(String(sheet||'Sheet1').replace(/[\\/?*[\]:]/g,' ').slice(0,31)||'Sheet1');
 return xlsxZip([
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>${head.length?`<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g,"''")}'!$A$1:$${xlsxCol(head.length-1)}$${rows.length+1}</definedName></definedNames>`:''}</workbook>`],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml',ws],['xl/styles.xml',styles]
 ]);
}
/* Данные таблицы этого scope: колонки экрана, строки, итог. */
function salesListExcelData(){
 const scope=salesListScope(),cols=salesListColumns(),all=salesListLastRows[scope]||[];
 /* Галочки Sales: отмечены — только они. */
 const sel=scope==='sales'&&salesListSel.size?all.filter(r=>salesListSel.has(r.o.id)):all;
 const val=(r,c)=>{const v=salesListValue(r,c.k);if(v==null||v==='')return null;
  if(c.type==='number'){const n=typeof v==='number'?v:Number(String(v).replace(/[$,\s]/g,'').replace('−','-'));return Number.isFinite(n)?{v:n,t:'n',money:!!c.money}:{v:String(v),t:'s'};}
  if(c.type==='date')return {v:String(v),t:'d'};
  return {v:Array.isArray(v)?v.join(', '):String(v),t:'s'};};
 const rows=sel.map(r=>cols.map(c=>val(r,c)));
 /* «N rows» — в первую колонку без суммы: Total первой колонкой терял итог
    (аудит Codex 09.11.2026, F12). Все с суммой — число строк не пишется. */
 const free=cols.findIndex(c=>salesListCalc(c)!=='sum');
 const foot=cols.some(c=>salesListCalc(c)==='sum')?cols.map((c,i)=>{if(salesListCalc(c)!=='sum')return i===free?{v:sel.length+' rows',t:'s'}:null;
  return {v:Math.round(rows.reduce((s,x)=>s+(x[i]&&x[i].t==='n'?x[i].v:0),0)*100)/100,t:'n',money:!!c.money};}):null;
 return {scope,head:cols.map(c=>String(c.label).replace(/<[^>]*>/g,'')),rows,foot};
}
function salesListExcel(){
 const scope=salesListMenu&&salesListMenu.scope||salesListScope(),keep=typeof slScopeNow!=='undefined'?slScopeNow:'';
 if(typeof slScopeNow!=='undefined'&&SL_GENERIC[scope])slScopeNow=scope;
 try{
  const d=salesListExcelData(),day=new Date().toISOString().slice(0,10);
  salesListMenu=null;
  storageDownload(String(d.scope||'table').replace(/[^A-Za-z0-9_-]+/g,'_')+'_'+day+'.xlsx',xlsxBook(d.scope,d.head,d.rows,d.foot),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }finally{if(typeof slScopeNow!=='undefined')slScopeNow=keep;}
 render();
}
