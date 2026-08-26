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

  /* --- 0. язык интерфейса: статическая проверка исходников ----------
     Тест «EN без русского остатка» ходит по текстовым узлам внутри #app и
     поэтому НЕ видит alert/confirm — их вообще нет в DOM. Именно там русский
     и оставался в английском интерфейсе. Проверяем исходники напрямую. */
  {
    console.log('язык интерфейса');
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        e.isDirectory() ? walk(p, out) : (p.endsWith('.js') && out.push(p));
      }
      return out;
    };
    const cyr = /[А-яЁё]/, leaks = [];
    for (const f of walk(path.join(ROOT, 'src'))) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /(?:alert|confirm)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
      let m;
      while ((m = re.exec(src))) if (cyr.test(m[2])) leaks.push(path.relative(ROOT, f) + ': ' + m[2].slice(0, 40));
    }
    eq('в alert/confirm нет русского текста', leaks, []);
    /* Текст исключения уезжает пользователю через alert('...: '+e.message) —
       та же утечка, что и в диалогах, только через неудачный импорт. В DOM их
       тоже нет, поэтому проверка статическая. */
    const throwLeaks = [];
    for (const f of walk(path.join(ROOT, 'src'))) {
      const src = fs.readFileSync(f, 'utf8');
      src.split('throw new Error(').slice(1).forEach(chunk => {
        const stmt = chunk.split(');')[0];
        if (cyr.test(stmt)) throwLeaks.push(path.relative(ROOT, f) + ': ' + stmt.slice(0, 40));
      });
    }
    eq('в текстах ошибок нет русского', throwLeaks, []);
    const i18n = fs.readFileSync(path.join(ROOT, 'src/erp/i18n.js'), 'utf8');
    ok('язык по умолчанию — английский', /\|\|\s*'en'/.test(i18n), i18n.match(/let LANG[^;]*/)[0]);
    /* Словарь работает в одну сторону RU→EN и применяется ТОЛЬКО в английском
       режиме. Значит русское значение = английский текст подменяется русским
       ровно там, где его быть не должно. Ключи-повторы вида "Edge mode":
       "Edge mode" безвредны, их не трогаем. */
    const ruValues = [];
    const pair = /"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let kv;
    while ((kv = pair.exec(i18n))) if (cyr.test(kv[2])) ruValues.push(kv[1].slice(0, 40) + ' → ' + kv[2].slice(0, 40));
    eq('словарь RU→EN нигде не выдаёт русский текст', ruValues, []);
  }
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

    const dxfSource = await p.evaluate(() => {
      const legacy=normalizeShapeDef({id:'legacy',name:'Legacy',type:'rectangle',w:'48',h:'36',smart:ssNormalize({})});
      const oldFingerprint=(def=>{const src=JSON.stringify({type:def.type,w:def.w,h:def.h,thickness:def.thickness,params:def.params,polygon:def.polygon,smart:def.smart,features:def.features,edgeOps:def.edgeOps});let h=2166136261;for(let i=0;i<src.length;i++){h^=src.charCodeAt(i);h=Math.imul(h,16777619);}return 'shp-'+(h>>>0).toString(16).padStart(8,'0');})(legacy);
      const sample='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n90\n4\n70\n1\n10\n-0.062693900897917293\n20\n-0.062339039673932138\n10\n0.18769175581660708\n20\n80.56184242240289\n10\n23.874610399584448\n20\n80.813162514113941\n10\n24.375388895415785\n20\n-0.12516187462589493\n0\nENDSEC\n0\nEOF\n';
      const parsed=shapeParseFusionDxf(sample),d=newShapeDef('rectangle');d.id='fusion';d.source={kind:'dxf',fileName:'panel-01.DXF',fileSize:54321,uploadedAt:'2026-08-24T15:00:00.000Z',note:'shop copy',preview:parsed.preview};
      const r=ShapeModule.compute(d),m=newMuntinDef(d.id),mr=MuntinModule.compute(d,m);
      const badUnits=shapeParseFusionDxf(sample.replace('$INSUNITS\n70\n1','$INSUNITS\n70\n4'));
      const openContour=shapeParseFusionDxf(sample.replace('90\n4\n70\n1','90\n4\n70\n0'));
      const bad=ShapeModule.compute(Object.assign({},d,{source:{kind:'dxf',fileName:'panel.txt',fileSize:0,uploadedAt:''}}));
      return {legacySource:legacy.source,legacyFingerprintStable:shapeFingerprint(legacy)===oldFingerprint,
        parsed:{ok:parsed.ok,width16:parsed.preview.width16,height16:parsed.preview.height16,points:parsed.preview.points.length,badUnits:badUnits.ok,open:openContour.ok},
        external:{valid:r.valid,external:r.externalFile,sourceValid:r.sourceValid,cutting:!!r.cutting,fingerprint:!!r.fingerprint,width16:Math.round(r.width*16),height16:Math.round(r.height*16),billable:+(r.billableArea/144).toFixed(4)},
        muntin:{valid:mr.valid,code:mr.code},bad:{sourceValid:bad.sourceValid}};
    });
    eq('legacy Shape получает drawn source без изменения fingerprint', {source:dxfSource.legacySource,stable:dxfSource.legacyFingerprintStable}, {source:{kind:'drawn',fileName:'',fileSize:0,uploadedAt:'',note:''},stable:true});
    eq('Fusion DXF читается в inches и округляется до 1/16', dxfSource.parsed, {ok:true,width16:391,height16:1295,points:4,badUnits:false,open:false});
    eq('DXF source fail-closed для Cutting Geometry, но даёт габариты и billable area', dxfSource.external, {valid:false,external:true,sourceValid:true,cutting:false,fingerprint:true,width16:391,height16:1295,billable:13.7355});
    eq('Muntin не использует внешний DXF как рассчитанную ERP-геометрию', dxfSource.muntin, {valid:false,code:'MUNTIN_SHAPE_INVALID'});
    eq('битый DXF source отклоняется', dxfSource.bad, {sourceValid:false});

    const manufacturing = await p.evaluate(() => {
      const base=newShapeDef('rectangle');base.id='mi-base';base.w='20';base.h='40';
      const d=normalizeShapeDef(JSON.parse(JSON.stringify(base)));
      d.manufacturingItems=[
        shapeNormalizeManufacturingItem({id:'mh',type:'hole',x:3.0625,y:12.125,diameter:'3/4',hRef:'left',vRef:'bottom'}),
        shapeNormalizeManufacturingItem({id:'mc',type:'clamp',edge:'right',distance:6.125}),
        shapeNormalizeManufacturingItem({id:'mg',type:'hinge',edge:'bottom',distance:7.5})
      ];
      const r=ShapeModule.compute(d),payload=ShapeModule.machinePayload(r);
      const req=(r.requirements||[]).filter(q=>q.source==='MANUFACTURING');
      const machineReq=(payload&&payload.requirements||[]).filter(q=>q.source==='MANUFACTURING');
      const dxf=normalizeShapeDef(newShapeDef('rectangle'));dxf.id='mi-dxf';dxf.source={kind:'dxf',fileName:'mi.dxf',fileSize:1200,uploadedAt:'2026-08-24T15:00:00.000Z',note:'',preview:{units:'in',points:[[0,0],[20,0],[20,40],[0,40]],width16:320,height16:640}};dxf.manufacturingItems=[shapeNormalizeManufacturingItem({id:'dc',type:'clamp',edge:'left',distance:4})];
      const dr=ShapeModule.compute(dxf);
      return {
        valid:r.valid,
        count:r.definition.manufacturingItems.length,
        hole:[r.definition.manufacturingItems[0].x,r.definition.manufacturingItems[0].y,r.definition.manufacturingItems[0].diameter],
        edge:[r.definition.manufacturingItems[1].edge,r.definition.manufacturingItems[1].distance],
        req:req.map(q=>q.stationClass+':'+q.operation).sort(),
        cutting:[r.cutting.holes.length,r.cutting.hardware.length],
        machineReq:machineReq.length,
        fingerprintChanged:shapeFingerprint(d)!==shapeFingerprint(base),
        external:{sourceValid:dr.sourceValid,requirements:(dr.requirements||[]).filter(q=>q.source==='MANUFACTURING').map(q=>q.operation)}
      };
    });
    eq('Manufacturing items сохраняются в ревизии и дают требования цеху', {valid:manufacturing.valid,count:manufacturing.count,hole:manufacturing.hole,edge:manufacturing.edge,req:manufacturing.req}, {valid:true,count:3,hole:[3.0625,12.125,'3/4'],edge:['right',6.125],req:['DRILLING:Drill Hole','SERVICE:Clamp','SERVICE:Hinge']});
    eq('Manufacturing items не попадают в Cutting Geometry / machine payload', {cutting:manufacturing.cutting,machineReq:manufacturing.machineReq}, {cutting:[0,0],machineReq:0});
    eq('Manufacturing items меняют fingerprint ревизии, DXF сохраняет requirements отдельно', {fingerprint:manufacturing.fingerprintChanged,external:manufacturing.external}, {fingerprint:true,external:{sourceValid:true,requirements:['Clamp']}});
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
    let t = await page(JSON.stringify({ user: null, station: null, operation: null, workPosition: null, terminal: null }));
    const len = await t.p.evaluate(() => document.getElementById('app').innerHTML.length);
    ok('битый localStorage не даёт белый экран', len > 200, 'app length=' + len + ' errs=' + JSON.stringify(t.errs));
    await t.c.close();

    t = await page('{не json');
    ok('нечитаемый localStorage не роняет старт', (await t.p.evaluate(() => document.getElementById('app').innerHTML.length)) > 200);
    await t.c.close();

    /* --- справочники цеха: четыре РАЗНЫЕ сущности (порция 5·2) ---------
       Раньше «станция» означала и шаг маршрута, и станок, а «уровень» дублировал
       первое отдельной таблицей. Разведено: station — шаг маршрута, workPosition —
       где делают, operation — что делают, terminal — чем сканируют. */
    t = await page();
    eq('четыре справочника цеха заведены и разведены', await t.p.evaluate(() => [
      DB.station.length, DB.operation.length, DB.workPosition.length, DB.terminal.length, DB.level === undefined
    ]), [11, 18, 22, 0, true]);
    eq('станции идут по порядку, всегда проходятся только три', await t.p.evaluate(() => [
      DB.station.map(s => s.seq), DB.station.filter(s => s.always).map(s => s.code)
    ]), [[1,2,3,4,5,6,7,8,9,10,11], ['CUT','SHIPR','SHIP']]);
    await t.c.close();

    /* Ключевая проверка модели: место служит двум станциям, и это ВЫВЕДЕНО из
       его операций, а не записано второй колонкой. Второго источника правды нет. */
    t = await page();
    eq('ЧПУ служит двум станциям — выведено из операций', await t.p.evaluate(() => {
      const c = DB.workPosition.find(w => w.code === 'CNC1');
      return [workPositionStations(c), stationWorkPositions('EDGE').some(w => w.code === 'CNC1')];
    }), [['EDGE','FAB'], true]);
    /* stage принадлежит ОПЕРАЦИИ, а не станку: на одном ЧПУ отверстия обязаны
       быть до печи, а полировка ламината — после. Держи это на станке — и третий
       визит детали затрёт первый, ровно как у Spil. */
    eq('до/после печи — свойство операции, а не станка', await t.p.evaluate(() =>
      ['fabrication','cnc_shape_polish','cnc_lami_polish'].map(c => DB.operation.find(o => o.code === c).stage)
    ), ['pre_temper','pre_temper','post_temper']);
    eq('садками работают печь, ламинация, автоклав и линия СП', await t.p.evaluate(() =>
      DB.workPosition.filter(w => w.batchMode === 'batch').map(w => w.code)
    ), ['FURN1','LAM1','AUTOCL1','IGU1']);
    eq('габарит есть у трёх мест, остальные ждут замеров', await t.p.evaluate(() =>
      DB.workPosition.filter(w => w.maxW != null).map(w => w.code)
    ), ['BEVEL1','CNC1','FURN1']);
    /* «Без габарита» и «ждёт замера» — РАЗНЫЕ множества, и три экрана обязаны
       считать одинаково. У ручного притупления габарита нет и не будет: там
       руки, а не станок, и держать его в долгу значит показывать задачу,
       которую никто никогда не закроет. */
    eq('ручное место не числится ждущим замера', await t.p.evaluate(() => [
      DB.workPosition.filter(w => w.maxW == null).length,
      workPositionsAwaitingSize().length,
      workPositionsAwaitingSize().some(w => w.code === 'ARRIS-H')
    ]), [19, 18, false]);
    /* Терминал пустой намеренно: сколько экранов в цеху — ещё не называли, а
       засеять «по одному на станцию» значит повторить подстанции Spil. */
    eq('рабочее место попадает в маршрут своей станции', await t.p.evaluate(() => {
      tab = 'production'; subtab = 'stations'; render();
      return document.querySelector('.stage-machines').textContent.trim();
    }), 'CUT1 CUT2');
    await t.c.close();

    /* ГЛАВНЫЙ ПУТЬ ПЕРЕЕЗДА. В браузере пользователя под ключом station лежат
       СТАНКИ прошлой модели. Тест механизма пересева не заменяет тест пути в
       него — поэтому здесь именно сохранённые данные, а не вызов руками. */
    t = await page(JSON.stringify({
      refVersion: 2,
      station: [{ code: 'CUT1', name: 'Раскроечный стол', levels: [1], minTh: 3, maxTh: 19 },
                { code: 'EDGE1', name: 'Кромкообрабатывающая линия', levels: [2] },
                { code: 'CNC1', name: 'Обрабатывающий центр ЧПУ', levels: [2, 3], maxW: 60, maxL: 122 }],
      level: [{ n: 1, label: 'Резка' }, { n: 2, label: 'Кромка' }],
      user: [{ name: 'Ivan', role: 'Владелец', station: 'CNC1', skills: [] },
             { name: 'Petr', role: 'Продажи', station: 'EDGE1', skills: [] }]
    }));
    eq('станки прошлой модели не остаются станциями', await t.p.evaluate(() => [
      DB.refVersion, DB.station.map(s => s.code), DB.workPosition.length
    ]), [4, ['CUT','EDGE','FAB','CERP','HEAT','SAND','PAINT','LAM','IGU','SHIPR','SHIP'], 22]);
    /* Код станка, которому в реальном цеху ничего не соответствует, обнуляется:
       за EDGE1 стоят шесть разных мест, и угадывать, какое из них — нельзя. */
    eq('привязка человека переехала на рабочее место по коду', await t.p.evaluate(() =>
      DB.user.map(u => [u.name, u.workPosition, u.station === undefined])
    ), [['Ivan','CNC1',true], ['Petr','',true]]);
    await t.c.close();

    /* Данных без refVersion — так выглядит браузер, который не открывали с
       прошлой заливки. Именно ради этого случая в DEFAULT стоит ноль. */
    t = await page(JSON.stringify({ station: [{ code: 'OLDX', name: 'Старьё', level: 1 }], level: [{ n: 1, label: 'Старый этап' }] }));
    eq('данные без версии справочника пересеваются', await t.p.evaluate(() =>
      [DB.refVersion, DB.station.length, DB.station.some(s => s.code === 'OLDX')]), [4, 11, false]);
    await t.c.close();

    t = await page(JSON.stringify({ user: [{ name: 'Ivan', role: 'Владелец', workPosition: '', skills: [] }] }));
    eq('пересев не трогает пользователей', await t.p.evaluate(() =>
      [DB.user.map(u => u.name), DB.station.length]), [['Ivan'], 11]);
    await t.c.close();

    t = await page();
    eq('пересев обновляет справочники и не трогает рабочие данные', await t.p.evaluate(() => {
      DB.station = []; DB.workPosition = []; DB.operation = []; DB.refVersion = 1;
      const shapes = DB.shapeDef.length, users = DB.user.length;
      const did = reseedReferenceTables();
      return [did, DB.station.length, DB.workPosition.length, DB.operation.length, DB.refVersion,
              DB.shapeDef.length === shapes, DB.user.length === users];
    }), [true, 11, 22, 18, 4, true, true]);
    await t.c.close();

    t = await page();
    eq('на актуальной версии пересев не повторяется', await t.p.evaluate(() => reseedReferenceTables()), false);
    await t.c.close();

    /* Нормализация обязана пережить мусор: до пересева она видит именно старые
       данные, и если она упадёт — до пересева дело не дойдёт вообще. */
    t = await page();
    eq('мусор в справочниках цеха нормализуется, а не роняет старт', await t.p.evaluate(() => {
      DB.station = [{ code: 'A B' }, null, { code: 'CUT' }, { code: 'cut' }, 'мусор'];
      DB.workPosition = [{ code: 'X1', station: 'НЕТ', operations: ['нет_такой'], maxW: 5 }];
      DB.terminal = [{ code: 'T1', workPositions: ['НЕТУ', 'X1', 'X1'] }];
      normalizeShopFloor();
      return [DB.station.map(s => s.code), DB.workPosition[0].station, DB.workPosition[0].operations,
              [DB.workPosition[0].maxW, DB.workPosition[0].maxL], DB.terminal[0].workPositions];
    }), [['A B','CUT'], '', [], [null, null], ['X1']]);
    await t.c.close();

    /* --- импорт двух файлов под заполнение ------------------------------
       Ради этого импорт и написан: 19 замеров из цеха должны доезжать файлом,
       а не правкой кода и новой сборкой. Файлы читает node и передаёт строкой —
       fetch на file:// в Chrome закрыт. */
    const stationsCsv = fs.readFileSync(path.join(ROOT, 'templates/STATIONS.csv'), 'utf8');
    const positionsCsv = fs.readFileSync(path.join(ROOT, 'templates/WORK_POSITIONS.csv'), 'utf8');
    t = await page();
    eq('templates/STATIONS.csv принимается целиком', await t.p.evaluate(csv => {
      const r = importStationsCsv(csv);
      return [r.accepted, r.added, r.updated, r.rejected.length, DB.station.map(s => s.code).join(',')];
    }, stationsCsv), [11, 0, 11, 0, 'CUT,EDGE,FAB,CERP,HEAT,SAND,PAINT,LAM,IGU,SHIPR,SHIP']);
    eq('templates/WORK_POSITIONS.csv принимается целиком', await t.p.evaluate(csv => {
      const r = importWorkPositionsCsv(csv);
      const cnc = DB.workPosition.find(w => w.code === 'CNC1');
      return [r.accepted, r.updated, r.rejected.length, r.missing.length, cnc.operations];
    }, positionsCsv), [22, 22, 0, 0, ['fabrication','cnc_shape_polish','cnc_lami_polish']]);
    /* Снятый в цеху габарит доезжает импортом. */
    eq('замер из цеха приезжает файлом', await t.p.evaluate(csv => {
      const measured = csv.replace('roberto,,,,single,', 'roberto,,60,122,single,');
      const r = importWorkPositionsCsv(measured);
      const cnc2 = DB.workPosition.find(w => w.code === 'CNC2');
      return [r.rejected.length, cnc2.maxW, cnc2.maxL];
    }, positionsCsv), [0, 60, 122]);
    await t.c.close();

    /* Отчёт обязан объяснить КАЖДУЮ отклонённую строку: строка, отклонённая
       без причины, возвращается пользователю загадкой. */
    t = await page();
    eq('импорт объясняет каждую отклонённую строку', await t.p.evaluate(() => {
      const bad = 'code,station,name_en,name_ru,kind,operations,default_operator,default_helper,max_w_in,max_l_in,batch_mode,note\n'
        + 'GOOD1,CUT,Good,Годная,machine,cutting,,,10,20,single,\n'
        + 'BAD1,NOSUCH,X,Икс,machine,cutting,,,,,single,\n'
        + 'BAD2,CUT,X,Икс,machine,nosuchop,,,,,single,\n'
        + 'BAD3,CUT,X,Икс,machine,cutting,,,10,,single,\n'
        + 'GOOD1,CUT,Dup,Дубль,machine,cutting,,,,,single,\n';
      const r = importWorkPositionsCsv(bad);
      return [r.accepted, r.added, r.rejected.map(x => x.line), DB.workPosition.length];
    }), [1, 1, [3, 4, 5, 6], 23]);
    eq('файл не того формата отклоняется целиком, а не молча', await t.p.evaluate(() => {
      const r = importStationsCsv('foo,bar\n1,2\n');
      return [r.accepted, r.rejected.length, DB.station.length];
    }), [0, 1, 11]);
    await t.c.close();

    /* Пересев обязан отработать НА ИМПОРТЕ, а не через F5: иначе после загрузки
       чужого файла на экране лежат станки под видом шагов маршрута. */
    t = await page();
    eq('импорт старого файла пересевается сразу', await t.p.evaluate(() => {
      const next = prepareImportedState({ refVersion: 2,
        station: [{ code: 'CNC1', name: 'Обрабатывающий центр ЧПУ', levels: [2, 3] }],
        user: [{ name: 'Ivan', role: 'Владелец', station: 'CNC1', skills: [] }] });
      return [next.refVersion, next.station.length, next.workPosition.length,
              next.station[0].code, next.user[0].workPosition];
    }), [4, 11, 22, 'CUT', 'CNC1']);
    await t.c.close();

    t = await page();
    eq('html в имени не исполняется', await t.p.evaluate(() => {
      DB.user.push({ name: '<img src=x onerror=alert(1)>', role: 'Админ', workPosition: '', skills: [] });
      tab = 'users'; subtab = 'list'; render();
      return document.querySelectorAll('#app img').length;
    }), 0);
    await t.c.close();

    t = await page(JSON.stringify({user:[{name:'Оператор',role:'неизвестно',workPosition:'',skills:[{skill:'Резка',level:'неизвестно'}]}]}));
    eq('битая роль/квалификация нормализуется без повышения прав', await t.p.evaluate(() => ({role:DB.user[0].role,skills:DB.user[0].skills})), {role:'Продажи',skills:[]});
    eq('отчёт навыков после нормализации не падает', await t.p.evaluate(() => {tab='users';subtab='report';render();return document.querySelectorAll('.skill-coverage-card').length;}), 7);
    await t.c.close();

    t = await page(JSON.stringify({user:[{name:'Оператор',role:'Цех',workPosition:'',skills:{skill:'Резка'}}]}));
    eq('skills не-массив не даёт белый экран', await t.p.evaluate(() => ({skills:DB.user[0].skills,hasUI:document.getElementById('app').innerHTML.length>200})), {skills:[],hasUI:true});
    await t.c.close();

    /* --- B8: реальные роли и демо-пользователи ---------------------- */
    t = await page();
    eq('роли приведены к реальным должностям', await t.p.evaluate(() => ({roles:ROLES,safe:SAFE_DEFAULT_ROLE})),
      {roles:['Продажи','Бухгалтер','Админ','Владелец'],safe:'Продажи'});
    eq('чистый браузер получает трёх демо-пользователей', await t.p.evaluate(() => DB.user.map(u => u.name + ' · ' + u.role)),
      ['Demo Sales · Продажи','Demo Accounting · Бухгалтер','Demo Owner · Владелец']);
    /* Засев обязан быть одноразовым: иначе удалённые демо-записи возвращались бы
       после каждого обновления страницы, и удалить их было бы невозможно. */
    await t.p.evaluate(() => { DB.user=[]; touch(); });
    await t.p.reload();
    await t.p.waitForTimeout(200);
    eq('удалённые демо-пользователи не возвращаются после F5', await t.p.evaluate(() => DB.user.length), 0);
    await t.c.close();

    t = await page(JSON.stringify({user:[{name:'Real Person',role:'Админ',workPosition:'',skills:[]}]}));
    eq('демо-пользователи не подмешиваются к настоящим', await t.p.evaluate(() => DB.user.map(u => u.name)), ['Real Person']);
    await t.c.close();

    t = await page();
    eq('дубликат станции в импорте называется по-английски', await t.p.evaluate(() => {
      try{prepareImportedState({station:[{code:'A1',name:'x'},{code:'A1',name:'y'}]});return '';}catch(e){return e.message;}
    }), 'Stations: duplicate "A1".');
    eq('неизвестная роль в импорте отклоняется по-английски', await t.p.evaluate(() => {
      try{prepareImportedState({user:[{name:'X',role:'Начальник цеха'}]});return '';}catch(e){return e.message;}
    }), 'User 1 has an unknown role.');
    await t.c.close();

    t = await page();
    eq('невалидный импорт не меняет DB частично', await t.p.evaluate(() => {
      const before=JSON.stringify(DB);try{prepareImportedState({station:[{code:'"><img src=x onerror=alert(1)>',name:'x'}]});}catch(e){}
      return JSON.stringify(DB)===before;
    }), true);
    eq('импорт ловит осиротевший Muntin', await t.p.evaluate(() => {
      try{prepareImportedState({shapeDef:[],muntinDef:[{id:'m2',shapeId:'missing',muntin:{}}]});return false;}catch(e){return e.message.includes('references a missing Shape');}
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
        hasOrders:!!document.querySelector('.sales-list-card'),
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

    const serviceSetUi = await page();
    const serviceSetIds = await serviceSetUi.p.evaluate(() => {
      tab='sales';subtab=null;render();salesOrderNew();salesOrderAddLine();
      const line=soDraft.lines[0],set=salesNormalizeServiceSet({
        id:'SVC-QA',code:'S1',name:'QA Edgework',mode:'sides',
        sides:{A:[{type:'Rough Arris'}],B:[],C:[],D:[],other:[]}
      });
      soDraft.serviceSets=[set];render();
      return {lineId:line.id,setId:set.id};
    });
    eq('до выбора строки bulk-панель скрыта', await serviceSetUi.p.locator('.ss-bulk').count(), 0);
    await serviceSetUi.p.locator('.sales-lines-table tbody .line-check input').check();
    eq('выбор отдельной Sales-строки показывает Bulk Set', await serviceSetUi.p.locator('.ss-bulk').count(), 1);
    await serviceSetUi.p.locator('.ss-bulk select').nth(1).selectOption(serviceSetIds.setId);
    await serviceSetUi.p.getByRole('button',{name:'Preview',exact:true}).click();
    eq('Preview готовит применение Edgework Set', await serviceSetUi.p.locator('.ss-preview').count(), 1);
    await serviceSetUi.p.getByRole('button',{name:'Apply',exact:true}).click();
    eq('Apply назначает Edgework Set строке', await serviceSetUi.p.evaluate(({lineId,setId}) => {
      const line=soDraft.lines.find(l=>l.id===lineId);
      return !!line&&line.serviceSetId===setId&&document.querySelector('.ss-badge').textContent==='S1';
    }, serviceSetIds), true);
    await serviceSetUi.c.close();

    const dxfUi = await page();
    eq('выбор DXF сохраняет только производный contour preview и размеры', await dxfUi.p.evaluate(async () => {
      tab='configurators';subtab='shape';render();openShapeNew('rectangle');
      const text='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n90\n4\n70\n1\n10\n0\n20\n0\n10\n24.43808\n20\n0\n10\n24.43808\n20\n80.93832\n10\n0\n20\n80.93832\n0\nENDSEC\n0\nEOF\n';
      const file=new File([text], 'Fusion деталь 01.dxf',{type:'application/dxf'}),input={files:[file],value:'picked'};
      shapeAttachDxf(input);for(let i=0;i<50&&(!sDraft.source||sDraft.source.kind!=='dxf');i++)await new Promise(r=>setTimeout(r,10));
      const keys=Object.keys(sDraft.source).sort(),json=JSON.stringify(sDraft),rawName=!!document.querySelector('.shape-dxf-name [data-raw]'),svg=!!document.querySelector('.shape-dxf-svg');
      const before={kind:sDraft.source.kind,name:sDraft.source.fileName,keys:keys,previewKeys:Object.keys(sDraft.source.preview).sort(),rawBodyLeaked:json.includes('$INSUNITS')||json.includes('LWPOLYLINE'),rawName:rawName,svg:svg,width16:sDraft.source.preview.width16,height16:sDraft.source.preview.height16};
      removeShapeDxf();before.removed=sDraft.source;return before;
    }), {kind:'dxf',name:'Fusion деталь 01.dxf',keys:['fileName','fileSize','kind','note','preview','uploadedAt'],previewKeys:['height16','points','units','width16'],rawBodyLeaked:false,rawName:true,svg:true,width16:391,height16:1295,removed:{kind:'drawn',fileName:'',fileSize:0,uploadedAt:'',note:''}});
    await dxfUi.c.close();

    const dxfSales = await page();
    eq('Sales получает Width и Height DXF, округлённые до 1/16', await dxfSales.p.evaluate(() => {
      const d=newShapeDef('rectangle');d.id='sales-dxf';d.revision=3;d.source={kind:'dxf',fileName:'sales.dxf',fileSize:2048,uploadedAt:'2026-08-24T15:00:00.000Z',note:'',preview:{units:'in',points:[[0,0],[24.43808,0],[24.43808,80.93832],[0,80.93832]],width16:391,height16:1295}};
      const line=normalizeSalesOrderLine({width16:800,height16:600,mark:'A'}),ok=salesSyncLineFromShape(line,d);
      return {ok:ok,width16:line.width16,height16:line.height16,id:line.shapeRef.id,revision:line.shapeRef.revision,hasFingerprint:/^shp-[0-9a-f]{8}$/.test(line.shapeRef.fingerprint)};
    }), {ok:true,width16:391,height16:1295,id:'sales-dxf',revision:3,hasFingerprint:true});
    eq('Services обычного Shape считаются по толщине Makeup в Sales Order', await dxfSales.p.evaluate(() => {
      const sh=newShapeDef('rectangle');sh.id='qa-service-shape';sh.w='20';sh.h='40';sh.manufacturingItems=[
        shapeNormalizeManufacturingItem({id:'c',type:'clamp',edge:'left',distance:4}),
        shapeNormalizeManufacturingItem({id:'g',type:'hinge',edge:'right',distance:5}),
        shapeNormalizeManufacturingItem({id:'h',type:'hole',x:3,y:8,diameter:'3/4',hRef:'left',vRef:'bottom'})
      ];DB.shapeDef=[normalizeShapeDef(sh)];
      soDraft=newSalesOrderDraft();const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;
      const line=normalizeSalesOrderLine({makeupId:m.id,qty:1,width16:320,height16:640,shapeRef:salesShapeRefFrom(DB.shapeDef[0])});soDraft.lines=[line];
      const rows=salesLineChargeRows(line).filter(r=>r.key.indexOf('MI:')===0),total=rows.reduce((n,r)=>n+(r.catalogRate==null?0:r.basis*r.catalogRate),0);
      return {total,rows:rows.map(r=>[r.label,r.basis,r.catalogRate,r.catalogRate==null?null:r.basis*r.catalogRate])};
    }), {total:29,rows:[['Clamp',1,8,8],['Hinge',1,15,15],['Hole 1/2″–1″',1,6,6]]});

    eq('Pricing меняет только деньги, geometry basis остаётся системным', await dxfSales.p.evaluate(() => {
      const sh=newShapeDef('rectangle');sh.id='qa-price-shape';sh.w='20';sh.h='40';sh.edgeOps.A=[shapeNormalizeOp({type:'Flat Polish'})];sh.edgeOps.B=[shapeNormalizeOp({type:'Mitering',angle:45,side:'front'})];sh.manufacturingItems=[shapeNormalizeManufacturingItem({id:'qa-hng',type:'hinge',edge:'right',distance:5})];DB.shapeDef=[normalizeShapeDef(sh)];
      soDraft=newSalesOrderDraft();const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;const line=normalizeSalesOrderLine({makeupId:m.id,qty:2,width16:320,height16:640,shapeRef:salesShapeRefFrom(DB.shapeDef[0])});soDraft.lines=[line];
      const beforeShape=JSON.stringify(DB.shapeDef[0]),beforeRows=salesLineChargeRows(line).map(r=>({key:r.key,basis:r.basis,unit:r.unit,catalogRate:r.catalogRate}));const hinge=beforeRows.find(r=>r.key.indexOf('MI:hinge:')===0),flat=beforeRows.find(r=>r.key.indexOf('EDGE:flatPolish:')===0),miter=beforeRows.find(r=>r.key.indexOf('EDGE:miter45:')===0);
      salesSetOrderGroupRate('MI:hinge','12');const hRow=salesLineChargeRows(line).find(r=>r.key===hinge.key);salesSetChargeOrderRate(line.id,hRow.key,'10');const afterRows=salesLineChargeRows(line).map(r=>({key:r.key,basis:r.basis,unit:r.unit})),state=salesChargePricingState(line,hRow),summary=salesLinePricingSummary(line);
      return {hingeBasis:hinge.basis,flatBasis:flat.basis,miterCatalog:miter.catalogRate,effectiveHinge:state.effectiveRate,unpriced:summary.unpriced,sameShape:beforeShape===JSON.stringify(DB.shapeDef[0]),sameBasis:JSON.stringify(beforeRows.map(r=>[r.key,r.basis,r.unit]))===JSON.stringify(afterRows.map(r=>[r.key,r.basis,r.unit]))};
    }), {hingeBasis:1,flatBasis:40,miterCatalog:null,effectiveHinge:10,unpriced:1,sameShape:true,sameBasis:true});
    eq('Сохранённый заказ держит snapshot Catalog rate, включая отсутствие цены', await dxfSales.p.evaluate(() => {
      const line=soDraft.lines[0],rows=salesLineChargeRows(line),flat=rows.find(r=>r.key.indexOf('EDGE:flatPolish:')===0),miter=rows.find(r=>r.key.indexOf('EDGE:miter45:')===0);salesSnapshotAllChargePricing();const flatSaved=line.chargePricing[flat.key].catalogRate,miterSaved=line.chargePricing[miter.key].catalogRate;SALES_SERVICE_RATE_TABLE.flatPolish['8-10']=.99;const flatNow=salesLineChargeRows(line).find(r=>r.key===flat.key),flatState=salesChargePricingState(line,flatNow),miterState=salesChargePricingState(line,salesLineChargeRows(line).find(r=>r.key===miter.key));salesResetChargeRate(line.id,flat.key);const resetCatalog=line.chargePricing[flat.key].catalogRate;SALES_SERVICE_RATE_TABLE.flatPolish['8-10']=.10;return {flatSaved,miterSaved,flatEffective:flatState.effectiveRate,miterEffective:miterState.effectiveRate,resetCatalog};
    }), {flatSaved:.1,miterSaved:null,flatEffective:.1,miterEffective:null,resetCatalog:.1});
    await dxfSales.c.close();
  }

  /* --- 5c. Customers ------------------------------------------------ */
  {
    console.log('Customers');
    let t = await page();
    eq('старые данные стартуют с пустым справочником Customers', await t.p.evaluate(() => Array.isArray(DB.customer)&&DB.customer.length), 0);
    eq('новый клиент нормализуется и получает business code', await t.p.evaluate(() => {
      const c=newCustomerDraft();c.legalName='ABC Glass';c.displayName='ABC Glass';DB.customer.push(c);normalizeCustomers();
      if(!DB.customer[0].code)DB.customer[0].code=nextCustomerCode();touch();return {name:DB.customer[0].legalName,code:DB.customer[0].code,status:DB.customer[0].status};
    }), {name:'ABC Glass',code:'C-00001',status:'active'});
    await t.c.close();

    t = await page();
    eq('legacy CSV маппится в новую карточку клиента', await t.p.evaluate(() => {
      const csv='Account,Name,Telephone,EMail,Post Add1,Post PC,Del Add1,Del PC,On Hold,SalesRep,TAX Number,Credit Limit,DCLink,FLID,IsProspect,PaymentTerms\nA100,Legacy Glass,416-555-0100,a@example.com,10 King St,M5V 1A1,20 Queen St,M5H 2N2,Yes,Max,TX-9,25000,77,88,1,45 Days Net';
      const c=parseCustomerImport(csv,'legacy.csv')[0];return {code:c.code,name:c.legalName,phone:c.contacts[0].phone,email:c.contacts[0].email,bill:c.addresses.find(a=>a.type==='billing').address1,del:c.addresses.find(a=>a.type==='delivery').address1,hold:c.onHold,rep:c.salesRep,tax:c.taxNumber,limit:c.creditLimit,dc:c.legacyRefs.dcLink,flid:c.legacyRefs.flid,prospect:c.isProspect,terms:c.paymentTerms};
    }), {code:'A100',name:'Legacy Glass',phone:'416-555-0100',email:'a@example.com',bill:'10 King St',del:'20 Queen St',hold:true,rep:'Max',tax:'TX-9',limit:25000,dc:'77',flid:'88',prospect:true,terms:'45 Days Net'});
    await t.c.close();

    t = await page();
    eq('merge импорта обновляет клиента по Account без дубля', await t.p.evaluate(() => {
      DB.customer=[normalizeCustomer({code:'A1',legalName:'Old'})];
      applyCustomerImport([normalizeCustomer({code:'A1',legalName:'New',paymentTerms:'COD'})],'merge');
      return {n:DB.customer.length,name:DB.customer[0].legalName,terms:DB.customer[0].paymentTerms};
    }), {n:1,name:'New',terms:'COD'});
    await t.c.close();

    t = await page();
    eq('удаление customer с будущей ссылкой на Sales Order блокируется доменным guard', await t.p.evaluate(() => {
      const c=normalizeCustomer({code:'A1',legalName:'Ref'});DB.customer=[c];DB.salesOrder=[{customerId:c.id}];return customerHasReferences(c.id);
    }), true);
    await t.c.close();

    t = await page(JSON.stringify({customer:[{id:'c1',code:'A1',legalName:'<img id=xss_customer src=x onerror=window.__cx=1>',displayName:'<img id=xss_customer2 src=x onerror=window.__cx=1>',contacts:[],addresses:[]}]}));
    eq('Customer master не исполняет HTML из имени клиента', await t.p.evaluate(() => {tab='customers';render();return {imgs:document.querySelectorAll('#xss_customer,#xss_customer2').length,ran:window.__cx||0};}), {imgs:0,ran:0});
    await t.c.close();

    t = await page();
    eq('глобальный import/export contract принимает customer collection', await t.p.evaluate(() => {
      const next=prepareImportedState({customer:[{id:'c1',code:'A1',legalName:'Imported',contacts:[],addresses:[]}]});return {n:next.customer.length,name:next.customer[0].legalName};
    }), {n:1,name:'Imported'});
    await t.c.close();
  }

  /* --- 5d. Sales Order / order-scoped Makeups ------------------------ */
  {
    console.log('Sales Order / Makeups');
    let t = await page();
    eq('новый Sales Order получает локальный Makeup A', await t.p.evaluate(() => {
      const o=newSalesOrderDraft();return {n:o.makeups.length,code:o.makeups[0].code,type:o.makeups[0].unitType,panes:o.makeups[0].panes.length,cavities:o.makeups[0].cavities.length,global:Object.prototype.hasOwnProperty.call(DB,'salesConfiguration')};
    }), {n:1,code:'A',type:'double',panes:2,cavities:1,global:false});
    eq('код Makeup A может повторяться в разных заказах', await t.p.evaluate(() => {
      const a=newSalesOrderDraft(),b=newSalesOrderDraft();return [a.makeups[0].code,b.makeups[0].code];
    }), ['A','A']);
    eq('Sales хранит размеры точно в 1/16″', await t.p.evaluate(() => {
      const n=salesDimTo16('34 13/16');return {n,back:salesDimFrom16(n)};
    }), {n:557,back:'34 13/16'});
    eq('surface номера принадлежат конкретному Lite', await t.p.evaluate(() => [salesPaneSurfaces(0),salesPaneSurfaces(1),salesPaneSurfaces(2)]), [[1,2],[3,4],[5,6]]);
    eq('числовые legacy dimensions трактуются как inches, а width16 остаётся ticks', await t.p.evaluate(() => ({legacy:salesDimTo16(34),stored:normalizeSalesOrderLine({makeupId:'MU-X',width16:544,height16:576}).width16})), {legacy:544,stored:544});
    eq('Laminated overall thickness включает interlayer', await t.p.evaluate(() => {
      const o=newSalesOrderDraft(),m=o.makeups[0];m.unitType='single';m.panes=[normalizeSalesPane({category:'laminated',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB030'}},0)];m.cavities=[];return salesMakeupThicknessMm(m).toFixed(3);
    }), '12.762');
    eq('Makeup accordion стартует закрытым и держит только одну открытую секцию', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesSetUnitType('triple');soOpenSectionKey=null;render();const d=[...document.querySelectorAll('.mu-section')],initial=d.filter(x=>x.open).length;d[0].open=true;salesAccordionToggle(d[0],d[0].dataset.muSection);d[1].open=true;salesAccordionToggle(d[1],d[1].dataset.muSection);return {initial,open:d.filter(x=>x.open).length,key:soOpenSectionKey};
    }), {initial:0,open:1,key:'cavity-0'});
    eq('Frit и Spandrel имеют независимые surface', await t.p.evaluate(() => {
      const p=normalizeSalesPane({visionType:'frit',frit:{surface:2},spandrel:{surface:1}},0);return {frit:p.frit.surface,spandrel:p.spandrel.surface,coating:p.coatingSurface};
    }), {frit:2,spandrel:1,coating:null});
    /* --- Frit к реальности: по умолчанию был Black + Full coverage, то есть
       изделие, которого цех не делает. --- */
    eq('новый лист получает Frit, который цех может изготовить', await t.p.evaluate(() => {
      const f=salesDefaultPane(0).frit;
      return {color:f.color,pattern:f.pattern,dotMm:f.dotMm,corner:f.marginFrom,w:f.marginW16,h:f.marginH16,coverage:Object.prototype.hasOwnProperty.call(f,'coverage')};
    }), {color:'White',pattern:'2 x 2 square',dotMm:5,corner:'Top right',w:16,h:16,coverage:false});
    eq('ассортимент фрита — только реальный', await t.p.evaluate(() => ({colors:FRIT_COLORS,patterns:FRIT_PATTERNS})),
      {colors:['White','Acid Etched'],patterns:['2 x 2 square','4 x 4 square','2 x 4 diamond','Custom — see silk screen sheet']});
    eq('старая спецификация Frit приводится к реальному ассортименту', await t.p.evaluate(() => {
      const p=normalizeSalesPane({visionType:'frit',frit:{color:'Black',pattern:'Full coverage',coverage:'100',marginFrom:'Somewhere'}},0);
      return {color:p.frit.color,pattern:p.frit.pattern,corner:p.frit.marginFrom,coverage:Object.prototype.hasOwnProperty.call(p.frit,'coverage')};
    }), {color:'White',pattern:'2 x 2 square',corner:'Top right',coverage:false});
    /* Ноль — законный отступ (узор идёт до кромки), поэтому у отступа свой
       парсер: salesDimTo16 отбрасывает 0 вместе с мусором. */
    eq('нулевой отступ узора сохраняется, мусор — нет', await t.p.evaluate(() => ({
      zero:salesMarginTo16('0'),half:salesMarginTo16('1 1/2'),garbage:salesMarginTo16('12abc'),
      kept:normalizeSalesPane({visionType:'frit',frit:{marginW16:0}},0).frit.marginW16,text:salesMarginFrom16(0)
    })), {zero:0,half:24,garbage:null,kept:0,text:'0'});
    eq('поля спецификации Frit на месте, Coverage % убран', await t.p.evaluate(() => {
      const html=salesFritFields(normalizeSalesPane({visionType:'frit'},0),0);
      return {coverage:html.includes('Coverage'),dot:html.includes('Dot diameter'),corner:html.includes('Margin measured from'),
        margins:html.split('Margin — ').length-1,marking:html.includes('Production marking')};
    }), {coverage:false,dot:true,corner:true,margins:2,marking:true});
    eq('300 строк сохраняют стабильные makeupId и integer-геометрию', await t.p.evaluate(() => {
      const o=newSalesOrderDraft(),mu=o.makeups[0].id;for(let i=0;i<300;i++)o.lines.push(normalizeSalesOrderLine({makeupId:mu,qty:1,width:'48',height:'36',mark:'L'+i}));const n=normalizeSalesOrder(o);return {n:n.lines.length,refs:new Set(n.lines.map(x=>x.makeupId)).size,w:n.lines[299].width16,h:n.lines[299].height16};
    }), {n:300,refs:1,w:768,h:576});
    eq('import отклоняет строку с отсутствующим Makeup', await t.p.evaluate(() => {
      const o=newSalesOrderDraft();o.lines=[normalizeSalesOrderLine({makeupId:'MISSING',width:'10',height:'10'})];
      try{prepareImportedState({salesOrder:[o]});return false;}catch(e){return /Makeup/.test(e.message);}
    }), true);
    eq('Muntin link помечается stale при новой Shape revision', await t.p.evaluate(() => {
      DB.muntinDef=[{id:'M-X',name:'Grid',shapeId:'S-X',shapeRevision:1}];return /stale/.test(salesLineMuntinCell({shapeRef:{id:'S-X',revision:2},muntinRef:{id:'M-X'}},0));
    }), true);
    await t.c.close();

    /* --- ловушки Этапа 3C: молчаливая потеря работы и перевёрнутые размеры --- */
    t = await page();
    eq('пустой черновик закрывается без вопроса, черновик со строками — спрашивает', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();
      const emptyAsks=salesDraftHasWork();
      salesOrderAddLine();
      return {emptyAsks,withLineAsks:salesDraftHasWork()};
    }), {emptyAsks:false,withLineAsks:true});
    eq('строка без размеров не даёт сохранить заказ', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();
      DB.customer.push({id:'CUS-T',code:'C-1',legalName:'T',displayName:'T',status:'active',contacts:[],addresses:[]});
      soDraft.customerId='CUS-T';salesOrderAddLine();
      salesOrderSave();
      const blocked=DB.salesOrder.length===0;
      soDraft.lines[0].width16=48*16;soDraft.lines[0].height16=36*16;salesOrderSave();
      return {blocked,savedAfterSize:DB.salesOrder.length===1};
    }), {blocked:true,savedAfterSize:true});
    eq('Excel-вставка кладёт ширину в ширину, а не в высоту', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();
      document.getElementById('salesExcelText').value='2\t30\t80\tA1';
      soExcelMode='current';salesExcelApply();
      const l=soDraft.lines[soDraft.lines.length-1];
      return {qty:l.qty,w:l.width16,h:l.height16};
    }), {qty:2,w:30*16,h:80*16});
    eq('подсказка Excel совпадает с порядком колонок таблицы', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesExcelSetMode('current');
      return document.getElementById('salesExcelCols').textContent;
    }), 'Qty | Width | Height | Mark');
    await t.c.close();

    t = await page();
    eq('Sales bridge использует существующие Shape и Muntin configurators', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesOrderAddLine();soDraft.lines[0].width16=48*16;soDraft.lines[0].height16=36*16;
      salesOrderConfigureShape(0);saveShape();const shapeId=soDraft.lines[0].shapeRef.id,backFromShape=tab==='sales'&&!!shapeId;
      salesOrderConfigureMuntin(0);saveMuntin();const muntinId=soDraft.lines[0].muntinRef.id,backFromMuntin=tab==='sales'&&!!muntinId;
      return {backFromShape,backFromMuntin,shapeIdMatch:DB.muntinDef.find(m=>m.id===muntinId).shapeId===shapeId};
    }), {backFromShape:true,backFromMuntin:true,shapeIdMatch:true});
    eq('Shape edge allowance берёт толщину из выбранного Sales Makeup', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesOrderAddLine();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      m.panes.forEach(p=>{p.glassProductId='';p.thicknessMm=12;});
      salesOrderConfigureShape(0);const th12=sDraft.thickness,allow12=shapePolishAllowance(+sDraft.thickness);
      salesBridgeCancel('shape');m.panes.forEach(p=>{p.glassProductId='';p.thicknessMm=10;});
      salesOrderConfigureShape(0);const th10=sDraft.thickness,allow10=shapePolishAllowance(+sDraft.thickness);
      salesBridgeCancel('shape');
      if(m.panes.length<2)m.panes.push(salesDefaultPane(1));m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;m.panes[1].glassProductId='';m.panes[1].thicknessMm=12;
      salesOrderConfigureShape(0);sDraft.edgeOps.A=[shapeNormalizeOp({type:'Flat Polish'})];const mixed=ShapeModule.compute(sDraft);
      return {th12,allow12,th10,allow10,mixedThickness:sDraft.thickness,mixedValid:mixed.valid,mixedError:(mixed.errors||[]).join(' | ')};
    }), {th12:'12',allow12:3/16,th10:'10',allow10:1/8,mixedThickness:'',mixedValid:false,mixedError:'Glass thickness for edge-processing allowance must come from the selected Sales Makeup.'});
    await t.c.close();
  }

  /* --- 5e. Каталог стекла и точки поставки (порция 5·3) -------------
     511 позиций каталога лежали в templates/GLASS_PRODUCTS.csv и в систему не
     попадали: схема кода их не держала. Здесь проверяется, что каталог заехал
     целиком, что закалка стала гейтом, а поставка — отдельной таблицей. */
  {
    console.log('Каталог стекла / поставки');
    let t = await page();
    eq('каталог заехал целиком и без дублей', await t.p.evaluate(() => [
      DB.glassProduct.length,
      new Set(DB.glassProduct.map(p => p.id)).size,
      new Set(DB.glassProduct.map(p => p.code.toUpperCase())).size,
      DB.glassSheet.length
    ]), [511, 511, 511, 0]);

    /* Два жёстких гейта. Q/VT обязано пройти печь, E без VT в печь пускать
       нельзя — на складе это два РАЗНЫХ товара, а не два написания одного. */
    eq('закалка стала гейтом, а не справкой', await t.p.evaluate(() => {
      const e = glassProductByCode('6SBN60'), vt = glassProductByCode('6SBN60VT');
      return [e.temperMode, glassBannedFromFurnace(e), vt.temperMode, glassNeedsFurnace(vt),
              e.id === vt.id, DB.glassProduct.filter(p => p.temperMode === 'annealed_only').length];
    }), ['annealed_only', true, 'temper_required', true, false, 10]);

    eq('колонки каталога доехали до записи', await t.p.evaluate(() => {
      const g = glassProductByCode('3COMFORTSELECT73');
      return [g.substrate, g.coatingFamily, g.deposition, g.exposureRule, g.allowedSurfaces,
              g.temperMode, g.optics.tvis, g.optics.coatedSide, g.origin.igdbSource,
              g.stockingUnit, g.salesUnit];
    }), ['clear', 'lowe', 'sputtered', 'cavity_only', [2, 3], 'temperable', 0.815568, 1, 'IGDB v89.0', 'sqft', 'sqft']);

    /* Позиция без галочки склада из выбора НЕ выпадает: её берут по предзаказу.
       Выпадает только снятая с производства. */
    eq('нет на складе — не значит нельзя выбрать', await t.p.evaluate(() => {
      const g = glassProductByCode('3COMFORTSELECT73');
      const before = activeGlassProducts().length;
      const lam = glassProductByCode('6LAM015');
      DB.glassProduct.find(p => p.code === '6LAM015').active = false;
      return [glassIsPreorder(g), activeGlassProducts().some(p => p.id === g.id),
              lam.stocked, before - activeGlassProducts().length];
    }), [true, true, true, 1]);
    await t.c.close();

    /* Единица — три разных вопроса (закупка, хранение, продажа) плюс
       калькуляция: площадь, длина или штуки. */
    t = await page();
    eq('единицы знают, как из детали получается количество', await t.p.evaluate(() => [
      mdUnitCalc('sqft'), mdUnitCalc('inch'), mdUnitCalc('sheet'),
      mdUnitCode('ft2'), mdUnitCode('SQ FT'), mdUnitCode('щепотка', '')
    ]), ['area', 'linear', 'flat', 'sqft', 'sqft', '']);

    eq('прежняя схема продукта читается, а не теряется', await t.p.evaluate(() => [
      normalizeGlassProduct({ id: 'X', name: 'n', family: 'lowe' }).coatingFamily,
      normalizeGlassProduct({ id: 'X', name: 'n', availability: 'inactive' }).active
    ]), ['lowe', false]);

    /* Слияние ПО КОДУ: чужой файл обновляет свои строки и добавляет новые,
       а остальной каталог остаётся на месте и перечисляется в отчёте. */
    eq('импорт каталога сливает по коду и не теряет оптику', await t.p.evaluate(() => {
      const csv = 'manufacturer,code,name,substrate,coating_family,thickness_mm,temper_mode,exposure_rule,stocked\n' +
        'Vitro,6CLEAR,Clear 6mm цеховое имя,clear,uncoated,6,,any,YES\n' +
        'Trulite,6TRU-CLR,Trulite Clear 6mm,clear,uncoated,6,TEMPERED,any,YES\n';
      const rep = importGlassProductsCsv(csv), g = glassProductByCode('6CLEAR');
      return [rep.accepted, rep.added, rep.updated, rep.rejected.length, rep.missing.length,
              DB.glassProduct.length, g.id, g.name, g.origin.igdbSource.slice(0, 4),
              glassNeedsFurnace(glassProductByCode('6TRU-CLR'))];
    }), [2, 1, 1, 0, 510, 512, 'GL-6CLEAR', 'Clear 6mm цеховое имя', 'IGDB', true]);
    await t.c.close();

    /* Отчёт объясняет каждую отклонённую строку номером и причиной: строка,
       которую отклонили без причины, возвращается пользователю загадкой. */
    t = await page();
    eq('каждая отклонённая строка объяснена', await t.p.evaluate(() => {
      const csv = 'manufacturer,code,name,substrate,coating_family,thickness_mm,temper_mode,allowed_surfaces\n' +
        'Vitro,,Без кода,clear,uncoated,6,,\n' +
        'Vitro,6BAD!,Плохой код,clear,uncoated,6,,\n' +
        'Vitro,6THICK,Толстое,clear,uncoated,25,,\n' +
        'Vitro,6SUB,Подложка,стекло,uncoated,6,,\n' +
        'Vitro,6TEMP,Закалка,clear,uncoated,6,МОЖЕТ БЫТЬ,\n' +
        'Vitro,6SURF,Поверхности,clear,uncoated,6,,9\n' +
        'Vitro,6GOOD,Хорошая строка,clear,uncoated,6,,\n';
      const rep = importGlassProductsCsv(csv);
      return [rep.accepted, rep.rejected.length,
              rep.rejected.filter(r => !r.line || !r.why).length,
              rep.rejected.map(r => r.why.split(':')[0])];
    }), [1, 6, 0, ['пустой код', 'код', 'толщина вне диапазона 3–19 мм', 'substrate', 'temper_mode', 'allowed_surfaces']]);
    await t.c.close();

    /* Продукт и поставка — разные таблицы: валюта принадлежит ТОЧКЕ ПОСТАВКИ.
       Один и тот же 6CLEAR из Vitro Barrie идёт в CAD, из Vitro USA — в USD. */
    t = await page();
    const SHEETS = 'code,thickness_mm,supplier,currency,sheet_w_in,sheet_h_in,purchase_unit,purchase_price,price_date,freight_pct,lead_time_days,availability\n' +
      '6CLEAR,6,Vitro Barrie,CAD,130,96,sqft,1.00,2026-08-22,0,10,stock\n' +
      '6CLEAR,6,Vitro USA,USD,144,96,sqft,1.00,2026-08-22,0,15,order\n';
    eq('одна позиция — две точки поставки со своими валютами', await t.p.evaluate(csv => {
      const rep = importGlassSheetsCsv(csv), rows = glassSheetsFor('6CLEAR');
      return [rep.accepted, rep.added, rep.rejected.length, rows.length,
              rows.map(s => s.supplier + ' ' + s.currency).sort(),
              [rows[0].sheetWIn, rows[0].sheetHIn, rows[0].purchaseUnit, rows[0].purchasePrice],
              glassLeadTimeDays('6CLEAR'), glassProductByCode('6CLEAR').availability === undefined];
    }, SHEETS), [2, 2, 0, 2, ['Vitro Barrie CAD', 'Vitro USA USD'], [130, 96, 'sqft', 1], 10, true]);

    eq('повторная загрузка обновляет, а другой размер листа заводит свою строку', await t.p.evaluate(csv => {
      const again = importGlassSheetsCsv(csv);
      const other = importGlassSheetsCsv('code,supplier,currency,sheet_w_in,sheet_h_in,purchase_unit,purchase_price,lead_time_days,availability\n' +
        '6CLEAR,Vitro Barrie,CAD,96,48,sqft,1.20,10,stock\n');
      return [again.added, again.updated, other.added, glassSheetsFor('6CLEAR').length];
    }, SHEETS), [0, 2, 1, 3]);

    /* Цена, привязанная к продукту, которого нет, тихо ляжет в себестоимость —
       поэтому строка на неизвестный код отклоняется. А вот переименование кода
       пользователем цену НЕ уносит: строка остаётся видимой сиротой. */
    eq('цена без продукта не заводится, а переименование её не съедает', await t.p.evaluate(() => {
      const bad = importGlassSheetsCsv('code,thickness_mm,supplier,currency,purchase_unit,purchase_price,price_date,lead_time_days,availability\n' +
        '6НЕТУ,6,Vitro Barrie,CAD,sqft,1.00,2026-08-22,10,stock\n' +
        '6CLEAR,8,Vitro Barrie,CAD,sqft,1.00,2026-08-22,10,stock\n' +
        '6CLEAR,6,Vitro Barrie,CADD,sqft,1.00,2026-08-22,10,stock\n' +
        '6CLEAR,6,Vitro Barrie,CAD,щепотка,1.00,2026-08-22,10,stock\n' +
        '6CLEAR,6,Vitro Barrie,CAD,sqft,1.00,22.08.2026,10,stock\n');
      const before = DB.glassSheet.length;
      DB.glassProduct.find(p => p.code === '6CLEAR').code = '6CL-ЦЕХ';
      normalizeMasterData();
      return [bad.accepted, bad.rejected.length, bad.rejected[0].why.indexOf('нет в каталоге') > 0,
              DB.glassSheet.length === before, glassOrphanSheets().length];
    }), [0, 5, true, true, 3]);
    await t.c.close();

    /* Конфигуратор — то место, где 511 позиций видно пользователю. */
    t = await page();
    eq('конфигуратор выбирает из настоящего каталога', await t.p.evaluate(() => {
      const pane = normalizeSalesPane({ category: 'vision', manufacturer: 'Vitro', thicknessMm: 6, visionType: 'lowe' }, 0);
      const rows = salesGlassCandidates(pane), th = salesThicknessesFor({ manufacturer: 'Vitro' });
      return [salesManufacturers(), rows.length > 0,
              rows.filter(g => g.coatingFamily !== 'lowe' || g.thicknessMm !== 6 || g.manufacturer !== 'Vitro').length,
              Math.min(...th), Math.max(...th)];
    }), [['Cardinal', 'Pilkington', 'Vitro', 'Woodbridge'], true, 0, 3, 19]);

    eq('дубль позиции каталога виден при импорте JSON, а не после него', await t.p.evaluate(() => {
      const dump = JSON.parse(JSON.stringify(DB));
      dump.glassProduct.push(JSON.parse(JSON.stringify(dump.glassProduct[0])));
      try { prepareImportedState(dump); return 'принято'; }
      catch (e) { return [e.message.indexOf('Glass products') === 0, /[А-Яа-яЁё]/.test(e.message)]; }
    }), [true, false]);
    await t.c.close();
  }

  /* --- 5f. Экран Master Data и выбор стекла (порция 5·3, пункты 4–5) ---
     Каталог собран скриптом из чужой выгрузки, и первое, что с ним придётся
     сделать, — дописать своего поставщика и переименовать чужие коды в цеховые.
     Без экрана это Excel, пересборка каталога и новая заливка ради одной строки. */
  {
    console.log('Master Data / выбор стекла');
    let t = await page();
    eq('каталог показывается страницей, а не целиком', await t.p.evaluate(() => {
      tab = 'masterdata'; subtab = null; mdTab = 'glass'; mdEdit = null;
      mdSearch = ''; mdMfr = ''; mdThick = ''; mdCoating = ''; mdStatus = 'all';
      render();
      return [document.querySelectorAll('#app tbody tr').length, DB.glassProduct.length];
    }), [60, 511]);

    /* Поиск идёт по подстроке: 6SBN60VT попадает и в цветные версии того же
       покрытия — ровно то поведение, которое нужно продавцу. */
    eq('фильтры сужают выбор', await t.p.evaluate(() => {
      mdMfr = 'Woodbridge'; const a = mdVisibleProducts().length;
      mdMfr = ''; mdCoating = 'reflective'; const b = mdVisibleProducts().length;
      mdCoating = ''; mdThick = '19'; const c = mdVisibleProducts().length;
      mdThick = ''; mdStatus = 'stocked'; const d = mdVisibleProducts().length;
      mdStatus = 'all'; mdSearch = '6sbn60vt'; const e = mdVisibleProducts().length;
      mdSearch = ''; render();
      return [a, b, c, d, e];
    }), [3, 51, 4, 53, 12]);
    await t.c.close();

    t = await page();
    eq('новая позиция заводится через форму', await t.p.evaluate(() => {
      tab = 'masterdata'; mdTab = 'glass'; mdGlassNew();
      const set = (id, v) => { document.getElementById(id).value = v; };
      set('md_code', '6TRU-CLR'); set('md_name', 'Trulite Clear 6mm'); set('md_mfr', 'Trulite');
      set('md_thick', '6'); set('md_actual', '5.7'); set('md_substrate', 'clear');
      set('md_coating', 'uncoated'); set('md_temper', 'temper_required'); set('md_exposure', 'any');
      set('md_stockunit', 'sheet'); set('md_salesunit', 'sqft');
      document.getElementById('md_stocked').checked = true;
      mdGlassSave();
      const p = glassProductByCode('6TRU-CLR');
      return [DB.glassProduct.length, mdEdit, p.id, p.thicknessMm, p.stockingUnit, p.stocked, glassNeedsFurnace(p)];
    }), [512, null, 'GL-6TRU-CLR', 6, 'sheet', true, true]);

    eq('дубль кода, негодная толщина и поверхность вне 1–8 не сохраняются', await t.p.evaluate(() => {
      const set = (id, v) => { document.getElementById(id).value = v; };
      const err = () => document.getElementById('e_mdGlass').textContent.length > 0;
      mdGlassNew();
      set('md_code', '6TRU-CLR'); set('md_name', 'Дубль'); set('md_thick', '6');
      mdGlassSave(); const dup = [DB.glassProduct.length, err()];
      set('md_code', '6TRU-THICK'); set('md_thick', '25');
      mdGlassSave(); const thick = [DB.glassProduct.length, err()];
      set('md_thick', '6'); set('md_surfaces', '9');
      mdGlassSave(); const surf = [DB.glassProduct.length, err()];
      mdEdit = null; mdDraft = null; render();
      return [dup, thick, surf];
    }), [[512, true], [512, true], [512, true]]);
    await t.c.close();

    /* То, ради чего экран и нужен в первую очередь: девять позиций 6BIRDSMART
       пользователь переписывает в свои цеховые коды. Ссылки из сохранённых
       Makeup держатся на идентификаторе и обязаны пережить переименование. */
    t = await page();
    eq('переименование кода сохраняет идентификатор', await t.p.evaluate(() => {
      tab = 'masterdata'; mdTab = 'glass';
      const src = DB.glassProduct.find(p => p.code.indexOf('6BIRDSMART') === 0), id = src.id;
      mdGlassEdit(id);
      const set = (i, v) => { document.getElementById(i).value = v; };
      set('md_code', '6BS-70C'); set('md_name', src.name); set('md_thick', String(src.thicknessMm));
      mdGlassSave();
      const after = glassProductById(id);
      return [DB.glassProduct.length, after.code, after.id === id, glassProductByCode('6BS-70C').id === id];
    }), [511, '6BS-70C', true, true]);

    /* Позицию, которая стоит в Makeup, удалять нельзя: старый заказ показал бы
       `?` вместо кода стекла. Вместо удаления — обратимая пометка «снята». */
    eq('позицию из Makeup удалить нельзя — только снять с производства', await t.p.evaluate(() => {
      const id = DB.glassProduct[0].id;
      DB.salesOrder.push({ id: 'SO-X', makeups: [{ id: 'MU-X', panes: [{ glassProductId: id }] }], lines: [] });
      mdGlassDelete(id);
      const kept = !!glassProductById(id);
      mdGlassToggle(id);
      const off = [glassProductById(id).active, activeGlassProducts().some(p => p.id === id)];
      mdGlassToggle(id);
      return [kept, off[0], off[1], glassProductById(id).active];
    }), [true, false, false, true]);

    eq('свободную позицию удалить можно', await t.p.evaluate(() => {
      const id = DB.glassProduct[3].id, n = DB.glassProduct.length;
      mdGlassDelete(id);
      return [DB.glassProduct.length === n - 1, !glassProductById(id)];
    }), [true, true]);
    await t.c.close();

    t = await page();
    eq('строка поставки заводится через форму', await t.p.evaluate(() => {
      tab = 'masterdata'; mdTab = 'supply'; mdSheetNew();
      const set = (id, v) => { document.getElementById(id).value = v; };
      set('md_sheetCode', '6CLEAR'); set('md_sheetSupplier', 'Vitro Barrie'); set('md_sheetCurrency', 'CAD');
      set('md_sheetW', '130'); set('md_sheetH', '96'); set('md_sheetUnit', 'sqft');
      set('md_sheetPrice', '1.25'); set('md_sheetDate', '2026-08-22'); set('md_sheetLead', '10');
      set('md_sheetAvail', 'stock');
      mdSheetSave();
      const s = DB.glassSheet[0];
      return [DB.glassSheet.length, s.productCode, s.currency, s.sheetWIn, s.purchasePrice,
              glassLeadTimeDays('6CLEAR'), mdUnitCalc(s.purchaseUnit)];
    }), [1, '6CLEAR', 'CAD', 130, 1.25, 10, 'area']);

    eq('та же точка с тем же листом не удваивается, другой формат листа заводится', await t.p.evaluate(() => {
      const set = (id, v) => { document.getElementById(id).value = v; };
      mdSheetNew();
      set('md_sheetCode', '6CLEAR'); set('md_sheetSupplier', 'Vitro Barrie'); set('md_sheetCurrency', 'CAD');
      set('md_sheetW', '130'); set('md_sheetH', '96'); set('md_sheetPrice', '9.99');
      mdSheetSave();
      const blocked = [DB.glassSheet.length, document.getElementById('e_mdSheet').textContent.length > 0];
      set('md_sheetW', '96'); set('md_sheetH', '48');
      mdSheetSave();
      return blocked.concat([DB.glassSheet.length, glassSheetsFor('6CLEAR').length]);
    }), [1, true, 2, 2]);

    eq('половина размера листа, кривая дата и кривая валюта не сохраняются', await t.p.evaluate(() => {
      const set = (id, v) => { document.getElementById(id).value = v; };
      const err = () => document.getElementById('e_mdSheet').textContent.length > 0;
      mdSheetNew();
      set('md_sheetCode', '6CLEAR'); set('md_sheetSupplier', 'Vitro USA'); set('md_sheetCurrency', 'USD');
      set('md_sheetW', '144'); set('md_sheetH', '');
      mdSheetSave(); const half = [DB.glassSheet.length, err()];
      set('md_sheetH', '96'); set('md_sheetDate', '22.08.2026');
      mdSheetSave(); const date = [DB.glassSheet.length, err()];
      set('md_sheetDate', '2026-08-22'); set('md_sheetCurrency', 'CADD');
      mdSheetSave(); const cur = [DB.glassSheet.length, err()];
      mdSheetEdit = null; mdSheetDraft = null; render();
      return [half, date, cur];
    }), [[2, true], [2, true], [2, true]]);

    eq('обзор базы считает все коллекции', await t.p.evaluate(() => {
      mdTab = 'overview'; render();
      const html = document.getElementById('app').innerHTML;
      return [html.indexOf('glassProduct') > 0, html.indexOf('glassSheet') > 0, html.indexOf('salesOrder') > 0,
              MD_COLLECTIONS.filter(c => !Array.isArray(DB[c.key])).length];
    }), [true, true, true, 0]);
    await t.c.close();

    /* Пункт 5. Выбор не блокируется: позиция, которой у нас нет, помечается
       «по предзаказу» и остаётся выбираемой — с этого пользователь начал. */
    t = await page();
    eq('в списке выбора позиция без склада помечена, но остаётся', await t.p.evaluate(() => {
      const pre = DB.glassProduct.find(p => !p.stocked);
      const opts = salesGlassProductOptions([pre], '');
      return [opts.indexOf(glassLabel('stock', 'preorder')) > 0, opts.indexOf(pre.id) > 0];
    }), [true, true]);

    eq('под селектом видно подложку, покрытие и оба гейта закалки', await t.p.evaluate(() => {
      const vt = glassProductByCode('6SBN60VT'), e = glassProductByCode('6SBN60'), st = glassProductByCode('6CLEAR');
      const a = salesGlassMeta(vt), b = salesGlassMeta(e), c = salesGlassMeta(st);
      return [a.indexOf(glassLabel('substrate', vt.substrate)) > 0,
              a.indexOf(glassLabel('coatingFamily', vt.coatingFamily)) > 0,
              a.indexOf(glassLabel('temperMode', 'temper_required')) > 0,
              b.indexOf(glassLabel('temperMode', 'annealed_only')) > 0,
              c.indexOf(glassLabel('stock', 'stocked')) > 0,
              salesGlassMeta(glassProductByCode('3COMFORTSELECT73')).indexOf(glassLabel('stock', 'preorder')) > 0,
              salesGlassMeta(null)];
    }), [true, true, true, true, true, true, '']);

    eq('срок поставки показывается только тому, чего нет на складе', await t.p.evaluate(() => {
      const pre = DB.glassProduct.find(p => !p.stocked);
      DB.glassSheet.push(normalizeGlassSheet({ productCode: pre.code, supplier: 'Vitro Barrie', leadTimeDays: 12, availability: 'order' }));
      DB.glassSheet.push(normalizeGlassSheet({ productCode: '6CLEAR', supplier: 'Vitro Barrie', leadTimeDays: 9, availability: 'stock' }));
      return [salesGlassMeta(pre).indexOf('12 d') > 0, salesGlassMeta(glassProductByCode('6CLEAR')).indexOf('9 d') > 0];
    }), [true, false]);

    /* Доменные термины не ходят через словарь интерфейса: обе колонки лежат
       рядом с данными, и язык выбирает нужную. */
    eq('термины каталога приезжают на языке интерфейса, а не через словарь', await t.p.evaluate(() => {
      const read = () => [glassLabel('substrate', 'low_iron'), glassLabel('temperMode', 'annealed_only'),
                          glassLabel('stock', 'preorder'), mdUnitName('sqft')];
      LANG = 'ru'; const ru = read();
      LANG = 'en'; const en = read();
      return [ru.some(v => /[А-Яа-яЁё]/.test(v)), en.some(v => /[А-Яа-яЁё]/.test(v)), en[3]];
    }), [true, false, 'sq ft']);
    await t.c.close();
  }

  /* --- 5g. Два шага выбора: покрытие → на каком стекле ------------------
     Каталог держит одну строку на пару «покрытие × базовое стекло», и Vitro
     6 мм Low-E — это 92 строки. Одним списком их выбирать нельзя; у самого
     поставщика тот же выбор сделан двумя шагами, и здесь так же. */
  {
    console.log('Покрытие → базовое стекло');
    let t = await page();

    /* Отдельных колонок под покрытие и базу в выгрузке нет — разбирается имя,
       по тем правилам, по которым имена и написаны. */
    eq('имя каталога разбирается на покрытие и базовое стекло', await t.p.evaluate(() => {
      const parts = code => { const p = glassProductByCode(code); return [glassCoatingName(p), glassBaseName(p)]; };
      return [parts('6SBN60VT-ACU'), parts('6SBN70-OBL'), parts('6Q180'),
              parts('6ECLIPSEADVANTAGEPARC'), parts('6ECLIPSEADVANTAGEARCT')];
    }), [['Solarban 60', 'Acuity'], ['Solarban 70', 'Optiblue (Solarban z75)'], ['LoE 180', 'Clear'],
         ['Eclipse Advantage +', 'Arctic Blue'], ['Eclipse Advantage', 'Arctic Blue']]);

    eq('92 позиции Vitro 6 мм Low-E стали 15 покрытиями', await t.p.evaluate(() => {
      const pane = { manufacturer: 'Vitro', thicknessMm: 6, visionType: 'lowe', glassProductId: '' };
      return [salesGlassCandidates(pane).length, salesGlassCoatings(pane).length,
              salesGlassVariants(pane, 'Solarban 60').length];
    }), [92, 15, 13]);

    /* «Solarban 60 on Clear» заведена и закаливаемой, и незакаливаемой — в
       списке вариантов это обязано быть видно, иначе две одинаковые строки. */
    eq('пара по закалке различима в списке вариантов', await t.p.evaluate(() => {
      const pane = { manufacturer: 'Vitro', thicknessMm: 6, visionType: 'lowe', glassProductId: '' };
      const rows = salesGlassVariants(pane, 'Solarban 60').filter(g => glassBaseName(g) === 'Clear');
      const labels = rows.map(salesGlassVariantLabel).sort();
      return [rows.length, labels[0] !== labels[1],
              labels.join(' | ').indexOf(glassLabel('temperMode', 'temper_required')) >= 0];
    }), [2, true, true]);

    /* Короткий код остаётся в шапке Lite и в коде makeup; в подписи выбора его
       нет — там он только мешал читать имя. */
    eq('короткого кода в подписи выбора нет', await t.p.evaluate(() => {
      const labels = html => [...html.matchAll(/>([^<>]*)<\/option>/g)].map(m => m[1]).join(' | ');
      const pane = { manufacturer: 'Vitro', thicknessMm: 6, visionType: 'lowe', glassProductId: '' };
      const coated = labels(salesGlassVariantOptions(salesGlassVariants(pane, 'Solarban 60'), ''));
      const plain = labels(salesGlassProductOptions(salesGlassCandidates({ manufacturer: 'Vitro', thicknessMm: 6, visionType: 'uncoated' }), ''));
      return [coated.indexOf('6SBN60') < 0, plain.indexOf('6CLEAR') < 0, coated.indexOf('Acuity') > 0];
    }), [true, true, true]);
    await t.c.close();

    /* Шаг покрытия есть только у покрытого стекла: у непокрытого он был бы
       пустой формальностью — там выбирают само стекло. */
    t = await page();
    eq('шаг покрытия появляется только у покрытого стекла', await t.p.evaluate(() => {
      tab = 'sales'; subtab = null; render(); salesOrderNew();
      const p = salesCurrentMakeup().panes[0];
      p.category = 'vision'; p.manufacturer = 'Vitro'; p.thicknessMm = 6; p.visionType = 'lowe';
      p.glassProductId = glassProductByCode('6SBN60VT-ACU').id;
      const coated = salesVisionFieldsSafe(p, 0);
      p.visionType = 'uncoated'; p.glassProductId = glassProductByCode('6CLEAR').id;
      const plain = salesVisionFieldsSafe(p, 0);
      return [coated.indexOf('Select Coating') > 0, coated.indexOf('On Glass') > 0,
              plain.indexOf('Select Coating') < 0, plain.indexOf('>Glass<') > 0];
    }), [true, true, true, true]);

    /* Смена покрытия переносит базовое стекло: человек выбрал Azuria и на
       новом покрытии ждёт ту же Azuria, а не первую строку списка. */
    eq('смена покрытия в интерфейсе переносит базовое стекло', await t.p.evaluate(() => {
      tab = 'sales'; subtab = null; render(); salesOrderNew();
      const p = salesCurrentMakeup().panes[0];
      p.category = 'vision'; p.manufacturer = 'Vitro'; p.thicknessMm = 6; p.visionType = 'lowe';
      salesPaneSetProduct(0, glassProductByCode('6SBN60VT-AZ').id);
      soOpenSectionKey = 'lite-0'; render();
      const before = glassProductById(salesCurrentMakeup().panes[0].glassProductId).code;
      const sel = document.querySelectorAll('.mu-coating-grid select')[0];
      sel.value = 'Solarban 90';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const after = glassProductById(salesCurrentMakeup().panes[0].glassProductId);
      return [before, after.code, glassBaseName(after)];
    }), ['6SBN60VT-AZ', '6SBN90-AZ', 'Azuria']);

    /* `allowed_surfaces` каталога наконец доехало до кнопок: напыление живёт
       на #2 снаружи. Но выбор не запирается — вторая кнопка нажимаема. */
    eq('напыление ставится на #2, а несходящийся каталог ничего не запирает', await t.p.evaluate(() => {
      const p = salesCurrentMakeup().panes[0];
      p.visionType = 'lowe'; p.coatingSurface = 1;
      salesPaneSetProduct(0, glassProductByCode('6SBN60VT-ACU').id);
      const html = salesCoatingSurfaceSelector(p, 0);
      const inner = DB.glassProduct.find(g => g.exposureRule === 'interior_only' && g.thicknessMm === 6);
      p.manufacturer = inner.manufacturer;
      salesPaneSetProduct(0, inner.id);
      const free = salesCoatingSurfaceSelector(p, 0);
      return [p.coatingSurface === 2 || salesAllowedCoatingSurfaces(p, 0).join() === '1,2',
              html.indexOf('default #2') > 0, html.indexOf('off-catalog') > 0,
              inner.allowedSurfaces, free.indexOf('off-catalog') < 0];
    }), [true, true, true, [4], true]);
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
    for (const tab of ['dashboard', 'users', 'customers', 'sales', 'configurators', 'optimization', 'production', 'masterdata']) {
      const left = await t.p.evaluate(tb => {
        tab = tb; subtab = null; render();
        const out = new Set(), w = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
        let n; while (n = w.nextNode()) { const v = n.nodeValue.trim(); if (/[А-Яа-яЁё]/.test(v)) out.add(v); }
        return [...out];
      }, tab);
      eq('EN без русского остатка: ' + tab, left, []);
    }
    eq('Sales Services pricing modals EN без русского остатка', await t.p.evaluate(() => {
      function cyrillicUi(){const out=new Set(),root=document.getElementById('app'),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const p=n.parentElement;if(!p||p.closest('[data-raw]'))continue;const v=n.nodeValue.trim();if(/[А-Яа-яЁё]/.test(v))out.add(v);}return [...out];}
      const sh=newShapeDef('rectangle');sh.id='qa-price-en';sh.w='20';sh.h='40';sh.edgeOps.A=[shapeNormalizeOp({type:'Mitering',angle:45,side:'front'})];sh.manufacturingItems=[shapeNormalizeManufacturingItem({id:'qa-en-h',type:'hinge',edge:'left',distance:5})];DB.shapeDef=[normalizeShapeDef(sh)];soDraft=newSalesOrderDraft();const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;soDraft.lines=[normalizeSalesOrderLine({makeupId:m.id,qty:1,width16:320,height16:640,shapeRef:salesShapeRefFrom(DB.shapeDef[0])})];soEdit='new';tab='sales';subtab='orders';salesOpenOrderServices();const orderLeft=cyrillicUi();salesCloseServices();salesOpenLineServices(soDraft.lines[0].id);const lineLeft=cyrillicUi();salesCloseServices();soEdit=null;soDraft=null;render();return orderLeft.concat(lineLeft);
    }), []);
    eq('Production Shape editor EN без русского остатка', await t.p.evaluate(() => {
      function cyrillicUi(){
        const out=new Set(),root=document.getElementById('app'),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
        while(n=w.nextNode()){const p=n.parentElement;if(!p||p.closest('[data-raw]'))continue;const v=n.nodeValue.trim();if(/[А-Яа-яЁё]/.test(v))out.add(v);}
        root.querySelectorAll('[placeholder],[title]').forEach(el=>{if(el.closest('[data-raw]'))return;['placeholder','title'].forEach(a=>{const v=el.getAttribute(a)||'';if(/[А-Яа-яЁё]/.test(v))out.add(a+': '+v);});});
        return [...out];
      }
      tab='configurators';subtab='shape';openShapeNew('smart');
      sDraft.smart.corners.tl='single';const S=shapeDraftLine();ssSyncExtra(S);sDraft.smart=S.shape.smart;sEdgeworkOpen=true;sFeaturesOpen=true;sManufacturingOpen=true;
      sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'qa-hole',type:'hole',x:.5,y:.5,diameter:'3/4',hRef:'left',vRef:'bottom'}),shapeNormalizeManufacturingItem({id:'qa-clamp',type:'clamp',edge:'right',distance:.5}),shapeNormalizeManufacturingItem({id:'qa-hinge',type:'hinge',edge:'bottom',distance:.5})];sManufacturingSelected='qa-hole';render();
      const left=cyrillicUi();sEdit=null;sDraft=null;sEdgeworkOpen=false;sFeaturesOpen=false;sManufacturingOpen=true;sManufacturingSelected=null;render();return left;
    }), []);
    eq('Production Shape DXF editor EN без русского остатка', await t.p.evaluate(() => {
      function cyrillicUi(){
        const out=new Set(),root=document.getElementById('app'),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
        while(n=w.nextNode()){const p=n.parentElement;if(!p||p.closest('[data-raw]'))continue;const v=n.nodeValue.trim();if(/[А-Яа-яЁё]/.test(v))out.add(v);}
        root.querySelectorAll('[placeholder],[title]').forEach(el=>{if(el.closest('[data-raw]'))return;['placeholder','title'].forEach(a=>{const v=el.getAttribute(a)||'';if(/[А-Яа-яЁё]/.test(v))out.add(a+': '+v);});});
        return [...out];
      }
      tab='configurators';subtab='shape';openShapeNew('rect');
      sDraft.source={kind:'dxf',fileName:'Пользовательский файл.dxf',fileSize:2048,uploadedAt:'2026-08-24T12:00:00.000Z',note:'Примечание владельца',preview:{units:'in',points:[[0,0],[12,0],[12,24],[0,24]],width16:192,height16:384}};
      sDraft.w='12';sDraft.h='24';sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'dx-hole',type:'hole',x:3,y:5,diameter:'1/2',hRef:'left',vRef:'bottom'}),shapeNormalizeManufacturingItem({id:'dx-hinge',type:'hinge',edge:'top',distance:4})];sManufacturingOpen=true;sManufacturingSelected='dx-hinge';sSourceOpen=true;render();const left=cyrillicUi();sEdit=null;sDraft=null;sManufacturingSelected=null;sSourceOpen=false;render();return left;
    }), []);
    eq('Customers EN переводит placeholder поиска', await t.p.evaluate(() => {
      tab='customers';subtab=null;render();const el=document.getElementById('customerSearch');return el&&el.getAttribute('placeholder');
    }), 'Search by code, name, contact, phone, email…');
    /* Ошибки импорта больше не переводятся на лету: они написаны по-английски
       в самом источнике. Словарь для них удалён вместе с ветками tx(). */
    eq('ошибки импорта клиентов приходят уже по-английски', await t.p.evaluate(() => {
      const out={};
      try{validateCustomerImportList([{legalName:''}]);}catch(e){out.missing=e.message;}
      try{validateCustomerImportList([{legalName:'A',code:'A-100'},{legalName:'B',code:'A-100'}]);}catch(e){out.dup=e.message;}
      try{validateCustomersPayload({customer:[{contacts:1}]});}catch(e){out.contacts=e.message;}
      return out;
    }), {
      missing:'Customer row 1: Name is required.',
      dup:'The import file contains duplicate Account "A-100".',
      contacts:'Customer 1: contacts must be an array.'
    });
    eq('данные пользователя не переводятся', await t.p.evaluate(() => {
      DB.user.push({ name: 'Закалка', role: 'Цех', workPosition: '', skills: [] });
      tab = 'users'; subtab = 'list'; render();
      return [...document.querySelectorAll('tbody tr td b')].map(e => e.textContent).pop();
    }), 'Закалка');
    await t.c.close();

    /* Имя рабочего места больше не переводится словарём: пользователь заполнил
       в CSV обе колонки, и язык выбирает нужную. Словарь трогает только
       примечания — их пользователь написал в одном языке. */
    const seeded=JSON.stringify({user:[{name:'Alex',role:'Цех',workPosition:'CUT1',skills:[]}]});
    const u = await page(seeded);
    eq('имя рабочего места берётся из колонки nameEn, а не из словаря', await u.p.evaluate(() => {
      setLang('en');tab='users';subtab='list';render();return document.querySelector('tbody tr td:nth-child(3)').textContent.trim();
    }), 'CUT1 — Cutting 1');
    eq('в русском интерфейсе то же место названо по-русски', await u.p.evaluate(() => {
      setLang('ru');tab='users';subtab='list';render();return document.querySelector('tbody tr td:nth-child(3)').textContent.trim();
    }), 'CUT1 — Резка 1');
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
