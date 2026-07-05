const express = require('express');
const Joi = require('joi');
const { query } = require('../db/sql');
const { httpError } = require('../middleware/auth');
const { parseYmd, toYmd } = require('../utils/date');
const { notifyEmployee } = require('../services/notifications');
const { logger } = require('../logger');

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

router.post('/punch-in', async (req, res) => {
  const employeeId = req.user.employee_id;
  const today = new Date();
  const todayYmd = toYmd(today);
  const now = today.toTimeString().slice(0, 8);

  const existingAttendance = await query(
    `
      SELECT a.attendance_id, a.check_in
      FROM dbo.Attendance a
      WHERE a.employee_id = @employeeId AND a.[date] = @today
    `,
    { employeeId, today: todayYmd }
  );

  if (existingAttendance.recordset.length > 0 && existingAttendance.recordset[0].check_in) {
    throw httpError(400, 'Already punched in today');
  }

  const employee = await query(
    `
      SELECT e.name, s.start_time
      FROM dbo.Employees e
      LEFT JOIN dbo.Shifts s ON s.shift_id = e.shift_id
      WHERE e.employee_id = @employeeId
    `,
    { employeeId }
  );

  if (employee.recordset.length === 0) {
    throw httpError(404, 'Employee not found');
  }

  const { name: employeeName, start_time: shiftStartTime } = employee.recordset[0];

  let lateMinutes = 0;
  if (shiftStartTime) {
    const shiftStart = new Date(today.toDateString() + ' ' + shiftStartTime);
    const punchInTime = new Date(today.toDateString() + ' ' + now);
    const diffMs = punchInTime - shiftStart;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes > 15) {
      lateMinutes = diffMinutes;
    }
  }

  if (existingAttendance.recordset.length > 0) {
    await query(
      `
        UPDATE dbo.Attendance
        SET check_in = @checkIn
        WHERE attendance_id = @attendanceId
      `,
      { checkIn: now, attendanceId: existingAttendance.recordset[0].attendance_id }
    );
  } else {
    await query(
      `
        INSERT INTO dbo.Attendance (employee_id, [date], check_in, status)
        VALUES (@employeeId, @today, @checkIn, 'Present')
      `,
      { employeeId, today: todayYmd, checkIn: now }
    );
  }

  let title, body;
  if (lateMinutes > 0) {
    const hours = Math.floor(lateMinutes / 60);
    const minutes = lateMinutes % 60;
    const lateString = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `0:${minutes.toString().padStart(2, '0')}`;
    title = 'Late Check-In';
    body = `You punched in today successfully at ${now}. You are ${lateString} late.`;
  } else {
    title = 'Check-In Successful';
    body = `You punched in today successfully at ${now}.`;
  }

  try {
    await notifyEmployee(employeeId, { title, body, data: { type: 'attendance.punch_in', time: now, late_minutes: lateMinutes } });
  } catch (err) {
    logger.error({ err, employeeId }, 'Failed to send punch-in notification');
  }

  res.json({ status: 'success', check_in: now, late_minutes: lateMinutes });
});

router.post('/punch-out', async (req, res) => {
  const employeeId = req.user.employee_id;
  const today = new Date();
  const todayYmd = toYmd(today);
  const now = today.toTimeString().slice(0, 8);

  const existingAttendance = await query(
    `
      SELECT a.attendance_id, a.check_in, a.check_out
      FROM dbo.Attendance a
      WHERE a.employee_id = @employeeId AND a.[date] = @today
    `,
    { employeeId, today: todayYmd }
  );

  if (existingAttendance.recordset.length === 0) {
    throw httpError(400, 'No punch-in found for today');
  }

  if (!existingAttendance.recordset[0].check_in) {
    throw httpError(400, 'No punch-in found for today');
  }

  if (existingAttendance.recordset[0].check_out) {
    throw httpError(400, 'Already punched out today');
  }

  await query(
    `
      UPDATE dbo.Attendance
      SET check_out = @checkOut
      WHERE attendance_id = @attendanceId
    `,
    { checkOut: now, attendanceId: existingAttendance.recordset[0].attendance_id }
  );

  const title = 'Check-Out Successful';
  const body = `You punched out today successfully at ${now}.`;

  try {
    await notifyEmployee(employeeId, { title, body, data: { type: 'attendance.punch_out', time: now } });
  } catch (err) {
    logger.error({ err, employeeId }, 'Failed to send punch-out notification');
  }

  res.json({ status: 'success', check_out: now });
});

module.exports = router;
