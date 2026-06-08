/**
 * @file utils.js
 * @description Các hàm tiện ích dùng chung trong toàn bộ ứng dụng.
 */

/**
 * Gửi thông điệp đến Background Service Worker của Extension.
 * @param {Object} message - Đối tượng thông điệp cần gửi
 * @returns {Promise<Object>} Phản hồi từ background
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || { ok: false, error: 'Không nhận được phản hồi.' });
    });
  });
}

/**
 * Hiển thị Toast thông báo ở góc màn hình.
 * @param {string} message - Nội dung thông báo
 * @param {string} [type="success"] - Loại thông báo: success | error | info
 */
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");

  if (!toast || !toastMsg || !toastIcon) return;

  toastMsg.innerText = message;

  if (type === "success") {
    toastIcon.className = "p-1 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0";
    toastIcon.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 stroke-[4]"></i>`;
  } else if (type === "error") {
    toastIcon.className = "p-1 rounded-full bg-rose-500 text-white flex items-center justify-center flex-shrink-0";
    toastIcon.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>`;
  } else {
    toastIcon.className = "p-1 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0";
    toastIcon.innerHTML = `<i data-lucide="info" class="w-3.5 h-3.5"></i>`;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  toast.classList.remove("translate-y-24", "opacity-0", "pointer-events-none");
  toast.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    toast.classList.add("translate-y-24", "opacity-0", "pointer-events-none");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 3000);
}

/** Biến nội bộ theo dõi timer undo đang hoạt động */
let _undoTimer = null;
let _undoEl = null;

/**
 * Hiển thị mini popup có nút Undo trong 10 giây.
 * Nếu hết 10 giây mà không undo thì gọi onCommit để thực hiện hành động thật.
 * @param {string} message - Thông báo hiển thị
 * @param {Function} onUndo - Hàm gọi khi bấm Undo
 * @param {Function} onCommit - Hàm gọi khi hết thời gian chờ (thực hiện xoá thật)
 */
function showUndoToast(message, onUndo, onCommit) {
  // Huỷ undo cũ nếu có, commit luôn
  if (_undoTimer) {
    clearTimeout(_undoTimer);
    _undoTimer = null;
  }
  if (_undoEl) {
    _undoEl.remove();
    _undoEl = null;
  }

  const el = document.createElement('div');
  el.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 z-[9999] animate-fade-in';
  el.style.transition = 'opacity 0.2s, transform 0.2s';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'text-xs font-semibold';
  msgSpan.innerText = message;

  const countdownSpan = document.createElement('span');
  countdownSpan.className = 'text-[10px] text-slate-400 font-mono tabular-nums min-w-[24px] text-center';
  countdownSpan.innerText = '10s';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-lg transition-all active:scale-95';
  undoBtn.innerText = 'Hoàn tác';

  el.appendChild(msgSpan);
  el.appendChild(countdownSpan);
  el.appendChild(undoBtn);
  document.body.appendChild(el);
  _undoEl = el;

  let secondsLeft = 10;

  const countdownInterval = setInterval(() => {
    secondsLeft--;
    countdownSpan.innerText = `${secondsLeft}s`;
    if (secondsLeft <= 0) clearInterval(countdownInterval);
  }, 1000);

  /** Gỡ popup và dọn dẹp */
  function dismiss() {
    clearTimeout(_undoTimer);
    clearInterval(countdownInterval);
    _undoTimer = null;
    if (_undoEl === el) _undoEl = null;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => el.remove(), 200);
  }

  undoBtn.addEventListener('click', () => {
    dismiss();
    if (typeof onUndo === 'function') onUndo();
    showToast('Đã hoàn tác!', 'info');
  });

  _undoTimer = setTimeout(() => {
    dismiss();
    if (typeof onCommit === 'function') onCommit();
  }, 10000);
}

/**
 * Xử lý sự kiện paste ảnh từ clipboard vào ô soạn tin nhắn.
 * Cho phép dán ảnh trực tiếp từ clipboard mà không cần dùng nút chọn file.
 * @param {ClipboardEvent} e - Sự kiện paste
 */
async function handleComposerPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;

      try {
        const res = await compressAndCropImage(file);
        composerAttachedImage = {
          name: file.name || 'clipboard-image.png',
          base64: res.base64,
          thumbnail: res.thumbnail,
          mediaId: null
        };

        const previewWrapper = document.getElementById("imagePreviewWrapper");
        const uploadWrapper = document.getElementById("imageUploadWrapper");
        const previewImg = document.getElementById("composerImagePreview");
        const imageName = document.getElementById("composerImageName");

        if (previewImg) previewImg.src = res.thumbnail;
        if (imageName) imageName.innerText = file.name || 'clipboard-image.png';

        uploadWrapper?.classList.add("hidden");
        previewWrapper?.classList.remove("hidden");
        showToast("Đã dán ảnh từ clipboard!");
      } catch (err) {
        showToast(err?.message || 'Không thể xử lý hình ảnh từ clipboard.', 'error');
      }
      return; // Chỉ xử lý 1 ảnh
    }
  }
}

/**
 * Loại bỏ các dòng trùng zid trong hàng chờ khi load lần đầu.
 * Ưu tiên giữ: pending/wait_reply > các trạng thái khác, thời gian mới nhất.
 * @returns {Promise<void>}
 */
async function deduplicateQueueByZid() {
  if (!latestQueue?.byId) return;

  const rows = Object.values(latestQueue.byId);
  const byZid = new Map();

  rows.forEach(row => {
    const zid = String(row.values?.zid || '').trim();
    if (!zid) return;

    if (!byZid.has(zid)) {
      byZid.set(zid, row);
    } else {
      const existing = byZid.get(zid);
      // Ưu tiên trạng thái pending/wait_reply
      const keepStatuses = ['pending', 'wait_reply'];
      const existingKeep = keepStatuses.includes(existing.status);
      const newKeep = keepStatuses.includes(row.status);

      if (newKeep && !existingKeep) {
        byZid.set(zid, row);
      } else if (newKeep === existingKeep) {
        // Cùng mức ưu tiên trạng thái → lấy cái mới nhất
        if ((row.createdAt || 0) > (existing.createdAt || 0)) {
          byZid.set(zid, row);
        }
      }
    }
  });

  // Tìm các row cần xoá (trùng zid nhưng không phải row giữ lại)
  const keepIds = new Set([...byZid.values()].map(r => r.id));
  const duplicateIds = rows
    .filter(r => {
      const zid = String(r.values?.zid || '').trim();
      return zid && !keepIds.has(r.id) && byZid.has(zid);
    })
    .map(r => r.id);

  if (duplicateIds.length === 0) return;

  const resp = await sendMessage({
    type: 'REMOVE_ROWS',
    ids: duplicateIds
  });

  if (resp.ok) {
    console.log(`[deduplicateQueueByZid] Đã xoá ${duplicateIds.length} dòng trùng zid.`);
    await pollStatus();
  }
}

/**
 * Làm sạch chuỗi HTML đầu vào tránh XSS.
 * @param {string} text - Chuỗi cần làm sạch
 * @returns {string} Chuỗi an toàn
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Định dạng thời gian Unix timestamp sang chuỗi nội địa hóa tiếng Việt.
 * @param {number} value - Unix timestamp (ms)
 * @returns {string} Chuỗi hiển thị ngày giờ
 */
function formatTime(value) {
  const time = Number(value || 0);
  if (!time) return '';
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeTwoLines(value) {
  const time = Number(value || 0);
  if (!time) return '';
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  const dateText = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `
    <span class="block whitespace-nowrap">${escapeHtml(dateText)}</span>
    <span class="block whitespace-nowrap text-[10px] text-slate-400">${escapeHtml(date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))}</span>
  `;
}

function toLocalDateTimeInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplayPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[^\d+]/g, '');
  if (compact.startsWith('+84')) return `0${compact.slice(3)}`;
  if (compact.startsWith('84') && compact.length >= 11) return `0${compact.slice(2)}`;
  if (/^[1-9]\d{8,9}$/.test(compact)) return `0${compact}`;
  return raw;
}

function normalizeTagKey(tag) {
  return String(tag || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isValidHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || '').trim());
}

function getCanonicalTagColor(tag, fallback = '#4f46e5') {
  const key = normalizeTagKey(tag);
  if (!key) return fallback;

  const colors = [];
  (latestContacts || []).forEach((contact) => {
    if (normalizeTagKey(contact?.tag) === key && isValidHexColor(contact?.tag_color)) {
      colors.push(contact.tag_color);
    }
  });
  Object.values(latestQueue?.byId || {}).forEach((row) => {
    if (normalizeTagKey(row?.values?.tag) === key && isValidHexColor(row?.values?.tag_color)) {
      colors.push(row.values.tag_color);
    }
  });

  return colors[0] || fallback;
}

/**
 * Loại bỏ nhãn "Công việc" và định dạng số điện thoại thừa ở cuối tên hiển thị Zalo.
 * @param {string} text - Tên thô từ Zalo
 * @returns {string} Tên sạch
 */
function stripZaloTags(text) {
  let value = String(text ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+Công việc(?:\s.*)?$/i, '').trim();
  const phones = [...value.matchAll(/(?:\+?84|0)?[\d\s().-]{8,}/g)];
  if (phones.length) {
    const last = phones[phones.length - 1];
    const end = last.index + last[0].length;
    const tail = value.slice(end).trim().toLowerCase();
    if (tail === 'công việc' || tail.startsWith('công việc ')) value = value.slice(0, end).trim();
  }
  return value;
}

/**
 * Lấy ký tự viết tắt đại diện cho avatar từ liên hệ.
 * @param {Object} contact - Bản ghi liên hệ
 * @returns {string} 2 ký tự viết tắt
 */
function getInitials(contact) {
  const name = contact.display_name || contact.name || contact.phone || "U";
  const words = name.trim().split(" ");
  if (words.length >= 2) {
    return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Chuyển đổi tệp tin Excel/CSV thành chuỗi văn bản.
 * @param {File} file - Tệp CSV
 * @returns {Promise<string>} Nội dung file
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result;
        try {
          resolve(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
          return;
        } catch (_utf8Err) {
          resolve(new TextDecoder('windows-1258').decode(buffer));
          return;
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Không đọc được file CSV.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Đọc file dưới dạng Buffer mảng phục vụ thư viện SheetJS.
 * @param {File} file - File Excel/CSV
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Không đọc được file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Tải xuống dữ liệu hàng chờ/danh bạ dạng file Excel sử dụng thư viện XLSX.
 * @param {string} filename - Tên file tải về
 * @param {string[]} headers - Các trường dữ liệu tiêu đề
 * @param {Object[]} rows - Tập dữ liệu dòng
 */
function downloadXlsx(filename, headers, rows) {
  const wsData = rows.map(row => {
    const obj = {};
    headers.forEach(h => { obj[h] = row[h] || ''; });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(wsData, { header: headers });
  Object.keys(ws).forEach((addr) => {
    if (addr[0] !== '!' && ws[addr]?.v && String(ws[addr].v).includes('\n')) {
      ws[addr].s = { alignment: { wrapText: true, vertical: 'top' } };
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

/**
 * Chuyển đổi giữa các tab giao diện.
 * @param {string} tab - Tab cần chuyển đến ('campaign' | 'contacts')
 */
function switchTab(tab) {
  const tabCampaign = document.getElementById("campaignTab");
  const tabContacts = document.getElementById("contactsTab");
  const btnCampaign = document.getElementById("tabCampaignBtn");
  const btnContacts = document.getElementById("tabContactsBtn");

  if (tab === "campaign") {
    tabCampaign?.classList.remove("hidden");
    tabContacts?.classList.add("hidden");
    if (btnCampaign) btnCampaign.className = "flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all duration-150 bg-white text-slate-900 shadow-xs";
    if (btnContacts) btnContacts.className = "flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all duration-150";
  } else {
    tabCampaign?.classList.add("hidden");
    tabContacts?.classList.remove("hidden");
    if (btnCampaign) btnCampaign.className = "flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold text-slate-500 hover:text-slate-900 transition-all duration-150";
    if (btnContacts) btnContacts.className = "flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold transition-all duration-150 bg-white text-slate-900 shadow-xs";
  }
  updateUI();
}

/**
 * Nén hình ảnh và cắt trung tâm (crop center) để làm preview.
 * @param {File} file - File hình ảnh gốc
 * @returns {Promise<{name: string, base64: string, thumbnail: string}>}
 */
function compressAndCropImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        // --- 1. Tạo ảnh nén để gửi (giữ nguyên tỷ lệ, max kích thước 1000px) ---
        const maxDim = 1000;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvasSend = document.createElement('canvas');
        canvasSend.width = width;
        canvasSend.height = height;
        const ctxSend = canvasSend.getContext('2d');
        ctxSend.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvasSend.toDataURL('image/jpeg', 0.8);

        // --- 2. Tạo ảnh crop center vuông (120x120px) cho preview ---
        const previewSize = 120;
        const canvasPreview = document.createElement('canvas');
        canvasPreview.width = previewSize;
        canvasPreview.height = previewSize;
        const ctxPreview = canvasPreview.getContext('2d');

        // Tính toán tọa độ crop center
        let srcX = 0;
        let srcY = 0;
        let srcW = img.width;
        let srcH = img.height;

        if (img.width > img.height) {
          srcW = img.height;
          srcX = Math.round((img.width - img.height) / 2);
        } else if (img.height > img.width) {
          srcH = img.width;
          srcY = Math.round((img.height - img.width) / 2);
        }

        ctxPreview.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, previewSize, previewSize);
        const thumbnailBase64 = canvasPreview.toDataURL('image/jpeg', 0.85);

        resolve({
          name: file.name,
          base64: compressedBase64,
          thumbnail: thumbnailBase64
        });
      };
      img.onerror = () => reject(new Error('Không load được hình ảnh để xử lý.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.readAsDataURL(file);
  });
}
