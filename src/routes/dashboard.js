const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { payrollCycleForDate, payrollCycleForMonth, toYmd } = require('../utils/date');

const router = express.Router();

router.get('/attendance-preview', async (req, res) => {
  const schema = Joi.object({
    month: Joi.string().pattern(/^\d{4}-\d{2}$/).allow('', null).optional(),
    departmentId: Joi.number().integer().allow(null).optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const cycle = value.month ? payrollCycleForMonth(value.month) : payrollCycleForDate(new Date());
  if (!cycle) throw httpError(400, 'Invalid month');

  let departmentId = value.departmentId ?? null;
  if (req.user.role === 'DepartmentManager') {
    if (!req.user.department_id) throw httpError(403, 'Department manager has no department');
    if (departmentId && departmentId !== req.user.department_id) throw httpError(403, 'Forbidden');
    departmentId = req.user.department_id;
  }

  const result = await query(
    `
      SELECT
        e.employee_id,
        e.name AS employee_name,
        e.department_id,
        d.department_name,
        SUM(
          CASE
            WHEN a.check_in IS NOT NULL AND s.start_time IS NOT NULL AND DATEDIFF(MINUTE, DATEADD(MINUTE, 15, s.start_time), a.check_in) > 0
            THEN 1
            ELSE 0
          END
        ) AS late_days,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_days,
SUM(
  CASE
    WHEN a.check_in IS NOT NULL
      AND s.start_time IS NOT NULL
    THEN
      CASE
        WHEN DATEDIFF(MINUTE, DATEADD(MINUTE, 15, s.start_time), a.check_in) > 0
        THEN DATEDIFF(MINUTE, s.start_time, a.check_in)
        ELSE 0
      END
    ELSE 0
  END
) AS late_minutes
      FROM dbo.Employees e
      LEFT JOIN dbo.Departments d ON d.department_id = e.department_id
      LEFT JOIN dbo.Shifts s ON s.shift_id = e.shift_id
      LEFT JOIN dbo.Attendance a
        ON a.employee_id = e.employee_id
        AND a.[date] >= @fromDate
        AND a.[date] <= @toDate
      WHERE (@departmentId IS NULL OR e.department_id = @departmentId)
      GROUP BY e.employee_id, e.name, e.department_id, d.department_name
      ORDER BY e.employee_id ASC
    `,
    {
      fromDate: toYmd(cycle.start),
      toDate: toYmd(cycle.end),
      departmentId
    }
  );

  const totals = result.recordset.reduce(
    (acc, row) => {
      acc.late_days += Number(row.late_days || 0);
      acc.absent_days += Number(row.absent_days || 0);
      acc.late_minutes += Number(row.late_minutes || 0);
      return acc;
    },
    { late_days: 0, absent_days: 0, late_minutes: 0 }
  );

  res.json({
    range: { from: toYmd(cycle.start), to: toYmd(cycle.end) },
    totals,
    data: result.recordset
  });
});

module.exports = router;
  