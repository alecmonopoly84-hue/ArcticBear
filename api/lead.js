const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-1004382574358';
const WEBHOOK_URL = 'https://abservice-leads-v2.vercel.app/api/lead';
const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 1_600_000;
const STATUS_SEPARATOR = '\n\n────────\n';

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
  return `${name || 'Сотрудник'}${username}`;
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
    allowed_updates: ['callback_query']
  });
  if (!result.ok) console.error('Telegram webhook error:', result.data);
  return result;
}

async function webhookInfo(token) {
  return telegramJson(token, 'getWebhookInfo', {});
}

export async function GET(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let workflowConfigured = false;
  let webhookError = null;

  if (token) {
    const setup = await ensureWebhook(token);
    if (setup.ok) {
      const info = await webhookInfo(token);
      workflowConfigured = Boolean(info.ok && info.data?.result?.url === WEBHOOK_URL);
      webhookError = info.data?.result?.last_error_message || null;
    } else {
      webhookError = setup.data?.description || 'Webhook setup failed';
    }
  }

  return json(request, {
    ok: true,
    service: 'ABService Telegram lead endpoint',
    configured: Boolean(token),
    chatConfigured: true,
    attachments: true,
    workflow: true,
    workflowConfigured,
    webhookError
  });
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request)
  });
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

async function handleCallback(token, callback) {
  const message = callback?.message;
  const callbackId = callback?.id;
  const action = String(callback?.data || '');

  if (!message || !callbackId || String(message.chat?.id) !== TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'Unsupported callback' };
  }

  const verify = await telegramJson(token, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: 'Принято'
  });
  if (!verify.ok) return { ok: false, error: verify.data?.description || 'Invalid callback query' };

  const fullText = String(message.text || '');
  const [baseText, statusText = ''] = fullText.split(STATUS_SEPARATOR);
  const now = formatMoscowTime();
  const owner = extractValue(statusText, 'Ответственный:');
  const takenAt = extractValue(statusText, 'Взята:');
  const contactedAt = extractValue(statusText, 'Связались:');

  let nextStatus;
  const meta = {
    owner,
    takenAt,
    contactedAt,
    closedAt: extractValue(statusText, 'Закрыта:')
  };

  if (action === 'lead:take') {
    nextStatus = 'in_work';
    meta.owner = telegramUserName(callback.from);
    meta.takenAt = now;
  } else if (action === 'lead:contacted') {
    nextStatus = 'contacted';
    if (!meta.owner) meta.owner = telegramUserName(callback.from);
    if (!meta.takenAt) meta.takenAt = now;
    meta.contactedAt = now;
  } else if (action === 'lead:closed') {
    nextStatus = 'closed';
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

  return { ok: true, status: nextStatus };
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
      attachmentsRequested: attachments.length,
      attachmentsSent,
      attachmentErrors
    });
  } catch (error) {
    console.error('Lead endpoint error:', error);
    return json(request, { ok: false, error: 'Unable to send lead' }, 500);
  }
}
