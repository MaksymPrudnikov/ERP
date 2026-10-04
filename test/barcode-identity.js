/* Code 128 B/C: independent payload decoder and shortest-path oracle.
   The visible/scanned identity is unchanged by numeric compression. */
module.exports=async function({page,eq,ok}){
 console.log('barcode-identity');const t=await page();
 const r=await t.p.evaluate(()=>{
  const decode=values=>{
   if(![104,105].includes(values[0])||values[values.length-1]!==106)throw new Error('Invalid framing');
   let checksum=values[0];for(let i=1;i<values.length-2;i++)checksum+=i*values[i];
   if(checksum%103!==values[values.length-2])throw new Error('Invalid checksum');
   let set=values[0]===104?'B':'C',text='';
   for(const v of values.slice(1,-2)){
    if(set==='B'){
     if(v===99)set='C';else if(v>=0&&v<=94)text+=String.fromCharCode(v+32);else throw new Error('Invalid B word');
    }else if(v===100)set='B';else if(v>=0&&v<=99)text+=String(v).padStart(2,'0');else throw new Error('Invalid C word');
   }
   return text;
  };
  /* Breadth-first search counts emitted symbols. Set changes are separate
     edges, unlike the encoder's backward dynamic program. */
  const shortest=s=>{
   const seen=new Set(['0B','0C']),queue=[{i:0,set:'B',words:1},{i:0,set:'C',words:1}];
   for(let q=0;q<queue.length;q++){
    const x=queue[q];if(x.i===s.length)return x.words;
    const add=(i,set)=>{const key=i+set;if(!seen.has(key)){seen.add(key);queue.push({i,set,words:x.words+1});}};
    if(x.set==='B')add(x.i+1,'B');else if(/^\d{2}$/.test(s.slice(x.i,x.i+2)))add(x.i+2,'C');
    add(x.i,x.set==='B'?'C':'B');
   }
   throw new Error('No encoding');
  };
  const samples=['','0','00','123','1234','12345','123456','G-0000001','U-0000123','G-0000000001-1','G-0000000001-50',
   'U-0000000001-25','G-9999999999-9999999999','G-18446744073709551615-4294967295','S-0000001','DL-1','DA-99999','SL-25','SA-12345',
   '12-A-3456789','A12345B6789012C','00000000000000000000',Array.from({length:95},(_,i)=>String.fromCharCode(i+32)).join('')];
  const roundtrip=samples.every(s=>decode(barcode128Values(s))===s&&barcode128Values(s).length-2===shortest(s));
  let checked=0,firstFailure='';
  const check=s=>{checked++;const vals=barcode128Values(s);if(!firstFailure&&(decode(vals)!==s||vals.length-2!==shortest(s)))firstFailure=s||'(empty)';};
  for(let n=0;n<10000;n++){check(String(n));check('X-'+n+'-Y');}
  const visit=(s,n)=>{check(s);if(n)for(const ch of ['0','1','A','-'])visit(s+ch,n-1);};visit('',6);
  const unsupported=['\0','\n','\x7f','é','🙂'].map(s=>{try{barcode128Values(s);return 'accepted';}catch(e){return e.message;}});
  const geometry=samples.every(s=>{
   const vals=barcode128Values(s),mods=barcode128Modules(s),width=barcode128Width(s),m=1.08,x=17,bars=barcode128Items(s,x,3,40,m),last=bars[bars.length-1];
   return mods.every(v=>v>=1&&v<=4)&&mods.length===6*(vals.length-1)+7&&width===11*(vals.length-1)+33&&
    Math.abs(bars[0].x-x-10*m)<1e-8&&Math.abs(x+width*m-last.x-last.w-10*m)<1e-8&&bars.every(b=>b.y===3&&b.h===40&&b.w>0);
  });
  const layout=[];
  for(const kind of ['production','final','unit'])for(const suffix of ['1','25','50','99999999'])for(const size of ['3x4','4x6'])for(const orient of ['portrait','landscape']){
   const data=stkDemoData(kind);data.id=(kind==='unit'?'U':'G')+'-0000000001-'+suffix;
   const pg=stkLayout(stkBase(kind,size,orient),size,data);
   layout.push({code:data.id,kind,size,orient,overflow:pg.overflow});
  }
  const longest='G-9999999999-9999999999',data=stkDemoData('production');data.id=longest;
  const wide=stkLayout({orient:'portrait',blocks:[stkBlock('barcode','full',30)]},'3x4',data),
   narrow=stkLayout({orient:'portrait',layout:'free',blocks:[stkBlock('barcode','full',30,{frame:{x:9,y:9,w:80,h:50}})]},'3x4',data);
  const horizon=stkDemoData('production');horizon.id='G-9999999999-99999999';
  const autoTpl=stkBase('production','3x4','landscape'),auto=stkLayout(autoTpl,'3x4',horizon),bar=auto.boxes.find(b=>b.id===autoTpl.blocks.find(x=>x.k==='barcode').id);
  const theoretical=stkDemoData('production');theoretical.id='G-9223372036854775807-9223372036854775807';
  const tooLong=stkLayout({orient:'portrait',blocks:[stkBlock('barcode','full',30)]},'3x4',theoretical);
  return {known:[barcode128Values('ABC'),barcode128Values('123456')],roundtrip,exhaustive:{checked,firstFailure},unsupported,geometry,
   layout,large:{modules:barcode128Width(longest),wide:wide.overflow,narrow:narrow.overflow.some(s=>s.includes('minimum readable size'))},
   fallback:{width:bar&&bar.w,overflow:auto.overflow,code:auto.items.some(i=>i.t==='text'&&i.s===horizon.id)},
   theoretical:{modules:barcode128Width(theoretical.id),overflow:tooLong.overflow.includes('Barcode'),printed:tooLong.items.some(i=>i.t==='rect')},
   conversions:[decode(barcode128Values(null)),decode(barcode128Values(1234))]};
 });
 eq('known Code 128 B and C vectors include position-weighted checksums',r.known,[[104,33,34,35,1,106],[105,12,34,56,44,106]]);
 ok('legacy, numeric, glass, unit, stock and carrier payloads decode exactly with minimum symbols',r.roundtrip);
 eq('odd/even numeric ranges and every short mixed string use a shortest valid encoding',r.exhaustive,{checked:25461,firstFailure:''});
 eq('unsupported ASCII controls and Unicode keep the original error',r.unsupported,Array(5).fill('Barcode: unsupported character'));
 ok('mixed codewords render valid module widths and ten-module quiet zones on both sides',r.geometry);
 eq('initial and long-horizon glass/unit labels fit both standard sizes and orientations',r.layout.filter(x=>x.overflow.length),[]);
 eq('long identity fits a full-width small label and warns when its custom frame is too narrow',r.large,{modules:231,wide:[],narrow:true});
 eq('a long horizon barcode moves to a full-width row in the small landscape template',r.fallback,{width:270,overflow:[],code:true});
 eq('maximum 64-bit base and instance fail visibly rather than squeeze below the readable minimum',r.theoretical,{modules:341,overflow:true,printed:false});
 eq('null and numeric inputs retain the previous string conversion',r.conversions,['','1234']);
 await t.c.close();
};
