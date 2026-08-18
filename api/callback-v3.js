const CHAT='-1004382574358';
const INTERNAL='4382574358';
const WEBHOOK='https://abservice-leads-v2.vercel.app/api/callback-v3';
const ORIGIN='https://alecmonopoly84-hue.github.io';
const SEP='\n\n────────\n';
const PREFIX='CRMSTATE:';
const MAX=12;

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const name=u=>`${[u?.first_name,u?.last_name].filter(Boolean).join(' ')||'Сотрудник'}${u?.username?` @${u.username}`:''}`.slice(0,48);
const userKey=u=>String(u?.id||'');
const now=()=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(',',' ·')+' МСК';
const json=(req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':req.headers.get('origin')===ORIGIN?ORIGIN:'','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}});

async function tg(token,method,payload){
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  let d;try{d=await r.json()}catch{d={ok:false,description:`HTTP ${r.status}`}}
  return {ok:r.ok&&!!d.ok,data:d};
}
async function answer(token,id,text,alert=false){if(id)await tg(token,'answerCallbackQuery',{callback_query_id:id,text:String(text).slice(0,180),show_alert:alert})}
async function install(token){return tg(token,'setWebhook',{url:WEBHOOK,allowed_updates:['callback_query','message']})}

function keys(status){
  if(status==='in_work')return{inline_keyboard:[[{text:'☎️ Связались',callback_data:'lead:contacted'},{text:'📵 Не дозвонились',callback_data:'lead:no_answer'}]]};
  if(status==='no_answer')return{inline_keyboard:[[{text:'☎️ Связались',callback_data:'lead:contacted'}],[{text:'🟡 Вернуть в работу',callback_data:'lead:work'}]]};
  if(status==='contacted')return{inline_keyboard:[[{text:'✅ Успех',callback_data:'lead:success'},{text:'❌ Неуспех',callback_data:'lead:fail'}]]};
  if(status==='fail_reason')return{inline_keyboard:[[{text:'💰 Цена',callback_data:'lead:fail:price'},{text:'📦 Нет в наличии',callback_data:'lead:fail:stock'}],[{text:'⏳ Срок',callback_data:'lead:fail:term'},{text:'🚫 Передумал',callback_data:'lead:fail:changed'}],[{text:'📝 Другое',callback_data:'lead:fail:other'},{text:'↩️ Назад',callback_data:'lead:back_contacted'}]]};
  if(status==='new')return{inline_keyboard:[[{text:'🟡 Взять в работу',callback_data:'lead:take'}]]};
  return{inline_keyboard:[]};
}
function crmKeys(){return{inline_keyboard:[[{text:'🔥 Открытые',callback_data:'crm:open'},{text:'👤 Мои',callback_data:'crm:mine'}],[{text:'📊 Сегодня',callback_data:'crm:today'},{text:'📅 Неделя',callback_data:'crm:week'},{text:'🗓 Месяц',callback_data:'crm:month'}],[{text:'📈 Полный отчёт',callback_data:'crm:all'}],[{text:'❓ Как пользоваться',callback_data:'crm:help'}]]}}

