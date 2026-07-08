// Contact mapping, preview mapping, and visible Zalo contact sync helpers.
async function saveZaloContact(result) {
  // Persist latest known zid by normalized phone number for later reuse/export.
  if (!result?.phone || !result?.zid) return;

  const data = await chrome.storage.local.get(['zaloContacts']);
  const zaloContacts = data.zaloContacts || {};
  zaloContacts[result.phone] = {
    zid: result.zid,
    name: result.name || '',
    phone: result.phone,
    sms: result.sms || '',
    addFriendState: result.addFriendState || '',
    avatar: result.avatar || '',
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ zaloContacts });
  await saveContactMapping(result);
}

/**
 * Tải bản đồ danh bạ từ chrome.storage.local và tự động chạy hàm dọn dẹp dữ liệu lỗi (nếu có).
 * Nếu có sự thay đổi trong quá trình dọn dẹp, lưu lại ngay lập tức vào storage.
 * 
 * @returns {Promise<Object>} Bản đồ danh bạ đã được chuẩn hóa và làm sạch
 */
async function loadContactMap() {
  const data = await storageGet([CONTACT_MAP_STORAGE_KEY]);
  const contactMap = data[CONTACT_MAP_STORAGE_KEY] || { byZid: {}, byName: {}, byPhone: {} };

  if (sanitizeContactMap(contactMap)) {
    await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
  }
  return contactMap;
}

/**
 * Lưu ánh xạ liên hệ Zalo (ZID, tên hiển thị, tag, sđt) vào cơ sở dữ liệu local.
 * Tự động trích xuất số điện thoại từ tên thô trước khi làm sạch để điền vào sys_phone nếu trống.
 * 
 * @param {Object} contact - Thông tin liên hệ cần lưu
 * @returns {Promise<void>}
 */
async function saveContactMapping(contact) {
  const zid = String(contact?.zid || '').trim();
  const rawName = contact?.display_name || contact?.name || '';
  const name = cleanZaloDisplayName(rawName);
  const phone = normalizePhone(contact?.phone);
  const phoneKey = normalizePhoneKey(phone);
  // Trích xuất số điện thoại từ tên thô trước khi làm sạch tên
  const namePhoneKey = extractPhoneKeyFromText(rawName);
  if (!zid || (!name && !phoneKey && !namePhoneKey)) return;

  const contactMap = await loadContactMap();
  const record = {
    zid,
    display_name: name,
    tag: contact?.tag || '',
    tag_color: contact?.tag_color || '',
    phone,
    // sys_phone ưu tiên số điện thoại chính thức, nếu không có thì lấy số trích xuất từ tên
    sys_phone: phoneKey || namePhoneKey || '',
    name_phone_normalized: namePhoneKey,
    '_a/c': contact?.['_a/c'] || parseDisplayNameParts(name)['_a/c'],
    _name: contact?._name || parseDisplayNameParts(name)._name,
    avatar: contact?.avatar || '',
    updatedAt: Date.now()
  };
  upsertContactRecord(contactMap, record);
  await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
}

/**
 * Lưu/Cập nhật hàng loạt ánh xạ liên hệ từ mảng các dòng dữ liệu.
 * Tự động trích xuất số điện thoại từ tên thô trước khi làm sạch để điền vào sys_phone nếu trống.
 * 
 * @param {Object[]} rows - Danh sách các dòng dữ liệu liên hệ (có thể từ file import hoặc từ UI)
 * @returns {Promise<void>}
 */
async function saveContactMappingsFromRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return;

  const contactMap = await loadContactMap();
  let changed = false;

  rows.forEach((row) => {
    const values = row?.values || row || {};
    fillIntermediatePhoneColumns(values);
    const zid = String(values.zid || '').trim();
    const rawName = values.display_name || values.name || '';
    const name = cleanZaloDisplayName(rawName);
    const phone = normalizePhone(values.phone);
    const namePhoneKey = values._name_phone_normalized || extractPhoneKeyFromText(rawName);
    const phoneKey = values.sys_phone || normalizePhoneKey(phone) || namePhoneKey || '';
    if (!zid || (!name && !phoneKey && !namePhoneKey)) return;

    const record = {
      zid,
      display_name: name,
      tag: values.tag || '',
      tag_color: values.tag_color || '',
      phone,
      sys_phone: phoneKey,
      name_phone_normalized: namePhoneKey,
      '_a/c': values['_a/c'] || parseDisplayNameParts(name)['_a/c'],
      _name: values._name || parseDisplayNameParts(name)._name,
      avatar: values.avatar || '',
      updatedAt: Date.now()
    };
    upsertContactRecord(contactMap, record);
    changed = true;
  });

  if (changed) await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
}

