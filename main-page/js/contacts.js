/**
 * @file contacts.js
 * @description Logic quản lý danh bạ liên hệ (hiển thị, tìm kiếm, gắn tag, thêm mới, đồng bộ).
 */

/**
 * Trích xuất nhãn và các nhóm lọc độc nhất từ dữ liệu liên hệ hiện tại.
 * @returns {string[]} Danh sách các tag bao gồm "Tất cả"
 */
function getAllUniqueTags() {
  const tagsSet = new Set();
  latestContacts.forEach(c => { if (c.tag) tagsSet.add(c.tag); });
  return ["Tất cả", ...Array.from(tagsSet).sort((a, b) => a.localeCompare(b, 'vi'))];
}

function getContactFilterTags() {
  return getAllUniqueTags().filter(tag => tag !== 'Tất cả');
}

function renderContactTagFilter() {
  const label = document.getElementById("contactTagFilterLabel");
  const options = document.getElementById("contactTagFilterOptions");
  if (!label || !options) return;

  const tags = getContactFilterTags();
  const current = tags.includes(contactTagFilter) ? contactTagFilter : "";
  if (current !== contactTagFilter) contactTagFilter = current;

  if (current) {
    const currentColor = getCanonicalTagColor(current);
    label.innerHTML = `<span class="px-1.5 py-0.5 rounded text-white font-extrabold" style="background-color: ${escapeHtml(currentColor)}">${escapeHtml(current)}</span>`;
  } else {
    label.innerText = 'Tất cả tag';
  }

  options.innerHTML = [
    `<button data-contact-tag-filter=""
      class="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
      Tất cả tag
    </button>`,
    ...tags.map((tag) => {
      const color = getCanonicalTagColor(tag);
      const selectedClass = tag === current ? 'bg-slate-50' : '';
      return `<button data-contact-tag-filter="${escapeHtml(tag)}"
        class="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${selectedClass}">
        <span class="px-1.5 py-0.5 rounded text-white font-extrabold inline-block" style="background-color: ${escapeHtml(color)}">${escapeHtml(tag)}</span>
      </button>`;
    })
  ].join('');
}

function setContactSort(field) {
  if (contactSortField === field) {
    contactSortDirection = contactSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    contactSortField = field;
    contactSortDirection = 'asc';
  }
  renderContactsDatabaseTable();
}

function compareContactsBySort(a, b) {
  if (!contactSortField) return 0;
  const direction = contactSortDirection === 'desc' ? -1 : 1;
  if (contactSortField === 'updatedAt') {
    const leftTime = Number(a.updatedAt) || Date.parse(a.updatedAt) || 0;
    const rightTime = Number(b.updatedAt) || Date.parse(b.updatedAt) || 0;
    return (leftTime - rightTime) * direction;
  }
  const left = String(a?.[contactSortField] || '').trim();
  const right = String(b?.[contactSortField] || '').trim();
  return left.localeCompare(right, 'vi', { sensitivity: 'base' }) * direction;
}

function getSalutationEmoji(contact) {
  const salutation = String(contact?.['_a/c'] || '').trim().toLowerCase();
  if (salutation === 'anh') return '🙎🏻‍♂️';
  if (salutation === 'chị') return '🙎‍♀️';
  return '';
}

/**
 * Thực hiện tìm kiếm và lọc danh bạ liên hệ đang được hiển thị ở cột trái.
 * @returns {Object[]}
 */
function getFilteredDirectory() {
  return latestContacts.filter(contact => {
    const query = directorySearchQuery.toLowerCase();
    const safePhone = contact.phone || contact.sys_phone || '';
    const safeName = (contact.display_name || safePhone || "").toLowerCase();
    const matchesSearch = safeName.includes(query) || safePhone.includes(query);
    const matchesTag = currentDirectoryTagFilter === "Tất cả" || contact.tag === currentDirectoryTagFilter;
    return matchesSearch && matchesTag;
  });
}

/**
 * Chọn hoặc bỏ chọn một liên hệ trong danh sách gửi tin.
 * @param {string} id - Định danh liên hệ (phone, zid hoặc display_name)
 */
