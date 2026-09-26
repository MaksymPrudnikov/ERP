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
function cutTrialDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
/* Disai открывает проект: папку `<имя>.prjx`, внутри `<имя>.sum` и
   `<имя>-001.dst`. Имя — «что ввёл оператор» через дефисы, затем `_` и код
   стекла из GID без пробелов: `5MMCLEAR#1-24-SEPT-2026_5CL`,
   `C-16333_6CL-LOWER-272` при GID `6CL -LOWE R -272` (образцы и папки стола
   владельца, 24.09.2026; наша папка `…_DISAI` без кода стекла — «wrong file»).
   Одна пробная папка — один лист, поэтому номер листа в имени. */
function cutTrialDisaiBase(program){
 const d=new Date(),mon=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
 const part=v=>String(v==null?'':v).replace(/[^A-Za-z0-9#-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36)||'GLASS';
 const gid=cutTrialText(program.sheet.glass).replace(/\s+/g,'').replace(/[<>:"/\\|?*\u0000-\u001f_]/g,'-')||'GLASS';
 return part(program.batch)+'-S'+program.sheet.no+'-'+String(d.getDate()).padStart(2,'0')+'-'+mon+'-'+d.getFullYear()+'-DISAI_'+gid;
}
/* Толщина в миллиметрах. В проектах стола владельца (24.09.2026) прозрачное
   и LowE: Disai 4.000/5.000/6.000/10.000, Maver 5/6/10/12 (502 программы).
   76.2/152.4/381 у 3CL, серых, ламината и 15 мм — толщина этих стёкол в
   библиотеке Perfect Cut введена в дюймах; повторять это не нужно. */
function cutTrialThickness(mm,machine){
 const known={4:['4.000','4'],5:['5.000','5'],6:['6.000','6'],10:['10.000','10'],12:[null,'12']};
 const row=Object.keys(known).find(k=>Math.abs(mm-k)<1e-6);
 return row?known[row][machine==='disai'?0:1]:null;
}
/* Порядок резов Maver, как у Perfect Cut: сначала все вертикали, потом все
   горизонтали; головка идёт к ближайшему концу следующей линии и режет её
   оттуда. Сверено с 13 листами, выгруженными и для Maver, и для Disai
   (24.09.2026): линии те же, что BREAKLN, порядок совпал на 12 из 13. */
function cutTrialMaverOrder(cuts){
 const out=[];let x=0,y=0;
 for(const axis of ['x','y']){
  const left=cuts.filter(c=>c.axis===axis).map(c=>{
   const a=c.a+1000,b=c.b-1000;
   return axis==='x'?[[c.at,a],[c.at,b]]:[[a,c.at],[b,c.at]];
  });
  while(left.length){
   let best=null;
   left.forEach((l,i)=>[[l[0],l[1]],[l[1],l[0]]].forEach(([p,q])=>{
    const d=Math.hypot(p[0]-x,p[1]-y);if(!best||d<best.d-1e-9)best={d,i,p,q};
   }));
   left.splice(best.i,1);
   out.push({axis,x0:best.p[0]/1000,y0:best.p[1]/1000,x1:best.q[0]/1000,y1:best.q[1]/1000});
   x=best.q[0];y=best.q[1];
  }
 }
 return out;
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
 if(sheet.stock.length)return {error:'Stock offcuts are not supported yet.'};
 /* Shape: its score lines and arcs, clipped as Perfect Cut does. */
 for(const p of sheet.pieces){
  p.shapeName=cutTrialText(p.mark||p.id).replace(/_/g,'-')||'SHAPE';
  if(!p.shape)continue;
  const s=cutShapeScoreChains(p);if(s.error)return s;
  p.scores=s.chains;p.scoreBox=s.box;
 }
 const thick=cutTrialThickness(sheet.mm,machine);
 if(!thick)return {error:'No verified sample for '+sheet.mm+' mm thickness.'};
 const cut=cutTrialLines(sheet);if(cut.error)return cut;
 /* Maver режет те же линии, что Disai (BREAKLN), в своём порядке; граница
    между колоннами начинается от нижнего трима. Если схема Disai для листа
    не строится, остаются линии экрана. */
 const layout=machine==='maver'?cutTrialDisaiScheme(sheet):null;
 const lines=layout&&!layout.error?cutTrialMaverOrder(layout.maverCuts):cut.lines;
 /* Shapes follow the SCHEME order, starting where the last through cut ended. */
 const ibToId=layout&&!layout.error?new Map([...layout.index].map(([id,ib])=>[ib,id])):null;
 const order=ibToId?layout.scheme.map(l=>(/ IB(\d+)$/.exec(l)||[])[1]).filter(Boolean).map(n=>ibToId.get(+n)):sheet.pieces.map(p=>p.id);
 const end=lines.length?lines[lines.length-1]:{x1:0,y1:0};
 const shapes=machine==='maver'?cutShapeMaverOrder(sheet.pieces,order,[Math.round(end.x1*1000),Math.round(end.y1*1000)]):[];
 return {batch:number,sheet,lines,shapes,thickness:thick,machine,trial:true,
  note:layout&&!layout.error&&!layout.sameAsScreen?'Maver cuts some waste in a different order than the screen.':''};
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
 /* Shape stage as in all 126 Perfect Cut shape programs: M14 M20 G103,
    thickness again, then per Shape `{name}`; each run starts with [M5] G0
    at its start with the cut direction in Z and M9; a line is G1, an arc
    G2 (clockwise) / G3 with the absolute centre in I J. The next segment
    follows without lifting when it turns less than 5°; M5 at the end. */
 const shapes=(program.shapes||[]).filter(s=>s.chains.length);
 if(shapes.length){
  out.push('M14','M20','G103P1000VQ0','M94 VN216='+thickness);
  const mm=v=>cutTrial3(v/1000);let first=true;
  shapes.forEach(s=>{
   out.push('{'+s.name+'}');
   s.chains.forEach(c=>c.forEach((g,i)=>{
    if(!cutShapeSmooth(i?c[i-1]:null,g)){
     if(!first)out.push('M5');
     out.push('G0X'+mm(g.x0)+'Y'+mm(g.y0)+'Z'+cutShapeMaverAngle(cutShapeHeading(g,false)),'M9');
    }
    first=false;
    out.push(g.type==='arc'?(g.sweep<0?'G2':'G3')+'X'+mm(g.x1)+'Y'+mm(g.y1)+'I'+mm(g.cx)+'J'+mm(g.cy):'G1X'+mm(g.x1)+'Y'+mm(g.y1));
   }));
  });
  out.push('M5');
 }
 out.push('M101 VB1401 = 1 J#1','M6','M11','M30','');
 return {name:String(n)+'.ISO',data:out.join('\r\n'),mime:'text/plain',note:program.note||''};
}
function cutTrialBmpRect(r){
 if(!r)return null;
 const x=Number(r.x==null?r.x0:r.x),y=Number(r.y==null?r.y0:r.y),
  w=Number(r.w==null?Number(r.x1)-x:r.w),h=Number(r.h==null?Number(r.y1)-y:r.h);
 return [x,y,w,h].every(Number.isFinite)&&w>0&&h>0?{x,y,w,h}:null;
}
function cutTrialBmpSafe(v){return String(v==null?'':v).replace(/[\x00-\x1f\x7f]/g,' ').trim();}
function cutTrialBmpText(ctx,value,x,y,maxW,maxFont,minFont,align,allowShorten){
 const text=cutTrialBmpSafe(value);if(!text||maxW<8)return false;
 ctx.textAlign=align||'center';ctx.textBaseline='middle';
 for(let font=maxFont;font>=minFont-0.01;font-=0.5){
  ctx.font=font+'px Arial';
  if(ctx.measureText(text).width<=maxW){ctx.fillText(text,x,y);return true;}
 }
 if(allowShorten===false)return false;
 ctx.font=minFont+'px Arial';
 let short=text;
 while(short&&ctx.measureText(short+'…').width>maxW)short=short.slice(0,-1);
 if(short){ctx.fillText(short+'…',x,y);return true;}
 return false;
}
function cutTrialBmpArea(ctx,r,project,label,fill){
 const {x,y,w,h}=project(r);if(w<2||h<2)return;
 ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);
 ctx.strokeStyle='#a5acb8';ctx.lineWidth=0.7;ctx.strokeRect(x+0.35,y+0.35,w-0.7,h-0.7);
 if(!label||w<31||h<21)return;
 ctx.save();ctx.beginPath();ctx.rect(x+2,y+2,w-4,h-4);ctx.clip();
 ctx.fillStyle='#596579';
 cutTrialBmpText(ctx,label,x+w/2,y+h/2-4,w-6,8,6,'center');
 cutTrialBmpText(ctx,frac16(r.w)+' × '+frac16(r.h)+'"',x+w/2,y+h/2+6,w-6,7,5.5,'center');
 ctx.restore();
}
function cutTrialMaverBmp(program){
 const sheet=program.sheet,canvas=document.createElement('canvas');canvas.width=440;canvas.height=320;
 const ctx=canvas.getContext('2d');if(!ctx)return {error:'BMP preview is unavailable in this browser.'};
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,440,320);
 ctx.fillStyle='#a01818';ctx.font='bold 10px Arial';ctx.textAlign='left';ctx.textBaseline='alphabetic';
 ctx.fillText('TRIAL ONLY - DO NOT CUT',5,10);
 ctx.fillStyle='#27394e';
 cutTrialBmpText(ctx,'Batch '+program.batch+'  |  '+sheet.glass+'  |  Sheet '+sheet.no+
  '  |  '+frac16(sheet.size.w)+' × '+frac16(sheet.size.h)+'"  |  '+sheet.mm+' mm',5,21,430,9,6,'left');
 const scale=Math.min(430/sheet.size.w,288/sheet.size.h),left=(440-sheet.size.w*scale)/2,bottom=316;
 const project=r=>({x:left+r.x*scale,y:bottom-(r.y+r.h)*scale,w:r.w*scale,h:r.h*scale});
 ctx.fillStyle='#ffffff';ctx.fillRect(left,bottom-sheet.size.h*scale,sheet.size.w*scale,sheet.size.h*scale);
 const free=(sheet.free||[]).map(cutTrialBmpRect).filter(Boolean),
  offcuts=(sheet.offcuts||[]).map(cutTrialBmpRect).filter(Boolean);
 /* A candidate offcut is still waste until explicitly taken to stock. Draw
    physical free leaves first, then distinguish usable offcut suggestions. */
 const overlaps=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
  Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 free.forEach(r=>{
  const covered=offcuts.some(o=>overlaps(r,o)>0.5*o.w*o.h);
  cutTrialBmpArea(ctx,r,project,covered?'':'WASTE','#f5f6f8');
 });
 offcuts.forEach(r=>cutTrialBmpArea(ctx,r,project,'OFFCUT','#f8eedc'));
 sheet.pieces.forEach(p=>{
  const f=p.footprint,{x,y,w,h}=project(f);
  ctx.fillStyle='#dceefb';ctx.fillRect(x,y,w,h);
  if(w>=1&&h>=1){ctx.strokeStyle='#4e708e';ctx.lineWidth=0.8;ctx.strokeRect(x+0.4,y+0.4,w-0.8,h-0.8);}
 });
 ctx.strokeStyle='#db7927';ctx.lineWidth=1;
 program.lines.forEach(c=>{ctx.beginPath();ctx.moveTo(left+c.x0/25.4*scale,bottom-c.y0/25.4*scale);ctx.lineTo(left+c.x1/25.4*scale,bottom-c.y1/25.4*scale);ctx.stroke();});
 (program.shapes||[]).forEach(sh=>sh.chains.forEach(c=>c.forEach(g=>{
  const px=v=>left+v/25400*scale,py=v=>bottom-v/25400*scale;ctx.beginPath();
  if(g.type==='arc'){const a0=Math.atan2(g.y0-g.cy,g.x0-g.cx),a1=a0+g.sweep*Math.PI/180;ctx.arc(px(g.cx),py(g.cy),g.r/25400*scale,-a0,-a1,g.sweep>0);}
  else{ctx.moveTo(px(g.x0),py(g.y0));ctx.lineTo(px(g.x1),py(g.y1));}
  ctx.stroke();
 })));
 sheet.pieces.forEach((p,i)=>{
  const f=p.footprint,{x,y,w,h}=project(f);
  if(w<11||h<11)return;
  ctx.save();ctx.beginPath();ctx.rect(x+1,y+1,w-2,h-2);ctx.clip();ctx.fillStyle='#27394e';
  const innerX=x+8,innerW=w-12,rows=[];
  if(p.customer)rows.push(p.customer);
  if(p.po)rows.push('PO '+p.po);
  if(p.order)rows.push('Order '+p.order+(p.line?' / '+p.line:''));
  if(p.id)rows.push(p.id);
  const available=h-21,rowH=7.5,showRows=available>=rows.length*rowH+13?rows.length:
   available>=26?Math.min(rows.length,3):available>=18?Math.min(rows.length,2):Math.min(rows.length,1);
  /* On narrow pieces keep the full Glass ID before lower-priority metadata. */
  const visible=showRows===rows.length?rows:rows.length&&showRows?
   rows.slice(0,Math.max(0,showRows-1)).concat(rows[rows.length-1]):[];
  visible.forEach((row,j)=>{
   const idRow=row===p.id;
   const shown=cutTrialBmpText(ctx,row,innerX+innerW/2,y+5+j*rowH,innerW,7,5,'center',!idRow);
   if(idRow&&!shown&&h>=20){
    ctx.save();ctx.translate(x+w-4,y+h/2);ctx.rotate(-Math.PI/2);
    cutTrialBmpText(ctx,p.id,0,0,h-9,6,5,'center',false);ctx.restore();
   }
  });
  const posY=Math.max(y+11+visible.length*rowH,y+h/2);
  if(posY<y+h-10){ctx.fillStyle='#172b4d';cutTrialBmpText(ctx,String(i+1),x+w/2,posY,w-13,14,9,'center');}
  ctx.fillStyle='#3a4e68';
  cutTrialBmpText(ctx,frac16(f.w)+'"',x+w/2,y+h-5,w-11,7,5.5,'center');
  if(h>=20){
   ctx.save();ctx.translate(x+4,y+h/2);ctx.rotate(-Math.PI/2);
   cutTrialBmpText(ctx,frac16(f.h)+'"',0,0,h-8,7,5.5,'center');ctx.restore();
  }
  ctx.restore();
 });
 ctx.strokeStyle='#20252b';ctx.lineWidth=1;
 ctx.strokeRect(left,bottom-sheet.size.h*scale,sheet.size.w*scale,sheet.size.h*scale);
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
function cutTrialDisai(program){
 const {sheet,thickness}=program,layout=cutTrialDisaiScheme(sheet);
 if(layout.error)return layout;
 const gid=cutTrialText(sheet.glass),out=['[PATTERN]',
  'GID='+gid,'GDESCRIPTION='+gid,'GSTRUCTURED=0','GCOATED=0','REPEAT=1',
  'GCLR=GREEN','GTHICKNESS='+thickness,
  'WIDTH='+cutTrial3(cutTrialMm(sheet.size.w)),'HEIGHT='+cutTrial3(cutTrialMm(sheet.size.h)),
  'TRIMLEFT='+cutTrial3(cutTrialMm(sheet.margins.trimY)),
  'TRIMBOTTOM=0','BORDERTOP='+cutTrial3(cutTrialMm(sheet.margins.borderX)),
  'BORDERRIGHT='+cutTrial3(cutTrialMm(sheet.margins.borderY)),'',
  '[SCHEME]',...layout.scheme,'','[BREAKLN]',...layout.breaks];
 sheet.pieces.forEach((p,i)=>{
  const f=p.footprint;
  out.push('','[IB'+layout.index.get(p.id)+']','ID='+(i+1),
   'ORDER='+cutTrialText(p.order+' / '+p.line),'CUSTOMER='+cutTrialText(p.customer),
   'BARCODE='+cutTrialText(p.id),'ROTATE='+(p.turn%2===1?'1':'0'),
   'WIDTH='+cutTrial2(cutTrialMm(f.w)),'HEIGHT='+cutTrial2(cutTrialMm(f.h)),
   'SPEC='+cutTrialText(sheet.glass),'RACK=','NOTE1='+cutTrialText(p.id),
   'NOTE2=TEST ONLY - DO NOT CUT','NOTE3=OPEN AND VERIFY WITHOUT CUTTING',
   'CLASSIFY=1','CTIMES=1');
 });
 /* [DB] after all [IB], as Perfect Cut: SPEC = name_ID, R when turned. */
 sheet.pieces.forEach((p,i)=>{
  if(!p.scores||!p.scores.length)return;
  const ib=layout.index.get(p.id),box=p.scoreBox;
  out.push('','[DB'+ib+']','SID='+ib,'SPEC='+p.shapeName+'_'+(i+1)+(p.turn%2===1?'R':''));
  /* A line `x0 y0 x1 y1 F LS`, an arc `x0 y0 cx cy sweep r F CR`; F is C
     when the next segment carries on with less than 5° of turn. A full
     circle is `cx cy r D CO`, as Perfect Cut writes it for this table: the
     table only touched the glass on a 360° CR (25 Sep 2026). */
  const t=v=>cutDisaiText(Math.round(v),3);
  /* A closed loop runs counter-clockwise, as every closed Perfect Cut shape
     for Disai (GR03, GR04, GR05B, L55, L57); the ERP contour is clockwise. */
  p.scores.map(c=>{
   const a=c[0],b=c[c.length-1];
   return c.length>1&&Math.hypot(a.x0-b.x1,a.y0-b.y1)<=10?c.slice().reverse().map(cutShapeReverse):c;
  }).forEach(c=>c.forEach((s,k)=>{
   const flag=cutShapeSmooth(s,c[k+1])?'C':'D';
   out.push(s.type==='arc'&&Math.abs(s.sweep)>=359.99?[t(s.cx-box.x),t(s.cy-box.y),t(s.r),'D','CO'].join(' '):
    s.type==='arc'?[t(s.x0-box.x),t(s.y0-box.y),t(s.cx-box.x),t(s.cy-box.y),String(+s.sweep.toFixed(3)),t(s.r),flag,'CR'].join(' '):
    [t(s.x0-box.x),t(s.y0-box.y),t(s.x1-box.x),t(s.y1-box.y),flag,'LS'].join(' '));
  }));
 });
 out.push('','');
 return {name:cutTrialDisaiBase(program)+'-001.dst',data:out.join('\r\n'),mime:'text/plain',
  note:layout.sameAsScreen?'':'Disai cuts some waste in a different order than the screen (7-level limit).'};
}
function cutTrialDisaiSum(program){
 const s=program.sheet,day=new Date(),date=day.getFullYear()+'-'+(day.getMonth()+1)+'-'+day.getDate();
 const out=['[SUMINFO]','CVERSION=1.0','MEASUREMENT=mm','DATE='+date,'VENDOR=','',
  '[PRJXINFO]','QUANTITY=1','DIMENX=1','PATTERNX=1','',
  '[DIMEN1]','WIDTH='+cutTrial3(cutTrialMm(s.size.w)),
  'HEIGHT='+cutTrial3(cutTrialMm(s.size.h)),'GTHICKNESS='+program.thickness,
  'GCLR=','QNTY=1','OTHERS=','',''];
 return {name:cutTrialDisaiBase(program)+'.sum',data:out.join('\r\n'),mime:'text/plain'};
}
