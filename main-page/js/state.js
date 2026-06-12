/**
 * @file state.js
 * @description Quản lý trạng thái toàn cục của giao diện Z-Campaigner AI và các hằng số.
 */

// STATE TOÀN CỤC CỦA GIAO DIỆN
let latestQueue = null;
let latestWorkerState = null;
let latestContacts = [];
let selectedDirectoryIds = new Set();
let selectedQueueIds = new Set();
let currentDirectoryTagFilter = "Tất cả";
let directorySearchQuery = "";
let queueSearchQuery = "";
let queueStatusFilter = "";
let queueTagFilter = "";
let contactTagFilter = "";
let contactSortField = "";
let contactSortDirection = "asc";
let aiNormalizerResultsCache = [];
let pollTimer = null;
let dismissedStatusText = "";
let editingCell = null;
let composerAttachedImage = null; // { name: string, base64: string, mediaId: string|null }

// ĐỊNH NGHĨA HEADERS CHO IMPORT/EXPORT TEMPLATE
const TEMPLATE_HEADERS = ['name', 'phone', 'send_at', 'note', 'wait_reply', 'message', 'zid'];
const HIDDEN_TABLE_HEADERS = ['sys_phone'];
const REPLY_COLLECTION_LIMIT_KEY = 'replyCollectionLimit';

const TEMPLATE_NOTE_ROW = {
  name: 'Không bắt buộc. Nhập đúng tên Zalo để map zid đã lưu; tên có thể chứa SĐT để hệ thống tách ra match.',
  zid: 'Không bắt buộc nếu có name hoặc phone. Nếu biết zid thì nhập để gửi trực tiếp và lưu mapping.',
  phone: 'Không bắt buộc. Chấp nhận 987654321, 0987654321, 84987654321 hoặc +84987654321; phone_normalized lưu dạng 987654321.',
  send_at: 'Không bắt buộc. Thời gian hẹn gửi, ví dụ 2026-06-02 14:30. Bỏ trống thì gửi ngay.',
  note: 'Không bắt buộc. Nhập reminder nếu muốn tạo nhắc hẹn Zalo thay vì gửi tin nhắn.',
  wait_reply: 'Không bắt buộc. Nhập x nếu cần chờ và lấy phản hồi sau khi gửi.',
  message: 'Bắt buộc. Nội dung tin nhắn cần gửi.'
};

// GEMINI API CONFIGURATION
let apiKey = "";
