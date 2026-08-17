const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-1004382574358';
const WEBHOOK_URL = 'https://abservice-leads-v2.vercel.app/api/lead';
const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 1_600_000;
const STATUS_SEPARATOR = '\n\n────────\n';
const CRM_STATE_PREFIX = 'CRMSTATE:';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };

  if (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost:')) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request)
  });
}

function formatMoscowTime(date = new Date()) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date).replace(',', ' ·') + ' МСК';
}

function moscowDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value || '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day'))
  };
}

function isoWeekKey(year, month, day) {
  const current = new Date(Date.UTC(year, month - 1, day));
  const weekday = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - weekday);
  const weekYear = current.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

function periodKeys(date = new Date()) {
  const { year, month, day } = moscowDateParts(date);
  return {
    day: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    week: isoWeekKey(year, month, day),
    month: `${year}-${String(month).padStart(2, '0')}`
  };
}

function emptyStats(key) {
  return { k: key, n: 0, s: 0, p: 0, t: 0, c: 0, x: 0, rs: 0, rc: 0, m: {} };
}

function newCrmState(date = new Date()) {
  const keys = periodKeys(date);
  return {
    v: 1,
    d: emptyStats(keys.day),
    w: emptyStats(keys.week),
    mo: emptyStats(keys.month)
  };
}

function normalizeCrmState(input, date = new Date()) {
  const state = input && typeof input === 'object' ? input : newCrmState(date);
  const keys = periodKeys(date);
  if (!state.d || state.d.k !== keys.day) state.d = emptyStats(keys.day);
  if (!state.w || state.w.k !== keys.week) state.w = emptyStats(keys.week);
  if (!state.mo || state.mo.k !== keys.month) state.mo = emptyStats(keys.month);
  state.v = 1;
  return state;
}

function encodeCrmState(state) {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeCrmState(text = '') {
  const match = String(text).match(/CRMSTATE:([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch (error) {
    console.error('CRM state decode error:', error);
    return null;
  }
}

function normalizePhone(value = '') {
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return '+7' + digits.slice(1);
  if (digits.length === 11 && digits.startsWith('7')) return '+' + digits;
  if (raw.startsWith('+') && digits.length >= 10) return '+' + digits;
  return raw;
}

function safeFileName(value = 'attachment') {
  const cleaned = String(value)
    .replace(/[\\/\0\r\n]/g, '_')
    .trim()
    .slice(0, 100);
  return cleaned || 'attachment';
}

function telegramUserName(user = {}) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  const username = user.username ? ` @${user.username}` : '';
  return `${name || 'Сотрудник'}${username}`.slice(0, 80);
}

function keyboardFor(status) {
  if (status === 'new') {
    return { inline_keyboard: [[{ text: '🟡 Взять в работу', callback_data: 'lead:take' }]] };
  }
  if (status === 'in_work') {
    return { inline_keyboard: [[{ text: '☎️ Связались', callback_data: 'lead:contacted' }]] };
  }
  if (status === 'contacted') {
    return { inline_keyboard: [[{ text: '✅ Закрыть', callback_data: 'lead:closed' }]] };
  }
  return { inline_keyboard: [] };
}

function crmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Сегодня', callback_data: 'crm:today' },
        { text: '📅 Неделя', callback_data: 'crm:week' },
        { text: '🗓 Месяц', callback_data: 'crm:month' }
      ],
      [{ text: '📈 Полный отчёт', callback_data: 'crm:all' }],
      [{ text: '❓ Как пользоваться', callback_data: 'crm:help' }]
    ]
  };
}

function formatBaseLeadHtml(plainText = '') {
  return String(plainText)
    .split('\n')
    .map((line, index) => {
      if (!line) return '';
      if (index === 0) return `<b>${escapeHtml(line)}</b>`;
      if (line.startsWith('ABService ·')) return `<i>${escapeHtml(line)}</i>`;
      const colon = line.indexOf(':');
      if (colon > 0 && colon < 32) {
        return `<b>${escapeHtml(line.slice(0, colon + 1))}</b>${escapeHtml(line.slice(colon + 1))}`;
      }
      return escapeHtml(line);
    })
    .join('\n');
}

function extractValue(text = '', label = '') {
  const line = String(text).split('\n').find(item => item.includes(label));
  if (!line) return '';
  return line.slice(line.indexOf(label) + label.length).trim();
}

