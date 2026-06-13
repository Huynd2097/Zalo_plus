// Bộ xử lý worker gửi tin nhắn hàng chờ và theo dõi phản hồi.

const workerRuntime = {
  runPromise: null,
  waitReplyTabId: null
};


/**
 * Đảm bảo tab Zalo đang mở, nếu chưa có thì mở mới.
 * @returns {Promise<Tab>} Đối tượng Tab của Chrome
 */
async function ensureZaloTab() {
  const found = await findFirstTabByUrl([/chat\.zalo\.me/i]);
  if (found?.id) return tabsUpdate(found.id, { active: true });
  return tabsCreate({ url: 'https://chat.zalo.me/', active: true });
}

/**
 * Mở cuộc hội thoại Zalo theo zid.
 * @param {number} tabId - ID của tab Zalo
 * @param {string} zid - ID cuộc trò chuyện Zalo
 * @returns {Promise<void>}
 */
async function openZaloChat(tabId, zid) {
  const isAlreadyCorrect = await waitForCorrectZaloChat(tabId, zid, 500);
  if (isAlreadyCorrect) return;

  const visiblePoint = await findConversationPointByZid(tabId, zid, 500);
  if (visiblePoint) {
    await clickPoint(tabId, visiblePoint);
    const isCorrectNow = await waitForCorrectZaloChat(tabId, zid, 3000);
    if (isCorrectNow) return;
  }

  await tabsUpdate(tabId, {
    active: true,
    url: `https://chat.zalo.me/?c=${encodeURIComponent(zid)}`
  });
  
  try {
    await waitForTabLoad(tabId, 15000);
  } catch (_err) {
    // Bỏ qua lỗi load tab vì Zalo có thể vẫn render tiếp sau load event
  }

  const isCorrectAfterGoto = await waitForCorrectZaloChat(tabId, zid, 15000);
  if (isCorrectAfterGoto) return;

  throw new Error(`Không tìm thấy hội thoại zid=${zid}.`);
}

/**
 * Tìm tọa độ của một hội thoại trên thanh sidebar theo zid.
 * @param {number} tabId - ID tab Zalo
 * @param {string} zid - ID cuộc trò chuyện
 * @param {number} [timeoutMs=3000] - Thời gian chờ tối đa
 * @returns {Promise<{x: number, y: number}|null>} Tọa độ click
 */
async function findConversationPointByZid(tabId, zid, timeoutMs = 3000) {
  return waitForValue(tabId, `(() => {
    const zid = ${JSON.stringify(zid)};
    const items = [...document.querySelectorAll('[anim-data-id]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return el.getAttribute('anim-data-id') === zid && r.width && r.height;
    });
    const el = items[0] || null;
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`, timeoutMs, 250);
}

/**
 * Đọc thông tin hội thoại hiện tại đang active trên DOM Zalo.
 * @param {number} tabId - ID tab Zalo
 * @returns {Promise<{zid: string, display_name: string, tag: string}>}
 */
async function readCurrentChatInfo(tabId) {
  const current = await evaluateValue(tabId, `(() => {
    const normalize = (text) => (text || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
    const stripTags = (text) => {
      let value = normalize(text).replace(/\\s+Công việc(?:\\s.*)?$/i, '').trim();
      const phones = [...value.matchAll(/(?:\\+?84|0)?[\\d\\s().-]{8,}/g)];
      if (phones.length) {
        const last = phones[phones.length - 1];
        const end = last.index + last[0].length;
        const tail = value.slice(end).trim().toLowerCase();
        if (tail === 'công việc' || tail.startsWith('công việc ')) value = value.slice(0, end).trim();
      }
      return value;
    };
    const activeItems = [...document.querySelectorAll('.msg-item[anim-data-id]')].filter((el) => {
      const cls = String((el.className || '') + ' ' + (el.querySelector('.selected, .active, .focus')?.className || '')).toLowerCase();
      return cls.includes('active') || cls.includes('selected') || cls.includes('focus');
    });
    const active = activeItems.find((el) => el.getAttribute('anim-data-id')) || null;
    const activeName = stripTags(active?.querySelector?.('.conv-item-title__name')?.innerText || '');
    const headerName = stripTags(document.querySelector('#header .header-title, #header .threadChat__title')?.innerText || '');
    const tagText = normalize((active?.innerText || active?.textContent || '') + ' ' + (document.querySelector('#header')?.innerText || ''));
    
    // Trích xuất đường dẫn ảnh đại diện (avatar) của cuộc hội thoại đang active
    const imgEl = active?.querySelector('img');
    const avatar = imgEl ? imgEl.src : '';

    return {
      zid: active?.getAttribute('anim-data-id') || '',
      display_name: activeName || headerName,
      tag: /Công việc/i.test(tagText) ? 'Công việc' : '',
      avatar: avatar
    };
  })()`);
  
  const zid = String(current?.zid || '').trim();
  const contactMap = zid ? await loadContactMap() : null;
  const stored = contactMap?.byZid?.[zid] || null;

  const domName = cleanZaloDisplayName(current?.display_name || '');
  const storedName = cleanZaloDisplayName(stored?.display_name || stored?.name || '');
  const finalName = domName || storedName;
  const tag = current?.tag || stored?.tag || '';
  const domAvatar = current?.avatar || '';
  const storedAvatar = stored?.avatar || '';
  const finalAvatar = domAvatar || storedAvatar;

  // Tự động cập nhật display_name hoặc avatar khi thấy có sự khác biệt
  const nameChanged = zid && domName && storedName && domName !== storedName;
  const avatarChanged = zid && domAvatar && storedAvatar && domAvatar !== storedAvatar;

  if (zid && (nameChanged || avatarChanged)) {
    let finalAvatarToSave = domAvatar;
    if (avatarChanged && domAvatar.startsWith('http')) {
      finalAvatarToSave = await resizeAvatarOnTab(tabId, domAvatar);
    }
    await saveContactMapping({
      zid,
      display_name: domName || storedName,
      tag,
      phone: stored?.phone || '',
      avatar: finalAvatarToSave || storedAvatar
    });
  }

  return { zid, display_name: finalName, tag, avatar: finalAvatar };
}