function normalizeTagKeyForColor(tag) {
  return String(tag || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function updateTagColorInContactMap(contactMap, tagText, tagColor) {
  const tagKey = normalizeTagKeyForColor(tagText);
  const seen = new Set();
  const updateRecord = (record) => {
    if (!record || seen.has(record)) return;
    seen.add(record);
    if (normalizeTagKeyForColor(record.tag) === tagKey) {
      record.tag = tagText;
      record.tag_color = tagColor;
      record.updatedAt = Date.now();
    }
  };

  Object.values(contactMap.byZid || {}).forEach(updateRecord);
  Object.values(contactMap.byName || {}).forEach(updateRecord);
  Object.values(contactMap.byPhone || {}).forEach(updateRecord);
}

async function tagContactsByPhones(phones, tag, color) {
  const tagText = String(tag || '').trim();
  const tagColor = String(color || '').trim();
  // Cho phép tag rỗng (xoá tag), nhưng phải có màu hợp lệ
  if (tagColor && !/^#[0-9a-f]{6}$/i.test(tagColor)) throw new Error('Màu tag không hợp lệ.');
  if (!Array.isArray(phones) || !phones.length) throw new Error('Thiếu danh sách SĐT.');

  const contactMap = await loadContactMap();
  const seen = new Set();
  let matched = 0;
  let created = 0;
  const invalid = [];

  phones.forEach((phone) => {
    const phoneKey = normalizePhoneKey(phone);
    if (!phoneKey) {
      invalid.push(String(phone || '').trim());
      return;
    }
    if (seen.has(phoneKey)) return;
    seen.add(phoneKey);

    const existing = contactMap.byPhone?.[phoneKey] || {};
    if (existing.sys_phone || existing.phone || existing.zid) matched += 1;
    else created += 1;

    upsertContactRecord(contactMap, {
      ...existing,
      tag: tagText,
      tag_color: tagColor,
      phone: existing.phone || '',
      sys_phone: phoneKey,
      updatedAt: Date.now()
    });
  });

  updateTagColorInContactMap(contactMap, tagText, tagColor);

  await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
  return {
    updated: matched + created,
    matched,
    created,
    invalid,
    contacts: await getStoredContacts()
  };
}

async function tagContactByIdentity(identity, tag, color) {
  const tagText = String(tag || '').trim();
  const tagColor = String(color || '').trim();
  if (tagColor && !/^#[0-9a-f]{6}$/i.test(tagColor)) throw new Error('Màu tag không hợp lệ.');

  const phoneKey = normalizePhoneKey(identity?.phone || identity?.sys_phone);
  const zid = String(identity?.zid || '').trim();
  const displayName = cleanZaloDisplayName(identity?.display_name || identity?.name || '');
  const nameKey = normalizeLookupText(displayName);
  if (!phoneKey && !zid && !nameKey) throw new Error('Thiếu định danh liên hệ.');

  const contactMap = await loadContactMap();
  const existing = (phoneKey && contactMap.byPhone?.[phoneKey]) ||
    (zid && contactMap.byZid?.[zid]) ||
    (nameKey && contactMap.byName?.[nameKey]) ||
    {};

  if (!existing.zid && !zid && !phoneKey) throw new Error('Liên hệ chưa có SĐT hoặc Zalo ID để cập nhật tag.');

  upsertContactRecord(contactMap, {
    ...existing,
    zid: zid || existing.zid || '',
    display_name: displayName || existing.display_name || existing.name || '',
    tag: tagText,
    tag_color: tagColor,
    phone: existing.phone || '',
    sys_phone: phoneKey || existing.sys_phone || '',
    updatedAt: Date.now()
  });
  if (tagText) updateTagColorInContactMap(contactMap, tagText, tagColor);

  await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
  return {
    updated: 1,
    contacts: await getStoredContacts()
  };
}

async function findMappedContact(values) {
  fillIntermediatePhoneColumns(values);
  const nameToUse = values?.display_name || values?.name;
  const nameKey = normalizeLookupText(nameToUse);
  const phoneKey = normalizePhoneKey(values?.phone);
  const sysPhoneKey = values?.sys_phone;
  const namePhoneKey = values?._name_phone_normalized || extractPhoneKeyFromText(nameToUse);
  if (!nameKey && !phoneKey && !sysPhoneKey && !namePhoneKey) return null;

  const contactMap = await loadContactMap();
  const data = await storageGet(['zaloContacts']);
  return (phoneKey && contactMap.byPhone?.[phoneKey]) ||
    (sysPhoneKey && contactMap.byPhone?.[sysPhoneKey]) ||
    (namePhoneKey && contactMap.byPhone?.[namePhoneKey]) ||
    (nameKey && contactMap.byName?.[nameKey]) ||
    findLegacyContactByPhoneKey(data.zaloContacts, phoneKey) ||
    findLegacyContactByPhoneKey(data.zaloContacts, sysPhoneKey) ||
    findLegacyContactByPhoneKey(data.zaloContacts, namePhoneKey) ||
    null;
}

async function mapRowsForPreview(rows) {
  // Resolve zid from contact map for rows that will be sent. Done rows are
  // skipped because phone-key lookup may match the wrong contact, producing
  // a zid that corrupts the contact database when saved later.
  const mappedRows = [];
  for (const row of rows || []) {
    const values = fillIntermediatePhoneColumns({ ...row });
    const isDone = String(values._status || '').toLowerCase() === 'done';
    const currentZid = String(values.zid || '').trim();
    if (!currentZid && !isDone) {
      const mapped = await findMappedContact(values);
      if (mapped?.zid) {
        values.zid = mapped.zid;
        if (!values.display_name && (mapped.display_name || mapped.name)) values.display_name = mapped.display_name || mapped.name;
        if (!values.phone && mapped.phone) values.phone = mapped.phone;
        fillIntermediatePhoneColumns(values);
      }
    }
    mappedRows.push(values);
  }
  return mappedRows;
}

async function buildPreviewPayload(payload) {
  const normalizedPayload = normalizeBatchColumns(payload?.headers || [], payload?.rows || []);
  const headers = normalizedPayload.headers.slice();
  if (!headers.includes('zid')) headers.push('zid');
  if (!headers.includes('send_at')) headers.push('send_at');
  if (!headers.includes(WAIT_REPLY_BATCH_COLUMN)) headers.push(WAIT_REPLY_BATCH_COLUMN);
  INTERMEDIATE_BATCH_COLUMNS.forEach((name) => {
    if (!headers.includes(name)) headers.push(name);
  });
  OUTPUT_BATCH_COLUMNS.forEach((name) => {
    if (!headers.includes(name)) headers.push(name);
  });
  return {
    mode: normalizeBatchMode(payload?.mode),
    headers,
    rows: await mapRowsForPreview(normalizedPayload.rows || []),
    importedAt: payload?.importedAt || Date.now()
  };
}

async function getStoredContacts() {
  const contactMap = await loadContactMap();
  const data = await storageGet(['zaloContacts']);
  return getContactRecords(contactMap, data.zaloContacts || {});
}

async function scrollSidebarAndCollect(tabId) {
  // Scrolls the Zalo sidebar conversation list from top to bottom in
  // viewport-height steps, collecting every rendered .msg-item at each
  // position. Zalo uses virtual scrolling so only a small window of items
  // exists in the DOM at any time. Returns a deduplicated array of contact
  // objects. Scrolls back to top when finished.
  const scriptResults = await scriptingExecuteScript({
    target: { tabId },
    func: async () => {
      const normalize = (text) => (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const stripTags = (text) => {
        let value = normalize(text).replace(/\s+Công việc(?:\s.*)?$/i, '').trim();
        const phones = [...value.matchAll(/(?:\+?84|0)?[\d\s().-]{8,}/g)];
        if (phones.length) {
          const last = phones[phones.length - 1];
          const end = last.index + last[0].length;
          const tail = value.slice(end).trim().toLowerCase();
          if (tail === 'công việc' || tail.startsWith('công việc ')) value = value.slice(0, end).trim();
        }
        return value;
      };

      const collectVisible = () => {
        return [...document.querySelectorAll('.msg-item[anim-data-id]')].map((el) => {
          const zid = el.getAttribute('anim-data-id');
          const rawTitle = (
            el.querySelector('.conv-item-title__name')?.innerText ||
            el.querySelector('[class*="title"]')?.innerText ||
            ''
          );
          const display_name = stripTags(rawTitle);
          const itemText = normalize(el.innerText || el.textContent || '');
          const tag = /\bCông việc\b/i.test(itemText) ? 'Công việc' : '';
          
          // Trích xuất đường dẫn ảnh đại diện (avatar) của liên hệ
          const imgEl = el.querySelector('img');
          const avatar = imgEl ? imgEl.src : '';

          return { zid, display_name, name: display_name, tag, phone: '', avatar };
        }).filter((item) => item.zid && item.display_name);
      };

      // Find the scrollable sidebar container (parent of .msg-item list)
      const firstItem = document.querySelector('.msg-item[anim-data-id]');
      if (!firstItem) return { contacts: collectVisible(), scrolled: false };

      let container = firstItem.parentElement;
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        if (container.scrollHeight > container.clientHeight + 10 &&
          (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
          break;
        }
        container = container.parentElement;
      }
      if (!container || container === document.body) {
        return { contacts: collectVisible(), scrolled: false };
      }

      const seen = new Map();
      const addItems = (items) => {
        items.forEach((item) => {
          if (!seen.has(item.zid)) seen.set(item.zid, item);
        });
      };

      // Scroll to top first
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 300));
      addItems(collectVisible());

      const step = container.clientHeight;
      const maxScrolls = Math.ceil(container.scrollHeight / step) + 5;

      for (let i = 0; i < maxScrolls; i++) {
        const prevTop = container.scrollTop;
        container.scrollTop += step;
        await new Promise((r) => setTimeout(r, 350));

        addItems(collectVisible());

        // Stop if scroll position didn't change (reached bottom)
        if (Math.abs(container.scrollTop - prevTop) < 10) break;
      }

      // Scroll back to top
      container.scrollTop = 0;

      const resizeAvatar = (url) => {
        return new Promise((resolve) => {
          if (!url) return resolve('');
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
            } catch (err) {
              resolve(url);
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
              } catch (err) {
                resolve(url);
              }
            };
            imgFallback.onerror = () => {
              resolve(url);
            };
            imgFallback.src = url;
          };
          img.src = url;
        });
      };

      const contactsArray = [...seen.values()];
      for (const item of contactsArray) {
        if (item.avatar && item.avatar.startsWith('http')) {
          item.avatar = await resizeAvatar(item.avatar);
        }
      }

      return { contacts: contactsArray, scrolled: true };
    }
  });
  const result = scriptResults[0]?.result;
  return {
    contacts: Array.isArray(result?.contacts) ? result.contacts : [],
    scrolled: !!result?.scrolled
  };
}

