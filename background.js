const ALARM_NAME = 'zoom-zalo-schedule';

const CONTACT_MAP_STORAGE_KEY = 'zaloContactMap';
const BATCH_POLL_DELAY_MS = 5000;
const REPLY_COLLECTION_LIMIT_KEY = 'replyCollectionLimit';
const DEFAULT_REPLY_COLLECTION_LIMIT = 0;
const RETRY_SEND_DELAY_MS = 5000;
const REQUIRED_BATCH_COLUMNS = ['message'];
const WAIT_REPLY_BATCH_COLUMN = 'wait_reply';
const INTERMEDIATE_BATCH_COLUMNS = ['display_name', 'tag', 'sys_phone', '_a/c', '_name'];
const OUTPUT_BATCH_COLUMNS = ['replies', 'error'];

// Maintainer notes:
// - Do not replace CDP typing/clicking with DOM .value/.click() for message send.
//   Zalo has repeatedly ignored synthetic input unless it comes through real
//   browser input events.
// - Batch send should use the current Zalo tab. Prefer clicking an existing
//   sidebar item by zid; if it is not rendered, navigate to ?c=zid, then verify
//   zid/name before sending.
// - Manual state has only three user states: pending, wait_reply, done. Internal
//   transitional states are normalized for display and should not leak into UI.
const debuggerAttachedTabs = new Set();
const zaloActionLock = { busy: false, queue: [] };

// Import order matters: later modules call helpers registered by earlier files.
importScripts(
  'background/utils.js',
  'background/common.js',
  'background/queue.js',
  'background/chrome-helpers.js',
  'background/webhook.js',
  'background/zalo-actions.js',
  'background/schedule.js',
  'background/contacts.js',
  'background/worker.js',
  'background/events.js'
);
