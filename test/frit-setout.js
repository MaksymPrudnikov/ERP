/* Точка начала Ceramic Frit (владелец, 16 октября 2026): W/H до центра первой
   точки меряются от кромок стекла — H по вертикали от кромки под точкой, W по
   горизонтали от кромки на её высоте. Раньше точка рисовалась только на
   прямоугольнике, на любой другой фигуре и на DXF её не было вовсе. */
module.exports=async function({page,eq}){
 console.log('frit-setout');const t=await page();
 await t.p.evaluate(()=>{
  window.fsDot=(P,corner,w,h)=>{const r=String(corner).indexOf('right')>=0,top=String(corner).indexOf('Top')>=0,s=salesFritSetoutPoint(P,r,top,w,h);
   return s&&salesFritOnGlass([s.x,s.y],P)?[+s.x.toFixed(4),+s.y.toFixed(4)]:null;};
  window.fsSetup=(corner,shapeFn)=>{
   soDraft=newSalesOrderDraft();soDraft.businessNumber='SO';const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];
   const p=m.panes[0];p.visionType='frit';Object.assign(p.frit,{pattern:'2 x 4 diamond',marginFrom:corner,marginW16:32,marginH16:32});
   const l=soDraft.lines[0];l.makeupId=m.id;l.width16=850;l.height16=2206;salesOrderConfigureShape(0);shapeFn(sDraft);sView='production';render();
  };
  window.fsOut=()=>{const d=document.querySelector('#shapeEditorRoot .frit-first-dot');
   return {dot:d&&[+(+d.getAttribute('data-x')).toFixed(4),+(+d.getAttribute('data-y')).toFixed(4)],
    notes:[...document.querySelectorAll('#shapeEditorRoot .frit-pattern-sample text')].map(x=>x.textContent).filter(x=>/Setout/.test(x))};};
 });
 eq('a rectangle keeps exactly the old point in every corner',await t.p.evaluate(()=>{
  const P=[[0,0],[0,40],[36.875,40],[36.875,0]],b=fabEdgeBounds(P);
  return ['Top left','Top right','Bottom left','Bottom right'].map(c=>{const r=c.indexOf('right')>=0,top=c.indexOf('Top')>=0,s=salesFritSetoutPoint(P,r,top,2,1.5);
   return s.x===(r?b.maxX:b.minX)+(r?-2:2)&&s.y===(top?b.maxY:b.minY)+(top?-1.5:1.5)&&s.edgeX===(r?b.maxX:b.minX)&&s.edgeY===(top?b.maxY:b.minY);});
 }),[true,true,true,true]);
 eq('a raked side: W across from the raked edge, H up from the bottom',await t.p.evaluate(()=>{
  const P=[[16.25,0],[0,137.875],[53.125,137.875],[53.125,0]];
  return {bl:fsDot(P,'Bottom left',2,2),tl:fsDot(P,'Top left',2,2),br:fsDot(P,'Bottom right',2,2),tri:fsDot([[0,0],[24,24],[48,0]],'Bottom left',2,2)};
 }),{bl:[18.0143,2],tl:[2.2357,135.875],br:[51.125,2],tri:[4,2]});
 eq('an arch: the dot keeps W and H to the curve',await t.p.evaluate(()=>{
  const P=[];for(let i=0;i<=64;i++){const a=Math.PI*i/64;P.push([20+20*Math.cos(a),4+20*Math.sin(a)]);}P.push([0,0],[40,0]);
  const s=salesFritSetoutPoint(P,true,true,2,2);
  return {onGlass:salesFritOnGlass([s.x,s.y],P),h:+(salesFritEdgeY(P,s.x,true)-s.y).toFixed(6),w:+(salesFritEdgeX(P,s.y,true)-s.x).toFixed(6)};
 }),{onGlass:true,h:2,w:2});
 eq('margins wider than the glass stay a note, not a dot',await t.p.evaluate(()=>fsDot([[0,0],[0,10],[10,10],[10,0]],'Bottom left',12,2)),null);
 eq('Smart-Shape with a raked side shows the dot on the drawing',await t.p.evaluate(()=>{
  const smart=s=>{s.type='smart';s.w='53 1/8';s.h='137 7/8';s.smart=ssNormalize({elbowsOn:false,A:{len:'137 7/8',out:'16 1/4',dir:'right'},B:{len:'36 7/8',out:'0'},C:{out:'0'}});
   const S={w:s.w,h:s.h,shape:{type:'smart',smart:s.smart}};ssSyncExtra(S);s.smart=S.shape.smart;};
  fsSetup('Bottom right',smart);const br=fsOut();fsSetup('Top left',smart);const tl=fsOut();sEdit=null;sDraft=null;salesBridge=null;
  return {br,tl};
 }),{br:{dot:[51.125,2],notes:[]},tl:{dot:[18.0143,135.875],notes:[]}});
 eq('DXF drawing carries the frit sample and the dot on screen and on paper',await t.p.evaluate(()=>{
  fsSetup('Top right',s=>{s.source={kind:'dxf',fileName:'frit.dxf',fileSize:900,uploadedAt:'2026-10-16T12:00:00.000Z',note:'',preview:{units:'in',points:[[0,0],[40,0],[40,20],[10,30],[0,30]],width16:640,height16:480}};s.w='40';s.h='30';});
  const screen=document.querySelector('.shape-prod-dxf-card .frit-first-dot'),r=shapeDraftResult(),doc=new DOMParser().parseFromString(shapeSheetSvg(r,false),'image/svg+xml'),paper=doc.querySelector('.frit-first-dot');
  const out={screen:screen&&[+screen.getAttribute('data-x'),+(+screen.getAttribute('data-y')).toFixed(4)],paper:paper&&[+paper.getAttribute('data-x'),+(+paper.getAttribute('data-y')).toFixed(4)],
   sample:!!doc.querySelector('.frit-pattern-sample'),widened:doc.documentElement.getAttribute('viewBox')!=='0 0 760 390',cutting:shapeSheetSvg(r,true).indexOf('frit')>=0};
  sEdit=null;sDraft=null;salesBridge=null;render();return out;
 }),{screen:[38,18.6667],paper:[38,18.6667],sample:true,widened:true,cutting:false});
 eq('frit setout has no browser errors',t.errs,[]);
 await t.c.close();
};
