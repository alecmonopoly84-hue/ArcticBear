const ALLOWED_ORIGIN = 'https://alecmonopoly84-hue.github.io';
const TELEGRAM_CHAT_ID = '-5375867845';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function telegramJson(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data;
}

async function telegramFile(token, attachment, caption) {
  const buffer = Buffer.from(attachment.data || '', 'base64');
  if (!buffer.length || buffer.length > 3_000_000) return;

  const type = attachment.type || 'application/octet-stream';
  const isImage = type.startsWith('image/');
  const form = new FormData();
  form.append('chat_id', TELEGRAM_CHAT_ID);
  form.append('caption', caption.slice(0, 900));
  form.append(isImage ? 'photo' : 'document', new Blob([buffer], { type }), attachment.name || 'attachment');

  const response = await fetch(`https://api.telegram.org/bot${token}/${isImage ? 'sendPhoto' : 'sendDocument'}`, {
    method: 'POST',
    body: form
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram file upload failed');
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost:')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (origin && origin !== ALLOWED_ORIGIN && !origin.startsWith('http://localhost:')) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not configured');
    return res.status(503).json({ ok: false, error: 'Integration is not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const phone = String(body.phone || '').trim();
    if (phone.length < 5) return res.status(400).json({ ok: false, error: 'Phone is required' });

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

    await telegramJson(token, 'sendMessage', {
      chat_id: TELEGRAM_CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 3) : [];
    for (const attachment of attachments) {
      await telegramFile(token, attachment, kind === 'parts' ? 'Фото к заявке на запчасть' : 'Фото/файл к сервисной заявке');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Unable to send lead' });
  }
};
