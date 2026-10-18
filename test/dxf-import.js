/* Загрузка DXF (владелец, 16 октября 2026): файл из Fusion с дугами bulge
   раньше отклонялся целиком — принимался только один LWPOLYLINE из прямых.
   Теперь читается то, что даёт нормальный CAD; кромка — объект файла, а не
   каждый маленький отрезок дуги; круги внутри стекла — отверстия. Фигура
   идентична файлу (владелец, 16.10): что нельзя прочитать точно, не
   читается вовсе. */
module.exports=async function({page,eq}){
 console.log('dxf-import');const t=await page();
 await t.p.evaluate(()=>{
  const g=(...kv)=>{let s='';for(let i=0;i<kv.length;i+=2)s+=kv[i]+'\n'+kv[i+1]+'\n';return s;};
  window.dxG=g;
  window.dxDoc=(ents,units=1,extra='')=>g(0,'SECTION',2,'HEADER',9,'$INSUNITS',70,units,0,'ENDSEC')+extra+g(0,'SECTION',2,'ENTITIES')+ents+g(0,'ENDSEC',0,'EOF');
  window.dxLine=(a,b)=>g(0,'LINE',8,'0',10,a[0],20,a[1],11,b[0],21,b[1]);
  window.dxArc=(c,r,s,e)=>g(0,'ARC',8,'0',10,c[0],20,c[1],40,r,50,s,51,e);
  window.dxCircle=(c,r)=>g(0,'CIRCLE',8,'0',10,c[0],20,c[1],40,r);
  window.dxLw=(pts,closed=1)=>g(0,'LWPOLYLINE',8,'0',90,pts.length,70,closed)+pts.map(p=>g(10,p[0],20,p[1])+(p[2]?g(42,p[2]):'')).join('');
  /* Арка 40 × 30: низ, две ножки по 10, верх — полукруг R 20 двумя дугами bulge. */
  const q=Math.tan(Math.PI/8);
  window.dxArch=()=>dxDoc(dxLw([[0,0],[40,0],[40,10,q],[20,30,q],[0,10]]));
  window.dxRead=text=>{const r=shapeParseFusionDxf(text);if(!r.ok)return r.error;
   return {size:[r.preview.width16/16,r.preview.height16/16],edges:r.preview.segments.map(s=>s.kind[0]).join(''),holes:r.holes.map(h=>[h.x,h.y,+h.diameter.toFixed(4)]),notes:r.notes};};
  window.dxShape=text=>{const r=shapeParseFusionDxf(text),d=newShapeDef('rectangle');d.id='dx-'+Math.random().toString(36).slice(2,8);d.thickness='6';
   d.source={kind:'dxf',fileName:'arch.dxf',fileSize:text.length,uploadedAt:'2026-10-16T12:00:00.000Z',note:'',preview:r.preview};return normalizeShapeDef(d);};
 });
 eq('Fusion LWPOLYLINE with bulge arcs: real size, one edge per arc',await t.p.evaluate(()=>{
  const r=dxRead(dxArch()),edges=ShapeModule.dxfEdges(dxShape(dxArch()));
  return {r,edges:edges.map(e=>[e.id,e.type,+e.length.toFixed(2)])};
 }),{r:{size:[40,30],edges:'llal',holes:[],notes:[]},edges:[['seg1','line',40],['seg2','line',10],['seg3','arc',62.83],['seg4','line',10]]});
 eq('separate lines and arcs in any order and direction close into one glass; a circle inside is a hole',await t.p.evaluate(()=>
  dxRead(dxDoc(dxArc([20,10],20,0,180)+dxLine([0,0],[0,10])+dxLine([40,0],[0,0])+dxLine([40,0],[40,10])+dxCircle([10,5],0.5)+dxLine([15,1],[18,1])))
 ),{size:[40,30],edges:'alll',holes:[[10,5,1]],notes:['1 open line was ignored.']});
 eq('units, blocks, mirrored arcs, splines, ellipses, old polylines',await t.p.evaluate(()=>{
  const g=dxG,blocks=g(0,'SECTION',2,'BLOCKS',0,'BLOCK',8,'0',2,'PANEL',70,0,10,0,20,0)+dxLw([[0,0],[10,0],[10,5],[0,5]])+g(0,'ENDBLK',8,'0',0,'ENDSEC');
  const layers=g(0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',0,'LAYER',2,'HIDDEN',70,1,62,7,0,'ENDTAB',0,'ENDSEC');
  return {
   mm:dxRead(dxDoc(dxLw([[0,0],[1000,0],[1000,500],[0,500]]),4)),
   noUnits:dxRead(dxDoc(dxLw([[0,0],[48,0],[48,36],[0,36]])).replace(g(9,'$INSUNITS',70,1),'')),
   insert:dxRead(dxDoc(g(0,'INSERT',8,'0',2,'PANEL',10,100,20,100,41,2,42,2,50,90),1,blocks)),
   mirrored:dxRead(dxDoc(g(0,'ARC',8,'0',10,-20,20,10,40,20,50,0,51,180,210,0,220,0,230,-1)+dxLine([0,0],[0,10])+dxLine([0,0],[40,0])+dxLine([40,0],[40,10]))),
   spline:dxRead(dxDoc(g(0,'SPLINE',8,'0',70,8,71,3,72,8,73,4,40,0,40,0,40,0,40,0,40,1,40,1,40,1,40,1,10,0,20,0,10,0,20,20,10,40,20,20,10,40,20,0)+dxLine([0,0],[40,0]))),
   ellipse:dxRead(dxDoc(g(0,'ELLIPSE',8,'0',10,24,20,12,11,24,21,0,40,0.5,41,0,42,Math.PI*2))),
   polyline:dxRead(dxDoc(g(0,'POLYLINE',8,'0',66,1,70,1,10,0,20,0)+g(0,'VERTEX',8,'0',10,0,20,0)+g(0,'VERTEX',8,'0',10,40,20,0)+g(0,'VERTEX',8,'0',10,40,20,10,42,1)+g(0,'VERTEX',8,'0',10,0,20,10)+g(0,'SEQEND',8,'0'))),
   hidden:dxRead(dxDoc(dxLw([[0,0],[48,0],[48,36],[0,36]])+g(0,'LWPOLYLINE',8,'0',67,1,90,4,70,1,10,0,20,0,10,500,20,0,10,500,20,500,10,0,20,500)+g(0,'LINE',8,'HIDDEN',10,0,20,0,11,900,21,900),1,layers)),
   twoBulgeHole:dxRead(dxDoc(dxLw([[0,0],[40,0],[40,30],[0,30]])+dxLw([[9,5,1],[11,5,1]])))
  };
 }),{mm:{size:[39.375,19.6875],edges:'llll',holes:[],notes:['Converted from mm to inches.']},noUnits:{size:[48,36],edges:'llll',holes:[],notes:[]},
  insert:{size:[10,20],edges:'llll',holes:[],notes:[]},mirrored:{size:[40,30],edges:'alll',holes:[],notes:[]},spline:{size:[40,15],edges:'al',holes:[],notes:[]},
  ellipse:{size:[48,24],edges:'a',holes:[],notes:[]},polyline:{size:[40,30],edges:'llal',holes:[],notes:[]},hidden:{size:[48,36],edges:'llll',holes:[],notes:[]},
  twoBulgeHole:{size:[40,30],edges:'llll',holes:[[10,5,2]],notes:[]}});
 eq('a file that is not one closed glass says what is wrong',await t.p.evaluate(()=>{
  const g=dxG;return {
   gap:dxRead(dxDoc(dxLine([0,0],[40,0])+dxLine([40,0],[40,30])+dxLine([40,30],[0,30])+dxLine([0,30],[0,0.12]))),
   smallGap:dxRead(dxDoc(dxLine([0,0],[40,0])+dxLine([40,0],[40,30])+dxLine([40,30],[0,30])+dxLine([0,30],[0,0.01]))),
   numberNoise:dxRead(dxDoc(dxLine([0,0],[40,0])+dxLine([40,0],[40,30])+dxLine([40,30],[0,30])+dxLine([0,30],[0,0.0005]))).size,
   cutout:dxRead(dxDoc(dxLw([[0,0],[40,0],[40,30],[0,30]])+dxLw([[25,3],[30,3],[30,6],[25,6]]))),
   fitOnly:dxRead(dxDoc(g(0,'SPLINE',8,'0',70,8,71,3,74,4,11,0,21,0,11,10,21,20,11,30,21,20,11,40,21,0)+dxLine([0,0],[40,0]))),
   two:dxRead(dxDoc(dxLw([[0,0],[10,0],[10,10],[0,10]])+dxLw([[20,0],[30,0],[30,10],[20,10]]))),
   text:dxRead(dxDoc(g(0,'TEXT',8,'0',10,0,20,0,40,1,1,'NOTE'))),
   solid:dxRead(dxDoc(g(0,'3DSOLID',8,'0',1,'x'))),
   binary:dxRead('AutoCAD Binary DXF\r\n\x1a\x00'),
   units:dxRead(dxDoc(dxLw([[0,0],[1,0],[1,1],[0,1]]),3))};
 }),{gap:'DXF outline is not closed: gap of 0.12″ near X 0″, Y 0.12″.',smallGap:'DXF outline is not closed: gap of 0.01″ near X 0″, Y 0.01″.',numberNoise:[40,30],
  cutout:'DXF has an inner cutout. Inner cutouts are not supported for DXF yet, so the file was not loaded.',
  fitOnly:'DXF has a spline saved by fit points only. Save it with control points so the curve stays exact.',two:'DXF contains 2 separate outlines. Keep one glass per file.',
  text:'DXF has no lines, arcs or polylines to read.',solid:'DXF has no lines, arcs or polylines to read. It stores the shape as a solid or region; export the outline as lines and arcs.',
  binary:'Binary DXF is not supported. Save the file as ASCII DXF.',units:'DXF units are not supported (INSUNITS = 3). Export the file in inches.'});
 eq('complex closed shapes: fillets, concave arcs, S-curve, spline budget, bowtie',await t.p.evaluate(()=>{
  const g=dxG,q=Math.tan(Math.PI/8),W=48,H=36,r=2,sum=text=>{const x=shapeParseFusionDxf(text);if(!x.ok)return x.error;
   const d=newShapeDef('rectangle');d.id='cx';d.thickness='6';d.source={kind:'dxf',fileName:'c.dxf',fileSize:1,uploadedAt:'2026-10-16T12:00:00.000Z',note:'',preview:x.preview};const s=normalizeShapeDef(d);
   ShapeModule.dxfEdges(s).forEach(e=>{s.edgeOps[e.id]=[shapeNormalizeOp({type:'Flat Polish'})];});const c=ShapeModule.dxfCuttingPlan(s),k=x.preview.segments.map(v=>v.kind);
   return {edges:k.filter(v=>v==='line').length+'l+'+k.filter(v=>v==='arc').length+'a',cut:c.valid?[Math.round(c.width*64)/64,Math.round(c.height*64)/64]:c.error,points:x.preview.points.length<1000};};
  const rounded=[dxLine([r,0],[W-r,0]),dxArc([W-r,r],r,270,360),dxLine([W,r],[W,H-r]),dxArc([W-r,H-r],r,0,90),dxLine([W-r,H],[r,H]),dxArc([r,H-r],r,90,180),dxLine([0,H-r],[0,r]),dxArc([r,r],r,180,270)];
  const wave=[[0,20]];for(let i=1;i<=10;i++)wave.push([i*6,20+(i%2?6:-2)]);wave.push([66,20]);const U=[0,0,0,0];for(let i=1;i<wave.length-3;i++)U.push(i);for(let i=0;i<4;i++)U.push(wave.length-3);
  return {
   rounded:sum(dxDoc([3,0,6,1,7,4,2,5].map(i=>rounded[i]).join(''))),
   lShape:sum(dxDoc(dxLw([[1,0],[39,0,q],[40,1],[40,14,q],[39,15],[18,15,-q],[15,18],[15,49,q],[14,50],[1,50,q],[0,49],[0,1,q]]))),
   sCurve:sum(dxDoc(dxLw([[0,0],[60,0],[60,20,0.25],[45,30,-0.25],[30,30,0.25],[15,30,-0.25],[0,20]]))),
   spline:sum(dxDoc(g(0,'SPLINE',8,'0',70,8,71,3,72,U.length,73,wave.length,...U.flatMap(u=>[40,u]),...wave.flatMap(p=>[10,p[0],20,p[1]]))+dxLine([66,20],[66,0])+dxLine([66,0],[0,0])+dxLine([0,0],[0,20]))),
   bowtie:sum(dxDoc(dxLw([[0,0],[40,30],[40,0],[0,30]])))};
 }),{rounded:{edges:'4l+4a',cut:[48.125,36.125],points:true},lShape:{edges:'6l+6a',cut:[40.125,50.125],points:true},sCurve:{edges:'3l+4a',cut:[60.125,32],points:true},
  spline:{edges:'3l+1a',cut:[66.125,23.453125],points:true},bowtie:'DXF contour self-intersects.'});
 eq('an arc edge carries its allowance on every point; the tangent check sees the real join',await t.p.evaluate(()=>{
  const s=dxShape(dxArch()),n=s.source.preview.points.length,ids=ShapeModule.dxfPointEdgeIds(s);
  ['seg1','seg2','seg3','seg4'].forEach(id=>{s.edgeOps[id]=[shapeNormalizeOp({type:'Flat Polish'})];});
  const all=ShapeModule.dxfCuttingPlan(s);
  const t2=normalizeShapeDef(JSON.parse(JSON.stringify(s)));t2.edgeOps={seg3:[shapeNormalizeOp({type:'Flat Polish'})]};const tangent=ShapeModule.dxfCuttingPlan(t2);
  return {ids:ids.length===n&&ids.filter(x=>x==='seg3').length===n-3,valid:all.valid,cut:[+all.width.toFixed(4),+all.height.toFixed(4)],tangent:tangent.error};
 }),{ids:true,valid:true,cut:[40.125,30.125],tangent:'Cutting allowance cannot change across tangent-continuous edges seg2 and seg3.'});
 eq('hardware on an arc is placed along the arc, not along its chord',await t.p.evaluate(()=>{
  const s=dxShape(dxArch());s.manufacturingItems=[shapeNormalizeManufacturingItem({id:'h1',type:'hinge',edgeId:'seg3',distance:Math.PI*10})];
  const p=ShapeModule.dxfManufacturingPoint(s.manufacturingItems[0],s).point;return {radius:+Math.hypot(p[0]-20,p[1]-10).toFixed(2),top:p[1]>29.9};
 }),{radius:20,top:true});
 eq('a DXF saved before this change keeps its edges and its fingerprint',await t.p.evaluate(()=>{
  const pts=[[0,0],[40,0],[40,20],[10,30],[0,30]],d=newShapeDef('rectangle');d.id='legacy-dxf';
  d.source={kind:'dxf',fileName:'old.dxf',fileSize:900,uploadedAt:'2026-09-01T12:00:00.000Z',note:'',preview:{units:'in',points:pts,width16:640,height16:480}};const s=normalizeShapeDef(d);
  return {keys:Object.keys(s.source.preview).sort(),edges:ShapeModule.dxfEdges(s).map(e=>e.id).join(),fp:ShapeModule.dxfTopologyFingerprint(s)===shapeStableHash('top-',{points:pts})};
 }),{keys:['height16','points','units','width16'],edges:'seg1,seg2,seg3,seg4,seg5',fp:true});
 eq('Sales cuts a DXF arch line; the machine file folds the arc back into one arc',await t.p.evaluate(()=>{
  const s=dxShape(dxArch());s.edgeOps={seg1:[shapeNormalizeOp({type:'Flat Polish'})],seg2:[shapeNormalizeOp({type:'Flat Polish'})],seg3:[shapeNormalizeOp({type:'Flat Polish'})],seg4:[shapeNormalizeOp({type:'Flat Polish'})]};
  DB.shapeDef=[s];soDraft=newSalesOrderDraft();const line=soDraft.lines[0];line.shapeRef=normalizeShapeRef({id:s.id,revision:0});line.width16=640;line.height16=480;
  const plan=salesEffectiveCuttingPlan(line,salesLineGeometryShape(line),soDraft);
  const cut=ShapeModule.dxfCuttingPlan(s).points,mm=cut.map(p=>[Math.round(p[0]*25400),Math.round(p[1]*25400)]);if(fabSignedArea(mm)>0)mm.reverse();
  const prims=cutShapeFit(mm).prims;soDraft=null;DB.shapeDef=[];
  return {valid:plan.valid,cut:plan.valid&&[+plan.cutW.toFixed(4),+plan.cutH.toFixed(4)],arcs:prims.filter(p=>p.type==='arc').length,lines:prims.filter(p=>p.type==='line').length};
 }),{valid:true,cut:[40.125,30.125],arcs:1,lines:3});
 eq('upload: holes from the file land in Fabrication, the person is told, a failed file leaves the type as it was',await t.p.evaluate(async()=>{
  const said=[],was=window.alert;window.alert=m=>said.push(String(m));
  tab='configurators';subtab='shape';render();openShapeNew('rectangle');
  const pick=async text=>{const file=new File([text],'arch.dxf',{type:'application/dxf'});shapeAttachDxf({files:[file],value:'x'});for(let i=0;i<50&&said.length===said.n;i++)await new Promise(r=>setTimeout(r,10));await new Promise(r=>setTimeout(r,30));};
  said.n=0;await pick(dxDoc(dxLw([[0,0],[40,0],[40,10,Math.tan(Math.PI/8)],[20,30,Math.tan(Math.PI/8)],[0,10]])+dxCircle([10,5],0.25)+dxCircle([30,5],0.25)));
  const holes=shapeManufacturingItems().map(h=>[h.type,h.x,h.y,h.diameter]),label=[...document.querySelectorAll('select option')].find(o=>o.value==='__DXF__').textContent,first=said.slice();
  said.n=said.length;await pick(dxDoc(dxLw([[0,0],[40,0],[40,10,Math.tan(Math.PI/8)],[20,30,Math.tan(Math.PI/8)],[0,10]])+dxCircle([10,5],0.25)+dxCircle([30,5],0.25)));
  const again=shapeManufacturingItems().length;
  removeShapeDxf();said.n=said.length;await pick(dxDoc(dxLine([0,0],[40,0])));
  const sel=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='__DXF__'));
  window.alert=was;const out={holes,label,said:first,again,failed:said[said.length-1],type:sel&&sel.value};sEdit=null;sDraft=null;render();return out;
 }),{holes:[['hole',10,5,'1/2'],['hole',30,5,'1/2']],label:'DXF file',said:['DXF loaded. 2 holes were added from the file.'],again:2,failed:'DXF outline is not closed: gap of 40″ near X 40″, Y 0″.',type:'rectangle'});
 eq('holes from the file keep their exact centre and diameter, not the 1/16″ grid',await t.p.evaluate(async()=>{
  const was=window.alert;window.alert=()=>{};tab='configurators';subtab='shape';render();openShapeNew('rectangle');
  const text=dxDoc(dxLw([[0,0],[1016,0],[1016,762],[0,762]])+dxCircle([254.762,127.1],6),4),file=new File([text],'mm.dxf',{type:'application/dxf'});
  shapeAttachDxf({files:[file],value:'x'});for(let i=0;i<50&&!(sDraft.source&&sDraft.source.kind==='dxf');i++)await new Promise(r=>setTimeout(r,10));
  const h=shapeManufacturingItems()[0],again=normalizeShapeDef(JSON.parse(JSON.stringify(sDraft))).manufacturingItems[0];window.alert=was;
  const out={x:+h.x.toFixed(6),y:+h.y.toFixed(6),d:h.diameter,stable:again.x===h.x&&again.y===h.y,manual:shapeNormalizeManufacturingItem({type:'hole',x:10.03,y:5.01}).x};
  sEdit=null;sDraft=null;render();return out;
 }),{x:10.03,y:5.003937,d:'0.472441',stable:true,manual:10});
 eq('a line drawn twice is read once and the person is told',await t.p.evaluate(()=>({
  bottom:dxRead(dxDoc(dxLine([0,0],[40,0])+dxLine([40,0],[0,0])+dxLine([40,0],[40,30])+dxLine([40,30],[0,30])+dxLine([0,30],[0,0]))),
  outline:dxRead(dxDoc(dxLw([[0,0],[40,0],[40,30],[0,30]])+dxLw([[40,0],[40,30],[0,30],[0,0]]))),
  hole:dxRead(dxDoc(dxLw([[0,0],[40,0],[40,30],[0,30]])+dxCircle([10,5],0.25)+dxCircle([10,5],0.25)))
 })),{bottom:{size:[40,30],edges:'llll',holes:[],notes:['1 line drawn twice was read once.']},outline:{size:[40,30],edges:'llll',holes:[],notes:['4 lines drawn twice were read once.']},
  hole:{size:[40,30],edges:'llll',holes:[[10,5,0.5]],notes:['1 line drawn twice was read once.']}});
 eq('a client size in 1/32″ is cut exact, sold rounded up to 1/16″, and the cut is not blocked',await t.p.evaluate(()=>{
  const s=dxShape(dxDoc(dxLw([[0,0],[27.78125,0],[27.78125,64.40625],[0,64.40625]]))),pv=s.source.preview,b=fabEdgeBounds(pv.points);
  const other=normalizeShapeDef(JSON.parse(JSON.stringify(s)));other.source.preview.width16=444;other.source.preview.height16=1030;
  const wrong=normalizeShapeDef(JSON.parse(JSON.stringify(s)));wrong.source.preview.width16=446;
  return {exact:[b.maxX,b.maxY],sold:[pv.width16,pv.height16],line:[s.w,s.h],cut:ShapeModule.dxfProductionResult(s).valid,savedOtherWay:ShapeModule.dxfProductionResult(other).valid,
   reallyWrong:ShapeModule.dxfProductionResult(wrong).reason};
 }),{exact:[27.78125,64.40625],sold:[445,1031],line:['27 13/16','64 7/16'],cut:true,savedOtherWay:true,reallyWrong:'DXF preview dimensions do not match its contour.'});
 eq('many holes: drawing without dimensions, one Ø line; requirements and route with the count; few holes: like an ordinary shape',await t.p.evaluate(async()=>{
  const was=window.alert;window.alert=()=>{};
  const load=async(circles)=>{tab='configurators';subtab='shape';render();openShapeNew('rectangle');sDraft.thickness='6';
   const text=dxDoc(dxLw([[0,0],[60,0],[60,30],[0,30]])+circles.map(c=>dxCircle(c,0.25)).join(''));shapeAttachDxf({files:[new File([text],'h.dxf',{type:'application/dxf'})],value:'x'});
   for(let i=0;i<50&&!(sDraft.source&&sDraft.source.kind==='dxf');i++)await new Promise(r=>setTimeout(r,10));
   const svg=shapeProdDxfProductionSvg(),doc=new DOMParser().parseFromString(svg,'text/html'),texts=[...doc.querySelectorAll('svg text')].map(x=>x.textContent);
   const req=shapeRequirementRows(ShapeModule.dxfProductionResult(sDraft).requirements).map(q=>q.stationClass+' '+q.label+(q.n>1?' × '+q.n:''));
   const route=salesRouteLiteStations(sDraft,null,[],null,[],false).list.map(st=>st.items.join(';')).join('|');
   const out={holes:shapeManufacturingItems().length,legend:texts.filter(x=>/^Ø .+ × \d+$/.test(x)),perHole:texts.filter(x=>x==='Ø 1/2').length,label:texts.some(x=>/Hole Single/.test(x)),req,route,dims:texts.filter(x=>/^(0|57 1\/8|57 1\/4|10|20|28)$/.test(x)).length};
   sEdit=null;sDraft=null;render();return out;};
  const many=await load([[2,2],[10,2],[20,2],[30,2],[40,2],[57.125,10],[57.25,20],[58,28]]),few=await load([[5,5],[30,15],[55,25]]);
  window.alert=was;return {many,few};
 }),{many:{holes:8,legend:['Ø 1/2″ × 8'],perHole:0,label:false,req:['DRILLING Drill Hole Ø 1/2 × 8'],route:'8 × HOLE Ø 1/2',dims:0},
  few:{holes:3,legend:[],perHole:3,label:false,req:['DRILLING Drill Hole Ø 1/2 × 3'],route:'3 × HOLE Ø 1/2',dims:0}});
 eq('constructor: 8 holes keep their dimensions, requirements are one line with the count',await t.p.evaluate(()=>{
  tab='configurators';subtab='shape';render();openShapeNew('rectangle');sDraft.w='48';sDraft.h='30';sDraft.thickness='6';
  [[3,3],[12,3],[24,3],[36,3],[45,3],[3,27],[24,27],[45,27]].forEach(p=>sDraft.manufacturingItems.push(shapeNormalizeManufacturingItem({type:'hole',x:p[0],y:p[1],diameter:'1/2'})));
  render();const req=[...document.querySelectorAll('.shape-requirements span')].map(x=>x.textContent.trim()),dia=[...document.querySelectorAll('svg text')].filter(x=>x.textContent==='Ø 1/2').length;
  sEdit=null;sDraft=null;render();return {req,dia};
 }),{req:['DRILLING Drill Hole Ø 1/2 × 8'],dia:8});
 eq('dxf import has no browser errors',t.errs,[]);
 await t.c.close();
};
