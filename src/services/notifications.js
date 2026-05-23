const fs = require('fs');
const admin = require('firebase-admin');
const config = require('../config');
const { query } = require('../db/sql');
const { logger } = require('../logger');

let initAttempted = false;
let initError = null;

function initFirebase() {
  if (initAttempted) return;
  initAttempted = true;

  const raw = config.firebase.serviceAccountJsonPath;

  logger.info(
    { firebasePath: raw || 'NOT_SET' },
    'Initializing Firebase'
  );

  if (!raw) {
    initError = new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    logger.error({ err: initError }, 'Firebase config missing');
    return;
  }

  try {
    const text = raw.trim().startsWith('{')
      ? raw
      : fs.readFileSync(raw, 'utf8');

    const serviceAccount = JSON.parse(text);

    logger.info(
      {
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email
      },
      'Firebase config loaded'
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    logger.info('Firebase initialized successfully');

  } catch (err) {
    initError = err;
    logger.error({ err }, 'firebase init failed');
  }
}

function ensureFirebaseReady({ required }) {
  initFirebase();

  logger.info(
    {
      appsCount: admin.apps.length
    },
    'Checking Firebase readiness'
  );

  if (admin.apps.length > 0) return true;

  if (required) {
    throw initError || new Error('Firebase is not ready');
  }

  return false;
}

function normalizeData(data) {
  if (!data || typeof data !== 'object') return {};

  const out = {};

  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;

    if (typeof v === 'string')
      out[k] = v;
    else if (
      typeof v === 'number' ||
      typeof v === 'boolean'
    )
      out[k] = String(v);
    else
      out[k] = JSON.stringify(v);
  }

  return out;
}

async function sendToTokens(tokens, { title, body }, data, { required }) {
  logger.info(
    {
      totalTokens: tokens?.length || 0,
      title,
      body
    },
    'Starting notification send'
  );

  if (!Array.isArray(tokens) || tokens.length === 0) {
    logger.warn('No tokens found');
    return {
      tokens: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  if (!ensureFirebaseReady({ required })) {
    logger.error('Firebase not ready');

    return {
      tokens: tokens.length,
      successCount: 0,
      failureCount: 0,
      skipped: true,
      reason: 'firebase_not_ready'
    };
  }

  const messaging = admin.messaging();
  const normalized = normalizeData(data);

  logger.info(
    {
      normalizedData: normalized
    },
    'Notification payload'
  );

  let successCount = 0;
  let failureCount = 0;

  const chunkSize = 500;

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const batch = tokens.slice(i, i + chunkSize);

    logger.info(
      {
        batchSize: batch.length,
        tokens: batch.map(t =>
          t.substring(0, 25) + '...'
        )
      },
      'Sending FCM batch'
    );

    try {
      const resp = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title,
          body
        },
        data: normalized
      });

      successCount += resp.successCount;
      failureCount += resp.failureCount;

      logger.info(
        {
          successCount: resp.successCount,
          failureCount: resp.failureCount
        },
        'FCM response summary'
      );

      resp.responses.forEach((r, index) => {
        if (r.success) {
          logger.info(
            {
              token: batch[index].substring(0, 25) + '...'
            },
            'FCM sent successfully'
          );
        } else {
          logger.error(
            {
              token: batch[index].substring(0, 25) + '...',
              code: r.error?.code,
              message: r.error?.message,
              stack: r.error?.stack
            },
            'FCM send failed'
          );
        }
      });

    } catch (err) {
      logger.error(
        { err },
        'Multicast send crashed'
      );

      throw err;
    }
  }

  logger.info(
    {
      totalTokens: tokens.length,
      successCount,
      failureCount
    },
    'Notification sending finished'
  );

  return {
    tokens: tokens.length,
    successCount,
    failureCount
  };
}

async function getActiveTokensForUser(userId) {
  logger.info({ userId }, 'Loading user tokens');

  const result = await query(
    `
      SELECT DISTINCT dt.Token
      FROM dbo.DeviceTokens dt
      WHERE dt.UserId = @userId
      AND dt.IsActive = 1
    `,
    { userId }
  );

  logger.info(
    {
      userId,
      tokenCount: result.recordset.length
    },
    'User tokens loaded'
  );

  return result.recordset.map(r => r.Token);
}

async function getAllActiveTokens() {
  logger.info('Loading all active tokens');

  const result = await query(
    `
      SELECT DISTINCT dt.Token
      FROM dbo.DeviceTokens dt
      WHERE dt.IsActive = 1
    `
  );

  logger.info(
    {
      tokenCount: result.recordset.length
    },
    'All active tokens loaded'
  );

  return result.recordset.map(r => r.Token);
}

async function notifyEmployee(employeeId, payload, opts = {}) {
  try {
    logger.info(
      { employeeId },
      'Sending employee notification'
    );

    const tokens = await getActiveTokensForUser(employeeId);

    return await sendToTokens(
      tokens,
      payload,
      payload.data || {},
      { required: opts.required === true }
    );

  } catch (err) {
    logger.error(
      { err, employeeId },
      'notify employee failed'
    );

    if (opts.required) throw err;

    return {
      tokens: 0,
      successCount: 0,
      failureCount: 0,
      skipped: true,
      reason: 'error'
    };
  }
}

async function notifyAll(payload, opts = {}) {
  try {
    logger.info(
      'Sending notification to all users'
    );

    const tokens = await getAllActiveTokens();

    return await sendToTokens(
      tokens,
      payload,
      payload.data || {},
      { required: opts.required === true }
    );

  } catch (err) {
    logger.error(
      { err },
      'notify all failed'
    );

    if (opts.required) throw err;

    return {
      tokens: 0,
      successCount: 0,
      failureCount: 0,
      skipped: true,
      reason: 'error'
    };
  }
}

module.exports = {
  notifyEmployee,
  notifyAll
};