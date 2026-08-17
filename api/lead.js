const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-1004382574358';

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

export function GET(request) {
  return json(request, {
    ok: true,
    service: 'ABService Telegram lead endpoint',
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    chatConfigured: true
  });
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

async function sendTelegram(token, chatId, text) {
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
      '',
      `🌐 <b>Источник:</b> ${escapeHtml(isParts ? 'ABService · Запчасти' : 'ABService · Сервис')}`
    ].filter(Boolean);

    const { response: telegramResponse, data: telegramData } = await sendTelegram(token, TELEGRAM_CHAT_ID, lines.join('\n'));

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error('Telegram error:', telegramData);
      return json(request, {
        ok: false,
        error: telegramData.description || 'Telegram request failed'
      }, 502);
    }

    return json(request, { ok: true });
  } catch (error) {
    console.error('Lead endpoint error:', error);
    return json(request, { ok: false, error: 'Unable to send lead' }, 500);
  }
}
