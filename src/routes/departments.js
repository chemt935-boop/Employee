const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { requireRole, httpError } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await query(
    `
      SELECT
        d.department_id,
        d.department_name,
        d.description,
        d.manager_id,
        e.name AS manager_name
      FROM dbo.Departments d
      LEFT JOIN dbo.Employees e ON e.employee_id = d.manager_id
      ORDER BY d.department_id ASC
    `
  );
  res.json({ data: result.recordset });
});

router.post('/', requireRole(['HR', 'CEO', 'FactoryManager']), async (req, res) => {
  const schema = Joi.object({
    department_name: Joi.string().min(1).max(100).required(),
    description: Joi.string().allow('', null).max(4000).optional(),
    manager_id: Joi.number().integer().allow(null).optional()
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const insert = await query(
    `
      INSERT INTO dbo.Departments (department_name, description, manager_id)
      OUTPUT INSERTED.department_id
      VALUES (@department_name, @description, @manager_id)
    `,
    {
      department_name: value.department_name,
      description: value.description ?? null,
      manager_id: value.manager_id ?? null
    }
  );

  res.status(201).json({ department_id: insert.recordset[0].department_id });
});

module.exports = router;
