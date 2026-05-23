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
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px}
    .card{max-width:460px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:22px}
    h1{font-size:20px;margin:0 0 6px}
    p{margin:0 0 14px;color:#9ca3af;font-size:14px}
    label{display:block;font-size:13px;margin:12px 0 6px;color:#d1d5db}
    input{width:100%;padding:12px 12px;border-radius:10px;border:1px solid #374151;background:#0b1220;color:#e5e7eb;outline:none}
    button{width:100%;margin-top:14px;padding:12px;border-radius:10px;border:0;background:#2563eb;color:white;font-weight:600;cursor:pointer}
    button:disabled{opacity:.7;cursor:not-allowed}
    .status{display:none;margin-top:12px;padding:10px;border-radius:10px;font-size:13px}
    .status.info{background:#0b1220;border:1px solid #374151;color:#e5e7eb}
    .status.success{background:#052e16;border:1px solid #14532d;color:#bbf7d0}
    .status.error{background:#2a0b0b;border:1px solid #7f1d1d;color:#fecaca}
  </style>
</head>
<body>
  <div class="card">
    <h1>Forgot password</h1>
    <p>Enter your employee id or email. If the account exists, a reset link will be sent.</p>
    <form id="form">
      <label for="identity">Employee id or email</label>
      <input id="identity" type="text" autocomplete="username" placeholder="201225 or user@company.com" />
      <button type="submit">Send reset link</button>
      <div id="status" class="status info"></div>
    </form>
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
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:#0b1220;color:#e5e7eb;margin:0;padding:40px}
    .card{max-width:460px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:22px}
    h1{font-size:20px;margin:0 0 6px}
    p{margin:0 0 14px;color:#9ca3af;font-size:14px}
    label{display:block;font-size:13px;margin:12px 0 6px;color:#d1d5db}
    input{width:100%;padding:12px 12px;border-radius:10px;border:1px solid #374151;background:#0b1220;color:#e5e7eb;outline:none}
    button{width:100%;margin-top:14px;padding:12px;border-radius:10px;border:0;background:#16a34a;color:white;font-weight:600;cursor:pointer}
    button:disabled{opacity:.7;cursor:not-allowed}
    .status{display:none;margin-top:12px;padding:10px;border-radius:10px;font-size:13px}
    .status.info{background:#0b1220;border:1px solid #374151;color:#e5e7eb}
    .status.success{background:#052e16;border:1px solid #14532d;color:#bbf7d0}
    .status.error{background:#2a0b0b;border:1px solid #7f1d1d;color:#fecaca}
  </style>
</head>
<body>
  <div class="card">
    <h1>Reset password</h1>
    <p>Choose a new password for your account.</p>
    <form id="form">
      <input id="token" type="hidden" />
      <label for="password">New password</label>
      <input id="password" type="password" autocomplete="new-password" />
      <label for="password2">Confirm new password</label>
      <input id="password2" type="password" autocomplete="new-password" />
      <button type="submit">Update password</button>
      <div id="status" class="status info"></div>
    </form>
  </div>
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
