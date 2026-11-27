/* =====================================================================
   erp/production/qr  ·  qr-1.0
   QR-код (ISO/IEC 18004) для бланков: блок QR code в конструкторе форм
   (владелец 27.11.2026: «добавить QR, чтобы заменить им штрихкод, где
   нужно»). Байтовый режим (UTF-8), коррекция M (около 15 % кода можно
   потерять), версии 1–10 — до 213 байт, хватает на любой номер ERP.
   IN : текст (номер заказа, скида, PS — что выбрано полем блока)
   OUT: qrMatrix(text) — квадрат size × size, true — тёмный модуль;
        qrRuns(m) — тёмные отрезки строк для рисования прямоугольниками
   Правило: без внешних библиотек — файл программы открывается с диска.
   Тихая зона (4 модуля белого вокруг) — за краем блока, как у штрихкода.
   Маска — та из восьми, что даёт меньший штраф (правила 1–4 стандарта).
   ===================================================================== */
/* Коррекция M: байт коррекции на блок и число блоков, версии 1–10. */
const QR_ECC_M=[0,10,16,26,18,24,16,18,22,22,26],QR_BLOCKS_M=[0,1,1,1,2,2,4,4,4,5,5],QR_MAX_VER=10;
function qrGfMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z;}
function qrRsDivisor(deg){
 const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
 for(let i=0;i<deg;i++){for(let j=0;j<deg;j++){r[j]=qrGfMul(r[j],root);if(j+1<deg)r[j]^=r[j+1];}root=qrGfMul(root,2);}
 return r;
}
function qrRsRemainder(data,div){
 const r=div.map(()=>0);
 data.forEach(b=>{const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=qrGfMul(c,f);});});
 return r;
}
/* Модулей под данные и коррекцию (всё, кроме служебных узоров). */
function qrRawModules(ver){
 let n=(16*ver+128)*ver+64;
 if(ver>=2){const a=Math.floor(ver/7)+2;n-=(25*a-10)*a-55;if(ver>=7)n-=36;}
 return n;
}
function qrDataCodewords(ver){return Math.floor(qrRawModules(ver)/8)-QR_ECC_M[ver]*QR_BLOCKS_M[ver];}
function qrAlignPos(ver){
 if(ver===1)return [];
 const n=Math.floor(ver/7)+2,step=Math.ceil((ver*4+4)/(n*2-2))*2,out=[6];
 for(let pos=ver*4+10;out.length<n;pos-=step)out.splice(1,0,pos);
 return out;
}
/* Текст → кодовые слова данных с длиной, концом и заполнением. */
function qrCodewords(text,ver){
 const bytes=[...new TextEncoder().encode(String(text))],bits=[],put=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);};
 put(4,4);put(bytes.length,ver<10?8:16);bytes.forEach(b=>put(b,8));
 const cap=qrDataCodewords(ver)*8;put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
 const out=[];for(let i=0;i<bits.length;i+=8)out.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));
 for(let pad=0xEC;out.length<cap/8;pad^=0xEC^0x11)out.push(pad);
 return out;
}
/* Блоки с коррекцией Рида — Соломона, перемешанные по стандарту. */
function qrInterleave(data,ver){
 const nb=QR_BLOCKS_M[ver],ecl=QR_ECC_M[ver],raw=Math.floor(qrRawModules(ver)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=qrRsDivisor(ecl),blocks=[];
 for(let i=0,k=0;i<nb;i++){const d=data.slice(k,k+shortLen-ecl+(i<nShort?0:1));k+=d.length;const ec=qrRsRemainder(d,div);if(i<nShort)d.push(0);blocks.push(d.concat(ec));}
 const out=[];
 for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ecl||j>=nShort)out.push(b[i]);});
 return out;
}
const QR_MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,x=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
 (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
function qrBuild(cw,ver,mask){
 const n=ver*4+17,m=[...Array(n)].map(()=>Array(n).fill(false)),fn=[...Array(n)].map(()=>Array(n).fill(false));
 const set=(x,y,d)=>{m[y][x]=d;fn[y][x]=true;};
 for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 [[3,3],[n-4,3],[3,n-4]].forEach(([cx,cy])=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<n&&y>=0&&y<n)set(x,y,d!==2&&d!==4);}});
 const al=qrAlignPos(ver),last=al.length-1;
 al.forEach((ax,i)=>al.forEach((ay,j)=>{if(i===0&&j===0||i===0&&j===last||i===last&&j===0)return;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}));
 /* Формат: коррекция M (00) и маска, BCH(15,5), XOR 0x5412. */
 let rem=mask;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
 const f=((mask<<10)|rem)^0x5412,fb=i=>((f>>>i)&1)===1;
 for(let i=0;i<=5;i++)set(8,i,fb(i));set(8,7,fb(6));set(8,8,fb(7));set(7,8,fb(8));for(let i=9;i<15;i++)set(14-i,8,fb(i));
 for(let i=0;i<8;i++)set(n-1-i,8,fb(i));for(let i=8;i<15;i++)set(8,n-15+i,fb(i));set(8,n-8,true);
 if(ver>=7){let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const v=(ver<<12)|r;for(let i=0;i<18;i++){const d=((v>>>i)&1)===1,a=n-11+i%3,b=Math.floor(i/3);set(a,b,d);set(b,a,d);}}
 /* Данные — змейкой по парам колонок снизу вверх и обратно. */
 let k=0;
 for(let right=n-1;right>=1;right-=2){if(right===6)right=5;
  for(let v=0;v<n;v++)for(let j=0;j<2;j++){const x=right-j,y=((right+1)&2)===0?n-1-v:v;
   if(!fn[y][x]&&k<cw.length*8){m[y][x]=((cw[k>>>3]>>>(7-(k&7)))&1)===1;k++;}}}
 const mk=QR_MASKS[mask];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!fn[y][x]&&mk(x,y))m[y][x]=!m[y][x];
 return m;
}
/* Штраф маски (стандарт, 7.8.3): серии одного цвета, квадраты 2 × 2,
   узор «как у угла» и перекос тёмного и светлого. */
