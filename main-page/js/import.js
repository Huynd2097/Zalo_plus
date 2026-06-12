/**
 * @file import.js
 * @description Logic xử lý nhập dữ liệu hàng loạt từ các file Excel/CSV vào hàng chờ.
 */

/**
 * Kiểm tra xem dòng dữ liệu có phải là dòng ghi chú mẫu của template hay không.
 * @param {Object} row 
 * @returns {boolean}
 */
function isTemplateNoteRow(row) {
  return TEMPLATE_HEADERS.every((header) => String(row?.[header] || '').trim() === TEMPLATE_NOTE_ROW[header]);
}

/**
 * Chuẩn hóa tên tiêu đề cột.
 * @param {string} header 
 * @returns {string}
 */
function normalizeHeaderName(header) {
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
    msg: 'message',
    content: 'message',
    text: 'message',
    body: 'message',
    'noi dung': 'message',
    'nội dung': 'message',
    'tin nhan': 'message',
    'tin nhắn': 'message',
    display_name: 'display_name',
    tag: 'tag',
    sys_phone: 'sys_phone',
    replies: 'replies',
    error: 'error'
  };
  return known[lower] || value;
}

/**
 * Chuẩn hóa toàn bộ các cột và dòng dữ liệu đã parse.
 * @param {Object} parsed 
 * @returns {Object}
 */
function normalizeParsedColumns(parsed) {
  const headers = [];
  const headerMap = new Map();

  (parsed.headers || []).forEach((header) => {
    const normalized = normalizeHeaderName(header);
    if (!normalized) return;
    if (!headers.includes(normalized)) headers.push(normalized);
    headerMap.set(header, normalized);
  });

  const rows = (parsed.rows || []).map((row) => {
    const next = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const normalized = headerMap.get(key) || normalizeHeaderName(key);
      if (!normalized) return;
      next[normalized] = value;
    });
    return next;
  });

  return { headers, rows };
}

/**
 * Kiểm tra xem dòng dữ liệu có chứa bất kỳ giá trị nào không.
 * @param {Object} row 
 * @returns {boolean}
 */
function hasData(row) {
  return Object.values(row || {}).some((value) => String(value || '').trim() !== '');
}

/**
 * Xác thực xem các dòng nhập vào có chứa nội dung tin nhắn bắt buộc không.
 * @param {Object[]} rows 
 */
function validateRowsHaveMessage(rows) {
  const missingRows = [];
  rows.forEach((row, index) => {
    if (!String(row?.message || '').trim()) missingRows.push(index + 1);
  });
  if (missingRows.length) {
    const shown = missingRows.slice(0, 10).join(', ');
    const more = missingRows.length > 10 ? ', ...' : '';
    throw new Error(`Các dòng thiếu tin nhắn (message): ${shown}${more}. Vui lòng kiểm tra lại.`);
  }
}

/**
 * Lấy Zalo ID từ dòng dữ liệu.
 * @param {Object} row 
 * @returns {string}
 */
function getRowZid(row) {
  return String(row?.zid || '').trim();
}

/**
 * Lựa chọn hành động khi xảy ra xung đột dữ liệu nhập.
 * @param {number} count 
 * @returns {string}
 */
function chooseImportConflictAction(count) {
  if (!count) return 'append';
  const replace = confirm(`Có ${count} dòng trùng ZID/SĐT với bảng hiện tại.\n\nBấm OK để ghi đè (thay thế) dòng cũ.\nBấm Cancel để chọn bỏ qua trùng hoặc hủy.`);
  if (replace) return 'replace';
  const skip = confirm('Bấm OK để chỉ thêm các dòng mới (bỏ qua dòng trùng ZID).\nBấm Cancel để hủy bỏ hoàn toàn.');
  return skip ? 'skip' : 'cancel';
}

/**
 * Trộn dữ liệu mới nhập với dữ liệu hàng chờ hiện có.
 * @param {Object[]} existingRows 
 * @param {Object[]} importedRows 
 * @returns {Object[]|null}
 */
