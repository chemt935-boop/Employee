const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { parseYmd, toYmd, daysInclusive } = require('../utils/date');
const { notifyEmployee } = require('../services/notifications');

const router = express.Router();

async function getRequestWithEmployee(requestId) {
  const result = await query(
    `
      SELECT
        vr.*,
        e.name AS employee_name,
        e.department_id,
        e.direct_manager_id,
        e.factory_manager_id
      FROM dbo.VacationRequests vr
      INNER JOIN dbo.Employees e ON e.employee_id = vr.employee_id
      WHERE vr.request_id = @requestId
    `,
    { requestId }
  );
  return result.recordset[0] || null;
}

router.get('/', async (req, res) => {
  const schema = Joi.object({
    employeeId: Joi.number().integer().allow(null).optional(),
    status: Joi.string().valid('Pending', 'Approved', 'Rejected').allow('', null).optional(),
    from: Joi.string().allow('', null).optional(),
    to: Joi.string().allow('', null).optional(),
    all: Joi.boolean().truthy('true').falsy('false').optional()
  });

  const { value, error } = schema.validate(req.query, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const fromDate = parseYmd(value.from);
  const toDate = parseYmd(value.to);
  if ((value.from && !fromDate) || (value.to && !toDate)) throw httpError(400, 'Invalid date');
  if (fromDate && toDate && fromDate > toDate) throw httpError(400, 'from must be <= to');

  const wantsAll = value.all === true;
  if (wantsAll && !['HR', 'CEO', 'FactoryManager'].includes(req.user.role)) throw httpError(403, 'Forbidden');

  const employeeId = wantsAll ? null : value.employeeId ?? req.user.employee_id;
  if (!wantsAll && employeeId !== req.user.employee_id && !['HR', 'CEO', 'FactoryManager', 'DepartmentManager'].includes(req.user.role)) {
    throw httpError(403, 'Forbidden');
  }

  const result = await query(
    `
      SELECT
        vr.request_id,
        vr.employee_id,
        e.name AS employee_name,
        vr.vacation_type,
        vr.start_date,
        vr.end_date,
        vr.total_days,
        vr.status,
        vr.direct_manager_approval,
        vr.factory_manager_approval,
        vr.final_approval,
        vr.deduction_type,
        vr.request_date,
        vr.created_date,
        vr.notes
      FROM dbo.VacationRequests vr
      INNER JOIN dbo.Employees e ON e.employee_id = vr.employee_id
      WHERE (@employeeId IS NULL OR vr.employee_id = @employeeId)
        AND (@status IS NULL OR vr.status = @status)
        AND (@fromDate IS NULL OR vr.start_date >= @fromDate)
        AND (@toDate IS NULL OR vr.end_date <= @toDate)
      ORDER BY vr.request_id DESC
    `,
    {
      employeeId,
      status: value.status || null,
      fromDate: fromDate ? toYmd(fromDate) : null,
      toDate: toDate ? toYmd(toDate) : null
    }
  );

  res.json({ data: result.recordset });
});

router.get('/inbox', async (req, res) => {
  const result = await query(
    `
      SELECT
        vr.request_id,
        vr.employee_id,
        e.name AS employee_name,
        vr.vacation_type,
        vr.start_date,
        vr.end_date,
        vr.total_days,
        vr.status,
        vr.direct_manager_approval,
        vr.factory_manager_approval,
        vr.request_date
      FROM dbo.VacationRequests vr
      INNER JOIN dbo.Employees e ON e.employee_id = vr.employee_id
      WHERE vr.status = 'Pending'
        AND (
          (e.direct_manager_id = @me AND vr.direct_manager_approval = 0)
          OR (
            (e.factory_manager_id = @me OR @isFactoryManager = 1)
            AND vr.direct_manager_approval = 1
            AND vr.factory_manager_approval = 0
          )
        )
      ORDER BY vr.request_id DESC
    `,
    { me: req.user.employee_id, isFactoryManager: req.user.role === 'FactoryManager' ? 1 : 0 }
  );

  res.json({ data: result.recordset });
});

router.post('/', async (req, res) => {
  const schema = Joi.object({
    employee_id: Joi.number().integer().allow(null).optional(),
    vacation_type: Joi.string().valid('Urgent', 'Annual', 'Sick').required(),
    start_date: Joi.string().required(),
    end_date: Joi.string().required(),
    reason: Joi.string().allow('', null).max(500).optional(),
    document_path: Joi.string().allow('', null).max(255).optional(),
    notes: Joi.string().allow('', null).max(500).optional(),
    deduction_type: Joi.string().valid('balance', 'salary').allow('', null).optional()
  });

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, error.details.map((d) => d.message).join('; '));

  const start = parseYmd(value.start_date);
  const end = parseYmd(value.end_date);
  if (!start || !end) throw httpError(400, 'Invalid date');
  if (start > end) throw httpError(400, 'start_date must be <= end_date');

  const employeeId = value.employee_id ?? req.user.employee_id;
  if (employeeId !== req.user.employee_id && !['HR', 'CEO'].includes(req.user.role)) throw httpError(403, 'Forbidden');

  const totalDays = daysInclusive(start, end);

  const insert = await query(
    `
      INSERT INTO dbo.VacationRequests
        (employee_id, vacation_type, start_date, end_date, reason, document_path, total_days, notes, deduction_type)
      VALUES
        (@employee_id, @vacation_type, @start_date, @end_date, @reason, @document_path, @total_days, @notes, @deduction_type)
      ;
      SELECT CAST(SCOPE_IDENTITY() AS int) AS request_id;
    `,
    {
      employee_id: employeeId,
      vacation_type: value.vacation_type,
      start_date: toYmd(start),
      end_date: toYmd(end),
      reason: value.reason ?? null,
      document_path: value.document_path ?? null,
      total_days: totalDays,
      notes: value.notes ?? null,
      deduction_type: value.deduction_type || null
    }
  );

  const created = await getRequestWithEmployee(insert.recordset[0].request_id);
  if (created?.direct_manager_id) {
    await notifyEmployee(created.direct_manager_id, {
      title: 'Vacation request',
      body: `${created.employee_name} submitted a vacation request`,
      data: { type: 'vacation_request.created', request_id: created.request_id, employee_id: created.employee_id }
    });
  }

  res.status(201).json({ request_id: insert.recordset[0].request_id });
});

