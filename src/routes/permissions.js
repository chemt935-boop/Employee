const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { parseYmd, toYmd } = require('../utils/date');
const { notifyEmployee } = require('../services/notifications');

const router = express.Router();

function parseAdditionalInfo(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function mapPermissionRow(row) {
  const extra = parseAdditionalInfo(row.additional_info);

  return {
    ...row,
    currentShiftId: extra.from_shift_id ?? null,
    targetShiftId: extra.to_shift_id ?? null,
    currentShiftName: extra.from_shift_name ?? null,
    targetShiftName: extra.to_shift_name ?? null
  };
}

async function getPermissionWithEmployee(permissionId) {
  const result = await query(
    `
      SELECT
        p.*,
        e.name AS employee_name,
        e.direct_manager_id,
        e.factory_manager_id
      FROM dbo.Permissions p
      INNER JOIN dbo.Employees e ON e.employee_id = p.employee_id
      WHERE p.permission_id = @permissionId
    `,
    { permissionId }
  );

  const row = result.recordset[0] || null;
  return row ? mapPermissionRow(row) : null;
}

router.get('/', async (req, res) => {
  const schema = Joi.object({
    employeeId: Joi.number().integer().allow(null).optional(),
    status: Joi.string().valid('Pending', 'Approved', 'Rejected').allow('', null).optional(),
    dateFrom: Joi.string().allow('', null).optional(),
    dateTo: Joi.string().allow('', null).optional(),
    all: Joi.boolean().truthy('true').falsy('false').optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const fromDate = parseYmd(value.dateFrom);
  const toDate = parseYmd(value.dateTo);
  if ((value.dateFrom && !fromDate) || (value.dateTo && !toDate)) throw httpError(400, 'Invalid date');
  if (fromDate && toDate && fromDate > toDate) throw httpError(400, 'dateFrom must be <= dateTo');

  const wantsAll = value.all === true;
  if (wantsAll && !['HR', 'CEO', 'FactoryManager'].includes(req.user.role)) throw httpError(403, 'Forbidden');

  const employeeId = wantsAll ? null : value.employeeId ?? req.user.employee_id;
  if (!wantsAll && employeeId !== req.user.employee_id && !['HR', 'CEO', 'FactoryManager', 'DepartmentManager'].includes(req.user.role)) {
    throw httpError(403, 'Forbidden');
  }

  const result = await query(
    `
      SELECT
        p.permission_id,
        p.employee_id,
        e.name AS employee_name,
        p.permission_date,
        p.permission_type,
        CONVERT(varchar(8), p.start_time, 108) AS start_time,
        CONVERT(varchar(8), p.end_time, 108) AS end_time,
        p.hours_requested,
        p.reason,
        p.status,
        p.direct_manager_approved,
        p.factory_manager_approved,
        p.created_date,
        p.additional_info
      FROM dbo.Permissions p
      INNER JOIN dbo.Employees e ON e.employee_id = p.employee_id
      WHERE (@employeeId IS NULL OR p.employee_id = @employeeId)
        AND (@status IS NULL OR p.status = @status)
        AND (@fromDate IS NULL OR p.permission_date >= @fromDate)
        AND (@toDate IS NULL OR p.permission_date <= @toDate)
      ORDER BY p.permission_id DESC
    `,
    {
      employeeId,
      status: value.status || null,
      fromDate: fromDate ? toYmd(fromDate) : null,
      toDate: toDate ? toYmd(toDate) : null
    }
  );

  res.json({ data: result.recordset.map(mapPermissionRow) });
});

router.get('/inbox', async (req, res) => {
  const result = await query(
    `
      SELECT
        p.permission_id,
        p.employee_id,
        e.name AS employee_name,
        p.permission_date,
        p.permission_type,
        p.hours_requested,
        p.status,
        p.direct_manager_approved,
        p.factory_manager_approved,
        p.created_date,
        p.additional_info
      FROM dbo.Permissions p
      INNER JOIN dbo.Employees e ON e.employee_id = p.employee_id
      WHERE p.status = 'Pending'
        AND (
          (e.direct_manager_id = @me AND p.direct_manager_approved = 0)
          OR (
            (e.factory_manager_id = @me OR @isFactoryManager = 1)
            AND p.direct_manager_approved = 1
            AND p.factory_manager_approved = 0
          )
        )
      ORDER BY p.permission_id DESC
    `,
    { me: req.user.employee_id, isFactoryManager: req.user.role === 'FactoryManager' ? 1 : 0 }
  );

  res.json({ data: result.recordset.map(mapPermissionRow) });
});

router.post('/', async (req, res) => {
  const schema = Joi.object({
    employee_id: Joi.number().integer().allow(null).optional(),
    permission_date: Joi.string().required(),
    permission_type: Joi.string().min(1).max(20).required(),
    start_time: Joi.string().allow('', null).optional(),
    end_time: Joi.string().allow('', null).optional(),
    hours_requested: Joi.number().precision(2).allow(null).optional(),
    reason: Joi.string().allow('', null).max(500).optional(),
    additional_info: Joi.string().allow('', null).max(500).optional()
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const date = parseYmd(value.permission_date);
  if (!date) throw httpError(400, 'Invalid permission_date');

  const employeeId = value.employee_id ?? req.user.employee_id;
  if (employeeId !== req.user.employee_id && !['HR', 'CEO'].includes(req.user.role)) throw httpError(403, 'Forbidden');

  const insert = await query(
    `
      INSERT INTO dbo.Permissions
        (employee_id, permission_date, permission_type, start_time, end_time, hours_requested, reason, additional_info, status)
      VALUES
        (@employee_id, @permission_date, @permission_type, @start_time, @end_time, @hours_requested, @reason, @additional_info, 'Pending')
      ;
      SELECT CAST(SCOPE_IDENTITY() AS int) AS permission_id;
    `,
    {
      employee_id: employeeId,
      permission_date: toYmd(date),
      permission_type: value.permission_type,
      start_time: value.start_time || null,
      end_time: value.end_time || null,
      hours_requested: value.hours_requested ?? null,
      reason: value.reason ?? null,
      additional_info: value.additional_info ?? null
    }
  );

  const created = await getPermissionWithEmployee(insert.recordset[0].permission_id);
  if (created?.direct_manager_id) {
    await notifyEmployee(created.direct_manager_id, {
      title: 'Permission request',
      body: `${created.employee_name} submitted a permission request`,
      data: { type: 'permission_request.created', permission_id: created.permission_id, employee_id: created.employee_id }
    });
  }

  res.status(201).json({ permission_id: insert.recordset[0].permission_id });
});

router.post('/:id/approve', async (req, res) => {
  const schema = Joi.object({ id: Joi.number().integer().required() });
  const parsed = schema.validate(req.params);
  if (parsed.error) throw httpError(400, 'Invalid id');

  const permission = await getPermissionWithEmployee(parsed.value.id);
  if (!permission) throw httpError(404, 'Permission not found');
  if (permission.status !== 'Pending') throw httpError(400, 'Permission is not pending');

  const isDirectManager = permission.direct_manager_id === req.user.employee_id;
  const isFactoryManager = req.user.role === 'FactoryManager' || permission.factory_manager_id === req.user.employee_id;

  const didDmApprove = isDirectManager && !permission.direct_manager_approved;
  const didFmApprove = isFactoryManager && !!permission.direct_manager_approved && !permission.factory_manager_approved;

  if (isDirectManager && !permission.direct_manager_approved) {
    await query(
      `
        UPDATE dbo.Permissions
        SET direct_manager_approved = 1
        WHERE permission_id = @permissionId
      `,
      { permissionId: permission.permission_id }
    );
  } else if (isFactoryManager && !!permission.direct_manager_approved && !permission.factory_manager_approved) {
    await query(
      `
        UPDATE dbo.Permissions
        SET factory_manager_approved = 1
        WHERE permission_id = @permissionId
      `,
      { permissionId: permission.permission_id }
    );
  } else {
    throw httpError(403, 'Forbidden');
  }

  const updated = await getPermissionWithEmployee(parsed.value.id);
  if (!!updated.direct_manager_approved && !!updated.factory_manager_approved) {
    await query(
      `
        UPDATE dbo.Permissions
        SET status = 'Approved'
        WHERE permission_id = @permissionId
      `,
      { permissionId: updated.permission_id }
    );
  }

  const final = await getPermissionWithEmployee(parsed.value.id);

  if (didDmApprove && final?.factory_manager_id && final.status === 'Pending' && !!final.direct_manager_approved && !final.factory_manager_approved) {
    await notifyEmployee(final.factory_manager_id, {
      title: 'Permission request needs approval',
      body: `${final.employee_name} permission request is waiting for your approval`,
      data: { type: 'permission_request.needs_fm_approval', permission_id: final.permission_id, employee_id: final.employee_id }
    });
  }

  if (didFmApprove && final?.employee_id && final.status === 'Approved') {
    await notifyEmployee(final.employee_id, {
      title: 'Permission request approved',
      body: 'Your permission request was approved',
      data: { type: 'permission_request.approved', permission_id: final.permission_id }
    });
  }

  res.json({ data: final });
});

router.post('/:id/reject', async (req, res) => {
  const schema = Joi.object({ id: Joi.number().integer().required() });
  const parsed = schema.validate(req.params);
  if (parsed.error) throw httpError(400, 'Invalid id');

  const permission = await getPermissionWithEmployee(parsed.value.id);
  if (!permission) throw httpError(404, 'Permission not found');
  if (permission.status !== 'Pending') throw httpError(400, 'Permission is not pending');

  const isDirectManager = permission.direct_manager_id === req.user.employee_id;
  const isFactoryManager = req.user.role === 'FactoryManager' || permission.factory_manager_id === req.user.employee_id;

  const canReject =
    (isDirectManager && !permission.direct_manager_approved) ||
    (isFactoryManager && !!permission.direct_manager_approved && !permission.factory_manager_approved);

  if (!canReject) throw httpError(403, 'Forbidden');

  await query(
    `
      UPDATE dbo.Permissions
      SET status = 'Rejected'
      WHERE permission_id = @permissionId
    `,
    { permissionId: permission.permission_id }
  );

  const final = await getPermissionWithEmployee(parsed.value.id);

  if (final?.employee_id && final.status === 'Rejected') {
    await notifyEmployee(final.employee_id, {
      title: 'Permission request rejected',
      body: 'Your permission request was rejected',
      data: { type: 'permission_request.rejected', permission_id: final.permission_id }
    });
  }

  res.json({ data: final });
});

module.exports = router;