/**
 * Thực hiện resize ảnh đại diện của liên hệ trên tab đang mở về 40x40px base64.
 * @param {number} tabId - ID của tab Zalo
 * @param {string} url - URL gốc của ảnh đại diện
 * @returns {Promise<string>} Chuỗi base64 đã resize hoặc URL gốc nếu lỗi
 */
async function resizeAvatarOnTab(tabId, url) {
  if (!url || !url.startsWith('http')) return url;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (imgUrl) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 40;
              canvas.height = 40;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, 40, 40);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            } catch (e) {
              resolve(imgUrl);
            }
          };
          img.onerror = () => {
            const imgFallback = new Image();
            imgFallback.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 40;
                canvas.height = 40;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgFallback, 0, 0, 40, 40);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
              } catch (e) {
                resolve(imgUrl);
              }
            };
            imgFallback.onerror = () => {
              resolve(imgUrl);
            };
            imgFallback.src = imgUrl;
          };
          img.src = imgUrl;
        });
      },
      args: [url]
    });
    return results[0]?.result || url;
  } catch (err) {
    return url;
  }
}

/**
 * Đợi cho đến khi hội thoại đang mở khớp với zid mong muốn.
 * @param {number} tabId - ID tab Zalo
 * @param {string} zid - ID cuộc trò chuyện cần check
 * @param {number} [timeoutMs=12000] - Thời gian chờ tối đa
 * @returns {Promise<boolean>} Đúng hội thoại hay không
 */
async function waitForCorrectZaloChat(tabId, zid, timeoutMs = 12000) {
  return waitForValue(tabId, `(() => {
    const zid = ${JSON.stringify(zid)};
    const input = document.querySelector('#richInput');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    let urlMatches = false;
    try {
      urlMatches = new URL(location.href).searchParams.get('c') === zid;
    } catch (_err) {}

    const activeItems = [...document.querySelectorAll('.msg-item[anim-data-id]')].filter((el) => {
      const cls = String((el.className || '') + ' ' + (el.querySelector('.selected, .active, .focus')?.className || '')).toLowerCase();
      return cls.includes('active') || cls.includes('selected') || cls.includes('focus');
    });
    const domMatches = activeItems.some((el) => el.getAttribute('anim-data-id') === zid);
    if (activeItems.length) return domMatches ? true : null;
    return urlMatches ? true : null;
  })()`, timeoutMs, 250);
}

/**
 * Xác minh tên hiển thị của người nhận trên UI xem có khớp với thông tin trong hàng chờ hay không.
 * @param {number} tabId - ID tab Zalo
 * @param {Object} row - Dòng trong hàng chờ
 * @returns {Promise<boolean>} Khớp hay không
 */
