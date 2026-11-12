/* Сторож разделов (план «до 10», этап 5, 12.11.2026). Таблицы раздела
   (SECTION_OWN, erp/sections) пишет только сам раздел: деньги — Finance,
   склад — склад, PS и рейсы — Shipping. Остальные зовут его имена из
   списка (FIN_API, STOCK_API, SHIP_API). Три проверки:
   а) по тексту кода: чужой файл не пишет в таблицы раздела;
   б) по тексту кода: снаружи — только имена из списка раздела, и каждое
      имя списка живое (есть в разделе, кто-то снаружи его зовёт);
   в) живая: в тестах командная запись, тронувшая таблицу раздела без его
      отметки, пишет «Outside section: …» (test/run.js собирает такие
      строки со всех тестов, итог — в конце прогона).
   Ещё права в командах (владелец 12.11.2026): деньги вносит только
   Finance; PS, печать, Shipped — Sales или Shipping; выдача с долгом —
   строка в журнале заказа. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SECTIONS = {
  finance: {
    own: f => /^src\/erp\/finance\//.test(f) || /^src\/erp\/views\/(finance[\w-]*|commissions)\.js$/.test(f),
    tables: 'receipt|refund|financeTerms|financeEvent|financeExport|financeExportBatch|referrer|referrerPayout',
    /* Строка оплаты: разнесение и аннулирование. */
    rows: '\\.allocations\\s*(?:=(?!=)|\\.(?:push|splice)\\()|\\.(?:voided|voidReason|voidedAt)\\s*=(?!=)',
    api: ['src/erp/finance/api.js', 'FIN_API']
  },
  stock: {
    own: f => /^src\/erp\/inventory\//.test(f) || f === 'src/erp/production/stock-offcuts.js' || /^src\/erp\/views\/(inventory|stock-list)\.js$/.test(f),
    tables: 'inventoryEvent|inventoryMin|stockItemEvent|consumableEvent|stockReason|stockOffcut|stockOffcutSeq',
    api: ['src/erp/inventory/api.js', 'STOCK_API']
  },
  shipping: {
    own: f => /^src\/erp\/shipping\//.test(f) || /^src\/erp\/views\/(shipping[\w-]*|delivery|skids)\.js$/.test(f),
    tables: 'shipment|shipmentSeq|skidReturn|truck|tripKm',
    /* Строка PS: состав и снятые юниты. */
    rows: '\\.(?:unbatchedItems|printedItems|skidsOut)\\s*=(?!=)',
    api: ['src/erp/shipping/api.js', 'SHIP_API']
  }
};
/* Запись: присваивание таблице или её строке, методы, меняющие массив. */
const writeOf = s => new RegExp(`\\bDB\\.(?:${s.tables})\\b\\s*(?:=(?!=)|\\.(?:push|splice|unshift|pop|shift|sort|reverse|fill)\\(|\\[[^\\]]*\\]\\s*=(?!=))` +
  `|\\bDB\\[['"](?:${s.tables})['"]\\]` + (s.rows ? '|' + s.rows : ''));
/* Комментарии — не код: упоминание имени в них не вызов. */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[\s;{}(,])\/\/.*$/gm, '$1');
/* Имя, а не поле объекта (e.x), не ключ ({x: …}) и не строка ('x'). */
const nameRe = n => new RegExp("(?<![.\\w$'\"])" + n.replace(/\$/g, '\\$') + '(?![\\w$])(?!\\s*:)');

function modules() {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/manifest.json'), 'utf8'));
  return m.scripts.filter(f => f.endsWith('.js')).map(f => ({ f, text: strip(fs.readFileSync(path.join(ROOT, f), 'utf8')) }));
}
function apiOf(s) { return new Function(fs.readFileSync(path.join(ROOT, s.api[0]), 'utf8') + ';return ' + s.api[1] + ';')(); }
function defsOf(files) {
  const d = new Set();
  files.forEach(({ text }) => { for (const x of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) d.add(x[1] || x[2]); });
  return d;
}