function split(text=''){
  const s=String(text),m='────────',i=s.indexOf(m);
  if(i<0)return[s.trim(),''];
  return[s.slice(0,i).trimEnd(),s.slice(i+m.length).trim()];
}
function get(text,label){const l=String(text).split('\n').find(x=>x.includes(label));return l?l.slice(l.indexOf(label)+label.length).trim():''}
function meta(text){return{owner:get(text,'Ответственный:'),taken:get(text,'Взята:'),contacted:get(text,'Связались:'),noanswer:get(text,'Не дозвонились:'),closed:get(text,'Завершена:')||get(text,'Закрыта:')}}
function baseHtml(text){return String(text).split('\n').map((l,i)=>{if(!l)return'';if(i===0)return`<b>${esc(l)}</b>`;if(l.startsWith('ABService ·'))return`<i>${esc(l)}</i>`;const c=l.indexOf(':');return c>0&&c<36?`<b>${esc(l.slice(0,c+1))}</b>${esc(l.slice(c+1))}`:esc(l)}).join('\n')}
function statusHtml(st,m={}){const a=[];if(st==='in_work')a.push('🟡 <b>Статус:</b> В РАБОТЕ');if(st==='no_answer')a.push('📵 <b>Статус:</b> НЕ ДОЗВОНИЛИСЬ');if(st==='contacted')a.push('☎️ <b>Статус:</b> СВЯЗАЛИСЬ');if(st==='fail_reason')a.push('❌ <b>Результат:</b> НЕУСПЕХ — выберите причину');if(st==='success')a.push('✅ <b>Результат:</b> УСПЕХ');if(st==='failed')a.push(`❌ <b>Результат:</b> НЕУСПЕХ${m.reason?` · ${esc(m.reason)}`:''}`);if(m.owner)a.push(`👤 <b>Ответственный:</b> ${esc(m.owner)}`);if(m.taken)a.push(`🕒 <b>Взята:</b> ${esc(m.taken)}`);if(m.contacted)a.push(`☎️ <b>Связались:</b> ${esc(m.contacted)}`);if(m.noanswer)a.push(`📵 <b>Не дозвонились:</b> ${esc(m.noanswer)}`);if(m.closed)a.push(`🏁 <b>Завершена:</b> ${esc(m.closed)}`);return a.join('\n')}
function statusPlain(st,m={}){const a=[];if(st==='in_work')a.push('🟡 Статус: В РАБОТЕ');if(st==='no_answer')a.push('📵 Статус: НЕ ДОЗВОНИЛИСЬ');if(st==='contacted')a.push('☎️ Статус: СВЯЗАЛИСЬ');if(st==='fail_reason')a.push('❌ Результат: НЕУСПЕХ — выберите причину');if(st==='success')a.push('✅ Результат: УСПЕХ');if(st==='failed')a.push(`❌ Результат: НЕУСПЕХ${m.reason?` · ${m.reason}`:''}`);if(m.owner)a.push(`👤 Ответственный: ${m.owner}`);if(m.taken)a.push(`🕒 Взята: ${m.taken}`);if(m.contacted)a.push(`☎️ Связались: ${m.contacted}`);if(m.noanswer)a.push(`📵 Не дозвонились: ${m.noanswer}`);if(m.closed)a.push(`🏁 Завершена: ${m.closed}`);return a.join('\n')}
async function editLead(token,msg,base,st,m){
  let r=await tg(token,'editMessageText',{chat_id:msg.chat.id,message_id:msg.message_id,text:`${baseHtml(base)}${SEP}${statusHtml(st,m)}`,parse_mode:'HTML',disable_web_page_preview:true,reply_markup:keys(st)});
  if(r.ok)return r;
  console.error('html edit failed',r.data);
  r=await tg(token,'editMessageText',{chat_id:msg.chat.id,message_id:msg.message_id,text:`${base.trim()}${SEP}${statusPlain(st,m)}`,disable_web_page_preview:true,reply_markup:keys(st)});
  if(!r.ok)console.error('plain edit failed',r.data);
  return r;
}
const failReason=a=>({'lead:fail:price':'Цена','lead:fail:stock':'Нет в наличии','lead:fail:term':'Срок','lead:fail:changed':'Передумал','lead:fail:other':'Другое'})[a]||'';