async function verifyChatRecipient(tabId, row) {
  const expectedName = normalizeLookupText(row.values?.display_name || row.values?.name);
  const expectedZid = String(row.values?.zid || '').trim();
  if (!expectedName && !expectedZid) return true;

  const matched = await evaluateValue(tabId, `(() => {
    const normalize = (text) => (text || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim().toLowerCase();
    const stripTags = (text) => {
      let value = normalize(text).replace(/\\s+công việc(?:\\s.*)?$/i, '').trim();
      const phones = [...value.matchAll(/(?:\\+?84|0)?[\\d\\s().-]{8,}/g)];
      if (phones.length) {
        const last = phones[phones.length - 1];
        const end = last.index + last[0].length;
        const tail = value.slice(end).trim();
        if (tail === 'công việc' || tail.startsWith('công việc ')) value = value.slice(0, end).trim();
      }
      return value;
    };
    const expected = ${JSON.stringify(expectedName)};
    const expectedZid = ${JSON.stringify(expectedZid)};

    const activeItems = [...document.querySelectorAll('.msg-item[anim-data-id]')].filter((el) => {
      const cls = String((el.className || '') + ' ' + (el.querySelector('.selected, .active, .focus')?.className || '')).toLowerCase();
      return cls.includes('active') || cls.includes('selected') || cls.includes('focus');
    });
    const active = activeItems.find((el) => el.getAttribute('anim-data-id'));
    let urlZid = '';
    try {
      urlZid = new URL(location.href).searchParams.get('c') || '';
    } catch (_err) {}
    const activeZid = active?.getAttribute('anim-data-id') || urlZid;
    const activeName = stripTags(active?.querySelector?.('.conv-item-title__name')?.innerText || '');
    if (expectedZid) return activeZid === expectedZid ? true : null;

    const headerTexts = [...document.querySelectorAll('#header .header-title, #header .threadChat__title, #header')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.height && r.left > 300 && r.top < 180;
      })
      .map((el) => stripTags(el.innerText || el.textContent || ''))
      .filter((text) => text && text.length <= 120);
    if (expected) {
      const names = [activeName, ...headerTexts].filter(Boolean);
      return names.some((text) => text === expected) ? true : null;
    }
    return expectedZid ? true : null;
  })()`);

  if (!matched) {
    throw new Error(`Không xác nhận được người nhận name=${row.values?.display_name || row.values?.name || ''}, zid=${row.values?.zid || ''}.`);
  }
  return true;
}

/**
 * Đọc các tin nhắn mới từ người nhận (sau tin nhắn của mình gửi gần nhất làm mốc).
 * @param {number} tabId - ID tab Zalo
 * @param {string} sentMessage - Tin nhắn mình đã gửi làm mốc
 * @returns {Promise<string[]>} Các tin nhắn phản hồi của đối phương
 */
async function getReplyCollectionLimit() {
  const data = await storageGet([REPLY_COLLECTION_LIMIT_KEY]);
  const raw = Number(data[REPLY_COLLECTION_LIMIT_KEY]);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_REPLY_COLLECTION_LIMIT;
  return Math.floor(raw);
}

async function readIncomingMessages(tabId, sentMessage, sentQidParam = "", replyLimit = DEFAULT_REPLY_COLLECTION_LIMIT) {
  const maxReplies = Math.max(0, Math.floor(Number(replyLimit) || 0));
  const result = await evaluateValue(tabId, `(() => {
    const normalize = (text) => (text || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
    const sentMsg = ${JSON.stringify(sentMessage || '')};

    let nodes = [...document.querySelectorAll('.message-view [class*="chat-message"]')];
    if (!nodes.length) {
      nodes = [...document.querySelectorAll('.message-view [data-id], .message-view [class*="msg-item"]')];
    }
    if (!nodes.length) {
      nodes = [...document.querySelectorAll('.message-view [class*="message-item"], .message-view [class*="chat-item"]')];
    }

    const messages = [];
    nodes.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const cls = (el.className || '').toString().toLowerCase();
      const ownByClass = /\\b(me|mine|self|owner|sent|right)\\b/.test(cls);
      
      const viewEl = el.closest('.message-view');
      const viewCenter = viewEl ? viewEl.getBoundingClientRect().left + viewEl.getBoundingClientRect().width / 2 : window.innerWidth / 2;
      
      let isMine = ownByClass;
      const bubble = el.querySelector('.card, .shadow-bubble, [class*="bubble"]');
      if (bubble) {
         const bRect = bubble.getBoundingClientRect();
         if (bRect.width > 0) {
            const incomingByPosition = bRect.left + bRect.width / 2 < viewCenter;
            isMine = ownByClass || !incomingByPosition;
         }
      }

      const clone = el.cloneNode(true);

      const quotes = [...clone.querySelectorAll('.message-quote-fragment__container, [class*="message-quote-fragment"]')];
      quotes.forEach(e => e.remove());

      const emojis = [...clone.querySelectorAll('img[src*="emoji"], img[class*="emo"], span[class*="emo"], .sticker-msg, img[src*="sticker"], div[class*="sticker"]')];
      emojis.forEach(e => e.remove());

      const imgs = [...clone.querySelectorAll('.picture__img, .image-msg')];

      const timeSpans = [...clone.querySelectorAll('.card-send-time, [class*="time"], [class*="date"], .message-reaction-container, [class*="reaction"]')];
      timeSpans.forEach(e => e.remove());

      let text = normalize(clone.innerText || clone.textContent || '');
      text = text.replace(/(?:\\/-strong|\\/-heart|:o|:-\\(\\(|:-h|:>|:-s|\\/-v|\\/-fade)/gi, '').trim();

      if (imgs.length > 0) {
        text = text ? text + '\\n[ảnh]' : '[ảnh]';
      }

      if (text && !text.includes('Đã gửi') && !text.includes('Đã nhận')) {
        messages.push({ text, isMine });
      }
    });

    let startIndex = 0;
    if (sentQidParam) {
       for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].qid === sentQidParam) {
             startIndex = i + 1;
             break;
          }
       }
    } else if (sentMsg) {
       const sentNorm = normalize(sentMsg);
       for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].isMine && (messages[i].text === sentNorm || messages[i].text.includes(sentNorm) || sentNorm.includes(messages[i].text))) {
             startIndex = i + 1;
             break;
          }
       }
    }

    const items = [];
    for (let i = startIndex; i < messages.length; i++) {
       if (!messages[i].isMine) {
          items.push(messages[i].text);
       }
    }

    const maxReplies = ${maxReplies};
    return { ok: true, items: maxReplies > 0 ? items.slice(0, maxReplies) : items, debug: { messagesCount: messages.length, startIndex, foundItems: items.length } };
  })()`);

  if (!result?.ok || !Array.isArray(result.items)) {
    console.error('Không đọc được tin nhắn Zalo:', result);
    throw new Error('Không đọc được tin nhắn Zalo.');
  }
  return result.items;
}

/**
 * Tìm kiếm và gán zid từ contact map nếu dòng chưa có zid.
 * @param {number} tabId - ID tab Zalo
 * @param {Object} row - Dòng trong hàng chờ
 * @returns {Promise<string>} Zid đã tìm được hoặc chuỗi rỗng
 */
async function resolveRowZid(tabId, row) {
  const currentZid = String(row.values.zid || '').trim();
  if (currentZid) {
    fillIntermediatePhoneColumns(row.values);
    return currentZid;
  }

  const mapped = await findMappedContact(row.values);
  if (mapped?.zid) {
    row.values.zid = mapped.zid;
    if (!row.values.display_name && !row.values.name && (mapped.display_name || mapped.name)) {
      row.values.display_name = mapped.display_name || mapped.name;
    }
    if (!row.values.phone && mapped.phone) {
      row.values.phone = mapped.phone;
    }
    fillIntermediatePhoneColumns(row.values);
    await updateQueueRow(row.id, { values: row.values });
    return mapped.zid;
  }

  return '';
}

/**
 * Trích xuất số điện thoại dùng để tìm kiếm từ dòng.
 * @param {Object} values - Các cột giá trị của dòng
 * @returns {string} Số điện thoại sạch
 */
function getRowSearchPhone(values) {
  fillIntermediatePhoneColumns(values);
  return normalizePhone(values.phone) ||
    normalizePhone(values.sys_phone) ||
    normalizePhone(values._name_phone_normalized);
}

/**
 * Mở cuộc hội thoại Zalo để chuẩn bị gửi tin.
 * @param {number} tabId - ID tab Zalo
 * @param {Object} row - Dòng trong hàng chờ
 * @returns {Promise<{foundByPhone: Object|null}>} Kết quả tìm kiếm
 */
async function openBatchRowChatForSend(tabId, row) {
  const currentZid = String(row.values.zid || '').trim();
  if (currentZid) {
    try {
      await openZaloChat(tabId, currentZid);
      return { foundByPhone: null };
    } catch (err) {
      if (!isConversationNotFoundError(err)) throw err;
    }
  }

  const phone = getRowSearchPhone(row.values);
  if (!phone) {
    throw new Error(currentZid ? `Không tìm thấy hội thoại zid=${currentZid}.` : 'Thiếu zid hoặc số điện thoại để tìm kiếm.');
  }

  await saveWorkerState({ message: `Đang tìm kiếm người nhận theo SĐT: ${phone}.` });
  const found = await searchPhoneFirstResult(tabId, phone);
  
  row.values.zid = found.zid || '';
  if (found.display_name || found.name) {
    row.values.display_name = found.display_name || found.name;
  }
  row.values.phone = found.phone || row.values.phone || phone;
  fillIntermediatePhoneColumns(row.values);
  await updateQueueRow(row.id, { values: row.values });
  return { foundByPhone: found };
}

/**
 * Kiểm tra xem lỗi có phải do không tìm thấy cuộc trò chuyện hay không.
 * @param {Error|string} error - Lỗi gặp phải
 * @returns {boolean}
 */
function isConversationNotFoundError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('không tìm thấy hội thoại') || message.includes('khong tim thay hoi thoai');
}

function isSearchNotFoundError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return isConversationNotFoundError(error) ||
    message.includes('không tìm được kết quả') ||
    message.includes('khong tim duoc ket qua') ||
    message.includes('không tìm thấy ô search') ||
    message.includes('khong tim thay o search');
}

/**
 * Thực hiện gửi tin nhắn cho một dòng trong hàng chờ.
 * @param {number} tabId - ID tab Zalo
 * @param {Object} row - Dòng trong hàng chờ cần xử lý
 * @returns {Promise<void>}
 */
