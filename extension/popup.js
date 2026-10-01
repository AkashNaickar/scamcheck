// Popup logic. Renders only with createElement/textContent — never innerHTML.
const DEFAULT_BACKEND = 'http://localhost:8787';
const MAX_CHARS = 6000;

// ASSUMPTION: display labels mirror src/core/templates.ts; the extension is
// plain JS and cannot import server TypeScript.
const VERDICTS = {
  very_likely_scam: { label: 'Very likely a scam', icon: '\u26D4', cls: 'v-very' },
  likely_scam: { label: 'Likely a scam', icon: '\u26A0', cls: 'v-likely' },
  suspicious: { label: 'Suspicious', icon: '\u2753', cls: 'v-suspicious' },
  no_obvious_red_flags: { label: 'No obvious red flags', icon: '\u2139', cls: 'v-none' },
};

const $ = (id) => document.getElementById(id);
const messageEl = $('message');
const checkButton = $('check-button');
const clearButton = $('clear-button');
const statusEl = $('status');
const resultEl = $('result');

function setStatus(text) {
  statusEl.textContent = text ?? '';
}

function updateCounter() {
  $('counter').textContent = `${messageEl.value.length} / ${MAX_CHARS}`;
  checkButton.disabled = messageEl.value.trim().length === 0;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function list(items) {
  const ul = el('ul', undefined, 'bullets');
  for (const item of items) ul.appendChild(el('li', item));
  return ul;
}

async function getBackend() {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  return (backendUrl || DEFAULT_BACKEND).replace(/\/+$/, '');
}

function errorText(status, body) {
  if (!navigator.onLine || status === 0) return 'Something went wrong, try again.';
  if (status === 429) return "You've reached today's free limit.";
  if (status === 503) return 'The checker is temporarily unavailable. Please try again soon.';
  if (status >= 500) return 'Something went wrong, try again.';
  return (body && body.error && body.error.message) || 'Something went wrong, try again.';
}

function renderResult(result) {
  resultEl.textContent = '';
  const v = VERDICTS[result.verdict] || VERDICTS.suspicious;

  const card = el('div', undefined, `verdict ${v.cls}`);
  card.appendChild(el('span', v.icon, 'v-icon'));
  card.appendChild(el('span', v.label, 'v-label'));
  resultEl.appendChild(card);

  const meter = el('div', undefined, 'meter');
  meter.appendChild(el('div', `Risk score ${result.riskScore} / 100`, 'meter-label'));
  const track = el('div', undefined, 'meter-track');
  const bar = el('div', undefined, 'meter-bar');
  bar.style.width = `${Math.max(0, Math.min(100, result.riskScore))}%`;
  track.appendChild(bar);
  meter.appendChild(track);
  resultEl.appendChild(meter);

  if (result.reasons && result.reasons.length) {
    resultEl.appendChild(el('h2', 'Why'));
    resultEl.appendChild(list(result.reasons.map((r) => r.text)));
  }

  if (result.links && result.links.length) {
    resultEl.appendChild(el('h2', 'Links'));
    for (const link of result.links) {
      const box = el('div', undefined, 'link');
      box.appendChild(el('div', link.url, 'link-url'));
      box.appendChild(el('div', link.host, 'link-host'));
      if (link.flags && link.flags.length) box.appendChild(list(link.flags.map((f) => f.text)));
      resultEl.appendChild(box);
    }
  }

  if (result.advice && result.advice.length) {
    resultEl.appendChild(el('h2', 'What to do'));
    resultEl.appendChild(list(result.advice));
  }

  if (result.confidence === 'low' || result.verdict === 'suspicious') {
    resultEl.appendChild(
      el('p', "We're not certain. Treat this carefully and verify through an official channel.", 'note'),
    );
  }

  resultEl.appendChild(
    el(
      'p',
      'This is a second opinion, not a guarantee. When in doubt, contact the company using a number or website you already trust.',
      'disclaimer',
    ),
  );
}

async function runCheck() {
  const text = messageEl.value.trim();
  if (!text) return;
  setStatus('Checking...');
  checkButton.disabled = true;
  resultEl.textContent = '';
  try {
    const backend = await getBackend();
    const response = await fetch(`${backend}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, channel: 'other' }),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      setStatus(errorText(response.status, body));
      return;
    }
    setStatus('');
    renderResult(body);
  } catch {
    setStatus('Something went wrong, try again.');
  } finally {
    checkButton.disabled = messageEl.value.trim().length === 0;
  }
}

messageEl.addEventListener('input', updateCounter);
messageEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runCheck();
  }
});
checkButton.addEventListener('click', runCheck);
clearButton.addEventListener('click', () => {
  messageEl.value = '';
  resultEl.textContent = '';
  setStatus('');
  updateCounter();
  messageEl.focus();
});

async function init() {
  updateCounter();
  const { pendingText } = await chrome.storage.local.get('pendingText');
  if (pendingText) {
    await chrome.storage.local.remove('pendingText');
    messageEl.value = pendingText.slice(0, MAX_CHARS);
    updateCounter();
    runCheck();
  }
}

void init();
