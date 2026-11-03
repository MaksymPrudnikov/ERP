/* Документы: версия и счёт проверок не должны расходиться молча. Дважды за
   21 сентября 2026 скрипт правки документов разрезал строку версии пополам —
   проверки этого не видели, документы они не читают. */
const fs=require('fs'),path=require('path');
module.exports=async function({eq}){
 console.log('docs');
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const hand=read('docs/GLASS_ERP_HANDOFF.md'),map=read('КАРТА-ПРОЕКТА.md');
 const guide=read('docs/ДЛЯ_ЧАТГПТ.md'),readme=read('README.md');
 const vHand=(hand.match(/^Версия ([0-9]+\.[0-9]+) · /m)||[])[1]||'';
 const vMap=(map.match(/Текущая версия \*\*([0-9]+\.[0-9]+)\*\*/)||[])[1]||'';
 const vGuide=(guide.match(/`docs\/GLASS_ERP_HANDOFF\.md` \(v([0-9]+\.[0-9]+)\)/)||[])[1]||'';
 const vReadme=(readme.match(/^Документация v([0-9]+\.[0-9]+) · /m)||[])[1]||'';
 /* Строка версии целая: заканчивается точкой, не обрывком. */
 const line=(hand.match(/^Версия [^\n]*/m)||[''])[0];
 eq('документы: версии хендоффа, карты, инструкции и README совпадают',
  {hand:vHand,map:vMap,guide:vGuide,readme:vReadme,whole:/\.$/.test(line.trim()),long:line.length>40},
  {hand:vHand,map:vHand,guide:vHand,readme:vHand,whole:true,long:true});
 /* Ссылки на файлы репозитория из живых документов не должны висеть. */
 const live=['README.md','КАРТА-ПРОЕКТА.md','docs/GLASS_ERP_HANDOFF.md','docs/ДЛЯ_ЧАТГПТ.md'];
 const dead=[];
 live.forEach(f=>{const s=read(f);
  (s.match(/`(docs\/[^`\s]+\.md|docs\/[a-z-]+\/)`/g)||[]).forEach(m=>{
   const p=m.replace(/`/g,'').replace(/\/$/,'');
   /* Шаблон вида docs/ЗАДАЧА_*.md — это не ссылка, а описание группы. */
   if(p.indexOf('*')<0&&!fs.existsSync(path.join(root,p)))dead.push(f+' → '+p);});});
 eq('документы: живые документы не ссылаются на удалённые файлы',dead,[]);
 /* Руководство Reports: приложение «все поля и показатели» — то же, что в
    коде (tools/manual-fields.js --write). Владелец, 03.11.2026: «руководство с
    объяснениями — тогда сам сможешь проверять, если что-то дублируется». */
 const mf=require('../tools/manual-fields.js'),want=mf.appendix();
 /* Сборщик PDF руководства (tools/manual-pdf.js): разделы по README, Markdown → HTML. */
 const mp=require('../tools/manual-pdf.js'),h=mp.md('# A\n\n| x | y |\n|---|---|\n| `1` | **2** |\n\n- one\n- two').html;
 eq('руководство: PDF собирается из разделов README — заголовки, таблицы, списки',{ru:mp.sections('ru'),en:mp.sections('en'),table:/<table>.*<code>1<\/code>.*<b>2<\/b>/s.test(h),list:/<ul><li>one<\/li><li>two<\/li><\/ul>/.test(h),head:/<h1 id="s\d+">A<\/h1>/.test(h)},
  {ru:['lists','reports','optimization','shipping'],en:['lists','reports','optimization','shipping'],table:true,list:true,head:true});
 eq('руководство Reports: поля и показатели в обоих языках — как в коде',mf.FILES.map(f=>[f,mf.current(f)===want]),mf.FILES.map(f=>[f,true]));
};
