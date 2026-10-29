/* Контакт клиента в заказе (пункт 6; рисунок владельца 30.10.2026: строка
   спрятана, иконка у поля Customer раскрывает её под шапкой). Лицо выбирают
   из контактов клиента, выбор хранится в заказе; нет телефона или email —
   берётся у основного лица; меток источника и названия компании нет. */
module.exports=async function({page,eq}){
 console.log('order contact');
 const t=await page(undefined,{width:1440,height:900});await require('./optimization-fixture')(t.p);
 /* Ошибка в странице — провал проверки, а не обрыв прогона (на main строки ещё нет). */
 const run=fn=>t.p.evaluate(fn).catch(e=>({error:String(e.message).split('\n')[0]}));
 await t.p.evaluate(()=>{
  oqReset();
  window.ocC=oqCustomer({legalName:'Greenline Window Systems Inc.',displayName:'Greenline Window Systems',
   contacts:[{name:'Anna Kowal',role:'Office manager',phone:'(416) 555-0142',email:'anna@greenline.example',isPrimary:true},{name:'Mark Duval',role:'Site supervisor',mobile:'(647) 555-0187'},
    {name:'Priya Shah',phone2:'(416) 555-0199',email:'priya@greenline.example'},{name:'Tom Becker',phone:'(416) 555-0110',email:'tom@greenline.example'}],
   addresses:[{type:'delivery',address1:'85 Industrial Pkwy',city:'Vaughan',province:'ON',postalCode:'L4K 5W4',isDefault:true},{type:'billing',address1:'120 King St W, Unit 4',city:'Toronto',province:'ON',postalCode:'M5H 1J9',isDefault:true}]});
  window.ocBare=oqCustomer({legalName:'Bare Glass Ltd',contacts:[{name:'Only Name'}],addresses:[]});
  window.ocP=n=>ocC.contacts.find(x=>x.name===n).id;
  window.ocRow=()=>{const r=document.querySelector('[data-order-contact]');if(!r)return null;const g=k=>{const e=r.querySelector('[data-contact-'+k+']');return e?e.textContent.replace(/\s+/g,' ').trim():null;};return {name:g('name'),phone:g('phone'),email:g('email'),address:g('address')};};
  window.ocOpen=()=>{if(!document.querySelector('[data-order-contact]'))document.querySelector('[data-contact-toggle]').click();return ocRow();};
  touch();
 });
 eq('Контакт: строка спрятана; иконка у Customer открывает и закрывает; другой заказ — снова спрятана',await run(()=>{
  const a=oqOrder(ocC),b=oqOrder(ocC);salesDraftDrop();salesOrderEdit(a);
  const hidden=!document.querySelector('[data-order-contact]'),btn=!!document.querySelector('.sales-header-compact [data-contact-toggle]');
  document.querySelector('[data-contact-toggle]').click();const open=!!document.querySelector('[data-order-contact]'),pressed=document.querySelector('[data-contact-toggle]').getAttribute('aria-expanded');
  document.querySelector('[data-contact-toggle]').click();const closed=!document.querySelector('[data-order-contact]');
  document.querySelector('[data-contact-toggle]').click();salesDraftDrop();salesOrderEdit(b);const other=!document.querySelector('[data-order-contact]');salesDraftDrop();
  return {hidden,btn,open,pressed,closed,other};
 }),{hidden:true,btn:true,open:true,pressed:'true',closed:true,other:true});
 eq('Контакт: по умолчанию основное лицо; выбрать другое — Save — открыть снова: оно; другой заказ и карточка клиента не меняются',await run(()=>{
  const a=oqOrder(ocC),b=oqOrder(ocC);salesDraftDrop();salesOrderEdit(a);const first=ocOpen();
  document.querySelector('.so-contact-pick').click();const menu=[...document.querySelectorAll('[data-contact-option]')].map(x=>x.querySelector('b').textContent);
  document.querySelector('[data-contact-option="'+ocP('Mark Duval')+'"]').click();const dirty=salesDraftHasWork();salesOrderSave();salesDraftDrop();
  salesOrderEdit(a);const again=ocOpen();salesDraftDrop();
  return {first:first.name,menu,dirty,again:again.name,stored:salesRecord(a).customerContactId===ocP('Mark Duval'),other:salesRecord(b).customerContactId===ocP('Anna Kowal'),
   primary:salesFindCustomer(ocC.id).contacts.filter(x=>x.isPrimary).map(x=>x.name)};
 }),{first:'Anna Kowal',menu:['Anna Kowal','Mark Duval','Priya Shah','Tom Becker'],dirty:true,again:'Mark Duval',stored:true,other:true,primary:['Anna Kowal']});
 eq('Контакт: телефон и email отдельно — свой, мобильный, второй; нет — у основного лица; нет нигде — «—»; адрес Billing',await run(()=>{
  const id=oqOrder(ocC);salesDraftDrop();salesOrderEdit(id);ocOpen();
  const at=n=>{salesContactPick(ocP(n));return ocRow();};
  const mark=at('Mark Duval'),priya=at('Priya Shah');salesDraftDrop();
  const bare=oqOrder(ocBare);salesDraftDrop();salesOrderEdit(bare);const none=ocOpen();salesDraftDrop();
  return {mark,priya,none};
 }),{mark:{name:'Mark Duval',phone:'(647) 555-0187',email:'anna@greenline.example',address:'120 King St W, Unit 4Toronto, ON M5H 1J9'},
  priya:{name:'Priya Shah',phone:'(416) 555-0199',email:'priya@greenline.example',address:'120 King St W, Unit 4Toronto, ON M5H 1J9'},
  none:{name:'Only Name',phone:'—',email:'—',address:'—'}});
 eq('Контакт: смена клиента — лицо нового клиента; удалённое лицо — основное, чужое лицо в заказ не пишется',await run(()=>{
  const id=oqOrder(ocC);salesDraftDrop();salesOrderEdit(id);ocOpen();salesContactPick(ocP('Tom Becker'));
  salesApplyCustomerDefaults(ocBare.id);render();const switched={name:ocRow().name,id:soDraft.customerContactId===ocBare.contacts[0].id};
  salesApplyCustomerDefaults(ocC.id);soDraft.customerContactId=ocBare.contacts[0].id;render();const foreign=ocRow().name;salesOrderSave();const saved=salesRecord(id).customerContactId===ocP('Anna Kowal');salesDraftDrop();
  const c=salesFindCustomer(ocC.id),keep=JSON.parse(JSON.stringify(c.contacts));salesOrderEdit(id);salesContactPick(ocP('Tom Becker'));salesOrderSave();salesDraftDrop();
  c.contacts=c.contacts.filter(x=>x.name!=='Tom Becker');touch();salesOrderEdit(id);const gone=ocOpen().name;salesOrderSave();const cleaned=salesRecord(id).customerContactId===ocP('Anna Kowal');salesDraftDrop();
  c.contacts=keep;touch();
  return {switched,foreign,saved,gone,cleaned};
 }),{switched:{name:'Only Name',id:true},foreign:'Anna Kowal',saved:true,gone:'Anna Kowal',cleaned:true});
 eq('Контакт: имя, телефон, email и адрес — обычный текст, выделяется; кнопок копирования нет, названия компании нет',await run(()=>{
  const id=oqOrder(ocC);salesDraftDrop();salesOrderEdit(id);ocOpen();
  const row=document.querySelector('[data-order-contact]'),parts=['name','phone','email','address'].map(k=>row.querySelector('[data-contact-'+k+']'));
  const selectable=parts.every(e=>getComputedStyle(e).userSelect!=='none');
  const r=document.createRange();r.selectNodeContents(parts[2]);const s=getSelection();s.removeAllRanges();s.addRange(r);const copied=s.toString();s.removeAllRanges();
  const buttons=[...row.querySelectorAll('button')].map(b=>b.getAttribute('aria-label'));const company=row.textContent.includes('Greenline');salesDraftDrop();
  return {selectable,copied,buttons,company};
 }),{selectable:true,copied:'anna@greenline.example',buttons:['Contact person'],company:false});
 eq('order-contact без ошибок страницы',t.errs,[]);
 await t.c.close();
};
