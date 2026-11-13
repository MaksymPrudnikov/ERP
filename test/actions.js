/* Действия экрана без кода в разметке (core/actions, задание «CSP без inline»,
   13.11.2026): слушатель на document повторяет встроенные обработчики —
   порядок от цели вверх, остановка, «только сам элемент», метки аргументов,
   события без подъёма; имя, которого нет в реестре, не вызывается. */
module.exports = async function ({ page, eq }) {
  console.log('actions');
  const t = await page();
  const got = await t.p.evaluate(() => {
    const log = [], box = document.createElement('div'); document.body.appendChild(box);
    function tOuter(a) { log.push('outer:' + a); }
    function tInner(a, el, ev, k) { log.push('inner:' + a + ':' + el.id + ':' + (ev.currentTarget === el) + ':' + ev.type + ':' + k); }
    function tPlain(a) { log.push('plain:' + a); box.querySelector('#o').remove(); }
    function tSelf() { log.push('self'); }
    function tField(v, c) { log.push('field:' + v + ':' + c); }
    function tFocus(el) { log.push('focus:' + el.id); }
    const text = 'O\'Brien "x" <b> & \\';
    box.innerHTML = `<div id="o" ${onAct('click', tOuter, text)}><button id="i" data-k="7" ${onActStop('click', tInner, 1, EL, EVENT, elData('k'))}>i</button>` +
      `<button id="p" ${onAct('click', tPlain, undefined)}>p</button></div>` +
      `<div id="s" ${onActSelf('click', tSelf)}><span id="sc">c</span></div>` +
      `<input id="f" value="v1" ${onAct('input', tField, EL_VALUE, EL_CHECKED)} ${onAct('focus', tFocus, EL)}><div id="fp" ${onAct('focus', tFocus, EL)}><input id="f2"></div>` +
      `<button id="bad" data-on-click="actNotAllowedProbe">x</button>`;
    let late = 0; const lateFn = () => { late++; }; document.addEventListener('click', lateFn);
    window.actNotAllowedProbe = () => log.push('NOT ALLOWED RAN');
    const click = id => box.querySelector('#' + id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    click('i'); const afterStop = late;
    click('p'); const afterPlain = late;
    click('sc'); click('s');
    box.querySelector('#f').dispatchEvent(new Event('input')); /* из кода, без bubbles — как у встроенного: только цель */
    box.querySelector('#f').focus(); box.querySelector('#f2').focus();
    click('bad');
    document.removeEventListener('click', lateFn); delete window.actNotAllowedProbe;
    const args = JSON.parse(box.querySelector('#f').getAttribute('data-args-input'));
    let unknown = '', anon = '';
    try { onAct('wheel', tSelf); } catch (e) { unknown = e.message; }
    try { onAct('click', (function () { return function () { }; })()); } catch (e) { anon = e.message; }
    box.remove();
    return { log, afterStop, afterPlain, markers: args, unknown, anon };
  });
  eq('действия: от цели вверх, stop не пускает дальше и к слушателям document, цепочка переживает перерисовку, «только сам элемент»', {
    log: got.log.slice(0, 5), afterStop: got.afterStop, afterPlain: got.afterPlain
  }, { log: ['inner:1:i:true:click:7', 'plain:undefined', 'outer:O\'Brien "x" <b> & \\', 'self', 'field:v1:false'], afterStop: 0, afterPlain: 1 });
  eq('действия: событие без подъёма (focus) — только у самой цели; имя не из реестра не вызывается; метки аргументов — данные', {
    rest: got.log.slice(5), markers: got.markers
  }, { rest: ['focus:f'], markers: [{ $: 'value' }, { $: 'checked' }] });
  eq('действия: неизвестное событие и безымянная функция — отказ при отрисовке', { unknown: got.unknown, anon: got.anon },
    { unknown: 'Unknown action event: wheel', anon: 'Action must be a named function.' });
  await t.c.close();
};
