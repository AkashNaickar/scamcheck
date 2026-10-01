// ScamCheck MV3 service worker: context menu -> open popup pre-filled.
// No API key ever lives in the extension; the backend holds it.

const DEFAULT_BACKEND = 'http://localhost:8787';
const MENU_ID = 'scamcheck-selection';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: MENU_ID,
    // ASSUMPTION: static menu label, not analysis text.
    title: 'Check if this is a scam',
    contexts: ['selection'],
  });
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  if (!backendUrl) await chrome.storage.sync.set({ backendUrl: DEFAULT_BACKEND });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  await chrome.storage.local.set({ pendingText: info.selectionText });
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup is unavailable on older Chrome or without a user gesture.
    chrome.windows.create({ url: 'popup.html', type: 'popup', width: 420, height: 660 });
  }
});
