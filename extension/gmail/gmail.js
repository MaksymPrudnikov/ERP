/* Glass Farm for Gmail — панель справа в Gmail.
   Видит открытую ветку, спрашивает вкладку ERP (через фон), какой заказ к ней
   относится, и рисует ответ. Правила — раздел «Логика панели» задания
   docs/ЗАДАЧА_ПОЧТА_ЗАКАЗЫ.md; руководство — docs/manual/gmail.*.
   В ERP уходят только адрес отправителя, номера ветки и письма, тема и дата.
   Текст письма из этой вкладки не выходит: номера заказов ERP отдаёт списком
   (known), а ищет их в тексте сама панель — точно, целым словом. Ничего не
   угадывает и сама ничего не привязывает: только по нажатию человека.
   Разметка — только через createElement и textContent: Gmail требует Trusted
   Types, а данные заказа не должны стать кодом. Shadow DOM закрыт: скрипты
   Gmail панель не читают. */
(function () {
  if (window.gfMailPanel) return;
  window.gfMailPanel = true;
  const GF_SHADOW_MODE='closed';
  /* Разметка Gmail — в одном месте: Gmail поменяет классы — правится здесь. */
  const SEL = {
    subject: 'h2.hP',
    message: 'div.adn[data-legacy-message-id]',
    messageId: 'data-legacy-message-id',
    sender: 'span.gD[email]',
    date: 'span.g3[title]',
    body: 'div.a3s'
  };
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const TEXTS = {
    closed: 'Glass Farm is not open in this browser.',
    signin: 'Sign in to Glass Farm.',
    access: 'No Sales access.',
    reload: 'Reload this Gmail page.',
    failed: 'Glass Farm could not answer. Try again.',
    unknown: 'Update Glass Farm.'
  };
  const PILL = { New: 'new', Verified: 'verified', Batched: 'batched', Ready: 'ready', 'Partially shipped': 'shipping', Shipped: 'shipping', 'Picked up': 'done', Delivered: 'done', Quote: 'sent' };

  let host = null, root = null, box = null, cur = null, seq = 0, timer = 0;
  const st = { open: true, peek: false, data: null, found: [], mode: '', search: '', results: null, expanded: '', closedOpen: null, custOpen: false, busy: false, note: '' };

  /* ------------------------------ Письмо ------------------------------- */
  function threadToken() {
    const parts = location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
    const id = parts.length > 1 && parts[0] !== 'settings' ? parts[parts.length - 1] : '';
    return /^[A-Za-z0-9_-]{14,80}$/.test(id) ? id : '';
  }
  function account() { const m = ADDRESS.exec(document.title || ''); return m ? m[0].toLowerCase() : ''; }
  function readThread() {
    const threadId = threadToken(), subj = threadId && document.querySelector(SEL.subject);
    if (!subj) return null;
    const acc = account(), msgs = [...document.querySelectorAll(SEL.message)];
    const info = msgs.map(m => {
      const s = m.querySelector(SEL.sender), d = m.querySelector(SEL.date);
      return { id: m.getAttribute(SEL.messageId) || '', from: (s && s.getAttribute('email') || '').trim().toLowerCase(), name: s && (s.getAttribute('name') || s.textContent) || '', at: d && d.getAttribute('title') || '' };
    }).filter(x => x.from);
    /* Отправитель — автор последнего письма ветки, написанного не с этого ящика. */
    const theirs = info.filter(x => x.from !== acc), last = theirs[theirs.length - 1] || info[info.length - 1] || null;
    const text = [subj.textContent].concat(msgs.map(m => { const b = m.querySelector(SEL.body); return b ? b.innerText || b.textContent || '' : ''; })).join('\n');
    const t = last ? Date.parse(last.at) : NaN;
    const email = {
      threadId, messageId: last && /^[A-Za-z0-9_-]{10,80}$/.test(last.id) ? last.id : '', account: acc,
      from: last ? last.from : '', fromName: last ? last.name.trim() : '', subject: subj.textContent.trim(), at: isNaN(t) ? '' : new Date(t).toISOString()
    };
    return { key: [threadId, email.messageId, email.from, msgs.length].join('|'), email, text };
  }
  /* Номера и PO открытых заказов клиента (known из ERP) — в теме и тексте,
     только точно и целым словом. PO короче 4 знаков не сравнивается: «12»
     совпало бы с «12 units». Квота Q-10021-R1 находится и по Q-10021. */
  function findKnown(text, known) {
    const out = [], esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    (known || []).forEach(k => {
      const num = String(k.number || '').trim(), po = String(k.po || '').trim(), base = (/^(Q-\d+)-R\d+$/i.exec(num) || [])[1];
      const hit = [num, base, po].filter(v => v && v.length >= 4).find(v => new RegExp('(^|[^A-Za-z0-9])' + esc(v) + '(?![A-Za-z0-9])', 'i').test(text));
      if (hit) out.push({ id: k.id, label: hit === po && hit !== num ? 'PO ' + po : hit });
    });
    return out;
  }

  /* ------------------------------ Связь -------------------------------- */
  function send(m) {
    return new Promise(res => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return res({ error: 'reload' });
        chrome.runtime.sendMessage(Object.assign({ gf: 'mail' }, m), r => { if (chrome.runtime.lastError) return res({ error: 'reload' }); res(r || { error: 'closed' }); });
      } catch (e) { res({ error: 'reload' }); }
    });
  }
  async function refresh(force) {
    const t = readThread();
    if (!t) { if (cur) { cur = null; st.data = null; st.peek = false; } render(); return; }
    if (!force && cur && cur.key === t.key) return;
    if (!cur || cur.email.threadId !== t.email.threadId) Object.assign(st, { mode: '', search: '', results: null, expanded: '', closedOpen: null, custOpen: false, note: '' });
    cur = t;
    const my = ++seq, r = await send({ req: 'lookup', from: t.email.from, threadId: t.email.threadId, messageId: t.email.messageId });
    if (my !== seq) return;
    let found = [];
    if (r && !r.error && r.step !== 2 && r.known && r.known.length) {
      const hits = findKnown(t.text, r.known);
      if (hits.length) {
        const o = await send({ req: 'orders', ids: hits.map(x => x.id) });
        if (my !== seq) return;
        found = (o.orders || []).map(c => Object.assign(c, { label: (hits.find(x => x.id === c.id) || {}).label || c.number }));
      }
    }
    st.data = r; st.found = found; render();
  }
  function later() { clearTimeout(timer); timer = setTimeout(() => refresh(false), 400); }
  async function act(m, after) {
    if (st.busy) return;
    st.busy = true; st.note = ''; render();
    const r = await send(m);
    st.busy = false;
    if (r && r.error) st.note = TEXTS[r.error] || r.error;
    else if (after) after(r);
    render();
    if (r && r.ok && m.req === 'linkEmail') refresh(true);
  }
  const email = () => cur && cur.email;
  const openOrder = id => act({ req: 'openOrder', orderId: id });
  const create = kind => act({ req: 'newOrder', kind, customerId: st.data && st.data.customer ? st.data.customer.id : '', email: email() });
  const link = id => act({ req: 'linkEmail', orderId: id, email: email() }, () => { st.mode = ''; st.results = null; st.search = ''; });
  let searchTimer = 0;
  function search(q) {
    st.search = q; clearTimeout(searchTimer);
    if (q.trim().length < 2) { st.results = null; render(); return; }
    searchTimer = setTimeout(async () => { const r = await send({ req: 'search', q }); if (st.search === q) { st.results = r && !r.error ? r : { rows: [] }; render(); } }, 200);
  }

  /* ------------------------------ Вид ---------------------------------- */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    return e;
  }
  function day(iso) {
    const s = String(iso || ''), t = Date.parse(s.length === 10 ? s + 'T12:00:00' : s);
    if (isNaN(t)) return '';
    const d = new Date(t);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (d.getFullYear() !== new Date().getFullYear() ? ', ' + d.getFullYear() : '');
  }
  function dueText(p) {
    if (!p.due || p.units.done >= p.units.total) return p.due ? 'Due ' + day(p.due) : '';
    const n = Math.round((Date.parse(p.due + 'T12:00:00') - Date.now()) / 864e5);
    return 'Due ' + day(p.due) + ' · ' + (n === 0 ? 'today' : n > 0 ? 'in ' + n + (n === 1 ? ' day' : ' days') : -n + (n === -1 ? ' day' : ' days') + ' late');
  }
  function btn(text, onclick, cls) { return h('button', { type: 'button', class: 'b' + (cls ? ' ' + cls : ''), disabled: st.busy, onclick }, text); }
  function pill(c) {
    const p = c.progress;
    if (p.kind === 'quote') return h('span', { class: 'pill s-' + p.statusKey }, p.statusKey === 'sent' && p.sentAt ? 'Sent ' + day(p.sentAt) : p.statusKey === 'won' && c.wonOrder ? 'Won → ' + c.wonOrder : p.status);
    return h('span', { class: 'pill s-' + p.statusKey }, c.draft ? 'Draft' : p.status);
  }
  function units(c) { const u = c.progress.units; return c.progress.kind === 'quote' ? u.total + ' units' : u.done + ' / ' + u.total; }
  function row(c, onclick, right, cls) {
    return h('div', { class: 'row' + (onclick ? ' go' : '') + (cls ? ' ' + cls : ''), title: onclick ? 'Open' : null, onclick },
      h('span', null, h('b', null, c.number || 'Draft'), c.po ? ' · PO ' + c.po : '', ' ', h('small', null, units(c))), right || pill(c));
  }
  function orderCard(c) {
    const p = c.progress, u = p.units, w = n => u.total ? (n / u.total * 100).toFixed(2) + '%' : '0';
    const sub = [dueText(p), u.total && u.notStarted === u.total && !['cancelled', 'closed'].includes(p.statusKey) ? 'not in production yet' : '', c.fromQuote ? 'from ' + c.fromQuote : ''].filter(Boolean).join(' · ');
    const legend = [['c-ship', 'Shipped', u.shipped], ['c-ready', 'Ready to ship', u.ready], ['c-prod', 'In production', u.inProduction]].concat(u.notStarted && u.done + u.inProduction ? [['', 'Not started', u.notStarted]] : []);
    const stations = p.stations || [];
    return h('div', { class: 'card' + (p.onHold ? ' hold' : ''), 'data-order': c.id },
      h('div', { class: 'top' }, h('b', null, c.number || 'Draft', c.po ? h('small', null, ' · PO ' + c.po) : ''), pill(c)),
      p.onHold ? h('div', { class: 'holdline' }, 'On Hold' + (p.holdReason ? ' · ' + p.holdReason : '')) : '',
      h('p', { class: 'big' }, u.done + ' of ' + u.total + ' units done'),
      h('p', { class: 'csub' }, sub || ' '),
      h('div', { class: 'bar' }, h('i', { class: 'c-ship', style: 'width:' + w(u.shipped) }), h('i', { class: 'c-ready', style: 'width:' + w(u.ready) }), h('i', { class: 'c-prod', style: 'width:' + w(u.inProduction) })),
      u.done + u.inProduction ? legend.map(([k, label, n]) => h('div', { class: 'leg' }, h('i', { class: k, style: k ? null : 'background:var(--surface-3)' }), label, h('b', null, n))) : '',
      p.extras ? h('p', { class: 'mut', style: 'margin:6px 0 0' }, 'Stock items: ' + p.extras.shipped + ' of ' + p.extras.ordered + ' shipped') : '',
      stations.length ? h('div', { class: 'where', title: 'Lites waiting at each station' }, 'Where is the glass ', h('small', null, '· lites'), h('div', { class: 'st' }, stations.map(s => h('span', { class: s.passed >= s.total ? 'ok' : s.waiting ? 'on' : '' }, s.code + ' ' + (s.passed >= s.total ? '✓' : s.waiting ? s.waiting : '·'))))) : h('div', { style: 'height:10px' }),
      btn('Open in ERP', () => openOrder(c.id), 'pri'));
  }
  function quoteCard(c) {
    const p = c.progress;
    const sub = ['Quote', p.units.total + ' units', p.statusKey === 'won' ? '' : p.validUntil ? 'valid until ' + day(p.validUntil) : ''].filter(Boolean).join(' · ');
    return h('div', { class: 'card', 'data-order': c.id },
      h('div', { class: 'top' }, h('b', null, c.number || 'Quote'), pill(c)),
      h('p', { class: 'csub' }, sub), btn('Open in ERP', () => openOrder(c.id), 'pri'));
  }
  const card = c => c.progress.kind === 'quote' ? quoteCard(c) : orderCard(c);
  function actions(linkText, first) {
    return [btn('+ Create order', () => create('order'), first ? 'pri' : ''), btn('+ Create quote', () => create('quote')), btn(linkText || 'Link to order', () => { st.mode = 'link'; st.note = ''; render(); setTimeout(() => { const i = root.querySelector('input.in'); if (i) i.focus(); }, 0); })];
  }
  function linked(r) {
    const list = r.linked, top = list.find(c => c.id === st.expanded) || list[0], openClosed = st.closedOpen == null ? !list.length : st.closedOpen;
    return [
      top ? card(top) : '',
      list.filter(c => c !== top).map(c => row(c, () => { st.expanded = c.id; render(); })),
      r.closedCount ? h('div', { class: 'more q', onclick: () => { st.closedOpen = !openClosed; render(); } }, h('span', null, 'Closed · ' + r.closedCount), h('span', null, openClosed ? '▴' : '▾')) : '',
      r.closedCount && openClosed ? r.closed.map(c => row(c, () => openOrder(c.id))) : '',
      r.archived.map(a => h('div', { class: 'row go arch', title: 'Open', onclick: () => openOrder(a.id) }, h('span', null, h('b', null, a.number)), 'Archived')),
      h('div', { style: 'height:8px' }), actions('Link to order')
    ];
  }
  function suggest(r) {
    const one = st.found.length === 1;
    return [
      h('div', { class: 'sugg' }, h('p', null, 'Found in this email: ' + st.found.map(c => c.label).join(', ')),
        st.found.map(c => one ? row(c) : row(c, null, btn('Link', () => link(c.id), 'sm'))),
        one ? btn('Link this email', () => link(st.found[0].id), 'pri') : ''),
      actions('Link to another order')
    ];
  }
  function client(r) {
    if (!r.rows.length && !r.openCount) return [h('p', { class: 'mut' }, 'No order linked to this email'), actions('', true)];
    return [
      h('p', { class: 'mut' }, 'No order linked to this email'), actions('', true),
      h('p', { class: 'h' }, 'Open orders · ' + r.openCount),
      r.counts.length ? h('div', { class: 'counts' }, r.counts.map(c => h('span', { class: 'pill s-' + (PILL[c.label] || 'new') }, c.label + ' ' + c.count))) : '',
      r.rows.map((c, i) => row(c, () => openOrder(c.id), null, i ? '' : 'first')),
      r.openCount > r.rows.length ? h('div', { class: 'more', onclick: () => act({ req: 'openCustomer', customerId: r.customer.id }) }, h('span', null, '+' + (r.openCount - r.rows.length) + ' more · open in ERP'), h('span', null, '↗')) : ''
    ];
  }
  function stranger(r) {
    return [h('p', { class: 'msg' }, r.customers > 1 ? r.customers + ' customers with this email' : 'No customer with this email'), h('p', { class: 'sub' }, email().from || 'No sender address'), actions('', true)];
  }
  function linking() {
    const res = st.results;
    return [
      h('input', { class: 'in', value: st.search, placeholder: 'Order number or PO', 'aria-label': 'Order number or PO', oninput: e => search(e.target.value) }),
      res ? (res.rows.length ? res.rows.map((c, i) => row(c, null, btn('Link', () => link(c.id), 'sm'), i ? '' : 'first')) : h('p', { class: 'mut' }, 'Nothing found')) : '',
      res && res.more ? h('p', { class: 'mut' }, '+' + res.more + ' more · type more of the number') : '',
      h('div', { style: 'height:8px' }), btn('Cancel', () => { st.mode = ''; st.results = null; st.search = ''; render(); })
    ];
  }
  function foot(c) {
    return h('div', { class: 'foot' },
      h('div', { class: 'ft', onclick: () => { st.custOpen = !st.custOpen; render(); } }, '👤', h('b', null, c.name), h('span', null, st.custOpen ? '▴' : '▾')),
      st.custOpen ? h('div', { class: 'fm' }, [c.contact.name ? c.contact.name + (c.contact.role ? ' · ' + c.contact.role : '') : '', c.contact.phone, c.contact.email, 'Terms: ' + c.terms].filter(Boolean).map(x => h('span', null, x))) : '');
  }
  function body() {
    const r = st.data;
    if (!cur) return [h('p', { class: 'mut' }, 'Open an email to see its order.')];
    if (!r) return [h('p', { class: 'mut' }, 'Loading…')];
    if (r.error) return [h('p', { class: 'mut' }, TEXTS[r.error] || TEXTS.failed), r.error === 'reload' ? btn('Reload', () => location.reload(), 'pri') : r.error === 'access' ? '' : btn('Open Glass Farm', () => act({ req: 'openErp' }), 'pri')];
    if (st.mode === 'link') return linking();
    if (r.step === 2) return linked(r);
    if (st.found.length) return suggest(r);
    return r.customer ? client(r) : stranger(r);
  }
  function mount() {
    host = document.createElement('div'); host.id = 'gf-mail-panel';
    root = host.attachShadow({ mode: GF_SHADOW_MODE });
    try { const s = new CSSStyleSheet(); s.replaceSync(GF_CSS); root.adoptedStyleSheets = [s]; } catch (e) { const s = document.createElement('style'); s.textContent = GF_CSS; root.appendChild(s); }
    document.documentElement.appendChild(host);
  }
  function render() {
    if (!host) mount();
    const focus = root.activeElement && root.activeElement.matches('input.in'), caret = focus ? root.activeElement.selectionStart : 0;
    if (box) box.remove();
    if (!(cur ? st.open : st.peek)) {
      box = h('div', { class: 'gf tab', title: 'Glass Farm', onclick: () => { if (cur) st.open = true; else st.peek = true; render(); } }, h('div', { class: 'logo' }, 'GF'), h('em', null, 'Glass Farm'));
    } else {
      const r = st.data;
      box = h('div', { class: 'gf', role: 'complementary', 'aria-label': 'Glass Farm' },
        h('div', { class: 'head' }, h('div', { class: 'logo' }, 'GF'), h('b', null, 'Glass Farm'), h('span', { class: 'sp' }),
          h('button', { type: 'button', class: 'ib', title: 'Refresh', 'aria-label': 'Refresh', onclick: () => refresh(true) }, '↻'),
          h('button', { type: 'button', class: 'ib', title: 'Hide', 'aria-label': 'Hide', onclick: () => { st.open = false; st.peek = false; render(); } }, '›')),
        h('div', { class: 'body' }, st.note ? h('p', { class: 'err' }, st.note) : '', body()),
        r && !r.error && r.customer && st.mode !== 'link' ? foot(r.customer) : '');
    }
    root.appendChild(box);
    if (focus) { const i = root.querySelector('input.in'); if (i) { i.focus(); i.setSelectionRange(caret, caret); } }
  }

  window.addEventListener('hashchange', () => refresh(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(true); });
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  refresh(false);
})();
