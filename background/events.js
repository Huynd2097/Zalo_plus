// Chrome extension event listeners and message router for the background worker.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    const result = await runTask();
    await saveZaloContact(result);
    saveLastRun('ok', result?.zid ? `Da gui SMS. zid=${result.zid}, name=${result.name}` : 'Da chay xong lich hen.');
  } catch (err) {
    console.error('Run task error', err);
    saveLastRun('error', err?.message || 'Run task error');
  } finally {
    clearSchedule();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['schedule']);
  const schedule = data.schedule || { isScheduled: false, runAt: 0 };
  if (!schedule.isScheduled) return;

  if (schedule.runAt <= Date.now()) {
    try {
      const result = await runTask();
      await saveZaloContact(result);
      saveLastRun('ok', result?.zid ? `Da gui SMS. zid=${result.zid}, name=${result.name}` : 'Da chay xong lich hen.');
    } catch (err) {
      console.error('Startup run task error', err);
      saveLastRun('error', err?.message || 'Run task error');
    } finally {
      clearSchedule();
    }
    return;
  }

  chrome.alarms.create(ALARM_NAME, { when: schedule.runAt });
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['schedule']);
  const schedule = data.schedule || { isScheduled: false, runAt: 0 };
  if (schedule.isScheduled && schedule.runAt > Date.now()) {
    chrome.alarms.create(ALARM_NAME, { when: schedule.runAt });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (workerRuntime.waitReplyTabId && tabId === workerRuntime.waitReplyTabId) {
    stopWorker();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_STATUS') {
    chrome.storage.local.get(['schedule', 'lastRun', 'zaloContacts'], (data) => {
      const schedule = data.schedule || { isScheduled: false, runAt: 0 };
      sendResponse({
        ok: true,
        schedule,
        lastRun: data.lastRun || null,
        zaloContacts: data.zaloContacts || {}
      });
    });
    return true;
  }

  if (message?.type === 'CANCEL_TASK') {
    clearSchedule();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === 'ZALO_ACTIVE_CHAT_CHANGED') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'Thiếu sender tab.' });
      return;
    }
    updateCurrentWaitFromActiveChat(tabId, message.current)
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không cập nhật được chat hiện tại.' }));
    return true;
  }

  if (message?.type === 'START_WORKER') {
    startWorker(sender.tab?.id)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không khởi động được hàng chờ.' }));
    return true;
  }

  if (message?.type === 'PAUSE_WORKER') {
    pauseWorker()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không tạm dừng được hàng chờ.' }));
    return true;
  }

  if (message?.type === 'STOP_WORKER') {
    stopWorker()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không dừng được hàng chờ.' }));
    return true;
  }

  if (message?.type === 'GET_QUEUE') {
    Promise.all([loadQueue(), loadWorkerState()])
      .then(([queue, state]) => {
        sendResponse({ ok: true, queue, state });
      })
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không đọc được hàng chờ.' }));
    return true;
  }

  if (message?.type === 'UPDATE_ROW') {
    updateQueueRow(message.rowId, message.updates)
      .then((row) => sendResponse({ ok: true, row }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không cập nhật được dòng.' }));
    return true;
  }

  if (message?.type === 'ADD_ROWS') {
    addRowsToQueue(message.rows, message.headers)
      .then((queue) => sendResponse({ ok: true, queue }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không thêm được dòng.' }));
    return true; 
  }

  if (message?.type === 'REGISTER_MEDIA') {
    storageGet(['mediaStore']).then((data) => {
      const mediaStore = data.mediaStore || {};
      mediaStore[message.mediaId] = {
        base64: message.base64,
        thumbnail: message.thumbnail,
        name: message.name
      };
      storageSet({ mediaStore }).then(() => {
        sendResponse({ ok: true });
      });
    }).catch((err) => sendResponse({ ok: false, error: err?.message || 'Không đăng ký được hình ảnh.' }));
    return true;
  }

  if (message?.type === 'REMOVE_ROWS') {
    removeQueueRows(message.ids)
      .then((queue) => sendResponse({ ok: true, queue }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không xóa được dòng.' }));
    return true;
  }

  if (message?.type === 'CLEAR_QUEUE') {
    clearQueue()
      .then((queue) => sendResponse({ ok: true, queue }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không xóa sạch được hàng chờ.' }));
    return true;
  }

  if (message?.type === 'SKIP_ROW') {
    const id = message.rowId;
    updateQueueRow(id, { status: 'done', error: '' })
      .then((row) => {
        loadWorkerState().then((state) => {
          if (state.currentWait?.rowId === id) {
            saveWorkerState({ currentWait: null });
          }
        });
        sendResponse({ ok: true, row });
      })
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không bỏ qua được dòng này.' }));
    return true;
  }

  if (message?.type === 'SYNC_CONTACTS') {
    syncVisibleContacts()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không đồng bộ được liên hệ.' }));
    return true;
  }

  if (message?.type === 'GET_CONTACTS') {
    getStoredContacts()
      .then((contacts) => sendResponse({ ok: true, contacts }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không đọc được liên hệ.' }));
    return true;
  }

  if (message?.type === 'TAG_CONTACTS_BY_PHONES') {
    tagContactsByPhones(message.phones, message.tag, message.color)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không gắn tag được liên hệ.' }));
    return true;
  }

  if (message?.type === 'TAG_CONTACT_BY_IDENTITY') {
    tagContactByIdentity(message.identity, message.tag, message.color)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'KhÃ´ng gáº¯n tag Ä‘Æ°á»£c liÃªn há»‡.' }));
    return true;
  }

  if (message?.type === 'UPDATE_TAG_COLOR') {
    updateTagColor(message.tag, message.color)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không đổi màu nhãn được.' }));
    return true;
  }

  if (message?.type === 'REMOVE_TAG_FROM_ALL') {
    deleteTagFromAllContacts(message.tag)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không xoá được nhãn.' }));
    return true;
  }

  if (message?.type === 'DELETE_CONTACT') {
    deleteContactByPhone(message.phone)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không xoá được liên hệ.' }));
    return true;
  }

  if (message?.type === 'CLEAR_CONTACTS') {
    clearContacts()
      .then((contacts) => sendResponse({ ok: true, contacts }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Không xóa được liên hệ.' }));
    return true;
  }

  if (message?.type !== 'SCHEDULE_TASK') return;

  const payload = message.payload;
  if (!payload?.delayMs || !payload?.message) {
    sendResponse({ ok: false, error: 'Payload invalid.' });
    return;
  }

  const runAt = Date.now() + payload.delayMs;

  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { when: runAt });
    chrome.storage.local.set({
      schedule: {
        isScheduled: true,
        runAt,
        message: payload.message,
        phone: payload.phone || ''
      },
      lastRun: null
    });
    sendResponse({ ok: true, runAt });
  });

  return true;
});

/**
 * Khôi phục hoạt động của worker nếu nó đang chạy trước khi Service Worker bị khởi động lại.
 * @returns {Promise<void>}
 */
async function resumeWorkerIfRunning() {
  await migrateFromBatchToQueue(); // Tự động di cư dữ liệu cũ nếu có
  const state = await loadWorkerState();
  if (state.running && state.phase !== 'paused') {
    const zaloTab = await ensureZaloTab();
    if (zaloTab?.id) {
      workerRuntime.runPromise = runWorkerLoop(zaloTab.id).catch(console.error);
    }
  }
}

resumeWorkerIfRunning();
