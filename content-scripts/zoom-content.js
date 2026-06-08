const OVERLAY_ID = 'zz-countdown-overlay';
const OVERLAY_STORAGE_KEY = 'overlayPosition';
let overlayTimer = null;
let dragState = null;

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
  box.style.background = 'linear-gradient(180deg, rgba(18,24,36,0.96) 0%, rgba(28,36,52,0.96) 100%)';
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ZOOM_END') return;

  const maxAttempts = 30;
  let attempts = 0;

  const openAndEnd = () => {
    attempts += 1;

    const iframe = document.querySelector('#webclient');
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!doc) {
      if (attempts >= maxAttempts) {
        sendResponse({ ok: false, error: 'Khong truy cap duoc iframe Zoom.' });
        return;
      }
      setTimeout(openAndEnd, 150);
      return;
    }

    const leaveContainer = doc.querySelector('.footer__leave-btn-container');
    const openMenuBtn = leaveContainer?.querySelector('button,[role="button"],.zmu-btn');
    if (!openMenuBtn) {
      if (attempts >= maxAttempts) {
        sendResponse({ ok: false, error: 'Khong tim thay nut mo menu Leave/End.' });
        return;
      }
      setTimeout(openAndEnd, 150);
      return;
    }

    openMenuBtn.click();

    setTimeout(() => {
      const endBtn =
        doc.querySelector(
          '.zmu-btn.leave-meeting-options__btn.leave-meeting-options__btn--default.leave-meeting-options__btn--danger.zmu-btn--default.zmu-btn__outline--white'
        ) ||
        Array.from(doc.querySelectorAll('button, .zmu-btn')).find((btn) => {
          const text = (btn.textContent || '').trim().toLowerCase();
          return text.includes('end meeting for all') || text.includes('ket thuc cuoc hop cho tat ca');
        });

      if (!endBtn) {
        if (attempts >= maxAttempts) {
          sendResponse({ ok: false, error: 'Khong tim thay nut End.' });
          return;
        }
        setTimeout(openAndEnd, 200);
        return;
      }

      ['mousedown', 'mouseup', 'click'].forEach((type) => {
        endBtn.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: doc.defaultView
          })
        );
      });

      sendResponse({ ok: true });
    }, 450);
  };

  openAndEnd();
  return true;
});