function decode(text=''){const m=String(text).match(/CRMSTATE:([A-Za-z0-9_-]+)/);if(!m)return null;try{return JSON.parse(Buffer.from(m[1],'base64url').toString('utf8'))}catch{return null}}
const encode=s=>Buffer.from(JSON.stringify(s),'utf8').toString('base64url');
function normalize(s={}){s=s&&typeof s==='object'?s:{};for(const p of['d','w','mo']){s[p]=s[p]&&typeof s[p]==='object'?s[p]:{};for(const k of['n','s','p','t','c','x','y','f','na','rs','rc'])if(!Number.isFinite(s[p][k]))s[p][k]=0;s[p].m=s[p].m&&typeof s[p].m==='object'?s[p].m:{};s[p].r=s[p].r&&typeof s[p].r==='object'?s[p].r:{}}s.a=Array.isArray(s.a)?s.a.slice(0,MAX):[];s.v=3;return s}
function mgr(st,n){st.m[n]=st.m[n]||{t:0,c:0,x:0,y:0,f:0,na:0};return st.m[n]}
function apply(st,e){if(e.type==='new')return;const b=mgr(st,e.manager||'Сотрудник');if(e.type==='take'){st.t++;b.t++}if(e.type==='no_answer'){st.na++;b.na++}if(e.type==='contacted'){st.c++;b.c++;if(Number.isFinite(e.response)){st.rs+=Math.round(e.response);st.rc++}}if(e.type==='success'){st.y++;st.x++;b.y++;b.x++}if(e.type==='failed'){st.f++;st.x++;b.f++;b.x++;st.r[e.reason||'Другое']=(st.r[e.reason||'Другое']||0)+1}}
function applyActive(s,e){if(!e.id)return;const i=s.a.findIndex(x=>String(x.i)===String(e.id));if(i<0)return;if(['success','failed'].includes(e.type)){s.a.splice(i,1);return}if(e.manager)s.a[i].o=e.manager.slice(0,28);if(e.user)s.a[i].u=e.user;if(e.status)s.a[i].st=e.status}
function record(s,e){s=normalize(s);for(const p of['d','w','mo'])apply(s[p],e);applyActive(s,e);return s}
function avg(st){if(!st.rc)return'—';const m=Math.round(st.rs/st.rc);return m<60?`${m} мин`:`${Math.floor(m/60)} ч ${m%60} мин`}
function summary(st){return`лиды <b>${st.n}</b> · 🛠 ${st.s} · 🧩 ${st.p} · ✅ ${st.y} · ❌ ${st.f}`}
function dashboard(s){s=normalize(s);return['📊 <b>ABSERVICE CRM · ПУЛЬТ</b>',`<i>Обновлено: ${esc(now())}</i>`,'',`🔥 Активных: <b>${s.a.length}</b>`,`Сегодня: ${summary(s.d)}`,`Неделя: ${summary(s.w)}`,`Месяц: ${summary(s.mo)}`,'',`☎️ Среднее время до контакта: <b>${avg(s.d)}</b>`,'','<i>Работа и отчёты — кнопками ниже.</i>',`<tg-spoiler>${PREFIX}${encode(s)}</tg-spoiler>`].join('\n')}
function reportPart(title,st){const a=[`<b>${title}</b>`,`Новые лиды: <b>${st.n}</b>`,`• Сервис: ${st.s}`,`• Запчасти: ${st.p}`,`Взяты: ${st.t}`,`Не дозвонились: ${st.na}`,`Связались: ${st.c}`,`✅ Успех: <b>${st.y}</b>`,`❌ Неуспех: <b>${st.f}</b>`,`Открыты: ${Math.max(0,st.n-st.x)}`,`Среднее время до контакта: <b>${avg(st)}</b>`];const rr=Object.entries(st.r||{}).sort((a,b)=>b[1]-a[1]);if(rr.length){a.push('<b>Причины неуспеха:</b>');rr.slice(0,6).forEach(([r,c])=>a.push(`• ${esc(r)} — ${c}`))}return a.join('\n')}
function report(s,scope='all'){s=normalize(s);const h=`📈 <b>ABSERVICE · ОТЧЁТ</b>\n<i>${esc(now())}</i>`;if(scope==='today')return`${h}\n\n${reportPart('СЕГОДНЯ',s.d)}`;if(scope==='week')return`${h}\n\n${reportPart('ТЕКУЩАЯ НЕДЕЛЯ',s.w)}`;if(scope==='month')return`${h}\n\n${reportPart('ТЕКУЩИЙ МЕСЯЦ',s.mo)}`;return[h,reportPart('СЕГОДНЯ',s.d),reportPart('ТЕКУЩАЯ НЕДЕЛЯ',s.w),reportPart('ТЕКУЩИЙ МЕСЯЦ',s.mo)].join('\n\n────────\n\n')}
function label(st){return st==='new'?'🔵 Новая':st==='in_work'?'🟡 В работе':st==='no_answer'?'📵 Не дозвонились':st==='contacted'?'☎️ Связались':'🟡 Активна'}
function active(s,title,uid=''){s=normalize(s);let a=s.a;if(uid)a=a.filter(x=>String(x.u||'')===uid);const out=[`${uid?'👤':'🔥'} <b>${esc(title)}</b>`,`<i>${esc(now())}</i>`,''];if(!a.length){out.push(uid?'У вас нет активных заявок.':'Активных заявок нет.');return out.join('\n')}a.forEach(x=>out.push(`${x.k==='p'?'🧩':'🛠'} <a href="https://t.me/c/${INTERNAL}/${x.i}">#${x.i}</a> · ${esc(x.q||'Заявка')}`,`   ${label(x.st)}${x.o?` · ${esc(x.o)}`:''}`));return out.join('\n')}

async function getCrm(token){const c=await tg(token,'getChat',{chat_id:CHAT});if(!c.ok)return{ok:false};const p=c.data?.result?.pinned_message,s=p?decode(p.text||''):null;return p&&s?{ok:true,id:p.message_id,state:normalize(s)}:{ok:false}}
async function saveCrm(token,id,s){return tg(token,'editMessageText',{chat_id:CHAT,message_id:id,text:dashboard(s),parse_mode:'HTML',disable_web_page_preview:true,reply_markup:crmKeys()})}
async function recordCrm(token,e){try{const c=await getCrm(token);if(!c.ok)return;await saveCrm(token,c.id,record(c.state,e))}catch(err){console.error('crm record',err)}}
async function send(token,text){return tg(token,'sendMessage',{chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true})}