function toggleSelectDirectoryContact(id) {
  if (selectedDirectoryIds.has(id)) {
    selectedDirectoryIds.delete(id);
  } else {
    selectedDirectoryIds.add(id);
  }
  updateUI();
}

/**
 * Thay đổi bộ lọc nhóm (Tag) của danh bạ nhận tin.
 * @param {string} tag - Tên tag cần lọc
 */
function setDirectoryTagFilter(tag) {
  currentDirectoryTagFilter = tag;
  renderDirectoryTags();
  updateUI();
}

/**
 * Vẽ thanh filter danh mục tag ở cột trái.
 */
function renderDirectoryTags() {
  const container = document.getElementById("tagFilterContainer");
  if (!container) return;
  const tags = getAllUniqueTags();

  container.innerHTML = tags.map(tag => {
    const isActive = currentDirectoryTagFilter === tag;
    const tagColor = tag === 'Tất cả' ? '#4f46e5' : getCanonicalTagColor(tag);
    const colorStyle = tag === 'Tất cả'
      ? (isActive ? `style="background-color: ${tagColor}; border-color: ${tagColor}"` : '')
      : `style="background-color: ${escapeHtml(tagColor)}; border-color: ${escapeHtml(tagColor)}"`;
    return `
      <button 
        type="button"
        class="px-2.5 py-1 rounded-md text-xs font-extrabold border transition-all whitespace-nowrap flex-shrink-0 ${tag === 'Tất cả'
        ? (isActive ? 'text-white shadow-xs' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')
        : `text-white ${isActive ? 'shadow-xs ring-2 ring-offset-1 ring-indigo-100' : 'opacity-85 hover:opacity-100'}`
      }"
        data-tag="${escapeHtml(tag)}"
        ${colorStyle}
      >
        ${escapeHtml(tag)}
      </button>
    `;
  }).join("");

  // Gắn event click cho các button
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      setDirectoryTagFilter(btn.dataset.tag);
    });
  });
}

/**
 * Vẽ danh sách liên hệ ở cột trái.
 */
