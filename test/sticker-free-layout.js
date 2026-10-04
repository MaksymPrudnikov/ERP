/* Free sticker frames: geometry, persistence, pointer editing and the same
   renderer for the builder and one-off print customization. */
module.exports=async function({page,eq,ok}){
 console.log('sticker-free-layout');const t=await page(undefined,{width:1600,height:1100});
 await require('./optimization-fixture')(t.p);

 eq('legacy sticker coordinates seed free frames without changing the printed layout',await t.p.evaluate(()=>{
  const tpl=stkBase('production','4x6','portrait'),d=stkDemoData('production'),legacy=stkLayout(tpl,'4x6',d);
  const clean=stkCleanTemplate('production','4x6',JSON.parse(JSON.stringify(tpl))),old=stkLayout(clean,'4x6',d);
  stkSeedFrames(clean,'4x6',d);const seeded=legacy.boxes.every(box=>{
   const f=clean.blocks.find(b=>b.id===box.id).frame;
   return f&&['x','y','w','h'].every(k=>Math.abs(f[k]-box[k])<.001);
  });
  return {mode:clean.layout,same:JSON.stringify(legacy.items)===JSON.stringify(old.items),seeded,
   allFrames:clean.blocks.every(b=>b.frame&&b.frame.w>0&&b.frame.h>0)};
 }),{mode:'auto',same:true,seeded:true,allFrames:true});

 eq('free shape uses the rectangular frame, keeps proportions and ignores the old square-size limit',await t.p.evaluate(()=>{
  const b=stkBlock('shape','right',30,{frame:{x:120,y:100,w:120,h:220},details:{dims:false,label:false}}),
   d=stkDemoData('production');
  d.shape={points:[[0,0],[48,0],[48,90],[0,90]],sides:[],polys:[],holes:[]};
  const tpl={orient:'portrait',layout:'free',blocks:[b]},pg=stkLayout(tpl,'4x6',d),p=pg.items.find(i=>i.t==='path');
  const nums=p.d.match(/-?\d+(?:\.\d+)?/g).map(Number),xs=nums.filter((_,i)=>i%2===0),ys=nums.filter((_,i)=>i%2===1),
   w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
  b.size=200;const large=stkLayout(tpl,'4x6',d);
  return {aspect:Math.abs(w/h-48/90)<.001,fills:h>=209&&w>100,inside:Math.min(...xs)>=120-.01&&Math.max(...xs)<=240+.01&&Math.min(...ys)>=100-.01&&Math.max(...ys)<=320+.01,
   samePath:p.d===large.items.find(i=>i.t==='path').d};
 }),{aspect:true,fills:true,inside:true,samePath:true});

 eq('missing free-layout data keeps reserved boxes and does not move following fields',await t.p.evaluate(()=>{
  const batch=stkBlock('batch','left',12,{frame:{x:12,y:12,w:100,h:25}}),po=stkBlock('po','left',13,{frame:{x:12,y:70,w:140,h:30}}),
   empty=stkBlock('text','full',12,{text:'{Missing field}',frame:{x:12,y:120,w:100,h:30}}),
   tpl={orient:'portrait',layout:'free',blocks:[batch,po,empty]},d=stkDemoData('production');d.batch='B-9999';d.po='123';
  const full=stkLayout(tpl,'4x6',d);d.batch='';const absent=stkLayout(tpl,'4x6',d);
  const frames=pg=>pg.boxes.map(({id,x,y,w,h})=>({id,x,y,w,h}));
  return {reserved:absent.boxes.map(b=>b.id).join()===tpl.blocks.map(b=>b.id).join(),same:JSON.stringify(frames(full))===JSON.stringify(frames(absent)),
   batchPrinted:absent.items.some(i=>i.s==='B-9999'),po:absent.items.filter(i=>i.t==='text').map(i=>i.s)};
 }),{reserved:true,same:true,batchPrinted:false,po:['PO 123']});

 eq('free layout warns about overlap, print margins and text overflow while preserving all frames and full text',await t.p.evaluate(()=>{
  const a=stkBlock('text','full',30,{text:'This is a deliberately long untruncated text',frame:{x:0,y:0,w:40,h:15}}),
   b=stkBlock('text','full',12,{text:'Second',frame:{x:20,y:5,w:100,h:30}}),tpl={orient:'portrait',layout:'free',blocks:[a,b]},
   pg=stkLayout(tpl,'4x6',stkDemoData('production'));
  return {warnings:pg.overflow.length>=3,ids:[a,b].every(bl=>pg.issues.some(i=>i.id===bl.id)),
   names:pg.overflow.some(s=>s.includes('Custom text')),frames:pg.boxes.every((box,i)=>['x','y','w','h'].every(k=>box[k]===tpl.blocks[i].frame[k])),
   full:pg.items.filter(i=>i.t==='text').map(i=>i.s).join('').replace(/\s/g,'').includes(a.text.replace(/\s/g,'')),size:pg.items.filter(i=>i.t==='text'&&i.bold).every(i=>i.size===30||i.size===12)};
 }),{warnings:true,ids:true,names:true,frames:true,full:true,size:true});

 eq('explicit text and auxiliary fonts print at their selected point sizes',await t.p.evaluate(()=>{
  const d=stkDemoData('production');d.recut='RECUT 3';d.cut={w:37.125,h:71.125};
  const mk=(k,size,fonts,y)=>stkBlock(k,'full',size,{frame:{x:12,y,w:260,h:60},fonts}),
   order=mk('order',34,{recut:22},12),size=mk('size',32,{cut:19},100),bar=mk('barcode',44,{number:18},185),route=mk('route',28,{route:23},280),
   pg=stkLayout({orient:'portrait',layout:'free',blocks:[order,size,bar,route]},'4x6',d),texts=pg.items.filter(i=>i.t==='text'),
   find=fn=>texts.find(fn).size;
  const unit=stkDemoData('unit'),makeup=mk('makeup',10,{heading:21},12),up=stkLayout({orient:'portrait',layout:'free',blocks:[makeup]},'4x6',unit);
  return {order:find(i=>i.s.includes(' / ')),recut:find(i=>i.s==='RECUT 3'),size:find(i=>i.s==='37 × 71″'),cut:find(i=>i.s.startsWith('CUT ')),
   number:find(i=>i.s===d.id),route:find(i=>i.s.includes(' > ')),heading:up.items.find(i=>i.t==='text'&&i.s.includes(unit.heading)).size};
 }),{order:34,recut:22,size:32,cut:19,number:18,route:23,heading:21});

 eq('free shape dimensions are never silently suppressed when their selected font cannot fit',await t.p.evaluate(()=>{
  const d=stkDemoData('production'),pts=[[0,0],[48,0],[48,90],[0,90]];
  d.shape={points:pts,sides:pts.map((a,i)=>({a,b:pts[(i+1)%4],len:i%2?90:48})),polys:[],holes:[]};
  const b=stkBlock('shape','right',30,{fonts:{dims:32,label:20},frame:{x:150,y:100,w:20,h:20}}),pg=stkLayout({orient:'portrait',layout:'free',blocks:[b]},'4x6',d),
   text=pg.items.filter(i=>i.t==='text');
  return {dims:text.filter(i=>i.s!=='SHAPE').length,sizes:text.filter(i=>i.s!=='SHAPE').every(i=>i.size===32),label:text.find(i=>i.s==='SHAPE').size,
   warning:pg.issues.some(i=>i.id===b.id),printed:pg.items.some(i=>i.t==='path')};
 }),{dims:4,sizes:true,label:20,warning:true,printed:true});

 eq('free barcode keeps the scanner minimum and reports a frame narrower than the bars',await t.p.evaluate(()=>{
  const d=stkDemoData('production'),b=stkBlock('barcode','full',44,{frame:{x:12,y:12,w:20,h:70}}),
   pg=stkLayout({orient:'portrait',layout:'free',blocks:[b]},'4x6',d),bars=pg.items.filter(i=>i.t==='rect'&&i.fill==='#000000');
  b.frame.w=barcode128Width(d.id)*.72;const fits=stkLayout({orient:'portrait',layout:'free',blocks:[b]},'4x6',d),fb=fits.items.filter(i=>i.t==='rect'&&i.fill==='#000000');
  return {warning:pg.issues.some(i=>i.id===b.id),safe:bars.every(i=>i.w>=.72-.0001),
   readable:fb.length>0&&Math.min(...fb.map(i=>i.w))>=.72-.0001,exactMinimum:Math.abs(Math.min(...fb.map(i=>i.w))-.72)<.001};
 }),{warning:true,safe:true,readable:true,exactMinimum:true});

 eq('free frames align content horizontally and vertically without resizing its font',await t.p.evaluate(()=>{
  const b=stkBlock('text','full',12,{text:'HELLO',bold:false,align:'left',valign:'top',frame:{x:30,y:60,w:160,h:100}}),tpl={orient:'portrait',layout:'free',blocks:[b]},d=stkDemoData('production'),
   text=()=>stkLayout(tpl,'4x6',d).items.find(i=>i.t==='text');
  const top=text();b.align='center';b.valign='middle';const middle=text();b.align='right';b.valign='bottom';const bottom=text(),tw=docTextWidth('HELLO',12,false);
  return {left:Math.abs(top.x-30)<.01,center:Math.abs(middle.x+tw/2-110)<.01,right:Math.abs(bottom.x+tw-190)<.01,
   vertical:middle.y>top.y+35&&bottom.y>middle.y+35&&bottom.y<=160.01,sizes:[top,middle,bottom].map(i=>i.size)};
 }),{left:true,center:true,right:true,vertical:true,sizes:[12,12,12]});

 eq('portrait and landscape keep independent frames, fonts and mode through normalization',await t.p.evaluate(()=>{
  const tpl=stkBase('production','4x6','portrait'),d=stkDemoData('production');stkSeedFrames(tpl,'4x6',d);tpl.layout='free';
  const shape=()=>tpl.blocks.find(b=>b.k==='shape'),state=b=>JSON.stringify({frame:b.frame,fonts:b.fonts,size:b.size,on:b.on,at:b.at,align:b.align,details:b.details});
  shape().frame={x:130,y:110,w:145,h:250};shape().fonts={dims:19,label:12};
  const portrait=state(shape());stkSwitchOrientation(tpl,'production','4x6','landscape');stkSeedFrames(tpl,'4x6',d);
  shape().frame={x:150,y:20,w:250,h:150};shape().fonts={dims:15,label:10};const landscape=state(shape());
  stkSwitchOrientation(tpl,'production','4x6','portrait');const back=state(shape())===portrait;
  const clean=stkCleanTemplate('production','4x6',JSON.parse(JSON.stringify(tpl)));stkSwitchOrientation(clean,'production','4x6','landscape');
  const other=clean.blocks.find(b=>b.k==='shape');
  return {back,landscape:state(other)===landscape,mode:clean.layout,orient:clean.orient};
 }),{back:true,landscape:true,mode:'free',orient:'landscape'});

 eq('all sticker types, paper sizes and orientations seed fitting free frames at the expected page dimensions',await t.p.evaluate(()=>{
  let count=0;const bad=[];
  STK_TYPES.forEach(type=>STK_SIZES.forEach(size=>['portrait','landscape'].forEach(orient=>{
   const tpl=stkBase(type.k,size.k,orient),d=stkDemoData(type.k),dims=stkDims(size.k,orient);stkSeedFrames(tpl,size.k,d);tpl.layout='free';
   const pg=stkLayout(tpl,size.k,d);count++;
   if(pg.w!==dims.w||pg.h!==dims.h||pg.overflow.length||!tpl.blocks.filter(b=>b.on).every(b=>pg.boxes.some(box=>box.id===b.id&&['x','y','w','h'].every(k=>box[k]===b.frame[k]))))bad.push([type.k,size.k,orient]);
  })));
  return {count,bad};
 }),{count:16,bad:[]});

 eq('old sticker imports stay automatic and free frames, alignment and font overrides survive JSON reload',await t.p.evaluate(()=>{
  oqReset();const legacy=stkBase('production','4x6','portrait');delete legacy.layout;
  DB.stickerTemplate={'production|4x6':legacy};const old=JSON.parse(JSON.stringify(DB));validateImportedState(old);DB=old;normalizeDB();
  const auto=stkTemplate('production','4x6').layout,tpl=stkTemplate('production','4x6');stkSeedFrames(tpl,'4x6',stkDemoData('production'));tpl.layout='free';
  const b=tpl.blocks.find(x=>x.k==='shape');b.frame={x:140.25,y:101.5,w:130.75,h:260};b.align='center';b.valign='middle';b.fonts={dims:18.5,label:11};
  DB.stickerTemplate['production|4x6']=tpl;const json=JSON.parse(JSON.stringify(DB));validateImportedState(json);DB=json;normalizeDB();
  const restored=stkTemplate('production','4x6').blocks.find(x=>x.k==='shape');
  return {auto,free:stkTemplate('production','4x6').layout,frame:restored.frame,align:restored.align,valign:restored.valign,fonts:restored.fonts};
 }),{auto:'auto',free:'free',frame:{x:140.25,y:101.5,w:130.75,h:260},align:'center',valign:'middle',fonts:{dims:18.5,label:11}});

 await t.p.evaluate(()=>localStorage.setItem('glazing_system_v1',JSON.stringify(DB)));await t.p.reload();
 eq('saved free template survives a real browser reload',await t.p.evaluate(()=>{
  const tpl=stkTemplate('production','4x6'),b=tpl.blocks.find(x=>x.k==='shape');
  return {mode:tpl.layout,frame:b.frame,fonts:b.fonts,valign:b.valign};
 }),{mode:'free',frame:{x:140.25,y:101.5,w:130.75,h:260},fonts:{dims:18.5,label:11},valign:'middle'});
 await require('./optimization-fixture')(t.p);

 // The preview and printer receive the same layout object; editing chrome
 // must remain outside its SVG so browser/PDF output stays clean.
 eq('free preview SVG and print SVG share all content and exclude editor handles and diagnostics',await t.p.evaluate(()=>{
  const tpl=stkBase('production','4x6','portrait'),d=stkDemoData('production');stkSeedFrames(tpl,'4x6',d);tpl.layout='free';
  const b=tpl.blocks.find(x=>x.k==='shape');b.frame={x:145,y:145,w:130,h:240};b.fonts={dims:16};
  const pg=stkLayout(tpl,'4x6',d),preview=stkPageSVG(pg,'100%','100%'),print=stkPageSVG(pg,'4in','6in'),
   canonical=s=>s.replace(/\bwidth="[^"]*"/, 'width="paper"').replace(/\bheight="[^"]*"/, 'height="paper"');
  return {same:canonical(preview)===canonical(print),chrome:/data-stk-hit|data-stk-resize|data-stk-issue|stroke="#(?:ef4444|dc2626)"/.test(print),
   valid:!!new DOMParser().parseFromString(print,'image/svg+xml').querySelector('svg')};
 }),{same:true,chrome:false,valid:true});

 await t.p.evaluate(()=>{
  oqReset();stkBuilder=null;DB.stickerTemplate={};tab='masterdata';mdSetTab('stickers');
  const tpl=stkDraft().tpl;tpl.layout='free';tpl.blocks.forEach(b=>b.on=false);
  const b=tpl.blocks.find(b=>b.k==='text');b.on=true;b.text='DRAG';b.frame={x:30,y:60,w:100,h:40};b.size=14;
  stkBuilderState().sel=stkBuilderState().open=b.id;render();
 });
 const id=await t.p.evaluate(()=>stkDraft().tpl.blocks.find(b=>b.k==='text').id);
 const frame=()=>t.p.evaluate(id=>JSON.parse(JSON.stringify(stkDraft().tpl.blocks.find(b=>b.id===id).frame)),id);
 const original=await frame();
 await t.p.locator('[data-stk-frame="x"]').fill('20');
 await t.p.locator('[data-stk-frame="x"]').dispatchEvent('change');
 const numeric=await frame();await t.p.locator('[data-stk-undo]').click();const undone=await frame();await t.p.locator('[data-stk-redo]').click();const redone=await frame();
 eq('numeric frame edits use millimetres and undo/redo restore the exact layout',{mm:Math.abs(numeric.x-20*72/25.4)<.006,undone,redone},
  {mm:true,undone:original,redone:numeric});

 const paper=await t.p.locator('[data-stk-paper]').boundingBox(),hit=await t.p.locator('[data-stk-hit="'+id+'"]').boundingBox(),scale=288/paper.width;
 await t.p.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await t.p.mouse.down();await t.p.mouse.move(hit.x+hit.width/2+20,hit.y+hit.height/2+16,{steps:5});await t.p.mouse.up();
 const dragged=await frame();
 eq('pointer drag moves the selected frame using the actual preview scale',{x:Math.abs(dragged.x-numeric.x-20*scale)<.15,y:Math.abs(dragged.y-numeric.y-16*scale)<.15,
  w:dragged.w,h:dragged.h},{x:true,y:true,w:numeric.w,h:numeric.h});

 const handle=await t.p.locator('[data-stk-resize="se"]').boundingBox();
 await t.p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await t.p.mouse.down();await t.p.mouse.move(handle.x+handle.width/2+24,handle.y+handle.height/2+16,{steps:5});await t.p.mouse.up();
 const resized=await frame(),pointSize=await t.p.evaluate(id=>stkDraft().tpl.blocks.find(b=>b.id===id).size,id);
 await t.p.locator('[data-stk-undo]').click();const resizeUndo=await frame();
 eq('pointer resize changes both frame dimensions, keeps font size and groups into one undo step',{w:Math.abs(resized.w-dragged.w-24*scale)<.15,h:Math.abs(resized.h-dragged.h-16*scale)<.15,
  pointSize,undo:resizeUndo},{w:true,h:true,pointSize:14,undo:dragged});

 eq('free layout and frame controls work in one-off Customize without changing the saved template',await t.p.evaluate(()=>{
  oqReset();stkBuilder=null;DB.stickerTemplate={};const orderId=oqOrder(oqCustomer());soDraft=null;soEdit=null;
  window.print=()=>{};stkOpenForOrder(orderId);stkDialogSize('4x6');stkPrintCustomize();
  document.querySelector('[data-stk-layout="free"]').click();const b=stkDraft().tpl.blocks.find(x=>x.k==='shape');stkBSelect(b.id);
  const x=document.querySelector('[data-stk-frame="x"]');x.value='45';x.dispatchEvent(new Event('change'));
  const font=document.querySelector('[data-stk-font="dims"]');font.value='18';font.dispatchEvent(new Event('change'));
  const f=JSON.parse(JSON.stringify(stkDraft().tpl.blocks.find(x=>x.id===b.id).frame));stkPrintEditDone();
  const custom=stkDialog.tpl,printed=stkPages(stkDialogJobs().jobs,'4x6',custom),same=printed.every(pg=>pg.boxes.some(x=>x.id===b.id&&['x','y','w','h'].every(k=>x[k]===f[k]))),
   saved=JSON.stringify(DB.stickerTemplate);stkPrintCustomize();const restored=stkDraft().tpl.blocks.find(x=>x.id===b.id);stkBSelect(b.id);
  return {mode:custom.layout,mm:Math.abs(f.x-45*72/25.4)<.006,font:restored.fonts.dims,same,saved,
   controls:!!document.querySelector('[data-stk-undo]')&&!!document.querySelector('[data-stk-resize="se"]')};
 }),{mode:'free',mm:true,font:18,same:true,saved:'{}',controls:true});

 eq('free sticker builder has no page errors',t.errs,[]);await t.c.close();
};
