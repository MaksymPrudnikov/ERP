/* Мелочи (аудит 24.11.2026, PR 4): формулы в CSV, общий перехват ошибок,
   удаление человека по id, выход с сервера. Имена — номера аудита. Н3
   (данные после снятия прав) — в test/server-fixes.js, на сервере. */
const fixture = require('./optimization-fixture');

module.exports = async function ({ page, eq }) {
  console.log('small fixes');
  const t = await page();
  await fixture(t.p);
  const p = t.p;

  /* Н1: имя клиента =HYPERLINK(…) становилось формулой в Excel. */
  eq('Н1: текст-формула в CSV — с апострофом, числа как есть; наш же Import снимает апостроф', await p.evaluate(() => {
    const cells = ['=HYPERLINK("http://x","y")', '+1', '@SUM(A1)', '-5', '-x', 'Glass, Inc'].map(csvCell);
    const back = parseCsv(cells.join(',') + '\n1,2,3,4,5,6').header;
    const rep = (() => { const keep = window.repExportRows; window.repExportRows = () => ({ head: ['Customer'], rows: [[{ t: 's', v: '=1+1' }]] }); try { return repCsvText({}, {}); } finally { window.repExportRows = keep; } })();
    return { cells, back, rep };
  }), {
    cells: ['\'=HYPERLINK(""http://x"",""y"")'.replace(/^/, '"').concat('"'), '\'+1', '\'@SUM(A1)', '-5', '\'-x', '"Glass, Inc"'],
    back: ['=HYPERLINK("http://x","y")', '+1', '@SUM(A1)', '-5', '-x', 'Glass, Inc'],
    rep: 'Customer\r\n\'=1+1\r\n'
  });

  /* Н4: Remove удалял по номеру строки — после синхронизации соседа. */
  eq('Н4: Remove — тот человек, которого выбрали, хотя список сдвинулся', await p.evaluate(async () => {
    const office = DB.user.filter(u => userOffice(u) && !(u.access || []).includes('users'));
    if (!office.length || DB.user.length < 2) return 'fixture: no office user without Users';
    const target = office[0], id = target.viewProfileId, others = DB.user.filter(u => u !== target).map(u => u.viewProfileId + ':' + userOffice(u));
    tab = 'users'; subtab = 'office'; uSel = id; render();
    const btn = document.querySelector('[data-user-remove]');
    DB.user.reverse(); /* пришла синхронизация: строки в другом порядке */
    const keep = [window.confirm, window.alert], msgs = []; window.confirm = () => true; window.alert = m => msgs.push(m);
    btn.click(); await new Promise(r => setTimeout(r, 300)); [window.confirm, window.alert] = keep;
    const u = usersFind(id); if (msgs.length) return msgs.join(' | ');
    return { gone: !u || !userOffice(u), others: DB.user.filter(x => x.viewProfileId !== id).map(x => x.viewProfileId + ':' + userOffice(x)).sort().join() === others.sort().join() };
  }), { gone: true, others: true });

  /* Н7: выход с сервера закрывает вход и там. */
  eq('Н7: Sign out зовёт /auth/v1/logout со своим токеном; без связи выход тот же', await p.evaluate(async () => {
    const keepCfg = JSON.stringify(cloudConfig()), keepFetch = window.fetch, calls = [];
    const c = cloudConfig(); c.url = 'https://audit.invalid'; c.key = 'anon-key'; c.session = { access: 'tok-1', refresh: 'r', exp: Date.now() + 3600e3, email: 'a@b.c' }; cloudConfigSave(c);
    window.fetch = (url, o) => { calls.push([url, o.headers.Authorization]); return Promise.reject(new Error('offline')); };
    try { cloudSignOut(); await new Promise(r => setTimeout(r, 50)); return { calls, session: !!cloudConfig().session }; }
    finally { window.fetch = keepFetch; cloudConfigSave(JSON.parse(keepCfg)); }
  }), { calls: [['https://audit.invalid/auth/v1/logout', 'Bearer tok-1']], session: false });

  eq('мелочи: без ошибок страницы', t.errs, []);
  await t.c.close();

  /* Н2: упавшее действие молча ничего не делало. */
  {
    const e = await page(); await fixture(e.p);
    await e.p.evaluate(() => { setTimeout(() => { throw new Error('Boom in an action'); }, 0); });
    await e.p.waitForTimeout(100);
    const shown = await e.p.evaluate(() => { const b = document.getElementById('storageAlert'); return !!b && !b.hidden && b.textContent; });
    await e.p.evaluate(() => { Promise.reject(new Error('Lost promise')); });
    await e.p.waitForTimeout(100);
    const rejected = await e.p.evaluate(() => document.getElementById('storageAlert').textContent);
    await e.p.evaluate(() => storageCrashHide());
    eq('Н2: ошибка страницы — полоса «Something went wrong» с текстом, Hide её убирает', { shown, rejected, after: await e.p.evaluate(() => document.getElementById('storageAlert').hidden) },
      { shown: 'Something went wrong: Boom in an actionHide', rejected: 'Something went wrong: Lost promiseHide', after: true });
    await e.c.close();
  }
};
