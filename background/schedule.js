// Schedule persistence helpers for alarm-triggered one-off sends.
function clearSchedule() {
  chrome.alarms.clear(ALARM_NAME);
  chrome.storage.local.set({ schedule: { isScheduled: false, runAt: 0 } });
}

function saveLastRun(status, detail) {
  // Popup reads this so failures like "no search result" are visible to user.
  chrome.storage.local.set({
    lastRun: {
      status,
      detail,
      at: Date.now()
    }
  });
}