async function sendQueueRow(tabId, row) {
  await resolveRowZid(tabId, row);
  const message = String(row.values.message || '').trim();
  const mediaId = String(row.values.media_id || '').trim();
  const noteValue = String(row.values.note || '').trim().toLowerCase();
  const isReminder = noteValue === 'reminder' || noteValue === 'nhac hen' || noteValue === 'nhắc hẹn';
  if (!message && !mediaId) throw new Error('Thiếu nội dung tin nhắn và hình ảnh.');
  if (isReminder && !parseSendAt(row.values?.send_at)) throw new Error('Thiếu thời gian nhắc hẹn.');

  const opened = await openBatchRowChatForSend(tabId, row);
  const zid = String(row.values.zid || '').trim();
  if (!opened.foundByPhone) {
    if (!zid) throw new Error('Không lấy được ID cuộc trò chuyện.');
    
    const isCorrect = await waitForCorrectZaloChat(tabId, zid);
    if (!isCorrect) throw new Error(`Không xác nhận được cuộc trò chuyện đúng zid=${zid}.`);
    
    await verifyChatRecipient(tabId, row);
    const currentChat = await readCurrentChatInfo(tabId);
    if (currentChat?.display_name) row.values.display_name = currentChat.display_name;
    fillIntermediatePhoneColumns(row.values);
  }

  if (isReminder) {
    row.values.wait_reply = '';
    row.values.media_id = '';
    row.values.media_name = '';
    row.values.media_thumbnail = '';
    await createReminderCurrentChat(tabId, parseSendAt(row.values.send_at), message);
    if (opened.foundByPhone && !String(row.values.zid || '').trim()) {
      const currentChat = await readCurrentChatInfo(tabId);
      if (currentChat?.zid) {
        row.values.zid = currentChat.zid;
        if (currentChat.display_name) row.values.display_name = currentChat.display_name;
      }
      fillIntermediatePhoneColumns(row.values);
    }
    if (String(row.values.zid || zid || '').trim()) {
      await saveContactMapping(row.values);
    }
    if (opened.foundByPhone) {
      await clickAddFriendIfAvailable(tabId);
    }
    const updatedRow = await updateQueueRow(row.id, {
      values: row.values,
      status: 'done',
      sentAt: Date.now(),
      error: ''
    });
    notifyGoogleSheetRow(updatedRow).catch(console.error);
    return;
  }

  let sentQid = '';
  if (message) {
    sentQid = await typeAndSendCurrentChat(tabId, message);
  }

  if (mediaId) {
    const data = await storageGet(['mediaStore']);
    const mediaStore = data.mediaStore || {};
    const mediaObj = mediaStore[mediaId];
    const base64Data = typeof mediaObj === 'string' ? mediaObj : mediaObj?.base64;
    if (base64Data) {
      sentQid = await pasteAndSendImageZalo(tabId, base64Data);
    }
  }
  if (opened.foundByPhone && !String(row.values.zid || '').trim()) {
    for (let i = 0; i < 5; i++) {
      await sleep(500);
      const currentChat = await readCurrentChatInfo(tabId);
      if (currentChat?.zid) {
        row.values.zid = currentChat.zid;
        if (currentChat.display_name) row.values.display_name = currentChat.display_name;
        break;
      }
    }
    fillIntermediatePhoneColumns(row.values);
  }
  
  // Lưu contact mapping sau khi gửi tin nhắn thành công
  if (String(row.values.zid || zid || '').trim()) {
    await saveContactMapping(row.values);
  }
  if (opened.foundByPhone) {
    await clickAddFriendIfAvailable(tabId);
  }

  const shouldWait = String(row.values.wait_reply || '').trim().toLowerCase() === 'x';
  if (sentQid) row.values.sent_qid = sentQid;
  const updatedRow = await updateQueueRow(row.id, {
    values: row.values,
    status: shouldWait ? 'wait_reply' : 'done',
    sentAt: Date.now(),
    error: ''
  });
  notifyGoogleSheetRow(updatedRow).catch(console.error);
}

/**
 * Trộn các tin nhắn phản hồi mới nhận vào dữ liệu hàng chờ của dòng.
 * Chỉ thêm tin nhắn mới chưa có trong danh sách cũ.
 * @param {Object} row - Dòng trong hàng chờ
 * @param {string[]} incomingItems - Mảng các tin nhắn phản hồi mới từ đối phương
 * @returns {void}
 */
function mergeReplies(row, incomingItems, replyLimit = DEFAULT_REPLY_COLLECTION_LIMIT) {
  const maxReplies = Math.max(0, Math.floor(Number(replyLimit) || 0));
  const existing = Array.isArray(row.replies) ? row.replies : [];
  if (!incomingItems || !incomingItems.length) {
    row.status = maxReplies > 0 && existing.length >= maxReplies ? 'done' : 'wait_reply';
    return false;
  }
  const seen = new Set(existing.map((item) => normalizeLookupText(item)));

  // Lọc chỉ lấy tin nhắn mới thực sự (chưa có trong existing)
  const newItems = incomingItems.filter(item => {
    const key = normalizeLookupText(item);
    return key && !seen.has(key);
  });

  // Nếu không có tin nhắn mới nào, giữ nguyên trạng thái
  if (newItems.length === 0) {
    row.status = maxReplies > 0 && existing.length >= maxReplies ? 'done' : 'wait_reply';
    return false;
  }

  for (const item of newItems) {
    existing.push(item);
    seen.add(normalizeLookupText(item));
    if (maxReplies > 0 && existing.length >= maxReplies) break;
  }
  row.replies = maxReplies > 0 ? existing.slice(0, maxReplies) : existing;
  row.values.replies = row.replies.join('\n');
  row.status = maxReplies > 0 && row.replies.length >= maxReplies ? 'done' : 'wait_reply';
  return true;
}

