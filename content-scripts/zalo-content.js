const OVERLAY_ID = 'zz-countdown-overlay';
const OVERLAY_STORAGE_KEY = 'overlayPosition';
let overlayTimer = null;
let batchOverlayCountdownTimer = null;
let dragState = null;
let extensionContextValid = true;
let activeChatObserver = null;

function isExtensionContextValid() {
  if (!extensionContextValid) return false;
  try {
    return Boolean(chrome?.runtime?.id);
  } catch (_err) {
    extensionContextValid = false;
    return false;
  }
}

function stopExtensionContextWork() {
  extensionContextValid = false;
  if (activeChatNotifyTimer) {
    clearTimeout(activeChatNotifyTimer);
    activeChatNotifyTimer = null;
  }
  if (overlayTimer) {
    clearInterval(overlayTimer);
    overlayTimer = null;
  }
  if (batchOverlayCountdownTimer) {
    clearInterval(batchOverlayCountdownTimer);
    batchOverlayCountdownTimer = null;
  }
  activeChatObserver?.disconnect();
  activeChatObserver = null;
}

function sendRuntimeMessage(message, callback) {
  if (!isExtensionContextValid()) {
    stopExtensionContextWork();
    callback?.({ ok: false, error: 'Extension đã cập nhật bản mới. Vui lòng F5 (tải lại trang) để tiếp tục.' });
    return;
  }
  try {
    chrome.runtime.sendMessage(message, (resp) => {
      const error = chrome.runtime.lastError;
      if (error) {
        if (error.message?.includes('Extension context invalidated')) stopExtensionContextWork();
        const errMsg = error.message?.includes('Extension context invalidated') ? 'Extension đã cập nhật bản mới. Vui lòng F5 (tải lại trang) để tiếp tục.' : error.message;
        callback?.({ ok: false, error: errMsg });
        return;
      }
      callback?.(resp);
    });
  } catch (err) {
    if (err?.message?.includes('Extension context invalidated')) stopExtensionContextWork();
    const errMsg = err?.message?.includes('Extension context invalidated') ? 'Extension đã cập nhật bản mới. Vui lòng F5 (tải lại trang) để tiếp tục.' : (err?.message || 'Không gửi được request.');
    callback?.({ ok: false, error: errMsg });
  }
}

function getDefaultPosition() {
  return { top: 70, right: 14, left: null };
}

function applyOverlayPosition(box, pos) {
  const p = pos || getDefaultPosition();
  box.style.top = `${Math.max(8, p.top ?? 70)}px`;

  if (typeof p.left === 'number') {
    box.style.left = `${Math.max(8, p.left)}px`;
    box.style.right = 'auto';
  } else {
    box.style.right = `${Math.max(8, p.right ?? 14)}px`;
    box.style.left = 'auto';
  }
}

function saveOverlayPosition(box) {
  const left = parseInt(box.style.left || '', 10);
  const right = parseInt(box.style.right || '', 10);
  const top = parseInt(box.style.top || '70', 10);
  chrome.storage.local.set({
    [OVERLAY_STORAGE_KEY]: {
      top,
      left: Number.isNaN(left) ? null : left,
      right: Number.isNaN(right) ? 14 : right
    }
  });
}

