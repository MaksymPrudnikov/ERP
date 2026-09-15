/* =====================================================================
   erp/documents/company  ·  documents-1.0
   Реквизиты компании для бланков заказа и наборы полей трёх бланков.
   IN : DB.company, DB.documentSettings
   OUT: нормализованные реквизиты; каталог полей; набор полей бланка
   Правило: здесь нет ни расчёта цены, ни разметки листа — только данные.
   ===================================================================== */

/* Реквизиты заполняет владелец один раз (Master Data → Company). Пустые поля
   на бланке просто не печатаются: подставлять «Street address» клиенту нельзя.
   Депозит по умолчанию 50% — базовый процесс владельца для новых и cash-
   клиентов (14 сентября 2026); клиенту с кредитом он не начисляется. */
const COMPANY_DEFAULT={
 legalName:'Infinity Glass Group Inc',address1:'',address2:'',city:'',province:'ON',postalCode:'',country:'Canada',
 phone:'',email:'',website:'',hstNumber:'',logo:'',
 depositPercent:50,quoteValidDays:180,paymentInstructions:'',termsText:'',footerText:'Thank you for your business'
};
/* Логотип хранится в данных картинкой JPEG: он уходит в localStorage и в
   Export JSON, а PDF умеет вставлять JPEG как есть, без перекодирования.
   Потолок — чтобы случайная фотография не съела место всей базы. */
const COMPANY_LOGO_MAX_CHARS=400000;
DEFAULT.company=JSON.parse(JSON.stringify(COMPANY_DEFAULT));
if(!DB.company||typeof DB.company!=='object'||Array.isArray(DB.company))DB.company=JSON.parse(JSON.stringify(COMPANY_DEFAULT));

function companyString(v,max){return String(v==null?'':v).replace(/\r\n?/g,'\n').trim().slice(0,max||200);}
/* Срок цен квоты в днях. Владелец, 15 сентября 2026: «у нас более длинный
   период, около 180 дней, но дай возможность модификации». */
function companyDays(v,fallback){const n=Math.floor(Number(v));return v!==''&&v!=null&&Number.isFinite(n)&&n>=1&&n<=3650?n:fallback;}
function companyPercent(v,fallback){const n=Number(v);return v!==''&&v!=null&&Number.isFinite(n)&&n>=0&&n<=100?Math.round(n*100)/100:fallback;}
function normalizeCompany(){
 const c=DB.company&&typeof DB.company==='object'&&!Array.isArray(DB.company)?DB.company:{};
 const logo=typeof c.logo==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(c.logo)&&c.logo.length<=COMPANY_LOGO_MAX_CHARS?c.logo:'';
 /* Поля нет вовсе (старый файл) — заводское значение; поле очищено руками —
    остаётся пустым: владелец вправе убрать подвал «Thank you for your business». */
 const s=(k,max)=>c[k]==null?COMPANY_DEFAULT[k]:companyString(c[k],max);
 DB.company={
  legalName:companyString(c.legalName)||COMPANY_DEFAULT.legalName,
  address1:s('address1'),address2:s('address2'),city:s('city',80),
  province:s('province',40),postalCode:s('postalCode',20),country:s('country',60),
  phone:s('phone',60),email:s('email',120),website:s('website',120),hstNumber:s('hstNumber',60),
  logo,depositPercent:companyPercent(c.depositPercent,COMPANY_DEFAULT.depositPercent),
  paymentInstructions:s('paymentInstructions',1200),termsText:s('termsText',4000),
  footerText:s('footerText',160),quoteValidDays:companyDays(c.quoteValidDays,COMPANY_DEFAULT.quoteValidDays)
 };
}

/* ---------------------------------------------------------------------
   Условия оплаты. Владелец, 14 сентября 2026: новые и cash-клиенты платят
   депозит (базово 50%) до начала работ, остальным даётся кредит на срок,
   который зависит от клиента. Раньше это было свободным текстом «45 Days
   Net» — по тексту программа не может посчитать депозит, поэтому режим и
   число хранятся отдельно, а старый текст разбирается один раз.
   --------------------------------------------------------------------- */
const PAYMENT_MODES=['cash','credit'];
function paymentTermsFrom(src){
 src=src&&typeof src==='object'?src:{};
 const days=v=>{const n=Math.floor(Number(v));return v!==''&&v!=null&&Number.isFinite(n)&&n>=0&&n<=365?n:null;};
 let mode=PAYMENT_MODES.includes(src.paymentMode)?src.paymentMode:'';
 let creditDays=days(src.creditDays);
 if(!mode){
  const text=String(src.paymentTerms||'');
  const net=text.match(/net\s*(\d{1,3})|(\d{1,3})\s*days?/i);
  if(net){mode='credit';if(creditDays==null)creditDays=days(net[1]||net[2]);}
  else mode='cash';
 }
 return {paymentMode:mode,depositPercent:companyPercent(src.depositPercent,null),creditDays};
}
/* Пустой процент депозита значит «как у компании»: поменял базовые 50 в
   Company — поменялось у всех клиентов, кому отдельно не назначено. */