/**
 * Thực thi kiểm tra và thu thập tin nhắn phản hồi cho các dòng đang có trạng thái wait_reply.
 * @param {number} tabId - ID tab Zalo
 * @returns {Promise<void>}
 */
async function pollQueueReplies(tabId) {
  const queue = await loadQueue();
  const waitRows = Object.values(queue.byId).filter(
    (row) => row.sentAt && 
      String(row.values?.wait_reply || '').trim().toLowerCase() === 'x' && 
      row.status === 'wait_reply' && 
      (!row.error || isWebhookErrorMessage(row.error))
  );

  if (!waitRows.length) return;

  const current = await withZaloActionLock(() => readCurrentChatInfo(tabId));
  const currentZid = String(current?.zid || '').trim();
  const currentName = normalizeLookupText(current?.display_name || '');
  
  // Tìm xem cuộc trò chuyện hiện tại có khớp với dòng nào đang chờ reply không
  const row = waitRows.find((item) => {
    const zid = String(item.values?.zid || '').trim();
    const name = normalizeLookupText(item.values?.display_name || item.values?.name || '');
    return (zid && zid === currentZid) || (name && currentName && (currentName.includes(name) || name.includes(currentName)));
  });

  if (!row) {
    await saveWorkerState({ currentWait: null });
    return;
  }

  if (current?.tag) row.values.tag = current.tag;
  const currentWaitInfo = {
    rowId: row.id,
    zid: row.values?.zid || '',
    display_name: row.values?.display_name || row.values?.name || current?.display_name || '',
    tag: row.values?.tag || current?.tag || ''
  };

  await saveWorkerState({ currentWait: currentWaitInfo });

  try {
    const sentMessage = String(row.values.message || '').trim();
    const replyLimit = await getReplyCollectionLimit();
    const incoming = await withZaloActionLock(() => readIncomingMessages(tabId, sentMessage, replyLimit));
    const hasNewReplies = mergeReplies(row, incoming, replyLimit);
    
    const updatedRow = await updateQueueRow(row.id, {
      values: row.values,
      status: row.status,
      replies: row.replies
    });
    if (hasNewReplies) {
      notifyGoogleSheetRow(updatedRow).catch(console.error);
    }

    if (row.status === 'done') {
      await saveWorkerState({ currentWait: null });
    }
  } catch (err) {
    await saveWorkerState({ message: err?.message || 'Lỗi kiểm tra phản hồi.' });
  }
}

/**
 * Cập nhật dòng chờ phản hồi hiện tại dựa trên thay đổi hội thoại từ client UI.
 * @param {number} tabId - ID tab Zalo
 * @param {Object} current - Snapshot thông tin cuộc trò chuyện hiện tại của Zalo
 * @returns {Promise<Object>} Trạng thái tóm tắt hàng chờ
 */
async function updateCurrentWaitFromActiveChat(tabId, current) {
  if (current?.zid && (current.display_name || current.tag)) {
    await saveContactMapping({
      zid: current.zid,
      display_name: current.display_name || '',
      tag: current.tag || ''
    });
  }

  const state = await loadWorkerState();
  if (state.phase !== 'polling' && state.phase !== 'sending') {
    return getQueueSummary();
  }

  const queue = await loadQueue();
  const waitRows = Object.values(queue.byId).filter(
    (row) => row.sentAt && 
      String(row.values?.wait_reply || '').trim().toLowerCase() === 'x' && 
      row.status === 'wait_reply' && 
      (!row.error || isWebhookErrorMessage(row.error))
  );

  if (!waitRows.length) {
    await saveWorkerState({ currentWait: null });
    return getQueueSummary();
  }

  const currentZid = String(current?.zid || '').trim();
  const currentName = normalizeLookupText(current?.display_name || '');
  const row = waitRows.find((item) => {
    const zid = String(item.values?.zid || '').trim();
    const name = normalizeLookupText(item.values?.display_name || item.values?.name || '');
    return (zid && zid === currentZid) || (name && currentName && (currentName.includes(name) || name.includes(currentName)));
  });

  if (!row) {
    await saveWorkerState({ currentWait: null });
    return getQueueSummary();
  }

  if (current?.tag) row.values.tag = current.tag;
  const currentWaitInfo = {
    rowId: row.id,
    zid: row.values?.zid || currentZid,
    display_name: row.values?.display_name || row.values?.name || current?.display_name || '',
    tag: row.values?.tag || current?.tag || ''
  };
  await saveWorkerState({ currentWait: currentWaitInfo });

  try {
    const sentMessage = String(row.values.message || '').trim();
    const replyLimit = await getReplyCollectionLimit();
    const incoming = await readIncomingMessages(tabId, sentMessage, replyLimit);
    const hasNewReplies = mergeReplies(row, incoming, replyLimit);
    
    const updatedRow = await updateQueueRow(row.id, {
      values: row.values,
      status: row.status,
      replies: row.replies
    });
    if (hasNewReplies) {
      notifyGoogleSheetRow(updatedRow).catch(console.error);
    }

    if (row.status === 'done') {
      await saveWorkerState({ currentWait: null });
    }
  } catch (err) {
    await saveWorkerState({ message: err?.message || 'Lỗi khi cập nhật hội thoại.' });
  }

  return getQueueSummary();
}