function buildStatusHtml(status, meta = {}) {
  if (status === 'new') return '🔵 <b>Статус:</b> НОВАЯ';

  const lines = [];
  if (status === 'in_work') lines.push('🟡 <b>Статус:</b> В РАБОТЕ');
  if (status === 'contacted') lines.push('☎️ <b>Статус:</b> СВЯЗАЛИСЬ');
  if (status === 'closed') lines.push('✅ <b>Статус:</b> ЗАКРЫТА');

  if (meta.owner) lines.push(`👤 <b>Ответственный:</b> ${escapeHtml(meta.owner)}`);
  if (meta.takenAt) lines.push(`🕒 <b>Взята:</b> ${escapeHtml(meta.takenAt)}`);
  if (meta.contactedAt) lines.push(`☎️ <b>Связались:</b> ${escapeHtml(meta.contactedAt)}`);
  if (meta.closedAt) lines.push(`✅ <b>Закрыта:</b> ${escapeHtml(meta.closedAt)}`);
  return lines.join('\n');
}

function parseLeadCreatedAt(text = '') {
  const match = String(text).match(/ABService · (\d{2})\.(\d{2})\.(\d{4}) · (\d{2}):(\d{2}) МСК/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh) - 3, Number(min)));
}

function managerBucket(stats, manager) {
  if (!manager) return null;
  if (!stats.m || typeof stats.m !== 'object') stats.m = {};
  if (!stats.m[manager]) stats.m[manager] = { t: 0, c: 0, x: 0 };
  return stats.m[manager];
}

function applyCrmEvent(stats, event) {
  if (event.type === 'new') {
    stats.n += 1;
    if (event.kind === 'parts') stats.p += 1;
    else stats.s += 1;
    return;
  }

  const manager = event.manager || 'Сотрудник';
  const bucket = managerBucket(stats, manager);

  if (event.type === 'take') {
    stats.t += 1;
    bucket.t += 1;
  }

  if (event.type === 'contacted') {
    stats.c += 1;
    bucket.c += 1;
    if (Number.isFinite(event.responseMinutes) && event.responseMinutes >= 0) {
      stats.rs += Math.round(event.responseMinutes);
      stats.rc += 1;
    }
  }

  if (event.type === 'closed') {
    stats.x += 1;
    bucket.x += 1;
  }
}

function recordCrmEvent(state, event) {
  const normalized = normalizeCrmState(state);
  applyCrmEvent(normalized.d, event);
  applyCrmEvent(normalized.w, event);
  applyCrmEvent(normalized.mo, event);
  return normalized;
}

