/* Glass Farm for Gmail — вкладка ERP.
   Передаёт запрос панели странице ERP и её ответ обратно. Страница ERP
   отвечает модулем erp/mail-bridge.js: сообщение window {gf:'mail'} → ответ
   {gf:'mail-reply'}. Сам скрипт ничего не читает и не хранит. */
(function () {
  if (window.gfMailRelay) return;
  window.gfMailRelay = true;
  const waiting = new Map();
  let seq = 0;
  window.addEventListener('message', ev => {
    const m = ev.data;
    if (ev.source !== window || !m || m.gf !== 'mail-reply' || !waiting.has(m.id)) return;
    const done = waiting.get(m.id);
    waiting.delete(m.id);
    done(m.res);
  });
  chrome.runtime.onMessage.addListener((m, sender, send) => {
    if (!m || m.gf !== 'mail' || typeof m.req !== 'string') return;
    const id = 'gf' + Date.now().toString(36) + '-' + (++seq);
    /* Страница без моста (старая версия ERP, экран ещё грузится) не ответит. */
    /* PDF чертежей рисуется дольше — ждём до двух минут. */
    const timer = setTimeout(() => { waiting.delete(id); send({ error: 'closed' }); }, m.req === 'document' ? 120000 : 4000);
    waiting.set(id, res => { clearTimeout(timer); send(res); });
    /* У страницы, открытой файлом с диска, адреса нет — только '*'. */
    window.postMessage(Object.assign({}, m, { id }), location.protocol === 'file:' ? '*' : location.origin);
    return true;
  });
})();
