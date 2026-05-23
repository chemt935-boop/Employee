const { logger } = require('../logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const payload = {};

  if (status === 500) {
    payload.error = isProd ? 'Internal server error' : err.message || 'Internal server error';
  } else {
    payload.error = err.message;
  }

  if (!isProd && err.code) {
    payload.code = err.code;
  }

  logger.error({ err, status }, 'request error');
  res.status(status).json(payload);
  return;
}

module.exports = { notFound, errorHandler };
