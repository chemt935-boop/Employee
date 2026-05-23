async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text };
  }
  if (!res.ok) {
    const msg = json && json.error ? json.error : 'Request failed';
    throw new Error(msg);
  }
  return json;
}

function el(id) {
  return document.getElementById(id);
}

function setStatus(type, message) {
  const box = el('status');
  box.className = 'status ' + type;
  box.textContent = message;
  box.style.display = 'block';
}

window.addEventListener('DOMContentLoaded', () => {
  el('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('info', 'Submitting...');

    const raw = el('identity').value.trim();
    if (!raw) return setStatus('error', 'Enter employee id or email');

    const body = /^\d+$/.test(raw) ? { employee_id: Number(raw) } : { email: raw };

    try {
      await postJson('/api/auth/password-reset/request', body);
      setStatus('success', 'If this account exists, a reset link has been sent.');
    } catch (err) {
      setStatus('error', err.message || 'Failed');
    }
  });
});

