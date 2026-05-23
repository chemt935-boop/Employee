const express = require('express');
const Joi = require('joi');
const { httpError, requireRole } = require('../middleware/auth');
const { notifyAll, notifyEmployee } = require('../services/notifications');

const router = express.Router();

router.post('/send', requireRole(['HR', 'CEO', 'FactoryManager']), async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().min(1).max(100).required(),
    body: Joi.string().min(1).max(500).required(),
    type: Joi.string().min(1).max(80).allow('', null).optional(),
    data: Joi.object().unknown(true).allow(null).optional(),
    employee_id: Joi.number().integer().allow(null).optional(),
    all: Joi.boolean().truthy('true').falsy('false').optional()
  }).custom((value, helpers) => {
    const wantsAll = value.all === true;
    const hasEmployee = Number.isInteger(value.employee_id);
    if (wantsAll === hasEmployee) return helpers.error('any.invalid');
    return value;
  }, 'target validation');

  const { value, error } = schema.validate(req.body, { abortEarly: false, convert: true });
  if (error) throw httpError(400, 'Provide either { all: true } OR { employee_id: <int> }');

  const payload = {
    title: value.title,
    body: value.body,
    data: { ...(value.data || {}), type: (value.type || 'admin.message').trim() }
  };

  try {
    const result =
      value.all === true
        ? await notifyAll(payload, { required: true })
        : await notifyEmployee(value.employee_id, payload, { required: true });

    res.json({
      target: value.all === true ? 'all' : 'employee',
      employee_id: value.all === true ? null : value.employee_id,
      ...result
    });
  } catch (err) {
    throw httpError(503, 'Notifications are not configured on the server');
  }
});

module.exports = router;

