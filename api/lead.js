const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-1004382574358';
const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_BYTES = 1_600_000;

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

export function GET(request) {
  return json(request, {
    ok: true,
    service: 'ABService Telegram lead endpoint',
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    chatConfigured: true,
    attachments: true
  });
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const data = await response.json();
  return { response, data };
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

    const lines = [
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
    ].filter(Boolean);

    const { response: telegramResponse, data: telegramData } = await sendTelegramMessage(
      token,
      TELEGRAM_CHAT_ID,
      lines.join('\n')
    );

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error('Telegram error:', telegramData);
      return json(request, {
        ok: false,
        error: telegramData.description || 'Telegram request failed'
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
      attachmentsRequested: attachments.length,
      attachmentsSent,
      attachmentErrors
    });
  } catch (error) {
    console.error('Lead endpoint error:', error);
    return json(request, { ok: false, error: 'Unable to send lead' }, 500);
  }
}