function averageContactText(stats) {
  if (!stats.rc) return '—';
  const minutes = Math.max(0, Math.round(stats.rs / stats.rc));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function periodSummary(stats) {
  return `лиды <b>${stats.n}</b> · 🛠 ${stats.s} · 🧩 ${stats.p} · ✅ ${stats.x}`;
}

function topManagers(stats, limit = 5) {
  return Object.entries(stats.m || {})
    .map(([name, value]) => ({ name, ...value, score: value.t + value.c + value.x }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function renderDashboard(state) {
  const normalized = normalizeCrmState(state);
  const managers = topManagers(normalized.d, 3);
  const lines = [
    '📊 <b>ABSERVICE CRM · СВОДКА</b>',
    `<i>Обновлено: ${escapeHtml(formatMoscowTime())}</i>`,
    '',
    `Сегодня: ${periodSummary(normalized.d)}`,
    `Неделя: ${periodSummary(normalized.w)}`,
    `Месяц: ${periodSummary(normalized.mo)}`,
    '',
    `☎️ Среднее время до контакта сегодня: <b>${escapeHtml(averageContactText(normalized.d))}</b>`
  ];

  if (managers.length) {
    lines.push('', '<b>Менеджеры сегодня:</b>');
    managers.forEach(item => {
      lines.push(`• ${escapeHtml(item.name)}: взял ${item.t} · связался ${item.c} · закрыл ${item.x}`);
    });
  }

  lines.push('', '<i>Отчёты — кнопками ниже.</i>');
  lines.push(`<tg-spoiler>${CRM_STATE_PREFIX}${encodeCrmState(normalized)}</tg-spoiler>`);
  return lines.join('\n');
}

function reportSection(title, stats) {
  const lines = [
    `<b>${title}</b>`,
    `Новые лиды: <b>${stats.n}</b>`,
    `• Сервис: ${stats.s}`,
    `• Запчасти: ${stats.p}`,
    `Взяты в работу: ${stats.t}`,
    `Связались: ${stats.c}`,
    `Закрыты: ${stats.x}`,
    `Открыты / не закрыты: ${Math.max(0, stats.n - stats.x)}`,
    `Среднее время до контакта: <b>${escapeHtml(averageContactText(stats))}</b>`
  ];

  const managers = topManagers(stats, 8);
  if (managers.length) {
    lines.push('<b>По менеджерам:</b>');
    managers.forEach(item => {
      lines.push(`• ${escapeHtml(item.name)} — взял ${item.t}, связался ${item.c}, закрыл ${item.x}`);
    });
  }
  return lines.join('\n');
}

function renderReport(state, scope = 'all') {
  const normalized = normalizeCrmState(state);
  const header = `📈 <b>ABSERVICE · ОТЧЁТ</b>\n<i>${escapeHtml(formatMoscowTime())}</i>`;
  if (scope === 'today') return `${header}\n\n${reportSection('СЕГОДНЯ', normalized.d)}`;
  if (scope === 'week') return `${header}\n\n${reportSection('ТЕКУЩАЯ НЕДЕЛЯ', normalized.w)}`;
  if (scope === 'month') return `${header}\n\n${reportSection('ТЕКУЩИЙ МЕСЯЦ', normalized.mo)}`;
  return [
    header,
    reportSection('СЕГОДНЯ', normalized.d),
    reportSection('ТЕКУЩАЯ НЕДЕЛЯ', normalized.w),
    reportSection('ТЕКУЩИЙ МЕСЯЦ', normalized.mo)
  ].join('\n\n────────\n\n');
}

function renderCrmHelp() {
  return [
    '❓ <b>ABSERVICE CRM · КАК РАБОТАТЬ</b>',
    '',
    '1. Новая заявка автоматически приходит в группу.',
    '2. Менеджер нажимает <b>«🟡 Взять в работу»</b>.',
    '3. После разговора с клиентом — <b>«☎️ Связались»</b>.',
    '4. Когда работа по лиду завершена — <b>«✅ Закрыть»</b>.',
    '5. Отчёты открываются кнопками в закреплённой CRM-сводке.',
    '',
    '<i>Команды /report остаются как резервный способ.</i>'
  ].join('\n');
}

async function telegramJson(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  return { response, data, ok: response.ok && Boolean(data.ok) };
}

async function ensureWebhook(token) {
  const result = await telegramJson(token, 'setWebhook', {
    url: WEBHOOK_URL,
    allowed_updates: ['callback_query', 'message']
  });
  if (!result.ok) console.error('Telegram webhook error:', result.data);
  return result;
}

async function webhookInfo(token) {
  return telegramJson(token, 'getWebhookInfo', {});
}

async function sendTelegramMessage(token, chatId, text, replyMarkup) {
  return telegramJson(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup
  });
}

async function getPinnedCrm(token) {
  const chat = await telegramJson(token, 'getChat', { chat_id: TELEGRAM_CHAT_ID });
  if (!chat.ok) return { ok: false, error: chat.data?.description || 'Unable to read chat' };
  const pinned = chat.data?.result?.pinned_message;
  const state = pinned ? decodeCrmState(pinned.text || '') : null;
  if (!pinned || !state) return { ok: false, missing: true };
  return {
    ok: true,
    messageId: pinned.message_id,
    state: normalizeCrmState(state)
  };
}

async function pinCrmMessage(token, messageId) {
  const result = await telegramJson(token, 'pinChatMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    message_id: messageId,
    disable_notification: true
  });
  if (!result.ok) console.error('CRM pin error:', result.data);
  return result;
}

async function createCrmDashboard(token) {
  const state = newCrmState();
  const sent = await sendTelegramMessage(token, TELEGRAM_CHAT_ID, renderDashboard(state), crmKeyboard());
  if (!sent.ok) return { ok: false, error: sent.data?.description || 'Unable to create CRM dashboard' };
  const messageId = sent.data?.result?.message_id;
  const pin = await pinCrmMessage(token, messageId);
  if (!pin.ok) {
    await sendTelegramMessage(
      token,
      TELEGRAM_CHAT_ID,
      '⚠️ <b>Нужно один раз закрепить сообщение «ABSERVICE CRM · СВОДКА».</b> Без закрепления бот не сможет сохранять отчётность между заявками.'
    );
  }
  return { ok: true, messageId, state, pinned: pin.ok };
}

async function saveCrmState(token, messageId, state) {
  const edit = await telegramJson(token, 'editMessageText', {
    chat_id: TELEGRAM_CHAT_ID,
    message_id: messageId,
    text: renderDashboard(state),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: crmKeyboard()
  });
  if (!edit.ok) {
    console.error('CRM dashboard edit error:', edit.data);
    return edit;
  }
  await pinCrmMessage(token, messageId);
  return edit;
}

async function recordEventIfCrmActive(token, event) {
  const crm = await getPinnedCrm(token);
  if (!crm.ok) return { ok: false, missing: true };
  const next = recordCrmEvent(crm.state, event);
  const saved = await saveCrmState(token, crm.messageId, next);
  return { ok: saved.ok };
}

async function initializeCrmIfNeeded(token) {
  const existing = await getPinnedCrm(token);
  if (existing.ok) return existing;
  return createCrmDashboard(token);
}

async function sendTelegramAttachment(token, chatId, attachment, caption) {
  const type = String(attachment.type || 'application/octet-stream');
  const isImage = type.startsWith('image/');
  const method = isImage ? 'sendPhoto' : 'sendDocument';
  const field = isImage ? 'photo' : 'document';
  const bytes = Buffer.from(String(attachment.data || ''), 'base64');

  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Attachment is empty or too large' };
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(field, new Blob([bytes], { type }), safeFileName(attachment.name));
  form.append('caption', caption);

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body: form
  });
  const data = await response.json();

  return {
    ok: response.ok && Boolean(data.ok),
    error: data.description || null
  };
}

