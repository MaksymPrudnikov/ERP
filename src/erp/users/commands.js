/* =====================================================================
   erp/users/commands  ·  users-commands-1.0
   Команды над людьми. Экраны базу людей сами не трогают — только зовут
   эти функции. Сейчас они меняют DB.user, с сервером станут запросами:
     usersSave(input)              POST /users · PATCH /users/:id
     usersDrop(id, side)           снять вход Office / Station; другого нет —
                                   DELETE /users/:id
     usersChangeOwnPassword(a, b)  POST /me/password
   Каждая команда сама проверяет право (администратор — раздел Users; свой
   пароль — только вошедший), правила и версию записи и пишет одной
   storageCommand: всё или ничего. Ответ — {ok, error, id}.

   Правила (аудит 3 октября 2026, принят владельцем):
   · Users не запирается: пока есть офис, у кого-то остаётся раздел Users;
   · вход не выключается сам: если он включён (erp/signin, signinOn), после
     правки остаётся человек с Users и паролем — иначе ERP открылся бы всем;
   · версия записи (rev): форма, открытая до чужой правки, не сохранит
     старое поверх нового — «Changed elsewhere — reopen»;
   · пароль и PIN приходят только новыми значениями; отпечатки из старой
     копии формы не переносятся никогда.
   IN : DB.user · erp/access · storageCommand (erp/storage)
   OUT: команды; экран — view/users, окно своего пароля — erp/signin
   ===================================================================== */
function usersFail(error){return {ok:false,error};}
function usersFind(id){return (DB.user||[]).find(u=>u.viewProfileId===id)||null;}
/* Что станет с дверью, если база людей станет такой (after: записи с
   access и признаком пароля). Пусто — можно. */
function usersDoorError(after){
 const office=after.filter(userOffice);
 if(office.length&&!office.some(u=>u.access.includes(ACCESS_ADMIN)))return 'Someone must keep Users';
 if(signinOn()&&!after.some(u=>u.hasPassword&&(u.access||[]).includes(ACCESS_ADMIN)))return 'Someone with Users must keep a password';
 return '';
}
function usersShape(u,over){return Object.assign({access:u.access||[],hasPassword:userHasPassword(u)},over||{});}

/* Создать (id пуст) или изменить человека. input: {id, rev, name, no,
   office, access[], password, station, pin}; password и pin — только новые
   значения, пусто — оставить заданный. */
function usersSave(input){
 if(!accessCan(ACCESS_ADMIN))return usersFail('Users access needed');
 const d=input||{},isNew=!d.id,cur=isNew?null:usersFind(d.id);
 if(!isNew&&!cur)return usersFail('This user was deleted');
 if(cur&&cur.rev!==d.rev)return usersFail('Changed elsewhere — reopen');
 const name=String(d.name||'').trim();
 if(!name)return usersFail('Enter a name');
 const access=d.office?USER_SECTIONS.filter(k=>(d.access||[]).includes(k)):[];
 if(d.office&&!access.length)return usersFail('Office: tick at least one section');
 const pw=d.office?String(d.password||''):'',pin=d.station?String(d.pin||''):'';
 if(d.office&&(pw||!userHasPassword(cur))&&pw.length<USER_PASSWORD_MIN)return usersFail('Password: at least '+USER_PASSWORD_MIN+' characters');
 if(d.station&&(pin||!userHasPin(cur))&&!USER_PIN_RE.test(pin))return usersFail('PIN: 4 digits');
 const no=String(d.no==null?'':d.no).trim();
 if(no&&!/^\d{1,4}$/.test(no))return usersFail('No.: up to 4 digits or empty');
 if(no&&+no<1)return usersFail('No.: from 1');
 const taken=no?(DB.user||[]).find(u=>u!==cur&&u.no===+no):null;
 if(taken)return usersFail('No. '+userNoText(taken)+' belongs to '+taken.name);
 const mine=usersShape({},{access,hasPassword:d.office&&(!!pw||userHasPassword(cur))});
 const door=usersDoorError((DB.user||[]).map(u=>u===cur?mine:usersShape(u)).concat(isNew?[mine]:[]));
 if(door)return usersFail(door);
 const me=typeof signinUser==='function'?signinUser():null;
 const out=storageCommand(()=>{
  const u=isNew?{}:usersFind(d.id);
  u.name=name;u.access=access;u.no=no?+no:0;
  if(!d.office)delete u.password;else if(pw)userPasswordSet(u,pw);
  if(!d.station)delete u.pin;else if(pin)userPinSet(u,pin);
  u.rev=(u.rev||0)+1;
  if(isNew)DB.user.push(u);
  normalizeUsers();
  return u.viewProfileId;
 });
 if(!out.ok)return usersFail(out.error);
 /* Свой пароль, сменённый здесь, не выкидывает самого себя. */
 if(me&&me.viewProfileId===out.value&&pw&&typeof signinKeyRefresh==='function')signinKeyRefresh();
 return {ok:true,id:out.value};
}

/* Снять вход на вкладке: Production — PIN, Office — разделы и пароль.
   Другого входа нет — человек удаляется. */
function usersDropError(id,side){
 if(!accessCan(ACCESS_ADMIN))return 'Users access needed';
 const u=usersFind(id);if(!u)return 'This user was deleted';
 const prod=side==='production',other=prod?userOffice(u):userHasPin(u);
 const after=(DB.user||[]).filter(x=>x!==u||other).map(x=>x!==u?usersShape(x):prod?usersShape(x):usersShape(x,{access:[],hasPassword:false}));
 return usersDoorError(after);
}
function usersDrop(id,side){
 const err=usersDropError(id,side);if(err)return usersFail(err);
 const prod=side==='production';
 const out=storageCommand(()=>{
  const u=usersFind(id),other=prod?userOffice(u):userHasPin(u);
  if(!other){DB.user.splice(DB.user.indexOf(u),1);return 'deleted';}
  if(prod)delete u.pin;else{u.access=[];delete u.password;}
  u.rev++;return 'removed';
 });
 return out.ok?{ok:true,id,deleted:out.value==='deleted'}:usersFail(out.error);
}

/* Свой пароль — только офис (владелец, 3 октября 2026); PIN станции даёт
   офис. Текущий вход остаётся, остальные входы этого человека кончаются. */
function usersChangeOwnPassword(current,next){
 const u=typeof signinUser==='function'?signinUser():null;
 if(!u)return usersFail('Sign in first');
 if(!userPasswordCheck(u,current))return usersFail('Wrong password');
 if(String(next||'').length<USER_PASSWORD_MIN)return usersFail('At least '+USER_PASSWORD_MIN+' characters');
 const id=u.viewProfileId;
 const out=storageCommand(()=>{const now=usersFind(id);if(!now)throw new Error('This user was deleted');userPasswordSet(now,next);now.rev++;return id;});
 if(!out.ok)return usersFail(out.error);
 if(typeof signinKeyRefresh==='function')signinKeyRefresh();
 return {ok:true,id};
}
