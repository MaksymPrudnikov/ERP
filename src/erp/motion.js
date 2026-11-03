/* ERP module: erp/motion — движение экрана (владелец, 2.11.2026: «понимаешь, что
   что-то происходит, а не резкие неприятные скачки»). Вариант F + H: разделы и
   вкладки лежат рядом — лёгкий подъём; заказ и окно открываются глубже — лист.
   Только от настоящего клика человека: действия из кода и тестов идут синхронно,
   как раньше. Станциям всё мгновенно. */
const MOTION_WINDOW='.sales-service-modal-back,.doc-back';
let motionTab=false;
function motionOk(){
 const e=window.event;
 return tab!=='station'&&!!e&&e.isTrusted&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/* Лист: браузер снимает старый экран, go рисует новый на следующем кадре. */
function motionSheet(go,out){
 if(!motionOk()||!document.startViewTransition)return go();
 const root=document.documentElement;
 root.style.setProperty('--motion-y',(window.scrollY+window.innerHeight/2)+'px');
 if(out)root.dataset.motion='out';else delete root.dataset.motion;
 const v=document.startViewTransition(go);
 v.ready.catch(()=>{});v.finished.catch(()=>{});
}
/* Открылось окно: render заменил всё, поэтому сравниваем с тем, что было до него. */
function motionHasWindow(app){return !!app.querySelector(MOTION_WINDOW);}
function motionAfterRender(app,had){
 const rise=motionTab;motionTab=false;
 if(!had&&motionOk()){const w=app.querySelector(MOTION_WINDOW);if(w){w.classList.add('motion-window');return;}}
 if(rise&&app.firstElementChild)app.firstElementChild.classList.add('motion-tab');
}
/* Раздел и вкладка — подъём: render идёт из их же клика. Свой раздел не двигается. */
document.addEventListener('click',e=>{
 if(!e.isTrusted||!e.target.closest||!e.target.closest('.tabs button,[aria-label="Production"] button,#side .nav-item:not(.on)')||!motionOk())return;
 motionTab=true;setTimeout(()=>{motionTab=false;},0);
},true);
