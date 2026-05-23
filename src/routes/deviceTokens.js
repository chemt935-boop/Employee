const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await query(
    `
      SELECT
        dt.Id,
        dt.UserId,
        dt.Token,
        dt.Platform,
        dt.IsActive,
        dt.LastUsedUtc,
        dt.CreatedAtUtc
      FROM dbo.DeviceTokens dt
      WHERE dt.UserId = @userId
      ORDER BY dt.CreatedAtUtc DESC
    `,
    { userId: req.user.employee_id }
  );

  res.json({ data: result.recordset });
});

router.post('/register', async (req, res) => {
  const schema = Joi.object({
    token: Joi.string().min(1).max(500).required(),
    platform: Joi.number().integer().required()
  });

  const { value, error } = schema.validate(req.body, {
    abortEarly: false,
    convert: true
  });

  if (error) {
    throw httpError(
      400,
      error.details.map((d) => d.message).join('; ')
    );
  }

  const existing = await query(
    `
      SELECT TOP 1 Id
      FROM dbo.DeviceTokens
      WHERE Token = @token
    `,
    {
      token: value.token
    }
  );

  if (existing.recordset[0]) {
    await query(
      `
        UPDATE dbo.DeviceTokens
        SET
          UserId = @userId,
          IsActive = 1,
          Platform = @platform,
          LastUsedUtc = SYSDATETIMEOFFSET()
        WHERE Id = @id
      `,
      {
        id: existing.recordset[0].Id,
        userId: req.user.employee_id,
        platform: value.platform
      }
    );

    return res.json({
      id: existing.recordset[0].Id,
      updated: true
    });
  }

  const id = crypto.randomUUID();

  await query(
    `
      INSERT INTO dbo.DeviceTokens (
        Id,
        UserId,
        Token,
        Platform,
        IsActive,
        LastUsedUtc
      )
      VALUES (
        @id,
        @userId,
        @token,
        @platform,
        1,
        SYSDATETIMEOFFSET()
      )
    `,
    {
      id,
      userId: req.user.employee_id,
      token: value.token,
      platform: value.platform
    }
  );

  res.status(201).json({
    id,
    created: true
  });
});

router.delete('/:id', async (req, res) => {
  const schema = Joi.object({ id: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required() });
  const { value, error } = schema.validate(req.params, { abortEarly: false });
  if (error) throw httpError(400, 'Invalid id');

  await query(
    `
      UPDATE dbo.DeviceTokens
      SET IsActive = 0, LastUsedUtc = SYSDATETIMEOFFSET()
      WHERE Id = @id AND UserId = @userId
    `,
    { id: value.id, userId: req.user.employee_id }
  );

  res.status(204).send();
});

module.exports = router;
