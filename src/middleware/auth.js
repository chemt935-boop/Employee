const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/sql');

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function getEmployeeById(employeeId) {
  const result = await query(
    `
      SELECT
        e.employee_id,
        e.name,
        e.email,
        e.phone,
        e.role,
        e.department_id,
        e.manager_id,
        e.direct_manager_id,
        dm.name AS direct_manager_name,
        e.factory_manager_id,
        fm.name AS factory_manager_name,
        e.shift_id,
        e.FridayDouble
      FROM dbo.Employees e
      LEFT JOIN dbo.Employees dm ON dm.employee_id = e.direct_manager_id
      LEFT JOIN dbo.Employees fm ON fm.employee_id = e.factory_manager_id
      WHERE e.employee_id = @employeeId
    `,
    { employeeId }
  );
  return result.recordset[0] || null;
}

function auth() {
  return async (req, res, next) => {
    try {
      let employeeId = null;

      if (config.authMode === 'dev') {
        const raw = req.header('x-employee-id') || req.header('x-user-id');
        if (!raw) throw httpError(401, 'Missing x-employee-id');
        employeeId = Number(raw);
        if (!Number.isInteger(employeeId)) throw httpError(401, 'Invalid x-employee-id');
      } else {
        const header = req.header('authorization');
        if (!header || !header.toLowerCase().startsWith('bearer ')) {
          throw httpError(401, 'Missing Authorization header');
        }
        const token = header.slice('bearer '.length).trim();
        let payload;
        try {
          payload = jwt.verify(token, config.jwt.secret);
        } catch {
          throw httpError(401, 'Invalid token');
        }
        employeeId = Number(payload.sub || payload.employeeId);
        if (!Number.isInteger(employeeId)) throw httpError(401, 'Invalid token subject');
      }

      const employee = await getEmployeeById(employeeId);
      if (!employee) throw httpError(401, 'User not found');

      req.user = employee;
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireRole(roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'Unauthorized'));
    if (!allowed.has(req.user.role)) return next(httpError(403, 'Forbidden'));
    next();
  };
}

module.exports = { auth, requireRole, httpError, getEmployeeById };
