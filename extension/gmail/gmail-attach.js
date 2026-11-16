/* Glass Farm for Gmail — прикрепить файл к ответу (мир страницы Gmail).
   Скрепка панели передаёт сюда PDF (window.postMessage {gf:'attach-file'})
   и нажимает в ответе Gmail кнопку Attach files. Gmail открывает выбор
   файла — input type=file; этот скрипт вместо окна выбора кладёт в него
   переданный файл и сообщает Gmail «файл выбран» (change). Ждёт не дольше
   5 с и только один файл: обычная кнопка Attach files открывает окно, как
   всегда. Проверка владельца 16.11.2026: «перетаскивание» (drop) настоящий
   Gmail не принял — файл открылся новым окном. Сети нет. */
(function () {
  if (window.gfAttachFile) return;
  window.gfAttachFile = true;
  let pending = null, timer = 0;
  window.addEventListener('message', ev => {
    const m = ev.data;
    if (ev.source !== window || !m || m.gf !== 'attach-file' || !(m.file instanceof File)) return;
    pending = m.file; clearTimeout(timer); timer = setTimeout(() => { pending = null; }, 5000);
  });
  function take(input) {
    if (!pending || !input || input.type !== 'file') return false;
    const dt = new DataTransfer();
    dt.items.add(pending); pending = null; clearTimeout(timer);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (!take(this)) return click.apply(this, arguments); };
  if (HTMLInputElement.prototype.showPicker) {
    const picker = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { if (!take(this)) return picker.apply(this, arguments); };
  }
  document.addEventListener('click', ev => { if (pending && ev.target instanceof HTMLInputElement && ev.target.type === 'file') { ev.preventDefault(); take(ev.target); } }, true);
})();
