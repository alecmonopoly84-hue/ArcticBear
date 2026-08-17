const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-5375867845';

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

export function GET(request) {
  return json(request, {
    ok: true,
    service: 'ABService Telegram lead endpoint',
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
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
    const phone = String(body.phone || '').trim();
    if (phone.length < 5) {
      return json(request, { ok: false, error: 'Phone is required' }, 400);
    }

    const kind = body.kind === 'parts' ? 'parts' : 'service';
    const title = kind === 'parts' ? '🧩 Новая заявка на запчасть' : '🛠 Новая заявка на сервис';

    const lines = [
      `<b>${title}</b>`,
      '',
      body.name ? `<b>Имя:</b> ${escapeHtml(body.name)}` : null,
      `<b>Телефон:</b> ${escapeHtml(phone)}`,
      body.machine ? `<b>Техника:</b> ${escapeHtml(body.machine)}` : null,
      kind === 'service' && body.location ? `<b>Где техника:</b> ${escapeHtml(body.location)}` : null,
      kind === 'service' && body.issue ? `<b>Проблема:</b> ${escapeHtml(body.issue)}` : null,
      kind === 'parts' && body.mode ? `<b>Тип:</b> ${escapeHtml(body.mode)}` : null,
      kind === 'parts' && body.article ? `<b>Артикул:</b> ${escapeHtml(body.article)}` : null,
      kind === 'parts' && body.part ? `<b>Запчасть:</b> ${escapeHtml(body.part)}` : null,
      '',
      `<b>Источник:</b> ${escapeHtml(body.source || 'ABService')}`
    ].filter(Boolean);

    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const telegramData = await telegramResponse.json();
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
