// ScamCheck frontend. Vanilla ES module. Only document.createElement +
// textContent are used to insert server/user data — never markup strings.

const MAX = 6000;

// ASSUMPTION: verdict display labels mirror src/core/templates.ts because
// public/ is static and cannot import server TS.
const VERDICT_LABELS = {
  very_likely_scam: 'Very likely a scam',
  likely_scam: 'Likely a scam',
  suspicious: 'Suspicious',
  no_obvious_red_flags: 'No obvious red flags',
};

const VERDICT_DESCRIPTIONS = {
  very_likely_scam: 'This shows strong signs of a scam attempt.',
  likely_scam: 'This shows clear warning signs of a common scam pattern.',
  suspicious: 'This has some warning signs. Treat it carefully.',
  no_obvious_red_flags: 'We didn\u2019t spot common scam patterns in this message.',
};

const VERDICT_ICONS = {
  very_likely_scam: '\u26d4',
  likely_scam: '\u26a0',
  suspicious: '\u2753',
  no_obvious_red_flags: '\u2139',
};

const NOT_CERTAIN =
  "We're not certain. Treat this carefully and verify through an official channel.";

const DISCLAIMER =
  'This is a second opinion, not a guarantee. When in doubt, contact the company using a number or website you already trust.';

const GENERIC_ERROR = 'Something went wrong, try again.';

const messageEl = document.getElementById('message');
const channelEl = document.getElementById('channel');
const counterEl = document.getElementById('counter');
const formEl = document.getElementById('check-form');
const checkBtn = document.getElementById('check-button');
const clearBtn = document.getElementById('clear-button');
const resultEl = document.getElementById('result');

let loading = false;

function createEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function updateCounter() {
  counterEl.textContent = messageEl.value.length + ' / ' + MAX;
}

function syncCheck() {
  const hasText = messageEl.value.trim().length > 0;
  checkBtn.disabled = loading || !hasText;
}

function setLoading(on) {
  loading = on;
  checkBtn.textContent = on ? 'Checking\u2026' : 'Check';
  syncCheck();
}

function clearResult() {
  resultEl.replaceChildren();
}

function renderError(message) {
  const box = createEl('div', 'result-error', message);
  box.setAttribute('role', 'alert');
  resultEl.appendChild(box);
}

function mapError(status, serverMessage) {
  if (status === 429) return "You've reached today's free limit.";
  if (status === 503) {
    return 'The checker is temporarily unavailable. Please try again soon.';
  }
  if (status >= 500) return GENERIC_ERROR;
  return serverMessage || GENERIC_ERROR;
}

function renderMeter(score) {
  const value = Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : 0;

  const section = createEl('section', 'result-section');
  const head = createEl('div', 'meter-head');
  head.append(
    createEl('h3', 'section-title', 'Risk score'),
    createEl('span', 'meter-number', value + ' / 100'),
  );

  const track = createEl('div', 'meter-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Risk score');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(value));

  const fill = createEl('div', 'meter-fill');
  fill.style.width = value + '%';
  track.appendChild(fill);

  section.append(head, track);
  return section;
}

function renderList(title, items) {
  const section = createEl('section', 'result-section');
  section.appendChild(createEl('h3', 'section-title', title));
  const ul = createEl('ul', 'result-list');
  for (const item of items) ul.appendChild(createEl('li', null, item));
  section.appendChild(ul);
  return section;
}

function renderLinks(links) {
  const section = createEl('section', 'result-section');
  section.appendChild(createEl('h3', 'section-title', 'Links'));

  for (const link of links) {
    if (!link || typeof link !== 'object') continue;

    const risk = link.risk === 'high' || link.risk === 'medium' ? link.risk : 'none';
    const item = createEl('div', 'link-item link-risk-' + risk);

    item.appendChild(
      createEl('p', 'link-url', typeof link.url === 'string' ? link.url : ''),
    );
    if (typeof link.host === 'string' && link.host) {
      item.appendChild(createEl('p', 'link-host', link.host));
    }

    const flags = Array.isArray(link.flags) ? link.flags : [];
    if (flags.length) {
      const ul = createEl('ul', 'link-flags');
      for (const flag of flags) {
        if (flag && typeof flag.text === 'string') {
          ul.appendChild(createEl('li', null, flag.text));
        }
      }
      if (ul.childNodes.length) item.appendChild(ul);
    }

    section.appendChild(item);
  }

  return section;
}

