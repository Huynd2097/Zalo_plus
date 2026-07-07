const GOOGLE_SHEET_WEB_APP_URL_KEY = 'googleSheetWebAppUrl';
const DELAY_BETWEEN_ACTIONS_KEY = 'delayBetweenActions';
const PAUSE_AFTER_KEY = 'pauseAfter';
const PAUSE_DURATION_KEY = 'pauseDuration';
const MAX_RETRIES_KEY = 'maxRetries';

const samplePayload = {
  status: 'Đang theo dõi',
  name: 'Nguyễn Văn A',
  tag: 'Khách Zoom',
  phone: '0909123456',
  media_id: '',
  message: 'Nội dung tin nhắn...',
  replies: 'Tin 1\nTin 2',
  send_at: '2026-06-08 14:30',
  wait_reply: true,
  error: '',
  zid: '245830163...',
  updatedAt: '2026-06-08 14:35',
  note: 'Nhắc hẹn'
};

const payloadPreviewText = `{
  status: 'Đang theo dõi', // trạng thái hiển thị trên bảng: Chờ gửi | Đang theo dõi | Hoàn tất | Lỗi
  name: 'Nguyễn Văn A', // tên người nhận trên Zalo
  tag: 'Khách Zoom', // phân loại/thẻ gắn trên Zalo
  phone: '0909123456', // số điện thoại (nếu có)
  media_id: '', // ID hoặc link ảnh đính kèm nếu có
  message: 'Nội dung tin nhắn...', // nội dung tin nhắn gửi đi
  replies: 'Tin 1\\nTin 2', // tất cả tin nhắn phản hồi của người nhận
  send_at: '2026-06-08 14:30', // thời gian gửi / hẹn gửi / nhắc hẹn
  wait_reply: true, // true/false - có chờ phản hồi hay không
  error: '', // lỗi hệ thống nếu có
  zid: '245830163...', // Zalo ID (để nội bộ theo dõi)
  updatedAt: '2026-06-08 14:35', // thời điểm cập nhật lần cuối
  note: 'Nhắc hẹn' // ghi chú thêm (VD: reminder, nhắc hẹn...)
}`;

const responsePreviewText = `{
  status: 'success', // success = thành công, error = lỗi
  message: 'Đã ghi log' // mô tả kết quả/lỗi
}`;

const scriptRequirements = [
  "Cột phone/SĐT phải giữ nguyên dạng text, không mất hoặc tự thêm số 0 ở đầu.",
  "Dùng phone làm mốc tìm dòng; nếu phone đã tồn tại thì ghi đè các cột khác trên dòng đó."
];

function setTestResponse(text) {
  const el = document.getElementById('testResponseBox');
  if (el) el.value = text;
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('testResult');
  if (!el) return;
  el.textContent = text;
  el.className = 'mt-3 text-sm font-semibold rounded-md border px-3 py-2';
  if (type === 'success') {
    el.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-700');
  } else if (type === 'error') {
    el.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-700');
  } else {
    el.classList.add('bg-slate-50', 'border-slate-200', 'text-slate-600');
  }
}

function setSaveStatus(text) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = text;
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 1600);
  }
}

async function saveUrl(value) {
  await chrome.storage.local.set({ [GOOGLE_SHEET_WEB_APP_URL_KEY]: value.trim() });
  setSaveStatus('Đã tự lưu');
}

async function saveSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
  setSaveStatus('Đã tự lưu');
}

