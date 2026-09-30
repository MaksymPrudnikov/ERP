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
};