function makeOverlayDraggable(box, handle) {
  if (box.dataset.dragReady === '1') return;
  box.dataset.dragReady = '1';

  const onMove = (ev) => {
    if (!dragState) return;
    const x = ev.clientX - dragState.offsetX;
    const y = ev.clientY - dragState.offsetY;
    box.style.left = `${Math.max(8, x)}px`;
    box.style.top = `${Math.max(8, y)}px`;
    box.style.right = 'auto';
  };

  const onUp = () => {
    if (!dragState) return;
    dragState = null;
    saveOverlayPosition(box);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  handle.addEventListener('mousedown', (ev) => {
    const rect = box.getBoundingClientRect();
    dragState = {
      offsetX: ev.clientX - rect.left,
      offsetY: ev.clientY - rect.top
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function ensureOverlay() {
  let box = document.getElementById(OVERLAY_ID);
  if (box) return box;

  box = document.createElement('div');
  box.id = OVERLAY_ID;
  box.style.position = 'fixed';
  box.style.zIndex = '2147483647';
  box.style.width = '156px';
  box.style.padding = '7px 8px 7px';
  box.style.background = 'linear-gradient(180deg, rgba(18,24,36,0.25) 0%, rgba(28,36,52,0.25) 100%)';
  box.style.backdropFilter = 'blur(2px)';
  box.style.WebkitBackdropFilter = 'blur(2px)';
  box.style.color = '#e5edf7';
  box.style.border = '1px solid rgba(139, 164, 202, 0.28)';
  box.style.borderRadius = '10px';
  box.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)';
  box.style.fontSize = '11px';
  box.style.fontFamily = 'Segoe UI, Tahoma, Arial, sans-serif';
  box.style.display = 'none';
  box.style.userSelect = 'none';

  box.innerHTML = '<div id="zz-overlay-title" style="font-weight:700;cursor:move;margin-bottom:4px;color:#c7dcff;">Hẹn giờ tự động</div><div id="zz-overlay-time" style="font-size:14px;font-weight:800;color:#ffffff;">--:--</div><div id="zz-overlay-sub" style="margin-top:3px;color:#a8b7cc;">Zoom -> Zalo</div>';

  document.documentElement.appendChild(box);

  chrome.storage.local.get([OVERLAY_STORAGE_KEY], (data) => {
    applyOverlayPosition(box, data[OVERLAY_STORAGE_KEY] || getDefaultPosition());
  });

  const handle = box.querySelector('#zz-overlay-title');
  makeOverlayDraggable(box, handle);
  return box;
}

function formatRemain(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stopOverlayCountdown() {
  if (overlayTimer) {
    clearInterval(overlayTimer);
    overlayTimer = null;
  }
  const box = ensureOverlay();
  box.style.display = 'none';
}

function startOverlayCountdown(runAt) {
  stopOverlayCountdown();
  const box = ensureOverlay();
  const timeEl = box.querySelector('#zz-overlay-time');
  const subEl = box.querySelector('#zz-overlay-sub');
  box.style.display = 'block';

  const tick = () => {
    const remain = runAt - Date.now();
    if (remain <= 0) {
      timeEl.textContent = '00:00';
      subEl.textContent = 'Đang thực thi...';
      setTimeout(() => {
        box.style.display = 'none';
      }, 3000);
      if (overlayTimer) {
        clearInterval(overlayTimer);
        overlayTimer = null;
      }
      return;
    }
    timeEl.textContent = formatRemain(remain);
    subEl.textContent = 'Zoom -> Zalo';
  };

  tick();
  overlayTimer = setInterval(tick, 500);
}

function syncOverlayFromStorage() {
  chrome.storage.local.get(['schedule'], (data) => {
    const schedule = data.schedule || { isScheduled: false, runAt: 0 };
    if (schedule.isScheduled && schedule.runAt > Date.now()) {
      startOverlayCountdown(schedule.runAt);
    } else {
      stopOverlayCountdown();
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.schedule) {
    const next = changes.schedule.newValue || { isScheduled: false, runAt: 0 };
    if (next.isScheduled && next.runAt > Date.now()) {
      startOverlayCountdown(next.runAt);
    } else {
      stopOverlayCountdown();
    }
  }

  if (changes[OVERLAY_STORAGE_KEY]) {
    const box = ensureOverlay();
    applyOverlayPosition(box, changes[OVERLAY_STORAGE_KEY].newValue || getDefaultPosition());
  }
});

syncOverlayFromStorage();

/**
 * Giải mã chuỗi Base64 thành đối tượng Blob nhị phân thủ công.
 * Không sử dụng fetch(base64) để tránh vi phạm chính sách CSP (connect-src) của Zalo Web.
 * 
 * @param {string} base64Data - Chuỗi base64 của hình ảnh (chấp nhận cả chuỗi có hoặc không có tiền tố data:image/png;base64)
 * @param {string} contentType - Định dạng MIME của hình ảnh (mặc định là 'image/png')
 * @returns {Blob} Đối tượng Blob chứa dữ liệu nhị phân của ảnh
 */
function base64ToBlob(base64Data, contentType = 'image/png') {
  const parts = base64Data.split(';base64,');
  const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
  const byteCharacters = atob(rawBase64);
  const byteArrays = [];
  const sliceSize = 512;

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
}

/**
 * Thực hiện dán (paste) hình ảnh từ chuỗi Base64 vào ô soạn thảo Zalo đang được focus
 * mà không đụng chạm tới clipboard của hệ điều hành Windows.
 * 
 * @param {string} base64Data - Chuỗi base64 của hình ảnh cần dán
 * @returns {boolean} Trả về true nếu dán thành công, ngược lại quăng lỗi
 */
function pasteBase64ImageToActiveInput(base64Data) {
  const blob = base64ToBlob(base64Data, 'image/png');
  const file = new File([blob], 'auto_pasted_image.png', { type: 'image/png' });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const targetInput = document.activeElement;
  if (!targetInput || targetInput === document.body) {
    throw new Error('Chưa focus vào ô nhập tin nhắn Zalo.');
  }

  targetInput.focus();
  const pasteEvent = new ClipboardEvent('paste', {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true
  });
  targetInput.dispatchEvent(pasteEvent);
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ZALO_SEND') {
    let attempts = 0;
    const maxAttempts = 20;
    const intervalId = setInterval(() => { 
      attempts += 1;
      const sendBtn = document.querySelector('.send-msg-btn');
      if (sendBtn) {
        sendBtn.click();
        clearInterval(intervalId);
        sendResponse({ ok: true });
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        sendResponse({ ok: false, error: 'Khong tim thay nut Send cua Zalo.' });
      }
    }, 150);
    return true;
  }

  if (message?.type === 'ZALO_PASTE_IMAGE') {
    try {
      pasteBase64ImageToActiveInput(message.base64Data);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
    return true;
  }
});

const BATCH_OVERLAY_ID = 'zz-batch-overlay';
const BATCH_OVERLAY_STORAGE_KEY = 'batchOverlayPosition';
let lastActiveChatKey = '';
let activeChatNotifyTimer = null;
let latestWorkerState = null;
let latestQueue = null;

function ensureBatchOverlay() {
  let box = document.getElementById(BATCH_OVERLAY_ID);
  if (box) return box;

  box = document.createElement('div');
  box.id = BATCH_OVERLAY_ID;
  box.style.position = 'fixed';
  box.style.zIndex = '2147483647';
  box.style.width = '170px';
  box.style.padding = '8px 10px';
  box.style.background = 'linear-gradient(180deg, rgba(20,83,45,0.25) 0%, rgba(22,101,52,0.25) 100%)';
  box.style.backdropFilter = 'blur(2px)';
  box.style.WebkitBackdropFilter = 'blur(2px)';
  box.style.color = '#fff';
  box.style.border = '1px solid rgba(134, 239, 172, 0.4)';
  box.style.borderRadius = '10px';
  box.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)';
  box.style.fontSize = '12px';
  box.style.fontFamily = 'Segoe UI, Tahoma, Arial, sans-serif';
  box.style.display = 'none';
  box.style.userSelect = 'none';

  box.innerHTML = `
    <div id="zz-batch-title" style="font-weight:700;cursor:move;margin-bottom:6px;color:#dcfce7;display:flex;justify-content:space-between;align-items:center;">
      <span>Gửi tin nhắn</span>
      <span id="zz-batch-close" style="cursor:pointer;font-size:14px;padding:0 4px;" title="Tắt popup này">&times;</span>
    </div>
    <div id="zz-batch-status" style="font-size:12px;font-weight:600;margin-bottom:4px;color:#fff;">Đang chờ...</div>
    <div id="zz-batch-countdown" style="font-size:12px;font-weight:600;margin-bottom:8px;color:#fde047;display:none;"></div>
    <button id="zz-batch-skip-btn" style="width:100%;padding:6px;border:none;border-radius:6px;background:#eab308;color:#fff;font-weight:bold;cursor:pointer;font-size:11px;">Bỏ qua người này</button>
  `;

  document.documentElement.appendChild(box);

  chrome.storage.local.get([BATCH_OVERLAY_STORAGE_KEY], (data) => {
    applyOverlayPosition(box, data[BATCH_OVERLAY_STORAGE_KEY] || { top: 120, right: 14, left: null });
  });

  const handle = box.querySelector('#zz-batch-title');
  const onMove = (ev) => {
    if (!dragState) return;
    const x = ev.clientX - dragState.offsetX;
    const y = ev.clientY - dragState.offsetY;
    box.style.left = `${Math.max(8, x)}px`;
    box.style.top = `${Math.max(8, y)}px`;
    box.style.right = 'auto';
  };
  const onUp = () => {
    if (!dragState) return;
    dragState = null;
    const left = parseInt(box.style.left || '', 10);
    const right = parseInt(box.style.right || '', 10);
    const top = parseInt(box.style.top || '120', 10);
    chrome.storage.local.set({
      [BATCH_OVERLAY_STORAGE_KEY]: { top, left: Number.isNaN(left) ? null : left, right: Number.isNaN(right) ? 14 : right }
    });
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  handle.addEventListener('mousedown', (ev) => {
    if (ev.target.id === 'zz-batch-close') return;
    const rect = box.getBoundingClientRect();
    dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  box.querySelector('#zz-batch-close').addEventListener('click', () => {
    box.style.display = 'none';
  });

  box.querySelector('#zz-batch-skip-btn').addEventListener('click', () => {
    const btn = box.querySelector('#zz-batch-skip-btn');
    const oldText = btn.textContent;
    btn.textContent = 'Đang bỏ qua...';
    btn.disabled = true;
    const rowId = box.dataset.rowId;
    sendRuntimeMessage({
      type: 'SKIP_ROW',
      rowId: rowId
    }, (resp) => {
      btn.textContent = oldText;
      btn.disabled = false;
      if (resp?.ok) {
        box.style.display = 'none';
        const st = box.querySelector('#zz-batch-status');
        const oldSt = st.textContent;
        st.textContent = 'Đã bỏ qua dòng này';
        setTimeout(() => { st.textContent = oldSt; }, 2000);
      } else {
        alert('Lỗi: ' + (resp?.error || 'Không bỏ qua được dòng này.'));
      }
    });
  });

  return box;
}

function syncBatchOverlayFromStorage() {
  chrome.storage.local.get(['workerState', 'messageQueue'], (data) => {
    latestWorkerState = data.workerState || null;
    latestQueue = data.messageQueue || null;
    updateBatchOverlay();
  });
}

function readActiveChatSnapshot() {
  const normalize = (text) => (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const stripTags = (text) => normalize(text).replace(/\s+Công việc(?:\s.*)?$/i, '').trim();
  const activeItems = [...document.querySelectorAll('.msg-item[anim-data-id]')].filter((el) => {
    const cls = String((el.className || '') + ' ' + (el.querySelector('.selected, .active, .focus')?.className || '')).toLowerCase();
    return cls.includes('active') || cls.includes('selected') || cls.includes('focus');
  });
  const active = activeItems.find((el) => el.getAttribute('anim-data-id')) || null;
  const zid = active?.getAttribute('anim-data-id') || '';
  const activeName = stripTags(active?.querySelector?.('.conv-item-title__name')?.innerText || '');
  const headerName = stripTags(document.querySelector('#header .header-title, #header .threadChat__title')?.innerText || '');
  const tagText = normalize((active?.innerText || active?.textContent || '') + ' ' + (document.querySelector('#header')?.innerText || ''));
  const tag = /\bCông việc\b/i.test(tagText) ? 'Công việc' : '';
  return { zid, display_name: activeName || headerName, tag };
}

function notifyActiveChatChangedSoon() {
  if (!isExtensionContextValid()) {
    stopExtensionContextWork();
    return;
  }
  if (activeChatNotifyTimer) clearTimeout(activeChatNotifyTimer);
  activeChatNotifyTimer = setTimeout(() => {
    if (!isExtensionContextValid()) {
      stopExtensionContextWork();
      return;
    }
    const current = readActiveChatSnapshot();
    const key = `${current.zid}|${current.display_name}|${current.tag}`;
    if (!current.zid && !current.display_name) return;
    if (key === lastActiveChatKey) return;
    lastActiveChatKey = key;
    sendRuntimeMessage({ type: 'ZALO_ACTIVE_CHAT_CHANGED', current });
    updateBatchOverlay();
  }, 120);
}

function parseSendAt(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 100000) {
      const days = Math.floor(value);
      const timeMs = Math.round((value - days) * 24 * 60 * 60 * 1000);
      return new Date(1899, 11, 30 + days).getTime() + timeMs;
    }
    return value > 100000000000 ? value : 0;
  }
  const text = String(value || '').trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return parseSendAt(Number(text));
  }
  const normalized = text.includes('T') ? text : text.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})(?::\d{2})?$/, '$1T$2');
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : 0;
}

function matchesCurrentRow(row, current) {
  const normalize = (text) => (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const zid = String(row?.values?.zid || '').trim();
  const name = normalize(row?.values?.display_name || row?.values?.name || '');
  const currentName = normalize(current.display_name || '');
  return (zid && zid === current.zid) || (name && currentName && (currentName.includes(name) || name.includes(currentName)));
}

function findUpcomingSendRow(queue, current) {
  if (!queue?.byId || !current) return null;
  const now = Date.now();
  const maxAt = now + 60 * 60 * 1000;
  return Object.values(queue.byId).find((row) => {
    if (row.status !== 'pending' || row.error) return false;
    if (!matchesCurrentRow(row, current)) return false;
    const sendAt = parseSendAt(row.values?.send_at);
    // Bỏ điều kiện sendAt > now để khi quá giờ (sendAt <= now) mà chưa gửi thì vẫn hiện popup
    return sendAt && sendAt <= maxAt;
  }) || null;
}

function findCurrentWaitReplyRow(queue, current) {
  if (!queue?.byId || !current) return null;
  return Object.values(queue.byId).find((row) => {
    if (row.status !== 'wait_reply' || (row.error && !/^Webhook\b/i.test(String(row.error).trim()))) return false;
    return matchesCurrentRow(row, current);
  }) || null;
}

function formatRemainingTime(targetMs) {
  const remaining = Math.max(0, targetMs - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

function stopBatchOverlayCountdown() {
  if (batchOverlayCountdownTimer) {
    clearInterval(batchOverlayCountdownTimer);
    batchOverlayCountdownTimer = null;
  }
}

function startBatchOverlayCountdown(box, sendAt) {
  const st = box.querySelector('#zz-batch-status');
  const cd = box.querySelector('#zz-batch-countdown');
  if (cd) cd.style.display = 'block';

  const render = () => {
    if (!st) return;
    const sendDate = new Date(sendAt);
    const pad = (v) => String(v).padStart(2, '0');
    const yyyy = sendDate.getFullYear();
    const mm = pad(sendDate.getMonth() + 1);
    const dd = pad(sendDate.getDate());
    const hh = pad(sendDate.getHours());
    const min = pad(sendDate.getMinutes());
    st.textContent = `Gửi lúc: ${yyyy}-${mm}-${dd} ${hh}:${min}`;
    
    if (sendAt <= Date.now()) {
      if (cd) cd.textContent = 'Đang chờ xử lý gửi...';
      stopBatchOverlayCountdown();
    } else {
      if (cd) cd.textContent = `Còn lại: ${formatRemainingTime(sendAt)}`;
    }
  };

  stopBatchOverlayCountdown();
  render();
  if (sendAt > Date.now()) {
    batchOverlayCountdownTimer = setInterval(render, 1000);
  }
}

function updateBatchOverlay() {
  const state = latestWorkerState;
  const queue = latestQueue;
  const current = readActiveChatSnapshot();
  const currentWaitReply = findCurrentWaitReplyRow(queue, current);
  const upcoming = findUpcomingSendRow(queue, current);
  
  const hasCurrentWait = state?.running && state?.phase === 'polling' && state?.currentWait;

  if (!currentWaitReply && !upcoming && !hasCurrentWait) {
    const box = document.getElementById(BATCH_OVERLAY_ID);
    if (box) box.style.display = 'none';
    stopBatchOverlayCountdown();
    return;
  }
  
  const box = ensureBatchOverlay();
  box.style.display = 'block';
  const st = box.querySelector('#zz-batch-status');
  const title = box.querySelector('#zz-batch-title span');
  const btn = box.querySelector('#zz-batch-skip-btn');
  const cd = box.querySelector('#zz-batch-countdown');
  if (cd) cd.style.display = 'none';
  
  if (currentWaitReply) {
    box.style.background = 'linear-gradient(180deg, rgba(14,165,233,0.25) 0%, rgba(2,132,199,0.25) 100%)';
    stopBatchOverlayCountdown();
    const name = currentWaitReply.values?.display_name || currentWaitReply.values?.name || currentWaitReply.values?.zid || '';
    title.textContent = 'Đang chờ phản hồi';
    st.textContent = name || '...';
    btn.textContent = 'Dừng người này';
    box.dataset.rowId = currentWaitReply.id;
    return;
  }

  box.style.background = 'linear-gradient(180deg, rgba(20,83,45,0.25) 0%, rgba(22,101,52,0.25) 100%)';
  
  if (upcoming) {
    const sendAt = parseSendAt(upcoming.values?.send_at);
    title.textContent = 'Tin chờ gửi';
    startBatchOverlayCountdown(box, sendAt);
    btn.textContent = 'Dừng người này';
    box.dataset.rowId = upcoming.id;
    return;
  }
  
  stopBatchOverlayCountdown();
  title.textContent = 'Gửi tin nhắn';
  btn.textContent = 'Bỏ qua người này';
  const name = state.currentWait.display_name || state.currentWait.zid || '';
  st.textContent = name || '...';
  box.dataset.rowId = state.currentWait.rowId;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.schedule) {
    const next = changes.schedule.newValue || { isScheduled: false, runAt: 0 };
    if (next.isScheduled && next.runAt > Date.now()) {
      startOverlayCountdown(next.runAt);
    } else {
      stopOverlayCountdown();
    }
  }

  if (changes[OVERLAY_STORAGE_KEY]) {
    const box = ensureOverlay();
    applyOverlayPosition(box, changes[OVERLAY_STORAGE_KEY].newValue || getDefaultPosition());
  }

  if (changes.workerState || changes.messageQueue) {
    chrome.storage.local.get(['workerState', 'messageQueue'], (data) => {
      latestWorkerState = data.workerState || null;
      latestQueue = data.messageQueue || null;
      updateBatchOverlay();
    });
  }
});

syncBatchOverlayFromStorage();

activeChatObserver = new MutationObserver(notifyActiveChatChangedSoon);
activeChatObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'aria-selected']
});
notifyActiveChatChangedSoon();
