/**
 * @file init.js
 * @description Điểm khởi chạy của giao diện chính Z-Campaigner. Nạp động HTML components và đăng ký sự kiện.
 */

/**
 * Nạp động các tệp tin HTML con vào các thẻ có thuộc tính data-include.
 * @returns {Promise<void>}
 */
async function loadComponents() {
  const elements = document.querySelectorAll('[data-include]');
  const promises = Array.from(elements).map(async (el) => {
    const file = el.getAttribute('data-include');
    try {
      const resp = await fetch(chrome.runtime.getURL(`main-page/components/${file}?t=${Date.now()}`));
      if (resp.ok) {
        el.innerHTML = await resp.text();
      } else {
        console.error(`Không thể tải component: ${file}, HTTP status: ${resp.status}`);
      }
    } catch (e) {
      console.error(`Lỗi khi nạp component ${file}:`, e);
    }
  });
  await Promise.all(promises);
}

/**
 * Bắt đầu vòng lặp polling trạng thái hàng chờ gửi.
 */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollStatus, 1000);
}

function insertComposerToken(token) {
  const textarea = document.getElementById("composerMessage");
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
  const nextCursor = start + token.length;
  textarea.setSelectionRange(nextCursor, nextCursor);
  textarea.dispatchEvent(new Event('input'));
  textarea.focus();
}

function syncComposerReminderControls() {
  const reminderInput = document.getElementById("composerReminder");
  const waitReplyInput = document.getElementById("composerWaitReply");
  const replyLimitInput = document.getElementById("replyCollectionLimitInput");
  const imageInput = document.getElementById("composerImageInput");
  const imageUploadWrapper = document.getElementById("imageUploadWrapper");
  const disabled = !!reminderInput?.checked;

  if (waitReplyInput) {
    waitReplyInput.disabled = disabled;
    if (disabled) waitReplyInput.checked = false;
  }
  if (replyLimitInput) replyLimitInput.disabled = disabled;
  if (imageInput) imageInput.disabled = disabled;
  imageUploadWrapper?.classList.toggle("opacity-50", disabled);
  imageUploadWrapper?.classList.toggle("pointer-events-none", disabled);
  
  const waitReplyContainer = document.getElementById("composerWaitReplyContainer");
  const maxReplyContainer = document.getElementById("composerMaxReplyContainer");
  if (waitReplyContainer) {
    waitReplyContainer.classList.toggle("opacity-50", disabled);
    waitReplyContainer.classList.toggle("pointer-events-none", disabled);
  }
  if (maxReplyContainer) {
    maxReplyContainer.classList.toggle("opacity-50", disabled);
    maxReplyContainer.classList.toggle("pointer-events-none", disabled);
  }

  if (disabled && typeof clearComposerAttachedImage === 'function') {
    clearComposerAttachedImage();
  }
}

/**
 * Khởi tạo toàn bộ giao diện và gán các sự kiện lắng nghe sự kiện DOM.
 */
