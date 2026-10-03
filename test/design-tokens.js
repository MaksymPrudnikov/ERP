/* Один набор цветов (владелец, 1 октября 2026): «нам не нужны тысячи цветов».
   Все цвета живут в styles/tokens.css; остальные стили берут только токены.
   Разрешены прозрачные чёрные и белые — тени и затемнения, — а также
   transparent и currentColor. Проверка без браузера, по исходникам. */
const fs=require('fs'),path=require('path');
module.exports=async function({eq}){
 console.log('design-tokens');
 const ROOT=path.join(__dirname,'..'),styles=JSON.parse(fs.readFileSync(path.join(ROOT,'build/manifest.json'),'utf8')).styles;
 const COLOR=/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![-\w])(?:white|black|red|green|blue|orange|yellow|gray|grey|purple|pink|navy|teal)(?![-\w])/g;
 /* Белый — только лёгкий блик (до 30%): плотный белый — это поверхность, её даёт токен. */
 const allowed=m=>{const p=m.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);if(!p)return false;const sum=+p[1]+ +p[2]+ +p[3];return sum<150||(sum>740&&+p[4]<=.3);};
 const raw=[];
 styles.filter(f=>!/tokens\.css$/.test(f)).forEach(f=>{
  const css=fs.readFileSync(path.join(ROOT,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  css.split(/[{};]/).forEach(decl=>{
   const k=decl.indexOf(':');if(k<0)return;const prop=decl.slice(0,k).trim();
   if(!/^(--|color|background|border|outline|fill|stroke|box-shadow|text-shadow|caret|column-rule|text-decoration|accent-color|-webkit-text-fill)/.test(prop))return;
   (decl.slice(k+1).match(COLOR)||[]).filter(m=>!allowed(m)).forEach(m=>raw.push(f.replace('src/styles/','')+' '+prop+': '+m));
  });
 });
 eq('styles use only colours from the Glass Farm token set',raw,[]);
 const tokens=fs.readFileSync(path.join(ROOT,'src/styles/tokens.css'),'utf8'),names=n=>[...tokens.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m=>m[1]).filter(x=>!x.startsWith('cut-')&&!/^(shadow|font)/.test(x));
 const light=tokens.slice(0,tokens.indexOf(':root[data-theme="dark"]')),dark=tokens.slice(tokens.indexOf(':root[data-theme="dark"]'),tokens.indexOf('/* ---- Графика'));
 /* Выбранный мейкап в заказе: оранжевый текст на жёлтом был «грязненько»
    (владелец, 3 октября 2026) — теперь как всё выбранное, зелёным акцентом. */
 const mods=fs.readFileSync(path.join(ROOT,'src/styles/modules.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,''),on=(mods.match(/\.mu-tab\.on\{([^}]*)\}/)||[])[1]||'';
 eq('selected makeup chip uses the accent, not warning colours',{accent:/--accent/.test(on),warning:/--warning/.test(on)},{accent:true,warning:false});
 eq('dark theme defines every light colour token',[...new Set(names(light))].filter(n=>!names(dark).includes(n)),[]);
};
