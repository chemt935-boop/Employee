const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await query(
    `
      SELECT
        e.employee_id,
        e.name,
        e.email,
        e.phone,
        e.role,
        e.hire_date,
        e.salary,
        e.department_id,
        d.department_name,
        e.direct_manager_id,
        dm.name AS direct_manager_name,
        e.factory_manager_id,
        fm.name AS factory_manager_name,
        e.shift_id,
        s.shift_name,
        CONVERT(varchar(8), s.start_time, 108) AS start_time,
        CONVERT(varchar(8), s.end_time, 108) AS end_time,
        e.FridayDouble
      FROM dbo.Employees e
      LEFT JOIN dbo.Departments d ON d.department_id = e.department_id
      LEFT JOIN dbo.Employees dm ON dm.employee_id = e.direct_manager_id
      LEFT JOIN dbo.Employees fm ON fm.employee_id = e.factory_manager_id
      LEFT JOIN dbo.Shifts s ON s.shift_id = e.shift_id
      ORDER BY e.employee_id ASC
    `
  );

  res.json({ data: result.recordset });
});

router.get('/:id', async (req, res) => {
  const schema = Joi.object({ id: Joi.number().integer().required() });
  const { value, error } = schema.validate(req.params);
  if (error) throw httpError(400, 'Invalid id');

  const result = await query(
    `
      SELECT
        e.employee_id,
        e.name,
        e.email,
        e.phone,
        e.role,
        e.hire_date,
        e.salary,
        e.department_id,
        d.department_name,
        e.direct_manager_id,
        dm.name AS direct_manager_name,
        e.factory_manager_id,
        fm.name AS factory_manager_name,
        e.shift_id,
        s.shift_name,
        CONVERT(varchar(8), s.start_time, 108) AS start_time,
        CONVERT(varchar(8), s.end_time, 108) AS end_time,
        e.FridayDouble
      FROM dbo.Employees e
      LEFT JOIN dbo.Departments d ON d.department_id = e.department_id
      LEFT JOIN dbo.Employees dm ON dm.employee_id = e.direct_manager_id
      LEFT JOIN dbo.Employees fm ON fm.employee_id = e.factory_manager_id
      LEFT JOIN dbo.Shifts s ON s.shift_id = e.shift_id
      WHERE e.employee_id = @employeeId
    `,
    { employeeId: value.id }
  );

  const employee = result.recordset[0];
  if (!employee) throw httpError(404, 'Employee not found');

  res.json({ data: employee });
});

module.exports = router;
