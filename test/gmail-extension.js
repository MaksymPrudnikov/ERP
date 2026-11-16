/* Расширение «Glass Farm for Gmail» (extension/gmail/; задание docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md,
   этап 4): настоящий Chromium с загруженным расширением, страница-образец Gmail
   (та же разметка, что читает панель) и рядом вкладка ERP. Без сети: оба адреса
   подменены (context.route). Для проверки копия расширения открывает Shadow DOM
   панели (в продукте он закрыт — скрипты Gmail панель не читают). */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'extension/gmail');
const GMAIL = `<!doctype html><html><head><meta charset="utf-8"><title>Inbox - sales@infinity.example - Gmail</title></head><body><div id="main"></div><script>
window.gmShow=function(t){const m=document.getElementById('main');m.textContent='';
 if(!t){location.hash='inbox';return;}
 const h=document.createElement('h2');h.className='hP';h.textContent=t.subject;m.appendChild(h);
 t.messages.forEach(function(x){const d=document.createElement('div');d.className='adn';d.setAttribute('data-legacy-message-id',x.id);
  const s=document.createElement('span');s.className='gD';s.setAttribute('email',x.from);s.setAttribute('name',x.name||'');s.textContent=x.name||x.from;d.appendChild(s);
  const g=document.createElement('span');g.className='g3';g.setAttribute('title','Sat, Nov 15, 2026, 9:42 AM');d.appendChild(g);
  const b=document.createElement('div');b.className='a3s';b.textContent=x.body||'';d.appendChild(b);m.appendChild(d);});
 const r=document.createElement('span');r.className='ams bkH';r.textContent='Reply';r.onclick=function(){if(document.getElementById('compose'))return;
  const c=document.createElement('div');c.id='compose';c.setAttribute('contenteditable','true');c.setAttribute('role','textbox');c.style.minHeight='40px';
  c.addEventListener('dragover',function(e){e.preventDefault();});
  c.addEventListener('drop',function(e){e.preventDefault();[].forEach.call(e.dataTransfer.files,function(f){const a=document.createElement('div');a.className='att';a.setAttribute('data-via','drop');a.textContent=f.name+' '+f.size;m.appendChild(a);});});
  /* Attach files, как в Gmail: по mouseup создаёт input type=file и зовёт click() — окно выбора файла. */
  const b=document.createElement('div');b.setAttribute('command','Files');b.setAttribute('aria-label','Attach files');b.textContent='Attach';
  b.addEventListener('mouseup',function(){const i=document.createElement('input');i.type='file';i.addEventListener('change',function(){[].forEach.call(i.files,function(f){const a=document.createElement('div');a.className='att';a.setAttribute('data-via','input');a.textContent=f.name+' '+f.size;m.appendChild(a);});});i.click();});
  const w=document.createElement('div');w.className='reply';w.appendChild(c);w.appendChild(b);m.appendChild(w);};m.appendChild(r);
 location.hash='inbox/'+t.thread;};
</script></body></html>`;
module.exports = async function ({ eq }) {
  console.log('gmail extension');
  const files = fs.readdirSync(SRC), js = files.filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join(SRC, f), 'utf8')]);
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8')), code = js.map(x => x[1]).join('\n');
  /* Адреса ERP в background.js — строки в кавычках внутри ERP_MATCH (в адресах есть «/*», комментарии не вырезать). */
  const bg = js.find(x => x[0] === 'background.js')[1], erpMatch = [.../const ERP_MATCH = \[([\s\S]*?)\];/.exec(bg)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  eq('Расширение: в коде нет сети и вставки разметки текстом; разрешения — только scripting и адреса ERP; списки адресов ERP совпадают; тексты интерфейса на английском', {
    net: ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'importScripts', 'EventSource', '.src ='].filter(w => code.includes(w)),
    html: ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function'].filter(w => code.includes(w)),
    perms: man.permissions, mv: man.manifest_version, gmail: man.content_scripts[0].matches,
    same: JSON.stringify(man.host_permissions) === JSON.stringify(erpMatch) && JSON.stringify(man.content_scripts[1].matches) === JSON.stringify(erpMatch),
    /* Строки в кавычках без кириллицы: комментарии по-русски, интерфейс — по-английски. */
    cyrillic: js.filter(([f, s]) => (s.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []).some(q => /[А-яЁё]/.test(q))).map(x => x[0]),
    closed: /GF_SHADOW_MODE='closed'/.test(code)
  }, { net: [], html: [], perms: ['scripting'], mv: 3, gmail: ['https://mail.google.com/*'], same: true, cyrillic: [], closed: true });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-ext-')), ext = path.join(tmp, 'ext');
  fs.mkdirSync(ext);
  files.forEach(f => { let s = fs.readFileSync(path.join(SRC, f), 'utf8'); if (f === 'gmail.js') s = s.replace("GF_SHADOW_MODE='closed'", "GF_SHADOW_MODE='open'"); fs.writeFileSync(path.join(ext, f), s); });
  const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), { channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 }, args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext] });
  const errs = [];
  try {
    await ctx.route('https://mail.google.com/**', r => r.fulfill({ contentType: 'text/html', body: GMAIL }));
    await ctx.route('https://marketing-farm.agency/**', r => r.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
    await ctx.route('http://127.0.0.1:8799/**', r => {
      const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
      return f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' });
    });
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const g = ctx.pages()[0] || await ctx.newPage();
    g.on('pageerror', e => errs.push('gmail: ' + e.message));
    await g.goto('https://mail.google.com/mail/u/0/#inbox');
    const panel = () => g.evaluate(() => { const r = document.getElementById('gf-mail-panel'), b = r && r.shadowRoot && r.shadowRoot.querySelector('.gf'); return b ? { tab: b.classList.contains('tab'), text: b.innerText.replace(/\s+/g, ' ').trim().toLowerCase() } : null; });
    const until = async (want, ms) => { const end = Date.now() + (ms || 8000); let p; while (Date.now() < end) { p = await panel(); if (p && want(p)) return p; await g.waitForTimeout(100); } return p; };
    const has = s => p => p.text.includes(s.toLowerCase());
    const click = label => g.evaluate(l => { const s = document.getElementById('gf-mail-panel').shadowRoot, el = [...s.querySelectorAll('button,.row.go,.more,.ft,.gf.tab')].find(b => (b.getAttribute('aria-label') || '') === l || b.textContent.replace(/\s+/g, ' ').trim().includes(l)); if (!el) throw new Error('No button ' + l); el.click(); }, label);
    const show = t => g.evaluate(x => window.gmShow(x), t);
    const john = (thread, subject, body, extra) => Object.assign({ thread, subject, messages: [{ id: '18c3f2a9b1d4f001', from: 'john@abcglass.example', name: 'John Miller', body }] }, extra);

    eq('Панель: в списке писем — язычок; письмо открыто, а ERP нет — «Glass Farm is not open» и Open Glass Farm', await (async () => {
      const inbox = await until(p => p.tab);
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe1', 'New order — PO 4502', 'Please find our new order attached.'));
      const closed = await until(has('not open'));
      return { inbox: inbox && inbox.tab, closed: closed && closed.text.includes('Glass Farm is not open in this browser.'.toLowerCase()) && closed.text.includes('Open Glass Farm'.toLowerCase()) };
    })(), { inbox: true, closed: true });

    const e = await ctx.newPage();
    e.on('pageerror', x => errs.push('erp: ' + x.message));
    await e.goto('http://127.0.0.1:8799/src/index.html');
    await e.evaluate(() => window.storageReady);
    await require('./optimization-fixture')(e);
    await e.evaluate(() => {
      oqReset(); localStorage.removeItem(SALES_LIST_PREFS_KEY); salesListPrefs = null;
      window.xC = oqCustomer({ legalName: 'ABC Glass Ltd', contacts: [{ name: 'John Miller', role: 'Purchasing', email: 'john@abcglass.example', phone: '416-555-0142', isPrimary: true }] });
      window.xA = oqOrder(xC, { customerPo: '4471', dueDate: '2026-12-20' }); salesDraftDrop();
      window.xB = oqOrder(xC, { customerPo: '4390', dueDate: '2026-12-01' }); salesDraftDrop(); oqThrough(xB, 'batched'); oqReady(xB);
      tab = 'sales'; render();
    });
    await g.bringToFront();

    eq('Панель: клиент найден по адресу, письмо не привязано — кнопки и открытые заказы, готовый первым; клиент — строкой внизу, по клику — контакт', await (async () => {
      await click('Refresh');
      const p = await until(has('Open orders'));
      await click('ABC Glass Ltd');
      const more = await until(has('Purchasing'));
      return {
        text: p && ['No order linked to this email', '+ Create order', '+ Create quote', 'Link to order', 'Open orders · 2', 'ABC Glass Ltd'].filter(s => !p.text.includes(s.toLowerCase())),
        order: p && p.text.indexOf('po 4390') < p.text.indexOf('po 4471'), contact: more && ['John Miller · Purchasing', '416-555-0142', 'Terms: Credit · Net 30'].filter(s => !more.text.includes(s.toLowerCase()))
      };
    })(), { text: [], order: true, contact: [] });

    eq('Панель: в тексте письма PO существующего заказа — подсказка; Link this email привязывает, в заказе ERP — письмо; дальше ветка показывает карточку заказа', await (async () => {
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe2', 'Question', 'Hello, any update on PO 4471? We were told it would be ready.'));
      const hint = await until(has('Found in this email'));
      await click('Link this email');
      const cardP = await until(has('units done'));
      const saved = await e.evaluate(() => (salesRecord(xA).emails || []).map(x => [x.threadId, x.from, x.subject, x.account]));
      return { hint: hint && hint.text.includes('Found in this email: PO 4471'.toLowerCase()), card: cardP && ['PO 4471', '0 of 3 units done', 'not in production yet', 'Open in ERP'].filter(s => !cardP.text.includes(s.toLowerCase())), saved };
    })(), { hint: true, card: [], saved: [['FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe2', 'john@abcglass.example', 'Question', 'sales@infinity.example']] });

    eq('Панель: номер, которого нет у клиента, и часть номера (44710) подсказки не дают', await (async () => {
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe3', 'Order 44710', 'Our ref 44710 and PO 9999.'));
      const p = await until(has('Open orders'));
      return { hint: !!p && p.text.includes('Found in this email'.toLowerCase()) };
    })(), { hint: false });

    eq('Панель: готовый заказ по ветке — «3 of 3 units done», Ready to ship 3, станций нет; Open in ERP открывает заказ во вкладке ERP', await (async () => {
      await e.evaluate(() => orderEmailAdd(xB, { threadId: 'FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe4', from: 'john@abcglass.example', subject: 'Pickup' }));
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe4', 'Pickup', 'When can we pick up?'));
      const p = await until(has('units done'));
      await click('Open in ERP');
      await e.waitForFunction(id => soEdit === id, await e.evaluate(() => xB), { timeout: 8000 }).catch(() => null);
      return { text: p && ['3 of 3 units done', 'Ready to ship 3', 'Ready'].filter(s => !p.text.includes(s.toLowerCase())), where: !!p && p.text.includes('Where is the glass'.toLowerCase()), opened: await e.evaluate(() => soEdit === xB) };
    })(), { text: [], where: false, opened: true });

    eq('Панель: конверт — шаблоны ERP, выбранный текст встаёт в ответ (Reply открывается сам); скрепка — PDF прикрепляется кнопкой Attach files ответа (без окна выбора); в журнале заказа — письмо клиента, Reply text и Document attached; в карточке — когда клиент написал', await (async () => {
      await e.evaluate(() => salesDraftDrop());
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe4', 'Pickup', 'When can we pick up?'));
      await click('Refresh');
      const talk = await until(has('Customer wrote'));
      const item = (label) => g.evaluate(l => { const s = document.getElementById('gf-mail-panel').shadowRoot, el = [...s.querySelectorAll('.menu .mi')].find(x => x.textContent.includes(l)); if (!el) throw new Error('No item ' + l); el.click(); }, label);
      await click('Reply text'); await until(has('Ready for pickup')); await item('Ready for pickup');
      await g.waitForFunction(() => { const c = document.getElementById('compose'); return c && c.innerText.includes('ready for pickup'); }, null, { timeout: 8000 }).catch(() => null);
      const text = await g.evaluate(() => { const c = document.getElementById('compose'); return c ? c.innerText : ''; });
      await click('Attach PDF'); await until(has('Proforma invoice')); await item('Proforma invoice');
      const done = await until(has('attached'));
      const att = await g.evaluate(() => [...document.querySelectorAll('.att')].map(a => a.textContent.split(' ')[0] + ' · ' + a.getAttribute('data-via')));
      const no = await e.evaluate(() => salesRecord(xB).businessNumber);
      const log = await e.evaluate(() => [...new Set(DB.orderEvent.filter(x => x.orderId === xB && ['Customer email', 'Reply text', 'Document attached'].includes(x.what)).map(x => x.what))].sort());
      return { talk: !!talk, text: ['Hi John,', '3 units of order', 'are ready for pickup:', '• Line 1 · Kitchen'].filter(x => !text.includes(x)), att, want: 'Proforma_invoice_' + no + '.pdf', done: !!done, log };
    })(), { talk: true, text: [], att: [await e.evaluate(() => 'Proforma_invoice_' + salesRecord(xB).businessNumber + '.pdf · input')], want: await e.evaluate(() => 'Proforma_invoice_' + salesRecord(xB).businessNumber + '.pdf'), done: true, log: ['Customer email', 'Document attached', 'Reply text'] });

    eq('Панель: отправитель неизвестен — «No customer with this email»; Create order открывает в ERP новый заказ с этим письмом, в базе ничего до Save', await (async () => {
      await e.evaluate(() => salesDraftDrop());
      await show({ thread: 'FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe5', subject: 'New order', messages: [{ id: '18c3f2a9b1d4f005', from: 'bob@newbuilder.example', name: 'Bob Lee', body: 'We need 6 tempered panels.' }] });
      const p = await until(has('No customer'));
      const before = await e.evaluate(() => DB.salesOrder.length);
      await click('+ Create order');
      await e.waitForFunction(() => soEdit === 'new', null, { timeout: 8000 }).catch(() => null);
      const draft = await e.evaluate(() => soDraft && { isNew: soEdit === 'new', customer: soDraft.customerId, mails: (soDraft.emails || []).map(x => x.from + ' ' + x.subject) });
      const after = await e.evaluate(() => DB.salesOrder.length); await e.evaluate(() => salesDraftDrop());
      return { text: p && ['No customer with this email', 'bob@newbuilder.example'].filter(s => !p.text.includes(s.toLowerCase())), draft, base: after - before };
    })(), { text: [], draft: { isNew: true, customer: '', mails: ['bob@newbuilder.example New order'] }, base: 0 });

    eq('Панель: Link to order — поиск по PO, Link привязывает; × (Hide) сворачивает в язычок, язычок раскрывает', await (async () => {
      await show(john('FMfcgzQXKWgLlNmPqRsTuVwXyZaBcDe6', 'Re: delivery', 'See below.'));
      await until(has('Open orders'));
      await click('Link to order');
      await g.evaluate(() => { const i = document.getElementById('gf-mail-panel').shadowRoot.querySelector('input.in'); i.value = '439'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      const found = await until(has('PO 4390'));
      await g.evaluate(() => { const s = document.getElementById('gf-mail-panel').shadowRoot; [...s.querySelectorAll('.row')].find(r => r.textContent.includes('PO 4390')).querySelector('button').click(); });
      const linked = await until(has('units done'));
      await click('Hide'); const hidden = await until(p => p.tab);
      await click('Glass Farm'); const back = await until(p => !p.tab);
      return { found: !!found && found.text.includes('PO 4390'.toLowerCase()), linked: !!linked && linked.text.includes('PO 4390'.toLowerCase()), ids: await e.evaluate(() => (salesRecord(xB).emails || []).length), hidden: hidden && hidden.tab, back: back && !back.tab };
    })(), { found: true, linked: true, ids: 2, hidden: true, back: true });

    eq('Расширение: без ошибок в страницах Gmail и ERP', errs, []);
  } finally {
    await ctx.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