async function syncVisibleContacts() {
  // Scrolls through the entire Zalo sidebar to collect all contacts rendered
  // by the virtual list, then persists them into the contact map.
  const zaloTab = await ensureZaloTab();
  if (!zaloTab?.id) throw new Error('Khong mo duoc tab Zalo.');

  await tabsUpdate(zaloTab.id, { active: true });
  await waitForTabLoad(zaloTab.id);
  await sleep(500);

  const { contacts, scrolled } = await scrollSidebarAndCollect(zaloTab.id);

  // Also auto-update display_name/avatar for contacts whose stored name or avatar differs
  // from what Zalo currently shows.
  const contactMap = await loadContactMap();
  for (const item of contacts) {
    const stored = contactMap.byZid?.[item.zid];
    if (stored) {
      const domName = cleanZaloDisplayName(item.display_name || '');
      const storedName = cleanZaloDisplayName(stored.display_name || stored.name || '');
      const domAvatar = item.avatar || '';
      const storedAvatar = stored.avatar || '';
      if (domName && storedName && domName !== storedName) {
        item._nameChanged = true;
      }
      if (domAvatar && storedAvatar && domAvatar !== storedAvatar) {
        item._avatarChanged = true;
      }
    }
  }

  await saveContactMappingsFromRows(contacts);
  return {
    count: contacts.length,
    scrolled,
    contacts: await getStoredContacts()
  };
}

