#!/usr/bin/env node
/* =====================================================================
   test/run.js — регрессионные тесты модулей и оболочки.
   Запуск:  node test/run.js
   Проверяет ГЕОМЕТРИЮ (Shape/Muntin) на эталонных числах из порта v4.5
   плюс устойчивость оболочки к битым данным.
   Если правишь модуль и число здесь поехало — ты сломал перенос.
   ===================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXE = process.env.CHROME_PATH || undefined;
const TARGET = process.env.TARGET === 'dist'
  ? 'file://' + path.join(ROOT, 'dist/GLASS_ERP.html')
  : 'file://' + path.join(ROOT, 'src/index.html');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`));
};
const ok = (name, cond, info) => eq(name, cond ? true : (info || false), true);

(async () => {
  console.log('target:', TARGET);
  const b = await chromium.launch(EXE ? { executablePath: EXE } : {});

  async function page(seedLS, viewport) {
    const c = await b.newContext(viewport ? { viewport } : {});
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.accept());
    await p.goto(TARGET);
    if (seedLS !== undefined) { await p.evaluate(v => localStorage.setItem('glazing_system_v1', v), seedLS); await p.reload(); }
    await p.waitForTimeout(250);
    return { p, c, errs };
  }

  /* --- 1. core/dim — разбор размеров ------------------------------- */
  {
    const { p, c, errs } = await page();
    const r = await p.evaluate(() => ({
      plain: inch('48'),
      space: inch('48 1/2'),
      hyphen: inch('48-1/2'),
      bare: inch('3/4'),
      garbage: inch('12abc'),
      empty: inch(''),
      huge: fabParseDimStrict('9'.repeat(400)).ok,
      strictHyphen: fabParseDimStrict('48-1/2').v,
      strictBad: fabParseDimStrict('12abc').ok,
      print: dimIn(48.5)
    }));
    console.log('core/dim');
    eq('inch("48")', r.plain, 48);
    eq('inch("48 1/2")', r.space, 48.5);
    eq('inch("48-1/2") == strict parser', r.hyphen, 48.5);
    eq('inch("3/4")', r.bare, 0.75);
    eq('inch("12abc") отбрасывается', r.garbage, 0);
    eq('inch("")', r.empty, 0);
    eq('fabParseDimStrict("12abc").ok', r.strictBad, false);
    eq('переполнение числа отклоняется', r.huge, false);
    eq('dimIn(48.5)', r.print, '48 1/2″');
    eq('без ошибок страницы', errs, []);
    await c.close();
  }

  /* --- 2. modules/shape — эталонная геометрия ---------------------- */
  {
    const { p, c } = await page();
    console.log('modules/shape');
    const rect = await p.evaluate(() => {
      const s = { id: 't', name: 't', w: '48', h: '36', smart: ssNormalize({}) };
      const r = ShapeModule.compute(s);
      return { valid: r.valid, w: r.width, h: r.height, area: r.area, pts: r.points.length };
    });
    eq('прямоугольник 48×36', rect, { valid: true, w: 48, h: 36, area: 1728, pts: 4 });

    const rake = await p.evaluate(() => {
      const s = { id: 't', name: 't', w: '48', h: '36', smart: ssNormalize({}) };
      s.smart.C.len = '30';
      const r = ShapeModule.compute(s);
      return { valid: r.valid, w: r.width, h: r.height, area: r.area, pts: r.points.length };
    });
    eq('трапеция C=30 (AUTO-D)', rake, { valid: true, w: 48, h: 36, area: 1584, pts: 4 });

    const corner = await p.evaluate(() => {
      const s = { id: 't', name: 't', w: '48', h: '36', smart: ssNormalize({}) };
      s.smart.corners.tl = 'single';
      const S = { w: s.w, h: s.h, shape: { type: 'smart', smart: s.smart } };
      ssSyncExtra(S); s.smart = S.shape.smart;
      const before = ShapeModule.compute(s);
      Object.keys(s.smart.extraEdges).forEach(k => s.smart.extraEdges[k].len = '4');
      const after = ShapeModule.compute(s);
      return { ids: Object.keys(s.smart.extraEdges), blocked: before.valid, pts: after.points.length, area: after.area };
    });
    eq('угловой блок Single → рёбра E/F', corner.ids, ['E', 'F']);
    eq('пустые угловые рёбра = невалидно', corner.blocked, false);
    eq('срезанный угол 4×4 → 6 точек, площадь 1728−16', { pts: corner.pts, area: corner.area }, { pts: 6, area: 1712 });

    /* Скос ребра нотча. Перпендикулярный вынос входит в суммы угла, поэтому
       контур обязан остаться замкнутым, а габарит — прежним. Разошлось —
       сломана связка ssCornerTotals ↔ ssStairs. */
    const notchSkew = await p.evaluate(() => {
      function mk(E, F) {
        const s = { id: 't', name: 't', w: '48', h: '36', smart: ssNormalize({}) };
        s.smart.corners.tl = 'single';
        const S = { w: s.w, h: s.h, shape: { type: 'smart', smart: s.smart } };
        ssSyncExtra(S); s.smart = S.shape.smart;
        s.smart.extraEdges.E = E; s.smart.extraEdges.F = F;
        return ShapeModule.compute(s);
      }
      const flat = mk({ len: '10', out: '0', dir: null }, { len: '8', out: '0', dir: null });
      const skew = mk({ len: '10', out: '1', dir: 'right' }, { len: '8', out: '0', dir: null });
      const tooBig = mk({ len: '10', out: '10', dir: 'right' }, { len: '8', out: '0', dir: null });
      const noDir = mk({ len: '10', out: '1', dir: null }, { len: '8', out: '0', dir: null });
      let gaps = -1;
      if (skew.valid) {
        const e = skew.geometry.edges; gaps = 0;
        for (let i = 0; i < e.length; i++) { const q = e[(i + 1) % e.length]; if (Math.hypot(q.p1[0] - e[i].p2[0], q.p1[1] - e[i].p2[1]) > 1e-7) gaps++; }
      }
      return { flatValid: flat.valid, skewValid: skew.valid, gaps,
        w: skew.width, h: skew.height,
        sameBox: flat.width === skew.width && flat.height === skew.height,
        areaChanged: Math.abs(flat.area - skew.area) > 1e-9,
        tooBigRejected: !tooBig.valid, noDirRejected: !noDir.valid };
    });
    eq('скос ребра нотча не рвёт контур и не двигает габарит',
      { flat: notchSkew.flatValid, skew: notchSkew.skewValid, gaps: notchSkew.gaps, box: notchSkew.sameBox, w: notchSkew.w, h: notchSkew.h },
      { flat: true, skew: true, gaps: 0, box: true, w: 48, h: 36 });
    eq('скос ребра нотча меняет площадь детали', notchSkew.areaChanged, true);
    eq('скос больше самого ребра отклоняется', notchSkew.tooBigRejected, true);
    eq('скос без направления отклоняется', notchSkew.noDirRejected, true);

    /* Лесенка нотча привязана к РЕАЛЬНОМУ концу подрезанной стороны.
       Если A имеет уклон, ребро нотча в 10″ обязано остаться ровно 10″:
       раньше привязка к вершине габарита превращала его в 10-7/64″. */
    const notchAnchor = await p.evaluate(() => {
      const s = { id: 't', name: 't', w: '80', h: '90', smart: ssNormalize({}) };
      s.smart.elbowsOn = false;
      s.smart.A.out = '1'; s.smart.A.dir = 'right'; s.smart.C.len = '90';
      s.smart.corners.tl = 'single';
      const S = { w: s.w, h: s.h, shape: { type: 'smart', smart: s.smart } };
      ssSyncExtra(S); s.smart = S.shape.smart;
      s.smart.extraEdges.E = { len: '10', out: '2', dir: 'right' };
      s.smart.extraEdges.F = { len: '10', out: '0', dir: null };
      const r = ShapeModule.compute(s);
      if (!r.valid) return { valid: false, reason: r.reason };
      const byId = {}; r.geometry.edges.forEach(e => byId[e.id] = e);
      const chain = shapeAnnChainItems(r, r.line, 'top');
      return { valid: true,
        fRun: Math.abs(byId.F.p2[0] - byId.F.p1[0]),
        eRise: Math.abs(byId.E.p2[1] - byId.E.p1[1]),
        chainIds: chain.map(q => q.id),
        chainPlusGap: chain.reduce((a, q) => a + q.v, 0) + byId.F.p1[0],
        width: r.width };
    });
    eq('уклон стороны не искажает ребро нотча', { valid: notchAnchor.valid, f: notchAnchor.fRun, e: notchAnchor.eRise }, { valid: true, f: 10, e: 10 });
    eq('верхняя цепочка включает поперечное ребро нотча', notchAnchor.chainIds, ['F', 'E', 'D']);
    eq('верхняя цепочка сходится с габаритом', Math.abs(notchAnchor.chainPlusGap - notchAnchor.width) < 1e-9, true);

    /* Координата угла живёт только вместе с угловым блоком. Иначе она правит
       геометрию, но в интерфейсе скрыта — размер «залипает» и его не найти. */
    const orphanOffset = await p.evaluate(() => {
      function mk(corner) {
        const s = { id: 't', name: 't', w: '24', h: '90', smart: ssNormalize({}) };
        s.smart.C.len = '90';
        s.smart.corners.tl = corner;
        s.smart.cornerOffsets = { tl: { plumb: '1', plumbDir: 'left', level: '2', levelDir: 'up' } };
        s.smart = ssNormalize(s.smart);
        if (corner !== 'none') {
          const S = { w: s.w, h: s.h, shape: { type: 'smart', smart: s.smart } };
          ssSyncExtra(S); s.smart = S.shape.smart;
          Object.keys(s.smart.extraEdges).forEach(k => s.smart.extraEdges[k].len = '4');
        }
        return ShapeModule.compute(s);
      }
      const off = mk('none'), on = mk('single');
      return { offW: off.width, offH: off.height, offDout: off.base.Dout,
        onApplied: Math.abs(on.base.AT[0] - (-1)) < 1e-9 };
    });
    eq('без углового блока координата угла не влияет на геометрию',
      { w: orphanOffset.offW, h: orphanOffset.offH, dout: orphanOffset.offDout }, { w: 24, h: 90, dout: 0 });
    eq('с угловым блоком координата угла работает', orphanOffset.onApplied, true);

    /* Тот же инвариант, но по пути СОХРАНЁННОЙ модели: она уже полностью
       сформирована, и ранний выход из ssNormalize раньше пропускал её мимо
       нормализации — скрытый вынос угла продолжал жить после перезагрузки. */
    const storedOrphan = await p.evaluate(() => {
      const z = { plumb: '0', plumbDir: null, level: '0', levelDir: null };
      const smart = {
        elbowsOn: true,
        A: { len: '', out: '0', dir: null, elbow: { to: '0', elbowLen: '0', past: '0', mode: null } },
        B: { len: '', out: '0', dir: null, elbow: { to: '0', elbowLen: '0', past: '0', mode: null } },
        C: { len: '90', out: '0', dir: null, elbow: { to: '0', elbowLen: '0', past: '0', mode: null } },
        corners: { tl: 'none', tr: 'none', br: 'none', bl: 'none' }, extraEdges: {},
        cornerOffsets: { tl: { plumb: '1', plumbDir: 'left', level: '2', levelDir: 'up' },
          tr: Object.assign({}, z), br: Object.assign({}, z), bl: Object.assign({}, z) }
      };
      const r = ShapeModule.compute({ id: 't', name: 't', type: 'smart', w: '24', h: '90', smart: smart });
      return { w: r.width, h: r.height, dout: r.base.Dout };
    });
    eq('сохранённый вынос угла без блока не переживает загрузку',
      storedOrphan, { w: 24, h: 90, dout: 0 });

    /* Печать. Лист должен нести СВОИ идентификаторы: на странице одновременно
       живёт превью с тем же <marker id>, и по первому совпадению в документе
       ссылка уходила в скрытый элемент — на бумаге пропадали стрелки размеров. */
    const printSheetCheck = await p.evaluate(() => {
      const d = { id: 't', name: 'Печать', type: 'smart', w: '24', h: '90', thickness: '6',
        smart: ssNormalize({ elbowsOn: false, C: { len: '90' } }), features: [], edgeOps: {} };
      const r = ShapeModule.compute(d);
      const before = document.querySelectorAll('#printSheetHost svg').length;
      printSheetPrepare(ShapeModule.productionSvg(r), 'Печать · Production Drawing');
      const host = document.getElementById('printSheetHost');
      const svg = host.querySelector('svg');
      const html = svg.innerHTML;
      const ids = (html.match(/id="([^"]+)"/g) || []).map(x => x.slice(4, -1));
      const refs = (html.match(/url\(#([^)]+)\)/g) || []).map(x => x.slice(5, -1));
      const resolved = refs.every(id => ids.indexOf(id) >= 0);
      const printing = document.body.classList.contains('printing');
      const caption = (host.textContent || '').indexOf('Production Drawing') >= 0;
      printSheetCleanup();
      return { before, made: !!svg, resolved, refs: refs.length, printing, caption,
        cleared: document.getElementById('printSheetHost').innerHTML === '',
        classGone: !document.body.classList.contains('printing') };
    });
    eq('лист печати самодостаточен и убирается за собой',
      printSheetCheck,
      { before: 0, made: true, resolved: true, refs: printSheetCheck.refs, printing: true, caption: true, cleared: true, classGone: true });
    ok('в листе печати есть ссылки на маркеры размеров', printSheetCheck.refs > 0);

    /* Новая Smart-Shape — нейтральный шаблон 1×1 без примера геометрии. */
    const neutralStart = await p.evaluate(() => {
      const d = newShapeDef('smart'), r = ShapeModule.compute(d);
      return { w: d.w, h: d.h, valid: r.valid, corners: Object.values(d.smart.corners).join(','),
        extras: Object.keys(d.smart.extraEdges).length,
        offsets: Object.values(d.smart.cornerOffsets).map(o => o.plumb + '/' + o.level).join(',') };
    });
    eq('новая Smart-Shape стартует нейтральной 1×1',
      neutralStart, { w: '1', h: '1', valid: true, corners: 'none,none,none,none', extras: 0, offsets: '0/0,0/0,0/0,0/0' });

    /* Координаты углов живут только вместе с угловым блоком, поэтому здесь
       блок выбирается явно — иначе значения будут обнулены по инварианту. */
    const cornerOffsets = await p.evaluate(() => {
      const s={id:'t',name:'t',w:'48',h:'36',smart:ssNormalize({})};
      s.smart.corners.bl='single';
      const S={w:s.w,h:s.h,shape:{type:'smart',smart:s.smart}};ssSyncExtra(S);s.smart=S.shape.smart;
      Object.keys(s.smart.extraEdges).forEach(k=>s.smart.extraEdges[k].len='2');
      s.smart.cornerOffsets.tl.plumb='2';s.smart.cornerOffsets.tl.plumbDir='right';
      s.smart.cornerOffsets.tr.level='3';s.smart.cornerOffsets.tr.levelDir='down';
      const r=ShapeModule.compute(s),payload=ShapeModule.machinePayload(r);
      return {valid:r.valid,tl:r.base.AT,tr:r.base.CT,outer:payload.outer.points};
    });
    eq('отклонения TL/TR меняют finished и cutting geometry', {valid:cornerOffsets.valid,tl:cornerOffsets.tl,tr:cornerOffsets.tr}, {valid:true,tl:[2,36],tr:[48,33]});
    ok('отклонения углов попадают в machine payload', cornerOffsets.outer.some(p=>Math.abs(p[0]-2)<1e-9&&Math.abs(p[1]-36)<1e-9));

    const badCornerOffset = await p.evaluate(() => {
      const s={id:'t',name:'t',w:'48',h:'36',smart:ssNormalize({})};
      s.smart.corners.tr='single';
      const S={w:s.w,h:s.h,shape:{type:'smart',smart:s.smart}};ssSyncExtra(S);s.smart=S.shape.smart;
      Object.keys(s.smart.extraEdges).forEach(k=>s.smart.extraEdges[k].len='2');
      s.smart.cornerOffsets.bl.plumb='1';return ShapeModule.compute(s).valid;
    });
    eq('отклонение угла без направления блокируется', badCornerOffset, false);

    const bad = await p.evaluate(() => {
      const s = { id: 't', name: 't', w: '48', h: '36', smart: ssNormalize({}) };
      s.smart.C.len = '0';
      return ShapeModule.compute(s).valid;
    });
    eq('C=0 отклоняется', bad, false);
    const missingSize = await p.evaluate(() => {
      const mk=(w,h)=>ShapeModule.compute({id:'t',name:'t',w,h,smart:ssNormalize({})}).valid;
      return { blank:mk('',36), zero:mk(0,36) };
    });
    eq('пустой размер не превращается в 48″', missingSize.blank, false);
    eq('нулевой размер не превращается в 48″', missingSize.zero, false);

    const schemaV2 = await p.evaluate(() => {
      const presets=SHAPE_PRESETS.map(x=>({id:x.id,valid:ShapeModule.compute(newShapeDef(x.id)).valid}));
      /* Новая фигура открывается нейтральным шаблоном 1×1, поэтому здесь
         размеры задаются явно: тест про features, а не про значения по умолчанию. */
      const d=newShapeDef('rectangle');d.w='48';d.h='36';
      d.edgeOps.A=[shapeNormalizeOp({type:'Flat Polish'})];d.edgeOps.B=[shapeNormalizeOp({type:'Flat Polish'})];
      d.features.push(shapeNormalizeFeature({type:'radius',vertexId:'BL',radius:'2'}));
      d.features.push(shapeNormalizeFeature({type:'hole',diameter:'1',x:'10',y:'10',minEdge:'1/2'}));
      d.features.push(shapeNormalizeFeature({type:'cutout',width:'5',height:'4',x:'20',y:'12',cornerRadius:'1'}));
      d.features.push(shapeNormalizeFeature({type:'stamp',x:'4',y:'2',text:'TEMPER'}));
      const r=ShapeModule.compute(d),payload=ShapeModule.machinePayload(r),dxf=ShapeModule.genericDxf(r);
      const conflict=newShapeDef('rectangle');conflict.edgeOps.A=[shapeNormalizeOp({type:'Flat Polish'}),shapeNormalizeOp({type:'Rough Arris'})];
      const badParam=newShapeDef('notch-middle');badParam.params.width='abc';
      const circle=newShapeDef('circle'),badCircle=newShapeDef('circle');badCircle.w='36';badCircle.h='35';
      return {presets,valid:r.valid,rounded:r.points.length>4&&payload.cutouts[0].points.length>4,holeCount:payload.holes.length,stampLeaked:JSON.stringify(payload).includes('TEMPER'),allowance:r.cutting.minX<0&&r.cutting.minY<0,dxf:dxf.includes('CUT_HOLES')&&dxf.includes('CUT_INNER')&&dxf.endsWith('EOF\n'),requirements:r.requirements.map(x=>x.stationClass),conflict:ShapeModule.compute(conflict).valid,badParam:ShapeModule.compute(badParam).valid,circle:ShapeModule.compute(circle).valid,badCircle:ShapeModule.compute(badCircle).valid};
    });
    eq('все каталожные Shape имеют валидные defaults', schemaV2.presets.filter(x=>!x.valid), []);
    eq('radius + hole + rounded cutout входят в cutting payload', {valid:schemaV2.valid,rounded:schemaV2.rounded,holes:schemaV2.holeCount,stampLeaked:schemaV2.stampLeaked}, {valid:true,rounded:true,holes:1,stampLeaked:false});
    eq('припуск Flat Polish меняет cutting contour', schemaV2.allowance, true);
    eq('Generic DXF содержит отверстия и вырезы', schemaV2.dxf, true);
    ok('маршрут выводится из геометрии', schemaV2.requirements.includes('POLISHING')&&schemaV2.requirements.includes('DRILLING')&&schemaV2.requirements.includes('CNC'));
    eq('конфликтующие finishes блокируются', schemaV2.conflict, false);
    eq('некорректный параметр preset не заменяется default', schemaV2.badParam, false);
    eq('круг имеет один физический диаметр', {equal:schemaV2.circle,mismatch:schemaV2.badCircle}, {equal:true,mismatch:false});
    await c.close();
  }

  /* --- 3. modules/muntin — эталонный раскрой ----------------------- */
  {
    const { p, c } = await page();
    console.log('modules/muntin');
    const r = await p.evaluate(() => {
      const s = { id: 'g', name: 'g', w: '48', h: '36', smart: ssNormalize({}) };
      s.smart.C.len = '30';
      const m = { id: 'g', name: 'g', shapeId: 'g', muntin: defaultMuntinModel() };
      const res = MuntinModule.compute(s, m);
      return {
        segs: res.count, adaptive: res.geo.shapeAdaptive, mode: res.geo.edgeMode,
        cuts: res.verticalSegments.concat(res.horizontalSegments).map(x => +x.cut.toFixed(6))
      };
    });
    eq('трапеция 2V×1H: 3 сегмента, shape-adaptive, offset',
       { segs: r.segs, adaptive: r.adaptive, mode: r.mode }, { segs: 3, adaptive: true, mode: 'offset' });
    eq('cut lengths обрезаны реальным контуром', r.cuts, [33.113783, 31.129408, 47.125]);

    const rectM = await p.evaluate(() => {
      const s = { id: 'g', name: 'g', w: '48', h: '36', smart: ssNormalize({}) };
      const m = { id: 'g', name: 'g', shapeId: 'g', muntin: defaultMuntinModel() };
      const res = MuntinModule.compute(s, m);
      return { adaptive: res.geo.shapeAdaptive, cuts: res.verticalSegments.concat(res.horizontalSegments).map(x => +x.cut.toFixed(4)) };
    });
    eq('прямоугольник не считается shape-adaptive', rectM.adaptive, false);
    eq('прямоугольник: бары = габарит − 2×inset', rectM.cuts, [35.125, 35.125, 47.125]);

    const forced = await p.evaluate(() => {
      const s = { id: 'g', name: 'g', w: '48', h: '36', smart: ssNormalize({}) };
      const m = { id: 'g', name: 'g', shapeId: 'g', muntin: defaultMuntinModel() };
      m.muntin.production.edgeInsetX = 2;
      const res = MuntinModule.compute(s, m);
      return { mode: res.geo.edgeMode, forced: res.geo.edgeModeForced };
    });
    eq('разные inset X/Y → откат на axis с флагом', forced, { mode: 'axis', forced: true });

    const zero = await p.evaluate(() => {
      const s = { id: 'g', name: 'g', w: '48', h: '36', smart: ssNormalize({}) };
      const m = { id: 'g', name: 'g', shapeId: 'g', muntin: defaultMuntinModel() };
      m.muntin.layout.verticalBars = 0; m.muntin.layout.horizontalBars = 0;
      const res = MuntinModule.compute(s, m);
      return { valid: res.valid, count: res.count };
    });
    eq('0 баров = валидно, 0 сегментов', zero, { valid: true, count: 0 });

    const orphan = await p.evaluate(() => MuntinModule.compute(null, { muntin: defaultMuntinModel() }).valid);
    eq('мунтин без фигуры не падает', orphan, false);

    const layoutErrors = await p.evaluate(() => {
      const shape=(w,h)=>({id:'g',name:'g',w:String(w),h:String(h),smart:ssNormalize({})});
      const tiny=defaultMuntinModel();tiny.layout.verticalBars=1;tiny.layout.horizontalBars=0;
      const duplicate=defaultMuntinModel();duplicate.layout.verticalBars=2;duplicate.layout.horizontalBars=0;
      duplicate.production.mode='custom';duplicate.production.verticalPositions=[10,10];
      const wrongCount=defaultMuntinModel();wrongCount.layout.verticalBars=2;wrongCount.layout.horizontalBars=0;
      wrongCount.production.mode='custom';wrongCount.production.verticalPositions=[10];
      return {
        tiny:MuntinModule.compute(shape(1,36),{muntin:tiny}).code,
        duplicate:MuntinModule.compute(shape(48,36),{muntin:duplicate}).code,
        wrongCount:MuntinModule.compute(shape(48,36),{muntin:wrongCount}).code
      };
    });
    eq('бар, который физически не помещается, отклоняется', layoutErrors.tiny, 'MUNTIN_NO_ROOM');
    eq('совпадающие оси мунтина отклоняются', layoutErrors.duplicate, 'MUNTIN_OVERLAP');
    eq('неполный список custom-позиций отклоняется', layoutErrors.wrongCount, 'MUNTIN_CUSTOM_COUNT');

    eq('изменение числа баров очищает устаревшую ошибку поля', await p.evaluate(() => {
      mDraft=newMuntinDef('s1');mDraft.muntin.production.mode='custom';mFieldErrors={verticalPositions:'old'};
      setMuntinStruct('verticalBars','0');return !mFieldErrors.verticalPositions;
    }), true);

    eq('быстро созданные определения получают уникальные id', await p.evaluate(() => {
      const ids=[];for(let i=0;i<100;i++){ids.push(newSmartShapeDef().id,newMuntinDef('s1').id);}
      return new Set(ids).size===ids.length;
    }), true);

    eq('Muntin не пересчитывается молча после смены Shape revision', await p.evaluate(() => {
      const s=newShapeDef('rectangle'),m=newMuntinDef(s.id);pinMuntinShape(m,s);s.w='60';return MuntinModule.compute(s,m).code;
    }), 'MUNTIN_SHAPE_REVISION');

    eq('grid = 1/16"', await p.evaluate(() => MUNTIN_GRID), 0.0625);
    await c.close();
  }

  /* --- 4. Shape → Muntin: единственный источник размеров ----------- */
  {
    const { p, c } = await page();
    console.log('контракт Shape → Muntin');
    const src = fs.readFileSync(path.join(ROOT, 'src/erp/views/sales-muntin-ui.js'), 'utf8');
    ok('в Muntinbar нет своих Width/Height', !/label>\s*(Width|Height|Ширина|Высота)/i.test(src));
    const follows = await p.evaluate(() => {
      const s = { id: 'g', name: 'g', w: '48', h: '36', smart: ssNormalize({}) };
      const m = { id: 'g', name: 'g', shapeId: 'g', muntin: defaultMuntinModel() };
      const a = MuntinModule.compute(s, m).geo.spanW;
      s.w = '60';
      const b = MuntinModule.compute(s, m).geo.spanW;
      return [a, b];
    });
    eq('размер мунтина идёт от Shape', follows, [48, 60]);
    await c.close();
  }

  /* --- 5. оболочка: устойчивость к битым данным -------------------- */
  {
    console.log('оболочка / хранилище');
    let t = await page(JSON.stringify({ user: null, station: null, level: null }));
    const len = await t.p.evaluate(() => document.getElementById('app').innerHTML.length);
    ok('битый localStorage не даёт белый экран', len > 200, 'app length=' + len + ' errs=' + JSON.stringify(t.errs));
    await t.c.close();

    t = await page('{не json');
    ok('нечитаемый localStorage не роняет старт', (await t.p.evaluate(() => document.getElementById('app').innerHTML.length)) > 200);
    await t.c.close();

    t = await page(JSON.stringify({ station: [{ code: 'A1', name: 'x', level: '1', minTh: 3, maxTh: 19 }], level: [{ n: 1, label: 'Резка' }] }));
    eq('level строкой приводится к числу', await t.p.evaluate(() => typeof DB.station[0].level), 'number');
    eq('станция попадает в маршрут', await t.p.evaluate(() => { tab = 'production'; subtab = 'stations'; render(); return document.querySelector('.stage-machines').textContent.trim(); }), 'A1');
    await t.c.close();

    t = await page();
    eq('переименование номера уровня не осиротляет станции', await t.p.evaluate(() => {
      tab = 'production'; subtab = 'levels'; render(); lvEdit = 0; render();
      document.getElementById('lv_n').value = '9';
      document.getElementById('lv_label').value = DB.level[0].label;
      saveLevel();
      return DB.station.filter(s => s.level !== null && !DB.level.some(l => l.n === s.level)).map(s => s.code);
    }), []);
    await t.c.close();

    t = await page();
    eq('html в имени не исполняется', await t.p.evaluate(() => {
      DB.user.push({ name: '<img src=x onerror=alert(1)>', role: 'Админ', station: '', skills: [] });
      tab = 'users'; subtab = 'list'; render();
      return document.querySelectorAll('#app img').length;
    }), 0);
    await t.c.close();

    t = await page(JSON.stringify({user:[{name:'Оператор',role:'неизвестно',station:'',skills:[{skill:'Резка',level:'неизвестно'}]}]}));
    eq('битая роль/квалификация нормализуется без повышения прав', await t.p.evaluate(() => ({role:DB.user[0].role,skills:DB.user[0].skills})), {role:'Цех',skills:[]});
    eq('отчёт навыков после нормализации не падает', await t.p.evaluate(() => {tab='users';subtab='report';render();return document.querySelectorAll('.skill-coverage-card').length;}), 7);
    await t.c.close();

    t = await page(JSON.stringify({user:[{name:'Оператор',role:'Цех',station:'',skills:{skill:'Резка'}}]}));
    eq('skills не-массив не даёт белый экран', await t.p.evaluate(() => ({skills:DB.user[0].skills,hasUI:document.getElementById('app').innerHTML.length>200})), {skills:[],hasUI:true});
    await t.c.close();

    t = await page();
    eq('невалидный импорт не меняет DB частично', await t.p.evaluate(() => {
      const before=JSON.stringify(DB);try{prepareImportedState({station:[{code:'"><img src=x onerror=alert(1)>',name:'x'}]});}catch(e){}
      return JSON.stringify(DB)===before;
    }), true);
    eq('импорт ловит осиротевший Muntin', await t.p.evaluate(() => {
      try{prepareImportedState({shapeDef:[],muntinDef:[{id:'m2',shapeId:'missing',muntin:{}}]});return false;}catch(e){return /отсутствующий Shape/.test(e.message);}
    }), true);
    await t.c.close();

    const payload='\"><\/select><img id=xss_probe src=x onerror=window.__xss=1>';
    t = await page(JSON.stringify({shapeDef:[{id:payload,name:'Bad id',w:'48',h:'36',smart:{}}],muntinDef:[]}));
    eq('id фигуры не может внедрить HTML в option', await t.p.evaluate(() => {
      tab='configurators';subtab='muntin';render();openMuntinNew();return {img:document.querySelectorAll('#xss_probe').length,ran:window.__xss||0};
    }), {img:0,ran:0});
    await t.c.close();

    t = await page();
    await t.p.evaluate(() => {DB.shapeDef=[];DB.muntinDef=[];touch();});
    await t.p.reload();await t.p.waitForTimeout(200);
    eq('пустые Shape/Muntin сохраняются без повторного seed', await t.p.evaluate(() => ({shape:DB.shapeDef.length,muntin:DB.muntinDef.length})), {shape:0,muntin:0});
    await t.c.close();
  }

  /* --- 5b. Sales / Configurators boundary ------------------------- */
  {
    console.log('Sales / Configurators');
    const t = await page();
    eq('Sales больше не рендерит Shape/Muntin', await t.p.evaluate(() => {
      tab='sales';subtab=null;render();
      return {
        hasOrders:document.getElementById('app').textContent.includes('Sales Orders'),
        hasShape:document.getElementById('app').textContent.includes('Production Shape'),
        hasMuntin:document.getElementById('app').textContent.includes('Adaptive Muntin')
      };
    }), {hasOrders:true,hasShape:false,hasMuntin:false});
    eq('Configurators сохраняет Shape/Muntin', await t.p.evaluate(() => {
      tab='configurators';subtab=null;render();
      return {
        hasShape:document.getElementById('app').textContent.includes('Production Shape'),
        hasMuntin:document.getElementById('app').textContent.includes('Adaptive Muntin'),
        shapeRows:document.querySelectorAll('tbody tr').length
      };
    }), {hasShape:true,hasMuntin:true,shapeRows:1});
    eq('Muntin открывается через Configurators', await t.p.evaluate(() => {
      tab='configurators';subtab='muntin';render();
      return document.getElementById('app').textContent.includes('Adaptive Muntin v4.5');
    }), true);
    await t.c.close();
  }

  /* --- 6. RU / EN -------------------------------------------------- */
  {
    console.log('RU / EN');
    const src = fs.readFileSync(path.join(ROOT, 'src/erp/i18n.js'), 'utf8');
    const block = src.slice(src.indexOf('const I18N_EN='), src.indexOf('const _textOriginal'));
    const keys = [...block.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map(m => m[1]);
    const seen = {}, dups = [];
    keys.forEach(k => { if (seen[k]) dups.push(k); seen[k] = 1; });
    eq('нет дублей ключей в словаре', dups, []);

    const t = await page();
    eq('ошибки и production note переводятся в RU оболочкой', await t.p.evaluate(() => {
      LANG='ru';const m=defaultMuntinModel(),s={id:'g',name:'g',w:'48',h:'36',smart:ssNormalize({})},r=MuntinModule.compute(s,{muntin:m});
      return {
        edge:moduleErrorText({reason:'Edge A: out of plumb / level cannot be negative.'}),
        corner:moduleErrorText({reason:'Corner edge E (TL): no value yet.'}),
        note:moduleNoteText(muntinEdgeModeNote(r.geo))
      };
    }), {
      edge:'Сторона A: отклонение не может быть отрицательным.',
      corner:'Угловая сторона E (TL): размер ещё не указан.',
      note:'Концы баров сохраняют постоянный перпендикулярный отступ 7/16″ от реальной кромки стекла; затем вдоль оси бара применяется торцевой зазор.'
    });
    await t.p.evaluate(() => setLang('en'));
    eq('EN сохраняет нейтральное сообщение инженерного модуля', await t.p.evaluate(() => moduleErrorText({reason:'Shape not found'})), 'Shape not found');
    for (const tab of ['dashboard', 'users', 'sales', 'configurators', 'optimization', 'production']) {
      const left = await t.p.evaluate(tb => {
        tab = tb; subtab = null; render();
        const out = new Set(), w = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
        let n; while (n = w.nextNode()) { const v = n.nodeValue.trim(); if (/[А-Яа-яЁё]/.test(v)) out.add(v); }
        return [...out];
      }, tab);
      eq('EN без русского остатка: ' + tab, left, []);
    }
    eq('данные пользователя не переводятся', await t.p.evaluate(() => {
      DB.user.push({ name: 'Закалка', role: 'Цех', station: '', skills: [] });
      tab = 'users'; subtab = 'list'; render();
      return [...document.querySelectorAll('tbody tr td b')].map(e => e.textContent).pop();
    }), 'Закалка');
    await t.c.close();

    const seeded=JSON.stringify({user:[{name:'Alex',role:'Цех',station:'CUT1',skills:[]}]});
    const u = await page(seeded);
    eq('seed-название станции переводится в карточке пользователя', await u.p.evaluate(() => {
      setLang('en');tab='users';subtab='list';render();return document.querySelector('tbody tr td:nth-child(3)').textContent.trim();
    }), 'CUT1 — Cutting table');
    await u.c.close();
  }

  /* --- 7. мобильная оболочка --------------------------------------- */
  {
    console.log('mobile');
    const t=await page(undefined,{width:390,height:844});
    eq('страница Muntin не расширяет viewport', await t.p.evaluate(() => {
      tab='configurators';subtab='muntin';render();return document.documentElement.scrollWidth<=window.innerWidth;
    }), true);
    await t.c.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
