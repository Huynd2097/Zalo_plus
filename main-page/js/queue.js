/**
 * @file queue.js
 * @description Logic quản lý hàng chờ gửi tin (Queue Table, trạng thái gửi tin, tác vụ hàng loạt).
 */

/**
 * Lọc dòng hàng chờ đang hiển thị theo search bar và bộ lọc trạng thái.
 * @returns {Object[]}
 */
function getFilteredQueueRows() {
  if (!latestQueue) return [];
  const rows = Object.values(latestQueue.byId || {}).sort(compareQueueRows);
  const query = queueSearchQuery.toLowerCase();

  return rows.filter(row => {
    const valuesStr = Object.values(row.values || {}).join(' ').toLowerCase();
    const statusStr = String(row.status || '').toLowerCase();
    const repliesStr = (row.replies || []).join(' ').toLowerCase();
    const errStr = String(row.error || '').toLowerCase();
    const matchesSearch = valuesStr.includes(query) || statusStr.includes(query) || repliesStr.includes(query) || errStr.includes(query);

    const matchesStatus = queueStatusFilter === "" || 
      (queueStatusFilter === "replied" ? (row.replies && row.replies.length > 0) : row.status === queueStatusFilter);
    const matchesTag = queueTagFilter === "" || row.values?.tag === queueTagFilter;
    return matchesSearch && matchesStatus && matchesTag;
  });
}

function getQueueStatusRank(status) {
  const ranks = {
    error: 0,
    pending: 1,
    sending: 1,
    wait_reply: 2,
    done: 3
  };
  return ranks[status] ?? 4;
}