/**
 * Tìm dòng tiếp theo cần gửi tin nhắn trong hàng chờ.
 * @param {Object} queue - Đối tượng hàng chờ
 * @param {number} now - Thời gian hiện tại dạng timestamp
 * @returns {Object|null} Dòng cần gửi hoặc null
 */
function findNextPendingRow(queue, now, skipIds = null) {
  return Object.values(queue.byId).find((row) => {
    if (skipIds?.has(row.id)) return false;
    if (row.status !== 'pending' || row.error) return false;
    const isReminder = String(row.values?.note || '').trim().toLowerCase() === 'reminder';
    if (isReminder) return true;
    const sendAt = parseSendAt(row.values?.send_at);
    return !sendAt || sendAt <= now;
  }) || null;
}

/**
 * Kiểm tra xem hàng chờ còn các tin nhắn hẹn giờ trong tương lai hay không.
 * @param {Object} queue - Đối tượng hàng chờ
 * @param {number} now - Thời gian hiện tại dạng timestamp
 * @returns {boolean}
 */
function hasScheduledPendingRows(queue, now) {
  return Object.values(queue.byId).some((row) => {
    if (row.status !== 'pending' || row.error) return false;
    const isReminder = String(row.values?.note || '').trim().toLowerCase() === 'reminder';
    if (isReminder) return false;
    const sendAt = parseSendAt(row.values?.send_at);
    return sendAt && sendAt > now;
  });
}

function hasSkippedRetryRows(queue, now, skipIds) {
  if (!skipIds?.size) return false;
  return Object.values(queue.byId).some((row) => {
    if (!skipIds.has(row.id)) return false;
    if (row.status !== 'pending' || row.error) return false;
    const isReminder = String(row.values?.note || '').trim().toLowerCase() === 'reminder';
    if (isReminder) return true;
    const sendAt = parseSendAt(row.values?.send_at);
    return !sendAt || sendAt <= now;
  });
}

/**
 * Luồng lặp tuần hoàn của worker xử lý hàng chờ.
 * @param {number} tabId - ID tab Zalo
 * @returns {Promise<void>}
 */