async function handleCommand(token, message) {
  if (!message || String(message.chat?.id) !== TELEGRAM_CHAT_ID) return { ok: false, ignored: true };
  const text = String(message.text || '').trim();
  if (!text.startsWith('/')) return { ok: true, ignored: true };

  const [rawCommand, rawScope = ''] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const scope = rawScope.toLowerCase();

  if (command === '/crm_init') {
    const crm = await initializeCrmIfNeeded(token);
    if (!crm.ok) return { ok: false, error: crm.error || 'CRM initialization failed' };
    await saveCrmState(token, crm.messageId, crm.state);
    await sendTelegramMessage(
      token,
      TELEGRAM_CHAT_ID,
      crm.pinned === false
        ? '📊 CRM-сводка создана. <b>Закрепите её вручную</b>. Кнопки отчётов уже доступны под сводкой.'
        : '📊 <b>CRM-сводка активирована.</b> Отчёты доступны кнопками под закреплённым сообщением.'
    );
    return { ok: true, command: 'crm_init' };
  }

  if (command === '/report') {
    let crm = await getPinnedCrm(token);
    if (!crm.ok) {
      crm = await createCrmDashboard(token);
      if (!crm.ok) return { ok: false, error: crm.error || 'CRM dashboard unavailable' };
      await sendTelegramMessage(
        token,
        TELEGRAM_CHAT_ID,
        'ℹ️ Учёт отчётности создан сейчас. Статистика начнёт накапливаться с этого момента.'
      );
    } else {
      await saveCrmState(token, crm.messageId, crm.state);
    }
    const reportScope = ['today', 'week', 'month'].includes(scope) ? scope : 'all';
    await sendTelegramMessage(token, TELEGRAM_CHAT_ID, renderReport(crm.state, reportScope));
    return { ok: true, command: 'report', scope: reportScope };
  }

  return { ok: true, ignored: true };
}