function compareQueueRows(a, b) {
  const statusDiff = getQueueStatusRank(a.status || 'pending') - getQueueStatusRank(b.status || 'pending');
  if (statusDiff !== 0) return statusDiff;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

function getQueueTags() {
  const tags = new Set();
  Object.values(latestQueue?.byId || {}).forEach((row) => {
    if (row.values?.tag) tags.add(row.values.tag);
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'vi'));
}

function renderQueueTagFilter() {
  const label = document.getElementById("queueTagFilterLabel");
  const options = document.getElementById("queueTagFilterOptions");
  if (!label || !options) return;
  const tags = getQueueTags();
  const current = tags.includes(queueTagFilter) ? queueTagFilter : "";
  if (current !== queueTagFilter) queueTagFilter = current;
  if (current) {
    const currentColor = getCanonicalTagColor(current);
    label.innerHTML = `<span class="px-1.5 py-0.5 rounded text-white font-extrabold" style="background-color: ${escapeHtml(currentColor)}">${escapeHtml(current)}</span>`;
  } else {
    label.innerText = 'Tất cả tag';
  }

  options.innerHTML = [
    `<button data-queue-tag-filter=""
      class="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
      Tất cả tag
    </button>`,
    ...tags.map((tag) => {
      const color = getCanonicalTagColor(tag);
      const selectedClass = tag === current ? 'bg-slate-50' : '';
      return `<button data-queue-tag-filter="${escapeHtml(tag)}"
        class="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${selectedClass}">
        <span class="px-1.5 py-0.5 rounded text-white font-extrabold inline-block" style="background-color: ${escapeHtml(color)}">${escapeHtml(tag)}</span>
      </button>`;
    })
  ].join('');
}

/**
 * Cập nhật một ô dữ liệu trong bảng hàng chờ khi người dùng sửa trực tiếp.
 * @param {string} rowId - ID của dòng
 * @param {string} header - Tiêu đề cột
 * @param {string} value - Giá trị mới nhập
 */
async function saveEditedCell(rowId, header, value) {
  let updates = {};
  if (header === '_state') {
    updates.status = value;
    if (value === 'pending') {
      updates.error = '';
      updates.sentAt = 0;
      updates.replies = [];
    } else if (value === 'wait_reply') {
      updates.error = '';
      updates.sentAt = Date.now();
    }
  } else if (header === 'wait_reply') {
    updates.values = { wait_reply: value };
  } else {
    updates.values = { [header]: value };
  }

  const resp = await sendMessage({ type: 'UPDATE_ROW', rowId, updates });
  if (!resp.ok) throw new Error(resp.error || 'Không cập nhật được ô.');
  await pollStatus();
}

async function removeQueueRowImage(rowId) {
  const resp = await sendMessage({
    type: 'UPDATE_ROW',
    rowId,
    updates: {
      values: {
        media_id: '',
        media_name: '',
        media_thumbnail: ''
      }
    }
  });
  if (!resp.ok) throw new Error(resp.error || 'Không xoá được ảnh khỏi hàng chờ.');
  await pollStatus();
}

/**
 * Toggle đánh dấu chọn checkbox một dòng hàng chờ để thực hiện bulk actions.
 * @param {string} id - ID của dòng hàng chờ
 */
function toggleQueueRowCheckbox(id) {
  if (selectedQueueIds.has(id)) {
    selectedQueueIds.delete(id);
  } else {
    selectedQueueIds.add(id);
  }
  syncBulkActionsState();
}

/**
 * Đồng bộ nút tác vụ hàng loạt dựa trên số dòng đang check.
 */
function syncBulkActionsState() {
  const totalChecked = selectedQueueIds.size;
  const countLabel = document.getElementById("selectedQueueCount");

  const bulkStatusBtn = document.getElementById("bulkStatusBtn");
  const bulkResetBtn = document.getElementById("bulkResetBtn");
  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");

  if (totalChecked > 0) {
    if (countLabel) {
      countLabel.innerText = `Đã chọn: ${totalChecked}`;
      countLabel.classList.remove("hidden");
    }
    bulkStatusBtn?.removeAttribute("disabled");
    bulkResetBtn?.removeAttribute("disabled");
    bulkDeleteBtn?.removeAttribute("disabled");
  } else {
    countLabel?.classList.add("hidden");
    bulkStatusBtn?.setAttribute("disabled", "true");
    bulkResetBtn?.setAttribute("disabled", "true");
    bulkDeleteBtn?.setAttribute("disabled", "true");
  }

  const filtered = getFilteredQueueRows();
  const masterCheckbox = document.getElementById("masterQueueCheckbox");
  if (masterCheckbox && filtered.length > 0) {
    masterCheckbox.checked = filtered.every(row => selectedQueueIds.has(row.id));
  }
}

/**
 * Đổi trạng thái hàng loạt các dòng đang chọn.
 * @param {string} newState - Trạng thái mới: pending | wait_reply | done
 */
async function applyBulkState(newState) {
  if (selectedQueueIds.size === 0) return;

  for (const id of selectedQueueIds) {
    try {
      await saveEditedCell(id, '_state', newState);
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById("bulkStatusDropdown")?.classList.add("hidden");
  selectedQueueIds.clear();
  syncBulkActionsState();
  showToast("Đã cập nhật trạng thái các dòng được chọn!");
}

/**
 * Reset các dòng đang chọn về trạng thái Chờ gửi (pending).
 */
async function applyBulkReset() {
  await applyBulkState('pending');
}

/**
 * Xóa hàng loạt các dòng đang chọn khỏi hàng chờ.
 */
async function applyBulkDelete() {
  if (selectedQueueIds.size === 0) return;
  const count = selectedQueueIds.size;
  const idsToDelete = Array.from(selectedQueueIds);

  // Ẩn ngay các dòng đã chọn trên UI (soft delete)
  const hiddenRows = [];
  idsToDelete.forEach(id => {
    const tr = document.querySelector(`tr[data-row-id="${id}"]`);
    if (tr) {
      tr.style.display = 'none';
      hiddenRows.push(tr);
    }
  });

  selectedQueueIds.clear();
  syncBulkActionsState();

  showUndoToast(`Đã xoá ${count} dòng khỏi hàng chờ`, async () => {
    // Undo: hiện lại các dòng
    hiddenRows.forEach(tr => { tr.style.display = ''; });
    idsToDelete.forEach(id => selectedQueueIds.add(id));
    syncBulkActionsState();
  }, async () => {
    // Commit: gọi API xoá thực sự
    const resp = await sendMessage({
      type: 'REMOVE_ROWS',
      ids: idsToDelete
    });
    if (!resp.ok) {
      showToast(resp.error || "Không xoá được các dòng.", "error");
      hiddenRows.forEach(tr => { tr.style.display = ''; });
      return;
    }
    await pollStatus();
  });
}

/**
 * Tổng hợp phản hồi (Local Extract) hiển thị lên modal báo cáo.
 */
function summarizeRepliesLocal() {
  const tbody = document.getElementById("localSummaryTableBody");
  const emptyState = document.getElementById("localSummaryEmptyState");

  if (!latestQueue || !tbody || !emptyState) return;
  const rows = Object.values(latestQueue.byId);
  const activeReplies = rows.filter(item => item.replies && item.replies.length > 0);

  if (activeReplies.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
    tbody.innerHTML = activeReplies.map(row => {
      const displayReplies = (row.replies || []).join('; ');
      return `
        <tr class="hover:bg-slate-50 text-xs">
          <td class="px-3 py-2 font-bold text-slate-800">${escapeHtml(row.values?.name || row.values?.display_name || row.id)}</td>
          <td class="px-3 py-2 font-mono text-slate-500">${escapeHtml(formatDisplayPhone(row.values?.phone || row.values?.sys_phone || ''))}</td>
          <td class="px-3 py-2 text-slate-400 max-w-[200px] truncate" title="${escapeHtml(row.values?.message || '')}">${escapeHtml(row.values?.message || '')}</td>
          <td class="px-3 py-2 text-indigo-700 font-extrabold bg-indigo-50/30 leading-snug whitespace-pre-wrap">${escapeHtml(displayReplies)}</td>
        </tr>
      `;
    }).join("");
  }

  openAiSummaryModal();
}

/**
 * Sắp xếp thứ tự các cột của header.
 * @param {string[]} headers 
 * @param {Object} options 
 * @returns {string[]}
 */
function orderHeaders(headers, options = {}) {
  const hidden = options.hidden || [];
  const standardOrder = ['name', 'phone', 'message', 'replies', 'send_at', 'note', 'wait_reply', 'error', 'updatedAt', 'zid'];
  const next = [];
  
  standardOrder.forEach((header) => {
    if (((headers || []).includes(header) || header === 'wait_reply' || header === 'zid' || header === 'replies' || header === 'error' || header === 'updatedAt') && !hidden.includes(header)) {
      next.push(header);
    }
  });
  
  // Đảm bảo không làm mất bất kỳ header động nào khác từ CSV/Excel
  (headers || []).forEach((header) => {
    if (header && !standardOrder.includes(header) && !hidden.includes(header) && !next.includes(header)) {
      next.push(header);
    }
  });
  
  return next;
}

/**
 * Đếm số lượng dòng trong queue đã có phản hồi.
 * @param {Object[]} rows 
 * @returns {number}
 */
function countRespondedRows(rows) {
  return rows.filter((row) => (row.replies || []).length > 0).length;
}

function getQueueCellClass(header) {
  let base = 'px-3 py-1.5 align-middle';
  if (header === 'message' || header === 'replies') {
    base = 'px-3 py-1.5 align-top';
  }
  
  const classes = {
    media_id: 'w-[80px] text-center',
    recipient: 'w-[320px] max-w-[320px]',
    message: 'min-w-[300px] max-w-[420px]',
    replies: 'min-w-[300px] max-w-[420px]',
    send_at: 'w-[120px] text-slate-500 leading-tight',
    note: 'w-[70px] text-center',
    wait_reply: 'w-[60px] text-center',
    error: 'w-[150px] max-w-[150px] whitespace-pre-wrap break-words text-rose-600 leading-snug',
    updatedAt: 'w-[120px] text-slate-500 leading-tight',
    sys_phone: `w-[120px] max-w-[120px] truncate font-mono text-slate-400 debug-td-sys_phone hidden`,
    sent_qid: `w-[160px] max-w-[160px] truncate font-mono text-slate-400 debug-td-sent_qid hidden`,
    reply_qids: `w-[160px] max-w-[160px] truncate font-mono text-slate-400 debug-td-reply_qids hidden`,
    tag: `w-[120px] max-w-[120px] truncate text-slate-400 debug-td-tag hidden`,
    tag_color: `w-[120px] max-w-[120px] truncate font-mono text-slate-400 debug-td-tag_color hidden`,
    media_name: `w-[150px] max-w-[150px] truncate text-slate-400 debug-td-media_name hidden`,
    media_thumbnail: `w-[150px] max-w-[150px] truncate font-mono text-slate-400 debug-td-media_thumbnail hidden`,
    id: `w-[160px] max-w-[160px] truncate font-mono text-slate-400 debug-td-id hidden`,
    sentAt: `w-[160px] max-w-[160px] truncate font-mono text-slate-400 debug-td-sentAt hidden`,
    raw_error: `w-[300px] max-w-[300px] whitespace-pre-wrap break-words font-mono text-[10px] text-rose-500 debug-td-raw_error hidden`,
    zid: 'w-[160px] max-w-[160px] truncate font-mono text-slate-400'
  };
  return `${base} ${classes[header] || ''}`;
}

function renderQueueRecipientCell(row, tagColor) {
  const values = row.values || {};
  const name = stripZaloTags(values.name || values.display_name || '');
  const phone = formatDisplayPhone(values.phone || values.sys_phone || '');
  const tag = String(values.tag || '').trim();

  // Tìm avatar từ latestContacts hoặc values.avatar
  const zid = String(values.zid || '').trim();
  const phoneVal = String(values.phone || values.sys_phone || '').trim().replace(/[^\d]/g, '');
  const contact = latestContacts.find(c => {
    if (zid && c.zid === zid) return true;
    if (phoneVal) {
      const cPhone = String(c.phone || c.sys_phone || '').trim().replace(/[^\d]/g, '');
      if (cPhone && (cPhone.endsWith(phoneVal) || phoneVal.endsWith(cPhone))) return true;
    }
    return false;
  }) || {};
  const avatar = values.avatar || contact.avatar || '';

  return `
    <td class="${getQueueCellClass('recipient')}">
      <div class="flex items-center gap-2 min-w-0">
        <div class="rounded-full border border-indigo-100 flex-shrink-0 overflow-hidden bg-indigo-50 flex items-center justify-center" style="width: 40px; height: 40px;">
          ${avatar ? `<img src="${escapeHtml(avatar)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />` : `<span class="text-indigo-600 text-[11px] font-extrabold">${escapeHtml(getInitials({ display_name: name, phone }))}</span>`}
        </div>
        <div class="min-w-0 flex-1">
          <p contenteditable="true" data-row-id="${escapeHtml(row.id)}" data-header="name" spellcheck="false" class="font-semibold text-slate-700 leading-snug truncate focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all">${escapeHtml(name)}</p>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span contenteditable="true" data-row-id="${escapeHtml(row.id)}" data-header="phone" spellcheck="false" class="text-[10px] text-slate-400 font-mono whitespace-nowrap focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all">${escapeHtml(phone)}</span>
            ${tag ? `<span class="px-1.5 py-0.5 text-[9px] font-extrabold rounded text-white whitespace-nowrap inline-block" style="background-color: ${escapeHtml(tagColor)}">${escapeHtml(tag)}</span>` : ''}
          </div>
        </div>
      </div>
    </td>
  `;
}

/**
 * Đồng bộ hiển thị dải thông số thống kê ở đầu tab Chiến dịch.
 * @param {Object} queue 
 * @param {Object} state 
 */
function updateSummary(queue, state) {
  const rows = Object.values(queue?.byId || {});

  const doneCount = rows.filter((row) => row.status === 'done').length;
  const pendingCount = rows.filter((row) => ['pending', 'sending'].includes(row.status)).length;
  const waitReplyCount = rows.filter((row) => row.status === 'wait_reply').length;
  const responded = countRespondedRows(rows);
  const errors = rows.filter((row) => row.status === 'error' || row.error).length;

  let phaseText = 'Tạm dừng';
  let indicatorClass = "bg-slate-300";
  let statsPhaseClass = "text-slate-700";

  if (state?.running) {
    if (state.phase === 'paused') {
      phaseText = 'Đã tạm dừng';
      indicatorClass = "bg-amber-400";
      statsPhaseClass = "text-amber-600";
    } else if (state.phase === 'sending') {
      phaseText = 'Đang gửi tin';
      indicatorClass = "bg-emerald-500 animate-ping";
      statsPhaseClass = "text-emerald-600";
    } else if (state.phase === 'polling') {
      phaseText = 'Đang lấy phản hồi';
      indicatorClass = "bg-cyan-500 animate-ping";
      statsPhaseClass = "text-cyan-600";
    }
  } else if (rows.length > 0 && doneCount === rows.length) {
    phaseText = 'Đã hoàn tất';
    statsPhaseClass = "text-slate-800";
  }

  // Update DOM values
  const statsIndicator = document.getElementById("statsIndicator");
  const statsPhase = document.getElementById("statsPhase");
  const statsPending = document.getElementById("statsPending");
  const statsWatching = document.getElementById("statsWatching");
  const statsDone = document.getElementById("statsDone");
  const statsErrors = document.getElementById("statsErrors");

  if (statsIndicator) statsIndicator.className = `w-2 h-2 rounded-full ${indicatorClass}`;
  if (statsPhase) {
    statsPhase.className = `font-bold ${statsPhaseClass}`;
    statsPhase.innerText = phaseText;
  }

  if (statsPending) statsPending.innerText = pendingCount;
  if (statsWatching) statsWatching.innerText = waitReplyCount;
  if (statsDone) statsDone.innerText = doneCount;
  if (statsErrors) statsErrors.innerText = errors;

  const errorBoxBg = document.getElementById("errorBoxBg");
  if (errors > 0) {
    errorBoxBg?.classList.add("bg-rose-50", "px-1.5", "py-0.5", "rounded-md");
    if (statsErrors) statsErrors.className = "text-sm text-rose-600 font-extrabold leading-none";
  } else {
    errorBoxBg?.classList.remove("bg-rose-50", "px-1.5", "py-0.5", "rounded-md");
    if (statsErrors) statsErrors.className = "text-sm text-slate-900 font-extrabold leading-none";
  }
}

/**
 * Hiển thị thông báo trạng thái hoạt động của Worker.
 */
function setStatus(text, isError = false, options = {}) {
  const message = String(text || '').trim();
  if (options.fromBatch && message && message === dismissedStatusText) return;
  if (!options.fromBatch && message) dismissedStatusText = '';

  if (message) {
    if (options.fromBatch) dismissedStatusText = message;
    showToast(message, isError ? "error" : "info");
  }
}

/**
 * Vẽ bảng hàng chờ gửi.
 */
function renderQueueTable() {
  const tbody = document.getElementById("queueTableBody");
  const emptyState = document.getElementById("emptyTableState");
  const tableContainer = document.getElementById("tableContainer");

  if (!tbody) return;

  // Lưu vị trí scroll trước khi re-render để tránh nhảy lên đầu
  const scrollParent = tableContainer?.closest('.overflow-y-auto, .overflow-auto') || tableContainer?.parentElement;
  const savedScrollTop = scrollParent?.scrollTop || 0;
  const savedWindowScrollY = window.scrollY;

  const filtered = getFilteredQueueRows();

  if (filtered.length === 0) {
    emptyState?.classList.remove("hidden");
    tableContainer?.classList.add("hidden");
    return;
  }

  emptyState?.classList.add("hidden");
  tableContainer?.classList.remove("hidden");

  const stateBadgeColors = {
    "pending": "bg-slate-100 text-slate-500 border-slate-200",
    "wait_reply": "bg-cyan-50 text-cyan-600 border-cyan-150 animate-pulse font-extrabold",
    "done": "bg-emerald-50 text-emerald-600 border-emerald-100 font-extrabold",
    "error": "bg-rose-50 text-rose-600 border-rose-100"
  };

  const stateTexts = {
    "pending": "Chờ gửi",
    "wait_reply": "Đang theo dõi",
    "done": "Hoàn tất",
    "error": "Lỗi"
  };

  const visibleHeaders = ['media_id', 'message', 'replies', 'send_at', 'note', 'wait_reply', 'error', 'updatedAt', 'id', 'sys_phone', 'sent_qid', 'reply_qids', 'media_name', 'media_thumbnail', 'sentAt', 'raw_error', 'zid'];

  // Lấy trạng thái của các checkbox debug
  const debugIdChecked = document.querySelector('.debug-col-toggle[value="id"]')?.checked;
  const debugSysPhoneChecked = document.querySelector('.debug-col-toggle[value="sys_phone"]')?.checked;
  const debugSentQidChecked = document.querySelector('.debug-col-toggle[value="sent_qid"]')?.checked;
  const debugReplyQidsChecked = document.querySelector('.debug-col-toggle[value="reply_qids"]')?.checked;
  const debugMediaNameChecked = document.querySelector('.debug-col-toggle[value="media_name"]')?.checked;
  const debugMediaThumbnailChecked = document.querySelector('.debug-col-toggle[value="media_thumbnail"]')?.checked;
  const debugSentAtChecked = document.querySelector('.debug-col-toggle[value="sentAt"]')?.checked;
  const debugRawErrorChecked = document.querySelector('.debug-col-toggle[value="raw_error"]')?.checked;

  tbody.innerHTML = filtered.map((row, index) => {
    const isChecked = selectedQueueIds.has(row.id);
    const rowId = row.id;
    const stateValue = row.status || 'pending';
    const badgeColor = stateBadgeColors[stateValue] || "bg-slate-100 text-slate-700";
    const tagColor = getCanonicalTagColor(row.values?.tag, row.values?.tag_color || row.tagColor || "#4f46e5");

    const stateBadgeHtml = `
      <td class="px-2 py-2.5">
        <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold shadow-2xs cursor-default select-none whitespace-nowrap ${badgeColor}">
          ${escapeHtml(stateTexts[stateValue] || stateValue)}
        </span>
      </td>
    `;

    const cells = visibleHeaders.map((header) => {
      let value = row.values?.[header] ?? '';
      if (header === 'id') value = row.id || '';
      if (header === 'sentAt') {
        const d = new Date(row.sentAt);
        value = (row.sentAt && !isNaN(d.getTime())) ? d.toISOString() : '';
      }
      if (header === 'raw_error') value = row.error || '';
      if (header === 'updatedAt') value = row.updatedAt || '';
      if (header === 'name') value = stripZaloTags(value || row.values?.display_name || '');
      if (header === 'display_name') value = stripZaloTags(value);
      if (header === 'phone') value = formatDisplayPhone(row.values?.phone || row.values?.sys_phone || '');
      if (header === 'replies') value = (row.replies || []).join('\n');
      if (header === 'reply_qids') value = (row.reply_qids || []).join(', ');
      if (header === 'error') value = row.error || '';

      if (header === 'media_id') {
        const thumbnail = row.values?.media_thumbnail || '';
        const name = row.values?.media_name || 'Ảnh đính kèm';
        if (thumbnail) {
          return `
            <td class="${getQueueCellClass(header)}">
              <div class="flex items-center justify-center">
                <div class="relative w-10 h-10 rounded border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0 cursor-zoom-in group/img">
                  <img src="${thumbnail}" class="w-full h-full object-cover rounded" title="${escapeHtml(name)}">
                  <button type="button" data-remove-queue-image="${escapeHtml(rowId)}" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-sm flex items-center justify-center cursor-pointer z-10" title="Xoá ảnh">
                    <i data-lucide="x" class="w-2.5 h-2.5 stroke-[3]"></i>
                  </button>
                  <!-- Tooltip xem trước lớn khi hover -->
                  <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-0 group-hover/img:scale-100 bg-white border border-slate-200 rounded-lg shadow-2xl p-1 z-[9999] pointer-events-none transition-all duration-150">
                    <img src="${thumbnail}" class="w-48 h-48 object-cover rounded-lg">
                    <div class="text-[10px] text-slate-500 font-bold text-center mt-1 w-48 truncate">${escapeHtml(name)}</div>
                  </div>
                </div>
              </div>
            </td>
          `;
        }
        return `<td class="${getQueueCellClass(header)} text-slate-300 text-center">—</td>`;
      }

      if (header === 'send_at' || header === 'updatedAt') {
        let cls = getQueueCellClass(header);
        return `<td class="${cls}">${formatTimeTwoLines(value)}</td>`;
      }

      if (header === 'note') {
        const isReminder = String(value || '').trim().toLowerCase() === 'reminder';
        return `
          <td class="${getQueueCellClass(header)}">
            ${isReminder ? '<i data-lucide="alarm-clock" class="w-4 h-4 text-amber-500 inline-block" title="Nhắc hẹn"></i>' : '<span class="text-slate-300">—</span>'}
          </td>
        `;
      }

      if (header === 'wait_reply') {
        const checked = String(value).trim().toLowerCase() === 'x' || row.wait_reply === true ? ' checked' : '';
        return `
          <td class="${getQueueCellClass(header)}">
            <label class="inline-flex items-center justify-center cursor-pointer">
              <input type="checkbox" class="sr-only wait-reply-check peer" data-row-id="${rowId}" data-header="wait_reply"${checked}>
              <div class="w-3.5 h-3.5 bg-white border border-slate-300 rounded flex items-center justify-center peer-checked:bg-emerald-600 peer-checked:border-emerald-600 transition-all">
                <i data-lucide="check" class="text-white w-2 h-2 stroke-[4] hidden peer-checked:block"></i>
              </div>
            </label>
          </td>
        `;
      }

      const editable = !['media_id', 'note', 'replies', 'error', 'updatedAt'].includes(header);
      
      let finalCellClass = getQueueCellClass(header);
      if (header === 'id' && debugIdChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'sys_phone' && debugSysPhoneChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'sent_qid' && debugSentQidChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'reply_qids' && debugReplyQidsChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'media_name' && debugMediaNameChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'media_thumbnail' && debugMediaThumbnailChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'sentAt' && debugSentAtChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();
      if (header === 'raw_error' && debugRawErrorChecked) finalCellClass = finalCellClass.replace('hidden', '').trim();

      if (header === 'message') {
        const divAttrs = `contenteditable="true" data-row-id="${rowId}" data-header="${escapeHtml(header)}" spellcheck="false" class="max-h-[110px] overflow-y-auto whitespace-pre-wrap break-words leading-snug w-full focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all"`;
        return `<td class="${finalCellClass}"><div ${divAttrs}>${escapeHtml(value)}</div></td>`;
      }
      if (header === 'replies') {
        const replyLines = (row.replies || []);
        const replyHtml = replyLines.map(r => `<div>${escapeHtml(r)}</div>`).join('');
        const divClasses = "max-h-[110px] overflow-y-auto leading-snug text-indigo-700 font-extrabold bg-indigo-50/30 p-1.5 -mx-1.5 rounded w-full block";
        return `<td class="${finalCellClass}"><div class="${divClasses}">${replyHtml}</div></td>`;
      }

      const attrs = editable
        ? ` contenteditable="true" data-row-id="${rowId}" data-header="${escapeHtml(header)}" spellcheck="false" class="${finalCellClass} focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all"`
        : '';
      return editable
        ? `<td${attrs}>${escapeHtml(value)}</td>`
        : `<td class="${finalCellClass}">${escapeHtml(value)}</td>`;
    });

    return `
      <tr class="hover:bg-slate-50 transition-colors ${isChecked ? 'bg-indigo-50/10' : ''} text-[12px]" data-row-id="${rowId}">
        <td class="px-3 py-1.5 select-none">
          <label class="inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              ${isChecked ? 'checked' : ''} 
              class="w-3.5 h-3.5 rounded border-slate-300 accent-emerald-600 queue-row-checkbox cursor-pointer"
              data-row-id="${rowId}"
            >
          </label>
        </td>
        <td class="px-2 py-1.5 text-center font-bold text-slate-400 select-none">${index + 1}</td>
        ${stateBadgeHtml}
        ${renderQueueRecipientCell(row, tagColor)}
        ${cells.join('')}
      </tr>
    `;
  }).join("");

  // Bắt các sự kiện click và thay đổi trong Table
  tbody.querySelectorAll('.queue-row-checkbox').forEach(chk => {
    chk.addEventListener('change', () => {
      toggleQueueRowCheckbox(chk.dataset.rowId);
    });
  });

  tbody.querySelectorAll('input.wait-reply-check').forEach(chk => {
    chk.addEventListener('change', async () => {
      try {
        await saveEditedCell(chk.dataset.rowId, 'wait_reply', chk.checked ? 'x' : '');
      } catch (err) {
        showToast(err?.message || 'Không cập nhật được wait_reply.', true);
        await pollStatus();
      }
    });
  });

  tbody.querySelectorAll('[data-remove-queue-image]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        await removeQueueRowImage(btn.dataset.removeQueueImage);
      } catch (err) {
        showToast(err?.message || 'Không xoá được ảnh khỏi hàng chờ.', 'error');
        await pollStatus();
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();

  // Phục hồi vị trí scroll sau khi re-render để tránh nhảy lên đầu
  if (scrollParent && savedScrollTop > 0) {
    scrollParent.scrollTop = savedScrollTop;
  }
  if (savedWindowScrollY > 0) {
    window.scrollTo(0, savedWindowScrollY);
  }
}

/**
 * Truy vấn dữ liệu hàng chờ từ Background Worker và tiến hành Render.
 */
async function pollStatus() {
  const resp = await sendMessage({ type: 'GET_QUEUE' });
  if (resp.ok && resp.queue && resp.state) {
    latestQueue = resp.queue;
    latestWorkerState = resp.state;

    if (editingCell || window.getSelection().toString().trim().length > 0) {
      updateSummary(latestQueue, latestWorkerState);
      if (latestWorkerState.message) setStatus(latestWorkerState.message, false, { fromBatch: true });
      return;
    }

    updateSummary(latestQueue, latestWorkerState);
    if (latestWorkerState.message) setStatus(latestWorkerState.message, false, { fromBatch: true });
    renderQueueTagFilter();
    renderQueueTable();
    syncBulkActionsState();

    // Điều khiển ẩn/hiện nút Điều phối dựa trên status worker
    const running = latestWorkerState.running;
    const phase = latestWorkerState.phase;
    const startBtn = document.getElementById("startCampaignBtn");
    const pauseBtn = document.getElementById("pauseCampaignBtn");
    const stopBtn = document.getElementById("stopCampaignBtn");

    if (!running) {
      if (startBtn) {
        startBtn.classList.remove("hidden");
        startBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Bắt đầu gửi`;
      }
      pauseBtn?.classList.add("hidden");
      stopBtn?.classList.add("hidden");
    } else if (phase === 'paused') {
      if (startBtn) {
        startBtn.classList.remove("hidden");
        startBtn.innerHTML = `<i data-lucide="play" class="w-3.5 h-3.5"></i> Tiếp tục`;
      }
      pauseBtn?.classList.add("hidden");
      stopBtn?.classList.remove("hidden");
    } else {
      startBtn?.classList.add("hidden");
      pauseBtn?.classList.remove("hidden");
      stopBtn?.classList.remove("hidden");
    }
    if (window.lucide) window.lucide.createIcons();

  } else {
    setStatus(resp.error || 'Không đọc được trạng thái hàng chờ.', true);
  }
}

