const GOOGLE_SHEET_WEB_APP_URL_KEY = 'googleSheetWebAppUrl';

function getWebhookStatusText(status) {
  const texts = {
    pending: 'Chờ gửi',
    sending: 'Chờ gửi',
    wait_reply: 'Đang theo dõi',
    done: 'Hoàn tất',
    error: 'Lỗi'
  };
  return texts[status] || String(status || 'Chờ gửi');
}

function padWebhookDatePart(value) {
  return String(value).padStart(2, '0');
}

function formatWebhookDate(value) {
  const time = typeof value === 'number' ? value : parseSendAt(value);
  if (!time) return '';
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return '';
  return [
    date.getFullYear(),
    padWebhookDatePart(date.getMonth() + 1),
    padWebhookDatePart(date.getDate())
  ].join('-') + ' ' + [
    padWebhookDatePart(date.getHours()),
    padWebhookDatePart(date.getMinutes())
  ].join(':');
}

function buildGoogleSheetPayload(row) {
  const values = row?.values || {};
  return {
    status: getWebhookStatusText(row?.status || 'pending'),
    name: stripZaloTags(values.name || values.display_name || ''),
    tag: values.tag || '',
    phone: values.phone || values.sys_phone || '',
    media_id: values.media_id || '',
    message: values.message || '',
    replies: Array.isArray(row?.replies) ? row.replies.join('\n') : (values.replies || ''),
    send_at: formatWebhookDate(values.send_at),
    wait_reply: String(values.wait_reply || '').trim().toLowerCase() === 'x',
    error: row?.error || '',
    zid: values.zid || '',
    updatedAt: formatWebhookDate(row?.updatedAt || Date.now())
  };
}

async function postGoogleSheetPayload(payload) {
  const data = await storageGet([GOOGLE_SHEET_WEB_APP_URL_KEY]);
  const url = String(data[GOOGLE_SHEET_WEB_APP_URL_KEY] || '').trim();
  if (!url) return { ok: true, skipped: true };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    throw new Error(`Webhook lỗi kết nối: ${err?.message || err}`);
  }

  if (!response.ok) {
    throw new Error(`Webhook HTTP ${response.status}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (_err) {
    throw new Error('Webhook phản hồi không phải JSON.');
  }

  if (json?.status !== 'success') {
    throw new Error(json?.message || 'Webhook phản hồi sai định dạng.');
  }

  return { ok: true, response: json };
}

async function notifyGoogleSheetRow(row) {
  if (!row?.id) return { ok: false, error: 'Thiếu row.' };
  try {
    const payload = buildGoogleSheetPayload(row);
    const result = await postGoogleSheetPayload(payload);
    if (isWebhookErrorMessage(row.error)) {
      await updateQueueRow(row.id, { error: '' });
    }
    return result;
  } catch (err) {
    const rawMessage = err?.message || String(err);
    const message = isWebhookErrorMessage(rawMessage) ? rawMessage : `Webhook ${rawMessage}`;
    await updateQueueRow(row.id, { error: message });
    return { ok: false, error: message };
  }
}

function isWebhookErrorMessage(message) {
  return /^Webhook\b/i.test(String(message || '').trim());
}
