const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { parseYearMonth } = require('../utils/date');

const router = express.Router();

function currentYearMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

router.get('/preview', async (req, res) => {
  const schema = Joi.object({
    month: Joi.string().pattern(/^\d{4}-\d{2}$/).allow('', null).optional(),
    employeeId: Joi.number().integer().allow(null).optional(),
    all: Joi.boolean().truthy('true').falsy('false').optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const month = value.month || currentYearMonth();
  if (!parseYearMonth(month)) throw httpError(400, 'Invalid month');

  const requestedEmployeeId = value.employeeId ?? null;
  const wantsAll = value.all === true;

  if (wantsAll) {
    if (!['HR', 'CEO', 'FactoryManager'].includes(req.user.role)) throw httpError(403, 'Forbidden');
  }

  if (requestedEmployeeId && requestedEmployeeId !== req.user.employee_id) {
    if (!['HR', 'CEO', 'FactoryManager', 'DepartmentManager'].includes(req.user.role)) {
      throw httpError(403, 'Forbidden');
    }

    if (req.user.role === 'DepartmentManager') {
      const emp = await query(
        `SELECT department_id FROM dbo.Employees WHERE employee_id = @employeeId`,
        { employeeId: requestedEmployeeId }
      );
      const depId = emp.recordset[0]?.department_id ?? null;
      if (!depId || depId !== req.user.department_id) throw httpError(403, 'Forbidden');
    }
  }

  const employeeIdFilter = wantsAll ? null : requestedEmployeeId || req.user.employee_id;

  const result = await query(
    `
      SELECT
        p.*,
        e.name AS employee_name,
        e.role AS employee_role,
        e.department_id,
        d.department_name
      FROM dbo.Payroll p
      INNER JOIN dbo.Employees e ON e.employee_id = p.employee_id
      LEFT JOIN dbo.Departments d ON d.department_id = e.department_id
      WHERE p.payroll_month = @month
        AND (@employeeId IS NULL OR p.employee_id = @employeeId)
      ORDER BY p.employee_id ASC
    `,
    { month, employeeId: employeeIdFilter }
  );

  res.json({ month, data: result.recordset });
});

module.exports = router;
