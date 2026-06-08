/**
 * @file modals.js
 * @description Điều khiển ẩn/hiện, hiệu ứng chuyển động cho các Modals và UI Drawers.
 */

/**
 * Ẩn/Hiện Drawer Trợ lý kịch bản AI (bên phải).
 * @param {boolean} show 
 */
function toggleAiDrawer(show) {
  const drawer = document.getElementById("aiDrawer");
  if (!drawer) return;

  if (show) {
    drawer.classList.remove("hidden");
    setTimeout(() => {
      drawer.classList.remove("translate-x-full");
      drawer.classList.add("translate-x-0");
    }, 50);
  } else {
    drawer.classList.remove("translate-x-0");
    drawer.classList.add("translate-x-full");
    setTimeout(() => {
      drawer.classList.add("hidden");
    }, 200);
  }
}

/**
 * Mở modal tổng hợp phản hồi.
 */
function openAiSummaryModal() {
  const modal = document.getElementById("aiSummaryModal");
  const card = document.getElementById("aiSummaryCard");
  if (!modal || !card) return;

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("bg-slate-900/0");
    modal.classList.add("bg-slate-900/40");
    card.classList.remove("scale-95", "opacity-0");
    card.classList.add("scale-100", "opacity-100");
  }, 50);
}

/**
 * Đóng modal tổng hợp phản hồi.
 */
function closeAiSummaryModal() {
  const modal = document.getElementById("aiSummaryModal");
  const card = document.getElementById("aiSummaryCard");
  if (!modal || !card) return;

  modal.classList.remove("bg-slate-900/40");
  modal.classList.add("bg-slate-900/0");
  card.classList.remove("scale-100", "opacity-100");
  card.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

/**
 * Mở modal chuẩn hóa danh bạ AI.
 */
function openAiNormalizerModal() {
  const modal = document.getElementById("aiNormalizerModal");
  const card = document.getElementById("aiNormalizerCard");
  const tbody = document.getElementById("aiNormalizerPreviewBody");
  const statusLabel = document.getElementById("aiNormalizerStatus");
  const applyBtn = document.getElementById("btnApplyAiNormalizer");

  if (!modal || !card) return;

  aiNormalizerResultsCache = [];
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-10 text-slate-400">
          Chưa chạy phân tích. Hãy bấm "AI Phân tích" ở dưới.
        </td>
      </tr>
    `;
  }
  if (statusLabel) statusLabel.innerText = "";
  applyBtn?.classList.add("hidden");

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("bg-slate-900/0");
    modal.classList.add("bg-slate-900/40");
    card.classList.remove("scale-95", "opacity-0");
    card.classList.add("scale-100", "opacity-100");
  }, 50);
}

/**
 * Đóng modal chuẩn hóa danh bạ AI.
 */
function closeAiNormalizerModal() {
  const modal = document.getElementById("aiNormalizerModal");
  const card = document.getElementById("aiNormalizerCard");
  if (!modal || !card) return;

  modal.classList.remove("bg-slate-900/40");
  modal.classList.add("bg-slate-900/0");
  card.classList.remove("scale-100", "opacity-100");
  card.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

/**
 * Mở modal thêm liên hệ mới.
 */
function openAddContactModal() {
  const modal = document.getElementById("contactModal");
  const card = document.getElementById("modalCard");
  if (!modal || !card) return;

  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.classList.remove("bg-slate-900/0");
    modal.classList.add("bg-slate-900/40");
    card.classList.remove("scale-95", "opacity-0");
    card.classList.add("scale-100", "opacity-100");
  }, 50);
}

/**
 * Đóng modal thêm liên hệ mới.
 */
function closeContactModal() {
  const modal = document.getElementById("contactModal");
  const card = document.getElementById("modalCard");
  if (!modal || !card) return;

  modal.classList.remove("bg-slate-900/40");
  modal.classList.add("bg-slate-900/0");
  card.classList.remove("scale-100", "opacity-100");
  card.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

/**
 * Thu gọn / Mở rộng Khung Thiết lập Chiến dịch (ẩn/hiện cả grid 3 cột).
 */
function toggleCampaignSetupCollapse() {
  const grid = document.getElementById("campaignSetupGrid");
  const icon = document.getElementById("campaignSetupCollapseIcon");
  const label = document.getElementById("campaignSetupCollapseStatusText");
  if (!grid || !icon) return;

  if (grid.classList.contains("hidden")) {
    grid.classList.remove("hidden");
    icon.classList.remove("rotate-180");
    if (label) label.innerText = "ĐANG MỞ";
  } else {
    grid.classList.add("hidden");
    icon.classList.add("rotate-180");
    if (label) label.innerText = "ĐANG ẨN";
  }
}

/**
 * Thu gọn / Mở rộng Khung dán số điện thoại gắn tag (ẩn/hiện cả panel).
 */
function toggleTagBulkCollapse() {
  const card = document.getElementById("tagBulkCard");
  const icon = document.getElementById("tagBulkCollapseIcon");
  const label = document.getElementById("tagBulkCollapseStatusText");
  if (!card || !icon) return;

  if (card.classList.contains("hidden")) {
    card.classList.remove("hidden");
    icon.classList.remove("rotate-180");
    if (label) label.innerText = "ĐANG MỞ";
  } else {
    card.classList.add("hidden");
    icon.classList.add("rotate-180");
    if (label) label.innerText = "ĐANG ẨN";
  }
}
