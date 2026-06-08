/**
 * Z-Campaigner AI — Popup Controller
 * File popup.js chịu trách nhiệm hiển thị trạng thái nhanh của worker gửi tin
 * và chuyển hướng người dùng đến giao diện điều khiển chính.
 */

const openDashboardBtn = document.getElementById('openDashboardBtn');
const syncNowLink = document.getElementById('syncNowLink');
const workerStatusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const pendingCountEl = document.getElementById('pendingCount');
const contactsCountEl = document.getElementById('contactsCount');

/**
 * Gửi thông điệp đến Background Service Worker.
 * @param {Object} message - Thông điệp cần gửi
 * @returns {Promise<Object>}
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
 * Nạp thông tin trạng thái hàng chờ và worker từ Background.
 */
async function loadStatus() {
  try {
    const queueResp = await sendMessage({ type: 'GET_QUEUE' });
    if (queueResp.ok && queueResp.state && queueResp.queue) {
      const state = queueResp.state;
      const queue = queueResp.queue;

      // Đếm số dòng pending
      const rows = Object.values(queue.byId || {});
      const pendingCount = rows.filter((row) => ['pending', 'sending'].includes(row.status)).length;
      pendingCountEl.textContent = pendingCount;

      // Trạng thái hoạt động
      if (state.running) {
        statusDot.className = 'dot active';
        if (state.phase === 'paused') {
          workerStatusText.textContent = 'Tạm dừng';
          statusDot.className = 'dot';
        } else if (state.phase === 'sending') {
          workerStatusText.textContent = 'Đang gửi tin';
        } else if (state.phase === 'polling') {
          workerStatusText.textContent = 'Chờ phản hồi';
        } else {
          workerStatusText.textContent = 'Đang chạy';
        }
      } else {
        statusDot.className = 'dot';
        workerStatusText.textContent = 'Tắt';
      }
    } else {
      workerStatusText.textContent = 'Ngoại tuyến';
      statusDot.className = 'dot';
    }
  } catch (err) {
    workerStatusText.textContent = 'Lỗi kết nối';
    statusDot.className = 'dot';
  }

  try {
    const contactsResp = await sendMessage({ type: 'GET_CONTACTS' });
    if (contactsResp.ok && contactsResp.contacts) {
      contactsCountEl.textContent = contactsResp.contacts.length;
    }
  } catch (err) {
    contactsCountEl.textContent = '—';
  }
}

/**
 * Mở tab trang giao diện điều khiển chính của extension.
 */
async function openDashboard() {
  const url = chrome.runtime.getURL('main-page/main.html');
  chrome.tabs.create({ url });
  window.close();
}

/**
 * Đồng bộ danh bạ nhanh từ Zalo.
 */
async function quickSyncContacts() {
  workerStatusText.textContent = 'Đang đồng bộ...';
  statusDot.className = 'dot active';
  try {
    const resp = await sendMessage({ type: 'SYNC_CONTACTS' });
    if (resp.ok) {
      workerStatusText.textContent = 'Xong!';
      setTimeout(loadStatus, 1000);
    } else {
      workerStatusText.textContent = 'Đồng bộ lỗi';
      statusDot.className = 'dot';
    }
  } catch (err) {
    workerStatusText.textContent = 'Lỗi kết nối';
    statusDot.className = 'dot';
  }
}

// Đăng ký sự kiện click
openDashboardBtn.addEventListener('click', openDashboard);
syncNowLink.addEventListener('click', quickSyncContacts);

// Khởi chạy nạp status lúc mở popup
document.addEventListener('DOMContentLoaded', loadStatus);
