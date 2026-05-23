const express = require('express');
const { auth } = require('../middleware/auth');

const authRoutes = require('./auth');
const employees = require('./employees');
const departments = require('./departments');
const attendance = require('./attendance');
const dashboard = require('./dashboard');
const payroll = require('./payroll');
const bonusDeductions = require('./bonusDeductions');
const vacationRequests = require('./vacationRequests');
const permissions = require('./permissions');
const shifts = require('./shifts');
const deviceTokens = require('./deviceTokens');
const notifications = require('./notifications');

const router = express.Router();

router.use('/auth', authRoutes);

router.use(auth());

router.use('/employees', employees);
router.use('/departments', departments);
router.use('/attendance', attendance);
router.use('/dashboard', dashboard);
router.use('/payroll', payroll);
router.use('/bonus-deductions', bonusDeductions);
router.use('/vacation-requests', vacationRequests);
router.use('/permissions', permissions);
router.use('/shifts', shifts);
router.use('/device-tokens', deviceTokens);
router.use('/notifications', notifications);

module.exports = router;