function paymentDepositPercent(terms){
 if(!terms||terms.paymentMode!=='cash')return 0;
 return terms.depositPercent!=null?terms.depositPercent:(DB.company&&DB.company.depositPercent!=null?DB.company.depositPercent:COMPANY_DEFAULT.depositPercent);
}
function paymentTermsLabel(terms){
 if(!terms)return '';
 if(terms.paymentMode==='credit')return terms.creditDays!=null?'Net '+terms.creditDays+' days':'Credit';
 const p=paymentDepositPercent(terms);return p>0?'Cash · '+p+'% deposit':'Cash';
}

/* ---------------------------------------------------------------------
   Бланки и их поля. Каталог один на все три бланка; у поля указано, в каких
   бланках оно имеет смысл и включено ли в базовом наборе. Панель ✎ Customize
   рисуется из этого списка, поэтому новое поле добавляется одной строкой.
   --------------------------------------------------------------------- */
const DOC_KINDS=[
 {k:'workOrder',label:'Work order'},
 {k:'proforma',label:'Proforma invoice'},
 {k:'confirmation',label:'Order confirmation'},
 {k:'quote',label:'Quote'}
];
const DOC_PRICE_MODES=[
 {k:'full',label:'Full breakdown',hint:'every lite, cavity and service with its rate'},
 {k:'split',label:'Glass and services separately'},
 {k:'glass',label:'Glass price only',hint:'services named, priced in totals'},
 {k:'unit',label:'Unit price and line total'},
 {k:'none',label:'No prices'}
];
const DOC_ALL=['workOrder','proforma','confirmation','quote'],DOC_SALE=['proforma','confirmation','quote'],DOC_ORDER_SALE=['proforma','confirmation'],DOC_SHOP=['workOrder'];
const DOC_FIELDS=[
 {k:'company',g:'Header',label:'Company logo and details',kinds:DOC_ALL,on:DOC_ALL},
 {k:'date',g:'Header',label:'Date',kinds:DOC_ALL,on:DOC_ALL},
 {k:'validUntil',g:'Header',label:'Valid until',kinds:['quote'],on:['quote']},
 {k:'customerPo',g:'Header',label:'Customer PO',kinds:DOC_ALL,on:DOC_ALL},
 {k:'dueDate',g:'Header',label:'Due date',kinds:DOC_ALL,on:DOC_ALL},
 {k:'terms',g:'Header',label:'Payment terms',kinds:DOC_SALE,on:DOC_SALE},
 {k:'salesRep',g:'Header',label:'Sales rep',kinds:DOC_ALL,on:DOC_ALL},
 {k:'currency',g:'Header',label:'Currency',kinds:DOC_SALE,on:DOC_SALE},
 {k:'priority',g:'Header',label:'Priority',kinds:DOC_ALL,on:DOC_SHOP},
 {k:'delivery',g:'Header',label:'Pickup / Delivery',kinds:DOC_ALL,on:DOC_SHOP},
 {k:'accountCode',g:'Header',label:'Customer account code',kinds:DOC_ALL,on:[]},
 {k:'taxNumber',g:'Header',label:'Customer tax / HST-exempt number',kinds:DOC_SALE,on:[]},
 {k:'billTo',g:'Customer',label:'Customer address',kinds:DOC_ALL,on:DOC_ALL},
 {k:'contact',g:'Customer',label:'Contact name · phone · email',kinds:DOC_ALL,on:DOC_ALL},
 {k:'shipTo',g:'Customer',label:'Ship to / Pickup',kinds:DOC_ALL,on:DOC_ALL},
 {k:'mark',g:'Lines',label:'Mark',kinds:DOC_ALL,on:DOC_ALL},
 {k:'makeupShort',g:'Lines',label:'Makeup code and short description',kinds:DOC_ALL,on:DOC_ALL},
 {k:'makeupFull',g:'Lines',label:'Makeup in full',hint:'every lite, coating surface, spacer, gas, sealant',kinds:DOC_ALL,on:[]},
 {k:'size',g:'Lines',label:'Size W × H',kinds:DOC_ALL,on:DOC_ALL},
 {k:'thickness',g:'Lines',label:'Overall unit thickness',kinds:DOC_ALL,on:[]},
 {k:'shapeDrawing',g:'Lines',label:'Shape drawing',hint:'small drawing next to shaped lines',kinds:DOC_ALL,on:[]},
 {k:'billableArea',g:'Lines',label:'Billable area',kinds:DOC_SALE,on:DOC_SALE},
 {k:'actualArea',g:'Lines',label:'Actual area',kinds:DOC_ALL,on:DOC_SHOP},
 {k:'weight',g:'Lines',label:'Weight per unit / per line',kinds:DOC_ALL,on:DOC_SHOP},
 {k:'route',g:'Production',label:'Route by station',kinds:DOC_SHOP,on:DOC_SHOP},
 {k:'cutSize',g:'Production',label:'Cut size at CUT',kinds:DOC_SHOP,on:DOC_SHOP},
 {k:'cavities',g:'Production',label:'Cavity details',hint:'spacer, gas, sealants',kinds:DOC_SHOP,on:DOC_SHOP},
 {k:'basisRate',g:'Prices on lines',label:'Basis and rate columns',kinds:DOC_SALE,on:DOC_SALE},
 {k:'perFt2',g:'Prices on lines',label:'Glass price per ft²',kinds:DOC_SALE,on:DOC_SALE},
 {k:'serviceNames',g:'Prices on lines',label:'Service names under each line',hint:'when services are not itemised',kinds:DOC_SALE,on:DOC_SALE},
 {k:'extraItems',g:'Bottom',label:'Additional items',kinds:DOC_ALL,on:DOC_ALL},
 {k:'groupTotals',g:'Bottom',label:'Totals by group',hint:'glass / services / surcharges',kinds:DOC_SALE,on:[]},
 {k:'totals',g:'Bottom',label:'Subtotal · ES · HST · Total',kinds:DOC_SALE,on:DOC_SALE},
 {k:'receipts',g:'Bottom',label:'Receipts and balance',hint:'paid to date and balance due, when paid',kinds:DOC_ORDER_SALE,on:DOC_ORDER_SALE},
 {k:'orderSummary',g:'Bottom',label:'Order summary',hint:'units, ft², kg',kinds:DOC_ALL,on:DOC_SHOP},
 {k:'payment',g:'Bottom',label:'Deposit or credit terms',kinds:DOC_SALE,on:DOC_SALE},
 {k:'paymentInstructions',g:'Bottom',label:'Payment instructions',kinds:DOC_ORDER_SALE,on:['proforma']},
 {k:'notes',g:'Bottom',label:'Order notes',kinds:DOC_ALL,on:DOC_ALL},
 {k:'termsText',g:'Bottom',label:'Terms and conditions',kinds:DOC_SALE,on:DOC_SALE},
 {k:'signature',g:'Bottom',label:'Customer signature',kinds:DOC_SALE,on:['confirmation','quote']}
];
function docKindLabel(kind){const d=DOC_KINDS.find(x=>x.k===kind);return d?d.label:'Document';}
function docFieldsFor(kind){return DOC_FIELDS.filter(f=>f.kinds.includes(kind));}
function docBaseOptions(kind){
 const o={};docFieldsFor(kind).forEach(f=>{o[f.k]=f.on.includes(kind);});
 if(DOC_SALE.includes(kind))o.priceMode='full';
 return o;
}
/* Сохранённый набор хранит только известные поля своего бланка: поле, которое
   убрали из каталога, не тянется за данными, а новое получает базовое значение. */
function docCleanOptions(kind,raw){
 const base=docBaseOptions(kind),src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},o={};
 Object.keys(base).forEach(k=>{
  if(k==='priceMode')o[k]=DOC_PRICE_MODES.some(m=>m.k===src[k])?src[k]:base[k];
  else o[k]=typeof src[k]==='boolean'?src[k]:base[k];
 });
 return o;
}
DEFAULT.documentSettings={};
if(!DB.documentSettings||typeof DB.documentSettings!=='object'||Array.isArray(DB.documentSettings))DB.documentSettings={};
function normalizeDocumentSettings(){
 const src=DB.documentSettings&&typeof DB.documentSettings==='object'&&!Array.isArray(DB.documentSettings)?DB.documentSettings:{},out={};
 DOC_KINDS.forEach(d=>{if(src[d.k])out[d.k]=docCleanOptions(d.k,src[d.k]);});
 DB.documentSettings=out;
}
function docDefaultOptions(kind){return docCleanOptions(kind,DB.documentSettings&&DB.documentSettings[kind]);}
function normalizeDocuments(){normalizeCompany();normalizeDocumentSettings();}
