require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { logger } = require('./logger');
const { ping } = require('./db/sql');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const path = require('path');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/public', express.static(path.join(__dirname, 'public')));
  app.use(
    pinoHttp({
      logger
    })
  );

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/forgot-password', (req, res) => {
    res.type('html').send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Forgot Password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #060a12;
      --surface:   #0d1424;
      --border:    rgba(99,132,255,.18);
      --border-h:  rgba(99,132,255,.45);
      --accent:    #4f6eff;
      --accent-g:  #7c94ff;
      --text:      #e2e8f8;
      --muted:     #6b7a9f;
      --subtle:    #1a2140;
      --success-bg:#04160e;
      --success-b: #0d4a2a;
      --success-t: #6ee7b7;
      --error-bg:  #160406;
      --error-b:   #5a1520;
      --error-t:   #fca5a5;
    }

    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      /* subtle radial glow */
      background-image:
        radial-gradient(ellipse 600px 400px at 50% -60px, rgba(79,110,255,.12) 0%, transparent 70%);
    }

    .wrap {
      width: 100%;
      max-width: 420px;
      animation: fadeUp .45s cubic-bezier(.22,1,.36,1) both;
    }
    @keyframes fadeUp {
      from { opacity:0; transform:translateY(18px); }
      to   { opacity:1; transform:translateY(0); }
    }

    /* Logo mark */
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
    }
    .logo-icon {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, var(--accent), var(--accent-g));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo-icon svg { width:18px; height:18px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; }
    .logo-name { font-weight:600; font-size:15px; letter-spacing:.02em; color:var(--text); }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 36px 32px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.03) inset,
                  0 24px 60px rgba(0,0,0,.5);
    }

    .card-header { margin-bottom: 28px; }
    .card-header h1 {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -.01em;
      color: var(--text);
      margin-bottom: 8px;
    }
    .card-header p {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--muted);
    }

    .divider {
      height: 1px;
      background: var(--border);
      margin-bottom: 28px;
    }

    .field { margin-bottom: 18px; }
    .field label {
      display: block;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--muted);
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .input-wrap { position: relative; }
    .input-wrap .icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--muted); pointer-events: none;
    }
    .input-wrap .icon svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; }

    input[type="text"],
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 11px 14px 11px 40px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    input:focus {
      border-color: var(--border-h);
      box-shadow: 0 0 0 3px rgba(79,110,255,.12);
    }
    input::placeholder { color: #3a4560; }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 24px;
      padding: 12px 20px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-g) 100%);
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .01em;
      cursor: pointer;
      transition: opacity .2s, transform .15s, box-shadow .2s;
      box-shadow: 0 4px 20px rgba(79,110,255,.35);
    }
    .btn:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); box-shadow:0 6px 28px rgba(79,110,255,.45); }
    .btn:active:not(:disabled) { transform:translateY(0); }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn svg { width:15px; height:15px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; }

    /* Spinner */
    .spinner {
      width:15px; height:15px;
      border:2px solid rgba(255,255,255,.3);
      border-top-color:#fff;
      border-radius:50%;
      animation:spin .6s linear infinite;
      display:none;
    }
    @keyframes spin { to { transform:rotate(360deg); } }

    .status {
      display: none;
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      animation: fadeIn .25s ease;
    }
    @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    .status.info    { background:var(--subtle); border:1px solid var(--border); color:var(--text); }
    .status.success { background:var(--success-bg); border:1px solid var(--success-b); color:var(--success-t); }
    .status.error   { background:var(--error-bg); border:1px solid var(--error-b); color:var(--error-t); }

    .back-link {
      display: block;
      text-align: center;
      margin-top: 22px;
      font-size: 13px;
      color: var(--muted);
      text-decoration: none;
      transition: color .15s;
    }
    .back-link:hover { color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      </div>
      <span class="logo-name">Employee Portal</span>
    </div>

    <div class="card">
      <div class="card-header">
        <h1>Forgot password?</h1>
        <p>Enter your employee ID or email. If the account exists, a reset link will be sent to the address on file.</p>
      </div>
      <div class="divider"></div>

      <form id="form">
        <div class="field">
          <label for="identity">Employee ID or email</label>
          <div class="input-wrap">
            <span class="icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </span>
            <input id="identity" type="text" autocomplete="username" placeholder="201225 or user@company.com" />
          </div>
        </div>

        <button class="btn" type="submit" id="btn">
          <span id="btn-label">Send reset link</span>
          <div class="spinner" id="spinner"></div>
          <svg id="btn-icon" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
        </button>

        <div id="status" class="status"></div>
      </form>
    </div>

  </div>
  <script src="/public/forgot-password.js"></script>
</body>
</html>
    `);
  });

  app.get('/reset-password', (req, res) => {
    res.type('html').send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset Password</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #060a12;
      --surface:   #0d1424;
      --border:    rgba(99,132,255,.18);
      --border-h:  rgba(99,132,255,.45);
      --accent:    #10b97a;
      --accent-g:  #34d399;
      --text:      #e2e8f8;
      --muted:     #6b7a9f;
      --subtle:    #1a2140;
      --success-bg:#04160e;
      --success-b: #0d4a2a;
      --success-t: #6ee7b7;
      --error-bg:  #160406;
      --error-b:   #5a1520;
      --error-t:   #fca5a5;
    }

    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background-image:
        radial-gradient(ellipse 600px 400px at 50% -60px, rgba(16,185,122,.10) 0%, transparent 70%);
    }

    .wrap {
      width: 100%;
      max-width: 420px;
      animation: fadeUp .45s cubic-bezier(.22,1,.36,1) both;
    }
    @keyframes fadeUp {
      from { opacity:0; transform:translateY(18px); }
      to   { opacity:1; transform:translateY(0); }
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 32px;
    }
    .logo-icon {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, var(--accent), var(--accent-g));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo-icon svg { width:18px; height:18px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; }
    .logo-name { font-weight:600; font-size:15px; letter-spacing:.02em; color:var(--text); }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 36px 32px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.03) inset,
                  0 24px 60px rgba(0,0,0,.5);
    }

    .card-header { margin-bottom: 28px; }
    .card-header h1 {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -.01em;
      color: var(--text);
      margin-bottom: 8px;
    }
    .card-header p {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--muted);
    }

    .divider {
      height: 1px;
      background: var(--border);
      margin-bottom: 28px;
    }

    .field { margin-bottom: 18px; }
    .field label {
      display: block;
      font-size: 12.5px;
      font-weight: 500;
      color: var(--muted);
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .input-wrap { position: relative; }
    .input-wrap .icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--muted); pointer-events: none;
    }
    .input-wrap .icon svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; }
    .input-wrap .toggle {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px;
      transition: color .15s;
    }
    .input-wrap .toggle:hover { color: var(--text); }
    .input-wrap .toggle svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; display:block; }

    input[type="text"],
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 11px 40px 11px 40px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-family: inherit;
      font-size: 14px;
      outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    input:focus {
      border-color: var(--border-h);
      box-shadow: 0 0 0 3px rgba(16,185,122,.12);
    }
    input::placeholder { color: #3a4560; }

    /* Strength meter */
    .strength-wrap { margin-top: 8px; }
    .strength-bar {
      display: flex; gap: 4px; margin-bottom: 6px;
    }
    .strength-seg {
      flex: 1; height: 3px; border-radius: 99px;
      background: var(--subtle);
      transition: background .3s;
    }
    .strength-seg.weak   { background: #ef4444; }
    .strength-seg.fair   { background: #f59e0b; }
    .strength-seg.good   { background: #3b82f6; }
    .strength-seg.strong { background: var(--accent); }
    .strength-label { font-size: 11.5px; color: var(--muted); }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-top: 24px;
      padding: 12px 20px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-g) 100%);
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: .01em;
      cursor: pointer;
      transition: opacity .2s, transform .15s, box-shadow .2s;
      box-shadow: 0 4px 20px rgba(16,185,122,.3);
    }
    .btn:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); box-shadow:0 6px 28px rgba(16,185,122,.4); }
    .btn:active:not(:disabled) { transform:translateY(0); }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .btn svg { width:15px; height:15px; fill:none; stroke:#fff; stroke-width:2; stroke-linecap:round; }

    .spinner {
      width:15px; height:15px;
      border:2px solid rgba(255,255,255,.3);
      border-top-color:#fff;
      border-radius:50%;
      animation:spin .6s linear infinite;
      display:none;
    }
    @keyframes spin { to { transform:rotate(360deg); } }

    .status {
      display: none;
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      animation: fadeIn .25s ease;
    }
    @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    .status.info    { background:var(--subtle); border:1px solid var(--border); color:var(--text); }
    .status.success { background:var(--success-bg); border:1px solid var(--success-b); color:var(--success-t); }
    .status.error   { background:var(--error-bg); border:1px solid var(--error-b); color:var(--error-t); }

    .back-link {
      display: block;
      text-align: center;
      margin-top: 22px;
      font-size: 13px;
      color: var(--muted);
      text-decoration: none;
      transition: color .15s;
    }
    .back-link:hover { color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <div class="logo-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <span class="logo-name">Employee Portal</span>
    </div>

    <div class="card">
      <div class="card-header">
        <h1>Reset your password</h1>
        <p>Choose a strong new password. It must be at least 8 characters long.</p>
      </div>
      <div class="divider"></div>

      <form id="form">
        <input id="token" type="hidden" />

        <div class="field">
          <label for="password">New password</label>
          <div class="input-wrap">
            <span class="icon">
              <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
            <input id="password" type="password" autocomplete="new-password" placeholder="Min. 8 characters" />
            <button type="button" class="toggle" id="toggle1" aria-label="Show password">
              <svg viewBox="0 0 24 24" id="eye1"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="strength-wrap">
            <div class="strength-bar">
              <div class="strength-seg" id="s1"></div>
              <div class="strength-seg" id="s2"></div>
              <div class="strength-seg" id="s3"></div>
              <div class="strength-seg" id="s4"></div>
            </div>
            <span class="strength-label" id="strength-label">Enter a password</span>
          </div>
        </div>

        <div class="field">
          <label for="password2">Confirm new password</label>
          <div class="input-wrap">
            <span class="icon">
              <svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </span>
            <input id="password2" type="password" autocomplete="new-password" placeholder="Repeat password" />
            <button type="button" class="toggle" id="toggle2" aria-label="Show confirm password">
              <svg viewBox="0 0 24 24" id="eye2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        <button class="btn" type="submit" id="btn">
          <span id="btn-label">Update password</span>
          <div class="spinner" id="spinner"></div>
          <svg id="btn-icon" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
        </button>

        <div id="status" class="status"></div>
      </form>
    </div>
  </div>

  <script>
    // Password strength meter
    const pwInput = document.getElementById('password');
    const segs = [document.getElementById('s1'), document.getElementById('s2'),
                  document.getElementById('s3'), document.getElementById('s4')];
    const strengthLabel = document.getElementById('strength-label');
    const levels = ['','weak','fair','good','strong'];
    const labels = ['Enter a password','Weak','Fair','Good','Strong'];

    function scorePassword(p) {
      if (!p) return 0;
      let s = 0;
      if (p.length >= 8)  s++;
      if (p.length >= 12) s++;
      if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
      if (/[0-9]/.test(p)) s++;
      if (/[^A-Za-z0-9]/.test(p)) s++;
      return Math.min(4, s);
    }

    pwInput.addEventListener('input', () => {
      const score = scorePassword(pwInput.value);
      segs.forEach((seg, i) => {
        seg.className = 'strength-seg' + (i < score ? ' ' + levels[score] : '');
      });
      strengthLabel.textContent = labels[score];
    });

    // Show/hide toggles
    function makeToggle(toggleId, inputId) {
      const btn = document.getElementById(toggleId);
      const inp = document.getElementById(inputId);
      btn.addEventListener('click', () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    }
    makeToggle('toggle1', 'password');
    makeToggle('toggle2', 'password2');
  </script>
  <script src="/public/reset-password.js"></script>
</body>
</html>
    `);
  });

  app.get('/health/db', async (req, res) => {
    try {
      const ok = await ping();
      res.json({ ok, db: { connected: ok } });
    } catch (err) {
      const isProd = process.env.NODE_ENV === 'production';
      res.status(503).json({
        ok: false,
        db: { connected: false },
        error: isProd ? 'DB unavailable' : err.message,
        code: isProd ? undefined : err.code
      });
    }
  });

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };