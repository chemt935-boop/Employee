const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError, requireRole } = require('../middleware/auth');

const router = express.Router();

function isTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

router.get('/', async (req, res) => {
  const result = await query(
    `
      SELECT
        s.shift_id,
        s.shift_name,
        CONVERT(varchar(8), s.start_time, 108) AS start_time,
        CONVERT(varchar(8), s.end_time, 108) AS end_time
      FROM dbo.Shifts s
      ORDER BY s.shift_id ASC
    `
  );

  res.json({ data: result.recordset });
});

router.post('/', requireRole(['HR', 'CEO', 'FactoryManager']), async (req, res) => {
  const schema = Joi.object({
    shift_name: Joi.string().min(1).max(50).required(),
    start_time: Joi.string().required(),
    end_time: Joi.string().required()
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  if (!isTime(value.start_time) || !isTime(value.end_time)) {
    throw httpError(400, 'start_time and end_time must be HH:mm or HH:mm:ss');
  }

  const insert = await query(
    `
      INSERT INTO dbo.Shifts (shift_name, start_time, end_time)
      VALUES (@shift_name, @start_time, @end_time);
      SELECT CAST(SCOPE_IDENTITY() AS int) AS shift_id;
    `,
    {
      shift_name: value.shift_name,
      start_time: value.start_time,
      end_time: value.end_time
    }
  );

  res.status(201).json({ shift_id: insert.recordset[0].shift_id });
});

module.exports = router;

