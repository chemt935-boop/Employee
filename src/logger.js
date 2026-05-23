const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.DB_PASSWORD',
      'DB_PASSWORD',
      '*.token',
      'token'
    ],
    remove: true
  }
});

module.exports = { logger };
