// Promise wrappers and Chrome debugger/CDP helpers for background workflows.
function tabsCreate(createProperties) {
  return new Promise((resolve) => chrome.tabs.create(createProperties, resolve));
}

function tabsUpdate(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (updateProperties && updateProperties.active) {
        setTimeout(() => resolve(tab), 1000);
      } else {
        resolve(tab);
      }
    });
  });
}

function scriptingExecuteScript(details) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(results || []);
    });
  });
}

function waitForTabLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Zalo load qua lau.'));
    }, timeoutMs);

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };

    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab?.status === 'complete') finish();
    });
  });
}

async function debuggerCommand(tabId, method, params = {}) {
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (err) {
    if (err.message && err.message.includes('Debugger is not attached')) {
      await chrome.debugger.attach({ tabId }, '1.3');
      debuggerAttachedTabs.add(tabId);
      return await chrome.debugger.sendCommand({ tabId }, method, params);
    }
    throw err;
  }
}

// Chrome debugger/CDP is required here because Zalo only triggers typing/send
// state reliably from real browser input events. This also means Chrome DevTools
// cannot be open on the same Zalo tab; otherwise Chrome raises
// "Another debugger is already attached".
async function attachDebugger(tabId) {
  if (debuggerAttachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerAttachedTabs.add(tabId);
  } catch (err) {
    if (err?.message?.includes('Another debugger is already attached')) {
      throw new Error('Tab Zalo đang bị DevTools/debugger khác chiếm. Hãy đóng DevTools trên tab đó rồi chạy lại.');
    }
    throw err;
  }
}

async function detachDebugger(tabId) {
  if (!debuggerAttachedTabs.has(tabId)) return;
  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttachedTabs.delete(tabId);
  } catch (err) {
    debuggerAttachedTabs.delete(tabId);
    // Ignore errors when detaching
  }
}

async function detachAllDebuggers() {
  const tabIds = Array.from(debuggerAttachedTabs);
  for (const tabId of tabIds) {
    await detachDebugger(tabId);
  }
}

async function pressKey(tabId, key, code, vk, extra = {}) {
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    ...extra
  });
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
    ...extra
  });
}

async function evaluateValue(tabId, expression) {
  const result = await debuggerCommand(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return result?.result?.value ?? null;
}

async function clickPoint(tabId, point) {
  await debuggerCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
  await debuggerCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
}

async function clearFocusedText(tabId) {
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
    modifiers: 2
  });
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: 2
  });
  await debuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Control',
    code: 'ControlLeft',
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17
  });
  await pressKey(tabId, 'Backspace', 'Backspace', 8);
}

async function insertText(tabId, text) {
  const injected = await scriptingExecuteScript({
    target: { tabId },
    func: (textToPaste) => {
      try {
        const targetInput = document.querySelector('#richInput') || document.activeElement;
        if (!targetInput || targetInput === document.body) {
          return { ok: false, error: 'Chua focus vao o nhap tin nhan Zalo.' };
        }
        targetInput.focus();
        
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', textToPaste);
        dataTransfer.setData('text', textToPaste);
        
        targetInput.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        }));
        
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    },
    args: [text]
  });
  
  const res = injected?.[0]?.result;
  if (!res?.ok) {
    // Fallback if paste event fails
    console.warn('Paste event failed, fallback is disabled for debugging.', res?.error);
    throw new Error('Giả lập paste text thất bại: ' + (res?.error || 'Unknown error'));
    // await debuggerCommand(tabId, 'Input.insertText', { text });
  }
}

async function waitForValue(tabId, expression, timeoutMs = 10000, intervalMs = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluateValue(tabId, expression);
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