module.exports = async function ({ page, eq }) {
  console.log('sections api');
  const all = modules();

  eq('Сторож узнаёт запись: таблица, строка таблицы, разнесение, аннулирование, состав PS; чтение — не запись', [
    ['finance', 'DB.receipt.push(r)'], ['finance', 'DB.refund=DB.refund.filter(x=>x)'], ['finance', 'DB.financeTerms[i]=t'], ['finance', "DB['receipt']"], ['finance', 'r.allocations=[]'], ['finance', 'r.voided=true'],
    ['stock', 'DB.inventoryEvent.push(e)'], ['stock', 'DB.stockOffcutSeq=5'], ['shipping', 'DB.shipment.push(s)'], ['shipping', 's.unbatchedItems=[]'], ['shipping', 'DB.tripKm[k]=v'],
    ['finance', 'DB.receipt.filter(r=>r.id===id)'], ['finance', 'x===DB.receipt'], ['finance', 'if(r.voided)return'], ['finance', 'DB.receiptSeq=1'], ['shipping', 'DB.shipmentSeqs=1'], ['shipping', '(DB.shipment||[]).some(s=>s.id)']
  ].map(([k, s]) => writeOf(SECTIONS[k]).test(s)), [true, true, true, true, true, true, true, true, true, true, true, false, false, false, false, false, false]);

  Object.entries(SECTIONS).forEach(([name, s]) => {
    const inside = all.filter(x => s.own(x.f)), outside = all.filter(x => !s.own(x.f)), api = apiOf(s), defs = defsOf(inside), re = writeOf(s);
    const writes = [];
    outside.forEach(({ f, text }) => text.split('\n').forEach((line, i) => { if (re.test(line)) writes.push(f + ':' + (i + 1)); }));
    eq(name + ': чужой файл не пишет в таблицы раздела (' + s.tables.split('|').join(', ') + ')', writes, []);
    const used = new Map();
    defs.forEach(n => { const r = nameRe(n), f = outside.find(x => r.test(x.text)); if (f) used.set(n, f.f); });
    eq(name + ': снаружи — только имена из ' + s.api[1] + ' (' + s.api[0] + ')', [...used].filter(([n]) => !api.has(n)).map(([n, f]) => n + ' · ' + f), []);
    eq(name + ': каждое имя ' + s.api[1] + ' есть в разделе и кто-то снаружи им пользуется', [...api].filter(n => !defs.has(n) || !used.has(n)), []);
  });

  const t = await page();
  await require('./optimization-fixture')(t.p);

  eq('живая проверка: прямая запись в оплаты, склад и PS внутри команды Sales — «Outside section»; через команды разделов — тихо', await t.p.evaluate(() => {
    const seen = [], was = console.error;console.error = (...a) => { seen.push(String(a[0])); };
    const out = () => { const r = seen.filter(s => s.startsWith('Outside section')).map(s => s.split(' ').slice(2, 4).join(' '));seen.length = 0;return r; };
    try {
      oqReset();const c = oqCustomer({ paymentMode: 'cash' }), id = oqOrder(c);
      storageCommand(() => { DB.receipt.push(normalizeReceipt({ id: 'RCPT-RAW', number: 'R-RAW', customerId: c.id, amount: 5, date: finToday(), method: 'cash', allocations: [] })); return true; }, { receipt: ['RCPT-RAW'] });
      const money = out();
      storageCommand(() => { DB.inventoryEvent.push({ id: 'IE-RAW', kind: 'add', glass: '6CLEAR', at: new Date().toISOString(), qty: 1 }); return true; }, { inventoryEvent: ['IE-RAW'] });
      const stock = out();
      storageCommand(() => { DB.truck.push({ id: 'TRK-RAW', name: 'Raw truck' }); return true; }, { truck: ['TRK-RAW'] });
      const ship = out();
      const d = { customerId: c.id, currency: 'CAD', date: finToday(), method: 'etransfer', reference: 'SA-1', amount: 10, note: '', allocations: [{ orderId: id, amount: 10 }] };
      const pay = finPersist(() => finSaveReceiptRecord(d, null, ''), finReceiptScope(d, null)).ok, truck = truckAdd('Section truck').ok, cancel = !!salesSetRecordStatus(id, 'cancelled');
      return { money, stock, ship, pay, truck, cancel, quiet: out() };
    } finally {
      console.error = was;DB.receipt = DB.receipt.filter(r => r.id !== 'RCPT-RAW');DB.inventoryEvent = DB.inventoryEvent.filter(e => e.id !== 'IE-RAW');DB.truck = DB.truck.filter(x => x.id !== 'TRK-RAW');touch();
    }
  }), { money: ['finance receipt'], stock: ['stock inventoryEvent'], ship: ['shipping truck'], pay: true, truck: true, cancel: true, quiet: [] });

  eq('без галочки Finance: оплату, возврат, разнесение и условия команда не пишет; отмена заказа переносит оплату на депозит', await t.p.evaluate(() => {
    oqReset();const c = oqCustomer({ paymentMode: 'cash' }), id = oqOrder(c);
    const d = { customerId: c.id, currency: 'CAD', date: finToday(), method: 'etransfer', reference: 'FA-2', amount: 20, note: '', allocations: [{ orderId: id, amount: 20 }] };
    const paid = finPersist(() => finSaveReceiptRecord(d, null, ''), finReceiptScope(d, null)).value;
    const was = window.GF_NO_SIGNIN, user = signinUser;
    window.GF_NO_SIGNIN = false;signinUser = () => ({ name: 'Olga', viewProfileId: 'U-OLGA', access: ['sales', 'shipping'] });
    try {
      const pay = finPersist(() => finSaveReceiptRecord(Object.assign({}, d, { reference: 'FA-3' }), null, ''), finReceiptScope(d, null));
      const voidIt = finPersist(() => finVoidReceipt(paid.id, 'Wrong'));
      const unalloc = finPersist(() => finUnallocate(c.id, [{ receiptId: paid.id, orderId: id }]));
      const terms = finPersist(() => finSaveTerms(id, { paymentMode: 'credit', depositPercent: 0, creditDays: 30 }, 'Test'));
      const cancel = salesSetRecordStatus(id, 'cancelled');
      return { pay: pay.error, voidIt: voidIt.error, unalloc: unalloc.error, terms: terms.error, cancel: !!cancel, deposit: finCustomerDeposit(c.id, 'CAD'), receipts: DB.receipt.filter(r => r.customerId === c.id).length };
    } finally { window.GF_NO_SIGNIN = was;signinUser = user; }
  }), { pay: 'Finance access is required to record money.', voidIt: 'Finance access is required to record money.', unalloc: 'Finance access is required to record money.', terms: 'Finance access is required to record money.', cancel: true, deposit: 20, receipts: 1 });

  eq('PS, Shipped, машины: Sales или Shipping — можно, только Optimization — отказ; станция и команда внутри чужой — без галочек', await t.p.evaluate(() => {
    oqReset();const c = oqCustomer({ paymentMode: 'credit' });
    const was = window.GF_NO_SIGNIN, user = signinUser, keepTab = tab;
    const as = access => { window.GF_NO_SIGNIN = false;signinUser = () => ({ name: 'Tester', viewProfileId: 'U-T', access }); };
    try {
      as(['optimization']);const opt = truckAdd('Opt truck');
      tab = 'station';const station = truckAdd('Station truck').ok;tab = keepTab;
      const nested = storageCommand(() => truckAdd('Nested truck').ok);
      as(['sales']);const sales = truckAdd('Sales truck').ok;
      as(['shipping']);const shipping = truckAdd('Shipping truck').ok;
      return { opt: opt.error, station, nested: nested.ok && nested.value, sales, shipping };
    } finally { window.GF_NO_SIGNIN = was;signinUser = user;tab = keepTab; }
  }), { opt: 'Sales or Shipping access is required.', station: true, nested: true, sales: true, shipping: true });

  eq('выдача с долгом: «Create anyway» пишет в журнал заказа сумму и кнопку; Back — ничего; оплаченный заказ — без строки', await t.p.evaluate(() => {
    const lines = id => DB.orderEvent.filter(e => e.orderId === id && e.what === 'Released with balance due').map(e => e.note);
    oqReset();const c = oqCustomer({ paymentMode: 'cash' });
    const back = oqOrder(c);oqThrough(back, 'ready');oqQueue('ready');oqAdvance(back, 'done', 'pickup');oqChoose('Back');
    const id = oqOrder(c), due = finOrderBalance(salesRecord(id)).balance;oqThrough(id, 'ready');oqQueue('ready');oqAdvance(id, 'done', 'pickup');oqChoose('Create anyway');
    const paid = oqOrder(c);oqPay(paid);oqThrough(paid, 'ready');oqQueue('ready');oqAdvance(paid, 'done', 'pickup');
    return { back: lines(back), released: lines(id), expect: finFmt(due) + ' · Create anyway', status: salesRecord(id).status, paid: lines(paid), paidStatus: salesRecord(paid).status };
  }).then(r => ({ back: r.back, released: r.released[0] === r.expect && r.released.length, status: r.status, paid: r.paid, paidStatus: r.paidStatus })),
  { back: [], released: 1, status: 'done', paid: [], paidStatus: 'done' });

  await t.c.close();
};
