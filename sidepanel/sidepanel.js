let currentStatusFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  const logsContainer = document.getElementById('logs-container');
  const queueContainer = document.getElementById('queue-container');
  const clearBtn = document.getElementById('clearBtn');

  const icons = {
    success: 'check-circle-2',
    error: 'alert-circle',
    warn: 'alert-triangle',
    info: 'info',
    pending: 'clock',
    sending: 'send',
    wait_reply: 'refresh-cw',
    done: 'check-circle-2'
  };

  function appendLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-type-${type}`;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'log-icon';
    iconSpan.textContent = icons[type] || icons.info;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    const now = new Date();
    timeSpan.textContent = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    
    if (typeof message === 'object') {
      try {
        msgSpan.textContent = JSON.stringify(message, null, 2);
      } catch (e) {
        msgSpan.textContent = String(message);
      }
    } else {
      msgSpan.textContent = String(message);
    }

    entry.appendChild(iconSpan);
    entry.appendChild(timeSpan);
    entry.appendChild(msgSpan);
    
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
  
  // Dropdown UI logic
  let activeDropdown = null;
  document.addEventListener('click', (e) => {
    // Close active dropdown if clicking outside
    if (activeDropdown && !e.target.closest('#' + activeDropdown.id) && !e.target.closest(`[data-dropdown-target="${activeDropdown.id}"]`)) {
      activeDropdown.classList.add('hidden');
      activeDropdown = null;
    }
  });

  document.getElementById('queueStatusFilterBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('queueStatusFilterDropdown');
    if (activeDropdown && activeDropdown !== dropdown) activeDropdown.classList.add('hidden');
    dropdown.classList.toggle('hidden');
    activeDropdown = dropdown.classList.contains('hidden') ? null : dropdown;
  });

  document.getElementById('queueTagFilterBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('queueTagFilterDropdown');
    if (activeDropdown && activeDropdown !== dropdown) activeDropdown.classList.add('hidden');
    dropdown.classList.toggle('hidden');
    activeDropdown = dropdown.classList.contains('hidden') ? null : dropdown;
  });

  function renderQueue(queue) {
    if (!queue || !queue.byId || Object.keys(queue.byId).length === 0) {
      queueContainer.innerHTML = '<div class="text-center text-slate-400 text-[11px] mt-4">Hàng chờ trống.</div>';
      // Reset stats
      document.getElementById('statsPending').innerText = '0';
      document.getElementById('statsWatching').innerText = '0';
      document.getElementById('statsDone').innerText = '0';
      document.getElementById('statsErrors').innerText = '0';
      return;
    }

    const rows = Object.values(queue.byId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    queueContainer.innerHTML = '';
    
    let stats = { pending: 0, sending: 0, wait_reply: 0, done: 0, error: 0 };
    
    // Hàm tạo chữ cái đầu cho avatar
    function getInitials(nameStr) {
      const parts = nameStr.trim().split(' ');
      if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
      return nameStr.substring(0, 2).toUpperCase();
    }

    // Hàm xử lý tên chuẩn như chiến dịch
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

    rows.forEach(row => {
      let rawName = row.values?.display_name || row.values?.name || row.values?.phone || row.values?.zid || 'Không tên';
      const name = stripZaloTags(rawName);
      const status = row.status || 'pending';
      if (stats[status] !== undefined) stats[status]++;
      else if (status === 'error') stats.error++;
      
      if (currentStatusFilter !== 'all' && currentStatusFilter !== status) return;
      const statusTextMap = {
        done: 'Hoàn tất',
        error: 'Lỗi',
        sending: 'Đang gửi',
        wait_reply: 'Chờ phản hồi',
        pending: 'Chờ gửi'
      };
      
      const statusColorMap = {
        done: 'text-emerald-500',
        error: 'text-rose-500',
        sending: 'text-indigo-500',
        wait_reply: 'text-cyan-500',
        pending: 'text-slate-400'
      };

      const statusIcon = icons[status] || icons.pending;
      const statusColor = statusColorMap[status] || statusColorMap.pending;

      const item = document.createElement('div');
      item.className = `queue-item bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-sm flex flex-col gap-1.5 relative transition-all hover:border-slate-600 group`;
      item.dataset.zid = row.values?.zid || '';
      item.dataset.phone = row.values?.phone || row.values?.sys_phone || '';
      
      const mainRow = document.createElement('div');
      mainRow.className = 'flex items-center gap-2 w-full';

      // 1. Status Icon
      const statusEl = document.createElement('div');
      statusEl.className = `flex items-center justify-center flex-shrink-0 ${statusColor}`;
      statusEl.title = statusTextMap[status] || status;
      statusEl.innerHTML = `<i data-lucide="${statusIcon}" class="w-4 h-4"></i>`;
      mainRow.appendChild(statusEl);
      
      // 2. Avatar
      const avatarSrc = row.values?.avatar || '';
      const avatar = document.createElement('div');
      avatar.className = 'w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 text-slate-300 font-bold text-[10px] border border-slate-600 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity';
      avatar.title = 'Mở cuộc trò chuyện này';
      if (avatarSrc) {
        avatar.innerHTML = `<img src="${avatarSrc}" class="w-full h-full object-cover">`;
      } else {
        avatar.textContent = getInitials(name);
      }
      
      avatar.onclick = (e) => {
        e.stopPropagation();
        const z = row.values?.zid || '';
        const p = row.values?.phone || row.values?.sys_phone || '';
        chrome.runtime.sendMessage({ type: 'GOTO_CHAT', zid: z, phone: p });
      };
      
      mainRow.appendChild(avatar);
      
      // 3. Nội dung: Tên + SĐT + Tag
      const content = document.createElement('div');
      content.className = 'flex-1 min-w-0 flex flex-col gap-0.5';
      
      const nameEl = document.createElement('div');
      nameEl.className = 'text-[11px] font-bold text-slate-100 truncate pr-8';
      nameEl.textContent = name;
      content.appendChild(nameEl);
      
      const phone = row.values?.phone || row.values?.sys_phone || '';
      const tag = String(row.values?.tag || '').trim();
      let tagColor = row.values?.tag_color || row.tagColor;
      if (!tagColor && tag) {
        let hash = 0;
        for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'];
        tagColor = colors[Math.abs(hash) % colors.length];
      }
      
      if (phone || tag) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'flex items-center gap-1.5 min-w-0';
        if (phone) {
           detailsEl.innerHTML += `<span class="text-[9px] text-slate-400 font-mono whitespace-nowrap">${phone}</span>`;
        }
        if (tag) {
           detailsEl.innerHTML += `<span class="px-1 py-[1px] text-[8px] font-extrabold rounded text-white whitespace-nowrap inline-block truncate max-w-[80px]" style="background-color: ${tagColor}">${tag}</span>`;
        }
        content.appendChild(detailsEl);
      }
      
      mainRow.appendChild(content);
      item.appendChild(mainRow);
      
      // Lỗi (nếu có)
      if (row.error) {
        const errEl = document.createElement('div');
        errEl.className = 'text-[9.5px] font-medium text-rose-400 truncate w-full pl-6';
        errEl.textContent = `Lỗi: ${row.error}`;
        item.appendChild(errEl);
      }

      queueContainer.appendChild(item);
    });
    
    // Update stats UI
    document.getElementById('statsPending').innerText = (stats.pending + stats.sending) || '0';
    document.getElementById('statsWatching').innerText = stats.wait_reply || '0';
    document.getElementById('statsDone').innerText = stats.done || '0';
    document.getElementById('statsErrors').innerText = stats.error || '0';
    
    if (window.lucide) window.lucide.createIcons();
    
    // Áp dụng lại active class nếu đang có
    if (window.lastActiveZid) {
      highlightActiveChat(window.lastActiveZid);
    }
  }
  
  function highlightActiveChat(zid) {
    if (!zid) return;
    window.lastActiveZid = zid;
    const items = document.querySelectorAll('.queue-item');
    let found = false;
    items.forEach(el => {
      if (el.dataset.zid === zid) {
        el.classList.add('active-chat');
        if (!found) { // Chỉ cuộn đến người đầu tiên nếu có trùng lặp
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          found = true;
        }
      } else {
        el.classList.remove('active-chat');
      }
    });
  }

  function loadQueue() {
    chrome.runtime.sendMessage({ type: 'GET_QUEUE' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.queue) {
        renderQueue(resp.queue);
      }
    });
  }

  clearBtn.addEventListener('click', () => {
    logsContainer.innerHTML = '';
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'SIDE_PANEL_LOG') {
      appendLog(message.payload, message.logType || 'info');
    }
    if (message && message.type === 'ZALO_ACTIVE_CHAT_CHANGED') {
      if (message.current && message.current.zid) {
        highlightActiveChat(message.current.zid);
      }
    }
  });

  // Lắng nghe sự kiện filter từ HTML
  document.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('[data-status-filter]');
    if (filterBtn) {
      let targetFilter = filterBtn.dataset.statusFilter;
      
      // Nếu click vào filter đang active (và không phải là "all"), thì toggle tắt nó về "all"
      if (targetFilter !== 'all' && currentStatusFilter === targetFilter) {
        targetFilter = 'all';
      }
      
      currentStatusFilter = targetFilter;
      
      // Cập nhật giao diện nút dropdown filter
      const btnInDropdown = document.querySelector(`#queueStatusFilterDropdown [data-status-filter="${targetFilter}"]`);
      if (btnInDropdown) {
        document.getElementById('queueStatusFilterLabel').innerText = btnInDropdown.innerText.trim();
      }
      
      if (activeDropdown) {
        activeDropdown.classList.add('hidden');
        activeDropdown = null;
      }
      
      loadQueue();
    }
  });

  if (window.lucide) window.lucide.createIcons();

  // Fetch queue immediately and poll every 2 seconds
  loadQueue();
  setInterval(loadQueue, 2000);
});
