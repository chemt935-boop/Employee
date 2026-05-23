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
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  el('token').value = token;

  el('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('info', 'Submitting...');

    const t = el('token').value.trim();
    const p1 = el('password').value;
    const p2 = el('password2').value;

    if (!t) return setStatus('error', 'Missing token');
    if (!p1 || p1.length < 6) return setStatus('error', 'Password must be at least 6 characters');
    if (p1 !== p2) return setStatus('error', 'Passwords do not match');

    try {
      await postJson('/api/auth/password-reset/confirm', { token: t, new_password: p1 });
      setStatus('success', 'Password updated successfully. You can close this page.');
      el('password').value = '';
      el('password2').value = '';
    } catch (err) {
      setStatus('error', err.message || 'Failed');
    }
  });
});