function mergeImportedRows(existingRows, importedRows) {
  const zidToIndex = new Map();
  existingRows.forEach((row, index) => {
    const zid = getRowZid(row);
    if (zid) zidToIndex.set(zid, index);
  });

  const conflictCount = importedRows.filter((row) => {
    const zid = getRowZid(row);
    return zid && zidToIndex.has(zid);
  }).length;

  const action = chooseImportConflictAction(conflictCount);
  if (action === 'cancel') return null;

  const merged = existingRows.map((row) => ({ ...row }));
  importedRows.forEach((row) => {
    const zid = getRowZid(row);
    const index = zid ? zidToIndex.get(zid) : undefined;
    if (Number.isInteger(index)) {
      if (action === 'replace') merged[index] = { ...row };
      return;
    }
    if (zid) zidToIndex.set(zid, merged.length);
    merged.push({ ...row });
  });
  return merged;
}

/**
 * Xây dựng chuỗi văn bản xác nhận trước khi thực hiện import.
 * @param {Object[]} newRows 
 * @param {number} totalImported 
 * @returns {string}
 */
function buildImportConfirmText(newRows, totalImported) {
  const sample = newRows.slice(0, 5).map((row, index) => {
    const name = String(row.name || '').trim() || '(không có tên)';
    const zid = String(row.zid || '').trim() || '(thiếu zid)';
    const phone = String(row.phone || '').trim();
    const message = String(row.message || '').trim();
    return `${index + 1}. ${name}${phone ? ` | ${formatDisplayPhone(phone)}` : ''} | zid=${zid} | message="${message}"`;
  }).join('\n');
  const more = newRows.length > 5 ? `\n... và ${newRows.length - 5} dòng khác` : '';
  return `Bạn có chắc chắn muốn thêm ${totalImported} dòng này vào hàng chờ không?\n\nXem trước 5 dòng đầu:\n${sample}${more}`;
}

/**
 * Nhập hàng loạt từ tệp tin CSV hoặc Excel.
 * @param {File} file 
 */
async function importBatchFromFile(file) {
  showToast('Đang đọc tệp tin...');
  let parsed = { headers: [], rows: [] };

  if (file.name.match(/\.xlsx?$|\.xls$/i)) {
    const buffer = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd hh:mm' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd hh:mm' });
    if (json.length > 0) {
      parsed.headers = Object.keys(json[0]);
      parsed.rows = json;
    }
  } else {
    const text = await readFileAsText(file);
    if (window.ZZCsv) {
      parsed = window.ZZCsv.parseCsv(text);
    } else {
      throw new Error("Không load được module phân tách CSV.");
    }
  }

  parsed = normalizeParsedColumns(parsed);

  const missing = ['message'].filter((name) => !parsed.headers.includes(name));
  if (missing.length) {
    throw new Error(`File thiếu cột bắt buộc: ${missing.join(', ')}.`);
  }
  if (!parsed.rows.length) {
    throw new Error('File không có dòng dữ liệu.');
  }

  const rows = parsed.rows
    .filter((row, index) => index !== 0 || !isTemplateNoteRow(row))
    .filter(hasData);
  validateRowsHaveMessage(rows);
  if (!rows.length) {
    throw new Error('File import không chứa dữ liệu thực tế.');
  }

  // Kiểm tra trùng lắp ZID/SĐT với hàng chờ hiện tại
  const queueResp = await sendMessage({ type: 'GET_QUEUE' });
  if (!queueResp.ok) throw new Error(queueResp.error || 'Không đọc được hàng chờ.');

  const existingQueue = queueResp.queue || { byId: {}, headers: [] };
  const existingRows = Object.values(existingQueue.byId).map((r) => ({
    ...r.values,
    _status: r.status
  }));

  const mergedRows = mergeImportedRows(existingRows, rows);
  if (!mergedRows) {
    showToast('Đã hủy import.');
    return;
  }

  const onlyNewRows = rows.filter((r) => !existingRows.some((e) => getRowZid(e) && getRowZid(e) === getRowZid(r)));
  if (!confirm(buildImportConfirmText(onlyNewRows.length ? onlyNewRows : rows, rows.length))) {
    showToast('Đã hủy import.');
    return;
  }

  // Gửi lệnh thêm hàng loạt dòng mới
  const addResp = await sendMessage({
    type: 'ADD_ROWS',
    rows: rows,
    headers: parsed.headers
  });

  if (!addResp.ok) {
    throw new Error(addResp.error || 'Không thêm được dòng vào hàng chờ.');
  }

  showToast(`Đã import thành công ${rows.length} dòng.`);
  await pollStatus();
}
