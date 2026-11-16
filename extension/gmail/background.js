/* Glass Farm for Gmail — фон.
   Пересылает запрос панели из вкладки Gmail во вкладку ERP и ответ обратно.
   Сети нет: только сообщения между вкладками этого браузера.
   Адреса ERP — здесь и в manifest.json (host_permissions и content_scripts):
   новый домен ERP добавляется в оба места. */
const ERP_MATCH = [
  'https://marketing-farm.agency/*',
  'https://maksymprudnikov.github.io/*',
  'http://127.0.0.1/*',
  'http://localhost/*',
  /* ERP файлом с диска (пакет для проверки): в chrome://extensions → Details →
     Allow access to file URLs. */
  'file:///*GLASS_ERP*'
];
/* Что открыть, если вкладки ERP нет. */
const ERP_OPEN = 'https://marketing-farm.agency/dist/GLASS_ERP.html';
/* После этих команд человек продолжает в ERP — её вкладка выходит вперёд. */
const ERP_FOCUS = ['openOrder', 'openCustomer', 'newOrder'];

async function ask(tab, m) {
  try { return await chrome.tabs.sendMessage(tab.id, m); } catch (e) { return null; }
}
/* Вкладка ERP была открыта до установки расширения — скрипта в ней ещё нет. */
async function relay(tab) {
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['erp.js'] }); return true; } catch (e) { return false; }
}
async function hello(tab) {
  let r = await ask(tab, { gf: 'mail', req: 'hello' });
  if (!r && await relay(tab)) r = await ask(tab, { gf: 'mail', req: 'hello' });
  return r && r.ok ? r : null;
}
/* Вкладка ERP, которая отвечает: сначала та, где работали последней. */
async function erpTab() {
  const tabs = (await chrome.tabs.query({ url: ERP_MATCH })).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  let first = null;
  for (const tab of tabs) {
    const h = await hello(tab);
    if (!h) continue;
    if (h.state === 'ready') return { tab, state: 'ready' };
    first = first || { tab, state: h.state };
  }
  return first;
}
async function focus(tab) {
  try { await chrome.tabs.update(tab.id, { active: true }); await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) { /* вкладку закрыли */ }
}
async function handle(m) {
  const t = await erpTab();
  if (m.req === 'openErp') {
    if (t) await focus(t.tab); else await chrome.tabs.create({ url: ERP_OPEN });
    return { ok: true };
  }
  if (!t) return { error: 'closed' };
  if (t.state !== 'ready') return { error: t.state };
  const res = await ask(t.tab, m);
  if (res && res.ok && ERP_FOCUS.includes(m.req)) await focus(t.tab);
  return res || { error: 'closed' };
}
chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || m.gf !== 'mail' || typeof m.req !== 'string') return;
  handle(m).then(send, () => send({ error: 'closed' }));
  return true;
});