async function initialize() {
  // Load API Key từ Chrome Storage
  const apiData = await chrome.storage.local.get(['geminiApiKey', REPLY_COLLECTION_LIMIT_KEY]);
  apiKey = apiData.geminiApiKey || '';
  const apiKeyInput = document.getElementById("geminiApiKeyInput");
  if (apiKeyInput) {
    apiKeyInput.value = apiKey;
    apiKeyInput.addEventListener('change', async () => {
      apiKey = apiKeyInput.value.trim();
      await chrome.storage.local.set({ geminiApiKey: apiKey });
      showToast('Đã lưu Gemini API Key!');
    });
  }

  // Load danh bạ và hàng chờ gửi ban đầu
  const replyLimitInput = document.getElementById("replyCollectionLimitInput");
  if (replyLimitInput) {
    const savedLimit = Number(apiData[REPLY_COLLECTION_LIMIT_KEY]);
    replyLimitInput.value = Number.isFinite(savedLimit) && savedLimit >= 0 ? String(Math.floor(savedLimit)) : "0";
    replyLimitInput.addEventListener('change', async () => {
      const value = Math.max(0, Math.floor(Number(replyLimitInput.value) || 0));
      replyLimitInput.value = String(value);
      await chrome.storage.local.set({ [REPLY_COLLECTION_LIMIT_KEY]: value });
      showToast('Đã lưu số reply tối đa.');
    });
  }

  document.getElementById("composerReminder")?.addEventListener("change", syncComposerReminderControls);
  syncComposerReminderControls();

  await loadContacts();
  await pollStatus();
  await deduplicateQueueByZid(); // Loại bỏ các dòng trùng zid khi load lần đầu
  startPolling();

  // Đăng ký sự kiện chuyển tab
  document.getElementById("tabCampaignBtn")?.addEventListener("click", () => switchTab("campaign"));
  document.getElementById("tabContactsBtn")?.addEventListener("click", () => switchTab("contacts"));
  document.getElementById("settingsPageBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings/settings.html") });
  });

  // Đăng ký sự kiện nút Chiến dịch
  document.getElementById("startCampaignBtn")?.addEventListener("click", async () => {
    try {
      await startWorkerProcessing();
    } catch (e) {
      showToast(e.message || "Gửi thất bại.", "error");
    }
  });

  document.getElementById("pauseCampaignBtn")?.addEventListener("click", async () => {
    try {
      await pauseWorkerProcessing();
    } catch (e) {
      showToast(e.message || "Tạm dừng thất bại.", "error");
    }
  });

  document.getElementById("stopCampaignBtn")?.addEventListener("click", async () => {
    if (!confirm('Bạn có chắc chắn muốn kết thúc hàng chờ này? Tất cả các dòng đang chờ phản hồi sẽ chuyển sang trạng thái Hoàn tất.')) return;
    try {
      await stopWorkerProcessing();
    } catch (e) {
      showToast(e.message || "Dừng thất bại.", "error");
    }
  });

  // Tìm kiếm danh bạ cột trái
  document.getElementById("directorySearchInput")?.addEventListener("input", (e) => {
    directorySearchQuery = e.target.value.trim();
    updateUI();
  });

  // Master Checkbox cột trái
  document.getElementById("selectAllDirectoryCheckbox")?.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const filtered = getFilteredDirectory();
    filtered.forEach(contact => {
      const key = contact.phone || contact.sys_phone || contact.zid || contact.display_name;
      if (key) {
        if (isChecked) {
          selectedDirectoryIds.add(key);
        } else {
          selectedDirectoryIds.delete(key);
        }
      }
    });
    updateUI();
  });

  document.getElementById("clearSelectedContactsBtn")?.addEventListener("click", clearAllSelectedContacts);

  document.getElementById("btnImportPhoneNumbers")?.addEventListener("click", () => {
    const textarea = document.getElementById("manualPhoneInput");
    if (!textarea) return;
    const lines = textarea.value.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      showToast("Vui lòng nhập ít nhất một số điện thoại", "error");
      return;
    }
    const notFoundPhones = [];
    let addedCount = 0;

    const getCorePhone = (p) => {
      let clean = String(p || '').replace(/[^0-9]/g, '');
      if (clean.startsWith('84') && clean.length >= 11) return clean.slice(2);
      if (clean.startsWith('0')) return clean.slice(1);
      return clean;
    };

    lines.forEach(line => {
      const targetPhone = getCorePhone(line);
      if (!targetPhone) {
        notFoundPhones.push(line);
        return;
      }

      const contact = latestContacts.find(c => {
         const cp1 = getCorePhone(c.phone);
         const cp2 = getCorePhone(c.sys_phone);
         // Compare core phones, or fallback to exact string match just in case
         return cp1 === targetPhone || cp2 === targetPhone || c.sys_phone === line || c.phone === line;
      });

      if (contact) {
        const key = contact.phone || contact.sys_phone || contact.zid || contact.display_name;
        if (key && !selectedDirectoryIds.has(key)) {
          selectedDirectoryIds.add(key);
          addedCount++;
        }
      } else {
        notFoundPhones.push(line);
      }
    });

    if (notFoundPhones.length > 0) {
      textarea.value = notFoundPhones.join('\n');
      showToast(`Có ${notFoundPhones.length} số điện thoại không có trong danh bạ.`, "error");
    } else {
      textarea.value = "";
    }
    
    if (addedCount > 0) {
      showToast(`Đã thêm ${addedCount} liên hệ vào danh sách nhận tin.`);
    }
    
    updateUI();
  });

  // Soạn thảo và bộ đếm ký tự
  document.getElementById("composerMessage")?.addEventListener("input", (e) => {
    const len = e.target.value.length;
    document.getElementById("composerCharCount").innerText = `${len} ký tự`;
  });

  // Insert variables
  document.getElementById("btnInsertAcUpper")?.addEventListener("click", () => {
    insertComposerToken("{A}");
  });

  document.getElementById("btnInsertAc")?.addEventListener("click", () => {
    insertComposerToken("{a}");
  });

  document.getElementById("btnInsertName")?.addEventListener("click", () => {
    insertComposerToken("{n}");
  });

  // Phím tắt giờ nhanh
  document.getElementById("btnTimeNow")?.addEventListener("click", () => {
    document.getElementById("composerScheduleTime").value = "";
    showToast("Đã chọn gửi ngay.");
  });

  document.getElementById("btnTime15m")?.addEventListener("click", () => {
    const timeInput = document.getElementById("composerScheduleTime");
    const targetDate = new Date(Date.now() + 15 * 60000);
    timeInput.value = toLocalDateTimeInputValue(targetDate);
    showToast("Đã hẹn giờ +15 phút.");
  });

  document.getElementById("btnTime1h")?.addEventListener("click", () => {
    const timeInput = document.getElementById("composerScheduleTime");
    const targetDate = new Date(Date.now() + 60 * 60000);
    timeInput.value = toLocalDateTimeInputValue(targetDate);
    showToast("Đã hẹn giờ +1 giờ.");
  });

  document.getElementById("btnTimeTomorrow")?.addEventListener("click", () => {
    const timeInput = document.getElementById("composerScheduleTime");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    timeInput.value = toLocalDateTimeInputValue(tomorrow);
    showToast("Đã hẹn giờ 8h sáng mai.");
  });

  // Gemini AI Autocomplete & Rewrite Tone
  document.getElementById("btnAiAutocomplete")?.addEventListener("click", aiAutocompleteMessage);
  document.getElementById("aiToneSelect")?.addEventListener("change", (e) => {
    aiRewriteMessage(e.target.value);
  });

  // AI Drawer
  document.getElementById("btnOpenAiDrawer")?.addEventListener("click", () => toggleAiDrawer(true));
  document.getElementById("btnCloseAiDrawer")?.addEventListener("click", () => toggleAiDrawer(false));
  document.getElementById("btnGenerateAiIdeas")?.addEventListener("click", generateAiCampaignIdeas);

  // Gắn sự kiện Collapse cho 2 nút Thiết lập Chiến dịch và Gắn Tag hàng loạt
  document.getElementById("btnToggleCampaignSetup")?.addEventListener("click", toggleCampaignSetupCollapse);
  document.getElementById("btnToggleTagBulk")?.addEventListener("click", toggleTagBulkCollapse);

  // Đẩy vào hàng chờ gửi
  document.getElementById("btnAddToQueue")?.addEventListener("click", addSelectedToQueue);

  // Đính kèm hình ảnh
  document.getElementById("composerImageInput")?.addEventListener("change", handleComposerImageSelect);
  document.getElementById("btnRemoveComposerImage")?.addEventListener("click", clearComposerAttachedImage);

  // Paste ảnh từ clipboard vào ô text tin nhắn
  document.getElementById("composerMessage")?.addEventListener("paste", handleComposerPaste);

  // Bảng hàng chờ: tìm kiếm và lọc status
  document.getElementById("queueSearchInput")?.addEventListener("input", (e) => {
    queueSearchQuery = e.target.value.trim();
    updateUI();
  });

  // Tab 2: Tìm kiếm danh bạ realtime (gõ đến đâu lọc luôn)
  document.getElementById("contactSearchInput")?.addEventListener("input", () => {
    renderContactsDatabaseTable();
  });

  
  // Stats Click Filters
  document.getElementById("statBtnPending")?.addEventListener("click", () => applyQueueFilter("pending", "Chờ gửi"));
  document.getElementById("statBtnWait")?.addEventListener("click", () => applyQueueFilter("wait_reply", "Đang theo dõi"));
  document.getElementById("statBtnDone")?.addEventListener("click", () => applyQueueFilter("done", "Hoàn tất"));
  document.getElementById("errorBoxBg")?.addEventListener("click", () => applyQueueFilter("error", "Lỗi"));
  
  function applyQueueFilter(status, labelName) {
    if (queueStatusFilter === status) {
      queueStatusFilter = "";
      labelName = "Tất cả trạng thái";
    } else {
      queueStatusFilter = status;
    }
    const label = document.getElementById("queueStatusFilterLabel");
    if (label) label.innerText = labelName;
    updateUI();
  }

  document.getElementById("queueStatusFilterBtn")?.addEventListener("click", () => {
    document.getElementById("queueStatusFilterDropdown")?.classList.toggle("hidden");
  });

  document.querySelectorAll("[data-status-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      queueStatusFilter = btn.dataset.statusFilter || "";
      const label = document.getElementById("queueStatusFilterLabel");
      if (label) label.innerText = btn.innerText.trim();
      document.getElementById("queueStatusFilterDropdown")?.classList.add("hidden");
      updateUI();
    });
  });

  document.getElementById("queueTagFilterBtn")?.addEventListener("click", () => {
    document.getElementById("queueTagFilterDropdown")?.classList.toggle("hidden");
  });

  document.getElementById("queueTagFilterOptions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-queue-tag-filter]");
    if (!btn) return;
    queueTagFilter = btn.dataset.queueTagFilter || "";
    document.getElementById("queueTagFilterDropdown")?.classList.add("hidden");
    updateUI();
  });

  document.getElementById("contactTagFilterBtn")?.addEventListener("click", () => {
    document.getElementById("contactTagFilterDropdown")?.classList.toggle("hidden");
  });

  document.getElementById("contactTagFilterOptions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-contact-tag-filter]");
    if (!btn) return;
    contactTagFilter = btn.dataset.contactTagFilter || "";
    document.getElementById("contactTagFilterDropdown")?.classList.add("hidden");
    renderContactTagFilter();
    renderContactsDatabaseTable();
  });

  document.getElementById("directoryTagDropdownBtn")?.addEventListener("click", () => {
    document.getElementById("directoryTagDropdownMenu")?.classList.toggle("hidden");
  });

  document.getElementById("directoryTagDropdownOptions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dropdown-tag]");
    if (!btn) return;
    const tag = btn.dataset.dropdownTag;
    setDirectoryTagFilter(tag);
    document.getElementById("directoryTagDropdownMenu")?.classList.add("hidden");
  });

  document.querySelectorAll("[data-contact-sort]").forEach((btn) => {
    btn.addEventListener("click", () => setContactSort(btn.dataset.contactSort));
  });

  // Master Checkbox hàng chờ
  document.getElementById("masterQueueCheckbox")?.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const filtered = getFilteredQueueRows();
    filtered.forEach(row => {
      if (isChecked) {
        selectedQueueIds.add(row.id);
      } else {
        selectedQueueIds.delete(row.id);
      }
    });
    updateUI();
  });

  // Tác vụ hàng loạt (Bulk Actions)
  document.getElementById("bulkStatusBtn")?.addEventListener("click", () => {
    const dropdown = document.getElementById("bulkStatusDropdown");
    dropdown?.classList.toggle("hidden");
  });

  document.getElementById("btnBulkStatePending")?.addEventListener("click", () => applyBulkState("pending"));
  document.getElementById("btnBulkStateWait")?.addEventListener("click", () => applyBulkState("wait_reply"));
  document.getElementById("btnBulkStateDone")?.addEventListener("click", () => applyBulkState("done"));
  document.getElementById("bulkResetBtn")?.addEventListener("click", applyBulkReset);
  document.getElementById("bulkDeleteBtn")?.addEventListener("click", applyBulkDelete);

  // CSV import / Template
  document.getElementById("templateBtn")?.addEventListener("click", () => {
    downloadXlsx('zalo-upload-template.xlsx', TEMPLATE_HEADERS, [TEMPLATE_NOTE_ROW]);
  });

  document.getElementById("importBtn")?.addEventListener("click", () => {
    const fileInput = document.getElementById("csvFile");
    if (fileInput) {
      fileInput.value = "";
      fileInput.click();
    }
  });

  document.getElementById("csvFile")?.addEventListener("change", async () => {
    const fileInput = document.getElementById("csvFile");
    const file = fileInput?.files?.[0];
    if (!file) return;
    try {
      await importBatchFromFile(file);
    } catch (e) {
      showToast(e.message || "Import thất bại.", "error");
    }
  });

  // Tổng hợp phản hồi
  document.getElementById("btnSummarizeReplies")?.addEventListener("click", summarizeRepliesLocal);
  document.getElementById("btnCloseAiSummaryModal")?.addEventListener("click", closeAiSummaryModal);
  document.getElementById("btnConfirmCloseSummary")?.addEventListener("click", closeAiSummaryModal);

  // Xuất Excel hàng chờ
  document.getElementById("exportQueueBtn")?.addEventListener("click", () => {
    if (!latestQueue || !Object.keys(latestQueue.byId).length) return;
    const exportHeaders = ['status', 'name', 'phone', 'message', 'replies', 'send_at', 'note', 'wait_reply', 'error', 'zid'];
    const exportRows = getFilteredQueueRows().map((row) => {
      const values = { ...row.values };
      values.name = stripZaloTags(values.name || values.display_name || '');
      values.phone = values.phone || values.sys_phone || '';
      values.replies = (row.replies || []).join('\n');
      values.error = row.error || '';
      values.status = row.status || 'pending';
      values.send_at = formatTime(values.send_at);
      return values;
    });
    downloadXlsx(
      `zalo-queue-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`,
      exportHeaders,
      exportRows
    );
    showToast('Đã tải xuống XLSX hàng chờ!');
  });

  // Làm trống hàng chờ
  document.getElementById("clearQueueBtn")?.addEventListener("click", async () => {
    if (!confirm('Bạn có chắc chắn muốn xóa sạch toàn bộ hàng chờ tin nhắn không?')) return;
    try {
      if (latestWorkerState?.running) {
        await sendMessage({ type: 'STOP_WORKER' });
      }
      const resp = await sendMessage({ type: 'CLEAR_QUEUE' });
      if (!resp.ok) throw new Error(resp.error || 'Không xóa được hàng chờ.');
      showToast('Đã làm trống hàng chờ.');
      await pollStatus();
    } catch (e) {
      showToast(e.message, "error");
    }
  });

  // Tab 2: Danh bạ
  document.getElementById("syncContactsBtn")?.addEventListener("click", syncContactsFromZalo);
  document.getElementById("btnReloadContacts")?.addEventListener("click", async () => {
    await loadContacts();
    showToast("Đã tải lại bảng liên hệ.");
  });
  document.getElementById("btnExportContacts")?.addEventListener("click", exportContactsToExcel);
  document.getElementById("btnClearContacts")?.addEventListener("click", clearAllContacts);

  // Gắn tag hàng loạt
  document.getElementById("applyTagBtn")?.addEventListener("click", applyTagToPhones);
  document.getElementById("tagColorInput")?.addEventListener("input", (e) => {
    document.getElementById("hexVal").innerText = e.target.value.toUpperCase();
  });
  document.getElementById("updateTagColorBtn")?.addEventListener("click", async () => {
    const tagName = document.getElementById("tagNameInput").value.trim();
    const tagColor = document.getElementById("tagColorInput").value;
    if (!tagName) {
      showToast("Vui lòng nhập tên tag muốn đổi màu!", "error");
      return;
    }
    showToast('Đang cập nhật màu tag...');
    const resp = await sendMessage({
      type: 'UPDATE_TAG_COLOR',
      tag: tagName,
      color: tagColor
    });
    if (!resp.ok) {
      showToast(resp.error || "Đổi màu tag thất bại.", "error");
      return;
    }
    showToast(`Đã cập nhật màu mới cho tag "${tagName}"!`);
    await loadContacts();
  });

  // Thêm liên hệ thủ công modal
  document.getElementById("btnOpenAddContact")?.addEventListener("click", openAddContactModal);
  document.getElementById("btnCloseContactModal")?.addEventListener("click", closeContactModal);
  document.getElementById("btnCancelAddContact")?.addEventListener("click", closeContactModal);
  document.getElementById("btnSaveContact")?.addEventListener("click", saveNewContact);

  // AI Normalizer
  document.getElementById("btnOpenAiNormalizer")?.addEventListener("click", openAiNormalizerModal);
  document.getElementById("btnCloseAiNormalizer")?.addEventListener("click", closeAiNormalizerModal);
  document.getElementById("btnCancelAiNormalizer")?.addEventListener("click", closeAiNormalizerModal);
  document.getElementById("btnRunAiNormalizer")?.addEventListener("click", runAiNormalizer);
  document.getElementById("btnApplyAiNormalizer")?.addEventListener("click", applyAiNormalizerResults);

  // Menu Tùy chọn khác dropdown
  const toggleBtn = document.getElementById("btnContactActionsToggle");
  const dropdown = document.getElementById("contactActionsDropdown");
  toggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== toggleBtn) {
      dropdown.classList.add("hidden");
    }
    const bulkDropdown = document.getElementById("bulkStatusDropdown");
    const bulkBtn = document.getElementById("bulkStatusBtn");
    if (bulkDropdown && !bulkDropdown.contains(e.target) && !bulkBtn?.contains(e.target)) {
      bulkDropdown.classList.add("hidden");
    }
    const statusDropdown = document.getElementById("queueStatusFilterDropdown");
    const statusBtn = document.getElementById("queueStatusFilterBtn");
    if (statusDropdown && !statusDropdown.contains(e.target) && !statusBtn?.contains(e.target)) {
      statusDropdown.classList.add("hidden");
    }
    const queueTagDropdown = document.getElementById("queueTagFilterDropdown");
    const queueTagBtn = document.getElementById("queueTagFilterBtn");
    if (queueTagDropdown && !queueTagDropdown.contains(e.target) && !queueTagBtn?.contains(e.target)) {
      queueTagDropdown.classList.add("hidden");
    }
    const contactTagDropdown = document.getElementById("contactTagFilterDropdown");
    const contactTagBtn = document.getElementById("contactTagFilterBtn");
    if (contactTagDropdown && !contactTagDropdown.contains(e.target) && !contactTagBtn?.contains(e.target)) {
      contactTagDropdown.classList.add("hidden");
    }
    const dirTagDropdown = document.getElementById("directoryTagDropdownMenu");
    const dirTagBtn = document.getElementById("directoryTagDropdownBtn");
    if (dirTagDropdown && !dirTagDropdown.contains(e.target) && !dirTagBtn?.contains(e.target)) {
      dirTagDropdown.classList.add("hidden");
    }
  });

  // Table Inline Edit Cell
  const queueTbody = document.getElementById("queueTableBody");
  queueTbody?.addEventListener("focusin", (ev) => {
    const cell = ev.target.closest('[contenteditable="true"]');
    if (!cell) return;
    editingCell = {
      rowId: cell.dataset.rowId || cell.closest('tr')?.dataset.rowId,
      header: cell.dataset.header,
      original: cell.innerText
    };
  });

  queueTbody?.addEventListener("keydown", (ev) => {
    const cell = ev.target.closest('[contenteditable="true"]');
    if (!cell) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      cell.blur();
    }
  });

  queueTbody?.addEventListener("focusout", async (ev) => {
    const cell = ev.target.closest('[contenteditable="true"]');
    if (!cell || !editingCell) return;

    const rowId = editingCell.rowId;
    const header = editingCell.header;
    const value = cell.innerText.replace(/\r/g, '').trim();
    const original = editingCell.original.replace(/\r/g, '').trim();
    editingCell = null;

    if (!rowId || !header || value === original) return;

    try {
      await saveEditedCell(rowId, header, value);
    } catch (err) {
      showToast(err?.message || 'Không cập nhật được ô.', true);
      await pollStatus();
    }
  });

  // Setup Tag Horizontal Scroll Wheel
  const tagFilterContainer = document.getElementById("tagFilterContainer");
  tagFilterContainer?.addEventListener("wheel", (evt) => {
    evt.preventDefault();
    tagFilterContainer.scrollLeft += evt.deltaY;
  });

  // Kích hoạt Lucide icons lần đầu sau khi load xong
  if (window.lucide) window.lucide.createIcons();
}