async function crmAction(token,cb,a){let s=decode(cb.message?.text||'');if(!s){const c=await getCrm(token);if(!c.ok)return{ok:false,error:'CRM-пульт не найден'};s=c.state}if(a==='crm:help'){const r=await send(token,'❓ <b>КАК РАБОТАТЬ</b>\n\nВзять → Связались/Не дозвонились → Успех/Неуспех.\nПри неуспехе выберите причину.');return{ok:r.ok}}if(a==='crm:open'){const r=await send(token,active(s,'ОТКРЫТЫЕ ЗАЯВКИ'));return{ok:r.ok}}if(a==='crm:mine'){const r=await send(token,active(s,'МОИ АКТИВНЫЕ ЗАЯВКИ',userKey(cb.from)));return{ok:r.ok}}const sc={'crm:today':'today','crm:week':'week','crm:month':'month','crm:all':'all'}[a];if(!sc)return{ok:false,error:'Неизвестная команда'};const r=await send(token,report(s,sc));return{ok:r.ok}}

async function leadAction(token,cb,a){
  const msg=cb.message,[base,stText]=split(msg.text||''),m=meta(stText),t=now();let st='',type='',reason='';
  if(a==='lead:take'){st='in_work';type='take';m.owner=name(cb.from);m.taken=t}
  else if(a==='lead:work'){st='in_work';m.owner=m.owner||name(cb.from)}
  else if(a==='lead:no_answer'){st='no_answer';type='no_answer';m.owner=m.owner||name(cb.from);m.noanswer=t}
  else if(a==='lead:contacted'){st='contacted';type='contacted';m.owner=m.owner||name(cb.from);m.taken=m.taken||t;m.contacted=t}
  else if(a==='lead:fail'){st='fail_reason';m.owner=m.owner||name(cb.from)}
  else if(a==='lead:back_contacted'){st='contacted'}
  else if(a==='lead:success'){st='success';type='success';m.owner=m.owner||name(cb.from);m.closed=t}
  else if(reason=failReason(a)){st='failed';type='failed';m.reason=reason;m.owner=m.owner||name(cb.from);m.closed=t}
  else return{ok:false,error:'Неизвестное действие'};
  const e=await editLead(token,msg,base,st,m);if(!e.ok)return{ok:false,error:e.data?.description||'Не удалось обновить карточку'};
  const event={type:type||'status',manager:m.owner,user:userKey(cb.from),id:msg.message_id,status:st,reason};
  if(type==='contacted'){const mt=base.match(/ABService · (\d{2})\.(\d{2})\.(\d{4}) · (\d{2}):(\d{2}) МСК/);if(mt){const d=new Date(Date.UTC(+mt[3],+mt[2]-1,+mt[1],+mt[4]-3,+mt[5]));event.response=Math.max(0,(Date.now()-d)/60000)}}
  await recordCrm(token,event);return{ok:true};
}

async function callback(token,cb){const id=cb?.id,a=String(cb?.data||'');if(!cb?.message||String(cb.message.chat?.id)!==CHAT){await answer(token,id,'Кнопка недоступна',true);return{ok:false}}let r;try{r=a.startsWith('crm:')?await crmAction(token,cb,a):await leadAction(token,cb,a)}catch(e){console.error(e);r={ok:false,error:String(e?.message||e)}}await answer(token,id,r.ok?'Готово':`Ошибка: ${r.error||'не удалось'}`,!r.ok);return r}
async function command(token,m){if(String(m?.chat?.id)!==CHAT)return{ok:true};const [cmd,arg='']=String(m?.text||'').trim().split(/\s+/);if((cmd||'').split('@')[0].toLowerCase()!=='/report')return{ok:true};const c=await getCrm(token);if(!c.ok)return{ok:false,error:'CRM-пульт не найден'};const sc=['today','week','month'].includes(arg)?arg:'all';const r=await send(token,report(c.state,sc));return{ok:r.ok}}

export async function GET(req){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return json(req,{ok:false,error:'token missing'},503);const i=await install(token);const c=await getCrm(token);if(c.ok)await saveCrm(token,c.id,c.state);return json(req,{ok:i.ok,callbackV3:true,webhook:WEBHOOK,crm:c.ok,error:i.data?.description||null})}
export function OPTIONS(req){return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':req.headers.get('origin')===ORIGIN?ORIGIN:'','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}})}
export async function POST(req){const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return json(req,{ok:false,error:'token missing'},503);try{const b=await req.json();if(b.callback_query)return json(req,await callback(token,b.callback_query));if(b.message)return json(req,await command(token,b.message));return json(req,{ok:true})}catch(e){console.error(e);return json(req,{ok:false,error:'callback failed'},500)}}