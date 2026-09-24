/* =====================================================================
   erp/production/cut-machine-trial
   Trial files for opening ONE rectangular layout on Maver / Disai without
   cutting. These are NOT production programs and cannot be marked as such
   until each controller has been checked with the operator. No Shape,
   stock-offcut or unsupported thickness is serialized by guesswork.
   ===================================================================== */
function cutTrialMm(inches){return inches*25.4;}
function cutTrial3(n){return Number(n).toFixed(3);}
function cutTrial2(n){return Number(n).toFixed(2);}
function cutTrialText(v){return String(v==null?'':v).replace(/[\r\n=\[\]{}]/g,' ').slice(0,80);}
function cutTrialNameToken(v){return String(v==null?'':v).replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'GLASS';}
function cutTrialDisaiBase(program){return 'TRIAL-'+cutTrialNameToken(program.batch)+'-'+cutTrialNameToken(program.sheet.glass)+'-S'+program.sheet.no;}
function cutTrialThickness(mm,machine){
 if(Math.abs(mm-4)<1e-6)return machine==='disai'?'4.000':'4';
 if(Math.abs(mm-6)<1e-6)return machine==='disai'?'152.400':'152';
 if(Math.abs(mm-10)<1e-6)return machine==='disai'?'10.000':'10';
 return null;
}
function cutTrialLines(sheet){
 const w=cutTrialMm(sheet.size.w),h=cutTrialMm(sheet.size.h),result=[];
 for(const c of sheet.throughCuts){
  if(!['x','y'].includes(c.axis)||![c.x0,c.y0,c.x1,c.y1].every(Number.isFinite))return {error:'Unsupported cut line.'};
  const vertical=c.axis==='x',a=vertical?cutTrialMm(c.y0):cutTrialMm(c.x0),b=vertical?cutTrialMm(c.y1):cutTrialMm(c.x1),fixed=cutTrialMm(vertical?c.x0:c.y0);
  if(Math.abs(b-a)<=2.01||fixed<-1e-6||fixed>(vertical?w:h)+1e-6)return {error:'A cut line is too short or outside the sheet.'};
  const dir=b>a?1:-1,from=a+dir,to=b-dir;
  const line=vertical?{x0:fixed,y0:from,x1:fixed,y1:to}:{x0:from,y0:fixed,x1:to,y1:fixed};
  if(Math.min(line.x0,line.x1)<-1e-6||Math.max(line.x0,line.x1)>w+1e-6||Math.min(line.y0,line.y1)<-1e-6||Math.max(line.y0,line.y1)>h+1e-6)return {error:'A cut line is outside the sheet.'};
  result.push(Object.assign({axis:c.axis,sequence:c.sequence},line));
 }
 if(!result.length)return {error:'No verified through-cut lines on this sheet.'};
 /* All supplied Maver ISO and Disai BREAKLN examples score vertical lines
    before horizontal ones. Keep each axis's own partition order. */
 result.sort((a,b)=>(a.axis==='y')-(b.axis==='y')||a.sequence-b.sequence);
 return {lines:result};
}
function cutTrialSheet(number,glass,no,machine){
 if(!['maver','disai'].includes(machine))return {error:'Choose Maver or Disai.'};
 const snap=cutMachineSnapshot(number,{glass,no});
 if(!snap.valid)return {error:snap.errors.join(' ')};
 const sheet=snap.sheets[0];
 if(!sheet||sheet.glass!==glass||sheet.no!==+no)return {error:'This sheet was not found.'};
 if(!sheet.pieces.length)return {error:'This sheet has no glass.'};
 if(sheet.stock.length)return {error:'Trial export does not support stock offcuts yet.'};
 if(sheet.pieces.some(p=>p.shape))return {error:'Trial export is limited to rectangles. Shape commands need controller verification.'};
 if(sheet.pieces.some(p=>p.turn>1))return {error:'Unsupported piece rotation.'};
 const thick=cutTrialThickness(sheet.mm,machine);
 if(!thick)return {error:'No verified sample for '+sheet.mm+' mm thickness.'};
 const cut=cutTrialLines(sheet);if(cut.error)return cut;
 return {batch:number,sheet,lines:cut.lines,thickness:thick,machine,trial:true};
}
function cutTrialMaver(program){
 const {sheet,lines,thickness}=program,n=sheet.no;
 if(!Number.isSafeInteger(n)||n<1||n>999)return {error:'Maver trial sheet number must be 1–999.'};
 const out=['%'+String(n).padStart(3,'0'),'G60G45','M12',
  '{ Lastra #'+n+' }','{ N #1 }','{ TEST ONLY - DO NOT CUT }',
  'M94 VN210=1 ','M94 VN211='+Math.round(cutTrialMm(sheet.size.w))+' ',
  'M94 VN212='+Math.round(cutTrialMm(sheet.size.h))+' ',
  'M94 VN215=1','M94 VN230=0','M94 VN231=0','M15','M5','M13','G102',
  'M94 VN216='+thickness,'M19'];
 lines.forEach(c=>{
  const z=c.axis==='x'?'90.000':'0.000';
  out.push('G0X'+cutTrial3(c.x0)+'Y'+cutTrial3(c.y0)+'Z'+z,'M3',
   'G0X'+cutTrial3(c.x1)+'Y'+cutTrial3(c.y1)+'Z'+z,'M5');
 });
 out.push('M101 VB1401 = 1 J#1','M6','M11','M30','');
 return {name:String(n)+'.ISO',data:out.join('\r\n'),mime:'text/plain'};
}
function cutTrialMaverBmp(program){
 const sheet=program.sheet,canvas=document.createElement('canvas');canvas.width=440;canvas.height=320;
 const ctx=canvas.getContext('2d');if(!ctx)return {error:'BMP preview is unavailable in this browser.'};
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,440,320);
 ctx.fillStyle='#a01818';ctx.font='bold 13px Arial';ctx.fillText('TRIAL ONLY - DO NOT CUT',12,17);
 const scale=Math.min(416/sheet.size.w,270/sheet.size.h),left=(440-sheet.size.w*scale)/2,bottom=302;
 ctx.fillStyle='#f7f9fc';ctx.fillRect(left,bottom-sheet.size.h*scale,sheet.size.w*scale,sheet.size.h*scale);
 ctx.strokeStyle='#20252b';ctx.lineWidth=1;ctx.strokeRect(left,bottom-sheet.size.h*scale,sheet.size.w*scale,sheet.size.h*scale);
 sheet.pieces.forEach(p=>{
  const f=p.footprint,x=left+f.x*scale,y=bottom-(f.y+f.h)*scale;
  ctx.fillStyle='#dceefb';ctx.fillRect(x,y,f.w*scale,f.h*scale);
  ctx.strokeStyle='#4e708e';ctx.strokeRect(x,y,f.w*scale,f.h*scale);
  if(f.w*scale>36&&f.h*scale>25){ctx.fillStyle='#27394e';ctx.font='10px Arial';ctx.fillText(String(p.id).slice(-8),x+3,y+13);}
 });
 ctx.strokeStyle='#db7927';ctx.lineWidth=1;
 program.lines.forEach(c=>{ctx.beginPath();ctx.moveTo(left+c.x0/25.4*scale,bottom-c.y0/25.4*scale);ctx.lineTo(left+c.x1/25.4*scale,bottom-c.y1/25.4*scale);ctx.stroke();});
 const image=ctx.getImageData(0,0,440,320).data,stride=(440*3+3)&~3,bytes=new Uint8Array(54+stride*320),v=new DataView(bytes.buffer);
 bytes[0]=66;bytes[1]=77;v.setUint32(2,bytes.length,true);v.setUint32(10,54,true);v.setUint32(14,40,true);
 v.setInt32(18,440,true);v.setInt32(22,320,true);v.setUint16(26,1,true);v.setUint16(28,24,true);
 v.setUint32(34,stride*320,true);v.setInt32(38,3780,true);v.setInt32(42,3780,true);
 for(let y=0;y<320;y++)for(let x=0;x<440;x++){
  const src=((319-y)*440+x)*4,dst=54+y*stride+x*3;
  bytes[dst]=image[src+2];bytes[dst+1]=image[src+1];bytes[dst+2]=image[src];
 }
 return {name:String(sheet.no)+'.BMP',data:bytes,mime:'image/bmp'};
}
/* Disai SCHEME is a recursive guillotine description. The first trial
   version accepts only straight full-width columns of vertically stacked
   rectangles: this exact X/Y form is present in the provided samples.
   More complicated X/Y/Z/U/V trees must not be silently approximated. */
