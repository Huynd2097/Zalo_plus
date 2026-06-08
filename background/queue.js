// Quản lý hàng chờ tin nhắn (messageQueue) và trạng thái worker (workerState).

const QUEUE_STORAGE_KEY = 'messageQueue';
const WORKER_STATE_STORAGE_KEY = 'workerState';
const QUEUE_CLEANUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

/**
 * Tạo một chuỗi ID duy nhất cho hàng chờ.
 * @returns {string} ID duy nhất dạng chuỗi
 */
function generateRowId() {
  return `row-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Đọc dữ liệu hàng chờ từ chrome.storage.local.
 * @returns {Promise<{byId: Object, headers: string[]}>} Hàng chờ hiện tại
 */
async function loadQueue() {
  const data = await storageGet([QUEUE_STORAGE_KEY]);
  return data[QUEUE_STORAGE_KEY] || { byId: {}, headers: [] };
}

/**
 * Lưu dữ liệu hàng chờ vào chrome.storage.local.
 * @param {{byId: Object, headers: string[]}} queue - Đối tượng hàng chờ cần lưu
 * @returns {Promise<void>}
 */
async function saveQueue(queue) {
  await storageSet({ [QUEUE_STORAGE_KEY]: queue });
}

/**
 * Thêm các dòng tin nhắn mới vào hàng chờ, tự động chuẩn hóa các trường thông tin.
 * @param {Object[]} rows - Mảng chứa dữ liệu các dòng import từ CSV/XLSX
 * @param {string[]} headers - Mảng các cột tiêu đề từ file import
 * @returns {Promise<{byId: Object, headers: string[]}>} Hàng chờ sau khi thêm dữ liệu
 */
async function addRowsToQueue(rows, headers) {
  const queue = await loadQueue();
  
  // Trộn và chuẩn hóa tiêu đề
  const cleanHeaders = (headers || []).map(normalizeBatchHeaderName).filter(Boolean);
  cleanHeaders.forEach((h) => {
    if (!queue.headers.includes(h)) {
      queue.headers.push(h);
    }
  });

  // Đảm bảo các cột tối thiểu luôn tồn tại trong headers
  const required = ['zid', 'send_at', 'wait_reply', 'replies', 'error'];
  required.forEach((r) => {
    if (!queue.headers.includes(r)) {
      queue.headers.push(r);
    }
  });

  // Thêm từng dòng vào hàng chờ
  for (const row of rows || []) {
    const id = generateRowId();
    // Sao chép các thuộc tính và loại bỏ các trường tạm của UI
    const values = { ...row };
    delete values._status;
    
    // Điền các cột trung gian (display_name, tag, sys_phone, _a/c, _name)
    fillIntermediatePhoneColumns(values);
    if (!String(values.zid || '').trim() && typeof findMappedContact === 'function') {
      const mapped = await findMappedContact(values);
      if (mapped?.zid) {
        values.zid = mapped.zid;
        if (!values.display_name && !values.name && (mapped.display_name || mapped.name)) {
          values.display_name = mapped.display_name || mapped.name;
        }
        fillIntermediatePhoneColumns(values);
      }
    }

    queue.byId[id] = {
      id,
      values,
      status: row._status || 'pending', // pending | sending | wait_reply | done | error
      error: row.error || '',
      replies: Array.isArray(row.replies) ? row.replies : [],
      sentAt: row.sentAt || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  await saveQueue(queue);
  await autoCleanupQueue(); // Dọn dẹp các dòng quá hạn sau khi thêm mới
  return queue;
}

/**
 * Cập nhật một dòng tin nhắn trong hàng chờ theo ID.
 * @param {string} id - ID của dòng cần cập nhật
 * @param {Object} updates - Đối tượng chứa các trường và giá trị cần cập nhật (ví dụ: { status: 'done', error: '' })
 * @returns {Promise<Object|null>} Dòng tin nhắn sau khi cập nhật hoặc null nếu không tồn tại
 */
async function updateQueueRow(id, updates) {
  const queue = await loadQueue();
  const row = queue.byId[id];
  if (!row) return null;

  // Nếu cập nhật các cột dữ liệu values
  if (updates.values) {
    const valueUpdates = { ...updates.values };
    const phoneChanged = Object.prototype.hasOwnProperty.call(valueUpdates, 'phone') ||
      Object.prototype.hasOwnProperty.call(valueUpdates, 'sys_phone');
    const zidChanged = Object.prototype.hasOwnProperty.call(valueUpdates, 'zid');

    row.values = { ...row.values, ...updates.values };
    if (Object.prototype.hasOwnProperty.call(valueUpdates, 'phone') &&
        !Object.prototype.hasOwnProperty.call(valueUpdates, 'sys_phone')) {
      row.values.sys_phone = normalizePhoneKey(valueUpdates.phone);
    }
    fillIntermediatePhoneColumns(row.values);

    if (phoneChanged && !zidChanged) {
      const mapped = typeof findMappedContact === 'function'
        ? await findMappedContact({ ...row.values, zid: '' })
        : null;
      if (mapped?.zid) {
        row.values.zid = mapped.zid;
        if (mapped.display_name || mapped.name) row.values.display_name = mapped.display_name || mapped.name;
        if (mapped.phone && !row.values.phone) row.values.phone = mapped.phone;
        if (mapped.sys_phone) row.values.sys_phone = mapped.sys_phone;
      } else {
        row.values.zid = '';
      }
      fillIntermediatePhoneColumns(row.values);
    }

    delete updates.values;
  }

  // Cập nhật các trường gốc của row
  Object.assign(row, updates);
  row.updatedAt = Date.now();

  await saveQueue(queue);
  return row;
}

/**
 * Xóa danh sách các dòng ra khỏi hàng chờ.
 * @param {string[]} ids - Mảng chứa các ID dòng cần xóa
 * @returns {Promise<{byId: Object, headers: string[]}>} Hàng chờ sau khi xóa
 */
async function removeQueueRows(ids) {
  const queue = await loadQueue();
  let changed = false;
  for (const id of ids || []) {
    if (queue.byId[id]) {
      delete queue.byId[id];
      changed = true;
    }
  }
  if (changed) {
    await saveQueue(queue);
    await cleanupUnusedMedia(); // Giải phóng ảnh không còn được dùng trong mediaStore
  }
  return queue;
}

/**
 * Xóa toàn bộ hàng chờ tin nhắn.
 * @returns {Promise<{byId: Object, headers: string[]}>} Hàng chờ rỗng sau khi xóa
 */
async function clearQueue() {
  const emptyQueue = { byId: {}, headers: [] };
  await saveQueue(emptyQueue);
  await storageRemove(['mediaStore']); // Xóa toàn bộ ảnh đính kèm khỏi mediaStore
  return emptyQueue;
}

/**
 * Tính toán thống kê tổng quan của hàng chờ hiện tại.
 * @param {{byId: Object, headers: string[]}} [queue] - Đối tượng hàng chờ (nếu có sẵn)
 * @returns {Promise<{pending: number, sending: number, wait_reply: number, done: number, error: number, responded: number, total: number}>} Thống kê tổng quan
 */
async function getQueueSummary(queue) {
  const activeQueue = queue || await loadQueue();
  const rows = Object.values(activeQueue.byId || {});
  
  const summary = {
    pending: 0,
    sending: 0,
    wait_reply: 0,
    done: 0,
    error: 0,
    responded: 0,
    total: rows.length
  };

  rows.forEach((row) => {
    const status = row.status || 'pending';
    if (summary.hasOwnProperty(status)) {
      summary[status]++;
    }
    if ((row.replies || []).length > 0) {
      summary.responded++;
    }
    if (row.error) {
      summary.error++;
    }
  });

  return summary;
}

/**
 * Đọc trạng thái hoạt động của worker từ storage.
 * @returns {Promise<{running: boolean, phase: string, currentRowId: string|null, message: string, updatedAt: number}>} Trạng thái hiện tại
 */
async function loadWorkerState() {
  const data = await storageGet([WORKER_STATE_STORAGE_KEY]);
  return data[WORKER_STATE_STORAGE_KEY] || {
    running: false,
    phase: 'idle', // idle | sending | polling | paused
    currentRowId: null,
    message: '',
    updatedAt: 0
  };
}

/**
 * Lưu/Cập nhật trạng thái hoạt động của worker.
 * @param {Object} updates - Các trường trạng thái cần thay đổi
 * @returns {Promise<{running: boolean, phase: string, currentRowId: string|null, message: string, updatedAt: number}>} Trạng thái sau cập nhật
 */
async function saveWorkerState(updates) {
  const current = await loadWorkerState();
  const next = {
    ...current,
    ...updates,
    updatedAt: Date.now()
  };
  await storageSet({ [WORKER_STATE_STORAGE_KEY]: next });
  return next;
}

/**
 * Dọn dẹp các hình ảnh không còn được sử dụng trong mediaStore để giải phóng bộ nhớ.
 * @returns {Promise<void>}
 */
async function cleanupUnusedMedia() {
  const queue = await loadQueue();
  const data = await storageGet(['mediaStore']);
  const mediaStore = data.mediaStore || {};
  
  // Thu thập tất cả các media_id đang được các dòng trong hàng chờ sử dụng
  const activeMediaIds = new Set();
  Object.values(queue.byId).forEach((row) => {
    const mediaId = String(row.values?.media_id || '').trim();
    if (mediaId) {
      activeMediaIds.add(mediaId);
    }
  });

  // Tìm và xóa các media_id không còn xuất hiện trong hàng chờ
  let changed = false;
  Object.keys(mediaStore).forEach((mediaId) => {
    if (!activeMediaIds.has(mediaId)) {
      delete mediaStore[mediaId];
      changed = true;
    }
  });

  if (changed) {
    await storageSet({ mediaStore });
  }
}

/**
 * Tự động xóa các dòng tin nhắn đã hoàn tất hoặc bị lỗi cũ hơn 7 ngày để tránh đầy bộ nhớ.
 * @returns {Promise<void>}
 */
async function autoCleanupQueue() {
  const queue = await loadQueue();
  const now = Date.now();
  let changed = false;

  Object.entries(queue.byId).forEach(([id, row]) => {
    const isOld = (now - (row.updatedAt || row.createdAt || now)) > QUEUE_CLEANUP_MAX_AGE_MS;
    if (isOld && (row.status === 'done' || row.status === 'error')) {
      delete queue.byId[id];
      changed = true;
    }
  });

  if (changed) {
    await saveQueue(queue);
    await cleanupUnusedMedia(); // Giải phóng ảnh cũ không còn dùng
  }
}

/**
 * Migrate dữ liệu từ định dạng batch cũ sang hàng chờ mới (queue-based).
 * @returns {Promise<void>}
 */
async function migrateFromBatchToQueue() {
  const data = await storageGet(['activeBatch']);
  if (!data.activeBatch || !data.activeBatch.rows) return;

  const activeBatch = data.activeBatch;
  const queue = await loadQueue();
  
  // Merge các cột tiêu đề
  const headers = activeBatch.headers || [];
  headers.forEach((h) => {
    const cleanH = normalizeBatchHeaderName(h);
    if (cleanH && !queue.headers.includes(cleanH)) {
      queue.headers.push(cleanH);
    }
  });

  // Chuyển đổi các dòng sang cấu trúc mới
  activeBatch.rows.forEach((row) => {
    const id = generateRowId();
    queue.byId[id] = {
      id,
      values: row.values || {},
      status: row.status || 'pending',
      error: row.error || '',
      replies: row.replies || [],
      sentAt: row.sentAt || 0,
      createdAt: activeBatch.startedAt || Date.now(),
      updatedAt: Date.now()
    };
  });

  await saveQueue(queue);
  await storageRemove(['activeBatch']);
}