async function runWorkerLoop(tabId) {
  const zaloTab = await ensureZaloTab();
  if (!zaloTab?.id) throw new Error('Không mở được tab Zalo.');

  await withZaloActionLock(() => attachDebugger(zaloTab.id));
  const retryAfterRoundIds = new Set();
  let sentCount = 0;
  
  try {
    while (true) {
      const state = await loadWorkerState();
      if (!state.running || state.phase === 'paused') {
        break;
      }

      const queue = await loadQueue();
      const now = Date.now();
      const nextPending = findNextPendingRow(queue, now, retryAfterRoundIds);

      if (nextPending) {
        // Cập nhật trạng thái worker sang gửi tin
        await saveWorkerState({ phase: 'sending', currentRowId: nextPending.id, message: '' });
        
        try {
          await updateQueueRow(nextPending.id, { status: 'sending' });
          await withZaloActionLock(() => sendQueueRow(zaloTab.id, nextPending));
          sentCount++;

          // Nghỉ sau mỗi 10 lượt gửi để tránh bị Zalo khóa tài khoản chống spam
          if (sentCount % 10 === 0) {
            const restTime = Math.floor(Math.random() * 5000) + 10000; // Nghỉ từ 10 đến 15 giây
            await saveWorkerState({ message: `Đã gửi thành công ${sentCount} tin. Nghỉ ngơi ${Math.round(restTime / 1000)} giây chống quét bot...` });
            await sleep(restTime);
          } else {
            // Delay bình thường giữa các lần gửi tin nhắn cho tự nhiên
            const normalDelay = Math.floor(Math.random() * 2000) + 2000; // Delay từ 2 đến 4 giây
            await sleep(normalDelay);
          }
        } catch (err) {
          if (isSearchNotFoundError(err)) {
            // Lỗi không tìm thấy người nhận là lỗi tạm thời
            retryAfterRoundIds.add(nextPending.id);
            await updateQueueRow(nextPending.id, { status: 'pending', error: '' });
            await saveWorkerState({ message: `Chưa tìm thấy người nhận, sẽ thử lại sau khi đi hết hàng chờ.` });
          } else {
            // Các lỗi khác ghi nhận lỗi thực tế
            await updateQueueRow(nextPending.id, { status: 'error', error: err?.message || String(err) });
          }
        }
        continue;
      }

      if (hasSkippedRetryRows(queue, now, retryAfterRoundIds)) {
        await saveWorkerState({ phase: 'sending', currentRowId: null, message: 'Đã đi hết hàng chờ, chờ 5 giây rồi thử lại các dòng chưa tìm thấy.' });
        await sleep(RETRY_SEND_DELAY_MS);
        retryAfterRoundIds.clear();
        continue;
      }

      // Nếu không có tin nhắn chờ gửi tức thời, kiểm tra các tin hẹn giờ tương lai
      if (hasScheduledPendingRows(queue, now)) {
        await saveWorkerState({ phase: 'sending', currentRowId: null, message: 'Đang chờ đến giờ gửi tin tiếp theo.' });
        await sleep(RETRY_SEND_DELAY_MS);
        continue;
      }

      // Nếu không còn tin nhắn chờ gửi, chuyển sang chế độ theo dõi phản hồi
      const waitRows = Object.values(queue.byId).filter(
        (row) => row.sentAt && 
          String(row.values?.wait_reply || '').trim().toLowerCase() === 'x' && 
          row.status === 'wait_reply' && 
          (!row.error || isWebhookErrorMessage(row.error))
      );

      if (waitRows.length > 0) {
        await saveWorkerState({ phase: 'polling', currentRowId: null });
        await pollQueueReplies(zaloTab.id);
        await sleep(BATCH_POLL_DELAY_MS);
        continue;
      }

      // Kết thúc loop khi không còn việc gì làm
      break;
    }

    // Sau khi thoát loop do hoàn tất hoặc pause
    const finalState = await loadWorkerState();
    if (finalState.running && finalState.phase !== 'paused') {
      await saveWorkerState({ running: false, phase: 'idle', currentRowId: null, currentWait: null, message: 'Hoàn thành xử lý hàng chờ.' });
    }
  } finally {
    await withZaloActionLock(() => detachDebugger(zaloTab.id));
  }
}

/**
 * Kích hoạt khởi động worker xử lý hàng chờ.
 * @param {number} [waitReplyTabId] - ID tab tùy chọn cho luồng phản hồi
 * @returns {Promise<Object>} Trạng thái worker sau khởi động
 */
async function startWorker(waitReplyTabId) {
  const state = await loadWorkerState();
  if (workerRuntime.runPromise && state.running && state.phase !== 'paused') {
    throw new Error('Worker đang chạy.');
  }

  workerRuntime.waitReplyTabId = waitReplyTabId || null;
  
  const queue = await loadQueue();
  let queueUpdated = false;
  Object.values(queue.byId).forEach(row => {
    if (row.status === 'error') {
      row.status = 'pending';
      row.error = '';
      queueUpdated = true;
    }
  });
  if (queueUpdated) await saveQueue(queue);
  const nextState = await saveWorkerState({ running: true, phase: 'sending', currentRowId: null, message: '' });
  
  const zaloTab = await ensureZaloTab();
  if (!zaloTab?.id) throw new Error('Không mở được tab Zalo.');

  // Chạy loop bất đồng bộ
  workerRuntime.runPromise = runWorkerLoop(zaloTab.id).catch(async (err) => {
    console.error('Lỗi thực thi worker:', err);
    await saveWorkerState({ running: false, phase: 'idle', currentRowId: null, message: `Lỗi worker: ${err?.message || err}` });
  });

  return nextState;
}

/**
 * Tạm dừng hoạt động của worker.
 * @returns {Promise<Object>} Trạng thái worker sau khi tạm dừng
 */
async function pauseWorker() {
  const state = await loadWorkerState();
  if (!state.running) return state;

  const nextState = await saveWorkerState({ phase: 'paused', message: 'Đã tạm dừng hoạt động.' });
  await withZaloActionLock(detachAllDebuggers);
  return nextState;
}

/**
 * Dừng hẳn hoạt động của worker và đóng các dòng chờ phản hồi.
 * @returns {Promise<Object>} Trạng thái worker sau khi dừng
 */
async function stopWorker() {
  const nextState = await saveWorkerState({ running: false, phase: 'idle', currentRowId: null, currentWait: null, message: 'Đã dừng hoạt động hàng chờ.' });
  await withZaloActionLock(detachAllDebuggers);
  
  // Đưa tất cả các dòng wait_reply sang done
  const queue = await loadQueue();
  let changed = false;
  for (const row of Object.values(queue.byId)) {
    if (row.status === 'wait_reply' || row.status === 'sent') {
      row.status = 'done';
      row.values.replies = (row.replies || []).join('\n');
      row.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) {
    await saveQueue(queue);
  }
  
  return nextState;
}