function renderDirectoryList() {
  const container = document.getElementById("contactsListContainer");
  if (!container) return;
  const filtered = getFilteredDirectory();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
        <p class="text-xs font-semibold">Không tìm thấy liên hệ nào</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(contact => {
    const key = contact.phone || contact.sys_phone || contact.zid || contact.display_name;
    const isChecked = selectedDirectoryIds.has(key);
    const phoneToShow = formatDisplayPhone(contact.phone || contact.sys_phone || '');
    const nameToDisplay = contact.display_name || (phoneToShow ? `Số: ${phoneToShow}` : 'Không tên');
    const customColor = getCanonicalTagColor(contact.tag, contact.tag_color || "#4f46e5");
    const salutationEmoji = getSalutationEmoji(contact);

    return `
      <div 
        class="flex items-center gap-2.5 p-2 rounded-lg border border-slate-150/80 hover:border-indigo-150 hover:bg-indigo-50/5 transition-all cursor-pointer group ${isChecked ? 'bg-indigo-50/15 border-indigo-200 shadow-2xs' : 'bg-white'}"
        data-id="${escapeHtml(key)}"
      >
        <div class="relative flex items-center justify-center flex-shrink-0">
          <div class="w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${isChecked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300 group-hover:border-slate-400'}">
            <i data-lucide="check" class="text-white w-2.5 h-2.5 stroke-[4] ${isChecked ? 'block' : 'hidden'}"></i>
          </div>
        </div>

        <div class="rounded-full border border-slate-100 flex-shrink-0 overflow-hidden bg-slate-50 flex items-center justify-center" style="width: 40px; height: 40px;">
          ${contact.avatar ? `<img src="${escapeHtml(contact.avatar)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />` : `<span class="text-slate-500 text-[11px] font-extrabold">${escapeHtml(getInitials(contact))}</span>`}
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-800 truncate leading-snug">${escapeHtml(nameToDisplay)}</p>
          <div class="flex items-center gap-1.5 mt-0.5">
            ${salutationEmoji ? `<span class="text-[11px] leading-none">${salutationEmoji}</span>` : ''}
            <span class="text-[10px] text-slate-400 font-medium">${escapeHtml(phoneToShow)}</span>
            ${contact.tag ? `<span class="px-1.5 py-0.5 text-[10px] font-extrabold rounded text-white whitespace-nowrap" style="background-color: ${escapeHtml(customColor)}">${escapeHtml(contact.tag)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Gắn event click
  container.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      toggleSelectDirectoryContact(el.dataset.id);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Đồng bộ checkbox "Chọn tất cả" cột trái dựa theo trạng thái lọc.
 */
function updateDirectoryMasterCheckbox() {
  const selectAllCheckbox = document.getElementById("selectAllDirectoryCheckbox");
  if (!selectAllCheckbox) return;
  const filtered = getFilteredDirectory();

  if (filtered.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }

  const allFilteredSelected = filtered.every(c => selectedDirectoryIds.has(c.phone || c.sys_phone || c.zid || c.display_name));
  selectAllCheckbox.checked = allFilteredSelected;
}

/**
 * Vẽ bảng danh bạ trong Tab 2 (Quản lý danh bạ).
 */
function renderContactsDatabaseTable() {
  const tbody = document.getElementById("contactsDatabaseBody");
  if (!tbody) return;
  const searchQuery = document.getElementById("contactSearchInput")?.value.trim().toLowerCase() || "";

  const filtered = latestContacts.filter(c => {
    const matchesSearch = (c.display_name || "").toLowerCase().includes(searchQuery) ||
      (c.phone || "").includes(searchQuery) ||
      (c.zid || "").toLowerCase().includes(searchQuery) ||
      (c.tag || "").toLowerCase().includes(searchQuery);
    const matchesTag = contactTagFilter === "" || c.tag === contactTagFilter;
    return matchesSearch && matchesTag;
  }).sort(compareContactsBySort);

  const contactSummaryLabel = document.getElementById("contactSummaryLabel");
  if (contactSummaryLabel) {
    contactSummaryLabel.innerText = `${latestContacts.length} liên hệ đã lưu trong hệ thống.`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-10 text-slate-400">
          Không có dữ liệu danh bạ phù hợp
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const hexColor = getCanonicalTagColor(c.tag, c.tag_color || "#4f46e5");
    const tagText = String(c.tag || '').trim();
    const salutationEmoji = getSalutationEmoji(c);
    const salutationText = c['_a/c'] || 'bạn';
    return `
      <tr class="hover:bg-slate-50/70 transition-colors text-xs" data-phone="${escapeHtml(c.phone || c.sys_phone || '')}" data-zid="${escapeHtml(c.zid || '')}">
        <td class="px-4 py-2 max-w-[260px]">
          <div class="flex items-center gap-2">
            <div class="rounded-full border border-slate-200 flex-shrink-0 overflow-hidden bg-slate-50 flex items-center justify-center" style="width: 40px; height: 40px;">
              ${c.avatar ? `<img src="${escapeHtml(c.avatar)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />` : `<span class="text-slate-400 text-[11px] font-bold">${escapeHtml(getInitials(c))}</span>`}
            </div>
            <div 
              contenteditable="true" 
              class="font-semibold text-slate-800 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all contact-edit-cell flex-1 whitespace-normal break-words leading-snug"
              data-field="display_name"
              spellcheck="false"
            >${escapeHtml(c.display_name || '')}</div>
          </div>
        </td>

        <td class="px-3 py-2 font-bold align-middle min-w-[130px]">
          <span 
            contenteditable="true" 
            class="${tagText ? 'px-1.5 py-0.5 min-w-[28px] text-[10px] font-extrabold rounded text-white whitespace-nowrap inline-block' : 'inline-block min-w-[28px]'} focus:outline-none focus:ring-1 focus:ring-indigo-400 contact-edit-cell"
            data-field="tag"
            spellcheck="false"
            ${tagText ? `style="background-color: ${escapeHtml(hexColor)}"` : ''}
          >${escapeHtml(tagText)}</span>
        </td>

        <td class="px-3 py-2 font-medium text-slate-700 font-mono whitespace-nowrap">${escapeHtml(formatDisplayPhone(c.phone || c.sys_phone || ''))}</td>

        <td class="px-3 py-2">
          <div class="flex items-center gap-1">
            ${salutationEmoji ? `<span class="text-[11px] leading-none">${salutationEmoji}</span>` : ''}
            <span 
              contenteditable="true" 
              class="focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all contact-edit-cell"
              data-field="_a/c"
              spellcheck="false"
            >${escapeHtml(salutationText)}</span>
          </div>
        </td>

        <td 
          contenteditable="true" 
          class="px-3 py-2 font-semibold focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all contact-edit-cell"
          data-field="_name"
          spellcheck="false"
        >${escapeHtml(c._name || '')}</td>

        <td 
          contenteditable="true" 
          class="px-3 py-2 font-mono text-slate-500 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded transition-all contact-edit-cell max-w-[150px] truncate"
          data-field="zid"
          spellcheck="false"
        >${escapeHtml(c.zid || '')}</td>

        <td class="px-3 py-2 text-slate-500 leading-tight">${formatTimeTwoLines(c.updatedAt)}</td>

        <td class="px-3 py-2 text-center">
          <button 
            type="button"
            class="p-1 hover:bg-rose-50 text-rose-500 rounded-md transition-all btn-delete-contact"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Đăng ký sự kiện edit trực tiếp cell trong danh bạ
  tbody.querySelectorAll('.contact-edit-cell').forEach(cell => {
    let originalVal = cell.innerText.trim();
    cell.addEventListener('focus', () => {
      originalVal = cell.innerText.trim();
    });
    cell.addEventListener('blur', async () => {
      const newVal = cell.innerText.trim();
      if (newVal === originalVal) return;
      const tr = cell.closest('tr');
      const phone = tr.dataset.phone;
      const zid = tr.dataset.zid;
      const field = cell.dataset.field;

      const contact = latestContacts.find(c => (phone && (c.phone || c.sys_phone || '') === phone) || (zid && c.zid === zid));
      if (contact) {
        // Cho phép xoá tag về rỗng (không fallback 'Lưu')
        const tag = field === 'tag' ? newVal : (contact.tag || '');
        const color = field === 'tag' && tag
          ? getCanonicalTagColor(tag, contact.tag_color || document.getElementById("tagColorInput")?.value || '#4f46e5')
          : (contact.tag_color || document.getElementById("tagColorInput")?.value || '#4f46e5');

        // Cập nhật record
        const resp = await sendMessage({
          type: 'TAG_CONTACT_BY_IDENTITY',
          identity: {
            phone: contact.phone || contact.sys_phone || phone || '',
            zid: contact.zid || zid || '',
            display_name: contact.display_name || contact.name || ''
          },
          tag: tag,
          color: color
        });
        if (resp.ok) {
          showToast("Đã cập nhật thông tin liên hệ!");
          await loadContacts();
        }
      }
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cell.blur();
      }
    });
  });

  // Sự kiện nút xóa contact — hỗ trợ undo 5 giây
  tbody.querySelectorAll('.btn-delete-contact').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const phone = tr.dataset.phone;
      const contact = latestContacts.find(c => (c.phone || c.sys_phone || '') === phone);
      if (!contact) return;

      // Ẩn dòng ngay lập tức (soft delete)
      tr.style.display = 'none';
      const displayName = contact.display_name || formatDisplayPhone(phone);

      showUndoToast(`Đã xoá liên hệ "${displayName}"`, async () => {
        // Undo: hiện lại dòng
        tr.style.display = '';
      }, async () => {
        // Commit: gọi API xoá thực sự
        const resp = await sendMessage({
          type: 'DELETE_CONTACT',
          phone: phone
        });
        if (resp.ok) {
          await loadContacts();
        } else {
          tr.style.display = '';
          showToast(resp.error || "Xoá liên hệ thất bại.", "error");
        }
      });
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Gắn Tag đồng loạt theo số điện thoại dán trong TextArea.
 */
async function applyTagToPhones() {
  const tagName = document.getElementById("tagNameInput").value.trim();
  const tagColor = document.getElementById("tagColorInput").value;
  const phonesRaw = document.getElementById("tagPhonesInput").value.trim();

  if (!tagName) {
    showToast("Vui lòng nhập tên tag cần gắn!", "error");
    return;
  }
  if (!phonesRaw) {
    showToast("Vui lòng dán danh sách số điện thoại!", "error");
    return;
  }

  const phoneList = Array.from(new Set(phonesRaw.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean)));
  if (!phoneList.length) {
    showToast("Số điện thoại không hợp lệ!", "error");
    return;
  }

  showToast('Đang gắn tag đồng loạt...');
  const resp = await sendMessage({
    type: 'TAG_CONTACTS_BY_PHONES',
    phones: phoneList,
    tag: tagName,
    color: tagColor
  });

  if (!resp.ok) {
    showToast(resp.error || "Gắn tag thất bại.", "error");
    return;
  }

  document.getElementById("tagPhonesInput").value = "";
  showToast(`Đã gắn tag "${tagName}" thành công!`);
  await loadContacts();
}

/**
 * Thêm một liên hệ mới bằng biểu mẫu thủ công.
 */
async function saveNewContact() {
  const displayName = document.getElementById("m_displayName").value.trim();
  const phone = document.getElementById("m_phone").value.trim();
  const zid = document.getElementById("m_zid").value.trim();
  const ac = document.getElementById("m_ac").value;
  const name = document.getElementById("m_name").value.trim();
  const tag = document.getElementById("m_tag").value.trim() || 'Lưu';
  const tagColor = document.getElementById("m_tagColor").value;

  if (!phone) {
    showToast("Vui lòng điền ít nhất số điện thoại!", "error");
    return;
  }

  showToast('Đang lưu liên hệ...');
  const resp = await sendMessage({
    type: 'TAG_CONTACTS_BY_PHONES',
    phones: [phone],
    tag: tag,
    color: tagColor
  });

  if (!resp.ok) {
    showToast(resp.error || "Lưu liên hệ thất bại.", "error");
    return;
  }

  // Clear modal inputs
  document.getElementById("m_displayName").value = "";
  document.getElementById("m_phone").value = "";
  document.getElementById("m_zid").value = "";
  document.getElementById("m_name").value = "";
  document.getElementById("m_tag").value = "";

  closeContactModal();
  showToast("Đã lưu liên hệ mới!");
  await loadContacts();
}

/**
 * Gọi API nạp toàn bộ danh bạ liên hệ đang lưu trữ ở Background.
 */
async function loadContacts() {
  const resp = await sendMessage({ type: 'GET_CONTACTS' });
  if (resp.ok && resp.contacts) {
    latestContacts = resp.contacts;
    renderDirectoryList();
    renderDirectoryTags();
    renderContactTagFilter();
    renderContactsDatabaseTable();
  } else {
    showToast(resp.error || "Không đọc được danh sách liên hệ.", "error");
  }
}

/**
 * Đồng bộ danh bạ liên hệ trực tiếp từ giao diện Zalo đang mở.
 */
async function syncContactsFromZalo() {
  showToast("Bắt đầu đồng bộ danh bạ Zalo...");
  const resp = await sendMessage({ type: 'SYNC_CONTACTS' });
  if (!resp.ok) {
    showToast(resp.error || "Đồng bộ thất bại.", "error");
    return;
  }
  showToast(`Đồng bộ thành công ${resp.count || 0} liên hệ!`);
  await loadContacts();
}

/**
 * Xóa toàn bộ liên hệ trong DB.
 */
async function clearAllContacts() {
  if (!confirm("Cảnh báo: Bạn có chắc muốn xóa SẠCH toàn bộ cơ sở dữ liệu danh bạ?")) return;
  const resp = await sendMessage({ type: 'CLEAR_CONTACTS' });
  if (!resp.ok) {
    showToast(resp.error || "Xóa thất bại.", "error");
    return;
  }
  showToast("Đã xóa sạch dữ liệu danh bạ.");
  await loadContacts();
}

/**
 * Xuất dữ liệu danh bạ hiện tại sang file Excel (XLSX).
 */
function exportContactsToExcel() {
  if (latestContacts.length === 0) {
    showToast("Không có danh bạ để xuất!", "error");
    return;
  }
  const headers = ['display_name', 'zid', 'tag', 'tag_color', 'sys_phone', '_a/c', '_name', 'updatedAt'];
  downloadXlsx(`Zalo_Danh_Ba_${Date.now()}.xlsx`, headers, latestContacts);
  showToast("Đã tải xuống Excel danh bạ!");
}

/**
 * Vẽ danh sách các danh bạ đã được chọn gửi tin ở cột giữa.
 */
function renderSelectedContactsList() {
  const container = document.getElementById("selectedContactsContainer");
  const countLabel = document.getElementById("selectedContactsCount");
  if (!container || !countLabel) return;

  const selectedContacts = latestContacts.filter(c => {
    const key = c.phone || c.sys_phone || c.zid || c.display_name;
    return selectedDirectoryIds.has(key);
  });

  countLabel.innerText = selectedContacts.length;

  if (selectedContacts.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 h-full">
        <i data-lucide="info" class="w-6 h-6 mb-2 text-slate-350"></i>
        <p class="text-xs font-semibold">Chưa chọn liên hệ nào</p>
        <p class="text-[10px] text-slate-400 mt-1 max-w-[160px] mx-auto">Vui lòng tích chọn danh bạ ở cột bên trái để soạn gửi</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = selectedContacts.map(contact => {
    const key = contact.phone || contact.sys_phone || contact.zid || contact.display_name;
    const phoneToShow = formatDisplayPhone(contact.phone || contact.sys_phone || '');
    const nameToDisplay = contact.display_name || (phoneToShow ? `Số: ${phoneToShow}` : 'Không tên');
    const customColor = getCanonicalTagColor(contact.tag, contact.tag_color || "#4f46e5");
    const salutationEmoji = getSalutationEmoji(contact);

    return `
      <div 
        class="flex items-center justify-between p-2 rounded-lg border border-slate-150 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 transition-all group"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="rounded-full border border-indigo-100 flex-shrink-0 overflow-hidden bg-indigo-50 flex items-center justify-center" style="width: 40px; height: 40px;">
            ${contact.avatar ? `<img src="${escapeHtml(contact.avatar)}" class="w-full h-full object-cover" referrerpolicy="no-referrer" />` : `<span class="text-indigo-600 text-[11px] font-extrabold">${escapeHtml(getInitials(contact))}</span>`}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-slate-700 truncate leading-snug">${escapeHtml(nameToDisplay)}</p>
            <div class="flex items-center gap-1 mt-0.5">
              ${salutationEmoji ? `<span class="text-[10px] leading-none">${salutationEmoji}</span>` : ''}
              <span class="text-[9px] text-slate-400 font-mono">${escapeHtml(phoneToShow)}</span>
              ${contact.tag ? `<span class="px-1.5 py-0.5 text-[9px] font-extrabold rounded text-white origin-left" style="background-color: ${escapeHtml(customColor)}">${escapeHtml(contact.tag)}</span>` : ''}
            </div>
          </div>
        </div>
        <button 
          type="button" 
          data-remove-selected-id="${escapeHtml(key)}"
          class="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded transition-colors"
          title="Bỏ chọn"
        >
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  }).join("");

  container.querySelectorAll('[data-remove-selected-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSelectDirectoryContact(btn.dataset.removeSelectedId);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Bỏ chọn toàn bộ các liên hệ đang được tích.
 */
function clearAllSelectedContacts() {
  if (selectedDirectoryIds.size === 0) return;
  selectedDirectoryIds.clear();
  updateUI();
  showToast("Đã bỏ chọn toàn bộ liên hệ!");
}

/**
 * Cập nhật toàn bộ giao diện dựa trên dữ liệu mới nhất.
 */
function updateUI() {
  renderDirectoryList();
  updateDirectoryMasterCheckbox();
  renderSelectedContactsList();
  renderQueueTagFilter();
  renderContactTagFilter();
  renderQueueTable();
  renderContactsDatabaseTable();
  syncBulkActionsState();

  const filteredDir = getFilteredDirectory();
  const dirCountLabel = document.getElementById("directoryCountLabel");
  if (dirCountLabel) {
    dirCountLabel.innerText = `${selectedDirectoryIds.size}/${filteredDir.length}`;
  }
}