async function handleCrmCallback(token, callback, action) {
  const message = callback?.message;
  let state = decodeCrmState(message?.text || '');

  if (!state) {
    const crm = await getPinnedCrm(token);
    if (!crm.ok) return { ok: false, error: 'CRM dashboard unavailable' };
    state = crm.state;
  }

  if (action === 'crm:help') {
    const sent = await sendTelegramMessage(token, TELEGRAM_CHAT_ID, renderCrmHelp());
    return { ok: sent.ok, action: 'help' };
  }

  const scopes = {
    'crm:today': 'today',
    'crm:week': 'week',
    'crm:month': 'month',
    'crm:all': 'all'
  };
  const scope = scopes[action];
  if (!scope) return { ok: false, error: 'Unknown CRM action' };

  const sent = await sendTelegramMessage(token, TELEGRAM_CHAT_ID, renderReport(state, scope));
  return { ok: sent.ok, action: 'report', scope };
}

async function handleCallback(token, callback) {
  const message = callback?.message;
  const callbackId = callback?.id;
  const action = String(callback?.data || '');

  if (!message || !callbackId || String(message.chat?.id) !== TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'Unsupported callback' };
  }

  const verify = await telegramJson(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: action.startsWith('crm:') ? 'Готово' : 'Принято'
  });
  if (!verify.ok) return { ok: false, error: verify.data?.description || 'Invalid callback query' };

  if (action.startsWith('crm:')) {
    return handleCrmCallback(token, callback, action);
  }

  const fullText = String(message.text || '');
  const [baseText, statusText = ''] = fullText.split(STATUS_SEPARATOR);
  const now = formatMoscowTime();
  const owner = extractValue(statusText, 'Ответственный:');
  const takenAt = extractValue(statusText, 'Взята:');
  const contactedAt = extractValue(statusText, 'Связались:');

  let nextStatus;
  let eventType;
  const meta = {
    owner,
    takenAt,
    contactedAt,
    closedAt: extractValue(statusText, 'Закрыта:')
  };

  if (action === 'lead:take') {
    nextStatus = 'in_work';
    eventType = 'take';
    meta.owner = telegramUserName(callback.from);
    meta.takenAt = now;
  } else if (action === 'lead:contacted') {
    nextStatus = 'contacted';
    eventType = 'contacted';
    if (!meta.owner) meta.owner = telegramUserName(callback.from);
    if (!meta.takenAt) meta.takenAt = now;
    meta.contactedAt = now;
  } else if (action === 'lead:closed') {
    nextStatus = 'closed';
    eventType = 'closed';
    if (!meta.owner) meta.owner = telegramUserName(callback.from);
    if (!meta.takenAt) meta.takenAt = now;
    if (!meta.contactedAt) meta.contactedAt = now;
    meta.closedAt = now;
  } else {
    return { ok: false, error: 'Unknown lead action' };
  }

  const updatedHtml = `${formatBaseLeadHtml(baseText.trim())}${STATUS_SEPARATOR}${buildStatusHtml(nextStatus, meta)}`;
  const edit = await telegramJson(token, 'editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text: updatedHtml,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboardFor(nextStatus)
  });

  if (!edit.ok) {
    console.error('Telegram edit status error:', edit.data);
    return { ok: false, error: edit.data?.description || 'Unable to update lead status' };
  }

  const event = { type: eventType, manager: meta.owner };
  if (eventType === 'contacted') {
    const createdAt = parseLeadCreatedAt(baseText);
    if (createdAt) event.responseMinutes = Math.max(0, (Date.now() - createdAt.getTime()) / 60000);
  }
  await recordEventIfCrmActive(token, event);

  return { ok: true, status: nextStatus };
}

