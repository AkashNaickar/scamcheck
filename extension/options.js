// Options page: set the backend URL. No secrets are ever stored here.
const DEFAULT_BACKEND = 'http://localhost:8787';

const backendInput = document.getElementById('backend');
const saveButton = document.getElementById('save-button');
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.textContent = text ?? '';
}

async function init() {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  backendInput.value = backendUrl || DEFAULT_BACKEND;
}

saveButton.addEventListener('click', async () => {
  const value = backendInput.value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(value)) {
    setStatus('Enter a full URL starting with http:// or https://');
    return;
  }
  await chrome.storage.sync.set({ backendUrl: value });
  setStatus('Saved.');
});

void init();