function qrPenalty(m){
 const n=m.length;let p=0,dark=0;
 const line=get=>{let run=1;for(let i=1;i<=n;i++){if(i<n&&get(i)===get(i-1))run++;else{if(run>=5)p+=run-2;run=1;}}
  const s=[...Array(n)].map((_,i)=>get(i)?1:0).join('');for(const pat of ['10111010000','00001011101']){let at=s.indexOf(pat);while(at>=0){p+=40;at=s.indexOf(pat,at+1);}}};
 for(let y=0;y<n;y++){line(x=>m[y][x]);line(x=>m[x][y]);}
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])p+=3;}
 m.forEach(r=>r.forEach(c=>{if(c)dark++;}));
 return p+Math.floor(Math.abs(dark*20-n*n*10)/(n*n))*10;
}
/* Текст → квадрат модулей; длиннее 213 байт — null (такого номера в ERP нет). */
function qrMatrix(text){
 const len=new TextEncoder().encode(String(text)).length;let ver=1;
 while(ver<=QR_MAX_VER&&4+(ver<10?8:16)+len*8>qrDataCodewords(ver)*8)ver++;
 if(ver>QR_MAX_VER)return null;
 const cw=qrInterleave(qrCodewords(text,ver),ver);let best=null,bp=Infinity;
 for(let mask=0;mask<8;mask++){const m=qrBuild(cw,ver,mask),pen=qrPenalty(m);if(pen<bp){bp=pen;best=m;}}
 return best;
}
/* Тёмные модули строки, слитые в отрезки: [{x, y, w}] в модулях. */
function qrRuns(m){
 const out=[];
 m.forEach((row,y)=>{let x=0;while(x<row.length){if(!row[x]){x++;continue;}const s=x;while(x<row.length&&row[x])x++;out.push({x:s,y,w:x-s});}});
 return out;
}
