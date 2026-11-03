/* =====================================================================
   reports/formula  ·  formula-1.0
   Свой показатель отчёта формулой, как calculated field в Looker Studio.
   IN : поля и метрики источника (reports/sources)
   OUT: repFormulaParse(text, S, custom) → {ast, keys, error},
        repFormulaEval(ast, S, list) → число или null, REP_FORMULA_FUNCS
   Правило: файл ничего не рисует.

   Владелец, 03.11.2026: «кастомный показатель — ввожу название параметра и
   что отнять или что на что поделить, и у меня моя личная формула».
   · Поле — [Название] как в списке полей (или ключ поля): [Waste ft²].
     Числовое поле без функции — сумма: [Sheets] = SUM([Sheets]).
   · Метрика источника тем же способом: [Used %], [Glass ft²]; и свой
     показатель этого отчёта — по своему имени.
   · Функции: SUM AVG MIN MAX COUNT COUNT_DISTINCT; COUNT() — строки.
   · + − * / и скобки; деление на ноль — пусто, а не бесконечность.
   ===================================================================== */
const REP_FORMULA_FUNCS=['SUM','AVG','MIN','MAX','COUNT','COUNT_DISTINCT'];
function repFormulaTokens(text){
 const out=[],s=String(text||'');let i=0;
 while(i<s.length){
  const c=s[i];
  if(/\s/.test(c)){i++;continue;}
  if(c==='['){const j=s.indexOf(']',i);if(j<0)throw new Error('A field name is not closed with ].');out.push({t:'f',v:s.slice(i+1,j).trim()});i=j+1;continue;}
  if(/[0-9.]/.test(c)){const m=/^[0-9]*\.?[0-9]+/.exec(s.slice(i));if(!m)throw new Error('Check the number near "'+s.slice(i,i+8)+'".');out.push({t:'n',v:+m[0]});i+=m[0].length;continue;}
  if(/[A-Za-z_]/.test(c)){const m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));out.push({t:'w',v:m[0]});i+=m[0].length;continue;}
  if('+-*/(),'.includes(c)){out.push({t:c});i++;continue;}
  throw new Error('Unknown sign "'+c+'".');
 }
 return out;
}
/* Имя → поле или метрика источника, или свой показатель. */
function repFormulaRef(name,S,custom,seen){
 const low=String(name).toLowerCase(),fields=repFields(S);
 const f=fields.find(x=>x.label.toLowerCase()===low)||fields.find(x=>x.k.toLowerCase()===low);
 const m=(S.metrics||[]).find(x=>x.label.toLowerCase()===low||x.k.toLowerCase()===low);
 if(m&&(!f||f.type!=='num'))return {t:'met',m};
 if(f)return {t:'field',f};
 const c=(custom||[]).find(x=>x.name.toLowerCase()===low);
 if(c){if(seen.has(c.id))throw new Error('"'+c.name+'" uses itself.');const p=repFormulaParse(c.formula,S,custom,new Set(seen).add(c.id));if(p.error)throw new Error('"'+c.name+'": '+p.error);return {t:'sub',ast:p.ast};}
 throw new Error('No field "'+name+'" in '+S.label+'.');
}
function repFormulaParse(text,S,custom,seen){
 seen=seen||new Set();
 try{
  const tk=repFormulaTokens(text);let i=0;
  if(!tk.length)throw new Error('Type a formula.');
  const peek=()=>tk[i],take=t=>{const x=tk[i];if(!x||x.t!==t)throw new Error(t===')'?'A bracket is not closed.':'Expected "'+t+'".');i++;return x;};
  const expr=()=>{let a=term();while(peek()&&(peek().t==='+'||peek().t==='-')){const op=tk[i++].t;a={t:'op',op,a,b:term()};}return a;};
  const term=()=>{let a=unary();while(peek()&&(peek().t==='*'||peek().t==='/')){const op=tk[i++].t;a={t:'op',op,a,b:unary()};}return a;};
  const unary=()=>{if(peek()&&peek().t==='-'){i++;return {t:'neg',a:unary()};}return prim();};
  const plain=r=>{if(r.t!=='field')return r;if(r.f.type!=='num')throw new Error('['+r.f.label+'] is not a number — use COUNT_DISTINCT(['+r.f.label+']).');return {t:'agg',fn:'SUM',f:r.f};};
  const prim=()=>{
   const x=peek();if(!x)throw new Error('The formula ends too early.');
   if(x.t==='n'){i++;return {t:'n',v:x.v};}
   if(x.t==='('){i++;const e=expr();take(')');return e;}
   if(x.t==='f'){i++;return plain(repFormulaRef(x.v,S,custom,seen));}
   if(x.t==='w'){
    const fn=x.v.toUpperCase();i++;
    if(REP_FORMULA_FUNCS.includes(fn)&&peek()&&peek().t==='('){
     i++;if(peek()&&peek().t===')'){i++;if(fn!=='COUNT')throw new Error(fn+' needs a field.');return {t:'agg',fn,f:null};}
     const a=peek();if(!a||(a.t!=='f'&&a.t!=='w'))throw new Error(fn+'( ) takes a field, like '+fn+'([Sheets]).');i++;
     const r=repFormulaRef(a.v,S,custom,seen);take(')');
     if(r.t!=='field')throw new Error(fn+'( ) takes a field, not a metric.');
     if(['SUM','AVG','MIN','MAX'].includes(fn)&&r.f.type!=='num')throw new Error('['+r.f.label+'] is not a number.');
     return {t:'agg',fn,f:r.f};
    }
    return plain(repFormulaRef(x.v,S,custom,seen));
   }
   throw new Error('Unexpected "'+x.t+'".');
  };
  const ast=expr();if(i<tk.length)throw new Error('Check the formula near "'+(tk[i].v!=null?tk[i].v:tk[i].t)+'".');
  return {ast,error:''};
 }catch(e){return {ast:null,error:e.message};}
}
/* Значение на строках группы. */
function repFormulaEval(n,S,list){
 if(!n)return null;
 switch(n.t){
  case 'n':return n.v;
  case 'neg':{const a=repFormulaEval(n.a,S,list);return a==null?null:-a;}
  case 'op':{const a=repFormulaEval(n.a,S,list),b=repFormulaEval(n.b,S,list);if(a==null||b==null)return null;return n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:b?a/b:null;}
  case 'met':return repAgg(S,n.m,list);
  case 'sub':return repFormulaEval(n.ast,S,list);
  case 'agg':{
   if(!n.f)return list.length;
   const f=n.f,get=r=>f.type==='num'?r[f.k]:repGet(f,r);
   if(n.fn==='COUNT_DISTINCT'){const s=new Set();list.forEach(r=>{const v=get(r);if(v!=null&&v!==''&&v!=='—')s.add(v);});return s.size;}
   if(n.fn==='COUNT'){let c=0;list.forEach(r=>{const v=get(r);if(v!=null&&v!=='')c++;});return c;}
   let s=0,c=0,lo=null,hi=null;list.forEach(r=>{const v=r[f.k];if(v==null||v===''||!Number.isFinite(+v))return;const x=+v;s+=x;c++;if(lo==null||x<lo)lo=x;if(hi==null||x>hi)hi=x;});
   if(!c)return n.fn==='SUM'?0:null;
   return n.fn==='SUM'?s:n.fn==='AVG'?s/c:n.fn==='MIN'?lo:hi;
  }
 }
 return null;
}
/* Поля строки, которые читает формула (архив читает только их). */
function repFormulaWalk(n,fn){if(!n)return;fn(n);['a','b','ast'].forEach(k=>{if(n[k]&&typeof n[k]==='object')repFormulaWalk(n[k],fn);});}