export async function GET(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let workflowConfigured = false;
  let webhookError = null;
  let crmConfigured = false;

  if (token) {
    const setup = await ensureWebhook(token);
    if (setup.ok) {
      const info = await webhookInfo(token);
      workflowConfigured = Boolean(info.ok && info.data?.result?.url === WEBHOOK_URL);
      webhookError = info.data?.result?.last_error_message || null;
    } else {
      webhookError = setup.data?.description || 'Webhook setup failed';
    }
    const crm = await getPinnedCrm(token);
    crmConfigured = crm.ok;
    if (crm.ok) await saveCrmState(token, crm.messageId, crm.state);
  }

  return json(request, {
    ok: true,
    service: 'ABService Telegram lead endpoint',
    configured: Boolean(token),
    chatConfigured: true,
    attachments: true,
    workflow: true,
    reports: true,
    reportButtons: true,
    workflowConfigured,
    crmConfigured,
    webhookError
  });
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

export async function POST(request) {
  const origin = request.headers.get('origin') || '';
  if (origin && origin !== ALLOWED_ORIGIN && !origin.startsWith('http://localhost:')) {
    return json(request, { ok: false, error: 'Origin not allowed' }, 403);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return json(request, { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 503);
  }

  try {
    const body = await request.json();

    if (body?.callback_query) {
      const result = await handleCallback(token, body.callback_query);
      return json(request, result, result.ok ? 200 : 400);
    }

    if (body?.message) {
      const result = await handleCommand(token, body.message);
      return json(request, result, result.ok ? 200 : 400);
    }

    await ensureWebhook(token);

    const phone = normalizePhone(body.phone || '');
    if (phone.replace(/\D/g, '').length < 5) {
      return json(request, { ok: false, error: 'Phone is required' }, 400);
    }

    const kind = body.kind === 'parts' ? 'parts' : 'service';
    const isParts = kind === 'parts';
    const label = isParts ? 'ЗАПЧАСТИ' : 'СЕРВИС';
    const icon = isParts ? '🧩' : '🛠';
    const timestamp = formatMoscowTime();
    const attachments = Array.isArray(body.attachments)
      ? body.attachments.slice(0, MAX_ATTACHMENTS)
      : [];

    const leadLines = [
      `${icon} <b>НОВАЯ ЗАЯВКА · ${label}</b>`,
      `<i>ABService · ${timestamp}</i>`,
      '',
      body.name ? `👤 <b>Клиент:</b> ${escapeHtml(body.name)}` : null,
      `📞 <b>Телефон:</b> ${escapeHtml(phone)}`,
      body.machine ? `🚜 <b>Техника:</b> ${escapeHtml(body.machine)}` : null,
      !isParts && body.location ? `📍 <b>Локация:</b> ${escapeHtml(body.location)}` : null,
      !isParts && body.issue ? `⚠️ <b>Проблема:</b> ${escapeHtml(body.issue)}` : null,
      isParts && body.mode ? `🔧 <b>Формат:</b> ${escapeHtml(body.mode)}` : null,
      isParts && body.article ? `🏷 <b>Артикул:</b> ${escapeHtml(body.article)}` : null,
      isParts && body.part ? `📦 <b>Запчасть:</b> ${escapeHtml(body.part)}` : null,
      attachments.length ? `📷 <b>Вложений:</b> ${attachments.length}` : null,
      '',
      `🌐 <b>Источник:</b> ${escapeHtml(isParts ? 'ABService · Запчасти' : 'ABService · Сервис')}`
    ].filter(line => line !== null && line !== undefined);

    const leadText = `${leadLines.join('\n')}${STATUS_SEPARATOR}${buildStatusHtml('new')}`;

    const telegram = await sendTelegramMessage(
      token,
      TELEGRAM_CHAT_ID,
      leadText,
      keyboardFor('new')
    );

    if (!telegram.ok) {
      console.error('Telegram error:', telegram.data);
      return json(request, {
        ok: false,
        error: telegram.data?.description || 'Telegram request failed'
      }, 502);
    }

    const crm = await initializeCrmIfNeeded(token);
    if (crm.ok) {
      const nextState = recordCrmEvent(crm.state, { type: 'new', kind });
      await saveCrmState(token, crm.messageId, nextState);
    }

    let attachmentsSent = 0;
    const attachmentErrors = [];

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const result = await sendTelegramAttachment(
        token,
        TELEGRAM_CHAT_ID,
        attachment,
        `📎 ${label} · вложение ${index + 1}/${attachments.length} · ${phone}`
      );

      if (result.ok) {
        attachmentsSent += 1;
      } else {
        attachmentErrors.push(result.error || `Вложение ${index + 1} не отправлено`);
        console.error('Telegram attachment error:', result.error);
      }
    }

    return json(request, {
      ok: true,
      workflow: true,
      reports: true,
      reportButtons: true,
      crmTracked: Boolean(crm.ok),
      attachmentsRequested: attachments.length,
      attachmentsSent,
      attachmentErrors
    });
  } catch (error) {
    console.error('Lead endpoint error:', error);
    return json(request, { ok: false, error: 'Unable to send lead' }, 500);
  }
}