/**
 * Xóa sạch toàn bộ dữ liệu danh bạ liên hệ Zalo đã lưu trong bộ nhớ local storage.
 * @returns {Promise<Array>} Trả về mảng rỗng biểu thị danh bạ sau khi đã xóa sạch.
 */
async function clearContacts() {
  await storageRemove([CONTACT_MAP_STORAGE_KEY, 'zaloContacts']);
  return [];
}
/**
 * Cập nhật màu sắc cho một nhãn (tag) trên toàn bộ danh bạ.
 * Tìm kiếm tất cả các liên hệ có nhãn khớp và đổi màu tag của chúng.
 *
 * @param {string} tag - Tên nhãn cần đổi màu
 * @param {string} color - Mã màu HEX mới (ví dụ: #ffffff)
 * @returns {Promise<Object>} Trả về danh sách liên hệ sau khi cập nhật
 */
async function updateTagColor(tag, color) {
  const tagText = String(tag || '').trim();
  const tagColor = String(color || '').trim();
  if (!tagText) throw new Error('Thiếu tên nhãn.');
  if (!/^#[0-9a-f]{6}$/i.test(tagColor)) throw new Error('Màu nhãn không hợp lệ.');

  const contactMap = await loadContactMap();
  let changed = false;

  const before = JSON.stringify(contactMap);
  updateTagColorInContactMap(contactMap, tagText, tagColor);
  changed = before !== JSON.stringify(contactMap);

  // Cập nhật Zalo Contacts cũ
  const data = await chrome.storage.local.get(['zaloContacts']);
  const zaloContacts = data.zaloContacts || {};
  Object.values(zaloContacts).forEach((contact) => {
    if (contact && normalizeTagKeyForColor(contact.tag) === normalizeTagKeyForColor(tagText)) {
      contact.tag = tagText;
      contact.tag_color = tagColor;
      contact.updatedAt = Date.now();
      changed = true;
    }
  });

  if (changed) {
    await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
    await chrome.storage.local.set({ zaloContacts });
  }

  return {
    ok: true,
    contacts: await getStoredContacts()
  };
}

/**
 * Xoá một tag khỏi toàn bộ danh bạ.
 */
async function deleteTagFromAllContacts(tag) {
  const tagText = String(tag || '').trim();
  if (!tagText) throw new Error('Thiếu tên nhãn cần xoá.');

  const contactMap = await loadContactMap();
  let changed = false;

  const tagKey = normalizeTagKeyForColor(tagText);
  const seen = new Set();
  const updateRecord = (record) => {
    if (!record || seen.has(record)) return;
    seen.add(record);
    if (normalizeTagKeyForColor(record.tag) === tagKey) {
      record.tag = '';
      record.tag_color = '';
      record.updatedAt = Date.now();
      changed = true;
    }
  };

  Object.values(contactMap.byZid || {}).forEach(updateRecord);
  Object.values(contactMap.byName || {}).forEach(updateRecord);
  Object.values(contactMap.byPhone || {}).forEach(updateRecord);

  const data = await chrome.storage.local.get(['zaloContacts']);
  const zaloContacts = data.zaloContacts || {};
  Object.values(zaloContacts).forEach((contact) => {
    if (contact && normalizeTagKeyForColor(contact.tag) === tagKey) {
      contact.tag = '';
      contact.tag_color = '';
      contact.updatedAt = Date.now();
      changed = true;
    }
  });

  if (changed) {
    await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
    await chrome.storage.local.set({ zaloContacts });
  }

  return {
    ok: true,
    contacts: await getStoredContacts()
  };
}

/**
 * Xoá một liên hệ khỏi danh bạ theo số điện thoại.
 * @param {string} phone - Số điện thoại cần xoá
 * @returns {Promise<{ok: boolean, contacts: Object[]}>}
 */
async function deleteContactByPhone(phone) {
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey) throw new Error('Số điện thoại không hợp lệ.');

  const contactMap = await loadContactMap();
  let changed = false;

  // Tìm và xoá record từ byPhone
  const record = contactMap.byPhone?.[phoneKey];
  if (record) {
    const zid = record.zid;
    const nameKey = normalizeLookupText(record.display_name || record.name || '');

    // Xoá khỏi byPhone
    delete contactMap.byPhone[phoneKey];
    // Xoá khỏi byZid
    if (zid && contactMap.byZid?.[zid]) delete contactMap.byZid[zid];
    // Xoá khỏi byName
    if (nameKey && contactMap.byName?.[nameKey]) delete contactMap.byName[nameKey];
    changed = true;
  }

  // Xoá từ zaloContacts legacy
  const data = await chrome.storage.local.get(['zaloContacts']);
  const zaloContacts = data.zaloContacts || {};
  if (zaloContacts[phoneKey]) {
    delete zaloContacts[phoneKey];
    changed = true;
  }

  if (changed) {
    await storageSet({ [CONTACT_MAP_STORAGE_KEY]: contactMap });
    await chrome.storage.local.set({ zaloContacts });
  }

  return {
    ok: true,
    contacts: await getStoredContacts()
  };
}
