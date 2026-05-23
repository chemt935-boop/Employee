const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError, requireRole } = require('../middleware/auth');
const { parseYmd, toYmd } = require('../utils/date');

const router = express.Router();

router.get('/', async (req, res) => {
  const schema = Joi.object({
    employeeId: Joi.number().integer().allow(null).optional(),
    from: Joi.string().allow('', null).optional(),
    to: Joi.string().allow('', null).optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const employeeId = value.employeeId ?? req.user.employee_id;
  if (employeeId !== req.user.employee_id && !['HR', 'CEO', 'FactoryManager', 'DepartmentManager'].includes(req.user.role)) {
    throw httpError(403, 'Forbidden');
  }

  const fromDate = parseYmd(value.from);
  const toDate = parseYmd(value.to);
  if (fromDate && toDate && fromDate > toDate) throw httpError(400, 'from must be <= to');

  const result = await query(
    `
      SELECT
        bd.id,
        bd.employee_id,
        e.name AS employee_name,
        bd.type,
        bd.value,
        bd.days,
        bd.status,
        bd.from_date,
        bd.to_date
      FROM dbo.BonusDeductions bd
      INNER JOIN dbo.Employees e ON e.employee_id = bd.employee_id
      WHERE (@employeeId IS NULL OR bd.employee_id = @employeeId)
        AND (@fromDate IS NULL OR bd.from_date >= @fromDate)
        AND (@toDate IS NULL OR bd.to_date <= @toDate)
      ORDER BY bd.id DESC
    `,
    {
      employeeId,
      fromDate: fromDate ? toYmd(fromDate) : null,
      toDate: toDate ? toYmd(toDate) : null
    }
  );

  res.json({ data: result.recordset });
});

router.post('/', requireRole(['DepartmentManager', 'FactoryManager']), async (req, res) => {
  const schema = Joi.object({
    employee_id: Joi.number().integer().required(),
    type: Joi.string().valid('bonus', 'deduction').required(),
    value: Joi.number().precision(2).required(),
    days: Joi.number().integer().min(0).required(),
    status: Joi.string().max(20).allow('', null).optional(),
    from_date: Joi.string().allow('', null).optional(),
    to_date: Joi.string().allow('', null).optional()
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const fromDate = parseYmd(value.from_date);
  const toDate = parseYmd(value.to_date);
  if ((value.from_date && !fromDate) || (value.to_date && !toDate)) throw httpError(400, 'Invalid date');
  if (fromDate && toDate && fromDate > toDate) throw httpError(400, 'from_date must be <= to_date');

  if (req.user.role === 'DepartmentManager') {
    const emp = await query(
      `SELECT department_id FROM dbo.Employees WHERE employee_id = @employeeId`,
      { employeeId: value.employee_id }
    );
    const depId = emp.recordset[0]?.department_id ?? null;
    if (!depId || depId !== req.user.department_id) throw httpError(403, 'Forbidden');
  }

  const insert = await query(
    `
      INSERT INTO dbo.BonusDeductions (employee_id, type, value, days, status, from_date, to_date)
      OUTPUT INSERTED.id
      VALUES (@employee_id, @type, @value, @days, @status, @from_date, @to_date)
    `,
    {
      employee_id: value.employee_id,
      type: value.type,
      value: value.value,
      days: value.days,
      status: value.status ?? 'Pending',
      from_date: fromDate ? toYmd(fromDate) : null,
      to_date: toDate ? toYmd(toDate) : null
    }
  );

  res.status(201).json({ id: insert.recordset[0].id });
});

module.exports = router;
