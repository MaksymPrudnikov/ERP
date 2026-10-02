/* =====================================================================
   erp/access  ·  access-1.0
   Кто что может и как хранятся секреты — один слой.
   IN : signinUser() (erp/signin), sha256Hex (core/sha256)
   OUT: USER_SECTIONS, ACCESS_ADMIN, accessCan(); пароль офиса и PIN станции

   Владелец, 3 октября 2026: «построй правильную архитектуру под базу данных…
   строй на будущее». Сейчас база живёт в браузере; когда появится сервер,
   меняется этот файл и erp/signin, остальной код — нет:
   · права — строки-ключи разделов меню (USER_SECTIONS) в поле access
     человека. В базе это столбец access у пользователя; сервер проверяет те
     же ключи на своих запросах, интерфейс — через accessCan();
   · ACCESS_ADMIN (раздел Users) — администратор: люди, пароли, PIN и вся
     база целиком (Export / Import JSON). На сервере это админские запросы;
   · секреты — только отпечатки {algo, salt, hash}, ни пароля, ни PIN в базе
     и в выгрузке нет. algo записан, чтобы сервер при первом входе проверил
     старый отпечаток и пересчитал своим, более медленным алгоритмом;
   · id человека — viewProfileId; журнал заказа и скан станции пишут его
     рядом с именем (byId).
   Правило: файл не знает про заказы, цены и экраны.
   ===================================================================== */
const USER_SECTIONS=['sales','optimization','production','shipping','finance','customers','masterdata','users','dashboard'];
const ACCESS_ADMIN='users';
/* Никто не вошёл — входа ещё нет (пароля нет ни у кого с Users, erp/signin):
   видно всё, как в пустой базе. С сервером «никто не вошёл» значит «ничего».
   Редактор формы (configurators) — часть Sales; экраны вне меню (станция)
   ключа не имеют. */
function accessCan(key){
 const u=typeof signinUser==='function'?signinUser():null;
 if(!u)return true;
 const k=key==='configurators'?'sales':key;
 return !USER_SECTIONS.includes(k)||u.access.includes(k);
}
function userOffice(u){return !!(u&&Array.isArray(u.access)&&u.access.length);}

/* --- секреты: пароль офиса (8+ символов) и PIN станции (4 цифры) --- */
const SECRET_ALGO='sha256-salt';
const USER_PASSWORD_MIN=8;
const USER_PIN_RE=/^\d{4}$/;
function secretMake(text){
 const a=new Uint8Array(16);crypto.getRandomValues(a);
 const salt=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {algo:SECRET_ALGO,salt,hash:sha256Hex(salt+':'+text)};
}
function secretValid(s){return !!(s&&typeof s==='object'&&s.algo===SECRET_ALGO&&/^[0-9a-f]{32}$/.test(s.salt)&&/^[0-9a-f]{64}$/.test(s.hash));}
function secretCheck(s,text){return secretValid(s)&&sha256Hex(s.salt+':'+text)===s.hash;}
/* Приводит секреты человека к виду для базы. PIN из старых данных лежал
   открытой строкой — превращается в отпечаток; пароль ветки до access-1.0
   (passwordHash + passwordSalt) — в объект. Битое — удаляется: войти по нему
   нельзя, офис выдаст новый. */
function secretsNormalize(u){
 if(!u.password&&u.passwordHash&&u.passwordSalt)u.password={algo:SECRET_ALGO,salt:String(u.passwordSalt),hash:String(u.passwordHash)};
 delete u.passwordHash;delete u.passwordSalt;
 if(!secretValid(u.password))delete u.password;
 if(typeof u.pin==='string'||typeof u.pin==='number'){const p=String(u.pin);if(USER_PIN_RE.test(p))u.pin=secretMake(p);}
 if(!secretValid(u.pin))delete u.pin;
}
function userPasswordSet(u,password){u.password=secretMake(password);}
function userPasswordCheck(u,password){return !!u&&secretCheck(u.password,password);}
function userPinSet(u,pin){u.pin=secretMake(pin);}
function userPinCheck(u,pin){return !!u&&secretCheck(u.pin,pin);}