async function sendFeedback(requestId, label, wrap, buttons) {
  const all = buttons.querySelectorAll('button');
  for (const button of all) button.disabled = true;

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, label }),
    });
    if (res.status === 204) {
      wrap.replaceChildren(createEl('p', 'feedback-thanks', 'Thanks'));
      return;
    }
    throw new Error('feedback failed');
  } catch {
    for (const button of all) button.disabled = false;
    wrap.appendChild(createEl('p', 'feedback-error', GENERIC_ERROR));
  }
}

function renderFeedback(requestId) {
  const wrap = createEl('div', 'feedback');
  wrap.appendChild(createEl('p', 'feedback-prompt', 'Was this result helpful?'));

  const buttons = createEl('div', 'feedback-buttons');
  const options = [
    { label: 'This was a scam', value: 'scam' },
    { label: 'This was legit', value: 'not_scam' },
    { label: 'Not sure', value: 'unsure' },
  ];
  for (const option of options) {
    const button = createEl('button', 'feedback-btn', option.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      sendFeedback(requestId, option.value, wrap, buttons);
    });
    buttons.appendChild(button);
  }

  wrap.appendChild(buttons);
  return wrap;
}

function renderResult(data) {
  const known =
    typeof data.verdict === 'string' && VERDICT_LABELS[data.verdict] !== undefined;
  const verdict = known ? data.verdict : 'suspicious';

  const card = createEl('article', 'result-card verdict-' + verdict);

  const header = createEl('header', 'result-verdict');
  const icon = createEl('span', 'verdict-icon', VERDICT_ICONS[verdict]);
  icon.setAttribute('aria-hidden', 'true');
  header.append(
    icon,
    createEl('h2', 'verdict-label', VERDICT_LABELS[verdict]),
    createEl('p', 'verdict-desc', VERDICT_DESCRIPTIONS[verdict]),
  );
  card.appendChild(header);

  card.appendChild(renderMeter(data.riskScore));

  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const reasonTexts = reasons
    .map((reason) => (reason && typeof reason.text === 'string' ? reason.text : null))
    .filter(Boolean);
  if (reasonTexts.length) card.appendChild(renderList('Why', reasonTexts));

  const links = Array.isArray(data.links) ? data.links : [];
  if (links.length) card.appendChild(renderLinks(links));

  const advice = Array.isArray(data.advice) ? data.advice : [];
  const adviceTexts = advice.filter((item) => typeof item === 'string' && item);
  if (adviceTexts.length) card.appendChild(renderList('What to do', adviceTexts));

  if (data.confidence === 'low' || verdict === 'suspicious') {
    card.appendChild(createEl('p', 'confidence-note', NOT_CERTAIN));
  }

  card.appendChild(createEl('p', 'disclaimer', DISCLAIMER));

  if (typeof data.requestId === 'string' && data.requestId) {
    card.appendChild(renderFeedback(data.requestId));
  }

  resultEl.appendChild(card);
}

async function submitCheck() {
  const text = messageEl.value.trim();
  if (!text || loading) return;

  setLoading(true);
  clearResult();

  let res;
  try {
    res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, channel: channelEl.value }),
    });
  } catch {
    clearResult();
    renderError(GENERIC_ERROR);
    setLoading(false);
    return;
  }

  if (res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    clearResult();
    if (data && typeof data === 'object') renderResult(data);
    else renderError(GENERIC_ERROR);
  } else {
    let serverMessage = null;
    try {
      const body = await res.json();
      if (body && body.error && typeof body.error.message === 'string') {
        serverMessage = body.error.message;
      }
    } catch {
      serverMessage = null;
    }
    clearResult();
    renderError(mapError(res.status, serverMessage));
  }

  setLoading(false);
}

messageEl.addEventListener('input', () => {
  updateCounter();
  syncCheck();
});

messageEl.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    if (!loading && messageEl.value.trim()) submitCheck();
  }
});

formEl.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!loading && messageEl.value.trim()) submitCheck();
});

clearBtn.addEventListener('click', () => {
  messageEl.value = '';
  updateCounter();
  syncCheck();
  clearResult();
  messageEl.focus();
});

updateCounter();
syncCheck();