/**
 * Khởi động Worker chạy gửi tin nhắn hàng chờ.
 */
async function startWorkerProcessing() {
  const resp = await sendMessage({ type: 'START_WORKER' });
  if (!resp.ok) throw new Error(resp.error || 'Không khởi động được worker.');
  showToast('Hàng chờ đang hoạt động gửi tin!');
  await pollStatus();
}

/**
 * Tạm dừng Worker.
 */
async function pauseWorkerProcessing() {
  const resp = await sendMessage({ type: 'PAUSE_WORKER' });
  if (!resp.ok) throw new Error(resp.error || 'Không tạm dừng được worker.');
  showToast('Đã tạm dừng gửi tin nhắn.');
  await pollStatus();
}

/**
 * Dừng hoàn toàn và hoàn tất Worker.
 */
async function stopWorkerProcessing() {
  const resp = await sendMessage({ type: 'STOP_WORKER' });
  if (!resp.ok) throw new Error(resp.error || 'Không thể dừng worker.');
  showToast('Đã dừng chiến dịch gửi tin.');
  await pollStatus();
}

function capitalizeFirstLetter(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function getMessageSalutation(value) {
  return String(value || '').replace(/🙎🏻‍♂️|🙎‍♀️/g, '').trim() || 'bạn';
}

function findActiveQueueRowByZid(zid) {
  const zidText = String(zid || '').trim();
  if (!zidText || !latestQueue?.byId) return null;
  return Object.values(latestQueue.byId)
    .filter((row) => String(row.values?.zid || '').trim() === zidText)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

function askDuplicateZidOverwrite(count) {
  return window.confirm(
    `Có ${count} liên hệ trùng zid với dòng chưa Hoàn tất trong hàng chờ.\nBấm OK để ghi đè các dòng đó và đưa về Chờ gửi.\nBấm Hủy để không thêm các liên hệ bị trùng.`
  );
}

async function pauseWorkerBeforeQueueChange() {
  if (!latestWorkerState?.running || latestWorkerState.phase === 'paused') return;
  const resp = await sendMessage({ type: 'PAUSE_WORKER' });
  if (!resp.ok) throw new Error(resp.error || 'Không tạm dừng được worker trước khi thêm hàng chờ.');
  latestWorkerState = { ...latestWorkerState, phase: 'paused' };
}

function resetComposerAfterQueueAdd() {
  selectedDirectoryIds.clear();
  const messageInput = document.getElementById("composerMessage");
  const charCount = document.getElementById("composerCharCount");
  const timeInput = document.getElementById("composerScheduleTime");
  const waitReplyInput = document.getElementById("composerWaitReply");
  const reminderInput = document.getElementById("composerReminder");

  if (messageInput) messageInput.value = "";
  if (charCount) charCount.innerText = "0 ký tự";
  if (timeInput) timeInput.value = "";
  if (waitReplyInput) waitReplyInput.checked = false;
  if (reminderInput) reminderInput.checked = false;
  if (typeof clearComposerAttachedImage === 'function') {
    clearComposerAttachedImage();
  }
  if (typeof syncComposerReminderControls === 'function') {
    syncComposerReminderControls();
  }
}

/**
 * Đẩy các liên hệ đã được đánh dấu chọn cùng nội dung tin nhắn soạn thảo xuống hàng chờ gửi.
 */
async function addSelectedToQueue() {
  if (selectedDirectoryIds.size === 0) {
    showToast("Vui lòng chọn ít nhất một số liên hệ!", "error");
    return;
  }

  const rawMsg = document.getElementById("composerMessage").value;
  const rawTime = document.getElementById("composerScheduleTime").value;
  const isReminder = !!document.getElementById("composerReminder")?.checked;
  const waitReply = isReminder ? false : document.getElementById("composerWaitReply").checked;

  if (!rawMsg.trim() && !composerAttachedImage) {
    showToast("Vui lòng nhập nội dung tin nhắn hoặc đính kèm hình ảnh!", "error");
    document.getElementById("composerMessage").focus();
    return;
  }

  if (isReminder && !rawTime) {
    showToast("Vui lòng chọn ngày giờ nhắc hẹn.", "error");
    document.getElementById("composerScheduleTime")?.focus();
    return;
  }

  let sendAtMs = 0;
  if (rawTime) {
    sendAtMs = new Date(rawTime).getTime();
  }

  // Đăng ký ảnh lên Media Store ngầm của Extension trước
  let mediaId = null;
  if (!isReminder && composerAttachedImage) {
    const base64 = composerAttachedImage.base64;
    const name = composerAttachedImage.name;
    const hash = 'img_' + Math.abs(base64.slice(0, 100).split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(16);
    mediaId = hash;

    const regResp = await sendMessage({
      type: 'REGISTER_MEDIA',
      mediaId: mediaId,
      base64: base64,
      thumbnail: composerAttachedImage.thumbnail,
      name: name
    });
    if (!regResp.ok) {
      showToast(regResp.error || "Không đăng ký được hình ảnh lên hệ thống.", "error");
      return;
    }
  }

  const listToEnqueue = latestContacts.filter(c => selectedDirectoryIds.has(c.phone || c.sys_phone || c.zid || c.display_name));
  if (listToEnqueue.length === 0) {
    showToast("Không tìm thấy liên hệ hợp lệ để thêm vào hàng chờ.", "error");
    return;
  }

  try {
    await pauseWorkerBeforeQueueChange();
    const queueResp = await sendMessage({ type: 'GET_QUEUE' });
    if (queueResp.ok && queueResp.queue && queueResp.state) {
      latestQueue = queueResp.queue;
      latestWorkerState = queueResp.state;
    }
  } catch (err) {
    showToast(err?.message || "Không tạm dừng được hàng chờ trước khi thêm.", "error");
    return;
  }

  const duplicateRowsByZid = new Map();
  window._autoOverwrite = new Map();
  listToEnqueue.forEach((contact) => {
    const duplicate = findActiveQueueRowByZid(contact.zid);
    if (duplicate) {
      if (duplicate.status === 'done') {
        window._autoOverwrite = window._autoOverwrite || new Map();
        window._autoOverwrite.set(String(contact.zid).trim(), duplicate);
      } else {
        duplicateRowsByZid.set(String(contact.zid).trim(), duplicate);
      }
    }
  });

  let shouldOverwriteDuplicates = false;
  if (duplicateRowsByZid.size > 0) {
    shouldOverwriteDuplicates = askDuplicateZidOverwrite(duplicateRowsByZid.size);
  }

  const newRows = [];
  const overwriteIds = [];

  listToEnqueue.forEach(contact => {
    const salutation = getMessageSalutation(contact['_a/c']);
    const name = contact._name || contact.display_name?.split(" - ")?.[1] || "quý khách";

    // Cá nhân hóa nội dung tin nhắn thay thế {a}/{A} bằng xưng hô, {n} bằng tên riêng
    let personalizedMsg = rawMsg
      .replace(/{A}/g, capitalizeFirstLetter(salutation))
      .replace(/{a}/g, salutation)
      .replace(/{n}/g, name);

    const rowValues = {
      name: contact.display_name || contact.name || '',
      phone: contact.phone || '',
      zid: contact.zid || '',
      send_at: sendAtMs || 0,
      wait_reply: waitReply ? 'x' : '',
      note: isReminder ? 'reminder' : '',
      message: personalizedMsg,
      display_name: contact.display_name || '',
      tag: contact.tag || '',
      tag_color: contact.tag_color || '',
      sys_phone: contact.sys_phone || '',
      media_id: mediaId || '',
      media_name: !isReminder && composerAttachedImage ? composerAttachedImage.name : '',
      media_thumbnail: !isReminder && composerAttachedImage ? composerAttachedImage.thumbnail : '',
      avatar: contact.avatar || ''
    };

    const zidKey = String(contact.zid || '').trim();
    const duplicate = duplicateRowsByZid.get(zidKey);
    const autoOverwrite = window._autoOverwrite?.get(zidKey);
    if (autoOverwrite) {
      overwriteIds.push(autoOverwrite.id);
      newRows.push(rowValues);
    } else if (duplicate && shouldOverwriteDuplicates) {
      overwriteIds.push(duplicate.id);
      newRows.push(rowValues);
    } else if (!duplicate && !autoOverwrite) {
      newRows.push(rowValues);
    }
  });

  if (newRows.length === 0) {
    showToast("Không có liên hệ mới để thêm vào hàng chờ.", "info");
    return;
  }

  if (overwriteIds.length > 0) {
    const removeResp = await sendMessage({
      type: 'REMOVE_ROWS',
      ids: Array.from(new Set(overwriteIds))
    });
    if (!removeResp.ok) {
      showToast(removeResp.error || "Không xóa được dòng cũ trước khi ghi đè.", "error");
      return;
    }
  }

  if (newRows.length > 0) {
    // Gọi API đẩy dòng vào background queue
    const resp = await sendMessage({
      type: 'ADD_ROWS',
      rows: newRows,
      headers: TEMPLATE_HEADERS
    });

    if (!resp.ok) {
      showToast(resp.error || "Không đẩy được dòng vào hàng chờ.", "error");
      return;
    }
  }

  resetComposerAfterQueueAdd();

  showToast(`Đã xử lý ${listToEnqueue.length} liên hệ: thêm mới ${newRows.length - overwriteIds.length}, ghi đè ${overwriteIds.length}.`);
  await pollStatus();
  updateUI();
}

// Logic cho Debug Columns (Sử dụng Event Delegation vì HTML load động)
document.addEventListener('click', (e) => {
  const debugBtn = e.target.closest('#debugColumnsBtn');
  const debugDropdown = document.getElementById('debugColumnsDropdown');
  
  if (debugBtn && debugDropdown) {
    debugDropdown.classList.toggle('hidden');
    e.stopPropagation();
  } else if (debugDropdown && !e.target.closest('#debugColumnsDropdown')) {
    debugDropdown.classList.add('hidden');
  }
});

document.addEventListener('change', (e) => {
  if (e.target.classList.contains('debug-col-toggle')) {
    const col = e.target.value;
    const ths = document.querySelectorAll(`.debug-th-${col}`);
    const tds = document.querySelectorAll(`.debug-td-${col}`);
    if (e.target.checked) {
      ths.forEach(el => el.classList.remove('hidden'));
      tds.forEach(el => el.classList.remove('hidden'));
    } else {
      ths.forEach(el => el.classList.add('hidden'));
      tds.forEach(el => el.classList.add('hidden'));
    }
  }
});
