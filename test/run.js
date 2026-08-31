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
    /* Угловой блок ДОСТРАИВАЕТСЯ снаружи, а не вырезается: длины рёбер вводятся
       от края до края, поэтому стояк 4 идёт сверх левого ребра 36 и панель
       становится 48 × 40. Так же в Smart-Shape: там правая сторона 60, а нотч
       под ней добавляет ещё 4-1/8 и 1/8. */
    eq('угловой блок 4×4 достраивается снаружи: 6 точек, 48 × 40', { pts: corner.pts, area: corner.area }, { pts: 6, area: 1816 });

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
        tipMoved: JSON.stringify(flat.points) !== JSON.stringify(skew.points),
        tooBigRejected: !tooBig.valid, noDirRejected: !noDir.valid };
    });
    eq('скос ребра нотча не рвёт контур и не двигает габарит',
      { flat: notchSkew.flatValid, skew: notchSkew.skewValid, gaps: notchSkew.gaps, box: notchSkew.sameBox, w: notchSkew.w, h: notchSkew.h },
      { flat: true, skew: true, gaps: 0, box: true, w: 48, h: 46 });
    /* Площадь здесь не меняется по геометрии: обе соседние вершины лежат на одной
       высоте, и вершина стояка едет параллельно хорде между ними. Проверять надо
       форму — что скос вообще сдвинул точку. */
    eq('скос ребра нотча сдвигает вершину стояка', notchSkew.tipMoved, true);
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
    eq('отклонения TL/TR меняют finished и cutting geometry', {valid:cornerOffsets.valid,tl:cornerOffsets.tl,tr:cornerOffsets.tr}, {valid:true,tl:[2,36],tr:[50,31]});
    ok('отклонения углов попадают в machine payload', cornerOffsets.outer.some(p=>Math.abs(p[0]-2)<1e-9&&Math.abs(p[1]-36)<1e-9));

    const badCornerOffset = await p.evaluate(() => {
      const s={id:'t',name:'t',w:'48',h:'36',smart:ssNormalize({})};
      s.smart.corners.tr='single';
      const S={w:s.w,h:s.h,shape:{type:'smart',smart:s.smart}};ssSyncExtra(S);s.smart=S.shape.smart;
      Object.keys(s.smart.extraEdges).forEach(k=>s.smart.extraEdges[k].len='2');
      s.smart.cornerOffsets.bl.plumb='1';return ShapeModule.compute(s).valid;
    });
    eq('отклонение угла без направления блокируется', badCornerOffset, false);

    /* Верхняя сторона D. Её концы задаёт замыкание контура, поэтому проверяем
       две вещи сразу: излом появляется — и концы при этом НЕ сдвигаются.
       До правки D была прямым отрезком [AT,CT], и ступень на верху задать было
       нечем: из двух горизонтальных сторон управлялась только нижняя. */
    const topElbow = await p.evaluate(() => {
      const rr = v => Math.round(v * 1e6) / 1e6;
      const mk = mode => {
        const s = { id:'t', name:'t', w:'40', h:'40', smart: ssNormalize({}) };
        s.smart.elbowsOn = true;
        s.smart.D.elbow = { to:'4', elbowLen:'10', past:'0', mode };
        const S = { w:s.w, h:s.h, shape:{ type:'smart', smart:s.smart } };
        const G = ssContour(S);
        return { segs: G.segs.filter(x => x.id === 'D').map(x => [[rr(x.p1[0]),rr(x.p1[1])],[rr(x.p2[0]),rr(x.p2[1])]]),
                 AT: G.base.AT.map(rr), CT: G.base.CT.map(rr), valid: ShapeModule.compute(s).valid };
      };
      const up = mk('m1'), down = mk('m3');
      return { up: up.segs, down: down.segs, AT: up.AT, CT: up.CT, valid: up.valid };
    });
    eq('излом верхней стороны даёт ступень', topElbow.up, [[[0,40],[10,44]],[[10,44],[40,40]]]);
    eq('излом верхней стороны вниз — зеркало', topElbow.down, [[[0,40],[10,36]],[[10,36],[40,40]]]);
    eq('излом верхней стороны не двигает её концы', { AT: topElbow.AT, CT: topElbow.CT }, { AT:[0,40], CT:[40,40] });
    ok('форма с изломом верха валидна', topElbow.valid);

    /* Нижняя сторона трогаться не должна: числа сняты до правки. */
    const bottomElbow = await p.evaluate(() => {
      const rr = v => Math.round(v * 1e6) / 1e6;
      const s = { id:'t', name:'t', w:'40', h:'40', smart: ssNormalize({}) };
      s.smart.elbowsOn = true;
      s.smart.B.elbow = { to:'0', elbowLen:'10', past:'4', mode:'m1' };
      const S = { w:s.w, h:s.h, shape:{ type:'smart', smart:s.smart } };
      return ssContour(S).segs.map(x => [x.id, [rr(x.p1[0]),rr(x.p1[1])], [rr(x.p2[0]),rr(x.p2[1])]]);
    });
    eq('излом нижней стороны не изменился', bottomElbow,
      [['A',[0,0],[0,40]],['D',[0,40],[40,44]],['C',[40,44],[40,4]],['B',[40,4],[10,0]],['B',[10,0],[0,0]]]);

    /* Излом без уклона хотя бы с одной стороны раньше молча выбрасывался:
       длина введена, на чертеже ничего, причина нигде не названа. */
    const elbowNoOutage = await p.evaluate(() => {
      const s = { id:'t', name:'t', w:'40', h:'40', smart: ssNormalize({}) };
      s.smart.elbowsOn = true;
      s.smart.B.elbow = { to:'0', elbowLen:'10', past:'0', mode:'m1' };
      const r = ShapeModule.compute(s);
      return { valid: r.valid, msg: (r.errors || []).join(' ') };
    });
    eq('излом без уклона больше не проглатывается', elbowNoOutage.valid, false);
    ok('и причина названа', /at least one side of the elbow/.test(elbowNoOutage.msg), elbowNoOutage.msg);

    /* Сохранённые формы записи D не имеют — она должна достраиваться при чтении,
       не меняя геометрию. */
    const legacyNoD = await p.evaluate(() => {
      const m = ssNormalize({}); delete m.D;
      const r = ShapeModule.compute({ id:'t', name:'t', w:'40', h:'40', smart: m });
      const d = r.definition && r.definition.smart;
      return { valid: r.valid, hasD: !!(d && d.D && d.D.elbow), pts: r.points ? r.points.length : 0 };
    });
    eq('старая модель без D читается и достраивается', { valid: legacyNoD.valid, hasD: legacyNoD.hasD }, { valid:true, hasD:true });
    eq('и остаётся прямоугольником', legacyNoD.pts, 4);

    /* Производственный чертёж рисует не саму форму, а отклонения от базы, усиленные
       для читаемости. База обязана быть прямоугольной. Пока в ней оставалась разная
       высота слева и справа, ровный верх получал ненулевое отклонение, усиление
       перелетало через ноль — и верх рисовался наклонным, хотя уход у него нулевой.
       Случай снят с реального заказа: A 36, B 48 с уклоном 1/8 вниз, C 36 1/8. */
    const levelTop = await p.evaluate(() => {
      const rr = v => Math.round(v * 1e6) / 1e6;
      /* Чертёж рисуется из открытого черновика — маркеры производства читают sDraft. */
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      sDraft.w = '48'; sDraft.h = '36';
      sDraft.smart.C.len = '36 1/8'; sDraft.smart.B.out = '1/8'; sDraft.smart.B.dir = 'down';
      const S = shapeDraftLine(), N = shapeAnnNeutralGeometry(S), real = ssContour(S);
      /* Контур чертежа идёт первым и в порядке обхода A → D → C → B. */
      const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
      const L = [...doc.querySelectorAll('line')].slice(0, 4)
        .map(l => ({ y1:+l.getAttribute('y1'), y2:+l.getAttribute('y2') }));
      const top = L.reduce((a, b) => (a.y1 + a.y2) < (b.y1 + b.y2) ? a : b);
      const out = { neutral: N.points.map(q => [rr(q[0]), rr(q[1])]), Dout: real.base.Dout, topSkew: rr(Math.abs(top.y1 - top.y2)) };
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return out;
    });
    /* Автоматически считается только D. Пустое C — это подстановка «как A», а не
       расчёт, поэтому в поле должен стоять фактический размер, а не слово AUTO:
       иначе правая сторона нигде не видна и её приходится держать в голове. */
    /* Проверять надо ЖИВОЙ ввод, а не свежий рендер. Первая версия этого теста
       смотрела только что построенную разметку и потому не заметила, что при
       наборе подсказка застывает: редактор не перерисовывает левую колонку,
       а слой перевода кэшировал первое значение placeholder и возвращал его
       навсегда. Поэтому здесь именно input-событие, как от рук. */
    const cHint = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      sDraft.w = '48'; sDraft.h = '36'; sDraft.smart.C.len = ''; render();
      /* У Smart-Shape размеры живут ТОЛЬКО в матрице: шапка их больше не
         дублирует, поэтому и проверять здесь нечего, кроме матрицы. */
      const snap = () => ({
        matrixA: document.getElementById('emAlen').value,
        cPh: document.getElementById('emClen').getAttribute('placeholder'),
        cRo: document.getElementById('emClen').hasAttribute('readonly'),
        dRo: document.getElementById('emDlen').hasAttribute('readonly')
      });
      const before = snap();
      const cell = document.getElementById('emAlen');
      cell.focus(); cell.value = '40 1/2'; cell.dispatchEvent(new Event('input', { bubbles:true }));
      const after = snap(), focus = document.activeElement && document.activeElement.id;
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return { before, after, focus };
    });
    eq('пустое C подсказывает фактический размер, а не AUTO', cHint.before.cPh, '36″');
    eq('подсказка едет за высотой при живом вводе', cHint.after.cPh, '40 1/2″');
    eq('матрица держит введённый размер', cHint.after.matrixA, '40 1/2');
    eq('каретка остаётся в том поле, где печатают', cHint.focus, 'emAlen');
    eq('C остаётся вводимым, автоматической остаётся только D', { c: cHint.after.cRo, d: cHint.after.dRo }, { c: false, d: true });

    eq('база чертежа — прямоугольник, а не форма с уклоном', levelTop.neutral, [[0,0],[0,36],[48,36],[48,0]]);
    eq('ровный верх остаётся ровным в геометрии', levelTop.Dout, 0);
    eq('ровный верх рисуется ровным', levelTop.topSkew, 0);

    /* Усиление обязано работать в одну сторону: поднимать то, что иначе не видно,
       и не трогать настоящий уклон. Прежняя формула подменяла величину и упиралась
       в потолок 46 px, поэтому клин 50 → 10 при ширине чертежа 660 px выходил
       почти прямоугольником, а размерные линии ставились по искажённой форме. */
    const magScale = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape';
      function probe(w, h, cLen, bOut, bDir){
        openShapeNew('smart');
        sDraft.w = w; sDraft.h = h;
        if (cLen) sDraft.smart.C.len = cLen;
        if (bOut) { sDraft.smart.B.out = bOut; sDraft.smart.B.dir = bDir; }
        render();
        const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
        const L = [...doc.querySelectorAll('line')].slice(0, 4)
          .map(l => ({ x1:+l.getAttribute('x1'), y1:+l.getAttribute('y1'), x2:+l.getAttribute('x2'), y2:+l.getAttribute('y2') }));
        const vert = L.filter(l => Math.abs(l.x1 - l.x2) < 1).sort((a, b) => a.x1 - b.x1);
        const top = L.reduce((a, b) => (a.y1 + a.y2) < (b.y1 + b.y2) ? a : b);
        const bot = L.reduce((a, b) => (a.y1 + a.y2) > (b.y1 + b.y2) ? a : b);
        return {
          leftPx: vert.length ? Math.abs(vert[0].y2 - vert[0].y1) : 0,
          rightPx: vert.length > 1 ? Math.abs(vert[vert.length-1].y2 - vert[vert.length-1].y1) : 0,
          topSkew: Math.round(Math.abs(top.y1 - top.y2)),
          botSkew: Math.round(Math.abs(bot.y1 - bot.y2))
        };
      }
      const wedge = probe('40', '50', '10');
      const small = probe('48', '36', '36 1/8', '1/8', 'down');
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return { ratio: +(wedge.leftPx / wedge.rightPx).toFixed(2), wedgeTop: wedge.topSkew, smallBot: small.botSkew, smallTop: small.topSkew };
    });
    /* Нотч со скошенным верхом. D строилась хордой от угла до угла, а лесенку
       принудительно сажали на эту хорду — введённый стояк 12 молча становился
       9-1/2, левая сторона переставала складываться в заданную высоту, и в резку
       уходил короткий контур. Числа сверены со Smart-Shape на тех же входных. */
    const notchSlope = await p.evaluate(() => {
      const rr = v => Math.round(v * 1e6) / 1e6;
      const s = { id:'t', name:'t', w:'48', h:'36', smart: ssNormalize({}) };
      s.smart.C.len = '24'; s.smart.corners.tl = 'single';
      const S = { w:s.w, h:s.h, shape:{ type:'smart', smart:s.smart } };
      ssSyncExtra(S);
      S.shape.smart.extraEdges.E.len = '12';
      S.shape.smart.extraEdges.F.len = '10';
      const G = ssContour(S), B = G.base, len = {};
      G.segs.forEach(x => { len[x.id] = (len[x.id] || 0) + Math.hypot(x.p2[0]-x.p1[0], x.p2[1]-x.p1[1]); });
      const xs = G.pts.map(q => q[0]), ys = G.pts.map(q => q[1]);
      return {
        riser: rr(len.E), shelf: rr(len.F), left: rr(len.A),
        run: rr(B.Dlen), drop: rr(B.Dout),
        deg: +(Math.atan2(B.Dout, B.Dlen) * 180 / Math.PI).toFixed(1),
        w: rr(Math.max(...xs) - Math.min(...xs)), h: rr(Math.max(...ys) - Math.min(...ys))
      };
    });
    eq('введённый стояк нотча равен нарисованному', { riser: notchSlope.riser, shelf: notchSlope.shelf }, { riser: 12, shelf: 10 });
    eq('верх считается от верха лесенки, как в Smart-Shape', { run: notchSlope.run, drop: notchSlope.drop, deg: notchSlope.deg }, { run: 38, drop: 24, deg: 32.3 });
    eq('габарит = ширина на левое ребро плюс стояк', { w: notchSlope.w, h: notchSlope.h }, { w: 48, h: 48 });
    eq('левое ребро нарисовано ровно введённым', notchSlope.left, 36);

    /* Выноска уклона: величина и угол по собственному пробегу ребра. Раньше
       верхняя сторона не подписывалась вовсе — её исключала явная строка. */
    const skewCallout = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      sDraft.w = '48'; sDraft.h = '36'; sDraft.smart.C.len = '24';
      sDraft.smart.corners.tl = 'single';
      const S0 = shapeDraftLine(); ssSyncExtra(S0); sDraft.smart = S0.shape.smart;
      sDraft.smart.extraEdges.E.len = '12'; sDraft.smart.extraEdges.F.len = '10';
      render();
      const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
      const texts = [...doc.querySelectorAll('text')].map(t => t.textContent.trim());
      const marks = [...doc.querySelectorAll('path')].filter(x => x.getAttribute('stroke-width') === '.7').length;
      /* Чистый прямоугольник: отмечать нечего, когда прямое всё. */
      openShapeNew('smart'); sDraft.w = '48'; sDraft.h = '36'; render();
      const plain = [...new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml')
        .querySelectorAll('path')].filter(x => x.getAttribute('stroke-width') === '.7').length;
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return { hasDrop: texts.includes('24'), hasAngle: texts.includes('(32.3°)'), marks, plain };
    });
    eq('верхняя сторона получила выноску уклона с углом', { drop: skewCallout.hasDrop, angle: skewCallout.hasAngle }, { drop: true, angle: true });
    eq('квадратики стоят у четырёх прямых углов из шести', skewCallout.marks, 4);
    eq('на чистом прямоугольнике квадратиков нет', skewCallout.plain, 0);

    /* Уход в 1/16″ — это уже не прямой угол, и метка о прямом угле там ложь.
       Прежние допуски (0.08, затем 0.02) объявляли прямыми углы в 85° и 89.28°.
       Заодно проверяем, что габаритная пара с кавычкой больше не дублирует
       цепочки: снизу читалось «48» и тут же «48″». */
    const tightSquare = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      sDraft.w = '48'; sDraft.h = '36';
      sDraft.smart.B.out = '1/16'; sDraft.smart.B.dir = 'up';
      render();
      const r = shapeDraftResult();
      const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(r, false), 'image/svg+xml');
      const marks = [...doc.querySelectorAll('path')].filter(x => x.getAttribute('stroke-width') === '.7').length;
      const quoted = [...doc.querySelectorAll('text')].map(t => t.textContent.trim())
        .filter(s => /^[\d\-\/ ]+[″”"]$/.test(s));
      const P = r.points;
      const worst = Math.max(...P.map((b, i) => {
        const a = P[(i - 1 + P.length) % P.length], c = P[(i + 1) % P.length];
        const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
        const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]));
        return Math.abs(90 - Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI);
      }));
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return { marks, quoted, offBy: +worst.toFixed(3) };
    });
    ok('уход 1/16″ действительно уводит угол от прямого', tightSquare.offBy > 0.05, tightSquare.offBy);
    eq('и такой угол меткой прямого не помечается', tightSquare.marks, 0);
    eq('габаритная пара больше не дублирует цепочки', tightSquare.quoted, []);

    /* Подпись рисуется с белой обводкой: наложение не «сливается», а ЗАТИРАЕТ
       соседнее число целиком. Плюс мелкий шрифт — чертёж показывается меньше
       своего viewBox, и 8 px превращались в нечитаемые 5. Проверяем на трёх
       формах сразу: ни одного пересечения подписей, ни одной подписи на контуре,
       шрифт не мельче 13. */
    const legible = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape';
      function boxes(){
        const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
        const T = [...doc.querySelectorAll('text')].map(t => {
          const s = t.textContent.trim(), size = +(t.getAttribute('font-size') || 11);
          const rot = /rotate\(-?90/.test(t.getAttribute('transform') || '');
          let w = s.length * size * 0.62, h = size * 1.15; if (rot) { const q = w; w = h; h = q; }
          const anchor = t.getAttribute('text-anchor') || 'middle';
          const x = +t.getAttribute('x'), y = +t.getAttribute('y');
          const ax = anchor === 'start' ? 0 : anchor === 'end' ? -w : -w / 2;
          return { s, size, x1:x+ax, y1:y-h, x2:x+ax+w, y2:y+3 };
        }).filter(b => !/PRODUCTION|Shape s|Area|Finished geometry|SMART|SO ·/.test(b.s));
        let hits = 0;
        for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
          const a = T[i], b = T[j];
          if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1) hits++;
        }
        const lines = [...doc.querySelectorAll('line')].filter(l => +l.getAttribute('stroke-width') >= 1.2)
          .map(l => ({ x1:+l.getAttribute('x1'), y1:+l.getAttribute('y1'), x2:+l.getAttribute('x2'), y2:+l.getAttribute('y2') }));
        const onLine = T.filter(b => lines.some(L => {
          for (let t = 0; t <= 40; t++) { const x = L.x1 + (L.x2-L.x1)*t/40, y = L.y1 + (L.y2-L.y1)*t/40;
            if (x > b.x1 && x < b.x2 && y > b.y1 && y < b.y2) return true; } return false; })).length;
        /* Мало не пересекаться — надо ещё и отстоять: подпись впритык к линии
           читается не лучше, чем на ней. */
        const gapTo = (b, L) => { let m = 1e9;
          for (let t = 0; t <= 60; t++) { const x = L.x1 + (L.x2-L.x1)*t/60, y = L.y1 + (L.y2-L.y1)*t/60;
            const dx = Math.max(b.x1-x, 0, x-b.x2), dy = Math.max(b.y1-y, 0, y-b.y2);
            m = Math.min(m, Math.hypot(dx, dy)); } return m; };
        const minGap = Math.round(Math.min(...T.map(b => Math.min(...lines.map(L => gapTo(b, L))))));
        return { hits, onLine, minGap, minSize: Math.min(...T.map(b => b.size)) };
      }
      openShapeNew('smart'); sDraft.w='48'; sDraft.h='36'; sDraft.smart.C.len='55';
      sDraft.smart.corners.bl='single';
      const S0 = shapeDraftLine(); ssSyncExtra(S0); sDraft.smart = S0.shape.smart;
      Object.keys(sDraft.smart.extraEdges).forEach(k => { sDraft.smart.extraEdges[k].len='4'; });
      render();
      const steep = boxes();
      openShapeNew('smart'); sDraft.w='48'; sDraft.h='36'; render();
      const plain = boxes();
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return { steep, plain };
    });
    /* Подпись уклона стоит в ЦЕНТРЕ ЗАЗОРА между пунктирной базой и ребром, на
       уровне того конца, где зазор шире всего: там уход физически виден — между
       отвесом/уровнем и стеклом. Сверено с эталонным чертежом: у наклонной с
       низким концом на 470 и базой на 110 подпись стоит на 290, ровно посередине.
       Ни центр линии, ни сам конец не годятся: по центру число повисает вдоль
       ребра, у конца садится на угол. */
    const calloutAtEnd = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      /* Ровно одна скошенная сторона и ровно одна выноска — тогда пара
         «ребро ↔ подпись» однозначна и тест меряет именно то, что нужно. */
      sDraft.w = '48'; sDraft.h = '36'; sDraft.smart.C.len = '60';
      render();
      const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
      /* Контур рисуется цветом ребра, размерные линии — тёмным #101828.
         Верхняя сторона — та, что выше всех по экрану. */
      const edges = [...doc.querySelectorAll('line')]
        .filter(l => +l.getAttribute('stroke-width') >= 1.2 && (l.getAttribute('stroke') || '') !== '#101828')
        .map(l => ({ x1:+l.getAttribute('x1'), y1:+l.getAttribute('y1'), x2:+l.getAttribute('x2'), y2:+l.getAttribute('y2') }))
        .sort((a, b) => (a.y1 + a.y2) - (b.y1 + b.y2));
      const L = edges[0];
      const lab = [...doc.querySelectorAll('text')].map(t => ({ s:t.textContent.trim(), x:+t.getAttribute('x'), y:+t.getAttribute('y') }))
        .filter(t => /°/.test(t.s))[0];
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      if (!L || !lab) return null;
      const d = (px, py) => Math.hypot(lab.x - px, lab.y - py);
      return {
        toNearestEnd: Math.round(Math.min(d(L.x1, L.y1), d(L.x2, L.y2))),
        toMiddle: Math.round(d((L.x1+L.x2)/2, (L.y1+L.y2)/2))
      };
    });
    ok('выноска уклона стоит у конца скоса, в зазоре до базы',
      calloutAtEnd && calloutAtEnd.toNearestEnd < calloutAtEnd.toMiddle, JSON.stringify(calloutAtEnd));

    eq('подписи не затирают друг друга на крутом скосе', legible.steep.hits, 0);
    eq('и ни одна не ложится на контур', legible.steep.onLine, 0);
    ok('подписи отстоят от контура, а не жмутся к нему', legible.steep.minGap >= 8, legible.steep.minGap);
    ok('шрифт размеров читаемый', Math.min(legible.steep.minSize, legible.plain.minSize) >= 13,
      Math.min(legible.steep.minSize, legible.plain.minSize));

    /* Рабочая сетка изделия — 1/16″, а форматирование шло через frac64: длины,
       посчитанные из геометрии, печатались как 43-1/32 и 49-53/64. Цех такого не
       отрежет, а на чертеже это читается как ложная точность. Каталожные размеры
       (ширина спейсера 17/32″) остаются на frac64 и здесь не участвуют. */
    const grid16 = await p.evaluate(() => {
      const prevTab = tab, prevSub = subtab;
      tab = 'configurators'; subtab = 'shape'; openShapeNew('smart');
      sDraft.w = '48'; sDraft.h = '36'; sDraft.smart.C.len = '50';
      sDraft.smart.A.out = '1/16'; sDraft.smart.A.dir = 'left';
      sDraft.smart.B.out = '2';    sDraft.smart.B.dir = 'up';
      sDraft.smart.C.out = '7/8';  sDraft.smart.C.dir = 'left';
      sDraft.smart.corners.br = 'single';
      const S0 = shapeDraftLine(); ssSyncExtra(S0); sDraft.smart = S0.shape.smart;
      Object.keys(sDraft.smart.extraEdges).forEach(k => { sDraft.smart.extraEdges[k].len = '4'; });
      render();
      const doc = new DOMParser().parseFromString(shapeDrawnProductionSvg(shapeDraftResult(), false), 'image/svg+xml');
      const texts = [...doc.querySelectorAll('text')].map(t => t.textContent.trim());
      const cells = [...document.querySelectorAll('.em-row input')].map(i => i.value || i.getAttribute('placeholder') || '');
      const denoms = [...new Set((texts.concat(cells).join(' ').match(/\/(\d+)/g) || []).map(s => +s.slice(1)))].sort((a, b) => a - b);
      sEdit = null; sDraft = null; tab = prevTab; subtab = prevSub; render();
      return denoms;
    });
    eq('на чертеже и в матрице только сетка 1/16', grid16.filter(d => 16 % d !== 0), []);

    eq('настоящий клин рисуется в истинной пропорции 50:10', magScale.ratio, 5);
    ok('и его перепад не срезан потолком', magScale.wedgeTop > 300, magScale.wedgeTop);
    ok('микро-уклон 1/8″ на 48″ остаётся различимым', magScale.smallBot >= 12, magScale.smallBot);
    eq('и ровный верх при этом не наклоняется', magScale.smallTop, 0);

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
      return {presets,valid:r.valid,rounded:r.points.length>4&&r.featureGeometry.cutouts[0].points.length>4,
        payloadHoles:payload.holes.length,payloadCutouts:payload.cutouts.length,payloadHardware:payload.hardware.length,
        finishedHoles:r.featureGeometry.holes.length,finishedCutouts:r.featureGeometry.cutouts.length,
        stampLeaked:JSON.stringify(payload).includes('TEMPER'),allowance:r.cutting.minX<0&&r.cutting.minY<0,
        dxf:!dxf.includes('CUT_HOLES')&&!dxf.includes('CUT_INNER')&&dxf.includes('CUT_OUTER')&&dxf.endsWith('EOF\n'),
        requirements:r.requirements.map(x=>x.stationClass),conflict:ShapeModule.compute(conflict).valid,badParam:ShapeModule.compute(badParam).valid,circle:ShapeModule.compute(circle).valid,badCircle:ShapeModule.compute(badCircle).valid};
    });
    eq('все каталожные Shape имеют валидные defaults', schemaV2.presets.filter(x=>!x.valid), []);
    /* Порядок цеха: рез → кромка → отверстия/нотчи. Всё, что после кромки,
       базируется на обработанном крае и в cutting-файл не попадает никогда. */
    eq('отверстия, вырезы и фурнитура НЕ попадают в cutting payload', {valid:schemaV2.valid,rounded:schemaV2.rounded,holes:schemaV2.payloadHoles,cutouts:schemaV2.payloadCutouts,hardware:schemaV2.payloadHardware,stampLeaked:schemaV2.stampLeaked}, {valid:true,rounded:true,holes:0,cutouts:0,hardware:0,stampLeaked:false});
    eq('готовый чертёж сохраняет отверстия и вырезы', {holes:schemaV2.finishedHoles,cutouts:schemaV2.finishedCutouts}, {holes:1,cutouts:1});
    eq('припуск Flat Polish меняет cutting contour', schemaV2.allowance, true);
    eq('Generic DXF содержит только внешний контур', schemaV2.dxf, true);
    ok('маршрут выводится из геометрии', schemaV2.requirements.includes('POLISHING')&&schemaV2.requirements.includes('DRILLING')&&schemaV2.requirements.includes('CNC'));
    eq('конфликтующие finishes блокируются', schemaV2.conflict, false);
    eq('некорректный параметр preset не заменяется default', schemaV2.badParam, false);
    eq('круг имеет один физический диаметр', {equal:schemaV2.circle,mismatch:schemaV2.badCircle}, {equal:true,mismatch:false});

    /* --- Safety Border ------------------------------------------------
       Защитный отступ при резке и ломке вдоль скошенных и дуговых кромок.
       В контур реза НЕ входит: деталь режется по finished + припуск кромки.
       Бордер говорит раскрою, сколько пустого места оставить — и до соседней
       детали, и до края листа. Клиент за него платит (лист расходуется из-за
       его скоса), поэтому он входит в оплачиваемый габарит. */
    const border = await p.evaluate(() => {
      const mk=(type,th,b)=>{const d=newShapeDef(type);d.w='48';d.h='36';d.thickness=String(th);if(b!=null)d.safetyBorder=String(b);return d;};
      const rect=ShapeModule.compute(mk('rectangle',10));
      const raked=ShapeModule.compute(mk('raked',10)),raked6=ShapeModule.compute(mk('raked',6)),raked19=ShapeModule.compute(mk('raked',19)),raked3=ShapeModule.compute(mk('raked',3));
      const over=ShapeModule.compute(mk('raked',10,'2 1/16')),odd=ShapeModule.compute(mk('raked',10,'1.03')),junk=ShapeModule.compute(mk('raked',10,'abc'));
      const plain=ShapeModule.compute(mk('raked',10)),withB=ShapeModule.compute(mk('raked',10,'3'));
      const pPlain=ShapeModule.machinePayload(plain),pWith=ShapeModule.machinePayload(withB);
      return {
        rect:{applies:rect.cutting.safetyBorder.applies,value:rect.cutting.safetyBorder.value},
        auto:{applies:raked.cutting.safetyBorder.applies,mm10:raked.cutting.safetyBorder.value,mm6:raked6.cutting.safetyBorder.value,state:raked.cutting.safetyBorder.state},
        outside:{mm19:{value:raked19.cutting.safetyBorder.value,manual:raked19.cutting.safetyBorder.manualRequired},mm3:{value:raked3.cutting.safetyBorder.value,manual:raked3.cutting.safetyBorder.manualRequired}},
        override:{state:over.cutting.safetyBorder.state,value:over.cutting.safetyBorder.value,rounded:odd.cutting.safetyBorder.value,junkState:junk.cutting.safetyBorder.state},
        contourSame:JSON.stringify(plain.cutting.points)===JSON.stringify(withB.cutting.points),
        outerSame:JSON.stringify(pPlain.outer)===JSON.stringify(pWith.outer),
        footprintGrows:(withB.cutting.footprint.width-withB.cutting.width)+(withB.cutting.footprint.height-withB.cutting.height),
        payloadValue:pWith.safetyBorder.value
      };
    });
    eq('прямые кромки под 90° бордера не требуют', border.rect, {applies:false,value:0});
    eq('скос требует бордер, значение автоматом от толщины', border.auto, {applies:true,mm10:1.5,mm6:1,state:'AUTO'});
    /* 16–19 mm получили авто-значение 1/2" (владелец, 31 августа 2026): редкие
       толщины, и этого бордера хватает. Ручной ввод остаётся обязательным
       только вне таблицы — тоньше 4 mm и толще 19 mm. */
    eq('16–19 мм имеют авто-бордер, вне таблицы нужен ручной ввод', border.outside, {mm19:{value:.5,manual:false},mm3:{value:0,manual:true}});
    eq('ручной ввод даёт OVERRIDE, дробь и округление 1/16″', border.override, {state:'OVERRIDE',value:2.0625,rounded:1,junkState:'AUTO'});
    eq('бордер НЕ меняет контур реза', {contour:border.contourSame,payloadOuter:border.outerSame}, {contour:true,payloadOuter:true});
    eq('бордер увеличивает оплачиваемый габарит и уходит в payload', {grew:border.footprintGrows,payload:border.payloadValue}, {grew:3,payload:3});

    /* Цеховая таблица припуска на рез. Значения подтверждены владельцем
       31 августа 2026: 16–19 мм раньше блокировали рез, потому что правила
       для них просто не было, а Rough Arris не увеличивает лист никогда —
       это ручная зачистка фаски, контур она не съедает. */
    eq('припуск на рез по толщине стекла', await p.evaluate(() => {
      const v=(type,mm)=>{const r=ShapeModule.productionAllowanceForOps([{type:type}],mm);return r.ok?r.value:'blocked';};
      return {
        arris:[v('Rough Arris',6),v('Rough Arris',19)],
        flat:[v('Flat Polish',6),v('Flat Polish',10),v('Flat Polish',12),v('Flat Polish',16),v('Flat Polish',19)],
        miter:[v('Mitering',16),v('Mitering',19)],
        bevel:[v('Beveling',16),v('Beveling',19)],
        cnc:[v('CNC Shape Polish',6),v('CNC Shape Polish',12),v('CNC Shape Polish',15),v('CNC Shape Polish',19)]
      };
    }), {arris:[0,0],flat:[1/16,1/8,3/16,.5,.5],miter:[.5,.5],bevel:[.5,.5],cnc:[.25,.25,.5,.5]});
    /* Таблица припуска должна быть ОДНА. Их было две: производственная и та, по
       которой ShapeModule.compute считает рез рассчитанной геометрии. После
       правки цеховых цифр они разошлись — рассчитанная геометрия продолжала
       блокировать рез на 16–19 mm, пока производственный путь уже считал 1/2".
       Тест сверяет обе точки входа, чтобы это не повторилось. */
    eq('припуск считается одной таблицей, а не двумя', await p.evaluate(() => {
      const mm=[3,4,5,6,8,10,12,15,16,19];
      const prod=type=>mm.map(m=>{const r=ShapeModule.productionAllowanceForOps([{type:type}],m);return r.ok?r.value:'blocked';});
      const feat=type=>mm.map(m=>shapeOperationAllowance(type,m));
      const gap=(type,m)=>{const r=ShapeModule.productionAllowanceForOps([{type:type}],m);return {prod:r.ok?r.value:'blocked',feat:shapeOperationAllowance(type,m)};};
      const d=newShapeDef('rectangle');d.w='30';d.h='50';d.thickness='19';
      d.edgeOps={A:[shapeNormalizeOp({type:'Flat Polish'})]};
      return {
        flat:JSON.stringify(prod('Flat Polish'))===JSON.stringify(feat('Flat Polish')),
        cnc:JSON.stringify(prod('CNC Shape Polish'))===JSON.stringify(feat('CNC Shape Polish')),
        unconfigured:gap('Flat Polish',7),
        calculated19:ShapeModule.compute(d).valid
      };
    }), {flat:true,cnc:true,unconfigured:{prod:'blocked',feat:0},calculated19:true});

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

    /* Виды меток — открытый список. Раньше нормализация отдавала 'hole' на
       любой незнакомый тип: патч на кромке превращался в отверстие в нулевой
       точке, то есть в чужую деталь. */
    const openKinds = await p.evaluate(() => {
      const patch=shapeNormalizeManufacturingItem({id:'p',type:'patch',edge:'top',distance:6,modelId:'hw-patch-ph20',model:'PH20'});
      const own=shapeNormalizeManufacturingItem({id:'v',type:'pivot',edge:'left',distance:3});
      const junk=shapeNormalizeManufacturingItem({id:'j',type:'ПЕТЛЯ 1',edge:'left',distance:3});
      const d=normalizeShapeDef(newShapeDef('rectangle'));d.w='20';d.h='40';d.manufacturingItems=[patch,own];
      const r=ShapeModule.compute(d),payload=ShapeModule.machinePayload(r);
      return {patch:[patch.type,patch.edge,patch.distance,patch.modelId,patch.model],
        own:[own.type,own.edge,own.distance],junk:junk.type,
        req:(r.requirements||[]).filter(q=>q.source==='MANUFACTURING').map(q=>q.stationClass+':'+q.operation),
        models:(r.requirements||[]).filter(q=>q.source==='MANUFACTURING').map(q=>q.params.model),
        cutting:[r.cutting.holes.length,r.cutting.hardware.length,r.cutting.points.length],
        machineReq:(payload&&payload.requirements||[]).filter(q=>q.source==='MANUFACTURING').length};
    });
    eq('вид метки — открытый список, незнакомый тип не становится отверстием', {patch:openKinds.patch,own:openKinds.own,junk:openKinds.junk},
      {patch:['patch','top',6,'hw-patch-ph20','PH20'],own:['pivot','left',3],junk:'hole'});
    eq('патч и добавленный вид дают требование SERVICE с именем модели', {req:openKinds.req,models:openKinds.models}, {req:['SERVICE:Patch','SERVICE:Pivot'],models:['PH20','']});
    eq('патч и добавленный вид не попадают в Cutting Geometry / machine payload', {cutting:openKinds.cutting,machineReq:openKinds.machineReq}, {cutting:[0,0,4],machineReq:0});

    /* Отпечаток ревизии считается по JSON меток. Пустые поля модели в записи
       сдвинули бы его у КАЖДОЙ старой фигуры с зажимом или петлёй, и
       привязанная раскладка Muntin решила бы, что геометрия изменилась. */
    const modelSnapshot = await p.evaluate(() => {
      const legacy=shapeNormalizeManufacturingItem({id:'c1',type:'clamp',edge:'left',distance:4});
      const named=shapeNormalizeManufacturingItem({id:'c2',type:'hinge',edge:'right',distance:6,modelId:'hw-hinge-vienna-180',model:'Vienna 180'});
      const base=normalizeShapeDef(newShapeDef('rectangle'));base.w='20';base.h='40';
      const withLegacy=JSON.parse(JSON.stringify(base));withLegacy.manufacturingItems=[legacy];
      const withNamed=JSON.parse(JSON.stringify(base));withNamed.manufacturingItems=[named];
      /* переименование в справочнике не переписывает принятый заказ */
      const row=hardwareModelById('hw-hinge-vienna-180'),before=row.name;row.name='Vienna 180 SS';
      const shown=hardwareItemModelName(named);row.name=before;
      return {legacyKeys:Object.keys(legacy).sort(),namedKeys:Object.keys(named).sort(),
        legacyFingerprint:shapeFingerprint(normalizeShapeDef(withLegacy)),
        namedChanges:shapeFingerprint(normalizeShapeDef(withNamed))!==shapeFingerprint(base),
        shown:shown,custom:hardwareItemIsCustomModel(shapeNormalizeManufacturingItem({id:'c3',type:'hinge',edge:'left',distance:1,model:'Своя петля'}))};
    });
    eq('метка без модели не меняет форму записи, отпечаток старой ревизии стоит на месте',
      {keys:modelSnapshot.legacyKeys,fingerprint:modelSnapshot.legacyFingerprint},
      {keys:['distance','edge','id','note','type'],fingerprint:'shp-7fcc0fad'});
    /* Оформление размера — не геометрия. Если бы карта `dims` входила в
       отпечаток, решение «этот размер мешает, убери его с листа» выглядело бы
       как новая геометрия и поднимало тревогу у привязанной раскладки Muntin. */
    eq('оформление размеров не входит в отпечаток ревизии и переживает нормализацию', await p.evaluate(() => {
      const base=normalizeShapeDef(newShapeDef('rectangle'));base.w='20';base.h='40';
      base.manufacturingItems=[shapeNormalizeManufacturingItem({id:'m1',type:'patch',edge:'left',distance:6})];
      const plain=normalizeShapeDef(JSON.parse(JSON.stringify(base)));
      const styled=normalizeShapeDef(Object.assign(JSON.parse(JSON.stringify(base)),{dims:{m1:{e:{hide:true,off:3,ref:'end'}},junk:{q:{off:1}},empty:{h:{}}}}));
      return {same:shapeFingerprint(plain)===shapeFingerprint(styled),dims:styled.dims,
        clamped:normalizeShapeDef(Object.assign(JSON.parse(JSON.stringify(base)),{dims:{m1:{e:{off:99}}}})).dims};
    }), {same:true,dims:{m1:{e:{hide:true,off:3,ref:'end'}}},clamped:{m1:{e:{off:12}}}});
    eq('модель хранится снимком: переименование справочника не трогает заказ',
      {keys:modelSnapshot.namedKeys,changed:modelSnapshot.namedChanges,shown:modelSnapshot.shown,custom:modelSnapshot.custom},
      {keys:['distance','edge','id','model','modelId','note','type'],changed:true,shown:'Vienna 180',custom:true});
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
      tab='sales';subtab=null;render();salesOrderNew();
      const line=soDraft.lines[0];
      line.width16=30*16;line.height16=50*16;salesEnsureLineShape(line);
      const set=salesNormalizeServiceSet({
        id:'SVC-QA',code:'S1',name:'QA Edgework',mode:'sides',
        sides:{A:[{type:'Rough Arris'}],B:[],C:[],D:[],other:[]}
      });
      soDraft.serviceSets=[set];render();
      return {lineId:line.id,setId:set.id};
    });
    await serviceSetUi.p.evaluate(id => salesOpenServiceSets(id), serviceSetIds.setId);
    eq('Edgework Sets показывает визуальную схему A/B/C/D', await serviceSetUi.p.locator('.ss-side-map-label').allTextContents(),
      ['D Top · Width','A Left · Height','C Right · Height','B Bottom · Width']);
    eq('каждая строка Set объясняет физическую сторону', await serviceSetUi.p.locator('.ss-set-side small').allTextContents(),
      ['Left · Height','Bottom · Width','Right · Height','Top · Width','Custom / extra edge']);
    await serviceSetUi.p.locator('.ss-set-modal').getByRole('button',{name:'Close',exact:true}).click();
    eq('до выбора строки bulk-панель скрыта', await serviceSetUi.p.locator('.ss-bulk').count(), 0);
    await serviceSetUi.p.locator('.sales-lines-table tbody .line-check input').check();
    eq('выбор отдельной Sales-строки показывает Bulk Set', await serviceSetUi.p.locator('.ss-bulk').count(), 1);
    await serviceSetUi.p.locator('.ss-bulk select').nth(1).selectOption(serviceSetIds.setId);
    await serviceSetUi.p.getByRole('button',{name:'Preview',exact:true}).click();
    eq('Preview готовит применение Edgework Set', await serviceSetUi.p.locator('.ss-preview').count(), 1);
    await serviceSetUi.p.getByRole('button',{name:'Apply',exact:true}).click();
    /* Apply больше не вешает ссылку на строку: операции набора уходят в форму
       этой строки, и правятся дальше там же, где вся геометрия. */
    eq('Apply пишет операции набора в форму строки', await serviceSetUi.p.evaluate(({lineId}) => {
      const line=soDraft.lines.find(l=>l.id===lineId),shape=salesShapeByRef(line.shapeRef);
      return {onLine:line.serviceSetId,edges:Object.keys(shape.edgeOps||{}),badge:document.querySelector('.ss-badge').textContent};
    }, serviceSetIds), {onLine:'',edges:['A'],badge:'Shape'});
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
    /* 100″ = кромка A от формы (40) плюс C и D, которые форма не трогала и
       которые закрывает базовая кромка стекла 10 mm. B несёт только Mitering. */
    }), {hingeBasis:1,flatBasis:100,miterCatalog:null,effectiveHinge:10,unpriced:1,sameShape:true,sameBasis:true});
    eq('Сохранённый заказ держит snapshot Catalog rate, включая отсутствие цены', await dxfSales.p.evaluate(() => {
      const line=soDraft.lines[0],rows=salesLineChargeRows(line),flat=rows.find(r=>r.key.indexOf('EDGE:flatPolish:')===0),miter=rows.find(r=>r.key.indexOf('EDGE:miter45:')===0);salesSnapshotAllChargePricing();const flatSaved=line.chargePricing[flat.key].catalogRate,miterSaved=line.chargePricing[miter.key].catalogRate;SALES_SERVICE_RATE_TABLE.flatPolish['8-10']=.99;const flatNow=salesLineChargeRows(line).find(r=>r.key===flat.key),flatState=salesChargePricingState(line,flatNow),miterState=salesChargePricingState(line,salesLineChargeRows(line).find(r=>r.key===miter.key));salesResetChargeRate(line.id,flat.key);const resetCatalog=line.chargePricing[flat.key].catalogRate;SALES_SERVICE_RATE_TABLE.flatPolish['8-10']=.10;return {flatSaved,miterSaved,flatEffective:flatState.effectiveRate,miterEffective:miterState.effectiveRate,resetCatalog};
    }), {flatSaved:.1,miterSaved:null,flatEffective:.1,miterEffective:null,resetCatalog:.1});

    eq('добавленный вид фурнитуры попадает в счёт без ставки, а не нулём', await dxfSales.p.evaluate(() => {
      const sh=newShapeDef('rectangle');sh.id='qa-patch-price';sh.w='20';sh.h='40';sh.manufacturingItems=[
        shapeNormalizeManufacturingItem({id:'p',type:'patch',edge:'left',distance:4,modelId:'hw-patch-ph20',model:'PH20'}),
        shapeNormalizeManufacturingItem({id:'h',type:'hinge',edge:'right',distance:5,modelId:'hw-hinge-vienna-180',model:'Vienna 180'})
      ];DB.shapeDef=[normalizeShapeDef(sh)];
      soDraft=newSalesOrderDraft();const m=soDraft.makeups[0];m.unitType='single';m.panes=[salesDefaultPane(0)];m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;
      const line=normalizeSalesOrderLine({makeupId:m.id,qty:1,width16:320,height16:640,shapeRef:salesShapeRefFrom(DB.shapeDef[0])});soDraft.lines=[line];
      const mi=salesLineChargeRows(line).filter(r=>r.key.indexOf('MI:')===0);
      /* Один и тот же разбор меток обязан работать в обеих ветках расчёта:
         обычной и через Service Set. Копия этого кода уже расходилась однажды. */
      const shared=salesManufacturingChargeRows(DB.shapeDef[0].manufacturingItems,salesPricingThickness(line));
      return {rows:mi.map(r=>[r.key,r.label,r.catalogRate,salesChargeShortLabel(r)]),
        unpriced:salesLinePricingSummary(line).unpriced,
        shared:JSON.stringify(shared.map(r=>[r.key,r.label,r.catalogRate]))===JSON.stringify(mi.map(r=>[r.key,r.label,r.catalogRate]))};
    }), {rows:[['MI:patch:8-10','Patch',null,'PATCH'],['MI:hinge:8-10','Hinge',15,'HNG']],unpriced:1,shared:true});
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
      const o=newSalesOrderDraft();return {n:o.makeups.length,code:o.makeups[0].code,type:o.makeups[0].unitType,panes:o.makeups[0].panes.length,cavities:o.makeups[0].cavities.length,lines:o.lines.length,blank:salesOrderLineIsBlank(o.lines[0]),global:Object.prototype.hasOwnProperty.call(DB,'salesConfiguration')};
    }), {n:1,code:'A',type:'double',panes:2,cavities:1,lines:1,blank:true,global:false});
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
    }), '12.760');
    eq('Laminated мигрирует старые поля в две плиты со своей закалкой', await t.p.evaluate(() => {
      const p=normalizeSalesPane({category:'laminated',heatTreatmentId:'HT-HS',laminated:{outerGlassProductId:'GL-6CLEAR',innerGlassProductId:'GL-6CLEAR',interlayerProductId:'INT-PVB060'}},0);
      return {outer:p.laminated.outer.glassProductId,inner:p.laminated.inner.glassProductId,outerHeat:p.laminated.outer.heatTreatmentId,innerHeat:p.laminated.inner.heatTreatmentId,films:p.laminated.interlayers.map(x=>[x.productId,x.layers,x.thicknessMm])};
    }), {outer:'GL-6CLEAR',inner:'GL-6CLEAR',outerHeat:'HT-HS',innerHeat:'HT-HS',films:[['INT-PVB',4,1.52]]});
    eq('продукт плёнки и количество слоёв хранятся отдельно', await t.p.evaluate(() => {
      const film=salesDefaultPane(0).laminated.interlayers[0],rows=activeSimple('interlayerProduct');
      return {film:[film.productId,film.layers,film.thicknessMm],canonical:rows.some(x=>x.id==='INT-PVB'&&x.code==='PVB'&&x.thicknessMm==null),legacy:rows.some(x=>['INT-PVB030','INT-PVB060','INT-SGP035'].includes(x.id))};
    }), {film:['INT-PVB',1,.38],canonical:true,legacy:false});
    eq('Laminated фильтрует каждую плиту и показывает две независимые закалки', await t.p.evaluate(() => {
      const p=normalizeSalesPane({category:'laminated',laminated:{outer:{manufacturer:'Vitro',thicknessMm:6,visionType:'lowe'},inner:{manufacturer:'Vitro',thicknessMm:6,visionType:'uncoated'}}},0),host=document.createElement('div');
      host.innerHTML=salesLaminatedFields(p,0);const outer=host.querySelector('[data-lam-ply="outer"]'),glass=outer.querySelector('.mu-lam-glass select'),coating=[...outer.querySelectorAll('label')].find(x=>x.textContent==='Select Coating').parentElement.querySelector('select');
      return {cards:host.querySelectorAll('[data-lam-ply]').length,heat:[...host.querySelectorAll('.mu-lam-ply label')].filter(x=>x.textContent==='Heat Treatment').length,candidates:salesLaminatedPlyCandidates(p.laminated.outer).length,glassOptions:glass.options.length,firstCoating:coating.value};
    }), {cards:2,heat:2,candidates:92,glassOptions:14,firstCoating:'Solarban 60'});
    eq('Frit назначается одной laminated ply: снаружи плёнки по умолчанию или в плёнку', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();const p=salesCurrentMakeup().panes[0];p.category='laminated';
      const defaults=[p.laminated.outer.frit.position,p.laminated.inner.frit.position,p.laminated.outer.frit.enabled,p.laminated.inner.frit.enabled];
      salesPaneSetLamPlyType(0,'outer','frit');salesPaneSetLamFrit(0,'outer','position','in_film');salesPaneSetLamFrit(0,'outer','color','Acid Etched');
      const host=document.createElement('div');host.innerHTML=salesLaminatedFields(p,0);const outer=host.querySelector('[data-lam-ply="outer"]'),pos=outer.querySelector('.mu-lam-frit-grid select');
      return {defaults,outer:[p.laminated.outer.visionType,p.laminated.outer.frit.enabled,p.laminated.outer.frit.position,p.laminated.outer.frit.color],inner:[p.laminated.inner.frit.enabled,p.laminated.inner.frit.position,p.laminated.inner.frit.color],types:[...outer.querySelectorAll('.mu-type-buttons button')].map(x=>[x.textContent,x.classList.contains('on')]),grids:host.querySelectorAll('.mu-lam-frit-grid').length,positions:[...pos.options].map(x=>x.textContent),summary:salesPaneProductSummary(p,0)};
    }), {defaults:['outside','outside',false,false],outer:['uncoated',true,'in_film','Acid Etched'],inner:[false,'outside','White'],types:[['Low-E',false],['Reflective',false],['Frit',true],['Uncoated',false]],grids:1,positions:['#1 · Outside film (default)','Into film'],summary:'6CLEAR · FRIT into film + PVB 0.38 mm + 6CLEAR'});
    eq('Laminated Frit показывает поверхность выбранного Lite и ply', await t.p.evaluate(() => {
      const p=salesDefaultPane(1);p.category='laminated';p.laminated.outer.frit.enabled=true;p.laminated.inner.frit.enabled=true;
      const host=document.createElement('div');host.innerHTML=salesLaminatedFields(p,1);
      const option=side=>host.querySelector('[data-lam-ply="'+side+'"] .mu-lam-frit-grid select option').textContent;
      return {surfaces:[salesLaminatedFritOutsideSurface(1,'outer'),salesLaminatedFritOutsideSurface(1,'inner')],options:[option('outer'),option('inner')],summary:salesPaneProductSummary(p,1)};
    }), {surfaces:[3,4],options:['#3 · Outside film (default)','#4 · Outside film (default)'],summary:'6CLEAR · FRIT #3 + PVB 0.38 mm + 6CLEAR · FRIT #4'});
    eq('Laminated смешивает типы плёнки с отдельным количеством слоёв', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();const m=salesCurrentMakeup(),p=m.panes[0];p.category='laminated';m.unitType='single';m.panes=[p];m.cavities=[];
      salesPaneSetLamInterlayer(0,0,'INT-EVA-UC');salesPaneAddLamInterlayer(0);salesPaneSetLamInterlayer(0,1,'INT-EVA-MW');
      salesPaneSetLamInterlayerLayers(0,0,1);salesPaneSetLamInterlayerLayers(0,1,4);
      const host=document.createElement('div');host.innerHTML=salesLaminatedInterlayers(p,0);const layerSelect=host.querySelectorAll('.mu-lam-film select')[1];
      return {map:[1,2,3,4,5,6].map(salesInterlayerThicknessForLayers),clamped:salesInterlayerLayerCount(7),films:p.laminated.interlayers.map(x=>[x.productId,x.layers,x.thicknessMm]),options:[...layerSelect.options].map(x=>x.textContent),overall:salesMakeupThicknessMm(m).toFixed(2),production:salesPaneGlassThicknessMm(p).toFixed(2)};
    }), {map:[.38,.76,1.14,1.52,1.9,2.28],clamped:6,films:[['INT-EVA-UC',1,.38],['INT-EVA-MW',4,1.52]],options:['1 layer · 0.38 mm','2 layers · 0.76 mm','3 layers · 1.14 mm','4 layers · 1.52 mm','5 layers · 1.90 mm','6 layers · 2.28 mm'],overall:'13.90',production:'13.90'});
    eq('Makeup accordion начинает с Lite 1 и при переходе сворачивает его', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesSetUnitType('triple');const d=[...document.querySelectorAll('.mu-section')],initial=d.filter(x=>x.open).length,first=d.find(x=>x.open)&&d.find(x=>x.open).dataset.muSection;d[1].open=true;salesAccordionToggle(d[1],d[1].dataset.muSection);return {initial,first,open:d.filter(x=>x.open).length,key:soOpenSectionKey,lite1:d[0].open};
    }), {initial:1,first:'lite-0',open:1,key:'cavity-0',lite1:false});
    eq('Cavity выбирается в порядке Width → Spacer → Gas → Sealant', await t.p.evaluate(() => {
      const c=normalizeSalesCavity({spacerVariantId:'SP-BWE-012',primarySealantId:'SEAL-HM'},0),host=document.createElement('div');
      host.innerHTML=salesCavitySection(c,0);const selects=[...host.querySelectorAll('.mu-cavity-grid select')];
      return {labels:[...host.querySelectorAll('.mu-cavity-grid label')].map(x=>x.textContent),widths:[...selects[0].options].map(x=>x.textContent),spacers:[...selects[1].options].map(x=>x.textContent),primary:c.primarySealantId,summary:salesCavitySummary(c)};
    }), {labels:['Width','Spacer','Gas','Sealant'],widths:['3/8″','7/16″','1/2″','17/32″','5/8″'],spacers:['BWE — Black Warm Edge','AL — Aluminum'],primary:'SEAL-PIB',summary:'Black Warm Edge 1/2″ · Argon · SIL'});
    eq('смена Width сохраняет spacer-систему и фильтрует недоступные размеры', await t.p.evaluate(() => {
      salesOrderNew();const c=salesCurrentMakeup().cavities[0];c.spacerVariantId='SP-AL-012';salesCavitySetWidth(0,'5/8');const same=c.spacerVariantId;salesCavitySetWidth(0,'7/16');return {same,fallback:c.spacerVariantId};
    }), {same:'SP-AL-058',fallback:'SP-BWE-716'});
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
      const o=newSalesOrderDraft(),mu=o.makeups[0].id;o.lines=[];for(let i=0;i<300;i++)o.lines.push(normalizeSalesOrderLine({makeupId:mu,qty:1,width:'48',height:'36',mark:'L'+i}));const n=normalizeSalesOrder(o);return {n:n.lines.length,refs:new Set(n.lines.map(x=>x.makeupId)).size,w:n.lines[299].width16,h:n.lines[299].height16};
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
      soDraft.customerId='CUS-T';
      salesOrderSave();
      const blocked=DB.salesOrder.length===0;
      soDraft.lines[0].width16=48*16;soDraft.lines[0].height16=36*16;salesOrderSave();
      return {blocked,savedAfterSize:DB.salesOrder.length===1};
    }), {blocked:true,savedAfterSize:true});
    eq('несовместимая закалка предупреждает, но разрешает явное сохранение', await t.p.evaluate(() => {
      DB.salesOrder=[];DB.customer=[{id:'CUS-WARN',code:'CW',legalName:'Warning test',displayName:'Warning test',status:'active',contacts:[],addresses:[]}];
      tab='sales';render();salesOrderNew();soDraft.customerId='CUS-WARN';soDraft.lines[0].width16=160;soDraft.lines[0].height16=160;
      const banned=activeGlassProducts().find(glassBannedFromFurnace),required=activeGlassProducts().find(glassNeedsFurnace),m=soDraft.makeups[0];
      const pane=(g,heat,index)=>normalizeSalesPane({category:'vision',manufacturer:g.manufacturer,thicknessMm:g.thicknessMm,visionType:g.coatingFamily,glassProductId:g.id,heatTreatmentId:heat},index);
      m.unitType='double';m.panes=[pane(banned,'HT-FT',0),pane(required,'HT-AN',1)];
      const warnings=salesTemperCompatibilityWarnings(soDraft),prompts=[],oldConfirm=window.confirm,answers=[false,true];
      window.confirm=message=>{prompts.push(message);return answers.shift();};
      salesOrderSave();const afterCancel=DB.salesOrder.length;salesOrderSave();const afterConfirm=DB.salesOrder.length;window.confirm=oldConfirm;
      return {warningCount:warnings.length,afterCancel,afterConfirm,prompts:prompts.length,hasBanned:prompts[0].includes(banned.code),hasRequired:prompts[0].includes(required.code),offersOverride:prompts[0].includes('Save this order anyway?')};
    }), {warningCount:2,afterCancel:0,afterConfirm:1,prompts:2,hasBanned:true,hasRequired:true,offersOverride:true});
    /* Excel paste. Ввод — таблица с колонками Qty | Width | Height | Mark:
       проверяем и разбор буфера, и то, что на экране именно колонки, а не одна
       строка текста (на ней владелец и споткнулся: набранное через пробелы
       слипалось в одну ячейку). */
    eq('Excel-вставка кладёт ширину в ширину, а не в высоту', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('2\\t30\\t80\\tA1',0);salesExcelApply();
      const l=soDraft.lines[soDraft.lines.length-1];
      return {qty:l.qty,w:l.width16,h:l.height16,mark:l.mark};
    })()`), {qty:2,w:30*16,h:80*16,mark:'A1'});
    eq('подсказка Excel повторяет колонки самой сетки', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesExcelOpen();
      const hint=document.getElementById('salesExcelCols').textContent;
      const head=Array.from(document.querySelectorAll('#salesExcelGrid thead th'))
        .map(th=>th.textContent.trim()).filter(t=>t!=='#'&&t!=='Result').join(' | ');
      return {hint,head};
    }), {hint:'Qty | Width | Height | Mark',head:'Qty | Width | Height | Mark'});
    /* Вводом должна быть сетка: заголовки колонок и по ячейке на значение. */
    eq('вставка вводится таблицей, а не текстовым полем', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();salesExcelOpen();
      const modal=document.getElementById('salesExcelModal');
      const head=Array.from(modal.querySelectorAll('#salesExcelGrid thead th')).map(th=>th.textContent.trim());
      return {textarea:modal.querySelectorAll('textarea').length,head,
        cells:modal.querySelectorAll('#salesExcelGrid tbody input[data-c="qty"]').length>0};
    }), {textarea:0,head:['#','Qty','Width','Height','Mark','Result'],cells:true});
    /* Пробелы — такой же разделитель, как таб; дробь остаётся при своём числе. */
    eq('строка через пробелы раскладывается по колонкам', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('12 22 33 A1',0);
      const r=soExcelRows[0];
      return [r.qty,r.width,r.height,r.mark];
    }), ['12','22','33','A1']);
    eq('дробь не разваливается на два размера', await t.p.evaluate(() => {
      return salesExcelTokens('1 34 13/16 15 5/16 A1');
    }), ['1','34 13/16','15 5/16','A1']);
    /* Реальная вставка идёт через событие paste на ячейке — проверяем провод. */
    eq('paste в ячейку заполняет строки сетки', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];salesExcelOpen();
      const inp=document.querySelector('#salesExcelGrid input[data-r="0"][data-c="qty"]');
      const dt=new DataTransfer();dt.setData('text/plain','2\\t30\\t80\\tA1\\n1\\t24\\t42 1/2\\tB2');
      inp.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
      const c=salesExcelCounts();
      return {ready:c.ready,bad:c.bad,second:[soExcelRows[1].width,soExcelRows[1].height]};
    })()`), {ready:2,bad:0,second:['24','42 1/2']});
    /* Несколько значений, набранных в одну ячейку, тоже раскладываются. */
    eq('значения из одной ячейки уходят по колонкам вправо', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();soDraft.lines=[];salesExcelOpen();
      const q=document.querySelector('#salesExcelGrid input[data-r="0"][data-c="qty"]');
      q.value='12 22 33 A1';
      q.dispatchEvent(new Event('input',{bubbles:true}));
      q.dispatchEvent(new Event('change',{bubbles:true}));
      return ['qty','width','height','mark'].map(c=>document.querySelector('#salesExcelGrid input[data-r="0"][data-c="'+c+'"]').value);
    }), ['12','22','33','A1']);
    eq('строка шапки и лишняя колонка в заказ не уезжают', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('Qty\\tWidth\\tHeight\\tMark\\tNotes\\n2\\t30\\t80\\tA1\\trush',0);
      salesExcelApply();
      const l=soDraft.lines[0];
      return {lines:soDraft.lines.length,qty:l.qty,w:l.width16,mark:l.mark};
    })()`), {lines:1,qty:2,w:30*16,mark:'A1'});
    eq('колонки MU и Set распознаются сами', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();salesAddMakeup();soDraft.lines=[];
      soDraft.serviceSets=[salesNormalizeServiceSet({code:'S2',mode:'perimeter',perimeter:[{type:'Flat Polish'}]},1)];
      salesExcelPasteText('B\\tS2\\t2\\t30\\t80\\tA1',0);
      const shown={mu:soExcelShowMu,set:soExcelShowSet};
      salesExcelApply();
      const l=soDraft.lines[0];
      /* Набор из буфера — рецепт: операции легли в форму строки, а на самой
         строке ссылки не осталось. */
      const shape=salesShapeByRef(l.shapeRef);
      return {shown,mu:l.makeupId===soDraft.makeups[1].id,onLine:l.serviceSetId,edges:Object.keys(shape.edgeOps||{}).sort()};
    })()`), {shown:{mu:true,set:true},mu:true,onLine:'',edges:['A','B','C','D']});
    /* Раньше ошибочные строки исчезали в счётчике «Skipped: N» — исправить их
       было нечего. Теперь они остаются в сетке, а исправные уходят в заказ. */
    eq('строки с ошибкой остаются в сетке, исправные добавляются', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];salesExcelOpen();
      salesExcelPasteText('2\\t30\\t80\\tA1\\n1\\tabc\\t80\\tA2',0);
      salesExcelApply();
      const first={added:soDraft.lines.length,left:soExcelRows.filter(r=>!salesExcelRowIsBlank(r)).map(r=>r.width),open:soExcelOpen};
      /* Строку поправили — второй Add забирает её и не дублирует первую. */
      soExcelRows[0].width='20';salesExcelApply();
      return {first,total:soDraft.lines.length,closed:!soExcelOpen};
    })()`), {first:{added:1,left:['abc'],open:true},total:2,closed:true});
    eq('роль колонки переставляется и не занимает две колонки', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('7\\t2\\t30\\t80\\tA1',0);
      salesExcelSetRole(0,'skip');salesExcelSetRole(1,'qty');salesExcelSetRole(2,'width');salesExcelSetRole(3,'height');salesExcelSetRole(4,'mark');
      salesExcelApply();
      const l=soDraft.lines[0];
      return {qty:l.qty,w:l.width16,h:l.height16,mark:l.mark};
    })()`), {qty:2,w:30*16,h:80*16,mark:'A1'});
    /* Шапка, назвавшая только размеры, обязана остаться в силе: раньше она
       отбрасывалась целиком и разметка по содержимому уезжала на колонку
       влево — Width попадал в Qty, а Height в Width. */
    eq('шапка без Qty не сдвигает размеры', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('Width\\tHeight\\tMark\\n30\\t80\\tA1',0);
      const r=soExcelRows[0];salesExcelApply();
      const l=soDraft.lines[0];
      return {cells:[r.qty,r.width,r.height,r.mark],qty:l.qty,w:l.width16,h:l.height16};
    })()`), {cells:['','30','80','A1'],qty:1,w:30*16,h:80*16});
    /* После Add блок вставки забывается: иначе «Change columns» вернул бы уже
       добавленные строки обратно в сетку и повторный Add их удвоил. */
    eq('после Add блок вставки не хранится', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('2\\t30\\t80\\tA1\\n1\\t24\\t60\\tB2\\n5\\tabc\\t80\\tC3',0);
      salesExcelApply();
      return {lines:soDraft.lines.length,block:soExcelBlock};
    })()`), {lines:2,block:null});
    /* Кавычка — обёртка поля только в начале ячейки: в размерах '"' это дюймы. */
    eq('кавычки CSV не режут значение и не склеивают ячейки', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('2,30,80,"A1, left"',0);
      const csv=soExcelRows[0].mark;
      salesExcelClearGrid();
      salesExcelPasteText('1\\t30"\\t80\\tA1',0);
      const r=soExcelRows[0];
      return {csv,inches:[r.width,r.height,r.mark]};
    })()`), {csv:'A1, left',inches:['30"','80','A1']});
    /* Safety Border доезжает до строки заказа. Раньше он считался только
       внутри Shape: в Order Effective и в машинный payload заказа не попадал
       вовсе, поэтому раскрой не знал про отступ, за который платит клиент. */
    eq('бордер доезжает до Order Effective и в payload заказа', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tA1',0);salesExcelApply();
      const line=soDraft.lines[0];
      /* Обработка живёт на форме строки: полировка по периметру задаётся ей. */
      const ownRect=salesShapeByRef(line.shapeRef);
      ['A','B','C','D'].forEach(id=>ownRect.edgeOps[id]=[shapeNormalizeOp({type:'Flat Polish'})]);
      const rect=salesEffectiveCuttingPlan(line,null,soDraft);
      const def=normalizeShapeDef({id:'SHP-BORDER',name:'Raked',type:'raked',w:'30',h:'50',h2:'40',thickness:'6',edgeOps:{A:[{type:'Flat Polish'}],B:[{type:'Flat Polish'}],C:[{type:'Flat Polish'}],D:[{type:'Flat Polish'}]}});
      DB.shapeDef.push(def);line.shapeRef={id:'SHP-BORDER',revision:def.revision||0};
      const plan=salesEffectiveCuttingPlan(line,null,soDraft),pay=salesEffectiveMachinePayload(line);
      return {
        rect:{applies:rect.safetyBorder.applies,sameAsCut:rect.footprint.width===rect.cutW&&rect.footprint.height===rect.cutH},
        raked:{applies:plan.safetyBorder.applies,value:plan.safetyBorder.value,pad:plan.footprint.pad},
        payload:{value:pay.safetyBorder.value,sides:pay.billableFootprint.sides,outerSame:pay.outer.points.length===plan.cuttingPoints.length}
      };
    })()`), {rect:{applies:false,sameAsCut:true},raked:{applies:true,value:1,pad:{left:0,right:0,top:1,bottom:0}},payload:{value:1,sides:['top'],outerSame:true}});
    /* Rough Arris, Flat Polish и CNC Shape Polish взаимоисключающие: выбор
       новой обработки ПОДМЕНЯЕТ прежнюю. Раньше кнопка дописывала операцию, и
       CNC поверх уже стоявшей полировки давал ошибку и блокировал рез. */
    eq('базовые обработки кромки подменяют друг друга, а не спорят', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tA1',0);salesExcelApply();
      salesOrderConfigureShape(0);
      toggleShapeEdgeOp(0,1,true);const flat=(sDraft.edgeOps.A||[]).map(o=>o.type);
      toggleShapeEdgeOp(0,2,true);const cnc=(sDraft.edgeOps.A||[]).map(o=>o.type);
      const afterCnc=ShapeModule.compute(sDraft);
      toggleShapeEdgeOp(0,3,true);const withMiter=(sDraft.edgeOps.A||[]).map(o=>o.type);
      return {flat,cnc,valid:afterCnc.valid,errors:(afterCnc.errors||[]).length,withMiter};
    })()`), {flat:['Flat Polish'],cnc:['CNC Shape Polish'],valid:true,errors:0,withMiter:['CNC Shape Polish','Mitering']});
    /* Всё, что задано внутри формы, — база номер один. Массовое изменение идёт
       модификацией и не имеет права встать выше: оно заполняет только кромки,
       где на форме ничего нет. */
    eq('массовое изменение не перекрывает обработку формы', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tA1',0);salesExcelApply();
      const line=soDraft.lines[0],shape=salesShapeByRef(line.shapeRef);
      shape.edgeOps.A=[shapeNormalizeOp({type:'CNC Shape Polish'})];
      const set=salesNormalizeServiceSet({code:'S1',mode:'perimeter',perimeter:[{type:'Flat Polish'}]},0);
      soDraft.serviceSets=[set];
      salesApplySetOpsToShape(line,set);
      const after=salesShapeByRef(line.shapeRef).edgeOps;
      return {A:after.A.map(o=>o.type),B:(after.B||[]).map(o=>o.type)};
    })()`), {A:['CNC Shape Polish'],B:['Flat Polish']});
    /* Кромка считается ПО ЛАЙТАМ — правила цеха, владелец 31 августа 2026:
       стеклопакет получает арис на всех лайтах (кромка спрятана внутри),
       одиночное стекло — по толщине, ламинат — одна кромка на всю склейку.
       Комбинация 10 + 6 раньше упиралась в «Exact Makeup thickness is
       unresolved» и не считалась вовсе. */
    eq('пакет 10 + 6: арис на обоих лайтах, рез не блокируется, ставки свои', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tX',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      const g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
      m.unitType='double';
      m.panes[0].category='vision';m.panes[0].glassProductId=g(10).id;m.panes[0].thicknessMm=10;
      m.panes[1].category='vision';m.panes[1].glassProductId=g(6).id;m.panes[1].thicknessMm=6;
      const snap=salesEffectiveProductionSnapshot(line,null,soDraft),plan=salesEffectiveCuttingPlan(line,null,soDraft);
      return {
        lites:(snap.lites||[]).map(l=>[l.label,l.thicknessMm,l.baseEdgework].join(' ')),
        cutting:plan.valid,
        rows:salesLineChargeRows(line).map(r=>[r.label,r.basis,r.catalogRate].join(' ')),
        total:salesLinePricingSummary(line).total
      };
    })()`), {lites:['Lite 1 10 arris','Lite 2 6 arris'],cutting:true,
      rows:['Rough Arris · 10 mm 128 0.02','Rough Arris · 6 mm 128 0.01'],total:3.84});
    eq('одиночное стекло: до 8 мм арис, от 10 мм полировка', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tX',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      const g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
      m.unitType='single';m.panes=[m.panes[0]];
      m.panes[0].category='vision';m.panes[0].glassProductId=g(6).id;m.panes[0].thicknessMm=6;
      const thin=salesLineLites(line)[0].baseEdgework;
      m.panes[0].glassProductId=g(12).id;m.panes[0].thicknessMm=12;
      const thick=salesLineLites(line)[0].baseEdgework;
      const plan=salesEffectiveCuttingPlan(line,null,soDraft);
      return {thin,thick,lites:plan.lites.length,cut:[plan.cutW,plan.cutH]};
    })()`), {thin:'arris',thick:'polish',lites:1,cut:[20.375,44.375]});
    /* «Все лайты» означает ВСЕ: правка на этой вкладке снимает собственную
       обработку лайтов по этой кромке. Иначе выбор молча не срабатывал —
       обработка лайта сильнее общей. */
    eq('правка на вкладке «Все лайты» перебивает обработку лайтов', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tALL',0);salesExcelApply();
      salesOrderConfigureShape(0);
      setShapeEdgeLite(1);toggleShapeEdgeOp(0,1,true);          /* Lite 2: полировка на A */
      const onlyLite={lite:Object.keys(sDraft.lites['1'].edgeOps),shared:Object.keys(sDraft.edgeOps)};
      setShapeEdgeLite(null);toggleShapeEdgeOp(0,2,true);        /* все лайты: CNC на A */
      saveShape();tab='sales';render();
      const plan=salesEffectiveCuttingPlan(soDraft.lines[0],null,soDraft);
      return {onlyLite,liteLeft:Object.keys((salesShapeByRef(soDraft.lines[0].shapeRef).lites['1']||{}).edgeOps||{}),
        effect:plan.lites.map(l=>l.groups[0].ops.map(o=>o.type).join('+'))};
    })()`), {onlyLite:{lite:['A'],shared:[]},liteLeft:[],effect:['CNC Shape Polish','CNC Shape Polish']});
    /* Пакет из разных стёкол больше не проваливает редактор формы. Правило
       «одна толщина на строку» писалось до расчёта по лайтам: теперь у формы
       лайта берётся толщина ЕГО стекла, а у общей — самое толстое из тех, что
       на ней живут. Закрываемся только когда толщины нет вообще. */
    eq('пакет 6 + 12 не ломает редактор формы', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t60\\tMIX',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      const g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
      m.unitType='double';
      m.panes[0].category='vision';m.panes[0].glassProductId=g(6).id;m.panes[0].thicknessMm=6;
      m.panes[1].category='vision';m.panes[1].glassProductId=g(12).id;m.panes[1].thicknessMm=12;
      salesOrderConfigureShape(0);
      const shared={thickness:sDraft.thickness,valid:ShapeModule.compute(sDraft).valid};
      salesBridgeCancel('shape');
      salesOpenLiteShape(line.id,0);const lite1={thickness:sDraft.thickness,valid:ShapeModule.compute(sDraft).valid};saveShape();
      salesOpenLiteShape(line.id,1);const lite2={thickness:sDraft.thickness,valid:ShapeModule.compute(sDraft).valid};saveShape();
      tab='sales';render();
      salesOrderConfigureShape(0);
      const orphan=!!document.querySelector('.shape-lite-note.own');
      return {shared,lite1,lite2,orphanWarning:(sLiteSplitOpen=true,render(),!!document.querySelector('.shape-lite-cards .shape-lite-note.own'))};
    })()`), {shared:{thickness:'12',valid:true},lite1:{thickness:'6',valid:true},lite2:{thickness:'12',valid:true},orphanWarning:true});
    /* Кнопка AR · ALL AROUND — решение по всей форме, значит и по всем лайтам.
       Раньше она отрабатывала молча: форма получала полировку, а лайт со своей
       старой обработкой продолжал уходить в производство и в счёт арисом, при
       этом карточка кромки показывала полировку. */
    eq('AR · ALL AROUND снимает обработку лайтов, и карточка не врёт', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t48\\t36\\tAR',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      m.unitType='single';m.panes=[m.panes[0]];
      m.panes[0].category='vision';m.panes[0].glassProductId='';m.panes[0].thicknessMm=6;
      salesOrderConfigureShape(0);
      setShapeEdgeLite(0);[0,1,2,3].forEach(gi=>toggleShapeEdgeOp(gi,0,true));   /* лайту арис */
      const liteBefore=Object.keys((sDraft.lites['0']||{}).edgeOps||{}).length;
      setShapeEdgeLite(null);
      shapeProdApplyConfiguredAR('Flat Polish');                                  /* полировка на всю форму */
      const liteAfter=Object.keys((sDraft.lites&&sDraft.lites['0']||{}).edgeOps||{}).length;
      saveShape();tab='sales';render();
      const snap=salesEffectiveProductionSnapshot(line,null,soDraft),plan=salesEffectiveCuttingPlan(line,null,soDraft);
      return {liteBefore,liteAfter,
        card:snap.groups.map(g=>(g.effectiveOps||g.ops).map(o=>o.type).join('+')),
        cut:[plan.cutW,plan.cutH],
        charge:salesLineChargeRows(line).map(r=>[r.label,r.basis].join(' '))};
    })()`), {liteBefore:4,liteAfter:0,
      card:['Flat Polish','Flat Polish','Flat Polish','Flat Polish'],
      cut:[48.125,36.125],charge:['Flat Polish 168']});
    /* Разделение лайтов вынесено в отдельную видимую секцию редактора формы:
       стёкла юнита почти всегда повторяют одну фигуру, поэтому отличия — это
       исключение, и место ему на виду, а не внутри обработки кромок.
       Зеркало нужно, когда стекло приходит перевёрнутым (например Low-E на #2),
       и работает для любого лайта, а не только для покрытий. */
    eq('лайт зеркалится и это видно в секции лайтов, а не в кромках', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tMIR',0);salesExcelApply();
      salesOrderConfigureShape(0);
      setShapeType('triangle');sDraft.params.apexX='6';
      sLiteSplitOpen=true;render();
      const section=!!document.querySelector('.shape-lite-cards');
      const insideEdgework=!!document.querySelector('.shape-edgework-matrix .shape-lite-insets');
      const thumbsBefore=Array.from(document.querySelectorAll('.shape-lite-card svg.shape-mini path')).map(p=>p.getAttribute('d'));
      setShapeLiteMirror(1,true);sLiteSplitOpen=true;render();
      /* Зеркало не видно на общем чертеже формы — оно про отдельное стекло,
         поэтому у каждого лайта своя миниатюра контура. */
      const thumbsAfter=Array.from(document.querySelectorAll('.shape-lite-card svg.shape-mini path')).map(p=>p.getAttribute('d'));
      saveShape();tab='sales';render();
      const plan=salesEffectiveCuttingPlan(soDraft.lines[0],null,soDraft);
      return {section,insideEdgework,
        thumbs:thumbsAfter.length,thumbChanged:thumbsBefore[1]!==thumbsAfter[1],lite1Same:thumbsBefore[0]===thumbsAfter[0],
        mirrored:plan.lites.map(l=>!!l.mirrored),
        apex:plan.lites.map(l=>l.finishedPoints[1][0]),
        sizes:plan.lites.map(l=>[l.finishedW,l.finishedH].join('x'))};
    })()`), {section:true,insideEdgework:false,thumbs:2,thumbChanged:true,lite1Same:true,
      mirrored:[false,true],apex:[6,24],sizes:['30x50','30x50']});
    /* Фигура 10 + 6, где 6 мм просто другой контур: отступом это не описывается,
       поэтому лайт получает СВОЮ форму — копию общей на момент отделения. */
    eq('лайт получает собственную форму, а размеры строки остаются от общей', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tOWN',0);salesExcelApply();
      const line=soDraft.lines[0];
      salesOpenLiteShape(line.id,1);
      const bridge={lite:salesBridge.liteIndex,name:sDraft.name};
      sDraft.w='28';sDraft.h='46';saveShape();
      tab='sales';render();
      const plan=salesEffectiveCuttingPlan(line,null,soDraft),pay=salesEffectiveMachinePayload(line);
      return {bridge,
        lites:plan.lites.map(l=>[l.label,l.ownShape?'own':'shared',l.finishedW,l.finishedH].join(' ')),
        lineDims:[line.width16,line.height16],
        payload:pay.lites.map(l=>[l.width,l.height].join('x')),
        liteShapeInLibrary:DB.shapeDef.filter(s=>!salesShapeIsLineOwned(s)).some(s=>s.name.indexOf('Lite 2')>=0)};
    })()`), {bridge:{lite:1,name:'SO · OWN · Lite 2'},
      lites:['Lite 1 shared 30 50','Lite 2 own 28 46'],lineDims:[480,800],
      payload:['30x50','28x46'],liteShapeInLibrary:false});
    /* Ступенчатый пакет: у первого стекла контур формы, второе меньше на отступ,
       и у каждого своя кромка. Всё это задаётся ВНУТРИ формы — вкладками по
       лайтам, а не в карточке стекла. */
    eq('лайт получает свой отступ и свою кромку внутри формы', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tSTEP',0);salesExcelApply();
      salesOrderConfigureShape(0);
      [0,1,2,3].forEach(gi=>toggleShapeEdgeOp(gi,0,true));      /* арис на все кромки формы */
      setShapeEdgeLite(1);                                       /* вкладка Lite 2 */
      [0,1,2,3].forEach(gi=>setShapeLiteInset(gi,'1/2'));
      toggleShapeEdgeOp(0,1,true);                               /* полировка на кромке A только у Lite 2 */
      const shared=Object.keys(sDraft.edgeOps).sort().join(',');
      const spec=sDraft.lites['1'];
      saveShape();tab='sales';render();
      const line=soDraft.lines[0],plan=salesEffectiveCuttingPlan(line,null,soDraft);
      return {
        shared,liteInsets:Object.keys(spec.inset).sort().join(','),liteOps:Object.keys(spec.edgeOps).join(','),
        finished:plan.lites.map(l=>[l.finishedW,l.finishedH].join('x')),
        cuts:plan.lites.map(l=>[l.cutW,l.cutH].join('x')),
        uniform:plan.uniformCut,
        charges:salesLineChargeRows(line).map(r=>[r.label,r.basis].join(' '))
      };
    })()`), {shared:'A,B,C,D',liteInsets:'A,B,C,D',liteOps:'A',
      finished:['20x44','19x43'],cuts:['20x44','19.0625x43'],uniform:false,
      charges:['Rough Arris 209','Flat Polish 43']});
    /* Ламинат — один кусок: плёнка не делит кромку на два стекла. */
    eq('ламинат считается одной кромкой, в пакете получает арис', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tX',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      const g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
      const pane=salesDefaultPane(0);pane.category='laminated';
      pane.laminated.outer.glassProductId=g(6).id;pane.laminated.outer.thicknessMm=6;
      pane.laminated.inner.glassProductId=g(6).id;pane.laminated.inner.thicknessMm=6;
      m.unitType='single';m.panes=[normalizeSalesPane(pane,0)];
      const alone=salesLineLites(line);
      m.unitType='double';m.panes=[m.panes[0],normalizeSalesPane({category:'vision',glassProductId:g(6).id,thicknessMm:6},1)];
      const inUnit=salesLineLites(line);
      return {
        alone:{count:alone.length,kind:alone[0].baseEdgework,laminated:alone[0].laminated},
        inUnit:inUnit.map(l=>l.baseEdgework)
      };
    })()`), {alone:{count:1,kind:'polish',laminated:true},inUnit:['arris','arris']});
    /* Разная толщина — разный припуск, значит и рез у лайтов разный. */
    eq('лайты с разным припуском режутся по-разному и уходят разными файлами', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t20\\t44\\tX',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      const g=mm=>(DB.glassProduct||[]).find(x=>+x.thicknessMm===mm);
      m.unitType='double';
      m.panes[0].category='vision';m.panes[0].glassProductId=g(12).id;m.panes[0].thicknessMm=12;
      m.panes[1].category='vision';m.panes[1].glassProductId=g(6).id;m.panes[1].thicknessMm=6;
      const shape=salesShapeByRef(line.shapeRef);
      ['A','B','C','D'].forEach(id=>shape.edgeOps[id]=[shapeNormalizeOp({type:'Flat Polish'})]);
      const plan=salesEffectiveCuttingPlan(line,null,soDraft),pay=salesEffectiveMachinePayload(line);
      return {
        cuts:plan.lites.map(l=>[l.thickness,l.cutW,l.cutH].join(' ')),
        uniform:plan.uniformCut,
        payloadLites:pay.lites.map(l=>[l.thicknessMm,l.width,l.height].join(' '))
      };
    })()`), {cuts:['12 20.375 44.375','6 20.125 44.125'],uniform:false,
      payloadLites:['12 20.375 44.375','6 20.125 44.125']});
    /* Базовая кромка от стекла — это работа, за которую выставляется счёт. */
    eq('базовая кромка от стекла попадает в начисления', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('2\\t30\\t50\\tA1',0);salesExcelApply();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      /* Одиночное стекло: кромка по толщине — 6 mm арис, 12 mm полировка. */
      m.unitType='single';m.panes=[m.panes[0]];
      const arris=salesLineChargeRows(line).map(r=>({label:r.label,basis:r.basis,rate:r.catalogRate}));
      const g12=(DB.glassProduct||[]).find(g=>+g.thicknessMm===12);
      m.panes.forEach(p=>{p.category='vision';p.glassProductId=g12.id;p.thicknessMm=12;});
      const single=salesLineChargeRows(line).map(r=>({label:r.label,basis:r.basis,rate:r.catalogRate}));
      /* Стеклопакет из тех же 12 mm — арис на ОБОИХ лайтах, длина удваивается. */
      m.unitType='double';m.panes=[m.panes[0],normalizeSalesPane({category:'vision',glassProductId:g12.id,thicknessMm:12},1)];
      const unit=salesLineChargeRows(line).map(r=>({label:r.label,basis:r.basis,rate:r.catalogRate}));
      return {arris,single,unit,total:salesLinePricingSummary(line).total};
    })()`), {arris:[{label:'Rough Arris',basis:160,rate:.01}],
      single:[{label:'Flat Polish',basis:160,rate:.13}],
      unit:[{label:'Rough Arris',basis:320,rate:.03}],total:19.2});
    /* 16–19 мм с полировкой раньше блокировали рез целиком. */
    eq('19 мм с Flat Polish режется, а не блокируется', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('1\\t30\\t50\\tA1',0);salesExcelApply();
      const line=soDraft.lines[0],mk=salesMakeupById(soDraft,line.makeupId);
      /* 19 mm получает Flat Polish базовой кромкой от самого стекла. Полировка
         по толщине — правило ОДИНОЧНОГО стекла: у пакета кромка спрятана и там
         арис на всех лайтах. */
      mk.unitType='single';mk.panes=[mk.panes[0]];
      const g19=(DB.glassProduct||[]).find(g=>+g.thicknessMm===19);
      soDraft.makeups[0].panes.forEach(pn=>{pn.category='vision';pn.glassProductId=g19.id;pn.thicknessMm=19;});
      const plan=salesEffectiveCuttingPlan(line,null,soDraft);
      return {valid:plan.valid,thickness:plan.thickness,cut:[plan.cutW,plan.cutH]};
    })()`), {valid:true,thickness:19,cut:[31,51]});
    eq('пустое Qty считается как одна штука и помечается', await t.p.evaluate(`(()=>{
      tab='sales';render();salesOrderNew();soDraft.lines=[];
      salesExcelPasteText('Qty\\tWidth\\tHeight\\tMark\\n\\t30\\t80\\tA1',0);
      const v=salesExcelValidateRow(soExcelRows[0]);
      return {qty:v.qty,assumed:v.qtyAssumed,ok:v.ok};
    })()`), {qty:1,assumed:true,ok:true});
    await t.c.close();

    t = await page();
    eq('Sales bridge использует существующие Shape и Muntin configurators', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();soDraft.lines[0].width16=48*16;soDraft.lines[0].height16=36*16;
      salesOrderConfigureShape(0);saveShape();const shapeId=soDraft.lines[0].shapeRef.id,backFromShape=tab==='sales'&&!!shapeId;
      salesOrderConfigureMuntin(0);saveMuntin();const muntinId=soDraft.lines[0].muntinRef.id,backFromMuntin=tab==='sales'&&!!muntinId;
      return {backFromShape,backFromMuntin,shapeIdMatch:DB.muntinDef.find(m=>m.id===muntinId).shapeId===shapeId};
    }), {backFromShape:true,backFromMuntin:true,shapeIdMatch:true});
    eq('Shape edge allowance берёт толщину из выбранного Sales Makeup', await t.p.evaluate(() => {
      tab='sales';render();salesOrderNew();
      const line=soDraft.lines[0],m=salesMakeupById(soDraft,line.makeupId);
      m.panes.forEach(p=>{p.glassProductId='';p.thicknessMm=12;});
      salesOrderConfigureShape(0);const th12=sDraft.thickness,allow12=shapePolishAllowance(+sDraft.thickness);
      salesBridgeCancel('shape');m.panes.forEach(p=>{p.glassProductId='';p.thicknessMm=10;});
      salesOrderConfigureShape(0);const th10=sDraft.thickness,allow10=shapePolishAllowance(+sDraft.thickness);
      salesBridgeCancel('shape');
      if(m.panes.length<2)m.panes.push(salesDefaultPane(1));m.panes[0].glassProductId='';m.panes[0].thicknessMm=10;m.panes[1].glassProductId='';m.panes[1].thicknessMm=12;
      salesOrderConfigureShape(0);sDraft.edgeOps.A=[shapeNormalizeOp({type:'Flat Polish'})];const mixed=ShapeModule.compute(sDraft);
      return {th12,allow12,th10,allow10,mixedThickness:sDraft.thickness,mixedValid:mixed.valid,mixedError:(mixed.errors||[]).join(' | ')};
    /* Пакет из разных стёкол больше не закрывается: раньше одной безопасной
       толщины у него не было, теперь каждый лайт считается со своей, а общая
       форма показывает худший случай припуска — самое толстое стекло юнита. */
    }), {th12:'12',allow12:3/16,th10:'10',allow10:1/8,mixedThickness:'12',mixedValid:true,mixedError:''});
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
    }), [3, 51, 4, 54, 12]);
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

    eq('покрытия идут склад → предзаказ, а не просто по алфавиту', await t.p.evaluate(() => {
      const pane = { manufacturer: 'Vitro', thicknessMm: 6, visionType: 'lowe', glassProductId: '' };
      const coatings = salesGlassCoatings(pane), firstPreorder = coatings.findIndex(c => !salesGlassCoatingHasStock(pane, c));
      return [coatings.slice(0, 2), firstPreorder,
              coatings.slice(0, firstPreorder).every(c => salesGlassCoatingHasStock(pane, c)),
              coatings.slice(firstPreorder).every(c => !salesGlassCoatingHasStock(pane, c)),
              glassProductByCode('6SBN70GLASS').stocked];
    }), [['Solarban 60', 'Solarban 70'], 2, true, true, true]);

    eq('новый Lite сразу выбирает Clear', await t.p.evaluate(() => {
      const pane = salesDefaultPane(0), glass = glassProductById(pane.glassProductId);
      return [glass.code, glass.name, pane.laminated.outer.glassProductId,
              pane.laminated.inner.glassProductId];
    }), ['6CLEAR', 'Clear 6mm', 'GL-6CLEAR', 'GL-6CLEAR']);

    eq('обычное стекло идёт Clear → склад → предзаказ', await t.p.evaluate(() => {
      const pane = { manufacturer: 'Vitro', thicknessMm: 6, visionType: 'uncoated', glassProductId: '' };
      const rows = salesGlassCandidates(pane), firstPreorder = rows.findIndex(g => !g.stocked);
      const stockedNames = rows.slice(1, firstPreorder).map(g => g.name);
      const preorderNames = rows.slice(firstPreorder).map(g => g.name);
      const alpha = names => names.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
      return [rows[0].code, firstPreorder > 1,
              rows.slice(1, firstPreorder).every(g => g.stocked === true),
              rows.slice(firstPreorder).every(g => g.stocked !== true),
              stockedNames.join('|') === alpha(stockedNames).join('|'),
              preorderNames.join('|') === alpha(preorderNames).join('|')];
    }), ['6CLEAR', true, true, true, true, true]);

    eq('после смены типа покрытие тоже стартует с Clear', await t.p.evaluate(() => {
      tab = 'sales'; subtab = null; render(); salesOrderNew();
      salesPaneSetVisionType(0, 'lowe');
      const glass = glassProductById(salesCurrentMakeup().panes[0].glassProductId);
      const rows = salesGlassVariants(salesCurrentMakeup().panes[0], glassCoatingName(glass));
      const html = salesVisionFieldsSafe(salesCurrentMakeup().panes[0], 0);
      return [glassCoatingName(glass), glassBaseName(glass), glass.stocked,
              glassBaseName(rows[0]), rows[0].id === glass.id,
              html.indexOf('BirdSmart (1) Solarban 65 (2) · '+glassLabel('stock', 'preorder')) > 0];
    }), ['Solarban 60', 'Clear', true, 'Clear', true, true]);

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

  /* --- 5h. Cutout: одна категория и справочник фурнитуры -------------
     Владелец 31 августа 2026: «давай сделаем это одной категорией Cutout» и
     «hole тоже туда». Проверяем не оформление, а то, ради чего категорию не
     свели плоским списком: половина элементов меняет файл раскроя, половина
     нет, и это должно быть видно на каждой карточке. */
  {
    console.log('Cutout · справочник фурнитуры');
    let t = await page();
    eq('справочник фурнитуры засевается один раз: удалённая заводская строка не возвращается', await t.p.evaluate(() => {
      const seeded={kinds:DB.hardwareKind.map(k=>k.code),hinge:hardwareModelsFor('hinge').map(m=>m.name),seed:DB.hardwareSeed};
      DB.hardwareModel=DB.hardwareModel.filter(m=>m.id!=='hw-clamp-scu4');
      DB.hardwareKind.push(normalizeHardwareKind({code:'pivot',name:'Пивот',nameEn:'Pivot',short:'PVT'}));
      DB.hardwareModel.push(normalizeHardwareModel({id:'own-1',kind:'pivot',name:'Мой пивот'}));
      normalizeHardwareCatalog();
      const afterDelete={scu4:!!hardwareModelById('hw-clamp-scu4'),ownKind:!!hardwareKindRow('pivot'),ownModel:!!hardwareModelById('own-1')};
      /* подъём версии — единственный случай, когда заводские строки приезжают снова */
      DB.hardwareSeed=0;normalizeHardwareCatalog();
      return {seeded,afterDelete,afterBump:!!hardwareModelById('hw-clamp-scu4'),ownSurvivedBump:!!hardwareModelById('own-1')};
    }), {
      seeded:{kinds:['hinge','clamp','patch'],hinge:['Geneva 135 / 45','Geneva 180','Geneva 90','Vienna 135 / 45','Vienna 180','Vienna 90'],seed:1},
      afterDelete:{scu4:false,ownKind:true,ownModel:true},afterBump:true,ownSurvivedBump:true});
    eq('битая строка справочника отбрасывается, модель без вида остаётся видимой', await t.p.evaluate(() => {
      DB.hardwareKind=DB.hardwareKind.concat([{code:'ПЕТЛЯ',name:'x',nameEn:'x'},{code:'ok-kind',name:'',nameEn:''}]);
      DB.hardwareModel=DB.hardwareModel.concat([{id:'no-name',kind:'hinge',name:''},{id:'orphan',kind:'ghost',name:'Ghost'}]);
      normalizeHardwareCatalog();
      return {badCode:!!hardwareKindRow('петля'),noName:!!hardwareKindRow('ok-kind'),
        noModelName:!!hardwareModelById('no-name'),orphan:!!hardwareModelById('orphan'),orphanKind:!!hardwareKindRow('ghost')};
    }), {badCode:false,noName:false,noModelName:false,orphan:true,orphanKind:false});
    await t.c.close();

    t = await page();
    eq('Cutout — одна категория с двумя подписанными группами и меткой на карточке', await t.p.evaluate(() => {
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';
      sDraft.manufacturingItems=[
        shapeNormalizeManufacturingItem({id:'m1',type:'hinge',edge:'left',distance:6,modelId:'hw-hinge-vienna-180',model:'Vienna 180'}),
        shapeNormalizeManufacturingItem({id:'m2',type:'hole',x:3,y:8,diameter:'3/4',hRef:'left',vRef:'bottom'})];
      sDraft.features=[newShapeFeature('cutout',shapeDraftGeometry())];
      sManufacturingOpen=true;sManufacturingSelected='m1';render();
      const root=document.getElementById('app');
      const kinds=[...root.querySelectorAll('.shape-cut-group.marks .shape-mi-toolbar button')].map(b=>b.textContent.trim());
      const model=root.querySelector('.shape-mi-card.expanded select');
      const marker=[...root.querySelectorAll('.shape-mi-marker text')].map(x=>x.textContent).join(' | ');
      const out={accordions:[...root.querySelectorAll('.shape-accordion-head b')].map(x=>x.textContent),
        cutout:root.querySelectorAll('.shape-cutout').length,
        groups:[...root.querySelectorAll('.shape-cut-group-head b')].map(x=>x.textContent),
        flags:{draw:root.querySelectorAll('.shape-cut-flag.draw').length,cut:root.querySelectorAll('.shape-cut-flag.cut').length},
        kinds:kinds,
        modelOptions:model?[...model.options].map(o=>o.textContent):[],
        markerHasModel:marker.indexOf('Vienna 180')>=0};
      sEdit=null;sDraft=null;render();return out;
    /* Двух секций больше нет: «Manufacturing items» и «Geometry modifiers» сведены
       в одну категорию Cutout. Язык интерфейса по умолчанию английский. */
    }), {accordions:['Edge processing','Cutout'],cutout:1,
      groups:['Does not change the cut','Changes the cutting shape'],flags:{draw:2,cut:1},
      kinds:['+ Hole','+ Hinge','+ Clamp','+ Patch'],
      modelOptions:['— not selected —','Geneva 135 / 45','Geneva 180','Geneva 90','Vienna 135 / 45','Vienna 180','Vienna 90','Own model'],
      markerHasModel:true});
    eq('выбранная модель видна и после того, как её выключили или удалили из справочника', await t.p.evaluate(() => {
      function field(){const c=document.querySelector('.shape-mi-card.expanded');const sel=c.querySelector('select');
        return {selected:sel.options[sel.selectedIndex].textContent,note:c.querySelector('label small').textContent};}
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';
      sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'a',type:'hinge',edge:'left',distance:4,modelId:'hw-hinge-vienna-180',model:'Vienna 180'})];
      sManufacturingOpen=true;sManufacturingSelected='a';render();const listed=field();
      hardwareModelById('hw-hinge-vienna-180').active=false;render();const off=field();
      DB.hardwareModel=DB.hardwareModel.filter(m=>m.id!=='hw-hinge-vienna-180');render();const gone=field();
      sEdit=null;sDraft=null;render();return {listed,off,gone};
    }), {listed:{selected:'Vienna 180',note:'from the hardware catalog'},
      off:{selected:'Vienna 180',note:'this model is switched off in the catalog'},
      gone:{selected:'Vienna 180',note:'this model is not in the catalog'}});
    eq('у фигуры из DXF в категории только метки: своей геометрии в ERP нет', await t.p.evaluate(() => {
      tab='configurators';subtab='shape';openShapeNew('rectangle');
      sDraft.source={kind:'dxf',fileName:'d.dxf',fileSize:900,uploadedAt:'2026-08-31T10:00:00.000Z',note:'',preview:{units:'in',points:[[0,0],[20,0],[20,40],[0,40]],width16:320,height16:640}};
      sDraft.w='20';sDraft.h='40';sDraft.thickness='10';
      sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'d1',type:'patch',edgeId:'seg1',distance:4,modelId:'hw-patch-ph20',model:'PH20'})];
      sManufacturingOpen=true;sManufacturingSelected='d1';render();
      const root=document.getElementById('app');
      const out={cutout:root.querySelectorAll('.shape-cutout').length,
        marks:root.querySelectorAll('.shape-cut-group.marks').length,
        cuts:root.querySelectorAll('.shape-cut-group.cuts').length,
        kind:(root.querySelector('.shape-mi-kind')||{}).textContent,
        title:(root.querySelector('.shape-mi-card b')||{}).textContent,
        marker:[...root.querySelectorAll('.shape-mi-marker text')].map(x=>x.textContent),
        model:!!root.querySelector('.shape-mi-card.expanded select')};
      /* Привязка вдоль сегмента работает и здесь: seg1 длиной 20″, 4″ от начала
         это 16″ от конца. Сама величина в записи не меняется. */
      shapeSetDimRef('d1','e','end');
      out.fromEnd=[...root.querySelectorAll('.shape-mi-marker text')].map(x=>x.textContent);
      out.stored=sDraft.manufacturingItems[0].distance;
      sEdit=null;sDraft=null;render();return out;
    }), {cutout:1,marks:1,cuts:0,kind:'PATCH',title:'Patch #1 · PH20',marker:['PATCH 1 · PH20 · seg1 @ 4″'],model:true,
      fromEnd:['PATCH 1 · PH20 · seg1 @ 16″'],stored:4});
    await t.c.close();

    t = await page();
    eq('у фурнитуры навигация как у отверстия: привязка меняет показанное, но не хранимое', await t.p.evaluate(() => {
      const dim=()=>document.querySelector('.shape-mi-prod-dims text').textContent;
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';sView='production';
      sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'m1',type:'patch',edge:'left',distance:6})];
      sManufacturingOpen=true;render();
      const start=dim();
      shapeSetDimRef('m1','e','end');
      const fromTop={shown:dim(),stored:sDraft.manufacturingItems[0].distance};
      /* Ввод идёт ОТ ПРИВЯЗКИ, хранится по-прежнему от начала кромки. */
      shapeSetManufacturingDistance('m1','5');
      const typed={stored:sDraft.manufacturingItems[0].distance,shown:dim()};
      const card=document.querySelector('.shape-mi-card small').textContent;
      sEdit=null;sDraft=null;render();
      return {start,fromTop,typed,card};
    }), {start:'6″',fromTop:{shown:'34″',stored:6},typed:{stored:35,shown:'5″'},
      card:'drawing onlyLeft · 5″ from the top corner to the center'});

    /* Владелец: «иногда патч прямо от края и странно указывать 0». Размер
       убирается с листа и возвращается по следу — насовсем он не пропадает. */
    eq('размер убирается с чертежа и возвращается по следу', await t.p.evaluate(() => {
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';sView='production';
      sDraft.manufacturingItems=[shapeNormalizeManufacturingItem({id:'m1',type:'patch',edge:'left',distance:0})];
      sManufacturingOpen=true;render();
      const zero=document.querySelector('.shape-mi-prod-dims text').textContent;
      shapeToggleDimHide('m1','e');
      const hidden={chains:document.querySelectorAll('.shape-mi-prod-dims').length,ghost:document.querySelectorAll('.shape-dim-ghost').length};
      sManufacturingSelected='m1';render();
      const selected={ghost:document.querySelectorAll('.shape-dim-ghost').length};
      shapeSelectDim('m1','e');
      const menu=[...document.querySelectorAll('.shape-dim-btn text')].map(x=>x.textContent);
      shapeToggleDimHide('m1','e');
      const back={text:document.querySelector('.shape-mi-prod-dims text').textContent,dims:JSON.parse(JSON.stringify(sDraft.dims||{}))};
      const lineX=()=>Math.round(+document.querySelector('.shape-mi-prod-dims line').getAttribute('x1'));
      const at0=lineX();shapeNudgeDim('m1','e',2);const moved=lineX();shapeNudgeDim('m1','e',-2);
      sEdit=null;sDraft=null;sManufacturingSelected=null;sDimEdit=null;render();
      return {zero,hidden,selected,menu,back,shift:at0-moved};
    }), {zero:'0″',hidden:{chains:0,ghost:0},selected:{ghost:1},menu:['closer','further','show'],
      back:{text:'0″',dims:{}},shift:28});

    eq('внутренний вырез получает размеры до центра, как отверстие', await t.p.evaluate(() => {
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';sView='production';
      sDraft.features=[newShapeFeature('cutout',shapeDraftGeometry())];
      const id=sDraft.features[0].id;sManufacturingOpen=true;render();
      const first=[...document.querySelectorAll('.shape-cut-dims text')].map(x=>x.textContent);
      const center=document.querySelectorAll('.shape-cut-center').length;
      shapeSetDimRef(id,'v','top');
      const fromTop=[...document.querySelectorAll('.shape-cut-dims text')].map(x=>x.textContent);
      /* Ввод до центра, а в записи по-прежнему нижний левый угол контура. */
      shapeSetDimRef(id,'v','bottom');shapeSetCutoutCenter(0,'v','15');
      const moved={y:sDraft.features[0].y,shown:[...document.querySelectorAll('.shape-cut-dims text')].map(x=>x.textContent)};
      sEdit=null;sDraft=null;render();
      return {first,center,fromTop,moved};
    }), {first:['10″','10″'],center:1,fromTop:['10″','30″'],moved:{y:'13',shown:['10″','15″']}});

    eq('EN без русского остатка: Cutout и справочник фурнитуры', await t.p.evaluate(() => {
      function cyrillicUi(){
        const out=new Set(),root=document.getElementById('app'),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
        while(n=w.nextNode()){const p=n.parentElement;if(!p||p.closest('[data-raw]'))continue;const v=n.nodeValue.trim();if(/[А-Яа-яЁё]/.test(v))out.add(v);}
        root.querySelectorAll('[placeholder],[title]').forEach(el=>{if(el.closest('[data-raw]'))return;['placeholder','title'].forEach(a=>{const v=el.getAttribute(a)||'';if(/[А-Яа-яЁё]/.test(v))out.add(a+': '+v);});});
        return [...out];
      }
      setLang('en');
      tab='configurators';subtab='shape';openShapeNew('rectangle');sDraft.w='20';sDraft.h='40';
      sDraft.manufacturingItems=[
        shapeNormalizeManufacturingItem({id:'m1',type:'patch',edge:'left',distance:6}),
        shapeNormalizeManufacturingItem({id:'m2',type:'hole',x:3,y:8,diameter:'3/4',hRef:'left',vRef:'bottom'})];
      sDraft.features=[newShapeFeature('cutout',shapeDraftGeometry()),newShapeFeature('radius',shapeDraftGeometry())];
      sManufacturingOpen=true;sManufacturingSelected='m1';render();
      const editor=cyrillicUi();
      sManufacturingCustomId='m1';render();const custom=cyrillicUi();
      sManufacturingCustomId=null;sEdit=null;sDraft=null;
      tab='masterdata';mdTab='hardware';render();const catalog=cyrillicUi();
      mdHwKindNew();render();const kindForm=cyrillicUi();mdHwKindEdit=null;
      mdHwModelNew();render();const modelForm=cyrillicUi();mdHwModelEdit=null;
      mdTab='glass';setLang('ru');render();
      return editor.concat(custom,catalog,kindForm,modelForm);
    }), []);
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
      const left=cyrillicUi();
      /* Локти — отдельный проход. Под матрицей рёбер у них своя строка-подсказка,
         и пока проверялось только выключенное состояние, её перевод никто не смотрел. */
      sDraft.smart.elbowsOn=true;render();const withElbows=cyrillicUi();
      sEdit=null;sDraft=null;sEdgeworkOpen=false;sFeaturesOpen=false;sManufacturingOpen=true;sManufacturingSelected=null;render();return left.concat(withElbows);
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
