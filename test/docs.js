/* Документы: версия и счёт проверок не должны расходиться молча. Дважды за
   21 сентября 2026 скрипт правки документов разрезал строку версии пополам —
   проверки этого не видели, документы они не читают. */
const fs=require('fs'),path=require('path');
module.exports=async function({eq}){
 console.log('docs');
 const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const hand=read('docs/GLASS_ERP_HANDOFF.md'),map=read('КАРТА-ПРОЕКТА.md');
 const vHand=(hand.match(/^Версия ([0-9]+\.[0-9]+) · /m)||[])[1]||'';
 const vMap=(map.match(/Текущая версия \*\*([0-9]+\.[0-9]+)\*\*/)||[])[1]||'';
 /* Строка версии целая: заканчивается точкой, не обрывком. */
 const line=(hand.match(/^Версия [^\n]*/m)||[''])[0];
 eq('документы: версия в хендоффе и в карте совпадают, строка не обрезана',
  {hand:vHand,map:vMap,whole:/\.$/.test(line.trim()),long:line.length>40},
  {hand:vHand,map:vHand,whole:true,long:true});
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
