const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { parseYmd, toYmd } = require('../utils/date');

const router = express.Router();

function defaultFromTo() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

router.get('/', async (req, res) => {
  const schema = Joi.object({
    from: Joi.string().allow('', null).optional(),
    to: Joi.string().allow('', null).optional(),
    employeeId: Joi.number().integer().optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const defaults = defaultFromTo();
  const fromDate = parseYmd(value.from) || defaults.from;
  const toDate = parseYmd(value.to) || defaults.to;
  if (fromDate > toDate) throw httpError(400, 'from must be <= to');

  const result = await query(
    `
      SELECT
        a.attendance_id,
        a.employee_id,
        e.name AS employee_name,
        e.department_id,
        d.department_name,
        a.[date],
        CONVERT(varchar(8), a.check_in, 108) AS check_in,
        CONVERT(varchar(8), a.check_out, 108) AS check_out,
        a.status,
        a.remarks,
        a.vacation_request_id,
        a.permission_id,
        CASE
  WHEN a.check_in IS NOT NULL
       AND s.start_time IS NOT NULL
       AND a.check_in > DATEADD(MINUTE, 15, s.start_time)
  THEN DATEDIFF(MINUTE, s.start_time, a.check_in)
  ELSE 0
END AS late_minutes
      FROM dbo.Attendance a
      INNER JOIN dbo.Employees e ON e.employee_id = a.employee_id
      LEFT JOIN dbo.Departments d ON d.department_id = e.department_id
      LEFT JOIN dbo.Shifts s ON s.shift_id = e.shift_id
      WHERE a.[date] >= @fromDate AND a.[date] <= @toDate
        AND (@employeeId IS NULL OR a.employee_id = @employeeId)
      ORDER BY a.[date] DESC, a.attendance_id DESC
    `,
    {
      fromDate: toYmd(fromDate),
      toDate: toYmd(toDate),
      employeeId: value.employeeId ?? null
    }
  );

  res.json({
    range: { from: toYmd(fromDate), to: toYmd(toDate) },
    data: result.recordset
  });
});

module.exports = router;
