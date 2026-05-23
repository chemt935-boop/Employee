const express = require('express');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const config = require('../config');
const { query } = require('../db/sql');
const { auth, httpError } = require('../middleware/auth');
const { sendMail, isEmailConfigured } = require('../services/email');
const { sha256Bytes, sha256Hex, randomToken, tokenHashBytes } = require('../utils/crypto');

const router = express.Router();

function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;

  if (Buffer.isBuffer(passwordHash)) {
    if (passwordHash.length >= 2 && passwordHash[0] === 0x24 && passwordHash[1] === 0x32) {
      const asText = passwordHash.toString('utf8');
      return bcrypt.compareSync(password, asText);
    }

    if (passwordHash.length === 32) {
      const sha = sha256Bytes(password);
      return sha.equals(passwordHash);
    }

    const asText = passwordHash.toString('utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(asText)) {
      const shaHex = sha256Hex(password);
      return shaHex.toLowerCase() === asText.toLowerCase();
    }

    return false;
  }

  if (typeof passwordHash === 'string') {
    if (passwordHash.startsWith('$2')) return bcrypt.compareSync(password, passwordHash);
    const shaHex = sha256Hex(password);
    return shaHex.toLowerCase() === passwordHash.toLowerCase();
  }

  return false;
}

router.post('/login', async (req, res) => {
  if (config.authMode !== 'jwt') {
    throw httpError(400, 'AUTH_MODE is not jwt');
  }

  const schema = Joi.object({
    employee_id: Joi.number().integer().optional(),
    email: Joi.string().email().optional(),
    password: Joi.string().min(1).required()
  }).or('employee_id', 'email');
  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const where = value.employee_id
    ? 'e.employee_id = @employee_id'
    : 'e.email = @email';
  const params = value.employee_id
    ? { employee_id: value.employee_id }
    : { email: value.email };

  const result = await query(
    `
      SELECT TOP 1
        e.employee_id,
        e.name,
        e.email,
        e.role,
        e.department_id,
        e.direct_manager_id,
        dm.name AS direct_manager_name,
        e.factory_manager_id,
        fm.name AS factory_manager_name,
        e.password_hash
      FROM dbo.Employees e
      LEFT JOIN dbo.Employees dm ON dm.employee_id = e.direct_manager_id
      LEFT JOIN dbo.Employees fm ON fm.employee_id = e.factory_manager_id
      WHERE ${where}
    `,
    params
  );

  const user = result.recordset[0];
  if (!user) throw httpError(401, 'Invalid credentials');
  if (!verifyPassword(value.password, user.password_hash)) throw httpError(401, 'Invalid credentials');

  const token = jwt.sign(
    { employeeId: user.employee_id, role: user.role },
    config.jwt.secret,
    { subject: String(user.employee_id), expiresIn: config.jwt.expiresIn }
  );

  res.json({
    token,
    user: {
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      direct_manager_id: user.direct_manager_id,
      direct_manager_name: user.direct_manager_name,
      factory_manager_id: user.factory_manager_id,
      factory_manager_name: user.factory_manager_name
    }
  });
});

router.post('/password-reset/request', async (req, res) => {
  const schema = Joi.object({
    employee_id: Joi.number().integer().optional(),
    email: Joi.string().email().optional()
  }).or('employee_id', 'email');

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const where = value.employee_id
    ? 'employee_id = @employee_id'
    : 'email = @email';
  const params = value.employee_id
    ? { employee_id: value.employee_id }
    : { email: value.email };

  const userResult = await query(
    `
      SELECT TOP 1 employee_id, email, name
      FROM dbo.Employees
      WHERE ${where}
    `,
    params
  );

  const user = userResult.recordset[0] || null;
  if (!user || !user.email) {
    return res.json({ ok: true });
  }

  const token = randomToken(32);
  const tokenHash = tokenHashBytes(token);
  const expiresAt = new Date(Date.now() + config.passwordReset.ttlMinutes * 60 * 1000);

  await query(
    `
      INSERT INTO dbo.PasswordResetTokens (employee_id, token_hash, expires_at_utc)
      VALUES (@employee_id, @token_hash, @expires_at_utc)
    `,
    {
      employee_id: user.employee_id,
      token_hash: tokenHash,
      expires_at_utc: expiresAt.toISOString()
    }
  );

  const resetLink = `${config.appBaseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = 'Reset your password';
  const text = `Hello ${user.name || ''}\n\nUse this link to reset your password:\n${resetLink}\n\nThis link expires in ${config.passwordReset.ttlMinutes} minutes.`;
  const html = `<p>Hello ${user.name || ''}</p><p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in ${config.passwordReset.ttlMinutes} minutes.</p>`;

  if (isEmailConfigured()) {
    await sendMail({ to: user.email, subject, text, html });
    return res.json({ ok: true, sent: true });
  }

  if (config.env.NODE_ENV !== 'production' && config.passwordReset.returnTokenInResponse) {
    return res.json({ ok: true, sent: false, token, resetLink });
  }

  throw httpError(501, 'Email is not configured');
});

router.post('/password-reset/confirm', async (req, res) => {
  const schema = Joi.object({
    token: Joi.string().min(10).required(),
    new_password: Joi.string().min(6).max(200).required()
  });
  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const tokenHash = tokenHashBytes(value.token);

  const tokenResult = await query(
    `
      SELECT TOP 1
        employee_id,
        expires_at_utc,
        used_at_utc
      FROM dbo.PasswordResetTokens
      WHERE token_hash = @token_hash
      ORDER BY expires_at_utc DESC
    `,
    { token_hash: tokenHash }
  );

  const row = tokenResult.recordset[0];
  if (!row) throw httpError(400, 'Invalid token');
  if (row.used_at_utc) throw httpError(400, 'Token already used');
  if (new Date(row.expires_at_utc).getTime() < Date.now()) throw httpError(400, 'Token expired');

  const newHash = sha256Bytes(value.new_password);

  await query(
    `
      UPDATE dbo.Employees
      SET password_hash = @password_hash
      WHERE employee_id = @employee_id
    `,
    { password_hash: newHash, employee_id: row.employee_id }
  );

  await query(
    `
      UPDATE dbo.PasswordResetTokens
      SET used_at_utc = GETUTCDATE()
      WHERE token_hash = @token_hash AND used_at_utc IS NULL
    `,
    { token_hash: tokenHash }
  );

  res.json({ ok: true });
});

router.get('/me', auth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
