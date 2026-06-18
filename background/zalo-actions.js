// Direct Zalo/Zoom automation actions used by scheduled and batch sends.
async function typeAndSendCurrentChat(tabId, message) {
  // Shared by both modes: current chat send and phone-search send.
  const inputPoint = await waitForValue(tabId, `(() => {
      const el = document.querySelector('#richInput');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
  if (!inputPoint) throw new Error('Khong tim thay o nhap Zalo.');

  await clickPoint(tabId, inputPoint);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 120);
  await clearFocusedText(tabId);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
  await insertText(tabId, message);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 1000);

  const expectedText = JSON.stringify(message);
  const readComposerTextExpression = `(() => {
    try {
      const el = document.querySelector('#richInput') || document.activeElement;
      if (!el) return '';
      const lines = [...el.querySelectorAll?.('[id^="input_line_"]') || []]
        .filter((line) => line.offsetParent !== null || line.getClientRects().length);
      if (lines.length) {
        return lines.map((line) => (line.innerText || line.textContent || '').replace(/\\n+$/g, '')).join('\\n');
      }
      const alt = el.getAttribute?.('alt');
      if (alt !== null && alt !== undefined) return alt;
      const aria = el.getAttribute?.('aria-label');
      if (aria) return aria;
      return el.innerText || el.textContent || el.value || '';
    } catch (_err) {
      return '';
    }
  })()`;
  const normalizeComposerText = (str) => (str || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  const waitForComposerText = () => waitForValue(tabId, `(() => {
    const typed = ${readComposerTextExpression};
    const normalize = (str) => (str || '')
      .replace(/\\r\\n?/g, '\\n')
      .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
      .replace(/\\u00A0/g, ' ')
      .trim();
    return normalize(typed) === normalize(${expectedText}) ? typed : null;
  })()`, 10000, 250);

  let typed = await waitForComposerText() || await evaluateValue(tabId, readComposerTextExpression);
  if (normalizeComposerText(typed) !== normalizeComposerText(message)) {
    await clickPoint(tabId, inputPoint);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 120);
    await clearFocusedText(tabId);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
    await insertText(tabId, message);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 1000);
    typed = await waitForComposerText() || await evaluateValue(tabId, readComposerTextExpression);
  }

  if (normalizeComposerText(typed) !== normalizeComposerText(message)) {
    console.error('Validation mismatch. Expected:', message, '\\nActual:', typed);
    throw new Error('Noi dung trong o nhap Zalo khong dung.');
  }

  const sendPoint = await evaluateValue(tabId, `(() => {
    const btn = document.querySelector('.send-msg-btn') || document.querySelector('[data-translate-title="STR_SEND"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  })()`);
  if (!sendPoint) throw new Error('Khong tim thay nut Send cua Zalo.');

  await clickPoint(tabId, sendPoint);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

  const sentQid = await evaluateValue(tabId, `(() => {
    const nodes = [...document.querySelectorAll('.message-view [class*="chat-message"], .message-view [data-id], .message-view [class*="msg-item"], .message-view .message-frame')];
    const meNodes = nodes.filter(el => {
      const cls = (el.className || '').toLowerCase();
      return /\\b(me|mine|self|owner|sent|right)\\b/.test(cls);
    });
    const last = meNodes[meNodes.length - 1];
    if (last) {
       return last.getAttribute('data-qid') || last.querySelector('[data-qid]')?.getAttribute('data-qid') || '';
    }
    return '';
  })()`);
  return sentQid;
}

async function typeAndSendZalo(tabId, message) {
  await attachDebugger(tabId);
  try {
    return await typeAndSendCurrentChat(tabId, message);
  } finally {
    await detachDebugger(tabId);
  }
}

function formatZaloReminderDateTime(value) {
  const date = new Date(Number(value) || value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Thoi gian nhac hen khong hop le.');
  }
  const pad = (num) => String(num).padStart(2, '0');
  return {
    date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

async function focusAndFillSelector(tabId, selector, text, timeoutMs = 8000) {
  const point = await waitForValue(tabId, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  })()`, timeoutMs, 250);
  if (!point) throw new Error(`Khong tim thay o nhap ${selector}.`);

  await clickPoint(tabId, point);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 120);
  await clearFocusedText(tabId);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 120);
  await insertText(tabId, text);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 200);
}

async function waitAndClickFixedSelector(tabId, selector, errMessage) {
  const found = await waitForValue(tabId, `(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const visibleEl = els.find(e => e.getBoundingClientRect().width > 0);
    return visibleEl ? true : null;
  })()`, 5000, 250);

  if (!found) throw new Error(errMessage);

  await sleep(Math.floor(Math.random() * 1500 + 500) + 600); // Đợi UI mở ra

  await evaluateValue(tabId, `(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const visibleEl = els.find(e => e.getBoundingClientRect().width > 0);
    if (!visibleEl) return null;
    const btn = visibleEl.closest('div, button, [role="button"]') || visibleEl;
    btn.click();
  })()`);
}

async function createReminderCurrentChat(tabId, reminderAt, text) {
  const message = String(text || '').trim();
  if (!message) throw new Error('Thieu noi dung nhac hen.');
  const reminder = formatZaloReminderDateTime(reminderAt);

  const menuReady = await waitForValue(tabId, `(() => !!document.querySelector('[data-id="div_More_Menu"]'))()`, 5000, 250);
  if (!menuReady) throw new Error('Khong mo duoc menu Them cua Zalo.');

  const jsCodeOpenReminder = `(() => {
    const btn = document.querySelector('[data-id="div_More_Menu"]');
    if (btn) btn.click();
    
    let attempts = 0;
    const interval = setInterval(() => {
      const reminderBtn = document.querySelector('[class="fa fa-Reminder_24_Line menu-icon left"]');
      if (reminderBtn) {
        reminderBtn.click();
        clearInterval(interval);
      }
      if (++attempts > 20) clearInterval(interval);
    }, 100);
  })()`;
  await evaluateValue(tabId, jsCodeOpenReminder);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 1500); // Chờ popup nhắc hẹn mở ra ban đầu

  // 1. Điền text (nội dung) trước khi bấm Tuỳ chỉnh để không bị che
  await focusAndFillSelector(tabId, '.plain-text-wrapper', message);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 600);

  // 2. Click nút "Tuỳ chỉnh" (Other) để mở rộng ô chọn ngày/giờ
  const jsCodeClickOther = `(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      const otherBtn = document.querySelector('[data-translate-inner="STR_OTHER"]');
      if (otherBtn) {
        otherBtn.click();
        clearInterval(interval);
      }
      if (++attempts > 20) clearInterval(interval);
    }, 100);
  })()`;
  await evaluateValue(tabId, jsCodeClickOther);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

  // 3. Lúc này ô nhập ngày/giờ mới hiện lên, tiến hành nhập
  await focusAndFillSelector(tabId, 'input[data-id="txt_RMD_Date"]', reminder.date);
  await focusAndFillSelector(tabId, 'input[data-id="txt_RMD_Time"]', reminder.time);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

  // 4. Click tạo
  const jsCodeFinish = `(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      const createBtn = document.querySelector('[data-translate-inner="STR_CREATE_REMINDER"]');
      if (createBtn) {
        createBtn.click();
        clearInterval(interval);
      }
      if (++attempts > 20) clearInterval(interval);
    }, 100);
  })()`;
  await evaluateValue(tabId, jsCodeFinish);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 1500);
}

/**
 * Gửi tin nhắn hình ảnh từ Base64 đến cuộc trò chuyện hiện tại bằng cách giả lập paste vào DOM.
 * @param {number} tabId - ID của tab Zalo
 * @param {string} base64Data - Chuỗi Base64 của ảnh cần gửi
 */
async function pasteAndSendImageZalo(tabId, base64Data) {
  await attachDebugger(tabId);
  try {
    let res = await sendToTab(tabId, { type: 'ZALO_PASTE_IMAGE', base64Data });
    if (!res?.ok && /receiving end does not exist|no response/i.test(String(res?.error || ''))) {
      const injected = await scriptingExecuteScript({
        target: { tabId },
        func: (imageBase64) => {
          try {
            const raw = String(imageBase64 || '').includes(',')
              ? String(imageBase64 || '').split(',')[1]
              : String(imageBase64 || '');
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([new Blob([bytes], { type: 'image/png' })], 'auto_pasted_image.png', { type: 'image/png' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const targetInput = document.querySelector('#richInput') || document.activeElement;
            if (!targetInput || targetInput === document.body) {
              return { ok: false, error: 'Chua focus vao o nhap tin nhan Zalo.' };
            }
            targetInput.focus();
            targetInput.dispatchEvent(new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            }));
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err?.message || String(err) };
          }
        },
        args: [base64Data]
      });
      res = injected?.[0]?.result || res;
    }
    if (!res?.ok) throw new Error(res?.error || 'Không thể dán ảnh vào Zalo.');

    await sleep(Math.floor(Math.random() * 1500 + 500) + 1500); // Đợi Zalo nhận diện hình ảnh vừa dán

    const sendPoint = await evaluateValue(tabId, `(() => {
      const btn = document.querySelector('.send-msg-btn') || document.querySelector('[data-translate-title="STR_SEND"]');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
    if (!sendPoint) throw new Error('Không tìm thấy nút gửi Zalo sau khi dán ảnh.');

    await clickPoint(tabId, sendPoint);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

    const sentQid = await evaluateValue(tabId, `(() => {
      const nodes = [...document.querySelectorAll('.message-view [class*="chat-message"], .message-view [data-id], .message-view [class*="msg-item"], .message-view .message-frame')];
      const meNodes = nodes.filter(el => {
        const cls = (el.className || '').toLowerCase();
        return /\\b(me|mine|self|owner|sent|right)\\b/.test(cls);
      });
      const last = meNodes[meNodes.length - 1];
      if (last) {
         return last.getAttribute('data-qid') || last.querySelector('[data-qid]')?.getAttribute('data-qid') || '';
      }
      return '';
    })()`);
    return sentQid;
  } finally {
    await detachDebugger(tabId);
  }
}

async function pasteImageAndTypeAndSend(tabId, base64Data, message) {
  await attachDebugger(tabId);
  try {
    let res = await sendToTab(tabId, { type: 'ZALO_PASTE_IMAGE', base64Data });
    if (!res?.ok && /receiving end does not exist|no response/i.test(String(res?.error || ''))) {
      const injected = await scriptingExecuteScript({
        target: { tabId },
        func: (imageBase64) => {
          try {
            const raw = String(imageBase64 || '').includes(',')
              ? String(imageBase64 || '').split(',')[1]
              : String(imageBase64 || '');
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([new Blob([bytes], { type: 'image/png' })], 'auto_pasted_image.png', { type: 'image/png' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            const targetInput = document.querySelector('#richInput') || document.activeElement;
            if (!targetInput || targetInput === document.body) {
              return { ok: false, error: 'Chua focus vao o nhap tin nhan Zalo.' };
            }
            targetInput.focus();
            targetInput.dispatchEvent(new ClipboardEvent('paste', {
              clipboardData: dataTransfer,
              bubbles: true,
              cancelable: true
            }));
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err?.message || String(err) };
          }
        },
        args: [base64Data]
      });
      res = injected?.[0]?.result || res;
    }
    if (!res?.ok) throw new Error(res?.error || 'Không thể dán ảnh vào Zalo.');

    await sleep(Math.floor(Math.random() * 1500 + 500) + 1500); // Đợi Zalo nhận diện hình ảnh vừa dán

    if (message) {
      await insertText(tabId, message);
      await sleep(Math.floor(Math.random() * 1500 + 500) + 1000);
    }

    const sendPoint = await evaluateValue(tabId, `(() => {
      const btn = document.querySelector('.send-msg-btn') || document.querySelector('[data-translate-title="STR_SEND"]');
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
    if (!sendPoint) throw new Error('Không tìm thấy nút gửi Zalo sau khi dán ảnh/nhập chữ.');

    await clickPoint(tabId, sendPoint);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

    const sentQid = await evaluateValue(tabId, `(() => {
      const nodes = [...document.querySelectorAll('.message-view [class*="chat-message"], .message-view [data-id], .message-view [class*="msg-item"], .message-view .message-frame')];
      const meNodes = nodes.filter(el => {
        const cls = (el.className || '').toLowerCase();
        return /\\b(me|mine|self|owner|sent|right)\\b/.test(cls);
      });
      const last = meNodes[meNodes.length - 1];
      if (last) {
         return last.getAttribute('data-qid') || last.querySelector('[data-qid]')?.getAttribute('data-qid') || '';
      }
      return '';
    })()`);
    return sentQid;
  } finally {
    await detachDebugger(tabId);
  }
}

async function findExactVisibleTextPoint(tabId, text, minX = 0) {
  return evaluateValue(tabId, `(() => {
    const target = ${JSON.stringify(text)};
    const minX = ${JSON.stringify(minX)};
    const nodes = [...document.querySelectorAll('button, .z--btn--v2, [role="button"], .z-banner, div')];
    const matches = nodes.filter((el) => {
      const r = el.getBoundingClientRect();
      const current = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      return r.width && r.height && r.x >= minX && current === target;
    });
    const el = matches[matches.length - 1] || null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: target };
  })()`);
}

async function clickAddFriendIfAvailable(tabId) {
  // Zalo's banner button opens the profile panel. The actual friend request is
  // sent only after clicking the "Kết bạn" button inside that panel.
  const bannerPoint = await findExactVisibleTextPoint(tabId, 'Gửi kết bạn', 400);
  if (!bannerPoint) return 'not_available';

  await clickPoint(tabId, bannerPoint);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 1200);

  const panelPoint = await findExactVisibleTextPoint(tabId, 'Kết bạn', 400);
  if (!panelPoint) return 'opened_panel_without_button';

  await clickPoint(tabId, panelPoint);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 2500);

  const successText = await evaluateValue(tabId, `(() => document.body.innerText.includes('Gửi yêu cầu kết bạn thành công'))()`);
  return successText ? 'sent' : 'clicked';
}

async function findConversationByNameOrSms(tabId, name, sms) {
  // After sending SMS to a searched phone number, Zalo creates/moves a sidebar
  // conversation item. Its anim-data-id is the zid we persist.
  return waitForValue(tabId, `(() => {
    const normalize = (text) => (text || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
    const targetName = normalize(${JSON.stringify(name)});
    const targetSms = normalize(${JSON.stringify(sms)});
    const items = [...document.querySelectorAll('.msg-item[anim-data-id]')].map((el) => {
      const itemName = normalize(el.querySelector('.conv-item-title__name')?.innerText || '');
      const preview = normalize(el.querySelector('.conv-item-body, .z-conv-message')?.innerText || '');
      return {
        zid: el.getAttribute('anim-data-id'),
        name: itemName,
        preview
      };
    }).filter((item) => item.zid && item.name);

    return items.find((item) => item.name === targetName) ||
      items.find((item) => item.preview === 'Bạn: ' + targetSms) ||
      null;
  })()`, 5000, 250);
}

async function searchPhoneFirstResult(tabId, phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new Error('Thieu phone de tim zid.');

  await tabsUpdate(tabId, { active: true });
  await sleep(Math.floor(Math.random() * 1500 + 500) + 300);

  const searchPoint = await evaluateValue(tabId, `(() => {
    const el = document.querySelector('#contact-search-input');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  })()`);
  if (!searchPoint) throw new Error('Khong tim thay o search Zalo.');

  await clickPoint(tabId, searchPoint);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
  await clearFocusedText(tabId);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
  await insertText(tabId, normalizedPhone);

  const searchValue = await waitForValue(
    tabId,
    `(() => document.querySelector('#contact-search-input')?.value === ${JSON.stringify(normalizedPhone)} ? true : null)()`,
    3000,
    100
  );
  if (!searchValue) throw new Error('Khong nhap duoc so dien thoai vao o search.');

  const firstResult = await waitForValue(tabId, `(() => {
    const phone = ${JSON.stringify(normalizedPhone)};
    const list = document.querySelector('#searchResultList');
    if (!list) return null;
    const items = [...list.querySelectorAll('[id^="friend-item-"], .conv-item')].filter((el) => {
      const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ');
      const r = el.getBoundingClientRect();
      const normalizedText = text.replace(/[^\\d+]/g, '');
      return r.width && r.height && normalizedText.includes(phone);
    });
    const el = items[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      name: text.split(' Số điện thoại:')[0] || text,
      text
    };
  })()`, 12000, 250);
  if (!firstResult) throw new Error(`Khong tim duoc ket qua dau cho so ${normalizedPhone}.`);

  await clickPoint(tabId, firstResult);
  await sleep(Math.floor(Math.random() * 1500 + 500) + 800);

  return {
    phone: normalizedPhone,
    zid: '',
    name: firstResult.name,
    clicked: true
  };
}

async function searchPhoneSendSmsAndAddFriend(tabId, phone, sms) {
  // Full phone flow: search phone -> click first result -> send SMS -> read zid
  // -> try add friend if Zalo shows the button.
  await tabsUpdate(tabId, { active: true });
  await sleep(Math.floor(Math.random() * 1500 + 500) + 300);
  await attachDebugger(tabId);
  try {
    const searchPoint = await evaluateValue(tabId, `(() => {
      const el = document.querySelector('#contact-search-input');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    })()`);
    if (!searchPoint) throw new Error('Khong tim thay o search Zalo.');

    await clickPoint(tabId, searchPoint);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
    await clearFocusedText(tabId);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 150);
    await insertText(tabId, phone);

    const searchValue = await waitForValue(
      tabId,
      `(() => document.querySelector('#contact-search-input')?.value === ${JSON.stringify(phone)} ? true : null)()`,
      3000,
      100
    );
    if (!searchValue) throw new Error('Khong nhap duoc so dien thoai vao o search.');

    const firstResult = await waitForValue(tabId, `(() => {
      const phone = ${JSON.stringify(phone)};
      const list = document.querySelector('#searchResultList');
      if (!list) return null;
      const items = [...list.querySelectorAll('[id^="friend-item-"], .conv-item')].filter((el) => {
        const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ');
        const r = el.getBoundingClientRect();
        return r.width && r.height && text.includes(phone);
      });
      const el = items[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        name: text.split(' Số điện thoại:')[0] || text,
        text
      };
    })()`, 12000, 250);
    if (!firstResult) throw new Error(`Khong tim duoc ket qua dau cho so ${phone}.`);

    await clickPoint(tabId, firstResult);

    // Đợi cho cuộc hội thoại khớp với kết quả tìm kiếm được mở chính thức
    const opened = await waitForValue(tabId, `(() => {
      const headerEl = document.querySelector('#header .header-title, #header .threadChat__title');
      const headerName = (headerEl?.innerText || headerEl?.textContent || '').trim().toLowerCase();
      const expectedName = ${JSON.stringify(firstResult.name)}.trim().toLowerCase();
      return headerName && (headerName.includes(expectedName) || expectedName.includes(headerName)) ? true : null;
    })()`, 12000, 250);
    if (!opened) throw new Error('Cuoc hoi thoai tu search khong mo duoc dung ten.');

    await typeAndSendCurrentChat(tabId, sms);
    await sleep(Math.floor(Math.random() * 1500 + 500) + 2700);
    const conversation = await findConversationByNameOrSms(tabId, firstResult.name, sms);
    if (!conversation?.zid) throw new Error('Da gui SMS nhung khong lay duoc zid cua doan chat.');
    const addFriendState = await clickAddFriendIfAvailable(tabId);
    return {
      phone,
      sms,
      zid: conversation.zid,
      name: conversation.name || firstResult.name,
      addFriendState
    };
  } finally {
    await detachDebugger(tabId);
  }
}

async function runTask() {
  const data = await chrome.storage.local.get(['schedule']);
  const schedule = data.schedule || { isScheduled: false, runAt: 0 };
  if (!schedule.isScheduled) return;
  if (!schedule.message) throw new Error('Chua co noi dung tin nhan.');

  const zoomTab = await findFirstTabByUrl([/\.zoom\.us\//i]);
  if (zoomTab?.id) {
    await tabsUpdate(zoomTab.id, { active: true });
    await sleep(Math.floor(Math.random() * 1500 + 500) + 300);
    await sendToTab(zoomTab.id, { type: 'ZOOM_END' });
    await sleep(Math.floor(Math.random() * 1500 + 500) + 1800);
  }

  const zaloTab = await findFirstTabByUrl([/chat\.zalo\.me/i]);
  if (!zaloTab?.id) throw new Error('Khong tim thay tab Zalo.');

  await tabsUpdate(zaloTab.id, { active: true });
  await sleep(Math.floor(Math.random() * 1500 + 500) + 500);
  if (schedule.phone) {
    return searchPhoneSendSmsAndAddFriend(zaloTab.id, schedule.phone, schedule.message);
  }

  await typeAndSendZalo(zaloTab.id, schedule.message);
  return {
    phone: '',
    sms: schedule.message,
    zid: '',
    name: '',
    addFriendState: 'skipped_no_phone'
  };
}