router.post('/:id/approve', async (req, res) => {
  const schema = Joi.object({
    id: Joi.number().integer().required()
  });
  const parsed = schema.validate(req.params);
  if (parsed.error) throw httpError(400, 'Invalid id');

  const request = await getRequestWithEmployee(parsed.value.id);
  if (!request) throw httpError(404, 'Request not found');
  if (request.status !== 'Pending') throw httpError(400, 'Request is not pending');

  const isDirectManager = request.direct_manager_id === req.user.employee_id;
  const isFactoryManager = req.user.role === 'FactoryManager' || request.factory_manager_id === req.user.employee_id;

  const didDmApprove = isDirectManager && !request.direct_manager_approval;
  const didFmApprove = isFactoryManager && !!request.direct_manager_approval && !request.factory_manager_approval;

  if (isDirectManager && !request.direct_manager_approval) {
    await query(
      `
        UPDATE dbo.VacationRequests
        SET direct_manager_approval = 1, direct_manager_approved = 1
        WHERE request_id = @requestId
      `,
      { requestId: request.request_id }
    );
  } else if (isFactoryManager && !!request.direct_manager_approval && !request.factory_manager_approval) {
    await query(
      `
        UPDATE dbo.VacationRequests
        SET factory_manager_approval = 1, factory_manager_approved = 1
        WHERE request_id = @requestId
      `,
      { requestId: request.request_id }
    );
  } else {
    throw httpError(403, 'Forbidden');
  }

  const updated = await getRequestWithEmployee(parsed.value.id);
  if (!!updated.direct_manager_approval && !!updated.factory_manager_approval) {
    await query(
      `
        UPDATE dbo.VacationRequests
        SET status = 'Approved'
        WHERE request_id = @requestId
      `,
      { requestId: updated.request_id }
    );
  }

  const final = await getRequestWithEmployee(parsed.value.id);

  if (didDmApprove && final?.factory_manager_id && final.status === 'Pending' && !!final.direct_manager_approval && !final.factory_manager_approval) {
    await notifyEmployee(final.factory_manager_id, {
      title: 'Vacation request needs approval',
      body: `${final.employee_name} vacation request is waiting for your approval`,
      data: { type: 'vacation_request.needs_fm_approval', request_id: final.request_id, employee_id: final.employee_id }
    });
  }

  if (didFmApprove && final?.employee_id && final.status === 'Approved') {
    await notifyEmployee(final.employee_id, {
      title: 'Vacation request approved',
      body: 'Your vacation request was approved',
      data: { type: 'vacation_request.approved', request_id: final.request_id }
    });
  }

  res.json({ data: final });
});

router.post('/:id/reject', async (req, res) => {
  const schema = Joi.object({
    id: Joi.number().integer().required()
  });
  const parsed = schema.validate(req.params);
  if (parsed.error) throw httpError(400, 'Invalid id');

  const bodySchema = Joi.object({
    notes: Joi.string().allow('', null).max(500).optional()
  });
  const body = bodySchema.validate(req.body, { abortEarly: false });
  if (body.error) throw httpError(400, 'Invalid body');

  const request = await getRequestWithEmployee(parsed.value.id);
  if (!request) throw httpError(404, 'Request not found');
  if (request.status !== 'Pending') throw httpError(400, 'Request is not pending');

  const isDirectManager = request.direct_manager_id === req.user.employee_id;
  const isFactoryManager = req.user.role === 'FactoryManager' || request.factory_manager_id === req.user.employee_id;

  const canReject =
    (isDirectManager && !request.direct_manager_approval) ||
    (isFactoryManager && !!request.direct_manager_approval && !request.factory_manager_approval);

  if (!canReject) throw httpError(403, 'Forbidden');

  await query(
    `
      UPDATE dbo.VacationRequests
      SET status = 'Rejected', notes = COALESCE(@notes, notes)
      WHERE request_id = @requestId
    `,
    { requestId: request.request_id, notes: body.value.notes ?? null }
  );

  const final = await getRequestWithEmployee(parsed.value.id);

  if (final?.employee_id && final.status === 'Rejected') {
    await notifyEmployee(final.employee_id, {
      title: 'Vacation request rejected',
      body: final.notes ? `Rejected: ${final.notes}` : 'Your vacation request was rejected',
      data: { type: 'vacation_request.rejected', request_id: final.request_id }
    });
  }

  res.json({ data: final });
});

module.exports = router;
