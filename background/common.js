// Shared normalization and batch key helpers used by every background module.
function normalizeBatchMode(mode) {
  return 'wait_reply';
}

function getBatchStorageKey(mode) {
  mode = normalizeBatchMode(mode);
  return mode === 'wait_reply' ? BATCH_STORAGE_KEY : `${BATCH_STORAGE_KEY}_${mode}`;
}

function getPreviewImportKey(mode) {
  mode = normalizeBatchMode(mode);
  return mode === 'wait_reply' ? 'pendingBatchImport' : `pendingBatchImport_${mode}`;
}

async function withZaloActionLock(fn) {
  if (zaloActionLock.busy) {
    await new Promise((resolve) => zaloActionLock.queue.push(resolve));
  }
  zaloActionLock.busy = true;
  try {
    return await fn();
  } finally {
    zaloActionLock.busy = false;
    const next = zaloActionLock.queue.shift();
    if (next) next();
  }
}

function normalizeLookupText(value) {
  return cleanZaloDisplayName(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Zalo can append conversation labels such as "Công việc" to header/sidebar
// text. If this leaks into display_name, name matching fails. Keep all matching
// and persistence paths going through cleanZaloDisplayName().
function stripZaloTags(value) {
  const tags = ['Công việc'];
  let text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  tags.forEach((tag) => {
    text = text.replace(new RegExp(`\\s+${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim();
  });
  return text;
}

function extractZaloTag(value) {
  const text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const tags = ['Công việc'];
  return tags.find((tag) => new RegExp(`(^|\\s)${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(text)) || '';
}

function cleanZaloDisplayName(value) {
  let text = stripZaloTags(value);
  const phoneMatches = [...text.matchAll(/(?:\+?84|0)?[\d\s().-]{8,}/g)];
  if (phoneMatches.length) {
    const last = phoneMatches[phoneMatches.length - 1];
    const end = last.index + last[0].length;
    const tail = text.slice(end).trim();
    if (tail && normalizeLookupTextTag(tail)) {
      text = text.slice(0, end).trim();
    }
  }
  return stripZaloTags(text);
}

function normalizeLookupTextTag(value) {
  const text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return ['công việc'].some((tag) => text === tag || text.startsWith(`${tag} `));
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').trim();
}

function normalizePhoneKey(value) {
  let phone = normalizePhone(value).replace(/^\+/, '');
  if (phone.startsWith('84')) phone = phone.slice(2);
  while (phone.startsWith('0')) phone = phone.slice(1);
  return phone.length === 9 ? phone : '';
}

function extractPhoneKeyFromText(value) {
  const text = String(value || '');
  const matches = text.match(/(?:^|[^\d])(?:\+?84|0)?[\d\s().-]{8,}(?=$|[^\d])/g) || [];
  for (const rawMatch of matches) {
    const match = rawMatch.replace(/^[^\d+]*/, '').trim();
    const phoneKey = normalizePhoneKey(match);
    if (phoneKey) return phoneKey;
  }
  return '';
}

function parseDisplayNameParts(value) {
  const text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const match = text.match(/^.+?\s+-\s+([AC])\s+(.+?)\s+-\s+.+$/i);
  if (!match) return { '_a/c': 'bạn', _name: '' };
  return {
    '_a/c': match[1].toUpperCase() === 'A' ? 'anh' : 'chị',
    _name: match[2].trim()
  };
}

/**
 * Điền các cột trung gian hữu ích cho hàng chờ tin nhắn và đồng bộ liên hệ.
 * Hàm này trích xuất và chuẩn hóa số điện thoại, tag nhãn, vai xưng hô và tên riêng của liên hệ.
 * Nếu cột số điện thoại chính thức (phone) trống, sys_phone sẽ tự động lấy số điện thoại trích xuất từ tên hiển thị.
 * Đồng thời bỏ qua việc trích xuất đối với các cuộc hội thoại hệ thống (My Documents, Truyền file, Zalo...).
 * 
 * @param {Object} values - Đối tượng chứa thông tin liên hệ (display_name/name, phone, v.v.)
 * @returns {Object} Đối tượng values sau khi đã điền đầy đủ các cột trung gian
 */
function fillIntermediatePhoneColumns(values) {
  const rawDisplayName = values.display_name || values.name || '';
  const isSystemChat = ['my documents', 'truyền file', 'cloud của tôi', 'zalo'].includes(rawDisplayName.toLowerCase().trim());
  if (!values.tag && !isSystemChat) values.tag = extractZaloTag(rawDisplayName);

  // Trích xuất số điện thoại từ tên thô trước khi thực hiện làm sạch tên
  const namePhoneKey = isSystemChat ? '' : extractPhoneKeyFromText(rawDisplayName);
  values._name_phone_normalized = namePhoneKey;

  if (values.display_name) values.display_name = cleanZaloDisplayName(values.display_name);
  if (values.name) values.name = cleanZaloDisplayName(values.name);

  // sys_phone là ID đã xử lý, lấy từ sys_phone có sẵn, phone CSV, hoặc số trong tên.
  values.sys_phone = isSystemChat ? '' : (normalizePhoneKey(values.sys_phone) || normalizePhoneKey(values.phone) || namePhoneKey || '');

  const parsedName = isSystemChat ? { '_a/c': 'bạn', _name: '' } : parseDisplayNameParts(values.display_name || values.name);
  values['_a/c'] = parsedName['_a/c'];
  values._name = parsedName._name;
  return values;
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

function isRowDueToSend(row, now = Date.now()) {
  const sendAt = parseSendAt(row?.values?.send_at);
  return !sendAt || sendAt <= now;
}

function normalizeBatchHeaderName(header) {
  const value = String(header || '').replace(/^\ufeff/, '').replace(/\u00a0/g, ' ').trim();
  const lower = value.toLowerCase();
  const known = {
    name: 'name',
    zid: 'zid',
    phone: 'phone',
    send_at: 'send_at',
    note: 'note',
    wait_reply: 'wait_reply',
    message: 'message',
    display_name: 'display_name',
    tag: 'tag',
    sys_phone: 'sys_phone',
    replies: 'replies',
    error: 'error'
  };
  return known[lower] || value;
}

function normalizeBatchColumns(headers, rows) {
  const normalizedHeaders = [];
  const headerMap = new Map();
  (headers || []).forEach((header) => {
    const normalized = normalizeBatchHeaderName(header);
    if (!normalized) return;
    if (!normalizedHeaders.includes(normalized)) normalizedHeaders.push(normalized);
    headerMap.set(header, normalized);
  });
  const normalizedRows = (rows || []).map((row) => {
    const next = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalized = headerMap.get(key) || normalizeBatchHeaderName(key);
      if (!normalized) return;
      next[normalized] = value;
    });
    return next;
  });
  return { headers: normalizedHeaders, rows: normalizedRows };
}

function findLegacyContactByPhoneKey(zaloContacts, phoneKey) {
  if (!zaloContacts || !phoneKey) return null;
  const direct = zaloContacts[phoneKey];
  if (direct) return direct;

  return Object.entries(zaloContacts).find(([key, contact]) => {
    return normalizePhoneKey(contact?.phone || key) === phoneKey;
  })?.[1] || null;
}

/**
 * Chuyển đổi bản đồ lưu trữ danh bạ thành danh sách mảng phẳng để phục vụ giao diện hiển thị.
 * Tự động hợp nhất dữ liệu từ contactMap và danh bạ zaloContacts cũ.
 * Đồng thời loại bỏ các trường thừa/sai khỏi các cuộc hội thoại hệ thống (My Documents, Truyền file...).
 * 
 * @param {Object} contactMap - Bản đồ lưu trữ danh bạ hiện tại (byZid, byName, byPhone)
 * @param {Object} [zaloContacts={}] - Bản đồ lưu trữ danh bạ zalo cũ (nếu có)
 * @returns {Object[]} Danh sách các liên hệ đã được chuẩn hóa và hợp nhất
 */
function getContactRecords(contactMap, zaloContacts = {}) {
  const records = new Map();
  const addRecord = (contact) => {
    const recordKey = contact?.zid ? `zid:${contact.zid}` : (contact?.sys_phone ? `phone:${contact.sys_phone}` : '');
    if (!recordKey) return;
    const existing = records.get(recordKey) || {};
    const rawDisplayName = contact.display_name || contact.name || existing.display_name || existing.name || '';
    const displayName = cleanZaloDisplayName(rawDisplayName);
    const isSystemChat = ['my documents', 'truyền file', 'cloud của tôi', 'zalo'].includes(displayName.toLowerCase().trim());

    // Trích xuất số điện thoại từ tên thô trước khi làm sạch để không bị mất thông tin
    const namePhoneKey = isSystemChat ? '' : (normalizePhoneKey(contact.name_phone_normalized) || extractPhoneKeyFromText(rawDisplayName));

    records.set(recordKey, {
      ...existing,
      zid: contact.zid || '',
      display_name: displayName,
      name: displayName,
      tag: isSystemChat ? '' : (contact.tag || existing.tag || ''),
      tag_color: isSystemChat ? '' : (contact.tag_color || existing.tag_color || ''),
      phone: isSystemChat ? '' : (contact.phone || existing.phone || ''),
      // sys_phone ưu tiên số điện thoại chính thức, sau đó là số trích xuất từ tên
      sys_phone: isSystemChat ? '' : (normalizePhoneKey(contact.sys_phone) || normalizePhoneKey(contact.phone) || namePhoneKey || ''),
      name_phone_normalized: namePhoneKey,
      '_a/c': isSystemChat ? 'bạn' : (contact['_a/c'] || existing['_a/c'] || parseDisplayNameParts(displayName)['_a/c']),
      _name: isSystemChat ? '' : (contact._name || existing._name || parseDisplayNameParts(displayName)._name),
      avatar: contact.avatar || existing.avatar || '',
      updatedAt: Math.max(contact.updatedAt || 0, existing.updatedAt || 0)
    });
  };

  Object.values(contactMap?.byZid || {}).forEach(addRecord);
  Object.values(contactMap?.byName || {}).forEach(addRecord);
  Object.values(contactMap?.byPhone || {}).forEach(addRecord);
  Object.values(zaloContacts || {}).forEach(addRecord);
  return [...records.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Thêm mới hoặc cập nhật một liên hệ vào bản đồ lưu trữ danh bạ.
 * Tự động xóa các index cũ khi tên hiển thị thay đổi để tránh trùng lặp hoặc lookup sai tên.
 * Đồng thời tự động cập nhật và fallback sys_phone nếu thiếu, loại bỏ trường nhiễm đối với các chat hệ thống.
 * 
 * @param {Object} contactMap - Bản đồ danh bạ hiện tại
 * @param {Object} record - Bản ghi liên hệ mới cần lưu/cập nhật
 * @returns {Object} Bản ghi liên hệ sau khi đã được lưu và chuẩn hóa
 */
function upsertContactRecord(contactMap, record) {
  contactMap.byZid = contactMap.byZid || {};
  contactMap.byName = contactMap.byName || {};
  contactMap.byPhone = contactMap.byPhone || {};

  const recordZid = String(record.zid || '').trim();
  const recordPhone = normalizePhoneKey(record.sys_phone) || normalizePhoneKey(record.phone) || normalizePhoneKey(record.name_phone_normalized);
  const existing = (recordZid && contactMap.byZid[recordZid]) || (recordPhone && contactMap.byPhone[recordPhone]) || {};

  // Remove stale byName index key when display_name changes so lookups by
  // the old name no longer return this record.
  const oldNameKey = normalizeLookupText(existing.display_name || existing.name || '');
  const newNameKey = normalizeLookupText(record.display_name || '');
  if (oldNameKey && newNameKey && oldNameKey !== newNameKey && contactMap.byName[oldNameKey] === existing) {
    delete contactMap.byName[oldNameKey];
  }

  const isSystemChat = ['my documents', 'truyền file', 'cloud của tôi', 'zalo'].includes((record.display_name || existing.display_name || '').toLowerCase().trim());

  // Tự động kết hợp và fallback sys_phone từ record mới, record cũ, hoặc số trích xuất từ tên
  const namePhoneKey = isSystemChat ? '' : (normalizePhoneKey(record.name_phone_normalized) || normalizePhoneKey(existing.name_phone_normalized) || '');
  const sysPhone = isSystemChat ? '' : (normalizePhoneKey(record.sys_phone) || normalizePhoneKey(existing.sys_phone) || namePhoneKey || '');

  const next = {
    ...existing,
    ...record,
    zid: recordZid || existing.zid || '',
    display_name: record.display_name || existing.display_name || '',
    tag: isSystemChat ? '' : (record.tag || existing.tag || ''),
    tag_color: isSystemChat ? '' : (record.tag_color || existing.tag_color || ''),
    phone: isSystemChat ? '' : (record.phone || existing.phone || ''),
    sys_phone: sysPhone,
    name_phone_normalized: namePhoneKey,
    '_a/c': isSystemChat ? 'bạn' : (record['_a/c'] || existing['_a/c'] || ''),
    _name: isSystemChat ? '' : (record._name || existing._name || ''),
    avatar: record.avatar || existing.avatar || '',
    updatedAt: Math.max(record.updatedAt || 0, existing.updatedAt || 0)
  };

  // Dọn dẹp index byPhone cũ nếu sys_phone hoặc name_phone_normalized thay đổi
  const oldSysPhone = normalizePhoneKey(existing.sys_phone || '');
  const oldNamePhone = normalizePhoneKey(existing.name_phone_normalized || '');
  if (oldSysPhone && oldSysPhone !== next.sys_phone && contactMap.byPhone[oldSysPhone] === existing) {
    delete contactMap.byPhone[oldSysPhone];
  }
  if (oldNamePhone && oldNamePhone !== next.name_phone_normalized && contactMap.byPhone[oldNamePhone] === existing) {
    delete contactMap.byPhone[oldNamePhone];
  }

  if (next.zid) contactMap.byZid[next.zid] = next;
  const nameKey = normalizeLookupText(next.display_name);
  if (nameKey) contactMap.byName[nameKey] = next;
  if (next.sys_phone) contactMap.byPhone[next.sys_phone] = next;
  if (next.name_phone_normalized) contactMap.byPhone[next.name_phone_normalized] = next;
  return next;
}

/**
 * Dọn dẹp và chuẩn hóa bản đồ danh bạ (contactMap) để loại bỏ các trường bị nhiễm (lỗi) 
 * khỏi các cuộc hội thoại hệ thống như "My Documents", "Truyền file", "Cloud của tôi", "Zalo".
 * Đồng thời dọn sạch các khóa index byPhone/byName không hợp lệ hoặc trỏ sai.
 * 
 * @param {Object} contactMap - Bản đồ danh bạ lưu trữ
 * @returns {boolean} Trả về true nếu có sự thay đổi (cần lưu lại vào storage)
 */
function sanitizeContactMap(contactMap) {
  if (!contactMap) return false;
  contactMap.byZid = contactMap.byZid || {};
  contactMap.byName = contactMap.byName || {};
  contactMap.byPhone = contactMap.byPhone || {};

  let changed = false;
  const systemNames = ['my documents', 'truyền file', 'cloud của tôi', 'zalo'];

  // 1. Duyệt qua byZid và sửa các bản ghi hệ thống bị nhiễm
  Object.entries(contactMap.byZid).forEach(([zid, record]) => {
    const displayName = String(record?.display_name || record?.name || '').toLowerCase().trim();
    if (systemNames.includes(displayName)) {
      // Bản ghi hệ thống bị nhiễm: dọn dẹp các trường
      if (record.sys_phone || record.phone || record.tag || record.tag_color || record.name_phone_normalized || record._name || record['_a/c'] !== 'bạn') {
        record.sys_phone = '';
        record.phone = '';
        record.tag = '';
        record.tag_color = '';
        record.name_phone_normalized = '';
        record._name = '';
        record['_a/c'] = 'bạn';
        changed = true;
      }
    }
  });

  // 2. Đồng bộ/dọn dẹp byPhone index
  const newByPhone = {};
  Object.values(contactMap.byZid).forEach((record) => {
    const displayName = String(record?.display_name || record?.name || '').toLowerCase().trim();
    if (systemNames.includes(displayName)) return;

    if (record.sys_phone) {
      newByPhone[record.sys_phone] = record;
    }
    if (record.name_phone_normalized) {
      newByPhone[record.name_phone_normalized] = record;
    }
  });
  Object.entries(contactMap.byPhone).forEach(([phoneKey, record]) => {
    if (record?.zid) return;
    const normalizedPhoneKey = normalizePhoneKey(record?.sys_phone || phoneKey);
    if (!normalizedPhoneKey) return;
    record.sys_phone = normalizedPhoneKey;
    newByPhone[normalizedPhoneKey] = record;
  });

  const oldPhoneKeys = Object.keys(contactMap.byPhone);
  const newPhoneKeys = Object.keys(newByPhone);
  if (oldPhoneKeys.length !== newPhoneKeys.length || oldPhoneKeys.some(k => contactMap.byPhone[k] !== newByPhone[k])) {
    contactMap.byPhone = newByPhone;
    changed = true;
  }

  // 3. Đồng bộ/dọn dẹp byName index
  const newByName = {};
  Object.values(contactMap.byZid).forEach((record) => {
    const nameKey = normalizeLookupText(record.display_name);
    if (nameKey) {
      newByName[nameKey] = record;
    }
  });
  Object.values(newByPhone).forEach((record) => {
    if (record?.zid) return;
    const nameKey = normalizeLookupText(record.display_name);
    if (nameKey) {
      newByName[nameKey] = record;
    }
  });

  const oldNameKeys = Object.keys(contactMap.byName);
  const newNameKeys = Object.keys(newByName);
  if (oldNameKeys.length !== newNameKeys.length || oldNameKeys.some(k => contactMap.byName[k] !== newByName[k])) {
    contactMap.byName = newByName;
    changed = true;
  }

  return changed;
}
