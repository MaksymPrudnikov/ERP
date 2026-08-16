/* =====================================================================
   erp/icons  ·  erp-1.0
   SVG-иконки интерфейса.
   IN : имя иконки
   OUT: html-строка
   Правило: файл не знает про цены, клиентов и заказы. Только вход→выход.
   ===================================================================== */

const ICONS={
 home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 sales:'<path d="M3 3h18v6H3z"/><path d="M7 9v12h10V9"/><path d="M9 13h6"/><path d="M9 17h4"/>',
 optimize:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>',
 factory:'<path d="M3 21V9l6 3V8l6 4V6l6 4v11z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
 inventory:'<path d="M4 7h16v14H4z"/><path d="M2 3h20v4H2z"/><path d="M9 11h6"/>',
 purchase:'<path d="M4 4h2l2 11h9l2-7H7"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
 shipping:'<path d="M3 6h11v11H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
 finance:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>',
 shape:'<path d="M5 19 3 8l7-5 10 4 1 10-8 4z"/><circle cx="3" cy="8" r="1"/><circle cx="10" cy="3" r="1"/><circle cx="20" cy="7" r="1"/><circle cx="21" cy="17" r="1"/><circle cx="13" cy="21" r="1"/><circle cx="5" cy="19" r="1"/>',
 muntin:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/>',
 cut:'<path d="m6 3 12 18M18 3 6 21"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>',
 edge:'<path d="M4 17 17 4l3 3L7 20H4z"/><path d="m14 7 3 3"/>',
 cnc:'<path d="M4 4h16v5H4z"/><path d="M8 9v8M16 9v8"/><path d="M6 17h12v3H6z"/><circle cx="12" cy="13" r="2"/>',
 furnace:'<path d="M5 21h14V8H5z"/><path d="M8 8V4h8v4"/><path d="M9 17c-2-3 2-4 1-7 3 2 4 4 2 7 2-1 3-3 2-5 3 3 2 6 0 7H9z"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
 arrow:'<path d="M5 12h14"/><path d="m15 8 4 4-4 4"/>',
 activity:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
 alert:'<path d="M12 3 2 21h20z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 layers:'<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
 report:'<path d="M4 3h16v18H4z"/><path d="M8 7h8M8 11h8M8 15h5"/>'
};
function ico(name, cls=''){
 const p=ICONS[name]||ICONS.layers;
 return `<span class="${cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg></span>`;
}
