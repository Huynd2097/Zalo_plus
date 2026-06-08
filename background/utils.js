// Loaded by background.js with importScripts(). Keep this file limited to small
// Promise wrappers/shared helpers so the service worker boot path stays simple.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFirstTabByUrl(patterns) {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const found = tabs.find((t) => {
        const url = t.url || '';
        return patterns.some((p) => p.test(url));
      });
      resolve(found || null);
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || { ok: false, error: 'No response from content script.' });
    });
  });
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}