// KHỞI CHẠY KHI TẢI TRANG XONG
window.addEventListener("DOMContentLoaded", async () => {
  await loadComponents();
  await initialize();
});

window.addEventListener("beforeunload", () => {
  if (pollTimer) clearInterval(pollTimer);
});

/**
 * Xử lý khi người dùng chọn ảnh từ máy tính để đính kèm vào composer.
 * @param {Event} e - Sự kiện change của input file
 */
async function handleComposerImageSelect(e) {
  if (document.getElementById("composerReminder")?.checked) {
    if (e.target) e.target.value = "";
    return;
  }
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Vui lòng chọn một file hình ảnh hợp lệ.', 'error');
    return;
  }

  try {
    const res = await compressAndCropImage(file);
    composerAttachedImage = {
      name: res.name,
      base64: res.base64,
      thumbnail: res.thumbnail,
      mediaId: null
    };

    const previewWrapper = document.getElementById("imagePreviewWrapper");
    const uploadWrapper = document.getElementById("imageUploadWrapper");
    const previewImg = document.getElementById("composerImagePreview");
    const imageName = document.getElementById("composerImageName");

    if (previewImg) previewImg.src = res.thumbnail; // hiển thị ảnh crop center làm preview vuông
    if (imageName) imageName.innerText = res.name;

    uploadWrapper?.classList.add("hidden");
    previewWrapper?.classList.remove("hidden");
  } catch (err) {
    showToast(err?.message || 'Không thể xử lý hình ảnh.', 'error');
  }
}

/**
 * Xóa ảnh đang đính kèm khỏi composer.
 */
function clearComposerAttachedImage() {
  composerAttachedImage = null;
  const fileInput = document.getElementById("composerImageInput");
  if (fileInput) fileInput.value = "";

  const previewWrapper = document.getElementById("imagePreviewWrapper");
  const uploadWrapper = document.getElementById("imageUploadWrapper");
  const previewImg = document.getElementById("composerImagePreview");
  const imageName = document.getElementById("composerImageName");

  if (previewImg) previewImg.src = "";
  if (imageName) imageName.innerText = "";

  previewWrapper?.classList.add("hidden");
  uploadWrapper?.classList.remove("hidden");
}