async function sendTestPayload() {
  const input = document.getElementById('googleSheetUrlInput');
  const url = String(input?.value || '').trim();
  if (!url) {
    setTestResponse('ERROR: Vui lòng nhập Google Apps Script Web App URL.');
    setStatus('Vui lòng nhập Google Apps Script Web App URL.', 'error');
    return;
  }

  await saveUrl(url);
  setTestResponse('');
  setStatus('Đang gửi test...', 'info');

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(samplePayload)
    });
  } catch (err) {
    const message = `Send test lỗi kết nối: ${err?.message || err}`;
    setTestResponse(`ERROR: ${message}`);
    setStatus(message, 'error');
    return;
  }

  const rawText = await response.text();
  setTestResponse(rawText || `(HTTP ${response.status}, response trống)`);

  if (!response.ok) {
    setStatus(`Send test lỗi HTTP ${response.status}.`, 'error');
    return;
  }

  let json;
  try {
    json = JSON.parse(rawText);
  } catch (_err) {
    setStatus('Send test lỗi: response không phải JSON.', 'error');
    return;
  }

  if (json?.status !== 'success') {
    setStatus(json?.message || 'Send test lỗi: response sai định dạng.', 'error');
    return;
  }

  setStatus(json?.message || 'Send test thành công.', 'success');
}

async function copyPayload() {
  await navigator.clipboard.writeText([
    `EXT GỬI ĐI\n${payloadPreviewText}`,
    `EXT NHẬN VỀ\n${responsePreviewText}`,
    `YÊU CẦU CHO APPS SCRIPT\n${scriptRequirements.map((item) => `- ${item}`).join('\n')}`
  ].join('\n\n'));
  setStatus('Đã copy mẫu gửi đi và nhận về.', 'success');
}

window.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('googleSheetUrlInput');
  const preview = document.getElementById('payloadPreview');
  const responsePreview = document.getElementById('responsePreview');
  const requirementsEl = document.getElementById('scriptRequirements');
  const data = await chrome.storage.local.get([GOOGLE_SHEET_WEB_APP_URL_KEY]);
  let saveTimer = null;

  if (preview) preview.textContent = payloadPreviewText;
  if (responsePreview) responsePreview.textContent = responsePreviewText;
  if (requirementsEl) {
    requirementsEl.innerHTML = scriptRequirements.map((item) => `<li>${item}</li>`).join('');
  }
  if (input) {
    input.value = data[GOOGLE_SHEET_WEB_APP_URL_KEY] || '';
    input.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveUrl(input.value), 400);
    });
    input.addEventListener('change', () => saveUrl(input.value));
    input.addEventListener('blur', () => saveUrl(input.value));
  }

  const delayInput = document.getElementById('delayBetweenActionsInput');
  const pauseAfterInput = document.getElementById('pauseAfterInput');
  const pauseDurationInput = document.getElementById('pauseDurationInput');
  const maxRetriesInput = document.getElementById('maxRetriesInput');
  
  const settingsData = await chrome.storage.local.get([
    DELAY_BETWEEN_ACTIONS_KEY,
    PAUSE_AFTER_KEY,
    PAUSE_DURATION_KEY,
    MAX_RETRIES_KEY
  ]);

  if (delayInput) {
    delayInput.value = settingsData[DELAY_BETWEEN_ACTIONS_KEY] ?? 10;
    delayInput.addEventListener('change', () => saveSetting(DELAY_BETWEEN_ACTIONS_KEY, Number(delayInput.value)));
  }
  if (pauseAfterInput) {
    pauseAfterInput.value = settingsData[PAUSE_AFTER_KEY] ?? 15;
    pauseAfterInput.addEventListener('change', () => saveSetting(PAUSE_AFTER_KEY, Number(pauseAfterInput.value)));
  }
  if (pauseDurationInput) {
    pauseDurationInput.value = settingsData[PAUSE_DURATION_KEY] ?? 30;
    pauseDurationInput.addEventListener('change', () => saveSetting(PAUSE_DURATION_KEY, Number(pauseDurationInput.value)));
  }
  if (maxRetriesInput) {
    maxRetriesInput.value = settingsData[MAX_RETRIES_KEY] ?? 2;
    maxRetriesInput.addEventListener('change', () => saveSetting(MAX_RETRIES_KEY, Number(maxRetriesInput.value)));
  }

  document.getElementById('sendTestBtn')?.addEventListener('click', sendTestPayload);
  document.getElementById('copyPayloadBtn')?.addEventListener('click', copyPayload);
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());

  if (window.lucide) window.lucide.createIcons();
});