function cutTrialDisaiColumns(sheet){
 const E=1e-5,parts=sheet.pieces.slice().sort((a,b)=>a.footprint.x-b.footprint.x||a.footprint.y-b.footprint.y),columns=[];
 for(const p of parts){
  const f=p.footprint,last=columns[columns.length-1];
  if(last&&Math.abs(last.x-f.x)<E){
   if(Math.abs(last.w-f.w)>E)return {error:'Disai trial needs equal widths within each column.'};
   last.pieces.push(p);
  }else columns.push({x:f.x,w:f.w,pieces:[p]});
 }
 if(!columns.length)return {error:'There are no pieces on this sheet.'};
 if(Math.abs(columns[0].x-sheet.margins.trimY)>E)return {error:'Disai trial needs the first column at the left Trim Y line.'};
 for(let i=1;i<columns.length;i++)if(Math.abs(columns[i].x-(columns[i-1].x+columns[i-1].w))>E)return {error:'Disai trial does not yet support gaps or staggered columns.'};
 const scheme=[],index=new Map(sheet.pieces.map((p,i)=>[p.id,i+1]));
 for(const col of columns){
  scheme.push('X'+cutTrial3(cutTrialMm(col.w)));
  let y=0;
  for(const p of col.pieces.sort((a,b)=>a.footprint.y-b.footprint.y)){
   const f=p.footprint,gap=f.y-y;
   if(gap<-E)return {error:'Disai trial columns overlap.'};
   if(gap>E)scheme.push('Y'+cutTrial3(cutTrialMm(gap)));
   scheme.push('Y'+cutTrial3(cutTrialMm(f.h))+' IB'+index.get(p.id));
   y=f.y+f.h;
  }
 }
 return {scheme,index};
}
function cutTrialDisai(program){
 const {sheet,lines,thickness}=program,layout=cutTrialDisaiColumns(sheet);
 if(layout.error)return layout;
 const gid=cutTrialText(sheet.glass),out=['[PATTERN]',
  'GID='+gid,'GDESCRIPTION='+gid,'GSTRUCTURED=0','GCOATED=0','REPEAT=1',
  'GCLR=GREEN','GTHICKNESS='+thickness,
  'WIDTH='+cutTrial3(cutTrialMm(sheet.size.w)),'HEIGHT='+cutTrial3(cutTrialMm(sheet.size.h)),
  'TRIMLEFT='+cutTrial3(cutTrialMm(sheet.margins.trimY)),
  'TRIMBOTTOM=0','BORDERTOP='+cutTrial3(cutTrialMm(sheet.margins.borderX)),
  'BORDERRIGHT='+cutTrial3(cutTrialMm(sheet.margins.borderY)),'',
  '[SCHEME]',...layout.scheme,'','[BREAKLN]'];
 lines.forEach(c=>out.push([c.x0,c.y0,c.x1,c.y1].map(cutTrial2).join(' ')));
 sheet.pieces.forEach((p,i)=>{
  const f=p.footprint;
  out.push('','[IB'+(i+1)+']','ID='+(i+1),
   'ORDER='+cutTrialText(p.order+' / '+p.line),'CUSTOMER='+cutTrialText(p.customer),
   'BARCODE='+cutTrialText(p.id),'ROTATE='+(p.turn===1?'1':'0'),
   'WIDTH='+cutTrial2(cutTrialMm(f.w)),'HEIGHT='+cutTrial2(cutTrialMm(f.h)),
   'SPEC='+cutTrialText(sheet.glass),'RACK=','NOTE1='+cutTrialText(p.id),
   'NOTE2=TEST ONLY - DO NOT CUT','NOTE3=OPEN AND VERIFY WITHOUT CUTTING',
   'CLASSIFY=1','CTIMES=1');
 });
 out.push('');
 return {name:cutTrialDisaiBase(program)+'-001.dst',data:out.join('\r\n'),mime:'text/plain'};
}
function cutTrialDisaiSum(program){
 const s=program.sheet,day=new Date(),date=day.getFullYear()+'-'+(day.getMonth()+1)+'-'+day.getDate();
 const out=['[SUMINFO]','CVERSION=1.0','MEASUREMENT=mm','DATE='+date,'VENDOR=','',
  '[PRJXINFO]','QUANTITY=1','DIMENX=1','PATTERNX=1','',
  '[DIMEN1]','WIDTH='+cutTrial3(cutTrialMm(s.size.w)),
  'HEIGHT='+cutTrial3(cutTrialMm(s.size.h)),'GTHICKNESS='+program.thickness,
  'GCLR=','QNTY=1','OTHERS=',''];
 return {name:cutTrialDisaiBase(program)+'.sum',data:out.join('\r\n'),mime:'text/plain'};
}
